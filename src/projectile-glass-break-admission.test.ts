import { describe, expect, it } from 'vitest';
import {
  admitProjectileGlassBreak,
  admitProjectileSimulationGlassMutation,
  projectileGlassActionLifetimeMs,
  retainInFlightProjectileGlassActions,
} from './projectile-glass-break-admission';

const valid = {
  receiverRole: 'client' as const,
  hostAuthorityValid: true,
  weapon: 'flare-gun' as const,
  fireKind: 'projectile' as const,
  actionNonce: 41,
  actionCurrent: true,
  actionWeapon: 'flare-gun' as const,
  actionNonceObserved: 41,
  eventReplay: false,
  paneAlreadyAdmittedForAction: false,
  originInsideArena: true,
  paneDistanceM: 0.08,
  maximumPaneDistanceM: 0.35,
};

describe('projectile glass-break admission', () => {
  it('keeps guest flight prediction presentation-only until host canonical admission', () => {
    expect(admitProjectileSimulationGlassMutation(false)).toEqual({
      accepted: false,
      reason: 'presentation-only-prediction',
    });
    expect(admitProjectileSimulationGlassMutation(true)).toEqual({
      accepted: true,
      reason: 'authoritative-simulation',
    });
  });

  it('leaves a rejected guest pane intact and applies one late host-canonical break', () => {
    let rejectedPaneOpen = false;
    if (admitProjectileSimulationGlassMutation(false).accepted) rejectedPaneOpen = true;
    // A rejected shot has no host-canonical pane event, so prediction alone
    // cannot make the collider disappear.
    expect(rejectedPaneOpen).toBe(false);

    let acceptedPaneOpen = false;
    if (admitProjectileSimulationGlassMutation(false).accepted) acceptedPaneOpen = true;
    expect(acceptedPaneOpen).toBe(false);
    const lateCanonical = admitProjectileGlassBreak(valid);
    if (lateCanonical.accepted) acceptedPaneOpen = true;
    expect(lateCanonical).toEqual({ accepted: true, reason: 'accepted' });
    expect(acceptedPaneOpen).toBe(true);

    const replay = admitProjectileGlassBreak({ ...valid, eventReplay: true });
    expect(replay).toEqual({ accepted: false, reason: 'replay' });
    expect(acceptedPaneOpen).toBe(true);
  });

  it('uses the same sole-authority contract for crossbow detonation panes', () => {
    const crossbow = {
      ...valid,
      weapon: 'explosive-crossbow' as const,
      actionWeapon: 'explosive-crossbow' as const,
      paneDistanceM: 2,
      maximumPaneDistanceM: 4.5,
    };
    expect(admitProjectileSimulationGlassMutation(false).accepted).toBe(false);
    expect(admitProjectileGlassBreak(crossbow)).toEqual({ accepted: true, reason: 'accepted' });
  });

  it('retains only exact in-flight projectile identities after their actor disconnects', () => {
    const actions = new Map([
      [41, { message: { weapon: 'flare-gun' as const }, receivedAt: 1_000, matchEpoch: 71 }],
      [42, { message: { weapon: 'explosive-crossbow' as const }, receivedAt: 1_000, matchEpoch: 71 }],
      [43, { message: { weapon: 'carbine' as const }, receivedAt: 1_000, matchEpoch: 71 }],
      [44, { message: { weapon: 'flare-gun' as const }, receivedAt: 1_000, matchEpoch: 70 }],
    ]);
    expect(retainInFlightProjectileGlassActions(actions, 71, 1_100)).toBe(2);
    expect([...actions.keys()]).toEqual([41, 42]);
  });

  it('expires disconnected projectile identity at its bounded flight lifetime', () => {
    const flareLifetime = projectileGlassActionLifetimeMs('flare-gun')!;
    const crossbowLifetime = projectileGlassActionLifetimeMs('explosive-crossbow')!;
    const actions = new Map([
      [41, { message: { weapon: 'flare-gun' as const }, receivedAt: 1_000, matchEpoch: 71 }],
      [42, { message: { weapon: 'explosive-crossbow' as const }, receivedAt: 1_000, matchEpoch: 71 }],
    ]);
    expect(retainInFlightProjectileGlassActions(actions, 71, 1_000 + crossbowLifetime + 1)).toBe(1);
    expect([...actions.keys()]).toEqual([41]);
    expect(retainInFlightProjectileGlassActions(actions, 71, 1_000 + flareLifetime + 1)).toBe(0);
  });

  it('accepts one host-canonical pane mutation tied to the exact live projectile action', () => {
    expect(admitProjectileGlassBreak(valid)).toEqual({ accepted: true, reason: 'accepted' });
  });

  it('rejects guest mutations and forged host authority', () => {
    expect(admitProjectileGlassBreak({ ...valid, receiverRole: 'host', hostAuthorityValid: false }).reason)
      .toBe('untrusted-guest-mutation');
    expect(admitProjectileGlassBreak({ ...valid, hostAuthorityValid: false }).reason)
      .toBe('forged-authority');
  });

  it('rejects stale, mismatched and replayed actions', () => {
    expect(admitProjectileGlassBreak({ ...valid, actionCurrent: false }).reason).toBe('stale-action');
    expect(admitProjectileGlassBreak({ ...valid, actionWeapon: 'explosive-crossbow' }).reason).toBe('wrong-action');
    expect(admitProjectileGlassBreak({ ...valid, actionNonceObserved: 42 }).reason).toBe('wrong-action');
    expect(admitProjectileGlassBreak({ ...valid, eventReplay: true }).reason).toBe('replay');
    expect(admitProjectileGlassBreak({ ...valid, paneAlreadyAdmittedForAction: true }).reason).toBe('replay');
  });

  it('rejects ineligible weapons and forged impact positions', () => {
    expect(admitProjectileGlassBreak({ ...valid, fireKind: 'hitscan' }).reason).toBe('ineligible-weapon');
    expect(admitProjectileGlassBreak({ ...valid, originInsideArena: false }).reason).toBe('forged-impact');
    expect(admitProjectileGlassBreak({ ...valid, paneDistanceM: 0.36 }).reason).toBe('forged-impact');
  });
});
