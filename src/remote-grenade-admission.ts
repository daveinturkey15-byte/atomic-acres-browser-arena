import { MULTIPLAYER_PROTOCOL_VERSION, type GrenadeId, type GrenadeThrowMessage, type PlayerSnapshot } from './protocol';

export const REMOTE_GRENADE_MIN_FUSE_MS = 1_800;
export const REMOTE_GRENADE_MAX_FUSE_MS = 3_400;
export const REMOTE_SEMTEX_MIN_FUSE_MS = 900;
export const REMOTE_SEMTEX_MAX_FUSE_MS = 5_200;
export const REMOTE_GRENADE_MAX_TRAVEL = 36;
const REMOTE_GRENADE_ORIGIN_TOLERANCE = 2.4;
const REMOTE_GRENADE_MAX_VELOCITY = 20;

type RemoteGrenadeAction = Readonly<{
  grenade: GrenadeId;
  lifeId: number;
  actionSequence: number;
  origin: readonly [number, number, number];
  thrownAt: number;
  explosionOrigin: readonly [number, number, number] | null;
  targets: readonly string[];
}>;

export type RemoteGrenadeAuthorityState = Readonly<{
  remaining: number;
  selectedGrenade: GrenadeId | null;
  lifeId: number | null;
  highestActionSequence: number;
  actions: Readonly<Record<number, RemoteGrenadeAction>>;
}>;

export function createRemoteGrenadeAuthorityState(selectedGrenade: GrenadeId | null = null): RemoteGrenadeAuthorityState {
  return { remaining: 1, selectedGrenade, lifeId: null, highestActionSequence: -1, actions: {} };
}

export function resetRemoteGrenadeAuthorityState(): RemoteGrenadeAuthorityState {
  return createRemoteGrenadeAuthorityState();
}

/** Stops new throws for a dead life while retaining already-thrown ordnance. */
export function recordRemoteGrenadeDeath(state: RemoteGrenadeAuthorityState): RemoteGrenadeAuthorityState {
  return { ...state, remaining: 0 };
}

function unexpiredRemoteGrenadeActions(
  state: RemoteGrenadeAuthorityState,
  now: number,
): Readonly<Record<number, RemoteGrenadeAction>> {
  if (!Number.isFinite(now)) return {};
  return Object.fromEntries(Object.entries(state.actions)
    .filter(([, action]) => now - action.thrownAt <= REMOTE_SEMTEX_MAX_FUSE_MS));
}

/** Starts a new life without erasing still-live ordnance thrown by the prior life. */
export function recordRemoteGrenadeRespawn(
  state: RemoteGrenadeAuthorityState,
  selectedGrenade: GrenadeId,
  now: number,
): RemoteGrenadeAuthorityState {
  return {
    remaining: 1,
    selectedGrenade,
    lifeId: null,
    highestActionSequence: -1,
    actions: unexpiredRemoteGrenadeActions(state, now),
  };
}

export function replenishRemoteGrenadeAuthorityState(
  state: RemoteGrenadeAuthorityState,
  amount = 1,
): RemoteGrenadeAuthorityState {
  if (!Number.isFinite(amount) || amount <= 0) return state;
  return { ...state, remaining: Math.min(1, state.remaining + Math.floor(amount)) };
}

