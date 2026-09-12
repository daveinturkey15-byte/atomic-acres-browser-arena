"""Render the acceptance thumbnails for one exported house shell, on the CPU.

Deliberately small and few: the point is a real rendered picture of the actual exported GLB,
not a beauty pass. ``ai-3d-asset-generation-loop`` is explicit that a round without a rendered
capture is not a round, and that the capture must show the asset the pipeline produced — so
this script **re-imports the GLB** rather than rendering the in-memory build.

Cameras follow the existing world-studio review points (``house.ts:996-1004``) reduced to the
two that decide the street frame and the backyard frame in the supplied concepts.

CPU only: Cycles with ``device='CPU'`` and a hard thread cap. No GPU compute is requested.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import house_contract as C  # noqa: E402

REPO_ROOT = HERE.parents[3]
ASSET_DIR = REPO_ROOT / "public" / "assets" / "world-studio" / "blender" / "houses"
SOURCE_DIR = REPO_ROOT / "source-assets" / "world-studio" / "houses"

RESOLUTION = (512, 320)
SAMPLES = 24
MAX_THREADS = 4

# (id, camera position, target) in the contract's local Y-up frame.
VIEWS = [
    # Pulled back far enough to frame the whole street elevation plus the garage wing: a
    # thumbnail that crops the silhouette cannot be used to judge proportion.
    ("street", (26.0, 7.5, 20.0), (-1.0, 3.4, 4.0)),
    ("backyard", (-24.0, 8.0, -16.0), (-1.0, 3.6, 2.0)),
]

# ---------------------------------------------------------------- wave-2 review recipe
#
# ``--review`` reproduces the independent evaluator's frozen three-view recipe bit for bit, so a
# wave-3 capture can be diffed against ``real-house-wave2/house-<variant>-<view>.png`` instead
# of against a frame this lane chose for itself. Everything below is transcribed from
# ``real-house-wave2-report.json``: world, both suns, the ground plane, the lens, the seed and
# the azimuth/elevation/distance rule. Only two things deviate, both deliberately and both
# raising the bar rather than lowering it:
#
#   * 128 samples instead of 64 — the refinement prompt asks for exactly this, to settle whether
#     the eave/downpipe glints were a sampling artefact or a material defect.
#   * denoising stays OFF. A denoiser would erase fireflies, which is the defect under test.
#
# Camera placement: ``loc = target + d * (cos(el)sin(az), cos(el)cos(az), sin(el))`` in Blender
# world axes, which reproduces the report's recorded locations to the millimetre.
REVIEW_RESOLUTION = (960, 600)
REVIEW_SAMPLES = 128
REVIEW_LENS_MM = 50.0
REVIEW_SEED = 0
REVIEW_WORLD_BG = (0.70, 0.78, 0.88, 1.0)
REVIEW_GROUND = {"z": 0.0, "size": 220.0, "base_color": (0.32, 0.33, 0.32, 1.0), "roughness": 0.95}

# (id, azimuth_deg, elevation_deg, distance, target offset from the imported bounds centre)
REVIEW_VIEWS = [
    ("front", 180.0, 12.0, 43.036, (0.0, 0.0, 0.0)),
    ("close", 165.0, 7.0, 9.837, (2.0, -7.685, -2.72)),
    ("grazing-contact", 100.0, 2.5, 13.833, (0.0, 0.0, -4.32)),
]


def _to_blender(p):
    """Contract frame (X right, Y up, Z depth) -> Blender Z-up."""
    return Vector((p[0], -p[2], p[1]))


def setup_world() -> None:
    world = bpy.data.worlds.new("houses-sky")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.35, 0.52, 0.78, 1.0)
    bg.inputs["Strength"].default_value = 1.6

    sun_data = bpy.data.lights.new("sun", type="SUN")
    sun_data.energy = 4.0
    sun_data.angle = math.radians(0.53)  # the real solar disc, so contact shadows stay soft
    sun = bpy.data.objects.new("sun", sun_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(52.0), 0.0, math.radians(38.0))

    ground_mesh = bpy.data.meshes.new("ground")
    ground_mesh.from_pydata(
        [(-60, -60, 0), (60, -60, 0), (60, 60, 0), (-60, 60, 0)], [], [[0, 1, 2, 3]]
    )
    ground_mesh.update()
    ground = bpy.data.objects.new("ground", ground_mesh)
    mat = bpy.data.materials.new("ground")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.19, 0.26, 0.11, 1.0)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.92
    ground_mesh.materials.append(mat)
    bpy.context.scene.collection.objects.link(ground)


def setup_review_world() -> None:
    """The evaluator's uniform test world, transcribed from ``real-house-wave2-report.json``."""
    world = bpy.data.worlds.new("w2-review")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = REVIEW_WORLD_BG
    bg.inputs["Strength"].default_value = 1.0

    for name, energy, rot, shadow, colour in (
        ("W2_KEY_SUN", 3.0, (38.0, 5.0, 35.0), True, (1.0, 1.0, 1.0)),
        ("W2_FILL_SUN", 0.7, (65.0, 0.0, -125.0), False, (0.85, 0.90, 1.0)),
    ):
        data = bpy.data.lights.new(name, type="SUN")
        data.energy = energy
        data.color = colour
        data.use_shadow = shadow
        obj = bpy.data.objects.new(name, data)
        obj.rotation_euler = tuple(math.radians(a) for a in rot)
        bpy.context.scene.collection.objects.link(obj)

    half = REVIEW_GROUND["size"] / 2.0
    z = REVIEW_GROUND["z"]
    mesh = bpy.data.meshes.new("W2_GROUND")
    mesh.from_pydata([(-half, -half, z), (half, -half, z), (half, half, z), (-half, half, z)], [], [[0, 1, 2, 3]])
    mesh.update()
    mat = bpy.data.materials.new("W2_GroundMat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = REVIEW_GROUND["base_color"]
    bsdf.inputs["Roughness"].default_value = REVIEW_GROUND["roughness"]
    bsdf.inputs["Metallic"].default_value = 0.0
    mesh.materials.append(mat)
    bpy.context.scene.collection.objects.link(bpy.data.objects.new("W2_GROUND", mesh))


def _imported_bounds_centre() -> Vector:
    """Centre of the imported mesh bounds, in Blender world axes — the evaluator's aim point.

    The ``W2_`` prefix filter is load-bearing: the 220 m review ground plane is a mesh too, and
    including it recentres the aim point on the world origin instead of on the house, which
    silently reframes every view and destroys the A/B against the wave-2 captures.
    """
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.name.startswith("W2_"):
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                lo[axis] = min(lo[axis], world[axis])
                hi[axis] = max(hi[axis], world[axis])
    return (lo + hi) / 2.0


def render_review(scene, cam, variant: str) -> int:
    """Re-shoot the wave-2 three-view recipe at 128 spp, undenoised, into source-assets."""
    scene.cycles.samples = REVIEW_SAMPLES
    scene.cycles.use_denoising = False
    scene.cycles.seed = REVIEW_SEED
    scene.render.resolution_x, scene.render.resolution_y = REVIEW_RESOLUTION
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = 0.0
    cam.data.lens = REVIEW_LENS_MM

    centre = _imported_bounds_centre()
    out_dir = SOURCE_DIR / variant / "review"
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"[review] bounds centre {tuple(round(v, 3) for v in centre)}", flush=True)
    for view_id, azimuth, elevation, distance, offset in REVIEW_VIEWS:
        target = centre + Vector(offset)
        az, el = math.radians(azimuth), math.radians(elevation)
        cam.location = target + Vector((
            distance * math.cos(el) * math.sin(az),
            distance * math.cos(el) * math.cos(az),
            distance * math.sin(el),
        ))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        out = out_dir / f"house-{variant}-{view_id}.png"
        scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        print(
            f"[review] {out.name} ({out.stat().st_size} bytes) "
            f"cam={tuple(round(v, 3) for v in cam.location)} target={tuple(round(v, 3) for v in target)} "
            f"az={azimuth} el={elevation} d={distance} spp={REVIEW_SAMPLES}",
            flush=True,
        )
    return 0


