/**
 * map3/plants.ts — whole plants assembled from leaf sprays.
 *
 * A tree here is not a cone and not an icosahedron. It is a tapered trunk, a
 * recursive branch skeleton, and leaf clumps hung on the branch TIPS — which is
 * where leaves actually are. That last point is most of why our current
 * canopies read as solid volumes: a filled blob has leaves in its interior
 * where no light reaches and no silhouette is formed, so it costs geometry to
 * produce the exact thing that makes it look artificial. Hanging clumps on tips
 * gives a broken, light-permeable silhouette for fewer triangles.
 *
 * Every plant carries its own litter skirt (see leaf-geometry.ts) so it can
 * never disagree with the ground it stands on.
 */
import * as THREE from 'three';
import {
  createLeafSpray,
  createLitterSkirt,
  hash11,
  mergeGeometries,
  type LeafOptions,
} from './leaf-geometry';

export interface TreeParts {
  /** Trunk and branches — the only part that casts shadows. */
  wood: THREE.BufferGeometry;
  /** Leaf clumps — deliberately excluded from the shadow map. */
  foliage: THREE.BufferGeometry;
  /** Fallen material around the base. */
  litter: THREE.BufferGeometry;
  /** Total height in metres, for placement. */
  height: number;
}

interface Branch {
  start: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  radius: number;
  depth: number;
}

export interface TreeOptions {
  seed?: number;
  height?: number;
  trunkRadius?: number;
  /** Recursion depth. 3 gives a readable skeleton without exploding counts. */
  depth?: number;
  /** Leaves per clump at a branch tip. */
  leavesPerClump?: number;
  leaf?: Partial<LeafOptions>;
  /** Radial segments on trunk/branch cylinders. */
  radialSegments?: number;
  /** 0..1 — how much of the canopy is senescent. */
  deadFraction?: number;
  /** Winter: keep the skeleton, drop the canopy. */
  bare?: boolean;
}

const DEFAULT_LEAF: LeafOptions = {
  length: 0.72, width: 0.30, segmentsV: 3, segmentsU: 2,
  droop: 0.6, cup: 0.38, twist: 0.28, asymmetry: 0.2, widestAt: 0.4,
};

/**
 * Build one tree. Returns three geometries rather than a Group so the caller
 * decides shadow-casting per part — which is the whole point: wood casts,
 * canopy does not.
 */
export function createTree(opts: TreeOptions = {}): TreeParts {
  const seed = opts.seed ?? 1;
  const height = opts.height ?? 7.5;
  const trunkRadius = opts.trunkRadius ?? 0.22;
  const depth = opts.depth ?? 3;
  const leavesPerClump = opts.leavesPerClump ?? 11;
  const radialSegments = opts.radialSegments ?? 5;
  const leaf: LeafOptions = { ...DEFAULT_LEAF, ...opts.leaf };

  const woodParts: THREE.BufferGeometry[] = [];
  const clumpSites: { pos: THREE.Vector3; scale: number }[] = [];
  let h = 0;

  const queue: Branch[] = [{
    start: new THREE.Vector3(0, 0, 0),
    dir: new THREE.Vector3(0, 1, 0),
    length: height * 0.42,
    radius: trunkRadius,
    depth: 0,
  }];

  let counter = 0;
  while (queue.length) {
    const b = queue.shift()!;
    counter++;

    const end = b.start.clone().addScaledVector(b.dir, b.length);
    h = Math.max(h, end.y);

    // Tapered segment. A cylinder with equal ends is the other thing that
    // makes procedural trees read as tubes; real wood narrows hard.
    const geo = new THREE.CylinderGeometry(
      b.radius * 0.68, b.radius, b.length, radialSegments, 1, false,
    );
    // Cylinders are built along +Y; align to the branch direction.
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0), b.dir.clone().normalize(),
    );
    const mid = b.start.clone().addScaledVector(b.dir, b.length * 0.5);
    geo.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    woodParts.push(stripToWood(geo));

    if (b.depth >= depth) {
      clumpSites.push({ pos: end, scale: 1 - b.depth * 0.12 });
      continue;
    }

    // Two or three children, splayed and shortened.
    const kids = 2 + (hash11(seed * 3.1 + counter * 7.7) > 0.62 ? 1 : 0);
    for (let i = 0; i < kids; i++) {
      const h0 = hash11(seed * 9.7 + counter * 13.3 + i * 2.9);
      const h1 = hash11(seed * 21.1 + counter * 5.9 + i * 8.3);
      const yaw = (i / kids) * Math.PI * 2 + h0 * 1.3;
      const splay = 0.42 + h1 * 0.5;

      const dir = new THREE.Vector3(
        Math.cos(yaw) * Math.sin(splay),
        Math.cos(splay),
        Math.sin(yaw) * Math.sin(splay),
      ).normalize();
      // Blend toward the parent direction so branches keep the tree's habit.
      dir.lerp(b.dir, 0.28).normalize();

      queue.push({
        start: end,
        dir,
        length: b.length * (0.62 + h0 * 0.16),
        radius: b.radius * 0.62,
        depth: b.depth + 1,
      });
    }
  }

  // Canopy: one leaf spray per branch tip.
  const foliageParts: THREE.BufferGeometry[] = [];
  if (!opts.bare) {
    clumpSites.forEach((site, i) => {
      const spray = createLeafSpray({
        count: leavesPerClump,
        radius: 0.78 * site.scale,
        height: 0.5 * site.scale,
        seed: seed * 100 + i,
        leaf,
        deadFraction: opts.deadFraction ?? 0.1,
        pitch: [0.05, 1.15],
      });
      spray.translate(site.pos.x, site.pos.y, site.pos.z);
      foliageParts.push(spray);
    });
  }

  const litter = createLitterSkirt(
    trunkRadius * 7.5,
    opts.bare ? 14 : 9,
    leaf,
    seed * 7 + 3,
  );

  return {
    wood: mergeGeometries(woodParts),
    foliage: foliageParts.length ? mergeGeometries(foliageParts) : new THREE.BufferGeometry(),
    litter,
    height: h,
  };
}

