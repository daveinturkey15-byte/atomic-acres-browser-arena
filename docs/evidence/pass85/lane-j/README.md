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
| — | — | (spot-count arithmetic) | 2,944 spots | — | — | 2,904 spots. The first report read that −40 as “the 40 removed were inside the door leaf”. It is not a count of leaf rows: measured against the base tree, **71** pre-fix spots leave a stance capsule overlapping the closed leaf and **0** post-fix ones do, while the deterministic thinning stride re-partitions the whole list (1,808 rows dropped, 1,782 different rows kept). −40 is net arithmetic; 71 → 0 is the measurement |
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

| arena | before | after (repair pass) |
|---|---|---|
| atomic-acres | 15 → 2 remaining at 0.143 m | 8 remaining: **4 measured** (0.143, 0.143, 0.150, 0.150) and 4 UNVERIFIED (`stance-blocked:prone` on exterior-access-ramp), capped at 4 by `unverifiedCeiling` |
| skyline-terminal | 6 → 2 remaining at **0.035 m**, resolve at its 0.34 m push cap, seat y 1.661 | no flagged spot — so **three forced probes** re-measure the nacelle seats every run: all prone, all settled, seat y 0.630, **nothing within the 0.15 m probe radius** |
| gun-range | 55 → 5 remaining (1 door row at 0.15 m, 4 wallbang) | 2 remaining, both annotated, 0 unannotated |
| every other arena | 0 | 0 |

The four atomic-acres UNVERIFIED rows are not a falling-body artefact: the body
lands and settles in 10–20 frames, and the real stance machine then refuses to
leave prone under the ramp overhang. The sweep's legality model says a player
can stand there; the shipped character controller says they cannot — the same
class-(b) gap as the gun-range door, on an arena this lane does not own.

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
lands exactly on 2.68, belly rises to 0.78, **analytic** prone clearance 0.17 m
— past the 0.15 m probe radius.

**What the runtime then does was re-measured, not deduced.** The first version
of this report said the resolve “no longer engages there at all”, and the
capture receipts beside it showed it engaging at all three sampled seats, two of
them pinned at the 0.34 m push cap. Both statements were wrong for the same
reason: `teleportPlayer` sets the eye and clears grounding, and the capture read
`cameraSeat()` four frames later — mid-fall, ~0.04 m below the 1.7 m teleport
height, then reasoned about as if it were a resolve push. Stage 3 now settles
the body before reading a seat, and three `forcedProbes` re-measure these exact
coordinates on every run because stage 2 no longer flags them:

| forced probe | achieved stance | settled | seat | resolve pushedM | nearest surface within 0.15 m |
|---|---|---|---|---|---|
| `skyline-nacelle-prone-a` (−0.63, 13.72) | prone | yes | (−0.63, **0.630**, 13.72) | 0.120 | none |
| `skyline-nacelle-prone-b` (0.75, 12.38) | prone | yes | (0.75, **0.630**, 12.38) | 0.146 | none |
| `skyline-nacelle-prone-c` (−0.63, −9.72) | prone | yes | (−0.63, **0.630**, −9.72) | 0.145 | none |

Byte-identical across two independent gate runs. So the honest claim is: the
resolve **does** still engage at these seats — but downward, away from the
belly, and the seat it produces has no surface within the probe radius at all.
Before the fix it pushed **upward, into the nacelle**, hit its cap, and left
0.035 m.

### Why it engages at all: the modelled eye is 0.14 m below the shipped camera

Found by settling the body. `src/legacy-main.ts` applies a flat floor standoff,
`camera.position.y = Math.max(player.position.y + 0.14, camera.position.y)`,
after bob/shake/trauma and *before* `resolveEyeClearance`. `player.position` is
the eye, so the shipped camera sits 0.14 m above the stance height every stage
in this pipeline models. Reproduced on three arenas and three stances in one
run: gun-range crouch 1.16 → seat 1.300 (pushedM 0); atomic-acres prone 0.61 →
0.505 with pushedM 0.245 (pre-push 0.7499); skyline prone 0.61 → 0.630 with
pushedM 0.120 (pre-push 0.7501).

The sweep is therefore **optimistic about overhead surfaces by 0.14 m** and
conservative about floor-level fringes by the same amount. That is why a
0.17 m analytic clearance still leaves the real camera 0.03 m under the belly
before the resolve pushes it down. Re-modelling the eye moves every arena's
numbers and needs its own pass, so it is **recorded and pinned**, not changed:
`docs/eye-clearance/ledger.json → eyeModelDivergence`, guarded by a contract
test that fails if the constant drifts.

## Files

| file | what |
|---|---|
| `before.json` | stage 2 over all 8 arenas before the fixes, every row with its surface |
| `after.json` | stage 2 over all 8 arenas after, with the annotated/unannotated split |
| `stage3-before.json` | stage 3 before |
| `stage3-after.json` | stage 3 after, with the `--check` verdict |
| `frames/*.png` | first-person frames from **7 representative eye seats** — one per triage class per surface (3 nacelle, 2 door, 2 wallbang), not one per row. The 61 rows are 3 surface classes; the seats JSON beside each frame is the load-bearing evidence, the frames are the picture of it. Two of the three nacelle *before/after* seats were read mid-fall and are superseded by the forced-probe table above. |
| `frames/seats-*.json` | resolved seat, stance and runtime clearance beside each frame |
| `stage3-verdict-on-pre-fix-rows.txt` | the new stage-3 near-plane verdict replayed on the pre-fix stage-3 rows — RED on exactly the two nacelle rows, so the verdict is not vacuous |
| `ceiling-diff.txt` | ledger ceiling diff, proving none was raised, plus the repair-pass addendum (maxRows 4 → 2, the new `unverifiedCeiling`, the new `forcedProbes`) |
| `stage3-unverified-ratchet-red.txt` | the new UNVERIFIED ratchet firing: with the allowance at 0, atomic-acres' four unmeasured rows fail the gate. Proof the cap is not decoration |
| `stage3-repair-green.txt` | the same gate at the measured allowance, EXIT 0 |
