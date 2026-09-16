import * as THREE from 'three';

/**
 * LANE-E (sky + horizon), graybox wave 2026-09-14 — the distant band behind
 * `atomic-acres-rebuild`.
 *
 * THE MEASURED PROBLEM. The 2026-09-16 real-GPU capture of this arena
 * (artifacts/viewpoint-regression/pre-polish/atomic-acres-rebuild/) reads as a
 * flat pastel graybox: the sky patch measures mean 199 / stddev 8.45 — a
 * near-constant pale blue with one soft white blob in it — and the ground runs
 * to a bare horizon with nothing behind it. Every one of the owner's photoreal
 * references (atomic-acres-catalog/_judge/refs/street-teal.png, street-yellow,
 * road-far-end, road-entrance, layout-angle) puts a DESATURATED MOUNTAIN RANGE
 * on that horizon with a warm scrub band in front of it, and that distant band
 * is a large part of why they read as photographs rather than as massing.
 *
 * WHAT THIS MODULE IS. Two draws of presentation-only geometry:
 *   1. A sky dome that replaces the flat background gradient with a real
 *      vertical range — saturated desert blue at the zenith through to the
 *      preset's own warm horizon stop — and a haze band where sky meets land.
 *   2. Three concentric ridge ribbons (far mesas, mid range, near scrub/butte
 *      foot) carrying baked aerial perspective in VERTEX COLOUR: each band is
 *      pale and hazy at its base and darker/bluer at its peaks, and each band
 *      further out sits closer to the haze colour than the one in front of it.
 *
 * NO TEXTURES, NO GLBs, NO LIGHTS. Lane D owns `public/assets/**` and is
 * rewriting it; this lane is geometry + vertex colour only. Nothing here is a
 * `THREE.Light`, so the PASS 82 light-set freeze is untouched: the structural
 * lighting key does not move and no shader program is invalidated. Both
 * materials are `MeshBasicMaterial`, which takes part in no lighting variant.
 *
 * WHY IT IS CAMERA-LOCKED, AND WHY THAT IS THE ONLY OPTION HERE. The band has
 * to sit beyond the arena's 140 x 150 m desert apron (half-extents 70 x 75, so
 * a 102.6 m half-diagonal) and still be inside the view frustum. This arena's
 * gameplay far plane is 180 m (legacy-main.ts `desiredFarPlane`) and its review
 * cameras run the shared default far of 190 m (rendering/arenas/shared.ts
 * `camera()`), and the overview station sits 100 m out from the origin at
 * [64, 54, 77]. A ring STATIC at the origin with a radius large enough to clear
 * the apron would therefore be 100 + R metres away across the back of that
 * frame — 268 m at R = 168 — i.e. clipped away exactly where the mountains are
 * wanted. Locking the ring's XZ to the camera (its Y stays pinned to world
 * zero, so the horizon line never floats) holds every band at a CONSTANT
 * distance well inside both far planes from every station. Map 3 solves the
 * same problem the other way, by raising its far plane to 450 for a static
 * r265 dome; that edit lives in legacy-main.ts, which this lane does not own.
 *
 * The lock is also what makes the band unreachable and unshootable by
 * construction rather than by policy: it recedes as the player walks, so there
 * is no world position at which it can be touched. It carries no collider, it
 * is attached to the persistent scene rather than to the arena's authority
 * root, every mesh has `raycast` stubbed out, and both roots are flagged
 * `presentationOnly` / `blocksShots: false`.
 *
 * THE COST THAT BUYS IT: 2 draw calls, 1,584 triangles (1,008 dome + 576 ridge,
 * measured off the built geometry by `telemetry()`), zero texture samples
 * and zero texture memory. Geometry is built once and never rebuilt; the
 * per-frame work is one position compare and, when it moves, one
 * `updateMatrix()` on each of two roots (`matrixAutoUpdate` is off precisely so
 * the frame loop is not recomposing two matrices per frame for nothing).
 *
 * DEPTH CONTRACT. Both draws are `depthWrite: false`, `depthTest: false` at a
 * strongly negative `renderOrder`, so they land in the opaque list immediately
 * after `scene.background` and every real object in the world paints over them.
 * That is deliberate: the apron's own horizon line then acts as the base of the
 * mountains for free, with no depth tuning and no risk of the band occluding
 * gameplay geometry, and nothing in the band can ever hide a player.
 */

/** The one arena this band belongs to. Every other arena must stay bit-identical. */
export const ATOMIC_ACRES_REBUILD_HORIZON_ARENA_ID = 'atomic-acres-rebuild';

