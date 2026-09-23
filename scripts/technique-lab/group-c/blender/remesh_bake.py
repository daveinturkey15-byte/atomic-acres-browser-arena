"""Group-C row 36 — deterministic headless Blender voxel remesh + normal bake.

WHAT THIS IS, AND WHAT IT IS NOT.

Register row 36 is Needle Mesh Baker: a PROPRIETARY, hosted, browser (WebGPU)
tool. Nothing in this file is its implementation, and this recipe is NOT
evidence that the upstream product uses Blender — it demonstrably does not; it
is a client-side web app. What this file exercises is the register row's own
operative decision, quoted from it verbatim: "local Blender remesh+bake remains
the free lane". That free lane is recorded in the register and in the carrier
skill `ai-3d-asset-generation-loop` and, until now, had never actually been run
in this lane. This is our independent execution of it.

The recipe, all CPU, no render, no GPU bake:

  1. Author a deterministic sculpt-dense highpoly in Blender (icosphere,
     displaced by a fixed multi-octave analytic field — no randomness, no
     external asset, no import).
  2. Reduce it with Blender's own OpenVDB voxel remesher
     (`bpy.ops.object.voxel_remesh`), whose voxel size IS the silhouette
     control the register describes.
  3. BAKE the highpoly's smooth normals onto the reduced mesh: for every
     lowpoly vertex, find the nearest point on the highpoly surface with a
     BVH tree and barycentrically interpolate that triangle's three vertex
     normals. This is a nearest-surface-interpolated normal transfer — the
     same class of operation as Blender's Data Transfer modifier, written out
     so the numbers are inspectable.
  4. Measure what the bake actually bought: the angle between each lowpoly
     vertex's OWN geometric normal and its baked normal. That angle is the
     detail the geometry lost and the bake carried across; if it were zero the
     bake would be doing nothing.
  5. Emit a portable, quantised, typed-data TS module (no external asset
     dependency at runtime, no loader, no fetch) plus a provenance JSON.

Run through `run_blender.py`, never directly — that wrapper owns the exclusive
execution lock and the no-window subprocess.

    blender --background --factory-startup --python remesh_bake.py -- \
        --mode build --out <repo>/... --blend <repo>/...
"""

import base64
import hashlib
import json
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import barycentric_transform

# --- Authoring constants. Every one of these is part of the artefact's identity
# and is stamped into the provenance record. ---------------------------------
HIGHPOLY_SUBDIVISIONS = 5          # Blender icosphere: 20 * 4^(n-1) faces.
HIGHPOLY_RADIUS = 1.0
VOXEL_SIZE = 0.22                  # THE silhouette control.
VOXEL_ADAPTIVITY = 0.0             # Uniform: no adaptive decimation on top.


def argv_after_double_dash():
    if '--' not in sys.argv:
        return []
    return sys.argv[sys.argv.index('--') + 1:]


def parse_args():
    args = argv_after_double_dash()
    parsed = {}
    key = None
    for item in args:
        if item.startswith('--'):
            key = item[2:]
            parsed[key] = True
        elif key is not None:
            parsed[key] = item
            key = None
    return parsed


