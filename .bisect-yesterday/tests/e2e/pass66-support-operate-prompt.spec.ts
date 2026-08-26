import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';

const EVIDENCE_GATE = 'support-operate-prompt';
const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ownedEvidence = process.env.PASS66_OWNED_GATE === EVIDENCE_GATE;

type RectEvidence = Readonly<{
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}>;

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function repositoryRelative(path: string): string {
  return relative(process.cwd(), path).replaceAll('\\', '/');
}

function ownedConfiguration(): Readonly<{
  sourceSha: string;
  treeSha256: string;
  exactRootFileCount: number;
  receiptPath: string;
}> | null {
  if (!ownedEvidence) return null;
  const sourceSha = process.env.PASS66_OWNED_SOURCE_SHA ?? '';
  const treeSha256 = process.env.PASS66_OWNED_TREE_SHA256 ?? '';
  const exactRootFileCount = Number(process.env.PASS66_OWNED_FILE_COUNT ?? '');
  const receiptPath = process.env.PASS66_OWNED_RECEIPT_PATH ?? '';
  if (!SHA40.test(sourceSha)) throw new Error('Owned support prompt evidence requires an exact source SHA');
  if (!SHA256.test(treeSha256)) throw new Error('Owned support prompt evidence requires an exact served tree digest');
  if (!Number.isSafeInteger(exactRootFileCount) || exactRootFileCount < 2) {
    throw new Error('Owned support prompt evidence requires a valid served file count');
  }
  const expectedReceiptPath = resolve(process.cwd(), 'artifacts', 'pass66', 'support-operate-prompt', 'receipt.json');
  if (resolve(receiptPath || '.') !== expectedReceiptPath) {
    throw new Error('Owned support prompt evidence receipt must stay below its dedicated artifact root');
  }
  return Object.freeze({ sourceSha, treeSha256, exactRootFileCount, receiptPath: resolve(receiptPath) });
}