/**
 * THE SKY RANGE, zenith-first, as (elevation fraction, sRGB hex).
 *
 * The elevation fraction is `sin(elevation)`, i.e. `y / radius` on the dome, so
 * 1 is straight up and 0 is the true horizon. A player at eye level under this
 * arena's 70-degree review FOV sees roughly 0.00-0.57 of that range, which is
 * why the blue is spent low: authoring a saturated zenith above 0.62 and
 * leaving the visible band pale is exactly the mistake sky-backdrop.ts records
 * against the first jungle-golden-hour attempt.
 *
 * The 0.00 stop is `#e7d9ba`, which is not a new colour: it is the authored
 * horizon stop of the 'range-midmorning' preset this arena already runs
 * (rendering/sky-backdrop.ts), so the dome meets the background gradient and
 * the arena's own fog colour (0xe0ddd2) on the warm side rather than fighting
 * them.
 *
 * These stops are graded by the arena's colour pipeline like everything else
 * (`toneMapped: true`), so they are authored a little brighter and a little
 * more saturated than the target on screen. They are exported as one frozen
 * table on purpose: re-grading this sky after a capture should be an edit to
 * this constant and nothing else.
 */
export const ATOMIC_ACRES_REBUILD_SKY_STOPS: readonly (readonly [fraction: number, hex: number])[] = Object.freeze([
  [1.00, 0x2f7fd4],
  [0.62, 0x559ce0],
  [0.34, 0x8cc0e8],
  [0.16, 0xbcd8ea],
  [0.06, 0xdfe3de],
  [0.00, 0xe7d9ba],
] as const);

/**
 * THE THREE DISTANT BANDS, far to near.
 *
 * `radius` is the constant distance the band is held at, so it is also the
 * clearance budget: all three sit past the 102.6 m apron half-diagonal and
 * inside the 180 m gameplay far plane, with the far band 12 m clear of it.
 *
 * `base`/`peak` are the AERIAL PERSPECTIVE, baked rather than fogged. Within a
 * band the base is the hazier colour and the peak the darker one, because haze
 * pools low; across bands the FAR one is closer to the sky's horizon stop than
 * the near one, which is the whole reason the references read as depth. Fog is
 * left off these materials so the result is the authored one at every station
 * instead of a function of where the 140-280 m fog band happens to land.
 */
type HorizonBand = Readonly<{
  name: string;
  radius: number;
  baseHeight: number;
  amplitude: number;
  lattice: readonly [number, number, number];
  seed: number;
  base: number;
  peak: number;
}>;

export const ATOMIC_ACRES_REBUILD_HORIZON_BANDS: readonly HorizonBand[] = Object.freeze([
  // Far mesas: the tallest silhouette, almost entirely haze-coloured. At
  // r168 a 34 m peak subtends 11.4 degrees, which is the upper end of what
  // the reference plates measure for the range behind the yellow house.
  // RE-GRADED 2026-09-16 against a real-GPU capture. The first authoring was
  // done blind (the lane could not build), and measured far too light: the
  // rendered ridge band came back rgb(223, 216, 229) on
  // artifacts/viewpoint-regression/trial/.../street-north.png against the
  // reference plate's rgb(144, 136, 139) far range and rgb(125, 106, 95) near
  // range (batch-4-nuketown-graybox/gray_topdown_01.png). That is 54% too
  // bright, which is the dominant error and the reason the ridges read as a
  // pale wash rather than as land.
  //
  // SECOND ITERATION, same day. The first scale (x0.62) moved the rendered band
  // 223 -> 197 against a 144 target, i.e. it recovered only a third of the
  // error. The authored value is not the rendered one here: these are
  // `toneMapped: true`, so the ACES curve lifts mid-tones, and the band is
  // additionally sitting behind the dome's haze stop. Rather than model that
  // chain, the scale was re-solved from the measurement itself - 144/197 = 0.73
  // applied on top of the first pass, for 0.45 against the blind original.
  // Hue was the minor term throughout: the render's ridge
  // sat at r-b = -6 against the plate's +5, ~5% of range, so these values scale
  // the authored table by 0.62 and shift it ~4% warm rather than chasing the
  // arena CDL's green cut, which is not this file's to cancel. The dome itself
  // is left alone - it already measures rgb(193, 206, 233) against the plate's
  // rgb(190, 202, 222) and is the one part that landed blind.
  Object.freeze({
    name: 'far-mesas', radius: 168, baseHeight: 15, amplitude: 19,
    lattice: [5, 11, 23] as const, seed: 1, base: 0x676156, peak: 0x525256,
  }),
  // Mid range: lower, slightly more contrast, offset lattice so no peak of
  // this band ever sits exactly under a peak of the one behind it.
  Object.freeze({
    name: 'mid-range', radius: 158, baseHeight: 8, amplitude: 14,
    lattice: [7, 13, 29] as const, seed: 2, base: 0x635b4f, peak: 0x48484e,
  }),
  // Near scrub and butte foot: warm desert soil rather than blue, low enough
  // to read as the far side of the valley rather than as another range.
  Object.freeze({
    name: 'near-scrub', radius: 148, baseHeight: 2.5, amplitude: 4.5,
    lattice: [11, 19, 37] as const, seed: 3, base: 0x5e5240, peak: 0x454235,
  }),
] as const);

