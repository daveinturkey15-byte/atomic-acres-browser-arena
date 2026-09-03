import type { Stance } from './gameplay';
import { movementProfile } from './gameplay';

/**
 * PASS 87 Lane AR, item 3 (Lane Y follow-up): bots have no stance.
 *
 * Every bot in this game stands up, always. `poseOperator(bot.root, 'stand',
 * ...)` was hardcoded in four places and `recordCombatantPose(...)` wrote
 * `stance: 'stand'` in two more, each with an honest comment saying the same
 * thing: BotPlayer carried no stance, so there was nothing to pose from. A
 * remote human peer's crouch and prone replicate and play their body
 * transitions; a bot's could not, because it never had one.
 *
 * The consequence is not cosmetic. Stance is a combat property in this game -
 * it changes the eye height, the capsule the shot resolver rewinds to, and how
 * fast a body moves - so a roster of permanently standing bots is a roster of
 * targets that read wrong at a distance and never take cover the way a player
 * would.
 *
 * This module is the decision, kept pure and out of legacy-main so it can be
 * tested directly: given what a bot knows about itself this frame, what stance
 * should its body be in? The caller applies it - pose, replication, movement
 * profile and pose history all read the same field.
 *
 * WHAT IT DELIBERATELY IS NOT: a tactical planner. It has no path, no cover
 * map and no memory beyond one timestamp. Two rules the owner asked for,
 * expressed so that they cannot flicker.
 */

/** Health at or below which a bot goes prone. */
export const BOT_PRONE_HEALTH = 25;

/**
 * How long after being hit a bot still counts as "under fire". 1.4 s is a
 * little longer than a burst plus a reaction, so a bot taking sustained fire
 * stays down rather than bobbing up between magazines.
 */
export const BOT_UNDER_FIRE_MS = 1_400;

/**
 * Minimum time a chosen stance is held. Without it the rules above re-evaluate
 * every frame and a bot on the boundary plays the stand/crouch transition
 * dozens of times a second - which is worse than not having stances at all.
 * 700 ms is longer than the pose blend the operator rig uses.
 */
export const BOT_STANCE_MIN_HOLD_MS = 700;

export type BotStanceContext = Readonly<{
  /** Current health, 0..100. */
  hp: number;
  /** Bot is alive; a dead bot has no stance to choose. */
  alive: boolean;
  /** performance.now() of the last damage this bot took, or -Infinity. */
  lastDamagedAt: number;
  now: number;
  /** The bot can see the thing it is fighting. False when it is behind cover. */
  hasLineOfSight: boolean;
  /** The bot wants to travel this frame (patrol leg, route, repositioning). */
  travelling: boolean;
  stance: Stance;
  /** performance.now() until which `stance` is held; see BOT_STANCE_MIN_HOLD_MS. */
  stanceHeldUntil: number;
}>;

export type BotStanceDecision = Readonly<{ stance: Stance; stanceHeldUntil: number }>;

/** The stance the rules want, before hysteresis. */
export function preferredBotStance(context: BotStanceContext): Stance {
  if (!context.alive) return 'stand';
  const underFire = context.now - context.lastDamagedAt <= BOT_UNDER_FIRE_MS;
  // Low health: get small. This one ignores `underFire` on purpose - a bot that
  // crawled away and is still on 12 HP should not stand back up the moment the
  // shooting stops.
  if (context.hp <= BOT_PRONE_HEALTH) return 'prone';
  if (!underFire) return 'stand';
  // Under fire and cannot see its target: it is behind something. Crouch.
  if (!context.hasLineOfSight) return 'crouch';
  // Under fire, in the open, and holding position: crouch to shoot. Under fire
  // while moving stays standing, because a bot that crouch-walks across an
  // objective is slower than the fire it is trying to escape.
  return context.travelling ? 'stand' : 'crouch';
}

/**
 * Resolves the stance to apply this frame. A stance is held for
 * BOT_STANCE_MIN_HOLD_MS unless the bot dies (which always resets to stand, so
 * a corpse and its respawn do not inherit a crawl).
 */
export function resolveBotStance(context: BotStanceContext): BotStanceDecision {
  if (!context.alive) return { stance: 'stand', stanceHeldUntil: 0 };
  const preferred = preferredBotStance(context);
  if (preferred === context.stance) return { stance: context.stance, stanceHeldUntil: context.stanceHeldUntil };
  if (context.now < context.stanceHeldUntil) {
    return { stance: context.stance, stanceHeldUntil: context.stanceHeldUntil };
  }
  return { stance: preferred, stanceHeldUntil: context.now + BOT_STANCE_MIN_HOLD_MS };
}

/**
 * The speed cap a stance imposes, taken from the SAME movementProfile players
 * use rather than a second table. A prone bot that slid around at running
 * speed would be the collider/visual mismatch this repo's forging review
 * exists to catch, one layer up.
 */
export function botStanceSpeedCap(stance: Stance, sprinting: boolean): number {
  return movementProfile({
    crouched: stance === 'crouch',
    prone: stance === 'prone',
    ads: false,
    sprinting: sprinting && stance === 'stand',
    grounded: true,
  }).maxSpeed;
}

/** Eye height for a stance, from the same shared profile. */
export function botStanceEyeHeightM(stance: Stance): number {
  return movementProfile({
    crouched: stance === 'crouch',
    prone: stance === 'prone',
    ads: false,
    sprinting: false,
    grounded: true,
  }).eyeHeight;
}
