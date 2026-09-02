/**
 * map3/corridor-volume.ts — corridor 6: VOLUMETRIC LIGHT SHAFTS (GOD RAYS).
 *
 * Distinct, crisp volumetric shafts of sunlight cutting through a ruined
 * stone colonnade with overhead clerestory roof trusses:
 *   1. LOCAL-SPACE RAYMARCH — uses the corridor's inverse world matrix so the
 *      raymarch is exact regardless of the corridor's orientation around the hub.
 *   2. BACK-PROJECTED SUN RAY APERTURE TEST — each sample point projects
 *      backward along the local sun vector to the roof plane (y = 7.5 m) and
 *      tests against the architectural skylight openings and column shadows.
 *   3. HIGH CONTRAST & DUST TURBULENCE — sharp beam edges (zero in shadow,
 *      bright in beam) with shimmering airborne dust motes.
 *
 * Repo contract: three/webgpu NodeMaterials with TSL expressions only.
 * No ShaderMaterial, no RawShaderMaterial, no onBeforeCompile.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

const {
  Fn, Loop, abs, cameraPosition, clamp, cos, exp, float, fract, length, max, min,
  mix, normalize, positionWorld, sin, smoothstep, sqrt, uniform, vec4,
} = TSL as unknown as Record<string, any>;

import type { Corridor } from './corridors';
import { rgb } from './foliage-material';

const W = 9;
const CORRIDOR_LEN = 44;
const ROOF_Y = 7.2;
const BAY_SPACING = 2.8;

function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  let off = 0;
  for (const g of list) {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
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

export function createVolumeCorridor(): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = CORRIDOR_LEN;

  const time = uniform(0);
  const invWorld = uniform(new THREE.Matrix4());
  const sunLocal = uniform(new THREE.Vector3(0.5, 0.7, 0.5));

  /* ---------------------------------------------------------------- */
  /* 1. Stone Floor & Sunlight Patches                                */
  /* ---------------------------------------------------------------- */

  const stoneMat = new MeshStandardNodeMaterial();
  stoneMat.roughness = 0.85;

  // Compute sunlight patches on the floor where beams hit y = 0
  const floorColor = Fn(() => {
    const p = positionWorld.xyz;
    const pLocal = invWorld.mul(vec4(p, 1.0)).xyz;
    const S = normalize(sunLocal);

    // Project from floor (y = 0) up along sun vector to roof (y = ROOF_Y)
    const tRoof = float(ROOF_Y).div(max(S.y, float(0.1)));
    const pRoofX = pLocal.x.add(S.x.mul(tRoof));
    const pRoofZ = pLocal.z.add(S.z.mul(tRoof));

    const zRel = pRoofZ.add(2.0).div(float(BAY_SPACING));
    const slotFrac = abs(fract(zRel.add(0.5)).sub(0.5));
    const inSlotZ = smoothstep(float(0.12), float(0.22), slotFrac);
    const inSlotX = smoothstep(float(W / 2 - 0.6), float(W / 2 - 1.2), abs(pRoofX));
    const sunPatch = inSlotZ.mul(inSlotX)
      .mul(smoothstep(float(-LEN - 1.0), float(-LEN + 2.0), pLocal.z))
      .mul(smoothstep(float(1.0), float(-1.0), pLocal.z));

    const baseStone = rgb(0x323235);
    const litStone = rgb(0x9a8868); // Warm sunlit stone patch
    return mix(baseStone, litStone, sunPatch.mul(0.92));
  })();

  stoneMat.colorNode = floorColor;
  disposables.push(stoneMat);

  const floorGeo = new THREE.PlaneGeometry(W, LEN, 16, 48);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0.04, -LEN / 2);
  const floor = new THREE.Mesh(floorGeo, stoneMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  /* ---------------------------------------------------------------- */
  /* 2. Colonnade & Roof Trusses (Real Shadow-Casting Geometry)         */
  /* ---------------------------------------------------------------- */

  const colMat = new MeshStandardNodeMaterial();
  colMat.roughness = 0.82;
  colMat.colorNode = rgb(0x45454b);
  disposables.push(colMat);

  const colParts: THREE.BufferGeometry[] = [];
  const numColumns = 14;

  for (let i = 0; i < numColumns; i++) {
    const z = -2.0 - i * BAY_SPACING;
    for (const side of [-1, 1]) {
      const x = side * (W / 2 - 0.75);

      // Fluted column shaft
      const col = new THREE.CylinderGeometry(0.32, 0.38, ROOF_Y, 10);
      col.translate(x, ROOF_Y / 2, z);
      colParts.push(col);

      // Base plinth
      const plinth = new THREE.BoxGeometry(0.95, 0.45, 0.95);
      plinth.translate(x, 0.22, z);
      colParts.push(plinth);

      // Capital
      const cap = new THREE.BoxGeometry(0.90, 0.40, 0.90);
      cap.translate(x, ROOF_Y - 0.20, z);
      colParts.push(cap);
    }

    // Overhead transverse arch beam across corridor
    const archBeam = new THREE.BoxGeometry(W - 0.6, 0.45, 0.48);
    archBeam.translate(0, ROOF_Y + 0.15, z);
    colParts.push(archBeam);

    // Longitudinal architrave connecting adjacent columns
    if (i < numColumns - 1) {
      for (const side of [-1, 1]) {
        const x = side * (W / 2 - 0.75);
        const architrave = new THREE.BoxGeometry(0.65, 0.45, BAY_SPACING);
        architrave.translate(x, ROOF_Y + 0.15, z - BAY_SPACING / 2);
        colParts.push(architrave);
      }
    }
  }

  const colMerged = mergeSimple(colParts);
  colParts.forEach((g) => g.dispose());
  const colMesh = new THREE.Mesh(colMerged, colMat);
  colMesh.castShadow = true;
  colMesh.receiveShadow = true;
  group.add(colMesh);
  disposables.push(colMerged);

  /* ---------------------------------------------------------------- */
  /* 3. Volumetric Raymarcher with True Sun Back-Projection           */
  /* ---------------------------------------------------------------- */

  const volMat = new MeshBasicNodeMaterial();
  volMat.transparent = true;
  volMat.depthWrite = false;
  volMat.depthTest = false;
  volMat.side = THREE.BackSide;
  volMat.blending = THREE.AdditiveBlending;
  volMat.fog = false;

  const STEPS = 40;

  volMat.colorNode = Fn(() => {
    // Transform ray into local corridor coordinates
    const ro = invWorld.mul(vec4(cameraPosition, 1.0)).xyz.toVar();
    const exit = invWorld.mul(vec4(positionWorld, 1.0)).xyz;
    const seg = exit.sub(ro);
    const dist = min(length(seg), float(48.0));
    const rd = normalize(seg).toVar();
    const S = normalize(sunLocal).toVar();
    const stepLen = dist.div(float(STEPS));

    // Forward Mie scattering lobe for natural sun halo
    const cosTheta = clamp(rd.dot(S), float(-1.0), float(1.0));
    const g = float(0.55);
    const g2 = g.mul(g);
    const num = float(1.0).sub(g2);
    const denom = float(1.0).add(g2).sub(float(2.0).mul(g).mul(cosTheta));
    const mie = num.div(max(denom.mul(sqrt(denom)), float(0.01))).mul(0.40);
    const phase = float(0.25).add(mie);

    const acc = float(0.0).toVar();
    const t = stepLen.mul(0.5).toVar();

    Loop(STEPS, () => {
      const p = ro.add(rd.mul(t));

      // Inside corridor bounding volume test
      const inBounds = smoothstep(float(W / 2 + 0.4), float(W / 2 - 0.2), abs(p.x))
        .mul(smoothstep(float(-LEN - 1.0), float(-LEN + 0.6), p.z))
        .mul(smoothstep(float(1.0), float(-0.6), p.z))
        .mul(smoothstep(float(-0.1), float(0.3), p.y))
        .mul(smoothstep(float(ROOF_Y + 0.8), float(ROOF_Y - 0.2), p.y));

      // Atmospheric medium density with gentle ground concentration
      const dens = exp(p.y.mul(-0.16)).mul(0.030);

      // --- 1. BACK-PROJECT ALONG SUN RAY TO ROOF PLANE (y = ROOF_Y) ---
      const tRoof = float(ROOF_Y).sub(p.y).div(max(S.y, float(0.06)));
      const pRoofX = p.x.add(S.x.mul(tRoof));
      const pRoofZ = p.z.add(S.z.mul(tRoof));

      // Clerestory skylight opening between transverse roof beams
      const zRel = pRoofZ.add(2.0).div(float(BAY_SPACING));
      const slotFrac = abs(fract(zRel.add(0.5)).sub(0.5));
      // Crisp beam edges: 0 at solid beam, 1 in open gap
      const inRoofSlotZ = smoothstep(float(0.08), float(0.15), slotFrac);

      // Central opening between side architraves
      const inRoofSlotX = smoothstep(float(W / 2 - 0.7), float(W / 2 - 1.2), abs(pRoofX));
      const roofGate = inRoofSlotZ.mul(inRoofSlotX).mul(tRoof.greaterThan(float(0.0)).select(float(1.0), float(0.0)));

      // --- 2. SIDE COLONNADE APERTURE TEST ---
      const sideX = S.x.greaterThan(float(0.0)).select(float(W / 2 - 0.75), float(-W / 2 + 0.75));
      const tSide = sideX.sub(p.x).div(abs(S.x).greaterThan(float(1e-3)).select(S.x, float(1e-3)));
      const ySide = p.y.add(S.y.mul(tSide));
      const zSide = p.z.add(S.z.mul(tSide));
      const zSideRel = zSide.add(2.0).div(float(BAY_SPACING));
      const sideFrac = abs(fract(zSideRel.add(0.5)).sub(0.5));
      const inSideSlot = smoothstep(float(0.10), float(0.18), sideFrac)
        .mul(smoothstep(float(0.4), float(1.0), ySide))
        .mul(smoothstep(float(ROOF_Y + 0.1), float(ROOF_Y - 0.4), ySide))
        .mul(tSide.greaterThan(float(0.0)).select(float(1.0), float(0.0)));

      // Combined aperture gate: high contrast beams
      const beamGate = max(roofGate, inSideSlot);

      // Subtle airborne dust turbulence
      const dust = sin(p.x.mul(2.8).add(time.mul(0.4)))
        .mul(cos(p.y.mul(3.2).sub(time.mul(0.3))))
        .mul(sin(p.z.mul(2.5).add(time.mul(0.35))))
        .mul(0.20)
        .add(0.90);

      // Exponential distance falloff to prevent deep corridor accumulation blowout
      const distFade = exp(t.mul(-0.038));
      const sampleLight = beamGate.mul(dens).mul(inBounds).mul(dust).mul(phase).mul(distFade).mul(stepLen);
      acc.addAssign(sampleLight);

      t.addAssign(stepLen);
    });

    // Warm golden sunlight with soft saturation knee
    const toneMappedAcc = acc.div(float(1.0).add(acc.mul(0.70)));
    const sunColor = rgb(0xfce0a2); // Warm radiant sunlight
    return sunColor.mul(clamp(toneMappedAcc.mul(1.65), float(0.0), float(1.10)));
  })();

  const volGeo = new THREE.BoxGeometry(W + 0.4, ROOF_Y + 1.2, LEN + 0.8);
  volGeo.translate(0, (ROOF_Y + 1.2) / 2, -LEN / 2);
  const vol = new THREE.Mesh(volGeo, volMat);
  vol.frustumCulled = false;
  vol.renderOrder = 5;
  group.add(vol);
  disposables.push(volGeo, volMat);

  const _inv = new THREE.Matrix4();
  const _sunDir = new THREE.Vector3();

  return {
    group,
    length: LEN,
    title: 'Volumetric god rays cut by roof clerestory apertures',
    skill: 'webgpu-tsl-arena-forging',
    update(elapsed) {
      (time as unknown as { value: number }).value = elapsed;

      // Maintain local inverse transform for the raymarcher
      group.updateWorldMatrix(true, false);
      _inv.copy(group.matrixWorld).invert();
      (invWorld as unknown as { value: THREE.Matrix4 }).value.copy(_inv);

      // Dramatic side-sun angle so light cuts distinct parallel shafts ACROSS the aisle
      // as the player walks through them
      _sunDir.set(0.78, 0.58, -0.22).normalize();
      (sunLocal as unknown as { value: THREE.Vector3 }).value.copy(_sunDir);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}

