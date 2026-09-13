"""Scratch probe: classify depth ties by relative facing, and test manifoldness."""
import math
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from glb_reader import Glb

PATH = sys.argv[1] if len(sys.argv) > 1 else (
    "C:/Users/david/projects/worktrees/aa-houses-night-20260912/"
    "public/assets/world-studio/blender/houses/house-teal-shell.glb"
)

glb = Glb(PATH)
prims = glb.primitives()


def norm(v):
    L = math.sqrt(sum(c * c for c in v))
    return None if L == 0 else (v[0] / L, v[1] / L, v[2] / L)


def tri_normal(t):
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
    u = (bx - ax, by - ay, bz - az)
    v = (cx - ax, cy - ay, cz - az)
    return norm((u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]))


def area(t):
    (ax, ay, az), (bx, by, bz), (cx, cy, cz) = t
    u = (bx - ax, by - ay, bz - az)
    v = (cx - ax, cy - ay, cz - az)
    c = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    return 0.5 * math.sqrt(sum(x * x for x in c))


# ---- 1. manifold / orientation / signed volume, per primitive -------------
print("=== closedness per primitive ===")
for p in prims:
    edges = defaultdict(int)
    quant = lambda v: (round(v[0], 6), round(v[1], 6), round(v[2], 6))
    vol = 0.0
    ntri = 0
    for i in range(0, len(p.indices) - 2, 3):
        t = [p.positions[p.indices[i + k]] for k in range(3)]
        ntri += 1
        a, b, c = (quant(x) for x in t)
        for e in ((a, b), (b, c), (c, a)):
            edges[e] += 1
        vol += (
            t[0][0] * (t[1][1] * t[2][2] - t[2][1] * t[1][2])
            - t[0][1] * (t[1][0] * t[2][2] - t[2][0] * t[1][2])
            + t[0][2] * (t[1][0] * t[2][1] - t[2][0] * t[1][1])
        ) / 6.0
    unmatched = sum(1 for e, n in edges.items() if edges.get((e[1], e[0]), 0) != n)
    dup = sum(1 for e, n in edges.items() if n > 1)
    print(f"  {p.material:16s} tris={ntri:6d} unmatched_half_edges={unmatched:5d} "
          f"dup_dir_edges={dup:4d} signed_volume={vol:+.4f}")

# ---- 2. depth ties classified by relative facing -------------------------
print("\n=== depth ties by relative facing (eps=1.5mm, cross-material) ===")
EPS = 0.0015
buckets = defaultdict(list)
for p in prims:
    for i in range(0, len(p.indices) - 2, 3):
        t = tuple(p.positions[p.indices[i + k]] for k in range(3))
        n = tri_normal(t)
        if n is None:
            continue
        cn = n
        for c in cn:
            if abs(c) > 1e-9:
                if c < 0:
                    cn = (-n[0], -n[1], -n[2])
                break
        d = cn[0] * t[0][0] + cn[1] * t[0][1] + cn[2] * t[0][2]
        key = (round(cn[0], 3), round(cn[1], 3), round(cn[2], 3), int(math.floor(d / EPS)))
        buckets[key].append((p.material, t, n, d))


def basis(n):
    h = (1.0, 0, 0) if abs(n[0]) <= abs(n[1]) and abs(n[0]) <= abs(n[2]) else (
        (0, 1.0, 0) if abs(n[1]) <= abs(n[2]) else (0, 0, 1.0))
    u = norm((h[1] * n[2] - h[2] * n[1], h[2] * n[0] - h[0] * n[2], h[0] * n[1] - h[1] * n[0]))
    v = (n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0])
    return u, v


stats = {"same": 0, "opposite": 0}
same_area = defaultdict(float)
opp_area = defaultdict(float)
same_examples = defaultdict(lambda: [0, 0.0, None])
seen = set()
for (nx, ny, nz, slab), entries in list(buckets.items()):
    for nb in (slab, slab + 1):
        key = (nx, ny, nz, min(slab, nb), max(slab, nb))
        if key in seen:
            continue
        seen.add(key)
        pool = entries if nb == slab else entries + buckets.get((nx, ny, nz, nb), [])
        if len(pool) < 2 or len({e[0] for e in pool}) < 2:
            continue
        u, v = basis((nx, ny, nz) if abs(nx) + abs(ny) + abs(nz) > 0 else (0, 0, 1))
        boxes = []
        for _m, t, _n, _d in pool:
            us = [q[0] * u[0] + q[1] * u[1] + q[2] * u[2] for q in t]
            vs = [q[0] * v[0] + q[1] * v[1] + q[2] * v[2] for q in t]
            boxes.append((min(us), max(us), min(vs), max(vs)))
        for i in range(len(pool)):
            mi, ti, ni, di = pool[i]
            for j in range(i + 1, len(pool)):
                mj, tj, nj, dj = pool[j]
                if mi == mj or abs(di - dj) > EPS:
                    continue
                a, b = boxes[i], boxes[j]
                if not (a[0] < b[1] and b[0] < a[1] and a[2] < b[3] and b[2] < a[3]):
                    continue
                dot = ni[0] * nj[0] + ni[1] * nj[1] + ni[2] * nj[2]
                pair = tuple(sorted((mi.split('-')[-1], mj.split('-')[-1])))
                if dot > 0:
                    stats["same"] += 1
                    same_area[pair] += min(area(ti), area(tj))
                    rec = same_examples[(pair, round(di, 3), (nx, ny, nz))]
                    rec[0] += 1
                    rec[1] += min(area(ti), area(tj))
                    rec[2] = ti
                else:
                    stats["opposite"] += 1
                    opp_area[pair] += min(area(ti), area(tj))

print(f"  same-facing (fights even with backface culling) : {stats['same']}")
print(f"  opposite-facing (cured by backface culling)     : {stats['opposite']}")
print("\n  same-facing by material pair:")
for k, a in sorted(same_area.items(), key=lambda kv: -kv[1]):
    print(f"    {k} area~{a:.3f}")
print("\n  opposite-facing by material pair (top 10):")
for k, a in sorted(opp_area.items(), key=lambda kv: -kv[1])[:10]:
    print(f"    {k} area~{a:.3f}")
print("\n  same-facing example regions (top 15):")
for (pair, d, n), rec in sorted(same_examples.items(), key=lambda kv: -kv[1][1])[:15]:
    print(f"    {pair} n={n} d={d} pairs={rec[0]} area~{rec[1]:.3f} pt={tuple(round(c,3) for c in rec[2][0])}")
