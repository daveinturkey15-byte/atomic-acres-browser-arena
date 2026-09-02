import { ARENA_SELECTIONS, type ArenaId } from './map-selection';
import { strideLength } from './footsteps';
import type { AudioBusId } from './audio-buses';

export const AUDIO_RUNTIME_BUDGET = Object.freeze({
  globalVoices: 48,
  spatialVoices: 12,
  continuousVoices: 8,
  occlusionChecksPerFrame: 4,
  perBus: Object.freeze({
    sfx: 24,
    movement: 16,
    ui: 6,
    announcements: 4,
    ambience: 8,
    'menu-music': 2,
    'game-music': 2,
  } satisfies Record<Exclude<AudioBusId, 'master'>, number>),
});

export type SpatialPoint = Readonly<{ x: number; y: number; z: number }>;
export type FootstepSurface = 'soil' | 'grass' | 'wood' | 'metal' | 'concrete' | 'asphalt';
export type FootstepMovement = 'walk' | 'sprint' | 'crouch' | 'prone';

/**
 * The legacy classifier is authored around Atomic Acres landmarks. Preserve
 * its useful per-position result there, but use each other arena's actual
 * dominant walkable material instead of projecting Atomic's road bands across
 * unrelated maps.
 */
export function arenaFootstepSurface(arenaId: ArenaId, atomicSurface: FootstepSurface): FootstepSurface {
  if (arenaId === 'rustworks-1v1') return 'metal';
  if (arenaId === 'gun-range' || arenaId === 'skyline-terminal') return 'concrete';
  if (arenaId === 'high-seas') return 'wood';
  // Test1's dominant walkable is packed range dirt; Test2's is travertine
  // pool deck and terrace stone. Falling through would project Atomic's road
  // bands across both.
  if (arenaId === 'test1') return 'soil';
  if (arenaId === 'test2') return 'concrete';
  return atomicSurface;
}

export type FootstepSample = Readonly<{
  actorId: string;
  lifeId: string | number;
  continuityId: string | number;
  position: SpatialPoint;
  grounded: boolean;
  stale: boolean;
  discontinuity?: boolean;
  movement: FootstepMovement;
  surface: FootstepSurface;
  now: number;
}>;

export type FootstepEmission = Readonly<{
  actorId: string;
  position: SpatialPoint;
  surface: FootstepSurface;
  movement: FootstepMovement;
  side: 0 | 1;
}>;

type FootstepActorState = {
  lifeId: FootstepSample['lifeId'];
  continuityId: FootstepSample['continuityId'];
  position: SpatialPoint;
  distance: number;
  side: 0 | 1;
  sampledAt: number;
  eligible: boolean;
};

function finitePoint(point: SpatialPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z);
}

function horizontalDistance(left: SpatialPoint, right: SpatialPoint): number {
  return Math.hypot(right.x - left.x, right.z - left.z);
}

function footstepStride(movement: FootstepMovement): number {
  if (movement === 'prone') return strideLength('prone', false);
  if (movement === 'crouch') return strideLength('crouch', false);
  return strideLength('stand', movement === 'sprint');
}

/**
 * Converts only admitted, continuous, grounded travel into footsteps. The key
 * includes life and continuity so interpolation resets, teleports and respawns
 * cannot manufacture distance or audible footsteps.
 */
export class FootstepEmitterRegistry {
  private readonly actors = new Map<string, FootstepActorState>();

  reset(actorId?: string): void {
    if (actorId === undefined) this.actors.clear();
    else this.actors.delete(actorId);
  }

  sample(input: FootstepSample): readonly FootstepEmission[] {
    if (!input.actorId.trim() || !finitePoint(input.position) || !Number.isFinite(input.now)) return [];
    const prior = this.actors.get(input.actorId);
    const reset = !prior
      || prior.lifeId !== input.lifeId
      || prior.continuityId !== input.continuityId
      || input.discontinuity
      || input.stale
      || input.now < prior.sampledAt
      || input.now - prior.sampledAt > 500
      || !prior.eligible;
    if (reset) {
      this.actors.set(input.actorId, {
        lifeId: input.lifeId,
        continuityId: input.continuityId,
        position: { ...input.position },
        distance: 0,
        side: 0,
        sampledAt: input.now,
        eligible: input.grounded && !input.stale && !input.discontinuity,
      });
      return [];
    }
    const travelled = horizontalDistance(prior.position, input.position);
    prior.position = { ...input.position };
    prior.sampledAt = input.now;
    if (!input.grounded || travelled > 4 || travelled < 0.001) {
      if (!input.grounded || travelled > 4) {
        prior.distance = 0;
        prior.eligible = input.grounded && travelled <= 4;
      }
      return [];
    }
    prior.eligible = true;
    prior.distance += travelled;
    const stride = footstepStride(input.movement);
    const count = Math.min(2, Math.floor(prior.distance / stride));
    if (count === 0) return [];
    prior.distance %= stride;
    const emissions: FootstepEmission[] = [];
    for (let index = 0; index < count; index += 1) {
      emissions.push(Object.freeze({
        actorId: input.actorId,
        position: Object.freeze({ ...input.position }),
        surface: input.surface,
        movement: input.movement,
        side: prior.side,
      }));
      prior.side = prior.side === 0 ? 1 : 0;
    }
    return Object.freeze(emissions);
  }
}

