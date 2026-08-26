// HF-387 scratch browser proof: fence-post camera clip, old served bundle vs
// fixed candidate bundle. Installed Chrome headless = real WebGPU, no slot.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const TARGETS = [
  { label: 'old-shared-preview', base: 'http://127.0.0.1:41911' },
  { label: 'new-hf387-candidate', base: 'http://127.0.0.1:41937' },
];

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
page.on('pageerror', (e) => console.error(`[pageerror] ${String(e).slice(0, 200)}`));

for (const target of TARGETS) {
  const url = `${target.base}/?release=latest&renderer=webgpu&render=quality&seed=hf387&previewTime=0`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  const backend = await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null);
  const gpu = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter?.();
    return adapter ? `${adapter.info?.vendor ?? '?'}/${adapter.info?.architecture ?? '?'}` : 'none';
  });
  console.log(`[${target.label}] backend=${backend} adapter=${gpu}`);

  await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('atomic-acres'); });
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return s.matchPhase === 'active' && s.gameStarted === true;
  }, undefined, { timeout: 120_000 });

  const evidence = await page.evaluate(async () => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    // West boundary fence post line (posts every 7.125 m from z=-28.5).
    debug.teleportPlayer(-28.5, 1.7, -14.25, Math.PI / 2, 0);
    debug.setStance('prone');
    // March into the fence by teleport-pressing to the reachable sliver.
    debug.teleportPlayer(-30.56, 0.61, -14.25, Math.PI / 2, 0);
    await new Promise((resolve) => setTimeout(resolve, 700));
    const snapshot = debug.snapshot();
    const keys = Object.keys(snapshot);
    let eye = null;
    for (const key of ['playerPosition', 'player', 'position']) {
      const candidate = snapshot[key];
      if (candidate && typeof candidate.x === 'number') { eye = candidate; break; }
    }
    if (!eye) return { keys, eye: null };
    let worst = null;
    debug.sampleSceneGraph().traverse((node) => {
      if (!node.isMesh || node.name !== 'fence post') return;
      const p = node.geometry.parameters;
      if (!p) return;
      const m = node.matrixWorld.elements;
      const cx = m[12];
      const cz = m[14];
      const dx = Math.max(cx - p.width / 2 - eye.x, 0, eye.x - (cx + p.width / 2));
      const dy = Math.max(0 - eye.y, 0, eye.y - (m[13] + p.height / 2), eye.y - (m[13] - p.height / 2));
      const vertical = Math.max(m[13] - p.height / 2 - eye.y, 0, eye.y - (m[13] + p.height / 2));
      void dy;
      const dz = Math.max(cz - p.depth / 2 - eye.z, 0, eye.z - (cz + p.depth / 2));
      const d = Math.hypot(dx, vertical, dz);
      const inside = dx === 0 && dz === 0 && eye.y > m[13] - p.height / 2 && eye.y < m[13] + p.height / 2;
      if (worst === null || (inside ? -1 : d) < (worst.inside ? -1 : worst.d)) {
        worst = { inside, d: inside ? 0 : d, cx, cz };
      }
    });
    return { eye, worst };
  });
  console.log(`[${target.label}] evidence=${JSON.stringify(evidence)}`);
  await page.screenshot({ path: `artifacts/hf387-${target.label}.png` });
}

await browser.close();
writeFileSync('artifacts/hf387-clip-proof.done', new Date().toISOString());
