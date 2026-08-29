/**
 * instanced-grass-field.ts — reusable InstancedMesh TSL grass field.
 *
 * Generalisation of the proven Farcrysis donor (src/farcrysis-grass-field.ts,
 * HF-396): Bezier-curved tapered blade geometry, ONE shared TSL node material
 * per field (layered wind entirely on the GPU), per-instance clump tinting,
 * and seeded-deterministic jittered-grid placement. The donor stays untouched
 * and keeps its own tropical preset; this module exists so other arenas
 * (first consumer: Nuke Town's suburban lawns) can grow a field from region
 * RECTANGLES + an arena-specific placement filter instead of copy-pasting a
 * farcrysis-named file into atomic code.
 *
 * Differences from the donor, all deliberate:
 *   - Placement is region-rect driven (yards/verges), not island-disc driven,
 *     with a caller-supplied `placementAllowed` filter carrying the arena's
 *     keep-out truth. One jittered candidate per grid cell stays the absolute
 *     density bound.
 *   - One InstancedMesh PER REGION rather than a fixed 4x4 chunk grid: a
 *     62 x 63 m suburb never needs distance LOD (the whole map sits inside
 *     the fog near plane), so the chunk count is the draw-call count and
 *     two lawn bands mean two draws. Each mesh still gets a correct
 *     `computeBoundingSphere()` so three's frustum culling tests the real
 *     instance BOUNDS, not the geometry origin — the donor's measured gotcha
 *     (chunk-CENTRE culling clipped the field) applies to any bounds source.
 *   - The TSL graph is built per FIELD, not cached under a module-global key:
 *     the donor's 'grass|v1' cache bakes the FIRST caller's blade height and
 *     sway into a shared graph, which is exactly wrong for a module whose
 *     point is different presets per arena. One field still means one node
 *     graph and one extra pipeline however many regions it has (HF-374 rule).
 *
 * COMBAT SAFETY: presentation only. No colliders, no raycast registration,
 * every mesh tagged `presentationOnly` + `blocksShots:false`; blade height is
 * hard-capped by construction (scale.y <= 1 against the authored geometry).
 * Determinism: all placement derives from one fixed-seed mulberry32 stream.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, type Node } from 'three/webgpu';
import {
  float,
  fract,
  instanceIndex,
  materialColor,
  mix,
  normalize,
  positionLocal,
  positionViewDirection,
  positionWorld,
  sin,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';

// ---------------------------------------------------------------------------
// Public configuration surface
// ---------------------------------------------------------------------------

export type GrassRegionRect = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}>;

/**
 * Per-instance clump tint coefficients. Channel = (base + warm * w) * value
 * where w is a low-frequency spatial "warmth" field in [0,1] (metres-scale
 * clumps of yellower and deeper green) and value adds broad patchiness plus a
 * small per-blade jitter. `material.color` MULTIPLIES and is capped at white,
 * so every channel must stay <= 1 BEFORE the value multiply — the donor's
 * first cut peaked at 1.058 on red and silently threw that range away.
 */
export type GrassClumpTint = Readonly<{
  rBase: number; rWarm: number;
  gBase: number; gWarm: number;
  bBase: number; bWarm: number;
  valueBase: number; valuePatch: number; valueJitter: number;
}>;

/** Worst-case channel factor a tint spec can produce (must stay <= 1). */
export function grassClumpTintPeak(tint: GrassClumpTint): number {
  return Math.max(
    tint.rBase + Math.max(0, tint.rWarm),
    tint.gBase + Math.max(0, tint.gWarm),
    tint.bBase + Math.max(0, tint.bWarm),
  );
}

export type GrassFieldMaterialOptions = Readonly<{
  /** Base albedo (multiplied by the per-instance tint). */
  color: number;
  roughness?: number;
  metalness?: number;
  /** Max lateral tip displacement at full gust (metres). 0 disables sway. */
  swayAmount: number;
  /** Wind time multiplier; < 1 = calmer than the tropical donor. */
  windSpeed?: number;
  /** Backlit translucency tint; omit to skip the SSS term. */
  sssColor?: number;
  /** Backlit translucency strength 0..1 (default 0 = off). */
  sssStrength?: number;
  /** Root-shade multiplier RGB (fraction of base colour at the blade root).
   * The tropical donor's dark humus [0.42, 0.5, 0.38] reads as burnt stubble
   * on a bright kept lawn; suburban presets pass a lighter shade. */
  rootShade?: readonly [number, number, number];
}>;

