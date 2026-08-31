/**
 * map3/corridors-extra.ts — corridors 4, 5 and 6.
 *
 *   4. WATER    — a Gerstner shoreline: displaced surface, depth-graded colour,
 *                 crest foam that is actually reachable, and a wet sand band.
 *   5. WEATHER  — walk through the whole weather and season table in one pass.
 *                 This is the prototype for the cross-arena system.
 *   6. VOLUME   — god rays and embers done as a real volumetric march rather
 *                 than seven additive quads at 0.02 opacity.
 *
 * Same contract as corridors.ts: a factory returning { group, update, dispose }
 * and nothing reaching outside it.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, PointsNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  Fn, Loop, abs, attribute, cameraPosition, clamp, cos, exp, float, mix,
  normalize, positionLocal, positionWorld, sin, smoothstep, uniform, vec3, vec4,
} = TSL as unknown as Record<string, any>;

import type { Corridor } from './corridors';
import { createTree, createGrassTuft, poissonScatter } from './plants';
import { mergeGeometries, hash11 } from './leaf-geometry';
import {
  AUTUMN_PALETTE, SPRING_PALETTE, SUMMER_PALETTE, WINTER_PALETTE,
  createBarkMaterial, createFoliageMaterial, createFoliageUniforms, rgb,
} from './foliage-material';

const W = 9;

/* ================================================================== */
/* 4. WATER                                                            */
/* ================================================================== */

/**
 * The shoreline.
 *
 * Built around the arithmetic lesson from the shipping ocean: crest foam there
 * is gated on `smoothstep(0.06, 0.2, slope)` while the wave bands can only
 * reach a maximum slope of 0.0268 rad, so the foam has never rendered a single
 * pixel. The gate here is DERIVED from the same band table that produces the
 * waves, so it cannot drift out of reach — if the amplitude changes, the gate
 * moves with it.
 */
