/**
 * TEMPORARY diagnostic (farcrysis-rebuild lane): measures where every
 * dressing layer's instances actually land relative to the CURRENT island
 * waterline (FARCRYSIS_WATERLINE_EDGE from farcrysis-shore-bands).
 * Not an assertion suite — a measurement probe. Delete after the lane.
 */
import { describe, it, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { buildVegetation } from './farcrysis-vegetation';
import { buildFarcrysisGrassField } from './farcrysis-grass-field';
import { buildDetail } from './farcrysis-detail';
import {
  FARCRYSIS_ARENA_HALF,
  FARCRYSIS_WATERLINE_EDGE,
  farcrysisEdgeDistance,
} from './farcrysis-shore-bands';
import { farcrysisTerrainHeight, FARCRYSIS_WATER_LEVEL } from './farcrysis-terrain-authority';

function fakeCanvasContext(): CanvasRenderingContext2D {
  const grad = { addColorStop: (): void => undefined } as unknown as CanvasGradient;
  return {
    fillRect: (): void => undefined,
    fillStyle: '',
    createLinearGradient: (): CanvasGradient => grad,
    canvas: { width: 64, height: 64 },
  } as unknown as CanvasRenderingContext2D;
}

beforeEach(() => {
  vi.stubGlobal('document', {
    createElement: (_tag: string) => ({ getContext: () => fakeCanvasContext(), width: 64, height: 64 }),
    documentElement: { dataset: {} },
  });
});
afterEach(() => vi.unstubAllGlobals());

interface Row {
  layer: string;
  n: number;
  edgeMin: number;
  edgeMax: number;
  edgeMean: number;
  underWaterFrac: number;
}

function auditGroup(prefix: string, group: THREE.Object3D): Row[] {
  const rows: Row[] = [];
  group.updateMatrixWorld(true);
  group.traverse((obj) => {
    const mesh = obj as THREE.InstancedMesh;
    if (!(mesh as Partial<THREE.InstancedMesh>).isInstancedMesh) return;
    const v = new THREE.Vector3();
    const m = new THREE.Matrix4();
    let eMin = Infinity;
    let eMax = -Infinity;
    let sum = 0;
    let wet = 0;
    const n = mesh.count;
    for (let i = 0; i < n; i += 1) {
      mesh.getMatrixAt(i, m);
      v.setFromMatrixPosition(m);
      mesh.localToWorld(v);
      const e = farcrysisEdgeDistance(v.x, v.z);
      eMax = Math.max(eMax, e);
      eMin = Math.min(eMin, e);
      sum += e;
      if (farcrysisTerrainHeight(v.x, v.z) < FARCRYSIS_WATER_LEVEL) wet += 1;
    }
    rows.push({
      layer: `${prefix}/${mesh.name || mesh.type}`,
      n,
      edgeMin: eMin,
      edgeMax: eMax,
      edgeMean: sum / n,
      underWaterFrac: wet / n,
    });
  });
  return rows;
}

describe('shore placement audit (diagnostic)', () => {
  it('reports per-layer edge-distance placement', () => {
    const all: Row[] = [];

    const veg = new THREE.Group();
    veg.name = 'veg-root';
    buildVegetation(veg);
    // InstancedMeshes live deeper; flatten names by walking with parent labels
    all.push(...auditGroup('veg', veg));


    const grassRoot = new THREE.Group();
    buildFarcrysisGrassField(grassRoot);
    all.push(...auditGroup('grass', grassRoot));

    const detailScene = new THREE.Scene();
    buildDetail(detailScene);
    all.push(...auditGroup('detail', detailScene));
    const lines = [
      `WATERLINE_EDGE=${FARCRYSIS_WATERLINE_EDGE.toFixed(3)} ARENA_HALF=${FARCRYSIS_ARENA_HALF}`,
      ...all.sort((a, b) => a.edgeMean - b.edgeMean).map((r) =>
        `${r.layer} | n=${r.n} | edge ${r.edgeMin.toFixed(1)}..${r.edgeMax.toFixed(1)} mean ${r.edgeMean.toFixed(1)} | underwater ${(r.underWaterFrac * 100).toFixed(0)}%`),
    ];
    // eslint-disable-next-line no-undef
    require('fs').writeFileSync('artifacts/farcrysis-shore-audit.txt', lines.join('\n') + '\n');
  });
});
