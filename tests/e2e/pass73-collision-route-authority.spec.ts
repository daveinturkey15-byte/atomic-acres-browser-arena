import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

const renderer = process.env.PASS73_COLLISION_RENDERER ?? 'webgl2';
const target = process.env.PASS73_COLLISION_TARGET ?? 'webgl2';
const sourceSha = process.env.PASS73_COLLISION_SOURCE_SHA ?? 'working-tree';
const artifactRoot = resolve(process.cwd(), 'artifacts/pass73/collision-route-authority', target);
const roleOrder = ['wall', 'floor', 'underside', 'canopy', 'window-approach'] as const;

test.use({ trace: 'off', viewport: { width: 960, height: 540 } });

type AuthorityPayload = Readonly<{
  report: {
    schema: string;
    profile: 'performance' | 'quality';
    pass: boolean;
    expectedOwners: number;
    passedOwners: number;
    expectedRouteClearances: number;
    passedRouteClearances: number;
    issues: readonly string[];
    entries: readonly Readonly<{
      houseId: string;
      solidId: string;
      role: typeof roleOrder[number];
      expectedBounds: readonly [number, number, number, number, number, number];
      visibleOwnerCount: number;
      maximumRenderedAxisErrorMetres: number;
      movementBoundsCount: number;
      physicsBoundsCount: number;
      shotBoundsCount: number;
      supportBoundsCount: number | null;
      issues: readonly string[];
    }>[];
  };
  fixtures: readonly Readonly<{
    id: string;
    profile: 'performance' | 'quality';
    houseId: string;
    solidId: string;
    role: typeof roleOrder[number];
    stance: 'stand' | 'crouch' | 'prone';
    radius: number;
    eyeAboveFoot: number;
    bodyHeight: number;
    teleportPosition: readonly [number, number, number];
    yaw: number;
    pitch: number;
    supportTopY: number | null;
  }>[];
}>;

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

async function captureCanvas(page: Page): Promise<Buffer> {
  const clip = await page.locator('#game').boundingBox();
  expect(clip, 'game canvas clip').not.toBeNull();
  return page.screenshot({ type: 'png', clip: clip!, animations: 'disabled', caret: 'hide' });
}

async function readyMatch(page: Page, profile: 'performance' | 'blender'): Promise<void> {
  const requireWebGpu = renderer === 'webgpu' ? '&requireWebGPU=1' : '';
  await page.goto(`/?release=latest&renderer=${renderer}${requireWebGpu}&render=${profile}&map=atomic-acres&signal=off&grass=off&mist=off&clouds=off&rays=off&externalServices=off&seed=730073`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction((expectedRenderer) => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.bootstrap?.stage === 'ready'
      && state?.weaponReady === true
      && state?.render?.runtime?.actualBackend === expectedRenderer;
  }, renderer, { timeout: 120_000 });
  await page.evaluate(() => {
    window.__ATOMIC_ACRES_DEBUG__!.startSolo();
  });
  await page.waitForFunction(() => {
    const state = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    return state?.gameStarted === true
      && state?.matchPhase === 'active'
      && state?.menuVisible === false
      && state?.frameCount > 5;
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => {
    const api = window.__ATOMIC_ACRES_DEBUG__!;
    // startSolo asynchronously authors the bot after the command returns, so
    // isolation must happen after match admission rather than before it.
    api.setBotsFrozen(true);
    api.clearBots();
    api.setMovement(false);
    api.setAds(false);
  });
}

async function stageFixture(page: Page, fixture: AuthorityPayload['fixtures'][number]) {
  // Stance expansion is deliberately refused while airborne. Every preceding
  // fixture settles on an authoritative support, so change stance before the
  // next teleport rather than creating an artificial airborne transition.
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.player?.grounded === true, undefined, { timeout: 5_000 });
  await page.evaluate((stance) => {
    const api = window.__ATOMIC_ACRES_DEBUG__!;
    if (api.snapshot().player.stance !== stance) api.setStance(stance);
  }, fixture.stance);
  await page.waitForFunction((stance) => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.player?.stance === stance, fixture.stance, { timeout: 5_000 });
  await page.evaluate((next) => {
    const api = window.__ATOMIC_ACRES_DEBUG__!;
    api.teleportPlayer(...next.teleportPosition, next.yaw, next.pitch);
    api.setMovement(false);
  }, fixture);
  await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot()?.player?.grounded === true, undefined, { timeout: 5_000 });
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))));
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot());
}

