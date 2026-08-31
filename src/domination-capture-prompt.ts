/**
 * THE ANSWER TO "IT IS NOT CLEAR HOW TO CAPTURE FLAGS AND ZONES".
 *
 * Owner 2026-08-31, playing Raid: "its not clear how to cpature flags and
 * zones, make that clear too?". He was right, and the reason is that the whole
 * Domination presentation was three 12-pixel pips labelled A, B and C in the
 * corner of the HUD. They encode ownership in a colour and capture progress in
 * a CSS custom property that nothing draws at a readable size. Nowhere does the
 * game say what a zone is, that standing in one takes it, that an enemy in the
 * circle with you stops the take, or how far along the take you are.
 *
 * A player who has never read `docs/TEST2_MAP_BRIEF.md` cannot learn the mode
 * from the screen, which is every player, including the owner of the game.
 *
 * This module derives the prompt. It is pure so the wording and the thresholds
 * can be pinned by tests rather than eyeballed in a match: the HUD layer owns
 * every DOM consequence, exactly as `deriveCompactOpticSightPicture` does.
 */

import {
  DOMINATION_CAPTURE_MS,
  DOMINATION_ZONE_RADIUS_M,
  type DominationTeam,
  type DominationZoneId,
} from './domination-mode';

export const DOMINATION_CAPTURE_PROMPT_CONTRACT = 'domination-capture-prompt-v1' as const;

/**
 * How far outside a zone the approach hint appears. Wide enough to teach the
 * mode before the player is standing in the circle wondering what to press,
 * tight enough that it is not on screen for the whole match.
 */
export const DOMINATION_APPROACH_RADIUS_M = 12;

export type DominationPromptZoneView = Readonly<{
  id: DominationZoneId;
  centre: readonly [number, number, number];
  radius: number;
  owner: DominationTeam | null;
  capturingTeam: DominationTeam | null;
  progress: number;
  contested: boolean;
}>;

/**
 * What the player is being told, as a machine-readable state plus the exact
 * words. `state` is what the tests pin; `headline` and `detail` are what the
 * player reads.
 */
export type DominationCapturePromptState =
  /** Not near any zone: the HUD shows nothing. */
  | 'clear'
  /** Walking toward a zone they do not hold. */
  | 'approaching'
  /** Inside, alone, taking it. */
  | 'capturing'
  /** Inside, but a live enemy is in the circle too, so progress is frozen. */
  | 'contested'
  /** Inside a zone their own team already holds. */
  | 'holding'
  /** Inside an enemy-held zone: the bar must fall to neutral before it rises. */
  | 'neutralising';

export type DominationCapturePrompt = Readonly<{
  contract: typeof DOMINATION_CAPTURE_PROMPT_CONTRACT;
  state: DominationCapturePromptState;
  zone: DominationZoneId | null;
  /** 0..1 of the CURRENT ownership step, for the bar. */
  progress: number;
  /** Whole seconds left on this step, or null when nothing is progressing. */
  secondsRemaining: number | null;
  headline: string;
  detail: string;
  /** Drives the bar's colour: whose progress is on screen. */
  tone: 'friendly' | 'hostile' | 'neutral';
}>;

const CLEAR: DominationCapturePrompt = Object.freeze({
  contract: DOMINATION_CAPTURE_PROMPT_CONTRACT,
  state: 'clear',
  zone: null,
  progress: 0,
  secondsRemaining: null,
  headline: '',
  detail: '',
  tone: 'neutral',
});

function planarDistance(a: readonly [number, number, number], b: Readonly<{ x: number; z: number }>): number {
  return Math.hypot(a[0] - b.x, a[2] - b.z);
}

/** Whole seconds left of a step that is `progress` complete, at the step's rate. */
function secondsLeft(progress: number, stepMs: number): number {
  return Math.max(0, Math.ceil((stepMs * (1 - Math.min(1, Math.max(0, progress)))) / 1000));
}

