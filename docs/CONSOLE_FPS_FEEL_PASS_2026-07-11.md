# Atomic Acres — Console-FPS Feel Pass

**Date:** 2026-07-11  
**Branch:** `overhaul/console-fps-feel-pass`  
**Status:** implementation candidate; the existing public preview remains unchanged until Dave approves a verified replacement.

## Product target

Raise Atomic Acres from a functional browser prototype to an original, high-intensity early-2010s console-arena FPS in responsiveness, combat cadence, audiovisual feedback and spatial readability. Inspiration is limited to genre-level qualities: immediate input, compact three-lane pressure, readable silhouettes, punchy weapon feedback, fast respawns and strong information hierarchy.

Do **not** reproduce protected names, branding, character models, audio, textures, code or the exact geometry/prop arrangement of any Call of Duty or Nuketown release. Atomic Acres remains its own asymmetric retro-future test-town.

## Observed baseline problems

1. Horizontal velocity uses additive acceleration followed by exponential friction, producing a low terminal speed well below the declared maximum and a mushy stop/start response.
2. Mouse input has one sensitivity curve; ADS does not reduce sensitivity, and recoil directly mutates aim pitch without a deliberate spring/impulse model.
3. Crouch and eye height snap instantly. Sprint accepts any movement direction and does not communicate state strongly through camera/weapon/audio.
4. Gunshots are short oscillator tones plus unfiltered noise. Reload, hit and footstep sounds lack layered transients, mechanical detail, variation and mix control.
5. Weapons lack strafe inertia, idle breathing, shell/impact feedback, multi-stage reload motion and differentiated muzzle behavior.
6. Arena houses, cover and street dressing use broad box silhouettes with too little trim, depth, signage, furniture, foliage, utility infrastructure or material breakup.
7. Bots select a simple chase/retreat/strafe decision every frame and fire single periodic shots; they do not patrol lanes, react, use bursts or communicate intent.
8. Damage feedback lacks direction, impact type, suppression, healing timing and a strong kill/headshot reward hierarchy.
9. HUD is functional but visually static; it does not animate ammo, spread, health recovery, score events or contextual prompts.
10. Full-quality rendering has tone mapping and shadows but no coherent color-grade/grain layer or authored ambient motion.

## Planned systems

### Movement and controls

- Replace friction-limited additive acceleration with target-velocity convergence and separate grounded acceleration/deceleration/air control.
- Require meaningful forward input for sprint; preserve diagonal normalization.
- Add coyote time and jump buffering while retaining the Rapier controller.
- Smooth crouch camera/weapon stance; block jumping while crouched or ADS.
- Apply ADS mouse sensitivity scaling and optional toggle-crouch setting while keeping hold-to-ADS as the default.
- Add camera roll, landing dip, sprint FOV and lateral/longitudinal movement impulse without compromising aim stability.

### Combat and weapons

- Add deterministic recoil impulse helpers with weapon-specific vertical kick, horizontal jitter and spring recovery.
- Give each weapon a distinct cadence, first-shot accuracy, sustained bloom and recoverable recoil personality.
- Add impact flashes, world sparks/dust, shell ejection and weapon-specific muzzle flash geometry.
- Improve reload/switch/melee/grenade pose staging and synchronize mechanical audio cues.
- Add directional damage state, healing delay and a clearer headshot/kill confirmation ladder.

### Audio

- Replace single-tone cues with cached procedural noise, filtered transient/body/tail layers and a compressor-limited mix.
- Add weapon-specific mechanical tails, varied footsteps, jump/land, damage, headshot, kill, weapon-switch and grenade-bounce cues.
- Use small deterministic pitch/volume variations to avoid repetition without external copyrighted samples.

### Arena and visuals

- Preserve the original Atomic Acres footprint while strengthening three-lane readability and original landmarks.
- Add layered facades, doors, awnings, window reveals, interior furnishing silhouettes, garden walls, sidewalks, lane paint, street/utility props, utility wires, foliage clusters and readable cover dressing.
- Add original district signage and team-color wayfinding rather than copied map labels.
- Improve material breakup, ambient occlusion cues, shadow-catching trim, lighting contrast, sky depth and a restrained CSS color-grade/grain overlay.
- Keep compatibility mode and existing performance budgets intact.

### Bots, HUD and multiplayer presentation

- Add patrol waypoints, reaction delay, burst fire and lane selection while retaining analytic line-of-sight.
- Animate HUD spread/ammo/damage/score events; add directional damage arcs and contextual action text.
- Preserve the existing peer-to-peer protocol and two-browser join flow; do not introduce an account/backend service.

## Mechanical acceptance checks

