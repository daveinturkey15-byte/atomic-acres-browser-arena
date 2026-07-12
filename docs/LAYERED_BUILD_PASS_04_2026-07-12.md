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

Pending measured design audit. The implementation must use original geometry. Acceptance targets will be expressed as traversal duration, spawn-to-contact time, sightline length, lane width, cover interval and house-to-house pressure—not copied dimensions or coordinates.

## Layer 04C — operator and first-person art

Pending art audit and implementation:

- articulated operator hierarchy and clearer human proportions;
- persistent team markers across several body regions;
- distinct weapon silhouettes;
- improved first-person forearms, hands, grip relationships and material breakup;
- event-driven muzzle, bolt/slide, recoil, casing and reload presentation;
- normal-quality visual captures and performance-budget checks.

## Layer 04D — original loadout workflow

Pending design. Use familiar genre-level interaction principles—primary/secondary/equipment categories, readable stat comparison and fast selection—but retain original naming, visual language, layout and code.

## Deployment rule

Do not overwrite the canonical Pass 03 deployment during Layer 04 development. Publish only a separate review candidate after complete functional, performance, visual, console and multiplayer verification.
