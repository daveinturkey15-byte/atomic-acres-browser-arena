/**
 * map3/street-cell.ts — HF-419, one GTA-style street cell as a RULE SET of the
 * grammar that already lives in corridor 3.
 *
 * WHY THIS IS A RULE SET AND NOT A SECOND GENERATOR.
 *
 * `corridors.ts` already runs the footprint -> mass -> podium/shaft/crown ->
 * facade pipeline with swappable rule sets: `buildTower`, `buildCottage`,
 * `buildRuin`. The point of a shape grammar is that the STAGES are fixed and
 * the rules are swappable, so the honest way to add a city street is a fourth
 * rule set — `buildStreetFrontage` below is the same pipeline with street-scale
 * terminals — plus the ground and dressing a street needs and a tower does not.
 * A second generator would have proved nothing about the grammar.
 *
 * WHAT THE SOURCE DID NOT GIVE US (skill open-world-city-art-loop, section 1).
 * The thread behind HF-419 published a 31-second video and four sentences: no
 * prompt, no repository, no asset, no pipeline. Nothing here is derived from
 * it. What IS taken from it is an ORDERING — the elements ranked by screen area
 * at a walking camera — and that ordering is why this file is written in the
 * order it is: road surface, then kerb and pavement, then facade bays, then
 * furniture density, then parked cars as scenery, then wayfinding.
 *
 * WHAT IS DELIBERATELY NOT TAKEN. The reference look leans on a flat overcast
 * ambient-dominant grade that hides weak procedural materials. Adopting it
 * would win an A/B and delete the project's lighting direction. Nothing in this
 * file touches the sun, the sky, fog, tone mapping or any art-direction value;
 * it changes surfaces only. Lighting is HF-421's lane.
 *
 * CONTRACT (repository, non-negotiable):
 *   - three/webgpu NodeMaterial + TSL only. No ShaderMaterial, no
 *     onBeforeCompile, no imported mesh, image, font or LUT.
 *   - THREE NodeMaterials for the whole cell, all created here at construction:
 *     ground, frontage, and one shared item material for every instanced family
 *     (lamps, signals, bollards, bins AND the parked cars). Variation inside
 *     each comes from a vertex attribute and from a per-INSTANCE tint, never
 *     from a new material. That is the whole discipline that keeps a city art
 *     pass off the cold-compile fence: a family of eight differently-coloured
 *     parked cars costs one pipeline, not eight.
 *     The wayfinding blade adds one MeshBasicMaterial on the same canvas-text
 *     route the sixteen corridor signs in main.ts already use - the same kind
 *     of material the scene already carries, not a new family.
 *   - Determinism: one mulberry32 stream seeded from the cell's own seed. No
 *     Math.random, and no consumption of any shared module-level RNG — that
 *     would move every existing placement in the corridor and make the
 *     before/after captures incomparable.
 *   - Nothing is created after construction and nothing allocates per frame:
 *     this module exports no update() at all.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

import { fbm2, ridgedFbm2, valueNoise2, xz } from './noise';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  abs, attribute, cameraPosition, clamp, float, floor, fract, length, max, min, mix,
  positionLocal, positionWorld, smoothstep, vec2, vec3,
} = TSL as unknown as Record<string, any>;

/* ------------------------------------------------------------------ */
/* Determinism                                                         */
/* ------------------------------------------------------------------ */

/**
 * mulberry32 — the same idiom farcrysis-art.ts uses. A private stream per cell,
 * so adding this cell cannot move a single existing placement in the corridor.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Cell dimensions — one place, because six systems have to agree       */
/* ------------------------------------------------------------------ */

/** Half width of the carriageway, metres. A 7.2 m two-lane street. */
const ROAD_HALF = 3.6;
/** Kerb top width. */
const KERB_W = 0.3;
/** Kerb top height above the crown of the road. */
const KERB_H = 0.14;
/** Pavement width from the back of the kerb to the building line. */
const PAVE_W = 3.2;
/** Crown height of the carriageway; matches the corridor floor at y = 0.03. */
const ROAD_Y = 0.03;
/** How far the camber falls from crown to channel. */
const CAMBER = 0.075;
/** Ground level of the surrounding world plane in main.ts. */
const WORLD_Y = -0.35;
/** Outer edge of the pavement = the building line. */
const BUILDING_X = ROAD_HALF + KERB_W + PAVE_W;   // 7.10
/** Pavement/kerb top level. */
const PAVE_Y = ROAD_Y + KERB_H;                    // 0.17
/** Cell extent along the corridor axis, in corridor-local z. */
const Z_START = -52;
const Z_END = -62;
/** The cell's far extent, so the corridor that owns it can report its true length. */
export const STREET_CELL_Z_END = Z_END;
const CELL_LEN = Z_START - Z_END;                  // 22

/** Vertex-attribute part ids for the one ground material. */
const PART_ROAD = 0;
const PART_KERB_FACE = 1;
const PART_KERB_TOP = 2;
const PART_PAVEMENT = 3;
const PART_SKIRT = 4;

/* ------------------------------------------------------------------ */
/* 1. THE CELL GROUND — carriageway + two kerbs + two pavements,       */
/*    ONE geometry, ONE material, ONE draw call.                       */
/* ------------------------------------------------------------------ */

/**
 * Build the cross-section once and extrude it along the street.
 *
 * The cell is authored as a PROFILE — a list of (x, y) points with a part id
 * per span — and swept over `segZ` rings. Every span gets its own vertex ring
 * pair so the kerb face keeps a vertical normal and the pavement a horizontal
 * one: sharing vertices across the kerb nose would round it off into a ramp,
 * which is exactly the "kerb is implied rather than built" failure the bar's
 * row 3 exists to catch.
 *
 * The carriageway is sampled across six spans so the camber is a curve rather
 * than a tent, because the camber is what puts the standing-water line and the
 * channel shadow where a real street has them.
 */
