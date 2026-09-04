import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from '../arena-identity';
import {
  COLD_SESSION_PRECOMPILE_ARENAS,
  arenaNeedsColdSessionPrecompile,
  censusTaaColdSessionPrecompileReach,
  enumerateTaaVelocityMrtPrecompileCandidates,
  precompileTaaVelocityMrtCandidates,
  TAA_COLD_SESSION_PRECOMPILE_REACH,
} from './cold-session-precompile-reach';
import { TAA_RESOLVE_PIPELINE_ID } from './taa-resolve';

describe('cold-session precompile reach', () => {
  it('names only real arenas, and cannot silently empty itself', () => {
    // A hand-typed roster that stops matching is this repository's recurring
    // defect: the gate goes green because it now covers nothing. Both floors
    // matter - a rename that empties the set fails here rather than shipping a
    // farcrysis that lost its relief in silence.
    expect(COLD_SESSION_PRECOMPILE_ARENAS.length).toBeGreaterThan(0);
    for (const id of COLD_SESSION_PRECOMPILE_ARENAS) expect(ARENA_IDS).toContain(id);
  });

  it('answers for the arena measured to lose the cold-session fence, and no other', () => {
    expect(arenaNeedsColdSessionPrecompile({ id: 'farcrysis' })).toBe(true);
    for (const id of ARENA_IDS) {
      if (COLD_SESSION_PRECOMPILE_ARENAS.includes(id)) continue;
      expect(arenaNeedsColdSessionPrecompile({ id })).toBe(false);
    }
  });

  it('is the authority the transition asks - the transition never reads an arena id here', () => {
    const source = readFileSync(new URL('../legacy-main.ts', import.meta.url), 'utf8');
    const region = source.slice(
      source.indexOf("profileArenaTransition('visual-definition');"),
      source.indexOf("profileArenaTransition('quality-presentation');"),
    );
    expect(region).not.toHaveLength(0);
    expect(region).toContain('arenaNeedsColdSessionPrecompile(selectedArena)');
    // The whole point of routing through this module: no per-arena special case
    // may reappear inline in the transition.
    expect(region.match(/selectedArena\.id === '/g) ?? []).toHaveLength(0);
    for (const id of ARENA_IDS) expect(region).not.toContain(`'${id}'`);
  });

  it('pins the TAA census vocabulary and derives velocity variants from the scene', () => {
    const root = new THREE.Group();
    const first = new THREE.MeshBasicMaterial();
    first.name = 'velocity variant A';
    const second = new THREE.MeshBasicMaterial();
    second.name = 'velocity variant B';
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), first));
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), first));
    root.add(new THREE.Mesh(new THREE.BufferGeometry(), second));

    const census = censusTaaColdSessionPrecompileReach(root);
    expect(TAA_COLD_SESSION_PRECOMPILE_REACH.resolveNodeMaterial).toBe(TAA_RESOLVE_PIPELINE_ID);
    expect(census.historyCopy).toBe('taa-history.copyTextureToTexture');
    expect(census.velocityMrt).toBe('scene-pass.velocity-mrt');
    expect(census.velocityMrtMaterialVariants).toHaveLength(2);
    expect(census.velocityMrtMaterialVariants.join('\n')).toContain('velocity variant A');
    expect(census.velocityMrtMaterialVariants.join('\n')).toContain('velocity variant B');

    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    first.dispose();
    second.dispose();
  });

  it('includes hidden and non-selected LOD renderables in the admission candidates', async () => {
    const root = new THREE.Group();
    const hiddenMaterial = new THREE.MeshBasicMaterial();
    hiddenMaterial.name = 'hidden velocity variant';
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hiddenMaterial);
    hidden.visible = false;
    root.add(hidden);
    const lod = new THREE.LOD();
    const levelZero = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), hiddenMaterial);
    const levelOne = new THREE.Mesh(new THREE.SphereGeometry(1), hiddenMaterial);
    lod.addLevel(levelZero, 0);
    lod.addLevel(levelOne, 20);
    root.add(lod);

    const candidates = enumerateTaaVelocityMrtPrecompileCandidates([root]);
    expect(candidates.map(({ object }) => object)).toEqual(expect.arrayContaining([hidden, levelZero, levelOne]));
    const calls: THREE.Object3D[] = [];
    const count = await precompileTaaVelocityMrtCandidates({
      compileAsync: async (object) => {
        calls.push(object);
        expect(object.visible).toBe(true);
      },
    }, new THREE.PerspectiveCamera(), new THREE.Scene(), [root]);
    expect(count).toBe(candidates.length);
    expect(calls).toHaveLength(candidates.length);
    expect(hidden.visible).toBe(false);

    hidden.geometry.dispose();
    levelZero.geometry.dispose();
    levelOne.geometry.dispose();
    hiddenMaterial.dispose();
  });
});
