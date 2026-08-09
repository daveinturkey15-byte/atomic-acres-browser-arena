import { expect, test, type Page } from '@playwright/test';

const BASE_QUERY = '?release=latest&renderer=webgl2&render=compat&grass=off&mist=off&clouds=off&rays=off';

type PreviewEvidence = {
  arenaId: string;
  generation: number;
  sourceCount: number;
  mediaState: string;
  videoCurrentSrc: string;
  videoPaused: boolean;
  audioUnlocked: boolean;
  videoMuted: boolean;
  videoVolume: number;
  rendererEvidence: {
    renderCalls: number;
    presentation: { submissionSequence: number };
    gameplayArenaPrepared: boolean;
    arenaConstructionCount: number;
  };
};

async function stubExternalBoards(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'text/css',
    body: '',
  }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ entries: [] }),
  }));
  await page.route('**/v1/streak', (route) => route.fulfill({
    status: 202,
    contentType: 'application/json',
    body: JSON.stringify({ accepted: true }),
  }));
}

async function waitForPreview(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__?.snapshot();
    const preview = snapshot?.menuPreview as PreviewEvidence | undefined;
    return (snapshot?.bootstrap.stage === 'menu-video-ready' || snapshot?.bootstrap.stage === 'ready')
      && preview?.sourceCount === 2
      && Boolean(document.querySelector('#menu-preview-video'));
  }, undefined, { timeout: 30_000 });
}

async function previewEvidence(page: Page): Promise<PreviewEvidence> {
  return page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().menuPreview as PreviewEvidence);
}

