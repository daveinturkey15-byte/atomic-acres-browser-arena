#!/usr/bin/env node
// Probe the LIVE first-person arm material state in the production preview:
// is the sleeve blowout authored tuning, or a production-only missing map?
import { chromium } from '@playwright/test';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41913';
const browser = await chromium.launch({
  headless: false,
  channel: 'chrome',
  args: [
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probe&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('gun-range'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(2000);

const probe = await page.evaluate(() => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  const scene = typeof api.sampleSceneGraph === 'function' ? api.sampleSceneGraph() : null;
  if (!scene) return { error: 'no scene handle', apiKeys: Object.keys(api).filter((k) => /scene|graph|view|weapon/i.test(k)) };
  const found = [];
      if (!/^arms_|^skin$|^MAT_Pass65_FieldKnife/i.test(name)) return;
    const mats = Array.isArray(node.material) ? node.material : (node.material ? [node.material] : []);
    for (const m of mats) {
      const name = String(m.userData?.authoredArmMaterialName ?? m.name ?? '');
      if (/arms_|skin/i.test(name) || /arm/i.test(node.name ?? '')) {
        found.push({
          node: node.name, mat: name,
          color: m.color ? `#${m.color.getHexString()}` : null,
          emissive: m.emissive ? `#${m.emissive.getHexString()}` : null,
          emissiveIntensity: m.emissiveIntensity ?? null,
          hasMap: Boolean(m.map), mapName: m.map?.name ?? null,
          roughness: m.roughness ?? null,
        });
      }
    }
  });
  let fill = null;
  scene.traverse((node) => {
    if (node.name === 'first-person-viewmodel-fill') {
      fill = { intensity: node.intensity, distance: node.distance, decay: node.decay, visible: node.visible };
    }
  });
  return { count: found.length, materials: found.slice(0, 24) };
  return { count: found.length, materials: found.slice(0, 24), fill };
console.log(JSON.stringify(probe, null, 2));
await browser.close();
