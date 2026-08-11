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
    expect(packageJson.scripts['qa:pass69-3:ads-physical:edge-webgl2-performance'])
      .toBe('node scripts/qa/run-pass69-3-ads-physical-clearance.mjs edge-webgl2-performance');
    expect(packageJson.scripts['qa:pass69-3:ads-physical'])
      .toBe('npm run qa:pass69-3:ads-physical:edge-webgl2 && npm run qa:pass69-3:ads-physical:edge-webgpu && npm run qa:pass69-3:ads-physical:edge-webgl2-performance');
    for (const token of [
      "'edge-webgl2': Object.freeze({ renderer: 'webgl2'",
      "'edge-webgpu': Object.freeze({ renderer: 'webgpu'",
      "'edge-webgl2-performance': Object.freeze({ renderer: 'webgl2', renderProfile: 'performance'",
      'PASS69_3_ADS_PHYSICAL_RENDER_PROFILE: target.renderProfile',
      'target.artifactKey',
      "['status', '--porcelain', '--untracked-files=all']",
      'run-playwright-with-topology.mjs',
      "QA_INSTALLED_EDGE: '1'",
      'PASS69_3_ADS_PHYSICAL_SOURCE_SHA: sourceSha',
      'PASS69_3_ADS_PHYSICAL_TARGET: targetName',
      "!key.toUpperCase().startsWith('VITE_')",
      'runtime.softwareAdapter === false',
      "runtime.actualBackend === target.renderer",
      "receipt.evidenceScope !== 'live-physical-viewmodel-clearance'",
      "materials?.contract === 'semantic-first-person-optic-window-v1'",
      'materials.markedMaterialCount === materials.materialCount',
      'materials.invalidOpaqueBodyCount === 0',
      'materials.invalidOpticWindowCount === 0',
      "weapon === 'carbine' ? 1 : 0",
      "entry.ads?.opaqueSightWindow?.contract === 'camera-ndc-centre-reticle-window-rays-v2'",
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
      "const artifactKey = renderProfile === 'blender' ? renderer : `${renderer}-${renderProfile}`",
      'const artifactRoot = resolve(artifactBase, artifactKey)',
      "const receiptPath = resolve(artifactBase, `receipt-${artifactKey}.json`)",
      "evidenceScope: 'live-physical-viewmodel-clearance'",
      "expect(hipMaterials.contract).toBe('semantic-first-person-optic-window-v1')",
      "expect(hipMaterials.markedMaterialCount, `${weapon}: no fallback or unprocessed visible material`)",
      "expect(adsMaterials, `${weapon}: ADS does not mutate any material semantics`).toEqual(hipMaterials)",
      "expect(hipMaterials.opticWindowCount, `${weapon}: exact semantic lens expectation`).toBe(weapon === 'carbine' ? 1 : 0)",
      "contract: 'camera-ndc-centre-reticle-window-rays-v2'",
      "expect(opticMaterialsFor(reEquipped), `${weapon}: switch-back preserves exact material semantics`)",
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
