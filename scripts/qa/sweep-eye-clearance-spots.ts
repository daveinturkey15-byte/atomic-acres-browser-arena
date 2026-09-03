// HF-387 stage 1 (offline): generate the eye positions a wall-hugging player can
// legally occupy, per arena, from the same collider builders the fidelity tests use.
//
// Why these spots: a capsule against a FLAT wall face keeps the eye ~0.36 m out
// (stance radius), far outside the 0.08 m near plane - a straight hug cannot clip.
// The clip classes that CAN happen are (a) visual geometry protruding past its
// collider by more than radius minus near-plane margin, (b) inside corners where
// two faces crowd the eye, and (c) stance-height changes under overhangs. So the
// sweep hugs every vertical face AND every inside corner, at all three stance eye
// heights (1.7 / 1.16 / 0.61 from gameplay.ts), and stage 2 probes each eye point
// against the VISUAL shot surfaces in the running game, where (a)-(c) live.
//
// Usage:    npx tsx scripts/qa/sweep-eye-clearance-spots.ts
// Output:   artifacts/qa/eye-clearance/<arena>-spots.json
// Contract: node --test scripts/qa/eye-clearance-sweep-contract.test.mjs
//           (pins the derived roster and the legality model; run it with any
//           change to this file)

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { buildArena } from '../../src/map';
import { buildRustworks1v1, buildGunRange, buildSkylineTerminal } from '../../src/additional-maps';
import { buildHighSeas } from '../../src/high-seas';
import { buildFarcrysis } from '../../src/farcrysis';
import { buildTest1, buildTest2 } from '../../src/test-maps';
import { buildMap3, prepareMap3 } from '../../src/map3-arena';
import { buildNuketown2 } from '../../src/nuketown2-arena';
import { buildRaid2 } from '../../src/raid2-arena';
import { collidersOverlappingVerticalSpan, isBlocked, type Box2 } from '../../src/collision';
import { InteractiveWorldRuntime } from '../../src/interactive-world-runtime';
// `ShedArenaId` is re-declared, not re-exported, by destructible-shed-registry;
// importing it from there is a TS2459 that only tsx's type stripping hid.
// It is an alias of ArenaId, so the loop variable already satisfies it and the
// casts this file used to carry are gone.
import { shedPlacementsForArena } from '../../src/destructible-shed-registry';
import {
  createGunRangeTestBayDoorState,
  gunRangeTestBayDoorDynamicColliders,
} from '../../src/gun-range-test-bay';
import { ARENA_IDS, type ArenaId } from '../../src/arena-identity';
import { SELECTABLE_ARENAS } from '../../src/map-selection';

const STANCES = [
  { stance: 'stand', eye: 1.7, radius: 0.38 },
  { stance: 'crouch', eye: 1.16, radius: 0.36 },
  { stance: 'prone', eye: 0.61, radius: 0.36 },
] as const;

const HUG_GAP = 0.02;         // capsule face-to-wall gap for the closest legal hug
const FACE_STEP = 0.75;       // sample cadence along each face, metres
const MAX_SPOTS_PER_ARENA = 4000;

/**
 * A collider whose top is at or below the feet plane is the floor you are
 * standing on, not an obstacle. Anything at or under this height is filtered
 * out of a stance's collider view before legality is asked, exactly as the live
 * bot path does with `collidersOverlappingVerticalSpan(_, feetY, feetY + 1.7)`.
 */
const FLOOR_EPSILON = 0.01;

