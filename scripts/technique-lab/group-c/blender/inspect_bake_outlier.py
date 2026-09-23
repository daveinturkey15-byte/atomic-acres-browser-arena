"""Group-C row 36 — bounded check on the one unexplained bake-time number.

The Blender run recorded `bakeStats.maxDeviationDegrees = 97.7` between each
lowpoly vertex's baked normal and that vertex's OWN normal as Blender reported
it (`mesh.vertex_normals`). The scene that ships the same data measures 11.0
degrees with zero hemisphere flips against normals recomputed from the geometry.
Only one of those two can be a property of the geometry.

This script settles which, without Blender and without a GPU: it decodes the
committed artefact (positions, indices, baked normals) and recomputes the
lowpoly's own vertex normals three ways, including Blender's own corner-angle
weighting, then reports the deviation each way and the worst vertices with
their local topology.

    python scripts/technique-lab/group-c/blender/inspect_bake_outlier.py

Read-only: it writes nothing and runs no Blender. Its output is quoted in
docs/technique-lab/group-c/blender/PROVENANCE.md.
"""

from __future__ import annotations

import base64
import json
import math
import os
import struct
import sys

ARTEFACT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', '..', '..', '..',
    'docs', 'technique-lab', 'group-c', 'blender', 'source-36-remesh.artifact.json',
)


