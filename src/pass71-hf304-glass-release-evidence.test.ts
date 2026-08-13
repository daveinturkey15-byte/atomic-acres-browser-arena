import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const packageManifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const runner = readFileSync(new URL('../scripts/qa/run-pass71-hf304-glass-evidence.mjs', import.meta.url), 'utf8');
const capture = readFileSync(new URL('../scripts/qa/capture-pass71-hf304-glass-matrix.ts', import.meta.url), 'utf8');
const browser = readFileSync(new URL('../tests/e2e/pass71-glass-lifecycle-matrix.spec.ts', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');

describe('Pass 71 HF-304 release evidence wiring', () => {
  it('owns one contract-first exact-A command', () => {
    expect(packageManifest.scripts['qa:pass71:hf304-glass:contract'])
      .toBe('node --test scripts/qa/pass71-hf304-glass-evidence-contract.test.mjs');
    expect(packageManifest.scripts['qa:pass71:hf304-glass'])
      .toBe('npm run qa:pass71:hf304-glass:contract && node scripts/qa/run-pass71-hf304-glass-evidence.mjs');
  });

  it('fails closed on dirty or non-exact source and owns installed Edge plus served topology', () => {
    expect(runner).toContain("const expectedSourceSha = args['expected-source-sha'];");
    expect(runner).toContain("args.machine !== 'dave-gaming-pc'");
    expect(runner).toContain("hostname().toLowerCase()");
    expect(runner).toContain('hostnameSha256 !== PASS71_HF304_MACHINE_HOSTNAME_SHA256');
    expect(runner).toContain('environment: { machine: args.machine');
    expect(runner).toContain('checkoutSourceSha !== expectedSourceSha || !clean()');
    expect(runner).toContain('endingCheckoutSourceSha !== expectedSourceSha || !cleanAfter');
    expect(runner).toContain("QA_INSTALLED_EDGE: '1'");
    expect(runner).toContain('PASS71_HF304_EDGE_EXECUTABLE: edgeExecutable');
    expect(playwrightConfig).toContain('const pass71Hf304EdgeExecutable = process.env.PASS71_HF304_EDGE_EXECUTABLE;');
    expect(playwrightConfig).toContain('? { executablePath: pass71Hf304EdgeExecutable }');
    expect(runner).toContain("'scripts/qa/run-playwright-with-topology.mjs'");
    expect(runner).toContain('readWindowsExecutableIdentity(edgeExecutable)');
    expect(runner).toContain('assertInstalledEdgeExecutableIdentity(');
    expect(runner).toContain('assertPass71Hf304Evidence(record');
  });

  it('projects the full pane and weapon sets from canonical runtime sources', () => {
    expect(capture).toContain("import { WEAPON_CATALOG } from '../../src/combat/weapon-catalog';");
    expect(capture).toContain("import { WEAPON_GLASS_BREAK_CATALOG } from '../../src/weapon-glass-break-policy';");
    expect(capture).toContain("import { ARENA_SELECTIONS } from '../../src/map-selection';");
    expect(capture).toContain('not exact-set equal to ARENA_SELECTIONS');
    expect(capture).toContain("['atomic-acres', buildArena]");
    expect(capture).toContain("['skyline-terminal', buildSkylineTerminal]");
    expect(capture).toContain('for (const mode of PASS71_HF304_MODES)');
    expect(capture).toContain('for (const pane of paneCatalog)');
    expect(capture).toContain('for (const weapon of WEAPON_CATALOG)');
    expect(capture).toContain('isGameMessage(hostedRequest)');
    expect(capture).toContain('!isHostAuthorityMessage(hostedRequest)');
    expect(capture).toContain('isGameMessage(clientEnvelope)');
    expect(capture).toContain('isHostAuthorityMessage(clientEnvelope)');
    expect(capture).toContain('windowGlassDebrisLifecycleMode(sample)');
  });

  it('emits the real served runtime component only after all ten cases pass', () => {
    expect(browser).toContain('PASS71_HF304_BROWSER_COMPONENT_PATH');
    expect(browser).toContain('expect(hf304Cases.map((entry) => entry.id)).toEqual(HF304_CASE_IDS)');
    expect(browser).toContain("expect(identity.userAgent).toMatch(/Edg\\//u)");
    expect(browser).toContain("expect(identity.actualRenderer).toBe('webgl2')");
    expect(browser).toContain("contract: 'atomic-acres/pass71-hf304-glass-browser-component@1'");
  });
});
