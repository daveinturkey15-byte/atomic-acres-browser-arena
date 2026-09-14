import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

/**
 * Fit tests for the interior set: what each asset occupies against what its `house.ts` anchor
 * publishes, and whether the two corrections this lane can apply without Blender actually correct
 * anything.
 *
 * The repaired sofa bounds are **recomputed from the shipped GLB** here — the node is re-composed
 * at the corrected yaw and the asset re-unioned — so `REPAIRED_BOUNDS` in `fit.ts` is checked
 * against the bytes rather than believed. If a future re-export changes the geometry, this fails.
 */

interface PendingLoad {
  url: string;
  resolve: (gltf: { scene: THREE.Object3D }) => void;
}

const stub = vi.hoisted(() => ({ pending: [] as PendingLoad[] }));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    loadAsync(url: string): Promise<{ scene: THREE.Object3D }> {
      return new Promise((resolve) => {
        stub.pending.push({ url, resolve });
      });
    }
  },
}));

import { INTERIOR_ASSETS, INTERIOR_HERO_ID, getInteriorAsset } from './catalog';
import {
  ACCEPTED_OVERRUNS,
  FIT_NUDGE_LIMIT_M,
  INTERIOR_ANCHOR_REFERENCE,
  SOFA_PLINTH_REPAIR,
  assertInteriorFitPolicy,
  declaredAnchorBox,
  evaluateInteriorFit,
  evaluateInteriorFits,
  fitNudgeFor,
  measureOverrun,
  repairInteriorScene,
  repairedBoundsFor,
} from './fit';
import type { InteriorAnchorId } from './fit';
import { createStudioInteriorAssets } from './index';

const REPO = resolve(__dirname, '..', '..', '..');

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
}

interface GltfJson {
  nodes?: GltfNode[];
  meshes?: { primitives: { attributes: Record<string, number> }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
  scenes?: { nodes: number[] }[];
  scene?: number;
}

function readGlbJson(relative: string): GltfJson {
  const buffer = readFileSync(resolve(REPO, relative));
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;
}

/** Union of every primitive AABB with node transforms composed, optionally repairing `sofa-frame`. */
function measureBox(gltf: GltfJson, repair: boolean): THREE.Box3 {
  const box = new THREE.Box3();
  const nodes = gltf.nodes ?? [];
  const walk = (index: number, parent: THREE.Matrix4): void => {
    const node = nodes[index];
    const local = new THREE.Matrix4();
    const isDefective =
      node.name === SOFA_PLINTH_REPAIR.nodeName &&
      Math.abs(Math.abs(2 * Math.atan2((node.rotation ?? [0, 0, 0, 1])[1], (node.rotation ?? [0, 0, 0, 1])[3])) - Math.PI) <
        SOFA_PLINTH_REPAIR.toleranceRadians;
    if (node.matrix) {
      local.fromArray(node.matrix);
    } else {
      const quaternion =
        repair && isDefective
          ? new THREE.Quaternion().setFromEuler(new THREE.Euler(0, SOFA_PLINTH_REPAIR.correctedYawRadians, 0))
          : new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]);
      local.compose(
        new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
        quaternion,
        new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
      );
    }
    const world = new THREE.Matrix4().multiplyMatrices(parent, local);
    if (node.mesh !== undefined) {
      for (const primitive of (gltf.meshes ?? [])[node.mesh].primitives) {
        const accessor = (gltf.accessors ?? [])[primitive.attributes.POSITION];
        box.union(
          new THREE.Box3(
            new THREE.Vector3().fromArray(accessor.min ?? []),
            new THREE.Vector3().fromArray(accessor.max ?? []),
          ).applyMatrix4(world),
        );
      }
    }
    for (const child of node.children ?? []) walk(child, world);
  };
  for (const root of gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? []) walk(root, new THREE.Matrix4());
  return box;
}

const sofaGltf = readGlbJson('public/assets/world-studio/blender/interiors/interior-prop-sofa.glb');

