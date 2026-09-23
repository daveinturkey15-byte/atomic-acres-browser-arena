// MP-LAB: the one place the host+guest harness learns which arenas to sweep.
//
// Derived from the real registry module (src/map-selection.ts), never a
// hand-kept list: a second roster is exactly the "hardcoded gate roster" that
// let green gates skip the newest arenas (AKP gotcha, 2026-08-31). Run under
// tsx; the harness spawns it and reads the JSON on stdout.
import { SELECTABLE_ARENAS } from '../../../src/map-selection';
import {
  NUKETOWN2_HOUSE_STAIR,
  NUKETOWN2_STAIRWELL,
} from '../../../src/nuketown2-arena';
import {
  NUKETOWN2_HOUSE_LAYOUT,
  nuketown2HandedX,
} from '../../../src/nuketown2-layout';

export type MultiplayerArenaRow = Readonly<{ id: string; displayName: string; routeId: string }>;

export function multiplayerArenaRoster(): MultiplayerArenaRow[] {
  return SELECTABLE_ARENAS
    .filter((entry) => entry.multiplayer)
    .map((entry) => ({ id: entry.id, displayName: entry.displayName, routeId: entry.routeId }));
}

export type MultiplayerArenaStair = Readonly<{
  arenaId: string;
  team: 0 | 1;
  houseId: string;
  foot: readonly [number, number, number];
  top: readonly [number, number, number];
  uphill: readonly [number, number, number];
  run: number;
}>;

/** Read the stair probe from the same exported geometry the arena builder uses. */
export function multiplayerArenaStair(arenaId: string, team: 0 | 1 = 0): MultiplayerArenaStair | null {
  if (arenaId !== 'nuketown2') return null;
  const authoredX = NUKETOWN2_HOUSE_STAIR.x0 + NUKETOWN2_HOUSE_STAIR.width / 2;
  const authoredFootZ = NUKETOWN2_STAIRWELL.rampStartZ;
  const authoredTopZ = NUKETOWN2_STAIRWELL.rampEndZ;
  const partner = team === 0 ? 1 : -1;
  const worldX = nuketown2HandedX(partner * authoredX);
  const footZ = partner * authoredFootZ;
  const topZ = partner * authoredTopZ;
  return {
    arenaId,
    team,
    houseId: NUKETOWN2_HOUSE_LAYOUT[team]?.id ?? `team-${team}`,
    foot: [worldX, NUKETOWN2_STAIRWELL.rampBottomY, footZ],
    top: [worldX, NUKETOWN2_STAIRWELL.rampTopY, topZ],
    uphill: [0, 0, partner],
    run: NUKETOWN2_STAIRWELL.rampRun,
  };
}

if (process.argv.includes('--print')) {
  process.stdout.write(`${JSON.stringify(multiplayerArenaRoster())}\n`);
}

const stairIndex = process.argv.indexOf('--stair');
if (stairIndex >= 0) {
  const arenaId = process.argv[stairIndex + 1] ?? '';
  const teamValue = Number(process.argv[stairIndex + 2] ?? 0);
  const team = teamValue === 1 ? 1 : 0;
  process.stdout.write(`${JSON.stringify(multiplayerArenaStair(arenaId, team))}\n`);
}
