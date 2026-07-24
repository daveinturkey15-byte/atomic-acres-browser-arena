import { presentationRandom } from './runtime-random';
import { MAX_HIGH_SCORE_ENTRIES, isHighScoreEntry, type HighScoreEntry } from './high-scores';
import { LEADERBOARD_SEASON } from '../shared/leaderboard-season';
import { isHostedBotSnapshot, type HostedBotSnapshot } from './hosted-bots';
import type { KillCause } from './kill-provenance';
import type { CombatTiming } from './network-fairness';
import { isDhv, type Dhv } from './handicap';
import {
  isLobbySnapshot,
  isPlayerScore,
  isPrivateMatchConfig,
  type LobbySnapshot,
  type PlayerScore,
  type PrivateMatchConfig,
} from './private-match';

export type Team = 0 | 1;
export const MULTIPLAYER_PROTOCOL_VERSION = 4;
export type PrimaryWeaponId = 'carbine' | 'smg' | 'lmg' | 'scattergun' | 'sniper';
export type SidearmWeaponId = 'pistol' | 'machine-pistol' | 'magnum';
export type WeaponId = PrimaryWeaponId | SidearmWeaponId;

export const PRIMARY_WEAPON_IDS: readonly PrimaryWeaponId[] = Object.freeze(['carbine', 'smg', 'lmg', 'scattergun', 'sniper']);
export const WEAPON_IDS: readonly WeaponId[] = Object.freeze([...PRIMARY_WEAPON_IDS, 'pistol', 'machine-pistol', 'magnum']);
export const MAX_MATCH_SCORE_ENTRIES = 10;

export type PlayerSnapshot = {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  kills: number;
  deaths: number;
  primary: PrimaryWeaponId;
  weapon: WeaponId;
  stance?: 'stand' | 'crouch' | 'prone';
  seq: number;
};

export type JoinMessage = { type: 'join'; player: PlayerSnapshot };
export type StateMessage = {
  type: 'state';
  player: PlayerSnapshot;
  hostTimeMs: number;
  continuity: number;
  rateHz: 20 | 30 | 40;
};
export type ShotMessage = {
  type: 'shot';
  by: string;
  weapon: WeaponId;
  origin: [number, number, number];
  direction: [number, number, number];
  /** Every authoritative pellet ray; one entry for single-projectile weapons. */
  pelletDirections: [number, number, number][];
  timing?: CombatTiming;
  nonce: number;
};
export type ShotRejectReason = 'none' | 'protocol-mismatch' | 'unknown-sender' | 'duplicate' | 'sequence-gap'
  | 'weapon-mismatch' | 'cadence' | 'stale' | 'future' | 'invalid-direction' | 'invalid-pellets'
  | 'bad-origin' | 'missing-history' | 'continuity-mismatch' | 'connection-epoch-mismatch'
  | 'life-mismatch' | 'shooter-dead' | 'invalid-timeline' | 'obstructed' | 'malformed';
