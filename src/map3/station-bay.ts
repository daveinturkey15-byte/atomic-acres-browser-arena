/**
 * map3/station-bay.ts — HF-421: the dark-interior lighting look, as a kit.
 *
 * WHAT THIS IS. The owner asked for "that subway lighting" after seeing a
 * browser subway FPS. The technique study (`docs/technique-studies/
 * subway-scene-lighting-look.md`) established by three falsifiers that the
 * reference buys none of it with lighting technology: no sampling noise (not
 * path traced), no colour bleed off saturated props (no real-time GI), and no
 * cast shadows at all under a lit fixture (no baked GI either). The look is
 * emissive fixtures + value composition + distance darkening + decal grime +
 * a filmic post chain, and every one of those is already affordable here.
 *
 * So this module adds NO renderer feature. It is an additive dressing kit for
 * ONE corridor — corridor 6, the god-ray colonnade, which is already the
 * closest thing Map 3 has to an underground station bay — built from boxes,
 * planes, four NodeMaterials and eight real lights.
 *
 * FOUR MATERIALS, ALL BUILT AT CONSTRUCTION. The pipeline tripwire
 * (`scripts/qa/probe-pipeline-compile-stalls-cdp.mjs`) must read 0 in-combat
 * material creations, so nothing here is created lazily, per-frame or on an
 * event. `update()` moves transforms and uniforms and creates nothing.
 *
 *   1. fixtureMat — the emissive tube face. `emissiveNode`, the shipped
 *      precedent being `corridors.ts:357` (`headlightMat.emissiveNode =
 *      rgb(0xffe899, 2.5)`). Per-vertex `aGain` lets the one bright exposure
 *      moment share the material instead of forking a fifth variant.
 *   2. glowMat — halo cards and floor light pools. Additive, unlit, radial
 *      TSL falloff. The halo is NOT a second light and NOT a lower bloom
 *      threshold: `ART_DIRECTION_SAFETY_BOUNDS.bloomThresholdScale` is
 *      [1, 1.3] and only moves up, by design.
 *   3. wallMat — grimed wall dressing (dado, frieze, duct run, service pipe).
 *   4. floorMat — grimed platform floor with the saturated edge stripe.
 *
 * Materials 3 and 4 share one procedural mask stack (fBM stains + a real
 * Worley F1 blotch field + a vertical streak field), seeded per surface, in
 * the manner of `src/rendering/surface-forge.ts` and
 * `src/map3/foliage-material.ts` — but entirely in TSL, with no raster and no
 * imported image.
 *
 * READABILITY IS A HARD BOUND, NOT A TASTE. Darkness is a gameplay change. The
 * depth band darkens the far end and leaves the first 20 m — engagement
 * distance — nearly untouched, and `?probe=1` builds three matte silhouette
 * probes at 15 m so the separation can be MEASURED rather than asserted.
 *
 * Repo contract: three/webgpu NodeMaterials with TSL only. No ShaderMaterial,
 * no RawShaderMaterial, no onBeforeCompile, nothing imported.
 */
import * as THREE from 'three';
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  abs, attribute, clamp, float, floor, fract, min, mix, positionLocal, sin,
  smoothstep, uv, vec2, vec3,
} = TSL as unknown as Record<string, any>;

import { fbm2 } from './noise';
import { rgb } from './foliage-material';

