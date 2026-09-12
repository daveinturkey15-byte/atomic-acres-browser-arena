"""Reopen the saved hero .blend in a fresh Blender and report what it still contains.

Runs inside Blender. No render is performed; this only proves the saved source is a real,
reopenable, exportable Blender file with its meshes, materials and images intact.
"""

import json
import sys
from pathlib import Path

import bpy

REPO = Path(__file__).resolve().parents[3]
_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
BLEND = REPO / "scripts" / "blender" / "world-studio" / "source" / (
    _args[0] if _args else "hero-bus.blend"
)

bpy.ops.wm.open_mainfile(filepath=str(BLEND))

objects = []
for obj in bpy.data.objects:
    if obj.type != "MESH":
        continue
    mesh = obj.data
    mesh.calc_loop_triangles()
    bb = [obj.matrix_world @ v.co for v in mesh.vertices]
    objects.append({
        "name": obj.name,
        "type": obj.type,
        "triangles": len(mesh.loop_triangles),
        "vertices": len(mesh.vertices),
        "materialSlots": [m.name if m else None for m in mesh.materials],
        "uvLayers": [layer.name for layer in mesh.uv_layers],
        "minZ": round(min(v.z for v in bb), 4),
        "maxZ": round(max(v.z for v in bb), 4),
    })

report = {
    "blender": bpy.app.version_string,
    "reopened": str(BLEND.relative_to(REPO)).replace("\\", "/"),
    "meshObjects": objects,
    "materials": [m.name for m in bpy.data.materials],
    "images": [{"name": i.name, "size": list(i.size), "colorspace": i.colorspace_settings.name}
               for i in bpy.data.images if i.name != "Render Result"],
    "exportable": all(o["triangles"] > 0 and o["uvLayers"] for o in objects) and len(objects) > 0,
    "unitSystem": bpy.context.scene.unit_settings.system,
    "scaleLength": bpy.context.scene.unit_settings.scale_length,
}
print("VERIFY_REPORT " + json.dumps(report))
