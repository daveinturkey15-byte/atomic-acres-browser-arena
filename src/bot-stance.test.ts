import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BOT_PRONE_HEALTH,
  BOT_STANCE_MIN_HOLD_MS,
  BOT_UNDER_FIRE_MS,
  botStanceEyeHeightM,
  botStanceSpeedCap,
  preferredBotStance,
  resolveBotStance,
} from './bot-stance';
import { movementProfile, type Stance } from './gameplay';
import {
  LEGACY_HOSTED_BOT_STANCE,
  hostedBotSnapshotStance,
  interpolateHostedBotSnapshot,
  isHostedBotSnapshot,
} from './hosted-bots';

/**
 * PASS 87 Lane AR, item 3 (Lane Y follow-up): bots have no stance.
 *
 * Before this change, `poseOperator(bot.root, 'stand', ...)` was hardcoded in
 * four places and `recordCombatantPose` wrote `stance: 'stand'` in two more,
 * each with a comment saying BotPlayer carried no stance to pose from. A remote
 * human peer's crouch and prone replicate and play their transitions; a bot's
 * could not exist.
 */
const BASE = {
  hp: 100,
  alive: true,
  lastDamagedAt: Number.NEGATIVE_INFINITY,
  now: 100_000,
  hasLineOfSight: false,
  travelling: false,
  stance: 'stand' as Stance,
  stanceHeldUntil: 0,
};

describe('bot stance rules (Lane AR item 3)', () => {
  it('stands when nothing is happening', () => {
    expect(preferredBotStance(BASE)).toBe('stand');
    expect(preferredBotStance({ ...BASE, travelling: true, hasLineOfSight: true })).toBe('stand');
  });

  it('crouches behind cover when taking fire', () => {
    // Under fire and cannot see its target: it is behind something.
    const underFire = { ...BASE, lastDamagedAt: BASE.now - 200, hasLineOfSight: false };
    expect(preferredBotStance(underFire)).toBe('crouch');
    // Still crouched right up to the window's edge, standing again after it.
    expect(preferredBotStance({ ...underFire, lastDamagedAt: BASE.now - BOT_UNDER_FIRE_MS })).toBe('crouch');
    expect(preferredBotStance({ ...underFire, lastDamagedAt: BASE.now - BOT_UNDER_FIRE_MS - 1 })).toBe('stand');
  });

  it('crouches to hold an angle under fire, but keeps moving standing', () => {
    const underFireInTheOpen = { ...BASE, lastDamagedAt: BASE.now - 200, hasLineOfSight: true };
    expect(preferredBotStance({ ...underFireInTheOpen, travelling: false })).toBe('crouch');
    // A bot that crouch-walks across an objective is slower than the fire it is
    // trying to escape, so travelling under fire stays standing.
    expect(preferredBotStance({ ...underFireInTheOpen, travelling: true })).toBe('stand');
  });

  it('goes prone on low health, and stays down after the shooting stops', () => {
    expect(preferredBotStance({ ...BASE, hp: BOT_PRONE_HEALTH })).toBe('prone');
    expect(preferredBotStance({ ...BASE, hp: BOT_PRONE_HEALTH + 1 })).toBe('stand');
    // Deliberate: low health outranks the under-fire window, so a bot that
    // crawled away on 12 HP does not stand up the moment it stops being shot.
    expect(preferredBotStance({ ...BASE, hp: 12, lastDamagedAt: Number.NEGATIVE_INFINITY })).toBe('prone');
    expect(preferredBotStance({ ...BASE, hp: 12, travelling: true, hasLineOfSight: true })).toBe('prone');
  });

  it('a dead bot has no stance', () => {
    expect(preferredBotStance({ ...BASE, alive: false, hp: 0 })).toBe('stand');
    expect(resolveBotStance({ ...BASE, alive: false, hp: 0, stance: 'prone', stanceHeldUntil: 1e9 }))
      .toEqual({ stance: 'stand', stanceHeldUntil: 0 });
  });

  it('holds a stance long enough not to flicker', () => {
    // The failure this exists to prevent: rules re-evaluated every frame on a
    // boundary make a bot play the stand/crouch transition dozens of times a
    // second, which is worse than having no stances.
    let state = { ...BASE };
    let flips = 0;
    for (let frame = 0; frame < 240; frame += 1) {
      const now = BASE.now + frame * (1000 / 60);
      // Alternate the input every single frame: the worst case.
      const decision = resolveBotStance({
        ...state, now, lastDamagedAt: frame % 2 === 0 ? now : Number.NEGATIVE_INFINITY,
      });
      if (decision.stance !== state.stance) flips += 1;
      state = { ...state, now, stance: decision.stance, stanceHeldUntil: decision.stanceHeldUntil };
    }
    const seconds = 240 / 60;
    expect(flips, 'stance changes over 4 s of worst-case input').toBeLessThanOrEqual(
      Math.ceil((seconds * 1000) / BOT_STANCE_MIN_HOLD_MS) + 1,
    );
    expect(flips, 'and it must still respond at all').toBeGreaterThan(0);
  });

  it('takes its speed cap and eye height from the same profile players use', () => {
    for (const stance of ['stand', 'crouch', 'prone'] as const) {
      const profile = movementProfile({
        crouched: stance === 'crouch', prone: stance === 'prone', ads: false, sprinting: false, grounded: true,
      });
      expect(botStanceSpeedCap(stance, false)).toBe(profile.maxSpeed);
      expect(botStanceEyeHeightM(stance)).toBe(profile.eyeHeight);
    }
    // The numbers that matter to the defect: a prone bot cannot travel at a
    // standing bot's route speed.
    expect(botStanceSpeedCap('prone', false)).toBeLessThan(botStanceSpeedCap('crouch', false));
    expect(botStanceSpeedCap('crouch', false)).toBeLessThan(botStanceSpeedCap('stand', false));
    // The shipped route speeds, capped: patrol 5.85, engaged 4.65, strafe 4.05.
    expect(Math.min(5.85, botStanceSpeedCap('prone', false))).toBeCloseTo(1.55, 5);
    expect(Math.min(5.85, botStanceSpeedCap('crouch', false))).toBeCloseTo(3.15, 5);
    expect(Math.min(5.85, botStanceSpeedCap('stand', false))).toBeCloseTo(5.85, 5);
  });
});

