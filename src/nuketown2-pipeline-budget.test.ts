/**
 * HF-477 / HF-491 regression: the arena and the vehicle forge stay inside the
 * WebGPU graph-shape admission fence.
 *
 * The key is structural rather than node identity. TSL uniforms carry values
 * in a buffer and therefore do not alter generated shader source; constants do
 * alter it. This is the small CPU-only instrument used by the material budget
 * gate, and it also catches a paint colour accidentally being baked into a
 * forge graph again.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import * as TSL from 'three/tsl';

import { buildNuketown2 } from './nuketown2-arena';
import { NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS } from './nuketown2-materials';
import { createForgeChromeMaterial, createForgeMaterialSet } from './vehicle-forge';

const NON_SHADER_KEYS: ReadonlySet<string> = new Set([
  'id', 'uuid', '_uuid', '_cacheKey', '_cacheKeyVersion', 'parents', '_beforeNodes', 'stackTrace',
]);
const MAX_GRAPH_DEPTH = 400;

function nodeGraphSignature(value: unknown, memo: Map<object, string>, depth = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  const kind = typeof value;
  if (kind === 'function') return 'fn';
  if (kind !== 'object') return JSON.stringify(value) ?? String(value);

  const object = value as Record<string, unknown> & {
    isNode?: boolean;
    isUniformNode?: boolean;
    toArray?: () => number[];
  };
  if (object.isNode !== true) {
    if (typeof object.toArray === 'function') return `[${object.toArray().join(',')}]`;
    if (object instanceof THREE.Color) return `rgb(${object.r},${object.g},${object.b})`;
    return `obj:${(object as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'}`;
  }

  const hit = memo.get(object);
  if (hit !== undefined) return hit;
  memo.set(object, '<recursion>');
  if (depth > MAX_GRAPH_DEPTH) return '<depth-limit>';
  const parts: string[] = [
    (object as { type?: string }).type
      ?? (object as { constructor?: { name?: string } }).constructor?.name
      ?? '?',
  ];
  for (const key of Object.keys(object).sort()) {
    if (NON_SHADER_KEYS.has(key)) continue;
    if (object.isUniformNode && key === 'value') {
      parts.push('value=<uniform>');
      continue;
    }
    const child = object[key];
    if (typeof child === 'function') continue;
    if (Array.isArray(child)) {
      parts.push(`${key}=[${child.map((entry) => nodeGraphSignature(entry, memo, depth + 1)).join(',')}]`);
      continue;
    }
    parts.push(`${key}=${nodeGraphSignature(child, memo, depth + 1)}`);
  }
  const signature = `(${parts.join(' ')})`;
  memo.set(object, signature);
  return signature;
}

function materialGraphKey(material: THREE.Material): string {
  const slots = material as unknown as Record<string, unknown>;
  const nodeSlots = Object.keys(slots)
    .filter((key) => key.endsWith('Node') && (slots[key] as { isNode?: boolean } | null)?.isNode === true)
    .sort();
  return `${material.type}|${nodeSlots.map((key) => `${key}=${nodeGraphSignature(slots[key], new Map())}`).join('|')}`;
}

function uniformValues(material: THREE.Material): number[] {
  const values: number[] = [];
  const seen = new Set<object>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== 'object') return;
    const object = value as Record<string, unknown> & { isNode?: boolean; isUniformNode?: boolean; value?: unknown };
    if (seen.has(object)) return;
    seen.add(object);
    if (object.isUniformNode === true) {
      const uniform = object.value as { x?: number; y?: number; z?: number } | undefined;
      if (uniform && typeof uniform.x === 'number' && typeof uniform.y === 'number' && typeof uniform.z === 'number') {
        values.push(uniform.x, uniform.y, uniform.z);
      }
      return;
    }
    for (const child of Object.values(object)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit((material as unknown as Record<string, unknown>).colorNode);
  return values;
}

function nodeMaterials(root: THREE.Object3D): string[] {
  const keys: string[] = [];
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    const holder = object as unknown as { material?: THREE.Material | THREE.Material[] };
    const materials = Array.isArray(holder.material)
      ? holder.material
      : holder.material ? [holder.material] : [];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      if ((material as { isNodeMaterial?: boolean }).isNodeMaterial === true) keys.push(materialGraphKey(material));
    }
  });
  return keys;
}

describe('HF-477 nuketown2 WebGPU pipeline budget', () => {
  it('measures constants and uniforms differently', () => {
    const constant = (hex: number): THREE.Material => {
      const material = new MeshStandardNodeMaterial();
      (material as unknown as Record<string, unknown>).colorNode = (TSL.vec3 as any)(
        new THREE.Color(hex).r,
        new THREE.Color(hex).g,
        new THREE.Color(hex).b,
      );
      return material;
    };
    const uniform = (hex: number): THREE.Material => {
      const material = new MeshStandardNodeMaterial();
      const color = new THREE.Color(hex);
      (material as unknown as Record<string, unknown>).colorNode = (TSL.uniform as any)(
        new THREE.Vector3(color.r, color.g, color.b),
      );
      return material;
    };
    expect(materialGraphKey(constant(0x173451))).not.toBe(materialGraphKey(constant(0xf4eee0)));
    expect(materialGraphKey(uniform(0x173451))).toBe(materialGraphKey(uniform(0xf4eee0)));
  });

  it('keeps the complete built arena at or below the 54-graph fence', () => {
    const scene = new THREE.Scene();
    const root = buildNuketown2(scene).root;
    const keys = nodeMaterials(root);
    // The perf lane's shared forge buckets reduce the built-node count versus
    // the pre-merge 80-material candidate. Keep a non-empty layer floor while
    // measuring the current branch's actual arena, not that retired baseline.
    expect(keys.length, 'the arena still uses its node-material layer').toBeGreaterThanOrEqual(60);
    expect(new Set(keys).size, `built ${new Set(keys).size} graphs from ${keys.length} node materials`)
      .toBeLessThanOrEqual(NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS);
  });

  it('keeps forge paint colours in one uniform-carried graph', () => {
    const coach = createForgeMaterialSet(0xe7dec6, 'budget-coach', 0xa8382c);
    const navy = createForgeMaterialSet(0x173451, 'budget-navy', 0xf4eee0);
    const navyPaint = navy.paint;
    const cream = coach.paint;
    const maroon = coach.accent;
    expect(materialGraphKey(navyPaint)).toBe(materialGraphKey(cream));
    expect(materialGraphKey(cream)).toBe(materialGraphKey(maroon));
    for (const material of [navyPaint, cream, maroon]) {
      expect(material.userData.forgePaintUniform).toBe(true);
      expect(material.userData.forgeRole).toBe('paint');
    }
    for (const [material, hex] of [[navyPaint, 0x173451], [cream, 0xe7dec6], [maroon, 0xa8382c]] as const) {
      const expected = new THREE.Color().setHex(hex, THREE.SRGBColorSpace);
      expect(uniformValues(material)).toEqual([
        expect.closeTo(expected.r, 12),
        expect.closeTo(expected.g, 12),
        expect.closeTo(expected.b, 12),
      ]);
    }
  });

  it('keeps the chrome role explicit for non-purple bumpers', () => {
    const chrome = createForgeChromeMaterial();
    expect(chrome.name).toBe('vehicle-forge-chrome');
    expect(chrome.userData.forgeRole).toBe('chrome');
  });
});
