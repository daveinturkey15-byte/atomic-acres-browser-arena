# Atomic Acres — Adaptive Rendering, Rigged Assets and Traversable Houses Pass 15

Date: 2026-07-13
Status: audit and asset intake
Branch: `overhaul/adaptive-rigged-assets-layout-pass-15`

## Overview

Pass 15 is a refinement pass prompted by direct playtest feedback that Pass 14 remains too visually crude, has too large a quality/performance split, does not adapt when a machine misses its frame budget, and contains house rooms/stairs that are not reliably traversable.

The pass replaces the primitive combatant/view rigs with properly licensed skinned assets and animation clips, keeps the same readable assets in both public graphics modes, introduces frame-time-driven dynamic scaling, and rebuilds the two original Atomic Acres homes around mechanically tested human-scale routes.

This remains an original arena. It may target compact two-house early-2010s FPS pacing, but it must not copy Nuketown geometry, dimensions, assets, textures, names, signage or protected presentation.

## Observed failures

### O1 — graphics profiles are coarse presets, not adaptive systems

`render-profile.ts` changes native resolution, antialiasing, shadows, material model, world detail and presentation detail simultaneously. Current profiles are approximately:

- Performance: DPR cap `0.6`, no MSAA, no shadows, reduced world/presentation, palette-basic materials.
- Quality: DPR cap `1.0`, MSAA, static 768 shadow map, full world/presentation and authored materials.

Observed Pass 14 AMD/D3D11 unlocked results were `327.37 FPS` Performance versus `69.52 FPS` Quality. Quality is still above 60 FPS on the test GPU, but the large delta shows the profiles are architecturally discontinuous. Neither profile responds to sustained frame-time pressure.

### O2 — combatants and first-person rigs are procedural primitives

`art-kit.ts::buildOperator()` assembles rounded boxes, spheres and cylinders into a manually animated hierarchy. `weapon-presentation.ts` similarly constructs capsule arms, rounded-box gloves and procedural weapons. Visibility was repaired in Pass 14, but silhouette, deformation, hands, materials and motion remain prototype quality.

### O3 — the current house collision graph blocks its own staircase

In `map.ts`, `interior-divider-right` spans the right side of the house across local `z = 0`. The staircase is also centred on the right side and advances through local `z = 0`. Their solid boxes intersect. The visual route therefore suggests access while Rapier collision obstructs it. Existing tests validate constants and static telemetry but do not walk a character from entrance to rooms and upstairs.

## Requirements

### R1 — retain exactly two public graphics choices

The ordinary menu continues to expose only:

- Performance
- Quality

The hidden Compatibility path may remain diagnostic-only.

### R2 — both public modes use the same authored asset family

Performance may use lower texture mip bias, lower DPR, shorter LOD distances, cheaper materials and fewer secondary effects, but it must not replace rigged combatants/weapons/interiors with primitive stand-ins. Quality and Performance should look like the same game at different fidelity levels.

### R3 — adaptive frame-time control

Add a deterministic adaptive-quality controller with hysteresis and cooldowns. It must:

- infer an active target cadence from the observed display cadence;
- use a rolling frame-time percentile rather than one bad frame;
- reduce internal pixel ratio one bounded step when sustained p95 exceeds budget;
- recover one bounded step only after a longer stable headroom window;
- avoid oscillation while menus, tab visibility changes, loading, warmup and explicit QA pauses occur;
- expose current scale, tier, reason, downshift/upshift count and p50/p95 telemetry;
- preserve pointer, network and simulation cadence while only changing renderer workload;
- never reduce Performance below a readable floor or Quality below the agreed visual floor.

Initial discrete DPR targets, subject to measured tuning:

- Performance: `0.55`, `0.65`, `0.75`.
- Quality: `0.65`, `0.75`, `0.85`, `1.0`.

At 60 Hz-class displays, provisional downshift/upshift thresholds are p95 `>18.5 ms` sustained and p95 `<14.5 ms` sustained. At 30 Hz-class displays, budgets derive from the measured display interval and must distinguish display limiting from genuine missed cadence.

### R4 — licensed rigged operator

Use a distributable rigged glTF operator with real skeletal deformation and animation clips for idle, walk/run, lateral movement, firing, hit reaction and death. Keep gameplay hit proxies separate and authoritative.

Current selected intake candidate:

- Pack: **Ultimate Modular Males** by Quaternius.
- Model: `Swat.gltf`.
- Official pack page: `https://quaternius.com/packs/ultimatemodularcharacters.html`.
- Official page states 11 modular characters and 24 animations in FBX/OBJ/glTF/Blend.
- Included `License.txt` states CC0 1.0 Universal / Public Domain Dedication.
- Model has one skin, 62 named joints with articulated fingers, five skinned meshes and 24 animation clips.
- Downloaded intake SHA-256: `622b3f36fcac90539ef8f7121ec1f11b5e1ae603a085019b3fa96eba20dddfd3`.

Do not commit the intake until it has been visually inspected in-engine, optimized and accompanied by provenance/license files.

### R5 — rigged first-person arms and hands

Derive a dedicated first-person arm asset from the licensed skinned operator or another equally lawful source. It must have:

- real wrist, finger and thumb joints;
- two-handed grip poses;
- separate clips/blends for idle, sprint, fire, reload, weapon switch and knife;
- no torso/head clipping into the camera;
- stable ADS alignment;
- visible sleeves/gloves in both public graphics modes.

A Blender conversion may remove non-arm geometry from the first-person derivative while preserving the source skeleton and provenance.

