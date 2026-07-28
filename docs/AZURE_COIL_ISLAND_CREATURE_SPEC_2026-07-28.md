# Azure Coil Island Creature — Runtime Asset Specification

Date: 2026-07-28
Owner: Hermes on `dave-gaming-pc`
Change impact: `runtime`
Base: `d851e8e8f314d0e1f048430a400d50aec06dee43` (`origin/main` at task start)
Branch: `contrib/dave-gaming-pc/hermes/sea-dragon-island-patrol`
Target arena: `atomic-acres` / Nuke Town

## Intent

Add one original, premium blue aquatic serpent-dragon that circles above the green Atomic Acres arena. The creature is a presentation-only authored GLB with an editable Blender source, embedded project-authored PBR maps, a deforming skeleton, a seamless local swim clip, and a deterministic world-space patrol.

The user identified Gyarados as the conceptual reference. Atomic Acres must not ship protected franchise art, so the runtime creature is **not Gyarados** and must not use the Pokémon name, mesh, image, texture, logo, exact silhouette, or distinctive copied anatomy. The broad unprotectable brief retained is “large blue aquatic serpentine dragon.”

## Original visual identity

Working name: **Azure Coil Leviathan**.

Deliberate differentiators:

- manta-like swept crown instead of three forehead horns;
- closed wedge-shaped predatory head instead of a permanently open round mouth;
- two layered translucent sail-fins per side instead of white lateral spikes;
- asymmetric cyan bioluminescent scale bands over deep cobalt skin;
- slate/teal belly rather than a cream segmented underbelly;
- split ribbon tail with a central luminous vane rather than a forked white fish tail;
- short swept whisker-fins instead of long blue tendrils;
- amber/cyan eyes and dark graphite fin rays;
- no copied dorsal crest pattern, body-ring pattern, facial markings, or colour blocking.

Reference observations are design research only. No external visual bytes enter the repository or generated asset.

## Requirements and falsifiers

### R1 — Originality and provenance

Expected: every shipped model, texture, animation and preview byte is generated locally by the checked-in authoring script and recorded in `assets.manifest.json`.

Falsifier: any downloaded/ripped mesh or image; a Pokémon/Gyarados name in runtime UI/assets; copied protected silhouette or markings; missing source/checksum.

### R2 — Premium geometry and materials

Expected: a coherent hero silhouette with tapered deforming body, modeled head/jaw/crown, layered fins, gill armour, scale relief, emissive accents, smooth normals and embedded self-contained PBR maps.

Target budget:

- 30,000–80,000 triangles after export;
- no more than 12 rendered mesh/material groups;
- one 2K body base-colour map plus 2K normal and packed/roughness maps where practical;
- GLB target under 8 MiB before optional repository compression;
- no external runtime texture requests;
- clean material response in both Performance and Quality Graphics.

Falsifier: primitive tube silhouette, faceted deformation, black/missing material, stretched UVs, detached fins, copied franchise details, more than 12 draw groups, or unexplained budget overrun.

### R3 — Rig and local animation

Expected: one exported armature with a longitudinal body chain plus head, jaw, crown/fin and tail controls. `AzureCoil_Swim` is a seamless approximately five-second loop with propagated lateral wave, restrained vertical lift, tail follow-through, jaw/gill breathing and secondary fin motion.

Falsifier: no skin, zero animation clips, first/last-frame pop, hard kinks, inverted weights, fin detachment, or animation only at the world-root level.

### R4 — Island patrol

Expected: in the `atomic-acres` arena only, the root follows a smooth deterministic loop centred at `(0, 11, 0)` with horizontal radii `23 × 26 m`, `0.9 m` bounded height variation, tangent heading and bounded bank. Runtime scale yields an approximately 16–18 m nose-to-tail silhouette and nominal loop duration is `24 s`. It remains visually above playable roofs/trees and reads as traversing over the green island rather than through it.

Falsifier: path leaves the arena composition, crosses playable geometry, clips roofs/trees, jitters, reverses abruptly, changes shared game state, or appears in other arenas.

### R5 — Authority and collision safety

Expected: the creature and every descendant are marked `presentationOnly`, `blocksShots=false`, and excluded from raycasts. It never enters Rapier, movement, ballistics, bot navigation, LOS, spawn, score, or multiplayer state. No invisible/profile-only collider is added. Safe altitude is the collision solution.

