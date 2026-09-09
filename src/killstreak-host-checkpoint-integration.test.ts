import { describe, expect, it } from 'vitest';
import { parseKillstreakLoadout } from './killstreak-catalog';
import { HostKillstreakRuntime } from './killstreak-runtime';
import {
  HOST_MATCH_CHECKPOINT_SCHEMA_VERSION,
  HOST_MATCH_CHECKPOINT_TTL_MS,
  checkpointRailgunAuthority,
  isHostMatchCheckpoint,
  type HostMatchCheckpoint,
} from './host-match-checkpoint';
import { MULTIPLAYER_PROTOCOL_VERSION, WEAPON_IDS, type WeaponId } from './protocol';
import { createRailgunAuthorityState } from './railgun-authority';
import { FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION } from './flare-authority-checkpoint';

function counters(value: number): Record<WeaponId, number> {
  return Object.fromEntries(WEAPON_IDS.map((weapon) => [weapon, value])) as Record<WeaponId, number>;
}

function baseCheckpoint(killstreak?: HostMatchCheckpoint['killstreak']): HostMatchCheckpoint {
  const savedAtEpochMs = 1_000_000;
  const activeAtEpochMs = 997_000;
  return {
    schemaVersion: HOST_MATCH_CHECKPOINT_SCHEMA_VERSION,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    savedAtEpochMs,
    expiresAtEpochMs: savedAtEpochMs + HOST_MATCH_CHECKPOINT_TTL_MS,
    roomCode: 'killstreak-room',
    activeAtEpochMs,
    matchEpoch: activeAtEpochMs,
    phase: 'active',
    elapsedSinceActiveMs: 3_000,
    lobbyRevision: 5,
    config: {
      arenaId: 'atomic-acres', mode: 'ffa', capacity: 4, hostedBotCount: 0,
      autoBalance: false, durationMs: 300_000, scoreLimit: null,
    },
    members: [{ id: 'host-1', name: 'HOST', team: 0, ready: true, connected: true, pingMs: 0, dhv: 10 }],
    scores: [{ id: 'host-1', kills: 30, deaths: 0, damageDealt: 3_000, damageTaken: 0 }],
    hostPlayer: {
      id: 'host-1', name: 'HOST', team: 0,
      x: 0, y: 1.7, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
      hp: 100, alive: true, kills: 30, deaths: 0,
      primary: 'm4a1', secondary: 'pistol', grenade: 'frag', weapon: 'm4a1', stance: 'stand', grenades: 1,
      ammo: counters(10), reserve: counters(50), continuity: 3, seq: 42,
      respawnRemainingMs: 0, invulnerabilityRemainingMs: 0,
    },
    guests: [],
    bots: [],
    resumeTokenDigests: [],
    flareProjectiles: { schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION, snapshotSeq: 0, effects: [] },
    flareShotFeedback: [],
    railgun: checkpointRailgunAuthority(createRailgunAuthorityState('disabled', 0, 0, 1), 5_000)!,
    ...(killstreak ? { killstreak } : {}),
  };
}

describe('host checkpoint killstreak integration', () => {
  it('accepts current schema-v3 state and strict optional ladder authority', () => {
    const runtime = new HostKillstreakRuntime(997_000);
    runtime.registerActor('host-1', 0, 3, parseKillstreakLoadout({
      schemaVersion: 1,
      slots: ['adrenaline', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
    }));
    for (let index = 0; index < 30; index += 1) runtime.recordEligibleElimination('host-1', 'weapon');
    const killstreak = runtime.checkpoint(5_000)!;

    expect(HOST_MATCH_CHECKPOINT_SCHEMA_VERSION).toBe(3);
    expect(isHostMatchCheckpoint(baseCheckpoint(), MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    expect(isHostMatchCheckpoint(baseCheckpoint(killstreak), MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
  });

  it('rejects epoch, host-life, team and key smuggling mismatches', () => {
    const runtime = new HostKillstreakRuntime(997_000);
    runtime.registerActor('host-1', 0, 3, parseKillstreakLoadout({
      schemaVersion: 1,
      slots: ['adrenaline', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
    }));
    const killstreak = runtime.checkpoint(5_000)!;
    expect(isHostMatchCheckpoint(baseCheckpoint({ ...killstreak, matchEpoch: 997_001 }))).toBe(false);
    expect(isHostMatchCheckpoint(baseCheckpoint({
      ...killstreak,
      actors: [{ ...killstreak.actors[0], lifeId: 4 }],
    }))).toBe(false);
    expect(isHostMatchCheckpoint(baseCheckpoint({
      ...killstreak,
      actors: [{ ...killstreak.actors[0], team: 1 }],
    }))).toBe(false);
    expect(isHostMatchCheckpoint({ ...baseCheckpoint(killstreak), injected: 'nope' })).toBe(false);
  });
});
