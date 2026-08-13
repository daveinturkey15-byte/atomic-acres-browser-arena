import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('HF-302 exact-A audio-native release evidence wiring', () => {
  it('binds installed hardware, Quality, all semantic cues, bounded samples, exact topology and clean source', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
    const runner = readFileSync('scripts/qa/run-pass71-audio-native-receipt.mjs', 'utf8');
    const spec = readFileSync('tests/e2e/pass71-audio-native-long-run.spec.ts', 'utf8');
    const contract = readFileSync('scripts/qa/pass71-audio-native-receipt-contract.mjs', 'utf8');
    const config = readFileSync('playwright.config.ts', 'utf8');

    expect(packageJson.scripts['qa:pass71:audio-native:contract'])
      .toBe('node --test scripts/qa/pass71-audio-native-receipt-contract.test.mjs');
    expect(packageJson.scripts['qa:pass71:audio-native'])
      .toBe('npm run qa:pass71:audio-native:contract && node scripts/qa/run-pass71-audio-native-receipt.mjs');
    for (const token of [
      '--expected-source-sha=', 'run-playwright-with-topology.mjs', "PASS71_AUDIO_NATIVE: '1'",
      "PASS70_NATIVE_ENGINE_USER_AGENT: '1'", "git('status', '--porcelain', '--untracked-files=all')",
      'executableSha256', 'sha256Canonical', 'assertPass71AudioNativeReceipt', 'endingSha !== sourceSha',
    ]) expect(runner).toContain(token);
    for (const token of [
      "renderer: 'webgpu'", "render: 'blender'", "page.locator('#solo').click()", "event('combat'",
      "event('grenade'", "event('glass'", "event('support'", "event('rematch'", "event('arena-transition'",
      'logBandsDb', 'timeDomainSamples', 'lifecycle.owners', '65_000', 'navigator.gpu?.requestAdapter()',
    ]) expect(spec).toContain(token);
    expect(contract).toContain("events: Object.freeze(['start', 'combat', 'grenade', 'glass', 'support', 'rematch', 'arena-transition'])");
    expect(contract).toContain('receipt.evidenceDigest !== sha256Canonical(withoutDigest)');
    expect(config).toContain('PASS71_AUDIO_BROWSER_EXECUTABLE');
    expect(config).toContain("reserved for the owned audio-native gate");
  });
});
