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
| 4 | `src/raid2-arena.ts` built to the plan | pending | |
| 5 | Metrics inside every band in `SPATIAL_PLAN.md` §4 | pending | |
| 6 | Registry / route / roster rows (`// RAID2:` marks) | pending | |
| 7 | Spawn table from `scripts/qa/solve-spawn-layouts.ts` | pending | |
| 8 | Visual module + judgeset cameras `src/rendering/arenas/raid2.ts` | pending | |
| 9 | Art-direction row above the distinctiveness floor | pending | |
| 10 | `src/raid2-fidelity.test.ts` with derived bands | pending | |
| 11 | Collider/visual parity audit green on `raid2` | pending | |
| 12 | Walkable-surface parity green on `raid2` | pending | |
| 13 | Eye-clearance stages 1–3 | pending | |
| 14 | Spawn-quality gate | pending | |
| 15 | Headless boot smoke on the built bundle | pending | |
| 16 | Menu preview through the sanctioned generator | pending | |
| 17 | `npx tsc --noEmit` + focused vitest | pending | |
| 18 | Report | pending | |

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
