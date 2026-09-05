import { describe, expect, it } from 'vitest';
import {
  ALLOW_ALL_BOT_PRONE,
  BOT_COVER_MAX_TRAVEL_M,
  BOT_COVER_MIN_THREAT_DISTANCE_M,
  BOT_DETOUR_COMMIT_MS,
  BOT_DIFFICULTY_PROFILES,
  BOT_DIFFICULTY_TIERS,
  BOT_MINIMUM_REACTION_DELAY_MS,
  BOT_STUCK_FAILURE_MS,
  BOT_STUCK_SPEED_MPS,
  BOT_UNSTICK_DETOUR_MS,
  BOT_UNSTICK_REPATH_MS,
  BOT_UNSTICK_REVERSE_MS,
  advanceBotNavigation,
  applyBotProneCap,
  botBurstAimJitter,
  botBurstRecoveryUntil,
  botDifficultyProfile,
  botDifficultyTierForIndex,
  botFireDecision,
  botProneCapHook,
  chooseBotCoverNode,
  createBotNavigationState,
  deriveBotCoverNodes,
  segmentCrossesCoverBox,
  setBotProneCapHook,
  shouldBotSeekCover,
  type BotCoverNode,
  type BotDifficultyTier,
  type BotFireGate,
  type BotNavigationState,
} from './bot-behaviour';
import { BOT_REACTION_DELAY } from './bot-ai';
import { botStanceSpeedCap } from './bot-stance';

/**
 * PASS 95 lane `v8-bot-behaviour`.
 *
 * The brief asks for four provable things: no stuck bots, no wall-hugging
 * jitter, bots that never see through walls, and bots that never fire before
 * their reaction delay. Each of those is a test in this file, phrased as a
 * property over many inputs rather than one happy-path example, because a
 * single example proves a code path and a property proves a rule.
 */

function fireGate(overrides: Partial<BotFireGate> = {}): BotFireGate {
  return {
    alive: true,
    hasLineOfSight: true,
    lineOfSightSince: 1_000,
    now: 5_000,
    reactionDelayMs: 650,
    fireSuppressed: false,
    distanceM: 12,
    minRangeM: 2.5,
    maxRangeM: 22,
    lastShotAt: 0,
    fireIntervalMs: 120,
    burstShotsRemaining: 3,
    burstRecoveryUntil: 0,
    invulnerableUntil: 0,
    ...overrides,
  };
}

describe('bot difficulty tiers', () => {
  it('documents four tiers whose reaction delay strictly decreases with difficulty', () => {
    const delays = BOT_DIFFICULTY_TIERS.map((tier) => botDifficultyProfile(tier).reactionDelayMs);
    expect(BOT_DIFFICULTY_TIERS).toEqual(['recruit', 'regular', 'hardened', 'veteran']);
    for (let index = 1; index < delays.length; index += 1) {
      expect(delays[index]!, `${BOT_DIFFICULTY_TIERS[index]} must react faster than ${BOT_DIFFICULTY_TIERS[index - 1]}`)
        .toBeLessThan(delays[index - 1]!);
    }
  });

  it('keeps the regular tier identical to the shipped Pass 66..94 behaviour', () => {
    // If this ever drifts, a roster of regular bots stops being the old feel
    // and every prior bot evidence run silently stops being a baseline.
    expect(BOT_DIFFICULTY_PROFILES.regular.reactionDelayMs).toBe(BOT_REACTION_DELAY);
    expect(BOT_DIFFICULTY_PROFILES.regular.aimErrorScale).toBe(1);
  });

  it('never lets a tier react faster than the fairness floor', () => {
    for (const tier of BOT_DIFFICULTY_TIERS) {
      expect(botDifficultyProfile(tier).reactionDelayMs).toBeGreaterThanOrEqual(BOT_MINIMUM_REACTION_DELAY_MS);
    }
  });

  it('scales aim error monotonically the other way, so harder also means more accurate', () => {
    const scales = BOT_DIFFICULTY_TIERS.map((tier) => botDifficultyProfile(tier).aimErrorScale);
    for (let index = 1; index < scales.length; index += 1) {
      expect(scales[index]!).toBeLessThan(scales[index - 1]!);
    }
  });

  it('gives a roster a deterministic spread that opens on the shipped tier', () => {
    const roster = Array.from({ length: 8 }, (_, index) => botDifficultyTierForIndex(index));
    expect(roster[0]).toBe('regular');
    expect(new Set(roster).size).toBe(4);
    expect(roster).toEqual(Array.from({ length: 8 }, (_, index) => botDifficultyTierForIndex(index)));
  });

  it('gives no tier a perception advantage: the fire gate ignores tier when sight is absent', () => {
    for (const tier of BOT_DIFFICULTY_TIERS) {
      const decision = botFireDecision(fireGate({
        hasLineOfSight: false,
        reactionDelayMs: botDifficultyProfile(tier).reactionDelayMs,
      }));
      expect(decision.fire, `${tier} fired without line of sight`).toBe(false);
      expect(decision.reason).toBe('no-line-of-sight');
    }
  });
});