function buildCellGround(segZ = 44): THREE.BufferGeometry {
  const profile: Array<{ x: number; y: number }> = [];
  const parts: number[] = [];

  const push = (x: number, y: number, part: number) => {
    profile.push({ x, y });
    parts.push(part);
  };

  const roadY = (x: number) => ROAD_Y - CAMBER * (x / ROAD_HALF) ** 2;

  // Left skirt: the 0.52 m drop from the pavement down to the world plane, so
  // the cell reads as a built slab and not as a floating card.
  push(-BUILDING_X, WORLD_Y, PART_SKIRT);
  push(-BUILDING_X, PAVE_Y, PART_PAVEMENT);
  push(-ROAD_HALF - KERB_W, PAVE_Y, PART_KERB_TOP);
  push(-ROAD_HALF, PAVE_Y, PART_KERB_FACE);
  push(-ROAD_HALF, roadY(-ROAD_HALF), PART_ROAD);
  const ROAD_SPANS = 6;
  for (let i = 1; i <= ROAD_SPANS; i++) {
    const x = -ROAD_HALF + (2 * ROAD_HALF * i) / ROAD_SPANS;
    push(x, roadY(x), i === ROAD_SPANS ? PART_KERB_FACE : PART_ROAD);
  }
  push(ROAD_HALF, PAVE_Y, PART_KERB_TOP);
  push(ROAD_HALF + KERB_W, PAVE_Y, PART_PAVEMENT);
  push(BUILDING_X, PAVE_Y, PART_SKIRT);
  push(BUILDING_X, WORLD_Y, PART_SKIRT);
  parts.pop();   // the last point starts no span

  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let base = 0;

  for (let s = 0; s < profile.length - 1; s++) {
    const a = profile[s];
    const b = profile[s + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const part = parts[s];
    // Sweep direction is +z, so the span normal is the in-plane perpendicular
    // of (dx, dy). Orienting it by sign alone is wrong here: the two VERTICAL
    // spans point opposite ways for the same sign of x - the skirt faces away
    // from the street, the kerb face looks into it - so orient by what the span
    // IS, not by where it sits. Getting this backwards turns the kerb into a
    // black inside-out wall and is invisible until a capture.
    let nx: number;
    let ny: number;
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Road, kerb top, pavement: the true perpendicular, flipped to face up,
      // so the carriageway's camber still shades as a curve.
      nx = -dy / len; ny = dx / len;
      if (ny < 0) { nx = -nx; ny = -ny; }
    } else if (part === PART_SKIRT) {
      nx = Math.sign(a.x) || 1; ny = 0;                 // outward, away from the street
    } else {
      nx = -(Math.sign(a.x) || 1); ny = 0;              // kerb face: into the carriageway
    }

    for (let r = 0; r <= segZ; r++) {
      const z = Z_START - (CELL_LEN * r) / segZ;
      pos.push(a.x, a.y, z, b.x, b.y, z);
      nor.push(nx, ny, 0, nx, ny, 0);
      uvs.push(0, -z, len, -z);
    }
    for (let r = 0; r < segZ; r++) {
      const i0 = base + r * 2;
      idx.push(i0, i0 + 1, i0 + 3, i0, i0 + 3, i0 + 2);
    }
    base += (segZ + 1) * 2;
  }

  const partAttr = new Float32Array(pos.length / 3);
  {
    let v = 0;
    for (let s = 0; s < profile.length - 1; s++) {
      for (let r = 0; r <= segZ; r++) { partAttr[v++] = parts[s]; partAttr[v++] = parts[s]; }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('cellPart', new THREE.BufferAttribute(partAttr, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * The ground material — the single most important surface in the cell, because
 * at a 1.7 m eye the road and pavement are 30-50% of the frame (skill §4.1-2).
 *
 * Everything is a node graph over world position. Nothing is sampled from an
 * image, and the only branch is on the `cellPart` vertex attribute, so the
 * whole cell ground is one pipeline.
 *
 * DISTANCE FALLOFF is not decoration. `detail` fades the expensive high-octave
 * terms out between 22 m and 46 m, which is where a city is won or lost: a cell
 * that costs the same at 200 m as at 5 m is mis-built (skill §7).
 */
function createGroundMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.roughness = 0.95;
  mat.metalness = 0;

  const part = attribute('cellPart', 'float');
  // STREET-FRAME, not world frame. Corridor 3's pivot is rotated 90 degrees
  // about Y, so world x runs ALONG this street and world z runs across it.
  // Patterning on positionWorld put the lane paint 52 m outside the cell, made
  // the "longitudinal" tar seams transverse, and left the whole carriageway
  // inside the damp band and the kerb channel at once. Every directional
  // feature here is authored in the cell's own frame; only the camera-distance
  // term uses world space, because the camera is a world thing.
  const p = positionLocal;
  const dist = length(positionWorld.sub(cameraPosition));
  // 1 near, 0 beyond ~46 m. Multiplies the fine terms only; the silhouette-
  // scale terms (kerb value split, slab grid) stay on at every distance so the
  // street does not dissolve into a tone at the far end of the cell.
  const detail = smoothstep(float(46), float(22), dist);

  /* --- carriageway ------------------------------------------------- */
  // Aggregate: high-frequency fBM standing in for the chip in the asphalt.
  const aggregate = fbm2(xz(p, 8.0), 3).sub(0.5).mul(0.026).mul(detail);
  // Cold-patch repairs: low-frequency blobs thresholded HARD, because the thing
  // that reads as a repair is the EDGE, not the tone. A soft blend reads as
  // dirt; a sharp boundary reads as a trench that was dug and filled.
  const patchField = fbm2(xz(p, 0.085).add(vec2(31.7, 12.3)), 3);
  const patch = smoothstep(float(0.545), float(0.575), patchField);
  // Tar seams: distance-to-line fields, not noise. Two longitudinal seams over
  // the lane joints, plus transverse joints every 5.5 m, both wandering.
  const wobble = fbm2(xz(p, 0.6), 2).sub(0.5).mul(0.28);
  const seamLong = min(
    abs(p.x.add(wobble).sub(float(ROAD_HALF * 0.52))),
    abs(p.x.add(wobble).add(float(ROAD_HALF * 0.52))),
  );
  const seamCross = abs(fract(p.z.div(5.5).add(wobble.mul(0.06))).sub(0.5)).mul(5.5);
  const seam = max(
    smoothstep(float(0.075), float(0.012), seamLong),
    smoothstep(float(0.085), float(0.015), seamCross),
  );
  // Crack network: ridged fBM is the difference between rolling hills and
  // knife ridges, and a crack is a ridge.
  const crack = smoothstep(float(0.920), float(0.992), ridgedFbm2(xz(p, 3.0), 3)).mul(detail);
  // Kerb-side staining: the channel is where the water and the grit sit.
  const channel = smoothstep(float(ROAD_HALF - 1.15), float(ROAD_HALF), abs(p.x)).mul(0.55);

  const asphalt = vec3(0.054, 0.055, 0.059)
    .add(aggregate)
    .sub(patch.mul(vec3(0.019, 0.019, 0.018)))
    .sub(seam.mul(vec3(0.034, 0.034, 0.036)))
    .sub(crack.mul(vec3(0.026, 0.026, 0.028)))
    .sub(channel.mul(vec3(0.014, 0.014, 0.013)));

  // Lane paint. Crisp paint reads as a racing game (skill §4.1), so the centre
  // line is dashed, its position drifts, its edge is eaten by the aggregate,
  // and the asphalt shows through wherever the wear field says so.
  const paintDrift = fbm2(xz(p, 0.11).add(vec2(7.1, 2.9)), 2).sub(0.5).mul(0.09);
  const centre = abs(p.x.add(paintDrift));
  const dash = smoothstep(float(0.34), float(0.30), abs(fract(p.z.div(4.0)).sub(0.5)));
  const centreLine = smoothstep(float(0.135), float(0.095), centre).mul(dash);
  const edgeX = abs(abs(p.x.add(paintDrift.mul(0.6))).sub(float(ROAD_HALF - 0.42)));
  const edgeLine = smoothstep(float(0.105), float(0.070), edgeX);
  const wear = clamp(fbm2(xz(p, 1.6), 3).mul(2.05).sub(0.62), 0, 1)
    .mul(clamp(fbm2(xz(p, 9.5).add(vec2(3.3, 8.8)), 2).mul(1.9).sub(0.42), 0, 1));
  const paint = max(centreLine, edgeLine).mul(wear).mul(float(0.95));
  // Dirty white, never 1.0 white: road paint is grey by its second winter.
  const paintCol = vec3(0.58, 0.565, 0.505).sub(aggregate.mul(2.5));
  const road = mix(asphalt, paintCol, paint);

  /* --- kerb --------------------------------------------------------- */
  // The kerb is TWO surfaces at two values. That split is what makes a kerb
  // read as a kerb rather than as a fold in the ground.
  const kerbGrit = fbm2(xz(p, 7.0), 2).sub(0.5).mul(0.05);
  // Vertical staining down the face, heavier at the bottom where the channel is.
  const streak = valueNoise2(vec2(p.z.mul(3.1), float(0))).mul(0.55).add(0.45);
  const faceLow = smoothstep(float(PAVE_Y), float(ROAD_Y - CAMBER), p.y);
  const kerbFace = vec3(0.082, 0.081, 0.076)
    .add(kerbGrit)
    .sub(faceLow.mul(streak).mul(vec3(0.030, 0.030, 0.028)));
  // Chipped nose: the top course of a kerb is never a clean line.
  const chip = smoothstep(float(0.62), float(0.86), fbm2(xz(p, 3.4), 2)).mul(detail);
  const kerbTop = vec3(0.178, 0.176, 0.166).add(kerbGrit).sub(chip.mul(vec3(0.020, 0.020, 0.019)));

  /* --- pavement ------------------------------------------------------ */
  // Slab grid: 0.90 x 0.60 flags, laid to the street. The joint is a
  // distance-to-line field again, and the per-slab tonal variance comes from
  // hashing the slab id — slabs from the same batch are never the same colour.
  const su = p.x.div(0.9);
  const sv = p.z.div(0.6);
  const joint = max(
    smoothstep(float(0.470), float(0.4965), abs(fract(su).sub(0.5))),
    smoothstep(float(0.455), float(0.4955), abs(fract(sv).sub(0.5))),
  );
  const slabTone = valueNoise2(vec2(floor(su), floor(sv)).add(vec2(0.5, 0.5))).sub(0.5).mul(0.030);
  const paveGrit = fbm2(xz(p, 4.2), 3).sub(0.5).mul(0.030).mul(detail);
  // The damp band where the pavement meets the frontage. Every real street has
  // it, and almost no procedural street does — it is a third of what sells the
  // pavement, and it costs one smoothstep.
  const damp = smoothstep(float(BUILDING_X - 1.5), float(BUILDING_X), abs(p.x)).mul(0.45);
  const pavement = vec3(0.138, 0.137, 0.130)
    .add(slabTone)
    .add(paveGrit)
    .sub(damp.mul(vec3(0.030, 0.030, 0.026)))
    .sub(joint.mul(detail.mul(0.7).add(0.3)).mul(vec3(0.042, 0.042, 0.040)));

  /* --- skirt ---------------------------------------------------------- */
  const skirt = vec3(0.056, 0.055, 0.052).add(fbm2(xz(p, 2.0), 2).sub(0.5).mul(0.02));

  // Branch on the part id. `part` is flat per span, so these selects collapse
  // to a single taken path per fragment — one pipeline, five surfaces.
  const isRoad = smoothstep(float(0.6), float(0.4), part);
  const isKerbFace = smoothstep(float(0.4), float(0.6), part).mul(smoothstep(float(1.6), float(1.4), part));
  const isKerbTop = smoothstep(float(1.4), float(1.6), part).mul(smoothstep(float(2.6), float(2.4), part));
  const isPave = smoothstep(float(2.4), float(2.6), part).mul(smoothstep(float(3.6), float(3.4), part));
  const isSkirt = smoothstep(float(3.4), float(3.6), part);

  mat.colorNode = road.mul(isRoad)
    .add(kerbFace.mul(isKerbFace))
    .add(kerbTop.mul(isKerbTop))
    .add(pavement.mul(isPave))
    .add(skirt.mul(isSkirt));

  // Wet channel and polished kerb nose are the only roughness variation; a
  // uniformly rough street reads as felt.
  mat.roughnessNode = float(0.97)
    .sub(channel.mul(isRoad).mul(0.16))
    .sub(paint.mul(0.10))
    .sub(isKerbTop.mul(0.08));
  return mat;
}

/* ------------------------------------------------------------------ */
/* 2. THE FRONTAGE RULE SET — the fourth rule set of the grammar        */
/* ------------------------------------------------------------------ */

/** Frontage part ids, same trick as the ground: one material, four surfaces. */
const F_WALL = 0;
const F_GLASS = 1;
const F_TRIM = 2;
const F_SHOP = 3;

/**
 * Tag every vertex of a geometry with a frontage part id, so the merged
 * frontage is one draw call and one pipeline instead of one per material.
 */
function tag(geo: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n);
  a.fill(part);
  geo.setAttribute('facePart', new THREE.BufferAttribute(a, 1));
  return geo;
}

/**
 * RULE SET 4 — a street frontage. Same STAGES as buildTower/buildCottage
 * (footprint -> mass -> banded storeys -> facade modules -> terminal), street
 * scale rather than tower scale, and with the two terminals a street has and a
 * tower does not: a distinct SHOPFRONT ground floor and a parapet with coping.
 *
 * A bay is the repeat unit (skill §4.3), and a bay is only a bay if the opening
 * has real depth: reveal, sill, lintel, spandrel. A flat plane with a window
 * pattern passes at 50 m and fails at 5 m, and the camera here is at 5 m.
 */
function buildStreetFrontage(
  rnd: () => number, bays: number, storeys: number, width: number,
): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const DEPTH = 5.2;
  const GROUND_H = 3.35;
  const STOREY_H = 2.85;
  // The facade LAYER. The mass stops 0.34 m behind the building line and the
  // front 0.34 m is built out of piers and bands, so the windows are genuine
  // HOLES. The first version of this function put a recessed pane behind a
  // solid wall, which is invisible and is the single most common way a
  // procedural facade fails row 4 of the bar: it looks like a bay in the code
  // and like a flat plane on the capture.
  const FACADE_T = 0.34;
  const SILL_BAND = 0.85;
  const HEAD_BAND = 0.55;
  const WIN_H = STOREY_H - SILL_BAND - HEAD_BAND;
  const bayW = width / bays;
  const pierW = Math.max(0.30, bayW * 0.27);
  const winW = bayW - pierW;
  const total = GROUND_H + storeys * STOREY_H;

  const box = (w: number, h: number, d: number, x: number, y: number, z: number, part: number) => {
    if (w <= 0 || h <= 0 || d <= 0) return;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(tag(g, part));
  };

  // Stage 2 - MASS, set back behind the facade layer.
  box(width, total, DEPTH - FACADE_T, 0, total / 2, -FACADE_T - (DEPTH - FACADE_T) / 2, F_WALL);

  // Terminal A - PARAPET with a coping course that OVERSAILS. The oversail is
  // the whole point: a parapet flush with the wall is invisible; one that steps
  // out 110 mm throws a line of shadow and reads from the far kerb.
  const parapetH = 0.55 + rnd() * 0.35;
  box(width, parapetH, DEPTH * 0.55, 0, total + parapetH / 2, -DEPTH * 0.275, F_WALL);
  box(width + 0.22, 0.11, DEPTH * 0.55 + 0.16, 0, total + parapetH + 0.055, -DEPTH * 0.275, F_TRIM);

  /* --- Terminal B: the SHOPFRONT ground floor ----------------------- */
  // Pilaster, stallriser, deep-set glazing, fascia. The set-back glazing is
  // what gives a parade its dark band at eye height.
  const SHOP_GLASS_Z = -FACADE_T + 0.04;
  const fasciaH = 0.62;
  const riserH = 0.45;
  for (let b = 0; b <= bays; b++) {
    const px = -width / 2 + bayW * b;
    box(pierW, GROUND_H, FACADE_T + 0.06, px, GROUND_H / 2, -FACADE_T / 2 + 0.03, F_TRIM);
  }
  box(width, fasciaH, FACADE_T + 0.12, 0, GROUND_H - fasciaH / 2, -FACADE_T / 2 + 0.06, F_SHOP);
  for (let b = 0; b < bays; b++) {
    const cx = -width / 2 + bayW * (b + 0.5);
    box(winW, riserH, FACADE_T + 0.02, cx, riserH / 2, -FACADE_T / 2 + 0.01, F_TRIM);
    const glazH = GROUND_H - fasciaH - riserH;
    box(winW, glazH, 0.05, cx, riserH + glazH / 2, SHOP_GLASS_Z, F_GLASS);
    // A recessed doorway on roughly a third of the bays, seeded not alternating.
    if (rnd() < 0.34) {
      box(0.95, glazH + riserH - 0.10, 0.06, cx + bayW * 0.26, (glazH + riserH - 0.10) / 2, SHOP_GLASS_Z - 0.10, F_GLASS);
    }
  }

  /* --- the BAY, repeated up the elevation --------------------------- */
  for (let s = 0; s < storeys; s++) {
    const y0 = GROUND_H + s * STOREY_H;
    // Spandrel band under the openings and head band over them: these two are
    // the wall, and everything between them and between the piers is void.
    box(width, SILL_BAND, FACADE_T, 0, y0 + SILL_BAND / 2, -FACADE_T / 2, F_WALL);
    box(width, HEAD_BAND, FACADE_T, 0, y0 + SILL_BAND + WIN_H + HEAD_BAND / 2, -FACADE_T / 2, F_WALL);
    const wy = y0 + SILL_BAND + WIN_H / 2;
    for (let b = 0; b <= bays; b++) {
      const px = -width / 2 + bayW * b;
      box(pierW, WIN_H, FACADE_T, px, wy, -FACADE_T / 2, F_WALL);
    }
    for (let b = 0; b < bays; b++) {
      const cx = -width / 2 + bayW * (b + 0.5);
      // Glass at the BACK of the 0.34 m reveal, so the opening self-shadows.
      box(winW - 0.06, WIN_H - 0.06, 0.05, cx, wy, -FACADE_T + 0.035, F_GLASS);
      // A glazing bar, because a single dark rectangle reads as a hole and a
      // divided one reads as a window. One box per opening.
      box(0.05, WIN_H - 0.06, 0.05, cx, wy, -FACADE_T + 0.08, F_TRIM);
      // Sill, oversailing and proud of the facade plane; lintel over.
      box(winW + 0.30, 0.10, FACADE_T + 0.14, cx, y0 + SILL_BAND - 0.05, -FACADE_T / 2 + 0.07, F_TRIM);
      box(winW + 0.22, 0.12, FACADE_T + 0.08, cx, y0 + SILL_BAND + WIN_H + 0.06, -FACADE_T / 2 + 0.04, F_TRIM);
    }
    // STRING COURSE at the storey line, full width, proud. Two of the cheapest
    // boxes in the file and they do more for "this is a street" than the noise.
    if (s > 0) box(width + 0.14, 0.10, FACADE_T + 0.18, 0, y0, -FACADE_T / 2 + 0.09, F_TRIM);
  }
  return parts;
}

/**
 * The frontage material. Four surfaces off `facePart`, one pipeline.
 *
 * The brick/render course lines and the tonal drift between buildings are what
 * stop eight frontages reading as one extruded wall; the soot gradient (dirtier
 * high, washed low where the rain reaches) is the cheapest single thing that
 * makes a procedural facade stop looking new.
 */
function createFrontageMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  mat.metalness = 0;
  const part = attribute('facePart', 'float');
  // Street frame, for the same reason as the ground material: the per-building
  // and per-bay hashes have to index along the street, not across the map.
  const p = positionLocal;
  const dist = length(positionWorld.sub(cameraPosition));
  const detail = smoothstep(float(52), float(24), dist);

  // Per-building tone: hashed off a 14 m cell so each frontage is its own stone.
  const buildingTone = valueNoise2(vec2(floor(p.z.div(14.0)), floor(p.x.mul(0.07)))).sub(0.5);
  // Course lines: horizontal every 0.24 m, softened with distance.
  const course = smoothstep(float(0.40), float(0.49), abs(fract(p.y.div(0.24)).sub(0.5))).mul(detail);
  const render = fbm2(vec2(p.x.add(p.z).mul(3.1), p.y.mul(3.1)), 3).sub(0.5).mul(0.055).mul(detail);
  // Soot high, rain-washed low. Height is measured from the pavement.
  const soot = smoothstep(float(1.2), float(9.5), p.y).mul(0.42);
  const wall = vec3(0.295, 0.274, 0.248)
    .add(buildingTone.mul(vec3(0.085, 0.074, 0.062)))
    .add(render)
    .sub(course.mul(vec3(0.020, 0.019, 0.018)))
    .sub(soot.mul(vec3(0.048, 0.044, 0.040)));

  // Glass is dark, slightly blue, and NOT a mirror: a shopfront full of sky
  // reflection at street level reads as a bug, and a dark reveal reads as depth.
  const glassTone = valueNoise2(vec2(floor(p.y.div(2.85)), floor(p.z.div(1.7)))).mul(0.35);
  const glass = vec3(0.030, 0.040, 0.051).add(glassTone.mul(vec3(0.042, 0.050, 0.060)));

  const trim = vec3(0.395, 0.382, 0.356).sub(soot.mul(vec3(0.050, 0.048, 0.044))).add(render.mul(0.5));
  // Shop fascias: a seeded saturated band per bay is where a street parade gets
  // its colour. Never at full saturation — a painted timber fascia is a tint.
  const bayId = floor(p.z.div(3.1)).add(floor(p.x.mul(0.13)));
  const h = valueNoise2(vec2(bayId, float(3.7)));
  const h2 = valueNoise2(vec2(bayId, float(11.3)));
  const shop = vec3(0.085, 0.078, 0.072)
    .add(vec3(h.mul(0.26), h2.mul(0.21), h.mul(h2).mul(0.17)))
    .sub(soot.mul(vec3(0.03, 0.03, 0.03)));

  const isWall = smoothstep(float(0.6), float(0.4), part);
  const isGlass = smoothstep(float(0.4), float(0.6), part).mul(smoothstep(float(1.6), float(1.4), part));
  const isTrim = smoothstep(float(1.4), float(1.6), part).mul(smoothstep(float(2.6), float(2.4), part));
  const isShop = smoothstep(float(2.4), float(2.6), part);

  mat.colorNode = wall.mul(isWall).add(glass.mul(isGlass)).add(trim.mul(isTrim)).add(shop.mul(isShop));
  mat.roughnessNode = float(0.92).sub(isGlass.mul(0.80)).sub(isTrim.mul(0.10));
  mat.metalnessNode = isGlass.mul(0.35);
  return mat;
}

/* ------------------------------------------------------------------ */
/* 3-4. FURNITURE AND VEHICLES — instanced, one material each          */
/* ------------------------------------------------------------------ */

const U_METAL = 0;
const U_PAINT = 1;
const U_GLASS = 2;
/** Warm emissive: street-lamp luminaires. */
const U_LAMP = 3;
/** Red emissive: tail lamps and the signal's stop aspect ONLY. */
const U_TAIL = 4;
/** Retroreflective band: bright, NOT emissive. A glowing bollard is a bug. */
const U_BAND = 5;

/** Merge a list of tagged geometries into one, keeping the part attribute. */
function mergeTagged(list: THREE.BufferGeometry[], attrName: string): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const tags: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    const gu = g.getAttribute('uv');
    const gt = g.getAttribute(attrName);
    for (let i = 0; i < gp.count * 3; i++) pos.push(gp.array[i] as number);
    for (let i = 0; i < gp.count * 3; i++) nor.push(gn ? (gn.array[i] as number) : 0);
    for (let i = 0; i < gp.count * 2; i++) uvs.push(gu ? (gu.array[i] as number) : 0);
    for (let i = 0; i < gp.count; i++) tags.push(gt ? (gt.array[i] as number) : 0);
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push((gi.array[i] as number) + off);
    else for (let i = 0; i < gp.count; i++) idx.push(i + off);
    off += gp.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setAttribute(attrName, new THREE.Float32BufferAttribute(tags, 1));
  out.setIndex(idx);
  out.computeBoundingSphere();
  list.forEach((g) => g.dispose());
  return out;
}

