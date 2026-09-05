# Muse check — High Seas sampled-texture limit (pass95)

Skeptical read of the CLAIM UNDER TEST from
`docs/evidence/pass95/high-seas-bisect/REPORT.md`
(`origin/bisect/high-seas`). Code read at
`origin/contrib/dave-gaming-pc/claude/pass93-candidate`, read-only.
No builds, no browsers, no GPU, no source edits.

Claim-states: `[READ]` = lines actually read on the candidate ref.
`[REPORT]` = measured in the bisect report, not re-measured here.
`[INFERENCE]` = follows from read lines plus WebGPU/three.js semantics.
`[OPEN]` = could not settle by reading.

## Verdict

Core mechanism CONFIRMED with one correction and one open residue:

1. `render-runtime.ts:1325-1327` really requests the device with no
   `requiredLimits`, and the fallback ladder is real — CONFIRMED `[READ]`.
2. The fragment program plausibly binds 17 sampled textures on High Seas,
   but the exact 17-composition is NOT attributable from source alone —
   PARTLY CONFIRMED / residue `[OPEN]`.
3. No single lane commit in `1aad84ab..pass93-candidate` added a 17th
   sampler to the forward PBR program — the claim's implied
   single-culprit lane does not exist on first-parent history `[READ]`.
   This is CONSISTENT with the report's own cliff-edge account, not a
   refutation of the mechanism.
4. The proposed `requiredLimits`-from-`adapter.limits` fix with the ladder
   kept cannot regress a stricter adapter — SAFE `[READ]` + `[INFERENCE]` —
   with one implementation note (minimal GPU shapes need widening).

## (1) The device request — CONFIRMED `[READ]`

`src/rendering/render-runtime.ts` on the candidate ref:

```ts
1322:    const requiredFeatures = selectOptionalDeviceFeatures(adapter.features);
1323:    // Ask with the intersected list, and fall back to a bare device rather than
1324:    // killing the whole renderer if a driver rejects a feature it advertised.
1325:    const device = requiredFeatures.length > 0
1326:      ? await adapter.requestDevice({ requiredFeatures }).catch(() => adapter.requestDevice())
1327:      : await adapter.requestDevice();
```

- No `requiredLimits` anywhere in the file: the only other
  `requestDevice` mentions are the type shape (line 955) and comments
  (lines 1005, 1027, 1305) `[READ]` (`grep -n` for
  `requestDevice|requiredFeatures|requiredLimits`).
- Fallback ladder is exactly as the report says: featured request, catch
  to bare `requestDevice()`; bare request when the allowlist intersects
  to empty `[READ]`.
- Consequence is per WebGPU spec: limits not requested fall back to
  spec defaults, so `maxSampledTexturesPerShaderStage = 16` applies even
  though this machine's adapter advertises **48** `[READ]`
  (`docs/evidence/pass87/graphics-profiles/webgpu-adapter.json:74` on
  the candidate ref; the validation error quoted in the report says the
  same thing) `[REPORT]`.
- Rejection semantics that matter for the fix are already documented
  in-file: `selectOptionalDeviceFeatures` (lines 1025–1028) states
  "requesting a feature the adapter lacks makes `requestDevice` reject
  outright" `[READ]` — the same fail-or-fallback shape limits have, and
  the `.catch` ladder already absorbs it.

## (2) Where 17 fragment-stage textures come from — PARTLY CONFIRMED

Verified contributors that share ONE forward PBR fragment program with
the failing `renderPipeline_MAT_Pass65_Crossbow_Armor_PBR_1886`
(the Crossbow pipeline is the cascade victim: the report notes the
first error carries no material label, consistent with the batched
static arena material failing first `[REPORT]`):