export type ShotRequestMessage = {
  type: 'shot-request';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  by: string;
  shotId: string;
  connectionEpoch: string;
  lifeId: number;
  shotSeq: number;
  weaponSequence: number;
  weapon: WeaponId;
  /** Trigger time in the host monotonic domain. */
  fireTimeMs: number;
  /** Host-world time represented by remote target presentation when the trigger fired. */
  targetViewTimeMs: number;
  origin: [number, number, number];
  direction: [number, number, number];
  pelletDirections: [number, number, number][];
  nonce: number;
};
export type ShotOutcome = {
  target: string;
  pelletHits: number;
  damage: number;
  rawDamage?: number;
  resultingHealth: number;
  died: boolean;
  hitZone: 'head' | 'body' | 'limb';
  wallbang: boolean;
  penetrationMultiplier: number;
};
export type ShotResultMessage = {
  type: 'shot-result';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  by: string;
  forPlayerId: string;
  shotId: string;
  shotSeq: number;
  status: 'accepted-hit' | 'accepted-miss' | 'rejected';
  reason: ShotRejectReason;
  fireTimeMs: number;
  targetViewTimeMs: number;
  receivedAtHostTimeMs: number | null;
  resolvedAtHostTimeMs: number | null;
  appliedRewindMs: number;
  outcomes: ShotOutcome[];
  nonce: number;
};
export type StateFeedbackMessage = {
  type: 'state-feedback';
  by: string;
  forPlayerId: string;
  sequenceGaps: number;
  reordered: number;
  bufferedPressure: number;
  nonce: number;
};
export type MeleeMessage = {
  type: 'melee';
  by: string;
  origin: [number, number, number];
  direction: [number, number, number];
  timing?: CombatTiming;
  nonce: number;
};
export type GrenadeThrowMessage = {
  type: 'grenade-throw';
  by: string;
  origin: [number, number, number];
  velocity: [number, number, number];
  actionNonce: number;
  timing?: CombatTiming;
  nonce: number;
};
export type ExplosiveSource = 'grenade' | 'yardhawk' | 'tri-pass' | 'hunter-swarm' | 'nuke';
export type OffensiveSupportSource = Exclude<ExplosiveSource, 'grenade'>;
export type HitMessage = {
  type: 'hit';
  by: string;
  target: string;
  damage: number;
  kind: 'shot' | 'melee' | 'explosive';
  origin?: [number, number, number];
  explosiveSource?: ExplosiveSource;
  /** Correlates the hit with one admitted shot or explosion. */
  actionNonce: number;
  /** Host-verified earned-support activation; required for non-grenade explosives. */
  supportNonce?: number;
  timing?: CombatTiming;
  nonce: number;
};
export type SupportActivateMessage = {
  type: 'support-activate';
  by: string;
  source: OffensiveSupportSource;
  activationNonce: number;
  effectOrigins: [number, number, number][];
  targetIds: string[];
  timing?: CombatTiming;
  nonce: number;
};
export type DeathMessage = { type: 'death'; killer: string; victim: string; cause: KillCause; nonce: number };
export type BotStateMessage = { type: 'bot-state'; by: string; seq: number; bots: HostedBotSnapshot[]; nonce: number };
export type BotDamageMessage = {
  type: 'bot-damage'; by: string; botId: string; target: string; weapon: PrimaryWeaponId;
  origin: [number, number, number]; direction: [number, number, number];
  damageApplied: number; healthBefore: number; healthAfter: number; nonce: number;
};
export type PickupMessage = {
  type: 'pickup';
  by: string;
  dropId: string;
  weapon: PrimaryWeaponId;
  mode: 'scavenge' | 'weapon';
  position: [number, number, number];
  nonce: number;
};
export type WindowBreakMessage = {
  type: 'window-break';
  by: string;
  windowId: string;
  origin: [number, number, number];
  kind?: 'shot' | 'explosive';
  actionNonce?: number;
  nonce: number;
};
export type LeaveMessage = { type: 'leave'; playerId: string; voluntary?: boolean };
export type TeamPingKind = 'enemy' | 'regroup' | 'push' | 'nice';
export type TeamPingMessage = {
  type: 'ping';
  by: string;
  team: Team;
  kind: TeamPingKind;
  position: [number, number, number];
  nonce: number;
};
export type HighScoreMessage = { type: 'high-score'; by: string; season: typeof LEADERBOARD_SEASON; entry: HighScoreEntry };
export type LeaderboardSyncMessage = { type: 'leaderboard-sync'; by: string; season: typeof LEADERBOARD_SEASON; entries: HighScoreEntry[] };
export type OverdriveClaimMessage = {
  type: 'overdrive-claim';
  by: string;
  position: [number, number, number];
  generation: number;
  nonce: number;
};
export type OverdriveStateMessage = {
  type: 'overdrive-state';
  by: string;
  holderId: string | null;
  available: boolean;
  generation: number;
  position: [number, number, number];
  activeRemainingMs: number;
  nextSpawnInMs: number;
  nonce: number;
};
export type LobbyJoinMessage = {
  type: 'lobby-join';
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  playerId: string;
  connectionEpoch: string;
  name: string;
  requestedTeam: Team;
  resumeToken: string;
  nonce: number;
};
export type LobbyReadyMessage = { type: 'lobby-ready'; by: string; ready: boolean; nonce: number };
export type LobbyTeamMessage = { type: 'lobby-team'; by: string; team: Team; nonce: number };
export type LobbyHandicapMessage = { type: 'lobby-handicap'; by: string; dhv: Dhv; nonce: number };
export type RedeployRequestMessage = { type: 'redeploy-request'; by: string; nonce: number };
export type LobbyConfigMessage = { type: 'lobby-config'; by: string; config: PrivateMatchConfig; nonce: number };
export type LobbyBalanceMessage = { type: 'lobby-balance'; by: string; nonce: number };
export type LobbyStateMessage = { type: 'lobby-state'; by: string; snapshot: LobbySnapshot; nonce: number };
export type LobbyStartMessage = {
  type: 'lobby-start'; by: string; activeAtHostTimeMs: number; activeAtEpochMs: number;
  hostSentTimeMs: number; revision: number; nonce: number;
};
export type LobbyRejectReason = 'room-full' | 'identity-in-use' | 'rejoin-denied' | 'match-active' | 'invalid-config' | 'protocol-mismatch';
export type LobbyRejectMessage = { type: 'lobby-reject'; reason: LobbyRejectReason; nonce: number };
export type ClockPingMessage = {
  type: 'clock-ping'; by: string; guestSentMonoMs: number;
  reportedOffsetMs: number | null; reportedRttMs: number | null; reportedJitterMs: number | null;
  reportedUncertaintyMs: number | null; nonce: number;
};
export type ClockPongMessage = {
  type: 'clock-pong'; by: string; forPlayerId: string; guestSentMonoMs: number;
  hostReceivedMonoMs: number; hostSentMonoMs: number; nonce: number;
};
export type MatchScoreMessage = { type: 'match-score'; by: string; scores: PlayerScore[]; nonce: number };
export type RangeScoreClaimMessage = { type: 'range-score-claim'; by: string; score: number; hits: number; shots: number; nonce: number };

