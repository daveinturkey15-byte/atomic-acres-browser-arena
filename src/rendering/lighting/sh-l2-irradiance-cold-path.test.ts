/**
 * HF-486 — SH-L2 cold-path contract: the arena transition never bakes.
 *
 * The review measured ~2,452 ms of synchronous bake ON the Nuke Town cold
 * transition, against a 10 s cold-admission budget that is already red. So:
 *
 * 1. The transition seam (`configureNuketown2ShL2[ForArena]`) must never call
 *    the synchronous whole-volume bake — proven with a throwing spy on the
 *    bake backend, not by reading a clock (PASS 89: a wall-clock assertion
 *    on a shared workstation measures the machine).
 * 2. A chunked session stepped under small budgets must produce a
 *    byte-identical volume to the one-shot bake — otherwise the menu-idle
 *    driver would converge to a different volume than the cached one.
 * 3. The digest-guarded persistent cache must round-trip a volume and must
 *    refuse corrupt entries with a miss (null), never a throw.
 * 4. A pending transition must resolve end to end: pending receipt, fallback
 *    (added term exactly zero), drained bake, persistent entry, instant
 *    cached bind on the next boot.
 */

import { readFileSync } from 'node:fs';
import type { Group } from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProxyShape, ProxyScene } from '../raytracing/analytic-proxy-scene';
import { vec3 } from '../raytracing/analytic-proxy-scene';
import {
  bakeShL2Volume,
  beginShL2Bake,
  deriveShL2Grid,
  SH_L2_FLOATS_PER_PROBE,
  type ShL2BakeOptions,
  type ShL2Volume,
} from './sh-l2-irradiance';
import {
  readCachedShL2Volume,
  shL2CacheKey,
  storeShL2Volume,
  type ShL2Storage,
} from './sh-l2-irradiance-cache';
import {
  __shL2ColdPathForTests,
  configureNuketown2ShL2ForArena,
} from './sh-l2-irradiance-runtime';
import { evaluateIndirectTerm } from './indirect-term';

class MemoryStorage implements ShL2Storage {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  raw(key: string): string | undefined {
    return this.data.get(key);
  }
}

function shape(overrides: Partial<ProxyShape>): ProxyShape {
  return Object.freeze({
    kind: 'box',
    centre: vec3(0, 0, 0),
    halfExtents: vec3(1, 1, 1),
    yaw: 0,
    normal: vec3(0, 1, 0),
    albedo: vec3(0.5, 0.5, 0.5),
    metalness: 0,
    roughness: 1,
    name: 'cold-path-fixture',
    ...overrides,
  }) as ProxyShape;
}

function scene(shapes: ProxyShape[]): ProxyScene {
  return Object.freeze({
    shapes: Object.freeze(shapes),
    boundsMin: vec3(-50, -1, -50),
    boundsMax: vec3(50, 20, 50),
    candidatesConsidered: shapes.length,
    reflectiveMeshCount: 0,
    reflectiveFootprintM2: 0,
    capReason: 'cold-path-fixture',
  }) as ProxyScene;
}

const DAYLIGHT = Object.freeze({
  sunDirection: vec3(0.4, 0.8, 0.447),
  sunColour: vec3(3, 2.9, 2.7),
  skyZenithColour: vec3(0.3, 0.45, 0.8),
  skyHorizonColour: vec3(0.6, 0.65, 0.75),
  skyGroundColour: vec3(0.15, 0.14, 0.12),
});

function tinyOptions(): ShL2BakeOptions {
  const grid = deriveShL2Grid(
    { minM: vec3(0, 0, 0), maxM: vec3(4, 2, 4) },
    { spacingM: 2, heightM: 2, paddingM: 0 },
  );
  return {
    arenaId: 'cold-path',
    conditionId: 'golden-hour',
    grid,
    lighting: DAYLIGHT,
    occluders: scene([shape({ centre: vec3(0, 1, 3), halfExtents: vec3(3, 1, 0.4) })]),
    raysPerProbe: 8,
    bounces: 1,
    seed: 0x50_11,
  };
}