| # | Sampler(s) | Source (candidate ref) | State |
|---|---|---|---|
| 1–5 | `map`, `normalMap`, `roughnessMap`, `metalnessMap`, `emissiveMap` on the weapon PBR material | `src/weapon-model.ts` `flattenMaterial` (~lines 980–996): preserves colour, normal, roughness, metalness, emissive maps; drops `aoMap`, forces opaque | `[READ]` |
| 6 | `aoMap` in full (non-flattened) mode — `flattenMaterial` exists precisely because reduced mode keeps the full response; the world variant cloned via `material.clone()` keeps whatever the asset binds | `src/weapon-model.ts` `instantiateWeaponAsset` (`flattenMaterials ? flattenMaterial(material) : material.clone()`) | `[READ]` code path; `[INFERENCE]` that the failing world presentation carries aoMap |
| 7 | `scene.environment` PMREM IBL texture, bound into every PBR fragment program | `src/rendering/arena-environment-ibl.ts` (`environmentTexture`, `pmremTarget`, `fromEquirectangular` via `three/webgpu` PMREMGenerator); `pass64-tsl-scene.ts` `syncArenaEnvironmentIbl` | `[READ]` files; `[INFERENCE]` count of 1 in-program |
| 8–15 | Shadow maps, up to `maximumShadowLights: 8`, 2048 px, plus sun | `src/rendering/arenas/high-seas.ts:157` (`shadows: { enabled: true, mapSize: 2048, … }`), `:167` (`maximumShadowLights: 8`); engine rig built with `makeShadowedLocal` so "every fixture casts a shadow" (`:39`), deck practicals `emissive-only` cast none (`:147`) | `[READ]` rig; `[INFERENCE]` one sampled depth texture per shadowed light in the forward program |

Budget: 5 (own) + 1 (aoMap, full mode) + 1 (IBL) + up to 8 (shadows)
= up to 15 before sun/cookies/resident-permutation extras — i.e. the
program sits exactly on the 16 cliff and any one additional resident
binding (second environment mip chain treatment, an extra shadowed
fixture admitted by distance, a permutation with an additional slot)
tips it to 17 `[INFERENCE]`.

Explicitly ruled OUT as in-program samplers on the candidate (read, not
assumed):

- Baked-indirect SH probe volume (`red/green/blue` `Data3DTexture`):
  the allocator exists (`src/rendering/lighting/baked-indirect-node.ts:98–130`,
  "one RGBA float 3D texture per colour channel") but has NO callers
  outside its own module/tests on the candidate (`git grep` for
  `buildBakedIndirectTextures|uploadBakedIndirectVolume` returns only
  the module itself) — 3 textures that are never bound `[READ]`. SH-L2
  wiring as a lane is absent too (`git log -S "SH_L2|sh-l2|shL2"` over
  the range is empty) `[READ]`.
- Ocean TSL (`src/water/ocean-tsl.ts`, 289 lines): analytic displacement
  plus scalar/vector uniforms only — no textures — and it is a separate
  water material, not the Crossbow program `[READ]`.
- `HIGH_SEAS_WATER` (`src/water/water-authoring.ts:121–138`): gameplay
  constants (level, amplitude, island, shore, palettes) — no samplers `[READ]`.
- Aerial perspective (`src/rendering/atmosphere/aerial-perspective.ts`):
  analytic TSL (`Fn/float/uniform/vec3/vec4`, uniforms at :446–452), no
  textures, and wired into the screen-space composite, not the forward
  program (`pass64-tsl-scene.ts` `withAtmosphere` diff hunk) `[READ]`.
- Clustered lights (`src/rendering/clustered-lights.ts`, 319 lines):
  light buffers/screen clusters — `grep` for texture/sampler/storage
  terms finds no sampled textures `[READ]`.
- Sky/IBL beyond the single environment texture: `scene.background` is
  not sampled by other materials' fragment stages `[INFERENCE]`.

Residue `[OPEN]`: without a GPU capture (Tint/WGPU inspector or a
`createShaderModule` dump of the failing permutation) the exact 17th
binding cannot be named from source. Candidates in order:
extra shadowed fixture admitted under `maximumDistance: 150`, aoMap on
the world weapon variant, environment second-sample. This does not
weaken the device-request finding — whatever the 17th is, the adapter
supports 48 and the runtime asked for 16.

## (3) The lane that added the 17th sampler — NO SINGLE CULPRIT `[READ]`

