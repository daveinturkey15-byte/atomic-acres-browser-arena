import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PASS66_RELEASE_IDENTITY } from '../../src/release-identity';

type ConfiguredChannel = { label: string; pass: string; path: string };
type ChooserKey = 'experimental' | 'previous' | 'retained' | 'historical';
const releaseChannels = JSON.parse(readFileSync(resolve(process.cwd(), 'release-channels.json'), 'utf8')) as {
  latest: { label: string };
  experimental: ConfiguredChannel;
  previous: ConfiguredChannel;
  retained: ConfiguredChannel;
  historical: ConfiguredChannel;
  rollback?: ConfiguredChannel;
};

// LANE AD (PASS 87): this file used to `import { CHANGELOG } from '../../src/changelog'`.
// That module reads `import.meta.env.VITE_RELEASED_AT`, and Playwright's loader transforms a
// spec's transitive imports as CommonJS, so the whole FILE threw
// `SyntaxError: Cannot use 'import.meta' outside a module` at collection time and Playwright
// reported `Error: No tests found` - every assertion below had been running zero times
// (measured on d329628d, 2026-09-03: `npm run qa:playwright-topology -- tests/e2e/
// release-channel-chooser.spec.ts` exits 1 with no test results). The same two fields are
// still pinned against the same source file, read as text so the module is never evaluated.
const changelogSource = readFileSync(resolve(process.cwd(), 'src/changelog.ts'), 'utf8');
const changelogHead = changelogSource.slice(changelogSource.indexOf('export const CHANGELOG'));
const currentEntry = {
  id: /id: '([^']+)'/u.exec(changelogHead)?.[1] ?? '',
  pass: /pass: '([^']+)'/u.exec(changelogHead)?.[1] ?? '',
};

/**
 * LANE AD: the CURRENT pass fails closed without a WebGPU adapter by design, so any assertion
 * that inspects its running gameplay shell needs one. A headless runner without an adapter
 * (this machine: `requestAdapter(): null`, SwiftShader WebGL) serves the "GAMEPLAY RENDERER
 * BLOCKED" page instead, which has no `#menu` and no `.command-brand`. Those assertions are
 * therefore BLOCKED there, not passed - this helper is the difference, and every caller says
 * so out loud rather than skipping quietly. Retained channels boot without an adapter, which
 * is why the routing tests below assert their runtime badges unconditionally.
 */
async function hasWebGpuAdapter(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  blocked: string,
): Promise<boolean> {
  const present = await page.evaluate(async () => {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return Boolean(await gpu.requestAdapter());
  });
  if (present) return true;
  // REPAIR (skeptic, PASS 87): the first version only wrote a console.warn and returned, so
  // the run was green at exit 0 with these assertions never executed and nothing in the
  // report saying so - this repository's own "green gate that never looked" pattern. The
  // absence is now (a) recorded as an annotation, so the HTML/JSON report carries it, and
  // (b) FATAL wherever an adapter is supposed to exist: set REQUIRE_WEBGPU_ADAPTER=1 there
  // and the missing adapter fails the test instead of quietly shrinking it.
  const message = `no WebGPU adapter in this browser, so ${blocked} could NOT be checked. `
    + 'This is BLOCKED, not passed.';
  testInfo.annotations.push({ type: 'blocked', description: message });
  // PASS73_NATIVE_WEBGPU=1 launches installed Chrome (headless) precisely because it acquires
  // a real adapter there, so in that run a missing adapter is a defect, not an environment.
  // REQUIRE_WEBGPU_ADAPTER=1 forces the same on any other runner that is supposed to have one.
  if (process.env.REQUIRE_WEBGPU_ADAPTER === '1' || process.env.PASS73_NATIVE_WEBGPU === '1') {
    throw new Error('[release-channel-chooser] an adapter was required '
      + `(REQUIRE_WEBGPU_ADAPTER/PASS73_NATIVE_WEBGPU) and ${message}`);
  }
  console.warn(`[release-channel-chooser] ${message} Run this spec with `
    + 'REQUIRE_WEBGPU_ADAPTER=1 where an adapter exists.');
  return false;
}

/** The channel list the served chooser actually draws from, not a list written in this file. */
type ServedChannel = { label: string; pass: string; path: string; deploymentState?: string };
async function servedChannels(page: import('@playwright/test').Page): Promise<Record<string, ServedChannel>> {
  const config = await page.evaluate(() => (window as unknown as {
    __ATOMIC_ACRES_RELEASE_CHANNELS__?: Record<string, ServedChannel>;
  }).__ATOMIC_ACRES_RELEASE_CHANNELS__);
  expect(config, 'the chooser must be served a channel list').toBeTruthy();
  return config as Record<string, ServedChannel>;
}

