import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function block(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('glass authority runtime integration', () => {
  it('replicates every admitted impact before an aperture opens using one peer-stable identity', () => {
    const mutation = block('function breakHouseWindow(', '\nfunction canonicalHostWindowBreak(');
    expect(mutation).toContain('const impactId = `${profile}:${impactOwnerId}:${impactNonce}:${state.revision}`;');
    expect(mutation).toContain('nonce: impactNonce,');
    expect(mutation.indexOf('if (replicate)')).toBeLessThan(mutation.indexOf('if (!projection.apertureOpen)'));
  });

  it('preserves the admitted remote impact kind, action nonce, owner and event nonce', () => {
    const remote = block('function acceptRemoteWindowBreak(', '\nfunction resetBreakableWindows(');
    expect(remote).toMatch(/breakHouseWindow\([\s\S]*message\.kind \?\? 'shot',[\s\S]*message\.actionNonce,[\s\S]*message\.by,[\s\S]*message\.nonce,[\s\S]*\);/);
  });
});
