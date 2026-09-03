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
| 10 | `src/raid2-fidelity.test.ts` with derived bands | VERIFIED | 24/24 green (18 original + reachability 19-21 + readability 22-23 + derived density band 8b) |
| 10b | Vertical REACHABILITY gate | VERIFIED (repair pass) | `scripts/qa/raid2-reachability.ts`. Pre-fix: U1 0/2600, U2 0/1907, U3 0/2872, U3B 0/230, U4 24/2240, U4B 0/190 reachable, 4/15 patrol points dead. Post-fix: **100% on all six regions, 15/15 patrol points**. The gate fails on the geometry as it was authored |
| 11 | Collider/visual parity audit green on `raid2` | VERIFIED | 0 invisible colliders, 0 walk-through meshes (212 colliders, 216 meshes) |
| 12 | Walkable-surface parity green on `raid2` | VERIFIED | 42 walkable visuals, 42 supported, 0 fall-through |
| 13 | Eye-clearance stages 1-3 | VERIFIED (repair pass) | all three run headless. Stage 1: 3216 legal spots, 4 colliders with no legal adjacent stance. Stage 2 first run: 13 violations, ALL of them `raid2 wing glazing` (a pane 0.3 m proud of a solid wall); stage 3 confirmed the runtime resolve could not clear any. Pane removed; stage 2 re-run 0 violations, stage 3 re-run 0 remaining. `docs/eye-clearance/ledger.json` ceilings.raid2 = **0**, a measured zero |
| 14 | Spawn-quality gate | VERIFIED | `src/spawn-layout-quality.test.ts` green after the spread fix |
| 15 | Headless boot smoke on the built bundle | VERIFIED | `PASS73_NATIVE_WEBGPU=1 playwright ... --grep raid2` -> "raid2: boots a clean visible solo match" (41.7 s), adapter nvidia/blackwell, headless |
| 16 | Menu preview capture through the sanctioned generator | VERIFIED (repair pass) | 240 frames at 2560x1440 through `generate-pass65-runtime-menu-previews.ts` (webgpu, hardware adapter, one resident arena root, raid2 constructed first, viewmodel hidden, exact first/final loop seam); encoded by the new `finalize-pass87-raid2-menu-preview.mjs` under its own cache key `pass87-raid2-preview-v1`, asserted byte-distinct from all nine other arenas. `raid2` REMOVED from `MEDIA_PENDING_ARENAS`, which is empty again |
| 16b | Deployment loading backdrop | VERIFIED (repair pass) | `public/assets/original/loading/raid2-loading.webp`, frame 180 of raid2's own capture, 1536x864 WebP q88, 63,840 bytes, 42.49 dB PSNR against its own master (floor 40.0), distinct from all nine others. This gap was found by running `qa:pass77:menu-previews`, which the lane had never run |
| 17 | `npx tsc --noEmit` + focused vitest | VERIFIED | tsc clean; every touched test file green |
| 18 | Report | VERIFIED | `artifacts/lane-report.md` |
| 19 | Judgeset frames captured | VERIFIED | 10/10 on the FINAL geometry, `docs/evidence/pass85/lane-aq/judgeset/`; near-black pixel fraction courtyard 21.1% -> 0.31%, overview 8.3% -> 0.11% |
| 20 | Two-client mp-lab run | PARTIAL (repair pass) | FUNCTIONAL half VERIFIED: two real headless clients join through the real lobby, both deploy, guest moves at 311 ms, 0 deadlocks, 0 console/page errors, join flow identical to the other arenas. TIMING half VOID: the harness's stall gate reports FAIL, but the run shared a GPU with 13.2/16.3 GB resident, and a control run on the SHIPPED Raid in the same session fails the same gate harder (3/5 stalls vs 1/4, 19.9/18.4 fps vs 21.7/19.7). Evidence + control: `docs/evidence/pass85/lane-aq/mp-lab/` |
| 21 | Arena sync time | OPEN | raid2 syncs in 73.5/81.4 s against test2's 51.7/49.9 s back to back under the same load - ~45-63% slower on a map with FEWER colliders (212 vs 307). Ratio is attributable, absolutes are not. Belongs with HF-417 / Lane H2, not with this lane |

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