function tagU(geo: THREE.BufferGeometry, part: number): THREE.BufferGeometry {
  const n = geo.getAttribute('position').count;
  const a = new Float32Array(n);
  a.fill(part);
  geo.setAttribute('itemPart', new THREE.BufferAttribute(a, 1));
  return geo;
}

/** Lamp standard: column, swan arm, luminaire. ~3.9 m to the light. */
function lampPrototype(): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [];
  g.push(tagU(new THREE.CylinderGeometry(0.10, 0.13, 0.24, 8).translate(0, 0.12, 0), U_METAL));
  g.push(tagU(new THREE.CylinderGeometry(0.055, 0.085, 3.7, 8).translate(0, 1.97, 0), U_METAL));
  const arm = new THREE.CylinderGeometry(0.045, 0.045, 1.15, 6);
  arm.rotateZ(Math.PI / 2 - 0.34);
  arm.translate(0.52, 3.92, 0);
  g.push(tagU(arm, U_METAL));
  g.push(tagU(new THREE.BoxGeometry(0.62, 0.10, 0.26).translate(1.02, 4.06, 0), U_METAL));
  g.push(tagU(new THREE.BoxGeometry(0.50, 0.05, 0.20).translate(1.02, 3.99, 0), U_LAMP));
  return mergeTagged(g, 'itemPart');
}

