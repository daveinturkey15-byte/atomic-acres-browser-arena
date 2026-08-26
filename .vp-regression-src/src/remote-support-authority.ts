import type { Pass65KillstreakId } from './killstreak-catalog';
import type { OffensiveSupportSource, SupportActivateMessage } from './protocol';

const SUPPORT_WINDOW_MS: Record<OffensiveSupportSource, number> = {
  yardhawk: 10_000,
  'tri-pass': 30_000,
  'hunter-swarm': 20_000,
  nuke: 10_000,
};

const SUPPORT_BLAST_LIMIT: Record<OffensiveSupportSource, number> = {
  yardhawk: 1,
  'tri-pass': 3,
  'hunter-swarm': 5,
  nuke: 1,
};

const SUPPORT_MIN_IMPACT_DELAY_MS: Record<OffensiveSupportSource, number> = {
  yardhawk: 400,
  'tri-pass': 500,
  'hunter-swarm': 100,
  nuke: 4_500,
};

const SUPPORT_ACTIVATION_PROOF_WINDOW_MS = 5_000;

type PendingSupportActivation = Readonly<{
  source: OffensiveSupportSource;
  canonicalActivationId: string;
  registeredAt: number;
  expiresAt: number;
}>;

type SupportAuthorization = Readonly<{
  canonicalActivationId: string;
  activationNonce: number;
  activatedAt: number;
  expiresAt: number;
  effectOrigins: readonly (readonly [number, number, number])[];
  targetIds: readonly string[];
  targetsByOrigin: Readonly<Record<string, readonly string[]>>;
}>;

export type RemoteSupportAuthorityState = Readonly<{
  pending: Readonly<Record<string, PendingSupportActivation>>;
  authorizations: Readonly<Partial<Record<OffensiveSupportSource, SupportAuthorization>>>;
}>;

export function isLegacyOffensiveSupport(id: Pass65KillstreakId): id is OffensiveSupportSource {
  return id === 'yardhawk' || id === 'tri-pass' || id === 'hunter-swarm' || id === 'nuke';
}

export function createRemoteSupportAuthorityState(): RemoteSupportAuthorityState {
  return { pending: {}, authorizations: {} };
}

/**
 * Registers proof only after HostKillstreakRuntime has consumed the actor's
 * frozen-loadout reward. The peer-provided request ID is merely a correlation
 * key; the host-generated canonical ID remains the authority identity.
 */
export function registerRemoteSupportActivation(
  state: RemoteSupportAuthorityState,
  input: Readonly<{
    activationRequestId: string;
    canonicalActivationId: string;
    source: OffensiveSupportSource;
    now: number;
  }>,
): RemoteSupportAuthorityState {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.activationRequestId)
    || !/^ks-activation-[0-9]+-[0-9]+$/.test(input.canonicalActivationId)
    || !Number.isFinite(input.now)) return state;
  const pending = Object.fromEntries(Object.entries(state.pending)
    .filter(([, proof]) => proof.expiresAt >= input.now));
  pending[input.activationRequestId] = Object.freeze({
    source: input.source,
    canonicalActivationId: input.canonicalActivationId,
    registeredAt: input.now,
    expiresAt: input.now + SUPPORT_ACTIVATION_PROOF_WINDOW_MS,
  });
  return { ...state, pending };
}

export function recordRemoteSupportDeath(state: RemoteSupportAuthorityState): RemoteSupportAuthorityState {
  // A death cancels an unconfirmed compatibility hand-off, but an already
  // admitted support effect remains valid for its bounded lifetime.
  return { ...state, pending: {} };
}

export function admitRemoteSupportActivation(
  state: RemoteSupportAuthorityState,
  message: SupportActivateMessage,
  now: number,
): { accepted: boolean; state: RemoteSupportAuthorityState } {
  if (!Number.isFinite(now) || !Number.isFinite(message.activationNonce)) return { accepted: false, state };
  const proof = state.pending[message.activationRequestId];
  if (!proof || proof.source !== message.source || now < proof.registeredAt || now > proof.expiresAt) {
    return { accepted: false, state };
  }
  const pending = { ...state.pending };
  delete pending[message.activationRequestId];
  return {
    accepted: true,
    state: {
      pending,
      authorizations: {
        ...state.authorizations,
        [message.source]: {
          canonicalActivationId: proof.canonicalActivationId,
          activationNonce: message.activationNonce,
          activatedAt: now,
          expiresAt: now + SUPPORT_WINDOW_MS[message.source],
          effectOrigins: message.effectOrigins,
          targetIds: message.targetIds,
          targetsByOrigin: {},
        },
      },
    },
  };
}

function originKey(origin: readonly [number, number, number]): string {
  return origin.map((value) => value.toFixed(3)).join(':');
}

export function admitRemoteSupportHit(
  state: RemoteSupportAuthorityState,
  input: Readonly<{
    source: OffensiveSupportSource;
    activationNonce: number;
    origin: readonly [number, number, number];
    target: string;
    now: number;
  }>,
): { accepted: boolean; state: RemoteSupportAuthorityState } {
  const authorization = state.authorizations[input.source];
  if (!authorization
    || authorization.activationNonce !== input.activationNonce
    || !Number.isFinite(input.now)
    || input.now < authorization.activatedAt + SUPPORT_MIN_IMPACT_DELAY_MS[input.source]
    || input.now > authorization.expiresAt
    || input.target.length === 0) return { accepted: false, state };
  if (input.source === 'nuke' && Math.hypot(input.origin[0], input.origin[1] - 1.5, input.origin[2]) > 0.1) {
    return { accepted: false, state };
  }
  if (input.source === 'tri-pass' && !authorization.effectOrigins.some((origin) => Math.hypot(
    input.origin[0] - origin[0], input.origin[1] - origin[1], input.origin[2] - origin[2],
  ) <= 0.01)) return { accepted: false, state };
  if ((input.source === 'yardhawk' || input.source === 'hunter-swarm')
    && !authorization.targetIds.includes(input.target)) return { accepted: false, state };

  const key = originKey(input.origin);
  const existingTargets = authorization.targetsByOrigin[key] ?? [];
  if (existingTargets.includes(input.target)) return { accepted: false, state };
  const originCount = Object.keys(authorization.targetsByOrigin).length;
  if (existingTargets.length === 0 && originCount >= SUPPORT_BLAST_LIMIT[input.source]) return { accepted: false, state };

  const nextAuthorization: SupportAuthorization = {
    ...authorization,
    targetsByOrigin: {
      ...authorization.targetsByOrigin,
      [key]: [...existingTargets, input.target],
    },
  };
  return {
    accepted: true,
    state: {
      ...state,
      authorizations: { ...state.authorizations, [input.source]: nextAuthorization },
    },
  };
}
