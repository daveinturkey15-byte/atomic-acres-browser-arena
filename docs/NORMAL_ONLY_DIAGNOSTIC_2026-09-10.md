# Normal-only vehicle diagnostic, not accepted product

VERIFIED: Muse Contributor identified, and host/root independently reviewed,
the double flip in `pushTriangle`: `needsFlip` already chooses winding to agree
with the supplied analytic normal; negating the normal again preserves opposition.
Only that normal negation is removed. No spec, position, UV, collider, material,
draw bucket, station, glazing partition or assembly change is included.

VERIFIED: New 27-case regression records exact b63 position/UV hashes and vertex
counts for three vehicle lofts, lathe/chamfer/strip/roof-rail/surface-band helpers,
and all three real wheel styles. Before correction: 21 failed, 6 passed. After:
24 passed, 3 failed. All position/UV hashes/counts remain identical. Coach buckets
and every helper/wheel case have zero opposing nondegenerate triangles.

OPEN: Truck lining still has 2 opposing triangles; sedan body 2; sedan lining 22.
The strict zero-opposition checks stay failing. Thin/non-planar arch and inset
corner faces are suspected; do not flip normals opportunistically or weaken the
test to hide them. This diagnostic may be rendered for attribution, not accepted.

VERIFIED: Existing seven-file regression: 63/65 pass. Two collider/visual parity
failures were reproduced independently on byte-original b63 geometry (4/6 pass):
untriaged walk-through mesh and unrated ghost-shot merged paint surface. These
remain OPEN inherited failures, not corrected or made acceptable by a normals fix.
Vehicle/material/glass/weathering/wheel/budget tests pass. TypeScript passes.

OPEN: Matching 1280x720 actual coach front/side capture is required. Lighting
correction is not proof of fixing the malformed windshield/brow/body silhouette.
Separate front partition experiments must follow source and pixel evidence.
