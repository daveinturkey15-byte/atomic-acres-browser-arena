#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTION_ENUM = Object.freeze(['equip', 'unequip', 'idle', 'idle-variant', 'walk', 'sprint', 'ads-in', 'ads-out', 'fire', 'dry-fire', 'reload', 'empty-reload', 'melee', 'inspect', 'pump', 'bolt', 'spin-up', 'spin-down', 'grenade-prime', 'grenade-hold', 'grenade-throw', 'grenade-cancel']);
const SOCKET_ENUM = Object.freeze(['rightGrip', 'leftGrip', 'magazine', 'muzzle', 'eject', 'optic', 'flashlight', 'bolt', 'pump', 'knife', 'grenade']);
const CAPABILITY_ENUM = Object.freeze(['standard-firearm', 'automatic', 'detachable-magazine', 'casing-ejection', 'optic', 'melee', 'pump-action', 'bolt-action', 'spin-drive', 'grenade-handler']);
const WEAPON_ORACLE = Object.freeze({
  'a4-vanguard': Object.freeze({
    presentationId: 'a4-vanguard-view',
    capabilities: Object.freeze(['standard-firearm', 'automatic', 'detachable-magazine', 'casing-ejection', 'optic', 'melee']),
    actions: Object.freeze(['equip', 'unequip', 'idle', 'idle-variant', 'walk', 'sprint', 'ads-in', 'ads-out', 'fire', 'dry-fire', 'reload', 'empty-reload', 'melee', 'inspect']),
    sockets: Object.freeze(['rightGrip', 'leftGrip', 'knife', 'muzzle', 'optic', 'magazine', 'eject']),
    semanticParts: Object.freeze(['arms', 'hands', 'weapon', 'magazine', 'muzzle', 'eject']),
  }),
});
const TRANSITION_ORACLE = Object.freeze([
  ['equip', 'idle'], ['idle', 'idle-variant'], ['idle-variant', 'idle'], ['idle', 'walk'], ['walk', 'idle'],
  ['idle', 'sprint'], ['sprint', 'idle'], ['idle', 'ads-in'], ['ads-in', 'ads-out'], ['ads-out', 'idle'],
  ['idle', 'fire'], ['fire', 'idle'], ['idle', 'dry-fire'], ['dry-fire', 'idle'], ['idle', 'reload'],
  ['reload', 'idle'], ['idle', 'empty-reload'], ['empty-reload', 'idle'], ['idle', 'melee'], ['melee', 'idle'],
  ['idle', 'inspect'], ['inspect', 'idle'], ['idle', 'unequip'],
]);
const MARKER_ORACLE = Object.freeze({
  fire: Object.freeze(['muzzle']),
  reload: Object.freeze(['magazine-out', 'magazine-in']),
  'empty-reload': Object.freeze(['magazine-out', 'magazine-in', 'bolt-release']),
});
const sha40 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && !/^0{64}$/.test(value);
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
const socketOk = value => typeof value === 'string' && SOCKET_ENUM.includes(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const uint = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactArray = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
const safeArtifactPath = value => typeof value === 'string' && value.length >= 3 && value.length <= 240
  && !path.isAbsolute(value) && !value.includes('\\') && !value.split('/').includes('..')
  && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value);

function exactKeys(value, required, allowed, label, failures) {
  if (!plainObject(value)) {
    failures.push(`${label} must be a plain object`);
    return false;
  }
  const keys = Object.keys(value);
  for (const key of required) if (!keys.includes(key)) failures.push(`${label} missing key ${key}`);
  for (const key of keys) if (!allowed.includes(key)) failures.push(`${label} unknown key ${key}`);
  return true;
}

function validateArtifact(value, label, failures) {
  if (!exactKeys(value, ['path', 'sha256'], ['path', 'sha256'], label, failures)) return;
  if (!safeArtifactPath(value.path)) failures.push(`${label} path invalid`);
  if (!sha256(value.sha256)) failures.push(`${label} digest invalid`);
}

