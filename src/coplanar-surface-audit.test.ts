import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  arenaCoplanarSurfaceAudit,
  arenaHorizontalSurfaceAudit,
  collectHorizontalOverlaySpecs,
  computeMinimumSafeVerticalSeparation,
  coplanarOverlapKey,
  describeCoplanarOverlap,
  findNearCoplanarPairs,
} from './coplanar-surface-audit';

// HF-346: threshold tests.
/** Shared canvas stub: arena builders paint signage textures at build time. */
function installCanvasDocument(): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const contextState: Record<PropertyKey, unknown> = { font: '900 30px sans-serif' };
  const context = new Proxy(contextState, {
    get(target, property) {
      if (property === 'measureText') {
        return (text: string) => ({ width: text.length * Number.parseInt(String(target.font).match(/(\d+)px/)?.[1] ?? '30', 10) * 0.58 });
      }
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return () => ({ addColorStop: () => undefined });
      }
      if (property in target) return target[property];
      return () => undefined;
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  const fakeDocument = {
    createElement(tagName: string) {
      if (tagName === 'canvas') {
        return { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
      }
      if (tagName === 'img') {
        return { addEventListener: () => undefined, removeEventListener: () => undefined } as unknown as HTMLImageElement;
      }
      throw new Error(`Unexpected test element ${tagName}`);
    },
    createElementNS(_ns: string, tagName: string) {
      return fakeDocument.createElement(tagName);
    },
  } as unknown as Document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  };
}

describe('coplanar surface audit', () => {
  it('computes a millimetre-rounded safe separation from near/far/z', () => {
    const threshold = computeMinimumSafeVerticalSeparation(0.08, 190, 71.72);
    expect(threshold).toBe(0.004);
  });

  it('grows quadratically with view distance', () => {
    const a = computeMinimumSafeVerticalSeparation(0.08, 190, 50);
    const b = computeMinimumSafeVerticalSeparation(0.08, 190, 100);
    expect(b).toBeGreaterThan(a);
  });

  it('flags two overlapping decals closer than the threshold', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    a.name = 'decal-a';
    a.position.set(0, 0.01, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    b.name = 'decal-b';
    b.position.set(0, 0.012, 0);
    root.add(a, b);
    const specs = collectHorizontalOverlaySpecs(root);
    const pairs = findNearCoplanarPairs(specs, 0.004);
    expect(pairs.length).toBe(1);
    expect(pairs[0].dy).toBeCloseTo(0.002, 3);
  });

  it('allows two overlapping decals separated by the threshold', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    a.name = 'decal-a';
    a.position.set(0, 0.01, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    b.name = 'decal-b';
    b.position.set(0, 0.015, 0);
    root.add(a, b);
    const specs = collectHorizontalOverlaySpecs(root);
    const pairs = findNearCoplanarPairs(specs, 0.004);
    expect(pairs.length).toBe(0);
  });

  it('records a failing audit on badly spaced geometry', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), new THREE.MeshStandardMaterial());
    a.name = 'decal-a';
    a.position.set(0, 0.01, 0);
    root.add(a);
    const b = a.clone();
    b.name = 'decal-b';
    b.position.set(0, 0.011, 0);
    root.add(b);
    const audit = arenaHorizontalSurfaceAudit(root, 0.08, 190, 71.72);
    expect(audit.threshold).toBe(0.004);
    expect(audit.pass).toBe(false);
    expect(audit.pairs.length).toBeGreaterThan(0);
  });

  it('audits each instanced box at its own world transform', () => {
    const root = new THREE.Group();
    const instances = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2, 0.01, 2),
      new THREE.MeshStandardMaterial(),
      2,
    );
    instances.name = 'litter';
    instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-5, 0.01, 0));
    instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(5, 0.012, 0));
    root.add(instances);

    const specs = collectHorizontalOverlaySpecs(root);
    expect(specs.map(({ name }) => name)).toEqual(['litter[0]', 'litter[1]']);
    expect(specs.map(({ minX, maxX }) => [minX, maxX])).toEqual([[-6, -4], [4, 6]]);
    expect(findNearCoplanarPairs(specs, 0.004)).toEqual([]);
  });



  // HF-346: polygonOffset tiering tests.
  it('recognises polygonOffset tiered materials as resolved coplanar layers', () => {
    const root = new THREE.Group();
    const matA = new THREE.MeshStandardMaterial();
    matA.polygonOffset = true;
    matA.polygonOffsetFactor = -1;
    matA.polygonOffsetUnits = -1;

    const matB = new THREE.MeshStandardMaterial();
    matB.polygonOffset = true;
    matB.polygonOffsetFactor = -2;
    matB.polygonOffsetUnits = -2;

    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), matA);
    a.name = 'decal-a';
    a.position.set(0, 0.01, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), matB);
    b.name = 'decal-b';
    b.position.set(0, 0.01, 0);
    root.add(a, b);

    const specs = collectHorizontalOverlaySpecs(root);
    const pairs = findNearCoplanarPairs(specs, 0.004);
    expect(pairs.length).toBe(0);
  });

  it('still flags coplanar decals if they share the exact same polygonOffset tier', () => {
    const root = new THREE.Group();
    const sharedMat = new THREE.MeshStandardMaterial();
    sharedMat.polygonOffset = true;
    sharedMat.polygonOffsetFactor = -1;
    sharedMat.polygonOffsetUnits = -1;

    const a = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), sharedMat);
    a.name = 'decal-a';
    a.position.set(0, 0.01, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), sharedMat);
    b.name = 'decal-b';
    b.position.set(0, 0.01, 0);
    root.add(a, b);

    const specs = collectHorizontalOverlaySpecs(root);
    const pairs = findNearCoplanarPairs(specs, 0.004);
    expect(pairs.length).toBe(1);
  });

  // HF-346: direction-aware exemption tests.
  it('flags an INVERTED pair where the lower surface has the winning (more negative) offset', () => {
    const root = new THREE.Group();
    // Visually upper decal, but its bias loses to the lower one.
    const matUpper = new THREE.MeshStandardMaterial();
    matUpper.polygonOffset = true;
    matUpper.polygonOffsetFactor = -1;
    matUpper.polygonOffsetUnits = -1;

    // Lower surface with the more negative bias — it would draw over the upper decal.
    const matLower = new THREE.MeshStandardMaterial();
    matLower.polygonOffset = true;
    matLower.polygonOffsetFactor = -2;
    matLower.polygonOffsetUnits = -2;

    const upper = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), matUpper);
    upper.name = 'decal-upper';
    upper.position.set(0, 0.012, 0);
    const lower = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), matLower);
    lower.name = 'decal-lower';
    lower.position.set(0, 0.01, 0);
    root.add(upper, lower);

    const specs = collectHorizontalOverlaySpecs(root);
    const pairs = findNearCoplanarPairs(specs, 0.004);
    expect(pairs.length, 'inverted offset ordering must FAIL the audit').toBe(1);
  });

  it('flags a pair using a POSITIVE polygonOffset, which pushes a decal behind its base', () => {
    const root = new THREE.Group();
    const matBase = new THREE.MeshStandardMaterial();

    // Positive offset pushes the decal BEHIND the base — never a valid resolution.
    const matDecal = new THREE.MeshStandardMaterial();
    matDecal.polygonOffset = true;
    matDecal.polygonOffsetFactor = 1;
    matDecal.polygonOffsetUnits = 1;

    const base = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), matBase);
    base.name = 'decal-base';
    base.position.set(0, 0.01, 0);
    const decal = new THREE.Mesh(new THREE.BoxGeometry(2, 0.01, 2), matDecal);
    decal.name = 'decal-positive-offset';
    decal.position.set(0, 0.012, 0);
    root.add(base, decal);

    const specs = collectHorizontalOverlaySpecs(root);
    const pairs = findNearCoplanarPairs(specs, 0.004);
    expect(pairs.length, 'positive offset must FAIL the audit').toBe(1);
  });

  // HF-346: probe all arenas
  it('audits all arenas for near-coplanar horizontal surfaces', async () => {
    const uninstall = installCanvasDocument();
    try {
      const { buildSkylineTerminal, buildRustworks1v1, buildGunRange } = await import('./additional-maps');
      const { buildArena } = await import('./map');
      const { buildFarcrysis } = await import('./farcrysis');
      const { buildHighSeas } = await import('./high-seas');

      const arenas = [
        { name: 'Skyline Terminal', map: buildSkylineTerminal(new THREE.Scene()), near: 0.08, far: 190, maxDist: 71.72 },
        { name: 'Rustworks', map: buildRustworks1v1(new THREE.Scene()), near: 0.08, far: 190, maxDist: 62.33 },
        { name: 'Gun Range', map: buildGunRange(new THREE.Scene()), near: 0.08, far: 190, maxDist: 44.66 },
        { name: 'Atomic Acres', map: buildArena(new THREE.Scene()), near: 0.08, far: 190, maxDist: 68.88 },
        { name: 'Farcrysis', map: buildFarcrysis(new THREE.Scene()), near: 0.08, far: 190, maxDist: 40.0 },
        { name: 'High Seas', map: buildHighSeas(new THREE.Scene()), near: 0.08, far: 190, maxDist: 88.0 },
      ];

      const audits = arenas.map(({ name, map, near, far, maxDist }) => ({
        name,
        audit: arenaHorizontalSurfaceAudit(map.root, near, far, maxDist),
      }));

      // Pass 75: report EVERY failing arena in one actionable message (with example
      // pairs) instead of stopping at the first bad map.
      const failures = audits.filter(({ audit }) => !audit.pass || audit.pairs.length > 0);
      if (failures.length > 0) {
        const results = failures.map(({ name, audit }) => {
          const examples = audit.pairs.slice(0, 12)
            .map((pair) => `${pair.a} <> ${pair.b} dy=${pair.dy} overlap=${pair.overlapX}x${pair.overlapZ}`)
            .join('\n  ');
          return `${name}: threshold=${audit.threshold}, pairs=${audit.pairs.length}, pass=${audit.pass}${examples ? `\n  ${examples}` : ''}`;
        }).join('\n');
        throw new Error(results);
      }

      // Pass 74: keep the explicit per-arena assertions so every arena (all six,
      // High Seas included) is individually asserted rather than silently skipped.
      for (const { name, audit } of audits) {
        expect(audit.pairs, `${name} has ${audit.pairs.length} coplanar pairs`).toHaveLength(0);
        expect(audit.pass, `${name} audit pass`).toBe(true);
      }
    } finally {
      uninstall();
    }
  }, 20_000);
});

