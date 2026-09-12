# Nuke Town full-step redesign — 2026-08-29

Owner (2026-08-24): *"we might as well take the full step and have it the same layout as
Black Ops 2 Nuketown … make it actually true to original … maybe make it a tad bigger
because it feels a little bit clustered."* Owner (2026-08-29): *"I did ask for a total
re-design … the map is still cramped and a strange mash up."* He is right: every prior
pass dressed the edges of D1–D8 (artifacts/NUKETOWN-MEASUREMENT-2026-08-24.md) without
touching the one that matters.

## The core diagnosis: D1

**The map's flow is rotated 90° from the reference.** Houses and garages already match
(D6): two two-storey houses diagonal across the street, garages outboard. But teams
spawn in full-width strips on the two SIDES of the street, so combat crosses it. In the
reference, teams spawn in garden yards at the two ENDS and fight DOWN the street through
three parallel lanes: the vehicle-choked road, and one house each side. No amount of
prop dressing fixes a sideways map — which is exactly why every "improved" build felt
like the same map.

## The redesign, in dependency order

1. **Rotate the flow.** Spawns become two end gardens: team 0 behind a west spawn fence
   (x ≤ −27), team 1 mirrored east, each a fenced yard band with door gaps opening onto
   the street mouth and both verges. 180° rotational symmetry preserved exactly.
2. **Lengthen the street.** Bounds grow along X (the street axis) and shrink slightly in
   Z, sized so the fidelity gates' own bands hold: perimeter lap inside 25–30 s sprint,
   both area bands. The corner-to-corner time rises toward the reference instead of the
   measured 15 s.
3. **Cut the maze (D3).** The canyon fins, corner hedge blocks and side-verge cross-runs
   go. They existed to break ACROSS-street sightlines that no longer exist. What breaks
   the new ALONG-street lanes is the reference's own furniture: the central bus, the two
   mid-street vehicles (D2), the front-garden hedge pairs, and the houses themselves.
   The sightline suite re-arbitrates with its own estimators; ceilings re-derived by
   measurement, never loosened past what the reference layout implies.
4. **End-fence identity (D5).** The old rear hedges rotate into the two spawn fences,
   each with door gaps — including one low crawl gap with a ramp: the reference's
   under-fence side trail, ours by function not by name.
5. **Dressing that carries the read (D5).** Street-end sign, mailboxes, the lawns and
   mountain ring already landed. All presentation-only, via the procedural-art skill's
   additive-module contract.
6. **Cascade.** Blender spec re-derives from the constants (that binding landed in wave
   1); rebake; provenance re-pin; spawn-safety/symmetry/traversal/minimap/gameplay-
   contract regenerated through their own protocols. The frozen spawn world-identity pin
   is re-pinned once, with this document as the recorded reason.

## What deliberately does NOT move

Houses, garages, railgun upper-room sites (house-derived), overdrive core (street
centre), the bus, authored large-cover anchor IDS (coordinates re-seat on the new flow;
the anchor-keyed art follows), mannequin class, lawn bands (derive from the layout
authority), mountain ring (outside bounds; envelope re-checked).

## Gates

Every stage lands only through: tsc 0, full suite green at the current floor, the arena
gate set (fidelity, sightline, traversal, spawn-safety, symmetry, parity, proxy
coverage), eye-clearance ratchet, plain-Chrome player-path launch, and fresh review-cam
captures looked at with eyes before publish.