export interface InstancedGrassFieldOptions {
  /** Mesh name prefix, e.g. 'nuketown-lawn'. */
  name: string;
  /** Fixed placement seed — identical field on every peer. */
  seed: number;
  /** Placement rectangles (yards, verges). One InstancedMesh per region. */
  regions: readonly GrassRegionRect[];
  /** Jittered-grid cell edge (metres); 1 candidate per cell bounds density. */
  cellSizeM?: number;
  /** Hard cap on rendered blade height (metres) — geometry is built to it. */
  bladeHeightM: number;
  /** Blade width at the root (metres); tapers to a point. */
  bladeWidthM?: number;
  /** Static lean baked into every blade (metres of tip offset). */
  bladeBendM?: number;
  /** Per-instance height scale range; the max is clamped to 1.0. */
  scaleRange?: readonly [number, number];
  /** Blades sink slightly so roots never float on plate seams (metres). */
  rootSinkM?: number;
  /** Blades merged into each instanced tuft (default 1 = single blade).
   * A 3-blade tuft triples visual density per instance for the same
   * instance count - the vegetation skill's merged-geometry recipe. */
  bladesPerTuft?: number;
  /** Ground height lookup; default flat 0. */
  groundY?: (x: number, z: number) => number;
  /** Arena keep-out truth: return false to reject a candidate. */
  placementAllowed?: (x: number, z: number) => boolean;
  material: GrassFieldMaterialOptions;
  /** Per-instance clump tint; null disables instance colors entirely. */
  tint?: GrassClumpTint | null;
}

export interface InstancedGrassFieldStats {
  blades: number;
  triangles: number;
  drawCalls: number;
  regions: number;
}

export interface InstancedGrassField {
  group: THREE.Group;
  meshes: readonly THREE.InstancedMesh[];
  stats: Readonly<InstancedGrassFieldStats>;
  /** Advance the shared wind clock (seconds). No-op on the WebGL2 route. */
  advanceWind(seconds: number): void;
  /** Dispose geometry + material (the group's parent removes the nodes). */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Blade geometry — quadratic Bezier taper strip (donor geometry, parameterised)
// ---------------------------------------------------------------------------

const BLADE_SEGMENTS = 3;

export function createGrassBladeGeometry(
  heightM: number,
  widthM: number,
  bendM: number,
  name: string,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < BLADE_SEGMENTS; row += 1) {
    const t = row / BLADE_SEGMENTS;
    const cy = t * bendM * 0.55 + t * t * (heightM - bendM * 0.55);
    const cz = t * bendM * 0.55 + t * t * (bendM - bendM * 0.55);
    const halfWidth = (widthM / 2) * (1 - t * 0.82);
    positions.push(-halfWidth, cy, cz);
    positions.push(halfWidth, cy, cz);
  }
  positions.push(bendM, heightM, bendM);

