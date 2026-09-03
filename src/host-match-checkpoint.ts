import { isHostedBotSnapshot, type HostedBotSnapshot } from './hosted-bots';
import {
  isLobbyMember,
  isPlayerScore,
  isPrivateMatchConfig,
  REJOIN_GRACE_MS,
  type LobbyMember,
  type PlayerScore,
  type PrivateMatchConfig,
} from './private-match';
import {
  GRENADE_IDS,
  PRIMARY_WEAPON_IDS,
  SIDEARM_WEAPON_IDS,
  WEAPON_IDS,
  isPlayerSnapshot,
  isGuestCombatInventory,
  type GrenadeId,
  type GuestCombatInventory,
  type PlayerSnapshot,
  type PrimaryWeaponId,
  type SidearmWeaponId,
  type Team,
  type WeaponId,
} from './protocol';
import { guestCombatInventoryWithinWeaponCaps } from './guest-combat-inventory-authority';
import {
  TIMED_MAP_WEAPON_DEFINITIONS,
  TIMED_MAP_WEAPON_IDS,
  isTimedMapWeaponAuthorityState,
  type TimedMapWeaponAuthorityState,
  type TimedMapWeaponId,
} from './timed-map-weapon-authority';
import {
  isFlareAuthorityContinuationCheckpoint,
  isFlareShooterFeedbackCheckpoints,
  type FlareAuthorityContinuationCheckpoint,
  type FlareShooterFeedbackCheckpoint,
} from './flare-authority-checkpoint';
import {
  isKillstreakRuntimeCheckpoint,
  type KillstreakRuntimeCheckpoint,
} from './killstreak-runtime';
import { INITIAL_HOST_TERM, MAX_HOST_TERM } from './host-migration';
import {
  RAILGUN_TOTAL_ROUNDS,
  isRailgunAuthorityState,
  type RailgunAuthorityState,
} from './railgun-authority';
import {
  advanceRemoteHealthAuthority,
  type RemoteHealthAuthorityState,
} from './remote-health-authority';
import {
  isGunRangeMatchClockSnapshot,
  restoreGunRangeMatchClock,
  type GunRangeMatchClockSnapshot,
} from './gun-range-match-clock-authority';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const HOST_MATCH_CHECKPOINT_SCHEMA_VERSION = 3;
export const HOST_MATCH_CHECKPOINT_STORAGE_KEY = 'atomic-acres:host-match-checkpoint:v3';
export const HOST_MATCH_CHECKPOINT_TTL_MS = REJOIN_GRACE_MS;
export const HOST_MATCH_CHECKPOINT_MAX_BYTES = 64 * 1024;

export type HostPlayerCheckpoint = Readonly<{
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  primary: PrimaryWeaponId;
  secondary: SidearmWeaponId;
  grenade: GrenadeId;
  weapon: WeaponId;
  stance: 'stand' | 'crouch' | 'prone';
  grenades: number;
  ammo: Readonly<Record<WeaponId, number>>;
  reserve: Readonly<Record<WeaponId, number>>;
  continuity: number;
  seq: number;
  respawnRemainingMs: number;
  invulnerabilityRemainingMs: number;
}>;

export type HostedBotCheckpoint = Readonly<{
  snapshot: HostedBotSnapshot;
  grenade: GrenadeId;
  continuity: number;
  vx: number;
  vy: number;
  vz: number;
  waypoint: number;
  strafeSign: -1 | 1;
  respawnRemainingMs: number;
  invulnerabilityRemainingMs: number;
  nextGrenadeRemainingMs: number;
}>;

export type ResumeTokenDigestCheckpoint = Readonly<{
  playerId: string;
  sha256: string;
  expiresAtEpochMs: number;
}>;

export type TimedMapWeaponCheckpoint = Readonly<
  Omit<TimedMapWeaponAuthorityState, 'spawnAtHostTimeMs'>
  & { spawnRemainingMs: number | null }
>;

export type TimedMapWeaponCheckpoints = Readonly<Record<TimedMapWeaponId, TimedMapWeaponCheckpoint>>;

export type RailgunCheckpoint = Readonly<
  Omit<RailgunAuthorityState, 'spawnAtHostTimeMs' | 'chamberReadyAtHostTimeMs'>
  & { spawnRemainingMs: number | null; chamberRemainingMs: number }
>;

export type GuestAuthorityCheckpoint = Readonly<{
  snapshot: Readonly<PlayerSnapshot & { stance: 'stand' | 'crouch' | 'prone' }>;
  continuity: number;
  combatInventory: GuestCombatInventory;
  health: Readonly<{
    hp: number;
    alive: boolean;
    respawnRemainingMs: number;
    diedAgeMs: number | null;
    lastDamageAgeMs: number;
    lastAdvancedAgeMs: number;
  }>;
}>;

export type RestoredGuestAuthority = Readonly<{
  snapshot: PlayerSnapshot;
  continuity: number;
  combatInventory: GuestCombatInventory;
  health: RemoteHealthAuthorityState;
}>;

/**
 * HF-325: the succession term this host had reached when it checkpointed.
 *
 * A host that crashes and recovers must NOT restart succession at term zero: a
 * guest that was promoted in the meantime is running at a higher term, and the
 * recovered host has to be able to recognise that it has been superseded rather
 * than mint a fresh mandate that collides. Persisting the term is what makes the
 * fence survive the very crash it exists to handle.
 *
 * `term` is 0 when this host never minted a mandate; `successorId` is the guest
 * named by the last mandate it issued, or null when none was outstanding.
 */
export type HostSuccessionCheckpoint = Readonly<{
  term: number;
  successorId: string | null;
}>;

