import { WEAPON_CATALOG } from './combat/weapon-catalog';
import type { Stance } from './gameplay';
import type { Team, WeaponId } from './protocol';

export const HOSTED_BOT_COUNTS = [0, 2, 4] as const;
export type HostedBotCount = typeof HOSTED_BOT_COUNTS[number];

export type HostedBotSnapshot = Readonly<{
  id: string;
  name: string;
  team: Team;
  weapon: WeaponId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /**
   * PASS 87 Lane AR item 3. Hosted bots had no stance, so a guest posed every
   * bot standing while the host simulated crouch and prone. Replicated like a
   * peer's `PlayerSnapshot.stance`, and read by the guest's pose call.
   */
  stance: Stance;
  hp: number;
  kills: number;
  deaths: number;
  alive: boolean;
  seq: number;
}>;

function interpolateYaw(before: number, after: number, alpha: number): number {
  const delta = ((after - before + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return before + delta * alpha;
}

/**
 * Guest presentation interpolation keeps continuous pose fields smooth while
 * all authoritative combat/loadout fields come from the newer host snapshot.
 */
export function interpolateHostedBotSnapshot(
  before: HostedBotSnapshot,
  after: HostedBotSnapshot,
  alpha: number,
): HostedBotSnapshot {
  const boundedAlpha = Math.max(0, Math.min(1, Number.isFinite(alpha) ? alpha : 0));
  return Object.freeze({
    // `stance` is intentionally NOT interpolated: it is discrete, and the
    // operator rig already blends the pose. Taking it from `after` with the
    // rest of the authoritative fields keeps the body one frame ahead of the
    // interpolated position rather than half-way between two stances.
    ...after,
    x: before.x + (after.x - before.x) * boundedAlpha,
    y: before.y + (after.y - before.y) * boundedAlpha,
    z: before.z + (after.z - before.z) * boundedAlpha,
    yaw: interpolateYaw(before.yaw, after.yaw, boundedAlpha),
  });
}

/** Death and respawn are discontinuities: never interpolate a bot across them. */
export function hostedBotSnapshotContinuity(snapshot: HostedBotSnapshot): number {
  return snapshot.deaths * 2 + Number(snapshot.alive) + 1;
}

export function isHostedBotCount(value: unknown): value is HostedBotCount {
  return value === 0 || value === 2 || value === 4;
}

export function hostedBotIds(count: HostedBotCount): string[] {
  return Array.from({ length: count }, (_, index) => `host-bot-${index}`);
}

/** Hosted bots remain host-authoritative while the host player is waiting to
 * respawn. Their replica heartbeat must therefore not inherit player.alive. */
export function hostedBotReplicationActive(
  role: 'offline' | 'host' | 'client',
  gameStarted: boolean,
  matchPhase: 'warmup' | 'active' | 'ended',
  hostedBotCount: HostedBotCount,
): boolean {
  return role === 'host' && gameStarted && matchPhase === 'active' && hostedBotCount > 0;
}

export function isHostedBotSnapshot(value: unknown): value is HostedBotSnapshot {
  if (!value || typeof value !== 'object') return false;
  const bot = value as Record<string, unknown>;
  return typeof bot.id === 'string' && /^host-bot-[0-3]$/.test(bot.id)
    && typeof bot.name === 'string' && bot.name.length >= 1 && bot.name.length <= 20
    && (bot.team === 0 || bot.team === 1)
    && WEAPON_CATALOG.some((definition) => definition.id === bot.weapon && definition.policies.bot === 'eligible')
    && (bot.stance === 'stand' || bot.stance === 'crouch' || bot.stance === 'prone')
    && ['x', 'y', 'z', 'yaw', 'hp'].every((key) => Number.isFinite(bot[key]))
    && Number(bot.hp) >= 0 && Number(bot.hp) <= 100
    && ['kills', 'deaths', 'seq'].every((key) => Number.isSafeInteger(bot[key]) && Number(bot[key]) >= 0)
    && typeof bot.alive === 'boolean'
    && bot.alive === (Number(bot.hp) > 0);
}
