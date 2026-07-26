# Pass 65 Advanced Graphics end-to-end audit

Base integration commit: `c6bc52df0201d459f7f6abdc35594180218bac3e`

Scope: the player-visible Quality / Performance / Custom surface and every control under Advanced Graphics, from registry and generated UI through normalization, persistence, runtime consumption, and telemetry. This audit did not publish, run GPU suites, or add unverified renderer features.

## Outcome

- The top-level surface remains exactly Quality, Performance, and Custom. Advanced Graphics remains collapsed and registry-generated.
- All 21 Advanced Graphics controls now have a checked runtime source probe and an effective telemetry path in `PASS65_RENDERER_FEATURE_INVENTORY.generated.md` and JSON.
- The generator and tests fail closed for missing controls, stale generated evidence, missing source files, or missing runtime symbols.
- Unsupported WebGPU features remain labelled unavailable instead of becoming decorative controls: hardware ray tracing/path tracing, SSGI, SSR, depth of field, motion blur, and vendor AI upscaling/frame generation.

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

- Focused graphics suite: 45 tests passed across 8 files.
- Full unit suite: 1,318 tests passed across 190 files.
- TypeScript application and Worker lint: passed.
- Production build: passed.
- Generated renderer inventory check: passed, SHA-256 `c5e8a3814f350ab8521c02915fef37f6576f0359f23dee53b668264dd3b5b45e`.

## Residual review boundary

Representative-hardware WebGPU visual comparison remains a HITL/release-gate activity. This audit establishes executable controls and deterministic evidence; it does not substitute screenshots or performance receipts from the target GPU. Unsupported options remain intentionally unavailable until their documented MRT, temporal-stability, accessibility, disposal, and frame-budget gates exist.
