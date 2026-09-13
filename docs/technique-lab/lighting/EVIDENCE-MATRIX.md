# Lighting recovery — practical / contact / material evidence matrix

Lane `aa-night-integration-20260912` · branch `contrib/dave-gaming-pc/claude/night-integration-20260912`
· model `claude-opus-5` effort `xhigh` · 2026-09-13.

**Lane HEAD (preserved, unchanged):** `c0365a141d4fc1336dff48608b5334b9f05db367` (routed preflight
receipt `recovery-lighting-opus-xhigh-r1`). **Root reference:** `aa-world-studio` at
`8fbbbbdbf2305d776230ceb3765f7c695e2e3a1c`.

**Method.** CPU only: source reads, arithmetic, and the vitest suites this lane already defines.
No browser, GPU, Blender, renderer or build. Nothing here is a visual acceptance — every claim
below is either a source fact or an explicitly labelled inference.

**Lane vs root.** `git merge-base` is `861b6680`; the lane adds one checkpoint commit, root adds two
lifecycle commits (`1e0558c79`, `8fbbbbdb`). `src/world-studio/lighting/**`,
`src/world-studio/pbr-library.ts`, `src/world-studio/architecture/**`, `src/world-studio/interiors/**`
and `src/rendering/**` are **byte-identical** between the two HEADs, so tuning done here is tuning
against current root source and ports as a clean cherry-pick.

## Evidence matrix

| # | Blocker | Status | Evidence | In write scope | Action |
|---|---------|--------|----------|----------------|--------|
| 1 | Every "ceiling" practical floated **0.45 m** (ground rooms), **0.90 m** (upper rooms) and **0.84 m** (garage) below the ceiling it is modelled as bolted to | **Verified** | `lighting/index.ts` mounted at anchor `y` + 2.55 / 2.1 / 2.4. Authored planes: ground ceiling = `UPPER_FLOOR_Y - SLAB` = 3.30 − 0.22 = **3.08**; upper ceiling = `UPPER_CEILING_Y` = **6.30**; garage ceiling = `garage-roof` box underside = **3.30** (`architecture/house.ts:32-41,495-500,~842`). The same planes drive the baked contact AO (`house.ts:134,138` → `architecture/build.ts:103-116`). Anchors carry the storey floor line (0.08 / 3.30 / 0.06) | Yes | **Repaired** |
| 2 | Correcting the mount alone would dim ground rooms **−28%** and upper rooms **−51%** at the focal plane (inverse square over a longer throw) | **Verified** (arithmetic) | throw = mount height − fixture drop: living 2.20→2.65 m, bedroom/study/bedroom2 2.08→2.98 m, garage 2.35→3.19 m | Yes | **Repaired** — candela re-derived, `I' = I·(d'/d)²` |
| 3 | Arena visual definition declares world-studio practicals `policy: 'emissive-only', maximumDistance: 0, castsShadow: false`, while the shipped rig runs 4 `shadowed-local` + 10 clustered **active** local lights | **Verified mismatch, not enforced** | `rendering/arenas/world-studio.ts:12`. `ArenaContrastLighting.applyDefinition` only builds its *own* root from definition-authored lights, and returns early unless `profile === 'blender'` (`arena-contrast-lighting.ts:123-160`); it never walks the arena root, so nothing suppresses the rig today | **No** (`src/rendering/arenas/**`) | Documented — root decision |
| 4 | Rig ships **4** shadowed keys; the arena's declared budget is **3** (`budgets()` default, not overridden by world-studio) | **Verified** | `STUDIO_LIGHTING_PRESET.maximumShadowLights = 4` vs `rendering/arenas/shared.ts:31` + `arenas/world-studio.ts:18` | Preset is, the budget is not | **Not repaired** — see "Rejected repairs" |
| 5 | Exterior teal siding reads as wide dark stripes, not boards | **Verified by prior review** (screenshots, `docs/technique-lab/integration/MATERIAL_REVIEW.md`) — cause is the GLB texture generator `scripts/blender/world-studio/houses/house_textures.py:166` | No | Untouched |
| 6 | Road/ground reads as flat card colour | **Unresolved** | `pbr-library.ts` itself is correct for the installed three r185 (below). The ground wiring — which materials get the maps, and the authored `material.color` tint that multiplies the albedo — lives in `arena.ts:~120-140`, outside scope | Library yes, wiring no | Documented |
| 7 | Unshadowed clustered fills lighting through slabs and partitions ("washed out, no contact") | **Inferred, not measured** | 10 of 14 practicals are unshadowed `PointLight`s with 5–5.5 m range; room spacing is ~7–8 m horizontally but only ~0.7 m from a ground lamp to the upper floor slab. Back-face rejection (N·L<0) bounds most of it; the residual needs a frame to judge | Yes, but no safe CPU falsifier | Documented |

### Falsified during this pass

- **"Cloned PBR textures never reach the GPU."** `Texture.copy()` in the installed three **0.185.1**
  (`node_modules/three/build/three.core.js`) sets `needsUpdate = true`, and r185 clones share a
  `Source`, so `pbr-library.ts`'s clone-per-consumer sharing rule is correct as written. Colour
  space handling (albedo sRGB, normal/roughness `NoColorSpace`) is also correct. `pbr-library.ts`
  was left **unchanged**.
