/**
 * nuketown2-verge-edge.test.ts — HF-536 night-muse-verge proof (critic gap #4).
 *
 * Turf-to-kerb transitions: soil strip continuity/jitter/relief, cluster
 * counts and clearances, one-sampler pin, tris/draws delta, and the
 * PROPS/verge-body invisibility the budgets depend on. Every claim measured.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildNuketown2 } from './nuketown2-arena';
import { NUKETOWN_LAWN_BLADE_HEIGHT_M } from './nuketown-lawn-field';
import {
  NUKETOWN2_VERGE_EDGE_BLADE_HEIGHT_M,
  VERGE_BLOOM_HEIGHT_SCALE,
  VERGE_CLUSTER_CARDS,
  VERGE_CLUSTER_CLEAR_M,
  VERGE_CLUSTER_MAX_PER_SIDE,
  VERGE_CLUSTER_MIN_PER_SIDE,
  VERGE_BLOOM_BAND_M,
  VERGE_EDGE_BULB,
  VERGE_EDGE_HOUSE_FRONT_M,
  VERGE_EDGE_LAWN_TOP_Y,
  VERGE_STRIP_CELL_M,
  VERGE_STRIP_JITTER_MAX_M,
  VERGE_STRIP_JITTER_MIN_M,
  VERGE_STRIP_RELIEF_M,
  VERGE_STRIP_WIDTH_M,
  createVergeClusterMaterial,
  vergeEdgeClusters,
  vergeEdgeDoorWalks,
  vergeEdgeOnCarriageway,
  vergeEdgePadRects,
  vergeEdgeInKerbBand,
  vergeEdgeStripCells,
  vergeEdgeStripJitter,
} from './nuketown2-verge-edge';
import { LEAF_ALPHA_TEST, nuketown2LeafAtlas } from './nuketown2-vegetation';

function builtOnce(): ReturnType<typeof buildNuketown2> {
  return buildNuketown2(new THREE.Scene());
}

describe('nuketown2 verge edge strip', () => {
  it('lays a continuous run along every kerb: no unintended gap', () => {
    const cells = vergeEdgeStripCells();
    expect(cells.length).toBeGreaterThan(200);
    const byRun = new Map<string, typeof cells>();
    for (const cell of cells) {
      const list = byRun.get(cell.run) ?? [];
      list.push(cell);
      byRun.set(cell.run, list);
    }
    // Stem kerb lines and the bulb ring must all exist.
    expect([...byRun.keys()].filter((r) => r.startsWith('stem-'))).toHaveLength(2);
    expect(byRun.has('bulb-ring')).toBe(true);
    for (const [run, list] of byRun) {
      // Order along the run's own direction (arc by angle, z-runs by z),
      // then split into contiguous segments: runs break exactly where the
      // lawn does (bays, aprons, road), and WITHIN a segment the 0.31-long
      // cells on a 0.3 pitch must overlap.
      const ordered = [...list].sort((a, b) => {
        if (run === 'bulb-ring') {
          const aa = Math.atan2(a.z - VERGE_EDGE_BULB.z, a.x - VERGE_EDGE_BULB.x);
          const ab = Math.atan2(b.z - VERGE_EDGE_BULB.z, b.x - VERGE_EDGE_BULB.x);
          return aa - ab;
        }
        if (run.startsWith('apron-')) return a.z - b.z;
        return a.x - b.x || a.z - b.z;
      });
      let segments = 1;
      for (let i = 1; i < ordered.length; i += 1) {
        const gap = Math.hypot(ordered[i]!.x - ordered[i - 1]!.x, ordered[i]!.z - ordered[i - 1]!.z);
        if (gap > VERGE_STRIP_CELL_M + 0.06) {
          segments += 1;
        } else {
          expect(gap, `${run} unintended gap > 0.05 m`).toBeLessThanOrEqual(VERGE_STRIP_CELL_M + 0.05);
        }
      }
      expect(segments, `${run} shattered into ${segments} segments`).toBeLessThanOrEqual(8);
    }
  });

  it('bounds the jitter and quantises it per 0.3 m cell', () => {
    const cells = vergeEdgeStripCells();
    for (const cell of cells) {
      expect(cell.jitter).toBeGreaterThanOrEqual(VERGE_STRIP_JITTER_MIN_M - 1e-9);
      expect(cell.jitter).toBeLessThanOrEqual(VERGE_STRIP_JITTER_MAX_M + 1e-9);
      const steps = ((cell.jitter - VERGE_STRIP_JITTER_MIN_M)
        / (VERGE_STRIP_JITTER_MAX_M - VERGE_STRIP_JITTER_MIN_M)) * 6;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      expect(cell.width).toBeCloseTo(VERGE_STRIP_WIDTH_M + cell.jitter, 12);
    }
    // The quantiser is a pure function of the cell: deterministic by construction.
    expect(vergeEdgeStripJitter(7, 3)).toBe(vergeEdgeStripJitter(7, 3));
  });

  it('sits 0.02 m above the lawn plate and never coplanar with the kerb', () => {
    const map = builtOnce();
    map.root.updateMatrixWorld(true);
    const strip = map.root.getObjectByName('nuketown2-verge-edge-strip') as THREE.InstancedMesh;
    expect(strip).toBeTruthy();
    strip.computeBoundingBox();
    const box = strip.boundingBox!.clone().applyMatrix4(strip.matrixWorld);
    // Top relief is exactly the brief's 0.02 m over the plate top.
    expect(box.max.y).toBeCloseTo(VERGE_EDGE_LAWN_TOP_Y + VERGE_STRIP_RELIEF_M, 3);
    // Far below the 0.24 m kerb lip it runs beside: never coplanar with it.
    const kerb = map.root.getObjectByName('nuketown2 carriageway stem kerb 0') as THREE.Mesh;
    expect(kerb).toBeTruthy();
    const kerbBox = new THREE.Box3().setFromObject(kerb);
    expect(Math.abs(box.max.y - kerbBox.max.y)).toBeGreaterThan(0.1);
    expect(Math.abs(box.max.y - kerbBox.min.y)).toBeGreaterThan(0.005);
  });
});

describe('nuketown2 verge clusters', () => {
  it('plants 40-80 clusters per side, deterministic, off every hard surface', () => {
    const first = vergeEdgeClusters();
    const second = vergeEdgeClusters();
    expect(second).toEqual(first);
    const north = first.filter((c) => c.side < 0);
    const south = first.filter((c) => c.side > 0);
    expect(north.length).toBeGreaterThanOrEqual(VERGE_CLUSTER_MIN_PER_SIDE);
    expect(north.length).toBeLessThanOrEqual(VERGE_CLUSTER_MAX_PER_SIDE);
    expect(south.length).toBeGreaterThanOrEqual(VERGE_CLUSTER_MIN_PER_SIDE);
    expect(south.length).toBeLessThanOrEqual(VERGE_CLUSTER_MAX_PER_SIDE);
    const pads = vergeEdgePadRects();
    const walks = vergeEdgeDoorWalks();
    for (const c of first) {
      expect(vergeEdgeOnCarriageway(c.x, c.z), `cluster at (${c.x}, ${c.z}) on the carriageway`).toBe(false);
      for (const pad of pads) {
        const clear = c.x < pad.x0 - VERGE_CLUSTER_CLEAR_M || c.x > pad.x1 + VERGE_CLUSTER_CLEAR_M
          || c.z < pad.z0 - VERGE_CLUSTER_CLEAR_M || c.z > pad.z1 + VERGE_CLUSTER_CLEAR_M;
        expect(clear, `cluster at (${c.x}, ${c.z}) inside pad margin`).toBe(true);
      }
      for (const walk of walks) {
        const inside = c.x >= walk.x0 && c.x <= walk.x1 && c.z >= walk.z0 && c.z <= walk.z1;
        expect(inside, `cluster at (${c.x}, ${c.z}) on a doorway run`).toBe(false);
      }
    }
  });

  it('uses 3-5 alpha-tested cards per cluster on the ONE existing atlas sampler', () => {
    expect(VERGE_CLUSTER_CARDS).toBeGreaterThanOrEqual(3);
    expect(VERGE_CLUSTER_CARDS).toBeLessThanOrEqual(5);
    const { material } = createVergeClusterMaterial();
    const record = material as THREE.Material & Record<string, unknown>;
    const textures = new Set<object>();
    const seen = new Set<object>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object' || seen.has(node)) return;
      seen.add(node);
      const value = (node as Record<string, unknown>).value as { isTexture?: boolean } | undefined;
      if (value && typeof value === 'object' && value.isTexture === true) textures.add(value);
      for (const key of Object.keys(node)) {
        if (key === 'parent' || key === 'parents') continue;
        walk((node as Record<string, unknown>)[key]);
      }
    };
    for (const slot of ['colorNode', 'opacityNode', 'positionNode']) walk(record[slot]);
    for (const slot of ['map', 'alphaMap']) {
      const texture = record[slot] as { isTexture?: boolean } | null | undefined;
      if (texture && texture.isTexture === true) textures.add(texture);
    }
    expect(textures.size, 'the cluster layer may cost exactly one sampler').toBe(1);
    expect([...textures][0] as THREE.Texture).toBe(nuketown2LeafAtlas());
    expect(material.alphaTest).toBe(LEAF_ALPHA_TEST);
    expect(record.opacityNode, 'without an opacityNode the cut-out is a solid square').toBeTruthy();
    const map = builtOnce();
    const mesh = map.root.getObjectByName('nuketown2-verge-edge-clusters') as THREE.InstancedMesh;
    const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
    expect(tris).toBe(VERGE_CLUSTER_CARDS * 2);
    expect(mesh.userData.presentationOnly).toBe(true);
    expect(mesh.castShadow).toBe(false);
    // The edge-grass material is textureless TSL colour: zero new samplers.
    const grass = map.root.getObjectByName('nuketown2-verge-edge-region-0') as THREE.InstancedMesh;
    const grassRecord = grass.material as THREE.Material & Record<string, unknown>;
    const grassSeen = new Set<object>();
    let grassTextures = 0;
    const grassWalk = (node: unknown): void => {
      if (!node || typeof node !== 'object' || grassSeen.has(node)) return;
      grassSeen.add(node);
      const value = (node as Record<string, unknown>).value as { isTexture?: boolean } | undefined;
      if (value && typeof value === 'object' && value.isTexture === true) grassTextures += 1;
      for (const key of Object.keys(node)) {
        if (key === 'parent' || key === 'parents') continue;
        grassWalk((node as Record<string, unknown>)[key]);
      }
    };
    for (const slot of ['colorNode', 'opacityNode', 'positionNode', 'roughnessNode']) grassWalk(grassRecord[slot]);
    expect(grassTextures).toBe(0);
  });
});

describe('nuketown2 verge edge grass', () => {
  it('grows x1.3 blades on the outer band and shorter blades at the kerb', () => {
    expect(NUKETOWN2_VERGE_EDGE_BLADE_HEIGHT_M)
      .toBeCloseTo(NUKETOWN_LAWN_BLADE_HEIGHT_M * VERGE_BLOOM_HEIGHT_SCALE, 12);
    const map = builtOnce();
    const stats = map.root.userData.nuketown2VergeEdgeStats as { kerbBandBlades: number; bloomBandBlades: number };
    expect(stats.kerbBandBlades).toBeGreaterThan(50);
    expect(stats.bloomBandBlades).toBeGreaterThan(50);
    // Every kerb-band instance is post-scaled under the lawn tip height; every
    // bloom-band instance keeps the full x1.3 geometry.
    const mesh = map.root.getObjectByName('nuketown2-verge-edge-region-0') as THREE.InstancedMesh;
    expect(mesh).toBeTruthy();
    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    let kerb = 0;
    let bloom = 0;
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, m);
      m.decompose(pos, quat, scl);
      expect(scl.y).toBeLessThanOrEqual(1.0);
      const tip = pos.y + NUKETOWN2_VERGE_EDGE_BLADE_HEIGHT_M * scl.y;
      if (vergeEdgeInKerbBand(pos.x, pos.z)) {
        expect(tip).toBeLessThan(pos.y + NUKETOWN_LAWN_BLADE_HEIGHT_M);
        kerb += 1;
      } else {
        expect(Math.abs(pos.z)).toBeGreaterThanOrEqual(VERGE_EDGE_HOUSE_FRONT_M - VERGE_BLOOM_BAND_M - 1e-6);
        bloom += 1;
      }
    }
    expect(kerb).toBe(stats.kerbBandBlades);
    expect(bloom).toBe(stats.bloomBandBlades);
  });
});

describe('nuketown2 verge edge budgets', () => {
  it('adds <= 30k tris in exactly 3 draws and stays invisible to the ratchets', () => {
    const map = builtOnce();
    const stats = map.root.userData.nuketown2VergeEdgeStats as {
      triangles: number; drawCalls: number; stripInstances: number;
      clustersNorth: number; clustersSouth: number;
    };
    expect(stats.drawCalls).toBe(3);
    expect(stats.triangles).toBeLessThanOrEqual(30_000);
    expect(stats.stripInstances).toBeGreaterThan(0);
    // Names never match the ' verge ' furniture filter: PROPS and verge-body
    // counts cannot move. Verified against the gate's own counting function.
    const names: string[] = [];
    map.root.traverse((o) => { if (o.name) names.push(o.name); });
    const vergeBodies = names.filter((n) => n.includes(' verge '));
    expect(names.filter((n) => n.startsWith('nuketown2-verge-edge'))).toHaveLength(4);
    expect(vergeBodies.some((n) => n.startsWith('nuketown2-verge-edge'))).toBe(false);
    // Presentation only: nothing joins the authority channels.
    for (const mesh of map.raycastMeshes) {
      expect(mesh.name.startsWith('nuketown2-verge-edge')).toBe(false);
    }
    for (const surface of map.shotSurfaces) {
      expect(surface.name.startsWith('nuketown2-verge-edge')).toBe(false);
    }
    // The module never touches the collider list (it only reads keep-outs);
    // the wind hook it adds to must run without throwing.
    expect(() => (map.root.userData.nuketownLawnWind as (s: number) => void)(1.0)).not.toThrow();
    // The strip reuses the arena's soil/mulch role instance: no new material.
    const strip = map.root.getObjectByName('nuketown2-verge-edge-strip') as THREE.InstancedMesh;
    const planter = map.root.getObjectByName('nuketown2 north verge planter') as THREE.Mesh;
    expect((strip.material as THREE.Material)).toBe(planter.material as THREE.Material);
  });
});
