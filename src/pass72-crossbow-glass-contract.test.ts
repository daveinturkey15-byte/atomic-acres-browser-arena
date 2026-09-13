import { describe, expect, it } from 'vitest';
import { admitCanonicalCrossbowGlassBreak, admitCrossbowGlassMutation } from './crossbow-glass-authority';
import { admitGlassImpact, createGlassState, glassAuthorityProjection } from './glass-authority';
import { crossbowBlastLineOfSightColliders, windowBreakPathBlocked } from './window-breaks';
import type { Box2 } from './collision';

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

  /**
   * HF-348 solo half. The owner's report was "tac crossbow bolt AND explosion
   * didn't break glass": the TAC-15 mutates glass twice, once on the bolt and
   * again on its blast. Every other test here is about a HOSTED role - guest
   * prediction, host-canonical replication - so nothing pinned the offline
   * path, where the local player is its own authority and both phases must
   * land against an untouched pane.
   */
  it('breaks glass on both bolt phases in solo, where the local player is the authority', () => {
    // Solo is authoritative by construction: there is no host to defer to.
    expect(admitCrossbowGlassMutation(true).accepted).toBe(true);

    const boltPane = createGlassState('solo-bolt-pane', 5);
    const bolt = admitGlassImpact(boltPane, {
      isHost: true,
      matchEpoch: 5,
      expectedRevision: boltPane.revision,
      impactId: 'crossbow:solo:impact:1',
      tick: 12,
      profile: 'bullet',
    });
    expect(bolt.accepted, 'solo bolt impact must break its pane').toBe(true);
    expect(glassAuthorityProjection(bolt.state)).toMatchObject({
      phase: 'breached', apertureOpen: true, movementSolid: false,
    });

    // A DIFFERENT pane, caught by the blast rather than the bolt itself.
    const blastPane = createGlassState('solo-blast-pane', 5);
    const blast = admitGlassImpact(blastPane, {
      isHost: true,
      matchEpoch: 5,
      expectedRevision: blastPane.revision,
      impactId: 'crossbow:solo:explosion:1',
      tick: 13,
      profile: 'explosion',
    });
    expect(blast.accepted, 'solo bolt explosion must break nearby panes').toBe(true);
    // The blast profile carries more damage than a bullet, so the pane leaves
    // the frame entirely rather than merely breaching - still open, still
    // non-solid, which is what the player is owed either way.
    expect(glassAuthorityProjection(blast.state)).toMatchObject({
      phase: 'detached', apertureOpen: true, movementSolid: false, ballisticSolid: false,
    });

    // The same two phases replayed on one pane are admitted once each and
    // never twice, so solo cannot double-count a break.
    const replay = admitGlassImpact(bolt.state, {
      isHost: true,
      matchEpoch: 5,
      expectedRevision: boltPane.revision,
      impactId: 'crossbow:solo:impact:1',
      tick: 12,
      profile: 'bullet',
    });
    expect(replay.accepted).toBe(false);
  });

  it('keeps real cover while excluding only the struck pane from blast LOS', () => {
    const struckPane = { minX: -0.4, maxX: 0.4, minY: 0, maxY: 2, minZ: 0, maxZ: 0.08 };
    const wall = { minX: -1, maxX: 1, minY: 0, maxY: 3, minZ: 1, maxZ: 1.2 };
    const ids = new Map<Box2, string>([[struckPane, 'front-pane']]);
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