export type HostMatchCheckpoint = Readonly<{
  schemaVersion: typeof HOST_MATCH_CHECKPOINT_SCHEMA_VERSION;
  protocolVersion: number;
  savedAtEpochMs: number;
  expiresAtEpochMs: number;
  roomCode: string;
  activeAtEpochMs: number;
  matchEpoch: number;
  phase: 'warmup' | 'active';
  elapsedSinceActiveMs: number;
  lobbyRevision: number;
  config: PrivateMatchConfig;
  members: readonly LobbyMember[];
  scores: readonly PlayerScore[];
  hostPlayer: HostPlayerCheckpoint;
  guests: readonly GuestAuthorityCheckpoint[];
  bots: readonly HostedBotCheckpoint[];
  resumeTokenDigests: readonly ResumeTokenDigestCheckpoint[];
  flareProjectiles: FlareAuthorityContinuationCheckpoint;
  flareShotFeedback: readonly FlareShooterFeedbackCheckpoint[];
  railgun: RailgunCheckpoint;
  timedMapWeapons?: TimedMapWeaponCheckpoints;
  /** Present only for an active Gun Range round. */
  matchClock?: GunRangeMatchClockSnapshot;
  /** Optional for checkpoints captured before killstreak runtime admission. */
  killstreak?: KillstreakRuntimeCheckpoint;
  /** Optional for checkpoints captured before HF-325 succession terms existed. */
  succession?: HostSuccessionCheckpoint;
}>;

export type HostMatchResumeTiming = Readonly<{
  activeAtLocalMonoMs: number;
  elapsedSinceActiveMs: number;
  remainingMs: number;
  phase: 'warmup' | 'active';
  matchClock: GunRangeMatchClockSnapshot | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key))
    && Object.keys(value).every((key) => allowed.has(key));
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isBoundedFinite(value: unknown, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function isExactConfig(value: unknown): value is PrivateMatchConfig {
  return isRecord(value)
    && hasExactKeys(value, ['arenaId', 'mode', 'capacity', 'hostedBotCount', 'autoBalance', 'durationMs', 'scoreLimit'])
    && isPrivateMatchConfig(value);
}

function isExactLobbyMember(value: unknown): value is LobbyMember {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'name', 'team', 'ready', 'connected', 'pingMs', 'dhv'])
    && isLobbyMember(value);
}

function isExactPlayerScore(value: unknown): value is PlayerScore {
  return isRecord(value)
    && hasExactKeys(value, ['id', 'kills', 'deaths', 'damageDealt', 'damageTaken'], ['rangeScore', 'rangeHits', 'rangeShots'])
    && isPlayerScore(value);
}

function isWeaponCounterRecord(value: unknown): value is Readonly<Record<WeaponId, number>> {
  if (!isRecord(value) || !hasExactKeys(value, WEAPON_IDS)) return false;
  return WEAPON_IDS.every((weapon) => isBoundedInteger(value[weapon], 0, 10_000));
}

function isExactPlayerSnapshot(value: unknown): value is PlayerSnapshot & { stance: 'stand' | 'crouch' | 'prone' } {
  return isRecord(value)
    && hasExactKeys(value, [
      'id', 'name', 'team', 'x', 'y', 'z', 'yaw', 'pitch', 'hp', 'kills', 'deaths',
      'primary', 'secondary', 'grenade', 'weapon', 'stance', 'seq',
    ])
    && isPlayerSnapshot(value)
    && (value.stance === 'stand' || value.stance === 'crouch' || value.stance === 'prone')
    && [value.x, value.y, value.z].every((coordinate) => isBoundedFinite(coordinate, -10_000, 10_000))
    && isBoundedFinite(value.yaw, -1_000_000, 1_000_000)
    && isBoundedInteger(value.kills, 0, 500)
    && isBoundedInteger(value.deaths, 0, 500)
    && isBoundedInteger(value.seq, 0, 1_000_000_000);
}

function isGuestAuthorityCheckpoint(value: unknown): value is GuestAuthorityCheckpoint {
  if (!isRecord(value) || !hasExactKeys(value, ['snapshot', 'continuity', 'combatInventory', 'health'])
    || !isExactPlayerSnapshot(value.snapshot)
    || !isBoundedInteger(value.continuity, 1, 1_000_000_000)
    || !isGuestCombatInventory(value.combatInventory)
    || !guestCombatInventoryWithinWeaponCaps(value.combatInventory)
    || !isRecord(value.health)
    || !hasExactKeys(value.health, [
      'hp', 'alive', 'respawnRemainingMs', 'diedAgeMs', 'lastDamageAgeMs', 'lastAdvancedAgeMs',
    ])) return false;
  const health = value.health;
  return isBoundedFinite(health.hp, 0, 100)
    && typeof health.alive === 'boolean'
    && health.alive === (Number(health.hp) > 0)
    && health.hp === value.snapshot.hp
    && isBoundedFinite(health.respawnRemainingMs, 0, HOST_MATCH_CHECKPOINT_TTL_MS + 10_000)
    && (health.diedAgeMs === null || isBoundedFinite(health.diedAgeMs, 0, 86_400_000))
    && isBoundedFinite(health.lastDamageAgeMs, 0, 86_400_000)
    && isBoundedFinite(health.lastAdvancedAgeMs, 0, 86_400_000)
    && (health.alive
      ? health.respawnRemainingMs === 0 && health.diedAgeMs === null
      : Number(health.respawnRemainingMs) > 0 && health.diedAgeMs !== null);
}