describe('fairness: bots never see through walls', () => {
  /**
   * The wallhack test. `hasLineOfSight` is the ONLY channel through which sight
   * enters the gate, so this sweep covers every other input being maximally
   * favourable — point blank, a veteran's reaction long elapsed, a full burst
   * in hand — and asserts the answer is still no.
   */
  it('refuses to fire for every otherwise-perfect input when sight is false', () => {
    const distances = [0.5, 2.5, 6, 12, 21.9, 22];
    const elapsed = [0, 650, 5_000, 60_000];
    const tiers: readonly BotDifficultyTier[] = BOT_DIFFICULTY_TIERS;
    let cases = 0;
    for (const distanceM of distances) {
      for (const gap of elapsed) {
        for (const tier of tiers) {
          const decision = botFireDecision(fireGate({
            hasLineOfSight: false,
            lineOfSightSince: 1_000,
            now: 1_000 + gap,
            distanceM,
            reactionDelayMs: botDifficultyProfile(tier).reactionDelayMs,
            burstShotsRemaining: 30,
            lastShotAt: -100_000,
          }));
          expect(decision.fire).toBe(false);
          expect(decision.reason).toBe('no-line-of-sight');
          cases += 1;
        }
      }
    }
    expect(cases).toBe(distances.length * elapsed.length * tiers.length);
  });

  it('treats an unset sight timestamp as no sight, so a stale field cannot open fire', () => {
    for (const lineOfSightSince of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(botFireDecision(fireGate({ lineOfSightSince, now: 999_999 })).fire).toBe(false);
    }
  });
});

