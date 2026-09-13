/**
 * Source 29 - Three.js skills collection (CloudAI-X/threejs-skills).
 *
 * Primary source, re-read at the pinned revision on 2026-09-12 (cached outside the
 * repository, sha256 in SOURCE_RESEARCH.json):
 *   https://github.com/CloudAI-X/threejs-skills @ b1c623076c661fc9b03dac19292e825a5d106823
 *   skills/threejs-geometry/SKILL.md (13,829 B, all 548 lines read IN FULL this session).
 *
 * LICENCE POSITION - load-bearing: the repository has NO licence (our own probe at the
 * pinned revision returned HTTP 404). All rights reserved. The skill body was read to answer
 * the register's contents question; NOTHING of its text or code is reproduced.
 *
 * WHAT THE ROW CONTAINS, verified from the pinned tree: ten tutorial topic skills
 * (fundamentals, geometry, materials, lighting, textures, loaders, animation, interaction,
 * shaders, postprocessing) - a Three.js teaching set, not a game-production pack.
 *
 * THE EXTRACTED METHOD, restated from the geometry body's instancing section: rendering many
 * copies of one geometry with InstancedMesh, writing per-instance transforms through a
 * scratch Object3D and one matrix upload, and per-instance colors through an
 * InstancedBufferAttribute - instead of one draw per copy. THE SCENE shows both shapes of
 * the same deterministic 240-cube field side by side: the LEFT half meshes individually
 * (240 drawables), the RIGHT half one InstancedMesh (1 drawable) with per-instance colors.
 * The draw-count difference is the technique's whole point, so it is in the stats.
 *
 * COMPATIBILITY DIFFERENCE: the pinned body demonstrates transforms via Math.random; this
 * scene derives positions from a seeded PRNG because the lab contract requires
 * determinism. Coverage comparison against our own library is the row's other artifact
 * (docs/technique-lab/group-b/skill-pack-comparisons.md).
 */

import { createRng } from './rng';
import { disposeGroup, type Demo, type DemoContext } from './types';

const COUNT = 240;

export function createDemo(context: DemoContext): Demo {
  const { THREE, seed } = context;
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];
  const rng = createRng(seed ^ 0x29e1f7);

  // The deterministic instance field: positions, scales, tints, identical for both halves.
  const transforms: { x: number; y: number; z: number; s: number }[] = [];
  const tints: { r: number; g: number; b: number }[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    transforms.push({
      x: (rng() - 0.5) * 1.4,
      y: (rng() - 0.5) * 1.4,
      z: (rng() - 0.5) * 0.6,
      s: 0.05 + rng() * 0.07,
    });
    tints.push({ r: rng(), g: rng(), b: rng() });
  }

  const cubeGeometry = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(cubeGeometry);

  // BEFORE: one mesh per copy - the anti-pattern the instancing section replaces.
  const individualMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0, roughness: 0.7 });
  disposables.push(individualMaterial);
  const beforeGroup = new THREE.Group();
  beforeGroup.position.set(-0.9, 0.5, 0);
  for (let i = 0; i < COUNT; i += 1) {
    const mesh = new THREE.Mesh(cubeGeometry, individualMaterial);
    const t = transforms[i];
    mesh.position.set(t.x, t.y, t.z);
    mesh.scale.setScalar(t.s);
    beforeGroup.add(mesh);
  }
  root.add(beforeGroup);

  // AFTER: one InstancedMesh - one drawable, per-instance transforms and colors.
  const instanced = new THREE.InstancedMesh(cubeGeometry, individualMaterial, COUNT);
  instanced.position.set(0.9, 0.5, 0);
  const scratch = new THREE.Object3D();
  const instanceColors = new THREE.InstancedBufferAttribute(new Float32Array(COUNT * 3), 3);
  for (let i = 0; i < COUNT; i += 1) {
    const t = transforms[i];
    scratch.position.set(t.x, t.y, t.z);
    scratch.scale.setScalar(t.s);
    scratch.updateMatrix();
    instanced.setMatrixAt(i, scratch.matrix);
    instanceColors.setXYZ(i, tints[i].r, tints[i].g, tints[i].b);
  }
  instanced.instanceMatrix.needsUpdate = true;
  instanced.instanceColor = instanceColors;
  instanced.instanceColor.needsUpdate = true;
  root.add(instanced);

  const stats = {
    individualDrawables: COUNT,
    instancedDrawables: 1,
    instanceCount: COUNT,
    matricesRechecked: 0,
  };

  const update = (time: number, _dt: number): void => {
    // One bounded pulse: the whole field scales with the same clock, one matrix re-upload.
    const pulse = 1 + 0.15 * Math.sin(time * 1.2);
    for (let i = 0; i < COUNT; i += 1) {
      const t = transforms[i];
      scratch.position.set(t.x, t.y, t.z);
      scratch.scale.setScalar(t.s * pulse);
      scratch.updateMatrix();
      instanced.setMatrixAt(i, scratch.matrix);
    }
    instanced.instanceMatrix.needsUpdate = true;
    stats.matricesRechecked = COUNT;
  };

  const dispose = (): void => {
    for (const entry of disposables) entry.dispose();
    disposables.length = 0;
    disposeGroup(root);
  };

  root.userData.stats = stats;

  return {
    root,
    update,
    dispose,
    metadata: {
      sourceId: 29,
      title: 'Three.js skills collection (CloudAI-X)',
      method:
        'InstancedMesh batching of a deterministic 240-instance field: per-instance transforms '
        + 'through one scratch Object3D and a single matrix upload, per-instance colors through '
        + 'an InstancedBufferAttribute, shown against the same field as individual meshes.',
      adaptation: 'adapted',
      sources: ['https://github.com/CloudAI-X/threejs-skills'],
      limitation:
        'Source has NO licence (probe 404) - all rights reserved; concepts restated, nothing '
        + 'copied. Only the geometry skill body was read this session; the other nine topic '
        + 'skills are covered by tree enumeration only. Coverage comparison against our own '
        + 'library lives in docs/technique-lab/group-b/skill-pack-comparisons.md.',
    },
  };
}

export default createDemo;
