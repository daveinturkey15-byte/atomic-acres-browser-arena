# Atomic Acres Textured Blender Lighting — Pass 24

Date: 2026-07-16
Branch: `overhaul/blender-textures-lighting-pass-24`
Status: tested local candidate; isolated review pending

## Owner feedback

Dave approved the Pass 23 direction and requested correction of floor-lighting issues plus real texture detail.

## Root cause

Pass 23 had two distinct visual problems:

1. `BLD_TERRAIN_grass_cap` covered the complete arena footprint and reached the same `y=0.03` top elevation as the full asphalt road. The two large surfaces were coplanar wherever the road crossed the grass. Depth precision could therefore alternate which surface won, creating unstable floor lighting, broad shimmer and flat-looking patches.
2. The Blender GLB contained zero images. Materials used authored scalar colour/roughness values, but asphalt, concrete, grass, siding, plaster, timber, metal and roof surfaces had no spatial detail. The shared environment light rig was also tuned for the older procedural palette, using more fill and exposure than the imported Blender materials needed.

This was not a collision problem. TypeScript/Rapier gameplay geometry remained correct.

## Geometry correction

The single full-footprint grass cap was removed. Grass now uses two authored verge footprints:

- west verge: centre `x=-28.6`, width `28.8`;
- east verge: centre `x=28.6`, width `28.8`;
- both rise from the terrain foundation to `y=0.03`;
- both terminate at the outer sidewalk edges;
- asphalt retains its authoritative road footprint without any grass overlap.

The joined grass and asphalt nodes carry:

```text
atomic_ground_layout = split-road-verges-v2
```

The GLB asset test requires both semantic ground batches and rejects regression to the overlapping layout.

## Embedded authored textures

The deterministic Blender generator now embeds existing original project textures from:

```text
public/assets/original/textures/
```

Used surfaces include:

- `grass-turf.png`;
- `asphalt-aged.png`;
- `concrete-poured.png`;
- `plaster-warm.png`;
- `siding-aqua.png`;
- `siding-coral.png`;
- `brick-warm.png` where an authored brick surface is used;
- `wood-deck.png`;
- `weapon-gunmetal.png`;
- `roof-shingles.png`.

All texture images are packed into the editable `.blend` and embedded into the GLB. There are no external image or buffer URIs and no runtime texture requests.

Box UVs are projected per face in local metres. Cylinders, spheres and tori retain their authored UV topology with deterministic metre-derived repeat scaling. The GLB therefore carries stable texture density rather than stretching one image across a complete 86×98 metre floor.

## Lighting contract

`src/blender-lighting.ts` centralizes profile-specific lighting. Blender Render now uses:

```text
ACES exposure             1.02
Hemisphere intensity      1.00
Ambient intensity         0.18
Sun intensity             2.45
Shadow bias              -0.00012
Shadow normal bias        0.04
Shadow filter             PCF
Shadow mode               static, 2048
```

Performance and Quality retain their previous values exactly:

```text
ACES exposure             1.14
Hemisphere intensity      1.48
Ambient intensity         0.38
Sun intensity             2.80
Shadow bias              -0.00028
Shadow normal bias        0.025
Shadow filter             PCF
```

Pure and Chromium tests bind these values so later visual work cannot silently alter other profiles.

## Runtime asset audit

```text
GLB bytes                  3,812,608
Mesh nodes                 25
Materials                  19
Triangles                  18,884
Embedded images            9
Texture bindings           12
Semantic windows           6
External URIs              0
GLB SHA-256                b65595d3f6f0967e0ddf2b18c002cd32691ec70b7ec4cca6c37488584408b9ad
Blend SHA-256              a592cd6cb572bd170a0f538f6a92228855a239a17862699e88b87c994e5450e2
Spec SHA-256               239c91038d234f77b2678fab6513b4cf5eced563e6fcb3f3d62573f32d2218f1
```

Two consecutive factory-startup authoring runs produced byte-identical GLBs. Blender's rotating `.blend1` backup remains disabled.

## Browser evidence

The focused Blender scenario proved:

- environment status `ready`;
- 25 meshes and 19 materials;
- 12 textured materials using 9 unique loaded textures;
- 18,884 authored environment triangles;
- six of six breakable windows bound;
- imported pane breaks after an ADS bullet;
- procedural world presentation hidden;
- no page errors.

Independent active-gameplay capture measured:

```text
Draw calls                 59
Rendered scene triangles   61,426
Pixel ratio                1
Drawing buffer             1280×720
Console errors             0
```

Visual review confirmed distinct asphalt, concrete, grass, faction siding, plaster, timber, roof and gunmetal surfaces; clean grass/road transitions; readable exterior-ramp shadow; and no visible broad z-fighting or washed-out floor.

## Verification

- TypeScript/lint: pass
- deterministic tests: 181/181
- focused profile/asset/provenance tests: pass
- Chromium coverage: 28/28 in bounded groups
- production build: pass
- release-tree audit: 30 files, zero rejected candidates, zero oversized files
- npm audit: zero vulnerabilities
- deterministic Performance multiplayer over localhost PeerServer: complete, `errors: []`, stance/window/drop/scavenge/pickup replication true
- deterministic GLB regeneration: byte-identical consecutive outputs

The Tri-Pass browser case keeps rendering paused after its three authoritative impacts are proven. Resuming was teardown-only and caused a software-WebGL shader/render spike before later state reads; removing that cleanup-only resume does not change or weaken the three-target/three-impact assertions.

## Release boundary

Publish only to a new isolated Pass 24 review path. Do not replace the canonical root or the Pass 23 review snapshot without separate approval.
