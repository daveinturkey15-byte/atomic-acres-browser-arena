# Architectural finish roles — HF570

VERIFIED implementation: `lapSidingParts` accepts an optional `jointRole`; its
default remains `reveal`. `facadeElevationParts` forwards the option only to
sided piers. Window liners, parked door leaves and sectional door heads retain
their original roles and geometry. The arena adapter resolves the requested
role to an existing material instance.

The house front and garage front are distinct real consumers: different wall
extents, heights, opening sets and door treatments. The direct side/back wall
consumers use the same option. Cream joints borrow the existing sign finish;
upper joints resolve to fence timber on the orange house and sign on its cream
partner. Four lamp shafts also reuse the sign's painted-metal finish. The
existing sign board/mailbox remain independent uses of that material. No new
material factory, shader graph, sampler, geometry or per-frame callback is added.

VERIFIED baseline pixels: narrow siding joints read as broken dark dashes in
Performance; High lamp shafts show conspicuous pitted chrome highlights.
VERIFIED measurements: joints are 4 mm high and their front faces sit 20 mm
behind the boards. The old 30 mm comment described the geometry incorrectly.
INFERENCE: lowering the joints' contrast and removing automotive relief from
architectural shafts should reduce those distractions. Pixel improvement,
runtime costs and owner taste remain OPEN until independent fixed-view review.

| Evidence at dispatch `c710fc3deff03438ba487b9c995c6959ed741b58` | Frozen value |
|---|---:|
| All source and generated meshes | 3,858 |
| Sum of mesh geometry triangles (not GPU frame triangles) | 188,480 |
| Unique geometry objects / material instances | 3,826 / 94 |
| Authored meshes / generated batch meshes | 3,803 / 55 |
| Visible base-geometry triangles before instancing | 148,028 |
| Instanced meshes with pinned transforms and colours | 49 |
| Movement / physics colliders | 369 / 373 |
| Raycast meshes / shot surfaces | 389 / 389 |
| Patrol points / breakable windows | 15 / 8 |

`src/completion-architectural-finish.test.ts` pins complete authority values,
authored geometry attributes and transforms, the instance arrays, material
inventory, and a sorted multiset of visible triangle attributes, winding and
shadow state. Material reassignment changes batch membership, so individual
batch hashes are unsuitable for geometry identity. The source geometry and the
final triangle multiset must both remain identical; counts alone are insufficient.
The baseline authority SHA-256 is
`90887b6cbcbf8f57d81999580a84e869f40e9ec9cb60806343adca957ac66724`.
Its visible-triangle digest is
`02464c9c1efe450342ad1506de2fcf6b47f354e490ebaec4bcd6b10fbf390db6`.
The test records the remaining digests. Baselines were measured before edits;
the triangle normalization was additionally checked against a staged copy of
the frozen arena whose original full scene/authority hashes matched exactly.

Focused verification:

```text
node node_modules/vitest/vitest.mjs run src/completion-architectural-finish.test.ts src/forge-kit/facade.test.ts src/forge-kit/facade-elevation.test.ts src/nuketown2-facade-elevation-consumers.test.ts src/nuketown2-maintained-facade.test.ts src/nuketown2-review-camera.test.ts
```

Root's visual verification retains the porch, garage-exterior-close and trailer
rear-frame cameras, High and Performance, 1280×720, seed 6401, time 63000 ms and
exposure 1.08. Reject pale stripes on orange siding, unreadable near seams,
changed opening readability or any new blotches. The trailer is a regression
control. Actual runtime draw/program/triangle parity remains required: existing
material instances do not alone prove unchanged culling or frame costs.
Game limits remain 420 draws / 650,000 triangles; vehicle budgets stay unchanged.

Upstream checked 2026-09-12: [Three.js documentation index](https://threejs.org/docs/llms.txt),
[BufferGeometry](https://threejs.org/docs/#api/en/core/BufferGeometry), and installed
Three.js 0.185.1 source. Keep the project's installed version; the live documentation
index currently illustrates 0.186.0. This change uses existing node materials and
the arena's part adapter, with no renderer or API migration.

Gotcha: staged TypeScript executed through `tsx` must resolve Three.js to the
same module instance as the source dependencies. Mixing explicit ESM Three.js
with their CommonJS resolution breaks `instanceof` checks in the static batcher.
Verify the staged baseline's original census and authority digest before using
it as a comparison. Never treat an import-resolution artefact as a shape change.
