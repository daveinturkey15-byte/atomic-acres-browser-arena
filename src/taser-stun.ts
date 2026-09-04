/**
 * HF-458 item 3: the Piloted Drone's electric taser.
 *
 * This is a STATUS EFFECT with the same shape as the flashbang
 * (`src/flash-authority.ts`), deliberately: the host resolves it, the victim
 * client only replays an admitted result, and a guest can neither mint one nor
 * replay one twice. The differences from the flashbang are the ones the owner
 * asked for and nothing else:
 *
 *   flashbang  -> blinds (white screen), does not restrict movement
 *   taser      -> stuns (no movement, no sprint, no jump) for ~1 s, and the
 *                 screen effect is an electric-blue arc vignette, not a flash
 *
 * The pure decision helpers below (charges, cooldown, auto-fire targeting,
 * movement admission) live here rather than in the host runtime so they can be
 * tested without a world, and so the piloted and unpiloted paths cannot drift
 * apart - both call the same functions.
 */

import {
  PILOTED_DRONE_TASER_CHARGES,
  PILOTED_DRONE_TASER_COOLDOWN_MS,
  PILOTED_DRONE_TASER_RANGE_M,
  TASER_STUN_DURATION_MS,
  TASER_STUN_MAX_DURATION_MS,
} from './killstreak-tuning';

export const TASER_AUTHORITY_SCHEMA_VERSION = 1;
export const TASER_MAX_RESULTS_PER_SHOT = 1;
export const TASER_MAX_REMEMBERED_RESULTS_PER_LIFE = 32;
const TASER_MAX_ACTIVATION_ID_LENGTH = 128;

export type TaserAuthorityRole = 'host' | 'replica';

export type TaserVictimAdmission = Readonly<{
  targetId: string;
  targetLifeId: number;
  durationMs: number;
}>;

export type TaserStunResult = Readonly<{
  schemaVersion: typeof TASER_AUTHORITY_SCHEMA_VERSION;
  matchEpoch: number;
  resultId: string;
  activationId: string;
  targetId: string;
  targetLifeId: number;
  sequence: number;
  startsAtHostTimeMs: number;
  endsAtHostTimeMs: number;
}>;

export type TaserShotResolution = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'not-host' | 'wrong-epoch' | 'malformed' | 'replay';
  results: readonly TaserStunResult[];
}>;

export type TaserResultAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'malformed' | 'wrong-epoch' | 'wrong-target' | 'stale-life'
    | 'duplicate' | 'out-of-order' | 'expired';
  remainingDurationMs: number;
}>;

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalActorId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 80
    && /^[a-zA-Z0-9_-]+$/.test(value);
}

function canonicalEntityId(value: unknown, maximumLength = 256): value is string {
  return typeof value === 'string' && value.length >= 3 && value.length <= maximumLength
    && /^[a-zA-Z0-9:_.|-]+$/.test(value);
}

function boundedInteger(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function finiteTime(value: unknown): value is number {
  return Number.isFinite(value) && Number(value) >= 0 && Number(value) <= Number.MAX_SAFE_INTEGER;
}

export function taserActivationId(matchEpoch: number, ownerId: string, actionNonce: number): string {
  return `taser:${matchEpoch}:${ownerId}:${actionNonce}`;
}

export function isTaserStunResult(value: unknown): value is TaserStunResult {
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion', 'matchEpoch', 'resultId', 'activationId', 'targetId', 'targetLifeId', 'sequence',
      'startsAtHostTimeMs', 'endsAtHostTimeMs',
    ])
    || value.schemaVersion !== TASER_AUTHORITY_SCHEMA_VERSION
    || !boundedInteger(value.matchEpoch, 1, 1_000_000_000)
    || !canonicalEntityId(value.resultId)
    || !canonicalEntityId(value.activationId, TASER_MAX_ACTIVATION_ID_LENGTH)
    || !canonicalActorId(value.targetId)
    || !boundedInteger(value.targetLifeId, 0, 1_000_000_000)
    || !boundedInteger(value.sequence, 1, 1_000_000_000)
    || !finiteTime(value.startsAtHostTimeMs)
    || !finiteTime(value.endsAtHostTimeMs)) return false;
  const durationMs = Number(value.endsAtHostTimeMs) - Number(value.startsAtHostTimeMs);
  return durationMs >= 1 && durationMs <= TASER_STUN_MAX_DURATION_MS;
}

