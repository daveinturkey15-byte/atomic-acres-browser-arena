import type { NetworkRole } from './network';
import type { ReloadIntentMessage } from './protocol';
import type { LocalReloadPending } from './local-reload-authority';

type ReloadRetryTrace = Readonly<{
  direction: 'send';
  actorId: string;
  requestId: string;
  action: 'start' | 'cancel';
  status: string;
  reason: string;
  actionSequence: number;
}>;

type ReloadRetryContext = Readonly<{
  getRole: () => NetworkRole;
  getPlayerId: () => string;
  getConnectionEpoch: () => string;
  getLifeId: () => number;
  getProtocolVersion: () => ReloadIntentMessage['protocolVersion'];
  randomNonce: () => number;
  getPending: () => LocalReloadPending | null;
  send: (message: ReloadIntentMessage) => void;
  record: (trace: ReloadRetryTrace) => void;
}>;

export function createLocalReloadRetryRuntime(context: ReloadRetryContext) {
  let retryTimer: number | null = null;

  function clear(): void {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
  }

  function intent(pending: LocalReloadPending, action: 'start' | 'cancel'): ReloadIntentMessage | null {
    const actionSequence = action === 'cancel' ? pending.cancelSequence : pending.startSequence;
    const requestId = action === 'cancel' ? pending.cancelRequestId : pending.requestId;
    if (actionSequence === null || requestId === null) return null;
    return {
      type: 'reload-intent', protocolVersion: context.getProtocolVersion(),
      by: context.getPlayerId(), connectionEpoch: context.getConnectionEpoch(), lifeId: context.getLifeId(),
      actionSequence, requestId, weapon: pending.weapon, action, nonce: context.randomNonce(),
    };
  }

  function schedule(pending: LocalReloadPending, action: 'start' | 'cancel'): void {
    clear();
    if (context.getRole() !== 'client') return;
    retryTimer = window.setTimeout(() => {
      retryTimer = null;
      const current = context.getPending();
      const currentRequestId = action === 'cancel' ? current?.cancelRequestId : current?.requestId;
      const requestId = action === 'cancel' ? pending.cancelRequestId : pending.requestId;
      if (current && currentRequestId === requestId && requestId !== null) send(current, action);
    }, 350);
  }

  function send(pending: LocalReloadPending, action: 'start' | 'cancel'): void {
    if (context.getRole() !== 'client') return;
    const message = intent(pending, action);
    if (!message) return;
    context.record({
      direction: 'send',
      actorId: context.getPlayerId(), requestId: message.requestId, action: message.action,
      status: 'requested', reason: 'reliable-retry-lane', actionSequence: message.actionSequence,
    });
    context.send(message);
    schedule(pending, action);
  }

  return Object.freeze({ clear, schedule, send, isScheduled: () => retryTimer !== null });
}