function isHostPlayerCheckpoint(value: unknown): value is HostPlayerCheckpoint {
  if (!isRecord(value) || !hasExactKeys(value, [
    'id', 'name', 'team', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'hp', 'alive', 'kills', 'deaths',
    'primary', 'secondary', 'grenade', 'weapon', 'stance', 'grenades', 'ammo', 'reserve', 'continuity', 'seq',
    'respawnRemainingMs', 'invulnerabilityRemainingMs',
  ])) return false;
  return typeof value.id === 'string' && value.id.length >= 1 && value.id.length <= 80
    && typeof value.name === 'string' && value.name.length >= 1 && value.name.length <= 20
    && (value.team === 0 || value.team === 1)
    && ['x', 'y', 'z'].every((key) => isBoundedFinite(value[key], -10_000, 10_000))
    && ['vx', 'vy', 'vz'].every((key) => isBoundedFinite(value[key], -1_000, 1_000))
    && isBoundedFinite(value.yaw, -1_000_000, 1_000_000)
    && isBoundedFinite(value.pitch, -Math.PI / 2, Math.PI / 2)
    && isBoundedFinite(value.hp, 0, 100)
    && typeof value.alive === 'boolean' && value.alive === (Number(value.hp) > 0)
    && isBoundedInteger(value.kills, 0, 500)
    && isBoundedInteger(value.deaths, 0, 500)
    && PRIMARY_WEAPON_IDS.includes(value.primary as PrimaryWeaponId)
    && SIDEARM_WEAPON_IDS.includes(value.secondary as SidearmWeaponId)
    && GRENADE_IDS.includes(value.grenade as GrenadeId)
    && WEAPON_IDS.includes(value.weapon as WeaponId)
    && (value.stance === 'stand' || value.stance === 'crouch' || value.stance === 'prone')
    && isBoundedInteger(value.grenades, 0, 1)
    && isWeaponCounterRecord(value.ammo)
    && isWeaponCounterRecord(value.reserve)
    && isBoundedInteger(value.continuity, 1, 1_000_000_000)
    && isBoundedInteger(value.seq, 0, 1_000_000_000)
    && isBoundedFinite(value.respawnRemainingMs, 0, 10_000)
    && isBoundedFinite(value.invulnerabilityRemainingMs, 0, 10_000)
    && (value.alive ? Number(value.respawnRemainingMs) === 0 : Number(value.respawnRemainingMs) > 0);
}

function isExactHostedBotSnapshot(value: unknown): value is HostedBotSnapshot {
  return isRecord(value)
    // PASS 87 Lane AR item 3: 'stance' joins the exact key set with the field
    // itself. hasExactKeys is why this had to change in lockstep - a snapshot
    // carrying the new field would otherwise be refused as malformed, which is
    // the gate doing its job.
    && hasExactKeys(value, ['id', 'name', 'team', 'weapon', 'x', 'y', 'z', 'yaw', 'stance', 'hp', 'kills', 'deaths', 'alive', 'seq'])
    && isHostedBotSnapshot(value);
}

function isHostedBotCheckpoint(value: unknown): value is HostedBotCheckpoint {
  if (!isRecord(value) || !hasExactKeys(value, [
    'snapshot', 'grenade', 'continuity', 'vx', 'vy', 'vz', 'waypoint', 'strafeSign',
    'respawnRemainingMs', 'invulnerabilityRemainingMs', 'nextGrenadeRemainingMs',
  ])) return false;
  if (!isExactHostedBotSnapshot(value.snapshot)
    || !GRENADE_IDS.includes(value.grenade as GrenadeId)
    || !isBoundedInteger(value.continuity, 1, 1_000_000_000)
    || !['vx', 'vy', 'vz'].every((key) => isBoundedFinite(value[key], -1_000, 1_000))
    || !isBoundedInteger(value.waypoint, 0, 10_000)
    || value.strafeSign !== -1 && value.strafeSign !== 1
    || !isBoundedFinite(value.respawnRemainingMs, 0, 10_000)
    || !isBoundedFinite(value.invulnerabilityRemainingMs, 0, 10_000)
    || !isBoundedFinite(value.nextGrenadeRemainingMs, 0, 120_000)) return false;
  return value.snapshot.alive ? Number(value.respawnRemainingMs) === 0 : Number(value.respawnRemainingMs) > 0;
}

function isResumeTokenDigestCheckpoint(value: unknown): value is ResumeTokenDigestCheckpoint {
  return isRecord(value)
    && hasExactKeys(value, ['playerId', 'sha256', 'expiresAtEpochMs'])
    && typeof value.playerId === 'string' && value.playerId.length >= 1 && value.playerId.length <= 80
    && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)
    && isBoundedInteger(value.expiresAtEpochMs, 1, 10_000_000_000_000);
}

function isTimedMapWeaponCheckpoint(value: unknown, weaponId: TimedMapWeaponId): value is TimedMapWeaponCheckpoint {
  if (!isRecord(value) || !hasExactKeys(value, [
    'generation', 'revision', 'weaponId', 'arenaId', 'status', 'spawnRemainingMs',
    'pickupPosition', 'holderId', 'shotsRemaining', 'announcementSent', 'processedShotIds',
  ])) return false;
  if (value.weaponId !== weaponId
    || typeof value.generation !== 'number'
    || typeof value.revision !== 'number'
    || value.spawnRemainingMs !== null && !isBoundedFinite(value.spawnRemainingMs, 0, 900_000)) return false;
  const { spawnRemainingMs, ...authority } = value;
  if (!isTimedMapWeaponAuthorityState({
    ...authority,
    spawnAtHostTimeMs: spawnRemainingMs,
  })) return false;
  const totalShots = TIMED_MAP_WEAPON_DEFINITIONS[weaponId].totalShots;
  if (value.status === 'disabled') {
    return spawnRemainingMs === null && value.pickupPosition === null && value.holderId === null
      && value.shotsRemaining === totalShots && value.announcementSent === false
      && Array.isArray(value.processedShotIds) && value.processedShotIds.length === 0;
  }
  if (value.status === 'scheduled') {
    return spawnRemainingMs !== null && value.holderId === null
      && value.shotsRemaining === totalShots && value.announcementSent === false
      && Array.isArray(value.processedShotIds) && value.processedShotIds.length === 0;
  }
  return spawnRemainingMs === null;
}

