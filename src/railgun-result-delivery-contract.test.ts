import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('railgun result delivery contract', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('deduplicates host results before health or hit feedback is applied', () => {
    const acceptance = main.slice(main.indexOf('function acceptRailgunShotResult('), main.indexOf('function tryFireRailgun('));
    const duplicateGuard = acceptance.indexOf('processedRailgunShotResults.has(resultKey)');
    const healthApply = acceptance.indexOf('reconcileLocalAuthoritativeHealth(');
    const hitPresentation = acceptance.indexOf('showHitmarker(false)');
    expect(acceptance).toContain('`${message.by}:${message.forPlayerId}:${message.generation}:${message.shotId}`');
    expect(duplicateGuard).toBeGreaterThan(-1);
    expect(healthApply).toBeGreaterThan(duplicateGuard);
    expect(hitPresentation).toBeGreaterThan(duplicateGuard);
    expect(acceptance).toContain('while (processedRailgunShotResults.size > 512)');
  });

  it('resets client result history at both match initialization and full mode reset', () => {
    expect(main.match(/processedRailgunShotResults\.clear\(\)/g)).toHaveLength(3);
  });
});
