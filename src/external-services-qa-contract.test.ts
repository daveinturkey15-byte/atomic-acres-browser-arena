import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const QA_ROUTES = Object.freeze([
  'scripts/qa/verify-pass64-webgpu.mjs',
  'scripts/qa/verify-pass65-cold-webgpu-admission.mjs',
  'scripts/qa/verify-pass65-frame-pacing.ts',
  'scripts/qa/verify-pass65-hardware-webgl2-admission.ts',
  'scripts/qa/verify-pass65-webgpu-endurance.mjs',
]);

describe('deterministic renderer QA external-service isolation', () => {
  it.each(QA_ROUTES)('%s disables unrelated remote services', (relativePath) => {
    const source = readFileSync(path.resolve(import.meta.dirname, '..', relativePath), 'utf8');
    const localRoutes = (source.match(/http:\/\/127\.0\.0\.1:[^`'"\s)]+/gu) ?? [])
      .filter((route) => route.includes('renderer='));

    expect(localRoutes.length).toBeGreaterThan(0);
    for (const route of localRoutes) {
      if (route.includes('multiplayerQa=1')) continue;
      expect(route, `${relativePath} route is not deterministic-offline`).toContain('externalServices=off');
    }
  });
});
