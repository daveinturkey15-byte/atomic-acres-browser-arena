/**
 * particle-catalog.ts — HF-371: what every arena is made of, as data.
 *
 * WHY A CATALOG AND NOT CONSTANTS AT THE CALL SITES
 * The repository contract is explicit that a canonical catalog must PROJECT
 * into everything downstream rather than being shadowed by a second
 * hand-maintained list. Two things follow from that here:
 *
 *   - Every arena in `ARENA_IDS` must have an ambient particle profile, and
 *     `auditArenaParticleCoverage` fails if one is added without one. A new
 *     arena cannot ship silently airless.
 *   - Surface impact dust is PROJECTED FROM `SURFACE_IMPACT_PROFILES`, the same
 *     table that already colours the spark ejecta and the decal in
 *     `impact-presentation.ts`. There is no per-surface dust colour authored in
 *     this file, so the dust cloud and the sparks it hangs over cannot drift
 *     apart, and adding a ballistic material gets dust for free.
 *
 * DIVISION OF LABOUR WITH WHAT ALREADY EXISTS
 * `impact-presentation.ts` owns the instant spark burst and the persistent
 * decal. `atmosphere-system.ts` owns the static per-arena mist and smoke cards.
 * `rain-presentation.ts` owns precipitation. None of them own moving,
 * event-driven dust, and that absence is what the owner is describing. This
 * catalog covers exactly that gap: suspended motes, wind-carried drift, soft
 * puffs (footfall, muzzle, impact) and heavy grit.
 *
 * FOUR FAMILIES, FOUR INSTANCED DRAWS, FOREVER
 * The family list is closed and deliberately short, because the family list IS
 * the draw-call count: one `InstancedMesh` per family, three additive and one
 * alpha-tested, on every arena, at every quality, whatever is happening in the
 * match. A fifth family would be a fifth draw call, which is a decision, not a
 * detail.
 *
 * This file is pure data and pure functions. No THREE, no state, no randomness.
 */

import { ARENA_IDS, type ArenaId } from '../arena-identity';
import type { BallisticMaterialId } from '../ballistics';
import type { ImpactSurface } from '../combat-feedback';
import { SURFACE_IMPACT_PROFILES, surfaceImpactProfile } from '../surface-impact-registry';
import { PARTICLE_READABILITY, auditFamilyOpacityCeilings, type OpacityCeilingAudit } from './combat-readability';

export type ParticleQualityTier = 'low' | 'high' | 'ultra';

export const PARTICLE_QUALITY_TIERS: readonly ParticleQualityTier[] = Object.freeze([
  'low', 'high', 'ultra',
]);

/** The closed family list. Its length is the instanced draw count. */
export const PARTICLE_FAMILY_IDS = Object.freeze([
  'motes', 'drift', 'puff', 'grit',
] as const);

export type ParticleFamilyId = typeof PARTICLE_FAMILY_IDS[number];

/** Instanced draws this system submits. Constant by construction. */
export const PARTICLE_INSTANCED_DRAWS = PARTICLE_FAMILY_IDS.length;

export type ParticleSprite = 'dot' | 'flake' | 'smoke' | 'chip';

export type ParticleFamilySpec = Readonly<{
  id: ParticleFamilyId;
  sprite: ParticleSprite;
  /** Instance ceiling per quality tier. Buffers allocate at the max of these. */
  capacity: Readonly<Record<ParticleQualityTier, number>>;
  /**
   * `additive` fades per instance by premultiplying the instance colour, which
   * is the only way to fade an instance without a custom shader — and this repo
   * ships no custom GLSL on the required WebGPU route. `alpha-test` families
   * have no per-instance alpha at all and obey the guards through scale.
   */
  blending: 'additive' | 'alpha-test';
  /** Peak opacity this family may request. Bounded by the readability contract. */
  maxOpacity: number;
  /** Big enough to hide a torso: gets the strict guards. */
  obscuring: boolean;
  /** Ambient families maintain a live population; event families are emitted. */
  ambient: boolean;
  renderOrder: number;
}>;

const family = (
  id: ParticleFamilyId,
  sprite: ParticleSprite,
  capacity: Readonly<Record<ParticleQualityTier, number>>,
  blending: 'additive' | 'alpha-test',
  maxOpacity: number,
  obscuring: boolean,
  ambient: boolean,
  renderOrder: number,
): ParticleFamilySpec => Object.freeze({
  id, sprite, capacity: Object.freeze({ ...capacity }), blending, maxOpacity, obscuring, ambient, renderOrder,
});

