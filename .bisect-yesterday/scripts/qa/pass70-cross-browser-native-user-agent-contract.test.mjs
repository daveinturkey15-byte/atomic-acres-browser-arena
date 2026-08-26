import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  PASS70_NATIVE_USER_AGENT_ENV,
  pass70CrossBrowserHarnessSourceFailures,
  pass70NativeEngineUserAgentEnabled,
  resolvePass70ChromiumProjectUserAgent,
} from './pass70-cross-browser-native-user-agent-contract.mjs';

const playwrightConfigSource = readFileSync(new URL('../../playwright.config.ts', import.meta.url), 'utf8');
const runnerSource = readFileSync(new URL('./run-pass70-cross-browser.mjs', import.meta.url), 'utf8');
const specSource = readFileSync(new URL('../../tests/e2e/pass70-cross-browser-firefox-multiplayer.spec.ts', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

const sources = () => ({ playwrightConfigSource, runnerSource, specSource, packageJson });

test('keeps generic Chromium UA emulation while explicit engine matrices use native identity', () => {
  const desktopChromeUserAgent = 'descriptor-chrome-user-agent';
  assert.equal(PASS70_NATIVE_USER_AGENT_ENV, 'PASS70_NATIVE_ENGINE_USER_AGENT');
  assert.equal(pass70NativeEngineUserAgentEnabled(undefined), false);
  assert.equal(pass70NativeEngineUserAgentEnabled('0'), false);
  assert.equal(pass70NativeEngineUserAgentEnabled('true'), false);
  assert.equal(pass70NativeEngineUserAgentEnabled('1'), true);
  assert.equal(resolvePass70ChromiumProjectUserAgent({
    desktopChromeUserAgent,
    installedEdgeChannel: undefined,
    nativeEngineUserAgent: false,
  }), desktopChromeUserAgent);
  assert.equal(resolvePass70ChromiumProjectUserAgent({
    desktopChromeUserAgent,
    installedEdgeChannel: undefined,
    nativeEngineUserAgent: true,
  }), undefined);
  assert.equal(resolvePass70ChromiumProjectUserAgent({
    desktopChromeUserAgent,
    installedEdgeChannel: 'msedge',
    nativeEngineUserAgent: false,
  }), undefined);
});

test('wires native UA through every explicit engine matrix without weakening Opera identity', () => {
  assert.deepEqual(pass70CrossBrowserHarnessSourceFailures(sources()), []);
});

test('rejects native-UA, default-UA, runner, package, and Opera-identity mutations', () => {
  const configBypass = playwrightConfigSource.replace(
    'nativeEngineUserAgent,',
    'nativeEngineUserAgent: false,',
  );
  assert.match(pass70CrossBrowserHarnessSourceFailures({
    ...sources(), playwrightConfigSource: configBypass,
  }).join('\n'), /does not route user-agent selection/u);

  const runnerBypass = runnerSource.replace(
    "[PASS70_NATIVE_USER_AGENT_ENV]: '1'",
    "[PASS70_NATIVE_USER_AGENT_ENV]: '0'",
  );
  assert.match(pass70CrossBrowserHarnessSourceFailures({
    ...sources(), runnerSource: runnerBypass,
  }).join('\n'), /does not force native browser identity/u);

  const packageBypass = structuredClone(packageJson);
  packageBypass.scripts['qa:pass70:opera'] = 'node scripts/qa/run-pass70-cross-browser.mjs opera';
  assert.match(pass70CrossBrowserHarnessSourceFailures({
    ...sources(), packageJson: packageBypass,
  }).join('\n'), /qa:pass70:opera/u);

  const identityBypass = specSource.replaceAll('/\\bOPR\\//u', '/Chrome\\//u');
  assert.match(pass70CrossBrowserHarnessSourceFailures({
    ...sources(), specSource: identityBypass,
  }).join('\n'), /Opera identity assertions drifted/u);

  assert.equal(resolvePass70ChromiumProjectUserAgent({
    desktopChromeUserAgent: 'descriptor-chrome-user-agent',
    installedEdgeChannel: undefined,
    nativeEngineUserAgent: false,
  }), 'descriptor-chrome-user-agent', 'default projects must retain their descriptor UA');
});