`git log -S` over `1aad84ab..origin/contrib/dave-gaming-pc/claude/pass93-candidate`
(70 first-parent commits) for `baked-indirect`, `albedo`,
`emissiveMap` (weapon), `new THREE.DataTexture` (rendering/materials):
every match resolves to exactly one commit —
`23b140c1 build(hitl6): integrate multiplayer-first candidate6 evidence`
(7068 files, +2.79M lines), a squash-integration, not a lane `[READ]`.
`SH_L2|sh-l2|shL2` and grime-decal pickaxes over the range are empty `[READ]`.

First-parent history specifically:

- `src/weapon-model.ts`: untouched in range (absent from the 26-file
  `1aad84ab..candidate` diff over rendering/weapon/water/high-seas) —
  the weapon's 5 maps are constant `[READ]`.
- `src/rendering/arenas/high-seas.ts`: shadow rig byte-identical at
  `1aad84ab` and candidate (`maximumShadowLights: 8`,
  `makeShadowedLocal` engine rig, emissive-only deck) `[READ]`.
- `src/high-seas.ts`: 2-line diff, spawn points only (`stern` array) `[READ]`.
- In-range forward-path changes: aerial-perspective composite wiring
  (screen-space, no samplers), water placeholder geometry fix, IBL
  bake-gating, `setAtmosphere` uniforms (`pass64-tsl-scene.ts` +48 hunk,
  read in full) `[READ]`.
- cold-path-2 (`87c3dd71`, per its merge subject: water placeholder
  vertex-contract fix, static batching hoist, async cold precompile,
  menu-time env prewarm) changes texture/pipeline RESIDENCY and timing
  at selection time, not any program's sampler count `[READ]` (subject;
  contents not separately audited).

So there is no "lane that added the 17th sampler" to name among the
ordinary suspects (clustered-lighting, sh-l2 wiring, albedo variation,
perf lanes): the program sat at the 16 boundary before the range and
the range only changed what is resident when it compiles. That is the
report's own §3/§8 account (16 as cliff edge; green recorded on a
smaller resident permutation set; bisect on exit code collapsing two
mechanisms onto `23b140c1`) — this read SUPPORTS that account and adds:
do not expect a revert of any single lane to remove the breach; follow
the report's prescription and bisect on error text ("queue completion
exceeded" = GOOD, "sampled textures (17)" = BAD).

## (4) Fix safety — SAFE, one implementation note

Proposed (report §5):

```ts
const requiredLimits = {
  maxSampledTexturesPerShaderStage: adapter.limits.maxSampledTexturesPerShaderStage,
};
const device = requiredFeatures.length > 0
  ? await adapter.requestDevice({ requiredFeatures, requiredLimits })
      .catch(() => adapter.requestDevice({ requiredLimits }))
      .catch(() => adapter.requestDevice())
  : await adapter.requestDevice({ requiredLimits }).catch(() => adapter.requestDevice());
```

- Cannot break a stricter adapter: requesting exactly what
  `adapter.limits` advertises can never exceed it, and if a driver
  rejects anyway the kept ladder degrades through
  limits-only to the current bare request — worst case is today's
  behavior, which is also the only behavior a 16-max adapter can ever
  have `[INFERENCE]` on spec rejection semantics + `[READ]` ladder shape.
- No double negotiation: the runtime hands the acquired `device`
  explicitly to `new WebGPURenderer({ …, device })`
  (`render-runtime.ts` ~1337–1346) `[READ]`, so three.js r185 does not
  re-request limits behind it.
- Implementation note `[READ]`: the file's minimal shapes do not model
  limits — `GpuAdapterShape` has no `limits` field and
  `requestDevice(descriptor?: { requiredFeatures })` accepts no
  `requiredLimits` (lines ~950–962). The fix needs the shapes widened
  (or a narrow local cast), otherwise it fails typecheck. No test,
  timeout, threshold, or config change is involved.
- Second half of report §5 (surface the rollback in `#status` so a
  GPU-rejected selection stops reading as a hang) is independent of the
  limits change and still recommended; the smoke's `deploy-failed`
  branch (`tests/e2e/pass74-arena-boot-smoke.spec.ts:154`) is the
  contract to match `[REPORT]`.