describe('SH-L2 chunked session', () => {
  it('produces byte-identical coefficients to the one-shot bake under worst-case chunking', () => {
    const options = tinyOptions();
    const oneShot = bakeShL2Volume(options);
    const session = beginShL2Bake(options);
    // `step(0)` is the worst chunking there is: one probe per step, so the
    // session crosses its budget boundary on every single probe.
    let steps = 0;
    while (!session.step(0)) {
      steps += 1;
      expect(steps).toBeLessThan(100_000);
    }
    expect(session.progress()).toBe(1);
    expect(session.done()).toBe(true);
    const chunked = session.volume();
    expect(chunked.digest).toBe(oneShot.digest);
    expect(chunked.bake.deringedProbes).toBe(oneShot.bake.deringedProbes);
    expect(chunked.bake.demotedProbes).toBe(oneShot.bake.demotedProbes);
    expect(Array.from(chunked.coefficients)).toEqual(Array.from(oneShot.coefficients));
  });

  it('makes progress without finishing on a zero budget over a multi-probe grid', () => {
    const options = tinyOptions();
    const probes = options.grid.dimensions[0] * options.grid.dimensions[1] * options.grid.dimensions[2];
    expect(probes).toBeGreaterThan(1);
    const session = beginShL2Bake(options);
    expect(session.step(0)).toBe(false);
    expect(session.done()).toBe(false);
    expect(session.progress()).toBeGreaterThan(0);
    expect(session.progress()).toBeLessThan(1);
    expect(session.step(Number.POSITIVE_INFINITY)).toBe(true);
  });
});

describe('SH-L2 digest cache', () => {
  it('round-trips a volume through storage', () => {
    const storage = new MemoryStorage();
    const volume = bakeShL2Volume(tinyOptions());
    expect(storeShL2Volume(storage, volume)).toBe(true);
    const restored = readCachedShL2Volume(storage, volume.digest);
    expect(restored).not.toBeNull();
    expect(restored!.digest).toBe(volume.digest);
    expect(restored!.arenaId).toBe(volume.arenaId);
    expect(restored!.conditionId).toBe(volume.conditionId);
    expect([...restored!.dimensions]).toEqual([...volume.dimensions]);
    expect(Array.from(restored!.coefficients)).toEqual(Array.from(volume.coefficients));
  });

  it('misses — never throws — on unknown, corrupt and mismatched entries', () => {
    const storage = new MemoryStorage();
    const volume = bakeShL2Volume(tinyOptions());
    expect(readCachedShL2Volume(storage, volume.digest)).toBeNull();
    expect(readCachedShL2Volume(null, volume.digest)).toBeNull();
    expect(storeShL2Volume(null, volume)).toBe(false);
    expect(readCachedShL2Volume(storage, 'deadbeef')).toBeNull();
    storage.setItem(shL2CacheKey(volume.digest), '{not-json');
    expect(readCachedShL2Volume(storage, volume.digest)).toBeNull();
    expect(storeShL2Volume(storage, volume)).toBe(true);
    const tampered = JSON.stringify({ ...JSON.parse(storage.raw(shL2CacheKey(volume.digest))!), version: 999 });
    storage.setItem(shL2CacheKey(volume.digest), tampered);
    expect(readCachedShL2Volume(storage, volume.digest)).toBeNull();
  });

  it('refuses a coefficient payload of the wrong length', () => {
    const storage = new MemoryStorage();
    const volume = bakeShL2Volume(tinyOptions());
    expect(storeShL2Volume(storage, volume)).toBe(true);
    const parsed = JSON.parse(storage.raw(shL2CacheKey(volume.digest))!) as { coefficients: string };
    parsed.coefficients = parsed.coefficients.slice(0, 64);
    storage.setItem(shL2CacheKey(volume.digest), JSON.stringify(parsed));
    expect(readCachedShL2Volume(storage, volume.digest)).toBeNull();
  });
});