async function changedPixelCount(visible: Buffer, hidden: Buffer): Promise<number> {
  const [visibleRaw, hiddenRaw] = await Promise.all([
    sharp(visible).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(hidden).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  expect(visibleRaw.info).toEqual(hiddenRaw.info);
  let changed = 0;
  for (let offset = 0; offset < visibleRaw.data.length; offset += 4) {
    const delta = Math.abs(visibleRaw.data[offset] - hiddenRaw.data[offset])
      + Math.abs(visibleRaw.data[offset + 1] - hiddenRaw.data[offset + 1])
      + Math.abs(visibleRaw.data[offset + 2] - hiddenRaw.data[offset + 2]);
    if (delta >= 24) changed += 1;
  }
  return changed;
}

const SUPPORT_CASES = Object.freeze([
  Object.freeze({ id: 'chopper', slot: 4, readyText: 'CHOPPER READY', operationText: 'OPERATE' }),
  Object.freeze({ id: 'piloted-drone', slot: 2, readyText: 'DRONE READY', operationText: 'PILOT' }),
] as const);

const VIEWPORTS = Object.freeze([
  Object.freeze({ width: 700, height: 720, label: '700x720' }),
  Object.freeze({ width: 960, height: 540, label: '960x540' }),
  Object.freeze({ width: 1_280, height: 720, label: '1280x720' }),
  Object.freeze({ width: 2_560, height: 1_440, label: '2560x1440' }),
  Object.freeze({ width: 3_840, height: 2_160, label: '3840x2160' }),
] as const);

test('keeps one enhanced Chopper/Drone operation line inside the existing top information panel through 4K', async ({ browser, page }) => {
  test.setTimeout(180_000);
  const configuration = ownedConfiguration();
  const output = resolve(process.cwd(), 'artifacts/pass66/support-operate-prompt');
  mkdirSync(output, { recursive: true });
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });
  let servedCandidate: Record<string, unknown> | null = null;
  const viewportEvidence: Array<Record<string, unknown>> = [];
  for (const support of SUPPORT_CASES) {
    await page.setViewportSize({ width: 2_560, height: 1_440 });
    await page.goto(`./?release=latest&renderer=webgl2&render=compat&signal=off&externalServices=off&seed=pass66-support-operate-prompt-${support.id}`);
    const currentServedCandidate = configuration
      ? await page.evaluate(async () => {
        const response = await fetch(new URL('channel-provenance.json', window.location.href), { cache: 'no-store' });
        if (!response.ok) throw new Error(`Served candidate provenance returned HTTP ${response.status}`);
        return response.json() as Promise<Record<string, unknown>>;
      })
      : null;
    if (configuration) {
      expect(currentServedCandidate).toMatchObject({
        schemaVersion: 4,
        channel: 'the-big-one',
        releasePass: 'PASS 66',
        sourceSha: configuration.sourceSha,
        path: 'channels/the-big-one',
        treeSha256: configuration.treeSha256,
        exactRootFileCount: configuration.exactRootFileCount,
      });
      if (servedCandidate === null) servedCandidate = currentServedCandidate;
      else expect(currentServedCandidate).toEqual(servedCandidate);
    }
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().weaponReady === true, undefined, { timeout: 60_000 });
    await page.locator(`[data-killstreak-slot="${support.slot}"]`).selectOption(support.id, { force: true });
    await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.startSolo());
    await page.waitForFunction(() => window.__ATOMIC_ACRES_DEBUG__?.snapshot().matchPhase === 'active', undefined, { timeout: 60_000 });
    await page.evaluate((supportId) => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.setBotsFrozen(true);
      debug.earnSupport(8);
      if (!debug.activateKillstreak(supportId)) throw new Error(`${supportId} activation was rejected`);
    }, support.id);
    const feedback = page.locator('#support-combat-feedback');
    const action = page.locator('#support-control-action');
    await expect(feedback).toBeVisible();
    await expect(feedback).toHaveAttribute('data-awaiting-operation', 'true');
    await expect(action).toContainText(support.readyText);
    await expect(action).toContainText(`AGAIN TO ${support.operationText}`);
    await expect(page.locator('#killstreak-enter-prompt')).toHaveCount(0);
    await page.evaluate(() => {
      const debug = (window as unknown as {
        __ATOMIC_ACRES_DEBUG__: { setRenderPaused: (paused: boolean) => void };
      }).__ATOMIC_ACRES_DEBUG__;
      debug.setRenderPaused(true);
    });
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setRenderPaused(true));
      await page.waitForTimeout(200);
      const layout = await page.evaluate(() => {
        const actionElement = document.querySelector<HTMLElement>('#support-control-action')!;
        const info = document.querySelector<HTMLElement>('#support-combat-feedback')!;
        const actionBounds = actionElement.getBoundingClientRect();
        const infoBounds = info.getBoundingClientRect();
        const style = getComputedStyle(actionElement);
        const intersects = (left: DOMRect, right: DOMRect): boolean => left.width > 0 && left.height > 0
          && right.width > 0 && right.height > 0
          && Math.max(left.left, right.left) < Math.min(left.right, right.right) - 1
          && Math.max(left.top, right.top) < Math.min(left.bottom, right.bottom) - 1;
        const overlappingHudSurfaces = [
          ['mission', document.querySelector<HTMLElement>('.hud-mission-console')],
          ['map', document.querySelector<HTMLElement>('.hud-map-console')],
          ['field-support', document.querySelector<HTMLElement>('#support-block')],
          ['damage-feed', document.querySelector<HTMLElement>('#damage-feeds')],
        ].flatMap(([label, candidate]) => candidate instanceof HTMLElement && intersects(infoBounds, candidate.getBoundingClientRect())
          ? [String(label)] : []);
        const rect = (bounds: DOMRect): RectEvidence => ({
          left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom,
          width: bounds.width, height: bounds.height,
        });
        return {
          actionBounds: rect(actionBounds),
          infoBounds: rect(infoBounds),
          actionFontSize: Number.parseFloat(style.fontSize),
          actionLineHeight: Number.parseFloat(style.lineHeight),
          actionText: actionElement.textContent ?? '',
          actionCount: document.querySelectorAll('#support-control-action').length,
          legacyStandalonePromptCount: document.querySelectorAll('#killstreak-enter-prompt').length,
          awaitingOperation: info.dataset.awaitingOperation,
          horizontalOverflow: actionElement.scrollWidth - actionElement.clientWidth,
          overlappingHudSurfaces,
        };
      });
      const actionBounds = layout.actionBounds as RectEvidence;
      const infoBounds = layout.infoBounds as RectEvidence;
      const identity = `${support.id}/${viewport.label}`;
      expect(infoBounds.left, `${identity}: info left inside viewport`).toBeGreaterThanOrEqual(0);
      expect(infoBounds.top, `${identity}: info top inside viewport`).toBeGreaterThanOrEqual(0);
      expect(infoBounds.right, `${identity}: info right inside viewport`).toBeLessThanOrEqual(viewport.width);
      expect(infoBounds.bottom, `${identity}: info bottom inside viewport`).toBeLessThanOrEqual(viewport.height);
      expect(actionBounds.left, `${identity}: action contained on left`).toBeGreaterThanOrEqual(infoBounds.left);
      expect(actionBounds.top, `${identity}: action contained on top`).toBeGreaterThanOrEqual(infoBounds.top);
      expect(actionBounds.right, `${identity}: action contained on right`).toBeLessThanOrEqual(infoBounds.right);
      expect(actionBounds.bottom, `${identity}: action contained on bottom`).toBeLessThanOrEqual(infoBounds.bottom);
      expect(actionBounds.width, `${identity}: action has width`).toBeGreaterThan(0);
      expect(actionBounds.height, `${identity}: action has height`).toBeGreaterThan(0);
      expect(actionBounds.height, `${identity}: action remains compact`).toBeLessThanOrEqual(64);
      expect(layout.actionFontSize, `${identity}: readable compact type`).toBeGreaterThanOrEqual(10);
      expect(layout.actionFontSize, `${identity}: readable compact type`).toBeLessThanOrEqual(13);
      expect(layout.actionCount, `${identity}: one existing action surface`).toBe(1);
      expect(layout.legacyStandalonePromptCount, `${identity}: no duplicate standalone banner`).toBe(0);
      expect(layout.awaitingOperation, `${identity}: highlighted waiting state`).toBe('true');
      expect(layout.horizontalOverflow, `${identity}: text stays within the top panel`).toBeLessThanOrEqual(1);
      expect(layout.overlappingHudSurfaces, `${identity}: top support panel does not cover other HUD consoles`).toEqual([]);
      expect(layout.actionText).toContain(support.readyText);
      expect(layout.actionText).toContain(`AGAIN TO ${support.operationText}`);
      const clip = {
        x: Math.floor(actionBounds.left),
        y: Math.floor(actionBounds.top),
        width: Math.ceil(actionBounds.right) - Math.floor(actionBounds.left),
        height: Math.ceil(actionBounds.bottom) - Math.floor(actionBounds.top),
      };
      expect(clip.x + clip.width, `${identity}: evidence clip right inside viewport`).toBeLessThanOrEqual(viewport.width);
      expect(clip.y + clip.height, `${identity}: evidence clip bottom inside viewport`).toBeLessThanOrEqual(viewport.height);

      const artifactStem = `${support.id}-${viewport.label}`;
      const visiblePath = resolve(output, `${artifactStem}-visible.png`);
      const hiddenPath = resolve(output, `${artifactStem}-hidden.png`);
      const fullPath = resolve(output, `${artifactStem}-full.png`);
      const screenshotOptions = { animations: 'disabled' as const, caret: 'hide' as const, scale: 'css' as const };
      const visibleAction = await page.screenshot({ ...screenshotOptions, clip, path: visiblePath });
      await action.evaluate((element) => { element.style.visibility = 'hidden'; });
      const hiddenAction = await page.screenshot({ ...screenshotOptions, clip, path: hiddenPath });
      await page.waitForTimeout(120);
      const hiddenActionConfirmation = await page.screenshot({ ...screenshotOptions, clip });
      const hiddenBackgroundDriftPixelCount = await changedPixelCount(hiddenAction, hiddenActionConfirmation);
      const actionChangedPixelCount = await changedPixelCount(visibleAction, hiddenAction);
      expect(hiddenBackgroundDriftPixelCount, `${identity}: paused compositor drift remains negligible`).toBeLessThanOrEqual(32);
      expect(actionChangedPixelCount, `${identity}: enhanced action paints materially distinct pixels`)
        .toBeGreaterThan(Math.max(500, hiddenBackgroundDriftPixelCount * 50));
      await action.evaluate((element) => { element.style.visibility = ''; });
      const full = await page.screenshot({ ...screenshotOptions, path: fullPath });
      viewportEvidence.push({
        supportId: support.id,
        label: viewport.label,
        width: viewport.width,
        height: viewport.height,
        actionBounds,
        infoBounds,
        actionFontSize: layout.actionFontSize,
        actionLineHeight: layout.actionLineHeight,
        actionText: layout.actionText,
        actionCount: layout.actionCount,
        legacyStandalonePromptCount: layout.legacyStandalonePromptCount,
        awaitingOperation: layout.awaitingOperation,
        horizontalOverflow: layout.horizontalOverflow,
        overlappingHudSurfaces: layout.overlappingHudSurfaces,
        actionChangedPixelCount,
        hiddenBackgroundDriftPixelCount,
        artifacts: {
          full: { path: repositoryRelative(fullPath), sha256: sha256(full) },
          visible: { path: repositoryRelative(visiblePath), sha256: sha256(visibleAction) },
          hidden: { path: repositoryRelative(hiddenPath), sha256: sha256(hiddenAction) },
        },
      });
    }
  }

  expect(browserErrors, 'support prompt evidence has no browser errors').toEqual([]);
  if (configuration) {
    const receipt = {
      schemaVersion: 1,
      status: 'PASS',
      gate: EVIDENCE_GATE,
      sourceSha: configuration.sourceSha,
      servedCandidate,
      browser: 'chromium',
      browserVersion: browser.version(),
      rendererPaused: true,
      singleExistingSurface: true,
      supportCases: SUPPORT_CASES.map(({ id }) => id),
      errors: browserErrors,
      viewports: viewportEvidence,
    };
    mkdirSync(dirname(configuration.receiptPath), { recursive: true });
    const temporaryReceiptPath = `${configuration.receiptPath}.tmp`;
    writeFileSync(temporaryReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    rmSync(configuration.receiptPath, { force: true });
    renameSync(temporaryReceiptPath, configuration.receiptPath);
  }
});
