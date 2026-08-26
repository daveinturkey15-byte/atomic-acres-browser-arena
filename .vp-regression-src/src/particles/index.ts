/**
 * particles/index.ts — HF-371: the one call the runtime makes per frame.
 *
 *   particles.update(frameDt, camera, { wind: windNow, adsProgress });
 *
 * and every arena has air in it: dust hanging in the light, leaves crossing the
 * clearing on the wind, spray off the swell, motes in the range's strip lights,
 * dust kicked when you land, smoke curling off the barrel, a cloud of the right
 * colour where the round hit. Wiring that into the game is a construction, a
 * `build(scene)`, a `setArena(id)` and one line in `frame()`. That constraint is
 * the point of this file: everything else is behind it.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT COSTS, STATED RATHER THAN HOPED
 *
 * FOUR INSTANCED DRAWS. One per family, always. Not four per arena, not four
 * per emitter, not four plus one per burst — four, on every map, at every
 * quality, whether nothing is happening or six players are firing. The family
 * list in `particle-catalog.ts` is closed, and a fifth entry would be a fifth
 * draw call and therefore a decision someone has to take deliberately.
 *
 * ZERO PER-FRAME ALLOCATION. The frame context is built once in the
 * constructor and mutated in place. Every field's particle state is a
 * preallocated `Float32Array` sized at the family ceiling. The hot loop uses
 * only scratch objects owned by the field. `emitParticle` takes scalars rather
 * than an options object for exactly this reason. `telemetry()` DOES allocate —
 * it builds a frozen report — and it is deliberately not on the frame path; the
 * diagnostics collector calls it, the same way it calls `tracerPool.activeCount()`.
 *
 * INSTANCE CEILINGS. low 388 / high 900 / ultra 1536 across all four families.
 * Buffers are always allocated at the ultra ceiling so a live quality change
 * costs nothing and cannot reallocate mid-match.
 *
 * BOUNDED WORST CASE. The only unbounded-looking cost is the optional
 * enemy-sightline guard, and it is bounded twice: only the `puff` family
 * participates (fine dust cannot hide a torso, so paying for it there would be
 * waste), and at most `maxProtectedTargets` (8) sightlines are ever tested.
 * Worst case is 156 x 8 point-segment tests, which is fewer operations than the
 * rain streaks already do every frame.
 *
 * ---------------------------------------------------------------------------
 * COMBAT SAFETY
 *
 * Every guard is in `combat-readability.ts` and every particle of every family
 * goes through it inside `particle-field.ts`. There is no emitter-side bypass,
 * no per-call override and no "important effect" flag, because the first
 * exception is how this class of feature always ends up obscuring a target.
 * In summary: an angular cone about the view axis that widens under ADS, a hard
 * near-lens cull, an optional eye-to-enemy cylinder, per-family opacity
 * ceilings the catalog is audited against, and an aggregate screen-load budget
 * that thins everything obscuring when too much of it stacks up at once.
 *
 * The muzzle smoke is worth calling out because it is the case that looks like
 * it needs an exception and does not get one: it is emitted muzzle-ADJACENT,
 * offset up and outboard of the barrel with a strong rise, so it curls off the
 * weapon and out of the sight line instead of sitting on the crosshair. What
 * the guard permits and what powder smoke actually does are the same shape.
 */

import * as THREE from 'three';
import type { ArenaId } from '../arena-identity';
import { isSoftwareWebGLRenderer } from '../atomic-signal';
import type { RenderProfile } from '../render-profile';
import type { WindSample } from '../weather/wind-field';
import { activeAmbientLife, type AmbientLifeRuntime } from './ambient-life-settings';
import { activeLightShafts, type ParticleLightShaft } from './light-shaft-registry';
import { clamp01, screenLoadScale } from './combat-readability';
import {
  FOOTFALL_PUFFS,
  LANDING_GRIT,
  MUZZLE_HEAT_RESPONSE,
  MUZZLE_SMOKE,
  PARTICLE_FAMILIES,
  PARTICLE_FAMILY_IDS,
  PARTICLE_INSTANCED_DRAWS,
  arenaParticleProfile,
  surfaceImpactGrit,
  surfaceImpactPuff,
  totalCapacity,
  type FootfallKind,
  type GritRecipe,
  type ImpactParticleSurface,
  type ParticleFamilyId,
  type ParticleQualityTier,
  type PuffRecipe,
} from './particle-catalog';
import {
  ParticleField,
  PARTICLE_MAX_LIGHT_SHAFTS,
  PARTICLE_MAX_STEP_SECONDS,
  createAmbientTemplate,
  createParticleFrameContext,
  type AmbientTemplate,
  type ParticleFieldTelemetry,
  type ParticleFrameContext,
} from './particle-field';

