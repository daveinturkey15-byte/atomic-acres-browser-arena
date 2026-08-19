import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

function body(name: string, nextName: string): string {
  const start = source.indexOf(`function ${name}`);
  const end = source.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('Pass 72 hosted crossbow glass contract', () => {
  it('routes bolt detonation through the same occlusion-aware glass mutation as grenades', () => {
    const detonate = body('detonateExplosiveBoltEntity', 'updateExplosiveBolts');
    expect(detonate).toContain('breakWindowsInGrenadeBlast(point, bolt.actionNonce, true, blastRadiusM)');
    expect(detonate).toContain("breakWindowsInGrenadeBlast");
    expect(detonate).toContain('if (!bolt.authority) return;');
  });

  it('keeps the shared break policy path occlusion-aware and replicated from the host', () => {
    const helper = body('breakWindowsInGrenadeBlast', 'synchronizeSmokePresentation');
    expect(helper).toContain('windowBreakPathBlocked(point, centre, activeWorldColliders())');
    expect(helper).toContain("'explosive'");
    expect(helper).toContain('replicate');
  });
});
