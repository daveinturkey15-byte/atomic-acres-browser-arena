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
  nonce: number;
};
export type MeleeMessage = {
  type: 'melee';
  by: string;
  origin: [number, number, number];
  direction: [number, number, number];
  nonce: number;
};
export type HitMessage = {
  type: 'hit';
  by: string;
  target: string;
  damage: number;
  kind: 'shot' | 'explosive';
  origin?: [number, number, number];
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
export type GameMessage = JoinMessage | StateMessage | ShotMessage | MeleeMessage | HitMessage | DeathMessage | PickupMessage | WindowBreakMessage | LeaveMessage | TeamPingMessage;

const weapons = new Set<WeaponId>(['carbine', 'smg', 'scattergun', 'sniper', 'pistol', 'machine-pistol']);
const primaryWeapons = new Set<PrimaryWeaponId>(['carbine', 'smg', 'scattergun', 'sniper']);

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
        && Number.isFinite(msg.nonce);
    case 'melee':
      return typeof msg.by === 'string'
        && Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite)
        && Array.isArray(msg.direction) && msg.direction.length === 3 && msg.direction.every(Number.isFinite)
        && Number.isFinite(msg.nonce);
    case 'hit':
      return typeof msg.by === 'string' && typeof msg.target === 'string'
        && Number.isFinite(msg.damage) && Number(msg.damage) > 0 && Number(msg.damage) <= 100
        && (msg.kind === 'shot' || msg.kind === 'explosive')
        && (msg.kind !== 'explosive' || Array.isArray(msg.origin) && msg.origin.length === 3 && msg.origin.every(Number.isFinite))
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
    case 'hit':
    case 'ping':
    case 'pickup':
    case 'window-break':
      return message.by === playerId;
    case 'death':
      return message.victim === playerId;
    case 'leave':
      return message.playerId === playerId;
  }
}

export function sanitizeName(value: string): string {
  const clean = value.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return clean || `Player${Math.floor(Math.random() * 900 + 100)}`;
}