/**
 * HOW LEGALITY IS ASKED, and why it changed (owner 2026-08-30).
 *
 * `isBlocked` treats the point it is given as the TOP of a 1.65 m capsule - see
 * its `point.y - 1.65 > box.maxY` early-out, and legacy-main.ts:19511, where the
 * live bot mover probes at `bot.position.y + botCapsuleHeight` (1.7, which is
 * exactly the standing eye height in the table above). This sweep used to probe
 * at `groundY + 0.9`, which models a capsule spanning -0.75 .. 0.9: three
 * quarters of a metre UNDERGROUND, and topping out below a standing player's
 * chest.
 *
 * On the five arenas this script originally covered nothing is authored below
 * y = 0, so the error was invisible. test1 and test2 author their ground slabs
 * as real movement colliders (test1 a single 150 x 130 m pad at y[-1, 0];
 * test2 twenty-one paving slabs at y[-1, 0] plus a sunken sport court at
 * y[-1.35, -0.35] and a pool basin at y[-1.55, -0.55]), so the sunken probe was
 * inside the ground everywhere and EVERY position in both arenas came back
 * illegal. The sweep then emitted only the spots hugging the outside rim of the
 * ground pad itself - 2262 for test1 and 1176 for test2, of which ZERO were
 * inside the playable bounds. A roster fix alone would have produced a
 * green-looking artifact covering nothing. (Those two rim counts are the
 * historical record of the bug, not a current expectation: test2's bounds moved
 * to 100 x 76 m on 2026-08-31 and its spot count moved with them.)
 *
 * So legality is now asked the way the game asks it: per stance, filter to the
 * colliders overlapping that stance's capsule span, then probe at the capsule
 * top.
 */
function stanceColliderView(colliders: readonly Box2[], groundY: number, capsuleTop: number): readonly Box2[] {
  return collidersOverlappingVerticalSpan(colliders, groundY + FLOOR_EPSILON, groundY + capsuleTop);
}

function standingOnFloor(box: Box2, groundY: number): boolean {
  return box.maxY !== undefined && box.maxY <= groundY + FLOOR_EPSILON;
}

type Spot = {
  x: number; z: number; eyeY: number; stance: string;
  kind: 'face' | 'corner';
  facing: [number, number, number];
};

/** Per-stance collider views, indexed the same way as STANCES. */
type StanceViews = readonly (readonly Box2[])[];

function faceSpots(box: Box2, views: StanceViews, groundY: number): Spot[] {
  // Rotated boxes get corner treatment only (their faces need frame math the
  // corner pass already covers well enough for a first sweep); axis-aligned
  // boxes get the full perimeter walk.
  if (box.rotation) return [];
  const out: Spot[] = [];
  const faces: Array<{ axis: 'x' | 'z'; at: number; dir: 1 | -1; lo: number; hi: number }> = [
    { axis: 'x', at: box.minX, dir: -1, lo: box.minZ, hi: box.maxZ },
    { axis: 'x', at: box.maxX, dir: 1, lo: box.minZ, hi: box.maxZ },
    { axis: 'z', at: box.minZ, dir: -1, lo: box.minX, hi: box.maxX },
    { axis: 'z', at: box.maxZ, dir: 1, lo: box.minX, hi: box.maxX },
  ];
  for (const face of faces) {
    const span = face.hi - face.lo;
    const steps = Math.max(1, Math.round(span / FACE_STEP));
    for (let index = 0; index <= steps; index += 1) {
      const along = face.lo + (span * index) / steps;
      for (const [stanceIndex, s] of STANCES.entries()) {
        const offset = s.radius + HUG_GAP;
        const x = face.axis === 'x' ? face.at + face.dir * offset : along;
        const z = face.axis === 'z' ? face.at + face.dir * offset : along;
        // Capsule TOP, against this stance's collider view. See stanceColliderView.
        const point = { x, y: groundY + s.eye, z };
        if (isBlocked(point, views[stanceIndex]!, s.radius)) continue;
        // Face the wall: worst case for a forward-lean camera.
        const facing: [number, number, number] = face.axis === 'x'
          ? [-face.dir, 0, 0] : [0, 0, -face.dir];
        out.push({ x, z, eyeY: groundY + s.eye, stance: s.stance, kind: 'face', facing });
      }
    }
  }
  return out;
}

