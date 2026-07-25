import { describe, expect, it } from 'vitest';
import { resolveRenderRuntimeRequest } from './render-runtime';
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
});
