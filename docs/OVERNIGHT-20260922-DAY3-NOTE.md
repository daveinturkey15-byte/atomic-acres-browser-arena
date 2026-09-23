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

## Day-4 (2026-09-23): gate-led completion

Fixed genuine newworld-prime gate findings; visuals re-verified stable.

- Spawns 3→6/team with cover/sight/floor/route (`authority.ts`): spawn gate
  newworld-prime fully green (179/181 suite-wide; only world-studio residuals).
- Fence authority per-bay (17 boxes matching panels, 0.12 m deep) + east
  chimney solid + 10 hedge walk-through ledger rows: parity gate
  newworld-prime fully green (only world-studio ghost/ledger residuals).
- world-studio factory added to the proxy sweep (was a hard TypeError);
- Soaks: 660/660 active samples x2 profiles, zero freezes/leaks, 0 page
  errors. Performance run logged GLTF blob-texture decode errors (quality
  run: zero); all GLB textures are embedded PNG, and the mid-soak frame
  shows no white/magenta untextured surfaces — transient headless-decode
  noise, residual, not a blocker.
- Viewpoint round: newworld-prime 5/5 shots; pixel diff vs Day-3 baseline is
  gloss-only on vehicle bands (yard 3.95/4.28%, rest ≤1.79/1.41%).
  Automated verdict blocked by pre-existing nuketown2 flat frames (other arena).
- Menu/lifecycle gates blocked environmentally (bundled Chromium has no
  WebGPU; menu 30 s timeout vs 55 s deploy).
- ESCALATED (owner call, both green impossible): frame-pacing policy forbids
  the raw whole-scene compile literal in startGame while the MAX-admission
  test requires the same literal in the same branch. Untouched by this lane.
- Manifest `acceptance/pass-97.json`: R2 back to pending (byte-untouched
  premise broken by Day-3/4 deltas, contracts re-verified), R3/R4/R5 pending
  with Day-4 evidence; standby expectations superseded by the Day-2
  selectable promotion (integrator/owner rewrite, not a worker edit).
