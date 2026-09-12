/**
 * nuketown2-verge-edge.ts — HF-536 night-muse-verge: turf-to-kerb transitions.
 *
 * Critic gap #4 (interim-3, nuketown2-front-porch): "roadside and yard
 * turf-kerb transitions remain abrupt, lacking dandelion/clover clusters and
 * organic verge bloom."
 *
 * Three presentation-only InstancedMeshes (three draws, zero new samplers):
 *   1. soil/grit strip along every lawn-meeting kerb line and driveway edge
 *      (the arena's own soil/mulch role: `m.planter`), 0.12 m wide with a
 *      jittered inner edge (quantised hash per 0.3 m cell), relief 0.02 m;
 *   2. clover/dandelion card clusters on the EXISTING leaf-atlas singleton
 *      (one sampler, the same texture object the hedge cards use);
 *   3. one unmown edge-grass field: a denser, shorter kerb band plus a taller
 *      (x1.3) warmer outer band, as a single region/single draw.
 *
 * No collider, no raycast mesh, no shot surface, no `nuketown2Prop`, and no
 * name containing ' verge ' — so the PROPS/verge-body ratchets in
 * nuketown2-fidelity.test.ts cannot see any of this (verified in the test).
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import {
  float,
  floor,
  fract,
  instanceIndex,
  mix,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import type { Box2 } from './collision';
import { streetSignPropPlacements } from './forge-kit';
import {
  NUKETOWN2_BOUNDS,
  NUKETOWN2_CARRIAGEWAY_FOOTPRINTS,
  NUKETOWN2_CUL_DE_SAC,
  NUKETOWN2_HOUSE_FRONT_Z,
  NUKETOWN2_LAMP_POST_LAYOUT,
  NUKETOWN2_STREET_HALF_WIDTH,
  nuketown2HandedSpan,
  nuketown2HandedX,
} from './nuketown2-layout';
import {
  NUKETOWN2_DOORWAYS,
  NUKETOWN2_GROUND_DRESSING as ARENA_GROUND_DRESSING,
} from './nuketown2-arena';
import {
  NUKETOWN2_LAWN_TINT,
  NUKETOWN_LAWN_BLADE_HEIGHT_M,
} from './nuketown-lawn-field';
import {
  buildInstancedGrassField,
  type GrassClumpTint,
  type InstancedGrassField,
} from './rendering/instanced-grass-field';
import {
  LEAF_ALPHA_TEST,
  LEAF_ATLAS_CELLS,
  leafSprigGeometry,
  nuketown2LeafAtlas,
} from './nuketown2-vegetation';

// ---------------------------------------------------------------------------
// Constants (the brief's numbers, each pinned by the lane test)
// ---------------------------------------------------------------------------

/** Placement stream — decorrelated from the lawn, clover and bloom seeds. */
export const NUKETOWN2_VERGE_EDGE_SEED = 0x2e46_0103;
/** Strip width at the kerb line, before the jittered inner edge. */
export const VERGE_STRIP_WIDTH_M = 0.12;
/** Strip relief above the lawn plate top. */
export const VERGE_STRIP_RELIEF_M = 0.02;
/** Strip cell pitch — the jitter quantisation cell (R-003). */
export const VERGE_STRIP_CELL_M = 0.3;
/** Jitter amplitude band on the inner edge. */
export const VERGE_STRIP_JITTER_MIN_M = 0.02;
export const VERGE_STRIP_JITTER_MAX_M = 0.08;
/** Outer edge stands this far off the kerb face so the two never share a plane. */
export const VERGE_STRIP_KERB_INSET_M = 0.01;
/** Lawn plate top: dressing boxes centre y=-0.05, height 0.14. */
export const VERGE_EDGE_LAWN_TOP_Y = 0.02;
/** Cluster counts per verge side. */
export const VERGE_CLUSTER_TARGET_PER_SIDE = 60;
export const VERGE_CLUSTER_MIN_PER_SIDE = 40;
export const VERGE_CLUSTER_MAX_PER_SIDE = 80;
/** How far off the kerb a cluster may stand. */
export const VERGE_CLUSTER_KERB_BAND_M = 0.6;
/** Clearance from pads and doorway walks. */
export const VERGE_CLUSTER_CLEAR_M = 0.4;
/** Cards per cluster — inside the brief's 3-5 band. */
export const VERGE_CLUSTER_CARDS = 4;
/** Denser kerb blade band depth. */
export const VERGE_EDGE_BAND_M = 0.25;
/** Taller unmown outer band depth. */
export const VERGE_BLOOM_BAND_M = 0.35;
/** Outer band blade-height ratio over the kept lawn. */
export const VERGE_BLOOM_HEIGHT_SCALE = 1.3;
/** Kerb band blade-height ratio (denser AND shorter than the lawn). */
export const VERGE_EDGE_SHORT_SCALE = 0.5;
/** Edge grass is denser than the lawn's 0.3 m cell. */
export const VERGE_EDGE_CELL_M = 0.22;

