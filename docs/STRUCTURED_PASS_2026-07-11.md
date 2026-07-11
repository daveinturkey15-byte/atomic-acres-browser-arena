# Atomic Acres — Structured Mechanics & Art Pass

Date: 2026-07-11
Branch: `overhaul/structured-mechanics-art-pass`
Model of record: `gpt-5.6-sol` / high reasoning
Status: verified release candidate; approved for isolated V2 preview deployment

## 1. Problem statement

The current V2 foundation is technically green but fails the owner playtest. It feels clunky, does not provide the complete verbs and feedback expected of a fast small-map arcade FPS, and visibly relies on low-poly Kenney vehicles/weapons plus primitive flat-colour architecture. A build, screenshot, or signalling handshake is not product fitness.

This pass must improve a coherent playable loop—not rush an arbitrary milestone. The existing stable release remains untouched. The V2 preview may be replaced only after all local gates pass and the deployed revision is re-tested.

## 2. Current observations

- Movement has acceleration, sprint, jump, ADS speed and Rapier collision, but no crouch/stance, landing recovery, stamina/tempo feedback, or settings.
- Combat has cadence, ammo, reload, recoil, spread and raycast occlusion, but spread is not movement/ADS aware, there is no falloff/headshot distinction, reload phases, melee, grenade, weapon-switch lockout or kill feedback depth.
- Solo mode is six stationary targets, not a match against opponents.
- Match state is local, starts instantly, and has no warm-up/rematch state machine.
- Multiplayer relays client-reported hits/deaths/scores and remains friendly-session only.
- The arena is primarily box geometry with decorative non-traversable upper house blocks.
- Visible Kenney weapon/vehicle models are stylistically toy-like and were explicitly rejected by the owner.
- The deployed preview is technically clean except for a Rapier initialization deprecation warning; baseline checks are 13/13 tests plus TypeScript/build.

## 3. Scope for this pass

### R1 — Controller feel

- Add deterministic stance/speed tuning with standing and crouched eye heights.
- Add crouch toggle, sprint cancellation while crouched/ADS, landing impulse, air-control limit and head-bob/weapon-motion damping.
- Preserve fixed-step Rapier movement, wall sliding, autostep and ground snap.
- Expose sensitivity and FOV settings in the pause menu.

### R2 — Weapon and combat loop

- Move weapon tuning into a testable module.
- Add hip/ADS/movement spread, recoil recovery, damage falloff and head/body multipliers.
- Add weapon-switch delay and staged reload state with interruption rules.
- Add close-range melee with cooldown and feedback.
- Add one cookable frag grenade with throw arc, fuse, blast falloff and refill on respawn.
- Add headshot/kill hitmarker variants, muzzle flash, impact particles and shell ejection.

### R3 — Meaningful solo play

- Replace stationary-target-only training with a configurable bot skirmish.
- Bots must spawn, acquire the player, move between cover/waypoints, respect simple line of sight, fire bounded damage, die and respawn.
- Keep a separate no-pressure target range option only if it remains useful.

### R4 — Match flow

- Add warm-up/countdown, active, ended and rematch states.
- Spawn protection must be visible and expire predictably.
- Score/time victory, death/respawn and rematch must reset all combat state.

### R5 — Visual identity and assets

- Remove visible Kenney blasters and central vehicles from the release scene.
- Use original Atomic Acres weapon/vehicle/environment art; no protected game assets or copied map geometry.
- Add authored texture maps for siding, brick, concrete, asphalt, painted metal, wood and weapon surfaces.
- Add bevelled silhouettes, trim, windows, doors, gutters, utility props, garden clutter, street markings, damage/wear decals and coherent retro-future signage.
- Make at least one house interior materially believable and traversable; do not leave a sealed decorative upper-storey cube.
- Improve sky, lighting, fog, shadows and colour grading without obscuring combat readability.

### R6 — Performance and maintainability

- Keep the main app chunk under 250 kB gzip and isolate Rapier.
- Target <= 180 draw calls and <= 350k visible triangles in the representative solo view.
- No individual uncompressed texture above 2048×2048; prefer repeatable 512/1024 maps.
- Split gameplay state/tuning, effects, bot logic and art construction out of `main.ts` where practical.

## 4. Acceptance criteria

- **C1:** `npm run lint`, `npm test`, and `npm run build` exit 0 on the exact final revision.
- **C2:** Unit tests cover stance/speed, spread, recoil recovery, fire cadence, reload interruption/completion, falloff, headshot multiplier, melee range/cooldown, grenade blast falloff, match transitions and bot decision bounds.
- **C3:** A real browser solo run proves: start, pointer lock, forward/strafe movement, jump, crouch, ADS, fire, reload, switch, melee, grenade, bot damage, bot elimination, player death and respawn.
- **C4:** Collision QA proves free movement from every spawn, wall blocking, sliding, floor stability and at least one interior/stair route.
- **C5:** Visual QA captures menu, street/vehicle encounter, both house exteriors, representative interior, side lane, each weapon in hip/ADS, grenade and combat effects. No visible Kenney low-poly blaster/firetruck/delivery model remains.
- **C6:** Browser console has no uncaught errors, missing assets or GLTF texture errors. The Rapier deprecated-init warning is removed.
- **C7:** Runtime debug metrics report draw calls/triangles and meet the declared representative-view budgets, or the miss blocks deployment.
- **C8:** A two-peer browser test proves host/join, roster appearance, movement replication and disconnect cleanup. Hit authority limitations remain explicitly disclosed unless replaced and tested.
- **C9:** Asset manifest records every external or generated asset. Secret/license scan is clean.
- **C10:** The isolated HTTPS V2 preview returns 200, loads all hashed JS/CSS/assets, has a clean deployed console, and matches the tested revision. Stable V1 remains untouched.

## 5. Banned shortcuts

- No ripped/copyrighted models, textures, audio or exact map extraction.
- No renaming a low-poly pack and calling it original production art.
- No screenshot-only verification.
- No weakening tests or acceptance criteria to make the pass green.
- No deploying a half-implemented milestone merely to show activity.
- No claims of “fully authoritative”, “bug-free”, or “Nuketown recreation”.

## 6. Delivery rule

Work remains local until C1–C9 pass. Deploy only the exact verified revision to the existing isolated V2 preview, then run C10. Report residual limits plainly and ask for owner playtest feedback before promoting anything to the stable public release.
