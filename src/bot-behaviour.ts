import type { Stance } from './gameplay';
import type { BotStanceDecision } from './bot-stance';

/**
 * PASS 95 lane `v8-bot-behaviour`. The readable-opponent layer.
 *
 * WHAT THIS IS. Every decision a bot makes that the OWNER can see from the
 * other end of a gunfight, kept pure and out of `legacy-main.ts` so each rule
 * can be asserted directly instead of inferred from a match:
 *
 *   - navigation: a stuck detector with an escalation ladder that resolves
 *     BEFORE the 3 s failure line, and a jitter guard that stops the
 *     left/right wall-hugging shuffle;
 *   - combat: a single fire gate that is the only place "may this bot shoot"
 *     is answered, difficulty-scaled reaction delay, burst discipline with
 *     per-shot spread growth, and cover-node selection under fire;
 *   - fairness: the fire gate cannot return true without solid line of sight,
 *     and cannot return true before the tier's reaction delay has elapsed.
 *     Both are pinned by `bot-behaviour.test.ts`; there is no second code path
 *     a future change could route around, because the caller asks THIS
 *     function and takes its verdict.
 *
 * WHAT THIS DELIBERATELY IS NOT. It is not a navigation mesh, it does not own
 * the world, and it never raycasts. Everything spatial arrives as a number the
 * caller measured with the arena's own colliders — `solidLineOfSight`,
 * `speedMps`, `distanceFromBot`. That boundary is why the fairness tests are
 * meaningful: a bot cannot see through a wall here because this module has no
 * way to look at one.
 *
 * PRONE CAP. A separate lane (`bot-anim-prone-crouch`) owns the "at most two
 * bots prone per map" rule. This module does NOT implement that cap; it
 * exposes the hook that cap plugs into (`applyBotProneCap`) so the two lanes
 * meet at one seam instead of racing over the stance field.
 */

// ---------------------------------------------------------------------------
// Difficulty tiers
// ---------------------------------------------------------------------------

/**
 * The four tiers, documented as a contract rather than a table of taste.
 *
 * Every tier differs on the SAME four axes, and each axis is something the
 * owner can perceive in a firefight:
 *
 * | tier     | reaction | aim error | burst recovery | cover seeking |
 * |----------|---------:|----------:|---------------:|--------------:|
 * | recruit  |   900 ms |     1.55x |         620 ms |          0.25 |
 * | regular  |   650 ms |     1.00x |         480 ms |          0.50 |
 * | hardened |   460 ms |     0.78x |         380 ms |          0.72 |
 * | veteran  |   320 ms |     0.62x |         300 ms |          0.88 |
 *
 * `regular` is exactly the shipped Pass 66..94 behaviour: 650 ms is
 * `BOT_REACTION_DELAY`, and the aim scale is 1.0, so a roster made entirely of
 * `regular` bots is byte-for-byte the old feel. That is deliberate — the tiers
 * are an axis around the existing behaviour, not a replacement for it.
 *
 * NO TIER GETS A PERCEPTION ADVANTAGE. There is no tier field for sight range,
 * wall penetration, or target snapping, and `botFireDecision` does not read the
 * tier when deciding whether the bot can SEE. Difficulty buys reaction time and
 * accuracy, never information.
 */
export type BotDifficultyTier = 'recruit' | 'regular' | 'hardened' | 'veteran';

export type BotDifficultyProfile = Readonly<{
  tier: BotDifficultyTier;
  /** Milliseconds of continuous line of sight required before the first shot. */
  reactionDelayMs: number;
  /** Multiplier on the range-derived aim jitter. >1 is worse aim. */
  aimErrorScale: number;
  /** Pause between bursts, so fire reads as bursts rather than a hose. */
  burstRecoveryMs: number;
  /** Probability the bot breaks toward a cover node when it comes under fire. */
  coverSeekChance: number;
  /** Bots of this tier may be granted prone by the stance layer. */
  proneEligible: boolean;
}>;

