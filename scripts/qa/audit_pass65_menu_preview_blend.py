"""Fail-closed semantic and motion audit for one Pass 65 preview Blender master."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


def arguments() -> argparse.Namespace:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--blend", required=True)
    parser.add_argument("--arena", required=True)
    parser.add_argument("--recipe", required=True)
    return parser.parse_args(values)


def object_tree(root) -> list[bpy.types.Object]:
    result: list[bpy.types.Object] = []
    stack = [root]
    while stack:
        item = stack.pop()
        result.append(item)
        stack.extend(item.children)
    return result


def angle_between(left: Vector, right: Vector) -> float:
    return math.acos(max(-1.0, min(1.0, left.normalized().dot(right.normalized()))))


def projected_corners(scene, camera, objects: list[bpy.types.Object]) -> list[tuple[float, float, float]]:
    projected: list[tuple[float, float, float]] = []
    for item in objects:
        if item.type != "MESH" or item.hide_render:
            continue
        for corner in item.bound_box:
            point = world_to_camera_view(scene, camera, item.matrix_world @ Vector(corner))
            projected.append((point.x, point.y, point.z))
    return projected


def projection_bounds(points: list[tuple[float, float, float]]) -> list[float] | None:
    visible = [(x, y) for x, y, z in points if z > 0]
    if not visible:
        return None
    return [
        min(value[0] for value in visible),
        max(value[0] for value in visible),
        min(value[1] for value in visible),
        max(value[1] for value in visible),
    ]


def viewport_fraction(bounds: list[float] | None) -> float:
    if bounds is None:
        return 0.0
    width = max(0.000001, bounds[1] - bounds[0])
    height = max(0.000001, bounds[3] - bounds[2])
    visible_width = max(0.0, min(1.0, bounds[1]) - max(0.0, bounds[0]))
    visible_height = max(0.0, min(1.0, bounds[3]) - max(0.0, bounds[2]))
    return visible_width * visible_height / (width * height)


def material_signals(objects: list[bpy.types.Object]) -> dict[str, object]:
    names: set[str] = set()
    cyan = False
    green = False
    glass = False
    for item in objects:
        if item.type != "MESH":
            continue
        for value in item.data.materials:
            if value is None:
                continue
            names.add(value.name)
            lowered = value.name.lower()
            glass = glass or "glass" in lowered or "canopy" in lowered or value.diffuse_color[3] < 0.98
            if value.use_nodes:
                bsdf = value.node_tree.nodes.get("Principled BSDF")
                emission = None if bsdf is None else (bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission"))
                color = emission.default_value if emission is not None else value.diffuse_color
            else:
                color = value.diffuse_color
            cyan = cyan or (color[2] > 0.25 and color[1] > color[0] * 1.5)
            green = green or (color[1] > 0.22 and color[1] > color[0] * 1.5 and color[1] > color[2] * 1.2)
    return {"names": sorted(names), "cyan": cyan, "green": green, "glass": glass}


def main() -> int:
    args = arguments()
    recipe = json.loads(Path(args.recipe).read_text(encoding="utf-8"))
    arena_recipe = recipe["arenas"][args.arena]
    bpy.ops.wm.open_mainfile(filepath=str(Path(args.blend).resolve()))
    scene = bpy.context.scene
    failures: list[str] = []

    if scene.get("preview_recipe_id") != recipe["recipeId"]:
        failures.append("scene recipe id mismatch")
    if scene.get("preview_arena_id") != args.arena:
        failures.append("scene arena id mismatch")
    if scene.get("preview_seed") != arena_recipe["seed"]:
        failures.append("scene seed mismatch")
    if scene.frame_start != 1 or scene.frame_end != recipe["frameCount"]:
        failures.append("scene frame range mismatch")
    if scene.render.fps != recipe["fps"]:
        failures.append("scene FPS mismatch")
    camera = scene.camera
    if camera is None:
        failures.append("scene has no active preview camera")
        camera = next((item for item in bpy.data.objects if item.type == "CAMERA"), None)
    if camera is not None and abs(math.degrees(camera.data.angle) - arena_recipe["fovDegrees"]) > 0.01:
        failures.append("active camera FOV does not match canonical choreography")
    rig = next((item for item in bpy.data.objects if item.get("preview_arena_id") == args.arena and item.get("preview_kind")), None)
    if rig is None:
        failures.append("tagged preview camera rig missing")

    positions: list[Vector] = []
    directions: list[Vector] = []
    safe = arena_recipe["safeVolume"]
    if rig is not None and camera is not None:
        sample_count = (recipe["frameCount"] - 1) * 2 + 1
        for sample in range(sample_count):
            frame_value = 1.0 + sample / 2.0
            whole_frame = int(math.floor(frame_value))
            scene.frame_set(whole_frame, subframe=frame_value - whole_frame)
            position = camera.matrix_world.translation.copy()
            direction = camera.matrix_world.to_quaternion() @ Vector((0, 0, -1))
            positions.append(position)
            directions.append(direction.normalized())
            if not all(safe[axis][0] - 0.001 <= position[index] <= safe[axis][1] + 0.001 for index, axis in enumerate(("x", "y", "z"))):
                failures.append(f"camera leaves safe volume at frame {frame_value}")
                break

    step_seconds = 1.0 / (recipe["fps"] * 2.0)
    speeds = [
        (positions[index] - positions[index - 1]).length / step_seconds
        for index in range(1, len(positions))
    ]
    accelerations = [
        abs(speeds[index] - speeds[index - 1]) / step_seconds
        for index in range(1, len(speeds))
    ]
    angular_speeds = [
        angle_between(directions[index - 1], directions[index]) / step_seconds
        for index in range(1, len(directions))
    ]
    angular_accelerations = [
        abs(angular_speeds[index] - angular_speeds[index - 1]) / step_seconds
        for index in range(1, len(angular_speeds))
    ]
    position_seam = (positions[0] - positions[-1]).length if len(positions) > 1 else math.inf
    direction_seam = angle_between(directions[0], directions[-1]) if len(directions) > 1 else math.inf
    if position_seam > 0.0001 or direction_seam > 0.0005:
        failures.append("camera first/final frame seam is not exact")

    roots = [
        item for item in bpy.data.objects
        if item.get("asset_id") == "chopper-gunner-vehicle-v1" and item.get("quality_tier") == "LOD0"
    ]
    audit: dict[str, object] = {
        "arenaId": args.arena,
        "kind": arena_recipe["kind"],
        "recipeId": scene.get("preview_recipe_id"),
        "seed": scene.get("preview_seed"),
        "frames": recipe["frameCount"],
        "positionSeamM": position_seam,
        "directionSeamRadians": direction_seam,
        "maximumLinearSpeedMps": max(speeds, default=0.0),
        "maximumLinearAccelerationMps2": max(accelerations, default=0.0),
        "maximumAngularVelocityRadPerSecond": max(angular_speeds, default=0.0),
        "maximumAngularAccelerationRadPerSecond2": max(angular_accelerations, default=0.0),
        "failures": failures,
    }

    if arena_recipe["kind"] == "helicopter":
        helicopter_motion = recipe["helicopter"]
        for key, actual in (
            ("maximumLinearSpeedMps", max(speeds, default=0.0)),
            ("maximumLinearAccelerationMps2", max(accelerations, default=0.0)),
            ("maximumAngularVelocityRadPerSecond", max(angular_speeds, default=0.0)),
            ("maximumAngularAccelerationRadPerSecond2", max(angular_accelerations, default=0.0)),
        ):
            if actual > helicopter_motion[key] + 0.001:
                failures.append(f"helicopter {key} exceeds recipe bound: {actual:.4f} > {helicopter_motion[key]:.4f}")
        if len(roots) != 1:
            failures.append("helicopter master must contain exactly one authored LOD0 root")
        tree = object_tree(roots[0]) if len(roots) == 1 else []
        semantics = {item.get("canonical_node_name") or item.name: item for item in tree}
        required = {
            "chopper-first-person-cockpit",
            "chopper-first-person-camera-socket",
            "chopper-first-person-rotor",
        }
        missing = sorted(required - set(semantics))
        if missing:
            failures.append(f"missing cockpit semantics: {missing}")
        cockpit = semantics.get("chopper-first-person-cockpit")
        rotor = semantics.get("chopper-first-person-rotor")
        cockpit_tree = object_tree(cockpit) if cockpit is not None else []
        signals = material_signals(cockpit_tree)
        cockpit_meshes = [item for item in cockpit_tree if item.type == "MESH" and not item.hide_render]
        if len(cockpit_meshes) < 20:
            failures.append("cockpit does not meet authored mesh-detail floor")
        if len(signals["names"]) < 6 or not signals["cyan"] or not signals["green"] or not signals["glass"]:
            failures.append("cockpit lacks required cyan, green, glass, or material-depth signals")
        depths: list[float] = []
        if camera is not None:
            inverse_camera = camera.matrix_world.inverted()
            for item in cockpit_meshes:
                depths.extend((inverse_camera @ (item.matrix_world @ Vector(corner))).z for corner in item.bound_box)
        depth_span = max(depths, default=0.0) - min(depths, default=0.0)
        if depth_span < 0.2:
            failures.append("cockpit depth span is too shallow to substantiate a 3D cockpit")
        radar_sweep = next((item for item in cockpit_tree if item.name.startswith("Chopper_RadarSweep_LOD0")), None)
        target_ring = next((item for item in cockpit_tree if item.name.startswith("chopper-cockpit-hud-target-ring")), None)
        depth_lights = [item for item in bpy.data.objects if item.get("preview_cockpit_depth_light")]
        animated_instrument_materials = [
            value.name for value in bpy.data.materials
            if value.get("preview_instrument_animation") == "bounded-emission-breathe-exact-loop"
        ]
        if radar_sweep is None or radar_sweep.get("preview_instrument_animation") != "two-exact-loop-radar-turns":
            failures.append("cockpit radar sweep lacks exact-loop animation metadata")
        if target_ring is None or target_ring.get("preview_instrument_animation") != "bounded-two-pulse-exact-loop":
            failures.append("cockpit HUD target ring lacks bounded exact-loop animation")
        if len(depth_lights) != 2 or len(animated_instrument_materials) != 2:
            failures.append("cockpit lacks paired cyan/green depth lighting or bounded instrument emission animation")
        rotor_tree = object_tree(rotor) if rotor is not None else []
        rotor_cues = [item for item in rotor_tree if item.get("preview_rotor_visual_cue")]
        rotor_cue_kinds = sorted({item.get("preview_rotor_visual_cue") for item in rotor_cues})
        rotor_cue_alpha = [float(item.get("preview_rotor_visual_alpha", 0.0)) for item in rotor_cues]
        required_rotor_cues = {
            "authored-blade-motion-cue",
            "authored-disc-motion-cue",
            "authored-tip-motion-cue",
        }
        if set(rotor_cue_kinds) != required_rotor_cues or min(rotor_cue_alpha, default=0.0) < 0.1:
            failures.append("first-person rotor lacks the reviewed blade/disc/tip visibility treatment")
        rotor_driver = None
        if rotor is not None and rotor.animation_data is not None:
            drivers = list(rotor.animation_data.drivers)
            rotor_driver = next((value.driver.expression for value in drivers if value.data_path == "rotation_euler"), None)
        if rotor_driver is None or "frame - 1" not in rotor_driver or str(recipe["helicopter"]["rotorTurnsPerLoop"]) not in str(rotor.get("preview_rotor_turns_per_loop") if rotor else ""):
            failures.append("first-person rotor lacks exact-loop authored driver metadata")
        rotor_review_hits = 0
        if camera is not None:
            for frame in recipe["reviewFrames"]:
                scene.frame_set(frame)
                points = projected_corners(scene, camera, rotor_tree)
                if any(-0.08 <= x <= 1.08 and 0.58 <= y <= 1.12 and z > 0 for x, y, z in points):
                    rotor_review_hits += 1
        if rotor_review_hits < len(recipe["reviewFrames"]):
            failures.append("first-person rotor is not visible in the upper frustum at every review frame")
        dashboard = next((item for item in cockpit_tree if item.name.startswith("Chopper_Dashboard_LOD0")), None)
        hud_glass = next((item for item in cockpit_tree if item.name.startswith("chopper-cockpit-hud-glass")), None)
        dashboard_bounds = None
        hud_bounds = None
        if camera is not None:
            scene.frame_set(recipe["reviewFrames"][0])
            dashboard_bounds = projection_bounds(projected_corners(scene, camera, [dashboard] if dashboard else []))
            hud_bounds = projection_bounds(projected_corners(scene, camera, [hud_glass] if hud_glass else []))
        if dashboard_bounds is None or not (
            dashboard_bounds[0] >= -0.12 and dashboard_bounds[1] <= 1.12
            and dashboard_bounds[2] >= -0.30 and dashboard_bounds[3] <= 0.78
        ):
            failures.append("camera FOV crops the dashboard and destroys cockpit/map composition")
        if hud_bounds is None or not (
            hud_bounds[0] >= 0.12 and hud_bounds[1] <= 0.88
            and hud_bounds[2] >= 0.16 and hud_bounds[3] <= 0.96
        ):
            failures.append("central three-dimensional HUD glass leaves its safe review frustum")
        audit.update({
            "lod0Roots": len(roots),
            "cockpitMeshes": len(cockpit_meshes),
            "cockpitMaterials": len(signals["names"]),
            "cockpitMaterialSignals": {key: signals[key] for key in ("cyan", "green", "glass")},
            "cockpitDepthSpanM": depth_span,
            "cockpitDepthLights": len(depth_lights),
            "animatedInstrumentMaterials": sorted(animated_instrument_materials),
            "rotorReviewFrameHits": rotor_review_hits,
            "rotorDriver": rotor_driver,
            "rotorVisualCueKinds": rotor_cue_kinds,
            "rotorVisualCueAlphaRange": [min(rotor_cue_alpha, default=0.0), max(rotor_cue_alpha, default=0.0)],
            "dashboardProjectionBounds": dashboard_bounds,
            "hudGlassProjectionBounds": hud_bounds,
        })
    else:
        if roots:
            failures.append("cat master must not contain a helicopter root")
        ears = [item for item in bpy.data.objects if item.get("preview_anatomy") == "ear"]
        paws = [item for item in bpy.data.objects if item.get("preview_anatomy") == "paw"]
        toes = [item for item in bpy.data.objects if item.get("preview_anatomy") == "toe"]
        expected = arena_recipe["anatomyContract"]
        if len(ears) != expected["earCount"] or len(paws) != expected["pawCount"]:
            failures.append("cat ear or paw count violates anatomy contract")
        for side in ("left", "right"):
            side_toes = [item for item in toes if item.get("preview_side") == side]
            if len(side_toes) != expected["toeCountPerPaw"]:
                failures.append(f"cat {side} paw toe count violates anatomy contract")
        anatomy = [item for item in bpy.data.objects if item.get("preview_anatomy")]
        primitive_spheres = [item for item in anatomy if "sphere" in item.name.lower()]
        if len(primitive_spheres) != expected["primitiveSphereCount"]:
            failures.append("cat anatomy contains forbidden primitive-sphere stand-ins")
        materials = {value.name for item in anatomy if item.type == "MESH" for value in item.data.materials if value is not None}
        if not set(expected["materials"]).issubset(materials):
            failures.append("cat anatomy is missing required authored material separation")
        fur_detail_materials = 0
        for material_name in ("cat-fur-charcoal", "cat-fur-silver"):
            value = bpy.data.materials.get(material_name)
            node_names = set() if value is None or value.node_tree is None else {node.name for node in value.node_tree.nodes}
            if any(name.endswith("-micro-fur-noise") for name in node_names) and any(name.endswith("-micro-fur-bump") for name in node_names):
                fur_detail_materials += 1
        if fur_detail_materials != 2:
            failures.append("cat fur materials lack authored micro-colour and bump texture nodes")
        motion = arena_recipe["motionBounds"]
        for key, actual in (
            ("maximumLinearSpeedMps", max(speeds, default=0.0)),
            ("maximumLinearAccelerationMps2", max(accelerations, default=0.0)),
            ("maximumAngularVelocityRadPerSecond", max(angular_speeds, default=0.0)),
            ("maximumAngularAccelerationRadPerSecond2", max(angular_accelerations, default=0.0)),
        ):
            if actual > motion[key] + 0.001:
                failures.append(f"cat {key} exceeds recipe bound: {actual:.4f} > {motion[key]:.4f}")
        visible_review_frames = 0
        anatomy_clip_violations: list[str] = []
        cat_roots = ears + paws
        cat_meshes = [item for root in cat_roots for item in object_tree(root)]
        if camera is not None:
            for frame in recipe["reviewFrames"]:
                scene.frame_set(frame)
                points = projected_corners(scene, camera, cat_meshes)
                if any(-0.05 <= x <= 1.05 and -0.05 <= y <= 1.05 and z > 0 for x, y, z in points):
                    visible_review_frames += 1
                for root in cat_roots:
                    descendants = object_tree(root)
                    core = [
                        item for item in descendants
                        if item.get("preview_anatomy") in {"ear-shell", "ear-pinna", "palm", "toe", "digital-pad", "central-pad"}
                    ]
                    bounds = projection_bounds(projected_corners(scene, camera, core))
                    visible_fraction = viewport_fraction(bounds)
                    centre_safe = bounds is not None and (
                        0.02 <= (bounds[0] + bounds[1]) / 2.0 <= 0.98
                        and 0.02 <= (bounds[2] + bounds[3]) / 2.0 <= 0.98
                    )
                    minimum_fraction = 0.78 if root.get("preview_anatomy") == "ear" else 0.66
                    if not centre_safe or visible_fraction < minimum_fraction:
                        anatomy_clip_violations.append(
                            f"frame {frame}: {root.name} bounds={bounds} visible={visible_fraction:.3f}"
                        )
        if visible_review_frames < len(recipe["reviewFrames"]):
            failures.append("cat ears/paws leave the review frustum")
        if anatomy_clip_violations:
            failures.append("cat core ear/paw silhouettes are not sufficiently visible in the safe review frustum")
        audit.update({
            "lod0Roots": len(roots),
            "ears": len(ears),
            "paws": len(paws),
            "toes": len(toes),
            "primitiveSphereAnatomy": len(primitive_spheres),
            "anatomyMaterials": sorted(materials),
            "furDetailMaterials": fur_detail_materials,
            "anatomyReviewFrameHits": visible_review_frames,
            "anatomyClipViolations": anatomy_clip_violations,
        })

    audit["failures"] = failures
    audit["passed"] = not failures
    print("AA_PREVIEW_BLEND_AUDIT=" + json.dumps(audit, sort_keys=True))
    return 0 if not failures else 2


raise SystemExit(main())
