# Causal material response: analytic glass sky-sheen (2026-09-10)

## Observed regions (source-inferred, not proven pixels)

Prior matched A/B (`material-matched-findings.md`): six WebGPU views, identical
draw calls/triangles, whole-frame median-luminance shifts of only -0.02 to
-0.49 on 0..255. Dark glazing, flat pale vehicle paint and bright washed
siding persist. This candidate targets the glazing only.

## Falsifiable cause

`scene.environment` measures NULL on the WebGPU quality route (2026-08-30,
recorded in `src/rendering/arenas/test1.ts`, `test2.ts`, `map3.ts`). The forge
glass (`createForgeGlassMaterial`) is a `metalness 0 / roughness 0.06 /
clearcoat 1` dielectric whose reflection lobes therefore have no IBL source;
its tint (`0x243036`, linear ~0.02) and the shadowed cabin lining behind it
absorb the flat ambient fill. Prior a0/roughness nudges changed opacity, and
opacity is not illumination (per `MeshPhysicalMaterial` docs: physical
reflections need environment lighting), so dark-over-dark blending could not
lift the glass.

Falsifier: if a live probe ever shows `scene.environment !== null` with a
non-zero `environmentIntensity` on this route, the NULL-environment premise
falls and this sheen double-counts sky light.

## Hypothesis

An analytic sky reflection — world-up gradient (warm horizon `0xffd2a0` to
cool zenith `0x9ec4e8`) times dielectric reflectance `F0 + (1 - F0) * F`
with `F0 = 0.08` (base Fresnel plus the clearcoat lobe) — returns sky light
to the glazing without any sampler, pass, geometry, or material-instance
change. Normal-incidence glass keeps a legible F0 lift instead of transmitting
only the shadowed lining; grazing angles catch the sky. Strength `1.0` keeps
the grazing peak at or below linear 1.0, under the ~1.02 bloom threshold.

## Intervention (`src/vehicle-forge/materials.ts`)

`createForgeGlassMaterial` gains one `emissiveNode` built from already-imported
TSL terms (`normalWorld`, `normalView`, `positionViewDirection`, existing
`fresnel`). Tint, opacity, roughness and clearcoat graphs are byte-untouched;
transparent/depthWrite/DoubleSide render state is preserved; no new
attributes, samplers, instances, or passes.

## State

- SOURCE-INFERRED: the NULL-environment cause and the sheen arithmetic.
- VERIFIED: new `src/causal-material-response.test.ts` plus retained
  `glass-space`, `coherent-material-exposure` and tonal-transfer invariants.
- OPEN: pixel effect. Coordinator compares the coach side/front-porch glass
  region with the proven ablation helper before any broad six-view run. No
  third live probe was attempted; compiled node literals remain OPEN.
