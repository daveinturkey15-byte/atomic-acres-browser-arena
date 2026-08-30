# Test2 — map brief (owner 2026-08-30)

One page, one-page-brief pattern (register row 35). Departures listed at the bottom.

## Atmosphere pin

A sun-drenched hillside mansion in the late afternoon: travertine terraces, stone
balustrades, clipped cypress hedges, a turquoise pool throwing light, and a modern
luxury villa in warm white stone. Money, glare, and long shadows.

## Inspiration boundary

Lane structure and mood are inspired by the hillside-mansion competitive-map archetype
(Black Ops 2 era). ALL art is original and procedural — no ripped geometry, textures,
names, or logos; the in-game name is exactly "Test2".

## Layout (~64 × 48 m, three lanes, 180° rotational symmetry)

- **Pool lane (north):** sun deck with loungers, the pool (shallow, walkable, slows
  nobody — presentation water), a pool house at each end.
- **Centre: the court.** A sunken half-court (sport court markings, original) flanked by
  planters and the mansion's grand steps — the contested heart.
- **Garden lane (south):** terraced garden walk with balustrades, hedge cover, and a
  garage/staff-entry structure at each end.
- **Ends: motor court + veranda.** Each team spawns on a motor court behind the villa
  wing, two covered exits per lane plus a centre step exit.

## Domination (new mode, this map's headline)

- Three zones: **A** pool deck, **B** the court, **C** garden terrace.
- Capture: stand inside the zone radius (4.5 m) with no live enemy inside it; 5 s to
  flip through neutral. Contested = frozen.
- Scoring: each held zone ticks +1 team point every 5 s; first to 200 or highest at the
  10-minute timer wins. Respawns stay on the owning team's end.
- HUD: three flag pips (A/B/C) coloured by owner, capture progress ring on the active
  zone, tick feedback on score.
- Bots: bias movement toward the nearest non-owned zone; defend when all owned.
- Multiplayer: host-authoritative zone state, replicated with the existing match-state
  channel; guests render from snapshots only.

## Procedural-art clause

Every texture generated in code: travertine pavers, stucco, hedge foliage, pool water
(existing water techniques), court surface. Props presentation-only unless registered
cover (balustrades, planters, loungers at cover height are registered).

## Forbidden

No interiors beyond veranda depth, no swimming/diving mechanics, no vehicles, no
named-brand references, no new weapons.

## Departures

- (recorded as they happen)
