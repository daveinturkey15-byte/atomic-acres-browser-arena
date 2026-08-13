import { describe, expect, it } from 'vitest';
import { admitProjectileGlassBreak } from './projectile-glass-break-admission';

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
