# Atomic Acres Pass 25 — Modern Refinement and Bug-Hunt Plan

**Date:** 2026-07-16

**Plan branch:** `planning/pass25-modern-refinement`

**Planning baseline HEAD:** `1f3f7bdcd87447ea39b44d4ad736972d54d25b65`

**Approved visual/game-feel baseline:** Pass 24 implementation `3a1ead06bfdede4b3d6c96f9ecde228520c04ccf`

**Approved isolated review:** <https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/blender-pass24/?render=blender&source=3a1ead0&pages=8ce7c7e>

## 1. Executive decision

Pass 25 should be a **presentation reconstruction around a frozen gameplay core**, not a gameplay rewrite.

The route to “2025 rather than 1995” is:

1. freeze the current movement, combat, collision, timing, reticle and multiplayer behavior as executable contracts;
2. build deterministic replay, visual comparison and network-chaos tooling that can expose regressions;
3. find and fix correctness/lifecycle defects before layering new art;
4. modernize one representative vertical slice first;
5. scale only owner-approved improvements across the arena;
6. keep WebGL as the production renderer and preserve all three public graphics profiles;
7. publish only to an isolated review path until owner acceptance.

Modernity should come from coherent physical materials, image-based lighting, contact definition, believable first/third-person motion, richer positional audio, restrained effects and a cleaner HUD—not from motion blur, chromatic aberration, indiscriminate bloom, gameplay camera shake or copied commercial art.

## 2. Claim state

### Observed

- Pass 24 is the owner-approved gameplay/feel baseline.
- Its isolated review used source `3a1ead0` and Pages revision `8ce7c7e`.
- The corrected Pass 24 gate reported 181 deterministic tests and 28 bounded Chromium scenarios green.
- TypeScript/Rapier remain authoritative; the Blender GLB is presentation-only.
- The game already has:
  - a 120 Hz fixed simulation step;
  - explicit movement and weapon tables;
  - an authoritative centre-camera reticle/shot contract;
  - movement, slope, combat, admission and presentation tests;
  - Performance, Quality and Blender Render profiles;
  - adaptive DPR/shadow behavior;
  - deterministic Blender generation and release-tree provenance checks.
- Current source audit found:
  - `src/main.ts` is approximately 3,839 lines, concentrating integration risk;
  - gameplay/presentation code still has 28 `Math.random()` call sites and no seeded replay layer;
  - no Playwright screenshot baselines or `toHaveScreenshot()` visual comparisons;
  - no WebGL context-loss recovery test;
  - default verification is Chromium-centric despite a Firefox project existing;
  - local trace capture is weak when retries are disabled;
  - no `KTX2Loader`, Meshopt, normal-map, ORM, AO-map or environment-map pipeline in runtime source;
  - no `PannerNode`/Three `PositionalAudio` world-audio path;
  - no post-processing composer;
  - core dependencies are declared as `latest` in `package.json` even though the lockfile currently constrains installs;
  - the Pass 24 environment embeds nine 1024×1024 PNGs; RGBA8 base allocation is approximately 36 MiB, or approximately 48 MiB with a complete mip chain, before normal/ORM expansion;
  - a representative Pass 24 gameplay capture reported approximately 59 calls and 61,426 triangles.
- The latest GitHub issue query returned no open issues; there is not yet a durable bug ledger.

### Inferences to verify

- Blender profile shadow caching with `shadowMap.autoUpdate = false`, combined with dynamic operator shadow casters, may freeze actor shadows. Reproduce before classifying it as a bug.
- Unseeded randomness makes some combat/effect failures difficult to replay exactly.
- The absence of visual baselines allows lighting, HUD, material and framing regressions to remain mechanically green.
- Albedo-only materials, low-detail first-person anatomy, stylized low-poly operators and non-spatial procedural audio are the largest remaining “older game” signals.
- Full-screen grain/compositor overlays may cost presentation time without materially improving current art direction.

### Assumption for this plan

