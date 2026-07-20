import { presentationRandom } from './runtime-random';
import { MAX_HIGH_SCORE_ENTRIES, isHighScoreEntry, type HighScoreEntry } from './high-scores';

export type Team = 0 | 1;
export type PrimaryWeaponId = 'carbine' | 'smg' | 'scattergun' | 'sniper';
export type SidearmWeaponId = 'pistol' | 'machine-pistol';
export type WeaponId = PrimaryWeaponId | SidearmWeaponId;

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
export type StateMessage = { type: 'state'; player: PlayerSnapshot };
export type ShotMessage = {
  type: 'shot';
  by: string;
  weapon: WeaponId;
  origin: [number, number, number];
  direction: [number, number, number];
  /** Every authoritative pellet ray; one entry for single-projectile weapons. */
  pelletDirections: [number, number, number][];
  nonce: number;
};
export type MeleeMessage = {
  type: 'melee';
  by: string;
  origin: [number, number, number];
  direction: [number, number, number];
  nonce: number;
};
export type GrenadeThrowMessage = {
  type: 'grenade-throw';
  by: string;
  origin: [number, number, number];
  velocity: [number, number, number];
  actionNonce: number;
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
  nonce: number;
};
export type SupportActivateMessage = {
  type: 'support-activate';
  by: string;
  source: OffensiveSupportSource;
  activationNonce: number;
  effectOrigins: [number, number, number][];
  targetIds: string[];
  nonce: number;
};
export type DeathMessage = { type: 'death'; killer: string; victim: string; nonce: number };
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
export type LeaveMessage = { type: 'leave'; playerId: string };
export type TeamPingKind = 'enemy' | 'regroup' | 'push' | 'nice';
export type TeamPingMessage = {
  type: 'ping';
  by: string;
  team: Team;
  kind: TeamPingKind;
  position: [number, number, number];
  nonce: number;
};
export type HighScoreMessage = { type: 'high-score'; by: string; entry: HighScoreEntry };
export type LeaderboardSyncMessage = { type: 'leaderboard-sync'; by: string; entries: HighScoreEntry[] };
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
  activeRemainingMs: number;
  nextSpawnInMs: number;
  nonce: number;
};
export type GameMessage = JoinMessage | StateMessage | ShotMessage | MeleeMessage | GrenadeThrowMessage | HitMessage | SupportActivateMessage | DeathMessage | PickupMessage | WindowBreakMessage | LeaveMessage | TeamPingMessage | HighScoreMessage | LeaderboardSyncMessage | OverdriveClaimMessage | OverdriveStateMessage;

const weapons = new Set<WeaponId>(['carbine', 'smg', 'scattergun', 'sniper', 'pistol', 'machine-pistol']);
const primaryWeapons = new Set<PrimaryWeaponId>(['carbine', 'smg', 'scattergun', 'sniper']);
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
    && (p.weapon === p.primary || p.weapon === (p.primary === 'sniper' ? 'machine-pistol' : 'pistol'));
}

export function isGameMessage(value: unknown): value is GameMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  switch (msg.type) {
    case 'join':
    case 'state':
      return isPlayerSnapshot(msg.player);
    case 'shot':
      return typeof msg.by === 'string' && weapons.has(msg.weapon as WeaponId)
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite)
        && Array.isArray(msg.pelletDirections) && msg.pelletDirections.length >= 1 && msg.pelletDirections.length <= 12
        && msg.pelletDirections.every((direction) => Array.isArray(direction) && direction.length === 3 && direction.every(Number.isFinite))
        && Number.isFinite(msg.nonce);
    case 'melee':
      return typeof msg.by === 'string'
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite)
        && Number.isFinite(msg.nonce);
    case 'grenade-throw':
      return typeof msg.by === 'string'
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Array.isArray(msg.velocity) && msg.velocity.length === 3 && msg.velocity.every(Number.isFinite)
        && Number.isFinite(msg.actionNonce)
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
        && Number.isFinite(msg.nonce);
    case 'death':
      return typeof msg.killer === 'string' && typeof msg.victim === 'string' && Number.isFinite(msg.nonce);
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
      return typeof msg.playerId === 'string';
    case 'ping':
      return typeof msg.by === 'string'
        && (msg.team === 0 || msg.team === 1)
        && (msg.kind === 'enemy' || msg.kind === 'regroup' || msg.kind === 'push' || msg.kind === 'nice')
        && Array.isArray(msg.position) && msg.position.length === 3 && msg.position.every(Number.isFinite)
        && Number.isFinite(msg.nonce);
    case 'high-score':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
        && isHighScoreEntry(msg.entry);
    case 'leaderboard-sync':
      return typeof msg.by === 'string' && msg.by.length > 0 && msg.by.length <= 80
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
        && Number.isFinite(msg.activeRemainingMs) && Number(msg.activeRemainingMs) >= 0 && Number(msg.activeRemainingMs) <= 15_000
        && Number.isFinite(msg.nextSpawnInMs) && Number(msg.nextSpawnInMs) >= 0 && Number(msg.nextSpawnInMs) <= 120_000
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
    case 'shot':
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
      return message.by === playerId;
    case 'death':
      return message.victim === playerId;
    case 'leave':
      return message.playerId === playerId;
  }
}

export function sanitizeName(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return clean || `Player${Math.floor(presentationRandom() * 900 + 100)}`;
}
