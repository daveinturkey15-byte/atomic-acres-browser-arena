import { defineConfig, devices } from '@playwright/test';
import {
  PASS70_NATIVE_USER_AGENT_ENV,
  pass70NativeEngineUserAgentEnabled,
  resolvePass70ChromiumProjectUserAgent,
} from './scripts/qa/pass70-cross-browser-native-user-agent-contract.mjs';
import {
  PASS66_MULTIPLAYER_BROWSER_CHANNEL,
  PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV,
} from './scripts/qa/pass66-multiplayer-stability-contract.mjs';

const previewPort = Number(process.env.QA_PREVIEW_PORT ?? '4173');
const externalPreview = process.env.QA_EXTERNAL_PREVIEW === '1';
const requireOwnedFreshPreview = process.env.QA_REQUIRE_OWNED_FRESH_PREVIEW === '1';
const installedEdgeChannel = process.env.QA_INSTALLED_EDGE === '1' ? 'msedge' as const : undefined;
const pass71GrenadeEdgeExecutable = process.env.PASS71_GRENADE_EDGE_EXECUTABLE;
const pass71Hf296EdgeExecutable = process.env.PASS71_HF296_EDGE_EXECUTABLE;
const pass71Hf304EdgeExecutable = process.env.PASS71_HF304_EDGE_EXECUTABLE;
const pass71Hf301EdgeExecutable = process.env.PASS71_HF301_EDGE_EXECUTABLE;
const pass71Hf299EdgeExecutable = process.env.PASS71_HF299_EDGE_EXECUTABLE;
const pass71Hf305EdgeExecutable = process.env.PASS71_HF305_EDGE_EXECUTABLE;
const pass71OwnedEdgeExecutable = pass71GrenadeEdgeExecutable
  ?? pass71Hf296EdgeExecutable
  ?? pass71Hf304EdgeExecutable
  ?? pass71Hf301EdgeExecutable
  ?? pass71Hf299EdgeExecutable
  ?? pass71Hf305EdgeExecutable;
const pass71AudioBrowserExecutable = process.env.PASS71_AUDIO_BROWSER_EXECUTABLE;
const ownedMultiplayerGate = process.env.QA_OWNED_GATE === 'multiplayer-stability';
const requestedMultiplayerChannel = process.env[PASS66_MULTIPLAYER_BROWSER_CHANNEL_ENV];
const multiplayerChromeChannel = ownedMultiplayerGate
  ? PASS66_MULTIPLAYER_BROWSER_CHANNEL as 'chrome'
  : undefined;
const nativeEngineUserAgent = pass70NativeEngineUserAgentEnabled(
  process.env[PASS70_NATIVE_USER_AGENT_ENV],
);

