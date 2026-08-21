"""Deterministically export the pinned Pass 69.3/Pass 70 manual arm master.

The manual .blend is the geometry/weight/socket authority. This script validates
that exact scene, renders bounded review frames, and exports LOD0/LOD1 without
rebuilding geometry from the frozen third-party source package.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
MASTER = ROOT / "source-assets/blender/pass69-3-first-person-operator-arms.blend"
OUTPUT_DIR = ROOT / "artifacts/blender-operator-arms/pass70-manual-master"
REVIEW_DIR = OUTPUT_DIR / "reviews"
LOD0_GLB = OUTPUT_DIR / "pass65-first-person-arms-lod0.glb"
LOD1_GLB = OUTPUT_DIR / "pass65-first-person-arms-lod1.glb"
RECEIPT = REVIEW_DIR / "pass69-3-first-person-arms-contact-receipt.json"
BASELINE_BLEND = ROOT / "source-assets/blender/pass65-first-person-operator-arms.blend"
BASELINE_RECEIPT = ROOT / "source-assets/blender/pass65-first-person-operator-arms-contact-receipt.json"
ARMATURE_NAME = "pass65-first-person-arms-skeleton-LOD0"
ROOT_NAME = "Pass65_FirstPersonArms_LOD0"
MESH_NAMES = (
    "Pass65_Arms_Batch_Sleeve",
    "Pass65_Arms_Batch_Glove",
    "Pass65_Arms_Batch_WristAccent",
    "Pass65_Arms_Batch_Skin",
)
CORE_ACTIONS = (
    "equip", "unequip", "idle", "walk", "sprint", "ads-in", "ads-out",
    "fire", "dry-fire", "reload", "empty-reload", "melee", "inspect",
)
REQUIRED_BONES = (
    "Root",
    "UpperArmR", "LowerArmR", "WristR",
    "Index1R", "Index2R", "Index3R", "Middle1R", "Middle2R", "Middle3R",
    "Ring1R", "Ring2R", "Ring3R", "Pinky1R", "Pinky2R", "Pinky3R",
    "Thumb1R", "Thumb2R", "Thumb3R",
    "UpperArmL", "LowerArmL", "WristL",
    "Index1L", "Index2L", "Index3L", "Middle1L", "Middle2L", "Middle3L",
    "Ring1L", "Ring2L", "Ring3L", "Pinky1L", "Pinky2L", "Pinky3L",
    "Thumb1L", "Thumb2L", "Thumb3L",
)
REQUIRED_CONTACTS = ("right-palm-contact", "left-palm-contact")
REQUIRED_MEANINGFUL_BONES = tuple(
    f"{name}{side}"
    for side in ("L", "R")
    for name in (
        "UpperArm", "LowerArm", "Wrist", "Thumb2", "Index2", "Middle2",
        "Ring2", "Pinky2",
    )
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def action_for(clip: str) -> bpy.types.Action:
    matches = [action for action in bpy.data.actions if action.name.startswith(f"Pass65Arms_{clip}__")]
    if len(matches) != 1:
        raise RuntimeError(f"manual master requires one {clip!r} action; found {[item.name for item in matches]}")
    return matches[0]


def reset_pose(armature: bpy.types.Object) -> None:
    if armature.animation_data is None:
        armature.animation_data_create()
    armature.animation_data.action = None
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    for bone in armature.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def set_action(armature: bpy.types.Object, clip: str | None, progress: float = 0.5) -> None:
    reset_pose(armature)
    if clip is None:
        return
    action = action_for(clip)
    armature.animation_data.action = action
    start, end = action.frame_range
    bpy.context.scene.frame_set(round(start + (end - start) * progress))
    bpy.context.view_layer.update()


def weight_metrics(meshes: list[bpy.types.Object]) -> dict:
    positive = {name: 0 for name in REQUIRED_MEANINGFUL_BONES}
    strong = {name: 0 for name in REQUIRED_MEANINGFUL_BONES}
    unweighted = 0
    non_normalized = 0
    over_four = 0
    total_vertices = 0
    blended_vertices = 0
    for obj in meshes:
        names = {group.index: group.name for group in obj.vertex_groups}
        for vertex in obj.data.vertices:
            total_vertices += 1
            active = [(names.get(item.group, ""), item.weight) for item in vertex.groups if item.weight > 1e-6]
            total = sum(weight for _name, weight in active)
            unweighted += int(total <= 1e-6)
            non_normalized += int(abs(total - 1.0) > 0.015)
            over_four += int(len(active) > 4)
            blended_vertices += int(sum(weight >= 0.05 for _name, weight in active) >= 2)
            for name, weight in active:
                if name in positive and weight >= 0.05:
                    positive[name] += 1
                if name in strong and weight >= 0.20:
                    strong[name] += 1
    missing = [name for name in REQUIRED_MEANINGFUL_BONES if positive[name] < 4 or strong[name] < 1]
    if unweighted or non_normalized or over_four or missing:
        raise RuntimeError(
            "manual master weighting failed "
            f"unweighted={unweighted} nonNormalized={non_normalized} overFour={over_four} missing={missing}"
        )
    return {
        "contract": "normalized-four-influence-meaningful-bone-evidence-v1",
        "vertices": total_vertices,
        "blendedVertices": blended_vertices,
        "unweightedVertices": unweighted,
        "nonNormalizedVertices": non_normalized,
        "verticesOverFourInfluences": over_four,
        "positiveWeightVertexCounts": positive,
        "strongWeightVertexCounts": strong,
        "passed": True,
    }


def authored_sleeve_geometry_metrics(
    sleeve: bpy.types.Object,
    armature: bpy.types.Object,
) -> dict:
    """Measure visible sleeve mass, not merely off-screen armature reach."""
    report = {}
    for side in ("L", "R"):
        bone = armature.data.bones[f"UpperArm{side}"]
        head = bone.head_local.copy()
        axis = (bone.tail_local - head).normalized()
        length = (bone.tail_local - head).length
        group = sleeve.vertex_groups.get(f"UpperArm{side}")
        samples = []
        if group is not None:
            for vertex in sleeve.data.vertices:
                weight = next((item.weight for item in vertex.groups if item.group == group.index), 0.0)
                if weight <= 0.05:
                    continue
                offset = vertex.co - head
                along = offset.dot(axis) / length
                radial = (offset - axis * offset.dot(axis)).length
                samples.append((along, radial))
        if not samples:
            raise RuntimeError(f"{side} sleeve has no weighted visible geometry")
        radii = sorted(radial for _along, radial in samples)
        entry = {
            "weightedVertices": len(samples),
            "minimumProximalT": round(min(along for along, _radial in samples), 6),
            "medianRadius": round(radii[len(radii) // 2], 6),
            "p90Radius": round(radii[min(len(radii) - 1, math.floor(len(radii) * 0.9))], 6),
        }
        if entry["minimumProximalT"] > -0.25 or entry["medianRadius"] < 6.4:
            raise RuntimeError(f"{side} authored sleeve silhouette contract failed: {entry}")
        report[side] = entry
    return {
        "contract": "authored-weighted-sleeve-mass-v1",
        "sides": report,
        "passed": True,
    }


def validate_master() -> tuple[bpy.types.Object, bpy.types.Object, list[bpy.types.Object], dict]:
    if Path(bpy.data.filepath).resolve() != MASTER.resolve():
        raise RuntimeError(f"exporter must open exact manual master {MASTER}; got {bpy.data.filepath}")
    if bpy.app.version_string != "5.1.2":
        raise RuntimeError(f"manual master requires Blender 5.1.2, got {bpy.app.version_string}")
    root = bpy.data.objects.get(ROOT_NAME)
    armature = bpy.data.objects.get(ARMATURE_NAME)
    meshes = [bpy.data.objects.get(name) for name in MESH_NAMES]
    if root is None or armature is None or armature.type != "ARMATURE" or any(obj is None for obj in meshes):
        raise RuntimeError("manual master hierarchy is incomplete")
    if set(bone.name for bone in armature.data.bones) != set(REQUIRED_BONES):
        raise RuntimeError("manual master 37-bone skeleton drift")
    if root.get("manual_master_contract") != "checked-in-editable-blend-export-only-v1":
        raise RuntimeError("manual master export-only authority marker missing")
    if root.get("visual_revision") != "pass73-authored-continuous-proximal-sleeves-v2":
        raise RuntimeError("manual master visual revision drift")
    if root.get("pass73_silhouette_patch") != "pass73-authored-continuous-proximal-sleeves-v2":
        raise RuntimeError("manual master Pass 73 silhouette patch marker missing")
    if root.get("limb_profile_contract") != "manual-thick-continuous-cuff-forearm-deformation-v2":
        raise RuntimeError("manual master Pass 73 thick limb profile contract missing")
    if root.get("shoulder_entry_contract") != "weighted-continuous-beyond-crop-sleeve-v3":
        raise RuntimeError("manual master Pass 73 beyond-crop sleeve contract missing")
    if root.get("material_contrast_contract") != "owned-basecolor-contrast-retone-v1":
        raise RuntimeError("manual master owned base-color contrast-retone marker missing")
    for obj in meshes:
        if obj.type != "MESH" or obj.hide_render or obj.hide_viewport:
            raise RuntimeError(f"{obj.name}: hidden or non-mesh owned render batch")
        if obj.matrix_world.determinant() <= 0:
            raise RuntimeError(f"{obj.name}: non-positive delivery determinant")
        modifiers = [modifier for modifier in obj.modifiers if modifier.type == "ARMATURE"]
        if len(modifiers) != 1 or modifiers[0].object != armature:
            raise RuntimeError(f"{obj.name}: expected one authoritative armature modifier")
        if len(obj.data.materials) != 1 or obj.data.materials[0].surface_render_method != "DITHERED":
            # Blender 5.1's DITHERED property exports as glTF OPAQUE when no alpha wiring exists.
            if len(obj.data.materials) != 1 or obj.data.materials[0].diffuse_color[3] < 0.999:
                raise RuntimeError(f"{obj.name}: visible material must remain opaque")
    contact_receipts = {}
    for name, side in zip(REQUIRED_CONTACTS, ("R", "L")):
        contact = bpy.data.objects.get(name)
        if contact is None or contact.type != "EMPTY" or contact.parent != armature:
            raise RuntimeError(f"{name}: missing authored palm contact")
        if contact.parent_type != "BONE" or contact.parent_bone != f"Wrist{side}":
            raise RuntimeError(f"{name}: palm contact must be parented below Wrist{side}")
        rotation = contact.matrix_world.to_quaternion()
        rotation_length = math.sqrt(sum(value * value for value in rotation))
        if abs(rotation_length - 1.0) > 1e-5 or contact.matrix_world.determinant() <= 0:
            raise RuntimeError(f"{name}: palm contact transform is invalid")
        contact_receipts[name] = {
            "parentBone": contact.parent_bone,
            "translation": [round(value, 8) for value in contact.matrix_world.translation],
            "quaternion": [round(rotation.x, 8), round(rotation.y, 8), round(rotation.z, 8), round(rotation.w, 8)],
            "forwardAxis": contact.get("palm_forward_axis"),
            "upAxis": contact.get("palm_up_axis"),
            "determinant": contact.matrix_world.determinant(),
        }
    for clip in CORE_ACTIONS:
        action_for(clip)
    return root, armature, meshes, {
        "masterSha256": sha256(MASTER),
        "baselineBlendSha256": sha256(BASELINE_BLEND),
        "baselineContactReceiptSha256": sha256(BASELINE_RECEIPT),
        "meshVertices": {obj.name: len(obj.data.vertices) for obj in meshes},
        "meshTriangles": {
            obj.name: sum(len(polygon.vertices) - 2 for polygon in obj.data.polygons)
            for obj in meshes
        },
        "bones": len(armature.data.bones),
        "clips": list(CORE_ACTIONS),
        "palmContacts": contact_receipts,
        "weighting": weight_metrics(meshes),
        "authoredSleeveGeometry": authored_sleeve_geometry_metrics(
            bpy.data.objects["Pass65_Arms_Batch_Sleeve"],
            armature,
        ),
    }


def owned_hierarchy(root: bpy.types.Object) -> list[bpy.types.Object]:
    owned = [obj for obj in bpy.data.objects if obj.get("pass65_asset_root") == ROOT_NAME]
    return list(dict.fromkeys([root, *root.children_recursive, *owned]))


def export_glb(root: bpy.types.Object, output: Path) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    selected = owned_hierarchy(root)
    for obj in selected:
        obj.hide_render = False
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB", use_selection=True,
        export_yup=True, export_apply=False, export_materials="EXPORT",
        export_cameras=False, export_lights=False, export_extras=True,
        export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=False, export_optimize_animation_size=True,
        export_tangents=True,
    )


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_review_stage() -> bpy.types.Object:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 800
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.014, 0.022)
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Pass70_ManualArms_ReviewCamera"
    camera.data.lens = 54
    scene.camera = camera
    for name, location, energy, size, color in (
        ("Pass70_Key", (2.4, -1.8, 2.5), 1450, 2.4, (0.70, 0.88, 1.0)),
        ("Pass70_Fill", (-2.6, -1.0, 1.2), 850, 2.0, (0.22, 0.52, 0.72)),
        ("Pass70_Rim", (0.0, 2.5, 2.2), 1100, 1.8, (0.15, 0.92, 0.78)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = location
        look_at(light, Vector((0.0, 0.0, 0.0)))
    return camera


def render_review(camera: bpy.types.Object, label: str, location: tuple[float, float, float], target: tuple[float, float, float], lens: float) -> dict:
    camera.location = location
    camera.data.lens = lens
    look_at(camera, Vector(target))
    output = REVIEW_DIR / f"pass69-3-first-person-arms-{label}.png"
    bpy.context.scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    return {
        "id": label,
        "viewport": [800, 800],
        "cameraLocation": [round(value, 6) for value in location],
        "cameraTarget": [round(value, 6) for value in target],
        "lensMm": lens,
    }


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
REVIEW_DIR.mkdir(parents=True, exist_ok=True)
root, armature, meshes, audit = validate_master()
reset_pose(armature)
export_glb(root, LOD0_GLB)
lod0_sha256 = sha256(LOD0_GLB)

camera = add_review_stage()
reviews = []
set_action(armature, None)
reviews.append(render_review(camera, "neutral-front", (0.0, 2.35, -0.05), (0.0, 0.58, -0.52), 54))
reviews.append(render_review(camera, "forearm-wrist-quarter", (0.92, 1.74, 0.02), (0.06, 0.73, -0.56), 70))
reviews.append(render_review(camera, "hand-anatomy-closeup", (0.66, 1.48, -0.22), (0.15, 0.82, -0.55), 78))
set_action(armature, "reload", 0.46)
reviews.append(render_review(camera, "reload-cuff-flex", (0.64, 1.50, -0.18), (0.13, 0.83, -0.55), 76))
set_action(armature, "fire", 0.55)
reviews.append(render_review(camera, "firing-digit-separation", (-0.62, 1.62, -0.18), (-0.15, 1.02, -0.55), 78))
reset_pose(armature)

lod0_triangles = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)
for obj in meshes:
    modifier = next(item for item in obj.modifiers if item.type == "ARMATURE")
    obj.modifiers.remove(modifier)
    decimate = obj.modifiers.new("Pass70 manual-master LOD1", "DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = 0.82 if obj.name.endswith("Skin") else 0.78
    decimate.use_collapse_triangulate = True
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=decimate.name)
    skin = obj.modifiers.new("Pass70 manual arms skin", "ARMATURE")
    skin.object = armature
    obj["quality_tier"] = "LOD1"
root["quality_tier"] = "LOD1"
lod1_triangles = sum(sum(len(poly.vertices) - 2 for poly in obj.data.polygons) for obj in meshes)
if not 0 < lod1_triangles < lod0_triangles:
    raise RuntimeError(f"manual LOD triangle reduction failed {lod0_triangles}->{lod1_triangles}")
root["delivery_triangle_count"] = lod1_triangles
root["lod_reduction_ratio"] = lod1_triangles / lod0_triangles
export_glb(root, LOD1_GLB)
lod1_sha256 = sha256(LOD1_GLB)

receipt = {
    "schemaVersion": 1,
    "id": "pass69-3-first-person-arms-manual-master-v1",
    "verdict": "pass",
    "blenderVersion": bpy.app.version_string,
    "manualMaster": str(MASTER.relative_to(ROOT)).replace("\\", "/"),
    "audit": audit,
    "lods": {
        "lod0": {"path": str(LOD0_GLB.relative_to(ROOT)).replace("\\", "/"), "triangles": lod0_triangles, "sha256": lod0_sha256},
        "lod1": {"path": str(LOD1_GLB.relative_to(ROOT)).replace("\\", "/"), "triangles": lod1_triangles, "sha256": lod1_sha256},
    },
    "review": reviews,
    "retainedWeaponContactBaseline": {
        "blendSha256": sha256(BASELINE_BLEND),
        "receiptSha256": sha256(BASELINE_RECEIPT),
        "scope": "Retained seven-view weapon-contact evidence; Pass 70 native runtime gates revalidate current sockets and actions.",
    },
    "authorityBoundary": "Presentation mesh, weights, palm frames and clips only; TypeScript retains IK reach, weapon sockets, rays, timing, collision and networking.",
    "violations": [],
}
RECEIPT.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
print(
    "PASS69_3_MANUAL_ARMS_EXPORT_READY",
    f"master={audit['masterSha256']}",
    f"lod0Triangles={lod0_triangles}",
    f"lod1Triangles={lod1_triangles}",
    f"reviews={len(reviews)}",
)
