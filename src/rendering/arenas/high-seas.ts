import { buildHighSeas, HIGH_SEAS_LEVELS } from '../../high-seas';
import { createProceduralArenaVisualDefinition, type ArenaInteriorVolumeDefinition, type ArenaPracticalDefinition } from '../arena-visual-definition';
import { TERMINAL_GENERATED_SKY_ASSET_URL } from '../sky-backdrop';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * The sealed service deck, as a declared volume.
 *
 * Its ceiling is deliberately BELOW the main-deck plane: every below-deck light
 * has to declare this volume, the definition validator refuses a light whose
 * position or target escapes it, and the arena test asserts `maximum[1]` stays
 * under `HIGH_SEAS_LEVELS.mainDeck`. That chain is what makes "below-deck light
 * cannot reach the deck players fight on" a checked property rather than a
 * comment.
 */
export const HIGH_SEAS_SERVICE_DECK_VOLUME: ArenaInteriorVolumeDefinition = Object.freeze({
  id: 'high-seas-service-deck',
  minimum: [-2.6, -0.2, -20.4] as const,
  maximum: [2.6, 3.0, 20.4] as const,
});

/** Ceiling height of the service-deck fixtures; the liner itself sits at 2.895. */
const FIXTURE_Y = 2.62;
/** Every fixture aims straight down, so its cone can only ever illuminate below itself. */
const FLOOR_Y = 0.05;

/**
 * WHY THESE ARE REAL LIGHTS NOW (HF-373 follow-up).
 *
 * The service deck used to be emissive-only: bright strips, and nothing they
 * touched. Measured on hardware WebGPU at eye height in the corridor, the
 * gameplay window read mean 46/255 with 85% of pixels below 12/255 - glowing
 * bars floating in a black void, with the floor at 6/255. The owner's report
 * ("too dark down at the bottom") was exactly right, and no emissive tuning
 * fixes it: emissive geometry lights nothing but itself.
 *
 * These are authored through the definition's canonical practical path, which
 * is the repo's sanctioned way to own a runtime light: ArenaContrastLighting
 * builds each one with makeShadowedLocal, so every fixture casts a shadow and
 * therefore cannot spill through a bulkhead - the exact property the
 * emissive-only policy existed to protect. Containment is doubly held:
 *  - each cone points straight down (target directly beneath the position),
 *    so the lit half-space is strictly below the fixture, and
 *  - the fixture sits inside HIGH_SEAS_SERVICE_DECK_VOLUME, whose ceiling is
 *    below the main deck.
 *
 * Eight fixtures, spaced so their floor pools overlap along the whole 40 m run:
 * two in the engine-room bulge, four down the corridor legs, one at each ramp
 * vestibule. Shadow maps are small on purpose (256 in the corridor, 512 in the
 * room where players actually fight around the machinery) - a service corridor
 * wants soft contact shading, not crisp shadows, and it keeps the whole rig at
 * 1.3 Mpx against a 25 Mpx budget.
 */
function serviceDeckPractical(
  id: string,
  x: number,
  z: number,
  intensity: number,
  shadowMapSize: number,
): ArenaPracticalDefinition {
  return {
    id,
    policy: 'shadowed-local',
    maximumDistance: 20,
    castsShadow: true,
    light: {
      kind: 'spot',
      position: [x, FIXTURE_Y, z],
      // Straight down. Not a stylistic choice - it is the containment proof.
      target: [x, FLOOR_Y, z],
      color: 0xffc9a0,
      intensity,
      distance: 18,
      // Wide, because the volume is wide relative to its height and a narrow
      // cone left the walls unlit. Measured against a shadow-off control at the
      // same angle: identical to within 0.1/255, so the width is not costing
      // shadow quality here.
      angle: 1.3,
      // Low, deliberately. three.js spot attenuation smoothsteps from
      // cos(angle) to cos(angle * (1 - penumbra)), so a high penumbra on a wide
      // cone leaves a full-brightness core of almost nothing and puts the
      // bulkhead right beside the fixture at half attenuation. Measured across
      // 0.85/0.55/0.35/0.20, the engine-room bulkhead went 53.6 -> 74.5 mean
      // and 74% -> 57% crushed purely by dropping this number.
      penumbra: 0.2,
      // Not the physical 2. At inverse-square, a fixture lit its own floor pool
      // and left the run between fixtures at median 0/255 - measured. 1.2 keeps
      // a clear near-to-far gradient while carrying enough down the corridor to
      // separate a body from the bulkhead behind it.
      decay: 1.2,
      shadowMapSize,
      intendedVolume: HIGH_SEAS_SERVICE_DECK_VOLUME,
    },
  };
}

