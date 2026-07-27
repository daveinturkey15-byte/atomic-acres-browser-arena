import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('railgun result delivery contract', () => {
  const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

  it('deduplicates host results before health or hit feedback is applied', () => {
    const acceptance = main.slice(main.indexOf('function acceptRailgunShotResult('), main.indexOf('function tryFireRailgun('));
    const duplicateGuard = acceptance.indexOf('processedRailgunShotResults.has(resultKey)');
    const beamPresentation = acceptance.indexOf('presentAuthoritativeRailgunResult(message');
    const healthApply = acceptance.indexOf('reconcileLocalAuthoritativeHealth(');
    const hitPresentation = acceptance.indexOf('showHitmarker(false)');
    expect(acceptance).toContain('`${message.by}:${message.forPlayerId}:${message.generation}:${message.shotId}`');
    expect(duplicateGuard).toBeGreaterThan(-1);
    expect(beamPresentation).toBeGreaterThan(duplicateGuard);
    expect(healthApply).toBeGreaterThan(duplicateGuard);
    expect(hitPresentation).toBeGreaterThan(duplicateGuard);
    expect(acceptance).toContain('while (processedRailgunShotResults.size > 512)');
  });

  it('never creates a speculative client beam and routes every accepted host path through the result hook', () => {
    const presentationHook = main.slice(main.indexOf('function presentAuthoritativeRailgunResult('), main.indexOf('function railgunResult('));
    expect(presentationHook).toContain("local ? 'shooter' : 'peer'");
    const firing = main.slice(main.indexOf('function tryFireRailgun('), main.indexOf('function railgunThermalContacts('));
    const clientPath = firing.slice(0, firing.indexOf('const fired = fireRailgun('));
    expect(clientPath).toContain('presentLocalRailgunTrigger()');
    expect(clientPath).not.toContain('railgunPresentation.');
    expect(clientPath).not.toContain('presentAuthoritativeRailgunResult(');
    expect(firing).toContain('const result = railgunResult(');
    expect(firing).toContain('presentAuthoritativeRailgunResult(result, true)');

    const remoteResolution = main.slice(main.indexOf('function resolveRailgunShot('), main.indexOf('function acceptRailgunShotResult('));
    expect(remoteResolution.match(/railgunResult\([^;]+\[\], null\)/g)).toHaveLength(2);
    expect(remoteResolution).toContain('createRailgunBeamAuthority(');
    expect(remoteResolution).toContain('presentAuthoritativeRailgunResult(result, false)');
    expect(main).not.toContain('railgunPresentation.presentBeam(');
  });

  it('resets client result history at both match initialization and full mode reset', () => {
    expect(main.match(/processedRailgunShotResults\.clear\(\)/g)).toHaveLength(3);
  });
});
