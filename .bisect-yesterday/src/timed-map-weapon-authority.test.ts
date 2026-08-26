import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import {
  TIMED_MAP_WEAPON_DEFINITIONS,
  advanceTimedMapWeaponAuthority,
  claimTimedMapWeapon,
  consumeTimedMapWeaponShot,
  createTimedMapWeaponAuthority,
  dropTimedMapWeapon,
  grantTrainingTimedMapWeapon,
  isStaleTimedMapWeaponAuthority,
  isTimedMapWeaponAuthorityState,
} from './timed-map-weapon-authority';

describe('timed map weapon authority', () => {
  it('places both pickups on authored, accessible route anchors rather than inside collision', () => {
    const scene = new THREE.Scene();
    const rustworks = buildRustworks1v1(scene);
    const terminal = buildSkylineTerminal(scene);
    const flame = TIMED_MAP_WEAPON_DEFINITIONS.flamethrower.spawnPosition;
    const flare = TIMED_MAP_WEAPON_DEFINITIONS['flare-gun'].spawnPosition;
    const rustAnchor = (rustworks.root.userData.rustworksRoutes['lower-to-upper'] as Array<{ id: string; position: number[] }>)
      .find((entry) => entry.id === 'upper-deck-center')!.position;
    const terminalAnchor = (terminal.root.userData.skylineRoutes['cabin-through-aisle'] as Array<{ id: string; position: number[] }>)
      .find((entry) => entry.id === 'cabin-mid')!.position;
    expect(Math.hypot(flame[0] - rustAnchor[0], flame[2] - rustAnchor[2])).toBeLessThan(0.25);
    expect(Math.hypot(flare[0] - terminalAnchor[0], flare[2] - terminalAnchor[2])).toBeLessThan(0.01);

    const insideSolid = (map: typeof rustworks, point: readonly [number, number, number]): boolean => map.physicsColliders.some((box) => (
      point[0] >= box.minX && point[0] <= box.maxX && point[2] >= box.minZ && point[2] <= box.maxZ
      && point[1] >= (box.minY ?? Number.NEGATIVE_INFINITY) && point[1] <= (box.maxY ?? Number.POSITIVE_INFINITY)
    ));
    expect(insideSolid(rustworks, flame)).toBe(false);
    expect(insideSolid(terminal, flare)).toBe(false);
  });

  it.each([
    ['flamethrower', 'rustworks-1v1'],
    ['flare-gun', 'skyline-terminal'],
  ] as const)('schedules %s at the exact match midpoint on its authored map', (weaponId, arenaId) => {
    const state = createTimedMapWeaponAuthority(weaponId, arenaId, 1_000, 301_000, 7);
    expect(state).toMatchObject({
      weaponId,
      arenaId,
      generation: 7,
      status: 'scheduled',
      spawnAtHostTimeMs: 151_000,
      pickupPosition: TIMED_MAP_WEAPON_DEFINITIONS[weaponId].spawnPosition,
    });
    expect(advanceTimedMapWeaponAuthority(state, 150_999)).toMatchObject({ spawned: false, announcement: null });
    const spawned = advanceTimedMapWeaponAuthority(state, 151_000);
    expect(spawned).toMatchObject({
      spawned: true,
      announcement: TIMED_MAP_WEAPON_DEFINITIONS[weaponId].announcement,
      state: { status: 'available', announcementSent: true, revision: 1 },
    });
    expect(isTimedMapWeaponAuthorityState(spawned.state)).toBe(true);
  });

  it('fails closed on the wrong arena, infinite rounds, and malformed times', () => {
    expect(createTimedMapWeaponAuthority('flamethrower', 'skyline-terminal', 0, 300_000).status).toBe('disabled');
    expect(createTimedMapWeaponAuthority('flare-gun', 'skyline-terminal', 0, Number.POSITIVE_INFINITY).status).toBe('disabled');
    expect(createTimedMapWeaponAuthority('flare-gun', 'skyline-terminal', 20, 20).status).toBe('disabled');
  });

  it('allows one holder, preserves finite ammo on a drop, and deduplicates host shots', () => {
    const scheduled = createTimedMapWeaponAuthority('flare-gun', 'skyline-terminal', 0, 100, 3);
    const available = advanceTimedMapWeaponAuthority(scheduled, 50).state;
    const claim = claimTimedMapWeapon(available, 'player-a', 3);
    expect(claim.accepted).toBe(true);
    expect(claimTimedMapWeapon(claim.state, 'player-b', 3).accepted).toBe(false);

    const fired = consumeTimedMapWeaponShot(claim.state, 'player-a', 'shot-id-0001');
    expect(fired).toMatchObject({ accepted: true, duplicate: false, state: { shotsRemaining: 5 } });
    expect(consumeTimedMapWeaponShot(fired.state, 'player-a', 'shot-id-0001')).toMatchObject({
      accepted: false,
      duplicate: true,
      state: { shotsRemaining: 5 },
    });
    const drop = dropTimedMapWeapon(fired.state, 'player-a', [4, 2, -1]);
    expect(drop).toMatchObject({
      dropped: true,
      state: { status: 'available', holderId: null, pickupPosition: [4, 2, -1], shotsRemaining: 5 },
    });
    expect(claimTimedMapWeapon(drop.state, 'player-b', 3).accepted).toBe(true);
  });

  it('depletes exactly at the canonical limit', () => {
    let state = claimTimedMapWeapon(
      advanceTimedMapWeaponAuthority(
        createTimedMapWeaponAuthority('flare-gun', 'skyline-terminal', 0, 100),
        50,
      ).state,
      'player-a',
      1,
    ).state;
    for (let index = 0; index < TIMED_MAP_WEAPON_DEFINITIONS['flare-gun'].totalShots; index += 1) {
      const result = consumeTimedMapWeaponShot(state, 'player-a', `shot-id-${String(index).padStart(4, '0')}`);
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(state).toMatchObject({ status: 'depleted', shotsRemaining: 0, holderId: 'player-a' });
    expect(consumeTimedMapWeaponShot(state, 'player-a', 'shot-id-more')).toMatchObject({ accepted: false, reason: 'empty' });
    expect(dropTimedMapWeapon(state, 'player-a', [0, 0, 0])).toMatchObject({
      dropped: true,
      state: { status: 'depleted', holderId: null, pickupPosition: null, shotsRemaining: 0 },
    });
  });

  it('re-arms only from an offline or host-owned secure test-bay station', () => {
    const disabled = createTimedMapWeaponAuthority('flamethrower', 'gun-range', 0, 100, 8);
    expect(grantTrainingTimedMapWeapon(disabled, 'player-a', {
      arenaId: 'gun-range', stationKind: 'secure-test-bay', authorityRole: 'offline',
    })).toMatchObject({
      accepted: true,
      state: { status: 'held', holderId: 'player-a', shotsRemaining: 200, spawnAtHostTimeMs: null },
    });
    expect(grantTrainingTimedMapWeapon(disabled, 'player-a', {
      arenaId: 'gun-range', stationKind: 'secure-test-bay', authorityRole: 'host',
    }).accepted).toBe(true);
    expect(grantTrainingTimedMapWeapon(disabled, 'player-a', {
      arenaId: 'gun-range', stationKind: 'secure-test-bay', authorityRole: 'client' as never,
    }).accepted).toBe(false);
  });

  it('rejects stale generations/revisions and strict-decoder field smuggling', () => {
    const current = createTimedMapWeaponAuthority('flamethrower', 'rustworks-1v1', 0, 100, 4);
    expect(isStaleTimedMapWeaponAuthority(current, { ...current, generation: 3, revision: 99 })).toBe(true);
    expect(isStaleTimedMapWeaponAuthority(current, { ...current, revision: -1 })).toBe(true);
    expect(isStaleTimedMapWeaponAuthority(current, { ...current, weaponId: 'flare-gun', arenaId: 'skyline-terminal' })).toBe(true);
    expect(isTimedMapWeaponAuthorityState({ ...current, injected: true })).toBe(false);
    expect(isTimedMapWeaponAuthorityState({ ...current, status: 'held', holderId: null })).toBe(false);
  });
});
