// HF-411 / PASS 85: Rapier traversal probe for elevated walkable surfaces.
//
// The walkable-surface audit (walkable-surface-parity-core.ts) is a GEOMETRIC
// question: is there a collider under this visual? This module asks the
// EXPERIENTIAL one through the shipped controller: put the player on the
// surface and see whether they stay on it.
//
// It exists because the owner's report is experiential ("you go to run onto a
// metal fence layed as a floor ... and you fall through it") and because a
// geometric audit can be satisfied by a collider the character controller
// still cannot stand on - a collider too thin to catch a fall, one whose top
// is inside the visual, one the capsule slides off.
//
// It runs under vitest (src/test1-roof-traversal.test.ts), which is also where
// the before/after evidence payload is written from - see the runner note on
// collectRoofTraversalEvidence at the bottom of this file.
import { CHARACTER_PHYSICS_CONFIG, CharacterPhysics, STANCE_SHAPES } from '../../src/physics';
import type { Stance } from '../../src/gameplay';
import type { ArenaMap } from '../../src/map';
import { installHeadlessArenaShims, round } from './collider-visual-parity-core';
import type { WalkableSurface } from './walkable-surface-parity-core';

/** Surfaces at or above this are "roof level" on Test1: container tops and up. */
export const ROOF_LEVEL_MIN_Y_M = 2.4;
/** Probe points are pulled this far in from an edge, so the capsule fits. */
export const EDGE_INSET_M = 0.45;
/** Feet start this far above the surface: a real step onto it, not a spawn inside it. */
export const DROP_START_M = 0.05;
/** Simulated hold time, matching the brief's "sample y over 2 s". */
export const HOLD_SECONDS = 2;
export const SIMULATION_DT = 1 / 120;
/**
 * A drop larger than this is a fall-through, not a step down. autostepHeight is
 * 0.42 m and snapToGround is 0.24 m, so 0.5 m cannot be produced by any legal
 * surface transition; the shortest real fall on Test1 is 2.6 m to the hardpan.
 */
export const FALL_THROUGH_DROP_M = 0.5;

/**
 * Order matters, and getting it wrong crashes the WASM, not the JS.
 *
 * Symptom  -> `RuntimeError: unreachable` inside `world.step()` on EVERY
 *             arena, followed by "attempted to take ownership of Rust value
 *             while it was borrowed" from the `dispose()` that cleans up
 *             after it. Reproducible headless, never in the browser.
 * Cause    -> `installHeadlessArenaShims()` defines `globalThis.window`, and
 *             `@dimforge/rapier3d-compat` binds an internal path the first
 *             time a world steps. With `window` present in Node it binds the
 *             browser path and every step panics. MEASURED 2026-09-02:
 *             `globalThis.window = { location: { search: '' } }` alone is
 *             enough; `await RAPIER.init()` beforehand does NOT prevent it,
 *             because init is not where the choice is made.
 * Correct  -> step one throwaway world while the environment still looks like
 *             Node, THEN install the arena shims. Once a world has stepped,
 *             every later world in the process is fine.
 * Verify   -> `src/test1-roof-traversal.test.ts` builds Test1 through the full
 *             arena-factory path (which needs the shims) and steps the shipped
 *             controller on it; it fails outright if this warm-up regresses.
 */
export async function prepareHeadlessArenaPhysics(): Promise<void> {
  const warm = await CharacterPhysics.create([], { minX: -4, maxX: 4, minZ: -4, maxZ: 4 });
  warm.teleportEye({ x: 0, y: 2, z: 0 });
  for (let index = 0; index < 10; index += 1) warm.move({ x: 0, y: -0.01, z: 0 }, SIMULATION_DT);
  warm.dispose();
  installHeadlessArenaShims();
}

export type ProbePoint = {
  id: string;
  x: number;
  z: number;
  topY: number;
};

export type DropResult = {
  surface: string;
  point: string;
  stance: Stance;
  x: number;
  z: number;
  startFeetY: number;
  endFeetY: number;
  minFeetY: number;
  dropM: number;
  grounded: boolean;
  fellThrough: boolean;
};

