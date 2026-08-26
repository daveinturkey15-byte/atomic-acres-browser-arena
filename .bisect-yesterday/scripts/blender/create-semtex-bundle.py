"""Author the project-original Semtex bundle, three world LODs, and PBR maps."""

from __future__ import annotations

import math
from array import array
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "artifacts/blender-semtex/raw"
TEXTURE_DIR = ROOT / "public/assets/original/textures/ordnance"
SOURCE_BLEND = ROOT / "source-assets/blender/semtex-bundle.blend"
REVIEW_PATH = ROOT / "docs/assets/pass65-ordnance/semtex-bundle-review.png"
SIZE = 256
for directory in (RAW_DIR, TEXTURE_DIR, SOURCE_BLEND.parent, REVIEW_PATH.parent):
    directory.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def reset_objects() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(blocks):
            blocks.remove(block)


def texture(name: str, kind: str):
    image = bpy.data.images.new(name, width=SIZE, height=SIZE, alpha=True)
    texture_path = TEXTURE_DIR / f"semtex-bundle-{kind}.png"
    image.filepath_raw = str(texture_path)
    image.colorspace_settings.name = "Non-Color" if kind in {"normal", "orm"} else "sRGB"
    pixels = [0.0] * (SIZE * SIZE * 4)
    for y in range(SIZE):
        for x in range(SIZE):
            u, v = x / (SIZE - 1), y / (SIZE - 1)
            grain = ((x * 31 + y * 17 + (x ^ y) * 7) % 97) / 96.0
            seam = abs((v * 8) % 1 - 0.5) > 0.46
            if kind == "albedo":
                value = [0.39 + grain * 0.07, 0.035 + grain * 0.018, 0.025 + grain * 0.012]
                if seam: value = [0.075, 0.018, 0.014]
            elif kind == "normal":
                value = [0.5 + (grain - 0.5) * 0.025, 0.5, 0.998]
            elif kind == "orm":
                value = [0.9, 0.64 + grain * 0.11, 0.03]
            else:
                pulse = 1.0 if 0.42 < u < 0.58 and 0.42 < v < 0.58 else 0.0
                value = [pulse * 0.07, pulse * 0.95, pulse]
            index = (y * SIZE + x) * 4
            pixels[index:index + 4] = [*value, 1.0]
    image.pixels.foreach_set(array("f", pixels))
    image.update()
    image.file_format = "PNG"
    image.save_render(str(texture_path))
    print(f"SEMTEX_TEXTURE_{kind.upper()} sample={tuple(round(value, 3) for value in image.pixels[:4])}")
    image.pack()
    return image


IMAGES = {kind: texture(f"Semtex bundle {kind}", kind) for kind in ("albedo", "normal", "orm", "emissive")}


def input_socket(node, *names):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None: return socket
    raise RuntimeError(f"missing socket {names}")