function cornerSpots(box: Box2, views: StanceViews, groundY: number): Spot[] {
  const out: Spot[] = [];
  const corners: Array<[number, number, number, number]> = [
    [box.minX, box.minZ, -1, -1], [box.minX, box.maxZ, -1, 1],
    [box.maxX, box.minZ, 1, -1], [box.maxX, box.maxZ, 1, 1],
  ];
  for (const [cx, cz, dx, dz] of corners) {
    for (const [stanceIndex, s] of STANCES.entries()) {
      const diag = (s.radius + HUG_GAP) / Math.SQRT2;
      const x = cx + dx * diag;
      const z = cz + dz * diag;
      if (isBlocked({ x, y: groundY + s.eye, z }, views[stanceIndex]!, s.radius)) continue;
      out.push({
        x, z, eyeY: groundY + s.eye, stance: s.stance, kind: 'corner',
        facing: [-dx / Math.SQRT2, 0, -dz / Math.SQRT2],
      });
    }
  }
  return out;
}

type ArenaBuilder = (scene: THREE.Scene) => { colliders: Box2[] };

/**
 * Every arena the game can build, keyed by its stable id.
 *
 * Owner 2026-08-30. This used to be a hand-written five-arena array, so test1
 * and test2 - both rebuilt at full scale that same day (64 x 46 m and
 * 76 x 58 m, 32852f89; test2 has since been rebuilt again at 100 x 76 m) - had
 * NO eye-clearance or traversal coverage at all,
 * and nothing said so. That is the third instance tonight of one failure mode:
 * a verifier carrying its own frozen arena roster that silently goes stale when
 * an arena is added (the menu-preview gate was 5ac48931, the cross-browser
 * matrix 144ead77). The fix is the same one those two took: the ROSTER is
 * derived from src/map-selection.ts, this table only supplies the builder for
 * an id, and `sweptArenaIds()` fails closed if the two ever disagree.
 *
 * Typed `Record<ArenaId, ...>` so adding an id to arena-identity.ts without a
 * builder here is a type error, and checked again at runtime because scripts/
 * is outside the tsconfig `include` that `tsc --noEmit` walks.
 */
export const ARENA_BUILDERS: Readonly<Record<ArenaId, ArenaBuilder>> = Object.freeze({
  'atomic-acres': buildArena,
  'skyline-terminal': buildSkylineTerminal,
  'rustworks-1v1': buildRustworks1v1,
  'gun-range': buildGunRange,
  // farcrysis became selectable (PREVIEW) on 2026-09-02, HF-423. The builder
  // was already wired up while it was hidden, exactly so that un-hiding it
  // restored its coverage in the same edit - which is what happened.
  farcrysis: buildFarcrysis,
  'high-seas': buildHighSeas,
  test1: buildTest1,
  test2: buildTest2,
  // MAP3 (owner 2026-09-02, HF-405).
  map3: buildMap3,
  // NUKETOWN2 (owner 2026-09-02, HF-407).
  nuketown2: buildNuketown2,
  // RAID2 (owner 2026-09-02, HF-408): the Raid layout rethink.
  raid2: buildRaid2,
});

/**
 * Floor on the derived roster. The derivation cannot silently collapse to an
 * empty list the way a regex-scraped one can, but an empty or truncated roster
 * would sweep nothing while printing success, so it is asserted rather than
 * assumed. 11 = every id in arena-identity.ts, nothing subtracted. map3 left
 * the roster for one day (2026-09-02, HF-409) and rejoined it when the corridor
 * showcase became the arena; the Nuke Town Rebuild (HF-407) made it 9; farcrysis
 * being un-hidden as a PREVIEW card (2026-09-02, HF-423) made it 10; the Raid
 * Rebuild (HF-408, Lane AQ, 2026-09-03) made it 11. Raise it when an arena is
 * added; never lower it to get a run green.
 * HF-429 (owner, 2026-09-03) PARKED farcrysis again, so the real
 * selectable roster is TEN and this floor follows it DOWN. Lowering a floor
 * is normally the exact move this comment forbids, so read the rule
 * precisely: the floor is an alarm on the SCRAPE collapsing, and the contract
 * test asserts it EQUALS the derived roster in both directions. A floor left
 * at 11 against a real roster of 10 does not gate harder - it reds every run
 * and gets switched off. Never lower it to get a RUN green; do lower it when
 * the roster itself legitimately shrinks, in the same commit as the registry
 * edit that shrank it.
 */