export * from './ambient-life-settings';
export * from './light-shaft-registry';
export * from './combat-readability';
export * from './particle-catalog';
export {
  ParticleField,
  PARTICLE_MAX_LIGHT_SHAFTS,
  PARTICLE_MAX_STEP_SECONDS,
  type ParticleFieldTelemetry,
  type ParticleFrameContext,
} from './particle-field';

/** Shared empty list so clearing the shafts never allocates on the frame path. */
const EMPTY_LIGHT_SHAFTS: readonly ParticleLightShaft[] = Object.freeze([]);

export type ParticleRuntimeOptions = Readonly<{
  profile: RenderProfile;
  rendererLabel: string;
  /** `?particles=off` / `on`, read by the caller and passed through. */
  query?: string | null;
  quality?: ParticleQualityTier;
  seed?: number;
  arenaId?: ArenaId;
}>;

export type ParticleUpdateOptions = Readonly<{
  /** Shared wind field sample at the camera. Omitted means still air. */
  wind?: WindSample | null;
  adsProgress?: number;
  /** Global taste/accessibility scale, 0..1. */
  intensityScale?: number;
  /** Quality-budget density scale, 0..1, applied to ambient populations only. */
  densityScale?: number;
  /**
   * The player's AIRBORNE DETAIL row. Omitted on the production path, which
   * reads the published latch instead - see ambient-life-settings.ts. Tests
   * pass it explicitly so no suite depends on module state.
   */
  ambientLife?: AmbientLifeRuntime;
  /**
   * This frame's shared weather sample — only `rainRate` is read. It arrives
   * from `sampleWeather(arena, matchSeed, elapsed)`, which every peer computes
   * identically from `hostId:matchEpoch`, so coupling to it cannot desync
   * anyone; and like everything else in this module it is presentation-only.
   * Omitted means clear weather.
   */
  weather?: Readonly<{ rainRate: number }> | null;

}>;

export type ParticleRuntimeTelemetry = Readonly<{
  hf: 'HF-371';
  enabled: boolean;
  bypassReason: string | null;
  profile: RenderProfile;
  arenaId: ArenaId;
  arenaLabel: string;
  quality: ParticleQualityTier;
  /** One per family. Four, always. */
  instancedDraws: number;
  /** Non-instanced meshes under the root. Must be zero. */
  looseMeshes: number;
  capacityAtQuality: number;
  liveParticles: number;
  visibleParticles: number;
  /** Particles the readability guards touched this frame. */
  guardSuppressed: number;
  /** Aggregate screen-load thinning currently applied to obscuring families. */
  loadScale: number;
  /** The adaptive budget's ambient clamp, 0..1. Only ever takes away. */
  adaptiveDensityScale: number;
  /** The player's AIRBORNE DETAIL row, 0..2. Bounded by family capacity. */
  ambientLifeScale: number;
  protectedSightlines: number;
  lightShafts: number;
  /** Rain intensity 0..1 the simulation was last driven with, for receipts. */
  rainRate: number;
  families: readonly ParticleFieldTelemetry[];
  perFrameAllocations: 0;
}>;

/**
 * Why this differs from `rainBypassReason`: rain is weather and an arena
 * without it is merely dry, so the compat profile drops it entirely. Air is not
 * optional — an arena with no dust in it is the defect this work exists to fix
 * — so the compat profile runs at the `low` tier instead of being bypassed. A
 * software rasteriser still bypasses: at that point the fill rate is the whole
 * budget.
 */
export function particleBypassReason(
  profile: RenderProfile,
  rendererLabel: string,
  query: string | null,
): string | null {
  if (query === 'off') return 'query-disabled';
  if (query === 'on') return null;
  if (isSoftwareWebGLRenderer(rendererLabel)) return 'software-renderer';
  void profile;
  return null;
}

/** The compat profile still gets air, just less of it. */
export function particleQualityForProfile(
  profile: RenderProfile,
  requested: ParticleQualityTier,
): ParticleQualityTier {
  if (profile === 'compat') return 'low';
  if (profile === 'performance' && requested === 'ultra') return 'high';
  return requested;
}

