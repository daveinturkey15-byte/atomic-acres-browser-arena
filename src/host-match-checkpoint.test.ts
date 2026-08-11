import { describe, expect, it } from 'vitest';
import { WEAPON_IDS, MULTIPLAYER_PROTOCOL_VERSION, type WeaponId } from './protocol';
import {
  HOST_MATCH_CHECKPOINT_SCHEMA_VERSION,
  HOST_MATCH_CHECKPOINT_STORAGE_KEY,
  HOST_MATCH_CHECKPOINT_TTL_MS,
  checkpointGuestAuthority,
  checkpointRailgunAuthority,
  checkpointTimedMapWeaponAuthorities,
  isHostMatchCheckpoint,
  loadHostMatchCheckpoint,
  resolveHostMatchResumeTiming,
  restoreGuestAuthorities,
  restoreRailgunAuthority,
  restoreTimedMapWeaponAuthorities,
  resumeTokenMatchesDigest,
  saveHostMatchCheckpoint,
  sha256ResumeToken,
  type HostMatchCheckpoint,
} from './host-match-checkpoint';
import { createTimedMapWeaponAuthority } from './timed-map-weapon-authority';
import {
  advanceRailgunAuthority,
  claimRailgun,
  createRailgunAuthorityState,
  fireRailgun,
} from './railgun-authority';
import { applyAuthoritativeRemoteDamage, createRemoteHealthAuthorityState } from './remote-health-authority';
import { createGuestCombatInventory } from './guest-combat-inventory-authority';
import type {
  FlareAuthorityContinuationCheckpoint,
  FlareShooterFeedbackCheckpoint,
} from './flare-authority-checkpoint';
import { FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION } from './flare-authority-checkpoint';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function weaponCounters(value: number): Record<WeaponId, number> {
  return Object.fromEntries(WEAPON_IDS.map((weapon) => [weapon, value])) as Record<WeaponId, number>;
}

function activeGuestFlare(ownerId = 'guest-1', actionNonce = 91): FlareAuthorityContinuationCheckpoint {
  return Object.freeze({
    schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
    snapshotSeq: 4,
    effects: Object.freeze([Object.freeze({
      ownerId,
      ownerTeam: 1,
      actionNonce,
      phase: 'flight',
      position: Object.freeze([0, 2, 0] as const),
      velocity: Object.freeze([52, 0, 0] as const),
      remainingMs: 4_500,
      directHitDelivered: false,
      nextBurnPulseRemainingMs: null,
      burnPulseIndex: 0,
    })]),
  });
}

function activeGuestFlareFeedback(
  ownerId = 'guest-1',
  actionNonce = 91,
): FlareShooterFeedbackCheckpoint {
  return Object.freeze({
    ownerId,
    actionNonce,
    shotId: `epochabcd:${actionNonce}`,
    connectionEpoch: 'epoch_abcd',
    lifeId: 3,
    shotSeq: 8,
    weaponSequence: 2,
    fireTimeMs: 1_000,
    triggerStartedAtMs: 1_000,
    targetViewTimeMs: 950,
    origin: Object.freeze([0, 2, 0] as const),
    direction: Object.freeze([1, 0, 0] as const),
    pelletDirections: Object.freeze([
      Object.freeze([1, 0, 0] as const),
    ]) as readonly [readonly [number, number, number]],
    receivedAtHostTimeMs: 1_010,
    appliedRewindMs: 60,
    remainingMs: 9_000,
  });
}