/** Ring segments per band. 96 keeps a 168 m ring's segment under 11 m of arc. */
const BAND_SEGMENTS = 96;
/** Every band skirts down to here so the ridge never shows a gap at the ground line. */
const BAND_BASE_Y = -6;
/** Dome radius. Inside the 180 m gameplay far plane with 10 m of margin. */
const SKY_DOME_RADIUS = 170;
/** Dome tessellation. Colour varies with elevation only, so the rows are what matter. */
const SKY_DOME_WIDTH_SEGMENTS = 16;
const SKY_DOME_HEIGHT_SEGMENTS = 32;
/** 110 degrees of polar sweep: 20 degrees of dome below the horizon, so no gap. */
const SKY_DOME_THETA_LENGTH = (110 * Math.PI) / 180;
/** Both roots sit in the opaque list ahead of every real object. */
const SKY_DOME_RENDER_ORDER = -30;
const RIDGE_RENDER_ORDER = -20;
/** Below this the camera has not moved enough to be worth recomposing a matrix. */
const RELOCK_EPSILON_METRES = 0.01;

export type AtomicAcresRebuildHorizonTelemetry = Readonly<{
  arenaId: typeof ATOMIC_ACRES_REBUILD_HORIZON_ARENA_ID;
  attached: boolean;
  drawCalls: number;
  triangles: number;
  textureSamples: 0;
  lightsAdded: 0;
  colliders: 0;
  perFrameAllocations: 0;
}>;

/** Deterministic 32-bit hash. No Math.random: review captures are pinned. */
function hash01(value: number): number {
  let x = Math.imul(value ^ 0x2545f491, 0x9e3779b1) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x85ebca6b) >>> 0;
  x = (x ^ (x >>> 13)) >>> 0;
  return x / 4_294_967_296;
}

/**
 * Value noise on a ring, sampled at `t` in [0, 1). The lattice index wraps at
 * `lattice`, so `ringNoise(0) === ringNoise(1)` and the ridgeline closes
 * without a seam however many segments are drawn around it.
 */
function ringNoise(t: number, lattice: number, seed: number): number {
  const scaled = t * lattice;
  const cell = Math.floor(scaled);
  const frac = scaled - cell;
  const smooth = frac * frac * (3 - 2 * frac);
  const low = hash01((((cell % lattice) + lattice) % lattice) + seed * 7_919);
  const high = hash01(((((cell + 1) % lattice) + lattice) % lattice) + seed * 7_919);
  return low + (high - low) * smooth;
}

/** Three octaves of ring noise in [0, 1]. Amplitudes halve; lattices are the band's. */
function ridgeProfile(t: number, band: HorizonBand): number {
  const [a, b, c] = band.lattice;
  const raw = ringNoise(t, a, band.seed) * 0.57
    + ringNoise(t, b, band.seed + 11) * 0.29
    + ringNoise(t, c, band.seed + 23) * 0.14;
  // Ridged rather than rolling: the references are block-faulted desert
  // ranges, not dunes, so the profile is sharpened toward its peaks.
  return Math.min(1, Math.max(0, raw)) ** 0.78;
}

/** sRGB hex to the renderer's linear working space, which is what vertexColors reads. */
function linearColor(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
}

function skyStopColor(fraction: number): THREE.Color {
  const stops = ATOMIC_ACRES_REBUILD_SKY_STOPS;
  const clamped = Math.min(1, Math.max(0, fraction));
  for (let index = 0; index < stops.length - 1; index += 1) {
    const [upperFraction, upperHex] = stops[index];
    const [lowerFraction, lowerHex] = stops[index + 1];
    if (clamped <= upperFraction && clamped >= lowerFraction) {
      const span = upperFraction - lowerFraction;
      const blend = span <= 0 ? 0 : (clamped - lowerFraction) / span;
      return linearColor(lowerHex).lerp(linearColor(upperHex), blend);
    }
  }
  return linearColor(clamped >= stops[0][0] ? stops[0][1] : stops[stops.length - 1][1]);
}