export function createWaterCorridor(): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 46;

  const time = uniform(0);

  // Gerstner band table: direction, wavelength, weight. Deliberately
  // incommensurate wavelengths so the surface never returns to the same shape.
  const BANDS: Array<[number, number, number, number]> = [
    // dirX, dirZ, wavelength, weight
    [0.92, 0.39, 17.0, 1.00],
    [-0.31, 0.95, 9.4, 0.58],
    [0.71, -0.70, 5.1, 0.31],
    [-0.97, -0.25, 2.9, 0.17],
  ];
  const AMPLITUDE = 0.42;
  // Maximum achievable surface slope = A * sum(weight * k), k = 2*pi/lambda.
  // Everything that gates on slope is scaled by THIS, never by a constant.
  const slopeMax = AMPLITUDE * BANDS.reduce((s, b) => s + b[3] * ((2 * Math.PI) / b[2]), 0);

  /**
   * Gerstner displacement and slope.
   *
   * A plain JS helper, not a TSL `Fn`: the band count is known at build time,
   * so the sum unrolls into one node expression with no loop and no statement
   * scope. That is also the pattern the repo's production TSL uses.
   */
  const waveAt = (p: any) => {
    const t = time;
    let y: any = float(0);
    let sx: any = float(0);
    let sz: any = float(0);
    BANDS.forEach(([dx, dz, lambda, weight]) => {
      const k = (2 * Math.PI) / lambda;
      const speed = Math.sqrt(9.81 / k);
      const phase = p.x.mul(dx * k).add(p.z.mul(dz * k)).add(t.mul(k * speed));
      const a = AMPLITUDE * weight;
      y = y.add(sin(phase).mul(a));
      sx = sx.add(cos(phase).mul(a * k * dx));
      sz = sz.add(cos(phase).mul(a * k * dz));
    });
    return { y, sx, sz };
  };

  const waterMat = new MeshStandardNodeMaterial();
  waterMat.roughness = 0.14;
  waterMat.metalness = 0.0;
  waterMat.transparent = true;
  waterMat.opacity = 0.92;

  // Vertex displacement.
  {
    const p = positionLocal;
    const w = waveAt(p);
    waterMat.positionNode = vec3(p.x, p.y.add(w.y), p.z);
  }

  {
    const p = positionWorld;
    const w = waveAt(p);
    // Gradient MAGNITUDE. Summing |dx|+|dz| double-counts a diagonal wave and
    // saturates the normaliser, which is what put foam on every pixel.
    const slope = TSL.sqrt(w.sx.mul(w.sx).add(w.sz.mul(w.sz)));
    const norm = clamp(slope.div(float(slopeMax)), float(0), float(1));

    // Depth: the shore is at -z near the corridor mouth, deep water beyond.
    const depth = clamp(p.z.negate().sub(6).div(24), float(0), float(1));
    const shallow = rgb(0x1d4f57);
    const deep = rgb(0x04141d);
    const body = mix(shallow, deep, depth);

    // Foam on the steep faces. Because `norm` is normalised by the achievable
    // maximum, this knee is meaningful whatever the amplitude is set to.
    const foam = smoothstep(float(0.62), float(0.96), norm);
    // A second foam band at the waterline itself, independent of slope.
    const edge = float(1).sub(smoothstep(float(0), float(3.2), p.z.negate().sub(5)));
    const foamColour = rgb(0xdff0f2);
    waterMat.colorNode =
      mix(body, foamColour, clamp(foam.mul(0.8).add(edge.mul(0.45)), float(0), float(1)));
  }

  const waterGeo = new THREE.PlaneGeometry(W * 4, 42, 90, 90);
  waterGeo.rotateX(-Math.PI / 2);
  waterGeo.translate(0, 0.14, -LEN * 0.62);
  const water = new THREE.Mesh(waterGeo, waterMat);
  group.add(water);
  disposables.push(waterGeo, waterMat);

  // Beach: a wet band that darkens toward the water, which is most of what
  // sells a shoreline — a uniform sand plane meeting water reads as a decal.
  const sandMat = new MeshStandardNodeMaterial();
  sandMat.roughness = 0.9;
  {
    const p = positionWorld;
    const wet = smoothstep(float(-2.5), float(-9.5), p.z);
    const grain = sin(p.x.mul(31.7)).mul(sin(p.z.mul(27.3))).mul(0.5).add(0.5).mul(0.06);
    sandMat.colorNode = mix(rgb(0xb9a582), rgb(0x6d5c44), wet).add(vec3(grain, grain, grain));
    // Wet sand is glossy. One term, and it does more for a beach than detail.
    sandMat.roughnessNode = mix(float(0.95), float(0.22), wet);
  }
  const sandGeo = new THREE.PlaneGeometry(W * 4, LEN, 24, 90);
  sandGeo.rotateX(-Math.PI / 2);
  sandGeo.translate(0, 0, -LEN / 2);
  {
    // Shelve the sand downward into the water, with a slight cross-slope so
    // the waterline is a curve rather than a ruled edge.
    const pos = sandGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const into = Math.max(0, (-z - 4) / 26);          // 0 at the dune, 1 offshore
      const shelf = -1.9 * into * into;
      const ripple = Math.sin(x * 0.42) * 0.16 * (1 - into);
      pos.setY(i, shelf + ripple + 0.35 * Math.max(0, 1 - (-z) / 6));
    }
    pos.needsUpdate = true;
    sandGeo.computeVertexNormals();
  }
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.receiveShadow = true;
  group.add(sand);
  disposables.push(sandGeo, sandMat);

  // Marram grass on the dry dunes so the beach has a near edge.
  const uniforms = createFoliageUniforms();
  const grassMat = createFoliageMaterial(uniforms, SUMMER_PALETTE);
  disposables.push(grassMat);
  const tufts: THREE.BufferGeometry[] = [];
  const xf = new THREE.Matrix4();
  poissonScatter(90, { minX: -16, maxX: 16, minZ: -13, maxZ: -1 }, 0.85, 4).forEach((p, i) => {
    if (Math.abs(p.x) < 2) return;
    const g = createGrassTuft(70 + i, 1.0 + hash11(i) * 0.9);
    xf.makeRotationY(hash11(i * 3) * 6.28);
    xf.setPosition(p.x, 0, p.y);
    g.applyMatrix4(xf);
    tufts.push(g);
  });
  if (tufts.length) {
    const merged = mergeGeometries(tufts);
    tufts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, grassMat);
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(merged);
  }

  return {
    group,
    length: LEN,
    foliage: uniforms,
    title: 'Gerstner shoreline with reachable foam',
    skill: 'threejs-webgpu-water',
    update(elapsed) {
      (time as unknown as { value: number }).value = elapsed;
      (uniforms.time as unknown as { value: number }).value = elapsed;
    },
    dispose() { disposables.forEach((d) => d.dispose()); group.clear(); },
  };
}

