/**
 * farcrysis-grass-field.ts — HF-396 instanced tropical grass for Farcrysis.
 *
 * WHAT THIS IS. The owner asked for the island to "HAVE grass" (HF-396) and
 * pointed at cadle.gg-grade fields (HF-398). The pre-existing cone "grass
 * tufts" layers in farcrysis-vegetation.ts are 45 + 340 dressing cones — not a
 * grass FIELD. This module builds one:
 *
 *   - Bezier-curved tapered blade geometry (quadratic bend, tip vertex),
 *     SEGMENTS+1 rows collapsing to a point — no flat cards, no cones.
 *   - ONE shared TSL graph (farcrysis-tsl-foliage.ts makeTslGrassMaterial):
 *     layered wind (global sway + rolling world-space gust wave + per-blade
 *     turbulence), root-to-tip colour gradient, and a backlit translucency
 *     (SSS approximation). Zero per-frame CPU cost beyond one time uniform
 *     already driven by tslAdvanceWind.
 *   - Slope-aware, seeded-deterministic placement over the terrain authority:
 *     rejects underwater sand, steep grades, and authored structure footprints.
 *   - Distance LOD by chunk: CHUNK_GRID x CHUNK_GRID InstancedMeshes sharing
 *     ONE geometry and ONE material; the per-frame animator toggles chunk
 *     visibility against DRAW_DISTANCE_M with zero allocation.
 *
 * COMBAT SAFETY BOUND (GAUNTLET-SPEC: no effect may hide an enemy).
 *   - Blade height is hard-capped at FARCRYSIS_GRASS_MAX_HEIGHT_M = 0.42 m,
 *     below a crouched operator's chest line: head, shoulders and gun always
 *     break the grass plane from any engagement distance.
 *   - Placement cell 0.33 m guarantees >= 0.22 m of open ground between blade
 *     roots, so the canopy never closes into a curtain.
 *   - Presentation only: no colliders, no raycast/shot-surface registration,
 *     matching the arena definition's existing foliage exception.
 *
 * DETERMINISM. All placement derives from a fixed-seed mulberry32 stream —
 * the same idiom farcrysis-art.ts adopted after HF-360's Math.random desync.
 * Wind runs on GPU time uniforms; no networked state involved.
 */
import * as THREE from 'three';
import { farcrysisInstancedMesh } from './farcrysis-instancing';
import { FARCRYSIS_BOUNDS } from './farcrysis-constants';
import {
  FARCRYSIS_SHORE,
  FARCRYSIS_WATER_LEVEL,
  farcrysisTerrainHeight,
} from './farcrysis-terrain-authority';
// HF-395/HF-396: landmark footprints derive RELATIONALLY from the same shared
// frames the builder's colliders use — never a second hand-maintained list.
import {
  FARCRYSIS_LANDMARKS,
  LANDMARK_BOULDER_SIZE_M,
  LANDMARK_PICKET_SANDBAG_DEPTH_M,
  LANDMARK_PICKET_SANDBAG_WIDTH_M,
  landmarkBoulderPosition,
  landmarkCratePlacements,
  landmarkInteractableSpecs,
  landmarkTreePositions,
  landmarkWallSpecs,
} from './farcrysis-midmap-landmarks';
import { makeTslGrassMaterial } from './farcrysis-tsl-foliage';

// ---------------------------------------------------------------------------
// Tunables (the tropical preset)
// ---------------------------------------------------------------------------

/** Hard combat-safety cap on rendered blade height (metres). */
export const FARCRYSIS_GRASS_MAX_HEIGHT_M = 0.42;
/** Guaranteed minimum open-ground spacing between blade roots (metres). */
export const FARCRYSIS_GRASS_MIN_SPACING_M = 0.22;
/** Jittered-grid cell edge; 1 candidate per cell bounds density absolutely. */
const CELL_M = 0.33;
/** Bezier segments per blade. 3 rows -> 7 verts / 5 triangles. */
const BLADE_SEGMENTS = 3;
/** Blade width at the root (metres); tapers to a point. */
const BLADE_WIDTH_M = 0.055;
/** Static lean baked into every blade (metres of tip offset before wind). */
const BLADE_BEND_M = 0.09;
/**
 * Placement half-extent — tracks the island rescale (HF-396). The dry
 * interior plateau runs from the arena edge to the HF-393 shore band, so the
 * grass field ends exactly where dry sand does:
 `bounds.maxX - FARCRYSIS_SHORE.descentStartDist` (= 54 on the 128 m island;
 was a hardcoded 26 on the old 64 m island, which left 3/4 of the grown
 island bare).
 */
