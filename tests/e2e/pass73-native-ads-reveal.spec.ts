import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import {
  PASS73_NATIVE_ADS_REVEAL_PROFILES,
  PASS73_NATIVE_ADS_REVEAL_ROI,
  PASS73_NATIVE_ADS_REVEAL_SCHEMA,
  PASS73_NATIVE_ADS_REVEAL_THRESHOLDS,
  PASS73_NATIVE_ADS_REVEAL_WEAPONS,
  assertPass73NativeAdsRevealReceipt,
  pass73NativeAdsRevealFailures,
} from '../../scripts/qa/pass73-native-ads-reveal-contract.mjs';

const enabled = process.env.PASS73_NATIVE_ADS_REVEAL === '1';
const expectedHead = process.env.PASS73_NATIVE_SOURCE_SHA ?? '';
const expectedTree = process.env.PASS73_NATIVE_TREE_SHA ?? '';
const chromePath = process.env.PASS73_NATIVE_CHROME_PATH ?? '';
const chromeSha256 = process.env.PASS73_NATIVE_CHROME_SHA256 ?? '';
const compositor = process.env.PASS73_NATIVE_COMPOSITOR ?? '';
const artifactRoot = 'artifacts/pass73/native-ads-reveal';
const viewport = Object.freeze({ width: 2_560, height: 1_440 });

type RawReadback = Readonly<Record<string, any> & {
  width: number;
  height: number;
  channels: 4;
  rgba8Base64: string;
}>;

type RawTriplet = Readonly<{
  revealShown: RawReadback;
  revealSuppressed: RawReadback;
  normalHidden: RawReadback;
}>;

test.describe.configure({ mode: 'serial' });
test.skip(!enabled, 'Run only through the exact-SHA installed-Chrome Pass 73 native ADS reveal gate.');

function git(...args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', windowsHide: true }).trim();
}

function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function pixels(readback: RawReadback): Buffer {
  const value = Buffer.from(readback.rgba8Base64, 'base64');
  expect(value.byteLength).toBe(PASS73_NATIVE_ADS_REVEAL_ROI.width * PASS73_NATIVE_ADS_REVEAL_ROI.height * 4);
  return value;
}

function changedFraction(left: Buffer, right: Buffer): number {
  expect(left.byteLength).toBe(right.byteLength);
  let changed = 0;
  for (let offset = 0; offset < left.byteLength; offset += 4) {
    const delta = Math.max(
      Math.abs(left[offset]! - right[offset]!),
      Math.abs(left[offset + 1]! - right[offset + 1]!),
      Math.abs(left[offset + 2]! - right[offset + 2]!),
    );
    if (delta >= PASS73_NATIVE_ADS_REVEAL_ROI.pixelDelta) changed += 1;
  }
  return changed / (left.byteLength / 4);
}

function orangeChangedFraction(shown: Buffer, suppressed: Buffer): number {
  expect(shown.byteLength).toBe(suppressed.byteLength);
  let orange = 0;
  for (let offset = 0; offset < shown.byteLength; offset += 4) {
    const red = shown[offset]! - suppressed[offset]!;
    const green = shown[offset + 1]! - suppressed[offset + 1]!;
    const blue = shown[offset + 2]! - suppressed[offset + 2]!;
    if (red >= PASS73_NATIVE_ADS_REVEAL_ROI.pixelDelta
      && red > Math.max(0, green) * 1.08
      && Math.max(0, green) > Math.max(0, blue) * 1.12) orange += 1;
  }
  return orange / (shown.byteLength / 4);
}