/* ================================================================== */
/* 5. WEATHER AND SEASONS                                              */
/* ================================================================== */

/**
 * Four bays. Walking the corridor takes you through spring, summer, autumn and
 * winter, and each bay runs its own weather: clear, rain, storm, snow. The same
 * tree geometry is in all four — only the palette, the precipitation and the
 * light change, which is exactly the contract a cross-arena weather system
 * needs. Winter's trees are BARE: the canopy is dropped, not recoloured.
 */
export function createWeatherCorridor(seed = 21): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 56;
  const BAY = LEN / 4;

  const time = uniform(0);
  const uniforms = createFoliageUniforms();
  const barkMat = createBarkMaterial();
  const floorMat = new MeshStandardNodeMaterial();
  floorMat.roughness = 0.95;
  {
    const z = positionWorld.z;
    // Ground changes with the season band: green -> ochre -> snow.
    const spring = rgb(0x4a6a34);
    const summer = rgb(0x55632c);
    const autumnG = rgb(0x6a5330);
    const winterG = rgb(0xdfe6ea);
    const a = smoothstep(float(-BAY), float(-BAY * 1.4), z);
    const b = smoothstep(float(-BAY * 2), float(-BAY * 2.4), z);
    const c = smoothstep(float(-BAY * 3), float(-BAY * 3.4), z);
    floorMat.colorNode = mix(mix(mix(spring, summer, a), autumnG, b), winterG, c);
  }
  disposables.push(barkMat, floorMat);

  const floorGeo = new THREE.PlaneGeometry(W + 6, LEN, 12, 56);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0.03, -LEN / 2);   // clear of the hub plane at y=0
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  const SEASONS = [
    { palette: SPRING_PALETTE, bare: false, dead: 0.04 },
    { palette: SUMMER_PALETTE, bare: false, dead: 0.08 },
    { palette: AUTUMN_PALETTE, bare: false, dead: 0.62 },
    { palette: WINTER_PALETTE, bare: true, dead: 1.0 },
  ];

  const woodBatch: THREE.BufferGeometry[] = [];
  const xf = new THREE.Matrix4();

  SEASONS.forEach((season, s) => {
    const mat = createFoliageMaterial(uniforms, season.palette);
    disposables.push(mat);
    const leaves: THREE.BufferGeometry[] = [];
    const z0 = -s * BAY;
    const z1 = -(s + 1) * BAY;

    poissonScatter(10, { minX: -10, maxX: 10, minZ: z1 + 1, maxZ: z0 - 1 }, 2.6, seed + s * 7)
      .forEach((p, i) => {
        if (Math.abs(p.x) < 2.1) return;
        const parts = createTree({
          seed: seed * 30 + s * 13 + i,
          height: 5 + hash11(seed + s + i) * 5,
          trunkRadius: 0.14 + hash11(seed * 2 + i) * 0.14,
          depth: 3, leavesPerClump: 11,
          deadFraction: season.dead, bare: season.bare,
        });
        xf.makeTranslation(p.x, 0, p.y);
        parts.wood.applyMatrix4(xf);
        woodBatch.push(parts.wood);
        if (!season.bare) { parts.foliage.applyMatrix4(xf); leaves.push(parts.foliage); }
        else parts.foliage.dispose();
        parts.litter.applyMatrix4(xf);
        leaves.push(parts.litter);
      });

    if (leaves.length) {
      const merged = mergeGeometries(leaves);
      leaves.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      group.add(mesh);
      disposables.push(merged);
    }
  });

  const woodMerged = mergeGeometries(woodBatch);
  woodBatch.forEach((g) => g.dispose());
  const woodMesh = new THREE.Mesh(woodMerged, barkMat);
  woodMesh.castShadow = true;
  group.add(woodMesh);
  disposables.push(woodMerged);

  /* --- precipitation ---------------------------------------------------
   * One points cloud spanning the corridor. Each particle knows which bay it
   * is in from its own X/Z, so rain falls in bay 2, storm-rain in bay 3 and
   * snow in bay 4 from a SINGLE draw call and a single buffer. Falling speed,
   * size and drift are all derived from that same bay index — which is the
   * pattern the real system wants: weather is a field over the world, not a
   * separate emitter per condition.
   */
  const COUNT = 4200;
  const pos = new Float32Array(COUNT * 3);
  const seedAttr = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const h0 = hash11(i * 1.37);
    const h1 = hash11(i * 3.71 + 11);
    const h2 = hash11(i * 7.13 + 29);
    pos[i * 3] = (h0 - 0.5) * (W + 8);
    pos[i * 3 + 1] = h1 * 12;
    // Bias particles into the wet bays: none in spring, all three others busy.
    pos[i * 3 + 2] = -(BAY + h2 * BAY * 3);
    seedAttr[i] = h0 * 97 + h1 * 31;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rainGeo.setAttribute('aSeed', new THREE.BufferAttribute(seedAttr, 1));

  const rainMat = new PointsNodeMaterial();
  rainMat.transparent = true;
  rainMat.depthWrite = false;
  rainMat.sizeAttenuation = true;

  // Fall, drift and respawn entirely in the vertex graph — no CPU per-particle
  // work, one draw call for all four weather states.
  {
    const p = positionLocal;
    const s = attribute('aSeed', 'float');
    const t = time;

    // Which bay is this particle in? 1 = rain, 2 = storm, 3 = snow.
    const bay = clamp(p.z.negate().div(float(BAY)).floor(), float(0), float(3));
    const isSnow = smoothstep(float(2.5), float(2.9), bay);      // bay 3
    const isStorm = smoothstep(float(1.5), float(1.9), bay);     // bay 2+

    // Snow falls slowly and wanders; rain falls fast and straight; storm rain
    // falls faster still and slants.
    const speed = mix(mix(float(9.5), float(15.0), isStorm), float(1.5), isSnow);
    // Wrap without a chained .mod(): x - floor(x/13)*13 is the floored form,
    // which is what we want and is expressible with operators that exist.
    const raw = t.mul(speed).add(s);
    const fall = raw.sub(raw.div(float(13.0)).floor().mul(float(13.0)));
    const y = float(13.0).sub(fall);

    const wander = sin(t.mul(0.8).add(s)).mul(isSnow.mul(0.55))
      .add(sin(t.mul(2.3).add(s.mul(1.7))).mul(isSnow.mul(0.3)));
    const slant = isStorm.mul(float(2.2)).mul(float(1).sub(y.div(13.0)));

    rainMat.positionNode = vec3(p.x.add(wander).add(slant), y, p.z.add(wander.mul(0.6)));

    // Colour, opacity and size all key off the SAME bay index, so one buffer
    // and one draw call carry rain, storm rain and snow.
    const inWeather = smoothstep(float(0.5), float(0.9), bay);
    rainMat.colorNode = vec4(mix(rgb(0x9fc4d8), rgb(0xf4f8fb), isSnow), inWeather);
    rainMat.sizeNode = mix(float(2.4), float(6.5), isSnow);
  }

  const rain = new THREE.Points(rainGeo, rainMat);
  rain.frustumCulled = false;
  group.add(rain);
  disposables.push(rainGeo, rainMat);

  // Lightning: one flash light over the storm bay, on an irregular schedule so
  // it never feels metronomic. Zero intensity most of the time costs nothing.
  const flash = new THREE.PointLight(0xdce8ff, 0, 60, 1.4);
  flash.position.set(0, 14, -BAY * 2.5);
  group.add(flash);

  return {
    group,
    length: LEN,
    foliage: uniforms,
    title: 'Seasons and weather, one seeded field',
    skill: 'atomic-acres-procedural-art-authoring',
    update(elapsed) {
      (time as unknown as { value: number }).value = elapsed;
      (uniforms.time as unknown as { value: number }).value = elapsed;
      // Two incommensurate periods so strikes never settle into a rhythm.
      const a = Math.sin(elapsed * 0.37);
      const b = Math.sin(elapsed * 1.31 + 2.1);
      const strike = Math.max(0, a * b - 0.86) * 7;
      flash.intensity = strike * 140;
    },
    dispose() { disposables.forEach((d) => d.dispose()); group.clear(); },
  };
}

