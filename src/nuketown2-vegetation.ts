/**
 * nuketown2-vegetation.ts — PASS 94 lane TECHNIQUES: clipped hedges and the
 * suburban avenue, as merged/instanced foliage with real distance LOD and a
 * GPU-side wind.
 *
 * WHY THIS MODULE EXISTS. The Rebuild already carries a dense instanced lawn
 * (`nuketown-lawn-field.ts`, ~9,900 tufts) and a forest ring at 44.5 m
 * (`nuketown-forest-surround.ts`). Between the two there was NOTHING: the
 * BO2-2025 aerial (`docs/references/nuketown-2025/img/nt2025-aerial-boii.jpg`
 * on `contrib/dave-gaming-pc/claude/research-2026-09-04`, inspected 2026-09-04)
 * shows clipped box hedges edging every lawn, and a line of deciduous street
 * trees along the plaza streets OUTSIDE the two lots.
 *
 * WHAT WAS ACTUALLY THERE, corrected after looking at the review captures. An
 * earlier draft of this comment said the arena's hedge and planter bodies were
 * "plain grey boxes". They are not: `m.planter` is `0x57602f` (HF-536 muse-lawn,
 * was `0x415a33`), a dark olive green, so they already read as
 * vegetation-coloured MASSES. What they did not
 * have was any silhouette, any value gradient and any movement - and at
 * distance a green box and a green hedge are the same four pixels, which is
 * why the far LOD tier here is deliberately just the box. The visible win is
 * inside the near and mid bands, and the LOD distances below are set so those
 * bands cover the ranges a player actually fights at. The ground between the
 * perimeter wall and the forest ring, by contrast, WAS bare plain.
 *
 * TECHNIQUE PROVENANCE (register rows applied, restated in our own words):
 *   - row 18 (`CK42BB/procedural-*`, MIT): distance LOD by geometry
 *     simplification, layered wind (a global sway plus a rolling world-space
 *     gust plus a fast turbulence), and a backlit translucency approximation.
 *     Restated, not imported - both repositories are documentation-shaped and
 *     there is no runnable library to import.
 *   - row 24 (TAKEN, comparator only): ground cover has to be several distinct
 *     SPECIES, not one repeated blade. Hedge and avenue tree are two
 *     silhouette families here, not one scaled twice.
 *   - row 38 (`vibe-stack/super-terrain`, NO LICENCE - Authority 2b, learn
 *     only): species parameter sets sharing ONE material, and a mask that
 *     separates WHERE foliage may grow from HOW MUCH. Restated below as
 *     `HEDGE_SPECIES` / `TREE_SPECIES` and the placement predicate.
 *   - `threejs-procedural-vegetation` skill: mulberry32 seeded scatter, merged
 *     multi-part geometry for instancing (with the mandatory `toNonIndexed()`
 *     before `mergeGeometries`), and `computeBoundingSphere()` after the last
 *     `setMatrixAt` so spread instances are not frustum-culled.
 *
 * GAMEPLAY SAFETY - the reason this is admissible at all.
 *   - HEDGES ARE DRESSING ON EXISTING SOLIDS. Every run in
 *     `NUKETOWN2_HEDGE_DRESSING` sits on the footprint of a body the arena
 *     already emits as a collider (`verge front hedge`, `verge planter`,
 *     `verge kerb planter`, `yard alley planter`). No collider, cover read,
 *     sightline or shot surface moves - the grey box is simply no longer what
 *     you see. `nuketown2-vegetation.test.ts` pins that against the REAL
 *     constructed arena, the same way `nuketown-lawn-field.test.ts` pins the
 *     lawn keep-out table, so this cannot drift from `nuketown2-arena.ts`.
 *   - AVENUE TREES ARE OUTSIDE THE MAP. Every trunk stands outside the bounds
 *     inflated by `AVENUE_RECT_MARGIN_M` and inside the forest ring's own
 *     inner radius, so no reachable ground has a visible solid over it and no
 *     collider is owed. That band was empty before this pass.
 *   - Presentation only: `userData.presentationOnly = true` on every node, no
 *     colliders, no raycast surfaces, no shot surfaces, no gameplay authority.
 *   - Deterministic: fixed seeds, no `Math.random`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';
import { NUKETOWN2_BOUNDS, nuketown2HandedX } from './nuketown2-layout';

const {
  float,
  floor,
  fract,
  instanceIndex,
  mix,
  normalize,
  positionLocal,
  positionViewDirection,
  positionWorld,
  sin,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} = TSL as unknown as Record<string, any>;

// ---------------------------------------------------------------------------
// Seeds and budgets
// ---------------------------------------------------------------------------

/** Placement seed - identical vegetation on every peer, every build. */
export const NUKETOWN2_VEGETATION_SEED = 0x6e74_9411;

/**
 * Nothing is planted inside the arena rectangle inflated by this. The
 * perimeter wall's inner face is at |x| = 17.6 / |z| = 41.6 and the wall is
 * 0.4 m thick, so 2.4 m clears the wall's outer face by 2.0 m: an avenue tree
 * can lean over the wall without its trunk ever standing on reachable ground.
 */
export const AVENUE_RECT_MARGIN_M = 2.4;

/**
 * Outer limit for avenue planting. `NUKETOWN2_FOREST_ENVELOPE.ringInnerM` is
 * 44.5 m; stopping at 43.0 leaves a 1.5 m gap so the avenue reads as a
 * separate, kept, street planting rather than as the ragged inner edge of the
 * forest.
 */
export const AVENUE_MAX_RADIAL_M = 43.0;

/** Minimum separation between trunks, so an avenue never clumps into a copse. */
export const AVENUE_MIN_SEPARATION_M = 4.6;

/** Hard ceiling on avenue trunks, so this module cannot grow into a forest. */
export const AVENUE_TREE_BUDGET = 54;

// ---------------------------------------------------------------------------
// HF-536 look-2b: the procedurally DRAWN leaf atlas
// ---------------------------------------------------------------------------

/** Atlas edge in texels. 4 x 4 cells of 128 => one leaf per 128^2 cell. */
export const LEAF_ATLAS_SIZE = 512;
/** Cells per axis. */
export const LEAF_ATLAS_CELLS = 4;
/** Alpha cut. Below this a texel is discarded, so the card has a leaf outline. */
export const LEAF_ALPHA_TEST = 0.45;
/** Quads in one instanced sprig (a small leaf cluster). */
export const LEAF_SPRIG_CARDS = 4;
/** Sprigs per hedge run. LEAF_SPRIG_CARDS x this is the brief's 80-card cap. */
export const LEAF_SPRIGS_PER_RUN = 20;
/** Half-edge of one leaf card, metres. */
export const LEAF_CARD_HALF_M = 0.082;

