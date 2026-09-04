# r185 recipe: individual skinning instancing

## 1. Observed API surface

**VERIFIED.** The example uploads source vertices, skin indices/weights and per-instance
bone matrices to `StorageBufferAttribute`s; TSL `instanceIndex`, `vertexIndex`, `storage`,
`attributeArray`, `transformNormal`, `transformNormalToView`, `Fn`, `add`, `uint`, `vec4`,
`uniform`, and `color` run a compute skinning pass over `instanceCount * vertexCount`.
Each instance gets a different animation time while a CPU `AnimationMixer` updates the
source skeleton. Local r185 addon/core symbols include `StorageBufferAttribute` and TSL
storage/instance nodes; version `three` `0.185.1`.

## 2. Engine equivalent

**PARTIAL.** `src/rigged-operator-animation-runtime.ts:48-169` owns typed mixer/action
plans and `:231-306` applies additive bone poses. `src/operator-skin-tsl-materials.ts:239-315`
owns cached WebGPU skin materials, and `src/farcrysis-instancing.ts:4-55` owns bounded
InstancedMesh capacity. We do not yet compute individual bone matrices for a crowd in one
draw.

## 3. Applicability ranking

1. **Nuke Town/Raid — high:** one squad of authored bots/corpses if rig identity stays
  canonical and combat authority remains CPU/host-owned.
2. **Farcrysis — high:** open sightlines make crowds visible, but cap them aggressively.
3. **Terminal/RustRig — medium:** lobby/cinematic background crowds, not dense combat.
4. **Gun Range — low:** no crowd need.

## 4. Re-implementation plan

Create `src/rendering/rigged-crowd-instancing.ts` as a presentation adapter over the
existing operator rig/catalog. Start with 16 instances, shared geometry/material graphs,
and a storage buffer of bone matrices; one compute dispatch plus one draw per material role.
Budget: <=1.5 ms GPU p95 at 16 operators, <=12 MiB bone/vertex buffers, and no more than
four material-role pipelines. Animation phase, pose blend and per-instance appearance are
uniform/storage data; no shader variant per bot.

Deploy fence: precompile the exact rig/material set at menu-time, create/release pools only
at arena transition, and keep the CPU mixer/host authoritative. Tripwires: canonical rig
required, no primitive fallback, fixed capacity, no compute in paused/menu frames, and
corpses snapshot rather than simulate. Gates: bone-index bounds, matrix upload, animation
phase determinism, operator-skin contract tests, disposal, and draw/memory receipt. Estimate:
260-400 LOC and three focused test files.

Upstream: https://github.com/mrdoob/three.js/blob/r185/examples/webgpu_skinning_instancing_individual.html
