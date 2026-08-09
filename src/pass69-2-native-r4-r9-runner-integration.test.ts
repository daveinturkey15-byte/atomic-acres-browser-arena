import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runner = readFileSync(new URL('../scripts/qa/run-pass69-2-native-r4-r9.mjs', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../tests/e2e/pass69-2-native-r4-r9-cell.spec.ts', import.meta.url), 'utf8');
const config = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('Pass 69.2 strict native R4/R9 runner contract', () => {
  it('covers every scoped weapon, arena and profile plus both timed weapons', () => {
    expect(runner).toContain("const profiles = Object.freeze(['performance', 'blender', 'compat'])");
    expect(runner).toContain("const arenas = Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'])");
    expect(runner).toContain("const snipers = Object.freeze(['sniper', 'm14-ebr', 'railgun'])");
    expect(runner).toContain("{ weapon: 'flamethrower', arena: 'rustworks-1v1' }");
    expect(runner).toContain("{ weapon: 'flare-gun', arena: 'skyline-terminal' }");
    expect(runner).toContain('receipts.length !== 42');
    expect(runner).toContain('sniperCells.length !== 36');
    expect(runner).toContain('timedCells.length !== 6');
  });

  it('uses one fresh headed installed-Edge process per cell with strict Playwright settings', () => {
    expect(runner).toContain("QA_EXTERNAL_PREVIEW: '0'");
    expect(runner).toContain("QA_REQUIRE_OWNED_FRESH_PREVIEW: '1'");
    expect(runner).toContain("QA_INSTALLED_EDGE: '1'");
    expect(runner).toContain("QA_HEADED_EDGE: '1'");
    expect(runner).toContain("'--project=chromium', '--workers=1', '--retries=0', '--headed'");
    expect(runner).toContain('PASS69_NATIVE_SOURCE_SHA: sourceRevision');
    expect(config).toContain("const installedEdgeHeaded = process.env.QA_HEADED_EDGE === '1'");
    expect(config).toContain('headless: installedEdgeHeaded ? false : undefined');
  });

  it('fails closed on the frozen progress and renderer-health boundaries', () => {
    expect(spec).toContain('toBeLessThan(1_300)');
    expect(spec).toContain('toBeLessThan(2_500)');
    expect(spec).toContain("actualBackend: 'webgpu', softwareAdapter: false, deviceLost: false, uncapturedErrors: 0");
    expect(spec).toContain("presentation: { status: 'healthy', completionFailures: 0 }");
    expect(spec).toContain("await page.locator('#solo').click()");
    expect(spec).not.toContain("page.locator('#game').click");
    expect(spec).toContain("document.visibilityState === 'visible' && document.hasFocus()");
    expect(runner).toContain("schema: 'atomic-acres/pass69-2-native-edge-webgpu-r4-r9@1'");
    expect(runner).toContain("verdict: 'pass'");
    expect(runner).toContain('rmSync(aggregatePath, { force: true })');
  });

  it('exercises real scoped ownership and ground-impact effect paths twice', () => {
    expect(spec).toContain("state.sniperScope.active === true");
    expect(spec).toContain("state.dmrThermal.active === true");
    expect(spec).toContain("state.railgun.thermalVisible === true");
    expect(spec).toContain('teleportPlayer(px, py, pz, 0, 0.9)');
    expect(spec).toContain('telemetry.groundFireActive > 0');
    expect(spec).toContain('telemetry.impactCount > 0 && telemetry.burnPulseCount > 0');
    expect(spec).toContain("await runTimedCycle(page, timedWeapon, 'cold')");
    expect(spec).toContain("await runTimedCycle(page, timedWeapon, 'warm')");
  });

  it('registers exactly one explicit package command', () => {
    expect(packageJson.scripts['qa:pass69-2:native-r4-r9']).toBe('node scripts/qa/run-pass69-2-native-r4-r9.mjs');
  });
});
