# Pass 54 wall penetration specification

## Overview

Add deterministic, FMJ-like bullet penetration to every arena without weakening movement collision, explosive cover, melee cover, or multiplayer authority. Thin fences, glass, timber, and interior partitions should be practical wallbang surfaces. Brick, concrete, vehicles, shipping containers, earth, and thick metal should consume much more energy or stop the shot.

## Context

The current combat trace treats every authored collider as absolute hard cover. Local player fire uses rendered mesh intersections while bots and multiplayer verification use collider AABBs, so adding penetration to only one path would create visible and authoritative disagreement.

## Requirements

- **R1 - one authority:** Local fire, bots, remote shot presentation, and remote hit admission must use the same deterministic surface/weapon penetration calculation.
- **R2 - material rule:** Every shot-blocking map surface must have a canonical ballistic material. Unknown future surfaces fail closed and fail the coverage verifier.
- **R3 - weapon rule:** Every weapon must define calibre, FMJ penetration power, distance-retention curve, residual-damage floor, and maximum penetrated surfaces.
- **R4 - physical factors:** Penetration must account for travel distance before impact, material resistance, actual path length through the surface, angle through that path length, remaining energy, and prior penetrations.
- **R5 - intended ordering:** Close range must outperform long range; the sniper and carbine must retain more penetration than the SMG and machine pistol; thin fence/glass/interior wall must be easier than brick/concrete; thick vehicles, containers, earth, and reinforced surfaces must generally stop ordinary fire.
- **R6 - retained boundaries:** Movement collision is unchanged. Explosions and melee continue to treat cover as hard occlusion. Broken windows cease to consume bullet energy.
- **R7 - bounded presentation:** Tracers stop where the ballistic trace stops. Penetrated surfaces produce bounded entry feedback, and a target behind penetrable cover can still receive reduced damage.
- **R8 - multiplayer parity:** Receivers derive wallbang damage from the admitted shot rays and their synchronized arena surfaces; clients do not author penetration multipliers.

## Acceptance criteria

- **C1:** Unit tests prove surface ordering, close-vs-long ordering, calibre/weapon ordering, angle/thickness effects, multiple-surface energy loss, damage reduction, and impenetrable stops.
- **C2:** Every `WeaponId` has a valid penetration profile; removing one is a TypeScript error or test failure.
- **C3:** Every current arena builds with a ballistic surface for every authoritative shot blocker and with zero unclassified surfaces.
- **C4:** Local, bot, tracer, window, and remote-hit code paths call the shared ballistic resolver; legacy hard-cover shot callbacks are absent from bullet paths.
- **C5:** TypeScript, focused unit tests, full unit tests, and production build pass without weakening existing verifiers.

## Out of scope

- Destructible brick/concrete geometry, persistent bullet holes, ricochet simulation, ammunition inventory variants, explosive penetration, and melee penetration.
- Claiming real-world terminal-ballistics accuracy. Values are abstract gameplay tuning with physically ordered inputs.

## Decisions

- All current firearm ammunition receives an FMJ-like baseline; this pass does not add an attachment-selection UI.
- Surface thickness comes from the authoritative shot volume, not decorative mesh triangles.
- Oblique shots pay naturally through the longer entry-to-exit path.
- Unknown assets are safe at runtime (reinforced/impenetrable) and red in verification.