def main(argv) -> int:
    start = argv.index("--") + 1 if "--" in argv else len(argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", required=True, choices=sorted(C.VARIANTS))
    parser.add_argument(
        "--review", action="store_true",
        help="render the evaluator's wave-2 three-view recipe instead of the gallery thumbnails",
    )
    args = parser.parse_args(argv[start:])

    glb = ASSET_DIR / f"house-{args.variant}-shell.glb"
    if not glb.exists():
        print(f"[thumbs] missing export {glb}; build first", flush=True)
        return 2

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.threads_mode = "FIXED"
    scene.render.threads = MAX_THREADS
    scene.render.resolution_x, scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "AgX" if "AgX" in [v.name for v in scene.view_settings.bl_rna.properties["view_transform"].enum_items] else "Standard"

    if args.review:
        setup_review_world()
    else:
        setup_world()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    print(f"[thumbs] imported {glb.name}: {len(bpy.data.objects)} objects", flush=True)

    cam_data = bpy.data.cameras.new("review")
    cam_data.lens = 32.0
    cam = bpy.data.objects.new("review", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    if args.review:
        return render_review(scene, cam, args.variant)

    mirror = -1.0 if C.VARIANTS[args.variant].mirror_x else 1.0
    for view_id, position, target in VIEWS:
        pos = (position[0] * mirror, position[1], position[2])
        tgt = (target[0] * mirror, target[1], target[2])
        cam.location = _to_blender(pos)
        direction = _to_blender(tgt) - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        out = ASSET_DIR / f"house-{args.variant}-{view_id}.png"
        scene.render.filepath = str(out)
        bpy.ops.render.render(write_still=True)
        print(f"[thumbs] wrote {out.name} ({out.stat().st_size} bytes)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