/* ================================================================== */
/* 6. VOLUMETRIC LIGHT                                                 */
/* ================================================================== */

/**
 * God rays as a real volumetric march.
 *
 * The shipped game fakes these with seven hand-placed additive quads at 0.02
 * opacity that have no relationship to the geometry occluding the sun, which
 * is why they never quite sit in the scene. This marches a height-fogged
 * medium against an analytic slotted occluder, so the shafts are produced BY
 * the geometry rather than placed near it, and they move correctly as you walk
 * through them.
 */
export function createVolumeCorridor(): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 40;

  const time = uniform(0);

  const stoneMat = new MeshStandardNodeMaterial();
  stoneMat.roughness = 0.9;
  stoneMat.colorNode = rgb(0x2b2b2e);
  const floorGeo = new THREE.PlaneGeometry(W, LEN, 4, 4);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0.03, -LEN / 2);   // clear of the hub plane at y=0
  const floor = new THREE.Mesh(floorGeo, stoneMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo, stoneMat);

  // Colonnade: the occluder that CUTS the shafts. Real geometry, so it also
  // casts real shadows and the two agree.
  const colMat = new MeshStandardNodeMaterial();
  colMat.roughness = 0.85;
  colMat.colorNode = rgb(0x3a3a3f);
  const cols: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    for (const side of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.34, 0.4, 7.5, 8);
      g.translate(side * (W / 2 - 0.7), 3.75, -2 - i * 2.7);
      cols.push(g);
    }
  }
  const colGeo = mergeSimple(cols);
  cols.forEach((g) => g.dispose());
  const colMesh = new THREE.Mesh(colGeo, colMat);
  colMesh.castShadow = true;
  colMesh.receiveShadow = true;
  group.add(colMesh);
  disposables.push(colGeo, colMat);

  // The volumetric medium: a big box the player walks through, marched in the
  // fragment. Additive, depth-write off, so it never occludes anything.
  const volMat = new MeshStandardNodeMaterial();
  volMat.transparent = true;
  volMat.depthWrite = false;
  volMat.side = THREE.BackSide;
  volMat.blending = THREE.AdditiveBlending;

  const STEPS = 24;
  volMat.colorNode = Fn(() => {
    const ro = cameraPosition;
    const rd = normalize(positionWorld.sub(cameraPosition));
    const acc = float(0).toVar();
    const t = float(0.4).toVar();

    Loop(STEPS, () => {
      const p = ro.add(rd.mul(t));
      // Height fog: dense low, thin high.
      const density = exp(p.y.mul(-0.24)).mul(0.09);
      // The slot pattern is the SAME function the colonnade is built from, so
      // the shafts land between the columns rather than near them.
      const slot = smoothstep(float(0.35), float(0.95),
        abs(sin(p.z.mul(Math.PI / 2.7))));
      // Fade the shaft with distance from the light plane above.
      const reach = clamp(float(1).sub(p.y.div(9.0)), float(0), float(1));
      acc.addAssign(density.mul(slot).mul(reach));
      t.addAssign(0.85);
    });

    const tint = rgb(0xffe6b8);
    return tint.mul(clamp(acc, float(0), float(1.4)));
  })();

  const volGeo = new THREE.BoxGeometry(W, 10, LEN);
  volGeo.translate(0, 5, -LEN / 2);
  const vol = new THREE.Mesh(volGeo, volMat);
  vol.frustumCulled = false;
  vol.renderOrder = 5;
  group.add(vol);
  disposables.push(volGeo, volMat);

  return {
    group,
    length: LEN,
    title: 'Volumetric shafts cut by real geometry',
    skill: 'webgpu-tsl-arena-forging',
    update(elapsed) { (time as unknown as { value: number }).value = elapsed; },
    dispose() { disposables.forEach((d) => d.dispose()); group.clear(); },
  };
}

function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = []; const nor: number[] = []; const uvs: number[] = [];
  const idx: number[] = []; let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position'); const n = g.getAttribute('normal');
    const u = g.getAttribute('uv');
    for (let i = 0; i < p.count * 3; i++) pos.push(p.array[i] as number);
    for (let i = 0; i < p.count * 3; i++) nor.push(n ? (n.array[i] as number) : 0);
    for (let i = 0; i < p.count * 2; i++) uvs.push(u ? (u.array[i] as number) : 0);
    const gi = g.getIndex();
    if (gi) for (let i = 0; i < gi.count; i++) idx.push((gi.array[i] as number) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.setIndex(idx);
  return out;
}