/** Signal mast: post, mast arm, three-aspect head, plus a pedestrian head. */
function signalPrototype(): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [];
  g.push(tagU(new THREE.CylinderGeometry(0.075, 0.095, 3.4, 8).translate(0, 1.7, 0), U_METAL));
  g.push(tagU(new THREE.BoxGeometry(0.30, 0.86, 0.26).translate(0, 2.95, 0.14), U_METAL));
  for (let i = 0; i < 3; i++) {
    g.push(tagU(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8)
      .rotateX(Math.PI / 2).translate(0, 3.27 - i * 0.29, 0.29), i === 0 ? U_TAIL : U_GLASS));
  }
  g.push(tagU(new THREE.BoxGeometry(0.26, 0.34, 0.20).translate(0, 1.42, 0.13), U_METAL));
  return mergeTagged(g, 'itemPart');
}

/** Bollard: the cheapest correct-scale object there is, and twelve beat two. */
function bollardPrototype(): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [];
  g.push(tagU(new THREE.CylinderGeometry(0.075, 0.095, 0.94, 8).translate(0, 0.47, 0), U_METAL));
  g.push(tagU(new THREE.SphereGeometry(0.078, 8, 5).translate(0, 0.95, 0), U_METAL));
  g.push(tagU(new THREE.CylinderGeometry(0.082, 0.082, 0.055, 8).translate(0, 0.74, 0), U_BAND));
  return mergeTagged(g, 'itemPart');
}

