export const PASS70_NATIVE_USER_AGENT_ENV = 'PASS70_NATIVE_ENGINE_USER_AGENT';

export function pass70NativeEngineUserAgentEnabled(value) {
  return value === '1';
}

export function resolvePass70ChromiumProjectUserAgent({
  desktopChromeUserAgent,
  installedEdgeChannel,
  nativeEngineUserAgent,
}) {
  return installedEdgeChannel || nativeEngineUserAgent
    ? undefined
    : desktopChromeUserAgent;
}

export function pass70CrossBrowserHarnessSourceFailures({
  playwrightConfigSource,
  runnerSource,
  specSource,
  packageJson,
}) {
  const failures = [];
  if (!playwrightConfigSource.includes("process.env[PASS70_NATIVE_USER_AGENT_ENV]")) {
    failures.push('Playwright config does not read the explicit native-engine user-agent flag');
  }
  if (!playwrightConfigSource.includes('resolvePass70ChromiumProjectUserAgent({')
    || !playwrightConfigSource.includes('nativeEngineUserAgent,')) {
    failures.push('Playwright Chromium project does not route user-agent selection through the native-engine contract');
  }
  if (!runnerSource.includes("[PASS70_NATIVE_USER_AGENT_ENV]: '1'")) {
    failures.push('Pass 70 explicit engine runner does not force native browser identity');
  }
  const operaAssertions = specSource.match(/toMatch\(\/\\bOPR\\\/\/u\)/gu) ?? [];
  if (operaAssertions.length !== 2) {
    failures.push(`Pass 70 Opera identity assertions drifted: expected 2, received ${operaAssertions.length}`);
  }
  const expectedScripts = {
    'qa:pass70:cross-browser': 'available',
    'qa:pass70:firefox': 'firefox',
    'qa:pass70:iphone15-webkit': 'iphone15',
    'qa:pass70:opera': 'opera',
  };
  for (const [name, target] of Object.entries(expectedScripts)) {
    const expected = `npm run qa:pass70:cross-browser:contract && node scripts/qa/run-pass70-cross-browser.mjs ${target}`;
    if (packageJson.scripts?.[name] !== expected) {
      failures.push(`${name} does not run the native user-agent contract before ${target}`);
    }
  }
  if (packageJson.scripts?.['qa:pass70:cross-browser:contract']
    !== 'node --test scripts/qa/pass70-cross-browser-native-user-agent-contract.test.mjs') {
    failures.push('Pass 70 cross-browser native user-agent contract script is not wired');
  }
  return failures;
}
