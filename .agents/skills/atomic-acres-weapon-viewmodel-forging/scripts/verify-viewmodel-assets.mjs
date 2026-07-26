#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const input = process.argv[2];
if (!input) {
  console.error('usage: node verify-viewmodel-assets.mjs <viewmodel-manifest.json>');
  process.exit(2);
}
const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); };
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
const shaOk = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(input, 'utf8'));
} catch (error) {
  console.error(`FAIL viewmodel-assets unreadable-json ${error.message}`);
  process.exit(2);
}

check(manifest.schemaVersion === 1, 'schemaVersion must equal 1');
const entries = Array.isArray(manifest.presentations) ? manifest.presentations : [];
check(entries.length > 0, 'presentations must be non-empty');
check(new Set(entries.map(item => item?.id)).size === entries.length, 'presentation IDs must be unique');

for (const entry of entries) {
  const label = idOk(entry?.id) ? entry.id : '<invalid-id>';
  check(idOk(entry?.id), `${label}: invalid id`);
  check(idOk(entry?.skeletonId), `${label}: missing skeletonId`);
  check(entry?.materialPath === 'tsl', `${label}: materialPath must be tsl`);
  check(entry?.cameraRaySource === 'camera-center', `${label}: camera authority must remain camera-center`);
  check(entry?.animationMarkersAuthority === false, `${label}: animation markers cannot own authority`);
  check(entry?.accessibility?.weaponMotionScale === true, `${label}: weapon motion accessibility scale missing`);

  const assets = [...(entry?.firstPersonLods ?? []), ...(entry?.worldLods ?? [])];
  check(Array.isArray(entry?.firstPersonLods) && entry.firstPersonLods.length > 0, `${label}: first-person LOD missing`);
  check(Array.isArray(entry?.worldLods) && entry.worldLods.length > 0, `${label}: world LOD missing`);
  for (const asset of assets) {
    check(typeof asset?.url === 'string' && asset.url.length > 0, `${label}: asset URL missing`);
    check(shaOk(asset?.sha256), `${label}: asset digest invalid`);
    check(typeof asset?.source === 'string' && asset.source.length > 0, `${label}: asset source missing`);
    check(typeof asset?.license === 'string' && asset.license.length > 0, `${label}: asset license missing`);
  }

  const semantic = new Set(entry?.semanticParts ?? []);
  for (const part of ['arms', 'hands', 'weapon']) check(semantic.has(part), `${label}: semantic part ${part} missing`);
  const requiredSockets = Array.isArray(entry?.requiredSockets) ? entry.requiredSockets : [];
  check(requiredSockets.length > 0, `${label}: requiredSockets missing`);
  for (const socket of requiredSockets) check(entry?.sockets?.[socket] === true, `${label}: socket ${socket} missing`);

  const requiredActions = Array.isArray(entry?.requiredActions) ? entry.requiredActions : [];
  const clips = Array.isArray(entry?.clips) ? entry.clips : [];
  const captures = Array.isArray(entry?.captures) ? entry.captures : [];
  check(requiredActions.length > 0, `${label}: requiredActions missing`);
  check(new Set(requiredActions).size === requiredActions.length, `${label}: requiredActions duplicate`);
  for (const action of requiredActions) {
    check(clips.filter(clip => clip?.action === action).length === 1, `${label}: action ${action} must have one clip`);
    const capture = captures.find(item => item?.action === action);
    check(Boolean(capture), `${label}: action ${action} capture missing`);
    if (capture) {
      check(/^[a-f0-9]{40}$/.test(capture.sourceSha ?? ''), `${label}: action ${action} source SHA invalid`);
      check(typeof capture.buildId === 'string' && capture.buildId.length > 0, `${label}: action ${action} build ID missing`);
      check(capture.backend === 'webgpu', `${label}: action ${action} backend must be webgpu`);
      check(Number.isInteger(capture.seed), `${label}: action ${action} seed missing`);
    }
  }

  const allowed = new Set((entry?.allowedTransitions ?? []).map(item => `${item?.from}->${item?.to}`));
  check(!allowed.has('sprint->ads-in') && !allowed.has('ads-in->sprint'), `${label}: sprint/ADS forbidden transition present`);
  check(finite(entry?.budgets?.lod0Triangles, 1, 250000), `${label}: triangle budget invalid`);
  check(finite(entry?.budgets?.draws, 1, 64), `${label}: draw budget invalid`);
  check(finite(entry?.budgets?.decodedTextureBytes, 1, 536870912), `${label}: texture budget invalid`);
  check(entry?.genericFallbackAllowed === false, `${label}: generic release fallback must be false`);
}

if (failures.length) {
  console.error(`FAIL viewmodel-assets ${path.basename(input)} ${failures.length}`);
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS viewmodel-assets ${path.basename(input)} presentations=${entries.length}`);