// ---------------------------------------------------------------------------
// Pure drone-side decisions: charges, cooldown, target selection
// ---------------------------------------------------------------------------

export type TaserChargeState = Readonly<{
  charges: number;
  nextTaserAtMs: number;
}>;

export type TaserShotAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'no-charges' | 'cooling-down' | 'no-target' | 'malformed';
  state: TaserChargeState;
}>;

export function initialTaserChargeState(nowMs = 0): TaserChargeState {
  return Object.freeze({
    charges: PILOTED_DRONE_TASER_CHARGES,
    nextTaserAtMs: Number.isFinite(nowMs) ? nowMs : 0,
  });
}

/**
 * The single admission both the piloted right-click and the unpiloted
 * auto-fire go through. `hasTarget` is the caller's world query result; this
 * function never touches a world, so a refusal is always one of four stated
 * reasons and never a silent no-op.
 */
export function admitTaserShot(input: Readonly<{
  state: TaserChargeState;
  nowMs: number;
  hasTarget: boolean;
}>): TaserShotAdmission {
  const state = Object.freeze({
    charges: Math.max(0, Math.floor(Number.isFinite(input.state?.charges) ? input.state.charges : 0)),
    nextTaserAtMs: Number.isFinite(input.state?.nextTaserAtMs) ? input.state.nextTaserAtMs : 0,
  });
  const refuse = (reason: Exclude<TaserShotAdmission['reason'], 'accepted'>): TaserShotAdmission => Object.freeze({
    accepted: false, reason, state,
  });
  if (!Number.isFinite(input.nowMs)) return refuse('malformed');
  if (state.charges <= 0) return refuse('no-charges');
  if (input.nowMs < state.nextTaserAtMs) return refuse('cooling-down');
  if (input.hasTarget !== true) return refuse('no-target');
  return Object.freeze({
    accepted: true,
    reason: 'accepted',
    state: Object.freeze({
      charges: state.charges - 1,
      nextTaserAtMs: input.nowMs + PILOTED_DRONE_TASER_COOLDOWN_MS,
    }),
  });
}

export type TaserCandidate = Readonly<{
  id: string;
  position: readonly [number, number, number];
}>;

/**
 * Auto-fire targeting rule, owner-stated: "when unpiloted the drone fires the
 * taser automatically at a target in range". Nearest hostile inside the taser
 * range with line of sight; ties break on the id so two hosts stepping the same
 * world pick the same victim.
 *
 * `piloted` is an explicit input rather than an implicit caller condition so
 * the "only when unpiloted" half of the rule is testable on its own.
 */
