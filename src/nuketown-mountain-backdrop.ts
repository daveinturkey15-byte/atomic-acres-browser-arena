/**
 * nuketown-mountain-backdrop.ts — Pass 82 "surrounding mountains in nuketown".
 *
 * A distant procedural mountain ring OUTSIDE the boundary fence: beyond the
 * fence plane the horizon was empty sky, so the military-suburb read ended at
 * a picket fence floating in void. This module closes the world with:
 *
 *   - a ground skirt disc well BELOW the arena ground plane (y = -0.42), so
 *     the land visibly continues past the fence to the ridges instead of
 *     dropping into sky;
 *   - a low scrubland foothill ring; and
 *   - a taller main ridge ring behind it, both built as seeded low-poly
 *     triangle strips with per-segment crest/height variation (procedural
 *     ridgelines, not one repeated cone) and flat shading.
 *
 * ART-ONLY BY CONSTRUCTION (the whole point of the placement envelope):
 *   - every ridge vertex sits radially OUTSIDE the boundary fence corner
 *     (NUKETOWN_BACKDROP_MIN_RADIAL_M > |bounds corner| + fence), so no
 *     sightline test inside the arena can ever intersect it;
 *   - everything stays inside the arena camera's 180 m far plane from every
 *     reachable camera position (max radial + arena corner < 180);
 *   - no colliders, no raycast surfaces, no shadow passes.
 *
 * v4 2026-08-31 — "the mountains are inverted". Two measured causes, both
 * fixed here:
 *
 *   (a) THE VERTEX COLOURS WERE BEING DELETED AT RUNTIME. legacy-main's
 *       `batchPresentationRootOnce(neighbourhoodLifeRoot, 'palette-lit')`
 *       runs a SECOND static batch over the whole pass31 group long after
 *       this module has added itself to it. In 'palette-lit' mode
 *       art-kit.ts::batchStaticMeshes keys the batch on the material's
 *       `color` — 0xffffff for a vertexColors material — builds a fresh
 *       flat-white MeshLambertMaterial, and DELETES every attribute outside
 *       {position, normal}. The whole altitude/haze palette authored below
 *       was thrown away every single run and the massif was drawn as one
 *       merged, flat, pure-white Lambert batch. That is the paper-snowdrift
 *       look, and no amount of colour authoring could have survived it.
 *       Fix: `group.userData.dynamic = true`, the repo-standard opt-out that
 *       `batchStaticMeshes` honours (it is what rain-presentation and the
 *       flower beds already use). Costs 4 draws of a 560 budget.
 *   (b) THE RIDGE WAS FOGGED BRIGHTER THAN THE SKY. This arena's authored
 *       fog is 0xb1c0be (a pale grey-green, relative luminance 0.73) while
 *       its sunset sky measures 85-95/255 at the horizon. At the ridge's
 *       96-132 m the linear fog factor is 0.58-0.82, so runtime fog alone
 *       put a FLOOR under the ridge well above the sky behind it: even a
 *       black ridge could not read as a silhouette. Distant backdrops are
 *       painted, not lit and not fogged — so the three ridge rings now use
 *       an unlit MeshBasicMaterial with `fog = false` and carry their own
 *       baked terms: a directional shading term from the arena sun so the
 *       facets keep their form, and a radial haze term (kit-style, ported
 *       from environment-kit.ts::buildRidgeRing) that grades the far rows
 *       toward a dusk horizon colour. The snow lerp is GONE — a snowline
 *       that lerps crests 85% toward 0xdde4e6 is the single brightest thing
 *       that can be put on a horizon.
 *       The ground skirt keeps `fog = true` and stays lit: it is ground
 *       continuing out of the arena, and the arena's fog is correct for it.
 *
 * Original geometry only (repo sourcePolicy): every vertex is computed here
 * from a fixed-seed mulberry32 stream — deterministic on every peer.
 */
import * as THREE from 'three';

/** Every ridge vertex is at least this far from the world origin (metres).
 * The boundary fence corner sits at hypot(31.3, 31.8) = 44.6 m; the envelope
 * starts well beyond it so the backdrop can never enter gameplay space. */
export const NUKETOWN_BACKDROP_MIN_RADIAL_M = 58;
/** Radial ceiling (metres): max radial + arena camera corner (44.3 m) stays
 * inside the atomic-acres 180 m camera far plane with margin. */
