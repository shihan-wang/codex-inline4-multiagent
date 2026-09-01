"""V4 semantic-node topology and surface-intersection evaluator.

Dry-run mode is ordinary CPython and validates the frozen input contract.  Full
mode runs inside Blender so every registered semantic node is checked with
BVHTree triangle overlap; it never turns sparse point/containment distances into
physical penetration claims.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 1
TOOL_VERSION = "1.0.0"
RANGE_721 = {"startDegrees": 0, "endDegrees": 720, "stepDegrees": 1, "samples": 721}
TOPOLOGY_METRICS = (
    "windingErrorEdges",
    "watertightNodes",
    "degenerateTriangles",
    "duplicateFaces",
)


class InputError(RuntimeError):
    """Raised before Blender work when the pre-registered contract is invalid."""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise InputError(f"Cannot read JSON input {path}: {error}") from error


def resolve_reference(input_path: Path, value: str) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = input_path.parent / path
    return path.resolve()


def selector_matches(record: dict[str, Any], selector: dict[str, str]) -> bool:
    exact_fields = (
        "semanticName",
        "originalPartId",
        "category",
        "primitiveKind",
        "closureExpectation",
    )
    for field in exact_fields:
        if field in selector and record.get(field) != selector[field]:
            return False
    if "sourcePathContains" in selector and selector["sourcePathContains"] not in record.get("sourcePath", ""):
        return False
    for field in ("semanticName", "originalPartId", "sourcePath"):
        regex_key = f"{field}Regex"
        if regex_key in selector and re.search(selector[regex_key], str(record.get(field, ""))) is None:
            return False
    known = set(exact_fields) | {
        "sourcePathContains",
        "semanticNameRegex",
        "originalPartIdRegex",
        "sourcePathRegex",
    }
    unknown = set(selector) - known
    if unknown:
        raise InputError(f"Unknown role selector keys: {sorted(unknown)}")
    return True


def resolve_roles(
    records: list[dict[str, Any]], role_rules: dict[str, list[dict[str, str]]]
) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for role, selectors in role_rules.items():
        if not selectors:
            raise InputError(f"Role {role!r} has no selectors")
        matches = [
            record
            for record in records
            if record.get("primitiveKind") == "triangles"
            and any(selector_matches(record, selector) for selector in selectors)
        ]
        result[role] = sorted(matches, key=lambda item: item["semanticName"])
    return result


def exact_allowed_contact(
    whitelist: dict[str, Any], contact: dict[str, str] | None
) -> dict[str, Any]:
    if contact is None:
        return {"excluded": False, "registration": None}
    requested = (contact.get("a"), contact.get("b"))
    if None in requested:
        raise InputError("allowedContact requires exact a and b strings")
    for entry in whitelist.get("allowedContacts", []):
        pair = (entry.get("a"), entry.get("b"))
        if requested == pair or requested == pair[::-1]:
            return {"excluded": True, "registration": entry}
    raise InputError(f"Pair requests an unregistered allowed contact: {requested}")


def load_bundle(input_path: Path) -> dict[str, Any]:
    specification = read_json(input_path)
    if specification.get("schemaVersion") != SCHEMA_VERSION:
        raise InputError(f"Expected input schemaVersion {SCHEMA_VERSION}")

    required_references = ("glb", "manifest", "snapshots", "whitelist")
    paths: dict[str, Path] = {}
    for key in required_references:
        if not isinstance(specification.get(key), str):
            raise InputError(f"Missing path field {key!r}")
        paths[key] = resolve_reference(input_path, specification[key])
        if not paths[key].is_file():
            raise InputError(f"Input {key!r} does not exist: {paths[key]}")
    for key in ("topologyBaseline", "proxyEvidence"):
        if specification.get(key):
            paths[key] = resolve_reference(input_path, specification[key])
            if not paths[key].is_file():
                raise InputError(f"Optional input {key!r} does not exist: {paths[key]}")

    manifest = read_json(paths["manifest"])
    snapshots = read_json(paths["snapshots"])
    whitelist = read_json(paths["whitelist"])
    hashes = {key: sha256(path) for key, path in paths.items()}
    hashes["inputSpecification"] = sha256(input_path)

    if manifest.get("glb", {}).get("sha256", "").lower() != hashes["glb"]:
        raise InputError("Semantic GLB hash does not match its manifest")
    if snapshots.get("range") != RANGE_721 or len(snapshots.get("samples", [])) != 721:
        raise InputError("Snapshots must be the exact inclusive 0..720 degree, 1-degree, 721-sample registry")
    angles = [sample.get("globalDegrees") for sample in snapshots["samples"]]
    if angles != list(range(721)):
        raise InputError("Snapshot globalDegrees are not the ordered inclusive sequence 0..720")
    if manifest.get("targetCommit") != snapshots.get("targetCommit"):
        raise InputError("Manifest and snapshots target different commits")
    if whitelist.get("frozenWithProtocol") is not True:
        raise InputError("Collision whitelist is not marked frozenWithProtocol")
    expected_whitelist_hash = str(specification.get("expectedWhitelistSha256", "")).lower()
    if not expected_whitelist_hash or hashes["whitelist"] != expected_whitelist_hash:
        raise InputError("Frozen collision whitelist hash differs from the pre-registered hash")

    records = manifest.get("records")
    role_rules = specification.get("roleRules")
    if not isinstance(records, list) or not isinstance(role_rules, dict):
        raise InputError("Manifest records and input roleRules are required")
    roles = resolve_roles(records, role_rules)
    coverage_checks = []
    for role, expected in specification.get("requiredCoverage", {}).items():
        actual = len(roles.get(role, []))
        coverage_checks.append({
            "role": role,
            "expectedNodes": int(expected),
            "manifestNodes": actual,
            "pass": actual == int(expected),
            "semanticNames": [item["semanticName"] for item in roles.get(role, [])],
        })
    if not coverage_checks:
        raise InputError("requiredCoverage must pre-register at least one role")

    pair_registry = specification.get("surfaceIntersectionPairs")
    if not isinstance(pair_registry, list) or not pair_registry:
        raise InputError("surfaceIntersectionPairs must pre-register at least one pair")
    pair_ids: set[str] = set()
    for pair in pair_registry:
        pair_id = pair.get("id")
        if not pair_id or pair_id in pair_ids:
            raise InputError(f"Surface pair id is absent or repeated: {pair_id!r}")
        pair_ids.add(pair_id)
        for key in ("movingRole", "targetRole", "motion"):
            if not pair.get(key):
                raise InputError(f"Surface pair {pair_id!r} is missing {key!r}")
        if pair["movingRole"] not in roles or pair["targetRole"] not in roles:
            raise InputError(f"Surface pair {pair_id!r} refers to an unknown role")
        pair["whitelistDecision"] = exact_allowed_contact(whitelist, pair.get("allowedContact"))

    return {
        "inputPath": input_path,
        "specification": specification,
        "paths": paths,
        "hashes": hashes,
        "manifest": manifest,
        "snapshots": snapshots,
        "whitelist": whitelist,
        "roles": roles,
        "coverageChecks": coverage_checks,
        "pairRegistry": pair_registry,
    }


def base_report(bundle: dict[str, Any], mode: str) -> dict[str, Any]:
    paths = bundle["paths"]
    proxy = {
        "status": "not-computed-by-v4-checker",
        "meaning": "Any sparse witness, containment, nearest-shell, or radial-excess value is a proxy and is not a physical penetration depth.",
        "separateFromSurfaceIntersection": True,
        "source": None,
    }
    if "proxyEvidence" in paths:
        proxy["source"] = {
            "path": str(paths["proxyEvidence"]),
            "sha256": bundle["hashes"]["proxyEvidence"],
            "importedAsCollisionTruth": False,
        }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "tool": {"name": "V4 semantic surface checker", "version": TOOL_VERSION},
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "targetCommit": bundle["manifest"].get("targetCommit"),
        "inputHashes": bundle["hashes"],
        "frozenWhitelist": {
            "path": str(paths["whitelist"]),
            "sha256": bundle["hashes"]["whitelist"],
            "frozenWithProtocol": True,
            "runtimeExtensionsAccepted": False,
            "allowedContactCount": len(bundle["whitelist"].get("allowedContacts", [])),
        },
        "range": RANGE_721,
        "roleCoverage": bundle["coverageChecks"],
        "proxy": proxy,
        "surfaceIntersection": {
            "status": "not-run" if mode == "dry-run" else "pending",
            "method": "Blender BVHTree.overlap on complete exported triangles, per semantic node",
            "proxyDepthComputed": False,
            "pairs": [],
        },
        "topology": {"status": "not-run" if mode == "dry-run" else "pending"},
    }


def parse_cylinder(part_id: str, prefix: str) -> int:
    match = re.fullmatch(rf"{re.escape(prefix)}-([1-4])", part_id)
    if match is None:
        raise InputError(f"Motion {prefix!r} cannot determine cylinder from {part_id!r}")
    return int(match.group(1))


def angle_ranges(angles: list[int]) -> list[list[int]]:
    if not angles:
        return []
    result: list[list[int]] = []
    start = previous = angles[0]
    for angle in angles[1:]:
        if angle != previous + 1:
            result.append([start, previous])
            start = angle
        previous = angle
    result.append([start, previous])
    return result


def inspect_topology(vertices: list[Any], faces: list[tuple[int, int, int]], tolerance: float = 1.0e-7) -> dict[str, Any]:
    canonical: dict[tuple[int, int, int], int] = {}
    welded: list[tuple[float, float, float]] = []
    inverse: list[int] = []
    for vertex in vertices:
        coordinate = (float(vertex[0]), float(vertex[1]), float(vertex[2]))
        key = tuple(int(round(value / tolerance)) for value in coordinate)
        if key not in canonical:
            canonical[key] = len(welded)
            welded.append(coordinate)
        inverse.append(canonical[key])
    welded_faces = [tuple(inverse[index] for index in face) for face in faces]
    duplicate_faces = len(welded_faces) - len({tuple(sorted(face)) for face in welded_faces})
    edges: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    degenerate = 0
    signed_volume = 0.0
    for face in welded_faces:
        a, b, c = (welded[index] for index in face)
        ab = (b[0] - a[0], b[1] - a[1], b[2] - a[2])
        ac = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        cross = (
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
        )
        if len(set(face)) < 3 or math.sqrt(sum(value * value for value in cross)) <= 1.0e-14:
            degenerate += 1
        signed_volume += (
            a[0] * (b[1] * c[2] - b[2] * c[1])
            + a[1] * (b[2] * c[0] - b[0] * c[2])
            + a[2] * (b[0] * c[1] - b[1] * c[0])
        ) / 6.0
        for start, end in ((face[0], face[1]), (face[1], face[2]), (face[2], face[0])):
            edges[(min(start, end), max(start, end))].append((start, end))
    boundary_edges = sum(len(uses) == 1 for uses in edges.values())
    nonmanifold_edges = sum(len(uses) > 2 for uses in edges.values())
    winding_errors = sum(
        len(uses) == 2 and uses[0] == uses[1]
        for uses in edges.values()
    )
    return {
        "rawVertices": len(vertices),
        "weldedVertices": len(welded),
        "faces": len(faces),
        "boundaryEdges": boundary_edges,
        "nonManifoldEdges": nonmanifold_edges,
        "windingErrorEdges": winding_errors,
        "degenerateTriangles": degenerate,
        "duplicateFaces": duplicate_faces,
        "watertight": boundary_edges == 0 and nonmanifold_edges == 0,
        "signedVolume": signed_volume,
    }


def aggregate_topology(nodes: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "nodeCount": len(nodes),
        "windingErrorEdges": sum(int(item.get("windingErrorEdges", 0)) for item in nodes),
        "watertightNodes": sum(bool(item.get("watertight")) for item in nodes),
        "degenerateTriangles": sum(int(item.get("degenerateTriangles", 0)) for item in nodes),
        "duplicateFaces": sum(int(item.get("duplicateFaces", 0)) for item in nodes),
    }


def run_full(bundle: dict[str, Any], report: dict[str, Any]) -> None:
    try:
        import bpy  # type: ignore
        from mathutils import Matrix, Vector  # type: ignore
        from mathutils.bvhtree import BVHTree  # type: ignore
    except ImportError as error:
        raise InputError("Full mode must run through Blender; use --dry-run with ordinary Python") from error

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(bundle["paths"]["glb"]))
    records = {
        item["semanticName"]: item
        for item in bundle["manifest"]["records"]
        if item.get("primitiveKind") == "triangles"
    }
    objects = {
        obj.name: obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name in records
    }

    geometry_cache: dict[str, tuple[list[Any], list[tuple[int, int, int]]]] = {}
    for name, obj in objects.items():
        obj.data.calc_loop_triangles()
        vertices = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
        faces = [tuple(item.vertices) for item in obj.data.loop_triangles]
        geometry_cache[name] = (vertices, faces)

    loaded_checks = []
    role_name_sets: dict[str, set[str]] = {
        role: {item["semanticName"] for item in items}
        for role, items in bundle["roles"].items()
    }
    for check in report["roleCoverage"]:
        role = check["role"]
        expected_names = role_name_sets[role]
        loaded_names = expected_names & set(objects)
        check["loadedGlbNodes"] = len(loaded_names)
        check["missingGlbNodes"] = sorted(expected_names - loaded_names)
        check["pass"] = check["pass"] and len(loaded_names) == check["expectedNodes"]
        loaded_checks.append(check["pass"])

    initial = bundle["snapshots"]["samples"][0]
    initial_cylinders = {item["cylinder"]: item for item in initial["cylinders"]}

    def motion_matrix(kind: str, record: dict[str, Any], snapshot: dict[str, Any]) -> Any:
        if kind == "static":
            return Matrix.Identity(4)
        if kind == "crank-x":
            return Matrix.Rotation(float(snapshot["crankAngleRad"]), 4, "X")
        if kind == "piston-by-part-id":
            cylinder = parse_cylinder(record["originalPartId"], "piston")
            now = next(item for item in snapshot["cylinders"] if item["cylinder"] == cylinder)
            zero = initial_cylinders[cylinder]
            delta_y = (float(now["pistonGroupYmm"]) - float(zero["pistonGroupYmm"])) * 0.01
            return Matrix.Translation(Vector((0.0, 0.0, delta_y)))
        if kind == "rod-by-part-id":
            cylinder = parse_cylinder(record["originalPartId"], "connecting-rod")
            now = next(item for item in snapshot["cylinders"] if item["cylinder"] == cylinder)
            zero = initial_cylinders[cylinder]
            p0_glb = tuple(float(value) * 0.01 for value in zero["rodGroupPositionMm"])
            p1_glb = tuple(float(value) * 0.01 for value in now["rodGroupPositionMm"])
            p0 = Vector((p0_glb[0], -p0_glb[2], p0_glb[1]))
            p1 = Vector((p1_glb[0], -p1_glb[2], p1_glb[1]))
            return (
                Matrix.Translation(p1)
                @ Matrix.Rotation(float(now["rodRotationXrad"]), 4, "X")
                @ Matrix.Rotation(-float(zero["rodRotationXrad"]), 4, "X")
                @ Matrix.Translation(-p0)
            )
        raise InputError(f"Unknown registered motion {kind!r}")

    def make_bvh(vertices: list[Any], faces: list[tuple[int, int, int]]) -> Any:
        return BVHTree.FromPolygons(vertices, faces, all_triangles=True, epsilon=1.0e-8)

    surface_pairs = []
    for pair in bundle["pairRegistry"]:
        mover_names = [
            item["semanticName"] for item in bundle["roles"][pair["movingRole"]]
            if item["semanticName"] in objects
        ]
        target_names = [
            item["semanticName"] for item in bundle["roles"][pair["targetRole"]]
            if item["semanticName"] in objects
        ]
        targets = {
            name: (*geometry_cache[name], make_bvh(*geometry_cache[name]))
            for name in target_names
        }
        node_results = []
        for mover_name in mover_names:
            base_vertices, mover_faces = geometry_cache[mover_name]
            target_states = {
                target_name: {"angles": [], "peak": {"angleDeg": None, "overlapTrianglePairs": 0, "witness": None}}
                for target_name in target_names if target_name != mover_name
            }
            for snapshot in bundle["snapshots"]["samples"]:
                angle = int(snapshot["globalDegrees"])
                delta = motion_matrix(pair["motion"], records[mover_name], snapshot)
                moved_vertices = [delta @ vertex for vertex in base_vertices]
                mover_bvh = make_bvh(moved_vertices, mover_faces)
                for target_name, state in target_states.items():
                    target_vertices, target_faces, target_bvh = targets[target_name]
                    overlaps = mover_bvh.overlap(target_bvh)
                    if not overlaps:
                        continue
                    state["angles"].append(angle)
                    if len(overlaps) > state["peak"]["overlapTrianglePairs"]:
                        left_index, right_index = overlaps[0]
                        left_center = sum((moved_vertices[index] for index in mover_faces[left_index]), Vector()) / 3
                        right_center = sum((target_vertices[index] for index in target_faces[right_index]), Vector()) / 3
                        state["peak"] = {
                            "angleDeg": angle,
                            "overlapTrianglePairs": len(overlaps),
                            "witness": {
                                "movingTriangle": int(left_index),
                                "targetTriangle": int(right_index),
                                "movingCentroidBlenderGlbUnits": list(left_center),
                                "targetCentroidBlenderGlbUnits": list(right_center),
                            },
                        }
            target_results = []
            for target_name, state in target_states.items():
                target_results.append({
                    "targetSemanticName": target_name,
                    "checkedAngles": 721,
                    "surfaceIntersectionAngleCount": len(state["angles"]),
                    "surfaceIntersectionAngleRanges": angle_ranges(state["angles"]),
                    "peak": state["peak"],
                })
            node_results.append({
                "semanticName": mover_name,
                "roles": sorted(role for role, names in role_name_sets.items() if mover_name in names),
                "targetResults": target_results,
            })
        coverage_roles = pair.get("coverageRoles", [pair["movingRole"]])
        scan_coverage = []
        scanned = set(mover_names)
        for role in coverage_roles:
            required = role_name_sets.get(role, set())
            scan_coverage.append({
                "role": role,
                "requiredNodes": len(required),
                "scannedNodes": len(required & scanned),
                "pass": required <= scanned,
            })
        surface_pairs.append({
            "id": pair["id"],
            "movingRole": pair["movingRole"],
            "targetRole": pair["targetRole"],
            "motion": pair["motion"],
            "whitelistDecision": pair["whitelistDecision"],
            "scanCoverage": scan_coverage,
            "nodes": node_results,
        })

    report["surfaceIntersection"] = {
        "status": "completed",
        "method": "Blender BVHTree.overlap on complete exported triangles, per semantic node",
        "coordinateNote": "Blender importer maps glTF Y-up (x,y,z) to Blender (x,-z,y)",
        "proxyDepthComputed": False,
        "pairs": surface_pairs,
    }

    cam_names = [item["semanticName"] for item in bundle["roles"].get("cam-lobe", []) if item["semanticName"] in objects]
    current_nodes = []
    for name in cam_names:
        vertices, faces = geometry_cache[name]
        current_nodes.append({"semanticName": name, **inspect_topology(vertices, faces)})
    current_aggregate = aggregate_topology(current_nodes)
    topology: dict[str, Any] = {
        "status": "completed",
        "role": "cam-lobe",
        "method": "independent coordinate weld plus edge incidence on Blender-imported triangles",
        "weldToleranceGlbUnits": 1.0e-7,
        "current": current_aggregate,
        "nodes": current_nodes,
        "baselineComparison": None,
    }
    if "topologyBaseline" in bundle["paths"]:
        baseline = read_json(bundle["paths"]["topologyBaseline"])
        baseline_by_name = {item["semanticName"]: item for item in baseline.get("nodes", [])}
        baseline_nodes = [baseline_by_name[name] for name in cam_names if name in baseline_by_name]
        baseline_aggregate = aggregate_topology(baseline_nodes)
        topology["baselineComparison"] = {
            "path": str(bundle["paths"]["topologyBaseline"]),
            "sha256": bundle["hashes"]["topologyBaseline"],
            "matchedNodes": len(baseline_nodes),
            "baseline": baseline_aggregate,
            "deltaCurrentMinusBaseline": {
                key: current_aggregate[key] - baseline_aggregate[key] for key in TOPOLOGY_METRICS
            },
        }
    report["topology"] = topology
    report["runtime"] = {
        "blenderVersion": bpy.app.version_string,
        "pythonVersion": sys.version,
        "platform": platform.platform(),
    }
    report["pass"] = (
        all(loaded_checks)
        and all(
            item["pass"]
            for pair in surface_pairs
            for item in pair["scanCoverage"]
        )
        and current_aggregate["windingErrorEdges"] == 0
        and current_aggregate["watertightNodes"] == current_aggregate["nodeCount"]
        and current_aggregate["degenerateTriangles"] == 0
        and current_aggregate["duplicateFaces"] == 0
        and all(
            target["surfaceIntersectionAngleCount"] == 0 or pair["whitelistDecision"]["excluded"]
            for pair in surface_pairs
            for node in pair["nodes"]
            for target in node["targetResults"]
        )
    )


def write_report(output_path: Path, report: dict[str, Any], overwrite: bool) -> None:
    output_path = output_path.resolve()
    if output_path.exists() and not overwrite:
        raise InputError(f"Output already exists (pass --overwrite explicitly): {output_path}")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_name(output_path.name + ".tmp")
    try:
        temporary.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        os.replace(temporary, output_path)
    except BaseException:
        temporary.unlink(missing_ok=True)
        raise


def command_arguments() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return sys.argv[1:]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Pre-registered V4 input JSON")
    parser.add_argument("--output", required=True, type=Path, help="Only report path written by the evaluator")
    parser.add_argument("--dry-run", action="store_true", help="Validate hashes, roles, coverage, pairs and 721 snapshots without Blender")
    parser.add_argument("--overwrite", action="store_true", help="Explicitly replace the caller-selected output")
    args = parser.parse_args(command_arguments() if argv is None else argv)

    input_path = args.input.resolve()
    output_path = args.output.resolve()
    if input_path == output_path:
        raise InputError("Input and output paths must differ")
    bundle = load_bundle(input_path)
    if output_path in bundle["paths"].values():
        raise InputError("Output must not overwrite a registered input or evidence file")
    report = base_report(bundle, "dry-run" if args.dry_run else "full")
    if args.dry_run:
        report["pass"] = all(item["pass"] for item in report["roleCoverage"])
    else:
        run_full(bundle, report)
    write_report(output_path, report, args.overwrite)
    print(json.dumps({
        "output": str(output_path),
        "mode": report["mode"],
        "pass": report["pass"],
        "whitelistSha256": report["frozenWhitelist"]["sha256"],
    }, ensure_ascii=False))
    return 0 if report["pass"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
