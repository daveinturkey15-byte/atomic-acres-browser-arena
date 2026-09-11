import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * src/audio-offline-render-browser.test.ts launches Playwright's headless
 * Chromium shell under `npm test`, and the static-and-unit job installs with
 * `npm ci --ignore-scripts`, which never fetches a browser. CI 34643597692
 * failed on both matrix rows with "Executable doesn't exist ...
 * chromium_headless_shell-1228". This contract pins the provision step to the
 * job that runs `npm test`, after `npm ci` and ahead of `npm test`, unguarded,
 * and ties it to the probe still being a headless-shell launch.
 *
 * Modelled on scripts/qa/pass84-gamepad-wiring-contract.mjs: assert the CI
 * wiring, not the mere existence of the probe.
 */
const PROVISION_COMMAND = 'npx playwright install --with-deps chromium-headless-shell';
const UNIT_TEST_COMMAND = '- run: npm test';
const INSTALL_COMMAND = '- run: npm ci --ignore-scripts';

const workflow = readFileSync('.github/workflows/verify.yml', 'utf8');
const audioProbe = readFileSync('src/audio-offline-render-browser.test.ts', 'utf8');

function jobSection(source: string, job: string): string {
  source = source.replaceAll('\r\n', '\n');
  const header = `\n  ${job}:\n`;
  const start = source.indexOf(header);
  if (start < 0) return '';
  const body = source.slice(start + header.length);
  const next = body.search(/\n  [a-z][a-z0-9-]*:\n/u);
  return next < 0 ? body : body.slice(0, next);
}

function stepContaining(section: string, needle: string): string {
  return section.split(/\n      - /u).find((step) => step.includes(needle)) ?? '';
}

describe('static-and-unit provisions the headless Chromium shell the audio probe launches', () => {
  const section = jobSection(workflow, 'static-and-unit');

  it.each(['\n', '\r\n'])('runs the unit suite on both matrix platforms with %j line endings', (newline) => {
    const parsed = jobSection(workflow.replaceAll('\r\n', '\n').replaceAll('\n', newline), 'static-and-unit');
    expect(parsed).not.toBe('');
    expect(parsed).toContain('os: [ubuntu-latest, windows-latest]');
    expect(parsed).toContain(UNIT_TEST_COMMAND);
  });

  it('installs the pinned headless shell after npm ci and before npm test, unguarded', () => {
    const install = section.indexOf(INSTALL_COMMAND);
    const provision = section.indexOf(PROVISION_COMMAND);
    const unitTests = section.indexOf(UNIT_TEST_COMMAND);
    expect(install).toBeGreaterThanOrEqual(0);
    expect(provision).toBeGreaterThan(install);
    expect(unitTests).toBeGreaterThan(provision);
    expect(section.split(PROVISION_COMMAND)).toHaveLength(2);
    const step = stepContaining(section, PROVISION_COMMAND);
    expect(step).not.toBe('');
    expect(step).not.toMatch(/\n\s*if:/u);
  });

  it('matches the probe, which still launches headless Chromium from the playwright package', () => {
    expect(audioProbe).toContain("from 'playwright'");
    expect(audioProbe).toContain('chromium.launch({ headless: true })');
  });
});
