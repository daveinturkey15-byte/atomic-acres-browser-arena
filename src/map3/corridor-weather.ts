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
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

const {
  abs, attribute, cameraPosition, clamp, cross, float, mix,
  normalize, positionLocal, sin, smoothstep, uniform, uv, vec2,
  vec3, vec4,
} = TSL as unknown as Record<string, any>;

import type { Corridor } from './corridors';
import { createTree, poissonScatter } from './plants';
import { mergeGeometries, hash11 } from './leaf-geometry';
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
      mesh.receiveShadow = true;
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

  /* ---------------------------------------------------------------- */
  /* 3. Precipitation: Heavy Rain, Downpour & Blizzard                 */
  /* ---------------------------------------------------------------- */

  const COUNT = 7500; // Dense precipitation particle field
  const seedAttr = new Float32Array(COUNT);
  const originAttr = new Float32Array(COUNT * 3);

  for (let i = 0; i < COUNT; i++) {
    const h0 = hash11(i * 1.37);
    const h1 = hash11(i * 3.71 + 11);
    const h2 = hash11(i * 7.13 + 29);

    originAttr[i * 3] = (h0 - 0.5) * (W + 8);
    originAttr[i * 3 + 1] = h1 * 14;

    // Distribute across the weather bays with bias toward heavy downpour in Bay 2 (Autumn/Storm)
    let zSample: number;
    if (h2 < 0.55) {
      // 55% of all rain falls directly in Bay 2 (Storm)
      zSample = -(BAY * 1.5 + (hash11(i * 9.17) - 0.5) * BAY * 1.6);
    } else if (h2 < 0.80) {
      // 25% in Bay 3 (Winter blizzard)
      zSample = -(BAY * 3.0 + (hash11(i * 9.17) - 0.5) * BAY * 1.0);
    } else {
      // 20% in Bay 1 (Summer passing shower)
      zSample = -(BAY * 1.0 + (hash11(i * 9.17) - 0.5) * BAY * 1.0);
    }
    originAttr[i * 3 + 2] = zSample;
    seedAttr[i] = h0 * 97 + h1 * 31;
  }

  const rainGeo = new THREE.InstancedBufferGeometry();
  const quad = new Float32Array([
    -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0,
    -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0,
  ]);
  const quadUv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  rainGeo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
  rainGeo.setAttribute('uv', new THREE.BufferAttribute(quadUv, 2));
  rainGeo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(originAttr, 3));
  rainGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedAttr, 1));
  rainGeo.instanceCount = COUNT;
  rainGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 7, -LEN / 2), LEN);

  const rainMat = new MeshBasicNodeMaterial();
  rainMat.transparent = true;
  rainMat.depthWrite = false;
  rainMat.side = THREE.DoubleSide;
  rainMat.fog = false;

  {
    const o = attribute('aOrigin', 'vec3');
    const s = attribute('aSeed', 'float');
    const t = time;

    // Bay index from local Z
    const bay = clamp(o.z.negate().div(float(BAY)), float(0.0), float(4.0));
    const isSnow = smoothstep(float(2.7), float(3.2), bay);
    const isStorm = smoothstep(float(1.3), float(1.8), bay)
      .mul(float(1.0).sub(smoothstep(float(2.6), float(3.0), bay)));

    // Fall speeds: blizzard drifts slowly, normal rain falls fast, torrential storm slams down at 22 m/s
    const speed = mix(mix(float(11.0), float(22.0), isStorm), float(1.8), isSnow);

    const raw = t.mul(speed).add(s);
    const fall = raw.sub(raw.div(float(14.0)).floor().mul(float(14.0)));
    const y = float(14.0).sub(fall);

    // Wind turbulence & storm slant
    const windGust = sin(t.mul(1.6).add(o.z.mul(0.2))).mul(0.5).add(0.5);
    const stormSlant = isStorm.mul(float(3.6).add(windGust.mul(1.8))).mul(float(1.0).sub(y.div(14.0)));
    const snowWander = sin(t.mul(0.9).add(s)).mul(isSnow.mul(0.65));

    const centre = vec3(o.x.add(snowWander).add(stormSlant), y, o.z.add(snowWander.mul(0.5)));

    // Billboarding in world space
    const toCam = normalize(cameraPosition.sub(centre));
    const right = normalize(cross(vec3(0, 1, 0), toCam));
    const up = cross(toCam, right);

    // Streak dimensions: storm downpour streaks are long and thick
    const wide = mix(mix(float(0.012), float(0.018), isStorm), float(0.055), isSnow);
    const tall = mix(mix(float(0.38), float(0.68), isStorm), float(0.055), isSnow);

    rainMat.positionNode = centre
      .add(right.mul(positionLocal.x.mul(wide)))
      .add(up.mul(positionLocal.y.mul(tall)));

    // Particle shaping
    const d = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const round = float(1.0).sub(smoothstep(float(0.32), float(1.0), d));
    const streak = float(1.0).sub(smoothstep(float(0.15), float(1.0), abs(uv().x.sub(0.5)).mul(2.0)));
    const shape = mix(streak, round, isSnow);

    const inWeather = smoothstep(float(0.4), float(0.8), bay);
    const flashBoost = flashUniform.mul(isStorm).mul(0.8);

    const baseTint = mix(rgb(0xaad0e4), rgb(0xf2f6f9), isSnow);
    const finalTint = mix(baseTint, rgb(0xffffff), flashBoost);

    rainMat.colorNode = vec4(
      finalTint,
      shape.mul(inWeather).mul(mix(mix(float(0.45), float(0.85), isStorm), float(0.92), isSnow)),
    );
  }

  const rain = new THREE.Mesh(rainGeo, rainMat);
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

  for (let i = 0; i < SPLASH_COUNT; i++) {
    const h0 = hash11(i * 2.31 + 5);
    const h1 = hash11(i * 5.17 + 17);
    splashPosAttr[i * 3] = (h0 - 0.5) * (W + 2);
    splashPosAttr[i * 3 + 1] = 0.05; // Just above ground
    splashPosAttr[i * 3 + 2] = -(BAY * 1.2 + h1 * BAY * 1.4); // Centered in storm bay
    splashSeedAttr[i] = hash11(i * 13.7) * 100.0;
  }

  const splashRingGeo = new THREE.InstancedBufferGeometry();
  const ringQuad = new Float32Array([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5,
    -0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5,
  ]);
  const ringUv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  splashRingGeo.setAttribute('position', new THREE.BufferAttribute(ringQuad, 3));
  splashRingGeo.setAttribute('uv', new THREE.BufferAttribute(ringUv, 2));
  splashRingGeo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(splashPosAttr, 3));
  splashRingGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(splashSeedAttr, 1));
  splashRingGeo.instanceCount = SPLASH_COUNT;
  splashRingGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -BAY * 2), BAY);

  const splashRingMat = new MeshBasicNodeMaterial();
  splashRingMat.transparent = true;
  splashRingMat.depthWrite = false;
  splashRingMat.side = THREE.DoubleSide;
  splashRingMat.fog = false;

  {
    const c = attribute('aCenter', 'vec3');
    const s = attribute('aSeed', 'float');
    const t = time;

    // Expanding cyclic animation: 0 -> 1 over 0.28s. A raindrop ring on
    // ground is a hand's width at most; 0.45 m read as hoops on the grass
    // (polish pass, Lane P), so the quad now grows to 0.16 m.
    const progress = t.mul(3.6).add(s).sub(t.mul(3.6).add(s).floor());
    const radius = progress.mul(0.16);

    splashRingMat.positionNode = c.add(positionLocal.mul(radius));

    // Ring shape (thin expanding circular ripple)
    const dist = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const ring = smoothstep(float(0.5), float(0.85), dist)
      .mul(float(1.0).sub(smoothstep(float(0.88), float(1.0), dist)));
    const alpha = float(1.0).sub(progress).mul(0.7);

    splashRingMat.colorNode = vec4(rgb(0xd2e8f4), ring.mul(alpha));
  }

  const splashRings = new THREE.Mesh(splashRingGeo, splashRingMat);
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
    title: 'Seasons & weather with torrential downpour & ground splashes',
    skill: 'atomic-acres-procedural-art-authoring',
    update(elapsed) {
      (time as unknown as { value: number }).value = elapsed;
      (uniforms.time as unknown as { value: number }).value = elapsed;

      // Double-sine lightning trigger
      const a = Math.sin(elapsed * 0.37);
      const b = Math.sin(elapsed * 1.31 + 2.1);
      const strike = Math.max(0, a * b - 0.86) * 7;
      flash.intensity = strike * 160;
      (flashUniform as unknown as { value: number }).value = strike > 0.05 ? 1.0 : 0.0;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
