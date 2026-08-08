import { defineConfig, devices } from '@playwright/test';

const previewPort = Number(process.env.QA_PREVIEW_PORT ?? '4173');
const externalPreview = process.env.QA_EXTERNAL_PREVIEW === '1';
const requireOwnedFreshPreview = process.env.QA_REQUIRE_OWNED_FRESH_PREVIEW === '1';
const installedEdgeChannel = process.env.QA_INSTALLED_EDGE === '1' ? 'msedge' as const : undefined;
const installedEdgeHeaded = process.env.QA_HEADED_EDGE === '1';

if (externalPreview && requireOwnedFreshPreview) {
  throw new Error('QA_REQUIRE_OWNED_FRESH_PREVIEW cannot be combined with QA_EXTERNAL_PREVIEW');
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
      // Opt into the machine-installed Edge binary without widening CI's
      // default browser requirement or maintaining a second Chromium project.
      use: { ...devices['Desktop Chrome'], channel: installedEdgeChannel, headless: installedEdgeHeaded ? false : undefined, viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
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