function isTimedMapWeaponCheckpoints(value: unknown): value is TimedMapWeaponCheckpoints {
  return isRecord(value)
    && hasExactKeys(value, TIMED_MAP_WEAPON_IDS)
    && TIMED_MAP_WEAPON_IDS.every((weaponId) => isTimedMapWeaponCheckpoint(value[weaponId], weaponId));
}

function isRailgunCheckpoint(value: unknown): value is RailgunCheckpoint {
  if (!isRecord(value) || !hasExactKeys(value, [
    'generation', 'revision', 'status', 'spawnRemainingMs', 'spawnSite', 'pickupPosition',
    'holderId', 'roundsRemaining', 'chamberRemainingMs', 'announcementSent', 'processedShotIds',
  ])
    || value.spawnRemainingMs !== null && !isBoundedFinite(value.spawnRemainingMs, 0, 900_000)
    || !isBoundedFinite(value.chamberRemainingMs, 0, 10_000)) return false;
  const candidate = value as unknown as RailgunCheckpoint;
  const { spawnRemainingMs, chamberRemainingMs, ...rest } = candidate;
  if (!isRailgunAuthorityState({
    ...rest,
    spawnAtHostTimeMs: spawnRemainingMs,
    chamberReadyAtHostTimeMs: chamberRemainingMs,
  })) return false;
  if (candidate.status === 'disabled') {
    return spawnRemainingMs === null && candidate.spawnSite === null && candidate.pickupPosition === null
      && candidate.holderId === null && candidate.roundsRemaining === RAILGUN_TOTAL_ROUNDS
      && chamberRemainingMs === 0 && candidate.announcementSent === false
      && candidate.processedShotIds.length === 0;
  }
  if (candidate.status === 'scheduled') {
    return spawnRemainingMs !== null && candidate.spawnSite !== null && candidate.pickupPosition !== null
      && candidate.holderId === null && candidate.roundsRemaining === RAILGUN_TOTAL_ROUNDS
      && chamberRemainingMs === 0 && candidate.announcementSent === false
      && candidate.processedShotIds.length === 0;
  }
  if (candidate.status === 'available') {
    return spawnRemainingMs === null && candidate.pickupPosition !== null && candidate.holderId === null
      && candidate.roundsRemaining > 0 && candidate.announcementSent === true;
  }
  if (candidate.status === 'held') {
    return spawnRemainingMs === null && candidate.pickupPosition === null && typeof candidate.holderId === 'string'
      && candidate.roundsRemaining > 0 && candidate.announcementSent === true;
  }
  return spawnRemainingMs === null && candidate.pickupPosition === null && typeof candidate.holderId === 'string'
    && candidate.roundsRemaining === 0 && chamberRemainingMs === 0 && candidate.announcementSent === true;
}

function isHostSuccessionCheckpoint(value: unknown): value is HostSuccessionCheckpoint {
  if (!isRecord(value) || !hasExactKeys(value, ['term', 'successorId'])) return false;
  if (!isBoundedInteger(value.term, 0, MAX_HOST_TERM)) return false;
  if (value.successorId === null) return true;
  // A named successor only exists once a mandate has actually been minted.
  return typeof value.successorId === 'string' && value.successorId.length >= 1 && value.successorId.length <= 80
    && Number(value.term) >= INITIAL_HOST_TERM;
}

