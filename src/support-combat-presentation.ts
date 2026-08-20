import type { MatchMode } from './private-match';
import type { KillstreakDamageEvent, KillstreakSupportShotEvent } from './killstreak-runtime';

export type SupportGunAudioKind = 'chopper' | 'drone';
export const SUPPORT_SHOT_REPLAY_CAPACITY = 256;

export type SupportCombatListener = Readonly<{
  playerId: string;
  team: 0 | 1;
  mode: MatchMode;
}>;

export function supportShotReplayKey(event: KillstreakSupportShotEvent): string {
  return `${event.activationId}:${event.entityId}:${event.ordinal}`;
}

/** Bounds cross-message replay memory while preventing duplicate audio cues. */
export class SupportShotReplayGuard {
  private readonly admitted = new Set<string>();
  private readonly order: string[] = [];

  constructor(private readonly capacity = SUPPORT_SHOT_REPLAY_CAPACITY) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error('Support-shot replay capacity must be positive');
  }

  admit(event: KillstreakSupportShotEvent): boolean {
    const key = supportShotReplayKey(event);
    if (this.admitted.has(key)) return false;
    this.admitted.add(key);
    this.order.push(key);
    while (this.order.length > this.capacity) this.admitted.delete(this.order.shift()!);
    return true;
  }

  clear(): void {
    this.admitted.clear();
    this.order.length = 0;
  }

  size(): number {
    return this.admitted.size;
  }
}

export function supportShotAudioKindForListener(
  event: KillstreakSupportShotEvent,
  listener: SupportCombatListener,
): SupportGunAudioKind | null {
  const owner = event.ownerId === listener.playerId;
  const teammate = listener.mode === 'tdm' && event.ownerTeam === listener.team;
  if (!owner && !teammate) return null;
  return event.source === 'chopper' ? 'chopper' : 'drone';
}

export function presentSupportShotAudio(
  events: readonly KillstreakSupportShotEvent[],
  listener: SupportCombatListener,
  play: (kind: SupportGunAudioKind) => void,
  replayGuard?: SupportShotReplayGuard,
): number {
  let presented = 0;
  for (const event of events) {
    if (replayGuard && !replayGuard.admit(event)) continue;
    const kind = supportShotAudioKindForListener(event, listener);
    if (kind === null) continue;
    play(kind);
    presented += 1;
  }
  return presented;
}

export function isOwnerSupportDamageFeedback(event: KillstreakDamageEvent, playerId: string): boolean {
  return event.damage > 0 && event.ownerId === playerId;
}