export const HIGH_SEAS_SERVICE_DECK_PRACTICALS: readonly ArenaPracticalDefinition[] = Object.freeze([
  // Engine room: the two fixtures sit OUT over the machinery rather than on the
  // centre line. Measured, a centre-line pair left the room's own bulkheads at
  // median 0/255 with 91% crushed while the 1.44 m corridor 10 m away read 53 -
  // pure inverse-square, the room walls being 2.35 m off axis against the
  // corridor's 0.72 m. Moving the fixtures to the walls is what lights a room
  // three times wider than the corridor.
  // Offset in z as well as x, and placed as a 180-degree rotation of each
  // other rather than a mirror pair: that is the symmetry the bow/stern spawns
  // already use, so neither team's approach into the room is the lit one. A
  // co-located pair at z=0 left a 9.5 m unlit gap between the room and the
  // first corridor fixture, which is exactly the stretch that measured median
  // 0/255 in the frame.
  // Pass 79 luminance re-measurement: with placement already correct, the
  // room still read median 30/255 in its fight window and the deck plate
  // median 12/255, so intensities stepped up from 40/34 to 52/42 (vestibules
  // stay 26 - their silhouette read is authored); that pass measured room
  // fight-window crushed 28-33% -> 2.5-5.4% and floor median 12 -> 29/255.
  // Pass 79 gauntlet round 3, hardware WebGPU against the production bundle:
  // the room's fixture pools are bright (mean 92-130/255) but the shadowed
  // pockets behind the machinery still put 20-33% of the room crop under the
  // readable floor, so the pair steps up again 52 -> 68. Placement, cone,
  // penumbra and decay are untouched - intensity is the one lever that pushes
  // inverse-square light deeper behind the housings without moving the
  // containment proof.
  serviceDeckPractical('high-seas-service-deck-room-port', -1.55, -3.4, 68, 512),
  serviceDeckPractical('high-seas-service-deck-room-starboard', 1.55, 3.4, 68, 512),
  // Corridor legs: centre line is right here - the bulkheads are close enough
  // on both sides that one fixture washes them both.
  serviceDeckPractical('high-seas-service-deck-bow-corridor-inner', 0, -9.5, 42, 256),
  serviceDeckPractical('high-seas-service-deck-bow-corridor-outer', 0, -15.5, 42, 256),
  serviceDeckPractical('high-seas-service-deck-stern-corridor-inner', 0, 9.5, 42, 256),
  serviceDeckPractical('high-seas-service-deck-stern-corridor-outer', 0, 15.5, 42, 256),
  // Ramp vestibules. Dimmer on purpose: daylight already falls down the open
  // hatch here, and a player coming down the ramp should read as a silhouette
  // against the brighter mouth rather than being flatly lit from above.
  serviceDeckPractical('high-seas-service-deck-bow-vestibule', 0, -19.3, 26, 256),
  serviceDeckPractical('high-seas-service-deck-stern-vestibule', 0, 19.3, 26, 256),
]);

export const definition = createProceduralArenaVisualDefinition({
  id: 'high-seas',
  displayLabel: 'High Seas',
  moduleId: 'arena.visual.high-seas.v1',
  assetDependencies: [TERMINAL_GENERATED_SKY_ASSET_URL],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    sunColor: 0xffe3bb, sunIntensity: 3, ambientColor: 0x9fc7cf, ambientIntensity: 0.4,
    practicals: [
      // Above deck stays emissive-only: it is lit by the sun and needs no rig.
      { id: 'high-seas-deck-practicals', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      // The two former cabin/upper "keys" were shadowed-local placeholders that
      // carried no light spec, so ArenaContrastLighting built nothing from them
      // and they produced zero pixels. They are replaced rather than kept: the
      // definition may not mix canonical and legacy shadowed practicals, and
      // an inert declaration is worse than none.
      ...HIGH_SEAS_SERVICE_DECK_PRACTICALS,
    ],
  },
  fog: { color: 0xb8d6dc, near: 42, far: 132 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 150, normalBias: 0.03 },
  atmosphere: { preset: 'open-ocean-day', mist: 0.16, dust: 0.04, clouds: true },
  colorPipeline: colorPipeline('pass75.high-seas.hdr.v1', 1.06),
  budgets: budgets({
    maximumDrawCalls: 480,
    maximumTriangles: 950_000,
    // Raised from the shared default of 3 to seat the eight service-deck
    // fixtures, and no higher: this is a hard cap the runtime gate in
    // verify-pass64-webgpu.mjs checks activeLocalLights against, so it stays
    // exactly the number the arena authors.
    maximumShadowLights: 8,
  }),
  reviewCameras: [
    camera('high-seas-starboard-overview', [22, 18, 54], [0, 4.8, 0], 'overview', 1.06),
    camera('high-seas-stern-main-deck', [-8, 5.2, 34], [0, 4.9, 12], 'geometry', 1.06),
    camera('high-seas-upper-deck-occlusion', [8, 7.8, 5], [0, 6.6, -16], 'light-occlusion', 1.06),
    camera('high-seas-bow-lane', [-8, 4.9, -34], [0, 4.9, -12], 'portal', 1.06),
  ],
  collisionIdentity: {
    authoritativeArenaId: 'high-seas',
    evidence: 'ArenaMap high-seas collider, elevated-deck navigation and shot-surface identity',
    presentationMayMutateAuthority: false,
  },
  exceptions: ['surrounding ocean remains presentation/float-zone authority and never becomes a shot or movement collider'],
}, buildHighSeas);

/** Guard rail for the containment claim above, asserted by the arena test. */
export const HIGH_SEAS_SERVICE_DECK_CEILING_BELOW_MAIN_DECK =
  HIGH_SEAS_SERVICE_DECK_VOLUME.maximum[1] < HIGH_SEAS_LEVELS.mainDeck;
