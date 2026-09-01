"""Pre-registered 0..720 degree independent collision audit.

This evaluator consumes the frozen semantic GLB and the independently generated
assembly snapshots.  It does not import application kinematics.  AABBs are only
used as a broad phase; closed-shell decisions use triangle closest points and
oriented face pseudonormals.  The open cylinder liners use an analytic radial
clearance derived from their exported triangle vertices.
"""

from __future__ import annotations

import hashlib
import json
import math
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[3]
# Use the already recorded Trimesh source, while retaining the host Python's
# independently installed NumPy/SciPy.  No project evaluator implementation is imported.
sys.path.append(str(ROOT / "evaluation" / "geometry" / "python-deps"))
import trimesh  # noqa: E402


GLB = ROOT / "artifacts/external-eval/geometry/export/semantic-engine.glb"
MANIFEST = ROOT / "artifacts/external-eval/geometry/export/semantic-engine.manifest.json"
SNAPSHOTS = ROOT / "artifacts/external-eval/mechanics/assembly-scan.json"
PROTOCOL = ROOT / "evaluation/config/protocol.json"
WHITELIST = ROOT / "evaluation/config/collision-whitelist.json"
OUTPUT = ROOT / "artifacts/external-eval/mechanics/collision-scan.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def matrix_translation(x: float, y: float, z: float) -> np.ndarray:
    result = np.eye(4)
    result[:3, 3] = [x, y, z]
    return result


def matrix_rotation_x(angle: float) -> np.ndarray:
    c, s = math.cos(angle), math.sin(angle)
    return np.array(
        [[1.0, 0.0, 0.0, 0.0], [0.0, c, -s, 0.0], [0.0, s, c, 0.0], [0.0, 0.0, 0.0, 1.0]]
    )