/**
 * The families.
 *
 * `motes` and `drift` ride a volume centred on the camera and wrap inside it,
 * so ambient life is always dense exactly where the player is and costs nothing
 * anywhere else — the same trick rain-presentation.ts uses, for the same
 * reason. `puff` and `grit` are world-anchored and event-driven.
 */
export const PARTICLE_FAMILIES: Readonly<Record<ParticleFamilyId, ParticleFamilySpec>> = Object.freeze({
  // Fine suspended dust: pollen, salt haze, interior motes in a light shaft.
  motes: family('motes', 'dot', { low: 220, high: 520, ultra: 900 }, 'additive', 0.11, false, true, 998),
  // Larger wind-carried matter: leaves, foam flecks, ash, lint.
  drift: family('drift', 'flake', { low: 60, high: 140, ultra: 240 }, 'additive', 0.16, false, true, 999),
  // Soft clouds: footfall and landing dust, muzzle smoke, impact dust.
  puff: family('puff', 'smoke', { low: 44, high: 96, ultra: 156 }, 'additive', 0.2, true, false, 996),
  // Heavy chips thrown off a surface, with gravity and spin. Alpha-tested.
  grit: family('grit', 'chip', { low: 64, high: 144, ultra: 240 }, 'alpha-test', 1, false, false, 2),
} as const);

/** Buffers are sized once at the ceiling so quality can change without a rebuild. */
export function familyCapacityCeiling(id: ParticleFamilyId): number {
  const spec = PARTICLE_FAMILIES[id];
  return Math.max(spec.capacity.low, spec.capacity.high, spec.capacity.ultra);
}

/** Total instances across all families at a tier. Reported in telemetry. */
export function totalCapacity(tier: ParticleQualityTier): number {
  return PARTICLE_FAMILY_IDS.reduce((sum, id) => sum + PARTICLE_FAMILIES[id].capacity[tier], 0);
}

/**
 * Family opacity ceilings are checked against the readability contract rather
 * than trusted. `grit` is alpha-tested and carries no per-instance opacity, so
 * it is excluded from the claim set: its guard is scale, not alpha.
 */
export function auditParticleOpacityCeilings(): OpacityCeilingAudit {
  return auditFamilyOpacityCeilings(
    PARTICLE_FAMILY_IDS
      .filter((id) => PARTICLE_FAMILIES[id].blending === 'additive')
      .map((id) => ({
        id,
        obscuring: PARTICLE_FAMILIES[id].obscuring,
        maxOpacity: PARTICLE_FAMILIES[id].maxOpacity,
      })),
  );
}

// ---------------------------------------------------------------------------
// Ambient arena composition
// ---------------------------------------------------------------------------

export type MoteProfile = Readonly<{
  /** Fraction of the tier capacity kept alive. */
  density: number;
  colorWarm: number;
  colorCool: number;
  radiusM: number;
  /** Mean vertical drift. Dust rises in warm air and settles in cold. */
  riseMps: number;
  /** Amplitude of the lateral wander that stops motes reading as a fixed field. */
  swirlMps: number;
  /** How much of the shared wind field a mote carries, 0..1. */
  windPull: number;
  opacity: number;
}>;

export type DriftKind = 'leaf' | 'foam' | 'lint' | 'ash' | 'seed';

export type DriftProfile = Readonly<{
  density: number;
  kind: DriftKind;
  colorWarm: number;
  colorCool: number;
  radiusM: number;
  /** Sink rate in still air. Foam rises, leaves fall. */
  fallMps: number;
  windPull: number;
  /** Lateral flutter, which is what makes a leaf read as a leaf. */
  flutterMps: number;
  spinRadiansPerSecond: number;
  opacity: number;
}>;

export type ArenaParticleProfile = Readonly<{
  arenaId: ArenaId;
  label: string;
  motes: MoteProfile;
  drift: DriftProfile;
  /**
   * How strongly motes brighten inside a registered light shaft. Zero for
   * arenas with no authored shafts; the effect costs nothing when no shaft is
   * registered because the loop is skipped entirely.
   */
  shaftResponse: number;
  /** Radius of the camera-riding volume ambient families wrap inside (m). */
  volumeRadiusM: number;
  volumeAboveM: number;
  volumeBelowM: number;
}>;

