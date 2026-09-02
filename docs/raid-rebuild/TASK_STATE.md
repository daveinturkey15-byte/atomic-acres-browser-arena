# Raid Rebuild (`raid2`) — task state

Checkpoint file so a restart resumes rather than repeats. Lane AQ, HF-408.
Base 49f5ff6b, branch `contrib/dave-gaming-pc/claude/raid-rejig`,
worktree `C:\Users\david\projects\aa-claude-raid2`.

Claim-state on every row: VERIFIED (measured/ran here), CLAIMED, OPEN.

| # | step | state | evidence |
|---|---|---|---|
| 1 | Layout instrument built and run on all 7 arenas | VERIFIED | commit 439461c1, `artifacts/raid2/before-metrics.txt` |
| 2 | Diagnosis recorded (what "loads of walls" measures as) | VERIFIED | `SPATIAL_PLAN.md` §1 |
| 3 | Reference study written before any geometry | VERIFIED | `SPATIAL_PLAN.md` §2 |
| 4 | `src/raid2-arena.ts` built to the plan | VERIFIED | commit 78e435bd |
| 5 | Metrics inside every band in `SPATIAL_PLAN.md` §4 | VERIFIED | `artifacts/raid2/after-metrics.txt`; 14/14 bands |
| 6 | Registry / route / roster rows (`// RAID2:` marks) | VERIFIED | commits bc120f6d, 333a5733; `npx tsc --noEmit` clean |
| 7 | Spawn table from `scripts/qa/solve-spawn-layouts.ts` | VERIFIED | `--arenas raid2` reports "authored passes the gate"; 12/12 legal, span 20.0 m, cross-team 64 m, 0 LoS pairs |
| 8 | Visual module + judgeset cameras `src/rendering/arenas/raid2.ts` | VERIFIED | 10 cameras, mirrored into `scripts/qa/viewpoint-catalog.mjs` |
| 9 | Art-direction row above the distinctiveness floor | VERIFIED | 0.02562 vs 0.02157 floor (18.8% headroom), nearest gun-range; `art-direction.test.ts` 14/14 |
| 10 | `src/raid2-fidelity.test.ts` with derived bands | VERIFIED | 18/18 green |
| 11 | Collider/visual parity audit green on `raid2` | VERIFIED | 0 invisible colliders, 0 walk-through meshes |
| 12 | Walkable-surface parity green on `raid2` | VERIFIED | 39 walkable visuals, 39 supported, 0 fall-through |
| 13 | Eye-clearance stages 1-3 | PARTIAL | stage 1 VERIFIED (3177 legal hug spots, 5 colliders with no legal adjacent stance); stages 2-3 NOT RUN (browser stages), ledger entry is the -1 UNMEASURED sentinel so the ratchet stays RED for raid2 |
| 14 | Spawn-quality gate | VERIFIED | `src/spawn-layout-quality.test.ts` green after the spread fix |
| 15 | Headless boot smoke on the built bundle | VERIFIED | `PASS73_NATIVE_WEBGPU=1 playwright ... --grep raid2` -> "raid2: boots a clean visible solo match" (41.7 s), adapter nvidia/blackwell, headless |
| 16 | Menu preview capture through the sanctioned generator | OPEN | camera recipe authored (`source-assets/menu/pass87-raid2-preview/choreography.json`); NO clip encoded, so `raid2` is declared in `MEDIA_PENDING_ARENAS` with empty media paths and the card shows the standby frame |
| 17 | `npx tsc --noEmit` + focused vitest | VERIFIED | tsc clean; every touched test file green |
| 18 | Report | VERIFIED | `artifacts/lane-report.md` |
| 19 | Judgeset frames captured | VERIFIED | 10/10, `docs/evidence/pass85/lane-aq/judgeset/` |

## Decisions taken, so a restart does not relitigate them

1. **Bounds are unchanged at 100 × 76 m.** The owner's complaint is walls, not
   size, and the size is the one part of the prior spec that was derived rather
   than guessed.
2. **The fix is wall DISTRIBUTION, not wall quantity.** Measured: the shipped
   Raid carries mid-table wall footprint in 59 fragments. Deleting cover would
   make a worse map; consolidating it into ~24 architectural masses is the fix.
3. **The mansion is three big rooms around an open-to-sky courtyard**, with two
   interior partitions in the whole building. The shipped map's corridor spine
   and covered walks are what produced 36.7 % roofed ground.
4. **The laundry and gallery attach to the house.** One mass instead of three is
   both truer to a mansion and worth three clusters on the fragmentation metric.
5. **`raid2` ships beside `test2`, never replacing it.** Swapping ids is a later
   lane, after the owner has looked at the preview.