/**
 * The atlas is COMPUTED, not painted on a canvas.
 *
 * `<canvas>` would have meant a `typeof document` guard, a silent no-texture
 * path in node, and a generator no unit test could look inside. A plain
 * Uint8Array filled by an ovate-leaf field is identical in the browser and in
 * vitest, so `nuketown2-vegetation.test.ts` can assert the thing that actually
 * matters - that every one of the 16 cells has leaf-shaped alpha coverage in a
 * plausible band, that the cells DIFFER from one another, and that each cell's
 * border is transparent so neighbours never bleed across a cell edge under
 * bilinear filtering.
 *
 * Leaf model, per cell, in cell-local (u, v) with u,v in [-1, 1]:
 *   t         = (v + 1) / 2, base (0) to tip (1)
 *   halfWidth = A * sin(pi * t^shape) * (1 - taper * t)   ovate: widest below
 *               the middle, drawn to a point at the tip
 *   serrated  = halfWidth * (1 + 0.075 * sin(t * teeth + phase))
 *   alpha     = 1 inside, ramped over ~2 texels at the edge
 *   albedo    = a base-to-tip green ramp plus a lighter midrib at |u| < 0.055
 * Every per-cell constant is a pure function of the cell index, so the atlas is
 * deterministic and identical on every peer and every build.
 */
export function createLeafAtlasData(
  size = LEAF_ATLAS_SIZE,
  cells = LEAF_ATLAS_CELLS,
): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  const cell = size / cells;
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      const index = cy * cells + cx;
      // Per-cell shape parameters. Spread over the 16 cells so no two leaves
      // are the same silhouette - the row 24 "several species" property,
      // applied inside one atlas.
      const amplitude = 0.50 + (index % 5) * 0.055;
      const shape = 0.60 + ((index * 3) % 7) * 0.045;
      const taper = 0.22 + ((index * 5) % 4) * 0.075;
      const teeth = 13 + (index % 6) * 3;
      const phase = index * 1.37;
      const lean = ((index % 3) - 1) * 0.16;
      const hueShift = ((index % 4) - 1.5) * 0.055;
      for (let py = 0; py < cell; py += 1) {
        for (let px = 0; px < cell; px += 1) {
          const u0 = (px + 0.5) / cell * 2 - 1;
          const v = (py + 0.5) / cell * 2 - 1;
          const t = (v + 1) / 2;
          // Lean bends the midrib, so a cell is not mirror-symmetric.
          const u = u0 - lean * t * t;
          let half = amplitude * Math.sin(Math.PI * t ** shape) * (1 - taper * t);
          half *= 1 + 0.075 * Math.sin(t * teeth + phase);
          const d = Math.abs(u) - half;
          // ~2-texel edge ramp; alphaTest turns it into a crisp outline while
          // the ramp keeps the mip chain from eating the leaf at distance.
          const edge = 2 / cell * 2;
          let alpha = d <= -edge ? 1 : d >= 0 ? 0 : -d / edge;
          // CELL GUTTER, measured not assumed. Without it the leaf's BASE nub
          // touches the bottom row of its cell (probe: every one of the 16
          // cells leaked, four at alpha 255), and bilinear filtering plus the
          // mip chain then smears one cell's leaf into its neighbour's - which
          // shows up as a grey fringe along every card, not as a leaf. Three
          // texels of forced transparency on all four sides costs 4.6 % of the
          // cell and removes the class.
          const gutter = 3;
          const fade = (Math.min(
            px + 0.5, py + 0.5, cell - 0.5 - px, cell - 0.5 - py,
          ) - 1.5) / gutter;
          if (fade < 1) alpha *= Math.max(0, fade);
          const write = ((cy * cell + py) * size + (cx * cell + px)) * 4;
          if (alpha <= 0) {
            data[write] = 0; data[write + 1] = 0; data[write + 2] = 0; data[write + 3] = 0;
            continue;
          }
          // Base-to-tip value ramp plus a pale midrib. HF-536 muse-lawn: the leaf
          // albedo follows the lawn to the boards olive (old 0.29/0.55/0.19 tip
          // sRGB ~(74, 140, 48) hue 103.0 sat 65.7% read lime; new 0.36/0.42/0.19
          // tip sRGB ~(92, 107, 48) hue 75.3 sat 55.1%, measured with the lawn).
          const ramp = 0.62 + 0.38 * t;
          const midrib = Math.abs(u) < 0.055 ? 0.22 : 0;
          const r = Math.min(1, (0.36 + hueShift) * ramp + midrib * 0.5);
          const g = Math.min(1, (0.42 + hueShift * 0.4) * ramp + midrib * 0.6);
          const b = Math.min(1, (0.19 - hueShift * 0.5) * ramp + midrib * 0.35);
          data[write] = Math.round(r * 255);
          data[write + 1] = Math.round(g * 255);
          data[write + 2] = Math.round(b * 255);
          data[write + 3] = Math.round(alpha * 255);
        }
      }
    }
  }
  return data;
}

let leafAtlasTexture: THREE.DataTexture | null = null;

/**
 * ONE atlas for the whole map, cached at module scope - the census in
 * `docs/forge/sampler-census.json` is what admits it, and it admits exactly
 * one. Building a second would spend a second sampler for no visual gain.
 */
export function nuketown2LeafAtlas(): THREE.DataTexture {
  if (leafAtlasTexture) return leafAtlasTexture;
  const texture = new THREE.DataTexture(
    createLeafAtlasData(), LEAF_ATLAS_SIZE, LEAF_ATLAS_SIZE, THREE.RGBAFormat,
  );
  texture.name = 'nuketown2-leaf-atlas';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  leafAtlasTexture = texture;
  return texture;
}

// ---------------------------------------------------------------------------
// Species (row 38's "species parameter sets", restated)
// ---------------------------------------------------------------------------

export type NuketownFoliageSpecies = Readonly<{
  id: string;
  /** Base colour of the foliage mass. */
  color: number;
  /** Backlit translucency tint - the cheap subsurface approximation. */
  sssColor: number;
  sssStrength: number;
  /** Peak lateral sway in metres at the top of the foliage mass. */
  swayM: number;
  windSpeed: number;
}>;
export const HEDGE_SPECIES: NuketownFoliageSpecies = Object.freeze({
  // DAY-VISUAL-B, retuned HF-536 muse-lawn: hedge follows the lawn to the boards olive (interim-4 boards
  // bedGround hue 61.3 sat 63.5%, surroundGround hue 68.5 sat 69.4%; old 0x33592b
  // hue 109.6 sat 51.7% read neon against the olive turf). New 0x55602e hue 73.2
  // sat 52.1%; sss 0x8fbe4e -> 0x9aa04e with the blade tips so cards and mass agree.
  id: 'clipped-box-hedge',
  color: 0x55602e,
  sssColor: 0x9aa04e,
  sssStrength: 0.26,
  swayM: 0.035,
  windSpeed: 0.7,
});
/**
 * DAY-VISUAL-B: the hedge top-face key. The TSL value ramp multiplies the
 * base colour by this at the crown, so the clipped top reads as a lighter
 * lit face against dark sides. Pinned by the vegetation test.
 */
