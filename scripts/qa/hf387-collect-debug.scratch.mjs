#!/usr/bin/env node
// Scratch debug: boots headless Chrome (WebGPU), loads the local Atomic Acres build, starts a solo match on the Atomic Acres arena, and prints scene-graph/mesh sanity info (mid-coach-torso hierarchy, front wall, world group) as JSON to stdout.
//
// Usage: node scripts/qa/hf387-collect-debug.scratch.mjs
// Flags/env: none (script reads no process.argv, process.env, or --flags; the target URL http://127.0.0.1:41937/?release=latest&renderer=webgpu&render=quality&seed=hf387&previewTime=0 is hardcoded)
// Writes: nothing (JSON goes to stdout only)
// Exit codes: no explicit process.exit calls; 0 on success, non-zero from the Node runtime on unhandled rejection
// Debug the in-page eye-distance function (scratch).
import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text().slice(0, 200)); });
await page.goto('http://127.0.0.1:41937/?release=latest&renderer=webgpu&render=quality&seed=hf387&previewTime=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => {
  const api = window.__ATOMIC_ACRES_DEBUG__;
  await api.selectArena('atomic-acres');
  api.startSolo();
});
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 120_000 });

// Minimal collection: count meshes and dump a few names + one mesh's tri sanity.
const info = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const torso = scene.getObjectByName('mid-coach-torso');
  const chain = [];
  for (let a = torso; a; a = a.parent) chain.push({ name: a.name || a.type, visible: a.visible });
  const wall = scene.getObjectByName('house-0-ground-front-wall') || scene.getObjectByName('front-wall');
  return {
    sceneName: scene.name, sceneType: scene.type,
    childCount: scene.children.length,
    topLevel: scene.children.map((c) => ({ name: c.name || c.type, type: c.type, visible: c.visible })).slice(0, 25),
    torsoFound: Boolean(torso),
    torsoChain: chain,
    wallFound: Boolean(wall),
    worldGroup: (() => { const g = scene.getObjectByName('Atomic Acres arena'); return g ? { visible: g.visible, children: g.children.length } : null; })(),
  };
});
console.log(JSON.stringify(info, (k, val) => (val === Infinity ? 'Inf' : val), 1));
await browser.close();
