#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUS_ORACLE = Object.freeze(['master', 'sfx', 'movement', 'ui', 'announcements', 'ambience', 'menu-music', 'game-music']);
const FAMILY_ORACLE = Object.freeze(['weapon-report', 'weapon-foley', 'combat-feedback', 'world-impact', 'movement', 'player-state', 'ordnance', 'support', 'pickup-interaction', 'interactive-world', 'arena-ambience', 'ui', 'announcements', 'music']);
const ARENA_ORACLE = Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range']);
const EVENT_ORACLE = Object.freeze([
  ['weapon.report.world', 'weapon-report', 'sfx', 'world-spatial', 'weapon-world'],
  ['weapon.extended-foley', 'weapon-foley', 'sfx', 'listener-local', null],
  ['combat.hit-confirm', 'combat-feedback', 'ui', 'listener-local', null],
  ['world.projectile-impact', 'world-impact', 'sfx', 'world-spatial', 'impact-world'],
  ['movement.footstep.world', 'movement', 'movement', 'world-spatial', 'footstep-world'],
  ['player.low-health-breathing', 'player-state', 'sfx', 'listener-local', null],
  ['ordnance.frag-explosion', 'ordnance', 'sfx', 'world-spatial', 'explosion-world'],
  ['support.drone-rotor', 'support', 'sfx', 'world-spatial', 'support-air'],
  ['interaction.weapon-pickup', 'pickup-interaction', 'ui', 'listener-local', null],
  ['shed.door-motion', 'interactive-world', 'sfx', 'world-spatial', 'world-object'],
  ['shed.debris-impact', 'interactive-world', 'sfx', 'world-spatial', 'world-object'],
  ['ambience.arena-bed', 'arena-ambience', 'ambience', 'world-spatial', 'ambience-wide'],
  ['ui.feedback', 'ui', 'ui', 'listener-local', null],
  ['announcement.match', 'announcements', 'announcements', 'global-nonspatial', null],
  ['music.menu', 'music', 'menu-music', 'listener-local', null],
  ['music.game', 'music', 'game-music', 'listener-local', null],
]);
const EVENT_IDS = EVENT_ORACLE.map(([id]) => id);
const SPATIAL_EVENT_IDS = EVENT_ORACLE.filter(([, , , delivery]) => delivery === 'world-spatial').map(([id]) => id);
const LIFECYCLE_ORACLE = Object.freeze(['arena-switch', 'rematch', 'suspend-resume']);
const PROFILE_IDS = Object.freeze(['weapon-world', 'impact-world', 'footstep-world', 'explosion-world', 'support-air', 'world-object', 'ambience-wide']);
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;
const MAX_VARIANT_BYTES = 64 * 1024 * 1024;
const sha256 = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && !/^0{64}$/.test(value);
const idOk = value => typeof value === 'string' && /^[a-z0-9][a-z0-9.-]{0,79}$/.test(value);
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

function containedBy(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative.length > 0 && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function validateFileEvidence(relativePath, expectedDigest, artifactRoot, maxBytes, label, failures) {
  if (!safeArtifactPath(relativePath)) {
    failures.push(`${label} path invalid`);
    return null;
  }
  if (!sha256(expectedDigest)) {
    failures.push(`${label} digest invalid`);
    return null;
  }
  if (typeof artifactRoot !== 'string' || artifactRoot.length === 0) {
    failures.push(`${label} artifact root missing`);
    return null;
  }
  let realRoot;
  try {
    realRoot = fs.realpathSync(path.resolve(artifactRoot));
  } catch {
    failures.push(`${label} artifact root unreadable`);
    return null;
  }
  const candidate = path.resolve(realRoot, relativePath);
  if (!containedBy(realRoot, candidate)) {
    failures.push(`${label} escapes artifact root`);
    return null;
  }
  let realFile;
  try {
    realFile = fs.realpathSync(candidate);
  } catch {
    failures.push(`${label} file missing`);
    return null;
  }
  if (!containedBy(realRoot, realFile)) {
    failures.push(`${label} resolves outside artifact root`);
    return null;
  }
  let stat;
  try {
    stat = fs.statSync(realFile);
  } catch {
    failures.push(`${label} file unreadable`);
    return null;
  }
  if (!stat.isFile() || stat.size < 1 || stat.size > maxBytes) {
    failures.push(`${label} file size/type invalid`);
    return null;
  }
  let bytes;
  try {
    bytes = fs.readFileSync(realFile);
  } catch {
    failures.push(`${label} file unreadable`);
    return null;
  }
  const actualDigest = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actualDigest !== expectedDigest) {
    failures.push(`${label} digest mismatch`);
    return null;
  }
  return bytes;
}

