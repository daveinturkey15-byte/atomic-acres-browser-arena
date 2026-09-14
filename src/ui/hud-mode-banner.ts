/**
 * MAP3 (HF-409 finisher 2): what the in-match HUD is allowed to SAY.
 *
 * THE DEFECT THIS CLOSES.
 *
 * Map 3 shipped as an EXPLORE arena - the owner's words, 2026-09-02 16:55:
 * "Just keep the showcase in and it's not about combat, it's a mode you can
 * explore." The registry said so, the menu said so, the spawn gate said so.
 * The HUD did not. Walking the corridors, the matchbar read
 *
 *     TEAM DEATHMATCH        04:37        AQUA 0  -  0 CORAL
 *     MAP 3 - FIVE MINUTES - MOST KILLS WINS - TIED
 *
 * and five minutes later the walk ended in a DEFEAT card. Every one of those
 * words is false in an arena with no second team, no bots and nothing to win,
 * and a HUD that lies about the mode is worse than one that says nothing: it
 * tells the player they are losing a match that does not exist.
 *
 * WHY THIS IS A MODULE AND NOT TWO TERNARIES.
 *
 * The label was written twice in legacy-main.ts - once when a match starts,
 * once every frame - as two long inline conditionals that had already drifted
 * from each other (the gun range is "SCORE PRACTICE" in one and "TARGET DRILL"
 * in the other). A third arena kind arriving in a chain like that is how the
 * TEAM DEATHMATCH banner survived the explore card in the first place. So the
 * decision lives here, both writers ask the same function, the two sites'
 * genuine disagreement is a DECLARED input (`site`) rather than an accident,
 * and `src/ui/hud-mode-banner.test.ts` pins every branch.
 *
 * IT BRANCHES ON `kind`, NEVER ON AN ID LIST. `selection.kind === 'explore'`
 * is the registry's own declared field; an id list is a thing the next explore
 * arena silently falls off.
 */
import type { MatchRules } from '../gameplay';
import type { ArenaSelection } from '../map-selection';

/**
 * The runtime match contract for an explore arena: no clock, no score limit.
 *
 * `advanceMatch` reads exactly these two fields - a null duration gives the
 * active phase an `endsAt` of +Infinity, so the match never ends, never
 * declares a winner and never shows a VICTORY/DEFEAT card, and
 * `formatMatchClock(Infinity)` is '--:--'. The registry row keeps its own
 * `matchRules.durationMs` because the arena id is also the replay and storage
 * boundary; this is what the state machine is handed instead.
 */
export const EXPLORE_MATCH_RULES: MatchRules = Object.freeze({ durationMs: null, scoreLimit: null });

/** Which of the two HUD writers is asking. They disagree, and always have. */
export type HudModeSite = 'match-start' | 'frame';

/** Just the registry fields the banner reads, so tests need no whole arena. */
export type HudModeArena = Pick<ArenaSelection, 'id' | 'kind' | 'displayName'>;

export type HudModeInput = Readonly<{
  arena: HudModeArena;
  site: HudModeSite;
  /** Domination presents its own contract and outranks the arena's. */
  domination: boolean;
  /** Free-for-all replaces the squad scoreline. Frame site only, as before. */
  freeForAll: boolean;
  /** Solo, as opposed to a hosted or joined lobby. */
  solo: boolean;
}>;

export type HudModeBanner = Readonly<{
  /** `#match-mode-label`. */
  label: string;
  /** `#timer`. False hides it: an explore mode has no clock to run out. */
  clock: boolean;
  /** `#scoreline` (AQUA / CORAL / score limit). False hides the whole strip. */
  scoreline: boolean;
  /** `#objective`, or null to keep the match presentation's own line. */
  objective: string | null;
  /** `#connection-pill`, or null to keep the caller's own wording. */
  connection: string | null;
  /** `#pause-hint`. */
  pauseHint: string;
  /** False suppresses the 3-2-1 "match starts in" cue and its audio. */
  countdownCue: boolean;
}>;

/** True for an arena whose content is the mode. */
export function isExploreArena(arena: HudModeArena): boolean {
  return arena.kind === 'explore';
}

/**
 * The one decision. Everything the matchbar shows for the current arena.
 *
 * For every `kind: 'team'` arena this reproduces the two inline conditionals
 * it replaced exactly, including their disagreement about the gun range, and
 * shows the clock, the scoreline and the presentation's own objective line.
 */
export function hudModeBanner(input: HudModeInput): HudModeBanner {
  const { arena, site, domination, freeForAll, solo } = input;

  if (isExploreArena(arena)) {
    const name = arena.displayName.toUpperCase();
    return Object.freeze({
      label: `EXPLORE · ${name}`,
      clock: false,
      scoreline: false,
      // No duration, no win condition, no leader - and the way out, where the
      // objective line is the one piece of HUD copy a player already reads.
      objective: `${name} · EXPLORE · NO TIMER · NOTHING TO WIN · ESC FOR MENU`,
      connection: 'SOLO EXPLORE',
      pauseHint: 'ESC · BACK TO MENU',
      countdownCue: false,
    });
  }

  const label = domination
    ? 'DOMINATION'
    : site === 'frame' && freeForAll
      ? 'FREE FOR ALL'
      : arena.id === 'gun-range'
        ? (site === 'match-start' ? 'SCORE PRACTICE' : 'TARGET DRILL')
        : site === 'match-start' && arena.id === 'rustworks-1v1'
          ? (solo ? 'RUSTRIG DUEL' : 'RUSTRIG MATCH')
          : 'TEAM DEATHMATCH';

  return Object.freeze({
    label,
    clock: true,
    scoreline: true,
    objective: null,
    connection: null,
    pauseHint: 'ESC · MENU',
    countdownCue: true,
  });
}

/** The `#match-mode-label` text alone. */
export function matchModeLabel(input: HudModeInput): string {
  return hudModeBanner(input).label;
}
