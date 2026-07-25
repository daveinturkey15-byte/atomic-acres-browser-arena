"""Build the project's conventional fragmentation grenade in Blender 4+.

Outputs a gameplay-scale, original M67-style silhouette with a cast segmented
body, fuse head, safety lever, pull pin, and ring. No external mesh or texture
source is used.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


PROJECT = Path(__file__).resolve().parents[2]
GLB_PATH = PROJECT / "public/assets/original/models/frag-grenade.glb"
BLEND_PATH = PROJECT / "source-assets/blender/frag-grenade.blend"
PREVIEW_PATH = PROJECT / "artifacts/frag-grenade/frag-grenade-preview.png"

for path in (GLB_PATH, BLEND_PATH, PREVIEW_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    for datablock in list(datablocks):
        datablocks.remove(datablock)


def material(name: str, rgba: tuple[float, float, float, float], metallic: float, roughness: float):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return value


def finish(obj, mat, parent, bevel_width=0.006, smooth=True):
    obj.name = obj.name.replace(".", "_")
    obj.data.materials.append(mat)
    if bevel_width > 0:
        modifier = obj.modifiers.new("Manufactured edge bevel", "BEVEL")
        modifier.width = bevel_width
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth and hasattr(obj.data, "polygons"):
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.parent = parent
    return obj


def cube(name, location, dimensions, mat, parent, rotation=(0.0, 0.0, 0.0), bevel_width=0.006):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, mat, parent, bevel_width, False)


def cylinder(name, location, radius, depth, mat, parent, rotation=(0.0, 0.0, 0.0), vertices=32, bevel_width=0.005):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, parent, bevel_width)


def torus(name, location, major_radius, minor_radius, mat, parent, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=40,
        minor_segments=10,
        location=location,
        rotation=rotation,
        major_radius=major_radius,
        minor_radius=minor_radius,
    )
    obj = bpy.context.object
    obj.name = name
    return finish(obj, mat, parent, 0)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


olive = material("Olive cast steel", (0.19, 0.225, 0.09, 1.0), 0.22, 0.72)
olive_edge = material("Olive worn edge", (0.29, 0.31, 0.13, 1.0), 0.30, 0.58)
fuse_dark = material("Phosphate fuse", (0.075, 0.085, 0.07, 1.0), 0.72, 0.38)
lever_steel = material("Safety lever", (0.20, 0.22, 0.20, 1.0), 0.78, 0.31)
pin_steel = material("Pull pin", (0.36, 0.39, 0.37, 1.0), 0.90, 0.23)
marking = material("Safety marking", (0.72, 0.67, 0.35, 1.0), 0.05, 0.76)

root = bpy.data.objects.new("AtomicAcres_FragGrenade", None)
bpy.context.collection.objects.link(root)
root["asset_id"] = "atomic-acres-frag-grenade-v1"
root["creator"] = "Atomic Acres project"
root["license"] = "Original project work"
root["design_note"] = "Conventional fragmentation grenade silhouette; no external mesh or texture source."

# A squat subdivided sphere gives the body an immediately familiar cast-shell profile.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.185, location=(0.0, 0.0, -0.008))
body = bpy.context.object
body.name = "Frag_Body"
body.scale = (0.92, 0.92, 1.08)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
finish(body, olive, root, 0)

# Recessed-looking ribs break the shell into believable fragmentation segments.
for index, z in enumerate((-0.125, -0.057, 0.012, 0.081, 0.142)):
    torus(f"Frag_BodyRing_{index + 1}", (0, 0, z), max(0.09, 0.185 - abs(z) * 0.44), 0.005, olive_edge, root)
for index, angle in enumerate((0.0, math.pi / 3, 2 * math.pi / 3)):
    torus(
        f"Frag_BodyMeridian_{index + 1}",
        (0, 0, -0.008),
        0.178,
        0.0045,
        olive_edge,
        root,
        rotation=(math.pi / 2, 0, angle),
    )

cylinder("Frag_FuseCollar", (0, 0, 0.185), 0.084, 0.055, fuse_dark, root)
cylinder("Frag_FuseHead", (0, 0, 0.230), 0.057, 0.050, lever_steel, root)
cylinder("Frag_StrikerPivot", (-0.045, 0.0, 0.274), 0.018, 0.108, pin_steel, root, rotation=(0, math.pi / 2, 0), vertices=20)

lever = cube(
    "Frag_SafetyLever",
    (0.015, 0.032, 0.286),
    (0.094, 0.055, 0.235),
    lever_steel,
    root,
    rotation=(0.18, 0.0, -0.08),
    bevel_width=0.012,
)
lever["semantic"] = "safety-lever"
cube("Frag_LeverTip", (0.018, 0.044, 0.389), (0.105, 0.064, 0.038), lever_steel, root, rotation=(0.18, 0, -0.08), bevel_width=0.01)

cylinder("Frag_PinStem", (0.098, 0.0, 0.254), 0.008, 0.145, pin_steel, root, rotation=(0, math.pi / 2, 0), vertices=16, bevel_width=0.002)
torus("Frag_PullRing", (0.205, 0.0, 0.255), 0.066, 0.007, pin_steel, root, rotation=(math.pi / 2, 0.08, 0))

# Small non-emissive identification bands stay readable without turning the grenade into a novelty prop.
torus("Frag_MarkingBand", (0, 0, 0.118), 0.135, 0.007, marking, root)

model_objects = [root, *root.children_recursive]
bpy.ops.object.select_all(action="DESELECT")
for obj in model_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body

bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_materials="EXPORT",
    export_cameras=False,
    export_lights=False,
)

ground = material("Preview ground", (0.025, 0.030, 0.034, 1.0), 0.0, 0.68)
bpy.ops.mesh.primitive_plane_add(size=5, location=(0, 0, -0.205))
bpy.context.object.data.materials.append(ground)
for name, location, energy, color, size in (
    ("Preview key", (-1.7, -2.1, 2.4), 760, (1.0, 0.84, 0.62), 1.8),
    ("Preview fill", (1.8, -0.6, 1.2), 440, (0.35, 0.62, 1.0), 1.4),
):
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.color = color
    light.data.shape = "DISK"
    light.data.size = size
    look_at(light, (0, 0, 0.08))

bpy.ops.object.camera_add(location=(1.05, -2.05, 0.96))
camera = bpy.context.object
camera.data.lens = 68
look_at(camera, (0, 0, 0.09))
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW_PATH)
scene.world.color = (0.006, 0.009, 0.012)
scene.view_settings.look = "AgX - Medium High Contrast"

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.render.render(write_still=True)

meshes = [obj for obj in model_objects if obj.type == "MESH"]
vertices = sum(len(obj.data.vertices) for obj in meshes)
triangles = sum(len(poly.vertices) - 2 for obj in meshes for poly in obj.data.polygons)
print(f"FRAG_GRENADE_READY meshes={len(meshes)} vertices={vertices} triangles={triangles}")
print(f"GLB={GLB_PATH}")
print(f"BLEND={BLEND_PATH}")
print(f"PREVIEW={PREVIEW_PATH}")