/** Litter bin on a post, and a squat hydrant body — one prototype, two reads. */
function binPrototype(): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [];
  g.push(tagU(new THREE.CylinderGeometry(0.055, 0.055, 0.72, 6).translate(0, 0.36, 0), U_METAL));
  g.push(tagU(new THREE.CylinderGeometry(0.235, 0.195, 0.62, 10).translate(0, 1.02, 0), U_PAINT));
  g.push(tagU(new THREE.CylinderGeometry(0.255, 0.255, 0.05, 10).translate(0, 1.35, 0), U_METAL));
  g.push(tagU(new THREE.CylinderGeometry(0.185, 0.185, 0.03, 10).translate(0, 1.30, 0), U_GLASS));
  return mergeTagged(g, 'itemPart');
}

/**
 * A parked-car silhouette. SCENERY, not traffic (skill §4.5): it never moves,
 * it is one instanced family, and it is built to be usable as chest-height
 * cover — the roof line sits at 1.42 m, which is above a crouched operator and
 * below a standing one.
 */
function vehiclePrototype(): THREE.BufferGeometry {
  const g: THREE.BufferGeometry[] = [];
  const L = 4.34;
  const W = 1.79;
  // Lower body and sills. At 5 m the read is the greenhouse-to-body ratio and
  // the wheel arches, and nothing else - so those are what is built.
  g.push(tagU(new THREE.BoxGeometry(W, 0.52, L).translate(0, 0.62, 0), U_PAINT));
  g.push(tagU(new THREE.BoxGeometry(W * 0.92, 0.28, L * 0.98).translate(0, 0.36, 0), U_PAINT));
  // THE GREENHOUSE. The glass volume is the OUTER shell and the painted roof
  // and pillars sit proud of it. The first version had the glass box entirely
  // inside the painted cabin box, so the car had no windows at all and read as
  // a solid brick - invisible in code, obvious on the capture.
  g.push(tagU(new THREE.BoxGeometry(W * 0.86, 0.52, L * 0.50).translate(0, 1.14, -0.16), U_GLASS));
  g.push(tagU(new THREE.BoxGeometry(W * 0.84, 0.11, L * 0.48).translate(0, 1.42, -0.16), U_PAINT));
  // A/B/C pillars, proud of the glass so they break the band the way a real
  // greenhouse does.
  for (const sx of [-1, 1]) {
    for (const [pz, pw] of [[L * 0.235, 0.10], [0.02, 0.075], [-L * 0.235, 0.11]] as const) {
      g.push(tagU(new THREE.BoxGeometry(pw, 0.50, 0.13)
        .translate(sx * W * 0.435, 1.14, pz - 0.16), U_PAINT));
    }
  }
  // Wheels, and the arch they sit under.
  for (const sx of [-1, 1]) {
    for (const sz of [1.34, -1.34]) {
      const w = new THREE.CylinderGeometry(0.325, 0.325, 0.22, 14);
      w.rotateZ(Math.PI / 2);
      w.translate(sx * (W / 2 - 0.06), 0.325, sz);
      g.push(tagU(w, U_METAL));
      g.push(tagU(new THREE.BoxGeometry(0.10, 0.30, 0.86)
        .translate(sx * (W / 2 - 0.02), 0.52, sz), U_METAL));
    }
  }
  // Tail lamps - emissive, and the one detail that says "car" at 30 m in a dull
  // frame. Head lamps are glass, because a parked car's lights are off.
  for (const sx of [-1, 1]) {
    g.push(tagU(new THREE.BoxGeometry(0.34, 0.16, 0.06)
      .translate(sx * W * 0.32, 0.82, L / 2 + 0.01), U_TAIL));
    g.push(tagU(new THREE.BoxGeometry(0.34, 0.14, 0.06)
      .translate(sx * W * 0.32, 0.80, -L / 2 - 0.01), U_GLASS));
  }
  return mergeTagged(g, 'itemPart');
}