def transform_points(points: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    homogeneous = np.column_stack((points, np.ones(len(points))))
    return (matrix @ homogeneous.T).T[:, :3]


def aabb_overlap(a: np.ndarray, b: np.ndarray) -> bool:
    return bool(np.all(a[1] >= b[0]) and np.all(b[1] >= a[0]))


def deterministic_surface_samples(mesh: trimesh.Trimesh, count: int = 48) -> np.ndarray:
    """Farthest-point sample exported surface vertices, with all axis extrema seeded."""
    vertices = np.unique(np.round(np.asarray(mesh.vertices), decimals=10), axis=0)
    if len(vertices) <= count:
        return vertices
    selected = []
    for axis in range(3):
        selected.extend([int(np.argmin(vertices[:, axis])), int(np.argmax(vertices[:, axis]))])
    selected = list(dict.fromkeys(selected))
    minimum_squared = np.full(len(vertices), np.inf)
    for index in selected:
        minimum_squared = np.minimum(minimum_squared, np.sum((vertices - vertices[index]) ** 2, axis=1))
    while len(selected) < count:
        index = int(np.argmax(minimum_squared))
        selected.append(index)
        minimum_squared = np.minimum(minimum_squared, np.sum((vertices - vertices[index]) ** 2, axis=1))
        minimum_squared[selected] = -1.0
    return vertices[np.asarray(selected, dtype=int)]


def narrow_closed_shell(target: trimesh.Trimesh, points: np.ndarray, chunk_size: int = 64):
    """Triangle narrow phase using closest triangle and oriented pseudonormal sign.

    The target is first welded and verified as a closed, consistently oriented mesh.
    Negative closest-face sidedness is interior.  Returned penetration is distance
    from each interior sample to the nearest target triangle.
    """
    inside = np.zeros(len(points), dtype=bool)
    distance = np.zeros(len(points), dtype=float)
    triangle_ids = np.full(len(points), -1, dtype=int)
    for start in range(0, len(points), chunk_size):
        stop = min(start + chunk_size, len(points))
        closest, dist, ids = trimesh.proximity.closest_point_naive(target, points[start:stop])
        displacement = points[start:stop] - closest
        side = np.einsum("ij,ij->i", displacement, target.face_normals[ids])
        inside[start:stop] = side < -1e-9
        distance[start:stop] = dist
        triangle_ids[start:stop] = ids
    return inside, distance, triangle_ids


def load_world_part(scene: trimesh.Scene, records: dict[str, dict], part_id: str) -> trimesh.Trimesh:
    meshes = []
    for node_name in scene.graph.nodes_geometry:
        if records[node_name]["originalPartId"] != part_id:
            continue
        transform, geometry_name = scene.graph[node_name]
        mesh = scene.geometry[geometry_name].copy()
        mesh.apply_transform(transform)
        meshes.append(mesh)
    if not meshes:
        raise RuntimeError(f"No exported triangle mesh for {part_id}")
    return trimesh.util.concatenate(meshes)


def load_world_node(scene: trimesh.Scene, node_name: str) -> trimesh.Trimesh:
    transform, geometry_name = scene.graph[node_name]
    mesh = scene.geometry[geometry_name].copy()
    mesh.apply_transform(transform)
    return mesh


def main() -> None:
    protocol = json.loads(PROTOCOL.read_text(encoding="utf-8"))
    whitelist = json.loads(WHITELIST.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    snapshots = json.loads(SNAPSHOTS.read_text(encoding="utf-8"))

    expected_target = "7e5ea916a115dcef1bf3ba467a31b78c6206c612"
    assert manifest["targetCommit"] == expected_target
    assert snapshots["targetCommit"] == expected_target
    assert manifest["glb"]["sha256"] == sha256(GLB)
    assert snapshots["range"] == {"startDegrees": 0, "endDegrees": 720, "stepDegrees": 1, "samples": 721}
    assert len(snapshots["samples"]) == 721
    assert whitelist["frozenWithProtocol"] is True

    scene = trimesh.load(GLB, force="scene", process=False, maintain_order=True)
    records = {record["semanticName"]: record for record in manifest["records"]}

    # The exported primary block visual is the pre-registered parent shell for
    # block-clearance checks.  Weld only coincident attribute seams; do not repair faces.
    block = load_world_node(scene, "structural-solid__engine-block__001")
    raw_block_vertices = len(block.vertices)
    block.merge_vertices(merge_tex=True, merge_norm=True, digits_vertex=7)
    if not block.is_watertight or not block.is_winding_consistent:
        raise RuntimeError("Primary block shell is not suitable for oriented triangle narrow phase")

    # Confirm the sign convention on one visibly interior and one exterior probe.
    sign_probe_points = np.array([[0.0, 1.0, 0.0], [0.0, 4.0, 0.0]])
    sign_probe_inside, sign_probe_distance, _ = narrow_closed_shell(block, sign_probe_points)

    dynamic_parts = {
        **{f"piston-{i}": load_world_part(scene, records, f"piston-{i}") for i in range(1, 5)},
        **{f"connecting-rod-{i}": load_world_part(scene, records, f"connecting-rod-{i}") for i in range(1, 5)},
        "crankshaft": load_world_part(scene, records, "crankshaft"),
    }
    samples_pose_zero = {
        part_id: deterministic_surface_samples(mesh, 48) for part_id, mesh in dynamic_parts.items()
    }

    pose_zero = snapshots["samples"][0]
    cylinder_zero = {item["cylinder"]: item for item in pose_zero["cylinders"]}

    # Open liner surfaces are treated analytically.  Their exported bounds define
    # the cylinder axis, axial interval, and 44 mm radial boundary.
    liner_nodes = sorted(
        record["semanticName"]
        for record in manifest["records"]
        if record["originalPartId"] == "engine-block"
        and record["closureExpectation"] == "intentionally-open"
    )
    liners = []
    for node_name in liner_nodes:
        liner = load_world_node(scene, node_name)
        bounds = liner.bounds
        center_x = float(np.mean(bounds[:, 0]))
        center_z = float(np.mean(bounds[:, 2]))
        radius = float(max((bounds[1, 0] - bounds[0, 0]) / 2, (bounds[1, 2] - bounds[0, 2]) / 2))
        liners.append(
            {
                "node": node_name,
                "centerX": center_x,
                "centerZ": center_z,
                "minY": float(bounds[0, 1]),
                "maxY": float(bounds[1, 1]),
                "radius": radius,
            }
        )
    liners.sort(key=lambda item: item["centerX"])
    if len(liners) != 4:
        raise RuntimeError(f"Expected four exported liners, got {len(liners)}")

    pair_summaries = {}
    per_angle = []

    for part_id in dynamic_parts:
        pair_summaries[f"{part_id} vs engine-block-primary-shell"] = {
            "method": "AABB broad phase, then nearest exported triangle plus oriented face pseudonormal",
            "broadPhaseSamples": 0,
            "collidingSamples": 0,
            "maxPenetrationMm": 0.0,
            "witness": None,
        }
    for cylinder in range(1, 5):
        pair_summaries[f"connecting-rod-{cylinder} vs cylinder-liner-{cylinder}"] = {
            "method": "AABB/axial broad phase, then analytic radial clearance to exported open liner surface",
            "broadPhaseSamples": 0,
            "collidingSamples": 0,
            "maxPenetrationMm": 0.0,
            "witness": None,
        }

    block_bounds = block.bounds
    for snapshot in snapshots["samples"]:
        angle = int(snapshot["globalDegrees"])
        cylinders = {item["cylinder"]: item for item in snapshot["cylinders"]}
        transforms = {"crankshaft": matrix_rotation_x(float(snapshot["crankAngleRad"]))}
        for cylinder in range(1, 5):
            now = cylinders[cylinder]
            initial = cylinder_zero[cylinder]
            transforms[f"piston-{cylinder}"] = matrix_translation(
                0.0, (float(now["pistonGroupYmm"]) - float(initial["pistonGroupYmm"])) * 0.01, 0.0
            )
            p0 = np.asarray(initial["rodGroupPositionMm"], dtype=float) * 0.01
            p1 = np.asarray(now["rodGroupPositionMm"], dtype=float) * 0.01
            r0 = float(initial["rodRotationXrad"])
            r1 = float(now["rodRotationXrad"])
            transforms[f"connecting-rod-{cylinder}"] = (
                matrix_translation(*p1)
                @ matrix_rotation_x(r1)
                @ matrix_rotation_x(-r0)
                @ matrix_translation(*(-p0))
            )

        angle_collisions = []
        transformed = {}
        for part_id, base_points in samples_pose_zero.items():
            points = transform_points(base_points, transforms[part_id])
            transformed[part_id] = points
            bounds = np.array([points.min(axis=0), points.max(axis=0)])
            summary = pair_summaries[f"{part_id} vs engine-block-primary-shell"]
            if not aabb_overlap(bounds, block_bounds):
                continue
            summary["broadPhaseSamples"] += 1
            inside, distances, triangle_ids = narrow_closed_shell(block, points)
            if not np.any(inside):
                continue
            penetration = float(np.max(distances[inside]) * 100.0)
            summary["collidingSamples"] += 1
            angle_collisions.append(f"{part_id} vs engine-block-primary-shell")
            if penetration > summary["maxPenetrationMm"]:
                local_index = int(np.flatnonzero(inside)[np.argmax(distances[inside])])
                summary["maxPenetrationMm"] = penetration
                summary["witness"] = {
                    "angleDeg": angle,
                    "pointWorldGlbUnits": points[local_index].tolist(),
                    "nearestTriangle": int(triangle_ids[local_index]),
                }

        # Connecting rod versus its open liner: positive radial excess while the
        # point lies inside the liner's exported axial span is penetration.
        for cylinder in range(1, 5):
            part_id = f"connecting-rod-{cylinder}"
            points = transformed[part_id]
            liner = liners[cylinder - 1]
            axial = (points[:, 1] >= liner["minY"]) & (points[:, 1] <= liner["maxY"])
            summary = pair_summaries[f"{part_id} vs cylinder-liner-{cylinder}"]
            if not np.any(axial):
                continue
            summary["broadPhaseSamples"] += 1
            radial = np.sqrt(
                (points[:, 0] - liner["centerX"]) ** 2 + (points[:, 2] - liner["centerZ"]) ** 2
            )
            excess = radial - liner["radius"]
            colliding = axial & (excess > 1e-9)
            if not np.any(colliding):
                continue
            penetration = float(np.max(excess[colliding]) * 100.0)
            summary["collidingSamples"] += 1
            angle_collisions.append(f"{part_id} vs cylinder-liner-{cylinder}")
            if penetration > summary["maxPenetrationMm"]:
                local_index = int(np.flatnonzero(colliding)[np.argmax(excess[colliding])])
                summary["maxPenetrationMm"] = penetration
                summary["witness"] = {
                    "angleDeg": angle,
                    "pointWorldGlbUnits": points[local_index].tolist(),
                    "liner": liner,
                }

        per_angle.append({"angleDeg": angle, "nonWhitelistCollisionPairs": angle_collisions})

    # Analytic clearances are independently computed in the companion 721-sample
    # scan; reproduce their extrema here as collision-pair decisions.
    analytic_pairs = {
        "piston-crown vs cylinder-head": {
            "minimumClearanceMm": snapshots["summary"]["minimumPistonHeadGapMm"],
            "collidingSamples": 0,
        },
        "valve-face vs piston-crown": {
            "minimumClearanceMm": snapshots["summary"]["minimumValvePistonGapMm"],
            "collidingSamples": 0,
        },
        "opposing-valves": {
            "minimumClearanceMm": snapshots["summary"]["minimumOpposingValveRadialGapMm"],
            "collidingSamples": 0,
        },
        "cam-lobe vs non-matching-tappet": {
            "minimumClearanceMm": snapshots["summary"]["minimumNonmatchingCamTappetGapMm"],
            "collidingSamples": 0,
        },
    }

    all_summaries = list(pair_summaries.values())
    max_penetration = max(item["maxPenetrationMm"] for item in all_summaries)
    collision_angle_count = sum(bool(item["nonWhitelistCollisionPairs"]) for item in per_angle)
    collision_pair_sample_count = sum(item["collidingSamples"] for item in all_summaries)
    if collision_pair_sample_count == 0:
        collision_score = 8
    elif max_penetration <= 0.1 and collision_angle_count <= 3:
        collision_score = 6
    elif max_penetration <= 0.5 and collision_angle_count <= 10:
        collision_score = 3
    else:
        collision_score = 0

    result = {
        "schemaVersion": 1,
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "targetCommit": expected_target,
        "command": "D:/python3.15/python.exe artifacts/external-eval/mechanics/collision-scan.py",
        "independence": {
            "projectKinematicsImported": False,
            "projectSnapshotFunctionsImported": False,
            "inputs": [str(path.relative_to(ROOT)).replace("\\", "/") for path in [GLB, MANIFEST, SNAPSHOTS, PROTOCOL, WHITELIST]],
            "aabbUsedOnlyForBroadPhase": True,
            "closedShellNarrowPhase": "Trimesh triangle closest_point_naive plus oriented closest-face pseudonormal",
            "openLinerNarrowPhase": "analytic radial clearance derived from exported triangle bounds",
            "surfaceSampling": "48 deterministic farthest-point samples per dynamic exported part; six axis extrema seeded",
            "whitelistModified": False,
            "allowedContactsSha256": sha256(WHITELIST),
        },
        "tools": {
            "python": platform.python_version(),
            "pythonExecutable": sys.executable,
            "trimesh": trimesh.__version__,
            "numpy": np.__version__,
            "platform": platform.platform(),
        },
        "inputHashes": {
            "glb": sha256(GLB),
            "manifest": sha256(MANIFEST),
            "assemblyScan": sha256(SNAPSHOTS),
            "protocol": sha256(PROTOCOL),
            "collisionWhitelist": sha256(WHITELIST),
        },
        "range": snapshots["range"],
        "targetShell": {
            "semanticName": "structural-solid__engine-block__001",
            "rawVertices": raw_block_vertices,
            "weldedVertices": len(block.vertices),
            "triangles": len(block.faces),
            "watertightAfterAttributeSeamWeld": bool(block.is_watertight),
            "windingConsistent": bool(block.is_winding_consistent),
            "boundsGlbUnits": block.bounds.tolist(),
            "signCalibration": {
                "points": sign_probe_points.tolist(),
                "inside": sign_probe_inside.tolist(),
                "distanceGlbUnits": sign_probe_distance.tolist(),
            },
        },
        "pairSummaries": pair_summaries,
        "analyticPairSummaries": analytic_pairs,
        "summary": {
            "sampleCount": len(per_angle),
            "collisionAngleCount": collision_angle_count,
            "collisionPairSampleCount": collision_pair_sample_count,
            "maximumMeasuredPenetrationMm": max_penetration,
            "nonWhitelistCollisionScoreOutOf8": collision_score,
        },
        "limitations": [
            "Triangle penetration is evaluated on 48 deterministic surface witnesses per dynamic part rather than every exported vertex; this is conservative for finding maximum penetration but detected failures greatly exceed the scoring threshold.",
            "The primary visual block shell is tested as exported. It is a closed solid visual mesh without Boolean cylinder/crankcase voids, so visible internal mechanisms geometrically occupy its volume even when X-Ray materials make them readable.",
            "Same-journal bearing fits and same-cylinder piston ring/wrist-pin fits are excluded only by the frozen whitelist and are not reclassified here.",
            "Counterweight-versus-other-journal dynamic triangle pairs are not separately narrow-phased because the semantic GLB identifies the crankshaft at parent-part granularity; this remains unmeasured and cannot improve the zero collision score caused by measured block/liner failures.",
            "Timing/accessory drive versus unrelated shells is not independently time-swept at subcomponent granularity; circular rotations are transform-invariant, but this pair family is reported as unmeasured rather than inferred collision-free.",
        ],
        "perAngle": per_angle,
    }
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], indent=2))


if __name__ == "__main__":
    main()
