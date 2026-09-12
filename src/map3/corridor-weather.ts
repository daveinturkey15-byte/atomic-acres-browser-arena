/**
 * map3/corridor-weather.ts — corridor 5: SEASONS, WEATHER & TORRENTIAL STORMS.
 *
 * Four seasonal bays down the corridor length:
 *   1. SPRING — clear, blossoming green floor, light ambient breeze.
 *   2. SUMMER — lush canopy, golden hour lighting, dry ground.
 *   3. AUTUMN / TORRENTIAL STORM — heavy gale-force downpour, dense rain curtains,
 *      turbulent wind slant, ground splash rings & mist, and lightning flashes.
 *   4. WINTER — bare winter trees, blizzard snow drift, and frosty ground.
 *
 * Precipitation is implemented with high-efficiency instanced billboard quads
 * sized in world-space metres for strict WebGPU hardware compliance.
 *
 * Repo contract: three/webgpu NodeMaterials with TSL expressions only.
 * No ShaderMaterial, no RawShaderMaterial, no onBeforeCompile.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

const {
  float, mix, positionLocal, sin, smoothstep, uniform,
} = TSL as unknown as Record<string, any>;

import type { Corridor } from './corridors';
import { createTree, poissonScatter } from './plants';
import { mergeGeometries } from './leaf-geometry';
import {
  createBayPrecipitationMaterial, createPrecipQuad, createSplashMaterial,
  createSplashQuad, driveMap3Lightning, fillBayPrecipitation, fillSplashCentres,
  m3hash11 as hash11,
} from './weather-system';
// MAP3 (HF-409): the solids this corridor publishes for an arena to collide.
import { uprightSolid, type CorridorSolid } from './corridor-solids';
import {
  AUTUMN_PALETTE, SPRING_PALETTE, SUMMER_PALETTE, WINTER_PALETTE,
  createBarkMaterial, createFoliageMaterial, createFoliageUniforms, rgb,
} from './foliage-material';

const W = 9;
const CORRIDOR_LEN = 56;
const BAY = CORRIDOR_LEN / 4; // 14m per seasonal bay

export function createWeatherCorridor(seed = 21): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = CORRIDOR_LEN;

  const time = uniform(0);
  const flashUniform = uniform(0);
  const uniforms = createFoliageUniforms();
  const barkMat = createBarkMaterial();

  /* ---------------------------------------------------------------- */
  /* 1. Ground Floor with Seasonal Transitions & Wet Puddles          */
  /* ---------------------------------------------------------------- */

  const floorMat = new MeshStandardNodeMaterial();
  floorMat.roughness = 0.95;
  {
    const z = positionLocal.z;
    const spring = rgb(0x4a6a34);
    const summer = rgb(0x55632c);
    const autumnG = rgb(0x523d24); // Muddy autumn earth
    const winterG = rgb(0xe2e9ee); // Snow-covered frost

    const a = smoothstep(float(-BAY * 0.8), float(-BAY * 1.3), z);
    const b = smoothstep(float(-BAY * 1.8), float(-BAY * 2.3), z);
    const c = smoothstep(float(-BAY * 2.8), float(-BAY * 3.3), z);

    const baseColor = mix(mix(mix(spring, summer, a), autumnG, b), winterG, c);

    // Wet mud & puddles in the autumn storm bay (z between -14 and -28)
    const inStorm = smoothstep(float(-BAY * 0.9), float(-BAY * 1.4), z)
      .mul(float(1.0).sub(smoothstep(float(-BAY * 2.7), float(-BAY * 3.1), z)));

    const puddleMask = sin(positionLocal.x.mul(2.3)).mul(sin(z.mul(1.9))).mul(0.5).add(0.5);
    const puddleWet = inStorm.mul(smoothstep(float(0.45), float(0.85), puddleMask));

    floorMat.colorNode = mix(baseColor, rgb(0x241a12), puddleWet.mul(0.65));
    // Puddles are mirror-reflective glossy
    floorMat.roughnessNode = mix(float(0.92), float(0.12), puddleWet);
  }
  disposables.push(barkMat, floorMat);

  const floorGeo = new THREE.PlaneGeometry(W + 6, LEN, 14, 56);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0.03, -LEN / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  // MAP3 (HF-409): named at creation - the parity rules read these names.
  floor.name = 'map3-seasons-ground';
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  /* ---------------------------------------------------------------- */
  /* 2. Seasonal Trees & Foliage                                       */
  /* ---------------------------------------------------------------- */

  const SEASONS = [
    { palette: SPRING_PALETTE, bare: false, dead: 0.04 },
    { palette: SUMMER_PALETTE, bare: false, dead: 0.08 },
    { palette: AUTUMN_PALETTE, bare: false, dead: 0.75 }, // Autumn wind-stripped foliage
    { palette: WINTER_PALETTE, bare: true, dead: 1.0 },   // Bare winter branches
  ];

  const woodBatch: THREE.BufferGeometry[] = [];
  const xf = new THREE.Matrix4();
  // MAP3 (HF-409): all three seasons' trunks end up in ONE merged wood mesh
  // 51 m long, so the scatter is the only place a trunk is individually known.
  const solids: CorridorSolid[] = [];

  SEASONS.forEach((season, s) => {
    const mat = createFoliageMaterial(uniforms, season.palette);
    disposables.push(mat);
    const leaves: THREE.BufferGeometry[] = [];
    const z0 = -s * BAY;
    const z1 = -(s + 1) * BAY;

    poissonScatter(11, { minX: -10, maxX: 10, minZ: z1 + 1, maxZ: z0 - 1 }, 2.5, seed + s * 7)
      .forEach((p, i) => {
        if (Math.abs(p.x) < 2.2) return; // walkway
        const parts = createTree({
          seed: seed * 30 + s * 13 + i,
          height: 5 + hash11(seed + s + i) * 5,
          trunkRadius: 0.14 + hash11(seed * 2 + i) * 0.14,
          depth: 3, leavesPerClump: 11,
          deadFraction: season.dead, bare: season.bare,
        });
        solids.push(uprightSolid('trunk', p.x, p.y, 0.14 + hash11(seed * 2 + i) * 0.14, 5 + hash11(seed + s + i) * 5, 'wood'));
        xf.makeTranslation(p.x, 0, p.y);
        parts.wood.applyMatrix4(xf);
        woodBatch.push(parts.wood);
        if (!season.bare) {
          parts.foliage.applyMatrix4(xf);
          leaves.push(parts.foliage);
        } else {
          parts.foliage.dispose();
        }
        parts.litter.applyMatrix4(xf);
        leaves.push(parts.litter);
      });

    if (leaves.length) {
      const merged = mergeGeometries(leaves);
      leaves.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.name = `map3-seasons-canopy-leaves-${s}`;
      mesh.receiveShadow = true;
      group.add(mesh);
      disposables.push(merged);
    }
  });

  const woodMerged = mergeGeometries(woodBatch);
  woodBatch.forEach((g) => g.dispose());
  const woodMesh = new THREE.Mesh(woodMerged, barkMat);
  woodMesh.name = 'map3-seasons-trunk-batch';
  woodMesh.castShadow = true;
  group.add(woodMesh);
  disposables.push(woodMerged);

  /* ---------------------------------------------------------------- */
  const COUNT = 7500; // Dense precipitation particle field
  const seedAttr = new Float32Array(COUNT);
  const originAttr = new Float32Array(COUNT * 3);

  // M3.WEATHER.1a: distribution fill lives in weather-system.ts (bay-biased:
  // 55% storm bay, 25% winter, 20% summer shower) — same numbers as before.
  fillBayPrecipitation(originAttr, seedAttr, COUNT, W + 8, BAY);

  const rainGeo = new THREE.InstancedBufferGeometry();
  const precipQuad = createPrecipQuad();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(precipQuad.positions, 3));
  rainGeo.setAttribute('uv', new THREE.BufferAttribute(precipQuad.uvs, 2));
  rainGeo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(originAttr, 3));
  rainGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr, 1));
  rainGeo.instanceCount = COUNT;
  rainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 7, -LEN / 2), LEN);

  // M3.WEATHER.1a: the bay-indexed precipitation graph now lives in
  // weather-system.ts and is consumed here — same maths, same look.
  const rainMat = createBayPrecipitationMaterial(time, flashUniform, BAY);

  const rain = new THREE.Mesh(rainGeo, rainMat);
  rain.name = 'map3-seasons-precipitation-particles';
  rain.frustumCulled = false;
  rain.renderOrder = 6;
  group.add(rain);
  disposables.push(rainGeo, rainMat);

  /* ---------------------------------------------------------------- */
  /* 4. Ground Rain Splashes & Ripple Rings in Storm Bay              */
  /* ---------------------------------------------------------------- */

  const SPLASH_COUNT = 450;
  const splashPosAttr = new Float32Array(SPLASH_COUNT * 3);
  const splashSeedAttr = new Float32Array(SPLASH_COUNT);

  // M3.WEATHER.1a: identical centres — z = -(BAY*1.2 + h1*BAY*1.4) rewritten
  // as cz + (h1-0.5)*dM with dM = BAY*1.4 and cz = -BAY*1.9.
  fillSplashCentres(splashPosAttr, splashSeedAttr, SPLASH_COUNT, 0, -BAY * 1.9, W + 2, BAY * 1.4);

  const splashRingGeo = new THREE.InstancedBufferGeometry();
  const splashQuad = createSplashQuad();
  splashRingGeo.setAttribute('position', new THREE.BufferAttribute(splashQuad.positions, 3));
  splashRingGeo.setAttribute('uv', new THREE.BufferAttribute(splashQuad.uvs, 2));
  splashRingGeo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(splashPosAttr, 3));
  splashRingGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(splashSeedAttr, 1));
  splashRingGeo.instanceCount = SPLASH_COUNT;
  splashRingGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -BAY * 2), BAY);

  // M3.WEATHER.1a: the ripple-ring graph lives in weather-system.ts now.
  const splashRingMat = createSplashMaterial(time);

  const splashRings = new THREE.Mesh(splashRingGeo, splashRingMat);
  splashRings.name = 'map3-seasons-splash-rings';
  splashRings.frustumCulled = false;
  splashRings.renderOrder = 6;
  group.add(splashRings);
  disposables.push(splashRingGeo, splashRingMat);

  /* ---------------------------------------------------------------- */
  /* 5. Lightning Point Light                                          */
  /* ---------------------------------------------------------------- */

  const flash = new THREE.PointLight(0xdce8ff, 0, 70, 1.4);
  flash.position.set(0, 14, -BAY * 2.1);
  group.add(flash);

  return {
    group,
    length: LEN,
    foliage: uniforms,
    solids,
    title: 'Seasons & weather with torrential downpour & ground splashes',
    skill: 'atomic-acres-procedural-art-authoring',
    update(elapsed) {
      (time as unknown as { value: number }).value = elapsed;
      (uniforms.time as unknown as { value: number }).value = elapsed;

      // M3.WEATHER.1a: double-sine trigger lives in weather-system.ts now.
      // Named cast: TSL uniform() nodes carry .value without a static type.
      const flashLevel: { value: number } = flashUniform;
      driveMap3Lightning(elapsed, flash, flashLevel, true);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