function validateAsset(asset, label, failures) {
  const keys = ['level', 'url', 'sha256', 'source', 'license', 'triangles', 'draws', 'decodedTextureBytes', 'sharedAssetApprovalId'];
  if (!exactKeys(asset, keys, keys, label, failures)) return;
  if (!uint(asset.level, 0, 8) || !safeArtifactPath(asset.url) || !sha256(asset.sha256)) failures.push(`${label} identity invalid`);
  if (typeof asset.source !== 'string' || asset.source.trim().length === 0 || typeof asset.license !== 'string' || asset.license.trim().length === 0) failures.push(`${label} provenance invalid`);
  if (!uint(asset.triangles, 1, 250000) || !uint(asset.draws, 1, 64) || !uint(asset.decodedTextureBytes, 1, 536870912)) failures.push(`${label} measured budget fields invalid`);
  if (asset.sharedAssetApprovalId !== null && !/^approval-[a-z0-9-]{3,64}$/.test(asset.sharedAssetApprovalId)) failures.push(`${label} shared asset approval invalid`);
}

export function validateViewmodelManifest(manifest) {
  const failures = [];
  const rootKeys = ['schemaVersion', 'captureIdentity', 'presentations'];
  if (!exactKeys(manifest, rootKeys, rootKeys, 'manifest', failures)) return failures;
  if (manifest.schemaVersion !== 2) failures.push('schemaVersion must equal 2');

  const identityKeys = ['sourceSha', 'buildId', 'backend', 'profile', 'viewport', 'clock', 'seed'];
  if (exactKeys(manifest.captureIdentity, identityKeys, identityKeys, 'captureIdentity', failures)) {
    if (!sha40(manifest.captureIdentity.sourceSha)) failures.push('capture sourceSha must be an exact 40-hex Git SHA');
    if (!idOk(manifest.captureIdentity.buildId)) failures.push('capture buildId invalid');
    if (manifest.captureIdentity.backend !== 'webgpu') failures.push('capture backend must equal webgpu');
    if (!['performance', 'high', 'max'].includes(manifest.captureIdentity.profile)) failures.push('capture profile invalid');
    if (exactKeys(manifest.captureIdentity.viewport, ['width', 'height', 'dpr'], ['width', 'height', 'dpr'], 'captureIdentity.viewport', failures)) {
      if (!uint(manifest.captureIdentity.viewport.width, 320, 7680) || !uint(manifest.captureIdentity.viewport.height, 200, 4320) || !finite(manifest.captureIdentity.viewport.dpr, 0.5, 4)) failures.push('capture viewport invalid');
    }
    if (exactKeys(manifest.captureIdentity.clock, ['kind', 'originMs', 'stepMs'], ['kind', 'originMs', 'stepMs'], 'captureIdentity.clock', failures)) {
      if (manifest.captureIdentity.clock.kind !== 'fixed-step' || !finite(manifest.captureIdentity.clock.originMs, 0, 86400000) || !finite(manifest.captureIdentity.clock.stepMs, 1, 10000)) failures.push('capture clock invalid');
    }
    if (!uint(manifest.captureIdentity.seed, 0, 0xffffffff)) failures.push('capture seed invalid');
  }

  const entries = Array.isArray(manifest.presentations) ? manifest.presentations : [];
  if (!exactArray(entries.map(entry => entry?.weaponId), Object.keys(WEAPON_ORACLE))) failures.push('presentation weapon set must exactly equal the independent weapon capability oracle');
  if (new Set(entries.map(entry => entry?.id)).size !== entries.length) failures.push('presentation IDs must be unique');
  const allAssets = [];
  const presentationKeys = ['id', 'weaponId', 'capabilities', 'skeleton', 'materialPath', 'cameraRaySource', 'animationMarkerRole', 'accessibility', 'firstPersonLods', 'worldLods', 'semanticParts', 'sockets', 'clips', 'allowedTransitions', 'captures', 'budgets', 'fallbackPolicy'];
  for (const [index, entry] of entries.entries()) {
    const label = `presentations[${index}]`;
    if (!exactKeys(entry, presentationKeys, presentationKeys, label, failures)) continue;
    const oracle = WEAPON_ORACLE[entry.weaponId];
    if (!oracle || entry.id !== oracle.presentationId) failures.push(`${label} weapon/presentation identity differs from oracle`);
    if (!oracle || !exactArray(entry.capabilities, oracle.capabilities) || !entry.capabilities.every(capability => CAPABILITY_ENUM.includes(capability))) failures.push(`${label} capabilities differ from independent oracle`);
    if (entry.materialPath !== 'tsl' || entry.cameraRaySource !== 'camera-center' || entry.animationMarkerRole !== 'presentation-only') failures.push(`${label} renderer or authority boundary invalid`);
    if (entry.fallbackPolicy !== 'forbid-release') failures.push(`${label} fallback policy invalid`);

    const skeletonKeys = ['id', 'url', 'sha256', 'source', 'license', 'boneCount'];
    if (exactKeys(entry.skeleton, skeletonKeys, skeletonKeys, `${label}.skeleton`, failures)) {
      if (!idOk(entry.skeleton.id) || !safeArtifactPath(entry.skeleton.url) || !sha256(entry.skeleton.sha256) || typeof entry.skeleton.source !== 'string' || entry.skeleton.source.trim().length === 0 || typeof entry.skeleton.license !== 'string' || entry.skeleton.license.trim().length === 0 || !uint(entry.skeleton.boneCount, 1, 256)) failures.push(`${label} skeleton invalid`);
    }
    const accessibilityKeys = ['motionScaleMin', 'motionScaleMax', 'adsMotionScaleMax'];
    if (exactKeys(entry.accessibility, accessibilityKeys, accessibilityKeys, `${label}.accessibility`, failures)) {
      if (!finite(entry.accessibility.motionScaleMin, 0, 1) || !finite(entry.accessibility.motionScaleMax, entry.accessibility.motionScaleMin, 1) || !finite(entry.accessibility.adsMotionScaleMax, entry.accessibility.motionScaleMin, entry.accessibility.motionScaleMax)) failures.push(`${label} accessibility motion bounds invalid`);
    }

    for (const [collectionName, collection] of [['firstPersonLods', entry.firstPersonLods], ['worldLods', entry.worldLods]]) {
      const lods = Array.isArray(collection) ? collection : [];
      if (lods.length < 2) failures.push(`${label}.${collectionName} requires at least two LODs`);
      for (const [lodIndex, asset] of lods.entries()) {
        validateAsset(asset, `${label}.${collectionName}[${lodIndex}]`, failures);
        if (asset?.level !== lodIndex) failures.push(`${label}.${collectionName} LOD levels must be ordered from zero`);
        if (lodIndex > 0) {
          const previous = lods[lodIndex - 1];
          if (asset?.triangles >= previous?.triangles || asset?.draws > previous?.draws || asset?.decodedTextureBytes > previous?.decodedTextureBytes) failures.push(`${label}.${collectionName} LOD budgets must monotonically decrease`);
        }
        allAssets.push({ weaponId: entry.weaponId, ...asset });
      }
    }
    const ownAssets = [...(entry.firstPersonLods ?? []), ...(entry.worldLods ?? [])];
    if (new Set(ownAssets.map(asset => asset?.url)).size !== ownAssets.length || new Set(ownAssets.map(asset => asset?.sha256)).size !== ownAssets.length) failures.push(`${label} LOD assets/digests must be unique`);

    const semanticKeys = ['id', 'nodeName'];
    const semanticParts = Array.isArray(entry.semanticParts) ? entry.semanticParts : [];
    if (!oracle || !exactArray(semanticParts.map(part => part?.id), oracle.semanticParts)) failures.push(`${label} semantic parts differ from independent oracle`);
    for (const [partIndex, part] of semanticParts.entries()) {
      if (!exactKeys(part, semanticKeys, semanticKeys, `${label}.semanticParts[${partIndex}]`, failures)) continue;
      if (!idOk(part.id) || typeof part.nodeName !== 'string' || part.nodeName.trim().length === 0) failures.push(`${label}.semanticParts[${partIndex}] invalid`);
    }
    const socketKeys = ['id', 'nodeName'];
    const sockets = Array.isArray(entry.sockets) ? entry.sockets : [];
    if (!oracle || !exactArray(sockets.map(socket => socket?.id), oracle.sockets)) failures.push(`${label} sockets differ from independent oracle`);
    for (const [socketIndex, socket] of sockets.entries()) {
      if (!exactKeys(socket, socketKeys, socketKeys, `${label}.sockets[${socketIndex}]`, failures)) continue;
      if (!socketOk(socket.id) || typeof socket.nodeName !== 'string' || socket.nodeName.trim().length === 0) failures.push(`${label}.sockets[${socketIndex}] invalid`);
    }

    const clips = Array.isArray(entry.clips) ? entry.clips : [];
    if (!oracle || !exactArray(clips.map(clip => clip?.action), oracle.actions)) failures.push(`${label} clip actions differ from independent action oracle`);
    const clipKeys = ['action', 'clipName', 'normalizedDuration', 'additive', 'priority', 'markers'];
    const markerKeys = ['id', 'normalizedTime'];
    for (const [clipIndex, clip] of clips.entries()) {
      const clipLabel = `${label}.clips[${clipIndex}]`;
      if (!exactKeys(clip, clipKeys, clipKeys, clipLabel, failures)) continue;
      if (!ACTION_ENUM.includes(clip.action) || !idOk(clip.clipName) || !finite(clip.normalizedDuration, 0.01, 10) || typeof clip.additive !== 'boolean' || !uint(clip.priority, 0, 255)) failures.push(`${clipLabel} invalid`);
      const markers = Array.isArray(clip.markers) ? clip.markers : [];
      const expectedMarkers = MARKER_ORACLE[clip.action] ?? [];
      if (!exactArray(markers.map(marker => marker?.id), expectedMarkers)) failures.push(`${clipLabel} markers differ from action oracle`);
      for (const [markerIndex, marker] of markers.entries()) {
        if (!exactKeys(marker, markerKeys, markerKeys, `${clipLabel}.markers[${markerIndex}]`, failures)) continue;
        if (!idOk(marker.id) || !finite(marker.normalizedTime, 0, 1)) failures.push(`${clipLabel}.markers[${markerIndex}] invalid`);
      }
    }

    const transitions = Array.isArray(entry.allowedTransitions) ? entry.allowedTransitions : [];
    const transitionPairs = transitions.map(transition => [transition?.from, transition?.to]);
    if (!exactArray(transitionPairs.map(pair => pair.join('->')), TRANSITION_ORACLE.map(pair => pair.join('->')))) failures.push(`${label} transitions differ from independent transition oracle`);
    for (const [transitionIndex, transition] of transitions.entries()) {
      if (!exactKeys(transition, ['from', 'to'], ['from', 'to'], `${label}.allowedTransitions[${transitionIndex}]`, failures)) continue;
      if (!ACTION_ENUM.includes(transition.from) || !ACTION_ENUM.includes(transition.to)) failures.push(`${label}.allowedTransitions[${transitionIndex}] action invalid`);
    }
    if (transitionPairs.some(([from, to]) => (from === 'sprint' && to === 'ads-in') || (from === 'ads-in' && to === 'sprint'))) failures.push(`${label} forbidden sprint/ADS transition present`);

    const captures = Array.isArray(entry.captures) ? entry.captures : [];
    if (!oracle || !exactArray(captures.map(capture => capture?.action), oracle.actions)) failures.push(`${label} captures differ from independent action oracle`);
    const captureKeys = ['weaponId', 'action', 'clockTick', 'artifact'];
    for (const [captureIndex, capture] of captures.entries()) {
      const captureLabel = `${label}.captures[${captureIndex}]`;
      if (!exactKeys(capture, captureKeys, captureKeys, captureLabel, failures)) continue;
      if (capture.weaponId !== entry.weaponId || !ACTION_ENUM.includes(capture.action) || capture.action !== oracle?.actions[captureIndex] || !uint(capture.clockTick, 0, 1000000)) failures.push(`${captureLabel} weapon/action/tick invalid`);
      validateArtifact(capture.artifact, `${captureLabel}.artifact`, failures);
    }
    if (new Set(captures.map(capture => capture?.clockTick)).size !== captures.length) failures.push(`${label} capture ticks must be unique`);

    const budgetKeys = ['lod0Triangles', 'draws', 'decodedTextureBytes', 'skeletonBones', 'maxSocketErrorMm', 'maxGripErrorMm'];
    if (exactKeys(entry.budgets, budgetKeys, budgetKeys, `${label}.budgets`, failures)) {
      if (!uint(entry.budgets.lod0Triangles, 1, 250000) || !uint(entry.budgets.draws, 1, 64) || !uint(entry.budgets.decodedTextureBytes, 1, 536870912) || !uint(entry.budgets.skeletonBones, 1, 256) || !finite(entry.budgets.maxSocketErrorMm, 0, 100) || !finite(entry.budgets.maxGripErrorMm, 0, 100)) failures.push(`${label} budgets invalid`);
      if ((entry.firstPersonLods?.[0]?.triangles ?? Infinity) > entry.budgets.lod0Triangles || (entry.worldLods?.[0]?.triangles ?? Infinity) > entry.budgets.lod0Triangles || ownAssets.some(asset => asset.draws > entry.budgets.draws || asset.decodedTextureBytes > entry.budgets.decodedTextureBytes) || (entry.skeleton?.boneCount ?? Infinity) > entry.budgets.skeletonBones) failures.push(`${label} measured asset exceeds budget`);
    }
  }

  const byIdentity = new Map();
  for (const asset of allAssets) {
    for (const identity of [asset.url, asset.sha256]) {
      const group = byIdentity.get(identity) ?? [];
      group.push(asset);
      byIdentity.set(identity, group);
    }
  }
  for (const [identity, assets] of byIdentity) {
    const weaponIds = new Set(assets.map(asset => asset.weaponId));
    if (weaponIds.size > 1) {
      const approvals = new Set(assets.map(asset => asset.sharedAssetApprovalId));
      if (approvals.size !== 1 || approvals.has(null)) failures.push(`generic cross-weapon asset sharing lacks one explicit approval: ${identity}`);
    }
  }
  return [...new Set(failures)].sort();
}

