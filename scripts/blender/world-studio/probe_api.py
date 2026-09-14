"""Report the installed Blender API surface this lane depends on. Runs inside Blender."""

import bpy

print("PROBE_VERSION", bpy.app.version_string, bpy.app.build_hash)
for name in (
    "shade_smooth_by_angle",
    "shade_auto_smooth",
    "shade_smooth",
    "modifier_add",
):
    print("PROBE_OP object." + name, hasattr(bpy.ops.object, name))

print("PROBE_OP uv.smart_project", hasattr(bpy.ops.uv, "smart_project"))
try:
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    names = sorted(p.identifier for p in props)
    print("PROBE_GLTF_PROPS", ",".join(names))
except Exception as exc:  # pragma: no cover
    print("PROBE_GLTF_PROPS_ERROR", exc)

try:
    props = bpy.ops.object.shade_smooth_by_angle.get_rna_type().properties
    print("PROBE_SSBA_PROPS", ",".join(sorted(p.identifier for p in props)))
except Exception as exc:  # pragma: no cover
    print("PROBE_SSBA_ERROR", exc)

print("PROBE_NODE_BSDF", "ShaderNodeBsdfPrincipled" in dir(bpy.types))
bsdf_inputs = []
mat = bpy.data.materials.new("probe")
mat.use_nodes = True
node = mat.node_tree.nodes.get("Principled BSDF")
if node:
    bsdf_inputs = [i.name for i in node.inputs]
print("PROBE_BSDF_INPUTS", ",".join(bsdf_inputs))
print("PROBE_DONE")