export type WalkResult = {
  surface: string;
  stance: Stance;
  from: [number, number];
  to: [number, number];
  startFeetY: number;
  endFeetY: number;
  minFeetY: number;
  maxDropM: number;
  fellThrough: boolean;
  /** Horizontal distance still to run when the walk ended. */
  remainingM: number;
};

function eyeHeight(stance: Stance): number {
  const shape = STANCE_SHAPES[stance];
  return shape.halfHeight + shape.radius + shape.eyeFromCenter;
}

/** Roof-level surfaces of one audit result, tallest first. */
export function roofLevelSurfaces(
  surfaces: readonly WalkableSurface[],
  minTopY = ROOF_LEVEL_MIN_Y_M,
): WalkableSurface[] {
  return surfaces.filter((surface) => surface.topY >= minTopY);
}

/**
 * Nine probe points per surface: the centre, four edge midpoints and four
 * corners, each pulled EDGE_INSET_M inside the top face. The EDGES are the
 * point of the exercise - "sometimes" is what an edge gap feels like - so a
 * centre-only probe would have passed the HF-411 net on its supported strip.
 */
export function probePoints(surface: WalkableSurface): ProbePoint[] {
  const [a, b, c, d] = surface.quad;
  const at = (u: number, v: number): [number, number, number] => [
    a[0] * (1 - u) * (1 - v) + b[0] * u * (1 - v) + c[0] * u * v + d[0] * (1 - u) * v,
    a[1] * (1 - u) * (1 - v) + b[1] * u * (1 - v) + c[1] * u * v + d[1] * (1 - u) * v,
    a[2] * (1 - u) * (1 - v) + b[2] * u * (1 - v) + c[2] * u * v + d[2] * (1 - u) * v,
  ];
  const spanU = Math.hypot(b[0] - a[0], b[2] - a[2]);
  const spanV = Math.hypot(d[0] - a[0], d[2] - a[2]);
  const insetU = Math.min(0.45, spanU > 0 ? EDGE_INSET_M / spanU : 0.45);
  const insetV = Math.min(0.45, spanV > 0 ? EDGE_INSET_M / spanV : 0.45);
  const lo = { u: insetU, v: insetV };
  const hi = { u: 1 - insetU, v: 1 - insetV };
  const mid = { u: 0.5, v: 0.5 };
  const grid: Array<[string, number, number]> = [
    ['centre', mid.u, mid.v],
    ['edge-u0', lo.u, mid.v],
    ['edge-u1', hi.u, mid.v],
    ['edge-v0', mid.u, lo.v],
    ['edge-v1', mid.u, hi.v],
    ['corner-00', lo.u, lo.v],
    ['corner-10', hi.u, lo.v],
    ['corner-11', hi.u, hi.v],
    ['corner-01', lo.u, hi.v],
  ];
  return grid.map(([id, u, v]) => {
    const [x, y, z] = at(u, v);
    return { id, x, z, topY: y };
  });
}

/** Falls under gravity for `seconds`, exactly the way the game integrates it. */
function settle(physics: CharacterPhysics, seconds: number, step: { x: number; z: number } = { x: 0, z: 0 }): {
  minFeetY: number;
  endFeetY: number;
  grounded: boolean;
  remaining: number;
} {
  const steps = Math.round(seconds / SIMULATION_DT);
  const stance = physics.currentStance();
  const feetOffset = eyeHeight(stance);
  let velocityY = 0;
  let minFeetY = Infinity;
  let grounded = false;
  let travelled = 0;
  const target = Math.hypot(step.x, step.z);
  for (let index = 0; index < steps; index += 1) {
    velocityY += CHARACTER_PHYSICS_CONFIG.gravity * SIMULATION_DT;
    const remaining = Math.max(0, target - travelled);
    const advance = Math.min(0.034, remaining);
    const result = physics.move({
      x: target > 0 ? (step.x / target) * advance : 0,
      y: velocityY * SIMULATION_DT,
      z: target > 0 ? (step.z / target) * advance : 0,
    }, SIMULATION_DT);
    travelled += Math.hypot(result.appliedDelta.x, result.appliedDelta.z);
    grounded = result.grounded;
    if (grounded && velocityY < 0) velocityY = 0;
    minFeetY = Math.min(minFeetY, result.position.y - feetOffset);
  }
  return {
    minFeetY,
    endFeetY: physics.eyePosition().y - feetOffset,
    grounded,
    remaining: Math.max(0, target - travelled),
  };
}

