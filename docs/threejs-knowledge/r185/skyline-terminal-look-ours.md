# Skyline-terminal look — local recipe (r185)

Small-map look work that reuses two shipped systems instead of adding any.

## 1. Baked albedo drift from a shared noise table

Upstream reference: three.js lighting/materials docs
(`https://threejs.org/docs/llms-full.txt` — large flat `MeshStandardMaterial`
surfaces need albedo breakup or they read as swatches); technique studied from
the r185 recipe tree (`docs/threejs-knowledge/r185/`, read with `git show`
from `origin/contrib/dave-gaming-pc/claude/r185-techniques`) and from our own
`noise-lut.ts` pattern (`git show
origin/contrib/dave-gaming-pc/claude/perf-hitl5:src/nuketown2-materials/noise-lut.ts`).

Ours (`src/terminal-albedo-lut.ts`, consumed in `terminalSurfaceTexture` /
`terminalSurfaceMaterial` in `src/additional-maps.ts`):

- One 256² single-channel tileable value-noise table, generated once on the
  CPU, shared by every surface. The nuketown2 tile feeds a TSL texture node
  per fragment; our surfaces are classic materials with canvas textures, so we
  sample the same kind of table at paint time and bake the drift in.
- One strength for everything: `TERMINAL_ALBEDO_VARIATION_STRENGTH = 0.07`,
  pinned onto each participating material's `userData` and asserted in
  `src/skyline-terminal-look.test.ts`.
- Only the three largest-surface patterns take it (terrazzo, concrete,
  panel); small prints keep their crispness. 16×16 overlay blocks over the
  256 px tile ≈ metre-scale drift once repeated over the apron.
- Per-frame cost: zero. No new pipeline, no new setting.

## 2. Hero signage as light sources

No upstream technique — repo idiom reuse. The overhead gate signs already
wear luminous crowns (`skyline-gate-sign-crown-*`, practicalMat); the two
hero boards did not. Two `detailBox` crowns in the same idiom
(`skyline-terminal-main-sign-crown`, `skyline-flight-display-crown`,
terminal-story cluster, performance detail). +2 static draws, existing
materials only.

## 3. Horizon-distance pin for aerial perspective

The shipped global tuning (`src/rendering/atmosphere/aerial-perspective.ts`)
is arena-independent; what the terminal needed was proof it composes with a
longer horizon. `SKYLINE_TERMINAL_HORIZON_DISTANCE_M = 120` (≈ 76 m apron
diagonal 107.5 m, rounded up, inside fog far 156) with per-tier assertions:
worst-case white-sun into-sun ≤ 0.12 ceiling (the per-channel clamp is the
mechanism this far out), representative across-sun blue ≥ 0.04 floor. No
constant changed.
