"""CPU facade preview: reproduce the runtime's depth buffer without a GPU.

Why this exists
---------------
The lane's Blender review frames are ray-traced, so they resolve coincident
surfaces analytically and light every recess with a shadowing sun. The runtime
rasterises into a quantised depth buffer under near-uniform ambient. Those two
differences are exactly where the Build 16 facade fault lives, which is why a
clean Cycles frame never predicted it.

This renderer is deliberately crude and deliberately faithful in the two ways
that matter:

* a **quantised depth buffer** with the runtime's near/far and bit depth, and
  GL's ``LESS`` tie-break, so coincident and near-coincident surfaces fight here
  the same way they fight in the browser;
* **flat ambient shading**, so a recess that the Cycles sun would have put in
  shadow shows its true albedo — which is how a white substrate behind a 3 mm
  lap reveal turns into a white comb.

It is NOT a beauty render and proves nothing about lighting, reflection or
material response. It is an instrument for one class of defect.

The geometry comes from ``build_house_shell.build_shell`` itself — the same pure
Python that Blender runs — so a before/after here is a before/after of the
actual export, not of a hand-made stand-in. ``bpy`` is stubbed because the
geometry layer never touches it.

Usage
-----
    python scripts/blender/world-studio/houses/facade_preview.py --variant teal
    python scripts/blender/world-studio/houses/facade_preview.py --camera street-grazing --cull
    python scripts/blender/world-studio/houses/facade_preview.py --census
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import types
from collections import Counter

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))


def _stub_bpy() -> None:
    """Let the pure-Python geometry layer import outside Blender.

    ``build_house_shell`` imports bpy at module scope but only touches it inside
    ``realise``/``reset_scene``/``main``. Anything that actually reaches into the
    stub raises, so this can never silently fake a Blender result.
    """
    if "bpy" in sys.modules:
        return

    class _Guard:
        def __getattr__(self, name):
            raise RuntimeError(
                f"facade_preview stubs bpy: '{name}' means a Blender-only path was reached"
            )

    module = types.ModuleType("bpy")
    module.types = _Guard()
    module.data = _Guard()
    module.ops = _Guard()
    module.context = _Guard()
    sys.modules["bpy"] = module


_stub_bpy()

import build_house_shell as B  # noqa: E402
import house_contract as C  # noqa: E402

# Flat sRGB albedo per material slot. Measured means of the shipped maps; the
# trim value is the concept-solved white recorded in the wave-2 handoff.
ALBEDO = {
    "teal": {
        "siding": (84, 134, 129),
        "trim": (226, 222, 210),
        "shingle": (137, 143, 129),
        "masonry": (150, 132, 108),
        "metal": (176, 178, 180),
        "concrete": (150, 150, 148),
        "door": (102, 60, 40),
        "glass": (96, 116, 128),
    },
    "yellow": {
        "siding": (178, 142, 75),
        "trim": (226, 222, 210),
        "shingle": (139, 141, 127),
        "masonry": (150, 132, 108),
        "metal": (176, 178, 180),
        "concrete": (150, 150, 148),
        "door": (74, 79, 88),
        "glass": (96, 116, 128),
    },
}

# Local-frame cameras. The grazing street view is the one that reproduces the
# Build 16 consumer capture's read of the long west facade; it is not a
# reproduction of that camera's exact extrinsics and is not offered as one.
CAMERAS = {
    "street-grazing": ((-11.2, 1.70, 15.0), (-5.4, 3.10, -5.0), 55.0),
    "street-front": ((-2.0, 2.10, 26.0), (-1.0, 3.40, 4.0), 50.0),
    "watertable-close": ((-10.0, 1.10, 7.5), (-6.6, 0.55, -3.0), 42.0),
    "belt-grazing": ((-10.4, 3.60, 12.0), (-6.0, 3.35, -6.0), 46.0),
}

# three.js PerspectiveCamera defaults used across this project's arena captures.
NEAR, FAR, DEPTH_BITS = 0.1, 2000.0, 24


def collect_triangles(variant: str, *, legacy_sheathing: bool = False):
    """(N,3,3) float64 vertex positions plus a per-triangle material index.

    ``legacy_sheathing`` rebuilds with the wave-3 white structural leaf. It exists
    only so the before/after record is two runs of one instrument rather than two
    instruments; the build never sets it.
    """
    previous = B.SHEATHING_SLOT
    if legacy_sheathing:
        B.SHEATHING_SLOT = "trim"
    try:
        builder = B.build_shell(variant)
    finally:
        B.SHEATHING_SLOT = previous
    names = sorted(builder.slots)
    tris, mats = [], []
    for index, name in enumerate(names):
        slot = builder.slots[name]
        verts = slot.verts
        for face in slot.faces:
            for k in range(1, len(face) - 1):
                tris.append((verts[face[0]], verts[face[k]], verts[face[k + 1]]))
                mats.append(index)
    return np.asarray(tris, dtype=np.float64), np.asarray(mats, dtype=np.int32), names


def _look_at(eye, target, up=(0.0, 1.0, 0.0)):
    eye = np.asarray(eye, dtype=np.float64)
    fwd = np.asarray(target, dtype=np.float64) - eye
    fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, np.asarray(up, dtype=np.float64))
    right /= np.linalg.norm(right)
    true_up = np.cross(right, fwd)
    rot = np.stack([right, true_up, -fwd])
    return rot, eye


def render(variant: str, camera: str, width: int, height: int, *, cull: bool,
           near: float = NEAR, far: float = FAR, bits: int = DEPTH_BITS,
           legacy_sheathing: bool = False):
    tris, mats, names = collect_triangles(variant, legacy_sheathing=legacy_sheathing)
    eye, target, fov = CAMERAS[camera]
    rot, eye_v = _look_at(eye, target)

    view = (tris.reshape(-1, 3) - eye_v) @ rot.T
    view = view.reshape(-1, 3, 3)

    # Geometric normals in world space, for shading and for culling.
    edge1 = tris[:, 1] - tris[:, 0]
    edge2 = tris[:, 2] - tris[:, 0]
    normals = np.cross(edge1, edge2)
    lengths = np.linalg.norm(normals, axis=1)
    ok = lengths > 1e-12
    normals[ok] /= lengths[ok][:, None]

    if cull:
        # Front faces are CCW seen from outside; drop triangles whose geometric
        # normal points away from the eye, which is what FrontSide does.
        to_eye = eye_v - tris[:, 0]
        facing = np.einsum("ij,ij->i", normals, to_eye)
        keep = facing > 0.0
        tris, mats, view, normals = tris[keep], mats[keep], view[keep], normals[keep]

    # Reject anything not fully in front of the near plane. The cameras sit
    # outside the shell, so this clips nothing that is being measured.
    depth = -view[:, :, 2]
    visible = np.all(depth > near, axis=1)
    tris, mats, view, normals, depth = tris[visible], mats[visible], view[visible], normals[visible], depth[visible]

    aspect = width / height
    f = 1.0 / math.tan(math.radians(fov) * 0.5)
    sx = (view[:, :, 0] * (f / aspect) / depth * 0.5 + 0.5) * width
    sy = (1.0 - (view[:, :, 1] * f / depth * 0.5 + 0.5)) * height
    # GL window-space z in [0,1], then quantised exactly like the real buffer.
    ndc_z = (far + near) / (far - near) - (2.0 * far * near) / ((far - near) * depth)
    win_z = np.clip(ndc_z * 0.5 + 0.5, 0.0, 1.0)

    levels = float((1 << bits) - 1)
    zbuf = np.full((height, width), levels + 1.0, dtype=np.float64)
    idbuf = np.full((height, width), -1, dtype=np.int32)

    light = np.asarray([0.42, 0.80, 0.43])
    light /= np.linalg.norm(light)
    shade = 0.55 + 0.45 * np.abs(normals @ light)

    inv_z = 1.0 / depth
    for t in range(tris.shape[0]):
        x0, x1 = sx[t], sy[t]
        xs, ys = sx[t], sy[t]
        min_x, max_x = math.floor(xs.min()), math.ceil(xs.max())
        min_y, max_y = math.floor(ys.min()), math.ceil(ys.max())
        if max_x < 0 or min_x >= width or max_y < 0 or min_y >= height:
            continue
        min_x, max_x = max(min_x, 0), min(max_x, width - 1)
        min_y, max_y = max(min_y, 0), min(max_y, height - 1)
        if min_x > max_x or min_y > max_y:
            continue
        ax, ay = xs[0], ys[0]
        bx, by = xs[1], ys[1]
        cx, cy = xs[2], ys[2]
        area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        if abs(area) < 1e-12:
            continue
        px = np.arange(min_x, max_x + 1) + 0.5
        py = np.arange(min_y, max_y + 1) + 0.5
        gx, gy = np.meshgrid(px, py)
        w0 = ((bx - ax) * (gy - ay) - (by - ay) * (gx - ax)) / area
        w1 = ((gx - ax) * (cy - ay) - (gy - ay) * (cx - ax)) / area
        inside = (w0 >= 0) & (w1 >= 0) & (w0 + w1 <= 1)
        if not inside.any():
            continue
        l0 = 1.0 - w0 - w1
        # Perspective-correct interpolation of window z via 1/w.
        iz = l0 * inv_z[t, 0] + w1 * inv_z[t, 1] + w0 * inv_z[t, 2]
        with np.errstate(divide="ignore", invalid="ignore"):
            eye_z = 1.0 / iz
        zz = (l0 * win_z[t, 0] * inv_z[t, 0] + w1 * win_z[t, 1] * inv_z[t, 1]
              + w0 * win_z[t, 2] * inv_z[t, 2]) * eye_z
        quant = np.rint(np.clip(zz, 0.0, 1.0) * levels)
        sub = zbuf[min_y:max_y + 1, min_x:max_x + 1]
        ids = idbuf[min_y:max_y + 1, min_x:max_x + 1]
        win = inside & (quant < sub)
        sub[win] = quant[win]
        ids[win] = t

    colour = np.zeros((height, width, 3), dtype=np.float64)
    sky = np.asarray([196, 214, 228], dtype=np.float64)
    colour[:, :] = sky
    hit = idbuf >= 0
    palette = ALBEDO[variant]
    tri_rgb = np.asarray([palette[names[m]] for m in mats], dtype=np.float64)
    idx = idbuf[hit]
    colour[hit] = tri_rgb[idx] * shade[idx][:, None]
    image = np.clip(colour, 0, 255).astype(np.uint8)

    census = Counter()
    for m in mats[idx]:
        census[names[m]] += 1
    return image, idbuf, mats, names, census, tris


def _speckle_mask(is_intruder, is_field, *, max_size: int):
    """Light blobs of at most ``max_size`` pixels that sit inside the siding field.

    A white casing or watertable is a large connected run; a comb tooth or a
    dash of substrate seen through a lap reveal is a handful of pixels with teal
    all around it. Labelling the components separates the two without a
    threshold on shape.
    """
    height, width = is_intruder.shape
    seen = np.zeros_like(is_intruder)
    out = np.zeros_like(is_intruder)
    ys, xs = np.nonzero(is_intruder)
    offsets = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    for sy, sx in zip(ys.tolist(), xs.tolist()):
        if seen[sy, sx]:
            continue
        stack = [(sy, sx)]
        seen[sy, sx] = True
        component = []
        touches_field = False
        overflow = False
        while stack:
            cy, cx = stack.pop()
            component.append((cy, cx))
            if len(component) > max_size:
                overflow = True
                # Keep draining so the component is not revisited from another seed.
            for dy, dx in offsets:
                ny, nx = cy + dy, cx + dx
                if ny < 0 or nx < 0 or ny >= height or nx >= width:
                    continue
                if is_field[ny, nx]:
                    touches_field = True
                elif is_intruder[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        if overflow or not touches_field:
            continue
        for cy, cx in component:
            out[cy, cx] = True
    return out


def stripe_metrics(idbuf, mats, names, tris, *, field="siding",
                   intruders=("trim", "concrete"), max_speckle: int = 12):
    """Count light surfaces intruding as slivers into a field of siding, and name them.

    This is the mechanical stand-in for "white comb-like striping". A light pixel
    is a *hairline* when it is pinched between siding on both sides of either
    axis: teal above and below (a horizontal comb tooth) or teal left and right
    (a vertical seam). Real trim — a casing, a watertable, a corner board — is
    several pixels wide on both axes and is never pinched, so it is not counted.
    """
    mat_index = {name: i for i, name in enumerate(names)}
    height, width = idbuf.shape
    matbuf = np.where(idbuf >= 0, mats[np.clip(idbuf, 0, None)], -1)

    is_field = matbuf == mat_index.get(field, -99)
    is_intruder = np.zeros_like(is_field)
    for name in intruders:
        if name in mat_index:
            is_intruder |= matbuf == mat_index[name]

    pad = np.zeros((height + 2, width + 2), dtype=bool)
    pad[1:-1, 1:-1] = is_field
    up, down = pad[:-2, 1:-1], pad[2:, 1:-1]
    left, right = pad[1:-1, :-2], pad[1:-1, 2:]
    hairline = is_intruder & ((up & down) | (left & right))
    speckle = _speckle_mask(is_intruder, is_field, max_size=max_speckle)
    sliver = hairline | speckle

    groups = Counter()
    areas = Counter()
    extents: dict = {}
    winners = idbuf[sliver]
    for t in np.unique(winners):
        count = int((winners == t).sum())
        tri = tris[t]
        normal = np.cross(tri[1] - tri[0], tri[2] - tri[0])
        length = float(np.linalg.norm(normal))
        if length > 1e-12:
            normal = normal / length
        d = float(np.dot(normal, tri[0]))
        key = (names[mats[t]], tuple(float(c) for c in np.round(normal, 3)), round(d, 3))
        groups[key] += count
        areas[key] += 1
        lo, hi = tri.min(axis=0), tri.max(axis=0)
        if key in extents:
            plo, phi = extents[key]
            lo, hi = np.minimum(lo, plo), np.maximum(hi, phi)
        extents[key] = (lo, hi)
    return {
        "sliverPixels": int(sliver.sum()),
        "fieldPixels": int(is_field.sum()),
        "intruderPixels": int(is_intruder.sum()),
        "groups": groups,
        "trianglesPerGroup": areas,
        "extents": {k: [list(np.round(v[0], 3)), list(np.round(v[1], 3))] for k, v in extents.items()},
    }


def save_png(image: np.ndarray, path: str) -> None:
    from PIL import Image

    Image.fromarray(image, "RGB").save(path)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--variant", default="teal", choices=sorted(C.VARIANTS))
    parser.add_argument("--camera", default="street-grazing", choices=sorted(CAMERAS))
    parser.add_argument("--width", type=int, default=960)
    parser.add_argument("--height", type=int, default=540)
    parser.add_argument("--cull", action="store_true", help="emulate THREE.FrontSide")
    parser.add_argument("--near", type=float, default=NEAR)
    parser.add_argument("--far", type=float, default=FAR)
    parser.add_argument("--bits", type=int, default=DEPTH_BITS)
    parser.add_argument("--out", default=None)
    parser.add_argument("--census", action="store_true", help="print the visible-material pixel census")
    parser.add_argument("--legacy-sheathing", action="store_true",
                        help="rebuild with the wave-3 white structural leaf, for the A/B record")
    parser.add_argument("--explain", type=int, default=0, metavar="N", help="name the N worst sliver surfaces")
    parser.add_argument("--json", default=None, help="write the census and sliver metrics here")
    args = parser.parse_args(argv)

    image, idbuf, mats, names, census, tris = render(
        args.variant, args.camera, args.width, args.height,
        cull=args.cull, near=args.near, far=args.far, bits=args.bits,
        legacy_sheathing=args.legacy_sheathing,
    )
    suffix = ("-wave3" if args.legacy_sheathing else "-wave4") + ("" if args.cull else "-doublesided")
    out = args.out or os.path.join(
        REPO_ROOT, "source-assets", "world-studio", "houses", args.variant, "review",
        f"cpu-{args.camera}{suffix}.png",
    )
    os.makedirs(os.path.dirname(out), exist_ok=True)
    save_png(image, out)
    print(f"wrote {out}  ({args.width}x{args.height}, depth {args.bits}-bit, near {args.near}, far {args.far})")
    if args.census:
        total = sum(census.values())
        print(f"visible-surface pixel census ({total} shaded pixels):")
        for name, count in census.most_common():
            print(f"  {name:10s} {count:8d}  {100.0 * count / total:6.2f}%")

    metrics = stripe_metrics(idbuf, mats, names, tris)
    print(f"siding field {metrics['fieldPixels']} px; "
          f"light slivers inside it {metrics['sliverPixels']} px "
          f"({100.0 * metrics['sliverPixels'] / max(metrics['fieldPixels'], 1):.2f}% of field)")
    if args.explain:
        print("guilty surfaces (material, plane normal, plane offset) -> sliver pixels:")
        for (name, normal, d), count in metrics["groups"].most_common(args.explain):
            lo, hi = metrics["extents"][(name, normal, d)]
            print(f"  {name:9s} n={normal} d={d:+.3f}  {count:6d} px "
                  f"({metrics['trianglesPerGroup'][(name, normal, d)]} tri) "
                  f"local {[float(c) for c in lo]}..{[float(c) for c in hi]}")
    if args.json:
        payload = {
            "variant": args.variant, "camera": args.camera,
            "size": [args.width, args.height], "cull": args.cull,
            "near": args.near, "far": args.far, "depthBits": args.bits,
            "census": dict(census),
            "sliverPixels": metrics["sliverPixels"],
            "fieldPixels": metrics["fieldPixels"],
            "guilty": [
                {"material": k[0], "normal": list(k[1]), "planeOffset": k[2], "pixels": v}
                for k, v in metrics["groups"].most_common(40)
            ],
        }
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2, sort_keys=True)
            handle.write("\n")
        print(f"wrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
