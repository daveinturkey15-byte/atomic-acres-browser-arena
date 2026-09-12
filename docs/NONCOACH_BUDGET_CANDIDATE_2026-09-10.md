# Noncoach bounded allocation candidate

VERIFIED actual six-vehicle arena census, including the shared truck bogie, before/after:

| Vehicle | Before | After | Existing cap |
|---|---:|---:|---:|
| Coach (unchanged baseline) |9854|9854|10000|
| Truck plus bogie |8280|8024|6000|
| Street saloon, each of2 |9026|8866|9000|
| Driveway car, each of2 |9502|9114|9000|
| Total |55190|53838|—|

VERIFIED same15 shared draw meshes. Two street saloon overages are closed mechanically; truck2024 and driveway114each remain OPEN. The global actual-census test correctly remains FAIL. No cap changes or aggregate masking.

Allocation1:808 triangles removed only where a lathe profile reaches exactly radius0 and the emitted face has two coincident corners. Four new tests RED4 ->GREEN4 prove every surviving triangle's full position/normal/UV records and bounds unchanged. Tyre/contact-patch, whitewall and bezel bytes remain unchanged. No wheel/lamp radial count reduction. Opt-in only for truck/sedan and named truck bogie; coach route unchanged.

Allocation2:544 triangles removed by enabling the existing bounded trim sampler for these two families. Three new tests compare both directions at quarter-grid triangle-interior samples with the unchanged comparator/limits used for coach trim: stripe position0.15mm, normal-component0.01 (+1e-6 Float32 allowance); roof position1e-6m, normal-component1e-6 (+1e-6 Float32 allowance). Truck stripe128->88: maxposition0.073104mm/maxnormal0.0032421. Each truck roof rail52->28: maxposition0.0002232mm/maxnormal0.0000014613. Driveway spear316->88: maxposition0.071744mm/maxnormal0.0006587. All retained nondegenerate trim faces pass outward winding. No lining decimation, wheel-arch reduction or new material/draw bucket.

VERIFIED18 focused tests pass (4collapsed poles,4normal orientation,3trim fields,7wheel attachment); TypeScript noEmit and diff whitespace pass. Inherited exact triangle/allocation pins remain unchanged and may fail; they have not been blessed as new goldens. Same-angle final combined pixels/performance/collider/provenance and playable multiplayer remain OPEN. This is local source progress, not release acceptance.
