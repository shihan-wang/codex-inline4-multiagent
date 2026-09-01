"""Classify coincident GLB vertices as attribute seams or true redundancy.

This is an audit-only probe.  It never mutates or repairs the exported geometry.
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "evaluation" / "geometry" / "python-deps"))

import numpy as np  # noqa: E402
import trimesh  # noqa: E402


GLB = ROOT / "artifacts" / "external-eval" / "geometry" / "export" / "semantic-engine.glb"
MANIFEST = ROOT / "artifacts" / "external-eval" / "geometry" / "export" / "semantic-engine.manifest.json"
OUTPUT = Path(__file__).resolve().parent / "duplicate-seam-analysis.json"
POSITION_TOLERANCE = 1.0e-7
ATTRIBUTE_DECIMALS = 6


def rounded_tuple(values: np.ndarray | None, index: int) -> tuple[float, ...]:
    if values is None or index >= len(values):
        return ()
    return tuple(np.round(values[index], ATTRIBUTE_DECIMALS).tolist())


def classify_mesh(mesh: trimesh.Trimesh) -> dict:
    vertices = np.asarray(mesh.vertices)
    normals = np.asarray(mesh.vertex_normals) if len(mesh.vertex_normals) == len(vertices) else None
    uv_value = getattr(mesh.visual, "uv", None)
    uvs = np.asarray(uv_value) if uv_value is not None and len(uv_value) == len(vertices) else None

    quantized = np.rint(vertices / POSITION_TOLERANCE).astype(np.int64)
    groups: dict[tuple[int, int, int], list[int]] = {}
    for index, key in enumerate(map(tuple, quantized)):
        groups.setdefault(key, []).append(index)

    duplicate_vertices = 0
    attribute_required_duplicates = 0
    exact_attribute_redundancy = 0
    seam_group_counts = Counter()
    duplicate_group_count = 0
    largest_group = 1

    for indices in groups.values():
        if len(indices) < 2:
            continue
        duplicate_group_count += 1
        largest_group = max(largest_group, len(indices))
        duplicate_vertices += len(indices) - 1
        normal_values = {rounded_tuple(normals, index) for index in indices}
        uv_values = {rounded_tuple(uvs, index) for index in indices}
        combinations = {
            (rounded_tuple(normals, index), rounded_tuple(uvs, index))
            for index in indices
        }
        attribute_required_duplicates += len(combinations) - 1
        exact_attribute_redundancy += len(indices) - len(combinations)
        if len(normal_values) > 1 and len(uv_values) > 1:
            seam_group_counts["normal-and-uv"] += 1
        elif len(normal_values) > 1:
            seam_group_counts["normal-only"] += 1
        elif len(uv_values) > 1:
            seam_group_counts["uv-only"] += 1
        else:
            seam_group_counts["no-observed-attribute-difference"] += 1

    return {
        "rawVertices": int(len(vertices)),
        "uniquePositions": int(len(groups)),
        "duplicateVertices": int(duplicate_vertices),
        "duplicateGroupCount": int(duplicate_group_count),
        "largestCoincidentGroup": int(largest_group),
        "attributeRequiredDuplicates": int(attribute_required_duplicates),
        "exactAttributeRedundancy": int(exact_attribute_redundancy),
        "seamGroupCounts": dict(seam_group_counts),
        "hasUv": uvs is not None,
        "hasNormals": normals is not None,
    }


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    records = {record["semanticName"]: record for record in manifest["records"]}
    scene = trimesh.load(GLB, force="scene", process=False, maintain_order=True)
    nodes = []
    totals = Counter()
    seam_totals = Counter()

    for semantic_name in sorted(scene.graph.nodes_geometry):
        transform, geometry_name = scene.graph[semantic_name]
        mesh = scene.geometry[geometry_name]
        if not isinstance(mesh, trimesh.Trimesh):
            continue
        result = classify_mesh(mesh)
        record = records[semantic_name]
        result.update({
            "semanticName": semantic_name,
            "originalPartId": record["originalPartId"],
            "category": record["category"],
            "geometryHash": record["geometryHash"],
            "sourcePath": record["sourcePath"],
        })
        nodes.append(result)
        for key in (
            "rawVertices",
            "uniquePositions",
            "duplicateVertices",
            "duplicateGroupCount",
            "attributeRequiredDuplicates",
            "exactAttributeRedundancy",
        ):
            totals[key] += result[key]
        seam_totals.update(result["seamGroupCounts"])

    duplicate_count = totals["duplicateVertices"]
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "targetCommit": manifest["targetCommit"],
        "tool": f"Trimesh {trimesh.__version__} plus NumPy attribute probe",
        "method": {
            "positionTolerance": POSITION_TOLERANCE,
            "attributeDecimals": ATTRIBUTE_DECIMALS,
            "meaning": "For each coincident-position group, distinct (normal, UV) tuples are retained as attribute seams; repeated identical tuples are counted as true indexable redundancy.",
            "materialBoundaryNote": "The GLB exporter emits each material primitive as a separate semantic node, so this within-node count excludes cross-material duplicates.",
        },
        "summary": {
            **dict(totals),
            "attributeRequiredShareOfDuplicates": (
                totals["attributeRequiredDuplicates"] / duplicate_count if duplicate_count else 0
            ),
            "exactRedundancyShareOfDuplicates": (
                totals["exactAttributeRedundancy"] / duplicate_count if duplicate_count else 0
            ),
            "seamGroupCounts": dict(seam_totals),
        },
        "nodes": nodes,
    }
    OUTPUT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
