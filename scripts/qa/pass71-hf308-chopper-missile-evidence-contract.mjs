import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';

export const PASS71_HF308_CHOPPER_MISSILE_EVIDENCE = Object.freeze({
  schemaVersion: 1,
  evidenceId: 'HF-308',
  kind: 'pass71-hf308-chopper-missile-full-closure',
  contract: 'atomic-acres/pass71-hf308-chopper-missile-full-closure@1',
  feedbackId: 'HF-308',
  status: 'passed',
  closesFeedback: true,
  closingAuthority: true,
  ownerSubjectiveApproval: 'not-claimed',
});

export const PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR = Object.freeze({
  evidenceId: PASS71_HF308_CHOPPER_MISSILE_EVIDENCE.evidenceId,
  kind: PASS71_HF308_CHOPPER_MISSILE_EVIDENCE.kind,
  minimumCount: 0,
  maximumCount: 1,
});

export const PASS71_HF308_ARENAS = Object.freeze([
  'atomic-acres',
  'skyline-terminal',
  'rustworks-1v1',
  'gun-range',
]);
export const PASS71_HF308_RENDERERS = Object.freeze(['webgl2', 'webgpu']);
export const PASS71_HF308_MODES = Object.freeze(['offline', 'hosted']);
export const PASS71_HF308_SCOPES = Object.freeze(PASS71_HF308_ARENAS.flatMap((arena) => (
  PASS71_HF308_RENDERERS.flatMap((renderer) => PASS71_HF308_MODES.map((mode) => (
    Object.freeze({ arena, renderer, mode })
  )))
)));

export const PASS71_HF308_REQUIRED_ASSERTIONS = Object.freeze([
  'binds every admitted launch and impact to exact owner life epoch sequence aircraft socket target and trajectory identities',
  'preserves canonical six-ammo authority at no less than the 1000 ms cadence without queued cooldown or seventh launches',
  'clears pending missile control and presentation on exit death match end and rematch',
  'requires lossless same-completed-frame visible-versus-exact-shell-hidden attribution without sky spawn or detached trail',
  'covers the exact cross product of every support-enabled arena renderer and offline or owned hosted mode',
]);

export const PASS71_HF308_MECHANICAL_TEST_FILES = Object.freeze([
  'src/chopper-gunner-missile.test.ts',
  'src/killstreak-presentation.test.ts',
  'src/killstreak-damage-result-admission.test.ts',
  'src/killstreak-protocol.test.ts',
  'src/map-selection.test.ts',
  'src/pass71-hf308-chopper-missile-release-evidence.test.ts',
]);

export const PASS71_HF308_TOOLING_PATHS = Object.freeze([
  'src/killstreak-runtime.ts',
  'src/killstreak-presentation.ts',
  'src/killstreak-protocol.ts',
  'src/killstreak-damage-result-admission.ts',
  'src/network.ts',
  'src/legacy-main.ts',
  'src/chopper-gunner-missile.test.ts',
  'src/killstreak-presentation.test.ts',
  'src/pass71-hf308-chopper-missile-release-evidence.test.ts',
  'tests/e2e/pass71-hf308-chopper-missile.spec.ts',
  'scripts/qa/pass71-hf308-chopper-missile-evidence-contract.mjs',
  'scripts/qa/pass71-hf308-chopper-missile-evidence-contract.d.mts',
  'scripts/qa/pass71-hf308-chopper-missile-evidence-contract.test.mjs',
  'scripts/qa/run-pass71-hf308-chopper-missile-evidence.mjs',
  'scripts/qa/run-playwright-with-topology.mjs',
  'scripts/qa/pass71-edge-executable-identity.mjs',
  'scripts/release/stage-release-topology.mjs',
  'playwright.config.ts',
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  'release-channels.json',
]);

export const PASS71_HF308_POLICY = Object.freeze({
  authorityContract: 'pass71-hf308-chopper-missile-authority-v1',
  capacity: 6,
  cadenceMs: 1_000,
  flightMs: 780,
  blastRadiusM: 4.5,
  socketLocal: Object.freeze({
    left: Object.freeze([-1.18, -0.3, -0.145]),
    right: Object.freeze([1.18, -0.3, -0.145]),
  }),
  rasterContract: 'embedded-lossless-png-bytes-decoded-and-recomputed-by-contract',
  rasterRoiWidth: 96,
  rasterRoiHeight: 96,
  maximumAttachmentBytes: 128 * 1_024,
  maximumEncodedRecordBytes: 2_000_000,
});

export const PASS71_HF308_MACHINE_HOSTNAME_SHA256 = createHash('sha256')
  .update('desktop-vi3cr5q', 'utf8')
  .digest('hex');

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return object(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function finite(value, minimum = Number.NEGATIVE_INFINITY, maximum = Number.POSITIVE_INFINITY) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function safeCounter(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function vec(value, length) {
  return Array.isArray(value) && value.length === length && value.every(Number.isFinite);
}

function vecNear(left, right, epsilon = 1e-6) {
  return vec(left, right.length) && left.every((value, index) => Math.abs(value - right[index]) <= epsilon);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

export function pass71Hf308RecordSha256(record) {
  const unsigned = { ...record };
  delete unsigned.receiptSha256;
  return sha256(JSON.stringify(canonical(unsigned)));
}

export function pass71Hf308ToolingHashesAtSource(repositoryRoot, sourceSha) {
  if (!SHA40.test(sourceSha ?? '')) throw new Error('HF-308 tooling requires a 40-character source SHA');
  return Object.freeze(PASS71_HF308_TOOLING_PATHS.map((path) => {
    const bytes = execFileSync('git', ['-C', repositoryRoot, 'show', `${sourceSha}:${path}`], {
      encoding: 'buffer', windowsHide: true, maxBuffer: 64 * 1024 * 1024,
    });
    return Object.freeze({ path, sha256: sha256(bytes) });
  }));
}

function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.toString('base64') === value ? bytes : null;
}

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

const decodedPngCache = new Map();

export function pass71Hf308DecodeLosslessPng(bytes) {
  const digest = sha256(bytes);
  const cached = decodedPngCache.get(digest);
  if (cached) return cached;
  if (!Buffer.isBuffer(bytes) || bytes.length <= 32 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('HF-308 PNG signature');
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = -1;
  const idat = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw new Error('HF-308 PNG chunk bounds');
    if (pngCrc32(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end)) {
      throw new Error('HF-308 PNG chunk CRC');
    }
    if (type === 'IHDR') {
      width = bytes.readUInt32BE(start);
      height = bytes.readUInt32BE(start + 4);
      bitDepth = bytes[start + 8];
      colorType = bytes[start + 9];
      interlace = bytes[start + 12];
    } else if (type === 'IDAT') idat.push(bytes.subarray(start, end));
    offset = end + 4;
    if (type === 'IEND') break;
  }
  if (!safeCounter(width, 1) || !safeCounter(height, 1) || bitDepth !== 8
    || ![2, 6].includes(colorType) || interlace !== 0 || idat.length === 0) {
    throw new Error('HF-308 PNG IHDR');
  }
  const sourceChannels = colorType === 6 ? 4 : 3;
  const stride = width * sourceChannels;
  const inflated = inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * height });
  if (inflated.length !== (stride + 1) * height) throw new Error('HF-308 PNG inflated byte length');
  const unfiltered = Buffer.allocUnsafe(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset++];
    if (filter > 4) throw new Error('HF-308 PNG filter');
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset++];
      const left = x >= sourceChannels ? unfiltered[rowOffset + x - sourceChannels] : 0;
      const up = y > 0 ? unfiltered[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= sourceChannels ? unfiltered[rowOffset - stride + x - sourceChannels] : 0;
      const predictor = filter === 1 ? left : filter === 2 ? up
        : filter === 3 ? Math.floor((left + up) / 2) : filter === 4 ? paeth(left, up, upperLeft) : 0;
      unfiltered[rowOffset + x] = (raw + predictor) & 0xff;
    }
  }
  const rgb = sourceChannels === 3 ? unfiltered : Buffer.allocUnsafe(width * height * 3);
  if (sourceChannels === 4) {
    for (let source = 0, target = 0; source < unfiltered.length; source += 4, target += 3) {
      rgb[target] = unfiltered[source];
      rgb[target + 1] = unfiltered[source + 1];
      rgb[target + 2] = unfiltered[source + 2];
    }
  }
  const decoded = Object.freeze({ width, height, rgb });
  decodedPngCache.set(digest, decoded);
  return decoded;
}

