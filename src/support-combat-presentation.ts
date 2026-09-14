import type { MatchMode } from './private-match';
import type { KillstreakDamageEvent, KillstreakSupportShotEvent } from './killstreak-runtime';
import type { SpatialPoint } from './spatial-audio';

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
  // HF-337: explicit listener policy — owner and teammates always hear support fire.
  // Enemies in TDM hear it positionally at reduced volume (enforced in audio runtime).
  // FFA non-owners hear nothing.
  if (owner) return event.source === 'chopper' ? 'chopper' : 'drone';
  if (listener.mode === 'tdm') {
    // Teammates and enemies both hear; volume reduction is applied in the audio runtime.
    return event.source === 'chopper' ? 'chopper' : 'drone';
  }
  // FFA: only owner hears support fire
  return null;
}

/** HF-337: positional audio callback with emitter position for spatial routing. */
export type SupportGunPositionalCallback = (kind: SupportGunAudioKind, emitter: SpatialPoint, isEnemy?: boolean) => void;

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

/** HF-337: positional overload with entity position lookup for spatial support gunfire. */
export function presentSupportShotAudioPositional(
  events: readonly KillstreakSupportShotEvent[],
  listener: SupportCombatListener,
  getEntityPosition: (entityId: string) => SpatialPoint | null,
  playPositional: SupportGunPositionalCallback,
  replayGuard?: SupportShotReplayGuard,
): number {
  let presented = 0;
  for (const event of events) {
    if (replayGuard && !replayGuard.admit(event)) continue;
    const kind = supportShotAudioKindForListener(event, listener);
    if (kind === null) continue;
    const emitter = getEntityPosition(event.entityId);
    if (!emitter) continue;
    // HF-337: determine if this is an enemy entity for the listener
    const isEnemy = listener.mode === 'tdm' && event.ownerTeam !== listener.team;
    playPositional(kind, emitter, isEnemy);
    presented += 1;
  }
  return presented;
}

export function isOwnerSupportDamageFeedback(event: KillstreakDamageEvent, playerId: string): boolean {
  return event.damage > 0 && event.ownerId === playerId;
}
