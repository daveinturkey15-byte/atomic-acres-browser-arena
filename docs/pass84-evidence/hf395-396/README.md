# HF-395 / HF-396 evidence (pass 84, lane B)

Branch `contrib/dave-gaming-pc/claude/hf395-396-viewmodel`, base `ac0bc5f2`.
Everything the lane report cites lives here because `artifacts/` is gitignored
(`.gitignore:16`) and would not survive the merge.

## The matched A/B (HF-395)

Two runs of `scripts/qa/measure-viewmodel-penetration-cdp.mjs`, same build, same
instrument, **only `src/systems/viewmodel-surface-clip.ts` differing**: the base
commit's module (`base-v1-*`) against the delivered one (`repair-v3-*`).
297 of 327 rows are graded in BOTH runs (`valid`: the player was grounded and
the stance machine reached the requested stance). The 30 the instrument could
not pose are written out in full, marked `valid: false`, and excluded from every
graded number rather than silently averaged in.

| scenario | rows | penetrating | worst pen (m) | rows worse than the 12 mm bias, below floor | worst below floor (m) | rig fully erased | worst clipped fraction |
|---|---|---|---|---|---|---|---|
| atomic-acres/house-front-wall | 36 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0.012 -> 0.012 | 0 -> 0 | 0.623 -> 0.619 |
| atomic-acres/bus-van-gap | 36 | 2 -> 0 | 0.060 -> 0 | 0 -> 0 | 0.012 -> 0.012 | 7 -> 6 | 1 -> 1 |
| atomic-acres/garage-door | 12 | 12 -> 12 | 0.323 -> 0.323 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0.988 -> 0.988 |
| atomic-acres/west-fence-corner | 36 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0.012 -> 0.012 | 0 -> 0 | 0.883 -> 0.883 |
| atomic-acres/open-ground-down | 3 | 0 -> 0 | 0 -> 0 | 1 -> 0 | 0.471 -> 0.012 | 0 -> 0 | 0.083 -> 0.083 |
| atomic-acres/grass-slope-down | 36 | 0 -> 0 | 0 -> 0 | 12 -> 0 | 0.229 -> 0.012 | 0 -> 0 | 0.181 -> 0.191 |
| test2/zone-a-wall | 36 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0.012 -> 0.012 | 0 -> 0 | 0.007 -> 0.007 |
| test2/zone-b-court | 36 | 0 -> 0 | 0 -> 0 | 12 -> 0 | 0.599 -> 0.012 | 0 -> 0 | 0.083 -> 0.085 |
| test2/zone-c-wall | 36 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0.012 -> 0.012 | 0 -> 0 | 0.007 -> 0.007 |
| test2/upper-room | 30 | 0 -> 0 | 0 -> 0 | 12 -> 0 | 0.099 -> 0.012 | 0 -> 0 | 0.153 -> 0.154 |
| **TOTAL** | **297** | **14 -> 12** | **0.323 -> 0.323** | **37 -> 0** | **0.599 -> 0.012** | **7 -> 6** | **1 -> 1** |

0.012 m is exactly `VIEWMODEL_SURFACE_CLIP_BIAS_METERS`: the ground plane is
seated one bias below the floor on purpose, so it is the floor being CORRECT,
not the floor being missed.

Floor-plane verdict per stance, same 297 rows:

| stance | rows | rows worse than the bias | worst below floor (m) |
|---|---|---|---|
| stand | 97 | 37 -> 0 | 0.599 -> 0.012 |
| crouch | 97 | 0 -> 0 | 0.012 -> 0.012 |
| prone | 103 | 0 -> 0 | 0.012 -> 0.012 |

The floor was broken in exactly one stance, STANDING: the standing eye is
1.84 m up, outside the 1.4 m wall reach, so it got no ground plane at all.
Crouch (1.30 m) and prone (0.75 m) were inside that reach and always had one.

## Files

- `base-v1-summary.json` / `base-v1-rows.slim.json` - the BEFORE run (base commit's clip module).
- `repair-v3-summary.json` / `repair-v3-rows.slim.json` - the AFTER run (delivered clip module).
- `diagnose-before-carbine.json` / `diagnose-after-v2-carbine.json` -
  `scripts/qa/diagnose-viewmodel-clip-cdp.mjs`: the live clipping planes, the
  eye's signed distance to each, the tracked standing surface and the lowest
  drawn vertex, per pose. This is where the plane-count / plane-selection /
  stale-ground diagnosis comes from.
- `pipeline-compile-hf395-clip-v3.json` - the material-set tripwire on the
  delivered build: 0 shader modules and 0 render pipelines created during a 75 s
  combat window, 0.62% frozen. The plane count is a compile-time constant, so
  the clipping cache key cannot change per frame.
- `base-commit-rail-gaps.txt` - HF-396 rail gaps on the base commit's
  first-person GLBs, same geometric probe as the shipped contract.
- `base-commit-rail-gaps-all-variants.txt` - the same probe over the fp, world
  and drop LOD0 variants of all six weapons: 15 of 18 FAIL on the base commit
  (sniper's three pass), 18 of 18 pass on the delivered models.
- `rail-frames/` - headless hip screenshots of each flagged weapon on the
  delivered build, plus the capture's `after-frames.json`.

## Known residuals, recorded not hidden

- **atomic-acres/garage-door, 12 of 12 graded poses at 0.323 m.** The pose stands
  with its EYE inside a presentation dressing AABB (x 17.66..18.34,
  y 0.185..1.915, z -6.323..-5.677). No face of a box you are inside is a
  separating face, so no clip plane can fix it. The other 24 rows of that
  scenario are `valid: false` - the stance machine refuses to stand there.
  Owned by `src/rendering/arenas/**`, outside this lane.
- **atomic-acres/bus-van-gap, 6 graded poses with the rig entirely clipped
  (stand and crouch at yaw 90/120/150).** PRE-EXISTING: the base commit erases 7
  of the same rows. The eye sits in a gap narrower than the rig is wide, so the
  two opposed wall planes leave a slab the weapon does not fit in. The delivered
  build is strictly better here, and `worstClippedFraction` is now ratcheted so
  it cannot grow.
