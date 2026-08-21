import { describe, expect, it } from 'vitest';
import { admitCanonicalCrossbowGlassBreak, admitCrossbowGlassMutation } from './crossbow-glass-authority';
import { admitGlassImpact, createGlassState, glassAuthorityProjection } from './glass-authority';
import { crossbowBlastLineOfSightColliders, windowBreakPathBlocked } from './window-breaks';

describe('hosted crossbow glass behavior', () => {
  it('opens a solid pane on authoritative bolt impact', () => {
    const initial = createGlassState('front-pane', 73);
    expect(glassAuthorityProjection(initial).movementSolid).toBe(true);
    expect(admitCrossbowGlassMutation(true).accepted).toBe(true);
    const impact = admitGlassImpact(initial, {
      isHost: true,
      matchEpoch: 73,
      expectedRevision: initial.revision,
      impactId: 'crossbow:impact:73',
      tick: 8,
      profile: 'bullet',
    });
    expect(impact.accepted).toBe(true);
    expect(glassAuthorityProjection(impact.state)).toMatchObject({
      phase: 'breached',
      apertureOpen: true,
      movementSolid: false,
      ballisticSolid: false,
    });
  });

  it('keeps real cover while excluding only the struck pane from blast LOS', () => {
    const struckPane = { minX: -0.4, maxX: 0.4, minY: 0, maxY: 2, minZ: 0, maxZ: 0.08 };
    const wall = { minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: 1, maxZ: 1.2 };
    const ids = new Map([[struckPane, 'front-pane']]);
    const withoutStruckPane = crossbowBlastLineOfSightColliders(
      [struckPane, wall],
      'front-pane',
      (collider) => ids.get(collider) ?? null,
    );
    expect(withoutStruckPane).toEqual([wall]);
    expect(windowBreakPathBlocked(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 1, z: 2 },
      withoutStruckPane,
    )).toBe(true);
  });

  it('admits one host-canonical in-radius explosion pane on the guest', () => {
    expect(admitCanonicalCrossbowGlassBreak({
      receiverRole: 'client',
      hostAuthorityValid: true,
      weapon: 'explosive-crossbow',
      fireKind: 'projectile',
      phase: 'explosion',
      actionNonce: 73,
      actionCurrent: true,
      actionWeapon: 'explosive-crossbow',
      actionNonceObserved: 73,
      eventReplay: false,
      panePhaseAlreadyAdmitted: false,
      originInsideArena: true,
      paneDistanceM: 3.5,
      blastRadiusM: 3.5,
    })).toEqual({ accepted: true, reason: 'accepted' });
  });

  it('never lets a predicted guest bolt mutate glass before the host result', () => {
    expect(admitCrossbowGlassMutation(false)).toEqual({
      accepted: false,
      reason: 'presentation-only-prediction',
    });
  });
});