const PLACEMENT_HALF_M = FARCRYSIS_BOUNDS.maxX - FARCRYSIS_SHORE.descentStartDist;
/** Chunk grid: 4x4 = 16 InstancedMeshes maximum, one draw each. */
const CHUNK_GRID = 4;
// Exposed so the LOD gates reason about the real grid instead of re-deriving
// it from copied constants (the failure mode that let the old +/-26 m extent
// survive the HF-396 rescale unnoticed).
export const FARCRYSIS_GRASS_PLACEMENT_HALF_M = PLACEMENT_HALF_M;
export const FARCRYSIS_GRASS_CHUNK_GRID = CHUNK_GRID;
/**
 * A chunk whose nearest FOOTPRINT edge is beyond this camera distance stops
 * drawing (distance LOD).
 *
 * HF-396 round 2: this was 62 m tested against the chunk CENTRE, which from
 * the authored spawn at (-52,-52) drew only 4 of 16 chunks and put a hard
 * grass edge 52 m from the player. It is now the arena's fog near plane
 * (src/rendering/arenas/farcrysis.ts authors fog { near: 78, far: 200 }), so
 * with bounds culling the cut can never fall closer than the distance at
 * which the fog has already begun hiding it.
 *
 * COST: this does NOT raise the worst case. All 16 chunks were already drawn
 * simultaneously from the arena centre under the old rule (every centre lies
 * within 62 m of the origin), so the 16-draw / 436,400-triangle ceiling the
 * arena budget is sized for is unchanged; only mid-field and corner cameras
 * draw more than they used to. Boot cost is unaffected too: every chunk mesh,
 * the one shared geometry and the one shared material are constructed at
 * build time regardless of LOD, so no geometry, material or pipeline is added
 * to the cold-admission path.
 */
export const FARCRYSIS_GRASS_DRAW_DISTANCE_M = 78;
/**
 * Blades must sit this far above the lagoon waterline (metres). Measured
 * against the terrain authority: half the placement disc sits below -0.05 m
 * (flooded island), so 0.08 admits the whole land surface while still keeping
 * roots out of the water and off the submerged sand ramp.
 */
const MIN_HEIGHT_ABOVE_WATER_M = 0.08;
/** Rejected when the terrain gradient exceeds this rise/run. */
const MAX_SLOPE = 0.5;
/** Nothing grows above this elevation — the bare rock crown of the massifs. */
const GRASS_MAX_ALTITUDE_M = 6.4;
/** Blades sink slightly so no root floats above a plate seam (metres). */
const ROOT_SINK_M = 0.02;

/** Fixed seed — presentation-only placement, identical on every peer. */
const SEED = 0x5eed_5ea5;

/**
 * Authored keep-out footprints: structures whose floors/wedges would clip
 * through blades. Rects are [minX, maxX, minZ, maxZ]; discs are [cx, cz, r].
 *
 * HF-396: the throwback discs previously pinned the OLD island's coordinates
 * (seaplane 24,-24 etc.) and never tracked the 4x rescale that moved those
 * props to the corners — blades were being kept out of empty sand while
 * growing straight through the wreck. Coordinates below are the LIVE authored
 * positions in farcrysis.ts / farcrysis-art.ts.
 */
const EXCLUSION_DISCS: readonly (readonly [number, number, number])[] = [
  [48, -48, 3.2],    // crashed seaplane (hull, floats, prop)
  [-48, 48, 1.8],    // signal beacon pyre tripod
  [52, 32, 4.2],     // flooded cave arch + portal
  [-8.5, -8.5, 2.6], // research tower legs
];

/**
 * Landmark keep-outs derive RELATIONALLY from the same shared frames the
 * builder's colliders use (HF-395 discipline): one rotated-AABB per ruin wall
 * segment, crate cache and grove trunk. If a landmark moves again, these move
 * with it by construction instead of silently drifting.
 */