/**
 * One material for every instanced item in the cell — furniture and vehicles
 * alike. Four surfaces off `itemPart`; the paint colour comes from a per-
 * INSTANCE attribute, which is how a family of differently-coloured parked
 * cars costs one pipeline instead of ten.
 */
function createItemMaterial(): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial();
  const part = attribute('itemPart', 'float');
  const tint = attribute('instanceTint', 'vec3');
  const p = positionWorld;

  /** Mask for one part id. Flat per vertex, so exactly one is 1 per fragment. */
  const is = (k: number) => smoothstep(float(k - 0.6), float(k - 0.4), part)
    .mul(smoothstep(float(k + 0.6), float(k + 0.4), part));

  const grime = fbm2(xz(p, 3.0), 2).sub(0.5).mul(0.035);
  // Contact darkening: everything gets dirtier towards the ground. On a parked
  // car this is the sill shadow that stops it floating; on a bollard it is the
  // splash line. One smoothstep, and it is the difference between an object
  // placed on the street and one dropped above it.
  const contact = smoothstep(float(0.95), float(0.05), p.y.sub(float(PAVE_Y))).mul(0.55);

  const isMetal = is(U_METAL);
  const isPaint = is(U_PAINT);
  const isGlass = is(U_GLASS);
  const isLamp = is(U_LAMP);
  const isTail = is(U_TAIL);
  const isBand = is(U_BAND);
  const emissiveMask = max(isLamp, isTail);

  const metal = vec3(0.075, 0.076, 0.080).add(grime);
  const paint = tint.add(grime.mul(0.6));
  const glass = vec3(0.014, 0.017, 0.021);
  // Warm sodium-ish luminaire, NOT the tail-lamp red. Using one emissive colour
  // for both put a red light on top of every lamp column in the cell.
  const lampCol = vec3(0.92, 0.78, 0.52);
  const tailCol = vec3(0.68, 0.11, 0.07);
  const band = vec3(0.62, 0.60, 0.55).add(grime);

  const base = metal.mul(isMetal)
    .add(paint.mul(isPaint))
    .add(glass.mul(isGlass))
    .add(lampCol.mul(isLamp))
    .add(tailCol.mul(isTail))
    .add(band.mul(isBand));
  mat.colorNode = base.mul(float(1).sub(contact.mul(float(1).sub(emissiveMask))));
  mat.roughnessNode = float(0.62).sub(isGlass.mul(0.52)).sub(isPaint.mul(0.24)).sub(isBand.mul(0.28));
  mat.metalnessNode = isMetal.mul(0.72).add(isPaint.mul(0.28));
  // Emissive on the two lamp parts only, so tail lamps and the stop aspect read
  // in a dull frame without adding a light or touching the grade.
  mat.emissiveNode = lampCol.mul(isLamp).mul(0.85).add(tailCol.mul(isTail).mul(0.9));
  return mat;
}