def displacement(x, y, z):
    """Fixed analytic relief. Deterministic, no RNG, no noise texture.

    Three octaves on purpose: the coarse lobes survive a 0.155 m voxel, the
    finest ridges do not. A remesh that loses nothing proves nothing.
    """
    coarse = 0.130 * math.sin(2.1 * x + 0.7) * math.sin(1.9 * y - 0.4) * math.sin(2.3 * z + 1.1)
    mid = 0.052 * math.sin(5.3 * y + 2.0) * math.cos(4.7 * z - 1.3)
    fine = 0.021 * math.sin(11.7 * x - 0.9) * math.sin(12.3 * y + 0.5) * math.cos(11.1 * z)
    return 1.0 + coarse + mid + fine


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def triangulate(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()


def build_highpoly():
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=HIGHPOLY_SUBDIVISIONS,
        radius=HIGHPOLY_RADIUS,
        location=(0.0, 0.0, 0.0),
    )
    obj = bpy.context.active_object
    obj.name = 'highpoly'
    mesh = obj.data
    for vertex in mesh.vertices:
        co = vertex.co
        scale = displacement(co.x, co.y, co.z)
        vertex.co = Vector((co.x * scale, co.y * scale, co.z * scale))
    triangulate(mesh)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def build_lowpoly(highpoly):
    bpy.ops.object.select_all(action='DESELECT')
    highpoly.select_set(True)
    bpy.context.view_layer.objects.active = highpoly
    bpy.ops.object.duplicate()
    obj = bpy.context.active_object
    obj.name = 'lowpoly_voxel_remesh'
    obj.location = (0.0, 0.0, 0.0)
    obj.data.remesh_voxel_size = VOXEL_SIZE
    obj.data.remesh_voxel_adaptivity = VOXEL_ADAPTIVITY
    bpy.ops.object.voxel_remesh()
    triangulate(obj.data)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def mesh_arrays(obj):
    mesh = obj.data
    positions = [tuple(v.co) for v in mesh.vertices]
    normals = [tuple(v.vector) for v in mesh.vertex_normals]
    triangles = []
    for polygon in mesh.polygons:
        loop = list(polygon.vertices)
        if len(loop) != 3:
            raise RuntimeError('expected a triangulated mesh, got a %d-gon' % len(loop))
        triangles.append(tuple(loop))
    return positions, normals, triangles


def bake_normals(high_positions, high_normals, high_triangles, low_positions):
    """Nearest-surface interpolated normal transfer, highpoly -> lowpoly."""
    tree = BVHTree.FromPolygons(
        [Vector(p) for p in high_positions],
        [list(t) for t in high_triangles],
        all_triangles=True,
        epsilon=0.0,
    )
    baked = []
    distances = []
    for position in low_positions:
        location, _face_normal, index, distance = tree.find_nearest(Vector(position))
        if location is None or index is None:
            # Degenerate only if the BVH is empty; keep it loud rather than silent.
            raise RuntimeError('BVH find_nearest returned no hit for %r' % (position,))
        tri = high_triangles[index]
        p0, p1, p2 = (Vector(high_positions[i]) for i in tri)
        n0, n1, n2 = (Vector(high_normals[i]) for i in tri)
        interpolated = barycentric_transform(location, p0, p1, p2, n0, n1, n2)
        if interpolated.length == 0.0:
            interpolated = Vector(_face_normal)
        baked.append(tuple(interpolated.normalized()))
        distances.append(distance)
    return baked, distances


def angular_deviation(baked, geometric):
    """Degrees between the baked normal and the lowpoly's own normal."""
    out = []
    for b, g in zip(baked, geometric):
        bv = Vector(b).normalized()
        gv = Vector(g).normalized()
        dot = max(-1.0, min(1.0, bv.dot(gv)))
        out.append(math.degrees(math.acos(dot)))
    return out


def quantise_positions(positions):
    centre = [0.0, 0.0, 0.0]
    for axis in range(3):
        lo = min(p[axis] for p in positions)
        hi = max(p[axis] for p in positions)
        centre[axis] = (lo + hi) / 2.0
    extent = 0.0
    for p in positions:
        for axis in range(3):
            extent = max(extent, abs(p[axis] - centre[axis]))
    extent = extent if extent > 0 else 1.0
    raw = bytearray()
    for p in positions:
        for axis in range(3):
            q = int(round((p[axis] - centre[axis]) / extent * 32767.0))
            q = max(-32767, min(32767, q))
            raw += q.to_bytes(2, 'little', signed=True)
    return bytes(raw), centre, extent