export function isHostMatchCheckpoint(value: unknown, expectedProtocolVersion?: number): value is HostMatchCheckpoint {
  if (!isRecord(value) || !hasExactKeys(value, [
    'schemaVersion', 'protocolVersion', 'savedAtEpochMs', 'expiresAtEpochMs', 'roomCode', 'activeAtEpochMs',
    'matchEpoch', 'phase', 'elapsedSinceActiveMs', 'lobbyRevision', 'config', 'members', 'scores', 'hostPlayer', 'guests', 'bots',
    'resumeTokenDigests', 'flareProjectiles', 'flareShotFeedback', 'railgun',
  ], ['timedMapWeapons', 'matchClock', 'killstreak', 'succession'])) return false;
  if (value.schemaVersion !== HOST_MATCH_CHECKPOINT_SCHEMA_VERSION
    || !isBoundedInteger(value.protocolVersion, 1, 1_000_000)
    || expectedProtocolVersion !== undefined && value.protocolVersion !== expectedProtocolVersion
    || !isBoundedInteger(value.savedAtEpochMs, 1, 10_000_000_000_000)
    || value.expiresAtEpochMs !== Number(value.savedAtEpochMs) + HOST_MATCH_CHECKPOINT_TTL_MS
    || typeof value.roomCode !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.roomCode)
    || !isBoundedInteger(value.activeAtEpochMs, 1, 10_000_000_000_000)
    || !isBoundedInteger(value.matchEpoch, 1, 999_999_999)
    || value.matchEpoch !== Math.max(1, Math.floor(Number(value.activeAtEpochMs)) % 1_000_000_000)
    || value.phase !== 'warmup' && value.phase !== 'active'
    || !isBoundedFinite(value.elapsedSinceActiveMs, -10_000, 900_000)
    || !isBoundedInteger(value.lobbyRevision, 0, 1_000_000_000)
    || !isExactConfig(value.config)
    || !Array.isArray(value.members) || value.members.length < 1 || value.members.length > value.config.capacity
    || !value.members.every(isExactLobbyMember)
    || !Array.isArray(value.scores) || value.scores.length < 1 || value.scores.length > 10
    || !value.scores.every(isExactPlayerScore)
    || !isHostPlayerCheckpoint(value.hostPlayer)
    || !Array.isArray(value.guests) || !value.guests.every(isGuestAuthorityCheckpoint)
    || !Array.isArray(value.bots) || value.bots.length !== value.config.hostedBotCount
    || !value.bots.every(isHostedBotCheckpoint)
    || !Array.isArray(value.resumeTokenDigests) || !value.resumeTokenDigests.every(isResumeTokenDigestCheckpoint)
    || !isFlareAuthorityContinuationCheckpoint(value.flareProjectiles)
    || !isFlareShooterFeedbackCheckpoints(value.flareShotFeedback, value.flareProjectiles)
    || !isRailgunCheckpoint(value.railgun)
    || value.timedMapWeapons !== undefined && !isTimedMapWeaponCheckpoints(value.timedMapWeapons)
    || value.killstreak !== undefined && !isKillstreakRuntimeCheckpoint(value.killstreak)
    || value.succession !== undefined && !isHostSuccessionCheckpoint(value.succession)) return false;

  const members = value.members as LobbyMember[];
  const scores = value.scores as PlayerScore[];
  const bots = value.bots as HostedBotCheckpoint[];
  const guests = value.guests as GuestAuthorityCheckpoint[];
  const digests = value.resumeTokenDigests as ResumeTokenDigestCheckpoint[];
  const hostPlayer = value.hostPlayer as HostPlayerCheckpoint;
  const config = value.config as PrivateMatchConfig;
  const timedMapWeapons = value.timedMapWeapons as TimedMapWeaponCheckpoints | undefined;
  const railgun = value.railgun as RailgunCheckpoint;
  const killstreak = value.killstreak as KillstreakRuntimeCheckpoint | undefined;
  const succession = value.succession as HostSuccessionCheckpoint | undefined;
  const flareProjectiles = value.flareProjectiles as FlareAuthorityContinuationCheckpoint;
  const flareShotFeedback = value.flareShotFeedback as readonly FlareShooterFeedbackCheckpoint[];
  const matchClock = value.matchClock as GunRangeMatchClockSnapshot | undefined;
  const memberIds = members.map((member) => member.id);
  const botIds = bots.map((bot) => bot.snapshot.id);
  const scoreIds = scores.map((score) => score.id);
  const guestIds = memberIds.filter((id) => id !== hostPlayer.id).sort();
  const digestIds = digests.map((digest) => digest.playerId).sort();
  const guestAuthorityIds = guests.map((guest) => guest.snapshot.id).sort();
  const expectedScoreIds = [...memberIds, ...botIds].sort();
  const hostMember = members.find((member) => member.id === hostPlayer.id);
  const hostScore = scores.find((score) => score.id === hostPlayer.id);
  return new Set(memberIds).size === memberIds.length
    && new Set(botIds).size === botIds.length
    && new Set(scoreIds).size === scoreIds.length
    && new Set(digestIds).size === digestIds.length
    && new Set(guestAuthorityIds).size === guestAuthorityIds.length
    && hostMember !== undefined
    && hostMember.name === hostPlayer.name
    && hostMember.team === hostPlayer.team
    && hostScore !== undefined
    && hostScore.kills === hostPlayer.kills
    && hostScore.deaths === hostPlayer.deaths
    && JSON.stringify(scoreIds.sort()) === JSON.stringify(expectedScoreIds)
    && JSON.stringify(digestIds) === JSON.stringify(guestIds)
    && JSON.stringify(guestAuthorityIds) === JSON.stringify(guestIds)
    && guests.every((guest) => {
      const member = members.find((candidate) => candidate.id === guest.snapshot.id);
      const score = scores.find((candidate) => candidate.id === guest.snapshot.id);
      return member?.name === guest.snapshot.name
        && member.team === guest.snapshot.team
        && score?.kills === guest.snapshot.kills
        && score.deaths === guest.snapshot.deaths;
    })
    && bots.every((bot) => {
      const score = scores.find((candidate) => candidate.id === bot.snapshot.id);
      return score?.kills === bot.snapshot.kills && score.deaths === bot.snapshot.deaths;
    })
    && (timedMapWeapons === undefined || TIMED_MAP_WEAPON_IDS.every((weaponId) => {
      const state = timedMapWeapons[weaponId];
      const holderIsAdmitted = state.holderId === null || expectedScoreIds.includes(state.holderId);
      const arenaOwnsState = config.arenaId === 'gun-range'
        || state.arenaId === config.arenaId
        || state.status === 'disabled';
      return holderIsAdmitted && arenaOwnsState;
    }))
    && (railgun.holderId === null || expectedScoreIds.includes(railgun.holderId))
    && (config.arenaId === 'atomic-acres' || config.arenaId === 'gun-range' || railgun.status === 'disabled')
    && (railgun.holderId === hostPlayer.id) === (hostPlayer.weapon === 'railgun')
    && guests.every((guest) => (railgun.holderId === guest.snapshot.id) === (guest.snapshot.weapon === 'railgun'))
    && bots.every((bot) => (railgun.holderId === bot.snapshot.id) === (bot.snapshot.weapon === 'railgun'))
    && (killstreak === undefined || (
      killstreak.matchEpoch === value.matchEpoch
      && killstreak.actors.some((actor) => (
        actor.actorId === hostPlayer.id
        && actor.team === hostPlayer.team
        && actor.lifeId === hostPlayer.continuity
      ))
      && killstreak.actors.every((actor) => {
        const member = members.find((candidate) => candidate.id === actor.actorId);
        return member?.team === actor.team;
      })
      && guests.every((guest) => {
        const actor = killstreak.actors.find((candidate) => candidate.actorId === guest.snapshot.id);
        return actor === undefined
          || actor.team === guest.snapshot.team && actor.lifeId === guest.continuity;
      })
    ))
    // A named successor must be a real non-host member of this very roster.
    // A stale name would let a recovered host re-issue a mandate for someone who
    // is not in the match any more.
    && (succession === undefined || succession.successorId === null || (
      succession.successorId !== hostPlayer.id && memberIds.includes(succession.successorId)
    ))
    && (flareProjectiles.effects.length === 0
      || config.arenaId === 'skyline-terminal'
      || config.arenaId === 'gun-range')
    && flareProjectiles.effects.every((effect) => {
      const member = members.find((candidate) => candidate.id === effect.ownerId);
      const bot = bots.find((candidate) => candidate.snapshot.id === effect.ownerId);
      return member?.team === effect.ownerTeam || bot?.snapshot.team === effect.ownerTeam;
    })
    && flareShotFeedback.every((context) => guestIds.includes(context.ownerId))
    && digests.every((digest) => digest.expiresAtEpochMs === Number(value.expiresAtEpochMs))
    && (config.arenaId === 'gun-range' && value.phase === 'active'
      ? isGunRangeMatchClockSnapshot(matchClock, config.durationMs)
        && Math.abs(Number(value.elapsedSinceActiveMs) - (config.durationMs - matchClock.remainingMs)) < 1
      : matchClock === undefined)
    && (value.phase === 'warmup' ? Number(value.elapsedSinceActiveMs) < 0 : Number(value.elapsedSinceActiveMs) >= 0)
    && Number(value.elapsedSinceActiveMs) < value.config.durationMs;
}

