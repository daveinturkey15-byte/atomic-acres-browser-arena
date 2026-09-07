#!/usr/bin/env node
// HF-536: live sampler census for the built Nuke Town arena. This deliberately
// prints JSON rather than writing a receipt so the caller can review it before
// committing docs/forge/sampler-census.json.
import { chromium } from '@playwright/test';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const base = arg('--url', 'http://127.0.0.1:4323');
const profiles = arg('--profiles', 'quality,performance').split(',').map((value) => value.trim()).filter(Boolean);
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const census = [];
for (const profile of profiles) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 240)); });
  const url = `${base}/?release=latest&renderer=webgpu&render=${profile}&grass=off&mist=off&clouds=off&rays=off&seed=hf536-census&previewTime=0`;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    const adapter = await page.evaluate(async () => {
      const gpu = navigator.gpu;
      const value = { available: Boolean(gpu), adapter: false, maxSampledTexturesPerShaderStage: null };
      if (!gpu) return value;
      const candidate = await gpu.requestAdapter({ powerPreference: 'high-performance' }) ?? await gpu.requestAdapter();
      if (!candidate) return value;
      value.adapter = true;
      value.maxSampledTexturesPerShaderStage = candidate.limits?.maxSampledTexturesPerShaderStage ?? null;
      return value;
    });
    await page.evaluate(async () => { await window.__ATOMIC_ACRES_DEBUG__.selectArena('nuketown2'); });
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.matchPhase === 'active' && snapshot.gameStarted === true
        && document.documentElement.dataset.arenaId === 'nuketown2';
    }, undefined, { timeout: 180_000 });
    const measured = await page.evaluate(() => {
      const scene = window.__ATOMIC_ACRES_DEBUG__.sampleSceneGraph();
      const graphEntries = new Map();
      const allTextures = new Map();
      const nonShaderKeys = new Set(['id', 'uuid', '_uuid', '_cacheKey', '_cacheKeyVersion', 'parents', '_beforeNodes', 'stackTrace']);
      const shape = (value, seen = new Map()) => {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        if (typeof value !== 'object') return JSON.stringify(value) ?? String(value);
        if (value.isNode !== true) return value.isTexture === true ? `texture:${value.name || '?'}` : `object:${value.constructor?.name || 'unknown'}`;
        const prior = seen.get(value);
        if (prior) return prior;
        seen.set(value, '<recursive>');
        const parts = [value.type || value.constructor?.name || '?'];
        for (const key of Object.keys(value).sort()) {
          if (nonShaderKeys.has(key) || typeof value[key] === 'function') continue;
          if (value.isUniformNode && key === 'value') { parts.push('value=<uniform>'); continue; }
          parts.push(`${key}=${Array.isArray(value[key]) ? `[${value[key].map((entry) => shape(entry, seen)).join(',')}]` : shape(value[key], seen)}`);
        }
        const result = `(${parts.join(' ')})`;
        seen.set(value, result);
        return result;
      };
      const samplers = (material) => {
        const textureIds = new Set();
        const visited = new Set();
        const visit = (value) => {
          if (!value || typeof value !== 'object' || visited.has(value)) return;
          visited.add(value);
          const candidate = value.value;
          if (value.isTextureNode === true || value.type === 'TextureNode' || candidate?.isTexture === true) {
            const texture = candidate?.isTexture === true ? candidate : value.value?.value?.isTexture === true ? value.value.value : null;
            if (texture) {
              textureIds.add(texture);
              allTextures.set(texture, texture.name || '(unnamed texture)');
            }
          }
          for (const key of Object.keys(value)) {
            if (key !== 'parent' && key !== 'parents') visit(value[key]);
          }
        };
        for (const key of Object.keys(material)) {
          if (!key.endsWith('Node')) continue;
          visit(material[key]);
        }
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap']) {
          if (material[key]?.isTexture === true) {
            textureIds.add(material[key]);
            allTextures.set(material[key], material[key].name || '(classic texture)');
          }
        }
        return [...textureIds];
      };
      scene.traverse((object) => {
        const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
        for (const material of materials) {
          if (!material?.isNodeMaterial) continue;
          const key = `${material.type}|${Object.keys(material).filter((name) => name.endsWith('Node')).sort().map((name) => `${name}=${shape(material[name])}`).join('|')}`;
          const textures = samplers(material);
          const entry = graphEntries.get(key) || { materialNames: [], textures: new Set() };
          if (!entry.materialNames.includes(material.name)) entry.materialNames.push(material.name || '(unnamed)');
          for (const texture of textures) entry.textures.add(texture);
          graphEntries.set(key, entry);
        }
      });
      const pipelines = [...graphEntries.values()].map((entry) => ({
        materialNames: entry.materialNames.sort(),
        boundSamplers: entry.textures.size,
        textures: [...entry.textures].map((texture) => texture.name || '(unnamed texture)').sort(),
      })).sort((a, b) => b.boundSamplers - a.boundSamplers || a.materialNames[0].localeCompare(b.materialNames[0]));
      return {
        arenaId: document.documentElement.dataset.arenaId ?? null,
        graphCount: pipelines.length,
        materialCount: pipelines.reduce((sum, pipeline) => sum + pipeline.materialNames.length, 0),
        arenaTotalBoundSamplers: allTextures.size,
        arenaTextures: [...allTextures.values()].sort(),
        pipelines,
      };
    });
    census.push({ profile, booted: true, backend: await page.evaluate(() => document.documentElement.dataset.renderBackend ?? null), adapter, errors: [...new Set(errors)], ...measured });
  } catch (error) {
    census.push({ profile, booted: false, error: String(error).slice(0, 300), errors: [...new Set(errors)] });
  } finally {
    await page.close();
  }
}
await browser.close();
console.log(JSON.stringify({ lane: 'night-luna2', arena: 'nuketown2', profiles, census }, null, 2));