export function pass71Hf308RasterDifference(visible, hidden) {
  if (visible.width !== hidden.width || visible.height !== hidden.height
    || !Buffer.isBuffer(visible.rgb) || !Buffer.isBuffer(hidden.rgb)
    || visible.rgb.length !== hidden.rgb.length) throw new Error('HF-308 raster pair mismatch');
  let changedPixelsAboveEight = 0;
  let changedPixelsAboveTwentyFour = 0;
  let maximumPerceptualDifference = 0;
  let minimumChangedX = null;
  let maximumChangedX = null;
  let minimumChangedY = null;
  let maximumChangedY = null;
  for (let y = 0; y < visible.height; y += 1) {
    for (let x = 0; x < visible.width; x += 1) {
      const offset = (y * visible.width + x) * 3;
      const difference = Math.abs(visible.rgb[offset] - hidden.rgb[offset]) * 0.2126
        + Math.abs(visible.rgb[offset + 1] - hidden.rgb[offset + 1]) * 0.7152
        + Math.abs(visible.rgb[offset + 2] - hidden.rgb[offset + 2]) * 0.0722;
      if (difference > 8) {
        changedPixelsAboveEight += 1;
        minimumChangedX = minimumChangedX === null ? x : Math.min(minimumChangedX, x);
        maximumChangedX = maximumChangedX === null ? x : Math.max(maximumChangedX, x);
        minimumChangedY = minimumChangedY === null ? y : Math.min(minimumChangedY, y);
        maximumChangedY = maximumChangedY === null ? y : Math.max(maximumChangedY, y);
      }
      if (difference > 24) changedPixelsAboveTwentyFour += 1;
      maximumPerceptualDifference = Math.max(maximumPerceptualDifference, difference);
    }
  }
  const pixelCount = visible.width * visible.height;
  return Object.freeze({
    width: visible.width,
    height: visible.height,
    pixelCount,
    changedPixelsAboveEight,
    changedPixelsAboveTwentyFour,
    materiallyChangedPixelRatio: changedPixelsAboveEight / pixelCount,
    highContrastChangedPixelRatio: changedPixelsAboveTwentyFour / pixelCount,
    maximumPerceptualDifference,
    boundingBox: minimumChangedX === null ? null : Object.freeze({
      left: minimumChangedX,
      top: minimumChangedY,
      right: maximumChangedX,
      bottom: maximumChangedY,
      width: maximumChangedX - minimumChangedX + 1,
      height: maximumChangedY - minimumChangedY + 1,
    }),
  });
}