export function spatialFootstepGain(distance: number): number {
  const safeDistance = Math.max(0, Number.isFinite(distance) ? distance : Number.POSITIVE_INFINITY);
  if (!Number.isFinite(safeDistance) || safeDistance >= 32) return 0;
  return Number((1 / (1 + Math.pow(safeDistance / 4.5, 1.65))).toFixed(5));
}

export function spatialPan(listener: SpatialPoint, listenerYaw: number, source: SpatialPoint): number {
  if (!finitePoint(listener) || !finitePoint(source) || !Number.isFinite(listenerYaw)) return 0;
  const bearing = Math.atan2(source.x - listener.x, -(source.z - listener.z));
  return Number(Math.max(-1, Math.min(1, Math.sin(bearing - listenerYaw))).toFixed(5));
}

export class AudioOcclusionBudget {
  private frameId = -1;
  private checks = 0;
  private denied = 0;

  admit(frameId: number): boolean {
    if (!Number.isFinite(frameId)) return false;
    if (frameId !== this.frameId) {
      this.frameId = frameId;
      this.checks = 0;
    }
    if (this.checks >= AUDIO_RUNTIME_BUDGET.occlusionChecksPerFrame) {
      this.denied += 1;
      return false;
    }
    this.checks += 1;
    return true;
  }

  telemetry(): Readonly<{ frameId: number; checks: number; maximumPerFrame: number; denied: number }> {
    return Object.freeze({
      frameId: this.frameId,
      checks: this.checks,
      maximumPerFrame: AUDIO_RUNTIME_BUDGET.occlusionChecksPerFrame,
      denied: this.denied,
    });
  }
}

export type VoiceCandidate = Readonly<{
  id: string;
  priority: number;
  distance: number;
  startedAt: number;
}>;

/** Returns the incumbent to steal, or null when the candidate should be dropped. */
export function selectVoiceToSteal(
  active: readonly VoiceCandidate[],
  candidate: VoiceCandidate,
  capacity: number,
): VoiceCandidate | null | undefined {
  if (active.length < Math.max(0, Math.floor(capacity))) return undefined;
  const weakest = [...active].sort((left, right) =>
    left.priority - right.priority
    || right.distance - left.distance
    || left.startedAt - right.startedAt
    || left.id.localeCompare(right.id))[0];
  if (!weakest) return null;
  const candidateWins = candidate.priority > weakest.priority
    || (candidate.priority === weakest.priority && candidate.distance < weakest.distance)
    || (candidate.priority === weakest.priority && candidate.distance === weakest.distance && candidate.startedAt > weakest.startedAt);
  return candidateWins ? weakest : null;
}

export type ArenaAudioDefinition = Readonly<{
  arenaId: ArenaId;
  identity: string;
  source: 'repository-procedural-original';
  continuousVoices: number;
  bedFrequencyHz: number;
  airFrequencyHz: number;
  airLowpassHz: number;
  airQ: number;
  airGain: number;
  modulationHz: number;
  modulationDepth: number;
  bedPosition: SpatialPoint;
  airPosition: SpatialPoint;
}>;

