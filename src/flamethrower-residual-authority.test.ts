import { describe, expect, it } from 'vitest';
import { admitHostCanonicalHitResult } from './host-canonical-hit-admission';
import { admitHostedBotDamage } from './hosted-bot-damage-admission';
import {
  resolveFlamethrowerResidualRemoteAuthority,
  type FlamethrowerResidualAction,
} from './flamethrower-residual-authority';

const retained: FlamethrowerResidualAction = Object.freeze({
  ownerId: 'host-human',
  actionNonce: 73,
  weapon: 'flamethrower',
  matchEpoch: 19,
  receivedAtMs: 1_000,
});

function resolve(overrides: Partial<Parameters<typeof resolveFlamethrowerResidualRemoteAuthority>[0]> = {}) {
  return resolveFlamethrowerResidualRemoteAuthority({
    ownerId: retained.ownerId,
    actionNonce: retained.actionNonce,
    ownerKind: 'human',
    currentMatchEpoch: retained.matchEpoch,
    nowMs: 6_999,
    actionLifetimeMs: 6_000,
    retainedAction: retained,
    ...overrides,
  });
}

describe('Flamethrower residual remote authority', () => {
  it('routes a hosted-bot pulse only through the hosted-bot result lane', () => {
    const authority = resolve({
      ownerId: 'host-bot-2',
      ownerKind: 'hosted-bot',
      retainedAction: null,
    });
    expect(authority).toEqual({
      accepted: true,
      route: 'hosted-bot-result',
      weapon: 'flamethrower',
      reason: 'accepted-hosted-bot',
    });
    expect(admitHostedBotDamage({
      type: 'bot-damage', by: 'host-human', botId: 'host-bot-2', target: 'guest-victim',
      weapon: authority.weapon!, presentation: 'flamethrower-stream',
      origin: [0, 0, 0], direction: [0, 0, -1],
      damageApplied: 10, healthBefore: 100, healthAfter: 90, nonce: 81,
    }, {
      expectedHostId: 'host-human', localPlayerId: 'guest-victim',
      seenNonces: new Set(), replicaWeapon: 'magnum',
    })).toEqual({ accepted: true, reconcileLocalHealth: true, presentFromReplica: true });
  });

  it('retains a human Flamethrower action through the final residual margin independent of weapon switching', () => {
    expect(resolve()).toEqual({
      accepted: true,
      route: 'human-canonical-hit',
      weapon: 'flamethrower',
      reason: 'accepted-human-action',
    });
    expect(resolve({ nowMs: 7_000 })).toMatchObject({ accepted: true, weapon: 'flamethrower' });
    expect(admitHostCanonicalHitResult({
      hostId: 'host-human', targetLifeId: 4, appliedDamage: 10,
      resultingHealth: 90, stickyAttachment: null,
    }, {
      expectedHostId: 'host-human', targetId: 'guest-victim', expectedTargetId: 'guest-victim',
      expectedTargetLifeId: 4, alreadyProcessed: false,
    })).toEqual({ accepted: true, appliedDamage: 10, resultingHealth: 90 });
  });

  it.each([
    ['missing action', { retainedAction: null }, 'missing-action'],
    ['owner mismatch', { retainedAction: { ...retained, ownerId: 'other' } }, 'owner-mismatch'],
    ['nonce mismatch', { retainedAction: { ...retained, actionNonce: 74 } }, 'action-mismatch'],
    ['weapon swap fallback', { retainedAction: { ...retained, weapon: 'magnum' as const } }, 'weapon-mismatch'],
    ['prior epoch', { retainedAction: { ...retained, matchEpoch: 18 } }, 'epoch-mismatch'],
    ['expired action', { nowMs: 7_001 }, 'action-not-current'],
    ['future action', { nowMs: 999 }, 'action-not-current'],
  ] as const)('fails closed for %s', (_label, overrides, reason) => {
    expect(resolve(overrides)).toEqual({ accepted: false, route: null, weapon: null, reason });
  });
});
