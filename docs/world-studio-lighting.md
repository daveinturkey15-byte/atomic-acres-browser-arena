# world-studio lighting adapter — integration instructions

Lane: `contrib/dave-gaming-pc/omp/lighting-author-20260912` (OMP, dave-gaming-pc).
Module: `src/world-studio/lighting/index.ts` (+ `lighting.test.ts`). Base: `401480f6d`+docs+`8bf4610ac`; continuation applied 2026-09-12 PM.
Status: implementation + focused CPU tests complete (25/25, `tsc --noEmit` 0). **Visual acceptance OPEN — the parent must render it.** Continuation addressed owner feedback "lamp pool but flat/even/pale" with fixture geometry, focal placement and a contrast retune (below); nothing here claims pixels were improved.

## What this is

An additive, presentation-only interior practical rig for the world-studio arena. It is the fix class for the observed flat interiors and flat-gray window panes (critic REPORT.md §2; confirmed by direct pixel read of all eight fourth-capture PNGs: near-equal wall/carpet/ceiling values, zero fixture points, windows reading as opaque panels). It is NOT a second sun, environment, exposure or tone-mapping path.

- 4 shadowed spot keys (living + bedroom per house), 256 px shadow maps, decay 2, intensity family 12–18 — inside the shipped practical family (`src/additional-maps.ts` range keys use 16–46).
- 10 unshadowed point fills (dining/kitchen/study/bedroom2/garage per house), tagged with the existing **clustered-local-light policy** (`userData.clusteredLocalLight = true`, finite distance, decay 2, named `clusteredSource`) — the sanctioned unshadowed shape in `src/rendering/light-occlusion.ts:63-74`, so `auditLocalLightOcclusion` reports zero violations.
- Per-room fill tints (`FILL_TINT`): service rooms (kitchen/garage/study) cool-neutral, dining/bedroom2 warm-neutral — chosen against `living-room-eye.png` so rooms stop reading as one flat cream field.
- Modes: `'presentation'` (shadowed keys) and `'preview'` (same plan, zero shadow maps; keys become clustered points). Honest naming: this is practical-light shadowing, NOT ray-traced GI/AO. Contact darkening at furniture scale comes from these lights' shadow maps plus the existing GTAO pass in `src/rendering/pass64-tsl-scene.ts` when enabled. No fake AO cards, no claims.
- Environment derivation is pure: `derivePracticalTuning(environment)` maps the frozen `StudioEnvironment` (hour/rain/snow/wetness + preset id) to `presence ∈ [1, 1.45]`, `warmth ∈ [0,1]`, `coldness ∈ [0,1]`. Clear noon is near-neutral (presence ≈ 1.06); spring-rain warms/boosts practicals (presence ≈ 1.23); winter-snow cools fills. Deterministic; module-init self-check sweeps all five frozen presets and throws on drift (pattern: `assertLightingConditionSafety`).

## What this is NOT (ownership)