const arena = (
  arenaId: ArenaId,
  label: string,
  motes: MoteProfile,
  drift: DriftProfile,
  shaftResponse: number,
  volumeRadiusM: number,
  volumeAboveM: number,
  volumeBelowM: number,
): ArenaParticleProfile => Object.freeze({
  arenaId,
  label,
  motes: Object.freeze({ ...motes }),
  drift: Object.freeze({ ...drift }),
  shaftResponse,
  volumeRadiusM,
  volumeAboveM,
  volumeBelowM,
});

/**
 * Every arena, authored for what its air is actually made of. The labels are
 * the same style as `WIND_PROFILES` in `weather/wind-field.ts` on purpose: the
 * two tables describe the same air and are read side by side.
 */
export const ARENA_PARTICLE_PROFILES: Readonly<Record<ArenaId, ArenaParticleProfile>> = Object.freeze({
  // Suburban summer: pollen, lawn dust, a few burnt flakes off the reactor haze.
  // Pass 79 enrichment: denser ambient populations across every arena so the
  // air reads as air at a glance; capacities and readability ceilings unchanged.
  'atomic-acres': arena(
    'atomic-acres', 'suburban-pollen-and-ash',
    { density: 0.7, colorWarm: 0xf6e7c4, colorCool: 0xcfd6c2, radiusM: 0.016, riseMps: 0.05, swirlMps: 0.16, windPull: 0.55, opacity: 0.085 },
    { density: 0.5, kind: 'ash', colorWarm: 0xe0d2b4, colorCool: 0x9a9382, radiusM: 0.045, fallMps: 0.34, windPull: 0.8, flutterMps: 0.5, spinRadiansPerSecond: 1.5, opacity: 0.12 },
    0.55, 20, 12, 4,
  ),
  // Jet apron: fuel haze and grit funnelled between terminal and hangar.
  'skyline-terminal': arena(
    'skyline-terminal', 'apron-fuel-haze-and-grit',
    { density: 0.62, colorWarm: 0xdfe4ec, colorCool: 0xb8c4d4, radiusM: 0.014, riseMps: 0.09, swirlMps: 0.22, windPull: 0.72, opacity: 0.08 },
    { density: 0.42, kind: 'lint', colorWarm: 0xd7d9d2, colorCool: 0x8f948f, radiusM: 0.038, fallMps: 0.42, windPull: 0.92, flutterMps: 0.62, spinRadiansPerSecond: 2.2, opacity: 0.1 },
    0.4, 22, 14, 4,
  ),
  // North-sea rig: salt mist and rust flakes off the deck, hard one-way wind.
  'rustworks-1v1': arena(
    'rustworks-1v1', 'north-sea-salt-and-rust',
    { density: 0.58, colorWarm: 0xd9dee2, colorCool: 0xa8b6c0, radiusM: 0.018, riseMps: 0.12, swirlMps: 0.3, windPull: 0.85, opacity: 0.09 },
    { density: 0.55, kind: 'foam', colorWarm: 0xf0f4f6, colorCool: 0xbfae96, radiusM: 0.05, fallMps: -0.05, windPull: 0.95, flutterMps: 0.8, spinRadiansPerSecond: 1.1, opacity: 0.13 },
    0.3, 22, 13, 5,
  ),
  // Indoors. The classic shooting-range look: motes hanging in the strip lights.
  'gun-range': arena(
    'gun-range', 'indoor-motes-in-strip-light',
    { density: 1, colorWarm: 0xfff2d8, colorCool: 0xe6e2d4, radiusM: 0.012, riseMps: 0.035, swirlMps: 0.1, windPull: 0.25, opacity: 0.11 },
    { density: 0.2, kind: 'lint', colorWarm: 0xf2ece0, colorCool: 0xcac3b4, radiusM: 0.03, fallMps: 0.2, windPull: 0.3, flutterMps: 0.3, spinRadiansPerSecond: 1.8, opacity: 0.09 },
    0.9, 14, 7, 3,
  ),
  // Tropical: pollen and seed fluff in the shafts, leaves off the palms.
  farcrysis: arena(
    'farcrysis', 'jungle-pollen-and-leaf-fall',
    { density: 0.85, colorWarm: 0xfff0cc, colorCool: 0xd8e6bc, radiusM: 0.015, riseMps: 0.07, swirlMps: 0.2, windPull: 0.6, opacity: 0.1 },
    { density: 0.75, kind: 'leaf', colorWarm: 0xc7d97a, colorCool: 0x7d9a44, radiusM: 0.075, fallMps: 0.5, windPull: 0.88, flutterMps: 1.15, spinRadiansPerSecond: 2.6, opacity: 0.16 },
    1, 21, 14, 4,
  ),
  // Open water: salt haze and torn foam off the crests.
  'high-seas': arena(
    'high-seas', 'open-ocean-spray-and-salt',
    { density: 0.62, colorWarm: 0xe8f1f6, colorCool: 0xbcd2de, radiusM: 0.017, riseMps: 0.14, swirlMps: 0.34, windPull: 0.9, opacity: 0.095 },
    { density: 0.9, kind: 'foam', colorWarm: 0xffffff, colorCool: 0xcfe2ea, radiusM: 0.055, fallMps: -0.08, windPull: 0.97, flutterMps: 0.9, spinRadiansPerSecond: 1.3, opacity: 0.15 },
    0.35, 24, 12, 5,
  ),
  // Dry outdoor range: hard-sun dust off the berms, seed fluff and grit on the gusts.
  'test1': arena(
    'test1', 'range-dust-and-dry-grit',
    { density: 0.75, colorWarm: 0xf2e0b4, colorCool: 0xd4c8a8, radiusM: 0.016, riseMps: 0.06, swirlMps: 0.24, windPull: 0.75, opacity: 0.1 },
    { density: 0.45, kind: 'seed', colorWarm: 0xe8d8a8, colorCool: 0xb8a988, radiusM: 0.04, fallMps: 0.3, windPull: 0.85, flutterMps: 0.6, spinRadiansPerSecond: 1.6, opacity: 0.11 },
    0.5, 20, 12, 4,
  ),
  // Golden-hour estate: pollen glinting over the pool, soft garden dust.
  'test2': arena(
    'test2', 'garden-pollen-and-soft-dust',
    { density: 0.7, colorWarm: 0xffedc0, colorCool: 0xdcd8b8, radiusM: 0.015, riseMps: 0.05, swirlMps: 0.15, windPull: 0.5, opacity: 0.09 },
    { density: 0.5, kind: 'seed', colorWarm: 0xf6e6b8, colorCool: 0xc8c49c, radiusM: 0.045, fallMps: 0.24, windPull: 0.7, flutterMps: 0.55, spinRadiansPerSecond: 1.4, opacity: 0.12 },
    0.6, 21, 13, 4,
  ),
  // MAP3 (PREVIEW): stone dust off the paving and dry seed blowing in off the
  // scrub. Shaft response is the highest in the catalog because the volume bay
  // is built to make a shaft, and this is the layer that has to be in it.
  'map3': arena(
    'map3', 'stone-dust-and-scrub-seed',
    { density: 0.7, colorWarm: 0xe8e0cc, colorCool: 0xc4c6c0, radiusM: 0.015, riseMps: 0.05, swirlMps: 0.2, windPull: 0.7, opacity: 0.09 },
    { density: 0.4, kind: 'seed', colorWarm: 0xe0d6b0, colorCool: 0xb4b09c, radiusM: 0.042, fallMps: 0.28, windPull: 0.8, flutterMps: 0.58, spinRadiansPerSecond: 1.5, opacity: 0.1 },
    0.8, 22, 13, 4,
  ),
  // NUKETOWN2 (PREVIEW, HF-407): road grit off warm asphalt and dry lawn seed
  // out of the two back yards. Deliberately close to the shipped Nuke Town's
  // suburban air rather than a new idea - this lane is a LAYOUT rejig, and the
  // air being familiar is what lets the owner read the layout change on its own.
  'nuketown2': arena(
    'nuketown2', 'road-grit-and-dry-lawn-seed',
    { density: 0.72, colorWarm: 0xe6d8b8, colorCool: 0xc0bfb4, radiusM: 0.014, riseMps: 0.055, swirlMps: 0.22, windPull: 0.72, opacity: 0.09 },
    { density: 0.42, kind: 'seed', colorWarm: 0xdfd2a4, colorCool: 0xaeae94, radiusM: 0.04, fallMps: 0.29, windPull: 0.82, flutterMps: 0.56, spinRadiansPerSecond: 1.45, opacity: 0.1 },
    0.55, 21, 12, 4,
  ),
  // RAID2 (PREVIEW, HF-408): the same garden pollen family as test2, drifting a
  // little harder because this rebuild has 21.9% roofed ground against test2's
  // 36.7% and a 52 m open lane for the wind to run down.
  'raid2': arena(
    'raid2', 'terrace-pollen-and-pool-haze',
    { density: 0.7, colorWarm: 0xffeec6, colorCool: 0xd6dcd8, radiusM: 0.015, riseMps: 0.05, swirlMps: 0.17, windPull: 0.6, opacity: 0.09 },
    { density: 0.5, kind: 'seed', colorWarm: 0xf2e8c0, colorCool: 0xc0c4a8, radiusM: 0.044, fallMps: 0.25, windPull: 0.75, flutterMps: 0.56, spinRadiansPerSecond: 1.45, opacity: 0.11 },
    0.7, 24, 14, 4,
  ),
});

