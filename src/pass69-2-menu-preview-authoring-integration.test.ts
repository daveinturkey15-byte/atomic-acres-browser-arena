import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(process.cwd(), 'scripts/assets/generate-pass65-runtime-menu-previews.ts'),
  'utf8',
);

describe('Pass 69.2 authoritative menu-preview capture lifecycle', () => {
  it('reasserts the synchronous viewmodel hide for every requested frame', () => {
    const frameLoop = source.slice(
      source.indexOf('for (const frame of requestedFrames)'),
      source.indexOf('const snapshot = await page.evaluate', source.indexOf('for (const frame of requestedFrames)')),
    );
    const cameraIndex = frameLoop.indexOf('debug.setCaptureCameraPose(');
    const hideIndex = frameLoop.indexOf('debug.setCaptureViewmodelHidden(true);');
    const presentationWaitIndex = frameLoop.indexOf('snapshot.sniperScope.viewmodelVisible === false');
    const screenshotIndex = frameLoop.indexOf('await page.screenshot(');

    expect(cameraIndex).toBeGreaterThanOrEqual(0);
    expect(hideIndex).toBeGreaterThan(cameraIndex);
    expect(presentationWaitIndex).toBeGreaterThan(hideIndex);
    expect(screenshotIndex).toBeGreaterThan(presentationWaitIndex);
  });
});
