"""Author dedicated opaque first-person operator arms for Pass 65 in Blender.

The two exported LODs share the same named deform skeleton and action corpus but
are independently built. Elbow, wrist and knuckle seams use normalized adjacent-
bone blends; runtime grip IK remains presentation-only and cannot change camera
or shot authority.
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE_BLEND = ROOT / "source-assets/blender/pass65-first-person-operator-arms.blend"
RAW_DIR = ROOT / "artifacts/blender-operator-arms/raw"
TEXTURE_DIR = ROOT / "public/assets/original/textures/operators/pass65-first-person-arms"
REVIEW_DIR = ROOT / "docs/assets/pass65-operators/first-person-arms"
FIREARM_RAW_DIR = ROOT / "artifacts/blender-weapon-families/raw"
TEXTURE_SIZE = 512
REVIEW_SIZE = 640
ASSET_ID = "pass65-first-person-operator-arms"
CORE_ACTIONS = (
    "equip", "unequip", "idle", "walk", "sprint", "ads-in", "ads-out",
    "fire", "dry-fire", "reload", "empty-reload", "melee", "inspect",
)
FINGER_NAMES = ("Index", "Middle", "Ring", "Pinky")
EXPECTED_WEIGHTED_PARTS = 45
EXPECTED_BONE_COUNT = 37
MAX_SKINNED_RENDERABLES = 6
EXPECTED_BATCH_MATERIALS = (
    "MAT_Pass65_Arms_ArmorPad",
    "MAT_Pass65_Arms_Glove_PBR",
    "MAT_Pass65_Arms_Sleeve_PBR",
    "MAT_Pass65_Arms_WristDisplay",
)
REQUIRED_BLENDED_JOINT_PAIRS = (
    "LowerArmL:WristL", "LowerArmR:WristR",
    "LowerArmL:UpperArmL", "LowerArmR:UpperArmR",
    "Index1L:Index2L", "Index1R:Index2R",
    "Index2L:Index3L", "Index2R:Index3R",
    "Thumb1L:Thumb2L", "Thumb1R:Thumb2R",
    "Thumb2L:Thumb3L", "Thumb2R:Thumb3R",
)

for directory in (SOURCE_BLEND.parent, RAW_DIR, TEXTURE_DIR, REVIEW_DIR):
    directory.mkdir(parents=True, exist_ok=True)
bpy.context.preferences.filepaths.save_version = 0


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


def make_texture(name: str, kind: str) -> bpy.types.Image:
    image = bpy.data.images.new(name, width=TEXTURE_SIZE, height=TEXTURE_SIZE, alpha=True)
    pixels: list[float] = [0.0] * (TEXTURE_SIZE * TEXTURE_SIZE * 4)
    for y in range(TEXTURE_SIZE):
        for x in range(TEXTURE_SIZE):
            u = x / (TEXTURE_SIZE - 1)
            v = y / (TEXTURE_SIZE - 1)
            weave = ((x * 31 + y * 47 + (x ^ y) * 5) % 127) / 126.0
            twill = (math.sin((x + y) * 0.39) + math.sin((x - y) * 0.27)) * 0.5
            seam = min(x % 192, y % 192, 191 - (x % 192), 191 - (y % 192)) < 2
            stitch = ((x + y * 3) % 211) < 3
            glove_zone = u > 0.5
            if kind == "baseColor":
                if glove_zone:
                    # Gun Range is a dark indoor arena and most weapons are
                    # black. Keep the glove tactical, but give its authored
                    # fingers enough cool-value separation to read around the
                    # grip instead of collapsing into one black paddle.
                    base = 0.22 + weave * 0.075 + max(0.0, twill) * 0.018
                    value = [base * 0.56, base * 0.78, base * 0.9]
                else:
                    base = 0.15 + weave * 0.06 + twill * 0.014
                    value = [base * 0.46, base * 0.69, base * 0.78]
                if seam:
                    value = [component * 0.52 for component in value]
                elif stitch:
                    value = [min(1.0, component + 0.018) for component in value]
            elif kind == "normal":
                nx = 0.5 + (weave - 0.5) * 0.065 + twill * 0.018
                ny = 0.5 + (0.085 if seam else (weave - 0.5) * 0.05 - twill * 0.012)
                value = [nx, ny, 0.992]
            elif kind == "roughness":
                rough = (0.79 if glove_zone else 0.9) + weave * 0.07
                value = [rough, rough, rough]
            elif kind == "metallic":
                metal = 0.015
                value = [metal, metal, metal]
            else:
                raise RuntimeError(kind)
            index = (y * TEXTURE_SIZE + x) * 4
            pixels[index:index + 4] = [*value, 1.0]
    image.colorspace_settings.name = "Non-Color" if kind in {"normal", "roughness", "metallic"} else "sRGB"
    image.pixels = pixels
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"pass65-first-person-arms-{kind}.png")
    image.save()
    image.pack()
    return image


def textured_material(name: str, images, tint, uv_offset_x: float):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    input_socket(bsdf, "Base Color").default_value = tint
    input_socket(bsdf, "Roughness").default_value = 0.84
    input_socket(bsdf, "Metallic").default_value = 0.02
    texcoord = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Location"].default_value[0] = uv_offset_x
    links.new(texcoord.outputs["UV"], mapping.inputs["Vector"])
    for kind, target in (("baseColor", "Base Color"), ("roughness", "Roughness"), ("metallic", "Metallic")):
        tex = nodes.new("ShaderNodeTexImage")
        tex.name = f"Pass65 Arms {kind}"
        tex.image = images[kind]
        links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        links.new(tex.outputs["Color"], input_socket(bsdf, target))
    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.name = "Pass65 Arms normal"
    normal_tex.image = images["normal"]
    links.new(mapping.outputs["Vector"], normal_tex.inputs["Vector"])
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = 0.78
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], input_socket(bsdf, "Normal"))
    return material


def simple_material(name, color, metallic, roughness, emission=None, strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    input_socket(bsdf, "Base Color").default_value = color
    input_socket(bsdf, "Metallic").default_value = metallic
    input_socket(bsdf, "Roughness").default_value = roughness
    if emission is not None:
        input_socket(bsdf, "Emission Color", "Emission").default_value = emission
        input_socket(bsdf, "Emission Strength").default_value = strength
    return material


def finish_mesh(obj, material, bevel=0.0, smooth=False):
    obj.name = obj.name.replace(".", "_")
    obj.data.materials.append(material)
    if bevel > 0:
        modifier = obj.modifiers.new("Soft tactical edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    triangulate = obj.modifiers.new("Release triangulation", "TRIANGULATE")
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    if smooth:
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
    return obj


def rounded_cube(name, location, dimensions, material, bevel, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish_mesh(obj, material, bevel=bevel)


def join_meshes(name, objects):
    source_materials = {material for obj in objects for material in obj.data.materials if material is not None}
    if len(source_materials) != 1:
        raise RuntimeError(f"{name}: reviewable joined construction requires one shared material")
    material = next(iter(source_materials))
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    if len(objects) > 1:
        bpy.ops.object.join()
    objects[0].name = name
    objects[0].data.materials.clear()
    objects[0].data.materials.append(material)
    for polygon in objects[0].data.polygons:
        polygon.material_index = 0
    return objects[0]


def tapered_segment(name, start, end, radius_start, radius_end, material, vertices):
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    midpoint = (start_v + end_v) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius_start, radius2=radius_end,
        depth=direction.length, location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_mode = "XYZ"
    return finish_mesh(obj, material, bevel=0.006, smooth=True)


def profiled_segment(name, start, end, rings, material, vertices):
    """Create an asymmetric elliptical limb/hand rather than a cone-like tube."""
    start_v = Vector(start)
    end_v = Vector(end)
    axis = (end_v - start_v).normalized()
    side = axis.cross(Vector((0, 0, 1)))
    if side.length < 0.001:
        side = axis.cross(Vector((1, 0, 0)))
    side.normalize()
    up = side.cross(axis).normalized()
    points = []
    for t, radius_side, radius_up, side_offset, up_offset in rings:
        center = start_v.lerp(end_v, t) + side * side_offset + up * up_offset
        for index in range(vertices):
            angle = math.tau * index / vertices
            points.append(center + side * (math.cos(angle) * radius_side) + up * (math.sin(angle) * radius_up))
    faces = []
    ring_count = len(rings)
    for ring in range(ring_count - 1):
        for index in range(vertices):
            next_index = (index + 1) % vertices
            a = ring * vertices + index
            b = ring * vertices + next_index
            c = (ring + 1) * vertices + next_index
            d = (ring + 1) * vertices + index
            faces.append((a, b, c, d))
    start_center = len(points)
    end_center = start_center + 1
    points.extend([start_v, end_v])
    for index in range(vertices):
        next_index = (index + 1) % vertices
        faces.append((start_center, next_index, index))
        final_ring = (ring_count - 1) * vertices
        faces.append((end_center, final_ring + index, final_ring + next_index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(points, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            if vertex_index < ring_count * vertices:
                ring = vertex_index // vertices
                around = vertex_index % vertices
                uv_layer.data[loop_index].uv = (around / vertices, ring / max(1, ring_count - 1))
            else:
                uv_layer.data[loop_index].uv = (0.5, 0.5)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish_mesh(obj, material, smooth=True)


def profiled_weighted_path(name, rings, material, vertices, armature):
    """Create one genuinely continuous skinned shell along a bent limb path.

    Each ring declares its deform weights. Faces share the same joint ring, so
    elbow and wrist deformation cannot open a contour gap even at aggressive
    runtime IK poses. This is deliberately different from overlapping capsule
    segments: the visible shoulder-to-palm silhouette is one manifold shell.
    """
    if len(rings) < 2:
        raise RuntimeError(f"{name}: a weighted path requires at least two rings")
    centers = [Vector(ring[0]) for ring in rings]
    points = []
    ring_weights = []
    for ring_index, (center_value, radius_side, radius_up, side_offset, up_offset, weights) in enumerate(rings):
        center = Vector(center_value)
        if ring_index == 0:
            tangent = centers[1] - center
        elif ring_index == len(rings) - 1:
            tangent = center - centers[ring_index - 1]
        else:
            tangent = centers[ring_index + 1] - centers[ring_index - 1]
        tangent.normalize()
        side = tangent.cross(Vector((0, 0, 1)))
        if side.length < 0.001:
            side = tangent.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(tangent).normalized()
        center += side * side_offset + up * up_offset
        normalized_total = sum(weights.values())
        if normalized_total <= 0:
            raise RuntimeError(f"{name}: ring {ring_index} has no deform weight")
        normalized = {bone: weight / normalized_total for bone, weight in weights.items() if weight > 0}
        for index in range(vertices):
            angle = math.tau * index / vertices
            points.append(center + side * (math.cos(angle) * radius_side) + up * (math.sin(angle) * radius_up))
            ring_weights.append(normalized)
    faces = []
    for ring_index in range(len(rings) - 1):
        for index in range(vertices):
            next_index = (index + 1) % vertices
            a = ring_index * vertices + index
            b = ring_index * vertices + next_index
            c = (ring_index + 1) * vertices + next_index
            d = (ring_index + 1) * vertices + index
            faces.append((a, b, c, d))
    start_center = len(points)
    end_center = start_center + 1
    points.extend((centers[0], centers[-1]))
    ring_weights.extend((ring_weights[0], ring_weights[-1]))
    for index in range(vertices):
        next_index = (index + 1) % vertices
        faces.append((start_center, next_index, index))
        final_ring = (len(rings) - 1) * vertices
        faces.append((end_center, final_ring + index, final_ring + next_index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(points, [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            if vertex_index < len(rings) * vertices:
                ring_index = vertex_index // vertices
                around = vertex_index % vertices
                uv_layer.data[loop_index].uv = (around / vertices, ring_index / max(1, len(rings) - 1))
            else:
                uv_layer.data[loop_index].uv = (0.5, 0.5)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish_mesh(obj, material, smooth=True)
    attach_to_armature(obj, armature)
    groups = {
        bone: obj.vertex_groups.new(name=bone)
        for bone in sorted({bone for weights in ring_weights for bone in weights})
    }
    blended_vertices = 0
    pairs = set()
    for vertex, weights in zip(obj.data.vertices, ring_weights):
        active = sorted(bone for bone, weight in weights.items() if weight > 0.05)
        if len(active) > 1:
            blended_vertices += 1
            pairs.add(":".join(active))
        for bone, weight in weights.items():
            groups[bone].add([vertex.index], weight, "REPLACE")
    obj["weighted_bone"] = max(
        ((bone, sum(weights.get(bone, 0) for weights in ring_weights)) for bone in groups),
        key=lambda item: item[1],
    )[0]
    obj["weighting_contract"] = "continuous-manifold-ring-blend-v6"
    obj["blended_vertex_count"] = blended_vertices
    obj["blended_joint_pairs_csv"] = ",".join(sorted(pairs))
    obj["manifold_continuity_contract"] = "shared-elbow-wrist-ring-no-open-seams"
    return obj


def sphere(name, location, radius, material, segments, rings):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    return finish_mesh(obj, material, smooth=True)


def empty(name, location, parent, semantic=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.empty_display_type = "ARROWS"
    obj.empty_display_size = 0.055
    obj.location = location
    obj.parent = parent
    obj["canonical_node_name"] = name
    if semantic:
        obj["atomic_socket"] = semantic
    return obj


def bone_socket(name, world_location, armature, bone_name, semantic=None):
    """Author a semantic empty under the deform bone while preserving world pose."""
    obj = empty(name, (0, 0, 0), armature, semantic)
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = Matrix.Translation(Vector(world_location))
    obj["deform_parent_bone"] = bone_name
    return obj


def add_edit_bone(armature, name, head, tail, parent=None):
    bone = armature.data.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.use_deform = name != "Root"
    if parent:
        bone.parent = armature.data.edit_bones[parent]
        bone.use_connect = (Vector(head) - Vector(bone.parent.tail)).length < 0.0001
    return bone


def attach_to_armature(obj, armature):
    # glTF requires skinned mesh nodes to be scene roots. Parenting them under
    # the armature emits NODE_SKINNED_MESH_NON_ROOT and makes parent transforms
    # ambiguous at runtime. Keep ownership metadata for deterministic export
    # and review selection while the Armature modifier owns deformation.
    obj.parent = None
    obj["pass65_asset_root"] = armature.parent.get("asset_root_key", armature.parent.name)
    modifier = obj.modifiers.new("Pass65 authored armature", "ARMATURE")
    modifier.object = armature
    obj["opaque_release_mesh"] = True


def skin_to_bone(obj, armature, bone_name):
    attach_to_armature(obj, armature)
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj["weighted_bone"] = bone_name
    obj["blended_vertex_count"] = 0
    obj["blended_joint_pairs_csv"] = ""
    return obj


def skin_blended_chain(obj, armature, current_bone, start, end, parent_bone=None, child_bone=None, blend=0.28):
    """Weight matching seam vertices identically across an articulated chain.

    Each segment retains a dominant owning bone, but the first/last blend zones
    share up to 50 percent with the adjacent bone. Matching 50/50 endpoint
    weights keep neighbouring digit rings coincident under rotation and remove
    the last small gaps between articulated finger segments. This removes the rigid hinge
    deformation that made elbows, wrists and knuckles read as disconnected
    mannequin pieces while keeping the existing skeleton/socket API intact.
    """
    attach_to_armature(obj, armature)
    names = [name for name in (parent_bone, current_bone, child_bone) if name]
    groups = {name: obj.vertex_groups.new(name=name) for name in names}
    start_v = Vector(start)
    axis = Vector(end) - start_v
    axis_length_sq = max(axis.length_squared, 1e-9)
    blended_vertices = 0
    pairs = set()
    for vertex in obj.data.vertices:
        world = obj.matrix_world @ vertex.co
        t = max(0.0, min(1.0, (world - start_v).dot(axis) / axis_length_sq))
        weights = {current_bone: 1.0}
        if parent_bone and t < blend:
            adjacent = 0.5 * (1.0 - t / blend)
            weights = {parent_bone: adjacent, current_bone: 1.0 - adjacent}
        elif child_bone and t > 1.0 - blend:
            adjacent = 0.5 * ((t - (1.0 - blend)) / blend)
            weights = {current_bone: 1.0 - adjacent, child_bone: adjacent}
        active = [name for name, weight in weights.items() if weight > 0.05]
        if len(active) > 1:
            blended_vertices += 1
            pairs.add(":".join(sorted(active)))
        for name, weight in weights.items():
            if weight > 0:
                groups[name].add([vertex.index], weight, "REPLACE")
    obj["weighted_bone"] = current_bone
    obj["weighting_contract"] = "adjacent-bone-normalized-blend-v5"
    obj["blended_vertex_count"] = blended_vertices
    obj["blended_joint_pairs_csv"] = ",".join(sorted(pairs))
    return obj


def skin_crossfade(obj, armature, bone_a, bone_b, start, end):
    """Cross-fade a dedicated joint envelope between its two deform bones."""
    attach_to_armature(obj, armature)
    groups = {name: obj.vertex_groups.new(name=name) for name in (bone_a, bone_b)}
    start_v = Vector(start)
    axis = Vector(end) - start_v
    axis_length_sq = max(axis.length_squared, 1e-9)
    blended_vertices = 0
    for vertex in obj.data.vertices:
        world = obj.matrix_world @ vertex.co
        t = max(0.0, min(1.0, (world - start_v).dot(axis) / axis_length_sq))
        weight_b = t
        weight_a = 1.0 - t
        groups[bone_a].add([vertex.index], weight_a, "REPLACE")
        groups[bone_b].add([vertex.index], weight_b, "REPLACE")
        if weight_a > 0.05 and weight_b > 0.05:
            blended_vertices += 1
    obj["weighted_bone"] = bone_b
    obj["weighting_contract"] = "two-bone-joint-envelope-v5"
    obj["blended_vertex_count"] = blended_vertices
    obj["blended_joint_pairs_csv"] = ":".join(sorted((bone_a, bone_b)))
    return obj


def batch_skinned_renderables(root, armature):
    """Join rigidly weighted source pieces into one renderable per material.

    The independently authored pieces and their vertex groups remain intact
    inside the batches. Keeping the skinned nodes as scene roots preserves the
    glTF skinning contract while avoiding one WebGPU pipeline/draw per finger,
    guard and sleeve component.
    """
    root_key = root.get("asset_root_key", root.name)
    source_parts = sorted(
        (
            obj for obj in bpy.data.objects
            if obj.type == "MESH" and obj.get("pass65_asset_root") == root_key
        ),
        key=lambda obj: obj.name,
    )
    if len(source_parts) != EXPECTED_WEIGHTED_PARTS:
        raise RuntimeError(
            f"{root.name}: expected {EXPECTED_WEIGHTED_PARTS} weighted source parts, "
            f"found {len(source_parts)}"
        )

    by_material = {}
    for obj in source_parts:
        assigned_materials = [material for material in obj.data.materials if material is not None]
        if len(assigned_materials) != 1:
            raise RuntimeError(f"{obj.name}: batching requires exactly one assigned material")
        armature_modifiers = [modifier for modifier in obj.modifiers if modifier.type == "ARMATURE"]
        if len(armature_modifiers) != 1 or armature_modifiers[0].object != armature:
            raise RuntimeError(f"{obj.name}: batching requires exactly one shared armature modifier")
        by_material.setdefault(assigned_materials[0].name, []).append(obj)

    if tuple(sorted(by_material)) != EXPECTED_BATCH_MATERIALS:
        raise RuntimeError(
            f"{root.name}: expected material batches {EXPECTED_BATCH_MATERIALS}, "
            f"found {tuple(sorted(by_material))}"
        )
    if len(by_material) > MAX_SKINNED_RENDERABLES:
        raise RuntimeError(
            f"{root.name}: {len(by_material)} material batches exceed "
            f"the {MAX_SKINNED_RENDERABLES}-renderable budget"
        )

    batches = []
    all_blended_pairs = set()
    total_blended_vertices = 0
    multi_bone_parts = 0
    for material_name, pieces in sorted(by_material.items()):
        weighted_bones = sorted({group.name for piece in pieces for group in piece.vertex_groups})
        blended_vertices = sum(int(piece.get("blended_vertex_count", 0)) for piece in pieces)
        blended_pairs = {
            pair
            for piece in pieces
            for pair in str(piece.get("blended_joint_pairs_csv", "")).split(",")
            if pair
        }
        total_blended_vertices += blended_vertices
        all_blended_pairs.update(blended_pairs)
        multi_bone_parts += sum(len(piece.vertex_groups) > 1 for piece in pieces)
        bpy.ops.object.select_all(action="DESELECT")
        for piece in pieces:
            piece.select_set(True)
        batch = pieces[0]
        bpy.context.view_layer.objects.active = batch
        if len(pieces) > 1:
            bpy.ops.object.join()
        bpy.ops.object.material_slot_remove_unused()

        material_slug = material_name.removeprefix("MAT_Pass65_Arms_").removesuffix("_PBR")
        batch.name = f"Pass65_Arms_Batch_{material_slug}_{root.get('quality_tier')}"
        batch.parent = None
        batch["pass65_asset_root"] = root_key
        batch["opaque_release_mesh"] = True
        batch["batched_skinned_renderable"] = True
        batch["batched_material"] = material_name
        batch["weighted_part_count"] = len(pieces)
        batch["weighted_bones_csv"] = ",".join(weighted_bones)
        batch["blended_vertex_count"] = blended_vertices
        batch["blended_joint_pairs_csv"] = ",".join(sorted(blended_pairs))
        if "weighted_bone" in batch:
            del batch["weighted_bone"]

        assigned_materials = [material for material in batch.data.materials if material is not None]
        if len(assigned_materials) != 1 or assigned_materials[0].name != material_name:
            raise RuntimeError(f"{batch.name}: joined batch did not retain exactly one material")
        armature_modifiers = [modifier for modifier in batch.modifiers if modifier.type == "ARMATURE"]
        if len(armature_modifiers) != 1 or armature_modifiers[0].object != armature:
            raise RuntimeError(f"{batch.name}: joined batch did not retain the shared armature")
        batches.append(batch)

    root["source_weighted_part_count"] = len(source_parts)
    root["expected_bone_count"] = EXPECTED_BONE_COUNT
    root["batched_skinned_mesh_count"] = len(batches)
    root["max_skinned_renderable_meshes"] = MAX_SKINNED_RENDERABLES
    root["max_skinned_primitives"] = MAX_SKINNED_RENDERABLES
    root["batching_policy"] = "one-shared-armature-batch-per-material"
    root["weighting_contract"] = "adjacent-bone-normalized-blend-v5"
    root["blended_vertex_count"] = total_blended_vertices
    root["multi_bone_weighted_part_count"] = multi_bone_parts
    root["blended_joint_pairs_csv"] = ",".join(sorted(all_blended_pairs))
    missing_pairs = sorted(set(REQUIRED_BLENDED_JOINT_PAIRS) - all_blended_pairs)
    if missing_pairs:
        raise RuntimeError(f"{root.name}: missing required blended joint pairs {missing_pairs}")
    return batches


def set_pose_rotation(armature, bone_name, rotation):
    bone = armature.pose.bones.get(bone_name)
    if bone is None:
        return
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = rotation


def reset_pose(armature):
    for bone in armature.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
        bone.location = (0, 0, 0)
        bone.scale = (1, 1, 1)


def add_armature_action(armature, clip_name: str, end_frame: int, middle_frame: int, pose_map):
    action = bpy.data.actions.new(f"Pass65Arms_{clip_name}__{armature.name}")
    armature.animation_data_create()
    armature.animation_data.action = action
    reset_pose(armature)
    for bone in armature.pose.bones:
        bone.keyframe_insert(data_path="rotation_euler", frame=1)
    for bone_name, rotation in pose_map.items():
        set_pose_rotation(armature, bone_name, rotation)
    for bone in armature.pose.bones:
        bone.keyframe_insert(data_path="rotation_euler", frame=middle_frame)
    reset_pose(armature)
    for bone in armature.pose.bones:
        bone.keyframe_insert(data_path="rotation_euler", frame=end_frame)
    track = armature.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.action_frame_start = 1
    strip.action_frame_end = end_frame
    armature.animation_data.action = None
    reset_pose(armature)


def action_corpus(armature):
    poses = {
        "equip": (14, 7, {"UpperArmR": (-0.12, 0.08, -0.1), "UpperArmL": (-0.12, -0.08, 0.1)}),
        "unequip": (14, 8, {"UpperArmR": (0.2, -0.18, 0.28), "UpperArmL": (0.18, 0.16, -0.28)}),
        "idle": (48, 24, {"UpperArmR": (-0.018, 0.012, -0.012), "UpperArmL": (-0.016, -0.012, 0.012)}),
        "walk": (24, 12, {"UpperArmR": (-0.04, 0.025, -0.05), "UpperArmL": (0.035, -0.02, 0.05)}),
        "sprint": (22, 11, {"UpperArmR": (0.26, -0.18, 0.34), "LowerArmR": (-0.24, 0.02, -0.1), "UpperArmL": (0.18, 0.22, -0.38), "LowerArmL": (-0.2, -0.02, 0.12)}),
        "ads-in": (12, 8, {"UpperArmR": (-0.08, 0.04, -0.05), "UpperArmL": (-0.1, -0.035, 0.05), "WristR": (-0.04, 0, 0), "WristL": (-0.04, 0, 0)}),
        "ads-out": (12, 5, {"UpperArmR": (-0.08, 0.04, -0.05), "UpperArmL": (-0.1, -0.035, 0.05)}),
        "fire": (7, 2, {"UpperArmR": (-0.075, 0.01, -0.025), "LowerArmR": (-0.1, 0, 0.02), "WristR": (-0.12, 0, 0.04), "UpperArmL": (-0.045, 0, 0.02)}),
        "dry-fire": (5, 2, {"WristR": (-0.04, 0, 0.018)}),
        "reload": (30, 15, {"UpperArmL": (0.42, -0.35, 0.5), "LowerArmL": (-0.7, 0.12, -0.18), "WristL": (-0.28, 0.26, -0.42), "UpperArmR": (-0.08, 0.04, -0.04)}),
        "empty-reload": (40, 20, {"UpperArmL": (0.5, -0.42, 0.58), "LowerArmL": (-0.82, 0.15, -0.22), "WristL": (-0.35, 0.3, -0.48), "UpperArmR": (-0.1, 0.05, -0.05)}),
        "melee": (18, 8, {"UpperArmR": (-0.48, -0.38, 0.72), "LowerArmR": (-0.72, 0.05, -0.25), "WristR": (-0.4, -0.12, 0.38), "UpperArmL": (0.18, 0.16, -0.2)}),
        "inspect": (54, 27, {"UpperArmR": (0.18, -0.32, 0.42), "LowerArmR": (-0.42, 0.08, -0.12), "WristR": (-0.1, 0.38, 0.12), "UpperArmL": (0.12, 0.28, -0.38), "LowerArmL": (-0.36, -0.08, 0.14)}),
    }
    # Shoulder/elbow/wrist tracks remain useful for offline authoring review,
    # while runtime IK intentionally overwrites those three chains. Finger
    # tracks are therefore the safe authored layer consumed at runtime: they
    # add grip closure and action readability without moving an authoritative
    # weapon socket or changing a gameplay ray.
    def add_finger_pose(pose, side, digit_curl, thumb_curl):
        for finger_name in FINGER_NAMES:
            values = digit_curl[finger_name]
            for joint, value in enumerate(values, start=1):
                pose[f"{finger_name}{joint}{side}"] = (value, 0.0, 0.0)
        for joint, value in enumerate(thumb_curl, start=1):
            pose[f"Thumb{joint}{side}"] = (value, 0.0, 0.0)

    relaxed = {name: (0.05, 0.09, 0.06) for name in FINGER_NAMES}
    firing = {
        "Index": (0.03, 0.08, 0.05),
        "Middle": (0.18, 0.28, 0.19),
        "Ring": (0.22, 0.34, 0.24),
        "Pinky": (0.27, 0.4, 0.29),
    }
    support = {name: (0.14, 0.24, 0.16) for name in FINGER_NAMES}
    magazine = {
        "Index": (0.18, 0.32, 0.22), "Middle": (0.24, 0.42, 0.3),
        "Ring": (0.28, 0.48, 0.34), "Pinky": (0.32, 0.54, 0.38),
    }
    knife = {
        "Index": (0.28, 0.48, 0.34), "Middle": (0.34, 0.58, 0.42),
        "Ring": (0.38, 0.64, 0.46), "Pinky": (0.42, 0.68, 0.5),
    }
    for clip_name in ("fire", "dry-fire"):
        add_finger_pose(poses[clip_name][2], "R", firing, (0.12, 0.18, 0.12))
        add_finger_pose(poses[clip_name][2], "L", support, (0.1, 0.16, 0.1))
    for clip_name in ("reload", "empty-reload"):
        add_finger_pose(poses[clip_name][2], "R", firing, (0.1, 0.16, 0.1))
        add_finger_pose(poses[clip_name][2], "L", magazine, (0.18, 0.3, 0.2))
    add_finger_pose(poses["melee"][2], "R", knife, (0.24, 0.38, 0.26))
    add_finger_pose(poses["melee"][2], "L", relaxed, (0.04, 0.08, 0.05))
    add_finger_pose(poses["inspect"][2], "R", support, (0.1, 0.16, 0.1))
    add_finger_pose(poses["inspect"][2], "L", magazine, (0.16, 0.26, 0.18))
    for clip_name in CORE_ACTIONS:
        end_frame, middle_frame, pose_map = poses[clip_name]
        add_armature_action(armature, clip_name, end_frame, middle_frame, pose_map)


def build_armature(label: str, detail: float):
    root = empty(f"Pass65_FirstPersonArms_{label}", (0, 0, 0), None)
    root["asset_id"] = ASSET_ID
    root["asset_root_key"] = root.name
    root["creator"] = "Atomic Acres project"
    root["license"] = "Project-original"
    root["quality_tier"] = label
    root["runtime_forward_axis"] = "-Z"
    root["blender_authoring_forward_axis"] = "+Y"
    root["opaque_material_contract"] = True
    root["presentation_only"] = True
    root["visual_revision"] = "continuous-manifold-viewmodel-v6"
    root["limb_profile_contract"] = "continuous-shoulder-elbow-wrist-manifold-shell-v6"
    root["hand_pose_contract"] = "continuous-cuff-palm-wrapped-articulated-digit-grip-v6"
    root["shoulder_entry_contract"] = "full-profile-frame-edge-sleeve-v6"
    root["glove_construction_contract"] = "opaque-continuous-palm-wrapped-fingers-cloth-v6"
    root["weapon_grip_review_contract"] = "all-family-runtime-plus-m4-contact-v5"
    root["runtime_animation_contract"] = "authored-fingers-under-runtime-chain-ik-v1"
    root["finger_segment_count"] = 30
    root["weapon_grip_review_frames"] = 3

    armature_data = bpy.data.armatures.new(f"Pass65_FirstPersonArms_Skeleton_{label}")
    armature = bpy.data.objects.new(f"pass65-first-person-arms-skeleton-{label}", armature_data)
    bpy.context.collection.objects.link(armature)
    armature.parent = root
    armature["asset_id"] = ASSET_ID
    armature["dedicated_first_person_skeleton"] = True
    armature.show_in_front = True
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    add_edit_bone(armature, "Root", (0, -0.46, 0.0), (0, -0.58, 0.0))

    chains = {}
    for side, sign in (("R", 1), ("L", -1)):
        shoulder_x = 0.355 * sign
        # Blender +Y exports to glTF -Z, the same forward axis used by the
        # camera-space weapon/socket contract.
        upper_head = (shoulder_x, -0.42, 0.035)
        if side == "R":
            # The firing hand sits closer to the camera and lower on the A2
            # pistol grip. Its palm and curled trigger/resting fingers meet the
            # authored right-grip socket without forcing a mirrored mannequin
            # pose on the support arm.
            upper_tail = (0.27, 0.08, -0.005)
            lower_tail = (0.18, 0.62, -0.04)
            wrist_tail = (0.10, 0.78, -0.055)
        else:
            # The support arm reaches farther and slightly higher around the
            # RAS handguard. This asymmetric first-person stance is the actual
            # M4 contact silhouette, not a cosmetic camera offset.
            upper_tail = (-0.27, 0.10, 0.0)
            lower_tail = (-0.17, 0.75, 0.01)
            wrist_tail = (-0.08, 1.05, 0.005)
        add_edit_bone(armature, f"UpperArm{side}", upper_head, upper_tail, "Root")
        add_edit_bone(armature, f"LowerArm{side}", upper_tail, lower_tail, f"UpperArm{side}")
        add_edit_bone(armature, f"Wrist{side}", lower_tail, wrist_tail, f"LowerArm{side}")
        chains[side] = (upper_head, upper_tail, lower_tail, wrist_tail)
        finger_x_offsets = (-0.049, -0.016, 0.017, 0.048)
        finger_lengths = ((0.078, 0.057, 0.041), (0.086, 0.062, 0.044), (0.081, 0.058, 0.041), (0.067, 0.048, 0.035))
        palm_end_y = wrist_tail[1] + 0.17
        for finger_index, (finger_name, offset) in enumerate(zip(FINGER_NAMES, finger_x_offsets)):
            proximal, middle, distal = finger_lengths[finger_index]
            length_bias = (1.5 - finger_index) * 0.003
            start = (wrist_tail[0] + offset * sign, palm_end_y - 0.025 + length_bias, wrist_tail[2] + 0.002)
            one = (start[0] + 0.004 * sign, start[1] + proximal * 0.88, start[2] - proximal * 0.22)
            two = (one[0] - 0.002 * sign, one[1] + middle * 0.56, one[2] - middle * 0.83)
            three = (two[0] - 0.004 * sign, two[1] - distal * 0.24, two[2] - distal * 0.97)
            add_edit_bone(armature, f"{finger_name}1{side}", start, one, f"Wrist{side}")
            add_edit_bone(armature, f"{finger_name}2{side}", one, two, f"{finger_name}1{side}")
            add_edit_bone(armature, f"{finger_name}3{side}", two, three, f"{finger_name}2{side}")
        thumb_start = (wrist_tail[0] - 0.057 * sign, wrist_tail[1] + 0.05, wrist_tail[2] + 0.006)
        thumb_one = (thumb_start[0] - 0.044 * sign, wrist_tail[1] + 0.096, wrist_tail[2] - 0.008)
        thumb_two = (thumb_one[0] - 0.025 * sign, wrist_tail[1] + 0.151, wrist_tail[2] - 0.038)
        thumb_three = (thumb_two[0] + 0.016 * sign, wrist_tail[1] + 0.177, wrist_tail[2] - 0.073)
        add_edit_bone(armature, f"Thumb1{side}", thumb_start, thumb_one, f"Wrist{side}")
        add_edit_bone(armature, f"Thumb2{side}", thumb_one, thumb_two, f"Thumb1{side}")
        add_edit_bone(armature, f"Thumb3{side}", thumb_two, thumb_three, f"Thumb2{side}")
    bpy.ops.object.mode_set(mode="OBJECT")
    if len(armature.data.bones) != EXPECTED_BONE_COUNT:
        raise RuntimeError(
            f"{armature.name}: expected {EXPECTED_BONE_COUNT} bones, found {len(armature.data.bones)}"
        )

    segments = 18 if detail > 0.8 else 10
    for side, sign in (("R", 1), ("L", -1)):
        upper_head, upper_tail, lower_tail, wrist_tail = chains[side]
        upper_axis = (Vector(upper_tail) - Vector(upper_head)).normalized()
        # Start immediately behind the authored shoulder with a full cloth
        # profile. A long near-zero taper projected into the camera as a spear
        # in ADS/melee; the short full-radius entry instead leaves the frame as
        # a conventional sleeve without exposing a detached rounded cap.
        upper_start = Vector(upper_head) - upper_axis * 0.075
        palm_end = Vector(wrist_tail) + Vector((0, 0.17, -0.002))
        sleeve = profiled_weighted_path(
            f"{side}-authored-continuous-shoulder-wrist-sleeve-{label}",
            (
                (upper_start, 0.079, 0.06, 0.0, 0.001, {f"UpperArm{side}": 1.0}),
                (Vector(upper_head).lerp(Vector(upper_tail), 0.04), 0.083, 0.063, 0.0, 0.002, {f"UpperArm{side}": 1.0}),
                (Vector(upper_head).lerp(Vector(upper_tail), 0.16), 0.072, 0.055, 0.0, 0.002, {f"UpperArm{side}": 1.0}),
                (Vector(upper_head).lerp(Vector(upper_tail), 0.48), 0.078, 0.059, 0.003 * sign, 0.005, {f"UpperArm{side}": 1.0}),
                (Vector(upper_head).lerp(Vector(upper_tail), 0.82), 0.064, 0.052, 0.0, 0.003, {f"UpperArm{side}": 0.78, f"LowerArm{side}": 0.22}),
                (Vector(upper_tail), 0.057, 0.048, 0.0, 0.002, {f"UpperArm{side}": 0.5, f"LowerArm{side}": 0.5}),
                (Vector(upper_tail).lerp(Vector(lower_tail), 0.16), 0.062, 0.049, -0.002 * sign, 0.004, {f"UpperArm{side}": 0.22, f"LowerArm{side}": 0.78}),
                (Vector(upper_tail).lerp(Vector(lower_tail), 0.42), 0.071, 0.054, -0.005 * sign, 0.006, {f"LowerArm{side}": 1.0}),
                (Vector(upper_tail).lerp(Vector(lower_tail), 0.7), 0.063, 0.048, -0.003 * sign, 0.004, {f"LowerArm{side}": 1.0}),
                (Vector(upper_tail).lerp(Vector(lower_tail), 0.9), 0.053, 0.041, 0.0, 0.001, {f"LowerArm{side}": 0.78, f"Wrist{side}": 0.22}),
                (Vector(lower_tail), 0.048, 0.037, 0.0, 0.0, {f"LowerArm{side}": 0.5, f"Wrist{side}": 0.5}),
                (Vector(lower_tail).lerp(Vector(wrist_tail), 0.18), 0.046, 0.036, 0.0, 0.0, {f"LowerArm{side}": 0.22, f"Wrist{side}": 0.78}),
            ),
            materials["sleeve"], segments, armature,
        )
        glove = profiled_weighted_path(
            f"{side}-authored-continuous-cuff-palm-glove-{label}",
            (
                (Vector(upper_tail).lerp(Vector(lower_tail), 0.88), 0.054, 0.042, 0.0, 0.0, {f"LowerArm{side}": 0.82, f"Wrist{side}": 0.18}),
                (Vector(lower_tail), 0.056, 0.043, 0.0, 0.0, {f"LowerArm{side}": 0.5, f"Wrist{side}": 0.5}),
                (Vector(lower_tail).lerp(Vector(wrist_tail), 0.28), 0.058, 0.044, 0.0, 0.001, {f"LowerArm{side}": 0.2, f"Wrist{side}": 0.8}),
                (Vector(lower_tail).lerp(Vector(wrist_tail), 0.68), 0.052, 0.039, 0.0, 0.001, {f"Wrist{side}": 1.0}),
                (Vector(wrist_tail), 0.047, 0.033, 0.0, 0.001, {f"Wrist{side}": 1.0}),
                (Vector(wrist_tail).lerp(palm_end, 0.24), 0.058, 0.036, 0.001 * sign, 0.003, {f"Wrist{side}": 1.0}),
                (Vector(wrist_tail).lerp(palm_end, 0.52), 0.071, 0.039, 0.003 * sign, 0.006, {f"Wrist{side}": 1.0}),
                (Vector(wrist_tail).lerp(palm_end, 0.78), 0.082, 0.04, 0.004 * sign, 0.006, {f"Wrist{side}": 1.0}),
                (palm_end, 0.075, 0.032, 0.0, 0.002, {f"Wrist{side}": 1.0}),
            ),
            materials["glove"], segments, armature,
        )
        cuff_mid = Vector(lower_tail).lerp(Vector(wrist_tail), 0.35)

        # Three meaningful tactical overlays retain the established 45-part
        # authoring budget after five capsule pieces become two continuous
        # anatomy shells. They create value breaks without reintroducing seams.
        shoulder_band_start = Vector(upper_head).lerp(Vector(upper_tail), 0.2)
        shoulder_band_end = Vector(upper_head).lerp(Vector(upper_tail), 0.34)
        shoulder_band = profiled_segment(
            f"{side}-authored-shoulder-armor-band-{label}", shoulder_band_start, shoulder_band_end,
            ((0.0, 0.076, 0.059, 0.0, 0.0), (0.5, 0.081, 0.062, 0.0, 0.0),
             (1.0, 0.078, 0.06, 0.0, 0.0)), materials["pad"], max(10, segments // 2),
        )
        forearm_band_start = Vector(upper_tail).lerp(Vector(lower_tail), 0.34)
        forearm_band_end = Vector(upper_tail).lerp(Vector(lower_tail), 0.5)
        forearm_band = profiled_segment(
            f"{side}-authored-forearm-armor-band-{label}", forearm_band_start, forearm_band_end,
            ((0.0, 0.071, 0.055, 0.0, 0.0), (0.5, 0.075, 0.058, 0.0, 0.0),
             (1.0, 0.071, 0.055, 0.0, 0.0)), materials["pad"], max(10, segments // 2),
        )
        palm_reinforcement = rounded_cube(
            f"{side}-authored-palm-reinforcement-{label}",
            Vector(wrist_tail).lerp(palm_end, 0.64) + Vector((0, 0, 0.041)),
            (0.112, 0.072, 0.012), materials["pad"], 0.004,
        )
        knuckle_pads = [
            rounded_cube(
                f"{side}-authored-knuckle-pad-{index + 1}-{label}",
                palm_end + Vector((offset * sign, -0.044 + abs(offset) * 0.08, 0.043)),
                (0.02 if index in {0, 3} else 0.024, 0.035, 0.008), materials["pad"], 0.003,
            )
            for index, offset in enumerate((-0.054, -0.018, 0.018, 0.054))
        ]
        knuckle = join_meshes(
            f"{side}-authored-articulated-knuckle-pads-{label}", knuckle_pads,
        )
        guard_start = Vector(lower_tail).lerp(Vector(wrist_tail), 0.2)
        guard_end = Vector(lower_tail).lerp(Vector(wrist_tail), 0.55)
        wrist_guard = profiled_segment(
            f"{side}-authored-low-profile-cuff-strap-{label}", guard_start, guard_end,
            ((0.0, 0.058, 0.048, 0.0, 0.0), (0.5, 0.061, 0.05, 0.0, 0.0),
             (1.0, 0.058, 0.047, 0.0, 0.0)), materials["pad"], max(10, segments // 2),
        )
        skin_to_bone(shoulder_band, armature, f"UpperArm{side}")
        skin_to_bone(forearm_band, armature, f"LowerArm{side}")
        skin_to_bone(palm_reinforcement, armature, f"Wrist{side}")
        skin_to_bone(knuckle, armature, f"Wrist{side}")
        skin_blended_chain(wrist_guard, armature, f"Wrist{side}", guard_start, guard_end, parent_bone=f"LowerArm{side}")
        if side == "L":
            display = rounded_cube(
                "left-wrist-authored-display", cuff_mid + Vector((0, -0.004, 0.056)),
                (0.064, 0.052, 0.009), materials["display"], 0.004, rotation=(math.radians(-4), 0, 0),
            )
            skin_to_bone(display, armature, "WristL")

        finger_base_radii = {"Index": 0.0192, "Middle": 0.0202, "Ring": 0.0188, "Pinky": 0.0168}
        for finger_name in FINGER_NAMES:
            for joint in (1, 2, 3):
                bone = armature.data.bones[f"{finger_name}{joint}{side}"]
                radius = finger_base_radii[finger_name] * (1.0 if joint == 1 else 0.86 if joint == 2 else 0.7)
                mesh = profiled_segment(
                    f"{side}-{finger_name.lower()}-{joint}-{label}", bone.head_local, bone.tail_local,
                    ((0.0, radius * 0.8, radius * 0.68, 0.0, 0.0),
                     (0.18, radius, radius * 0.82, 0.0, 0.0),
                     (0.7, radius * 0.91, radius * 0.76, 0.0, 0.0),
                     (1.0, radius * 0.66, radius * 0.58, 0.0, 0.0)),
                    materials["glove"], max(8, segments // 2),
                )
                parent_bone = f"{finger_name}{joint - 1}{side}" if joint > 1 else f"Wrist{side}"
                child_bone = f"{finger_name}{joint + 1}{side}" if joint < 3 else None
                skin_blended_chain(
                    mesh, armature, bone.name, bone.head_local, bone.tail_local,
                    parent_bone=parent_bone, child_bone=child_bone, blend=0.3,
                )
        for joint in (1, 2, 3):
            bone = armature.data.bones[f"Thumb{joint}{side}"]
            radius = 0.0225 if joint == 1 else 0.0195 if joint == 2 else 0.0165
            mesh = profiled_segment(
                f"{side}-thumb-{joint}-{label}", bone.head_local, bone.tail_local,
                ((0.0, radius * 0.82, radius * 0.7, 0.0, 0.0),
                 (0.2, radius, radius * 0.84, 0.0, 0.0),
                 (0.72, radius * 0.9, radius * 0.76, 0.0, 0.0),
                 (1.0, radius * 0.64, radius * 0.56, 0.0, 0.0)),
                materials["glove"], max(8, segments // 2),
            )
            parent_bone = f"Thumb{joint - 1}{side}" if joint > 1 else f"Wrist{side}"
            child_bone = f"Thumb{joint + 1}{side}" if joint < 3 else None
            skin_blended_chain(
                mesh, armature, bone.name, bone.head_local, bone.tail_local,
                parent_bone=parent_bone, child_bone=child_bone, blend=0.3,
            )

    batch_skinned_renderables(root, armature)

    for name, location, bone_name, semantic in (
        ("right-hand-grip-socket", (0.06, 1.02, -0.115), "WristR", "rightGrip"),
        ("left-hand-grip-socket", (-0.08, 1.27, -0.05), "WristL", "leftGrip"),
        ("right-wrist-knife-socket", (0.105, 0.905, -0.074), "WristR", "knife"),
        ("left-hand-grenade-socket", (-0.08, 1.24, -0.05), "WristL", "grenade"),
    ):
        bone_socket(name, location, armature, bone_name, semantic)
    action_corpus(armature)
    return root, armature


def hierarchy(root):
    root_key = root.get("asset_root_key", root.name)
    owned = [obj for obj in bpy.data.objects if obj.get("pass65_asset_root") == root_key]
    return [root, *root.children_recursive, *owned]


def export_root(root, output_name):
    selected = hierarchy(root)
    selected_set = set(selected)
    for obj in bpy.data.objects:
        canonical = obj.get("canonical_node_name")
        if canonical and obj not in selected_set:
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
        filepath=str(RAW_DIR / f"{output_name}.glb"), export_format="GLB",
        use_selection=True, export_yup=True, export_apply=False,
        export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_extras=True, export_animations=True, export_animation_mode="NLA_TRACKS",
        export_force_sampling=False, export_optimize_animation_size=True,
        export_tangents=True,
    )
    for obj in selected:
        canonical = obj.get("canonical_node_name")
        if canonical:
            obj.name = f"{canonical}__SOURCE_{output_name}"


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def point_to_mesh_bounds_distance(point, mesh):
    local = mesh.matrix_world.inverted() @ point
    success, closest, _normal, _face = mesh.closest_point_on_mesh(local)
    if not success:
        return math.inf
    return (mesh.matrix_world @ closest - point).length


def prepare_review_weapon(weapon_id, hero_root, armature):
    path = FIREARM_RAW_DIR / f"{weapon_id}-fp-lod0.glb"
    if not path.exists():
        raise RuntimeError(
            f"{path} is required for the true weapon-contact review; author weapon families before operator arms"
        )
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported = [obj for obj in bpy.data.objects if obj not in before]
    # The source GLB carries the full runtime action corpus. Review frames own
    # their deterministic action staging explicitly; mute imported NLA so an
    # evaluation update cannot snap the detached reload magazine back into the
    # magwell between contact placement and render.
    for obj in imported:
        if obj.animation_data is None:
            continue
        obj.animation_data.action = None
        for track in obj.animation_data.nla_tracks:
            track.mute = True
    group = bpy.data.objects.new(f"Pass65_{weapon_id}_ActualGripReview", None)
    bpy.context.collection.objects.link(group)
    imported_set = set(imported)
    for obj in imported:
        if obj.parent not in imported_set:
            world = obj.matrix_world.copy()
            obj.parent = group
            obj.matrix_world = world

    def imported_node(name):
        return next(
            (obj for obj in imported if obj.get("canonical_node_name") == name or obj.name == name or obj.name.startswith(f"{name}.")),
            None,
        )

    source_right = imported_node("grip-socket-r")
    source_left = imported_node("support-socket-l")
    target_right = next(obj for obj in armature.children if obj.name.startswith("right-hand-grip-socket"))
    target_left = next(obj for obj in armature.children if obj.name.startswith("left-hand-grip-socket"))
    if not source_right or not source_left:
        raise RuntimeError(f"{weapon_id}: actual review weapon lacks authored grip sockets")
    bpy.context.view_layer.update()
    source_right_position = source_right.matrix_world.translation.copy()
    source_left_position = source_left.matrix_world.translation.copy()
    target_right_position = target_right.matrix_world.translation.copy()
    target_left_position = target_left.matrix_world.translation.copy()
    source_vector = source_left_position - source_right_position
    target_vector = target_left_position - target_right_position
    if source_vector.length < 0.001 or target_vector.length < 0.001:
        raise RuntimeError(f"{weapon_id}: degenerate grip-review socket span")
    scale = target_vector.length / source_vector.length
    rotation = source_vector.normalized().rotation_difference(target_vector.normalized())
    transform = (
        Matrix.Translation(target_right_position)
        @ rotation.to_matrix().to_4x4()
        @ Matrix.Scale(scale, 4)
        @ Matrix.Translation(-source_right_position)
    )
    group.matrix_world = transform
    bpy.context.view_layer.update()
    right_error = (source_right.matrix_world.translation - target_right_position).length
    left_error = (source_left.matrix_world.translation - target_left_position).length
    if right_error > 0.0005 or left_error > 0.0005:
        raise RuntimeError(f"{weapon_id}: socket contact fit failed right={right_error:.6f} left={left_error:.6f}")

    # Runtime M4 detail is correctly consolidated by material. Contact audits
    # therefore query exact mesh surfaces, not fragile pre-batch part names or
    # broad bounding boxes (which would report false contact through empty air).
    right_grip_meshes = [
        obj for obj in imported if obj.type == "MESH"
        and any("Polymer" in material.name for material in obj.data.materials if material)
    ]
    left_grip_meshes = [obj for obj in imported if obj.type == "MESH"]
    if not right_grip_meshes or not left_grip_meshes:
        raise RuntimeError(f"{weapon_id}: review contact meshes unavailable")

    def contact_distances(side, meshes):
        names = [f"{finger}2{side}" for finger in FINGER_NAMES] + [f"Thumb2{side}"]
        points = [armature.matrix_world @ armature.pose.bones[name].tail for name in names]
        return [min(point_to_mesh_bounds_distance(point, mesh) for mesh in meshes) for point in points]

    right_distances = contact_distances("R", right_grip_meshes)
    left_distances = contact_distances("L", left_grip_meshes)
    # The actual project weapon is socket-fitted and must penetrate the curled
    # digit envelope closely enough to read as a held object, not a nearby prop.
    right_contacts = sum(distance <= 0.065 for distance in right_distances)
    left_contacts = sum(distance <= 0.075 for distance in left_distances)
    if right_contacts < 3 or left_contacts < 3:
        raise RuntimeError(
            f"{weapon_id}: actual grip contact insufficient "
            f"right={right_contacts}/5 {right_distances} left={left_contacts}/5 {left_distances}"
        )
    hero_root[f"{weapon_id}_review_right_socket_error_m"] = round(right_error, 7)
    hero_root[f"{weapon_id}_review_left_socket_error_m"] = round(left_error, 7)
    hero_root[f"{weapon_id}_review_scale"] = round(scale, 6)
    hero_root[f"{weapon_id}_review_right_digit_contacts"] = right_contacts
    hero_root[f"{weapon_id}_review_left_digit_contacts"] = left_contacts
    group["actual_project_weapon_review"] = True
    group["socket_contact_verified"] = True
    group["right_socket_error_m"] = right_error
    group["left_socket_error_m"] = left_error
    group.hide_render = True
    group.hide_viewport = True
    for obj in imported:
        obj.hide_render = True
        obj.hide_viewport = True
    magazine = imported_node("weapon-magazine")
    magazine_meshes = [
        obj for obj in imported if obj.type == "MESH"
        and obj.get("runtime_transform_owner") == "magazine"
    ]
    if not magazine or not magazine_meshes:
        raise RuntimeError(f"{weapon_id}: reload review requires the authored magazine transform group")
    reload_magazine_meshes = []
    for mesh in magazine_meshes:
        duplicate = mesh.copy()
        duplicate.data = mesh.data.copy()
        duplicate.name = f"{mesh.name}_ReloadContactReview"
        duplicate.parent = None
        duplicate.matrix_world = mesh.matrix_world.copy()
        duplicate.hide_render = True
        duplicate.hide_viewport = True
        bpy.context.collection.objects.link(duplicate)
        reload_magazine_meshes.append(duplicate)
    return {
        "group": group,
        "imported": imported,
        "magazine": magazine,
        "magazine_meshes": magazine_meshes,
        "magazine_matrix_basis": magazine.matrix_basis.copy(),
        "magazine_mesh_matrices": [mesh.matrix_world.copy() for mesh in magazine_meshes],
        "reload_magazine_meshes": reload_magazine_meshes,
    }


def render_reviews(hero_root, armature, review_weapons):
    for root, _candidate_armature, _output_name in arm_roots:
        visible = root == hero_root
        for obj in hierarchy(root):
            obj.hide_render = not visible
            obj.hide_viewport = not visible
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, -0.28, -0.36))
    stage = bpy.context.object
    stage.name = "Operator_Arms_Review_Stage"
    stage.data.materials.append(materials["stage"])
    for name, location, energy, color, size in (
        ("Arms_Key", (-2.8, -2.3, 3.4), 1120, (0.55, 0.78, 1.0), 2.0),
        ("Arms_Rim", (2.7, 0.2, 2.6), 780, (0.16, 0.72, 0.92), 1.6),
        ("Arms_Fill", (0.0, 3.2, 1.2), 680, (0.38, 0.58, 0.72), 2.2),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shape = "DISK"
        light.data.size = size
        look_at(light, (0, -0.35, 0.0))
    bpy.ops.object.camera_add()
    camera = bpy.context.object
    camera.name = "Pass65_Arms_Review_Camera"
    bpy.context.scene.camera = camera
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = REVIEW_SIZE
    scene.render.resolution_y = REVIEW_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.world.color = (0.004, 0.007, 0.011)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.frame_set(1)
    views = (
        ("neutral-front", (0, -1.82, 0.62), (0, 0.5, -0.025), 68, None, 1, None),
        ("forearm-wrist-quarter", (1.52, -0.48, 0.7), (0.08, 0.63, -0.025), 72, None, 1, None),
        ("hand-anatomy-closeup", (0.72, 0.48, 0.28), (0.0, 1.08, -0.075), 76, None, 1, None),
        ("m4a1-neutral-contact", (1.36, 0.58, 0.38), (0.0, 1.11, -0.09), 68, None, 1, "m4a1"),
        ("m4a1-ads-contact", (0.78, 0.74, 0.43), (0.0, 1.18, -0.055), 76, None, 1, "m4a1"),
        ("m4a1-reload-contact", (-1.38, 0.62, 0.38), (-0.36, 1.12, -0.2), 58, "reload", 15, "m4a1"),
    )
    rendered = []
    for label, location, target, lens, action_name, action_frame, weapon_id in views:
        for candidate_id, review in review_weapons.items():
            weapon_group = review["group"]
            imported = review["imported"]
            visible = candidate_id == weapon_id
            weapon_group.hide_render = not visible
            weapon_group.hide_viewport = not visible
            review["magazine"].matrix_basis = review["magazine_matrix_basis"].copy()
            for mesh, matrix in zip(review["magazine_meshes"], review["magazine_mesh_matrices"]):
                mesh.matrix_world = matrix.copy()
            for mesh, matrix in zip(review["reload_magazine_meshes"], review["magazine_mesh_matrices"]):
                mesh.matrix_world = matrix.copy()
                mesh.hide_render = True
                mesh.hide_viewport = True
            for obj in imported:
                obj.hide_render = not visible
                obj.hide_viewport = not visible
        if action_name:
            track = next(track for track in armature.animation_data.nla_tracks if track.name == action_name)
            for candidate in armature.animation_data.nla_tracks:
                candidate.mute = candidate != track
            scene.frame_set(action_frame)
        else:
            for candidate in armature.animation_data.nla_tracks:
                candidate.mute = True
            reset_pose(armature)
            scene.frame_set(1)
        if label == "m4a1-reload-contact":
            review = review_weapons["m4a1"]
            bpy.context.view_layer.update()
            digit_points = [
                armature.matrix_world @ armature.pose.bones[f"{finger}2L"].tail
                for finger in FINGER_NAMES
            ]
            hand_target = sum(digit_points, Vector()) / len(digit_points)
            # Keep the cassette nested in the curled digit envelope while
            # biasing it a few centimetres toward the review camera so its
            # authored metal silhouette remains visibly readable rather than
            # being fully occluded by the opaque palm.
            visible_hand_target = hand_target + Vector((0.04, 0, -0.12))
            magazine_points = [
                mesh.matrix_world @ Vector(corner)
                for mesh in review["magazine_meshes"]
                for corner in mesh.bound_box
            ]
            magazine_center = sum(magazine_points, Vector()) / len(magazine_points)
            magazine_delta = visible_hand_target - magazine_center
            for mesh in review["magazine_meshes"]:
                mesh.hide_render = True
                mesh.hide_viewport = True
            for mesh in review["reload_magazine_meshes"]:
                magazine_matrix = mesh.matrix_world.copy()
                magazine_matrix.translation += magazine_delta
                mesh.matrix_world = magazine_matrix
                mesh.hide_render = False
                mesh.hide_viewport = False
            bpy.context.view_layer.update()
            moved_points = [
                mesh.matrix_world @ Vector(corner)
                for mesh in review["reload_magazine_meshes"]
                for corner in mesh.bound_box
            ]
            moved_center = sum(moved_points, Vector()) / len(moved_points)
            print(
                "PASS65_ARMS_RELOAD_CONTACT "
                f"hand={tuple(round(value, 4) for value in visible_hand_target)} "
                f"before={tuple(round(value, 4) for value in magazine_center)} "
                f"after={tuple(round(value, 4) for value in moved_center)}"
            )
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        path = REVIEW_DIR / f"pass65-first-person-arms-{label}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        rendered.append(path)
    for candidate in armature.animation_data.nla_tracks:
        candidate.mute = False
    reset_pose(armature)
    scene.frame_set(1)
    images = [bpy.data.images.load(str(path), check_existing=False) for path in rendered]
    sheet_columns = 3
    sheet_rows = 2
    sheet = bpy.data.images.new(
        "Pass65_FirstPersonArms_ContactSheet", REVIEW_SIZE * sheet_columns, REVIEW_SIZE * sheet_rows, alpha=True,
    )
    pixels = [0.0] * (REVIEW_SIZE * sheet_columns * REVIEW_SIZE * sheet_rows * 4)
    for index, image in enumerate(images):
        source = list(image.pixels[:])
        tile_x = (index % sheet_columns) * REVIEW_SIZE
        tile_y = (sheet_rows - 1 - index // sheet_columns) * REVIEW_SIZE
        for row in range(REVIEW_SIZE):
            source_start = row * REVIEW_SIZE * 4
            target_start = ((tile_y + row) * REVIEW_SIZE * sheet_columns + tile_x) * 4
            pixels[target_start:target_start + REVIEW_SIZE * 4] = source[source_start:source_start + REVIEW_SIZE * 4]
    sheet.pixels = pixels
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(REVIEW_DIR / "pass65-first-person-arms-contact-sheet.png")
    sheet.save()


reset()
images = {kind: make_texture(f"Pass65_FirstPersonArms_{kind}", kind) for kind in ("baseColor", "normal", "roughness", "metallic")}
materials = {
    "sleeve": textured_material("MAT_Pass65_Arms_Sleeve_PBR", images, (0.42, 0.62, 0.66, 1), 0.0),
    "glove": textured_material("MAT_Pass65_Arms_Glove_PBR", images, (0.16, 0.19, 0.18, 1), 0.5),
    "pad": simple_material("MAT_Pass65_Arms_ArmorPad", (0.055, 0.067, 0.066, 1), 0.12, 0.72),
    "display": simple_material("MAT_Pass65_Arms_WristDisplay", (0.008, 0.12, 0.13, 1), 0.22, 0.24, (0.0, 0.68, 0.62, 1), 1.8),
    "stage": simple_material("MAT_Pass65_Arms_ReviewStage", (0.012, 0.017, 0.023, 1), 0.1, 0.6),
}
arm_roots = []
for label, detail, output_name in (("LOD0", 1.0, "pass65-first-person-arms-lod0"), ("LOD1", 0.55, "pass65-first-person-arms-lod1")):
    root, armature = build_armature(label, detail)
    arm_roots.append((root, armature, output_name))
hero_root, hero_armature, _hero_output = arm_roots[0]
review_weapons = {
    weapon_id: prepare_review_weapon(weapon_id, hero_root, hero_armature)
    for weapon_id in ("m4a1",)
}
for root, _armature, _output_name in arm_roots[1:]:
    for weapon_id in review_weapons:
        for receipt in (
            "right_socket_error_m", "left_socket_error_m", "scale",
            "right_digit_contacts", "left_digit_contacts",
        ):
            key = f"{weapon_id}_review_{receipt}"
            root[key] = hero_root[key]
for root, armature, output_name in arm_roots:
    export_root(root, output_name)
render_reviews(hero_root, hero_armature, review_weapons)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE_BLEND))
for root, armature, _output_name in arm_roots:
    meshes = [obj for obj in hierarchy(root) if obj.type == "MESH"]
    triangles = sum(len(poly.vertices) - 2 for obj in meshes for poly in obj.data.polygons)
    print(f"PASS65_OPERATOR_ARMS_{root.get('quality_tier')}_READY meshes={len(meshes)} bones={len(armature.data.bones)} triangles={triangles}")
print(f"BLEND={SOURCE_BLEND}")
print(f"RAW_DIR={RAW_DIR}")
print(f"REVIEW={REVIEW_DIR / 'pass65-first-person-arms-contact-sheet.png'}")