describe('anchor footprints and measured overrun', () => {
  it('derives the footprint box from the anchor yaw, not from a spelled rectangle', () => {
    // `sofa` is 2.2 x 0.9 at -90 deg, so the long side runs along Z.
    expect(declaredAnchorBox('sofa').min).toEqual([5.4 - 0.45, -4.4 - 1.1]);
    expect(declaredAnchorBox('sofa').max).toEqual([5.4 + 0.45, -4.4 + 1.1]);
    // `dining-table` is unturned: long side along X.
    expect(declaredAnchorBox('dining-table').min).toEqual([-3.4 - 0.8, -3.4 - 0.5]);
    expect(Object.keys(INTERIOR_ANCHOR_REFERENCE)).toHaveLength(5);
  });

  it('pins the per-face overrun of all five anchored props in the shipped bytes', () => {
    // Wave 3 recorded overrun as a SPAN difference, which reported the credenza as -0.018 x -0.040
    // and therefore as fitting. It does not fit: it is 0.482 m deep inside a 0.500 m footprint and
    // sits 12 mm proud of the front face. Per-face is the number that decides whether furniture
    // crosses a wall line, so it is the number pinned here.
    const worstFace: Record<string, number> = {
      'interior-prop-sofa': 0.65,
      'interior-prop-coffee-table': 0.07,
      'interior-prop-credenza': 0.012,
      'interior-prop-kitchen-run': 0.02,
      'interior-prop-dinette': 0.5554,
    };
    for (const [id, expected] of Object.entries(worstFace)) {
      const asset = getInteriorAsset(id);
      const overrun = measureOverrun(asset.bounds, asset.anchorId as InteriorAnchorId);
      expect(overrun.worst, `${id} worst face overrun`).toBeCloseTo(expected, 3);
      expect(overrun.worst, `${id} overruns on at least one face`).toBeGreaterThan(0);
    }
    // All five, not four: the span measure hid one.
    expect(Object.keys(worstFace)).toHaveLength(5);
  });
});

describe('the sofa plinth repair, measured from the shipped GLB', () => {
  it('finds the defect it claims to fix, at the yaw it claims', () => {
    const frame = (sofaGltf.nodes ?? []).find((node) => node.name === SOFA_PLINTH_REPAIR.nodeName);
    expect(frame, 'sofa-frame node').toBeDefined();
    const yaw = 2 * Math.atan2((frame!.rotation ?? [0, 0, 0, 1])[1], (frame!.rotation ?? [0, 0, 0, 1])[3]);
    expect(Math.abs(yaw)).toBeCloseTo(Math.PI, 3);
  });

  it('recomputes the repaired bounds from the bytes and they match what fit.ts publishes', () => {
    const before = measureBox(sofaGltf, false);
    const after = measureBox(sofaGltf, true);
    const pinned = repairedBoundsFor('interior-prop-sofa')!;
    for (const axis of [0, 1, 2] as const) {
      expect(after.min.getComponent(axis), `repaired min axis ${axis}`).toBeCloseTo(pinned.min[axis], 3);
      expect(after.max.getComponent(axis), `repaired max axis ${axis}`).toBeCloseTo(pinned.max[axis], 3);
    }
    // The plinth was the whole X overrun: 2.200 m across the footprint's 0.900 m, down to 0.905.
    expect(before.max.x - before.min.x, 'X span before').toBeCloseTo(2.2, 3);
    expect(after.max.x - after.min.x, 'X span after').toBeCloseTo(0.9047, 3);
    // Z is untouched by the repair, and is the arms - see ACCEPTED_OVERRUNS.
    expect(after.max.z - after.min.z, 'Z span after').toBeCloseTo(2.51, 3);
  });

  it('narrows the hero composition too, because the plinth was the whole set\'s eastmost geometry', () => {
    // Easy to assume the hero is unaffected - it is 13 m wide and the plinth is 2.2 m. It is not:
    // the crosswise plinth reached x = 6.500, which is the hero's published max X. Repaired, the
    // whole set is 0.645 m narrower than every document in this lane says.
    const hero = readGlbJson(`public/${getInteriorAsset(INTERIOR_HERO_ID).path}`);
    const after = measureBox(hero, true);
    expect(getInteriorAsset(INTERIOR_HERO_ID).bounds.max[0], 'catalog, from the shipped bytes').toBeCloseTo(6.5, 3);
    expect(after.max.x, 'hero max X after the repair').toBeCloseTo(5.8547, 3);
    expect(repairedBoundsFor(INTERIOR_HERO_ID)!.max[0]).toBeCloseTo(after.max.x, 3);
    // Nothing else moves: Z and Y are the plinth's short axes and other furniture sets them.
    expect(after.max.z).toBeCloseTo(7.42, 3);
    expect(after.min.x).toBeCloseTo(-6.59, 3);
  });

  it('takes the worst face from 0.650 m outside the footprint to 0.155 m', () => {
    const asset = getInteriorAsset('interior-prop-sofa');
    const before = measureOverrun(asset.bounds, 'sofa');
    const after = measureOverrun(repairedBoundsFor(asset.id)!, 'sofa');
    expect(before.worst).toBeCloseTo(0.65, 3);
    expect(after.worst).toBeCloseTo(0.155, 3);
    // X fits after the repair, to within the 4-decimal precision the catalog publishes.
    expect(Math.max(after.minX, after.maxX), 'X faces after repair').toBeLessThan(0.005);
    // And the remaining overrun is honestly Z, not silently dropped.
    expect(Math.max(after.minZ, after.maxZ)).toBeCloseTo(0.155, 3);
  });
});

