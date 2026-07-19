import type { GrenadeThrowMessage, PlayerSnapshot } from './protocol';

export const REMOTE_GRENADE_MIN_FUSE_MS = 1_800;
export const REMOTE_GRENADE_MAX_FUSE_MS = 3_400;
export const REMOTE_GRENADE_MAX_TRAVEL = 36;
const REMOTE_GRENADE_ORIGIN_TOLERANCE = 2.4;
const REMOTE_GRENADE_MAX_VELOCITY = 20;

type RemoteGrenadeAction = Readonly<{
  origin: readonly [number, number, number];
  thrownAt: number;
  explosionOrigin: readonly [number, number, number] | null;
  targets: readonly string[];
}>;

export type RemoteGrenadeAuthorityState = Readonly<{
  remaining: number;
  actions: Readonly<Record<number, RemoteGrenadeAction>>;
}>;

export function createRemoteGrenadeAuthorityState(): RemoteGrenadeAuthorityState {
  return { remaining: 2, actions: {} };
}

export function resetRemoteGrenadeAuthorityState(): RemoteGrenadeAuthorityState {
  return createRemoteGrenadeAuthorityState();
}

export function admitRemoteGrenadeThrow(
  state: RemoteGrenadeAuthorityState,
  message: GrenadeThrowMessage,
  sender: PlayerSnapshot | undefined,
  now: number,
): { accepted: boolean; state: RemoteGrenadeAuthorityState } {
  if (!sender || sender.id !== message.by || sender.hp <= 0 || state.remaining <= 0 || !Number.isFinite(now)) {
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
  const activeActions = Object.fromEntries(Object.entries(state.actions)
    .filter(([, action]) => now - action.thrownAt <= REMOTE_GRENADE_MAX_FUSE_MS));
  return {
    accepted: true,
    state: {
      remaining: state.remaining - 1,
      actions: {
        ...activeActions,
        [message.actionNonce]: { origin: message.origin, thrownAt: now, explosionOrigin: null, targets: [] },
      },
    },
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
  if (!action || !Number.isFinite(input.now) || input.target.length === 0) return { accepted: false, state };
  const age = input.now - action.thrownAt;
  if (age < REMOTE_GRENADE_MIN_FUSE_MS || age > REMOTE_GRENADE_MAX_FUSE_MS || action.targets.includes(input.target)) {
    return { accepted: false, state };
  }
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
    targets: [...action.targets, input.target],
  };
  return {
    accepted: true,
    state: { ...state, actions: { ...state.actions, [input.actionNonce]: nextAction } },
  };
}
