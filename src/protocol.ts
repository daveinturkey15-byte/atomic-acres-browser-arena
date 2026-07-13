export type Team = 0 | 1;
export type WeaponId = 'carbine' | 'smg' | 'scattergun';

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
export type HitMessage = {
  type: 'hit';
  by: string;
  target: string;
  damage: number;
  nonce: number;
};
export type DeathMessage = { type: 'death'; killer: string; victim: string; nonce: number };
export type LeaveMessage = { type: 'leave'; playerId: string };
export type ChatMessage = { type: 'chat'; by: string; text: string };
export type GameMessage = JoinMessage | StateMessage | ShotMessage | HitMessage | DeathMessage | LeaveMessage | ChatMessage;

const weapons = new Set<WeaponId>(['carbine', 'smg', 'scattergun']);

export function isPlayerSnapshot(value: unknown): value is PlayerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return typeof p.id === 'string' && p.id.length > 0 && p.id.length <= 80
    && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 20
    && (p.team === 0 || p.team === 1)
    && ['x', 'y', 'z', 'yaw', 'pitch', 'hp', 'kills', 'deaths', 'seq'].every((key) => Number.isFinite(p[key]))
    && (p.stance === undefined || p.stance === 'stand' || p.stance === 'crouch' || p.stance === 'prone')
    && weapons.has(p.weapon as WeaponId);
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
    case 'hit':
      return typeof msg.by === 'string' && typeof msg.target === 'string'
        && Number.isFinite(msg.damage) && Number(msg.damage) > 0 && Number(msg.damage) <= 100
        && Number.isFinite(msg.nonce);
    case 'death':
      return typeof msg.killer === 'string' && typeof msg.victim === 'string' && Number.isFinite(msg.nonce);
    case 'leave':
      return typeof msg.playerId === 'string';
    case 'chat':
      return typeof msg.by === 'string' && typeof msg.text === 'string' && msg.text.length <= 160;
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
    case 'hit':
    case 'chat':
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