export const HEDGE_TOP_TINT = Object.freeze({ r: 1.32, g: 1.22, b: 0.88 });

/** Deciduous avenue tree: open crown, warmer, moves a lot more. */
export const TREE_SPECIES: NuketownFoliageSpecies = Object.freeze({
  id: 'deciduous-avenue-tree',
  color: 0x4f7a35,
  sssColor: 0xb6d661,
  sssStrength: 0.34,
  swayM: 0.26,
  windSpeed: 0.55,
});

// ---------------------------------------------------------------------------
// The hedge dressing table
// ---------------------------------------------------------------------------

export type NuketownHedgeRun = Readonly<{
  /** Matches the arena body this run dresses, minus the `nuketown2 ` prefix. */
  id: string;
  /** AUTHORED centre - mirrored to the world frame at build time (HF-473). */
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Top of the solid this dresses. The foliage tops out here, never above. */
  topY: number;
}>;

/**
 * Every run here is the plan footprint of a body `nuketown2-arena.ts` already
 * emits as a SOLID with a collider. The test asserts exactly that against the
 * real constructed arena, so adding a run with no solid under it goes red.
 *
 * The foliage CLADS its host solid rather than hiding inside it, and that is a
 * correction this pass had to make after looking at the first review captures.
 * The first cut inset the hedge 0.06 m INSIDE the host box - which is an opaque
 * solid at the same footprint, so the hedge was invisible in every frame and
 * the capture was byte-similar to the baseline. `hedgeRunGeometry` now runs the
 * foliage `HEDGE_CLAD_M` proud on every side and `HEDGE_CLAD_TOP_M` above the
 * host's top face. Neither number touches the collider - cover is still decided
 * by the host solid the arena emitted - and the top offset also keeps the leaf
 * ridge clear of the host's own +y plane instead of racing it.
 */
export const NUKETOWN2_HEDGE_DRESSING: readonly NuketownHedgeRun[] = Object.freeze([
  // INTEGRATION (candidate 4b): all three verge rows re-read off
  // `src/nuketown2-arena.ts` after HF-477 retiled the front verge for the
  // lollipop. It pulled the hedge 0.8 m toward the house (z = HOUSE_FRONT_Z +
  // 0.6), moved the furniture line to z = -8.55 and narrowed it to 0.8 m deep,
  // and re-stationed the kerb planter from x = 10.0 to x = -3.6 - and this
  // dressing table still carried the old numbers, so three hedge runs were
  // standing on no collider at all: `nuketown2-vegetation` reported the drift
  // and the collider/visual parity gate reported the same bodies as twelve
  // unrated ghost shot surfaces. Same rows, the arena's own coordinates.
  // verge front hedge - the crouch cover outside each front door.
  Object.freeze({ id: 'verge front hedge', x: -4.7, z: -9.4, width: 3.9, depth: 0.9, topY: 0.95 }),
  // verge planter - the outer verge body past the garage.
  Object.freeze({ id: 'verge planter', x: 13.5, z: -8.55, width: 3.6, depth: 0.8, topY: 0.95 }),
  // verge kerb planter - the widened-strip body between drive edging and planter.
  Object.freeze({ id: 'verge kerb planter', x: -3.6, z: -8.55, width: 2.4, depth: 0.8, topY: 0.95 }),
  // yard alley planter - the deep-yard flank body, hard against the wall.
  Object.freeze({ id: 'yard alley planter', x: -15.6, z: -33.0, width: 4.0, depth: 2.0, topY: 1.9 }),
]);

// ---------------------------------------------------------------------------
// Deterministic RNG (own stream - never shared with another system)
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

function webgl2CompatRoute(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement?.dataset.renderBackend === 'webgl2';
}

// ---------------------------------------------------------------------------
// Foliage material: one graph, two species, layered wind
// ---------------------------------------------------------------------------

type FoliageMaterial = { material: THREE.Material; time: { value: number } | null };

/**
 * ONE material graph serves both species (row 38's "one material, many
 * plants"). The species differences are constants folded into the graph, so
 * this module compiles TWO pipelines rather than one per hedge run - the
 * compile fence in `threejs-webgpu-water` §Budgets applies to every TSL graph
 * on this map, not only to water.
 *
 * The wind is the three-layer form restated from row 18: a global sway phased
 * by world position, a rolling world-space gust so a whole run ripples
 * coherently instead of every bush waving on its own clock, and a fast
 * low-amplitude turbulence. All three are masked by height above the foliage
 * base, so the root is pinned and only the crown moves.
 */
function createFoliageMaterial(species: NuketownFoliageSpecies, massHeightM: number): FoliageMaterial {
  if (webgl2CompatRoute()) {
    // Compat route keeps a plain standard material - the same gate the lawn
    // field and the donor grass field apply. No node graph on WebGL2.
    return {
      material: new THREE.MeshStandardMaterial({
        color: species.color, roughness: 0.88, metalness: 0.02,
      }),
      time: null,
    };
  }

  const mat = new MeshStandardNodeMaterial({
    color: species.color, roughness: 0.88, metalness: 0.02,
  });
  mat.name = `nuketown2-foliage-${species.id}`;
  // WebGLRenderer fallback safety, the rule the donor grass field records: map
  // the node material onto the standard shaderID so a non-node renderer can
  // still compile it.
  mat.type = 'MeshStandardMaterial';

  const t = uniform(0);
  const speed = species.windSpeed;

  // Height mask: 0 at the base of the foliage mass, 1 at its top, squared so
  // the crown moves and the root does not.
  const hN = positionLocal.y.div(float(massHeightM)).clamp(0, 1);
  const bend = hN.mul(hN);

  const worldPhase = positionWorld.x.mul(0.31).add(positionWorld.z.mul(0.19));
  const sway = sin(t.mul(1.15 * speed).add(worldPhase));
  const wave = sin(positionWorld.x.mul(0.14).add(positionWorld.z.mul(0.10)).sub(t.mul(1.7 * speed)));
  const gust = wave.mul(0.5).add(0.66).clamp(0.15, 1);
  const turb = sin(t.mul(3.9 * speed).add(worldPhase.mul(2.3))).mul(0.32);

  const swayX = sway.add(turb).mul(gust).mul(bend).mul(float(species.swayM));
  const swayZ = sin(t.mul(0.93 * speed).add(worldPhase.mul(1.7)))
    .sub(turb.mul(0.6)).mul(gust).mul(bend).mul(float(species.swayM * 0.8));
  mat.positionNode = positionLocal.add(vec3(swayX, float(0), swayZ));

  // Value composition: dark at the root, base colour through the mass, a
  // sun-caught top. This is what stops a hedge reading as a flat green slab.
  const base = vec3(
    ((species.color >> 16) & 255) / 255,
    ((species.color >> 8) & 255) / 255,
    (species.color & 255) / 255,
  );
  const root = base.mul(vec3(0.44, 0.52, 0.44));
  let col = mix(root, base, smoothstep(0, 0.5, hN));
  col = mix(col, base.mul(vec3(HEDGE_TOP_TINT.r, HEDGE_TOP_TINT.g, HEDGE_TOP_TINT.b)), hN.mul(0.62));

  // Backlit translucency: leaves lit from behind glow. One dot product, no
  // extra pass, and it is what separates a leaf mass from a painted box.
  const L = normalize(vec3(-0.45, 0.62, -0.35));
  const back = positionViewDirection.dot(L.negate()).clamp(0, 1).pow(3);
  const sss = vec3(
    ((species.sssColor >> 16) & 255) / 255,
    ((species.sssColor >> 8) & 255) / 255,
    (species.sssColor & 255) / 255,
  ).mul(back).mul(hN).mul(float(species.sssStrength));
  mat.colorNode = col.add(sss);

  return { material: mat, time: t as unknown as { value: number } };
}

