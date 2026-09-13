import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { batchStaticMeshes } from '../art-kit';
import { buildWorldStudio } from './arena';
import { HOUSE_SHELLS, type HouseShellAudit, type HouseVariant, type StudioHouseShells } from './houses';
import type { HousePresentation } from './blender-presentation/houses';

function audit(variant: HouseVariant, passed: boolean): HouseShellAudit {
  const spec = HOUSE_SHELLS.find((entry) => entry.variant === variant)!;
  return {
    variant,
    houseId: spec.houseId,
    partition: spec.partition,
    passed,
    failures: passed ? [] : ['fixture audit failure'],
    windowIds: [],
    apertureIds: [],
    blockedApertureIds: [],
    routeIds: [],
    interiorApertureIds: [],
    blockedInteriorApertureIds: [],
    partitionIds: [],
    stairTreadTops: [],
    triangles: 1,
    drawGroups: 1,
    localBounds: null,
  };
}

function controllableShells(passed: boolean): {
  shells: StudioHouseShells;
  resolve: () => Promise<void>;
} {
  const root = new THREE.Group();
  const audits = new Map<HouseVariant, HouseShellAudit>();
  let settle!: () => void;
  const ready = new Promise<void>((resolve) => { settle = resolve; });
  let disposed = false;
  const shells: StudioHouseShells = {
    root,
    ready,
    audits,
    dispose: () => {
      disposed = true;
      root.clear();
      audits.clear();
    },
  };
  return {
    shells,
    resolve: async () => {
      for (const spec of HOUSE_SHELLS) {
        audits.set(spec.variant, audit(spec.variant, passed));
        if (passed && !disposed) {
          const scene = new THREE.Group();
          scene.name = spec.partition;
          root.add(scene);
        }
      }
      settle();
      await ready;
    },
  };
}

function architectureMeshes(arena: ReturnType<typeof buildWorldStudio>): THREE.Mesh[] {
  const architecture = arena.root.getObjectByName('world-studio-architecture');
  const meshes: THREE.Mesh[] = [];
  architecture?.traverse((node) => {
    if (node instanceof THREE.Mesh
      && (/^world-studio-(?:teal|yellow)-house-/.test(node.name))
      && !node.name.includes('-glass:')) meshes.push(node);
  });
  return meshes;
}

describe('world-studio presentation batching boundary', () => {
  it('does not copy async house fallback before success or failure settles', async () => {
    const successStage = new THREE.Scene();
    const successFixture = controllableShells(true);
    const successArena = buildWorldStudio(successStage, { createShells: () => successFixture.shells });
    const successPresentation = successArena.root.userData.worldStudioHousePresentation as HousePresentation;
    const successMeshes = architectureMeshes(successArena);

    expect(successArena.root.getObjectByName('world-studio-architecture')?.userData.dynamic).toBe(true);
    expect(successArena.root.getObjectByName('world-studio-vehicles')?.userData.dynamic).toBe(true);
    expect(successPresentation.root.userData.dynamic).toBe(true);
    expect(successMeshes.length).toBeGreaterThan(0);

    // This is the same generic batch entry point used by legacy-main, while house audits are pending.
    batchStaticMeshes(successArena.root, successArena.root, () => '', 'preserve');
    expect(successMeshes.every((mesh) => mesh.visible && mesh.userData.staticBatchRendered !== true)).toBe(true);
    await successFixture.resolve();
    await successPresentation.ready;
    expect([...successPresentation.outcomes.values()].every((outcome) => outcome.substituted)).toBe(true);
    expect(successMeshes.every((mesh) => mesh.visible === false)).toBe(true);
    expect(successMeshes.every((mesh) => mesh.userData.staticBatchRendered !== true)).toBe(true);

    const failureStage = new THREE.Scene();
    const failureFixture = controllableShells(false);
    const failureArena = buildWorldStudio(failureStage, { createShells: () => failureFixture.shells });
    const failurePresentation = failureArena.root.userData.worldStudioHousePresentation as HousePresentation;
    const failureMeshes = architectureMeshes(failureArena);
    batchStaticMeshes(failureArena.root, failureArena.root, () => '', 'preserve');
    expect(failureMeshes.every((mesh) => mesh.visible && mesh.userData.staticBatchRendered !== true)).toBe(true);
    await failureFixture.resolve();
    await failurePresentation.ready;
    expect([...failurePresentation.outcomes.values()].every((outcome) => !outcome.substituted)).toBe(true);
    expect(failureMeshes.every((mesh) => mesh.visible)).toBe(true);
    expect(failureMeshes.every((mesh) => mesh.userData.staticBatchRendered !== true)).toBe(true);
  });
});
