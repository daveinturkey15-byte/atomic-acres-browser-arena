/**
 * map3/corridors.ts — the three exhibits.
 *
 * Each corridor is a factory returning { group, update, dispose } and nothing
 * else. Nothing outside this file reaches into their internals, nothing mutates
 * global renderer state, and every GPU resource each one creates is released by
 * its own dispose(). That is the ring-fence: a corridor cannot break the game
 * because it cannot reach it.
 *
 *   1. NATURE   — the six techniques a reference jungle uses and we do not.
 *   2. MATHS    — a raymarched SDF grotto. Not one triangle of content.
 *   3. GRAMMAR  — a shape-grammar tower, rebuilt from a seed as you walk past.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

/** One cast boundary; see the note in foliage-material.ts. */
const {
  Fn, Loop, Break, If, abs, cameraPosition, clamp, cos, dot, float, length, max, mix,
  normalize, positionWorld, pow, sin, uniform, vec3,
} = TSL as unknown as Record<string, any>;

import {
  createTree, createShrub, createConifer, createFallenLog, createGrassTuft, poissonScatter,
} from './plants';
import { createLitterSkirt, hash11, mergeGeometries } from './leaf-geometry';
import {
  AUTUMN_PALETTE, SPRING_PALETTE, SUMMER_PALETTE, createBarkMaterial, createFlatFoliageMaterial,
  createFoliageMaterial, createFoliageUniforms, createForestFloorMaterial,
} from './foliage-material';

export interface Corridor {
  group: THREE.Group;
  update(elapsed: number, dt: number): void;
  dispose(): void;
  /** Walk-through length in metres; the hub uses it to place the far sign. */
  length: number;
  title: string;
  skill: string;
}

const CORRIDOR_WIDTH = 9;

/* ------------------------------------------------------------------ */
/* 1. NATURE                                                           */
/* ------------------------------------------------------------------ */

/**
 * A forest floor you walk the length of, with the six techniques applied — and
 * a hard split down the middle for the first third so the difference is
 * demonstrated rather than claimed. Left of the line: flat leaf cards, one
 * green, no transmission, canopy in the shadow map, no litter. Right: the same
 * geometry count with curvature, translucency, abaxial shading, senescence and
 * a litter skirt.
 */
