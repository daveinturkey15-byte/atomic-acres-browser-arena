/**
 * arena-deployment-briefing.ts — HF-372.
 *
 * The deployment loading surface is the longest uninterrupted look a player gets
 * at a map before they are in it, and every arena shipped the same sentence on
 * it: "Preparing <name> authoritative arena state…". The owner's complaint about
 * Farcrysis and High Seas having no "decent loading screen" is mostly about the
 * missing backdrop — fixed by giving those two real preview media — but the copy
 * was the other half, and it was equally generic on all six maps.
 *
 * This is a leaf module on purpose: the loading surface, the menu and any future
 * spectator/replay entry point can all read the same briefing without importing
 * the arena selector registry and, with it, gameplay and bot systems.
 *
 * The copy describes what the player is about to be dropped into — terrain,
 * lanes, and the one thing that will kill them — rather than what the loader is
 * doing. The progress row already says what the loader is doing.
 */
import { ARENA_IDS, type ArenaId } from './arena-identity';

export type ArenaDeploymentBriefing = Readonly<{
  arenaId: ArenaId;
  /** Small uppercase eyebrow above the arena title. Insertion, not a sentence. */
  kicker: string;
  /** One sentence, sentence case, shown while the arena streams. */
  briefing: string;
  /** Short all-caps orientation line; pairs with the progress stage row. */
  approach: string;
}>;

const BRIEFINGS: Readonly<Record<ArenaId, ArenaDeploymentBriefing>> = Object.freeze({
  'atomic-acres': Object.freeze({
    arenaId: 'atomic-acres',
    kicker: 'SUBURBAN TEST RANGE',
    briefing: 'Two houses, one bus, and no long sightline that is safe for more than a second.',
    approach: 'HELO INBOUND · LOW PASS OVER THE CUL-DE-SAC',
  }),
  'skyline-terminal': Object.freeze({
    arenaId: 'skyline-terminal',
    kicker: 'AIRPORT CONCOURSE',
    briefing: 'Security chokes and a single narrow gangway feed an apron with nowhere to hide.',
    approach: 'HELO INBOUND · APRON APPROACH',
  }),
  'rustworks-1v1': Object.freeze({
    arenaId: 'rustworks-1v1',
    kicker: 'OFFSHORE RIG',
    briefing: 'One tower, two ladders, and a duel that ends the moment you stop moving.',
    approach: 'HELO INBOUND · ORBIT OVER THE RIG',
  }),
  'gun-range': Object.freeze({
    arenaId: 'gun-range',
    kicker: 'LIVE FIRE RANGE',
    briefing: 'No opponents, no timer pressure — just targets, recoil, and whatever you brought.',
    approach: 'RANGE WALK · DOWNRANGE AND BACK',
  }),
  // The two arenas HF-372 is actually about. Same treatment, same shape, written
  // from their own terrain rather than from a template.
  farcrysis: Object.freeze({
    arenaId: 'farcrysis',
    kicker: 'JUNGLE RESEARCH STATION',
    briefing: 'Dense canopy hides everything until it does not; the ruined core is the only hard cover worth holding.',
    approach: 'HELO INBOUND · BEACH APPROACH, ISLAND ORBIT',
  }),
  'high-seas': Object.freeze({
    arenaId: 'high-seas',
    kicker: 'SUPERYACHT UNDER WAY',
    briefing: 'Three stacked decks and open bow-to-stern lanes — height wins the fight, and below deck is where it ends.',
    approach: 'HELO INBOUND · STARBOARD PASS, STERN TO BOW',
  }),
});

/** Total, by construction: every selectable arena has authored deployment copy. */
export function arenaDeploymentBriefing(arenaId: ArenaId): ArenaDeploymentBriefing {
  return BRIEFINGS[arenaId];
}

/**
 * Guards the thing that actually regresses: a seventh arena being added without
 * copy, leaving one map back on a generic loading screen while five have one.
 */
export function assertArenaDeploymentBriefingInventory(): void {
  const configured = Object.keys(BRIEFINGS).sort();
  const expected = [...ARENA_IDS].sort();
  if (configured.length !== expected.length || configured.some((id, index) => id !== expected[index])) {
    throw new Error(`Arena deployment briefing inventory drift: configured=${configured.join(',')} arenas=${expected.join(',')}`);
  }
}

assertArenaDeploymentBriefingInventory();