export interface StationBayOptions {
  /** Corridor interior width in metres. */
  width: number;
  /** Corridor length along local -z. */
  length: number;
  /** Underside of the roof slab. */
  roofY: number;
  /** Column pitch along -z. */
  baySpacing: number;
  /** z of the first column line. */
  firstColumnZ: number;
  /** Number of column lines. */
  numColumns: number;
  /** Inner face of the closed (+x) wall. */
  wallInnerX: number;
  /** Per-surface grime seed. */
  seed?: number;
  /**
   * How many of the two focal spots cast shadows. DEFAULT 0, and the default
   * is MEASURED, not taste.
   *
   * The first build shipped both spots shadowed. Measured on the same view,
   * same machine, ComfyUI idle: draws 142 -> 187 (+45, budget +12) and
   * triangles 321k -> 414k (+93k, budget +40k). Almost none of that is this
   * kit's own geometry (~900 triangles all told) - it is the two extra shadow
   * passes re-drawing the whole merged colonnade. Frame time never moved, so
   * this is a draw-call budget failure, not a frame-time one, and widening the
   * budget to fit was never on the table.
   *
   * Cutting them is also the more faithful answer: the studied reference has
   * NO cast shadows anywhere - a thick column standing under a lit fixture
   * casts nothing - which is one of the three falsifiers that ruled out baked
   * GI in the first place. The light pools come from the halo/pool cards and
   * the six short-range points, which is how the reference gets them too.
   */
  shadowedSpots?: 0 | 1 | 2;
  /**
   * Build the dressing at all. DEFAULT true; `false` leaves only the probes.
   *
   * This exists so the readability metric is an A/B of the SAME build, the
   * same run and the same pose - `?probe=1&bay=0` against `?probe=1` - rather
   * than a comparison across two builds captured minutes apart with the sun,
   * the motes and two rolling spheres all in different places. It is a
   * measurement flag, reachable only by a query string no player types.
   */
  dressing?: boolean;
  /**
   * Build the readability probes. Opt-in, because they are measurement
   * furniture and must never ship into a match: the caller passes
   * `probeMode()` which is false unless the page URL carries `probe=1`.
   */
  probes?: boolean;
}

export interface StationBayStats {
  /** Materials this kit creates. The budget is 4 (probe material excluded). */
  materials: number;
  /** Draw-call families this kit adds. The budget is +12. */
  meshes: number;
  shadowedLights: number;
  unshadowedLights: number;
  triangles: number;
}

export interface StationBay {
  group: THREE.Group;
  stats: StationBayStats;
  update(elapsed: number, dt: number): void;
  dispose(): void;
}

/**
 * True when the page asked for the readability probes.
 *
 * Deliberately a URL flag and not a build flag: the capture harness can turn
 * the probes on for one run without a rebuild, and a real player never can,
 * because nothing in the game navigates with this query.
 */
export function probeMode(): boolean {
  try {
    return typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('probe') === '1';
  } catch {
    return false;
  }
}

/**
 * False when the page asked for the kit to be left out (`bay=0`).
 *
 * The other half of the same-build A/B: `?probe=1&bay=0` is the before,
 * `?probe=1` is the after, and nothing else about the run differs.
 */