  for (let seg = 0; seg < BLADE_SEGMENTS - 1; seg += 1) {
    const l0 = seg * 2;
    const r0 = seg * 2 + 1;
    indices.push(l0, l0 + 2, r0);
    indices.push(r0, l0 + 2, r0 + 2);
  }
  const lastL = (BLADE_SEGMENTS - 1) * 2;
  indices.push(lastL, lastL + 2, lastL + 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = name;
  return geometry;
}

/** Triangles per blade for the fixed segment count. */
export const GRASS_BLADE_TRIANGLES = 2 * (BLADE_SEGMENTS - 1) + 1;

/**
 * A tuft = N blades fanned around one root, merged into ONE geometry so an
 * instance renders a clump instead of a lone blade (same instance count,
 * N x the visual density). Deterministic fixed tables - no RNG. The tallest
 * blade keeps the full authored height so the art-only height cap holds by
 * construction, exactly as for the single blade.
 */
export function createGrassTuftGeometry(
  heightM: number,
  widthM: number,
  bendM: number,
  bladesPerTuft: number,
  name: string,
): THREE.BufferGeometry {
  if (bladesPerTuft <= 1) return createGrassBladeGeometry(heightM, widthM, bendM, name);
  // Fixed per-blade variation tables (yaw, radial offset, height factor).
  const YAWS = [0, 2.09, 4.19, 1.05, 3.14, 5.24];
  const OFFS = [0, 0.024, 0.03, 0.027, 0.021, 0.033];
  const HGTS = [1, 0.82, 0.9, 0.78, 0.86, 0.8];
  const positions: number[] = [];
  const indices: number[] = [];
  const rotated = new THREE.Matrix4();
  const euler = new THREE.Euler();
  for (let blade = 0; blade < bladesPerTuft; blade += 1) {
    const part = createGrassBladeGeometry(heightM * HGTS[blade % HGTS.length], widthM, bendM, `${name}-part`);
    euler.set(0, YAWS[blade % YAWS.length], 0);
    rotated.makeRotationFromEuler(euler);
    rotated.setPosition(
      Math.cos(YAWS[blade % YAWS.length]) * OFFS[blade % OFFS.length],
      0,
      Math.sin(YAWS[blade % YAWS.length]) * OFFS[blade % OFFS.length],
    );
    part.applyMatrix4(rotated);
    const base = positions.length / 3;
    const pos = part.getAttribute('position');
    for (let i = 0; i < pos.count; i += 1) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    const idx = part.index!;
    for (let i = 0; i < idx.count; i += 1) indices.push(base + idx.getX(i));
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = name;
  return geometry;
}

// ---------------------------------------------------------------------------
// Seeded PRNG — same mulberry32 idiom as the donor
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
// Material — one TSL graph per field, plain standard material on WebGL2
// ---------------------------------------------------------------------------

function webgl2CompatRoute(): boolean {
  return typeof document !== 'undefined' && document.documentElement?.dataset.renderBackend === 'webgl2';
}

function instanceHash(salt: number) {
  const idx = float(instanceIndex);
  return fract(sin(idx.mul(12.9898).add(salt * 7.13)).mul(43758.5453));
}

function makeFieldMaterial(
  opts: GrassFieldMaterialOptions,
  bladeHeightM: number,
): { material: THREE.Material; time: { value: number } | null } {
  const roughness = opts.roughness ?? 0.86;
  const metalness = opts.metalness ?? 0.02;
  if (webgl2CompatRoute()) {
    // Same gate as the donor and vegetation's _applyTslFoliage: the compat
    // route keeps plain standard materials (no node graphs on WebGL2).
    return {
      material: new THREE.MeshStandardMaterial({
        color: opts.color, roughness, metalness, side: THREE.DoubleSide,
      }),
      time: null,
    };
  }

  const mat = new MeshStandardNodeMaterial({
    color: opts.color, roughness, metalness, side: THREE.DoubleSide,
  });
  // WebGLRenderer fallback safety (donor rule): map the node material onto
  // the standard shaderID so a non-node renderer can still compile it.
  mat.type = 'MeshStandardMaterial';

  const t = uniform(0);
  const speed = opts.windSpeed ?? 1;

  // ---- layered wind (vertex stage), donor graph parameterised ----
  const hN = positionLocal.y.div(bladeHeightM).clamp(0, 1);
  const bend = hN.mul(hN); // quadratic: tip moves, root pinned
  const phase = instanceHash(1).mul(Math.PI * 2);
  const phase2 = instanceHash(2).mul(Math.PI * 2);
  const g = sin(t.mul(1.35 * speed).add(phase));
  const g2 = sin(t.mul(1.02 * speed).add(phase2)).mul(0.6);
  // Rolling world-space gust wave so the field ripples coherently.
  const wave = sin(positionWorld.x.mul(0.22).add(positionWorld.z.mul(0.16)).sub(t.mul(2.1 * speed)));
  const gust = wave.mul(0.5).add(0.62).clamp(0.12, 1);
  const tb = sin(t.mul(4.3 * speed).add(phase.mul(2.7))).mul(0.38);
  const swayX = g.add(tb).mul(gust).mul(bend).mul(opts.swayAmount);
  const swayZ = g2.sub(tb.mul(0.7)).mul(gust).mul(bend).mul(opts.swayAmount);
  mat.positionNode = positionLocal.add(vec3(swayX, float(0), swayZ)) as unknown as Node<'vec3'>;

  // ---- root-to-tip gradient + optional backlit translucency ----
  const baseV = vec3(materialColor as unknown as Node<'vec3'>);
  const [shadeR, shadeG, shadeB] = opts.rootShade ?? [0.42, 0.5, 0.38];
  const rootShade = baseV.mul(vec3(shadeR, shadeG, shadeB));
  const grad = smoothstep(0, 0.55, hN);
  let col = mix(rootShade, baseV, grad);
  col = mix(col, baseV.mul(vec3(1.14, 1.08, 0.8)), hN.mul(0.7)) as unknown as Node<'vec3'>;
  const sssStrength = opts.sssStrength ?? 0;
  if (sssStrength > 0) {
    const L = normalize(vec3(-0.45, 0.62, -0.35));
    const back = positionViewDirection.dot(L.negate()).clamp(0, 1).pow(3);
    const sssHex = opts.sssColor ?? 0xa8d24a;
    const sss = vec3(((sssHex >> 16) & 255) / 255, ((sssHex >> 8) & 255) / 255, (sssHex & 255) / 255)
      .mul(back).mul(hN).mul(sssStrength);
    col = col.add(sss) as unknown as Node<'vec3'>;
  }
  mat.colorNode = col;

  return { material: mat, time: t as unknown as { value: number } };
}

// ---------------------------------------------------------------------------
// Field build
// ---------------------------------------------------------------------------

export function buildInstancedGrassField(options: InstancedGrassFieldOptions): InstancedGrassField {
  const cell = options.cellSizeM ?? 0.33;
  const rootSink = options.rootSinkM ?? 0.02;
  const [scaleMinRaw, scaleMaxRaw] = options.scaleRange ?? [0.72, 1.0];
  // Height cap by construction: scale.y can never exceed 1 against the
  // authored geometry, so no blade renders above bladeHeightM.
  const scaleMax = Math.min(1, scaleMaxRaw);
  const scaleMin = Math.min(scaleMinRaw, scaleMax);
  const groundY = options.groundY ?? (() => 0);
  const allowed = options.placementAllowed ?? (() => true);
  const tint = options.tint === undefined ? null : options.tint;
  if (tint && grassClumpTintPeak(tint) > 1 + 1e-9) {
    throw new Error(`${options.name}: tint spec peaks above 1.0 (${grassClumpTintPeak(tint).toFixed(3)}) — the range above material.color's white cap is silently thrown away`);
  }

  const bladesPerTuft = Math.max(1, Math.floor(options.bladesPerTuft ?? 1));
  const geometry = createGrassTuftGeometry(
    options.bladeHeightM,
    options.bladeWidthM ?? 0.055,
    options.bladeBendM ?? 0.09,
    bladesPerTuft,
    `${options.name}-blade`,
  );
  const { material, time } = makeFieldMaterial(options.material, options.bladeHeightM);

  const group = new THREE.Group();
  group.name = options.name;
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;

  const rng = mulberry32(options.seed);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scaleVec = new THREE.Vector3();
  const bladeColor = new THREE.Color();

  const tintAt = (x: number, z: number, jitter: number): THREE.Color => {
    const spec = tint!;
    const clump = Math.sin(x * 0.11 + 1.7) * Math.cos(z * 0.09 - 0.6);
    const patch = Math.sin(x * 0.31 - 2.2) * Math.cos(z * 0.27 + 1.1);
    const warm = 0.5 + 0.5 * clump;
    const value = spec.valueBase + spec.valuePatch * patch + spec.valueJitter * jitter;
    bladeColor.setRGB(
      (spec.rBase + spec.rWarm * warm) * value,
      (spec.gBase + spec.gWarm * warm) * value,
      (spec.bBase + spec.bWarm * warm) * value,
    );
    return bladeColor;
  };

  const meshes: THREE.InstancedMesh[] = [];
  let blades = 0;
  for (let regionIndex = 0; regionIndex < options.regions.length; regionIndex += 1) {
    const region = options.regions[regionIndex];
    // Deterministic candidate pass — the RNG stream is consumed identically
    // regardless of rejections, so a keep-out change never rearranges the
    // rest of the field.
    const instances: Array<{ x: number; z: number; yaw: number; scale: number }> = [];
    for (let pz = region.minZ; pz < region.maxZ; pz += cell) {
      for (let px = region.minX; px < region.maxX; px += cell) {
        const x = px + rng() * cell;
        const z = pz + rng() * cell;
        const yaw = rng() * Math.PI * 2;
        const scale = scaleMin + rng() * (scaleMax - scaleMin);
        if (x > region.maxX || z > region.maxZ) continue;
        if (!allowed(x, z)) continue;
        instances.push({ x, z, yaw, scale });
      }
    }
    if (instances.length === 0) continue;

    const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
    mesh.name = `${options.name}-region-${regionIndex}`;
    for (let k = 0; k < instances.length; k += 1) {
      const inst = instances[k];
      euler.set(0, inst.yaw, 0);
      quaternion.setFromEuler(euler);
      position.set(inst.x, groundY(inst.x, inst.z) - rootSink, inst.z);
      scaleVec.set(0.85 + (k % 5) * 0.05, inst.scale, 0.9 + (k % 3) * 0.06);
      matrix.compose(position, quaternion, scaleVec);
      mesh.setMatrixAt(k, matrix);
      if (tint) mesh.setColorAt(k, tintAt(inst.x, inst.z, Math.sin(inst.yaw * 12.9898)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Donor gotcha, applied to frustum culling: the bounding volume must wrap
    // the instance BOUNDS, not the geometry at the origin.
    mesh.computeBoundingSphere();
    mesh.castShadow = false; // shadow-map cost for thousands of blades buys nothing
    mesh.receiveShadow = true;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    group.add(mesh);
    meshes.push(mesh);
    blades += instances.length;
  }

  const stats: InstancedGrassFieldStats = {
    blades,
    triangles: blades * GRASS_BLADE_TRIANGLES * bladesPerTuft,
    drawCalls: meshes.length,
    regions: options.regions.length,
  };

  return {
    group,
    meshes,
    stats,
    advanceWind: (seconds: number) => {
      if (time) time.value = seconds;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
