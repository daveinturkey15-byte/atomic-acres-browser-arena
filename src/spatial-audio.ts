import { ARENA_SELECTIONS, type ArenaId } from './map-selection';
import { strideLength } from './footsteps';
import type { AudioBusId } from './audio-buses';

export const AUDIO_RUNTIME_BUDGET = Object.freeze({
  globalVoices: 48,
  spatialVoices: 12,
  // Eight muted combat/effect voices plus four muted spatial rotor voices are
  // owned at unlock; the global cap remains unchanged and live entry allocates none.
  continuousVoices: 12,
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

export const ARENA_AMBIENCE_POLICY = Object.freeze({
  mode: 'event-driven-discrete-cues-only' as const,
  continuousNoiseVoices: 0 as const,
  scheduledNoiseEvents: 0 as const,
  sharedNoiseBufferEvents: 0 as const,
});

export type ArenaAudioDefinition = Readonly<{
  arenaId: ArenaId;
  identity: string;
  source: 'repository-procedural-original';
  ambienceMode: typeof ARENA_AMBIENCE_POLICY.mode;
  continuousVoices: 0;
  scheduledNoiseEvents: 0;
  sharedNoiseBufferEvents: 0;
  discreteCueIdentities: readonly string[];
}>;

export const ARENA_AUDIO_DEFINITIONS: Readonly<Record<ArenaId, ArenaAudioDefinition>> = Object.freeze({
  'atomic-acres': Object.freeze({
    arenaId: 'atomic-acres', identity: 'suburban-event-driven-world-detail', source: 'repository-procedural-original',
    ambienceMode: 'event-driven-discrete-cues-only', continuousVoices: 0, scheduledNoiseEvents: 0, sharedNoiseBufferEvents: 0,
    discreteCueIdentities: Object.freeze(['zone-transition', 'surface-footsteps', 'window-breaks']),
  }),
  'rustworks-1v1': Object.freeze({
    arenaId: 'rustworks-1v1', identity: 'industrial-event-driven-world-detail', source: 'repository-procedural-original',
    ambienceMode: 'event-driven-discrete-cues-only', continuousVoices: 0, scheduledNoiseEvents: 0, sharedNoiseBufferEvents: 0,
    discreteCueIdentities: Object.freeze(['surface-footsteps', 'weapon-impacts', 'shed-door-actions']),
  }),
  'gun-range': Object.freeze({
    arenaId: 'gun-range', identity: 'indoor-event-driven-world-detail', source: 'repository-procedural-original',
    ambienceMode: 'event-driven-discrete-cues-only', continuousVoices: 0, scheduledNoiseEvents: 0, sharedNoiseBufferEvents: 0,
    discreteCueIdentities: Object.freeze(['surface-footsteps', 'weapon-impacts', 'test-bay-door-actions']),
  }),
  'skyline-terminal': Object.freeze({
    arenaId: 'skyline-terminal', identity: 'terminal-event-driven-world-detail', source: 'repository-procedural-original',
    ambienceMode: 'event-driven-discrete-cues-only', continuousVoices: 0, scheduledNoiseEvents: 0, sharedNoiseBufferEvents: 0,
    discreteCueIdentities: Object.freeze(['surface-footsteps', 'weapon-impacts', 'support-aircraft-actions']),
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
    if (definition.ambienceMode !== ARENA_AMBIENCE_POLICY.mode) issues.push(`ambience-mode:${arena.id}`);
    if (definition.continuousVoices !== 0) issues.push(`continuous-ambience:${arena.id}`);
    if (definition.scheduledNoiseEvents !== 0) issues.push(`scheduled-noise:${arena.id}`);
    if (definition.sharedNoiseBufferEvents !== 0) issues.push(`shared-noise-buffer:${arena.id}`);
    if (definition.discreteCueIdentities.length < 2
      || new Set(definition.discreteCueIdentities).size !== definition.discreteCueIdentities.length) {
      issues.push(`discrete-cue-identities:${arena.id}`);
    }
    if ([definition.identity, ...definition.discreteCueIdentities]
      .some((value) => /\b(?:buzz|hum|wind|hvac|ventilation|duct|noise)\b|engine-wash/iu.test(value))) {
      issues.push(`noise-identity:${arena.id}`);
    }
  }
  return Object.freeze(issues);
}
