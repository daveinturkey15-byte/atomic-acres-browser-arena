# Group B skill-pack comparisons (rows 27, 28, 29)

Lane `technique-b-glm-max-20260912`, machine `dave-gaming-pc`, harness `omp`, 2026-09-12.

The register's decision for these three rows is **COMPARISON against our own library, not
import**. This file is the comparison artifact each row's scene pairs with. Every claim of
"read" below is backed by a full body read this session, recorded with hash and size in
`skill-read-proofs.json`; the pinned trees and per-URL attempts are in `SOURCE_RESEARCH.json`
and `url-attempts.json`.

## Row 27 - majidmanzarpour/threejs-game-skills @ `7221c1f` (MIT)

Bodies read in full: `skills/threejs-gameplay-systems/SKILL.md` (5,970 B, 78 lines),
`skills/threejs-game-director/SKILL.md` (11,280 B, 124 lines).

| The pack provides | Our equivalent | Gap either way |
|---|---|---|
| Game director orchestrating five phase skills + three generator skills via a path ladder and four ledgers | `.agents/skills` store (`threejs-game-development`, `webgpu-tsl-arena-forging`, `game-hud-menu-overhaul`, ...) selected per task; AKP governs provenance | The pack's *phase-entry reference gates* (a phase cannot close with a required reference unloaded) are stricter than our habit of citing skills in AGENTS.md; worth adopting as practice, not code |
| Packaged Vite/TS scaffold creator (`create_threejs_game.py`) | Atomic Acres itself is the scaffold | None material |
| External-asset sourcing gate with credential probe | Owner approval gates + forge-kit/provenance pipeline | The pack demands probe output (`KEY=SET/MISSING`) before declaring a generator unnecessary; a good falsifier habit |
| Game-feel tuning (hitstop, shake, impact feedback, explicit update order) | Lived in Atomic Acres combat/HUD work but not isolated as a lab method | Row 27's scene (`source-27.ts`) demonstrates exactly this loop on the CPU |
| Premium visual scorecard (10 categories) | Deterministic review cameras + forging review | Theirs is a published rubric; ours is contract-driven |

Scene: `source-27.ts` - the feel loop (hitstop, pooled flash, shake decay, gating cooldown)
in the skill's own demanded update order. Not an adoption of the pack.

## Row 28 - dgreenheck/webgpu-claude-skill @ `af2319b` (NO LICENCE)

Bodies read in full: `skills/webgpu-threejs-tsl/SKILL.md` (3,202 B, 93 lines),
`skills/webgpu-threejs-tsl/docs/materials.md` (8,786 B, 353 lines). All rights reserved -
concepts restated below in our own expression; nothing copied.

What the skill teaches: WebGPURenderer setup from the `three/webgpu` entry point, TSL node
materials (color/opacity/emissive/position nodes), `Fn()` custom functions, compute shaders,
post-processing, WGSL integration, device loss. The materials document catalogues node
material properties and worked examples (animated color mix, triplanar, glass, Fresnel rim,
threshold dissolve with edge glow).

Our coverage: `webgpu-tsl-arena-forging` covers the fail-closed WebGPU attestation route,
arena forging gates, and light-leak/geometry QA this source does not; current upstream docs
(`threejs.org/docs/llms.txt`) plus the Poimandres MCP cover TSL syntax more authoritatively
and more freshly than a static skill body. The row adds no capability we lack.

TSL recipe the row's scene mirrors (our own expression of the graph shape its scene
evaluates on the CPU): a `uniform(float)` threshold; `hash(positionLocal.mul(k))` as the
cutoff field; color = mix(voidColor, panelColor, step(threshold, noise)); an edge term
`smoothstep(threshold, threshold.add(band), noise)` multiplied into emissive. `source-28.ts`
evaluates this graph per-vertex on the CPU - it does not construct TSL nodes, and says so.

## Row 29 - CloudAI-X/threejs-skills @ `b1c6230` (NO LICENCE)

Bodies read in full: `skills/threejs-geometry/SKILL.md` (13,829 B, 548 lines). The other nine
topic skills (fundamentals, materials, lighting, textures, loaders, animation, interaction,
shaders, postprocessing) are covered by pinned-tree enumeration only, and the register's
contents question is answered: it is a Three.js tutorial set, not a game-production pack.

Our coverage: every topic the collection teaches is either upstream-documented (docs route
above) or already codified in our skills and contracts (instancing discipline in
`threejs-procedural-vegetation` and the grass demo of row 18; disposal in the technique-lab
`disposeGroup` contract; LOD in row 33's partitioned selector). No gap worth closing.

Scene: `source-29.ts` - the geometry skill's instancing section made falsifiable: the same
deterministic 240-cube field rendered as 240 individual meshes (before) and as one
InstancedMesh with per-instance colors (after), draw counts in the stats.