describe('hosted bot stance replication (Lane AR item 3)', () => {
  const SNAPSHOT = {
    id: 'host-bot-0', name: 'RIVET', team: 1, weapon: 'lmg', x: 1, y: 0, z: 2,
    yaw: 0.4, stance: 'crouch', hp: 70, kills: 2, deaths: 1, alive: true, seq: 9,
  } as const;

  it('is part of the validated wire shape, like a peer stance', () => {
    expect(isHostedBotSnapshot(SNAPSHOT)).toBe(true);
    expect(isHostedBotSnapshot({ ...SNAPSHOT, stance: 'prone' })).toBe(true);
    expect(isHostedBotSnapshot({ ...SNAPSHOT, stance: 'crawl' })).toBe(false);
  });

  /**
   * SKEPTIC FOLLOW-UP. Adding a REQUIRED field to a wire message without a
   * protocol bump is a silent cross-version break: PASS 86 and PASS 87 are both
   * selectable from the same chooser origin at MULTIPLAYER_PROTOCOL_VERSION 18,
   * so a PASS 87 guest would have rejected every bot-state message a PASS 86
   * host sent and seen no bots at all. The field is therefore optional to
   * READERS and defaulted, not required.
   */
  it('accepts a stance-less snapshot from a pre-PASS-87 host and reads it as stand', () => {
    const { stance: _dropped, ...legacySnapshot } = SNAPSHOT;
    expect(isHostedBotSnapshot(legacySnapshot)).toBe(true);
    expect(hostedBotSnapshotStance(legacySnapshot)).toBe(LEGACY_HOSTED_BOT_STANCE);
    expect(LEGACY_HOSTED_BOT_STANCE).toBe('stand');
    expect(hostedBotSnapshotStance(SNAPSHOT)).toBe('crouch');
    // A present stance is still validated exactly as before.
    expect(isHostedBotSnapshot({ ...legacySnapshot, stance: null })).toBe(false);
    expect(isHostedBotSnapshot({ ...legacySnapshot, stance: 'crawl' })).toBe(false);
  });

  it('normalises a legacy snapshot as it leaves the interpolator', () => {
    const { stance: _dropped, ...legacySnapshot } = SNAPSHOT;
    const rendered = interpolateHostedBotSnapshot(legacySnapshot, { ...legacySnapshot, x: 5, seq: 10 }, 0.5);
    expect(rendered.stance).toBe('stand');
    expect(rendered.x).toBe(3);
  });

  it('is taken whole from the newer snapshot, never blended', () => {
    const after = { ...SNAPSHOT, stance: 'prone' as const, x: 5, seq: 10 };
    const rendered = interpolateHostedBotSnapshot(SNAPSHOT, after, 0.5);
    expect(rendered.stance).toBe('prone');
    expect(rendered.x).toBe(3);
  });
});

describe('the shipped bot paths read the stance field (Lane AR item 3)', () => {
  const LEGACY = readFileSync(resolve(__dirname, 'legacy-main.ts'), 'utf8');

  it('no bot pose or pose-history call hardcodes stand any more', () => {
    // The six sites HF-412 documented. A source pin, because each of them is a
    // separate call in a 36,000-line module and a regression in any one of them
    // is invisible: the body just stands up again.
    expect(LEGACY).toContain("poseOperator(bot.root, debugBotStanceOverride ?? bot.stance,");
    expect(LEGACY).toContain('const replicatedStance = hostedBotSnapshotStance(snapshot);');
    expect(LEGACY).toContain('poseOperator(bot.root, replicatedStance,');
    expect(LEGACY).toContain('yaw: bot.root.rotation.y, stance: bot.stance, continuity: bot.continuity,');
    expect(LEGACY).toContain('bot.position.y + botStanceEyeHeightM(bot.stance)');
    expect(LEGACY).not.toContain("stance: 'stand', continuity: bot.continuity");
    expect(LEGACY).not.toContain("poseOperator(bot.root, 'stand'");
  });

  it('the host replicates the stance it simulated', () => {
    expect(LEGACY).toContain('stance: bot.stance,');
  });

  it('under-fire is recorded in the one funnel every bot damage path uses', () => {
    expect(LEGACY).toMatch(/function applyBotDamage\([\s\S]{0,900}?bot\.lastDamagedAt = now;/u);
  });

  it('respawn clears the stance so a new life never inherits a crawl', () => {
    expect(LEGACY).toMatch(/function respawnBot\([\s\S]{0,1400}?bot\.stance = 'stand';/u);
  });
});