export const MINIMUM_SWEPT_ARENAS = 10;

/** The arenas this sweep must cover: every selectable arena, and nothing invented. */
export function sweptArenaIds(): ArenaId[] {
  const ids = SELECTABLE_ARENAS.map((entry) => entry.id);
  if (ids.length < MINIMUM_SWEPT_ARENAS) {
    throw new Error(
      `eye-clearance sweep: derived only ${ids.length} selectable arenas (${ids.join(', ') || 'none'}); `
      + `expected at least ${MINIMUM_SWEPT_ARENAS}. Refusing to report success on a roster that tests nothing.`,
    );
  }
  const unbuildable = ids.filter((id) => !(id in ARENA_BUILDERS));
  if (unbuildable.length > 0) {
    throw new Error(
      `eye-clearance sweep: selectable arenas with no builder: ${unbuildable.join(', ')}. `
      + 'Add them to ARENA_BUILDERS - a selectable arena with no traversal coverage is the bug this guard exists for.',
    );
  }
  const unknown = ids.filter((id) => !(ARENA_IDS as readonly string[]).includes(id));
  if (unknown.length > 0) throw new Error(`eye-clearance sweep: unknown arena ids ${unknown.join(', ')}`);
  return ids;
}

/**
 * Movement authority that no arena BUILDER emits, because it belongs to a
 * runtime fixture whose pose is state - and which stage 2 nevertheless probes.
 *
 * Lane J, 2026-09-02. 51 of the 55 red gun-range rows were this single seam.
 * The test-bay secure door leaf is authored `solid: false, shots: false`
 * (additional-maps.ts, `gun-range-test-bay-secure-door-leaf`) because its
 * authority is the DOOR STATE, not the mesh: `gunRangeTestBayDoorLeafBounds`
 * feeds BOTH `gunRangeTestBayDoorDynamicColliders` (movement) and
 * `gunRangeTestBayDoorDynamicBallisticSurfaces` (shots), and legacy-main
 * splices the latter into `activeBallisticSurfaces` for gun-range. So stage 2
 * traced against the closed leaf while stage 1's legality model could not see
 * it: the sweep emitted hug spots at x = 51.10-51.12, i.e. 0.03-0.05 m west of
 * the leaf's 51.15 face, where a 0.36-0.38 m capsule is a third of a metre
 * INSIDE the closed door. Those eyes were 0.00-0.05 m from the leaf and were
 * reported as clips no player can reach.
 *
 * The rule this encodes: whatever authority stage 2 can HIT, stage 1 must ask
 * for legality. A stage-2 surface set that is wider than stage-1's collider
 * view manufactures violations; the reverse hides them.
 *
 * The door is taken in its authored initial state (`phase: 'closed',
 * openness: 0`) because that is what a player meets on arrival and what stage 2
 * measured - the sweep never walks the approach trigger, so the leaf never
 * rises. An open leaf travels +7 m in Y, clear of every stance.
 */
export function dynamicAuthorityColliders(arenaId: ArenaId): Box2[] {
  if (arenaId !== 'gun-range') return [];
  return gunRangeTestBayDoorDynamicColliders(createGunRangeTestBayDoorState())
    .map((collider) => ({ ...collider.bounds }));
}

