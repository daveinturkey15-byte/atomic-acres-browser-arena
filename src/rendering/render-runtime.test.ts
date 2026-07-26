import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  classifyPresentationFreshness,
  configureSceneLightShadowSchedule,
  resolveRenderRuntimeRequest,
  webGpuRenderInfoSnapshot,
} from './render-runtime';
import { assertTslCutoverReady, assertTslReviewAuthored, pendingTslMigrationIds, TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';

describe('Pass 64 render runtime boundary', () => {
  it('makes WebGPU fail-closed by default and keeps WebGL2 behind an explicit compatibility query', () => {
    expect(resolveRenderRuntimeRequest('')).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
    expect(resolveRenderRuntimeRequest('?renderer=webgpu')).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
    expect(resolveRenderRuntimeRequest('?renderer=webgpu&requireWebGPU=1')).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
    expect(resolveRenderRuntimeRequest('?renderer=webgl2')).toEqual({ requestedBackend: 'webgl2', requireWebGPU: false });
  });

  it('admits the cutover only after every custom GLSL owner has a verified TSL graph', () => {
    expect(TSL_MIGRATION_INVENTORY.map((entry) => entry.id)).toEqual([
      'procedural-atmosphere-sky',
      'atomic-signal-hdr',
      'atmosphere-mist',
      'atmosphere-smoke',
      'atmosphere-dust',
      'procedural-grass',
      'perimeter-water',
    ]);
    expect(pendingTslMigrationIds()).toHaveLength(0);
    expect(new Set(TSL_MIGRATION_INVENTORY.map((entry) => entry.status))).toEqual(new Set(['verified']));
    expect(() => assertTslReviewAuthored()).not.toThrow();
    expect(() => assertTslCutoverReady()).not.toThrow();
  });

  it('accepts only an entirely verified inventory', () => {
    const verified = TSL_MIGRATION_INVENTORY.map((entry) => ({ ...entry, status: 'verified' as const }));
    expect(() => assertTslCutoverReady(verified)).not.toThrow();
  });

  it('classifies queue completion freshness independently of simulation cadence', () => {
    const classify = (overrides: Partial<Parameters<typeof classifyPresentationFreshness>[0]> = {}) => classifyPresentationFreshness({
      deviceLost: false,
      completionFailures: 0,
      submissionSequence: 12,
      completedSequence: 11,
      pendingForMs: 50,
      stallThresholdMs: 1_500,
      ...overrides,
    });
    expect(classify({ submissionSequence: 0, completedSequence: 0 })).toBe('warming');
    expect(classify()).toBe('healthy');
    expect(classify({ pendingForMs: 1_501 })).toBe('stalled');
    expect(classify({ completionFailures: 1 })).toBe('failed');
    expect(classify({ deviceLost: true, completionFailures: 1 })).toBe('device-lost');
  });

  it('uses current-frame WebGPU draw calls instead of cumulative lifetime render calls', () => {
    const commonRendererMetrics = {
      calls: 9_999,
      drawCalls: 0,
      frameCalls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
    };
    expect(webGpuRenderInfoSnapshot(commonRendererMetrics)).toEqual({
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
    });
  });

  it('schedules static shadows on each WebGPU light instead of a WebGL-only renderer flag', () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight();
    const practical = new THREE.SpotLight();
    const unshadowed = new THREE.PointLight();
    sun.castShadow = true;
    practical.castShadow = true;
    unshadowed.castShadow = false;
    scene.add(sun, practical, unshadowed);
    expect(configureSceneLightShadowSchedule(scene, false, true)).toBe(2);
    expect([sun, practical].every((light) => !light.shadow.autoUpdate && light.shadow.needsUpdate)).toBe(true);
    expect(configureSceneLightShadowSchedule(scene, false, false)).toBe(2);
    expect([sun, practical].every((light) => !light.shadow.autoUpdate && !light.shadow.needsUpdate)).toBe(true);
  });
});
