import { publishLightShafts, type ParticleLightShaft } from './light-shaft-registry';

/**
 * The four window shafts of `atomic-acres-rebuild`.
 *
 * WHY THIS EXISTS. The shaft machinery has been live and unused on this arena.
 * `ParticleRuntime.adoptPublishedLightShafts()` subscribes every frame, the
 * arena authors `shaftResponse: 0.55`, and the registry held nothing for this id
 * — so the motes never knew where the light was. Exactly the failure
 * `farcrysis-atmosphere.ts` records against itself: the cones were authored,
 * published through a function imported by nothing but its own test, and
 * `particles.lightShafts` read 0 on every arena.
 *
 * It was ALSO structurally inert until today, and that is worth recording
 * because it would have hidden this work. The brightening is
 * `alpha = min(ceiling, alpha * (1 + response * boost))`, so whenever an arena
 * authors its motes AT the family opacity ceiling the clamp binds before the
 * multiply and the shafts change nothing. This arena sat at exactly that point
 * (0.11 == 0.11). The ambient presence floor added earlier today is what opened
 * the headroom: a typical mote now renders at ~0.64 of peak, so a 0.55 response
 * lifts it 0.070 -> 0.109 under the same ceiling.
 *
 * GEOMETRY, derived from the arena rather than placed by eye. `dressWindow` is
 * called as `(…, 'z', planeZ, house.cx + dx, DRESS_WIN_W, true)` and puts the
 * pane centre at `[along + offset, (SILL + HEAD) / 2, plane]`; `centred()` then
 * multiplies plan coordinates by ATOMIC_ACRES_REBUILD_SPREAD (1.6), while y is
 * never spread. With DRESS_SILL_Y 0.95, DRESS_HEAD_Y 2.35, DRESS_WIN_OFFSETS
 * [-1.8, 1.8], REBUILD_SHELL_WALL_T 0.3 and the house table (west cx -13.5
 * cz 1.5 d 6.0; east cx 13.5 cz -1.5 d 6.4) that gives, in world metres:
 *
 *   west  north plane z = (1.5 + 3.0 - 0.15) * 1.6 = 6.96, x = -24.48 / -18.72
 *   east  north plane z = (-1.5 + 3.2 - 0.15) * 1.6 = 2.48, x =  18.72 /  24.48
 *   pane centre height  = (0.95 + 2.35) / 2 = 1.65
 *
 * ONLY THE NORTH ELEVATIONS. The sun stands at [-30.9, 45.7, 53.5], i.e. on the
 * +z side, so light enters through the +z faces and travels in -z. The south
 * elevations face away and a shaft there would brighten dust the sun never
 * reaches — the same class of mistake as lighting a shadow.
 *
 * RADIUS. The aperture is 2.816 m wide (2 * 1.408) by 1.4 m tall, and the shaft
 * test is a CYLINDER, so a single radius cannot be both. 0.9 m is chosen under
 * the half-height (0.7) rather than over the half-width: too wide would brighten
 * dust outside the beam, which reads as fog, whereas too narrow merely
 * under-sells a real beam. Under-selling is the safer error in a competitive map.
 *
 * KNOWN LIMITATION, not hidden: the shaft test is an INFINITE cylinder, not a
 * cone or a segment. Each of these therefore also brightens motes on the
 * extended line outside the house. With the axis pitched down at ~36 degrees
 * that line meets the ground within a few metres of the wall, so the outdoor
 * reach is short — but it is not zero, and it is the first thing to check in a
 * capture of the street stations.
 */

/** Unit direction light TRAVELS: the negated, normalised sun position. */
const SUN_TRAVEL = Object.freeze({ x: 0.4020, y: -0.5947, z: -0.6962 });

/** Pane centre height, `(DRESS_SILL_Y + DRESS_HEAD_Y) / 2`. */
const PANE_Y = 1.65;

/** Metres along the beam to push the origin inboard of the glass. */
const INBOARD_M = 0.6;

const NORTH_WINDOWS: ReadonlyArray<readonly [x: number, z: number]> = Object.freeze([
  [-24.48, 6.96],
  [-18.72, 6.96],
  [18.72, 2.48],
  [24.48, 2.48],
]);

function shaftAt(x: number, z: number): ParticleLightShaft {
  return Object.freeze({
    x: x + SUN_TRAVEL.x * INBOARD_M,
    y: PANE_Y + SUN_TRAVEL.y * INBOARD_M,
    z: z + SUN_TRAVEL.z * INBOARD_M,
    axisX: SUN_TRAVEL.x,
    axisY: SUN_TRAVEL.y,
    axisZ: SUN_TRAVEL.z,
    radiusM: 0.9,
  });
}

export const ATOMIC_ACRES_REBUILD_SHAFTS: readonly ParticleLightShaft[] = Object.freeze(
  NORTH_WINDOWS.map(([x, z]) => shaftAt(x, z)),
);

/** Register this arena's shafts with the runtime's subscription registry. */
export function publishAtomicAcresRebuildShafts(): void {
  publishLightShafts('atomic-acres-rebuild', ATOMIC_ACRES_REBUILD_SHAFTS);
}
