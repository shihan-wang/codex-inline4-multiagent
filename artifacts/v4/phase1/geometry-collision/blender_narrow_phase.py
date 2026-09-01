"""Independent Blender BVH triangle-overlap probe for the priority V3 pairs.

The frozen scanner's inside-outer-shell and radial-excess tests are intentionally
not reused as collision truth.  This probe tests actual exported surface triangle
intersections for rods/liners over all 721 angles, and representative block-shell
angles for the high-frequency enclosure pairs.
"""

from __future__ import annotations

import bpy
import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path

from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[4]
GLB = ROOT / "artifacts" / "external-eval" / "geometry" / "export" / "semantic-engine.glb"
MANIFEST = ROOT / "artifacts" / "external-eval" / "geometry" / "export" / "semantic-engine.manifest.json"
SNAPSHOTS = ROOT / "artifacts" / "external-eval" / "mechanics" / "assembly-scan.json"
OUTPUT = Path(__file__).resolve().parent / "blender-narrow-phase.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mesh_data(objects: list[bpy.types.Object]) -> tuple[list[Vector], list[tuple[int, int, int]]]:
    vertices: list[Vector] = []
    triangles: list[tuple[int, int, int]] = []
    for obj in objects:
        base = len(vertices)
        vertices.extend(obj.matrix_world @ vertex.co for vertex in obj.data.vertices)
        obj.data.calc_loop_triangles()
        triangles.extend(tuple(base + index for index in item.vertices) for item in obj.data.loop_triangles)
    return vertices, triangles


def transformed_bvh(
    base_vertices: list[Vector],
    triangles: list[tuple[int, int, int]],
    transform: Matrix,
) -> tuple[BVHTree, list[Vector]]:
    vertices = [transform @ vertex for vertex in base_vertices]
    return BVHTree.FromPolygons(vertices, triangles, all_triangles=True, epsilon=1.0e-8), vertices


def identity_bvh(
    base_vertices: list[Vector],
    triangles: list[tuple[int, int, int]],
) -> BVHTree:
    return BVHTree.FromPolygons(base_vertices, triangles, all_triangles=True, epsilon=1.0e-8)


def ranges(angles: list[int]) -> list[list[int]]:
    if not angles:
        return []
    result = []
    start = previous = angles[0]
    for angle in angles[1:]:
        if angle != previous + 1:
            result.append([start, previous])
            start = angle
        previous = angle
    result.append([start, previous])
    return result


def rod_transform(snapshot: dict, initial: dict, cylinder: int) -> Matrix:
    now_by_cylinder = {item["cylinder"]: item for item in snapshot["cylinders"]}
    initial_by_cylinder = {item["cylinder"]: item for item in initial["cylinders"]}
    now = now_by_cylinder[cylinder]
    zero = initial_by_cylinder[cylinder]
    # Blender's glTF importer maps Y-up (x, y, z) to Z-up (x, -z, y).
    p0_gltf = tuple(component * 0.01 for component in zero["rodGroupPositionMm"])
    p1_gltf = tuple(component * 0.01 for component in now["rodGroupPositionMm"])
    p0 = Vector((p0_gltf[0], -p0_gltf[2], p0_gltf[1]))
    p1 = Vector((p1_gltf[0], -p1_gltf[2], p1_gltf[1]))
    return (
        Matrix.Translation(p1)
        @ Matrix.Rotation(float(now["rodRotationXrad"]), 4, "X")
        @ Matrix.Rotation(-float(zero["rodRotationXrad"]), 4, "X")
        @ Matrix.Translation(-p0)
    )


def piston_transform(snapshot: dict, initial: dict, cylinder: int) -> Matrix:
    now = next(item for item in snapshot["cylinders"] if item["cylinder"] == cylinder)
    zero = next(item for item in initial["cylinders"] if item["cylinder"] == cylinder)
    delta_y = (float(now["pistonGroupYmm"]) - float(zero["pistonGroupYmm"])) * 0.01
    return Matrix.Translation(Vector((0.0, 0.0, delta_y)))