export const NUKETOWN_BACKDROP_MAX_RADIAL_M = 132;
/** Crest ceiling (metres). */
export const NUKETOWN_BACKDROP_MAX_HEIGHT_M = 34;
/** The ground skirt never rises above this (kept below the arena ground). */
export const NUKETOWN_BACKDROP_SKIRT_Y_M = -0.42;

const SEED = 0x0a82_5c17;
/**
 * Dusk horizon haze. Deliberately NOT the arena's fog colour: 0xb1c0be is
 * brighter than this arena's sky and hazing toward it is what inverted the
 * ridge in the first place. This is the blue-violet a sunset horizon actually
 * washes distant land toward, and it sits BELOW the measured sky luminance so
 * the far rows recede instead of glowing.
 */
const HAZE_COLOR = new THREE.Color(0x47526f);
/** Direction the arena's key light comes FROM (atomic-acres sun at -48/42/30). */
const SUN_DIRECTION = new THREE.Vector3(-48, 42, 30).normalize();
/** Measurement switch — see the v4 note in the file header. */
const RIDGE_FOG = false;

export interface NuketownBackdropStats {
  meshes: number;
  triangles: number;
}

export interface NuketownMountainBackdrop {
  group: THREE.Group;
  stats: Readonly<NuketownBackdropStats>;
  dispose(): void;
}

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

type RidgeRingSpec = Readonly<{
  name: string;
  segments: number;
  /** Radial band [innerBase, outerBase]; the crest wanders inside it. */
  innerRadius: number;
  outerRadius: number;
  /** Crest height band [min, max] before the per-segment variation. */
  heightMin: number;
  heightMax: number;
  /** Base colour at the foot and near the crest (vertex-colour lerp). */
  footColor: number;
  crestColor: number;
  /** Decorrelates the sine octaves between rings. */
  phase: number;
  /**
   * How far this ring's far side washes into HAZE_COLOR, 0..1. Ported from
   * environment-kit.ts::buildRidgeRing, which is the reference implementation
   * the owner's kit ridge (measured ridge/sky 0.10) gets its depth from.
   */
  haze: number;
  /** Baked sun term: 0 = flat paint, 1 = full swing between lit and shaded. */
  shadeStrength: number;
}>;

/**
 * One ridge ring, v2 (owner 2026-08-29: "mountains should be implemented
 * using the techniques I am sharing"). Five vertex rows per angular segment
 * (inner foot, inner shoulder, crest, outer shoulder, outer foot) displaced
 * by RIDGED octave noise - 1-|sin| octaves sharpen the crestline into peaks
 * and saddles the way ridged FBM does, instead of the old three-row tent
 * profile that read as one soft lump from every angle. Colour is banded by
 * altitude (dry scrub foot, sage rock mid-slope, pale granite crest) with
 * per-segment tonal break-up, and the shoulders carry their own radial spur
 * jitter so spurs run down the slopes. Deterministic: same seeded stream.
 */
