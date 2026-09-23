# Overnight pass 2026-09-23 → 2026-09-24 — newworld-prime lane (worker note)

Lane `omp-newworld-prime-live-20260914`, worktree `C:/Users/david/Desktop/stuff/aa-omp-newworld-prime-live`.
Lease extended to 2026-09-24T08:00Z by owner directive (Dave, evening 2026-09-23: "keep
working and refining the game overnight"). Lead: omp / glm-5.3-flash. Contributor-class
subagents recorded serving identity `meta/muse-spark-1.3-contributor`.

## Context

PR #72 (newworld-prime Day-3/4, PASS 97) was blocked on CI by three stacked causes:
1. UTF-8 mojibake in `src/world-studio/pbr-library.ts` → `qa:text-integrity` (fixed,
   `2d9783c7d`).
2. Stale PASS 97 Day-1 standby identity pins in `src/world-studio/routing.test.ts`
   superseded by the Day-2 selectable promotion. Owner call 2 authorized the
   expectation rewrite (`6158b2b30`, owner authorization Dave 2026-09-23).
3. Twenty-seven full-suite rows red across 20 files (measured locally and in CI run
   35897154066/35889872843): the union of promotion-completeness gaps, world-studio
   residuals inherited from the unmerged PASS 97 stack, and source-size ratchets.

## Tonight's plan (owner: refine the game overnight)

Close the suite rows by authoring real content, not by weakening gates:
- Menu-preview choreography for newworld-prime (authored recipe, poster pose).
- Loading-art curated picks (newworld-prime + the world-studio gap the same
  assertion exposed).
- Ambience identity rows (reusing already-authored repository-procedural beds).
- Ballistics shot-blocker authority for world-studio solids (real bug: plural
  `ballisticSurfaceIds` stamped but never read; 61/101 raycast meshes unrated).
- Vehicle triangle-budget census rows (measured, caps from measurement).
- Nuke Town spawn cover (deterministic cover troughs; both z=20 spawns were 7.77 m
  from qualifying cover).
- Diagnostics schema + D1 migration 0010 admitting world-studio and newworld-prime
  (world-studio match diagnostics were being REJECTED — live telemetry bug).
- Ratchet raises with CEILING_HISTORY entries (150 lines: PASS 97 density/interiors
  stack, 0 added lines from this lane's own commits).
- World-studio parity-gate ledger + unrated-surface fixes (in flight).

## Known deviations to disclose to the integrator

- `worker/migrations/0010_*.sql` and `scripts/generate-loading-poster.mjs` sit
  outside the lane's `allowedPaths` (worker/** and scripts/ root). Both are
  required by tests the lane must satisfy (diagnostics CHECK constraint; loading-art
  registry). Owner-authorized overnight run; flagged here for the routing record.
- `docs/evidence/pass95/killstreak-audio/inventory-baseline.json` showed float-noise
  churn (1.0000000000000009-style) from a stray tool run; reverted to HEAD, not
  committed.
- `src/ui/menu-preview-video.test.ts` "pins v15 …" row fails ONLY locally
  (skip-worktree ENOENT on a chopper evidence png); CI has the bytes and the row's
  remaining status must be read from CI, not from this worktree.

## Still open after tonight's first wave

- `src/rendering/art-direction.test.ts` world-studio vs rustworks-1v1 pairwise grade
  (0.0194 vs 5.5/255 floor): measured attempts to separate world-studio via
  saturation/contrast/scene-grade knobs are dead ends (those do not enter the probe
  chain; only cdl/crosstalk/split-tone do). This row needs the visual gauntlet loop
  with real captures — authored hue move candidates exist but each measured move
  collapsed a different neighbour pair (gun-range is the neutral control; acres is
  cream; the cool slots are owned by farcrysis/skyline/high-seas). Not forced.
- `src/ui/menu-preview-video.test.ts` v15 byte pin (see local-only note above).
- Owner calls 1 and 3 from the PR body (frame-pacing policy contradiction;
  re-queue-flow falsifier) remain owner adjudication, untouched.