function rotateYxz(local, attitude) {
  const [x, y, z] = attitude;
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  const qx = s1 * c2 * c3 + c1 * s2 * s3;
  const qy = c1 * s2 * c3 - s1 * c2 * s3;
  const qz = c1 * c2 * s3 - s1 * s2 * c3;
  const qw = c1 * c2 * c3 + s1 * s2 * s3;
  const [vx, vy, vz] = local;
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function expectedLaunchPosition(event) {
  const rotated = rotateYxz(event.socketLocal, event.sourceAttitude);
  return event.sourcePosition.map((value, axis) => value + rotated[axis]);
}

function sourceFailures(source, expected) {
  const failures = [];
  if (!exactKeys(source, [
    'expectedSourceSha', 'checkoutSourceSha', 'sourceTreeSha', 'servedSourceSha',
    'endingCheckoutSourceSha', 'cleanBefore', 'cleanAfter', 'servedSchemaVersion',
    'servedReleasePass', 'servedChannel', 'servedPath', 'servedTreeSha256', 'servedFileCount',
  ])) return ['source-shape'];
  for (const key of ['expectedSourceSha', 'checkoutSourceSha', 'servedSourceSha', 'endingCheckoutSourceSha']) {
    if (source[key] !== expected.sourceSha) failures.push(`source-${key}`);
  }
  if (!SHA40.test(source.sourceTreeSha ?? '') || source.sourceTreeSha !== expected.sourceTreeSha) failures.push('source-tree');
  if (source.cleanBefore !== true || source.cleanAfter !== true) failures.push('source-clean');
  if (source.servedSchemaVersion !== 4 || source.servedReleasePass !== 'PASS 71'
    || source.servedChannel !== 'the-big-one' || source.servedPath !== 'channels/the-big-one'
    || !SHA256.test(source.servedTreeSha256 ?? '') || !safeCounter(source.servedFileCount, 100)) {
    failures.push('served-candidate');
  }
  return failures;
}

function browserFailures(browser) {
  if (!exactKeys(browser, [
    'channel', 'installed', 'version', 'userAgent', 'executableName', 'executableVersion',
    'executablePath', 'executableSha256', 'installRoot', 'signatureStatus', 'signer', 'isolation',
  ])) return ['browser-shape'];
  return browser.channel !== 'msedge' || browser.installed !== true
    || typeof browser.version !== 'string' || browser.version !== browser.executableVersion
    || !browser.userAgent?.includes(`Edg/${browser.version}`) || browser.executableName !== 'msedge.exe'
    || !/\/Microsoft\/Edge\/Application\/msedge\.exe$/iu.test(browser.executablePath ?? '')
    || !SHA256.test(browser.executableSha256 ?? '') || typeof browser.installRoot !== 'string'
    || browser.signatureStatus !== 'Valid' || !/Microsoft/i.test(browser.signer ?? '')
    || browser.isolation !== 'fresh-process-and-profile-per-scope'
    ? ['browser-identity'] : [];
}

function mechanicalFailures(oracle) {
  if (!exactKeys(oracle, [
    'contract', 'status', 'command', 'testFiles', 'requiredAssertions', 'testFileCount',
    'testCount', 'passedCount', 'failedCount', 'startedAt', 'completedAt', 'reportSha256',
  ])) return ['mechanical-shape'];
  return oracle.contract !== 'atomic-acres/pass71-hf308-focused-vitest-oracle@1'
    || oracle.status !== 'passed' || !oracle.command.includes('vitest run')
    || !same(oracle.testFiles, PASS71_HF308_MECHANICAL_TEST_FILES)
    || !same(oracle.requiredAssertions, PASS71_HF308_REQUIRED_ASSERTIONS)
    || oracle.testFileCount < PASS71_HF308_MECHANICAL_TEST_FILES.length
    || oracle.testCount < PASS71_HF308_REQUIRED_ASSERTIONS.length
    || oracle.passedCount !== oracle.testCount || oracle.failedCount !== 0
    || !ISO.test(oracle.startedAt ?? '') || !ISO.test(oracle.completedAt ?? '')
    || Date.parse(oracle.completedAt) < Date.parse(oracle.startedAt)
    || !SHA256.test(oracle.reportSha256 ?? '') ? ['mechanical-oracle'] : [];
}

const AUTHORITY_KEYS = Object.freeze([
  'contract', 'eventId', 'trajectoryId', 'impactId', 'phase', 'matchEpoch', 'aircraftId',
  'activationId', 'activationSequence', 'ownerId', 'ownerLifeId', 'controlSequence', 'ordinal',
  'socketSide', 'socketLocal', 'sourcePosition', 'sourceAttitude', 'launchPosition',
  'targetId', 'targetLifeId', 'targetKind', 'targetPosition', 'impactPosition',
  'launchAtMs', 'impactAtMs', 'atMs', 'ammoBefore', 'ammoAfter', 'cadenceMs',
]);

function authorityFailures(authority, prefix) {
  const failures = [];
  if (!exactKeys(authority, [
    'contract', 'capacity', 'cadenceMs', 'flightMs', 'events', 'seventhControlPacketAccepted',
    'seventhLaunchObserved', 'cooldownClickQueued', 'boundedEventCapacity',
  ])) return [`${prefix}:authority-shape`];
  if (authority.contract !== PASS71_HF308_POLICY.authorityContract
    || authority.capacity !== PASS71_HF308_POLICY.capacity
    || authority.cadenceMs !== PASS71_HF308_POLICY.cadenceMs
    || authority.flightMs !== PASS71_HF308_POLICY.flightMs
    || authority.seventhControlPacketAccepted !== false || authority.seventhLaunchObserved !== false
    || authority.cooldownClickQueued !== false || authority.boundedEventCapacity !== 12
    || !Array.isArray(authority.events) || authority.events.length !== 12) {
    return [`${prefix}:authority-policy`];
  }
  const launches = authority.events.filter((event) => event?.phase === 'launch');
  const impacts = authority.events.filter((event) => event?.phase === 'impact');
  if (launches.length !== 6 || impacts.length !== 6) return [`${prefix}:authority-event-count`];
  const identityKeys = [
    'contract', 'trajectoryId', 'impactId', 'matchEpoch', 'aircraftId', 'activationId',
    'activationSequence', 'ownerId', 'ownerLifeId', 'controlSequence', 'ordinal', 'socketSide',
    'socketLocal', 'sourcePosition', 'sourceAttitude', 'launchPosition', 'targetPosition',
    'targetId', 'targetLifeId', 'targetKind', 'impactPosition', 'launchAtMs', 'impactAtMs',
    'ammoBefore', 'ammoAfter', 'cadenceMs',
  ];
  for (let ordinal = 0; ordinal < 6; ordinal += 1) {
    const launch = launches.find((event) => event?.ordinal === ordinal);
    const impact = impacts.find((event) => event?.ordinal === ordinal);
    if (!exactKeys(launch, AUTHORITY_KEYS) || !exactKeys(impact, AUTHORITY_KEYS)) {
      failures.push(`${prefix}:authority-${ordinal}-shape`);
      continue;
    }
    if (launch.contract !== PASS71_HF308_POLICY.authorityContract || launch.phase !== 'launch'
      || impact.phase !== 'impact' || launch.eventId !== `${launch.trajectoryId}:launch`
      || launch.impactId !== `${launch.trajectoryId}:impact` || impact.eventId !== launch.impactId
      || !identityKeys.every((key) => same(launch[key], impact[key]))) {
      failures.push(`${prefix}:authority-${ordinal}-identity`);
    }
    const expectedSide = ordinal % 2 === 0 ? 'left' : 'right';
    if (launch.ordinal !== ordinal || launch.socketSide !== expectedSide
      || !same(launch.socketLocal, PASS71_HF308_POLICY.socketLocal[expectedSide])
      || !vec(launch.sourcePosition, 3) || !vec(launch.sourceAttitude, 3)
      || !vec(launch.launchPosition, 3) || !vec(launch.targetPosition, 3) || !vec(launch.impactPosition, 3)
      || !vecNear(launch.launchPosition, expectedLaunchPosition(launch), 1e-6)) {
      failures.push(`${prefix}:authority-${ordinal}-socket`);
    }
    if (!safeCounter(launch.matchEpoch) || !safeCounter(launch.activationSequence)
      || !safeCounter(launch.ownerLifeId) || !safeCounter(launch.controlSequence)
      || typeof launch.aircraftId !== 'string' || typeof launch.activationId !== 'string'
      || typeof launch.ownerId !== 'string' || launch.trajectoryId !== `${launch.activationId}:missile:${ordinal}`
      || typeof launch.targetId !== 'string' || launch.targetId.length === 0 || launch.targetId.endsWith(':terrain')
      || !safeCounter(launch.targetLifeId) || !['player', 'bot'].includes(launch.targetKind)
      || launch.ammoBefore !== 6 - ordinal || launch.ammoAfter !== 5 - ordinal
      || launch.cadenceMs !== 1_000 || launch.impactAtMs - launch.launchAtMs !== 780
      || launch.atMs !== launch.launchAtMs || impact.atMs !== launch.impactAtMs) {
      failures.push(`${prefix}:authority-${ordinal}-values`);
    }
    if (ordinal > 0) {
      const previous = launches.find((event) => event?.ordinal === ordinal - 1);
      if (!previous || launch.launchAtMs - previous.launchAtMs < 1_000) failures.push(`${prefix}:authority-cadence-${ordinal}`);
    }
  }
  if (new Set(launches.map((event) => event.trajectoryId)).size !== 6
    || new Set(launches.map((event) => event.controlSequence)).size !== 6
    || new Set(impacts.map((event) => event.impactId)).size !== 6) failures.push(`${prefix}:authority-unique-identities`);
  const first = launches.find((event) => event?.ordinal === 0);
  if (first && launches.some((event) => event.aircraftId !== first.aircraftId
    || event.activationId !== first.activationId || event.activationSequence !== first.activationSequence
    || event.ownerId !== first.ownerId || event.matchEpoch !== first.matchEpoch)) {
    failures.push(`${prefix}:authority-aircraft-activation-owner-epoch`);
  }
  return failures;
}

function frameIdentityFailures(visible, hidden, prefix) {
  const failures = [];
  if (!exactKeys(visible, [
    'contract', 'renderer', 'completionSemantics', 'simulationFrame', 'submissionSequence',
    'completedSequence', 'camera', 'viewport', 'trajectoryId', 'activationId', 'ordinal',
    'missile', 'authority', 'missileRootVisible',
  ]) || !exactKeys(hidden, [
    'contract', 'nonPublishable', 'renderer', 'completionSemantics', 'simulationFrame',
    'officialSubmissionSequence', 'officialCompletedSequence', 'submissionSequence',
    'completedSequence', 'camera', 'viewport', 'trajectoryId', 'activationId', 'ordinal',
    'missile', 'authority', 'missileRootHiddenDuringSubmission', 'missileRootRestored',
    'allOtherMissileRootVisibilitiesPreserved',
  ])) return [`${prefix}:frame-shape`];
  const shared = ['renderer', 'completionSemantics', 'simulationFrame', 'camera', 'viewport',
    'trajectoryId', 'activationId', 'ordinal', 'missile', 'authority'];
  if (visible.contract !== 'chopper-missile-frozen-visible-frame-v1'
    || hidden.contract !== 'chopper-missile-hidden-control-v1' || hidden.nonPublishable !== true
    || !shared.every((key) => same(visible[key], hidden[key]))
    || hidden.officialSubmissionSequence !== visible.submissionSequence
    || hidden.officialCompletedSequence !== visible.completedSequence
    || visible.missileRootVisible !== true || hidden.missileRootHiddenDuringSubmission !== true
    || hidden.missileRootRestored !== true || hidden.allOtherMissileRootVisibilitiesPreserved !== true) {
    failures.push(`${prefix}:same-frozen-frame`);
  }
  const semantics = visible.renderer === 'webgpu'
    ? 'submission-sequence-covered-by-completion-frontier' : 'synchronous-render-return';
  if (visible.completionSemantics !== semantics || hidden.completionSemantics !== semantics
    || !safeCounter(visible.simulationFrame) || !safeCounter(visible.submissionSequence)
    || !safeCounter(visible.completedSequence) || !safeCounter(hidden.submissionSequence)
    || !safeCounter(hidden.completedSequence)
    || (visible.renderer === 'webgpu' && (visible.completedSequence < visible.submissionSequence
      || hidden.submissionSequence <= visible.submissionSequence
      || hidden.completedSequence < hidden.submissionSequence))) failures.push(`${prefix}:completion-frontier`);
  const missile = visible.missile;
  if (!exactKeys(missile, [
    'trajectoryId', 'activationId', 'ordinal', 'rootName', 'poolSlot', 'visible', 'worldPosition',
    'launchPosition', 'targetPosition', 'progress', 'distanceFromTrajectoryM', 'projectedNdc', 'inFrustum',
  ]) || missile.trajectoryId !== visible.trajectoryId || missile.activationId !== visible.activationId
    || missile.ordinal !== visible.ordinal || missile.rootName !== 'pass70-chopper-missile-shell'
    || missile.visible !== true || !vec(missile.worldPosition, 3) || !vec(missile.launchPosition, 3)
    || !vec(missile.targetPosition, 3) || !finite(missile.progress, Number.EPSILON, 1 - Number.EPSILON)
    || !finite(missile.distanceFromTrajectoryM, 0, 0.001) || !vec(missile.projectedNdc, 3)
    || missile.inFrustum !== true || !same(missile.launchPosition, visible.authority?.launchPosition)
    || !vecNear(missile.targetPosition, [
      visible.authority?.impactPosition?.[0],
      visible.authority?.impactPosition?.[1] + 0.35,
      visible.authority?.impactPosition?.[2],
    ])) failures.push(`${prefix}:missile-frame`);
  if (vec(missile?.worldPosition, 3) && vec(missile?.launchPosition, 3)
    && vec(missile?.targetPosition, 3) && finite(missile?.progress, 0, 1)) {
    const expectedWorldPosition = missile.launchPosition.map((value, axis) => (
      value + (missile.targetPosition[axis] - value) * missile.progress
    ));
    const recomputedTrajectoryErrorM = Math.hypot(...missile.worldPosition.map((value, axis) => (
      value - expectedWorldPosition[axis]
    )));
    if (!vecNear(missile.worldPosition, expectedWorldPosition, 1e-6)
      || Math.abs(missile.distanceFromTrajectoryM - recomputedTrajectoryErrorM) > 1e-6) {
      failures.push(`${prefix}:missile-detached-trajectory`);
    }
  }
  return failures;
}

function rasterFailures(raster, visibleFrame, prefix) {
  const failures = [];
  if (!exactKeys(raster, [
    'contract', 'crop', 'projectedPixel', 'sourceSocketErrorM', 'trajectoryErrorM',
    'skySpawnObserved', 'detachedTrailObserved', 'unidentifiedShellCount',
    'otherRootVisibilityChanged', 'attachments', 'summary',
  ])) return [`${prefix}:raster-shape`];
  if (raster.contract !== PASS71_HF308_POLICY.rasterContract
    || !exactKeys(raster.crop, ['left', 'top', 'width', 'height'])
    || raster.crop.width !== PASS71_HF308_POLICY.rasterRoiWidth
    || raster.crop.height !== PASS71_HF308_POLICY.rasterRoiHeight
    || !safeCounter(raster.crop.left) || !safeCounter(raster.crop.top)
    || raster.crop.left + raster.crop.width > visibleFrame.viewport.cssWidth
    || raster.crop.top + raster.crop.height > visibleFrame.viewport.cssHeight
    || visibleFrame.viewport.devicePixelRatio !== 1
    || visibleFrame.viewport.canvasWidth !== visibleFrame.viewport.cssWidth
    || visibleFrame.viewport.canvasHeight !== visibleFrame.viewport.cssHeight) failures.push(`${prefix}:raster-crop`);
  if (!exactKeys(raster.projectedPixel, ['viewportX', 'viewportY', 'cropX', 'cropY'])
    || !finite(raster.projectedPixel.viewportX, 0, visibleFrame.viewport.cssWidth - 1)
    || !finite(raster.projectedPixel.viewportY, 0, visibleFrame.viewport.cssHeight - 1)
    || Math.abs(raster.projectedPixel.cropX - (raster.projectedPixel.viewportX - raster.crop.left)) > 1e-6
    || Math.abs(raster.projectedPixel.cropY - (raster.projectedPixel.viewportY - raster.crop.top)) > 1e-6
    || !finite(raster.projectedPixel.cropX, 0, raster.crop.width - 1)
    || !finite(raster.projectedPixel.cropY, 0, raster.crop.height - 1)) failures.push(`${prefix}:projected-pixel`);
  const ndc = visibleFrame.missile.projectedNdc;
  const expectedViewportX = (ndc[0] + 1) * visibleFrame.viewport.cssWidth / 2;
  const expectedViewportY = (1 - ndc[1]) * visibleFrame.viewport.cssHeight / 2;
  if (Math.abs(raster.projectedPixel.viewportX - expectedViewportX) > 1
    || Math.abs(raster.projectedPixel.viewportY - expectedViewportY) > 1) failures.push(`${prefix}:projected-ndc`);
  if (!finite(raster.sourceSocketErrorM, 0, 0.001) || !finite(raster.trajectoryErrorM, 0, 0.001)
    || raster.skySpawnObserved !== false || raster.detachedTrailObserved !== false
    || raster.unidentifiedShellCount !== 0 || raster.otherRootVisibilityChanged !== false) {
    failures.push(`${prefix}:sky-or-detached-trail`);
  }
  if (vec(visibleFrame.authority?.launchPosition, 3)
    && vec(visibleFrame.authority?.sourcePosition, 3)
    && vec(visibleFrame.authority?.sourceAttitude, 3)
    && vec(visibleFrame.authority?.socketLocal, 3)) {
    const socketPosition = expectedLaunchPosition(visibleFrame.authority);
    const recomputedSocketErrorM = Math.hypot(...socketPosition.map((value, axis) => (
      value - visibleFrame.authority.launchPosition[axis]
    )));
    if (Math.abs(raster.sourceSocketErrorM - recomputedSocketErrorM) > 1e-6
      || Math.abs(raster.trajectoryErrorM - visibleFrame.missile.distanceFromTrajectoryM) > 1e-6) {
      failures.push(`${prefix}:recomputed-socket-trajectory`);
    }
  }
  if (!Array.isArray(raster.attachments) || raster.attachments.length !== 2
    || !same(raster.attachments.map((entry) => entry?.key), ['visible', 'hidden-control'])) {
    return [...failures, `${prefix}:attachments-set`];
  }
  const decoded = [];
  for (const [index, attachment] of raster.attachments.entries()) {
    if (!exactKeys(attachment, ['key', 'mediaType', 'encoding', 'lossless', 'byteLength', 'sha256', 'pngBase64'])
      || attachment.mediaType !== 'image/png' || attachment.encoding !== 'base64'
      || attachment.lossless !== true || !safeCounter(attachment.byteLength, 1)
      || attachment.byteLength > PASS71_HF308_POLICY.maximumAttachmentBytes
      || !SHA256.test(attachment.sha256 ?? '')) {
      failures.push(`${prefix}:attachment:${index}:shape`);
      continue;
    }
    try {
      const bytes = decodeCanonicalBase64(attachment.pngBase64);
      if (!bytes || bytes.length !== attachment.byteLength || sha256(bytes) !== attachment.sha256) {
        failures.push(`${prefix}:attachment:${index}:bytes`);
        continue;
      }
      const png = pass71Hf308DecodeLosslessPng(bytes);
      if (png.width !== raster.crop.width || png.height !== raster.crop.height) {
        failures.push(`${prefix}:attachment:${index}:dimensions`);
        continue;
      }
      decoded[index] = png;
    } catch {
      failures.push(`${prefix}:attachment:${index}:decoded-png`);
    }
  }
  if (decoded.length === 2 && decoded[0] && decoded[1]) {
    const recomputed = pass71Hf308RasterDifference(decoded[0], decoded[1]);
    if (!same(raster.summary, recomputed)) failures.push(`${prefix}:recomputed-raster-summary`);
    const box = recomputed.boundingBox;
    if (!box || recomputed.changedPixelsAboveEight < 8
      || recomputed.changedPixelsAboveTwentyFour < 2
      || recomputed.materiallyChangedPixelRatio <= 0
      || recomputed.materiallyChangedPixelRatio > 0.08
      || recomputed.maximumPerceptualDifference <= 24) failures.push(`${prefix}:raster-attribution-strength`);
    if (box && (raster.projectedPixel.cropX < box.left - 4
      || raster.projectedPixel.cropX > box.right + 4
      || raster.projectedPixel.cropY < box.top - 4
      || raster.projectedPixel.cropY > box.bottom + 4)) failures.push(`${prefix}:raster-does-not-cover-shell`);
  }
  return failures;
}

function lifecycleFailures(lifecycle, prefix) {
  if (!exactKeys(lifecycle, ['trustedRmbEvents', 'exit', 'death', 'seventh', 'cleanup', 'rematch'])) {
    return [`${prefix}:lifecycle-shape`];
  }
  const failures = [];
  if (!safeCounter(lifecycle.trustedRmbEvents, 9)) failures.push(`${prefix}:trusted-rmb`);
  if (!exactKeys(lifecycle.exit, [
    'cooldownRequestSent', 'cooldownControlAccepted', 'pendingAfterRequest', 'possessionAfterExit',
    'ammoBefore', 'ammoAfter', 'waitedMs', 'additionalLaunches',
  ]) || lifecycle.exit.cooldownRequestSent !== true || lifecycle.exit.cooldownControlAccepted !== true
    || lifecycle.exit.pendingAfterRequest !== false || lifecycle.exit.possessionAfterExit !== null
    || lifecycle.exit.ammoBefore !== 5 || lifecycle.exit.ammoAfter !== 5
    || !finite(lifecycle.exit.waitedMs, 1_000) || lifecycle.exit.additionalLaunches !== 0) failures.push(`${prefix}:exit-cleanup`);
  if (!exactKeys(lifecycle.death, [
    'cooldownRequestSent', 'cooldownControlAccepted', 'pendingAfterRequest', 'possessionAfterDeath',
    'ownerLifeBefore', 'ownerLifeAfter', 'ammoBefore', 'ammoAfter', 'waitedMs', 'additionalLaunches',
  ]) || lifecycle.death.cooldownRequestSent !== true || lifecycle.death.cooldownControlAccepted !== true
    || lifecycle.death.pendingAfterRequest !== false || lifecycle.death.possessionAfterDeath !== null
    || !safeCounter(lifecycle.death.ownerLifeBefore) || lifecycle.death.ownerLifeAfter !== lifecycle.death.ownerLifeBefore + 1
    || lifecycle.death.ammoBefore !== 4 || lifecycle.death.ammoAfter !== 4
    || !finite(lifecycle.death.waitedMs, 1_000) || lifecycle.death.additionalLaunches !== 0) failures.push(`${prefix}:death-cleanup`);
  if (!exactKeys(lifecycle.seventh, ['trustedRmb', 'controlAccepted', 'ammoBefore', 'ammoAfter', 'additionalLaunches'])
    || lifecycle.seventh.trustedRmb !== true || lifecycle.seventh.controlAccepted !== false
    || lifecycle.seventh.ammoBefore !== 0 || lifecycle.seventh.ammoAfter !== 0
    || lifecycle.seventh.additionalLaunches !== 0) failures.push(`${prefix}:seventh-shot`);
  if (!exactKeys(lifecycle.cleanup, [
    'phase', 'hostEntityCount', 'hostAuthorityEventCount', 'hostImpactEventCount',
    'hostMissileShellCount', 'guestEntityCount', 'guestImpactEventCount', 'guestMissileShellCount',
  ]) || lifecycle.cleanup.phase !== 'ended' || lifecycle.cleanup.hostEntityCount !== 0
    || lifecycle.cleanup.hostAuthorityEventCount !== 0 || lifecycle.cleanup.hostImpactEventCount !== 0
    || lifecycle.cleanup.hostMissileShellCount !== 0) failures.push(`${prefix}:match-end-cleanup`);
  if (!exactKeys(lifecycle.rematch, [
    'priorEpoch', 'nextEpoch', 'phase', 'hostEntityCount', 'hostAuthorityEventCount',
    'hostImpactEventCount', 'hostMissileShellCount', 'guestEntityCount', 'guestImpactEventCount',
    'guestMissileShellCount',
  ]) || !safeCounter(lifecycle.rematch.priorEpoch)
    || lifecycle.rematch.nextEpoch <= lifecycle.rematch.priorEpoch || lifecycle.rematch.phase !== 'active'
    || lifecycle.rematch.hostEntityCount !== 0 || lifecycle.rematch.hostAuthorityEventCount !== 0
    || lifecycle.rematch.hostImpactEventCount !== 0 || lifecycle.rematch.hostMissileShellCount !== 0) {
    failures.push(`${prefix}:rematch-cleanup`);
  }
  return failures;
}

function guestFailures(guest, mode, authority, stage, prefix) {
  if (mode === 'offline') return guest === null ? [] : [`${prefix}:offline-guest-must-be-null`];
  if (!exactKeys(guest, [
    'topology', 'realTwoPeer', 'hostId', 'guestId', 'memberIds', 'memberCount', 'connectedCount',
    'hostRole', 'guestRole', 'guestControlAccepted', 'messageCount', 'eventKeys', 'hostEventKeys',
    'guestRecentEventKeys', 'hostAmmoAfter', 'guestAmmoAfter', 'replicaDrift', 'converged',
  ])) return [`${prefix}:guest-shape`];
  const publicKeys = authority.events.map((event) => (
    `${event.activationId}:${event.ordinal}:${event.phase === 'launch' ? 'drop' : 'impact'}`
  ));
  return guest.topology !== 'owned-private-two-peer' || guest.realTwoPeer !== true
    || guest.hostId !== stage.ownerId || typeof guest.guestId !== 'string' || guest.guestId === guest.hostId
    || !same(guest.memberIds, [guest.hostId, guest.guestId].sort()) || guest.memberCount !== 2
    || guest.connectedCount !== 2 || guest.hostRole !== 'host' || guest.guestRole !== 'client'
    || guest.guestControlAccepted !== false || !safeCounter(guest.messageCount, 12)
    || !same(guest.eventKeys, publicKeys) || !same(guest.hostEventKeys, publicKeys)
    || !same(guest.guestRecentEventKeys, publicKeys) || guest.hostAmmoAfter !== 0
    || guest.guestAmmoAfter !== 0 || guest.replicaDrift !== 0 || guest.converged !== true
    ? [`${prefix}:guest-convergence`] : [];
}

function scopeFailures(scope, expectedScope, sourceSha, browserIdentity) {
  const prefix = `${expectedScope.arena}/${expectedScope.renderer}/${expectedScope.mode}`;
  if (!exactKeys(scope, [
    'arena', 'renderer', 'mode', 'profile', 'topology', 'freshProcess', 'servedCandidate',
    'browser', 'runtime', 'stage', 'authority', 'attribution', 'lifecycle', 'guestTransport', 'faults',
  ])) return [`${prefix}:shape`];
  const failures = [];
  const expectedTopology = expectedScope.mode === 'hosted' ? 'owned-private-two-peer' : 'owned-offline-single-peer';
  if (scope.arena !== expectedScope.arena || scope.renderer !== expectedScope.renderer
    || scope.mode !== expectedScope.mode || scope.profile !== 'quality'
    || scope.topology !== expectedTopology || scope.freshProcess !== true) failures.push(`${prefix}:identity`);
  if (!exactKeys(scope.servedCandidate, [
    'schemaVersion', 'channel', 'releasePass', 'sourceSha', 'path', 'treeSha256', 'exactRootFileCount',
  ]) || scope.servedCandidate.schemaVersion !== 4 || scope.servedCandidate.channel !== 'the-big-one'
    || scope.servedCandidate.releasePass !== 'PASS 71' || scope.servedCandidate.sourceSha !== sourceSha
    || scope.servedCandidate.path !== 'channels/the-big-one' || !SHA256.test(scope.servedCandidate.treeSha256 ?? '')
    || !safeCounter(scope.servedCandidate.exactRootFileCount, 100)) failures.push(`${prefix}:served`);
  if (!exactKeys(scope.browser, ['version', 'userAgent', 'launchedExecutablePath'])
    || scope.browser.version !== browserIdentity.version
    || scope.browser.launchedExecutablePath !== browserIdentity.executablePath
    || !scope.browser.userAgent.includes(`Edg/${browserIdentity.version}`)) failures.push(`${prefix}:browser`);
  if (!exactKeys(scope.runtime, [
    'requestedBackend', 'actualBackend', 'initialized', 'adapterClass', 'deviceClass',
    'adapterLabel', 'softwareAdapter', 'deviceLost', 'uncapturedErrors', 'presentationStatus',
  ]) || scope.runtime.requestedBackend !== expectedScope.renderer
    || scope.runtime.actualBackend !== expectedScope.renderer || scope.runtime.initialized !== true
    || scope.runtime.softwareAdapter !== false || scope.runtime.deviceLost !== false
    || scope.runtime.uncapturedErrors !== 0
    || scope.runtime.presentationStatus !== (expectedScope.renderer === 'webgpu' ? 'healthy' : 'synchronous')) {
    failures.push(`${prefix}:runtime`);
  }
  if (!exactKeys(scope.stage, [
    'aircraftId', 'activationId', 'activationSequence', 'ownerId', 'ownerLifeId',
    'matchEpoch', 'targetAdmissions', 'controller', 'initialAmmo',
  ]) || ![scope.stage.aircraftId, scope.stage.activationId, scope.stage.ownerId]
    .every((value) => typeof value === 'string' && value.length > 0)
    || !safeCounter(scope.stage.activationSequence) || !safeCounter(scope.stage.ownerLifeId)
    || !safeCounter(scope.stage.matchEpoch)
    || scope.stage.controller !== 'owner-player' || scope.stage.initialAmmo !== 6) failures.push(`${prefix}:stage`);
  failures.push(...authorityFailures(scope.authority, prefix));
  const launches = scope.authority?.events?.filter((event) => event?.phase === 'launch') ?? [];
  const launch = launches.find((event) => event.ordinal === 0);
  if (launch && (launch.aircraftId !== scope.stage.aircraftId || launch.activationId !== scope.stage.activationId
    || launch.activationSequence !== scope.stage.activationSequence || launch.ownerId !== scope.stage.ownerId
    || launch.ownerLifeId !== scope.stage.ownerLifeId || launch.matchEpoch !== scope.stage.matchEpoch)) {
    failures.push(`${prefix}:stage-authority-identity`);
  }
  if (!Array.isArray(scope.stage.targetAdmissions) || scope.stage.targetAdmissions.length !== 6) {
    failures.push(`${prefix}:stage-target-admissions`);
  } else {
    for (let ordinal = 0; ordinal < 6; ordinal += 1) {
      const admission = scope.stage.targetAdmissions[ordinal];
      const admittedLaunch = launches.find((event) => event.ordinal === ordinal);
      const authorityKind = admission?.targetKind === 'training-dummy' ? 'bot' : admission?.targetKind;
      const blastDistanceM = admittedLaunch && vec(admission?.targetPosition, 3) && vec(admittedLaunch.impactPosition, 3)
        ? Math.hypot(...admission.targetPosition.map((value, axis) => value - admittedLaunch.impactPosition[axis]))
        : Number.POSITIVE_INFINITY;
      if (!exactKeys(admission, [
        'ordinal', 'targetId', 'targetLifeId', 'targetKind', 'targetPosition', 'lineOfSight',
      ]) || admission.ordinal !== ordinal || typeof admission.targetId !== 'string' || admission.targetId.length === 0
        || !safeCounter(admission.targetLifeId) || !['bot', 'training-dummy'].includes(admission.targetKind)
        || !vec(admission.targetPosition, 3) || admission.lineOfSight !== true || !admittedLaunch
        || admittedLaunch.targetId !== admission.targetId
        || admittedLaunch.targetLifeId !== admission.targetLifeId
        || admittedLaunch.targetKind !== authorityKind
        || !vecNear(admittedLaunch.targetPosition, admission.targetPosition)
        || !finite(blastDistanceM, 0, PASS71_HF308_POLICY.blastRadiusM)) {
        failures.push(`${prefix}:stage-target-${ordinal}`);
      }
    }
  }
  if (!exactKeys(scope.attribution, ['visibleFrame', 'hiddenControl', 'raster'])) failures.push(`${prefix}:attribution-shape`);
  else {
    failures.push(...frameIdentityFailures(scope.attribution.visibleFrame, scope.attribution.hiddenControl, prefix));
    failures.push(...rasterFailures(scope.attribution.raster, scope.attribution.visibleFrame, prefix));
    if (launch && !same(scope.attribution.visibleFrame.authority, launch)) failures.push(`${prefix}:attribution-authority`);
  }
  failures.push(...lifecycleFailures(scope.lifecycle, prefix));
  if (expectedScope.mode === 'hosted') {
    for (const snapshot of [scope.lifecycle.cleanup, scope.lifecycle.rematch]) {
      if (snapshot.guestEntityCount !== 0 || snapshot.guestImpactEventCount !== 0
        || snapshot.guestMissileShellCount !== 0) failures.push(`${prefix}:guest-lifecycle-cleanup`);
    }
  } else {
    for (const snapshot of [scope.lifecycle.cleanup, scope.lifecycle.rematch]) {
      if (snapshot.guestEntityCount !== null || snapshot.guestImpactEventCount !== null
        || snapshot.guestMissileShellCount !== null) failures.push(`${prefix}:offline-lifecycle-guest`);
    }
  }
  failures.push(...guestFailures(scope.guestTransport, expectedScope.mode, scope.authority, scope.stage, prefix));
  if (!Array.isArray(scope.faults) || scope.faults.length !== 0) failures.push(`${prefix}:faults`);
  return failures;
}

export function pass71Hf308EvidenceFailures(record, expected = {}) {
  const failures = [];
  if (!exactKeys(record, [
    'schemaVersion', 'evidenceId', 'kind', 'contract', 'feedbackId', 'status', 'closesFeedback',
    'closingAuthority', 'ownerSubjectiveApproval', 'startedAt', 'completedAt', 'source',
    'environment', 'browser', 'tooling', 'mechanicalOracle', 'scopes', 'faults', 'claims',
    'receiptSha256',
  ])) return ['record-shape'];
  for (const [key, value] of Object.entries(PASS71_HF308_CHOPPER_MISSILE_EVIDENCE)) {
    if (record[key] !== value) failures.push(`record-${key}`);
  }
  if (!ISO.test(record.startedAt ?? '') || !ISO.test(record.completedAt ?? '')
    || Date.parse(record.completedAt) < Date.parse(record.startedAt)) failures.push('record-time');
  const sourceSha = expected.sourceSha ?? record.source?.expectedSourceSha;
  const sourceTreeSha = expected.sourceTreeSha ?? record.source?.sourceTreeSha;
  if (!SHA40.test(sourceSha ?? '') || !SHA40.test(sourceTreeSha ?? '')) failures.push('expected-source');
  else failures.push(...sourceFailures(record.source, { sourceSha, sourceTreeSha }));
  if (!exactKeys(record.environment, ['machine', 'hostnameSha256', 'platform', 'arch'])
    || record.environment.machine !== 'dave-gaming-pc' || record.environment.platform !== 'win32'
    || record.environment.arch !== 'x64'
    || record.environment.hostnameSha256 !== PASS71_HF308_MACHINE_HOSTNAME_SHA256) failures.push('environment');
  failures.push(...browserFailures(record.browser));
  const tooling = expected.tooling ?? record.tooling;
  if (!same(record.tooling, tooling) || !Array.isArray(record.tooling)
    || record.tooling.length !== PASS71_HF308_TOOLING_PATHS.length
    || record.tooling.some((entry, index) => !exactKeys(entry, ['path', 'sha256'])
      || entry.path !== PASS71_HF308_TOOLING_PATHS[index] || !SHA256.test(entry.sha256 ?? ''))) failures.push('tooling');
  failures.push(...mechanicalFailures(record.mechanicalOracle));
  if (!Array.isArray(record.scopes) || record.scopes.length !== PASS71_HF308_SCOPES.length) failures.push('scope-count');
  else {
    const actualKeys = record.scopes.map(({ arena, renderer, mode }) => `${arena}/${renderer}/${mode}`);
    const expectedKeys = PASS71_HF308_SCOPES.map(({ arena, renderer, mode }) => `${arena}/${renderer}/${mode}`);
    if (!same(actualKeys, expectedKeys) || new Set(actualKeys).size !== actualKeys.length) failures.push('scope-exact-set-equality');
    record.scopes.forEach((scope, index) => failures.push(...scopeFailures(
      scope, PASS71_HF308_SCOPES[index], sourceSha, record.browser,
    )));
  }
  if (!Array.isArray(record.faults) || record.faults.length !== 0) failures.push('faults');
  if (!exactKeys(record.claims, [
    'allSupportEnabledArenas', 'webgl2AndWebgpu', 'offlineAndOwnedHosted',
    'exactIdentityBinding', 'canonicalSixAmmo', 'minimumCadence', 'exitDeathRematchCleanup',
    'guestReplicaConvergence', 'sameCompletedFrameRasterAttribution', 'noSkySpawn',
    'noDetachedTrail', 'signedInstalledEdge', 'exactStagedCandidate', 'ownerSubjectiveApproval',
  ]) || Object.entries(record.claims).some(([key, value]) => (
    key === 'ownerSubjectiveApproval' ? value !== 'not-claimed' : value !== true
  ))) failures.push('claims');
  if (!SHA256.test(record.receiptSha256 ?? '')
    || record.receiptSha256 !== pass71Hf308RecordSha256(record)) failures.push('receipt-sha256');
  if (Buffer.byteLength(JSON.stringify(record), 'utf8') > PASS71_HF308_POLICY.maximumEncodedRecordBytes) {
    failures.push('encoded-record-byte-cap');
  }
  return Object.freeze(failures);
}

export function createPass71Hf308EvidenceRegistryEntry() {
  return Object.freeze({
    descriptor: PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR,
    closesFeedback: true,
    ownerSubjectiveApproval: 'not-claimed',
    validate(record, context) {
      try {
        const sourceSha = context?.sourceSha;
        const tooling = context?.options?.pass71Hf308Tooling
          ?? pass71Hf308ToolingHashesAtSource(context?.repositoryRoot, sourceSha);
        const sourceTreeSha = context?.options?.pass71Hf308SourceTreeSha
          ?? execFileSync('git', ['-C', context?.repositoryRoot, 'rev-parse', `${sourceSha}^{tree}`], {
            encoding: 'utf8', windowsHide: true,
          }).trim();
        return pass71Hf308EvidenceFailures(record, { sourceSha, sourceTreeSha, tooling });
      } catch (error) {
        return Object.freeze([`hf308-validator:${error instanceof Error ? error.message : String(error)}`]);
      }
    },
  });
}

export const PASS71_HF308_CHOPPER_MISSILE_EVIDENCE_REGISTRY_ENTRY = createPass71Hf308EvidenceRegistryEntry();

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const chunk = Buffer.allocUnsafe(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBytes.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc32(Buffer.concat([typeBytes, data])), 8 + data.length);
  return chunk;
}