Falsifier: any profile changes a shot/movement result; any descendant is raycastable; any rigid body/collider is created; clients replicate creature pose; or its route intrudes into reachable play space.

### R6 — Loading, lifecycle and failure behaviour

Expected: one memoized GLB load, one mixer, explicit `update(delta, elapsed)` and `setArena(arenaId)` methods, and explicit disposal of mixer actions, geometries, materials and textures. A load failure records bounded telemetry and omits the creature; it must not substitute a primitive runtime dragon.

Falsifier: duplicate loads, unbounded mixers/resources, stale animation after disposal, uncaught load rejection, broken game startup, or a low-quality primitive fallback.

### R7 — Deterministic authoring

Expected: Blender 5.1.2 runs headless with factory startup and `PYTHONHASHSEED=0`; the checked-in script emits the editable `.blend`, self-contained `.glb`, PBR source maps, provenance receipt and preview render. Repeated clean runs preserve semantic counts and visual/animation contracts; unavoidable Blender binary nondeterminism is documented rather than hidden.

Falsifier: manual-only source, missing editable scene, network dependency, unseeded randomness, external texture URI, or regeneration cannot reproduce semantic structure.

### R8 — Verification and evidence

Expected:

- GLB structure test checks armature, skin, named clip, semantic nodes, mesh/material/triangle budgets and no external URIs;
- patrol unit tests challenge loop closure, bounds, tangent continuity, altitude and arena visibility;
- provenance and build gates pass;
- served-browser evidence covers menu preview/gameplay in Performance and Quality, load telemetry, animation progress, path position and clean console;
- visual review includes Blender hero render and in-engine screenshots.

Falsifier: only a script exit code, no in-engine render, non-WebGPU/fallback capture presented as target proof, warnings/errors, black asset, static pose, or evidence from a different SHA.

## State tracking

### Observed

- Blender 5.1.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe`.
- Atomic Acres uses Three.js 0.185.1, GLTFLoader, AnimationMixer and skinned GLB operators.
- Nuke Town bounds are `x=[-34,34]`, `z=[-43,43]`; its presentation includes grass and authored greenery.
- Imported GLBs are already kept separate from TypeScript/Rapier collision and ballistics authority.
- Repository policy requires original/licence-vetted content and checksum provenance.

### Inference

- The accepted `23 × 26 m` orbit at `11 m` altitude provides roof/tree clearance while keeping the enlarged creature legible from the arena.
- The 60,424-triangle hero asset remains within the frozen browser budget because it uses 11 rendered material groups, 5 embedded maps and one memoized mixer.

### Challenged assumptions

- **Confirmed:** menu-preview and elevated gameplay captures show the creature inside the renderer frustum.
- **Confirmed:** map switching hides/restores one retained 11-mesh instance without duplicate loading.
- **Confirmed:** the 6,137,084-byte GLB has no external URI and passes source/runtime digest verification.
- **Confirmed:** all descendants are non-raycastable presentation nodes with no Rapier, ballistic or network authority.

### Remaining unknowns before release

- Actual-hardware WebGPU/TSL performance and material parity still require the repository hardware gate on an exact commit.
- Optional Meshopt/WebP compression has not been applied; the uncompressed self-contained GLB is already below 8 MiB.
- Human acceptance must follow an immutable PR preview; the implementation does not manufacture that approval.

### Verification observed

- Blender hero render: `docs/assets/azure-coil-leviathan-preview.png`.
- Served menu evidence: `docs/assets/azure-coil-menu-preview.png`.
- Served elevated gameplay evidence: `docs/assets/azure-coil-in-engine.png`.
- Focused unit/GLB gate: 5/5 tests pass.
- Served Chromium gate: `tests/e2e/azure-coil-island-patrol.spec.ts` passes with clean console, advancing mixer/orbit, authority audit and arena lifecycle checks.
- Complete Vitest gate: 139 files / 768 tests pass.
- Canonical lint, production build, gameplay-contract, 26 digest provenance and 109/109 public-asset coverage gates pass.

### Active falsifiers

- GLB validation or provenance failure.
- First/last animation frame mismatch visible in Blender or browser.
- Any console/GPU error, missing material, or failed texture decode.
- Any creature node entering authoritative raycast/collision collections.
- Any Performance/Quality gameplay authority mismatch.
- Any protected-franchise identifier or copied visual asset in the shipped tree.
