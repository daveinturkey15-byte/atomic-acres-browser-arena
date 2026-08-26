# Skyline Terminal gameplay and art overhaul

**Date:** 2026-07-22  
**Branch:** `agent/skyline-terminal-overhaul-20260722`  
**Base:** `6b0495dae308878bb969916e4f5d80539f90157e`  
**Intent:** Turn Skyline Terminal from a readable blockout into a dense, original airport combat space with traversal, cover, material, silhouette, and menu-preview quality comparable to the other Atomic Acres arenas.

## Evidence and claim state

### Observed

- The live Quality build activates exactly one `skyline-terminal` root with 57 physics colliders, 44 navigation colliders, 6+6 valid spawns, no WebGL context loss, and high frame rate.
- Team Aqua currently spawns beneath the 3.2 m mezzanine at `z=-30`; the low ceiling occupies most of the initial view and reads as a near-black void.
- The terminal concourse has large unoccupied floor areas between the facade, security belt, escalators, and rear kiosks. Existing physical-cover metadata exposes only five apron/backwall objects and no concourse cover.
- The jetbridge is a dark, uninterrupted tunnel with one ceiling strip and no side-window or doorway hierarchy.
- The aircraft is still dominated by rectangular fuselage, nose, wing, engine, seat, cargo, and trailer primitives in the Quality profile.
- Cabin seat boxes leave only 0.8 m between opposing seat edges. The current physics capsule has a 0.38 m radius, while conservative map-clearance probes use 0.44 m; the nominal aisle is narrower than that 0.88 m probe diameter before collision tolerance.
- The jetbridge meets a 3.6 m gap in the aircraft wall, but the opening has no convincing doorframe, jamb, door leaf, threshold seal, or cabin-side arrival cue.
- Selecting Skyline Terminal in the deploy menu can leave the right-hand preview black even though the selection and active arena root have changed.

### Inferences

- The cabin complaint is caused by seat-clearance geometry, not the broad fuselage doorway gap.
- Coherent airport families—seating islands, queue rails, service equipment, cabin modules, curved aircraft skin, and authored surface patterns—will add more quality than random prop scatter.
- The strongest first-impression fix is a combined spawn/camera/underside-material change; lighting alone cannot make a low slab composition feel open.

### Assumptions

- “Terminal from MW2” means broad pacing, vertical route pressure, plane/terminal contrast, and dense readable cover—not copied geometry, branding, textures, props, audio, or exact layout.
- Original runtime-generated textures and Three.js geometry are acceptable authored assets when provenance and performance are testable.
- The current 70 m square gameplay footprint and three vertical-route chain remain appropriate.

### Unknowns and falsifiers

- **Unknown:** whether the widened cabin route remains comfortable under real keyboard movement. **Falsifier:** a forward/back traversal test or live run stalls between any seat row or doorway jamb.
- **Unknown:** whether new cover over-compresses bot lanes. **Falsifier:** valid spawns drop below 6+6, navigation authority diverges, or route/segment probes show the centre and both flanks blocked.
- **Unknown:** whether the richer Quality scene stays within practical GPU budget. **Falsifier:** the real production browser exceeds the project map gate, loses WebGL context, logs errors, or materially degrades frame pacing.
- **Unknown:** whether the revised preview composition remains useful behind the deployment panel at all supported viewports. **Falsifier:** desktop evidence remains black/empty or the hero aircraft and terminal facade are both outside the visible right-hand region.

## Asset decisions

### Keep and refine

- Tarmac, concourse, mezzanine, escalators, six breakable facade panes, gate connector, jetbridge, cabin floor, airstair, fuel station, apron boundaries, and the existing vertical-route chain.
- Existing original slate/aqua/amber palette, but introduce patterned terrazzo, brushed panel, rubber, seat-fabric, aircraft-skin, and cargo finishes.

### Replace in Quality presentation

- Rectangular fuselage roof/nose/engine silhouette with curved segmented aircraft presentation while retaining collision and ballistics authority.
- Uniform cargo cubes with airport ULD/service-load silhouettes.
- Unbroken jetbridge wall treatment with framed glazing, ribbing, and practical lights.
- Bare mezzanine undersides with light coffers and acoustic-panel language.

### Remove or relocate

- Retire the visual dominance of placeholder plane boxes in Quality mode without removing their mechanical authority.
- Move the initial terminal team out from under the mezzanine and keep a clear centre deployment lane.
- Remove any decorative element that narrows the minimum cabin aisle or disguises a collision boundary.

### Add

- Two concourse seating islands, low planter/charging cover, queue stanchions, maintenance luggage, departure/gate cues, and apron service clusters.
- A visibly framed aircraft boarding door with jambs, header, recessed door leaf, threshold seal, and cabin-side EXIT cue.
- A tested cabin centreline route from cockpit partition to rear airstair.

## Mechanical acceptance checks

1. TypeScript lint, focused Skyline tests, full unit suite, production build, provenance checks, and map smoke verifier pass.
2. Exactly one Skyline root is active; physics/navigation authority matches and no WebGL context is lost.
3. Every Skyline spawn remains inside bounds, clear at 0.44 m radius, and 6+6 are retained.
4. The cabin centreline exposes at least 1.15 m clear width and traverses in both directions through every seat row.
5. The aircraft doorway has named frame, header, leaf, seal, and sign nodes while preserving a minimum 1.8 m visible aperture.
6. Three original vertical route chains still traverse bidirectionally.
7. Concourse physical cover rises from zero to at least four deliberately spaced records while centre and flank lanes remain open.
8. Six breakable window IDs and their shot behavior remain unchanged.
9. Quality presentation contains curved aircraft hero geometry and hides only the replaced placeholder rendering—not collision or ballistics authority.
10. Desktop browser evidence includes menu preview, initial spawn, concourse, doorway/cabin, and apron views, plus console logs and before/after render telemetry.
11. No third-party or protected-map asset, texture, logo, name, audio, or extracted geometry is introduced.
