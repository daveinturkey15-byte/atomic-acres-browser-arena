# World-studio vehicles (HF-571, lane vehicle-finisher-20260912)

Entry point: `src/world-studio/vehicles/index.ts` exports
`createStudioVehicles(): { root: THREE.Group; solids: Array<{ id; mesh; bounds: Box2; material: BallisticMaterialId }> }`.
`Box2` comes from `src/collision.ts`, `BallisticMaterialId` from `src/ballistics.ts`. Root sits at
the origin; every mesh is baked into world coordinates and is a direct child of root.

## What is authored

| Vehicle | Placement (world, metres) | Facing | Envelope |
| --- | --- | --- | --- |
| Rounded yellow school bus | centre X -3.5, Z 2 | nose to -Z (rear faces the +Z street mouth) | 10 x 3 x 3.2 |
| Red long-nose tractor + white ribbed box trailer | centre X 3.5, Z -2 | nose to +Z (grille faces the +Z street mouth) | 14 x 3 x 4.0 |
| Classic pale-blue car | centre X -21, Z 23 (teal driveway) | nose to -Z | 4.2 x 1.8 x 1.5 |

Bodies are lofted by the existing in-repo `src/vehicle-forge` (`buildForgedVehicle`) from three
new specs in `specs.ts`: stations give the bus its short hood, split screen and crowned roof,
the tractor its tall square hood, stepped cab and sleeper, and the car its 1950s two-box
profile. Forge dressings (`dressing.ts`) add lamps with chrome bezels, grilles, mirror stalks,
rub rails, window pillars, door pulls, hubcaps, plates, indicators, underbody blocks and
contact pools. Authored parts (`parts.ts` `PartSink`, non-indexed boxes and lathes in the same
material buckets) add what a loft cannot: the ribbed trailer with top/bottom rails, rub rail,
corner posts, rear doors with hinges and lock bars, ICC bar, landing gear, belly box, mud flaps,
twin round tail lamps, side and roof markers; the tractor chassis rails, fifth wheel, fuel tanks,
cab steps, twin stacks, air horns, bonnet strip and ornament; the bus roof marker lamps, stop
arm, rear door frame and handle, crossing gate and mud flaps; the car's ornament, fin trim and
exhaust tip.

## Materials

Forge node materials only (`MeshPhysicalNodeMaterial` paint with clearcoat and dust film,
`MeshStandardNodeMaterial` chrome/tyre/lining/lamps, physical glass). No `ShaderMaterial`, no
`onBeforeCompile`. Four paint sets (bus yellow + black accent, tractor red + dark accent, trailer
white, car pale blue + cream accent) share one set of colourless buckets, so the whole set
folds into one mesh per material through `mergeForgedPlacements`. Glass is its own transparent
draw group and is never merged with opaque parts.

## Solids

Every visible mass has a matching world-coordinate box with explicit `minY`/`maxY`: body shells
above their sills, an underbody block between the bus arches, bumpers, each wheel (one box per
wheel on the bus, car and tractor front; one box per side spanning the tractor tandem and the
trailer bogie), chassis, fuel tanks, landing gear, ICC bar, and the trailer box as `container`.
The trailer is a **full solid in this first slice**: there is no transverse passage. A visible
belly box fills the gap between the tandem and the bogie so the collider there is not invisible.
A 4 m lane stays open between the bus and the truck (brief asks for >= 2 m).

## Verification (CPU only, run 2026-09-12)

- `node src/world-studio/vehicles/budget-census.mjs` (runs `studio-vehicles.test.ts` with the
  census printed): finite world-space geometry, glass isolation, budget, envelopes, facing,
  lane gap, dispose.
- `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`.

Budget fences asserted: <= 60 000 triangles, <= 60 draw groups. Measured numbers are in the
test's census line and the handoff message.

## Applied skills -> concrete generators

- atomic-acres-asset-authoring: reuse the in-repo forge factory (`buildForgedVehicle`,
  `buildForgedWheelSet`, `mergeForgedPlacements`) instead of a new framework; solids
  expressed as exact world boxes next to the presentation they block.
- atomic-acres-procedural-art-authoring: station-driven lofts in `specs.ts`; attached trim
  in shared buckets (`dressing.ts`); no floating primitives, contact pools under every vehicle.
- photoreal-procedural-scene-forge: material families paint/chrome/rubber/glass/lining with
  the forge's procedural roughness and dust graphs; glass kept separate for sorting.

## Open visual proof

Root owns the browser pixel review. Not yet seen rendered: the bus hood/cab step at 1-4 m, the
tractor split screen and grille relief, trailer rib rhythm under raking sun, and whether the
belly box reads as intended. Iteration candidates: a walk-through trailer aperture (would
change `trailer-box` into wall segments), a stop-arm sign face, bus rear ladder.