export function arenaParticleProfile(arenaId: ArenaId): ArenaParticleProfile {
  return ARENA_PARTICLE_PROFILES[arenaId];
}

export type ArenaParticleCoverage = Readonly<{
  missing: readonly string[];
  extra: readonly string[];
  invalid: readonly string[];
  pass: boolean;
}>;

/**
 * Coverage gate, shaped like `auditSurfaceImpactCoverage`. Adding an arena id
 * without an air profile is a build failure, not a silently airless map.
 */
export function auditArenaParticleCoverage(
  arenaIds: readonly string[] = ARENA_IDS,
  registry: Readonly<Record<string, ArenaParticleProfile>> = ARENA_PARTICLE_PROFILES,
): ArenaParticleCoverage {
  const expected = new Set(arenaIds);
  const actual = new Set(Object.keys(registry));
  const missing = [...expected].filter((id) => !actual.has(id)).sort();
  const extra = [...actual].filter((id) => !expected.has(id)).sort();
  const invalid = [...expected].filter((id) => {
    const entry = registry[id];
    if (!entry) return true;
    return entry.arenaId !== id
      || entry.label.trim().length === 0
      || !(entry.motes.density > 0)
      || !(entry.motes.opacity > 0) || entry.motes.opacity > PARTICLE_FAMILIES.motes.maxOpacity
      || !(entry.drift.density > 0)
      || !(entry.drift.opacity > 0) || entry.drift.opacity > PARTICLE_FAMILIES.drift.maxOpacity
      || !(entry.volumeRadiusM > 0)
      || !(entry.volumeAboveM > 0)
      || !(entry.volumeBelowM > 0)
      || entry.shaftResponse < 0;
  }).sort();
  return Object.freeze({
    missing: Object.freeze(missing),
    extra: Object.freeze(extra),
    invalid: Object.freeze(invalid),
    pass: missing.length === 0 && extra.length === 0 && invalid.length === 0,
  });
}

