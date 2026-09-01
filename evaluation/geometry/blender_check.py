from __future__ import annotations

import bmesh
import bpy
import hashlib
import json
import mathutils
import platform
import sys
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

WELD_TOLERANCE = 1.0e-7


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def duplicate_faces_from_coordinates(bm: bmesh.types.BMesh) -> int:
    canonical = []
    for face in bm.faces:
        points = sorted(
            tuple(round(component / WELD_TOLERANCE) for component in vert.co)
            for vert in face.verts
        )
        canonical.append(tuple(points))
    return len(canonical) - len(set(canonical))


def face_components(bm: bmesh.types.BMesh) -> int:
    if not bm.faces:
        return 0
    unseen = set(bm.faces)
    count = 0
    while unseen:
        count += 1
        queue = deque([unseen.pop()])
        while queue:
            face = queue.popleft()
            for edge in face.edges:
                for linked in edge.link_faces:
                    if linked in unseen:
                        unseen.remove(linked)
                        queue.append(linked)
    return count


def inspect_object(obj: bpy.types.Object) -> dict:
    original = bmesh.new()
    original.from_mesh(obj.data)
    duplicate_result = bmesh.ops.find_doubles(original, verts=list(original.verts), dist=WELD_TOLERANCE)
    duplicate_vertices = len(duplicate_result.get("targetmap", {}))
    raw_vertices = len(original.verts)
    original.free()

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=WELD_TOLERANCE)
    bm.transform(obj.matrix_world)
    bm.verts.ensure_lookup_table()
    bm.edges.ensure_lookup_table()
    bm.faces.ensure_lookup_table()

    diagonal = (obj.dimensions).length
    area_epsilon = max(1.0e-18, diagonal * diagonal * 1.0e-14)
    degenerate = sum(1 for face in bm.faces if len(face.verts) != 3 or face.calc_area() <= area_epsilon)
    boundary = sum(1 for edge in bm.edges if edge.is_boundary)
    nonmanifold = sum(1 for edge in bm.edges if not edge.is_manifold and not edge.is_boundary)
    winding_errors = sum(1 for edge in bm.edges if edge.is_manifold and not edge.is_contiguous)
    invalid_normals = sum(
        1 for face in bm.faces
        if not all(mathutils.Vector(face.normal)[index] == mathutils.Vector(face.normal)[index] for index in range(3))
        or face.normal.length <= 0
    )
    watertight = boundary == 0 and nonmanifold == 0
    signed_volume = float(bm.calc_volume(signed=True)) if watertight else 0.0
    result = {
        "rawVertices": raw_vertices,
        "weldedVertices": len(bm.verts),
        "faces": len(bm.faces),
        "connectedComponents": face_components(bm),
        "boundaryEdges": boundary,
        "nonManifoldEdges": nonmanifold,
        "duplicateVertices": duplicate_vertices,
        "duplicateVertexRatio": duplicate_vertices / raw_vertices if raw_vertices else 0.0,
        "duplicateFaces": duplicate_faces_from_coordinates(bm),
        "degenerateTriangles": degenerate,
        "windingErrorEdges": winding_errors,
        "invalidGeometricNormals": invalid_normals,
        "signedVolume": signed_volume,
        "inwardClosed": bool(watertight and signed_volume < -1.0e-12),
        "watertight": watertight,
        "boundingDiagonal": diagonal,
        "areaEpsilon": area_epsilon,
    }
    bm.free()
    return result


def main() -> int:
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    arguments = sys.argv[separator + 1:]
    if len(arguments) != 3:
        raise SystemExit("Expected: -- <glb> <manifest> <output>")
    glb_path, manifest_path, output_path = map(Path, arguments)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest_records = {
        record["semanticName"]: record
        for record in manifest["records"]
        if record["primitiveKind"] == "triangles"
    }

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(glb_path))

    results = []
    seen = set()
    for obj in sorted((item for item in bpy.context.scene.objects if item.type == "MESH"), key=lambda item: item.name):
        record = manifest_records.get(obj.name)
        if record is None:
            continue
        metrics = inspect_object(obj)
        results.append({
            "semanticName": obj.name,
            "originalPartId": record["originalPartId"],
            "category": record["category"],
            "closureExpectation": record["closureExpectation"],
            "geometryHash": record["geometryHash"],
            **metrics,
        })
        seen.add(obj.name)

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
        "tool": "Blender",
        "toolVersion": bpy.app.version_string,
        "buildHash": bpy.app.build_hash.decode("utf-8"),
        "pythonVersion": sys.version,
        "platform": platform.platform(),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "command": "blender --background --python evaluation/geometry/blender_check.py -- <glb> <manifest> <output>",
        "targetCommit": manifest["targetCommit"],
        "glbSha256": sha256(glb_path),
        "manifestGlbSha256": manifest["glb"]["sha256"],
        "glbHashMatchesManifest": sha256(glb_path) == manifest["glb"]["sha256"],
        "method": {
            "load": "bpy.ops.import_scene.gltf",
            "topology": "Blender BMesh remove_doubles plus native edge manifold/boundary/contiguous flags",
            "weldToleranceGlbUnits": WELD_TOLERANCE,
            "rawDuplicateVerticesPreserved": True,
        },
        "summary": summary,
        "nodes": results,
    }
    output_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("BLENDER_TOPOLOGY_SUMMARY=" + json.dumps(summary, separators=(",", ":")))
    return 0 if not missing and report["glbHashMatchesManifest"] else 1


raise SystemExit(main())
