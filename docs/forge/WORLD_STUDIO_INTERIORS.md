# New World interior furniture

Runtime contribution, 2026-09-12. Owner-authored house anchors define placement and circulation; this kit never moves them. The requested 20-anchor room dressing is original code with no downloaded meshes/textures, Blender, shader injection, renderer changes or extra lights.

## Consumer contract

`createStudioInteriors(anchors)` in `src/world-studio/interiors/index.ts` returns a render `root` and explicit structural `solids`. Root integration owns insertion, collision/ballistic registration and disposal. Each solid uses world-centred **unrotated local extents plus `rotation: [0, yaw, 0]`**. Do not expand those extents into a world AABB and then rotate again. Its `mesh` is the visible merged material mesh. Deduplicate that mesh list for raycasts while retaining each independent authoritative OBB; mesh origin is not the individual collider centre. Tables have four leg solids and a tabletop; empty under-table volume remains open. Small handles, welt and bedding accents are presentation only.

Ten suffixes are supported: sofa, coffee-table, tv-unit, dining-table, kitchen-run, bed, wardrobe, desk, bed2, workbench. Sofa/bed factories consume distinct footprints from both houses. Malformed/duplicate anchors, unsupported suffixes and parts extending past the input footprint fail closed.

## Art method

The supplied living-room and bedroom eye references guided sage woven upholstery, warm walnut, ochre enamel and cream/mustard bedding. Upholstery has separate rounded seats/back cushions, arms, narrow welt and tapered legs. Beds have frame, headboard, mattress, patterned duvet, sheet fold and pillows. Kitchen doors retain reveals and hardware; the segmented counter has a shallow recessed metal sink and tap, plus a four-burner hob. Secondary anchors carry paneled storage, a period television, drawers, books and a garage toolbox.

The existing `rasterizeSurface` forge produces albedo/normal/roughness maps, packed in CPU-safe DataTextures with mip filtering. Four textured and four flat MeshStandardMaterial families merge across both houses. Fabric weave is authored at 1.5 mm pitch; walnut grain at roughly 17 mm with smaller tonal variation. This is authored scale, not a measured pixel claim. No arbitrary dirty overlays or extra lighting hide missing geometry.

Method observed in `StarKnightt/morning-diner` (Claude Fable, 2026), shared by the owner via x.com/prasenx/status/2095537643182563778; re-implemented from first principles. No source from that unlicensed repository was copied. Installed Three.js RoundedBoxGeometry and BufferGeometryUtils source supplied API compatibility details.

## Evidence and limits

- VERIFIED CPU generation: all 20 mirrored authored anchor types produce 248 components, 128 structural OBBs, **20,552 triangles and 8 merged draw groups**, below unchanged 60,000 / 70 fences.
- VERIFIED focused tests: finite geometry, all anchors, footprint containment, world-centre/yaw authority, open table leg space, distinct cushions/bedding/kitchen details, PBR maps and malformed-input falsifiers. Run `npx vitest run src/world-studio/interiors/interiors.test.ts`.
- VERIFIED text-integrity check passed. Full TypeScript reports the branch's absent root-owned arena/environment imports; no interior-module errors were reported. Root must compile after integrating its dependencies.
- OPEN actual GPU draw cost, lighting, pixel quality, navigation/shot runtime, disposal in the arena consumer and owner visual approval. CPU counts are not a gameplay benchmark or visual acceptance.
- OPEN dining chairs, lamps and wall decor outside the ten allocated anchor footprints. No additional positions were invented in circulation space.

Capture at the parent-owned living and bedroom review cameras in Performance and High after exact-source integration. Reject clipping into routes, floating furniture, flashing materials, illegible cloth texture, or an opaque under-table shot volume. Original acceptance and vehicle-budget failures remain independent.