export const BOT_DIFFICULTY_PROFILES: Readonly<Record<BotDifficultyTier, BotDifficultyProfile>> = Object.freeze({
  recruit: Object.freeze({ tier: 'recruit', reactionDelayMs: 900, aimErrorScale: 1.55, burstRecoveryMs: 620, coverSeekChance: 0.25, proneEligible: false }),
  regular: Object.freeze({ tier: 'regular', reactionDelayMs: 650, aimErrorScale: 1, burstRecoveryMs: 480, coverSeekChance: 0.5, proneEligible: true }),
  hardened: Object.freeze({ tier: 'hardened', reactionDelayMs: 460, aimErrorScale: 0.78, burstRecoveryMs: 380, coverSeekChance: 0.72, proneEligible: true }),
  veteran: Object.freeze({ tier: 'veteran', reactionDelayMs: 320, aimErrorScale: 0.62, burstRecoveryMs: 300, coverSeekChance: 0.88, proneEligible: true }),
});

export const BOT_DIFFICULTY_TIERS: readonly BotDifficultyTier[] = Object.freeze([
  'recruit', 'regular', 'hardened', 'veteran',
]);

/** The lowest reaction delay any tier may ever have. A fairness floor, not a tuning knob. */
export const BOT_MINIMUM_REACTION_DELAY_MS = 200;

export function botDifficultyProfile(tier: BotDifficultyTier): BotDifficultyProfile {
  return BOT_DIFFICULTY_PROFILES[tier] ?? BOT_DIFFICULTY_PROFILES.regular;
}

/**
 * A deterministic tier ladder across a roster.
 *
 * A squad that is all one tier reads as one opponent copied N times. Spreading
 * the roster gives the owner someone to push and someone to respect in the same
 * match. Deterministic on purpose: bot behaviour is host-authoritative and
 * replicated, so a `Math.random()` here would desync a guest's expectations.
 *
 * The pattern repeats regular, hardened, recruit, veteran so that the FIRST bot
 * a solo player meets is `regular` — the shipped feel — and the roster never
 * opens on a veteran.
 */
export function botDifficultyTierForIndex(index: number): BotDifficultyTier {
  const ladder: readonly BotDifficultyTier[] = ['regular', 'hardened', 'recruit', 'veteran'];
  const bounded = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  return ladder[bounded % ladder.length]!;
}

// ---------------------------------------------------------------------------
// Fairness: the one fire gate
// ---------------------------------------------------------------------------

export type BotFireReason =
  | 'dead'
  | 'no-line-of-sight'
  | 'reaction-pending'
  | 'suppressed'
  | 'out-of-range'
  | 'too-close'
  | 'protected'
  | 'cadence'
  | 'burst-recovery'
  | 'fire';

export type BotFireGate = Readonly<{
  alive: boolean;
  /**
   * Solid, world-collider line of sight, resolved by the CALLER against the
   * arena. This module never infers sight from distance — that is the whole
   * point of the wallhack test.
   */
  hasLineOfSight: boolean;
  /** `now` at which the current unbroken sight of the target began; 0 when unsighted. */
  lineOfSightSince: number;
  now: number;
  reactionDelayMs: number;
  /** Perception suppression (flash recovery, blocking smoke) resolved upstream. */
  fireSuppressed: boolean;
  distanceM: number;
  minRangeM: number;
  maxRangeM: number;
  lastShotAt: number;
  fireIntervalMs: number;
  /** Shots left in the current burst; 0 means a new burst must be opened. */
  burstShotsRemaining: number;
  /** `now` before which a finished burst is still recovering. */
  burstRecoveryUntil: number;
  /** Spawn protection: a protected bot does not get free opening shots. */
  invulnerableUntil: number;
}>;

export type BotFireDecision = Readonly<{ fire: boolean; reason: BotFireReason }>;

/**
 * THE fairness contract. Two properties hold for every input, and both are
 * asserted exhaustively in the test:
 *
 *   1. `fire === true` implies `hasLineOfSight === true`.
 *   2. `fire === true` implies `now - lineOfSightSince >= reactionDelayMs`.
 *
 * Everything else in here is feel (range band, cadence, burst recovery) and may
 * be tuned. Those two may not: they are the difference between an opponent and
 * a cheat.
 */
