#!/usr/bin/env node
// Scene-graph probe: what is actually in an arena at runtime.
//
// Screenshots show you that something is wrong; this shows you what object is
// doing it. Enters an arena, walks the live THREE scene, and reports the
// heavy/atmospheric objects - sky domes, transparent full-scene meshes, point
// clouds, sprites - with the numbers that decide how they composite.
//
// Usage: node scripts/qa/probe-arena-scene.mjs [--arena farcrysis]
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const ARENA = arg('--arena', 'farcrysis');
const EXTRA = arg('--extra', '');

const PROBE = () => {
  const debug = window.__ATOMIC_ACRES_DEBUG__;
  const scene = debug?.sampleSceneGraph?.();
  if (!scene) return { error: 'no scene handle exposed' };

  const entries = [];
  let meshCount = 0;
  let triangleCount = 0;

  scene.traverse((object) => {
    if (object.isMesh || object.isPoints || object.isSprite) meshCount += 1;
    const geometry = object.geometry;
    if (geometry?.index) triangleCount += geometry.index.count / 3;
    else if (geometry?.attributes?.position) triangleCount += geometry.attributes.position.count / 3;

    const materials = object.material
      ? (Array.isArray(object.material) ? object.material : [object.material])
      : [];
    const transparent = materials.some((m) => m?.transparent || (m?.opacity ?? 1) < 1);
    const huge = geometry?.boundingSphere?.radius ?? (() => {
      try { geometry?.computeBoundingSphere(); return geometry?.boundingSphere?.radius ?? 0; } catch { return 0; }
    })();

    const interesting = /sky|dome|ray|shaft|sparkle|fog|cloud|water|atmos/i.test(object.name || '')
      || (transparent && huge > 40)
      || huge > 120;
    if (!interesting) return;

    const chain = [];
    for (let node = object.parent; node && chain.length < 6; node = node.parent) {
      chain.push(node.name || `(${node.type})`);
    }

    entries.push({
      name: object.name || `(unnamed ${object.type})`,
      parents: chain.join(' < '),
      uuid: object.uuid.slice(0, 8),
      type: object.type,
      visible: object.visible,
      renderOrder: object.renderOrder,
      radius: Math.round(huge),
      material: materials.map((m) => ({
        type: m?.type,
        side: m?.side,
        transparent: Boolean(m?.transparent),
        opacity: m?.opacity,
        depthWrite: m?.depthWrite,
        depthTest: m?.depthTest,
        fog: m?.fog,
        blending: m?.blending,
      })),
    });
  });

  // What is scene.background, and what does a ray through the sky actually hit?
  const background = scene.background
    ? {
        kind: scene.background.isTexture ? 'texture' : (scene.background.isColor ? 'color' : 'other'),
        name: scene.background.name || null,
        mapping: scene.background.mapping ?? null,
        image: scene.background.image
          ? { width: scene.background.image.width, height: scene.background.image.height }
          : null,
        value: scene.background.isColor ? `#${scene.background.getHexString()}` : null,
      }
    : null;

  // Camera bounds decide whether a far dome is even inside the frustum.
  let cameraInfo = null;
  scene.traverse((object) => {
    if (object.isCamera && !cameraInfo) {
      cameraInfo = { name: object.name || object.type, near: object.near, far: object.far, fov: object.fov, y: object.position.y };
    }
  });

  const fog = scene.fog
    ? { type: scene.fog.type, color: `#${scene.fog.color?.getHexString?.()}`, near: scene.fog.near, far: scene.fog.far, density: scene.fog.density }
    : null;

  const hitlNodes = [];
  scene.traverse((object) => { if (/hitl/i.test(object.name || '')) hitlNodes.push(object.name); });

  return { meshCount, triangleCount: Math.round(triangleCount), background, cameraInfo, fog, hitlNodes: hitlNodes.slice(0, 12), entries };
};

const browser = await chromium.launch({
  headless: true,
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

await page.goto(`${BASE}/?release=latest&renderer=webgl2&render=quality&seed=probe&previewTime=0${EXTRA}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 120_000 });
await page.waitForTimeout(2_500);

const result = await page.evaluate(PROBE);
console.log(JSON.stringify(result, null, 2));

await browser.close();
