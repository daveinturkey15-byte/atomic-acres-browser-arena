# Pass 37 — Quality Surface Separation and Fall-Proof Arena Bounds

**Date:** 2026-07-20  
**Status:** live; corrected immutable review promoted byte-for-byte to production

## Overview

Pass 37 removes the remaining local Quality Graphics Z-fighting found after Pass 36’s primary-root fix and guarantees that players cannot leave or fall from the Gun Range platform.

## Context and observations

Pass 36 eliminated simultaneous rendering of the complete procedural and authored Atomic Acres environments. A second Blender source sweep found smaller residual overlaps inside the authored Quality asset:

- road contact patches and civic chevrons separated by only `3 mm`;
- lane markings and crosswalk bars separated by only `4.5 mm` where their footprints intersected;
- indoor ramp rails embedded `10 mm` into the ramp sides over almost their full length;
- upper-floor strips and both landing plates exported with overlapping top faces at the same elevation;
- house side-wall ends overlapped front/rear wall faces at corners;
- bus identity strips shared exact side planes with the bus body;
- one authored concrete-pipe stack placed parallel pipes collinearly through each other;
- boundary-wall top faces overlapped at the four corners.

Gun Range had side berms, a backstop, and a player-only firing line, but no rear physical wall. `CharacterPhysics.create()` claimed four safety walls in its comment while constructing only the floor. A player could therefore leave the floor behind the firing booths and fall.

## Requirements

- **R1:** Remove exact or millimetre-separated same-facing authored surfaces at the identified road, ramp, floor, wall-corner, bus, pipe-stack, and boundary-corner sites.
- **R2:** Preserve TypeScript collision, navigation, semantic windows, centre-ray authority, traversal routes, draw-call budgets, and legacy Quality profile aliases.
- **R3:** Use edge-abutting platform and wall boxes rather than overlap where a sealed seam is required.
- **R4:** Keep intentional road overlays on non-intersecting footprints or establish sufficient source separation; do not apply blanket material `polygonOffset`.
- **R5:** Add four full-height physics-only walls whose inner faces exactly match every arena’s declared bounds.
- **R6:** Gun Range containment must cover its open rear edge as well as left, right, and downrange edges in standing, crouched, prone, sprint, and jump movement.
- **R7:** Boundary walls must not enter raycast/ballistic geometry, so bullets and test rays retain their existing behavior.
- **R8:** Regenerate the deterministic editable `.blend`, self-contained GLB, preview, spec, and provenance hashes from checked-in authoring sources.
- **R9:** Build once, freeze the artifact, inspect an immutable review URL, compare every HTTPS file, and promote those exact bytes without rebuilding.

## Acceptance criteria

- **C1:** Initial Quality load and map-away/map-back telemetry continue to report authored root visible, procedural primary root hidden, and overlap false.
- **C2:** Deterministic architecture tests report zero positive-area overlap among non-rotated upper floors and landing top surfaces.
- **C3:** Both indoor ramp rails have at least `25 mm` clear separation from the timber ramp side planes.
- **C4:** Both house routes and both ramps remain traversable in both directions at retained movement speeds.
- **C5:** The rebuilt GLB remains self-contained with six semantic windows, 27 materials, no external URI, and bounded mesh/triangle counts.
- **C6:** Character physics cannot cross any of the four bounds during 240-step directed stand/crouch/prone probes with a jump arc; the standing browser probe keeps eye height above `1.5 m`.
- **C7:** Browser Gun Range probes against all four edges remain within declared bounds and above the floor.
- **C8:** Existing firing-line character blocking and bullet/ray pass-through tests remain green.
- **C9:** Focused Quality/Gun Range Chromium, full units, retained map/ray/combat/explosion suites, lint, gameplay contract, build, release-tree, dependency audit, and console/WebGL checks pass.
- **C10:** Frozen, immutable review, and production manifests match with zero file differences.

## Implementation