describe('the bounded fit nudge', () => {
  it('brings the credenza inside its footprint with a 12 mm shift', () => {
    const asset = getInteriorAsset('interior-prop-credenza');
    const nudge = fitNudgeFor(asset.bounds, 'tv-unit')!;
    expect(nudge, 'credenza nudge').not.toBeNull();
    expect(Math.hypot(nudge[0], nudge[2])).toBeCloseTo(0.012, 3);
    expect(nudge[1], 'a fit nudge never changes height').toBe(0);
    const shifted = {
      min: [asset.bounds.min[0] + nudge[0], asset.bounds.min[1], asset.bounds.min[2] + nudge[2]] as const,
      max: [asset.bounds.max[0] + nudge[0], asset.bounds.max[1], asset.bounds.max[2] + nudge[2]] as const,
    };
    expect(measureOverrun(shifted, 'tv-unit').worst, 'credenza after nudge').toBeLessThanOrEqual(0);
  });

  it('refuses to nudge an asset that is simply too big for its footprint', () => {
    // Translating these hides an overrun on one face by creating it on the other. The honest
    // answer is that the geometry is larger than the anchor, which only Blender can change.
    expect(fitNudgeFor(getInteriorAsset('interior-prop-coffee-table').bounds, 'coffee-table')).toBeNull();
    expect(fitNudgeFor(getInteriorAsset('interior-prop-kitchen-run').bounds, 'kitchen-run')).toBeNull();
    expect(fitNudgeFor(getInteriorAsset('interior-prop-dinette').bounds, 'dining-table')).toBeNull();
    // And the sofa is only nudgeable after the rotation repair - never before it.
    expect(fitNudgeFor(getInteriorAsset('interior-prop-sofa').bounds, 'sofa')).toBeNull();
  });

  it('refuses a shift larger than the fit limit rather than teleporting furniture', () => {
    const declared = declaredAnchorBox('coffee-table');
    const far = {
      min: [declared.min[0] + 1, 0, declared.min[1] + 0.05] as const,
      max: [declared.max[0] + 1, 0.5, declared.max[1] - 0.05] as const,
    };
    expect(fitNudgeFor(far, 'coffee-table'), '1 m is a placement bug, not a fit correction').toBeNull();
    expect(FIT_NUDGE_LIMIT_M).toBeLessThan(0.05);
  });
});

