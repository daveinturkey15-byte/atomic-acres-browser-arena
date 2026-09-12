# Test2 — map brief (owner 2026-08-30, REBUILT 2026-08-31)

One page, one-page-brief pattern (register row 35). Departures listed at the bottom.

**Layout contract:** `docs/TEST2_RAID_LAYOUT_SPEC_2026-08-31.md` (644 lines, researched and
pixel-measured). This brief records what was built and what deviates; the spec records why.

**Owner ask that drove the rebuild, verbatim (2026-08-31):** *"the map is too small, test 1
and test 2, the new maps, thats not the layout at all of RAID for example, please focus on
test 2 to have the actual layout and playability of Raid from blops 2?"*

## Atmosphere pin

A sun-drenched hillside mansion in the late afternoon: travertine terraces, stone
balustrades, clipped cypress hedges, a turquoise pool throwing light, and a modern
luxury villa in warm white stone. Money, glare, and long shadows. Unchanged — the
2026-08-30 art pass measured hue perplexity 5.61 against Farcrysis' 5.66 and a crushed
fraction of 6.33 %, and this rebuild carries that palette onto new geometry rather than
re-opening it.

## Inspiration boundary

Lane structure and mood are inspired by the hillside-mansion competitive-map archetype
(Black Ops 2 era). What is recovered is **topology only** — lane count, adjacency, where
the elevated vantages sit, how far apart the spawns are. ALL art is original and
procedural: every mesh is a `block()` wearing a surface forged by `test2Materials()`. No
ripped geometry, textures, names, or logos; the in-game name is exactly "Test2", and no
branded name appears in an id, a label, a callout or a comment.

## Layout — 100 × 76 m, three lanes, X-mirror symmetry

Bounds `minX -50, maxX 50, minZ -38, maxZ 38`. The playfield does **not** fill that
rectangle: the outline is an irregular blob read off the spec's 2 m/cell plan (twelve
z-bands, `TEST2_BLOB` in `src/test-maps.ts`), and roughly a quarter of the bounding box is
deliberately not map. That is where the corners, the dead ends and the cover-by-
architecture come from.

- **North lane (pool terrace):** sunken sport court → bar pavilion → the pool → pool deck
  → colonnaded covered walk under the upper bedroom. The map's ONE long lane.
- **Centre lane (the house):** living room → **enclosed four-mouth courtyard** → kitchen
  rooms, with the mansion's north range as the corridor spine above them.
- **South lane (circular drive):** laundry block → carport → the circular drive and its
  island → gallery. One elevated balcony fires across it from each end.
- **Ends:** an open garden apron west (team 0), a covered garage wing east (team 1). Each
  has the same three-way exit fan: left to the flank, straight to the house, right to the
  other flank.

**Verticality is the headline.** Four reachable first-floor rooms at **+3.40 m** — U1
upper bedroom, U2 upper landing, U3 laundry balcony, U4 gallery upper — each seeing
exactly one lane, each reached by a stair an enemy can climb behind you. The canonical
stair is 9 risers of 0.378 m on 0.45 m treads: every riser is under the 0.42 m autostep,
so the player *walks* up with no jump and bots need no jump node.

## Domination (this map's headline mode)

- Three zones: **A** the west end (−34, −0.5), **B** the drive-lane mouth (0, +14),
  **C** the garage drive (+34, −0.5).
- **B is deliberately off-centre and must stay there.** With A and C on the long axis at
  the two ends and B pulled into one flank, a team that owns B is committed to one side of
  the map, so the losing team's spawn stays anchored behind its own end instead of
  flipping through the middle. Moving B into the courtyard is the obvious "fix" and it
  would break spawn stability.
- Capture, scoring, HUD, bots and multiplayer replication are unchanged by the rebuild:
  stand inside the 4.5 m radius with no live enemy inside it; 5 s to flip through neutral;
  contested = frozen; +1 per held zone per 5 s; first to 200 or highest at 10 minutes;
  host-authoritative zone state on the existing match-state channel.

## Procedural-art clause

Every texture generated in code: travertine pavers, stucco, hedge foliage, pool water
(existing water techniques), court surface. Props presentation-only unless registered
cover. Note the repo gotcha that governs every tint here: `material.color` MULTIPLIES and
is capped at white, so a tint can never brighten a dark base — the cool `stone` and the
hillside greens are authored at held luminance, not tinted toward it.

## Cover rule (unchanged, plus one stated exception)

Every cover piece is either ≤ 0.75 m (jump-mountable against a measured 0.82 m apex) or
≥ 1.9 m (clears the 1.70 m standing eye). Nothing is authored in the 0.9–1.8 m dead band
**on a surface a player stands on at grade**.

The one exception is the **1.05 m balcony rail** on the four upper rooms, and the dead-band
rule's own rationale is what licenses it: a dead-band piece is banned because it "hides a
crouched player from nobody and cannot be climbed". On a +3.40 m floor both halves invert —
the crouch eye sits at 1.16 m, so a 1.05 m rail hides the body and clears the eye exactly
(the head-glitch the layout spec asks for), and it MUST NOT be climbable or the upper room
becomes a launch pad.

