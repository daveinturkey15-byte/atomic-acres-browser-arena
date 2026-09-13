/**
 * gardens.ts — the kept-suburb layer inside the fence: clipped box hedges
 * along the boundaries and patio flanks, flower beds along the street verge
 * and hedge feet, and short lawn tufts at the playable edges on the shared
 * TSL grass field (`rendering/instanced-grass-field.ts`).
 *
 * GAMEPLAY SAFETY. Nothing here collides. Hedges are therefore capped at
 * HEDGE_MAX_HEIGHT_M (knee height) so they can never be mistaken for cover,
 * every hedge sample must pass `hedgeAllowed()` (road, buildings, spawn pads
 * and the traversal lanes are all excluded) and a run that crosses a keep-out
 * is CUT there, not nudged. Taller reference-style hedges are a root/
 * architecture decision because they need matching solids.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildInstancedGrassField, type GrassRegionRect, type InstancedGrassField } from '../../rendering/instanced-grass-field';
import { groundCoverAllowed, hedgeAllowed } from './layout';
import { createSurfaceMaterial, type NatureUniforms } from './materials';
import { mulberry32 } from './seeded';
import type { NatureTextures } from './textures';

export const HEDGE_MAX_HEIGHT_M = 0.5;
export const HEDGE_WIDTH_M = 0.7;
export const HEDGE_SAMPLE_STEP_M = 0.5;
export const HEDGE_MIN_RUN_M = 1.5;

export type HedgeRun = Readonly<{ x0: number; z0: number; x1: number; z1: number; height: number }>;

/** Authored hedge lines (world metres). Cut by keep-outs at build time. */
export const HEDGE_RUNS: readonly HedgeRun[] = Object.freeze([
  // Side boundary hedges inside the X ±40 fences, broken at the spawn pads.
  { x0: 38.6, z0: -32, x1: 38.6, z1: 32, height: 0.5 },
  { x0: -38.6, z0: -32, x1: -38.6, z1: 32, height: 0.5 },
  // North / south garden boundaries.
  { x0: 13, z0: 32.6, x1: 37, z1: 32.6, height: 0.5 },
  { x0: -13, z0: 32.6, x1: -37, z1: 32.6, height: 0.5 },
  { x0: 13, z0: -32.6, x1: 37, z1: -32.6, height: 0.5 },
  { x0: -13, z0: -32.6, x1: -37, z1: -32.6, height: 0.5 },
  // Rear patio flanks (the rear-door corridor is a lane and gets cut out).
  { x0: 28.3, z0: -9, x1: 28.3, z1: 8, height: 0.45 },
  { x0: -28.3, z0: -9, x1: -28.3, z1: 8, height: 0.45 },
  // Garage yard sides.
  { x0: 25.2, z0: 9.5, x1: 25.2, z1: 18.5, height: 0.45 },
  { x0: -25.2, z0: 9.5, x1: -25.2, z1: 18.5, height: 0.45 },
  // Shed skirts.
  { x0: 31.5, z0: -18.6, x1: 36.5, z1: -18.6, height: 0.4 },
  { x0: -31.5, z0: -18.6, x1: -36.5, z1: -18.6, height: 0.4 },
]);

/** Flower bed strips (rects) — street verge planting and shed corners. */
export const FLOWER_BEDS: readonly GrassRegionRect[] = Object.freeze([
  { minX: 11.4, maxX: 12.0, minZ: -8, maxZ: 0 },
  { minX: 11.4, maxX: 12.0, minZ: 7.5, maxZ: 9.5 },
  { minX: -12.0, maxX: -11.4, minZ: -8, maxZ: 0 },
  { minX: -12.0, maxX: -11.4, minZ: 7.5, maxZ: 9.5 },
  { minX: 31.2, maxX: 36.8, minZ: -19.2, maxZ: -18.0 },
  { minX: -36.8, maxX: -31.2, minZ: -19.2, maxZ: -18.0 },
]);

/** Lawn tuft regions: fence bands, north/south strips and the street verges. */
export const LAWN_REGIONS: readonly GrassRegionRect[] = Object.freeze([
  { minX: 36.8, maxX: 39.4, minZ: -33, maxZ: 33 },
  { minX: -39.4, maxX: -36.8, minZ: -33, maxZ: 33 },
  { minX: 12, maxX: 36.8, minZ: 30.8, maxZ: 33.4 },
  { minX: -36.8, maxX: -12, minZ: 30.8, maxZ: 33.4 },
  { minX: 12, maxX: 36.8, minZ: -33.4, maxZ: -30.8 },
  { minX: -36.8, maxX: -12, minZ: -33.4, maxZ: -30.8 },
  { minX: 11.3, maxX: 12.8, minZ: -30, maxZ: 30 },
  { minX: -12.8, maxX: -11.3, minZ: -30, maxZ: 30 },
]);

