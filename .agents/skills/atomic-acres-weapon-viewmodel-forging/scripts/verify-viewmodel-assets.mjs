#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTION_ENUM = Object.freeze(['equip', 'unequip', 'idle', 'idle-variant', 'walk', 'sprint', 'ads-in', 'ads-out', 'fire', 'dry-fire', 'reload', 'empty-reload', 'melee', 'inspect', 'pump', 'bolt', 'spin-up', 'spin-down', 'grenade-prime', 'grenade-hold', 'grenade-throw', 'grenade-cancel']);
const SOCKET_ENUM = Object.freeze(['rightGrip', 'leftGrip', 'magazine', 'muzzle', 'eject', 'optic', 'flashlight', 'bolt', 'pump', 'knife', 'grenade']);
const CAPABILITY_ENUM = Object.freeze(['standard-firearm', 'automatic', 'detachable-magazine', 'casing-ejection', 'optic', 'melee', 'pump-action', 'bolt-action', 'spin-drive', 'grenade-handler']);
const WEAPON_ORACLE = Object.freeze({
  'a4-vanguard': Object.freeze({
    presentationId: 'a4-vanguard-view',
    skeletonId: 'aa-first-person-v1',
    capabilities: Object.freeze(['standard-firearm', 'automatic', 'detachable-magazine', 'casing-ejection', 'optic', 'melee']),
    actions: Object.freeze(['equip', 'unequip', 'idle', 'idle-variant', 'walk', 'sprint', 'ads-in', 'ads-out', 'fire', 'dry-fire', 'reload', 'empty-reload', 'melee', 'inspect']),
    sockets: Object.freeze(['rightGrip', 'leftGrip', 'knife', 'muzzle', 'optic', 'magazine', 'eject']),
    semanticParts: Object.freeze(['arms', 'hands', 'weapon', 'magazine', 'muzzle', 'eject']),
    semanticNodes: Object.freeze({ arms: 'Arms', hands: 'Hands', weapon: 'A4Vanguard', magazine: 'Magazine', muzzle: 'MuzzleDevice', eject: 'EjectionPort' }),
    socketNodes: Object.freeze({ rightGrip: 'SocketRightGrip', leftGrip: 'SocketLeftGrip', knife: 'SocketKnife', muzzle: 'SocketMuzzle', optic: 'SocketOptic', magazine: 'SocketMagazine', eject: 'SocketEject' }),
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
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024;
const sha40 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && !/^0{64}$/.test(value);
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
const socketOk = value => typeof value === 'string' && SOCKET_ENUM.includes(value);
const nodeNameOk = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,79}$/.test(value);
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const uint = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const exactArray = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
const safeArtifactPath = value => typeof value === 'string' && value.length >= 3 && value.length <= 240
  && !path.isAbsolute(value) && !value.includes('\\') && !value.split('/').includes('..')
  && /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(value);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

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

function containedBy(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validateFileEvidence(relativePath, expectedDigest, artifactRoot, maxBytes, label, failures) {
  if (!safeArtifactPath(relativePath)) {
    failures.push(`${label} path invalid`);
    return;
  }
  if (!sha256(expectedDigest)) {
    failures.push(`${label} digest invalid`);
    return;
  }
  if (typeof artifactRoot !== 'string' || artifactRoot.length === 0) {
    failures.push(`${label} artifact root missing`);
    return;
  }
  let realRoot;
  try {
    realRoot = fs.realpathSync(path.resolve(artifactRoot));
  } catch {
    failures.push(`${label} artifact root unreadable`);
    return;
  }
  const candidate = path.resolve(realRoot, relativePath);
  if (!containedBy(realRoot, candidate)) {
    failures.push(`${label} escapes artifact root`);
    return;
  }
  let realFile;
  try {
    realFile = fs.realpathSync(candidate);
  } catch {
    failures.push(`${label} file missing`);
    return;
  }
  if (!containedBy(realRoot, realFile)) {
    failures.push(`${label} resolves outside artifact root`);
    return;
  }
  let stat;
  try {
    stat = fs.statSync(realFile);
  } catch {
    failures.push(`${label} file unreadable`);
    return;
  }
  if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) {
    failures.push(`${label} file size/type invalid`);
    return;
  }
  let bytes;
  try {
    bytes = fs.readFileSync(realFile);
  } catch {
    failures.push(`${label} file unreadable`);
    return;
  }
  const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualDigest !== expectedDigest) {
    failures.push(`${label} digest mismatch`);
    return;
  }
  return bytes;
}

function validateJsonPayloadMetadata(bytes, expectedMetadata, label, failures) {
  let document;
  try {
    document = JSON.parse(bytes.toString('utf8'));
  } catch {
    failures.push(`${label} payload must be JSON`);
    return;
  }
  if (!plainObject(document) || !plainObject(document.metadata) || canonical(document.metadata) !== canonical(expectedMetadata)) {
    failures.push(`${label} payload metadata differs from parent identity`);
  }
}

function validateCaptureArtifact(value, label, artifactRoot, expectedMetadata, failures) {
  if (!exactKeys(value, ['path', 'sha256'], ['path', 'sha256'], label, failures)) return;
  const bytes = validateFileEvidence(value.path, value.sha256, artifactRoot, MAX_CAPTURE_BYTES, label, failures);
  if (!bytes) return;
  const matches = [...bytes.toString('utf8').matchAll(/<metadata id="pass65-capture">([\s\S]*?)<\/metadata>/g)];
  if (matches.length !== 1) {
    failures.push(`${label} requires one machine-readable capture metadata block`);
    return;
  }
  let metadata;
  try {
    metadata = JSON.parse(matches[0][1]);
  } catch {
    failures.push(`${label} capture metadata must be JSON`);
    return;
  }
  if (!plainObject(metadata) || canonical(metadata) !== canonical(expectedMetadata)) failures.push(`${label} capture metadata differs from parent identity`);
}

function validateAsset(asset, label, artifactRoot, identity, failures) {
  const keys = ['level', 'url', 'sha256', 'source', 'license', 'derivativeNotes', 'triangles', 'draws', 'decodedTextureBytes', 'sharedAssetApprovalId'];
  if (!exactKeys(asset, keys, keys, label, failures)) return;
  if (!uint(asset.level, 0, 8)) failures.push(`${label} identity invalid`);
  const bytes = validateFileEvidence(asset.url, asset.sha256, artifactRoot, MAX_ASSET_BYTES, label, failures);
  if (bytes) validateJsonPayloadMetadata(bytes, {
    schemaVersion: identity.schemaVersion,
    kind: 'viewmodel-lod',
    presentationId: identity.presentationId,
    weaponId: identity.weaponId,
    collection: identity.collection,
    level: asset.level,
    triangles: asset.triangles,
    draws: asset.draws,
    decodedTextureBytes: asset.decodedTextureBytes,
  }, label, failures);
  if (typeof asset.source !== 'string' || asset.source.trim().length === 0 || asset.source.length > 500 || typeof asset.license !== 'string' || asset.license.trim().length === 0 || asset.license.length > 200 || typeof asset.derivativeNotes !== 'string' || asset.derivativeNotes.trim().length === 0 || asset.derivativeNotes.length > 500) failures.push(`${label} provenance invalid`);
  if (!uint(asset.triangles, 1, 250000) || !uint(asset.draws, 1, 64) || !uint(asset.decodedTextureBytes, 1, 536870912)) failures.push(`${label} measured budget fields invalid`);
  if (asset.sharedAssetApprovalId !== null && !/^approval-[a-z0-9-]{3,64}$/.test(asset.sharedAssetApprovalId)) failures.push(`${label} shared asset approval invalid`);
}

export function validateViewmodelManifest(manifest, artifactRoot) {
  const failures = [];
  const rootKeys = ['schemaVersion', 'captureIdentity', 'presentations'];
  if (!exactKeys(manifest, rootKeys, rootKeys, 'manifest', failures)) return failures;
  if (manifest.schemaVersion !== 3) failures.push('schemaVersion must equal 3');

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

    const skeletonKeys = ['id', 'url', 'sha256', 'source', 'license', 'derivativeNotes', 'boneCount'];
    if (exactKeys(entry.skeleton, skeletonKeys, skeletonKeys, `${label}.skeleton`, failures)) {
      if (!idOk(entry.skeleton.id) || entry.skeleton.id !== oracle?.skeletonId || typeof entry.skeleton.source !== 'string' || entry.skeleton.source.trim().length === 0 || entry.skeleton.source.length > 500 || typeof entry.skeleton.license !== 'string' || entry.skeleton.license.trim().length === 0 || entry.skeleton.license.length > 200 || typeof entry.skeleton.derivativeNotes !== 'string' || entry.skeleton.derivativeNotes.trim().length === 0 || entry.skeleton.derivativeNotes.length > 500 || !uint(entry.skeleton.boneCount, 1, 256)) failures.push(`${label} skeleton invalid`);
      const skeletonBytes = validateFileEvidence(entry.skeleton.url, entry.skeleton.sha256, artifactRoot, MAX_ASSET_BYTES, `${label}.skeleton`, failures);
      if (skeletonBytes && oracle) validateJsonPayloadMetadata(skeletonBytes, {
        schemaVersion: manifest.schemaVersion,
        kind: 'viewmodel-skeleton',
        presentationId: entry.id,
        weaponId: entry.weaponId,
        skeletonId: entry.skeleton.id,
        boneCount: entry.skeleton.boneCount,
        semanticNodes: oracle.semanticNodes,
        socketNodes: oracle.socketNodes,
      }, `${label}.skeleton`, failures);
    }
    const accessibilityKeys = ['motionScaleMin', 'motionScaleMax', 'adsMotionScaleMax'];
    if (exactKeys(entry.accessibility, accessibilityKeys, accessibilityKeys, `${label}.accessibility`, failures)) {
      if (!finite(entry.accessibility.motionScaleMin, 0, 1) || !finite(entry.accessibility.motionScaleMax, entry.accessibility.motionScaleMin, 1) || !finite(entry.accessibility.adsMotionScaleMax, entry.accessibility.motionScaleMin, entry.accessibility.motionScaleMax)) failures.push(`${label} accessibility motion bounds invalid`);
    }

    for (const [collectionName, collection] of [['firstPersonLods', entry.firstPersonLods], ['worldLods', entry.worldLods]]) {
      const lods = Array.isArray(collection) ? collection : [];
      if (lods.length < 2) failures.push(`${label}.${collectionName} requires at least two LODs`);
      for (const [lodIndex, asset] of lods.entries()) {
        validateAsset(asset, `${label}.${collectionName}[${lodIndex}]`, artifactRoot, {
          schemaVersion: manifest.schemaVersion,
          presentationId: entry.id,
          weaponId: entry.weaponId,
          collection: collectionName === 'firstPersonLods' ? 'first-person' : 'world',
        }, failures);
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
      if (!idOk(part.id) || !nodeNameOk(part.nodeName)) failures.push(`${label}.semanticParts[${partIndex}] invalid`);
      if (oracle && part.nodeName !== oracle.semanticNodes[part.id]) failures.push(`${label}.semanticParts[${partIndex}] node mapping differs from independent oracle`);
    }
    const socketKeys = ['id', 'nodeName'];
    const sockets = Array.isArray(entry.sockets) ? entry.sockets : [];
    if (!oracle || !exactArray(sockets.map(socket => socket?.id), oracle.sockets)) failures.push(`${label} sockets differ from independent oracle`);
    for (const [socketIndex, socket] of sockets.entries()) {
      if (!exactKeys(socket, socketKeys, socketKeys, `${label}.sockets[${socketIndex}]`, failures)) continue;
      if (!socketOk(socket.id) || !nodeNameOk(socket.nodeName)) failures.push(`${label}.sockets[${socketIndex}] invalid`);
      if (oracle && socket.nodeName !== oracle.socketNodes[socket.id]) failures.push(`${label}.sockets[${socketIndex}] node mapping differs from independent oracle`);
    }
    const semanticNodeNames = semanticParts.map(part => part?.nodeName?.toLowerCase());
    const socketNodeNames = sockets.map(socket => socket?.nodeName?.toLowerCase());
    if (new Set(semanticNodeNames).size !== semanticNodeNames.length) failures.push(`${label} semantic node mappings must be unique`);
    if (new Set(socketNodeNames).size !== socketNodeNames.length) failures.push(`${label} socket node mappings must be unique`);
    if (semanticNodeNames.some(nodeName => socketNodeNames.includes(nodeName))) failures.push(`${label} semantic and socket node mappings must be disjoint`);

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
      validateCaptureArtifact(capture.artifact, `${captureLabel}.artifact`, artifactRoot, {
        schemaVersion: manifest.schemaVersion,
        kind: 'viewmodel-capture',
        presentationId: entry.id,
        weaponId: capture.weaponId,
        action: capture.action,
        clockTick: capture.clockTick,
        captureIdentity: manifest.captureIdentity,
      }, failures);
    }
    if (new Set(captures.map(capture => capture?.clockTick)).size !== captures.length) failures.push(`${label} capture ticks must be unique`);
    if (new Set(captures.map(capture => capture?.artifact?.path)).size !== captures.length || new Set(captures.map(capture => capture?.artifact?.sha256)).size !== captures.length) failures.push(`${label} every action requires an independent capture path and digest`);

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
  const fixturePath = fileURLToPath(new URL('./fixtures/known-good.json', import.meta.url));
  const fixtureRoot = path.dirname(fixturePath);
  const fixture = readJson(fixturePath);
  const baseline = validateViewmodelManifest(fixture, fixtureRoot);
  if (baseline.length) return { escaped: [`known-good fixture failed before mutations: ${baseline.join('; ')}`], total: 0 };
  const mutations = [
    ['64-hex Git SHA', value => { value.captureIdentity.sourceSha = 'a'.repeat(64); }],
    ['unknown nested key', value => { value.presentations[0].clips[0].selfAttested = true; }],
    ['candidate-authored capability omission', value => { value.presentations[0].capabilities.pop(); }],
    ['unknown action', value => { value.presentations[0].clips[0].action = 'dance'; }],
    ['missing action clip', value => { value.presentations[0].clips.pop(); }],
    ['missing semantic part', value => { value.presentations[0].semanticParts.pop(); }],
    ['missing socket', value => { value.presentations[0].sockets.pop(); }],
    ['duplicate semantic node mapping', value => { value.presentations[0].semanticParts[1].nodeName = value.presentations[0].semanticParts[0].nodeName; }],
    ['duplicate socket node mapping', value => { value.presentations[0].sockets[1].nodeName = value.presentations[0].sockets[0].nodeName; }],
    ['all semantic node mappings identical', value => { const nodeName = value.presentations[0].semanticParts[0].nodeName; for (const part of value.presentations[0].semanticParts) part.nodeName = nodeName; }],
    ['all socket node mappings identical', value => { const nodeName = value.presentations[0].sockets[0].nodeName; for (const socket of value.presentations[0].sockets) socket.nodeName = nodeName; }],
    ['semantic socket node collision', value => { value.presentations[0].sockets[0].nodeName = value.presentations[0].semanticParts[0].nodeName; }],
    ['extra transition', value => { value.presentations[0].allowedTransitions.push({ from: 'fire', to: 'reload' }); }],
    ['forbidden transition', value => { value.presentations[0].allowedTransitions[0] = { from: 'sprint', to: 'ads-in' }; }],
    ['capture weapon mismatch', value => { value.presentations[0].captures[0].weaponId = 'other-weapon'; }],
    ['capture digest missing', value => { value.presentations[0].captures[0].artifact.sha256 = 'bad'; }],
    ['capture artifact missing', value => { value.presentations[0].captures[0].artifact.path = 'fixture-payloads/viewmodel/captures/missing.svg'; }],
    ['capture artifact traversal', value => { value.presentations[0].captures[0].artifact.path = '../outside.svg'; }],
    ['capture digest drift', value => { value.presentations[0].captures[0].artifact.sha256 = 'e'.repeat(64); }],
    ['shared action capture artifact', value => { value.presentations[0].captures[1].artifact = structuredClone(value.presentations[0].captures[0].artifact); }],
    ['all actions share capture artifact', value => { const artifact = structuredClone(value.presentations[0].captures[0].artifact); for (const capture of value.presentations[0].captures) capture.artifact = structuredClone(artifact); }],
    ['skeleton identity drift', value => { value.presentations[0].skeleton.id = 'other-skeleton'; }],
    ['skeleton derivative notes missing', value => { delete value.presentations[0].skeleton.derivativeNotes; }],
    ['skeleton artifact missing', value => { value.presentations[0].skeleton.url = 'fixture-payloads/viewmodel/assets/missing.txt'; }],
    ['skeleton artifact traversal', value => { value.presentations[0].skeleton.url = '../outside.glb'; }],
    ['skeleton digest drift', value => { value.presentations[0].skeleton.sha256 = 'e'.repeat(64); }],
    ['LOD derivative notes missing', value => { delete value.presentations[0].firstPersonLods[0].derivativeNotes; }],
    ['LOD artifact missing', value => { value.presentations[0].firstPersonLods[0].url = 'fixture-payloads/viewmodel/assets/missing.txt'; }],
    ['LOD artifact traversal', value => { value.presentations[0].firstPersonLods[0].url = '../outside.glb'; }],
    ['LOD digest drift', value => { value.presentations[0].firstPersonLods[0].sha256 = 'e'.repeat(64); }],
    ['LOD ordering regression', value => { value.presentations[0].firstPersonLods[1].triangles = value.presentations[0].firstPersonLods[0].triangles; }],
    ['duplicate generic asset', value => { value.presentations[0].worldLods[0].url = value.presentations[0].firstPersonLods[0].url; }],
    ['missing fire marker', value => { value.presentations[0].clips.find(clip => clip.action === 'fire').markers = []; }],
    ['fallback enabled', value => { value.presentations[0].fallbackPolicy = 'allow-generic'; }],
  ];
  const fixturePresentation = fixture.presentations[0];
  for (let first = 0; first < fixturePresentation.captures.length; first += 1) {
    for (let second = first + 1; second < fixturePresentation.captures.length; second += 1) {
      mutations.push([`capture artifact permutation ${first}/${second}`, value => {
        const captures = value.presentations[0].captures;
        [captures[first].artifact, captures[second].artifact] = [captures[second].artifact, captures[first].artifact];
      }]);
    }
  }
  for (let first = 0; first < fixturePresentation.semanticParts.length; first += 1) {
    for (let second = first + 1; second < fixturePresentation.semanticParts.length; second += 1) {
      mutations.push([`semantic node permutation ${first}/${second}`, value => {
        const parts = value.presentations[0].semanticParts;
        [parts[first].nodeName, parts[second].nodeName] = [parts[second].nodeName, parts[first].nodeName];
      }]);
    }
  }
  for (let first = 0; first < fixturePresentation.sockets.length; first += 1) {
    for (let second = first + 1; second < fixturePresentation.sockets.length; second += 1) {
      mutations.push([`socket node permutation ${first}/${second}`, value => {
        const sockets = value.presentations[0].sockets;
        [sockets[first].nodeName, sockets[second].nodeName] = [sockets[second].nodeName, sockets[first].nodeName];
      }]);
    }
  }
  const lodLocations = [['firstPersonLods', 0], ['firstPersonLods', 1], ['worldLods', 0], ['worldLods', 1]];
  for (let first = 0; first < lodLocations.length; first += 1) {
    for (let second = first + 1; second < lodLocations.length; second += 1) {
      mutations.push([`LOD artifact permutation ${first}/${second}`, value => {
        const [firstCollection, firstIndex] = lodLocations[first];
        const [secondCollection, secondIndex] = lodLocations[second];
        const firstAsset = value.presentations[0][firstCollection][firstIndex];
        const secondAsset = value.presentations[0][secondCollection][secondIndex];
        [firstAsset.url, secondAsset.url] = [secondAsset.url, firstAsset.url];
        [firstAsset.sha256, secondAsset.sha256] = [secondAsset.sha256, firstAsset.sha256];
      }]);
    }
  }
  for (const [collection, index] of lodLocations) {
    mutations.push([`skeleton/${collection}[${index}] artifact substitution`, value => {
      const skeleton = value.presentations[0].skeleton;
      const asset = value.presentations[0][collection][index];
      [skeleton.url, asset.url] = [asset.url, skeleton.url];
      [skeleton.sha256, asset.sha256] = [asset.sha256, skeleton.sha256];
    }]);
  }
  const escaped = [];
  for (const [label, mutate] of mutations) {
    const candidate = structuredClone(fixture);
    mutate(candidate);
    if (validateViewmodelManifest(candidate, fixtureRoot).length === 0) escaped.push(label);
  }
  return { escaped, total: mutations.length };
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  const { escaped, total } = runSelfTest();
  if (escaped.length) {
    console.error(`FAIL viewmodel-assets self-test escaped=${escaped.length}`);
    for (const label of escaped) console.error(`- ${label}`);
    process.exit(1);
  }
  console.log(`PASS viewmodel-assets self-test mutations=${total}`);
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
const failures = validateViewmodelManifest(manifest, path.dirname(path.resolve(input)));
if (failures.length) {
  console.error(`FAIL viewmodel-assets ${path.basename(input)} ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS viewmodel-assets ${path.basename(input)} presentations=${manifest.presentations.length} actions=${WEAPON_ORACLE['a4-vanguard'].actions.length}`);