describe('fit policy over the whole catalog', () => {
  it('classifies every asset and leaves nothing unaccepted', () => {
    const fits = evaluateInteriorFits();
    expect(fits).toHaveLength(10);
    expect(fits.filter((fit) => fit.status === 'unanchored')).toHaveLength(5);
    expect(evaluateInteriorFit(getInteriorAsset('interior-prop-credenza')).status).toBe('fits-after-correction');
    expect(fits.filter((fit) => fit.status === 'unaccepted-overrun')).toEqual([]);
    expect(() => assertInteriorFitPolicy()).not.toThrow();
  });

  it('fails when an overrun grows past what was measured, instead of widening the pin', () => {
    const dinette = getInteriorAsset('interior-prop-dinette');
    const grown = {
      ...dinette,
      bounds: { min: dinette.bounds.min, max: [dinette.bounds.max[0] + 0.5, dinette.bounds.max[1], dinette.bounds.max[2]] as const },
    };
    expect(evaluateInteriorFit(grown).status).toBe('unaccepted-overrun');
  });

  it('records a reason for every accepted overrun and accepts nothing that is already corrected', () => {
    for (const [id, accepted] of Object.entries(ACCEPTED_OVERRUNS)) {
      expect(getInteriorAsset(id).anchorId, `${id} is anchored`).not.toBeNull();
      expect(accepted.why.length, `${id} reason`).toBeGreaterThan(40);
      expect(accepted.worst, `${id} accepted amount`).toBeGreaterThan(0);
    }
    // The 0.650 m plinth overrun is NOT in the accepted list: it is repaired, not tolerated.
    expect(ACCEPTED_OVERRUNS['interior-prop-sofa'].worst).toBeCloseTo(0.155, 3);
    expect(ACCEPTED_OVERRUNS['interior-prop-credenza']).toBeUndefined();
  });
});

describe('repairInteriorScene applied to a loaded subtree', () => {
  const defectiveSofa = (yaw: number): THREE.Group => {
    const scene = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    frame.name = SOFA_PLINTH_REPAIR.nodeName;
    frame.rotation.y = yaw;
    const arm = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    arm.name = 'sofa-arm-l';
    arm.rotation.y = -Math.PI / 2;
    scene.add(frame, arm);
    return scene;
  };

  it('rotates the defective plinth and reports it', () => {
    const scene = defectiveSofa(Math.PI);
    const applied = repairInteriorScene(scene, 'interior-prop-sofa');
    expect(scene.getObjectByName(SOFA_PLINTH_REPAIR.nodeName)!.rotation.y).toBeCloseTo(-Math.PI / 2, 6);
    expect(applied.join(' ')).toContain('sofa-frame');
    expect(scene.getObjectByName('sofa-arm-l')!.rotation.y, 'siblings untouched').toBeCloseTo(-Math.PI / 2, 6);
  });

  it('leaves a re-exported, already-correct plinth alone', () => {
    // Forward safety: the repair is conditional on measuring the defect, so when Blender finally
    // fixes `build_interiors.py` this does not rotate a correct node a third time.
    const scene = defectiveSofa(-Math.PI / 2);
    const applied = repairInteriorScene(scene, 'interior-prop-sofa');
    expect(scene.getObjectByName(SOFA_PLINTH_REPAIR.nodeName)!.rotation.y).toBeCloseTo(-Math.PI / 2, 6);
    expect(applied.filter((entry) => entry.includes('sofa-frame'))).toEqual([]);
  });

  it('never nudges the hero, because moving it would move the whole set', () => {
    const scene = defectiveSofa(Math.PI);
    const applied = repairInteriorScene(scene, INTERIOR_HERO_ID);
    expect(scene.position.x, 'hero stays at the house origin').toBe(0);
    expect(applied.filter((entry) => entry.includes('nudged'))).toEqual([]);
  });
});

