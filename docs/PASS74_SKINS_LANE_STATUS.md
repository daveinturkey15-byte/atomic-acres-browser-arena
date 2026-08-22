# PASS74 SKINS LANE STATUS

## DONE (with evidence)
- Spec JSON: `source-assets/blender/pass74-operator-skin-specs.json` (142 lines, 7,058 bytes)
- Blender script: `scripts/blender/create-pass74-operator-archetype-skins.py` (60,827 bytes, last modified 2026-08-22 00:54)
- Operator skin catalog module: `src/operator-skin-catalog.ts` (106 lines, 5,370 bytes)
- Operator skin catalog test: `src/operator-skin-catalog.test.ts` (exists)

## PARTIAL (exists but unverified)
- None of the above items have been verified for correctness or completeness. The Blender script has not been observed to run and produce GLBs. The catalog test has not been observed to pass.

## NOT STARTED
- GLB generation: No GLB files found in `artifacts/blender-operator-skins/` (directory does not exist).
- Integration work:
    * Protocol skin field
    * Lobby pick UI
    * Replication of the chosen skin
    * buildOperator plumbing
    * Asset provenance manifest rows
    * Per-archetype review renders against the hit-proxy outline

## NOTE ON MINIMAX H3
MiniMax H3 was available but not used for this task, as it is a video model producing concept frames rather than game-ready textures, and there is no evidence of its use in this lane.
## 2026-08-22 — the pipeline runs, and three archetypes exist

Blender was actually executed for the first time on this lane. It failed, and the
failures were real defects in the authoring script rather than environment problems.

**1. Procedural objects were never linked into a collection.** Every accessory came
from `bpy.data.objects.new(...)` with no `objects.link(...)` anywhere in the script.
An unlinked object is not in the depsgraph, so:
  - `view_layer.update()` never refreshed its `matrix_world`, which kept its
    creation-time identity. The silhouette envelope was therefore measuring every
    accessory AT THE WORLD ORIGIN. The gate enforced nothing — it was fail-open —
    and the "breach" it reported (1.0676) was just an accessory's own half-height.
  - `obj.select_set(True)` in the export path raises for objects outside the view
    layer, so **no GLB could ever have been written**. That is why this lane had
    produced no asset despite the script compiling and passing review.

**2. An accessory hung 126 mm below the floor.** With transforms live, the map-case
thigh strap sat below the soles. The clamp's only lever was shrinking accessories,
which cannot fix a placement error and would have distorted an authored design to
compensate. Added `enforce_ground_plane`: any accessory below the body's own ground
contact is lifted by exactly its deficit. Deterministic, archetype-agnostic, and it
corrects a fault rather than relaxing a gate — the envelope still has to pass after.

**3. The envelope baseline was contaminated.** `build_archetype` applies proportion
edits before calling `enforce_silhouette_envelope`, which then measured its baseline
from the already-bulked body. Every archetype scored ~1.0 and the bulk multipliers
were structurally exempt from the cap that exists to bound them — symbiote passed at
1.0000/1.1 while carrying a 1.16 torso. The baseline now comes from the pristine bind
pose. This is a gameplay contract, not a modelling nicety: the hit proxy is the
canonical capsule, so a silhouette wider than it means shots that look like hits miss.

**4. Clamp failures are now actionable.** The old message named neither the driving
dimension nor the offending object. It now reports radius-vs-height, the per-attempt
trace (so a non-converging solver is distinguishable from a genuinely tight envelope),
top contributors at BOTH ends of the z-span, and the offender's full transform chain.
That instrumentation is what located defects 1–3; it stays in.

### Result, with the corrected gates in force

| archetype | measured / cap | clamped |
|---|---|---|
| explorer (Sunspire Wayfarer) | 1.0001 / 1.0 | false |
| symbiote (Carapace Bulwark) | 1.0022 / 1.1 | false |
| navalops (Tidewrack Operative) | 1.0000 / 1.0 | false |

Nine GLBs (three archetypes x LOD0/1/2), three review-render sets, three source
.blend files and three provenance manifests. Verified by parsing the GLB binaries
directly rather than trusting the receipts: **62 joints and 24 animation clips in
every file**, matching the canonical rig contract, with real LOD reduction
(explorer 8,558 -> 6,231 -> 3,949 triangles).

Observation, not a defect: file size is texture-dominated (LOD2 is 4.4 MB for 3,949
triangles, 12 embedded images shared across LODs). LODs cut vertex cost but not
texture cost. Worth addressing before these ever ship in a build.

### Still not done

Integration. Nothing imports these GLBs — no runtime loader, protocol field, lobby
affordance or replication path. Per HF-364 that is a STAGED asset, not a closed
defect, and the provenance manifests say so in `integrationStatus`.