function checkpoint(overrides: Partial<HostMatchCheckpoint> = {}): HostMatchCheckpoint {
  const savedAtEpochMs = 1_000_000;
  return {
    schemaVersion: HOST_MATCH_CHECKPOINT_SCHEMA_VERSION,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    savedAtEpochMs,
    expiresAtEpochMs: savedAtEpochMs + HOST_MATCH_CHECKPOINT_TTL_MS,
    roomCode: 'atomic-room-a',
    activeAtEpochMs: 997_000,
    matchEpoch: 997_000,
    phase: 'active',
    elapsedSinceActiveMs: 45_000,
    lobbyRevision: 17,
    config: {
      arenaId: 'atomic-acres',
      mode: 'tdm',
      capacity: 4,
      hostedBotCount: 2,
      autoBalance: true,
      durationMs: 300_000,
    },
    members: [
      { id: 'host-1', name: 'HOST', team: 0, ready: true, connected: true, pingMs: 0, dhv: 10 },
      { id: 'guest-1', name: 'GUEST', team: 1, ready: true, connected: true, pingMs: 42, dhv: 10 },
    ],
    scores: [
      { id: 'host-1', kills: 4, deaths: 2, damageDealt: 810, damageTaken: 400 },
      { id: 'guest-1', kills: 2, deaths: 4, damageDealt: 400, damageTaken: 810 },
      { id: 'host-bot-0', kills: 1, deaths: 3, damageDealt: 120, damageTaken: 510 },
      { id: 'host-bot-1', kills: 3, deaths: 1, damageDealt: 510, damageTaken: 120 },
    ],
    hostPlayer: {
      id: 'host-1', name: 'HOST', team: 0,
      x: 1, y: 1.7, z: -2, yaw: 0.4, pitch: -0.1,
      vx: 0.2, vy: 0, vz: -0.1,
      hp: 72, alive: true, kills: 4, deaths: 2,
      primary: 'm4a1', secondary: 'pistol', grenade: 'frag', weapon: 'm4a1', stance: 'crouch', grenades: 1,
      ammo: weaponCounters(9), reserve: weaponCounters(40), continuity: 3, seq: 221,
      respawnRemainingMs: 0, invulnerabilityRemainingMs: 0,
    },
    guests: [{
      snapshot: {
        id: 'guest-1', name: 'GUEST', team: 1,
        x: -3, y: 1.7, z: 6, yaw: -0.2, pitch: 0.1,
        hp: 100, kills: 2, deaths: 4,
        primary: 'carbine', secondary: 'pistol', grenade: 'frag', weapon: 'carbine', stance: 'stand', seq: 119,
      },
      continuity: 3,
      combatInventory: createGuestCombatInventory('carbine', 'pistol', 1),
      health: {
        hp: 100, alive: true, respawnRemainingMs: 0, diedAgeMs: null,
        lastDamageAgeMs: 0, lastAdvancedAgeMs: 0,
      },
    }],
    bots: [0, 1].map((index) => ({
      snapshot: {
        id: `host-bot-${index}`,
        name: index === 0 ? 'RIVET' : 'MICA',
        team: 1,
        weapon: 'carbine',
        x: 5 + index,
        y: 0,
        z: -4,
        yaw: 1.2,
        hp: 100,
        kills: index === 0 ? 1 : 3,
        deaths: index === 0 ? 3 : 1,
        alive: true,
        seq: 18,
      },
      grenade: 'frag',
      continuity: 4,
      vx: 0, vy: 0, vz: 0,
      waypoint: index,
      strafeSign: index === 0 ? 1 : -1,
      respawnRemainingMs: 0,
      invulnerabilityRemainingMs: 0,
      nextGrenadeRemainingMs: 1_000,
    })),
    resumeTokenDigests: [{
      playerId: 'guest-1',
      sha256: 'a'.repeat(64),
      expiresAtEpochMs: savedAtEpochMs + HOST_MATCH_CHECKPOINT_TTL_MS,
    }],
    flareProjectiles: { schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION, snapshotSeq: 0, effects: [] },
    flareShotFeedback: [],
    railgun: checkpointRailgunAuthority(createRailgunAuthorityState('disabled', 0, 0, 7), 1_000)!,
    timedMapWeapons: checkpointTimedMapWeaponAuthorities({
      flamethrower: createTimedMapWeaponAuthority('flamethrower', 'atomic-acres', 0, 10_000, 7),
      'flare-gun': createTimedMapWeaponAuthority('flare-gun', 'atomic-acres', 0, 10_000, 7),
    }, 1_000)!,
    ...overrides,
  };
}

