import { describe, expect, it } from 'vitest';
import {
  HOST_MATCH_CHECKPOINT_MAX_BYTES,
  HOST_MATCH_CHECKPOINT_SCHEMA_VERSION,
  HOST_MATCH_CHECKPOINT_TTL_MS,
  checkpointRailgunAuthority,
  checkpointTimedMapWeaponAuthorities,
  isHostMatchCheckpoint,
  loadHostMatchCheckpoint,
  resolveHostMatchResumeTiming,
  restoreGuestAuthorities,
  restoreRailgunAuthority,
  restoreTimedMapWeaponAuthorities,
  saveHostMatchCheckpoint,
  type GuestAuthorityCheckpoint,
  type HostMatchCheckpoint,
} from './host-match-checkpoint';
import {
  HOST_SUCCESSION_MANDATE_SCHEMA_VERSION,
  HOST_SUCCESSION_MANDATE_TTL_MS,
  MAX_HOST_TERM,
  authorizeSelfPromotion,
  type SuccessionMandate,
} from './host-migration';
import {
  HOST_AUTHORITY_MIRROR_INTERVAL_MS,
  MAX_TRUSTED_MIRROR_CLOCK_OFFSET_MS,
  MIRROR_DROPPABLE_SECTIONS,
  UNCLAIMABLE_RESUME_TOKEN_DIGEST,
  mirrorGrantsAuthorityTo,
  mirrorHostAuthorityToSuccessor,
  rebaseMirroredCheckpointClock,
  type HostAuthorityMirror,
} from './host-authority-mirror';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  ORDINARY_WEAPON_IDS,
  WEAPON_IDS,
  type WeaponId,
} from './protocol';
import { WEAPONS } from './gameplay';
import { createGuestCombatInventory } from './guest-combat-inventory-authority';
import { createTimedMapWeaponAuthority } from './timed-map-weapon-authority';
import { RAILGUN_TOTAL_ROUNDS, createRailgunAuthorityState } from './railgun-authority';
import { FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION } from './flare-authority-checkpoint';
import { DEFAULT_KILLSTREAK_LOADOUT } from './killstreak-loadout';
import {
  KILLSTREAK_RUNTIME_CHECKPOINT_SCHEMA_VERSION,
  type KillstreakActorCheckpoint,
  type KillstreakRuntimeCheckpoint,
} from './killstreak-runtime';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const ROOM = 'atomic-room-a';
const LOBBY_REVISION = 17;
const SAVED_AT = 1_700_000_000_000;
const ACTIVE_AT = SAVED_AT - 45_000;
const MATCH_EPOCH = Math.max(1, ACTIVE_AT % 1_000_000_000);
const EXPIRES_AT = SAVED_AT + HOST_MATCH_CHECKPOINT_TTL_MS;

function weaponCounters(value: number): Record<WeaponId, number> {
  return Object.fromEntries(WEAPON_IDS.map((weapon) => [weapon, value])) as Record<WeaponId, number>;
}

function actor(
  actorId: string,
  team: 0 | 1,
  lifeId: number,
  streak = 0,
): KillstreakActorCheckpoint {
  return {
    actorId,
    team,
    lifeId,
    loadout: DEFAULT_KILLSTREAK_LOADOUT,
    streak,
    cycleProgress: 0,
    earned: [],
    availableCharges: [],
    careRewards: [],
    adrenalineRemainingMs: 0,
    lastActivationSequence: -1,
    lastControlSequence: -1,
  };
}

function killstreak(actors: readonly KillstreakActorCheckpoint[]): KillstreakRuntimeCheckpoint {
  return {
    schemaVersion: KILLSTREAK_RUNTIME_CHECKPOINT_SCHEMA_VERSION,
    matchEpoch: MATCH_EPOCH,
    revision: 12,
    entityCounter: 3,
    activationCounter: 2,
    resultCounter: 5,
    seenActivationRequestIds: [],
    actors,
  };
}

function guestAuthority(
  id: string,
  name: string,
  team: 0 | 1,
  continuity: number,
  overrides: Partial<GuestAuthorityCheckpoint> = {},
): GuestAuthorityCheckpoint {
  return {
    snapshot: {
      id,
      name,
      team,
      x: -3,
      y: 1.7,
      z: 6,
      yaw: -0.2,
      pitch: 0.1,
      hp: 100,
      kills: team === 1 ? 2 : 6,
      deaths: team === 1 ? 4 : 1,
      primary: 'carbine',
      secondary: 'pistol',
      grenade: 'frag',
      weapon: 'carbine',
      stance: 'stand',
      seq: 119,
    },
    continuity,
    combatInventory: createGuestCombatInventory('carbine', 'pistol', 1),
    health: {
      hp: 100,
      alive: true,
      respawnRemainingMs: 0,
      diedAgeMs: null,
      lastDamageAgeMs: 0,
      lastAdvancedAgeMs: 0,
    },
    ...overrides,
  };
}

/**
 * Three humans plus two bots on atomic-acres. `guest-1` is the elected successor
 * (lexicographically lowest connected non-host id).
 */
function checkpoint(overrides: Partial<HostMatchCheckpoint> = {}): HostMatchCheckpoint {
  return {
    schemaVersion: HOST_MATCH_CHECKPOINT_SCHEMA_VERSION,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    savedAtEpochMs: SAVED_AT,
    expiresAtEpochMs: EXPIRES_AT,
    roomCode: ROOM,
    activeAtEpochMs: ACTIVE_AT,
    matchEpoch: MATCH_EPOCH,
    phase: 'active',
    elapsedSinceActiveMs: 45_000,
    lobbyRevision: LOBBY_REVISION,
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
      { id: 'guest-1', name: 'ALPHA', team: 1, ready: true, connected: true, pingMs: 42, dhv: 10 },
      { id: 'guest-2', name: 'BRAVO', team: 0, ready: true, connected: true, pingMs: 55, dhv: 10 },
    ],
    scores: [
      { id: 'host-1', kills: 4, deaths: 2, damageDealt: 810, damageTaken: 400 },
      { id: 'guest-1', kills: 2, deaths: 4, damageDealt: 400, damageTaken: 810 },
      { id: 'guest-2', kills: 6, deaths: 1, damageDealt: 1_200, damageTaken: 220 },
      { id: 'host-bot-0', kills: 1, deaths: 3, damageDealt: 120, damageTaken: 510 },
      { id: 'host-bot-1', kills: 3, deaths: 1, damageDealt: 510, damageTaken: 120 },
    ],
    hostPlayer: {
      id: 'host-1',
      name: 'HOST',
      team: 0,
      x: 1,
      y: 1.7,
      z: -2,
      yaw: 0.4,
      pitch: -0.1,
      vx: 0.2,
      vy: 0,
      vz: -0.1,
      hp: 72,
      alive: true,
      kills: 4,
      deaths: 2,
      primary: 'm4a1',
      secondary: 'pistol',
      grenade: 'frag',
      weapon: 'm4a1',
      stance: 'crouch',
      grenades: 1,
      ammo: weaponCounters(9),
      reserve: weaponCounters(40),
      continuity: 3,
      seq: 221,
      respawnRemainingMs: 0,
      invulnerabilityRemainingMs: 0,
    },
    guests: [
      guestAuthority('guest-1', 'ALPHA', 1, 5),
      guestAuthority('guest-2', 'BRAVO', 0, 2),
    ],
    bots: [0, 1].map((index) => ({
      snapshot: {
        id: `host-bot-${index}`,
        name: index === 0 ? 'RIVET' : 'MICA',
        team: 1,
        weapon: 'carbine' as const,
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
      grenade: 'frag' as const,
      continuity: 4,
      vx: 0,
      vy: 0,
      vz: 0,
      waypoint: index,
      strafeSign: (index === 0 ? 1 : -1) as 1 | -1,
      respawnRemainingMs: 0,
      invulnerabilityRemainingMs: 0,
      nextGrenadeRemainingMs: 1_000,
    })),
    resumeTokenDigests: [
      { playerId: 'guest-1', sha256: 'a'.repeat(64), expiresAtEpochMs: EXPIRES_AT },
      { playerId: 'guest-2', sha256: 'b'.repeat(64), expiresAtEpochMs: EXPIRES_AT },
    ],
    flareProjectiles: { schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION, snapshotSeq: 0, effects: [] },
    flareShotFeedback: [],
    railgun: checkpointRailgunAuthority(createRailgunAuthorityState('disabled', 0, 0, 7), 1_000)!,
    timedMapWeapons: checkpointTimedMapWeaponAuthorities({
      flamethrower: createTimedMapWeaponAuthority('flamethrower', 'atomic-acres', 0, 10_000, 7),
      'flare-gun': createTimedMapWeaponAuthority('flare-gun', 'atomic-acres', 0, 10_000, 7),
    }, 1_000)!,
    killstreak: killstreak([
      actor('guest-1', 1, 5, 1),
      actor('guest-2', 0, 2, 4),
      actor('host-1', 0, 3, 7),
    ]),
    succession: { term: 1, successorId: 'guest-1' },
    ...overrides,
  };
}

