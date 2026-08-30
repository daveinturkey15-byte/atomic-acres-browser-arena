import { buildTest1 } from '../../test-maps';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * Test1 (owner 2026-08-30, docs/TEST1_MAP_BRIEF.md): sun-bleached range
 * training ground. Hard mid-morning sun, dry dust, no interior volumes - every
 * structure is open-air, so the rig stays sun + ambient with emissive-only
 * practicals (the D3D12 pipeline-budget posture all outdoor arenas share; see
 * followUps for why a real punctual light is still not justified here).
 *
 * Lighting rig v2 (owner "we need to use some of your better techniques ... and
 * lighting", against docs/UPSTREAM_TECHNIQUE_EXTRACTION_2026-08-30.md
 * "Lighting, sky and atmosphere"). Four changes, in payoff order:
 *
 * 1. THE SKY IS NOW THE ARENA'S OWN. The 'range-midmorning' preset used to be
 *    overwritten at runtime by the terminal airport-dawn panorama, so nothing
 *    authored for this arena's time of day ever reached the frame - and since
 *    arena-environment-ibl.ts PMREMs scene.background, the ambient and IBL were
 *    another arena's sky as well. That substitution is gone (sky-backdrop.ts),
 *    which is what makes every number below mean anything.
 * 2. AMBIENT SPLIT INTO TWO BANDS. The extraction's headline finding is that a
 *    flat AmbientLight adds identical irradiance to a soffit, a north wall and
 *    the ground, which is the "lit by a constant" read. We cannot inject a
 *    normal-gated fill node from an arena definition, but the sky preset's
 *    lower hemisphere is now authored as lit hardpan and its upper hemisphere
 *    as real desert blue, so PMREM's own irradiance convolution performs the
 *    gating for free. The flat term is correspondingly pulled back from 0.42 to
 *    0.33 (-0.35 stops) and re-hued from near-grey 0xc9d4dd to a saturated sky
 *    blue, so what remains of it is a COOL fill against the warm key - the
 *    warm-light/blue-shadow separation that reads as crisp desert light.
 * 3. FOG STOPPED HAZING THE MAP. near 46 m on a 52x38 m arena hazed the far
 *    third of every sightline, on a brief that says "hard, clear sky". near is
 *    now 62 m - beyond the 64 m arena diagonal - so haze is aerial perspective
 *    on the backdrop only, and its colour is the new horizon dust band.
 * 4. SHADOW BIAS DERIVED, NOT EYEBALLED. graphics-refinement.ts fits this arena
 *    a 68x54 m shadow volume; at mapSize 2048 that is 33 mm per texel. Upstream
 *    expresses normal-offset bias as texelWorld * (0.55 + 1.1 * (1 - NdL)),
 *    which at a mid-morning NdL of ~0.6 gives 0.033 - so the authored 0.03 was
 *    slightly under one texel. 2048 is kept deliberately: upstream measured
 *    that 4 x 4096 R32F is a quarter of a gigabyte of shadow nobody can see.
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'test1',
  displayLabel: 'Test1',
  moduleId: 'arena.visual.test1.v1',
  // No panorama: the authored 'range-midmorning' procedural sky is this arena's
  // final backdrop and its IBL source (see skyBackdropAssetForPreset).
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    // Warm hard key. The direction is blender-lighting.ts' shared non-Atomic
    // sunPosition [-62, 25, 38] = 18.4 deg elevation, which is lower than the
    // brief's mid-morning; the beam keeps its 18-degree warmth (making it white
    // would put the key and the sky at odds) and the mid-morning read is
    // carried by the key:fill ratio and the bleached horizon instead.
    sunColor: 0xfff2d6, sunIntensity: 3.2,
    // Chroma pushed out from luminance so a shaded facade measures blue rather
    // than grey - the extraction's k=1.18 correction, applied to an authored
    // colour instead of a computed one.
    ambientColor: 0xa9c6e8, ambientIntensity: 0.33,
    practicals: [
      { id: 'test1-range-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
    ],
  },
  fog: { color: 0xdbd2bc, near: 62, far: 168 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 130, normalBias: 0.033 },
  atmosphere: { preset: 'range-midmorning', mist: 0.05, dust: 0.22, clouds: false },
  colorPipeline: colorPipeline('pass81.test1.hdr.v1', 1.05),
  budgets: budgets({ maximumDrawCalls: 380, maximumTriangles: 600_000 }),
  reviewCameras: [
    camera('test1-tower-overview', [20, 16, 26], [0, 2.4, 0], 'overview', 1.05),
    camera('test1-firing-line', [-24, 1.7, -14], [-14, 1.4, 8], 'geometry', 1.05),
    camera('test1-container-occlusion', [10, 2.2, -12], [18, 1.6, 4], 'light-occlusion', 1.05),
    // Into-sun probe. The three v1 cameras all look across or away from the key
    // (their bearings dot the sun bearing at 0.12 or less), so nothing reviewed
    // the sun disc, the aureole, backlit rims or the long shadows running
    // toward the viewer - exactly the half of the rig this pass changed. Bears
    // (-0.853, +0.522), the key's own XZ bearing, standing on open hardpan
    // between the north shed (x <= -0.5) and its east berm (x >= 7); the
    // sightline passes north of the tower and runs out over the west sandbag
    // line to the target posts.
    camera('test1-into-sun-hardpan', [4.5, 1.85, -13.5], [-17.7, 3.4, 0.1], 'light-occlusion', 1.05),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'test1',
    evidence: 'ArenaMap test1 collider, spawn and shot-surface identity from buildTest1',
    presentationMayMutateAuthority: false,
  },
  exceptions: [],
}, buildTest1);
