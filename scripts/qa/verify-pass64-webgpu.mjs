import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.QA_PREVIEW_PORT ?? '44072');
const chromeCandidates = [
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));
if (!executablePath) throw new Error('Pass 64 hardware WebGPU QA requires PASS64_CHROME_PATH or an installed Google Chrome');

const cases = [
  ['atomic-acres', 'nuke-town-overview'],
  ['skyline-terminal', 'terminal-cabin-ceiling'],
  ['rustworks-1v1', 'rustrig-overview'],
  ['gun-range', 'gun-range-overview'],
];
const artifactRoot = 'artifacts/pass64/webgpu-tsl';
await mkdir(artifactRoot, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port }, logLevel: 'error' });
let browser;

try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath, args: ['--enable-unsafe-webgpu'] });
  const receipts = [];
  for (const [arenaId, cameraId] of cases) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&requireWebGPU=1&map=${arenaId}`);
    await page.waitForFunction(() => '__ATOMIC_ACRES_WEBGPU_DEBUG__' in window, undefined, { timeout: 30_000 });
    const proof = await page.evaluate((id) => window.__ATOMIC_ACRES_WEBGPU_DEBUG__.selectCamera(id), cameraId);
    const captureLayout = await page.evaluate(async () => {
      document.documentElement.dataset.pass64Capture = 'stable';
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panel = document.querySelector('#webgpu-review');
      const title = panel?.querySelector('strong');
      if (!(panel instanceof HTMLElement) || !(title instanceof HTMLElement)) throw new Error('WebGPU review panel is incomplete');
      const panelRect = panel.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      return {
        fonts: document.fonts.status,
        reviewFontLoaded: document.fonts.check("900 27px 'Barlow Condensed'"),
        titleInsidePanel: titleRect.left >= panelRect.left && titleRect.right <= panelRect.right && titleRect.top >= panelRect.top && titleRect.bottom <= panelRect.bottom,
      };
    });
    if (captureLayout.fonts !== 'loaded' || !captureLayout.reviewFontLoaded || !captureLayout.titleInsidePanel) {
      throw new Error(`${arenaId} review UI was not layout-stable before capture`);
    }
    await page.waitForFunction(() => {
      const status = document.querySelector('#webgpu-review-status')?.textContent ?? '';
      const fps = Number(/(\d+) FPS/.exec(status)?.[1] ?? '0');
      return fps >= 30;
    }, undefined, { timeout: 5_000 });
    await page.waitForTimeout(350);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `${artifactRoot}/${arenaId}-${cameraId}.png`, animations: 'disabled' });
    const uniqueErrors = [...new Set(errors)];
    const receipt = {
      arenaId,
      errors: uniqueErrors,
      backend: proof.runtime.actualBackend,
      adapter: proof.runtime.adapterLabel,
      softwareAdapter: proof.runtime.softwareAdapter,
      deviceLost: proof.runtime.deviceLost,
      roots: proof.arena.activePresentationRoots,
      moduleId: proof.arenaModuleId,
      cameraId: proof.activeCameraId,
      pipelines: proof.traversal.compiledPipelineIds,
      descriptorHashes: proof.descriptorHashes,
      legacyShaderMaterials: proof.traversal.legacyShaderMaterials,
      principalHdrSamples: proof.runtime.principalHdrSamples,
      bloom: proof.bloom,
      releasePromotion: proof.releasePromotion,
      captureLayout,
    };
    if (uniqueErrors.length > 0) throw new Error(`${arenaId} emitted browser/GPU errors: ${uniqueErrors[0]}`);
    if (receipt.backend !== 'webgpu' || receipt.softwareAdapter || receipt.deviceLost) {
      throw new Error(`${arenaId} did not retain a healthy hardware WebGPU backend`);
    }
    if (receipt.roots !== 1 || receipt.pipelines.length !== 7 || receipt.legacyShaderMaterials.length !== 0) {
      throw new Error(`${arenaId} failed presentation-root or TSL traversal gates`);
    }
    if (receipt.principalHdrSamples !== 4) throw new Error(`${arenaId} principal HDR target is not four-sample`);
    receipts.push(receipt);
    await page.close();
  }
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    browserExecutable: executablePath,
    arenaRetirementPolicy: 'full-renderer-reload-required',
    receipts,
  };
  await writeFile(`${artifactRoot}/hardware-webgpu-receipt.json`, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
