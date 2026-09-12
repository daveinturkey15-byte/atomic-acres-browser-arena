/**
 * Source 38 — super-terrain: spline-field-driven foliage scatter, with the
 * mask field (WHERE foliage may grow) separated from density (HOW MUCH).
 *
 * Licence, re-verified by this lane on 2026-09-12 and CONFLICTING with the
 * register: `vibe-stack/super-terrain` LICENSE on `main` now returns HTTP 200,
 * 1,094 B, MIT, "Copyright (c) 2026 alightinastorm (x.com/alightinastorm)".
 * The register's 2026-08-31 finding was "STILL NO LICENCE FILE ... 404 on all
 * five names". The register is not edited from this lane; the conflict is
 * recorded in SOURCE_RESEARCH.json for reconciliation. Either way this file
 * copies nothing: the scatter below is written here from the general idea,
 * which is what the register's decision asked for.
 *
 * The two atoms, both demonstrated:
 *   - Placement follows an editable SPLINE FIELD rather than a painted density
 *     map, so the forest conforms to a curve an author can move.
 *   - A MASK FIELD decides where growth is admissible at all, independently of
 *     how dense it is where admitted. Separating them is the point: raising
 *     density must never push plants onto the path or into the water.
 *
 * BEFORE is uniform random scatter over the same patch — the thing this
 * replaces. AFTER is the spline field gated by the mask, with two species
 * carrying their own parameter sets and sharing one instanced material each.
 */

import { hash11 } from '../../../noise';
import {
  beforeAfterPanels,
  countDraws,
  createRng,
  disposeTree,
  type Demo,
  type DemoContext,
} from './shared';

const PATCH = 3.0;
const CANDIDATES = 900;

export type Species = {
  name: string;
  /** Relative share of admitted slots. */
  weight: number;
  minHeight: number;
  maxHeight: number;
  radius: number;
  colour: number;
};

export const SPECIES: readonly Species[] = [
  { name: 'canopy', weight: 0.28, minHeight: 0.34, maxHeight: 0.62, radius: 0.075, colour: 0x3f5f36 },
  { name: 'understory', weight: 0.72, minHeight: 0.10, maxHeight: 0.22, radius: 0.045, colour: 0x6b7f42 },
];

/**
 * The mask field: a hard yes/no about admissibility, independent of density.
 * Here it excludes a clearing and a watercourse. A density change cannot
 * override it, which is exactly why it is a separate function.
 */
export function maskField(x: number, z: number): boolean {
  const clearing = Math.hypot(x - 0.7, z - 0.5) < 0.55;
  const watercourse = Math.abs(z + Math.sin(x * 1.3) * 0.35 - 1.0) < 0.22;
  return !clearing && !watercourse;
}

/**
 * The spline field: distance to an authored curve, turned into a density. This
 * is what makes the forest re-editable — move the curve and the forest follows.
 */
