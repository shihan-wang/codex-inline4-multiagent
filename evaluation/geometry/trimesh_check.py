from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent.parent
sys.path.insert(0, str(SCRIPT_DIR / "python-deps"))

import numpy as np  # noqa: E402
import trimesh  # noqa: E402

DEFAULT_GLB_PATH = PROJECT_ROOT / "artifacts/external-eval/geometry/export/semantic-engine.glb"
DEFAULT_MANIFEST_PATH = PROJECT_ROOT / "artifacts/external-eval/geometry/export/semantic-engine.manifest.json"
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "artifacts/external-eval/geometry/trimesh/results.json"
WELD_TOLERANCE = 1.0e-7


class UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, item: int) -> int:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, left: int, right: int) -> None:
        left_root = self.find(left)
        right_root = self.find(right)
        if left_root != right_root:
            self.parent[right_root] = left_root


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_vertices(vertices: np.ndarray) -> tuple[np.ndarray, np.ndarray, int]:
    quantized = np.rint(vertices / WELD_TOLERANCE).astype(np.int64)
    unique, inverse = np.unique(quantized, axis=0, return_inverse=True)
    return unique.astype(np.float64) * WELD_TOLERANCE, inverse, len(vertices) - len(unique)


def inspect_mesh(vertices: np.ndarray, faces: np.ndarray) -> dict:
    welded_vertices, inverse, duplicate_vertices = canonical_vertices(vertices)
    welded_faces = inverse[faces]
    repeated_index = np.any(
        np.stack([
            welded_faces[:, 0] == welded_faces[:, 1],
            welded_faces[:, 1] == welded_faces[:, 2],
            welded_faces[:, 2] == welded_faces[:, 0],
        ], axis=1),
        axis=1,
    )
    p0 = welded_vertices[welded_faces[:, 0]]
    p1 = welded_vertices[welded_faces[:, 1]]
    p2 = welded_vertices[welded_faces[:, 2]]
    cross = np.cross(p1 - p0, p2 - p0)
    twice_area = np.linalg.norm(cross, axis=1)
    diagonal = float(np.linalg.norm(np.ptp(welded_vertices, axis=0))) if len(welded_vertices) else 0.0
    area_epsilon = max(1.0e-18, diagonal * diagonal * 1.0e-14)
    degenerate_mask = repeated_index | (twice_area * 0.5 <= area_epsilon)

    sorted_faces = np.sort(welded_faces, axis=1)
    _, face_counts = np.unique(sorted_faces, axis=0, return_counts=True)
    duplicate_faces = int(np.sum(np.maximum(0, face_counts - 1)))

    edges: dict[tuple[int, int], list[tuple[int, int, int]]] = defaultdict(list)
    for face_index, face in enumerate(welded_faces):
        for start, end in ((int(face[0]), int(face[1])), (int(face[1]), int(face[2])), (int(face[2]), int(face[0]))):
            edges[(min(start, end), max(start, end))].append((face_index, start, end))
    boundary_edges = sum(1 for uses in edges.values() if len(uses) == 1)
    nonmanifold_edges = sum(1 for uses in edges.values() if len(uses) > 2)
    winding_error_edges = sum(
        1
        for uses in edges.values()
        if len(uses) == 2 and uses[0][1] == uses[1][1] and uses[0][2] == uses[1][2]
    )

    union = UnionFind(len(welded_faces))
    for uses in edges.values():
        if len(uses) >= 2:
            anchor = uses[0][0]
            for other in uses[1:]:
                union.union(anchor, other[0])
    components = len({union.find(index) for index in range(len(welded_faces))}) if len(welded_faces) else 0

    signed_volume = float(np.sum(np.einsum("ij,ij->i", p0, np.cross(p1, p2))) / 6.0)
    watertight = boundary_edges == 0 and nonmanifold_edges == 0
    inward_closed = bool(watertight and signed_volume < -1.0e-12)
    invalid_geometric_normals = int(np.count_nonzero(~np.isfinite(cross).all(axis=1) | (twice_area <= 0)))

    return {
        "rawVertices": int(len(vertices)),
        "weldedVertices": int(len(welded_vertices)),
        "faces": int(len(faces)),
        "connectedComponents": int(components),
        "boundaryEdges": int(boundary_edges),
        "nonManifoldEdges": int(nonmanifold_edges),
        "duplicateVertices": int(duplicate_vertices),
        "duplicateVertexRatio": float(duplicate_vertices / len(vertices)) if len(vertices) else 0.0,
        "duplicateFaces": int(duplicate_faces),
        "degenerateTriangles": int(np.count_nonzero(degenerate_mask)),
        "windingErrorEdges": int(winding_error_edges),
        "invalidGeometricNormals": invalid_geometric_normals,
        "signedVolume": signed_volume,
        "inwardClosed": inward_closed,
        "watertight": bool(watertight),
        "boundingDiagonal": diagonal,
        "areaEpsilon": area_epsilon,
    }


