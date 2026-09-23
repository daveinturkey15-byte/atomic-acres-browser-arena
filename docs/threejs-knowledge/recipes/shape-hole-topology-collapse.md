# Shape-hole topology collapse in Three.js

## Rule

Treat `ShapeGeometry` indexed topology as a release invariant. Raw state may
contain repeated or wholly contained apertures, but presentation must normalize
those holes before triangulation. Count triangles from `geometry.index.count / 3`;
`position.count / 3` can remain non-zero when the indexed topology has collapsed.

## Safe recipe

1. Keep the authoritative aperture list and its hash unchanged.
2. Drop a later aperture only when it is wholly contained in an earlier
   aperture, including exact duplicates; discard a center outside a custom
   rendered outline.
3. Build the real `Shape`, then `ShapeGeometry(shape, 18)`, then the authored
   panel basis. Do not fork the panel dimensions or coordinate quantization.
4. Before swapping a merged shell, compare `index.count / 3` with the sum of
   source-panel triangle counts. On mismatch, dispose only candidate geometry
   and retain the previous shell for the next sync.
5. Keep a raw duplicate-hole self-test that must reproduce the historical zero
   triangle failure, plus a candidate test that proves three duplicate authority
   apertures retain indexed triangles after normalization.

## Measured r185.1 table

| Aperture input | Indexed triangles |
|---|---:|
| Three exact `(0,0,300,300)` holes | 0 |
| One `(0,0,300,300)` hole | 41 |
| Two distinct holes | 60-80 depending on positions |
| Three holes with one quantized-unit (0.21 mm U / 0.12 mm V) separation | non-zero in the cluster-spread sweep |
| Three holes separated by 5+ quantized units | non-zero |

The collapse discriminator is exact coincidence, not ordinary overlap. The
candidate normalizer keeps the authority tuples and removes only later holes
that are wholly contained by an earlier one.

## This lane

`src/destructible-shed-panel-topology.ts` owns the presentation-only
normalization. `src/destructible-shed-presentation.ts` uses it without mutating
authority; `src/destructible-shed-panel-topology.test.ts` is the behavior gate;
the four `scripts/qa/*shed*` instruments measure raw topology, live escapes,
reachability, and the shipped-path pose ring.

## Upstream references

- [Three.js ShapeGeometry documentation](https://threejs.org/docs/#api/en/geometries/ShapeGeometry)
- [Three.js ShapeUtils documentation](https://threejs.org/docs/#api/en/extras/ShapeUtils)
- [Three.js BufferGeometryUtils documentation](https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils)