/**
 * Stands the player on each probe point of each surface and holds for
 * HOLD_SECONDS. A drop beyond FALL_THROUGH_DROP_M is the defect.
 */
export async function probeSurfaceDrops(
  map: Pick<ArenaMap, 'physicsColliders' | 'bounds' | 'physicsSafetyFloorY'>,
  surfaces: readonly WalkableSurface[],
  stances: readonly Stance[] = ['stand', 'crouch'],
): Promise<DropResult[]> {
  const results: DropResult[] = [];
  const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
  let probeFailed = false;
  try {
    for (const stance of stances) {
      if (!physics.setStance(stance)) throw new Error(`could not enter ${stance}`);
      const feetOffset = eyeHeight(stance);
      for (const surface of surfaces) {
        for (const point of probePoints(surface)) {
          const startFeetY = point.topY + DROP_START_M;
          physics.teleportEye({ x: point.x, y: startFeetY + feetOffset, z: point.z });
          const settled = settle(physics, HOLD_SECONDS);
          const dropM = startFeetY - settled.endFeetY;
          results.push({
            surface: surface.name,
            point: point.id,
            stance,
            x: round(point.x),
            z: round(point.z),
            startFeetY: round(startFeetY),
            endFeetY: round(settled.endFeetY),
            minFeetY: round(settled.minFeetY),
            dropM: round(dropM),
            grounded: settled.grounded,
            fellThrough: dropM > FALL_THROUGH_DROP_M,
          });
        }
      }
    }
  } catch (error) {
    // A Rapier panic leaves the world un-freeable, and a throwing dispose() in
    // `finally` REPLACES the real error with "attempted to take ownership of
    // Rust value while it was borrowed". Never let cleanup hide the cause.
    probeFailed = true;
    throw error;
  } finally {
    try {
      physics.dispose();
    } catch (disposeError) {
      if (!probeFailed) throw disposeError;
    }
  }
  return results;
}

/**
 * Walks the player from one edge of each surface to the opposite edge along
 * both axes. This is the owner's actual verb - "you go to RUN onto" it - and
 * it catches a hole a static drop probe can straddle.
 */
export async function probeSurfaceWalks(
  map: Pick<ArenaMap, 'physicsColliders' | 'bounds' | 'physicsSafetyFloorY'>,
  surfaces: readonly WalkableSurface[],
  stances: readonly Stance[] = ['stand', 'crouch'],
): Promise<WalkResult[]> {
  const results: WalkResult[] = [];
  const physics = await CharacterPhysics.create(map.physicsColliders, map.bounds, map.physicsSafetyFloorY);
  let probeFailed = false;
  try {
    for (const stance of stances) {
      if (!physics.setStance(stance)) throw new Error(`could not enter ${stance}`);
      const feetOffset = eyeHeight(stance);
      for (const surface of surfaces) {
        const points = probePoints(surface);
        const byId = new Map(points.map((point) => [point.id, point]));
        const legs: Array<[string, string]> = [['edge-u0', 'edge-u1'], ['edge-v0', 'edge-v1']];
        for (const [fromId, toId] of legs) {
          const from = byId.get(fromId)!;
          const to = byId.get(toId)!;
          const startFeetY = from.topY + DROP_START_M;
          physics.teleportEye({ x: from.x, y: startFeetY + feetOffset, z: from.z });
          // A short settle first, so the walk starts from the surface rather
          // than from mid-air; then walk the whole leg.
          settle(physics, 0.25);
          const walked = settle(physics, HOLD_SECONDS, { x: to.x - from.x, z: to.z - from.z });
          const maxDropM = Math.max(startFeetY - walked.minFeetY, startFeetY - walked.endFeetY);
          results.push({
            surface: surface.name,
            stance,
            from: [round(from.x), round(from.z)],
            to: [round(to.x), round(to.z)],
            startFeetY: round(startFeetY),
            endFeetY: round(walked.endFeetY),
            minFeetY: round(walked.minFeetY),
            maxDropM: round(maxDropM),
            fellThrough: maxDropM > FALL_THROUGH_DROP_M,
            remainingM: round(walked.remaining),
          });
        }
      }
    }
  } catch (error) {
    // A Rapier panic leaves the world un-freeable, and a throwing dispose() in
    // `finally` REPLACES the real error with "attempted to take ownership of
    // Rust value while it was borrowed". Never let cleanup hide the cause.
    probeFailed = true;
    throw error;
  } finally {
    try {
      physics.dispose();
    } catch (disposeError) {
      if (!probeFailed) throw disposeError;
    }
  }
  return results;
}