/**
 * HF-346 depth pass. The decal sweep above reported zero pairs on every arena
 * while the owner was still reporting flicker in Terminal, so these tests run
 * the plane-level detector, which sees any geometry, not just thin boxes.
 */
describe('coplanar surface depth audit', () => {
  const material = (): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial();

  it('flags two same-facing surfaces that share a plane and a footprint', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), material());
    a.name = 'wall-a';
    a.position.set(0, 1.5, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 4), material());
    b.name = 'wall-b';
    // Its -z face lands on z = -0.2, exactly where wall-a's -z face is.
    b.position.set(1.8, 1.5, 1.8);
    root.add(a, b);
    const audit = arenaCoplanarSurfaceAudit(root, 0.08, 190, 70);
    expect(audit.pass).toBe(false);
    expect(audit.overlaps.map((overlap) => coplanarOverlapKey(overlap.a, overlap.b)))
      .toContain(coplanarOverlapKey('wall-a', 'wall-b'));
    expect(describeCoplanarOverlap(audit.overlaps[0]!)).toContain('wall-a');
  });

  it('does not flag opposite-facing surfaces that merely touch', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), material());
    a.name = 'butt-a';
    a.position.set(0, 1.5, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), material());
    b.name = 'butt-b';
    // Shares the seam at z = 0.2: a's +z face against b's -z face.
    b.position.set(0, 1.5, 0.4);
    root.add(a, b);
    expect(arenaCoplanarSurfaceAudit(root, 0.08, 190, 70).overlaps).toEqual([]);
  });

  it('treats a depth-neutralised or invisible surface as absent', () => {
    const build = (mutate: (mesh: THREE.Mesh) => void): THREE.Group => {
      const root = new THREE.Group();
      const a = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), material());
      a.name = 'plate-a';
      a.position.set(0, 1.5, 0);
      const b = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), material());
      b.name = 'plate-b';
      b.position.set(0, 1.5, 0);
      mutate(b);
      root.add(a, b);
      return root;
    };
    expect(arenaCoplanarSurfaceAudit(build(() => undefined), 0.08, 190, 70).overlaps.length)
      .toBeGreaterThan(0);
    // Exactly how Skyline neutralises a quality-placeholder collider.
    expect(arenaCoplanarSurfaceAudit(build((mesh) => {
      (mesh.material as THREE.Material).depthWrite = false;
    }), 0.08, 190, 70).overlaps).toEqual([]);
    expect(arenaCoplanarSurfaceAudit(build((mesh) => { mesh.visible = false; }), 0.08, 190, 70).overlaps)
      .toEqual([]);
  });

  it('accepts a distinct polygonOffset tier or renderOrder as authored resolution', () => {
    const build = (mutate: (mesh: THREE.Mesh) => void): THREE.Group => {
      const root = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 4), material());
      base.name = 'apron';
      base.position.set(0, 0.1, 0);
      const decal = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 3), material());
      decal.name = 'chevron';
      decal.position.set(0, 0.19, 0);
      mutate(decal);
      root.add(base, decal);
      return root;
    };
    expect(arenaCoplanarSurfaceAudit(build(() => undefined), 0.08, 190, 70).overlaps.length)
      .toBeGreaterThan(0);
    expect(arenaCoplanarSurfaceAudit(build((mesh) => {
      const decalMaterial = mesh.material as THREE.Material;
      decalMaterial.polygonOffset = true;
      decalMaterial.polygonOffsetFactor = -2;
      decalMaterial.polygonOffsetUnits = -2;
    }), 0.08, 190, 70).overlaps).toEqual([]);
    expect(arenaCoplanarSurfaceAudit(build((mesh) => { mesh.renderOrder = 2; }), 0.08, 190, 70).overlaps)
      .toEqual([]);
  });

  it('reads InstancedMesh copies at their own transforms, not the instanced root', () => {
    const root = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), material());
    wall.name = 'instanced-neighbour';
    wall.position.set(0, 1.5, 0);
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 3, 0.4), material(), 2);
    instanced.name = 'instanced-panels';
    // Copy 0 far away; copy 1 exactly on the wall's plane.
    instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(40, 1.5, 40));
    instanced.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 1.5, 0));
    root.add(wall, instanced);
    const overlaps = arenaCoplanarSurfaceAudit(root, 0.08, 190, 70).overlaps;
    expect(overlaps.map((overlap) => overlap.b)).toContain('instanced-panels[1]');
    expect(overlaps.map((overlap) => overlap.b)).not.toContain('instanced-panels[0]');
  });

  it('ignores a prop base sitting on a floor - a downward face under the world', () => {
    const root = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 20), material());
    floor.name = 'floor';
    floor.position.set(0, -0.1, 0);
    const crate = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material());
    crate.name = 'crate';
    crate.position.set(0, 1, 0);
    root.add(floor, crate);
    expect(arenaCoplanarSurfaceAudit(root, 0.08, 190, 70).overlaps).toEqual([]);
  });

  it('honours an intentional allowlist entry in either order', () => {
    const root = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), material());
    a.name = 'twin-a';
    a.position.set(0, 1.5, 0);
    const b = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 0.4), material());
    b.name = 'twin-b';
    b.position.set(0, 1.5, 0);
    root.add(a, b);
    expect(arenaCoplanarSurfaceAudit(root, 0.08, 190, 70, {
      intentional: new Set([coplanarOverlapKey('twin-b', 'twin-a')]),
    }).overlaps).toEqual([]);
  });

  /**
   * HF-346 close-out. Skyline Terminal is GATED at zero; the other arenas are
   * recorded rather than gated because their sources belong to other lanes,
   * and a recorded count still fails loudly if one of them gets worse.
   */
  it('skyline-terminal: zero coplanar surfaces in every presentation profile', async () => {
    const uninstall = installCanvasDocument();
    try {
      const { buildSkylineTerminal, applyAdditionalMapPresentationProfile } = await import('./additional-maps');
      for (const profile of ['performance', 'blender', 'compat'] as const) {
        const map = buildSkylineTerminal(new THREE.Scene());
        applyAdditionalMapPresentationProfile(map.root, profile);
        const audit = arenaCoplanarSurfaceAudit(map.root, 0.08, 190, 71.72);
        expect(audit.patches, `${profile} produced no patches`).toBeGreaterThan(500);
        expect(
          audit.overlaps.map(describeCoplanarOverlap),
          `skyline-terminal/${profile} has ${audit.overlaps.length} coplanar surfaces`,
        ).toEqual([]);
      }
    } finally {
      uninstall();
    }
  }, 60_000);

  it('skyline-terminal keeps its rear corners and perimeter sealed after the fix', async () => {
    const uninstall = installCanvasDocument();
    try {
      const { buildSkylineTerminal } = await import('./additional-maps');
      const map = buildSkylineTerminal(new THREE.Scene());
      const covers = (x: number, z: number): boolean => map.colliders.some((collider) =>
        !collider.rotation
        && x >= collider.minX && x <= collider.maxX
        && z >= collider.minZ && z <= collider.maxZ);
      // Rear corners of the terminal shell, where the side walls were shortened.
      for (const x of [-31.15, 31.15]) {
        for (const z of [-34.2, -34.0]) {
          expect(covers(x, z), `terminal rear corner (${x}, ${z}) must stay solid`).toBe(true);
        }
      }
      // All four perimeter fence corners, where the east/west runs were shortened.
      for (const x of [-35.8, 35.8]) {
        for (const z of [-35.8, 35.8]) {
          expect(covers(x, z), `fence corner (${x}, ${z}) must stay solid`).toBe(true);
        }
      }
      // The playable envelope is untouched: the inner faces of the three
      // shell walls stay exactly where Pass 74 authored them.
      const near = (value: number | undefined, expected: number): boolean =>
        typeof value === 'number' && Math.abs(value - expected) < 1e-6;
      const shell = map.colliders.filter((collider) => near(collider.minY, 0) && near(collider.maxY, 7));
      const leftWall = shell.find((collider) => near(collider.maxX, -30.9));
      const rightWall = shell.find((collider) => near(collider.minX, 30.9));
      const backWall = shell.find((collider) => near(collider.maxZ, -33.9));
      expect(leftWall, 'left shell wall inner face still at x = -30.9').toBeDefined();
      expect(rightWall, 'right shell wall inner face still at x = 30.9').toBeDefined();
      expect(backWall, 'back wall inner face still at z = -33.9').toBeDefined();
      // ...and the back wall now spans the side walls, which is why shortening
      // them cannot open the corner.
      expect(backWall!.minX).toBeLessThanOrEqual(-31.3 + 1e-6);
      expect(backWall!.maxX).toBeGreaterThanOrEqual(31.3 - 1e-6);
    } finally {
      uninstall();
    }
  }, 60_000);

  it('records the coplanar-surface count of every other arena for its owning lane', async () => {
    const uninstall = installCanvasDocument();
    try {
      const { buildRustworks1v1, buildGunRange, applyAdditionalMapPresentationProfile } = await import('./additional-maps');
      const { buildArena } = await import('./map');
      const { buildHighSeas } = await import('./high-seas');
      const rustworks = buildRustworks1v1(new THREE.Scene());
      applyAdditionalMapPresentationProfile(rustworks.root, 'blender');
      const gunRange = buildGunRange(new THREE.Scene());
      applyAdditionalMapPresentationProfile(gunRange.root, 'blender');
      // Recorded ceilings, not targets. Lowering one is a fix; raising one
      // means an arena regressed and the owning lane must be told.
      const recorded: ReadonlyArray<readonly [string, THREE.Object3D, number, number]> = [
        ['rustworks-1v1', rustworks.root, 62.33, 131],
        ['gun-range', gunRange.root, 44.66, 108],
        ['atomic-acres', buildArena(new THREE.Scene()).root, 68.88, 8],
        ['high-seas', buildHighSeas(new THREE.Scene()).root, 88.0, 88],
      ];
      for (const [name, root, maxViewDistance, ceiling] of recorded) {
        const audit = arenaCoplanarSurfaceAudit(root, 0.08, 190, maxViewDistance);
        expect(
          audit.overlaps.length,
          `${name} coplanar surfaces regressed above the recorded ${ceiling}:\n`
            + audit.overlaps.slice(0, 8).map(describeCoplanarOverlap).join('\n'),
        ).toBeLessThanOrEqual(ceiling);
      }
    } finally {
      uninstall();
    }
  }, 120_000);
});
