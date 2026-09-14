"""Measured fit report for the ten shipped interior GLBs — no Blender, no network, stdlib only.

`inspect_glb.py` answers "is the container sound". This answers the different question wave 3
opened and could not close: **does each asset fit the anchor footprint `house.ts` publishes, and
what exactly is sticking out**. It reads the shipped bytes, composes node transforms, and reports
per asset and — for an asset with a named defect — per node, so an overrun can be attributed to
the part that causes it instead of being recorded as a single number.

It also simulates the one repair the runtime adapter applies (`sofa-frame`'s double rotation,
ADAPTER M1) by re-composing that node's matrix at the sibling yaw and re-unioning the asset, which
is where the `after` column in the fit report comes from. The simulation is arithmetic on the
shipped geometry, not a re-export: it says what the loader's repair achieves today, and says
nothing about what a future Blender run would produce.

Usage:
    python scripts/blender/world-studio/interiors/fit_report.py [--json out.json]
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from inspect_glb import mat_mul, node_matrix, read_glb, transform_point  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
ASSET_DIR = os.path.join(REPO, "public", "assets", "world-studio", "blender", "interiors")

# `house.ts` ground-floor anchors for the teal house: (lx, lz, yaw, footprint width x depth).
# Spelled here because this tool is stdlib Python and cannot import the TypeScript; the runtime
# copy in `src/world-studio/interior-assets/fit.ts` is the authority and `catalog.test.ts` pins it
# against the built architecture. If the two ever disagree, house.ts wins and both are wrong.
ANCHORS = {
    "sofa": (5.4, -4.4, -math.pi / 2, (2.2, 0.9)),
    "coffee-table": (3.6, -4.4, 0.0, (1.2, 0.6)),
    "tv-unit": (1.0, -4.4, math.pi / 2, (1.6, 0.5)),
    "dining-table": (-3.4, -3.4, 0.0, (1.6, 1.0)),
    "kitchen-run": (-6.2, 5.2, math.pi / 2, (4.4, 0.65)),
}

ASSETS = [
    ("interior-hero-teal-living-kitchen", None),
    ("interior-prop-sofa", "sofa"),
    ("interior-prop-coffee-table", "coffee-table"),
    ("interior-prop-credenza", "tv-unit"),
    ("interior-prop-armchair", None),
    ("interior-prop-kitchen-run", "kitchen-run"),
    ("interior-prop-fridge", None),
    ("interior-prop-dinette", "dining-table"),
    ("interior-prop-area-rug", None),
    ("interior-prop-accents", None),
]

# The repair the loader applies. Keep in step with `fit.ts` REPAIRS.
REPAIR_NODE = "sofa-frame"
REPAIR_DEFECTIVE_YAW_DEG = 180.0
REPAIR_CORRECT_YAW_DEG = -90.0
IDENTITY = (1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)


def yaw_degrees(node: dict) -> float:
    """Yaw about +Y from a node's quaternion, in degrees. Nodes here carry TRS, not a matrix."""
    rot = node.get("rotation") or [0.0, 0.0, 0.0, 1.0]
    return math.degrees(2.0 * math.atan2(rot[1], rot[3]))


def yaw_quaternion(degrees: float) -> list[float]:
    half = math.radians(degrees) / 2.0
    return [0.0, math.sin(half), 0.0, math.cos(half)]


def primitive_box(gltf: dict, node: dict, world: tuple) -> tuple[list[float], list[float]] | None:
    """AABB of every primitive on `node`, transformed by `world`. Corners, not min/max alone."""
    if "mesh" not in node:
        return None
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    for primitive in gltf["meshes"][node["mesh"]]["primitives"]:
        accessor = gltf["accessors"][primitive["attributes"]["POSITION"]]
        pmin, pmax = accessor["min"], accessor["max"]
        for cx in (pmin[0], pmax[0]):
            for cy in (pmin[1], pmax[1]):
                for cz in (pmin[2], pmax[2]):
                    x, y, z = transform_point(world, (cx, cy, cz))
                    lo = [min(lo[0], x), min(lo[1], y), min(lo[2], z)]
                    hi = [max(hi[0], x), max(hi[1], y), max(hi[2], z)]
    return lo, hi


def node_boxes(gltf: dict, repair: bool = False) -> dict[str, tuple[list[float], list[float]]]:
    """Per-node world AABBs. With `repair`, `sofa-frame`'s yaw is re-composed at the sibling yaw."""
    boxes: dict[str, tuple[list[float], list[float]]] = {}
    nodes = gltf.get("nodes", [])

    def walk(index: int, parent: tuple) -> None:
        node = dict(nodes[index])
        if repair and node.get("name") == REPAIR_NODE:
            if abs(abs(yaw_degrees(node)) - REPAIR_DEFECTIVE_YAW_DEG) < 0.01:
                node["rotation"] = yaw_quaternion(REPAIR_CORRECT_YAW_DEG)
                node.pop("matrix", None)
        world = mat_mul(parent, node_matrix(node))
        box = primitive_box(gltf, node, world)
        if box is not None:
            boxes[node.get("name", f"node-{index}")] = box
        for child in node.get("children", []):
            walk(child, world)

    scene = gltf.get("scenes", [{}])[gltf.get("scene", 0)]
    for root in scene.get("nodes", []):
        walk(root, IDENTITY)
    return boxes