function buildRidgeRing(spec: RidgeRingSpec): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const foot = new THREE.Color(spec.footColor);
  const mid = new THREE.Color(spec.footColor).lerp(new THREE.Color(spec.crestColor), 0.55);
  const crest = new THREE.Color(spec.crestColor);
  const vertexColor = new THREE.Color();

  // Ridged octave: 1-|sin| gives sharp peaks at the sine zero crossings.
  const ridged = (angle: number, phase: number): number => {
    const o1 = 1 - Math.abs(Math.sin(angle * 3 + phase));
    const o2 = 1 - Math.abs(Math.sin(angle * 7 + phase * 2.3));
    const o3 = 1 - Math.abs(Math.sin(angle * 13 + phase * 4.1));
    const o4 = 1 - Math.abs(Math.sin(angle * 23 + phase * 7.9));
    return (o1 * 0.42 + o2 * 0.28 + o3 * 0.19 + o4 * 0.11);
  };

  const rows = 5;
  for (let segment = 0; segment <= spec.segments; segment += 1) {
    const wrapped = segment % spec.segments;
    const angle = (wrapped / spec.segments) * Math.PI * 2;
    const jitterA = mulberry32((SEED ^ (wrapped * 2654435761)) >>> 0)();
    const jitterB = mulberry32((SEED ^ ((wrapped + 977) * 40503)) >>> 0)();
    const jitterC = mulberry32((SEED ^ ((wrapped + 4409) * 69069)) >>> 0)();

    const relief = ridged(angle, spec.phase);
    const heightT = Math.min(1, Math.max(0.08, relief * 1.15 + (jitterA - 0.5) * 0.4));
    const height = spec.heightMin + (spec.heightMax - spec.heightMin) * heightT;
    const band = spec.outerRadius - spec.innerRadius;
    const crestRadius = spec.innerRadius
      + band * (0.36 + 0.26 * ridged(angle * 0.5 + 1.3, spec.phase * 1.7) + (jitterB - 0.5) * 0.16);
    // Spur jitter: shoulders wander off the crest line so ridgelines run
    // DOWN the slopes instead of the slope being one straight cone face.
    const spurIn = (jitterC - 0.5) * band * 0.18;
    const spurOut = (0.5 - jitterC) * band * 0.14;
    const innerShoulderR = spec.innerRadius + (crestRadius - spec.innerRadius) * 0.55 + spurIn;
    const outerShoulderR = crestRadius + (spec.outerRadius - crestRadius) * 0.5 + spurOut;
    const innerShoulderY = height * (0.4 + 0.18 * ridged(angle * 2.1, spec.phase + 2.2));
    const outerShoulderY = height * (0.5 + 0.16 * ridged(angle * 1.7, spec.phase + 4.4));

    const ringRows: Array<readonly [number, number, number]> = [
      [spec.innerRadius, -0.2, 0],
      [Math.max(spec.innerRadius, innerShoulderR), innerShoulderY, 0.45],
      [crestRadius, height, 1],
      [Math.min(spec.outerRadius, outerShoulderR), outerShoulderY, 0.5],
      [spec.outerRadius, -2.5, 0],
    ];
    for (let row = 0; row < rows; row += 1) {
      const [radius, y, altitude] = ringRows[row];
      positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      // Altitude banding: scrub foot -> sage rock -> cool crest, scaled by
      // how tall this segment actually is so low saddles stay scrubby.
      const t = altitude * Math.min(1, height / spec.heightMax);
      if (t < 0.5) vertexColor.copy(foot).lerp(mid, t * 2);
      else vertexColor.copy(mid).lerp(crest, (t - 0.5) * 2);
      // v4: NO snow lerp. The old snowline pulled crests 85% toward 0xdde4e6,
      // which is brighter than this arena's entire sky.
      //
      // Radial haze (kit port): the further out the vertex, the more it washes
      // into the dusk horizon. `smoothstep` over the ring's own radial band
      // keeps the near foot crisp and the far rim soft, exactly as
      // environment-kit's ridge does across its band parameter.
      const radialT = THREE.MathUtils.clamp(
        (radius - spec.innerRadius) / Math.max(1e-3, spec.outerRadius - spec.innerRadius), 0, 1,
      );
      vertexColor.lerp(HAZE_COLOR, spec.haze * THREE.MathUtils.smoothstep(radialT, 0.05, 0.95));
      // Baked directional shading. The ring materials are unlit (see the v4
      // note in the file header), so the sun has to be painted in or the
      // massif reads as one flat cut-out. Slope normal is approximated from
      // the row's rise over its radial run, which is all a ridge silhouette
      // needs and costs nothing at runtime.
      const rise = row === 0 ? 0 : ringRows[row][1] - ringRows[row - 1][1];
      const run = row === 0 ? 1 : Math.max(1e-3, ringRows[row][0] - ringRows[row - 1][0]);
      const slope = Math.atan2(rise, run);
      const facing = Math.cos(angle) * SUN_DIRECTION.x + Math.sin(angle) * SUN_DIRECTION.z;
      const lambert = THREE.MathUtils.clamp(
        0.5 + 0.5 * (Math.cos(slope) * SUN_DIRECTION.y - Math.sin(slope) * facing), 0, 1,
      );
      const shade = 1 - spec.shadeStrength + spec.shadeStrength * lambert;
      const tone = (0.94 + jitterA * 0.12) * shade;
      colors.push(vertexColor.r * tone, vertexColor.g * tone, vertexColor.b * tone);
    }
  }

  for (let segment = 0; segment < spec.segments; segment += 1) {
    const a = segment * rows;
    const b = (segment + 1) * rows;
    for (let row = 0; row < rows - 1; row += 1) {
      indices.push(a + row, b + row, a + row + 1);
      indices.push(a + row + 1, b + row, b + row + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.name = spec.name;
  return geometry;
}

/**
 * Height of the beyond-fence ground at (x, z), metres.
 *
 * v4 2026-08-31 — "the forest stands on a plate". The skirt used to be a flat
 * CircleGeometry at a constant y and every one of the 769 forest instances was
 * planted at that same constant, so 769 trees met the ground on a razor edge
 * with no contact anywhere. This is the ground the forest now queries (see
 * nuketown-forest-surround.ts): gentle seeded swells with a shallow rise
 * toward the foothills.
 *
 * CONTRACT: the return value is always <= NUKETOWN_BACKDROP_SKIRT_Y_M, i.e.
 * this ground can dip below the arena floor but never rise through it. The
 * skirt-containment test depends on that and so does the "no lip at the fence"
 * read, so the clamp is not a safety net, it is the definition.
 */
export function nuketownBackdropGroundY(x: number, z: number): number {
  const radial = Math.hypot(x, z);
  // Long swells (two decorrelated sine pairs) plus a shorter chop: enough
  // relief to break the plate, far too little to read as cover or terrain.
  const swell =
    Math.sin(x * 0.041 + 1.7) * Math.cos(z * 0.037 - 0.6) * 0.95 +
    Math.sin(x * 0.093 - 2.3) * Math.cos(z * 0.081 + 1.1) * 0.42 +
    Math.sin((x + z) * 0.171 + 0.4) * 0.18;
  // Beyond the forest band the ground lifts toward the foothill feet so the
  // massif grows out of the land instead of being parked on it.
  const lift = THREE.MathUtils.smoothstep(radial, 52, 74) * 1.35;
  return Math.min(NUKETOWN_BACKDROP_SKIRT_Y_M, NUKETOWN_BACKDROP_SKIRT_Y_M - 1.15 + swell * 0.62 + lift);
}

/** Ground normal at (x, z), central-differenced from the height field. */
export function nuketownBackdropGroundNormal(x: number, z: number, target = new THREE.Vector3()): THREE.Vector3 {
  const step = 1.6;
  const dx = nuketownBackdropGroundY(x + step, z) - nuketownBackdropGroundY(x - step, z);
  const dz = nuketownBackdropGroundY(x, z + step) - nuketownBackdropGroundY(x, z - step);
  return target.set(-dx, 2 * step, -dz).normalize();
}

/** The rolling beyond-fence ground disc, vertex-coloured scrub to forest floor. */
function buildGroundSkirt(): THREE.BufferGeometry {
  // A ring grid, not a triangle fan: CircleGeometry has no interior vertices,
  // so it cannot carry a height field at all.
  const geometry = new THREE.RingGeometry(0.5, NUKETOWN_BACKDROP_MAX_RADIAL_M, 72, 16);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const near = new THREE.Color(0x4c5340); // damp forest floor under the trees
  const far = new THREE.Color(0x5d6047); // dry scrub running up to the foothills
  const scratch = new THREE.Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    positions.setY(index, nuketownBackdropGroundY(x, z) - NUKETOWN_BACKDROP_SKIRT_Y_M);
    const radial = Math.hypot(x, z);
    scratch.copy(near).lerp(far, THREE.MathUtils.clamp((radial - 34) / 40, 0, 1));
    const mottle = 0.9 + 0.2 * (0.5 + 0.5 * Math.sin(x * 0.37 + 2.1) * Math.cos(z * 0.29 - 1.3));
    colors[index * 3] = scratch.r * mottle;
    colors[index * 3 + 1] = scratch.g * mottle;
    colors[index * 3 + 2] = scratch.b * mottle;
  }
  positions.needsUpdate = true;
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.name = 'nuketown-backdrop-ground-skirt';
  return geometry;
}

/**
 * Build the backdrop under `parent`. Deterministic; art-only. Returns stats
 * for telemetry/tests. Four meshes = four draws.
 */
export function buildNuketownMountainBackdrop(parent: THREE.Object3D): NuketownMountainBackdrop {
  const group = new THREE.Group();
  group.name = 'nuketown-mountain-backdrop';
  group.userData.presentationOnly = true;
  group.userData.blocksShots = false;
  group.userData.nuketownBackdrop = true;
  // THE fix for the paper-snowdrift ridge - see cause (a) in the file header.
  // legacy-main re-batches the whole pass31 group in 'palette-lit' mode, which
  // deletes the `color` attribute and replaces the material with flat white.
  // `dynamic` is art-kit.ts::batchStaticMeshes's documented opt-out.
  group.userData.dynamic = true;

  // Unlit ridge rings. A distant backdrop is painted, not lit: the sun term
  // and the haze term are baked per vertex above, so nothing here needs a
  // lighting pass, a shadow pass, or the arena's fog (which is keyed 0xb1c0be,
  // brighter than this arena's sky, and was putting a floor under the ridge
  // well above the sky behind it - measured ridge/sky 2.15 in the worst band).
  const ridgeMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    fog: RIDGE_FOG,
  });
  ridgeMaterial.name = 'nuketown-ridge-painted';
  // The skirt is different in kind: it is GROUND continuing out of the arena,
  // at arena distances, so it stays lit and stays fogged.
  const skirtMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });

  // Scrubby foothill band: low, close enough to be readable over the fence.
  const foothills = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-foothills',
      segments: 108,
      innerRadius: NUKETOWN_BACKDROP_MIN_RADIAL_M + 6, // 64
      outerRadius: 92,
      heightMin: 4,
      heightMax: 12,
      footColor: 0x2f3a2c,
      crestColor: 0x3d4735,
      phase: 1.9,
      haze: 0.34,
      shadeStrength: 0.55,
    }),
    ridgeMaterial,
  );
  // Main ridge: taller, further, mostly fog-graded silhouette.
  const ridge = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-ridge',
      segments: 144,
      innerRadius: 96,
      outerRadius: NUKETOWN_BACKDROP_MAX_RADIAL_M, // 132
      heightMin: 13,
      heightMax: NUKETOWN_BACKDROP_MAX_HEIGHT_M - 4, // 30
      footColor: 0x2d3444,
      crestColor: 0x3b4358,
      phase: 4.7,
      haze: 0.6,
      shadeStrength: 0.42,
    }),
    ridgeMaterial,
  );
  // v3: a third, taller far range fills the gap between the main ridge's
  // saddles so the horizon reads as a layered massif instead of one band.
  // v4: it carries the heaviest haze instead of a snowline, so it recedes.
  const farRange = new THREE.Mesh(
    buildRidgeRing({
      name: 'nuketown-mountain-far-range',
      segments: 120,
      innerRadius: 116,
      outerRadius: NUKETOWN_BACKDROP_MAX_RADIAL_M,
      heightMin: 20,
      heightMax: NUKETOWN_BACKDROP_MAX_HEIGHT_M,
      footColor: 0x323a51,
      crestColor: 0x414a63,
      phase: 8.3,
      haze: 0.82,
      shadeStrength: 0.3,
    }),
    ridgeMaterial,
  );
  const skirt = new THREE.Mesh(buildGroundSkirt(), skirtMaterial);
  skirt.name = 'nuketown-backdrop-ground-skirt';
  skirt.position.y = NUKETOWN_BACKDROP_SKIRT_Y_M;

  let triangles = 0;
  for (const mesh of [skirt, foothills, ridge, farRange]) {
    if (mesh !== skirt) mesh.name = mesh.geometry.name;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.presentationOnly = true;
    mesh.userData.blocksShots = false;
    mesh.userData.nuketownBackdrop = true;
    const index = mesh.geometry.index;
    triangles += index ? index.count / 3 : (mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
    group.add(mesh);
  }

  parent.add(group);
  const stats: NuketownBackdropStats = { meshes: 4, triangles: Math.round(triangles) };
  return {
    group,
    stats,
    dispose: () => {
      foothills.geometry.dispose();
      ridge.geometry.dispose();
      farRange.geometry.dispose();
      skirt.geometry.dispose();
      ridgeMaterial.dispose();
      skirtMaterial.dispose();
    },
  };
}