export function botFireDecision(gate: BotFireGate): BotFireDecision {
  const verdict = (reason: BotFireReason): BotFireDecision => Object.freeze({ fire: reason === 'fire', reason });
  if (!gate.alive) return verdict('dead');
  // Sight first, unconditionally. No tier, distance, or timer may substitute
  // for it, and an unsighted bot never reaches any later branch.
  if (!gate.hasLineOfSight || !Number.isFinite(gate.lineOfSightSince) || gate.lineOfSightSince <= 0) {
    return verdict('no-line-of-sight');
  }
  const reactionDelayMs = Math.max(
    BOT_MINIMUM_REACTION_DELAY_MS,
    Number.isFinite(gate.reactionDelayMs) ? gate.reactionDelayMs : BOT_DIFFICULTY_PROFILES.regular.reactionDelayMs,
  );
  if (!(gate.now - gate.lineOfSightSince >= reactionDelayMs)) return verdict('reaction-pending');
  if (gate.fireSuppressed) return verdict('suppressed');
  if (gate.now < gate.invulnerableUntil) return verdict('protected');
  if (!Number.isFinite(gate.distanceM) || gate.distanceM > gate.maxRangeM) return verdict('out-of-range');
  if (gate.distanceM < gate.minRangeM) return verdict('too-close');
  if (gate.burstShotsRemaining <= 0 && gate.now < gate.burstRecoveryUntil) return verdict('burst-recovery');
  const interval = Math.max(40, Number.isFinite(gate.fireIntervalMs) ? gate.fireIntervalMs : 620);
  if (gate.now - gate.lastShotAt < interval) return verdict('cadence');
  return verdict('fire');
}

/**
 * Per-shot spread growth within a burst, scaled by tier.
 *
 * A burst whose every round lands on the same pixel reads as a laser. Spread
 * grows with the shot index so the first round of a burst is the accurate one
 * and holding the trigger costs precision — the same bargain the player has.
 */
export const BOT_BURST_SPREAD_PER_SHOT_RADIANS = 0.006;

export function botBurstAimJitter(
  baseJitterRadians: number,
  tier: BotDifficultyTier,
  shotIndexInBurst: number,
): number {
  const base = Number.isFinite(baseJitterRadians) ? Math.max(0, baseJitterRadians) : 0;
  const index = Number.isFinite(shotIndexInBurst) ? Math.max(0, Math.floor(shotIndexInBurst)) : 0;
  return (base + index * BOT_BURST_SPREAD_PER_SHOT_RADIANS) * botDifficultyProfile(tier).aimErrorScale;
}

/** When a burst empties, the bot pauses for its tier's recovery before opening the next one. */
export function botBurstRecoveryUntil(now: number, tier: BotDifficultyTier): number {
  return (Number.isFinite(now) ? now : 0) + botDifficultyProfile(tier).burstRecoveryMs;
}

// ---------------------------------------------------------------------------
// Navigation: stuck detection and the unstick ladder
// ---------------------------------------------------------------------------

/**
 * Below this ground speed a bot with somewhere to be is not making progress.
 * The slowest thing a bot can legitimately do while travelling is prone-crawl
 * (`movementProfile` prone maxSpeed), which is comfortably above this.
 */
export const BOT_STUCK_SPEED_MPS = 0.35;

/**
 * The FAILURE line. Three seconds of no progress with a live goal is the thing
 * the owner sees as "that bot is stuck on a doorframe", and
 * `bot-behaviour.test.ts` treats reaching it as a failure, not a state.
 */
export const BOT_STUCK_FAILURE_MS = 3_000;

/**
 * The ladder rungs, all strictly inside the failure window so the bot has three
 * chances to free itself before the detector calls it stuck.
 */
export const BOT_UNSTICK_DETOUR_MS = 400;
export const BOT_UNSTICK_REPATH_MS = 1_200;
export const BOT_UNSTICK_REVERSE_MS = 2_200;

/**
 * How long a detour direction is committed once chosen.
 *
 * The wall-hugging jitter had a single cause: the strafe sign flipped on the
 * tactical-decision cadence while the collision resolver re-blocked the bot
 * every frame, so a bot pinned on a wall shuffled left-right-left in place.
 * Committing the sign for longer than one decision tick converts that shuffle
 * into one deliberate slide along the wall.
 */
export const BOT_DETOUR_COMMIT_MS = 900;

export type BotUnstickAction = 'continue' | 'detour' | 'repath' | 'reverse';