/* ------------------------------------------------------------------ */
/* 5. WAYFINDING                                                       */
/* ------------------------------------------------------------------ */

/**
 * Street-name blade, on the project's existing procedural text route: a 2D
 * canvas rasterised to a CanvasTexture on a world plane, exactly as the
 * corridor signs in main.ts do it. No font file is imported and no image is
 * loaded; the glyphs come from the browser's own UI stack at run time.
 *
 * Never a THREE.Sprite — the repo's own lesson, kept: a billboarded sign grows
 * across the viewport as you approach and clips.
 */
function createStreetBlade(name: string): THREE.Mesh | null {
  if (typeof document === 'undefined') return null;
  const W = 512;
  const H = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b1f26';
  ctx.fillRect(0, 0, W, 6);
  ctx.fillRect(0, H - 6, W, 6);
  ctx.font = '700 44px "Arial Narrow", "Roboto Condensed", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(name.toUpperCase(), W / 2, H / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });

  // BOTH blades of the finger-post live in ONE geometry, at right angles, so
  // the street is named from both approaches for a single draw call. Two
  // meshes would have been the obvious thing and would have cost two, which is
  // 17% of this cell's entire draw budget spent on a sign.
  // PlaneGeometry's front face has u increasing with +x, and the corridor's
  // yaw puts +x on the viewer's LEFT at both capture poses - so the name read
  // back to front on the first capture. Flipping u costs nothing and fixes it
  // for both blades; rotating the quad would only have shown the back face.
  const flipU = (g: THREE.BufferGeometry) => {
    const uv = g.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    uv.needsUpdate = true;
    return g;
  };
  const a = flipU(new THREE.PlaneGeometry(1.35, 0.253));
  a.translate(0.62, 0, 0);
  const b = flipU(new THREE.PlaneGeometry(1.35, 0.253));
  b.rotateY(Math.PI / 2);
  b.translate(0, 0, -0.62);
  const geo = mergeSimpleUV([a, b]);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.presentationOnly = true;
  return mesh;
}

/** Merge for geometries carrying only position/normal/uv (the blade pair). */
function mergeSimpleUV(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const gp = g.getAttribute('position');
    const gn = g.getAttribute('normal');
    const gu = g.getAttribute('uv');
    for (let i = 0; i < gp.count * 3; i++) pos.push(gp.array[i] as number);
    for (let i = 0; i < gp.count * 3; i++) nor.push(gn ? (gn.array[i] as number) : 0);
    for (let i = 0; i < gp.count * 2; i++) uvs.push(gu ? (gu.array[i] as number) : 0);
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push((gi.array[i] as number) + off);
    else for (let i = 0; i < gp.count; i++) idx.push(i + off);
    off += gp.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  list.forEach((g) => g.dispose());
  return out;
}

/* ------------------------------------------------------------------ */
/* Assembly                                                            */
/* ------------------------------------------------------------------ */

export interface StreetCell {
  group: THREE.Group;
  dispose(): void;
  /**
   * Counts, so a report can state what the cell added without guessing.
   * `objects` is renderable objects added to the scene graph - NOT draw calls,
   * which depend on culling and on the shadow pass and are measured with
   * `scripts/qa/probe-map3-draw-settling.mjs --toggle hf419-street-cell`.
   */
  stats: { objects: number; materials: number; instances: number };
}

/**
 * Build the cell. Every geometry and every MATERIAL OBJECT is created here, at
 * construction, and nothing in this module runs per frame or allocates per
 * frame - there is no `update()` at all.
 *
 * That is NOT the same as "no pipeline is created later", and an earlier draft
 * of this comment claimed it was. three compiles a render PIPELINE lazily, the
 * first time an object is actually drawn, so the eight pipelines this cell
 * needs are compiled at first sight of corridor 3 - about 13 s into a load,
 * not at construction. Measured, not assumed:
 * `docs/evidence/pass86/hf419/pipeline-census-after.json` (36 post-mark
 * creations with the cell, 28 without) and its `verdict: FAIL`.
 *
 * The number that surprises people: the eight are ground 1, frontage 1, blade
 * 1, and FIVE for the one shared item material - one per InstancedMesh family.
 * Budget pipelines per instanced family, not per material.
 */