// ---------------------------------------------------------------------------
// Event recipes
// ---------------------------------------------------------------------------

export type PuffRecipe = Readonly<{
  count: number;
  radiusStartM: number;
  radiusEndM: number;
  lifeSeconds: number;
  /** Fraction of `lifeSeconds` the per-particle life may vary by. */
  lifeJitter: number;
  /** Initial ejection speed along the emit direction. */
  speedMps: number;
  /** Half-angle of the ejection cone. Pi/2 is a hemisphere. */
  spreadRadians: number;
  /** Buoyancy. Positive rises; dust kicked off hot tarmac genuinely does. */
  riseMps2: number;
  /** Velocity relaxation rate toward the wind, per second. */
  dragPerSecond: number;
  windPull: number;
  /** Requested peak opacity. Still capped by the readability contract. */
  opacity: number;
  colorWarm: number;
  colorCool: number;
}>;

export type GritRecipe = Readonly<{
  count: number;
  radiusM: number;
  lifeSeconds: number;
  lifeJitter: number;
  speedMps: number;
  spreadRadians: number;
  gravityMps2: number;
  dragPerSecond: number;
  spinRadiansPerSecond: number;
  colorWarm: number;
  colorCool: number;
}>;

const puff = (
  count: number, radiusStartM: number, radiusEndM: number, lifeSeconds: number, lifeJitter: number,
  speedMps: number, spreadRadians: number, riseMps2: number, dragPerSecond: number, windPull: number,
  opacity: number, colorWarm: number, colorCool: number,
): PuffRecipe => Object.freeze({
  count, radiusStartM, radiusEndM, lifeSeconds, lifeJitter, speedMps, spreadRadians,
  riseMps2, dragPerSecond, windPull, opacity, colorWarm, colorCool,
});