export type GameMessage = JoinMessage | StateMessage | BotStateMessage | BotDamageMessage | ShotMessage | ShotRequestMessage | ShotResultMessage | StateFeedbackMessage | MeleeMessage | GrenadeThrowMessage | HitMessage | SupportActivateMessage | DeathMessage | PickupMessage | WindowBreakMessage | LeaveMessage | TeamPingMessage | HighScoreMessage | LeaderboardSyncMessage | OverdriveClaimMessage | OverdriveStateMessage
  | LobbyJoinMessage | LobbyReadyMessage | LobbyTeamMessage | LobbyHandicapMessage | RedeployRequestMessage | LobbyConfigMessage | LobbyBalanceMessage | LobbyStateMessage | LobbyStartMessage | LobbyRejectMessage | ClockPingMessage | ClockPongMessage | MatchScoreMessage | RangeScoreClaimMessage;

const weapons = new Set<WeaponId>(WEAPON_IDS);
const primaryWeapons = new Set<PrimaryWeaponId>(PRIMARY_WEAPON_IDS);
const offensiveSupportSources = new Set<OffensiveSupportSource>(['yardhawk', 'tri-pass', 'hunter-swarm', 'nuke']);

export function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 80
    && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 20
    && (p.team === 0 || p.team === 1)
    && ['x', 'y', 'z', 'yaw'].every((key) => Number.isFinite(p[key]))
    && typeof p.pitch === 'number' && Number.isFinite(p.pitch) && p.pitch >= -1.5 && p.pitch <= 1.5
    && typeof p.hp === 'number' && Number.isFinite(p.hp) && p.hp >= 0 && p.hp <= 100
    && ['kills', 'deaths', 'seq'].every((key) => Number.isSafeInteger(p[key]) && Number(p[key]) >= 0)
    && (p.stance === undefined || p.stance === 'stand' || p.stance === 'crouch' || p.stance === 'prone')
    && primaryWeapons.has(p.primary as PrimaryWeaponId)
    && weapons.has(p.weapon as WeaponId)
    && (p.weapon === p.primary || p.weapon === (p.primary === 'sniper' ? 'machine-pistol' : 'pistol') || p.weapon === 'magnum');
}

function isOptionalCombatTiming(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object') return false;
  const timing = value as Record<string, unknown>;
  return Number.isSafeInteger(timing.eventSeq) && Number(timing.eventSeq) >= 0
    && Number.isFinite(timing.sentAtHostTimeMs) && Number(timing.sentAtHostTimeMs) >= 0;
}