export function selectAutoTaserTarget(input: Readonly<{
  piloted: boolean;
  origin: readonly [number, number, number];
  candidates: readonly TaserCandidate[];
  hasLineOfSight: (from: readonly [number, number, number], to: readonly [number, number, number]) => boolean;
  rangeM?: number;
}>): TaserCandidate | null {
  if (input.piloted) return null;
  const rangeM = Number.isFinite(input.rangeM) ? Number(input.rangeM) : PILOTED_DRONE_TASER_RANGE_M;
  let best: TaserCandidate | null = null;
  let bestRange = Number.POSITIVE_INFINITY;
  for (const candidate of input.candidates) {
    const dx = candidate.position[0] - input.origin[0];
    const dy = candidate.position[1] - input.origin[1];
    const dz = candidate.position[2] - input.origin[2];
    const range = Math.hypot(dx, dy, dz);
    if (!(range <= rangeM)) continue;
    if (range > bestRange || (range === bestRange && best !== null && candidate.id >= best.id)) continue;
    if (!input.hasLineOfSight(input.origin, candidate.position)) continue;
    best = candidate;
    bestRange = range;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pure victim-side decision: what a stun actually forbids
// ---------------------------------------------------------------------------

export type TaserMovementAdmission = Readonly<{
  stunned: boolean;
  canMove: boolean;
  canSprint: boolean;
  canJump: boolean;
  remainingMs: number;
  /** 0..1 presentation strength; full at onset, decays over the stun. */
  intensity: number;
}>;

const FREE: TaserMovementAdmission = Object.freeze({
  stunned: false, canMove: true, canSprint: true, canJump: true, remainingMs: 0, intensity: 0,
});

/**
 * The one function every movement consumer asks. A stunned operator supplies
 * zero movement input - not reduced input - so a stun cannot be walked out of,
 * and sprint/jump are refused with it rather than being left as loopholes.
 */
export function taserMovementAdmission(
  stunEndsAtHostTimeMs: number,
  nowHostTimeMs: number,
  stunStartsAtHostTimeMs = stunEndsAtHostTimeMs - TASER_STUN_DURATION_MS,
): TaserMovementAdmission {
  if (!Number.isFinite(stunEndsAtHostTimeMs) || !Number.isFinite(nowHostTimeMs)) return FREE;
  const remainingMs = stunEndsAtHostTimeMs - nowHostTimeMs;
  if (remainingMs <= 0) return FREE;
  const durationMs = Math.max(1, stunEndsAtHostTimeMs - stunStartsAtHostTimeMs);
  return Object.freeze({
    stunned: true,
    canMove: false,
    canSprint: false,
    canJump: false,
    remainingMs,
    intensity: Math.max(0, Math.min(1, remainingMs / durationMs)),
  });
}

// ---------------------------------------------------------------------------
// Host authority and victim consumer (mirrors FlashHostAuthority exactly)
// ---------------------------------------------------------------------------

export class TaserHostAuthority {
  private matchEpoch: number;
  private role: TaserAuthorityRole;
  private readonly resolvedActivations = new Set<string>();
  private readonly sequences = new Map<string, number>();
  private rejectedNotHost = 0;
  private rejectedWrongEpoch = 0;
  private rejectedMalformed = 0;
  private rejectedReplay = 0;

  constructor(matchEpoch: number, role: TaserAuthorityRole) {
    this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
    this.role = role;
  }

  reset(matchEpoch: number, role: TaserAuthorityRole): void {
    this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
    this.role = role;
    this.resolvedActivations.clear();
    this.sequences.clear();
    this.rejectedNotHost = 0;
    this.rejectedWrongEpoch = 0;
    this.rejectedMalformed = 0;
    this.rejectedReplay = 0;
  }

  resolveStun(input: Readonly<{
    matchEpoch: number;
    activationId: string;
    startsAtHostTimeMs: number;
    victims: readonly TaserVictimAdmission[];
  }>): TaserShotResolution {
    const rejected = (reason: TaserShotResolution['reason']): TaserShotResolution => Object.freeze({
      accepted: false,
      reason,
      results: Object.freeze([]),
    });
    if (this.role !== 'host') {
      this.rejectedNotHost += 1;
      return rejected('not-host');
    }
    if (input.matchEpoch !== this.matchEpoch) {
      this.rejectedWrongEpoch += 1;
      return rejected('wrong-epoch');
    }
    if (!canonicalEntityId(input.activationId, TASER_MAX_ACTIVATION_ID_LENGTH) || !finiteTime(input.startsAtHostTimeMs)
      || input.victims.length > TASER_MAX_RESULTS_PER_SHOT) {
      this.rejectedMalformed += 1;
      return rejected('malformed');
    }
    if (this.resolvedActivations.has(input.activationId)) {
      this.rejectedReplay += 1;
      return rejected('replay');
    }
    const victimKeys = input.victims.map((victim) => `${victim.targetId}:${victim.targetLifeId}`);
    if (new Set(victimKeys).size !== victimKeys.length || input.victims.some((victim) => (
      !canonicalActorId(victim.targetId)
      || !boundedInteger(victim.targetLifeId, 0, 1_000_000_000)
      || !Number.isFinite(victim.durationMs) || victim.durationMs < 1 || victim.durationMs > TASER_STUN_MAX_DURATION_MS
    ))) {
      this.rejectedMalformed += 1;
      return rejected('malformed');
    }

    this.resolvedActivations.add(input.activationId);
    const results = input.victims.map((victim) => {
      const victimKey = `${victim.targetId}:${victim.targetLifeId}`;
      const sequence = (this.sequences.get(victimKey) ?? 0) + 1;
      this.sequences.set(victimKey, sequence);
      const durationMs = Math.max(1, Math.min(TASER_STUN_MAX_DURATION_MS, Math.round(victim.durationMs)));
      return Object.freeze({
        schemaVersion: TASER_AUTHORITY_SCHEMA_VERSION,
        matchEpoch: this.matchEpoch,
        resultId: `${input.activationId}:target:${victim.targetId}:${victim.targetLifeId}`,
        activationId: input.activationId,
        targetId: victim.targetId,
        targetLifeId: victim.targetLifeId,
        sequence,
        startsAtHostTimeMs: input.startsAtHostTimeMs,
        endsAtHostTimeMs: input.startsAtHostTimeMs + durationMs,
      });
    });
    return Object.freeze({ accepted: true, reason: 'accepted', results: Object.freeze(results) });
  }

  telemetry(): Readonly<{
    role: TaserAuthorityRole;
    matchEpoch: number;
    resolvedActivations: number;
    victimLives: number;
    rejectedNotHost: number;
    rejectedWrongEpoch: number;
    rejectedMalformed: number;
    rejectedReplay: number;
  }> {
    return Object.freeze({
      role: this.role,
      matchEpoch: this.matchEpoch,
      resolvedActivations: this.resolvedActivations.size,
      victimLives: this.sequences.size,
      rejectedNotHost: this.rejectedNotHost,
      rejectedWrongEpoch: this.rejectedWrongEpoch,
      rejectedMalformed: this.rejectedMalformed,
      rejectedReplay: this.rejectedReplay,
    });
  }
}

export class TaserVictimResultConsumer {
  private matchEpoch: number;
  private targetId: string;
  private targetLifeId: number;
  private lastSequence = 0;
  private readonly resultIds = new Set<string>();
  private accepted = 0;
  private rejected: Record<Exclude<TaserResultAdmission['reason'], 'accepted'>, number> = {
    malformed: 0,
    'wrong-epoch': 0,
    'wrong-target': 0,
    'stale-life': 0,
    duplicate: 0,
    'out-of-order': 0,
    expired: 0,
  };

  constructor(matchEpoch: number, targetId: string, targetLifeId: number) {
    this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
    this.targetId = targetId;
    this.targetLifeId = Math.max(0, Math.floor(targetLifeId));
  }

  reset(matchEpoch: number, targetId: string, targetLifeId: number): void {
    this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
    this.targetId = targetId;
    this.targetLifeId = Math.max(0, Math.floor(targetLifeId));
    this.lastSequence = 0;
    this.resultIds.clear();
    this.accepted = 0;
    for (const reason of Object.keys(this.rejected) as Array<keyof typeof this.rejected>) this.rejected[reason] = 0;
  }

  admit(result: TaserStunResult, estimatedHostNowMs: number): TaserResultAdmission {
    const reject = (reason: Exclude<TaserResultAdmission['reason'], 'accepted'>): TaserResultAdmission => {
      this.rejected[reason] += 1;
      return Object.freeze({ accepted: false, reason, remainingDurationMs: 0 });
    };
    if (!isTaserStunResult(result) || !finiteTime(estimatedHostNowMs)) return reject('malformed');
    if (result.matchEpoch !== this.matchEpoch) return reject('wrong-epoch');
    if (result.targetId !== this.targetId) return reject('wrong-target');
    if (result.targetLifeId !== this.targetLifeId) return reject('stale-life');
    if (this.resultIds.has(result.resultId)) return reject('duplicate');
    if (result.sequence !== this.lastSequence + 1) return reject('out-of-order');

    this.lastSequence = result.sequence;
    this.resultIds.add(result.resultId);
    while (this.resultIds.size > TASER_MAX_REMEMBERED_RESULTS_PER_LIFE) {
      const oldest = this.resultIds.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.resultIds.delete(oldest);
    }
    const remainingDurationMs = Math.max(0, result.endsAtHostTimeMs - estimatedHostNowMs);
    if (remainingDurationMs <= 0) return reject('expired');
    this.accepted += 1;
    return Object.freeze({ accepted: true, reason: 'accepted', remainingDurationMs });
  }

  telemetry(): Readonly<{
    matchEpoch: number;
    targetId: string;
    targetLifeId: number;
    lastSequence: number;
    rememberedResults: number;
    accepted: number;
    rejected: Readonly<Record<Exclude<TaserResultAdmission['reason'], 'accepted'>, number>>;
  }> {
    return Object.freeze({
      matchEpoch: this.matchEpoch,
      targetId: this.targetId,
      targetLifeId: this.targetLifeId,
      lastSequence: this.lastSequence,
      rememberedResults: this.resultIds.size,
      accepted: this.accepted,
      rejected: Object.freeze({ ...this.rejected }),
    });
  }
}
