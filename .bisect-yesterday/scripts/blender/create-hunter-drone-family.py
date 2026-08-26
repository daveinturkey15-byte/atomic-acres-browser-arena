"""Author the shared Hunter standalone/Swarm combat-drone family in Blender 5.1.

The checked-in .blend is the editable source of truth. Runtime GLBs are exported
per LOD into artifacts first, then losslessly structure-preserving optimization
is applied by run-authoring.mjs. Gameplay, collision, targeting, and damage stay
host-owned TypeScript concerns.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_BLEND = ROOT / "source-assets/blender/hunter-drone-family.blend"
RAW_DIR = ROOT / "artifacts/blender-drone/raw"
TEXTURE_DIR = ROOT / "public/assets/original/textures/support"
REVIEW_DIR = ROOT / "docs/assets/pass65-drone"
TEXTURE_SIZE = 512
REVIEW_SIZE = 512

for directory in (SOURCE_BLEND.parent, RAW_DIR, TEXTURE_DIR, REVIEW_DIR):
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
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)


def make_texture(name: str, kind: str) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True)
    pixels: list[float] = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            u = x / (TEXTURE_SIZE - 1)
            v = y / (TEXTURE_SIZE - 1)
            panel = min(x % 128, y % 128, 127 - (x % 128), 127 - (y % 128))
            seam = panel < 3
            micro = ((x * 37 + y * 17 + (x ^ y) * 13) % 101) / 100.0
            stripe = ((x + y) // 24) % 7 == 0 and 0.58 < v < 0.78
            if kind == "albedo":
                base = 0.105 + (micro - 0.5) * 0.018
                value = [base * 0.72, base * 0.91, base]
                if seam:
                    value = [0.028, 0.045, 0.052]
                if stripe:
                    value = [0.72, 0.24, 0.055]
            elif kind == "normal":
                if seam:
                    nx = 0.5 + (0.10 if x % 128 < 3 else -0.10)
                    ny = 0.5 + (0.10 if y % 128 < 3 else -0.10)
                    value = [nx, ny, 0.985]
                else:
                    value = [0.5 + (micro - 0.5) * 0.012, 0.5, 1.0]
            elif kind == "orm":
                ao = 0.70 if seam else 0.94
                roughness = 0.33 + micro * 0.16
                metallic = 0.88 if not stripe else 0.62
                value = [ao, roughness, metallic]
            else:
                cyan_line = seam and ((x // 128 + y // 128) % 2 == 0)
                if cyan_line:
                    value = [0.02, 0.75, 1.0]
                elif stripe:
                    value = [1.0, 0.18, 0.015]
                else:
                    value = [0.0, 0.0, 0.0]
            index = (y * TEXTURE_SIZE + x) * 4
            pixels[index:index + 4] = [*value, 1.0]
    image.colorspace_settings.name = "Non-Color" if kind in {"normal", "orm"} else "sRGB"
    print(f"HUNTER_DRONE_TEXTURE_{kind.upper()} sample={pixels[:4]} midpoint={pixels[len(pixels) // 2:len(pixels) // 2 + 4]}")
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"hunter-drone-{kind}.png")
    image.save()
    image.pack()
    return image


def input_socket(node: bpy.types.Node, *names: str):
    for name in names:
        socket = node.inputs.get(name)
        if socket is not None:
            return socket
    raise RuntimeError(f"missing shader input {names}")


def textured_material(name: str, images: dict[str, bpy.types.Image], tint=(1.0, 1.0, 1.0, 1.0), emission=1.4):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = tint
    bsdf.inputs["Roughness"].default_value = 0.42
    bsdf.inputs["Metallic"].default_value = 0.84

    albedo = nodes.new("ShaderNodeTexImage")
    albedo.name = "Hunter Drone Albedo"
    albedo.image = images["albedo"]
    links.new(albedo.outputs["Color"], bsdf.inputs["Base Color"])

    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.name = "Hunter Drone Normal"
    normal_tex.image = images["normal"]
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.55
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    orm = nodes.new("ShaderNodeTexImage")
    orm.name = "Hunter Drone ORM"
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
    emissive.name = "Hunter Drone Emissive"
    emissive.image = images["emissive"]
    links.new(emissive.outputs["Color"], input_socket(bsdf, "Emission Color", "Emission"))
    input_socket(bsdf, "Emission Strength").default_value = emission
    return material


def simple_material(name: str, color, metallic: float, roughness: float, emission=None, strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission:
        input_socket(bsdf, "Emission Color", "Emission").default_value = emission
        input_socket(bsdf, "Emission Strength").default_value = strength
    return material


def apply_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.type == "MESH":
        obj.data.materials.append(material)


def finish_mesh(obj, material, parent, bevel=0.0, smooth=False):
    obj.name = obj.name.replace(".", "_")
    apply_material(obj, material)
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


def cube(name, location, dimensions, material, parent, rotation=(0.0, 0.0, 0.0), bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, parent, bevel=bevel)


def cylinder(name, location, radius, depth, material, parent, rotation=(0.0, 0.0, 0.0), vertices=24, bevel=0.006):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, material, parent, bevel=bevel, smooth=True)


def uv_sphere(name, location, scale, material, parent, segments=24, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, parent, bevel=0, smooth=True)


def torus(name, location, major_radius, minor_radius, material, parent, segments=24, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=segments,
        minor_segments=max(6, segments // 4),
        major_radius=major_radius,
        minor_radius=minor_radius,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, material, parent, bevel=0, smooth=True)


def wedge(name, location, dimensions, material, parent):
    sx, sy, sz = (value * 0.5 for value in dimensions)
    vertices = [
        (-sx * 0.68, -sy, -sz * 0.62), (sx * 0.68, -sy, -sz * 0.62),
        (sx, sy, -sz), (-sx, sy, -sz),
        (-sx * 0.54, -sy, sz * 0.38), (sx * 0.54, -sy, sz * 0.38),
        (sx * 0.82, sy, sz), (-sx * 0.82, sy, sz),
    ]
    faces = [
        (0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1),
        (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    result = finish_mesh(obj, material, parent, bevel=0.018, smooth=False)
    bpy.ops.object.select_all(action="DESELECT")
    result.select_set(True)
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    return result


def empty(name, location, parent, semantic=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.08
    obj.location = location
    obj.parent = parent
    obj["canonical_node_name"] = name
    if semantic:
        obj["atomic_socket"] = semantic
    return obj


def add_nla_action(obj: bpy.types.Object, clip_name: str, keyframes, data_path: str, index=None) -> None:
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


def build_lod(lod: int, materials: dict[str, bpy.types.Material]):
    root = empty(f"HunterDrone_LOD{lod}", (0, 0, 0), None)
    root["asset_id"] = "hunter-drone-visual-family-v1"
    root["creator"] = "Atomic Acres project"
    root["license"] = "Original project work"
    root["quality_tier"] = f"LOD{lod}"
    root["runtime_forward_axis"] = "-Z"
    root["blender_authoring_forward_axis"] = "-Y"
    root["presentation_only"] = True

    segments = (32, 20, 12)[lod]
    rings = (16, 10, 8)[lod]
    detail = (1.0, 0.68, 0.34)[lod]

    body = empty("drone-body", (0, 0, 0), root, "body")
    wedge(f"Drone_Hull_LOD{lod}", (0, 0.02, 0.08), (0.88, 1.35, 0.34), materials["armor"], body)
    wedge(f"Drone_TopArmor_LOD{lod}", (0, 0.15, 0.19), (0.63, 0.93, 0.18), materials["dark"], body)
    cube(f"Drone_Spine_LOD{lod}", (0, 0.30, 0.14), (0.24, 0.68, 0.14), materials["armor"], body, bevel=0.025)
    cube(f"Drone_NoseBrow_LOD{lod}", (0, -0.65, 0.07), (0.48, 0.22, 0.16), materials["dark"], body, rotation=(math.radians(-8), 0, 0), bevel=0.025)
    cube(f"Drone_AftPower_LOD{lod}", (0, 0.58, 0.08), (0.58, 0.24, 0.25), materials["dark"], body, bevel=0.03)

    if lod < 2:
        for side in (-1, 1):
            for index in range(3 if lod == 0 else 2):
                cube(
                    f"Drone_Vent_{side}_{index}_LOD{lod}",
                    (side * 0.39, 0.18 + index * 0.13, 0.08),
                    (0.035, 0.085, 0.14), materials["vent"], body,
                    rotation=(0, 0, side * math.radians(8)), bevel=0.003,
                )
        for side in (-1, 1):
            cylinder(
                f"Drone_Antenna_{side}_LOD{lod}",
                (side * 0.22, 0.48, 0.40), 0.012, 0.34,
                materials["dark"], body,
                rotation=(side * math.radians(16), math.radians(4), 0),
                vertices=12, bevel=0.002,
            )

    optic = empty("drone-optic", (0, 0, 0), root, "optic")
    uv_sphere(f"Drone_OpticHousing_LOD{lod}", (0, -0.715, -0.03), (0.21, 0.17, 0.15), materials["dark"], optic, segments, rings)
    cylinder(
        f"Drone_OpticLens_LOD{lod}", (0, -0.855, -0.03), 0.105, 0.026,
        materials["optic"], optic, rotation=(math.pi / 2, 0, 0), vertices=segments, bevel=0.003,
    )
    empty("drone-first-person-camera-socket", (0, -0.91, 0.005), root, "first-person-camera")

    rotor_group = empty("drone-rotors", (0, 0, 0), root, "rotor-group")
    rotor_positions = [(-0.83, -0.34, 0.10), (0.83, -0.34, 0.10), (-0.83, 0.38, 0.10), (0.83, 0.38, 0.10)]
    for rotor_index, (x, y, z) in enumerate(rotor_positions):
        side = -1 if x < 0 else 1
        fore = -1 if y < 0 else 1
        arm_angle = math.atan2(x, y)
        arm_length = math.hypot(abs(x) - 0.30, abs(y) - 0.12)
        cube(
            f"Drone_RotorArm_{rotor_index}_LOD{lod}",
            (x * 0.58, y * 0.58, z + 0.03),
            (0.14, arm_length + 0.22, 0.105), materials["armor"], rotor_group,
            rotation=(0, 0, -arm_angle), bevel=0.025,
        )
        torus(
            f"Drone_Duct_{rotor_index}_LOD{lod}", (x, y, z), 0.25, 0.036,
            materials["dark"], rotor_group, segments=segments,
        )
        cylinder(
            f"Drone_RotorHub_{rotor_index}_LOD{lod}", (x, y, z), 0.055, 0.08,
            materials["metal"], rotor_group, vertices=max(12, segments // 2), bevel=0.005,
        )
        pivot = empty(f"drone-rotor-{rotor_index + 1}", (x, y, z + 0.015), rotor_group, "rotor-pivot")
        blade_count = 4 if lod < 2 else 3
        for blade_index in range(blade_count):
            angle = blade_index * math.tau / blade_count
            blade = cube(
                f"Drone_Blade_{rotor_index}_{blade_index}_LOD{lod}",
                (x + math.cos(angle) * 0.105, y + math.sin(angle) * 0.105, z + 0.015),
                (0.19, 0.042, 0.012), materials["metal"], pivot,
                rotation=(0, 0, angle), bevel=0.008,
            )
            # Convert world placement to pivot-local placement after parenting.
            blade.matrix_parent_inverse = pivot.matrix_world.inverted()
        direction = 1 if rotor_index % 2 == 0 else -1
        add_nla_action(
            pivot, "Drone_Propellers_Loop",
            [(1, 0.0), (13, direction * math.tau), (25, direction * math.tau * 2)],
            "rotation_euler", 2,
        )

    gun = empty("drone-mounted-gun", (0, 0, 0), root, "mounted-machine-gun")
    gun_base_y = gun.location.y
    cylinder(
        f"Drone_GunGimbal_LOD{lod}", (0, -0.18, -0.19), 0.14, 0.18,
        materials["dark"], gun, rotation=(0, math.pi / 2, 0), vertices=segments, bevel=0.008,
    )
    cube(f"Drone_GunReceiver_LOD{lod}", (0, -0.43, -0.27), (0.25, 0.45, 0.19), materials["metal"], gun, bevel=0.022)
    barrel_count = 3 if lod == 0 else 1
    for barrel_index in range(barrel_count):
        offset = (barrel_index - (barrel_count - 1) / 2) * 0.052
        cylinder(
            f"Drone_GunBarrel_{barrel_index}_LOD{lod}", (offset, -0.84, -0.27), 0.018, 0.68,
            materials["metal"], gun, rotation=(math.pi / 2, 0, 0), vertices=max(10, segments // 2), bevel=0.002,
        )
    cylinder(
        f"Drone_MuzzleBrake_LOD{lod}", (0, -1.19, -0.27), 0.055, 0.12,
        materials["dark"], gun, rotation=(math.pi / 2, 0, 0), vertices=max(12, segments // 2), bevel=0.004,
    )
    empty("drone-gun-muzzle-socket", (0, -1.27, -0.27), root, "muzzle")
    flash = cylinder(
        f"Drone_MuzzleFlash_LOD{lod}", (0, -1.33, -0.27), 0.055, 0.14,
        materials["muzzle"], gun, rotation=(math.pi / 2, 0, 0), vertices=12, bevel=0,
    )
    flash.scale = (0.001, 0.001, 0.001)
    add_nla_action(
        gun, "Drone_Gun_Recoil",
        [(1, gun_base_y), (2, gun_base_y + 0.075), (5, gun_base_y)],
        "location", 1,
    )
    add_nla_action(
        flash, "Drone_Gun_Fire",
        [(1, (0.001, 0.001, 0.001)), (2, (1.0, 1.0, 1.0)), (4, (0.001, 0.001, 0.001))],
        "scale",
    )

    for side in (-1, 1):
        cube(
            f"Drone_Skid_{side}_LOD{lod}", (side * 0.28, 0.10, -0.37),
            (0.055, 0.82, 0.055), materials["metal"], root,
            rotation=(0, 0, side * math.radians(2)), bevel=0.018,
        )
        for y in (-0.24, 0.38):
            cylinder(
                f"Drone_SkidStrut_{side}_{y}_LOD{lod}", (side * 0.27, y, -0.20),
                0.025, 0.34, materials["metal"], root,
                rotation=(0, side * math.radians(18), 0), vertices=max(10, segments // 2), bevel=0.003,
            )

    if detail > 0.5:
        for side in (-1, 1):
            cube(
                f"Drone_IdentityStrip_{side}_LOD{lod}", (side * 0.405, -0.18, 0.16),
                (0.018, 0.48, 0.045), materials["emissive"], body,
                rotation=(0, 0, side * math.radians(3)), bevel=0.003,
            )
    # Blender +Y converts to glTF local -Z. The model is authored along -Y for
    # ergonomic top-view construction, then the source root performs the exact
    # 180-degree up-axis correction retained in every exported hierarchy.
    root.rotation_mode = "XYZ"
    root.rotation_euler[2] = math.pi
    return root


def hierarchy(root):
    return [root, *root.children_recursive]


def export_lod(root: bpy.types.Object, lod: int) -> None:
    selected = set(hierarchy(root))
    for obj in bpy.data.objects:
        canonical = obj.get("canonical_node_name")
        if canonical and obj not in selected:
            obj.name = f"{canonical}__SOURCE_OTHER_LOD"
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
        filepath=str(RAW_DIR / f"hunter-drone-lod{lod}.glb"),
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
    for obj in selected:
        canonical = obj.get("canonical_node_name")
        if canonical:
            obj.name = f"{canonical}__SOURCE_LOD{lod}"


def look_at(obj: bpy.types.Object, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_reviews(lod0: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> None:
    for root in lod_roots:
        visible = root == lod0
        for obj in hierarchy(root):
            obj.hide_render = not visible
            obj.hide_viewport = not visible

    bpy.ops.mesh.primitive_plane_add(size=10, location=(0, 0, -0.43))
    stage = bpy.context.object
    stage.name = "Review_Stage"
    apply_material(stage, materials["stage"])

    for name, location, energy, color, size in (
        ("Review_Key", (-3.2, -3.0, 4.4), 1150, (0.54, 0.78, 1.0), 2.2),
        ("Review_Rim", (3.1, 1.2, 2.8), 1050, (1.0, 0.22, 0.06), 1.7),
        ("Review_Fill", (0.0, 3.8, 1.8), 700, (0.22, 0.48, 1.0), 2.4),
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
    camera.name = "Drone_Review_Camera"
    camera.data.lens = 58
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_SIZE
    scene.render.resolution_y = REVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.004, 0.008, 0.013)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.render.image_settings.color_mode = "RGBA"
    scene.frame_set(1)

    views = (
        ("front-quarter", (-2.85, 3.25, 1.55), (0, 0.05, 0.0)),
        ("rear-quarter", (2.65, -3.4, 1.82), (0, -0.05, 0.0)),
        ("side-gun", (3.55, -0.45, 0.65), (0, -0.28, -0.12)),
        ("optic-closeup", (0.0, 2.6, 0.06), (0, 0.50, -0.04)),
    )
    rendered = []
    for label, location, target in views:
        camera.location = location
        look_at(camera, target)
        path = REVIEW_DIR / f"hunter-drone-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)

    source_images = [bpy.data.images.load(str(path), check_existing=False) for path in rendered]
    sheet = bpy.data.images.new("Hunter_Drone_Contact_Sheet", REVIEW_SIZE * 2, REVIEW_SIZE * 2, alpha=True)
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
    sheet.filepath_raw = str(REVIEW_DIR / "hunter-drone-contact-sheet.png")
    sheet.save()


reset()
images = {kind: make_texture(f"Hunter_Drone_{kind.title()}", kind) for kind in ("albedo", "normal", "orm", "emissive")}
materials = {
    "armor": textured_material("MAT_HunterDrone_Armor_PBR", images),
    "dark": simple_material("MAT_HunterDrone_DarkArmor", (0.018, 0.032, 0.042, 1), 0.82, 0.31),
    "metal": simple_material("MAT_HunterDrone_Gunmetal", (0.055, 0.067, 0.073, 1), 0.94, 0.22),
    "vent": simple_material("MAT_HunterDrone_Vents", (0.004, 0.008, 0.010, 1), 0.76, 0.48),
    "optic": simple_material("MAT_HunterDrone_Optic", (0.006, 0.12, 0.15, 1), 0.42, 0.12, (0.0, 0.86, 1.0, 1), 4.2),
    "emissive": simple_material("MAT_HunterDrone_IdentityLight", (0.01, 0.09, 0.12, 1), 0.28, 0.2, (0.0, 0.72, 1.0, 1), 5.0),
    "muzzle": simple_material("MAT_HunterDrone_MuzzleFlash", (1.0, 0.22, 0.025, 1), 0.0, 0.18, (1.0, 0.08, 0.0, 1), 7.5),
    "stage": simple_material("MAT_ReviewStage", (0.012, 0.018, 0.024, 1), 0.1, 0.62),
}

lod_roots = [build_lod(lod, materials) for lod in range(3)]
for lod, lod_root in enumerate(lod_roots):
    export_lod(lod_root, lod)

render_reviews(lod_roots[0], materials)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))

for lod, lod_root in enumerate(lod_roots):
    meshes = [obj for obj in hierarchy(lod_root) if obj.type == "MESH"]
    triangles = sum(len(poly.vertices) - 2 for obj in meshes for poly in obj.data.polygons)
    print(f"HUNTER_DRONE_LOD{lod}_READY meshes={len(meshes)} triangles={triangles}")
print(f"BLEND={SOURCE_BLEND}")
print(f"RAW_DIR={RAW_DIR}")
print(f"REVIEW={REVIEW_DIR / 'hunter-drone-contact-sheet.png'}")