describe('host active-match checkpoint', () => {
  it('round-trips a bounded local-only checkpoint and advances its authoritative clock through downtime', () => {
    const storage = new MemoryStorage();
    const rawResumeToken = '12345678-1234-1234-1234-123456789abc';
    const value = checkpoint({
      resumeTokenDigests: [{
        playerId: 'guest-1',
        sha256: 'ae1908d5eef6b8c28eabe4fa8de4651e385766446731b918a3dfdaeaed5ece16',
        expiresAtEpochMs: 1_000_000 + HOST_MATCH_CHECKPOINT_TTL_MS,
      }],
    });
    expect(isHostMatchCheckpoint(value, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    expect(HOST_MATCH_CHECKPOINT_STORAGE_KEY).toBe('atomic-acres:host-match-checkpoint:v3');
    expect(saveHostMatchCheckpoint(storage, value)).toBe(true);
    const restored = loadHostMatchCheckpoint(storage, MULTIPLAYER_PROTOCOL_VERSION, value.roomCode, 1_010_000);
    expect(restored).toEqual(value);
    expect(resolveHostMatchResumeTiming(restored!, 1_010_000, 500)).toEqual({
      activeAtLocalMonoMs: -54_500,
      elapsedSinceActiveMs: 55_000,
      remainingMs: 245_000,
      phase: 'active',
    });
    const serialized = storage.getItem(HOST_MATCH_CHECKPOINT_STORAGE_KEY)!;
    expect(serialized).not.toContain(rawResumeToken);
    expect(serialized).not.toContain('"resumeToken":');
  });

  it('preserves a warmup only for the portion not consumed while the host was down', () => {
    const value = checkpoint({ phase: 'warmup', elapsedSinceActiveMs: -2_500 });
    expect(resolveHostMatchResumeTiming(value, 1_001_000, 10_000)).toEqual({
      activeAtLocalMonoMs: 11_500,
      elapsedSinceActiveMs: -1_500,
      remainingMs: 300_000,
      phase: 'warmup',
    });
    expect(resolveHostMatchResumeTiming(value, 1_004_000, 10_000)).toEqual({
      activeAtLocalMonoMs: 8_500,
      elapsedSinceActiveMs: 1_500,
      remainingMs: 298_500,
      phase: 'active',
    });
  });

  it('persists both timed pickups exactly and rebases a scheduled spawn across downtime', () => {
    const states = {
      flamethrower: createTimedMapWeaponAuthority('flamethrower', 'rustworks-1v1', 0, 10_000, 9),
      'flare-gun': createTimedMapWeaponAuthority('flare-gun', 'atomic-acres', 0, 10_000, 9),
    } as const;
    const persisted = checkpointTimedMapWeaponAuthorities(states, 1_000)!;
    expect(Object.keys(persisted).sort()).toEqual(['flamethrower', 'flare-gun'].sort());
    expect(persisted.flamethrower.spawnRemainingMs).toBe(4_000);
    const restored = restoreTimedMapWeaponAuthorities({
      savedAtEpochMs: 1_000_000,
      timedMapWeapons: persisted,
    }, 1_002_000, 50)!;
    expect(restored.flamethrower.spawnAtHostTimeMs).toBe(2_050);
    const overdue = restoreTimedMapWeaponAuthorities({
      savedAtEpochMs: 1_000_000,
      timedMapWeapons: persisted,
    }, 1_005_000, 75)!;
    expect(overdue.flamethrower).toMatchObject({ status: 'scheduled', spawnAtHostTimeMs: 75 });
  });

  it('preserves scheduled, available, held and depleted railgun authority across a host crash', () => {
    const scheduled = createRailgunAuthorityState('atomic-acres', 1_000, 0, 12);
    const scheduledCheckpoint = checkpointRailgunAuthority(scheduled, 2_000)!;
    expect(scheduledCheckpoint).toMatchObject({ status: 'scheduled', spawnRemainingMs: 179_000, roundsRemaining: 8 });
    expect(restoreRailgunAuthority({ savedAtEpochMs: 1_000_000, railgun: scheduledCheckpoint }, 1_004_000, 50))
      .toMatchObject({ status: 'scheduled', spawnAtHostTimeMs: 175_050, roundsRemaining: 8 });

    const available = advanceRailgunAuthority(scheduled, scheduled.spawnAtHostTimeMs!).state;
    const availableCheckpoint = checkpointRailgunAuthority(available, 181_000)!;
    expect(restoreRailgunAuthority({ savedAtEpochMs: 1_000_000, railgun: availableCheckpoint }, 1_001_000, 75))
      .toMatchObject({ status: 'available', holderId: null, roundsRemaining: 8, announcementSent: true });

    const held = claimRailgun(available, 'guest-1', available.generation).state;
    const fired = fireRailgun(held, 'guest-1', 'epochabcd:shot-1', 181_100).state;
    const heldCheckpoint = checkpointRailgunAuthority(fired, 181_200)!;
    expect(heldCheckpoint).toMatchObject({
      status: 'held', holderId: 'guest-1', roundsRemaining: 7, chamberRemainingMs: 1_400,
    });
    expect(restoreRailgunAuthority({ savedAtEpochMs: 1_000_000, railgun: heldCheckpoint }, 1_000_600, 20))
      .toMatchObject({
        status: 'held', holderId: 'guest-1', roundsRemaining: 7,
        chamberReadyAtHostTimeMs: 820, processedShotIds: ['epochabcd:shot-1'],
      });

    let depleted = held;
    for (let index = 0; index < 8; index += 1) {
      depleted = fireRailgun(depleted, 'guest-1', `epochabcd:deplete-${index}`, 200_000 + index * 2_000).state;
    }
    const depletedCheckpoint = checkpointRailgunAuthority(depleted, 220_000)!;
    expect(restoreRailgunAuthority({ savedAtEpochMs: 1_000_000, railgun: depletedCheckpoint }, 1_003_000, 100))
      .toMatchObject({ status: 'depleted', holderId: 'guest-1', roundsRemaining: 0, chamberReadyAtHostTimeMs: 0 });
  });

  it('restores a damaged guest pose, loadout and host-owned health timers without healing on reconnect', () => {
    const damaged = applyAuthoritativeRemoteDamage(createRemoteHealthAuthorityState(true, 900), 35, 1_000).state;
    const guest = checkpointGuestAuthority({
      id: 'guest-1', name: 'GUEST', team: 1,
      x: 12, y: 1.7, z: -9, yaw: 0.7, pitch: -0.2,
      hp: 65, kills: 2, deaths: 4,
      primary: 'm14-ebr', secondary: 'machine-pistol', grenade: 'semtex',
      weapon: 'm14-ebr', stance: 'prone', seq: 444,
    }, 9, damaged, createGuestCombatInventory('m14-ebr', 'machine-pistol', 0), 1_000)!;
    const restored = restoreGuestAuthorities({
      savedAtEpochMs: 1_000_000,
      guests: [guest],
    }, 1_002_000, 50)![0];
    expect(restored.snapshot).toMatchObject({
      x: 12, y: 1.7, z: -9, primary: 'm14-ebr', secondary: 'machine-pistol',
      grenade: 'semtex', weapon: 'm14-ebr', stance: 'prone', hp: 65,
    });
    expect(restored).toMatchObject({
      continuity: 9,
      combatInventory: { grenades: 0 },
      health: { hp: 65, alive: true },
    });

    const regenerated = restoreGuestAuthorities({
      savedAtEpochMs: 1_000_000,
      guests: [guest],
    }, 1_006_000, 50)![0];
    expect(regenerated.health.hp).toBe(83);
    expect(regenerated.snapshot.hp).toBe(83);
  });

  it('fails closed and deletes stale, wrong-room, wrong-protocol and match-expired checkpoints', () => {
    for (const [protocol, room, now] of [
      [MULTIPLAYER_PROTOCOL_VERSION, 'atomic-room-a', 1_000_000 + HOST_MATCH_CHECKPOINT_TTL_MS],
      [MULTIPLAYER_PROTOCOL_VERSION, 'different-room', 1_001_000],
      [MULTIPLAYER_PROTOCOL_VERSION + 1, 'atomic-room-a', 1_001_000],
      [MULTIPLAYER_PROTOCOL_VERSION, 'atomic-room-a', 1_260_000],
    ] as const) {
      const storage = new MemoryStorage();
      const value = checkpoint();
      storage.setItem(HOST_MATCH_CHECKPOINT_STORAGE_KEY, JSON.stringify(value));
      expect(loadHostMatchCheckpoint(storage, protocol, room, now)).toBeNull();
      expect(storage.getItem(HOST_MATCH_CHECKPOINT_STORAGE_KEY)).toBeNull();
    }
  });

  it('rejects schema smuggling, missing guest credentials and score drift', () => {
    const valid = checkpoint();
    const { guests: _missingGuests, ...withoutGuests } = valid;
    const { railgun: _missingRailgun, ...withoutRailgun } = valid;
    expect(isHostMatchCheckpoint({ ...valid, rawResumeToken: 'do-not-store-this' }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint(withoutGuests, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint(withoutRailgun, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      guests: valid.guests.map((guest) => {
        const { combatInventory: _missingInventory, ...withoutInventory } = guest;
        return withoutInventory;
      }),
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      guests: valid.guests.map((guest) => ({
        ...guest,
        combatInventory: {
          ...guest.combatInventory,
          ammo: { ...guest.combatInventory.ammo, carbine: 9_999 },
        },
      })),
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({ ...valid, resumeTokenDigests: [] }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({ ...valid, scores: valid.scores.filter((score) => score.id !== 'guest-1') }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({ ...valid, matchEpoch: valid.matchEpoch + 1 }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      timedMapWeapons: { flamethrower: valid.timedMapWeapons!.flamethrower },
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      timedMapWeapons: {
        ...valid.timedMapWeapons!,
        flamethrower: { ...valid.timedMapWeapons!.flamethrower, generation: '7' },
      },
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      timedMapWeapons: {
        ...valid.timedMapWeapons!,
        flamethrower: checkpointTimedMapWeaponAuthorities({
          flamethrower: createTimedMapWeaponAuthority('flamethrower', 'rustworks-1v1', 0, 10_000, 7),
          'flare-gun': createTimedMapWeaponAuthority('flare-gun', 'atomic-acres', 0, 10_000, 7),
        }, 1_000)!.flamethrower,
      },
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      timedMapWeapons: {
        ...valid.timedMapWeapons!,
        flamethrower: {
          ...valid.timedMapWeapons!.flamethrower,
          status: 'held', pickupPosition: null, holderId: 'not-a-match-member', shotsRemaining: 5,
        },
      },
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      bots: valid.bots.map((bot, index) => index === 0
        ? { ...bot, snapshot: { ...bot.snapshot, kills: bot.snapshot.kills + 1 } }
        : bot),
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      resumeTokenDigests: valid.resumeTokenDigests.map((entry) => ({ ...entry, expiresAtEpochMs: entry.expiresAtEpochMs - 1 })),
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);

    const available = advanceRailgunAuthority(
      createRailgunAuthorityState('atomic-acres', 0, 0, 8),
      180_000,
    ).state;
    const held = claimRailgun(available, 'guest-1', available.generation).state;
    const heldRailgun = checkpointRailgunAuthority(held, 181_000)!;
    expect(isHostMatchCheckpoint({ ...valid, railgun: heldRailgun }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      railgun: heldRailgun,
      guests: valid.guests.map((guest) => ({
        ...guest,
        snapshot: { ...guest.snapshot, weapon: 'railgun' },
      })),
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
  });

  it('requires canonical flare continuation and guest-only feedback on Terminal or the secure range', () => {
    const base = checkpoint();
    const flareProjectiles = activeGuestFlare();
    const flareShotFeedback = Object.freeze([activeGuestFlareFeedback()]);
    const valid = checkpoint({
      config: { ...base.config, arenaId: 'skyline-terminal' },
      timedMapWeapons: checkpointTimedMapWeaponAuthorities({
        flamethrower: createTimedMapWeaponAuthority('flamethrower', 'skyline-terminal', 0, 10_000, 7),
        'flare-gun': createTimedMapWeaponAuthority('flare-gun', 'skyline-terminal', 0, 10_000, 7),
      }, 1_000)!,
      flareProjectiles,
      flareShotFeedback,
    });
    expect(isHostMatchCheckpoint(valid, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);

    const { flareProjectiles: _missingProjectiles, ...withoutProjectiles } = valid;
    const { flareShotFeedback: _missingFeedback, ...withoutFeedback } = valid;
    expect(isHostMatchCheckpoint(withoutProjectiles, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint(withoutFeedback, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      flareProjectiles: {
        ...flareProjectiles,
        effects: flareProjectiles.effects.map((effect) => ({ ...effect, ownerTeam: 0 })),
      },
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      flareProjectiles: activeGuestFlare('unknown-guest', 91),
      flareShotFeedback: [activeGuestFlareFeedback('unknown-guest', 91)],
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      config: base.config,
      timedMapWeapons: base.timedMapWeapons,
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(isHostMatchCheckpoint({
      ...valid,
      flareShotFeedback: [{ ...flareShotFeedback[0]!, resumeToken: 'must-not-persist' }],
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);

    const hostFlare = activeGuestFlare('host-1', 92);
    const hostFeedback = activeGuestFlareFeedback('host-1', 92);
    expect(isHostMatchCheckpoint({
      ...valid,
      flareProjectiles: {
        ...hostFlare,
        effects: hostFlare.effects.map((effect) => ({ ...effect, ownerTeam: 0 })),
      },
      flareShotFeedback: [hostFeedback],
    }, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
  });

  it('authenticates a recovered guest with a SHA-256 digest without persisting the raw token', async () => {
    const token = '12345678-1234-1234-1234-123456789abc';
    const digest = await sha256ResumeToken(token);
    expect(digest).toBe('ae1908d5eef6b8c28eabe4fa8de4651e385766446731b918a3dfdaeaed5ece16');
    expect(await resumeTokenMatchesDigest(token, digest)).toBe(true);
    expect(await resumeTokenMatchesDigest('87654321-4321-4321-4321-cba987654321', digest)).toBe(false);
  });
});