/**
 * Cylinder geometry arrives with position/normal/uv only. The foliage
 * attribute set is uniform across the scene so one merge path serves both;
 * wood simply carries zeroes for the leaf attributes.
 */
function stripToWood(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const count = g.getAttribute('position').count;
  const zeros = new Float32Array(count);
  g.setAttribute('aSpan', new THREE.BufferAttribute(zeros.slice(), 1));
  g.setAttribute('aSide', new THREE.BufferAttribute(zeros.slice(), 1));
  g.setAttribute('aDead', new THREE.BufferAttribute(zeros.slice(), 1));
  if (!g.getIndex()) {
    const idx: number[] = [];
    for (let i = 0; i < count; i++) idx.push(i);
    g.setIndex(idx);
  }
  return g;
}

/**
 * A low fern/shrub: a spray straight out of the ground with its own skirt.
 * These are what fill the mid-ground; without them a forest is trunks and air.
 */
export function createShrub(seed = 1, scale = 1): THREE.BufferGeometry {
  const leaf: LeafOptions = {
    length: 0.6 * scale, width: 0.16 * scale, segmentsV: 3, segmentsU: 2,
    droop: 0.95, cup: 0.42, twist: 0.4, asymmetry: 0.28, widestAt: 0.35,
  };
  const spray = createLeafSpray({
    count: 9, radius: 0.36 * scale, height: 0.16 * scale,
    seed, leaf, deadFraction: 0.16, pitch: [0.55, 1.35],
  });
  const skirt = createLitterSkirt(0.4 * scale, 4, leaf, seed + 11);
  return mergeGeometries([spray, skirt]);
}

/**
 * Scatter helper with a blue-noise-ish rejection so plants do not clump into
 * the visible grid pattern a naive random scatter produces.
 */
