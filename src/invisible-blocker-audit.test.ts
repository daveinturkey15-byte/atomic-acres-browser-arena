/**
 * HF-344 arena-wide sweep: every movement collider in every arena must be
 * visually explained - a player who is stopped must be able to see why.
 *
 * The audit itself lives in src/invisible-blocker-audit.ts. This suite runs it
 * across all six shipped arenas. The five box-authored arenas gate at zero
 * interior invisible blockers; farcrysis is REPORT-ONLY here because its
 * arena source is owned by another lane - its findings are exported for that
 * lane rather than asserted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildArena } from './map';
import { addNeighbourhoodLife, loadArenaArt } from './environment-assets';
import { buildGunRange, buildRustworks1v1, buildSkylineTerminal } from './additional-maps';
import { buildHighSeas } from './high-seas';
import { buildFarcrysis } from './farcrysis';
import {
  auditArenaInvisibleBlockers,
  colliderSignature,
  type InvisibleBlockerAuditReport,
} from './invisible-blocker-audit';

function fakeCanvasContext(): CanvasRenderingContext2D {
  const gradient = () => ({ addColorStop: vi.fn() });
  const contextState: Record<PropertyKey, unknown> = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '10px sans-serif',
  };
  return new Proxy(contextState, {
    get(target, property) {
      if (property === 'createImageData') {
        return (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      }
      if (property === 'getImageData') {
        return (_x: number, _y: number, w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      }
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return gradient;
      if (property === 'measureText') return (text: string) => ({ width: text.length * 10 });
      if (property in target) return target[property];
      return () => undefined;
    },
    set(target, property, value) {
      target[property as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function stubCanvasDocument(): void {
  const context = fakeCanvasContext();
  vi.stubGlobal('document', {
    createElement: (_tagName: string) => ({
      width: 0, height: 0,
      getContext: () => context,
      style: {},
      setAttribute: () => undefined,
      appendChild: () => undefined,
      remove: () => undefined,
    }),
    // three's ImageLoader path for atomic-acres PBR textures; nothing loads in node.
    createElementNS: (_namespace: string, _tagName: string) => ({
      style: {},
      setAttribute: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
    getElementById: (_id: string) => null,
    body: { appendChild: (_node: unknown) => undefined },
  });
}

function summarizeFinding(finding: InvisibleBlockerAuditReport['findings'][number]): string {
  return `${finding.source}[${finding.index}]${finding.coverId ? `(${finding.coverId})` : ''}`
    + ` coverage=${finding.visualCoverage}`
    + ` at(${finding.uncoveredCentroid.join(', ')})`
    + ` x[${finding.bounds.minX.toFixed(1)}..${finding.bounds.maxX.toFixed(1)}]`
    + ` y[${finding.bounds.minY.toFixed(1)}..${finding.bounds.maxY.toFixed(1)}]`
    + ` z[${finding.bounds.minZ.toFixed(1)}..${finding.bounds.maxZ.toFixed(1)}]`;
}

function summarize(report: InvisibleBlockerAuditReport): string {
  return report.interiorFindings.map((finding) =>
    `${finding.source}[${finding.index}]${finding.coverId ? `(${finding.coverId})` : ''}`
    + ` coverage=${finding.visualCoverage}`
    + ` at(${finding.uncoveredCentroid.join(', ')})`
    + ` x[${finding.bounds.minX.toFixed(1)}..${finding.bounds.maxX.toFixed(1)}]`
    + ` y[${finding.bounds.minY.toFixed(1)}..${finding.bounds.maxY.toFixed(1)}]`
    + ` z[${finding.bounds.minZ.toFixed(1)}..${finding.bounds.maxZ.toFixed(1)}]`).join('\n');
}

describe('invisible blocker audit across all arenas', () => {
  beforeEach(() => stubCanvasDocument());
  afterEach(() => vi.unstubAllGlobals());

  it('atomic-acres: zero interior invisible blockers with the full art layers applied', async () => {
    // Atomic Acres authors prop COLLIDERS in map.ts but dresses their VISUALS
    // in environment-assets.ts (loadArenaArt + addNeighbourhoodLife), exactly
    // as legacy-main does before the player enters. Audit the composed scene.
    vi.stubGlobal('window', { location: { search: '' } });
    const scene = new THREE.Scene();
    const arena = buildArena(scene);
    await loadArenaArt(scene, undefined, false);
    addNeighbourhoodLife(scene, false);
    // House-destruction fragments (walls, roof slabs, furniture) render via
    // instanced draws whose per-instance transforms a mesh AABB sweep cannot
    // see; house-destruction-presentation.test.ts proves they render at their
    // authored volumes, so those volumes count as visible here.
    const fragmentVolumes = (arena.houseDestruction?.definitions ?? []).map((definition) => ({
      minX: definition.position.x - definition.halfExtents.x,
      maxX: definition.position.x + definition.halfExtents.x,
      minY: definition.position.y - definition.halfExtents.y,
      maxY: definition.position.y + definition.halfExtents.y,
      minZ: definition.position.z - definition.halfExtents.z,
      maxZ: definition.position.z + definition.halfExtents.z,
    }));
    const report = auditArenaInvisibleBlockers(
      { ...arena, root: scene },
      { extraVisualVolumes: fragmentVolumes },
    );
    expect(report.visibleMeshCount).toBeGreaterThan(50);
    expect(report.interiorFindings, summarize(report)).toEqual([]);
  });

  it('rustworks-1v1: zero interior invisible blockers', () => {
    const report = auditArenaInvisibleBlockers(buildRustworks1v1(new THREE.Scene()));
    expect(report.visibleMeshCount).toBeGreaterThan(50);
    expect(report.interiorFindings, summarize(report)).toEqual([]);
  });

  it('gun-range: zero interior invisible blockers', () => {
    const report = auditArenaInvisibleBlockers(buildGunRange(new THREE.Scene()));
    expect(report.visibleMeshCount).toBeGreaterThan(50);
    expect(report.interiorFindings, summarize(report)).toEqual([]);
  });

  it('skyline-terminal: zero interior invisible blockers', () => {
    const report = auditArenaInvisibleBlockers(buildSkylineTerminal(new THREE.Scene()));
    expect(report.visibleMeshCount).toBeGreaterThan(50);
    expect(report.interiorFindings, summarize(report)).toEqual([]);
  });

  it('high-seas: zero interior invisible blockers', () => {
    const report = auditArenaInvisibleBlockers(buildHighSeas(new THREE.Scene()));
    expect(report.visibleMeshCount).toBeGreaterThan(50);
    expect(report.interiorFindings, summarize(report)).toEqual([]);
  });

  it('farcrysis: recorded for its owning lane - interior clean, perimeter authored', () => {
    const report = auditArenaInvisibleBlockers(buildFarcrysis(new THREE.Scene()));
    expect(report.visibleMeshCount).toBeGreaterThan(10);
    expect(report.colliderCount).toBeGreaterThan(0);
    // Farcrysis' arena source belongs to another lane, so this records what
    // they inherit instead of gating them on this lane's schedule - but a
    // console warning nobody reads is not a record. Every current finding is
    // `perimeter-containment` (the four authored invisible playfield walls at
    // x/z = -+32.2, y -4.5..4), so the number a PLAYER can hit is zero and
    // any new interior blocker fails this suite immediately.
    expect(report.interiorFindings.map(summarizeFinding)).toEqual([]);
    expect(report.findings.map((finding) => finding.classification))
      .toEqual(['perimeter-containment', 'perimeter-containment', 'perimeter-containment', 'perimeter-containment']);
  });

  it('explains a collider from the instance that is drawn, not the instanced root', () => {
    // An InstancedMesh keeps its copies in `instanceMatrix`; its own world
    // matrix is usually the identity. Reading the root alone would invent a
    // volume at the origin AND miss the volume that is really drawn, so a
    // collider under a real instance would be reported and a collider at the
    // origin would be falsely explained.
    const root = new THREE.Group();
    const instanced = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2, 3, 2),
      new THREE.MeshBasicMaterial(),
      1,
    );
    instanced.name = 'planters';
    instanced.setMatrixAt(0, new THREE.Matrix4().makeTranslation(6, 1.5, 0));
    root.add(instanced);
    root.updateMatrixWorld(true);
    const arena = {
      id: 'instanced',
      root,
      bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
      physicalCover: [],
      colliders: [
        // Under the drawn instance: explained.
        { minX: 5.2, maxX: 6.8, minZ: -0.8, maxZ: 0.8, minY: 0, maxY: 2.8 },
        // Where the instanced ROOT sits but nothing is drawn: a finding.
        { minX: -0.8, maxX: 0.8, minZ: -0.8, maxZ: 0.8, minY: 0, maxY: 2.8 },
      ],
    } as never;
    const report = auditArenaInvisibleBlockers(arena);
    expect(report.interiorFindings.map((finding) => finding.index), summarize(report)).toEqual([1]);
  });

  it('colliderSignature is stable and rounds to centimetres', () => {
    expect(colliderSignature('a', { minX: 1.004, maxX: 2, minZ: -3, maxZ: 4, minY: 0, maxY: 2.5 }))
      .toBe('a:1.00,2.00,0.00,2.50,-3.00,4.00');
    expect(colliderSignature('a', { minX: 1, maxX: 2, minZ: -3, maxZ: 4 }))
      .toBe('a:1.00,2.00,-Infinity,Infinity,-3.00,4.00');
  });

  it('flags a naked collider and classifies perimeter and foundation correctly', () => {
    const root = new THREE.Group();
    const visible = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    visible.position.set(-5, 1, 0);
    root.add(visible);
    root.updateMatrixWorld(true);
    const arena = {
      id: 'synthetic',
      root,
      bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
      physicalCover: [],
      colliders: [
        // Backed by the visible mesh: not a finding.
        { minX: -6, maxX: -4, minZ: -1, maxZ: 1, minY: 0, maxY: 2 },
        // Naked interior wall: THE finding.
        { minX: 2, maxX: 3, minZ: -2, maxZ: 2, minY: 0, maxY: 2.4 },
        // Naked but at the bounds edge: perimeter containment.
        { minX: 9.6, maxX: 10.4, minZ: -10, maxZ: 10, minY: 0, maxY: 4 },
        // Naked but never above ankle height: foundation.
        { minX: -2, maxX: 2, minZ: -2, maxZ: 2, minY: -1, maxY: 0.1 },
      ],
    } as never;
    const report = auditArenaInvisibleBlockers(arena);
    expect(report.findings).toHaveLength(3);
    expect(report.findings.map((finding) => finding.classification).sort()).toEqual([
      'foundation', 'interior-invisible-blocker', 'perimeter-containment',
    ]);
    expect(report.interiorFindings).toHaveLength(1);
    expect(report.interiorFindings[0]?.bounds.minX).toBe(2);
    // The same collider allowlisted by signature stops being an interior finding.
    const allowlisted = auditArenaInvisibleBlockers(arena, {
      intentional: new Map([[
        colliderSignature('synthetic', { minX: 2, maxX: 3, minZ: -2, maxZ: 2, minY: 0, maxY: 2.4 }),
        'synthetic test allowlist',
      ]]),
    });
    expect(allowlisted.interiorFindings).toHaveLength(0);
    expect(allowlisted.findings).toHaveLength(3);
  });
});