The default target is **original stylized tactical realism**: retain Aqua/Coral readability and the compact arena identity, but improve physical material response, construction detail, silhouettes, motion and sensory coherence. Do not chase photorealism at the expense of clarity or browser performance.

## 3. Non-negotiable gameplay preservation contract

Pass 25 does not rebalance mechanics. Any requested balance change must be reviewed separately.

### Freeze mechanically

- Movement acceleration, braking, sprint, jump, gravity, stance and air-control values.
- Rapier controller dimensions, slope behavior, autostep and `RAMP_LANDING_OVERLAP = 0.06`.
- Existing map collision, openings, ramps, spawn bounds, shot blockers and traversal routes.
- Weapon damage, range, RPM, magazines, reserve ammunition, reload times, spread, recoil and ADS FOV.
- Sniper one-headshot/two-body-shot contract.
- Camera-centre principal shot and permanent reticle invariant for every weapon.
- Grenade fuse, sweep, LOS and damage behavior.
- Field Support thresholds and timing: Scout Sweep, Yardhawk and Tri-Pass.
- Death-drop lifetime, range, one-time consumption and **F** interaction.
- Breakable-window IDs, admission and one-time state.
- Bot pressure, reaction, damage multiplier and respawn behavior.
- Match scoring, timing and respawn protection behavior.
- Network message schema, identity binding, admission, cadence and interpolation semantics.
- Player-facing graphics options: exactly Performance, Quality and Blender Render. `compat` remains query-only.

### Presentation changes may not

- move the authoritative reticle or camera ray;
- change collision, cover, line-of-sight or spawn geometry;
- hide a real opening or visually imply a route where collision blocks;
- change weapon event timing to fit an animation;
- add camera motion before the shot is emitted;
- obscure targets through bloom, fog, grading, particles or HUD animation;
- make combat-critical assets different identities across profiles;
- alter peer-authoritative state to make presentation easier.

## 4. Research synthesis: what “modern browser FPS” means in 2025/2026

| Research result | Pass 25 decision |
|---|---|
| Three.js uses a linear-sRGB working space; color textures require sRGB annotation and output conversion. Post-processing requires a final `OutputPass`. | Add a tested color-management contract before any grading/composer work. Never stack ad-hoc CSS grading over incorrectly tagged textures. |
| Three.js `EffectComposer` provides ordered passes; `OutputPass` performs tone mapping and output conversion. | Composer is optional and profile-scoped. Use it only after a matched A/B proves benefit. |
| `KTX2Loader` transcodes Basis Universal textures to GPU-supported compressed formats. Khronos `KHR_texture_basisu` is intended to reduce download and GPU memory cost. | Move authored material sets to KTX2 only after pixel comparison and load/VRAM telemetry prove parity. |
| Khronos Meshopt compression is designed for compact glTF geometry with fast decoding. | Evaluate Meshopt after the visual vertical slice; compression cannot alter transforms, sockets, windows or semantic IDs. |
| Khronos glTF extensions support clearcoat/specular material behavior. | Use sparingly for painted metal, glass trim and coated props; normal + ORM + IBL matter first. |
| Rapier promises deterministic simulation when version, initial state and inputs match; snapshot hashes can expose divergence. Cross-platform trig may differ. | Add same-version snapshot/state hashes and deterministic recorded inputs. Keep world setup away from platform-varying trig where exact cross-platform hashes are required. |
| Rapier character-controller settings materially affect slope, autostep and grounding. | Freeze controller values and run the real controller through every route; never “fix” art by adjusting physics. |
| Playwright supports screenshot baselines and trace-based action/network/console inspection, but snapshots must run in a stable environment. | Add fixed-state visual baselines in a pinned Linux browser/container and retain traces on failure. Store owner tribunal evidence outside Playwright-owned `test-results/`. |
| Property-based testing generates broad input spaces and shrinks failures to minimal reproductions. | Introduce seeded generative tests for state transitions, physics routes and protocol admission; persist the seed and minimal trace. |
| Web Audio `PannerNode` supports position, orientation, distance and directional cones and is widely available. | Add a presentation-only positional world-audio bus with occlusion filtering. Preserve cue timing and competitive audibility. |
| MDN still marks WebGPU as limited availability. | Do not migrate the production renderer in Pass 25. WebGPU may be a later experimental query-only lab, never a release dependency. |

