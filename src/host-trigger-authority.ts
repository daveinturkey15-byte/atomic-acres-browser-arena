import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type PlayerSnapshot,
  type TriggerStateMessage,
  type WeaponId,
} from './protocol';

export type HostTriggerAuthorityState = Readonly<{
  connectionEpoch: string;
  lifeId: number;
  weapon: WeaponId;
  pressed: boolean;
  pressedAtHostTimeMs: number | null;
  highestActionSequence: number;
}>;

export type HostTriggerAdmissionContext = Readonly<{
  expectedConnectionEpoch: string;
  expectedLifeId: number;
  shooterAlive: boolean;
}>;

export type HostTriggerAdmissionReason =
  | 'accepted'
  | 'protocol-mismatch'
  | 'unknown-sender'
  | 'connection-epoch-mismatch'
  | 'life-mismatch'
  | 'shooter-dead'
  | 'weapon-mismatch'
  | 'duplicate-sequence'
  | 'duplicate-edge';

export type HostTriggerAdmission = Readonly<{
  accepted: boolean;
  reason: HostTriggerAdmissionReason;
  state: HostTriggerAuthorityState | undefined;
}>;

export type HostTriggerResetReason =
  | 'connection-epoch'
  | 'weapon-switch'
  | 'death'
  | 'disconnect'
  | 'respawn'
  | 'match-reset';

export function admitHostTriggerState(
  message: TriggerStateMessage,
  sender: PlayerSnapshot | undefined,
  receivedAtHostTimeMs: number,
  state: HostTriggerAuthorityState | undefined,
  context: HostTriggerAdmissionContext,
): HostTriggerAdmission {
  const reject = (reason: Exclude<HostTriggerAdmissionReason, 'accepted'>): HostTriggerAdmission => ({
    accepted: false,
    reason,
    state,
  });
  if (message.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION) return reject('protocol-mismatch');
  if (!sender || sender.id !== message.by) return reject('unknown-sender');
  if (message.connectionEpoch !== context.expectedConnectionEpoch) return reject('connection-epoch-mismatch');
  if (message.lifeId !== context.expectedLifeId) return reject('life-mismatch');
  if (!context.shooterAlive) return reject('shooter-dead');
  if (message.weapon !== sender.weapon) return reject('weapon-mismatch');

  const sameAuthorityEpoch = state?.connectionEpoch === message.connectionEpoch
    && state.lifeId === message.lifeId;
  if (sameAuthorityEpoch && message.actionSequence <= state.highestActionSequence) {
    return reject('duplicate-sequence');
  }
  if (sameAuthorityEpoch && state.weapon === message.weapon && state.pressed === message.pressed) {
    return reject('duplicate-edge');
  }

  return {
    accepted: true,
    reason: 'accepted',
    state: Object.freeze({
      connectionEpoch: message.connectionEpoch,
      lifeId: message.lifeId,
      weapon: message.weapon,
      pressed: message.pressed,
      pressedAtHostTimeMs: message.pressed ? receivedAtHostTimeMs : null,
      highestActionSequence: message.actionSequence,
    }),
  };
}

export class HostTriggerAuthorityRegistry {
  private readonly states = new Map<string, HostTriggerAuthorityState>();

  admit(
    message: TriggerStateMessage,
    sender: PlayerSnapshot | undefined,
    receivedAtHostTimeMs: number,
    context: HostTriggerAdmissionContext,
  ): HostTriggerAdmission {
    const admission = admitHostTriggerState(
      message,
      sender,
      receivedAtHostTimeMs,
      this.states.get(message.by),
      context,
    );
    if (admission.accepted && admission.state) this.states.set(message.by, admission.state);
    return admission;
  }

  stateFor(playerId: string): HostTriggerAuthorityState | undefined {
    return this.states.get(playerId);
  }

  reset(playerId: string, _reason: HostTriggerResetReason): boolean {
    return this.states.delete(playerId);
  }

  resetIfWeaponChanged(playerId: string, weapon: WeaponId): boolean {
    const state = this.states.get(playerId);
    return Boolean(state && state.weapon !== weapon && this.reset(playerId, 'weapon-switch'));
  }

  clear(_reason: Extract<HostTriggerResetReason, 'match-reset'>): void {
    this.states.clear();
  }
}
