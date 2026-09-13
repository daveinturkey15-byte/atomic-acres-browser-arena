/**
 * Source 17 — Environment-art quality bar (Cadle, `cadle.gg`).
 *
 * Fetch attempt 2026-09-12: FAILED. The request to `https://cadle.gg/` raised a
 * transport error with no HTTP status (recorded exactly in
 * `docs/technique-lab/group-a/fetch-attempts.json` and SOURCE_RESEARCH.json).
 * That matches the register's own finding: the site is a client-rendered
 * application that serves no meaningful HTML to a fetcher, and no tech blog,
 * credits page or postmortem was found.
 *
 * So Cadle's implementation remains NOT DETERMINED, and this demo is explicitly
 * NOT it. What is recorded upstream is the owner's judgement of the RESULT —
 * grass, trees and mountains, polished and smooth. The register turns that into
 * four properties to satisfy with our own implementation, and those four are
 * what this scene makes measurable:
 *   1. dense wind-animated ground cover
 *   2. layered vegetation with believable silhouettes
 *   3. readable distant terrain
 *   4. a stable budget while all three are on screen
 *
 * ANTI-CONFLATION, carried deliberately: the MIT procedural-grass and
 * procedural-landscape projects that a search for "cadle.gg tech" surfaces are a
 * DIFFERENT row, and there is no evidence Cadle uses them. This row was written
 * after the register was burned by exactly that substitution in row 15. Nothing
 * from those projects is used here.
 *
 * BEFORE: the same four elements at a density and layering that fails the bar —
 * sparse static cover, one vegetation layer, a flat distant band.
 * AFTER: instanced dense cover with per-blade deterministic wind, three
 * vegetation layers, and a distant ridge with a depth-separated silhouette.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  makeRng,
  makeValueNoise,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

interface Field {
  group: THREE_NS.Group;
  grass: THREE_NS.InstancedMesh;
  bladePhase: Float32Array;
  bladeBase: Float32Array;
}

function buildField(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  seed: number,
  dense: boolean,
): Field {
  const rng = makeRng(seed);
  const noise = makeValueNoise(seed ^ 0x7e44a1);
  const group = new THREE.Group();

  const groundGeometry = registry.track(new THREE.PlaneGeometry(2.4, 2.4, 24, 24));
  groundGeometry.rotateX(-Math.PI / 2);
  const groundPosition = groundGeometry.getAttribute('position');
  for (let i = 0; i < groundPosition.count; i += 1) {
    const x = groundPosition.getX(i);
    const z = groundPosition.getZ(i);
    groundPosition.setY(i, noise(x * 1.6 + 4, z * 1.6 + 9) * 0.08);
  }
  groundPosition.needsUpdate = true;
  groundGeometry.computeVertexNormals();
  const groundMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x46512f, roughness: 0.98 }));
  group.add(new THREE.Mesh(groundGeometry, groundMaterial));

  // 1. Ground cover. One InstancedMesh either way — the difference is density
  // and whether each blade carries its own wind phase.
  const count = dense ? 1400 : 160;
  const bladeGeometry = registry.track(new THREE.PlaneGeometry(0.02, dense ? 0.11 : 0.07, 1, 2));
  bladeGeometry.translate(0, (dense ? 0.11 : 0.07) / 2, 0);
  const bladeMaterial = registry.track(
    new THREE.MeshStandardMaterial({ color: 0x6f8c3a, roughness: 0.9, side: THREE.DoubleSide }),
  );
  const grass = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, count);
  grass.name = dense ? 'ground-cover-dense' : 'ground-cover-sparse';

  const bladePhase = new Float32Array(count);
  const bladeBase = new Float32Array(count * 3);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  for (let i = 0; i < count; i += 1) {
    const x = (rng() - 0.5) * 2.3;
    const z = (rng() - 0.5) * 2.3;
    const y = noise(x * 1.6 + 4, z * 1.6 + 9) * 0.08;
    bladeBase[i * 3] = x;
    bladeBase[i * 3 + 1] = y;
    bladeBase[i * 3 + 2] = z;
    bladePhase[i] = rng() * Math.PI * 2;
    position.set(x, y, z);
    euler.set(0, rng() * Math.PI, 0);
    quaternion.setFromEuler(euler);
    const s = 0.7 + rng() * 0.6;
    scale.set(s, s, s);
    matrix.compose(position, quaternion, scale);
    grass.setMatrixAt(i, matrix);
  }
  grass.instanceMatrix.needsUpdate = true;
  group.add(grass);

  // 2. Vegetation layers. Dense gets three silhouette tiers; sparse gets one.
  const tiers = dense ? [0.32, 0.5, 0.78] : [0.5];
  const shrubGeometry = registry.track(new THREE.IcosahedronGeometry(0.13, 0));
  const shrubMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x3f5c2c, roughness: 0.95, flatShading: true }));
  const trunkGeometry = registry.track(new THREE.CylinderGeometry(0.014, 0.022, 0.4, 6));
  const trunkMaterial = registry.track(new THREE.MeshStandardMaterial({ color: 0x50412e, roughness: 0.95 }));
  for (const tier of tiers) {
    for (let i = 0; i < (dense ? 7 : 4); i += 1) {
      const x = (rng() - 0.5) * 2.1;
      const z = (rng() - 0.5) * 2.1;
      const y = noise(x * 1.6 + 4, z * 1.6 + 9) * 0.08;
      const shrub = new THREE.Mesh(shrubGeometry, shrubMaterial);
      shrub.position.set(x, y + tier, z);
      shrub.scale.setScalar(tier * (dense ? 1.4 : 1.0));
      group.add(shrub);
      if (tier > 0.4) {
        const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
        trunk.position.set(x, y + tier * 0.5, z);
        trunk.scale.y = tier * 2;
        group.add(trunk);
      }
    }
  }

  // 3. Distant terrain. Readable means a separate silhouette at depth, not a
  // gradient painted on the ground plane.
  const ridgeSegments = dense ? 48 : 8;
  const ridgeGeometry = registry.track(new THREE.PlaneGeometry(5, 1.1, ridgeSegments, 1));
  const ridgePosition = ridgeGeometry.getAttribute('position');
  for (let i = 0; i < ridgePosition.count; i += 1) {
    if (ridgePosition.getY(i) <= 0) continue;
    const x = ridgePosition.getX(i);
    const h = dense
      ? 0.55 + noise(x * 0.9 + 21, 3) * 0.5 + noise(x * 2.7 + 5, 11) * 0.16
      : 0.55;
    ridgePosition.setY(i, h);
  }
  ridgePosition.needsUpdate = true;
  ridgeGeometry.computeVertexNormals();
  const ridgeMaterial = registry.track(
    new THREE.MeshStandardMaterial({ color: dense ? 0x5b6472 : 0x6a7180, roughness: 1, side: THREE.DoubleSide }),
  );
  const ridge = new THREE.Mesh(ridgeGeometry, ridgeMaterial);
  ridge.position.set(0, -0.05, -2.4);
  ridge.name = 'distant-ridge';
  group.add(ridge);

  return { group, grass, bladePhase, bladeBase };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();

  const sparse = buildField(THREE, registry, context.seed, false);
  const dense = buildField(THREE, registry, context.seed, true);
  sparse.group.name = 'before:sparse-static-cover-one-layer-flat-ridge';
  dense.group.name = 'after:dense-wind-animated-three-layers-readable-ridge';

  const root = sideBySide(THREE, registry, sparse.group, dense.group, 3.4);
  root.name = 'source-17:environment-art-comparator';

  // Hoisted scratch: wind is applied by mutating instance matrices in place.
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();

  const metadata = {
    sourceId: 17,
    title: 'Environment-art quality bar (Cadle)',
    method:
      'Four named comparator properties made measurable with our own implementation: dense instanced ground cover with a per-blade deterministic wind phase, three layered vegetation silhouette tiers, a distant ridge that is a separate depth silhouette rather than a painted gradient, and a declared draw/triangle budget while all three are on screen.',
    adaptation: 'adapted' as const,
    sources: [
      'https://cadle.gg/',
      'fetch attempt 2026-09-12 FAILED (transport error, no HTTP status) - see SOURCE_RESEARCH.json',
    ],
    limitation:
      "Cadle's implementation is NOT DETERMINED: the site served no fetchable content, there is no repository, published technique or licence, and what the register records is the owner's judgement of the RESULT. This scene is our own implementation of the named properties and is not Cadle's and does not claim to match it. Explicit anti-conflation: the MIT procedural-grass/landscape projects that a search surfaces are a different row and there is no evidence Cadle uses them. Frame-rate stability and rendered quality are UNVERIFIED here - no GPU job runs in this lane, so only the CPU-side budget counters below are evidence.",
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      denseBlades: dense.grass.count,
      sparseBlades: sparse.grass.count,
    },
  };

  return {
    root,
    update(time: number) {
      // Only the dense field is wind-animated; that is the comparator property.
      const grass = dense.grass;
      for (let i = 0; i < grass.count; i += 1) {
        const x = dense.bladeBase[i * 3];
        const y = dense.bladeBase[i * 3 + 1];
        const z = dense.bladeBase[i * 3 + 2];
        const phase = dense.bladePhase[i];
        const gust = 0.5 + 0.5 * Math.sin(time * 0.35 + x * 0.6 + z * 0.4);
        const lean = Math.sin(time * 2.1 + phase) * 0.18 * gust;
        position.set(x, y, z);
        euler.set(lean * 0.6, phase, lean);
        quaternion.setFromEuler(euler);
        scale.setScalar(0.7 + ((phase * 13) % 1) * 0.6);
        matrix.compose(position, quaternion, scale);
        grass.setMatrixAt(i, matrix);
      }
      grass.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
