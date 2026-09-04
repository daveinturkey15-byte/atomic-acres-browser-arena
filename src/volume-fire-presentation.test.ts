/**
 * volume-fire-presentation.test.ts — bounded volumetric fire emitter contract.
 *
 * Pins the brief: step band 16-24, <= 4 authored emitters per arena,
 * uniform-only per-emitter data (one shared pipeline, HF-477), precompile
 * registration, settings off switch, and the nuke-fireball API.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARENA_IDS } from './arena-identity';
import {
  ADVANCED_GRAPHICS_CONTROLS,
  GRAPHICS_PRESET_VALUES,
} from './graphics-settings-registry';
import { nuketown2HandedX } from './nuketown2-layout';
import { NUKETOWN2_APPLIANCE_BANK } from './nuketown2-yard-props';
import {
  VOLUME_FIRE_AUTHORED_ARENAS,
  VOLUME_FIRE_MARCH_STEPS,
  VOLUME_FIRE_MAX_AUTHORED_PER_ARENA,
  VOLUME_FIRE_NUKE_SLOT,
  VOLUME_FIRE_POOL_CAPACITY,
  VolumeFirePresentationPool,
  volumeFireAuthoredPlacements,
} from './volume-fire-presentation';

/** Structural graph key ported from src/nuketown2-pipeline-budget.test.ts. */
const NON_SHADER_KEYS: ReadonlySet<string> = new Set([
  'id', 'uuid', '_uuid', '_cacheKey', '_cacheKeyVersion', 'parents', '_beforeNodes', 'stackTrace',
]);
const MAX_GRAPH_DEPTH = 400;