export type FootfallKind = 'step' | 'sprint' | 'land';

export const FOOTFALL_KINDS: readonly FootfallKind[] = Object.freeze(['step', 'sprint', 'land']);

/**
 * Footfall dust. Ankle height, low, wide and short-lived — this is the effect
 * that makes ground feel like ground, and it is also the one most likely to
 * end up in your own face, so its opacity is the lowest of the three and the
 * near-lens cull does the rest.
 *
 * A walked step emits nothing at all: dust on every footfall at walking pace is
 * a permanent smoke screen following the player around, which is precisely the
 * combat problem this feature must not create. `step` is for the moment you
 * change direction hard.
 */
export const FOOTFALL_PUFFS: Readonly<Record<FootfallKind, PuffRecipe>> = Object.freeze({
  step: puff(2, 0.1, 0.42, 0.55, 0.35, 0.5, 1.15, 0.12, 3.4, 0.7, 0.05, 0xd9cbb2, 0x9c927f),
  sprint: puff(3, 0.12, 0.62, 0.75, 0.35, 0.9, 1.25, 0.16, 3, 0.75, 0.07, 0xdccdb2, 0x9c927f),
  land: puff(6, 0.14, 1.05, 1.05, 0.3, 1.7, 1.4, 0.2, 2.6, 0.7, 0.1, 0xe2d3b8, 0xa1957f),
});

/** Grit thrown up by a hard landing. Nothing for a step; a landing kicks stones. */
export const LANDING_GRIT: GritRecipe = Object.freeze({
  count: 7,
  radiusM: 0.022,
  lifeSeconds: 0.85,
  lifeJitter: 0.4,
  speedMps: 2.6,
  spreadRadians: 1.15,
  gravityMps2: -9.4,
  dragPerSecond: 0.9,
  spinRadiansPerSecond: 7,
  colorWarm: 0xc9b795,
  colorCool: 0x7c705c,
});

/**
 * Muzzle smoke.
 *
 * The interesting constraint: a muzzle is, by definition, pointing where the
 * player is looking, and the protected centre cone has no exceptions. Smoke
 * emitted ON the barrel axis would therefore be deleted the instant it left the
 * near-lens cull — a real effect, invisible in practice.
 *
 * So it is emitted muzzle-ADJACENT: the runtime offsets the origin up and to
 * the side of the barrel and gives it a strong rise, so the smoke curls off the
 * weapon and up out of the sight line. That is both what the guard permits and
 * what powder smoke actually does. It is long-lived by particle standards
 * (`lingers` was the requirement) but very low opacity, and it is the family
 * most likely to be thinned by the aggregate load budget during sustained fire,
 * which is exactly when you least want smoke in front of you.
 */
export const MUZZLE_SMOKE: PuffRecipe = puff(
  3, 0.055, 0.5, 1.6, 0.4, 0.85, 0.55, 0.42, 2.2, 0.85, 0.06, 0xe8e2d4, 0xa8a49a,
);

/** Density multiplier for muzzle smoke as the barrel heats over a burst. */
export const MUZZLE_HEAT_RESPONSE = Object.freeze({
  /** Opacity multiplier at a cold barrel. */
  coldScale: 0.55,
  /** Opacity multiplier at a fully heated barrel. */
  hotScale: 1,
  /** Seconds of sustained fire to reach the hot end. */
  heatSeconds: 1.8,
  /** Seconds to cool back to the cold end once fire stops. */
  coolSeconds: 3.2,
} as const);

/**
 * Aliases from the coarse `ImpactSurface` union to a canonical ballistic
 * material. This MIRRORS the private resolver in `impact-presentation.ts`; the
 * pairing is not asserted by prose but by `particle-catalog.test.ts`, which
 * checks each alias resolves to a material whose own `impactSurface` field is
 * the alias. A material retagged in the registry therefore fails the test
 * rather than silently colouring the dust differently from the sparks.
 */
const IMPACT_SURFACE_ALIASES: Readonly<Record<ImpactSurface, BallisticMaterialId>> = Object.freeze({
  metal: 'structural-metal',
  concrete: 'concrete',
  wood: 'wood',
  soil: 'earth',
  glass: 'glass',
});