def union(boxes) -> tuple[list[float], list[float]]:
    lo = [math.inf] * 3
    hi = [-math.inf] * 3
    for blo, bhi in boxes:
        lo = [min(lo[axis], blo[axis]) for axis in range(3)]
        hi = [max(hi[axis], bhi[axis]) for axis in range(3)]
    return lo, hi


def declared_box(anchor_id: str) -> tuple[list[float], list[float]]:
    """The anchor footprint as a house-local X/Z box, with the anchor yaw applied to the extents."""
    lx, lz, yaw, (width, depth) = ANCHORS[anchor_id]
    turned = abs(abs(yaw) - math.pi / 2) < 1e-9
    span_x, span_z = (depth, width) if turned else (width, depth)
    return ([lx - span_x / 2, lz - span_z / 2], [lx + span_x / 2, lz + span_z / 2])


def overrun(box, anchor_id: str) -> dict:
    """Signed outward overrun on each of the four X/Z faces. Negative means inside the footprint."""
    (dmin, dmax) = declared_box(anchor_id)
    lo, hi = box
    return {
        "minX": round(dmin[0] - lo[0], 4),
        "maxX": round(hi[0] - dmax[0], 4),
        "minZ": round(dmin[1] - lo[2], 4),
        "maxZ": round(hi[2] - dmax[1], 4),
        "worst": round(max(dmin[0] - lo[0], hi[0] - dmax[0], dmin[1] - lo[2], hi[2] - dmax[1]), 4),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", help="also write the report as JSON")
    args = parser.parse_args()

    report = {"assets": [], "repair": {"node": REPAIR_NODE, "from": REPAIR_DEFECTIVE_YAW_DEG, "to": REPAIR_CORRECT_YAW_DEG}}
    print(f"{'asset':38} {'X span':>14} {'Z span':>14}  fit")
    for asset_id, anchor_id in ASSETS:
        path = os.path.join(ASSET_DIR, f"{asset_id}.glb")
        gltf, _ = read_glb(path)
        before = union(node_boxes(gltf).values())
        after = union(node_boxes(gltf, repair=True).values())
        row = {
            "id": asset_id,
            "anchorId": anchor_id,
            "boundsBefore": {"min": [round(v, 4) for v in before[0]], "max": [round(v, 4) for v in before[1]]},
            "boundsAfter": {"min": [round(v, 4) for v in after[0]], "max": [round(v, 4) for v in after[1]]},
            "repaired": [round(a, 4) for a in after[0] + after[1]] != [round(b, 4) for b in before[0] + before[1]],
        }
        if anchor_id is not None:
            row["declared"] = {"min": declared_box(anchor_id)[0], "max": declared_box(anchor_id)[1]}
            row["overrunBefore"] = overrun(before, anchor_id)
            row["overrunAfter"] = overrun(after, anchor_id)
            fit = f"worst {row['overrunBefore']['worst']:+.3f} -> {row['overrunAfter']['worst']:+.3f} m"
        else:
            fit = "no published anchor"
        report["assets"].append(row)
        print(
            f"{asset_id:38} "
            f"{after[1][0] - after[0][0]:>14.4f} {after[1][2] - after[0][2]:>14.4f}  {fit}"
        )

    sofa = os.path.join(ASSET_DIR, "interior-prop-sofa.glb")
    gltf, _ = read_glb(sofa)
    print("\nsofa per-node, repaired:")
    plain = node_boxes(gltf)
    fixed = node_boxes(gltf, repair=True)
    for name in sorted(plain):
        blo, bhi = plain[name]
        flo, fhi = fixed[name]
        mark = "  <== repaired" if [round(v, 4) for v in blo + bhi] != [round(v, 4) for v in flo + fhi] else ""
        print(f"  {name:22} X [{flo[0]:7.3f},{fhi[0]:7.3f}] Z [{flo[2]:7.3f},{fhi[2]:7.3f}]{mark}")
    report["sofaNodesAfter"] = {
        name: {"min": [round(v, 4) for v in box[0]], "max": [round(v, 4) for v in box[1]]} for name, box in fixed.items()
    }

    if args.json:
        with open(args.json, "w", encoding="utf-8") as handle:
            json.dump(report, handle, indent=2)
        print(f"\nwrote {args.json}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