test('offers exactly the channels the deploy staged, stamped with the current pass', async ({ page }, testInfo) => {
  await page.goto('/?release=choose&renderer=webgl2');

  await expect(page.locator('#release-channel-gate')).toBeVisible();
  await expect(page.locator('#menu')).toHaveCount(0);

  // HF-406: these were hardcoded to 'PASS 73' and went stale the moment the stamp moved,
  // so they were red before this change and told nobody why. They now pin the config
  // against `src/release-identity.ts`, which is the single source the badge, the features
  // panel and the project map all derive from - a strictly stronger check than a literal,
  // because it fails when the config and the stamp disagree at ANY pass, not just at 73.
  expect(releaseChannels.latest.label).toBe(PASS66_RELEASE_IDENTITY.pass);
  expect(releaseChannels.experimental.label).toBe(PASS66_RELEASE_IDENTITY.pass);
  expect(releaseChannels.experimental.pass).toBe(PASS66_RELEASE_IDENTITY.pass);

  // LANE AD: the card count was the literal 4, and `stable` was asserted ABSENT. The staging
  // step stages the Pass 63 rollback under the `stable` key in every local preview, so the
  // real chooser has drawn five cards since that channel returned - a literal count is the
  // same staleness class as the retired channel paths this lane removed. One card per served
  // channel, no card without a channel: that is the invariant, and it cannot go stale.
  // REPAIR (skeptic, PASS 87): counting the cards against the served config alone could not
  // fail unless rendering itself broke, and the retired-key loop neutered itself by skipping
  // any key the config happened to serve. The expected key SET is now derived from
  // release-channels.json and from what stage-release-topology.mjs stages under each key:
  // the four mandatory chooser channels, plus `stable` exactly when the config carries the
  // Pass 63 rollback (staging renames `rollback` -> `stable` in the public config, and
  // stages it in every preview and in production). That is independent of the served bytes,
  // so a dropped or an extra channel fails here, and it still names no channel path.
  const expectedChooserKeys = ['experimental', 'previous', 'retained', 'historical',
    ...(releaseChannels.rollback ? ['stable'] : [])].sort();
  const channels = await servedChannels(page);
  const servedKeys = Object.keys(channels);
  expect([...servedKeys].sort()).toEqual(expectedChooserKeys);
  await expect(page.locator('.release-channel-option')).toHaveCount(expectedChooserKeys.length);
  for (const [key, channel] of Object.entries(channels)) {
    const card = page.locator(`[data-release-choice="${key}"]`);
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(channel.pass);
    // The served card must point at the path the config stages for that channel, under the
    // config's own key name (`stable` is the rollback channel).
    const configured = key === 'stable' ? releaseChannels.rollback : releaseChannels[key as ChooserKey];
    expect(channel.path).toBe(configured?.path);
    expect(channel.pass).toBe(configured?.pass);
  }

  await expect(page.locator('[data-release-choice="experimental"]')).toContainText(releaseChannels.experimental.label);
  await expect(page.locator('[data-release-choice="experimental"]')).toContainText('RELEASE CANDIDATE');
  await expect(page.locator('[data-release-choice="experimental"]')).not.toContainText(/\bLIVE\b/u);
  await expect(page.locator('[data-release-choice="previous"]')).toContainText('PREVIOUS LIVE');
  await expect(page.locator('[data-release-choice="retained"]')).toContainText('RETAINED LIVE');
  await expect(page.locator('[data-release-choice="historical"]')).toContainText('RETAINED STABLE');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 65');
  await expect(page.locator('#release-channel-gate')).not.toContainText('PASS 59');
  // LANE AD: this pinned the literal `Ctrl+Shift+R`. That hint is no longer in
  // release-shell/index.html - the copy now says the chooser re-checks the published build
  // list every time it opens and the button is a last resort - so the pin named a string the
  // shell deliberately stopped showing. Pinned against the copy the shell actually ships,
  // read from the source document, so it cannot go stale silently again.
  const shellDocument = readFileSync(resolve(process.cwd(), 'release-shell/index.html'), 'utf8');
  expect(shellDocument).toContain('VERSION NOT UPDATED?');
  await expect(page.locator('.release-refresh')).toContainText('VERSION NOT UPDATED?');
  await expect(page.locator('.release-refresh')).toContainText('last resort');
  await expect(page.locator('[id$="hard-refresh"]')).toBeVisible();
  await expect(page.locator('[id$="hard-refresh"]')).toHaveText('HARD RESET / REFRESH');

  const passSlug = PASS66_RELEASE_IDENTITY.pass.toLowerCase().replace(/\s+/gu, '');
  const artifactRoot = resolve(process.cwd(), `artifacts/${passSlug}/release-shell`);
  mkdirSync(artifactRoot, { recursive: true });
  const screenshot = resolve(artifactRoot, `${passSlug}-channel-chooser.png`);
  await page.screenshot({ path: screenshot, animations: 'disabled', fullPage: true });
  await testInfo.attach(`${passSlug}-channel-chooser`, { path: screenshot, contentType: 'image/png' });

  await page.locator('[data-release-choice="experimental"]').click();
  await expect(page).toHaveURL(new RegExp(`/${releaseChannels.experimental.path}/.*release=latest`, 'u'));
  await expect(page.locator('#release-channel-gate')).toHaveCount(0);
  const servedLivePass = await page.evaluate(async (path) => {
    const response = await fetch(`/${path}/channel-provenance.json`, { cache: 'no-store' });
    return (await response.json()).releasePass as string;
  }, releaseChannels.experimental.path);
  expect(servedLivePass).toBe(releaseChannels.experimental.pass);
  if (!await hasWebGpuAdapter(page, testInfo,
    "the live channel's runtime badge and changelog head (the chooser, the card set, the "
    + 'route and the served provenance were checked)')) {
    return;
  }
  await expect(page.locator('#menu')).toBeVisible();
  // HF-406: the badge was pinned to the literal `HITL CANDIDATE · NOT LIVE` and the entry
  // time to `AWAITING OWNER HITL`. Neither string named a pass, which is exactly how the
  // owner read the live site as "pass 73 HITL". Both are now pinned to the stamped pass
  // and to the current changelog entry's own id, so a stale changelog head or a stale
  // stamp fails here instead of shipping.
  expect(currentEntry.pass).toBe(PASS66_RELEASE_IDENTITY.pass);
  await expect(page.locator('#last-updated-btn > b')).toHaveText(`${currentEntry.pass} · RELEASE CANDIDATE`);
  await expect(page.locator('#last-updated-btn')).not.toContainText('HITL');
  await page.locator('#last-updated-btn').click();
  const current = page.locator('#changelog-list > li').first();
  await expect(current).toHaveAttribute('data-changelog-id', currentEntry.id);
  await expect(current.locator('.changelog-entry-pass span')).toHaveText(currentEntry.pass);
  await expect(current.locator('.changelog-entry-pass b')).toHaveText('LOCAL CANDIDATE');
  await expect(current.locator('time')).not.toHaveAttribute('datetime', /.+/u);
  await expect(current.locator('time')).toContainText('NOT PUBLISHED');
  await expect(current.locator('time')).toContainText('RELEASE CANDIDATE');
  await expect(page.locator('#changelog-panel')).not.toContainText('HITL');
});