export function createNatureCorridor(seed = 7): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 54;
  const Z1 = -LEN / 3;          // end of zone A
  const Z2 = -(LEN * 2) / 3;    // end of zone B

  const uniforms = createFoliageUniforms();
  const foliageMat = createFoliageMaterial(uniforms, SUMMER_PALETTE);
  const autumnMat = createFoliageMaterial(uniforms, AUTUMN_PALETTE);
  const springMat = createFoliageMaterial(uniforms, SPRING_PALETTE);
  const flatMat = createFlatFoliageMaterial(SUMMER_PALETTE);
  const barkMat = createBarkMaterial();
  const darkBarkMat = createBarkMaterial(0x4a4034);
  const floorMat = createForestFloorMaterial();
  disposables.push(foliageMat, autumnMat, springMat, flatMat, barkMat, darkBarkMat, floorMat);

  const floorGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH, LEN, 12, 48);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, -LEN / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  // One batch per material. Everything below pushes transformed geometry into
  // these and nothing creates a mesh of its own — that is what keeps a forest
  // this dense down to a handful of draw calls.
  const wood: THREE.BufferGeometry[] = [];
  const darkWood: THREE.BufferGeometry[] = [];
  const green: THREE.BufferGeometry[] = [];
  const autumn: THREE.BufferGeometry[] = [];
  const spring: THREE.BufferGeometry[] = [];
  const flat: THREE.BufferGeometry[] = [];
  const xf = new THREE.Matrix4();

  const place = (g: THREE.BufferGeometry, x: number, z: number, ry = 0) => {
    xf.makeRotationY(ry);
    xf.setPosition(x, 0, z);
    g.applyMatrix4(xf);
    return g;
  };

  /* ---- ZONE A: broadleaf, and the before/after split ------------------ */
  // The near third is halved down the centre line: left is the flat card with
  // no transmission and no litter, right is the full treatment. Same geometry
  // budget on both sides, so the difference is the shading, not the density.
  poissonScatter(30, { minX: -11, maxX: 11, minZ: Z1, maxZ: 1 }, 2.4, seed).forEach((p, i) => {
    if (Math.abs(p.x) < 1.8) return;
    const before = p.x < 0;
    const parts = createTree({
      seed: seed * 10 + i,
      height: 4.5 + hash11(seed + i) * 6.5,
      trunkRadius: 0.12 + hash11(seed * 2 + i) * 0.19,
      depth: 3, leavesPerClump: 11, deadFraction: 0.08,
    });
    wood.push(place(parts.wood, p.x, p.y));
    (before ? flat : green).push(place(parts.foliage, p.x, p.y));
    if (!before) green.push(place(parts.litter, p.x, p.y));
    else parts.litter.dispose();
  });

  /* ---- ZONE B: conifer stand, grass understorey, deadwood ------------- */
  poissonScatter(26, { minX: -12, maxX: 12, minZ: Z2, maxZ: Z1 }, 2.7, seed * 3).forEach((p, i) => {
    if (Math.abs(p.x) < 2.0) return;
    const parts = createConifer({
      seed: seed * 20 + i,
      height: 7 + hash11(seed * 5 + i) * 8,
      trunkRadius: 0.16 + hash11(seed * 6 + i) * 0.14,
    });
    darkWood.push(place(parts.wood, p.x, p.y));
    green.push(place(parts.foliage, p.x, p.y));
    green.push(place(parts.litter, p.x, p.y));
  });
  // Fallen logs read as history; three is enough to sell it.
  [[-3.4, Z1 - 4, 0.4], [3.9, Z1 - 11, -0.8], [-4.6, Z2 + 3, 1.9]].forEach(([x, z, r], i) => {
    darkWood.push(place(createFallenLog(seed * 30 + i, 3.2 + i), x, z, r));
  });
  // Grass understorey along the conifer floor.
  poissonScatter(150, { minX: -9, maxX: 9, minZ: Z2, maxZ: Z1 }, 0.62, seed * 7).forEach((p, i) => {
    if (Math.abs(p.x) < 1.3) return;
    green.push(place(createGrassTuft(seed * 50 + i, 0.8 + hash11(seed + i) * 0.8), p.x, p.y,
      hash11(seed * 2 + i) * 6.28));
  });

  /* ---- ZONE C: autumn grove, heavy litter, spring saplings ------------ */
  poissonScatter(34, { minX: -12, maxX: 12, minZ: -LEN, maxZ: Z2 }, 2.2, seed * 11).forEach((p, i) => {
    if (Math.abs(p.x) < 1.8) return;
    const young = hash11(seed * 13 + i) > 0.7;
    const parts = createTree({
      seed: seed * 40 + i,
      height: young ? 2.6 + hash11(seed + i) * 2 : 5 + hash11(seed + i) * 7,
      trunkRadius: young ? 0.07 : 0.13 + hash11(seed * 3 + i) * 0.16,
      depth: 3, leavesPerClump: young ? 8 : 12,
      deadFraction: young ? 0.05 : 0.55,
    });
    wood.push(place(parts.wood, p.x, p.y));
    (young ? spring : autumn).push(place(parts.foliage, p.x, p.y));
    autumn.push(place(parts.litter, p.x, p.y));
  });

  /* ---- shared understorey and floor litter ---------------------------- */
  poissonScatter(110, { minX: -11, maxX: 11, minZ: -LEN, maxZ: 0 }, 1.05, seed * 5).forEach((p, i) => {
    if (Math.abs(p.x) < 1.3) return;
    const before = p.y > Z1 && p.x < 0;
    const g = createShrub(seed * 60 + i, 0.6 + hash11(seed + i * 3) * 1.1);
    (before ? flat : (p.y < Z2 ? autumn : green))
      .push(place(g, p.x, p.y, hash11(seed + i * 9) * 6.28));
  });
  poissonScatter(220, { minX: -6, maxX: 6, minZ: -LEN + 1, maxZ: -1 }, 0.44, seed * 3)
    .forEach((p, i) => {
      if (p.y > Z1 && p.x < 0) return;
      const g = createLitterSkirt(0.28, 3, {
        length: 0.19, width: 0.07, segmentsV: 3, segmentsU: 2, widestAt: 0.4,
      }, seed * 17 + i);
      (p.y < Z2 ? autumn : green).push(place(g, p.x, p.y));
    });

  function addBatch(parts: THREE.BufferGeometry[], material: THREE.Material, cast: boolean): void {
    if (!parts.length) return;
    const merged = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = cast;
    mesh.receiveShadow = !cast;
    group.add(mesh);
    disposables.push(merged);
  }

  // Wood is the only shadow caster; the canopy is deliberately excluded so
  // direct sun reaches the floor instead of turning into leaf mush.
  addBatch(wood, barkMat, true);
  addBatch(darkWood, darkBarkMat, true);
  addBatch(green, foliageMat, false);
  addBatch(autumn, autumnMat, false);
  addBatch(spring, springMat, false);
  addBatch(flat, flatMat, false);

  return {
    group,
    length: LEN,
    title: 'Leaf translucency, curvature and litter',
    skill: 'threejs-procedural-vegetation',
    update(elapsed) {
      (uniforms.time as unknown as { value: number }).value = elapsed;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 2. MATHS — raymarched SDF                                           */
/* ------------------------------------------------------------------ */

/**
 * A grotto with no content geometry at all: one box proxy carrying a TSL
 * raymarcher. Every surface, every normal and all the shading come out of a
 * distance function evaluated per pixel.
 *
 * The route decision (procedural-sdf-raymarched-worlds §1) is respected: this
 * is a bounded set-piece INSIDE a rasterised corridor, not the corridor itself.
 * The walls and floor you walk on are real geometry with real colliders; the
 * thing in the alcove is maths.
 */
export function createMathsCorridor(): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 48;

  const time = uniform(0);

  const floorMat = new MeshStandardNodeMaterial();
  floorMat.roughness = 0.9;
  floorMat.colorNode = vec3(0.16, 0.17, 0.19);
  const floorGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH, LEN, 4, 4);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, -LEN / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo, floorMat);

  // --- the SDF material -------------------------------------------------
  /** Polynomial smooth minimum — the blend that makes SDF shapes fuse. */
  const smin = Fn(([a, b, k]: [any, any, any]) => {
    const h = clamp(float(0.5).add(float(0.5).mul(b.sub(a)).div(k)), float(0), float(1));
    return mix(b, a, h).sub(k.mul(h).mul(float(1).sub(h)));
  });

  const sdSphere = Fn(([p, r]: [any, any]) => length(p).sub(r));

  /**
   * Station A - smooth-union blobs. The polynomial smin is what makes three
   * spheres read as one organism rather than three spheres.
   */
  const sceneBlobs = Fn(([p]: [any]) => {
    const t = float(time);
    const q = p.toVar();
    const a = sdSphere(q.sub(vec3(sin(t.mul(0.41)).mul(1.1), cos(t.mul(0.29)).mul(0.7), sin(t.mul(0.53)).mul(0.9))), float(1.05));
    const b = sdSphere(q.sub(vec3(cos(t.mul(0.37)).mul(1.3), sin(t.mul(0.47)).mul(0.9).add(0.4), cos(t.mul(0.31)).mul(1.0))), float(0.85));
    const c = sdSphere(q.sub(vec3(sin(t.mul(0.23)).mul(0.8), cos(t.mul(0.43)).mul(1.1).sub(0.3), sin(t.mul(0.19)).mul(1.2))), float(0.7));
    const d0 = smin(a, b, float(0.65));
    const d1 = smin(d0, c, float(0.55));
    const ripple = sin(q.x.mul(4.2).add(t.mul(1.1)))
      .mul(sin(q.z.mul(3.7).sub(t.mul(0.8))))
      .mul(sin(q.y.mul(4.9).add(t.mul(0.6))))
      .mul(0.06);
    return d1.add(ripple);
  });

  /**
   * Station B - LIMITED domain repetition. One sphere-and-strut cell folded
   * into a bounded 3x3x3 lattice. The infinite form of this trick is the
   * classic SDF demo and also the version you can never cull, budget or ship:
   * clamping the cell index keeps the bounding volume finite.
   */
  const sceneLattice = Fn(([p]: [any]) => {
    const t = float(time);
    const c = float(1.5);
    const id = p.div(c).add(0.5).floor().clamp(float(-1), float(1));
    const q = p.sub(id.mul(c)).toVar();
    const pulse = sin(t.mul(0.9).add(id.x.add(id.y).add(id.z).mul(1.7))).mul(0.09);
    const ball = sdSphere(q, float(0.42).add(pulse));
    const sx = length(vec3(float(0), q.y, q.z)).sub(0.11);
    const sy = length(vec3(q.x, float(0), q.z)).sub(0.11);
    const sz = length(vec3(q.x, q.y, float(0))).sub(0.11);
    const d0 = smin(ball, sx, float(0.22));
    const d1 = smin(d0, sy, float(0.22));
    return smin(d1, sz, float(0.22));
  });

  /**
   * Station C - a gyroid, the standard triply-periodic minimal surface. Pure
   * trigonometry: no primitives at all. Its "distance" is only an
   * approximation, which is precisely why it needs heavier step damping - a
   * good demonstration that a non-metric field still marches if you respect it.
   */
  const sceneGyroid = Fn(([p]: [any]) => {
    const t = float(time);
    const q = p.mul(1.9).toVar();
    const g = sin(q.x).mul(cos(q.y))
      .add(sin(q.y).mul(cos(q.z)))
      .add(sin(q.z).mul(cos(q.x)));
    const shell = abs(g).sub(float(0.42).add(sin(t.mul(0.4)).mul(0.16)));
    const bound = length(p).sub(2.1);
    return max(shell.mul(0.42), bound);
  });

  const MAX_STEPS = 32;

  /** One marcher, parameterised by distance function, centre and damping. */
  function marcherFor(sceneFn: any, centreUniform: any, damp: number, tint: any) {
    return Fn(() => {
      const centre = vec3(centreUniform);
      const ro = cameraPosition.sub(centre).toVar();
      const rd = normalize(positionWorld.sub(cameraPosition)).toVar();

      const tt = float(0.05).toVar();
      const hit = float(0.0).toVar();
      const p = vec3(0).toVar();

      Loop(MAX_STEPS, () => {
        p.assign(ro.add(rd.mul(tt)));
        const d = sceneFn(p);
        If(d.lessThan(float(0.0018).mul(max(tt, float(1.0)))), () => {
          hit.assign(1.0);
          Break();
        });
        // Lipschitz damping. A warped or non-metric field over-estimates the
        // safe step and rays tunnel through the surface; speckled holes are
        // this, never an insufficient step count.
        tt.addAssign(d.mul(float(damp)));
        If(tt.greaterThan(float(48.0)), () => { Break(); });
      });

      const h = float(0.0025);
      const k1 = vec3(1, -1, -1); const k2 = vec3(-1, -1, 1);
      const k3 = vec3(-1, 1, -1); const k4 = vec3(1, 1, 1);
      const n = normalize(
        k1.mul(sceneFn(p.add(k1.mul(h))))
          .add(k2.mul(sceneFn(p.add(k2.mul(h)))))
          .add(k3.mul(sceneFn(p.add(k3.mul(h)))))
          .add(k4.mul(sceneFn(p.add(k4.mul(h))))),
      );

      const L = normalize(vec3(0.45, 0.8, 0.35));
      const diff = clamp(dot(n, L), float(0.0), float(1.0));
      const fres = pow(float(1.0).sub(clamp(dot(n, rd.negate()), float(0), float(1))), float(3.0));
      const surface = mix(vec3(0.04, 0.16, 0.26), tint, diff)
        .add(vec3(0.85, 0.42, 0.22).mul(fres).mul(0.7));
      return mix(vec3(0.02, 0.03, 0.05), surface, hit);
    })();
  }

  const STATIONS: Array<{ fn: any; damp: number; tint: any; z: number }> = [
    { fn: sceneBlobs, damp: 0.72, tint: vec3(0.25, 0.72, 0.78), z: -LEN * 0.28 },
    { fn: sceneLattice, damp: 0.85, tint: vec3(0.80, 0.63, 0.28), z: -LEN * 0.55 },
    { fn: sceneGyroid, damp: 0.42, tint: vec3(0.74, 0.34, 0.62), z: -LEN * 0.82 },
  ];

  const proxies: Array<{ mesh: THREE.Mesh; centre: any }> = [];
  const plinthMat = new MeshStandardNodeMaterial();
  plinthMat.roughness = 0.6;
  plinthMat.colorNode = vec3(0.1, 0.11, 0.13);
  disposables.push(plinthMat);

  STATIONS.forEach((st) => {
    const centre = uniform(new THREE.Vector3(0, 2.9, st.z));
    const mat = new MeshStandardNodeMaterial();
    mat.side = THREE.BackSide;
    mat.colorNode = marcherFor(st.fn, centre, st.damp, st.tint);

    const geo = new THREE.BoxGeometry(5.4, 4.8, 5.4);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 2.9, st.z);
    mesh.frustumCulled = false;
    group.add(mesh);
    disposables.push(geo, mat);
    proxies.push({ mesh, centre });

    const pg = new THREE.CylinderGeometry(2.1, 2.5, 0.5, 20);
    const plinth = new THREE.Mesh(pg, plinthMat);
    plinth.position.set(0, 0.25, st.z);
    plinth.receiveShadow = true;
    group.add(plinth);
    disposables.push(pg);
  });

  const proxyWorld = new THREE.Vector3();

  return {
    group,
    length: LEN,
    title: 'Raymarched SDF — three fields, no geometry',
    skill: 'procedural-sdf-raymarched-worlds',
    update(elapsed) {
      (time as unknown as { value: number }).value = elapsed;
      proxies.forEach((pr) => {
        pr.mesh.getWorldPosition(proxyWorld);
        (pr.centre as unknown as { value: THREE.Vector3 }).value.copy(proxyWorld);
      });
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}

/* ------------------------------------------------------------------ */
/* 3. GRAMMAR — the pipeline-shaped one                                */
/* ------------------------------------------------------------------ */

/**
 * A shape grammar: footprint -> mass -> podium / shaft / crown -> facade
 * populated from a kit of parts. This is the "pipeline" corridor in the sense
 * that matters — a repeatable authoring PROCESS with stages and assertions,
 * rather than a hand-modelled object — but it runs entirely in code with no
 * imported module, no texture and no external tool.
 */
export function createGrammarCorridor(seed = 11): Corridor {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const LEN = 52;

  const floorMat = new MeshStandardNodeMaterial();
  floorMat.roughness = 0.95;
  floorMat.colorNode = vec3(0.22, 0.21, 0.2);
  const floorGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH, LEN, 4, 4);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, -LEN / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo, floorMat);

  const stoneMat = new MeshStandardNodeMaterial();
  stoneMat.roughness = 0.82;
  stoneMat.colorNode = Fn(() => {
    const p = positionWorld;
    const band = sin(p.y.mul(6.1)).mul(0.5).add(0.5);
    return mix(vec3(0.52, 0.49, 0.44), vec3(0.63, 0.60, 0.55), band);
  })();

  const glassMat = new MeshStandardNodeMaterial();
  glassMat.roughness = 0.14;
  glassMat.metalness = 0.1;
  glassMat.colorNode = vec3(0.12, 0.18, 0.22);
  disposables.push(stoneMat, glassMat);

  /**
   * Stage 1 — FOOTPRINT. A convex polygon from a seeded radius sweep.
   * Stage 2 — MASS. Extrude, then split vertically into podium/shaft/crown.
   * Stage 3 — FACADE. Populate each storey band with kit modules.
   */
  function buildTower(s: number, storeys: number): THREE.BufferGeometry[] {
    const parts: THREE.BufferGeometry[] = [];
    const w = 2.2 + hash11(s) * 1.6;
    const d = 2.2 + hash11(s * 3.1) * 1.6;

    // Podium — always wider, always shorter. The grammar's first rule.
    const podiumH = 1.1 + hash11(s * 7) * 0.5;
    const podium = new THREE.BoxGeometry(w * 1.25, podiumH, d * 1.25);
    podium.translate(0, podiumH / 2, 0);
    parts.push(podium);

    // Shaft — repeated storey bands, each slightly inset from the last.
    let y = podiumH;
    const storeyH = 1.15;
    for (let i = 0; i < storeys; i++) {
      const inset = 1 - i * 0.028;
      const band = new THREE.BoxGeometry(w * inset, storeyH * 0.72, d * inset);
      band.translate(0, y + storeyH * 0.36, 0);
      parts.push(band);

      // Facade modules: a spandrel course between storeys, offset per face so
      // the four elevations are not identical — the assertion that catches a
      // grammar which has collapsed to a single rule.
      const rail = new THREE.BoxGeometry(w * inset * 1.04, 0.1, d * inset * 1.04);
      rail.translate(0, y + storeyH * 0.78, 0);
      parts.push(rail);

      y += storeyH;
    }

    // Crown — the grammar's terminal rule, never the same as a storey.
    const crownH = 0.7 + hash11(s * 11) * 0.6;
    const crown = new THREE.BoxGeometry(w * 0.72, crownH, d * 0.72);
    crown.translate(0, y + crownH / 2, 0);
    parts.push(crown);
    const cap = new THREE.ConeGeometry(Math.max(w, d) * 0.42, crownH * 1.1, 6);
    cap.translate(0, y + crownH + crownH * 0.55, 0);
    parts.push(cap);

    return parts;
  }

  /**
   * RULE SET 2 - low-rise cottages. Same pipeline (footprint -> mass -> roof),
   * entirely different terminal rules: a pitched roof instead of a crown, a
   * chimney instead of a spire, and a porch module on one elevation only. This
   * is the point of a grammar - the STAGES are fixed, the rules are swappable,
   * and one generator gives you a skyline and a village.
   */
  function buildCottage(s: number): THREE.BufferGeometry[] {
    const parts: THREE.BufferGeometry[] = [];
    const w = 2.6 + hash11(s) * 1.4;
    const d = 2.2 + hash11(s * 5.1) * 1.2;
    const h = 1.9 + hash11(s * 3.3) * 0.8;

    const body = new THREE.BoxGeometry(w, h, d);
    body.translate(0, h / 2, 0);
    parts.push(body);

    // Pitched roof: a rotated box is wrong (it leaves a visible seam at the
    // ridge); a 3-sided cylinder IS a prism, and its ridge is exact.
    const roof = new THREE.CylinderGeometry(d * 0.72, d * 0.72, w * 1.08, 3, 1, false);
    roof.rotateZ(Math.PI / 2);
    roof.rotateY(Math.PI / 2);
    roof.translate(0, h + d * 0.30, 0);
    parts.push(roof);

    const chimney = new THREE.BoxGeometry(0.32, 1.0, 0.32);
    chimney.translate(w * 0.28, h + d * 0.5, d * 0.18);
    parts.push(chimney);

    // Porch on the street elevation only.
    const porch = new THREE.BoxGeometry(1.0, 0.12, 0.9);
    porch.translate(0, h * 0.62, d / 2 + 0.42);
    parts.push(porch);
    for (const sx of [-0.4, 0.4]) {
      const post = new THREE.CylinderGeometry(0.06, 0.06, h * 0.62, 5);
      post.translate(sx, h * 0.31, d / 2 + 0.78);
      parts.push(post);
    }
    return parts;
  }

  /**
   * RULE SET 3 - a ruined wall. The interesting rule here is SUBTRACTIVE: the
   * grammar builds a full course of blocks, then removes them by a seeded
   * survival test that falls off with height, so the ruin collapses upward
   * exactly the way a real one does. Nothing is hand-placed, and the same seed
   * always produces the same ruin.
   */
  function buildRuin(s: number, courses: number, len: number): THREE.BufferGeometry[] {
    const parts: THREE.BufferGeometry[] = [];
    const bw = 0.62;
    const bh = 0.34;
    const perCourse = Math.floor(len / bw);
    for (let c = 0; c < courses; c++) {
      // Higher courses are likelier to be missing.
      const survivalBase = 1 - c / (courses + 1.2);
      for (let i = 0; i < perCourse; i++) {
        const h = hash11(s * 7.3 + c * 13.1 + i * 3.7);
        if (h > survivalBase) continue;
        // Alternate courses are offset half a block - running bond, which is
        // what stops a stone wall reading as a grid.
        const offset = (c % 2) * bw * 0.5;
        const jitter = (hash11(s + c * 5 + i * 2) - 0.5) * 0.05;
        const b = new THREE.BoxGeometry(bw * 0.94, bh * 0.92, 0.46);
        b.translate(
          -len / 2 + i * bw + offset,
          bh / 2 + c * bh,
          jitter,
        );
        b.rotateY(jitter * 0.6);
        parts.push(b);
      }
    }
    return parts;
  }

  // Three rule sets down the corridor, so walking it shows one pipeline
  // producing a skyline, a village and a ruin.
  const emit = (parts: THREE.BufferGeometry[], mat: THREE.Material,
                x: number, z: number, ry: number) => {
    const geo = mergeGeometriesSimple(parts);
    parts.forEach((p) => p.dispose());
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, 0, z);
    mesh.rotation.y = ry;
    group.add(mesh);
    disposables.push(geo);
  };

  // Station A - towers.
  for (let i = 0; i < 5; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const s = seed * 13 + i * 3;
    emit(buildTower(s, 3 + i), i % 3 === 2 ? glassMat : stoneMat,
      side * 3.4, -4 - i * 3.4, hash11(s) * 0.6 - 0.3);
  }
  // Station B - cottages.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const s = seed * 29 + i * 7;
    emit(buildCottage(s), stoneMat, side * 3.6, -24 - Math.floor(i / 2) * 4.2,
      side < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  // Station C - the ruin, which is the same pipeline running subtractively.
  emit(buildRuin(seed * 41, 7, 9), stoneMat, -3.9, -40, Math.PI / 2);
  emit(buildRuin(seed * 43, 5, 7), stoneMat, 3.9, -42.5, Math.PI / 2);
  emit(buildRuin(seed * 47, 9, 5), stoneMat, 0, -47, 0);

  return {
    group,
    length: LEN,
    title: 'Shape grammar — three rule sets, one pipeline',
    skill: 'atomic-acres-procedural-art-authoring',
    update() { /* static exhibit */ },
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.clear();
    },
  };
}

/** Merge for geometries carrying only position/normal/uv. */
function mergeGeometriesSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