function isNormalizedDirection(value: unknown): value is [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) return false;
  const magnitude = Math.hypot(Number(value[0]), Number(value[1]), Number(value[2]));
  return magnitude >= 0.96 && magnitude <= 1.04;
}

const shotRejectReasons = new Set<ShotRejectReason>([
  'none', 'protocol-mismatch', 'unknown-sender', 'duplicate', 'sequence-gap', 'weapon-mismatch', 'cadence',
  'stale', 'future', 'invalid-direction', 'invalid-pellets', 'bad-origin', 'missing-history',
  'continuity-mismatch', 'connection-epoch-mismatch', 'life-mismatch', 'shooter-dead',
  'invalid-timeline', 'obstructed', 'malformed',
]);

export function isGameMessage(value: unknown): value is GameMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  switch (msg.type) {
    case 'join':
      return isPlayerSnapshot(msg.player);
    case 'state':
      return isPlayerSnapshot(msg.player)
        && Number.isFinite(msg.hostTimeMs) && Number(msg.hostTimeMs) >= 0
        && Number.isSafeInteger(msg.continuity) && Number(msg.continuity) >= 0
        && (msg.rateHz === 20 || msg.rateHz === 30 || msg.rateHz === 40);
    case 'shot':
      return typeof msg.by === 'string' && weapons.has(msg.weapon as WeaponId)
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite)
        && Array.isArray(msg.pelletDirections) && msg.pelletDirections.length >= 1 && msg.pelletDirections.length <= 12
        && msg.pelletDirections.every((direction) => Array.isArray(direction) && direction.length === 3 && direction.every(Number.isFinite))
        && isOptionalCombatTiming(msg.timing)
        && Number.isFinite(msg.nonce);
    case 'shot-request':
      return msg.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION
        && typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && typeof msg.shotId === 'string' && msg.shotId.length >= 8 && msg.shotId.length <= 128
        && typeof msg.connectionEpoch === 'string' && msg.connectionEpoch.length >= 8 && msg.connectionEpoch.length <= 128
        && /^[a-zA-Z0-9_-]+$/.test(msg.connectionEpoch)
        && Number.isSafeInteger(msg.lifeId) && Number(msg.lifeId) >= 0
        && Number.isSafeInteger(msg.shotSeq) && Number(msg.shotSeq) >= 0
        && Number.isSafeInteger(msg.weaponSequence) && Number(msg.weaponSequence) >= 0
        && weapons.has(msg.weapon as WeaponId)
        && Number.isFinite(msg.fireTimeMs) && Number(msg.fireTimeMs) >= 0
        && Number.isFinite(msg.targetViewTimeMs) && Number(msg.targetViewTimeMs) >= 0
        && Number(msg.targetViewTimeMs) <= Number(msg.fireTimeMs)
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && isNormalizedDirection(msg.direction)
        && Array.isArray(msg.pelletDirections) && msg.pelletDirections.length >= 1 && msg.pelletDirections.length <= 12
        && msg.pelletDirections.every(isNormalizedDirection)
        && Number.isFinite(msg.nonce);
    case 'shot-result':
      return msg.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION
        && typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && typeof msg.forPlayerId === 'string' && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80
        && typeof msg.shotId === 'string' && msg.shotId.length >= 8 && msg.shotId.length <= 128
        && Number.isSafeInteger(msg.shotSeq) && Number(msg.shotSeq) >= 0
        && (msg.status === 'accepted-hit' || msg.status === 'accepted-miss' || msg.status === 'rejected')
        && shotRejectReasons.has(msg.reason as ShotRejectReason)
        && Number.isFinite(msg.fireTimeMs) && Number(msg.fireTimeMs) >= 0
        && Number.isFinite(msg.targetViewTimeMs) && Number(msg.targetViewTimeMs) >= 0
        && Number(msg.targetViewTimeMs) <= Number(msg.fireTimeMs)
        && (msg.receivedAtHostTimeMs === null || Number.isFinite(msg.receivedAtHostTimeMs) && Number(msg.receivedAtHostTimeMs) >= 0)
        && (msg.resolvedAtHostTimeMs === null || Number.isFinite(msg.resolvedAtHostTimeMs) && Number(msg.resolvedAtHostTimeMs) >= 0)
        && (msg.receivedAtHostTimeMs === null || msg.resolvedAtHostTimeMs === null
          || Number(msg.resolvedAtHostTimeMs) >= Number(msg.receivedAtHostTimeMs))
        && Number.isFinite(msg.appliedRewindMs) && Number(msg.appliedRewindMs) >= 0 && Number(msg.appliedRewindMs) <= 250
        && Array.isArray(msg.outcomes) && msg.outcomes.length <= 6
        && msg.outcomes.every((outcome) => {
          if (!outcome || typeof outcome !== 'object') return false;
          const item = outcome as Record<string, unknown>;
          return typeof item.target === 'string' && item.target.length > 0 && item.target.length <= 80
            && Number.isSafeInteger(item.pelletHits) && Number(item.pelletHits) >= 1 && Number(item.pelletHits) <= 12
            && Number.isFinite(item.damage) && Number(item.damage) >= 0 && Number(item.damage) <= 400
            && (item.rawDamage === undefined || Number.isFinite(item.rawDamage) && Number(item.rawDamage) >= Number(item.damage) && Number(item.rawDamage) <= 9_999)
            && Number.isFinite(item.resultingHealth) && Number(item.resultingHealth) >= 0 && Number(item.resultingHealth) <= 100
            && typeof item.died === 'boolean' && (item.hitZone === 'head' || item.hitZone === 'body' || item.hitZone === 'limb')
            && typeof item.wallbang === 'boolean'
            && Number.isFinite(item.penetrationMultiplier) && Number(item.penetrationMultiplier) >= 0 && Number(item.penetrationMultiplier) <= 1;
        })
        && Number.isFinite(msg.nonce);
    case 'state-feedback':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && typeof msg.forPlayerId === 'string' && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80
        && Number.isSafeInteger(msg.sequenceGaps) && Number(msg.sequenceGaps) >= 0 && Number(msg.sequenceGaps) <= 1_000
        && Number.isSafeInteger(msg.reordered) && Number(msg.reordered) >= 0 && Number(msg.reordered) <= 1_000
        && Number.isFinite(msg.bufferedPressure) && Number(msg.bufferedPressure) >= 0 && Number(msg.bufferedPressure) <= 1
        && Number.isFinite(msg.nonce);
    case 'melee':
      return typeof msg.by === 'string'
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite)
        && isOptionalCombatTiming(msg.timing)
        && Number.isFinite(msg.nonce);
    case 'grenade-throw':
      return typeof msg.by === 'string'
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Array.isArray(msg.velocity) && msg.velocity.length === 3 && msg.velocity.every(Number.isFinite)
        && Number.isFinite(msg.actionNonce)
        && isOptionalCombatTiming(msg.timing)
        && Number.isFinite(msg.nonce);
    case 'hit':
      return typeof msg.by === 'string' && typeof msg.target === 'string'
        && Number.isFinite(msg.damage) && Number(msg.damage) > 0 && Number(msg.damage) <= 100
        && (msg.kind === 'shot' || msg.kind === 'melee' || msg.kind === 'explosive')
        && (msg.kind !== 'explosive' || Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite))
        && (msg.kind === 'explosive'
          ? msg.explosiveSource === 'grenade'
            || msg.explosiveSource === 'yardhawk'
            || msg.explosiveSource === 'tri-pass'
            || msg.explosiveSource === 'hunter-swarm'
            || msg.explosiveSource === 'nuke'
          : msg.explosiveSource === undefined)
        && Number.isFinite(msg.actionNonce)
        && (msg.kind === 'explosive' && msg.explosiveSource !== 'grenade'
          ? Number.isFinite(msg.supportNonce)
          : msg.supportNonce === undefined)
        && isOptionalCombatTiming(msg.timing)
        && Number.isFinite(msg.nonce);
    case 'support-activate':
      return typeof msg.by === 'string'
        && offensiveSupportSources.has(msg.source as OffensiveSupportSource)
        && Number.isFinite(msg.activationNonce)
        && Array.isArray(msg.effectOrigins) && msg.effectOrigins.length <= 3
        && msg.effectOrigins.every((origin) => Array.isArray(origin) && origin.length === 3 && origin.every(Number.isFinite))
        && Array.isArray(msg.targetIds) && msg.targetIds.length <= 5
        && msg.targetIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 64)
        && (msg.source === 'tri-pass' ? msg.effectOrigins.length === 3 && msg.targetIds.length === 0
          : msg.source === 'yardhawk' ? msg.effectOrigins.length === 0 && msg.targetIds.length === 1
            : msg.source === 'hunter-swarm' ? msg.effectOrigins.length === 0 && msg.targetIds.length >= 1
              : msg.effectOrigins.length === 0 && msg.targetIds.length === 0)
        && isOptionalCombatTiming(msg.timing)
        && Number.isFinite(msg.nonce);
    case 'death':
      return typeof msg.killer === 'string' && typeof msg.victim === 'string'
        && Boolean(msg.cause) && typeof msg.cause === 'object'
        && ((msg.cause as { kind?: unknown }).kind === 'gun' && weapons.has((msg.cause as { weapon?: WeaponId }).weapon as WeaponId)
          || (msg.cause as { kind?: unknown }).kind === 'grenade'
          || (msg.cause as { kind?: unknown }).kind === 'melee'
          || (msg.cause as { kind?: unknown }).kind === 'environment'
          || (msg.cause as { kind?: unknown; effect?: unknown }).kind === 'killstreak'
            && offensiveSupportSources.has((msg.cause as { effect?: OffensiveSupportSource }).effect as OffensiveSupportSource))
        && Number.isFinite(msg.nonce);
    case 'bot-damage':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && typeof msg.botId === 'string' && /^host-bot-[0-3]$/.test(msg.botId)
        && typeof msg.target === 'string' && msg.target.length > 0 && msg.target.length <= 80
        && primaryWeapons.has(msg.weapon as PrimaryWeaponId)
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite)
        && Number.isFinite(msg.damageApplied) && Number(msg.damageApplied) > 0 && Number(msg.damageApplied) <= 100
        && Number.isFinite(msg.healthBefore) && Number(msg.healthBefore) >= 0 && Number(msg.healthBefore) <= 100
        && Number.isFinite(msg.healthAfter) && Number(msg.healthAfter) >= 0 && Number(msg.healthAfter) <= Number(msg.healthBefore)
        && Math.abs(Number(msg.healthBefore) - Number(msg.healthAfter) - Number(msg.damageApplied)) < 1e-6
        && Number.isFinite(msg.nonce);
    case 'bot-state':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && Number.isSafeInteger(msg.seq) && Number(msg.seq) >= 0
        && Array.isArray(msg.bots) && msg.bots.length <= 4 && msg.bots.every(isHostedBotSnapshot)
        && new Set(msg.bots.map((bot) => bot.id)).size === msg.bots.length
        && Number.isFinite(msg.nonce);
    case 'pickup':
      return typeof msg.by === 'string'
        && typeof msg.dropId === 'string' && msg.dropId.length > 0 && msg.dropId.length <= 120
        && primaryWeapons.has(msg.weapon as PrimaryWeaponId)
        && (msg.mode === 'scavenge' || msg.mode === 'weapon')
        && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite)
        && Number.isFinite(msg.nonce);
    case 'window-break':
      return typeof msg.by === 'string'
        && typeof msg.windowId === 'string' && msg.windowId.length > 0 && msg.windowId.length <= 160
        && (msg.kind === undefined || msg.kind === 'shot' || msg.kind === 'explosive')
        && (msg.kind === 'explosive' ? Number.isFinite(msg.actionNonce) : msg.actionNonce === undefined)
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Number.isFinite(msg.nonce);
    case 'leave':
      return typeof msg.playerId === 'string' && msg.playerId.length > 0 && msg.playerId.length <= 80
        && (msg.voluntary === undefined || typeof msg.voluntary === 'boolean');
    case 'ping':
      return typeof msg.by === 'string'
        && (msg.team === 0 || msg.team === 1)
        && (msg.kind === 'enemy' || msg.kind === 'regroup' || msg.kind === 'push' || msg.kind === 'nice')
        && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite)
        && Number.isFinite(msg.nonce);
    case 'high-score':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && msg.season === LEADERBOARD_SEASON
        && isHighScoreEntry(msg.entry);
    case 'leaderboard-sync':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && msg.season === LEADERBOARD_SEASON
        && Array.isArray(msg.entries) && msg.entries.length <= MAX_HIGH_SCORE_ENTRIES
        && msg.entries.every((entry) => isHighScoreEntry(entry));
    case 'overdrive-claim':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite)
        && Number.isSafeInteger(msg.generation) && Number(msg.generation) >= 0 && Number(msg.generation) <= 10_000
        && Number.isFinite(msg.nonce);
    case 'overdrive-state':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && (msg.holderId === null || typeof msg.holderId === 'string' && msg.holderId.length > 0 && msg.holderId.length <= 80)
        && typeof msg.available === 'boolean'
        && Number.isSafeInteger(msg.generation) && Number(msg.generation) >= 0 && Number(msg.generation) <= 10_000
        && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite)
        && Number.isFinite(msg.activeRemainingMs) && Number(msg.activeRemainingMs) >= 0 && Number(msg.activeRemainingMs) <= 30_000
        && Number.isFinite(msg.nextSpawnInMs) && Number(msg.nextSpawnInMs) >= 0 && Number(msg.nextSpawnInMs) <= 120_000
        && Number.isFinite(msg.nonce);
    case 'lobby-join':
      return msg.protocolVersion === MULTIPLAYER_PROTOCOL_VERSION
        && typeof msg.playerId === 'string' && msg.playerId.length > 0 && msg.playerId.length <= 80
        && typeof msg.connectionEpoch === 'string' && msg.connectionEpoch.length >= 8 && msg.connectionEpoch.length <= 128
        && /^[a-zA-Z0-9_-]+$/.test(msg.connectionEpoch)
        && typeof msg.name === 'string' && msg.name.length > 0 && msg.name.length <= 20
        && (msg.requestedTeam === 0 || msg.requestedTeam === 1)
        && typeof msg.resumeToken === 'string' && msg.resumeToken.length >= 24 && msg.resumeToken.length <= 128
        && /^[a-zA-Z0-9_-]+$/.test(msg.resumeToken)
        && Number.isFinite(msg.nonce);
    case 'lobby-ready':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && typeof msg.ready === 'boolean' && Number.isFinite(msg.nonce);
    case 'lobby-team':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && (msg.team === 0 || msg.team === 1) && Number.isFinite(msg.nonce);
    case 'lobby-handicap':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && isDhv(msg.dhv) && Number.isFinite(msg.nonce);
    case 'redeploy-request':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80 && Number.isFinite(msg.nonce);
    case 'lobby-config':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && isPrivateMatchConfig(msg.config) && Number.isFinite(msg.nonce);
    case 'lobby-balance':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80 && Number.isFinite(msg.nonce);
    case 'lobby-state':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && isLobbySnapshot(msg.snapshot) && Number.isFinite(msg.nonce);
    case 'lobby-start':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && Number.isFinite(msg.activeAtHostTimeMs) && Number(msg.activeAtHostTimeMs) >= 0
        && Number.isFinite(msg.activeAtEpochMs) && Number(msg.activeAtEpochMs) >= 0 && Number(msg.activeAtEpochMs) <= 10_000_000_000_000
        && Number.isFinite(msg.hostSentTimeMs) && Number(msg.hostSentTimeMs) >= 0
        && Number.isSafeInteger(msg.revision) && Number(msg.revision) >= 0
        && Number.isFinite(msg.nonce);
    case 'lobby-reject':
      return (msg.reason === 'room-full' || msg.reason === 'identity-in-use' || msg.reason === 'rejoin-denied'
        || msg.reason === 'match-active' || msg.reason === 'invalid-config' || msg.reason === 'protocol-mismatch')
        && Number.isFinite(msg.nonce);
    case 'clock-ping':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && Number.isFinite(msg.guestSentMonoMs) && Number(msg.guestSentMonoMs) >= 0
        && (msg.reportedOffsetMs === null || Number.isFinite(msg.reportedOffsetMs) && Math.abs(Number(msg.reportedOffsetMs)) <= 10_000_000_000)
        && (msg.reportedRttMs === null || Number.isFinite(msg.reportedRttMs) && Number(msg.reportedRttMs) >= 0 && Number(msg.reportedRttMs) <= 5_000)
        && (msg.reportedJitterMs === null || Number.isFinite(msg.reportedJitterMs) && Number(msg.reportedJitterMs) >= 0 && Number(msg.reportedJitterMs) <= 5_000)
        && (msg.reportedUncertaintyMs === null || Number.isFinite(msg.reportedUncertaintyMs) && Number(msg.reportedUncertaintyMs) >= 0 && Number(msg.reportedUncertaintyMs) <= 5_000)
        && Number.isFinite(msg.nonce);
    case 'clock-pong':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && typeof msg.forPlayerId === 'string' && msg.forPlayerId.length > 0 && msg.forPlayerId.length <= 80
        && Number.isFinite(msg.guestSentMonoMs) && Number(msg.guestSentMonoMs) >= 0
        && Number.isFinite(msg.hostReceivedMonoMs) && Number(msg.hostReceivedMonoMs) >= 0
        && Number.isFinite(msg.hostSentMonoMs) && Number(msg.hostSentMonoMs) >= Number(msg.hostReceivedMonoMs)
        && Number.isFinite(msg.nonce);
    case 'match-score':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && Array.isArray(msg.scores) && msg.scores.length <= MAX_MATCH_SCORE_ENTRIES && msg.scores.every(isPlayerScore)
        && new Set(msg.scores.map((score) => score.id)).size === msg.scores.length
        && Number.isFinite(msg.nonce);
    case 'range-score-claim':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && Number.isSafeInteger(msg.score) && Number(msg.score) >= 0 && Number(msg.score) <= 10_000_000
        && Number.isSafeInteger(msg.hits) && Number(msg.hits) >= 0 && Number(msg.hits) <= 100_000
        && Number.isSafeInteger(msg.shots) && Number(msg.shots) >= 0 && Number(msg.shots) <= 100_000
        && Number.isFinite(msg.nonce);
    default:
      return false;
  }
}

