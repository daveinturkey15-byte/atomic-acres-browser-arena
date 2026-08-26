import { describe, expect, it } from 'vitest';
import { admitHostedBotDamage } from './hosted-bot-damage-admission';
import type { BotDamageMessage, WeaponId } from './protocol';

const damage: BotDamageMessage = {
  type: 'bot-damage',
  by: 'host-1',
  botId: 'host-bot-0',
  target: 'guest-1',
  weapon: 'm4a1',
  origin: [0, 1.4, 0],
  direction: [0, 0, -1],
  damageApplied: 17,
  healthBefore: 63,
  healthAfter: 46,
  nonce: 91,
};

const admission = (replicaWeapon: WeaponId | null, seenNonces: ReadonlySet<number> = new Set()) => (
  admitHostedBotDamage(damage, {
    expectedHostId: 'host-1',
    localPlayerId: 'guest-1',
    seenNonces,
    replicaWeapon,
  })
);

describe('hosted bot damage admission', () => {
  it('reconciles canonical local HP when the reliable event precedes all lossy bot state', () => {
    expect(admission(null)).toEqual({ accepted: true, reconcileLocalHealth: true, presentFromReplica: false });
  });

  it('admits authority against a stale weapon replica and keeps presentation optional', () => {
    expect(admission('smg')).toEqual({ accepted: true, reconcileLocalHealth: true, presentFromReplica: true });
  });

  it('rejects a replay before either health or presentation can run', () => {
    expect(admission('m4a1', new Set([damage.nonce]))).toEqual({
      accepted: false,
      reconcileLocalHealth: false,
      presentFromReplica: false,
    });
  });
});
