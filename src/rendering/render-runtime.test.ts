import { describe, expect, it } from 'vitest';
import { resolveRenderRuntimeRequest } from './render-runtime';
import { assertTslCutoverReady, assertTslReviewAuthored, pendingTslMigrationIds, TSL_MIGRATION_INVENTORY } from './tsl-migration-inventory';

describe('Pass 64 render runtime boundary', () => {
  it('keeps the shipped path explicit WebGL2 and only treats an exact query as WebGPU', () => {
    expect(resolveRenderRuntimeRequest('')).toEqual({ requestedBackend: 'webgl2', requireWebGPU: false });
    expect(resolveRenderRuntimeRequest('?renderer=webgpu')).toEqual({ requestedBackend: 'webgpu', requireWebGPU: false });
    expect(resolveRenderRuntimeRequest('?renderer=webgpu&requireWebGPU=1')).toEqual({ requestedBackend: 'webgpu', requireWebGPU: true });
  });

  it('fails the cutover closed while any custom GLSL owner lacks a verified TSL graph', () => {
    expect(TSL_MIGRATION_INVENTORY.map((entry) => entry.id)).toEqual([
      'procedural-atmosphere-sky',
      'atomic-signal-hdr',
      'atmosphere-mist',
      'atmosphere-smoke',
      'atmosphere-dust',
      'procedural-grass',
      'perimeter-water',
    ]);
    expect(pendingTslMigrationIds()).toHaveLength(TSL_MIGRATION_INVENTORY.length);
    expect(new Set(TSL_MIGRATION_INVENTORY.map((entry) => entry.status))).toEqual(new Set(['tsl-authored']));
    expect(() => assertTslReviewAuthored()).not.toThrow();
    expect(() => assertTslCutoverReady()).toThrow(/unverified TSL pipelines/);
  });

  it('accepts only an entirely verified inventory', () => {
    const verified = TSL_MIGRATION_INVENTORY.map((entry) => ({ ...entry, status: 'verified' as const }));
    expect(() => assertTslCutoverReady(verified)).not.toThrow();
  });
});