// ---------------------------------------------------------------------------
// Geometry: three reading distances per species
// ---------------------------------------------------------------------------

function mergeTransformed(
  parts: readonly { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[],
): THREE.BufferGeometry {
  const transformed: THREE.BufferGeometry[] = [];
  for (const { geom, matrix } of parts) {
    const clone = geom.clone();
    clone.applyMatrix4(matrix);
    // MANDATORY (skill pitfall): mergeGeometries throws "All geometries must
    // have compatible attributes" the moment one input is indexed and another
    // is not. Forcing non-indexed on every input makes that impossible.
    transformed.push(clone.index !== null ? clone.toNonIndexed() : clone);
  }
  const merged = mergeGeometries(transformed, false);
  if (merged === null) throw new Error('nuketown2-vegetation: mergeGeometries returned null');
  if (!merged.getAttribute('normal')) merged.computeVertexNormals();
  return merged;
}

function place(
  x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1,
  // HF-536 look-2b: a lobe that only yaws stays a level row of identical
  // domes. `tiltX`/`tiltZ` let a lobe lean, which is what makes a clipped
  // hedge read as grown-and-cut rather than extruded.
  tiltX = 0, tiltZ = 0,
): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(tiltX, yaw, tiltZ, 'YXZ')),
    new THREE.Vector3(sx, sy, sz),
  );
}

/**
 * One hedge SEGMENT at a named reading distance. The unit is 1 m of run,
 * `height` tall, centred on the origin with its base at y = 0.
 *
 * L0 (near, <= 14 m): a clipped body plus five overlapping lobes on the ridge,
 *   so the top edge reads as foliage rather than as a bevel.
 * L1 (mid, 14-30 m): three lower-detail lobes. Same silhouette family, about
 *   a quarter of the triangles.
 * L2 (far, > 30 m): the body alone. At 30 m a hedge is a few pixels of green
 *   edge and nothing else survives, so nothing else is paid for.
 */