export function messageBelongsToPlayer(message: GameMessage, playerId: string): boolean {
  if (!playerId) return false;
  switch (message.type) {
    case 'join':
    case 'state':
      return message.player.id === playerId;
    case 'bot-state':
    case 'bot-damage':
      return message.by === playerId;
    case 'lobby-join':
      return message.playerId === playerId;
    case 'shot':
    case 'shot-request':
    case 'shot-result':
    case 'state-feedback':
    case 'melee':
    case 'grenade-throw':
    case 'hit':
    case 'support-activate':
    case 'ping':
    case 'pickup':
    case 'window-break':
    case 'high-score':
    case 'leaderboard-sync':
    case 'overdrive-claim':
    case 'overdrive-state':
    case 'lobby-ready':
    case 'lobby-team':
    case 'lobby-handicap':
    case 'redeploy-request':
    case 'lobby-config':
    case 'lobby-balance':
    case 'lobby-state':
    case 'lobby-start':
    case 'clock-ping':
    case 'clock-pong':
    case 'match-score':
    case 'range-score-claim':
      return message.by === playerId;
    case 'death':
      return message.victim === playerId;
    case 'leave':
      return message.playerId === playerId;
    case 'lobby-reject':
      return false;
  }
}

export function isHostAuthorityMessage(message: GameMessage): boolean {
  return message.type === 'lobby-config'
    || message.type === 'lobby-state'
    || message.type === 'lobby-start'
    || message.type === 'lobby-reject'
    || message.type === 'clock-pong'
    || message.type === 'shot-result'
    || message.type === 'match-score'
    || message.type === 'bot-state'
    || message.type === 'bot-damage';
}

export function isStateTrafficMessage(message: GameMessage): message is StateMessage | BotStateMessage {
  return message.type === 'state' || message.type === 'bot-state';
}

export function sanitizeName(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return clean || `Player${Math.floor(presentationRandom() * 900 + 100)}`;
}