- **"The definition's `emissive-only` policy zeroes the studio practicals at runtime."** No code
  path applies a definition policy to the builder's lights (row 3).

## The repair — `src/world-studio/lighting/index.ts`

One coherent change: **mount the practicals on the authored ceiling without changing the light each
focal plane receives.**

1. `FIXTURE_HEIGHT` now comes from the house coordinate contract — `CLEAR_STOREY_HEIGHT = 3.00` for
   both storeys, `GARAGE_CLEAR_HEIGHT = 3.24` — instead of the standard residential numbers
   2.55 / 2.1 / 2.4 that pass 1 used.
2. `PASS1_FIXTURE_HEIGHT` records the old plane, and `baseIntensity` re-derives candela from it:
   `I' = I · (d'/d)²`, holding authored illuminance `E = I/d²` at the focal plane.
3. `lampY()` / `mountHeight()` / `fixtureKind()` replace the mount expression that was duplicated
   between the light loop and the fixture-instancing loop, so a lamp and its visible fixture can no
   longer drift apart.

Resulting candela (before the environment presence multiplier, ≤1.45):

| room | throw (pass 1 → now) | candela |
|------|----------------------|---------|
| living (pendant key) | 2.20 → 2.65 | 20.0 → 29.02 |
| bedroom (flush key) | 2.08 → 2.98 | 14.0 → 28.73 |
| dining (pendant fill) | 2.20 → 2.65 | 6.5 → 9.43 |
| kitchen (flush fill) | 2.53 → 2.98 | 6.5 → 9.02 |
| study, bedroom2 (flush fill) | 2.08 → 2.98 | 6.5 → 13.34 |
| garage (batten fill) | 2.35 → 3.19 | 5.0 → 9.21 |

Peak light intensity is 29.02 × 1.45 = **42.1**, still under the suite's 69.6 ceiling; the shadow,
draw-call, occlusion-policy and fixture-count budgets are untouched. No renderer state, no clock,
no global light, no gameplay, loader lifecycle or staging/retirement path is touched.

### Rejected repairs

- **Cutting shadowed keys 4 → 3** to satisfy row 4 would light one house's living room with a
  shadowed key and the other's without it — the two sides of the map are meant to be identical.
  The honest fix is at root: either override `maximumShadowLights` for this arena or drop a key
  pair. Not taken here.
- **Raising fill intensities to fight the ambient floor** (`ambientIntensity 0.6`, `sunIntensity
  2.62`, `arenas/world-studio.ts:10-11`). Plausible, but "how pale" is a frame judgement and this
  pass has no frame. Deliberately not guessed.

## Tests

Both files are inside the allowed write paths; no existing assertion was relaxed or deleted.

- `src/world-studio/lighting/lighting.test.ts` — four new tests in `practical mount plane`:
  anchors still sit on the exported house floor lines; every lamp hangs its own fixture drop below
  the authored ceiling (and pass 1's plane was ≥0.4 m below it); every visible fixture instance sits
  on a real lamp; the delivered illuminance equals pass 1's at every focal plane. The ceiling planes
  are **derived from the exported `GROUND_FLOOR_Y` / `UPPER_FLOOR_Y` / `UPPER_CEILING_Y` /
  `GARAGE_ROOF_Y`**, so a storey move fails this suite closed.
- `node node_modules/vitest/vitest.mjs run src/world-studio/lighting/lighting.test.ts` — **36/36 pass**.
- `node node_modules/vitest/vitest.mjs run src/world-studio/arena.test.ts
  src/world-studio/architecture/studio-architecture.test.ts src/world-studio/routing.test.ts` —
  **31/31 pass**.
- `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` — clean.

## Remaining mismatches and falsifiers

1. **Not visually accepted.** No frame was rendered. The claim proved here is geometric and
   photometric, not perceptual: it does not establish that the pools now read well.
2. **Falloff-window residual.** The compensation covers `1/d²` but not three's finite-`distance`
   window (`getDistanceAttenuation`). Measured residual at the focal plane: living ×0.971,
   bedroom ×0.933, dining ×0.916, kitchen ×0.874, study/bedroom2 ×0.811, garage ×0.842. Raising
   `baseDistance` in step with the throw would cancel it at the cost of a wider leak radius; left
   as an explicit trade for a frame to settle.
3. **Two constants are restated, not imported.** `SLAB` (0.22) and the garage roof thickness (0.2)
   are module-private in `house.ts`. The test cross-checks the ground ceiling against
   `UPPER_FLOOR_Y - 0.22`, but if `SLAB` changes alone, this rig drifts silently. Exporting `SLAB`
   is a one-line root change outside this scope.
4. **Falsifier for the repair.** Capture the `world-studio-west-living` and
   `world-studio-west-bedroom` review cameras (`arenas/world-studio.ts:24-26`). If the fixtures now
   intersect or clip through the ceiling slab, or the pools read dimmer than the pass-1 capture, the
   mount plane or the compensation is wrong and this change should be reverted as a unit, not tuned
   further.
5. **Falsifier for row 7.** A frame from `world-studio-west-bedroom` with the ground-floor
   practicals forced to zero. If the upper room looks materially the same, the fills are not leaking
   and the flat reading is ambient-driven, not occlusion-driven.
6. Rows 3, 4, 5 and 6 are untouched by design and remain open at root.
