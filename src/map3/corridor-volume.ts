/**
 * map3/corridor-volume.ts — corridor 6: VOLUMETRIC LIGHT SHAFTS (GOD RAYS)
 * that physics bodies cut through.
 *
 * A ruined stone hall. The sun side (+x) is a solid wall pierced by one tall
 * narrow slit per bay; the roof is a solid slab with one narrow clerestory
 * slot per bay; the far side (-x) is an open colonnade the light leaves by.
 * That geometry is the whole trick: the earlier "open trusses" roof lit ~75%
 * of the air and the volume read as a golden wash. Shafts only read as shafts
 * when most of the air is DARK, so the apertures are ~16% of the wall and the
 * raymarch gate is derived from the same numbers the geometry is built from.
 *
 *   1. LOCAL-SPACE RAYMARCH — the ray is transformed by the corridor's inverse
 *      world matrix so the march is exact whatever the spoke's rotation.
 *   2. ONE APERTURE FUNCTION — every sample back-projects along the local sun
 *      vector and asks: does that ray reach the wall plane below the roof (then
 *      it must pass a slit) or the roof plane first (then it must pass a slot)?
 *      The floor's sunlit patches use the same function at y = 0, so the
 *      shafts and the patches they land on always agree.
 *   3. PHYSICS BODIES CAST SHADOW SHAFTS (handoff item F) — two rolling stone
 *      spheres and the player each carve a dark tube through the beams, shadow
 *      the floor patch, stir the dust in their wake and push the billboard
 *      motes aside.
 *
 * Repo contract: three/webgpu NodeMaterials with TSL expressions only.
 * No ShaderMaterial, no RawShaderMaterial, no onBeforeCompile.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial, MeshBasicNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

const {
  Fn, Loop, abs, attribute, cameraPosition, clamp, cos, cross, exp, float, fract, length, max, min,
  mix, normalize, positionLocal, positionWorld, sin, smoothstep, sqrt, uniform, uv, vec2, vec3, vec4,
} = TSL as unknown as Record<string, any>;

import type { Corridor } from './corridors';
// MAP3 (HF-409): the solids this corridor publishes for an arena to collide.
import { uprightSolid, type CorridorSolid } from './corridor-solids';
import { rgb } from './foliage-material';
import { hash11 } from './leaf-geometry';
// HF-421: the dark-interior lighting kit. Additive; this corridor is the only
// caller, and nothing outside this file reaches into it. See station-bay.ts.
import { createStationBay, probeMode, stationBayDressing, type StationBay } from './station-bay';

const W = 9;
const CORRIDOR_LEN = 44;
const ROOF_Y = 7.2;
const BAY_SPACING = 2.8;
const NUM_COLUMNS = 14;
const FIRST_COLUMN_Z = -2.0;
/** Column centre line; the sun-side wall stands just outside it. */
const COLUMN_X = W / 2 - 0.75;
const WALL_X = W / 2 - 0.35;
const WALL_T = 0.4;
/** Slit in the sun wall: one per bay, centred in the bay. */
const SLIT_W = 0.7;
const SLIT_Y0 = 1.0;
const SLIT_Y1 = 5.6;
/** Clerestory slot in the roof slab: one per bay, centred in the bay. */
const SLOT_W = 0.7;
const ROOF_T = 0.5;
/** Fraction of a bay (0 at a column, 0.5 at the bay centre) an aperture starts at. */
const APERTURE_FRAC = 0.5 - SLIT_W / 2 / BAY_SPACING;

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

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function createVolumeCorridor(): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = CORRIDOR_LEN;

  const time = uniform(0);
  const invWorld = uniform(new THREE.Matrix4());
  const sunLocal = uniform(new THREE.Vector3(0.78, 0.58, -0.22).normalize());

  // Physics bodies that cut the beams: two rolling stone spheres and the player.
  const bodyPos0 = uniform(new THREE.Vector3(0, 0.65, -16));
  const bodyRadius0 = uniform(0.65);
  const bodyPos1 = uniform(new THREE.Vector3(1.1, 0.5, -28));
  const bodyRadius1 = uniform(0.5);
  const playerPosLocal = uniform(new THREE.Vector3(0, -100, 0));
  const playerRadius = uniform(0.42);

  /* ---------------------------------------------------------------- */
  /* Shared TSL: the aperture gate and the body occlusion                */
  /* ---------------------------------------------------------------- */

  /** 1 where a local-space point sees the sun through a slit or a slot, else 0. */
  const apertureGate = (p: any, S: any) => {
    // Ray toward the sun reaches the wall plane x = WALL_X at tSide.
    const tSide = float(WALL_X).sub(p.x).div(max(S.x, float(0.05)));
    const ySide = p.y.add(S.y.mul(tSide));
    const zSide = p.z.add(S.z.mul(tSide));
    // ...and the roof plane y = ROOF_Y at tRoof.
    const tRoof = float(ROOF_Y).sub(p.y).div(max(S.y, float(0.05)));
    const xRoof = p.x.add(S.x.mul(tRoof));
    const zRoof = p.z.add(S.z.mul(tRoof));

    // Which plane comes first: below the roof line the ray meets the wall.
    const hitsWall = smoothstep(float(ROOF_Y + 0.15), float(ROOF_Y - 0.15), ySide);

    const bayFrac = (z: any) => abs(fract(z.sub(FIRST_COLUMN_Z).div(float(BAY_SPACING)).add(0.5)).sub(0.5));
    const slit = smoothstep(float(APERTURE_FRAC - 0.012), float(APERTURE_FRAC + 0.012), bayFrac(zSide))
      .mul(smoothstep(float(SLIT_Y0 - 0.08), float(SLIT_Y0 + 0.08), ySide))
      .mul(smoothstep(float(SLIT_Y1 + 0.08), float(SLIT_Y1 - 0.08), ySide));
    const slot = smoothstep(float(APERTURE_FRAC - 0.012), float(APERTURE_FRAC + 0.012), bayFrac(zRoof))
      .mul(smoothstep(float(W / 2 + 0.3), float(W / 2 - 0.1), abs(xRoof)));

    // The hall runs from the first column to the last; outside it there is no wall to pierce.
    const lastZ = FIRST_COLUMN_Z - (NUM_COLUMNS - 1) * BAY_SPACING;
    const inHall = (z: any) => smoothstep(float(lastZ - 0.3), float(lastZ + 0.3), z).mul(smoothstep(float(FIRST_COLUMN_Z + 0.3), float(FIRST_COLUMN_Z - 0.3), z));

    return mix(slot.mul(inHall(zRoof)), slit.mul(inHall(zSide)), hitsWall);
  };

  /** 0 inside the shadow tube a sphere at `c` (radius r) casts along S through p, else 1. */
  const bodyOcclusion = (p: any, S: any, c: any, r: any, inner: number) => {
    const toC = c.sub(p);
    const tProj = toC.dot(S);
    const closest = p.add(S.mul(max(tProj, float(0.0))));
    const dSq = closest.sub(c).dot(closest.sub(c));
    const rSq = r.mul(r);
    // A body BEHIND the point along the sun ray does not shadow it.
    const behind = tProj.lessThan(float(0.0)).select(float(1.0), float(0.0));
    return clamp(smoothstep(rSq.mul(inner), rSq.mul(1.2), dSq).add(behind), float(0.0), float(1.0));
  };
  const allBodies = (p: any, S: any, inner: number) => bodyOcclusion(p, S, bodyPos0, bodyRadius0, inner)
    .mul(bodyOcclusion(p, S, bodyPos1, bodyRadius1, inner))
    .mul(bodyOcclusion(p, S, playerPosLocal, playerRadius, inner));

  /* ---------------------------------------------------------------- */
  /* 1. Stone floor with the sunlit patches the shafts land on          */
  /* ---------------------------------------------------------------- */

  const stoneMat = new MeshStandardNodeMaterial();
  stoneMat.roughness = 0.85;
  stoneMat.colorNode = Fn(() => {
    const pLocal = invWorld.mul(vec4(positionWorld.xyz, 1.0)).xyz;
    const S = normalize(sunLocal);
    const sunPatch = apertureGate(pLocal, S)
      .mul(allBodies(pLocal, S, 0.8))
      .mul(smoothstep(float(-LEN - 1.0), float(-LEN + 2.0), pLocal.z))
      .mul(smoothstep(float(1.0), float(-1.0), pLocal.z));
    // Flagstone joints so the floor is not one flat value.
    const jx = abs(fract(pLocal.x.mul(0.8)).sub(0.5));
    const stagger = smoothstep(float(0.49), float(0.51), fract(pLocal.x.mul(0.4))).mul(0.5);
    const jz = abs(fract(pLocal.z.mul(0.8).add(stagger)).sub(0.5));
    const joint = smoothstep(float(0.44), float(0.49), max(jx, jz));
    const baseStone = mix(rgb(0x3a3a3e), rgb(0x2a2a2d), joint);
    const litStone = rgb(0xa8916c);
    return mix(baseStone, litStone, sunPatch.mul(0.92));
  })();
  disposables.push(stoneMat);

  const floorGeo = new THREE.PlaneGeometry(W, LEN, 16, 48);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0.04, -LEN / 2);
  const floor = new THREE.Mesh(floorGeo, stoneMat);
  // MAP3 (HF-409): named at creation - the parity rules read these names.
  floor.name = 'map3-godrays-hall-floor';
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  /* ---------------------------------------------------------------- */
  /* 2. Colonnade, sun wall with slits, roof slab with clerestory slots */
  /* ---------------------------------------------------------------- */

  const colMat = new MeshStandardNodeMaterial();
  colMat.roughness = 0.82;
  colMat.colorNode = rgb(0x4a4a50);
  disposables.push(colMat);

  const parts: THREE.BufferGeometry[] = [];
  const lastColumnZ = FIRST_COLUMN_Z - (NUM_COLUMNS - 1) * BAY_SPACING;
  /**
   * MAP3 (HF-409): the hall's mass, declared as it is built.
   *
   * The whole colonnade is merged into ONE mesh so it draws once, which means
   * its bounding box is the hall's interior VOLUME - the corridor you walk
   * down. Colliding that box would seal the corridor shut. The columns, the
   * pierced sun wall and the end wall are the actual solids, and they are
   * known here and nowhere else. The roof slab and architraves are overhead
   * and out of a standing body's way, so they are not movement solids; the
   * slit and the clerestory slot are holes and stay holes.
   */
  const solids: CorridorSolid[] = [];

  for (let i = 0; i < NUM_COLUMNS; i++) {
    const z = FIRST_COLUMN_Z - i * BAY_SPACING;
    for (const side of [-1, 1]) {
      const x = side * COLUMN_X;
      solids.push(uprightSolid(`column-${i}${side > 0 ? 'e' : 'w'}`, x, z, 0.38, ROOF_Y, 'stone'));
      const col = new THREE.CylinderGeometry(0.32, 0.38, ROOF_Y, 10);
      col.translate(x, ROOF_Y / 2, z);
      parts.push(col);
      parts.push(box(0.95, 0.45, 0.95, x, 0.22, z));
      parts.push(box(0.9, 0.4, 0.9, x, ROOF_Y - 0.2, z));
    }
    // Transverse beam under the slab at every column line.
    parts.push(box(W - 0.6, 0.45, 0.48, 0, ROOF_Y - 0.22, z));

    if (i < NUM_COLUMNS - 1) {
      const zc = z - BAY_SPACING / 2;
      const zFar = z - BAY_SPACING;
      // Longitudinal architraves over both column rows.
      for (const side of [-1, 1]) parts.push(box(0.65, 0.45, BAY_SPACING, side * COLUMN_X, ROOF_Y - 0.22, zc));

      // Roof slab, split around the clerestory slot at the bay centre.
      const slabW = W + 0.4;
      const segLen = (BAY_SPACING - SLOT_W) / 2;
      parts.push(box(slabW, ROOF_T, segLen, 0, ROOF_Y + ROOF_T / 2, z - segLen / 2));
      parts.push(box(slabW, ROOF_T, segLen, 0, ROOF_Y + ROOF_T / 2, zFar + segLen / 2));

      // Sun wall (+x), split around the slit: two full-height piers, a sill
      // below the slit and a lintel above it.
      const wallH = ROOF_Y + ROOF_T;
      parts.push(box(WALL_T, wallH, segLen, WALL_X, wallH / 2, z - segLen / 2));
      parts.push(box(WALL_T, wallH, segLen, WALL_X, wallH / 2, zFar + segLen / 2));
      solids.push({ name: `sunwall-${i}a`, x: WALL_X, y: wallH / 2, z: z - segLen / 2, sx: WALL_T, sy: wallH, sz: segLen, material: 'stone' });
      solids.push({ name: `sunwall-${i}b`, x: WALL_X, y: wallH / 2, z: zFar + segLen / 2, sx: WALL_T, sy: wallH, sz: segLen, material: 'stone' });
      // The slit's sill is knee-high and the lintel above it starts at 5.6 m;
      // only the sill is in a body's way, and it is the reason you cannot walk
      // out through a shaft of light.
      solids.push({ name: `sunwall-${i}-sill`, x: WALL_X, y: SLIT_Y0 / 2, z: zc, sx: WALL_T, sy: SLIT_Y0, sz: SLIT_W, material: 'stone' });
      parts.push(box(WALL_T, SLIT_Y0, SLIT_W, WALL_X, SLIT_Y0 / 2, zc));
      parts.push(box(WALL_T, wallH - SLIT_Y1, SLIT_W, WALL_X, (wallH + SLIT_Y1) / 2, zc));
    }
  }
  // End wall at the far column line closes the hall so the last bay is dark too.
  parts.push(box(W + 0.4, ROOF_Y + ROOF_T, WALL_T, 0, (ROOF_Y + ROOF_T) / 2, lastColumnZ - 0.3));
  solids.push({
    name: 'end-wall',
    x: 0,
    y: (ROOF_Y + ROOF_T) / 2,
    z: lastColumnZ - 0.3,
    sx: W + 0.4,
    sy: ROOF_Y + ROOF_T,
    sz: WALL_T,
    material: 'stone',
  });

  const merged = mergeSimple(parts);
  parts.forEach((g) => g.dispose());
  const hall = new THREE.Mesh(merged, colMat);
  hall.name = 'map3-godrays-colonnade';
  hall.castShadow = true;
  hall.receiveShadow = true;
  group.add(hall);
  disposables.push(merged);

  /* ---------------------------------------------------------------- */
  /* 3. Rolling stone spheres (the physics bodies the beams react to)   */
  /* ---------------------------------------------------------------- */

  const sphereMat = new MeshStandardNodeMaterial();
  sphereMat.roughness = 0.68;
  sphereMat.metalness = 0.05;
  {
    const p = positionLocal;
    const relief = sin(p.y.mul(18.0).add(sin(p.x.mul(12.0)).mul(0.5))).mul(0.5).add(0.5);
    sphereMat.colorNode = mix(rgb(0x625a50), rgb(0x8a7e6c), relief.mul(0.5));
  }
  disposables.push(sphereMat);

  const sphereGeo0 = new THREE.SphereGeometry(0.65, 20, 16);
  const sphereMesh0 = new THREE.Mesh(sphereGeo0, sphereMat);
  sphereMesh0.name = 'map3-godrays-rolling-body';
  sphereMesh0.castShadow = true;
  sphereMesh0.receiveShadow = true;
  group.add(sphereMesh0);
  disposables.push(sphereGeo0);

  const sphereGeo1 = new THREE.SphereGeometry(0.5, 18, 14);
  const sphereMesh1 = new THREE.Mesh(sphereGeo1, sphereMat);
  sphereMesh1.name = 'map3-godrays-rolling-body';
  sphereMesh1.castShadow = true;
  sphereMesh1.receiveShadow = true;
  group.add(sphereMesh1);
  disposables.push(sphereGeo1);

  const s0 = { pos: new THREE.Vector3(0, 0.65, -16), vel: new THREE.Vector3(0, 0, -1.8), rot: new THREE.Euler(), radius: 0.65 };
  const s1 = { pos: new THREE.Vector3(1.1, 0.5, -28), vel: new THREE.Vector3(0, 0, 0.8), rot: new THREE.Euler(), radius: 0.5 };

  /* ---------------------------------------------------------------- */
  /* 4. Volumetric raymarcher                                           */
  /* ---------------------------------------------------------------- */

  const volMat = new MeshBasicNodeMaterial();
  volMat.transparent = true;
  volMat.depthWrite = false;
  volMat.depthTest = false;
  volMat.side = THREE.BackSide;
  volMat.blending = THREE.AdditiveBlending;
  volMat.fog = false;

  const STEPS = 48;

  volMat.colorNode = Fn(() => {
    const ro = invWorld.mul(vec4(cameraPosition, 1.0)).xyz.toVar();
    const exit = invWorld.mul(vec4(positionWorld, 1.0)).xyz;
    const seg = exit.sub(ro);
    const dist = min(length(seg), float(48.0));
    const rd = normalize(seg).toVar();
    const S = normalize(sunLocal).toVar();
    const stepLen = dist.div(float(STEPS));

    // Forward Mie lobe: brighter when looking toward the sun, never zero.
    const cosTheta = clamp(rd.dot(S), float(-1.0), float(1.0));
    const g = float(0.45);
    const g2 = g.mul(g);
    const denom = float(1.0).add(g2).sub(float(2.0).mul(g).mul(cosTheta));
    const mie = float(1.0).sub(g2).div(max(denom.mul(sqrt(denom)), float(0.01))).mul(0.30);
    const phase = float(0.40).add(mie);

    const acc = float(0.0).toVar();
    const t = stepLen.mul(0.5).toVar();

    Loop(STEPS, () => {
      const p = ro.add(rd.mul(t));

      const inBounds = smoothstep(float(W / 2 + 0.4), float(W / 2 - 0.2), abs(p.x))
        .mul(smoothstep(float(-LEN - 1.0), float(-LEN + 0.6), p.z))
        .mul(smoothstep(float(1.0), float(-0.6), p.z))
        .mul(smoothstep(float(-0.1), float(0.3), p.y))
        .mul(smoothstep(float(ROOF_Y + 0.8), float(ROOF_Y - 0.2), p.y));

      // Dust hangs low; the beams are brightest near the floor.
      const dens = exp(p.y.mul(-0.14)).mul(0.085);

      const beamGate = apertureGate(p, S).mul(allBodies(p, S, 0.7));

      // Dust turbulence, stirred harder in the wake of a moving body.
      const wakeDist = min(length(p.sub(bodyPos0)), min(length(p.sub(bodyPos1)), length(p.sub(playerPosLocal))));
      const wake = smoothstep(float(3.2), float(0.3), wakeDist);
      const swirl = sin(p.x.mul(4.5).add(time.mul(1.6))).mul(cos(p.z.mul(4.5).sub(time.mul(1.3)))).mul(wake.mul(0.6));
      const dust = sin(p.x.mul(2.8).add(time.mul(0.4)))
        .mul(cos(p.y.mul(3.2).sub(time.mul(0.3))))
        .mul(sin(p.z.mul(2.5).add(time.mul(0.35))))
        .mul(0.22)
        .add(0.9)
        .add(swirl);

      const distFade = exp(t.mul(-0.03));
      acc.addAssign(beamGate.mul(dens).mul(inBounds).mul(dust).mul(phase).mul(distFade).mul(stepLen));
      t.addAssign(stepLen);
    });

    // Soft knee, then a hard cap so a long sightline down a beam never blows out.
    const toneMapped = acc.div(float(1.0).add(acc.mul(0.55)));
    return rgb(0xfde2a6).mul(clamp(toneMapped.mul(1.7), float(0.0), float(1.0)));
  })();

  const volGeo = new THREE.BoxGeometry(W + 0.4, ROOF_Y + 1.2, LEN + 0.8);
  volGeo.translate(0, (ROOF_Y + 1.2) / 2, -LEN / 2);
  const vol = new THREE.Mesh(volGeo, volMat);
  vol.name = 'map3-godrays-light-shaft-volume';
  vol.frustumCulled = false;
  vol.renderOrder = 5;
  group.add(vol);
  disposables.push(volGeo, volMat);

  /* ---------------------------------------------------------------- */
  /* 5. Instanced billboard dust motes, pushed aside by moving bodies   */
  /* ---------------------------------------------------------------- */

  const MOTE_COUNT = 180;
  const motePosAttr = new Float32Array(MOTE_COUNT * 3);
  const moteSeedAttr = new Float32Array(MOTE_COUNT);
  for (let i = 0; i < MOTE_COUNT; i++) {
    const h0 = hash11(i * 3.19 + 7);
    const h1 = hash11(i * 7.43 + 23);
    const h2 = hash11(i * 11.21 + 41);
    motePosAttr[i * 3] = (h0 - 0.5) * (W - 1.5);
    motePosAttr[i * 3 + 1] = 0.2 + h1 * 4.5;
    motePosAttr[i * 3 + 2] = -2.0 - h2 * (LEN - 4.0);
    moteSeedAttr[i] = hash11(i * 17.3) * 100.0;
  }

  const moteGeo = new THREE.InstancedBufferGeometry();
  const moteQuad = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]);
  const moteUv = new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]);
  moteGeo.setAttribute('position', new THREE.BufferAttribute(moteQuad, 3));
  moteGeo.setAttribute('uv', new THREE.BufferAttribute(moteUv, 2));
  moteGeo.setAttribute('aOrigin', new THREE.InstancedBufferAttribute(motePosAttr, 3));
  moteGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(moteSeedAttr, 1));
  moteGeo.instanceCount = MOTE_COUNT;
  moteGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -LEN / 2), LEN / 2);

  const moteMat = new MeshBasicNodeMaterial();
  moteMat.transparent = true;
  moteMat.depthWrite = false;
  moteMat.blending = THREE.AdditiveBlending;
  moteMat.side = THREE.DoubleSide;
  moteMat.fog = false;
  {
    const o = attribute('aOrigin', 'vec3');
    const s = attribute('aSeed', 'float');
    const t = time;

    const driftY = sin(t.mul(0.6).add(s)).mul(0.35);
    const driftX = sin(t.mul(0.4).add(s.mul(1.7))).mul(0.4);
    const driftZ = cos(t.mul(0.5).add(s.mul(2.1))).mul(0.4);
    const drifted = vec3(o.x.add(driftX), o.y.add(driftY), o.z.add(driftZ));

    // A body passing within 1.6 m shoves the mote radially away from it.
    const shove = (c: any) => {
      const d = drifted.sub(c);
      const dl = max(length(d), float(0.05));
      return d.div(dl).mul(smoothstep(float(1.6), float(0.2), dl).mul(1.1));
    };
    const centre = drifted.add(shove(bodyPos0)).add(shove(bodyPos1)).add(shove(playerPosLocal));

    const toCam = normalize(cameraPosition.sub(centre));
    const right = normalize(cross(vec3(0, 1, 0), toCam));
    const up = cross(toCam, right);
    const moteSize = float(0.065);
    moteMat.positionNode = centre.add(right.mul(positionLocal.x.mul(moteSize))).add(up.mul(positionLocal.y.mul(moteSize)));

    // Motes only glow where a beam lights them, so they trace the shafts.
    const lit = apertureGate(centre, normalize(sunLocal)).mul(0.85).add(0.15);
    const d = uv().sub(vec2(0.5, 0.5)).length().mul(2.0);
    const shape = float(1.0).sub(smoothstep(float(0.2), float(1.0), d));
    const shimmer = sin(t.mul(2.5).add(s.mul(4.0))).mul(0.35).add(0.65);
    moteMat.colorNode = vec4(rgb(0xffecb8), shape.mul(shimmer).mul(lit).mul(0.8));
  }

  const motes = new THREE.Mesh(moteGeo, moteMat);
  motes.name = 'map3-godrays-dust-mote-particles';
  motes.frustumCulled = false;
  motes.renderOrder = 6;
  group.add(motes);
  disposables.push(moteGeo, moteMat);

  /* ---------------------------------------------------------------- */
  /* 6. HF-421 station-bay dressing: emissive fixtures, grime, lights   */
  /* ---------------------------------------------------------------- */

  /**
   * The interior-lighting look, added ON TOP of the god-ray exhibit rather
   * than replacing it. The hall already is a colonnade with a beamed roof and
   * a clerestory run - the archetype the technique wants - so the kit supplies
   * what it lacks: fluorescent tubes above the aisle, halo cards and floor
   * light pools under them, a dado/frieze/duct dressing course, one grime mask
   * stack over wall and floor, two shadowed spots, six short-range unshadowed
   * points, and exactly one exposure moment (a service tram running the bay).
   *
   * The shafts stay the sun's. Nothing here touches the raymarcher, the
   * aperture gate or any solid the corridor publishes.
   */
  const stationBay: StationBay = createStationBay({
    width: W,
    length: LEN,
    roofY: ROOF_Y,
    baySpacing: BAY_SPACING,
    firstColumnZ: FIRST_COLUMN_Z,
    numColumns: NUM_COLUMNS,
    wallInnerX: WALL_X - WALL_T / 2,
    seed: 41,
    probes: probeMode(),
    dressing: stationBayDressing(),
  });
  group.add(stationBay.group);
  disposables.push(stationBay);

  const _inv = new THREE.Matrix4();
  const _localPlayer = new THREE.Vector3();

  return {
    group,
    length: LEN,
    solids,
    title: 'Volumetric god rays through slit walls, cut by rolling bodies',
    skill: 'webgpu-tsl-arena-forging',
    update(elapsed, dt, playerPos, playerVel) {
      (time as unknown as { value: number }).value = elapsed;
      const delta = Math.min(Math.max(dt, 0), 0.05);
      stationBay.update(elapsed, delta);

      group.updateWorldMatrix(true, false);
      _inv.copy(group.matrixWorld).invert();
      (invWorld as unknown as { value: THREE.Matrix4 }).value.copy(_inv);

      // Sphere 0 patrols the aisle end to end.
      s0.pos.z += s0.vel.z * delta;
      s0.rot.x += (s0.vel.z / s0.radius) * delta;
      if (s0.pos.z < -38.0) { s0.pos.z = -38.0; s0.vel.z = Math.abs(s0.vel.z); }
      if (s0.pos.z > -6.0) { s0.pos.z = -6.0; s0.vel.z = -Math.abs(s0.vel.z); }
      sphereMesh0.position.copy(s0.pos);
      sphereMesh0.rotation.x = s0.rot.x;
      (bodyPos0 as unknown as { value: THREE.Vector3 }).value.copy(s0.pos);

      // Sphere 1 rolls freely, damped, and can be shoved by the player.
      s1.pos.x += s1.vel.x * delta;
      s1.pos.z += s1.vel.z * delta;
      s1.rot.x += (s1.vel.z / s1.radius) * delta;
      s1.rot.z -= (s1.vel.x / s1.radius) * delta;
      s1.vel.multiplyScalar(Math.max(0, 1.0 - 0.4 * delta));
      if (s1.pos.x < -3.2) { s1.pos.x = -3.2; s1.vel.x = Math.abs(s1.vel.x) * 0.7; }
      if (s1.pos.x > 3.2) { s1.pos.x = 3.2; s1.vel.x = -Math.abs(s1.vel.x) * 0.7; }
      if (s1.pos.z < -40.0) { s1.pos.z = -40.0; s1.vel.z = Math.abs(s1.vel.z) * 0.7; }
      if (s1.pos.z > -4.0) { s1.pos.z = -4.0; s1.vel.z = -Math.abs(s1.vel.z) * 0.7; }
      sphereMesh1.position.copy(s1.pos);
      sphereMesh1.rotation.set(s1.rot.x, 0, s1.rot.z);
      (bodyPos1 as unknown as { value: THREE.Vector3 }).value.copy(s1.pos);

      if (playerPos) {
        _localPlayer.copy(playerPos).applyMatrix4(_inv);
        (playerPosLocal as unknown as { value: THREE.Vector3 }).value.copy(_localPlayer);
        const dx = s1.pos.x - _localPlayer.x;
        const dz = s1.pos.z - _localPlayer.z;
        const d = Math.hypot(dx, dz);
        if (d < s1.radius + 0.6 && Math.abs(_localPlayer.y - s1.pos.y) < 1.5) {
          const nx = d > 0.01 ? dx / d : 0;
          const nz = d > 0.01 ? dz / d : -1;
          const pushSpeed = playerVel ? Math.hypot(playerVel.x, playerVel.z) : 3.0;
          s1.vel.x += nx * Math.max(2.0, pushSpeed * 0.8);
          s1.vel.z += nz * Math.max(2.0, pushSpeed * 0.8);
        }
      } else {
        (playerPosLocal as unknown as { value: THREE.Vector3 }).value.set(0, -100, 0);
      }
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}