### Primary sources checked 2026-07-16

- Three.js color management: <https://threejs.org/manual/en/color-management.html>
- Three.js post-processing: <https://threejs.org/manual/#en/how-to-use-post-processing>
- Three.js KTX2Loader: <https://threejs.org/docs/#examples/en/loaders/KTX2Loader>
- Khronos `KHR_texture_basisu`: <https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_texture_basisu>
- Khronos `EXT_meshopt_compression`: <https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_meshopt_compression>
- Khronos `KHR_materials_clearcoat`: <https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_clearcoat>
- Khronos `KHR_materials_specular`: <https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_materials_specular>
- Rapier determinism: <https://rapier.rs/docs/user_guides/javascript/determinism/>
- Rapier character controller: <https://rapier.rs/docs/user_guides/javascript/character_controller/>
- Playwright visual comparisons: <https://playwright.dev/docs/test-snapshots>
- Playwright Trace Viewer: <https://playwright.dev/docs/trace-viewer>
- fast-check property-based testing: <https://fast-check.dev/docs/introduction/why-property-based/>
- MDN `PannerNode`: <https://developer.mozilla.org/en-US/docs/Web/API/PannerNode>
- MDN WebGPU availability: <https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API>

## 5. Bug-discovery matrix

Every real bug receives: severity, exact seed/input trace, expected/actual result, screenshot/trace if visual, regression test, fix revision and verification evidence. A bug is not closed by an unreproduced retry.

| Surface | Adversarial scenarios | Required invariant/evidence |
|---|---|---|
| Startup/assets | cold cache, failed GLB, slow textures, malformed persisted profile, unsupported WebGL, context loss/restore | fallback is playable; status is honest; no duplicate scene/resources; profile stays allowlisted |
| Input/pointer lock | Escape, Alt-Tab, blur/focus, menu during held keys, held fire through respawn, resize, DPR change, rapid profile change | no stuck movement/fire/ADS; reacquisition works; finite camera; reticle remains centred |
| Movement | diagonals, wall slide, corners, jumping into ceilings, crouch/prone clearance, long/short frames | finite position/velocity; authored terminal speeds; no tunnelling or free vertical boost |
| Ramps/houses | every route both ways, off-centre entry, landing joins, reverse exits, mirrored houses | real standing capsule reaches each anchor within existing timing/clearance bounds |
| Combat | every weapon × distance × hit zone × hip/ADS × fire/reload/switch/melee conflict | damage/cadence/ammo/recoil/reticle match frozen table; cover and tracer choose same winning trace |
| Grenades/supports | thin-wall sweeps, end-match fuse, repeated support input, interrupted tactical map, respawn during active effect | no through-cover damage; immutable ended score; bounded cleanup; exact timing and one-time state |
| Windows/drops | simultaneous break/pickup, replayed nonce, remote out-of-range claim, expiry boundary, bot death, reset/rematch | consume once; stable ID; no duplicate ammo/drop/shard; authoritative proximity/availability |
| Bots | blocked routes, invalid positions, protected offense, LOS near openings, low health, death/reset | finite bounded state; no firing through authoritative cover; no dead-state mutation |
| Multiplayer | 0/50/100/200 ms latency, jitter, reorder, duplicate, 0/2/5% loss, disconnect/rejoin, stale snapshots | no identity swap, NaN, duplicate effects, impossible ammo/HP, stale overwrite or unbounded interpolation |
| Match lifecycle | menu→warmup→active→ended→rematch; delayed effects across transitions | state transitions are idempotent; ended scores immutable; all transient state clears/rearms correctly |
| HUD/minimap | 1280×720, 1920×1080, short laptop height, 4:3, ultrawide, DPR 1/2, all combat states | no overlap/clipping; reticle centre within 1 CSS px; facing derives from camera forward |
| Rendering | all profiles, static/dynamic shadows, day/interior, actor movement, particles, disposal | no frozen actor shadow; no z-fighting; no missing material; pools bounded; renderer counts recover |
| Audio | first-use cue, rapid fire, distance, left/right, indoor/outdoor, muted/background tab | no first-use hitch; no clipping; spatial direction plausible; cues stay timely and readable |
| Soak | 20-minute active solo; repeated deaths/windows/drops/supports; 10 host/join/rematch cycles | bounded entities, listeners, timers, draw calls, texture count, heap trend and snapshot age |
| Release | clean install, build, release tree, public subpath, cache-bust, historical-review diff | exact tested artifact, no rejected assets/secrets, canonical and older reviews unchanged |

