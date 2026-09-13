# Item 12 — the eye-clearance re-measure the brief asked for

The brief for item 12 says: "land it with the parity audit AND an eye-clearance
re-measure". The parity audit landed in `4b2360cf`; the re-measure did not, and
the first lane report did not list it as OPEN. The skeptic called that, correctly.

Run here: `QA_PORT=4184 npm run qa:eye-clearance`, headless installed Chrome
through `scripts/qa/run-with-preview-server.mjs`, against a build containing the
repaired nacelle authority. ComfyUI queue empty and 11.4 GB of GPU headroom at
launch.

## Why it matters for this item

`4b2360cf` grew the jetliner nacelle collision authority on `skyline-terminal`
from 1.90 m to 4.10 m on x, on both engines. That is 2.2 m of new SOLID on a
shipped arena, so it changes the geometry the eye-clearance sweep probes against
— which is exactly why the brief asked for the re-measure and not just the
parity audit.

## Stage 1 — analytic spot generation

    skyline-terminal: 176 colliders (0 floor, 0 state-posed dynamic authority)
                      -> 3764 legal hug spots (4 colliders with no legal adjacent stance)

## Stage 2 — live sweep

    skyline-terminal   spots=3764 traces=26348 VIOLATIONS=0 (unannotated 0) {}

Zero violations across 26,348 traces. The enlarged nacelle introduced no new
near-plane scrape anywhere on the arena.

## Stage 3 — runtime verification

    skyline-terminal   sweep=0 checked=0 REMAINING=0 (unannotated 0, measured 0, unverified 0) forced=3

    [forced] skyline-nacelle-prone-a  prone, settled in 22 frames, pushedM 0
    [forced] skyline-nacelle-prone-b  prone, settled in 18 frames, pushedM 0.1201
    [forced] skyline-nacelle-prone-c  prone, settled in 21 frames, pushedM 0

The three forced nacelle probes exist precisely because a clean stage 2 used to
remove an arena's runtime coverage (Lane J, 2026-09-02). All three achieve prone,
settle, and none is pushed out of the world: `pushedM` 0, 0.12 and 0 against the
0.15 m probe radius.

Verdict for item 12: the re-measure is clean on the arena whose collider changed.

## What the same run says about the REST of the pipeline

`npm run qa:eye-clearance` as a whole EXITS 1, and not because of this lane.
Full log: `eye-clearance-full-pipeline.txt` beside this file.

    atomic-acres       sweep=15 checked=11 REMAINING=8 (unannotated 8, measured 4, unverified 4)
    skyline-terminal   sweep=0  checked=0  REMAINING=0                                  forced=3
    rustworks-1v1      clean at stage 2, nothing to verify
    gun-range          sweep=2  checked=2  REMAINING=2 (unannotated 0 - both annotated intentional-fixture)
    high-seas          clean at stage 2
    test1              clean at stage 2
    test2              clean at stage 2
    map3               sweep=24 checked=24 REMAINING=0
    nuketown2          sweep=18 checked=18 REMAINING=7 (unannotated 7, measured 7)

The sharpest row, quoted from the run:

    [eye-clearance] nuketown2: the REAL camera seat [-24.92,0.748,-2.4] sits 0.003 m
    from nuketown2 north truck deck (prone), inside the 0.02 m near plane. The player
    sees through that surface after the runtime resolve has already had its say.
    Fix the geometry - the resolve is the backstop, not the answer.

ATTRIBUTION. Repairing item 9 - the near-plane scrape that had thrown on every
call since HF-410 replaced the numeric literal with a named constant in PASS 85 -
is what made stage 3 produce a verdict again after two passes. The verdict it
produces is red on two arenas this lane never touched:

  - `git log aa9befca..HEAD -- src/map.ts src/arena-*.ts src/physics.ts
    src/collision.ts src/gameplay.ts` is EMPTY.
  - the diff changes no probe radius and no threshold; `scripts/qa/sweep-eye-
    clearance-live.mjs` and `scripts/qa/eye-clearance-roster.mjs` are untouched.
  - the only behavioural change is that the scrape returns 0.02
    (`FIRST_PERSON_CAMERA_NEAR_METERS`, the shipped near plane) instead of
    throwing. A LOWER near plane is MORE permissive, so these rows would not have
    been fewer under the 0.08 the scrape last returned before HF-410.

So: newly VISIBLE, not newly caused. It belongs to whoever owns atomic-acres'
access ramps and nuketown2's north truck deck, and it is OPEN in the lane report
rather than annotated away here. Nothing was relaxed to make this run quieter.