/**
 * A match sitting on every schema bound at once: six-player room, four hosted
 * bots, ten score rows, eighty-character participant ids, a full timed-pickup
 * replay guard, a full killstreak activation ledger, and a full flare pool with
 * shooter feedback. This is the largest document `isHostMatchCheckpoint` will
 * accept, and it is deliberately over the 64KB storage cap.
 */
function schemaMaximumCheckpoint(): HostMatchCheckpoint {
  const wide = (prefix: string, index: number) => `${prefix}-${String(index).padStart(72 - prefix.length, '0')}`;
  const guestIds = ['guest-1', 'guest-2', wide('guest', 3), wide('guest', 4), wide('guest', 5)];
  // Hosted bot ids are schema-pinned to /^host-bot-[0-3]$/.
  const botIds = [0, 1, 2, 3].map((index) => `host-bot-${index}`);
  const teamOf = (index: number): 0 | 1 => (index % 2) as 0 | 1;
  const base = checkpoint();
  const inventory = createGuestCombatInventory('carbine', 'pistol', 1);
  // Flare effects and their shooter contexts are stored in canonical
  // (ownerId, actionNonce) order. `guest-1` is left out: it is the successor,
  // and its contexts are supposed to be dropped by the mirror.
  const flareOwners = guestIds
    .map((id, index) => ({ id, team: teamOf(index) }))
    .filter((owner) => owner.id !== 'guest-1')
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  const effects = flareOwners.flatMap((owner) => [1, 2, 3].map((nonce) => ({
    ownerId: owner.id,
    ownerTeam: owner.team,
    actionNonce: nonce,
    phase: 'flight' as const,
    position: [0, 2, 0] as readonly [number, number, number],
    velocity: [52, 0, 0] as readonly [number, number, number],
    remainingMs: 4_500,
    directHitDelivered: false,
    nextBurnPulseRemainingMs: null,
    burnPulseIndex: 0,
  })));
  const feedback = effects.map((effect) => ({
    ownerId: effect.ownerId,
    actionNonce: effect.actionNonce,
    shotId: `shot-${String(effect.actionNonce).padStart(120, '0')}`,
    connectionEpoch: `epoch_${'a'.repeat(120)}`,
    lifeId: 3,
    shotSeq: 8,
    weaponSequence: 2,
    fireTimeMs: 1_000,
    triggerStartedAtMs: 1_000,
    targetViewTimeMs: 950,
    origin: [0, 2, 0] as readonly [number, number, number],
    direction: [1, 0, 0] as readonly [number, number, number],
    pelletDirections: [[1, 0, 0]] as readonly [readonly [number, number, number]],
    receivedAtHostTimeMs: 1_010,
    appliedRewindMs: 60,
    remainingMs: 9_000,
  }));

  return {
    ...base,
    config: {
      arenaId: 'skyline-terminal', mode: 'tdm', capacity: 6, hostedBotCount: 4,
      autoBalance: true, durationMs: 300_000,
    },
    members: [
      { id: 'host-1', name: 'HOST', team: 0, ready: true, connected: true, pingMs: 0, dhv: 10 },
      ...guestIds.map((id, index) => ({
        id, name: `PLAYER${index}`, team: teamOf(index), ready: true,
        connected: true, pingMs: 42, dhv: 10 as const,
      })),
    ],
    scores: [
      { id: 'host-1', kills: 4, deaths: 2, damageDealt: 810, damageTaken: 400 },
      ...guestIds.map((id) => ({ id, kills: 2, deaths: 4, damageDealt: 400, damageTaken: 810 })),
      ...botIds.map((id) => ({ id, kills: 1, deaths: 3, damageDealt: 120, damageTaken: 510 })),
    ],
    guests: guestIds.map((id, index) => ({
      snapshot: {
        id, name: `PLAYER${index}`, team: teamOf(index),
        x: -3, y: 1.7, z: 6, yaw: -0.2, pitch: 0.1, hp: 100, kills: 2, deaths: 4,
        primary: 'carbine' as const, secondary: 'pistol' as const, grenade: 'frag' as const,
        weapon: 'carbine' as const, stance: 'stand' as const, seq: 119,
      },
      continuity: 5 + index,
      combatInventory: inventory,
      health: {
        hp: 100, alive: true, respawnRemainingMs: 0, diedAgeMs: null,
        lastDamageAgeMs: 0, lastAdvancedAgeMs: 0,
      },
    })),
    bots: botIds.map((id, index) => ({
      ...base.bots[0]!,
      snapshot: { ...base.bots[0]!.snapshot, id, kills: 1, deaths: 3 },
      waypoint: index,
    })),
    resumeTokenDigests: guestIds.map((playerId) => ({
      playerId, sha256: 'a'.repeat(64), expiresAtEpochMs: EXPIRES_AT,
    })),
    flareProjectiles: {
      schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
      snapshotSeq: 4,
      effects,
    },
    flareShotFeedback: feedback,
    // Skyline Terminal owns the flare gun; the railgun is out of play there.
    timedMapWeapons: {
      flamethrower: {
        generation: 7, revision: 0, weaponId: 'flamethrower', arenaId: 'rustworks-1v1',
        status: 'disabled', spawnRemainingMs: null, pickupPosition: null, holderId: null,
        shotsRemaining: 200, announcementSent: false, processedShotIds: [],
      },
      'flare-gun': {
        generation: 7, revision: 9, weaponId: 'flare-gun', arenaId: 'skyline-terminal',
        status: 'held', spawnRemainingMs: null, pickupPosition: null, holderId: guestIds[1]!,
        shotsRemaining: 3, announcementSent: true,
        processedShotIds: Array.from({ length: 32 }, (_, index) => `fg-${String(index).padStart(92, '0')}`),
      },
    },
    killstreak: {
      ...killstreak([
        actor('host-1', 0, 3, 7),
        ...guestIds.map((id, index) => actor(id, teamOf(index), 5 + index, index)),
      ]),
      seenActivationRequestIds: Array.from(
        { length: 512 },
        (_, index) => `act-${String(index).padStart(76, '0')}`,
      ),
    },
  };
}

function mandate(overrides: Partial<SuccessionMandate> = {}): SuccessionMandate {
  return {
    schemaVersion: HOST_SUCCESSION_MANDATE_SCHEMA_VERSION,
    term: 1,
    roomCode: ROOM,
    successorId: 'guest-1',
    lobbyRevision: LOBBY_REVISION,
    issuedByHostId: 'host-1',
    issuedAtEpochMs: SAVED_AT,
    expiresAtEpochMs: SAVED_AT + HOST_SUCCESSION_MANDATE_TTL_MS,
    ...overrides,
  };
}