test('both house teams retain one exact collision visual owner in both profiles and all stances', async ({ page, browserName }) => {
  test.setTimeout(300_000);
  await mkdir(artifactRoot, { recursive: true });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"entries":[]}' }));

  const profileReceipts: Record<string, unknown>[] = [];
  const stagedReceipts: Record<string, unknown>[] = [];
  const screenshotReceipts: Record<string, unknown>[] = [];
  for (const renderProfile of ['performance', 'blender'] as const) {
    const expectedProfile = renderProfile === 'blender' ? 'quality' : 'performance';
    await readyMatch(page, renderProfile);
    const authority = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.collisionRouteAuthority()) as AuthorityPayload | null;
    expect(authority, `${expectedProfile}: debug authority`).not.toBeNull();
    expect(authority!.report).toMatchObject({
      schema: 'atomic-acres/collision-route-authority@1',
      profile: expectedProfile,
      pass: true,
      expectedOwners: 10,
      passedOwners: 10,
      expectedRouteClearances: 48,
      passedRouteClearances: 48,
      issues: [],
    });
    expect(authority!.report.entries.every((entry) => entry.visibleOwnerCount === 1
      && entry.maximumRenderedAxisErrorMetres <= 0.002
      && entry.movementBoundsCount === 1
      && entry.physicsBoundsCount === 1
      && entry.shotBoundsCount === 1
      && (entry.supportBoundsCount === null || entry.supportBoundsCount === 1)
      && entry.issues.length === 0)).toBe(true);
    expect(authority!.fixtures).toHaveLength(30);
    profileReceipts.push({
      profile: expectedProfile,
      report: authority!.report,
      runtime: (await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__!.snapshot())).render.runtime,
    });

    const houses = [...new Set(authority!.fixtures.map((fixture) => fixture.houseId))].sort();
    for (const houseId of houses) {
      for (const stance of ['stand', 'crouch', 'prone'] as const) {
        const thumbnails: Buffer[] = [];
        for (const role of roleOrder) {
          const fixture = authority!.fixtures.find((candidate) => candidate.houseId === houseId
            && candidate.stance === stance && candidate.role === role)!;
          const entry = authority!.report.entries.find((candidate) => candidate.solidId === fixture.solidId)!;
          const snapshot = await stageFixture(page, fixture);
          expect(snapshot.player.stance, fixture.id).toBe(stance);
          expect(snapshot.weaponPresentation.armFraming, `${fixture.id}: arms near plane`).toMatchObject({
            finite: true, nearPlaneClear: true, intersectsViewport: true,
          });
          expect(snapshot.weaponPresentation.weaponFraming, `${fixture.id}: weapon near plane`).toMatchObject({
            finite: true, nearPlaneClear: true, intersectsViewport: true,
          });
          const [playerX, playerEyeY] = snapshot.player.position as [number, number, number];
          const footY = playerEyeY - fixture.eyeAboveFoot;
          const bodyTopY = footY + fixture.bodyHeight;
          if (fixture.supportTopY !== null) {
            expect(footY, `${fixture.id}: fall-through/visible-floor penetration`).toBeGreaterThanOrEqual(fixture.supportTopY - 0.03);
            expect(footY, `${fixture.id}: floating above support`).toBeLessThanOrEqual(fixture.supportTopY + 0.06);
          }
          if (role === 'wall') {
            expect(playerX - fixture.radius, `${fixture.id}: body penetrated visible wall`)
              .toBeGreaterThanOrEqual(entry.expectedBounds[3] - 0.03);
          }
          if (role === 'underside') {
            expect(bodyTopY, `${fixture.id}: body penetrated visible underside`)
              .toBeLessThan(entry.expectedBounds[1] - 0.02);
          }
          const canvas = await captureCanvas(page);
          thumbnails.push(await sharp(canvas).resize(256, 144, { fit: 'fill' }).png().toBuffer());
          stagedReceipts.push({
            fixture: fixture.id,
            profile: expectedProfile,
            houseId,
            stance,
            role,
            playerPosition: snapshot.player.position,
            footY,
            bodyTopY,
            supportTopY: fixture.supportTopY,
            surfaceRetreat: snapshot.weaponPresentation.surfaceRetreat,
            surfaceLift: snapshot.weaponPresentation.surfaceLift,
            armNearPlaneClear: snapshot.weaponPresentation.armFraming.nearPlaneClear,
            weaponNearPlaneClear: snapshot.weaponPresentation.weaponFraming.nearPlaneClear,
          });
        }
        const sheet = await sharp({
          create: { width: 256 * thumbnails.length, height: 144, channels: 3, background: '#111820' },
        }).composite(thumbnails.map((input, index) => ({ input, left: index * 256, top: 0 }))).png().toBuffer();
        const sheetStats = await sharp(sheet).stats();
        expect(Math.max(...sheetStats.channels.map((channel) => channel.max - channel.min)), `${expectedProfile}/${houseId}/${stance}: non-blank contact sheet`)
          .toBeGreaterThan(32);
        const relativePath = `${expectedProfile}/${houseId}-${stance}-wall-floor-underside-canopy-window.png`;
        const absolutePath = resolve(artifactRoot, relativePath);
        await mkdir(resolve(absolutePath, '..'), { recursive: true });
        await writeFile(absolutePath, sheet);
        screenshotReceipts.push({ path: `artifacts/pass73/collision-route-authority/${target}/${relativePath}`, sha256: sha256(sheet), roles: roleOrder });
      }
    }
  }

  const fatalErrors = [...new Set(browserErrors)].filter((message) => !/favicon|leaderboard|Failed to fetch|fonts\.googleapis/iu.test(message));
  expect(fatalErrors).toEqual([]);
  const receipt = {
    schemaVersion: 1,
    status: 'PASS',
    contract: 'atomic-acres/pass73-collision-route-authority-receipt@1',
    sourceSha,
    target,
    renderer,
    browser: { project: browserName, userAgent: await page.evaluate(() => navigator.userAgent) },
    matrix: { profiles: 2, houses: 2, stances: 3, roles: 5, stagedRows: stagedReceipts.length },
    profileReceipts,
    stagedReceipts,
    screenshots: screenshotReceipts,
    browserErrors: fatalErrors,
  };
  await writeFile(resolve(artifactRoot, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  expect(stagedReceipts).toHaveLength(60);
  expect(screenshotReceipts).toHaveLength(12);
});