function buildSkyDome(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(
    SKY_DOME_RADIUS,
    SKY_DOME_WIDTH_SEGMENTS,
    SKY_DOME_HEIGHT_SEGMENTS,
    0,
    Math.PI * 2,
    0,
    SKY_DOME_THETA_LENGTH,
  );
  geometry.name = 'lane-e-atomic-acres-rebuild-sky-dome';
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const fraction = position.getY(index) / SKY_DOME_RADIUS;
    const color = skyStopColor(fraction);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    name: 'lane-e-atomic-acres-rebuild-sky-dome',
    vertexColors: true,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'lane-e-atomic-acres-rebuild-sky-dome';
  mesh.renderOrder = SKY_DOME_RENDER_ORDER;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

function buildRidgeBands(): THREE.Mesh {
  const bands = ATOMIC_ACRES_REBUILD_HORIZON_BANDS;
  const vertexCount = bands.length * BAND_SEGMENTS * 6;
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const baseColor = new THREE.Color();
  const peakColor = new THREE.Color();
  let cursor = 0;

  const push = (x: number, y: number, z: number, color: THREE.Color, tint: number): void => {
    positions[cursor * 3] = x;
    positions[cursor * 3 + 1] = y;
    positions[cursor * 3 + 2] = z;
    colors[cursor * 3] = color.r * tint;
    colors[cursor * 3 + 1] = color.g * tint;
    colors[cursor * 3 + 2] = color.b * tint;
    cursor += 1;
  };

  for (const band of bands) {
    baseColor.copy(linearColor(band.base));
    peakColor.copy(linearColor(band.peak));
    for (let segment = 0; segment < BAND_SEGMENTS; segment += 1) {
      const t0 = segment / BAND_SEGMENTS;
      const t1 = (segment + 1) / BAND_SEGMENTS;
      const angle0 = t0 * Math.PI * 2;
      const angle1 = t1 * Math.PI * 2;
      const x0 = Math.cos(angle0) * band.radius;
      const z0 = Math.sin(angle0) * band.radius;
      const x1 = Math.cos(angle1) * band.radius;
      const z1 = Math.sin(angle1) * band.radius;
      const h0 = band.baseHeight + band.amplitude * ridgeProfile(t0, band);
      const h1 = band.baseHeight + band.amplitude * ridgeProfile(t1, band);
      // Face-to-face tonal variation, deterministic and small: enough to stop
      // the silhouette reading as one flat cut-out, never enough to band.
      const tint = 0.94 + hash01(segment + band.seed * 104_729) * 0.12;
      // Two triangles, wound both ways by DoubleSide so the ring is correct
      // whether the camera is inside it or (during a review flyover) not.
      push(x0, BAND_BASE_Y, z0, baseColor, tint);
      push(x1, BAND_BASE_Y, z1, baseColor, tint);
      push(x1, h1, z1, peakColor, tint);
      push(x0, BAND_BASE_Y, z0, baseColor, tint);
      push(x1, h1, z1, peakColor, tint);
      push(x0, h0, z0, peakColor, tint);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.name = 'lane-e-atomic-acres-rebuild-ridge-bands';
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({
    name: 'lane-e-atomic-acres-rebuild-ridge-bands',
    vertexColors: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'lane-e-atomic-acres-rebuild-ridge-bands';
  mesh.renderOrder = RIDGE_RENDER_ORDER;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/**
 * The band itself. Construction allocates; nothing after it does.
 *
 * The root is deliberately NOT parented to the arena's authority root: it is a
 * backdrop, it must survive nothing and own nothing, and keeping it out of that
 * subtree keeps it out of every collider, shot-surface and spawn traversal that
 * walks the arena.
 */
export class AtomicAcresRebuildHorizon {
  readonly root = new THREE.Group();
  private readonly skyDome: THREE.Mesh;
  private readonly ridgeBands: THREE.Mesh;
  private lockedX = Number.NaN;
  private lockedZ = Number.NaN;
  private disposed = false;

  constructor() {
    this.root.name = 'lane-e-atomic-acres-rebuild-horizon';
    this.root.userData.presentationOnly = true;
    this.root.userData.blocksShots = false;
    this.skyDome = buildSkyDome();
    this.ridgeBands = buildRidgeBands();
    this.root.add(this.skyDome, this.ridgeBands);
    this.root.traverse((node) => {
      node.userData.presentationOnly = true;
      node.userData.blocksShots = false;
      node.raycast = () => undefined;
    });
    // Recomposed only when `syncToCamera` actually moves it. Three r185
    // recomposes every auto-updated node's matrix every frame; two static
    // backdrop roots have no business being in that loop.
    this.root.matrixAutoUpdate = false;
    this.root.updateMatrix();
  }

  /**
   * Pins the band's XZ to the camera and its Y to world zero. Call once per
   * frame BEFORE the render; it allocates nothing and does no work at all on a
   * frame where the camera has not moved.
   */
  syncToCamera(camera: THREE.Camera): void {
    if (this.disposed) return;
    const x = camera.position.x;
    const z = camera.position.z;
    if (Math.abs(x - this.lockedX) < RELOCK_EPSILON_METRES && Math.abs(z - this.lockedZ) < RELOCK_EPSILON_METRES) return;
    this.lockedX = x;
    this.lockedZ = z;
    this.root.position.set(x, 0, z);
    this.root.updateMatrix();
    this.root.updateMatrixWorld(true);
  }

  /**
   * MEASURED, not asserted: the triangle count is read off the two geometries
   * that exist. A count derived from the segment constants would claim 1,600
   * (16 x 32 x 2 + 3 x 96 x 2) and be wrong by the sixteen degenerate triangles
   * SphereGeometry drops at its pole row. The real figure is 1,584.
   */
  telemetry(): AtomicAcresRebuildHorizonTelemetry {
    if (this.disposed) {
      return {
        arenaId: ATOMIC_ACRES_REBUILD_HORIZON_ARENA_ID,
        attached: false,
        drawCalls: 0,
        triangles: 0,
        textureSamples: 0,
        lightsAdded: 0,
        colliders: 0,
        perFrameAllocations: 0,
      };
    }
    let triangles = 0;
    for (const mesh of [this.skyDome, this.ridgeBands]) {
      const index = mesh.geometry.getIndex();
      triangles += (index ? index.count : mesh.geometry.getAttribute('position').count) / 3;
    }
    return {
      arenaId: ATOMIC_ACRES_REBUILD_HORIZON_ARENA_ID,
      attached: this.root.parent !== null,
      drawCalls: 2,
      triangles,
      textureSamples: 0,
      lightsAdded: 0,
      colliders: 0,
      perFrameAllocations: 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    for (const mesh of [this.skyDome, this.ridgeBands]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.root.clear();
  }
}

/**
 * The active arena, read off the scene the way legacy-main.ts and
 * rendering/arena-visual-stream.ts already read it: the gameplay root is a
 * DIRECT child of the scene and `ArenaVisualStreamController.adoptGameplayRoot`
 * stamps `userData.arenaVisualDefinitionId` on it. This is public scene-graph
 * state with an existing reader, not a back channel.
 */
export function activeArenaIdFromScene(scene: THREE.Object3D | null): string | null {
  if (!scene) return null;
  for (const child of scene.children) {
    const id = child.userData?.arenaVisualDefinitionId ?? child.userData?.authoritativeArenaId;
    if (typeof id === 'string') return id;
  }
  return null;
}

const HORIZONS_BY_SCENE = new WeakMap<THREE.Object3D, AtomicAcresRebuildHorizon>();

/**
 * Attaches the band while `atomic-acres-rebuild` is the live arena, detaches
 * and disposes it the moment anything else is, and keeps it locked to the
 * camera in between. Every other arena therefore sees exactly the scene it saw
 * before this module existed — no geometry, no material, no draw call.
 *
 * Idempotent and safe to call every frame. Returns the live band, or null.
 */
export function syncAtomicAcresRebuildHorizon(
  scene: THREE.Object3D | null,
  camera: THREE.Camera | null,
): AtomicAcresRebuildHorizon | null {
  if (!scene) return null;
  const existing = HORIZONS_BY_SCENE.get(scene) ?? null;
  const wanted = activeArenaIdFromScene(scene) === ATOMIC_ACRES_REBUILD_HORIZON_ARENA_ID;
  if (!wanted) {
    if (existing) {
      existing.dispose();
      HORIZONS_BY_SCENE.delete(scene);
    }
    return null;
  }
  const horizon = existing ?? new AtomicAcresRebuildHorizon();
  if (!existing) HORIZONS_BY_SCENE.set(scene, horizon);
  if (horizon.root.parent !== scene) scene.add(horizon.root);
  if (camera) horizon.syncToCamera(camera);
  return horizon;
}

/** Test/teardown seam: drops any band this scene owns. */
export function disposeAtomicAcresRebuildHorizon(scene: THREE.Object3D | null): void {
  if (!scene) return;
  const existing = HORIZONS_BY_SCENE.get(scene);
  if (!existing) return;
  existing.dispose();
  HORIZONS_BY_SCENE.delete(scene);
}
