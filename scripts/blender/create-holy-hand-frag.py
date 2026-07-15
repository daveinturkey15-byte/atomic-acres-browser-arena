"""Build Atomic Acres' original Sanctified Frag in Blender 4.x.

Outputs:
- public/assets/original/models/holy-hand-frag.glb
- source-assets/blender/holy-hand-frag.blend
- artifacts/holy-hand-frag/holy-hand-frag-preview.png

This is original project art inspired by the broad comedy-fantasy idea of a
ceremonial grenade. It does not use or derive from commercial game assets.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

PROJECT = Path("/root/jigglyclaw/projects/atomic-acres-browser-arena")
GLB_PATH = PROJECT / "public/assets/original/models/holy-hand-frag.glb"
BLEND_PATH = PROJECT / "source-assets/blender/holy-hand-frag.blend"
PREVIEW_PATH = PROJECT / "artifacts/holy-hand-frag/holy-hand-frag-preview.png"

for path in (GLB_PATH, BLEND_PATH, PREVIEW_PATH):
    path.parent.mkdir(parents=True, exist_ok=True)

# Deterministic clean scene.
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
    for datablock in list(datablocks):
        datablocks.remove(datablock)


def material(name: str, rgba: tuple[float, float, float, float], metallic: float, roughness: float):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def assign(obj, mat):
    obj.data.materials.append(mat)
    return obj


def smooth(obj):
    if hasattr(obj.data, "polygons"):
        for poly in obj.data.polygons:
            poly.use_smooth = True
    return obj


def bevel(obj, width=0.012, segments=2):
    mod = obj.modifiers.new("Readable edge bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj


def cube(name, location, dimensions, mat, rotation=(0.0, 0.0, 0.0), bevel_width=0.01):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(obj, mat)
    bevel(obj, bevel_width, 3)
    return obj


def cylinder(name, location, radius, depth, mat, rotation=(0.0, 0.0, 0.0), vertices=32, bevel_width=0.006):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    bevel(obj, bevel_width, 2)
    smooth(obj)
    return obj


def torus(name, location, major_radius, minor_radius, mat, rotation=(0.0, 0.0, 0.0), major_segments=32, minor_segments=8):
    bpy.ops.mesh.primitive_torus_add(
        align="WORLD",
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=location,
        rotation=rotation,
        major_radius=major_radius,
        minor_radius=minor_radius,
    )
    obj = bpy.context.object
    obj.name = name
    assign(obj, mat)
    smooth(obj)
    return obj


def parent_to(obj, parent):
    obj.parent = parent
    return obj


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


holy_gold = material("Holy Gold", (0.95, 0.56, 0.08, 1.0), 0.72, 0.22)
antique_gold = material("Antique Gold", (0.34, 0.14, 0.025, 1.0), 0.78, 0.30)
ivory = material("Blessed Ivory", (0.82, 0.74, 0.49, 1.0), 0.30, 0.38)
steel = material("Pin Steel", (0.16, 0.20, 0.22, 1.0), 0.88, 0.18)
ruby = material("Ruby Enamel", (0.58, 0.015, 0.025, 1.0), 0.35, 0.16)
dark = material("Recess Shadow", (0.025, 0.018, 0.012, 1.0), 0.20, 0.66)

root = bpy.data.objects.new("AtomicAcres_SanctifiedFrag", None)
bpy.context.collection.objects.link(root)
root["asset_id"] = "atomic-acres-sanctified-frag-v1"
root["creator"] = "Atomic Acres project"
root["license"] = "Original project work"
root["design_note"] = "Original comedic ceremonial grenade; no commercial mesh or texture source used."

# Main golden orb, slightly squat for a readable thrown silhouette.
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.205, location=(0.0, 0.0, 0.0))
body = bpy.context.object
body.name = "HHG_Body"
body.scale = (1.0, 1.0, 0.94)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
assign(body, holy_gold)
smooth(body)
parent_to(body, root)

# Three raised ceremonial bands keep the object legible while tumbling.
parent_to(torus("HHG_EquatorBand", (0, 0, 0), 0.201, 0.013, antique_gold), root)
parent_to(torus("HHG_MeridianBand_A", (0, 0, 0), 0.201, 0.012, ivory, rotation=(math.pi / 2, 0, 0)), root)
parent_to(torus("HHG_MeridianBand_B", (0, 0, 0), 0.201, 0.012, ivory, rotation=(0, math.pi / 2, 0)), root)

# Dark lower recess and ruby front jewel provide orientation at game scale.
parent_to(cylinder("HHG_BaseSeal", (0, 0, -0.184), 0.072, 0.026, dark), root)
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.034, location=(0.0, -0.194, 0.015))
jewel = bpy.context.object
jewel.name = "HHG_RubyJewel"
jewel.scale = (1.0, 0.38, 1.0)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
assign(jewel, ruby)
smooth(jewel)
parent_to(jewel, root)

# Crown/cap stack.
parent_to(cylinder("HHG_CrownCollar", (0, 0, 0.205), 0.100, 0.050, antique_gold), root)
parent_to(cylinder("HHG_CrownCap", (0, 0, 0.242), 0.074, 0.036, ivory), root)
for idx, angle in enumerate((0.0, math.pi / 2, math.pi, 3 * math.pi / 2)):
    x, y = math.cos(angle) * 0.070, math.sin(angle) * 0.070
    tooth = cube(
        f"HHG_CrownTooth_{idx + 1}",
        (x, y, 0.275),
        (0.045, 0.030, 0.082),
        antique_gold,
        rotation=(0, 0, angle),
        bevel_width=0.006,
    )
    parent_to(tooth, root)

# Cross finial: deliberately chunky so it survives a small projected size.
parent_to(cube("HHG_CrossStem", (0, 0, 0.360), (0.034, 0.026, 0.170), ivory, bevel_width=0.006), root)
parent_to(cube("HHG_CrossArm", (0, -0.001, 0.392), (0.126, 0.028, 0.034), ivory, bevel_width=0.006), root)

# Safety lever and pull ring—unique silhouette on the right side.
lever = cube(
    "HHG_SafetyLever",
    (-0.096, 0.010, 0.285),
    (0.190, 0.052, 0.026),
    steel,
    rotation=(0.0, -0.26, 0.02),
    bevel_width=0.009,
)
parent_to(lever, root)
parent_to(cylinder("HHG_PinStem", (0.112, 0.0, 0.252), 0.011, 0.105, steel, rotation=(0, math.pi / 2, 0), vertices=16, bevel_width=0.003), root)
parent_to(torus("HHG_PinRing", (0.210, 0.0, 0.258), 0.071, 0.009, steel, rotation=(math.pi / 2, 0.15, 0), major_segments=28, minor_segments=8), root)

# Add a tiny fuse stud under the lever for a convincing mechanical join.
parent_to(cylinder("HHG_FuseStud", (-0.030, 0, 0.255), 0.024, 0.050, ruby, vertices=20, bevel_width=0.004), root)

model_objects = [root, *root.children_recursive]
for obj in bpy.context.selected_objects:
    obj.select_set(False)
for obj in model_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = body

# Export only the authored grenade. glTF converts Blender Z-up to runtime Y-up.
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

# Preview stage, excluded from GLB because export has already completed.
plane_mat = material("Preview Ground", (0.028, 0.040, 0.055, 1.0), 0.05, 0.62)
bpy.ops.mesh.primitive_plane_add(size=7, location=(0, 0, -0.220))
plane = bpy.context.object
plane.name = "Preview_Ground"
assign(plane, plane_mat)

bpy.ops.object.light_add(type="AREA", location=(-1.8, -2.0, 2.8))
key = bpy.context.object
key.name = "Preview_Key"
key.data.energy = 720
key.data.shape = "DISK"
key.data.size = 2.2
look_at(key, (0, 0, 0.1))

bpy.ops.object.light_add(type="AREA", location=(2.0, -0.6, 1.1))
fill = bpy.context.object
fill.name = "Preview_Fill"
fill.data.energy = 440
fill.data.color = (0.24, 0.55, 1.0)
fill.data.size = 1.4
look_at(fill, (0, 0, 0.12))

bpy.ops.object.light_add(type="POINT", location=(0.2, 1.8, 1.2))
rim = bpy.context.object
rim.name = "Preview_Rim"
rim.data.energy = 310
rim.data.color = (1.0, 0.28, 0.08)

bpy.ops.object.camera_add(location=(1.15, -2.15, 1.12))
camera = bpy.context.object
camera.name = "Preview_Camera"
camera.data.lens = 64
look_at(camera, (0.0, 0.0, 0.12))
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 768
scene.render.resolution_y = 768
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = str(PREVIEW_PATH)
scene.render.film_transparent = False
scene.world.color = (0.008, 0.012, 0.020)
scene.view_settings.look = "AgX - Medium High Contrast"

# Save editable source after staging, then render the proof image.
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.render.render(write_still=True)

mesh_objects = [obj for obj in model_objects if obj.type == "MESH"]
vertices = sum(len(obj.data.vertices) for obj in mesh_objects)
triangles = sum(len(poly.vertices) - 2 for obj in mesh_objects for poly in obj.data.polygons)
print(f"HOLY_HAND_FRAG_READY objects={len(model_objects)} meshes={len(mesh_objects)} vertices={vertices} triangles={triangles}")
print(f"GLB={GLB_PATH}")
print(f"BLEND={BLEND_PATH}")
print(f"PREVIEW={PREVIEW_PATH}")
