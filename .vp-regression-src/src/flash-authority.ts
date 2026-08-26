export const FLASH_AUTHORITY_SCHEMA_VERSION = 1;
export const FLASH_INTENSITY_QUANTA = 1_000;
export const FLASH_MAX_DURATION_MS = 2_800;
export const FLASH_MAX_RESULTS_PER_DETONATION = 16;
export const FLASH_MAX_REMEMBERED_RESULTS_PER_LIFE = 64;
const FLASH_MAX_ACTIVATION_ID_LENGTH = 128;

export type FlashAuthorityRole = 'host' | 'replica';

export type FlashVictimAdmission = Readonly<{
  targetId: string;
  targetLifeId: number;
  intensity: number;
  durationMs: number;
}>;

export type FlashResult = Readonly<{
  schemaVersion: typeof FLASH_AUTHORITY_SCHEMA_VERSION;
  matchEpoch: number;
  resultId: string;
  activationId: string;
  targetId: string;
  targetLifeId: number;
  sequence: number;
  intensityQ: number;
  startsAtHostTimeMs: number;
  endsAtHostTimeMs: number;
}>;

export type FlashDetonationResolution = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'not-host' | 'wrong-epoch' | 'malformed' | 'replay';
  results: readonly FlashResult[];
}>;

export type FlashResultAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'malformed' | 'wrong-epoch' | 'wrong-target' | 'stale-life'
    | 'duplicate' | 'out-of-order' | 'expired';
  intensity: number;
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

function quantizeIntensity(value: number): number {
  return Math.max(1, Math.min(FLASH_INTENSITY_QUANTA, Math.round(value * FLASH_INTENSITY_QUANTA)));
}

function freezeResult(result: FlashResult): FlashResult {
  return Object.freeze({ ...result });
}

export function flashActivationId(matchEpoch: number, ownerId: string, actionNonce: number): string {
  return `flash:${matchEpoch}:${ownerId}:${actionNonce}`;
}

export function isFlashResult(value: unknown): value is FlashResult {
  if (!isRecord(value)
    || !exactKeys(value, [
      'schemaVersion', 'matchEpoch', 'resultId', 'activationId', 'targetId', 'targetLifeId', 'sequence',
      'intensityQ', 'startsAtHostTimeMs', 'endsAtHostTimeMs',
    ])
    || value.schemaVersion !== FLASH_AUTHORITY_SCHEMA_VERSION
    || !boundedInteger(value.matchEpoch, 1, 1_000_000_000)
    || !canonicalEntityId(value.resultId)
    || !canonicalEntityId(value.activationId, FLASH_MAX_ACTIVATION_ID_LENGTH)
    || !canonicalActorId(value.targetId)
    || !boundedInteger(value.targetLifeId, 0, 1_000_000_000)
    || !boundedInteger(value.sequence, 1, 1_000_000_000)
    || !boundedInteger(value.intensityQ, 1, FLASH_INTENSITY_QUANTA)
    || !finiteTime(value.startsAtHostTimeMs)
    || !finiteTime(value.endsAtHostTimeMs)) return false;
  const durationMs = Number(value.endsAtHostTimeMs) - Number(value.startsAtHostTimeMs);
  return durationMs >= 1 && durationMs <= FLASH_MAX_DURATION_MS;
}

export class FlashHostAuthority {
  private matchEpoch: number;
  private role: FlashAuthorityRole;
  private readonly resolvedActivations = new Set<string>();
  private readonly sequences = new Map<string, number>();
  private rejectedNotHost = 0;
  private rejectedWrongEpoch = 0;
  private rejectedMalformed = 0;
  private rejectedReplay = 0;

  constructor(matchEpoch: number, role: FlashAuthorityRole) {
    this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
    this.role = role;
  }

  reset(matchEpoch: number, role: FlashAuthorityRole): void {
    this.matchEpoch = Math.max(1, Math.floor(matchEpoch));
    this.role = role;
    this.resolvedActivations.clear();
    this.sequences.clear();
    this.rejectedNotHost = 0;
    this.rejectedWrongEpoch = 0;
    this.rejectedMalformed = 0;
    this.rejectedReplay = 0;
  }

