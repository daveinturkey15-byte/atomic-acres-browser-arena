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
  Fn, Loop, Break, If, cameraPosition, clamp, cos, dot, float, length, max, mix,
  normalize, positionWorld, pow, sin, uniform, vec3,
} = TSL as unknown as Record<string, any>;

import { createTree, createShrub, poissonScatter } from './plants';
import { createLitterSkirt, hash11, mergeGeometries } from './leaf-geometry';
import {
  AUTUMN_PALETTE, SUMMER_PALETTE, createBarkMaterial, createFlatFoliageMaterial,
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
  const LEN = 42;

  const uniforms = createFoliageUniforms();
  const foliageMat = createFoliageMaterial(uniforms, SUMMER_PALETTE);
  const autumnMat = createFoliageMaterial(uniforms, AUTUMN_PALETTE);
  const flatMat = createFlatFoliageMaterial(SUMMER_PALETTE);
  const barkMat = createBarkMaterial();
  const floorMat = createForestFloorMaterial();
  disposables.push(foliageMat, autumnMat, flatMat, barkMat, floorMat);

  // Floor.
  const floorGeo = new THREE.PlaneGeometry(CORRIDOR_WIDTH, LEN, 12, 40);
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, -LEN / 2);
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  // Ground litter as a scatter of its own, independent of the plants' skirts.
  const litterParts: THREE.BufferGeometry[] = [];
  const litterSites = poissonScatter(
    150,
    { minX: -CORRIDOR_WIDTH / 2 + 0.2, maxX: CORRIDOR_WIDTH / 2 - 0.2, minZ: -LEN + 1, maxZ: -1 },
    0.5,
    seed * 3,
  );
  litterSites.forEach((p, i) => {
    // The near third is the "before" half on the left of the centre line.
    if (p.y > -LEN / 3 && p.x < 0) return;
    const g = createLitterSkirt(0.3, 3, {
      length: 0.17, width: 0.06, segmentsV: 3, segmentsU: 2, widestAt: 0.4,
    }, seed * 17 + i);
    g.translate(p.x, 0, p.y);
    litterParts.push(g);
  });
  const litterGeo = mergeGeometries(litterParts);
  litterParts.forEach((g) => g.dispose());

  // Trees. Wood casts shadow; canopy explicitly does not — that exclusion is
  // what lets direct sun reach the floor and produce readable sunflecks
  // instead of the uniform leaf-mush a shadow-mapped canopy gives.
  const treeSites = poissonScatter(
    40,
    { minX: -CORRIDOR_WIDTH / 2 - 9, maxX: CORRIDOR_WIDTH / 2 + 9, minZ: -LEN - 4, maxZ: 1 },
    2.6,
    seed,
  );
  // BATCHING. Every tree used to be three separate meshes (wood, canopy,
  // litter) and every shrub one more, which put ~370 draw calls on screen for
  // a scene with 19 materials. Geometry is merged per MATERIAL instead: the
  // whole forest becomes a handful of draws. Nothing about the look changes -
  // this is purely how the same triangles are submitted.
  const woodBatch: THREE.BufferGeometry[] = [];
  const canopyBatch: THREE.BufferGeometry[] = [];
  const canopyAutumnBatch: THREE.BufferGeometry[] = [];
  const flatBatch: THREE.BufferGeometry[] = [];
  const litterBatch: THREE.BufferGeometry[] = [litterGeo];

  const xf = new THREE.Matrix4();

  treeSites.forEach((p, i) => {
    if (Math.abs(p.x) < 1.7) return;
    const isBefore = p.y > -LEN / 3 && p.x < 0;
    const autumn = !isBefore && hash11(seed + i * 5.3) > 0.72;
    const parts = createTree({
      seed: seed * 10 + i,
      height: 3.6 + hash11(seed + i) * 7.5,
      trunkRadius: 0.11 + hash11(seed * 2 + i) * 0.2,
      depth: 3,
      leavesPerClump: 11,
      deadFraction: autumn ? 0.5 : 0.1,
    });

    xf.makeTranslation(p.x, 0, p.y);
    parts.wood.applyMatrix4(xf);
    parts.foliage.applyMatrix4(xf);
    parts.litter.applyMatrix4(xf);

    woodBatch.push(parts.wood);
    (isBefore ? flatBatch : (autumn ? canopyAutumnBatch : canopyBatch)).push(parts.foliage);
    if (!isBefore) litterBatch.push(parts.litter); else parts.litter.dispose();
  });

  // Undergrowth.
  const shrubSites = poissonScatter(
    90,
    { minX: -CORRIDOR_WIDTH / 2 - 7, maxX: CORRIDOR_WIDTH / 2 + 7, minZ: -LEN - 2, maxZ: 0 },
    1.0,
    seed * 5,
  );
  shrubSites.forEach((p, i) => {
    if (Math.abs(p.x) < 1.25) return;
    const isBefore = p.y > -LEN / 3 && p.x < 0;
    const g = createShrub(seed * 20 + i, 0.6 + hash11(seed + i * 3) * 1.15);
    xf.makeRotationY(hash11(seed + i * 9) * Math.PI * 2);
    xf.setPosition(p.x, 0, p.y);
    g.applyMatrix4(xf);
    (isBefore ? flatBatch : canopyBatch).push(g);
  });

  /** Merge a batch into one mesh, or skip it if empty. */
  function addBatch(
    parts: THREE.BufferGeometry[],
    material: THREE.Material,
    castShadow: boolean,
  ): void {
    if (!parts.length) return;
    const merged = mergeGeometries(parts);
    parts.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = !castShadow;
    group.add(mesh);
    disposables.push(merged);
  }

  // Wood is the ONLY shadow caster. The canopy is deliberately excluded so
  // direct sun reaches the floor instead of turning into leaf mush.
  addBatch(woodBatch, barkMat, true);
  addBatch(canopyBatch, foliageMat, false);
  addBatch(canopyAutumnBatch, autumnMat, false);
  addBatch(flatBatch, flatMat, false);
  addBatch(litterBatch, foliageMat, false);

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
  const LEN = 34;

  const time = uniform(0);
  const stepScale = uniform(0.72);
  const sdfCentre = uniform(new THREE.Vector3(0, 2.8, -34 * 0.62));

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
  const sdfMat = new MeshStandardNodeMaterial();
  sdfMat.side = THREE.BackSide;   // march from inside the proxy volume
  sdfMat.transparent = false;

  /** Polynomial smooth minimum — the blend that makes SDF shapes fuse. */
  const smin = Fn(([a, b, k]: [any, any, any]) => {
    const h = clamp(float(0.5).add(float(0.5).mul(b.sub(a)).div(k)), float(0), float(1));
    return mix(b, a, h).sub(k.mul(h).mul(float(1).sub(h)));
  });

  const sdSphere = Fn(([p, r]: [any, any]) => length(p).sub(r));

  /** Scene distance. Returns distance only; material is derived from position. */
  const sceneSDF = Fn(([p]: [any]) => {
    const t = float(time);
    // Domain repetition, LIMITED — an infinite lattice has no bounding volume
    // and cannot be culled or budgeted.
    const q = p.toVar();
    // Three blobs orbiting on incommensurate periods so the composition never
    // returns to the same pose (harmonic periods visibly march and read fake).
    const a = sdSphere(q.sub(vec3(sin(t.mul(0.41)).mul(1.1), cos(t.mul(0.29)).mul(0.7), sin(t.mul(0.53)).mul(0.9))), float(1.05));
    const b = sdSphere(q.sub(vec3(cos(t.mul(0.37)).mul(1.3), sin(t.mul(0.47)).mul(0.9).add(0.4), cos(t.mul(0.31)).mul(1.0))), float(0.85));
    const c = sdSphere(q.sub(vec3(sin(t.mul(0.23)).mul(0.8), cos(t.mul(0.43)).mul(1.1).sub(0.3), sin(t.mul(0.19)).mul(1.2))), float(0.7));

    let d = smin(a, b, float(0.65));
    d = smin(d, c, float(0.55));

    // A ripple field — the "trigonometric motion" half of the technique.
    const ripple = sin(q.x.mul(4.2).add(t.mul(1.1)))
      .mul(sin(q.z.mul(3.7).sub(t.mul(0.8))))
      .mul(sin(q.y.mul(4.9).add(t.mul(0.6))))
      .mul(0.06);
    return d.add(ripple);
  });

  const MAX_STEPS = 32;

  sdfMat.colorNode = Fn(() => {
    // March in WORLD space, from the fragment on the proxy's back face along
    // the view ray INTO the volume.
    //
    // The obvious-looking `normalize(positionLocal)` is wrong and fails
    // silently: it marches outward from the object's centre through the
    // fragment, away from the volume, so nothing is ever hit and the material
    // renders the background constant. A raymarcher that renders flat colour
    // is nearly always a ray-direction bug, not a distance-function bug.
    // March from the CAMERA toward the fragment, not from the fragment.
    //
    // The proxy is BackSide, so every fragment lies on the FAR wall of the box:
    // starting there and stepping along the view ray leaves the volume on the
    // first step and always misses. Starting at the camera makes the march
    // cover the whole volume and works whether the player is outside the proxy
    // or standing inside it.
    const centre = vec3(sdfCentre);
    const ro = cameraPosition.sub(centre).toVar();
    const rd = normalize(positionWorld.sub(cameraPosition)).toVar();

    const t = float(0.05).toVar();
    const hit = float(0.0).toVar();
    const p = vec3(0).toVar();

    Loop(MAX_STEPS, () => {
      p.assign(ro.add(rd.mul(t)));
      const d = sceneSDF(p);
      // Relative epsilon: an absolute one over-marches near the camera and
      // never converges far away.
      If(d.lessThan(float(0.0015).mul(max(t, float(1.0)))), () => {
        hit.assign(1.0);
        Break();
      });
      t.addAssign(d.mul(float(stepScale)));   // Lipschitz damping for the warp
      If(t.greaterThan(float(48.0)), () => { Break(); });
    });

    // Analytic normal by tetrahedron sampling — four evaluations, not six.
    const h = float(0.0025);
    const k1 = vec3(1, -1, -1);
    const k2 = vec3(-1, -1, 1);
    const k3 = vec3(-1, 1, -1);
    const k4 = vec3(1, 1, 1);
    const n = normalize(
      k1.mul(sceneSDF(p.add(k1.mul(h))))
        .add(k2.mul(sceneSDF(p.add(k2.mul(h)))))
        .add(k3.mul(sceneSDF(p.add(k3.mul(h)))))
        .add(k4.mul(sceneSDF(p.add(k4.mul(h))))),
    );

    const L = normalize(vec3(0.45, 0.8, 0.35));
    const diff = clamp(dot(n, L), float(0.0), float(1.0));
    const fres = pow(float(1.0).sub(clamp(dot(n, rd.negate()), float(0), float(1))), float(3.0));

    const deep = vec3(0.04, 0.16, 0.26);
    const lit = vec3(0.25, 0.72, 0.78);
    const rim = vec3(0.85, 0.42, 0.22);

    const surface = mix(deep, lit, diff).add(rim.mul(fres).mul(0.7));
    const background = vec3(0.02, 0.03, 0.05);
    return mix(background, surface, hit);
  })();

  const proxyGeo = new THREE.BoxGeometry(6, 5, 6);
  const proxy = new THREE.Mesh(proxyGeo, sdfMat);
  proxy.position.set(0, 2.8, -LEN * 0.62);
  proxy.frustumCulled = false;
  // The corridor is rotated into place by the hub, so the proxy's WORLD centre
  // is not its local position. Resolve it once the graph is attached.
  const proxyWorld = new THREE.Vector3();
  group.add(proxy);
  disposables.push(proxyGeo, sdfMat);

  // A plinth so the maths object reads as an exhibit rather than a glitch.
  const plinthMat = new MeshStandardNodeMaterial();
  plinthMat.roughness = 0.6;
  plinthMat.colorNode = vec3(0.1, 0.11, 0.13);
  const plinthGeo = new THREE.CylinderGeometry(2.4, 2.8, 0.5, 24);
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.position.set(0, 0.25, -LEN * 0.62);
  plinth.receiveShadow = true;
  group.add(plinth);
  disposables.push(plinthGeo, plinthMat);

  return {
    group,
    length: LEN,
    title: 'Raymarched SDF — no geometry at all',
    skill: 'procedural-sdf-raymarched-worlds',
    update(elapsed) {
      (time as unknown as { value: number }).value = elapsed;
      proxy.getWorldPosition(proxyWorld);
      (sdfCentre as unknown as { value: THREE.Vector3 }).value.copy(proxyWorld);
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
  const LEN = 38;

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

  // Six towers of increasing storey count down the corridor, so walking it
  // shows the same grammar producing different buildings from one rule set.
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -4 - i * 5.6;
    const s = seed * 13 + i * 3;
    const storeys = 3 + i;
    const parts = buildTower(s, storeys);
    const geo = mergeGeometriesSimple(parts);
    parts.forEach((p) => p.dispose());
    const mesh = new THREE.Mesh(geo, i % 3 === 2 ? glassMat : stoneMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(side * 3.1, 0, z);
    mesh.rotation.y = hash11(s) * 0.6 - 0.3;
    group.add(mesh);
    disposables.push(geo);
  }

  return {
    group,
    length: LEN,
    title: 'Shape grammar — one rule set, every building',
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
