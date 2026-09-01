"""Audit the semantic-node coverage of the frozen 48-point crankshaft sampler."""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT / "evaluation" / "geometry" / "python-deps"))

import numpy as np  # noqa: E402
import trimesh  # noqa: E402


GLB = ROOT / "artifacts" / "external-eval" / "geometry" / "export" / "semantic-engine.glb"
MANIFEST = ROOT / "artifacts" / "external-eval" / "geometry" / "export" / "semantic-engine.manifest.json"
OUTPUT = Path(__file__).resolve().parent / "sampling-coverage.json"


def deterministic_indices(vertices: np.ndarray, count: int = 48) -> tuple[np.ndarray, list[int]]:
    unique = np.unique(np.round(vertices, decimals=10), axis=0)
    if len(unique) <= count:
        return unique, list(range(len(unique)))
    selected: list[int] = []
    for axis in range(3):
        selected.extend([int(np.argmin(unique[:, axis])), int(np.argmax(unique[:, axis]))])
    selected = list(dict.fromkeys(selected))
    minimum_squared = np.full(len(unique), np.inf)
    while len(selected) < count:
        latest = unique[selected[-1]]
        minimum_squared = np.minimum(minimum_squared, np.sum((unique - latest) ** 2, axis=1))
        minimum_squared[selected] = -1.0
        selected.append(int(np.argmax(minimum_squared)))
    return unique, selected


def classify_source(source: str) -> str:
    if "/Group[10]" in source or "/Group[11]" in source or "/Group[12]" in source or "/Group[13]" in source:
        if source.endswith("Mesh[0]"):
            return "crankpin"
        return "counterweight-web"
    if "/Group[18]" in source:
        return "timing-crank-sprocket"
    if "/Mesh[" in source:
        leaf = int(source.rsplit("Mesh[", 1)[1].split("]", 1)[0])
        if leaf <= 9:
            return "main-journal-or-cheek"
        if leaf == 14:
            return "nose"
        if leaf == 15:
            return "damper"
        if leaf == 17:
            return "accessory-crank-pulley"
    return "other"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    records = {
        record["semanticName"]: record
        for record in manifest["records"]
        if record["primitiveKind"] == "triangles"
    }
    scene = trimesh.load(GLB, force="scene", process=False, maintain_order=True)
    node_vertices: dict[str, np.ndarray] = {}
    all_vertices = []
    for node_name in scene.graph.nodes_geometry:
        record = records.get(node_name)
        if record is None or record["originalPartId"] != "crankshaft":
            continue
        transform, geometry_name = scene.graph[node_name]
        mesh = scene.geometry[geometry_name].copy()
        mesh.apply_transform(transform)
        vertices = np.unique(np.round(np.asarray(mesh.vertices), decimals=10), axis=0)
        node_vertices[node_name] = vertices
        all_vertices.append(vertices)

    unique_vertices, selected_indices = deterministic_indices(np.vstack(all_vertices), 48)
    selected_points = unique_vertices[selected_indices]
    node_hits: dict[str, list[int]] = defaultdict(list)
    ambiguous_samples = []
    for sample_index, point in enumerate(selected_points):
        matches = []
        for node_name, vertices in node_vertices.items():
            if np.any(np.all(np.isclose(vertices, point, atol=1.0e-9, rtol=0), axis=1)):
                matches.append(node_name)
                node_hits[node_name].append(sample_index)
        if len(matches) != 1:
            ambiguous_samples.append({"sampleIndex": sample_index, "matchingNodes": matches})

    nodes = []
    roles: dict[str, dict[str, int]] = defaultdict(lambda: {"nodes": 0, "coveredNodes": 0, "sampleAssignments": 0})
    for node_name in sorted(node_vertices):
        record = records[node_name]
        role = classify_source(record["sourcePath"])
        hits = sorted(set(node_hits.get(node_name, [])))
        nodes.append({
            "semanticName": node_name,
            "sourcePath": record["sourcePath"],
            "role": role,
            "uniqueVertexCount": len(node_vertices[node_name]),
            "sampleIndices": hits,
            "covered": bool(hits),
        })
        roles[role]["nodes"] += 1
        roles[role]["coveredNodes"] += int(bool(hits))
        roles[role]["sampleAssignments"] += len(hits)

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "targetCommit": manifest["targetCommit"],
        "method": "Exact replay of frozen deterministic_surface_samples coordinate selection, then exact coordinate attribution to semantic crankshaft nodes.",
        "summary": {
            "semanticCrankshaftNodes": len(nodes),
            "coveredSemanticNodes": sum(node["covered"] for node in nodes),
            "uncoveredSemanticNodes": sum(not node["covered"] for node in nodes),
            "selectedSamples": len(selected_points),
            "ambiguousSamples": len(ambiguous_samples),
            "roleCoverage": dict(roles),
        },
        "ambiguousSamples": ambiguous_samples,
        "nodes": nodes,
    }
    OUTPUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output["summary"], indent=2))


if __name__ == "__main__":
    main()