// ---------------------------------------------------------------------------
// Deterministic hash (integer mix — identical on every peer, no Math.random)
// ---------------------------------------------------------------------------

/** Hash two integer cell coords plus a salt to [0, 1). */
export function vergeEdgeHash(ix: number, iz: number, salt: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(salt, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Jitter for one 0.3 m strip cell, quantised to sixths inside [0.02, 0.08]. */
export function vergeEdgeStripJitter(cellIndex: number, runId: number): number {
  const q = Math.floor(vergeEdgeHash(cellIndex, runId, NUKETOWN2_VERGE_EDGE_SEED) * 6) / 6;
  return VERGE_STRIP_JITTER_MIN_M + q * (VERGE_STRIP_JITTER_MAX_M - VERGE_STRIP_JITTER_MIN_M);
}

// ---------------------------------------------------------------------------
// World-frame plan truth (authored frame mirrored exactly like the builders)
// ---------------------------------------------------------------------------

type Rect = Readonly<{ x0: number; x1: number; z0: number; z1: number }>;

const STEM_X_AUTHORED = { x0: NUKETOWN2_CUL_DE_SAC.mouthX, x1: NUKETOWN2_CUL_DE_SAC.offMapX };
/** Stem x range in the world frame. */
export const VERGE_EDGE_STEM_X: readonly [number, number] = (() => {
  const [a, b] = nuketown2HandedSpan(STEM_X_AUTHORED.x0, STEM_X_AUTHORED.x1);
  return [a, b] as const;
})();
/** Kerb lawn-face offset and house-front offset (both signs). */
export const VERGE_EDGE_KERB_M = NUKETOWN2_STREET_HALF_WIDTH;
export const VERGE_EDGE_HOUSE_FRONT_M = Math.abs(NUKETOWN2_HOUSE_FRONT_Z);
/** Bulb centre in the world frame (centred() mirrors x only). */
export const VERGE_EDGE_BULB = Object.freeze({
  x: nuketown2HandedX(NUKETOWN2_CUL_DE_SAC.centreX),
  z: 0,
  r: NUKETOWN2_CUL_DE_SAC.radius,
});
/** Kerb ring outer face radius (tread 0.15 centred at r + half the 0.15 width). */
export const VERGE_EDGE_KERB_RING_R = NUKETOWN2_CUL_DE_SAC.radius + 0.15;

function inRect(x: number, z: number, r: Rect): boolean {
  return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
}

function expanded(x: number, z: number, r: Rect, m: number): boolean {
  return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
}

/** Both world copies of one dressing piece (paired pieces mirror like pair()). */
function dressingWorldRects(piece: { x0: number; x1: number; z0: number; z1: number; paired?: boolean }): Rect[] {
  const [a, b] = nuketown2HandedSpan(piece.x0, piece.x1);
  const north: Rect = { x0: a, x1: b, z0: piece.z0, z1: piece.z1 };
  if (piece.paired === false) return [north];
  return [north, { x0: -b, x1: -a, z0: -piece.z1, z1: -piece.z0 }];
}


/** World rects of every lawn-tier dressing piece. */
export function vergeEdgeLawnRects(): Rect[] {
  return (ARENA_GROUND_DRESSING as readonly { id: string; material: string; x0: number; x1: number; z0: number; z1: number; paired?: boolean }[])
    .filter((p) => p.material === 'lawn')
    .flatMap(dressingWorldRects);
}

/** World rects of every hard pad: drive aprons, border paths, roadside bays. */
export function vergeEdgePadRects(): Rect[] {
  const pads: Rect[] = (ARENA_GROUND_DRESSING as readonly { id: string; material: string; x0: number; x1: number; z0: number; z1: number; paired?: boolean }[])
    .filter((p) => p.material !== 'lawn')
    .flatMap(dressingWorldRects);
  for (const fp of NUKETOWN2_CARRIAGEWAY_FOOTPRINTS) {
    // Entries already carry both z sides; only x takes the handed mirror.
    if (fp.shape !== 'rect') continue;
    const [a, b] = nuketown2HandedSpan(fp.x0, fp.x1);
    pads.push({ x0: a, x1: b, z0: Math.min(fp.z0, fp.z1), z1: Math.max(fp.z0, fp.z1) });
  }
  return pads;
}
/** World rects of the four roadside bays (footprints carry both z sides). */
export function vergeEdgeBayRects(): Rect[] {
  const rects: Rect[] = [];
  for (const fp of NUKETOWN2_CARRIAGEWAY_FOOTPRINTS) {
    if (fp.shape !== 'rect' || !fp.id.startsWith('bay ')) continue;
    const [a, b] = nuketown2HandedSpan(fp.x0, fp.x1);
    rects.push({ x0: a, x1: b, z0: Math.min(fp.z0, fp.z1), z1: Math.max(fp.z0, fp.z1) });
  }
  return rects;
}

/**
 * True within the kept kerb band: the 0.25 m lawn strip inside the stem kerb
 * line, inside any bay lip, or inside the bulb kerb ring. The stem verge is
 * mostly bays, so the bay lips and the ring are where the band actually lives.
 */
export function vergeEdgeInKerbBand(x: number, z: number): boolean {
  const [sx0, sx1] = VERGE_EDGE_STEM_X;
  const az = Math.abs(z);
  if (az >= VERGE_EDGE_KERB_M + 0.01 && az <= VERGE_EDGE_KERB_M + 0.01 + VERGE_EDGE_BAND_M
    && x >= sx0 && x <= sx1) {
    return true;
  }
  for (const bay of vergeEdgeBayRects()) {
    if (x < bay.x0 || x > bay.x1) continue;
    if (bay.z1 < 0 && z >= bay.z0 - VERGE_EDGE_BAND_M && z <= bay.z0) return true;
    if (bay.z0 > 0 && z >= bay.z1 && z <= bay.z1 + VERGE_EDGE_BAND_M) return true;
  }
  const r = Math.hypot(x - VERGE_EDGE_BULB.x, z - VERGE_EDGE_BULB.z);
  if (r >= VERGE_EDGE_KERB_RING_R + 0.01 && r <= VERGE_EDGE_KERB_RING_R + 0.01 + VERGE_EDGE_BAND_M) {
    return true;
  }
  return false;
}

/** True on the carriageway: stem rect, bulb disc, or any bay rect. */
export function vergeEdgeOnCarriageway(x: number, z: number): boolean {
  const [sx0, sx1] = VERGE_EDGE_STEM_X;
  if (x >= sx0 && x <= sx1 && Math.abs(z) <= VERGE_EDGE_KERB_M + 0.02) return true;
  if (Math.hypot(x - VERGE_EDGE_BULB.x, z - VERGE_EDGE_BULB.z) <= VERGE_EDGE_BULB.r + 0.02) return true;
  for (const fp of NUKETOWN2_CARRIAGEWAY_FOOTPRINTS) {
    // Entries already carry both z sides; only x takes the handed mirror.
    if (fp.shape !== 'rect' || !fp.id.startsWith('bay ')) continue;
    const [a, b] = nuketown2HandedSpan(fp.x0, fp.x1);
    if (x >= a && x <= b && z >= Math.min(fp.z0, fp.z1) && z <= Math.max(fp.z0, fp.z1)) return true;
  }
  return false;
}

/** Front-door walk rects, both halves (margin included). */
export function vergeEdgeDoorWalks(): Rect[] {
  const door = NUKETOWN2_DOORWAYS.find((d) => d.id === 'house front door')!;
  const half = door.width / 2 + VERGE_CLUSTER_CLEAR_M;
  const nx = nuketown2HandedX(door.centre);
  return [
    { x0: nx - half, x1: nx + half, z0: -VERGE_EDGE_HOUSE_FRONT_M, z1: -VERGE_EDGE_KERB_M },
    { x0: -nx - half, x1: -nx + half, z0: VERGE_EDGE_KERB_M, z1: VERGE_EDGE_HOUSE_FRONT_M },
  ];
}

/** Lamp + sign pole positions in the world frame, both halves. */
export function vergeEdgePolePositions(): Array<readonly [number, number]> {
  const poles: Array<readonly [number, number]> = [];
  for (const lamp of NUKETOWN2_LAMP_POST_LAYOUT) {
    const nx = nuketown2HandedX(lamp.x);
    poles.push([nx, lamp.z] as const, [-nx, -lamp.z] as const);
  }
  for (const placement of streetSignPropPlacements()) {
    const [ax, , az] = placement.anchor;
    const nx = nuketown2HandedX(ax);
    poles.push([nx, az] as const, [-nx, -az] as const);
  }
  return poles;
}

function pointInKeepOuts(x: number, z: number, keepOuts: readonly Box2[], margin: number): boolean {
  for (const box of keepOuts) {
    if (x > box.minX - margin && x < box.maxX + margin && z > box.minZ - margin && z < box.maxZ + margin) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Strip runs
// ---------------------------------------------------------------------------

export type VergeStripCell = Readonly<{
  run: string; x: number; z: number; yaw: number; width: number; jitter: number;
}>;

/**
 * Every soil-strip cell in the world frame. Runs: stem kerb lines, the bulb
 * kerb ring, driveway apron edges, border-path edges. Cells whose footprint
 * is not lawn (paving, road, house zone) or hits a keep-out are dropped, so
 * runs break exactly where the lawn does.
 */
export function vergeEdgeStripCells(keepOuts: readonly Box2[] = []): VergeStripCell[] {
  const cells: VergeStripCell[] = [];
  const lawn = vergeEdgeLawnRects();
  const onLawn = (x: number, z: number): boolean => lawn.some((r) => inRect(x, z, r));
  const blocked = (x: number, z: number): boolean => (
    vergeEdgeOnCarriageway(x, z) || pointInKeepOuts(x, z, keepOuts, 0)
  );
  let runId = 0;
  const pushRun = (
    run: string,
    points: Array<{ x: number; z: number; yaw: number; nx: number; nz: number }>,
  ): void => {
    runId += 1;
    const id = runId;
    for (let i = 0; i < points.length; i += 1) {
      const p = points[i]!;
      const jitter = vergeEdgeStripJitter(i, id * 7919);
      // The OUTER edge is pinned at the kerb inset; the jitter rides entirely
      // on the inner (lawn) edge, so the turf line wavers, not the kerb line.
      const x = p.x + p.nx * (jitter / 2);
      const z = p.z + p.nz * (jitter / 2);
      if (!onLawn(x, z) || blocked(x, z)) continue;
      cells.push({ run, x, z, yaw: p.yaw, width: VERGE_STRIP_WIDTH_M + jitter, jitter });
    }
  };

  type RunPoint = { x: number; z: number; yaw: number; nx: number; nz: number };

  // Stem kerb lines, both sides.
  const [sx0, sx1] = VERGE_EDGE_STEM_X;
  for (const side of [-1, 1] as const) {
    const pts: RunPoint[] = [];
    const n = Math.floor((sx1 - sx0 - 0.3) / VERGE_STRIP_CELL_M);
    for (let i = 0; i <= n; i += 1) {
      const x = sx0 + 0.15 + i * VERGE_STRIP_CELL_M;
      pts.push({ x, z: side * (VERGE_EDGE_KERB_M + VERGE_STRIP_KERB_INSET_M + VERGE_STRIP_WIDTH_M / 2), yaw: 0, nx: 0, nz: side });
    }
    pushRun(side < 0 ? 'stem-north' : 'stem-south', pts);
  }

  // Bulb kerb ring (lawn-meeting arc survives the lawn/paving filter).
  {
    const pts: RunPoint[] = [];
    const rMid = VERGE_EDGE_KERB_RING_R + VERGE_STRIP_KERB_INSET_M + VERGE_STRIP_WIDTH_M / 2;
    const step = VERGE_STRIP_CELL_M / rMid;
    const n = Math.floor((Math.PI * 2) / step);
    for (let i = 0; i < n; i += 1) {
      const a = i * step;
      pts.push({
        x: VERGE_EDGE_BULB.x + Math.cos(a) * rMid,
        z: VERGE_EDGE_BULB.z + Math.sin(a) * rMid,
        // Local X onto the tangent: yaw -(a + PI/2) maps +X to (-sin a, cos a).
        yaw: -(a + Math.PI / 2),
        nx: Math.cos(a),
        nz: Math.sin(a),
      });
    }
    pushRun('bulb-ring', pts);
  }

  // Bay lips: the kerb line the lawn actually meets along most of the stem.
  for (const bay of vergeEdgeBayRects()) {
    const north = bay.z1 < 0;
    const zEdge = north ? bay.z0 : bay.z1;
    const outward = north ? -1 : 1;
    const pts: RunPoint[] = [];
    const n = Math.floor((bay.x1 - bay.x0 - 0.3) / VERGE_STRIP_CELL_M);
    for (let i = 0; i <= n; i += 1) {
      pts.push({
        x: bay.x0 + 0.15 + i * VERGE_STRIP_CELL_M,
        z: zEdge + outward * (VERGE_STRIP_KERB_INSET_M + VERGE_STRIP_WIDTH_M / 2),
        yaw: 0,
        nx: 0,
        nz: outward,
      });
    }
    pushRun(`bay-lip-${bay.x0.toFixed(1)}-${bay.z0.toFixed(1)}`, pts);
  }

  // Driveway apron edges (both x edges, where lawn flanks them).
  for (const pad of vergeEdgePadRects()) {
    const isApron = pad.z1 - pad.z0 > 3 && Math.abs(pad.x1 - pad.x0 - 5) < 1.5;
    if (!isApron) continue;
    for (const edge of [pad.x0, pad.x1] as const) {
      const side = edge === pad.x0 ? -1 : 1;
      const pts: RunPoint[] = [];
      const z0 = Math.min(pad.z0, pad.z1) + 0.15;
      const z1 = Math.max(pad.z0, pad.z1) - 0.15;
      const n = Math.floor((z1 - z0) / VERGE_STRIP_CELL_M);
      for (let i = 0; i <= n; i += 1) {
        pts.push({
          x: edge + side * (VERGE_STRIP_KERB_INSET_M + VERGE_STRIP_WIDTH_M / 2),
          z: z0 + i * VERGE_STRIP_CELL_M,
          yaw: Math.PI / 2,
          nx: side,
          nz: 0,
        });
      }
      pushRun(`apron-x${edge.toFixed(2)}`, pts);
    }
  }

  // Border-path edges (fence side, where the yard lawn meets the path).
  for (const pad of vergeEdgePadRects()) {
    const wide = pad.x1 - pad.x0 > 20;
    // The border path is a 6 m verge-to-fence band, not a kerb tread: match
    // it without catching the 10.6 m road slab or the 5 m aprons (not wide).
    const thin = Math.abs(pad.z1 - pad.z0) < 7;
    if (!wide || !thin) continue;
    for (const edge of [pad.z0, pad.z1] as const) {
      const pts: RunPoint[] = [];
      const lawnSide = edge < 0 ? 1 : -1; // yard side of the path
      const n = Math.floor((NUKETOWN2_BOUNDS.maxX - NUKETOWN2_BOUNDS.minX - 0.3) / VERGE_STRIP_CELL_M);
      for (let i = 0; i <= n; i += 1) {
        pts.push({
          x: NUKETOWN2_BOUNDS.minX + 0.15 + i * VERGE_STRIP_CELL_M,
          z: edge + lawnSide * (VERGE_STRIP_KERB_INSET_M + VERGE_STRIP_WIDTH_M / 2),
          yaw: 0,
          nx: 0,
          nz: lawnSide,
        });
      }
      pushRun(`path-z${edge.toFixed(1)}`, pts);
    }
  }

  return cells;
}

// ---------------------------------------------------------------------------
// Cluster placement
// ---------------------------------------------------------------------------

export type VergeCluster = Readonly<{ x: number; z: number; yaw: number; scale: number; side: -1 | 1 }>;

/** All accepted cluster candidates, ordered deterministically, capped per side. */
export function vergeEdgeClusters(keepOuts: readonly Box2[] = []): VergeCluster[] {
  const lawn = vergeEdgeLawnRects();
  const pads = vergeEdgePadRects();
  const walks = vergeEdgeDoorWalks();
  const onLawn = (x: number, z: number): boolean => lawn.some((r) => inRect(x, z, r));
  const clear = (x: number, z: number): boolean => (
    !vergeEdgeOnCarriageway(x, z)
    && !pointInKeepOuts(x, z, keepOuts, 0)
    && !pads.some((r) => expanded(x, z, r, VERGE_CLUSTER_CLEAR_M))
    && !walks.some((r) => inRect(x, z, r))
    && onLawn(x, z)
  );

  type Cand = { x: number; z: number; key: number };
  const cands: Cand[] = [];
  const [sx0, sx1] = VERGE_EDGE_STEM_X;

  // Stem kerb bands, both sides.
  for (const side of [-1, 1] as const) {
    const n = Math.floor((sx1 - sx0) / 0.35);
    for (let i = 0; i <= n; i += 1) {
      const x = sx0 + 0.1 + i * 0.35;
      const h = vergeEdgeHash(i, side * 31 + 7, NUKETOWN2_VERGE_EDGE_SEED);
      const z = side * (VERGE_EDGE_KERB_M + 0.06 + h * (VERGE_CLUSTER_KERB_BAND_M - 0.06));
      if (!clear(x, z)) continue;
      cands.push({ x, z, key: vergeEdgeHash(i * 3 + 1, side * 131 + 17, NUKETOWN2_VERGE_EDGE_SEED ^ 0xc1) });
    }
  }

  // Bulb ring.
  {
    const step = 0.05;
    const n = Math.floor((Math.PI * 2) / step);
    for (let i = 0; i < n; i += 1) {
      const a = i * step;
      const h = vergeEdgeHash(i, 911, NUKETOWN2_VERGE_EDGE_SEED);
      const r = VERGE_EDGE_KERB_RING_R + 0.06 + h * (VERGE_CLUSTER_KERB_BAND_M - 0.06);
      const x = VERGE_EDGE_BULB.x + Math.cos(a) * r;
      const z = VERGE_EDGE_BULB.z + Math.sin(a) * r;
      if (Math.abs(z) < 0.5 && x > VERGE_EDGE_BULB.x) continue;
      if (!clear(x, z)) continue;
      cands.push({ x, z, key: vergeEdgeHash(i * 7 + 3, 517, NUKETOWN2_VERGE_EDGE_SEED ^ 0xc1) });
    }
  }

  // Pole rings (lamps + signs, both halves).
  vergeEdgePolePositions().forEach(([px, pz], pi) => {
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2 + vergeEdgeHash(pi, k, NUKETOWN2_VERGE_EDGE_SEED) * 0.6;
      const r = k % 2 === 0 ? 0.45 : 0.8;
      const x = px + Math.cos(a) * r;
      const z = pz + Math.sin(a) * r;
      if (!clear(x, z)) continue;
      cands.push({ x, z, key: vergeEdgeHash(pi * 131 + k, k * 17 + pi, NUKETOWN2_VERGE_EDGE_SEED ^ 0xc1) });
    }
  });

  const bySide = (side: -1 | 1): Cand[] => cands
    .filter((c) => (c.z < 0 ? -1 : 1) === side)
    .sort((a, b) => a.key - b.key || a.x - b.x || a.z - b.z)
    .slice(0, VERGE_CLUSTER_TARGET_PER_SIDE);

  const out: VergeCluster[] = [];
  for (const side of [-1, 1] as const) {
    bySide(side).forEach((c, i) => {
      out.push({
        x: c.x,
        z: c.z,
        yaw: vergeEdgeHash(i, side * 7717 + 3, NUKETOWN2_VERGE_EDGE_SEED) * Math.PI * 2,
        scale: 0.8 + vergeEdgeHash(i, side * 9133 + 9, NUKETOWN2_VERGE_EDGE_SEED) * 0.4,
        side,
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Edge-grass tint: the kept-lawn tint with the dry weight raised (unmown read)
// ---------------------------------------------------------------------------

export const NUKETOWN2_VERGE_EDGE_TINT: GrassClumpTint = Object.freeze({
  ...NUKETOWN2_LAWN_TINT,
  dry: Object.freeze({ ...(NUKETOWN2_LAWN_TINT.dry!), weight: 0.55 }),
});

/** Blade height of the outer band: x1.3 over the kept lawn (brief authority). */
export const NUKETOWN2_VERGE_EDGE_BLADE_HEIGHT_M =
  NUKETOWN_LAWN_BLADE_HEIGHT_M * VERGE_BLOOM_HEIGHT_SCALE;

/** True inside the kerb blade band or the outer bloom band. */
export function vergeEdgeInGrassBand(x: number, z: number): boolean {
  if (vergeEdgeInKerbBand(x, z)) return true;
  const az = Math.abs(z);
  if (az >= VERGE_EDGE_HOUSE_FRONT_M - VERGE_BLOOM_BAND_M && az <= VERGE_EDGE_HOUSE_FRONT_M
    && x >= NUKETOWN2_BOUNDS.minX && x <= NUKETOWN2_BOUNDS.maxX) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Cluster card material: the atlas singleton, one sampler, per-instance row
// plus a dandelion/clover tint gate (no atlas edit — the 16-leaf pins stay).
// ---------------------------------------------------------------------------

function webgl2CompatRoute(): boolean {
  return typeof document !== 'undefined'
    && (document.documentElement as HTMLElement | undefined)?.dataset.renderBackend === 'webgl2';
}

export type VergeClusterMaterial = { material: THREE.Material; time: { value: number } | null };

export function createVergeClusterMaterial(): VergeClusterMaterial {
  const atlas = nuketown2LeafAtlas();
  if (webgl2CompatRoute()) {
    return {
      material: new THREE.MeshStandardMaterial({
        map: atlas,
        alphaTest: LEAF_ALPHA_TEST,
        side: THREE.DoubleSide,
        roughness: 0.86,
        metalness: 0.02,
      }),
      time: null,
    };
  }
  const mat = new MeshStandardNodeMaterial({
    roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide,
  });
  mat.name = 'nuketown2-verge-edge-clusters';
  mat.alphaTest = LEAF_ALPHA_TEST;

  const t = uniform(0);
  const hash = fract(sin(float(instanceIndex).mul(12.9898).add(4.1414)).mul(43758.5453));
  const row = floor(hash.mul(LEAF_ATLAS_CELLS)).div(LEAF_ATLAS_CELLS);
  const sampled = texture(atlas, uv().add(vec2(float(0), row)));
  // ~28 % of clusters read as dandelion: the sampled leaf pulled toward bloom
  // yellow. The rest keep the atlas green (clover).
  const hash2 = fract(sin(float(instanceIndex).mul(78.233).add(1.7)).mul(12543.2));
  const danMix = smoothstep(float(0.72), float(0.74), hash2).mul(0.9);
  const bloom = vec3(0.98, 0.8, 0.36);
  // Gentle sway so the clusters do not stand dead still on waving grass.
  const sway = sin(t.mul(0.9).add(positionWorld.x.mul(0.31).add(positionWorld.z.mul(0.19))));
  const hN = positionLocal.y.div(float(0.14)).clamp(0, 1);
  mat.positionNode = positionLocal.add(vec3(sway.mul(hN).mul(float(0.012)), float(0), float(0)));
  mat.colorNode = mix(sampled.rgb, bloom, danMix);
  mat.opacityNode = sampled.a;
  return { material: mat, time: t as unknown as { value: number } };
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface Nuketown2VergeEdgeStats {
  stripInstances: number;
  /** Kept strip cells per run, in the real build (after keep-outs). */
  stripRuns: Readonly<Record<string, number>>;
  clustersNorth: number;
  clustersSouth: number;
  edgeBlades: number;
  edgeTriangles: number;
  kerbBandBlades: number;
  bloomBandBlades: number;
  triangles: number;
  drawCalls: number;
}

export interface Nuketown2VergeEdge {
  group: THREE.Group;
  stats: Nuketown2VergeEdgeStats;
  edgeField: InstancedGrassField;
  advanceWind(seconds: number): void;
}

function trianglesOf(geometry: THREE.BufferGeometry): number {
  return geometry.index ? geometry.index.count / 3 : geometry.getAttribute('position').count / 3;
}

export function buildNuketown2VergeEdge(
  parent: THREE.Object3D,
  options: Readonly<{ planter: THREE.Material; keepOuts: readonly Box2[] }>,
): Nuketown2VergeEdge {
  const group = new THREE.Group();
  group.name = 'nuketown2-verge-edge';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;

  // --- 1. soil strip (arena's own soil/mulch role: zero new graphs) ---
  const stripCells = vergeEdgeStripCells(options.keepOuts);
  const stripGeom = new THREE.BoxGeometry(1, 1, 1);
  const stripMesh = new THREE.InstancedMesh(stripGeom, options.planter, Math.max(1, stripCells.length));
  stripMesh.name = 'nuketown2-verge-edge-strip';
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    stripCells.forEach((cell, i) => {
      e.set(0, cell.yaw, 0);
      q.setFromEuler(e);
      // Box height 0.03 sunk 0.01 into the plate: top relief is exactly 0.02
      // and no face is coplanar with the plate it sits on.
      p.set(cell.x, VERGE_EDGE_LAWN_TOP_Y + VERGE_STRIP_RELIEF_M - 0.015, cell.z);
      const along = VERGE_STRIP_CELL_M + 0.01;
      // Local X always maps onto the run direction (yaw 0, PI/2, or the arc
      // tangent), so the 0.31 overlap length is always along the run.
      s.set(along, 0.03, cell.width);
      m.compose(p, q, s);
      stripMesh.setMatrixAt(i, m);
    });
    stripMesh.count = stripCells.length;
    stripMesh.instanceMatrix.needsUpdate = true;
    stripMesh.computeBoundingSphere();
  }
  stripMesh.castShadow = false;
  stripMesh.receiveShadow = true;
  stripMesh.userData.presentationOnly = true;
  stripMesh.userData.blocksShots = false;
  group.add(stripMesh);

  // --- 2. clover/dandelion clusters (atlas singleton: exactly one sampler) ---
  const clusters = vergeEdgeClusters(options.keepOuts);
  const clusterGeom = leafSprigGeometry(VERGE_CLUSTER_CARDS, 0.055);
  const clusterMat = createVergeClusterMaterial();
  const clusterMesh = new THREE.InstancedMesh(clusterGeom, clusterMat.material, Math.max(1, clusters.length));
  clusterMesh.name = 'nuketown2-verge-edge-clusters';
  {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    clusters.forEach((c, i) => {
      e.set(0, c.yaw, 0);
      q.setFromEuler(e);
      p.set(c.x, VERGE_EDGE_LAWN_TOP_Y - 0.005, c.z);
      s.set(c.scale, c.scale, c.scale);
      m.compose(p, q, s);
      clusterMesh.setMatrixAt(i, m);
    });
    clusterMesh.count = clusters.length;
    clusterMesh.instanceMatrix.needsUpdate = true;
    clusterMesh.computeBoundingSphere();
  }
  // Alpha-tested cards print solid quads into the r185 WebGPU shadow pass
  // (same measured reason as the hedge leaf cards): shadows off.
  clusterMesh.castShadow = false;
  clusterMesh.receiveShadow = true;
  clusterMesh.userData.presentationOnly = true;
  clusterMesh.userData.blocksShots = false;
  group.add(clusterMesh);

  // --- 3. unmown edge grass: one region, one draw, two bands by post-scale ---
  const lawn = vergeEdgeLawnRects();
  const pads = vergeEdgePadRects();
  const edgeField = buildInstancedGrassField({
    name: 'nuketown2-verge-edge',
    seed: NUKETOWN2_VERGE_EDGE_SEED ^ 0x1ed6,
    regions: [{
      minX: NUKETOWN2_BOUNDS.minX, maxX: NUKETOWN2_BOUNDS.maxX,
      minZ: -VERGE_EDGE_HOUSE_FRONT_M, maxZ: VERGE_EDGE_HOUSE_FRONT_M,
    }],
    cellSizeM: VERGE_EDGE_CELL_M,
    bladeHeightM: NUKETOWN2_VERGE_EDGE_BLADE_HEIGHT_M,
    bladeWidthM: 0.062,
    bladeBendM: 0.055,
    bladesPerTuft: 3,
    placementAllowed: (x, z) => {
      if (!vergeEdgeInGrassBand(x, z)) return false;
      if (!lawn.some((r) => inRect(x, z, r))) return false;
      if (vergeEdgeOnCarriageway(x, z)) return false;
      if (pads.some((r) => inRect(x, z, r))) return false;
      // The kerb band tucks against the kerb faces, which are themselves
      // keep-outs: the lawn's 0.36 margin would erase the whole band, so the
      // band reads the boxes exactly while the outer band keeps the margin.
      const margin = vergeEdgeInKerbBand(x, z) ? 0 : 0.36;
      return !pointInKeepOuts(x, z, options.keepOuts, margin);
    },
    material: {
      color: 0xc5aa5b,
      roughness: 0.89,
      metalness: 0.02,
      swayAmount: 0.05,
      windSpeed: 0.85,
      sssColor: 0xa4cb55,
      sssStrength: 0.29,
      rootShade: [0.56, 0.65, 0.5],
    },
    tint: NUKETOWN2_VERGE_EDGE_TINT,
  });
  // Kerb band reads as kept-but-dense: shorten it under the lawn tip height.
  let kerbBandBlades = 0;
  let bloomBandBlades = 0;
  for (const mesh of edgeField.meshes) {
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, m);
      m.decompose(pos, quat, scl);
      if (vergeEdgeInKerbBand(pos.x, pos.z)) {
        scl.y *= VERGE_EDGE_SHORT_SCALE;
        kerbBandBlades += 1;
      } else {
        bloomBandBlades += 1;
      }
      m.compose(pos, quat, scl);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  for (const mesh of edgeField.meshes) group.add(mesh);

  parent.add(group);

  const stripTris = stripCells.length * trianglesOf(stripGeom);
  const clusterTris = clusters.length * trianglesOf(clusterGeom);
  const stripRuns: Record<string, number> = {};
  for (const cell of stripCells) stripRuns[cell.run] = (stripRuns[cell.run] ?? 0) + 1;
  const stats: Nuketown2VergeEdgeStats = {
    stripInstances: stripCells.length,
    stripRuns: Object.freeze(stripRuns),
    clustersNorth: clusters.filter((c) => c.side < 0).length,
    clustersSouth: clusters.filter((c) => c.side > 0).length,
    edgeBlades: edgeField.stats.blades,
    edgeTriangles: edgeField.stats.triangles,
    kerbBandBlades,
    bloomBandBlades,
    triangles: Math.round(stripTris + clusterTris + edgeField.stats.triangles),
    drawCalls: 2 + edgeField.stats.drawCalls,
  };
  return {
    group,
    stats,
    edgeField,
    advanceWind: (seconds: number) => {
      edgeField.advanceWind(seconds);
      if (clusterMat.time) clusterMat.time.value = seconds;
    },
  };
}
