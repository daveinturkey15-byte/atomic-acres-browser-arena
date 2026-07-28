"""Deterministically author Atomic Acres' original Azure Coil Leviathan.

This file uses Blender primitives, project-authored procedural textures, and a
project-authored armature/animation. It never downloads or incorporates external
model/image data. The exported GLB is presentation-only; TypeScript/Rapier remain
authoritative for collision, ballistics, navigation, and multiplayer state.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import random
import struct
import sys
import zlib
from pathlib import Path
from typing import Iterable

import bpy
import mathutils
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = Path(__file__).resolve()
SOURCE_DIR = ROOT / "source-assets" / "blender" / "azure-coil"
TEXTURE_DIR = SOURCE_DIR / "textures"
BLEND_PATH = SOURCE_DIR / "azure-coil-leviathan.blend"
PROVENANCE_PATH = SOURCE_DIR / "azure-coil-leviathan.provenance.json"
GLB_PATH = ROOT / "public" / "assets" / "original" / "models" / "azure-coil-leviathan.glb"
PREVIEW_DIR = ROOT / "artifacts" / "azure-coil"
PREVIEW_PATH = PREVIEW_DIR / "azure-coil-leviathan-preview.png"

ASSET_VERSION = "azure-coil-leviathan-v1"
RNG_SEED = 0xA2C011
BODY_BONES = 24
HEAD_Y = 5.4
TAIL_Y = -7.4
BODY_RING_HEAD_Y = 4.95
BODY_RING_TAIL_Y = -7.15
TEXTURE_SIZE = 2048
FIN_TEXTURE_SIZE = 1024
ANIMATION_START = 1
ANIMATION_END = 121
ANIMATION_FPS = 24

for path in (SOURCE_DIR, TEXTURE_DIR, GLB_PATH.parent, PREVIEW_DIR):
    path.mkdir(parents=True, exist_ok=True)

os.environ["PYTHONHASHSEED"] = "0"
random.seed(RNG_SEED)
np.random.seed(RNG_SEED & 0xFFFF_FFFF)

# Start from a known empty scene even when the script is invoked without
# --factory-startup. Disable rotating backups so regeneration does not dirty a
# second binary source file.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for datablocks in (
    bpy.data.meshes,
    bpy.data.curves,
    bpy.data.materials,
    bpy.data.cameras,
    bpy.data.lights,
    bpy.data.armatures,
):
    for datablock in list(datablocks):
        datablocks.remove(datablock)
bpy.context.preferences.filepaths.save_version = 0

scene = bpy.context.scene
scene.name = "Azure Coil Leviathan Authoring"
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = False
scene.render.filepath = str(PREVIEW_PATH)
scene.render.image_settings.color_depth = "8"
scene.render.fps = ANIMATION_FPS
scene.frame_start = ANIMATION_START
scene.frame_end = ANIMATION_END
scene.render.resolution_percentage = 100
scene.world.color = (0.005, 0.012, 0.025)
scene["asset_version"] = ASSET_VERSION
scene["asset_owner"] = "Atomic Acres project"
scene["asset_license"] = "Original project work"
scene["presentation_only"] = True
scene["blocks_shots"] = False
scene["authoring_seed"] = RNG_SEED


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_png(path: Path, pixels: np.ndarray) -> None:
    """Write uint8 RGB/RGBA pixels without an external image dependency."""
    if pixels.dtype != np.uint8:
        raise TypeError("PNG pixels must be uint8")
    if pixels.ndim != 3 or pixels.shape[2] not in (3, 4):
        raise ValueError("PNG pixels must be HxWx3 or HxWx4")
    height, width, channels = pixels.shape
    color_type = 2 if channels == 3 else 6
    raw = b"".join(b"\x00" + pixels[row].tobytes() for row in range(height))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
    path.write_bytes(signature + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def generate_body_textures() -> dict[str, Path]:
    size = TEXTURE_SIZE
    u = np.linspace(0.0, 1.0, size, endpoint=False, dtype=np.float32)[None, :]
    v = np.linspace(0.0, 1.0, size, endpoint=False, dtype=np.float32)[:, None]
    rows = 34.0
    cols = 15.0
    row = np.floor(v * rows)
    local_y = (v * rows) % 1.0
    local_x = (u * cols + (row % 2.0) * 0.5) % 1.0
    dx = (local_x - 0.5) / 0.52
    dy = (local_y - 0.42) / 0.62
    scale_height = np.clip(1.0 - np.sqrt(dx * dx + dy * dy), 0.0, 1.0) ** 2.3
    ridge = np.clip(1.0 - np.abs(local_y - 0.88) * 18.0, 0.0, 1.0)
    height = np.clip(scale_height * 0.82 + ridge * 0.18, 0.0, 1.0)

    longitudinal = 0.32 + 0.68 * np.sin(np.pi * np.clip(u, 0.0, 1.0)) ** 0.45
    deep = np.array([7.0, 42.0, 83.0], dtype=np.float32)
    bright = np.array([17.0, 132.0, 178.0], dtype=np.float32)
    color = deep[None, None, :] * (1.0 - longitudinal[..., None]) + bright[None, None, :] * longitudinal[..., None]
    color = np.broadcast_to(color, (size, size, 3)).copy()
    edge = np.clip((1.0 - scale_height) * 0.8 + ridge * 0.7, 0.0, 1.0)
    color[..., 0] += edge * 4.0
    color[..., 1] += edge * 34.0
    color[..., 2] += edge * 42.0
    # Asymmetric project-original bioluminescent diagonal lanes.
    band = np.exp(-((np.sin((u * 4.0 + v * 1.35) * math.pi) + 0.78) / 0.22) ** 2)
    band *= np.clip(0.85 - u, 0.0, 1.0)
    color[..., 0] += band * 10.0
    color[..., 1] += band * 82.0
    color[..., 2] += band * 74.0
    color = np.clip(color, 0, 255).astype(np.uint8)
    alpha = np.full((size, size, 1), 255, dtype=np.uint8)
    base = np.concatenate([color, alpha], axis=2)

    grad_v, grad_u = np.gradient(height.astype(np.float32))
    strength = 6.2
    nx = -grad_u * strength
    ny = -grad_v * strength
    nz = np.ones_like(nx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack([
        (nx / length * 0.5 + 0.5) * 255.0,
        (ny / length * 0.5 + 0.5) * 255.0,
        (nz / length * 0.5 + 0.5) * 255.0,
        np.full_like(nx, 255.0),
    ], axis=2).astype(np.uint8)

    rough = np.clip(154.0 - height * 76.0 + ridge * 22.0, 58.0, 190.0).astype(np.uint8)
    roughness = np.stack([rough, rough, rough, np.full_like(rough, 255)], axis=2)
    emissive_color = np.zeros_like(base)
    emissive_color[..., 0] = np.clip(band * 18.0, 0, 255).astype(np.uint8)
    emissive_color[..., 1] = np.clip(band * 176.0, 0, 255).astype(np.uint8)
    emissive_color[..., 2] = np.clip(band * 205.0, 0, 255).astype(np.uint8)
    emissive_color[..., 3] = 255

    paths = {
        "base": TEXTURE_DIR / "azure-coil-body-basecolor.png",
        "normal": TEXTURE_DIR / "azure-coil-body-normal.png",
        "roughness": TEXTURE_DIR / "azure-coil-body-roughness.png",
        "emissive": TEXTURE_DIR / "azure-coil-body-emissive.png",
    }
    write_png(paths["base"], base)
    write_png(paths["normal"], normal)
    write_png(paths["roughness"], roughness)
    write_png(paths["emissive"], emissive_color)
    return paths


def generate_fin_texture() -> Path:
    size = FIN_TEXTURE_SIZE
    u = np.linspace(0.0, 1.0, size, endpoint=False, dtype=np.float32)[None, :]
    v = np.linspace(0.0, 1.0, size, endpoint=False, dtype=np.float32)[:, None]
    membrane = np.clip(1.0 - np.abs(v - 0.5) * 1.75, 0.0, 1.0)
    rays = np.clip(np.cos((u * 9.0 + v * 1.7) * math.pi * 2.0) * 0.5 + 0.5, 0.0, 1.0) ** 6
    base = np.zeros((size, size, 4), dtype=np.uint8)
    base[..., 0] = np.clip(8 + membrane * 8 + rays * 20, 0, 255).astype(np.uint8)
    base[..., 1] = np.clip(58 + membrane * 92 + rays * 52, 0, 255).astype(np.uint8)
    base[..., 2] = np.clip(88 + membrane * 104 + rays * 62, 0, 255).astype(np.uint8)
    base[..., 3] = 255
    path = TEXTURE_DIR / "azure-coil-fin-basecolor.png"
    write_png(path, base)
    return path


texture_paths = generate_body_textures()
fin_texture_path = generate_fin_texture()


def input_socket(node: bpy.types.Node, *names: str):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    return None


def make_principled_material(
    name: str,
    base_color: tuple[float, float, float, float],
    roughness: float,
    metallic: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
    transmission: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = base_color
    material.use_backface_culling = False
    principled = material.node_tree.nodes.get("Principled BSDF")
    input_socket(principled, "Base Color").default_value = base_color
    input_socket(principled, "Roughness").default_value = roughness
    input_socket(principled, "Metallic").default_value = metallic
    transmission_socket = input_socket(principled, "Transmission Weight", "Transmission")
    if transmission_socket is not None:
        transmission_socket.default_value = transmission
    if emission is not None:
        emission_socket = input_socket(principled, "Emission Color", "Emission")
        if emission_socket is not None:
            emission_socket.default_value = emission
        strength_socket = input_socket(principled, "Emission Strength")
        if strength_socket is not None:
            strength_socket.default_value = emission_strength
    material["asset_owner"] = "Atomic Acres project"
    material["asset_license"] = "Original project work"
    return material


def image_node(material: bpy.types.Material, path: Path, name: str, color_space: str) -> bpy.types.ShaderNodeTexImage:
    image = bpy.data.images.load(str(path), check_existing=True)
    image.name = name
    image.colorspace_settings.name = color_space
    image.pack()
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.name = name
    node.label = name
    node.image = image
    return node


body_material = make_principled_material("AzureCoil_Body_PBR", (0.02, 0.24, 0.52, 1), 0.38, 0.08)
body_nodes = body_material.node_tree.nodes
body_links = body_material.node_tree.links
body_bsdf = body_nodes.get("Principled BSDF")
base_node = image_node(body_material, texture_paths["base"], "AzureCoil Body Base Color", "sRGB")
normal_node = image_node(body_material, texture_paths["normal"], "AzureCoil Body Tangent Normal", "Non-Color")
rough_node = image_node(body_material, texture_paths["roughness"], "AzureCoil Body Roughness", "Non-Color")
emissive_node = image_node(body_material, texture_paths["emissive"], "AzureCoil Body Emissive", "sRGB")
normal_map = body_nodes.new("ShaderNodeNormalMap")
normal_map.name = "AzureCoil Body Normal Map"
normal_map.inputs["Strength"].default_value = 0.72
body_links.new(base_node.outputs["Color"], input_socket(body_bsdf, "Base Color"))
body_links.new(normal_node.outputs["Color"], normal_map.inputs["Color"])
body_links.new(normal_map.outputs["Normal"], input_socket(body_bsdf, "Normal"))
body_links.new(rough_node.outputs["Color"], input_socket(body_bsdf, "Roughness"))
body_links.new(emissive_node.outputs["Color"], input_socket(body_bsdf, "Emission Color", "Emission"))
strength_socket = input_socket(body_bsdf, "Emission Strength")
if strength_socket is not None:
    strength_socket.default_value = 1.45

belly_material = make_principled_material("AzureCoil_Belly_Slate", (0.07, 0.28, 0.32, 1), 0.58, 0.04, (0.01, 0.08, 0.09, 1), 0.18)
fin_material = make_principled_material("AzureCoil_Fin_Membrane", (0.03, 0.42, 0.56, 1), 0.31, 0.08, (0.02, 0.25, 0.34, 1), 1.05, 0.12)
fin_base = image_node(fin_material, fin_texture_path, "AzureCoil Fin Base Color", "sRGB")
fin_bsdf = fin_material.node_tree.nodes.get("Principled BSDF")
fin_material.node_tree.links.new(fin_base.outputs["Color"], input_socket(fin_bsdf, "Base Color"))
accent_material = make_principled_material("AzureCoil_Biolume_Armor", (0.015, 0.32, 0.40, 1), 0.27, 0.42, (0.0, 0.23, 0.32, 1), 0.82)
eye_material = make_principled_material("AzureCoil_Eye_Amber", (0.82, 0.31, 0.025, 1), 0.16, 0.18, (1.0, 0.22, 0.01, 1), 3.4)
pupil_material = make_principled_material("AzureCoil_Eye_Cyan", (0.02, 0.08, 0.09, 1), 0.13, 0.22, (0.0, 0.75, 0.95, 1), 2.8)
mouth_material = make_principled_material("AzureCoil_Mouth", (0.10, 0.015, 0.035, 1), 0.54)
teeth_material = make_principled_material("AzureCoil_Teeth", (0.67, 0.82, 0.77, 1), 0.36, 0.02, (0.05, 0.11, 0.09, 1), 0.22)


def smooth_mesh(obj: bpy.types.Object) -> None:
    if not isinstance(obj.data, bpy.types.Mesh):
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def apply_transform(obj: bpy.types.Object) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def add_uv_sphere(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    segments: int = 48,
    rings: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_transform(obj)
    obj.data.materials.append(material)
    smooth_mesh(obj)
    return obj


def add_beveled_cube(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.15,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    apply_transform(obj)
    modifier = obj.modifiers.new("AzureCoil edge bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 3
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    obj.data.materials.append(material)
    smooth_mesh(obj)
    return obj


def join_objects(objects: Iterable[bpy.types.Object], name: str) -> bpy.types.Object:
    selected = [obj for obj in objects if obj is not None]
    if not selected:
        raise ValueError(f"No objects to join for {name}")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in selected:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = selected[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = name
    result.select_set(False)
    smooth_mesh(result)
    return result


def body_radius(y: float) -> tuple[float, float]:
    t = np.clip((BODY_RING_HEAD_Y - y) / (BODY_RING_HEAD_Y - BODY_RING_TAIL_Y), 0.0, 1.0)
    shoulder = math.sin(math.pi * (1.0 - t)) ** 0.35
    taper = (1.0 - t) ** 0.55
    radius_x = 0.18 + 0.82 * taper + 0.18 * shoulder
    radius_z = radius_x * (0.82 + 0.08 * math.cos(t * math.pi))
    return radius_x, radius_z


def create_body() -> bpy.types.Object:
    rings = 92
    segments = 40
    vertices: list[tuple[float, float, float]] = []
    uvs: list[tuple[float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    material_indices: list[int] = []
    ring_ys = np.linspace(BODY_RING_HEAD_Y, BODY_RING_TAIL_Y, rings)
    for ring_index, y in enumerate(ring_ys):
        rx, rz = body_radius(float(y))
        # A subtle built-in vertical contour avoids a perfectly machined tube in
        # bind pose without stealing motion from the skeleton.
        t = ring_index / (rings - 1)
        center_z = 0.10 * math.sin(t * math.pi * 1.6) * (1.0 - t)
        for segment in range(segments):
            angle = 2.0 * math.pi * segment / segments
            vertices.append((rx * math.cos(angle), float(y), center_z + rz * math.sin(angle)))
            uvs.append((1.0 - t, segment / segments))
    for ring in range(rings - 1):
        for segment in range(segments):
            nxt = (segment + 1) % segments
            a = ring * segments + segment
            b = ring * segments + nxt
            c = (ring + 1) * segments + nxt
            d = (ring + 1) * segments + segment
            faces.append((a, b, c, d))
            mid_angle = 2.0 * math.pi * (segment + 0.5) / segments
            material_indices.append(1 if math.sin(mid_angle) < -0.42 else 0)
    mesh = bpy.data.meshes.new("AzureCoil_DeformingBodyMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            uv_layer.data[loop_index].uv = uvs[vertex_index]
        polygon.material_index = material_indices[polygon.index]
        polygon.use_smooth = True
    obj = bpy.data.objects.new("AzureCoil_DeformingBody", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(body_material)
    obj.data.materials.append(belly_material)
    obj["azure_coil_semantic"] = "deforming-body"
    return obj


body = create_body()

# One deterministic Catmull-Clark pass gives the hero body a premium curved
# silhouette while preserving the browser budget. Apply it before skinning so
# every generated vertex receives explicit two-bone weights below.
body_subdivision = body.modifiers.new("AzureCoil Hero Silhouette", "SUBSURF")
body_subdivision.subdivision_type = "CATMULL_CLARK"
body_subdivision.levels = 1
body_subdivision.render_levels = 1
bpy.context.view_layer.objects.active = body
body.select_set(True)
bpy.ops.object.modifier_apply(modifier=body_subdivision.name)
body.select_set(False)


def create_armature() -> tuple[bpy.types.Object, list[str]]:
    armature_data = bpy.data.armatures.new("AzureCoil_ArmatureData")
    armature = bpy.data.objects.new("AzureCoil_Armature", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.show_in_front = True
    armature["azure_coil_semantic"] = "animated-rig"
    armature["asset_version"] = ASSET_VERSION
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    names: list[str] = []
    joints = np.linspace(HEAD_Y + 0.35, TAIL_Y, BODY_BONES + 1)
    previous = None
    for index in range(BODY_BONES):
        bone = armature_data.edit_bones.new(f"Body_{index:02d}")
        bone.head = (0.0, float(joints[index]), 0.0)
        bone.tail = (0.0, float(joints[index + 1]), 0.0)
        bone.parent = previous
        bone.use_connect = previous is not None
        bone.roll = 0.0
        names.append(bone.name)
        previous = bone

    def control(name: str, head: tuple[float, float, float], tail: tuple[float, float, float], parent_name: str):
        bone = armature_data.edit_bones.new(name)
        bone.head = head
        bone.tail = tail
        bone.parent = armature_data.edit_bones[parent_name]
        bone.use_connect = False
        return bone

    control("Jaw", (0.0, 5.55, -0.34), (0.0, 6.45, -0.34), names[0])
    control("Crown", (0.0, 5.1, 0.45), (0.0, 4.55, 1.25), names[0])
    control("Fin_L", (0.45, 1.7, 0.0), (1.55, 1.05, 0.2), names[7])
    control("Fin_R", (-0.45, 1.7, 0.0), (-1.55, 1.05, 0.2), names[7])
    control("TailRibbon_L", (0.0, -6.85, 0.0), (1.1, -8.2, 0.1), names[-1])
    control("TailRibbon_R", (0.0, -6.85, 0.0), (-1.1, -8.2, 0.1), names[-1])
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    return armature, names


armature, body_bone_names = create_armature()


def body_bone_coordinate(y: float) -> float:
    return np.clip((HEAD_Y + 0.35 - y) / (HEAD_Y + 0.35 - TAIL_Y) * (BODY_BONES - 1), 0.0, BODY_BONES - 1)


def bind_smooth_body(obj: bpy.types.Object) -> None:
    groups = [obj.vertex_groups.new(name=name) for name in body_bone_names]
    for vertex in obj.data.vertices:
        coordinate = body_bone_coordinate(vertex.co.y)
        lower = int(math.floor(coordinate))
        upper = min(BODY_BONES - 1, lower + 1)
        blend = coordinate - lower
        groups[lower].add([vertex.index], 1.0 - blend, "REPLACE")
        if upper != lower:
            groups[upper].add([vertex.index], blend, "REPLACE")
    modifier = obj.modifiers.new("AzureCoil Armature", "ARMATURE")
    modifier.object = armature
    # Explicit armature parenting is required by Blender 5.x's glTF skin
    # exporter; the keep-transform parent is identity in this authored scene.
    obj.parent = armature


def bind_rigid(obj: bpy.types.Object, bone_name: str) -> None:
    group = obj.vertex_groups.get(bone_name) or obj.vertex_groups.new(name=bone_name)
    group.add([vertex.index for vertex in obj.data.vertices], 1.0, "REPLACE")
    modifier = obj.modifiers.new("AzureCoil Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature


bind_smooth_body(body)

# Head shell: broad manta-like wedge and cheek armour, explicitly avoiding the
# reference creature's horned/open-mouth silhouette.
head_parts = [
    add_uv_sphere("Head_Cranium", (0.0, 5.36, 0.07), (1.08, 1.30, 0.70), body_material, 56, 28),
    add_uv_sphere("Head_Muzzle", (0.0, 6.23, -0.10), (0.82, 0.88, 0.45), body_material, 48, 24),
    add_uv_sphere("Head_Cheek_L", (0.70, 5.28, -0.03), (0.31, 0.67, 0.45), body_material, 32, 18),
    add_uv_sphere("Head_Cheek_R", (-0.70, 5.28, -0.03), (0.31, 0.67, 0.45), body_material, 32, 18),
    add_beveled_cube("Head_Brow_L", (0.52, 6.03, 0.39), (0.48, 0.56, 0.10), body_material, rotation=(0.10, -0.11, -0.18), bevel=0.12),
    add_beveled_cube("Head_Brow_R", (-0.52, 6.03, 0.39), (0.48, 0.56, 0.10), body_material, rotation=(0.10, 0.11, 0.18), bevel=0.12),
]
head_shell = join_objects(head_parts, "AzureCoil_HeadShell")
bind_rigid(head_shell, body_bone_names[0])
head_shell["azure_coil_semantic"] = "original-manta-crown-head"

jaw_parts = [
    add_uv_sphere("Jaw_Lower", (0.0, 6.15, -0.52), (0.86, 0.92, 0.28), belly_material, 44, 20),
    add_beveled_cube("Jaw_Chin", (0.0, 6.50, -0.48), (0.62, 0.32, 0.17), belly_material, bevel=0.10),
]
jaw = join_objects(jaw_parts, "AzureCoil_LowerJaw")
bind_rigid(jaw, "Jaw")
jaw["azure_coil_semantic"] = "breathing-jaw"

mouth = add_beveled_cube("AzureCoil_MouthCavity", (0.0, 6.66, -0.29), (0.66, 0.27, 0.075), mouth_material, bevel=0.08)
bind_rigid(mouth, "Jaw")

# Short, interlocking teeth keep the mouth predatory but predominantly closed.
teeth: list[bpy.types.Object] = []
for side in (-1.0, 1.0):
    for index, y in enumerate(np.linspace(6.35, 6.84, 5)):
        bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.075, radius2=0.018, depth=0.24, location=(side * (0.34 + 0.07 * index), float(y), -0.26))
        tooth = bpy.context.object
        tooth.rotation_euler.x = math.radians(side * 7.0)
        tooth.data.materials.append(teeth_material)
        smooth_mesh(tooth)
        teeth.append(tooth)
teeth_mesh = join_objects(teeth, "AzureCoil_Teeth")
bind_rigid(teeth_mesh, "Jaw")

# Amber iris with a small cyan luminous core; flattened spheres read from both
# side and three-quarter review cameras.
eyes: list[bpy.types.Object] = []
pupils: list[bpy.types.Object] = []
for side in (-1.0, 1.0):
    eye = add_uv_sphere(f"Eye_{'L' if side > 0 else 'R'}", (side * 0.78, 6.12, 0.30), (0.15, 0.23, 0.18), eye_material, 28, 16)
    eye.rotation_euler.y = side * 0.22
    eyes.append(eye)
    pupil = add_uv_sphere(f"Pupil_{'L' if side > 0 else 'R'}", (side * 0.86, 6.28, 0.30), (0.075, 0.09, 0.085), pupil_material, 24, 14)
    pupils.append(pupil)
eye_mesh = join_objects(eyes, "AzureCoil_Eyes")
pupil_mesh = join_objects(pupils, "AzureCoil_Pupils")
bind_rigid(eye_mesh, body_bone_names[0])
bind_rigid(pupil_mesh, body_bone_names[0])

# Gill armour and shoulder jewels are joined by material to stay inside the draw
# budget while retaining a layered silhouette.
armour_parts: list[bpy.types.Object] = []
for side in (-1.0, 1.0):
    for index in range(3):
        armour_parts.append(add_uv_sphere(
            f"GillArmor_{side}_{index}",
            (side * (0.93 + index * 0.03), 5.05 - index * 0.34, 0.02 - index * 0.06),
            (0.18, 0.46, 0.42 - index * 0.05),
            accent_material,
            28,
            16,
        ))
gill_armour = join_objects(armour_parts, "AzureCoil_GillArmor")
bind_rigid(gill_armour, body_bone_names[0])


def create_panel_mesh() -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    bone_for_vertex: list[str] = []

    def panel(points: list[tuple[float, float, float]], bone: str) -> None:
        start = len(vertices)
        vertices.extend(points)
        bone_for_vertex.extend([bone] * len(points))
        # Fan from root vertex; winding is mirrored naturally by point order.
        for index in range(1, len(points) - 1):
            faces.append((start, start + index, start + index + 1))

    # Manta crown: swept, broad and horizontal rather than horned.
    panel([(0.0, 5.28, 0.55), (1.70, 4.75, 0.82), (2.38, 4.12, 0.58), (1.05, 4.44, 0.22)], "Crown")
    panel([(0.0, 5.28, 0.55), (-1.05, 4.44, 0.22), (-2.38, 4.12, 0.58), (-1.70, 4.75, 0.82)], "Crown")
    # Short swept whisker-fins.
    panel([(0.72, 5.75, -0.08), (1.78, 6.08, -0.26), (1.42, 5.48, -0.16), (0.80, 5.26, -0.04)], body_bone_names[0])
    panel([(-0.72, 5.75, -0.08), (-0.80, 5.26, -0.04), (-1.42, 5.48, -0.16), (-1.78, 6.08, -0.26)], body_bone_names[0])
    # Layered side sails: each side has two offset membranes.
    panel([(0.65, 1.85, 0.10), (2.75, 1.05, 0.62), (3.45, -0.05, 0.18), (1.02, 0.62, -0.22)], "Fin_L")
    panel([(0.58, 0.95, -0.02), (2.26, 0.20, -0.42), (2.72, -0.82, -0.22), (0.82, -0.12, 0.10)], "Fin_L")
    panel([(-0.65, 1.85, 0.10), (-1.02, 0.62, -0.22), (-3.45, -0.05, 0.18), (-2.75, 1.05, 0.62)], "Fin_R")
    panel([(-0.58, 0.95, -0.02), (-0.82, -0.12, 0.10), (-2.72, -0.82, -0.22), (-2.26, 0.20, -0.42)], "Fin_R")
    # Dorsal sails along the spine; bound to local chain bones.
    for y, bone_index, height, trail in [(2.75, 5, 1.45, 0.75), (0.30, 9, 1.28, 0.72), (-2.10, 13, 1.05, 0.68), (-4.35, 18, 0.82, 0.62)]:
        panel([(0.0, y + 0.52, body_radius(y)[1] * 0.92), (0.0, y, body_radius(y)[1] + height), (0.0, y - trail, body_radius(y)[1] * 0.96)], body_bone_names[bone_index])
    # Split ribbon tail and central luminous vane.
    panel([(0.0, -6.85, 0.0), (1.75, -8.25, 0.52), (0.78, -9.15, 0.16), (0.0, -7.75, -0.14)], "TailRibbon_L")
    panel([(0.0, -6.85, 0.0), (0.0, -7.75, -0.14), (-0.78, -9.15, 0.16), (-1.75, -8.25, 0.52)], "TailRibbon_R")

    mesh = bpy.data.meshes.new("AzureCoil_FinPanelsMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for local_index, loop_index in enumerate(polygon.loop_indices):
            vertex = mesh.loops[loop_index].vertex_index
            co = mesh.vertices[vertex].co
            uv_layer.data[loop_index].uv = ((co.x + 3.6) / 7.2, (co.y - TAIL_Y) / (HEAD_Y - TAIL_Y))
        polygon.use_smooth = True
    obj = bpy.data.objects.new("AzureCoil_FinPanels", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(fin_material)
    groups: dict[str, bpy.types.VertexGroup] = {}
    for vertex_index, bone in enumerate(bone_for_vertex):
        group = groups.get(bone)
        if group is None:
            group = obj.vertex_groups.new(name=bone)
            groups[bone] = group
        group.add([vertex_index], 1.0, "REPLACE")
    solidify = obj.modifiers.new("AzureCoil Fin Membrane Thickness", "SOLIDIFY")
    solidify.thickness = 0.045
    solidify.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bevel = obj.modifiers.new("AzureCoil Fin Soft Edge", "BEVEL")
    bevel.width = 0.028
    bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    modifier = obj.modifiers.new("AzureCoil Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    obj["azure_coil_semantic"] = "layered-manta-sails-and-ribbon-tail"
    return obj


fins = create_panel_mesh()


def create_scale_armour() -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int, int]] = []
    bones: list[str] = []
    for row_index, angle in enumerate([-0.52, 0.18, 0.90, math.pi - 0.90, math.pi - 0.18, math.pi + 0.52]):
        for y_index, y in enumerate(np.linspace(3.85, -5.85, 18)):
            offset_y = float(y + (row_index % 2) * 0.13)
            rx, rz = body_radius(offset_y)
            normal = mathutils.Vector((math.cos(angle), 0.0, math.sin(angle))).normalized()
            centre = mathutils.Vector((rx * math.cos(angle), offset_y, rz * math.sin(angle))) + normal * 0.035
            tangent_y = mathutils.Vector((0.0, 0.17, 0.0))
            tangent_theta = mathutils.Vector((-math.sin(angle) * 0.12, 0.0, math.cos(angle) * 0.12))
            start = len(vertices)
            vertices.extend([
                tuple(centre + tangent_y),
                tuple(centre + tangent_theta),
                tuple(centre - tangent_y),
                tuple(centre - tangent_theta),
            ])
            faces.append((start, start + 1, start + 2, start + 3))
            bone_index = int(round(body_bone_coordinate(offset_y)))
            bones.extend([body_bone_names[bone_index]] * 4)
    mesh = bpy.data.meshes.new("AzureCoil_ArmourScalesMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj = bpy.data.objects.new("AzureCoil_ArmourScales", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(accent_material)
    groups: dict[str, bpy.types.VertexGroup] = {}
    for index, bone in enumerate(bones):
        group = groups.get(bone)
        if group is None:
            group = obj.vertex_groups.new(name=bone)
            groups[bone] = group
        group.add([index], 1.0, "REPLACE")
    solidify = obj.modifiers.new("AzureCoil Armour Thickness", "SOLIDIFY")
    solidify.thickness = 0.028
    solidify.offset = 0.0
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=solidify.name)
    bevel = obj.modifiers.new("AzureCoil Armour Soft Edge", "BEVEL")
    bevel.width = 0.016
    bevel.segments = 2
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    obj.select_set(False)
    modifier = obj.modifiers.new("AzureCoil Armature", "ARMATURE")
    modifier.object = armature
    obj.parent = armature
    obj["azure_coil_semantic"] = "bioluminescent-armour-scales"
    return obj


scale_armour = create_scale_armour()

# Attach consistent runtime metadata and disable any implication that the asset
# is gameplay authority. Three.js reinforces these flags and disables raycasts.
export_objects = [
    armature,
    body,
    head_shell,
    jaw,
    mouth,
    teeth_mesh,
    eye_mesh,
    pupil_mesh,
    gill_armour,
    fins,
    scale_armour,
]
for obj in export_objects:
    obj["asset_version"] = ASSET_VERSION
    obj["asset_owner"] = "Atomic Acres project"
    obj["asset_license"] = "Original project work"
    obj["presentation_only"] = True
    obj["blocks_shots"] = False

# Author a seamless local swim cycle. The head is stable, then wave amplitude
# and lag increase toward the tail. Secondary controls breathe and trail.
bpy.context.view_layer.objects.active = armature
for pose_bone in armature.pose.bones:
    pose_bone.rotation_mode = "XYZ"
frames = list(range(ANIMATION_START, ANIMATION_END + 1, 4))
if frames[-1] != ANIMATION_END:
    frames.append(ANIMATION_END)
for frame in frames:
    t = (frame - ANIMATION_START) / (ANIMATION_END - ANIMATION_START)
    for index, name in enumerate(body_bone_names):
        bone = armature.pose.bones[name]
        tail_factor = index / (BODY_BONES - 1)
        phase = 2.0 * math.pi * (t - tail_factor * 0.92)
        amplitude = 0.012 + 0.094 * tail_factor ** 1.35
        bone.rotation_euler = (
            0.014 * tail_factor * math.cos(phase * 0.82 + 0.4),
            0.010 * tail_factor * math.sin(phase * 0.55),
            amplitude * math.sin(phase),
        )
        bone.keyframe_insert(data_path="rotation_euler", frame=frame, group="AzureCoil Swim Body")

    jaw_bone = armature.pose.bones["Jaw"]
    jaw_bone.rotation_euler = (0.028 + 0.030 * (0.5 + 0.5 * math.sin(2.0 * math.pi * t * 2.0)), 0.0, 0.0)
    jaw_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group="AzureCoil Breath")
    crown = armature.pose.bones["Crown"]
    crown.rotation_euler = (0.018 * math.sin(2.0 * math.pi * t), 0.0, 0.025 * math.cos(2.0 * math.pi * t))
    crown.keyframe_insert(data_path="rotation_euler", frame=frame, group="AzureCoil Secondary Fins")
    for name, phase_offset, sign in [("Fin_L", 0.0, 1.0), ("Fin_R", 0.5, -1.0)]:
        fin_bone = armature.pose.bones[name]
        fin_bone.rotation_euler = (0.055 * math.sin(2.0 * math.pi * (t + phase_offset)), sign * 0.02, sign * 0.038 * math.cos(2.0 * math.pi * t))
        fin_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group="AzureCoil Secondary Fins")
    for name, phase_offset, sign in [("TailRibbon_L", 0.0, 1.0), ("TailRibbon_R", 0.16, -1.0)]:
        tail_bone = armature.pose.bones[name]
        tail_bone.rotation_euler = (0.04 * math.cos(2.0 * math.pi * (t + phase_offset)), 0.0, sign * 0.13 * math.sin(2.0 * math.pi * (t + phase_offset)))
        tail_bone.keyframe_insert(data_path="rotation_euler", frame=frame, group="AzureCoil Tail Ribbons")

if armature.animation_data is None or armature.animation_data.action is None:
    raise RuntimeError("Azure Coil animation action was not created")
action = armature.animation_data.action
action.name = "AzureCoil_Swim"
action["loop_start_frame"] = ANIMATION_START
action["loop_end_frame"] = ANIMATION_END
action["loop_duration_seconds"] = (ANIMATION_END - ANIMATION_START) / ANIMATION_FPS
# Blender 5.x actions use layered/slotted channel bags rather than the legacy
# Action.fcurves collection. Keyframe insertion already authored the default
# Bezier interpolation, so no deprecated fcurve mutation is required here.

# Preview-only studio, ocean disc, and lights.
preview_collection = bpy.data.collections.new("AzureCoil_PreviewOnly")
scene.collection.children.link(preview_collection)

bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=11.5, depth=0.18, location=(0.0, -0.3, -2.55))
preview_plinth = bpy.context.object
preview_plinth.name = "Preview_Ocean_Plinth"
for collection in list(preview_plinth.users_collection):
    collection.objects.unlink(preview_plinth)
preview_collection.objects.link(preview_plinth)
preview_material = make_principled_material("Preview Ocean", (0.005, 0.035, 0.075, 1), 0.16, 0.42, (0.0, 0.08, 0.16, 1), 0.9)
preview_plinth.data.materials.append(preview_material)


def add_area_light(name: str, location: tuple[float, float, float], energy: float, color: tuple[float, float, float], size: float) -> bpy.types.Object:
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    preview_collection.objects.link(obj)
    obj.location = location
    return obj


def point_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = mathutils.Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


key = add_area_light("Preview_Key", (8.5, 10.0, 10.5), 1800.0, (0.47, 0.80, 1.0), 6.0)
fill = add_area_light("Preview_Fill", (-9.0, 4.0, 4.2), 940.0, (0.72, 0.31, 0.16), 7.0)
rim = add_area_light("Preview_Rim", (0.0, -10.0, 8.5), 1500.0, (0.03, 0.95, 0.90), 5.0)
for light in (key, fill, rim):
    point_at(light, (0.0, 0.0, 0.0))

camera_data = bpy.data.cameras.new("AzureCoil_PreviewCamera")
camera = bpy.data.objects.new("AzureCoil_PreviewCamera", camera_data)
preview_collection.objects.link(camera)
camera.location = (15.6, 21.0, 9.6)
camera_data.lens = 60
camera_data.sensor_width = 36
point_at(camera, (0.0, -0.9, -0.25))
scene.camera = camera
scene.view_settings.look = "AgX - Medium High Contrast"
scene.frame_set(37)

# Save the editable source with the preview studio, then export only the selected
# runtime objects. Textures are packed into the blend and embedded by glTF.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
bpy.ops.object.select_all(action="DESELECT")
for obj in export_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = armature
bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_frame_range=True,
    export_skins=True,
    export_morph=False,
    export_cameras=False,
    export_lights=False,
    export_extras=True,
    export_materials="EXPORT",
    export_image_format="AUTO",
)

# Render after export so the preview studio never enters the runtime GLB.
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.render.render(write_still=True)


def parse_glb(path: Path) -> dict:
    data = path.read_bytes()
    if data[:4] != b"glTF" or struct.unpack_from("<I", data, 4)[0] != 2:
        raise RuntimeError("Export is not glTF 2.0 binary")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB first chunk is not JSON")
    document = json.loads(data[20:20 + json_length].decode("utf-8").rstrip(" \t\r\n\x00"))
    external_uris = []
    for section in ("buffers", "images"):
        for entry in document.get(section, []):
            if isinstance(entry.get("uri"), str):
                external_uris.append(entry["uri"])
    triangles = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            accessor_index = primitive.get("indices")
            if accessor_index is not None:
                triangles += document["accessors"][accessor_index].get("count", 0) // 3
    return {
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
        "images": len(document.get("images", [])),
        "skins": len(document.get("skins", [])),
        "animations": [entry.get("name", "") for entry in document.get("animations", [])],
        "triangles": triangles,
        "externalUris": external_uris,
    }


glb_stats = parse_glb(GLB_PATH)
if glb_stats["skins"] < 1:
    raise RuntimeError("Exported Azure Coil GLB has no skin")
if "AzureCoil_Swim" not in glb_stats["animations"]:
    raise RuntimeError(f"Exported Azure Coil GLB is missing AzureCoil_Swim: {glb_stats['animations']}")
if glb_stats["externalUris"]:
    raise RuntimeError(f"Exported Azure Coil GLB has external URIs: {glb_stats['externalUris']}")

source_textures = []
for path in [*texture_paths.values(), fin_texture_path]:
    source_textures.append({"path": str(path.relative_to(ROOT)).replace("\\", "/"), "sha256": sha256(path), "bytes": path.stat().st_size})

provenance = {
    "schemaVersion": 1,
    "assetId": "atomic-acres-azure-coil-leviathan-2026-07-28",
    "assetVersion": ASSET_VERSION,
    "kind": "original-project-rigged-animated-creature",
    "creator": "Atomic Acres project / Hermes",
    "license": "Original project work",
    "generatedAsOf": "2026-07-28",
    "source": str(SCRIPT_PATH.relative_to(ROOT)).replace("\\", "/"),
    "sourceSha256": sha256(SCRIPT_PATH),
    "sourceBlend": str(BLEND_PATH.relative_to(ROOT)).replace("\\", "/"),
    "sourceBlendSha256": sha256(BLEND_PATH),
    "runtimeGlb": str(GLB_PATH.relative_to(ROOT)).replace("\\", "/"),
    "runtimeGlbSha256": sha256(GLB_PATH),
    "preview": str(PREVIEW_PATH.relative_to(ROOT)).replace("\\", "/"),
    "previewSha256": sha256(PREVIEW_PATH),
    "sourceTextures": source_textures,
    "blenderVersion": bpy.app.version_string,
    "pythonHashSeed": os.environ["PYTHONHASHSEED"],
    "randomSeed": RNG_SEED,
    "animation": {
        "name": "AzureCoil_Swim",
        "fps": ANIMATION_FPS,
        "startFrame": ANIMATION_START,
        "endFrame": ANIMATION_END,
        "durationSeconds": (ANIMATION_END - ANIMATION_START) / ANIMATION_FPS,
        "bodyBones": BODY_BONES,
        "controlBones": 6,
    },
    "glb": {**glb_stats, "bytes": GLB_PATH.stat().st_size},
    "originality": {
        "externalModelBytes": False,
        "externalImageBytes": False,
        "downloadedAssets": [],
        "referenceUse": "Broad large-blue-aquatic-serpentine-dragon concept only; protected franchise silhouette, identifiers, meshes, images, textures and markings are excluded.",
    },
    "authority": {
        "presentationOnly": True,
        "blocksShots": False,
        "rapierCollider": False,
        "ballisticSurface": False,
        "networkReplicated": False,
    },
}
PROVENANCE_PATH.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8", newline="\n")

print(json.dumps({
    "assetVersion": ASSET_VERSION,
    "blend": str(BLEND_PATH),
    "glb": str(GLB_PATH),
    "preview": str(PREVIEW_PATH),
    "provenance": str(PROVENANCE_PATH),
    "glbStats": glb_stats,
    "glbBytes": GLB_PATH.stat().st_size,
}, indent=2))
