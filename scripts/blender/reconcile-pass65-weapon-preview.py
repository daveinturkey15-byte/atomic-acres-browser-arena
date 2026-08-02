"""Replace selected canonical firearm roots with a reviewed bounded preview.

The preview authoring path intentionally writes a separate blend so a partial
corpus can never silently replace the 17-family source. This explicit second
step is fail-closed: it verifies six delivery roots per selected family, keeps
all unselected canonical roots, rebuilds the all-family evidence sheet, and
only then saves the canonical blend.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
SPEC_PATH = ROOT / "source-assets/blender/pass65-weapon-family-specs.json"
CANONICAL_BLEND = ROOT / "source-assets/blender/pass65-weapon-families.blend"
PREVIEW_BLEND = ROOT / "artifacts/blender-weapon-families/pass65-weapon-families-preview.blend"
REVIEW_ROOT = ROOT / "docs/assets/pass65-weapons/firearms"
REVIEW_WIDTH = 480
REVIEW_HEIGHT = 360
bpy.context.preferences.filepaths.save_version = 0

SPEC = json.loads(SPEC_PATH.read_text(encoding="utf-8"))
weapon_ids = tuple(
    value.strip()
    for value in os.environ.get("PASS65_WEAPON_RECONCILE_IDS", "").split(",")
    if value.strip()
)
if not weapon_ids:
    raise RuntimeError("PASS65_WEAPON_RECONCILE_IDS must select at least one reviewed preview family")
known_ids = {weapon["id"] for weapon in SPEC["weapons"]}
unknown_ids = sorted(set(weapon_ids) - known_ids)
if unknown_ids:
    raise RuntimeError(f"Unknown PASS65_WEAPON_RECONCILE_IDS: {', '.join(unknown_ids)}")
if not CANONICAL_BLEND.is_file() or not PREVIEW_BLEND.is_file():
    raise RuntimeError("Canonical and preview blends must both exist before reconciliation")


def roots_for(ids):
    return [
        obj for obj in bpy.data.objects
        if obj.parent is None and obj.get("weapon_id") in ids
    ]


def assert_delivery_set(roots, ids, label):
    expected_variants = {delivery["variant"] for delivery in SPEC["deliveries"]}
    for weapon_id in ids:
        family_roots = [root for root in roots if root.get("weapon_id") == weapon_id]
        variants = {root.get("delivery_variant") for root in family_roots}
        if len(family_roots) != len(expected_variants) or variants != expected_variants:
            raise RuntimeError(
                f"{label} {weapon_id} delivery roots are incomplete: "
                f"count={len(family_roots)} variants={sorted(str(value) for value in variants)}"
            )


def rebuild_contact_sheet():
    columns = 5
    rows = math.ceil(len(SPEC["weapons"]) / columns)
    sheet = bpy.data.images.new(
        "Pass65_WeaponFamily_CanonicalContactSheet",
        REVIEW_WIDTH * columns,
        REVIEW_HEIGHT * rows,
        alpha=True,
    )
    pixels = [0.0] * (REVIEW_WIDTH * columns * REVIEW_HEIGHT * rows * 4)
    loaded = []
    for index, weapon in enumerate(SPEC["weapons"]):
        path = REVIEW_ROOT / weapon["id"] / f"{weapon['id']}-hero-quarter.png"
        if not path.is_file():
            raise RuntimeError(f"Missing hero evidence while rebuilding canonical sheet: {path}")
        image = bpy.data.images.load(str(path), check_existing=False)
        loaded.append(image)
        if tuple(image.size) != (REVIEW_WIDTH, REVIEW_HEIGHT):
            raise RuntimeError(f"Unexpected hero evidence dimensions for {path}: {tuple(image.size)}")
        source = list(image.pixels[:])
        tile_x = (index % columns) * REVIEW_WIDTH
        tile_y = (rows - 1 - index // columns) * REVIEW_HEIGHT
        for row in range(REVIEW_HEIGHT):
            source_start = row * REVIEW_WIDTH * 4
            target_start = ((tile_y + row) * REVIEW_WIDTH * columns + tile_x) * 4
            pixels[target_start:target_start + REVIEW_WIDTH * 4] = source[source_start:source_start + REVIEW_WIDTH * 4]
    sheet.pixels = pixels
    sheet.file_format = "PNG"
    sheet.filepath_raw = str(REVIEW_ROOT / "pass65-weapon-family-contact-sheet.png")
    sheet.save()
    for image in loaded:
        bpy.data.images.remove(image)
    bpy.data.images.remove(sheet)


bpy.ops.wm.open_mainfile(filepath=str(CANONICAL_BLEND))
old_roots = roots_for(set(weapon_ids))
if old_roots:
    # Existing families may be replaced only as a complete delivery set. A new
    # family is admitted from the isolated preview when no canonical root with
    # that stable ID exists yet.
    assert_delivery_set(old_roots, {root.get("weapon_id") for root in old_roots}, "canonical")
    partially_present = {
        weapon_id for weapon_id in weapon_ids
        if 0 < len([root for root in old_roots if root.get("weapon_id") == weapon_id]) < len(SPEC["deliveries"])
    }
    if partially_present:
        raise RuntimeError(f"Partial canonical families cannot be reconciled: {sorted(partially_present)}")
for root in old_roots:
    for obj in reversed([root, *list(root.children_recursive)]):
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)

with bpy.data.libraries.load(str(PREVIEW_BLEND), link=False) as (data_from, data_to):
    data_to.objects = list(data_from.objects)
loaded_objects = [obj for obj in data_to.objects if obj is not None]
preview_roots = [
    obj for obj in loaded_objects
    if obj.parent is None and obj.get("weapon_id") in set(weapon_ids)
]
assert_delivery_set(preview_roots, set(weapon_ids), "preview")
desired_objects = set()
for root in preview_roots:
    desired_objects.add(root)
    desired_objects.update(root.children_recursive)
for obj in desired_objects:
    if not obj.users_collection:
        bpy.context.scene.collection.objects.link(obj)
for obj in loaded_objects:
    if obj not in desired_objects and obj.name in bpy.data.objects:
        bpy.data.objects.remove(obj, do_unlink=True)

all_ids = {weapon["id"] for weapon in SPEC["weapons"]}
canonical_roots = roots_for(all_ids)
assert_delivery_set(canonical_roots, all_ids, "reconciled canonical")
expected_root_count = len(SPEC["weapons"]) * len(SPEC["deliveries"])
if len(canonical_roots) != expected_root_count:
    raise RuntimeError(
        f"Reconciled canonical root count is {len(canonical_roots)}, expected {expected_root_count}"
    )

bpy.ops.wm.save_as_mainfile(filepath=str(CANONICAL_BLEND))
rebuild_contact_sheet()
print(f"PASS65_WEAPON_CANONICAL_RECONCILED ids={','.join(weapon_ids)} roots={len(canonical_roots)}")
print(f"BLEND={CANONICAL_BLEND}")
print(f"CONTACT_SHEET={REVIEW_ROOT / 'pass65-weapon-family-contact-sheet.png'}")
