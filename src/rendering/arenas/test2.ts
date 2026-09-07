import { buildTest2 } from '../../test-maps';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * Test2 (owner 2026-08-30, docs/TEST2_MAP_BRIEF.md): sun-drenched hillside
 * mansion at late afternoon - long warm shadows over travertine, pool glint,
 * hedges. Open-air throughout; emissive-only practicals, golden key light.
 *
 * Lighting rig v2, same programme as test1.ts and from the same source
 * (docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md, "Lighting, sky and
 * atmosphere"), tuned for the opposite end of the day:
 *
 * 0. WHAT IS NOT TRUE ON THIS ROUTE. See the identical note in test1.ts:
 *    `scene.environment` measures NULL on all eight arenas on the WebGPU
 *    quality route (2026-08-30), so the PMREM every claim below leans on is not
 *    reaching any surface. `arenaEnvironmentScale('test2') = 0.22` is inert,
 *    the authored ground hemisphere lights nothing, and metalness is a pure
 *    subtraction. The numbers here are authored for the route as it runs.
 *
 * 1. THE SKY IS NOW THE ARENA'S OWN. 'estate-golden-hour' was being replaced at
 *    runtime by the terminal airport-dawn panorama - a clear blue mid-morning
 *    dome standing in for golden hour - and, through the PMREM in
 *    arena-environment-ibl.ts, that dome was also the arena's entire ambient
 *    and reflection source. Removed in sky-backdrop.ts. Its authored sun disc
 *    was additionally 21.6 degrees BELOW the horizon, so its glow was baked
 *    into the ground half of the IBL; it now sits on the key.
 * 2. THE FLAT AMBIENT STAYS COOL. The extraction is explicit that lerping a
 *    warm bounce into the fill instead of normal-gating it puts a warm street
 *    bounce on every wall and makes shadows warmer than the sun casting them,
 *    so the one flat term this definition owns is held cool (0xa9c2d8 ->
 *    0x8fb2d8) and the warmth is left to the key.
 *
 *    v2 also cut it 0.46 -> 0.36 on the strength of the preset's authored
 *    ground hemisphere reaching surfaces through PMREM. It does not (note 0),
 *    so the intensity is restored (art pass 2026-08-30). Shadowed pixels in the
 *    shipped flyover measured mean linear Y 0.038 against Atomic Acres' 0.050
 *    and Farcrysis' 0.121 at an identical key.
 * 3. THE KEY IS RE-SPECTRALISED AT CONSTANT LUMINANCE. 0xffd9a0 at 2.9 has
 *    Rec.709 luminance 0.867 * 2.9 = 2.513. The golden-hour hue 0xffcf92
 *    measures 0.835, so 3.0 reproduces the same 2.51 luminous key with a fully
 *    golden spectrum: the arena gets warmer without getting brighter, and the
 *    change is arithmetic rather than a re-eyeball.
 * 4. SHADOW BIAS DERIVED, AND RE-DERIVED 2026-08-31. The same arithmetic, on
 *    the rebuilt map. graphics-refinement.ts now fits Test2 a 108 x 84 m shadow
 *    volume (was 80 x 64), so 2048 gives 52.7 mm per texel rather than 39 mm.
 *    Upstream's normal-offset bias is texelWorld * (0.55 + 1.1 * (1 - NdL));
 *    the ground here sees NdL = sin(18.4 deg) = 0.315, giving 1.30 * 0.0527 =
 *    0.069. Holding the old 0.051 through a 35% larger texel is how acne comes
 *    back on the long travertine runs this arena is mostly made of. 2048 is
 *    kept: 108 m at 4096 would quarter the texel and double the shadow-map
 *    pixel budget for a map whose tallest mass is a 4.8 m parapet.
 *
 * indirectScale/exposureBias are deliberately left at unity: the extraction's
 * curves only start stopping the indirect budget down below 14 degrees of solar
 * elevation, and the key this arena is actually given sits at 18.4.
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'test2',
  displayLabel: 'Test2',
  moduleId: 'arena.visual.test2.v1',
  // No panorama: the authored 'estate-golden-hour' procedural sky is this
  // arena's final backdrop and its IBL source (see skyBackdropAssetForPreset).
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xffcf92, sunIntensity: 3,
    ambientColor: 0x8fb2d8, ambientIntensity: 0.46,
    practicals: [
      { id: 'test2-estate-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  // Matched to the horizon band rather than to the sun: the average view across
  // this arena is not into the key, and a fog tinted to the glow itself put
  // amber haze on the shaded side of every wall.
  //
  // near 58 was well inside the map. TEST2_BOUNDS was 76 x 58 m, a 95.6 m
  // diagonal, so a corner-to-corner sightline spent its last 40% inside the fog
  // band and every long lane graded toward one amber - which is most of why
  // this arena's rendered chroma collapsed into a single hue bin (55-72% of the
  // frame's chroma weight, against 37-44% for Atomic Acres and Farcrysis).
  // near 98 put the whole playfield in front of the haze.
  //
  // RE-PINNED 2026-08-31 with the 100 x 76 m rebuild. The new diagonal is
  // hypot(100, 76) = 125.7 m, so near 98 would have put the far quarter of
  // every long lane back inside the haze band and reintroduced exactly the
  // chroma collapse the last pass measured and fixed. near 128 clears the new
  // diagonal by 2.3 m - the same clearance 98 gave 95.6 - and far moves with it
  // at the authored 88 m depth (98 -> 128 near, 186 -> 216 far), so the ridge
  // ring and the hillside behind it recede on the same curve as before.
  // Art pass 2026-08-31: colour, not distance. near/far are the last pass's and
  // stay. 0xe6cbab put the fog at hue 28 deg - inside the travertine's own bin -
  // and everything past 98 m (the whole ridge ring and the hillside behind it,
  // the largest bright mass in the menu flyover) graded toward it, which is why
  // this map still measured 2 hue bins carrying 5% of frame chroma against 5
  // and 7 for the shipped controls. A golden-hour haze is gold when you look
  // INTO the sun and lilac when you look across the valley away from it; this
  // fog is explicitly matched to the horizon band and not to the sun, so lilac
  // is the honest half of that pair. Luminance is held (Rec.709 luma 0.809 ->
  // 0.791 in sRGB), and near 98 keeps the whole playfield in front of it, so this
  // changes the distance and nothing a player fights in.
  fog: { color: 0xdcc4cd, near: 128, far: 216 },
  // maximumDistance 150 still covers the new 125.7 m diagonal, with 24 m spare;
  // re-checked rather than re-pinned.
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.069 },
  atmosphere: { preset: 'estate-golden-hour', mist: 0.1, dust: 0.08, clouds: true },
  colorPipeline: colorPipeline('pass81.test2.hdr.v1', 1.07),
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 700_000 }),
  // RE-AUTHORED 2026-08-31. Three of the four previous cameras were aimed by
  // coordinate at geometry the rebuild demolished - the x = 13 balustrade, the
  // motor-court car at x >= 21.55 and the centre garden hedge - so all four are
  // re-seated on the new plan. The NAMES are unchanged on purpose: they are
  // pinned in scripts/qa/viewpoint-catalog.mjs and carry the baseline history.
  reviewCameras: [
    // The whole estate from the south-east, high enough to read all three lanes
    // and the four upper rooms at once.
    camera('test2-estate-overview', [44, 34, 50], [-2, 2, -6], 'overview', 1.07),
    // Down-sun: bears (+1, 0) against a key bearing of (-0.853, +0.522), so
    // this is the front-lit probe - warm key on travertine, pool coping and the
    // colonnade of the covered walk. It now runs the pool lane's real length,
    // from inside the sunken sport court to the wing that closes it.
    camera('test2-pool-lane', [-34, 1.65, -23], [14, 1.4, -23], 'geometry', 1.07),
    // Light occlusion across the circular drive: the island's planter ring and
    // the carport's east piers throw the long shadows, and the U3 balcony above
    // them is the map's second-most-cited vantage.
    camera('test2-garden-occlusion', [24, 2.4, 22], [-12, 1.4, 20], 'light-occlusion', 1.07),
    // Into-sun: the missing half of the pair above, on the key's own bearing
    // (-0.853, +0.522) exactly - (20, 15) to (-5.6, 30.7) normalises to
    // (-0.853, +0.523). It crosses the backlit drive verge at 4 m, the island
    // planters at 12 m, and ends on the south rim where the hillside falls
    // away, so the rim light, the shadows running toward the viewer, the cloud
    // deck's lit tops and the aureole share one frame.
    camera('test2-into-sun-terrace', [20, 1.9, 15], [-5.6, 3.6, 30.7], 'light-occlusion', 1.07),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'test2',
    evidence: 'ArenaMap test2 collider, spawn and shot-surface identity from buildTest2',
    presentationMayMutateAuthority: false,
  },
  exceptions: ['pool water sheet is presentation-only; the basin slab beneath it is the movement/shot authority'],
}, buildTest2);
