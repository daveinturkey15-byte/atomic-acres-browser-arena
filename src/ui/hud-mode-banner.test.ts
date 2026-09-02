/**
 * MAP3 (HF-409 finisher 2): the in-match HUD must not claim a match.
 *
 * This pins `src/ui/hud-mode-banner.ts`, which is the single decision both of
 * legacy-main's matchbar writers now read. Two things are being defended:
 *
 *   1. EXPLORE IS HONEST. Map 3 has no second team, no bots, no clock and
 *      nothing to win. Before this, its HUD read "TEAM DEATHMATCH / 04:37 /
 *      AQUA 0 - 0 CORAL / MAP 3 - FIVE MINUTES - MOST KILLS WINS" and the walk
 *      ended in a DEFEAT card five minutes in.
 *   2. NO TEAM ARENA CHANGED. The function replaced two long inline
 *      conditionals, and every branch of both is reproduced here byte for
 *      byte - including the two sites' genuine disagreement about the gun
 *      range, which is now a declared input rather than a drift.
 */
import { describe, expect, it } from 'vitest';
import { ARENA_SELECTIONS, arenaSelection } from '../map-selection';
import {
  EXPLORE_MATCH_RULES,
  hudModeBanner,
  isExploreArena,
  matchModeLabel,
  type HudModeArena,
  type HudModeSite,
} from './hud-mode-banner';

const arena = (id: string): HudModeArena => arenaSelection(id);

function label(id: string, site: HudModeSite, extra: Partial<{
  domination: boolean; freeForAll: boolean; solo: boolean;
}> = {}): string {
  return matchModeLabel({
    arena: arena(id),
    site,
    domination: extra.domination ?? false,
    freeForAll: extra.freeForAll ?? false,
    solo: extra.solo ?? true,
  });
}

describe('HUD mode banner', () => {
  describe('explore arenas', () => {
    it('names the mode EXPLORE and the arena, at both HUD writers', () => {
      expect(label('map3', 'match-start')).toBe('EXPLORE · MAP 3');
      expect(label('map3', 'frame')).toBe('EXPLORE · MAP 3');
      // ...and never the words a match uses.
      for (const site of ['match-start', 'frame'] as const) {
        expect(label('map3', site)).not.toContain('DEATHMATCH');
        expect(label('map3', site)).not.toContain('FREE FOR ALL');
      }
    });

    it('hides the countdown, the scoreline and MOST KILLS WINS', () => {
      const banner = hudModeBanner({
        arena: arena('map3'), site: 'frame', domination: false, freeForAll: false, solo: true,
      });
      expect(banner.clock, 'an explore mode has no clock to run out').toBe(false);
      expect(banner.scoreline, 'no AQUA/CORAL squads exist to score').toBe(false);
      expect(banner.countdownCue, 'nothing counts in; the arena is opened, not started').toBe(false);
      expect(banner.objective).not.toBeNull();
      expect(banner.objective).not.toContain('MOST KILLS WINS');
      expect(banner.objective).not.toContain('MINUTE');
      expect(banner.objective).toContain('EXPLORE');
      // The route back to the menu has to be ON the HUD, not folklore.
      expect(banner.objective).toContain('ESC');
      expect(banner.pauseHint).toContain('MENU');
      expect(banner.pauseHint).toContain('ESC');
    });

    it('never calls a bot-less walk a bot skirmish', () => {
      const banner = hudModeBanner({
        arena: arena('map3'), site: 'match-start', domination: false, freeForAll: false, solo: true,
      });
      expect(banner.connection).toBe('SOLO EXPLORE');
    });

    it('outranks domination and free-for-all, which cannot apply to it', () => {
      expect(label('map3', 'frame', { domination: true })).toBe('EXPLORE · MAP 3');
      expect(label('map3', 'frame', { freeForAll: true })).toBe('EXPLORE · MAP 3');
    });

    it('runs no clock and no score limit, so no match can end or be won', () => {
      expect(EXPLORE_MATCH_RULES).toEqual({ durationMs: null, scoreLimit: null });
    });

    it('reads the registry KIND rather than an id list', () => {
      // A second explore arena added tomorrow gets the honest HUD for free,
      // and a team arena that quietly acquired the kind fails here.
      const explore = ARENA_SELECTIONS.filter((entry) => entry.kind === 'explore');
      expect(explore.map((entry) => entry.id)).toEqual(['map3']);
      for (const entry of ARENA_SELECTIONS) {
        expect(isExploreArena(entry), entry.id).toBe(entry.kind === 'explore');
      }
      // The label follows displayName, not a hardcoded string.
      expect(label('map3', 'frame')).toBe(`EXPLORE · ${arenaSelection('map3').displayName.toUpperCase()}`);
    });
  });

  describe('team arenas keep exactly the HUD they had', () => {
    it('reproduces the match-start writer for every id', () => {
      expect(label('atomic-acres', 'match-start')).toBe('TEAM DEATHMATCH');
      expect(label('skyline-terminal', 'match-start')).toBe('TEAM DEATHMATCH');
      expect(label('farcrysis', 'match-start')).toBe('TEAM DEATHMATCH');
      expect(label('high-seas', 'match-start')).toBe('TEAM DEATHMATCH');
      expect(label('test1', 'match-start')).toBe('TEAM DEATHMATCH');
      expect(label('test2', 'match-start')).toBe('TEAM DEATHMATCH');
      expect(label('gun-range', 'match-start')).toBe('SCORE PRACTICE');
      expect(label('rustworks-1v1', 'match-start', { solo: true })).toBe('RUSTRIG DUEL');
      expect(label('rustworks-1v1', 'match-start', { solo: false })).toBe('RUSTRIG MATCH');
      expect(label('atomic-acres', 'match-start', { domination: true })).toBe('DOMINATION');
      // The match-start writer never consulted the FFA flag, and still does not.
      expect(label('atomic-acres', 'match-start', { freeForAll: true })).toBe('TEAM DEATHMATCH');
    });

    it('reproduces the per-frame writer for every id', () => {
      expect(label('atomic-acres', 'frame')).toBe('TEAM DEATHMATCH');
      // The two sites disagree about the gun range, and always have. That is
      // declared here instead of being two drifting copies of a conditional.
      expect(label('gun-range', 'frame')).toBe('TARGET DRILL');
      // RustRig has no special word at the frame site, and did not before.
      expect(label('rustworks-1v1', 'frame', { solo: true })).toBe('TEAM DEATHMATCH');
      expect(label('atomic-acres', 'frame', { freeForAll: true })).toBe('FREE FOR ALL');
      expect(label('atomic-acres', 'frame', { domination: true, freeForAll: true })).toBe('DOMINATION');
      expect(label('gun-range', 'frame', { freeForAll: true })).toBe('FREE FOR ALL');
    });

    it('keeps the clock, the scoreline and the presentation objective', () => {
      for (const entry of ARENA_SELECTIONS.filter((row) => row.kind === 'team')) {
        for (const site of ['match-start', 'frame'] as const) {
          const banner = hudModeBanner({
            arena: entry, site, domination: false, freeForAll: false, solo: true,
          });
          expect(banner.clock, entry.id).toBe(true);
          expect(banner.scoreline, entry.id).toBe(true);
          expect(banner.objective, entry.id).toBeNull();
          expect(banner.connection, entry.id).toBeNull();
          expect(banner.countdownCue, entry.id).toBe(true);
          expect(banner.pauseHint, entry.id).toBe('ESC · MENU');
        }
      }
    });
  });
});
