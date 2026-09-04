# r185 recipe: white furnace test

## 1. Observed API surface

**VERIFIED.** The example is a material diagnostic, not a game effect: a `MeshPhysicalMaterial`
grid varies roughness left-to-right and metalness top-to-bottom under a neutral environment
generated with `PMREMGenerator`. It uses `WebGPURenderer`, `Scene`, `PerspectiveCamera`,
`SphereGeometry`, `Color`, `Mesh`, and lil-gui. It deliberately imports `three` rather than
`three/webgpu` in the HTML; our WebGPU route must keep the project's explicit import rule.
Version: `0.185.1`.

## 2. Engine equivalent

**YES as material coverage, no dedicated furnace.** `src/nuketown2-materials/index.ts:120-178`
has role-owned node material families; `src/rendering/arena-environment-ibl.ts:89-135`
owns PMREM; `src/graphics-settings-registry.ts:352-424` owns reflection, environment and
tone controls. No automated neutral-material energy-conservation fixture is present.

## 3. Applicability ranking

1. **All arenas — high diagnostic value:** catches material/IBL regressions before visual
  polish review, especially Nuke Town and Raid's new surface families.
2. **Terminal/RustRig — medium:** validates metal/rough industrial roles.
3. **Farcrysis/Gun Range — medium:** validates broad ground/weapon material response.

## 4. Re-implementation plan

Create a test-only `tests/material-furnace-r185.spec.ts` or a non-shipping fixture under
`src/rendering/diagnostics/`. It should use existing material factories and a neutral
environment, not add runtime pipelines. Budget: one diagnostic scene, <0.4 ms CPU setup,
no shipped memory; roughness/metalness are uniform test inputs and every role is tested.

Deploy fence/tripwire: diagnostics are unreachable from gameplay/menu production bundles,
must not change renderer settings or assets, and must use the same WebGPU material path.
Gates: energy-conservation bounds, neutral-white albedo response, role coverage and a
source-level no-legacy-GLSL assertion. Estimate: 100-160 LOC plus fixtures.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_furnace_test.html