- Does not create, move or scale `sunLight`/`ambientLight`/`hemisphereLight`/`fillLight`; does not touch `LightingConditionWrites`, `SHADOW_LIFT_GAIN`, `EXPOSURE_LIFT_GAIN`, fog, `scene.backgroundIntensity`, tone mapping or `toneMappingExposure`. The critic's `SHADOW_LIFT_GAIN 1.15` allegation was treated as untraced inference and nothing global was changed (per owner clarification: hour-12 key-drop may be zero; do not change a global gain on that claim).
- Does not touch ground/soil/yard/grass (other lane), vehicles, interiors geometry, weather routing, or the renderer.
- No clock: `update()` is argument-free, allocates nothing in steady state, and identity-caches on the frozen environment object exactly like `arena.ts` `lastEnvironment`.
- No new RAF loop, no renderer reads, no colour-space conversion of its own (colors are authored hex → `THREE.Color` working-space, same as every existing light in the repo; one tone map, the game's own).

## Parent hooks — exact insertion points

The runtime seam is three calls around the existing weather write. Current functions (read at sha `e25a938916233a3e4972e5f012580fa898bb00eb` + this lane):

1. **Create** — `src/legacy-main.ts`, in the block that already writes `target.root.userData.worldStudioEnvironment = route.environment` (function at legacy-main.ts:5060-5072, called on arena admission/weather change). After that line, when `target` is the world-studio arena root:

```ts
import { createStudioLighting, type StudioLightingController } from './world-studio/lighting';

let studioLighting: StudioLightingController | null = null;
// ...on world-studio admission:
studioLighting?.dispose();
studioLighting = createStudioLighting({
  root: target.root,
  scene,
  anchors: target.root.userData.furnitureAnchors as StudioInteriorAnchor[],
  mode: 'presentation',            // 'preview' for menu/review cheapness
});
```

2. **Update** — same place `applyLightingConditionUniforms()` is already called per frame (legacy-main.ts:31715-31716 region) or immediately after `arena.update(...)`:

```ts
studioLighting?.update(); // no-arg; identity-cached; no-op when weather unchanged
```

3. **Dispose** — wherever the arena root is retired (the existing retirement traversal already disposes light shadow maps; belt-and-braces): `studioLighting?.dispose(); studioLighting = null;`

The controller reads `root.userData.worldStudioEnvironment` itself, so the router needs **no** new call: whichever component owns admission just creates it, the frame loop calls `update()`, retirement disposes it. If a caller prefers explicit flow, pass `getEnvironment: () => route.environment`.

### Renderer ownership

The module never touches the renderer, render targets, tone mapping, or post chain. Parent keeps single ownership of the one exposure event (`LightingConditionWrites.exposureScale` → `applyLightingConditionUniforms`, legacy-main.ts:4374). If exposure ever needs a studio bias, it belongs in that existing path, not here.

### Weather-mode interaction

`applyStudioWeatherRoute` (legacy-main.ts:5060+) remains the sole writer of `worldStudioEnvironment`; the rig consumes the written object. Guest/host parity is inherited: the router resolves identical frozen presets from the shared seed, so both peers derive identical practical tuning. Offline preset override and `todhour` inspection flow through the same object.

## Budgets and limits (per rig, constant)

| Item | Value | Bound source |
|---|---|---|
| Shadowed spot keys | 4 (≤2 per house — skill ceiling "≤2 shadowed per chunk") | `STUDIO_LIGHTING_PRESET.maximumShadowLights` |
| Shadow maps | 4 × 256² (presentation), 0 (preview) | preset.shadowMapSize |
| Clustered fills | 10 (≤5 per house, ceiling "≤6 unshadowed per chunk") | `maximumFillLights` |
| Intensity range | 5 → 20 × presence ≤ 1.45 (≤ 29) | `derivePracticalTuning` bounds |
| Lights outside named rooms | 0 | `LIT_ROOMS` catalog |
| Per-frame allocation | none after first apply | identity cache |
| Materials created | 2 (fixture shell + glow, shared, instanced) | continuation 2026-09-12 |

Failure policy: throws on duplicate/invalid anchors, on key-count > budget (fail closed, never silently truncates), and at module init on any tuning bound drift.

## Verification (this lane; no browser per lane contract)

- `npx vitest run src/world-studio/lighting/lighting.test.ts` → **20/20 passed** (tuning bounds across all five presets; determinism; rain-warmer-than-noon; snow-cools-fills-only; kitchen-cooler-than-dining tint split; plan centroids/sorting; duplicate/NaN anchor throws; presentation 4 shadowed + occlusion-clean in both modes; presentationOnly/blocksShots tags on every node; environment-derived intensity with identity cache; repeated construct/dispose leaves scene child count unchanged; per-preset intensity finiteness/bounds; budget throw; default `worldStudioEnvironment` read).
- Neighbouring suites re-run clean after the tint refinement: `src/world-studio/arena.test.ts` + `src/world-studio/environment.test.ts` + `src/world-studio/weather-routing.test.ts` → 19/19.
- `npx tsc --noEmit` → **0 errors** (whole project, after the fix).
- Not run here (parent owns): browser render, frame pacing, visual regression captures. Suggested parent acceptance: re-capture `teal-living`/`yellow-living`/`teal-bedroom` and one street view; expect visible warm ceiling pools, a lit point in previously flat panes, and unchanged exteriors at overview distance. Ablation: mode `'preview'` vs `'presentation'`.

## Source / version / skill-to-consumer trace

Read evidence (native full-body reads this session, 2026-09-12):

- **Skills** (bodies read via canonical store paths; hashes in `SKILL_ALLOCATION.json`):
  - `threejs-webgpu-interior-lighting-look` → practicals budget table (≤2 shadowed / ≤6 unshadowed per chunk), "few real lights + emissive only beyond", post-chain single-ownership → consumer: light-count preset, fill policy, no-second-post stance.
  - `photoreal-procedural-scene-forge` → derived-not-tuned exposure, per-family ranges, competitive-game re-metering, "never weaken gates" → consumer: bounded tuning envelope, readability stance, honest no-GI claim.
  - `threejs-game-development` → version pinning, ownership map, change contract → consumer: this trace section, ownership list.
- **Upstream docs**: `https://threejs.org/docs/llms.txt` (read 2026-09-12; its import-map example cites three@0.186.0 — deliberately NOT used). APIs used (`SpotLight(color,intensity,distance,angle,penumbra,decay)`, `PointLight(color,intensity,distance,decay)`, `shadow.mapSize/bias/normalBias/radius`, `Object3D.traverse/clear`) verified against installed **three 0.185.1** (`node_modules/three`, `@types/three` 0.185.0; SpotLight/PointLight shadow API unchanged since ≤r155 physical-lights default). No r186+ API copied. Repo convention evidence: `src/arena-contrast-lighting.ts:166-201` (same constructor + shadow parameterisation), `src/rendering/light-occlusion.ts:27-31,63-74` (policies), `src/rendering/lighting-conditions.ts:544-553` (studio band [9.5,16.5], inspection profile), `src/world-studio/arena.ts:73-84` (environment identity-cache pattern), `src/world-studio/architecture/house.ts:985-994` (anchor rooms/floors), `legacy-main.ts:5060-5072` (environment writer).
- **Captures**: all eight `world-studio-*.png` under `captures/fourth/world-studio/` read as actual pixels (vision-capable route confirmed). Critic `REPORT.md` read; its ground/apron/furniture findings belong to other lanes and were not actioned here.
- **References**: `living-room-eye.png` read — intended hierarchy is warm sun pool + warm practical accents over mid-value carpet; shipped key color 0xffe9c8 and fill 0xeef2f6 chosen against it. (street-teal/street-yellow not separately consumed; street capture covered the exterior-window claim.)

## Continuation 2026-09-12 (same lane, same API)

Owner feedback after the parent's render: interior has a lamp pool but reads flat, evenly bright, pale. Changes, all inside this module:

1. **Visible fixtures.** Every practical now has geometry: pendant (mount+stem+open shade+bulb) in living/dining, flush disc (mount+lens) in kitchen/bedroom/bedroom2/study, batten (body+tube) in garage. One `InstancedMesh` per (kind, part): ≤8 draw calls total, 2 shared `MeshStandardMaterial`s (shell `0x2b2e33`, glow emissive `0xffe2ae` driven `1.2+0.8·presence ≤ 2.36`), `castShadow/receiveShadow` false, tagged `presentationOnly`/`blocksShots` like every light. Fixture origin = light position; pendant hangs 0.35 m below the ceiling line (`FIXTURE_DROP`), so pools read as fixture-produced.
2. **Focal placement.** `planStudioRoomPracticals` prefers the room's focal furniture anchor (exact `-<token>` id suffix per `FOCAL_TOKEN`, e.g. `<house>-coffee-table`) over the blind centroid; centroid stays the fallback. Positions are always actual authored anchor positions — never invented coordinates. Living pools now land over the coffee table.
3. **Local contrast.** Keys tightened: `SPOT_ANGLE` 0.7→0.5 rad, penumbra 0.7→0.45, `KEY_SPOT_BASE` 16→20, `BEDROOM_SPOT_BASE` 12→14, key distance 7.5→6.5. Fill wash reduced: `FILL_BASE` 8→6.5, `GARAGE_FILL_BASE` 6→5, fill distances 5.5→5 / 6→5.5. Net: brighter hotspot with faster falloff, dimmer even wash — richer local contrast without touching exposure, ambient, sun or tone mapping.

New tests: focal-over-centroid placement + centroid fallback; fixture instance/draw-call bounds (14 fixtures, ≤8 meshes, part instances 4×4+8×2+2×2=36); no shadow participation; glow emissive finite and ≤2.4 across all five frozen environments. Suite: **25/25** (`npx vitest run src/world-studio/lighting/lighting.test.ts`), `npx tsc --noEmit` **0 errors**.

Cost delta vs the table below: lights unchanged (4 shadowed + 10 clustered); +2 materials; ≤8 instanced fixture draw calls; ≤36 fixture part instances; triangles ≤ ~1.2k. `createStudioLighting` signature, `update()/telemetry()/dispose()` and all prior telemetry fields unchanged (`fixtures`, `fixtureDrawCalls` added).

## Residual risks / OPEN

- Practical placement uses per-room anchor centroids; ceiling heights are authored constants (`FIXTURE_HEIGHT`), not measured against every roof pitch — parent visual pass may want ±0.1 m nudges (constants only, no structure).
- Intensity is calibrated to the repo's decay-2 practical family, not to a rendered histogram; first render may want a one-number retune (`KEY_SPOT_BASE`/`FILL_BASE`).
- Windows read "lit from outside" only if glass is transparent enough at review angles; glass treatment itself is not this lane's file.