/** Convert a host-owned railgun schedule/rechamber clock into crash-safe
 * relative durations without changing finite ammo, holder, or replay history. */
export function checkpointRailgunAuthority(
  state: RailgunAuthorityState,
  nowMonoMs = performance.now(),
): RailgunCheckpoint | null {
  if (!Number.isFinite(nowMonoMs) || !isRailgunAuthorityState(state)) return null;
  const { spawnAtHostTimeMs, chamberReadyAtHostTimeMs, ...rest } = state;
  const checkpoint: RailgunCheckpoint = Object.freeze({
    ...rest,
    spawnSite: rest.spawnSite ? Object.freeze({
      id: rest.spawnSite.id,
      position: Object.freeze([...rest.spawnSite.position] as [number, number, number]),
    }) : null,
    pickupPosition: rest.pickupPosition
      ? Object.freeze([...rest.pickupPosition] as [number, number, number])
      : null,
    processedShotIds: Object.freeze([...rest.processedShotIds]),
    spawnRemainingMs: state.status === 'scheduled' && spawnAtHostTimeMs !== null
      ? Math.max(0, spawnAtHostTimeMs - nowMonoMs)
      : null,
    chamberRemainingMs: Math.max(0, chamberReadyAtHostTimeMs - nowMonoMs),
  });
  return isRailgunCheckpoint(checkpoint) ? checkpoint : null;
}

/** Rebase railgun clocks into the recovered document and account for downtime. */
export function restoreRailgunAuthority(
  checkpoint: Pick<HostMatchCheckpoint, 'savedAtEpochMs' | 'railgun'>,
  nowEpochMs = Date.now(),
  nowMonoMs = performance.now(),
): RailgunAuthorityState | null {
  if (!isRailgunCheckpoint(checkpoint.railgun)
    || !Number.isFinite(nowEpochMs) || !Number.isFinite(nowMonoMs)
    || nowEpochMs < checkpoint.savedAtEpochMs) return null;
  const downtimeMs = nowEpochMs - checkpoint.savedAtEpochMs;
  const { spawnRemainingMs, chamberRemainingMs, ...rest } = checkpoint.railgun;
  const state: RailgunAuthorityState = Object.freeze({
    ...rest,
    spawnSite: rest.spawnSite ? Object.freeze({
      id: rest.spawnSite.id,
      position: Object.freeze([...rest.spawnSite.position] as [number, number, number]),
    }) : null,
    pickupPosition: rest.pickupPosition
      ? Object.freeze([...rest.pickupPosition] as [number, number, number])
      : null,
    processedShotIds: Object.freeze([...rest.processedShotIds]),
    spawnAtHostTimeMs: spawnRemainingMs === null
      ? null
      : nowMonoMs + Math.max(0, spawnRemainingMs - downtimeMs),
    chamberReadyAtHostTimeMs: chamberRemainingMs <= downtimeMs
      ? 0
      : nowMonoMs + chamberRemainingMs - downtimeMs,
  });
  return isRailgunAuthorityState(state) ? state : null;
}

/** Snapshot the authoritative pose/loadout and relative health timers for one
 * non-host lobby member. */