/**
 * The prompt for one frame.
 *
 * Picks the NEAREST zone the player is inside; if they are inside none, the
 * nearest one within the approach radius. Being inside always wins over being
 * near, so walking through the edge of B on the way to A never hides the
 * message for the zone actually being stood in.
 */
export function deriveDominationCapturePrompt(input: Readonly<{
  alive: boolean;
  team: DominationTeam;
  position: Readonly<{ x: number; z: number }>;
  zones: readonly DominationPromptZoneView[];
}>): DominationCapturePrompt {
  if (!input.alive || input.zones.length === 0) return CLEAR;

  let inside: DominationPromptZoneView | null = null;
  let insideDistance = Number.POSITIVE_INFINITY;
  let near: DominationPromptZoneView | null = null;
  let nearDistance = Number.POSITIVE_INFINITY;
  for (const zone of input.zones) {
    const distance = planarDistance(zone.centre, input.position);
    const radius = Number.isFinite(zone.radius) && zone.radius > 0 ? zone.radius : DOMINATION_ZONE_RADIUS_M;
    if (distance <= radius) {
      if (distance < insideDistance) { inside = zone; insideDistance = distance; }
    } else if (distance <= DOMINATION_APPROACH_RADIUS_M && distance < nearDistance) {
      near = zone; nearDistance = distance;
    }
  }

  if (!inside) {
    if (!near) return CLEAR;
    const held = near.owner === input.team;
    return Object.freeze({
      contract: DOMINATION_CAPTURE_PROMPT_CONTRACT,
      state: 'approaching' as const,
      zone: near.id,
      progress: near.progress,
      secondsRemaining: null,
      headline: `ZONE ${near.id}`,
      detail: held ? 'YOUR TEAM HOLDS THIS ZONE' : 'STAND INSIDE THE CIRCLE TO CAPTURE',
      tone: held ? ('friendly' as const) : ('neutral' as const),
    });
  }

  if (inside.contested) {
    return Object.freeze({
      contract: DOMINATION_CAPTURE_PROMPT_CONTRACT,
      state: 'contested' as const,
      zone: inside.id,
      progress: inside.progress,
      secondsRemaining: null,
      headline: `ZONE ${inside.id} CONTESTED`,
      detail: 'AN ENEMY IS IN THE CIRCLE - CLEAR THEM OUT',
      tone: 'hostile' as const,
    });
  }

  // Their own zone, and nobody is taking it off them.
  if (inside.owner === input.team && inside.capturingTeam === null) {
    return Object.freeze({
      contract: DOMINATION_CAPTURE_PROMPT_CONTRACT,
      state: 'holding' as const,
      zone: inside.id,
      progress: 1,
      secondsRemaining: null,
      headline: `ZONE ${inside.id} HELD`,
      detail: 'SCORING FOR YOUR TEAM WHILE YOU HOLD IT',
      tone: 'friendly' as const,
    });
  }

  // An enemy-owned zone falls to neutral before it can be taken, so the first
  // bar the player fills does not hand them the zone. Saying so removes the
  // "I stood here for five seconds and got nothing" confusion.
  const neutralising = inside.owner !== null && inside.owner !== input.team;
  const mine = inside.capturingTeam === input.team;
  return Object.freeze({
    contract: DOMINATION_CAPTURE_PROMPT_CONTRACT,
    state: neutralising ? ('neutralising' as const) : ('capturing' as const),
    zone: inside.id,
    progress: inside.progress,
    secondsRemaining: mine ? secondsLeft(inside.progress, DOMINATION_CAPTURE_MS) : null,
    headline: neutralising ? `NEUTRALISING ZONE ${inside.id}` : `CAPTURING ZONE ${inside.id}`,
    detail: neutralising
      ? 'BREAK THEIR HOLD FIRST, THEN CAPTURE IT'
      : 'STAY IN THE CIRCLE',
    tone: mine ? ('friendly' as const) : ('hostile' as const),
  });
}
