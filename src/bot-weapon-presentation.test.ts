import { describe, expect, it } from 'vitest';
import {
  BOT_WEAPON_PRESENTATION_SCHEMA_VERSION,
  BotWeaponPresentationReplayGuard,
  botWeaponPresentationReplayKey,
  isBotWeaponPresentationMessage,
  type BotFlamethrowerStreamPresentationMessage,
  type BotFlareLaunchPresentationMessage,
} from './bot-weapon-presentation';

const flame = Object.freeze({
  type: 'bot-weapon-presentation',
  schemaVersion: BOT_WEAPON_PRESENTATION_SCHEMA_VERSION,
  by: 'host-player',
  matchEpoch: 71,
  botId: 'host-bot-2',
  weapon: 'flamethrower',
  presentation: 'flamethrower-stream',
  origin: [2, 1.42, 8],
  end: [2, 1.42, -10],
  actionNonce: 501,
  nonce: 601,
} as const satisfies BotFlamethrowerStreamPresentationMessage);

const flare = Object.freeze({
  type: 'bot-weapon-presentation',
  schemaVersion: BOT_WEAPON_PRESENTATION_SCHEMA_VERSION,
  by: 'host-player',
  matchEpoch: 71,
  botId: 'host-bot-3',
  weapon: 'flare-gun',
  presentation: 'signal-flare-launch',
  origin: [3, 1.42, 9],
  actionNonce: 502,
  nonce: 602,
} as const satisfies BotFlareLaunchPresentationMessage);

describe('hosted bot weapon presentation protocol', () => {
  it('admits only the two exact presentation-only envelopes', () => {
    expect(isBotWeaponPresentationMessage(flame)).toBe(true);
    expect(isBotWeaponPresentationMessage(flare)).toBe(true);
    expect(isBotWeaponPresentationMessage({ ...flame, weapon: 'flare-gun' })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flare, weapon: 'flamethrower' })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flame, presentation: 'ballistic-ray' })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flare, presentation: 'signal-flare-projectile' })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flame, damage: 42 })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flare, impact: [1, 2, 3] })).toBe(false);
  });

  it('bounds schema, coordinates, flame range and action identity', () => {
    expect(isBotWeaponPresentationMessage({ ...flame, schemaVersion: 2 })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flame, botId: 'bot-2' })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flame, matchEpoch: 0 })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flame, actionNonce: -1 })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flame, origin: [4_097, 0, 0] })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flame, end: [2, 1.42, -10.06] })).toBe(false);
    expect(isBotWeaponPresentationMessage({ ...flare, end: [3, 1.42, 10] })).toBe(false);
  });

  it('deduplicates at bot-action scope even when an envelope nonce changes', () => {
    const guard = new BotWeaponPresentationReplayGuard();
    const expected = { hostId: 'host-player', matchEpoch: 71 } as const;
    expect(guard.admit(flame, expected)).toMatchObject({ accepted: true, reason: 'accepted' });
    expect(guard.admit({ ...flame, nonce: 999 }, expected)).toEqual({
      accepted: false,
      reason: 'duplicate-action',
      message: null,
    });
    expect(guard.size()).toBe(1);
    expect(botWeaponPresentationReplayKey(flame)).toBe('71:host-bot-2:501');
  });

  it('rejects wrong-host and stale-match traffic before consuming replay state', () => {
    const guard = new BotWeaponPresentationReplayGuard();
    expect(guard.admit(flare, { hostId: 'other-host', matchEpoch: 71 })).toMatchObject({
      accepted: false,
      reason: 'wrong-host',
    });
    expect(guard.admit(flare, { hostId: 'host-player', matchEpoch: 72 })).toMatchObject({
      accepted: false,
      reason: 'wrong-match-epoch',
    });
    expect(guard.size()).toBe(0);
    expect(guard.admit(flare, { hostId: 'host-player', matchEpoch: 71 }).accepted).toBe(true);
    guard.clear();
    expect(guard.size()).toBe(0);
  });

  it('keeps replay memory bounded', () => {
    const guard = new BotWeaponPresentationReplayGuard(2);
    const expected = { hostId: 'host-player', matchEpoch: 71 } as const;
    expect(guard.admit(flame, expected).accepted).toBe(true);
    expect(guard.admit({ ...flame, actionNonce: 502, nonce: 602 }, expected).accepted).toBe(true);
    expect(guard.admit({ ...flame, actionNonce: 503, nonce: 603 }, expected).accepted).toBe(true);
    expect(guard.size()).toBe(2);
    expect(guard.admit(flame, expected).accepted).toBe(true);
  });
});
