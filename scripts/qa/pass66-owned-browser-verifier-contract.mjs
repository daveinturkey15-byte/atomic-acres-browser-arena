import { multiplayerStabilityReceiptFailures } from './pass66-multiplayer-stability-contract.mjs';

const SHA40 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const OWNED_PEER_PATH = /^\/peerjs-[a-f0-9]{24}$/u;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function ownedPeerFailures(value, expected, label) {
  if (!record(value) || value.host !== '127.0.0.1'
    || value.port !== expected.peerPort || value.path !== expected.peerPath
    || value.localOnly !== true || !OWNED_PEER_PATH.test(value.path ?? '')) {
    return [`${label} owned PeerJS identity mismatch`];
  }
  return [];
}

export function stagedTopologyFailures(value, expectedSourceSha, expectedReleasePass = 'PASS 66') {
  const errors = [];
  if (!SHA40.test(expectedSourceSha ?? '')) errors.push('expected source SHA is invalid');
  if (!record(value)) return [...errors, 'topology receipt must be an object'];
  if (value.schemaVersion !== 4) errors.push('topology schemaVersion must be 4');
  if (value.sourceSha !== expectedSourceSha) errors.push('topology sourceSha mismatch');
  if (value.releasePass !== expectedReleasePass) errors.push(`topology releasePass must be ${expectedReleasePass}`);
  if (value.root?.kind !== 'chooser-only') errors.push('topology root must remain chooser-only');
  const candidate = value.channels?.experimental;
  if (!record(candidate)) return [...errors, 'topology experimental channel is missing'];
  if (candidate.schemaVersion !== 4 || candidate.channel !== 'the-big-one'
    || candidate.releasePass !== expectedReleasePass || candidate.sourceSha !== expectedSourceSha
    || candidate.path !== 'channels/the-big-one') {
    errors.push('topology experimental identity mismatch');
  }
  if (!Number.isSafeInteger(candidate.exactRootFileCount) || candidate.exactRootFileCount < 2) {
    errors.push('topology experimental file count is invalid');
  }
  if (!SHA256.test(candidate.treeSha256 ?? '')) errors.push('topology experimental tree digest is invalid');
  return errors;
}

export function servedCandidateFailures(value, expected) {
  if (!record(value)) return ['served candidate provenance must be an object'];
  const errors = [];
  if (value.schemaVersion !== 4 || value.channel !== 'the-big-one'
    || value.releasePass !== (expected.releasePass ?? 'PASS 66') || value.path !== 'channels/the-big-one') {
    errors.push('served candidate identity mismatch');
  }
  if (value.sourceSha !== expected.sourceSha) errors.push('served candidate sourceSha mismatch');
  if (value.treeSha256 !== expected.treeSha256) errors.push('served candidate tree digest mismatch');
  if (value.exactRootFileCount !== expected.exactRootFileCount) errors.push('served candidate file count mismatch');
  return errors;
}