function hedgeSegmentGeometry(level: 0 | 1 | 2, height: number, depth: number): THREE.BufferGeometry {
  if (level === 2) {
    const g = new THREE.BoxGeometry(1.0, height, depth, 1, 1, 1);
    g.translate(0, height / 2, 0);
    return g;
  }
  const lobeCount = level === 0 ? 5 : 3;
  const detail = level === 0 ? 1 : 0;
  const lobe = new THREE.IcosahedronGeometry(0.5, detail);
  const parts: { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  // The clipped body reaches 0.88 of the full height and the lobes carry the
  // rest, so the foliage covers the host solid from the ground up. An earlier
  // cut stopped the body at 0.78 and left a bare band of the grey box showing
  // beneath the leaves.
  const body = new THREE.BoxGeometry(1.0, height * 0.88, depth * 0.94);
  parts.push({ geom: body, matrix: place(0, height * 0.44, 0) });
  // The lobes ride the top, alternating fore and aft so the ridge is not a line.
  //
  // LOBE SCALE IS RELATIVE TO THE SEGMENT, NOT TO THE RUN THICKNESS. The first
  // cut scaled a lobe's X by the run's own depth, which on the 1.94 m-thick
  // verge planter made each lobe 1.78 m wide inside a 0.62 m segment: five of
  // them per segment, six segments per run, all overlapping into one smooth
  // mass. X is now a fraction of the unit segment, so adjacent lobes overlap by
  // about half and the ridge keeps its scallops at every run thickness.
  const lobeSpanX = (1 / lobeCount) * 1.55;
  // DAY-VISUAL-B: lower, flatter lobes (ridge tops out at 0.99 of the run
  // height) so the run reads as a clipped flat top with crisp box corners
  // and a scalloped foliage ridge, not a row of puffs. Triangle counts are
  // untouched - only transforms move, so every LOD ordering pin still holds.
  // HF-536 look-2b (critic gap #5, "flat-shaded blobs"). TWO LOBE SIZES and a
  // LEAN. Every other lobe is a small infill lobe at 0.62 of the run lobe,
  // dropped and pushed to the opposite face, and every lobe leans on both
  // axes by a deterministic amount derived from its index. Triangle count is
  // IDENTICAL - a lobe costs the same 80 triangles at any scale - so the LOD
  // ordering pins and the 45 k worst-case ceiling are untouched; the only
  // thing that changed is the transform, which is what buys the broken
  // silhouette and the darker interstices between the lobes.
  for (let i = 0; i < lobeCount; i += 1) {
    const t = (i + 0.5) / lobeCount;
    const small = i % 2 === 1;
    const size = small ? 0.62 : 1;
    const off = (small ? -1 : 1) * depth * (small ? 0.22 : 0.12);
    const drop = small ? height * 0.055 : 0;
    parts.push({
      geom: lobe,
      matrix: place(
        (t - 0.5) * 0.98, height * 0.87 - drop, off,
        i * 1.13,
        lobeSpanX * (0.94 + (i % 3) * 0.08) * size,
        height * 0.24 * (small ? 0.78 : 1),
        depth * (0.80 + (i % 2) * 0.12) * size,
        ((i % 3) - 1) * 0.18,
        ((i % 5) - 2) * 0.085,
      ),
    });
  }
  const merged = mergeTransformed(parts);
  body.dispose();
  lobe.dispose();
  return merged;
}

/**
 * One SPRIG: `LEAF_SPRIG_CARDS` alpha-tested quads fanned around a stem, each
 * quad taking a DIFFERENT atlas COLUMN. The instance material then shifts the
 * atlas ROW per instance, so 4 columns x 4 rows = 16 distinct leaf silhouettes
 * are reachable from one geometry and one draw call.
 *
 * The quads' base sits at y = 0 and they lean outward, so a sprig reads as a
 * small cluster growing out of the hedge ridge rather than as a billboard.
 */
export function leafSprigGeometry(
  cards = LEAF_SPRIG_CARDS,
  halfM = LEAF_CARD_HALF_M,
): THREE.BufferGeometry {
  const parts: { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  const created: THREE.BufferGeometry[] = [];
  for (let i = 0; i < cards; i += 1) {
    const quad = new THREE.PlaneGeometry(halfM * 2, halfM * 2, 1, 1);
    quad.translate(0, halfM, 0);
    // UV remap onto one atlas COLUMN of row 0. The material adds the row.
    const attribute = quad.getAttribute('uv') as THREE.BufferAttribute;
    const column = i % LEAF_ATLAS_CELLS;
    for (let k = 0; k < attribute.count; k += 1) {
      attribute.setXY(
        k,
        (column + attribute.getX(k)) / LEAF_ATLAS_CELLS,
        attribute.getY(k) / LEAF_ATLAS_CELLS,
      );
    }
    attribute.needsUpdate = true;
    created.push(quad);
    // Fanned over half a turn (the material is DoubleSide, so half a turn
    // already covers every viewing angle) with an outward lean and a small
    // radial offset, which is what stops the four quads reading as a cross.
    const yaw = (i / cards) * Math.PI + 0.31;
    const tilt = 0.34 + (i % 2) * 0.19;
    const matrix = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(yaw) * halfM * 0.45, halfM * 0.1 * (i % 3), Math.sin(yaw) * halfM * 0.45),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    parts.push({ geom: quad, matrix });
  }
  const merged = mergeTransformed(parts);
  for (const geometry of created) geometry.dispose();
  merged.name = 'nuketown2-leaf-sprig';
  return merged;
}

/**
 * The leaf-card material: the atlas, an alpha test, and the SAME wind graph
 * the hedge body uses so the leaves ride the hedge instead of standing still
 * on a swaying mass.
 *
 * SHADOWS ARE OFF ON PURPOSE, and this is a measured reason rather than a
 * budget dodge. three r185's WebGPU shadow pass sets
 * `scene.overrideMaterial = getShadowMaterial(light)`
 * (`ShadowNode.js:746`), and that material is one shared `NodeMaterial` with
 * `colorNode = vec4(0,0,0,1)` and no alpha test at all
 * (`ShadowFilterNode.js:196-215`). An alpha-tested card therefore casts its
 * WHOLE QUAD, so `castShadow = true` here would print rows of little black
 * rectangles on the lawn. The hedge lobes underneath still cast the run's
 * shadow, so nothing is lost by turning it off.
 */
function createLeafCardMaterial(): FoliageMaterial {
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
  mat.name = 'nuketown2-leaf-cards';
  mat.type = 'MeshStandardMaterial';
  mat.alphaTest = LEAF_ALPHA_TEST;

  // Per-instance atlas ROW: a hashed instance index quantised to one of the
  // four rows. Costs one texture fetch's worth of address arithmetic and no
  // extra sampler, attribute or draw.
  const hash = fract(sin(float(instanceIndex).mul(12.9898).add(4.1414)).mul(43758.5453));
  const row = floor(hash.mul(LEAF_ATLAS_CELLS)).div(LEAF_ATLAS_CELLS);
  const sampled = texture(atlas, uv().add(vec2(float(0), row)));

  const t = uniform(0);
  const speed = HEDGE_SPECIES.windSpeed;
  // Leaves are at the crown of the run, so they take the hedge's full bend
  // rather than a height-masked fraction of it - a card has no height to mask.
  const worldPhase = positionWorld.x.mul(0.31).add(positionWorld.z.mul(0.19));
  const sway = sin(t.mul(1.15 * speed).add(worldPhase));
  const wave = sin(positionWorld.x.mul(0.14).add(positionWorld.z.mul(0.10)).sub(t.mul(1.7 * speed)));
  const gust = wave.mul(0.5).add(0.66).clamp(0.15, 1);
  const turb = sin(t.mul(3.9 * speed).add(worldPhase.mul(2.3))).mul(0.32);
  const hN = positionLocal.y.div(float(LEAF_CARD_HALF_M * 2)).clamp(0, 1);
  const swayX = sway.add(turb).mul(gust).mul(hN).mul(float(HEDGE_SPECIES.swayM * 1.6));
  const swayZ = sin(t.mul(0.93 * speed).add(worldPhase.mul(1.7)))
    .sub(turb.mul(0.6)).mul(gust).mul(hN).mul(float(HEDGE_SPECIES.swayM * 1.3));
  mat.positionNode = positionLocal.add(vec3(swayX, float(0), swayZ));

  // The atlas already carries a base-to-tip value ramp; the hedge's own
  // backlit translucency is added on top so the cards and the mass agree.
  const L = normalize(vec3(-0.45, 0.62, -0.35));
  const back = positionViewDirection.dot(L.negate()).clamp(0, 1).pow(3);
  const sss = vec3(
    ((HEDGE_SPECIES.sssColor >> 16) & 255) / 255,
    ((HEDGE_SPECIES.sssColor >> 8) & 255) / 255,
    (HEDGE_SPECIES.sssColor & 255) / 255,
  ).mul(back).mul(float(HEDGE_SPECIES.sssStrength));
  mat.colorNode = sampled.rgb.add(sss);
  mat.opacityNode = sampled.a;

  return { material: mat, time: t as unknown as { value: number } };
}

/** Nominal crown top of an unscaled avenue tree, in metres. */
export const TREE_HEIGHT_M = 7.2;

/**
 * One deciduous avenue tree at a named reading distance. Base at y = 0.
 *
 * L0 (near, <= 26 m): tapered trunk, three boughs, four crown lobes.
 * L1 (mid, 26-48 m): trunk plus two lower-detail lobes.
 * L2 (far, > 48 m): trunk plus one lobe - which is all a tree standing behind
 *   a 3.2 m wall at 48 m has ever been.
 *
 * Detail 1 (80 tris/lobe) is the NEAR tier here, not detail 2: the whole
 * avenue stands outside the perimeter wall, so the closest trunk a player can
 * stand beside is ~20 m away and detail 2's 320 triangles buy nothing at that
 * range. Measured cost of that call: 74 k -> 22 k worst-case triangles.
 */
function avenueTreeGeometry(level: 0 | 1 | 2): THREE.BufferGeometry {
  const parts: { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  const trunkSegs = level === 0 ? 8 : level === 1 ? 6 : 5;
  const trunkH = TREE_HEIGHT_M * 0.46;
  const trunk = new THREE.CylinderGeometry(0.17, 0.29, trunkH, trunkSegs);
  parts.push({ geom: trunk, matrix: place(0, trunkH / 2, 0) });
  const boughs: THREE.BufferGeometry[] = [];
  if (level === 0) {
    // Three boughs, so the crown has visible structure from the border path.
    for (let i = 0; i < 3; i += 1) {
      const yaw = (i / 3) * Math.PI * 2 + 0.4;
      const bough = new THREE.CylinderGeometry(0.06, 0.11, 1.5, 5);
      bough.rotateZ(0.72);
      bough.rotateY(yaw);
      boughs.push(bough);
      parts.push({ geom: bough, matrix: place(Math.cos(yaw) * 0.5, trunkH + 0.55, Math.sin(yaw) * 0.5) });
    }
  }
  const lobes = level === 0 ? 4 : level === 1 ? 2 : 1;
  const lobe = new THREE.IcosahedronGeometry(1.0, level === 0 ? 1 : 0);
  for (let i = 0; i < lobes; i += 1) {
    const yaw = (i / lobes) * Math.PI * 2;
    // DAY-VISUAL-B: lobe 2 sits proud of the ring, opening a notch between
    // its neighbours so light reads through the crown instead of one closed
    // mass. Same triangle count - only the offset moves.
    const r = lobes === 1 ? 0 : i === 2 && level === 0 ? 1.08 : 0.72;
    parts.push({
      geom: lobe,
      matrix: place(
        Math.cos(yaw) * r, trunkH + 1.5 + (i % 2) * 0.34, Math.sin(yaw) * r,
        yaw,
        1.72 - (i % 3) * 0.16, 1.34, 1.72 - (i % 2) * 0.2,
      ),
    });
  }
  // DAY-VISUAL-B: a small crown leader above the ring - the sub-cluster that
  // breaks the crown silhouette. Detail 0 (20 tris): +~1 k worst case.
  let leader: THREE.BufferGeometry | null = null;
  if (level === 0) {
    leader = new THREE.IcosahedronGeometry(1.0, 0);
    parts.push({
      geom: leader,
      matrix: place(0.34, trunkH + 2.72, -0.28, 0.7, 0.82, 0.72, 0.82),
    });
  }
  const merged = mergeTransformed(parts);
  trunk.dispose();
  lobe.dispose();
  if (leader) leader.dispose();
  for (const bough of boughs) bough.dispose();
  return merged;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** Segment pitch along a hedge run, in metres. */
const SEGMENT_PITCH_M = 0.62;

/**
 * How far the foliage stands proud of the host solid on each side, in metres.
 * Presentation only: the collider is the host's and does not move.
 */
export const HEDGE_CLAD_M = 0.07;

/**
 * How far the leaf ridge rises above the host's top face, in metres. Small
 * enough that a 0.95 m crouch-cover body still reads as crouch cover, large
 * enough that the ridge is never coplanar with the face it sits on.
 */
export const HEDGE_CLAD_TOP_M = 0.06;

/**
 * One RUN's geometry, baked in the run's OWN local frame (origin at the run
 * centre, base at y = 0).
 *
 * The local frame is the whole point. `THREE.LOD` measures the distance from
 * the camera to the LOD OBJECT's world position, so a cluster whose geometry is
 * baked in world coordinates and whose object sits at the origin switches level
 * on distance-to-map-centre - which is not a distance LOD at all, it is a
 * global quality switch wearing an LOD's clothes. Every LOD in this module is
 * positioned at the thing it draws.
 */
function hedgeRunGeometry(
  level: 0 | 1 | 2,
  run: NuketownHedgeRun,
): { geometry: THREE.BufferGeometry; segments: number } {
  const parts: { geom: THREE.BufferGeometry; matrix: THREE.Matrix4 }[] = [];
  // Per-run stream keyed by the run id, so adding or removing a run never
  // re-jitters any other run's segments.
  let idHash = 0;
  for (let i = 0; i < run.id.length; i += 1) idHash = (Math.imul(idHash, 31) + run.id.charCodeAt(i)) | 0;
  const rng = mulberry32(NUKETOWN2_VEGETATION_SEED ^ (level * 0x9e37) ^ idHash);
  // The run's LONG axis is whichever of width/depth is longer; segments march
  // along it and the segment's own depth is the short axis.
  const alongX = run.width >= run.depth;
  const length = (alongX ? run.width : run.depth) + HEDGE_CLAD_M * 2;
  const thickness = (alongX ? run.depth : run.width) + HEDGE_CLAD_M * 2;
  const count = Math.max(2, Math.round(length / SEGMENT_PITCH_M));
  const pitch = length / count;
  const geom = hedgeSegmentGeometry(level, run.topY + HEDGE_CLAD_TOP_M, thickness);
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count - 0.5;
    // Deterministic per-segment jitter: a clipped hedge is regular, but not
    // machine-perfect. +/- 3 cm and +/- 6 % is all it takes to kill the tile.
    const jx = (rng() - 0.5) * 0.06;
    const jz = (rng() - 0.5) * 0.06;
    const s = 0.94 + rng() * 0.12;
    const px = alongX ? t * length + jx : jz;
    const pz = alongX ? jz : t * length + jx;
    // DAY-VISUAL-B: slight yaw per segment so the clipped faces catch the sun
    // unevenly instead of tiling. Derived from jx (no new rng draw), so every
    // existing segment keeps its jitter and scale.
    parts.push({ geom, matrix: place(px, 0, pz, (alongX ? 0 : Math.PI / 2) + jx * 2.1, pitch * 1.02, s, 1) });
  }
  const merged = mergeTransformed(parts);
  geom.dispose();
  return { geometry: merged, segments: count };
}

/**
 * Avenue-tree positions: seeded dart-throwing in the band between the inflated
 * arena rectangle and `AVENUE_MAX_RADIAL_M`. Because the rectangle is 36 x 84,
 * the band is 26 m wide on the two LONG flanks and only 2.5 m deep at the two
 * ends, so the accepted set naturally concentrates on the flanks - which is
 * exactly where a player standing in a back yard or on a border path sees it.
 */
export function nuketown2AvenueTreePositions(
  count = AVENUE_TREE_BUDGET,
): readonly (readonly [number, number, number])[] {
  const rng = mulberry32(NUKETOWN2_VEGETATION_SEED ^ 0x00a7_1e2d);
  const out: [number, number, number][] = [];
  const minX = NUKETOWN2_BOUNDS.minX - AVENUE_RECT_MARGIN_M;
  const maxX = NUKETOWN2_BOUNDS.maxX + AVENUE_RECT_MARGIN_M;
  const minZ = NUKETOWN2_BOUNDS.minZ - AVENUE_RECT_MARGIN_M;
  const maxZ = NUKETOWN2_BOUNDS.maxZ + AVENUE_RECT_MARGIN_M;
  let attempts = 0;
  while (out.length < count && attempts < count * 80) {
    attempts += 1;
    const angle = rng() * Math.PI * 2;
    const radius = 21 + rng() * (AVENUE_MAX_RADIAL_M - 21);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    // Outside the inflated arena rectangle: no tree stands on reachable ground.
    if (x > minX && x < maxX && z > minZ && z < maxZ) continue;
    if (Math.hypot(x, z) > AVENUE_MAX_RADIAL_M) continue;
    let tooClose = false;
    for (let i = 0; i < out.length; i += 1) {
      const other = out[i]!;
      if (Math.hypot(x - other[0], z - other[1]) < AVENUE_MIN_SEPARATION_M) { tooClose = true; break; }
    }
    if (tooClose) continue;
    out.push([x, z, rng() * Math.PI * 2]);
  }
  return Object.freeze(out.map((entry) => Object.freeze(entry) as readonly [number, number, number]));
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export interface Nuketown2VegetationStats {
  hedgeRuns: number;
  hedgeSegments: number;
  avenueTrees: number;
  avenueSectors: number;
  /** Alpha-tested leaf QUADS across every hedge run (HF-536 look-2b). */
  leafCards: number;
  /** Leaf quads on the busiest single run - the brief's <= 80 cap. */
  leafCardsPerRun: number;
  /** Distinct silhouette families - the row 24 "several species" property. */
  species: number;
  /** Draw calls if EVERY LOD showed its level-0 mesh at once (a bound). */
  worstCaseDrawCalls: number;
  /** Triangles if every LOD showed its level-0 mesh at once (a bound). */
  worstCaseTriangles: number;
  lodLevels: number;
}

export interface Nuketown2Vegetation {
  group: THREE.Group;
  stats: Readonly<Nuketown2VegetationStats>;
  /** ONE uniform write per frame. The sway itself is entirely GPU-side. */
  advanceWind(seconds: number): void;
  dispose(): void;
}

function triangles(geometry: THREE.BufferGeometry): number {
  if (geometry.index) return geometry.index.count / 3;
  const position = geometry.getAttribute('position');
  return position ? position.count / 3 : 0;
}

/**
 * Build the Rebuild's hedges and avenue.
 *
 * DRAW-CALL SHAPE, stated up front because it is what this design spends.
 *   - Each hedge RUN (4 authored x 2 halves = 8) is one `THREE.LOD` positioned
 *     at that run's own centre, holding three merged-geometry levels. One run =
 *     one draw call, at whatever detail the camera earns.
 *   - The avenue is cut into 4 angular SECTORS, each one `THREE.LOD` at its
 *     sector centroid holding three `InstancedMesh` levels. Sectors exist so
 *     the avenue gets a real distance signal: the camera is INSIDE the ring, so
 *     near and far sectors differ by up to 80 m, and a single origin-centred
 *     avenue LOD would have measured a near-constant distance instead.
 *   - Worst case is therefore 12 draw calls, and that is a BOUND rather than
 *     the normal case: four avenue sectors 40 m apart cannot all be inside one
 *     camera's 26 m near tier.
 *
 * Three's renderer calls `LOD.update(camera)` itself during `projectObject`, so
 * the level switch costs no per-frame allocation and no application-side
 * traversal. The whole frame-loop cost of this module is the uniform write in
 * `advanceWind`.
 */
export function buildNuketown2Vegetation(
  parent: THREE.Object3D,
  options: Readonly<{ handed?: boolean; reduced?: boolean }> = {},
): Nuketown2Vegetation {
  const handed = options.handed !== false;
  const reduced = options.reduced === true;

  const group = new THREE.Group();
  group.name = 'nuketown2-vegetation';
  group.userData.presentationOnly = true;

  const disposables: { dispose(): void }[] = [];
  const times: { value: number }[] = [];
  let worstTriangles = 0;
  let worstDraws = 0;
  let hedgeSegments = 0;

  // ---- hedges -------------------------------------------------------------
  const hedgeMat = createFoliageMaterial(
    HEDGE_SPECIES,
    Math.max(...NUKETOWN2_HEDGE_DRESSING.map((run) => run.topY)),
  );
  disposables.push(hedgeMat.material);
  if (hedgeMat.time) times.push(hedgeMat.time);

  // LOD distances in metres, measured against this map AND against the review
  // captures. The first cut used 14 / 30, and the deterministic review cameras
  // put every hedge on the FAR tier - a plain box, which is the same read the
  // olive planter already had, so the capture was near-identical to the
  // baseline and the module looked like it had done nothing. The longest clear
  // standing eye-line here is ~32 m, so 22 / 40 puts the scalloped near tier on
  // every range a player fights at and keeps the box tier for true skyline.
  // Cost of the change, measured: 1,648 triangles for the largest run.
  const HEDGE_LOD_M = reduced ? [0, 12, 26] : [0, 22, 40];
  const hedgeRuns: { half: 'north' | 'south'; run: NuketownHedgeRun }[] = [];
  for (const run of NUKETOWN2_HEDGE_DRESSING) {
    hedgeRuns.push({ half: 'north', run });
    hedgeRuns.push({ half: 'south', run: { ...run, x: -run.x, z: -run.z } });
  }
  for (const { half, run } of hedgeRuns) {
    const lod = new THREE.LOD();
    lod.name = `nuketown2-hedges-${half}-${run.id.replace(/\s+/g, '-')}`;
    lod.userData.presentationOnly = true;
    // THE LOD OBJECT STANDS WHERE THE HEDGE STANDS. Geometry is baked in the
    // run's local frame by `hedgeRunGeometry`, so this is the only place the
    // world transform is applied - and it is what `LOD.update` measures.
    lod.position.set(handed ? nuketown2HandedX(run.x) : run.x, 0, run.z);
    for (const level of [0, 1, 2] as const) {
      const { geometry, segments } = hedgeRunGeometry(level, run);
      disposables.push(geometry);
      const mesh = new THREE.Mesh(geometry, hedgeMat.material);
      mesh.name = `${lod.name}-L${level}`;
      mesh.userData.presentationOnly = true;
      mesh.castShadow = level === 0;
      mesh.receiveShadow = true;
      lod.addLevel(mesh, HEDGE_LOD_M[level]!);
      if (level === 0) {
        hedgeSegments += segments;
        worstTriangles += triangles(geometry);
        worstDraws += 1;
      }
    }
    group.add(lod);
  }

  // ---- leaf cards on every hedge ridge ------------------------------------
  // ONE InstancedMesh for all eight runs, so the whole leaf layer is ONE draw
  // call and ONE pipeline. The cards do not LOD: at 8 tris an instance the
  // saving would be noise, and a second geometry would cost a second draw.
  const cardMat = createLeafCardMaterial();
  disposables.push(cardMat.material);
  if (cardMat.time) times.push(cardMat.time);
  const sprigsPerRun = reduced ? Math.round(LEAF_SPRIGS_PER_RUN * 0.5) : LEAF_SPRIGS_PER_RUN;
  const sprigGeometry = leafSprigGeometry();
  disposables.push(sprigGeometry);
  const cardMatrix = new THREE.Matrix4();
  const cardPos = new THREE.Vector3();
  const cardQuat = new THREE.Quaternion();
  const cardScale = new THREE.Vector3();
  const cardEuler = new THREE.Euler();
  const cardMesh = new THREE.InstancedMesh(
    sprigGeometry, cardMat.material, hedgeRuns.length * sprigsPerRun,
  );
  cardMesh.name = 'nuketown2-hedges-leaf-cards';
  cardMesh.userData.presentationOnly = true;
  cardMesh.userData.blocksShots = false;
  // See createLeafCardMaterial: r185's WebGPU shadow pass has ONE opaque
  // override material with no alpha test, so an alpha-tested card would cast
  // a solid rectangle. The lobes underneath carry the run's shadow.
  cardMesh.castShadow = false;
  cardMesh.receiveShadow = true;
  let cardInstance = 0;
  for (const { run } of hedgeRuns) {
    const cardRng = mulberry32(NUKETOWN2_VEGETATION_SEED ^ 0x1eaf_c0de ^ (cardInstance * 0x9e37));
    const alongX = run.width >= run.depth;
    const length = (alongX ? run.width : run.depth) + HEDGE_CLAD_M * 2;
    const thickness = (alongX ? run.depth : run.width) + HEDGE_CLAD_M * 2;
    const worldX = handed ? nuketown2HandedX(run.x) : run.x;
    // Sit the sprig base just BELOW the ridge so the leaves grow out of the
    // clipped top rather than floating over it.
    const ridgeY = run.topY + HEDGE_CLAD_TOP_M - LEAF_CARD_HALF_M * 0.55;
    for (let s = 0; s < sprigsPerRun; s += 1) {
      const t = (s + 0.5) / sprigsPerRun - 0.5;
      const across = (cardRng() - 0.5) * thickness * 0.86;
      const along = t * length + (cardRng() - 0.5) * (length / sprigsPerRun) * 0.7;
      cardPos.set(
        worldX + (alongX ? along : across),
        ridgeY + (cardRng() - 0.5) * 0.035,
        run.z + (alongX ? across : along),
      );
      cardEuler.set((cardRng() - 0.5) * 0.34, cardRng() * Math.PI * 2, (cardRng() - 0.5) * 0.34, 'YXZ');
      cardQuat.setFromEuler(cardEuler);
      const s0 = 0.78 + cardRng() * 0.44;
      cardScale.set(s0, s0 * (0.86 + cardRng() * 0.3), s0);
      cardMatrix.compose(cardPos, cardQuat, cardScale);
      cardMesh.setMatrixAt(cardInstance, cardMatrix);
      cardInstance += 1;
    }
  }
  cardMesh.instanceMatrix.needsUpdate = true;
  // Skill pitfall: without this the whole leaf layer inherits a 0.2 m bounding
  // sphere at the origin and vanishes the moment the camera looks off-centre.
  cardMesh.computeBoundingSphere();
  group.add(cardMesh);
  worstDraws += 1;
  worstTriangles += triangles(sprigGeometry) * cardMesh.count;

  // ---- the avenue ---------------------------------------------------------
  const treeMat = createFoliageMaterial(TREE_SPECIES, TREE_HEIGHT_M);
  disposables.push(treeMat.material);
  if (treeMat.time) times.push(treeMat.time);

  const positions = nuketown2AvenueTreePositions(
    reduced ? Math.round(AVENUE_TREE_BUDGET * 0.6) : AVENUE_TREE_BUDGET,
  );
  const sectors: (readonly [number, number, number])[][] = [[], [], [], []];
  for (const entry of positions) {
    const angle = Math.atan2(entry[1], entry[0]);
    const index = Math.min(3, Math.max(0, Math.floor(((angle + Math.PI) / (Math.PI * 2)) * 4)));
    sectors[index]!.push(entry);
  }
  const TREE_LOD_M = reduced ? [0, 18, 34] : [0, 26, 48];
  const matrix = new THREE.Matrix4();
  const scratchPos = new THREE.Vector3();
  const scratchQuat = new THREE.Quaternion();
  const scratchScale = new THREE.Vector3();
  const scratchEuler = new THREE.Euler();
  const geometryByLevel = ([0, 1, 2] as const).map((level) => avenueTreeGeometry(level));
  for (const geometry of geometryByLevel) disposables.push(geometry);
  for (const [index, sector] of sectors.entries()) {
    if (sector.length === 0) continue;
    let cx = 0;
    let cz = 0;
    for (const entry of sector) { cx += entry[0]; cz += entry[1]; }
    cx /= sector.length;
    cz /= sector.length;
    const lod = new THREE.LOD();
    lod.name = `nuketown2-avenue-sector-${index}`;
    lod.userData.presentationOnly = true;
    lod.position.set(cx, 0, cz);
    for (const level of [0, 1, 2] as const) {
      const geometry = geometryByLevel[level]!;
      const mesh = new THREE.InstancedMesh(geometry, treeMat.material, sector.length);
      mesh.name = `${lod.name}-L${level}`;
      mesh.userData.presentationOnly = true;
      mesh.castShadow = level === 0;
      mesh.receiveShadow = false;
      for (let i = 0; i < sector.length; i += 1) {
        const entry = sector[i]!;
        // DAY-VISUAL-B: wider seed-stable scale band plus a slight per-tree
        // lean. The pivot is at the trunk base, so the base never leaves its
        // 4.6 m-separated station; measured max tilt 0.044 rad keeps the crown
        // shift under 0.35 m.
        const s = 0.78 + (i % 9) * 0.05;
        // Instances are LOCAL to the sector LOD, so the LOD's own position is
        // subtracted here and nowhere else.
        scratchPos.set(entry[0] - cx, 0, entry[1] - cz);
        scratchEuler.set(((i * 2) % 5 - 2) * 0.011, entry[2], ((i * 3) % 5 - 2) * 0.011);
        scratchQuat.setFromEuler(scratchEuler);
        scratchScale.set(s, s * (0.9 + (i % 5) * 0.05), s);
        matrix.compose(scratchPos, scratchQuat, scratchScale);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      // MANDATORY (skill pitfall): without this the instance cloud inherits the
      // single-tree bounding sphere at the sector origin and half the avenue is
      // culled the moment the camera looks along the ring.
      mesh.computeBoundingSphere();
      lod.addLevel(mesh, TREE_LOD_M[level]!);
      if (level === 0) {
        worstTriangles += triangles(geometry) * sector.length;
        worstDraws += 1;
      }
    }
    group.add(lod);
  }

  parent.add(group);

  const stats: Nuketown2VegetationStats = Object.freeze({
    hedgeRuns: hedgeRuns.length,
    hedgeSegments,
    avenueTrees: positions.length,
    avenueSectors: sectors.filter((sector) => sector.length > 0).length,
    leafCards: cardMesh.count * LEAF_SPRIG_CARDS,
    leafCardsPerRun: sprigsPerRun * LEAF_SPRIG_CARDS,
    species: 2,
    worstCaseDrawCalls: worstDraws,
    worstCaseTriangles: worstTriangles,
    lodLevels: 3,
  });

  return {
    group,
    stats,
    advanceWind: (seconds: number) => {
      for (let i = 0; i < times.length; i += 1) times[i]!.value = seconds;
    },
    dispose: () => {
      for (const entry of disposables) entry.dispose();
      group.removeFromParent();
    },
  };
}