test('front-page hard reset clears CacheStorage and reloads the chooser', async ({ page }) => {
  await page.goto('/?release=choose');
  await page.evaluate(async () => { await caches.open('release-shell-stale-test'); });
  await page.locator('[id$="hard-refresh"]').click();
  await page.waitForURL(/cachebust=\d+/u);
  await expect(page.locator('#release-channel-gate')).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).includes('release-shell-stale-test'))).toBe(false);
});

test('routes removed stable and rollback aliases to the exact previous-live channel', async ({ page }) => {
  for (const alias of ['stable', 'rollback']) {
    await page.goto(`/?release=${alias}`);
    await expect(page).toHaveURL(new RegExp(`/${releaseChannels.previous.path}/\\?release=latest`, 'u'));
    await expect(page.locator('.command-brand span')).toContainText(releaseChannels.previous.pass);
  }
});

test('routes each retained choice to its own configured channel', async ({ page }) => {
  for (const key of ['previous', 'retained', 'historical'] as const) {
    const channel = releaseChannels[key];
    await page.goto('/?release=choose');
    await page.locator(`[data-release-choice="${key}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/${channel.path}/\\?release=latest`, 'u'));
    await expect(page.locator('.command-brand span')).toContainText(channel.pass);
  }
});

test('keeps legacy latest, normal and room entries on the stamped current pass', async ({ page }, testInfo) => {
  for (const query of ['?release=latest', '?release=normal', '?room=qa-room&autojoin=1']) {
    await page.goto(`/${query}&renderer=webgl2`);
    // The ROUTING property this test is named for is asserted unconditionally: every legacy
    // alias must land inside the channel the config stamps as live, and the bytes served
    // there must declare that same pass. Neither needs the gameplay renderer to start.
    await expect(page).toHaveURL(new RegExp(`/${releaseChannels.experimental.path}/`, 'u'));
    const servedPass = await page.evaluate(async (path) => {
      const response = await fetch(`/${path}/channel-provenance.json`, { cache: 'no-store' });
      return (await response.json()).releasePass as string;
    }, releaseChannels.experimental.path);
    expect(servedPass).toBe(releaseChannels.experimental.pass);

    if (!await hasWebGpuAdapter(page, testInfo,
      `${query}: the runtime release badge (routing and served provenance were checked)`)) {
      continue;
    }
    await expect(page.locator('#menu')).toBeVisible();
    await expect(page.locator('.command-brand span')).toContainText(releaseChannels.experimental.pass);
    await expect(page.locator('.command-brand span')).not.toContainText('THE BIG ONE');
    await expect(page.locator('.command-brand span')).not.toContainText('HITL');
  }
});