export type ImpactParticleSurface = ImpactSurface | BallisticMaterialId;

/** Resolves either spelling of a surface to its canonical ballistic material. */
export function resolveImpactMaterial(surface: ImpactParticleSurface): BallisticMaterialId {
  if (surface in SURFACE_IMPACT_PROFILES) return surface as BallisticMaterialId;
  const alias = IMPACT_SURFACE_ALIASES[surface as ImpactSurface];
  return alias ?? 'concrete';
}

/**
 * How much dust a material throws when a round hits it, relative to its
 * authored spark count. Glass and metal make sparks and shards, not dust;
 * earth, brick and concrete make almost nothing else. This is a per-SURFACE
 * KIND response, not a per-material list — it is keyed on the registry's own
 * `impactSurface` field, so a new material inherits the response of its kind.
 */
export const IMPACT_DUST_RESPONSE: Readonly<Record<ImpactSurface, Readonly<{ dust: number; grit: number; radius: number; life: number }>>> = Object.freeze({
  soil: Object.freeze({ dust: 0.9, grit: 0.8, radius: 1.15, life: 1.15 }),
  concrete: Object.freeze({ dust: 0.75, grit: 0.7, radius: 1, life: 1 }),
  wood: Object.freeze({ dust: 0.4, grit: 0.9, radius: 0.8, life: 0.85 }),
  metal: Object.freeze({ dust: 0.15, grit: 0.35, radius: 0.6, life: 0.6 }),
  glass: Object.freeze({ dust: 0.1, grit: 1, radius: 0.55, life: 0.5 }),
});

/**
 * The surface impact dust cloud, PROJECTED from the canonical registry: colours
 * and base count are the registry's, scaled by the response of that surface
 * kind. No dust colour is authored in this file for any material.
 */
export function surfaceImpactPuff(surface: ImpactParticleSurface): PuffRecipe {
  const material = resolveImpactMaterial(surface);
  const profile = surfaceImpactProfile(material);
  const response = IMPACT_DUST_RESPONSE[profile.impactSurface];
  const [warm, cool] = profile.particleColors;
  return puff(
    Math.max(0, Math.round(profile.particleCount * response.dust)),
    0.06,
    0.34 * response.radius,
    0.7 * response.life,
    0.35,
    1.1,
    1.35,
    0.1,
    3.2,
    0.6,
    0.07,
    warm,
    cool,
  );
}

/** The heavy half of the same event: chips that fall and settle. */
export function surfaceImpactGrit(surface: ImpactParticleSurface): GritRecipe {
  const material = resolveImpactMaterial(surface);
  const profile = surfaceImpactProfile(material);
  const response = IMPACT_DUST_RESPONSE[profile.impactSurface];
  const [warm, cool] = profile.particleColors;
  return Object.freeze({
    count: Math.max(0, Math.round(profile.particleCount * response.grit)),
    radiusM: 0.016,
    lifeSeconds: 0.7 * response.life,
    lifeJitter: 0.45,
    speedMps: 3.4,
    spreadRadians: 1.05,
    gravityMps2: -9.4,
    dragPerSecond: 0.75,
    spinRadiansPerSecond: 9,
    colorWarm: warm,
    colorCool: cool,
  });
}

export type ImpactProjectionAudit = Readonly<{
  offenders: readonly string[];
  pass: boolean;
}>;

/**
 * Mutation gate: every ballistic material must project to a usable dust and
 * grit recipe. A material added to `ballistics.ts` without an impact profile
 * already fails `auditSurfaceImpactCoverage`; this one additionally fails if
 * the projection produces nothing visible at all.
 */
export function auditImpactProjection(
  materialIds: readonly BallisticMaterialId[] = Object.keys(SURFACE_IMPACT_PROFILES) as BallisticMaterialId[],
): ImpactProjectionAudit {
  const offenders = materialIds.filter((id) => {
    const dust = surfaceImpactPuff(id);
    const grit = surfaceImpactGrit(id);
    const emitsSomething = dust.count > 0 || grit.count > 0;
    return !emitsSomething
      || !(dust.radiusEndM > dust.radiusStartM)
      || !(dust.lifeSeconds > 0)
      || dust.opacity > PARTICLE_READABILITY.obscuringMaxOpacity
      || !(grit.lifeSeconds > 0);
  }).sort();
  return Object.freeze({ offenders: Object.freeze(offenders), pass: offenders.length === 0 });
}