## 6. Staged execution plan

## Phase 0 — Freeze the feel before changing visuals

**Purpose:** make “keep it feeling like this” executable.

Deliverables:

1. `pass24-gameplay-contract.json` generated from canonical source exports:
   - movement and stance values;
   - every weapon value;
   - grenade/support/drop/window timings;
   - controller/ramp values;
   - loadouts and match values;
   - reticle and ADS thresholds;
   - protocol cadence/range limits.
2. A seeded time/RNG/input adapter around gameplay tests. Cosmetic randomness gets a separate stream.
3. Golden 120 Hz input traces:
   - spawn/walk/sprint/jump/stop;
   - ramp ascent/descent;
   - hip fire/ADS/recoil/recovery;
   - reload/switch/melee interruption;
   - death/drop/pickup/respawn;
   - support activation/end-match cleanup.
4. Same-version final-state and Rapier snapshot hashes over repeated runs.
5. Durable matched visual baselines under `artifacts/pass25-baseline/`, not `test-results/`:
   - spawn exterior;
   - threshold/interior;
   - close operator;
   - hip/ADS/fire/reload;
   - window/drop/support;
   - each of Performance, Quality and Blender Render.
6. A Windows foreground and unlocked-GPU baseline for all three profiles, including GPU/ANGLE, resolution, DPR, display refresh, calls, triangles, FPS percentiles, long frames, snapshot age and interpolation error.

Acceptance:

- Ten repeated runs of each golden trace produce identical same-environment state hashes.
- All existing gameplay tests remain green.
- Existing Pass 24 screenshots and runtime telemetry are preserved as immutable evidence.
- Package versions are pinned exactly before any dependency/toolchain change.

## Phase 1 — Bug hunt and correctness hardening

**No art changes in this phase.**

Priority investigations:

1. Reproduce or discharge the dynamic-actor/static-shadow suspicion.
2. Add retained-on-failure Playwright traces and deterministic seeds.
3. Encode bounded E2E groups as one repeatable command rather than relying on manually selected groups.
4. Add Chromium full functional groups plus Firefox boot/menu/solo/input smoke. WebKit is an explicit capability investigation, not a silent release requirement.
5. Add seeded state-machine/property tests for conflicting actions and route movement.
6. Add network-chaos transport simulation beneath protocol/admission tests, avoiding two heavy WebGL pages where a headless protocol harness proves the same authority boundary.
7. Add context-loss/restore, focus/pointer-lock, resize and lifecycle tests.
8. Add renderer/resource soak telemetry and repeated host/join/rematch cycles.
9. Create `docs/bugs/PASS25_BUG_LEDGER.md`; every fix is test-first.

Exit gate:

- zero known P0/P1 correctness defects;
- every found bug has a regression test and exact reproduction artifact;
- no frozen gameplay-contract delta;
- no unexplained console/page errors;
- multiplayer chaos cannot manufacture identity, health, ammo, score, drops, windows or effects.

## Phase 2 — One representative 2025 visual vertical slice

Do not modernize the entire map first. Build and review one complete route:

- one spawn/exterior lane;
- one house threshold and interior;
- one close enemy;
- one breakable window;
- one death drop;
- every weapon in hip/ADS/fire/reload;
- one grenade and one Yardhawk event;
- all three public profiles.

