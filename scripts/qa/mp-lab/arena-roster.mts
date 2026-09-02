// MP-LAB: the one place the host+guest harness learns which arenas to sweep.
//
// Derived from the real registry module (src/map-selection.ts), never a
// hand-kept list: a second roster is exactly the "hardcoded gate roster" that
// let green gates skip the newest arenas (AKP gotcha, 2026-08-31). Run under
// tsx; the harness spawns it and reads the JSON on stdout.
import { SELECTABLE_ARENAS } from '../../../src/map-selection';

export type MultiplayerArenaRow = Readonly<{ id: string; displayName: string; routeId: string }>;

export function multiplayerArenaRoster(): MultiplayerArenaRow[] {
  return SELECTABLE_ARENAS
    .filter((entry) => entry.multiplayer)
    .map((entry) => ({ id: entry.id, displayName: entry.displayName, routeId: entry.routeId }));
}

if (process.argv.includes('--print')) {
  process.stdout.write(`${JSON.stringify(multiplayerArenaRoster())}\n`);
}
