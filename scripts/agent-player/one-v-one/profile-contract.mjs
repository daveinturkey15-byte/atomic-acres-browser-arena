import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function fingerprintProfile(profile) {
  return createHash('sha256').update(canonicalJson(profile)).digest('hex');
}

export async function loadPlayerProfile(path) {
  const profile = JSON.parse(await readFile(path, 'utf8'));
  const validation = validatePlayerProfile(profile);
  if (!validation.ok) throw new Error(`Invalid player profile: ${validation.errors.join('; ')}`);
  return profile;
}

const receiptValid = (receipt) => Boolean(receipt && /^[a-f0-9]{64}$/i.test(receipt.sha256 ?? ''));

export function validatePlayerProfile(profile) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(profile?.schemaVersion === 1, 'schemaVersion must be 1');
  require(profile?.kind === 'atomic-player-one-v-one-profile', 'kind must be atomic-player-one-v-one-profile');
  require(typeof profile?.profileId === 'string' && profile.profileId.length > 5, 'profileId is required');
  require(profile?.selected === false, 'new profile must remain non-selected before promotion');
  require(profile?.promoted === false, 'new profile must remain non-promoted before evidence');
  require(profile?.authority?.liveInputOwner === 'deterministic-rendered-pixel-javascript-only', 'deterministic rendered-pixel JavaScript must own live input');
  require(profile?.authority?.fireRequiresFreshWorldFrame === true, 'fresh rendered world frame must be required for fire');
  require(profile?.authority?.minimapMayAuthorizeFire === false, 'minimap must not authorize fire');
  require(profile?.authority?.predictionMayAuthorizeFire === false, 'prediction must not authorize fire');
  require(profile?.authority?.opticalFlowMayAuthorizeFire === false, 'optical flow must not authorize fire');
  require(profile?.render?.frameSequenceMustIncrease === true, 'frame sequence must increase');
  require(Number.isInteger(profile?.render?.workingWidth) && profile.render.workingWidth > 0, 'workingWidth must be positive');
  require(Number.isInteger(profile?.render?.workingHeight) && profile.render.workingHeight > 0, 'workingHeight must be positive');
  const thresholds = profile?.detector?.thresholds ?? {};
  require(thresholds.continuationConfidence < thresholds.initiationConfidence, 'continuation confidence must be below initiation confidence');
  require(thresholds.initiationConfidence <= thresholds.authorizationConfidence, 'authorization confidence must be at least initiation confidence');
  require(profile?.tracker?.confirmationHits >= 2, 'tracker requires at least two confirmation hits');
  require(profile?.tracker?.confirmationWindowFrames >= profile?.tracker?.confirmationHits, 'confirmation window must contain confirmation hits');
  require(profile?.tracker?.coastingMaximumFrames <= 5, 'coasting horizon must fail closed at five frames or fewer');
  require(profile?.servo?.integralGain === 0, 'integral control must remain disabled initially');
  require(profile?.servo?.postCorrectionFreshFrameRequired === true, 'post-correction fresh frame is required');
  require(profile?.fire?.alignedFreshFramesRequired >= 2, 'at least two fresh aligned frames are required');
  require(profile?.fire?.sameTrackRequired === true, 'fire must require the same track');
  require(profile?.fire?.reassociationAfterEveryShotRequired === true, 'post-shot reassociation is required');
  require(profile?.fire?.freshSemanticMeasurementRequired === true, 'fresh semantic measurement is required');
  const activation = profile?.activation ?? {};
  if (activation.automaticFireEnabled) {
    require(activation.liveEnabled === true, 'automatic fire requires liveEnabled');
    require(activation.aimInputEnabled === true, 'automatic fire requires aimInputEnabled');
  }
  if (activation.liveEnabled || activation.aimInputEnabled || activation.automaticFireEnabled) {
    require(receiptValid(activation.requiredBuildReceipt), 'requiredBuildReceipt with sha256 is required for activation');
    require(receiptValid(activation.requiredCalibrationReceipt), 'requiredCalibrationReceipt with sha256 is required for activation');
    require(receiptValid(activation.requiredDetectorReceipt), 'requiredDetectorReceipt with sha256 is required for activation');
    require(profile?.detector?.model?.status === 'verified', 'detector model must be verified for activation');
    require(typeof profile?.detector?.model?.path === 'string' && profile.detector.model.path.length > 0, 'detector model path is required for activation');
    require(/^[a-f0-9]{64}$/i.test(profile?.detector?.model?.sha256 ?? ''), 'detector model sha256 is required for activation');
  }
  return { ok: errors.length === 0, errors, fingerprint: errors.length ? null : fingerprintProfile(profile) };
}
