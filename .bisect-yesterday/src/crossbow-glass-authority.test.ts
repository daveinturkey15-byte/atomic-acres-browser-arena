import { describe, expect, it } from 'vitest';
import {
  admitCanonicalCrossbowGlassBreak,
  admitCrossbowGlassMutation,
  retainInFlightCrossbowGlassActions,
} from './crossbow-glass-authority';

const valid = {
  receiverRole: 'client' as const,
  hostAuthorityValid: true,
  weapon: 'explosive-crossbow' as const,
  fireKind: 'projectile' as const,
  phase: 'impact' as const,
  actionNonce: 73,
  actionCurrent: true,
  actionWeapon: 'explosive-crossbow' as const,
  actionNonceObserved: 73,
  eventReplay: false,
  panePhaseAlreadyAdmitted: false,
  originInsideArena: true,
  paneDistanceM: 0.08,
  blastRadiusM: 3.5,
};

describe('crossbow glass authority', () => {
  it('keeps guest prediction presentation-only and admits the host result', () => {
    expect(admitCrossbowGlassMutation(false)).toEqual({
      accepted: false,
      reason: 'presentation-only-prediction',
    });
    expect(admitCrossbowGlassMutation(true)).toEqual({
      accepted: true,
      reason: 'authoritative-simulation',
    });
    expect(admitCanonicalCrossbowGlassBreak(valid)).toEqual({ accepted: true, reason: 'accepted' });
  });

  it('admits direct impact only at the struck pane', () => {
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, paneDistanceM: 0.5 }).accepted).toBe(true);
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, paneDistanceM: 0.501 }).reason).toBe('forged-impact');
  });

  it('admits explosion panes inside the exact ordinary and stuck radii', () => {
    expect(admitCanonicalCrossbowGlassBreak({
      ...valid, phase: 'explosion', paneDistanceM: 4, blastRadiusM: 3.5,
    }).accepted).toBe(true);
    expect(admitCanonicalCrossbowGlassBreak({
      ...valid, phase: 'explosion', paneDistanceM: 4.001, blastRadiusM: 3.5,
    }).reason).toBe('forged-impact');
    expect(admitCanonicalCrossbowGlassBreak({
      ...valid, phase: 'explosion', paneDistanceM: 7.5, blastRadiusM: 7,
    }).accepted).toBe(true);
  });

  it('rejects guest-authored, stale, mismatched, and replayed mutations', () => {
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, receiverRole: 'host' }).reason)
      .toBe('untrusted-guest-mutation');
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, hostAuthorityValid: false }).reason)
      .toBe('forged-authority');
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, actionCurrent: false }).reason)
      .toBe('stale-action');
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, actionNonceObserved: 74 }).reason)
      .toBe('wrong-action');
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, eventReplay: true }).reason)
      .toBe('replay');
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, panePhaseAlreadyAdmitted: true }).reason)
      .toBe('replay');
  });

  it('rejects non-crossbow and non-projectile actions', () => {
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, weapon: 'carbine' }).reason)
      .toBe('ineligible-weapon');
    expect(admitCanonicalCrossbowGlassBreak({ ...valid, fireKind: 'hitscan' }).reason)
      .toBe('ineligible-weapon');
  });

  it('retains only a current in-flight crossbow action after transport loss', () => {
    const actions = new Map([
      [73, { message: { weapon: 'explosive-crossbow' as const }, receivedAt: 1_000, matchEpoch: 9 }],
      [74, { message: { weapon: 'carbine' as const }, receivedAt: 1_000, matchEpoch: 9 }],
      [75, { message: { weapon: 'explosive-crossbow' as const }, receivedAt: 1_000, matchEpoch: 8 }],
    ]);
    expect(retainInFlightCrossbowGlassActions(actions, 9, 1_100)).toBe(1);
    expect([...actions.keys()]).toEqual([73]);
    expect(retainInFlightCrossbowGlassActions(actions, 9, 7_001)).toBe(0);
  });
});