async function deploy(page: Page, baseURL: string, profile: string, weapon: string): Promise<string> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200, contentType: 'text/css', body: '',
  }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: '{"entries":[]}',
  }));
  const route = new URL('/channels/the-big-one/', baseURL);
  for (const [key, value] of Object.entries({
    release: 'latest', map: 'atomic-acres', renderer: 'webgpu', requireWebGPU: '1',
    render: profile, externalServices: 'off', traceNodeBuilds: '1',
    signal: 'off', grass: 'off', mist: 'off', clouds: 'off', rays: 'off',
    seed: `pass73-native-ads-reveal-${profile}-${weapon}`,
  })) route.searchParams.set(key, value);
  await page.goto(route.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await expect(page.locator('#solo')).toBeEnabled({ timeout: 90_000 });
  await page.locator('#player-name').fill(`Pass 73 ADS ${profile} ${weapon}`);
  await page.locator('#solo').click();
  try {
    await page.waitForFunction((expectedProfile) => {
      const api = (window as any).__ATOMIC_ACRES_DEBUG__;
      const state = api?.snapshot();
      const runtimeProfile = expectedProfile === 'quality' ? 'blender' : expectedProfile;
      return state?.matchPhase === 'active'
        && state?.render?.runtime?.actualBackend === 'webgpu'
        && state?.render?.runtime?.softwareAdapter === false
        && state?.render?.runtime?.presentation?.status === 'healthy'
        && document.documentElement.dataset.renderProfile === runtimeProfile;
    }, profile, { polling: 'raf', timeout: 90_000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => {
      const api = (window as any).__ATOMIC_ACRES_DEBUG__;
      const state = api?.snapshot();
      return {
        bootstrap: state?.bootstrap ?? null,
        gameStarted: state?.gameStarted ?? null,
        matchPhase: state?.matchPhase ?? null,
        arenaSelection: state?.arenaSelection ?? null,
        renderRuntime: state?.render?.runtime ?? null,
        weaponReady: state?.weaponReady ?? null,
        dataset: { ...document.documentElement.dataset },
        deploymentTransition: { ...document.querySelector<HTMLElement>('#deployment-transition')?.dataset },
        status: document.querySelector<HTMLElement>('#network-status')?.textContent ?? null,
        runtimeLog: localStorage.getItem('atomic-acres:client-runtime-log:v1'),
      };
    });
    throw new Error(`Native ADS deployment did not reach the active WebGPU profile: ${JSON.stringify(diagnostic, null, 2)}`, {
      cause: error,
    });
  }
  await page.evaluate(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setMovement(false);
  });
  return route.toString();
}

async function acquirePointerLock(page: Page): Promise<void> {
  await page.bringToFront();
  if (!await page.evaluate(() => document.pointerLockElement?.id === 'game')) {
    await page.locator('#game').click({ position: { x: 1_280, y: 720 }, force: true });
  }
  await page.waitForFunction(() => document.pointerLockElement?.id === 'game', undefined, {
    polling: 'raf', timeout: 10_000,
  });
}

async function equipAndStage(page: Page, weapon: string): Promise<any> {
  const stage = await page.evaluate((weaponId) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    if (weaponId === 'railgun') {
      const railgun = api.stageRailgunSpawn(0);
      if (!Array.isArray(railgun?.pickupPosition)) throw new Error('Railgun pickup position is missing');
      api.teleportPlayer(...railgun.pickupPosition);
      const result = api.interactRailgun();
      if (result !== true) throw new Error(`Railgun pickup rejected: ${String(result)}`);
    } else {
      api.equipWeapon(weaponId);
    }
    const staged = api.stagePass73NativeAdsRevealTarget();
    if (!staged) throw new Error('Pass 73 exact hostile staging failed');
    api.setMovement(false);
    return staged;
  }, weapon);
  await page.waitForFunction((weaponId) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().player.weapon === weaponId
  ), weapon, { polling: 'raf', timeout: 10_000 });
  return stage;
}

async function armTrustedRmbProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as any;
    const events: Array<Record<string, unknown>> = [];
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const) {
      window.addEventListener(type, (event) => {
        const mouse = event as MouseEvent;
        if (mouse.button !== 2) return;
        events.push({ type, button: mouse.button, isTrusted: mouse.isTrusted, timeStamp: mouse.timeStamp });
      }, { capture: true });
    }
    scope.__PASS73_ADS_RMB_PROBE__ = { events };
  });
}

async function captureTriplet(page: Page, targetId: string): Promise<RawTriplet> {
  return page.evaluate(async (id) => (
    (window as any).__ATOMIC_ACRES_DEBUG__.capturePass73NativeAdsRevealRoiTriplet(id)
  ), targetId);
}

async function persistReadback(
  readback: RawReadback,
  relativePath: string,
  artifacts: Array<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const raw = pixels(readback);
  const png = await sharp(raw, {
    raw: { width: readback.width, height: readback.height, channels: readback.channels },
  }).flip().png().toBuffer();
  const artifactPath = `${artifactRoot}/${relativePath}`;
  const absolutePath = resolve(process.cwd(), artifactPath);
  mkdirSync(resolve(absolutePath, '..'), { recursive: true });
  writeFileSync(absolutePath, png);
  const artifactSha256 = sha256(png);
  const artifactBytes = png.byteLength;
  artifacts.push({ path: artifactPath, sha256: artifactSha256, bytes: artifactBytes });
  const { rgba8Base64: _removedRawPixels, ...bounded } = readback;
  return { ...bounded, artifactPath, artifactSha256, artifactBytes };
}

async function persistTriplet(
  triplet: RawTriplet,
  profile: string,
  weapon: string,
  phase: 'outside' | 'ads',
  artifacts: Array<Record<string, unknown>>,
): Promise<Record<string, Record<string, unknown>>> {
  const prefix = `${profile}-${weapon}-${phase}`;
  return {
    revealShown: await persistReadback(triplet.revealShown, `${prefix}-reveal-shown.png`, artifacts),
    revealSuppressed: await persistReadback(triplet.revealSuppressed, `${prefix}-reveal-suppressed.png`, artifacts),
    normalHidden: await persistReadback(triplet.normalHidden, `${prefix}-normal-hidden.png`, artifacts),
  };
}