Art direction: original stylized tactical realism, preserving the current color/team language.

Acceptance tribunal:

- matched baseline/new contact sheets and short motion captures;
- score first-person presentation, operators, animation, architecture, combat feedback, audio, UI, lighting/art cohesion, performance and reliability;
- target overall ≥ 8.5/10 with no category below 8 before scaling;
- owner prefers the new slice without reporting a change in movement, aiming or combat feel.

If the slice fails, revise or reject the art direction. Do not spread a mediocre asset pipeline across the whole arena.

## Phase 3 — Environment/material/lighting reconstruction

Highest-value, lowest-gameplay-risk work:

1. Add original normal and ORM maps to key surfaces: asphalt, concrete, grass/soil, siding, brick, timber, plaster/interior, roof and metal.
2. Add a project-controlled sky/environment source and PMREM image-based lighting.
3. Bake static AO/light information where it improves contact and interior depth without duplicating dynamic shadows.
4. Separate static world shadowing from moving actor contact/shadow presentation so actors cannot freeze into the cached map.
5. Add small silhouette bevels only on hero edges; use normal maps/trim sheets for secondary detail.
6. Add restrained decals and route storytelling: wear, drainage, utility fixtures, curb transitions, door/window trim, interior ceiling/soffit finishes and authored foliage clusters.
7. Preserve every authoritative opening/collider and validate visual-occlusion parity.
8. Convert to KTX2 and evaluate Meshopt after the uncompressed authored result is approved.

Initial Blender-profile planning ceilings for the representative combat camera:

- target ≤ 75 render calls;
- target ≤ 95,000 triangles;
- hard ceiling remains the existing verified project budget unless explicitly revised with evidence;
- arena GLB transfer target ≤ 6 MiB;
- measured texture GPU allocation and loading hitch must not regress the frozen profile budget;
- normal foreground p95 frame time and input-to-next-frame must not worsen by more than 5% versus the measured Pass 24 baseline.

These are planning ceilings, not substitutes for the real hardware baseline.

## Phase 4 — First-person weapon and operator presentation

This is likely the largest perceptual jump after materials.

### First person

- Replace blocky/procedural-looking hand silhouettes with an original or licence-clean, owner-approved authored glove/forearm presentation.
- Keep socket-driven grip/support/reload/ADS and the authoritative camera ray.
- Author weapon-specific idle, movement inertia, sprint, fire, reload and melee silhouettes from one normalized gameplay timeline.
- Improve model roughness/metal response, sights, moving magazines/bolts/pumps and near-camera materials.
- Keep recoil and camera impulses unchanged; presentation follows gameplay, never the reverse.

### Third person

- Produce an original/licence-clean modern operator slice with PBR materials and LODs.
- Retain gameplay hit proxies and network pose schema.
- Layer locomotion, upper-body aim, fire/reload/melee/hit/death, support-hand IK and grounded foot placement as presentation.
- Validate grip position and angle, elbow reach, wrist twist, muzzle alignment, clipping and projected pixel size.

Acceptance:

- all weapons: hip, settled ADS, sprint, fire/recovery, reload beats, switch and melee;
- 1280×720 and 1920×1080 in all three profiles;
- complete rear-to-front sight line centred within 1 CSS px;
- no camera near-plane clipping or detached/tube limbs;
- no hitbox, timing, spread, recoil or network-contract delta;
- LOD/profile reductions preserve identity and combat readability.

## Phase 5 — Combat feedback, audio, HUD and restrained post

### Effects

- Pool and prewarm muzzle smoke, impact debris, glass, casings and explosive effects.
- Add material-specific impacts, short-lived decals and bounded dynamic muzzle/explosion light only where prewarmed and budgeted.
- Keep particles off the camera-centre target silhouette and derive them from the authoritative winning trace.

### Audio