export function runSweep(): void {
  mkdirSync('artifacts/qa/eye-clearance', { recursive: true });
  const sweptIds = sweptArenaIds();
  console.log(
    `eye-clearance sweep: ${sweptIds.length} selectable arenas derived from src/map-selection.ts`
    + ` -> ${sweptIds.join(', ')}`,
  );
  for (const arenaId of sweptIds) {
    const arena = { id: arenaId, build: ARENA_BUILDERS[arenaId] };
    const scene = new THREE.Scene();
    const map = arena.build(scene);
    // Legality must match the LIVE game, which composes static colliders with the
    // interactive-world runtime's shed and house-fragment colliders. The first run of
    // this sweep used static only, so a spot inside a shed wall was "legal" and its
    // eye probe then hit that same wall - reported as a clip that no real player can
    // reach. Boot the runtime exactly as legacy-main does and merge its view.
    let colliders = map.colliders;
    try {
      const placements = shedPlacementsForArena(arena.id);
      const houseDefinitions = (map as unknown as {
        houseDestruction?: { definitions?: readonly unknown[] };
      }).houseDestruction?.definitions ?? [];
      const runtime = new InteractiveWorldRuntime(
        arena.id, 1, placements, true, undefined, undefined,
        houseDefinitions as never,
      );
      colliders = [...map.colliders, ...runtime.collisions().movementColliders];
    } catch {
      // Arena without interactive-world support keeps its static set.
    }
    // State-posed fixtures whose authority never reaches `map.colliders`. See
    // dynamicAuthorityColliders: stage 2 probes them, so stage 1 must too.
    const dynamicAuthority = dynamicAuthorityColliders(arena.id);
    colliders = [...colliders, ...dynamicAuthority];
    const groundY = 0;
    const views: StanceViews = STANCES.map((s) => stanceColliderView(colliders, groundY, s.eye));
    let spots: Spot[] = [];
    // A collider that yields NO legal hug spot at any stance, on any face or
    // corner, is one no player can ever stand beside: it is buried inside
    // another solid, or parked outside the reachable bounds. That is a
    // traversal signal the spot count alone hides, so it is counted per arena
    // and printed - measured, not eyeballed. Floor slabs are counted apart:
    // nobody hugs the rim of the ground, so producing no spots there is correct
    // rather than suspicious.
    let unreachableColliders = 0;
    let floorColliders = 0;
    for (const box of colliders) {
      if (standingOnFloor(box, groundY)) { floorColliders += 1; continue; }
      const before = spots.length;
      spots.push(...faceSpots(box, views, groundY));
      spots.push(...cornerSpots(box, views, groundY));
      if (spots.length === before) unreachableColliders += 1;
    }
    if (spots.length === 0) {
      throw new Error(
        `${arena.id}: sweep produced ZERO legal hug spots from ${colliders.length} colliders. `
        + 'An arena with no legally occupiable wall-adjacent position is not "clean", it is unswept.',
      );
    }
    const rawSpots = spots.length;
    if (spots.length > MAX_SPOTS_PER_ARENA) {
      // Deterministic thin: keep every Nth. Reported, never silent.
      const keep = Math.ceil(spots.length / MAX_SPOTS_PER_ARENA);
      spots = spots.filter((_, index) => index % keep === 0);
      console.log(`${arena.id}: thinned to every ${keep}th spot`);
    }
    writeFileSync(`artifacts/qa/eye-clearance/${arena.id}-spots.json`,
      JSON.stringify({
        arena: arena.id,
        colliders: colliders.length,
        floorColliders,
        dynamicAuthorityColliders: dynamicAuthority.length,
        rawSpots,
        unreachableColliders,
        spots,
      }, null, 1));
    console.log(
      `${arena.id}: ${colliders.length} colliders (${floorColliders} floor,`
      + ` ${dynamicAuthority.length} state-posed dynamic authority)`
      + ` -> ${spots.length} legal hug spots`
      + ` (${unreachableColliders} colliders with no legal adjacent stance)`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  // MAP3 (HF-409 finisher 2): buildMap3 is synchronous but its eighth corridor
  // needs a wasm module first, so it throws until prepareMap3() has resolved.
  // Stage 1 stays fully synchronous below this line.
  //
  // FINISHER 3: this is an async IIFE and NOT a top-level await. `package.json`
  // declares no `"type": "module"`, so tsx transforms this .ts file to CJS,
  // where a top-level await is a hard transform error - the stage did not run
  // at all ("Top-level await is currently not supported with the cjs output
  // format"), which is a documented usage in this file's own header. The await
  // has to live inside a function for the stage to be runnable as documented.
  void (async () => {
    await prepareMap3();
    runSweep();
  })().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