function finite(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Fraction of the ambient mote population a full-intensity rain clears.
 * Rain washes suspended dust out of the air; at `rainRate` 1 the mote target
 * is this much smaller, scaling linearly in between. Drift (leaves, foam,
 * ash) keeps its population — rain loads it rather than empties it, which is
 * the sink in `particle-field.ts`.
 */
export const RAIN_DUST_CLEARED_FRACTION = 0.6;

export class ParticleRuntime {
  readonly root = new THREE.Group();

  /**
   * Fields are held in a plain array, not a Map, and every frame-path loop is
   * an indexed `for`. A `for...of` over a Map allocates an iterator per frame,
   * which would quietly falsify the zero-allocation claim this module makes.
   */
  private readonly fieldList: ParticleField[] = [];
  private readonly templateList: (AmbientTemplate | null)[] = [];
  private readonly moteField: ParticleField;
  private readonly driftField: ParticleField;
  private readonly puffField: ParticleField;
  private readonly gritField: ParticleField;
  private readonly context: ParticleFrameContext = createParticleFrameContext();
  private readonly moteTemplate: AmbientTemplate = createAmbientTemplate();
  private readonly driftTemplate: AmbientTemplate = createAmbientTemplate();

  private readonly bypass: string | null;
  private readonly profile: RenderProfile;
  private quality: ParticleQualityTier;
  private arenaId: ArenaId;

  // Scratch. Every one of these exists so the frame path allocates nothing.
  private readonly scratchColorA = new THREE.Color();
  private readonly scratchColorB = new THREE.Color();
  private readonly scratchVector = new THREE.Vector3();
  private readonly scratchDirection = new THREE.Vector3();
  private readonly scratchTangent = new THREE.Vector3();
  private readonly scratchBitangent = new THREE.Vector3();
  private readonly scratchOrigin = new THREE.Vector3();

  private built = false;
  private disposed = false;
  private elapsedSeconds = 0;
  private densityScale = 1;
  private ambientLifeScale = 1;
  /** Revision of the published shaft set this runtime has taken up. */
  private adoptedShaftRevision = -1;
  private muzzleHeat = 0;
  private secondsSinceMuzzle = 0;

  constructor(options: ParticleRuntimeOptions) {
    this.profile = options.profile;
    this.bypass = particleBypassReason(options.profile, options.rendererLabel, options.query ?? null);
    this.quality = particleQualityForProfile(options.profile, options.quality ?? 'high');
    this.arenaId = options.arenaId ?? 'atomic-acres';

    this.root.name = 'hf371-particles';
    // Never let the static batcher near this root: batching an InstancedMesh
    // collapses every instance onto one stray at the origin.
    this.root.userData.dynamic = true;
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;

    const seed = Math.trunc(finite(options.seed, 0)) >>> 0;
    const byId = {} as Record<ParticleFamilyId, ParticleField>;
    for (const id of PARTICLE_FAMILY_IDS) {
      const field = new ParticleField(PARTICLE_FAMILIES[id], seed);
      byId[id] = field;
      this.fieldList.push(field);
      this.templateList.push(null);
    }
    this.moteField = byId.motes;
    this.driftField = byId.drift;
    this.puffField = byId.puff;
    this.gritField = byId.grit;
    // Index-aligned with `fieldList`, so the frame loop needs no branch on id.
    this.templateList[PARTICLE_FAMILY_IDS.indexOf('motes')] = this.moteTemplate;
    this.templateList[PARTICLE_FAMILY_IDS.indexOf('drift')] = this.driftTemplate;
    this.applyArenaProfile();
  }

  /** Builds the four instanced draws and attaches the root. Idempotent. */
  build(scene: THREE.Object3D): void {
    if (this.built || this.disposed || this.bypass) return;
    this.built = true;
    for (let index = 0; index < this.fieldList.length; index += 1) {
      this.fieldList[index].build(this.root);
    }
    scene.add(this.root);
  }

  get enabled(): boolean { return this.bypass === null && !this.disposed; }
  get currentArena(): ArenaId { return this.arenaId; }
  get currentQuality(): ParticleQualityTier { return this.quality; }

  /**
   * Swaps the arena's air. No rebuild, no reallocation, no draw-call change:
   * the ambient templates are rewritten in place and the pools are cleared so
   * nothing from the retired arena hangs in the new one.
   */
  setArena(arenaId: ArenaId): void {
    if (this.arenaId === arenaId) return;
    this.arenaId = arenaId;
    this.applyArenaProfile();
    for (let index = 0; index < this.fieldList.length; index += 1) {
      this.fieldList[index].clear();
    }
    this.context.shaftCount = 0;
    // Force a re-adopt on the next frame: the published shafts belong to ONE
    // arena, so an arena change must either take up that arena's shafts or
    // clear the previous arena's out of the volume.
    this.adoptedShaftRevision = -1;
    this.muzzleHeat = 0;
  }

  setQuality(quality: ParticleQualityTier): void {
    this.quality = particleQualityForProfile(this.profile, quality);
  }

  /**
   * Rekeys every family's deterministic stream from a new match seed and
   * drops the live pools. Called once per match start with the same
   * `hostId:matchEpoch` derivation the weather model uses, so the air is
   * match-specific and peer-agreed instead of frozen to whatever seed the
   * module-scope constructor captured.
   */
  reseed(matchSeed: number): void {
    if (this.disposed) return;
    const seed = Math.trunc(finite(matchSeed, 0)) >>> 0;
    for (let index = 0; index < this.fieldList.length; index += 1) {
      this.fieldList[index].reseed(seed);
    }
  }

  private applyArenaProfile(): void {
    const profile = arenaParticleProfile(this.arenaId);
    for (let index = 0; index < this.fieldList.length; index += 1) {
      this.fieldList[index].setVolume(profile.volumeRadiusM, profile.volumeAboveM, profile.volumeBelowM);
    }

    const motes = profile.motes;
    this.writeTemplate(this.moteTemplate, {
      lifeSeconds: 9,
      radiusM: motes.radiusM,
      warm: motes.colorWarm,
      cool: motes.colorCool,
      opacity: motes.opacity,
      dragPerSecond: 0.8,
      buoyancyMps2: motes.riseMps * 0.35,
      windPull: motes.windPull,
      flutterMps: motes.swirlMps,
      spinRadiansPerSecond: 0.2,
    });

    const drift = profile.drift;
    this.writeTemplate(this.driftTemplate, {
      lifeSeconds: 7.5,
      radiusM: drift.radiusM,
      warm: drift.colorWarm,
      cool: drift.colorCool,
      opacity: drift.opacity,
      dragPerSecond: 1.4,
      buoyancyMps2: -drift.fallMps * 0.6,
      windPull: drift.windPull,
      flutterMps: drift.flutterMps,
      spinRadiansPerSecond: drift.spinRadiansPerSecond,
    });

    this.context.shaftResponse = profile.shaftResponse;
  }

  private writeTemplate(
    template: AmbientTemplate,
    source: Readonly<{
      lifeSeconds: number; radiusM: number; warm: number; cool: number; opacity: number;
      dragPerSecond: number; buoyancyMps2: number; windPull: number; flutterMps: number;
      spinRadiansPerSecond: number;
    }>,
  ): void {
    // setHex with SRGBColorSpace so authored hex reads the same as every other
    // authored colour in the repo once the renderer's colour management runs.
    this.scratchColorA.setHex(source.warm, THREE.SRGBColorSpace);
    this.scratchColorB.setHex(source.cool, THREE.SRGBColorSpace);
    template.lifeSeconds = source.lifeSeconds;
    template.radiusM = source.radiusM;
    template.warmR = this.scratchColorA.r;
    template.warmG = this.scratchColorA.g;
    template.warmB = this.scratchColorA.b;
    template.coolR = this.scratchColorB.r;
    template.coolG = this.scratchColorB.g;
    template.coolB = this.scratchColorB.b;
    template.opacity = source.opacity;
    template.dragPerSecond = source.dragPerSecond;
    template.buoyancyMps2 = source.buoyancyMps2;
    template.windPull = source.windPull;
    template.flutterMps = source.flutterMps;
    template.spinRadiansPerSecond = source.spinRadiansPerSecond;
  }

  /**
   * Registers the arena's authored light shafts so motes brighten inside them.
   * Bounded at `PARTICLE_MAX_LIGHT_SHAFTS`; extra shafts are ignored rather
   * than quietly making the mote loop more expensive.
   */
  private adoptPublishedLightShafts(): void {
    const available = activeLightShafts();
    if (available.revision === this.adoptedShaftRevision) return;
    this.adoptedShaftRevision = available.revision;
    // Shafts never cross arenas: another arena's cones would brighten motes in
    // mid-air over this one.
    this.setLightShafts(available.arenaId === this.arenaId ? available.shafts : EMPTY_LIGHT_SHAFTS);
  }

  setLightShafts(shafts: readonly ParticleLightShaft[]): void {
    const context = this.context;
    const count = Math.min(shafts.length, PARTICLE_MAX_LIGHT_SHAFTS);
    for (let index = 0; index < count; index += 1) {
      const shaft = shafts[index];
      const length = Math.hypot(shaft.axisX, shaft.axisY, shaft.axisZ) || 1;
      const base = index * 3;
      context.shaftOrigins[base] = shaft.x;
      context.shaftOrigins[base + 1] = shaft.y;
      context.shaftOrigins[base + 2] = shaft.z;
      context.shaftAxes[base] = shaft.axisX / length;
      context.shaftAxes[base + 1] = shaft.axisY / length;
      context.shaftAxes[base + 2] = shaft.axisZ / length;
      context.shaftRadii[index] = Math.max(0.1, shaft.radiusM);
    }
    context.shaftCount = count;
  }

  /**
   * Per-frame protected sightlines. Optional: the centre cone already protects
   * where the player is LOOKING, and this additionally protects enemies they
   * have not centred yet. Call `beginProtectedTargets()` then
   * `addProtectedTarget(...)` per visible enemy before `update`; the list is
   * cleared at the end of every update, so a frame that adds none has none.
   */
  beginProtectedTargets(): void {
    this.context.protectedCount = 0;
  }

  addProtectedTarget(x: number, y: number, z: number): void {
    const context = this.context;
    if (context.protectedCount >= context.protectedTargets.length / 3) return;
    const base = context.protectedCount * 3;
    context.protectedTargets[base] = x;
    context.protectedTargets[base + 1] = y;
    context.protectedTargets[base + 2] = z;
    context.protectedCount += 1;
  }

  // -------------------------------------------------------------------------
  // Emission
  // -------------------------------------------------------------------------

  /**
   * Builds an orthonormal basis around `scratchDirection` into
   * `scratchTangent` / `scratchBitangent`. Allocation-free; the degenerate
   * axis-aligned case is handled by picking a different reference axis.
   */
  private buildBasis(): void {
    const direction = this.scratchDirection;
    if (Math.abs(direction.y) < 0.9) this.scratchTangent.set(0, 1, 0);
    else this.scratchTangent.set(1, 0, 0);
    this.scratchBitangent.crossVectors(direction, this.scratchTangent).normalize();
    this.scratchTangent.crossVectors(this.scratchBitangent, direction).normalize();
  }

  /** Emits one puff recipe as a burst around an origin and a direction. */
  private emitPuff(recipe: PuffRecipe, opacityScale: number, countScale: number): void {
    const field = this.puffField;
    if (!this.enabled) return;
    this.buildBasis();
    this.scratchColorA.setHex(recipe.colorWarm, THREE.SRGBColorSpace);
    this.scratchColorB.setHex(recipe.colorCool, THREE.SRGBColorSpace);
    const count = Math.max(0, Math.round(recipe.count * countScale));
    const cosSpread = Math.cos(recipe.spreadRadians);
    for (let particle = 0; particle < count; particle += 1) {
      const cosTheta = 1 - field.random() * (1 - cosSpread);
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      const phi = field.random() * Math.PI * 2;
      const dirX = this.scratchDirection.x * cosTheta
        + this.scratchTangent.x * sinTheta * Math.cos(phi)
        + this.scratchBitangent.x * sinTheta * Math.sin(phi);
      const dirY = this.scratchDirection.y * cosTheta
        + this.scratchTangent.y * sinTheta * Math.cos(phi)
        + this.scratchBitangent.y * sinTheta * Math.sin(phi);
      const dirZ = this.scratchDirection.z * cosTheta
        + this.scratchTangent.z * sinTheta * Math.cos(phi)
        + this.scratchBitangent.z * sinTheta * Math.sin(phi);
      const speed = recipe.speedMps * (0.55 + field.random() * 0.9);
      const tint = field.random();
      const lifeSpan = recipe.lifeSeconds * (1 + (field.random() * 2 - 1) * recipe.lifeJitter);
      const scale = 0.75 + field.random() * 0.6;
      field.emitParticle(
        this.scratchOrigin.x + dirX * recipe.radiusStartM,
        this.scratchOrigin.y + dirY * recipe.radiusStartM,
        this.scratchOrigin.z + dirZ * recipe.radiusStartM,
        dirX * speed, dirY * speed, dirZ * speed,
        Math.max(0.05, lifeSpan),
        recipe.radiusStartM * scale,
        recipe.radiusEndM * scale,
        this.scratchColorA.r + (this.scratchColorB.r - this.scratchColorA.r) * tint,
        this.scratchColorA.g + (this.scratchColorB.g - this.scratchColorA.g) * tint,
        this.scratchColorA.b + (this.scratchColorB.b - this.scratchColorA.b) * tint,
        recipe.opacity * opacityScale,
        recipe.dragPerSecond,
        recipe.riseMps2,
        recipe.windPull,
        0,
        0.25 * (field.random() * 2 - 1),
      );
    }
  }

  /** Emits one grit recipe as a burst around an origin and a direction. */
  private emitGrit(recipe: GritRecipe, countScale: number): void {
    const field = this.gritField;
    if (!this.enabled) return;
    this.buildBasis();
    this.scratchColorA.setHex(recipe.colorWarm, THREE.SRGBColorSpace);
    this.scratchColorB.setHex(recipe.colorCool, THREE.SRGBColorSpace);
    const count = Math.max(0, Math.round(recipe.count * countScale));
    const cosSpread = Math.cos(recipe.spreadRadians);
    for (let particle = 0; particle < count; particle += 1) {
      const cosTheta = 1 - field.random() * (1 - cosSpread);
      const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));
      const phi = field.random() * Math.PI * 2;
      const dirX = this.scratchDirection.x * cosTheta
        + this.scratchTangent.x * sinTheta * Math.cos(phi)
        + this.scratchBitangent.x * sinTheta * Math.sin(phi);
      const dirY = this.scratchDirection.y * cosTheta
        + this.scratchTangent.y * sinTheta * Math.cos(phi)
        + this.scratchBitangent.y * sinTheta * Math.sin(phi);
      const dirZ = this.scratchDirection.z * cosTheta
        + this.scratchTangent.z * sinTheta * Math.cos(phi)
        + this.scratchBitangent.z * sinTheta * Math.sin(phi);
      const speed = recipe.speedMps * (0.5 + field.random() * 1);
      const tint = field.random();
      const radius = recipe.radiusM * (0.7 + field.random() * 0.7);
      const lifeSpan = recipe.lifeSeconds * (1 + (field.random() * 2 - 1) * recipe.lifeJitter);
      field.emitParticle(
        this.scratchOrigin.x, this.scratchOrigin.y, this.scratchOrigin.z,
        dirX * speed, dirY * speed, dirZ * speed,
        Math.max(0.05, lifeSpan),
        radius, radius,
        this.scratchColorA.r + (this.scratchColorB.r - this.scratchColorA.r) * tint,
        this.scratchColorA.g + (this.scratchColorB.g - this.scratchColorA.g) * tint,
        this.scratchColorA.b + (this.scratchColorB.b - this.scratchColorA.b) * tint,
        1,
        recipe.dragPerSecond,
        recipe.gravityMps2,
        0.25,
        0,
        recipe.spinRadiansPerSecond * (field.random() * 2 - 1),
      );
    }
  }

  /**
   * Dust disturbed at the feet. `kind` is the gate that keeps this from
   * becoming a smoke screen that follows the player: a walked step emits
   * nothing at all, and the caller is expected to call this on a hard direction
   * change, a sprint stride, or a landing — not on every footfall.
   */
  emitFootfall(x: number, y: number, z: number, kind: FootfallKind, intensity = 1): void {
    if (!this.enabled) return;
    const recipe = FOOTFALL_PUFFS[kind];
    if (!recipe) return;
    const strength = clamp01(intensity);
    this.scratchOrigin.set(x, y + 0.06, z);
    // Outward and slightly up: dust rolls away from the boot, it does not
    // fountain out of it.
    this.scratchDirection.set(0, 1, 0);
    this.emitPuff(recipe, strength, 0.5 + strength * 0.7);
    if (kind === 'land') {
      this.scratchOrigin.set(x, y + 0.03, z);
      this.scratchDirection.set(0, 1, 0);
      this.emitGrit(LANDING_GRIT, strength);
    }
  }

  /**
   * Muzzle-adjacent powder smoke.
   *
   * `aim` is the barrel axis and `up` the weapon's up vector; the origin is
   * offset outboard and above the muzzle and the emission direction is biased
   * upward, so the smoke curls off the weapon rather than into the sight line.
   * The centre cone in `combat-readability.ts` applies to it unchanged — this
   * offset is what makes the effect visible WITHIN the guard rather than an
   * argument for weakening it.
   */
  emitMuzzleSmoke(
    muzzle: THREE.Vector3,
    aim: THREE.Vector3,
    up: THREE.Vector3 | null = null,
    intensity = 1,
  ): void {
    if (!this.enabled) return;
    const strength = clamp01(intensity);
    this.scratchVector.copy(aim).normalize();
    const upX = up ? up.x : 0;
    const upY = up ? up.y : 1;
    const upZ = up ? up.z : 0;
    this.scratchTangent.set(upX, upY, upZ);
    // Outboard axis = aim x up. Degenerate when the player looks straight up,
    // which is exactly when the fallback reference axis matters.
    this.scratchBitangent.crossVectors(this.scratchVector, this.scratchTangent);
    if (this.scratchBitangent.lengthSq() < 1e-6) this.scratchBitangent.set(1, 0, 0);
    this.scratchBitangent.normalize();

    this.scratchOrigin.copy(muzzle)
      .addScaledVector(this.scratchBitangent, 0.055)
      .addScaledVector(this.scratchTangent, 0.05);
    // Mostly up, a little forward: powder smoke leaves the barrel and rises.
    this.scratchDirection.copy(this.scratchTangent).multiplyScalar(0.82)
      .addScaledVector(this.scratchVector, 0.35)
      .normalize();

    this.muzzleHeat = clamp01(this.muzzleHeat + 1 / (MUZZLE_HEAT_RESPONSE.heatSeconds * 10));
    this.secondsSinceMuzzle = 0;
    const heatScale = MUZZLE_HEAT_RESPONSE.coldScale
      + (MUZZLE_HEAT_RESPONSE.hotScale - MUZZLE_HEAT_RESPONSE.coldScale) * this.muzzleHeat;
    this.emitPuff(MUZZLE_SMOKE, strength * heatScale, 0.6 + this.muzzleHeat * 0.7);
  }

  /**
   * The dust cloud and the falling grit for a round striking a surface.
   *
   * Deliberately NOT the sparks or the decal: `impact-presentation.ts` already
   * owns both, and this reads the same `SURFACE_IMPACT_PROFILES` entry it does,
   * so the cloud is the colour of the sparks it hangs over and neither can be
   * retuned without the other following.
   */
  emitSurfaceImpact(
    point: THREE.Vector3,
    normal: THREE.Vector3,
    surface: ImpactParticleSurface,
    intensity = 1,
  ): void {
    if (!this.enabled) return;
    const strength = clamp01(intensity);
    this.scratchOrigin.copy(point);
    this.scratchDirection.copy(normal);
    if (this.scratchDirection.lengthSq() < 1e-6) this.scratchDirection.set(0, 1, 0);
    this.scratchDirection.normalize();
    this.emitPuff(surfaceImpactPuff(surface), strength, strength);
    this.emitGrit(surfaceImpactGrit(surface), strength);
  }

  // -------------------------------------------------------------------------
  // The one per-frame entry
  // -------------------------------------------------------------------------

  update(dtSeconds: number, camera: THREE.Camera, options: ParticleUpdateOptions = {}): void {
    if (!this.enabled || !this.built) return;
    const step = Math.min(PARTICLE_MAX_STEP_SECONDS, Math.max(0, finite(dtSeconds, 0)));
    this.elapsedSeconds += step;
    this.secondsSinceMuzzle += step;
    if (this.secondsSinceMuzzle > 0.12) {
      this.muzzleHeat = Math.max(0, this.muzzleHeat - step / MUZZLE_HEAT_RESPONSE.coolSeconds);
    }

    // Take up whatever the arena's art module published, if it changed. One
    // integer compare on the frame path; nothing else happens unless an arena
    // actually republished. See light-shaft-registry.ts for why this is a
    // latch and not a call from the orchestrator.
    this.adoptPublishedLightShafts();

    const context = this.context;
    camera.getWorldPosition(this.scratchVector);
    context.cameraX = this.scratchVector.x;
    context.cameraY = this.scratchVector.y;
    context.cameraZ = this.scratchVector.z;
    camera.getWorldDirection(this.scratchVector);
    context.forwardX = this.scratchVector.x;
    context.forwardY = this.scratchVector.y;
    context.forwardZ = this.scratchVector.z;
    camera.getWorldQuaternion(context.cameraQuaternion);

    const wind = options.wind;
    context.windX = wind ? finite(wind.x, 0) : 0;
    context.windZ = wind ? finite(wind.z, 0) : 0;
    context.adsProgress = clamp01(finite(options.adsProgress, 0));
    context.rainRate = clamp01(finite(options.weather?.rainRate, 0));
    context.elapsedSeconds = this.elapsedSeconds;
    this.densityScale = clamp01(finite(options.densityScale, 1));
    // TWO DIFFERENT KNOBS, deliberately kept apart. `densityScale` is the
    // ADAPTIVE budget clamp - the frame-time controller thinning the air under
    // pressure, and it is bounded to 0..1 because it may only ever take away.
    // `ambientLife` is the PLAYER's row and reaches 2, because the arena
    // profiles ask for roughly a third to a half of the family capacity and
    // "more dust" has to be able to mean something. Neither can exceed the
    // family ceiling: setAmbientTarget clamps to capacity, so the readability
    // audit and the frame budget still bound the top of the slider.
    this.ambientLifeScale = Math.max(0, finite((options.ambientLife ?? activeAmbientLife()).density, 1));
    const ambient = this.densityScale * this.ambientLifeScale;

    const profile = arenaParticleProfile(this.arenaId);
    // THE TIER CEILING BINDS THE SLIDER, and it is clamped HERE rather than in
    // setAmbientTarget: that clamp is against the ALLOCATED buffer, which is
    // always the ultra ceiling so a live quality change cannot reallocate. So a
    // low-tier player at 2x air would have walked straight past the low tier's
    // 220-mote budget and into 440 - on exactly the machines the low tier
    // exists for. Caught by index.test.ts, not by inspection.
    const moteCeiling = PARTICLE_FAMILIES.motes.capacity[this.quality];
    const driftCeiling = PARTICLE_FAMILIES.drift.capacity[this.quality];
    this.moteField.setAmbientTarget(Math.min(
      moteCeiling,
      moteCeiling * profile.motes.density * ambient,
    ) * (1 - RAIN_DUST_CLEARED_FRACTION * context.rainRate));
    this.driftField.setAmbientTarget(Math.min(
      driftCeiling,
      driftCeiling * profile.drift.density * ambient,
    ));

    let load = 0;
    for (let index = 0; index < this.fieldList.length; index += 1) {
      load += this.fieldList[index].update(step, context, this.templateList[index]);
    }
    // One-frame feedback, by design: see `screenLoadScale`.
    context.loadScale = screenLoadScale(load);
    // Sightlines are per-frame. Clearing here means a caller that stops feeding
    // them cannot leave a stale enemy position permanently clearing smoke.
    context.protectedCount = 0;
  }

  /**
   * After a WebGL context restore the instance buffers must be re-uploaded;
   * three does not re-flag them on its own.
   */
  handleContextRestored(): void {
    for (let index = 0; index < this.fieldList.length; index += 1) {
      const mesh = this.fieldList[index].instancedMesh;
      if (!mesh) continue;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  telemetry(): ParticleRuntimeTelemetry {
    const families: ParticleFieldTelemetry[] = [];
    let live = 0;
    let visible = 0;
    let guardSuppressed = 0;
    let looseMeshes = 0;
    for (let index = 0; index < this.fieldList.length; index += 1) {
      const report = this.fieldList[index].telemetry();
      families.push(report);
      live += report.live;
      visible += report.visible;
      guardSuppressed += report.guardSuppressed;
    }
    this.root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if ((mesh as THREE.InstancedMesh).isInstancedMesh) return;
      if (mesh.isMesh) looseMeshes += 1;
    });
    const profile = arenaParticleProfile(this.arenaId);
    return Object.freeze({
      hf: 'HF-371',
      enabled: this.enabled,
      bypassReason: this.bypass,
      profile: this.profile,
      arenaId: this.arenaId,
      arenaLabel: profile.label,
      quality: this.quality,
      instancedDraws: this.built ? PARTICLE_INSTANCED_DRAWS : 0,
      looseMeshes,
      capacityAtQuality: totalCapacity(this.quality),
      liveParticles: live,
      visibleParticles: visible,
      guardSuppressed,
      loadScale: Number(this.context.loadScale.toFixed(4)),
      adaptiveDensityScale: Number(this.densityScale.toFixed(4)),
      ambientLifeScale: Number(this.ambientLifeScale.toFixed(4)),
      rainRate: Number(this.context.rainRate.toFixed(3)),
      protectedSightlines: this.context.protectedCount,
      lightShafts: this.context.shaftCount,
      families: Object.freeze(families),
      perFrameAllocations: 0,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let index = 0; index < this.fieldList.length; index += 1) {
      this.fieldList[index].dispose();
    }
    this.fieldList.length = 0;
    this.templateList.length = 0;
    this.root.removeFromParent();
  }
}