export type Gardens = Readonly<{
  group: THREE.Group;
  triangles: number;
  drawGroups: number;
  counts: Readonly<{ hedgeSegments: number; hedgeSprigs: number; flowers: number; lawnTufts: number }>;
  /** Every accepted hedge sample (x, z) — for the keep-out tests. */
  hedgeSamples: ReadonlyArray<readonly [number, number]>;
  grass: InstancedGrassField;
  dispose: () => void;
}>;

/** Split an authored run into the sub-runs whose every sample is allowed. */
export function cutHedgeRun(run: HedgeRun, allowed: (x: number, z: number) => boolean = hedgeAllowed): HedgeRun[] {
  const len = Math.hypot(run.x1 - run.x0, run.z1 - run.z0);
  const steps = Math.max(1, Math.ceil(len / HEDGE_SAMPLE_STEP_M));
  const out: HedgeRun[] = [];
  let start = -1;
  const emit = (a: number, b: number): void => {
    const t0 = a / steps;
    const t1 = b / steps;
    if ((t1 - t0) * len < HEDGE_MIN_RUN_M) return;
    out.push({ x0: run.x0 + (run.x1 - run.x0) * t0, z0: run.z0 + (run.z1 - run.z0) * t0, x1: run.x0 + (run.x1 - run.x0) * t1, z1: run.z0 + (run.z1 - run.z0) * t1, height: Math.min(run.height, HEDGE_MAX_HEIGHT_M) });
  };
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const x = run.x0 + (run.x1 - run.x0) * t;
    const z = run.z0 + (run.z1 - run.z0) * t;
    // A sample is safe only if the hedge's full width is clear.
    const nx = -(run.z1 - run.z0) / len;
    const nz = (run.x1 - run.x0) / len;
    const half = HEDGE_WIDTH_M / 2;
    const ok = allowed(x, z) && allowed(x + nx * half, z + nz * half) && allowed(x - nx * half, z - nz * half);
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) { emit(start, i - 1); start = -1; }
  }
  if (start >= 0) emit(start, steps);
  return out;
}

function hedgeSegmentGeometry(seg: HedgeRun, rng: () => number): THREE.BufferGeometry {
  const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
  const box = new THREE.BoxGeometry(len, seg.height, HEDGE_WIDTH_M, Math.max(1, Math.round(len / 0.5)), 2, 2);
  const pos = box.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const uv = box.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i += 1) {
    const y = pos.getY(i);
    // Bottom face vertices stay put (contact); the rest get a leafy jitter.
    if (y > -seg.height / 2 + 1e-4) {
      pos.setXYZ(i, pos.getX(i) + (rng() - 0.5) * 0.05, y + (rng() - 0.5) * 0.04, pos.getZ(i) + (rng() - 0.5) * 0.05);
    }
    const ao = 0.55 + 0.45 * Math.min(1, (pos.getY(i) + seg.height / 2) / (seg.height * 0.8));
    col[i * 3] = ao;
    col[i * 3 + 1] = ao;
    col[i * 3 + 2] = ao;
    // World-scaled UVs so the leaf tile never stretches along a long run.
    uv.setXY(i, (pos.getX(i) + pos.getZ(i)) * 1.8, pos.getY(i) * 1.8);
  }
  box.setAttribute('color', new THREE.BufferAttribute(col, 3));
  box.computeVertexNormals();
  const m = new THREE.Matrix4().makeRotationY(-Math.atan2(seg.z1 - seg.z0, seg.x1 - seg.x0));
  m.setPosition((seg.x0 + seg.x1) / 2, seg.height / 2, (seg.z0 + seg.z1) / 2);
  box.applyMatrix4(m);
  return box.toNonIndexed();
}

function crossCardGeometry(size: number, cell: number, cellsX: number, cellsY: number, windTop: number): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(size, size);
  a.translate(0, size / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const parts = [a, b].map((g) => {
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i += 1) uv.setXY(i, (cell % cellsX + uv.getX(i)) / cellsX, (Math.floor(cell / cellsX) + uv.getY(i)) / cellsY);
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const w = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i += 1) w[i] = (pos.getY(i) / size) * windTop;
    g.setAttribute('windWeight', new THREE.BufferAttribute(w, 1));
    return g.toNonIndexed();
  });
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error('crossCardGeometry: merge failed');
  for (const p of parts) p.dispose();
  return merged;
}

