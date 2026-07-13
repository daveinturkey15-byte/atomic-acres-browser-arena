# Atomic Acres Pass 12 — Responsive Presentation and Synchronization

Date: 2026-07-13
Baseline: Pass 11 source/documentation `04f6d72`; canonical Pages `2f44037`

## Trigger

Dave reported that the canonical Pass 11 build remained slow, laggy, and perceptually behind synchronization. This live report falsifies Pass 11's user-facing smoothness claim even though an isolated Windows AMD run with browser VSync/frame limiting disabled exceeded 60 FPS.

## Observed facts and hypotheses

Observed:

- Windows currently presents through MikeTheTech Virtual Display Driver at 1920×1080 / 30 Hz.
- Normal VSync `requestAnimationFrame` is therefore capped near 30 Hz, imposing at least 33.3 ms presentation intervals.
- Pass 11 balanced public gameplay was 412 calls / 269,514 triangles in the inspected active view.
- The unlocked AMD sample averaged 63.64 FPS but had p95 frame time 31.7 ms. It had insufficient margin for a stable 60 Hz experience.
- Peer snapshots transmit every 60 ms (~16.7 Hz) and remote roots add exponential smoothing with a ~77 ms time constant (`13 s⁻¹`), creating visible remote lag beyond network transport.

Hypotheses to verify:

- The 30 Hz virtual display is the largest local input/presentation latency source.
- Detailed first-person and operator presentation account for most recurring full-art draw submissions.
- Increasing performance margin and reducing queued/compositor latency will improve responsiveness once the display is 60 Hz, while a low-refresh warning prevents a false claim.
- Faster state cadence plus a shorter bounded interpolation delay will reduce multiplayer visual trailing without changing authority.

## Requirements

R1. Default to a responsive, original-art representation with enough clean AMD headroom for stable 60 Hz rather than merely averaging just above 60 with VSync disabled. Keep costly textured lighting/shadows in Quality; responsive mode preserves authored object colours through a small palette-batched world representation.

R2. Retain a separate Quality profile with complete Pass 10/11 geometry and dynamic shadows.

R3. Detect actual normal-path frame cadence in-app and expose it through sanitized telemetry. Warn clearly when presentation is display-capped below 55 Hz; do not call a 30 Hz path 60 FPS.

R4. Prefer the stable hardware-accelerated WebGL presentation path. Do not enable Chromium's `desynchronized` context hint if antialiased browser QA shows a stall; lower latency must come from bounded work and frame pacing rather than an unstable context mode.

R5. Reduce remote snapshot interval and interpolation lag while preserving validated snapshots, connection identity binding, authoritative collisions/hits, and bounded effects.

R6. Preserve original art, match rules, camera-ray fire authority, bot policy, collision, hit proxies, and historical review builds.

## Mechanical acceptance checks

C1. TypeScript lint, all Vitest tests, production build, and complete Chromium suite pass on the exact release revision.

C2. Clean isolated Windows AMD unlocked default-profile test reaches at least 90 FPS with p95 <= 20 ms, no frame > 50 ms, <= 120 draw calls and <= 150,000 triangles in active solo gameplay.

C3. Normal-VSync telemetry identifies the current ~30 Hz display cap and shows a visible low-refresh warning; it must not claim that 30 Hz is 60 FPS.

C4. Compatibility remains <=180 calls / <=350,000 triangles and >=40 FPS in the existing constrained browser gate.

C5. Local and public two-browser QA verifies reciprocal remote presence, movement-state delivery, zero page errors, snapshot freshness, and lower synchronization delay settings.

C6. Visual review confirms the responsive default remains readable and recognizably Atomic Acres; Quality preserves the complete full-art path.

C7. Deployment adds only `review/pass12/` plus canonical root assets/index; Pass 03–11 checkpoints remain unchanged.

## Out of scope

- Replacing the installed virtual display driver or forcing a disruptive driver restart.
- Changing damage, movement speed, fire cadence, bot strength, match duration, score limit, or authoritative networking model.
- Claiming 60 visibly presented frames while Windows remains configured at 30 Hz.

## Implemented correction