describe('the loader applies the corrections before anything is attached', () => {
  const flush = async (): Promise<void> => {
    await Promise.resolve();
    await Promise.resolve();
  };

  it('repairs the plinth on the way in and reports what it did', async () => {
    stub.pending.length = 0;
    const assets = createStudioInteriorAssets({ assetIds: ['interior-prop-sofa'], baseUrl: '/' });
    const scene = new THREE.Group();
    const frame = new THREE.Object3D();
    frame.name = SOFA_PLINTH_REPAIR.nodeName;
    frame.rotation.y = Math.PI;
    scene.add(frame);
    stub.pending[0].resolve({ scene });
    await assets.ready;
    await flush();
    expect(frame.rotation.y).toBeCloseTo(-Math.PI / 2, 6);
    expect(assets.repairs.some((entry) => entry.includes('ADAPTER M1'))).toBe(true);
    assets.dispose();
  });

  it('nudges the credenza inside its footprint and says so', async () => {
    stub.pending.length = 0;
    const assets = createStudioInteriorAssets({ assetIds: ['interior-prop-credenza'], baseUrl: '/' });
    const scene = new THREE.Group();
    stub.pending[0].resolve({ scene });
    await assets.ready;
    expect(scene.position.x).toBeCloseTo(-0.012, 3);
    expect(assets.repairs.join(' ')).toContain('nudged 12 mm');
    assets.dispose();
  });

  it('loads exactly what the file contains when repairs are switched off', async () => {
    stub.pending.length = 0;
    const assets = createStudioInteriorAssets({ assetIds: ['interior-prop-sofa'], baseUrl: '/', repairFit: false });
    const scene = new THREE.Group();
    const frame = new THREE.Object3D();
    frame.name = SOFA_PLINTH_REPAIR.nodeName;
    frame.rotation.y = Math.PI;
    scene.add(frame);
    stub.pending[0].resolve({ scene });
    await assets.ready;
    expect(frame.rotation.y).toBeCloseTo(Math.PI, 6);
    expect(assets.repairs).toEqual([]);
    assets.dispose();
  });

  it('still repairs a raw path, and does not nudge one it cannot identify', async () => {
    stub.pending.length = 0;
    const assets = createStudioInteriorAssets({
      assetPaths: ['assets/world-studio/blender/interiors/interior-prop-credenza.glb', 'assets/elsewhere/unknown.glb'],
      baseUrl: '/',
    });
    const known = new THREE.Group();
    const unknown = new THREE.Group();
    stub.pending[0].resolve({ scene: known });
    stub.pending[1].resolve({ scene: unknown });
    await assets.ready;
    expect(known.position.x, 'a catalog path still resolves to its entry').toBeCloseTo(-0.012, 3);
    expect(unknown.position.x, 'an unknown path is left where it is').toBe(0);
    assets.dispose();
  });

  it('releases a repaired payload that arrives after dispose instead of attaching it', async () => {
    stub.pending.length = 0;
    const assets = createStudioInteriorAssets({ assetIds: ['interior-prop-sofa'], baseUrl: '/' });
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.MeshStandardMaterial();
    const disposals = { geometry: 0, material: 0 };
    geometry.addEventListener('dispose', () => (disposals.geometry += 1));
    material.addEventListener('dispose', () => (disposals.material += 1));
    const scene = new THREE.Group();
    const frame = new THREE.Mesh(geometry, material);
    frame.name = SOFA_PLINTH_REPAIR.nodeName;
    frame.rotation.y = Math.PI;
    scene.add(frame);
    assets.dispose();
    stub.pending[0].resolve({ scene });
    await assets.ready;
    expect(disposals, 'freed once, not attached and not repaired into the graph').toEqual({ geometry: 1, material: 1 });
    expect(assets.root.children).toHaveLength(0);
    expect(assets.repairs, 'nothing to report for a payload that never landed').toEqual([]);
  });
});

