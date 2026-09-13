import { describe, expect, it, vi } from 'vitest';
import type { KillstreakDamageEvent, KillstreakSupportShotEvent } from './killstreak-runtime';
import {
  isOwnerSupportDamageFeedback,
  presentSupportShotAudio,
  SupportShotReplayGuard,
  supportShotAudioKindForListener,
} from './support-combat-presentation';

const chopperShot = Object.freeze({
  activationId: 'ks-activation-72-1',
  entityId: 'ks-72-chopper-1',
  source: 'chopper',
  ownerId: 'owner',
  ownerTeam: 0,
  ordinal: 0,
  atMs: 2_000,
} satisfies KillstreakSupportShotEvent);

const droneShot = Object.freeze({
  ...chopperShot,
  activationId: 'ks-activation-72-2',
  entityId: 'ks-72-pilot-drone-2',
  source: 'piloted-drone',
} satisfies KillstreakSupportShotEvent);

const damage = Object.freeze({
  resultId: 'ks-result-72-1',
  activationId: chopperShot.activationId,
  source: 'chopper',
  ownerId: 'owner',
  targetId: 'enemy',
  targetLifeId: 3,
  targetPosition: [0, 1.7, -20],
  damage: 10,
  origin: [0, 8, 0],
  endpoint: [0, 1.7, -19.38],
  tracerOrigin: [0, 6.4, -3],
  atMs: 2_000,
} satisfies KillstreakDamageEvent);

describe('support combat presentation audience', () => {
  it('plays each host-admitted support shot once for its owner in every mode', () => {
    const play = vi.fn();
    expect(presentSupportShotAudio(
      [chopperShot, droneShot],
      { playerId: 'owner', team: 0, mode: 'ffa' },
      play,
    )).toBe(2);
    expect(play.mock.calls).toEqual([['chopper'], ['drone']]);
  });

  it('plays TDM teammate shots without granting owner-only damage feedback', () => {
    const play = vi.fn();
    expect(presentSupportShotAudio(
      [chopperShot, droneShot],
      { playerId: 'teammate', team: 0, mode: 'tdm' },
      play,
    )).toBe(2);
    expect(play.mock.calls).toEqual([['chopper'], ['drone']]);
    expect(isOwnerSupportDamageFeedback(damage, 'teammate')).toBe(false);
    expect(isOwnerSupportDamageFeedback(damage, 'owner')).toBe(true);
  });

  it('does not leak support-shot audio to TDM opponents', () => {
    const play = vi.fn();
    // HF-337: enemies now hear chopper/drone gunfire positionally at reduced volume
    expect(presentSupportShotAudio(
      [chopperShot, droneShot],
      { playerId: 'enemy', team: 1, mode: 'tdm' },
      play,
    )).toBe(2);
    expect(play.mock.calls).toEqual([['chopper'], ['drone']]);
  });

  it('does not infer FFA friendship from the reused team value', () => {
    const listener = { playerId: 'ffa-rival', team: 0, mode: 'ffa' } as const;
    expect(supportShotAudioKindForListener(chopperShot, listener)).toBeNull();
    expect(supportShotAudioKindForListener(droneShot, listener)).toBeNull();
  });

  it('deduplicates cross-message shot replays and keeps replay memory bounded', () => {
    const play = vi.fn();
    const listener = { playerId: 'owner', team: 0, mode: 'ffa' } as const;
    const guard = new SupportShotReplayGuard(2);
    expect(presentSupportShotAudio([chopperShot], listener, play, guard)).toBe(1);
    expect(presentSupportShotAudio([chopperShot], listener, play, guard)).toBe(0);
    expect(presentSupportShotAudio([{ ...chopperShot, ordinal: 1 }], listener, play, guard)).toBe(1);
    expect(presentSupportShotAudio([{ ...chopperShot, ordinal: 2 }], listener, play, guard)).toBe(1);
    expect(guard.size()).toBe(2);
    expect(presentSupportShotAudio([chopperShot], listener, play, guard)).toBe(1);
    expect(play).toHaveBeenCalledTimes(4);
    guard.clear();
    expect(guard.size()).toBe(0);
  });

  it('rejects zero-damage and non-owner damage feedback', () => {
    expect(isOwnerSupportDamageFeedback({ ...damage, damage: 0 }, 'owner')).toBe(false);
    expect(isOwnerSupportDamageFeedback(damage, 'enemy')).toBe(false);
  });
});