function validateSemanticMetadata(bytes, expected, label, failures) {
  if (!Buffer.isBuffer(bytes)) return;
  let source;
  let metadata;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    metadata = JSON.parse(source);
  } catch {
    failures.push(`${label} metadata must be valid UTF-8 JSON`);
    return;
  }
  const expectedKeys = Object.keys(expected);
  if (!exactKeys(metadata, expectedKeys, expectedKeys, `${label} metadata`, failures)) return;
  if (!exactArray(Object.keys(metadata), expectedKeys)) failures.push(`${label} metadata key order invalid`);
  for (const key of expectedKeys) {
    if (!Object.is(metadata[key], expected[key])) failures.push(`${label} metadata ${key} differs from manifest parent`);
  }
  if (source !== `${JSON.stringify(metadata, null, 2)}\n`) failures.push(`${label} metadata must use canonical JSON encoding`);
}

function validateArtifact(value, label, artifactRoot, expectedMetadata, failures) {
  if (!exactKeys(value, ['path', 'sha256'], ['path', 'sha256'], label, failures)) return;
  const bytes = validateFileEvidence(value.path, value.sha256, artifactRoot, MAX_EVIDENCE_BYTES, label, failures);
  validateSemanticMetadata(bytes, expectedMetadata, label, failures);
}

