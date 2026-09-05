# W4-374: Nuke backdrop and windows build report (pass95)

Branch: `contrib/dave-gaming-pc/muse/nuke-backdrop-and-windows`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (452d7aba).
Three commits, one per improvement, explicit paths. No browsers, no GPU.

## 1. Backdrop mountains — smoothed ridge profile [OBSERVED]

File: `src/nuketown-mountain-backdrop.ts` (commit 4d6bf4eb).

- Facet cause [INFERENCE]: the silhouette and tone stepped once per segment
  (hash jitter per segment index), reading as one flat plate per segment.
  Replaced with angle-continuous sine variation (`smoothVar`, integer
  frequencies so the ring closes exactly). Same variation range, no edges.
- Segments rise only where the silhouette is visible: main ridge 144→168,
  far range 120→144, foothills stay 108.
- Two-plane parallax: foothills are the near plane (haze 0.34); main ridge
  (0.6) + far range (0.82) are the far plane. Ring count unchanged.
- Atmospheric tint derived from the existing fog colour 0xb1c0be
  (nuketown2-lighting, fog 58..148 m), scaled 0.45 → 0x505656 so the haze
  keeps the fog hue while staying below the measured sky luminance (v4:
  raw fog at 0.73 luminance put a floor under the ridge above the sky).
  Distance fog tuning kept (RIDGE_FOG false, skirt scene-fogged).
- No new material family (same painted-ridge + skirt materials).
- Before/after [OBSERVED]: shipped tris 5280→5664 (<6000 ceiling), nuketown2
  tris 2976→3360, meshes 4/3 unchanged, coplanar 0.

## 2. House windows — frame depth + interior glow [OBSERVED]

File: `src/nuketown2-arena.ts` (commit 5e5862d7).

- Upper back power window gains the jamb reveals the upper front already
  carries (same trim recipe, +4 meshes as merged static geometry).
- Each ground front window gains an interior glow strip on the room face of
  its head band (+4 meshes), using the existing warmLight emissive hook
  (same material as the ceiling lenses).
- Glass family untouched (no transmission added); no new materials; the
  strips are solid:false/shots:false so cover, colliders and ballistics
  do not move. Back 5 mm beds into the head band (construction contact).
- Night note [INFERENCE]: the three sky presets
  (late-morning/golden-hour/overcast) include no night, so the strips ride
  the always-on practical hook like the ceiling lenses and read strongest
  at golden-hour/overcast.
- Before/after [OBSERVED]: fidelity 39/39, coplanar FINDINGS 0
  SAME-VISIBLE 0, verge bodies 45 (ceilings 36 furniture / 51 aggregate
  hold per the green fidelity gate).

## 3. Vehicle roofs — crown, rails, ribs [OBSERVED]

Files: `src/vehicle-forge/geometry.ts`, `build.ts`, `specs.ts`,
`src/nuketown2-arena.ts`, `src/nuketown2-fidelity.test.ts` (commit 26df4508,
test edit is a deliberate enumeration, strictness unchanged).

- Loft gains an optional per-spec transverse crown: coach +30 mm (peak 3.29
  inside the 3.3 box), truck cab +15 mm (peak 2.895 inside the 2.9 cab),
  sedan 0. Same stations/quads, so triangle topology is unchanged.
- New `roofRail` primitive + `roofRails` dressing, merged into the existing
  chrome bucket (coach pair z 1.7–7.5, cab pair z 1.9–4.3): no new
  material, draw calls unchanged (11 merged street meshes before and after).
- Cargo box gets four transverse roof ribs in its own skin (±0.9/±2.3 keep
  the 2x core seat clear; +0.9 m² plan area; roofY derivation, deck, treads
  untouched). Asymmetric list grows by exactly those four names, with reason.
- Before/after [OBSERVED]: forged tris 55224→55948, pipeline graphs stay
  within the 54 ceiling (budget test green), triangle fences hold
  (coach ≤10k, truck ≤6k), in-combat pipeline tripwire 0
  (graphics-settings-registry green).

## Verification quotes (end state, this worktree) [OBSERVED]

- `src/nuketown-mountain-backdrop.test.ts`: 4/4 pass.
- `src/vehicle-forge/vehicle-forge.test.ts` + `src/nuketown2-pipeline-budget.test.ts`: 26/26 pass.
- `src/nuketown2-fidelity.test.ts`: 39/39 pass.
- `src/nuketown2-breakable-windows.test.ts` + `src/nuketown2-glass-authority.test.ts`: 10/10 pass.
- `src/pipeline-metrics.test.ts` + `src/graphics-profile-contract.test.ts` + `src/legacy-main-size-ratchet.test.ts`: 20/20 pass.
- `src/graphics-settings-registry.test.ts` + `src/nuketown2-roofs.test.ts`: 19/19 pass.
- `src/minimap-semantic-layer.test.ts`: 4/4 pass (vehicle grouping absorbs ribs; macroSet unchanged).
- `npx tsx scripts/qa/find-coplanar-pairs.ts`: boxes=962, pairs=288, FINDINGS 0, SAME-VISIBLE 0 (FENCED 274, CONTACT 4, benign 10).
- `npx tsc --noEmit`: exit 0.
- legacy-main untouched (ratchet holds); no test/threshold weakened.

## Captures [OPEN]

No browser captures were taken in this session (no-browser constraint);
visual confirmation is [OPEN] for the integrator (reference critic frames
in `aa-claude-research/docs/evidence/pass94/gemini-reference-critic/`
remain the before-state).

## Session notes [OBSERVED]

- Power plan verified High performance (`8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c`).
- AKP adoption guard: PASS for OMP on dave-gaming-pc (with `--bootstrap`).
- `probe-w4-374.ts` used for before/after numbers was deleted before push;
  all commits use explicit paths.