  resolveDetonation(input: Readonly<{
    matchEpoch: number;
    activationId: string;
    startsAtHostTimeMs: number;
    victims: readonly FlashVictimAdmission[];
  }>): FlashDetonationResolution {
    const rejected = (reason: FlashDetonationResolution['reason']): FlashDetonationResolution => Object.freeze({
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
    if (!canonicalEntityId(input.activationId, FLASH_MAX_ACTIVATION_ID_LENGTH) || !finiteTime(input.startsAtHostTimeMs)
      || input.victims.length > FLASH_MAX_RESULTS_PER_DETONATION) {
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
      || !Number.isFinite(victim.intensity) || victim.intensity <= 0 || victim.intensity > 1
      || !Number.isFinite(victim.durationMs) || victim.durationMs < 1 || victim.durationMs > FLASH_MAX_DURATION_MS
    ))) {
      this.rejectedMalformed += 1;
      return rejected('malformed');
    }

    this.resolvedActivations.add(input.activationId);
    const results = input.victims.map((victim) => {
      const victimKey = `${victim.targetId}:${victim.targetLifeId}`;
      const sequence = (this.sequences.get(victimKey) ?? 0) + 1;
      this.sequences.set(victimKey, sequence);
      const durationMs = Math.max(1, Math.min(FLASH_MAX_DURATION_MS, Math.round(victim.durationMs)));
      return freezeResult({
        schemaVersion: FLASH_AUTHORITY_SCHEMA_VERSION,
        matchEpoch: this.matchEpoch,
        resultId: `${input.activationId}:target:${victim.targetId}:${victim.targetLifeId}`,
        activationId: input.activationId,
        targetId: victim.targetId,
        targetLifeId: victim.targetLifeId,
        sequence,
        intensityQ: quantizeIntensity(victim.intensity),
        startsAtHostTimeMs: input.startsAtHostTimeMs,
        endsAtHostTimeMs: input.startsAtHostTimeMs + durationMs,
      });
    });
    return Object.freeze({ accepted: true, reason: 'accepted', results: Object.freeze(results) });
  }

  telemetry(): Readonly<{
    role: FlashAuthorityRole;
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

export class FlashVictimResultConsumer {
  private matchEpoch: number;
  private targetId: string;
  private targetLifeId: number;
  private lastSequence = 0;
  private readonly resultIds = new Set<string>();
  private accepted = 0;
  private rejected: Record<Exclude<FlashResultAdmission['reason'], 'accepted'>, number> = {
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

  admit(result: FlashResult, estimatedHostNowMs: number): FlashResultAdmission {
    const reject = (reason: Exclude<FlashResultAdmission['reason'], 'accepted'>): FlashResultAdmission => {
      this.rejected[reason] += 1;
      return Object.freeze({ accepted: false, reason, intensity: 0, remainingDurationMs: 0 });
    };
    if (!isFlashResult(result) || !finiteTime(estimatedHostNowMs)) return reject('malformed');
    if (result.matchEpoch !== this.matchEpoch) return reject('wrong-epoch');
    if (result.targetId !== this.targetId) return reject('wrong-target');
    if (result.targetLifeId !== this.targetLifeId) return reject('stale-life');
    if (this.resultIds.has(result.resultId)) return reject('duplicate');
    if (result.sequence !== this.lastSequence + 1) return reject('out-of-order');

    this.lastSequence = result.sequence;
    this.resultIds.add(result.resultId);
    while (this.resultIds.size > FLASH_MAX_REMEMBERED_RESULTS_PER_LIFE) {
      const oldest = this.resultIds.values().next().value as string | undefined;
      if (oldest === undefined) break;
      this.resultIds.delete(oldest);
    }
    const remainingDurationMs = Math.max(0, result.endsAtHostTimeMs - estimatedHostNowMs);
    if (remainingDurationMs <= 0) return reject('expired');
    this.accepted += 1;
    return Object.freeze({
      accepted: true,
      reason: 'accepted',
      intensity: result.intensityQ / FLASH_INTENSITY_QUANTA,
      remainingDurationMs,
    });
  }

  telemetry(): Readonly<{
    matchEpoch: number;
    targetId: string;
    targetLifeId: number;
    lastSequence: number;
    rememberedResults: number;
    accepted: number;
    rejected: Readonly<Record<Exclude<FlashResultAdmission['reason'], 'accepted'>, number>>;
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