describe('SH-L2 transition never bakes synchronously', () => {
  beforeEach(() => {
    __shL2ColdPathForTests.reset();
    vi.restoreAllMocks();
  });

  it('does not call the whole-volume bake on the transition path', () => {
    const backend = __shL2ColdPathForTests.backend;
    const realBake = backend.bakeVolume;
    const spy = vi.fn((): ShL2Volume => {
      throw new Error('transition must never bake synchronously');
    });
    backend.bakeVolume = spy;
    try {
      const storage = new MemoryStorage();
      const receipt = configureNuketown2ShL2ForArena(
        {} as Group, 'high', 83031, 42, 'authored', 0, storage,
      );
      expect(spy).not.toHaveBeenCalled();
      expect(receipt.pending).toBe(true);
      expect(__shL2ColdPathForTests.pendingBakes()).toBe(1);
    } finally {
      backend.bakeVolume = realBake;
    }
  });

  it('holds the zero fallback while pending and binds the cached volume on the next boot', { timeout: 60_000 }, () => {
    const storage = new MemoryStorage();
    const first = configureNuketown2ShL2ForArena(
      {} as Group, 'high', 83031, 42, 'authored', 0, storage,
    );
    expect(first.pending).toBe(true);
    // The fallback is the frozen path: the added term is exactly zero.
    expect(evaluateIndirectTerm([0.4, 0.3, 0.2], false, 0.55)).toEqual([0, 0, 0]);
    expect(__shL2ColdPathForTests.pump(Number.POSITIVE_INFINITY, storage)).toBe(1);
    expect(__shL2ColdPathForTests.pendingBakes()).toBe(0);
    expect(storage.raw(shL2CacheKey(first.digest))).toContain(first.digest);
    // Second cold boot with the same inputs: no bake, no session, instant bind.
    const backend = __shL2ColdPathForTests.backend;
    const bakeSpy = vi.spyOn(backend, 'bakeVolume');
    const beginSpy = vi.spyOn(backend, 'beginBake');
    const second = configureNuketown2ShL2ForArena(
      {} as Group, 'high', 83031, 42, 'authored', 0, storage,
    );
    expect(second.pending).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.digest).toBe(first.digest);
    expect(bakeSpy).not.toHaveBeenCalled();
    expect(beginSpy).not.toHaveBeenCalled();
    expect(Number.isFinite(second.directIlluminanceLux)).toBe(true);
  });

  it('keeps the synchronous bake out of the transition seam source', () => {
    const source = readFileSync('src/rendering/lighting/sh-l2-irradiance-runtime.ts', 'utf8');
    for (const name of ['export function configureNuketown2ShL2(', 'export function configureNuketown2ShL2ForArena(']) {
      const start = source.indexOf(name);
      expect(start, name).toBeGreaterThanOrEqual(0);
      const next = source.indexOf('\nexport function ', start + 1);
      const nextConst = source.indexOf('\nexport const ', start + 1);
      const end = [next, nextConst].filter((index) => index >= 0).reduce((a, b) => Math.min(a, b), source.length);
      const body = source.slice(start, end);
      expect(body, name).not.toContain('.bake(');
      expect(body, name).not.toContain('bakeVolume(');
    }
  });
});

describe('SH-L2 cold-path volume integrity', () => {
  it('holds 27 floats per probe through the session and the cache', () => {
    const options = tinyOptions();
    const probes = options.grid.dimensions[0] * options.grid.dimensions[1] * options.grid.dimensions[2];
    const session = beginShL2Bake(options);
    session.step(Number.POSITIVE_INFINITY);
    const volume = session.volume();
    expect(volume.coefficients).toHaveLength(probes * SH_L2_FLOATS_PER_PROBE);
    const storage = new MemoryStorage();
    expect(storeShL2Volume(storage, volume)).toBe(true);
    expect(readCachedShL2Volume(storage, volume.digest)!.coefficients)
      .toHaveLength(probes * SH_L2_FLOATS_PER_PROBE);
  });
});
