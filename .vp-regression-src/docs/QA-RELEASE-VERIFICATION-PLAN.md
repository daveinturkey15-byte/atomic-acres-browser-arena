# Atomic Acres — QA & Release Verification Plan

**Structured pass:** 2026-07-11
**Branch:** `overhaul/structured-mechanics-art-pass`
**Stack:** Vite · TypeScript strict · Three.js · Rapier · PeerJS · Web Audio · Vitest · Playwright

## 1. Quality policy

A release is blocked unless all of the following are true:

1. `npm run lint` reports zero TypeScript errors.
2. Every Vitest suite passes.
3. `npm run build` succeeds and the production bundle contains the original texture set.
4. Chromium E2E covers boot, authored-art readiness, bot navigation, movement/crouch, firing, weapon switching, staged reload, frag fuse, HUD/minimap/roster, and stability.
5. A full-quality browser pass is completed separately from headless compatibility mode.
6. No uncaught browser exception, failed same-origin asset request, blank canvas, stuck process, or stale deployment is accepted.
7. The public HTTPS revision is inspected after deployment; local success alone is insufficient.

`?render=compat` exists only to make mechanics automation viable under software-rendered headless Chromium. It disables shadows and antialiasing, flattens compatible static materials, and renders at 0.25 pixel ratio. The default public path remains full quality and is the visual acceptance target.

## 2. Automated test layers

### Unit tests — Vitest

| Area | Required assertions |
|---|---|
| Collision | wall sliding, boundary clamp, framerate-independent damping, shortest-angle interpolation |
| Rapier controller | grounding, wall movement, auto-step |
| Protocol | sanitisation and rejection of malformed state/shot payloads |
| Weapon gameplay | per-weapon spread, ADS tightening, movement/crouch modifiers, sustained-fire cap, head/body/limb multipliers, range falloff |
| Reload | valid start, early cancellation, magazine/reserve transfer only at completion |
| Equipment | melee range/cooldown; frag radial falloff |
| Match flow | warmup → active, score limit, timer, winner/draw, rematch reset |
| Bot policy | LOS/range fire gate, advance/retreat/strafe, respawn invulnerability |
| Minimap | world mapping, clamping, close/recent-fire enemy reveal policy |

### Browser tests — Playwright/Chromium

| Gate | Evidence |
|---|---|
| Boot | Debug API present only after bootstrap; original art root loaded; all three weapons ready; no `pageerror` |
| Menu | Bot skirmish, sensitivity, FOV, and complete control vocabulary visible |
| Solo population | Four enemy operators spawn alive and move under AI |
| Movement | WASD changes world position; crouch changes live stance state |
| Gun handling | Firing consumes ammo; switch delay completes; reload moves ammo from reserve |
| Equipment | Frag inventory decrements and live projectile disappears after fuse |
| HUD | Match objective, stance/equipment, minimap, and five-entry solo roster render |
| Stability | Timed browser session produces no uncaught exception |

Screenshots are written to `test-results/menu-structured-pass.png` and `test-results/gameplay-structured-pass.png` for human review.

## 3. Full-quality visual review

Test at 1920×1080 or larger, default URL with no compatibility query.

### Viewpoints

- Spawn view from Aqua and Coral.
- Street centre facing the coach and delivery truck.
- Each house exterior, ground-floor interior, stairs, upper floor, balcony and rear deck.
- Close first-person inspection of each weapon in idle, ADS, sprint, fire, reload and melee poses.
- Close and medium-range views of bot operators.
- HUD over bright sky, dark interior, foliage, brick and vehicle surfaces.

### Blocking defects

- Legacy giant low-poly green truck or Kenney blasters remain visible.
- Flat untextured primary house/road/weapon surfaces dominate the frame.
- Missing textures, magenta fallback, severe stretching or unreadable tiling.
- Z-fighting, invisible bullet blockers, weapon near-plane clipping, broken stairs, inaccessible second floor, or colliders that trap the player.
- Hero vehicles have visibly open seams, floating wheels, missing glass, or unreadable proportions.
- Crosshair/hitmarker/minimap/health/ammo become unreadable against common backgrounds.
- Bot operators disappear, rotate incorrectly, or intersect the ground.

## 4. Gameplay feel review

### Movement

- Walk, sprint, ADS and crouch must be immediately distinguishable.
- Sprint cannot coexist with ADS/crouch.
- Crouch lowers camera and speed; jump is disabled while crouched.
- Landing motion is readable but not nauseating.
- Stair ascent reaches both upper floors without snagging.
- Spawn-to-contact should normally be 4–7 seconds, not a long empty jog.

### Weapons

- ADS demonstrably tightens spread.
- Moving expands spread; crouching tightens it.
- Carbine, SMG and scattergun have distinct cadence, effective range and recoil.
- Headshots apply the distinct multiplier and gold hitmarker.
- Damage falls toward each weapon's minimum beyond its class range.
- Reload can be cancelled only before magazine seating; transfer occurs only when complete.
- Weapon switching has a real lockout and presentation blend.

### Combat loop

- Four bots navigate, acquire LOS, strafe, fire, take zone damage, die, score and respawn.
- Spawn invulnerability prevents immediate repeat deaths.
- Frag has a visible throw, bounce/fuse, flash and radial damage.
- Melee is short-range and cooldown-gated.
- Footsteps, weapon blast/tail, reload, hit and explosion feedback are distinguishable.
- Minimap shows friendlies; enemies appear only nearby or after recent fire.
- Warmup, active timer, first-to-25 ending and rematch reset are coherent.

## 5. Multiplayer gates

Before claiming multiplayer release quality:

1. Host obtains a non-empty room code.
2. A second browser joins via invite URL.
3. Each roster shows both peers.
4. Position and yaw update without teleporting under ordinary latency.
5. Friendly-fire is rejected.
6. Shot, hit, death, score and respawn replicate once; nonce deduplication prevents doubles.
7. Leaving removes the remote operator and roster entry.
8. Host/client close does not crash the surviving page.

Grenade visuals/damage are currently local to the thrower and are not claimed as network-replicated until the protocol is extended and two-peer tests are added.

## 6. Performance and asset budget

- Default full-quality target: 60 FPS on a normal desktop GPU, no sustained drop below 40 during four-bot combat.
- Headless Chromium is not a GPU benchmark; its compatibility mode is a mechanics/stability gate only.
- Production compressed transfer target: under 3 MB initial JS/WASM plus under 3 MB original textures.
- Pixel ratio is capped at 1.75.
- Tracer geometry/materials are disposed after use.
- Killfeed and nonce collections remain bounded.
- No recurring asset fetch or model construction occurs inside the frame loop.

## 7. Deployment proof

After deploying:

```bash
curl -fsSI 'https://daveinturkey15-byte.github.io/atomic-acres-v2-preview/'
npm run qa:release
npm run qa:multiplayer
```

Then inspect the cache-busted public URL and record:

- HTTP success and final URL.
- Console errors and failed requests.
- `window.__ATOMIC_ACRES_DEBUG__.snapshot()` showing weapon/art readiness.
- Menu screenshot and live gameplay screenshot.
- At least one movement, fire, switch, reload, crouch and frag interaction.
- Git commit hash and deployment repository hash are identical to the tested build.

## 8. Honest limitations

This pass is a coherent vertical slice, not a complete commercial FPS. It does not claim killcam, scorestreaks, destructible vehicles, prone/dolphin-dive, authoritative anti-cheat, lag-compensated hit rewind, replicated grenades, sampled studio weapon audio, or production navmesh bots. Those require separate scoped passes and must not be implied by a milestone label.