export function poissonScatter(
  count: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
  minDistance: number,
  seed = 1,
): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  const min2 = minDistance * minDistance;
  let tries = 0;
  let i = 0;
  while (out.length < count && tries < count * 40) {
    const hx = hash11(seed * 13.7 + i * 3.11);
    const hz = hash11(seed * 29.3 + i * 7.53);
    i++;
    tries++;
    const x = bounds.minX + hx * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + hz * (bounds.maxZ - bounds.minZ);
    let ok = true;
    for (const p of out) {
      const dx = p.x - x;
      const dz = p.y - z;
      if (dx * dx + dz * dz < min2) { ok = false; break; }
    }
    if (ok) out.push(new THREE.Vector2(x, z));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Additional archetypes — a forest of one tree species reads as       */
/* wallpaper no matter how good that one tree is.                      */
/* ------------------------------------------------------------------ */

/**
 * Conifer. Needles are the opposite problem to broadleaves: individually they
 * are far too small to be geometry, so the readable unit is the SPRAY, not the
 * needle. Each spray is a long narrow leaf card with heavy droop and near-zero
 * width taper, which at any real viewing distance reads as a needle bundle for
 * one twelfth of the triangles.
 */
export function createConifer(opts: TreeOptions = {}): TreeParts {
  const seed = opts.seed ?? 1;
  const height = opts.height ?? 11;
  const trunkRadius = opts.trunkRadius ?? 0.24;
  const woodParts: THREE.BufferGeometry[] = [];
  const foliageParts: THREE.BufferGeometry[] = [];

  // A single straight leader — conifers do not fork like broadleaves, and
  // forking them is the classic tell of a tree generator with one rule.
  const trunk = new THREE.CylinderGeometry(trunkRadius * 0.16, trunkRadius, height, 6, 1, false);
  trunk.translate(0, height / 2, 0);
  woodParts.push(stripToWood(trunk));

  const needle: LeafOptions = {
    length: 0.5, width: 0.035, segmentsV: 3, segmentsU: 2,
    droop: 1.15, cup: 0.15, twist: 0.1, asymmetry: 0.05, widestAt: 0.5,
  };

  // Whorls of branches, shorter toward the top: the silhouette IS the species.
  const whorls = 9;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (let w = 0; w < whorls; w++) {
    const f = w / (whorls - 1);
    const y = height * (0.22 + f * 0.74);
    const reach = (1 - f) * height * 0.2 + 0.35;
    const perWhorl = 5 + Math.floor(hash11(seed + w) * 3);
    for (let i = 0; i < perWhorl; i++) {
      const yaw = (i / perWhorl) * Math.PI * 2 + hash11(seed * 3 + w * 7 + i) * 0.9;
      const droop = 0.35 + f * 0.25;

      const branch = new THREE.CylinderGeometry(0.012, 0.045, reach, 4, 1, false);
      branch.translate(0, reach / 2, 0);
      e.set(Math.PI / 2 - droop, yaw, 0);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(0, y, 0), q, new THREE.Vector3(1, 1, 1));
      branch.applyMatrix4(m);
      woodParts.push(stripToWood(branch));

      const spray = createLeafSpray({
        count: 9, radius: reach * 0.5, height: 0.1,
        seed: seed * 40 + w * 11 + i, leaf: needle,
        deadFraction: 0.05, pitch: [0.7, 1.5],
      });
      spray.applyMatrix4(
        new THREE.Matrix4().makeTranslation(
          Math.cos(yaw) * reach * 0.62, y - 0.1, Math.sin(yaw) * reach * 0.62,
        ),
      );
      foliageParts.push(spray);
    }
  }

  return {
    wood: mergeGeometries(woodParts),
    foliage: mergeGeometries(foliageParts),
    litter: createLitterSkirt(trunkRadius * 6, 9, needle, seed * 5 + 2),
    height,
  };
}

/**
 * A fallen log with its own moss-and-litter bed. Deadwood on the floor is what
 * makes a forest read as having a HISTORY rather than having been placed a
 * second ago, and it is nearly free: one tapered cylinder plus a skirt.
 */
export function createFallenLog(seed = 1, length = 4.2): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const r = 0.18 + hash11(seed) * 0.16;
  const log = new THREE.CylinderGeometry(r * 0.72, r, length, 7, 1, false);
  log.rotateZ(Math.PI / 2);
  log.rotateY(hash11(seed * 3) * 0.5 - 0.25);
  log.translate(0, r * 0.85, 0);
  parts.push(stripToWood(log));

  // A couple of broken stubs so it is not a pipe.
  for (let i = 0; i < 3; i++) {
    const h = hash11(seed * 7 + i * 3.3);
    const stub = new THREE.CylinderGeometry(0.03, 0.07, 0.3 + h * 0.5, 4, 1, false);
    const e = new THREE.Euler(h * 1.2 - 0.2, h * 6.28, 0.6 + h);
    stub.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3((h - 0.5) * length * 0.8, r * 1.1, (h - 0.5) * 0.3),
      new THREE.Quaternion().setFromEuler(e), new THREE.Vector3(1, 1, 1),
    ));
    parts.push(stripToWood(stub));
  }

  parts.push(createLitterSkirt(length * 0.42, 8, {
    length: 0.2, width: 0.07, segmentsV: 3, segmentsU: 2, widestAt: 0.4,
  }, seed * 13));
  return mergeGeometries(parts);
}

/**
 * Grass tuft: narrow blades with a strong arch. Distinct from the shrub only
 * in proportion, which is the point — one leaf primitive, many plants.
 */
export function createGrassTuft(seed = 1, scale = 1): THREE.BufferGeometry {
  return createLeafSpray({
    count: 7, radius: 0.1 * scale, height: 0.05 * scale, seed,
    leaf: {
      length: 0.44 * scale, width: 0.028 * scale, segmentsV: 3, segmentsU: 2,
      droop: 1.35, cup: 0.6, twist: 0.55, asymmetry: 0.1, widestAt: 0.3,
    },
    deadFraction: 0.2, pitch: [0.05, 0.55],
  });
}