def quantise_normals(normals):
    raw = bytearray()
    for n in normals:
        for axis in range(3):
            q = int(round(max(-1.0, min(1.0, n[axis])) * 127.0))
            q = max(-127, min(127, q))
            raw += q.to_bytes(1, 'little', signed=True)
    return bytes(raw)


def pack_indices(triangles, vertex_count):
    if vertex_count > 65535:
        raise RuntimeError('vertex count %d exceeds the Uint16 index budget' % vertex_count)
    raw = bytearray()
    for tri in triangles:
        for index in tri:
            raw += int(index).to_bytes(2, 'little', signed=False)
    return bytes(raw)


def b64(data):
    return base64.b64encode(data).decode('ascii')


def build_payload():
    reset_scene()
    highpoly = build_highpoly()
    lowpoly = build_lowpoly(highpoly)

    high_positions, high_normals, high_triangles = mesh_arrays(highpoly)
    low_positions, low_normals, low_triangles = mesh_arrays(lowpoly)

    baked, distances = bake_normals(
        high_positions, high_normals, high_triangles, low_positions,
    )
    deviation = angular_deviation(baked, low_normals)

    high_pos_raw, high_centre, high_extent = quantise_positions(high_positions)
    low_pos_raw, low_centre, low_extent = quantise_positions(low_positions)

    payload = {
        'generator': 'scripts/technique-lab/group-c/blender/remesh_bake.py',
        'blenderVersion': bpy.app.version_string,
        'blenderBuildHash': bpy.app.build_hash.decode('ascii')
        if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
        'recipe': {
            'highpolySubdivisions': HIGHPOLY_SUBDIVISIONS,
            'highpolyRadius': HIGHPOLY_RADIUS,
            'voxelSize': VOXEL_SIZE,
            'voxelAdaptivity': VOXEL_ADAPTIVITY,
            'remeshOperator': 'bpy.ops.object.voxel_remesh',
            'bake': 'BVHTree.find_nearest + barycentric_transform of highpoly vertex normals',
        },
        'counts': {
            'highpolyVertices': len(high_positions),
            'highpolyTriangles': len(high_triangles),
            'lowpolyVertices': len(low_positions),
            'lowpolyTriangles': len(low_triangles),
        },
        'bakeStats': {
            'maxTransferDistance': max(distances),
            'meanTransferDistance': sum(distances) / len(distances),
            'maxDeviationDegrees': max(deviation),
            'meanDeviationDegrees': sum(deviation) / len(deviation),
        },
        'highpoly': {
            'positionCentre': high_centre,
            'positionExtent': high_extent,
            'positions': b64(high_pos_raw),
            'normals': b64(quantise_normals(high_normals)),
            'indices': b64(pack_indices(high_triangles, len(high_positions))),
        },
        'lowpoly': {
            'positionCentre': low_centre,
            'positionExtent': low_extent,
            'positions': b64(low_pos_raw),
            'bakedNormals': b64(quantise_normals(baked)),
            'indices': b64(pack_indices(low_triangles, len(low_positions))),
        },
    }
    return payload


TS_HEADER = '''/**
 * GENERATED FILE — do not hand-edit.
 *
 * Emitted by `scripts/technique-lab/group-c/blender/remesh_bake.py` running
 * inside headless Blender. Highpoly authored in Blender, reduced by Blender's
 * OpenVDB voxel remesher, and carrying a nearest-surface interpolated normal
 * bake from the highpoly. Positions are Int16-quantised about a centre/extent,
 * normals are Int8, indices Uint16 — so the demo needs no loader, no fetch and
 * no external asset.
 *
 * Provenance, command line and hashes: docs/technique-lab/group-c/blender/.
 */

export type BlenderRemeshAsset = {
  readonly blenderVersion: string;
  readonly voxelSize: number;
  readonly counts: {
    readonly highpolyVertices: number;
    readonly highpolyTriangles: number;
    readonly lowpolyVertices: number;
    readonly lowpolyTriangles: number;
  };
  readonly bakeStats: {
    readonly maxTransferDistance: number;
    readonly meanTransferDistance: number;
    readonly maxDeviationDegrees: number;
    readonly meanDeviationDegrees: number;
  };
  readonly highpoly: {
    readonly positionCentre: readonly [number, number, number];
    readonly positionExtent: number;
    readonly positions: string;
    readonly normals: string;
    readonly indices: string;
  };
  readonly lowpoly: {
    readonly positionCentre: readonly [number, number, number];
    readonly positionExtent: number;
    readonly positions: string;
    readonly bakedNormals: string;
    readonly indices: string;
  };
};

export const SOURCE_36_BLENDER_REMESH: BlenderRemeshAsset = '''