def main() -> int:
    if len(sys.argv) == 1:
        glb_path, manifest_path, output_path = DEFAULT_GLB_PATH, DEFAULT_MANIFEST_PATH, DEFAULT_OUTPUT_PATH
    elif len(sys.argv) == 4:
        glb_path, manifest_path, output_path = map(Path, sys.argv[1:])
    else:
        print("usage: python evaluation/geometry/trimesh_check.py [<glb> <manifest> <output>]", file=sys.stderr)
        return 2
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_records = {
        record["semanticName"]: record
        for record in manifest["records"]
        if record["primitiveKind"] == "triangles"
    }
    scene = trimesh.load(glb_path, force="scene", process=False, maintain_order=True)
    results = []
    seen = set()
    for node_name in sorted(scene.graph.nodes_geometry):
        transform, geometry_name = scene.graph[node_name]
        record = manifest_records.get(node_name)
        if record is None:
            continue
        source = scene.geometry[geometry_name]
        vertices = np.asarray(source.vertices, dtype=np.float64)
        faces = np.asarray(source.faces, dtype=np.int64)
        homogeneous = np.column_stack([vertices, np.ones(len(vertices))])
        world_vertices = (np.asarray(transform, dtype=np.float64) @ homogeneous.T).T[:, :3]
        metrics = inspect_mesh(world_vertices, faces)
        results.append({
            "semanticName": node_name,
            "originalPartId": record["originalPartId"],
            "category": record["category"],
            "closureExpectation": record["closureExpectation"],
            "geometryHash": record["geometryHash"],
            **metrics,
        })
        seen.add(node_name)

    missing = sorted(set(manifest_records) - seen)
    closed = [item for item in results if item["closureExpectation"] == "closed"]
    summary = {
        "triangleNodesExpected": len(manifest_records),
        "triangleNodesInspected": len(results),
        "missingSemanticNodes": missing,
        "closedNodes": len(closed),
        "closedWatertightNodes": sum(1 for item in closed if item["watertight"]),
        "closedWatertightPercent": 100.0 * sum(1 for item in closed if item["watertight"]) / len(closed) if closed else 100.0,
        "closedTriangles": sum(item["faces"] for item in closed),
        "closedWatertightTriangles": sum(item["faces"] for item in closed if item["watertight"]),
        "closedTriangleWeightedWatertightPercent": (
            100.0 * sum(item["faces"] for item in closed if item["watertight"])
            / sum(item["faces"] for item in closed)
        ) if closed and sum(item["faces"] for item in closed) else 100.0,
        "totalDegenerateTriangles": sum(item["degenerateTriangles"] for item in results),
        "totalDuplicateFaces": sum(item["duplicateFaces"] for item in results),
        "totalDuplicateVertices": sum(item["duplicateVertices"] for item in results),
        "totalRawVertices": sum(item["rawVertices"] for item in results),
        "duplicateVertexRatio": (
            sum(item["duplicateVertices"] for item in results)
            / sum(item["rawVertices"] for item in results)
        ) if results and sum(item["rawVertices"] for item in results) else 0.0,
        "totalWindingErrorEdges": sum(item["windingErrorEdges"] for item in results),
        "totalInvalidGeometricNormals": sum(item["invalidGeometricNormals"] for item in results),
        "inwardClosedNodes": sum(1 for item in closed if item["inwardClosed"]),
    }
    report = {
        "schemaVersion": 1,
        "tool": "trimesh",
        "toolVersion": trimesh.__version__,
        "numpyVersion": np.__version__,
        "pythonVersion": sys.version,
        "platform": platform.platform(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "command": "python evaluation/geometry/trimesh_check.py",
        "gitHead": os.popen("git rev-parse HEAD").read().strip(),
        "targetCommit": manifest["targetCommit"],
        "glbSha256": sha256(glb_path),
        "manifestGlbSha256": manifest["glb"]["sha256"],
        "glbHashMatchesManifest": sha256(glb_path) == manifest["glb"]["sha256"],
        "method": {
            "load": "trimesh.load(force=scene, process=False, maintain_order=True)",
            "topology": "independent welded-coordinate edge incidence and union-find",
            "weldToleranceGlbUnits": WELD_TOLERANCE,
            "rawDuplicateVerticesPreserved": True,
        },
        "summary": summary,
        "nodes": results,
    }
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    output_label = str(output_path.relative_to(PROJECT_ROOT)) if output_path.is_relative_to(PROJECT_ROOT) else str(output_path)
    print(json.dumps({"output": output_label, "summary": summary}, indent=2))
    return 0 if not missing and report["glbHashMatchesManifest"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