describe('fairness: bots never fire before their reaction delay', () => {
  it('holds fire for every tier until the tier delay has fully elapsed', () => {
    for (const tier of BOT_DIFFICULTY_TIERS) {
      const { reactionDelayMs } = botDifficultyProfile(tier);
      const sightAt = 4_000;
      for (let elapsed = 0; elapsed < reactionDelayMs; elapsed += 20) {
        const decision = botFireDecision(fireGate({
          lineOfSightSince: sightAt,
          now: sightAt + elapsed,
          reactionDelayMs,
          lastShotAt: -100_000,
        }));
        expect(decision.fire, `${tier} fired ${elapsed}ms into a ${reactionDelayMs}ms reaction`).toBe(false);
        expect(decision.reason).toBe('reaction-pending');
      }
      const onTime = botFireDecision(fireGate({
        lineOfSightSince: sightAt,
        now: sightAt + reactionDelayMs,
        reactionDelayMs,
        lastShotAt: -100_000,
      }));
      expect(onTime.fire, `${tier} never fired after its full reaction delay`).toBe(true);
    }
  });

  it('clamps an under-floor reaction delay up rather than honouring it', () => {
    const decision = botFireDecision(fireGate({
      reactionDelayMs: 0,
      lineOfSightSince: 1_000,
      now: 1_000 + BOT_MINIMUM_REACTION_DELAY_MS - 1,
      lastShotAt: -100_000,
    }));
    expect(decision.fire).toBe(false);
    expect(decision.reason).toBe('reaction-pending');
  });

  it('restarts the delay when sight breaks and is regained', () => {
    const first = botFireDecision(fireGate({ lineOfSightSince: 1_000, now: 2_000, lastShotAt: -100_000 }));
    expect(first.fire).toBe(true);
    // Sight broken and re-acquired at t=2000: the clock restarts from there.
    const reacquired = botFireDecision(fireGate({ lineOfSightSince: 2_000, now: 2_300, lastShotAt: -100_000 }));
    expect(reacquired.fire).toBe(false);
    expect(reacquired.reason).toBe('reaction-pending');
  });

  it('never fires while spawn-protected, suppressed, or out of the range band', () => {
    expect(botFireDecision(fireGate({ invulnerableUntil: 9_999, lastShotAt: -1e5 })).reason).toBe('protected');
    expect(botFireDecision(fireGate({ fireSuppressed: true, lastShotAt: -1e5 })).reason).toBe('suppressed');
    expect(botFireDecision(fireGate({ distanceM: 40, lastShotAt: -1e5 })).reason).toBe('out-of-range');
    expect(botFireDecision(fireGate({ distanceM: 1, lastShotAt: -1e5 })).reason).toBe('too-close');
    expect(botFireDecision(fireGate({ alive: false })).reason).toBe('dead');
  });
});

describe('combat: burst fire with spread', () => {
  it('grows spread with each shot of a burst', () => {
    const jitters = [0, 1, 2, 3, 4].map((index) => botBurstAimJitter(0.03, 'regular', index));
    for (let index = 1; index < jitters.length; index += 1) {
      expect(jitters[index]!).toBeGreaterThan(jitters[index - 1]!);
    }
  });

  it('scales the whole spread by tier, so a veteran shoots tighter than a recruit', () => {
    const recruit = botBurstAimJitter(0.03, 'recruit', 2);
    const regular = botBurstAimJitter(0.03, 'regular', 2);
    const veteran = botBurstAimJitter(0.03, 'veteran', 2);
    expect(recruit).toBeGreaterThan(regular);
    expect(veteran).toBeLessThan(regular);
  });

  it('pauses between bursts for the tier recovery, so fire reads as bursts', () => {
    const now = 10_000;
    for (const tier of BOT_DIFFICULTY_TIERS) {
      const until = botBurstRecoveryUntil(now, tier);
      expect(until).toBe(now + botDifficultyProfile(tier).burstRecoveryMs);
      const midRecovery = botFireDecision(fireGate({
        now: until - 1, burstShotsRemaining: 0, burstRecoveryUntil: until, lastShotAt: -1e5,
      }));
      expect(midRecovery.fire).toBe(false);
      expect(midRecovery.reason).toBe('burst-recovery');
      expect(botFireDecision(fireGate({
        now: until, burstShotsRemaining: 0, burstRecoveryUntil: until, lastShotAt: -1e5,
      })).fire).toBe(true);
    }
  });

  it('respects the weapon fire interval inside a burst', () => {
    expect(botFireDecision(fireGate({ now: 5_000, lastShotAt: 4_950, fireIntervalMs: 120 })).reason).toBe('cadence');
    expect(botFireDecision(fireGate({ now: 5_000, lastShotAt: 4_800, fireIntervalMs: 120 })).fire).toBe(true);
  });
});