def emit_ts(payload, path):
    asset = {
        'blenderVersion': payload['blenderVersion'],
        'voxelSize': payload['recipe']['voxelSize'],
        'counts': payload['counts'],
        'bakeStats': payload['bakeStats'],
        'highpoly': payload['highpoly'],
        'lowpoly': payload['lowpoly'],
    }
    body = json.dumps(asset, indent=2, sort_keys=False)
    with open(path, 'w', encoding='utf-8', newline='\n') as handle:
        handle.write(TS_HEADER)
        handle.write(body)
        handle.write(' as const;\n')


def sha256_file(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    args = parse_args()
    mode = args.get('mode', 'build')
    ts_path = args.get('ts')
    json_path = args.get('json')
    blend_path = args.get('blend')

    if mode == 'build':
        payload = build_payload()
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        os.makedirs(os.path.dirname(ts_path), exist_ok=True)
        with open(json_path, 'w', encoding='utf-8', newline='\n') as handle:
            json.dump(payload, handle, indent=2)
            handle.write('\n')
        emit_ts(payload, ts_path)
        bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
        receipt = {
            'mode': 'build',
            'counts': payload['counts'],
            'bakeStats': payload['bakeStats'],
            'artifactSha256': sha256_file(json_path),
            'tsSha256': sha256_file(ts_path),
            'blendSha256': sha256_file(blend_path),
            'blendBytes': os.path.getsize(blend_path),
        }
    elif mode == 'reopen':
        # Reopen proof: load the retained .blend in a fresh Blender, read the
        # two objects back out and re-derive the SAME export from them. A
        # matching artefact hash proves the .blend really contains the meshes
        # the committed data module was made from.
        bpy.ops.wm.open_mainfile(filepath=blend_path)
        names = sorted(o.name for o in bpy.data.objects)
        high = bpy.data.objects['highpoly']
        low = bpy.data.objects['lowpoly_voxel_remesh']
        high_positions, high_normals, high_triangles = mesh_arrays(high)
        low_positions, low_normals, low_triangles = mesh_arrays(low)
        baked, distances = bake_normals(
            high_positions, high_normals, high_triangles, low_positions,
        )
        deviation = angular_deviation(baked, low_normals)
        rehash = hashlib.sha256()
        rehash.update(quantise_positions(low_positions)[0])
        rehash.update(quantise_normals(baked))
        rehash.update(pack_indices(low_triangles, len(low_positions)))
        receipt = {
            'mode': 'reopen',
            'blendPath': blend_path,
            'objects': names,
            'counts': {
                'highpolyVertices': len(high_positions),
                'highpolyTriangles': len(high_triangles),
                'lowpolyVertices': len(low_positions),
                'lowpolyTriangles': len(low_triangles),
            },
            'bakeStats': {
                'maxTransferDistance': max(distances),
                'meanTransferDistance': sum(distances) / len(distances),
                'maxDeviationDegrees': max(deviation),
                'meanDeviationDegrees': sum(deviation) / len(deviation),
            },
            'lowpolyBufferSha256': rehash.hexdigest(),
        }
    else:
        raise SystemExit('unknown --mode %r' % mode)

    print('BLENDER_RECEIPT_JSON ' + json.dumps(receipt))


if __name__ == '__main__':
    main()
