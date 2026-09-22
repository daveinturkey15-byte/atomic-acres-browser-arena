# Overnight Day-3 note — newworld-prime (worker lane, NOT a CURRENT update)

Date: 2026-09-22 overnight (lease to 2026-09-23T04:00Z). Lane: `omp-newworld-prime-live-20260914`,
worktree `C:/Users/david/Desktop/stuff/aa-omp-newworld-prime-live`,
branch `contrib/dave-gaming-pc/omp/newworld-prime-live-20260914`.
Base: `402214b68` (PASS 97 density). `docs/handoff/CURRENT.json` untouched (integrator-owned).

## Commits on top of base

- `7977f80e2` gameplay verify-only: zero source edits. Day-2 authority healthy —
  spawn, 12.17 m walk, door-portal walk-through (shot-leaf blocks bullets, not players),
  `src/newworld-prime-interiors.test.ts` 15/15, collider-visual parity rows triaged as
  threshold artifacts (fence split-presentation, by-design hedge dressing, wall-backed chimney).
  Live WebGPU proof (installed Chrome, nvidia/blackwell): `artifacts/qa/overnight-20260922/gameplay/`.
- `72966704f` graphics: 4 owned files, +45/-11. Key 3.2→2.8, ambient up, mist/dust down
  (hues untouched); per-role roughness/metalness finishes; golden-dusk glow 1.6→1.9 on the
  emissive role only. `tsc` 0, viewpoint regression 23/23 unweakened, before/after captures
  in Performance+Quality (`graphics-before/`, `graphics-after/` local), FPS within probe
  variance, no structural cost. No authority/collider edits; no GLB regen; no other arenas.

## How to see it

Dev server (left running): `http://127.0.0.1:4201/` — serves this lane's tree.
Select the newworld-prime arena; Performance vs Quality in the graphics surface.

## Still OPEN (not claimed)

Visual, long-duration performance, and production acceptance. No publish, no merge, no
`main`/`gh-pages` push from this lane. Next step needs the integrator: registry readback,
`pipeline:handoff` capability gate, PR into `main` by the normal contribution path.