describe('navigation: no stuck bots', () => {
  /**
   * THE STUCK GATE the brief asks for, stated as it was asked: a bot with a
   * goal whose speed stays under the threshold for 3 s is a failure. The
   * detector must therefore reach `stuck` there, and — the part that matters
   * for the game — the unstick ladder must have already run three times before
   * it does, so a bot that CAN free itself does so first.
   */
  it('reports a failure at exactly 3 s of no progress with a live goal', () => {
    let state = createBotNavigationState(1);
    const actions: string[] = [];
    let stuckAt: number | null = null;
    for (let t = 0; t <= BOT_STUCK_FAILURE_MS; t += 50) {
      const step = advanceBotNavigation(state, { now: t, speedMps: 0, hasGoal: true });
      state = step.state;
      if (step.action !== 'continue') actions.push(`${t}:${step.action}`);
      if (step.stuck && stuckAt === null) stuckAt = t;
    }
    expect(stuckAt).toBe(BOT_STUCK_FAILURE_MS);
    expect(actions).toEqual([
      `${BOT_UNSTICK_DETOUR_MS}:detour`,
      `${BOT_UNSTICK_REPATH_MS}:repath`,
      `${BOT_UNSTICK_REVERSE_MS}:reverse`,
      `${BOT_STUCK_FAILURE_MS}:repath`,
    ]);
    expect(state.stuckEvents).toBe(1);
  });

  it('never reports stuck for a bot that is moving, however slowly above the threshold', () => {
    let state = createBotNavigationState(1);
    for (let t = 0; t <= 20_000; t += 50) {
      const step = advanceBotNavigation(state, { now: t, speedMps: BOT_STUCK_SPEED_MPS, hasGoal: true });
      state = step.state;
      expect(step.stuck).toBe(false);
      expect(step.action).toBe('continue');
    }
    expect(state.stuckEvents).toBe(0);
  });

  it('never reports stuck for an idle bot with no goal, however long it stands still', () => {
    let state = createBotNavigationState(1);
    for (let t = 0; t <= 20_000; t += 50) {
      const step = advanceBotNavigation(state, { now: t, speedMps: 0, hasGoal: false });
      state = step.state;
      expect(step.stuck).toBe(false);
    }
    expect(state.stuckEvents).toBe(0);
  });

  it('lets a bot the detour frees escape without ever reaching the failure line', () => {
    // Blocked for 500 ms (the detour rung fires at 400 ms), then moving.
    let state = createBotNavigationState(1);
    let sawDetour = false;
    for (let t = 0; t <= 10_000; t += 50) {
      const speedMps = t < 500 ? 0 : 3.2;
      const step = advanceBotNavigation(state, { now: t, speedMps, hasGoal: true });
      state = step.state;
      if (step.action === 'detour') sawDetour = true;
      expect(step.stuck).toBe(false);
    }
    expect(sawDetour).toBe(true);
    expect(state.stuckEvents).toBe(0);
  });

  it('is slower than the slowest legitimate travelling stance, so a crawl is never mistaken for a stall', () => {
    expect(BOT_STUCK_SPEED_MPS).toBeLessThan(botStanceSpeedCap('prone', false));
  });

  it('counts every failure over a long pin, not just the first', () => {
    let state = createBotNavigationState(1);
    for (let t = 0; t <= 12_500; t += 50) {
      state = advanceBotNavigation(state, { now: t, speedMps: 0, hasGoal: true }).state;
    }
    expect(state.stuckEvents).toBe(4);
  });
});