export function validateAudioCatalog(catalog, artifactRoot) {
  const failures = [];
  const rootKeys = ['schemaVersion', 'runtimeAuthority', 'buses', 'families', 'events', 'spatialProfiles', 'footsteps', 'arenas', 'budgets', 'spatialEvidence', 'lifecycleEvidence'];
  if (!exactKeys(catalog, rootKeys, rootKeys, 'catalog', failures)) return failures;
  if (catalog.schemaVersion !== 3) failures.push('schemaVersion must equal 3');
  const fixtureOnly = catalog.runtimeAuthority?.state === 'staging-contract';

  const authorityKeys = ['registryPath', 'testPath', 'state'];
  if (exactKeys(catalog.runtimeAuthority, authorityKeys, authorityKeys, 'runtimeAuthority', failures)) {
    if (catalog.runtimeAuthority.registryPath !== 'src/sound-event-inventory.ts') failures.push('runtime authority registry path must point to F16');
    if (catalog.runtimeAuthority.testPath !== 'src/sound-event-inventory.test.ts') failures.push('runtime authority test path must point to F16');
    if (!['staging-contract', 'canonical-runtime'].includes(catalog.runtimeAuthority.state)) failures.push('runtime authority state invalid');
    if (catalog.runtimeAuthority.state === 'canonical-runtime') {
      const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
      for (const relativePath of [catalog.runtimeAuthority.registryPath, catalog.runtimeAuthority.testPath]) {
        if (!fs.existsSync(path.join(repoRoot, relativePath))) failures.push(`canonical runtime authority path missing: ${relativePath}`);
      }
    }
  }

  const buses = Array.isArray(catalog.buses) ? catalog.buses : [];
  if (!exactArray(buses.map(bus => bus?.id), BUS_ORACLE)) failures.push('buses must exactly match the canonical ordered bus oracle');
  const busKeys = ['id', 'gain', 'muted', 'maxVoices'];
  for (const [index, bus] of buses.entries()) {
    if (!exactKeys(bus, busKeys, busKeys, `buses[${index}]`, failures)) continue;
    if (!BUS_ORACLE.includes(bus.id)) failures.push(`buses[${index}] unknown bus`);
    if (!finite(bus.gain, 0, 1) || typeof bus.muted !== 'boolean') failures.push(`${bus.id} setting invalid`);
    if (!uint(bus.maxVoices, 1, 512)) failures.push(`${bus.id} voice cap invalid`);
  }
  const busById = new Map(buses.map(bus => [bus.id, bus]));

  if (!exactArray(catalog.families, FAMILY_ORACLE)) failures.push('families must exactly match the independent F16 family oracle');
  const events = Array.isArray(catalog.events) ? catalog.events : [];
  if (!exactArray(events.map(event => event?.id), EVENT_IDS)) failures.push('events must exactly match the independent staging event oracle with no extras');
  const eventKeys = ['id', 'family', 'bus', 'delivery', 'spatialProfileId', 'maxConcurrent', 'priority', 'cooldownMs', 'owner', 'evidenceId', 'variants'];
  const globalVariantIds = [];
  for (const [index, event] of events.entries()) {
    const label = `events[${index}]`;
    if (!exactKeys(event, eventKeys, eventKeys, label, failures)) continue;
    const oracle = EVENT_ORACLE[index];
    if (!oracle || !exactArray([event.id, event.family, event.bus, event.delivery, event.spatialProfileId], oracle)) failures.push(`${label} identity/policy differs from independent oracle`);
    if (!idOk(event.id) || !FAMILY_ORACLE.includes(event.family) || !BUS_ORACLE.slice(1).includes(event.bus)) failures.push(`${label} ID/family/bus invalid`);
    if (!['listener-local', 'world-spatial', 'global-nonspatial'].includes(event.delivery)) failures.push(`${label} delivery invalid`);
    if (event.delivery === 'world-spatial' ? !PROFILE_IDS.includes(event.spatialProfileId) : event.spatialProfileId !== null) failures.push(`${label} spatial profile identity invalid`);
    if (!uint(event.maxConcurrent, 1, 64) || !uint(event.priority, 0, 255) || !finite(event.cooldownMs, 0, 60000)) failures.push(`${label} cap/priority/cooldown invalid`);
    if (!idOk(event.owner) || !idOk(event.evidenceId)) failures.push(`${label} owner/evidence ID invalid`);
    const variants = Array.isArray(event.variants) ? event.variants : [];
    if (variants.length === 0) failures.push(`${label} variants missing`);
    for (const [variantIndex, variant] of variants.entries()) {
      const variantLabel = `${label}.variants[${variantIndex}]`;
      const variantKeys = ['id', 'source', 'license', 'derivativeNotes', 'sha256'];
      if (!exactKeys(variant, variantKeys, variantKeys, variantLabel, failures)) continue;
      if (!idOk(variant.id) || typeof variant.license !== 'string' || variant.license.trim().length === 0 || variant.license.length > 200 || typeof variant.derivativeNotes !== 'string' || variant.derivativeNotes.trim().length === 0 || variant.derivativeNotes.length > 500) failures.push(`${variantLabel} provenance invalid`);
      const bytes = validateFileEvidence(variant.source, variant.sha256, artifactRoot, MAX_VARIANT_BYTES, variantLabel, failures);
      validateSemanticMetadata(bytes, {
        schemaVersion: catalog.schemaVersion,
        fixtureOnly,
        kind: 'audio-variant-evidence',
        eventId: event.id,
        family: event.family,
        bus: event.bus,
        delivery: event.delivery,
        spatialProfileId: event.spatialProfileId,
        maxConcurrent: event.maxConcurrent,
        priority: event.priority,
        cooldownMs: event.cooldownMs,
        owner: event.owner,
        evidenceId: event.evidenceId,
        variantId: variant.id,
        source: variant.source,
        license: variant.license,
        derivativeNotes: variant.derivativeNotes,
      }, variantLabel, failures);
      globalVariantIds.push(variant.id);
    }
    if (new Set(variants.map(variant => variant?.id)).size !== variants.length) failures.push(`${label} variant IDs must be unique`);
  }
  if (new Set(globalVariantIds).size !== globalVariantIds.length) failures.push('variant IDs must be globally unique');

  const profiles = Array.isArray(catalog.spatialProfiles) ? catalog.spatialProfiles : [];
  if (!exactArray(profiles.map(profile => profile?.id), PROFILE_IDS)) failures.push('spatial profiles must exactly match the independent profile oracle');
  const profileKeys = ['id', 'referenceDistanceM', 'maxDistanceM', 'rolloff', 'coneInnerDeg', 'coneOuterDeg', 'voiceCap', 'stealPolicy', 'rolloffSamples'];
  const profileById = new Map();
  for (const [index, profile] of profiles.entries()) {
    const label = `spatialProfiles[${index}]`;
    if (!exactKeys(profile, profileKeys, profileKeys, label, failures)) continue;
    profileById.set(profile.id, profile);
    if (!PROFILE_IDS.includes(profile.id)) failures.push(`${label} unknown profile`);
    if (!finite(profile.referenceDistanceM, 0.01, 1000) || !finite(profile.maxDistanceM, profile.referenceDistanceM + Number.EPSILON, 10000) || !finite(profile.rolloff, Number.EPSILON, 10)) failures.push(`${label} distances/positive rolloff invalid`);
    if (!finite(profile.coneInnerDeg, 0, 360) || !finite(profile.coneOuterDeg, profile.coneInnerDeg, 360)) failures.push(`${label} cone invalid`);
    if (!uint(profile.voiceCap, 1, 128) || !['oldest', 'quietest', 'lowest-priority'].includes(profile.stealPolicy)) failures.push(`${label} cap/steal policy invalid`);
    const samples = Array.isArray(profile.rolloffSamples) ? profile.rolloffSamples : [];
    if (samples.length < 3) failures.push(`${label} needs at least three rolloff samples`);
    for (const [sampleIndex, sample] of samples.entries()) {
      const sampleLabel = `${label}.rolloffSamples[${sampleIndex}]`;
      if (!exactKeys(sample, ['distanceM', 'gain'], ['distanceM', 'gain'], sampleLabel, failures)) continue;
      if (!finite(sample.distanceM, profile.referenceDistanceM, profile.maxDistanceM) || !finite(sample.gain, 0, 1)) failures.push(`${sampleLabel} invalid`);
      if (sampleIndex > 0 && (sample.distanceM <= samples[sampleIndex - 1].distanceM || sample.gain > samples[sampleIndex - 1].gain)) failures.push(`${label} rolloff samples must be strictly farther and monotonically quieter`);
    }
    if (samples.length && (samples[0].distanceM !== profile.referenceDistanceM || samples.at(-1).distanceM !== profile.maxDistanceM || samples[0].gain <= samples.at(-1).gain)) failures.push(`${label} rolloff endpoints invalid`);
  }

  for (const event of events) {
    const bus = busById.get(event?.bus);
    const profile = event?.spatialProfileId ? profileById.get(event.spatialProfileId) : null;
    if (bus && event.maxConcurrent > bus.maxVoices) failures.push(`${event.id} cap exceeds bus cap`);
    if (profile && (event.maxConcurrent > profile.voiceCap || profile.voiceCap > bus?.maxVoices)) failures.push(`${event.id} event/profile/bus caps inconsistent`);
  }

  const footstepsKeys = ['keyedBy', 'groundedTravelSegments', 'groundedEmissions', 'airborneTravelSegments', 'airborneEmissions', 'discontinuityCount', 'discontinuityEmissions', 'remoteActorTravelSegments', 'remoteSpatialEmissions'];
  if (exactKeys(catalog.footsteps, footstepsKeys, footstepsKeys, 'footsteps', failures)) {
    if (!exactArray(catalog.footsteps.keyedBy, ['actor', 'life', 'continuity'])) failures.push('footsteps identity keys incomplete');
    for (const key of footstepsKeys.slice(1)) if (!uint(catalog.footsteps[key], 0, 1000000)) failures.push(`footsteps.${key} invalid`);
    if (catalog.footsteps.groundedTravelSegments < 1 || catalog.footsteps.groundedEmissions !== catalog.footsteps.groundedTravelSegments || catalog.footsteps.airborneTravelSegments < 1 || catalog.footsteps.airborneEmissions !== 0 || catalog.footsteps.discontinuityCount < 1 || catalog.footsteps.discontinuityEmissions !== 0 || catalog.footsteps.remoteActorTravelSegments < 1 || catalog.footsteps.remoteSpatialEmissions !== catalog.footsteps.remoteActorTravelSegments) failures.push('footstep numeric evidence violates admitted/spatial/discontinuity contract');
  }
  const remoteFootstep = events.find(event => event.id === 'movement.footstep.world');
  if (remoteFootstep?.delivery !== 'world-spatial' || remoteFootstep?.bus !== 'movement') failures.push('remote footstep must be spatial on movement bus');

  const arenas = Array.isArray(catalog.arenas) ? catalog.arenas : [];
  if (!exactArray(arenas.map(arena => arena?.id), ARENA_ORACLE)) failures.push('arenas must exactly equal atomic-acres, skyline-terminal, rustworks-1v1, gun-range');
  const arenaKeys = ['id', 'ambienceEventId', 'variantId', 'sourceBudget', 'settledSourceCount', 'artifact'];
  const ambienceVariants = new Set(events.find(event => event.id === 'ambience.arena-bed')?.variants?.map(variant => variant.id) ?? []);
  for (const [index, arena] of arenas.entries()) {
    const label = `arenas[${index}]`;
    if (!exactKeys(arena, arenaKeys, arenaKeys, label, failures)) continue;
    if (arena.ambienceEventId !== 'ambience.arena-bed' || !ambienceVariants.has(arena.variantId)) failures.push(`${label} ambience identity invalid`);
    if (!uint(arena.sourceBudget, 1, 32) || arena.settledSourceCount !== 0) failures.push(`${label} source budget/settle count invalid`);
    validateArtifact(arena.artifact, `${label}.artifact`, artifactRoot, {
      schemaVersion: catalog.schemaVersion,
      fixtureOnly,
      kind: 'arena-audio-evidence',
      arenaId: arena.id,
      ambienceEventId: arena.ambienceEventId,
      variantId: arena.variantId,
      sourceBudget: arena.sourceBudget,
      settledSourceCount: arena.settledSourceCount,
      artifactPath: arena.artifact?.path,
    }, failures);
  }
  if (new Set(arenas.map(arena => arena?.variantId)).size !== ARENA_ORACLE.length) failures.push('each arena requires a distinct ambience variant');

  const budgetKeys = ['maxActiveVoices', 'maxLoops', 'maxReusableChains', 'maxOcclusionQueriesPerSecond', 'occlusionCpuP95Ms'];
  if (exactKeys(catalog.budgets, budgetKeys, budgetKeys, 'budgets', failures)) {
    if (!uint(catalog.budgets.maxActiveVoices, 1, 512) || !uint(catalog.budgets.maxLoops, 0, catalog.budgets.maxActiveVoices) || !uint(catalog.budgets.maxReusableChains, 1, 512) || !uint(catalog.budgets.maxOcclusionQueriesPerSecond, 1, 10000) || !finite(catalog.budgets.occlusionCpuP95Ms, 0, 50)) failures.push('global audio budgets invalid');
    if (busById.get('master')?.maxVoices !== catalog.budgets.maxActiveVoices) failures.push('master and global voice caps differ');
    const categoryTotal = BUS_ORACLE.slice(1).reduce((sum, id) => sum + (busById.get(id)?.maxVoices ?? Infinity), 0);
    if (categoryTotal > catalog.budgets.maxActiveVoices) failures.push('sum of category caps exceeds global voice cap');
    for (const busId of BUS_ORACLE.slice(1)) {
      const declared = events.filter(event => event.bus === busId).reduce((sum, event) => sum + event.maxConcurrent, 0);
      if (declared > (busById.get(busId)?.maxVoices ?? 0)) failures.push(`${busId} event caps exceed bus cap`);
    }
  }

  const spatialEvidence = Array.isArray(catalog.spatialEvidence) ? catalog.spatialEvidence : [];
  if (!exactArray(spatialEvidence.map(item => item?.eventId).sort(), [...SPATIAL_EVENT_IDS].sort())) failures.push('spatial evidence must cover every spatial staging event exactly once');
  const spatialEvidenceKeys = ['eventId', 'sourceAzimuthDeg', 'observedPan', 'openGain', 'occludedGain', 'openLowPassHz', 'occludedLowPassHz', 'artifact'];
  for (const [index, evidence] of spatialEvidence.entries()) {
    const label = `spatialEvidence[${index}]`;
    if (!exactKeys(evidence, spatialEvidenceKeys, spatialEvidenceKeys, label, failures)) continue;
    if (!SPATIAL_EVENT_IDS.includes(evidence.eventId)) failures.push(`${label} event invalid`);
    if (!finite(evidence.sourceAzimuthDeg, -180, 180) || evidence.sourceAzimuthDeg === 0 || !finite(evidence.observedPan, -1, 1) || evidence.observedPan === 0 || Math.sign(evidence.sourceAzimuthDeg) !== Math.sign(evidence.observedPan)) failures.push(`${label} pan evidence invalid`);
    if (!finite(evidence.openGain, 0, 1) || !finite(evidence.occludedGain, 0, evidence.openGain) || evidence.occludedGain >= evidence.openGain) failures.push(`${label} occlusion gain evidence invalid`);
    if (!finite(evidence.openLowPassHz, 20, 24000) || !finite(evidence.occludedLowPassHz, 20, evidence.openLowPassHz) || evidence.occludedLowPassHz >= evidence.openLowPassHz) failures.push(`${label} occlusion low-pass evidence invalid`);
    validateArtifact(evidence.artifact, `${label}.artifact`, artifactRoot, {
      schemaVersion: catalog.schemaVersion,
      fixtureOnly,
      kind: 'spatial-audio-evidence',
      eventId: evidence.eventId,
      sourceAzimuthDeg: evidence.sourceAzimuthDeg,
      observedPan: evidence.observedPan,
      openGain: evidence.openGain,
      occludedGain: evidence.occludedGain,
      openLowPassHz: evidence.openLowPassHz,
      occludedLowPassHz: evidence.occludedLowPassHz,
      artifactPath: evidence.artifact?.path,
    }, failures);
  }

  const lifecycle = Array.isArray(catalog.lifecycleEvidence) ? catalog.lifecycleEvidence : [];
  if (!exactArray(lifecycle.map(item => item?.id), LIFECYCLE_ORACLE)) failures.push('lifecycle evidence must exactly cover arena switch, rematch and suspend/resume');
  const lifecycleKeys = ['id', 'initialNodes', 'expectedSettledNodes', 'observedSettledNodes', 'errorCount', 'artifact'];
  for (const [index, evidence] of lifecycle.entries()) {
    const label = `lifecycleEvidence[${index}]`;
    if (!exactKeys(evidence, lifecycleKeys, lifecycleKeys, label, failures)) continue;
    if (!LIFECYCLE_ORACLE.includes(evidence.id)) failures.push(`${label} ID invalid`);
    for (const key of lifecycleKeys.slice(1, 5)) if (!uint(evidence[key], 0, 1000000)) failures.push(`${label}.${key} invalid`);
    if (evidence.observedSettledNodes !== evidence.expectedSettledNodes || evidence.observedSettledNodes > evidence.initialNodes || evidence.errorCount !== 0) failures.push(`${label} did not settle`);
    validateArtifact(evidence.artifact, `${label}.artifact`, artifactRoot, {
      schemaVersion: catalog.schemaVersion,
      fixtureOnly,
      kind: 'audio-lifecycle-evidence',
      lifecycleId: evidence.id,
      initialNodes: evidence.initialNodes,
      expectedSettledNodes: evidence.expectedSettledNodes,
      observedSettledNodes: evidence.observedSettledNodes,
      errorCount: evidence.errorCount,
      artifactPath: evidence.artifact?.path,
    }, failures);
  }
  return [...new Set(failures)].sort();
}