if (externalPreview && requireOwnedFreshPreview) {
  throw new Error('QA_REQUIRE_OWNED_FRESH_PREVIEW cannot be combined with QA_EXTERNAL_PREVIEW');
}
if (ownedMultiplayerGate && requestedMultiplayerChannel !== PASS66_MULTIPLAYER_BROWSER_CHANNEL) {
  throw new Error('Owned multiplayer stability must explicitly select installed Chrome');
}
if (!ownedMultiplayerGate && requestedMultiplayerChannel !== undefined) {
  throw new Error('QA_MULTIPLAYER_BROWSER_CHANNEL is reserved for the owned multiplayer stability gate');
}
if (ownedMultiplayerGate && installedEdgeChannel) {
  throw new Error('Owned multiplayer stability cannot be combined with QA_INSTALLED_EDGE');
}
if (pass71GrenadeEdgeExecutable && !installedEdgeChannel) {
  throw new Error('PASS71_GRENADE_EDGE_EXECUTABLE is reserved for installed-Edge evidence');
}
if (pass71Hf296EdgeExecutable && !installedEdgeChannel) {
  throw new Error('PASS71_HF296_EDGE_EXECUTABLE is reserved for installed-Edge evidence');
}
if (pass71Hf304EdgeExecutable && !installedEdgeChannel) {
  throw new Error('PASS71_HF304_EDGE_EXECUTABLE is reserved for installed-Edge evidence');
}
if (pass71Hf301EdgeExecutable && !installedEdgeChannel) {
  throw new Error('PASS71_HF301_EDGE_EXECUTABLE is reserved for installed-Edge evidence');
}
if (pass71Hf299EdgeExecutable && !installedEdgeChannel) {
  throw new Error('PASS71_HF299_EDGE_EXECUTABLE is reserved for installed-Edge evidence');
}
if (pass71Hf305EdgeExecutable && !installedEdgeChannel) {
  throw new Error('PASS71_HF305_EDGE_EXECUTABLE is reserved for installed-Edge evidence');
}
if ([pass71GrenadeEdgeExecutable, pass71Hf296EdgeExecutable, pass71Hf304EdgeExecutable,
  pass71Hf301EdgeExecutable, pass71Hf299EdgeExecutable, pass71Hf305EdgeExecutable]
  .filter(Boolean).length > 1) {
  throw new Error('Pass 71 installed-Edge evidence gates require separate Playwright launches');
}
if (pass71AudioBrowserExecutable && process.env.PASS71_AUDIO_NATIVE !== '1') {
  throw new Error('PASS71_AUDIO_BROWSER_EXECUTABLE is reserved for the owned audio-native gate');
}
if (pass71AudioBrowserExecutable && pass71OwnedEdgeExecutable) {
  throw new Error('Audio-native and installed-Edge evidence cannot share one Playwright launch');
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false, // multiplayer tests share browser state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // the GPU-heavy suite and multiplayer harness share one preview server
  reporter: [['html', { outputFolder: 'playwright-report' }], ['list']],
  outputDir: 'artifacts/pass25a/playwright-results',
  use: {
    baseURL: requireOwnedFreshPreview
      ? `http://localhost:${previewPort}`
      : process.env.BASE_URL || `http://localhost:${previewPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Chromium screencasting caps requestAnimationFrame near 30 Hz and invalidates
    // the >=40 FPS budget. Failure screenshots and traces remain enabled.
    video: 'off',
    actionTimeout: 15000,
  },
  projects: [
    {
      name: 'chromium',
      // Owned multiplayer evidence runs on installed Chrome while retaining the
      // Chromium project identity; other suites can opt into installed Edge.
      // Desktop Chrome's descriptor pins a bundled-Chromium UA. Clear that
      // emulation for installed-browser evidence and explicit engine matrices so
      // navigator.userAgent proves the binary Playwright actually launched
      // instead of repeating the Chromium fixture string.
      use: {
        ...devices['Desktop Chrome'],
        channel: multiplayerChromeChannel ?? installedEdgeChannel,
        launchOptions: pass71OwnedEdgeExecutable
          ? { executablePath: pass71OwnedEdgeExecutable }
          : pass71AudioBrowserExecutable
            ? { executablePath: pass71AudioBrowserExecutable }
            : undefined,
        userAgent: resolvePass70ChromiumProjectUserAgent({
          desktopChromeUserAgent: devices['Desktop Chrome'].userAgent,
          installedEdgeChannel,
          nativeEngineUserAgent,
        }),
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'webkit-smoke',
      testMatch: /pass25a-capability\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    },
    {
      name: 'webkit-admission',
      testMatch: /pass66-browser-admission-cycles\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: externalPreview ? undefined : {
    command: 'node scripts/qa/playwright-web-server.mjs',
    port: previewPort,
    // Release evidence runners opt into an owned server and fail if the port
    // is already occupied. Ordinary developer runs retain convenient reuse.
    reuseExistingServer: requireOwnedFreshPreview ? false : !process.env.CI,
    // Windows CI hosted runners routinely exceed 30s to build+start the Vite
    // preview (observed 55s+ on an uncontended run); give the owned server the
    // same SwiftShader-style headroom as the boot timeouts.
    timeout: 60000,
  },
});