function mirrored(
  checkpointOverrides: Partial<HostMatchCheckpoint> = {},
  mandateOverrides: Partial<SuccessionMandate> = {},
  outgoingHostResumeTokenSha256?: string | null,
): HostAuthorityMirror {
  const result = mirrorHostAuthorityToSuccessor({
    checkpoint: checkpoint(checkpointOverrides),
    mandate: mandate(mandateOverrides),
    outgoingHostResumeTokenSha256,
  });
  if (!result.mirrored) throw new Error(`expected a mirror, got refusal: ${result.reason}`);
  return result;
}

function refusal(
  checkpointOverrides: Partial<HostMatchCheckpoint> = {},
  mandateOverrides: Partial<SuccessionMandate> = {},
  outgoingHostResumeTokenSha256?: string | null,
): string {
  const result = mirrorHostAuthorityToSuccessor({
    checkpoint: checkpoint(checkpointOverrides),
    mandate: mandate(mandateOverrides),
    outgoingHostResumeTokenSha256,
  });
  return result.mirrored ? 'MIRRORED' : result.reason;
}

// ---------------------------------------------------------------------------

describe('host authority mirror — the fixture itself', () => {
  it('is a valid host checkpoint before anything is mirrored', () => {
    expect(isHostMatchCheckpoint(checkpoint(), MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
  });

  it('refreshes often enough that a healthy mirror never approaches the TTL', () => {
    expect(HOST_AUTHORITY_MIRROR_INTERVAL_MS).toBeLessThan(HOST_MATCH_CHECKPOINT_TTL_MS / 10);
  });
});

describe('host authority mirror — the successor becomes the host of record', () => {
  it('reshapes the successor into hostPlayer and still validates as a checkpoint', () => {
    const result = mirrored();
    expect(result.checkpoint.hostPlayer.id).toBe('guest-1');
    expect(result.successorId).toBe('guest-1');
    expect(result.outgoingHostId).toBe('host-1');
    expect(isHostMatchCheckpoint(result.checkpoint, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
  });

  it('runs the successor one term above the mandate that appointed it', () => {
    const result = mirrored({}, { term: 4 }, undefined);
    expect(result.term).toBe(5);
    expect(result.checkpoint.succession).toEqual({ term: 5, successorId: null });
  });

  it('carries the successor pose, life and equipped loadout into hostPlayer', () => {
    const source = checkpoint();
    const host = mirrored().checkpoint.hostPlayer;
    const successor = source.guests[0]!;
    expect(host.name).toBe(successor.snapshot.name);
    expect(host.team).toBe(successor.snapshot.team);
    expect([host.x, host.y, host.z]).toEqual([successor.snapshot.x, successor.snapshot.y, successor.snapshot.z]);
    expect(host.yaw).toBe(successor.snapshot.yaw);
    expect(host.pitch).toBe(successor.snapshot.pitch);
    expect(host.seq).toBe(successor.snapshot.seq);
    expect(host.continuity).toBe(successor.continuity);
    expect(host.hp).toBe(successor.health.hp);
    expect(host.alive).toBe(true);
    expect(host.kills).toBe(successor.snapshot.kills);
    expect(host.deaths).toBe(successor.snapshot.deaths);
    expect(host.primary).toBe('carbine');
    expect(host.weapon).toBe('carbine');
    expect(host.grenades).toBe(1);
  });

  it('starts the promoted player at rest with no invented spawn protection', () => {
    const host = mirrored().checkpoint.hostPlayer;
    expect([host.vx, host.vy, host.vz]).toEqual([0, 0, 0]);
    expect(host.invulnerabilityRemainingMs).toBe(0);
  });

  it('carries every ordinary-weapon counter across unchanged', () => {
    const source = checkpoint();
    const host = mirrored().checkpoint.hostPlayer;
    for (const weapon of ORDINARY_WEAPON_IDS) {
      expect(host.ammo[weapon]).toBe(source.guests[0]!.combatInventory.ammo[weapon]);
      expect(host.reserve[weapon]).toBe(source.guests[0]!.combatInventory.reserve[weapon]);
    }
  });

  it('zeroes special-weapon ammo for a successor that holds no special weapon', () => {
    const host = mirrored().checkpoint.hostPlayer;
    expect(host.ammo.railgun).toBe(0);
    expect(host.ammo.flamethrower).toBe(0);
    expect(host.ammo['flare-gun']).toBe(0);
    expect(host.reserve.railgun).toBe(0);
  });

  it('preserves a dead successor as dead and clamps the respawn wait to the host schema', () => {
    const dead = guestAuthority('guest-1', 'ALPHA', 1, 5, {
      snapshot: { ...guestAuthority('guest-1', 'ALPHA', 1, 5).snapshot, hp: 0 },
      health: {
        hp: 0,
        alive: false,
        respawnRemainingMs: 60_000,
        diedAgeMs: 2_000,
        lastDamageAgeMs: 2_000,
        lastAdvancedAgeMs: 2_000,
      },
    });
    const host = mirrored({ guests: [dead, guestAuthority('guest-2', 'BRAVO', 0, 2)] }).checkpoint.hostPlayer;
    expect(host.alive).toBe(false);
    expect(host.hp).toBe(0);
    expect(host.respawnRemainingMs).toBeGreaterThan(0);
    expect(host.respawnRemainingMs).toBeLessThanOrEqual(10_000);
  });
});

describe('host authority mirror — the outgoing host becomes an ordinary guest', () => {
  it('keeps the outgoing host in the roster with its pose, score and continuity', () => {
    const source = checkpoint();
    const demoted = mirrored().checkpoint.guests.find((guest) => guest.snapshot.id === 'host-1');
    expect(demoted).toBeDefined();
    expect(demoted!.snapshot.kills).toBe(source.hostPlayer.kills);
    expect(demoted!.snapshot.deaths).toBe(source.hostPlayer.deaths);
    expect(demoted!.snapshot.hp).toBe(source.hostPlayer.hp);
    expect(demoted!.continuity).toBe(source.hostPlayer.continuity);
    expect(demoted!.snapshot.weapon).toBe(source.hostPlayer.weapon);
    expect(demoted!.snapshot.stance).toBe(source.hostPlayer.stance);
  });

  it('caps the demoted host inventory to guest weapon caps rather than copying raw counters', () => {
    const demoted = mirrored().checkpoint.guests.find((guest) => guest.snapshot.id === 'host-1')!;
    for (const weapon of ORDINARY_WEAPON_IDS) {
      expect(demoted.combatInventory.ammo[weapon]).toBeLessThanOrEqual(WEAPONS[weapon].mag);
      expect(demoted.combatInventory.reserve[weapon]).toBeLessThanOrEqual(WEAPONS[weapon].reserve);
    }
  });

  it('restarts the demoted host health ledger instead of back-dating damage or regeneration', () => {
    const demoted = mirrored().checkpoint.guests.find((guest) => guest.snapshot.id === 'host-1')!;
    expect(demoted.health.lastDamageAgeMs).toBe(0);
    expect(demoted.health.lastAdvancedAgeMs).toBe(0);
    expect(demoted.health.diedAgeMs).toBeNull();
  });

  it('gives a dead outgoing host a death timestamp so the guest schema accepts it', () => {
    const source = checkpoint({
      hostPlayer: { ...checkpoint().hostPlayer, hp: 0, alive: false, respawnRemainingMs: 4_000 },
      scores: checkpoint().scores,
    });
    expect(isHostMatchCheckpoint(source, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    const result = mirrorHostAuthorityToSuccessor({ checkpoint: source, mandate: mandate() });
    expect(result.mirrored).toBe(true);
    const demoted = (result as HostAuthorityMirror).checkpoint.guests
      .find((guest) => guest.snapshot.id === 'host-1')!;
    expect(demoted.health.alive).toBe(false);
    expect(demoted.health.diedAgeMs).toBe(0);
    expect(demoted.health.respawnRemainingMs).toBe(4_000);
  });

  it('refuses an outgoing host whose equipped weapon is not one it carries', () => {
    // isHostPlayerCheckpoint permits any WeaponId; a guest snapshot does not.
    expect(refusal({ hostPlayer: { ...checkpoint().hostPlayer, weapon: 'ak-47' } }))
      .toBe('outgoing-host-not-representable');
  });
});

describe('host authority mirror — everything else survives intact', () => {
  it('carries members, scores, bots and config through untouched', () => {
    const source = checkpoint();
    const result = mirrored().checkpoint;
    expect(result.members).toEqual(source.members);
    expect(result.scores).toEqual(source.scores);
    expect(result.bots).toEqual(source.bots);
    expect(result.config).toEqual(source.config);
  });

  it('keeps match identity and relative timing exactly as the host wrote them', () => {
    const source = checkpoint();
    const result = mirrored().checkpoint;
    expect(result.roomCode).toBe(source.roomCode);
    expect(result.activeAtEpochMs).toBe(source.activeAtEpochMs);
    expect(result.matchEpoch).toBe(source.matchEpoch);
    expect(result.elapsedSinceActiveMs).toBe(source.elapsedSinceActiveMs);
    expect(result.phase).toBe(source.phase);
    expect(result.lobbyRevision).toBe(source.lobbyRevision);
    expect(result.protocolVersion).toBe(source.protocolVersion);
  });

  it('carries railgun and timed-pickup authority through untouched', () => {
    const source = checkpoint();
    const result = mirrored().checkpoint;
    expect(result.railgun).toEqual(source.railgun);
    expect(result.timedMapWeapons).toEqual(source.timedMapWeapons);
  });

  it('keeps the whole roster: nobody is kicked by the handover', () => {
    const source = checkpoint();
    const result = mirrored().checkpoint;
    const before = source.members.map((member) => member.id).sort();
    const after = [result.hostPlayer.id, ...result.guests.map((guest) => guest.snapshot.id)].sort();
    expect(after).toEqual(before);
  });

  it('does not mutate the source checkpoint', () => {
    const source = checkpoint();
    const before = JSON.stringify(source);
    mirrorHostAuthorityToSuccessor({ checkpoint: source, mandate: mandate() });
    expect(JSON.stringify(source)).toBe(before);
  });

  it('is deterministic: the same inputs produce byte-identical output', () => {
    expect(JSON.stringify(mirrored().checkpoint)).toBe(JSON.stringify(mirrored().checkpoint));
  });
});

describe('host authority mirror — resume-token digests', () => {
  it('drops the successor digest and adds one for the outgoing host', () => {
    const digests = mirrored().checkpoint.resumeTokenDigests;
    expect(digests.map((digest) => digest.playerId).sort()).toEqual(['guest-2', 'host-1']);
    expect(digests.find((digest) => digest.playerId === 'guest-2')!.sha256).toBe('b'.repeat(64));
  });

  it('keeps the schema invariant that digest ids equal guest ids', () => {
    const result = mirrored().checkpoint;
    const guestIds = result.members
      .map((member) => member.id)
      .filter((id) => id !== result.hostPlayer.id)
      .sort();
    expect(result.resumeTokenDigests.map((digest) => digest.playerId).sort()).toEqual(guestIds);
  });

  it('mirrors digests, never raw tokens', () => {
    for (const digest of mirrored().checkpoint.resumeTokenDigests) {
      expect(digest.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it('stamps an unmatchable digest when the outgoing host has no resume token', () => {
    const digest = mirrored().checkpoint.resumeTokenDigests.find((entry) => entry.playerId === 'host-1')!;
    expect(digest.sha256).toBe(UNCLAIMABLE_RESUME_TOKEN_DIGEST);
    expect(UNCLAIMABLE_RESUME_TOKEN_DIGEST).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses a supplied outgoing-host digest when one is minted', () => {
    const supplied = 'c'.repeat(64);
    const digest = mirrored({}, {}, supplied).checkpoint.resumeTokenDigests
      .find((entry) => entry.playerId === 'host-1')!;
    expect(digest.sha256).toBe(supplied);
  });

  it('refuses a malformed outgoing-host digest rather than degrading it', () => {
    expect(refusal({}, {}, 'not-a-digest')).toBe('malformed-outgoing-host-digest');
    expect(refusal({}, {}, 'A'.repeat(64))).toBe('malformed-outgoing-host-digest');
    expect(refusal({}, {}, 'a'.repeat(63))).toBe('malformed-outgoing-host-digest');
  });

  it('pins every mirrored digest to the checkpoint expiry', () => {
    const result = mirrored().checkpoint;
    for (const digest of result.resumeTokenDigests) {
      expect(digest.expiresAtEpochMs).toBe(result.expiresAtEpochMs);
    }
  });
});

describe('host authority mirror — killstreak authority', () => {
  it('preserves every actor when the successor already owns one', () => {
    const source = checkpoint();
    const result = mirrored().checkpoint;
    expect(result.killstreak!.actors).toHaveLength(3);
    expect(result.killstreak!.actors.find((entry) => entry.actorId === 'guest-2')!.streak).toBe(4);
    expect(result.killstreak!.actors.find((entry) => entry.actorId === 'host-1')!.streak).toBe(7);
    expect(result.killstreak!.actors.find((entry) => entry.actorId === 'guest-1')!.streak).toBe(1);
    expect(result.killstreak!.matchEpoch).toBe(source.matchEpoch);
    expect(result.killstreak!.revision).toBe(source.killstreak!.revision);
  });

  it('seeds a zero-progress actor when the successor had none, without touching the others', () => {
    const result = mirrored({
      killstreak: killstreak([actor('guest-2', 0, 2, 4), actor('host-1', 0, 3, 7)]),
    }).checkpoint;
    const seeded = result.killstreak!.actors.find((entry) => entry.actorId === 'guest-1')!;
    expect(seeded.streak).toBe(0);
    expect(seeded.cycleProgress).toBe(0);
    expect(seeded.earned).toEqual([]);
    expect(seeded.availableCharges).toEqual([]);
    expect(seeded.team).toBe(1);
    expect(seeded.lifeId).toBe(5);
    expect(result.killstreak!.actors.find((entry) => entry.actorId === 'guest-2')!.streak).toBe(4);
    expect(result.killstreak!.actors.find((entry) => entry.actorId === 'host-1')!.streak).toBe(7);
  });

  it('mirrors a checkpoint that never carried killstreak state at all', () => {
    const source = checkpoint();
    const withoutKillstreak: HostMatchCheckpoint = Object.fromEntries(
      Object.entries(source).filter(([key]) => key !== 'killstreak'),
    ) as HostMatchCheckpoint;
    expect(isHostMatchCheckpoint(withoutKillstreak, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    const result = mirrorHostAuthorityToSuccessor({ checkpoint: withoutKillstreak, mandate: mandate() });
    expect(result.mirrored).toBe(true);
    expect((result as HostAuthorityMirror).checkpoint.killstreak).toBeUndefined();
  });
});

describe('host authority mirror — refusals', () => {
  it('refuses a malformed checkpoint', () => {
    expect(mirrorHostAuthorityToSuccessor({
      checkpoint: { nope: true } as unknown as HostMatchCheckpoint,
      mandate: mandate(),
    })).toEqual({ mirrored: false, reason: 'malformed-checkpoint' });
  });

  it('refuses a malformed mandate', () => {
    expect(refusal({}, { term: 0 })).toBe('malformed-mandate');
    expect(mirrorHostAuthorityToSuccessor({
      checkpoint: checkpoint(),
      mandate: null as unknown as SuccessionMandate,
    })).toEqual({ mirrored: false, reason: 'malformed-mandate' });
  });

  it('refuses a mandate minted for another room', () => {
    expect(refusal({}, { roomCode: 'some-other-room' })).toBe('mandate-room-mismatch');
  });

  it('refuses when the named successor is already the host', () => {
    expect(refusal({}, { successorId: 'host-1', issuedByHostId: 'guest-2' })).toBe('successor-is-host');
  });

  it('refuses a mandate that this host did not issue', () => {
    expect(refusal({}, { issuedByHostId: 'guest-2' })).toBe('mandate-not-from-this-host');
  });

  it('refuses a successor that is not in the roster', () => {
    expect(refusal({}, { successorId: 'ghost-9' })).toBe('successor-not-in-roster');
  });

  it('refuses a disconnected successor', () => {
    const members = checkpoint().members.map((member) => (
      member.id === 'guest-1' ? { ...member, connected: false } : member
    ));
    expect(refusal({ members })).toBe('successor-not-connected');
  });

  it('refuses a mandate below the term this host has already reached', () => {
    expect(refusal({ succession: { term: 6, successorId: 'guest-1' } }, { term: 5 })).toBe('stale-term');
  });

  it('accepts a mandate at exactly the term the checkpoint already carries', () => {
    const result = mirrored({ succession: { term: 5, successorId: 'guest-1' } }, { term: 5 });
    expect(result.term).toBe(6);
  });

  it('refuses when the checkpoint names a different outstanding successor', () => {
    expect(refusal({ succession: { term: 1, successorId: 'guest-2' } })).toBe('succession-mismatch');
  });

  it('mirrors against a pre-HF-325 checkpoint that carries no succession field', () => {
    const source = checkpoint();
    const legacy: HostMatchCheckpoint = Object.fromEntries(
      Object.entries(source).filter(([key]) => key !== 'succession'),
    ) as HostMatchCheckpoint;
    expect(isHostMatchCheckpoint(legacy, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    const result = mirrorHostAuthorityToSuccessor({ checkpoint: legacy, mandate: mandate() });
    expect(result.mirrored).toBe(true);
    expect((result as HostAuthorityMirror).checkpoint.succession).toEqual({ term: 2, successorId: null });
  });

  it('refuses to mint a term beyond the fence ceiling', () => {
    expect(refusal(
      { succession: { term: MAX_HOST_TERM, successorId: 'guest-1' } },
      { term: MAX_HOST_TERM },
    )).toBe('term-exhausted');
  });

  it('cannot reach successor-authority-missing: the schema guarantees every non-host member has one', () => {
    // The refusal exists as defence in depth. Any checkpoint that validates
    // already satisfies guestAuthorityIds === guestIds, so a rostered successor
    // always has an authority entry.
    const source = checkpoint();
    const guestIds = source.members.map((member) => member.id).filter((id) => id !== source.hostPlayer.id).sort();
    expect(source.guests.map((guest) => guest.snapshot.id).sort()).toEqual(guestIds);
    const broken = { ...source, guests: [source.guests[1]!] };
    expect(isHostMatchCheckpoint(broken, MULTIPLAYER_PROTOCOL_VERSION)).toBe(false);
    expect(mirrorHostAuthorityToSuccessor({
      checkpoint: broken as HostMatchCheckpoint,
      mandate: mandate(),
    })).toEqual({ mirrored: false, reason: 'malformed-checkpoint' });
  });
});

describe('host authority mirror — special weapon holders', () => {
  function railgunHolderCheckpoint(): HostMatchCheckpoint {
    const base = checkpoint();
    const armed = guestAuthority('guest-1', 'ALPHA', 1, 5);
    return {
      ...base,
      guests: [
        { ...armed, snapshot: { ...armed.snapshot, weapon: 'railgun' } },
        base.guests[1]!,
      ],
      railgun: {
        generation: 7,
        revision: 4,
        status: 'held',
        spawnRemainingMs: null,
        spawnSite: null,
        pickupPosition: null,
        holderId: 'guest-1',
        roundsRemaining: RAILGUN_TOTAL_ROUNDS,
        chamberRemainingMs: 0,
        announcementSent: true,
        processedShotIds: [],
      },
    };
  }

  it('hands the promoted host the railgun rounds it was actually holding', () => {
    const source = railgunHolderCheckpoint();
    expect(isHostMatchCheckpoint(source, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    const result = mirrorHostAuthorityToSuccessor({ checkpoint: source, mandate: mandate() });
    expect(result.mirrored).toBe(true);
    const host = (result as HostAuthorityMirror).checkpoint.hostPlayer;
    expect(host.weapon).toBe('railgun');
    expect(host.ammo.railgun).toBe(RAILGUN_TOTAL_ROUNDS);
    expect((result as HostAuthorityMirror).checkpoint.railgun.holderId).toBe('guest-1');
  });

  function flareGunHolderCheckpoint(): HostMatchCheckpoint {
    const base = checkpoint();
    const armed = guestAuthority('guest-1', 'ALPHA', 1, 5);
    return {
      ...base,
      config: { ...base.config, arenaId: 'skyline-terminal' },
      guests: [
        { ...armed, snapshot: { ...armed.snapshot, weapon: 'flare-gun' } },
        base.guests[1]!,
      ],
      timedMapWeapons: {
        flamethrower: {
          generation: 7,
          revision: 0,
          weaponId: 'flamethrower',
          arenaId: 'rustworks-1v1',
          status: 'disabled',
          spawnRemainingMs: null,
          pickupPosition: null,
          holderId: null,
          shotsRemaining: 200,
          announcementSent: false,
          processedShotIds: [],
        },
        'flare-gun': {
          generation: 7,
          revision: 3,
          weaponId: 'flare-gun',
          arenaId: 'skyline-terminal',
          status: 'held',
          spawnRemainingMs: null,
          pickupPosition: null,
          holderId: 'guest-1',
          shotsRemaining: 4,
          announcementSent: true,
          processedShotIds: [],
        },
      },
    };
  }

  it('splits a held timed pickup into magazine and reserve the way the running game does', () => {
    const source = flareGunHolderCheckpoint();
    expect(isHostMatchCheckpoint(source, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    const result = mirrorHostAuthorityToSuccessor({ checkpoint: source, mandate: mandate() });
    expect(result.mirrored).toBe(true);
    const host = (result as HostAuthorityMirror).checkpoint.hostPlayer;
    const magazine = Math.min(WEAPONS['flare-gun'].mag, 4);
    expect(host.ammo['flare-gun']).toBe(magazine);
    expect(host.reserve['flare-gun']).toBe(4 - magazine);
    expect(host.ammo.flamethrower).toBe(0);
  });
});

describe('host authority mirror — flare feedback ownership', () => {
  function flareCheckpoint(): HostMatchCheckpoint {
    const base = checkpoint();
    const effect = (ownerId: string, ownerTeam: 0 | 1, actionNonce: number) => ({
      ownerId,
      ownerTeam,
      actionNonce,
      phase: 'flight' as const,
      position: [0, 2, 0] as readonly [number, number, number],
      velocity: [52, 0, 0] as readonly [number, number, number],
      remainingMs: 4_500,
      directHitDelivered: false,
      nextBurnPulseRemainingMs: null,
      burnPulseIndex: 0,
    });
    const feedback = (ownerId: string, actionNonce: number) => ({
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
      origin: [0, 2, 0] as readonly [number, number, number],
      direction: [1, 0, 0] as readonly [number, number, number],
      pelletDirections: [[1, 0, 0]] as readonly [readonly [number, number, number]],
      receivedAtHostTimeMs: 1_010,
      appliedRewindMs: 60,
      remainingMs: 9_000,
    });
    return {
      ...base,
      config: { ...base.config, arenaId: 'skyline-terminal' },
      flareProjectiles: {
        schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION,
        snapshotSeq: 4,
        effects: [effect('guest-1', 1, 91), effect('guest-2', 0, 5)],
      },
      flareShotFeedback: [feedback('guest-1', 91), feedback('guest-2', 5)],
    };
  }

  it('drops shooter feedback that the promoted host would now own, keeping everyone elses', () => {
    const source = flareCheckpoint();
    expect(isHostMatchCheckpoint(source, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    const result = mirrorHostAuthorityToSuccessor({ checkpoint: source, mandate: mandate() });
    expect(result.mirrored).toBe(true);
    const mirroredCheckpoint = (result as HostAuthorityMirror).checkpoint;
    expect(mirroredCheckpoint.flareShotFeedback.map((entry) => entry.ownerId)).toEqual(['guest-2']);
    // The in-flight flare itself survives; only the shooter-side context goes.
    expect(mirroredCheckpoint.flareProjectiles.effects).toHaveLength(2);
    expect(isHostMatchCheckpoint(mirroredCheckpoint, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
  });
});

describe('host authority mirror — size discipline', () => {
  it('names an explicit, ordered droppable set and nothing else', () => {
    expect(MIRROR_DROPPABLE_SECTIONS).toEqual(['flare-shot-feedback', 'flare-projectiles', 'killstreak']);
  });

  it('drops nothing for an ordinary match and stays well inside the cap', () => {
    const result = mirrored();
    expect(result.droppedForSize).toEqual([]);
    expect(result.serializedLength).toBeLessThanOrEqual(HOST_MATCH_CHECKPOINT_MAX_BYTES);
  });

  it('asserts the cap: a mirrored checkpoint is still storable', () => {
    const storage = new MemoryStorage();
    expect(saveHostMatchCheckpoint(storage, mirrored().checkpoint)).toBe(true);
  });

  it('drops shooter feedback before the flares themselves, and flares before the reward ladder', () => {
    // The ladder is ordered least-regret first; the killstreak rung is only ever
    // reached after both flare rungs have already been tried.
    const index = (section: string) => MIRROR_DROPPABLE_SECTIONS.indexOf(section as never);
    expect(index('flare-shot-feedback')).toBeLessThan(index('flare-projectiles'));
    expect(index('flare-projectiles')).toBeLessThan(index('killstreak'));
  });

  it('the schema-maximum match really does breach the cap, so the ladder is not decorative', () => {
    const source = schemaMaximumCheckpoint();
    expect(isHostMatchCheckpoint(source, MULTIPLAYER_PROTOCOL_VERSION)).toBe(true);
    expect(JSON.stringify(source).length).toBeGreaterThan(HOST_MATCH_CHECKPOINT_MAX_BYTES);
    expect(saveHostMatchCheckpoint(new MemoryStorage(), source)).toBe(false);
  });

  it('sheds droppable sections in ladder order and brings a schema-maximum match under the cap', () => {
    const source = schemaMaximumCheckpoint();
    const result = mirrorHostAuthorityToSuccessor({ checkpoint: source, mandate: mandate() });
    expect(result.mirrored).toBe(true);
    const mirror = result as HostAuthorityMirror;

    expect(mirror.droppedForSize.length).toBeGreaterThan(0);
    // Whatever it shed, it shed a prefix of the declared ladder.
    expect(MIRROR_DROPPABLE_SECTIONS.slice(0, mirror.droppedForSize.length))
      .toEqual([...mirror.droppedForSize]);
    expect(mirror.droppedForSize[0]).toBe('flare-shot-feedback');
    expect(mirror.checkpoint.flareShotFeedback).toEqual([]);
    expect(mirror.serializedLength).toBeLessThanOrEqual(HOST_MATCH_CHECKPOINT_MAX_BYTES);
    expect(saveHostMatchCheckpoint(new MemoryStorage(), mirror.checkpoint)).toBe(true);

    // Authority-critical state is never what gets shed.
    expect(mirror.checkpoint.members).toEqual(source.members);
    expect(mirror.checkpoint.scores).toEqual(source.scores);
    expect(mirror.checkpoint.bots).toEqual(source.bots);
    expect(mirror.checkpoint.config).toEqual(source.config);
    expect(mirror.checkpoint.railgun).toEqual(source.railgun);
    expect(mirror.checkpoint.timedMapWeapons).toEqual(source.timedMapWeapons);
    expect(mirror.checkpoint.resumeTokenDigests).toHaveLength(source.members.length - 1);
    expect(mirror.checkpoint.succession).toEqual({ term: 2, successorId: null });
    expect(mirror.checkpoint.hostPlayer.id).toBe('guest-1');
    expect([mirror.checkpoint.hostPlayer.id, ...mirror.checkpoint.guests.map((g) => g.snapshot.id)].sort())
      .toEqual(source.members.map((member) => member.id).sort());
  });

  it('keeps the authority-critical residue under the cap, making oversized-mirror a backstop', () => {
    // Every non-droppable field is schema-bounded. Strip the three droppable
    // sections from a schema-maximum match and what is left still fits, so
    // `oversized-mirror` cannot be reached by any valid checkpoint.
    const source = schemaMaximumCheckpoint();
    const residue = {
      ...source,
      flareShotFeedback: [],
      flareProjectiles: { schemaVersion: FLARE_AUTHORITY_CHECKPOINT_SCHEMA_VERSION, snapshotSeq: 0, effects: [] },
      killstreak: undefined,
    };
    expect(JSON.stringify(residue).length).toBeLessThan(HOST_MATCH_CHECKPOINT_MAX_BYTES);
  });
});

// ---------------------------------------------------------------------------
// Clock skew
// ---------------------------------------------------------------------------

describe('mirror clock rebase — skew cannot fabricate downtime or expiry', () => {
  it('credits the real transit age when an offset is trusted', () => {
    const source = mirrored().checkpoint;
    const result = rebaseMirroredCheckpointClock(source, {
      receivedAtEpochMs: SAVED_AT + 500,
      clockOffsetMs: 0,
    });
    expect(result.rebased).toBe(true);
    if (!result.rebased) return;
    expect(result.appliedAgeMs).toBe(500);
    expect(result.offsetTrusted).toBe(true);
    expect(result.checkpoint.savedAtEpochMs).toBe(SAVED_AT);
    expect(result.checkpoint.expiresAtEpochMs).toBe(SAVED_AT + HOST_MATCH_CHECKPOINT_TTL_MS);
  });

  it('neutralises a receiver clock running ten minutes AHEAD of the host', () => {
    const source = mirrored().checkpoint;
    const skewMs = 600_000;
    const receivedAtEpochMs = SAVED_AT + skewMs + 200;
    const result = rebaseMirroredCheckpointClock(source, { receivedAtEpochMs, clockOffsetMs: skewMs });
    expect(result.rebased).toBe(true);
    if (!result.rebased) return;
    expect(result.appliedAgeMs).toBe(200);
    // Without the rebase this would look like ten minutes of downtime and the
    // 90s TTL would have declared the mirror dead on arrival.
    expect(receivedAtEpochMs - source.savedAtEpochMs).toBeGreaterThan(HOST_MATCH_CHECKPOINT_TTL_MS);
    expect(receivedAtEpochMs).toBeLessThan(result.checkpoint.expiresAtEpochMs);
    const timing = resolveHostMatchResumeTiming(result.checkpoint, receivedAtEpochMs, 0);
    expect(timing).not.toBeNull();
    expect(timing!.elapsedSinceActiveMs).toBe(source.elapsedSinceActiveMs + 200);
  });

  it('neutralises a receiver clock running ten minutes BEHIND the host', () => {
    const source = mirrored().checkpoint;
    const skewMs = -600_000;
    const receivedAtEpochMs = SAVED_AT + skewMs + 200;
    // Unrebased, every restore helper refuses outright: now < savedAt.
    expect(restoreGuestAuthorities(source, receivedAtEpochMs, 0)).toBeNull();
    expect(restoreRailgunAuthority(source, receivedAtEpochMs, 0)).toBeNull();
    expect(resolveHostMatchResumeTiming(source, receivedAtEpochMs, 0)).toBeNull();

    const result = rebaseMirroredCheckpointClock(source, { receivedAtEpochMs, clockOffsetMs: skewMs });
    expect(result.rebased).toBe(true);
    if (!result.rebased) return;
    expect(result.appliedAgeMs).toBe(200);
    expect(restoreGuestAuthorities(result.checkpoint, receivedAtEpochMs, 0)).not.toBeNull();
    expect(restoreRailgunAuthority(result.checkpoint, receivedAtEpochMs, 0)).not.toBeNull();
    expect(resolveHostMatchResumeTiming(result.checkpoint, receivedAtEpochMs, 0)).not.toBeNull();
  });

  it('treats the mirror as fresh on arrival when no offset was measured, in either skew direction', () => {
    const source = mirrored().checkpoint;
    for (const skewMs of [3_600_000, -3_600_000]) {
      const receivedAtEpochMs = SAVED_AT + skewMs;
      const result = rebaseMirroredCheckpointClock(source, { receivedAtEpochMs, clockOffsetMs: null });
      expect(result.rebased).toBe(true);
      if (!result.rebased) return;
      expect(result.offsetTrusted).toBe(false);
      expect(result.appliedAgeMs).toBe(0);
      expect(result.checkpoint.savedAtEpochMs).toBe(receivedAtEpochMs);
      const timing = resolveHostMatchResumeTiming(result.checkpoint, receivedAtEpochMs, 0);
      expect(timing).not.toBeNull();
      // Zero credited downtime: the skew never becomes match time.
      expect(timing!.elapsedSinceActiveMs).toBe(source.elapsedSinceActiveMs);
    }
  });

  it('discards an offset too large to be clock skew rather than trusting it', () => {
    const source = mirrored().checkpoint;
    const absurd = MAX_TRUSTED_MIRROR_CLOCK_OFFSET_MS + 1;
    for (const clockOffsetMs of [absurd, -absurd, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = rebaseMirroredCheckpointClock(source, {
        receivedAtEpochMs: SAVED_AT + 1_000,
        clockOffsetMs,
      });
      expect(result.rebased).toBe(true);
      if (!result.rebased) return;
      expect(result.offsetTrusted).toBe(false);
      expect(result.appliedAgeMs).toBe(0);
    }
  });

  it('trusts an offset sitting exactly on the bound', () => {
    const source = mirrored().checkpoint;
    const result = rebaseMirroredCheckpointClock(source, {
      receivedAtEpochMs: SAVED_AT + MAX_TRUSTED_MIRROR_CLOCK_OFFSET_MS + 250,
      clockOffsetMs: MAX_TRUSTED_MIRROR_CLOCK_OFFSET_MS,
    });
    expect(result.rebased).toBe(true);
    if (!result.rebased) return;
    expect(result.offsetTrusted).toBe(true);
    expect(result.appliedAgeMs).toBe(250);
  });

  it('clamps a negative apparent age to zero instead of dating the mirror forward', () => {
    const source = mirrored().checkpoint;
    const receivedAtEpochMs = SAVED_AT + 1_000;
    const result = rebaseMirroredCheckpointClock(source, {
      receivedAtEpochMs,
      // Offset overstated by 5s, so the mirror appears to arrive before it left.
      clockOffsetMs: 6_000,
    });
    expect(result.rebased).toBe(true);
    if (!result.rebased) return;
    expect(result.appliedAgeMs).toBe(0);
    expect(result.checkpoint.savedAtEpochMs).toBe(receivedAtEpochMs);
    expect(result.checkpoint.savedAtEpochMs).toBeLessThanOrEqual(receivedAtEpochMs);
  });
});

describe('mirror clock rebase — a skewed clock cannot extend a lease', () => {
  it('refuses a mirror that is genuinely older than the checkpoint TTL', () => {
    const source = mirrored().checkpoint;
    const result = rebaseMirroredCheckpointClock(source, {
      receivedAtEpochMs: SAVED_AT + HOST_MATCH_CHECKPOINT_TTL_MS,
      clockOffsetMs: 0,
    });
    expect(result).toEqual({ rebased: false, reason: 'mirror-expired' });
  });

  it('refuses a stale mirror even when the receiver clock would make it look fresh', () => {
    const source = mirrored().checkpoint;
    const skewMs = -600_000;
    // Real age: two minutes. Naive local arithmetic would read it as negative.
    const receivedAtEpochMs = SAVED_AT + skewMs + 120_000;
    expect(receivedAtEpochMs).toBeLessThan(source.savedAtEpochMs);
    expect(rebaseMirroredCheckpointClock(source, { receivedAtEpochMs, clockOffsetMs: skewMs }))
      .toEqual({ rebased: false, reason: 'mirror-expired' });
  });

  it('accepts an age of exactly one millisecond under the TTL', () => {
    const source = mirrored().checkpoint;
    const result = rebaseMirroredCheckpointClock(source, {
      receivedAtEpochMs: SAVED_AT + HOST_MATCH_CHECKPOINT_TTL_MS - 1,
      clockOffsetMs: 0,
    });
    expect(result.rebased).toBe(true);
    if (!result.rebased) return;
    expect(result.appliedAgeMs).toBe(HOST_MATCH_CHECKPOINT_TTL_MS - 1);
  });

  it('is age-preserving on repeat with a trusted offset, so the lease cannot be ratcheted', () => {
    const source = mirrored().checkpoint;
    const first = rebaseMirroredCheckpointClock(source, {
      receivedAtEpochMs: SAVED_AT,
      clockOffsetMs: null,
    });
    expect(first.rebased).toBe(true);
    if (!first.rebased) return;
    // Same machine, 30 seconds later: offset is genuinely zero.
    const second = rebaseMirroredCheckpointClock(first.checkpoint, {
      receivedAtEpochMs: SAVED_AT + 30_000,
      clockOffsetMs: 0,
    });
    expect(second.rebased).toBe(true);
    if (!second.rebased) return;
    expect(second.appliedAgeMs).toBe(30_000);
    expect(second.checkpoint.expiresAtEpochMs).toBe(first.checkpoint.expiresAtEpochMs);
  });

  it('moves resume-token digest expiries with the checkpoint expiry and no further', () => {
    const source = mirrored().checkpoint;
    const result = rebaseMirroredCheckpointClock(source, {
      receivedAtEpochMs: SAVED_AT + 750,
      clockOffsetMs: 0,
    });
    expect(result.rebased).toBe(true);
    if (!result.rebased) return;
    for (const digest of result.checkpoint.resumeTokenDigests) {
      expect(digest.expiresAtEpochMs).toBe(result.checkpoint.expiresAtEpochMs);
      expect(digest.expiresAtEpochMs - result.checkpoint.savedAtEpochMs).toBe(HOST_MATCH_CHECKPOINT_TTL_MS);
    }
  });
});

describe('mirror clock rebase — malformed inputs', () => {
  it('refuses a malformed checkpoint', () => {
    expect(rebaseMirroredCheckpointClock({} as HostMatchCheckpoint, {
      receivedAtEpochMs: SAVED_AT,
      clockOffsetMs: 0,
    })).toEqual({ rebased: false, reason: 'malformed-checkpoint' });
  });

  it('refuses a malformed receive timestamp', () => {
    const source = mirrored().checkpoint;
    for (const receivedAtEpochMs of [0, -1, Number.NaN, 1.5, 10_000_000_000_001]) {
      expect(rebaseMirroredCheckpointClock(source, { receivedAtEpochMs, clockOffsetMs: 0 }))
        .toEqual({ rebased: false, reason: 'malformed-clock-sample' });
    }
  });

  it('refuses a non-numeric offset rather than coercing it', () => {
    const source = mirrored().checkpoint;
    expect(rebaseMirroredCheckpointClock(source, {
      receivedAtEpochMs: SAVED_AT,
      clockOffsetMs: '0' as unknown as number,
    })).toEqual({ rebased: false, reason: 'malformed-clock-sample' });
  });
});

// ---------------------------------------------------------------------------
// Round trip
// ---------------------------------------------------------------------------

describe('host authority mirror — full round trip on the successor machine', () => {
  it('reconstructs the same authoritative state on a clock-skewed successor', () => {
    const source = checkpoint();
    const mirror = mirrored();
    const skewMs = 420_000;
    const receivedAtEpochMs = SAVED_AT + skewMs + 300;
    const rebase = rebaseMirroredCheckpointClock(mirror.checkpoint, {
      receivedAtEpochMs,
      clockOffsetMs: skewMs,
    });
    expect(rebase.rebased).toBe(true);
    if (!rebase.rebased) return;

    const storage = new MemoryStorage();
    expect(saveHostMatchCheckpoint(storage, rebase.checkpoint)).toBe(true);

    const adoptAtEpochMs = receivedAtEpochMs + 5_000;
    const loaded = loadHostMatchCheckpoint(storage, MULTIPLAYER_PROTOCOL_VERSION, ROOM, adoptAtEpochMs);
    expect(loaded).not.toBeNull();

    // The whole roster and the whole ledger came across.
    expect(loaded!.members).toEqual(source.members);
    expect(loaded!.scores).toEqual(source.scores);
    expect(loaded!.bots).toEqual(source.bots);
    expect(loaded!.hostPlayer.id).toBe('guest-1');
    expect([loaded!.hostPlayer.id, ...loaded!.guests.map((guest) => guest.snapshot.id)].sort())
      .toEqual(source.members.map((member) => member.id).sort());

    // Per-player kills and deaths are byte-identical either side of the handover.
    for (const score of source.scores) {
      expect(loaded!.scores.find((entry) => entry.id === score.id)).toEqual(score);
    }

    // Every authority sub-state restores on the successor's own clock.
    const guests = restoreGuestAuthorities(loaded!, adoptAtEpochMs, 1_000);
    expect(guests).not.toBeNull();
    expect(guests!.map((guest) => guest.snapshot.id).sort()).toEqual(['guest-2', 'host-1']);
    expect(restoreRailgunAuthority(loaded!, adoptAtEpochMs, 1_000)).not.toBeNull();
    expect(restoreTimedMapWeaponAuthorities(loaded!, adoptAtEpochMs, 1_000)).not.toBeNull();

    const timing = resolveHostMatchResumeTiming(loaded!, adoptAtEpochMs, 1_000);
    expect(timing).not.toBeNull();
    // Downtime credited is transit (300ms) plus the local 5s hold — not the
    // seven minutes of wall-clock skew between the two machines.
    expect(timing!.elapsedSinceActiveMs).toBe(source.elapsedSinceActiveMs + 5_300);
    expect(timing!.phase).toBe('active');

    // The old host survives as an ordinary, restorable guest.
    const demoted = guests!.find((guest) => guest.snapshot.id === 'host-1')!;
    expect(demoted.snapshot.kills).toBe(source.hostPlayer.kills);
    expect(demoted.continuity).toBe(source.hostPlayer.continuity);
    expect(demoted.health.alive).toBe(true);

    // The term fence survived the trip.
    expect(loaded!.succession).toEqual({ term: 2, successorId: null });
    expect(mirrorGrantsAuthorityTo(loaded!, 'guest-1', ROOM, 2)).toBe(true);
  });

  it('survives the trip without the skew correction only because the clock was rebased', () => {
    const mirror = mirrored();
    const skewMs = 420_000;
    const receivedAtEpochMs = SAVED_AT + skewMs + 300;
    const storage = new MemoryStorage();
    // The un-rebased mirror is written fine but reads as long expired.
    expect(saveHostMatchCheckpoint(storage, mirror.checkpoint)).toBe(true);
    expect(loadHostMatchCheckpoint(storage, MULTIPLAYER_PROTOCOL_VERSION, ROOM, receivedAtEpochMs)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Adoption predicate and the kill switch
// ---------------------------------------------------------------------------

describe('mirrorGrantsAuthorityTo', () => {
  it('accepts the named successor at the mirrored term', () => {
    expect(mirrorGrantsAuthorityTo(mirrored().checkpoint, 'guest-1', ROOM, 2)).toBe(true);
  });

  it('refuses a peer that is not the one the mirror names', () => {
    expect(mirrorGrantsAuthorityTo(mirrored().checkpoint, 'guest-2', ROOM, 2)).toBe(false);
  });

  it('refuses a mirror minted for an earlier or later succession', () => {
    const mirror = mirrored().checkpoint;
    expect(mirrorGrantsAuthorityTo(mirror, 'guest-1', ROOM, 1)).toBe(false);
    expect(mirrorGrantsAuthorityTo(mirror, 'guest-1', ROOM, 3)).toBe(false);
  });

  it('refuses a mirror for a different room', () => {
    expect(mirrorGrantsAuthorityTo(mirrored().checkpoint, 'guest-1', 'other-room', 2)).toBe(false);
  });

  it('refuses the host own un-mirrored checkpoint', () => {
    expect(mirrorGrantsAuthorityTo(checkpoint(), 'host-1', ROOM, 2)).toBe(false);
    expect(mirrorGrantsAuthorityTo(checkpoint(), 'guest-1', ROOM, 2)).toBe(false);
  });

  it('refuses anything that is not a checkpoint at all', () => {
    expect(mirrorGrantsAuthorityTo(null, 'guest-1', ROOM, 2)).toBe(false);
    expect(mirrorGrantsAuthorityTo({ hostPlayer: { id: 'guest-1' } }, 'guest-1', ROOM, 2)).toBe(false);
  });

  it('refuses a checkpoint carrying no succession fence', () => {
    const source = checkpoint();
    const legacy = Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'succession'));
    expect(mirrorGrantsAuthorityTo(legacy, 'host-1', ROOM, 1)).toBe(false);
  });
});

describe('HF-325 kill switch stays off', () => {
  const roster = {
    revision: LOBBY_REVISION,
    hostId: 'host-1',
    members: [
      { id: 'host-1', connected: false },
      { id: 'guest-1', connected: true },
      { id: 'guest-2', connected: true },
    ],
  };

  it('still refuses self-promotion with no-authority-to-adopt when no mirror is held', () => {
    const decision = authorizeSelfPromotion({
      selfId: 'guest-1',
      roomCode: ROOM,
      assessment: { state: 'host-lost', remainingMs: 0, silentForMs: 90_000 },
      mandate: mandate(),
      highestObservedTerm: 1,
      roster,
      holdsMirroredAuthority: false,
      nowEpochMs: SAVED_AT + 1_000,
    });
    expect(decision).toEqual({ promote: false, reason: 'no-authority-to-adopt' });
  });

  it('a mirror alone does not authorise promotion: silence is still not death', () => {
    // Every non-terminal host-loss state refuses regardless of held authority,
    // because a host PeerJS id can be released while its data channels live.
    for (const state of ['healthy', 'unstable', 'reconnecting'] as const) {
      expect(authorizeSelfPromotion({
        selfId: 'guest-1',
        roomCode: ROOM,
        assessment: { state, remainingMs: 12_000, silentForMs: 20_000 },
        mandate: mandate(),
        highestObservedTerm: 1,
        roster,
        holdsMirroredAuthority: mirrorGrantsAuthorityTo(mirrored().checkpoint, 'guest-1', ROOM, 2),
        nowEpochMs: SAVED_AT + 1_000,
      })).toEqual({ promote: false, reason: 'host-not-confirmed-lost' });
    }
  });

  it('a guest holding somebody elses mirror is still refused', () => {
    expect(authorizeSelfPromotion({
      selfId: 'guest-2',
      roomCode: ROOM,
      assessment: { state: 'host-lost', remainingMs: 0, silentForMs: 90_000 },
      mandate: mandate(),
      highestObservedTerm: 1,
      roster,
      holdsMirroredAuthority: mirrorGrantsAuthorityTo(mirrored().checkpoint, 'guest-2', ROOM, 2),
      nowEpochMs: SAVED_AT + 1_000,
    })).toEqual({ promote: false, reason: 'mandate-names-another-guest' });
  });
});
