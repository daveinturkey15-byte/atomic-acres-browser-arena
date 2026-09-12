#!/usr/bin/env node
// One-shot scene-graph probe for the hijacked-refinement lane: boots high-seas
// on WebGPU and answers specific root-cause questions about the defects seen
// in captured frames. Read-only.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:41911';
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=probe&previewTime=0`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('high-seas'); });
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const s = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return s.matchPhase === 'active' && s.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(2_000);

const probe = await page.evaluate(() => {
  const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
  const out = {};
  const find = (name) => {
    let hit = null;
    scene.traverse((node) => { if (node.name === name) hit = node; });
    return hit;
  };

  // Q1: hull exterior normals - outward or inward?
  const hull = find('high-seas-sculpted-hull');
  if (hull) {
    const geom = hull.geometry;
    const pos = geom.getAttribute('position');
    const norm = geom.getAttribute('normal');
    const samples = [];
    for (const i of [0, 3, 7, 12, 20, 30, 40, 50, 60, 70]) {
      if (i >= pos.count) break;
      const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
      const nx = norm.getX(i), ny = norm.getY(i), nz = norm.getZ(i);
      // Outward = away from centreline axis (x=0) horizontally, and for the
      // top/bottom caps roughly +/- the local slope. Compare horizontal dot.
      const outwardDot = nx * Math.sign(px || 1) + nz * 0;
      samples.push({ i, p: [px, py, pz].map((v) => +v.toFixed(2)), n: [nx, ny, nz].map((v) => +v.toFixed(2)), outwardDot: +outwardDot.toFixed(2) });
    }
    out.hull = {
      material: hull.material.name,
      side: hull.material.side,
      metalness: hull.material.metalness,
      roughness: hull.material.roughness,
      colorHex: hull.material.color.getHexString(),
      envMapIntensity: hull.material.envMapIntensity ?? null,
      vertexCount: pos.count,
      samples,
    };
  }

  // Q2: what materials are on the cabana roof / shower canopy, and their params
  for (const name of ['high-seas-cabana-roof', 'high-seas-shower-canopy', 'high-seas-bow-canopy']) {
    const mesh = find(name);
    if (mesh) {
      const m = mesh.material;
      out[name] = {
        material: m.name, colorHex: m.color.getHexString(), roughness: m.roughness,
        metalness: m.metalness, emissiveHex: m.emissive.getHexString(),
        emissiveIntensity: m.emissiveIntensity, hasNormalMap: Boolean(m.normalMap),
        normalScale: m.normalScale ? [m.normalScale.x, m.normalScale.y] : null,
      };
    }
  }

  // Q3: tile metres + wall material params
  const wallSample = find('high-seas-bow-ground-port-wall-forward') ?? find('high-seas-stern-ground-port-wall-forward');
  if (wallSample) {
    const m = wallSample.material;
    out.wall = {
      name: wallSample.name, material: m.name, colorHex: m.color.getHexString(),
      repeat: m.map ? [m.map.repeat.x, m.map.repeat.y] : null,
      wrap: m.map ? [String(m.map.wrapS), String(m.map.wrapT)] : null,
    };
  }

  // Q4: deck material params
  const deck = find('high-seas-platform-center');
  if (deck) {
    const m = deck.material;
    out.deck = { material: m.name, colorHex: m.color.getHexString(), roughness: m.roughness, metalness: m.metalness };
  }

  // Q5: scene lights actually live (name/type/intensity/colour)
  out.lights = [];
  scene.traverse((node) => {
    if (node.isLight) {
      out.lights.push({
        type: node.type, name: node.name, intensity: node.intensity,
        colorHex: node.color ? node.color.getHexString() : null,
        castShadow: Boolean(node.castShadow), visible: node.visible,
        position: node.position ? [node.position.x, node.position.y, node.position.z].map((v) => +v.toFixed(1)) : null,
      });
    }
  });

  // Q6: environment / background
  out.sceneEnvironment = scene.environment ? String(scene.environment.type ?? 'set') : null;
  out.sceneBackground = scene.background ? String(scene.background.type ?? 'set') : null;
  out.sceneFog = scene.fog ? { type: scene.fog.type, colorHex: scene.fog.color.getHexString(), near: scene.fog.near, far: scene.fog.far } : null;
  out.toneMapping = window.__ATOMIC_ACRES_DEBUG__.samplePresentationTelemetry ? 'telemetry-available' : null;
  return out;
});

await browser.close();
writeFileSync(resolve('artifacts/hijacked-refinement/probe.json'), `${JSON.stringify(probe, null, 2)}\n`);
console.log(JSON.stringify(probe, null, 2));
