import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildNuketown2 } from './nuketown2-arena';
import {
  createNuketown2MaterialRegistry,
  NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS,
} from './nuketown2-materials';

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

function nodeMaterials(root: THREE.Object3D): Array<{ name: string; key: string }> {
  const entries: Array<{ name: string; key: string }> = [];
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    const holder = object as unknown as { material?: THREE.Material | THREE.Material[] };
    const materials = Array.isArray(holder.material)
      ? holder.material
      : holder.material ? [holder.material] : [];
    for (const material of materials) {
      if (seen.has(material)) continue;
      seen.add(material);
      if ((material as { isNodeMaterial?: boolean }).isNodeMaterial === true) {
        entries.push({ name: material.name || '(unnamed)', key: materialGraphKey(material) });
      }
    }
  });
  return entries;
}

describe('HF-491 Nuke Town WebGPU pipeline budget', () => {
  it('shares the registry into eight family graphs', () => {
    const registry = createNuketown2MaterialRegistry() as unknown as Record<string, THREE.Material>;
    const keys = Object.values(registry).map(materialGraphKey);
    expect(new Set(keys).size).toBeLessThanOrEqual(8);
    expect(keys.length).toBeGreaterThanOrEqual(18);
  });

  it('keeps the complete built arena below the measured 40-graph ceiling', () => {
    const scene = new THREE.Scene();
    const root = buildNuketown2(scene).root;
    const entries = nodeMaterials(root);
    const keys = entries.map(({ key }) => key);
    const groups = new Map<string, string[]>();
    for (const { name, key } of entries) groups.set(key, [...(groups.get(key) ?? []), name]);
    expect(keys.length).toBeGreaterThanOrEqual(60);
    expect(new Set(keys).size, [...groups.values()].map((names) => names.join(' | ')).join('\n')).toBeLessThanOrEqual(NUKETOWN2_MAX_DISTINCT_MATERIAL_GRAPHS);
  });
});