function readJson(input) { return JSON.parse(fs.readFileSync(input, 'utf8')); }

function runSelfTest() {
  const fixture = readJson(fileURLToPath(new URL('./fixtures/known-good.json', import.meta.url)));
  const baseline = validateViewmodelManifest(fixture);
  if (baseline.length) return [`known-good fixture failed before mutations: ${baseline.join('; ')}`];
  const mutations = [
    ['64-hex Git SHA', value => { value.captureIdentity.sourceSha = 'a'.repeat(64); }],
    ['unknown nested key', value => { value.presentations[0].clips[0].selfAttested = true; }],
    ['candidate-authored capability omission', value => { value.presentations[0].capabilities.pop(); }],
    ['unknown action', value => { value.presentations[0].clips[0].action = 'dance'; }],
    ['missing action clip', value => { value.presentations[0].clips.pop(); }],
    ['missing semantic part', value => { value.presentations[0].semanticParts.pop(); }],
    ['missing socket', value => { value.presentations[0].sockets.pop(); }],
    ['extra transition', value => { value.presentations[0].allowedTransitions.push({ from: 'fire', to: 'reload' }); }],
    ['forbidden transition', value => { value.presentations[0].allowedTransitions[0] = { from: 'sprint', to: 'ads-in' }; }],
    ['capture weapon mismatch', value => { value.presentations[0].captures[0].weaponId = 'other-weapon'; }],
    ['capture digest missing', value => { value.presentations[0].captures[0].artifact.sha256 = 'bad'; }],
    ['LOD ordering regression', value => { value.presentations[0].firstPersonLods[1].triangles = value.presentations[0].firstPersonLods[0].triangles; }],
    ['duplicate generic asset', value => { value.presentations[0].worldLods[0].url = value.presentations[0].firstPersonLods[0].url; }],
    ['missing fire marker', value => { value.presentations[0].clips.find(clip => clip.action === 'fire').markers = []; }],
    ['fallback enabled', value => { value.presentations[0].fallbackPolicy = 'allow-generic'; }],
  ];
  const escaped = [];
  for (const [label, mutate] of mutations) {
    const candidate = structuredClone(fixture);
    mutate(candidate);
    if (validateViewmodelManifest(candidate).length === 0) escaped.push(label);
  }
  return escaped;
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  const escaped = runSelfTest();
  if (escaped.length) {
    console.error(`FAIL viewmodel-assets self-test escaped=${escaped.length}`);
    for (const label of escaped) console.error(`- ${label}`);
    process.exit(1);
  }
  console.log('PASS viewmodel-assets self-test mutations=15');
  process.exit(0);
}
const input = args[0];
if (!input) {
  console.error('usage: node verify-viewmodel-assets.mjs <viewmodel-manifest.json> | --self-test');
  process.exit(2);
}
let manifest;
try {
  manifest = readJson(input);
} catch (error) {
  console.error(`FAIL viewmodel-assets unreadable-json ${error.message}`);
  process.exit(2);
}
const failures = validateViewmodelManifest(manifest);
if (failures.length) {
  console.error(`FAIL viewmodel-assets ${path.basename(input)} ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS viewmodel-assets ${path.basename(input)} presentations=${manifest.presentations.length} actions=${WEAPON_ORACLE['a4-vanguard'].actions.length}`);