export function admitRemoteGrenadeThrow(
  state: RemoteGrenadeAuthorityState,
  message: GrenadeThrowMessage,
  sender: PlayerSnapshot | undefined,
  now: number,
): { accepted: boolean; state: RemoteGrenadeAuthorityState } {
  if (message.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION
    || !sender || sender.id !== message.by || sender.hp <= 0 || state.remaining <= 0 || !Number.isFinite(now)
    || sender.grenade !== message.grenade
    || state.selectedGrenade !== null && state.selectedGrenade !== message.grenade
    || state.lifeId !== null && state.lifeId !== message.lifeId
    || message.actionSequence <= state.highestActionSequence
    || state.highestActionSequence >= 0 && message.actionSequence - state.highestActionSequence > 128) {
    return { accepted: false, state };
  }
  if (state.actions[message.actionNonce]) return { accepted: false, state };
  const originDistance = Math.hypot(
    message.origin[0] - sender.x,
    message.origin[1] - sender.y,
    message.origin[2] - sender.z,
  );
  const velocity = Math.hypot(...message.velocity);
  if (originDistance > REMOTE_GRENADE_ORIGIN_TOLERANCE || velocity <= 0 || velocity > REMOTE_GRENADE_MAX_VELOCITY) {
    return { accepted: false, state };
  }
  const activeActions = unexpiredRemoteGrenadeActions(state, now);
  return {
    accepted: true,
    state: {
      remaining: state.remaining - 1,
      selectedGrenade: message.grenade,
      lifeId: message.lifeId,
      highestActionSequence: message.actionSequence,
      actions: {
        ...activeActions,
        [message.actionNonce]: {
          grenade: message.grenade,
          lifeId: message.lifeId,
          actionSequence: message.actionSequence,
          origin: message.origin,
          thrownAt: now,
          explosionOrigin: null,
          targets: [],
        },
      },
    },
  };
}

export function admitRemoteGrenadeExplosion(
  state: RemoteGrenadeAuthorityState,
  input: Readonly<{
    actionNonce: number;
    explosionOrigin: readonly [number, number, number];
    now: number;
  }>,
): { accepted: boolean; state: RemoteGrenadeAuthorityState } {
  const action = state.actions[input.actionNonce];
  if (!action || !Number.isFinite(input.now)) return { accepted: false, state };
  const age = input.now - action.thrownAt;
  const minimumFuseMs = action.grenade === 'semtex' ? REMOTE_SEMTEX_MIN_FUSE_MS : REMOTE_GRENADE_MIN_FUSE_MS;
  const maximumFuseMs = action.grenade === 'semtex' ? REMOTE_SEMTEX_MAX_FUSE_MS : REMOTE_GRENADE_MAX_FUSE_MS;
  if (age < minimumFuseMs || age > maximumFuseMs) return { accepted: false, state };
  if (Math.hypot(
    input.explosionOrigin[0] - action.origin[0],
    input.explosionOrigin[1] - action.origin[1],
    input.explosionOrigin[2] - action.origin[2],
  ) > REMOTE_GRENADE_MAX_TRAVEL) return { accepted: false, state };
  if (action.explosionOrigin && Math.hypot(
    input.explosionOrigin[0] - action.explosionOrigin[0],
    input.explosionOrigin[1] - action.explosionOrigin[1],
    input.explosionOrigin[2] - action.explosionOrigin[2],
  ) > 0.01) return { accepted: false, state };
  const nextAction: RemoteGrenadeAction = {
    ...action,
    explosionOrigin: action.explosionOrigin ?? input.explosionOrigin,
  };
  return {
    accepted: true,
    state: { ...state, actions: { ...state.actions, [input.actionNonce]: nextAction } },
  };
}

export function admitRemoteGrenadeHit(
  state: RemoteGrenadeAuthorityState,
  input: Readonly<{
    actionNonce: number;
    explosionOrigin: readonly [number, number, number];
    target: string;
    now: number;
  }>,
): { accepted: boolean; state: RemoteGrenadeAuthorityState } {
  const action = state.actions[input.actionNonce];
  if (!action || (action.grenade !== 'frag' && action.grenade !== 'semtex') || input.target.length === 0 || action.targets.includes(input.target)) {
    return { accepted: false, state };
  }
  const explosion = admitRemoteGrenadeExplosion(state, input);
  if (!explosion.accepted) return { accepted: false, state };
  const admittedAction = explosion.state.actions[input.actionNonce]!;
  const nextAction: RemoteGrenadeAction = {
    ...admittedAction,
    targets: [...admittedAction.targets, input.target],
  };
  return {
    accepted: true,
    state: { ...explosion.state, actions: { ...explosion.state.actions, [input.actionNonce]: nextAction } },
  };
}

export function remoteGrenadeForAction(state: RemoteGrenadeAuthorityState, actionNonce: number): GrenadeId | null {
  return state.actions[actionNonce]?.grenade ?? null;
}

export function remoteGrenadeLifeForAction(state: RemoteGrenadeAuthorityState, actionNonce: number): number | null {
  return state.actions[actionNonce]?.lifeId ?? null;
}
