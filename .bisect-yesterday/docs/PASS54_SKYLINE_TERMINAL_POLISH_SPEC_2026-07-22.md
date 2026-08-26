# Pass 54 — Skyline Terminal authored-detail polish spec

**Date:** 2026-07-22<br>
**Target:** `skyline-terminal` on `desky/terminal-polish-20260722`<br>
**Base:** `ddebd10d8f6deedccec06924e93e8c97ec2ff442`<br>
**Intent:** Bring Skyline Terminal to the authored visual standard of Atomic Acres while preserving the existing original airport layout and all gameplay authority.

## Evidence and state

### Observations

- The deployed Blender-profile baseline is structurally playable but visually reads as an early blockout: broad pale floors, flat boundary walls, saturated teal rails, sparse interior clusters, lightly authored tarmac, and a box-built aircraft.
- A low concourse view lets the escalator underside become one large dark diagonal shape with little internal structure.
- Existing verticality is already useful and mechanically encoded through three routes: concourse to mezzanine, mezzanine through the jetbridge to the cabin, and cabin through the rear airstair to the apron.
- The baseline Performance-profile map measures **62 draw calls / 1,470 triangles**, leaving large margin below the retained **147-call / 158,000-triangle** gates.
- Exact Gemini `gemini-3.6-flash-high` completed a read-only visual/source critique in 94.125 seconds with no fallback and no stderr. It independently ranked escalator segmentation, floor/wall hierarchy, aircraft silhouette, window framing, atmosphere, route framing, props, and apron markings as the highest-return work.

### Inferences

- Coherent, material-batched architectural clusters will add more perceived quality than many unrelated props.
- The best risk/reward path is additive presentation geometry plus material/atmosphere changes; collision, route geometry, and spawn placement do not need redesign.
- Shared materials and the existing `batchPresentationOnlyBoxes` path can make substantial Performance-profile detail inexpensive.

### Assumptions

- Procedural Three.js geometry is sufficient for this pass; no new downloaded or generated asset is required.
- The current Atomic Acres warm directional-light hierarchy is the correct internal benchmark, but Skyline should retain a distinct steel/glass/amber airport identity.

### Unknowns and falsifiers

- **Unknown:** Whether all authored clusters remain attractive from every spawn and elevated route. **Falsifier:** representative concourse, mezzanine, cabin/jetbridge, and apron captures reveal clipping, z-fighting, dead walls, or route obstruction.
- **Unknown:** Whether increased detail remains inside runtime budgets after Vite production bundling. **Falsifier:** the real Performance browser gate reports over 147 calls, over 158,000 triangles, context loss, or console/page errors.
- **Unknown:** Whether atmosphere changes retain combat readability. **Falsifier:** final captures obscure silhouettes or wash out navigation accents.

## Scope

### 1. Material and light hierarchy

- Replace prototype cyan/off-white/brown emphasis with grounded slate steel, terrazzo/concrete, warm amber wayfinding, restrained aqua glass, graphite rubber, off-white aircraft skin, and dark cockpit glazing.
- Increase warm-key/cool-shadow separation in the Skyline atmosphere without changing other maps.
- Use emissive geometry for practical lights; do not add shadow-casting local lights.

### 2. Terminal architecture

- Add floor runners, terrazzo borders, expansion seams, mezzanine edge bands, lower-wall wainscot, structural wall columns, ceiling ribs, and recessed light strips.
- Frame every breakable facade pane with non-breakable mullions while preserving the six original breakable meshes and IDs.
- Upgrade the baggage carousel, cafe, duty-free, and security clusters with a few coherent material layers.

### 3. Vertical-route framing

- Keep every existing solid ramp, platform, and route coordinate byte-for-byte unchanged.
- Segment both escalators visually with lighter side housings, dark tread bands, rails, supports, and amber comb-plate landings.
- Add threshold frames, ribs, and light strips to the gate connector, jetbridge, and rear airstair.

### 4. Aircraft and apron

- Keep the collision-authoritative fuselage, wing, engine, and cabin boxes unchanged in size and position.
- Add an authored aircraft skin hierarchy: dark belly band, cockpit glazing, cabin window belt, wing-edge accents, tail markings, engine intake faces, and navigation lights.
- Add apron slab seams, taxi/stand markings, safety boxes, service-cart detail, wheel/chock hints, cargo accents, and engine-zone stains without adding movement blockers.

### 5. Originality boundary

- Use only original project geometry, colors, labels, and procedural materials.
- Do not reproduce any Call of Duty/Black Ops asset, exact map geometry, brand, logo, named locale, audio, or protected visual identity.

## Detail tiers and batching

- **Core:** existing collision/gameplay authority only.
- **Performance:** major architectural framing and route-reading detail, non-solid/non-raycast, grouped through existing static presentation batching by shared material.
- **Quality:** a bounded second layer of signs, fine rails/ribs, small props, and aircraft/tarmac finishing pieces.
- Prefer one authored cluster with shared material over many unique one-off materials. No random decorative scatter.

## Mechanical acceptance checks

1. `npm run lint` passes without weakening TypeScript settings.
2. `npm test` passes, including new Skyline semantic-cluster/profile assertions.
3. `npm run build` produces a production bundle.
4. `node scripts/qa/verify-pass33-maps.mjs` reports Skyline at or below **147 calls / 158,000 triangles**, with one active root, no context loss, and no page/console errors.
5. All existing Skyline colliders, physics colliders, spawn arrays, patrol points, physical-cover bounds, and bounds remain unchanged.
6. Route metadata remains unchanged for `concourse-to-mezzanine`, `mezzanine-to-jetbridge`, and `fuselage-to-tarmac`; existing bidirectional route tests pass.
7. The six `skyline-window-*` breakable IDs and their dynamic shot meshes remain intact; added mullions are not breakable.
8. Performance profile visibly includes the authored floor/wall/escalator/window/aircraft/apron framing; Quality profile adds its bounded fine-detail layer.
9. Skyline presentation batching saves at least **24 draw calls** and retains hidden semantic source nodes for inspection.
10. Named semantic nodes exist for all seven clusters: `floor-language`, `wall-structure`, `escalator-detail`, `window-frame`, `aircraft-skin`, `apron-marking`, and `terminal-story`.
11. Representative real-browser captures cover concourse/escalator, mezzanine/jetbridge, cabin/airstair, and apron/aircraft views with no route-blocking geometry, obvious z-fighting, or large unsegmented placeholder surfaces in the focal area.
12. A second exact Gemini 3.6 Flash High review inspects the final screenshot/diff; Codex independently accepts or rejects each useful finding before completion.

## Do not change

- Solid escalator, jetbridge, fuselage, wing, engine, floor, wall, seat, prop, and boundary collider geometry.
- Spawn coordinates, patrol points, physical-cover records, arena bounds, route coordinates, or maximum climb contracts.
- Breakable-window mesh names/IDs or shot behavior.
- Other arenas' atmosphere themes or presentation behavior.
