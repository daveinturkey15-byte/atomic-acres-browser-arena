# Lane J — eye-clearance RED triage (PASS 85)

Worktree `aa-claude-eyeclear`, branch
`contrib/dave-gaming-pc/claude/eye-clearance-triage`, base `75a4e508`.
Standing instruction: **triage, do not re-baseline.** No ceiling was raised;
two were lowered to their measured value and one unmeasured sentinel became its
first measurement — `ceiling-diff.txt` is the diff and the argument.

All numbers below were measured on dave-gaming-pc with headless native-WebGPU
Chrome, one browser at a time, with ComfyUI idle and at least 3,000 MiB of free
VRAM at launch.

## What was red, and what each row actually was

61 rows: 55 on gun-range, 6 on skyline-terminal.

| rows | arena | surface | before | class | fix | after |
|---|---|---|---|---|---|---|
| 51 | gun-range | `gun-range-test-bay-secure-door-leaf` | d = 0.000–0.050 m (19 stand / 19 prone / 13 crouch) | **(b) probe artefact** | stage 1 merges the state-posed door authority stage 2 probes | rows gone — the seats are illegal, so the sweep no longer emits them |
| 4 | gun-range | `gun-range-wallbang-panel-glass` / `-brick` | d = 0.052 / 0.000 m | **(c) intentional fixture** | named annotation `gun-range-wallbang-walkthrough-panels`, printed every run | 2 annotated rows at the shipped stride, 0 unannotated |
| 6 | skyline-terminal | `skyline-jetliner-engine-1` / `-2` | 0.067 m analytic, **0.035 m at the real camera seat** | **(a) real geometry clip** | nacelles seated against the wing underside (centre y 1.6 → 1.73) | 0 |

No row was left red, and none was accepted as an unfixed crawl space.

## Stage 2 (analytic sweep), all 8 arenas

| arena | spots | violations before | violations after | unannotated after | ceiling |
|---|---|---|---|---|---|
| atomic-acres | 3,511 | 15 | 15 | 15 | 15 |
| skyline-terminal | 3,770 | **6** | **0** | 0 | 0 (was 3) |
| rustworks-1v1 | 2,048 | 0 | 0 | 0 | 0 |
| gun-range | 2,944 → 2,904 | **55** | **2 (both annotated)** | **0** | 0 (was 2) |
| high-seas | 3,896 | 0 | 0 | 0 | 2 |
| test1 | 3,688 | 0 | 0 | 0 | 0 |
| test2 | 3,467 | 0 | 0 | 0 | 0 |
| map3 | 3,516 | 0 | 0 | 0 | 0 (was the −1 sentinel) |

`sweep-eye-clearance-live.mjs --check` exits **0**.

## Stage 3 (real player teleported, real camera seat re-probed)

`verify-eye-clearance-runtime.mjs --check` exits **0**, judged against the
shipped camera near plane (0.08 m, scraped from legacy-main).

| arena | before | after |
|---|---|---|
| atomic-acres | 15 → 2 remaining at 0.143 m | 15 → 6 remaining: 2 measured at 0.143 m, 4 UNVERIFIED (`stance-blocked:prone` on exterior-access-ramp) |
| skyline-terminal | 6 → 2 remaining at **0.035 m**, resolve at its 0.34 m push cap, seat y 1.661 | no flagged spot to check |
| gun-range | 55 → 5 remaining (1 door row at 0.15 m, 4 wallbang) | 2 remaining, both annotated, 0 unannotated |
| every other arena | 0 | 0 |

## Why the 51 are the instrument, not the map

`gun-range-test-bay-secure-door-leaf` is authored `solid: false, shots: false`
because its authority is the door **state**: `gunRangeTestBayDoorLeafBounds`
feeds both `gunRangeTestBayDoorDynamicColliders` (movement) and
`gunRangeTestBayDoorDynamicBallisticSurfaces` (shots), and `legacy-main`
splices the latter into `activeBallisticSurfaces` for gun-range. Stage 2 traced
the closed leaf (x 51.15 … 51.85) while stage 1's legality model could not see
it, so the sweep emitted hug spots at x = 51.10–51.12 — 0.03–0.05 m west of the
leaf face, where a 0.36–0.38 m stance capsule sits a third of a metre *inside*
the closed door.

Two independent pre-fix measurements say those seats are unreachable:

- stage 3 teleported the real player there and the mover pushed it out of the
  leaf to x = 51.00; 50 of the 51 rows resolved (`stage3-before.json`);
- the capture requested (51.10, 1.70, 8.64) and the camera seated at x = 51.00
  (`frames/seats-before.json`).

## Why the 6 are real, and worse than the analytic number said

The nacelle body spanned y 0.65 … 2.55 while the wing it hangs from is authored
at 2.68 … 2.96 (visual bounds and collision authority both measured), so the
engines floated 0.13 m clear of the wing and their 0.65 m belly left a prone
crawl space over a 0.61 m prone eye — 0.067 m, inside the camera's own 0.08 m
near plane.

Stage 3 was worse than the sweep, not better: with nothing lateral to give,
`resolveEyeClearance` pushed the camera **up into the nacelle** to its 0.34 m
cap (seat y 1.661 — a metre above the player's real eye) and still measured
0.035 m. `frames/skyline-nacelle-prone-a-before.png` is that view: nacelle
interior filling the screen. The matching `-after.png` shows the nacelle from
below with clear air between it and the near plane.

Seating the nacelle against the wing fixes the float and the clip together: top
lands exactly on 2.68, belly rises to 0.78, prone clearance 0.17 m — past the
0.15 m probe radius, so the runtime resolve no longer engages there.

## Files

| file | what |
|---|---|
| `before.json` | stage 2 over all 8 arenas before the fixes, every row with its surface |
| `after.json` | stage 2 over all 8 arenas after, with the annotated/unannotated split |
| `stage3-before.json` | stage 3 before |
| `stage3-after.json` | stage 3 after, with the `--check` verdict |
| `frames/*.png` | first-person frames from the flagged eye seats, before and after |
| `frames/seats-*.json` | resolved seat, stance and runtime clearance beside each frame |
| `stage3-verdict-on-pre-fix-rows.txt` | the new stage-3 near-plane verdict replayed on the pre-fix stage-3 rows — RED on exactly the two nacelle rows, so the verdict is not vacuous |
| `ceiling-diff.txt` | ledger ceiling diff, proving none was raised |
