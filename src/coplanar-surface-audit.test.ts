import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  arenaHorizontalSurfaceAudit,
  collectHorizontalOverlaySpecs,
  computeMinimumSafeVerticalSeparation,
  findNearCoplanarPairs,
} from './coplanar-surface-audit';

// HF-346: threshold tests.
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

      const audits = arenas.map(({ name, map, near, far, maxDist }) => {
        const audit = arenaHorizontalSurfaceAudit(map.root, near, far, maxDist);
        return { name, audit };
      });
      const failures = audits.filter(({ audit }) => !audit.pass);
      if (failures.length === 0) return;
      const results = failures.map(({ name, audit }) => {
        const examples = audit.pairs.slice(0, 12)
          .map((pair) => `${pair.a} <> ${pair.b} dy=${pair.dy} overlap=${pair.overlapX}x${pair.overlapZ}`)
          .join('\n  ');
        return `${name}: threshold=${audit.threshold}, pairs=${audit.pairs.length}, pass=${audit.pass}${examples ? `\n  ${examples}` : ''}`;
      }).join('\n');
      throw new Error(results);
    } finally {
      uninstall();
    }
  }, 20_000);
});