describe('the Blender source, which is now ahead of the shipped bytes', () => {
  const script = readFileSync(
    resolve(REPO, 'scripts/blender/world-studio/interiors/build_interiors.py'),
    'utf8',
  );

  it('no longer applies the sofa yaw twice', () => {
    // The defect was `frame.rotation_euler.z = yaw` followed by `_rotate_group(parts, ..., yaw)`,
    // which does `+= yaw` over every part. Asserted as "the frame gets no yaw of its own, and the
    // group rotation is still there", so deleting the group rotation instead would fail too.
    const sofa = script.slice(script.indexOf('def build_sofa'), script.indexOf('def build_coffee_table'));
    expect(sofa).not.toMatch(/frame\.rotation_euler\.z\s*=\s*yaw/);
    expect(sofa).toMatch(/_rotate_group\(parts, _p\(lx, 0, lz\), yaw\)/);
    expect(sofa.match(/rotation_euler\.z\s*=\s*yaw/g), 'no part may set the yaw itself').toBeNull();
  });

  it('authors the coffee-table top inside the footprint its anchor publishes', () => {
    const table = script.slice(script.indexOf('def build_coffee_table'), script.indexOf('def build_credenza'));
    const top = table.match(/coffee-table.*?-top.*?\(([\d.]+), ([\d.]+), [\d.]+\)/s);
    expect(top, 'coffee-table top dimensions').not.toBeNull();
    const [width, depth] = [Number(top![1]), Number(top![2])];
    const footprint = INTERIOR_ANCHOR_REFERENCE['coffee-table'].footprint;
    expect(width, 'authored length inside the anchor').toBeLessThanOrEqual(footprint[0]);
    expect(depth, 'authored depth inside the anchor').toBeLessThanOrEqual(footprint[1]);
    // The surfboard pinch normalises by the top's own half-length; if the two drift apart the
    // profile silently changes shape, so they are bound to each other here.
    const pinch = table.match(/abs\(vert\.co\.x\) \/ ([\d.]+)\)/);
    expect(Number(pinch![1]), 'pinch half-length follows the top length').toBeCloseTo(width / 2, 3);
  });

  it('is honest that the script is ahead of the GLBs it describes', () => {
    // Both fixes above need a Blender run to reach the bytes, and this lane had none. Until then
    // the catalog hashes describe geometry the script no longer produces, and the runtime repair
    // is what makes the shipped sofa fit-safe. If someone re-exports without updating this, the
    // sofa test in `catalog.test.ts` that pins the 180 deg defect fails - which is the intended
    // alarm, not a regression.
    expect(measureBox(sofaGltf, false).max.x - measureBox(sofaGltf, false).min.x).toBeCloseTo(2.2, 3);
    expect(getInteriorAsset('interior-prop-coffee-table').bounds.max[0] - getInteriorAsset('interior-prop-coffee-table').bounds.min[0]).toBeCloseTo(1.34, 3);
  });
});

describe('what the fit module does not claim', () => {
  it('is presentation-only and produces no collider for the footprints it measures', () => {
    const source = readFileSync(resolve(__dirname, 'fit.ts'), 'utf8');
    expect(source).not.toMatch(/BallisticMaterial|StudioInteriorSolid|createStudioInteriors\(/);
    // ADAPTER M3 is unchanged by this wave: the procedural kit still owns collision, and the five
    // filtered anchors still lose their solids. A fit correction moves dressing, not authority.
    expect(source).toMatch(/procedural kit keeps ballistic authority/);
  });

  it('has not re-exported anything: every asset still measures what the catalog publishes', () => {
    for (const asset of INTERIOR_ASSETS.slice(0, 2)) {
      const measuredBox = measureBox(readGlbJson(`public/${asset.path}`), false);
      for (const axis of [0, 1, 2] as const) {
        expect(measuredBox.min.getComponent(axis), `${asset.id} min ${axis}`).toBeCloseTo(asset.bounds.min[axis], 3);
        expect(measuredBox.max.getComponent(axis), `${asset.id} max ${axis}`).toBeCloseTo(asset.bounds.max[axis], 3);
      }
    }
  });
});
