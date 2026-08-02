"""Author the Pass 65 chopper and fixed-wing support vehicle families.

The editable Blender files and deterministic generator are project-original.
Runtime GLBs are presentation-only; TypeScript retains route, collision, hit,
damage, targeting, and lifetime authority.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
CHOPPER_BLEND = ROOT / "source-assets/blender/pass65-chopper-gunner.blend"
AIRCRAFT_BLEND = ROOT / "source-assets/blender/pass65-support-aircraft-family.blend"
CHOPPER_RAW = ROOT / "artifacts/blender-support-vehicles/raw/chopper"
AIRCRAFT_RAW = ROOT / "artifacts/blender-support-vehicles/raw/aircraft"
TEXTURE_DIR = ROOT / "public/assets/original/textures/support"
CHOPPER_REVIEW = ROOT / "docs/assets/pass65-vehicles/chopper"
AIRCRAFT_REVIEW = ROOT / "docs/assets/pass65-vehicles/aircraft"
TEXTURE_SIZE = 512
REVIEW_SIZE = 512
REVIEW_TARGET = os.environ.get("PASS65_SUPPORT_REVIEW_TARGET", "")
FOCUSED_FP_REVIEW = REVIEW_TARGET == "chopper-fp"
FP_DIAGNOSTIC_REVIEW = REVIEW_TARGET == "chopper-fp-diagnostic"

for directory in (
    CHOPPER_BLEND.parent,
    CHOPPER_RAW,
    AIRCRAFT_RAW,
    TEXTURE_DIR,
    CHOPPER_REVIEW,
    AIRCRAFT_REVIEW,
):
    directory.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


def reset() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.actions,
        bpy.data.images,
        bpy.data.node_groups,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def make_texture(
    prefix: str,
    kind: str,
    palette: tuple[float, float, float],
    emissive_panel_seams: bool = True,
) -> bpy.types.Image:
    image = bpy.data.images.new(f"{prefix}_{kind.title()}", width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True)
    pixels: list[float] = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            u = x / (TEXTURE_SIZE - 1)
            v = y / (TEXTURE_SIZE - 1)
            panel_x = x % 128
            panel_y = y % 128
            seam = min(panel_x, panel_y, 127 - panel_x, 127 - panel_y) < 3
            micro = ((x * 31 + y * 47 + (x ^ y) * 11) % 113) / 112.0
            warning = ((x + y * 2) // 28) % 11 == 0 and 0.07 < u < 0.93 and 0.08 < v < 0.20
            if kind == "albedo":
                light = 0.84 + (micro - 0.5) * 0.08
                value = [palette[0] * light, palette[1] * light, palette[2] * light]
                if seam:
                    value = [component * 0.27 for component in palette]
                if warning:
                    value = [0.86, 0.27, 0.045]
            elif kind == "normal":
                value = [0.5 + (micro - 0.5) * 0.018, 0.5 + (u - 0.5) * 0.012, 1.0]
                if seam:
                    value = [0.42 if panel_x < 4 else 0.58, 0.42 if panel_y < 4 else 0.58, 0.986]
            elif kind == "orm":
                value = [0.72 if seam else 0.96, 0.28 + micro * 0.24, 0.86 if not warning else 0.44]
            else:
                cyan = emissive_panel_seams and seam and ((x // 128 + y // 128) % 2 == 0)
                green = emissive_panel_seams and abs(u - 0.5) < 0.018 and 0.35 < v < 0.68
                if cyan:
                    value = [0.01, 0.62, 1.0]
                elif green:
                    value = [0.05, 1.0, 0.38]
                elif emissive_panel_seams and warning:
                    value = [1.0, 0.08, 0.01]
                else:
                    value = [0.0, 0.0, 0.0]
            index = (y * TEXTURE_SIZE + x) * 4
            pixels[index:index + 4] = [*value, 1.0]
    image.colorspace_settings.name = "Non-Color" if kind in {"normal", "orm"} else "sRGB"
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"{prefix}-{kind}.png")
    image.save()
    image.pack()
    return image


def input_socket(node: bpy.types.Node, *names: str):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    raise RuntimeError(f"missing shader input {names}")


def textured_material(name: str, images: dict[str, bpy.types.Image], tint=(1.0, 1.0, 1.0, 1.0), emission=1.6):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = tint
    bsdf.inputs["Roughness"].default_value = 0.40
    bsdf.inputs["Metallic"].default_value = 0.84

    albedo = nodes.new("ShaderNodeTexImage")
    albedo.name = f"{name} Albedo"
    albedo.image = images["albedo"]
    links.new(albedo.outputs["Color"], bsdf.inputs["Base Color"])

    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.name = f"{name} Normal"
    normal_tex.image = images["normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.62
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    orm = nodes.new("ShaderNodeTexImage")
    orm.name = f"{name} ORM"
    orm.image = images["orm"]
    separate = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(separate.outputs["Blue"], bsdf.inputs["Metallic"])
    gltf_group = bpy.data.node_groups.get("glTF Material Output")
    if gltf_group is None:
        gltf_group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        gltf_group.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gltf_output = nodes.new("ShaderNodeGroup")
    gltf_output.name = "glTF Material Output"
    gltf_output.node_tree = gltf_group
    links.new(separate.outputs["Red"], gltf_output.inputs["Occlusion"])

    emissive = nodes.new("ShaderNodeTexImage")
    emissive.name = f"{name} Emissive"
    emissive.image = images["emissive"]
    links.new(emissive.outputs["Color"], input_socket(bsdf, "Emission Color", "Emission"))
    input_socket(bsdf, "Emission Strength").default_value = emission
    return material


def simple_material(name: str, color, metallic: float, roughness: float, emission=None, strength=0.0, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color[:3], alpha)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    if emission:
        input_socket(bsdf, "Emission Color", "Emission").default_value = (*emission[:3], 1.0)
        input_socket(bsdf, "Emission Strength").default_value = strength
    if alpha < 1.0:
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
        else:
            material.blend_method = "BLEND"
        material.use_transparency_overlap = False
    return material


def finish_mesh(obj, material, parent, bevel=0.0, smooth=False):
    obj.name = obj.name.replace(".", "_")
    obj["canonical_node_name"] = obj.name
    if material is not None:
        obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new("Manufactured edge bevel", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    obj.parent = parent
    return obj


def cube(name, location, dimensions, material, parent, rotation=(0.0, 0.0, 0.0), bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    result = finish_mesh(obj, material, parent, bevel=bevel)
    result["canonical_node_name"] = name
    return result


def text_mesh(name, text, location, size, material, parent, extrude=0.0012):
    """Create compact authored cockpit typography and convert it to exportable mesh geometry."""
    bpy.ops.object.text_add(location=location, rotation=(math.pi / 2, 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.body = text
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = size
    obj.data.space_character = 1.05
    # Cockpit labels are a few screen pixels tall.  Blender's default curve
    # resolution plus bevel generated more than forty thousand triangles for
    # six tiny strings, crowding out exterior silhouette detail.  Keep real,
    # shallow exportable glyph meshes but spend the topology where it remains
    # visible: the canopy, sensors, pylons, ordnance and rotor mechanics.
    obj.data.resolution_u = 1
    obj.data.bevel_resolution = 0
    obj.data.extrude = extrude * 0.35
    obj.data.bevel_depth = 0.0
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target="MESH")
    result = finish_mesh(obj, material, parent)
    result["canonical_node_name"] = name
    return result


def cylinder(name, location, radius, depth, material, parent, rotation=(0.0, 0.0, 0.0), vertices=24, bevel=0.008):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    result = finish_mesh(obj, material, parent, bevel=bevel, smooth=True)
    result["canonical_node_name"] = name
    return result


def sphere(name, location, scale, material, parent, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    result = finish_mesh(obj, material, parent, smooth=True)
    result["canonical_node_name"] = name
    return result


def loft(name, sections, material, parent, segments=16):
    """Build a smooth tapered fuselage from (y, z, x_radius, z_radius) rings."""
    vertices = []
    faces = []
    for y, z, radius_x, radius_z in sections:
        for segment in range(segments):
            angle = segment * math.tau / segments
            vertices.append((math.cos(angle) * radius_x, y, z + math.sin(angle) * radius_z))
    ring_count = len(sections)
    for ring in range(ring_count - 1):
        for segment in range(segments):
            current = ring * segments + segment
            following = ring * segments + (segment + 1) % segments
            upper = (ring + 1) * segments + segment
            upper_following = (ring + 1) * segments + (segment + 1) % segments
            faces.append((current, following, upper_following, upper))
    faces.append(tuple(reversed(range(segments))))
    last_ring = (ring_count - 1) * segments
    faces.append(tuple(last_ring + segment for segment in range(segments)))
    data = bpy.data.meshes.new(f"{name}_Mesh")
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    finish_mesh(obj, material, parent, bevel=0.025, smooth=True)
    obj["canonical_node_name"] = name
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def wing_panel(name, side, root_y, root_chord, span, sweep, tip_chord, z, thickness, material, parent):
    root_lead = root_y + root_chord * 0.5
    root_trail = root_y - root_chord * 0.5
    tip_y = root_y - sweep
    tip_lead = tip_y + tip_chord * 0.5
    tip_trail = tip_y - tip_chord * 0.5
    tip_x = side * span
    half = thickness * 0.5
    vertices = [
        (0, root_trail, z - half), (0, root_lead, z - half),
        (tip_x, tip_lead, z - half), (tip_x, tip_trail, z - half),
        (0, root_trail, z + half), (0, root_lead, z + half),
        (tip_x, tip_lead, z + half), (tip_x, tip_trail, z + half),
    ]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    data = bpy.data.meshes.new(f"{name}_Mesh")
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    finish_mesh(obj, material, parent, bevel=min(0.045, thickness * 0.22))
    obj["canonical_node_name"] = name
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def extruded_panel(name, outline, z, thickness, material, parent, bevel=0.025):
    """Build an authored shallow prism from an XY planform outline.

    This keeps stealth planforms and armour cheek plates as real silhouette
    geometry instead of disguising a generic fuselage with texture noise.
    """
    half = thickness * 0.5
    vertices = [(x, y, z - half) for x, y in outline] + [(x, y, z + half) for x, y in outline]
    count = len(outline)
    faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    data = bpy.data.meshes.new(f"{name}_Mesh")
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    finish_mesh(obj, material, parent, bevel=bevel)
    obj["canonical_node_name"] = name
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def strut_between(name, start, end, radius, material, parent, vertices=12):
    start = Vector(start)
    end = Vector(end)
    delta = end - start
    obj = cylinder(name, (start + end) * 0.5, radius, delta.length, material, parent, vertices=vertices, bevel=radius * 0.15)
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    return obj


def torus(name, location, major_radius, minor_radius, material, parent, segments=24, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=segments,
        minor_segments=max(8, segments // 4),
        major_radius=major_radius,
        minor_radius=minor_radius,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    result = finish_mesh(obj, material, parent, smooth=True)
    result["canonical_node_name"] = name
    return result


def wedge(name, location, dimensions, material, parent, rotation=(0.0, 0.0, 0.0)):
    sx, sy, sz = (value * 0.5 for value in dimensions)
    vertices = [
        (-sx * 0.72, -sy, -sz * 0.62), (sx * 0.72, -sy, -sz * 0.62),
        (sx, sy, -sz), (-sx, sy, -sz),
        (-sx * 0.58, -sy, sz * 0.48), (sx * 0.58, -sy, sz * 0.48),
        (sx * 0.82, sy, sz), (-sx * 0.82, sy, sz),
    ]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7)]
    data = bpy.data.meshes.new(f"{name}_Mesh")
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = rotation
    finish_mesh(obj, material, parent, bevel=0.035)
    obj["canonical_node_name"] = name
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def empty(name, location, parent, semantic=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.name = name
    obj["canonical_node_name"] = name
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.12
    obj.location = location
    obj.parent = parent
    if semantic:
        obj["atomic_socket"] = semantic
    return obj


def add_action(obj: bpy.types.Object, clip_name: str, keyframes, data_path: str, index=None) -> None:
    action = bpy.data.actions.new(f"{clip_name}__{obj.name}")
    obj.animation_data_create()
    obj.animation_data.action = action
    for frame, value in keyframes:
        if data_path == "rotation_euler":
            obj.rotation_mode = "XYZ"
            obj.rotation_euler[index] = value
            obj.keyframe_insert(data_path=data_path, index=index, frame=frame)
        elif data_path == "location":
            obj.location[index] = value
            obj.keyframe_insert(data_path=data_path, index=index, frame=frame)
        elif data_path == "scale":
            obj.scale = value
            obj.keyframe_insert(data_path=data_path, frame=frame)
        else:
            raise RuntimeError(data_path)
    track = obj.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, int(keyframes[0][0]), action)
    strip.action_frame_start = keyframes[0][0]
    strip.action_frame_end = keyframes[-1][0]
    obj.animation_data.action = None


def root_metadata(name: str, asset_id: str, lod: int, variant: str | None = None):
    root = empty(name, (0, 0, 0), None)
    root["asset_id"] = asset_id
    root["creator"] = "Atomic Acres project"
    root["license"] = "Original project work"
    root["quality_tier"] = f"LOD{lod}"
    root["runtime_forward_axis"] = "-Z"
    root["blender_authoring_forward_axis"] = "+Y"
    root["presentation_only"] = True
    if variant:
        root["presentation_variant"] = variant
    return root


def build_chopper(lod: int, materials):
    root = root_metadata(f"Pass65Chopper_LOD{lod}", "chopper-gunner-vehicle-v1", lod)
    root["visual_revision"] = "close-range-tandem-armored-airframe-v4"
    root["detail_contract"] = "layered-armour-framed-canopy-fasteners-sensors-ordnance-mechanics-v4"
    segments = (28, 20, 14)[lod]
    rings = (16, 12, 8)[lod]
    body = empty("chopper-fuselage", (0, 0, 0), root, "fuselage")
    loft(
        f"Chopper_TaperedFuselage_LOD{lod}",
        [(-0.55, 0.29, 1.14, 0.76), (-0.25, 0.27, 1.20, 0.80),
         (0.62, 0.10, 1.12, 0.63), (1.48, -0.12, 0.76, 0.38), (2.72, -0.27, 0.18, 0.11)],
        materials["armor"], body, max(12, segments // 2),
    )
    loft(
        f"Chopper_VentralKeel_LOD{lod}",
        [(-1.55, -0.35, 0.42, 0.28), (-0.10, -0.48, 0.66, 0.32), (1.35, -0.42, 0.54, 0.25), (2.62, -0.30, 0.12, 0.08)],
        materials["dark"], body, max(10, segments // 2),
    )
    # Faceted armoured nose and cheek modules create the narrow tandem attack-
    # helicopter silhouette without changing the existing support hit profile.
    wedge(
        f"Chopper_ArmoredNose_LOD{lod}", (0, 2.30, -0.08), (0.86, 0.86, 0.44),
        materials["armor"], body, rotation=(math.radians(-9), 0, 0),
    )
    for side in (-1, 1):
        wedge(
            f"Chopper_CheekArmor_{side}_LOD{lod}", (side * 0.53, 1.30, 0.01),
            (0.42, 1.36, 0.62), materials["dark"], body,
            rotation=(math.radians(-4), side * math.radians(8), side * math.radians(2)),
        )
        if lod < 2:
            cube(
                f"Chopper_CheekAccessPanel_{side}_LOD{lod}",
                (side * 0.755, 1.23, 0.02), (0.018, 0.54, 0.28),
                materials["panel_wear"], body,
                rotation=(0, 0, side * math.radians(2)), bevel=0.006,
            )
    # Narrow central transmission spine: the old full-width silver slab hid the
    # twin engine nacelles and made the aircraft read as a toy cabin block.
    cube(f"Chopper_EngineDeck_LOD{lod}", (0, -0.62, 0.94), (0.78, 1.30, 0.28), materials["armor"], body, bevel=0.13)
    if lod < 2:
        for side in (-1, 1):
            for panel, (y, z, length) in enumerate(((-0.62, 0.30, 0.62), (0.10, 0.24, 0.52), (0.78, 0.18, 0.42))):
                cube(
                    f"Chopper_FuselagePanelSeam_{side}_{panel}_LOD{lod}",
                    (side * 1.205, y, z), (0.014, length, 0.026),
                    materials["panel_seam"], body, bevel=0.002,
                )
                cylinder(
                    f"Chopper_FuselagePanelFastener_{side}_{panel}_LOD{lod}",
                    (side * 1.214, y + length * 0.35, z), 0.010, 0.012,
                    materials["panel_wear"], body,
                    rotation=(0, math.pi / 2, 0), vertices=8, bevel=0.001,
                )
    # Near-camera LODs retain real overlapping armour instead of relying on a
    # smooth loft and texture noise. LOD1 keeps only the two largest plates;
    # LOD0 carries the close-range hatches, raised edges and fasteners.
    if lod < 2:
        plate_layout = ((-1.04, 0.34, 0.72), (0.04, 0.24, 0.68), (0.82, 0.15, 0.52), (1.38, 0.04, 0.40))
        visible_plates = plate_layout if lod == 0 else plate_layout[:2]
        for side in (-1, 1):
            for plate, (y, z, length) in enumerate(visible_plates):
                wedge(
                    f"Chopper_OverlappingArmorPlate_{side}_{plate}_LOD{lod}",
                    (side * (1.18 - plate * 0.035), y, z),
                    (0.075, length, 0.48 - plate * 0.045),
                    materials["armor" if plate % 2 == 0 else "panel_wear"], body,
                    rotation=(math.radians(-2), side * math.radians(7), side * math.radians(1.5)),
                )
                if lod == 0:
                    for fastener, offset_y in enumerate((-length * 0.32, length * 0.32)):
                        cylinder(
                            f"Chopper_ArmorFastener_{side}_{plate}_{fastener}_LOD0",
                            (side * (1.225 - plate * 0.035), y + offset_y, z),
                            0.014, 0.018, materials["metal"], body,
                            rotation=(0, math.pi / 2, 0), vertices=8, bevel=0.001,
                        )
        extruded_panel(
            f"Chopper_DorsalArmorPanel_LOD{lod}",
            [(-0.42, -1.18), (0.42, -1.18), (0.50, -0.28), (-0.50, -0.28)],
            1.105, 0.065, materials["panel_wear"], body, bevel=0.012 if lod == 0 else 0.0,
        )
    if lod == 0:
        extruded_panel(
            "Chopper_NoseArmorCap_LOD0",
            [(-0.34, 1.92), (0.34, 1.92), (0.27, 2.56), (-0.27, 2.56)],
            0.205, 0.055, materials["panel_wear"], body, bevel=0.010,
        )
        for vent in range(4):
            cube(
                f"Chopper_EngineDeckLouver_{vent}_LOD0",
                (-0.27 + vent * 0.18, -0.70, 1.105), (0.095, 0.30, 0.025),
                materials["panel_seam"], body,
                rotation=(0, 0, math.radians(-3 + vent * 2)), bevel=0.003,
            )
    for side in (-1, 1):
        loft(
            f"Chopper_EnginePod_{side}_LOD{lod}",
            [(-1.60, 0.30, 0.30, 0.28), (-0.85, 0.35, 0.42, 0.36), (0.08, 0.24, 0.36, 0.31), (0.55, 0.14, 0.18, 0.20)],
            materials["armor"], body, max(10, segments // 2),
        ).location.x = side * 0.91
        cylinder(
            f"Chopper_EngineIntake_{side}_LOD{lod}", (side * 0.91, 0.60, 0.48), 0.16, 0.14,
            materials["dark"], body, rotation=(math.pi / 2, 0, 0),
            vertices=max(10, segments // 2), bevel=0.012,
        )
        cylinder(
            f"Chopper_EngineExhaust_{side}_LOD{lod}", (side * 0.91, -1.70, 0.50), 0.17, 0.32,
            materials["metal"], body, rotation=(math.pi / 2, 0, 0),
            vertices=max(10, segments // 2), bevel=0.014,
        )
        wing_panel(f"Chopper_Sponson_{side}_LOD{lod}", side, -0.08, 1.70, 1.34, 0.18, 0.68, -0.24, 0.16, materials["armor"], root)
        strut_between(
            f"Chopper_PylonBrace_{side}_LOD{lod}", (side * 0.78, -0.20, -0.08),
            (side * 1.38, -0.20, -0.28), 0.045, materials["metal"], root,
            max(8, segments // 3),
        )
        # Stub-wing stores use forward-aligned bodies and readable launch faces;
        # the former vertical rods were the main toy-block silhouette regression.
        cylinder(
            f"Chopper_RocketPod_{side}_LOD{lod}", (side * 1.18, -0.28, -0.30), 0.20, 0.82,
            materials["dark"], root, rotation=(math.pi / 2, 0, 0), vertices=max(10, segments // 2), bevel=0.02,
        )
        torus(
            f"Chopper_RocketPodMuzzleCollar_{side}_LOD{lod}",
            (side * 1.18, 0.145, -0.30), 0.178, 0.025,
            materials["metal"], root, max(14, segments // 2),
            rotation=(math.pi / 2, 0, 0),
        )
        rocket_offsets = (
            ((0.0, 0.0), (-0.075, 0.0), (0.075, 0.0), (-0.038, 0.070), (0.038, 0.070), (-0.038, -0.070), (0.038, -0.070))
            if lod == 0 else ((0.0, 0.0), (-0.065, 0.0), (0.065, 0.0), (0.0, 0.070))
            if lod == 1 else ((0.0, 0.0),)
        )
        for tube, (dx, dz) in enumerate(rocket_offsets):
            cylinder(
                f"Chopper_RocketTube_{side}_{tube}_LOD{lod}",
                (side * 1.18 + dx, 0.145, -0.30 + dz), 0.033, 0.035,
                materials["panel_seam"], root, rotation=(math.pi / 2, 0, 0),
                vertices=8, bevel=0.002,
            )
        missile_count = 2 if lod == 0 else 1
        for missile_index in range(missile_count):
            missile_z = -0.20 - missile_index * 0.20
            strut_between(
                f"Chopper_Missile_{side}_{missile_index}_LOD{lod}",
                (side * 1.58, -0.70, missile_z),
                (side * 1.58, 0.62, missile_z), 0.070,
                materials["metal"], root, max(8, segments // 3),
            )
            cylinder(
                f"Chopper_MissileSeeker_{side}_{missile_index}_LOD{lod}",
                (side * 1.58, 0.66, missile_z), 0.052, 0.10,
                materials["hudglass"], root, rotation=(math.pi / 2, 0, 0),
                vertices=max(8, segments // 3), bevel=0.006,
            )
            if lod < 2:
                cylinder(
                    f"Chopper_MissileBand_{side}_{missile_index}_LOD{lod}",
                    (side * 1.58, 0.34, missile_z), 0.076, 0.035,
                    materials["panel_wear"], root, rotation=(math.pi / 2, 0, 0),
                    vertices=8, bevel=0.002,
                )
                for fin in (-1, 1):
                    cube(
                        f"Chopper_MissileFin_{side}_{missile_index}_{fin}_LOD{lod}",
                        (side * 1.58 + fin * 0.075, -0.48, missile_z),
                        (0.10, 0.20, 0.018), materials["dark"], root,
                        rotation=(0, 0, math.radians(fin * 7)), bevel=0.006,
                    )
        strut_between(f"Chopper_Skid_{side}_LOD{lod}", (side * 0.91, -1.42, -1.02), (side * 0.91, 1.23, -1.02), 0.072, materials["metal"], root, max(10, segments // 2))
        for y in (-0.84, 0.70):
            strut_between(f"Chopper_SkidStrut_{side}_{y}_LOD{lod}", (side * 0.70, y, -0.52), (side * 0.91, y, -1.02), 0.052, materials["metal"], root, max(10, segments // 2))
            cylinder(
                f"Chopper_SkidDamper_{side}_{y}_LOD{lod}",
                (side * 0.80, y, -0.77), 0.066, 0.26,
                materials["dark"], root,
                rotation=(0, math.radians(side * 23), 0),
                vertices=max(8, segments // 3), bevel=0.008,
            )
        if lod < 2:
            for shoe, y in enumerate((-1.35, 1.16)):
                cube(
                    f"Chopper_SkidWearShoe_{side}_{shoe}_LOD{lod}",
                    (side * 0.91, y, -1.075), (0.16, 0.30, 0.055),
                    materials["panel_wear"], root, bevel=0.018,
                )

    rear = empty("chopper-rear-fuselage", (0, 0, 0), root, "rear-fuselage")
    rear["complete_rear_volume"] = True
    loft(
        f"Chopper_RearCabin_LOD{lod}",
        [(-2.72, 0.48, 0.42, 0.38), (-2.28, 0.43, 0.70, 0.52),
         (-1.52, 0.34, 1.01, 0.68), (-0.48, 0.29, 1.14, 0.75)],
        materials["armor"], rear, max(12, segments // 2),
    )
    cube(f"Chopper_RearEngineCowling_LOD{lod}", (0, -1.34, 0.93), (0.82, 1.18, 0.30), materials["armor"], rear, bevel=0.13)
    for side in (-1, 1):
        cube(
            f"Chopper_RearArmorDoor_{side}_LOD{lod}", (side * 0.93, -1.40, 0.32),
            (0.10, 1.18, 0.82), materials["dark"], rear,
            rotation=(0, math.radians(side * 5), 0), bevel=0.055,
        )
        cube(
            f"Chopper_RearDoorAccent_{side}_LOD{lod}", (side * 0.988, -1.40, 0.36),
            (0.018, 0.72, 0.055), materials["panel_wear"], rear, bevel=0.008,
        )
        if lod < 2:
            for seam_z in (0.02, 0.64):
                cube(
                    f"Chopper_RearDoorSeam_{side}_{seam_z}_LOD{lod}",
                    (side * 0.996, -1.40, seam_z), (0.014, 0.90, 0.018),
                    materials["panel_seam"], rear, bevel=0.002,
                )

    tail = empty("chopper-tail-boom", (0, 0, 0), root, "tail-boom")
    loft(
        f"Chopper_TailBoom_LOD{lod}",
        [(-2.45, 0.47, 0.48, 0.40), (-3.20, 0.58, 0.34, 0.28), (-4.20, 0.80, 0.22, 0.22), (-5.18, 1.05, 0.13, 0.16)],
        materials["armor"], tail, max(10, segments // 2),
    )
    if lod < 2:
        for band, y in enumerate((-2.82, -3.36, -3.92, -4.46)):
            cube(
                f"Chopper_TailDriveBand_{band}_LOD{lod}",
                (0, y, 0.66 + (abs(y) - 2.8) * 0.22),
                (0.46 - band * 0.055, 0.045, 0.42 - band * 0.045),
                materials["panel_seam"], tail, bevel=0.006,
            )
        cube(
            f"Chopper_TailServicePanel_LOD{lod}", (0.21, -3.52, 0.79),
            (0.020, 0.46, 0.22), materials["panel_wear"], tail,
            rotation=(0, 0, math.radians(4)), bevel=0.006,
        )
    tail_fin = empty("chopper-tail-fin", (0, 0, 0), tail, "tail-fin")
    wedge(f"Chopper_TailFin_LOD{lod}", (0, -4.72, 1.55), (0.20, 1.28, 1.55), materials["armor"], tail_fin, rotation=(math.radians(-12), 0, 0))
    cube(f"Chopper_TailFinTip_LOD{lod}", (0, -5.05, 2.10), (0.22, 0.34, 0.10), materials["accent"], tail_fin, rotation=(math.radians(-12), 0, 0), bevel=0.025)
    for side in (-1, 1):
        wing_panel(f"Chopper_TailPlane_{side}_LOD{lod}", side, -4.28, 0.72, 1.20, 0.14, 0.34, 0.82, 0.10, materials["armor"], tail)

    canopy_group = empty("chopper-sleek-cockpit-canopy", (0, 0, 0), root, "canopy")
    loft(
        f"Chopper_CanopyGlass_LOD{lod}",
        [(0.45, 0.49, 0.83, 0.54), (1.24, 0.50, 0.82, 0.66), (1.95, 0.36, 0.66, 0.58), (2.50, 0.07, 0.28, 0.28)],
        materials["glass"], canopy_group, max(14, segments // 2),
    )
    # Raised aft pilot cell over the lower forward gunner cell makes the tandem
    # layout readable at side/profile distance instead of one bulbous bubble.
    wedge(
        f"Chopper_TandemPilotCanopy_LOD{lod}", (0, 0.72, 0.88),
        (1.34, 1.24, 0.54), materials["glass"], canopy_group,
        rotation=(math.radians(-7), 0, 0),
    )
    wedge(
        f"Chopper_TandemGunnerCanopy_LOD{lod}", (0, 1.72, 0.54),
        (1.12, 1.20, 0.50), materials["glass"], canopy_group,
        rotation=(math.radians(-13), 0, 0),
    )
    strut_between(f"Chopper_CanopySpine_LOD{lod}", (0, 0.48, 1.02), (0, 2.36, 0.45), 0.045, materials["frame"], canopy_group, 10)
    for brace, (y, z, half_width) in enumerate(((0.92, 0.94, 0.72), (1.58, 0.76, 0.58), (2.10, 0.54, 0.40))):
        strut_between(
            f"Chopper_CanopyCrossBrace_{brace}_LOD{lod}",
            (-half_width, y, z), (half_width, y, z),
            0.034 if lod == 0 else 0.040, materials["frame"], canopy_group,
            max(8, segments // 3),
        )
    for side in (-1, 1):
        strut_between(f"Chopper_CanopyLowerRail_{side}_LOD{lod}", (side * 0.77, 0.52, 0.22), (side * 0.26, 2.43, -0.02), 0.043, materials["frame"], canopy_group, 10)
        strut_between(f"Chopper_CanopyPillar_{side}_LOD{lod}", (side * 0.74, 1.12, 0.08), (side * 0.57, 1.17, 1.00), 0.040, materials["frame"], canopy_group, 10)
        strut_between(
            f"Chopper_TandemDivider_{side}_LOD{lod}",
            (side * 0.58, 1.18, 0.18), (side * 0.50, 1.22, 1.11),
            0.050, materials["frame"], canopy_group, max(8, segments // 3),
        )
        if lod < 2:
            wedge(
                f"Chopper_CanopyArmourBrow_{side}_LOD{lod}",
                (side * 0.61, 1.28, 1.035), (0.20, 1.28, 0.17),
                materials["armor"], canopy_group,
                rotation=(math.radians(-9), side * math.radians(5), 0),
            )
    if lod == 0:
        extruded_panel(
            "Chopper_CanopyRoofArmor_LOD0",
            [(-0.34, 0.18), (0.34, 0.18), (0.48, 1.02), (-0.48, 1.02)],
            1.18, 0.075, materials["armor"], canopy_group, bevel=0.012,
        )
        for side in (-1, 1):
            for bolt, y in enumerate((0.42, 0.78)):
                cylinder(
                    f"Chopper_CanopyArmorBolt_{side}_{bolt}_LOD0",
                    (side * 0.36, y, 1.225), 0.015, 0.015,
                    materials["metal"], canopy_group, vertices=8, bevel=0.001,
                )

    # TADS-style turret sits below the nose, mechanically separated from the
    # canopy and chin gun, with dual day/thermal apertures.
    sensor = empty("chopper-nose-sensor", (0, 0, 0), root, "nose-sensor")
    sphere(
        f"Chopper_SensorTurret_LOD{lod}", (0, 2.40, -0.34), (0.30, 0.25, 0.28),
        materials["dark"], sensor, max(12, segments // 2), max(8, rings // 2),
    )
    for lens, (x, radius) in enumerate(((-0.095, 0.078), (0.085, 0.052))):
        cylinder(
            f"Chopper_SensorLens_{lens}_LOD{lod}", (x, 2.655, -0.33), radius, 0.055,
            materials["hudglass"], sensor, rotation=(math.pi / 2, 0, 0),
            vertices=max(10, segments // 2), bevel=0.004,
        )
    cylinder(
        f"Chopper_SensorMast_LOD{lod}", (0, 2.22, -0.18), 0.075, 0.26,
        materials["metal"], sensor, vertices=max(8, segments // 3), bevel=0.008,
    )

    cockpit = empty("chopper-first-person-cockpit", (0, 0, 0), root, "first-person-cockpit")
    cockpit["first_person_cockpit"] = True
    dashboard = empty("chopper-cockpit-dashboard-3d", (0, 0, 0), cockpit, "dashboard")
    wedge(f"Chopper_Dashboard_LOD{lod}", (0, 1.56, 0.11), (1.44, 0.48, 0.46), materials["cockpit"], dashboard, rotation=(math.radians(-10), 0, 0))
    mfd_labels = (("RADAR", "RNG 084"), ("ATTITUDE", "ALT 126"), ("WEAPON", "AMMO 84"))
    for index, (x, material) in enumerate(((-0.37, materials["screen_cyan"]), (0.0, materials["screen_green"]), (0.37, materials["screen_cyan"]))):
        cube(f"Chopper_MFD_Bezel_{index}_LOD{lod}", (x, 1.305, 0.21), (0.31, 0.052, 0.25), materials["frame"], dashboard, bevel=0.025)
        screen_name = "chopper-cockpit-display-cyan" if index == 0 else "chopper-cockpit-display-green" if index == 1 else f"chopper-cockpit-display-tactical-{lod}"
        screen = cube(screen_name, (x, 1.272, 0.21), (0.25, 0.016, 0.18), material, dashboard, bevel=0.012)
        if index == 0:
            cyan = screen
        if lod < 2:
            for button in range(4):
                cylinder(
                    f"Chopper_MFD_Button_{index}_{button}_LOD{lod}",
                    (x - 0.12 + button * 0.08, 1.245, 0.055), 0.014, 0.018,
                    materials["green" if (index + button) % 2 == 0 else "cyan"], dashboard,
                    rotation=(math.pi / 2, 0, 0), vertices=10, bevel=0.002,
                )
            for fastener, (dx, dz) in enumerate(((-0.132, -0.102), (0.132, -0.102), (-0.132, 0.102), (0.132, 0.102))):
                cylinder(
                    f"Chopper_MFD_Fastener_{index}_{fastener}_LOD{lod}", (x + dx, 1.244, 0.21 + dz),
                    0.006, 0.011, materials["panel_wear"], dashboard,
                    rotation=(math.pi / 2, 0, 0), vertices=8, bevel=0.001,
                )
            if index == 0:
                torus(f"Chopper_RadarSweepRing_LOD{lod}", (x, 1.248, 0.21), 0.060, 0.005, materials["green"], dashboard, 20, rotation=(math.pi / 2, 0, 0))
                cube(f"Chopper_RadarSweep_LOD{lod}", (x + 0.035, 1.241, 0.245), (0.085, 0.007, 0.009), materials["green"], dashboard, rotation=(0, math.radians(-40), 0), bevel=0.002)
                for blip, (dx, dz) in enumerate(((-0.040, 0.030), (0.052, -0.025), (0.018, 0.058))):
                    sphere(f"Chopper_RadarBlip_{blip}_LOD{lod}", (x + dx, 1.238, 0.21 + dz), (0.010, 0.006, 0.010), materials["cyan"], dashboard, 10, 6)
            elif index == 1:
                cube(f"Chopper_AttitudeHorizon_LOD{lod}", (x, 1.242, 0.21), (0.22, 0.007, 0.012), materials["cyan"], dashboard, rotation=(0, math.radians(-8), 0), bevel=0.002)
                for pitch in (-0.060, -0.030, 0.030, 0.060):
                    cube(f"Chopper_AttitudePitch_{pitch}_LOD{lod}", (x, 1.240, 0.21 + pitch), (0.10 if abs(pitch) > 0.04 else 0.065, 0.006, 0.007), materials["green"], dashboard, bevel=0.001)
                wedge(f"Chopper_AttitudeCraft_LOD{lod}", (x, 1.235, 0.205), (0.07, 0.012, 0.042), materials["muzzle"], dashboard, rotation=(math.pi / 2, 0, 0))
            else:
                torus(f"Chopper_WeaponReticle_LOD{lod}", (x, 1.248, 0.215), 0.048, 0.005, materials["cyan"], dashboard, 18, rotation=(math.pi / 2, 0, 0))
                cube(f"Chopper_WeaponCrossX_LOD{lod}", (x, 1.240, 0.215), (0.14, 0.006, 0.008), materials["green"], dashboard, bevel=0.001)
                cube(f"Chopper_WeaponCrossZ_LOD{lod}", (x, 1.240, 0.215), (0.008, 0.006, 0.14), materials["green"], dashboard, bevel=0.001)
                for bar in range(4):
                    cube(f"Chopper_AmmoBar_{bar}_LOD{lod}", (x + 0.105, 1.240, 0.155 + bar * 0.032), (0.015, 0.006, 0.020), materials["muzzle" if bar == 3 else "cyan"], dashboard, bevel=0.002)
        if lod == 0:
            label, readout = mfd_labels[index]
            text_mesh(f"Chopper_MFD_Label_{index}_LOD0", label, (x, 1.232, 0.282), 0.018, materials["hud_cyan"], dashboard)
            text_mesh(f"Chopper_MFD_Readout_{index}_LOD0", readout, (x, 1.231, 0.138), 0.016, materials["hud_green"], dashboard)
    if lod < 2:
        for index, material in enumerate((materials["green"], materials["cyan"], materials["muzzle"], materials["green"], materials["cyan"])):
            cube(f"Chopper_Annunciator_{index}_LOD{lod}", (-0.28 + index * 0.14, 1.255, 0.385), (0.075, 0.008, 0.018), material, dashboard, bevel=0.003)
        for switch, x in enumerate((-0.42, -0.28, -0.14, 0.0, 0.14, 0.28, 0.42)):
            cube(
                f"Chopper_UpperSwitchGuard_{switch}_LOD{lod}", (x, 1.268, 0.330), (0.046, 0.010, 0.052),
                materials["panel_seam"], dashboard, bevel=0.007,
            )
            cylinder(
                f"Chopper_UpperSwitch_{switch}_LOD{lod}", (x, 1.242, 0.330), 0.010, 0.020,
                materials["metal"], dashboard, rotation=(math.pi / 2, 0, 0), vertices=12, bevel=0.003,
            )
            cube(
                f"Chopper_UpperSwitchLever_{switch}_LOD{lod}", (x, 1.223, 0.337), (0.008, 0.009, 0.035),
                materials["panel_wear"], dashboard, rotation=(0, math.radians((-12 if switch % 2 == 0 else 12)), 0), bevel=0.003,
            )
            cube(
                f"Chopper_UpperSwitchLamp_{switch}_LOD{lod}", (x, 1.225, 0.365), (0.028, 0.007, 0.010),
                materials["green" if switch % 2 == 0 else "cyan"], dashboard, bevel=0.002,
            )
    dashboard.location.z = 0.30
    cube(f"Chopper_CentreConsole_LOD{lod}", (0, 0.91, -0.26), (0.36, 0.72, 0.24), materials["cockpit"], cockpit, rotation=(math.radians(-7), 0, 0), bevel=0.07)
    for side in (-1, 1):
        cube(f"Chopper_SideConsole_{side}_LOD{lod}", (side * 0.66, 0.88, -0.18), (0.27, 0.92, 0.20), materials["cockpit"], cockpit, bevel=0.055)
        cube(f"Chopper_SideConsole_Seam_{side}_LOD{lod}", (side * 0.66, 0.84, -0.072), (0.22, 0.64, 0.010), materials["panel_wear"], cockpit, bevel=0.002)
        for rivet, y in enumerate((0.58, 0.83, 1.08)):
            cylinder(
                f"Chopper_SideConsole_Fastener_{side}_{rivet}_LOD{lod}", (side * 0.66, y, -0.058),
                0.008, 0.010, materials["panel_wear"], cockpit, vertices=8, bevel=0.001,
            )
        cube(f"Chopper_Pedal_{side}_LOD{lod}", (side * 0.25, 1.44, -0.48), (0.24, 0.28, 0.055), materials["metal"], cockpit, rotation=(math.radians(12), 0, 0), bevel=0.02)
    cube(f"Chopper_Dashboard_UpperSeam_LOD{lod}", (0, 1.238, 0.355), (1.00, 0.008, 0.010), materials["panel_wear"], dashboard, bevel=0.002)
    cube(f"Chopper_Dashboard_LowerSeam_LOD{lod}", (0, 1.238, 0.010), (1.18, 0.008, 0.010), materials["panel_seam"], dashboard, bevel=0.002)
    for fastener, x in enumerate((-0.58, -0.30, 0.0, 0.30, 0.58)):
        cylinder(
            f"Chopper_Dashboard_Fastener_{fastener}_LOD{lod}", (x, 1.231, 0.355),
            0.006, 0.010, materials["panel_wear"], dashboard,
            rotation=(math.pi / 2, 0, 0), vertices=8, bevel=0.001,
        )
    cube(f"Chopper_PilotSeatBack_LOD{lod}", (0, 0.18, 0.04), (0.68, 0.26, 0.94), materials["seat"], cockpit, rotation=(math.radians(-8), 0, 0), bevel=0.11)
    cube(f"Chopper_PilotSeatBase_LOD{lod}", (0, 0.55, -0.34), (0.65, 0.70, 0.20), materials["seat"], cockpit, bevel=0.10)
    strut_between(f"Chopper_Cyclic_LOD{lod}", (0.43, 0.55, -0.24), (0.46, 0.75, 0.20), 0.032, materials["metal"], cockpit, 10)
    cube(f"Chopper_CyclicGrip_LOD{lod}", (0.46, 0.78, 0.25), (0.16, 0.10, 0.18), materials["dark"], cockpit, bevel=0.05)
    cube(f"Chopper_CyclicWearBand_LOD{lod}", (0.46, 0.725, 0.25), (0.13, 0.014, 0.035), materials["panel_wear"], cockpit, bevel=0.008)
    cylinder(f"Chopper_CyclicTrigger_LOD{lod}", (0.46, 0.722, 0.26), 0.018, 0.035, materials["muzzle"], cockpit, rotation=(math.pi / 2, 0, 0), vertices=10, bevel=0.002)
    strut_between(f"Chopper_Collective_LOD{lod}", (-0.42, 0.42, -0.18), (-0.49, 0.68, 0.16), 0.028, materials["metal"], cockpit, 10)
    cube(f"Chopper_CollectiveGrip_LOD{lod}", (-0.52, 0.72, 0.20), (0.24, 0.09, 0.13), materials["dark"], cockpit, bevel=0.04)
    cube(f"Chopper_CollectiveWearBand_LOD{lod}", (-0.52, 0.668, 0.20), (0.18, 0.012, 0.028), materials["panel_wear"], cockpit, bevel=0.006)
    cube(f"Chopper_CollectiveHatSwitch_LOD{lod}", (-0.58, 0.660, 0.24), (0.042, 0.014, 0.038), materials["hud_green"], cockpit, bevel=0.008)
    for side in (-1, 1):
        strut_between(f"Chopper_InnerWindscreenPillar_{side}_LOD{lod}", (side * 0.68, 0.95, 0.02), (side * 0.46, 2.18, 0.94), 0.035, materials["frame"], cockpit, 10)
        strut_between(f"Chopper_InnerWindscreenGlow_{side}_LOD{lod}", (side * 0.64, 1.00, 0.07), (side * 0.44, 2.14, 0.90), 0.012, materials["cyan"], cockpit, 8)
    strut_between(f"Chopper_InnerWindscreenHeader_LOD{lod}", (-0.47, 2.18, 0.94), (0.47, 2.18, 0.94), 0.035, materials["frame"], cockpit, 10)
    strut_between(f"Chopper_InnerWindscreenHeaderGlow_LOD{lod}", (-0.42, 2.15, 0.90), (0.42, 2.15, 0.90), 0.012, materials["green"], cockpit, 8)
    gunner_sightline = empty("chopper-gunner-sightline", (0, 0, 0), cockpit, "gunner-sightline")
    gunner_sightline["first_person_only"] = True
    gunner_sightline["gunner_sightline"] = True
    strut_between(f"Chopper_HUDMount_Left_LOD{lod}", (-0.083, 1.26, 0.65), (-0.083, 1.17, 0.675), 0.007, materials["metal"], gunner_sightline, 8)
    strut_between(f"Chopper_HUDMount_Right_LOD{lod}", (0.083, 1.26, 0.65), (0.083, 1.17, 0.675), 0.007, materials["metal"], gunner_sightline, 8)
    hud_glass = cube("chopper-cockpit-hud-glass", (0, 1.14, 0.72), (0.17, 0.012, 0.09), materials["hudglass"], gunner_sightline, rotation=(math.radians(-7), 0, 0), bevel=0.005)
    cube(f"Chopper_HUDBorderTop_LOD{lod}", (0, 1.127, 0.761), (0.17, 0.006, 0.006), materials["hud_cyan"], gunner_sightline, bevel=0.0015)
    cube(f"Chopper_HUDBorderBottom_LOD{lod}", (0, 1.127, 0.679), (0.17, 0.006, 0.006), materials["hud_cyan"], gunner_sightline, bevel=0.0015)
    for side in (-1, 1):
        cube(f"Chopper_HUDBorderSide_{side}_LOD{lod}", (side * 0.081, 1.127, 0.72), (0.006, 0.006, 0.09), materials["hud_cyan"], gunner_sightline, bevel=0.0015)
    torus("chopper-cockpit-hud-target-ring", (0, 1.120, 0.72), 0.023, 0.002, materials["hud_green"], gunner_sightline, max(16, segments // 2), rotation=(math.pi / 2, 0, 0))
    cube("chopper-cockpit-hud-reticle", (0, 1.116, 0.72), (0.044, 0.003, 0.003), materials["hud_green"], gunner_sightline, bevel=0.001)
    cube("chopper-cockpit-hud-horizon", (0, 1.114, 0.696), (0.070, 0.003, 0.003), materials["hud_cyan"], gunner_sightline, bevel=0.001)
    if lod < 2:
        for tick, x in enumerate((-0.065, -0.043, -0.022, 0.0, 0.022, 0.043, 0.065)):
            cube(f"Chopper_HUDHeadingTick_{tick}_LOD{lod}", (x, 1.110, 0.755), (0.0025, 0.0025, 0.009 if tick % 3 == 0 else 0.005), materials["hud_cyan"], gunner_sightline, bevel=0.001)
        for pitch, z in enumerate((0.692, 0.706, 0.734, 0.748)):
            cube(f"Chopper_HUDPitchLadder_{pitch}_LOD{lod}", (0, 1.109, z), (0.026 if pitch % 2 == 0 else 0.018, 0.0025, 0.002), materials["hud_green"], gunner_sightline, bevel=0.001)
    gunner_weapon = empty("chopper-gunner-weapon-view", (0, 0, 0), gunner_sightline, "gunner-weapon-view")
    gunner_weapon["gunner_weapon_presentation"] = True
    cube(f"Chopper_GunnerViewReceiver_LOD{lod}", (0.34, 0.91, 0.43), (0.16, 0.34, 0.13), materials["dark"], gunner_weapon, rotation=(math.radians(-5), 0, math.radians(-4)), bevel=0.035)
    for barrel in range(2 if lod < 2 else 1):
        offset = (barrel - 0.5) * 0.035 if lod < 2 else 0
        strut_between(
            f"Chopper_GunnerViewBarrel_{barrel}_LOD{lod}", (0.34 + offset, 1.02, 0.45),
            (0.34 + offset, 1.46, 0.39), 0.018, materials["metal"], gunner_weapon, max(8, segments // 3),
        )
    cube(f"Chopper_GunnerViewStatus_LOD{lod}", (0.34, 0.892, 0.49), (0.085, 0.012, 0.018), materials["hud_green"], gunner_weapon, bevel=0.004)
    empty("chopper-first-person-camera-socket", (0, 0.38, 0.74), root, "first-person-camera")

    main_rotor = empty("chopper-main-rotor", (0, -0.42, 1.72), root, "main-rotor")
    cylinder(f"Chopper_RotorMast_LOD{lod}", (0, -0.42, 1.38), 0.11, 0.72, materials["metal"], root, vertices=max(12, segments // 2))
    cube(f"Chopper_TransmissionCase_LOD{lod}", (0, -0.42, 1.16), (0.58, 0.66, 0.40), materials["dark"], root, bevel=0.12)
    cylinder(f"Chopper_RotorHub_LOD{lod}", (0, 0, 0), 0.22, 0.18, materials["metal"], main_rotor, vertices=max(12, segments // 2))
    cylinder(f"Chopper_RotorHubCap_LOD{lod}", (0, 0, 0.14), 0.13, 0.18, materials["panel_wear"], main_rotor, vertices=max(10, segments // 2))
    torus(f"Chopper_Swashplate_LOD{lod}", (0, -0.42, 1.56), 0.24, 0.035, materials["panel_wear"], root, max(16, segments // 2))
    for yoke in range(2):
        cube(
            f"Chopper_RotorYoke_{yoke}_LOD{lod}", (0, 0, 0.035 + yoke * 0.045),
            (1.06 if yoke == 0 else 0.28, 0.28 if yoke == 0 else 1.06, 0.10),
            materials["metal"], main_rotor, bevel=0.045,
        )
    blade_count = 4
    for index in range(blade_count):
        angle = index * math.tau / blade_count
        cube(f"Chopper_MainBlade_{index}_LOD{lod}", (0, 0, 0), (0.19, 7.45, 0.045), materials["blade"], main_rotor, rotation=(0, 0, angle), bevel=0.035)
        direction = Vector((math.sin(angle), math.cos(angle), 0.0))
        cube(
            f"Chopper_MainBladeGrip_{index}_LOD{lod}", tuple(direction * 0.42),
            (0.28, 0.78, 0.12), materials["metal"], main_rotor,
            rotation=(0, 0, angle), bevel=0.035,
        )
        cube(
            f"Chopper_MainBladeTip_{index}_LOD{lod}", tuple(direction * 3.58),
            (0.21, 0.26, 0.052), materials["accent"], main_rotor,
            rotation=(0, 0, angle), bevel=0.012,
        )
        if lod < 2:
            perpendicular = Vector((math.cos(angle), -math.sin(angle), 0.0))
            strut_between(
                f"Chopper_RotorPitchLink_{index}_LOD{lod}",
                tuple(direction * 0.18 + Vector((0, 0, -0.10))),
                tuple(direction * 0.42 + perpendicular * 0.06 + Vector((0, 0, -0.02))),
                0.018, materials["panel_wear"], main_rotor, 8,
            )
    add_action(main_rotor, "Chopper_Main_Rotor_Loop", [(1, 0.0), (13, math.tau), (25, math.tau * 2)], "rotation_euler", 2)

    tail_rotor = empty("chopper-tail-rotor", (0.32, -5.18, 1.12), root, "tail-rotor")
    sphere(f"Chopper_TailGearbox_LOD{lod}", (0.20, -5.18, 1.12), (0.20, 0.20, 0.20), materials["dark"], root, max(10, segments // 2), max(6, rings // 2))
    cylinder(f"Chopper_TailRotorHub_LOD{lod}", (0, 0, 0), 0.13, 0.18, materials["metal"], tail_rotor, rotation=(0, math.pi / 2, 0), vertices=max(10, segments // 2))
    for index in range(4):
        angle = index * math.tau / 4
        cube(f"Chopper_TailBlade_{index}_LOD{lod}", (0, 0, 0), (0.055, 1.28, 0.11), materials["blade"], tail_rotor, rotation=(angle, 0, 0), bevel=0.018)
        direction = Vector((0.0, math.sin(angle), math.cos(angle)))
        cube(
            f"Chopper_TailBladeGrip_{index}_LOD{lod}", tuple(direction * 0.18),
            (0.11, 0.34, 0.16), materials["metal"], tail_rotor,
            rotation=(angle, 0, 0), bevel=0.018,
        )
        cube(
            f"Chopper_TailBladeTip_{index}_LOD{lod}", tuple(direction * 0.59),
            (0.065, 0.16, 0.12), materials["accent"], tail_rotor,
            rotation=(angle, 0, 0), bevel=0.012,
        )
    add_action(tail_rotor, "Chopper_Tail_Rotor_Loop", [(1, 0.0), (13, math.tau * 1.5), (25, math.tau * 3)], "rotation_euler", 0)

    gun = empty("chopper-player-gun", (0, 0, 0), root, "gun")
    cylinder(f"Chopper_GunGimbal_LOD{lod}", (0, 1.18, -0.62), 0.30, 0.36, materials["dark"], gun, rotation=(0, math.pi / 2, 0), vertices=segments)
    cube(f"Chopper_GunReceiver_LOD{lod}", (0, 1.54, -0.76), (0.54, 0.92, 0.42), materials["metal"], gun, rotation=(math.radians(-4), 0, 0), bevel=0.07)
    for side in (-1, 1):
        wedge(
            f"Chopper_GunArmourShroud_{side}_LOD{lod}", (side * 0.27, 1.48, -0.70),
            (0.20, 0.72, 0.44), materials["dark"], gun,
            rotation=(math.radians(-4), side * math.radians(5), 0),
        )
    for barrel in range(3 if lod == 0 else 1):
        offset = (barrel - (1 if lod == 0 else 0)) * 0.075
        cylinder(f"Chopper_GunBarrel_{barrel}_LOD{lod}", (offset, 2.42, -0.82), 0.038, 1.72, materials["metal"], gun, rotation=(math.pi / 2, 0, 0), vertices=max(10, segments // 2), bevel=0.004)
    for collar, y in enumerate((1.82, 2.38, 2.92)):
        torus(
            f"Chopper_GunBarrelCollar_{collar}_LOD{lod}", (0, y, -0.82),
            0.105, 0.018, materials["dark"], gun,
            max(12, segments // 2), rotation=(math.pi / 2, 0, 0),
        )
    if lod == 0:
        for link in range(5):
            cube(
                f"Chopper_GunFeedLink_{link}_LOD0",
                (0.29 + link * 0.035, 1.20 + link * 0.07, -0.58 - link * 0.025),
                (0.10, 0.08, 0.07), materials["panel_wear"], gun,
                rotation=(0, math.radians(-10), math.radians(-8)), bevel=0.018,
            )
    empty("chopper-gun-muzzle-socket", (0, 3.32, -0.82), gun, "muzzle")
    muzzle = sphere("chopper-muzzle-flash", (0, 3.38, -0.82), (0.14, 0.27, 0.14), materials["muzzle"], gun, 12, 8)
    muzzle.scale = (0.001, 0.001, 0.001)
    tracer = cylinder("chopper-tracer-action", (0, 5.90, -0.82), 0.025, 4.8, materials["muzzle"], gun, rotation=(math.pi / 2, 0, 0), vertices=10, bevel=0)
    tracer.scale = (0.001, 0.001, 0.001)
    impact = sphere("chopper-impact-action", (0, 8.42, -0.82), (0.18, 0.18, 0.18), materials["muzzle"], gun, 12, 8)
    impact.scale = (0.001, 0.001, 0.001)
    add_action(gun, "Chopper_Gun_Recoil", [(1, 0.0), (2, -0.09), (5, 0.0)], "location", 1)
    add_action(muzzle, "Chopper_Muzzle_Flash", [(1, (0.001,) * 3), (2, (1.0,) * 3), (4, (0.001,) * 3)], "scale")
    add_action(tracer, "Chopper_Tracer_Pulse", [(1, (0.001,) * 3), (2, (1.0,) * 3), (4, (0.001,) * 3)], "scale")
    add_action(impact, "Chopper_Impact_Pulse", [(1, (0.001,) * 3), (3, (1.0,) * 3), (7, (0.001,) * 3)], "scale")
    add_action(hud_glass, "Chopper_Quiet_Loop", [(1, (1.0,) * 3), (13, (1.025, 1.0, 1.025)), (25, (1.0,) * 3)], "scale")
    add_action(cyan, "Chopper_Gun_Fire", [(1, (1.0,) * 3), (2, (1.05,) * 3), (4, (1.0,) * 3)], "scale")
    empty("chopper-forward-socket", (0, 3.75, -0.08), root, "forward")
    root["audio_semantic_ids"] = ["chopper-low-loop", "chopper-gun-report"]
    root["weapon_feedback"] = ["report", "gun-recoil", "muzzle-flash", "tracer", "impact", "owner-hit-confirm", "owner-damage-number"]
    return root


def build_care_aircraft(lod: int, materials):
    root = root_metadata(f"Pass65CareAircraft_LOD{lod}", "support-aircraft-family-v1", lod, "care")
    root["visual_revision"] = "close-range-heavy-cargo-aircraft-v4"
    root["detail_contract"] = "framed-flightdeck-panelled-hull-ramp-bogie-turbofans-v4"
    segments = (36, 26, 18)[lod]
    rings = (20, 14, 10)[lod]
    fuselage = empty("care-aircraft-fuselage", (0, 0, 0), root, "care-fuselage")
    loft(
        f"Care_TransportFuselage_LOD{lod}",
        [(-5.35, 0.32, 0.32, 0.28), (-4.82, 0.48, 0.92, 0.76), (-3.45, 0.34, 1.16, 1.00),
         (1.90, 0.24, 1.20, 1.02), (3.72, 0.20, 1.10, 0.90), (4.65, 0.08, 0.72, 0.62),
         (5.34, -0.06, 0.18, 0.15)],
        materials["armor"], fuselage, max(14, segments // 2),
    )
    loft(
        f"Care_HeavyBelly_LOD{lod}",
        [(-3.65, -0.34, 0.88, 0.52), (-1.60, -0.56, 1.00, 0.46),
         (1.55, -0.55, 1.02, 0.48), (3.20, -0.31, 0.78, 0.40)],
        materials["dark"], fuselage, max(12, segments // 2),
    )
    cube(
        f"Care_BoxedCargoHull_LOD{lod}", (0, -0.80, 0.22),
        (2.02, 5.75, 1.52), materials["armor"], fuselage, bevel=0.42,
    )
    nose = empty("care-aircraft-nose", (0, 0, 0), root, "nose")
    loft(
        f"Care_FlightDeckGlass_LOD{lod}",
        [(3.42, 0.58, 0.82, 0.36), (4.18, 0.48, 0.74, 0.34), (4.75, 0.28, 0.48, 0.22)],
        materials["glass"], nose, max(12, segments // 2),
    )
    extruded_panel(
        f"Care_FlightDeckWindowCrown_LOD{lod}",
        [(-0.70, 3.48), (0.70, 3.48), (0.43, 4.58), (-0.43, 4.58)],
        0.84, 0.075, materials["glass"], nose, bevel=0.018,
    )
    for side in (-1, 1):
        cube(
            f"Care_FlightDeckSideWindow_{side}_LOD{lod}",
            (side * 0.87, 4.00, 0.58), (0.055, 0.82, 0.38),
            materials["glass"], nose,
            rotation=(0, 0, side * math.radians(6)), bevel=0.035,
        )
    for side in (-1, 1):
        strut_between(
            f"Care_FlightDeckOuterFrame_{side}_LOD{lod}",
            (side * 0.70, 3.58, 0.72), (side * 0.30, 4.72, 0.42),
            0.045, materials["dark"], nose, max(8, segments // 3),
        )
        if lod < 2:
            strut_between(
                f"Care_FlightDeckMullion_{side}_LOD{lod}",
                (side * 0.24, 3.52, 0.82), (side * 0.14, 4.72, 0.43),
                0.032, materials["metal"], nose, 8,
            )
    strut_between(
        f"Care_FlightDeckCentreFrame_LOD{lod}", (0, 3.48, 0.94), (0, 4.78, 0.48),
        0.040, materials["dark"], nose, max(8, segments // 3),
    )
    if lod == 0:
        strut_between(
            "Care_FlightDeckArmourBrow_LOD0", (-0.78, 3.48, 0.91), (0.78, 3.48, 0.91),
            0.045, materials["metal"], nose, 10,
        )
        for pane, x in enumerate((-0.42, -0.14, 0.14, 0.42)):
            cube(
                f"Care_FlightDeckFrontPane_{pane}_LOD0", (x, 4.675, 0.49),
                (0.235, 0.032, 0.26), materials["glass"], nose,
                rotation=(math.radians(-18), 0, 0), bevel=0.0,
            )
        for mullion, x in enumerate((-0.28, 0.0, 0.28)):
            cube(
                f"Care_FlightDeckFrontMullion_{mullion}_LOD0", (x, 4.658, 0.49),
                (0.026, 0.025, 0.29), materials["dark"], nose,
                rotation=(math.radians(-18), 0, 0), bevel=0.0,
            )
        for side in (-1, 1):
            cube(
                f"Care_FlightDeckCheekArmor_{side}_LOD0",
                (side * 0.93, 4.04, 0.27), (0.11, 0.92, 0.30),
                materials["panel_wear"], nose,
                rotation=(0, 0, side * math.radians(5)), bevel=0.0,
            )
            for fastener, y in enumerate((3.72, 4.02, 4.32)):
                cylinder(
                    f"Care_FlightDeckFastener_{side}_{fastener}_LOD0",
                    (side * 0.992, y, 0.30), 0.012, 0.014,
                    materials["metal"], nose,
                    rotation=(0, math.pi / 2, 0), vertices=6, bevel=0.0,
                )
    wing = empty("care-aircraft-main-wing", (0, 0, 0), root, "main-wing")
    for side in (-1, 1):
        wing_panel(f"Care_MainWing_{side}_LOD{lod}", side, -0.02, 3.05, 7.25, 1.05, 0.82, 1.02, 0.28, materials["armor"], wing)
        wing_panel(f"Care_TailPlane_{side}_LOD{lod}", side, -4.28, 1.30, 2.55, 0.32, 0.42, 2.05, 0.15, materials["armor"], root)
        if lod < 2:
            for panel, span_fraction in enumerate((0.23, 0.48, 0.73)):
                x = side * 7.25 * span_fraction
                y = 0.88 - span_fraction * 1.02
                cube(
                    f"Care_WingPanelBreak_{side}_{panel}_LOD{lod}", (x, y, 1.175),
                    (0.030, 1.20 - panel * 0.18, 0.012), materials["panel_seam"], wing,
                    rotation=(0, 0, side * math.radians(7)), bevel=0.002,
                )
    wedge(f"Care_TailFin_LOD{lod}", (0, -4.42, 2.15), (0.34, 1.70, 2.82), materials["armor"], root, rotation=(math.radians(-8), 0, 0))
    cube(f"Care_TailFinTip_LOD{lod}", (0, -4.83, 3.30), (0.38, 0.50, 0.10), materials["accent"], root, rotation=(math.radians(-8), 0, 0), bevel=0.025)
    for index, x in enumerate((-4.30, -2.35, 2.35, 4.30)):
        side = -1 if x < 0 else 1
        engine = empty(f"care-aircraft-engine-{index}", (0, 0, 0), root, "high-bypass-turbofan")
        loft(
            f"Care_EngineNacelle_{index}_LOD{lod}",
            [(-1.05, 0.10, 0.38, 0.38), (-0.55, 0.08, 0.52, 0.50),
             (0.45, 0.10, 0.56, 0.54), (1.18, 0.12, 0.50, 0.48)],
            materials["dark"], engine, max(10, segments // 2),
        ).location.x = x
        torus(
            f"Care_TurbofanIntakeRing_{index}_LOD{lod}", (x, 1.18, 0.12),
            0.46, 0.070, materials["metal"], root, max(16, segments // 2),
            rotation=(math.pi / 2, 0, 0),
        )
        prop = empty(f"care-aircraft-propeller-{index}", (x, 1.215, 0.12), root, "turbofan-rotor")
        cylinder(f"Care_PropHub_{index}_LOD{lod}", (0, 0, 0), 0.13, 0.16, materials["metal"], prop, rotation=(math.pi / 2, 0, 0), vertices=max(12, segments // 2))
        blade_count = 10 if lod == 0 else 7 if lod == 1 else 4
        for blade in range(blade_count):
            cube(
                f"Care_PropBlade_{index}_{blade}_LOD{lod}", (0, 0, 0),
                (0.075, 0.030, 0.72), materials["blade"], prop,
                rotation=(0, blade * math.tau / blade_count, 0), bevel=0.018,
            )
        torus(
            f"Care_TurbofanExhaustRing_{index}_LOD{lod}", (x, -1.08, 0.10),
            0.31, 0.050, materials["metal"], root, max(14, segments // 2),
            rotation=(math.pi / 2, 0, 0),
        )
        add_action(prop, "Care_Aircraft_Propellers_Loop", [(1, 0.0), (13, side * math.tau), (25, side * math.tau * 2)], "rotation_euler", 1)
    # Heavy transport details: side cargo panels, rear ramp, and multi-wheel
    # bogies.  The canonical cargo socket below remains byte-position stable.
    for side in (-1, 1):
        for panel, y in enumerate((-3.20, -1.72, -0.24, 1.24, 2.72)):
            cube(
                f"Care_FuselagePanel_{side}_{panel}_LOD{lod}",
                (side * 1.025, y, 0.28), (0.012, 1.08, 0.72),
                materials["panel_seam"], fuselage, bevel=0.0,
            )
        cube(
            f"Care_MainGearSponson_{side}_LOD{lod}", (side * 1.18, -1.58, -0.48),
            (0.52, 2.35, 0.56), materials["dark"], fuselage, bevel=0.13,
        )
        if lod == 0:
            for stringer, z in enumerate((0.02, 0.57)):
                cube(
                    f"Care_FuselageLongitudinalBreak_{side}_{stringer}_LOD0",
                    (side * 1.040, -0.18, z), (0.012, 6.65, 0.022),
                    materials["panel_wear"], fuselage, bevel=0.0,
                )
            for hatch, (y, z) in enumerate(((-2.42, 0.30), (0.52, 0.32), (2.05, 0.18))):
                cube(
                    f"Care_FuselageServiceHatch_{side}_{hatch}_LOD0",
                    (side * 1.045, y, z), (0.014, 0.52, 0.34),
                    materials["armor"], fuselage, bevel=0.0,
                )
                cube(
                    f"Care_FuselageServiceLatch_{side}_{hatch}_LOD0",
                    (side * 1.058, y + 0.16, z), (0.010, 0.06, 0.055),
                    materials["metal"], fuselage, bevel=0.0,
                )
    ramp_group = empty("care-aircraft-rear-ramp-detail", (0, 0, 0), root, "rear-ramp-detail")
    wedge(f"Care_RearCargoRamp_LOD{lod}", (0, -4.70, -0.38), (1.56, 1.32, 0.64), materials["panel_wear"], ramp_group, rotation=(math.radians(22), 0, 0))
    cube(f"Care_RearCargoAperture_LOD{lod}", (0, -4.91, 0.18), (1.28, 0.10, 0.92), materials["cargo_interior"], ramp_group, bevel=0.08)
    if lod == 0:
        cube("Care_RearApertureHeader_LOD0", (0, -4.985, 0.67), (1.42, 0.055, 0.09), materials["metal"], ramp_group, bevel=0.0)
        for side in (-1, 1):
            cube(
                f"Care_RearApertureFrame_{side}_LOD0", (side * 0.67, -4.985, 0.18),
                (0.09, 0.055, 0.92), materials["metal"], ramp_group, bevel=0.0,
            )
    if lod < 2:
        for strip in (-0.42, 0.0, 0.42):
            cube(f"Care_RampTrack_{strip}_LOD{lod}", (strip, -4.80, -0.52), (0.08, 0.92, 0.04), materials["metal"], ramp_group, rotation=(math.radians(12), 0, 0), bevel=0.012)
        for rib, y in enumerate((-5.05, -4.80, -4.55)):
            cube(
                f"Care_RampCrossRib_{rib}_LOD{lod}", (0, y, -0.48),
                (1.34, 0.055, 0.055), materials["panel_wear"], ramp_group,
                rotation=(math.radians(12), 0, 0), bevel=0.0,
            )
        for hinge, x in enumerate((-0.48, 0.48)):
            cylinder(
                f"Care_RampHinge_{hinge}_LOD{lod}", (x, -4.18, -0.18),
                0.065, 0.28, materials["metal"], ramp_group,
                rotation=(0, math.pi / 2, 0), vertices=8, bevel=0.0,
            )
        for side in (-1, 1):
            cube(
                f"Care_RampLockHousing_{side}_LOD{lod}", (side * 0.58, -4.91, 0.27),
                (0.13, 0.12, 0.22), materials["panel_wear"], ramp_group, bevel=0.0,
            )
    gear = empty("care-aircraft-landing-gear", (0, 0, 0), root, "landing-gear")
    strut_between(f"Care_NoseGearStrut_LOD{lod}", (0, 3.38, -0.55), (0, 3.38, -1.22), 0.065, materials["metal"], gear, max(10, segments // 3))
    for wheel_index, x in enumerate((-0.17, 0.17)):
        cylinder(f"Care_NoseWheel_{wheel_index}_LOD{lod}", (x, 3.38, -1.28), 0.18, 0.12, materials["tire"], gear, rotation=(0, math.pi / 2, 0), vertices=max(12, segments // 2), bevel=0.018)
        if lod == 0:
            cylinder(
                f"Care_NoseWheelHub_{wheel_index}_LOD0", (x, 3.38, -1.28),
                0.075, 0.132, materials["metal"], gear,
                rotation=(0, math.pi / 2, 0), vertices=8, bevel=0.0,
            )
    for side in (-1, 1):
        strut_between(f"Care_MainGearStrut_{side}_LOD{lod}", (side * 1.05, -1.18, -0.40), (side * 1.26, -1.42, -1.24), 0.090, materials["metal"], gear, max(10, segments // 3))
        wheel_rows = (-1.90, -1.42, -0.94) if lod < 2 else (-1.66, -1.18)
        if lod < 2:
            cube(
                f"Care_MainGearBogieBeam_{side}_LOD{lod}", (side * 1.34, -1.42, -1.24),
                (0.16, 1.24, 0.15), materials["metal"], gear, bevel=0.0,
            )
        if lod == 0:
            strut_between(
                f"Care_MainGearDragBrace_{side}_LOD0",
                (side * 1.02, -0.72, -0.48), (side * 1.30, -1.64, -1.18),
                0.045, materials["panel_wear"], gear, 8,
            )
        for wheel_index, y in enumerate(wheel_rows):
            cylinder(f"Care_MainWheel_{side}_{wheel_index}_LOD{lod}", (side * 1.34, y, -1.32), 0.24, 0.15, materials["tire"], gear, rotation=(0, math.pi / 2, 0), vertices=max(12, segments // 2), bevel=0.020)
            if lod == 0:
                cylinder(
                    f"Care_MainWheelHub_{side}_{wheel_index}_LOD0",
                    (side * 1.34, y, -1.32), 0.095, 0.165,
                    materials["metal"], gear,
                    rotation=(0, math.pi / 2, 0), vertices=8, bevel=0.0,
                )
    cargo = empty("care-aircraft-cargo-bay", (0, 0, 0), root, "cargo-bay")
    door = cube("care-aircraft-cargo-door", (0, -0.55, -0.78), (1.32, 2.15, 0.12), materials["dark"], cargo, bevel=0.04)
    empty("care-aircraft-cargo-socket", (0, -1.10, -1.18), root, "cargo-drop")
    empty("care-aircraft-forward-socket", (0, 5.65, 0.02), root, "forward")
    pulse = sphere("care-aircraft-cargo-drop-pulse", (0, -1.10, -1.22), (0.20, 0.20, 0.20), materials["cyan"], root, 12, 8)
    pulse.scale = (0.001, 0.001, 0.001)
    add_action(door, "Care_Cargo_Door_Open", [(1, -0.55), (8, -0.92), (18, -0.92), (25, -0.55)], "location", 1)
    add_action(pulse, "Care_Cargo_Drop_Pulse", [(1, (0.001,) * 3), (9, (1.0,) * 3), (13, (0.001,) * 3)], "scale")
    add_action(nose, "Care_Aircraft_Quiet_Loop", [(1, (1.0,) * 3), (13, (1.012, 1.0, 1.012)), (25, (1.0,) * 3)], "scale")
    return root


def build_carpet_aircraft(lod: int, materials):
    root = root_metadata(f"Pass65CarpetAircraft_LOD{lod}", "support-aircraft-family-v1", lod, "carpet")
    root["visual_revision"] = "close-range-stealth-flying-wing-v4"
    root["detail_contract"] = "framed-intakes-service-panels-bay-structure-tailless-v4"
    segments = (34, 24, 16)[lod]
    rings = (18, 12, 8)[lod]
    fuselage = empty("carpet-aircraft-fuselage", (0, 0, 0), root, "carpet-fuselage")
    extruded_panel(
        f"Carpet_BlendedCentreBody_LOD{lod}",
        [(-1.55, -3.95), (1.55, -3.95), (2.22, 3.35), (0.0, 5.42), (-2.22, 3.35)],
        0.16, 0.54, materials["carpet"], fuselage, bevel=0.095,
    )
    loft(
        f"Carpet_CentreSpine_LOD{lod}",
        [(-3.70, 0.18, 0.62, 0.28), (-1.55, 0.24, 0.94, 0.40),
         (1.75, 0.22, 0.96, 0.44), (3.80, 0.16, 0.60, 0.30), (5.18, 0.04, 0.12, 0.10)],
        materials["carpet"], fuselage, max(12, segments // 2),
    )
    nose = empty("carpet-aircraft-nose", (0, 0, 0), root, "nose")
    wedge(
        f"Carpet_FlightDeck_LOD{lod}", (0, 3.88, 0.51),
        (1.14, 1.12, 0.30), materials["glass"], nose,
        rotation=(math.radians(-8), 0, 0),
    )
    for side in (-1, 1):
        strut_between(
            f"Carpet_CockpitFrame_{side}_LOD{lod}",
            (side * 0.52, 3.48, 0.48), (side * 0.18, 4.34, 0.47),
            0.032, materials["dark"], nose, max(8, segments // 3),
        )
    wing = empty("carpet-aircraft-main-wing", (0, 0, 0), root, "swept-wing")
    for side in (-1, 1):
        right_outline = [(0.0, 4.92), (1.58, 4.18), (7.72, 0.48), (7.25, -0.72), (4.72, -2.02), (2.02, -3.72), (0.0, -3.18)]
        outline = right_outline if side > 0 else list(reversed([(-x, y) for x, y in right_outline]))
        extruded_panel(
            f"Carpet_SweptWing_{side}_LOD{lod}", outline, 0.08, 0.34,
            materials["carpet"], wing, bevel=0.075,
        )
        # Distinct sawtooth control surfaces preserve the low-observable flying-
        # wing outline without decorative vertical tails.
        for control, (x0, y0, x1, y1) in enumerate(((2.0, -3.10, 3.25, -2.62), (3.55, -2.48, 4.78, -1.90), (5.12, -1.65, 6.35, -0.86))):
            extruded_panel(
                f"Carpet_TrailingControl_{side}_{control}_LOD{lod}",
                [(side * x0, y0), (side * x1, y1), (side * (x1 + 0.30), y1 + 0.30), (side * (x0 + 0.22), y0 + 0.28)],
                0.285, 0.035, materials["panel_wear"], wing, bevel=0.008,
            )
        if lod < 2:
            for seam, (start, end) in enumerate((
                ((0.62, 3.30), (2.42, 2.18)), ((1.18, 1.70), (4.20, 0.24)),
                ((1.72, -0.18), (5.48, -0.62)), ((2.12, -1.66), (3.78, -2.22)),
            )):
                strut_between(
                    f"Carpet_WingPanelSeam_{side}_{seam}_LOD{lod}",
                    (side * start[0], start[1], 0.285), (side * end[0], end[1], 0.285),
                    0.014, materials["panel_seam"], wing, 8,
                )
        if lod == 0:
            for hatch, (centre_x, centre_y, width, depth) in enumerate((
                (1.45, 2.35, 0.54, 0.72), (2.72, 1.08, 0.66, 0.58), (4.36, -0.18, 0.78, 0.48),
            )):
                x0 = centre_x - width * 0.5
                x1 = centre_x + width * 0.5
                y0 = centre_y - depth * 0.5
                y1 = centre_y + depth * 0.5
                outline = [(side * x0, y0), (side * x1, y0), (side * x1, y1), (side * x0, y1)]
                extruded_panel(
                    f"Carpet_WingServicePanel_{side}_{hatch}_LOD0",
                    outline, 0.305, 0.016, materials["carpet"], wing, bevel=0.0,
                )
                cube(
                    f"Carpet_WingServiceLatch_{side}_{hatch}_LOD0",
                    (side * centre_x, y1 - 0.06, 0.319), (0.09, 0.035, 0.015),
                    materials["metal"], wing, bevel=0.0,
                )
    for index, x in enumerate((-2.62, -1.28, 1.28, 2.62)):
        side = -1 if x < 0 else 1
        engine = empty(f"carpet-aircraft-engine-{index}", (0, 0, 0), root, "buried-turbofan")
        wedge(
            f"Carpet_BuriedIntake_{index}_LOD{lod}", (x, 0.95, 0.32),
            (0.82, 1.18, 0.25), materials["intake"], engine,
            rotation=(math.radians(-3), 0, side * math.radians(3)),
        )
        cube(
            f"Carpet_IntakeLip_{index}_LOD{lod}", (x, 1.46, 0.38),
            (0.72, 0.08, 0.10), materials["metal"], engine,
            rotation=(0, 0, side * math.radians(3)), bevel=0.025,
        )
        if lod == 0:
            cube(
                f"Carpet_IntakeSplitter_{index}_LOD0", (x, 1.17, 0.37),
                (0.045, 0.62, 0.18), materials["metal"], engine,
                rotation=(math.radians(-3), 0, side * math.radians(3)), bevel=0.0,
            )
            for frame_side in (-1, 1):
                cube(
                    f"Carpet_IntakeFrame_{index}_{frame_side}_LOD0",
                    (x + frame_side * 0.34, 1.18, 0.395), (0.035, 0.64, 0.045),
                    materials["panel_wear"], engine,
                    rotation=(math.radians(-3), 0, side * math.radians(3)), bevel=0.0,
                )
        fan = empty(f"carpet-aircraft-fan-{index}", (x, 1.22, 0.32), root, "engine-fan")
        blade_count = 8 if lod == 0 else 6 if lod == 1 else 3
        for blade in range(blade_count):
            cube(f"Carpet_FanBlade_{index}_{blade}_LOD{lod}", (0, 0, 0), (0.05, 0.025, 0.48), materials["metal"], fan, rotation=(0, blade * math.tau / blade_count, 0), bevel=0.014)
        cube(
            f"Carpet_ExhaustSlot_{index}_LOD{lod}", (x, -2.40, 0.28),
            (0.72, 0.10, 0.18), materials["exhaust"], engine,
            rotation=(math.radians(4), 0, side * math.radians(2)), bevel=0.035,
        )
        add_action(fan, "Carpet_Aircraft_Engine_Loop", [(1, 0.0), (13, side * math.tau), (25, side * math.tau * 2)], "rotation_euler", 1)
    bay = empty("carpet-aircraft-bomb-bay", (0, 0, 0), root, "bomb-bay")
    cube(f"Carpet_BombBayCavity_LOD{lod}", (0, -0.78, -0.26), (1.42, 3.08, 0.32), materials["cargo_interior"], bay, bevel=0.055)
    for rail in (-0.57, 0.0, 0.57):
        cube(f"Carpet_BombBayRail_{rail}_LOD{lod}", (rail, -0.78, -0.43), (0.055, 2.82, 0.07), materials["metal"], bay, bevel=0.012)
    if lod < 2:
        for rib, y in enumerate((-1.92, -1.18, -0.44, 0.30)):
            cube(
                f"Carpet_BombBayCrossFrame_{rib}_LOD{lod}", (0, y, -0.445),
                (1.28, 0.045, 0.075), materials["panel_wear"], bay, bevel=0.0,
            )
        for side in (-1, 1):
            cube(
                f"Carpet_BombBaySideFrame_{side}_LOD{lod}",
                (side * 0.665, -0.78, -0.43), (0.045, 2.92, 0.09),
                materials["metal"], bay, bevel=0.0,
            )
            for hinge, y in enumerate((-1.70, 0.12)):
                cube(
                    f"Carpet_BombDoorHinge_{side}_{hinge}_LOD{lod}",
                    (side * 0.61, y, -0.51), (0.13, 0.18, 0.11),
                    materials["panel_wear"], bay, bevel=0.0,
                )
    left_door = cube("carpet-aircraft-bomb-door-left", (-0.36, -0.78, -0.49), (0.62, 2.85, 0.11), materials["dark"], bay, bevel=0.028)
    right_door = cube("carpet-aircraft-bomb-door-right", (0.36, -0.78, -0.49), (0.62, 2.85, 0.11), materials["dark"], bay, bevel=0.028)
    rack = empty("carpet-aircraft-bomb-rack", (0, 0, 0), root, "bomb-rack")
    if lod < 2:
        for row in range(5 if lod == 0 else 3):
            for side in (-1, 1):
                cylinder(f"Carpet_Bomb_{side}_{row}_LOD{lod}", (side * 0.22, -1.72 + row * 0.52, -0.65), 0.11, 0.46, materials["bomb"], rack, rotation=(math.pi / 2, 0, 0), vertices=max(10, segments // 2), bevel=0.015)
    empty("carpet-aircraft-bomb-socket", (0, -0.78, -1.10), root, "bomb-drop")
    empty("carpet-aircraft-forward-socket", (0, 5.72, -0.10), root, "forward")
    add_action(left_door, "Carpet_Bomb_Bay_Open", [(1, -0.34), (7, -0.72), (20, -0.72), (25, -0.34)], "location", 0)
    add_action(right_door, "Carpet_Bomb_Bay_Open", [(1, 0.34), (7, 0.72), (20, 0.72), (25, 0.34)], "location", 0)
    add_action(rack, "Carpet_Bomb_Rack_Pulse", [(1, (1.0,) * 3), (8, (1.0, 1.08, 1.0)), (25, (1.0,) * 3)], "scale")
    add_action(nose, "Carpet_Aircraft_Quiet_Loop", [(1, (1.0,) * 3), (13, (1.015, 1.0, 1.015)), (25, (1.0,) * 3)], "scale")
    return root


def parachute_canopy(name, location, radius, height, material, parent, segments, rings):
    vertices = []
    faces = []
    for ring in range(rings + 1):
        theta = (ring / rings) * (math.pi / 2)
        ring_radius = math.sin(theta) * radius
        z = math.cos(theta) * height
        for segment in range(segments):
            angle = segment * math.tau / segments
            vertices.append((math.cos(angle) * ring_radius, math.sin(angle) * ring_radius, z))
    for ring in range(rings):
        for segment in range(segments):
            current = ring * segments + segment
            next_segment = ring * segments + (segment + 1) % segments
            upper = (ring + 1) * segments + segment
            upper_next = (ring + 1) * segments + (segment + 1) % segments
            faces.append((current, next_segment, upper_next, upper))
    data = bpy.data.meshes.new(f"{name}_Mesh")
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    finish_mesh(obj, material, parent, smooth=True)
    obj["canonical_node_name"] = name
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return obj


def build_care_crate(lod: int, materials):
    root = root_metadata(f"Pass65CareCrate_LOD{lod}", "support-aircraft-family-v1", lod, "parachute-crate")
    root["visual_revision"] = "close-range-rigged-pallet-drop-v4"
    root["detail_contract"] = "corner-guards-buckles-latches-crossweb-ribbed-canopy-v4"
    crate_group = empty("care-package-crate", (0, 0, 0), root, "crate")
    cube(f"Care_CrateBody_LOD{lod}", (0, 0, 0), (1.22, 1.22, 0.90), materials["crate"], crate_group, bevel=0.08)
    cube(f"Care_CrateLid_LOD{lod}", (0, 0, 0.50), (1.32, 1.32, 0.14), materials["dark"], crate_group, bevel=0.045)
    cube(f"Care_CratePallet_LOD{lod}", (0, 0, -0.54), (1.48, 1.48, 0.16), materials["pallet"], crate_group, bevel=0.035)
    for slat, offset in enumerate((-0.46, 0.0, 0.46)):
        cube(f"Care_CratePalletSlat_{slat}_LOD{lod}", (offset, 0, -0.65), (0.22, 1.62, 0.12), materials["pallet"], crate_group, bevel=0.025)
    for side_x in (-1, 1):
        for side_y in (-1, 1):
            cube(
                f"Care_CrateCornerGuard_{side_x}_{side_y}_LOD{lod}",
                (side_x * 0.59, side_y * 0.59, 0), (0.14, 0.14, 1.06),
                materials["metal"], crate_group, bevel=0.025,
            )
    if lod == 0:
        for side in (-1, 1):
            cube(f"Care_CrateHandle_{side}_LOD0", (side * 0.66, 0, 0.08), (0.06, 0.42, 0.18), materials["metal"], crate_group, bevel=0.025)
    straps = empty("care-package-straps", (0, 0, 0), root, "straps")
    cube(f"Care_CrateStrapX_LOD{lod}", (0, 0, 0.02), (1.30, 0.12, 0.98), materials["accent"], straps, bevel=0.025)
    cube(f"Care_CrateStrapY_LOD{lod}", (0, 0, 0.02), (0.12, 1.30, 0.98), materials["accent"], straps, bevel=0.025)
    for buckle, (x, y) in enumerate(((0.0, -0.64), (-0.64, 0.0))):
        cube(f"Care_CrateBuckle_{buckle}_LOD{lod}", (x, y, 0.18), (0.22, 0.06, 0.18) if x == 0 else (0.06, 0.22, 0.18), materials["metal"], straps, bevel=0.025)
    if lod == 0:
        for latch, (x, y, rotation) in enumerate((
            (-0.34, -0.665, 0.0), (0.34, -0.665, 0.0),
            (-0.665, -0.34, math.pi / 2), (-0.665, 0.34, math.pi / 2),
        )):
            cube(
                f"Care_CrateLatch_{latch}_LOD0", (x, y, 0.46),
                (0.16, 0.045, 0.22), materials["metal"], straps,
                rotation=(0, 0, rotation), bevel=0.0,
            )
            cube(
                f"Care_CrateLatchPin_{latch}_LOD0", (x, y - (0.012 if rotation == 0 else 0), 0.39),
                (0.055, 0.025, 0.055), materials["accent"], straps,
                rotation=(0, 0, rotation), bevel=0.0,
            )
        for cleat, (x, y) in enumerate(((-0.58, -0.58), (0.58, -0.58), (-0.58, 0.58), (0.58, 0.58))):
            cube(
                f"Care_PalletTieDownCleat_{cleat}_LOD0", (x, y, -0.61),
                (0.18, 0.10, 0.13), materials["metal"], crate_group, bevel=0.0,
            )
    canopy = empty("care-package-parachute", (0, 0, 0), root, "parachute")
    parachute_canopy(f"Care_ParachuteCanopy_LOD{lod}", (0, 0, 3.35), 1.78, 0.78, materials["cloth"], canopy, (32, 20)[lod], (10, 7)[lod])
    rib_count = 12 if lod == 0 else 8
    for rib in range(rib_count):
        angle = rib * math.tau / rib_count
        strut_between(
            f"Care_ParachuteRib_{rib}_LOD{lod}",
            (0, 0, 4.13), (math.cos(angle) * 1.70, math.sin(angle) * 1.70, 3.36),
            0.032, materials["parachute_rib"], canopy, 8,
        )
    torus(f"Care_ParachuteSkirt_LOD{lod}", (0, 0, 3.36), 1.71, 0.028, materials["parachute_rib"], canopy, max(24, (32, 20)[lod]))
    torus(f"Care_ParachuteVent_LOD{lod}", (0, 0, 4.13), 0.15, 0.025, materials["parachute_rib"], canopy, max(16, (24, 16)[lod]))
    line_group = empty("care-parachute-lines", (0, 0, 0), root, "parachute-lines")
    line_count = 12 if lod == 0 else 8
    for index in range(line_count):
        angle = index * math.tau / line_count
        x = math.cos(angle) * 1.62
        y = math.sin(angle) * 1.62
        start = Vector((x, y, 3.30))
        end = Vector((math.cos(angle) * 0.48, math.sin(angle) * 0.48, 0.55))
        midpoint = (start + end) * 0.5
        delta = end - start
        line = cylinder(f"Care_ParachuteLine_{index}_LOD{lod}", midpoint, 0.012, delta.length, materials["line"], line_group, vertices=8, bevel=0)
        line.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    empty("care-crate-landing-socket", (0, 0, -0.48), root, "landing")
    add_action(canopy, "Care_Parachute_Sway_Loop", [(1, -0.035), (13, 0.035), (25, -0.035)], "rotation_euler", 1)
    add_action(line_group, "Care_Parachute_Lines_Loop", [(1, -0.02), (13, 0.02), (25, -0.02)], "rotation_euler", 0)
    add_action(canopy, "Care_Parachute_Collapse", [(1, (1.0,) * 3), (18, (1.0,) * 3), (25, (1.0, 1.0, 0.04))], "scale")
    return root


def hierarchy(root):
    return [root, *root.children_recursive]


def export_root(root, output: Path) -> None:
    selected = set(hierarchy(root))
    for obj in bpy.data.objects:
        canonical = obj.get("canonical_node_name")
        if canonical and obj not in selected:
            obj.name = f"{canonical}__SOURCE_OTHER"
    for obj in selected:
        canonical = obj.get("canonical_node_name")
        if canonical:
            obj.name = canonical
    bpy.ops.object.select_all(action="DESELECT")
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
    for obj in selected:
        canonical = obj.get("canonical_node_name")
        if canonical:
            obj.name = f"{canonical}__SOURCE_EXPORTED"


def look_at(obj: bpy.types.Object, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def assert_roots_inside_review_camera(scene, camera, roots, label: str, margin: float = 0.015) -> None:
    """Fail before rendering if a required asset is behind or cropped by the review camera."""
    bpy.context.view_layer.update()
    violations = []
    for root in roots:
        for obj in hierarchy(root):
            if obj.type != "MESH" or obj.hide_render:
                continue
            for corner in obj.bound_box:
                projected = world_to_camera_view(scene, camera, obj.matrix_world @ Vector(corner))
                if projected.z <= 0 or projected.x < margin or projected.x > 1 - margin or projected.y < margin or projected.y > 1 - margin:
                    violations.append((obj.name, round(projected.x, 4), round(projected.y, 4), round(projected.z, 4)))
                    break
    if violations:
        raise RuntimeError(f"{label} review camera crops required geometry: {violations[:12]}")


def assert_roots_above_review_stage(roots, stage_z: float, label: str, clearance: float = 0.05) -> None:
    """Fail if the opaque review floor can hide any required asset geometry."""
    bpy.context.view_layer.update()
    violations = []
    for root in roots:
        for obj in hierarchy(root):
            if obj.type != "MESH" or obj.hide_render:
                continue
            minimum_z = min((obj.matrix_world @ Vector(corner)).z for corner in obj.bound_box)
            if minimum_z <= stage_z + clearance:
                violations.append((obj.name, round(minimum_z, 4), round(stage_z, 4)))
    if violations:
        raise RuntimeError(f"{label} review stage occludes required geometry: {violations[:12]}")


def review_scene(stage_z: float, scenic=False):
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, stage_z))
    stage = bpy.context.object
    stage.name = "Review_Stage"
    stage_material = simple_material("MAT_ReviewStage", (0.030, 0.045, 0.060), 0.12, 0.55)
    stage.data.materials.append(stage_material)
    horizon_material = simple_material("MAT_ReviewHorizon", (0.055, 0.105, 0.145), 0.04, 0.62)
    cube("Review_HorizonBackdrop", (0, 22.0, 2.1), (40.0, 0.18, 6.0), horizon_material, None, bevel=0.0)
    horizon_glow = simple_material("MAT_ReviewHorizonGlow", (0.01, 0.20, 0.28), 0.0, 0.25, (0.02, 0.62, 0.82), 3.0)
    cube("Review_HorizonGlow", (0, 21.84, 0.04), (40.0, 0.08, 0.06), horizon_glow, None, bevel=0.0)
    if scenic:
        skyline_material = simple_material("MAT_ReviewSkyline", (0.055, 0.095, 0.125), 0.18, 0.54)
        for index, (x, width, height) in enumerate(((-7.0, 3.0, 2.2), (-2.8, 2.2, 3.0), (1.0, 3.6, 1.8), (5.7, 2.8, 2.6))):
            cube(f"Review_Skyline_{index}", (x, 16.0, stage_z + height * 0.5), (width, 0.55, height), skyline_material, None, bevel=0.08)
    for name, location, energy, color, size in (
        ("Review_Key", (-7.0, 7.5, 8.5), 1950, (0.78, 0.86, 1.0), 5.0),
        ("Review_Rim", (7.5, -5.0, 6.0), 1650, (1.0, 0.42, 0.14), 4.0),
        ("Review_Fill", (0.0, 2.0, 10.0), 1150, (0.42, 0.64, 1.0), 5.0),
        ("Review_Front", (0.0, 9.0, 3.5), 1050, (0.68, 0.86, 1.0), 4.0),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, 0, 0))
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Support_Vehicle_Review_Camera"
    camera.data.lens = 56
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_SIZE
    scene.render.resolution_y = REVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.025, 0.050, 0.075, 1.0)
    background.inputs["Strength"].default_value = 0.32
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.68
    scene.frame_set(1)
    return camera, scene


def set_roots_visible(all_roots, visible_roots) -> None:
    allowed = set(visible_roots)
    for root in all_roots:
        visible = root in allowed
        for obj in hierarchy(root):
            obj.hide_render = not visible
            obj.hide_viewport = not visible


def contact_sheet(paths: list[Path], output: Path) -> None:
    source_images = [bpy.data.images.load(str(path), check_existing=False) for path in paths]
    columns = max(1, math.ceil(math.sqrt(len(source_images))))
    rows = max(1, math.ceil(len(source_images) / columns))
    width = REVIEW_SIZE * columns
    height = REVIEW_SIZE * rows
    sheet = bpy.data.images.new(output.stem, width, height, alpha=True)
    pixels = [0.0] * (width * height * 4)
    for image_index, image in enumerate(source_images):
        source_width, source_height = (int(value) for value in image.size)
        scale = min(REVIEW_SIZE / source_width, REVIEW_SIZE / source_height)
        tile_width = max(1, round(source_width * scale))
        tile_height = max(1, round(source_height * scale))
        if (source_width, source_height) != (tile_width, tile_height):
            image.scale(tile_width, tile_height)
        source = list(image.pixels[:])
        tile_x = (image_index % columns) * REVIEW_SIZE + (REVIEW_SIZE - tile_width) // 2
        tile_y = (rows - 1 - image_index // columns) * REVIEW_SIZE + (REVIEW_SIZE - tile_height) // 2
        for row in range(tile_height):
            source_start = row * tile_width * 4
            target_start = ((tile_y + row) * width + tile_x) * 4
            pixels[target_start:target_start + tile_width * 4] = source[source_start:source_start + tile_width * 4]
    sheet.pixels = pixels
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(output)
    sheet.save()


def render_chopper_reviews(roots) -> None:
    lod0 = roots[0]
    set_roots_visible(roots, [lod0])
    camera, scene = review_scene(-1.18)
    fp_world = empty("Review_FP_Outside_World", (0, 0, 0), None)
    terrain_material = simple_material("MAT_ReviewFPTerrain", (0.075, 0.13, 0.11), 0.05, 0.72)
    runway_material = simple_material("MAT_ReviewFPRunway", (0.030, 0.045, 0.052), 0.18, 0.66)
    runway_marking_material = simple_material("MAT_ReviewFPRunwayMarking", (0.52, 0.29, 0.035), 0.08, 0.46, (1.0, 0.20, 0.015), 0.9)
    structure_material = simple_material("MAT_ReviewFPStructures", (0.10, 0.16, 0.19), 0.42, 0.48)
    landmark_material = simple_material("MAT_ReviewFPLandmark", (0.10, 0.19, 0.24), 0.58, 0.42)
    mountain_material = simple_material("MAT_ReviewFPMountains", (0.035, 0.075, 0.095), 0.12, 0.82)
    sky_horizon_material = simple_material("MAT_ReviewFPSkyHorizon", (0.18, 0.15, 0.13), 0.0, 0.80, (0.34, 0.16, 0.07), 1.10)
    sky_mid_material = simple_material("MAT_ReviewFPSkyMid", (0.035, 0.095, 0.15), 0.0, 0.86, (0.025, 0.14, 0.27), 0.82)
    sky_upper_material = simple_material("MAT_ReviewFPSkyUpper", (0.008, 0.025, 0.060), 0.0, 0.90, (0.008, 0.035, 0.12), 0.62)
    haze_material = simple_material("MAT_ReviewFPAtmosphericHaze", (0.06, 0.20, 0.24), 0.0, 0.94, (0.03, 0.14, 0.18), 0.18, 0.035)
    beacon_material = simple_material("MAT_ReviewFPBeacon", (0.18, 0.06, 0.02), 0.05, 0.35, (1.0, 0.18, 0.02), 3.2)
    cube("Review_FP_SkyUpper", (0, 21.5, 4.0), (42.0, 0.10, 4.8), sky_upper_material, fp_world, bevel=0.0)
    cube("Review_FP_SkyMid", (0, 21.4, 1.25), (42.0, 0.10, 2.3), sky_mid_material, fp_world, bevel=0.0)
    cube("Review_FP_SkyHorizon", (0, 21.3, -0.25), (42.0, 0.10, 0.9), sky_horizon_material, fp_world, bevel=0.0)
    sphere("Review_FP_HorizonSun", (6.5, 21.0, 0.35), (0.42, 0.08, 0.42), beacon_material, fp_world, 20, 10)
    cube("Review_FP_Terrain", (0, 10.5, -0.98), (25.0, 22.0, 0.34), terrain_material, fp_world, bevel=0.12)
    cube("Review_FP_Runway", (0, 10.5, -0.79), (5.2, 22.0, 0.035), runway_material, fp_world, bevel=0.02)
    for stripe, y in enumerate((3.2, 5.8, 8.4, 11.0, 13.6, 16.2, 18.8)):
        cube(f"Review_FP_RunwayStripe_{stripe}", (0, y, -0.765), (0.14, 1.10, 0.025), runway_marking_material, fp_world, bevel=0.006)
    for index, (x, y, width, depth, height) in enumerate((
        (-7.4, 12.5, 2.8, 2.2, 1.8), (-5.2, 15.2, 2.0, 1.8, 2.4),
        (5.2, 14.4, 2.4, 2.0, 1.5), (7.4, 12.8, 2.4, 2.0, 2.1),
    )):
        cube(f"Review_FP_Structure_{index}", (x, y, -0.81 + height * 0.5), (width, depth, height), structure_material, fp_world, bevel=0.14)
        for seam in (-0.30, 0.0, 0.30):
            cube(f"Review_FP_StructureSeam_{index}_{seam}", (x + seam * width, y - depth * 0.505, -0.76 + height * 0.5), (0.035, 0.025, height * 0.72), landmark_material, fp_world, bevel=0.004)
        cube(f"Review_FP_Beacon_{index}", (x, y - depth * 0.36, -0.66 + height), (0.20, 0.12, 0.08), beacon_material, fp_world, bevel=0.02)
    for index, (x, width, height) in enumerate(((-10.0, 3.8, 1.8), (-7.4, 3.2, 1.3), (7.4, 3.4, 1.5), (10.0, 3.8, 2.0))):
        wedge(f"Review_FP_Mountain_{index}", (x, 18.0 + index * 0.22, -0.72 + height * 0.36), (width, 1.6, height), mountain_material, fp_world, rotation=(0, 0, math.radians((-4 + index * 3))))
    cylinder("Review_FP_ControlTower", (-5.0, 14.4, 0.45), 0.24, 2.4, landmark_material, fp_world, vertices=12, bevel=0.025)
    sphere("Review_FP_ControlCab", (-5.0, 14.4, 1.72), (0.62, 0.42, 0.28), structure_material, fp_world, 16, 8)
    cylinder("Review_FP_RadarMast", (5.2, 15.0, 0.12), 0.10, 1.7, landmark_material, fp_world, vertices=10, bevel=0.015)
    torus("Review_FP_RadarDish", (5.2, 15.0, 1.12), 0.42, 0.055, runway_marking_material, fp_world, 24, rotation=(math.pi / 2, math.radians(18), 0))
    cube("Review_FP_AtmosphericHaze", (0, 19.2, 0.35), (28.0, 0.025, 1.5), haze_material, fp_world, bevel=0.0)
    for obj in hierarchy(fp_world):
        obj.hide_render = True
        obj.hide_viewport = True
    if FP_DIAGNOSTIC_REVIEW:
        hidden = []
        for name in (
            "chopper-fuselage", "Chopper_CanopyGlass_LOD0", "Chopper_PilotSeatBack_LOD0",
        ):
            candidate = next((obj for obj in hierarchy(lod0) if obj.name == name or obj.get("canonical_node_name") == name), None)
            if candidate is None:
                continue
            targets = hierarchy(candidate)
            hidden.extend((target, target.hide_render, target.hide_viewport) for target in targets)
            for target in targets:
                target.hide_render = True
                target.hide_viewport = True
        for obj in hierarchy(fp_world):
            obj.hide_render = False
            obj.hide_viewport = False
        camera.location = (0, 0.38, 0.62)
        camera.data.lens = 42
        look_at(camera, (0, 7.0, 0.40))
        scene.render.resolution_x = 960
        scene.render.resolution_y = 540
        scene.render.resolution_percentage = 100
        diagnostic = CHOPPER_REVIEW / "diagnostics/pass65-chopper-fp-diagnostic-xray.png"
        diagnostic.parent.mkdir(parents=True, exist_ok=True)
        scene.render.filepath = str(diagnostic)
        bpy.ops.render.render(write_still=True)
        for target, hide_render, hide_viewport in hidden:
            target.hide_render = hide_render
            target.hide_viewport = hide_viewport
        print(f"CHOPPER_FP_DIAGNOSTIC={diagnostic}")
        return
    def render_accepted_first_person() -> Path:
        sightline = next((
            obj for obj in hierarchy(lod0)
            if obj.name == "chopper-gunner-sightline"
            or obj.get("canonical_node_name") == "chopper-gunner-sightline"
        ), None)
        if sightline is None:
            raise RuntimeError("authored unobstructed chopper gunner sightline missing from focused review")
        sightline_nodes = set(hierarchy(sightline))
        for obj in hierarchy(lod0):
            if obj.type == "MESH":
                obj.hide_render = obj not in sightline_nodes
                obj.hide_viewport = obj not in sightline_nodes
        for obj in hierarchy(fp_world):
            obj.hide_render = False
            obj.hide_viewport = False
        camera.location = (0, 0.38, 0.74)
        camera.data.lens = 32
        look_at(camera, (0, 8.0, 0.18))
        scene.render.resolution_x = 960
        scene.render.resolution_y = 540
        scene.render.resolution_percentage = 100
        scene.view_settings.exposure = -0.65
        background = scene.world.node_tree.nodes.get("Background")
        background.inputs["Strength"].default_value = 0.18
        for obj in bpy.data.objects:
            if obj.type == "LIGHT" and obj.name.startswith("Review_"):
                obj.data.energy *= 0.38
        scene.frame_set(7)
        focused_path = CHOPPER_REVIEW / "pass65-chopper-first-person-instruments-16x9.png"
        scene.render.filepath = str(focused_path)
        bpy.ops.render.render(write_still=True)
        return focused_path

    if FOCUSED_FP_REVIEW:
        focused_path = render_accepted_first_person()
        contact_sheet([
            CHOPPER_REVIEW / "pass65-chopper-exterior-front-quarter.png",
            CHOPPER_REVIEW / "pass65-chopper-rotor-gun-profile.png",
            CHOPPER_REVIEW / "pass65-chopper-rear-fuselage-quarter.png",
            CHOPPER_REVIEW / "pass65-chopper-canopy-armour-closeup.png",
            CHOPPER_REVIEW / "pass65-chopper-ordnance-mechanics-closeup.png",
            focused_path,
        ], CHOPPER_REVIEW / "pass65-chopper-contact-sheet.png")
        print(f"CHOPPER_FP_REVIEW_16X9={focused_path}")
        return
    views = (
        ("exterior-front-quarter", (-8.2, 9.6, 4.7), (0, -0.25, 0.22), 58),
        ("rotor-gun-profile", (11.0, -0.2, 3.1), (0, -0.70, 0.18), 58),
        ("rear-fuselage-quarter", (7.6, -10.4, 4.6), (0, -1.45, 0.46), 58),
        ("canopy-armour-closeup", (-4.8, 5.6, 2.45), (0, 1.05, 0.42), 64),
        ("ordnance-mechanics-closeup", (5.6, 2.8, 2.10), (0.92, -0.18, 0.16), 64),
    )
    paths = []
    for label, location, target, lens in views:
        path = CHOPPER_REVIEW / f"pass65-chopper-{label}.png"
        paths.append(path)
        for obj in hierarchy(fp_world):
            obj.hide_render = True
            obj.hide_viewport = True
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
    paths.append(render_accepted_first_person())
    contact_sheet(paths, CHOPPER_REVIEW / "pass65-chopper-contact-sheet.png")


def render_aircraft_reviews(care_roots, carpet_roots, crate_roots) -> None:
    all_roots = [*care_roots, *carpet_roots, *crate_roots]
    stage_z = -2.65
    camera, scene = review_scene(stage_z)
    bpy.ops.object.light_add(type="AREA", location=(-1.0, -0.4, -2.25))
    underside_light = bpy.context.object
    underside_light.name = "Review_UndersideFill"
    underside_light.data.energy = 2200
    underside_light.data.color = (0.58, 0.72, 1.0)
    underside_light.data.shape = "DISK"
    underside_light.data.size = 4.5
    look_at(underside_light, (0, -0.8, -0.38))
    underside_light.hide_render = True
    views = (
        ("care-front-quarter", (-14.6, 15.2, 6.2), (0, -0.3, 0.05), 56, [care_roots[0]]),
        ("care-flightdeck-gear", (-6.8, 8.5, 2.5), (0, 3.30, -0.22), 64, [care_roots[0]]),
        ("care-rear-ramp", (4.8, -8.4, -1.30), (0, -4.58, -0.34), 60, [care_roots[0]]),
        ("care-cargo-parachute", (-14.0, 14.0, 8.6), (-2.4, -0.9, -0.3), 45, [care_roots[0], crate_roots[0]]),
        ("care-crate-hardware", (-4.4, 4.2, 0.15), (0, 0, -1.72), 64, [crate_roots[0]]),
        ("carpet-front-quarter", (14.8, 15.2, 7.5), (0, -0.3, 0.05), 56, [carpet_roots[0]]),
        ("carpet-intake-panels", (7.2, 7.5, 3.2), (1.7, 1.20, 0.28), 64, [carpet_roots[0]]),
        ("carpet-planform-top", (0, 0, 15.5), (0, 0, 0.05), 42, [carpet_roots[0]]),
        ("carpet-bomb-bay", (-7.0, -0.2, -2.25), (0, -0.8, -0.45), 48, [carpet_roots[0]]),
    )
    paths = []
    for label, location, target, lens, visible in views:
        set_roots_visible(all_roots, visible)
        crate_roots[0].location = (
            (-5.0, -2.0, -1.85) if label == "care-cargo-parachute"
            else (0, 0, -1.80) if label == "care-crate-hardware"
            else (0, 0, 0)
        )
        underside_light.hide_render = label not in {"care-rear-ramp", "carpet-bomb-bay"}
        if label == "care-rear-ramp":
            underside_light.location = (-1.5, -6.2, -2.20)
            underside_light.data.energy = 1950
            look_at(underside_light, (0, -4.62, -0.32))
        elif label == "carpet-bomb-bay":
            underside_light.location = (-1.0, -0.4, -2.25)
            underside_light.data.energy = 2200
            look_at(underside_light, (0, -0.8, -0.38))
        scene.frame_set(12 if label == "carpet-bomb-bay" else 1)
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        assert_roots_above_review_stage(visible, stage_z, label)
        if label == "care-cargo-parachute":
            assert_roots_inside_review_camera(scene, camera, visible, label)
        path = AIRCRAFT_REVIEW / f"pass65-aircraft-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    contact_sheet(paths, AIRCRAFT_REVIEW / "pass65-aircraft-contact-sheet.png")


reset()
chopper_images = {
    kind: make_texture(
        "pass65-chopper", kind, (0.17, 0.20, 0.16),
        emissive_panel_seams=False,
    )
    for kind in ("albedo", "normal", "orm", "emissive")
}
chopper_materials = {
    "armor": textured_material("MAT_Pass65Chopper_Armor_PBR", chopper_images),
    "dark": simple_material("MAT_Pass65Chopper_DarkArmor", (0.055, 0.085, 0.095), 0.84, 0.31),
    "metal": simple_material("MAT_Pass65Chopper_Gunmetal", (0.095, 0.120, 0.128), 0.92, 0.22),
    "frame": simple_material("MAT_Pass65Chopper_CockpitFrame", (0.075, 0.135, 0.145), 0.78, 0.29),
    "cockpit": simple_material("MAT_Pass65Chopper_CockpitInterior", (0.060, 0.095, 0.105), 0.50, 0.42),
    "panel_wear": simple_material("MAT_Pass65Chopper_PanelWear", (0.28, 0.32, 0.29), 0.86, 0.34),
    "panel_seam": simple_material("MAT_Pass65Chopper_PanelSeam", (0.055, 0.070, 0.067), 0.66, 0.58),
    "seat": simple_material("MAT_Pass65Chopper_Seat", (0.10, 0.15, 0.16), 0.08, 0.62),
    "glass": simple_material("MAT_Pass65Chopper_CanopyGlass", (0.025, 0.040, 0.035), 0.18, 0.24, (0.08, 0.035, 0.010), 0.10, 0.62),
    "hudglass": simple_material("MAT_Pass65Chopper_HUDGlass", (0.02, 0.20, 0.24), 0.08, 0.10, (0.01, 0.46, 0.60), 0.42, 0.12),
    "hud_cyan": simple_material("MAT_Pass65Chopper_HUDCyan", (0.01, 0.12, 0.15), 0.12, 0.22, (0.01, 0.62, 0.82), 1.8),
    "hud_green": simple_material("MAT_Pass65Chopper_HUDGreen", (0.01, 0.15, 0.055), 0.10, 0.22, (0.06, 0.80, 0.26), 1.7),
    "cyan": simple_material("MAT_Pass65Chopper_CyanInstrument", (0.01, 0.18, 0.24), 0.22, 0.18, (0.01, 0.82, 1.0), 5.2),
    "green": simple_material("MAT_Pass65Chopper_GreenInstrument", (0.01, 0.20, 0.08), 0.20, 0.18, (0.08, 1.0, 0.38), 5.0),
    "screen_cyan": simple_material("MAT_Pass65Chopper_CyanDisplay", (0.01, 0.12, 0.17), 0.10, 0.28, (0.01, 0.45, 0.72), 1.35),
    "screen_green": simple_material("MAT_Pass65Chopper_GreenDisplay", (0.01, 0.13, 0.045), 0.10, 0.28, (0.03, 0.62, 0.20), 1.25),
    "accent": simple_material("MAT_Pass65Chopper_RescueAccent", (0.78, 0.24, 0.035), 0.58, 0.34),
    "blade": simple_material("MAT_Pass65Chopper_RotorBlade", (0.015, 0.022, 0.025), 0.72, 0.35),
    "rotorblur": simple_material("MAT_Pass65Chopper_RotorBlur", (0.025, 0.045, 0.052), 0.08, 0.34, (0.01, 0.08, 0.09), 0.18, 0.065),
    "rotortip": simple_material("MAT_Pass65Chopper_RotorTipBlur", (0.42, 0.12, 0.012), 0.05, 0.38, (1.0, 0.11, 0.01), 0.75, 0.24),
    "muzzle": simple_material("MAT_Pass65Chopper_Muzzle", (1.0, 0.22, 0.025), 0.0, 0.15, (1.0, 0.07, 0.0), 8.0),
}
chopper_roots = [build_chopper(lod, chopper_materials) for lod in range(3)]
for lod, chopper_root in enumerate(chopper_roots):
    export_root(chopper_root, CHOPPER_RAW / f"pass65-chopper-gunner-lod{lod}.glb")
render_chopper_reviews(chopper_roots)
bpy.ops.wm.save_as_mainfile(filepath=str(CHOPPER_BLEND))

if FOCUSED_FP_REVIEW or FP_DIAGNOSTIC_REVIEW:
    print(f"CHOPPER_BLEND={CHOPPER_BLEND}")
    print(f"CHOPPER_FP_REVIEW={CHOPPER_REVIEW / 'pass65-chopper-first-person-instruments.png'}")
    print(f"CHOPPER_REVIEW={CHOPPER_REVIEW / 'pass65-chopper-contact-sheet.png'}")
    raise SystemExit(0)

reset()
aircraft_images = {kind: make_texture("pass65-support-aircraft", kind, (0.12, 0.15, 0.14), emissive_panel_seams=False) for kind in ("albedo", "normal", "orm", "emissive")}
aircraft_materials = {
    "armor": textured_material("MAT_Pass65SupportAircraft_Armor_PBR", aircraft_images),
    "carpet": textured_material("MAT_Pass65SupportAircraft_Carpet_PBR", aircraft_images, tint=(0.62, 0.68, 0.72, 1.0), emission=1.2),
    "dark": simple_material("MAT_Pass65SupportAircraft_Dark", (0.065, 0.090, 0.100), 0.84, 0.34),
    "metal": simple_material("MAT_Pass65SupportAircraft_Metal", (0.105, 0.120, 0.128), 0.92, 0.23),
    "panel_wear": simple_material("MAT_Pass65SupportAircraft_PanelWear", (0.28, 0.30, 0.28), 0.84, 0.38),
    "panel_seam": simple_material("MAT_Pass65SupportAircraft_PanelSeam", (0.060, 0.075, 0.073), 0.62, 0.62),
    "intake": simple_material("MAT_Pass65SupportAircraft_Intake", (0.008, 0.012, 0.014), 0.42, 0.48),
    "exhaust": simple_material("MAT_Pass65SupportAircraft_Exhaust", (0.055, 0.048, 0.040), 0.88, 0.28, (0.20, 0.055, 0.008), 0.25),
    "cargo_interior": simple_material("MAT_Pass65SupportAircraft_CargoInterior", (0.022, 0.030, 0.030), 0.48, 0.58, (0.14, 0.055, 0.012), 0.16),
    "tire": simple_material("MAT_Pass65SupportAircraft_Tire", (0.012, 0.014, 0.014), 0.02, 0.86),
    "glass": simple_material("MAT_Pass65SupportAircraft_Glass", (0.025, 0.095, 0.12), 0.18, 0.18, (0.01, 0.18, 0.24), 0.35, 0.76),
    "accent": simple_material("MAT_Pass65SupportAircraft_Accent", (0.82, 0.24, 0.035), 0.54, 0.34),
    "blade": simple_material("MAT_Pass65SupportAircraft_Blade", (0.016, 0.023, 0.026), 0.76, 0.34),
    "bomb": simple_material("MAT_Pass65SupportAircraft_Bomb", (0.11, 0.15, 0.11), 0.72, 0.43),
    "cyan": simple_material("MAT_Pass65SupportAircraft_CargoLight", (0.02, 0.18, 0.22), 0.22, 0.18, (0.02, 0.90, 1.0), 5.0),
    "crate": textured_material("MAT_Pass65SupportAircraft_Crate_PBR", aircraft_images, tint=(0.72, 0.84, 0.70, 1.0), emission=0.6),
    "pallet": simple_material("MAT_Pass65SupportAircraft_CratePallet", (0.16, 0.11, 0.065), 0.18, 0.70),
    "cloth": simple_material("MAT_Pass65SupportAircraft_Parachute", (0.025, 0.030, 0.027), 0.02, 0.94),
    "parachute_rib": simple_material("MAT_Pass65SupportAircraft_ParachuteRib", (0.34, 0.36, 0.32), 0.18, 0.70),
    "line": simple_material("MAT_Pass65SupportAircraft_ParachuteLine", (0.25, 0.27, 0.23), 0.10, 0.58),
}
care_roots = [build_care_aircraft(lod, aircraft_materials) for lod in range(3)]
carpet_roots = [build_carpet_aircraft(lod, aircraft_materials) for lod in range(3)]
crate_roots = [build_care_crate(lod, aircraft_materials) for lod in range(2)]
for lod, care_root in enumerate(care_roots):
    export_root(care_root, AIRCRAFT_RAW / f"pass65-care-aircraft-lod{lod}.glb")
for lod, carpet_root in enumerate(carpet_roots):
    export_root(carpet_root, AIRCRAFT_RAW / f"pass65-carpet-aircraft-lod{lod}.glb")
for lod, crate_root in enumerate(crate_roots):
    export_root(crate_root, AIRCRAFT_RAW / f"pass65-care-crate-lod{lod}.glb")
render_aircraft_reviews(care_roots, carpet_roots, crate_roots)
bpy.ops.wm.save_as_mainfile(filepath=str(AIRCRAFT_BLEND))

print(f"CHOPPER_BLEND={CHOPPER_BLEND}")
print(f"AIRCRAFT_BLEND={AIRCRAFT_BLEND}")
print(f"CHOPPER_REVIEW={CHOPPER_REVIEW / 'pass65-chopper-contact-sheet.png'}")
print(f"AIRCRAFT_REVIEW={AIRCRAFT_REVIEW / 'pass65-aircraft-contact-sheet.png'}")
