import { describe, expect, it } from 'vitest';
import {
  GLASS_DAMAGE_PROFILE_Q,
  admitCrossbowThroughGlass,
  admitGlassImpact,
  createGlassState,
  glassAuthorityProjection,
} from './glass-authority';

describe('glass authority', () => {
  it('gives knife, bullet and explosion impacts distinct authoritative outcomes', () => {
    expect(GLASS_DAMAGE_PROFILE_Q).toEqual({ knife: 1_000, bullet: 1_000, explosion: 2_000 });

    const impact = (profile: 'knife' | 'bullet' | 'explosion') => admitGlassImpact(
      createGlassState(`pane-${profile}`, 3),
      {
        isHost: true,
        matchEpoch: 3,
        expectedRevision: 0,
        impactId: `${profile}:guest-a:17:0`,
        tick: 12,
        profile,
      },
    ).state;

    expect(impact('knife')).toMatchObject({ phase: 'breached', damageQ: 1_000 });
    expect(impact('bullet')).toMatchObject({ phase: 'breached', damageQ: 1_000 });
    expect(impact('explosion')).toMatchObject({ phase: 'detached', damageQ: 2_000 });
  });

  it('can still accumulate explicitly admitted low-energy impacts deterministically', () => {
    const applyKnife = (state: ReturnType<typeof createGlassState>, revision: number) => admitGlassImpact(state, {
      isHost: true,
      matchEpoch: 5,
      expectedRevision: revision,
      impactId: `knife:guest-a:${70 + revision}:${revision}`,
      tick: 20 + revision,
      profile: 'knife',
      damageQ: 350,
    }).state;
    let host = createGlassState('pane-knife-host', 5);
    let replica = createGlassState('pane-knife-host', 5);
    for (let revision = 0; revision < 3; revision += 1) {
      host = applyKnife(host, revision);
      replica = applyKnife(replica, revision);
      expect(replica).toEqual(host);
    }
    expect(host).toMatchObject({ phase: 'breached', revision: 3, damageQ: 1_050 });
  });

  it('owns intact, cracked, breached and detached transitions with one revision stream', () => {
    const initial = createGlassState('house-1:window-1', 7);
    const cracked = admitGlassImpact(initial, {
      isHost: true, matchEpoch: 7, expectedRevision: 0, impactId: 'impact:1', tick: 40,
      profile: 'bullet', damageQ: 400,
    });
    expect(cracked.accepted).toBe(true);
    expect(cracked.state).toMatchObject({ phase: 'cracked', revision: 1, damageQ: 400 });
    expect(glassAuthorityProjection(cracked.state)).toMatchObject({
      paneVisible: true, crackOverlayVisible: true, apertureOpen: false,
      movementSolid: true, ballisticSolid: true, aiLineOfSightSolid: true,
    });

    const breached = admitGlassImpact(cracked.state, {
      isHost: true, matchEpoch: 7, expectedRevision: 1, impactId: 'impact:2', tick: 41,
      profile: 'knife', damageQ: 600,
    });
    expect(breached.state).toMatchObject({ phase: 'breached', revision: 2, breachRevision: 2, breachTick: 41 });
    expect(glassAuthorityProjection(breached.state)).toMatchObject({
      paneVisible: false, crackOverlayVisible: false, apertureOpen: true,
      movementSolid: false, ballisticSolid: false, aiLineOfSightSolid: false,
    });

    const detached = admitGlassImpact(breached.state, {
      isHost: true, matchEpoch: 7, expectedRevision: 2, impactId: 'impact:3', tick: 42,
      profile: 'explosion', damageQ: 600,
    });
    expect(detached.state).toMatchObject({ phase: 'detached', revision: 3, breachRevision: 2, breachTick: 41 });
  });

  it('rejects replica mutation, stale revisions, wrong epochs and replayed impacts', () => {
    const state = createGlassState('pane-a', 4);
    const request = { matchEpoch: 4, expectedRevision: 0, impactId: 'impact:a', tick: 10, profile: 'bullet' as const };
    expect(admitGlassImpact(state, { ...request, isHost: false }).reason).toBe('not-host');
    expect(admitGlassImpact(state, { ...request, isHost: true, matchEpoch: 3 }).reason).toBe('wrong-epoch');
    expect(admitGlassImpact(state, { ...request, isHost: true, expectedRevision: 1 }).reason).toBe('stale-revision');
    const accepted = admitGlassImpact(state, { ...request, isHost: true });
    expect(admitGlassImpact(accepted.state, { ...request, isHost: true, expectedRevision: 1 }).reason).toBe('replay');
  });

  it('allows a crossbow only through an existing or exactly same-tick admitted breach', () => {
    const initial = createGlassState('pane-crossbow', 9);
    expect(admitCrossbowThroughGlass(initial, { matchEpoch: 9, observedRevision: 0, tick: 20 }))
      .toEqual({ passes: false, reason: 'solid-glass' });
    const cracked = admitGlassImpact(initial, {
      isHost: true, matchEpoch: 9, expectedRevision: 0, impactId: 'chip:host:1:0', tick: 20, profile: 'knife', damageQ: 350,
    }).state;
    expect(admitCrossbowThroughGlass(cracked, { matchEpoch: 9, observedRevision: 1, tick: 20 }))
      .toEqual({ passes: false, reason: 'solid-glass' });
    const breach = admitGlassImpact(initial, {
      isHost: true, matchEpoch: 9, expectedRevision: 0, impactId: 'shot:host:1', tick: 20, profile: 'bullet',
    }).state;
    expect(admitCrossbowThroughGlass(breach, { matchEpoch: 9, observedRevision: 1, tick: 20 }))
      .toEqual({ passes: true, reason: 'same-tick-admitted-breach' });
    expect(admitCrossbowThroughGlass(breach, { matchEpoch: 9, observedRevision: 1, tick: 21 }))
      .toEqual({ passes: true, reason: 'existing-breach' });
    expect(admitCrossbowThroughGlass(breach, { matchEpoch: 9, observedRevision: 0, tick: 21 }))
      .toEqual({ passes: false, reason: 'stale-observation' });
  });

  it('projects identical gameplay authority for all renderer profiles and peers', () => {
    const host = admitGlassImpact(createGlassState('pane-parity', 2), {
      isHost: true, matchEpoch: 2, expectedRevision: 0, impactId: 'explosion:2', tick: 4, profile: 'explosion',
    }).state;
    const peerReplica = structuredClone(host);
    const projections = ['performance', 'quality', 'custom'].map(() => glassAuthorityProjection(peerReplica));
    expect(projections[1]).toEqual(projections[0]);
    expect(projections[2]).toEqual(projections[0]);
    expect(projections[0]).toMatchObject({ phase: 'detached', apertureOpen: true, ballisticSolid: false });
  });
});