- Add separate first-person and positional world buses.
- Use `PannerNode` for remote guns, footsteps, impacts and explosions.
- Add collision-ray occlusion/low-pass and restrained indoor/outdoor tails.
- Upgrade weapon sounds with original transient/body/mechanical/tail layers while preserving event times and competitive audibility.
- Add master limiter and prewarm first-use audio paths.

### HUD/UI

- Preserve information, key bindings and reticle position while reducing chunky retro framing.
- Use sharper typography, consistent spacing, modern iconography, restrained glass/solid panels and brief state-driven motion.
- Keep ammo, health, support readiness and interaction prompts readable at a glance.
- Improve settings/loading/error/reconnect states and expose motion-reduction/audio/accessibility controls.
- Reduce or remove full-screen animated grain if measured compositor cost or visual review shows no benefit.

### Post-processing

Permitted only for Quality/Blender after A/B proof:

- final `OutputPass`;
- optional measured SMAA if it improves edges over current MSAA/DPR;
- subtle color grade;
- selective, low-intensity bloom on authored emissive sources only.

Explicitly excluded from competitive gameplay:

- motion blur;
- depth-of-field blur;
- chromatic aberration;
- heavy vignette;
- full-screen film grain;
- bloom that changes enemy/reticle visibility;
- camera shake that changes the authoritative aim reference.

## Phase 6 — Complete release gate and isolated review

Required before owner review:

1. TypeScript/lint and all deterministic tests.
2. Frozen gameplay-contract diff: empty unless a separately approved bug correction changed an invariant.
3. Seeded replay/state hashes.
4. Bounded Chromium matrix and Firefox smoke.
5. Visual snapshot comparison with every intentional diff reviewed.
6. Real-controller traversal of every declared route both ways.
7. Every weapon/stance/ADS/reticle/action matrix.
8. Network chaos plus repeated host/join/rematch/disconnect cycles.
9. 20-minute active soak and bounded resource telemetry.
10. Normal-display and unlocked real-GPU measurements for Performance, Quality and Blender Render.
11. Build, dependency audit, provenance, release-tree and forbidden-asset checks.
12. Durable three-profile perceptual tribunal ≥ 8.5/10 overall, no category below 8.
13. Exact tested artifact copied only to a new additive Pages subtree.
14. Public HTTPS assets, console, gameplay, multiplayer and review-tree preservation verified.
15. Canonical root unchanged until Dave explicitly approves promotion.

## 7. Priority order

### P0 — do before visual implementation

1. Generate the frozen gameplay contract and golden replays.
2. Pin package versions.
3. Add deterministic RNG separation and failure seeds.
4. Add visual baselines and durable evidence manifests.
5. Reproduce/discharge static-shadow actor behavior.
6. Encode reliable bounded E2E orchestration and failure traces.
7. Add network chaos and lifecycle/soak coverage.

### P1 — biggest modernity gains

1. Normal/ORM + IBL + static AO/contact definition.
2. First-person arms/weapon presentation.
3. Third-person operator/animation presentation.
4. Positional/occluded layered audio.
5. Modern HUD hierarchy and interaction states.

### P2 — after core presentation is approved

1. Restrained profile-specific composer.
2. KTX2/Meshopt optimization.
3. Secondary decals, foliage variation and environmental storytelling.
4. Accessibility and settings polish.

### Defer

- production WebGPU migration;
- navmesh/gameplay redesign;
- weapon or movement rebalance;
- new map topology;
- authoritative-server rewrite;
- photoreal asset escalation before the vertical slice passes;
- expensive SSR/volumetric fog/motion blur/DOF/chromatic effects.

## 8. Independent-research reconciliation

Two independent research workers completed after the initial plan commit. Both independently converged on the same frozen-gameplay, WebGL, cohesive-stylized-PBR and staged-vertical-slice direction. The following stricter gates are adopted for Pass 25A and the eventual release candidate:

- Reticle placement is the projection of the authoritative aim ray into the **actual canvas bounds**, never `window.innerWidth / 2`; resize, DPR, dynamic resolution, viewmodel transforms and post-processing cannot redefine it.
- Authored constants, simulation ticks, shot schedules, ammo, damage and state transitions require exact equality. Nondeterministic presentation traces must remain within 1% at the median and 3% at p95 versus Pass 24.
- Run at least 10,000 generated model/state command sequences per pull request and 100,000 nightly. Retain and shrink every failing seed.
- Add mutation testing for changed physics, combat, protocol and state-core modules: every hand-seeded authority fault must be killed, with an initial target of at least 85% mutation score in that critical core.
- Require 20/20 clean and normal-impairment host/join/combat/rematch cycles plus a 30-minute normal-network soak. Measure RTT and jitter from WebRTC statistics rather than inferring network quality.
- Normal impairment starts at 80 ms RTT, ±20 ms jitter, 1% loss and bounded duplication/reordering. Adverse testing adds 200 ms RTT, ±50 ms jitter, 5% loss and a two-second outage; it may degrade feel but may not create invalid state or an unrecoverable silent connection.
- Add WebKit boot/menu/fallback capability smoke and branded Chrome/Edge release checks. Full Pointer Lock gameplay is required only on browser paths that support it honestly.
- For a measured credible refresh interval `T`: foreground p95 frame interval ≤ `1.5T`; fewer than 1% of frames exceed `2T`; input-to-next-render p95 ≤ `2T`; no steady-combat game-attributable main-thread task exceeds 50 ms.
- Where supported, collect asynchronous `EXT_disjoint_timer_query_webgl2` samples and discard disjoint results. A VSync-limited foreground result and an unlocked real-GPU headroom result remain separate evidence.
- After 20 rematches, entity/resource counts return to baseline; post-GC heap remains within 10% of its settled start; ten-minute heap slope stays below 1 MiB/minute.
- Evaluate a dedicated presentation-only viewmodel layer/camera in the visual slice to improve near-plane clipping and proportions. Keep it only if the world-camera aim ray, tracer convergence and every profile budget remain unchanged.
- Accessibility ships with presentation: keyboard-visible focus, remappable controls, mouse sensitivity/invert-Y, hold/toggle options, reticle presets, separate audio buses, non-color-only warnings, 4.5:1 normal-text contrast, 3:1 large/non-text contrast, and `prefers-reduced-motion` support with controls for bob, sway, shake, FOV transitions and full-screen damage pulses.
- Retries can classify flakiness but cannot turn a failed first attempt into a green release claim.

Additional primary sources:

- Three.js WebGL renderer: <https://threejs.org/docs/pages/WebGLRenderer.html>
- MDN WebGL best practices: <https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices>
- Khronos GPU timer query: <https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/>
- Playwright projects: <https://playwright.dev/docs/test-projects>
- Playwright Clock: <https://playwright.dev/docs/clock>
- fast-check model-based testing: <https://fast-check.dev/docs/advanced/model-based-testing/>
- W3C WebRTC Recommendation (2025): <https://www.w3.org/TR/2025/REC-webrtc-20250313/>
- W3C WebRTC statistics draft (2025): <https://www.w3.org/TR/2025/CRD-webrtc-stats-20250925/>
- WCAG 2.2 contrast: <https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html>
- MDN reduced motion: <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion>

The repository-audit worker timed out after starting an unnecessary heavyweight Playwright run. The exact project-owned worker/browser process tree was terminated. It produced no accepted finding or edit; the main-agent source audit and the two complete independent research reports are the reconciled evidence.

## 9. Recommended first implementation package

If approved, begin only with **Pass 25A — Baseline and Bug Harness**:

1. exact dependency pins;
2. gameplay-contract generator and checked baseline;
3. seeded RNG/time/input seams;
4. golden replay/state hash tests;
5. stable three-profile screenshot baselines;
6. retained traces and bounded E2E runner;
7. static/dynamic shadow reproduction;
8. context-loss, pointer-lock/focus and network-chaos probes;
9. bug ledger;
10. no visible or gameplay changes.

Pass 25B would then deliver one owner-reviewable modern visual slice. Only after that slice is accepted should the pipeline scale to the full arena.