def overlap_witness(
    left_bvh: BVHTree,
    right_bvh: BVHTree,
    left_vertices: list[Vector],
    left_faces: list[tuple[int, int, int]],
    right_vertices: list[Vector],
    right_faces: list[tuple[int, int, int]],
) -> dict:
    overlaps = left_bvh.overlap(right_bvh)
    result = {"overlapTrianglePairs": len(overlaps), "witness": None}
    if overlaps:
        left_index, right_index = overlaps[0]
        left_center = sum((left_vertices[i] for i in left_faces[left_index]), Vector()) / 3
        right_center = sum((right_vertices[i] for i in right_faces[right_index]), Vector()) / 3
        result["witness"] = {
            "leftTriangle": int(left_index),
            "rightTriangle": int(right_index),
            "leftCentroidGlbUnits": list(left_center),
            "rightCentroidGlbUnits": list(right_center),
        }
    return result


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    snapshots = json.loads(SNAPSHOTS.read_text(encoding="utf-8"))
    assert manifest["targetCommit"] == "7e5ea916a115dcef1bf3ba467a31b78c6206c612"
    assert snapshots["range"] == {"startDegrees": 0, "endDegrees": 720, "stepDegrees": 1, "samples": 721}
    assert sha256(GLB) == manifest["glb"]["sha256"]

    records = {
        record["semanticName"]: record
        for record in manifest["records"]
        if record["primitiveKind"] == "triangles"
    }
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    objects = {
        obj.name: obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name in records
    }

    by_part: dict[str, list[bpy.types.Object]] = {}
    for name, obj in objects.items():
        by_part.setdefault(records[name]["originalPartId"], []).append(obj)

    block_name = "structural-solid__engine-block__001"
    liner_names = [f"structural-solid__engine-block__{index:03d}" for index in range(21, 25)]
    block_vertices, block_faces = mesh_data([objects[block_name]])
    block_bvh = identity_bvh(block_vertices, block_faces)
    liner_data = []
    for name in liner_names:
        vertices, faces = mesh_data([objects[name]])
        liner_data.append((name, vertices, faces, identity_bvh(vertices, faces)))

    part_data = {}
    for part_id in [
        *(f"piston-{index}" for index in range(1, 5)),
        *(f"connecting-rod-{index}" for index in range(1, 5)),
        "crankshaft",
    ]:
        part_data[part_id] = mesh_data(by_part[part_id])

    initial = snapshots["samples"][0]
    rod_results = {}
    for cylinder in range(1, 5):
        part_id = f"connecting-rod-{cylinder}"
        base_vertices, faces = part_data[part_id]
        liner_name, liner_vertices, liner_faces, liner_bvh = liner_data[cylinder - 1]
        collision_angles = []
        peak = {"angleDeg": None, "overlapTrianglePairs": 0, "witness": None}
        per_collision_angle = []
        for snapshot in snapshots["samples"]:
            angle = int(snapshot["globalDegrees"])
            rod_bvh, rod_vertices = transformed_bvh(base_vertices, faces, rod_transform(snapshot, initial, cylinder))
            evidence = overlap_witness(rod_bvh, liner_bvh, rod_vertices, faces, liner_vertices, liner_faces)
            if evidence["overlapTrianglePairs"]:
                collision_angles.append(angle)
                per_collision_angle.append({"angleDeg": angle, **evidence})
                if evidence["overlapTrianglePairs"] > peak["overlapTrianglePairs"]:
                    peak = {"angleDeg": angle, **evidence}
        rod_results[f"{part_id} vs cylinder-liner-{cylinder}"] = {
            "linerSemanticName": liner_name,
            "collisionAngleCount": len(collision_angles),
            "collisionAngleRanges": ranges(collision_angles),
            "peak": peak,
            "perCollisionAngle": per_collision_angle,
        }

    representative_angles = sorted({0, 38, 180, 360, 483, 540, 663, 720})
    block_surface_results = {}
    for part_id, (base_vertices, faces) in part_data.items():
        collision_angles = []
        representative_checks = []
        peak = {"angleDeg": None, "overlapTrianglePairs": 0, "witness": None}
        for snapshot in snapshots["samples"]:
            angle = int(snapshot["globalDegrees"])
            if part_id == "crankshaft":
                transform = Matrix.Rotation(float(snapshot["crankAngleRad"]), 4, "X")
            elif part_id.startswith("piston-"):
                transform = piston_transform(snapshot, initial, int(part_id[-1]))
            else:
                transform = rod_transform(snapshot, initial, int(part_id[-1]))
            part_bvh, vertices = transformed_bvh(base_vertices, faces, transform)
            evidence = overlap_witness(part_bvh, block_bvh, vertices, faces, block_vertices, block_faces)
            if evidence["overlapTrianglePairs"]:
                collision_angles.append(angle)
                if evidence["overlapTrianglePairs"] > peak["overlapTrianglePairs"]:
                    peak = {"angleDeg": angle, **evidence}
            if angle in representative_angles:
                representative_checks.append({"angleDeg": angle, **evidence})
        block_surface_results[f"{part_id} vs engine-block-primary-shell"] = {
            "collisionAngleCount": len(collision_angles),
            "collisionAngleRanges": ranges(collision_angles),
            "peak": peak,
            "representativeChecks": representative_checks,
        }

    output = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "targetCommit": manifest["targetCommit"],
        "tool": {
            "name": "Blender BVHTree",
            "blenderVersion": bpy.app.version_string,
            "buildHash": bpy.app.build_hash.decode("utf-8"),
            "pythonVersion": sys.version,
            "platform": platform.platform(),
        },
        "inputs": {
            "glbSha256": sha256(GLB),
            "manifestSha256": sha256(MANIFEST),
            "snapshotsSha256": sha256(SNAPSHOTS),
        },
        "method": {
            "triangleNarrowPhase": "Blender mathutils.bvhtree.BVHTree.overlap on all exported triangles; epsilon 1e-8 GLB units",
            "rodLinerAngles": "0..720 inclusive, 1 degree step, 721 samples",
            "blockSurfaceAngles": "0..720 inclusive, 1 degree step, 721 samples",
            "blockRepresentativeAngles": representative_angles,
            "containmentPolicy": "A moving mesh fully enclosed by the outer block surface without triangle overlap is reported as enclosure, not surface penetration.",
        },
        "rodLiner": rod_results,
        "blockOuterSurface": block_surface_results,
    }
    OUTPUT.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print("BLENDER_NARROW_PHASE=" + json.dumps({
        "rodLinerCollisionCounts": {key: value["collisionAngleCount"] for key, value in rod_results.items()},
        "blockSurfaceCollisionCounts": {
            key: value["collisionAngleCount"]
            for key, value in block_surface_results.items()
        },
    }, separators=(",", ":")))


main()
