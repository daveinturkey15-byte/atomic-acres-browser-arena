import { buildNewworldPrime } from '../../newworld-prime-arena';
import { createProceduralArenaVisualDefinition } from '../arena-visual-definition';
import { NEWWORLD_PRIME_EXPOSURE_LATE_MORNING } from '../../newworld-prime-lighting';
import { budgets, camera, colorPipeline, SHARED_GAMEPLAY_ASSETS } from './shared';

/**
 * newworld-prime visual definition (Shell-owned registry wiring, Day-1 standby).
 * Lighting, fog and atmosphere values are sourced from the LightingAtmos-owned
 * NEWWORLD_PRIME_LATE_MORNING_LIGHTING base in src/newworld-prime-lighting.ts;
 * geometry authority stays with the LayoutBlockout assembler via
 * buildNewworldPrime. Presentation may never mutate gameplay authority.
 */
export const definition = createProceduralArenaVisualDefinition({
  id: 'newworld-prime',
  displayLabel: 'New World Prime',
  moduleId: 'arena.visual.newworld-prime.v1',
  assetDependencies: [],
  sharedAssetDependencies: SHARED_GAMEPLAY_ASSETS,
  lighting: {
    // Day-3 graphics: key 3.2 -> 2.8 tames the pale-siding/roof clip seen in
    // graphics-before (west house reads white); ambient 0.42 -> 0.55 lifts
    // shadow-side dark identities (wall-bay posts, poles) via the one
    // indirect term this definition owns. Hues untouched.
    sunColor: 0xfff1ce, sunIntensity: 2.8, ambientColor: 0x8fb0bf, ambientIntensity: 0.55,
    practicals: [
      { id: 'newworld-prime-street-fixtures', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'newworld-prime-interior-fixtures', policy: 'emissive-only', maximumDistance: 0, castsShadow: false },
      { id: 'newworld-prime-exterior-contrast-keys', policy: 'shadowed-local', maximumDistance: 32, castsShadow: true },
    ],
  },
  fog: { color: 0xb1c0be, near: 58, far: 148 },
  shadows: { enabled: true, mapSize: 2048, maximumDistance: 184, normalBias: 0.035 },
  atmosphere: { preset: 'newworld-prime-late-morning', mist: 0.24, dust: 0.22, clouds: true },
  colorPipeline: colorPipeline('pass64.newworld-prime.hdr.v1', NEWWORLD_PRIME_EXPOSURE_LATE_MORNING),
  budgets: budgets({ maximumDrawCalls: 590, maximumTriangles: 1_500_000 }),
  reviewCameras: [
    camera('newworld-prime-overview', [44, 30, 44], [0, 3, -8], 'overview', NEWWORLD_PRIME_EXPOSURE_LATE_MORNING),
    camera('newworld-prime-yard-geometry', [0, 5, 26], [0, 2.5, -6], 'geometry', NEWWORLD_PRIME_EXPOSURE_LATE_MORNING),
    camera('newworld-prime-depot-wall-closed', [-19, 1.9, 12], [-27, 1.9, 10], 'light-occlusion', NEWWORLD_PRIME_EXPOSURE_LATE_MORNING),
    camera('newworld-prime-depot-door-open', [0, 5, 2], [0, 3.5, 14], 'portal', NEWWORLD_PRIME_EXPOSURE_LATE_MORNING),
    camera('newworld-prime-topdown', [0, 78, -8], [0, 0, -8], 'overview', NEWWORLD_PRIME_EXPOSURE_LATE_MORNING),
  ],
  collisionIdentity: { authoritativeArenaId: 'newworld-prime', evidence: 'ArenaMap newworld-prime collider, portal and shot-surface identity', presentationMayMutateAuthority: false },
  exceptions: ['bus glazing, depot doors and yard markings may remain presentation-only when authoritative hull surfaces remain unchanged'],
}, buildNewworldPrime);
