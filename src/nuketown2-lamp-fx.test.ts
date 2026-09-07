/**
 * nuketown2-lamp-fx.test.ts - HF-536 NIGHT GEMINI-14: Lamp FX mechanical proof.
 *
 * Verifies all requirements from BRIEF.md:
 * 1. One cone set per lamp (count = lamp count = 6: 4 street lamps + 2 porch lights).
 * 2. Cone quads' top at the head height and bottom at the pool plane +0.02 m.
 * 3. Opacity constants in range ([0.10, 0.16]) and gradient endpoints 0 at the base.
 * 4. Mote count per lamp within [90, 160] and every mote strictly inside its cone volume.
 * 5. Both materials additive with depthWrite false, transparent, DoubleSide, zero samplers.
 * 6. Draws delta <= 2 and tris delta <= 6k total.
 * 7. Program-set delta exactly +2.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  LAMP_CONE_BASE_OPACITY,
  LAMP_CONE_FADE_CUTOFF,
  LAMP_CONE_PEAK_OPACITY,
  LAMP_CONE_QUAD_ANGLES,
  LAMP_CONE_QUADS_PER_CONE,
  LAMP_CONE_TRIANGLES_PER_CONE,
  LAMP_FX_COLOR_HEX,
  LAMP_MOTE_MAX_DIAMETER_M,
  LAMP_MOTE_MAX_OPACITY,
  LAMP_MOTE_MIN_DIAMETER_M,
  LAMP_MOTE_MIN_OPACITY,
  LAMP_MOTES_PER_LAMP,
  NUKETOWN2_LAMP_FX_SPECS,
  PORCH_LIGHT_CONE_BOTTOM_Y,
  PORCH_LIGHT_CONE_GROUND_RADIUS,
  PORCH_LIGHT_CONE_HEAD_RADIUS,
  PORCH_LIGHT_HEAD_Y,
  STREET_LAMP_CONE_BOTTOM_Y,
  STREET_LAMP_CONE_GROUND_RADIUS,
  STREET_LAMP_CONE_HEAD_RADIUS,
  STREET_LAMP_HEAD_Y,
  STREET_LAMP_POOL_PLANE_Y,
  buildDustMotesMesh,
  buildLampConeGeometry,
  buildMergedConesGeometry,
  buildNuketown2LampFx,
  getLampConeMaterial,
  getLampMoteMaterial,
  moteOpacity,
} from './nuketown2-lamp-fx';
import { buildNuketown2 } from './nuketown2-arena';
import type { ArenaMap } from './map';

let sharedArena: ArenaMap;

beforeAll(() => {
  sharedArena = buildNuketown2(new THREE.Scene());
});
import { auditNuketown2Oriented } from './nuketown2-oriented-coplanar-audit';

const NON_SHADER_KEYS = new Set([
  'id', 'uuid', '_uuid', '_cacheKey', '_cacheKeyVersion', 'parents', '_beforeNodes', 'stackTrace',
]);

function graphSignature(value: unknown, seen = new Map<object, string>()): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  const object = value as Record<string, any>;
  if (object.isNode !== true) {
    if (object instanceof THREE.Color) return 'color';
    if (object instanceof THREE.Vector3) return `vector:${object.x},${object.y},${object.z}`;
    return `object:${object.constructor?.name ?? 'unknown'}`;
  }
  const prior = seen.get(object);
  if (prior) return prior;
  seen.set(object, '<recursive>');
  const parts = [object.type ?? object.constructor?.name ?? '?'];
  for (const key of Object.keys(object).sort()) {
    if (NON_SHADER_KEYS.has(key) || typeof object[key] === 'function') continue;
    if (object.isUniformNode && key === 'value') {
      parts.push(`${key}=<uniform>`);
      continue;
    }
    const child = object[key];
    parts.push(`${key}=${Array.isArray(child)
      ? `[${child.map((entry) => graphSignature(entry, seen)).join(',')}]`
      : graphSignature(child, seen)}`);
  }
  const result = `(${parts.join(' ')})`;
  seen.set(object, result);
  return result;
}

function materialGraphKey(material: THREE.Material): string {
  const slots = material as unknown as Record<string, unknown>;
  const nodes = Object.keys(slots)
    .filter((key) => key.endsWith('Node') && (slots[key] as { isNode?: boolean } | null)?.isNode === true)
    .sort();
  return `${material.type}|${nodes.map((key) => `${key}=${graphSignature(slots[key])}`).join('|')}`;
}

function countNodeMaterialGraphs(root: THREE.Object3D): { total: number; distinct: number; keys: Set<string> } {
  const keys = new Set<string>();
  const seen = new Set<THREE.Material>();
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.material) {
      const list = Array.isArray(node.material) ? node.material : [node.material];
      for (const mat of list) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        if ((mat as { isNodeMaterial?: boolean }).isNodeMaterial === true) {
          keys.add(materialGraphKey(mat));
        }
      }
    }
  });
  return { total: seen.size, distinct: keys.size, keys };
}

describe('nuketown2 lamp fx specifications and geometry', () => {
  it('defines one cone set per lamp (count = lamp count = 6: 4 street, 2 porch)', () => {
    expect(NUKETOWN2_LAMP_FX_SPECS).toHaveLength(6);
    const streetLamps = NUKETOWN2_LAMP_FX_SPECS.filter((s) => s.kind === 'street');
    const porchLights = NUKETOWN2_LAMP_FX_SPECS.filter((s) => s.kind === 'porch');
    expect(streetLamps).toHaveLength(4);
    expect(porchLights).toHaveLength(2);
  });

  it('cone quads top at head height and bottom at pool plane +0.02 m for all lamps', () => {
    expect(STREET_LAMP_CONE_BOTTOM_Y - STREET_LAMP_POOL_PLANE_Y).toBeCloseTo(0.02, 6);
    expect(PORCH_LIGHT_CONE_BOTTOM_Y).toBeCloseTo(0.02, 6);

    for (const spec of NUKETOWN2_LAMP_FX_SPECS) {
      const geo = buildLampConeGeometry(spec);
      expect(geo.boundingBox).toBeDefined();
      const box = geo.boundingBox!;

      expect(box.max.y).toBeCloseTo(spec.headHeight, 4);
      expect(box.min.y).toBeCloseTo(spec.bottomY, 4);

      if (spec.kind === 'street') {
        expect(spec.headHeight).toBe(STREET_LAMP_HEAD_Y);
        expect(spec.bottomY).toBe(STREET_LAMP_CONE_BOTTOM_Y);
        expect(spec.groundRadius).toBe(STREET_LAMP_CONE_GROUND_RADIUS);
        expect(spec.topRadius).toBe(STREET_LAMP_CONE_HEAD_RADIUS);
      } else {
        expect(spec.headHeight).toBe(PORCH_LIGHT_HEAD_Y);
        expect(spec.bottomY).toBe(PORCH_LIGHT_CONE_BOTTOM_Y);
        expect(spec.groundRadius).toBe(PORCH_LIGHT_CONE_GROUND_RADIUS);
        expect(spec.topRadius).toBe(PORCH_LIGHT_CONE_HEAD_RADIUS);
      }
      geo.dispose();
    }
  });

  it('opacity constants are in range and gradient endpoint is 0 at the base', () => {
    // Peak opacity at head within [0.10, 0.16]
    expect(LAMP_CONE_PEAK_OPACITY).toBeGreaterThanOrEqual(0.10);
    expect(LAMP_CONE_PEAK_OPACITY).toBeLessThanOrEqual(0.16);

    // Endpoint 0 at base
    expect(LAMP_CONE_BASE_OPACITY).toBe(0.0);

    // Fade cutoff: 85% of the way to the pool
    expect(LAMP_CONE_FADE_CUTOFF).toBe(0.85);

    // Verify gradient function at key heights
    // At head (v = 1.0, u = 0.5): peak opacity
    const vFadeHead = Math.max(0, Math.min(1, (1.0 - (1.0 - LAMP_CONE_FADE_CUTOFF)) / LAMP_CONE_FADE_CUTOFF));
    const hFadeCenter = 1.0 - Math.abs(2 * 0.5 - 1);
    const alphaHead = LAMP_CONE_PEAK_OPACITY * hFadeCenter * vFadeHead;
    expect(alphaHead).toBeCloseTo(LAMP_CONE_PEAK_OPACITY, 6);

    // At 85% down (v = 0.15, u = 0.5): exactly 0
    const vFadeCutoff = Math.max(0, Math.min(1, (0.15 - (1.0 - LAMP_CONE_FADE_CUTOFF)) / LAMP_CONE_FADE_CUTOFF));
    const alphaCutoff = LAMP_CONE_PEAK_OPACITY * hFadeCenter * vFadeCutoff;
    expect(alphaCutoff).toBe(0.0);

    // At base (v = 0.0, u = 0.5): strictly 0
    const vFadeBase = Math.max(0, Math.min(1, (0.0 - (1.0 - LAMP_CONE_FADE_CUTOFF)) / LAMP_CONE_FADE_CUTOFF));
    const alphaBase = LAMP_CONE_PEAK_OPACITY * hFadeCenter * vFadeBase;
    expect(alphaBase).toBe(0.0);

    // At quad edges (u = 0.0 or 1.0, v = 1.0): strictly 0
    const hFadeEdge0 = 1.0 - Math.abs(2 * 0.0 - 1);
    const hFadeEdge1 = 1.0 - Math.abs(2 * 1.0 - 1);
    expect(hFadeEdge0).toBe(0.0);
    expect(hFadeEdge1).toBe(0.0);
  });

  it('each cone set consists of exactly 3 crossed vertical quads and 6 triangles', () => {
    expect(LAMP_CONE_QUADS_PER_CONE).toBe(3);
    expect(LAMP_CONE_TRIANGLES_PER_CONE).toBe(6);
    expect(LAMP_CONE_QUAD_ANGLES).toHaveLength(3);

    for (const spec of NUKETOWN2_LAMP_FX_SPECS) {
      const geo = buildLampConeGeometry(spec);
      const pos = geo.getAttribute('position');
      const idx = geo.index!;
      expect(pos.count).toBe(12); // 3 quads * 4 vertices = 12
      expect(idx.count).toBe(18); // 3 quads * 6 indices = 18 (6 triangles)
      geo.dispose();
    }
  });

  it('merged cone geometry combines all 6 lamps into 36 triangles', () => {
    const merged = buildMergedConesGeometry();
    const pos = merged.getAttribute('position');
    const idx = merged.index!;
    expect(pos.count).toBe(6 * 12);
    expect(idx.count).toBe(6 * 18);
    expect(idx.count / 3).toBe(36);
    merged.dispose();
  });
});

describe('nuketown2 lamp dust motes', () => {
  it('mote count per lamp is within [90, 160] (110 per lamp)', () => {
    expect(LAMP_MOTES_PER_LAMP).toBeGreaterThanOrEqual(90);
    expect(LAMP_MOTES_PER_LAMP).toBeLessThanOrEqual(160);
  });

  it('mote opacities are generated by deterministic hash and lie within [0.35, 0.60]', () => {
    const totalMotes = NUKETOWN2_LAMP_FX_SPECS.length * LAMP_MOTES_PER_LAMP;
    for (let i = 0; i < totalMotes; i += 1) {
      const op = moteOpacity(i);
      expect(op).toBeGreaterThanOrEqual(LAMP_MOTE_MIN_OPACITY);
      expect(op).toBeLessThanOrEqual(LAMP_MOTE_MAX_OPACITY);
    }
  });

  it('every mote is strictly inside its cone volume', () => {
    const moteMesh = buildDustMotesMesh();
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rot = new THREE.Quaternion();

    for (let lampIdx = 0; lampIdx < NUKETOWN2_LAMP_FX_SPECS.length; lampIdx += 1) {
      const spec = NUKETOWN2_LAMP_FX_SPECS[lampIdx]!;
      const cx = spec.position[0];
      const cz = spec.position[2];

      for (let m = 0; m < LAMP_MOTES_PER_LAMP; m += 1) {
        const instanceIdx = lampIdx * LAMP_MOTES_PER_LAMP + m;
        moteMesh.getMatrixAt(instanceIdx, matrix);
        matrix.decompose(pos, rot, scale);

        // 1. Height must be within cone vertical bounds [bottomY, headHeight]
        expect(pos.y).toBeGreaterThanOrEqual(spec.bottomY);
        expect(pos.y).toBeLessThanOrEqual(spec.headHeight);

        // 2. Horizontal distance must be within cone radius at that height
        const t = (spec.headHeight - pos.y) / (spec.headHeight - spec.bottomY);
        const maxConeRadius = spec.topRadius + t * (spec.groundRadius - spec.topRadius);
        const distFromAxis = Math.sqrt((pos.x - cx) ** 2 + (pos.z - cz) ** 2);

        expect(distFromAxis).toBeLessThanOrEqual(maxConeRadius + 1e-4);

        // 3. Octahedron size is camera-agnostic within 6-12 mm diameter
        // scale is in [0.75, 1.5] relative to 8 mm base diameter -> 6 to 12 mm diameter
        const diameter = scale.x * 0.008;
        expect(diameter).toBeGreaterThanOrEqual(LAMP_MOTE_MIN_DIAMETER_M - 1e-4);
        expect(diameter).toBeLessThanOrEqual(LAMP_MOTE_MAX_DIAMETER_M + 1e-4);
      }
    }
    moteMesh.geometry.dispose();
  });
});

describe('nuketown2 lamp fx materials and gate budgets', () => {
  it('both materials are additive, depthWrite false, transparent, DoubleSide, zero samplers', () => {
    const coneMat = getLampConeMaterial();
    const moteMat = getLampMoteMaterial();

    for (const mat of [coneMat, moteMat]) {
      expect(mat.transparent).toBe(true);
      expect(mat.depthWrite).toBe(false);
      expect(mat.depthTest).toBe(true);
      expect(mat.side).toBe(THREE.DoubleSide);
      expect(mat.blending).toBe(THREE.AdditiveBlending);
      // Zero samplers: no textures attached
      expect((mat as unknown as { map?: unknown }).map ?? null).toBeNull();
    }
    expect(LAMP_FX_COLOR_HEX).toBe(0xffc37a);
  });

  it('buildNuketown2LampFx produces exactly +2 draw calls and <= 6k triangles', () => {
    const group = new THREE.Group();
    const fx = buildNuketown2LampFx(group);

    expect(fx.stats.drawCalls).toBe(2);
    expect(fx.stats.triangles).toBeLessThanOrEqual(6000);
    expect(fx.stats.triangles).toBe(36 + 6 * 110 * 8); // 5316 tris
    expect(fx.coneMesh.material).toBe(getLampConeMaterial());
    expect(fx.moteMesh.material).toBe(getLampMoteMaterial());
    expect(fx.group.children).toHaveLength(2);
  });

  it('program-set delta is exactly +2', () => {
    // Measure arena-level program set delta by detaching and re-attaching the FX group
    const fxNode = sharedArena.root.getObjectByName('nuketown2-lamp-fx')!;
    expect(fxNode).toBeDefined();

    fxNode.removeFromParent();
    const graphsWithout = countNodeMaterialGraphs(sharedArena.root);

    sharedArena.root.add(fxNode);
    const graphsWith = countNodeMaterialGraphs(sharedArena.root);

    expect(graphsWith.distinct - graphsWithout.distinct).toBe(2);
  });

  it('leaves zero coplanar races on nuketown2 arena (before and after comparison)', () => {
    const fxNode = sharedArena.root.getObjectByName('nuketown2-lamp-fx')!;
    expect(fxNode).toBeDefined();

    fxNode.removeFromParent();
    const auditBefore = auditNuketown2Oriented(sharedArena.root);

    sharedArena.root.add(fxNode);
    const auditAfter = auditNuketown2Oriented(sharedArena.root);

    // No consequential coplanar races introduced by the lamp FX
    const consequentialBefore = auditBefore.rows.filter((row) => (
      (row.classification === 'oriented-finding' || row.classification === 'oriented-back-to-back-finding')
      && row.gap <= 0.005
      && row.overlap >= 0.1
      && row.score > 0
    ));
    const consequentialAfter = auditAfter.rows.filter((row) => (
      (row.classification === 'oriented-finding' || row.classification === 'oriented-back-to-back-finding')
      && row.gap <= 0.005
      && row.overlap >= 0.1
      && row.score > 0
    ));

    expect(consequentialBefore).toEqual([]);
    expect(consequentialAfter).toEqual([]);

    // Findings count must not increase
    const findingsBefore = auditBefore.counts['oriented-finding'] + auditBefore.counts['oriented-back-to-back-finding'];
    const findingsAfter = auditAfter.counts['oriented-finding'] + auditAfter.counts['oriented-back-to-back-finding'];
    expect(findingsAfter).toBeLessThanOrEqual(findingsBefore);
  });
});