const LANDMARK_EXCLUSION_RECTS: readonly (readonly [number, number, number, number])[] = (() => {
  const rects: Array<[number, number, number, number]> = [];
  for (const frame of FARCRYSIS_LANDMARKS) {
    for (const segment of landmarkWallSpecs(frame)) {
      // Rotated footprint half-extents for the yawed segment (audit AABB idiom).
      const c = Math.abs(Math.cos(segment.yaw));
      const s = Math.abs(Math.sin(segment.yaw));
      const hx = (segment.size[0] / 2) * c + (segment.size[2] / 2) * s;
      const hz = (segment.size[0] / 2) * s + (segment.size[2] / 2) * c;
      const m = 0.18;
      rects.push([
        segment.pos[0] - hx - m, segment.pos[0] + hx + m,
        segment.pos[1] - hz - m, segment.pos[1] + hz + m,
      ]);
    }
    for (const crate of landmarkCratePlacements(frame)) {
      rects.push([crate.pos[0] - 1.1, crate.pos[0] + 1.1, crate.pos[1] - 1.1, crate.pos[1] + 1.1]);
    }
    for (const [tx, tz] of landmarkTreePositions(frame)) {
      rects.push([tx - 0.9, tx + 0.9, tz - 0.9, tz + 0.9]);
    }
    // HF-395 round 2: the approach kit (the crates/barrels/sandbags that used
    // to be an absolute table in farcrysis-physics.ts) and the ruin boulder
    // now derive from the same frames, so their keep-outs derive with them.
    // These props are axis-aligned boxes, so the footprint is the authored
    // width/depth plus the same 0.18 m margin the wall segments use.
    for (const spec of landmarkInteractableSpecs(frame)) {
      const halfX = (spec.kind === 'sandbag' ? LANDMARK_PICKET_SANDBAG_WIDTH_M : spec.footprint) / 2 + 0.18;
      const halfZ = (spec.kind === 'sandbag' ? LANDMARK_PICKET_SANDBAG_DEPTH_M : spec.footprint) / 2 + 0.18;
      rects.push([
        spec.pos[0] - halfX, spec.pos[0] + halfX,
        spec.pos[1] - halfZ, spec.pos[1] + halfZ,
      ]);
    }
    const [bx, bz] = landmarkBoulderPosition(frame);
    const boulderHalf = LANDMARK_BOULDER_SIZE_M / 2 + 0.18;
    rects.push([bx - boulderHalf, bx + boulderHalf, bz - boulderHalf, bz + boulderHalf]);
  }
  return rects;
})();

const EXCLUSION_RECTS: readonly (readonly [number, number, number, number])[] = [
  // Research-station core incl. walls and entrances (walls at ±5.5 + 0.3).
  [-6.8, 6.8, -6.8, 6.8],
  ...LANDMARK_EXCLUSION_RECTS,
];

// ---------------------------------------------------------------------------
// Stats (diagnostics + report evidence)
// ---------------------------------------------------------------------------

interface GrassFieldStats {
  chunks: number;
  blades: number;
  /** Blade triangles if every chunk drew simultaneously (worst case). */
  triangles: number;
  /** Maximum simultaneous grass draws (= chunk count). */
  maxDrawCalls: number;
}

let _stats: GrassFieldStats = { chunks: 0, blades: 0, triangles: 0, maxDrawCalls: 0 };

export function farcrysisGrassFieldStats(): Readonly<GrassFieldStats> {
  return _stats;
}

// ---------------------------------------------------------------------------
// Blade geometry — quadratic Bezier taper strip
// ---------------------------------------------------------------------------

/**
 * One blade: BLADE_SEGMENTS+1 rows of paired vertices following a quadratic
 * Bezier from root to bent tip, then a single tip vertex. For 3 segments that
 * is 7 vertices / 5 triangles — cheap enough for tens of thousands of
 * instances while keeping the curved silhouette that reads as grass.
 * Local origin is the root; height extends along +Y; lean bends toward +Z.
 */