- The default `balanced` profile is now a deliberately responsive representation: reduced world/presentation micro-detail, antialiasing retained, pixel ratio capped at `0.85`, shadows disabled, and static meshes grouped into a small set of original Atomic Acres palette materials.
- The complete textured world and dynamic shadows remain available through `quality`.
- Canvas-authored signs remain separate from palette batching; transparent geometry is grouped by colour and opacity.
- A latent compatibility bug was fixed: ordinary `MeshStandardMaterial` instances have a black emissive colour with default intensity `1`; the old flattener blended that inactive black emissive channel over every base colour, producing an almost black world. Emissive contribution is now applied only when the emissive colour is genuinely non-black. Unit and browser palette assertions cover the correction.
- A rolling 180-frame cadence sampler exposes median, p95, maximum frame interval and inferred cadence. A visible warning appears below 55 Hz with the real measured limit and the 60 Hz remedy.
- Peer snapshots now transmit every `33 ms` instead of `60 ms`; exponential remote smoothing increased from `13 s^-1` to `24 s^-1`. Identity binding, sender admission, hit validation and authority are unchanged.
- Remote debug telemetry exposes snapshot age and visual interpolation error for two-browser verification.
- Chromium's `desynchronized` WebGL hint was tested and rejected: antialiased browser QA stalled for over 60 seconds. The stable standard hardware WebGL path remains in use.

## Local verification evidence

Exact game/source revision: `e0eec5d`.

Deterministic and browser gates:

- TypeScript lint: passed.
- Vitest: `98/98` tests passed across `23` files.
- Production Vite build: passed.
- Functional Chromium: `12/12` scenarios passed.
- Responsive constrained-browser budget: passed.
- Compatibility constrained-browser gate: passed in an isolated browser process.
- Local two-browser WebRTC QA: host/client each saw one remote; errors `[]`; cadence `33 ms`; interpolation rate `24 s^-1`; final full-gate sampled remote snapshot age `1.5 ms`; interpolation error `0.00048 m`.
- Final responsive and Quality visual review: passed. Responsive is flatter by design but retains route geometry, team colours, HUD, weapon readability and authored signage; Quality retains full textures/shadows.

Windows AMD/D3D11 unlocked renderer-headroom capture, 1264x625:

| Profile | FPS | p95 | Max | Calls | Triangles |
|---|---:|---:|---:|---:|---:|
| Responsive | 202.82 | 8.0 ms | 14.2 ms | 110 | 63,700 |
| Quality | 60.52 | 31.7 ms | 33.9 ms | 571 | 341,438 |
| Compatibility | 344.82 | 4.3 ms | 7.0 ms | 78 | 54,308 |

The comparable Pass 11 responsive predecessor was `63.64 FPS / 412 calls / 269,514 triangles`; Pass 12 therefore provides roughly `3.19x` unlocked throughput, `73%` fewer draw calls and `76%` fewer triangles in the inspected default active view.

Normal VSync/desktop-path capture with the Chrome window foregrounded:

- measured cadence: `28.82 Hz`;
- median interval: `34.7 ms`;
- p95 interval: `35.3 ms`;
- in-app warning: `29 HZ PRESENTATION LIMIT`;
- Windows display state remained `1920x1080 @ 30 Hz` through `MttVDD`.

This proves the application now has ample rendering headroom, but the current Windows/streaming display path still physically presents only about 29 unique updates per second. Selecting a `60 Hz+` virtual-display or remote-client mode remains required for visibly synchronized 60 Hz motion.

## Technology stack

- **Language/build:** TypeScript, HTML and CSS bundled by Vite 8.
- **Rendering:** Three.js/WebGL2 through ANGLE; original procedural geometry, authored textures and optional GLTF/Draco asset loading; ACES tone mapping and profile-specific batching/shadows.
- **Physics:** Rapier 3D character/world integration plus deterministic TypeScript collision, bounds and combat helpers.
- **Multiplayer:** PeerJS over browser WebRTC data channels; host relay with connection-bound identities, allowlisted protocol messages, remote-shot admission and bounded interpolation.
- **Audio:** procedural Web Audio synthesis for weapons, impacts, movement and interface feedback.
- **Input/UI:** Pointer Lock, keyboard/mouse and Gamepad API; DOM/CSS deployment, loadout, accessibility, HUD and match-flow interfaces.
- **Tests:** Vitest for deterministic modules and Playwright/Chromium for gameplay, rendering budgets, input, menus and multiplayer release verification.
- **Hosting:** static Vite output on GitHub Pages, with immutable `review/passNN/` checkpoints.

## Release evidence

Source revision: `e0eec5d`.

Pages revision: `dd3e594`.

Canonical:

`https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/?release=dd3e594`

Immutable Pass 12:

`https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/review/pass12/?release=e0eec5d`

Public verification:

- canonical and immutable HTML both served the expected `index-DQ9-GZeB.js` bundle;
- public responsive solo telemetry: `110` calls / `63,700` triangles, correct 15-colour palette, `33 ms` state cadence, `24 s^-1` interpolation and zero console/page errors;
- public visual smoke: passed with no black-world, missing-asset, HUD or weapon regression;
- public two-browser WebRTC: host/client each saw one remote, errors `[]`, sampled snapshot age `0.60 ms`, interpolation error `0.000013 m`;
- all Pass 03-11 review files were hash-verified unchanged before publication (`135` preserved files).