function readJson(input) { return JSON.parse(fs.readFileSync(input, 'utf8')); }

function addArtifactPairMutations(mutations, fixture, collectionKey, label, identityKey) {
  const collection = fixture[collectionKey];
  let count = 0;
  for (let leftIndex = 0; leftIndex < collection.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < collection.length; rightIndex += 1) {
      const leftId = collection[leftIndex][identityKey];
      const rightId = collection[rightIndex][identityKey];
      mutations.push([`${label} artifact swap ${leftId} <-> ${rightId}`, value => {
        const left = value[collectionKey][leftIndex];
        const right = value[collectionKey][rightIndex];
        [left.artifact, right.artifact] = [right.artifact, left.artifact];
      }]);
      count += 1;
    }
  }
  return count;
}

function runSelfTest() {
  const fixturePath = fileURLToPath(new URL('./fixtures/known-good.json', import.meta.url));
  const fixtureRoot = path.dirname(fixturePath);
  const fixture = readJson(fixturePath);
  const baseline = validateAudioCatalog(fixture, fixtureRoot);
  if (baseline.length) return { escaped: [`known-good fixture failed before mutations: ${baseline.join('; ')}`], total: 0, counts: {} };
  const mutations = [
    ['unknown nested key', value => { value.events[0].selfAttested = true; }],
    ['missing canonical bus', value => { value.buses.pop(); }],
    ['missing canonical family', value => { value.families.pop(); }],
    ['missing required event', value => { value.events.splice(4, 1); }],
    ['wrong RustRig ID', value => { value.arenas[2].id = 'rustrig'; }],
    ['zero rolloff', value => { value.spatialProfiles[0].rolloff = 0; }],
    ['equal max/reference distance', value => { value.spatialProfiles[0].maxDistanceM = value.spatialProfiles[0].referenceDistanceM; }],
    ['remote footstep local', value => { value.events.find(event => event.id === 'movement.footstep.world').delivery = 'listener-local'; }],
    ['duplicate variant ID', value => { value.events[1].variants[0].id = value.events[0].variants[0].id; }],
    ['variant derivative notes missing', value => { delete value.events[0].variants[0].derivativeNotes; }],
    ['variant artifact missing', value => { value.events[0].variants[0].source = 'fixture-payloads/audio/variants/missing.txt'; }],
    ['variant artifact traversal', value => { value.events[0].variants[0].source = '../outside.txt'; }],
    ['variant digest drift', value => { value.events[0].variants[0].sha256 = 'e'.repeat(64); }],
    ['variant provenance differs from payload', value => { value.events[0].variants[0].license = 'cc-by-4.0'; }],
    ['missing spatial evidence', value => { value.spatialEvidence.pop(); }],
    ['evidence artifact missing', value => { value.spatialEvidence[0].artifact.path = 'fixture-payloads/audio/evidence/missing.json'; }],
    ['evidence artifact traversal', value => { value.spatialEvidence[0].artifact.path = '../outside.json'; }],
    ['evidence digest drift', value => { value.spatialEvidence[0].artifact.sha256 = 'e'.repeat(64); }],
    ['wrong pan sign', value => { value.spatialEvidence[0].observedPan *= -1; }],
    ['no occlusion attenuation', value => { value.spatialEvidence[0].occludedGain = value.spatialEvidence[0].openGain; }],
    ['spatial observation differs from payload', value => { value.spatialEvidence[0].observedPan = -0.45; }],
    ['arena budget differs from payload', value => { value.arenas[0].sourceBudget = 5; }],
    ['lifecycle count differs from payload', value => { value.lifecycleEvidence[0].initialNodes = 73; }],
    ['bus cap inconsistency', value => { value.events[0].maxConcurrent = 64; }],
    ['airborne footstep emission', value => { value.footsteps.airborneEmissions = 1; }],
    ['runtime authority overclaim', value => { value.runtimeAuthority.state = 'canonical-runtime'; value.runtimeAuthority.registryPath = 'src/missing.ts'; }],
  ];
  const baseCount = mutations.length;
  const variantRefs = fixture.events.flatMap((event, eventIndex) => event.variants.map((variant, variantIndex) => ({ eventIndex, variantIndex, eventId: event.id, variantId: variant.id })));
  let variantPairCount = 0;
  for (let leftIndex = 0; leftIndex < variantRefs.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < variantRefs.length; rightIndex += 1) {
      const leftRef = variantRefs[leftIndex];
      const rightRef = variantRefs[rightIndex];
      mutations.push([`variant source/digest swap ${leftRef.eventId}/${leftRef.variantId} <-> ${rightRef.eventId}/${rightRef.variantId}`, value => {
        const left = value.events[leftRef.eventIndex].variants[leftRef.variantIndex];
        const right = value.events[rightRef.eventIndex].variants[rightRef.variantIndex];
        [left.source, right.source] = [right.source, left.source];
        [left.sha256, right.sha256] = [right.sha256, left.sha256];
      }]);
      variantPairCount += 1;
    }
  }
  const arenaPairCount = addArtifactPairMutations(mutations, fixture, 'arenas', 'arena', 'id');
  const spatialPairCount = addArtifactPairMutations(mutations, fixture, 'spatialEvidence', 'spatial', 'eventId');
  const lifecyclePairCount = addArtifactPairMutations(mutations, fixture, 'lifecycleEvidence', 'lifecycle', 'id');
  const escaped = [];
  for (const [label, mutate] of mutations) {
    const candidate = structuredClone(fixture);
    mutate(candidate);
    if (validateAudioCatalog(candidate, fixtureRoot).length === 0) escaped.push(label);
  }
  return {
    escaped,
    total: mutations.length,
    counts: { base: baseCount, variantPairs: variantPairCount, arenaPairs: arenaPairCount, spatialPairs: spatialPairCount, lifecyclePairs: lifecyclePairCount },
  };
}

