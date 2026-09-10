# Maintained residential facade candidate

Scope: source component for the owner's clean house/wall request of 2026-09-10.
Base: `ce85ca80b14f5f297f9940f556c4bfd04e940af1`.
Branch: `contrib/dave-gaming-pc/codex/astra-scene-20260910`.
Impact: runtime presentation. No publication or acceptance is granted here.

## Diagnosis and implementation

VERIFIED source: facade geometry had 220 mm courses and 20 mm exposed dark
reveal bands. The same boards carried 184 mm procedural laps, plus the image
texture's photographed laps, chipped paint, primer failure and splash darkening.
The image albedo was inspected directly. INFERENCE: competing lap pitches and
stacked weathering explain the rejected striped/dirty appearance; full scene
pixel attribution remains OPEN.

VERIFIED source changes:

- Facade seams are 4 mm, with the existing 220 mm pitch, 50 mm outer envelope,
  material roles and presentation-only emission path retained.
- The arena's terracotta and cream siding shares one maintained-paint graph.
  Geometry owns course lines. The additional procedural lap, exposed primer,
  sun-fade and splash masks are absent from this graph. The standalone material
  still supports surfaces whose courses have no geometry.
- Existing image resources remain bound. On painted siding their albedo
  modulation is bounded to +/-2.4%; their normal contribution is 6%. This retains
  paint tooth without adding another strong photographed lap over the geometry.
- Painted timber trim covers raw knots, end grain and silvering. Exposed fence
  timber retains its existing treatment.
- Residential drywall loses its rising-damp band and gets distance-faded
  0.06 mm roller tooth instead of the prior diagnostic flat normal. Unused joint
  crown calculation and its constant were removed.
- No collider, route, spawn, cover, ballistic surface, vehicle, foliage, light,
  exposure, bloom, package, lockfile or acceptance manifest was edited.

## Mechanical evidence

VERIFIED `pipeline:preflight -- --machine dave-gaming-pc --harness codex` passed
at the base, including current-main containment and complete ancestry.
The adapter's uppercase `Codex` fails the executable lowercase-slug contract;
the lowercase harness invocation is recorded explicitly, with no guard change.

VERIFIED `npx tsc --noEmit` passed after implementation.

VERIFIED focused checks:

- Material-family, relief, standalone facade and coherent-exposure files:
  75 tests passed on the initial siding/seam change.
- Material-family, relief, interior-material, pipeline-budget, fidelity and
  oriented-coplanar files: 130 passed, one fidelity failure after trim/drywall.
- Clone-uniform degradation and uniform-type pin: 11 passed.
- New maintained-facade checks: two passed, covering cropped storey bands,
  all four facade directions, unchanged outer envelope, seam coverage and
  shared house graph/resource retention.

VERIFIED the one fidelity failure also occurs on exact base source:
`nuketown2-fidelity.test.ts` / `lands every forged tyre on the authored vehicle
body it dresses` reports a non-wheel tyre-bucket cluster at `(1.86, -3.81)` whose
top is `0.649861216545105`, above the unchanged `0.45` bound. Attribution used
only this isolated tree: saved all five modified tracked paths in memory,
substituted their exact ce85 versions, ran the one named test, and restored
the owned bytes in `finally`. No frozen integration file was changed.
The same location/value failed. This vehicle finding stays OPEN for its owner.

OPEN: build, browser boot, full-scene before/after pixels, native-WebGPU shader
compilation, FPS/draw calls, resize and mobile proof. The root owns the shared
build/browser/GPU slot and will capture this component in the combined candidate.
No claim of visual acceptance is made from unit tests.

## Frozen visual bar for integration

Same deterministic north/south facade, garage, interior and close-wall cameras
in both Performance and Quality. Cream paint should read clean and continuous;
terracotta must remain distinct; joints must read as fine construction seams,
not overlapping zebra bands; trim must frame openings with no dirty raw-wood
pattern; indoor wall bases must not have a continuous damp band. Reject black
pixels, shimmer, lost opening readability or a frame-cost regression. Keep
before images and score independently of this implementation description.

## Technique provenance and gotcha

Consulted current Three.js docs at <https://threejs.org/docs/llms.txt> and
<https://threejs.org/docs/pages/MeshStandardNodeMaterial.html>. Current docs
advertise r186; installed source and package are `three@0.185.1`. Only the
already installed TSL/material APIs are used. No external code was copied.
Method observed in `StarKnightt/morning-diner` (Claude Fable, 2026), shared by
the owner via x.com/prasenx/status/2095537643182563778; re-implemented from first
principles, with competitive readability taking priority over photographic wear.

Symptom: house siding reads as several overlapping stripe/dirty layers.
Cause: geometry, analytic material and image each author independent lap shadows.
Correction: declare one course authority, retain bounded paint tooth, and keep
unpainted weathering separate from maintained opaque paint.
Verify: structural seam/envelope checks plus the unchanged-camera pixel review
above. Source checks alone cannot close the visual finding.