function nodeGraphSignature(value: unknown, memo: Map<object, string>, depth = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'fn';
  if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  const object = value as Record<string, unknown> & { isNode?: boolean; toArray?: () => number[] };
  if (object.isNode !== true) {
    if (typeof object.toArray === 'function') return `[${object.toArray().join(',')}]`;
    if (value instanceof THREE.Color) return `rgb(${value.r},${value.g},${value.b})`;
    return `obj:${(object as { constructor?: { name?: string } }).constructor?.name ?? 'unknown'}`;
  }
  const hit = memo.get(object);
  if (hit !== undefined) return hit;
  if (depth > MAX_GRAPH_DEPTH) return '<depth-limit>';
  memo.set(object, '<recursion>');
  const isUniform = (object as { isUniformNode?: boolean }).isUniformNode === true;
  const parts: string[] = [
    (object as { type?: string }).type ?? (object as { constructor?: { name?: string } }).constructor?.name ?? '?',
  ];
  for (const key of Object.keys(object).sort()) {
    if (NON_SHADER_KEYS.has(key)) continue;
    if (isUniform && key === 'value') { parts.push('value=<uniform>'); continue; }
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
  const memo = new Map<object, string>();
  const slots = material as unknown as Record<string, unknown>;
  const nodeSlots = Object.keys(slots)
    .filter((key) => key.endsWith('Node') && (slots[key] as { isNode?: boolean } | null)?.isNode === true)
    .sort();
  return `${material.type}|${nodeSlots.map((key) => `${key}=${nodeGraphSignature(slots[key], memo)}`).join('|')}`;
}

function poolSlotMaterials(pool: VolumeFirePresentationPool): THREE.Material[] {
  const materials: THREE.Material[] = [];
  pool.root.traverse((node) => {
    const holder = node as unknown as { material?: THREE.Material };
    if (holder.material) materials.push(holder.material);
  });
  return materials;
}

describe('volume fire march band and arena ceiling', () => {
  it('marches 16-24 steps per the brief', () => {
    expect(VOLUME_FIRE_MARCH_STEPS).toBeGreaterThanOrEqual(16);
    expect(VOLUME_FIRE_MARCH_STEPS).toBeLessThanOrEqual(24);
  });

  it('ships authored fire only on nuketown2 and skyline-terminal', () => {
    expect([...VOLUME_FIRE_AUTHORED_ARENAS].sort()).toEqual(['nuketown2', 'skyline-terminal']);
  });

  it('holds every arena at or below four authored emitters', () => {
    expect(VOLUME_FIRE_MAX_AUTHORED_PER_ARENA).toBeLessThanOrEqual(4);
    for (const arenaId of ARENA_IDS) {
      expect(volumeFireAuthoredPlacements(arenaId).length, arenaId)
        .toBeLessThanOrEqual(VOLUME_FIRE_MAX_AUTHORED_PER_ARENA);
    }
  });

  it('derives the nuketown2 pair through pair() semantics', () => {
    const specs = volumeFireAuthoredPlacements('nuketown2');
    expect(specs).toHaveLength(2);
    const bank = NUKETOWN2_APPLIANCE_BANK;
    const northX = nuketown2HandedX(bank.x);
    expect(specs[0]?.position).toEqual([northX, 0.95 + 0.55, bank.z]);
    expect(specs[1]?.position).toEqual([-northX, 0.95 + 0.55, -bank.z]);
    for (const spec of specs) {
      expect(spec?.halfExtents.every((v) => v > 0)).toBe(true);
      expect(spec?.position[1]).toBeGreaterThan(0.95);
    }
    expect(specs[0]?.seed).not.toBe(specs[1]?.seed);
  });

  it('derives skyline-terminal fires from the luggage-cart table', () => {
    const specs = volumeFireAuthoredPlacements('skyline-terminal');
    expect(specs).toHaveLength(2);
    expect(specs.map((spec) => [spec.position[0], spec.position[2]])).toEqual([[-8, 14], [8, 14]]);
    for (const spec of specs) expect(spec.position[1]).toBeCloseTo(1.7, 10);
  });
});

describe('volume fire uniform-only data (one pipeline, HF-477)', () => {
  it('builds byte-identical graphs for differently-seeded emitters', () => {
    const scene = new THREE.Scene();
    const pool = new VolumeFirePresentationPool(scene);
    pool.syncArena('nuketown2');
    pool.spawnNukeFireball([0, 2, 0], 7, 5.5, 0, 4_500);
    const keys = poolSlotMaterials(pool).map(materialGraphKey);
    expect(keys.length).toBe(VOLUME_FIRE_POOL_CAPACITY);
    for (const key of keys) expect(key).toBe(keys[0]);
    pool.dispose();
  });

  it('takes no fluid-compute path: no 3D textures, no compute nodes', () => {
    const source = readFileSync('src/volume-fire-presentation.ts', 'utf8');
    for (const token of ['Storage3DTexture', 'textureStore', 'compute(', 'VolumeNodeMaterial', 'Data3DTexture']) {
      expect(source, token).not.toContain(token);
    }
  });
});

describe('volume fire pool lifecycle', () => {
  it('syncs authored slots per arena and reserves the nuke slot', () => {
    const scene = new THREE.Scene();
    const pool = new VolumeFirePresentationPool(scene);
    pool.syncArena('nuketown2');
    expect(pool.telemetry().authored).toBe(2);
    pool.spawnNukeFireball([0, 2, 0], 7, 5.5, 1_000, 5_500);
    expect(pool.telemetry().active).toBe(3);
    // Authored re-sync never touches the reserved fireball slot.
    pool.syncArena('skyline-terminal');
    expect(pool.telemetry().authored).toBe(2);
    expect(pool.telemetry().active).toBe(3);
    pool.syncArena('gun-range');
    expect(pool.telemetry().authored).toBe(0);
    expect(pool.telemetry().active).toBe(1);
    pool.dispose();
  });

  it('expires the fireball on the NukeSequence clock and keeps authored fire', () => {
    const scene = new THREE.Scene();
    const pool = new VolumeFirePresentationPool(scene);
    pool.syncArena('nuketown2');
    pool.spawnNukeFireball([0, 2, 0], 7, 5.5, 1_000, 5_500);
    pool.update(2_000);
    expect(pool.telemetry().active).toBe(3);
    pool.update(5_499);
    expect(pool.telemetry().active).toBe(3);
    pool.update(5_500);
    expect(pool.telemetry().active).toBe(2);
    pool.releaseNukeFireball();
    pool.update(6_000);
    expect(pool.telemetry().active).toBe(2);
    pool.clear();
    expect(pool.telemetry().active).toBe(0);
    pool.dispose();
  });

  it('adds no scene graph and changes no counts across frames', () => {
    const scene = new THREE.Scene();
    const pool = new VolumeFirePresentationPool(scene);
    pool.syncArena('nuketown2');
    pool.spawnNukeFireball([0, 2, 0], 7, 5.5, 0, 60_000);
    const rootChildren = pool.root.children.length;
    const sceneChildren = scene.children.length;
    for (let frame = 0; frame < 60; frame += 1) pool.update(frame * 16.7);
    expect(pool.root.children.length).toBe(rootChildren);
    expect(scene.children.length).toBe(sceneChildren);
    expect(pool.telemetry().capacity).toBe(VOLUME_FIRE_POOL_CAPACITY);
    expect(pool.telemetry().dynamicLights).toBe(0);
    pool.dispose();
  });

  it('hides the whole stage on the off tier', () => {
    const scene = new THREE.Scene();
    const pool = new VolumeFirePresentationPool(scene);
    pool.syncArena('nuketown2');
    pool.applyVolumeFireTier('off');
    expect(pool.root.visible).toBe(false);
    pool.update(1_000);
    for (const child of pool.root.children) expect(child.visible).toBe(false);
    pool.applyVolumeFireTier('high');
    expect(pool.root.visible).toBe(true);
    pool.dispose();
  });
});

describe('volume fire settings and precompile registration', () => {
  it('ships a volumeFire control with an off switch', () => {
    const definition = ADVANCED_GRAPHICS_CONTROLS.find(({ key }) => key === 'volumeFire');
    expect(definition).toBeDefined();
    expect(definition?.category).toBe('atmosphere');
    expect(definition?.applyMode).toBe('live');
    expect(definition?.kind === 'select' ? definition.options.map(({ value }) => value) : []).toEqual(['off', 'low', 'high']);
  });

  it('carries the control on every preset, off below Quality', () => {
    expect(GRAPHICS_PRESET_VALUES.performance.volumeFire).toBe('off');
    expect(GRAPHICS_PRESET_VALUES.balanced.volumeFire).toBe('off');
    expect(GRAPHICS_PRESET_VALUES.high.volumeFire).toBe('low');
    expect(GRAPHICS_PRESET_VALUES.max.volumeFire).toBe('high');
  });

  it('prewarms the one pipeline at menu time and drives the nuke slot from the nuke lane', () => {
    const legacy = readFileSync('src/legacy-main.ts', 'utf8');
    expect(legacy).toContain('new VolumeFirePresentationPool');
    expect(legacy).toContain('volumeFirePresentation.prewarm(');
    expect(legacy).toContain('volumeFirePresentation.syncArena(');
    expect(legacy).toContain('volumeFirePresentation.spawnNukeFireball(');
    expect(legacy).toContain('volumeFirePresentation.releaseNukeFireball()');
    expect(legacy).toContain('volumeFirePresentation.update(');
  });

  it('keeps the nuke slot index out of the authored range', () => {
    expect(VOLUME_FIRE_NUKE_SLOT).toBe(VOLUME_FIRE_MAX_AUTHORED_PER_ARENA);
    expect(VOLUME_FIRE_POOL_CAPACITY).toBe(VOLUME_FIRE_MAX_AUTHORED_PER_ARENA + 1);
  });
});
