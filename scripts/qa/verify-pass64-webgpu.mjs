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
    await page.evaluate(async () => {
      document.documentElement.dataset.pass64Capture = 'stable';
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.waitForFunction(() => {
      const status = document.querySelector('#webgpu-review-status')?.textContent ?? '';
      const fps = Number(/(\d+) FPS/.exec(status)?.[1] ?? '0');
      return fps >= 30;
    }, undefined, { timeout: 5_000 });
    const captureLayout = await page.evaluate(async () => {
      const panel = document.querySelector('#webgpu-review');
      if (!(panel instanceof HTMLElement)) throw new Error('WebGPU review panel is missing');
      // Repaint the isolated HTML layer only after the WebGPU scene and remote
      // fonts have both settled. This prevents a partial glyph layer from
      // becoming evidence even when DOM geometry already looks valid.
      panel.style.visibility = 'hidden';
      await new Promise((resolve) => requestAnimationFrame(resolve));
      panel.style.visibility = 'visible';
      void panel.offsetWidth;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panelRect = panel.getBoundingClientRect();
      const directText = [...panel.querySelectorAll(':scope > small, :scope > strong, :scope > p')].map((node) => {
        if (!(node instanceof HTMLElement)) throw new Error('Unexpected non-HTML review text node');
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return {
          tag: node.tagName.toLowerCase(),
          text: node.textContent?.trim() ?? '',
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          insidePanel: rect.left >= panelRect.left && rect.right <= panelRect.right && rect.top >= panelRect.top && rect.bottom <= panelRect.bottom,
          overflowX: style.overflowX,
          textOverflow: style.textOverflow,
          fontFamily: style.fontFamily,
        };
      });
      return {
        fonts: document.fonts.status,
        reviewFontLoaded: document.fonts.check("900 27px 'Barlow Condensed'"),
        directText,
      };
    });
    const expectedDirectText = [
      'PASS 64 · HARDWARE WEBGPU / TSL',
      'VISUAL FORGE REVIEW',
      'Inspection-only render path. Gameplay and network authority are deliberately disconnected.',
    ];
    const directTextStable = captureLayout.directText.length === expectedDirectText.length
      && captureLayout.directText.every((entry, index) => (
        entry.text === expectedDirectText[index]
        && entry.scrollWidth <= entry.clientWidth + 1
        && entry.insidePanel
        && entry.overflowX === 'visible'
        && entry.textOverflow === 'clip'
      ));
    if (captureLayout.fonts !== 'loaded' || !captureLayout.reviewFontLoaded || !directTextStable) {
      throw new Error(`${arenaId} review text was not fully laid out before capture: ${JSON.stringify(captureLayout.directText)}`);
    }
    await page.waitForTimeout(150);
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
