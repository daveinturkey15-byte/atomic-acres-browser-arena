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
 * 4. SHADOW BIAS DERIVED. graphics-refinement.ts fits Test2 an 80x64 m shadow
 *    volume, so 2048 gives 39 mm per texel. Upstream's normal-offset bias is
 *    texelWorld * (0.55 + 1.1 * (1 - NdL)); the ground here sees NdL =
 *    sin(18.4 deg) = 0.315, giving 1.30 * 0.039 = 0.051. The authored 0.03 was
 *    0.77 of one texel at the grazing angle this arena is built around, which
 *    is where acne appears on long travertine runs. 2048 is kept.
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
  // near 58 was well inside the map. TEST2_BOUNDS is 76 x 58 m, a 95.6 m
  // diagonal, so a corner-to-corner sightline spent its last 40% inside the fog
  // band and every long lane graded toward one amber - which is most of why
  // this arena's rendered chroma collapsed into a single hue bin (55-72% of the
  // frame's chroma weight, against 37-44% for Atomic Acres and Farcrysis).
  // near 98 puts the whole playfield in front of the haze; the ridge and the
  // hillside behind it still recede.
  fog: { color: 0xe6cbab, near: 98, far: 186 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.051 },
  atmosphere: { preset: 'estate-golden-hour', mist: 0.1, dust: 0.08, clouds: true },
  colorPipeline: colorPipeline('pass81.test2.hdr.v1', 1.07),
  budgets: budgets({ maximumDrawCalls: 420, maximumTriangles: 700_000 }),
  reviewCameras: [
    camera('test2-estate-overview', [26, 18, 30], [0, 2, 0], 'overview', 1.07),
    // Down-sun: bears (+1, 0) against a key bearing of (-0.853, +0.522), so
    // this is the front-lit probe - warm key on travertine and pool coping.
    camera('test2-pool-lane', [-26, 2, -14], [0, 1.2, -14], 'geometry', 1.07),
    camera('test2-garden-occlusion', [14, 2.4, 18], [-10, 1.4, 12], 'light-occlusion', 1.07),
    // Into-sun: the missing half of the pair above, on the key's own bearing
    // (-0.853, +0.522) from open terrace east of the x=13 balustrade (which
    // ends at x=17) and west of the motor-court car (x >= 21.55). Crosses that
    // balustrade at 5.9 m - a backlit 1.2 m stone edge under a 1.9 m eye - and
    // ends on the centre garden hedge, so the rim, the shadow running toward
    // the viewer, the cloud deck's lit tops and the aureole share one frame.
    camera('test2-into-sun-terrace', [18.5, 1.9, 6.4], [-3.7, 3.6, 20], 'light-occlusion', 1.07),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'test2',
    evidence: 'ArenaMap test2 collider, spawn and shot-surface identity from buildTest2',
    presentationMayMutateAuthority: false,
  },
  exceptions: ['pool water sheet is presentation-only; the basin slab beneath it is the movement/shot authority'],
}, buildTest2);
