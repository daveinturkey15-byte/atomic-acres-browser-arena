# Procedural blockwork: align material boundaries before filtering

Verified locally 11 September 2026 on Three.js 0.185.1, native WebGPU/NVIDIA Blackwell.

In `src/nuketown2-materials/families/concrete.ts`, `floor(courseV)` changed the stagger at integer boundaries while `abs(fract(courseV)-0.5)` put mortar at cell centres. The block colour/height hash changed at another unjointed boundary. This produced incorrect running bond and dotted relief under the low-angle light.

Use distance to the nearest integer boundary: `(0.5 - abs(fract(v) - 0.5)) * period`. Align the mortar, stagger and unit hash. Filter each joint from derivatives of its continuous world coordinate, before `fract` or a stagger jump. The existing 12 mm half-support is a shading ramp, not a claim that the documented nominal mortar gap is 24 mm. Widen its support by the pixel footprint and reduce its peak by `authoredWidth / filteredWidth`. This is a bounded filter, not exact integration at arbitrary distances; far/grazing motion remains an acceptance check.

Keep the block branch separate from slab/kerb outputs. Do not stack a photographic brick normal/albedo over a differently sized procedural block grid. A concrete-map substitution also failed the actual clean-finish review: retained experiment `5a30cc53f441e890ee6af8e25d7817789e3ad2b1`. The accepted local direction uses procedural aggregate and mortar relief without those baked marks.

Evidence: runtime `1487a5f885fbc35dad73184194cda220df9a9fc3`, frozen 630-file hash receipt `artifacts/block-aa-freeze.json`; matched captures `artifacts/viewpoint-regression/block-aa-1487-first/`, compared with `clean-block-9dd8-procedural/`. The front-porch view shows coherent continuous joints and reduced dotted breakup. Two camera captures had no errors; 66 focused material/relief tests, typecheck and build passed. This is scoped visual evidence, not full mobile/performance/multiplayer or release acceptance.

Attribution: exact Muse Spark 1.3 Contributor HIGH supplied the phase/filter patch; root inspected source and screenshots and ran checks. No shared shader helper, texture, pass, collider or multiplayer authority changed.

Upstream orientation: [current Three.js documentation index](https://threejs.org/docs/llms.txt), checked 11 September; installed derivative APIs verified in [Three.js r185 MathNode](https://github.com/mrdoob/three.js/blob/r185/src/nodes/math/MathNode.js). Use installed APIs rather than copying newer documentation blindly.