export function createStreetCell(seed = 419): StreetCell {
  const group = new THREE.Group();
  // Named so `scripts/qa/probe-map3-draw-settling.mjs --toggle hf419-street-cell`
  // can hide and show the whole cell three frames apart and read the paired
  // difference in `renderer.info`. A Map 3 HUD draw count sampled once per pose
  // wanders by ~20 between samples (the scene-wide shadow pass covers
  // time-varying content near the hub whatever the camera looks at), so a
  // per-pose before/after subtraction cannot resolve a delta this small.
  group.name = 'hf419-street-cell';
  const disposables: Array<{ dispose(): void }> = [];
  const rnd = mulberry32(seed);
  /** Instanced families in the cell; the draw-call arithmetic depends on it. */
  const FAMILIES = 5;

  /* --- 1. ground ---------------------------------------------------- */
  const groundMat = createGroundMaterial();
  const groundGeo = buildCellGround();
  const ground = new THREE.Mesh(groundGeo, groundMat);
  // SHADOWS OFF, deliberately and measurably. Map 3's sun uses a +-34 m
  // orthographic shadow camera centred on the hub; this cell sits 70-92 m out
  // along corridor 3, entirely outside it, so castShadow here buys no shadow
  // and costs a shadow-pass draw per casting object. The saving was originally
  // quoted as "5 of the cell's 13 added draws" off a single HUD sample per
  // pose; that instrument was later shown to wander by ~20 draws at a fixed
  // camera, so the honest figure is the paired one in
  // `docs/evidence/pass86/hf419/draw-settling-after.json`
  // (`castShadowVariant`), which measures the same toggle with casting forced
  // back on. receiveShadow stays on: it is free here and keeps the cell correct
  // if the shadow camera is ever widened by another lane. This is a cost cut,
  // not a loosened gate: no threshold moved.
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(groundGeo, groundMat);

  /* --- 2. frontages, both sides ------------------------------------- */
  const frontageMat = createFrontageMaterial();
  disposables.push(frontageMat);
  const frontageParts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1] as const) {
    let z = Z_START - 1.2;
    while (z > Z_END + 3.0) {
      const maxW = z - Z_END - 0.6;
      const width = Math.min(5.6 + rnd() * 4.4, maxW);
      if (width < 3.0) break;
      const bays = Math.max(2, Math.round(width / 3.1));
      const storeys = 2 + Math.floor(rnd() * 3);
      const block = buildStreetFrontage(rnd, bays, storeys, width);
      const merged = mergeTagged(block, 'facePart');
      // The facade plane sits ON the building line, facing the carriageway.
      const m = new THREE.Matrix4().makeRotationY(side < 0 ? Math.PI / 2 : -Math.PI / 2);
      m.setPosition(side * BUILDING_X, PAVE_Y, z - width / 2);
      merged.applyMatrix4(m);
      frontageParts.push(merged);
      z -= width + 0.12;
    }
  }
  const frontageGeo = mergeTagged(frontageParts, 'facePart');
  const frontage = new THREE.Mesh(frontageGeo, frontageMat);
  frontage.castShadow = false;
  frontage.receiveShadow = true;
  group.add(frontage);
  disposables.push(frontageGeo);

  /* --- 3-4. instanced families -------------------------------------- */
  const itemMat = createItemMaterial();
  disposables.push(itemMat);
  let instances = 0;

  const family = (
    proto: THREE.BufferGeometry,
    placements: Array<{ x: number; y: number; z: number; ry: number; s?: number; tint?: [number, number, number] }>,
  ) => {
    const mesh = new THREE.InstancedMesh(proto, itemMat, placements.length);
    const tints = new Float32Array(placements.length * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    placements.forEach((pl, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.ry);
      pos.set(pl.x, pl.y, pl.z);
      const s = pl.s ?? 1;
      scl.set(s, s, s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(i, m);
      const t = pl.tint ?? [0.06, 0.06, 0.065];
      tints[i * 3] = t[0]; tints[i * 3 + 1] = t[1]; tints[i * 3 + 2] = t[2];
    });
    mesh.instanceMatrix.needsUpdate = true;
    proto.setAttribute('instanceTint', new THREE.InstancedBufferAttribute(tints, 3));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    // Culling stays ON - a family flagged frustumCulled = false is drawn from
    // every pose in the map and quietly spends the cell's whole draw budget on
    // views that cannot see it. The instance-aware bounds are the correct fix.
    mesh.computeBoundingSphere();
    group.add(mesh);
    disposables.push(proto, mesh);
    instances += placements.length;
    return mesh;
  };

  // Kerb line for pole-mounted items: 0.55 m back from the kerb face, which is
  // where a real street puts them — far enough that a wing mirror clears.
  const poleX = ROAD_HALF + KERB_W + 0.42;

  const lamps: Array<{ x: number; y: number; z: number; ry: number; s?: number }> = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = Z_START - 2.6 - i * 3.5 - rnd() * 0.7;
    if (z - 0.2 < Z_END) break;
    lamps.push({ x: side * poleX, y: PAVE_Y, z, ry: side < 0 ? 0 : Math.PI, s: 0.96 + rnd() * 0.08 });
  }
  family(lampPrototype(), lamps);

  const signals = [
    { x: -poleX, y: PAVE_Y, z: Z_START - 1.4, ry: 0.18 },
    { x: poleX, y: PAVE_Y, z: Z_END + 2.2, ry: Math.PI + 0.14 },
  ];
  family(signalPrototype(), signals);

  const bollards: Array<{ x: number; y: number; z: number; ry: number; s?: number }> = [];
  for (let i = 0; i < 14; i++) {
    const side = i < 7 ? -1 : 1;
    const z = Z_START - 3.4 - (i % 7) * 2.55 - rnd() * 0.35;
    if (z - 0.1 < Z_END) continue;
    bollards.push({
      x: side * (ROAD_HALF + KERB_W + 0.24), y: PAVE_Y, z,
      ry: rnd() * 0.5 - 0.25, s: 0.94 + rnd() * 0.12,
    });
  }
  family(bollardPrototype(), bollards);

  const bins: Array<{ x: number; y: number; z: number; ry: number; tint?: [number, number, number] }> = [];
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const z = Z_START - 5.1 - i * 4.3 - rnd() * 0.9;
    if (z - 0.3 < Z_END) continue;
    bins.push({
      x: side * (poleX + 0.22), y: PAVE_Y, z,
      ry: rnd() * Math.PI, tint: [0.045, 0.075, 0.062],
    });
  }
  family(binPrototype(), bins);

  // Parked cars, flush to the kerb, alternating sides, with a gap left where a
  // dropped kerb would be. Colours are the real distribution of a British
  // street: mostly greys and blacks, one dark red, one dark blue.
  const carTints: Array<[number, number, number]> = [
    [0.052, 0.053, 0.056], [0.145, 0.148, 0.152], [0.085, 0.088, 0.094],
    [0.115, 0.030, 0.028], [0.026, 0.040, 0.075], [0.175, 0.176, 0.170],
    [0.040, 0.042, 0.044], [0.098, 0.100, 0.104],
  ];
  const cars: Array<{ x: number; y: number; z: number; ry: number; tint: [number, number, number] }> = [];
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = Z_START - 3.2 - Math.floor(i / 2) * 5.6 - rnd() * 0.5;
    if (z - 2.2 < Z_END) continue;
    cars.push({
      // Sill 0.17 m clear of the kerb face: parked, not embedded, and close
      // enough to be cover rather than an obstacle in the lane.
      x: side * (ROAD_HALF - 1.02), y: ROAD_Y - CAMBER * 0.7, z,
      ry: side < 0 ? Math.PI + (rnd() - 0.5) * 0.05 : (rnd() - 0.5) * 0.05,
      tint: carTints[i % carTints.length],
    });
  }
  family(vehiclePrototype(), cars);

  /* --- 5. wayfinding ------------------------------------------------- */
  // One finger-post on the first lamp column: two blades at right angles in a
  // single geometry, so the street is named from both approaches. A street name
  // and a road-graph read cost almost nothing and do a disproportionate share
  // of the "this is a real city" work (skill section 4.7) - which is why it is
  // built in the first wave and not left to the end.
  const blade = createStreetBlade('ASHGROVE ST');
  if (blade) {
    blade.position.set(-poleX, PAVE_Y + 2.62, Z_START - 2.6);
    group.add(blade);
    disposables.push(blade.geometry, blade.material as THREE.Material);
  }

  return {
    group,
    // ground, frontage, 5 instanced families, blade = 8 renderable objects;
    // ground, frontage, the shared item material and the blade's = 4 materials.
    stats: { objects: 2 + FAMILIES + 1, materials: 4, instances },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