export function ownedBrowserVerifierReceiptFailures(value, expected) {
  if (!record(value)) return ['owned browser verifier receipt must be an object'];
  const errors = [];
  const expectedSchemaVersion = expected.gate === 'multiplayer-stability' ? 3 : 1;
  if (value.schemaVersion !== expectedSchemaVersion) {
    errors.push(`receipt schemaVersion must be ${expectedSchemaVersion}`);
  }
  if (value.status !== 'PASS') errors.push('receipt status must be PASS');
  if (value.gate !== expected.gate) errors.push('receipt gate mismatch');
  if (value.sourceSha !== expected.sourceSha) errors.push('receipt sourceSha mismatch');
  errors.push(...servedCandidateFailures(value.servedCandidate, expected));

  if (expected.gate === 'installed-firefox') {
    if (value.browser !== 'installed-firefox') errors.push('Firefox receipt browser mismatch');
    if (!Array.isArray(value.cycles) || value.cycles.length !== 2
      || value.cycles[0]?.label !== 'cold' || value.cycles[1]?.label !== 'warm') {
      errors.push('Firefox receipt must contain cold then warm cycles');
    } else if (value.cycles.some((cycle) => cycle.backend !== 'webgl2'
      || typeof cycle.webglVersion !== 'string' || !cycle.webglVersion.includes('WebGL 2')
      || cycle.contextState !== 'ready' || cycle.gameStarted !== true || cycle.matchPhase !== 'active')) {
      errors.push('Firefox receipt contains an invalid admission cycle');
    }
  } else if (expected.gate === 'private-lobby') {
    if (value.schema !== 'atomic-acres/pass66-private-lobby@2') errors.push('private-lobby schema mismatch');
    errors.push(...ownedPeerFailures(value.ownedPeer, expected, 'private-lobby'));
    if (!Array.isArray(value.errors) || value.errors.length !== 0) errors.push('private-lobby browser errors must be empty');
    if (value.soloHostNoBots?.startActsAsReadyCommit !== true || value.soloHostNoBots?.active !== true
      || value.soloHostNoBots?.humans !== 1 || value.soloHostNoBots?.bots !== 0
      || value.soloHostWithBots?.startActsAsReadyCommit !== true || value.soloHostWithBots?.active !== true
      || value.soloHostWithBots?.humans !== 1 || value.soloHostWithBots?.bots !== 4) {
      errors.push('private-lobby solo host-start proof is incomplete');
    }
    if (value.rejoinRecovered !== true || value.rejoinIdentityPreserved !== true
      || value.sixPlayersAdmitted !== true || value.allReady !== true) {
      errors.push('private-lobby convergence proof is incomplete');
    }
  } else if (expected.gate === 'pass61-netcode') {
    if (value.schema !== 'atomic-acres/pass61-authoritative-netcode@1') errors.push('Pass 61 netcode schema mismatch');
    errors.push(...ownedPeerFailures(value.ownedPeer, expected, 'Pass 61 netcode'));
    if (!Array.isArray(value.errors) || value.errors.length !== 0) errors.push('Pass 61 netcode browser errors must be empty');
    if (value.hostAccepted !== 7 || value.guestCreated !== 7 || value.guestConfirmed !== 7
      || !finite(value.hostHealthAfter) || value.hostHealthAfter >= 100) {
      errors.push('Pass 61 netcode authoritative damage counts are incomplete');
    }
    if (value.exactAgreement !== true || value.resolverMatchesReportedRewind !== true
      || value.delayFitsRewindBudget !== true || value.transportTimingCaptured !== true) {
      errors.push('Pass 61 netcode timing and agreement proof is incomplete');
    }
    if (!Array.isArray(value.resolutionTraces) || value.resolutionTraces.length !== 7) {
      errors.push('Pass 61 netcode must retain exactly seven resolution traces');
    }
  } else if (expected.gate === 'support-operate-prompt') {
    if (value.browser !== 'chromium' || typeof value.browserVersion !== 'string' || value.browserVersion.length < 3) {
      errors.push('support prompt browser identity is invalid');
    }
    if (value.rendererPaused !== true) errors.push('support prompt renderer must remain paused for paired evidence');
    if (!Array.isArray(value.errors) || value.errors.length !== 0) errors.push('support prompt browser errors must be empty');
    if (!record(value.sourceState) || value.sourceState.startingSha !== expected.sourceSha
      || value.sourceState.endingSha !== expected.sourceSha
      || value.sourceState.cleanBefore !== true || value.sourceState.cleanAfter !== true) {
      errors.push('support prompt clean source before/after proof is incomplete');
    }
    const expectedSupportCases = ['chopper', 'piloted-drone'];
    const expectedViewports = [
      ['700x720', 700, 720],
      ['960x540', 960, 540],
      ['1280x720', 1_280, 720],
      ['2560x1440', 2_560, 1_440],
      ['3840x2160', 3_840, 2_160],
    ];
    const expectedMatrix = expectedSupportCases.flatMap((supportId) => expectedViewports.map((viewport) => [supportId, ...viewport]));
    if (value.singleExistingSurface !== true
      || JSON.stringify(value.supportCases) !== JSON.stringify(expectedSupportCases)) {
      errors.push('support prompt must use one existing top-panel surface for Chopper and Piloted Drone');
    }
    if (!Array.isArray(value.viewports) || value.viewports.length !== expectedMatrix.length) {
      errors.push('support prompt viewport evidence matrix is incomplete');
    } else {
      for (const [index, [supportId, label, width, height]] of expectedMatrix.entries()) {
        const viewport = value.viewports[index];
        const action = viewport?.actionBounds;
        const info = viewport?.infoBounds;
        const identity = `${supportId}/${label}`;
        if (viewport?.supportId !== supportId || viewport?.label !== label
          || viewport?.width !== width || viewport?.height !== height) {
          errors.push(`support prompt viewport ${identity} identity mismatch`);
          continue;
        }
        if (!record(info) || ![info.left, info.top, info.right, info.bottom, info.width, info.height].every(finite)
          || info.left < 0 || info.top < 0 || info.right > width || info.bottom > height
          || info.width <= 0 || info.height <= 0) {
          errors.push(`support prompt viewport ${identity} information bounds escape the viewport`);
        }
        if (!record(action) || ![action.left, action.top, action.right, action.bottom, action.width, action.height].every(finite)
          || action.width <= 0 || action.height <= 0 || action.height > 64
          || !record(info) || action.left < info.left || action.top < info.top
          || action.right > info.right || action.bottom > info.bottom) {
          errors.push(`support prompt viewport ${identity} is not compact and contained inside the information panel`);
        }
        if (!finite(viewport.actionFontSize) || viewport.actionFontSize < 10 || viewport.actionFontSize > 13
          || viewport.actionCount !== 1 || viewport.legacyStandalonePromptCount !== 0
          || viewport.awaitingOperation !== 'true' || !finite(viewport.horizontalOverflow)
          || viewport.horizontalOverflow > 1
          || !Array.isArray(viewport.overlappingHudSurfaces) || viewport.overlappingHudSurfaces.length !== 0
          || typeof viewport.actionText !== 'string'
          || !viewport.actionText.includes(supportId === 'chopper' ? 'CHOPPER READY' : 'DRONE READY')
          || !viewport.actionText.includes(supportId === 'chopper' ? 'AGAIN TO OPERATE' : 'AGAIN TO PILOT')) {
          errors.push(`support prompt viewport ${identity} does not prove one readable highlighted action surface`);
        }
        if (!Number.isSafeInteger(viewport.actionChangedPixelCount)
          || !Number.isSafeInteger(viewport.hiddenBackgroundDriftPixelCount)
          || viewport.hiddenBackgroundDriftPixelCount < 0 || viewport.hiddenBackgroundDriftPixelCount > 32
          || viewport.actionChangedPixelCount <= Math.max(500, viewport.hiddenBackgroundDriftPixelCount * 50)) {
          errors.push(`support prompt viewport ${identity} deterministic pixel proof is invalid`);
        }
        for (const kind of ['full', 'visible', 'hidden']) {
          const artifact = viewport.artifacts?.[kind];
          if (artifact?.path !== `artifacts/pass66/support-operate-prompt/${supportId}-${label}-${kind}.png`
            || !SHA256.test(artifact?.sha256 ?? '')) {
            errors.push(`support prompt viewport ${identity} ${kind} artifact is invalid`);
          }
        }
      }
    }
  } else if (expected.gate === 'multiplayer-stability') {
    errors.push(...multiplayerStabilityReceiptFailures(value, expected));
  } else {
    errors.push(`unsupported owned browser verifier gate ${String(expected.gate)}`);
  }
  return errors;
}

export function assertStagedTopology(value, expectedSourceSha, expectedReleasePass = 'PASS 66') {
  const failures = stagedTopologyFailures(value, expectedSourceSha, expectedReleasePass);
  if (failures.length > 0) throw new Error(`Invalid staged ${expectedReleasePass} topology: ${failures.join('; ')}`);
  return value.channels.experimental;
}

export function assertOwnedBrowserVerifierReceipt(value, expected) {
  const failures = ownedBrowserVerifierReceiptFailures(value, expected);
  if (failures.length > 0) throw new Error(`Invalid Pass 66 ${expected.gate} receipt: ${failures.join('; ')}`);
}