export function createGardens(textures: NatureTextures, uniforms: NatureUniforms): Gardens {
  const group = new THREE.Group();
  group.name = 'world-studio-nature-gardens';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;
  const rng = mulberry32(0x9a2d_e115);

  // ---- hedges: one merged mass, one sprig instance set --------------------
  const segments: HedgeRun[] = [];
  for (const run of HEDGE_RUNS) segments.push(...cutHedgeRun(run));
  const hedgeSamples: Array<readonly [number, number]> = [];
  const hedgeParts = segments.map((seg) => {
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
    for (let d = 0; d <= len; d += HEDGE_SAMPLE_STEP_M) {
      const t = d / len;
      hedgeSamples.push([seg.x0 + (seg.x1 - seg.x0) * t, seg.z0 + (seg.z1 - seg.z0) * t]);
    }
    return hedgeSegmentGeometry(seg, rng);
  });
  const hedgeMat = createSurfaceMaterial({ name: 'ws-nature-hedge', map: textures.hedgeSurface, vertexColors: true, roughness: 0.8, snowResponse: 1, wetResponse: 0.3 }, uniforms);
  const sprigMat = createSurfaceMaterial({ name: 'ws-nature-hedge-sprig', map: textures.leafAtlas, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.72, wind: { amplitudeM: 0.05, frequency: 1.6 }, snowResponse: 1 }, uniforms);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [hedgeMat, sprigMat];
  let triangles = 0;
  let drawGroups = 0;
  let sprigCount = 0;
  if (hedgeParts.length > 0) {
    const hedgeGeom = mergeGeometries(hedgeParts, false);
    if (!hedgeGeom) throw new Error('gardens: hedge merge failed');
    for (const p of hedgeParts) p.dispose();
    hedgeGeom.name = 'ws-nature-hedges';
    hedgeGeom.computeBoundingSphere();
    geometries.push(hedgeGeom);
    const hedgeMesh = new THREE.Mesh(hedgeGeom, hedgeMat);
    hedgeMesh.name = 'ws-nature-hedges';
    hedgeMesh.castShadow = true;
    hedgeMesh.receiveShadow = true;
    hedgeMesh.userData.presentationOnly = true;
    hedgeMesh.userData.blocksShots = false;
    group.add(hedgeMesh);
    triangles += hedgeGeom.getAttribute('position').count / 3;
    drawGroups += 1;

    // Sprigs: crossed leaf cards along every top edge and both shoulders.
    const sprigGeom = crossCardGeometry(0.24, 3, 2, 2, 1);
    sprigGeom.name = 'ws-nature-hedge-sprig';
    geometries.push(sprigGeom);
    const sprigSlots: Array<[number, number, number, number]> = [];
    for (const seg of segments) {
      const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
      const nx = -(seg.z1 - seg.z0) / len;
      const nz = (seg.x1 - seg.x0) / len;
      for (let d = 0.15; d < len; d += 0.38) {
        const t = d / len;
        const side = (rng() - 0.5) * HEDGE_WIDTH_M * 0.9;
        const x = seg.x0 + (seg.x1 - seg.x0) * t + nx * side + (rng() - 0.5) * 0.1;
        const z = seg.z0 + (seg.z1 - seg.z0) * t + nz * side + (rng() - 0.5) * 0.1;
        const onShoulder = Math.abs(side) > HEDGE_WIDTH_M * 0.32;
        sprigSlots.push([x, z, seg.height - (onShoulder ? 0.16 : 0.06), rng() * Math.PI * 2]);
      }
    }
    const sprigs = new THREE.InstancedMesh(sprigGeom, sprigMat, sprigSlots.length);
    sprigs.name = 'ws-nature-hedge-sprigs';
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (let i = 0; i < sprigSlots.length; i += 1) {
      const [x, z, y, yaw] = sprigSlots[i];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      p.set(x, y, z);
      const k = 0.8 + rng() * 0.5;
      s.set(k, k, k);
      m.compose(p, q, s);
      sprigs.setMatrixAt(i, m);
    }
    sprigs.instanceMatrix.needsUpdate = true;
    sprigs.computeBoundingSphere();
    sprigs.castShadow = false;
    sprigs.receiveShadow = true;
    sprigs.userData.presentationOnly = true;
    sprigs.userData.blocksShots = false;
    group.add(sprigs);
    sprigCount = sprigSlots.length;
    triangles += (sprigGeom.getAttribute('position').count / 3) * sprigCount;
    drawGroups += 1;
  }

  // ---- flower beds ----------------------------------------------------------
  const flowerGeom = crossCardGeometry(0.28, 0, 2, 2, 0.8);
  flowerGeom.name = 'ws-nature-flower';
  geometries.push(flowerGeom);
  const flowerMat = createSurfaceMaterial({ name: 'ws-nature-flower', map: textures.flowers, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7, wind: { amplitudeM: 0.04, frequency: 1.9 }, snowResponse: 0.8 }, uniforms);
  materials.push(flowerMat);
  const flowerSlots: Array<[number, number, number]> = [];
  for (const bed of FLOWER_BEDS) {
    for (let z = bed.minZ; z < bed.maxZ; z += 0.3) {
      for (let x = bed.minX; x < bed.maxX; x += 0.3) {
        const fx = x + rng() * 0.3;
        const fz = z + rng() * 0.3;
        if (fx > bed.maxX || fz > bed.maxZ || !groundCoverAllowed(fx, fz)) continue;
        flowerSlots.push([fx, fz, rng() * Math.PI * 2]);
      }
    }
  }
  // Beds also line the yard side of every boundary hedge segment.
  for (const seg of segments) {
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
    const nx = -(seg.z1 - seg.z0) / len;
    const nz = (seg.x1 - seg.x0) / len;
    // Yard side = toward the origin.
    const midX = (seg.x0 + seg.x1) / 2;
    const midZ = (seg.z0 + seg.z1) / 2;
    const sign = (midX * nx + midZ * nz) > 0 ? -1 : 1;
    for (let d = 0.3; d < len; d += 0.55) {
      const t = d / len;
      const off = HEDGE_WIDTH_M / 2 + 0.15 + rng() * 0.25;
      const fx = seg.x0 + (seg.x1 - seg.x0) * t + nx * off * sign;
      const fz = seg.z0 + (seg.z1 - seg.z0) * t + nz * off * sign;
      if (!groundCoverAllowed(fx, fz)) continue;
      flowerSlots.push([fx, fz, rng() * Math.PI * 2]);
    }
  }
  if (flowerSlots.length > 0) {
    // One geometry per atlas cell (UVs are per geometry, not per instance):
    // four small instanced sets share the one flower material.
    const cellGeoms = [flowerGeom, crossCardGeometry(0.26, 1, 2, 2, 0.8), crossCardGeometry(0.24, 2, 2, 2, 0.8), crossCardGeometry(0.27, 3, 2, 2, 0.8)];
    for (let c = 1; c < cellGeoms.length; c += 1) { cellGeoms[c].name = `ws-nature-flower-${c}`; geometries.push(cellGeoms[c]); }
    const buckets: Array<Array<[number, number, number]>> = [[], [], [], []];
    for (let i = 0; i < flowerSlots.length; i += 1) buckets[Math.floor(rng() * 4)].push(flowerSlots[i]);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    for (let c = 0; c < 4; c += 1) {
      if (buckets[c].length === 0) continue;
      const mesh = new THREE.InstancedMesh(cellGeoms[c], flowerMat, buckets[c].length);
      mesh.name = `ws-nature-flowers-${c}`;
      for (let i = 0; i < buckets[c].length; i += 1) {
        const [x, z, yaw] = buckets[c][i];
        q.setFromAxisAngle(up, yaw);
        p.set(x, 0.0, z);
        const k = 0.8 + rng() * 0.5;
        s.set(k, k, k);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.presentationOnly = true;
      mesh.userData.blocksShots = false;
      group.add(mesh);
      triangles += (cellGeoms[c].getAttribute('position').count / 3) * buckets[c].length;
      drawGroups += 1;
    }
  }

  // ---- lawn tufts on the shared grass field ---------------------------------
  const grass = buildInstancedGrassField({
    name: 'ws-nature-lawn',
    seed: 0x1a3b_5c7d,
    regions: LAWN_REGIONS,
    cellSizeM: 0.55,
    bladeHeightM: 0.14,
    bladeWidthM: 0.05,
    bladeBendM: 0.06,
    bladesPerTuft: 2,
    scaleRange: [0.7, 1.0],
    leanMaxDeg: 18,
    placementAllowed: groundCoverAllowed,
    material: {
      color: 0x86a84a,
      roughness: 0.84,
      swayAmount: 0.03,
      windSpeed: 0.8,
      rootShade: [0.6, 0.66, 0.55],
      sssColor: 0xa8d24a,
      sssStrength: 0.25,
    },
    tint: {
      rBase: 0.82, rWarm: 0.18,
      gBase: 0.86, gWarm: 0.14,
      bBase: 0.78, bWarm: 0.12,
      valueBase: 0.9, valuePatch: 0.06, valueJitter: 0.04,
      dry: { rDry: 1, gDry: 0.92, bDry: 0.7, weight: 0.35, patchM: 5.5, coverage: 0.22 },
    },
  });
  group.add(grass.group);
  triangles += grass.stats.triangles;
  drawGroups += grass.stats.drawCalls;

  return Object.freeze({
    group,
    triangles,
    drawGroups,
    counts: Object.freeze({ hedgeSegments: segments.length, hedgeSprigs: sprigCount, flowers: flowerSlots.length, lawnTufts: grass.stats.blades }),
    hedgeSamples,
    grass,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      grass.dispose();
    },
  });
}