def decode_positions(block):
    raw = base64.b64decode(block['positions'])
    centre = block['positionCentre']
    extent = block['positionExtent']
    values = struct.unpack('<%dh' % (len(raw) // 2), raw)
    out = []
    for i in range(0, len(values), 3):
        out.append(tuple(
            centre[axis] + values[i + axis] / 32767.0 * extent for axis in range(3)
        ))
    return out


def decode_normals(block, key):
    raw = base64.b64decode(block[key])
    values = struct.unpack('<%db' % len(raw), raw)
    out = []
    for i in range(0, len(values), 3):
        vector = [values[i + axis] / 127.0 for axis in range(3)]
        length = math.sqrt(sum(c * c for c in vector)) or 1.0
        out.append(tuple(c / length for c in vector))
    return out


def decode_indices(block):
    raw = base64.b64decode(block['indices'])
    values = struct.unpack('<%dH' % (len(raw) // 2), raw)
    return [tuple(values[i:i + 3]) for i in range(0, len(values), 3)]


def cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def length(v):
    return math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])


def normalise(v):
    n = length(v)
    return (v[0] / n, v[1] / n, v[2] / n) if n > 0 else (0.0, 0.0, 0.0)


def corner_angle(at, left, right):
    a = normalise(sub(left, at))
    b = normalise(sub(right, at))
    dot = max(-1.0, min(1.0, sum(a[i] * b[i] for i in range(3))))
    return math.acos(dot)


def vertex_normals(positions, triangles, weighting):
    """weighting: 'area' (cross magnitude), 'angle' (Blender), or 'uniform'."""
    accumulated = [[0.0, 0.0, 0.0] for _ in positions]
    for tri in triangles:
        p0, p1, p2 = (positions[i] for i in tri)
        face = cross(sub(p1, p0), sub(p2, p0))
        area = length(face)
        if area == 0.0:
            continue
        unit = (face[0] / area, face[1] / area, face[2] / area)
        for corner, index in enumerate(tri):
            if weighting == 'area':
                weight = area
            elif weighting == 'angle':
                other = [positions[tri[(corner + 1) % 3]], positions[tri[(corner + 2) % 3]]]
                weight = corner_angle(positions[index], other[0], other[1])
            else:
                weight = 1.0
            for axis in range(3):
                accumulated[index][axis] += unit[axis] * weight
    return [normalise(tuple(v)) for v in accumulated]


def deviations(baked, geometric):
    out = []
    for b, g in zip(baked, geometric):
        if length(g) == 0.0:
            out.append(float('nan'))
            continue
        dot = max(-1.0, min(1.0, sum(b[i] * g[i] for i in range(3))))
        out.append(math.degrees(math.acos(dot)))
    return out


def main() -> int:
    with open(os.path.normpath(ARTEFACT), 'rb') as handle:
        artefact = json.loads(handle.read().decode('utf-8'))

    low = artefact['lowpoly']
    positions = decode_positions(low)
    baked = decode_normals(low, 'bakedNormals')
    triangles = decode_indices(low)

    print('artefact  : %s' % os.path.normpath(ARTEFACT))
    print('recorded  : max %.4f deg, mean %.4f deg (Blender, against mesh.vertex_normals)'
          % (artefact['bakeStats']['maxDeviationDegrees'],
             artefact['bakeStats']['meanDeviationDegrees']))
    print('decoded   : %d vertices, %d triangles' % (len(positions), len(triangles)))

    degenerate = sum(
        1 for tri in triangles
        if length(cross(sub(positions[tri[1]], positions[tri[0]]),
                        sub(positions[tri[2]], positions[tri[0]]))) == 0.0
    )
    incident = [0] * len(positions)
    for tri in triangles:
        for index in tri:
            incident[index] += 1
    print('topology  : %d degenerate triangles, %d vertices with no incident triangle'
          % (degenerate, sum(1 for count in incident if count == 0)))

    worst_by_scheme = {}
    for weighting in ('area', 'angle', 'uniform'):
        geometric = vertex_normals(positions, triangles, weighting)
        angles = deviations(baked, geometric)
        finite = [a for a in angles if not math.isnan(a)]
        flips = sum(1 for a in finite if a > 90.0)
        worst = max(range(len(angles)), key=lambda i: -1.0 if math.isnan(angles[i]) else angles[i])
        worst_by_scheme[weighting] = (angles, worst)
        print('%-8s: max %7.3f deg  mean %6.3f deg  >90deg: %d' % (
            weighting, max(finite), sum(finite) / len(finite), flips))

    angles, worst = worst_by_scheme['angle']
    order = sorted(
        (i for i in range(len(angles)) if not math.isnan(angles[i])),
        key=lambda i: angles[i],
        reverse=True,
    )[:5]
    print('worst five vertices under Blender\'s own angle weighting:')
    for index in order:
        print('  v%-5d %7.3f deg  incident %d  pos (%.4f, %.4f, %.4f)' % (
            index, angles[index], incident[index], *positions[index]))

    # Why that one vertex: print its fan under both weightings. A vertex whose
    # weighted face normals nearly cancel has an ill-conditioned direction, so
    # the scheme that weights them decides the answer.
    print('fan of v%d (the outlier):' % worst)
    totals = {'area': [0.0, 0.0, 0.0], 'angle': [0.0, 0.0, 0.0]}
    weight_sums = {'area': 0.0, 'angle': 0.0}
    for tri in triangles:
        if worst not in tri:
            continue
        p0, p1, p2 = (positions[i] for i in tri)
        face = cross(sub(p1, p0), sub(p2, p0))
        area = length(face)
        unit = (face[0] / area, face[1] / area, face[2] / area)
        corner = list(tri).index(worst)
        angle = corner_angle(
            positions[worst],
            positions[tri[(corner + 1) % 3]],
            positions[tri[(corner + 2) % 3]],
        )
        print('  face %-18s normal (%+.3f, %+.3f, %+.3f)  area %.5f  corner %.1f deg' % (
            str(tri), unit[0], unit[1], unit[2], area / 2.0, math.degrees(angle)))
        for axis in range(3):
            totals['area'][axis] += unit[axis] * area
            totals['angle'][axis] += unit[axis] * angle
        weight_sums['area'] += area
        weight_sums['angle'] += angle
    for scheme in ('area', 'angle'):
        vector = tuple(totals[scheme])
        conditioning = length(vector) / weight_sums[scheme] if weight_sums[scheme] else 0.0
        unit = normalise(vector)
        dot = max(-1.0, min(1.0, sum(unit[i] * baked[worst][i] for i in range(3))))
        print('  %-5s weighted sum -> (%+.3f, %+.3f, %+.3f)  |sum|/weights %.4f  vs baked %.2f deg'
              % (scheme, unit[0], unit[1], unit[2], conditioning, math.degrees(math.acos(dot))))
    print('  baked normal (%+.3f, %+.3f, %+.3f)' % baked[worst])
    print('  (|sum|/weights near 1 = the fan agrees; near 0 = the fan cancels and the')
    print('   averaged direction is decided by the weighting, not by the surface)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