/**
 * Builds one arena the way the game does, censuses its roof-level walkable
 * visuals, and runs both probes over all of them. The payload keeps EVERY
 * sample, so a reader can falsify any single number rather than trust a
 * summary.
 *
 * NOTE ON THE RUNNER. This must run under vitest, not `tsx`. Under tsx the
 * rapier3d-compat CJS build takes its legacy loader path in this workspace and
 * every `world.step()` panics with `RuntimeError: unreachable`, on every arena,
 * with or without the shim ordering above. That is why HF-411 ships no `tsx`
 * probe CLI: a script that cannot run is worse than no script.
 */
export async function collectRoofTraversalEvidence(arenaId: string): Promise<{
  generatedAt: string;
  arena: string;
  roofLevelMinY: number;
  summary: Record<string, unknown>;
  geometricFindings: unknown[];
  roofSurfaces: WalkableSurface[];
  clearance: Array<{ name: string; centre: [number, number, number]; minClearanceM: number; worstPoint: [number, number] }>;
  drops: DropResult[];
  walks: WalkResult[];
}> {
  await prepareHeadlessArenaPhysics();
  const [{ loadArenaFactories }, { auditWalkableSurfaces, measureRoofClearance }, THREE] = await Promise.all([
    import('./collider-visual-parity-core'),
    import('./walkable-surface-parity-core'),
    import('three'),
  ]);
  const factories = await loadArenaFactories();
  const factory = factories[arenaId];
  if (!factory) throw new Error(`unknown arena ${arenaId}`);
  const scene = new THREE.Scene();
  const built = factory.build(scene);
  const map = { ...built, id: built.id ?? arenaId } as ArenaMap;
  await factory.enrich?.(scene);

  const audit = auditWalkableSurfaces(arenaId, scene, map);
  const roof = roofLevelSurfaces(audit.surfaces ?? []);
  const drops = await probeSurfaceDrops(map, roof);
  const walks = await probeSurfaceWalks(map, roof);
  const clearance = measureRoofClearance(map, roof);
  const fellThroughDrops = drops.filter((row) => row.fellThrough);
  const fellThroughWalks = walks.filter((row) => row.fellThrough);

  return {
    generatedAt: new Date().toISOString(),
    arena: arenaId,
    roofLevelMinY: ROOF_LEVEL_MIN_Y_M,
    summary: {
      colliders: audit.colliderCount,
      walkableCensus: audit.census,
      walkableSupported: audit.supported,
      geometricFindings: (audit.findings ?? []).length,
      roofSurfaces: roof.length,
      dropSamples: drops.length,
      dropFallThroughs: fellThroughDrops.length,
      walkSamples: walks.length,
      walkFallThroughs: fellThroughWalks.length,
      minRoofClearanceM: clearance.reduce((worst, row) => Math.min(worst, row.minClearanceM), Infinity),
      surfacesWithFallThrough: [...new Set([
        ...fellThroughDrops.map((row) => row.surface),
        ...fellThroughWalks.map((row) => row.surface),
      ])].sort(),
    },
    geometricFindings: audit.findings ?? [],
    roofSurfaces: roof,
    clearance,
    drops,
    walks,
  };
}