describe('navigation: no wall-hugging jitter', () => {
  /**
   * The jitter regression, measured the way the owner sees it: how many times
   * does the bot change which way it is sliding while pinned on a wall? The old
   * behaviour flipped `strafeSign` on the ~850 ms tactical-decision tick for as
   * long as the bot was blocked. The commit window must make that impossible.
   */
  it('holds one detour direction for the commit window instead of flipping per decision tick', () => {
    let state = createBotNavigationState(1);
    const signs: Array<-1 | 1> = [];
    for (let t = 0; t < 5_000; t += 50) {
      const step = advanceBotNavigation(state, { now: t, speedMps: 0, hasGoal: true });
      state = step.state;
      signs.push(step.detourSign);
    }
    let flips = 0;
    for (let index = 1; index < signs.length; index += 1) if (signs[index] !== signs[index - 1]) flips += 1;
    // A 5 s pin contains one 3 s failure spell; the sign may change once per
    // spell and never within one. The old per-tick flip would be ~5.
    expect(flips).toBeLessThanOrEqual(1);
    expect(BOT_DETOUR_COMMIT_MS).toBeGreaterThan(850);
  });

  it('tries the other way on the next blockage rather than repeating a failed slide', () => {
    let state: BotNavigationState = createBotNavigationState(1);
    const firstBlock = advanceBotNavigation(state, { now: 0, speedMps: 0, hasGoal: true });
    state = firstBlock.state;
    // Free, long enough for the commit to expire.
    state = advanceBotNavigation(state, { now: 4_000, speedMps: 4, hasGoal: true }).state;
    const secondBlock = advanceBotNavigation(state, { now: 4_050, speedMps: 0, hasGoal: true });
    expect(secondBlock.detourSign).toBe(-firstBlock.detourSign);
  });
});

describe('combat: use of cover', () => {
  function node(overrides: Partial<BotCoverNode> = {}): BotCoverNode {
    return {
      id: 'cover-a', x: 0, z: 0, distanceFromBot: 6, distanceFromThreat: 10, breaksLineOfSight: true, occupied: false, ...overrides,
    };
  }

  it('derives a standing spot on the far side of the box from the threat, and proves it hides the bot', () => {
    // Threat at the origin, a 2x2 m box centred 10 m along +X. The node must
    // land beyond the box, and the box must sit on the node-to-threat segment.
    const boxes = [{ id: 'crate', minX: 9, maxX: 11, minZ: -1, maxZ: 1 }];
    const [derived] = deriveBotCoverNodes(boxes, { x: 4, z: 0 }, { x: 0, z: 0 });
    expect(derived).toBeDefined();
    expect(derived!.x).toBeGreaterThan(11);
    expect(derived!.breaksLineOfSight).toBe(true);
    expect(derived!.distanceFromThreat).toBeGreaterThan(11);
  });

  it('marks a node that does not actually hide the bot as not breaking sight', () => {
    // A degenerate box with no depth along the sight line cannot occlude.
    expect(segmentCrossesCoverBox({ x: 0, z: 5 }, { x: 0, z: -5 }, { id: 'a', minX: 3, maxX: 4, minZ: -1, maxZ: 1 }))
      .toBe(false);
    expect(segmentCrossesCoverBox({ x: 0, z: 5 }, { x: 0, z: -5 }, { id: 'a', minX: -1, maxX: 1, minZ: -1, maxZ: 1 }))
      .toBe(true);
  });

  it('flags nodes already claimed this frame so two bots do not stack', () => {
    const boxes = [{ id: 'crate', minX: 9, maxX: 11, minZ: -1, maxZ: 1 }];
    const [claimed] = deriveBotCoverNodes(boxes, { x: 4, z: 0 }, { x: 0, z: 0 }, new Set(['crate']));
    expect(claimed!.occupied).toBe(true);
    expect(chooseBotCoverNode(deriveBotCoverNodes(boxes, { x: 4, z: 0 }, { x: 0, z: 0 }, new Set(['crate'])))).toBeNull();
  });

  it('only ever returns a node that actually breaks line of sight', () => {
    expect(chooseBotCoverNode([node({ breaksLineOfSight: false })])).toBeNull();
    expect(chooseBotCoverNode([
      node({ id: 'open', breaksLineOfSight: false, distanceFromBot: 1 }),
      node({ id: 'solid', breaksLineOfSight: true, distanceFromBot: 9 }),
    ])?.id).toBe('solid');
  });

  it('rejects nodes that are too far to break to, or that are on top of the threat', () => {
    expect(chooseBotCoverNode([node({ distanceFromBot: BOT_COVER_MAX_TRAVEL_M + 0.1 })])).toBeNull();
    expect(chooseBotCoverNode([node({ distanceFromThreat: BOT_COVER_MIN_THREAT_DISTANCE_M - 0.1 })])).toBeNull();
  });

  it('never sends two bots to a claimed node', () => {
    expect(chooseBotCoverNode([node({ occupied: true })])).toBeNull();
  });

  it('prefers the nearest eligible node, deterministically', () => {
    const nodes = [node({ id: 'far', distanceFromBot: 12 }), node({ id: 'near', distanceFromBot: 3 })];
    expect(chooseBotCoverNode(nodes)?.id).toBe('near');
    expect(chooseBotCoverNode([...nodes].reverse())?.id).toBe('near');
  });

  it('breaks for cover only while under fire, and honours the commit window', () => {
    const base = { alive: true, hp: 90, now: 10_000, coverCommittedUntil: 0, tier: 'veteran' as const, random: 0 };
    expect(shouldBotSeekCover({ ...base, lastDamagedAt: 9_900 })).toBe(true);
    expect(shouldBotSeekCover({ ...base, lastDamagedAt: 1_000 })).toBe(false);
    expect(shouldBotSeekCover({ ...base, lastDamagedAt: 9_900, coverCommittedUntil: 11_000 })).toBe(false);
    expect(shouldBotSeekCover({ ...base, alive: false, lastDamagedAt: 9_900 })).toBe(false);
  });

  it('makes harder tiers more likely to use cover, and a hurt bot always take it', () => {
    const base = { alive: true, hp: 90, lastDamagedAt: 9_900, now: 10_000, coverCommittedUntil: 0, random: 0.6 };
    expect(shouldBotSeekCover({ ...base, tier: 'recruit' })).toBe(false);
    expect(shouldBotSeekCover({ ...base, tier: 'veteran' })).toBe(true);
    expect(shouldBotSeekCover({ ...base, tier: 'recruit', hp: 20, random: 0.99 })).toBe(true);
  });
});