export function createGrassBladeGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < BLADE_SEGMENTS; row += 1) {
    const t = row / BLADE_SEGMENTS;
    // Quadratic Bezier P0(0,0,0), P1(bend*0.55, h*0.55, ...), P2(bend, h).
    const cx = 0;
    const cy = t * BLADE_BEND_M * 0.55 + t * t * (FARCRYSIS_GRASS_MAX_HEIGHT_M - BLADE_BEND_M * 0.55);
    const cz = t * BLADE_BEND_M * 0.55 + t * t * (BLADE_BEND_M - BLADE_BEND_M * 0.55);
    const halfWidth = (BLADE_WIDTH_M / 2) * (1 - t * 0.82);
    positions.push(cx - halfWidth, cy, cz);
    positions.push(cx + halfWidth, cy, cz);
  }
  // Tip: single point on the Bezier at t=1.
  positions.push(BLADE_BEND_M, FARCRYSIS_GRASS_MAX_HEIGHT_M, BLADE_BEND_M);

  for (let seg = 0; seg < BLADE_SEGMENTS - 1; seg += 1) {
    const l0 = seg * 2;
    const r0 = seg * 2 + 1;
    const l1 = seg * 2 + 2;
    const r1 = seg * 2 + 3;
    indices.push(l0, l1, r0);
    indices.push(r0, l1, r1);
  }
  // Final segment collapses onto the tip vertex.
  const lastL = (BLADE_SEGMENTS - 1) * 2;
  const lastR = lastL + 1;
  const tip = lastR + 1;
  indices.push(lastL, tip, lastR);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = 'farcrysis-grass-blade';
  return geometry;
}

// ---------------------------------------------------------------------------
// Seeded PRNG — same mulberry32 idiom as farcerysis-art.ts placement
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Placement filters
// ---------------------------------------------------------------------------