### R6 — imported weapon meshes

Replace procedural box weapons with imported, optimized assets for carbine, SMG, scattergun and pistol. Assets must be legally distributable and visibly better than the current primitives. Each weapon needs named sockets or authored attachment transforms for muzzle, eject, magazine, sights and grip. Weapon identity must remain original; do not use protected COD weapon art or branding.

Candidate research source: Quaternius **Animated Guns Pack**, whose official page declares CC0 and includes six animated firearms. The older source is FBX/Blend/OBJ and requires controlled Blender conversion before adoption. It is not accepted merely because it is downloadable.

### R7 — asset optimization

Imported assets must be processed before shipping:

- glTF/GLB with embedded or adjacent textures;
- remove unused meshes, clips and materials;
- preserve named skeleton/bones and sockets;
- quantize/compress only after visual verification;
- cap operator texture dimensions and material count;
- create at least one lower-detail operator representation without reverting to primitives;
- share geometry/materials across bots and remote players;
- dispose mixers, cloned skeleton resources and materials on disconnect/reset;
- keep initial download and decoded memory bounded.

### R8 — rebuild both original houses for traversal

Replace the current intersecting interior graph. Minimum clear geometry:

- exterior footprint approximately `17 m × 16 m`, retained only as an original Atomic Acres scale anchor;
- primary doors at least `1.4 m` clear width and `2.2 m` clear height;
- internal doors at least `1.2 m` clear width;
- corridors at least `1.35 m` clear width;
- ordinary combat rooms at least `3.4 m × 3.8 m` clear after collision;
- stair clear width at least `1.5 m`;
- riser no higher than the controller's verified autostep envelope, with landing headroom at least `2.15 m`;
- no divider, prop, ceiling, trim or decorative mesh may intersect the stair/corridor clearance volumes;
- visible openings and collision openings must match.

The Aqua and Coral homes may share a shell system but require meaningfully different room/cover arrangements to avoid mirrored monotony.

### R9 — movement-based house verification

Add deterministic traversal tests that drive the real `CharacterPhysics` collider through route waypoints. Required routes for both houses:

1. front entrance → ground-floor front room → rear exit;
2. front entrance → stair foot → upstairs landing;
3. upstairs landing → both upstairs firing positions;
4. rear entrance → side room → front exit;
5. reverse traversal for every route;
6. stand and crouch clearance checks at doors, landings and under ceilings.

A static collider count or teleport-only screenshot is not acceptance evidence.

### R10 — preserve authority and bounded effects

Rendering/model changes must not alter camera-ray firing, hit proxies, player collision, remote-shot/melee admission, peer identity binding, network cadence, match rules or bounded support/effect lifetimes.

## Acceptance criteria

- **C1 Profiles:** normal menu has exactly Performance and Quality; both render the same rigged operator/weapon/interior asset family.
- **C2 Adaptation:** deterministic unit tests prove sustained overload downshifts, sustained headroom recovers, cooldown/hysteresis prevents oscillation, hidden/loading states do not poison samples, and scales stay inside mode bounds.
- **C3 Performance:** on the normal Windows Chrome path, neither public mode remains below its detected cadence target because of GPU workload when an allowed lower adaptive tier can recover it.
- **C4 Quality floor:** automatic scaling never uses the Compatibility representation or primitive combatant fallback.
- **C5 Operator:** local screenshots in both modes show a clearly skinned humanoid with articulated limbs; browser telemetry reports skeleton, mesh, animation and active-clip state.
- **C6 First person:** hands/arms remain visible and correctly attached for all four weapons during hip, ADS, sprint, fire, reload, switch and knife.
- **C7 Weapons:** all four imported weapons have verified muzzle/eject/magazine/sight/grip sockets and remain aligned in first and third person.
- **C8 Traversal:** all twelve direction-specific house routes (six per house including reverses) pass using real character movement with zero penetration or stuck frames.
- **C9 Collision parity:** every portrayed door/window/stair opening matches collision; no visible collision proxy and no invisible blocking wall.
- **C10 Multiplayer:** reciprocal local and public WebRTC still pass with rigged remote animation, weapon replication, firing and admitted melee.
- **C11 Budgets:** asset transfer, decoded geometry, active mixers, draw calls, triangles and material counts remain within recorded Performance/Quality budgets.
- **C12 Release:** lint, unit, production build, Chromium, Windows Performance/Quality, visual QA and multiplayer gates pass before an immutable review; canonical does not move without owner acceptance.

## Out of scope

- Exact Nuketown geometry, assets, dimensions or art.
- Ripped Call of Duty models, animations, sounds or textures.
- Photorealism at the expense of browser frame pacing.
- A ranked/host-authoritative field-support server rewrite in this visual/navigation pass.

## Current decisions and unknowns

- **Confirmed:** the current stair and right-divider solid volumes intersect.
- **Confirmed:** the current operator and view rigs are procedural primitives, not skinned imports.
- **Confirmed:** the Quaternius SWAT candidate is CC0 according to both the official pack page and included license file; it contains a skin and 24 animation clips.
- **Unknown:** whether the SWAT art direction is sufficiently polished once seen in the actual arena and first-person camera. It must pass a visual prototype before adoption.
- **Unknown:** which weapon pack/model set provides the best consistent four-weapon family after conversion. No weapon source is accepted until license, topology, animation and in-engine appearance are verified.
- **Assumption:** stylized low-poly imported assets can materially improve visual cohesion while preserving browser performance. The falsifier is an in-engine side-by-side that still reads as crude or causes unacceptable frame/memory cost.