function fixturePng(width, height, pixel) {
  const scanlines = Buffer.allocUnsafe((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    scanlines[offset++] = 0;
    for (let x = 0; x < width; x += 1) {
      const colour = pixel(x, y);
      scanlines[offset++] = colour[0];
      scanlines[offset++] = colour[1];
      scanlines[offset++] = colour[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(scanlines)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function fixtureAttachment(key, bytes) {
  return {
    key,
    mediaType: 'image/png',
    encoding: 'base64',
    lossless: true,
    byteLength: bytes.length,
    sha256: sha256(bytes),
    pngBase64: bytes.toString('base64'),
  };
}

function fixtureTooling() {
  return PASS71_HF308_TOOLING_PATHS.map((path, index) => ({
    path,
    sha256: `${index.toString(16).padStart(2, '0')}${'a'.repeat(62)}`,
  }));
}

function fixtureAuthority(scopeOrdinal) {
  const matchEpoch = 7;
  const aircraftId = `ks-${matchEpoch}-chopper-1`;
  const activationId = `ks-activation-${matchEpoch}-1`;
  const ownerId = `owner-${scopeOrdinal}`;
  const events = [];
  for (let ordinal = 0; ordinal < 6; ordinal += 1) {
    const socketSide = ordinal % 2 === 0 ? 'left' : 'right';
    const socketLocal = [...PASS71_HF308_POLICY.socketLocal[socketSide]];
    const sourcePosition = [scopeOrdinal * 0.01, 18, 0];
    const sourceAttitude = [0, 0, 0];
    const launchPosition = sourcePosition.map((value, axis) => value + socketLocal[axis]);
    const impactPosition = [ordinal * 0.25, 0, -20 - ordinal];
    const targetPosition = [impactPosition[0], 1.15, impactPosition[2]];
    const launchAtMs = 1_000 + ordinal * 1_100;
    const impactAtMs = launchAtMs + 780;
    const trajectoryId = `${activationId}:missile:${ordinal}`;
    const common = {
      contract: PASS71_HF308_POLICY.authorityContract,
      trajectoryId,
      impactId: `${trajectoryId}:impact`,
      matchEpoch,
      aircraftId,
      activationId,
      activationSequence: 1,
      ownerId,
      ownerLifeId: ordinal < 2 ? 1 : 2,
      controlSequence: ordinal + 2,
      ordinal,
      socketSide,
      socketLocal,
      sourcePosition,
      sourceAttitude,
      launchPosition,
      targetId: `target-${scopeOrdinal}`,
      targetLifeId: 4,
      targetKind: 'bot',
      targetPosition,
      impactPosition,
      launchAtMs,
      impactAtMs,
      ammoBefore: 6 - ordinal,
      ammoAfter: 5 - ordinal,
      cadenceMs: 1_000,
    };
    events.push({ ...common, eventId: `${trajectoryId}:launch`, phase: 'launch', atMs: launchAtMs });
    events.push({ ...common, eventId: `${trajectoryId}:impact`, phase: 'impact', atMs: impactAtMs });
  }
  return {
    contract: PASS71_HF308_POLICY.authorityContract,
    capacity: 6,
    cadenceMs: 1_000,
    flightMs: 780,
    events,
    seventhControlPacketAccepted: false,
    seventhLaunchObserved: false,
    cooldownClickQueued: false,
    boundedEventCapacity: 12,
  };
}

function fixtureAttribution(authority, renderer) {
  const launch = authority.events[0];
  const width = PASS71_HF308_POLICY.rasterRoiWidth;
  const height = PASS71_HF308_POLICY.rasterRoiHeight;
  const centreX = width / 2;
  const centreY = height / 2;
  const hiddenPng = fixturePng(width, height, () => [24, 30, 38]);
  const visiblePng = fixturePng(width, height, (x, y) => (
    Math.abs(x - centreX) <= 3 && Math.abs(y - centreY) <= 2 ? [225, 196, 95] : [24, 30, 38]
  ));
  const visible = pass71Hf308DecodeLosslessPng(visiblePng);
  const hidden = pass71Hf308DecodeLosslessPng(hiddenPng);
  const missile = {
    trajectoryId: launch.trajectoryId,
    activationId: launch.activationId,
    ordinal: 0,
    rootName: 'pass70-chopper-missile-shell',
    poolSlot: 0,
    visible: true,
    worldPosition: launch.launchPosition.map((value, axis) => (
      value + ([launch.impactPosition[0], launch.impactPosition[1] + 0.35, launch.impactPosition[2]][axis] - value) * 0.4
    )),
    launchPosition: launch.launchPosition,
    targetPosition: [launch.impactPosition[0], launch.impactPosition[1] + 0.35, launch.impactPosition[2]],
    progress: 0.4,
    distanceFromTrajectoryM: 0,
    projectedNdc: [0, 0, 0.5],
    inFrustum: true,
  };
  const camera = {
    position: [0, 18, 0], quaternion: [0, 0, 0, 1], fov: 72, near: 0.05, far: 220, aspect: 16 / 9,
  };
  const viewport = {
    cssWidth: 1_280, cssHeight: 720, devicePixelRatio: 1, canvasWidth: 1_280, canvasHeight: 720,
  };
  const completionSemantics = renderer === 'webgpu'
    ? 'submission-sequence-covered-by-completion-frontier' : 'synchronous-render-return';
  const visibleFrame = {
    contract: 'chopper-missile-frozen-visible-frame-v1', renderer, completionSemantics,
    simulationFrame: 100, submissionSequence: 20, completedSequence: 20,
    camera, viewport, trajectoryId: launch.trajectoryId, activationId: launch.activationId,
    ordinal: 0, missile, authority: launch, missileRootVisible: true,
  };
  const hiddenControl = {
    contract: 'chopper-missile-hidden-control-v1', nonPublishable: true, renderer, completionSemantics,
    simulationFrame: 100, officialSubmissionSequence: 20, officialCompletedSequence: 20,
    submissionSequence: renderer === 'webgpu' ? 21 : 20, completedSequence: renderer === 'webgpu' ? 21 : 20,
    camera, viewport, trajectoryId: launch.trajectoryId, activationId: launch.activationId,
    ordinal: 0, missile, authority: launch, missileRootHiddenDuringSubmission: true,
    missileRootRestored: true, allOtherMissileRootVisibilitiesPreserved: true,
  };
  return {
    visibleFrame,
    hiddenControl,
    raster: {
      contract: PASS71_HF308_POLICY.rasterContract,
      crop: { left: 592, top: 312, width, height },
      projectedPixel: { viewportX: 640, viewportY: 360, cropX: centreX, cropY: centreY },
      sourceSocketErrorM: 0,
      trajectoryErrorM: 0,
      skySpawnObserved: false,
      detachedTrailObserved: false,
      unidentifiedShellCount: 0,
      otherRootVisibilityChanged: false,
      attachments: [fixtureAttachment('visible', visiblePng), fixtureAttachment('hidden-control', hiddenPng)],
      summary: pass71Hf308RasterDifference(visible, hidden),
    },
  };
}

function fixtureScope(scope, sourceSha, edgeVersion, edgeExecutablePath, ordinal) {
  const authority = fixtureAuthority(ordinal);
  const first = authority.events[0];
  const hostId = first.ownerId;
  const guestId = `guest-${ordinal}`;
  const publicKeys = authority.events.map((event) => (
    `${event.activationId}:${event.ordinal}:${event.phase === 'launch' ? 'drop' : 'impact'}`
  ));
  const hosted = scope.mode === 'hosted';
  const cleanup = {
    phase: 'ended', hostEntityCount: 0, hostAuthorityEventCount: 0, hostImpactEventCount: 0,
    hostMissileShellCount: 0, guestEntityCount: hosted ? 0 : null,
    guestImpactEventCount: hosted ? 0 : null, guestMissileShellCount: hosted ? 0 : null,
  };
  return {
    ...scope,
    profile: 'quality',
    topology: hosted ? 'owned-private-two-peer' : 'owned-offline-single-peer',
    freshProcess: true,
    servedCandidate: {
      schemaVersion: 4, channel: 'the-big-one', releasePass: 'PASS 71', sourceSha,
      path: 'channels/the-big-one', treeSha256: 'b'.repeat(64), exactRootFileCount: 500,
    },
    browser: {
      version: edgeVersion, userAgent: `Mozilla/5.0 Edg/${edgeVersion}`,
      launchedExecutablePath: edgeExecutablePath,
    },
    runtime: {
      requestedBackend: scope.renderer, actualBackend: scope.renderer, initialized: true,
      adapterClass: 'hardware', deviceClass: 'discrete-gpu', adapterLabel: 'candidate-adapter',
      softwareAdapter: false, deviceLost: false, uncapturedErrors: 0,
      presentationStatus: scope.renderer === 'webgpu' ? 'healthy' : 'synchronous',
    },
    stage: {
      aircraftId: first.aircraftId, activationId: first.activationId,
      activationSequence: first.activationSequence, ownerId: first.ownerId,
      ownerLifeId: first.ownerLifeId, matchEpoch: first.matchEpoch,
      targetAdmissions: authority.events.filter(({ phase }) => phase === 'launch').map((event) => ({
        ordinal: event.ordinal,
        targetId: event.targetId,
        targetLifeId: event.targetLifeId,
        targetKind: 'bot',
        targetPosition: event.targetPosition,
        lineOfSight: true,
      })),
      controller: 'owner-player', initialAmmo: 6,
    },
    authority,
    attribution: fixtureAttribution(authority, scope.renderer),
    lifecycle: {
      trustedRmbEvents: 9,
      exit: {
        cooldownRequestSent: true, cooldownControlAccepted: true, pendingAfterRequest: false,
        possessionAfterExit: null, ammoBefore: 5, ammoAfter: 5, waitedMs: 1_050, additionalLaunches: 0,
      },
      death: {
        cooldownRequestSent: true, cooldownControlAccepted: true, pendingAfterRequest: false,
        possessionAfterDeath: null, ownerLifeBefore: 1, ownerLifeAfter: 2,
        ammoBefore: 4, ammoAfter: 4, waitedMs: 1_950, additionalLaunches: 0,
      },
      seventh: { trustedRmb: true, controlAccepted: false, ammoBefore: 0, ammoAfter: 0, additionalLaunches: 0 },
      cleanup,
      rematch: {
        priorEpoch: first.matchEpoch, nextEpoch: first.matchEpoch + 1, phase: 'active',
        hostEntityCount: 0, hostAuthorityEventCount: 0, hostImpactEventCount: 0,
        hostMissileShellCount: 0, guestEntityCount: hosted ? 0 : null,
        guestImpactEventCount: hosted ? 0 : null, guestMissileShellCount: hosted ? 0 : null,
      },
    },
    guestTransport: hosted ? {
      topology: 'owned-private-two-peer', realTwoPeer: true, hostId, guestId,
      memberIds: [guestId, hostId].sort(), memberCount: 2, connectedCount: 2,
      hostRole: 'host', guestRole: 'client', guestControlAccepted: false,
      messageCount: 12, eventKeys: publicKeys, hostEventKeys: publicKeys,
      guestRecentEventKeys: publicKeys, hostAmmoAfter: 0, guestAmmoAfter: 0,
      replicaDrift: 0, converged: true,
    } : null,
    faults: [],
  };
}

export function createPass71Hf308EvidenceFixture(options = {}) {
  const sourceSha = options.sourceSha ?? '1'.repeat(40);
  const sourceTreeSha = options.sourceTreeSha ?? '2'.repeat(40);
  const tooling = options.tooling ?? fixtureTooling();
  const edgeVersion = options.edgeVersion ?? '140.0.3485.81';
  const edgeExecutablePath = options.edgeExecutablePath
    ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const startedAt = options.startedAt ?? '2026-08-13T20:00:00.000Z';
  const completedAt = options.completedAt ?? '2026-08-13T20:40:00.000Z';
  const record = {
    ...PASS71_HF308_CHOPPER_MISSILE_EVIDENCE,
    startedAt,
    completedAt,
    source: {
      expectedSourceSha: sourceSha, checkoutSourceSha: sourceSha, sourceTreeSha,
      servedSourceSha: sourceSha, endingCheckoutSourceSha: sourceSha,
      cleanBefore: true, cleanAfter: true, servedSchemaVersion: 4, servedReleasePass: 'PASS 71',
      servedChannel: 'the-big-one', servedPath: 'channels/the-big-one',
      servedTreeSha256: 'b'.repeat(64), servedFileCount: 500,
    },
    environment: {
      machine: 'dave-gaming-pc', hostnameSha256: PASS71_HF308_MACHINE_HOSTNAME_SHA256,
      platform: 'win32', arch: 'x64',
    },
    browser: {
      channel: 'msedge', installed: true, version: edgeVersion,
      userAgent: `Mozilla/5.0 Edg/${edgeVersion}`, executableName: 'msedge.exe',
      executableVersion: edgeVersion, executablePath: edgeExecutablePath,
      executableSha256: 'c'.repeat(64),
      installRoot: 'C:/Program Files (x86)/Microsoft/Edge/Application',
      signatureStatus: 'Valid', signer: 'Microsoft Corporation',
      isolation: 'fresh-process-and-profile-per-scope',
    },
    tooling,
    mechanicalOracle: {
      contract: 'atomic-acres/pass71-hf308-focused-vitest-oracle@1', status: 'passed',
      command: `vitest run ${PASS71_HF308_MECHANICAL_TEST_FILES.join(' ')}`,
      testFiles: [...PASS71_HF308_MECHANICAL_TEST_FILES],
      requiredAssertions: [...PASS71_HF308_REQUIRED_ASSERTIONS],
      testFileCount: PASS71_HF308_MECHANICAL_TEST_FILES.length,
      testCount: 80, passedCount: 80, failedCount: 0, startedAt, completedAt,
      reportSha256: 'd'.repeat(64),
    },
    scopes: PASS71_HF308_SCOPES.map((scope, ordinal) => fixtureScope(
      scope, sourceSha, edgeVersion, edgeExecutablePath, ordinal,
    )),
    faults: [],
    claims: {
      allSupportEnabledArenas: true, webgl2AndWebgpu: true, offlineAndOwnedHosted: true,
      exactIdentityBinding: true, canonicalSixAmmo: true, minimumCadence: true,
      exitDeathRematchCleanup: true, guestReplicaConvergence: true,
      sameCompletedFrameRasterAttribution: true, noSkySpawn: true, noDetachedTrail: true,
      signedInstalledEdge: true, exactStagedCandidate: true,
      ownerSubjectiveApproval: 'not-claimed',
    },
  };
  record.receiptSha256 = pass71Hf308RecordSha256(record);
  return record;
}