export function checkpointGuestAuthority(
  snapshot: PlayerSnapshot,
  continuity: number,
  health: RemoteHealthAuthorityState,
  combatInventory: GuestCombatInventory,
  nowMonoMs = performance.now(),
): GuestAuthorityCheckpoint | null {
  if (!Number.isFinite(nowMonoMs) || !isExactPlayerSnapshot(snapshot)
    || !isBoundedInteger(continuity, 1, 1_000_000_000)
    || !Number.isFinite(health.hp) || health.hp < 0 || health.hp > 100
    || health.alive !== (health.hp > 0)
    || snapshot.hp !== health.hp
    || !isGuestCombatInventory(combatInventory)
    || !guestCombatInventoryWithinWeaponCaps(combatInventory)
    || ![health.respawnEligibleAt, health.lastDamageAtHostTimeMs, health.lastAdvancedAtHostTimeMs].every(Number.isFinite)
    || health.diedAtHostTimeMs !== null && !Number.isFinite(health.diedAtHostTimeMs)) return null;
  const boundedAge = (at: number): number => Math.min(86_400_000, Math.max(0, nowMonoMs - at));
  const checkpoint: GuestAuthorityCheckpoint = Object.freeze({
    snapshot: Object.freeze({ ...snapshot, stance: snapshot.stance! }),
    continuity,
    combatInventory: Object.freeze({
      ammo: Object.freeze({ ...combatInventory.ammo }),
      reserve: Object.freeze({ ...combatInventory.reserve }),
      grenades: combatInventory.grenades,
    }),
    health: Object.freeze({
      hp: health.hp,
      alive: health.alive,
      respawnRemainingMs: health.alive ? 0 : Math.max(1, health.respawnEligibleAt - nowMonoMs),
      diedAgeMs: health.diedAtHostTimeMs === null ? null : boundedAge(health.diedAtHostTimeMs),
      lastDamageAgeMs: boundedAge(health.lastDamageAtHostTimeMs),
      lastAdvancedAgeMs: boundedAge(health.lastAdvancedAtHostTimeMs),
    }),
  });
  return isGuestAuthorityCheckpoint(checkpoint) ? checkpoint : null;
}

/** Restore guest ledgers before any reconnecting document is allowed to supply
 * movement. Alive health advances across host downtime; dead respawn deadlines
 * retain their remaining bounded delay. */
export function restoreGuestAuthorities(
  checkpoint: Pick<HostMatchCheckpoint, 'savedAtEpochMs' | 'guests'>,
  nowEpochMs = Date.now(),
  nowMonoMs = performance.now(),
): readonly RestoredGuestAuthority[] | null {
  if (!Array.isArray(checkpoint.guests) || !checkpoint.guests.every(isGuestAuthorityCheckpoint)
    || !Number.isFinite(nowEpochMs) || !Number.isFinite(nowMonoMs)
    || nowEpochMs < checkpoint.savedAtEpochMs) return null;
  const downtimeMs = nowEpochMs - checkpoint.savedAtEpochMs;
  return Object.freeze(checkpoint.guests.map((guest) => {
    const shifted: RemoteHealthAuthorityState = {
      hp: guest.health.hp,
      alive: guest.health.alive,
      respawnEligibleAt: nowMonoMs + Math.max(0, guest.health.respawnRemainingMs - downtimeMs),
      diedAtHostTimeMs: guest.health.diedAgeMs === null
        ? null
        : nowMonoMs - guest.health.diedAgeMs - downtimeMs,
      lastDamageAtHostTimeMs: nowMonoMs - guest.health.lastDamageAgeMs - downtimeMs,
      lastAdvancedAtHostTimeMs: nowMonoMs - guest.health.lastAdvancedAgeMs - downtimeMs,
    };
    const health = shifted.alive ? advanceRemoteHealthAuthority(shifted, nowMonoMs) : shifted;
    return Object.freeze({
      snapshot: Object.freeze({ ...guest.snapshot, hp: health.hp }),
      continuity: guest.continuity,
      combatInventory: Object.freeze({
        ammo: Object.freeze({ ...guest.combatInventory.ammo }),
        reserve: Object.freeze({ ...guest.combatInventory.reserve }),
        grenades: guest.combatInventory.grenades,
      }),
      health: Object.freeze(health),
    });
  }));
}

/**
 * Convert host-monotonic spawn deadlines into crash-safe relative durations.
 * The returned record always contains both canonical timed pickups.
 */
export function checkpointTimedMapWeaponAuthorities(
  states: Readonly<Record<TimedMapWeaponId, TimedMapWeaponAuthorityState>>,
  nowMonoMs = performance.now(),
): TimedMapWeaponCheckpoints | null {
  if (!Number.isFinite(nowMonoMs)) return null;
  const entries = TIMED_MAP_WEAPON_IDS.map((weaponId) => {
    const state = states[weaponId];
    if (!isTimedMapWeaponAuthorityState(state) || state.weaponId !== weaponId) return null;
    const { spawnAtHostTimeMs, ...rest } = state;
    const spawnRemainingMs = state.status === 'scheduled' && spawnAtHostTimeMs !== null
      ? Math.max(0, spawnAtHostTimeMs - nowMonoMs)
      : null;
    return [weaponId, Object.freeze({
      ...rest,
      pickupPosition: rest.pickupPosition ? Object.freeze([...rest.pickupPosition] as [number, number, number]) : null,
      processedShotIds: Object.freeze([...rest.processedShotIds]),
      spawnRemainingMs,
    })] as const;
  });
  if (entries.some((entry) => entry === null)) return null;
  return Object.freeze(Object.fromEntries(
    entries as readonly (readonly [TimedMapWeaponId, TimedMapWeaponCheckpoint])[],
  ) as TimedMapWeaponCheckpoints);
}

