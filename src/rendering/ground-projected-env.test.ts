/**
 * HF-479 technique #4 — ground-projected environment backdrop contract.
 *
 * What this suite pins:
 *   1. node math: the CPU reference (which the TSL node evaluates) projects a
 *      low-camera downward ray onto the ground disk and the same ray from a
 *      high camera onto the sphere, resolves straight up/down exactly, and
 *      misses cleanly from outside the projection sphere;
 *   2. uniform-only per-arena data: retuning across arenas rewrites uniform
 *      VALUES while the built TSL graph object never changes;
 *   3. precompile registration: the pipeline id lives in the migration
 *      ledger and a scene holding the mesh audits with it;
 *   4. off switch: the settings flag and the per-arena enable both gate
 *      visibility, and anything else keeps the flat sky path.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  GROUND_PROJECTED_ENV_MESH_RADIUS,
  GROUND_PROJECTED_ENV_PIPELINE,
  applyGroundProjectedEnvState,
  createGroundProjectedEnvMesh,
  groundProjectedDirection,
  groundProjectedHitKind,
  isGroundProjectedEnvCameraInside,
  resolveGroundProjectedEnvParams,
  setGroundProjectedEnvSource,
} from './ground-projected-env';
import { auditRuntimeTslTraversal } from './pass64-tsl-scene';
import { TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';

describe('ground-projected environment params', () => {
  it('enables nuketown2 first and skyline-terminal second, nothing else', () => {
    expect(resolveGroundProjectedEnvParams('nuketown2')).toEqual({
      radius: 140,
      height: 1.7,
      enabled: true,
    });
    expect(resolveGroundProjectedEnvParams('skyline-terminal')).toEqual({
      radius: 160,
      height: 2.0,
      enabled: true,
    });
    for (const id of ['atomic-acres', 'gun-range', 'rustworks-1v1', 'farcrysis', 'map3', 'raid2']) {
      expect(resolveGroundProjectedEnvParams(id).enabled, id).toBe(false);
    }
  });

  it('keeps every in-bounds camera inside the projection sphere', () => {
    // In-bounds eyes sit below ~60 m; both radii clear that with margin.
    expect(isGroundProjectedEnvCameraInside(1.7, 140, 1.7)).toBe(true);
    expect(isGroundProjectedEnvCameraInside(60, 160, 2.0)).toBe(true);
    expect(isGroundProjectedEnvCameraInside(500, 140, 1.7)).toBe(false);
  });
});

describe('ground-projected direction math', () => {
  it('resolves straight up and straight down exactly', () => {
    const up = groundProjectedDirection([0, 1, 0], 1.7, 140, 1.7);
    expect(up[0]).toBeCloseTo(0, 10);
    expect(up[1]).toBeCloseTo(1, 6);
    expect(up[2]).toBeCloseTo(0, 10);
    const down = groundProjectedDirection([0, -1, 0], 1.7, 140, 1.7);
    expect(down[1]).toBeLessThan(-0.99);
  });

  it('lands a shallow ray on the disk from play height and on the sphere from above', () => {
    const shallow: readonly [number, number, number] = [0.995, -0.1, 0];
    expect(groundProjectedHitKind(shallow, 1.7, 140, 1.7)).toBe('disk');
    expect(groundProjectedHitKind(shallow, 100, 140, 1.7)).toBe('sphere');
    const low = groundProjectedDirection(shallow, 1.7, 140, 1.7);
    const high = groundProjectedDirection(shallow, 100, 140, 1.7);
    // The ground-plane projection bends the low ray downward harder: the two
    // answers must differ, or the projection is a no-op.
    expect(Math.abs(low[1] - high[1])).toBeGreaterThan(0.05);
    expect(low[1]).toBeLessThan(high[1]);
  });

  it('misses cleanly from outside the projection sphere', () => {
    expect(groundProjectedHitKind([0, 1, 0], 500, 140, 1.7)).toBe('miss');
    expect(groundProjectedDirection([0, 1, 0], 500, 140, 1.7)).toEqual([0, 1, 0]);
  });
});

describe('ground-projected environment mesh', () => {
  it('mounts one BackSide sphere inside the far plane with the pipeline tag', () => {
    const mesh = createGroundProjectedEnvMesh();
    expect(mesh.name).toBe('Pass 64 TSL ground-projected environment');
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.renderOrder).toBe(-10);
    expect(GROUND_PROJECTED_ENV_MESH_RADIUS).toBeLessThan(180);
    const material = mesh.material as THREE.MeshBasicMaterial;
    expect(material.side).toBe(THREE.BackSide);
    expect(material.depthWrite).toBe(false);
    expect(material.userData.tslPipelineId).toBe(GROUND_PROJECTED_ENV_PIPELINE);
    expect(material.userData.tslPipelineId).toBe('pass64.ground-projected-env.tsl.v1');
  });

  it('keeps per-arena data in uniforms: same graph object, new values', () => {
    const mesh = createGroundProjectedEnvMesh();
    const material = mesh.material as THREE.Material & { colorNode: unknown };
    const graphBefore = material.colorNode;
    expect(graphBefore).toBeTruthy();
    applyGroundProjectedEnvState(mesh, 'nuketown2', true);
    expect(mesh.userData.radiusUniform.value).toBe(140);
    expect(mesh.userData.heightUniform.value).toBe(1.7);
    applyGroundProjectedEnvState(mesh, 'skyline-terminal', true);
    expect(mesh.userData.radiusUniform.value).toBe(160);
    expect(mesh.userData.heightUniform.value).toBe(2.0);
    // No per-arena graph rebuild: the node object is identical.
    expect(material.colorNode).toBe(graphBefore);
  });

  it('binds the admitted sky as a uniform write', () => {
    const mesh = createGroundProjectedEnvMesh();
    const sky = new THREE.DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1);
    sky.needsUpdate = true;
    setGroundProjectedEnvSource(mesh, sky);
    expect(mesh.userData.mapNode.value).toBe(sky);
    const material = mesh.material as THREE.Material & { colorNode: unknown };
    const graphBefore = material.colorNode;
    setGroundProjectedEnvSource(mesh, null);
    expect(mesh.userData.mapNode.value).toBe(sky);
    expect(material.colorNode).toBe(graphBefore);
  });

  it('gates visibility on the arena enable AND the settings switch', () => {
    const mesh = createGroundProjectedEnvMesh();
    expect(applyGroundProjectedEnvState(mesh, 'nuketown2', true).enabled).toBe(true);
    expect(mesh.visible).toBe(true);
    applyGroundProjectedEnvState(mesh, 'nuketown2', false);
    expect(mesh.visible).toBe(false);
    applyGroundProjectedEnvState(mesh, 'gun-range', true);
    expect(mesh.visible).toBe(false);
    applyGroundProjectedEnvState(mesh, 'skyline-terminal', true);
    expect(mesh.visible).toBe(true);
  });

  it('registers exactly one pipeline in the migration ledger and audits with it', () => {
    const entries = TSL_MIGRATION_INVENTORY.filter(
      (entry) => entry.replacementPipelineId === GROUND_PROJECTED_ENV_PIPELINE,
    );
    expect(entries).toHaveLength(1);
    const scene = new THREE.Scene();
    scene.add(createGroundProjectedEnvMesh());
    const audit = auditRuntimeTslTraversal(scene, [GROUND_PROJECTED_ENV_PIPELINE]);
    expect(audit.legacyShaderMaterials).toEqual([]);
    expect(audit.nodeMaterialPipelineIds).toEqual([GROUND_PROJECTED_ENV_PIPELINE]);
  });
});