def pbr_material():
    material = bpy.data.materials.new("Semtex red PBR")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    albedo = nodes.new("ShaderNodeTexImage"); albedo.image = IMAGES["albedo"]
    normal_tex = nodes.new("ShaderNodeTexImage"); normal_tex.image = IMAGES["normal"]
    normal = nodes.new("ShaderNodeNormalMap"); normal.inputs["Strength"].default_value = 0.46
    orm = nodes.new("ShaderNodeTexImage"); orm.image = IMAGES["orm"]
    split = nodes.new("ShaderNodeSeparateColor")
    emissive = nodes.new("ShaderNodeTexImage"); emissive.image = IMAGES["emissive"]
    links.new(albedo.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(normal_tex.outputs["Color"], normal.inputs["Color"]); links.new(normal.outputs["Normal"], bsdf.inputs["Normal"])
    links.new(orm.outputs["Color"], split.inputs["Color"]); links.new(split.outputs["Green"], bsdf.inputs["Roughness"]); links.new(split.outputs["Blue"], bsdf.inputs["Metallic"])
    gltf_group = bpy.data.node_groups.get("glTF Material Output") or bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    if gltf_group.interface.items_tree.get("Occlusion") is None:
        gltf_group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    output = nodes.new("ShaderNodeGroup"); output.node_tree = gltf_group
    links.new(split.outputs["Red"], output.inputs["Occlusion"])
    links.new(emissive.outputs["Color"], input_socket(bsdf, "Emission Color", "Emission"))
    input_socket(bsdf, "Emission Strength").default_value = 0.25
    return material


def simple(name, color, metallic, roughness, emission=None):
    material = bpy.data.materials.new(name); material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic; bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        input_socket(bsdf, "Emission Color", "Emission").default_value = emission
        input_socket(bsdf, "Emission Strength").default_value = 3.0
    return material


def finish(obj, material, parent, bevel=0.0, segments=1, smooth=False):
    obj.data.materials.append(material); obj.parent = parent
    if bevel:
        modifier = obj.modifiers.new("Semtex manufactured edge", "BEVEL")
        modifier.width = bevel; modifier.segments = segments
        bpy.context.view_layer.objects.active = obj; bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth and hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons: polygon.use_smooth = True
    return obj


def cube(name, location, dimensions, material, parent, bevel, segments, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object; obj.name = name; obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, material, parent, bevel, segments)


def cylinder(name, location, radius, depth, material, parent, vertices, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object; obj.name = name
    return finish(obj, material, parent, 0.002, 1, True)


def wire(name, points, material, parent, resolution):
    curve = bpy.data.curves.new(name, "CURVE"); curve.dimensions = "3D"; curve.resolution_u = resolution
    curve.bevel_depth = 0.008; curve.bevel_resolution = resolution
    spline = curve.splines.new("BEZIER"); spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate; point.handle_left_type = "AUTO"; point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve); bpy.context.collection.objects.link(obj); obj.data.materials.append(material); obj.parent = parent
    return obj


def render_review(root) -> None:
    def look_at(obj, target):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()
    ground_material = simple("Semtex review ground", (0.018, 0.025, 0.029, 1), 0.12, 0.72)
    bpy.ops.mesh.primitive_plane_add(size=4, location=(0, 0, -0.285))
    ground = bpy.context.object; ground.name = "review-ground"; ground.data.materials.append(ground_material)
    for name, location, energy, color, size in (
        ("review-key", (-1.4, -1.5, 1.8), 720, (1.0, 0.36, 0.28), 1.4),
        ("review-rim", (1.5, 0.6, 1.1), 520, (0.2, 0.78, 1.0), 1.2),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        lamp = bpy.context.object; lamp.name = name; lamp.data.energy = energy; lamp.data.color = color; lamp.data.shape = "DISK"; lamp.data.size = size
        look_at(lamp, (0, 0, 0))
    bpy.ops.object.camera_add(location=(1.0, -1.7, 0.86))
    camera = bpy.context.object; camera.data.lens = 62; look_at(camera, (0, 0, 0.01))
    scene = bpy.context.scene; scene.camera = camera; scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 512; scene.render.resolution_y = 512; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"; scene.render.filepath = str(REVIEW_PATH)
    scene.world.color = (0.004, 0.007, 0.01); scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)


def build(lod: int):
    reset_objects()
    red = pbr_material()
    tape = simple("Semtex woven retaining tape", (0.035, 0.04, 0.038, 1), 0.05, 0.78)
    metal = simple("Semtex detonator steel", (0.31, 0.34, 0.36, 1), 0.8, 0.26)
    wire_mat = simple("Semtex insulated wire", (0.025, 0.035, 0.042, 1), 0.02, 0.55)
    sticky = simple("Semtex pressure adhesive", (0.61, 0.57, 0.42, 1), 0.0, 0.86)
    light = simple("Semtex arming lamp", (0.01, 0.18, 0.2, 1), 0.12, 0.25, (0.02, 0.9, 1.0, 1))
    root = bpy.data.objects.new("semtex-bundle-root", None); bpy.context.collection.objects.link(root)
    root["asset_id"] = "atomic-acres-semtex-bundle-v1"; root["license"] = "Original project work"; root["lod"] = lod
    segments = (3, 2, 1)[lod]; bevel = (0.014, 0.011, 0.008)[lod]
    for index, x in enumerate((-0.135, -0.045, 0.045, 0.135), 1):
        cube(f"semtex-block-{index}", (x, 0, 0), (0.082, 0.25, 0.54), red, root, bevel, segments)
    cube("semtex-wrap-band-horizontal", (0, 0, 0.02), (0.41, 0.265, 0.065), tape, root, 0.004, segments)
    cube("semtex-wrap-band-vertical", (0, 0, 0), (0.055, 0.27, 0.56), tape, root, 0.004, segments)
    cube("semtex-sticky-pad", (0, 0.137, 0), (0.39, 0.018, 0.5), sticky, root, 0.003, segments)
    cylinder("semtex-detonator", (0.0, -0.16, -0.05), 0.035, 0.22, metal, root, (32, 20, 12)[lod], (math.pi / 2, 0, 0))
    cylinder("semtex-fuse", (0.0, -0.19, -0.17), 0.022, 0.10, tape, root, (24, 16, 10)[lod], (math.pi / 2, 0, 0))
    cylinder("semtex-arming-light", (0.07, -0.145, -0.05), 0.019, 0.016, light, root, (20, 14, 8)[lod], (math.pi / 2, 0, 0))
    wire("semtex-wire", [(-0.04, -0.16, -0.06), (-0.13, -0.18, -0.17), (0.06, -0.18, -0.25), (0.12, -0.14, -0.11)], wire_mat, root, (3, 2, 1)[lod])
    held = bpy.data.objects.new("semtex-held-socket", None); bpy.context.collection.objects.link(held); held.location = (0, 0.15, 0); held.parent = root
    world = bpy.data.objects.new("semtex-world-socket", None); bpy.context.collection.objects.link(world); world.parent = root
    if lod == 0: bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for child in root.children_recursive: child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(filepath=str(RAW_DIR / f"semtex-bundle-lod{lod}.glb"), export_format="GLB", use_selection=True, export_yup=True, export_apply=True, export_materials="EXPORT", export_cameras=False, export_lights=False)
    if lod == 0: render_review(root)
    meshes = [child for child in root.children_recursive if child.type == "MESH"]
    triangles = sum(len(poly.vertices) - 2 for obj in meshes for poly in obj.data.polygons)
    print(f"SEMTEX_LOD{lod}_READY meshes={len(meshes)} triangles={triangles}")


for lod_index in (0, 1, 2): build(lod_index)
print(f"SEMTEX_SOURCE={SOURCE_BLEND}")