export type BotNavigationState = Readonly<{
  /** `now` at which the current no-progress spell began; null while moving. */
  blockedSince: number | null;
  /** Highest ladder rung already taken for THIS spell. */
  stage: 0 | 1 | 2 | 3;
  /** Committed detour sign; held until `detourCommittedUntil`. */
  detourSign: -1 | 1;
  detourCommittedUntil: number;
  /** Count of 3 s failures over this bot's life. A match probe reads this. */
  stuckEvents: number;
  /** Count of ladder rungs taken; useful to show the ladder actually ran. */
  unstickActions: number;
}>;

export function createBotNavigationState(detourSign: -1 | 1 = 1): BotNavigationState {
  return Object.freeze({
    blockedSince: null,
    stage: 0,
    detourSign,
    detourCommittedUntil: 0,
    stuckEvents: 0,
    unstickActions: 0,
  });
}

export type BotNavigationSample = Readonly<{
  now: number;
  /** Ground speed actually achieved after collision resolution, m/s. */
  speedMps: number;
  /** The bot has somewhere to be. An idle bot is not stuck, it is idle. */
  hasGoal: boolean;
}>;

export type BotNavigationStep = Readonly<{
  state: BotNavigationState;
  /** True on the frame a 3 s no-progress spell is recognised. A failure. */
  stuck: boolean;
  action: BotUnstickAction;
  /** Sign to strafe along while detouring; stable for BOT_DETOUR_COMMIT_MS. */
  detourSign: -1 | 1;
  blockedForMs: number;
}>;

/**
 * The whole navigation health rule in one place.
 *
 * Progress resets everything. No progress climbs the ladder: detour at 400 ms,
 * repath at 1.2 s, reverse-and-repath at 2.2 s, and at 3 s the spell is
 * recorded as a genuine stuck event and the ladder restarts. Each rung fires
 * once per spell, so a caller cannot be spammed with repaths.
 */
export function advanceBotNavigation(state: BotNavigationState, sample: BotNavigationSample): BotNavigationStep {
  const now = Number.isFinite(sample.now) ? sample.now : 0;
  const speed = Number.isFinite(sample.speedMps) ? Math.abs(sample.speedMps) : 0;
  const step = (
    next: BotNavigationState,
    stuck: boolean,
    action: BotUnstickAction,
    blockedForMs: number,
  ): BotNavigationStep => Object.freeze({ state: Object.freeze(next), stuck, action, detourSign: next.detourSign, blockedForMs });

  if (!sample.hasGoal || speed >= BOT_STUCK_SPEED_MPS) {
    return step({ ...state, blockedSince: null, stage: 0 }, false, 'continue', 0);
  }

  const blockedSince = state.blockedSince ?? now;
  const blockedForMs = Math.max(0, now - blockedSince);

  // A committed detour keeps its sign; a fresh spell may pick the other way so
  // two consecutive spells on the same wall do not repeat a failed slide.
  const commitExpired = now >= state.detourCommittedUntil;
  const detourSign: -1 | 1 = state.blockedSince === null && commitExpired
    ? (state.detourSign === 1 ? -1 : 1)
    : state.detourSign;

  if (blockedForMs >= BOT_STUCK_FAILURE_MS) {
    return step({
      ...state,
      blockedSince: now,
      stage: 0,
      detourSign,
      detourCommittedUntil: now + BOT_DETOUR_COMMIT_MS,
      stuckEvents: state.stuckEvents + 1,
      unstickActions: state.unstickActions + 1,
    }, true, 'repath', blockedForMs);
  }

  const rung: 0 | 1 | 2 | 3 = blockedForMs >= BOT_UNSTICK_REVERSE_MS ? 3
    : blockedForMs >= BOT_UNSTICK_REPATH_MS ? 2
      : blockedForMs >= BOT_UNSTICK_DETOUR_MS ? 1 : 0;
  if (rung > state.stage) {
    const action: BotUnstickAction = rung === 1 ? 'detour' : rung === 2 ? 'repath' : 'reverse';
    return step({
      ...state,
      blockedSince,
      stage: rung,
      detourSign,
      detourCommittedUntil: rung === 1 ? now + BOT_DETOUR_COMMIT_MS : state.detourCommittedUntil,
      unstickActions: state.unstickActions + 1,
    }, false, action, blockedForMs);
  }
  return step({ ...state, blockedSince, detourSign }, false, 'continue', blockedForMs);
}

// ---------------------------------------------------------------------------
// Cover
// ---------------------------------------------------------------------------

