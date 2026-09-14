"""Depth-conflict audit for the exported house shells. CPU only, no Blender.

Why this exists
---------------
Cycles resolves coincident surfaces analytically, so a pair of faces sharing a
plane renders cleanly in the lane's review frames and then tears apart in the
runtime's depth buffer. That is the failure mode behind the Build 16 facade:
white comb-like striping along the trim bands and dashed vertical seams down
the walls. A renderer-independent gate therefore has to measure *geometry*,
not pixels.

What it measures
----------------
For every triangle pair drawn with different materials that share a plane to
within ``--epsilon`` metres and whose footprints overlap on that plane, the
audit records a depth conflict: the two surfaces occupy the same depth range
and the winner is decided by depth quantisation. Coincident pairs (separation
below ``--coincident``) always fight; near pairs fight at distance.

Each conflicting pair is then split by *relative facing*, because the two halves
have different cures and only one of them is a runtime defect:

* **opposite-facing** — a box's back face lying in the plane of whatever it is
  mounted on. Backface culling removes one of the two, so the pair cannot fight
  in a renderer that culls. The loader forces ``THREE.FrontSide`` on every
  opaque material (``src/world-studio/houses/index.ts:229``) and wave 4 also
  declares ``use_backface_culling`` at export, so these are cured in the runtime.
* **same-facing** — two front faces in one plane. Nothing culls either of them
  and the depth buffer picks a winner per pixel, which is the dashed vertical
  seam. This is the number that has to reach zero, and it has not.

``conflictArea`` — the gate below — deliberately counts *both*, because it is a
claim about the geometry rather than about any one renderer. It fails today.

Usage
-----
    python scripts/blender/world-studio/houses/audit_surfaces.py
    python scripts/blender/world-studio/houses/audit_surfaces.py --variant teal
    python scripts/blender/world-studio/houses/audit_surfaces.py --json out.json

Exits non-zero when a house exceeds its contracted conflict budget.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from glb_reader import Glb  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
SHIPPED_DIR = os.path.join(REPO_ROOT, "public", "assets", "world-studio", "blender", "houses")

VARIANTS = ("teal", "yellow")

# A pair of faces within this distance of a shared plane is treated as sharing
# depth. 1.5 mm is above the ~0.25 mm depth resolution a 24-bit buffer has at
# 20 m with a 0.1 m near plane, so it is a conservative reading of "will fight".
DEFAULT_EPSILON = 0.0015
# Below this the two faces are coincident to within export rounding: they fight
# at every distance, on every depth buffer.
DEFAULT_COINCIDENT = 0.00005

# Contracted budget. Zero conflicts is the target; see docs/technique-lab/houses/HANDOFF.md.
MAX_CONFLICT_AREA = 0.0  # m^2 of overlapping same-depth facade surface


def _normalise(v):
    length = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if length == 0.0:
        return None
    return (v[0] / length, v[1] / length, v[2] / length)


def _triangles(glb: Glb):
    """Yield (material, (a, b, c)) for every triangle in the file."""
    for prim in glb.primitives():
        pos = prim.positions
        idx = prim.indices
        for i in range(0, len(idx) - 2, 3):
            yield prim.material, (pos[idx[i]], pos[idx[i + 1]], pos[idx[i + 2]])


def _plane(tri):
    """``(canonical_normal, plane_offset, geometric_normal)`` for one triangle."""
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = tri
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    raw = _normalise((uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx))
    if raw is None:
        return None
    # Canonical sign so a front face and the back face behind it land together:
    # both occupy the same depth, and both fight. The geometric normal is kept
    # alongside it so the pair can afterwards be split by relative facing.
    n = raw
    for component in n:
        if abs(component) > 1e-9:
            if component < 0:
                n = (-n[0], -n[1], -n[2])
            break
    d = n[0] * ax + n[1] * ay + n[2] * az
    return n, d, raw


def _area(tri):
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = tri
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    cross = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
    return 0.5 * math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2)


def _basis(n):
    """Two in-plane axes, chosen deterministically from the plane normal."""
    if abs(n[0]) <= abs(n[1]) and abs(n[0]) <= abs(n[2]):
        helper = (1.0, 0.0, 0.0)
    elif abs(n[1]) <= abs(n[2]):
        helper = (0.0, 1.0, 0.0)
    else:
        helper = (0.0, 0.0, 1.0)
    u = _normalise((
        helper[1] * n[2] - helper[2] * n[1],
        helper[2] * n[0] - helper[0] * n[2],
        helper[0] * n[1] - helper[1] * n[0],
    ))
    v = (
        n[1] * u[2] - n[2] * u[1],
        n[2] * u[0] - n[0] * u[2],
        n[0] * u[1] - n[1] * u[0],
    )
    return u, v


def _bounds_2d(tri, u, v):
    us = [p[0] * u[0] + p[1] * u[1] + p[2] * u[2] for p in tri]
    vs = [p[0] * v[0] + p[1] * v[1] + p[2] * v[2] for p in tri]
    return min(us), max(us), min(vs), max(vs)


def _overlap(a, b, slack):
    return (
        a[0] - slack < b[1] and b[0] - slack < a[1]
        and a[2] - slack < b[3] and b[2] - slack < a[3]
    )


def audit_glb(path: str, epsilon: float = DEFAULT_EPSILON, coincident: float = DEFAULT_COINCIDENT):
    """Return the depth-conflict report for one shipped GLB."""
    glb = Glb(path)
    normal_key = 3       # decimal places: 1e-3 on a unit normal is ~0.06 degrees
    depth_bucket = max(epsilon, 1e-6)

    faces = defaultdict(list)
    total = 0
    for material, tri in _triangles(glb):
        plane = _plane(tri)
        if plane is None:
            continue
        total += 1
        n, d, raw = plane
        nk = (round(n[0], normal_key), round(n[1], normal_key), round(n[2], normal_key))
        faces[(nk, int(math.floor(d / depth_bucket)))].append((material, tri, n, d, raw))

    conflicts = defaultdict(lambda: {
        "materials": set(), "pairs": 0, "area": 0.0, "min_gap": None, "max_gap": 0.0,
        "bounds": [math.inf] * 3 + [-math.inf] * 3, "same": 0, "same_area": 0.0,
    })
    coincident_pairs = 0
    same_facing_pairs = 0
    same_facing_area = 0.0
    same_by_pair = defaultdict(float)

    seen_buckets = set()
    for (nk, slab), entries in faces.items():
        for neighbour in (slab, slab + 1):
            if neighbour == slab:
                pool = entries
            else:
                pool = entries + faces.get((nk, neighbour), [])
            key = (nk, min(slab, neighbour), max(slab, neighbour))
            if key in seen_buckets:
                continue
            seen_buckets.add(key)
            if len(pool) < 2:
                continue
            materials = {item[0] for item in pool}
            if len(materials) < 2:
                continue
            u, v = _basis(pool[0][2])
            boxes = [_bounds_2d(item[1], u, v) for item in pool]
            for i in range(len(pool)):
                mat_i, tri_i, _n_i, d_i, raw_i = pool[i]
                for j in range(i + 1, len(pool)):
                    mat_j, tri_j, _n_j, d_j, raw_j = pool[j]
                    if mat_i == mat_j:
                        continue
                    gap = abs(d_i - d_j)
                    if gap > epsilon:
                        continue
                    if not _overlap(boxes[i], boxes[j], 0.0):
                        continue
                    bucket = conflicts[(nk, round(min(d_i, d_j), 4))]
                    bucket["materials"].update((mat_i, mat_j))
                    bucket["pairs"] += 1
                    overlap_area = min(_area(tri_i), _area(tri_j))
                    bucket["area"] += overlap_area
                    if raw_i[0] * raw_j[0] + raw_i[1] * raw_j[1] + raw_i[2] * raw_j[2] > 0.0:
                        # Both front faces: culling removes neither and the depth
                        # buffer decides per pixel. This is the seam.
                        same_facing_pairs += 1
                        same_facing_area += overlap_area
                        bucket["same"] += 1
                        bucket["same_area"] += overlap_area
                        key = tuple(sorted((mat_i.split("-")[-1], mat_j.split("-")[-1])))
                        same_by_pair[key] += overlap_area
                    bucket["min_gap"] = gap if bucket["min_gap"] is None else min(bucket["min_gap"], gap)
                    bucket["max_gap"] = max(bucket["max_gap"], gap)
                    for point in tri_i + tri_j:
                        for axis in range(3):
                            bucket["bounds"][axis] = min(bucket["bounds"][axis], point[axis])
                            bucket["bounds"][axis + 3] = max(bucket["bounds"][axis + 3], point[axis])
                    if gap <= coincident:
                        coincident_pairs += 1

    regions = []
    for (nk, depth), bucket in conflicts.items():
        regions.append({
            "normal": list(nk),
            "plane_d": depth,
            "materials": sorted(bucket["materials"]),
            "pairs": bucket["pairs"],
            "sameFacingPairs": bucket["same"],
            "sameFacingArea": round(bucket["same_area"], 6),
            "area": round(bucket["area"], 6),
            "min_gap": round(bucket["min_gap"], 8),
            "max_gap": round(bucket["max_gap"], 8),
            "bounds": [round(value, 4) for value in bucket["bounds"]],
        })
    regions.sort(key=lambda r: -r["area"])

    return {
        "glb": os.path.basename(path),
        "bytes": os.path.getsize(path),
        "triangles": total,
        "epsilon": epsilon,
        "conflictRegions": len(regions),
        "conflictPairs": sum(r["pairs"] for r in regions),
        "coincidentPairs": coincident_pairs,
        "conflictArea": round(sum(r["area"] for r in regions), 6),
        "sameFacingPairs": same_facing_pairs,
        "sameFacingArea": round(same_facing_area, 6),
        "oppositeFacingPairs": sum(r["pairs"] for r in regions) - same_facing_pairs,
        "sameFacingByMaterialPair": {
            "+".join(k): round(v, 6)
            for k, v in sorted(same_by_pair.items(), key=lambda kv: -kv[1])
        },
        "regions": regions,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--variant", default="all", choices=(*VARIANTS, "all"))
    parser.add_argument("--epsilon", type=float, default=DEFAULT_EPSILON)
    parser.add_argument("--coincident", type=float, default=DEFAULT_COINCIDENT)
    parser.add_argument("--glb", default=None, help="audit an explicit file instead of the shipped pair")
    parser.add_argument("--json", default=None, help="write the full report to this path")
    parser.add_argument("--top", type=int, default=12, help="conflict regions to print")
    parser.add_argument("--max-area", type=float, default=MAX_CONFLICT_AREA)
    args = parser.parse_args(argv)

    if args.glb:
        targets = [(os.path.splitext(os.path.basename(args.glb))[0], args.glb)]
    else:
        chosen = VARIANTS if args.variant == "all" else (args.variant,)
        targets = [(name, os.path.join(SHIPPED_DIR, f"house-{name}-shell.glb")) for name in chosen]

    reports = {}
    failed = False
    for name, path in targets:
        if not os.path.exists(path):
            print(f"FAIL {name}: missing {path}")
            failed = True
            continue
        report = audit_glb(path, args.epsilon, args.coincident)
        reports[name] = report
        print(f"\n=== {name} — {report['glb']} ({report['triangles']} triangles) ===")
        print(f"  depth-conflict regions : {report['conflictRegions']}")
        print(f"  conflicting face pairs : {report['conflictPairs']}")
        print(f"  coincident pairs       : {report['coincidentPairs']}")
        print(f"  conflicting area       : {report['conflictArea']:.4f} m^2")
        print(f"  same-facing pairs      : {report['sameFacingPairs']} "
              f"({report['sameFacingArea']:.4f} m^2) — fight even with culling")
        print(f"  opposite-facing pairs  : {report['oppositeFacingPairs']} — cured by culling")
        for pair, area in list(report["sameFacingByMaterialPair"].items())[:6]:
            print(f"      same-facing {pair:20s} {area:9.3f} m^2")
        for region in report["regions"][:args.top]:
            b = region["bounds"]
            print(
                f"    n={region['normal']} d={region['plane_d']:+.4f} "
                f"area={region['area']:.4f} pairs={region['pairs']:4d} "
                f"gap={region['min_gap']:.6f}..{region['max_gap']:.6f} "
                f"{'+'.join(m.split('-')[-1] for m in region['materials'])} "
                f"x[{b[0]:.2f},{b[3]:.2f}] y[{b[1]:.2f},{b[4]:.2f}] z[{b[2]:.2f},{b[5]:.2f}]"
            )
        if report["conflictArea"] > args.max_area:
            print(f"  FAIL {name}: {report['conflictArea']:.4f} m^2 of same-depth facade exceeds budget {args.max_area:.4f}")
            failed = True
        else:
            print(f"  OK {name}: within depth-conflict budget")

    if args.json:
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump(reports, handle, indent=2, sort_keys=True)
            handle.write("\n")
        print(f"\nwrote {args.json}")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
