"""Author the Pass 74 operator archetype skins over the canonical rigged operator.

The checked-in specification (pass74-operator-skin-specs.json) controls three
project-original archetypes (Sunspire Wayfarer, Carapace Bulwark, Tidewrack
Operative). Each archetype imports the SAME vendored CC0 Quaternius SWAT source
the Pass 65 third-person operator script imports and then:

- keeps the 62-joint skeleton, bone names, skin-weight vertex groups and all 24
  animation clips COMPLETELY UNTOUCHED (verified fail-closed before every
  export);
- applies the spec's bounded bind-pose proportion edits as vertex-group-masked
  displacement of the rest-pose mesh only (shoulder width, torso bulk, limb
  thickness), never touching armature data;
- adds spec-listed accessories skinned with full-weight vertex groups to
  EXISTING canonical joints only (no new bones, sockets or drivers);
- regenerates archetype PBR maps from the spec's texture formula parameters
  while restyling ONLY the four canonical materials Skin/Swat/Swat_Black/Visor
  in place (names are immutable; team tinting binds to them);
- clamps the composed silhouette (body + accessories) to the archetype's
  maxSilhouetteScale hit-proxy envelope rather than exceeding it;
- exports LOD0-2 GLBs to artifacts/blender-operator-skins/raw/
  pass74-operator-skin-<id>-lod{0,1,2}.glb plus deterministic review renders
  and a JSON receipt per archetype.

A single archetype can be built alone with:
  blender --background --factory-startup --python-exit-code 1 \
      --python scripts/blender/create-pass74-operator-archetype-skins.py -- \
      --archetype <id>
Omitting --archetype (or passing --archetype all) builds every archetype in the
spec. Gameplay hit proxies, damage, movement and weapon authority remain
TypeScript-owned.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Euler, Vector


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "source-assets/blender/pass74-operator-skin-specs.json"
SOURCE_GLTF = ROOT / "public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf"
BLEND_DIR = ROOT / "source-assets/blender"
RAW_DIR = ROOT / "artifacts/blender-operator-skins/raw"
REVIEW_ROOT = ROOT / "artifacts/blender-operator-skins/reviews"
TEXTURE_ROOT = ROOT / "public/assets/original/textures/operators/pass74-operator-skins"
ASSET_FAMILY_ID = "pass74-project-original-operator-skin-corpus-v1"
TEXTURE_SIZE = 512
REVIEW_SIZE = 640
MATERIAL_NAMES = ("Skin", "Swat", "Swat_Black", "Visor")
REQUIRED_ACTIONS = (
    "Idle_Gun_Pointing", "Idle_Gun", "Walk", "Run", "Run_Shoot",
    "Gun_Shoot", "HitRecieve", "HitRecieve_2", "Death", "Punch_Right",
)
TORSO_MASK_GROUPS = ("Hips", "Abdomen", "Torso", "Chest")
SHOULDER_MASK_GROUPS = (
    "Shoulder.L", "UpperArm.L", "Shoulder.R", "UpperArm.R",
)
LIMB_JOINTS = (
    "LowerArm.L", "Wrist.L",
    "Index1.L", "Index2.L", "Index3.L", "Index4.L",
    "Middle1.L", "Middle2.L", "Middle3.L", "Middle4.L",
    "Ring1.L", "Ring2.L", "Ring3.L", "Ring4.L",
    "Pinky1.L", "Pinky2.L", "Pinky3.L", "Pinky4.L",
    "Thumb1.L", "Thumb2.L", "Thumb3.L",
    "LowerArm.R", "Wrist.R",
    "Index1.R", "Index2.R", "Index3.R", "Index4.R",
    "Middle1.R", "Middle2.R", "Middle3.R", "Middle4.R",
    "Ring1.R", "Ring2.R", "Ring3.R", "Ring4.R",
    "Pinky1.R", "Pinky2.R", "Pinky3.R", "Pinky4.R",
    "Thumb1.R", "Thumb2.R", "Thumb3.R",
    "UpperLeg.L", "LowerLeg.L", "Foot.L", "PT.L",
    "UpperLeg.R", "LowerLeg.R", "Foot.R", "PT.R",
)

SPEC = json.loads(SPEC_PATH.read_text(encoding="utf-8"))

for directory in (BLEND_DIR, RAW_DIR, REVIEW_ROOT, TEXTURE_ROOT):
    directory.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def requested_archetypes() -> list[dict]:
    tokens = sys.argv[1:]
    values: list[str] = []
    index = 0
    while index < len(tokens):
        token = tokens[index]
        if token == "--archetype":
            index += 1
            if index >= len(tokens):
                raise RuntimeError("--archetype requires an archetype id value")
            values.append(tokens[index])
        elif token.startswith("--archetype="):
            values.append(token.split("=", 1)[1])
        index += 1
    known_ids = [operator["id"] for operator in SPEC["operators"]]
    if not values or values == ["all"]:
        return list(SPEC["operators"])
    if len(values) != 1:
        raise RuntimeError("--archetype accepts exactly one archetype id (or 'all')")
    wanted = values[0]
    if wanted not in known_ids:
        raise RuntimeError(f"unknown --archetype {wanted!r}; known ids: {', '.join(known_ids)}")
    return [operator for operator in SPEC["operators"] if operator["id"] == wanted]


def validate_spec() -> dict:
    if SPEC.get("schemaVersion") != 1:
        raise RuntimeError("unexpected pass74 operator skin spec schemaVersion")
    if SPEC.get("assetFamilyId") != ASSET_FAMILY_ID:
        raise RuntimeError("unexpected pass74 operator skin spec assetFamilyId")
    contract = SPEC.get("canonicalRigContract")
    if not isinstance(contract, dict):
        raise RuntimeError("pass74 spec is missing canonicalRigContract")
    if tuple(contract.get("materialNames", ())) != MATERIAL_NAMES:
        raise RuntimeError("canonical material name contract drifted from Skin/Swat/Swat_Black/Visor")
    if not SPEC.get("operators"):
        raise RuntimeError("pass74 spec declares no operators")
    return contract


CONTRACT = validate_spec()


def reset() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras,
        bpy.data.lights, bpy.data.actions, bpy.data.images, bpy.data.armatures,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def input_socket(node: bpy.types.Node, *names: str):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    raise RuntimeError(f"missing shader input {names}")


def clamp01(value: float) -> float:
    return max(0.0, min(1.0, value))


def deterministic_noise(x: int, y: int, seed: int) -> float:
    value = (x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)
    value ^= value >> 13
    value *= 1274126177
    value ^= value >> 16
    return (value & 0xFFFF) / 65535.0


def hex_rgb(value: str) -> tuple[float, float, float]:
    if len(value) != 6:
        raise RuntimeError(f"palette colour must be 6 hex digits: {value!r}")
    return tuple(int(value[index:index + 2], 16) / 255.0 for index in (0, 2, 4))


def mix_rgb(first, second, amount: float):
    return tuple(first[i] * (1.0 - amount) + second[i] * amount for i in range(3))


def archetype_context(archetype: dict) -> dict:
    identifier = archetype["id"]
    proportions = archetype["proportions"]
    formula = archetype["textureFormula"]
    bounds = CONTRACT["proportionBounds"]
    texture_bounds = CONTRACT["textureFormulaBounds"]
    for key, limit in bounds.items():
        low, high = limit
        if not low <= float(proportions[key]) <= high:
            raise RuntimeError(f"{identifier}: {key}={proportions[key]} outside contract bounds {limit}")
    for key, limit in texture_bounds.items():
        low, high = limit
        if not low <= float(formula[key]) <= high:
            raise RuntimeError(f"{identifier}: textureFormula.{key}={formula[key]} outside bounds {limit}")
    if float(archetype["maxSilhouetteScale"]) < 1.0:
        raise RuntimeError(f"{identifier}: maxSilhouetteScale below the unmodified source silhouette")
    palette = {channel: hex_rgb(archetype["palette"][channel]) for channel in ("primary", "secondary", "accent")}
    inventory = set(CONTRACT["jointInventory"])
    for accessory in archetype["accessories"]:
        unknown = sorted(set(accessory["skinToJoints"]) - inventory)
        if unknown:
            raise RuntimeError(f"{identifier}: accessory {accessory['item']} skins to unknown joints {unknown}")
    return {
        "archetype": archetype,
        "id": identifier,
        "camel": "".join(part.capitalize() for part in identifier.split("-")),
        "asset_id": f"pass74-operator-skin-{identifier}",
        "design_id": archetype["designId"],
        "display_name": archetype["displayName"],
        "proportions": {key: float(value) for key, value in proportions.items()},
        "formula": {key: float(value) for key, value in formula.items()},
        "palette_rgb": palette,
        "seed": sum((index + 1) * ord(character) for index, character in enumerate(archetype["designId"])) % 99991,
        "silhouette_cap": float(archetype["maxSilhouetteScale"]),
    }


def texture_sample(context: dict, material_name: str, kind: str, x: int, y: int) -> tuple[float, float, float]:
    formula = context["formula"]
    palette = context["palette_rgb"]
    seed = context["seed"]
    noise_scale = formula["noiseScale"]
    wear = formula["wearAmount"]
    roughness_bias = formula["roughnessBias"]
    material_index = MATERIAL_NAMES.index(material_name)
    u = x / (TEXTURE_SIZE - 1)
    v = y / (TEXTURE_SIZE - 1)
    noise = deterministic_noise(x, y, material_index + 1 + seed % 997)
    scuff = deterministic_noise(y, x, 4000 + seed % 8923)
    weave_frequency = 0.20 + 0.052 * noise_scale
    weave = 0.5 + 0.5 * math.sin((x + y * 1.7) * weave_frequency) * math.sin((y - x * 0.65) * weave_frequency * 0.85)
    cell_x = x % 128
    cell_y = y % 128
    seam_distance = min(cell_x, cell_y, 127 - cell_x, 127 - cell_y)
    seam = seam_distance < 3
    edge_wear = min(1.0, seam_distance / 16.0)

    if material_name == "Skin":
        if kind == "baseColor":
            freckle = -0.055 if noise > 0.982 else 0.0
            weathering = wear * 0.06 * (noise - 0.5)
            warm = 0.56 + (noise - 0.5) * 0.045 + freckle - weathering
            colour = (warm, warm * 0.69, warm * 0.48)
            if wear > 0.0:
                colour = mix_rgb(colour, palette["accent"], wear * 0.05 * noise)
            return tuple(clamp01(component) for component in colour)
        if kind == "normal":
            return 0.5 + (noise - 0.5) * 0.022, 0.5 + (weave - 0.5) * 0.012, 0.999
        if kind == "roughness":
            value = 0.58 + noise * 0.12 + roughness_bias * 0.5 + wear * 0.04
            return clamp01(value), clamp01(value), clamp01(value)
        return 0.0, 0.0, 0.0

    if material_name == "Swat":
        panel = (0.08 < u < 0.46 and 0.55 < v < 0.91) or (0.61 < u < 0.9 and 0.12 < v < 0.42)
        if kind == "baseColor":
            shade = 0.72 + (weave - 0.5) * 0.12 + (noise - 0.5) * 0.035
            colour = [component * shade for component in palette["primary"]]
            if panel:
                colour = mix_rgb(colour, palette["secondary"], 0.45)
            if seam:
                seam_factor = 1.0 - (0.22 + 0.38 * wear)
                colour = [component * seam_factor for component in colour]
            if ((x * 17 + y * 73 + seed) % 997) < 3:
                colour = mix_rgb(colour, palette["accent"], 0.55)
            if wear > 0.0 and scuff > 1.0 - wear * 0.05:
                colour = [component + 0.05 for component in colour]
            return tuple(clamp01(component) for component in colour)
        if kind == "normal":
            amplitude = 0.032 * (0.6 + 0.4 * min(2.0, noise_scale / 6.0))
            seam_push = 0.10 if seam else 0.0
            return 0.5 + (weave - 0.5) * amplitude, 0.5 + seam_push + (noise - 0.5) * 0.022, 0.996
        if kind == "roughness":
            value = 0.74 + noise * 0.18 - (0.10 if seam else 0.0) * (0.5 + wear) + roughness_bias
            return clamp01(value), clamp01(value), clamp01(value)
        metal = 0.018 + noise * 0.012
        return metal, metal, metal

    if material_name == "Swat_Black":
        plate = ((x // 64) + (y // 64)) % 3 == 0
        if kind == "baseColor":
            base = (0.47 if plate else 0.61) + (noise - 0.5) * 0.06
            base *= 0.70 + edge_wear * 0.30 * (0.4 + wear)
            if seam:
                base *= 1.0 - (0.18 + 0.30 * wear)
            colour = [base * component for component in palette["secondary"]]
            if scuff > 0.995:
                colour = mix_rgb(colour, palette["accent"], 0.35)
            return tuple(clamp01(component) for component in colour)
        if kind == "normal":
            strength = 0.018 if plate else 0.055
            return 0.5 + (noise - 0.5) * strength, 0.5 + (weave - 0.5) * strength, 0.998
        if kind == "roughness":
            value = (0.44 if plate else 0.76) + noise * 0.12 + roughness_bias
            return clamp01(value), clamp01(value), clamp01(value)
        value = 0.16 if plate else 0.028
        return value, value, value

    # The visor remains fully opaque but gains a coherent reflective response.
    scanline = 0.05 if y % 32 < 2 else 0.0
    if kind == "baseColor":
        base = (0.08 + scanline, 0.34 + scanline, 0.42 + scanline)
        colour = mix_rgb(base, palette["accent"], 0.16)
        return tuple(clamp01(component) for component in colour)
    if kind == "normal":
        return 0.5 + (noise - 0.5) * 0.008, 0.5, 1.0
    if kind == "roughness":
        value = clamp01(0.16 + noise * 0.09 + roughness_bias * 0.5)
        return value, value, value
    value = 0.52 + noise * 0.08
    return value, value, value


def make_texture(context: dict, material_name: str, kind: str) -> bpy.types.Image:
    slug = material_name.lower().replace("_", "-")
    directory = TEXTURE_ROOT / context["id"]
    directory.mkdir(parents=True, exist_ok=True)
    image_name = f"Pass74_OperatorSkin_{context['camel']}_{material_name}_{kind}"
    image = bpy.data.images.new(image_name, width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True)
    pixels: list[float] = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            value = texture_sample(context, material_name, kind, x, y)
            index = (y * TEXTURE_SIZE + x) * 4
            pixels[index:index + 4] = [*value, 1.0]
    image.colorspace_settings.name = "Non-Color" if kind in {"normal", "roughness", "metallic"} else "sRGB"
    image.alpha_mode = "STRAIGHT"
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(directory / f"pass74-operator-skin-{context['id']}-{slug}-{kind}.png")
    image.save()
    image.pack()
    return image


def configure_material(material: bpy.types.Material, images: dict[str, bpy.types.Image], context: dict) -> None:
    material.use_nodes = True
    material.diffuse_color[3] = 1.0
    material.use_backface_culling = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    input_socket(bsdf, "Base Color").default_value = (1.0, 1.0, 1.0, 1.0)
    input_socket(bsdf, "Alpha").default_value = 1.0
    input_socket(bsdf, "Roughness").default_value = 0.72
    input_socket(bsdf, "Metallic").default_value = 0.02

    for kind, target in (("baseColor", "Base Color"), ("roughness", "Roughness"), ("metallic", "Metallic")):
        texture = nodes.new("ShaderNodeTexImage")
        texture.name = f"Pass74 OperatorSkin {context['id']} {material.name} {kind}"
        texture.image = images[kind]
        links.new(texture.outputs["Color"], input_socket(bsdf, target))

    normal_texture = nodes.new("ShaderNodeTexImage")
    normal_texture.name = f"Pass74 OperatorSkin {context['id']} {material.name} normal"
    normal_texture.image = images["normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.7 if material.name != "Visor" else 0.24
    links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(bsdf, "Normal"))

    # Names stay immutable (team tinting binds to them); only styling changes.
    material["pass74_asset_id"] = context["asset_id"]
    material["pass74_design_id"] = context["design_id"]
    material["opaque_depth_writing"] = True
    material["pbr_map_contract"] = "baseColor+normal+roughness+metallic"


def verify_canonical_rig(armature: bpy.types.Object, body_meshes: list[bpy.types.Object], stage: str) -> None:
    bones = armature.data.bones
    if len(bones) != CONTRACT["jointCount"]:
        raise RuntimeError(f"[{stage}] canonical joint count drifted: {len(bones)} != {CONTRACT['jointCount']}")
    bone_names = {bone.name for bone in bones}
    inventory = set(CONTRACT["jointInventory"])
    if bone_names != inventory:
        raise RuntimeError(
            f"[{stage}] canonical bone inventory drifted: "
            f"missing={sorted(inventory - bone_names)} extra={sorted(bone_names - inventory)}"
        )
    if len(bpy.data.actions) != CONTRACT["animationClipCount"]:
        raise RuntimeError(
            f"[{stage}] canonical clip count drifted: {len(bpy.data.actions)} != {CONTRACT['animationClipCount']}"
        )
    for action_name in REQUIRED_ACTIONS:
        if bpy.data.actions.get(action_name) is None:
            raise RuntimeError(f"[{stage}] required source animation {action_name} missing")
    for body in body_meshes:
        if not body.vertex_groups:
            raise RuntimeError(f"[{stage}] {body.name} lost its retained skin weights")
        for slot in body.material_slots:
            if slot.material is None or slot.material.name not in MATERIAL_NAMES:
                raise RuntimeError(f"[{stage}] {body.name} carries non-canonical material")


def import_and_prepare(context: dict) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    reset()
    bpy.ops.import_scene.gltf(filepath=str(SOURCE_GLTF))
    armature = bpy.data.objects.get("CharacterArmature")
    if armature is None or armature.type != "ARMATURE":
        raise RuntimeError("Quaternius SWAT armature was not imported")

    embedded_pistol = bpy.data.objects.get("Pistol")
    if embedded_pistol is None:
        raise RuntimeError("source pistol removal contract cannot be verified")
    bpy.data.objects.remove(embedded_pistol, do_unlink=True)

    body_objects = [bpy.data.objects.get(name) for name in ("Swat_Body", "Swat_Feet", "Swat_Head", "Swat_Legs")]
    if any(obj is None or obj.type != "MESH" for obj in body_objects):
        raise RuntimeError("complete source SWAT body mesh family was not imported")
    body_meshes = [obj for obj in body_objects if obj is not None]

    for material_name in MATERIAL_NAMES:
        material = bpy.data.materials.get(material_name)
        if material is None:
            raise RuntimeError(f"source material {material_name} missing")
        material_images = {
            kind: make_texture(context, material_name, kind)
            for kind in ("baseColor", "normal", "roughness", "metallic")
        }
        configure_material(material, material_images, context)

    verify_canonical_rig(armature, body_meshes, "import")

    armature.name = f"Pass74_OperatorSkin_{context['camel']}_Armature"
    armature["asset_id"] = context["asset_id"]
    armature["asset_family_id"] = ASSET_FAMILY_ID
    armature["archetype_id"] = context["id"]
    armature["design_id"] = context["design_id"]
    armature["display_name"] = context["display_name"]
    armature["source_kind"] = "license-vetted-cc0-blender-derivative"
    armature["source_gltf"] = "public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf"
    armature["family_asset_id"] = "pass65-third-person-operator-family-v1"
    armature["runtime_forward_axis"] = "+Z-source-corrected-once-to-atomic-minus-Z"
    armature["material_contract"] = "opaque-embedded-pbr-depth-writing"
    armature["material_names"] = ",".join(MATERIAL_NAMES)
    armature["skeleton_joint_count"] = CONTRACT["jointCount"]
    armature["animation_clip_count"] = CONTRACT["animationClipCount"]
    armature["skeleton_policy"] = "immutable-canonical-pass65-rig-no-joint-added-renamed-reparented"
    armature["embedded_weapon_policy"] = "removed-from-delivery"
    armature["canonical_consumers"] = "players+bots+reinforcements+corpses"
    # Blender's glTF importer leaves the final (Death) action active as well as
    # creating one NLA track per clip. Clear that active action so review poses
    # and editable-source state are driven by exactly one selected track.
    if armature.animation_data is None:
        raise RuntimeError("operator armature has no animation data")
    armature.animation_data.action = None
    for track in armature.animation_data.nla_tracks:
        track.mute = True
    for body in body_meshes:
        body["asset_id"] = context["asset_id"]
        body["skinned_operator_body_part"] = body.name
        body["presentation_only"] = True
        body["opaque_pbr"] = True
    return armature, body_meshes


def snapshot_bind_pose(body_meshes: list[bpy.types.Object]) -> list[list[Vector]]:
    return [[vertex.co.copy() for vertex in mesh.data.vertices] for mesh in body_meshes]


def restore_bind_pose(body_meshes: list[bpy.types.Object], pristine: list[list[Vector]]) -> None:
    for mesh, coordinates in zip(body_meshes, pristine):
        if len(coordinates) != len(mesh.data.vertices):
            raise RuntimeError("bind-pose snapshot no longer matches mesh topology")
        for vertex, coordinate in zip(mesh.data.vertices, coordinates):
            vertex.co = coordinate


def _bone_segment(armature: bpy.types.Object, joint: str) -> tuple[Vector, Vector, float]:
    bone = armature.data.bones[joint]
    head = armature.matrix_world @ bone.head_local
    tail = armature.matrix_world @ bone.tail_local
    return head, tail, (tail - head).length


def apply_proportion_edits(
    armature: bpy.types.Object,
    body_meshes: list[bpy.types.Object],
    multipliers: dict[str, float],
) -> None:
    """Displace ONLY rest-pose vertices, masked by existing vertex-group weights.

    Skeleton, bone names, vertex-group inventories and skin weights themselves
    are never modified; animations therefore deform the reshaped bind pose
    exactly as they deform the canonical operator.
    """
    shoulder_multiplier = multipliers["shoulderWidthMultiplier"]
    torso_multiplier = multipliers["torsoBulkMultiplier"]
    limb_multiplier = multipliers["limbThicknessMultiplier"]

    segments: dict[str, tuple[Vector, Vector, Vector, float]] = {}
    for joint in LIMB_JOINTS:
        head, tail, length = _bone_segment(armature, joint)
        direction = (tail - head).normalized() if length > 1e-6 else Vector((0.0, 0.0, 1.0))
        segments[joint] = (head, tail, direction, length)

    def closest_point(segment: tuple[Vector, Vector, Vector, float], point: Vector) -> Vector:
        head, tail, direction, length = segment
        if length <= 1e-6:
            return head.copy()
        t = max(0.0, min(1.0, (point - head).dot(direction) / length))
        return head + direction * (length * t)

    for mesh in body_meshes:
        world = mesh.matrix_world
        inverse = world.inverted()
        for vertex in mesh.data.vertices:
            co = world @ vertex.co
            weights: dict[str, float] = {}
            for element in vertex.groups:
                weights[mesh.vertex_groups[element.group].name] = element.weight

            shoulder_weight = min(1.0, sum(weights.get(name, 0.0) for name in SHOULDER_MASK_GROUPS))
            if shoulder_weight > 0.0:
                co.x *= 1.0 + (shoulder_multiplier - 1.0) * shoulder_weight

            torso_weight = min(1.0, sum(weights.get(name, 0.0) for name in TORSO_MASK_GROUPS))
            if torso_weight > 0.0 and (co.x != 0.0 or co.y != 0.0):
                radial = 1.0 + (torso_multiplier - 1.0) * torso_weight
                co.x *= radial
                co.y *= radial

            best_joint = None
            best_weight = 0.0
            for joint in LIMB_JOINTS:
                weight = weights.get(joint, 0.0)
                if weight > best_weight:
                    best_joint = joint
                    best_weight = weight
            if best_joint is not None:
                anchor = closest_point(segments[best_joint], co)
                co = anchor + (co - anchor) * (1.0 + (limb_multiplier - 1.0) * best_weight)

            vertex.co = inverse @ co
        mesh.data.update()


def _joint_frame(armature: bpy.types.Object, joint: str) -> dict:
    if joint not in armature.data.bones:
        raise RuntimeError(f"accessory cannot skin to unknown joint {joint!r}")
    bone = armature.data.bones[joint]
    head = armature.matrix_world @ bone.head_local
    tail = armature.matrix_world @ bone.tail_local
    vector = tail - head
    length = vector.length
    direction = vector.normalized() if length > 1e-6 else Vector((0.0, 0.0, 1.0))
    return {
        "head": head,
        "tail": tail,
        "length": length,
        "direction": direction,
        "rotation": direction.to_track_quat("Z", "Y").to_euler(),
    }


def side_sign(joint: str) -> float:
    return 1.0 if joint.endswith(".L") else -1.0


def box_object(name: str, sx: float, sy: float, sz: float) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    hx, hy, hz = sx / 2.0, sy / 2.0, sz / 2.0
    verts = [
        (-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
        (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz),
    ]
    faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (3, 2, 6, 7), (1, 5, 6, 2), (0, 3, 7, 4)]
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    return bpy.data.objects.new(name, mesh)


def cylinder_object(name: str, radius_bottom: float, radius_top: float, depth: float, segments: int = 16) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    half = depth / 2.0
    verts: list[tuple[float, float, float]] = []
    for radius, z in ((radius_bottom, -half), (radius_top, half)):
        for i in range(segments):
            angle = 2.0 * math.pi * i / segments
            verts.append((math.cos(angle) * radius, math.sin(angle) * radius, z))
    faces: list[tuple[int, ...]] = []
    for i in range(segments):
        j = (i + 1) % segments
        faces.append((i, j, segments + j, segments + i))
    faces.append(tuple(range(segments - 1, -1, -1)))
    faces.append(tuple(range(segments, segments * 2)))
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    return bpy.data.objects.new(name, mesh)


def finish_accessory(
    context: dict,
    obj: bpy.types.Object,
    armature: bpy.types.Object,
    joint: str,
    item: str,
    material_name: str,
    location: Vector,
    rotation: Euler | tuple[float, float, float],
) -> bpy.types.Object:
    material = context["materials"][material_name]
    obj.parent = armature
    obj.location = location
    obj.rotation_euler = rotation
    obj.data.materials.append(material)
    group = obj.vertex_groups.new(name=joint)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    modifier = obj.modifiers.new("Pass74 archetype accessory skin binding", "ARMATURE")
    modifier.object = armature
    obj["asset_id"] = context["asset_id"]
    obj["accessory_item"] = item
    obj["skinned_joint"] = joint
    obj["presentation_only"] = True
    obj["opaque_pbr"] = True
    return obj


def band_accessory(
    context: dict,
    armature: bpy.types.Object,
    joint: str,
    item: str,
    along: float,
    radius_factor: float,
    depth_factor: float,
    material_name: str,
    lateral_factor: float = 0.0,
    forward_factor: float = 0.0,
) -> bpy.types.Object:
    frame = _joint_frame(armature, joint)
    length = frame["length"]
    obj = cylinder_object(
        f"Pass74_{context['camel']}_Acc_{item}_{joint}",
        length * radius_factor,
        length * radius_factor,
        length * depth_factor,
    )
    location = frame["head"].lerp(frame["tail"], along)
    location += Vector((side_sign(joint) * lateral_factor * length, forward_factor * length, 0.0))
    return finish_accessory(context, obj, armature, joint, item, material_name, location, frame["rotation"])


def box_accessory(
    context: dict,
    armature: bpy.types.Object,
    joint: str,
    item: str,
    size_factors: tuple[float, float, float],
    location: Vector,
    rotation: Euler | tuple[float, float, float],
    material_name: str,
) -> bpy.types.Object:
    frame_length = _joint_frame(armature, joint)["length"]
    sx, sy, sz = (factor * frame_length for factor in size_factors)
    obj = box_object(f"Pass74_{context['camel']}_Acc_{item}_{joint}", sx, sy, sz)
    return finish_accessory(context, obj, armature, joint, item, material_name, location, rotation)


def build_rolled_cuff_sleeve_bands(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "rolled-cuff-sleeve-bands"
    return [
        band_accessory(context, armature, joint, item, along, 0.155, 0.18, "Swat")
        for joint in ("LowerArm.L", "LowerArm.R")
        for along in (0.80, 0.64)
    ]


def build_compass_chest_strap(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "compass-chest-strap"
    chest = _joint_frame(armature, "Chest")
    length = chest["length"]
    anchor = chest["head"] + Vector((0.0, -length * 0.42, length * 0.10))
    strap = box_accessory(
        context, armature, "Chest", item, (1.05, 0.10, 0.34), anchor,
        Euler((0.0, math.radians(-32.0), math.radians(-8.0))), "Swat",
    )
    compass_body = cylinder_object(
        f"Pass74_{context['camel']}_Acc_{item}_compass_body", length * 0.15, length * 0.15, length * 0.09,
    )
    finish_accessory(
        context, compass_body, armature, "Chest", item, "Swat_Black",
        anchor + Vector((length * 0.16, -length * 0.06, 0.0)),
        Euler((math.radians(90.0), 0.0, 0.0)),
    )
    compass_face = cylinder_object(
        f"Pass74_{context['camel']}_Acc_{item}_compass_face", length * 0.10, length * 0.10, length * 0.03,
    )
    finish_accessory(
        context, compass_face, armature, "Chest", item, "Visor",
        anchor + Vector((length * 0.16, -length * 0.115, 0.0)),
        Euler((math.radians(90.0), 0.0, 0.0)),
    )
    del strap
    return [strap, compass_body, compass_face]


def build_field_belt_with_double_pouches(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "field-belt-with-double-pouches"
    hips = _joint_frame(armature, "Hips")
    length = hips["length"]
    belt_radius = length * 1.35
    belt = cylinder_object(f"Pass74_{context['camel']}_Acc_{item}_belt", belt_radius, belt_radius, length * 0.30)
    finish_accessory(
        context, belt, armature, "Hips", item, "Swat",
        hips["head"] + Vector((0.0, 0.0, length * 0.10)), Euler((0.0, 0.0, 0.0)),
    )
    objects = [belt]
    for index, angle_degrees in enumerate((-42.0, 38.0)):
        angle = math.radians(angle_degrees)
        pouch = box_object(
            f"Pass74_{context['camel']}_Acc_{item}_pouch_{index}",
            length * 0.42, length * 0.24, length * 0.36,
        )
        finish_accessory(
            context, pouch, armature, "Hips", item, "Swat_Black",
            hips["head"] + Vector((
                math.sin(angle) * belt_radius * 0.94,
                -math.cos(angle) * belt_radius * 0.86,
                -length * 0.22,
            )),
            Euler((0.0, 0.0, angle)),
        )
        objects.append(pouch)
    return objects


def build_map_case_thigh_strap(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "map-case-thigh-strap"
    thigh = _joint_frame(armature, "UpperLeg.R")
    length = thigh["length"]
    case_location = thigh["head"].lerp(thigh["tail"], 0.48) + Vector((length * 0.46, 0.0, 0.0))
    case = box_accessory(
        context, armature, "UpperLeg.R", item, (0.20, 0.42, 0.58),
        case_location, Euler((0.0, 0.0, math.radians(6.0))), "Swat",
    )
    straps = [
        band_accessory(context, armature, "UpperLeg.R", item, along, 0.44, 0.07, "Swat_Black")
        for along in (0.30, 0.64)
    ]
    return [case, *straps]


def build_head_wear(context: dict, armature: bpy.types.Object, item: str, lens_size: tuple[float, float, float]) -> list[bpy.types.Object]:
    head = _joint_frame(armature, "Head")
    length = head["length"]
    band = cylinder_object(f"Pass74_{context['camel']}_Acc_{item}_band", length * 0.46, length * 0.46, length * 0.16)
    finish_accessory(
        context, band, armature, "Head", item, "Swat_Black",
        head["head"].lerp(head["tail"], 0.72), head["rotation"],
    )
    lens = box_object(f"Pass74_{context['camel']}_Acc_{item}_lens", *(factor * length for factor in lens_size))
    finish_accessory(
        context, lens, armature, "Head", item, "Visor",
        head["head"].lerp(head["tail"], 0.70) + Vector((0.0, -length * 0.42, 0.0)),
        Euler((0.0, 0.0, 0.0)),
    )
    return [band, lens]


def build_goggles_raised_visor_variant(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    return build_head_wear(context, armature, "goggles-raised-visor-variant", (0.52, 0.10, 0.20))


def build_sealed_lens_visor_variant(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    return build_head_wear(context, armature, "sealed-lens-visor-variant", (0.62, 0.12, 0.50))


def build_anti_fog_sealed_visor_variant(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    return build_head_wear(context, armature, "anti-fog-sealed-visor-variant", (0.58, 0.12, 0.30))


def build_ankle_gaiter_straps(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "ankle-gaiter-straps"
    objects = []
    for joint in ("Foot.L", "Foot.R"):
        objects.append(band_accessory(context, armature, joint, item, 0.55, 0.30, 0.16, "Swat_Black"))
        foot = _joint_frame(armature, joint)
        buckle = box_object(f"Pass74_{context['camel']}_Acc_{item}_{joint}_buckle", foot["length"] * 0.12, foot["length"] * 0.12, foot["length"] * 0.10)
        finish_accessory(
            context, buckle, armature, joint, item, "Swat_Black",
            foot["head"].lerp(foot["tail"], 0.55) + Vector((0.0, 0.0, foot["length"] * 0.30)),
            Euler((0.0, 0.0, 0.0)),
        )
        objects.append(buckle)
    return objects


def build_grafted_chest_plate_harness(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "grafted-chest-plate-harness"
    chest = _joint_frame(armature, "Chest")
    length = chest["length"]
    objects = []
    for index, (width, height, depth_offset, tilt) in enumerate((
        (1.15, 0.85, 0.30, 8.0), (0.82, 0.60, 0.38, 4.0), (0.48, 0.36, 0.46, 0.0),
    )):
        plate = box_object(
            f"Pass74_{context['camel']}_Acc_{item}_plate_{index}",
            length * width, length * 0.13, length * height,
        )
        finish_accessory(
            context, plate, armature, "Chest", item, "Swat_Black",
            chest["head"] + Vector((0.0, -length * depth_offset, -length * 0.12 * index)),
            Euler((math.radians(tilt), 0.0, 0.0)),
        )
        objects.append(plate)
    for index, angle_degrees in enumerate((-34.0, 30.0)):
        angle = math.radians(angle_degrees)
        strap = box_object(
            f"Pass74_{context['camel']}_Acc_{item}_strap_{index}",
            length * 0.95, length * 0.08, length * 0.14,
        )
        finish_accessory(
            context, strap, armature, "Torso", item, "Swat",
            chest["head"] + Vector((0.0, -length * 0.22, length * 0.28)),
            Euler((0.0, math.radians(-24.0), angle)),
        )
        objects.append(strap)
    return objects


def build_spine_ridge_back_lashing(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "spine-ridge-back-lashing"
    torso = _joint_frame(armature, "Torso")
    length = torso["length"]
    objects = []
    for index, along in enumerate((0.18, 0.42, 0.66, 0.88)):
        ridge = box_object(
            f"Pass74_{context['camel']}_Acc_{item}_ridge_{index}",
            length * (0.30 - index * 0.03),
            length * 0.16,
            length * (0.24 - index * 0.02),
        )
        finish_accessory(
            context, ridge, armature, "Torso", item, "Swat_Black",
            torso["head"].lerp(torso["tail"], along) + Vector((0.0, length * 0.34, 0.0)),
            Euler((math.radians(-16.0 + index * 5.0), 0.0, 0.0)),
        )
        objects.append(ridge)
    return objects


def build_forearm_guard_wraps(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "forearm-guard-wraps"
    objects = []
    for joint in ("LowerArm.L", "LowerArm.R"):
        frame = _joint_frame(armature, joint)
        length = frame["length"]
        guard = cylinder_object(
            f"Pass74_{context['camel']}_Acc_{item}_{joint}_guard",
            length * 0.13, length * 0.19, length * 0.62,
        )
        finish_accessory(
            context, guard, armature, joint, item, "Swat_Black",
            frame["head"].lerp(frame["tail"], 0.50), frame["rotation"],
        )
        objects.append(guard)
        objects.append(band_accessory(context, armature, joint, item, 0.24, 0.21, 0.08, "Swat"))
        objects.append(band_accessory(context, armature, joint, item, 0.76, 0.17, 0.08, "Swat"))
    return objects


def build_hip_armor_lashings(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "hip-armor-lashings"
    hips = _joint_frame(armature, "Hips")
    length = hips["length"]
    objects = []
    for joint, angle in (("Hips", 0.0),):
        del joint, angle
    for index, mirror in enumerate((1.0, -1.0)):
        plate = box_object(
            f"Pass74_{context['camel']}_Acc_{item}_plate_{index}",
            length * 0.20, length * 0.46, length * 0.62,
        )
        finish_accessory(
            context, plate, armature, "Hips", item, "Swat_Black",
            hips["head"] + Vector((mirror * length * 1.18, 0.0, -length * 0.10)),
            Euler((0.0, 0.0, math.radians(mirror * -14.0))),
        )
        objects.append(plate)
    objects.append(band_accessory(context, armature, "Hips", item, 0.5, 1.42, 0.16, "Swat"))
    return objects


def build_knee_guard_straps(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "knee-guard-straps"
    objects = []
    for joint in ("UpperLeg.L", "UpperLeg.R"):
        frame = _joint_frame(armature, joint)
        length = frame["length"]
        plate = box_object(
            f"Pass74_{context['camel']}_Acc_{item}_{joint}_plate",
            length * 0.34, length * 0.16, length * 0.34,
        )
        finish_accessory(
            context, plate, armature, joint, item, "Swat_Black",
            frame["head"].lerp(frame["tail"], 0.90) + Vector((0.0, -length * 0.30, 0.0)),
            Euler((0.0, 0.0, 0.0)),
        )
        objects.append(plate)
        objects.append(band_accessory(context, armature, joint, item, 0.74, 0.40, 0.08, "Swat"))
    return objects


def build_low_profile_swim_harness(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "low-profile-swim-harness"
    chest = _joint_frame(armature, "Chest")
    length = chest["length"]
    strap = box_accessory(
        context, armature, "Chest", item, (0.95, 0.07, 0.22),
        chest["head"] + Vector((0.0, -length * 0.34, -length * 0.05)),
        Euler((0.0, math.radians(-28.0), math.radians(-10.0))), "Swat",
    )
    back_plate = box_accessory(
        context, armature, "Chest", item, (0.55, 0.10, 0.40),
        chest["head"] + Vector((0.0, length * 0.34, -length * 0.10)),
        Euler((0.0, 0.0, 0.0)), "Swat_Black",
    )
    return [strap, back_plate]


def build_weight_belt_with_dive_pouches(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "weight-belt-with-dive-pouches"
    hips = _joint_frame(armature, "Hips")
    length = hips["length"]
    belt_radius = length * 1.30
    belt = cylinder_object(f"Pass74_{context['camel']}_Acc_{item}_belt", belt_radius, belt_radius, length * 0.26)
    finish_accessory(
        context, belt, armature, "Hips", item, "Swat_Black",
        hips["head"] + Vector((0.0, 0.0, length * 0.06)), Euler((0.0, 0.0, 0.0)),
    )
    objects = [belt]
    for index, angle_degrees in enumerate((-52.0, 0.0, 50.0)):
        angle = math.radians(angle_degrees)
        pouch = box_object(
            f"Pass74_{context['camel']}_Acc_{item}_pouch_{index}",
            length * 0.30, length * 0.20, length * 0.30,
        )
        finish_accessory(
            context, pouch, armature, "Hips", item, "Swat",
            hips["head"] + Vector((
                math.sin(angle) * belt_radius * 0.96,
                -math.cos(angle) * belt_radius * 0.90,
                -length * 0.20,
            )),
            Euler((0.0, 0.0, angle)),
        )
        objects.append(pouch)
    return objects


def build_wrist_gauge_strap(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "wrist-gauge-strap"
    wrist = _joint_frame(armature, "Wrist.L")
    length = wrist["length"]
    strap = band_accessory(context, armature, "Wrist.L", item, 0.40, 0.55, 0.22, "Swat_Black")
    body = cylinder_object(
        f"Pass74_{context['camel']}_Acc_{item}_gauge_body", length * 0.30, length * 0.30, length * 0.16,
    )
    finish_accessory(
        context, body, armature, "Wrist.L", item, "Swat_Black",
        wrist["head"].lerp(wrist["tail"], 0.40) + Vector((0.0, 0.0, length * 0.55)),
        Euler((0.0, 0.0, 0.0)),
    )
    face = cylinder_object(
        f"Pass74_{context['camel']}_Acc_{item}_gauge_face", length * 0.20, length * 0.20, length * 0.05,
    )
    finish_accessory(
        context, face, armature, "Wrist.L", item, "Visor",
        wrist["head"].lerp(wrist["tail"], 0.40) + Vector((0.0, 0.0, length * 0.66)),
        Euler((0.0, 0.0, 0.0)),
    )
    return [strap, body, face]


def build_shin_cargo_pocket_straps(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "shin-cargo-pocket-straps"
    objects = []
    for joint in ("LowerLeg.L", "LowerLeg.R"):
        frame = _joint_frame(armature, joint)
        length = frame["length"]
        pocket = box_object(
            f"Pass74_{context['camel']}_Acc_{item}_{joint}_pocket",
            length * 0.18, length * 0.34, length * 0.38,
        )
        finish_accessory(
            context, pocket, armature, joint, item, "Swat",
            frame["head"].lerp(frame["tail"], 0.45) + Vector((side_sign(joint) * length * 0.34, 0.0, 0.0)),
            Euler((0.0, 0.0, 0.0)),
        )
        objects.append(pocket)
        objects.append(band_accessory(context, armature, joint, item, 0.28, 0.36, 0.07, "Swat_Black"))
        objects.append(band_accessory(context, armature, joint, item, 0.62, 0.34, 0.07, "Swat_Black"))
    return objects


def build_ankle_tether_straps(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    item = "ankle-tether-straps"
    objects = []
    for joint in ("Foot.L", "Foot.R"):
        objects.append(band_accessory(context, armature, joint, item, 0.50, 0.28, 0.14, "Swat_Black"))
        foot = _joint_frame(armature, joint)
        ring = cylinder_object(
            f"Pass74_{context['camel']}_Acc_{item}_{joint}_ring",
            foot["length"] * 0.09, foot["length"] * 0.09, foot["length"] * 0.05,
        )
        finish_accessory(
            context, ring, armature, joint, item, "Swat_Black",
            foot["head"].lerp(foot["tail"], 0.50) + Vector((0.0, 0.0, foot["length"] * 0.26)),
            Euler((0.0, math.radians(90.0), 0.0)),
        )
        objects.append(ring)
    return objects


ACCESSORY_BUILDERS = {
    "rolled-cuff-sleeve-bands": build_rolled_cuff_sleeve_bands,
    "compass-chest-strap": build_compass_chest_strap,
    "field-belt-with-double-pouches": build_field_belt_with_double_pouches,
    "map-case-thigh-strap": build_map_case_thigh_strap,
    "goggles-raised-visor-variant": build_goggles_raised_visor_variant,
    "ankle-gaiter-straps": build_ankle_gaiter_straps,
    "grafted-chest-plate-harness": build_grafted_chest_plate_harness,
    "spine-ridge-back-lashing": build_spine_ridge_back_lashing,
    "forearm-guard-wraps": build_forearm_guard_wraps,
    "hip-armor-lashings": build_hip_armor_lashings,
    "knee-guard-straps": build_knee_guard_straps,
    "sealed-lens-visor-variant": build_sealed_lens_visor_variant,
    "low-profile-swim-harness": build_low_profile_swim_harness,
    "weight-belt-with-dive-pouches": build_weight_belt_with_dive_pouches,
    "wrist-gauge-strap": build_wrist_gauge_strap,
    "shin-cargo-pocket-straps": build_shin_cargo_pocket_straps,
    "anti-fog-sealed-visor-variant": build_anti_fog_sealed_visor_variant,
    "ankle-tether-straps": build_ankle_tether_straps,
}


def build_accessories(context: dict, armature: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    bone_names = {bone.name for bone in armature.data.bones}
    for accessory in context["archetype"]["accessories"]:
        item = accessory["item"]
        builder = ACCESSORY_BUILDERS.get(item)
        if builder is None:
            raise RuntimeError(f"no deterministic builder registered for accessory item {item!r}")
        unknown = sorted(set(accessory["skinToJoints"]) - bone_names)
        if unknown:
            raise RuntimeError(f"accessory {item!r} skins to joints absent from the canonical rig: {unknown}")
        objects.extend(builder(context, armature))
    for obj in objects:
        group_names = {group.name for group in obj.vertex_groups}
        if not group_names or not group_names.issubset(bone_names):
            raise RuntimeError(f"accessory {obj.name} is not skinned exclusively to existing canonical joints")
    bpy.context.view_layer.update()
    return objects


def silhouette_measure(objects: list[bpy.types.Object]) -> tuple[float, float]:
    radius = 0.0
    z_min = float("inf")
    z_max = float("-inf")
    for obj in objects:
        world = obj.matrix_world
        for vertex in obj.data.vertices:
            co = world @ vertex.co
            radius = max(radius, math.hypot(co.x, co.y))
            z_min = min(z_min, co.z)
            z_max = max(z_max, co.z)
    if radius <= 0.0 or z_min >= z_max:
        raise RuntimeError("silhouette measurement found degenerate geometry")
    return radius, z_max - z_min


def enforce_silhouette_envelope(
    context: dict,
    armature: bpy.types.Object,
    body_meshes: list[bpy.types.Object],
    pristine: list[list[Vector]],
    accessories: list[bpy.types.Object],
) -> dict:
    """Clamp proportions/accessories to the archetype hit-proxy envelope.

    The unmodified source operator stands for the authoritative capsule baseline;
    the composed silhouette after proportion edits and accessories must stay
    within maxSilhouetteScale times that baseline. Excess is clamped, never
    allowed through (spec silhouetteBoundNote).
    """
    cap = context["silhouette_cap"]
    base_radius, base_height = silhouette_measure(body_meshes)
    effective = dict(context["proportions"])
    accessory_scale = 1.0
    measured_scale = float("inf")
    for _attempt in range(8):
        bpy.context.view_layer.update()
        radius, height = silhouette_measure(body_meshes + accessories)
        measured_scale = max(radius / base_radius, height / base_height)
        if measured_scale <= cap * 1.001:
            return {
                "effectiveProportions": effective,
                "accessoryScale": accessory_scale,
                "measuredSilhouetteScale": round(measured_scale, 4),
                "silhouetteCap": cap,
                "clamped": accessory_scale < 0.999 or any(
                    abs(effective[key] - context["proportions"][key]) > 1e-6
                    for key in effective
                ),
            }
        shrink = max(0.05, cap / measured_scale)
        relaxation = 1.0 + (1.0 - shrink) * 2.0 + 0.35
        effective = {
            key: 1.0 + (context["proportions"][key] - 1.0) / relaxation
            for key in context["proportions"]
        }
        restore_bind_pose(body_meshes, pristine)
        apply_proportion_edits(armature, body_meshes, effective)
        accessory_scale *= shrink
        for accessory in accessories:
            accessory.scale = (accessory.scale[0] * shrink, accessory.scale[1] * shrink, accessory.scale[2] * shrink)
    raise RuntimeError(
        f"{context['id']}: composed silhouette {measured_scale:.4f} refuses to converge "
        f"inside maxSilhouetteScale {cap}"
    )


def verify_accessory_skinning(armature: bpy.types.Object, accessories: list[bpy.types.Object]) -> None:
    bone_names = {bone.name for bone in armature.data.bones}
    for accessory in accessories:
        if accessory.modifiers.get("Pass74 archetype accessory skin binding") is None:
            raise RuntimeError(f"accessory {accessory.name} lost its armature binding")
        group_names = {group.name for group in accessory.vertex_groups}
        if not group_names.issubset(bone_names):
            raise RuntimeError(f"accessory {accessory.name} references non-canonical joints")


def selected_delivery_objects(
    armature: bpy.types.Object,
    body_meshes: list[bpy.types.Object],
    accessories: list[bpy.types.Object],
) -> list[bpy.types.Object]:
    return [armature, *body_meshes, *accessories]


def export_lod(
    context: dict,
    armature: bpy.types.Object,
    body_meshes: list[bpy.types.Object],
    accessories: list[bpy.types.Object],
    lod: int,
) -> Path:
    verify_canonical_rig(armature, body_meshes, f"lod{lod}-export")
    verify_accessory_skinning(armature, accessories)
    armature["lod"] = lod
    armature["quality_tier"] = ("hero-near", "gameplay-mid", "gameplay-far")[lod]
    filepath = RAW_DIR / f"pass74-operator-skin-{context['id']}-lod{lod}.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected_delivery_objects(armature, body_meshes, accessories):
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


def mute_all_tracks(armature: bpy.types.Object) -> None:
    if armature.animation_data is None:
        return
    for track in armature.animation_data.nla_tracks:
        track.mute = True


def activate_track(armature: bpy.types.Object, action_name: str, frame: int) -> None:
    if armature.animation_data is None:
        raise RuntimeError("operator armature has no animation data")
    found = False
    for track in armature.animation_data.nla_tracks:
        track.mute = track.name != action_name
        found = found or track.name == action_name
    if not found:
        raise RuntimeError(f"review action {action_name} missing")
    bpy.context.scene.frame_set(frame)


def activate_rest_pose(armature: bpy.types.Object) -> None:
    mute_all_tracks(armature)
    armature.data.pose_position = "REST"
    bpy.context.scene.frame_set(1)


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_reviews(context: dict, armature: bpy.types.Object, body_meshes: list[bpy.types.Object]) -> list[Path]:
    review_dir = REVIEW_ROOT / context["id"]
    review_dir.mkdir(parents=True, exist_ok=True)
    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, 0))
    stage = bpy.context.object
    stage.name = f"Pass74_{context['camel']}_Review_Stage"
    stage_material = bpy.data.materials.new(f"Pass74_{context['camel']}_Review_Stage_Material")
    stage_material.diffuse_color = (0.025, 0.035, 0.045, 1.0)
    stage_material.use_nodes = True
    stage_bsdf = stage_material.node_tree.nodes.get("Principled BSDF")
    input_socket(stage_bsdf, "Base Color").default_value = (0.018, 0.028, 0.038, 1.0)
    input_socket(stage_bsdf, "Roughness").default_value = 0.55
    stage.data.materials.append(stage_material)

    for name, location, energy, color, size in (
        ("OperatorSkin_Review_Key", (-3.8, -3.2, 4.9), 1280, (0.50, 0.76, 1.0), 2.5),
        ("OperatorSkin_Review_Rim", (3.4, 1.8, 3.5), 1180, (1.0, 0.25, 0.08), 2.0),
        ("OperatorSkin_Review_Fill", (0.0, 4.0, 2.4), 760, (0.20, 0.44, 0.72), 2.8),
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
    camera.name = f"Pass74_{context['camel']}_Review_Camera"
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_SIZE
    scene.render.resolution_y = REVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.004, 0.007, 0.012)
    scene.view_settings.look = "AgX - Medium High Contrast"

    views = (
        ("neutral-front", (0.0, -4.35, 1.28), (0.0, 0.0, 0.94), 66, "Idle_Neutral", 12),
        ("neutral-rear-quarter", (3.35, 3.15, 1.48), (0.0, 0.0, 0.98), 68, "Idle", 12),
        ("run-action", (-3.15, -3.15, 1.18), (0.0, 0.0, 0.92), 62, "Run", 12),
        ("corpse-action", (3.25, -3.15, 1.72), (0.0, 0.0, 0.38), 58, "Death", 25),
    )
    rendered: list[Path] = []
    for label, location, target, lens, action_name, frame in views:
        if action_name is None:
            activate_rest_pose(armature)
        else:
            armature.data.pose_position = "POSE"
            activate_track(armature, action_name, frame)
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        path = review_dir / f"pass74-operator-skin-{context['id']}-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)

    mute_all_tracks(armature)
    armature.data.pose_position = "REST"
    scene.frame_set(1)
    source_images = [bpy.data.images.load(str(path), check_existing=False) for path in rendered]
    sheet = bpy.data.images.new(
        f"Pass74_{context['camel']}_ContactSheet",
        REVIEW_SIZE * 2,
        REVIEW_SIZE * 2,
        alpha=True,
    )
    sheet_pixels = [0.0] * (REVIEW_SIZE * 2 * REVIEW_SIZE * 2 * 4)
    for image_index, image in enumerate(source_images):
        source = list(image.pixels[:])
        tile_x = (image_index % 2) * REVIEW_SIZE
        tile_y = (1 - image_index // 2) * REVIEW_SIZE
        for row in range(REVIEW_SIZE):
            source_start = row * REVIEW_SIZE * 4
            target_start = ((tile_y + row) * REVIEW_SIZE * 2 + tile_x) * 4
            sheet_pixels[target_start:target_start + REVIEW_SIZE * 4] = source[source_start:source_start + REVIEW_SIZE * 4]
    sheet.pixels = sheet_pixels
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(review_dir / f"pass74-operator-skin-{context['id']}-contact-sheet.png")
    sheet.save()

    for body in body_meshes:
        body.hide_render = False
        body.hide_viewport = False
    return rendered


def decimate_body(body_meshes: list[bpy.types.Object], ratio: float, label: str) -> None:
    for body in body_meshes:
        bpy.ops.object.select_all(action="DESELECT")
        bpy.context.view_layer.objects.active = body
        body.select_set(True)
        modifier = body.modifiers.new(f"Pass74 {label} authored topology reduction", "DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        # Evaluate the reduction on the authored bind-pose mesh, before the
        # Armature modifier. Applying it after skin deformation makes the
        # result pose-dependent and Blender warns that the output is unstable.
        while body.modifiers.find(modifier.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        body.select_set(False)


def write_receipt(
    context: dict,
    envelope: dict,
    glb_paths: list[Path],
    review_paths: list[Path],
    source_blend: Path,
) -> Path:
    archetype = context["archetype"]
    receipt = {
        "schemaVersion": 1,
        "assetFamilyId": ASSET_FAMILY_ID,
        "assetId": context["asset_id"],
        "archetypeId": context["id"],
        "displayName": context["display_name"],
        "designId": context["design_id"],
        "canonicalRig": {
            "rigId": CONTRACT["rigId"],
            "jointCount": CONTRACT["jointCount"],
            "animationClipCount": CONTRACT["animationClipCount"],
            "materialNames": list(MATERIAL_NAMES),
            "skeletonAndClipsUntouched": True,
        },
        "sourceGltf": "public/assets/third-party/quaternius/ultimate-modular-males/Swat.gltf",
        "sourceBlend": str(source_blend.relative_to(ROOT)),
        "requestedProportions": context["proportions"],
        "effectiveProportions": envelope["effectiveProportions"],
        "silhouette": {
            "measuredScale": envelope["measuredSilhouetteScale"],
            "maxSilhouetteScale": envelope["silhouetteCap"],
            "clamped": envelope["clamped"],
            "accessoryScale": round(envelope["accessoryScale"], 4),
        },
        "accessories": [accessory["item"] for accessory in archetype["accessories"]],
        "textureFormula": context["formula"],
        "deliveries": [str(path.relative_to(ROOT)) for path in glb_paths],
        "reviewRenders": [str(path.relative_to(ROOT)) for path in review_paths],
        "texturesDir": str((TEXTURE_ROOT / context["id"]).relative_to(ROOT)),
        "generatedBy": "scripts/blender/create-pass74-operator-archetype-skins.py",
    }
    path = RAW_DIR / f"pass74-operator-skin-{context['id']}-receipt.json"
    path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def build_archetype(archetype: dict) -> str:
    context = archetype_context(archetype)
    print(f"ARCHETYPE={context['id']} design={context['design_id']}")
    armature, body_meshes = import_and_prepare(context)
    pristine = snapshot_bind_pose(body_meshes)
    apply_proportion_edits(armature, body_meshes, context["proportions"])
    accessories = build_accessories(context, armature)
    envelope = enforce_silhouette_envelope(context, armature, body_meshes, pristine, accessories)
    verify_canonical_rig(armature, body_meshes, "post-edit")

    glb_paths = [export_lod(context, armature, body_meshes, accessories, 0)]
    review_paths = render_reviews(context, armature, body_meshes)
    source_blend = BLEND_DIR / f"pass74-operator-skin-{context['id']}.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source_blend), compress=True)

    decimate_body(body_meshes, 0.70, "LOD1")
    glb_paths.append(export_lod(context, armature, body_meshes, accessories, 1))
    decimate_body(body_meshes, 0.58, "LOD2")
    glb_paths.append(export_lod(context, armature, body_meshes, accessories, 2))

    receipt_path = write_receipt(context, envelope, glb_paths, review_paths, source_blend)
    for path in glb_paths:
        print(f"GLB={path}")
    print(f"REVIEWS={review_paths[0].parent}")
    print(f"SOURCE_BLEND={source_blend}")
    print(f"RECEIPT={receipt_path}")
    print(
        f"SILHOUETTE={envelope['measuredSilhouetteScale']:.4f}/{envelope['silhouetteCap']} "
        f"clamped={envelope['clamped']}"
    )
    return context["id"]


selected = requested_archetypes()
completed = [build_archetype(operator) for operator in selected]
print(f"PASS74_OPERATOR_SKINS_COMPLETE={','.join(completed)}")
