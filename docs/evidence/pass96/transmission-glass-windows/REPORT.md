# REPORT — HF-486 transmission glass for nuketown2 window glazing

Lane: `contrib/dave-gaming-pc/claude/transmission-glass-windows`
Base: `origin/contrib/dave-gaming-pc/claude/pass93-candidate` (`465ae6b7`)
Date: 2026-09-04. Builder: Meta Muse Spark 1.3 (OMP, dave-gaming-pc).

## What changed (explicit paths)

- `src/nuketown2-materials/families/glass.ts` — the glass family now builds
  `MeshPhysicalNodeMaterial` with thin-walled physical transmission
  (`transmission` / `thickness` / `ior` scalars), a per-role roughness trim
  carried as a uniform node, and the same wear/grime/albedo graph as before.
  Both shipped roles stay opaque, so the transparent-queue contract is
  unchanged.
- `src/nuketown2-materials/index.ts` — `roofGlazing` (0xaebdc1, hex unchanged)
  moves from painted metal into the glass family
  (`transmission 0.6, thickness 0.05, roughnessTrim 0.05, opacity 1`);
  `coachGlass` (0x2b3d47, hex unchanged) gains
  (`transmission 0.45, thickness 0.05, opacity 1, polygonOffset -1` kept).
  Registry interface types for both roles become `MeshPhysicalNodeMaterial`.
- `src/nuketown2-pipeline-budget.test.ts` — `roofGlazing` leaves the
  unpanelled painted-metal sharing group; new pin that `roofGlazing` and
  `coachGlass` share one graph key; new `mustDiffer` pin
  (`roofGlazing` vs `sign`: glass vs painted metal).
- `src/nuketown2-materials/nuketown2-materials.test.ts` — the dielectric pin
  now covers both glazing roles (metalness 0, opaque, transmission > 0,
  thickness ≤ 0.1, IOR 1.5) plus the roof-over-coach transmission split.
- `src/nuketown2-transmission-glass.test.ts` — NEW. Acceptance pin:
  transmission-enabled, thin-walled, dielectric, opaque, uniform tint per
  role, no opacity node on either role, authored transmission values.

`src/legacy-main.ts` untouched (37,231 lines vs 37,396 ceiling).
No arena file touched: breakable-pane ids, colliders, ballistics unchanged.

## Upstream basis (HF-481)

- `docs/threejs-knowledge/upstream/llms-full.txt` is absent on this base, and
  `origin/contrib/dave-gaming-pc/claude/r185-techniques:docs/threejs-knowledge/r185/`
  carries no transmission recipe (INDEX.md ranks 8 other techniques; glass is
  not among them). So per the HF-481 order the authority is installed current
  source, three `0.185.1`:
  - `node_modules/three/src/materials/nodes/MeshPhysicalNodeMaterial.js` —
    `transmissionNode`/`thicknessNode`/`iorNode`, each defaulting to the
    scalar `transmission`/`thickness`/`ior` property. No refraction pass was
    written; the node material's own physical transmission is used.
  - `node_modules/three/src/materials/MeshPhysicalMaterial.js` — "When
    transmission is non-zero, `opacity` should be set to `1`." Both roles are
    opaque, exactly per this doc.
- Per-role values ride uniforms/scalars, so the generated WGSL is identical
  for both roles — the same mechanism `src/nuketown2-materials/wear.ts`
  `uniformSwatch` documents for colour. One graph, one pipeline.

## Claim states

- VERIFIED — both glazing roles are transmission-enabled dielectrics with
  per-role uniform tint. Gate:
  `npx vitest run src/nuketown2-transmission-glass.test.ts
  src/nuketown2-materials/nuketown2-materials.test.ts
  src/nuketown2-pipeline-budget.test.ts` → `Test Files 3 passed (3)` /
  `Tests 56 passed (56)`.
- VERIFIED — pipeline count unchanged (zero new graphs), still under the
  ceiling. The `roofGlazing == coachGlass` graph-key pin and the bounded-graph
  arena case pass in the same 56-test run above; the plain painted-metal
  graph persists for `sign/applianceRed/applianceBlue/busTrim`.
- VERIFIED — precompiled. `nuketown2` is already a member of
  `MEASURED_COLD_SESSION_FENCE_LOSERS` in
  `src/rendering/cold-session-precompile-reach.ts` (with `farcrysis`), so the
  reshaped glazing program is realised by the existing `precompileExactScenePass`
  relief, not in combat. Gate:
  `npx vitest run src/rendering/cold-session-precompile-reach.test.ts` (in the
  7-file run below) → passed.
- VERIFIED — fidelity green; breakable-window registration intact; prewarm
  contract intact; legacy-main ratchet intact; no settings-registry drift.
  Gate:
  `npx vitest run src/graphics-profile-contract.test.ts
  src/rendering/cold-session-precompile-reach.test.ts src/pipeline-metrics.test.ts
  src/nuketown2-fidelity.test.ts src/legacy-main-size-ratchet.test.ts
  src/nuketown2-glass-authority.test.ts src/presentation-prewarm-contract.test.ts`
  → `Test Files 7 passed (7)` / `Tests 84 passed (84)`.
- VERIFIED — typecheck clean. Gate: `npx tsc --noEmit` → exit 0, no output.
- DESIGNED (needs a capture) — the look itself. No GPU/browser on this lane
  (owner running ComfyUI; brief forbids browsers): the transmission values
  (0.6 roof / 0.45 coach, thickness 0.05, IOR 1.5) are authored, not
  capture-validated. Needs a headed review-camera capture of the south roof
  deck and the coach band before HITL sign-off.
- OPEN — yard-props `glazing` (glasshouse) deliberately untouched: its own
  factory comment pins it opaque-on-purpose for collider parity, a decision
  owned by another lane. A follow-up may route it through this family once
  that parity read is re-done.

## Defended decisions

- No settings-registry entry. The brief requires an off switch for a *new
  visual stage*; this lane adds no stage, no target, no pass — transmission
  is arithmetic inside the already-bound glazing program. Adding a registry
  key would trip the control-set hash for a material constant, i.e. exactly
  the decorative-control failure the graphics-profile contract exists to catch.
- Per-frame cost estimate: zero CPU work per frame (no update hook, no
  allocation; the factory returns materials and registers nothing) plus GPU
  cost of one transmissive sample in an already-drawn opaque program — the
  same cost class as the shipped glass shard material
  (`src/window-glass-debris-presentation.ts`, transmission 0.18, prewarmed).
  In-combat pipeline creations: 0 (nothing compiles at runtime; cold set is
  precompiled — see precompile claim above).
- `mat.type = 'MeshStandardMaterial'` kept on the physical material: the
  WebGL2 `shaderIDs` compat guard every family carries. Both glazing roles
  carry the same string, so the sharing key is unaffected.

## Review TODOs

- TODO (release/HITL): capture the south roof deck and coach-band review
  cameras on the permitted headed WebGPU route and verify that physical
  transmission reads correctly without obscuring the unchanged breakable
  window and ballistic contracts. No browser or GPU was run in this review.
