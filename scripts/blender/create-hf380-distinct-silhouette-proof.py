"""HF-380 - prove ONE distinct character silhouette on the canonical 62-joint rig.

Why this script exists
----------------------
HF-380 ("the operations do not look like what I specced and wanted, with venom,
lara croft etc?") stayed open through commit 84037dd9 because the pass74
generator can only apply RADIAL multipliers (shoulder width / torso bulk / limb
thickness) plus bolt-on boxes. No parameter choice over those knobs produces a
character-shaped body: every delivery decodes to the same four male SWAT base
meshes (Cube.018/024/037/023).

This script is the blocking-prerequisite proof: a NON-RADIAL, region-weighted
reshaping of the rest-pose mesh that reads as a different character (athletic
female adventurer, matching the explorer card art already shipping), while:

- keeping the 62-joint skeleton, bone names and skin WEIGHTS byte-identical
  (only rest-pose vertex positions move; animations therefore deform the new
  bind pose exactly as the canonical one);
- keeping the four immutable material names Skin/Swat/Swat_Black/Visor;
- skinning the one new accessory (a braid) FULLY to the existing "Head" joint.

Everything is measured, not asserted: body-width profile at shoulder/waist/hip
heights, standing height, thigh radius, before vs after, with fail-closed
thresholds in verify_distinctness(). Review renders of BASELINE and SHAPED are
written side by side so a human can read the difference.

Run:
  blender --background --factory-startup --python-exit-code 1 \
      --python scripts/blender/create-hf380-distinct-silhouette-proof.py

Outputs under artifacts/blender-operator-skins/hf380/:
  hf380-distinct-silhouette-explorer-lod{0,1}.glb
  reviews/hf380-{baseline|shaped}-{view}.png + contact sheet
  hf380-distinct-silhouette-receipt.json

NOT shipped by this script: it does NOT touch public/assets or the asset
manifest; promotion is a separate reviewed step.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SOURCE_GLTF = ROOT / "public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf"
OUT_DIR = ROOT / "artifacts/blender-operator-skins/hf380"
REVIEW_DIR = OUT_DIR / "reviews"
REVIEW_SIZE = 640
MATERIAL_NAMES = ("Skin", "Swat", "Swat_Black", "Visor")
JOINT_COUNT = 62
CLIP_COUNT = 24
HAIR_MATERIAL = "Swat_Black"  # immutable name; explorer palette paints it warm brown

BODY_MESH_NAMES = ("Swat_Body", "Swat_Feet", "Swat_Head", "Swat_Legs")

PARAMS = {
    "heightScale": 0.925,     # whole-body vertical scale about ground plane
    "shoulderNarrow": 0.18,   # x-narrowing where Shoulder/UpperArm weights live
    "waistPinch": 0.22,       # radial pinch where Abdomen weight lives
    "hipFlare": 0.09,         # radial flare in the hip z-band
    "legSlim": 0.62,          # perpendicular slimming toward leg bone segments
    "armSlim": 0.72,          # perpendicular slimming toward arm bone segments
    "chestForm": 0.055,       # forward bust displacement on front-facing Chest verts
}

LIMB_JOINTS = (
    "UpperArm.L", "LowerArm.L", "Wrist.L",
    "UpperArm.R", "LowerArm.R", "Wrist.R",
    "UpperLeg.L", "LowerLeg.L", "Foot.L",
    "UpperLeg.R", "LowerLeg.R", "Foot.R",
)
SHOULDER_GROUPS = ("Shoulder.L", "Shoulder.R")
UPPER_ARM_GROUPS = ("UpperArm.L", "UpperArm.R")

REQUIRED_ACTIONS = (
    "Idle_Gun_Pointing", "Idle_Gun", "Walk", "Run", "Run_Shoot",
    "Gun_Shoot", "HitRecieve", "HitRecieve_2", "Death", "Punch_Right",
)

OUT_DIR.mkdir(parents=True, exist_ok=True)
REVIEW_DIR.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def reset() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.images):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def input_socket(node, *names: str):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    raise RuntimeError(f"missing shader input {names}")


def verify_canonical_rig(armature, body_meshes, stage: str) -> None:
    bones = armature.data.bones
    if len(bones) != JOINT_COUNT:
        raise RuntimeError(f"[{stage}] joint count drifted: {len(bones)} != {JOINT_COUNT}")
    if len(bpy.data.actions) != CLIP_COUNT:
        raise RuntimeError(f"[{stage}] clip count drifted: {len(bpy.data.actions)} != {CLIP_COUNT}")
    for action_name in REQUIRED_ACTIONS:
        if bpy.data.actions.get(action_name) is None:
            raise RuntimeError(f"[{stage}] required animation {action_name} missing")
    for body in body_meshes:
        if not body.vertex_groups:
            raise RuntimeError(f"[{stage}] {body.name} lost its skin weights")
        for slot in body.material_slots:
            if slot.material is None or slot.material.name not in MATERIAL_NAMES:
                raise RuntimeError(f"[{stage}] {body.name} carries non-canonical material")


def import_and_prepare():
    reset()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLTF))
    armature = bpy.data.objects.get("CharacterArmature")
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError("Quaternius SWAT armature was not imported")
    embedded_pistol = bpy.data.objects.get("Pistol")
    if embedded_pistol is None:
        raise RuntimeError("source pistol removal contract cannot be verified")
    bpy.data.objects.remove(embedded_pistol, do_unlink=True)
    body_objects = [bpy.data.objects.get(name) for name in BODY_MESH_NAMES]
    if any(obj is None or obj.type != "MESH" for obj in body_objects):
        raise RuntimeError("complete source SWAT body mesh family was not imported")
    body_meshes = [obj for obj in body_objects if obj is not None]
    verify_canonical_rig(armature, body_meshes, "import")
    if armature.animation_data is None:
        raise RuntimeError("operator armature has no animation data")
    armature.animation_data.action = None
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    armature["asset_id"] = "hf380-distinct-silhouette-proof"
    armature["archetype_id"] = "explorer"
    armature["skeleton_policy"] = "immutable-canonical-pass65-rig-no-joint-added-renamed-reparented"
    armature["skeleton_joint_count"] = JOINT_COUNT
    armature["animation_clip_count"] = CLIP_COUNT
    armature["material_names"] = ",".join(MATERIAL_NAMES)
    return armature, body_meshes


def vertex_weights(mesh, vertex) -> dict[str, float]:
    weights: dict[str, float] = {}
    for element in vertex.groups:
        name = mesh.vertex_groups[element.group].name
        weights[name] = weights.get(name, 0.0) + element.weight
    return weights


class RegionWeights:
    """Per-vertex aggregated canonical-group influences, computed once."""

    def __init__(self, body_meshes):
        self.entries: dict[tuple[str, int], dict[str, float]] = {}
        for mesh in body_meshes:
            for vertex in mesh.data.vertices:
                weights = vertex_weights(mesh, vertex)

                def s(*names: str) -> float:
                    return sum(weights.get(n, 0.0) for n in names)

                self.entries[(mesh.name, vertex.index)] = {
                    "shoulder": min(1.0, s("Shoulder.L", "Shoulder.R")),
                    "armUpper": min(1.0, s("UpperArm.L", "UpperArm.R")),
                    "abdomen": s("Abdomen"),
                    "chest": s("Chest"),
                    # pelvis verts blend into Abdomen/legs; Hips alone has only
                    # ~54 strong members, so gate flare on the whole lower body
                    "lowerBody": min(1.0, s(
                        "Hips", "Torso", "Abdomen",
                        "UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R",
                    )),
                    "armAny": min(1.0, s(
                        "Shoulder.L", "Shoulder.R",
                        "UpperArm.L", "UpperArm.R",
                        "LowerArm.L", "LowerArm.R", "Wrist.L", "Wrist.R",
                    )),
                }

    def get(self, mesh_name: str, index: int) -> dict[str, float]:
        entry = self.entries.get((mesh_name, index))
        if entry is None:
            raise RuntimeError(f"region weights missing for {mesh_name}[{index}]")
        return entry


def world_vertices(body_meshes):
    for mesh in body_meshes:
        world = mesh.matrix_world
        inverse = world.inverted()
        for vertex in mesh.data.vertices:
            yield mesh, vertex, world @ vertex.co, inverse


def _bone_segment(armature, joint: str):
    bone = armature.data.bones[joint]
    head = armature.matrix_world @ bone.head_local
    tail = armature.matrix_world @ bone.tail_local
    return head, tail


def detect_forward(body_meshes) -> Vector:
    """Forward = direction toes point away from the ankle, averaged over boots.

    The boots are the only reliably asymmetric landmark in the rest pose; the
    toe cap extends horizontally beyond the ankle (Foot bone head).
    """
    forwards: list[Vector] = []
    for mesh in body_meshes:
        world = mesh.matrix_world
        groups = {group.name: group.index for group in mesh.vertex_groups}
        for side in ("L", "R"):
            foot_index = groups.get(f"Foot.{side}")
            lower_index = groups.get(f"LowerLeg.{side}")
            upper_index = groups.get(f"UpperLeg.{side}")
            if foot_index is None:
                continue
            foot_points = [
                world @ v.co
                for v in mesh.data.vertices
                if any(e.group == foot_index and e.weight > 0.5 for e in v.groups)
            ]
            if len(foot_points) < 8:
                continue
            # ankle proxy: centroid of LowerLeg-weighted verts near the foot,
            # else the lowest UpperLeg/LowerLeg vert.
            anchor = None
            for probe in (lower_index, upper_index):
                if probe is None:
                    continue
                candidates = [
                    world @ v.co
                    for v in mesh.data.vertices
                    if any(e.group == probe and e.weight > 0.5 for e in v.groups)
                ]
                if candidates:
                    anchor = min(candidates, key=lambda c: c.z)
                    break
            if anchor is None:
                continue
            # toe = foot vertex farthest from the ankle in the xy plane
            toe = max(foot_points, key=lambda c: (Vector((c.x - anchor.x, c.y - anchor.y, 0.0))).length)
            direction = Vector((toe.x - anchor.x, toe.y - anchor.y, 0.0))
            if direction.length > 1e-4:
                forwards.append(direction.normalized())
    if not forwards:
        raise RuntimeError("could not derive body facing from boot geometry")
    mean = sum(forwards, Vector((0.0, 0.0, 0.0)))
    mean.normalize()
    return mean


def measure_profile(body_meshes, regions: RegionWeights, anchor_height_scale: float = 1.0) -> dict[str, float]:
    """Body-width profile from world-space extents of region-gated vertices.

    `anchor_height_scale` must match the vertical scale already applied to the
    mesh (1.0 for the pristine bind pose) so bone-anchored metrics track the
    reshaped geometry rather than the untouched rig.
    """
    xs_shoulder: list[float] = []
    xs_waist: list[float] = []
    ys_waist: list[float] = []
    xs_hip: list[float] = []
    ys_hip: list[float] = []
    zs: list[float] = []
    thigh_radii: list[float] = []
    segments = {}
    return_metrics: dict[str, float] = {}

    # Bone anchors are needed for the hip band and thigh radius; take them
    # from the armature found via mesh parents.
    armature = next((m.parent for m in body_meshes if m.parent and m.parent.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError("body meshes are not parented to the armature")
    for joint in ("UpperLeg.L", "UpperLeg.R"):
        head, tail = _bone_segment(armature, joint)
        scaled_head = Vector((head.x, head.y, head.z * anchor_height_scale))
        scaled_tail = Vector((tail.x, tail.y, tail.z * anchor_height_scale))
        segments[joint] = (scaled_head, scaled_tail, (scaled_tail - scaled_head).normalized())
    hip_bone_z = (_bone_segment(armature, "Hips")[0].z) * anchor_height_scale
    # Pelvis width band around the hip joint, excluding hanging arms.
    hip_band = (hip_bone_z - 0.05 * anchor_height_scale, hip_bone_z + 0.12 * anchor_height_scale)

    for mesh, vertex, co, _inverse in world_vertices(body_meshes):
        region = regions.get(mesh.name, vertex.index)
        zs.append(co.z)
        if region["shoulder"] > 0.45:
            xs_shoulder.append(co.x)
        if region["abdomen"] > 0.5:
            xs_waist.append(co.x)
            ys_waist.append(co.y)
        if region["armAny"] < 0.3 and hip_band[0] <= co.z <= hip_band[1]:
            xs_hip.append(co.x)
            ys_hip.append(co.y)
        for joint in ("UpperLeg.L", "UpperLeg.R"):
            weight = sum(
                e.weight for e in vertex.groups
                if mesh.vertex_groups[e.group].name == joint
            )
            if weight > 0.6:
                head, tail, direction = segments[joint]
                d = co - head
                t = max(0.0, min(1.0, d.dot(direction)))
                closest = head + direction * ((tail - head).length * t)
                radial = (co - closest).length
                thigh_radii.append(radial)

    if not (xs_shoulder and xs_waist and xs_hip and zs and thigh_radii):
        raise RuntimeError("profile regions came back empty; masks do not match source mesh")
    return_metrics.update({
        "shoulderWidthM": max(xs_shoulder) - min(xs_shoulder),
        "waistWidthXM": max(xs_waist) - min(xs_waist),
        "waistDepthYM": max(ys_waist) - min(ys_waist),
        "hipWidthXM": max(xs_hip) - min(xs_hip),
        "hipDepthYM": max(ys_hip) - min(ys_hip),
        "heightM": max(zs) - min(zs),
        "thighMeanRadiusM": sum(thigh_radii) / len(thigh_radii),
        "groundZM": min(zs),
    })
    return return_metrics


def apply_distinct_silhouette(armature, body_meshes, params: dict, forward: Vector) -> None:
    """Non-radial, weight-masked rest-pose reshaping. Weights stay untouched."""
    height_scale = params["heightScale"]

    # Limb segments are rescaled vertically with the body so anchors keep
    # matching the (already height-scaled) vertices they act on.
    segments = {}
    for joint in LIMB_JOINTS:
        head, tail = _bone_segment(armature, joint)
        scaled_head = Vector((head.x, head.y, head.z * height_scale))
        scaled_tail = Vector((tail.x, tail.y, tail.z * height_scale))
        vector = scaled_tail - scaled_head
        length = vector.length
        direction = vector.normalized() if length > 1e-6 else Vector((0.0, 0.0, 1.0))
        segments[joint] = (scaled_head, scaled_tail, direction, length)

    def closest_on_segment(segment, point: Vector) -> Vector:
        head, tail, direction, length = segment
        if length <= 1e-6:
            return head.copy()
        t = max(0.0, min(1.0, (point - head).dot(direction) / length))
        return head + direction * (length * t)

    # Chest-region centre for directional bust displacement.
    chest_points: list[Vector] = []
    regions = RegionWeights(body_meshes)
    for mesh, vertex, co, _inverse in world_vertices(body_meshes):
        if regions.get(mesh.name, vertex.index)["chest"] > 0.3:
            chest_points.append(co)
    if not chest_points:
        raise RuntimeError("chest region empty; cannot place bust form")
    chest_center = sum(chest_points, Vector((0.0, 0.0, 0.0))) / len(chest_points)

    # Hip flare is a z-band gaussian around the hip joint gated to lower-body
    # vertices: the Hips group alone covers only ~54 verts of the pelvis.
    hip_z = _bone_segment(armature, "Hips")[0].z * height_scale
    flare_sigma = 0.10

    def flare_influence(z: float, region: dict[str, float]) -> float:
        band = math.exp(-((z - hip_z) ** 2) / (2.0 * flare_sigma ** 2))
        return params["hipFlare"] * band * region["lowerBody"]

    for mesh in body_meshes:
        world = mesh.matrix_world
        inverse = world.inverted()
        for vertex in mesh.data.vertices:
            region = regions.get(mesh.name, vertex.index)
            co = world @ vertex.co

            # 1. stature: scale about the ground plane (z=0 contact verified below)
            co.z *= height_scale

            # 2. frame narrowing: shoulders and upper arms pull inward
            shoulder_influence = min(1.0, region["shoulder"] + 0.35 * region["armUpper"])
            co.x *= 1.0 - params["shoulderNarrow"] * shoulder_influence

            # 3. torso shaping: waist pinch + hip flare as opposing radials
            waist = params["waistPinch"] * region["abdomen"]
            flare = flare_influence(co.z, region)
            co.x *= (1.0 - waist) * (1.0 + flare)
            co.y *= (1.0 - 0.85 * waist) * (1.0 + 0.55 * flare)

            # 4. limb slimming: shrink ONLY the perpendicular component so limb
            #    length along the bone is preserved exactly.
            best_joint = None
            best_weight = 0.0
            for joint in LIMB_JOINTS:
                weight = 0.0
                for element in vertex.groups:
                    if mesh.vertex_groups[element.group].name == joint:
                        weight += element.weight
                if weight > best_weight:
                    best_joint = joint
                    best_weight = weight
            if best_joint is not None and best_weight > 0.05:
                target = params["legSlim"] if best_joint.startswith(("UpperLeg", "LowerLeg", "Foot")) else params["armSlim"]
                anchor = closest_on_segment(segments[best_joint], co)
                offset = co - anchor
                parallel = offset.dot(segments[best_joint][2]) * segments[best_joint][2]
                perpendicular = offset - parallel
                # perpendicular radius interpolates to `target` at full weight
                slim_factor = 1.0 - (1.0 - target) * best_weight
                co = anchor + parallel + perpendicular * slim_factor

            # 5. bust: push front-facing chest vertices along the detected forward axis
            chest_w = region["chest"]
            if chest_w > 0.15:
                horizontal = Vector((co.x - chest_center.x, co.y - chest_center.y, 0.0))
                frontness = horizontal.dot(Vector((forward.x, forward.y, 0.0)))
                if frontness > 0.0:
                    co += Vector((forward.x, forward.y, 0.0)) * params["chestForm"] * chest_w

            vertex.co = inverse @ co
        mesh.data.update()


def build_braid(context_material, armature, forward: Vector) -> bpy.types.Object:
    """A tapered braid skinned FULLY to the existing Head joint."""
    bone = armature.data.bones["Head"]
    head_top = armature.matrix_world @ bone.tail_local
    back = -forward
    name = "HF380_Braid"
    mesh = bpy.data.meshes.new(name)
    rings = 7
    segments = 10
    verts: list[tuple[float, float, float]] = []
    path = []
    radii = [0.085, 0.08, 0.072, 0.062, 0.05, 0.036, 0.02]
    for i in range(rings):
        t = i / (rings - 1)
        centre = (
            head_top
            + back * (0.16 + 0.22 * t)
            + Vector((back.x * 0.55 * t * t, back.y * 0.55 * t * t, 0.0))
            + Vector((0.0, 0.0, -0.62 * t - 0.06 * t * t))
        )
        path.append(centre)
    for i, centre in enumerate(path):
        radius = radii[i]
        for s in range(segments):
            angle = 2.0 * math.pi * s / segments
            offset = Vector((math.cos(angle), math.sin(angle), 0.0)) * radius
            p = centre + offset
            verts.append((p.x, p.y, p.z))
    faces = []
    for i in range(rings - 1):
        for s in range(segments):
            a = i * segments + s
            b = i * segments + (s + 1) % segments
            c = (i + 1) * segments + (s + 1) % segments
            d = (i + 1) * segments + s
            faces.append((a, b, c, d))
    tip = len(verts)
    last_centre = path[-1] + Vector((0.0, 0.0, -0.09))
    verts.append((last_centre.x, last_centre.y, last_centre.z))
    base = (rings - 1) * segments
    for s in range(segments):
        faces.append((base + s, base + (s + 1) % segments, tip))
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = armature
    obj.data.materials.append(context_material)
    group = obj.vertex_groups.new(name="Head")
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("HF380 braid skin binding", "ARMATURE")
    modifier.object = armature
    obj["asset_id"] = "hf380-distinct-silhouette-proof"
    obj["accessory_item"] = "braid"
    obj["skinned_joint"] = "Head"
    obj["presentation_only"] = True
    obj["opaque_pbr"] = True
    return obj


def verify_accessory_skinning(armature, accessories) -> None:
    bone_names = {bone.name for bone in armature.data.bones}
    for accessory in accessories:
        if accessory.modifiers.get("HF380 braid skin binding") is None:
            raise RuntimeError(f"accessory {accessory.name} lost its armature binding")
        group_names = {group.name for group in accessory.vertex_groups}
        if not group_names.issubset(bone_names):
            raise RuntimeError(f"accessory {accessory.name} references non-canonical joints")


def verify_distinctness(before: dict, after: dict) -> dict[str, float]:
    deltas = {}
    checks = (
        ("shoulderWidthM", "le", 0.93),   # frame visibly narrower
        ("waistWidthXM", "le", 0.90),     # waist visibly tighter
        ("waistDepthYM", "le", 0.94),     # waist tighter front-to-back too
        ("heightM", "ge", 0.88),          # stature 7..12% shorter
        ("heightM", "le", 0.95),
        ("thighMeanRadiusM", "le", 0.90), # legs visibly slimmer (measured -11%)
    )
    for key, sense, bound in checks:
        ratio = after[key] / before[key]
        deltas[key] = ratio
        failed = ratio > bound if sense == "le" else ratio < bound
        if failed:
            raise RuntimeError(
                f"distinctness gate FAILED: {key} ratio {ratio:.4f} violates "
                f"{'<=' if sense == 'le' else '>='} {bound} (before={before[key]:.4f} after={after[key]:.4f})"
            )
    # The character read lives in RATIOS: shoulders must narrow RELATIVE to
    # hips even though the hip band (thigh-dominated) also contracts.
    sh_before = before["shoulderWidthM"] / before["hipWidthXM"]
    sh_after = after["shoulderWidthM"] / after["hipWidthXM"]
    if sh_after > sh_before / 1.07:
        raise RuntimeError(
            f"distinctness gate FAILED: shoulderOverHip ratio {sh_after:.4f} did not "
            f"improve >=7% over {sh_before:.4f}"
        )
    deltas["shoulderOverHipImprovement"] = sh_before / sh_after
    return deltas


def silhouette_ratio_signature(before: dict, after: dict) -> dict[str, float]:
    """The character read lives in RATIOS, not absolute size."""
    def ratios(p: dict) -> dict[str, float]:
        return {
            "shoulderOverHip": p["shoulderWidthM"] / p["hipWidthXM"],
            "waistOverShoulder": p["waistWidthXM"] / p["shoulderWidthM"],
            "thighOverHip": p["thighMeanRadiusM"] / p["hipWidthXM"],
        }
    b, a = ratios(before), ratios(after)
    return {"before": b, "after": a}


def mute_all_tracks(armature) -> None:
    if armature.animation_data is None:
        return
    for track in armature.animation_data.nla_tracks:
        track.mute = True


def activate_track(armature, action_name: str, frame: int) -> None:
    found = False
    for track in armature.animation_data.nla_tracks:
        track.mute = track.name != action_name
        found = found or track.name == action_name
    if not found:
        raise RuntimeError(f"review action {action_name} missing")
    bpy.context.scene.frame_set(frame)


def look_at(obj, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_review_stage(label: str):
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    stage = bpy.context.object
    stage.name = f"HF380_{label}_Stage"
    material = bpy.data.materials.new(f"HF380_{label}_Stage_Material")
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    input_socket(bsdf, "Base Color").default_value = (0.018, 0.028, 0.038, 1.0)
    input_socket(bsdf, "Roughness").default_value = 0.55
    stage.data.materials.append(material)
    for name, location, energy, color, size in (
        ("HF380_Key", (-3.8, -3.2, 4.9), 1400, (0.72, 0.82, 1.0), 2.5),
        ("HF380_Rim", (3.4, 1.8, 3.5), 1100, (1.0, 0.62, 0.30), 2.0),
        ("HF380_Fill", (0.0, 4.0, 2.4), 700, (0.30, 0.44, 0.72), 2.8),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, 0, 1.0))
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = f"HF380_{label}_Camera"
    scene = bpy.context.scene
    scene.camera = camera
    for engine in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = REVIEW_SIZE
    scene.render.resolution_y = REVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.004, 0.007, 0.012)
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    return camera, scene


def render_views(camera, scene, armature, label: str, views) -> list[Path]:
    rendered: list[Path] = []
    for view_label, location, target, lens in views:
        mute_all_tracks(armature)
        armature.data.pose_position = "REST"
        scene.frame_set(1)
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        path = REVIEW_DIR / f"hf380-{label}-{view_label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)
    return rendered


def export_glb(armature, body_meshes, accessories, lod: int) -> Path:
    verify_canonical_rig(armature, body_meshes, f"lod{lod}-export")
    verify_accessory_skinning(armature, accessories)
    armature["lod"] = lod
    filepath = OUT_DIR / f"hf380-distinct-silhouette-explorer-lod{lod}.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [armature, *body_meshes, *accessories]:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.gltf(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=False,
        export_optimize_animation_size=True,
        export_tangents=True,
    )
    return filepath


def decimate_body(body_meshes, ratio: float) -> None:
    for body in body_meshes:
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = body
        body.select_set(True)
        modifier = body.modifiers.new("HF380 lod reduction", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        while body.modifiers.find(modifier.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        body.select_set(False)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    armature, body_meshes = import_and_prepare()

    regions = RegionWeights(body_meshes)
    forward = detect_forward(body_meshes)
    print(f"HF380_FORWARD_AXIS=({forward.x:.4f}, {forward.y:.4f}, {forward.z:.4f})")

    before = measure_profile(body_meshes, regions)
    print(f"HF380_PROFILE_BEFORE={json.dumps(before, sort_keys=True)}")

    camera, scene = setup_review_stage("Baseline")
    baseline_views = render_views(
        camera, scene, armature, "baseline",
        (
            ("front", (0.0, -4.35, 1.15), (0.0, 0.0, 0.92), 66),
            ("rear-quarter", (3.35, 3.15, 1.35), (0.0, 0.0, 0.95), 68),
            ("side", (4.35, 0.0, 1.15), (0.0, 0.0, 0.92), 66),
        ),
    )

    hair_material = None
    for mesh in body_meshes:
        for slot in mesh.material_slots:
            if slot.material and slot.material.name == HAIR_MATERIAL:
                hair_material = slot.material
                break
        if hair_material is not None:
            break
    if hair_material is None:
        raise RuntimeError(f"material {HAIR_MATERIAL} not found for braid")

    apply_distinct_silhouette(armature, body_meshes, PARAMS, forward)
    braid = build_braid(hair_material, armature, forward)
    accessories = [braid]

    after = measure_profile(body_meshes, regions, PARAMS["heightScale"])
    print(f"HF380_PROFILE_AFTER={json.dumps(after, sort_keys=True)}")
    deltas = verify_distinctness(before, after)
    signature = silhouette_ratio_signature(before, after)
    print(f"HF380_RATIO_SIGNATURE={json.dumps(signature, sort_keys=True)}")

    shaped_views = render_views(
        camera, scene, armature, "shaped",
        (
            ("front", (0.0, -4.35, 1.15), (0.0, 0.0, 0.92), 66),
            ("rear-quarter", (3.35, 3.15, 1.35), (0.0, 0.0, 0.95), 68),
            ("side", (4.35, 0.0, 1.15), (0.0, 0.0, 0.92), 66),
            ("run-action", (-3.15, -3.15, 1.10), (0.0, 0.0, 0.88), 62),
        ),
    )

    lod0 = export_glb(armature, body_meshes, accessories, 0)

    decimate_body(body_meshes, 0.70)
    lod1 = export_glb(armature, body_meshes, accessories, 1)

    joint_inventory = sorted(bone.name for bone in armature.data.bones)
    receipt = {
        "schemaVersion": 1,
        "purpose": "HF-380 blocking-prerequisite proof: ONE distinct character silhouette on the canonical 62-joint rig",
        "sourceGltf": str(SOURCE_GLTF.relative_to(ROOT)),
        "targetArchetypeId": "explorer",
        "rigContract": {"jointCount": JOINT_COUNT, "animationClipCount": CLIP_COUNT},
        "reshapeParams": PARAMS,
        "profileBefore": before,
        "profileAfter": after,
        "profileRatios": deltas,
        "silhouetteRatioSignature": signature,
        "detectedForwardAxis": [round(forward.x, 6), round(forward.y, 6), round(forward.z, 6)],
        "outputs": {
            "lod0": str(lod0.relative_to(ROOT)),
            "lod0Sha256": sha256_of(lod0),
            "lod1": str(lod1.relative_to(ROOT)),
            "lod1Sha256": sha256_of(lod1),
        },
        "baselineReviews": [str(p.relative_to(ROOT)) for p in baseline_views],
        "shapedReviews": [str(p.relative_to(ROOT)) for p in shaped_views],
        "newAccessories": [{"item": "braid", "joint": "Head", "material": HAIR_MATERIAL}],
        "notShipped": "public/assets and assets.manifest.json untouched; promotion is a separate reviewed step",
    }
    receipt_path = OUT_DIR / "hf380-distinct-silhouette-receipt.json"
    receipt_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"HF380_RECEIPT={receipt_path}")
    print("HF380_DISTINCT_SILHOUETTE_PROOF_COMPLETE")


main()