- **C1 — Originality:** no protected branding/assets/exact copied layout; asset manifest lists only project-generated art.
- **C2 — Movement math:** unit tests prove target-speed convergence, grounded braking, sprint eligibility, jump buffering/coyote timing and ADS movement constraints.
- **C3 — Recoil/spread:** unit tests prove bounded impulse, recovery, first-shot accuracy and weapon differentiation.
- **C4 — Audio runtime:** browser smoke produces no AudioContext/runtime error and every new cue is callable after unlock.
- **C5 — Weapon presentation:** deterministic debug state can exercise fire, ADS, reload, switch, melee and grenade poses without exceptions.
- **C6 — Map flow:** every spawn has a clear forward path; all three lane families remain traversable; added cover is reflected in authoritative collision/LOS data.
- **C7 — Bots:** unit tests prove reaction delay/burst behavior and browser tests prove four bots navigate, engage and respawn.
- **C8 — HUD/feedback:** browser tests observe directional damage feedback, ammo/reload state, hit/headshot/kill feedback and health recovery.
- **C9 — Multiplayer:** real two-page PeerJS smoke reports one remote on both host and guest with no page/console errors.
- **C10 — Performance:** existing compatibility-mode `>=40 FPS`, `<=180` draw calls and `<=350,000` triangles gates remain unchanged and pass.
- **C11 — Full verification:** TypeScript, all unit tests, production build and all Chromium scenarios pass; `npm audit --audit-level=high` reports no high-severity issue.
- **C12 — Visual proof:** fresh full-quality menu/gameplay screenshots show the new authored pass with no blank/missing materials, obvious clipping or release-blocking visual defect.

A green verifier proves only these checks. It is not a claim of feature parity with a proprietary AAA game, and browser/network/device differences remain residual risks.

## Implemented candidate — 2026-07-12

### Controls, locomotion and physics

- Replaced friction-derived movement with explicit target-velocity acceleration/deceleration, distinct ground/air control and collision-response velocity derived from Rapier's applied movement.
- Added forward-only grounded sprint, smooth crouch height, camera roll/bob/landing impulse, sprint and ADS FOV, coyote time and jump buffering.
- Added standard-controller support: radial deadzones and response curves, twin-stick look, triggers for ADS/fire, A jump, B crouch, X reload, Y weapon switch, LB frag, RB melee and stick-click sprint.
- Added swept-sphere grenade collision and bounce response so fast throws cannot tunnel through thin authored walls. Blast damage and remote hit delivery now respect analytic cover occlusion.

### Combat and presentation

- Added frame-rate-independent automatic-fire scheduling, uniform circular-cone spread, recoil pitch/yaw impulses and spring recovery.
- Rebuilt the first-person pose system with ADS, sprint posture, movement lag, sway, recoil, landing response and procedural gloved arms/hands. The carbine now uses an open optic rather than a large block sight.
- Added impact flashes, directional damage feedback, delayed health regeneration, animated ammunition state and richer stance/spread telemetry.
- Layered synthesized gun, impact, damage, kill, switch, footstep, landing and grenade-bounce cues through dedicated buses, plus an original procedural ambient bed. No external weapon or UI samples are used.

### Arena, bots and rendering

- Added sidewalks, generated grass/roof materials, richer facades/interiors, utility poles and batched wires, a trellis/greenhouse route, east service walls, solar canopy, service garages, original signage, fuller foliage and deliberate lane collision proxies.
- Added warm interior lighting, daylight grading, shadow-lift handling, CSS vignette/grain and a dedicated menu overview with the weapon hidden.
- Added bot patrol points, line-of-sight acquisition delay, reaction gating, burst cadence, strafing and route-oriented movement.
- Decorative geometry does not become shot collision by accident; intentional gameplay blockers and collision proxies remain authoritative.

### Verification evidence

- `npm run verify`: **passed**.
  - TypeScript lint: passed.
  - Unit: **37/37** across six files.
  - Production build: passed.
  - Chromium: **9/9** scenarios.
  - Compatibility performance assertion remains `>= 40 FPS`, `<= 180` draw calls and `<= 350,000` triangles; passed without lowering the gate.
- `npm audit --audit-level=high`: **0 vulnerabilities**.
- Local release capture: passed with no console errors and fresh full-quality menu/gameplay screenshots.
- Two-page PeerJS smoke: host and guest each reported one remote; no errors.
- Full-quality diagnostic capture: 287 draw calls / 392,560 triangles. This is above the compatibility budget but is an intentional richer desktop presentation; compatibility mode remains the performance-gated path.
- The live GitHub Pages preview remains on the earlier stable revision and was not changed.

### Honest limitations

This is a much stronger browser FPS candidate, not parity with a native proprietary AAA release. Art remains procedural and stylized, first-person hands are geometric rather than rigged/skinned, audio is synthesized rather than sample-library production, network authority remains peer-to-peer, and mobile/touch controls are not implemented.