describe('prone cap seam', () => {
  it('grants prone by default, so this build is unchanged until the cap lane lands', () => {
    const decision = { stance: 'prone' as const, stanceHeldUntil: 1_234 };
    expect(applyBotProneCap(decision, 'bot-0')).toEqual(decision);
    expect(botProneCapHook()).toBe(ALLOW_ALL_BOT_PRONE);
  });

  it('downgrades a denied prone to crouch, never to stand', () => {
    const decision = { stance: 'prone' as const, stanceHeldUntil: 1_234 };
    const capped = applyBotProneCap(decision, 'bot-9', 'regular', () => false);
    expect(capped.stance).toBe('crouch');
    expect(capped.stanceHeldUntil).toBe(1_234);
  });

  it('passes the bot id through so the cap lane can count per bot', () => {
    const asked: string[] = [];
    applyBotProneCap({ stance: 'prone', stanceHeldUntil: 0 }, 'host-bot-2', 'regular', (id) => {
      asked.push(id);
      return true;
    });
    expect(asked).toEqual(['host-bot-2']);
  });

  it('leaves non-prone decisions completely alone', () => {
    for (const stance of ['stand', 'crouch'] as const) {
      const decision = { stance, stanceHeldUntil: 77 };
      expect(applyBotProneCap(decision, 'bot-1', 'regular', () => false)).toBe(decision);
    }
  });

  it('installs and restores an external cap hook without leaking into other tests', () => {
    const seen: string[] = [];
    setBotProneCapHook((id) => {
      seen.push(id);
      return false;
    });
    expect(applyBotProneCap({ stance: 'prone', stanceHeldUntil: 0 }, 'bot-3').stance).toBe('crouch');
    expect(seen).toEqual(['bot-3']);
    setBotProneCapHook(null);
    expect(applyBotProneCap({ stance: 'prone', stanceHeldUntil: 0 }, 'bot-3').stance).toBe('prone');
  });

  it('keeps recruits off the floor, so the cap lane never spends a slot on one', () => {
    expect(applyBotProneCap({ stance: 'prone', stanceHeldUntil: 0 }, 'bot-4', 'recruit').stance).toBe('crouch');
  });
});