/**
 * A cover node is an offset point beside an authored `physicalCover` box, on
 * the face away from the threat. The caller derives these from the arena; this
 * module ranks them.
 */
export type BotCoverNode = Readonly<{
  id: string;
  /** World X/Z of the standing spot beside the cover box. */
  x: number;
  z: number;
  /** Metres from the bot to the node. */
  distanceFromBot: number;
  /** Metres from the node to the threat. */
  distanceFromThreat: number;
  /** The cover box sits between the node and the threat. Caller-measured. */
  breaksLineOfSight: boolean;
  /** Another bot already claimed this node this frame. */
  occupied: boolean;
}>;

/** Beyond this a "cover node" is a different postcode, not a place to break to. */
export const BOT_COVER_MAX_TRAVEL_M = 14;
/** Hugging the threat's own cover is not cover. */
export const BOT_COVER_MIN_THREAT_DISTANCE_M = 4;
/** A bot that just broke to cover does not re-decide for this long. */
export const BOT_COVER_COMMIT_MS = 2_500;

/**
 * Ranks cover nodes: only nodes that actually break sight are eligible, then
 * nearest wins, with a mild bonus for keeping distance from the threat so a bot
 * does not break INTO a shotgun.
 */
export function chooseBotCoverNode(nodes: readonly BotCoverNode[]): BotCoverNode | null {
  const eligible = nodes.filter((node) => node.breaksLineOfSight
    && !node.occupied
    && Number.isFinite(node.distanceFromBot)
    && node.distanceFromBot <= BOT_COVER_MAX_TRAVEL_M
    && node.distanceFromThreat >= BOT_COVER_MIN_THREAT_DISTANCE_M);
  if (eligible.length === 0) return null;
  const scored = eligible.map((node) => ({
    node,
    score: -node.distanceFromBot + Math.min(node.distanceFromThreat, 20) * 0.22,
  }));
  scored.sort((a, b) => b.score - a.score || (a.node.id < b.node.id ? -1 : 1));
  return scored[0]!.node;
}

/** The 2D footprint of an authored `physicalCover` entry. */
export type BotCoverBox = Readonly<{ id: string; minX: number; maxX: number; minZ: number; maxZ: number }>;

/** Distance a bot stands back from a cover face, so it hugs the box rather than clipping it. */
export const BOT_COVER_STANDOFF_M = 0.9;

/** 2D segment-versus-AABB test (slab method). The only geometry this module owns. */
export function segmentCrossesCoverBox(
  from: Readonly<{ x: number; z: number }>,
  to: Readonly<{ x: number; z: number }>,
  box: BotCoverBox,
): boolean {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let enter = 0;
  let exit = 1;
  for (const axis of [
    { origin: from.x, delta: dx, min: box.minX, max: box.maxX },
    { origin: from.z, delta: dz, min: box.minZ, max: box.maxZ },
  ]) {
    if (Math.abs(axis.delta) < 1e-9) {
      if (axis.origin < axis.min || axis.origin > axis.max) return false;
      continue;
    }
    const t0 = (axis.min - axis.origin) / axis.delta;
    const t1 = (axis.max - axis.origin) / axis.delta;
    enter = Math.max(enter, Math.min(t0, t1));
    exit = Math.min(exit, Math.max(t0, t1));
    if (enter > exit) return false;
  }
  return enter <= exit;
}

/**
 * Turns the arena's authored cover boxes into standing spots.
 *
 * One node per box: the point standing off the face that is on the far side of
 * the box from the threat. `breaksLineOfSight` is then measured — not assumed —
 * by testing the node-to-threat segment against the box itself, so a node that
 * would not actually hide the bot is rejected by `chooseBotCoverNode`.
 */
