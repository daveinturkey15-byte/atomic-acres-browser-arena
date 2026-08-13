import { describe, expect, it } from 'vitest';
import { HostedBotBallisticGlassActionLedger } from './hosted-bot-glass-authority';

const valid = Object.freeze({
  receiverRole: 'client' as const,
  hostAuthorityValid: true,
  matchEpoch: 71,
  botId: 'host-bot-1',
  botAdmitted: true,
  weapon: 'carbine' as const,
  actionNonce: 51,
  eventReplay: false,
  paneId: 'atomic-aqua:ground-window-glass',
  originInsideArena: true,
  paneDistanceM: 12,
  maximumPaneDistanceM: 24.5,
  nowMs: 1_000,
});

describe('hosted-bot ballistic glass authority', () => {
  it('admits eligible hitscan and flamethrower panes exactly once per host action', () => {
    const ledger = new HostedBotBallisticGlassActionLedger();
    expect(ledger.admit(valid)).toEqual({ accepted: true, reason: 'accepted' });
    expect(ledger.admit({ ...valid, nowMs: 1_001 })).toEqual({ accepted: false, reason: 'replay' });
    expect(ledger.admit({
      ...valid,
      weapon: 'flamethrower',
      actionNonce: 52,
      paneId: 'atomic-coral:ground-window-glass',
      paneDistanceM: 8,
      maximumPaneDistanceM: 14.5,
      nowMs: 1_002,
    })).toEqual({ accepted: true, reason: 'accepted' });
  });

  it('permits distinct panes from a pellet action but rejects a weapon swap on one identity', () => {
    const ledger = new HostedBotBallisticGlassActionLedger();
    expect(ledger.admit(valid).accepted).toBe(true);
    expect(ledger.admit({ ...valid, paneId: 'atomic-aqua:upper-window-glass', nowMs: 1_001 }).accepted).toBe(true);
    expect(ledger.admit({ ...valid, weapon: 'smg', paneId: 'atomic-coral:upper-window-glass', nowMs: 1_002 }))
      .toEqual({ accepted: false, reason: 'wrong-action' });
  });

  it('fails closed for projectile, non-bot, stale and forged events', () => {
    const ledger = new HostedBotBallisticGlassActionLedger();
    expect(ledger.admit({ ...valid, weapon: 'flare-gun' }).reason).toBe('ineligible-weapon');
    expect(ledger.admit({ ...valid, weapon: 'explosive-crossbow' }).reason).toBe('ineligible-weapon');
    expect(ledger.admit({ ...valid, receiverRole: 'host' }).reason).toBe('untrusted-mutation');
    expect(ledger.admit({ ...valid, hostAuthorityValid: false }).reason).toBe('forged-authority');
    expect(ledger.admit({ ...valid, botAdmitted: false }).reason).toBe('stale-bot');
    expect(ledger.admit({ ...valid, botId: 'guest-player' }).reason).toBe('stale-bot');
    expect(ledger.admit({ ...valid, eventReplay: true }).reason).toBe('replay');
    expect(ledger.admit({ ...valid, paneDistanceM: 25 }).reason).toBe('forged-impact');
  });

  it('bounds retained identities and expires old epochs/actions', () => {
    const ledger = new HostedBotBallisticGlassActionLedger(1, 100);
    expect(ledger.admit(valid).accepted).toBe(true);
    expect(ledger.admit({ ...valid, actionNonce: 52, paneId: 'pane-b', nowMs: 1_010 }).accepted).toBe(true);
    expect(ledger.size()).toBe(1);
    expect(ledger.admit({ ...valid, actionNonce: 53, paneId: 'pane-c', nowMs: 1_111 }).accepted).toBe(true);
    expect(ledger.size()).toBe(1);
    ledger.clear();
    expect(ledger.size()).toBe(0);
  });
});
