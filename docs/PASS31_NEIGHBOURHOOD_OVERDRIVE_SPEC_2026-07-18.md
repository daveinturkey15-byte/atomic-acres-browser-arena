# Atomic Acres — Pass 31 Neighbourhood Overdrive

Date: 2026-07-18
Status: implementation locked; canonical Pass 30 remains unchanged until an isolated HTTPS review passes

## 1. Release-blocker corrections carried forward

1. Every multiplayer explosive hit carries a validated source; Tri-Pass alone receives the full 15 m receiver allowance, while grenades and other supports keep their bounded source-specific limits.
2. Unused Hunter Swarm and Nuke rewards are cleared on death; repeatable 3/5/7 rewards retain their prior lifecycle.
3. Public/local callsign keys distinguish every accepted separator (`A B`, `A_B`, `A-B`) and migrate version-one local records.
4. Saturated fixed-window rate buckets return 429 without unbounded D1 counter writes.
5. Standard gamepads can select all five rewards with D-pad left/right and activate with D-pad up.

## 2. Combat HUD re-layout

1. Field Supports become five semantic cards: activation key, kill threshold, reward name, and LOCKED/READY state.
2. Text may wrap only inside its own named region and must never overlap card borders or neighbouring HUD panels.
3. Desktop and narrow/short viewports use a compact single-column card rail down the right edge without covering ammo, health, crosshair, or controls.
4. Keyboard, mouse, and gamepad prompts remain visible and coherent.
5. Browser geometry gates assert five cards, minimum font sizes, no clipping, and positive separation at representative desktop and short-height viewports.

## 3. House and neighbourhood art

1. Houses and garages use original deterministic material families rather than one repeated wall treatment: siding, warm plaster, brick, poured concrete, timber trim, weathering/grime and roof variants.
2. Dominant wall surfaces receive bounded albedo, roughness, and normal companions with correct colour-space ownership; variation remains deterministic per house/area.
3. Exterior dressing adds original planters, flower beds, hedges, saplings, bins, hydrants, benches, bicycles, utility boxes, signs, bollards and street clutter while preserving every authoritative route/collider.
4. Lightweight fauna is presentation-only: bounded bird silhouettes and butterfly/moth particles outside combat-critical sightlines, disabled or reduced in Performance/Compatibility.
5. Placement is deterministic and non-colliding unless a visible prop intentionally has a matching authored collider.
6. Blender, Performance and Compatibility profiles lift ambient/hemisphere exposure and add a bounded shadow-side fill so roads, yards and both house levels remain readable without removing the authored dawn contrast.

## 4. Weapon, arms, and animation reconstruction

1. All weapon families receive stronger original silhouettes, coherent material breakup, mechanical parts, sights, magazines/shells, muzzle and ejection sockets.
2. First-person gloves, cuffs, palms, thumbs and fingers remain connected to believable upper/forearm chains.
3. Socket-driven two-hand placement follows each weapon family; support grips follow pumps/moving parts.
4. Fire, recoil, reload-out, reload-in, bolt/pump, sprint, ADS and melee are sampled from one deterministic action timeline.
5. The permanent centre reticle and camera ray remain authoritative. Every principal projectile intersects that ray; physical front/rear sights settle on it before ADS accuracy is granted.
6. Quality and Performance retain the same weapon identity, with bounded detail/LOD differences only.

## 5. Solo pressure and spawn flow

1. Solo uses exactly two low-damage opponents, both rendered with the same source-rigged humanoid operator model, neon-purple uniform treatment, additive haze sprite and bounded local glow.
2. Bot damage multiplier decreases from `0.5` to `0.25` (half the current damage).
3. Existing 22 m fire cutoff, reaction delay, range-dependent aim error, bounds checks, cover trust, and respawn protection remain.
4. Player and bot spawns use hard minimum-exposure tiers, occupancy rejection, previous-spawn avoidance and bounded top-pool variation.
5. A spawn side flips only under sustained hostile pressure when the opposite authored side is materially safer; the selected facing points toward the arena centre.
6. Spawn telemetry records home/flipped side, exposure tier and previous index. Repeated forced-respawn QA proves safety and non-repeat behaviour.

