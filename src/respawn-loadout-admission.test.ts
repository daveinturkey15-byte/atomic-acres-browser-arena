import { describe, expect, it } from 'vitest';
import { clampAdmittedHeldWeapon } from './multiplayer-relay';
import type { PlayerSnapshot } from './protocol';
import {
  admitAuthoritativeRespawnLoadout,
  authoredRespawnLoadout,
} from './respawn-loadout-authority';

function snapshot(overrides: Partial<PlayerSnapshot>): PlayerSnapshot {
  return {
    id: 'guest-a',
    name: 'guest-a',
    team: 0,
    x: 0,
    y: 1.7,
    z: 0,
    yaw: 0,
    pitch: 0,
    hp: 100,
    kills: 0,
    deaths: 0,
    primary: 'm4a1',
    secondary: 'pistol',
    grenade: 'flash',
    weapon: 'm4a1',
    seq: 10,
    ...overrides,
  };
}

describe('admitAuthoritativeRespawnLoadout', () => {
  it('preserves a legitimate secondary swap on continuous state', () => {
    const incoming = snapshot({ weapon: 'pistol', hp: 84, seq: 11 });
    const admitted = admitAuthoritativeRespawnLoadout(
      incoming,
      { primary: 'm4a1', secondary: 'pistol', grenade: 'flash' },
      { respawned: false, redeployed: false },
      84,
    );
    expect(admitted.weapon).toBe('pistol');
    expect(admitted.primary).toBe('m4a1');
    expect(admitted.secondary).toBe('pistol');
    expect(admitted.hp).toBe(84);
  });

  it('resets to the host-retained canonical loadout on a real respawn', () => {
    const incoming = snapshot({ weapon: 'railgun', primary: 'm4a1', hp: 100, seq: 12 });
    const admitted = admitAuthoritativeRespawnLoadout(
      incoming,
      { primary: 'm4a1', secondary: 'pistol', grenade: 'flash' },
      { respawned: true, redeployed: false },
      100,
    );
    expect(admitted).toMatchObject(authoredRespawnLoadout({
      primary: 'm4a1',
      secondary: 'pistol',
      grenade: 'flash',
    }));
    expect(admitted.hp).toBe(100);
  });

  it('resets to the authorized incoming selection on redeploy', () => {
    const incoming = snapshot({
      weapon: 'machine-pistol',
      primary: 'smg',
      secondary: 'machine-pistol',
      grenade: 'smoke',
      hp: 100,
      seq: 13,
    });
    const admitted = admitAuthoritativeRespawnLoadout(
      incoming,
      { primary: 'm4a1', secondary: 'pistol', grenade: 'flash' },
      { respawned: false, redeployed: true },
      100,
    );
    expect(admitted).toMatchObject(authoredRespawnLoadout({
      primary: 'smg',
      secondary: 'machine-pistol',
      grenade: 'smoke',
    }));
  });

  it('leaves a forged continuous claim visible so the allow-list fence still rejects it', () => {
    const incoming = snapshot({ weapon: 'sniper', hp: 100, seq: 14 });
    const admitted = admitAuthoritativeRespawnLoadout(
      incoming,
      { primary: 'm4a1', secondary: 'pistol', grenade: 'flash' },
      { respawned: false, redeployed: false },
      100,
    );
    expect(admitted.weapon).toBe('sniper');
    expect(clampAdmittedHeldWeapon(admitted, 'pistol').weapon).toBe('m4a1');
  });
});