/** Rebase a recovered scheduled spawn into the new document's monotonic clock. */
export function restoreTimedMapWeaponAuthorities(
  checkpoint: Pick<HostMatchCheckpoint, 'savedAtEpochMs' | 'timedMapWeapons'>,
  nowEpochMs = Date.now(),
  nowMonoMs = performance.now(),
): Readonly<Record<TimedMapWeaponId, TimedMapWeaponAuthorityState>> | null {
  if (!checkpoint.timedMapWeapons || !isTimedMapWeaponCheckpoints(checkpoint.timedMapWeapons)
    || !Number.isFinite(nowEpochMs) || !Number.isFinite(nowMonoMs)
    || nowEpochMs < checkpoint.savedAtEpochMs) return null;
  const downtimeMs = nowEpochMs - checkpoint.savedAtEpochMs;
  const entries = TIMED_MAP_WEAPON_IDS.map((weaponId) => {
    const persisted = checkpoint.timedMapWeapons![weaponId];
    const { spawnRemainingMs, ...rest } = persisted;
    const spawnAtHostTimeMs = spawnRemainingMs === null
      ? null
      : nowMonoMs + Math.max(0, spawnRemainingMs - downtimeMs);
    const state: TimedMapWeaponAuthorityState = Object.freeze({
      ...rest,
      pickupPosition: rest.pickupPosition ? Object.freeze([...rest.pickupPosition] as [number, number, number]) : null,
      processedShotIds: Object.freeze([...rest.processedShotIds]),
      spawnAtHostTimeMs,
    });
    return [weaponId, state] as const;
  });
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<TimedMapWeaponId, TimedMapWeaponAuthorityState>>;
}

export function resolveHostMatchResumeTiming(
  checkpoint: HostMatchCheckpoint,
  nowEpochMs = Date.now(),
  nowMonoMs = performance.now(),
): HostMatchResumeTiming | null {
  if (!Number.isFinite(nowEpochMs) || !Number.isFinite(nowMonoMs)
    || nowEpochMs < checkpoint.savedAtEpochMs || nowEpochMs >= checkpoint.expiresAtEpochMs) return null;
  const downtimeMs = nowEpochMs - checkpoint.savedAtEpochMs;
  const matchClock = checkpoint.matchClock
    ? restoreGunRangeMatchClock(checkpoint.matchClock, nowMonoMs, downtimeMs, checkpoint.config.durationMs)
    : null;
  const elapsedSinceActiveMs = matchClock
    ? checkpoint.config.durationMs - matchClock.remainingMs
    : checkpoint.elapsedSinceActiveMs + downtimeMs;
  if (!Number.isFinite(elapsedSinceActiveMs) || elapsedSinceActiveMs >= checkpoint.config.durationMs) return null;
  return Object.freeze({
    activeAtLocalMonoMs: nowMonoMs - elapsedSinceActiveMs,
    elapsedSinceActiveMs,
    remainingMs: checkpoint.config.durationMs - Math.max(0, elapsedSinceActiveMs),
    phase: elapsedSinceActiveMs < 0 ? 'warmup' : 'active',
    matchClock,
  });
}

function discardCheckpoint(storage: StorageLike): null {
  try { storage.removeItem(HOST_MATCH_CHECKPOINT_STORAGE_KEY); } catch { /* A broken storage provider stays fail-closed in memory. */ }
  return null;
}

export function loadHostMatchCheckpoint(
  storage: StorageLike,
  expectedProtocolVersion: number,
  expectedRoomCode?: string,
  nowEpochMs = Date.now(),
): HostMatchCheckpoint | null {
  try {
    const serialized = storage.getItem(HOST_MATCH_CHECKPOINT_STORAGE_KEY);
    if (!serialized || serialized.length > HOST_MATCH_CHECKPOINT_MAX_BYTES) return discardCheckpoint(storage);
    const parsed: unknown = JSON.parse(serialized);
    if (!isHostMatchCheckpoint(parsed, expectedProtocolVersion)
      || expectedRoomCode !== undefined && parsed.roomCode !== expectedRoomCode
      || parsed.resumeTokenDigests.some((digest) => digest.expiresAtEpochMs <= nowEpochMs)
      || resolveHostMatchResumeTiming(parsed, nowEpochMs, 0) === null) return discardCheckpoint(storage);
    return parsed;
  } catch {
    return discardCheckpoint(storage);
  }
}

export function saveHostMatchCheckpoint(storage: StorageLike, checkpoint: HostMatchCheckpoint): boolean {
  if (!isHostMatchCheckpoint(checkpoint, checkpoint.protocolVersion)) return false;
  try {
    const serialized = JSON.stringify(checkpoint);
    if (serialized.length > HOST_MATCH_CHECKPOINT_MAX_BYTES) return false;
    storage.setItem(HOST_MATCH_CHECKPOINT_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}

export function clearHostMatchCheckpoint(storage: StorageLike): void {
  try { storage.removeItem(HOST_MATCH_CHECKPOINT_STORAGE_KEY); } catch { /* Recovery state is best effort. */ }
}

export async function sha256ResumeToken(token: string): Promise<string> {
  if (typeof token !== 'string' || token.length < 24 || token.length > 128) throw new Error('Invalid resume token');
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto SHA-256 is unavailable');
  const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(token)));
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function resumeTokenMatchesDigest(token: string, expectedSha256: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) return false;
  let actual: string;
  try { actual = await sha256ResumeToken(token); } catch { return false; }
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expectedSha256.charCodeAt(index);
  }
  return difference === 0;
}