export function stationBayDressing(): boolean {
  try {
    return typeof window === 'undefined'
      || new URLSearchParams(window.location.search).get('bay') !== '0';
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Geometry helpers — boxes and planes, with a per-vertex gain channel  */
/* ------------------------------------------------------------------ */

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

/** A horizontal quad, facing up, centred on (x, y, z). */
function quadXZ(w: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

/**
 * Merge geometries and carry a per-geometry constant into a vertex attribute.
 *
 * This is the whole reason the exposure moment does not need a fifth material:
 * the tram lamp is the same `fixtureMat` as the thirteen static tubes, with
 * `aGain` 3.4 instead of 1.0 baked into its vertices. One material, one
 * pipeline, two brightnesses.
 */
function mergeWithGain(items: Array<{ geo: THREE.BufferGeometry; gain: number }>): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const gain: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const { geo, gain: g } of items) {
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    const u = geo.getAttribute('uv');
    for (let i = 0; i < p.count * 3; i++) pos.push(p.array[i] as number);
    for (let i = 0; i < p.count * 3; i++) nor.push(n ? (n.array[i] as number) : 0);
    for (let i = 0; i < p.count * 2; i++) uvs.push(u ? (u.array[i] as number) : 0);
    for (let i = 0; i < p.count; i++) gain.push(g);
    const gi = geo.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push((gi.array[i] as number) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setAttribute('aGain', new THREE.Float32BufferAttribute(gain, 1));
  out.setIndex(idx);
  return out;
}

/* ------------------------------------------------------------------ */
/* The grime mask stack — fBM stains, Worley blotches, vertical streaks */
/* ------------------------------------------------------------------ */

/**
 * Worley F1, properly: nearest feature point over the 3x3 neighbourhood.
 *
 * `noise.ts` exports `cellular2`, but that is a smoothstepped value noise, not
 * a cell-distance field — it gives blobs, not the hard-edged damp patches the
 * reference actually has. Damp blotches want the real thing, so it is written
 * here rather than misusing the neighbour.
 */
function worleyF1(p: any): any {
  const cell = floor(p);
  const f = fract(p);
  let best: any = float(1.5);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const o = vec2(float(ox), float(oy));
      const c = cell.add(o);
      // Two decorrelated hashes place the feature point inside its cell.
      const hx = fract(sin(c.x.mul(127.1).add(c.y.mul(311.7))).mul(43758.5453));
      const hy = fract(sin(c.x.mul(269.5).add(c.y.mul(183.3))).mul(43758.5453));
      const d = o.add(vec2(hx, hy)).sub(f);
      best = min(best, d.length());
    }
  }
  return clamp(best, float(0), float(1));
}

/**
 * One mask stack, shared by wall and floor and seeded per surface.
 *
 * Returns values in [0,1]: `stain` broad tonal drift, `damp` hard-edged wet
 * patches, `streak` the vertical/longitudinal run-off. The reference's
 * "puddles" are flat matte polygons with no reflection whatsoever and they
 * still read as wet, so nothing here touches roughness or metalness.
 */
function grimeStack(p2: any, seed: number): { stain: any; damp: any; streak: any } {
  const s = float(seed);
  const stain = fbm2(p2.mul(0.42).add(vec2(s, s.mul(1.7))), 4);
  const damp = smoothstep(float(0.42), float(0.06), worleyF1(p2.mul(0.55).add(vec2(s.mul(2.3), s))));
  const streak = fbm2(vec2(p2.x.mul(2.6), p2.y.mul(0.28)).add(vec2(s.mul(3.1), s.mul(0.7))), 3);
  return { stain, damp, streak };
}

/* ------------------------------------------------------------------ */

export function createStationBay(opts: StationBayOptions): StationBay {
  const {
    width: W, length: LEN, roofY: ROOF_Y, baySpacing: BAY, firstColumnZ: FIRST_Z,
    numColumns: NCOL, wallInnerX: WALL_IN, seed = 41, probes = false,
    shadowedSpots = 0, dressing = true,
  } = opts;

  const group = new THREE.Group();
  group.name = 'map3-station-bay';
  /** Everything the kit adds, so one flag can take it all out for the A/B. */
  const kit = new THREE.Group();
  kit.name = 'map3-station-bay-kit';
  kit.visible = dressing;
  group.add(kit);
  const disposables: Array<{ dispose(): void }> = [];

  const HALF = W / 2;
  const NBAY = Math.max(1, NCOL - 1);
  /** Centre z of bay i. */
  const bayZ = (i: number): number => FIRST_Z - i * BAY - BAY / 2;

  /**
   * Depth band: 1.0 at the mouth, still 0.86 at 15 m (engagement distance),
   * 0.30 at the far wall. This is the "aggressive distance darkening" the
   * technique lives on, and it is deliberately flat over the first 20 m so it
   * cannot eat an enemy silhouette at the range players actually fight at.
   * The vignette is NOT touched: `vignetteBase` is capped at 0.24 on purpose.
   */
  const depthBand = (): any => {
    const d = positionLocal.z.negate();
    return mix(float(1.0), float(0.30), smoothstep(float(6.0), float(LEN), d));
  };

  /* --- 1. fixtureMat: the emissive tube face ----------------------- */

  const fixtureMat = new MeshStandardNodeMaterial();
  fixtureMat.roughness = 0.45;
  fixtureMat.metalness = 0.0;
  fixtureMat.colorNode = vec3(0.05, 0.05, 0.055);
  {
    // Tube ends dim slightly, the way a real fluorescent does; and `aGain`
    // carries the exposure moment on the same pipeline as the static tubes.
    const along = abs(uv().x.sub(0.5)).mul(2.0);
    const falloff = mix(float(1.0), float(0.55), smoothstep(float(0.7), float(1.0), along));
    fixtureMat.emissiveNode = rgb(0xffe6b0).mul(attribute('aGain', 'float')).mul(falloff).mul(2.6);
  }
  disposables.push(fixtureMat);

  /* --- 2. glowMat: halo cards and floor light pools ---------------- */

  const glowMat = new MeshBasicNodeMaterial();
  glowMat.transparent = true;
  glowMat.depthWrite = false;
  glowMat.blending = THREE.AdditiveBlending;
  glowMat.side = THREE.DoubleSide;
  glowMat.fog = false;
  glowMat.toneMapped = true;
  {
    const r = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const radial = smoothstep(float(1.0), float(0.0), clamp(r, float(0), float(1)));
    // Squared falloff reads as a light pool rather than a painted disc.
    glowMat.colorNode = rgb(0xffd79a).mul(radial.mul(radial)).mul(attribute('aGain', 'float')).mul(0.55);
    glowMat.opacityNode = radial.mul(radial).mul(attribute('aGain', 'float')).mul(0.85);
  }
  disposables.push(glowMat);

  /* --- 3/4. wallMat and floorMat: one grime stack, two seeds ------- */

  const wallMat = new MeshStandardNodeMaterial();
  wallMat.roughness = 0.94;
  wallMat.metalness = 0.0;
  {
    const p2 = vec2(positionLocal.z.mul(0.9), positionLocal.y.mul(0.9));
    const { stain, damp, streak } = grimeStack(p2, seed);
    // Tile above the dado, painted concrete below it; the frieze band reads as
    // a lighter course. All value, no saturation: ~85% of the frame is meant
    // to sit in one narrow desaturated mid-dark band.
    const tile = mix(vec3(0.30, 0.315, 0.30), vec3(0.355, 0.365, 0.35), stain);
    const plinth = mix(vec3(0.155, 0.165, 0.16), vec3(0.20, 0.205, 0.195), stain);
    const base = mix(plinth, tile, smoothstep(float(1.35), float(1.55), positionLocal.y));
    const stained = mix(base, vec3(0.115, 0.12, 0.10), streak.mul(0.55));
    const wet = mix(stained, vec3(0.075, 0.082, 0.078), damp.mul(0.7));
    wallMat.colorNode = wet.mul(depthBand());
  }
  disposables.push(wallMat);

  const floorMat = new MeshStandardNodeMaterial();
  floorMat.roughness = 0.97;
  floorMat.metalness = 0.0;
  {
    const p2 = vec2(positionLocal.x.mul(1.1), positionLocal.z.mul(1.1));
    const { stain, damp, streak } = grimeStack(p2, seed + 17);
    const slab = mix(vec3(0.185, 0.19, 0.185), vec3(0.235, 0.24, 0.23), stain);
    const scuffed = mix(slab, vec3(0.10, 0.105, 0.10), streak.mul(0.5));
    const wet = mix(scuffed, vec3(0.055, 0.06, 0.058), damp.mul(0.8));
    // ONE saturated accent: the platform edge stripe on the open colonnade
    // side. Amber, and deliberately not any colour the HUD uses for a hostile
    // or an objective — a grime accent must never read as a gameplay signal.
    const edge = smoothstep(float(0.10), float(0.02), abs(positionLocal.x.add(float(HALF - 0.75))));
    const stripe = mix(wet, vec3(0.62, 0.45, 0.10), edge);
    floorMat.colorNode = stripe.mul(depthBand());
  }
  disposables.push(floorMat);

  /* --- Static geometry -------------------------------------------- */

  const meshes: THREE.Mesh[] = [];
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    kit.add(m);
    meshes.push(m);
    disposables.push(geo);
    return m;
  };

  // Thirteen ceiling tubes, one per bay, merged into one draw.
  {
    const items: Array<{ geo: THREE.BufferGeometry; gain: number }> = [];
    for (let i = 0; i < NBAY; i++) {
      const z = bayZ(i);
      items.push({ geo: box(0.20, 0.09, 1.75, 0, ROOF_Y - 0.62, z), gain: 1.0 });
      // Housing shoulders, so the tube reads as a fitting and not a floating bar.
      items.push({ geo: box(0.30, 0.10, 0.16, 0, ROOF_Y - 0.55, z + 0.95), gain: 0.12 });
      items.push({ geo: box(0.30, 0.10, 0.16, 0, ROOF_Y - 0.55, z - 0.95), gain: 0.12 });
    }
    const geo = mergeWithGain(items);
    items.forEach((it) => it.geo.dispose());
    const m = addMesh(geo, fixtureMat, 'map3-station-bay-tubes');
    m.castShadow = false;
    m.receiveShadow = false;
  }

  // Halo cards under each tube, and the floor light pool beneath it. Both are
  // the same additive material; neither is a light.
  {
    const items: Array<{ geo: THREE.BufferGeometry; gain: number }> = [];
    for (let i = 0; i < NBAY; i++) {
      const z = bayZ(i);
      items.push({ geo: quadXZ(2.4, 1.3, 0, ROOF_Y - 0.72, z), gain: 1.0 });
      items.push({ geo: quadXZ(3.2, 3.2, 0, 0.03, z), gain: 0.55 });
    }
    const geo = mergeWithGain(items);
    items.forEach((it) => it.geo.dispose());
    const m = addMesh(geo, glowMat, 'map3-station-bay-halos');
    m.renderOrder = 4;
  }

  // Wall dressing: dado, frieze, plinth on the closed side; a low parapet on
  // the open colonnade side; a duct run and a service pipe under the roof.
  {
    const items: Array<{ geo: THREE.BufferGeometry; gain: number }> = [];
    const midZ = -LEN / 2 + 0.5;
    const run = LEN - 1.2;
    const xIn = WALL_IN - 0.06;
    items.push({ geo: box(0.10, 0.55, run, xIn, 1.05, midZ), gain: 0 });        // dado band
    items.push({ geo: box(0.07, 0.13, run, xIn + 0.01, 2.42, midZ), gain: 0 }); // frieze line
    items.push({ geo: box(0.14, 0.34, run, xIn - 0.02, 0.17, midZ), gain: 0 }); // skirting
    items.push({ geo: box(0.18, 0.44, run, -(HALF - 0.28), 0.22, midZ), gain: 0 }); // parapet
    items.push({ geo: box(0.36, 0.24, run, 1.62, ROOF_Y - 0.58, midZ), gain: 0 });  // duct
    items.push({ geo: box(0.17, 0.17, run, 2.05, ROOF_Y - 1.00, midZ), gain: 0 });  // service pipe
    for (let i = 0; i < NCOL; i++) {
      const z = FIRST_Z - i * BAY;
      // Pilaster strip on the closed wall at each column line: the repetition
      // at a known pitch is what reads as "built by someone who knew it".
      items.push({ geo: box(0.08, 3.1, 0.55, xIn - 0.01, 1.9, z), gain: 0 });
      if (i % 3 === 0) items.push({ geo: box(0.10, 0.46, 0.10, 2.05, ROOF_Y - 0.72, z), gain: 0 }); // pipe hanger
    }
    const geo = mergeWithGain(items);
    items.forEach((it) => it.geo.dispose());
    const m = addMesh(geo, wallMat, 'map3-station-bay-dressing');
    // Not a shadow caster. Every caster is one more draw in the sun's shadow
    // pass, these are 8-18 cm trim pieces whose shadows are visual noise, and
    // the reference this look comes from has no cast shadows at all.
    m.castShadow = false;
    m.receiveShadow = true;
  }

  // Platform floor overlay: two triangles, carrying the grime and the stripe.
  {
    const geo = mergeWithGain([{ geo: quadXZ(W - 0.5, LEN - 1.0, 0, 0.014, -LEN / 2 + 0.4), gain: 0 }]);
    const m = addMesh(geo, floorMat, 'map3-station-bay-platform');
    m.receiveShadow = true;
  }

  /* --- The one exposure moment: a service tram running the bay ----- */

  const tram = new THREE.Group();
  tram.name = 'map3-station-bay-tram';
  kit.add(tram);
  {
    const items = [
      { geo: box(0.62, 0.30, 0.16, 0, 0, 0), gain: 3.4 },
      { geo: box(0.16, 0.16, 0.16, -0.52, -0.06, 0), gain: 1.6 },
      { geo: box(0.16, 0.16, 0.16, 0.52, -0.06, 0), gain: 1.6 },
    ];
    const geo = mergeWithGain(items);
    items.forEach((it) => it.geo.dispose());
    const lamp = new THREE.Mesh(geo, fixtureMat);
    lamp.name = 'map3-station-bay-tram-lamp';
    tram.add(lamp);
    disposables.push(geo);

    const haloItems = [{ geo: quadXZ(4.6, 4.6, 0, -1.55, 0), gain: 2.6 }];
    const haloGeo = mergeWithGain(haloItems);
    haloItems.forEach((it) => it.geo.dispose());
    const halo = new THREE.Mesh(haloGeo, glowMat);
    halo.name = 'map3-station-bay-tram-halo';
    halo.renderOrder = 5;
    tram.add(halo);
    disposables.push(haloGeo);
  }

  /* --- Lights: 2 shadowed spots, 6 short-range unshadowed points --- */

  const spots: THREE.SpotLight[] = [];
  for (let i = 0; i < shadowedSpots; i++) {
    const z = i === 0 ? FIRST_Z - 2.2 * BAY : FIRST_Z - 8.4 * BAY;
    const spot = new THREE.SpotLight(0xffe0a8, 34, 19, 0.74, 0.55, 2);
    spot.position.set(0, ROOF_Y - 0.5, z);
    spot.target.position.set(0, 0, z - 1.2);
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 20;
    spot.shadow.bias = -0.0015;
    kit.add(spot);
    kit.add(spot.target);
    spots.push(spot);
  }

  const points: THREE.PointLight[] = [];
  for (let i = 0; i < 5; i++) {
    const z = bayZ(i * 2);
    const p = new THREE.PointLight(0xffe1a8, 9.5, 8.5, 2);
    p.position.set(0, ROOF_Y - 0.95, z);
    kit.add(p);
    points.push(p);
  }
  // The sixth unshadowed point is the tram headlight — the exposure moment.
  const tramLight = new THREE.PointLight(0xfff3d0, 52, 24, 2);
  tramLight.position.set(0, 0, 0);
  tram.add(tramLight);
  points.push(tramLight);

  /* --- Readability probes (measurement furniture, opt-in) ---------- */

  let probeMat: MeshStandardNodeMaterial | null = null;
  if (probes) {
    // A matte 18% grey body, human sized, at 15 m — engagement distance. Three
    // of them: centre line, and one against each side, because a silhouette
    // that survives against the lit wall can still vanish against the dark one.
    probeMat = new MeshStandardNodeMaterial();
    probeMat.roughness = 0.95;
    probeMat.metalness = 0.0;
    probeMat.colorNode = vec3(0.18, 0.18, 0.18);
    disposables.push(probeMat);
    const probeGeo = new THREE.BoxGeometry(0.58, 1.8, 0.36);
    disposables.push(probeGeo);
    for (const x of [-2.4, 0, 2.4]) {
      const m = new THREE.Mesh(probeGeo, probeMat);
      m.name = 'map3-station-bay-readability-probe';
      m.position.set(x, 0.9, -15);
      m.castShadow = false;
      m.receiveShadow = true;
      group.add(m);
      meshes.push(m);
    }
  }

  /* --- Stats, measured from what was actually built ---------------- */

  let triangles = 0;
  kit.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const idx = m.geometry.getIndex();
    triangles += idx ? idx.count / 3 : (m.geometry.getAttribute('position')?.count ?? 0) / 3;
  });

  const stats: StationBayStats = {
    materials: 4,
    // Draw families: tubes, halos, dressing, platform, tram lamp, tram halo.
    meshes: 6 + (probes ? 3 : 0),
    shadowedLights: spots.length,
    unshadowedLights: points.length,
    triangles: Math.round(triangles),
  };

  /* --- Update: transforms and nothing else ------------------------ */

  const TRAM_PERIOD = 11.0;
  const TRAM_Z0 = FIRST_Z - 0.5;
  const TRAM_Z1 = FIRST_Z - (NCOL - 1) * BAY + 1.0;

  return {
    group,
    stats,
    update(elapsed: number): void {
      // One exposure event, on a loop: the tram runs the bay, blows the frame
      // out as it passes, and leaves. Exactly one — two is a light show.
      const phase = (elapsed % TRAM_PERIOD) / TRAM_PERIOD;
      const z = TRAM_Z0 + (TRAM_Z1 - TRAM_Z0) * phase;
      tram.position.set(0, ROOF_Y - 2.6, z);
      // A slow lateral sway so it never looks like a slider on a rail.
      tram.position.x = Math.sin(elapsed * 0.7) * 0.18;
    },
    dispose(): void {
      for (const s of spots) s.dispose();
      for (const p of points) p.dispose();
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