function terrainSlope(x: number, z: number): number {
  const e = 0.5;
  const dx = (farcrysisTerrainHeight(x + e, z) - farcrysisTerrainHeight(x - e, z)) / (2 * e);
  const dz = (farcrysisTerrainHeight(x, z + e) - farcrysisTerrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}

function excluded(x: number, z: number): boolean {
  for (const [minX, maxX, minZ, maxZ] of EXCLUSION_RECTS) {
    if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) return true;
  }
  for (const [cx, cz, r] of EXCLUSION_DISCS) {
    if ((x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r) return true;
  }
  return false;
}

/** True when a blade may root here: dry, gentle, outside every footprint. */
export function grassPlacementAllowed(x: number, z: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  if (
    x < FARCRYSIS_BOUNDS.minX + 1 || x > FARCRYSIS_BOUNDS.maxX - 1 ||
    z < FARCRYSIS_BOUNDS.minZ + 1 || z > FARCRYSIS_BOUNDS.maxZ - 1
  ) return false;
  const h = farcrysisTerrainHeight(x, z);
  if (h < FARCRYSIS_WATER_LEVEL + MIN_HEIGHT_ABOVE_WATER_M) return false;
  // HF-398 elevation raise: the highland massifs now crest ~7.8 m. Grass
  // climbs the gentle lower flanks (jungle look) and the STEEPNESS filter
  // below — not an altitude hard cut authored for the old 2.2 m "artificial
  // peaks" — decides where the bare rock crown begins.
  if (h > GRASS_MAX_ALTITUDE_M) return false;
  if (terrainSlope(x, z) > MAX_SLOPE) return false;
  return !excluded(x, z);
}

// ---------------------------------------------------------------------------
// Field build
// ---------------------------------------------------------------------------

interface BladeInstance {
  x: number;
  z: number;
  y: number;
  yaw: number;
  scale: number;
}

function webgl2CompatRoute(): boolean {
  return typeof document !== 'undefined' && document.documentElement?.dataset.renderBackend === 'webgl2';
}

const _chunkMeshes: THREE.InstancedMesh[] = [];
// HF-396 round 2: the LOD tests the camera against each chunk's FOOTPRINT,
// not its centre, so these are per-chunk XZ bounds rather than centres. All
// four arrays are preallocated to the full grid; the animator never allocates.
const _chunkMinX = new Float32Array(CHUNK_GRID * CHUNK_GRID);
const _chunkMaxX = new Float32Array(CHUNK_GRID * CHUNK_GRID);
const _chunkMinZ = new Float32Array(CHUNK_GRID * CHUNK_GRID);
const _chunkMaxZ = new Float32Array(CHUNK_GRID * CHUNK_GRID);

/**
 * Build the grass field under `root`. Deterministic; safe to call once per
 * arena build (the engine disposes the whole subtree on teardown).
 * Returns the stats snapshot for telemetry/tests.
 */
export function buildFarcrysisGrassField(root: THREE.Object3D): Readonly<GrassFieldStats> {
  // Fresh build replaces the registered chunk set (tests rebuild arenas).
  _chunkMeshes.length = 0;

  const rng = mulberry32(SEED);
  const chunkSize = (PLACEMENT_HALF_M * 2) / CHUNK_GRID;
  const buckets: BladeInstance[][] = Array.from(
    { length: CHUNK_GRID * CHUNK_GRID },
    () => [] as BladeInstance[],
  );

  let blades = 0;
  for (let cz = 0; cz < CHUNK_GRID; cz += 1) {
    for (let cx = 0; cx < CHUNK_GRID; cx += 1) {
      const x0 = -PLACEMENT_HALF_M + cx * chunkSize;
      const z0 = -PLACEMENT_HALF_M + cz * chunkSize;
      for (let pz = z0; pz < z0 + chunkSize; pz += CELL_M) {
        for (let px = x0; px < x0 + chunkSize; px += CELL_M) {
          // One jittered candidate per cell — the absolute density bound.
          const x = px + rng() * CELL_M;
          const z = pz + rng() * CELL_M;
          if (!grassPlacementAllowed(x, z)) continue;
          buckets[cz * CHUNK_GRID + cx].push({
            x,
            z,
            y: terrainSeat(x, z),
            yaw: rng() * Math.PI * 2,
            // Scale capped at 1.0 so scaled height never exceeds the bound.
            scale: 0.72 + rng() * 0.28,
          });
          blades += 1;
        }
      }
    }
  }

  const geometry = createGrassBladeGeometry();
  // ONE material instance for every chunk -> exactly ONE extra distinct
  // WebGPU program (HF-374 discipline). The WebGL2 compat route keeps plain
  // standard materials (same gate as vegetation's _applyTslFoliage).
  const material: THREE.Material = webgl2CompatRoute()
    ? new THREE.MeshStandardMaterial({ color: 0x4d7a36, roughness: 0.86, metalness: 0.02, side: THREE.DoubleSide })
    : makeTslGrassMaterial({
        color: 0x557f30,
        roughness: 0.86,
        metalness: 0.02,
        bladeHeight: FARCRYSIS_GRASS_MAX_HEIGHT_M,
        swayAmount: 0.16,
        sssColor: 0xa8d24a,
        sssStrength: 0.55,
      });

  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const bladeColor = new THREE.Color();

  /**
   * Per-instance tint. 87,280 blades previously shared ONE colour value, which
   * is the single clearest tell of cheap foliage: a real sward is never one
   * green, and at distance the eye reads the variance long before it resolves a
   * blade. This rides the existing InstancedMesh draw - no extra draw calls, no
   * extra program, no extra material - so the whole improvement is free.
   *
   * Deliberately NOT random per blade: grass grows in patches, so the hue is
   * driven by a low-frequency spatial field (metres-scale clumps of yellower
   * and deeper green) with only a small per-blade jitter on top. Pure per-blade
   * noise reads as television static, not as ground.
   *
   * Value stays within a band that cannot brighten a blade past the authored
   * material: `material.color` MULTIPLIES, so 1.0 is the ceiling and every
   * factor below darkens. The range is chosen so the darkest blade still reads
   * as lit grass rather than shadow.
   */
  const tintAt = (x: number, z: number, jitter: number): THREE.Color => {
    const clump = Math.sin(x * 0.11 + 1.7) * Math.cos(z * 0.09 - 0.6);
    const patch = Math.sin(x * 0.31 - 2.2) * Math.cos(z * 0.27 + 1.1);
    // Warmth: sun-bleached yellow-green through to shaded blue-green.
    const warm = 0.5 + 0.5 * clump;
    // Value: broad clumps plus a fine per-blade break-up.
    const value = 0.82 + 0.13 * patch + 0.05 * jitter;
    // Every channel stays <= 1.0 BEFORE the value multiply. material.color
    // multiplies the material and is capped at white, so a factor above 1 does
    // not brighten - it clips, and the range above the cap is simply thrown
    // away. The first cut peaked at 1.058 on red and lost that headroom
    // silently; the gate below now pins it.
    bladeColor.setRGB(
      (0.78 + 0.18 * warm) * value,
      (0.88 + 0.10 * warm) * value,
      (0.80 - 0.22 * warm) * value,
    );
    return bladeColor;
  };

  let chunks = 0;
  for (let i = 0; i < buckets.length; i += 1) {
    const instances = buckets[i];
    if (instances.length === 0) continue;
    const mesh = farcrysisInstancedMesh(geometry, material, instances.length);
    const cxi = i % CHUNK_GRID;
    const czi = Math.floor(i / CHUNK_GRID);
    mesh.name = `farcrysis-grass-chunk-${cxi}-${czi}`;
    for (let k = 0; k < instances.length; k += 1) {
      const inst = instances[k];
      euler.set(0, inst.yaw, 0);
      quaternion.setFromEuler(euler);
      position.set(inst.x, inst.y, inst.z);
      // Slight width variation, height strictly <= bound via scale <= 1.
      scaleVec.set(0.85 + (k % 5) * 0.05, inst.scale, 0.9 + (k % 3) * 0.06);
      matrix.compose(position, quaternion, scaleVec);
      mesh.setMatrixAt(k, matrix);
      // Jitter from the placement yaw: already well distributed, and free.
      mesh.setColorAt(k, tintAt(inst.x, inst.z, Math.sin(inst.yaw * 12.9898)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false; // shadow-map cost for 40k blades buys nothing
    mesh.receiveShadow = true;
    root.add(mesh);
    _chunkMeshes.push(mesh);
    _chunkMinX[chunks] = chunkMin(cxi);
    _chunkMaxX[chunks] = chunkMin(cxi) + CHUNK_EDGE_M;
    _chunkMinZ[chunks] = chunkMin(czi);
    _chunkMaxZ[chunks] = chunkMin(czi) + CHUNK_EDGE_M;
    chunks += 1;
  }

  _stats = {
    chunks,
    blades,
    triangles: blades * (2 * (BLADE_SEGMENTS - 1) + 1),
    maxDrawCalls: CHUNK_GRID * CHUNK_GRID,
  };
  return _stats;
}

/** Terrain seat with the root sink applied, so no root floats on plate seams. */
function terrainSeat(x: number, z: number): number {
  return farcrysisTerrainHeight(x, z) - ROOT_SINK_M;
}

/** Edge length of one LOD chunk on each axis (metres). */
const CHUNK_EDGE_M = (PLACEMENT_HALF_M * 2) / CHUNK_GRID;

/** Low edge of a chunk on one axis. */
function chunkMin(chunkIndex: number): number {
  return -PLACEMENT_HALF_M + chunkIndex * CHUNK_EDGE_M;
}

// ---------------------------------------------------------------------------
// Per-frame distance LOD — zero allocation
// ---------------------------------------------------------------------------

/**
 * Toggle chunk visibility against the camera. Reads two preallocated
 * Float32Arrays and writes booleans; allocates NOTHING per frame.
 * Without a camera (defensive), shows everything.
 * Wired from applyFarcrysisArtwork's terrain-hosted onBeforeRender driver.
 */
export function animateGrassField(camera?: THREE.Object3D | null): void {
  if (_chunkMeshes.length === 0) return;
  if (!camera) {
    for (let i = 0; i < _chunkMeshes.length; i++) _chunkMeshes[i].visible = true;
    return;
  }
  const maxSquared = FARCRYSIS_GRASS_DRAW_DISTANCE_M * FARCRYSIS_GRASS_DRAW_DISTANCE_M;
  const camX = camera.position.x;
  const camZ = camera.position.z;
  for (let i = 0; i < _chunkMeshes.length; i++) {
    // Distance to the chunk's FOOTPRINT: zero inside, else the gap to the
    // nearest edge. A centre test hid a 27 m chunk whose near edge was still
    // 13.5 m closer than its centre, which from the corner spawn meant grass
    // vanishing 52 m from the player.
    const dx = camX < _chunkMinX[i] ? _chunkMinX[i] - camX : (camX > _chunkMaxX[i] ? camX - _chunkMaxX[i] : 0);
    const dz = camZ < _chunkMinZ[i] ? _chunkMinZ[i] - camZ : (camZ > _chunkMaxZ[i] ? camZ - _chunkMaxZ[i] : 0);
    _chunkMeshes[i].visible = dx * dx + dz * dz <= maxSquared;
  }
}