const args = process.argv.slice(2);
if (args[0] === '--self-test') {
  const { escaped, total, counts } = runSelfTest();
  if (escaped.length) {
    console.error(`FAIL audio-catalog self-test escaped=${escaped.length}`);
    for (const label of escaped) console.error(`- ${label}`);
    process.exit(1);
  }
  console.log(`PASS audio-catalog self-test mutations=${total} base=${counts.base} variant-pairs=${counts.variantPairs} arena-pairs=${counts.arenaPairs} spatial-pairs=${counts.spatialPairs} lifecycle-pairs=${counts.lifecyclePairs}`);
  process.exit(0);
}
const input = args[0];
if (!input) {
  console.error('usage: node verify-audio-catalog.mjs <audio-catalog.json> | --self-test');
  process.exit(2);
}
let catalog;
try {
  catalog = readJson(input);
} catch (error) {
  console.error(`FAIL audio-catalog unreadable-json ${error.message}`);
  process.exit(2);
}
const failures = validateAudioCatalog(catalog, path.dirname(path.resolve(input)));
if (failures.length) {
  console.error(`FAIL audio-catalog ${path.basename(input)} ${failures.length}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`PASS audio-catalog ${path.basename(input)} events=${EVENT_IDS.length} buses=${BUS_ORACLE.length} profiles=${PROFILE_IDS.length}`);