test.describe('Pass 65 prerecorded menu previews', () => {
  test.beforeEach(async ({ page }) => stubExternalBoards(page));

  test('browses all map videos with zero gameplay construction or renderer submissions', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`/${BASE_QUERY}`);
    await waitForPreview(page);
    const before = await previewEvidence(page);
    expect(before.audioUnlocked).toBe(false);
    expect(before.videoMuted).toBe(true);
    expect(before.videoVolume).toBeGreaterThanOrEqual(0);
    expect(before.videoVolume).toBeLessThanOrEqual(0.22);
    await expect(page.locator('#menu-preview-video')).toHaveAttribute('width', '2560');
    await expect(page.locator('#menu-preview-video')).toHaveAttribute('height', '1440');
    await expect(page.locator('#menu-preview-poster')).toHaveAttribute('width', '2560');
    await expect(page.locator('#menu-preview-poster')).toHaveAttribute('height', '1440');

    for (const [arenaId, frame, presentation] of [
      ['skyline-terminal', 'helicopter', 'menu-video-runtime-helo-terminal-v7'],
      ['rustworks-1v1', 'helicopter', 'menu-video-runtime-helo-rustrig-v7'],
      ['gun-range', 'cat', 'menu-video-runtime-cat-gun-range-v5'],
      ['atomic-acres', 'helicopter', 'menu-video-runtime-helo-nuke-town-v7'],
    ] as const) {
      await page.locator(`.map-card[data-arena-id="${arenaId}"]`).click();
      const frameLocator = page.locator('#menu-preview-frame');
      await expect(frameLocator).toHaveAttribute('data-arena', arenaId);
      await expect(frameLocator).toHaveAttribute('data-frame', frame);
      await expect(frameLocator).toHaveAttribute('data-presentation', presentation);
      await expect(page.locator('#menu-preview-video source')).toHaveCount(2);
      const current = await previewEvidence(page);
      expect(current.arenaId).toBe(arenaId);
      expect(current.audioUnlocked).toBe(true);
      expect(current.videoMuted).toBe(current.videoVolume <= 0);
      expect(current.rendererEvidence.gameplayArenaPrepared).toBe(false);
      expect(current.rendererEvidence.arenaConstructionCount).toBe(0);
    }

    const after = await previewEvidence(page);
    expect(errors).toEqual([]);
    expect(after.generation).toBeGreaterThan(before.generation);
    expect(after.rendererEvidence.renderCalls).toBe(before.rendererEvidence.renderCalls);
    expect(after.rendererEvidence.presentation.submissionSequence)
      .toBe(before.rendererEvidence.presentation.submissionSequence);
  });

  test('protects the final selected source from stale rapid-switch media events', async ({ page }) => {
    await page.goto(`/${BASE_QUERY}`);
    await waitForPreview(page);
    for (const arenaId of ['skyline-terminal', 'atomic-acres', 'rustworks-1v1', 'gun-range'] as const) {
      await page.locator(`.map-card[data-arena-id="${arenaId}"]`).click();
    }
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-arena', 'gun-range');
    await expect.poll(async () => (await previewEvidence(page)).videoCurrentSrc, { timeout: 15_000 })
      .toMatch(/\/menu-previews\/gun-range\.(webm|mp4)\?v=pass66-runtime-preview-v8$/);
    await page.waitForTimeout(400);
    const final = await previewEvidence(page);
    expect(final.arenaId).toBe('gun-range');
    expect(final.sourceCount).toBe(2);
    expect(final.videoCurrentSrc).toMatch(/\/menu-previews\/gun-range\.(webm|mp4)\?v=pass66-runtime-preview-v8$/);
    expect(final.rendererEvidence.arenaConstructionCount).toBe(0);
  });

  test('uses poster-only playback under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/${BASE_QUERY}`);
    await page.waitForFunction(() => {
      const stage = window.__ATOMIC_ACRES_DEBUG__?.snapshot().bootstrap.stage;
      return stage === 'menu-video-ready' || stage === 'ready';
    });
    await page.locator('.map-card[data-arena-id="gun-range"]').click();
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-motion', 'static');
    await expect(page.locator('#menu-preview-frame')).toHaveAttribute('data-media-state', 'reduced-motion-poster');
    const evidence = await previewEvidence(page);
    expect(evidence.arenaId).toBe('gun-range');
    expect(evidence.sourceCount).toBe(0);
    expect(evidence.videoPaused).toBe(true);
    expect(evidence.rendererEvidence.gameplayArenaPrepared).toBe(false);
    expect(evidence.rendererEvidence.arenaConstructionCount).toBe(0);
  });

  test('constructs exactly the selected arena only after explicit deployment', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/${BASE_QUERY}`);
    await waitForPreview(page);
    await page.locator('.map-card[data-arena-id="gun-range"]').click();
    await page.locator('#player-name').fill('Preview QA');
    await page.locator('#solo').click();
    await expect.poll(async () => {
      const snapshot = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot());
      const preview = snapshot.menuPreview as PreviewEvidence;
      return {
        gameStarted: snapshot.gameStarted,
        prepared: preview.rendererEvidence.gameplayArenaPrepared,
        constructions: preview.rendererEvidence.arenaConstructionCount,
        arena: preview.arenaId,
      };
    }, { timeout: 75_000 }).toEqual({
      gameStarted: true,
      prepared: true,
      constructions: 1,
      arena: 'gun-range',
    });

    const restored = await page.evaluate(() => {
      const debug = window.__ATOMIC_ACRES_DEBUG__;
      debug.setCaptureCameraPose(0, 1.1, 10, 0, 0, 62, 65_000, 65011401);
      const during = debug.snapshot();
      debug.setCaptureCameraPose(null);
      const after = debug.snapshot();
      return {
        during: during.render.playableScene.deterministicReview,
        after: after.render.playableScene.deterministicReview,
        hudVisible: !document.querySelector<HTMLElement>('#hud')!.hidden,
      };
    });
    expect(restored.during).toMatchObject({
      cameraId: 'pass65-offline-menu-preview-capture',
      fixedTimeMs: 65_000,
      seed: 65011401,
      hud: 'hidden',
    });
    expect(restored.after).toMatchObject({
      cameraId: null,
      fixedTimeMs: null,
      seed: null,
      exposure: null,
      hud: null,
    });
    expect(restored.hudVisible).toBe(true);
  });
});
