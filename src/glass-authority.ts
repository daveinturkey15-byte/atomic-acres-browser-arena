export const GLASS_AUTHORITY_SCHEMA_VERSION = 1;
export const GLASS_MAX_REMEMBERED_IMPACTS = 64;

export type GlassPhase = 'intact' | 'cracked' | 'breached' | 'detached';
export type GlassImpactProfile = 'knife' | 'bullet' | 'explosion';

export const GLASS_DAMAGE_PROFILE_Q: Readonly<Record<GlassImpactProfile, number>> = Object.freeze({
  knife: 350,
  bullet: 1_000,
  explosion: 2_000,
});

export const GLASS_CRACK_DAMAGE_Q = 350;
export const GLASS_BREACH_DAMAGE_Q = 1_000;
export const GLASS_DETACH_DAMAGE_Q = 1_600;

export type GlassState = Readonly<{
  schemaVersion: typeof GLASS_AUTHORITY_SCHEMA_VERSION;
  paneId: string;
  matchEpoch: number;
  revision: number;
  phase: GlassPhase;
  damageQ: number;
  lastMutationTick: number;
  breachRevision: number | null;
  breachTick: number | null;
  rememberedImpactIds: readonly string[];
}>;

export type GlassImpactAdmission = Readonly<{
  accepted: boolean;
  reason: 'accepted' | 'not-host' | 'wrong-epoch' | 'stale-revision' | 'malformed' | 'replay' | 'already-detached';
  state: GlassState;
}>;

export type GlassAuthorityProjection = Readonly<{
  phase: GlassPhase;
  paneVisible: boolean;
  crackOverlayVisible: boolean;
  apertureOpen: boolean;
  movementSolid: boolean;
  ballisticSolid: boolean;
  aiLineOfSightSolid: boolean;
}>;

function canonicalId(value: string, maximum = 128): boolean {
  return value.length > 0 && value.length <= maximum && /^[a-zA-Z0-9:_.|-]+$/.test(value);
}

function finiteTick(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function freezeState(state: GlassState): GlassState {
  return Object.freeze({
    ...state,
    rememberedImpactIds: Object.freeze([...state.rememberedImpactIds]),
  });
}

export function createGlassState(paneId: string, matchEpoch: number): GlassState {
  if (!canonicalId(paneId) || !Number.isSafeInteger(matchEpoch) || matchEpoch < 1) {
    throw new TypeError('Invalid glass authority identity');
  }
  return freezeState({
    schemaVersion: GLASS_AUTHORITY_SCHEMA_VERSION,
    paneId,
    matchEpoch,
    revision: 0,
    phase: 'intact',
    damageQ: 0,
    lastMutationTick: 0,
    breachRevision: null,
    breachTick: null,
    rememberedImpactIds: [],
  });
}

export function glassAuthorityProjection(state: GlassState): GlassAuthorityProjection {
  const apertureOpen = state.phase === 'breached' || state.phase === 'detached';
  return Object.freeze({
    phase: state.phase,
    paneVisible: state.phase !== 'breached' && state.phase !== 'detached',
    crackOverlayVisible: state.phase === 'cracked',
    apertureOpen,
    movementSolid: !apertureOpen,
    ballisticSolid: !apertureOpen,
    aiLineOfSightSolid: !apertureOpen,
  });
}

export function admitGlassImpact(
  state: GlassState,
  request: Readonly<{
    isHost: boolean;
    matchEpoch: number;
    expectedRevision: number;
    impactId: string;
    tick: number;
    profile: GlassImpactProfile;
    damageQ?: number;
  }>,
): GlassImpactAdmission {
  const reject = (reason: Exclude<GlassImpactAdmission['reason'], 'accepted'>): GlassImpactAdmission => (
    Object.freeze({ accepted: false, reason, state })
  );
  if (!request.isHost) return reject('not-host');
  if (request.matchEpoch !== state.matchEpoch) return reject('wrong-epoch');
  if (request.expectedRevision !== state.revision) return reject('stale-revision');
  if (state.phase === 'detached') return reject('already-detached');
  const damageQ = request.damageQ ?? GLASS_DAMAGE_PROFILE_Q[request.profile];
  if (!canonicalId(request.impactId, 192) || !finiteTick(request.tick)
    || !Object.hasOwn(GLASS_DAMAGE_PROFILE_Q, request.profile)
    || !Number.isSafeInteger(damageQ) || damageQ < 1 || damageQ > 10_000) return reject('malformed');
  if (state.rememberedImpactIds.includes(request.impactId)) return reject('replay');

  const totalDamageQ = Math.min(10_000, state.damageQ + damageQ);
  const phase: GlassPhase = totalDamageQ >= GLASS_DETACH_DAMAGE_Q
    ? 'detached'
    : totalDamageQ >= GLASS_BREACH_DAMAGE_Q
      ? 'breached'
      : totalDamageQ >= GLASS_CRACK_DAMAGE_Q ? 'cracked' : 'intact';
  const revision = state.revision + 1;
  const newlyBreached = (phase === 'breached' || phase === 'detached')
    && state.phase !== 'breached';
  const rememberedImpactIds = [...state.rememberedImpactIds, request.impactId]
    .slice(-GLASS_MAX_REMEMBERED_IMPACTS);
  const next = freezeState({
    ...state,
    revision,
    phase,
    damageQ: totalDamageQ,
    lastMutationTick: request.tick,
    breachRevision: newlyBreached ? revision : state.breachRevision,
    breachTick: newlyBreached ? request.tick : state.breachTick,
    rememberedImpactIds,
  });
  return Object.freeze({ accepted: true, reason: 'accepted', state: next });
}

export type GlassProjectileAdmission = Readonly<{
  passes: boolean;
  reason: 'existing-breach' | 'same-tick-admitted-breach' | 'solid-glass' | 'stale-observation' | 'wrong-epoch' | 'malformed';
}>;

/**
 * Crossbow bolts never manufacture an aperture. They may traverse only a
 * revision they actually observed: an older breach or a host-admitted breach
 * from the same simulation tick. This makes projectile ordering explicit.
 */
export function admitCrossbowThroughGlass(
  state: GlassState,
  request: Readonly<{ matchEpoch: number; observedRevision: number; tick: number }>,
): GlassProjectileAdmission {
  if (request.matchEpoch !== state.matchEpoch) return Object.freeze({ passes: false, reason: 'wrong-epoch' });
  if (!finiteTick(request.tick) || !Number.isSafeInteger(request.observedRevision) || request.observedRevision < 0) {
    return Object.freeze({ passes: false, reason: 'malformed' });
  }
  if (request.observedRevision !== state.revision) return Object.freeze({ passes: false, reason: 'stale-observation' });
  if (state.phase !== 'breached' && state.phase !== 'detached') {
    return Object.freeze({ passes: false, reason: 'solid-glass' });
  }
  const sameTick = state.breachTick === request.tick && state.breachRevision === request.observedRevision;
  return Object.freeze({
    passes: true,
    reason: sameTick ? 'same-tick-admitted-breach' : 'existing-breach',
  });
}