- Re-authored the identified surfaces instead of changing global depth state:
  - abutted house floors, landing plates, and side-wall ends;
  - moved ramp rails outside the ramp side planes;
  - removed intersections among road markings, civic chevrons, grime/contact patches, and road repairs;
  - moved bus trim and destination/grille details off shared or under-20-mm planes;
  - arranged the pipe stack as parallel pipes rather than collinear overlaps;
  - shortened long boundary walls to abut north/south walls;
  - gave the three beacon rings distinct radii.
- Regenerated the authoritative spec, editable Blender source, self-contained GLB, preview, provenance, asset manifest, and approved gameplay contract.
- Added four physics-only Rapier perimeter walls in `CharacterPhysics.create()` for every arena. They are deliberately absent from `arena.raycastMeshes`, presentation roots, bot navigation lists, and shot-authority meshes.
- Added Pass 37 telemetry, deterministic unit coverage, and a Chromium suite that presses the Gun Range player against all four bounds.

## Authoring audit

A headless Blender same-facing plane scan was run before and after re-authoring. The targeted exact/under-`20 mm` pairs across upper floors/landings, wall corners, ramps/rails, road overlays, bus trim, pipes, boundary corners, facade trim, and beacon rings changed from **74 to 0**. The GLB was then authored twice from the same sources and produced the same SHA-256 both times:

`1e14fcf7bc57104c88642d3aa89358b6961d0c8e3224963b52dc3f37da913686`

Final GLB contract: **33 meshes, 27 materials, 34,336 triangles, six semantic windows, no external URI, 7,130,044 bytes**. The additional triangles are the corrected open bus-door frames caught by pre-release review; the opaque plates were not promoted.

## Local verification

- TypeScript/lint: pass
- Gameplay contract: pass after reviewing and approving only the intended house collider/landing deltas
- Unit/property suite: **339/339**
- Pass 37 Quality/bounds Chromium: **2/2**
- Retained Pass 36 Chromium: **7/7**
- Retained Pass 35 explosion/Tri-Pass Chromium: **3/3**
- Retained Pass 34 combat/maps/Quality Chromium: **4/4**
- Retained real browser bot ramp traversal: **2/2**
- Map gates: **3/3**
- Centre-ray matrix: **18/18**, zero angular error and zero HUD offset
- Leaderboard: **22/22**
- Release tree: **56 files**, no rejected or oversized files
- Dependency audit: **0 vulnerabilities**
- Local visual inspection: road/crosswalk, bus trim, and indoor ramp/landing frames showed no residual depth conflict, gaps, floating markings, or light leaks
- Browser console: **0 JavaScript errors**
- WebGL context: **0 losses**

## Release gate

The first immutable candidate was rejected before promotion because independent review found that an opaque box named as a bus door frame hid the glass, and that the browser containment assertion could pass with no movement. The source now builds the frame from five abutting bars and requires every browser probe to reach its intended edge before asserting containment.

- Release source: `245804d`
- Frozen artifact: `/root/jigglyclaw/releases/atomic-acres-pass37-245804d`
- Manifest: `/root/jigglyclaw/releases/atomic-acres-pass37-245804d.manifest.sha256`
- Manifest SHA-256: `c294a2e6b32beaf4d0010916584102f9f48da8c7dbd489a59983544d71f79617`
- Payload: **56 files, 20,510,026 bytes**
- Corrected immutable review: `review/pass37-quality-surface-bounds-245804d/`
- Review Pages commit: `6f7dd687a6016ac1d3d198d708f849d4bc46e5a2`
- Production Pages commit: `4103344479bcb20860c40501ca4fdaaabbda2958`
- Frozen ↔ review HTTPS comparison: **56/56**, zero mismatches
- Frozen ↔ production HTTPS comparison: **56/56**, zero mismatches
- Live telemetry: Pass 37, separation true, Quality art visible, procedural primary root hidden, root overlap false, four movement walls, zero JavaScript errors, zero WebGL losses

## Out of scope

- Replacing the Quality asset’s artistic direction.
- Making Quality-mode SwiftShader FPS representative of hardware WebGL.
- Adding playable space outside declared arena bounds.
