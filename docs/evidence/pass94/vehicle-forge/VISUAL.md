# Lane I2 - visual review of the forged vehicles

## What these frames are, and what they are not

`scripts/qa/raster-forged-vehicles.ts` is a CPU rasteriser: it walks the real
constructed arena, takes every `vehicle-forge` mesh, projects it and shades it
with a two-light Lambert and a flat per-bucket colour.

It is NOT the game's shading. No TSL, no probes, no clearcoat, no exposure, no
post chain. It can prove a SHAPE and disprove a SHAPE and nothing whatever about
the look. It exists because the GPU rule on this machine could not be satisfied -
ComfyUI held the VRAM at 830-1010 MiB free against a 3000 MiB floor for the whole
lane - and a geometry check that needs no GPU is better than no look at all.

The headless WebGPU capture through the five new review cameras is OPEN. It is
the only thing that can review the paint, the glazing, the shadows and the
grade, and none of the claims below are about any of those.

## What the first pass found

Three defects, none of which any unit gate could have caught, all fixed:

1. THE WAISTLINE HUMPED OVER BOTH WHEEL ARCHES. The stripe rode a ring INDEX,
   and the lower flank points are spaced as a fraction of the height remaining
   above the arch - so index 5 sat at 1.2 m between the wheels and at 1.6 m over
   one. The red band dived and bulged over each wheel like a decal applied by
   someone who never looked at it. A waistline is a LEVEL line: `stripAtHeight`
   now finds where the flank crosses a world height and rides that.
2. THE FRONT BUMPER Z-FOUGHT WITH THE NOSE. Tucked flush inside the loft's z
   envelope, the bar's back face landed exactly on the end cap's plane, the two
   raced for the same depth samples, and the nose grew a hatched grey band that
   read as damage. It sits 20 mm proud now, still inside the collider's own
   footprint tolerance.
3. THE COACH HAD NO WINDSCREEN. The loft can only cut glass out of a flank quad
   or a top-arc quad, and a cab-over body's front IS its end cap - so the coach
   and the truck had blank painted faces with two lamps stuck on them and read
   as vans. The first fix was worse than the bug: classifying a triangle FAN's
   faces by height gives two wedges meeting at the apex with a painted triangle
   between them, so the windscreen came out as a bow tie. The caps are now a
   stack of HORIZONTAL SLICES at the ring's own point heights, which is a shape
   a band can be cut from, and which keeps the cap boundary exactly on the
   polyline the side quads meet.

Fixing 3 broke watertightness until the cap's flat bottom and top edges got
their closing triangles back: the loft has TWO edges along each of those lines
(left half and right half, meeting at the centre point) and the sliced cap had
one, so three edges per cap went unpaired. The gate caught it; a zero-area
triangle through each centre point pairs them.

## Do they read as real vehicles? Honestly

YES for the shape, with reservations, and I am not in a position to say anything
about the look.

THE COACH reads as a coach. Streamlined cream body with real tumblehome, a
rounded roof, a continuous glazed band down both flanks, a raked screen at each
end and now a full-width windscreen across the nose, a level red waistline, four
wheels sunk into superellipse arches with visible contact patches, and three shut
lines breaking the flank. From 8 m and from 16 m it is unambiguously a bus. It is
the most convincing of the three.

THE SEDAN reads as a boxy 1980s estate. The tumblehome on the greenhouse, the
cowl crease, the cut-out side glass with real A- and C-pillars, the bezelled
round headlamps and the arch cuts all land. Its proportions are honestly wrong
for a saloon - the greenhouse is far too tall - and that is the documented
consequence of matching the arena's 1.88 m `car cabin` collider rather than
shrinking visible mass under it.

THE TRUCK CAB reads as a cab-over box van, which is what it is. It is the least
interesting of the three because the cargo box behind it is still authored boxes,
so the whole vehicle is a rounded cab bolted to a rectangular box. That is the
right call for gameplay and it is visible.

Measured off the side elevation IN PIXELS (10.4 m across 1400 px, 7.42 mm/px),
which is what that camera exists for:

| Coach | measured | spec | verdict |
|---|---|---|---|
| Overall length | 9.06 m | 9.10 | PASS |
| Wheelbase | 5.83 m | 5.80 | PASS |
| Front overhang | 1.63 m (28 % of wheelbase) | 28 % | PASS |

## What still looks wrong

- THE NOSE IS A SLAB. Below the windscreen the coach's and the truck's front
  faces are one flat painted panel with two small round lamps floating on it and
  no grille, no valance, no number plate recess. It is the weakest surface on
  any of the three bodies.
- NO GRILLE ANYWHERE. The box vehicles had a chrome grille bar; the forged ones
  do not, because the loft has no feature for one yet.
- THE COACH'S TAIL IS FLAT. The end cap is a vertical plane, so a streamlined
  body ends in a slab. Correct for a box van, wrong for this coach.
- THE WHEEL COVERS ARE LARGE AND VERY BRIGHT, reading close to whitewalls at
  range. That may be the flat rasteriser rather than the geometry; the real
  chrome under a probe could go either way, and only the GPU capture can say.
- THE WINDSCREEN'S LOWER EDGE HAS A SHALLOW KINK where the slice heights meet
  at the centre column. Small, but visible on the mid-distance frame.

## Frames

`cpu-raster/` beside this file:

| File | Station |
|---|---|
| `coach-elevation.png` | True side elevation, orthographic, 12 m square to the flank - the proportion measurement above |
| `mid-coach.png` | Coach front three-quarter, ~8 m |
| `far-street.png` | Coach, cars and street from ~16 m |
| `near-head-car.png` | Head car front three-quarter, ~4 m |
| `truck-cab.png` | Truck cab three-quarter, ~4 m |
| `wheel-macro.png` | A front wheel at ~1.4 m |

Two objects in these frames are not defects and look like them: the truck's
rearmost axle stands at x = -2.15 on the road and appears in front of the coach's
nose in the elevation, and the south driveway car stands between that camera and
the coach.
