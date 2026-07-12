# Atomic Acres — Layered Build Pass 04

Date: 2026-07-12
Branch: `overhaul/arena-scale-ai-art-pass-04`
Canonical live policy: keep the approved Pass 03 build unchanged until a separate Pass 04 candidate passes review.

## User feedback driving this layer

- Four bots create an immediate crossfire and overwhelm the player.
- Solo mode should contain one opponent.
- The opponent should become credible only at close-to-medium range and remain ineffective near its maximum engagement range.
- Damage or tracers must never originate outside the playable arena.
- Operator models, first-person arms/weapons and firing animation need a material quality increase.
- Arena scale and loadout flow should evoke the compact pacing and usability of polished early-2010s two-house console FPS maps without reproducing copyrighted map geometry, measurements, assets, names, branding or UI.

## Layer 04A — solo pressure and damage-origin containment

Implemented locally:

- `SOLO_BOT_COUNT = 1`.
- `BOT_FIRE_RANGE = 22` metres.
- `BOT_REACTION_DELAY = 650` milliseconds.
- Aim jitter increases nonlinearly from close range toward `0.1` radians at maximum range.
- The existing `BOT_DAMAGE_MULTIPLIER = 0.5` remains intact.
- Bot positions are checked against the playable bounds before sensing, movement or firing. Any invalid bot is moved to a safe authored spawn, has awareness/burst state cleared, and cannot fire during the recovery frame.
- Out-of-bounds multiplayer snapshots, damage sources and tracer origins are rejected.
- Authored bot spawns and respawns are selected through finite, bounds-safe and collider-clear validation rather than copied blindly.
- Grenades crossing the radius-adjusted logical bounds are terminated at the boundary with impact feedback and cannot persist or explode on terrain outside the fence.
- Browser QA now requires exactly one bot, a two-entry solo roster and a bot position inside the radius-adjusted arena bounds.

Evidence so far:

- TypeScript: passed.
- Focused bot/collision tests: 16/16 passed.
- Full unit suite: 44/44 passed.
- Production build: passed.
- One-bot navigation/bounds browser scenario: passed.
- HUD/roster browser scenario: passed.
- Unchanged isolated `>=40 FPS` scenario: passed.

## Layer 04B — original compact-arena scale

Measured current state:

- Playable area: `82 × 102 m` (`8,364 m²`).
- House centres: `(-11,-34)` and `(11,34)`, `71.47 m` apart.
- Mean spawn-to-centre lower bound: `36.20 m`, about `4.24 s` at authored sprint speed before collision detours.
- One forward spawn pair has an immediate unblocked `64.03 m` sightline, creating zero-second visual contact despite otherwise 4–5 second traversal.

Original target—not copied commercial coordinates:

- Bounds approximately `68 × 86 m`, about 30% less area.
- Retain current house/interior dimensions but relocate centres near `(-9,-28)` and `(9,28)`.
- Spawn-to-centre target `26.6–31.6 m` / `3.1–3.7 s` ideal sprint.
- No direct spawn-to-spawn line of sight.
- First aggressive reveal `2.2–3.0 s`; median first engagement `3.0–3.8 s`.
- Primary routes `6–9 m`; side routes `4.5–7 m`; effective cover pinches never below `2.4 m`.
- Break sightlines every `12–18 m` and avoid unbroken combat rays above roughly `30–34 m`.
- Reposition macro anchors individually instead of uniformly scaling the world, preserving original architecture and readable player-scale interiors.

## Layer 04C — operator and first-person art

Implementation specification:

- Replace static merged mannequins with rigid transform rigs: pelvis/spine/head, clavicle/upper-arm/forearm/hand, and hip/thigh/shin/foot chains.
- Keep invisible hit proxies separate so head/body/limb contracts survive articulated poses.
- Use team shape as well as colour: Aqua circular shoulder beacon/horizontal band; Coral triangular beacon/diagonal band.
- Add an active world-weapon socket and make replicated `PlayerSnapshot.weapon` control the visible weapon.
- Use additive stance, locomotion, aim, weapon-action and hit-reaction animation layers instead of root squash/rotation.
- Rebuild the first-person hierarchy around weapon-authored muzzle/eject/optic/grip/support sockets and two-segment arm IK.
- Give each original weapon a black-silhouette-readable identity. The scattergun must lose the inherited box magazine and gain a barrel/tube pair, pump cycle and shell ejection.
- Replace per-shot casing allocation with a 12–16 object pool and shared geometries/materials.
- Use named events (`shot`, `eject`, `boltRear`, `boltForward`, `magSeated`, `pumpRear`, `pumpForward`, `roundInsert`) so audio, hands, weapon parts and gameplay commits align.

Art budgets:

- First-person weapon plus arms: target `6k–8k`, hard cap `10k` triangles.
- World operator LOD0 including weapon: `<=4.5k` triangles; LOD1 `<=1.8k` beyond approximately 18 m.
- `<=3` draw calls per visible LOD0 operator; no per-shot remote point lights.
- Preserve the existing compatibility gates: `>=40 FPS`, `<=180` calls, `<=350k` triangles.

## Layer 04D — original loadout workflow

Original information architecture: `DEPLOY | FIELD KIT | OPTIONS`.

- Four locally saved Field Kits.
- Primary tool, implemented utility, one modest suit module, and a team-neutral identity finish.
- Controller-friendly kit cards, slot row, rotating procedural preview and plain-language comparative stat bars.
- Mid-match changes are queued for the next deployment rather than granting immediate inventory swaps.
- Remove unconditional possession of all three primaries once the kit system is active.
- Store a versioned, allowlisted selection in `localStorage`; malformed values fall back safely.
- Preserve keyboard/gamepad focus, visible selected/focused/queued states, short-height usability and the existing original Atomic Acres visual language.
- Do not copy commercial class names, point systems, icons, fonts, sounds, menu layout or branding.

## Deployment rule

Do not overwrite the canonical Pass 03 deployment during Layer 04 development. Publish only a separate review candidate after complete functional, performance, visual, console and multiplayer verification.