export function deriveBotCoverNodes(
  boxes: readonly BotCoverBox[],
  bot: Readonly<{ x: number; z: number }>,
  threat: Readonly<{ x: number; z: number }>,
  occupiedIds: ReadonlySet<string> = new Set(),
): BotCoverNode[] {
  const nodes: BotCoverNode[] = [];
  for (const box of boxes) {
    const centreX = (box.minX + box.maxX) / 2;
    const centreZ = (box.minZ + box.maxZ) / 2;
    const awayX = centreX - threat.x;
    const awayZ = centreZ - threat.z;
    const length = Math.hypot(awayX, awayZ);
    if (!(length > 1e-4)) continue;
    const halfX = (box.maxX - box.minX) / 2 + BOT_COVER_STANDOFF_M;
    const halfZ = (box.maxZ - box.minZ) / 2 + BOT_COVER_STANDOFF_M;
    const reach = Math.hypot(halfX * (awayX / length), halfZ * (awayZ / length));
    const x = centreX + (awayX / length) * reach;
    const z = centreZ + (awayZ / length) * reach;
    nodes.push(Object.freeze({
      id: box.id,
      x,
      z,
      distanceFromBot: Math.hypot(x - bot.x, z - bot.z),
      distanceFromThreat: Math.hypot(x - threat.x, z - threat.z),
      breaksLineOfSight: segmentCrossesCoverBox({ x, z }, threat, box),
      occupied: occupiedIds.has(box.id),
    }));
  }
  return nodes;
}

export type BotCoverSense = Readonly<{
  alive: boolean;
  hp: number;
  /** performance.now() of the last damage taken; -Infinity when never hit. */
  lastDamagedAt: number;
  now: number;
  /** `now` before which an existing cover break is still committed. */
  coverCommittedUntil: number;
  tier: BotDifficultyTier;
  /** Deterministic 0..1 draw supplied by the caller's gameplay RNG. */
  random: number;
}>;

/** Milliseconds after a hit during which a bot counts as under fire, matching `bot-stance`. */
export const BOT_COVER_UNDER_FIRE_MS = 1_400;

/**
 * Whether a bot should break for cover this frame.
 *
 * Under fire is the trigger; the tier's `coverSeekChance` is how likely that
 * tier is to act on it; commitment stops the decision re-firing every frame.
 * A bot at or below the prone health always breaks regardless of tier — that
 * is the readable "he's hurt, he's hiding" moment.
 */
export function shouldBotSeekCover(sense: BotCoverSense): boolean {
  if (!sense.alive) return false;
  if (sense.now < sense.coverCommittedUntil) return false;
  const underFire = sense.now - sense.lastDamagedAt <= BOT_COVER_UNDER_FIRE_MS;
  if (!underFire) return false;
  if (sense.hp <= 25) return true;
  const draw = Number.isFinite(sense.random) ? Math.max(0, Math.min(1, sense.random)) : 1;
  return draw < botDifficultyProfile(sense.tier).coverSeekChance;
}

// ---------------------------------------------------------------------------
// Prone cap seam (owned by the bot-anim-prone-crouch lane)
// ---------------------------------------------------------------------------

/**
 * The hook the prone-cap lane implements. It is asked, for one bot, whether a
 * prone stance may be granted right now. It is NOT asked to count anything
 * here: the count, the per-map limit of two, and the release-on-death
 * bookkeeping all live in that lane.
 *
 * The default below grants every request, so this build behaves exactly as it
 * did before the seam existed and the cap lane can land independently.
 */
export type BotProneCapHook = (botId: string) => boolean;

export const ALLOW_ALL_BOT_PRONE: BotProneCapHook = () => true;

let activeBotProneCapHook: BotProneCapHook = ALLOW_ALL_BOT_PRONE;

/** Installs the cap. Passing null restores the permissive default. */
export function setBotProneCapHook(hook: BotProneCapHook | null): void {
  activeBotProneCapHook = typeof hook === 'function' ? hook : ALLOW_ALL_BOT_PRONE;
}

export function botProneCapHook(): BotProneCapHook {
  return activeBotProneCapHook;
}

/**
 * Applies the cap to a stance decision that `resolveBotStance` already made.
 *
 * A denied prone becomes CROUCH, never stand: the bot still wanted to get
 * small, and dropping it back to a standing silhouette would read as the bot
 * ignoring the fire it just took. The hold timestamp is preserved so a denied
 * bot does not re-ask every frame.
 */
export function applyBotProneCap(
  decision: BotStanceDecision,
  botId: string,
  tier: BotDifficultyTier = 'regular',
  hook: BotProneCapHook = activeBotProneCapHook,
): BotStanceDecision {
  if (decision.stance !== 'prone') return decision;
  const eligible = botDifficultyProfile(tier).proneEligible;
  const granted = eligible && hook(botId) === true;
  if (granted) return decision;
  const stance: Stance = 'crouch';
  return { stance, stanceHeldUntil: decision.stanceHeldUntil };
}
