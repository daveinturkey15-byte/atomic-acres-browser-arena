# Overnight plan — 2026-08-29 → 30, until 06:00

Owner-approved. Model: Fable 5, reasoning HIGH. Deliverable: a playable build
on GitHub Pages by 06:00 with checkpoints published through the night.
Rhythm: full suite + gates before every publish; screenshots reviewed with
eyes; no publish on red.

## Owner asks (do first)

1. Music effective volume to 35% of current, slider default 50% and mapping
   through it (bus coefficient 0.306 → ~0.107 at default; contract re-pinned
   as owner-tuned).
2. Chopper gunner: fix the HUD and its non-working damage.
3. The central bus becomes a REAL bus: walk-through interior, windows you
   can see and shoot through both ways, same footprint.
4. Street crates beside the bus lowered to jump-mountable height.
5. No camera clipping near walls / prone, across ALL maps — the long-time
   issue that regressed. Measured by driving the eye-clearance sweep
   violations toward zero everywhere, not by ledger rows.

## Approved plan items (in order after the asks)

6. Chrome 153 full-speed survival: admission repairs-then-retries instead of
   aborting on the first pipeline error; async pre-warm for late pipeline
   variants; measure 20 cold live sessions; target every session ending on
   WebGPU.
7. FPS/perf pass on both render routes (profile, cut worst costs, adaptive
   tuning).
8. Lighting polish: dead-black shadow sides, flat fills — against the HDR
   pins, not around them.
9. Sound-quality pass using the new audio telemetry (mix rebalance, weapon
   punch, ambience bed).
10. Streamline/refactor cadence: bounded extractions from legacy-main
    (33k lines), dead-code sweep from today's deletions.
11. Firefox compatibility check (release Firefox = WebGL2 route).
12. Nuketown polish backlog as time allows (ground textures, yard read).

## Morning deliverables

- Playable, published build; per-item report with measurements.
- Next-options list if finished early (drafted for owner review).
