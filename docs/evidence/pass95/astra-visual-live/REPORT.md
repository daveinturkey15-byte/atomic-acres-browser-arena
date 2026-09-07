# Astra visual-live lane report — forged vehicle paint reads white

Lane: bounded ten-minute VISUAL MATERIAL REPAIR.
Owner checkout: `C:/Users/david/projects/aa-astra-pass95-visual-live`,
branch `contrib/dave-gaming-pc/codex/pass95-visual-live-fixes`, base `ae2959e2`.
Scope kept: `src/vehicle-forge/materials.ts` + `src/vehicle-forge/vehicle-forge.test.ts` only.
No change to `legacy-main.ts`, `scripts/qa`, any other checkout, or any ceiling/threshold.

## 1. Pixel failure (observed, not re-captured by this lane)

Hardware WebGPU quality captures of candidate `21efd6c1` (installed Chrome,
NVIDIA Blackwell, frame/camera receipts 10/10) in
`aa-astra-pass95-hitl/artifacts/astra-c9/quality-resume/nuketown2/`:

- Inspected: `nuketown2-vehicle-near.png`, `nuketown2-coach-elevation.png`.
  All vehicle bodies WHITE: navy saloons, cream/maroon coach, white/dark truck
  region, red driveway coupe. Glass renders dark grey, lamps/trim render, so
  the renderer evaluates node graphs — colour specifically is dropped, not
  lighting. Not inspected (naming only): `nuketown2-street-centre.png`,
  `nuketown2-truck-cab-near.png`, `nuketown2-overhead.png`.

## 2. Ownership trace (read, not assumed)

- `createForgePaintMaterial` (`src/vehicle-forge/materials.ts:101`) stored the
  correct linear colour ONLY in a per-material `TSL.uniform`; `material.color`
  stayed default white; `userData.forgePaintSrgb` / `forgePaintUniform` set.
- No runtime replacement/promotion of `colorNode` exists: every `colorNode =`
  in `src/` is inside a material factory (verified by repo-wide grep).
- Graph reuse does NOT share a wrong uniform: each forge paint owns its
  `TSL.uniform(new THREE.Vector3(...))`; the pipeline-budget gate proves
  per-livery values with one shared graph shape. Untouched.
- The colour-reading boundary IS real and in-repo:
  - `batchDisplayColor` / `materialBatchKey` (`src/art-kit.ts:61-93`) read ONLY
    `material.color`. Forge paint was the sole Nuke Town paint family that left
    it white (every `nuketown2-materials/families/*` factory does
    `mat.color.setHex(baseSrgb)` with the comment that the compat path and the
    fidelity gate read `material.color`).
  - Consequences: in every simplify batch mode the paints bake to white
    Lambert/Basic; in `preserve` mode all seven Pass-95 paints/accents (same
    type, same white `color`, same roughness/metalness) share ONE
    `materialBatchKey` and merge into a single mesh/material.
  - `batchSelectedArenaPresentation` (`src/legacy-main.ts:36977`, read-only)
    runs `batchStaticMeshes` over the arena root with no nuketown2 exemption,
    so forged meshes pass through this key.
- r185 `NodeMaterial` contract (upstream source, tag `r185`): `colorNode`
  OVERWRITES the diffuse inferred from `color` — so the direct WebGPU path is
  unaffected by mirroring the swatch, and white can only arrive via a
  colour-reading conversion, which is exactly what the captures show.
- `tagCompatibility` (`material.type = ...`) is a silent no-op on node
  materials (r185 `NodeMaterial` defines `set type(_value){}`); noted, not
  changed — compat routing is another lane's contract.

## 3. Fix (narrow, sharing-preserving)

`src/vehicle-forge/materials.ts` — one line plus comment in
`createForgePaintMaterial`: `material.color.copy(base)` where `base` is the
same linear swatch already fed to the uniform.

- Same authored hex, no art-colour compensation; metalness 0, roughness 0.2,
  clearcoat, `specularIntensity` 0.08, dust film untouched.
- Node graph textually unchanged: same uniform-carried topology, same program
  cache keys — the 52-pipeline budget is not moved.
- Fixes white in every simplify/compat read path and de-collides the
  preserve-mode batch key (distinct hex per livery). No caller migration
  needed; nothing else reads paint `color` as white by design (verified:
  `forgePaintUniform` consumers are only the budget gate + userData checks).
- No collision/authority touch: presentation-only module, geometry unchanged.

## 4. Regression test (producer side of the boundary)

`src/vehicle-forge/vehicle-forge.test.ts` — new `vehicle-forge paint batch
contract` describe over all six Pass-95 liveries
(`0x173451 0xe7dec6 0xa8382c 0xf2ede2 0x2b3138 0x9e1c1c`):

- `material.color` matches `setHex(hex, SRGBColorSpace)` per channel;
- `colorNode` still present, `forgePaintUniform`/`forgePaintSrgb`/`forgeRole`
  intact (graph-sharing contract not regressed);
- all six `color.getHexString()` reads distinct (batch keys de-collide).
  Fails before the fix (white, one shared read), passes after.

## 5. Verification status — tests OPEN for root

- NOT run here: `node_modules` is absent in this checkout and the brief
  forbids installs, builds, browsers, and further agents. No test, typecheck,
  or capture was executed by this lane; the new gate is written for root's
  pass (`npm run pipeline:preflight`, affected vitest files, fresh quality
  captures of navy/cream/maroon/red bodies).
- No verifier, threshold, or assertion weakened; existing gates unedited.

## 6. Separate report: black roofs (not fixed, likely unrelated)

- `nuketown2-coach-elevation.png` also shows a pure-black band on the HOUSE
  roof behind the coach. House roofs are not forge materials, and forge roofs
  are loft body geometry in the `paint` bucket (verified in
  `src/vehicle-forge/build.ts:384-563` — no bucket misrouting), so a
  paint-bucket error cannot blacken house roofs. Suspect a roof-family or
  lighting/grade path outside this lane's ownership. Left for its owner; this
  lane changed no roof, glass, or lighting code.

## 7. No `legacy-main.ts` change required

The fix is producer-side; the batcher and boot path are untouched. No
proposed edit to report.

ASTRA-LANE-DONE
