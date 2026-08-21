"""Apply the reproducible Pass 73 silhouette correction to the manual arm master.

This edits the shipped skinned sleeve vertices in the checked-in .blend. It
does not add runtime proxy geometry or alter bones, contacts, weights, clips or
weapon sockets.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "source-assets/blender/pass69-3-first-person-operator-arms.blend"
ROOT_NAME = "Pass65_FirstPersonArms_LOD0"
ARMATURE_NAME = "pass65-first-person-arms-skeleton-LOD0"
SLEEVE_NAME = "Pass65_Arms_Batch_Sleeve"
ACCENT_NAME = "Pass65_Arms_Batch_WristAccent"
PREVIOUS_PATCH_CONTRACT = "pass73-authored-continuous-proximal-sleeves-v1"
PATCH_CONTRACT = "pass73-authored-continuous-proximal-sleeves-v2"
LIMB_PROFILE_CONTRACT = "manual-thick-continuous-cuff-forearm-deformation-v2"
SHOULDER_ENTRY_CONTRACT = "weighted-continuous-beyond-crop-sleeve-v3"
PROXIMAL_EXTENSION_UNITS = 24.0
PROXIMAL_FULL_WEIGHT_T = 0.36
PROXIMAL_ZERO_WEIGHT_T = 0.62


def bone_segment(armature: bpy.types.Object, name: str) -> tuple[Vector, Vector]:
    bone = armature.data.bones[name]
    return bone.head_local.copy(), bone.tail_local.copy()


def closest_on_segment(point: Vector, start: Vector, end: Vector) -> tuple[Vector, float]:
    delta = end - start
    length_squared = delta.length_squared
    t = 0.0 if length_squared <= 1e-12 else max(0.0, min(1.0, (point - start).dot(delta) / length_squared))
    return start + delta * t, t


def group_weight(obj: bpy.types.Object, vertex: bpy.types.MeshVertex, name: str) -> float:
    group = obj.vertex_groups.get(name)
    if group is None:
        return 0.0
    return next((item.weight for item in vertex.groups if item.group == group.index), 0.0)


def dominant_side(obj: bpy.types.Object, vertex: bpy.types.MeshVertex) -> str:
    weights = {
        side: sum(group_weight(obj, vertex, f"{prefix}{side}") for prefix in ("UpperArm", "LowerArm", "Wrist"))
        for side in ("L", "R")
    }
    if weights["L"] == weights["R"]:
        return "L" if vertex.co.x >= 0 else "R"
    return max(weights, key=weights.get)


def smooth_falloff(value: float, full: float, zero: float) -> float:
    if value <= full:
        return 1.0
    if value >= zero:
        return 0.0
    progress = (value - full) / (zero - full)
    return 1.0 - progress * progress * (3.0 - 2.0 * progress)


def sleeve_metrics(obj: bpy.types.Object, armature: bpy.types.Object) -> dict:
    report = {}
    for side in ("L", "R"):
        head, tail = bone_segment(armature, f"UpperArm{side}")
        axis = (tail - head).normalized()
        length = (tail - head).length
        samples = []
        for vertex in obj.data.vertices:
            weight = group_weight(obj, vertex, f"UpperArm{side}")
            if weight <= 0.05:
                continue
            offset = vertex.co - head
            along = offset.dot(axis) / length
            radial = (offset - axis * offset.dot(axis)).length
            samples.append((along, radial))
        samples.sort()
        radii = sorted(radial for _along, radial in samples)
        report[side] = {
            "vertices": len(samples),
            "minimumProximalT": round(samples[0][0], 6),
            "medianRadius": round(radii[len(radii) // 2], 6),
            "p90Radius": round(radii[min(len(radii) - 1, math.floor(len(radii) * 0.9))], 6),
        }
    return report


def reshape_sleeve(
    obj: bpy.types.Object,
    armature: bpy.types.Object,
    *,
    radial: bool,
    extension_units: float,
) -> None:
    segments = {
        side: {
            prefix: bone_segment(armature, f"{prefix}{side}")
            for prefix in ("UpperArm", "LowerArm", "Wrist")
        }
        for side in ("L", "R")
    }
    radial_scale = {
        "L": {"UpperArm": 1.22, "LowerArm": 1.20, "Wrist": 1.10},
        "R": {"UpperArm": 1.30, "LowerArm": 1.26, "Wrist": 1.12},
    }
    for vertex in obj.data.vertices:
        side = dominant_side(obj, vertex)
        candidates = []
        for prefix, (start, end) in segments[side].items():
            centre, _t = closest_on_segment(vertex.co, start, end)
            candidates.append(((vertex.co - centre).length_squared, prefix, centre))
        _distance, prefix, centre = min(candidates, key=lambda item: item[0])
        if radial:
            vertex.co = centre + (vertex.co - centre) * radial_scale[side][prefix]

        upper_head, upper_tail = segments[side]["UpperArm"]
        upper_axis = (upper_tail - upper_head).normalized()
        upper_length = (upper_tail - upper_head).length
        upper_t = (vertex.co - upper_head).dot(upper_axis) / upper_length
        upper_weight = group_weight(obj, vertex, f"UpperArm{side}")
        if upper_weight > 0.25:
            falloff = smooth_falloff(upper_t, PROXIMAL_FULL_WEIGHT_T, PROXIMAL_ZERO_WEIGHT_T)
            vertex.co -= upper_axis * (extension_units * falloff)
    obj.data.update()


def thicken_wrist_accents(obj: bpy.types.Object, armature: bpy.types.Object) -> None:
    for vertex in obj.data.vertices:
        side = dominant_side(obj, vertex)
        segments = [bone_segment(armature, f"LowerArm{side}"), bone_segment(armature, f"Wrist{side}")]
        centres = [closest_on_segment(vertex.co, start, end)[0] for start, end in segments]
        centre = min(centres, key=lambda point: (vertex.co - point).length_squared)
        vertex.co = centre + (vertex.co - centre) * (1.10 if side == "L" else 1.12)
    obj.data.update()


if Path(bpy.data.filepath).resolve() != MASTER.resolve():
    raise RuntimeError(f"Pass 73 patch must open {MASTER}; got {bpy.data.filepath}")
if bpy.app.version_string != "5.1.2":
    raise RuntimeError(f"Pass 73 patch requires Blender 5.1.2; got {bpy.app.version_string}")

root = bpy.data.objects[ROOT_NAME]
armature = bpy.data.objects[ARMATURE_NAME]
sleeve = bpy.data.objects[SLEEVE_NAME]
accent = bpy.data.objects[ACCENT_NAME]
geometry_changed = root.get("pass73_silhouette_patch") != PATCH_CONTRACT
if geometry_changed:
    before = sleeve_metrics(sleeve, armature)
    previous_contract = root.get("pass73_silhouette_patch")
    previous_extension = float(root.get("pass73_proximal_extension_units", 0.0))
    if previous_contract == PREVIOUS_PATCH_CONTRACT:
        # Upgrade the checked-in v1 master without applying the radial scale a
        # second time. A pristine pre-Pass73 master takes the full correction.
        reshape_sleeve(
            sleeve,
            armature,
            radial=False,
            extension_units=PROXIMAL_EXTENSION_UNITS - previous_extension,
        )
    else:
        reshape_sleeve(sleeve, armature, radial=True, extension_units=PROXIMAL_EXTENSION_UNITS)
        thicken_wrist_accents(accent, armature)
else:
    before = None

metadata = {
    "pass73_silhouette_patch": PATCH_CONTRACT,
    "visual_revision": PATCH_CONTRACT,
    "limb_profile_contract": LIMB_PROFILE_CONTRACT,
    "shoulder_entry_contract": SHOULDER_ENTRY_CONTRACT,
    "pass73_proximal_extension_units": PROXIMAL_EXTENSION_UNITS,
    "pass73_sleeve_radial_scale": "L:1.22/1.20/1.10;R:1.30/1.26/1.12",
}
metadata_changed = any(root.get(key) != value for key, value in metadata.items())
for key, value in metadata.items():
    root[key] = value
if geometry_changed or metadata_changed:
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER), check_existing=False)

after = sleeve_metrics(sleeve, armature)
for side in ("L", "R"):
    if after[side]["minimumProximalT"] > -0.25:
        raise RuntimeError(f"{side} authored sleeve does not extend beyond its shoulder: {after[side]}")
    if after[side]["medianRadius"] < 6.4:
        raise RuntimeError(f"{side} authored sleeve remains too thin: {after[side]}")
print("PASS73_ARM_PATCH=" + json.dumps({
    "contract": PATCH_CONTRACT,
    "before": before,
    "after": after,
    "saved": str(MASTER),
}, sort_keys=True))