export const ARENA_AUDIO_DEFINITIONS: Readonly<Record<ArenaId, ArenaAudioDefinition>> = Object.freeze({
  'atomic-acres': Object.freeze({
    arenaId: 'atomic-acres', identity: 'suburban-wind-and-distant-grid-hum', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 58, airFrequencyHz: 196, airLowpassHz: 720, airQ: 1.8, airGain: 0.007,
    modulationHz: 0.08, modulationDepth: 0.09,
    bedPosition: Object.freeze({ x: -18, y: 4, z: 9 }), airPosition: Object.freeze({ x: 17, y: 7, z: -11 }),
  }),
  'rustworks-1v1': Object.freeze({
    arenaId: 'rustworks-1v1', identity: 'industrial-duct-and-stressed-metal', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 43, airFrequencyHz: 127, airLowpassHz: 540, airQ: 1.65, airGain: 0.008,
    modulationHz: 0.13, modulationDepth: 0.12,
    bedPosition: Object.freeze({ x: 0, y: 9, z: 0 }), airPosition: Object.freeze({ x: -19, y: 3, z: 15 }),
  }),
  'gun-range': Object.freeze({
    arenaId: 'gun-range', identity: 'indoor-ventilation-and-ballast-buzz', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 71, airFrequencyHz: 238, airLowpassHz: 780, airQ: 2.35, airGain: 0.006,
    modulationHz: 0.06, modulationDepth: 0.075,
    bedPosition: Object.freeze({ x: 14, y: 3, z: -33 }), airPosition: Object.freeze({ x: -13, y: 4, z: -19 }),
  }),
  'skyline-terminal': Object.freeze({
    arenaId: 'skyline-terminal', identity: 'terminal-hvac-and-apron-engine-wash', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 49, airFrequencyHz: 174, airLowpassHz: 640, airQ: 1.9, airGain: 0.0075,
    modulationHz: 0.095, modulationDepth: 0.1,
    bedPosition: Object.freeze({ x: -17, y: 5, z: -8 }), airPosition: Object.freeze({ x: 22, y: 4, z: 14 }),
  }),
  // HF-359 (Pass 74): ported from the Pass 69 hidden lane.
  'farcrysis': Object.freeze({
    arenaId: 'farcrysis', identity: 'golden-hour-jungle-insect-and-breeze', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 52, airFrequencyHz: 163, airLowpassHz: 600, airQ: 1.75, airGain: 0.007,
    modulationHz: 0.11, modulationDepth: 0.08,
    bedPosition: Object.freeze({ x: -15, y: 3, z: 10 }), airPosition: Object.freeze({ x: 18, y: 6, z: -14 }),
  }),
  'high-seas': Object.freeze({
    arenaId: 'high-seas', identity: 'diesel-engine-thrum-and-open-sea-wind', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 46, airFrequencyHz: 151, airLowpassHz: 620, airQ: 1.85, airGain: 0.007,
    modulationHz: 0.09, modulationDepth: 0.1,
    bedPosition: Object.freeze({ x: 0, y: 0, z: 24 }), airPosition: Object.freeze({ x: 0, y: 8.92, z: -28 }),
  }),
  'test1': Object.freeze({
    arenaId: 'test1', identity: 'dry-range-wind-and-flag-canvas', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 55, airFrequencyHz: 182, airLowpassHz: 700, airQ: 1.8, airGain: 0.007,
    modulationHz: 0.1, modulationDepth: 0.1,
    bedPosition: Object.freeze({ x: -18, y: 3, z: 8 }), airPosition: Object.freeze({ x: 16, y: 6, z: -10 }),
  }),
  'test2': Object.freeze({
    arenaId: 'test2', identity: 'hillside-garden-breeze-and-pool-water', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 50, airFrequencyHz: 168, airLowpassHz: 660, airQ: 1.85, airGain: 0.0065,
    modulationHz: 0.085, modulationDepth: 0.09,
    bedPosition: Object.freeze({ x: -20, y: 3, z: 12 }), airPosition: Object.freeze({ x: 22, y: 5, z: -16 }),
  }),
  // MAP3 (PREVIEW): the bed is the wind in the colonnade bay, the air layer is
  // the open scrub on the far side of the hub. Both are placed off-axis from
  // the hub centre so the layer has a bearing to walk around.
  'map3': Object.freeze({
    arenaId: 'map3', identity: 'stone-gallery-wind-and-open-scrub', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 46, airFrequencyHz: 182, airLowpassHz: 720, airQ: 1.7, airGain: 0.0062,
    modulationHz: 0.073, modulationDepth: 0.11,
    bedPosition: Object.freeze({ x: -34, y: 4, z: -34 }), airPosition: Object.freeze({ x: 30, y: 6, z: 30 }),
  }),
  // NUKETOWN2 (PREVIEW, HF-407): the bed is the low mains/transformer hum at
  // the west cul-de-sac, the air layer is wind over the east back yard's fence
  // line. Placed at opposite ends of the street so the pair gives the player a
  // bearing along the one axis the whole map is organised on.
  'nuketown2': Object.freeze({
    arenaId: 'nuketown2', identity: 'test-town-street-hum-and-fence-wind', source: 'repository-procedural-original',
    continuousVoices: 2, bedFrequencyHz: 54, airFrequencyHz: 188, airLowpassHz: 690, airQ: 1.75, airGain: 0.0061,
    modulationHz: 0.079, modulationDepth: 0.1,
    bedPosition: Object.freeze({ x: -24, y: 3, z: -2 }), airPosition: Object.freeze({ x: 18, y: 5, z: 21 }),
  }),
});

export function validateArenaAudioDefinitions(): readonly string[] {
  const issues: string[] = [];
  const identities = new Set<string>();
  for (const arena of ARENA_SELECTIONS) {
    const definition = ARENA_AUDIO_DEFINITIONS[arena.id];
    if (!definition) {
      issues.push(`missing:${arena.id}`);
      continue;
    }
    if (identities.has(definition.identity)) issues.push(`duplicate-identity:${definition.identity}`);
    identities.add(definition.identity);
    if (definition.continuousVoices > 2) issues.push(`voice-budget:${arena.id}`);
    if (definition.airGain <= 0 || definition.airGain > 0.01) issues.push(`broadband-gain:${arena.id}`);
    if (definition.airQ < 1.4) issues.push(`broadband-q:${arena.id}`);
    if (definition.airLowpassHz > 900 || definition.airLowpassHz <= definition.airFrequencyHz) {
      issues.push(`broadband-cutoff:${arena.id}`);
    }
    if (definition.modulationDepth <= 0 || definition.modulationDepth > 0.2) issues.push(`modulation-depth:${arena.id}`);
  }
  return Object.freeze(issues);
}