test('M14 EBR and Railgun reveal one exact animated hostile through a wall in native Quality and Performance', async ({ browser }, testInfo) => {
  test.setTimeout(600_000);
  expect(expectedHead).toMatch(/^[a-f0-9]{40}$/u);
  expect(expectedTree).toMatch(/^[a-f0-9]{40}$/u);
  expect(chromeSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(chromePath).toMatch(/[/\\]Google[/\\]Chrome[/\\]Application[/\\]chrome\.exe$/iu);
  expect(git('status', '--porcelain', '--untracked-files=all')).toBe('');
  expect(git('rev-parse', 'HEAD')).toBe(expectedHead);
  expect(git('rev-parse', 'HEAD^{tree}')).toBe(expectedTree);

  const baseURL = testInfo.project.use.baseURL as string;
  const artifacts: Array<Record<string, unknown>> = [];
  const cells: Array<Record<string, unknown>> = [];
  for (const profile of PASS73_NATIVE_ADS_REVEAL_PROFILES) {
    for (const weapon of PASS73_NATIVE_ADS_REVEAL_WEAPONS) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      const browserErrors: string[] = [];
      page.on('pageerror', (error) => browserErrors.push(error.stack ?? error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') browserErrors.push(message.text());
      });
      try {
        const route = await deploy(page, baseURL, profile, weapon);
        const stage = await equipAndStage(page, weapon);
        await acquirePointerLock(page);
        await armTrustedRmbProbe(page);

        const outsideRaw = await captureTriplet(page, stage.id);
        const outsidePixels = {
          revealShown: pixels(outsideRaw.revealShown),
          revealSuppressed: pixels(outsideRaw.revealSuppressed),
          normalHidden: pixels(outsideRaw.normalHidden),
        };
        const outsideState = await page.evaluate(() => {
          const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          return {
            adsHeld: state.textChat.adsHeld,
            revealActiveTargets: state.dmrThermal.exactOperatorReveal.activeTargets,
          };
        });
        const outsideReadbacks = await persistTriplet(outsideRaw, profile, weapon, 'outside', artifacts);

        await page.mouse.down({ button: 'right' });
        await page.waitForFunction(({ weaponId, targetId }) => {
          const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          const reveal = state.dmrThermal.exactOperatorReveal;
          const weaponReveal = weaponId === 'railgun'
            ? state.railgun.revealActive === true
            : state.dmrThermal.active === true;
          return state.textChat.adsHeld === true
            && state.weaponPresentation.adsProgress >= 0.95
            && weaponReveal
            && reveal.activeTargets === 1
            && reveal.activeTargetIds?.[0] === targetId;
        }, { weaponId: weapon, targetId: stage.id }, { polling: 'raf', timeout: 10_000 });

        const firstPose = await page.evaluate((targetId) => {
          const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          return state.dmrThermal.exactOperatorReveal.targets.find((target: any) => target.id === targetId);
        }, stage.id);
        await page.waitForFunction(({ targetId, digest }) => {
          const reveal = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().dmrThermal.exactOperatorReveal;
          const target = reveal.targets.find((entry: any) => entry.id === targetId);
          return target?.sourcePoseDigest !== digest && target?.sourcePoseDigest === target?.modelPoseDigest;
        }, { targetId: stage.id, digest: firstPose.sourcePoseDigest }, { polling: 'raf', timeout: 5_000 });
        const secondPose = await page.evaluate((targetId) => {
          const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          return state.dmrThermal.exactOperatorReveal.targets.find((target: any) => target.id === targetId);
        }, stage.id);

        const adsRaw = await captureTriplet(page, stage.id);
        const adsPixels = {
          revealShown: pixels(adsRaw.revealShown),
          revealSuppressed: pixels(adsRaw.revealSuppressed),
          normalHidden: pixels(adsRaw.normalHidden),
        };
        const adsState = await page.evaluate((targetId) => {
          const api = (window as any).__ATOMIC_ACRES_DEBUG__;
          const state = api.snapshot();
          return {
            adsHeld: state.textChat.adsHeld,
            adsProgress: state.weaponPresentation.adsProgress,
            revealTelemetry: state.dmrThermal.exactOperatorReveal,
            identityAfter: api.samplePass73AdsRevealTarget(targetId),
          };
        }, stage.id);
        const adsReadbacks = await persistTriplet(adsRaw, profile, weapon, 'ads', artifacts);

        await page.mouse.up({ button: 'right' });
        await page.waitForFunction(() => {
          const state = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          return state.textChat.adsHeld === false
            && state.dmrThermal.exactOperatorReveal.activeTargets === 0;
        }, undefined, { polling: 'raf', timeout: 10_000 });
        const release = await page.evaluate(() => {
          const reveal = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().dmrThermal.exactOperatorReveal;
          return {
            adsHeld: false,
            activeTargets: reveal.activeTargets,
            throughGeometry: reveal.throughGeometry,
            orangeHalo: reveal.orangeHalo,
          };
        });
        const trustedInput = await page.evaluate(() => {
          const events = [...(window as any).__PASS73_ADS_RMB_PROBE__.events];
          return {
            source: 'playwright-page-mouse-physical-rmb',
            syntheticEvents: events.filter((event: any) => event.isTrusted !== true).length,
            events,
          };
        });
        const fatalErrors = [...new Set(browserErrors)].filter((message) => (
          !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/iu.test(message)
        ));
        cells.push({
          id: `${profile}:${weapon}`,
          profile,
          weapon,
          route,
          userAgent: await page.evaluate(() => navigator.userAgent),
          viewport: [viewport.width, viewport.height],
          deviceScaleFactor: 1,
          browserErrors: fatalErrors,
          render: adsRaw.revealShown.render,
          stage,
          trustedInput,
          outsideAds: {
            ...outsideState,
            adsOffLeakFraction: changedFraction(outsidePixels.revealShown, outsidePixels.revealSuppressed),
            normalBodyLeakFraction: changedFraction(outsidePixels.revealSuppressed, outsidePixels.normalHidden),
            readbacks: {
              revealEnabled: outsideReadbacks.revealShown,
              revealSuppressed: outsideReadbacks.revealSuppressed,
              normalHidden: outsideReadbacks.normalHidden,
            },
          },
          ads: {
            ...adsState,
            normalBodyLeakFraction: changedFraction(adsPixels.revealSuppressed, adsPixels.normalHidden),
            revealChangedFraction: changedFraction(adsPixels.revealShown, adsPixels.revealSuppressed),
            orangeChangedFraction: orangeChangedFraction(adsPixels.revealShown, adsPixels.revealSuppressed),
            readbacks: {
              revealShown: adsReadbacks.revealShown,
              revealSuppressed: adsReadbacks.revealSuppressed,
              normalHidden: adsReadbacks.normalHidden,
            },
            pose: {
              firstSourceDigest: firstPose.sourcePoseDigest,
              firstModelDigest: firstPose.modelPoseDigest,
              secondSourceDigest: secondPose.sourcePoseDigest,
              secondModelDigest: secondPose.modelPoseDigest,
              lifeId: stage.lifeId,
              continuityId: stage.continuityId,
            },
          },
          release,
        });
      } finally {
        await context.close();
      }
    }
  }

  const endingHead = git('rev-parse', 'HEAD');
  const endingTree = git('rev-parse', 'HEAD^{tree}');
  const receipt: any = {
    schema: PASS73_NATIVE_ADS_REVEAL_SCHEMA,
    verdict: 'pass',
    source: {
      head: expectedHead,
      tree: expectedTree,
      clean: git('status', '--porcelain', '--untracked-files=all') === '',
      endingHead,
      endingTree,
    },
    browser: {
      executablePath: chromePath.replaceAll('\\', '/'),
      executableSha256: chromeSha256,
      version: browser.version(),
    },
    gate: {
      profiles: [...PASS73_NATIVE_ADS_REVEAL_PROFILES],
      weapons: [...PASS73_NATIVE_ADS_REVEAL_WEAPONS],
      viewport: [viewport.width, viewport.height],
      deviceScaleFactor: 1,
      backend: 'native-hardware-webgpu',
      input: 'trusted-physical-rmb',
      compositor,
      cells: 4,
      skipped: 0,
      roi: { ...PASS73_NATIVE_ADS_REVEAL_ROI },
      thresholds: { ...PASS73_NATIVE_ADS_REVEAL_THRESHOLDS },
    },
    testSummary: { expected: 1, passed: 1, failed: 0, skipped: 0 },
    artifacts,
    cells,
  };
  const failures = pass73NativeAdsRevealFailures(receipt, {
    head: expectedHead,
    tree: expectedTree,
    executableSha256: chromeSha256,
  });
  receipt.verdict = failures.length === 0 ? 'pass' : 'fail';
  mkdirSync(artifactRoot, { recursive: true });
  writeFileSync(`${artifactRoot}/receipt.json`, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  assertPass73NativeAdsRevealReceipt(receipt, {
    head: expectedHead,
    tree: expectedTree,
    executableSha256: chromeSha256,
  });
  await testInfo.attach('pass73-native-ads-reveal-receipt', {
    body: Buffer.from(JSON.stringify(receipt, null, 2)), contentType: 'application/json',
  });
});