export function splineDensity(
  x: number,
  z: number,
  curve: ReadonlyArray<readonly [number, number]>,
  falloff = 0.95,
): number {
  let nearest = Infinity;
  for (let i = 0; i < curve.length - 1; i += 1) {
    const [ax, az] = curve[i];
    const [bx, bz] = curve[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSquared = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
    nearest = Math.min(nearest, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return Math.max(0, 1 - nearest / falloff);
}

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  root.name = 'source-38-spline-field-scatter';
  const { before, after } = beforeAfterPanels(THREE, 3.6);

  const curve: ReadonlyArray<readonly [number, number]> = [
    [-1.35, -1.2],
    [-0.6, -0.35],
    [0.1, 0.15],
    [0.75, -0.25],
    [1.3, -1.0],
  ];

  const groundGeometry = new THREE.PlaneGeometry(PATCH, PATCH, 1, 1);
  groundGeometry.rotateX(-Math.PI / 2);
  const groundMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a4432,
    roughness: 0.98,
    metalness: 0,
  });
  before.add(new THREE.Mesh(groundGeometry, groundMaterial));
  after.add(new THREE.Mesh(groundGeometry, groundMaterial));

  // One instanced mesh per species: one material serves many plants.
  function makeSpeciesMeshes(group: import('three').Group): import('three').InstancedMesh[] {
    return SPECIES.map((species) => {
      const geometry = new THREE.ConeGeometry(species.radius, 1, 5);
      geometry.translate(0, 0.5, 0);
      const mesh = new THREE.InstancedMesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: species.colour, roughness: 0.9, metalness: 0 }),
        CANDIDATES,
      );
      mesh.name = `species-${species.name}`;
      mesh.count = 0;
      group.add(mesh);
      return mesh;
    });
  }

  const uniformMeshes = makeSpeciesMeshes(before);
  const fieldMeshes = makeSpeciesMeshes(after);

  const rng = createRng(seed);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();

  let uniformOnPath = 0;
  let fieldOnPath = 0;
  const uniformCounts = [0, 0];
  const fieldCounts = [0, 0];

  for (let i = 0; i < CANDIDATES; i += 1) {
    const x = (rng() - 0.5) * PATCH;
    const z = (rng() - 0.5) * PATCH;
    const roll = rng();
    const speciesIndex = roll < SPECIES[0].weight ? 0 : 1;
    const species = SPECIES[speciesIndex];
    const height = species.minHeight + hash11(i * 1.7) * (species.maxHeight - species.minHeight);

    position.set(x, 0, z);
    scale.set(1, height, 1);
    quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash11(i * 4.4) * Math.PI * 2);
    matrix.compose(position, quaternion, scale);

    // BEFORE: uniform random. It has no idea the clearing or the water exist.
    const uniformMesh = uniformMeshes[speciesIndex];
    uniformMesh.setMatrixAt(uniformCounts[speciesIndex], matrix);
    uniformCounts[speciesIndex] += 1;
    if (!maskField(x, z)) uniformOnPath += 1;

    // AFTER: the mask decides admissibility first; only then does the spline
    // field decide density. The order is the technique.
    if (!maskField(x, z)) continue;
    if (hash11(i * 8.9) > splineDensity(x, z, curve)) continue;
    const fieldMesh = fieldMeshes[speciesIndex];
    fieldMesh.setMatrixAt(fieldCounts[speciesIndex], matrix);
    fieldCounts[speciesIndex] += 1;
    if (!maskField(x, z)) fieldOnPath += 1;
  }

  for (let i = 0; i < SPECIES.length; i += 1) {
    uniformMeshes[i].count = uniformCounts[i];
    uniformMeshes[i].instanceMatrix.needsUpdate = true;
    fieldMeshes[i].count = fieldCounts[i];
    fieldMeshes[i].instanceMatrix.needsUpdate = true;
  }

  root.add(before, after);
  const draws = countDraws(root);

  return {
    root,
    dispose: () => disposeTree(root),
    metadata: {
      sourceId: 38,
      title: 'Spline-field foliage scatter with mask and density separated',
      method:
        'Placement density comes from distance to an authored spline rather than a painted map, '
        + 'and a separate mask field decides admissibility first, so the clearing and the '
        + 'watercourse stay clear at any density. Two species carry their own parameter sets and '
        + 'each shares one instanced material.',
      adaptation: 'adapted',
      sources: [
        'https://x.com/alightinastorm/status/2093648383202259325',
        'https://x.com/tokengremlin/status/2094265309360185606',
        'https://github.com/vibe-stack/super-terrain',
      ],
      limitation:
        'No code from the source repository is used. This is flat ground, not terrain: there is '
        + 'no sculpting, no CSG, no tunnels, no 5-LOD streaming, no 4x4 km world, no tree editor '
        + 'and no GLB export. Plants are cones, not the source\'s clump geometry or blade '
        + 'material, and there is no forest-floor blend into a terrain material. The register\'s '
        + '"30+ tree types" is an author claim and is not verified here. Licence state conflicts '
        + 'with the register — see SOURCE_RESEARCH.json.',
      localLights: [],
      counters: {
        candidates: CANDIDATES,
        uniformPlaced: uniformCounts[0] + uniformCounts[1],
        fieldPlaced: fieldCounts[0] + fieldCounts[1],
        uniformViolatingMask: uniformOnPath,
        fieldViolatingMask: fieldOnPath,
        instancedMeshes: draws.instancedMeshes,
      },
    },
  };
}

export default createDemo;
