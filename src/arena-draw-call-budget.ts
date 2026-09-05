/**
 * PASS 95 - per-arena draw-call budget.
 *
 * WHAT IS COUNTED
 * ---------------
 * The draws the renderer is actually asked to submit for one camera, on the
 * owner's default Quality (`blender`) profile, AFTER the runtime static batch
 * (`batchStaticMeshes(root, root, () => '', 'preserve')`, the exact call
 * `batchSelectedArenaPresentation()` makes) and after
 * `freezeStaticArenaMatrices()`. Counted the way a renderer counts:
 *
 *   - one draw per visible mesh;
 *   - an `InstancedMesh` is ONE draw regardless of instance count;
 *   - a `THREE.LOD` is ONE draw, at the level the review station selects;
 *   - meshes the batcher left `visible = false` are NOT counted. Counting the
 *     hidden batch sources is how a "batching saved N draws" claim gets
 *     silently reversed.
 *
 * WHY A BUDGET AND NOT A FRAME-TIME ASSERTION
 * -------------------------------------------
 * Frame time on this machine is shared with ComfyUI and ~15 other lanes, so a
 * millisecond threshold in a unit test is noise. The submitted draw count is a
 * deterministic property of the arena graph: it changes only when someone adds
 * geometry, splits a material, or breaks batching. That is exactly the class of
 * regression this ratchet exists to catch, and it catches it in 8 seconds with
 * no browser.
 *
 * THE HEADROOM RULE, AND WHY IT IS NOT NEGOTIABLE DOWNWARD
 * --------------------------------------------------------
 * Each budget is `measured + max(10, ceil(measured * 0.15))`, rounded up to a
 * multiple of five. Ten draws is the smallest addition a real authoring change
 * makes (a prop with its own material); 15 % is the ceiling the Nuke Town
 * frame-loop audit already uses. Both are deliberately generous, because the
 * point of this file is to fail on a 3x regression, not to police a prop.
 *
 * A BUDGET IS RAISED ONLY BY THE MEASUREMENT, NEVER BY THE FAILURE. If a change
 * pushes an arena over, the fix is to merge, instance, share a material or
 * freeze - not to edit the number here. Raising a row requires a fresh
 * `npx tsx scripts/qa/audit-arena-draw-calls.mts` measurement recorded in
 * `docs/evidence/` and an owner-visible reason in the commit.
 *
 * THE ROSTER IS DERIVED, NOT LISTED
 * ---------------------------------
 * `ARENA_IDS` is the registry. A hand-written roster in a verifier is this
 * repository's most reliable way to ship a green gate that is not looking at
 * the game - it has happened at least three times (see
 * `scripts/qa/arena-roster.mjs`). So the budget table is checked FOR
 * COMPLETENESS against the registry, and a new arena fails this gate until it
 * is measured and given a row.
 */
import * as THREE from 'three';
import { ARENA_IDS, type ArenaId } from './arena-identity';

/**
 * Arenas this gate does not build, with the reason. `map3` is the registry's
 * only lazy arena: its builder initialises the Rapier wasm through
 * `prepareMap3()`, which is a browser-side asynchronous step, so it is measured
 * by the browser harness rather than by this synchronous gate.
 */
export const DRAW_CALL_BUDGET_EXEMPT: Readonly<Record<string, string>> = Object.freeze({
  map3: 'lazy arena; its builder needs the Rapier wasm prepared asynchronously (arena-factory-registry.ts)',
});

/**
 * Measured submitted draws on `contrib/dave-gaming-pc/claude/pass93-candidate`
 * @ 452d7aba, plus the headroom rule above. `measured` is evidence and must be
 * updated from a rerun; `budget` is the assertion.
 */
export const ARENA_DRAW_CALL_BUDGETS: Readonly<Record<string, { measured: number; budget: number }>> =
  Object.freeze({
    nuketown2: { measured: 95, budget: 110 },
    raid2: { measured: 10, budget: 20 },
    'atomic-acres': { measured: 53, budget: 65 },
    'skyline-terminal': { measured: 57, budget: 70 },
    'rustworks-1v1': { measured: 19, budget: 30 },
    'gun-range': { measured: 141, budget: 165 },
    farcrysis: { measured: 182, budget: 210 },
    'high-seas': { measured: 42, budget: 55 },
    test1: { measured: 24, budget: 35 },
    test2: { measured: 30, budget: 40 },
  });

/** The headroom rule, executable, so the table cannot drift from its own rule. */
export function drawCallBudgetFor(measured: number): number {
  const headroom = Math.max(10, Math.ceil(measured * 0.15));
  return Math.ceil((measured + headroom) / 5) * 5;
}

/** Registry arenas that this gate must carry a budget row for. */
export function budgetedArenaIds(): ArenaId[] {
  return ARENA_IDS.filter((id) => !(id in DRAW_CALL_BUDGET_EXEMPT));
}

/**
 * Count submitted draws for one already-built, already-batched arena root.
 * `station` is the review camera position used for LOD level selection.
 */
export function countSubmittedDraws(root: THREE.Object3D, station: THREE.Vector3): number {
  root.updateMatrixWorld(true);
  const world = new THREE.Vector3();
  let draws = 0;
  const visit = (node: THREE.Object3D): void => {
    if (node.visible === false) return;
    const lod = node as THREE.LOD;
    if (lod.isLOD === true) {
      lod.getWorldPosition(world);
      const distance = world.distanceTo(station);
      let chosen = lod.levels[0]?.object;
      for (const level of lod.levels) {
        if (distance >= level.distance) chosen = level.object;
      }
      if (chosen) draws += 1;
      return; // an LOD's other levels are never submitted
    }
    if ((node as THREE.Mesh).isMesh === true) draws += 1;
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return draws;
}

/** Review stations, one per arena: eye height over the arena's own origin. */
export const ARENA_REVIEW_STATIONS: Readonly<Record<string, readonly [number, number, number]>> =
  Object.freeze({
    nuketown2: [0, 1.7, 0],
    raid2: [0, 1.7, 0],
    'atomic-acres': [0, 1.7, 0],
    'skyline-terminal': [0, 1.7, 0],
    'rustworks-1v1': [0, 1.7, 0],
    'gun-range': [0, 1.7, 0],
    farcrysis: [0, 1.7, 0],
    'high-seas': [0, 1.7, 0],
    test1: [0, 1.7, 0],
    test2: [0, 1.7, 0],
  });

export function arenaReviewStation(id: string): THREE.Vector3 {
  const station = ARENA_REVIEW_STATIONS[id] ?? [0, 1.7, 0];
  return new THREE.Vector3(station[0], station[1], station[2]);
}