## Forbidden

No swimming/diving mechanics, no vehicles, no named-brand references, no new weapons.
(The old "no interiors beyond veranda depth" clause is **withdrawn** — see Departures.)

## Measured result (2026-08-31, versus the build it replaces)

| | Old build | Rebuild | Reference target |
|---|---|---|---|
| Bounding box | 76 × 58 = 4408 m² | **100 × 76 = 7600 m²** | aspect 1.311, built 1.316 |
| Accessible footprint | ~3550 m² | **5195 m²** | ~4740 m² ground |
| Accessible surface (both levels) | ~3550 m² | **5697 m²** | ~5440 m² |
| Fill fraction | ~100 % of a walled rectangle | **68.4 %** | 62.4 % of the plan |
| Standable range | 1.25 m (−0.55 → +0.70) | **3.95 m (−0.55 → +3.40)** | 3.95 m |
| Reachable elevated area | **0 m²** | **546 m² at +3.40 m** | ~700 m² |
| Reachable upper floors / roofs | 0 / 0 | **4 / 0** | 4 / 0 |
| Longest clear eye-to-eye line | ~76 m across the whole terrace | **72.4 m, on the north lane only** | one 45 m+ lane |
| Pool-deck-to-drive sightline | present | **BLOCKED** | must be blocked |
| Elevated room sees a spawn apron | n/a (no rooms) | **none of the four** | none |

Fill fraction is stated against a different definition than the spec's 62.4 %: the spec
flood-filled a published plan that draws no interiors, while this number counts every
column a player can stand on, interiors included. The **outline** is the spec's own plan
(74 % of the box, measured off its diagram), and the extra accessible area is the four
interiors the spec asks for on purpose.

Evidence frames, manifest and camera poses: `docs/assets/test2-raid-2026-08-31/`
(18 frames, installed Chrome with a real hardware WebGPU adapter, `--mute-audio`).

## Departures

- **2026-08-31 — the fairness involution changed from the 180° ROTATION to the X MIRROR
  `(x, z) → (−x, z)`.** The archetype's measured objective anchors are A(−34.6, −0.1) and
  C(+33.1, −0.9): x-mirrors, not 180° images. Under the rotation the pool lane was obliged
  to *equal* the drive lane, which is what produced the old build's "sunken parterre as the
  pool's 180° partner" and its uniform terrace. Recorded in the `src/test-maps.ts` header.
- **2026-08-31 — "no interiors beyond veranda depth" is withdrawn.** It was the single
  clause most responsible for the map having zero reachable upper floors. The rebuild has
  five interiors and four upper rooms; the eye-clearance sweep re-measured at **0
  violations** across 3467 legal hug spots and 24269 traces, so the risk the clause existed
  to manage was measured rather than assumed.
- **2026-08-31 — the upper rooms are OPEN TO SKY.** The spec asks for +3.40 m floors *and*
  roofs at 3.7–4.2 m on the same masses, which cannot both be built (it would leave 0.3 m
  of headroom). Roofless upper rooms with 1.9 m walls and 1.05 m rails resolve it, remove
  the whole eye-clearance ceiling class, and keep the shadow and draw budgets down.
- **2026-08-31 — the bar pavilion moved into the lane.** The spec's own §2 seats it at
  x −13…−5, inside its own pool-water rect (x −14…+16); the two callouts overlap and both
  cannot be built. It is seated between the sport court and the pool instead, where a 6 × 6 m
  mass actually does work: without it the north lane measured a 72.8 m corner-to-corner line.
- **2026-08-31 — the ledge flank route runs the north rim, not the pool deck.** A 4 m deck
  cannot carry a screened 0.70 m ledge (a walk 0.70 m up behind a 0.70 m screen just stands
  you up). It runs garage → the wing's east flank → the pool's north coping, delivering the
  same flank: into the pool lane behind anyone watching the covered walk.
- **2026-08-31 — five masses are authored that the spec's callout list does not contain,
  each for a measured reason, each recorded in the source beside itself.** The garden store
  in the west approach and the laundry block's extension to x −30 (a 46 m line that saw the
  pool deck *and* the drive); the carport and the drive verges (a 74.7 m second long lane);
  the gallery's service wing (a 47 m third long lane); the groundskeeper's store at the
  court's corner (a 72.8 m diagonal); and the two blind screens inside the house's north
  doors (a 52 m pool-deck-to-drive line threading three aligned mouths).
- **2026-08-31 — the office window is in the house band's north wall, not in C3.** The
  spec's C3 has no exterior north face (the house band is north of it), so the "window onto
  the pool lane" is authored where it can exist, in the east room of the north range.
- **2026-08-31 — no vegetation is planted inside the boundary.** The old clipped border
  needed a 0.6–4.6 m strip behind a rectangular wall; the rebuilt outline has no such strip.
  All of this arena's green is now authored, collided and shot-rated (the drive island's
  planter ring, the two drive verges, the west apron's planter run), which is the only kind
  of foliage that can stand in a lane without being cover a bullet ignores.