## 6. Centre Overdrive pickup

Original identity: **Overdrive Core** (mechanically inspired by classic arena damage amplifiers; no copied Unreal assets, audio, iconography or presentation).

1. Spawn point: authored centre-map point on the road median/crossing, collider-clear and visible from multiple lanes.
2. Respawn cadence: exactly 120,000 ms from match start and after each consumption.
3. Active duration: exactly 15,000 ms.
4. Damage multiplier: exactly `4x` for authoritative outgoing gun, melee, grenade and damaging Field Support calculations; incoming damage is unchanged.
5. Pickup radius and player-state validation are bounded. A dead, out-of-bounds, or implausibly positioned peer cannot claim it.
6. Host resolves multiplayer claims, broadcasts one generation/state transition, and rejects duplicate/nonced races. Clients never self-authorize the buff.
7. Solo uses the same pure state machine locally. Replay/telemetry records spawn, pickup, expiry, holder and multiplier deadlines.
8. Presentation uses an original teal-violet rotating core, controlled glow, HUD timer and synthesized pickup/expiry cue. It is prewarmed and bounded; no unbounded point-light or particle allocation.

## 7. Verification and release

- Focused unit tests for every new pure contract and all five carried hotfixes.
- Gameplay contract/replay updates only for explicitly approved bot and Overdrive mechanics.
- Full lint, type-check, Vitest, build, dependency, release-tree and diff gates.
- Solo browser proof: two matching neon-purple haze bots at quarter multiplier, safe/flip spawns, brighter route/interior luminance, Overdrive spawn/claim/4x/expiry, compact vertical support HUD, no console errors.
- Two-peer proof: one authoritative Overdrive winner, replicated timer/expiry and 4x damage, source-aware Tri-Pass acceptance between 6.2 m and 15 m.
- Visual matrix: each weapon at hip/ADS/fire/reload/sprint/melee; both houses/garages and exterior dressing in Quality/Performance; desktop and short-height HUD.
- Renderer calls/triangles remain within approved profile ceilings; flora/fauna and wall variation are bounded.
- Publish only to an additive isolated `review/pass31-*` HTTPS subtree. Preserve the canonical root and every existing `review/*` archive until Dave approves promotion.

## 8. Pass 31.3 authored-cover and viewmodel polish

1. Firing the final round automatically enters the existing deterministic reload pathway when reserve ammunition exists. An empty magazine cannot cancel that reload by holding fire, while manual reload, ammo accounting and action events remain unchanged.
2. The centre route contains two original modeled transit-bus assets with body shells, glazing, doors, destination panels, wheel assemblies, mirrors and lamps. Matching authoritative AABBs block both movement and shots across more than ten metres of cover length.
3. Both houses receive original furnishing sets: dining tables and chairs, sofas, media consoles, upstairs beds, shelving and workstations. Asset markers and Blender telemetry prove two bus assets and two furnishing sets are present in the shipped GLB.
4. Quality viewmodels preserve authored PBR weapon materials, normal/roughness maps, receiver details and separate anatomical glove/finger parts. Reduced profiles retain merged bounded representations.
5. The field knife adds a shaped blade, fuller, guard, ridged wrap and pommel, with a forearm silhouette extending naturally out of frame.
6. Atmosphere adds five shader-driven, texture-free smoke/haze plumes alongside ten pooled ground-mist cards. The pass remains presentation-only, uses two submissions, performs no per-frame allocation or volumetric ray marching, and stays disabled by default on reduced/software profiles.
7. Upper-floor house glazing is transparent (`opacity 0.2`, no depth write) while its existing breakable-window and collision authority remains unchanged.
