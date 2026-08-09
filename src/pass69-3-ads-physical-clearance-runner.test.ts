import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Pass 69.3 physical ADS evidence boundary', () => {
  it('owns separate clean-SHA installed-Edge WebGL2 and native-WebGPU lanes', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    const runner = readFileSync('scripts/qa/run-pass69-3-ads-physical-clearance.mjs', 'utf8');

    expect(packageJson.scripts['qa:pass69-3:ads-physical:edge-webgl2'])
      .toBe('node scripts/qa/run-pass69-3-ads-physical-clearance.mjs edge-webgl2');
    expect(packageJson.scripts['qa:pass69-3:ads-physical:edge-webgpu'])
      .toBe('node scripts/qa/run-pass69-3-ads-physical-clearance.mjs edge-webgpu');
    expect(packageJson.scripts['qa:pass69-3:ads-physical'])
      .toBe('npm run qa:pass69-3:ads-physical:edge-webgl2 && npm run qa:pass69-3:ads-physical:edge-webgpu');
    for (const token of [
      "'edge-webgl2': Object.freeze({ renderer: 'webgl2'",
      "'edge-webgpu': Object.freeze({ renderer: 'webgpu'",
      "['status', '--porcelain', '--untracked-files=all']",
      'run-playwright-with-topology.mjs',
      "QA_INSTALLED_EDGE: '1'",
      'PASS69_3_ADS_PHYSICAL_SOURCE_SHA: sourceSha',
      'PASS69_3_ADS_PHYSICAL_TARGET: targetName',
      "!key.toUpperCase().startsWith('VITE_')",
      'runtime.softwareAdapter === false',
      "runtime.actualBackend === target.renderer",
      "receipt.evidenceScope !== 'live-physical-viewmodel-clearance'",
      'endingSha !== sourceSha || sourceStatus()',
    ]) expect(runner).toContain(token);
  });

  it('binds live physical evidence to the requested backend and collision-free artifacts', () => {
    const physicalSpec = readFileSync('tests/e2e/pass69-3-ads-physical-clearance.spec.ts', 'utf8');
    for (const token of [
      "process.env.PASS69_3_ADS_PHYSICAL_RENDERER ?? 'webgl2'",
      "renderer === 'webgpu' ? '&requireWebGPU=1' : ''",
      'requestedBackend: renderer',
      'actualBackend: renderer',
      "runtime.softwareAdapter, `${label}: hardware renderer provenance`",
      "fetch('/channels/the-big-one/channel-provenance.json'",
      "const artifactRoot = resolve(artifactBase, renderer)",
      "const receiptPath = resolve(artifactBase, `receipt-${renderer}.json`)",
      "evidenceScope: 'live-physical-viewmodel-clearance'",
      "channel: officialEvidence ? 'msedge' : 'configured-chromium'",
      "expect(endingSourceStatus, 'official physical ADS evidence ends with a clean worktree').toBe('')",
    ]) expect(physicalSpec).toContain(token);
  });

  it('keeps the legacy sight catalog explicitly outside the physical-clearance claim', () => {
    const catalogSpec = readFileSync('tests/e2e/pass66-ads-sight-catalog.spec.ts', 'utf8');
    expect(catalogSpec).toContain("evidenceScope: 'hud-sight-profile-catalog-only'");
    expect(catalogSpec).toContain("excludedClaims: ['physical-viewmodel-clearance', 'physical-ads-sight-picture']");
    expect(catalogSpec).toContain("physicalEvidenceCommand: 'npm run qa:pass69-3:ads-physical'");
    expect(catalogSpec).toContain('therefore cannot attest physical viewmodel clearance');
    expect(catalogSpec).toContain('toBe(WEAPON_IDS.length)');
  });
});
