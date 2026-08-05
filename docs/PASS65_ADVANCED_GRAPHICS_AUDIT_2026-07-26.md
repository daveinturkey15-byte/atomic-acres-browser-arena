# Pass 65 Advanced Graphics end-to-end audit

Base integration commit: `c6bc52df0201d459f7f6abdc35594180218bac3e`

Scope: the player-visible Quality / Performance / Custom surface and every control under Advanced Graphics, from registry and generated UI through normalization, persistence, runtime consumption, and telemetry. This audit did not publish, run GPU suites, or add unverified renderer features.

## Outcome

- The top-level surface is exactly Performance, Quality, Max and Custom under DEC-16. Advanced Graphics remains collapsed, bright/legible and registry-generated; named profiles default uncapped and Custom seeds transactionally from the last named profile.
- All 22 Advanced Graphics controls now have a checked runtime source probe and an effective telemetry path in `PASS65_RENDERER_FEATURE_INVENTORY.generated.md` and JSON.
- The generator and tests fail closed for missing controls, stale generated evidence, missing source files, or missing runtime symbols.
- Unsupported WebGPU features remain labelled unavailable instead of becoming decorative controls: hardware ray tracing/path tracing, SSGI, SSR, depth of field, motion blur, and vendor AI upscaling/frame generation.

### Native WebGPU GTAO contact shading

The installed Three.js r185 build includes a real WebGPU GTAO node. Pass 65 now exposes `Off / Low / High / Ultra` instead of leaving ambient contact shading in the compatibility-only gap. The pass consumes the principal scene depth plus an explicitly owned view-normal MRT attachment; tiers select bounded `8 / 12 / 16` sample budgets and `0.35 / 0.5 / 0.75` resolution scales. Performance and default Quality allocate neither the normal attachment nor GTAO target; Custom can opt into any tier and the named Max profile uses Ultra. The GTAO node and target dispose at the same generation-fenced arena boundary as the principal HDR pass.

The first native RTX 5080 multi-arena soak with GTAO High enabled did not lose the device, but it failed the 15-second Atomic input-ready transition after the fourth deployment while the identical no-GTAO control passed all eight deployments. That falsifier overrides the aspirational “all High by default” preference: GTAO remains a real, showcased Custom option but is not silently enabled in the stability-first Quality preset.

This does not relabel experimental SSGI, SSR, ray tracing or vendor-native reconstruction as complete. Those remain unavailable until their separate temporal/material/accessibility and hardware gates are real.

## Defects corrected

### Custom preset identity and independence

Symptom: changing an Advanced Graphics value while Geometry detail was Reduced persisted `preset: custom`, but the menu reported Performance. The same profile coupling silently capped Render scale at 75% and disabled selected shadows.

Cause: reduced presentation geometry selected the internal `performance` representation, and presentation-profile defaults were then reapplied over independent Custom values.

Correction: the active presentation resolver now distinguishes an internal geometry representation from an explicit player preset. Custom retains its label, selected 50-125% scale, shadow state, resolution, and update mode. Explicit `?render=performance|blender|compat` review routes remain bounded overrides and are labelled by their effective route.

Verify: `src/pass65-settings.test.ts` covers Custom + Reduced + 125% + dynamic 2048 shadows and explicit review overrides.

### Adaptive scale ceiling

Symptom: a Custom render scale below 65% could receive fixed Performance adaptive tiers above the player's selected cap.

Cause: the Performance ladder always inserted 55% and 65% before the configured cap.

Correction: adaptive tiers are generated as ratios of the selected cap, deduplicated, sorted, and capped. Public defaults still resolve to 55/65/75% for Performance and 65/75/85/100% for Quality.

Verify: `src/adaptive-quality.test.ts` asserts default ladders, a 50% single-tier floor, a 125% Custom ladder, fixed mode, and the invariant that no tier exceeds the selected cap.

### WebGPU reflection control

Symptom: Reflection quality changed environment intensity, but WebGPU deliberately has no generated RoomEnvironment, so materials without authored environment maps could show no change.

Cause: `envMapIntensity` was the only per-material reflection-quality property.

Correction: Off / Low / High now also attenuate real PBR direct-light specular response by moving bounded material roughness toward 1.0. Authored colour and metalness are unchanged; this does not claim SSR or ray tracing.

Verify: `src/graphics-refinement.test.ts` proves distinct High, Low, and Off roughness values with a WebGPU-equivalent no-environment setup.

## Controls checked without speculative changes

- Bloom Off/Subtle/Cinematic already enters the WebGPU TSL bloom node directly and remains distinct; the adaptive WebGL effects budget does not replace that TSL value.
- Film grain correctly treats arena-authored strength as 8-bit output steps and then applies the 0-100% player scale. It is not double-normalized.
- MSAA owns the principal HDR target; volumetrics change layer counts, opacity and dust draw range; smoke changes card detail; particles and decals change bounded pool budgets; anisotropy reaches texture properties; exposure/tone mapping/vignette reach the output pipeline.

## Verification

- Focused GTAO/settings/inventory suite: 31 tests passed across 6 files.
- Full unit suite: 1,332 tests passed across 193 files.
- TypeScript application and Worker lint: passed.
- Production build: passed.
- Generated renderer inventory check: passed, SHA-256 `ba15ec1365d8c869e6fd0b6bf4b8850de5cdc6f0f57b4a59ad9eb78be5d0a6c0`.

## Residual review boundary

Representative-hardware WebGPU visual comparison remains a HITL/release-gate activity. This audit establishes executable controls and deterministic evidence; it does not substitute screenshots or performance receipts from the target GPU. Unsupported options remain intentionally unavailable until their documented MRT, temporal-stability, accessibility, disposal, and frame-budget gates exist.
