import * as THREE from 'three';
import './style.css';
import { AtomicSignalPass, atomicSignalBypassReason, isSoftwareWebGLRenderer } from './atomic-signal';
import { AdaptiveQualityController, adaptiveShadowsEnabled, classifyDisplayFrameMs } from './adaptive-quality';
import { GraphicsRefinementSystem, graphicsEffectsBudget, type GraphicsEffectsBudget } from './graphics-refinement';
import { AtmosphereSystem, atmosphereFogRange } from './atmosphere-system';
import { WaterSystem } from './water-system';
import { batchStaticMeshes, buildOperator, buildWeaponModel, deathOperator, fireOperator, meleeOperator, optimizeAttachedWeapon, poseOperator, reactOperator, resetOperator, setOperatorWeapon } from './art-kit';
import { GUN_RANGE_FIRING_LINE_Z, applyAdditionalMapPresentationProfile, applyRustworksPresentationProfile, buildGunRange, buildRustworks1v1, buildSkylineTerminal, updateGunRangePresentation } from './additional-maps';
import {
  BOT_REACTION_DELAY,
  BOT_GRENADE_COOLDOWN_MS,
  assignBotWeapons,
  advanceSpawnFlipHysteresis,
  botAimJitter,
  botCanFireWhileProtected,
  botWeaponBurstSize,
  botWeaponFireInterval,
  chooseBotIntent,
  chooseTacticalWaypoint,
  createSpawnFlipHysteresis,
  operatorYawToward,
  respawnBotState,
  shouldBotThrowGrenade,
  shouldFlipSpawnSide,
  type SpawnFlipHysteresis,
} from './bot-ai';
import { classifyFootstepSurface, classifyImpactSurface, nearMissStrength, type ImpactSurface } from './combat-feedback';
import { CHANGELOG, lastUpdatedButtonLabel, latestChangelogEntry, formatChangelogTimestampDetail } from './changelog';
import { copyTextWithFallback } from './clipboard';
import { FIELD_KITS, FIELD_KIT_STORAGE_KEY, deployedWeapons, fieldKitById, parseFieldKitSelection, serializeFieldKitSelection, type FieldKitId } from './loadout';
import { DHV_VALUES, applyDhvIncomingDamage, applyDhvWeaponOutgoingDamage, dhvLabel, isDhv, type Dhv } from './handicap';
import { GUN_RANGE_WEAPON_STATIONS, nearestGunRangeWeaponStation, type GunRangeWeaponStation } from './gun-range-armory';
import { ArenaAudio } from './audio';
import { clampPointToBounds, damp, isBlocked, pointInsideBounds, resolveHorizontalMove, segmentIntersectsBox, shortestAngleDelta, sweepSphereAgainstBoxes } from './collision';
import {
  applyPenetrationDamage,
  ballisticImpactSurface,
  resolveBallisticHitscanAgainstTarget,
  traceBallisticPath,
  type BallisticSurface,
  type BallisticTrace,
} from './ballistics';
import {
  BOT_DAMAGE_MULTIPLIER,
  GRENADE_RADIUS,
  MATCH_WARMUP_MS,
  SIMULATION_HZ,
  WEAPONS,
  advanceMatch,
  advanceFreeForAllMatch,
  applyRadialDeadzone,
  beginReload,
  cancelReload,
  completeReload as completeReloadState,
  computeDamage,
  computeFallDamage,
  computeRecoilImpulse,
  computeSpread,
  botScaledDamage,
  admittedPlayerDamage,
  createMatch,
  grenadeDamage,
  integrateGamepadLookRate,
  integrateHorizontalVelocity,
  meleeStrike,
  mouseSensitivityMultiplier,
  movementProfile,
  nextStance,
  recoverRecoil,
  recoverRecoilImpulse,
  reloadProgress as gameplayReloadProgress,
  sampleWeaponPellet,
  sprintEligible,
  type HitZone,
  type MatchState,
  type ReloadState,
  type Stance,
} from './gameplay';
import { ArenaMap, buildArena } from './map';
import { ARENA_SELECTIONS, activeSoloBotTarget, arenaSelection, type ArenaId, type ArenaSelection } from './map-selection';
import { headingDegrees, minimapLandmarkFootprint, minimapLandmarkLabel, northMarkerPosition, physicalCoverMinimapKind, playerFacingGeometry, playerUpRotationRadians, playerUpScaleX, shouldRevealEnemy, tacticalMapToWorld, worldToMinimap, worldToTacticalMap, type MinimapLandmarkKind } from './minimap';
import { authoredElevationAt, authoredVerticalRouteTarget, type ArenaVerticalNavigation } from './vertical-navigation';
import { sourceScreenAngle } from './directional-hud';
import { hitProxyZoneCentre } from './hit-proxies';
import { arenaZoneLabel, classifyArenaZone } from './arena-storytelling';
import { routeIdentityTelemetry } from './world-identity';
import { damageNumberPresentation, roundStatSummary } from './player-feedback';
import { LEADERBOARD_SEASON } from '../shared/leaderboard-season';
import { createWorldIdentityPresentation, setWorldIdentityHouseShellPresentation } from './world-identity-presentation';
import { matchPresentationAt, respawnPresentation } from './match-presentation';
import { tuneMaterialsForAtomicSignal, type AtomicSignalMaterialAudit } from './material-compatibility';
import { addNeighbourhoodLife, loadArenaArt, updateArenaArt } from './environment-assets';
import { blenderArenaTelemetry, loadBlenderArena, markBlenderArenaFallback, proceduralArenaRootVisible } from './blender-environment';
import { loadRustworksBlenderTower, markRustworksBlenderFallback, rustworksBlenderTelemetry, setRustworksProceduralPresentationVisible } from './rustworks-blender';
import {
  createRustworksQualityLights,
  enhanceRustworksQualityMaterials,
  ensureRustworksStarfield,
  rustworksLightingTint,
  rustworksQualityTelemetry,
  setRustworksQualityPresentationActive,
} from './rustworks-quality';
import { arenaLightingProfile } from './blender-lighting';
import { ImpactPresentation } from './impact-presentation';
import { advanceFootsteps, strideLength, type FootstepAccumulator } from './footsteps';
import { FramePacingSampler } from './frame-pacing';
import { GrenadeExplosionPresentation } from './grenade-explosion-presentation';
import { SupportExplosionPresentation } from './support-explosion-presentation';
import { GrassSystem } from './grass-system';
import {
  advanceRangeScore,
  formatRangeAccuracy,
  GUN_RANGE_ROUND_MS,
  hasUnlimitedRangeAmmo,
  isGunRange,
  rangeAccuracyPercent,
  rangeGrenadesAllowed,
  reloadSupply,
  reserveAfterCompletedReload,
  reserveHudValue,
} from './gun-range-rules';
import {
  createGunRangeScoreEntry,
  loadGunRangeScores,
  mergeGunRangeScores,
  personalBestGunRange,
  saveGunRangeScores,
  type GunRangeScoreEntry,
} from './gun-range-leaderboard';
import {
  OVERDRIVE_DAMAGE_MULTIPLIER,
  OVERDRIVE_DURATION_MS,
  OVERDRIVE_PICKUP_RADIUS,
  OVERDRIVE_POSITION,
  OVERDRIVE_SPAWN_INTERVAL_MS,
  advanceOverdrive,
  claimOverdrive,
  createOverdriveState,
  overdriveDamageMultiplier,
  overdriveRemainingMs,
  transferOverdriveOnElimination,
  type OverdriveState,
} from './overdrive';
import {
  HUNTER_SWARM_BLAST_RADIUS,
  HUNTER_SWARM_COUNT,
  NUKE_WARNING_MS,
  SCOUT_SWEEP_DURATION_MS,
  TRI_PASS_BLAST_RADIUS,
  TRI_PASS_MAX_DAMAGE,
  assignHunterSwarmTargets,
  consumeFieldSupport,
  createFieldSupportState,
  createTriPassTargeting,
  cycleFieldSupportSelection,
  hunterSwarmDamage,
  nukeDamageForTarget,
  recordSupportDeath,
  recordSupportElimination,
  remoteExplosiveHitMaximumDistance,
  registerTriPassTarget,
  scoutSweepPulseVisible,
  selectTriPassHostiles,
  triPassSchedule,
  type FieldSupportId,
  type TriPassTargeting,
} from './field-support';
import { createGrenadePresentation, disposeGrenadePresentation, grenadePresentationTelemetry, loadGrenadePresentation } from './grenade-presentation';
import {
  DEATH_DROP_INTERACTION_RANGE,
  DEATH_DROP_SCAVENGE_RANGE,
  MAX_DEATH_DROPS,
  consumeDeathDropWeapon,
  createDeathDrop,
  deathDropAmmoAvailable,
  deathDropAvailable,
  deathDropWeaponAvailable,
  nearestDeathDrop,
  nearestScavengeDeathDrop,
  pruneDeathDrops,
  scavengeDeathDrop,
  type DeathDrop,
} from './death-drops';
import { DeathDropPresentationPool } from './death-drop-presentation';
import { ArenaNetwork } from './network';
import {
  HIGH_SCORE_STORAGE_KEY,
  HIGH_SCORE_SCHEMA_VERSION,
  MAX_MATCH_KILLS,
  immediateStreakEntry,
  leaderboardNameKey,
  loadHighScores,
  mergeHighScores,
  normalizeRequiredPlayerName,
  peerOwnedHighScores,
  personalBest,
  saveHighScores,
  type HighScoreEntry,
} from './high-scores';
import {
  GLOBAL_LEADERBOARD_ENDPOINT,
  fetchGlobalLeaderboard,
  leaderboardInstallId,
  submitGlobalStreak,
} from './global-leaderboard';
import { MAX_ACTIVE_TEAM_PINGS, TEAM_PING_LIFETIME_MS, admitTeamPing, createTeamPingAdmissionState, type TeamPingAdmissionState } from './social-ping';
import {
  SNAPSHOT_INTERPOLATION_DELAY_MS,
  SnapshotInterpolationBuffer,
  createSnapshotRateState,
  snapshotIntervalMs,
  updateSnapshotRate,
  shortestYaw,
  type SnapshotRateState,
} from './network-sync';
import {
  createHostTimeMapping,
  hostTimeDiagnostics,
  hostTimeToGuestMono,
  monotonicMappedHostNow,
  observeHostClock,
  type HostTimeMapping,
} from './host-time';
import {
  CLOCK_PING_INTERVAL_MS,
  DEFAULT_PRIVATE_MATCH_CONFIG,
  LOBBY_START_LEAD_MS,
  REJOIN_GRACE_MS,
  rejoinReservationExpired,
  balanceLobbyTeams,
  canHostStart,
  emptyPlayerScore,
  freeForAllLeaders,
  latencyQuality,
  playersAreHostile,
  recordPlayerDamage,
  teamTotals,
  type LobbyMember,
  type LobbySnapshot,
  type MatchMode,
  type PlayerScore,
  type PrivateMatchConfig,
} from './private-match';
import { admitRemoteShot, createRemoteShotAdmissionState, type RemoteShotAdmissionState } from './remote-shot-admission';
import { admitRemoteMelee, createRemoteMeleeAdmissionState, meleeActionHitsPoint, type RemoteMeleeAdmissionState } from './remote-melee-admission';
import { admitRemoteSnapshotMovement, remoteCanClaimTimedPickup } from './remote-movement-admission';
import { admitRemoteBaseDamage, deriveAuthoritativeShotOutcomes, deriveRemoteShotBaseDamage, maximumRemoteExplosiveBaseDamage, resolveRemotePoweredDamage } from './remote-hit-admission';
import {
  admitAuthoritativeShot,
  createAuthoritativeShotAdmissionState,
  validateShotOrigin,
  type AuthoritativeShotAdmissionState,
} from './authoritative-shot';
import { admitRemoteSupportActivation, admitRemoteSupportHit, createRemoteSupportAuthorityState, recordRemoteSupportDeath, recordRemoteSupportElimination, type RemoteSupportAuthorityState } from './remote-support-authority';
import { admitRemoteGrenadeExplosion, admitRemoteGrenadeHit, admitRemoteGrenadeThrow, createRemoteGrenadeAuthorityState, replenishRemoteGrenadeAuthorityState, resetRemoteGrenadeAuthorityState, type RemoteGrenadeAuthorityState } from './remote-grenade-admission';
import { admitAuthoritativeRemoteRespawn, applyAuthoritativeRemoteDamage, createRemoteHealthAuthorityState, type RemoteHealthAuthorityState } from './remote-health-authority';
import { isKillstreakEligible, killCauseFromHit, type KillCause } from './kill-provenance';
import { recordCombatantPose, rewindCombatantPose, rewindCombatantPoseStrict, type CombatantPoseSample } from './lag-compensation';
import { appendClientRuntimeLog, readClientRuntimeLog } from './client-runtime-log';
import { isHostedBotCount, type HostedBotCount, type HostedBotSnapshot } from './hosted-bots';
import { DAMAGE_FEED_LIMIT, DAMAGE_FEED_VISIBLE_MS, EVENT_FEED_LIMIT, accessibleFeedLabel, feedDestination } from './hud-feed';
import { MatchDiagnostics, type DiagnosticAdmission, type MatchDiagnosticInput } from './match-diagnostics';
import {
  createHumanMatchReport,
  type HumanDamageEventInput,
  type MatchParticipantReportInput,
} from './match-report';
import { scoreSpawnCandidates, type SpawnMode } from './spawn-safety';
import { admitCombatTiming, createPeerTimingState, shouldRetainRemoteCombatAuthority, updatePeerTiming, type CombatTiming, type PeerTimingState } from './network-fairness';
import { CharacterPhysics, worldBoundaryColliders } from './physics';
import { TracerPool } from './tracer-pool';
import { loadRiggedOperatorAsset, riggedOperatorAssetReady, riggedOperatorTelemetry } from './operator-model';
import { loadImportedWeaponAssets } from './weapon-model';
import { WeaponPresentation } from './weapon-presentation';
import { magnifiedFovDegrees, viewmodelSurfaceRetreat } from './weapon-presentation-state';
import { selectPlayableWindowApproach, windowBreakPathBlocked } from './window-breaks';
import { RENDER_PROFILE_STORAGE_KEY, renderProfileConfig, resolveRenderProfile, type RenderProfile } from './render-profile';
import { configureRuntimeRandom, gameplayRandom, presentationRandom, protocolRandom, runtimeRandomTelemetry, runtimeSeed } from './runtime-random';
import { admitStaticShadowDynamicRefresh } from './shadow-refresh';
import {
  BotDamageMessage,
  BotStateMessage,
  DeathMessage,
  ExplosiveSource,
  GameMessage,
  HitMessage,
  LobbyBalanceMessage,
  LobbyConfigMessage,
  LobbyJoinMessage,
  LobbyHandicapMessage,
  LobbyReadyMessage,
  LobbyStartMessage,
  LobbyStateMessage,
  LobbyTeamMessage,
  MatchScoreMessage,
  RangeScoreClaimMessage,
  MeleeMessage,
  OffensiveSupportSource,
  OverdriveClaimMessage,
  OverdriveStateMessage,
  PlayerSnapshot,
  PickupMessage,
  PRIMARY_WEAPON_IDS,
  PrimaryWeaponId,
  ShotMessage,
  ShotRequestMessage,
  ShotResultMessage,
  StateMessage,
  MULTIPLAYER_PROTOCOL_VERSION,
  Team,
  TeamPingKind,
  TeamPingMessage,
  WeaponId,
  WindowBreakMessage,
} from './protocol';

configureRuntimeRandom(runtimeSeed(window.location.search));

function clientSessionStorage(): Storage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

window.addEventListener('error', (event) => {
  appendClientRuntimeLog({
    kind: 'error', message: event.message || 'unknown error', source: event.filename,
    line: event.lineno, column: event.colno, stack: event.error?.stack,
  }, clientSessionStorage());
  console.error('[Atomic Acres runtime error]', event.message || 'unknown error', event.error?.stack || '');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? `${event.reason.message}\n${event.reason.stack ?? ''}` : String(event.reason);
  appendClientRuntimeLog({
    kind: 'unhandled-rejection',
    message: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined,
  }, clientSessionStorage());
  console.error('[Atomic Acres unhandled rejection]', reason);
});

type RemotePlayer = {
  root: THREE.Group;
  snapshot: PlayerSnapshot;
  target: THREE.Vector3;
  targetYaw: number;
  lastSeen: number;
  claimEligibleAt: number;
  claimRequiresCoreExit: boolean;
  positionHistory: CombatantPoseSample[];
  interpolation: SnapshotInterpolationBuffer<PlayerSnapshot>;
  renderedHostTimeMs: number;
  renderedWorldAgeMs: number;
  continuity: number;
  feedbackSequenceGaps: number;
  feedbackReordered: number;
  lastFeedbackAt: number;
};

type AdmittedRemoteShot = {
  message: ShotMessage;
  receivedAt: number;
  targets: Set<string>;
};

type AdmittedRemoteMelee = {
  message: MeleeMessage;
  receivedAt: number;
  targets: Set<string>;
};

type AdmittedRemoteExplosion = {
  source: ExplosiveSource;
  origin: THREE.Vector3;
  receivedAt: number;
  targets: Set<string>;
};

type BotPlayer = {
  id: string;
  name: string;
  team: Team;
  root: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  hp: number;
  alive: boolean;
  kills: number;
  deaths: number;
  lastShotAt: number;
  lastSightAt: number;
  hasLineOfSight: boolean;
  sightStartedAt: number;
  burstShots: number;
  nextDecisionAt: number;
  strafeSign: -1 | 1;
  invulnerableUntil: number;
  respawnAt: number;
  deathVisibleUntil: number;
  waypoint: number;
  blockedSince: number;
  weapon: PrimaryWeaponId;
  nextGrenadeAt: number;
  grenadeActive: boolean;
  positionHistory: CombatantPoseSample[];
  continuity: number;
};

type GrenadeEntity = {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  explodeAt: number;
  lastBounceAt: number;
  actionNonce: number;
  ownerKind: 'player' | 'bot' | 'remote';
  ownerId: string;
};

type YardhawkEntity = {
  root: THREE.Group;
  targetId: string;
  phase: 'thrown' | 'homing';
  velocity: THREE.Vector3;
  spawnedAt: number;
  armedAt: number;
  expiresAt: number;
};

type StrikeMissileEntity = {
  missile: THREE.Group;
  marker: THREE.Mesh;
  target: THREE.Vector3;
  startedAt: number;
  impactAt: number;
  resolved: boolean;
};

type HunterDroneEntity = {
  root: THREE.Group;
  targetId: string;
  index: number;
  spawnedAt: number;
  diveAt: number;
  expiresAt: number;
};

type RemoteSupportPresentation = {
  source: OffensiveSupportSource;
  roots: { root: THREE.Group; target: THREE.Vector3 }[];
  startedAt: number;
  detonateAt: number;
  expiresAt: number;
  detonated: boolean;
};

type NukeSequence = {
  startedAt: number;
  detonateAt: number;
  finishedAt: number;
  detonated: boolean;
  shockwave: THREE.Mesh;
  authoritativeDamage: boolean;
};

type TriPassHostileMarker = {
  id: string;
  kind: 'bot' | 'remote';
  world: [number, number];
  canvas: [number, number];
};

type ExplosionSyncProfile = {
  source: OffensiveSupportSource;
  audioMs: number;
  visualMs: number;
  targetDamageMs: number;
  totalSyncMs: number;
};

type ExplosionFrameProfile = {
  frameSerial: number;
  sources: OffensiveSupportSource[];
  impacts: number;
  totalSyncMs: number;
  maxImpactSyncMs: number;
};

type ActiveTeamPing = {
  root: THREE.Group;
  expiresAt: number;
};

type DeathDropEntity = {
  drop: DeathDrop;
  root: THREE.Group;
};

function createPlayerId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `player-${Date.now().toString(36)}-${Math.floor(presentationRandom() * 0x1_0000_0000).toString(36)}`;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');
const PLAYER_NAME_STORAGE_KEY = 'atomic-acres:player-name:v1';
let storedPlayerName = '';
try { storedPlayerName = normalizeRequiredPlayerName(localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '') ?? ''; } catch { /* Storage can be unavailable in hardened browser contexts. */ }
app.innerHTML = `
  <canvas id="game" aria-label="Atomic Acres multiplayer arena"></canvas>
  <div id="color-grade"></div><div id="film-grain"></div>
  <div id="vignette"></div><div id="damage-flash"></div><div id="damage-direction"><i></i></div>
  <div id="nuke-flash" hidden></div>
  <section id="nuke-warning" hidden aria-live="assertive"><small>ATOMIC EVENT</small><strong>NUKE INBOUND</strong><b>5</b><span>SEEK COVER · HOSTILE EVENT</span></section>
  <section id="menu" class="panel">
    <div class="eyebrow">FOUR ORIGINAL PLAY SPACES · PERFORMANCE FIRST · ${latestChangelogEntry().pass}</div>
    <h1 id="arena-title">ATOMIC <span>ACRES</span></h1>
    <p class="lede" id="arena-lede">Fight through an authored living neighbourhood with physical transit cover, tactical viewmodels, atmospheric dust and a contested 2× Quad Damage Core.</p>
    <nav class="menu-tabs" aria-label="Deployment menu">
      <button type="button" data-menu-tab="deploy" class="active" aria-selected="true">DEPLOY</button>
      <button type="button" data-menu-tab="kit" aria-selected="false">FIELD KIT</button>
      <button type="button" data-menu-tab="options" aria-selected="false">OPTIONS</button>
    </nav>
    <div class="menu-panel active" data-menu-panel="deploy">
      <div class="setup-grid">
        <label>CALLSIGN<input id="player-name" maxlength="16" autocomplete="nickname" required aria-describedby="player-name-error" placeholder="Enter callsign" value="${storedPlayerName}"><small id="player-name-error" class="input-error" hidden>Enter a callsign before deployment.</small></label>
        <label>SQUAD<select id="team"><option value="0">Aqua</option><option value="1">Coral</option></select></label>
      </div>
      <section class="map-selector" aria-label="Choose map">
        <div class="map-selector-heading"><span>SELECT MAP</span><small>Choose before deployment</small></div>
        <div class="map-card-grid">
          ${ARENA_SELECTIONS.map((entry, index) => `<button type="button" class="map-card${index === 0 ? ' selected' : ''}" data-arena-id="${entry.id}" aria-pressed="${index === 0}" disabled>
            <span>${entry.selectorLabel}</span><strong>${entry.summary}</strong><small>${entry.rulesLabel}</small>
          </button>`).join('')}
        </div>
      </section>
      <div id="selected-kit-summary" class="selected-kit-summary"></div>
      <div class="menu-actions">
        <button id="resume" class="primary" hidden>RETURN TO MATCH</button>
        <button id="main-menu" hidden>MAIN MENU · CHANGE MAP</button>
        <button id="solo" class="primary">BOT SKIRMISH</button>
        <button id="host">HOST LOBBY</button>
      </div>
      <div class="join-row"><input id="room-input" placeholder="Paste room code" autocomplete="off"><button id="join">JOIN</button></div>
      <div id="room-card" hidden><span>ROOM CODE</span><strong id="room-code"></strong><button id="copy-room" class="small-button" aria-label="Copy lobby code">COPY CODE</button></div>
      <section id="private-lobby" hidden aria-labelledby="private-lobby-title">
        <div class="private-lobby-heading"><span><small>PRIVATE MATCH</small><strong id="private-lobby-title">WAITING ROOM</strong></span><b id="lobby-capacity-label">1 / 4</b></div>
        <div class="lobby-settings">
          <label>MODE<select id="lobby-mode"><option value="tdm">TEAM DEATHMATCH</option><option value="ffa">FREE FOR ALL</option></select></label>
          <label>CAPACITY<select id="lobby-capacity"><option value="4">4 PLAYERS</option><option value="6">6 PLAYERS</option></select></label>
          <label>HOSTED BOTS<select id="lobby-bots"><option value="0">NO BOTS</option><option value="2">2 BOTS</option><option value="4">4 BOTS</option></select></label>
          <label class="lobby-check"><input id="lobby-auto-balance" type="checkbox" checked> AUTO BALANCE</label>
          <button id="lobby-balance" type="button">BALANCE TEAMS</button>
        </div>
        <div id="lobby-roster" class="lobby-roster"></div>
        <div class="lobby-actions">
          <button id="lobby-ready" type="button">READY</button>
          <button id="lobby-start" class="primary" type="button" disabled>START MATCH</button>
          <button id="lobby-leave" type="button">LEAVE ROOM</button>
        </div>
        <p id="lobby-guidance">Choose teams, ready up, then the host starts one synchronized countdown.</p>
      </section>
      <div id="network-status" data-kind="ok">Ready for deployment.</div>
      <section id="last-match-reports" hidden aria-label="Last match reports">
        <span><small>LAST MATCH</small><strong>DOWNLOAD REPORTS</strong></span>
        <button id="menu-download-match-summary" type="button">HUMAN SUMMARY JSON</button>
        <button id="menu-download-match-technical" type="button">TECHNICAL DEBUG JSON</button>
      </section>
      <section id="high-score-card" aria-labelledby="high-score-title" data-board="streak">
        <div class="high-score-heading"><span><small id="global-leaderboard-status">GLOBAL STREAK RECORDS</small><strong id="high-score-title">ACRES LEADERBOARD</strong></span><b id="personal-best">NO PERSONAL BEST</b></div>
        <ol id="high-score-list"><li class="empty">Set the first named streak record.</li></ol>
        <p id="high-score-footnote">Global streak records sync across builds and devices · local cache remains available offline.</p>
      </section>
    </div>
    <div class="menu-panel" data-menu-panel="kit" hidden>
      <div class="kit-heading"><div><b>FIELD KIT</b><span>Choose the primary and issued sidearm.</span></div><small>Changes made mid-life queue for the next deployment.</small></div>
      <div class="kit-grid">
        ${FIELD_KITS.map((kit) => `<button type="button" class="kit-card" data-kit-id="${kit.id}">
          <span>${kit.role}</span><strong>${kit.title}</strong><b>${WEAPONS[kit.weapon].name} · ${WEAPONS[kit.sidearm].name}</b><p>${kit.summary}</p>
          <i>${kit.traits.join(' · ')}</i><em>SELECTED</em>
        </button>`).join('')}
      </div>
    </div>
    <div class="menu-panel" data-menu-panel="options" hidden>
      <div class="options-heading"><b>OPTIONS</b><span>Input and view settings apply immediately.</span></div>
      <div class="settings-grid">
        <label>MOUSE SENSITIVITY<input id="sensitivity" type="range" min="0.6" max="2" step="0.05" value="1"></label>
        <label>CONTROLLER LOOK<input id="controller-sensitivity" type="range" min="0.5" max="1.8" step="0.05" value="1"></label>
        <label>FIELD OF VIEW<input id="field-of-view" type="range" min="70" max="100" step="1" value="82"></label>
        <label>GRAPHICS<select id="graphics-profile"><option value="performance">PERFORMANCE</option><option value="blender">QUALITY GRAPHICS</option></select></label>
      </div>
      <div class="controls"><b>WASD</b> move · <b>SHIFT</b> sprint · <b>C</b> crouch · <b>Z/CTRL</b> prone · <b>SPACE</b> jump · <b>RMB</b> ADS · <b>LMB</b> fire · <b>R</b> reload · <b>V</b> knife · <b>G</b> frag · <b>F</b> weapon pickup · <b>WALK OVER DROPS</b> ammo/frag · <b>1/2</b> primary/sidearm · <b>TAB</b> roster<br><b>PAD</b> left stick move · right stick aim · <b>LT/RT</b> ADS/fire · <b>A</b> jump · <b>B</b> crouch · <b>D-PAD DOWN</b> prone · <b>X</b> reload · <b>Y</b> switch · <b>RB</b> knife</div>
      <p class="legal">Fan-made original arena. No Activision assets, branding, code or ripped map geometry. Keyboard/mouse and standard gamepads supported.</p>
    </div>
  </section>
  <aside id="menu-showcase" aria-hidden="true">
    <img src="./assets/original/menu/atomic-acres-menu-squad-joke.jpg?v=20260722-mapshot-operators" alt="" decoding="async">
  </aside>
  <button id="last-updated-btn" type="button" aria-haspopup="dialog" aria-controls="changelog-panel" aria-expanded="false">${lastUpdatedButtonLabel()}</button>
  <div id="changelog-backdrop" hidden></div>
  <section id="changelog-panel" class="panel" hidden role="dialog" aria-modal="true" aria-labelledby="changelog-title">
    <header class="changelog-header">
      <div>
        <small>PUBLIC RELEASE HISTORY</small>
        <strong id="changelog-title">RECENT CHANGES</strong>
      </div>
      <button id="changelog-close" type="button" aria-label="Close changelog">CLOSE</button>
    </header>
    <p class="changelog-lede">Player-facing production releases only. <b>PUBLISHED</b> is the first successful live release time, shown in UK local time and with its UTC offset. Newest first.</p>
    <ol id="changelog-list">
      ${CHANGELOG.map((entry, index) => `
        <li data-changelog-id="${entry.id}">
          <div class="changelog-entry-head">
            <div class="changelog-entry-pass"><span>${entry.pass}</span>${index === 0 ? '<b>CURRENT LIVE</b>' : ''}</div>
            <time datetime="${entry.releasedAt}"><small>PUBLISHED</small>${formatChangelogTimestampDetail(entry.releasedAt)}</time>
          </div>
          <strong>${entry.title}</strong>
          <div class="changelog-areas">${entry.areas.map((area) => `<span>${area}</span>`).join('')}</div>
          <p>${entry.summary}</p>
          <ul>${entry.highlights.map((line) => `<li>${line}</li>`).join('')}</ul>
        </li>
      `).join('')}
    </ol>
  </section>
  <div id="refresh-warning" hidden><strong>30 HZ DISPLAY LIMIT</strong><span>Set Windows Advanced display or the remote-stream client to 60 Hz+ for synchronized motion.</span></div>
  <section id="strike-map-overlay" hidden aria-label="Tri-Pass tactical targeting map">
    <header><span>TRI-PASS</span><strong>SELECT THREE TARGETS</strong><b id="strike-target-count">0 / 3</b></header>
    <canvas id="strike-map" width="480" height="480"></canvas>
    <footer><strong id="strike-hostile-count">ENEMIES LIVE · 0</strong><span>CLICK THREE LOCATIONS · <kbd>ESC</kbd> CANCELS AND REFUNDS</span></footer>
  </section>
  <div id="hud" hidden>
    <div id="pause-hint">ESC · MENU</div>
    <header id="matchbar"><div><span class="tiny" id="match-mode-label">TEAM DEATHMATCH</span><strong id="timer">05:00</strong></div><div id="scoreline"><span class="aqua"><em id="aqua-label">AQUA</em> <b id="aqua-score">0</b></span><i id="score-limit">—</i><span class="coral"><b id="coral-score">0</b> <em id="coral-label">CORAL</em></span></div><div id="connection-pill">SOLO</div></header>
    <div id="fps-counter" aria-label="Frame rate"><b>--</b><span>FPS</span></div>
    <div id="network-strip" aria-label="Live player latency"></div>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hitmarker">×</div>
    <div id="damage-numbers" aria-live="polite" aria-label="Damage dealt"></div>
    <div id="sniper-scope" hidden aria-label="3x sniper scope">
      <div class="scope-ring"></div>
      <div class="scope-reticle"><i></i><b></b><span></span><em></em></div>
      <small>3×</small>
    </div>
    <div id="killfeed" aria-live="polite" aria-label="Match events"></div>
    <div id="damage-feeds" aria-label="Damage activity">
      <section class="damage-feed done" aria-labelledby="damage-done-label"><b id="damage-done-label">DAMAGE DONE <span>OUTGOING</span></b><div id="damage-done-feed" aria-live="polite"></div></section>
      <section class="damage-feed taken" aria-labelledby="damage-taken-label"><b id="damage-taken-label">DAMAGE TAKEN <span>INCOMING</span></b><div id="damage-taken-feed" aria-live="assertive"></div></section>
    </div>
    <div id="objective">ATOMIC ACRES · FIVE MINUTES · MOST KILLS WINS</div>
    <canvas id="minimap" width="360" height="360" aria-label="Tactical minimap"></canvas>
    <div id="map-heading">N · 000°</div>
    <div id="location-label">CIVIC TRANSIT</div>
    <div id="health-block"><div><span>VITALS</span><b id="health">100</b></div><div class="health-track"><i id="health-fill"></i></div></div>
    <div id="combat-stats" aria-label="Match damage"><span>DEALT <b id="damage-dealt">0</b></span><span>TAKEN <b id="damage-taken">0</b></span></div>
    <div id="weapon-block">
      <span id="weapon-name">M86 CARBINE</span>
      <div class="ammo-row"><b id="ammo">30</b><div class="reserve-stack"><small>RESERVE</small><span><i>/</i><em id="reserve">120</em></span></div></div>
      <small id="reload-state"></small>
    </div>
    <div id="equipment-block"><span id="stance">STANDING</span><b id="grenades">FRAG ×2</b><small>V KNIFE · G THROW</small></div>
    <div id="support-block">
      <div class="support-heading"><span>FIELD SUPPORT</span><strong id="support-streak">STREAK 0</strong></div>
      <div class="support-list">
        <b data-support="scout-sweep"><span class="support-meta"><kbd>3</kbd><small>3 KILLS</small></span><span class="support-name">SCOUT SWEEP</span><em class="support-state">LOCKED</em></b>
        <b data-support="yardhawk"><span class="support-meta"><kbd>4</kbd><small>5 KILLS</small></span><span class="support-name">YARDHAWK</span><em class="support-state">LOCKED</em></b>
        <b data-support="tri-pass"><span class="support-meta"><kbd>5</kbd><small>7 KILLS</small></span><span class="support-name">TRI-PASS</span><em class="support-state">LOCKED</em></b>
        <b data-support="hunter-swarm"><span class="support-meta"><kbd>6</kbd><small>8 KILLS</small></span><span class="support-name">HUNTER SWARM</span><em class="support-state">LOCKED</em></b>
        <b data-support="nuke"><span class="support-meta"><kbd>7</kbd><small>15 KILLS</small></span><span class="support-name">NUKE</span><em class="support-state">LOCKED</em></b>
      </div>
      <small class="support-help">KEYS 3–7 · PAD ◀/▶ SELECT · PAD ▲ ACTIVATE</small>
    </div>
    <div id="overdrive-hud" hidden><small>2× DAMAGE</small><strong id="overdrive-time">30.0</strong><span>OVERDRIVE</span></div>
    <div id="power-announcement" hidden aria-live="assertive"><small>MID-MAP POWER WEAPON</small><strong>QUAD DAMAGE</strong><span>2× DAMAGE · 30 SECONDS</span></div>
    <div id="ping-block"><span>TEAM PINGS</span><small>T ENEMY · Y REGROUP · U PUSH · I NICE</small></div>
    <div id="room-hud"></div>
    <div id="pickup-prompt" hidden><kbd>F</kbd><span>PICK UP</span><strong></strong></div>
    <div id="respawn" hidden><strong>ELIMINATED</strong><span id="respawn-countdown">REDEPLOYING</span></div>
    <div id="countdown" hidden></div>
    <div id="banner" hidden></div>
    <div id="roster" hidden><h2>FIELD ROSTER</h2><div id="roster-list"></div></div>
  </div>
`;

function element<T extends HTMLElement>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing element ${selector}`);
  return value;
}

const canvas = element<HTMLCanvasElement>('#game');
const menu = element<HTMLElement>('#menu');
const hudRoot = element<HTMLElement>('#hud');
const fpsCounter = element<HTMLElement>('#fps-counter');
const fpsCounterValue = element<HTMLElement>('#fps-counter b');
const sniperScopeOverlay = element<HTMLElement>('#sniper-scope');
const roomCard = element<HTMLElement>('#room-card');
const roomCodeEl = element<HTMLElement>('#room-code');
const statusEl = element<HTMLElement>('#network-status');
const minimapCanvas = element<HTMLCanvasElement>('#minimap');
const minimapContextValue = minimapCanvas.getContext('2d');
if (!minimapContextValue) throw new Error('Canvas2D minimap is unavailable');
const minimapContext: CanvasRenderingContext2D = minimapContextValue;
const strikeMapCanvas = element<HTMLCanvasElement>('#strike-map');
const strikeMapContextValue = strikeMapCanvas.getContext('2d');
if (!strikeMapContextValue) throw new Error('Canvas2D tactical map is unavailable');
const strikeMapContext: CanvasRenderingContext2D = strikeMapContextValue;
const audio = new ArenaAudio();

const renderProfile: RenderProfile = resolveRenderProfile(
  window.location.search,
  localStorage.getItem(RENDER_PROFILE_STORAGE_KEY),
);
const activeRenderConfig = renderProfileConfig(renderProfile);
const atomicLighting = arenaLightingProfile(renderProfile, 'atomic-acres');
let activeLighting = arenaLightingProfile(
  renderProfile,
  arenaSelection(new URLSearchParams(window.location.search).get('map')).id,
);
const reducedRenderMode = activeRenderConfig.reducedPresentationDetail;
const reducedWorldDetail = activeRenderConfig.reducedWorldDetail;
const staticMaterialMode = activeRenderConfig.staticMaterialMode;
const flattenOperatorMaterials = reducedRenderMode;
document.documentElement.classList.toggle('compat-render', renderProfile === 'compat');
document.documentElement.classList.toggle('performance-render', renderProfile === 'performance');
document.documentElement.classList.toggle('blender-render', renderProfile === 'blender');
document.documentElement.dataset.renderProfile = renderProfile;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: activeRenderConfig.antialias,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = activeRenderConfig.shadows;
renderer.shadowMap.type = activeLighting.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = activeRenderConfig.shadowMode === 'dynamic';
renderer.shadowMap.needsUpdate = activeRenderConfig.shadowMode === 'static';
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = activeLighting.exposure;
const signalQuery = new URLSearchParams(window.location.search).get('signal');
const gl = renderer.getContext();
const rendererInfo = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
const rendererLabel = rendererInfo ? String(gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
const softwareRenderer = isSoftwareWebGLRenderer(rendererLabel);
const atomicSignalBypass = atomicSignalBypassReason(signalQuery, rendererLabel);
document.documentElement.dataset.atomicSignalRenderer = softwareRenderer ? 'software' : 'hardware';
const atomicSignal = new AtomicSignalPass(renderer, renderProfile, (reason) => {
  document.documentElement.classList.remove('atomic-signal-render');
  document.documentElement.dataset.atomicSignal = 'fallback';
  console.warn('[Atomic Acres Atomic Signal fallback]', reason);
}, atomicSignalBypass);
const grassQuery = new URLSearchParams(window.location.search).get('grass');
const mistQuery = new URLSearchParams(window.location.search).get('mist');
const cloudsQuery = new URLSearchParams(window.location.search).get('clouds');
const skyCloudsEnabled = !reducedRenderMode || cloudsQuery === 'on';
const raysQuery = new URLSearchParams(window.location.search).get('rays');
const actualGodRayStrength = (raysQuery === 'off' || (softwareRenderer && raysQuery !== 'on')) ? 0 : activeLighting.godRayStrength;
const actualGodRayLobes = actualGodRayStrength > 0 ? activeLighting.godRayLobes : 0;
document.documentElement.classList.toggle('atomic-signal-render', atomicSignal.telemetry().enabled);
document.documentElement.dataset.atomicSignal = atomicSignal.telemetry().enabled ? 'active' : 'direct';
let webglContextLost = false;
let webglContextLosses = 0;
let webglContextRestorations = 0;
let staticShadowDynamicRefreshes = 0;
let lastStaticShadowRefreshAt = -Infinity;
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  webglContextLost = true;
  webglContextLosses += 1;
  document.documentElement.dataset.webglContext = 'lost';
});
document.documentElement.dataset.webglContext = 'ready';
// Both public profiles can reduce their internal framebuffer when sustained
// frame time exceeds the detected display budget. Shadows disable
// automatically below a moderate DPR threshold.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, activeRenderConfig.pixelRatioCap));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(activeLighting.fogColor, activeLighting.fogNear, activeLighting.fogFar);
const graphicsRefinement = new GraphicsRefinementSystem(
  renderer,
  scene,
  renderProfile,
  softwareRenderer,
  activeRenderConfig.pixelRatioCap,
);
let applyPresentationEffectsBudget: ((budget: GraphicsEffectsBudget) => void) | null = null;
const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);
camera.rotation.order = 'YXZ';
scene.add(camera);
const VIEWMODEL_RENDER_LAYER = 2;
camera.layers.enable(VIEWMODEL_RENDER_LAYER);
let skyMaterial: THREE.ShaderMaterial | null = null;

let riggedOperatorLoadError: string | null = null;
let importedWeaponLoadError: string | null = null;
const displayCadencePromise = new Promise<number>((resolve) => {
  const samples: number[] = [];
  let previous = performance.now();
  const sample = (now: number) => {
    if (samples.length > 0 || now - previous < 100) samples.push(now - previous);
    previous = now;
    if (samples.length >= 36) resolve(classifyDisplayFrameMs(samples));
    else requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
});
const [operatorLoad, weaponLoad] = await Promise.allSettled([
  loadRiggedOperatorAsset(),
  loadImportedWeaponAssets(),
]);
if (operatorLoad.status === 'rejected') {
  riggedOperatorLoadError = operatorLoad.reason instanceof Error ? operatorLoad.reason.message : String(operatorLoad.reason);
  console.error('[Atomic Acres operator asset load failed]', riggedOperatorLoadError);
}
if (weaponLoad.status === 'rejected') {
  importedWeaponLoadError = weaponLoad.reason instanceof Error ? weaponLoad.reason.message : String(weaponLoad.reason);
  console.error('[Atomic Acres weapon asset load failed]', importedWeaponLoadError);
}
const detectedDisplayFrameMs = await displayCadencePromise;
const adaptiveQuality = new AdaptiveQualityController({
  profile: renderProfile,
  targetFrameMs: detectedDisplayFrameMs,
  initialPixelRatioCap: activeRenderConfig.pixelRatioCap,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, adaptiveQuality.telemetry().pixelRatioCap));

function applyAdaptiveRenderBudget(pixelRatioCap: number): void {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
  const effectsBudget = graphicsEffectsBudget(renderProfile, pixelRatioCap);
  graphicsRefinement.setBudget(effectsBudget);
  atomicSignal.setEffectsBudget(effectsBudget);
  applyPresentationEffectsBudget?.(effectsBudget);
  const shadowsEnabled = adaptiveShadowsEnabled(renderProfile, activeRenderConfig.shadows, pixelRatioCap);
  if (renderer.shadowMap.enabled !== shadowsEnabled) {
    renderer.shadowMap.enabled = shadowsEnabled;
    renderer.shadowMap.needsUpdate = shadowsEnabled;
  }
  document.documentElement.dataset.adaptiveShadows = shadowsEnabled ? 'on' : 'off';
}
applyAdaptiveRenderBudget(adaptiveQuality.telemetry().pixelRatioCap);

function buildSky(): void {
  const geometry = new THREE.SphereGeometry(150, reducedRenderMode ? 20 : 32, reducedRenderMode ? 12 : 18);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(activeLighting.skyTop) },
      horizon: { value: new THREE.Color(activeLighting.skyHorizon) },
      bottom: { value: new THREE.Color(activeLighting.skyBottom) },
      sunColor: { value: new THREE.Color(activeLighting.skySun) },
      cloudColor: { value: new THREE.Color(activeLighting.skyCloud) },
      cloudShadow: { value: new THREE.Color(activeLighting.skyCloudShadow) },
      cloudLight: { value: new THREE.Color(activeLighting.skyCloudLight) },
      sunDirection: { value: new THREE.Vector3(...activeLighting.sunPosition).normalize() },
      cloudStrength: { value: skyCloudsEnabled ? (renderProfile === 'blender' ? 0.68 : 0.45) : 0 },
      rayStrength: { value: actualGodRayStrength },
      rayLobes: { value: actualGodRayLobes },
      nukeFlash: { value: 0 },
    },
    vertexShader: `
      varying vec3 skyDirection;
      void main(){
        skyDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 skyDirection;
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 bottom;
      uniform vec3 sunColor;
      uniform vec3 cloudColor;
      uniform vec3 cloudShadow;
      uniform vec3 cloudLight;
      uniform vec3 sunDirection;
      uniform float cloudStrength;
      uniform float rayStrength;
      uniform float rayLobes;
      uniform float nukeFlash;
      void main(){
        vec3 direction = normalize(skyDirection);
        float h = direction.y;
        vec3 color = h > 0.0
          ? mix(horizon, top, smoothstep(0.0, 0.78, h))
          : mix(horizon, bottom, smoothstep(0.0, -0.38, h));
        float sunDot = max(dot(direction, sunDirection), 0.0);
        float sunDisc = pow(sunDot, 420.0);
        float sunHalo = pow(sunDot, 18.0) * 0.28;
        ${skyCloudsEnabled ? `
        float horizonBand = smoothstep(0.035, 0.11, h) * (1.0 - smoothstep(0.3, 0.43, h));
        float highBand = smoothstep(0.5, 0.65, h) * (1.0 - smoothstep(0.88, 0.98, h));
        float lowBand = smoothstep(0.2, 0.35, h) * (1.0 - smoothstep(0.57, 0.72, h));
        float waveA = 0.5 + 0.5 * sin(direction.x * 11.0 + direction.z * 4.0 + sin(direction.z * 9.0) * 1.7 + h * 2.0);
        float waveB = 0.5 + 0.5 * sin(direction.z * 15.0 - direction.x * 7.0 + h * 8.0);
        float cloudBand = max(horizonBand * 0.82, max(highBand, lowBand * 0.86));
        float cloudDetail = smoothstep(0.46, 0.8, waveA * 0.64 + waveB * 0.36);
        float cloudMask = cloudBand * (0.34 + cloudDetail * 0.66);
        float cloudSun = smoothstep(0.02, 0.42, sunDot + waveB * 0.08);
        vec3 stormCloud = mix(cloudShadow, cloudLight, cloudSun);
        stormCloud = mix(stormCloud, cloudColor, 0.04);
        color = mix(color, stormCloud, cloudMask * cloudStrength);
        ` : 'float cloudMask = 0.0;'}
        float rayAzimuth = atan(direction.z, direction.x);
        float rayBands = 0.5 + 0.5 * sin(rayAzimuth * max(rayLobes, 1.0) + h * 13.0);
        float rayShape = smoothstep(0.54, 0.96, rayBands) * pow(sunDot, 3.2);
        float rayAltitude = smoothstep(-0.04, 0.24, h);
        color += sunColor * rayShape * rayAltitude * rayStrength;
        color += sunColor * (sunDisc * 1.4 + sunHalo);
        color = mix(color, vec3(1.55, 0.78, 0.34), clamp(nukeFlash, 0.0, 1.0));
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'procedural-atmosphere-sky';
  sky.frustumCulled = false;
  sky.onBeforeRender = () => sky.position.copy(camera.position);
  skyMaterial = material;
  scene.add(sky);
  hemisphereLight = new THREE.HemisphereLight(activeLighting.hemisphereSky, activeLighting.hemisphereGround, activeLighting.hemisphereIntensity);
  ambientLight = new THREE.AmbientLight(activeLighting.ambientColor, activeLighting.ambientIntensity);
  scene.add(hemisphereLight);
  scene.add(ambientLight);
  sunLight = new THREE.DirectionalLight(activeLighting.sunColor, activeLighting.sunIntensity);
  sunLight.position.set(...activeLighting.sunPosition);
  sunLight.castShadow = activeRenderConfig.shadows;
  if (activeRenderConfig.shadows) sunLight.shadow.mapSize.set(activeRenderConfig.shadowMapSize, activeRenderConfig.shadowMapSize);
  sunLight.shadow.camera.left = -48;
  sunLight.shadow.camera.right = 48;
  sunLight.shadow.camera.top = 54;
  sunLight.shadow.camera.bottom = -54;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 150;
  sunLight.shadow.bias = activeLighting.shadowBias;
  sunLight.shadow.normalBias = activeLighting.shadowNormalBias;
  scene.add(sunLight);
  fillLight = new THREE.DirectionalLight(activeLighting.fillColor, activeLighting.fillIntensity);
  fillLight.name = 'shadow-side-arena-fill';
  fillLight.position.set(...activeLighting.fillPosition);
  fillLight.castShadow = false;
  scene.add(fillLight);
}
let hemisphereLight: THREE.HemisphereLight;
let ambientLight: THREE.AmbientLight;
let sunLight: THREE.DirectionalLight;
let fillLight: THREE.DirectionalLight;
buildSky();
const worldIdentityPresentation = createWorldIdentityPresentation(
  scene,
  atomicLighting,
  softwareRenderer,
);
const atomicArena = buildArena(scene);
const rustworksArena = buildRustworks1v1(scene);
applyRustworksPresentationProfile(rustworksArena.root, renderProfile);
createRustworksQualityLights(rustworksArena.root, renderProfile);
if (renderProfile === 'blender') enhanceRustworksQualityMaterials(rustworksArena.root, renderProfile);
const gunRangeArena = buildGunRange(scene);
const skylineTerminalArena = buildSkylineTerminal(scene);
applyAdditionalMapPresentationProfile(skylineTerminalArena.root, renderProfile);
const arenaById: Readonly<Record<ArenaId, ArenaMap>> = {
  'atomic-acres': atomicArena,
  'rustworks-1v1': rustworksArena,
  'gun-range': gunRangeArena,
  'skyline-terminal': skylineTerminalArena,
};
let selectedArena: ArenaSelection = arenaSelection(new URLSearchParams(window.location.search).get('map'));
let arena: ArenaMap = arenaById[selectedArena.id];

function activeBallisticSurfaces(activeArena: ArenaMap = arena): readonly BallisticSurface[] {
  const brokenWindowIds = new Set(activeArena.breakableWindows.filter((pane) => pane.broken).map((pane) => pane.id));
  return activeArena.shotSurfaces.filter((surface) => !surface.breakableWindowId || !brokenWindowIds.has(surface.breakableWindowId));
}

function traceWeaponPath(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
  weapon: WeaponId,
): BallisticTrace {
  return traceBallisticPath(origin, direction, distance, WEAPONS[weapon].penetration, activeBallisticSurfaces());
}
for (const candidate of Object.values(arenaById)) candidate.root.visible = candidate === arena;
document.documentElement.dataset.arenaId = selectedArena.id;
function applyArenaFogProfile(): void {
  const fog = atmosphereFogRange(renderProfile, selectedArena.id);
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = fog.near;
    scene.fog.far = fog.far;
  }
}
applyArenaFogProfile();
const neighbourhoodLifeRoot = addNeighbourhoodLife(scene, reducedWorldDetail);
const overdriveRoot = new THREE.Group();
overdriveRoot.name = 'overdrive-core-pickup';
overdriveRoot.position.set(OVERDRIVE_POSITION.x, OVERDRIVE_POSITION.y, OVERDRIVE_POSITION.z);
overdriveRoot.visible = false;
overdriveRoot.userData.dynamic = true;
overdriveRoot.userData.presentationOnly = true;
const overdriveCore = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.44, reducedRenderMode ? 1 : 2),
  new THREE.MeshStandardMaterial({ color: 0x8ff7ef, emissive: 0x2d62a7, emissiveIntensity: 2.2, roughness: 0.22, metalness: 0.56 }),
);
overdriveCore.name = 'overdrive-energy-core';
const overdriveRings = [0, Math.PI / 2].map((rotation, index) => {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.68 + index * 0.08, 0.055, 8, reducedRenderMode ? 20 : 36),
    new THREE.MeshBasicMaterial({ color: index === 0 ? 0x78f5ed : 0x9d6bff, transparent: true, opacity: 0.86, toneMapped: false }),
  );
  ring.name = `overdrive-ring-${index}`;
  ring.rotation.set(Math.PI / 2, rotation, rotation * 0.5);
  return ring;
});
const overdrivePedestal = new THREE.Mesh(
  new THREE.CylinderGeometry(0.72, 0.9, 0.18, reducedRenderMode ? 12 : 24),
  new THREE.MeshStandardMaterial({ color: 0x273b43, emissive: 0x132d40, emissiveIntensity: 0.65, roughness: 0.48, metalness: 0.52 }),
);
overdrivePedestal.name = 'overdrive-pedestal';
overdrivePedestal.position.y = -0.69;
const quadIconCanvas = document.createElement('canvas');
quadIconCanvas.width = 256;
quadIconCanvas.height = 128;
const quadIconContext = quadIconCanvas.getContext('2d');
if (!quadIconContext) throw new Error('Canvas2D unavailable for Quad Damage world icon');
quadIconContext.fillStyle = 'rgba(10, 17, 32, .88)';
quadIconContext.fillRect(12, 16, 232, 96);
quadIconContext.strokeStyle = '#78f5ed';
quadIconContext.lineWidth = 8;
quadIconContext.strokeRect(12, 16, 232, 96);
quadIconContext.fillStyle = '#f7edff';
quadIconContext.font = '900 58px sans-serif';
quadIconContext.textAlign = 'center';
quadIconContext.fillText('2×', 128, 76);
quadIconContext.fillStyle = '#a892ff';
quadIconContext.font = '900 20px sans-serif';
quadIconContext.fillText('QUAD DAMAGE', 128, 103);
const quadIconTexture = new THREE.CanvasTexture(quadIconCanvas);
quadIconTexture.colorSpace = THREE.SRGBColorSpace;
const quadWorldIcon = new THREE.Sprite(new THREE.SpriteMaterial({ map: quadIconTexture, transparent: true, depthWrite: false, toneMapped: false }));
quadWorldIcon.name = 'quad-damage-world-icon';
quadWorldIcon.position.y = 1.75;
quadWorldIcon.scale.set(3.4, 1.7, 1);
const quadBeacon = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.82, 3.1, reducedRenderMode ? 10 : 20, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x7cf8ef, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
);
quadBeacon.name = 'quad-damage-beacon';
quadBeacon.position.y = 0.55;
const quadGlow = new THREE.PointLight(0x8e78ff, 2.4, 8, 2);
quadGlow.name = 'quad-damage-local-glow';
quadGlow.position.y = 0.55;
overdriveRoot.add(overdriveCore, ...overdriveRings, overdrivePedestal, quadWorldIcon, quadBeacon, quadGlow);
overdriveRoot.traverse((node) => { node.userData.presentationOnly = true; node.userData.blocksShots = false; node.raycast = () => undefined; });
scene.add(overdriveRoot);
// Compile the Quad presentation during initial loading, not on the 120-second
// spawn transition where a first-use shader hitch looks like a game freeze.
overdriveRoot.visible = true;
renderer.compile(overdriveRoot, camera);
overdriveRoot.visible = false;
const atmosphereSystem = new AtmosphereSystem(scene, renderProfile, rendererLabel, mistQuery, selectedArena.id);
const waterSystem = new WaterSystem(scene);
waterSystem.configure(selectedArena.id, renderProfile, {
  halfX: Math.max(Math.abs(arena.bounds.minX), Math.abs(arena.bounds.maxX)),
  halfZ: Math.max(Math.abs(arena.bounds.minZ), Math.abs(arena.bounds.maxZ)),
}, { night: selectedArena.id === 'rustworks-1v1', waterLevel: selectedArena.id === 'rustworks-1v1' ? -19.5 : -0.55 });
ensureRustworksStarfield(scene, selectedArena.id);
const grassSystem = new GrassSystem(
  scene,
  renderProfile,
  rendererLabel,
  grassQuery,
  // Grass is an Atomic Acres-only presentation layer, so deep-linked solo maps
  // must never seed its permanent placements from their collision geometry.
  atomicArena.colliders,
  atomicLighting,
);
grassSystem.setAdaptivePixelRatio(adaptiveQuality.telemetry().pixelRatioCap);
renderer.domElement.addEventListener('webglcontextrestored', () => {
  webglContextLost = false;
  webglContextRestorations += 1;
  document.documentElement.dataset.webglContext = 'ready';
  renderer.shadowMap.needsUpdate = activeRenderConfig.shadows;
  atomicSignal.invalidateValidation();
  atmosphereSystem.handleContextRestored();
  grassSystem.handleContextRestored();
  resize();
});
const impactPresentation = new ImpactPresentation(scene, reducedRenderMode);
applyPresentationEffectsBudget = (budget) => {
  atmosphereSystem.setDensityScale(budget.particleDensityScale);
  impactPresentation.setBudget(budget.particleDensityScale, budget.decalLifetimeScale);
};
applyPresentationEffectsBudget(graphicsEffectsBudget(renderProfile, adaptiveQuality.telemetry().pixelRatioCap));
const tracerPool = new TracerPool(scene);
const grenadeExplosionPresentation = new GrenadeExplosionPresentation(scene);
const supportExplosionPresentation = new SupportExplosionPresentation(scene, reducedRenderMode);
const deathDropPresentationPool = new DeathDropPresentationPool(scene, MAX_DEATH_DROPS);
const nukeShockwave = new THREE.Mesh(
  new THREE.SphereGeometry(1, reducedRenderMode ? 12 : 28, reducedRenderMode ? 8 : 18),
  new THREE.MeshBasicMaterial({ color: 0xffb15c, transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide, toneMapped: false }),
);
nukeShockwave.name = 'pass35-prewarmed-nuke-shockwave';
nukeShockwave.position.set(0, 1.5, 0);
nukeShockwave.visible = false;
nukeShockwave.userData.presentationOnly = true;
let nukePresentationPrewarmed = false;

async function prewarmNukePresentation(): Promise<void> {
  if (nukePresentationPrewarmed) return;
  nukeShockwave.visible = true;
  nukeShockwave.scale.setScalar(0.0001);
  try {
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    nukePresentationPrewarmed = true;
  } finally {
    nukeShockwave.visible = false;
    nukeShockwave.scale.setScalar(0.1);
  }
}
nukeShockwave.raycast = () => undefined;
scene.add(nukeShockwave);
let arenaArtRoot: THREE.Group | null = null;
let blenderArenaActive = false;
let atomicQualityLoadPromise: Promise<THREE.Group | null> | null = null;
let rustworksQualityLoadPromise: Promise<THREE.Group | null> | null = null;
const qualityAssetStreaming = {
  atomicAcres: 'idle' as 'idle' | 'loading' | 'ready' | 'fallback',
  rustworks: 'idle' as 'idle' | 'loading' | 'ready' | 'fallback',
  initialArena: selectedArena.id,
  eagerQualityGlbs: 0,
};
let materialCompatibility: AtomicSignalMaterialAudit = {
  materials: 0,
  colorTexturesCorrected: 0,
  dataTexturesCorrected: 0,
  anisotropyAdjusted: 0,
  darkSurfacesLifted: 0,
  roughnessAdjusted: 0,
  metalnessAdjusted: 0,
};

async function ensureAtomicQualityPresentation(): Promise<THREE.Group | null> {
  if (renderProfile !== 'blender') return arenaArtRoot;
  if (blenderArenaActive && arenaArtRoot) return arenaArtRoot;
  if (atomicQualityLoadPromise) return atomicQualityLoadPromise;
  qualityAssetStreaming.atomicAcres = 'loading';
  atomicQualityLoadPromise = (async () => {
    try {
      const art = await loadBlenderArena(scene, atomicArena, (loaded, total) => {
        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
        setStatus(`Streaming Atomic Acres Quality art ${percent}%â€¦`);
      });
      blenderArenaActive = true;
      arenaArtRoot = art.root;
      qualityAssetStreaming.atomicAcres = 'ready';
      graphicsRefinement.refine(art.root, renderer.capabilities.getMaxAnisotropy());
      await renderer.compileAsync(scene, camera);
      return art.root;
    } catch (error) {
      markBlenderArenaFallback(error);
      console.error('[Atomic Acres Quality Graphics asset load failed; using authored fallback]', error);
      const fallback = await loadArenaArt(scene, (loaded, total) => {
        setStatus(`Quality Graphics fallback ${loaded}/${total}â€¦`);
      }, false);
      blenderArenaActive = false;
      arenaArtRoot = fallback.root;
      qualityAssetStreaming.atomicAcres = 'fallback';
      graphicsRefinement.refine(fallback.root, renderer.capabilities.getMaxAnisotropy());
      await renderer.compileAsync(scene, camera);
      return fallback.root;
    }
  })();
  return atomicQualityLoadPromise;
}

async function ensureRustworksQualityPresentation(): Promise<THREE.Group | null> {
  if (renderProfile !== 'blender') return null;
  if (rustworksBlenderTelemetry().status === 'ready') return rustworksArena.root;
  if (rustworksQualityLoadPromise) return rustworksQualityLoadPromise;
  qualityAssetStreaming.rustworks = 'loading';
  rustworksQualityLoadPromise = loadRustworksBlenderTower(rustworksArena.root).then(async (root) => {
    setRustworksProceduralPresentationVisible(rustworksArena.root, false);
    setRustworksQualityPresentationActive(selectedArena.id === 'rustworks-1v1', renderProfile);
    qualityAssetStreaming.rustworks = 'ready';
    graphicsRefinement.refine(root, renderer.capabilities.getMaxAnisotropy());
    await renderer.compileAsync(scene, camera);
    return root;
  }).catch((error) => {
    markRustworksBlenderFallback(error);
    console.error('[Rustworks Blender tower asset load failed; keeping procedural tower]', error);
    applyRustworksPresentationProfile(rustworksArena.root, renderProfile);
    setRustworksProceduralPresentationVisible(rustworksArena.root, true);
    qualityAssetStreaming.rustworks = 'fallback';
    return null;
  });
  return rustworksQualityLoadPromise;
}

async function ensureSelectedQualityPresentation(id: ArenaId): Promise<void> {
  if (renderProfile !== 'blender') return;
  if (id === 'atomic-acres') await ensureAtomicQualityPresentation();
  else if (id === 'rustworks-1v1') await ensureRustworksQualityPresentation();
  graphicsRefinement.refreshSelectiveBloom(scene);
}

const player = {
  id: createPlayerId(),
  name: 'Player',
  team: 0 as Team,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  yaw: 0,
  pitch: 0,
  hp: 100,
  kills: 0,
  deaths: 0,
  weapon: 'carbine' as WeaponId,
  primaryWeapon: 'carbine' as PrimaryWeaponId,
  ammo: { carbine: WEAPONS.carbine.mag, smg: WEAPONS.smg.mag, lmg: WEAPONS.lmg.mag, scattergun: WEAPONS.scattergun.mag, sniper: WEAPONS.sniper.mag, pistol: WEAPONS.pistol.mag, magnum: WEAPONS.magnum.mag, 'machine-pistol': WEAPONS['machine-pistol'].mag } as Record<WeaponId, number>,
  reserve: { carbine: WEAPONS.carbine.reserve, smg: WEAPONS.smg.reserve, lmg: WEAPONS.lmg.reserve, scattergun: WEAPONS.scattergun.reserve, sniper: WEAPONS.sniper.reserve, pistol: WEAPONS.pistol.reserve, magnum: WEAPONS.magnum.reserve, 'machine-pistol': WEAPONS['machine-pistol'].reserve } as Record<WeaponId, number>,
  reloadState: null as ReloadState | null,
  switchingUntil: 0,
  lastShotAt: 0,
  nextShotAt: 0,
  sustainedShots: 0,
  stance: 'stand' as Stance,
  grenades: 2,
  lastMeleeAt: -10_000,
  alive: true,
  invulnerableUntil: 0,
  seq: 0,
};

const keys = new Set<string>();
const remotes = new Map<string, RemotePlayer>();
const bots = new Map<string, BotPlayer>();
const dormantBots = new Map<string, BotPlayer>();
let dormantBotsPrewarmed = false;
let soloBotDeaths = 0;
const grenades: GrenadeEntity[] = [];
const remoteSupportPresentations: RemoteSupportPresentation[] = [];
let botWeaponAssignments: PrimaryWeaponId[] = [];
let botGrenadeThrows = 0;
let botGrenadeMaxActive = 0;
let lastBotGrenadeDamage = 0;
let grenadeExplosions = 0;
let lastGrenadeExplosionFrameAt = 0;
let lastPrincipalShotAlignment: {
  weapon: WeaponId;
  angularError: number;
  sample: [number, number];
  direction: [number, number, number];
  cameraDirection: [number, number, number];
  spread: number;
  ads: boolean;
  stance: Stance;
  moving: boolean;
} | null = null;
let lastGrenadeExplosionProfile = {
  presentationDetachMs: 0,
  audioMs: 0,
  visualMs: 0,
  targetDamageMs: 0,
  selfDamageMs: 0,
  totalSyncMs: 0,
};
let lastBotEliminationProfile = {
  deathDropMs: 0,
  deathPoseMs: 0,
  rewardAndFeedMs: 0,
  reinforcementMs: 0,
  totalSyncMs: 0,
};
let fieldSupport = createFieldSupportState();
let overdriveState: OverdriveState = createOverdriveState(0);
let overdriveClaimGeneration = -1;
let overdriveClaimLastSentAt = Number.NEGATIVE_INFINITY;
let overdriveSpawns = 0;
let overdrivePickups = 0;
let overdriveExpiries = 0;
let bestStreakThisMatch = 0;
let matchScoreRecorded = false;
let highScores: HighScoreEntry[] = [];
try { highScores = loadHighScores(localStorage); } catch { /* Gameplay remains available when persistent storage is blocked. */ }
let gunRangeScores: GunRangeScoreEntry[] = [];
try { gunRangeScores = loadGunRangeScores(localStorage); } catch { /* Range board is optional when storage is blocked. */ }
const leaderboardInstallation = leaderboardInstallId(localStorage);
const LEADERBOARD_BUILD_ID = 'neighbourhood-overdrive-pass31';
const PASS62_DIAGNOSTIC_BUILD_ID = 'atomic-acres-pass62-graphics-refinement-hitl';
const PASS61_DIAGNOSTIC_SOURCE_ID = 'parent-b1af49b-pass60-live';
const localMultiplayerQa = new URLSearchParams(window.location.search).get('multiplayerQa') === '1'
  && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
const localArenaSwitchQaDelayMs = localMultiplayerQa
  ? Math.min(1_000, Math.max(0, Number(new URLSearchParams(window.location.search).get('arenaSwitchQaDelayMs')) || 0))
  : 0;
let globalLeaderboardState: 'pending' | 'live' | 'cached' | 'saved' = GLOBAL_LEADERBOARD_ENDPOINT && !localMultiplayerQa ? 'pending' : 'cached';
const highScoreChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('atomic-acres:high-scores:v2') : null;
let scoutSweepUntil = 0;
let yardhawk: YardhawkEntity | null = null;
const strikeMissiles: StrikeMissileEntity[] = [];
const hunterDrones: HunterDroneEntity[] = [];
const deferredSupportDisposals: THREE.Object3D[] = [];
let nukeSequence: NukeSequence | null = null;
let triPassTargeting: TriPassTargeting | null = null;
let tacticalMapOpen = false;
let lastStrikeMapDrawAt = Number.NEGATIVE_INFINITY;
let triPassHostileMarkers: TriPassHostileMarker[] = [];
let yardhawkExplosions = 0;
let triPassLaunches = 0;
let triPassImpacts = 0;
let triPassLastImpactDelayMs: number | null = null;
let hunterSwarmLaunches = 0;
let hunterSwarmImpacts = 0;
let nukeLaunches = 0;
let nukeDetonations = 0;
let supportExplosionFrameSerial = 0;
let lastSupportExplosionProfile: ExplosionSyncProfile | null = null;
let lastSupportExplosionFrameProfile: ExplosionFrameProfile = {
  frameSerial: -1,
  sources: [],
  impacts: 0,
  totalSyncMs: 0,
  maxImpactSyncMs: 0,
};

function recordSupportExplosionProfile(profile: ExplosionSyncProfile): void {
  lastSupportExplosionProfile = profile;
  if (lastSupportExplosionFrameProfile.frameSerial !== supportExplosionFrameSerial) {
    lastSupportExplosionFrameProfile = {
      frameSerial: supportExplosionFrameSerial,
      sources: [profile.source],
      impacts: 1,
      totalSyncMs: profile.totalSyncMs,
      maxImpactSyncMs: profile.totalSyncMs,
    };
    return;
  }
  lastSupportExplosionFrameProfile = {
    ...lastSupportExplosionFrameProfile,
    sources: [...lastSupportExplosionFrameProfile.sources, profile.source],
    impacts: lastSupportExplosionFrameProfile.impacts + 1,
    totalSyncMs: lastSupportExplosionFrameProfile.totalSyncMs + profile.totalSyncMs,
    maxImpactSyncMs: Math.max(lastSupportExplosionFrameProfile.maxImpactSyncMs, profile.totalSyncMs),
  };
}
const processedNonces = new Set<number>();
const remoteShotAdmissions = new Map<string, RemoteShotAdmissionState>();
const authoritativeShotAdmissions = new Map<string, AuthoritativeShotAdmissionState>();
const admittedRemoteShots = new Map<string, Map<number, AdmittedRemoteShot>>();
const admittedRemoteMelees = new Map<string, Map<number, AdmittedRemoteMelee>>();
const admittedRemoteExplosions = new Map<string, Map<number, AdmittedRemoteExplosion>>();
const remoteSupportAuthorities = new Map<string, RemoteSupportAuthorityState>();
const remoteGrenadeAuthorities = new Map<string, RemoteGrenadeAuthorityState>();
const remoteHealthAuthorities = new Map<string, RemoteHealthAuthorityState>();
const peerTimingStates = new Map<string, PeerTimingState>();
const incomingCombatRewindMs = new Map<number, number>();
const localPositionHistory: CombatantPoseSample[] = [];
let localCombatEventSeq = 0;
let localContinuity = 1;
let localSnapshotRateState: SnapshotRateState = createSnapshotRateState(performance.now());
let receiverSequenceGaps = 0;
let receiverReordered = 0;
let outboundFeedbackSequenceGaps = 0;
let outboundFeedbackReordered = 0;
let outboundFeedbackPressure = 0;
let localShotSeq = 0;
let localFireSeq = 0;
const shotSessionId = crypto.randomUUID();
const resolvedShotRequests = new Map<string, ShotResultMessage>();
const presentedShotResults = new Set<string>();
const shotProtocolTelemetry: Record<string, number> = {};
function recordShotProtocol(label: string): void {
  shotProtocolTelemetry[label] = (shotProtocolTelemetry[label] ?? 0) + 1;
}
const combatAdmissionTelemetry: Record<string, number> = {};
const localSupportNonces = new Map<OffensiveSupportSource, number>();
const remoteHitAdmissionTelemetry: Record<string, number> = {};
function recordRemoteHitAdmission(label: string): void {
  remoteHitAdmissionTelemetry[label] = (remoteHitAdmissionTelemetry[label] ?? 0) + 1;
}
const supportNetworkHitTelemetry: Record<OffensiveSupportSource, { sent: number; blocked: number; outOfRange: number; missingAuthorization: number }> = {
  yardhawk: { sent: 0, blocked: 0, outOfRange: 0, missingAuthorization: 0 },
  'tri-pass': { sent: 0, blocked: 0, outOfRange: 0, missingAuthorization: 0 },
  'hunter-swarm': { sent: 0, blocked: 0, outOfRange: 0, missingAuthorization: 0 },
  nuke: { sent: 0, blocked: 0, outOfRange: 0, missingAuthorization: 0 },
};
const remoteMeleeAdmissions = new Map<string, RemoteMeleeAdmissionState>();
const remotePingAdmissions = new Map<string, TeamPingAdmissionState>();
let localPingAdmission = createTeamPingAdmissionState();
const activeTeamPings: ActiveTeamPing[] = [];
const deathDrops: DeathDropEntity[] = [];
const authorizedRemotePickups = new Map<string, { weapon: PrimaryWeaponId; expiresAt: number }>();
const verifiedRemoteKills = new Map<string, number>();
const weaponActionHistory: string[] = [];
let gameStarted = false;
let refreshWarningUntil = 0;
let gameMode: 'solo' | 'host' | 'client' = 'solo';
let privateMatchMode: MatchMode = 'tdm';
let privateMatchConfig: PrivateMatchConfig = DEFAULT_PRIVATE_MATCH_CONFIG;
let privateLobbySnapshot: LobbySnapshot | null = null;
let privateLobbyRevision = 0;
let privateMatchActiveAtHostTimeMs: number | null = null;
let privateMatchActiveAtEpochMs: number | null = null;
let hostTimeMapping: HostTimeMapping = createHostTimeMapping();
let localLobbyPingMs: number | null = null;
let localLobbyReady = false;
let localDhv: Dhv = 10;
let localResumeToken = '';
let lobbyArenaSyncPromise: Promise<void> = Promise.resolve();
let lobbyClockTimer: ReturnType<typeof setTimeout> | null = null;
let stateBroadcastTimer: ReturnType<typeof setTimeout> | null = null;
let hostedBotStateSeq = 0;
let lastHostedBotStateSeq = -1;
const hostLobbyMembers = new Map<string, LobbyMember>();
const hostLobbyTokens = new Map<string, string>();
const hostDisconnectedAt = new Map<string, number>();
const authoritativeScores = new Map<string, PlayerScore>();

function memberDhv(id: string): Dhv {
  return privateLobbySnapshot?.members.find((member) => member.id === id)?.dhv
    ?? hostLobbyMembers.get(id)?.dhv
    ?? (id === player.id ? localDhv : 10);
}

function handicapSidearm(primary: PrimaryWeaponId, dhv = localDhv): WeaponId {
  return dhv === 'X' ? 'magnum' : deployedWeapons(primary)[1];
}

function handicapLoadout(primary: PrimaryWeaponId, dhv = localDhv): readonly [PrimaryWeaponId, WeaponId] {
  return [primary, handicapSidearm(primary, dhv)];
}

function handicapOutgoingDamage(attackerId: string, damage: number, weapon?: WeaponId): number {
  const dhv = memberDhv(attackerId);
  return applyDhvWeaponOutgoingDamage(damage, dhv, weapon === 'magnum');
}
let triggerHeld = false;
let targetHits = 0;
let rangeScore = 0;
let rangeShotsFired = 0;
let roundShotsFired = 0;
let roundHitShots = 0;
let roundHeadshots = 0;
let roundDamageDealt = 0;
let roundDamageTaken = 0;
let rangePrimaryUnlocked = false;
let accumulator = 0;
let frameCount = 0;
let recoilVisual = 0;
let recoilCamera = { pitch: 0, yaw: 0 };
let landingImpulse = 0;
let lastFallDamage = 0;
let lastFallImpactSpeed = 0;
let weaponBob = 0;
let cameraHeightOffset = 0;
let cameraRoll = 0;
let currentSprinting = false;
let stanceRecoveryUntil = 0;
let sprintRecoveryUntil = 0;
let deferredFireAt = 0;
let lastGroundedAt = 0;
let jumpQueuedAt = -10_000;
let lastDamageAt = -10_000;
let footstepAccumulator: FootstepAccumulator = { distance: 0, side: 0 };
let lastFrame = performance.now();
let lastWindowBlurAt = -Infinity;
const framePacing = new FramePacingSampler();
let lastHudAt = 0;
let lastFpsHudAt = -Infinity;
let minimapRenderCount = 0;
let minimapLandmarksRendered: Array<{ id: string; kind: MinimapLandmarkKind; label: string }> = [];
let lastPlayerSpawnIndex = -1;
const lastBotSpawnIndices = new Map<Team, number>();
const recentDeathPositions: Array<{ point: THREE.Vector3; at: number }> = [];
const lastBotSpawnAudit = new Map<Team, { selectedIndex: number; score: number; reason: string }>();
let spawnFlipHysteresis: [SpawnFlipHysteresis, SpawnFlipHysteresis] = [
  createSpawnFlipHysteresis(),
  createSpawnFlipHysteresis(),
];
let lastPlayerSpawnAudit: {
  previousIndex: number;
  selectedIndex: number;
  selectedVisibleThreats: number;
  minimumVisibleThreats: number;
  safeTierCount: number;
  selectedSide: Team;
  flipped: boolean;
  score: number;
  reason: string;
  mode: SpawnMode;
  population: number;
} | null = null;
let debugRenderPaused = new URLSearchParams(window.location.search).get('renderPaused') === '1';
let debugShadowProbe: THREE.Mesh | null = null;
const debugCaptureCameraPosition = new THREE.Vector3();
let debugCaptureCameraYaw = 0;
let debugCaptureCameraPitch = 0;
let debugCaptureCameraActive = false;
let debugCaptureViewmodelHidden = false;
let matchState: MatchState = createMatch(performance.now(), selectedArena.matchRules);
let matchFinished = false;
let matchDiagnostics: MatchDiagnostics | null = null;
type DownloadableJson = Readonly<{ filename: string; json: string }>;
let lastMatchDownloads: Readonly<{ summary: DownloadableJson; technical: DownloadableJson }> | null = null;
let matchDiagnosticsStartedAt = performance.now();
let matchDiagnosticSequence = 0;
const humanDamageTimeline: HumanDamageEventInput[] = [];
let droppedHumanDamageEvents = 0;
const MAX_HUMAN_DAMAGE_EVENTS = 8_192;
type MatchDiagnosticDetails = Partial<Omit<MatchDiagnosticInput, 'monotonicMs' | 'localEpochMs' | 'eventId' | 'eventType' | 'admission'>>;

function recordMatchDiagnostic(eventType: string, admission: DiagnosticAdmission, details: MatchDiagnosticDetails = {}, correlationId?: string): void {
  if (!matchDiagnostics) return;
  const now = performance.now();
  matchDiagnostics.record({
    ...details,
    monotonicMs: Math.round(now * 10) / 10,
    localEpochMs: Date.now(),
    matchTimeMs: Math.max(0, Math.round((now - matchDiagnosticsStartedAt) * 10) / 10),
    eventId: correlationId ?? `${eventType}-${matchDiagnosticSequence}`,
    eventType,
    admission,
  });
  matchDiagnosticSequence += 1;
}

function beginMatchDiagnostics(mode: 'solo' | 'host' | 'client', startedAt: number): void {
  lastMatchDownloads = null;
  syncMatchReportDownloads();
  humanDamageTimeline.length = 0;
  droppedHumanDamageEvents = 0;
  matchDiagnosticsStartedAt = startedAt;
  matchDiagnosticSequence = 0;
  matchDiagnostics = new MatchDiagnostics({
    buildId: PASS62_DIAGNOSTIC_BUILD_ID,
    sourceId: PASS61_DIAGNOSTIC_SOURCE_ID,
    sessionId: `${player.id}:${Date.now()}`,
    role: mode === 'solo' ? 'offline' : mode === 'host' ? 'host' : 'guest',
    arena: selectedArena.id,
    mode: mode === 'solo' ? 'solo' : privateMatchMode,
    technicalContext: {
      renderProfile,
      renderer: rendererLabel,
      viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio },
      browser: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency },
      matchRules: selectedArena.matchRules,
      weaponBalance: Object.fromEntries(Object.values(WEAPONS).map((weapon) => [weapon.id, {
        damage: weapon.damage,
        minimumDamage: weapon.minimumDamage,
        rpm: weapon.rpm,
        falloffStart: weapon.falloffStart,
        falloffEnd: weapon.falloffEnd,
        recoilPitch: weapon.recoilPitch,
        recoilYaw: weapon.recoilYaw,
        headMultiplier: weapon.headMultiplier,
        penetration: weapon.penetration,
      }])),
    },
  });
  recordMatchDiagnostic('match-start', 'observed', { actorId: player.id, reason: 'local match diagnostics initialized' });
}

function combatantLabel(id: string): { name: string; kind: string } {
  if (id === player.id) return { name: player.name, kind: 'player' };
  const remote = remotes.get(id);
  if (remote) return { name: remote.snapshot.name, kind: 'player' };
  const member = privateLobbySnapshot?.members.find((entry) => entry.id === id);
  if (member) return { name: member.name, kind: 'player' };
  const bot = bots.get(id) ?? dormantBots.get(id);
  if (bot) return { name: bot.name, kind: id.startsWith('host-bot-') ? 'hosted-bot' : 'solo-bot' };
  const target = arena.targets.find((entry) => entry.id === id);
  if (target) return {
    name: target.kind === 'flying-cat' ? 'Flying Black Cat' : `${target.scoreValue}-point range target`,
    kind: target.kind === 'flying-cat' ? 'flying-target' : 'practice-target',
  };
  if (id === 'environment') return { name: 'Environment', kind: 'environment' };
  return { name: 'Unknown combatant', kind: 'unknown' };
}

type DamageRecord = Readonly<{
  actorId: string;
  targetId: string;
  weaponOrEffect: string;
  healthBefore: number;
  healthAfter: number;
  damageRequested: number;
  damageApplied: number;
  reason: string;
  hitZone?: string;
  critical?: boolean;
  wallbang?: boolean;
  penetrationMultiplier?: number;
  distanceMeters?: number;
}>;

function recordDamageEvent(details: DamageRecord): void {
  const actor = combatantLabel(details.actorId);
  const target = combatantLabel(details.targetId);
  recordMatchDiagnostic('damage-applied', details.damageApplied > 0 ? 'accepted' : 'rejected', {
    ...details,
    actorKind: actor.kind,
    targetKind: target.kind,
  });
  if (details.damageApplied <= 0) return;
  const now = performance.now();
  const event: HumanDamageEventInput = {
    elapsedMs: Math.max(0, now - matchDiagnosticsStartedAt),
    timestamp: new Date().toISOString(),
    from: actor.name,
    fromKind: actor.kind,
    to: target.name,
    toKind: target.kind,
    damage: details.damageApplied,
    healthBefore: details.healthBefore,
    healthAfter: details.healthAfter,
    source: details.weaponOrEffect,
    hitZone: details.hitZone,
    critical: details.critical,
    wallbang: details.wallbang,
    penetrationMultiplier: details.penetrationMultiplier,
    distanceMeters: details.distanceMeters,
  };
  if (humanDamageTimeline.length >= MAX_HUMAN_DAMAGE_EVENTS) {
    humanDamageTimeline.shift();
    droppedHumanDamageEvents += 1;
  }
  humanDamageTimeline.push(event);
}

function downloadJsonFile(exported: DownloadableJson): void {
  const url = URL.createObjectURL(new Blob([exported.json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = exported.filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadMatchDiagnostics(): void {
  const exported = lastMatchDownloads?.technical ?? matchDiagnostics?.export();
  if (exported) downloadJsonFile(exported);
}

function downloadMatchSummary(): void {
  if (lastMatchDownloads) downloadJsonFile(lastMatchDownloads.summary);
}

function syncMatchReportDownloads(): void {
  const reports = document.querySelector<HTMLElement>('#last-match-reports');
  if (reports) reports.hidden = !lastMatchDownloads;
}
let respawnEndsAt = 0;
let respawnTimer: ReturnType<typeof setTimeout> | null = null;
let previousHudScores: [number, number] = [0, 0];
let adsHeld = false;
let mouseTriggerHeld = false;
let mouseAdsHeld = false;
let gamepadMove = { x: 0, y: 0 };
let gamepadLookRate = { yaw: 0, pitch: 0 };
let gamepadSprint = false;
let gamepadTriggerArmed = true;
let gamepadAdsArmed = true;

let previousGamepadButtons: boolean[] = [];
let gamepadSupportSelection: FieldSupportId = 'scout-sweep';
let playerGrounded = false;
let wasGrounded = false;
let sensitivity = 1;
let controllerSensitivity = 1;
let preferredFov = 82;
let botsFrozen = false;
let debugBotStanceOverride: PlayerSnapshot['stance'] | null = null;
let debugBotSpeedOverride = 0;
let debugInputUnlocked = false;
let debugAdsOverride: boolean | null = null;
let debugReloadProgress: number | null = null;
let characterPhysics: CharacterPhysics | null = null;
let arenaSelectionReady = false;
let arenaSelectionTask: Promise<void> = Promise.resolve();

function gameplayInputEnabled(): boolean {
  return gameStarted && player.alive && matchState.phase === 'active' && menu.classList.contains('hidden');
}

function playerSimulationEnabled(): boolean {
  return gameStarted && player.alive && matchState.phase !== 'ended' && menu.classList.contains('hidden');
}

function interruptReload(force = false, now = performance.now()): void {
  if (!player.reloadState) {
    weaponView.cancelReload();
    return;
  }
  if (force || cancelReload(player.reloadState, now)) {
    player.reloadState = null;
    weaponView.cancelReload();
  }
}

function clearGameplayInput(): void {
  interruptReload(false);
  keys.clear();
  gamepadMove = { x: 0, y: 0 };
  gamepadLookRate = { yaw: 0, pitch: 0 };
  gamepadSprint = false;
  mouseTriggerHeld = false;
  mouseAdsHeld = false;
  triggerHeld = false;
  adsHeld = false;
  currentSprinting = false;
  jumpQueuedAt = -10_000;
  player.velocity.x = 0;
  player.velocity.z = 0;
}

function setStatus(text: string, kind: 'ok' | 'warn' | 'error' = 'ok'): void {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

function selectLobbyCodeForManualCopy(code: string): void {
  const range = document.createRange();
  range.selectNodeContents(roomCodeEl);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  element<HTMLInputElement>('#room-input').value = code;
}

function currentMatchRules() {
  if (gameMode === 'solo') return selectedArena.matchRules;
  const config = privateLobbySnapshot?.config ?? privateMatchConfig;
  return { durationMs: config.durationMs, scoreLimit: null };
}

function areCombatantsHostile(aId: string, aTeam: Team, bId: string, bTeam: Team): boolean {
  if (gameMode === 'solo') return aTeam !== bTeam;
  return playersAreHostile(privateMatchMode, { id: aId, team: aTeam }, { id: bId, team: bTeam });
}

function renderHighScores(): void {
  const list = element<HTMLOListElement>('#high-score-list');
  const card = element<HTMLElement>('#high-score-card');
  const currentName = normalizeRequiredPlayerName(element<HTMLInputElement>('#player-name').value) ?? storedPlayerName;
  if (selectedArena.id === 'gun-range') {
    card.dataset.board = 'gun-range';
    element<HTMLElement>('#global-leaderboard-status').textContent = 'LOCAL RANGE RECORDS';
    element<HTMLElement>('#high-score-title').textContent = 'GUN RANGE LEADERBOARD';
    element<HTMLElement>('#high-score-footnote').textContent = 'Timed 2-minute rounds · ranked by score, then accuracy · local to this browser.';
    if (gunRangeScores.length === 0) {
      list.innerHTML = '<li class="empty">Run a 2-minute score attack to set the first range record.</li>';
    } else {
      list.innerHTML = gunRangeScores.slice(0, 8).map((entry, index) => (
        `<li><b>${index + 1}</b><strong>${escapeHtml(entry.name)}</strong><span>${entry.score.toLocaleString()} PTS</span><small>${entry.hits} HITS · ${entry.accuracy}% ACC · ${entry.shots} SHOTS</small></li>`
      )).join('');
    }
    const best = personalBestGunRange(gunRangeScores, currentName);
    element<HTMLElement>('#personal-best').textContent = best
      ? `YOUR BEST ${best.score.toLocaleString()} · ${best.accuracy}% ACC`
      : 'NO RANGE PERSONAL BEST';
    return;
  }
  card.dataset.board = 'streak';
  element<HTMLElement>('#high-score-title').textContent = 'ACRES LEADERBOARD';
  element<HTMLElement>('#high-score-footnote').textContent = 'Global streak records sync across builds and devices · local cache remains available offline.';
  if (highScores.length === 0) {
    list.innerHTML = '<li class="empty">Set the first named streak record.</li>';
  } else {
    list.innerHTML = highScores.slice(0, 8).map((entry, index) => (
      `<li><b>${index + 1}</b><strong>${escapeHtml(entry.name)}</strong><span>×${entry.bestStreak} STREAK</span><small>${entry.kills} KILLS · ${entry.deaths}D${entry.won ? ' · WIN' : ''}</small></li>`
    )).join('');
  }
  const best = personalBest(highScores, currentName);
  element<HTMLElement>('#personal-best').textContent = best
    ? `YOUR BEST ×${best.bestStreak} · ${best.kills} KILLS`
    : 'NO PERSONAL BEST';
  element<HTMLElement>('#global-leaderboard-status').textContent = globalLeaderboardState === 'live'
    ? 'GLOBAL STREAK RECORDS · LIVE'
    : globalLeaderboardState === 'saved'
      ? 'GLOBAL STREAK RECORDS · SAVED'
      : globalLeaderboardState === 'pending'
        ? 'GLOBAL STREAK RECORDS · CONNECTING'
        : 'GLOBAL STREAK RECORDS · OFFLINE CACHE';
}

function persistMergedGunRangeScores(incoming: readonly unknown[]): void {
  gunRangeScores = mergeGunRangeScores(gunRangeScores, incoming);
  try {
    saveGunRangeScores(localStorage, gunRangeScores);
  } catch {
    /* optional */
  }
  renderHighScores();
}

function recordGunRangeRound(): void {
  if (!isGunRange(selectedArena.id)) return;
  const recordedAt = Date.now();
  const entry = createGunRangeScoreEntry(player.name, rangeScore, targetHits, rangeShotsFired, recordedAt);
  if (!entry) return;
  persistMergedGunRangeScores([entry]);
  addFeed(`RANGE ROUND · ${entry.score.toLocaleString()} PTS · ${entry.hits} HITS · ${entry.accuracy}% ACC`, 'gold');
}

function persistMergedHighScores(incoming: readonly unknown[], notifyTabs = true): void {
  highScores = mergeHighScores(highScores, incoming);
  try {
    saveHighScores(localStorage, highScores);
  } catch {
    setStatus('Records cannot persist in this browser context.', 'warn');
  }
  renderHighScores();
  if (notifyTabs) highScoreChannel?.postMessage(highScores);
}

function sendLeaderboardSync(): void {
  if (network.role !== 'offline') network.send({ type: 'leaderboard-sync', by: player.id, season: LEADERBOARD_SEASON, entries: highScores });
}

async function refreshGlobalLeaderboard(): Promise<void> {
  if (!GLOBAL_LEADERBOARD_ENDPOINT || localMultiplayerQa) {
    globalLeaderboardState = 'cached';
    renderHighScores();
    return;
  }
  globalLeaderboardState = 'pending';
  renderHighScores();
  try {
    const entries = await fetchGlobalLeaderboard();
    persistMergedHighScores(entries);
    globalLeaderboardState = 'live';
  } catch {
    globalLeaderboardState = 'cached';
  }
  renderHighScores();
}

function recordImmediateStreak(syncGlobal = true): void {
  const existing = personalBest(highScores, player.name);
  if (existing && existing.bestStreak >= fieldSupport.streak) return;
  const entry = immediateStreakEntry(
    leaderboardInstallation,
    player.name,
    fieldSupport.streak,
    player.kills,
    player.deaths,
  );
  if (!entry) return;
  persistMergedHighScores([entry]);
  if (network.role !== 'offline') network.send({ type: 'high-score', by: player.id, season: LEADERBOARD_SEASON, entry });
  if (!syncGlobal || localMultiplayerQa) return;
  const nameKey = entry.id.replace(/^global:/, '');
  void submitGlobalStreak({
    name: entry.name,
    streak: entry.bestStreak,
    kills: entry.kills,
    deaths: entry.deaths,
    installId: leaderboardInstallation,
    buildId: LEADERBOARD_BUILD_ID,
    idempotencyKey: `${leaderboardInstallation}:${nameKey}:${entry.bestStreak}`.slice(0, 120),
    season: LEADERBOARD_SEASON,
  }).then((accepted) => {
    globalLeaderboardState = accepted ? 'saved' : 'cached';
    renderHighScores();
  }).catch(() => {
    globalLeaderboardState = 'cached';
    renderHighScores();
  });
}

function recordCompletedMatch(): void {
  if (matchScoreRecorded || matchState.phase !== 'ended') return;
  matchScoreRecorded = true;
  if (isGunRange(selectedArena.id)) {
    recordGunRangeRound();
    return;
  }
  const recordedAt = Date.now();
  const authoritativeLocal = gameMode === 'solo' ? null : authoritativeScores.get(player.id) ?? null;
  const entry: HighScoreEntry = {
    id: `score:${player.id}:${recordedAt.toString(36)}`,
    name: player.name,
    kills: Math.min(MAX_MATCH_KILLS, Math.max(0, Math.floor(authoritativeLocal?.kills ?? player.kills))),
    deaths: Math.min(200, Math.max(0, Math.floor(authoritativeLocal?.deaths ?? player.deaths))),
    bestStreak: Math.min(MAX_MATCH_KILLS, Math.max(0, Math.floor(bestStreakThisMatch))),
    won: gameMode !== 'solo' && privateMatchMode === 'ffa'
      ? matchState.winnerPlayerId === player.id
      : matchState.winner === player.team,
    recordedAt,
  };
  persistMergedHighScores([entry]);
  if (network.role !== 'offline') network.send({ type: 'high-score', by: player.id, season: LEADERBOARD_SEASON, entry });
}

function requirePlayerName(): string | null {
  const input = element<HTMLInputElement>('#player-name');
  const error = element<HTMLElement>('#player-name-error');
  const name = normalizeRequiredPlayerName(input.value);
  input.classList.toggle('invalid', !name);
  error.hidden = Boolean(name);
  if (!name) {
    setStatus('Enter a callsign before deployment.', 'error');
    input.focus();
    return null;
  }
  input.value = name;
  player.name = name;
  storedPlayerName = name;
  try { localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name); } catch { /* Match start does not depend on storage access. */ }
  renderHighScores();
  return name;
}

function showFatalError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  triggerHeld = false;
  setStatus(`Game paused: ${message}`, 'error');
  menu.classList.remove('hidden');
  const banner = element<HTMLElement>('#banner');
  banner.innerHTML = '<strong>SYSTEM PAUSED</strong><span>Reload the page to re-enter the test block.</span>';
  banner.hidden = false;
  console.error('[Atomic Acres fatal]', error);
}

const webRtcSupported = typeof window.RTCPeerConnection === 'function';
if (!webRtcSupported) {
  element<HTMLButtonElement>('#host').disabled = true;
  element<HTMLButtonElement>('#join').disabled = true;
  setStatus('This browser lacks WebRTC; solo training is still available.', 'warn');
} else if (typeof canvas.requestPointerLock !== 'function') {
  setStatus('Pointer lock is unavailable; keyboard movement works but mouse aim may not.', 'warn');
}

const network = new ArenaNetwork(onNetworkMessage, setStatus);

function randomLobbyCredential(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `room_${Date.now().toString(36)}_${Math.floor(protocolRandom() * Number.MAX_SAFE_INTEGER).toString(36)}`;
}

function restoreRoomIdentity(roomCode: string): void {
  const key = `atomic-acres:room-identity:${roomCode}`;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { playerId?: unknown; token?: unknown } | null;
    if (parsed && typeof parsed.playerId === 'string' && parsed.playerId.length > 0 && parsed.playerId.length <= 80
      && typeof parsed.token === 'string' && parsed.token.length >= 24 && parsed.token.length <= 128) {
      player.id = parsed.playerId;
      localResumeToken = parsed.token;
      return;
    }
  } catch { /* A fresh bounded identity is safe when session storage is blocked or malformed. */ }
  localResumeToken = randomLobbyCredential();
  try { sessionStorage.setItem(key, JSON.stringify({ playerId: player.id, token: localResumeToken })); } catch { /* Rejoin becomes same-page only. */ }
}

function hidePrivateLobbyPresentation(): void {
  menu.classList.remove('private-lobby-active');
  element<HTMLElement>('#private-lobby').hidden = true;
}

function resetPrivateLobbyState(): void {
  if (lobbyClockTimer) clearTimeout(lobbyClockTimer);
  lobbyClockTimer = null;
  privateLobbySnapshot = null;
  privateLobbyRevision = 0;
  privateMatchActiveAtHostTimeMs = null;
  privateMatchActiveAtEpochMs = null;
  privateMatchMode = 'tdm';
  privateMatchConfig = DEFAULT_PRIVATE_MATCH_CONFIG;
  hostTimeMapping = createHostTimeMapping();
  localCombatEventSeq = 0;
  peerTimingStates.clear();
  localLobbyPingMs = null;
  localLobbyReady = false;
  localDhv = 10;
  localResumeToken = '';
  lobbyArenaSyncPromise = Promise.resolve();
  hostLobbyMembers.clear();
  hostLobbyTokens.clear();
  hostDisconnectedAt.clear();
  authoritativeScores.clear();
  hidePrivateLobbyPresentation();
}

function hostSnapshot(phase: LobbySnapshot['phase'] = privateLobbySnapshot?.phase ?? 'waiting'): LobbySnapshot {
  const members = [...hostLobbyMembers.values()].sort((a, b) => Number(b.id === player.id) - Number(a.id === player.id) || a.id.localeCompare(b.id));
  const scores = members.map((member) => authoritativeScores.get(member.id) ?? emptyPlayerScore(member.id));
  return {
    revision: privateLobbyRevision,
    hostId: player.id,
    phase,
    config: privateMatchConfig,
    members,
    scores,
    snapshotHostTimeMs: performance.now(),
    activeAtHostTimeMs: privateMatchActiveAtHostTimeMs,
    activeAtEpochMs: privateMatchActiveAtEpochMs,
  };
}

function broadcastHostLobby(phase: LobbySnapshot['phase'] = privateLobbySnapshot?.phase ?? 'waiting'): void {
  if (network.role !== 'host') return;
  const localMember = hostLobbyMembers.get(player.id);
  if (localMember) {
    player.team = localMember.team;
    element<HTMLSelectElement>('#team').value = String(localMember.team);
  }
  privateLobbyRevision += 1;
  privateLobbySnapshot = hostSnapshot(phase);
  network.setCapacity(privateLobbySnapshot.config.capacity);
  for (const member of privateLobbySnapshot.members) network.setPlayerTeam(member.id, member.team);
  const message: LobbyStateMessage = { type: 'lobby-state', by: player.id, snapshot: privateLobbySnapshot, nonce: randomNonce() };
  network.send(message);
  renderPrivateLobby();
}

function initializeHostLobby(): void {
  privateMatchConfig = selectedArena.id === 'gun-range'
    ? { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: 'gun-range', mode: 'ffa', hostedBotCount: 0, autoBalance: false, durationMs: selectedArena.matchRules.durationMs ?? 120_000 }
    : { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: selectedArena.id };
  privateMatchMode = privateMatchConfig.mode;
  localResumeToken = randomLobbyCredential();
  hostLobbyTokens.set(player.id, localResumeToken);
  hostLobbyMembers.set(player.id, {
    id: player.id,
    name: player.name,
    team: player.team,
    ready: false,
    connected: true,
    pingMs: 0,
    dhv: localDhv,
  });
  authoritativeScores.set(player.id, emptyPlayerScore(player.id));
  roomCard.hidden = false;
  roomCodeEl.textContent = network.roomCode;
  broadcastHostLobby('waiting');
  setStatus('Private lobby ready — share the invite and ready up', 'ok');
}

function sendLobbyJoin(): void {
  if (network.role !== 'client') return;
  if (!localResumeToken) restoreRoomIdentity(network.roomCode);
  const message: LobbyJoinMessage = {
    type: 'lobby-join',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: player.id,
    name: player.name,
    requestedTeam: player.team,
    resumeToken: localResumeToken,
    nonce: randomNonce(),
  };
  network.send(message);
  scheduleClockPing(0);
  renderPrivateLobby();
}

function rejectLobbyPlayer(playerId: string, reason: 'room-full' | 'rejoin-denied' | 'match-active'): void {
  network.sendToPlayer(playerId, { type: 'lobby-reject', reason, nonce: randomNonce() });
  window.setTimeout(() => network.disconnectPlayer(playerId), 75);
}

function admitLobbyJoin(message: LobbyJoinMessage): void {
  if (network.role !== 'host') return;
  const existing = hostLobbyMembers.get(message.playerId);
  const currentPhase = privateLobbySnapshot?.phase ?? 'waiting';
  if (existing) {
    if (hostLobbyTokens.get(message.playerId) !== message.resumeToken) {
      rejectLobbyPlayer(message.playerId, 'rejoin-denied');
      return;
    }
    hostDisconnectedAt.delete(message.playerId);
    const restored = { ...existing, name: message.name, connected: true, pingMs: message.playerId === player.id ? 0 : existing.pingMs };
    hostLobbyMembers.set(message.playerId, restored);
    network.setPlayerTeam(message.playerId, restored.team);
  } else {
    if (currentPhase !== 'waiting') {
      rejectLobbyPlayer(message.playerId, 'match-active');
      return;
    }
    if (hostLobbyMembers.size >= privateMatchConfig.capacity) {
      rejectLobbyPlayer(message.playerId, 'room-full');
      return;
    }
    hostLobbyTokens.set(message.playerId, message.resumeToken);
    hostLobbyMembers.set(message.playerId, {
      id: message.playerId,
      name: message.name,
      team: message.requestedTeam,
      ready: false,
      connected: true,
      pingMs: null,
      dhv: 10,
    });
    authoritativeScores.set(message.playerId, emptyPlayerScore(message.playerId));
  }
  if (currentPhase === 'waiting' && privateMatchConfig.autoBalance) {
    for (const member of balanceLobbyTeams([...hostLobbyMembers.values()])) hostLobbyMembers.set(member.id, { ...member, ready: false });
  }
  broadcastHostLobby(currentPhase);
  if (privateMatchActiveAtHostTimeMs !== null && privateMatchActiveAtEpochMs !== null && currentPhase !== 'waiting') {
    network.sendToPlayer(message.playerId, {
      type: 'lobby-start', by: player.id, activeAtHostTimeMs: privateMatchActiveAtHostTimeMs,
      activeAtEpochMs: privateMatchActiveAtEpochMs, hostSentTimeMs: performance.now(),
      revision: privateLobbyRevision, nonce: randomNonce(),
    });
    sendAuthoritativeScores(message.playerId);
  }
}

function updateHostReady(message: LobbyReadyMessage): void {
  if (network.role !== 'host' || (privateLobbySnapshot?.phase ?? 'waiting') !== 'waiting') return;
  const member = hostLobbyMembers.get(message.by);
  if (!member?.connected) return;
  hostLobbyMembers.set(message.by, { ...member, ready: message.ready });
  broadcastHostLobby('waiting');
}

function updateHostTeam(message: LobbyTeamMessage): void {
  if (network.role !== 'host' || (privateLobbySnapshot?.phase ?? 'waiting') !== 'waiting' || privateMatchConfig.mode !== 'tdm') return;
  const member = hostLobbyMembers.get(message.by);
  if (!member?.connected) return;
  hostLobbyMembers.set(message.by, { ...member, team: message.team, ready: false });
  if (privateMatchConfig.autoBalance) {
    for (const balanced of balanceLobbyTeams([...hostLobbyMembers.values()])) hostLobbyMembers.set(balanced.id, { ...balanced, ready: false });
  }
  broadcastHostLobby('waiting');
}

function updateHostHandicap(message: LobbyHandicapMessage): void {
  if (network.role !== 'host' || (privateLobbySnapshot?.phase ?? 'waiting') !== 'waiting') return;
  const member = hostLobbyMembers.get(message.by);
  if (!member?.connected) return;
  hostLobbyMembers.set(message.by, { ...member, dhv: message.dhv, ready: false });
  if (message.by === player.id) localDhv = message.dhv;
  broadcastHostLobby('waiting');
}

function applyHostLobbyConfig(config: PrivateMatchConfig): void {
  if (network.role !== 'host' || (privateLobbySnapshot?.phase ?? 'waiting') !== 'waiting') return;
  if (hostLobbyMembers.size > config.capacity) {
    setStatus(`Room already has ${hostLobbyMembers.size} players; capacity cannot be ${config.capacity}.`, 'warn');
    renderPrivateLobby();
    return;
  }
  privateMatchConfig = config;
  privateMatchMode = config.mode;
  network.setCapacity(config.capacity);
  const nextMembers = config.autoBalance && config.mode === 'tdm'
    ? balanceLobbyTeams([...hostLobbyMembers.values()])
    : [...hostLobbyMembers.values()];
  for (const member of nextMembers) hostLobbyMembers.set(member.id, { ...member, ready: false });
  broadcastHostLobby('waiting');
}

function markLobbyDisconnected(playerId: string): void {
  const member = hostLobbyMembers.get(playerId);
  if (!member || playerId === player.id) return;
  hostLobbyMembers.set(playerId, { ...member, connected: false, ready: false, pingMs: null });
  hostDisconnectedAt.set(playerId, performance.now());
  broadcastHostLobby(privateLobbySnapshot?.phase ?? 'waiting');
  window.setTimeout(() => {
    const disconnectedAt = hostDisconnectedAt.get(playerId);
    const current = hostLobbyMembers.get(playerId);
    if (!disconnectedAt || !current || current.connected || !rejoinReservationExpired(disconnectedAt, performance.now())) return;
    hostDisconnectedAt.delete(playerId);
    hostLobbyMembers.delete(playerId);
    hostLobbyTokens.delete(playerId);
    authoritativeScores.delete(playerId);
    remoteSupportAuthorities.delete(playerId);
    remoteGrenadeAuthorities.delete(playerId);
    remoteHealthAuthorities.delete(playerId);
    broadcastHostLobby(privateLobbySnapshot?.phase ?? 'waiting');
  }, REJOIN_GRACE_MS + 50);
}

function currentHostTimeMs(): number {
  const now = performance.now();
  if (network.role !== 'client') return now;
  hostTimeMapping = monotonicMappedHostNow(hostTimeMapping, now);
  return hostTimeMapping.lastHostTimeMs;
}

function createStateMessage(playerSnapshot = snapshot()): StateMessage {
  return {
    type: 'state',
    player: playerSnapshot,
    hostTimeMs: currentHostTimeMs(),
    continuity: localContinuity,
    rateHz: localSnapshotRateState.rateHz,
  };
}

function scheduleClockPing(delay = CLOCK_PING_INTERVAL_MS): void {
  if (lobbyClockTimer) clearTimeout(lobbyClockTimer);
  if (network.role !== 'client') return;
  lobbyClockTimer = setTimeout(() => {
    if (network.role !== 'client') return;
    const mappingReady = hostTimeMapping.sampleCount > 0;
    network.send({
      type: 'clock-ping', by: player.id, guestSentMonoMs: performance.now(),
      reportedOffsetMs: mappingReady ? hostTimeMapping.offsetMs : null,
      reportedRttMs: mappingReady ? hostTimeMapping.rttMs : null,
      reportedJitterMs: mappingReady ? hostTimeMapping.jitterMs : null,
      reportedUncertaintyMs: mappingReady ? hostTimeMapping.uncertaintyMs : null,
      nonce: randomNonce(),
    });
    scheduleClockPing();
  }, delay);
}

function acceptClockPong(message: Extract<GameMessage, { type: 'clock-pong' }>): void {
  if (network.role !== 'client' || message.forPlayerId !== player.id || message.by !== privateLobbySnapshot?.hostId) return;
  const observation = observeHostClock(hostTimeMapping, {
    guestSentMonoMs: message.guestSentMonoMs,
    hostReceivedMonoMs: message.hostReceivedMonoMs,
    hostSentMonoMs: message.hostSentMonoMs,
    guestReceivedMonoMs: performance.now(),
  });
  hostTimeMapping = observation.mapping;
  if (!observation.accepted) return;
  localLobbyPingMs = Math.round(hostTimeMapping.rttMs);
  renderPrivateLobby();
}

function sendAuthoritativeScores(targetPlayerId?: string): void {
  if (network.role !== 'host') return;
  const scores = [...authoritativeScores.values()].slice(0, privateMatchConfig.capacity + privateMatchConfig.hostedBotCount);
  const message: MatchScoreMessage = { type: 'match-score', by: player.id, scores, nonce: randomNonce() };
  if (targetPlayerId) network.sendToPlayer(targetPlayerId, message);
  else network.send(message);
}

function publishRangeScore(): void {
  if (selectedArena.id !== 'gun-range' || network.role === 'offline') return;
  const claim: RangeScoreClaimMessage = {
    type: 'range-score-claim', by: player.id, score: rangeScore, hits: targetHits, shots: rangeShotsFired, nonce: randomNonce(),
  };
  if (network.role === 'host') {
    const current = authoritativeScores.get(player.id) ?? emptyPlayerScore(player.id);
    authoritativeScores.set(player.id, { ...current, rangeScore, rangeHits: targetHits, rangeShots: rangeShotsFired });
    sendAuthoritativeScores();
  } else {
    network.send(claim);
  }
}

function acceptRangeScoreClaim(message: RangeScoreClaimMessage): void {
  if (network.role !== 'host' || selectedArena.id !== 'gun-range' || !hostLobbyMembers.has(message.by)) return;
  const current = authoritativeScores.get(message.by) ?? emptyPlayerScore(message.by);
  if (message.score < (current.rangeScore ?? 0) || message.hits < (current.rangeHits ?? 0) || message.shots < (current.rangeShots ?? 0)) return;
  authoritativeScores.set(message.by, { ...current, rangeScore: message.score, rangeHits: message.hits, rangeShots: message.shots });
  sendAuthoritativeScores();
}

function presentLocalDamageDelta(previous: PlayerScore | undefined, next: PlayerScore | undefined): void {
  if (!next) return;
  const dealt = next.damageDealt - (previous?.damageDealt ?? 0);
  const taken = next.damageTaken - (previous?.damageTaken ?? 0);
  if (dealt > 0) addFeed(`DAMAGE DEALT +${dealt} · ${next.damageDealt} TOTAL`, 'gold', { damageDealt: dealt });
  if (taken > 0) addFeed(`DAMAGE TAKEN +${taken} · ${next.damageTaken} TOTAL`, 'coral', { damageTaken: taken });
}

function recordAuthoritativeDamage(attackerId: string, victimId: string, damage: number): void {
  if (network.role !== 'host' || attackerId === victimId || damage <= 0) return;
  const previousLocal = authoritativeScores.get(player.id);
  const next = recordPlayerDamage(authoritativeScores, attackerId, victimId, damage);
  authoritativeScores.clear();
  for (const [id, score] of next) authoritativeScores.set(id, score);
  presentLocalDamageDelta(previousLocal, authoritativeScores.get(player.id));
  sendAuthoritativeScores();
}

function acceptAuthoritativeScores(message: MatchScoreMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId) return;
  const previousLocal = authoritativeScores.get(player.id);
  authoritativeScores.clear();
  for (const score of message.scores) {
    authoritativeScores.set(score.id, score);
    if (score.id === player.id) {
      player.kills = score.kills;
      player.deaths = score.deaths;
    }
    const remote = remotes.get(score.id);
    if (remote) remote.snapshot = { ...remote.snapshot, kills: score.kills, deaths: score.deaths };
  }
  if (privateLobbySnapshot) privateLobbySnapshot = { ...privateLobbySnapshot, scores: message.scores };
  presentLocalDamageDelta(previousLocal, authoritativeScores.get(player.id));
}

async function synchronizeLobbyArena(): Promise<void> {
  const arenaId = privateLobbySnapshot?.config.arenaId ?? privateMatchConfig.arenaId;
  if (selectedArena.id !== arenaId) await activateArenaSelection(arenaId);
}

async function beginPrivateMatch(
  mode: 'host' | 'client',
  activeAtHostTimeMs: number,
  activeAtEpochMs: number,
  observedHostTimeMs: number,
): Promise<void> {
  await lobbyArenaSyncPromise;
  await synchronizeLobbyArena();
  if (gameStarted) return;
  const arenaId = privateLobbySnapshot?.config.arenaId ?? privateMatchConfig.arenaId;
  if (selectedArena.id !== arenaId) {
    setStatus(`Could not synchronize ${arenaSelection(arenaId).displayName}; deployment stopped.`, 'error');
    return;
  }
  privateMatchActiveAtHostTimeMs = activeAtHostTimeMs;
  privateMatchActiveAtEpochMs = activeAtEpochMs;
  privateMatchMode = privateLobbySnapshot?.config.mode ?? privateMatchConfig.mode;
  const observedGuestMonoMs = performance.now();
  const activeAtLocalMonoMs = mode === 'host'
    ? activeAtHostTimeMs
    : hostTimeToGuestMono(hostTimeMapping, activeAtHostTimeMs, observedGuestMonoMs, observedHostTimeMs);
  startGame(mode, false, activeAtLocalMonoMs);
}

function hostStartPrivateMatch(): void {
  if (network.role !== 'host') return;
  const current = hostSnapshot('waiting');
  if (!canHostStart(current)) {
    setStatus('Every connected player must be ready before the host starts.', 'warn');
    return;
  }
  privateMatchActiveAtHostTimeMs = performance.now() + LOBBY_START_LEAD_MS;
  privateMatchActiveAtEpochMs = Date.now() + LOBBY_START_LEAD_MS;
  privateLobbyRevision += 1;
  privateLobbySnapshot = hostSnapshot('countdown');
  network.send({ type: 'lobby-state', by: player.id, snapshot: privateLobbySnapshot, nonce: randomNonce() });
  network.send({
    type: 'lobby-start', by: player.id, activeAtHostTimeMs: privateMatchActiveAtHostTimeMs,
    activeAtEpochMs: privateMatchActiveAtEpochMs, hostSentTimeMs: performance.now(),
    revision: privateLobbyRevision, nonce: randomNonce(),
  });
  renderPrivateLobby();
  void beginPrivateMatch('host', privateMatchActiveAtHostTimeMs, privateMatchActiveAtEpochMs, performance.now());
}

function returnPrivateMatchToLobby(asHost: boolean): void {
  resetForMode();
  gameStarted = false;
  matchFinished = false;
  weaponView.root.visible = false;
  hudRoot.hidden = true;
  element<HTMLElement>('#banner').hidden = true;
  element<HTMLElement>('#countdown').hidden = true;
  menu.classList.remove('hidden');
  element<HTMLButtonElement>('#resume').hidden = true;
  element<HTMLButtonElement>('#main-menu').hidden = true;
  setArenaMenuCamera();
  if (document.pointerLockElement) void document.exitPointerLock();
  if (asHost && network.role === 'host') {
    privateMatchActiveAtEpochMs = null;
    authoritativeScores.clear();
    for (const member of hostLobbyMembers.values()) {
      hostLobbyMembers.set(member.id, { ...member, ready: false });
      authoritativeScores.set(member.id, emptyPlayerScore(member.id));
    }
    broadcastHostLobby('waiting');
  }
  renderPrivateLobby();
  setStatus(asHost ? 'Lobby reset — ready up for another match.' : 'Host returned everyone to the lobby.', 'ok');
}

function acceptLobbyState(message: LobbyStateMessage): void {
  if (network.role !== 'client' || message.by !== message.snapshot.hostId) return;
  if (privateLobbySnapshot && message.snapshot.revision < privateLobbySnapshot.revision) return;
  const returningToLobby = message.snapshot.phase === 'waiting' && gameStarted && privateLobbySnapshot?.phase !== 'waiting';
  privateLobbySnapshot = message.snapshot;
  privateMatchConfig = message.snapshot.config;
  privateMatchMode = message.snapshot.config.mode;
  lobbyArenaSyncPromise = lobbyArenaSyncPromise
    .catch(() => undefined)
    .then(() => synchronizeLobbyArena());
  authoritativeScores.clear();
  for (const score of message.snapshot.scores) authoritativeScores.set(score.id, score);
  const localMember = message.snapshot.members.find((member) => member.id === player.id);
  if (localMember) {
    player.team = localMember.team;
    localLobbyReady = localMember.ready;
    localDhv = localMember.dhv;
    element<HTMLSelectElement>('#team').value = String(localMember.team);
  }
  if (returningToLobby) {
    returnPrivateMatchToLobby(false);
    return;
  }
  renderPrivateLobby();
  if (message.snapshot.activeAtHostTimeMs !== null && message.snapshot.activeAtEpochMs !== null
    && message.snapshot.phase !== 'waiting' && !gameStarted) {
    void beginPrivateMatch('client', message.snapshot.activeAtHostTimeMs, message.snapshot.activeAtEpochMs, message.snapshot.snapshotHostTimeMs);
  }
}

function handleLobbyMessage(message: GameMessage): boolean {
  if (message.type === 'lobby-join') {
    admitLobbyJoin(message);
    return true;
  }
  if (message.type === 'lobby-ready') {
    updateHostReady(message);
    return true;
  }
  if (message.type === 'lobby-team') {
    updateHostTeam(message);
    return true;
  }
  if (message.type === 'lobby-handicap') {
    updateHostHandicap(message);
    return true;
  }
  if (message.type === 'lobby-state') {
    acceptLobbyState(message);
    return true;
  }
  if (message.type === 'lobby-start') {
    if (network.role === 'client' && message.by === privateLobbySnapshot?.hostId && message.revision >= (privateLobbySnapshot?.revision ?? 0)) {
      privateMatchActiveAtHostTimeMs = message.activeAtHostTimeMs;
      privateMatchActiveAtEpochMs = message.activeAtEpochMs;
      if (privateLobbySnapshot) privateLobbySnapshot = {
        ...privateLobbySnapshot,
        phase: 'countdown',
        snapshotHostTimeMs: message.hostSentTimeMs,
        activeAtHostTimeMs: message.activeAtHostTimeMs,
        activeAtEpochMs: message.activeAtEpochMs,
      };
      if (!gameStarted) void beginPrivateMatch('client', message.activeAtHostTimeMs, message.activeAtEpochMs, message.hostSentTimeMs);
    }
    return true;
  }
  if (message.type === 'lobby-reject') {
    const labels = {
      'room-full': 'Room is full.',
      'identity-in-use': 'That player identity is already connected.',
      'rejoin-denied': 'Rejoin token rejected; open a fresh invite.',
      'match-active': 'Match already active; only reconnecting players may enter.',
      'invalid-config': 'Host settings were rejected.',
      'protocol-mismatch': 'This lobby uses a newer multiplayer protocol. Reload the game and rejoin.',
    } as const;
    setStatus(labels[message.reason], 'error');
    network.close();
    privateLobbySnapshot = null;
    renderPrivateLobby();
    syncArenaSelectionUi();
    return true;
  }
  if (message.type === 'clock-ping') {
    if (network.role === 'host') {
      const member = hostLobbyMembers.get(message.by);
      const hostReceivedMonoMs = performance.now();
      const reportedRttMs = message.reportedRttMs ?? peerTimingStates.get(message.by)?.rttMs ?? 0;
      const priorTiming = peerTimingStates.get(message.by) ?? createPeerTimingState();
      if (message.reportedOffsetMs !== null) peerTimingStates.set(message.by, updatePeerTiming(priorTiming, {
        clockOffsetMs: message.reportedOffsetMs,
        rttMs: reportedRttMs,
        jitterMs: message.reportedJitterMs ?? undefined,
        uncertaintyMs: message.reportedUncertaintyMs ?? undefined,
      }));
      if (member && message.reportedRttMs !== null) hostLobbyMembers.set(message.by, { ...member, pingMs: Math.round(message.reportedRttMs) });
      const hostSentMonoMs = performance.now();
      network.sendToPlayer(message.by, {
        type: 'clock-pong', by: player.id, forPlayerId: message.by,
        guestSentMonoMs: message.guestSentMonoMs, hostReceivedMonoMs, hostSentMonoMs, nonce: randomNonce(),
      });
      if (member && message.reportedRttMs !== null) broadcastHostLobby(privateLobbySnapshot?.phase ?? 'waiting');
    }
    return true;
  }
  if (message.type === 'clock-pong') {
    acceptClockPong(message);
    return true;
  }
  if (message.type === 'match-score') {
    acceptAuthoritativeScores(message);
    return true;
  }
  if (message.type === 'range-score-claim') {
    acceptRangeScoreClaim(message);
    return true;
  }
  if (message.type === 'lobby-config' || message.type === 'lobby-balance') return true;
  if (message.type === 'leave' && privateLobbySnapshot) {
    removeRemote(message.playerId, message.voluntary ? 'left the lobby' : 'disconnected');
    if (network.role === 'host') {
      if (message.voluntary) {
        hostLobbyMembers.delete(message.playerId);
        hostLobbyTokens.delete(message.playerId);
        hostDisconnectedAt.delete(message.playerId);
        authoritativeScores.delete(message.playerId);
        broadcastHostLobby(privateLobbySnapshot.phase);
      } else {
        markLobbyDisconnected(message.playerId);
      }
    }
    return true;
  }
  return false;
}

function renderPrivateLobby(): void {
  const section = element<HTMLElement>('#private-lobby');
  const lobbyAvailable = network.role !== 'offline' || privateLobbySnapshot !== null;
  const lobbyVisible = !gameStarted && lobbyAvailable;
  menu.classList.toggle('private-lobby-active', lobbyVisible);
  syncArenaSelectionUi();
  if (!lobbyAvailable) {
    section.hidden = true;
    return;
  }
  section.hidden = !lobbyVisible;
  element<HTMLButtonElement>('#solo').disabled = true;
  element<HTMLButtonElement>('#host').disabled = true;
  element<HTMLButtonElement>('#join').disabled = true;
  const snapshot = privateLobbySnapshot;
  const members = snapshot?.members ?? (network.role === 'host' ? [...hostLobbyMembers.values()] : []);
  const connectedCount = members.filter((member) => member.connected).length;
  const capacity = snapshot?.config.capacity ?? privateMatchConfig.capacity;
  element<HTMLElement>('#lobby-capacity-label').textContent = `${connectedCount} / ${capacity}`;
  element<HTMLElement>('#private-lobby-title').textContent = snapshot?.phase === 'active' ? 'MATCH IN PROGRESS' : snapshot?.phase === 'countdown' ? 'DEPLOYING' : 'WAITING ROOM';
  const hostControls = network.role === 'host' && (snapshot?.phase ?? 'waiting') === 'waiting';
  const modeInput = element<HTMLSelectElement>('#lobby-mode');
  const capacityInput = element<HTMLSelectElement>('#lobby-capacity');
  const botInput = element<HTMLSelectElement>('#lobby-bots');
  const balanceInput = element<HTMLInputElement>('#lobby-auto-balance');
  modeInput.value = snapshot?.config.mode ?? privateMatchConfig.mode;
  capacityInput.value = String(capacity);
  botInput.value = String(snapshot?.config.hostedBotCount ?? privateMatchConfig.hostedBotCount);
  balanceInput.checked = snapshot?.config.autoBalance ?? privateMatchConfig.autoBalance;
  const rangeLobby = (snapshot?.config.arenaId ?? privateMatchConfig.arenaId) === 'gun-range';
  modeInput.disabled = !hostControls || rangeLobby;
  capacityInput.disabled = !hostControls;
  botInput.disabled = !hostControls || rangeLobby;
  balanceInput.disabled = !hostControls || modeInput.value === 'ffa' || rangeLobby;
  element<HTMLButtonElement>('#lobby-balance').disabled = !hostControls || modeInput.value === 'ffa' || rangeLobby;
  const localMember = members.find((member) => member.id === player.id);
  const lobbyArenaSynchronized = !snapshot
    || arenaSelectionReady && selectedArena.id === snapshot.config.arenaId;
  localLobbyReady = localMember?.ready ?? localLobbyReady;
  const ready = element<HTMLButtonElement>('#lobby-ready');
  ready.textContent = localLobbyReady ? 'READY ✓' : 'READY';
  ready.classList.toggle('primary', localLobbyReady);
  ready.disabled = !localMember?.connected || (snapshot?.phase ?? 'waiting') !== 'waiting' || !lobbyArenaSynchronized;
  const start = element<HTMLButtonElement>('#lobby-start');
  start.hidden = network.role !== 'host';
  start.disabled = network.role !== 'host' || !snapshot || !lobbyArenaSynchronized || !canHostStart(snapshot);
  const teamInput = element<HTMLSelectElement>('#team');
  teamInput.disabled = (snapshot?.phase ?? 'waiting') !== 'waiting' || (snapshot?.config.mode ?? privateMatchConfig.mode) === 'ffa';
  const roster = element<HTMLElement>('#lobby-roster');
  roster.innerHTML = members.map((member) => {
    const ping = member.id === player.id && network.role === 'client' ? localLobbyPingMs : member.pingMs;
    const quality = latencyQuality(ping);
    const role = member.id === snapshot?.hostId || member.id === player.id && network.role === 'host' ? 'HOST' : 'PEER';
    const team = (snapshot?.config.mode ?? privateMatchConfig.mode) === 'ffa' ? 'FFA' : member.team === 0 ? 'AQUA' : 'CORAL';
    const handicapControl = member.id === player.id && (snapshot?.phase ?? 'waiting') === 'waiting'
      ? `<label class="lobby-dhv">DHV<select data-lobby-dhv aria-label="Damage Handicap Value">${DHV_VALUES.map((value) => `<option value="${value}"${member.dhv === value ? ' selected' : ''}>${value}</option>`).join('')}</select><small>${dhvLabel(member.dhv)}</small></label>`
      : `<span class="lobby-dhv-badge" title="${dhvLabel(member.dhv)}">DHV ${member.dhv}</span>`;
    return `<div class="lobby-player ${member.connected ? '' : 'disconnected'}"><span><strong>${escapeHtml(member.name)}</strong><small>${role} · ${team}</small></span><b class="latency-${quality}">${ping === null ? '—' : `${Math.round(ping)} ms`}</b>${handicapControl}<em>${member.connected ? member.ready ? 'READY' : 'SETTING UP' : 'REJOINING…'}</em></div>`;
  }).join('') || '<div class="lobby-player disconnected"><span><strong>CONNECTING…</strong></span></div>';
  const isFfa = (snapshot?.config.mode ?? privateMatchConfig.mode) === 'ffa';
  element<HTMLElement>('#lobby-guidance').textContent = !lobbyArenaSynchronized
    ? `Synchronizing ${arenaSelection(snapshot!.config.arenaId).displayName} before ready-up…`
    : snapshot?.phase === 'active'
    ? 'Match active · disconnected players have a 90 second rejoin slot.'
    : snapshot?.phase === 'countdown'
      ? 'Synchronized deployment countdown started.'
      : network.role === 'host'
        ? isFfa
          ? 'Share the invite, then start when every player is ready.'
          : 'Share the invite, balance teams, then start when everyone is ready.'
        : isFfa
          ? 'Ready up. The host controls match start.'
          : 'Choose your squad and ready up. The host controls match start.';
}

renderHighScores();
void refreshGlobalLeaderboard();
highScoreChannel?.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (Array.isArray(event.data)) persistMergedHighScores(event.data, false);
});
window.addEventListener('storage', (event) => {
  if (event.key !== HIGH_SCORE_STORAGE_KEY) return;
  try {
    highScores = loadHighScores(localStorage);
    renderHighScores();
  } catch { /* Ignore inaccessible cross-tab storage updates. */ }
});
element<HTMLInputElement>('#player-name').addEventListener('input', () => {
  const input = element<HTMLInputElement>('#player-name');
  if (normalizeRequiredPlayerName(input.value)) {
    input.classList.remove('invalid');
    element<HTMLElement>('#player-name-error').hidden = true;
  }
  renderHighScores();
});

const weaponView = new WeaponPresentation(camera, reducedRenderMode);
let selectedFieldKit: FieldKitId = parseFieldKitSelection(localStorage.getItem(FIELD_KIT_STORAGE_KEY));

function setMenuTab(tab: 'deploy' | 'kit' | 'options'): void {
  if (tab === 'kit' && selectedArena.id === 'gun-range') tab = 'deploy';
  document.querySelectorAll<HTMLButtonElement>('[data-menu-tab]').forEach((button) => {
    const active = button.dataset.menuTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll<HTMLElement>('[data-menu-panel]').forEach((panel) => {
    const active = panel.dataset.menuPanel === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
}

function renderFieldKitSelection(): void {
  const summary = element<HTMLElement>('#selected-kit-summary');
  if (selectedArena.id === 'gun-range') {
    summary.dataset.rangeArmory = 'true';
    const equipped = rangePrimaryUnlocked ? WEAPONS[player.primaryWeapon].name : 'Service Pistol';
    summary.innerHTML = `<span>RANGE ARMORY</span><strong>PICK UP YOUR WEAPON INSIDE</strong><b>${equipped} · PRESS F AT A BENCH</b>`;
    return;
  }
  delete summary.dataset.rangeArmory;
  const kit = fieldKitById(selectedFieldKit);
  const queued = gameStarted && player.primaryWeapon !== kit.weapon;
  element<HTMLElement>('#selected-kit-summary').innerHTML = `<span>${queued ? 'QUEUED NEXT DEPLOYMENT' : 'ACTIVE FIELD KIT'}</span><strong>${kit.title}</strong><b>${WEAPONS[kit.weapon].name} · ${WEAPONS[kit.sidearm].name}</b>`;
  document.querySelectorAll<HTMLButtonElement>('[data-kit-id]').forEach((card) => {
    const selected = card.dataset.kitId === selectedFieldKit;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
}

function chooseFieldKit(id: string): void {
  selectedFieldKit = fieldKitById(id).id;
  localStorage.setItem(FIELD_KIT_STORAGE_KEY, serializeFieldKitSelection(selectedFieldKit));
  if (!gameStarted) {
    player.primaryWeapon = fieldKitById(selectedFieldKit).weapon;
    player.weapon = player.primaryWeapon;
    weaponView.setWeapon(player.weapon, true);
  }
  renderFieldKitSelection();
}

document.querySelectorAll<HTMLButtonElement>('[data-menu-tab]').forEach((button) => {
  button.addEventListener('click', () => setMenuTab(button.dataset.menuTab as 'deploy' | 'kit' | 'options'));
});
document.querySelectorAll<HTMLButtonElement>('[data-kit-id]').forEach((button) => {
  button.addEventListener('click', () => chooseFieldKit(button.dataset.kitId ?? 'balanced'));
});
player.primaryWeapon = fieldKitById(selectedFieldKit).weapon;
player.weapon = player.primaryWeapon;
renderFieldKitSelection();

const viewFill = new THREE.PointLight(0xe3f1ff, 1.35, 5);
viewFill.position.set(0, 0.4, 0.2);
viewFill.layers.enable(VIEWMODEL_RENDER_LAYER);
camera.add(viewFill);

function stanceEyeHeight(stance: PlayerSnapshot['stance']): number {
  return stance === 'prone' ? 0.61 : stance === 'crouch' ? 1.16 : 1.7;
}

function currentViewmodelSurfaceRetreat(): number {
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')).normalize();
  let nearest: number | null = null;
  for (let distance = 0.2; distance <= 1.2; distance += 0.1) {
    const sample = player.position.clone().addScaledVector(direction, distance);
    if (!isBlocked(sample, arena.colliders, 0.09)) continue;
    nearest = distance;
    break;
  }
  if (direction.y < -0.04) {
    const floorY = player.position.y - stanceEyeHeight(player.stance);
    const floorDistance = (player.position.y - floorY) / -direction.y;
    if (floorDistance >= 0 && floorDistance <= 1.2) nearest = nearest === null ? floorDistance : Math.min(nearest, floorDistance);
  }
  return viewmodelSurfaceRetreat(nearest, player.stance === 'prone');
}

function interpolatePlayerSnapshot(before: PlayerSnapshot, after: PlayerSnapshot, alpha: number): PlayerSnapshot {
  return {
    ...after,
    x: before.x + (after.x - before.x) * alpha,
    y: before.y + (after.y - before.y) * alpha,
    z: before.z + (after.z - before.z) * alpha,
    yaw: shortestYaw(before.yaw, after.yaw, alpha),
    pitch: before.pitch + (after.pitch - before.pitch) * alpha,
    stance: alpha < 0.5 ? before.stance : after.stance,
  };
}

function createRemote(snapshot: PlayerSnapshot): RemotePlayer {
  const root = new THREE.Group();
  root.name = 'remote-player-world';
  root.rotation.order = 'YXZ';
  root.userData.playerId = snapshot.id;

  const operator = buildOperator(snapshot.team, 'remote-player-model', flattenOperatorMaterials, snapshot.weapon);
  operator.userData.playerId = snapshot.id;
  operator.traverse((child) => {
    child.userData.playerId = snapshot.id;
    child.userData.targetRoot = root;
  });
  root.userData.operator = operator;
  root.add(operator);

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const context = labelCanvas.getContext('2d')!;
  context.fillStyle = 'rgba(10,18,22,.72)';
  context.fillRect(0, 0, 256, 64);
  context.fillStyle = '#f7ecd4';
  context.font = '700 30px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(snapshot.name, 128, 32);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false }));
  sprite.userData.presentationOnly = true;
  sprite.raycast = () => {};
  sprite.visible = privateMatchMode === 'tdm' && snapshot.team === player.team;
  sprite.position.y = 2.5;
  sprite.scale.set(2.4, 0.6, 1);
  root.add(sprite);

  root.position.set(snapshot.x, snapshot.y - stanceEyeHeight(snapshot.stance), snapshot.z);
  scene.add(root);
  const now = performance.now();
  const interpolation = new SnapshotInterpolationBuffer<PlayerSnapshot>(interpolatePlayerSnapshot);
  interpolation.push({ seq: snapshot.seq, hostTimeMs: currentHostTimeMs(), continuity: 1, value: snapshot });
  return {
    root,
    snapshot,
    target: new THREE.Vector3(snapshot.x, snapshot.y - stanceEyeHeight(snapshot.stance), snapshot.z),
    targetYaw: snapshot.yaw,
    lastSeen: now,
    claimEligibleAt: now + 1_500,
    claimRequiresCoreExit: false,
    positionHistory: [{
      at: now, x: snapshot.x, y: snapshot.y, z: snapshot.z, yaw: snapshot.yaw,
      stance: snapshot.stance ?? 'stand', continuity: 1,
    }],
    interpolation,
    renderedHostTimeMs: currentHostTimeMs(),
    renderedWorldAgeMs: 0,
    continuity: 1,
    feedbackSequenceGaps: 0,
    feedbackReordered: 0,
    lastFeedbackAt: Number.NEGATIVE_INFINITY,
  };
}

function snapshot(): PlayerSnapshot {
  return {
    id: player.id,
    name: player.name,
    team: player.team,
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    yaw: player.yaw,
    pitch: player.pitch,
    hp: player.hp,
    kills: player.kills,
    deaths: player.deaths,
    primary: player.primaryWeapon,
    weapon: player.weapon,
    stance: player.stance,
    seq: ++player.seq,
  };
}

const TEAM_PING_LABELS: Record<TeamPingKind, string> = {
  enemy: 'ENEMY',
  regroup: 'REGROUP',
  push: 'PUSH',
  nice: 'NICE',
};

function removeTeamPing(ping: ActiveTeamPing): void {
  scene.remove(ping.root);
  ping.root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) material.dispose();
  });
}

function presentTeamPing(message: TeamPingMessage, senderName: string, now = performance.now()): void {
  while (activeTeamPings.length >= MAX_ACTIVE_TEAM_PINGS) removeTeamPing(activeTeamPings.shift()!);
  const color = message.kind === 'enemy' ? 0xff6b54
    : message.kind === 'regroup' ? 0x67e6ff
      : message.kind === 'push' ? 0xffd166 : 0x7df29a;
  const root = new THREE.Group();
  root.name = `team-ping-${message.kind}`;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.6, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.09, 1.5, 8),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.68, depthWrite: false, depthTest: false, toneMapped: false }),
  );
  beacon.position.y = 0.75;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.18, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false, toneMapped: false }),
  );
  diamond.position.y = 1.52;
  root.add(ring, beacon, diamond);
  root.position.set(...message.position);
  root.renderOrder = 999;
  root.userData.presentationOnly = true;
  root.traverse((node) => { node.raycast = () => {}; });
  scene.add(root);
  activeTeamPings.push({ root, expiresAt: now + TEAM_PING_LIFETIME_MS });
  addFeed(`${senderName}: ${TEAM_PING_LABELS[message.kind]}`, message.team === 0 ? 'aqua' : 'coral');
}

function sendTeamPing(kind: TeamPingKind): void {
  if (!gameStarted || !player.alive || privateMatchMode === 'ffa') return;
  const now = performance.now();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const projected = player.position.clone().addScaledVector(direction, 18);
  const bounded = clampPointToBounds(projected, arena.bounds, 0.6);
  const message: TeamPingMessage = {
    type: 'ping', by: player.id, team: player.team, kind,
    position: [bounded.x, 0.1, bounded.z],
    nonce: randomNonce(),
  };
  const admission = admitTeamPing(message, snapshot(), now, localPingAdmission);
  if (!admission.accepted) return;
  localPingAdmission = admission.nextState;
  presentTeamPing(message, player.name, now);
  network.send(message);
}

function updateTeamPings(now: number): void {
  for (let index = activeTeamPings.length - 1; index >= 0; index -= 1) {
    const ping = activeTeamPings[index];
    if (now >= ping.expiresAt) {
      removeTeamPing(ping);
      activeTeamPings.splice(index, 1);
      continue;
    }
    const remaining = (ping.expiresAt - now) / TEAM_PING_LIFETIME_MS;
    const distanceScale = THREE.MathUtils.clamp(camera.position.distanceTo(ping.root.position) / 8, 1, 2.5);
    ping.root.scale.setScalar(distanceScale * (0.92 + Math.sin(now * 0.008) * 0.08));
    ping.root.visible = remaining > 0;
  }
}

function nextCombatTiming(): CombatTiming {
  const timing = { eventSeq: localCombatEventSeq, sentAtHostTimeMs: currentHostTimeMs() };
  recordMatchDiagnostic('combat-send', 'observed', {
    actorId: player.id,
    reason: 'local-input-to-network-event',
    rttMs: localLobbyPingMs ?? undefined,
    clockOffsetMs: network.role === 'client' ? hostTimeMapping.offsetMs : 0,
  }, `combat-seq-${timing.eventSeq}`);
  localCombatEventSeq += 1;
  return timing;
}

function isTimedCombatMessage(message: GameMessage): message is ShotMessage | MeleeMessage | Extract<GameMessage, { type: 'grenade-throw' | 'hit' | 'support-activate' }> {
  return message.type === 'shot' || message.type === 'melee' || message.type === 'grenade-throw' || message.type === 'hit' || message.type === 'support-activate';
}

function admitIncomingCombatTiming(message: GameMessage): boolean {
  if (network.role !== 'host' || message.type === 'bot-damage' || message.type === 'bot-state' || !isTimedCombatMessage(message)) return true;
  if (message.by === player.id) return true;
  if (!remotes.has(message.by) || !message.timing) {
    recordMatchDiagnostic('combat-timing', 'rejected', { actorId: message.by, weaponOrEffect: message.type, reason: !message.timing ? 'missing-timing' : 'unknown-peer' });
    return false;
  }
  const prior = peerTimingStates.get(message.by) ?? createPeerTimingState();
  const admission = admitCombatTiming(prior, message.timing, performance.now());
  combatAdmissionTelemetry[admission.reason] = (combatAdmissionTelemetry[admission.reason] ?? 0) + 1;
  recordMatchDiagnostic('combat-timing', admission.accepted ? 'accepted' : 'rejected', {
    actorId: message.by,
    weaponOrEffect: message.type,
    reason: admission.reason,
    rttMs: prior.rttMs,
    jitterMs: prior.jitterMs,
    clockOffsetMs: prior.clockOffsetMs,
    modifiers: [`age:${Math.round(admission.sampleAgeMs)}`, `rewind:${Math.round(admission.rewindMs)}`],
  }, `combat-seq-${message.timing.eventSeq}`);
  if (admission.accepted) peerTimingStates.set(message.by, admission.state);
  if (admission.accepted) {
    incomingCombatRewindMs.set(message.nonce, admission.rewindMs);
    if (incomingCombatRewindMs.size > 512) incomingCombatRewindMs.clear();
  }
  return admission.accepted;
}
function onNetworkMessage(message: GameMessage): void {
  if (handleLobbyMessage(message)) return;
  if (!gameStarted) return;
  if (message.type === 'shot-result') {
    acceptAuthoritativeShotResult(message);
    return;
  }
  if (message.type === 'shot-request') {
    if (network.role === 'host') resolveAuthoritativeShot(message);
    else if (message.by !== player.id) renderRemoteShot({
      type: 'shot', by: message.by, weapon: message.weapon, origin: message.origin,
      direction: message.direction, pelletDirections: message.pelletDirections, nonce: message.nonce,
    });
    return;
  }
  if (message.type === 'state-feedback') {
    if (network.role === 'client' && message.forPlayerId === player.id && message.by === privateLobbySnapshot?.hostId) {
      outboundFeedbackSequenceGaps = message.sequenceGaps;
      outboundFeedbackReordered = message.reordered;
      outboundFeedbackPressure = message.bufferedPressure;
    }
    return;
  }
  if (!admitIncomingCombatTiming(message)) return;
  if (message.type === 'bot-damage') {
    acceptHostedBotDamage(message);
    return;
  }
  if (message.type === 'bot-state') {
    acceptHostedBotState(message);
    return;
  }
  if (message.type === 'overdrive-claim') {
    acceptOverdriveClaim(message);
    return;
  }
  if (message.type === 'overdrive-state') {
    acceptOverdriveState(message);
    return;
  }
  if (message.type === 'high-score') {
    if (message.by === player.id) return;
    const sender = remotes.get(message.by);
    if (!sender || leaderboardNameKey(sender.snapshot.name) !== leaderboardNameKey(message.entry.name)) return;
    persistMergedHighScores([message.entry]);
    return;
  }
  if (message.type === 'leaderboard-sync') {
    if (message.by === player.id) return;
    const sender = remotes.get(message.by);
    if (!sender) return;
    const admittedEntries = message.by === privateLobbySnapshot?.hostId
      ? message.entries
      : peerOwnedHighScores(sender.snapshot.name, message.entries);
    persistMergedHighScores(admittedEntries);
    return;
  }
  if (message.type === 'join' || message.type === 'state') {
    const claimedIncoming = message.player;
    const lobbyMember = privateLobbySnapshot?.members.find((member) => member.id === claimedIncoming.id);
    if (privateLobbySnapshot && (!lobbyMember || claimedIncoming.team !== lobbyMember.team)) return;
    if (claimedIncoming.weapon === 'magnum' && lobbyMember?.dhv !== 'X') return;
    const authoritativeScore = authoritativeScores.get(claimedIncoming.id);
    const incoming = network.role === 'host' && lobbyMember
      ? {
          ...claimedIncoming,
          name: lobbyMember.name,
          team: lobbyMember.team,
          kills: authoritativeScore?.kills ?? 0,
          deaths: authoritativeScore?.deaths ?? 0,
        }
      : claimedIncoming;
    if (incoming.id === player.id || !pointInsideBounds(incoming, arena.bounds, 0.44)) return;
    let remote = remotes.get(incoming.id);
    if (!remote) {
      const retainedHealth = network.role === 'host' ? remoteHealthAuthorities.get(incoming.id) : undefined;
      const initialHealth = retainedHealth ?? createRemoteHealthAuthorityState(incoming.hp > 0);
      const initialIncoming = network.role === 'host' ? { ...incoming, hp: initialHealth.hp } : incoming;
      remote = createRemote(initialIncoming);
      remotes.set(incoming.id, remote);
      if (!remoteSupportAuthorities.has(incoming.id)) remoteSupportAuthorities.set(incoming.id, createRemoteSupportAuthorityState());
      if (!remoteGrenadeAuthorities.has(incoming.id)) remoteGrenadeAuthorities.set(incoming.id, createRemoteGrenadeAuthorityState());
      if (!retainedHealth) remoteHealthAuthorities.set(incoming.id, initialHealth);
      if (network.role === 'host') network.send({ type: 'join', player: initialIncoming });
      addFeed(`${initialIncoming.name} entered the test block`, initialIncoming.team === 0 ? 'aqua' : 'coral');
      sendLeaderboardSync();
      if (message.type === 'join') {
        network.send(createStateMessage());
        broadcastOverdriveState(performance.now());
      }
    }
    if (incoming.seq > remote.snapshot.seq) {
      const now = performance.now();
      let admittedIncoming = incoming;
      let respawned = remote.snapshot.hp <= 0 && incoming.hp > 0;
      if (network.role === 'host') {
        const health = remoteHealthAuthorities.get(incoming.id) ?? createRemoteHealthAuthorityState(remote.snapshot.hp > 0);
        const respawnAdmission = admitAuthoritativeRemoteRespawn(health, incoming.hp, now);
        if (respawnAdmission.respawned) {
          remoteHealthAuthorities.set(incoming.id, respawnAdmission.state);
          remoteSupportAuthorities.set(incoming.id, createRemoteSupportAuthorityState());
          remoteGrenadeAuthorities.set(incoming.id, createRemoteGrenadeAuthorityState());
        }
        const authoritativeHealth = respawnAdmission.state;
        respawned = respawnAdmission.respawned;
        admittedIncoming = { ...incoming, hp: authoritativeHealth.hp };
      }
      const movement = admitRemoteSnapshotMovement(
        remote.snapshot,
        admittedIncoming,
        now,
        remote.lastSeen,
        remote.claimEligibleAt,
        respawned,
      );
      if (!movement.accepted) {
        recordMatchDiagnostic('state-reconciliation', 'rejected', {
          actorId: admittedIncoming.id,
          position: [admittedIncoming.x, admittedIncoming.y, admittedIncoming.z],
          reason: 'movement-envelope-rejected',
          modifiers: [`seq:${admittedIncoming.seq}`],
        });
        return;
      }
      recordMatchDiagnostic('state-reconciliation', 'accepted', {
        actorId: admittedIncoming.id,
        position: [admittedIncoming.x, admittedIncoming.y, admittedIncoming.z],
        reason: movement.resynchronized ? 'bounded-resynchronization' : 'interpolation-snapshot',
        modifiers: [`seq:${admittedIncoming.seq}`, respawned ? 'respawn' : 'continuous'],
      });
      const pickup = authorizedRemotePickups.get(admittedIncoming.id);
      const pickupAllowed = pickup !== undefined && pickup.expiresAt >= now && pickup.weapon === admittedIncoming.primary;
      if (admittedIncoming.team !== remote.snapshot.team) return;
      if (admittedIncoming.primary !== remote.snapshot.primary && !respawned && !pickupAllowed) return;
      if (pickupAllowed) authorizedRemotePickups.delete(admittedIncoming.id);
      remote.claimEligibleAt = movement.claimEligibleAt;
      const coreDistance = Math.hypot(admittedIncoming.x - OVERDRIVE_POSITION.x, admittedIncoming.z - OVERDRIVE_POSITION.z);
      if (movement.resynchronized && coreDistance <= OVERDRIVE_PICKUP_RADIUS + 3) remote.claimRequiresCoreExit = true;
      else if (remote.claimRequiresCoreExit && !movement.resynchronized && coreDistance > OVERDRIVE_PICKUP_RADIUS + 3) {
        remote.claimRequiresCoreExit = false;
        remote.claimEligibleAt = Math.max(remote.claimEligibleAt, now + 1_500);
      }
      const claimedContinuity = message.type === 'state' ? message.continuity : remote.continuity;
      const admittedContinuity = network.role === 'host'
        ? respawned
          ? Math.max(remote.continuity + 1, claimedContinuity)
          : remote.positionHistory.length <= 1 && claimedContinuity >= remote.continuity
            ? claimedContinuity
            : remote.continuity
        : claimedContinuity;
      const admittedHostTimeMs = message.type === 'state'
        ? network.role === 'host' ? Math.max(now - 250, Math.min(now + 50, message.hostTimeMs)) : message.hostTimeMs
        : currentHostTimeMs();
      remote.snapshot = admittedIncoming;
      if (remote.positionHistory.at(-1)?.continuity !== admittedContinuity) remote.positionHistory.length = 0;
      remote.continuity = admittedContinuity;
      const priorBufferStats = remote.interpolation.stats;
      remote.interpolation.push({
        seq: admittedIncoming.seq,
        hostTimeMs: admittedHostTimeMs,
        continuity: admittedContinuity,
        value: admittedIncoming,
      });
      const nextBufferStats = remote.interpolation.stats;
      const gapDelta = nextBufferStats.sequenceGaps - priorBufferStats.sequenceGaps;
      const reorderDelta = nextBufferStats.reordered - priorBufferStats.reordered;
      receiverSequenceGaps += gapDelta;
      receiverReordered += reorderDelta;
      remote.feedbackSequenceGaps += gapDelta;
      remote.feedbackReordered += reorderDelta;
      recordCombatantPose(remote.positionHistory, {
        at: admittedHostTimeMs, x: admittedIncoming.x, y: admittedIncoming.y, z: admittedIncoming.z,
        yaw: admittedIncoming.yaw, stance: admittedIncoming.stance ?? 'stand', continuity: admittedContinuity,
      });
      remote.target.set(admittedIncoming.x, admittedIncoming.y - stanceEyeHeight(admittedIncoming.stance), admittedIncoming.z);
      remote.targetYaw = admittedIncoming.yaw;
      remote.lastSeen = now;
      remote.root.visible = admittedIncoming.hp > 0;
      if (network.role === 'host') {
        network.send({
          type: 'state', player: admittedIncoming,
          hostTimeMs: admittedHostTimeMs,
          continuity: admittedContinuity,
          rateHz: message.type === 'state' ? message.rateHz : 40,
        }, admittedIncoming.id);
        if (now - remote.lastFeedbackAt >= 1_000) {
          network.sendToPlayer(admittedIncoming.id, {
            type: 'state-feedback', by: player.id, forPlayerId: admittedIncoming.id,
            sequenceGaps: Math.min(1_000, remote.feedbackSequenceGaps),
            reordered: Math.min(1_000, remote.feedbackReordered),
            bufferedPressure: network.stateBufferedPressure(admittedIncoming.id), nonce: randomNonce(),
          });
          remote.feedbackSequenceGaps = 0;
          remote.feedbackReordered = 0;
          remote.lastFeedbackAt = now;
        }
      }
    }
    return;
  }
  if (message.type === 'ping') {
    const pingPoint = { x: message.position[0], y: message.position[1], z: message.position[2] };
    if (privateMatchMode === 'ffa' || message.by === player.id || message.team !== player.team || !pointInsideBounds(pingPoint, arena.bounds, 0)) return;
    const sender = remotes.get(message.by);
    const prior = remotePingAdmissions.get(message.by) ?? createTeamPingAdmissionState();
    const admission = admitTeamPing(message, sender?.snapshot, performance.now(), prior);
    if (!admission.accepted || !sender) return;
    remotePingAdmissions.set(message.by, admission.nextState);
    presentTeamPing(message, sender.snapshot.name);
    return;
  }
  if (message.type === 'window-break') {
    acceptRemoteWindowBreak(message);
    return;
  }
  if (message.type === 'pickup') {
    acceptRemotePickup(message);
    return;
  }
  if (message.type === 'support-activate') {
    const state = remoteSupportAuthorities.get(message.by);
    const sender = remotes.get(message.by);
    if (!state || !sender || sender.snapshot.hp <= 0) return;
    if (message.effectOrigins.some((origin) => !pointInsideBounds(new THREE.Vector3(...origin), arena.bounds, 0))) return;
    if (message.targetIds.some((id) => {
      if (id === player.id) return !player.alive || !areCombatantsHostile(message.by, sender.snapshot.team, player.id, player.team);
      const target = remotes.get(id);
      const botTarget = bots.get(id);
      if (target) return target.snapshot.hp <= 0 || !areCombatantsHostile(message.by, sender.snapshot.team, target.snapshot.id, target.snapshot.team);
      if (botTarget) return !botTarget.alive || !areCombatantsHostile(message.by, sender.snapshot.team, botTarget.id, botTarget.team);
      return true;
    })) return;
    const admission = admitRemoteSupportActivation(state, message, performance.now());
    if (admission.accepted) {
      remoteSupportAuthorities.set(message.by, admission.state);
      presentRemoteSupportActivation(message, sender.snapshot);
      if (network.role === 'host') network.send(message);
    }
    return;
  }
  if (message.type === 'grenade-throw') {
    const state = remoteGrenadeAuthorities.get(message.by);
    const sender = remotes.get(message.by);
    if (!state || !sender) return;
    const admission = admitRemoteGrenadeThrow(state, message, sender.snapshot, performance.now());
    if (!admission.accepted) return;
    remoteGrenadeAuthorities.set(message.by, admission.state);
    presentRemoteGrenade(message);
    if (network.role === 'host') network.send(message);
    return;
  }
  if (message.type === 'shot') {
    if (message.by === player.id) return;
    const sender = remotes.get(message.by);
    const prior = remoteShotAdmissions.get(message.by) ?? createRemoteShotAdmissionState();
    const admission = admitRemoteShot(message, sender?.snapshot, performance.now(), prior);
    if (!admission.accepted) return;
    remoteShotAdmissions.set(message.by, admission.nextState);
    const now = performance.now();
    const actions = admittedRemoteShots.get(message.by) ?? new Map<number, AdmittedRemoteShot>();
    for (const [nonce, action] of actions) if (now - action.receivedAt > 1_000) actions.delete(nonce);
    actions.set(message.nonce, { message, receivedAt: now, targets: new Set() });
    admittedRemoteShots.set(message.by, actions);
    if (network.role === 'host') network.send(message);
    renderRemoteShot(message);
    return;
  }
  if (message.type === 'melee') {
    if (message.by === player.id) return;
    const now = performance.now();
    const sender = remotes.get(message.by);
    const prior = remoteMeleeAdmissions.get(message.by) ?? createRemoteMeleeAdmissionState();
    const admission = admitRemoteMelee(message, sender?.snapshot, now, prior);
    if (!admission.accepted || !sender) return;
    remoteMeleeAdmissions.set(message.by, admission.nextState);
    const actions = admittedRemoteMelees.get(message.by) ?? new Map<number, AdmittedRemoteMelee>();
    for (const [nonce, action] of actions) if (now - action.receivedAt > 1_000) actions.delete(nonce);
    actions.set(message.nonce, { message, receivedAt: now, targets: new Set() });
    admittedRemoteMelees.set(message.by, actions);
    if (network.role === 'host') network.send(message);
    const operator = sender.root.userData.operator as THREE.Group | undefined;
    if (operator) meleeOperator(operator);
    audio.melee();
    const origin = new THREE.Vector3(...message.origin);
    if (network.role !== 'client' && player.alive && areCombatantsHostile(message.by, sender.snapshot.team, player.id, player.team)
      && meleeActionHitsPoint(message, player.position)
      && !arena.colliders.some((box) => segmentIntersectsBox(origin, player.position, box))) {
      applyDamage(100 * overdriveDamageMultiplier(overdriveState, message.by, now), message.by, 1, false, { kind: 'melee' });
    }
    return;
  }
  if (message.type === 'hit' && !processedNonces.has(message.nonce)) {
    const attacker = remotes.get(message.by);
    if (!attacker || !pointInsideBounds(attacker.snapshot, arena.bounds, 0.44)) return;
    const targetIsLocal = message.target === player.id;
    const remoteTarget = targetIsLocal ? undefined : remotes.get(message.target);
    const botTarget = targetIsLocal ? undefined : bots.get(message.target);
    if (!targetIsLocal && (network.role !== 'host' || !remoteTarget && !botTarget)) return;
    const targetId = targetIsLocal ? player.id : remoteTarget?.snapshot.id ?? botTarget!.id;
    const targetTeam = targetIsLocal ? player.team : remoteTarget?.snapshot.team ?? botTarget!.team;
    if (!areCombatantsHostile(message.by, attacker.snapshot.team, targetId, targetTeam)) return;
    const now = performance.now();
    const rewindMs = incomingCombatRewindMs.get(message.nonce) ?? 0;
    incomingCombatRewindMs.delete(message.nonce);
    const rewoundPose = rewindCombatantPose(
      targetIsLocal ? localPositionHistory : remoteTarget?.positionHistory ?? [],
      now - rewindMs,
    );
    const targetStance = rewoundPose?.stance ?? (targetIsLocal ? player.stance : remoteTarget?.snapshot.stance ?? 'stand');
    const shotTargetPosition = targetIsLocal
      ? rewoundPose
        ? new THREE.Vector3(rewoundPose.x, rewoundPose.y, rewoundPose.z)
        : player.position.clone()
      : remoteTarget
        ? rewoundPose
          ? new THREE.Vector3(rewoundPose.x, rewoundPose.y, rewoundPose.z)
          : new THREE.Vector3(remoteTarget.snapshot.x, remoteTarget.snapshot.y, remoteTarget.snapshot.z)
        : botTarget!.position.clone().add(new THREE.Vector3(0, 1.7, 0));
    const blastTargetPosition = shotTargetPosition.clone();
    blastTargetPosition.y += 1.1 - stanceEyeHeight(targetStance);
    let admittedDamage = 0;

    if (message.kind === 'shot') {
      const action = admittedRemoteShots.get(message.by)?.get(message.actionNonce);
      if (!action) { recordRemoteHitAdmission('shot-missing-action'); return; }
      if (now - action.receivedAt > 1_000) { recordRemoteHitAdmission('shot-expired-action'); return; }
      if (action.targets.has(message.target)) { recordRemoteHitAdmission('shot-duplicate-target'); return; }
      if (action.message.weapon !== attacker.snapshot.weapon) { recordRemoteHitAdmission('shot-weapon-mismatch'); return; }
      const derivedDamage = deriveRemoteShotBaseDamage(
        action.message.weapon,
        action.message.origin,
        action.message.pelletDirections,
        {
          x: shotTargetPosition.x,
          y: shotTargetPosition.y,
          z: shotTargetPosition.z,
          yaw: rewoundPose?.yaw ?? (targetIsLocal ? player.yaw : remoteTarget?.snapshot.yaw ?? botTarget!.root.rotation.y),
          stance: targetStance,
        },
        (origin, impact, weapon) => {
          const delta = impact.clone().sub(origin);
          const distance = delta.length();
          const trace = traceWeaponPath(origin, delta, distance, weapon);
          return trace.reachedDistance ? trace.damageMultiplier : 0;
        },
      );
      if (derivedDamage <= 0) { recordRemoteHitAdmission('shot-ray-miss'); return; }
      action.targets.add(message.target);
      recordRemoteHitAdmission('shot-admitted');
      admittedDamage = handicapOutgoingDamage(message.by, resolveRemotePoweredDamage(
        Math.min(derivedDamage, message.damage),
        overdriveDamageMultiplier(overdriveState, message.by, now),
      ), action.message.weapon);
    } else if (message.kind === 'melee') {
      const action = admittedRemoteMelees.get(message.by)?.get(message.actionNonce);
      if (!action || now - action.receivedAt > 1_000 || action.targets.has(message.target)) return;
      if (Math.abs(message.damage - 100) > 1e-6
        || !meleeActionHitsPoint(action.message, blastTargetPosition)
        || arena.colliders.some((box) => segmentIntersectsBox(new THREE.Vector3(...action.message.origin), blastTargetPosition, box))) return;
      action.targets.add(message.target);
      admittedDamage = handicapOutgoingDamage(message.by, resolveRemotePoweredDamage(100, overdriveDamageMultiplier(overdriveState, message.by, now)));
    } else {
      const source = message.explosiveSource;
      const originTuple = message.origin;
      if (!source || !originTuple) return;
      const validationOrigin = new THREE.Vector3(...originTuple);
      if (!pointInsideBounds(validationOrigin, arena.bounds, 0)) return;
      const distance = validationOrigin.distanceTo(blastTargetPosition);
      if (distance > remoteExplosiveHitMaximumDistance(source)) return;
      if (source !== 'nuke' && arena.colliders.some((box) => segmentIntersectsBox(validationOrigin, blastTargetPosition, box))) return;
      const maximumBaseDamage = maximumRemoteExplosiveBaseDamage(source, distance, targetStance);
      if (!admitRemoteBaseDamage(message.damage, maximumBaseDamage)
        || Math.abs(message.damage - maximumBaseDamage) > 1e-6) return;

      if (source === 'grenade') {
        const grenadeAuthority = remoteGrenadeAuthorities.get(message.by);
        if (!grenadeAuthority) return;
        const grenadeAdmission = admitRemoteGrenadeHit(grenadeAuthority, {
          actionNonce: message.actionNonce,
          explosionOrigin: originTuple,
          target: message.target,
          now,
        });
        if (!grenadeAdmission.accepted) return;
        remoteGrenadeAuthorities.set(message.by, grenadeAdmission.state);
      } else {
        const supportNonce = message.supportNonce;
        const authority = remoteSupportAuthorities.get(message.by);
        if (supportNonce === undefined || !authority) return;
        const supportAdmission = admitRemoteSupportHit(authority, {
          source,
          activationNonce: supportNonce,
          origin: originTuple,
          target: message.target,
          now,
        });
        if (!supportAdmission.accepted) return;
        remoteSupportAuthorities.set(message.by, supportAdmission.state);
      }

      const actions = admittedRemoteExplosions.get(message.by) ?? new Map<number, AdmittedRemoteExplosion>();
      for (const [nonce, action] of actions) if (now - action.receivedAt > 30_000) actions.delete(nonce);
      const priorAction = actions.get(message.actionNonce);
      if (priorAction) {
        if (priorAction.source !== source || priorAction.origin.distanceTo(validationOrigin) > 0.01 || priorAction.targets.has(message.target)) return;
        priorAction.targets.add(message.target);
      } else {
        actions.set(message.actionNonce, { source, origin: validationOrigin, receivedAt: now, targets: new Set([message.target]) });
      }
      admittedRemoteExplosions.set(message.by, actions);
      admittedDamage = handicapOutgoingDamage(message.by, resolveRemotePoweredDamage(
        message.damage,
        overdriveDamageMultiplier(overdriveState, message.by, now),
      ));
    }

    processedNonces.add(message.nonce);
    const cause = killCauseFromHit(message, attacker.snapshot.weapon);
    if (targetIsLocal) applyDamage(admittedDamage, message.by, 1, false, cause);
    else if (botTarget) applyBotDamage(botTarget, admittedDamage, 'body', cause, message.by);
    else sendAuthoritativeHit(message);
    trimNonceSet();
    return;
  }
  if (message.type === 'death' && !processedNonces.has(message.nonce)) {
    processedNonces.add(message.nonce);
    processDeath(message);
    trimNonceSet();
    return;
  }
  if (message.type === 'leave') removeRemote(message.playerId, 'left the block');
}

function trimNonceSet(): void {
  if (processedNonces.size > 512) processedNonces.clear();
}

function sendAuthoritativeHit(
  message: HitMessage,
  evidence?: Readonly<{ hitZone?: HitZone; wallbang?: boolean; penetrationMultiplier?: number; distanceMeters?: number }>,
): void {
  const timedMessage: HitMessage = message.timing ? message : { ...message, timing: nextCombatTiming() };
  if (network.role !== 'host') {
    network.send(timedMessage);
    return;
  }
  const remote = remotes.get(timedMessage.target);
  const health = remoteHealthAuthorities.get(timedMessage.target);
  if (!remote || !health) return;
  const now = performance.now();
  const attackerWeapon = remotes.get(timedMessage.by)?.snapshot.weapon ?? player.weapon;
  const poweredDamage = resolveRemotePoweredDamage(
    timedMessage.damage,
    overdriveDamageMultiplier(overdriveState, timedMessage.by, now),
  );
  const outgoingHandicapped = handicapOutgoingDamage(timedMessage.by, poweredDamage, timedMessage.kind === 'shot' ? attackerWeapon : undefined);
  const finalDamage = applyDhvIncomingDamage(outgoingHandicapped, health.hp, memberDhv(timedMessage.target));
  const result = applyAuthoritativeRemoteDamage(health, finalDamage, now);
  if (!result.applied) return;
  const appliedDamage = Math.max(0, health.hp - result.state.hp);
  remoteHealthAuthorities.set(timedMessage.target, result.state);
  remote.snapshot = { ...remote.snapshot, hp: result.state.hp };
  remote.root.visible = result.state.alive;
  recordDamageEvent({
    actorId: timedMessage.by,
    targetId: timedMessage.target,
    weaponOrEffect: timedMessage.kind === 'shot' ? remotes.get(timedMessage.by)?.snapshot.weapon ?? player.weapon : timedMessage.explosiveSource ?? timedMessage.kind,
    healthBefore: health.hp,
    healthAfter: result.state.hp,
    damageRequested: finalDamage,
    damageApplied: appliedDamage,
    hitZone: evidence?.hitZone,
    critical: evidence?.hitZone === 'head',
    wallbang: evidence?.wallbang,
    penetrationMultiplier: evidence?.penetrationMultiplier,
    distanceMeters: evidence?.distanceMeters,
    reason: 'host-remote-health-authority',
  });
  recordAuthoritativeDamage(timedMessage.by, timedMessage.target, appliedDamage);
  network.send(timedMessage);
  if (result.died) {
    const death: DeathMessage = {
      type: 'death', killer: timedMessage.by, victim: timedMessage.target,
      cause: killCauseFromHit(timedMessage, remotes.get(timedMessage.by)?.snapshot.weapon ?? player.weapon),
      nonce: randomNonce(),
    };
    processedNonces.add(death.nonce);
    network.send(death);
    processDeath(death);
  }
}

function makeShotResult(
  request: ShotRequestMessage,
  status: ShotResultMessage['status'],
  reason: ShotResultMessage['reason'],
  acceptedHostTimeMs: number | null,
  appliedRewindMs: number,
  outcomes: ShotResultMessage['outcomes'] = [],
): ShotResultMessage {
  return {
    type: 'shot-result', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: player.id, forPlayerId: request.by,
    shotId: request.shotId, shotSeq: request.shotSeq, status, reason, acceptedHostTimeMs,
    appliedRewindMs, outcomes, nonce: randomNonce(),
  };
}

function resolveAuthoritativeShot(request: ShotRequestMessage): void {
  if (network.role !== 'host' || request.by === player.id) return;
  const cacheKey = `${request.by}:${request.shotId}`;
  const cached = resolvedShotRequests.get(cacheKey);
  if (cached) {
    recordShotProtocol('duplicate-request');
    network.sendToPlayer(request.by, cached);
    return;
  }
  recordShotProtocol('received');
  const sender = remotes.get(request.by);
  const prior = authoritativeShotAdmissions.get(request.by) ?? createAuthoritativeShotAdmissionState();
  const receivedAt = performance.now();
  const admission = admitAuthoritativeShot(request, sender?.snapshot, receivedAt, prior);
  if (!admission.accepted || !sender) {
    const rejected = makeShotResult(request, 'rejected', admission.reason, null, 0);
    resolvedShotRequests.set(cacheKey, rejected);
    recordShotProtocol(`rejected-${admission.reason}`);
    network.sendToPlayer(request.by, rejected);
    return;
  }
  authoritativeShotAdmissions.set(request.by, admission.state);
  const visualShot: ShotMessage = {
    type: 'shot', by: request.by, weapon: request.weapon, origin: request.origin,
    direction: request.direction, pelletDirections: request.pelletDirections, nonce: request.nonce,
  };
  renderRemoteShot(visualShot);
  network.send(request, request.by);
  const shooterRewind = rewindCombatantPoseStrict(sender.positionHistory, request.renderedHostTimeMs, request.continuity);
  if (!shooterRewind.pose) {
    const reason = shooterRewind.reason === 'continuity-mismatch' ? 'continuity-mismatch' : 'missing-history';
    const rejected = makeShotResult(request, 'rejected', reason, null, 0);
    resolvedShotRequests.set(cacheKey, rejected);
    recordShotProtocol(`rejected-shooter-${shooterRewind.reason}`);
    network.sendToPlayer(request.by, rejected);
    return;
  }
  if (!validateShotOrigin(request, shooterRewind.pose)) {
    const rejected = makeShotResult(request, 'rejected', 'bad-origin', request.renderedHostTimeMs, admission.appliedRewindMs);
    resolvedShotRequests.set(cacheKey, rejected);
    recordShotProtocol('rejected-bad-origin');
    network.sendToPlayer(request.by, rejected);
    return;
  }

  const targetPoses: Array<{ id: string; x: number; y: number; z: number; yaw: number; stance: Stance }> = [];
  if (player.alive && areCombatantsHostile(request.by, sender.snapshot.team, player.id, player.team)) {
    const target = rewindCombatantPoseStrict(localPositionHistory, request.renderedHostTimeMs, localContinuity);
    if (!target.pose) {
      const reason = target.reason === 'continuity-mismatch' ? 'continuity-mismatch' : 'missing-history';
      const rejected = makeShotResult(request, 'rejected', reason, null, 0);
      resolvedShotRequests.set(cacheKey, rejected);
      recordShotProtocol(`rejected-host-target-${target.reason}`);
      network.sendToPlayer(request.by, rejected);
      return;
    }
    targetPoses.push({ id: player.id, ...target.pose });
  }
  for (const [targetId, targetRemote] of remotes) {
    if (targetId === request.by || targetRemote.snapshot.hp <= 0
      || !areCombatantsHostile(request.by, sender.snapshot.team, targetId, targetRemote.snapshot.team)) continue;
    const target = rewindCombatantPoseStrict(targetRemote.positionHistory, request.renderedHostTimeMs, targetRemote.continuity);
    if (!target.pose) continue;
    targetPoses.push({ id: targetId, ...target.pose });
  }
  for (const bot of bots.values()) {
    if (!bot.alive || !areCombatantsHostile(request.by, sender.snapshot.team, bot.id, bot.team)) continue;
    const target = rewindCombatantPoseStrict(bot.positionHistory, request.renderedHostTimeMs, bot.continuity);
    if (!target.pose) continue;
    targetPoses.push({ id: bot.id, ...target.pose });
  }

  const derived = deriveAuthoritativeShotOutcomes(
    request.weapon,
    request.origin,
    request.pelletDirections,
    targetPoses,
    (origin, impact, weapon) => {
      const delta = impact.clone().sub(origin);
      const distance = delta.length();
      const trace = traceWeaponPath(origin, delta, distance, weapon);
      return trace.reachedDistance ? trace.damageMultiplier : 0;
    },
  );
  const outcomes: ShotResultMessage['outcomes'] = [];
  for (const [targetId, hit] of derived) {
    const powered = resolveRemotePoweredDamage(hit.damage, overdriveDamageMultiplier(overdriveState, request.by, receivedAt));
    const outgoing = handicapOutgoingDamage(request.by, powered, request.weapon);
    let appliedDamage = 0;
    let resultingHealth = 0;
    let died = false;
    if (targetId === player.id) {
      const healthBefore = player.hp;
      const finalDamage = applyDhvIncomingDamage(outgoing, player.hp, localDhv);
      applyDamage(finalDamage, request.by, 1, false, { kind: 'gun', weapon: request.weapon }, true);
      appliedDamage = Math.max(0, healthBefore - player.hp);
      resultingHealth = player.hp;
      died = healthBefore > 0 && player.hp <= 0;
    } else if (bots.has(targetId)) {
      const bot = bots.get(targetId)!;
      appliedDamage = applyBotDamage(bot, outgoing, hit.hitZone, { kind: 'gun', weapon: request.weapon }, request.by, hit);
      resultingHealth = bot.hp;
      died = !bot.alive;
    } else {
      const remote = remotes.get(targetId);
      const health = remoteHealthAuthorities.get(targetId);
      if (!remote || !health) continue;
      const finalDamage = applyDhvIncomingDamage(outgoing, health.hp, memberDhv(targetId));
      const applied = applyAuthoritativeRemoteDamage(health, finalDamage, receivedAt);
      if (!applied.applied) continue;
      appliedDamage = Math.max(0, health.hp - applied.state.hp);
      resultingHealth = applied.state.hp;
      died = applied.died;
      remoteHealthAuthorities.set(targetId, applied.state);
      remote.snapshot = { ...remote.snapshot, hp: applied.state.hp };
      remote.root.visible = applied.state.alive;
      recordDamageEvent({
        actorId: request.by, targetId, weaponOrEffect: request.weapon,
        healthBefore: health.hp, healthAfter: applied.state.hp,
        damageRequested: finalDamage, damageApplied: appliedDamage,
        hitZone: hit.hitZone, critical: hit.hitZone === 'head', wallbang: hit.wallbang,
        penetrationMultiplier: hit.penetrationMultiplier, reason: 'host-shot-request-authority',
      });
      recordAuthoritativeDamage(request.by, targetId, appliedDamage);
      if (died) {
        const death: DeathMessage = {
          type: 'death', killer: request.by, victim: targetId,
          cause: { kind: 'gun', weapon: request.weapon }, nonce: randomNonce(),
        };
        processedNonces.add(death.nonce);
        network.send(death);
        processDeath(death);
      }
    }
    if (appliedDamage > 0) outcomes.push({
      target: targetId, pelletHits: hit.pelletHits, damage: appliedDamage,
      resultingHealth, died, hitZone: hit.hitZone, wallbang: hit.wallbang,
      penetrationMultiplier: hit.penetrationMultiplier,
    });
  }
  const result = makeShotResult(
    request,
    outcomes.length > 0 ? 'accepted-hit' : 'accepted-miss',
    'none',
    request.renderedHostTimeMs,
    admission.appliedRewindMs,
    outcomes,
  );
  resolvedShotRequests.set(cacheKey, result);
  while (resolvedShotRequests.size > 256) resolvedShotRequests.delete(resolvedShotRequests.keys().next().value!);
  recordShotProtocol(outcomes.length > 0 ? 'accepted-hit' : 'accepted-miss');
  network.send(result);
}

function acceptAuthoritativeShotResult(message: ShotResultMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId) return;
  for (const outcome of message.outcomes) {
    if (outcome.target !== player.id || !player.alive) continue;
    const canonicalDamage = Math.max(0, player.hp - outcome.resultingHealth);
    if (canonicalDamage > 0) applyDamage(canonicalDamage, message.forPlayerId, 0, false, { kind: 'gun', weapon: remotes.get(message.forPlayerId)?.snapshot.weapon ?? 'carbine' }, true);
    if (player.alive) player.hp = outcome.resultingHealth;
  }
  if (message.forPlayerId !== player.id || presentedShotResults.has(message.shotId)) return;
  presentedShotResults.add(message.shotId);
  if (message.status === 'rejected') {
    recordShotProtocol(`result-rejected-${message.reason}`);
    return;
  }
  if (message.status === 'accepted-miss') {
    recordShotProtocol('result-miss');
    return;
  }
  const headshot = message.outcomes.some((outcome) => outcome.hitZone === 'head');
  const totalDamage = message.outcomes.reduce((total, outcome) => total + outcome.damage, 0);
  showHitmarker(headshot);
  showDamageNumber(totalDamage, headshot ? 'head' : 'body');
  audio.hit(headshot);
  roundHitShots += 1;
  roundHeadshots += message.outcomes.filter((outcome) => outcome.hitZone === 'head').length;
  roundDamageDealt += totalDamage;
  recordShotProtocol('result-hit-presented');
}

function renderRemoteShot(message: ShotMessage): void {
  const origin = new THREE.Vector3(...message.origin);
  if (!pointInsideBounds(origin, arena.bounds, 0.44)) return;
  const direction = new THREE.Vector3(...message.direction).normalize();
  const trace = traceWeaponPath(origin, direction, 50, message.weapon);
  const visibleEnd = origin.clone().addScaledVector(direction, trace.travelDistance);
  const remoteOperator = remotes.get(message.by)?.root.userData.operator as THREE.Group | undefined;
  const remoteMuzzle = remoteOperator?.getObjectByName('muzzle-socket')?.getWorldPosition(new THREE.Vector3());
  spawnTracer(remoteMuzzle ?? origin, visibleEnd, WEAPONS[message.weapon].color);
  if (remoteOperator) fireOperator(remoteOperator);
  let impactAudioPlayed = false;
  for (const impact of trace.impacts) {
    const impactDistance = impact.penetrated ? impact.entryDistance : impact.exitDistance;
    const point = origin.clone().addScaledVector(direction, impactDistance);
    const surface = ballisticImpactSurface(impact.surface.material);
    spawnImpactFlash(point, surface, new THREE.Vector3(
      impact.entryNormal.x,
      impact.entryNormal.y,
      impact.entryNormal.z,
    ));
    if (!impactAudioPlayed) {
      impactAudioPlayed = true;
      audio.impact(surface, point.distanceTo(camera.position));
    }
  }
  if (player.alive) audio.nearMiss(nearMissStrength(player.position, origin, visibleEnd));
  audio.shot(message.weapon, true, origin.distanceTo(camera.position));
}

function showDamageDirection(attacker: string): void {
  const attackerPosition = remotes.get(attacker)?.target ?? bots.get(attacker)?.position;
  if (!attackerPosition || attacker === player.id) return;
  const indicator = element<HTMLElement>('#damage-direction');
  indicator.style.setProperty('--damage-angle', `${sourceScreenAngle(player.position, player.yaw, attackerPosition)}rad`);
  indicator.classList.remove('pulse');
  requestAnimationFrame(() => indicator.classList.add('pulse'));
}

function scheduleLocalRespawn(now = performance.now()): void {
  element<HTMLElement>('#respawn').hidden = false;
  if (respawnTimer) return;
  respawnEndsAt = now + 1_900;
  respawnTimer = setTimeout(() => {
    respawnTimer = null;
    if (gameStarted && !matchFinished) respawn();
  }, 1_900);
}

function applyDamage(
  damage: number,
  attacker: string,
  minimumDamage = 1,
  bypassSpawnProtection = false,
  cause: KillCause = { kind: 'environment' },
  damageAlreadyHandicapped = false,
): void {
  const now = performance.now();
  if (!player.alive || (!bypassSpawnProtection && now < player.invulnerableUntil)) return;
  const previousHp = player.hp;
  const handicappedDamage = damageAlreadyHandicapped ? damage : applyDhvIncomingDamage(damage, player.hp, localDhv);
  player.hp = Math.max(0, player.hp - admittedPlayerDamage(handicappedDamage, minimumDamage));
  const appliedDamage = Math.max(0, previousHp - player.hp);
  roundDamageTaken += appliedDamage;
  recordDamageEvent({
    actorId: attacker,
    targetId: player.id,
    weaponOrEffect: cause.kind === 'gun' ? cause.weapon : cause.kind,
    healthBefore: previousHp,
    healthAfter: player.hp,
    damageRequested: damage,
    damageApplied: appliedDamage,
    reason: appliedDamage > 0 ? 'local-health-authority' : 'zero-applied',
  });
  if (network.role === 'host') recordAuthoritativeDamage(attacker, player.id, appliedDamage);
  else if (network.role === 'offline' || attacker === player.id) addFeed('DAMAGE TAKEN +' + Math.round(appliedDamage), 'coral', { damageTaken: appliedDamage });
  lastDamageAt = now;
  audio.damage();
  showDamageDirection(attacker);
  element<HTMLElement>('#damage-flash').classList.remove('pulse');
  requestAnimationFrame(() => element<HTMLElement>('#damage-flash').classList.add('pulse'));
  if (player.hp <= 0) {
    interruptReload(true, now);
    player.alive = false;
    player.deaths += 1;
    fieldSupport = recordSupportDeath(fieldSupport);
    updateFieldSupportHud();
    const death: DeathMessage = { type: 'death', killer: attacker, victim: player.id, cause, nonce: randomNonce() };
    if (network.role !== 'client') {
      network.send(death);
      processDeath(death);
    }
    scheduleLocalRespawn(now);
    document.exitPointerLock();
  }
}

function disposeDeathDrop(entity: DeathDropEntity): void {
  deathDropPresentationPool.release(entity.root);
}

function clearDeathDrops(): void {
  for (const entity of deathDrops) disposeDeathDrop(entity);
  deathDrops.length = 0;
  authorizedRemotePickups.clear();
  element<HTMLElement>('#pickup-prompt').hidden = true;
}

function deathDropVictim(message: DeathMessage): { weapon: PrimaryWeaponId; position: THREE.Vector3 } | null {
  if (message.victim === player.id) {
    const floorY = player.position.y - stanceEyeHeight(player.stance) + 0.18;
    return { weapon: player.primaryWeapon, position: new THREE.Vector3(player.position.x, floorY, player.position.z) };
  }
  const remote = remotes.get(message.victim);
  if (remote) {
    const floorY = remote.snapshot.y - stanceEyeHeight(remote.snapshot.stance ?? 'stand') + 0.18;
    return { weapon: remote.snapshot.primary, position: new THREE.Vector3(remote.snapshot.x, floorY, remote.snapshot.z) };
  }
  const bot = bots.get(message.victim);
  if (bot) return { weapon: bot.weapon, position: bot.position.clone().add(new THREE.Vector3(0, 0.18, 0)) };
  return null;
}

function spawnDeathDrop(message: DeathMessage, now = performance.now()): DeathDropEntity | null {
  const id = `death-${message.nonce}`;
  const existing = deathDrops.find((entity) => entity.drop.id === id);
  if (existing) return existing;
  const victim = deathDropVictim(message);
  if (!victim) return null;
  const bounded = clampPointToBounds(victim.position, arena.bounds, 0.5);
  victim.position.set(bounded.x, bounded.y, bounded.z);
  const spec = WEAPONS[victim.weapon];
  const drop = createDeathDrop(
    id,
    victim.weapon,
    victim.position,
    Math.max(1, Math.ceil(spec.mag * 0.5)),
    Math.max(1, Math.ceil(spec.reserve * 0.25)),
    now,
  );
  if (deathDrops.length >= MAX_DEATH_DROPS) removeDeathDrop(deathDrops[deathDrops.length - 1]);
  const root = deathDropPresentationPool.acquire(id, spec.color, victim.position);
  const entity = { drop, root };
  deathDrops.unshift(entity);
  return entity;
}

function removeDeathDrop(entity: DeathDropEntity): void {
  const index = deathDrops.indexOf(entity);
  if (index >= 0) deathDrops.splice(index, 1);
  disposeDeathDrop(entity);
}

function updateDeathDropPresentation(entity: DeathDropEntity, now = performance.now()): void {
  const ammoAvailable = deathDropAmmoAvailable(entity.drop, now);
  const weaponAvailable = deathDropWeaponAvailable(entity.drop, now);
  const model = entity.root.getObjectByName('death-drop-weapon');
  const beacon = entity.root.getObjectByName('death-drop-beacon');
  const ring = entity.root.getObjectByName('death-drop-ring') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
  if (model) model.visible = weaponAvailable;
  if (beacon) beacon.visible = ammoAvailable;
  if (ring) {
    ring.visible = ammoAvailable || weaponAvailable;
    ring.material.color.setHex(ammoAvailable ? 0x7cf3a0 : WEAPONS[entity.drop.weapon].color);
  }
}

function nearbyGunRangeWeaponStation(): GunRangeWeaponStation | null {
  if (selectedArena.id !== 'gun-range' || !player.alive || matchState.phase !== 'active') return null;
  return nearestGunRangeWeaponStation(player.position);
}

function interactWithGunRangeArmory(now = performance.now()): boolean {
  const station = nearbyGunRangeWeaponStation();
  if (!station) return false;
  interruptReload(true, now);
  const changedWeapon = !rangePrimaryUnlocked || player.primaryWeapon !== station.weapon;
  player.primaryWeapon = station.weapon;
  player.weapon = station.weapon;
  player.ammo[station.weapon] = WEAPONS[station.weapon].mag;
  player.reserve[station.weapon] = WEAPONS[station.weapon].reserve;
  player.switchingUntil = now + 360;
  player.sustainedShots = 0;
  rangePrimaryUnlocked = true;
  weaponView.setWeapon(station.weapon);
  audio.weaponSwitch();
  addFeed(`${WEAPONS[station.weapon].name.toUpperCase()} ${changedWeapon ? 'EQUIPPED' : 'REFILLED'}`, 'gold');
  renderFieldKitSelection();
  return true;
}

function interactWithWeaponPickup(now = performance.now()): boolean {
  return interactWithGunRangeArmory(now) || interactWithDeathDrop(now);
}

function interactWithDeathDrop(now = performance.now()): boolean {
  if (!player.alive || matchState.phase !== 'active') return false;
  const candidates = deathDrops
    .map((entity) => entity.drop)
    .filter((drop) => deathDropWeaponAvailable(drop, now) && (drop.weapon !== player.primaryWeapon || deathDropAmmoAvailable(drop, now)));
  const drop = nearestDeathDrop(candidates, player.position, DEATH_DROP_INTERACTION_RANGE, now, 'weapon');
  if (!drop) return false;
  const entity = deathDrops.find((candidate) => candidate.drop.id === drop.id);
  if (!entity) return false;
  const result = consumeDeathDropWeapon(
    drop,
    { primary: player.primaryWeapon, ammo: player.ammo[player.primaryWeapon], reserve: player.reserve[player.primaryWeapon] },
    WEAPONS[player.primaryWeapon].reserve,
    now,
  );
  if (!result.consumed) return false;
  interruptReload(true, now);
  entity.drop = result.drop;
  player.primaryWeapon = result.inventory.primary;
  player.ammo[result.inventory.primary] = result.inventory.ammo;
  player.reserve[result.inventory.primary] = result.inventory.reserve;
  player.weapon = result.inventory.primary;
  player.switchingUntil = now + 360;
  weaponView.setWeapon(player.weapon);
  audio.weaponSwitch();
  const pickup: PickupMessage = {
    type: 'pickup',
    by: player.id,
    dropId: drop.id,
    weapon: drop.weapon,
    mode: 'weapon',
    position: player.position.toArray(),
    nonce: randomNonce(),
  };
  network.send(pickup);
  recordMatchDiagnostic('weapon-pickup', network.role === 'client' ? 'observed' : 'accepted', {
    actorId: player.id,
    weaponOrEffect: drop.weapon,
    position: player.position.toArray(),
    reason: result.mode ?? 'unknown',
  });
  addFeed(result.mode === 'replenish' ? `${WEAPONS[drop.weapon].name.toUpperCase()} AMMO REPLENISHED` : `${WEAPONS[drop.weapon].name.toUpperCase()} PICKED UP`, 'gold');
  if (deathDropAvailable(entity.drop, now)) updateDeathDropPresentation(entity);
  else removeDeathDrop(entity);
  renderFieldKitSelection();
  return true;
}

function autoScavengeDeathDrop(now: number): boolean {
  if (!player.alive || matchState.phase !== 'active') return false;
  const drop = nearestScavengeDeathDrop(deathDrops.map((entity) => entity.drop), player.position, now);
  if (!drop) return false;
  const entity = deathDrops.find((candidate) => candidate.drop.id === drop.id);
  if (!entity) return false;
  const activeWeapon = player.weapon;
  const result = scavengeDeathDrop(
    drop,
    { weapon: activeWeapon, reserve: player.reserve[activeWeapon], grenades: player.grenades },
    WEAPONS[activeWeapon].reserve,
    2,
    now,
  );
  if (!result.scavenged) return false;
  entity.drop = result.drop;
  player.reserve[activeWeapon] = result.inventory.reserve;
  player.grenades = result.inventory.grenades;
  const pickup: PickupMessage = {
    type: 'pickup',
    by: player.id,
    dropId: drop.id,
    weapon: drop.weapon,
    mode: 'scavenge',
    position: player.position.toArray(),
    nonce: randomNonce(),
  };
  network.send(pickup);
  recordMatchDiagnostic('scavenge-pickup', network.role === 'client' ? 'observed' : 'accepted', {
    actorId: player.id,
    weaponOrEffect: activeWeapon,
    position: player.position.toArray(),
    reason: `ammo:${result.ammoGranted};grenade:${result.grenadeGranted}`,
  });
  const gains = [result.ammoGranted > 0 ? `+${result.ammoGranted} ${WEAPONS[activeWeapon].name.toUpperCase()} AMMO` : '', result.grenadeGranted > 0 ? '+1 FRAG' : ''].filter(Boolean).join(' · ');
  addFeed(`SCAVENGED ${gains}`, 'gold');
  if (deathDropAvailable(entity.drop, now)) updateDeathDropPresentation(entity);
  else removeDeathDrop(entity);
  return true;
}

function updateDeathDrops(now: number): void {
  autoScavengeDeathDrop(now);
  const retained = new Set(pruneDeathDrops(deathDrops.map((entity) => entity.drop), now, MAX_DEATH_DROPS).map((drop) => drop.id));
  for (let index = deathDrops.length - 1; index >= 0; index -= 1) {
    const entity = deathDrops[index];
    if (!retained.has(entity.drop.id)) {
      deathDrops.splice(index, 1);
      disposeDeathDrop(entity);
      continue;
    }
    updateDeathDropPresentation(entity);
    const age = Math.max(0, now - entity.drop.createdAt);
    entity.root.rotation.y = age * 0.00065;
    entity.root.position.y = entity.drop.position.y + Math.sin(age * 0.004) * 0.08;
  }
  const candidates = deathDrops
    .map((entity) => entity.drop)
    .filter((drop) => deathDropWeaponAvailable(drop, now) && (drop.weapon !== player.primaryWeapon || deathDropAmmoAvailable(drop, now)));
  const nearbyStation = nearbyGunRangeWeaponStation();
  const nearby = player.alive && !nearbyStation
    ? nearestDeathDrop(candidates, player.position, DEATH_DROP_INTERACTION_RANGE, now, 'weapon')
    : null;
  const prompt = element<HTMLElement>('#pickup-prompt');
  prompt.hidden = !nearby && !nearbyStation;
  if (nearbyStation) {
    const replenish = rangePrimaryUnlocked && nearbyStation.weapon === player.primaryWeapon;
    prompt.querySelector<HTMLElement>('span')!.textContent = replenish ? 'REFILL' : 'EQUIP';
    prompt.querySelector<HTMLElement>('strong')!.textContent = WEAPONS[nearbyStation.weapon].name.toUpperCase();
  } else if (nearby) {
    const replenish = nearby.weapon === player.primaryWeapon;
    prompt.querySelector<HTMLElement>('span')!.textContent = replenish ? 'REPLENISH' : 'PICK UP';
    prompt.querySelector<HTMLElement>('strong')!.textContent = WEAPONS[nearby.weapon].name.toUpperCase();
  }
}

function acceptRemotePickup(message: PickupMessage, now = performance.now()): void {
  if (message.by === player.id || processedNonces.has(message.nonce)) return;
  const remote = remotes.get(message.by);
  const entity = deathDrops.find((candidate) => candidate.drop.id === message.dropId);
  if (!remote || !entity || entity.drop.weapon !== message.weapon) return;
  const position = new THREE.Vector3(...message.position);
  const senderPosition = new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z);
  const dropPosition = new THREE.Vector3(entity.drop.position.x, entity.drop.position.y, entity.drop.position.z);
  const horizontalDropDistance = Math.hypot(position.x - dropPosition.x, position.z - dropPosition.z);
  const validDropDistance = message.mode === 'scavenge'
    ? horizontalDropDistance <= DEATH_DROP_SCAVENGE_RANGE + 0.5 && Math.abs(position.y - dropPosition.y) <= 2.5
    : position.distanceTo(dropPosition) <= DEATH_DROP_INTERACTION_RANGE + 0.5;
  if (!pointInsideBounds(position, arena.bounds, 0.44)
    || position.distanceTo(senderPosition) > 2.8
    || !validDropDistance
    || message.mode === 'scavenge' && !deathDropAmmoAvailable(entity.drop, now)
    || message.mode === 'weapon' && !deathDropWeaponAvailable(entity.drop, now)) return;
  processedNonces.add(message.nonce);
  if (message.mode === 'scavenge') {
    entity.drop = { ...entity.drop, ammoConsumedAt: now };
    const grenadeAuthority = remoteGrenadeAuthorities.get(message.by);
    if (grenadeAuthority) remoteGrenadeAuthorities.set(message.by, replenishRemoteGrenadeAuthorityState(grenadeAuthority));
  } else {
    entity.drop = { ...entity.drop, weaponConsumedAt: now };
    authorizedRemotePickups.set(message.by, { weapon: message.weapon, expiresAt: now + 2_000 });
    setOperatorWeapon(remote.root.userData.operator as THREE.Group, message.weapon, flattenOperatorMaterials);
  }
  if (deathDropAvailable(entity.drop, now)) updateDeathDropPresentation(entity);
  else removeDeathDrop(entity);
  trimNonceSet();
}

function spawnGlassShards(point: THREE.Vector3, normal: THREE.Vector3): void {
  const root = new THREE.Group();
  root.name = 'breaking-window-shards';
  root.position.copy(point);
  const shards: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3; spin: THREE.Vector3 }> = [];
  const material = new THREE.MeshBasicMaterial({ color: 0xa9e8f5, transparent: true, opacity: 0.74, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  for (let index = 0; index < 10; index += 1) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.14 + presentationRandom() * 0.16, 0.18 + presentationRandom() * 0.22), material);
    mesh.position.set((presentationRandom() - 0.5) * 0.55, (presentationRandom() - 0.5) * 0.45, (presentationRandom() - 0.5) * 0.08);
    root.add(mesh);
    shards.push({
      mesh,
      velocity: normal.clone().multiplyScalar(1.1 + presentationRandom() * 1.5).add(new THREE.Vector3((presentationRandom() - 0.5) * 1.7, 0.8 + presentationRandom() * 1.3, (presentationRandom() - 0.5) * 1.7)),
      spin: new THREE.Vector3(presentationRandom() * 8, presentationRandom() * 8, presentationRandom() * 8),
    });
  }
  scene.add(root);
  const startedAt = performance.now();
  const animate = (now: number) => {
    const age = (now - startedAt) / 1000;
    if (age >= 0.9) {
      disposeSupportRoot(root);
      return;
    }
    for (const shard of shards) {
      shard.velocity.y -= 7.5 / 60;
      shard.mesh.position.addScaledVector(shard.velocity, 1 / 60);
      shard.mesh.rotation.x += shard.spin.x / 60;
      shard.mesh.rotation.y += shard.spin.y / 60;
      shard.mesh.rotation.z += shard.spin.z / 60;
      (shard.mesh.material as THREE.MeshBasicMaterial).opacity = 0.74 * (1 - age / 0.9);
    }
    requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}

function breakHouseWindow(
  windowId: string,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  replicate: boolean,
  origin = camera.getWorldPosition(new THREE.Vector3()),
  kind: WindowBreakMessage['kind'] = 'shot',
  actionNonce?: number,
): boolean {
  const window = arena.breakableWindows.find((candidate) => candidate.id === windowId);
  if (!window || window.broken) return false;
  window.broken = true;
  window.mesh.visible = false;
  spawnImpactFlash(point, 'glass', normal);
  spawnGlassShards(point, normal);
  audio.impact('glass', point.distanceTo(camera.position));
  if (replicate) {
    const message: WindowBreakMessage = {
      type: 'window-break',
      by: player.id,
      windowId,
      origin: origin.toArray(),
      kind,
      ...(kind === 'explosive' ? { actionNonce } : {}),
      nonce: randomNonce(),
    };
    network.send(message);
  }
  return true;
}

function acceptRemoteWindowBreak(message: WindowBreakMessage): void {
  if (message.by === player.id || processedNonces.has(message.nonce)) return;
  const remote = remotes.get(message.by);
  const window = arena.breakableWindows.find((candidate) => candidate.id === message.windowId);
  if (!remote || !window || window.broken) return;
  const origin = new THREE.Vector3(...message.origin);
  const sender = new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z);
  const centre = window.mesh.getWorldPosition(new THREE.Vector3());
  const explosive = message.kind === 'explosive';
  const senderOriginLimit = explosive ? 36 : 2.8;
  const shotDelta = centre.clone().sub(origin);
  const shotTrace = explosive ? null : traceWeaponPath(origin, shotDelta, shotDelta.length(), remote.snapshot.weapon);
  if (!pointInsideBounds(origin, arena.bounds, 0.44)
    || origin.distanceTo(sender) > senderOriginLimit
    || explosive && origin.distanceTo(centre) > GRENADE_RADIUS + 0.5
    || !explosive && origin.distanceTo(centre) > 110
    || explosive && windowBreakPathBlocked(origin, centre, arena.colliders)
    || !explosive && !shotTrace?.reachedDistance) return;
  if (explosive && !localMultiplayerQa) {
    const grenadeAuthority = remoteGrenadeAuthorities.get(message.by);
    if (!grenadeAuthority || !Number.isFinite(message.actionNonce)) return;
    const admission = admitRemoteGrenadeExplosion(grenadeAuthority, {
      actionNonce: message.actionNonce!,
      explosionOrigin: message.origin,
      now: performance.now(),
    });
    if (!admission.accepted) return;
    remoteGrenadeAuthorities.set(message.by, admission.state);
  }
  processedNonces.add(message.nonce);
  const normal = centre.clone().sub(origin).normalize().multiplyScalar(-1);
  breakHouseWindow(message.windowId, centre, normal, false, origin);
  trimNonceSet();
}

function resetBreakableWindows(): void {
  for (const window of arena.breakableWindows) {
    window.broken = false;
    window.mesh.visible = true;
  }
}

function processDeath(message: DeathMessage): void {
  const victimPoint = message.victim === player.id ? player.position : remotes.get(message.victim)?.target ?? bots.get(message.victim)?.position;
  if (victimPoint) recordSpawnDeath(victimPoint);
  const killer = message.killer === player.id ? player.name : remotes.get(message.killer)?.snapshot.name ?? bots.get(message.killer)?.name ?? 'Unknown';
  const victim = message.victim === player.id ? player.name : remotes.get(message.victim)?.snapshot.name ?? bots.get(message.victim)?.name ?? 'Unknown';
  spawnDeathDrop(message);
  if (message.victim === player.id && player.alive) {
    const now = performance.now();
    interruptReload(true, now);
    player.hp = 0;
    player.alive = false;
    if (gameMode === 'solo') player.deaths += 1;
    fieldSupport = recordSupportDeath(fieldSupport);
    updateFieldSupportHud();
    document.exitPointerLock();
  }
  if (message.victim === player.id) scheduleLocalRespawn();
  if (message.killer !== message.victim && isKillstreakEligible(message.cause)) {
    const killerAuthority = remoteSupportAuthorities.get(message.killer);
    if (killerAuthority) remoteSupportAuthorities.set(message.killer, recordRemoteSupportElimination(killerAuthority));
  }
  const victimAuthority = remoteSupportAuthorities.get(message.victim);
  if (victimAuthority) remoteSupportAuthorities.set(message.victim, recordRemoteSupportDeath(victimAuthority));
  if (remoteGrenadeAuthorities.has(message.victim)) remoteGrenadeAuthorities.set(message.victim, resetRemoteGrenadeAuthorityState());
  if (network.role === 'host' && message.killer !== message.victim) {
    const killerMember = hostLobbyMembers.get(message.killer) ?? bots.get(message.killer);
    const victimMember = hostLobbyMembers.get(message.victim) ?? bots.get(message.victim);
    if (killerMember && victimMember && areCombatantsHostile(killerMember.id, killerMember.team, victimMember.id, victimMember.team)) {
      const killerScore = authoritativeScores.get(message.killer) ?? emptyPlayerScore(message.killer);
      const victimScore = authoritativeScores.get(message.victim) ?? emptyPlayerScore(message.victim);
      authoritativeScores.set(message.killer, { ...killerScore, kills: killerScore.kills + 1 });
      authoritativeScores.set(message.victim, { ...victimScore, deaths: victimScore.deaths + 1 });
      const hostScore = authoritativeScores.get(player.id);
      if (hostScore) {
        player.kills = hostScore.kills;
        player.deaths = hostScore.deaths;
      }
      sendAuthoritativeScores();
    }
  }
  if (network.role !== 'client' && message.killer !== message.victim
    && (message.killer === player.id || remotes.has(message.killer))) {
    const transfer = transferOverdriveOnElimination(overdriveState, message.victim, message.killer, performance.now());
    if (transfer.transferred) {
      overdriveState = transfer.state;
      registerOverdrivePickup(message.killer, performance.now());
      addFeed('QUAD STOLEN · KILL THE HOLDER TO TAKE ITS REMAINING TIME', 'gold');
    }
  }
  if (message.killer === player.id && message.victim !== player.id) {
    if (gameMode === 'solo') player.kills += 1;
    if (isKillstreakEligible(message.cause)) awardSupportElimination();
    audio.kill();
  } else if (message.victim === player.id && message.killer !== player.id) {
    const remoteKiller = remotes.get(message.killer);
    if (remoteKiller && areCombatantsHostile(remoteKiller.snapshot.id, remoteKiller.snapshot.team, player.id, player.team)) {
      verifiedRemoteKills.set(message.killer, (verifiedRemoteKills.get(message.killer) ?? 0) + 1);
    }
  }
  addFeed(`${killer} eliminated ${victim}`, message.killer === player.id ? 'gold' : undefined);
  const remote = remotes.get(message.victim);
  if (remote) {
    remote.snapshot = { ...remote.snapshot, hp: 0 };
    remote.root.visible = false;
  }
  const bot = bots.get(message.victim);
  if (bot) bot.root.visible = false;
  checkMatchEnd();
}

function removeRemote(id: string, reason: string): void {
  const remote = remotes.get(id);
  if (!remote) return;
  scene.remove(remote.root);
  remotes.delete(id);
  verifiedRemoteKills.delete(id);
  remoteShotAdmissions.delete(id);
  admittedRemoteShots.delete(id);
  admittedRemoteMelees.delete(id);
  admittedRemoteExplosions.delete(id);
  const retainCombatAuthority = shouldRetainRemoteCombatAuthority(
    network.role,
    privateLobbySnapshot?.phase ?? null,
    hostLobbyMembers.has(id),
  );
  if (!retainCombatAuthority) {
    remoteSupportAuthorities.delete(id);
    remoteGrenadeAuthorities.delete(id);
    remoteHealthAuthorities.delete(id);
  }
  peerTimingStates.delete(id);
  remoteMeleeAdmissions.delete(id);
  remotePingAdmissions.delete(id);
  authorizedRemotePickups.delete(id);
  addFeed(`${remote.snapshot.name} ${reason}`);
}

function activeSpawnMode(): SpawnMode {
  return gameMode === 'solo' ? 'solo' : privateMatchMode;
}

function recentSpawnDeathPoints(now = performance.now()): THREE.Vector3[] {
  while (recentDeathPositions.length > 0 && now - recentDeathPositions[0].at > 12_000) recentDeathPositions.shift();
  return recentDeathPositions.map((entry) => entry.point);
}

function recordSpawnDeath(point: THREE.Vector3, now = performance.now()): void {
  recentDeathPositions.push({ point: point.clone(), at: now });
  if (recentDeathPositions.length > 16) recentDeathPositions.shift();
}
function spawnPoint(): THREE.Vector3 {
  const otherPlayers = [
    ...[...remotes.values()].filter((remote) => remote.snapshot.hp > 0)
      .map((remote) => new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z)),
    ...[...bots.values()].filter((bot) => bot.alive).map((bot) => bot.position.clone()),
  ];
  const threats = [
    ...[...remotes.values()]
      .filter((remote) => areCombatantsHostile(remote.snapshot.id, remote.snapshot.team, player.id, player.team) && remote.snapshot.hp > 0)
      .map((remote) => new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z)),
    ...[...bots.values()]
      .filter((bot) => bot.team !== player.team && bot.alive)
      .map((bot) => bot.position.clone().add(new THREE.Vector3(0, 1.42, 0))),
  ];
  const validForSide = (side: Team) => arena.spawns[side]
    .map((point, localIndex) => ({ point, side, index: side * 100 + localIndex }))
    .filter(({ point }) => {
      const bodyPoint = { x: point.x, y: 0, z: point.z };
      return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
        && pointInsideBounds(bodyPoint, arena.bounds, 0.44)
        && !isBlocked(bodyPoint, arena.colliders, 0.44);
    });
  const home = validForSide(player.team);
  const oppositeTeam: Team = player.team === 0 ? 1 : 0;
  const opposite = validForSide(oppositeTeam);
  if (home.length === 0) throw new Error(`No valid authored player spawn for team ${player.team}`);
  const pressure = (options: ReturnType<typeof validForSide>) => {
    const scored = options.map(({ point }) => ({
      visibleThreats: threats.filter((threat) => !arena.colliders.some((box) => segmentIntersectsBox(threat, point, box))).length,
      nearestThreatDistanceSq: threats.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...threats.map((threat) => threat.distanceToSquared(point))),
    }));
    const minimumVisibleThreats = Math.min(...scored.map((entry) => entry.visibleThreats));
    return {
      minimumVisibleThreats,
      safestNearestThreatDistanceSq: Math.max(...scored.filter((entry) => entry.visibleThreats === minimumVisibleThreats).map((entry) => entry.nearestThreatDistanceSq)),
    };
  };
  const instantaneousFlip = threats.length > 0 && opposite.length > 0 && shouldFlipSpawnSide(pressure(home), pressure(opposite));
  const flipDecision = advanceSpawnFlipHysteresis(spawnFlipHysteresis[player.team], instantaneousFlip, performance.now());
  spawnFlipHysteresis[player.team] = flipDecision.state;
  const flipped = flipDecision.flip;
  const valid = flipped ? opposite : home;
  const unoccupied = valid.filter(({ point }) => !otherPlayers.some((position) => position.distanceToSquared(point) < 20));
  const selectable = unoccupied.length > 0 ? unoccupied : valid;
  const candidates = selectable.map(({ point, index }) => ({
    index,
    point,
    nearestPlayerDistanceSq: otherPlayers.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...otherPlayers.map((other) => other.distanceToSquared(point))),
    visibleThreats: threats.filter((threat) => !arena.colliders.some((box) => segmentIntersectsBox(threat, point, box))).length,
  }));
  const previousIndex = lastPlayerSpawnIndex;
  const population = otherPlayers.length + 1;
  const spawnMode = activeSpawnMode();
  const selection = scoreSpawnCandidates({
    arenaId: selectedArena.id,
    mode: spawnMode,
    population,
    candidates: candidates.map(({ index, point }) => ({ index, point })),
    threats,
    occupants: otherPlayers,
    recentDeaths: recentSpawnDeathPoints(),
    colliders: arena.colliders,
    previousIndex,
  });
  const selectedIndex = selection.index;
  const minimumVisibleThreats = Math.min(...candidates.map((candidate) => candidate.visibleThreats));
  const selected = candidates.find((candidate) => candidate.index === selectedIndex)!;
  const selectedSpawn = valid.find(({ index }) => index === selectedIndex)!;
  lastPlayerSpawnAudit = {
    previousIndex,
    selectedIndex,
    selectedVisibleThreats: selected.visibleThreats,
    minimumVisibleThreats,
    safeTierCount: candidates.filter((candidate) => candidate.visibleThreats === minimumVisibleThreats).length,
    selectedSide: selectedSpawn.side,
    flipped,
    score: selection.score,
    reason: selection.reason,
    mode: spawnMode,
    population,
  };
  recordMatchDiagnostic('spawn-selection', 'accepted', {
    actorId: player.id,
    position: [selectedSpawn.point.x, selectedSpawn.point.y, selectedSpawn.point.z],
    spawnScore: selection.score,
    spawnReason: selection.reason,
    modifiers: [spawnMode, `population:${population}`, flipped ? 'spawn-flipped' : 'home-side'],
  });
  lastPlayerSpawnIndex = selectedIndex;
  return selectedSpawn.point.clone();
}

function requestGamePointerLock(): void {
  try {
    const request = canvas.requestPointerLock();
    if (request instanceof Promise) void request.catch(() => undefined);
  } catch {
    // Browsers can reject pointer lock outside a user gesture (for example, auto-join smoke tests).
  }
}

function requestStance(action: 'toggle-crouch' | 'toggle-prone' | 'stand'): boolean {
  if (!characterPhysics || !player.alive) return false;
  const target = nextStance(player.stance, action);
  if (!playerGrounded && target !== 'crouch') return false;
  if (target === player.stance) return true;
  const previous = player.stance;
  const before = characterPhysics.eyePosition();
  if (!characterPhysics.setStance(target)) {
    setStatus('Low clearance — stance change blocked.', 'warn');
    return false;
  }
  const after = characterPhysics.eyePosition();
  // Keep the rendered camera inside the newly authoritative capsule. A large
  // cosmetic eye-height lag could leave the camera in ceilings/walls on prone.
  cameraHeightOffset = THREE.MathUtils.clamp(cameraHeightOffset + before.y - after.y, -0.12, 0.12);
  player.position.set(after.x, after.y, after.z);
  player.stance = target;
  stanceRecoveryUntil = performance.now() + (target === 'prone' ? 260 : previous === 'prone' ? 290 : 135);
  currentSprinting = false;
  return true;
}

function respawn(requestLock = true): void {
  if (!player.alive) {
    localContinuity += 1;
    localPositionHistory.length = 0;
  }
  if (respawnTimer) clearTimeout(respawnTimer);
  respawnTimer = null;
  interruptReload(true);
  clearGameplayInput();
  player.stance = 'stand';
  characterPhysics?.setStance('stand');
  player.position.copy(spawnPoint());
  characterPhysics?.teleportEye(player.position);
  player.velocity.set(0, 0, 0);
  currentSprinting = false;
  playerGrounded = false;
  wasGrounded = false;
  lastGroundedAt = -10_000;
  gamepadTriggerArmed = false;
  gamepadAdsArmed = false;
  player.hp = 100;
  lastDamageAt = -10_000;
  lastFallDamage = 0;
  lastFallImpactSpeed = 0;
  player.grenades = 2;
  player.reloadState = null;
  player.alive = true;
  respawnEndsAt = 0;
  player.invulnerableUntil = performance.now() + 1350;
  player.yaw = operatorYawToward({ x: player.position.x, z: player.position.z }, { x: 0, z: 0 });
  player.pitch = 0;
  recoilCamera = { pitch: 0, yaw: 0 };
  stanceRecoveryUntil = 0;
  sprintRecoveryUntil = 0;
  deferredFireAt = 0;
  cameraHeightOffset = 0;
  cameraRoll = 0;
  jumpQueuedAt = -10_000;
  footstepAccumulator = { distance: 0, side: 0 };
  if (selectedArena.id === 'gun-range') {
    rangePrimaryUnlocked = false;
    player.primaryWeapon = 'carbine';
    const sidearm = handicapSidearm(player.primaryWeapon);
    player.weapon = sidearm;
    player.ammo[sidearm] = WEAPONS[sidearm].mag;
    player.reserve[sidearm] = WEAPONS[sidearm].reserve;
    player.switchingUntil = 0;
    weaponView.setWeapon(sidearm, true);
  } else {
    const deploymentWeapon = fieldKitById(selectedFieldKit).weapon;
    player.primaryWeapon = deploymentWeapon;
    for (const weapon of handicapLoadout(deploymentWeapon)) {
      player.ammo[weapon] = WEAPONS[weapon].mag;
      player.reserve[weapon] = WEAPONS[weapon].reserve;
    }
    if (player.weapon !== player.primaryWeapon) {
      player.weapon = player.primaryWeapon;
      player.switchingUntil = 0;
      weaponView.setWeapon(player.primaryWeapon, true);
    }
  }
  renderFieldKitSelection();
  element<HTMLElement>('#respawn').hidden = true;
  if (gameStarted && requestLock) requestGamePointerLock();
  network.send(createStateMessage());
}

function startGame(mode: 'solo' | 'host' | 'client', requestLock = true, activeAtLocalMonoMs?: number): void {
  if (mode !== 'solo' && !selectedArena.multiplayer) {
    setStatus(`${selectedArena.displayName} is solo-only.`, 'warn');
    return;
  }
  const requiredName = requirePlayerName();
  if (!requiredName) return;
  player.name = requiredName;
  player.team = Number(element<HTMLSelectElement>('#team').value) === 1 ? 1 : 0;
  gameStarted = true;
  hidePrivateLobbyPresentation();
  syncArenaSelectionUi();
  bestStreakThisMatch = 0;
  matchScoreRecorded = false;
  targetHits = 0;
  rangeScore = 0;
  rangeShotsFired = 0;
  roundShotsFired = 0;
  roundHitShots = 0;
  roundHeadshots = 0;
  roundDamageDealt = 0;
  roundDamageTaken = 0;
  localContinuity += 1;
  localPositionHistory.length = 0;
  localShotSeq = 0;
  localFireSeq = 0;
  resolvedShotRequests.clear();
  presentedShotResults.clear();
  authoritativeShotAdmissions.clear();
  for (const key of Object.keys(shotProtocolTelemetry)) delete shotProtocolTelemetry[key];
  localSnapshotRateState = createSnapshotRateState(performance.now());
  for (const target of arena.targets) {
    target.active = true;
    target.health = target.maxHealth;
    target.respawnAt = 0;
    target.root.visible = true;
  }
  refreshWarningUntil = performance.now() + 6_000;
  weaponView.root.visible = true;
  gameMode = mode;
  lastPlayerSpawnIndex = -1;
  lastPlayerSpawnAudit = null;
  recentDeathPositions.length = 0;
  lastBotSpawnAudit.clear();
  spawnFlipHysteresis = [createSpawnFlipHysteresis(), createSpawnFlipHysteresis()];
  botsFrozen = false;
  debugBotStanceOverride = null;
  debugBotSpeedOverride = 0;
  const matchStartedAt = performance.now();
  beginMatchDiagnostics(mode, matchStartedAt);
  const matchRules = currentMatchRules();
  if (mode !== 'solo' && activeAtLocalMonoMs !== undefined) {
    const activeAt = activeAtLocalMonoMs;
    if (matchStartedAt < activeAt) {
      matchState = {
        phase: 'warmup',
        phaseStartedAt: activeAt - MATCH_WARMUP_MS,
        endsAt: activeAt,
        winner: null,
      };
    } else {
      matchState = {
        phase: 'active',
        phaseStartedAt: activeAt,
        endsAt: matchRules.durationMs === null ? Number.POSITIVE_INFINITY : activeAt + (matchRules.durationMs ?? 0),
        winner: null,
      };
    }
  } else {
    matchState = createMatch(matchStartedAt, matchRules);
  }
  overdriveState = createOverdriveState(activeAtLocalMonoMs ?? matchStartedAt);
  overdriveClaimGeneration = -1;
  overdriveClaimLastSentAt = Number.NEGATIVE_INFINITY;
  overdriveSpawns = 0;
  overdrivePickups = 0;
  overdriveExpiries = 0;
  overdriveRoot.visible = false;
  element<HTMLElement>('#overdrive-hud').hidden = true;
  matchFinished = false;
  previousHudScores = [0, 0];
  if (respawnTimer) clearTimeout(respawnTimer);
  respawnTimer = null;
  respawnEndsAt = 0;
  menu.classList.add('hidden');
  hudRoot.hidden = false;
  element<HTMLElement>('#connection-pill').textContent = selectedArena.id === 'gun-range'
    ? mode === 'solo' ? 'SOLO RANGE' : mode === 'host' ? 'RANGE HOST' : 'RANGE PEER'
    : mode === 'solo' ? (selectedArena.soloBotCount === 1 ? '1V1 BOT' : 'BOT SKIRMISH') : mode === 'host' ? 'HOST' : 'PEER';
  element<HTMLElement>('#match-mode-label').textContent = selectedArena.id === 'gun-range' ? 'SCORE PRACTICE' : selectedArena.id === 'rustworks-1v1' ? (gameMode === 'solo' ? 'RUSTWORKS DUEL' : 'RUSTWORKS MATCH') : 'TEAM DEATHMATCH';
  element<HTMLElement>('#score-limit').textContent = selectedArena.matchRules.scoreLimit === null ? '—' : String(selectedArena.matchRules.scoreLimit);
  element<HTMLElement>('#aqua-label').textContent = selectedArena.id === 'gun-range' ? 'SCORE' : 'AQUA';
  element<HTMLElement>('#coral-label').textContent = selectedArena.id === 'gun-range' ? 'HITS' : 'CORAL';
  element<HTMLElement>('#support-block').hidden = !selectedArena.fieldSupport;
  element<HTMLElement>('#ping-block').hidden = !selectedArena.multiplayer;
  element<HTMLElement>('#room-hud').textContent = network.roomCode ? `ROOM ${network.roomCode.slice(0, 8).toUpperCase()}` : '';
  respawn(requestLock);
  if (mode === 'solo') spawnBots();
  else if (mode === 'host') spawnBots(privateMatchConfig.hostedBotCount);
  audio.unlock();
  addFeed(`Welcome to ${arena.label}`, 'gold');
  if (selectedArena.id === 'gun-range') addFeed('100 / 200 / 300 POINT TARGETS · SCORE ATTACK', 'gold');
  if (mode !== 'solo') {
    network.send({ type: 'join', player: snapshot() });
    sendLeaderboardSync();
    if (mode === 'host') broadcastOverdriveState(matchStartedAt);
  }
}

function randomNonce(): number {
  return Math.floor(performance.now() * 1000 + protocolRandom() * 1_000_000);
}

function endSpawnProtectionOnOffense(now: number): void {
  if (now < player.invulnerableUntil) player.invulnerableUntil = 0;
}

function switchWeapon(index: number): void {
  const id = selectedArena.id === 'gun-range'
    ? index === 0 ? rangePrimaryUnlocked ? player.primaryWeapon : undefined : index === 1 ? handicapSidearm(player.primaryWeapon) : undefined
    : handicapLoadout(player.primaryWeapon)[index];
  if (!id || id === player.weapon || !player.alive) return;
  if (player.reloadState) {
    if (!cancelReload(player.reloadState, performance.now())) return;
    player.reloadState = null;
    weaponView.cancelReload();
  }
  player.weapon = id;
  player.switchingUntil = performance.now() + 360;
  player.sustainedShots = 0;
  weaponView.setWeapon(id);
  audio.weaponSwitch();
}

function reload(): void {
  if (!player.alive || matchState.phase !== 'active') return;
  const spec = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  const availableReserve = reloadSupply(selectedArena.id, player.reserve[player.weapon], spec.mag);
  if (player.reloadState || ammo >= spec.mag || availableReserve <= 0) return;
  player.reloadState = beginReload(spec, ammo, availableReserve, performance.now());
  weaponActionHistory.length = 0;
  audio.reload();
  weaponView.reload();
  addFeed(`Reloading ${spec.name}`);
}

function finishReload(now: number): void {
  if (!player.reloadState) return;
  const spec = WEAPONS[player.weapon];
  const currentReserve = player.reserve[player.weapon];
  const availableReserve = reloadSupply(selectedArena.id, currentReserve, spec.mag);
  const state = completeReloadState(player.reloadState, now, player.ammo[player.weapon], availableReserve);
  if (state.completed) {
    player.ammo[player.weapon] = state.ammo;
    player.reserve[player.weapon] = reserveAfterCompletedReload(selectedArena.id, currentReserve, state.reserve);
    player.reloadState = null;
    weaponView.cancelReload();
  }
}

function tryFire(now: number): void {
  if (!player.alive || !gameStarted || (!debugInputUnlocked && document.pointerLockElement !== canvas) || matchState.phase !== 'active') return;
  if (currentSprinting) {
    currentSprinting = false;
    sprintRecoveryUntil = Math.max(sprintRecoveryUntil, now + 150);
  }
  const readyAt = Math.max(stanceRecoveryUntil, sprintRecoveryUntil);
  if (now < readyAt) {
    if (deferredFireAt < readyAt) {
      deferredFireAt = readyAt;
      window.setTimeout(() => {
        deferredFireAt = 0;
        if (triggerHeld) tryFire(performance.now());
      }, Math.max(1, readyAt - now + 2));
    }
    return;
  }
  deferredFireAt = 0;
  const spec = WEAPONS[player.weapon];
  if (!triggerHeld && spec.automatic) return;
  if (now < player.switchingUntil) return;
  if (player.reloadState) {
    // An empty magazine must finish its automatic reload even if the player
    // keeps the trigger held. Non-empty tactical reloads remain cancellable.
    if (player.ammo[player.weapon] <= 0) return;
    if (!cancelReload(player.reloadState, now)) return;
    player.reloadState = null;
    weaponView.cancelReload();
  }
  const shotInterval = 60_000 / spec.rpm;
  if (now < player.nextShotAt) return;
  if (player.nextShotAt === 0 || now - player.nextShotAt > shotInterval * 2) player.nextShotAt = now;
  player.nextShotAt += shotInterval;
  endSpawnProtectionOnOffense(now);
  if (player.ammo[player.weapon] <= 0) {
    audio.empty();
    reload();
    player.lastShotAt = now;
    return;
  }
  player.sustainedShots = now - player.lastShotAt < 260 ? player.sustainedShots + 1 : 0;
  player.lastShotAt = now;
  player.ammo[player.weapon] = Math.max(0, player.ammo[player.weapon] - 1);
  roundShotsFired += 1;
  if (isGunRange(selectedArena.id)) {
    rangeShotsFired += 1;
    publishRangeScore();
  }
  if (player.ammo[player.weapon] === 0) {
    const emptiedWeapon = player.weapon;
    window.setTimeout(() => {
      if (player.weapon === emptiedWeapon && player.ammo[emptiedWeapon] === 0) reload();
    }, 110);
  }
  const ammoDisplay = element<HTMLElement>('#ammo');
  ammoDisplay.classList.remove('fired');
  requestAnimationFrame(() => ammoDisplay.classList.add('fired'));
  const recoil = computeRecoilImpulse(spec, player.sustainedShots, gameplayRandom(), {
    ads: adsHeld && weaponView.adsProgress() >= 0.9,
    crouched: player.stance === 'crouch',
    prone: player.stance === 'prone',
  });
  recoilCamera.pitch = Math.min(0.16, recoilCamera.pitch + recoil.pitch);
  recoilCamera.yaw = THREE.MathUtils.clamp(recoilCamera.yaw + recoil.yaw, -0.075, 0.075);
  recoilVisual = Math.min(0.24, recoilVisual + recoil.pitch * 4.2);
  weaponView.fire(recoil.pitch);
  audio.shot(player.weapon);

  const origin = camera.getWorldPosition(new THREE.Vector3());
  const baseDirection = camera.getWorldDirection(new THREE.Vector3());
  const moving = Math.hypot(player.velocity.x, player.velocity.z) > 1.2;
  const adsSettled = adsHeld && weaponView.adsProgress() >= 0.9;
  const spread = computeSpread(spec, {
    ads: adsSettled,
    moving,
    crouched: player.stance === 'crouch',
    prone: player.stance === 'prone',
    sustainedShots: player.sustainedShots,
  });
  const hitDamage = new Map<string, {
    damage: number;
    zone: HitZone;
    wallbang: boolean;
    penetrationMultiplier: number;
    distanceMeters: number;
  }>();
  const pelletDirections: [number, number, number][] = [];
  let impactAudioPlayed = false;
  const presentedSurfaceIds = new Set<string>();
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  for (let pellet = 0; pellet < spec.pellets; pellet += 1) {
    const sample = sampleWeaponPellet(spec, pellet, spread, gameplayRandom(), gameplayRandom());
    const direction = baseDirection.clone()
      .addScaledVector(cameraRight, sample.x)
      .addScaledVector(cameraUp, sample.y)
      .normalize();
    pelletDirections.push(direction.toArray() as [number, number, number]);
    if (pellet === 0) {
      lastPrincipalShotAlignment = {
        weapon: player.weapon,
        angularError: direction.angleTo(baseDirection),
        sample: [sample.x, sample.y],
        direction: direction.toArray(),
        cameraDirection: baseDirection.toArray(),
        spread,
        ads: adsSettled,
        stance: player.stance,
        moving,
      };
    }
    const result = castShot(origin, direction, player.weapon, true);
    const authoritativeEnd = origin.clone().addScaledVector(direction, result.distance);
    const visualStart = weaponView.muzzleWorldPosition(new THREE.Vector3()) ?? origin;
    spawnTracer(visualStart, authoritativeEnd, spec.color);
    for (const impact of result.ballisticTrace?.impacts ?? []) {
      if (presentedSurfaceIds.has(impact.surface.id)) continue;
      presentedSurfaceIds.add(impact.surface.id);
      const impactDistance = impact.penetrated ? impact.entryDistance : impact.exitDistance;
      const point = origin.clone().addScaledVector(direction, impactDistance);
      const normal = new THREE.Vector3(impact.entryNormal.x, impact.entryNormal.y, impact.entryNormal.z);
      if (impact.surface.breakableWindowId) {
        if (breakHouseWindow(impact.surface.breakableWindowId, point, normal, true, origin)) impactAudioPlayed = true;
        continue;
      }
      const surface = ballisticImpactSurface(impact.surface.material);
      spawnImpactFlash(point, surface, normal);
      if (!impactAudioPlayed) {
        impactAudioPlayed = true;
        audio.impact(surface, point.distanceTo(camera.position));
      }
    }
    if (result.windowId) {
      const point = result.impactPoint ?? authoritativeEnd;
      const normal = result.impactNormal ?? direction.clone().multiplyScalar(-1);
      if (breakHouseWindow(result.windowId, point, normal, true, origin)) impactAudioPlayed = true;
    }
    if (!result.playerId && !result.targetId && !result.windowId && result.distance < 89
      && (result.ballisticTrace?.impacts.length ?? 0) === 0) {
      const point = result.impactPoint ?? origin.clone().addScaledVector(direction, result.distance);
      const normal = result.impactNormal ?? direction.clone().multiplyScalar(-1);
      const surface = result.impactSurface ?? 'concrete';
      spawnImpactFlash(point, surface, normal);
      if (!impactAudioPlayed) {
        impactAudioPlayed = true;
        audio.impact(surface, point.distanceTo(camera.position));
      }
    }
    if (result.playerId) {
      const zone = result.hitZone ?? 'body';
      const damage = applyPenetrationDamage(computeDamage(spec, result.distance, zone), result.damageMultiplier);
      if (damage > 0) {
        const prior = hitDamage.get(result.playerId);
        hitDamage.set(result.playerId, {
          damage: (prior?.damage ?? 0) + damage,
          zone: prior?.zone === 'head' || zone === 'head' ? 'head' : zone,
          wallbang: Boolean(prior?.wallbang) || result.damageMultiplier < 0.999,
          penetrationMultiplier: Math.min(prior?.penetrationMultiplier ?? 1, result.damageMultiplier),
          distanceMeters: Math.max(prior?.distanceMeters ?? 0, result.distance),
        });
      }
    }
    if (result.targetId) {
      const practiceTarget = arena.targets.find((target) => target.id === result.targetId);
      const zone = practiceTarget?.alwaysCritical ? 'head' : result.hitZone ?? 'body';
      const targetDamage = applyPenetrationDamage(computeDamage(spec, result.distance, zone), result.damageMultiplier);
      if (targetDamage > 0) hitPracticeTarget(
          result.targetId,
          targetDamage,
          zone,
          {
            wallbang: result.damageMultiplier < 0.999,
            penetrationMultiplier: result.damageMultiplier,
            distanceMeters: result.distance,
          },
        );
    }
  }
  const shot: ShotMessage = {
    type: 'shot',
    by: player.id,
    weapon: player.weapon,
    origin: origin.toArray() as [number, number, number],
    direction: baseDirection.toArray() as [number, number, number],
    pelletDirections,
    timing: nextCombatTiming(),
    nonce: randomNonce(),
  };
  if (network.role === 'client') {
    const renderedTargetTimes = [...hitDamage.keys()]
      .map((targetId) => remotes.get(targetId)?.renderedHostTimeMs)
      .filter((value): value is number => Number.isFinite(value));
    const renderedHostTimeMs = renderedTargetTimes.length > 0
      ? Math.min(...renderedTargetTimes)
      : Math.max(0, currentHostTimeMs() - SNAPSHOT_INTERPOLATION_DELAY_MS);
    const request: ShotRequestMessage = {
      type: 'shot-request', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: player.id,
      shotId: `${shotSessionId}:${localShotSeq}`, shotSeq: localShotSeq, fireSeq: localFireSeq,
      weapon: player.weapon, renderedHostTimeMs, continuity: localContinuity,
      origin: shot.origin, direction: shot.direction, pelletDirections: shot.pelletDirections,
      nonce: shot.nonce,
    };
    localShotSeq += 1;
    localFireSeq += 1;
    network.send(request);
    recordShotProtocol('created-sent');
    return;
  }
  network.send(shot);
  if (hitDamage.size > 0) {
    roundHitShots += 1;
    roundHeadshots += [...hitDamage.values()].filter((hit) => hit.zone === 'head').length;
  }
  for (const [target, hit] of hitDamage) {
    const poweredDamage = outgoingDamage(hit.damage, now);
    const bot = bots.get(target);
    if (bot) {
      if (gameMode === 'client' && bot.id.startsWith('host-bot-')) {
        const requested = Math.min(100, hit.damage);
        sendAuthoritativeHit({
          type: 'hit', by: player.id, target: bot.id, damage: requested, kind: 'shot',
          actionNonce: shot.nonce, nonce: randomNonce(),
        }, { ...hit, hitZone: hit.zone });
        showHitmarker(hit.zone === 'head');
        showDamageNumber(Math.min(100, poweredDamage), hit.zone);
      } else {
        const dealt = applyBotDamage(bot, Math.min(400, poweredDamage), hit.zone, undefined, player.id, hit);
        showDamageNumber(dealt, hit.zone);
      }
    }
    else {
      const remote = remotes.get(target);
      if (remote && areCombatantsHostile(player.id, player.team, remote.snapshot.id, remote.snapshot.team)) {
        const remoteOperator = remote.root.userData.operator as THREE.Group | undefined;
        if (remoteOperator) reactOperator(remoteOperator, hit.zone);
        const nonce = randomNonce();
        const dealt = Math.min(100, hit.damage);
        const powered = Math.min(100, poweredDamage);
        const targetAdjusted = Math.min(remote.snapshot.hp, applyDhvIncomingDamage(powered, remote.snapshot.hp, memberDhv(target)));
        sendAuthoritativeHit({
          type: 'hit', by: player.id, target, damage: dealt, kind: 'shot',
          actionNonce: shot.nonce, nonce,
        }, { ...hit, hitZone: hit.zone });
        showHitmarker(hit.zone === 'head');
        showDamageNumber(targetAdjusted, hit.zone);
        audio.hit(hit.zone === 'head');
      }
    }
  }
}

type ShotCastResult = {
  distance: number;
  damageMultiplier: number;
  playerId?: string;
  targetId?: string;
  windowId?: string;
  hitZone?: HitZone;
  impactPoint?: THREE.Vector3;
  impactNormal?: THREE.Vector3;
  impactSurface?: ImpactSurface;
  ballisticTrace?: BallisticTrace;
};

function castShot(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  weapon: WeaponId = player.weapon,
  allowPenetration = true,
): ShotCastResult {
  const ray = new THREE.Raycaster(origin, direction, 0.1, 110);
  ray.camera = camera;
  const remoteObjects = [...remotes.values()].filter((remote) => remote.root.visible).map((remote) => remote.root);
  const botObjects = [...bots.values()].filter((bot) => bot.alive && bot.root.visible).map((bot) => bot.root);
  const activeTargets = arena.targets.filter((target) => target.active).map((target) => target.root);
  let first: THREE.Intersection<THREE.Object3D> | undefined;
  let ballisticTrace: BallisticTrace | undefined;
  if (allowPenetration) {
    first = ray.intersectObjects([...remoteObjects, ...botObjects, ...activeTargets], true)[0];
    const requestedDistance = first?.distance ?? 90;
    ballisticTrace = traceWeaponPath(origin, direction, requestedDistance, weapon);
    if (!ballisticTrace.reachedDistance) {
      const stoppedImpact = ballisticTrace.impacts.at(-1);
      const impactPoint = origin.clone().addScaledVector(direction, ballisticTrace.travelDistance);
      return {
        distance: ballisticTrace.travelDistance,
        damageMultiplier: 0,
        impactPoint,
        impactNormal: stoppedImpact
          ? new THREE.Vector3(stoppedImpact.entryNormal.x, stoppedImpact.entryNormal.y, stoppedImpact.entryNormal.z)
          : direction.clone().multiplyScalar(-1),
        impactSurface: ballisticTrace.stoppedBy ? ballisticImpactSurface(ballisticTrace.stoppedBy.material) : 'concrete',
        ballisticTrace,
      };
    }
    if (!first) return { distance: 90, damageMultiplier: 1, ballisticTrace };
  } else {
    const brokenWindowIds = new Set(arena.breakableWindows.filter((pane) => pane.broken).map((pane) => pane.id));
    const activeWorldMeshes = arena.raycastMeshes.filter((object) => {
      const windowId = object.userData.breakableWindowId;
      return typeof windowId !== 'string' || !brokenWindowIds.has(windowId);
    });
    first = ray.intersectObjects([...activeWorldMeshes, ...remoteObjects, ...botObjects, ...activeTargets], true)[0];
    if (!first) return { distance: 90, damageMultiplier: 1 };
  }
  let node: THREE.Object3D | null = first.object;
  let playerId: string | undefined;
  let targetId: string | undefined;
  let windowId: string | undefined;
  let hitZone: HitZone | undefined;
  let surfaceHint: unknown;
  const names: string[] = [];
  while (node) {
    playerId ??= node.userData.playerId as string | undefined;
    targetId ??= node.userData.targetId as string | undefined;
    windowId ??= node.userData.breakableWindowId as string | undefined;
    hitZone ??= node.userData.hitZone as HitZone | undefined;
    surfaceHint ??= node.userData.impactSurface;
    if (node.name) names.push(node.name);
    node = node.parent;
  }
  const targetRoot = first.object.userData.targetRoot as THREE.Group | undefined;
  targetId ??= targetRoot?.userData.targetId as string | undefined;
  const objectMaterial = first.object instanceof THREE.Mesh
    ? (Array.isArray(first.object.material) ? first.object.material[0] : first.object.material)
    : undefined;
  const metalness = objectMaterial instanceof THREE.MeshStandardMaterial ? objectMaterial.metalness : undefined;
  const impactNormal = first.face?.normal.clone().transformDirection(first.object.matrixWorld)
    ?? direction.clone().multiplyScalar(-1);
  return {
    distance: Math.min(first.distance, 110),
    damageMultiplier: ballisticTrace?.damageMultiplier ?? 1,
    playerId,
    targetId,
    windowId,
    hitZone,
    impactPoint: first.point.clone(),
    impactNormal,
    impactSurface: classifyImpactSurface({ hint: surfaceHint, name: names.join(' '), metalness }),
    ballisticTrace,
  };
}

function selectSafeBotSpawn(team: Team): THREE.Vector3 {
  const otherPlayers = [
    ...(player.alive ? [player.position.clone()] : []),
    ...[...remotes.values()].filter((remote) => remote.snapshot.hp > 0).map((remote) => remote.target.clone()),
    ...[...bots.values()].filter((bot) => bot.alive).map((bot) => bot.position.clone()),
  ];
  const threats = [
    ...(player.alive && player.team !== team ? [player.position.clone()] : []),
    ...[...remotes.values()]
      .filter((remote) => remote.snapshot.team !== team && remote.snapshot.hp > 0)
      .map((remote) => new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z)),
  ];
  const validForSide = (side: Team) => arena.spawns[side]
    .map((candidate, localIndex) => ({ candidate, index: side * 100 + localIndex }))
    .filter(({ candidate }) => {
      const bodyPoint = { x: candidate.x, y: 0, z: candidate.z };
      return Number.isFinite(candidate.x) && Number.isFinite(candidate.z)
        && pointInsideBounds(bodyPoint, arena.bounds, 0.44)
        && !isBlocked(bodyPoint, arena.colliders, 0.44);
    });
  const home = validForSide(team);
  const opposite = validForSide(team === 0 ? 1 : 0);
  if (home.length === 0) throw new Error(`No valid authored spawn for team ${team}`);
  const pressure = (options: ReturnType<typeof validForSide>) => {
    const scores = options.map(({ candidate }) => ({
      visibleThreats: threats.filter((threat) => !arena.colliders.some((box) => segmentIntersectsBox(candidate, threat, box))).length,
      distance: threats.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...threats.map((threat) => threat.distanceToSquared(candidate))),
    }));
    const minimumVisibleThreats = Math.min(...scores.map((score) => score.visibleThreats));
    return {
      minimumVisibleThreats,
      safestNearestThreatDistanceSq: Math.max(...scores.filter((score) => score.visibleThreats === minimumVisibleThreats).map((score) => score.distance)),
    };
  };
  const instantaneousFlip = threats.length > 0 && opposite.length > 0 && shouldFlipSpawnSide(pressure(home), pressure(opposite));
  const flipDecision = advanceSpawnFlipHysteresis(spawnFlipHysteresis[team], instantaneousFlip, performance.now());
  spawnFlipHysteresis[team] = flipDecision.state;
  const valid = flipDecision.flip ? opposite : home;
  const unoccupied = valid.filter(({ candidate }) => !otherPlayers.some((position) => position.distanceToSquared(candidate) < 20));
  const selectable = unoccupied.length > 0 ? unoccupied : valid;
  const selection = scoreSpawnCandidates({
    arenaId: selectedArena.id,
    mode: activeSpawnMode(),
    population: otherPlayers.length + 1,
    candidates: selectable.map(({ candidate, index }) => ({ index, point: candidate })),
    threats,
    occupants: otherPlayers,
    recentDeaths: recentSpawnDeathPoints(),
    colliders: arena.colliders,
    previousIndex: lastBotSpawnIndices.get(team) ?? -1,
  });
  const selectedIndex = selection.index;
  lastBotSpawnIndices.set(team, selectedIndex);
  lastBotSpawnAudit.set(team, { selectedIndex, score: selection.score, reason: selection.reason });
  return valid.find(({ index }) => index === selectedIndex)!.candidate;
}

let botHazeTexture: THREE.CanvasTexture | null = null;

function neonBotHazeTexture(): THREE.CanvasTexture {
  if (botHazeTexture) return botHazeTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable for neon bot haze');
  const gradient = context.createRadialGradient(64, 64, 5, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,214,255,0.9)');
  gradient.addColorStop(0.2, 'rgba(227,112,255,0.72)');
  gradient.addColorStop(0.5, 'rgba(171,43,255,0.32)');
  gradient.addColorStop(1, 'rgba(104,0,191,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  botHazeTexture = new THREE.CanvasTexture(canvas);
  botHazeTexture.name = 'neon-purple-bot-haze-texture';
  botHazeTexture.colorSpace = THREE.SRGBColorSpace;
  botHazeTexture.needsUpdate = true;
  return botHazeTexture;
}

function addNeonBotHaze(root: THREE.Group, index: number): void {
  const haze = new THREE.Sprite(new THREE.SpriteMaterial({
    map: neonBotHazeTexture(),
    color: 0xec8cff,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  haze.name = 'neon-purple-bot-haze';
  haze.position.y = 1.24;
  haze.scale.set(2.35, 3.15, 1);
  haze.userData.presentationOnly = true;
  haze.userData.blocksShots = false;
  haze.userData.phase = index * Math.PI;
  haze.raycast = () => undefined;
  root.userData.neonBotHaze = true;
  root.add(haze);
}

const SOLO_BOT_NAMES = ['RIVET', 'MICA', 'NOVA', 'HEX', 'KITE', 'ROOK', 'LUX'] as const;

function spawnBot(index: number, hosted = false): void {
  const botTeam: Team = player.team === 0 ? 1 : 0;
  const name = SOLO_BOT_NAMES[index] ?? `RIVAL ${index + 1}`;
  const id = hosted ? `host-bot-${index}` : `bot-${index}`;
  const weapon = botWeaponAssignments[index] ?? assignBotWeapons(1, gameplayRandom)[0];
  const spawnedAt = performance.now();
  // Every reinforcement uses the same source-rigged humanoid and approved
  // neon-purple treatment. Only the lead owns the dynamic shadow proxy.
  const root = buildOperator(botTeam, 'bot-operator', true, weapon, true, 'neon-purple');
  addNeonBotHaze(root, index);
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) node.castShadow = false;
  });
  if (!reducedRenderMode && index === 0) {
    const shadowProxy = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.48, 1.1, 4, 8),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    );
    shadowProxy.name = 'lead-bot-shadow-proxy';
    shadowProxy.position.y = 1.05;
    shadowProxy.castShadow = true;
    shadowProxy.userData.presentationOnly = true;
    shadowProxy.userData.blocksShots = false;
    shadowProxy.raycast = () => undefined;
    root.add(shadowProxy);
  }
  root.userData.playerId = id;
  root.traverse((node) => {
    node.userData.playerId = id;
    node.userData.targetRoot = root;
  });
  const spawn = selectSafeBotSpawn(botTeam);
  const position = new THREE.Vector3(spawn.x, spawn.y - 1.7, spawn.z);
  root.position.copy(position);
  scene.add(root);
  bots.set(id, {
    id, name, team: botTeam, root, position, velocity: new THREE.Vector3(), hp: 100, alive: true,
    kills: 0, deaths: 0, lastShotAt: 0, lastSightAt: 0, hasLineOfSight: false,
    sightStartedAt: 0, burstShots: 0, nextDecisionAt: 0, strafeSign: index % 2 === 0 ? 1 : -1,
    invulnerableUntil: spawnedAt + 1_000, respawnAt: 0, deathVisibleUntil: 0, waypoint: index, blockedSince: 0,
    weapon, nextGrenadeAt: spawnedAt + 5_000 + gameplayRandom() * 3_000, grenadeActive: false,
    positionHistory: [{
      at: currentHostTimeMs(), x: position.x, y: position.y + 1.7, z: position.z,
      yaw: root.rotation.y, stance: 'stand', continuity: 1,
    }],
    continuity: 1,
  });
}

function prewarmDormantBotPresentations(): void {
  if (dormantBots.size === 0) {
    dormantBotsPrewarmed = true;
    return;
  }
  for (const bot of dormantBots.values()) {
    bot.root.visible = true;
    bot.root.scale.setScalar(0.0001);
  }
  try {
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    dormantBotsPrewarmed = true;
  } finally {
    for (const bot of dormantBots.values()) {
      bot.root.visible = false;
      bot.root.scale.setScalar(1);
    }
  }
}

function activateDormantBot(index: number): boolean {
  const id = `bot-${index}`;
  const bot = dormantBots.get(id);
  if (!bot) return false;
  dormantBots.delete(id);
  const now = performance.now();
  const spawn = selectSafeBotSpawn(bot.team);
  bot.position.set(spawn.x, spawn.y - 1.7, spawn.z);
  bot.root.position.copy(bot.position);
  bot.root.scale.setScalar(1);
  bot.root.visible = true;
  bot.hp = 100;
  bot.alive = true;
  bot.invulnerableUntil = now + 1_000;
  bot.respawnAt = 0;
  bot.deathVisibleUntil = 0;
  bot.lastShotAt = 0;
  bot.lastSightAt = 0;
  bot.hasLineOfSight = false;
  bot.sightStartedAt = 0;
  bot.burstShots = 0;
  bot.nextDecisionAt = 0;
  bot.blockedSince = 0;
  resetOperator(bot.root);
  bots.set(id, bot);
  return true;
}

function spawnBots(hostedCount?: HostedBotCount): void {
  clearBots();
  const activeCount = hostedCount ?? selectedArena.soloBotCount;
  const maximumCount = hostedCount === undefined ? selectedArena.maximumSoloBots : activeCount;
  botWeaponAssignments = assignBotWeapons(maximumCount, gameplayRandom);
  botGrenadeThrows = 0;
  botGrenadeMaxActive = 0;
  lastBotGrenadeDamage = 0;
  soloBotDeaths = 0;
  dormantBotsPrewarmed = false;
  for (let index = 0; index < activeCount; index += 1) spawnBot(index, hostedCount !== undefined);
  if (hostedCount !== undefined) {
    for (const bot of bots.values()) authoritativeScores.set(bot.id, emptyPlayerScore(bot.id));
    if (activeCount > 0) addFeed(String(activeCount) + ' HOST-AUTHORITATIVE BOTS DEPLOYED', 'coral');
    broadcastHostedBotState();
    return;
  }
  const activeSpawnHistory = new Map(lastBotSpawnIndices);
  for (let index = selectedArena.soloBotCount; index < selectedArena.maximumSoloBots; index += 1) {
    spawnBot(index);
    const bot = bots.get(`bot-${index}`)!;
    bots.delete(bot.id);
    bot.alive = false;
    bot.root.visible = false;
    dormantBots.set(bot.id, bot);
  }
  lastBotSpawnIndices.clear();
  for (const [team, index] of activeSpawnHistory) lastBotSpawnIndices.set(team, index);
  prewarmDormantBotPresentations();
  if (selectedArena.soloBotCount > 0) {
    addFeed(`${selectedArena.soloBotCount} low-damage hostile operator${selectedArena.soloBotCount === 1 ? '' : 's'} deployed`, 'coral');
  }
}

function spawnEarnedBotReinforcement(): void {
  if (gameMode !== 'solo') return;
  const target = activeSoloBotTarget(selectedArena, soloBotDeaths);
  if (bots.size >= target) return;
  const index = bots.size;
  if (!activateDormantBot(index)) spawnBot(index);
  addFeed(`HOSTILE REINFORCEMENT · ${bots.size} RIVALS NOW ACTIVE`, 'coral');
}

function clearBots(): void {
  for (const bot of bots.values()) scene.remove(bot.root);
  for (const bot of dormantBots.values()) scene.remove(bot.root);
  bots.clear();
  dormantBots.clear();
  dormantBotsPrewarmed = false;
  soloBotDeaths = 0;
  lastBotSpawnIndices.clear();
  botWeaponAssignments = [];
}

function hostedBotSnapshot(bot: BotPlayer, seq: number): HostedBotSnapshot {
  return {
    id: bot.id,
    name: bot.name,
    team: bot.team,
    weapon: bot.weapon,
    x: bot.position.x,
    y: bot.position.y,
    z: bot.position.z,
    yaw: bot.root.rotation.y,
    hp: bot.hp,
    kills: bot.kills,
    deaths: bot.deaths,
    alive: bot.alive,
    seq,
  };
}

function broadcastHostedBotState(): void {
  if (network.role !== 'host') return;
  hostedBotStateSeq += 1;
  const message: BotStateMessage = {
    type: 'bot-state',
    by: player.id,
    seq: hostedBotStateSeq,
    bots: [...bots.values()].filter((bot) => bot.id.startsWith('host-bot-')).map((bot) => hostedBotSnapshot(bot, hostedBotStateSeq)),
    nonce: randomNonce(),
  };
  network.send(message);
}

function acceptHostedBotState(message: BotStateMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId || message.seq <= lastHostedBotStateSeq) return;
  if (message.bots.length !== privateMatchConfig.hostedBotCount) return;
  lastHostedBotStateSeq = message.seq;
  const incomingIds = new Set(message.bots.map((snapshot) => snapshot.id));
  for (const snapshot of message.bots) {
    let bot = bots.get(snapshot.id);
    if (!bot) {
      const index = Number(snapshot.id.slice('host-bot-'.length));
      if (!Number.isSafeInteger(index) || index < 0 || index > 3) continue;
      if (botWeaponAssignments.length <= index) botWeaponAssignments = assignBotWeapons(privateMatchConfig.hostedBotCount, gameplayRandom);
      spawnBot(index, true);
      bot = bots.get(snapshot.id);
    }
    if (!bot || snapshot.seq <= Number(bot.root.userData.networkSeq ?? -1)) continue;
    bot.root.userData.networkSeq = snapshot.seq;
    bot.name = snapshot.name;
    bot.team = snapshot.team;
    bot.weapon = snapshot.weapon;
    bot.position.set(snapshot.x, snapshot.y, snapshot.z);
    bot.root.position.copy(bot.position);
    bot.root.rotation.y = snapshot.yaw;
    bot.hp = snapshot.hp;
    bot.kills = snapshot.kills;
    bot.deaths = snapshot.deaths;
    bot.alive = snapshot.alive;
    bot.root.visible = snapshot.alive;
    setOperatorWeapon(bot.root, snapshot.weapon, flattenOperatorMaterials);
  }
  for (const [id, bot] of bots) {
    if (!id.startsWith('host-bot-') || incomingIds.has(id)) continue;
    scene.remove(bot.root);
    bots.delete(id);
  }
}
function botHasLineOfSight(bot: BotPlayer, targetPosition = player.position): boolean {
  const origin = { x: bot.position.x, y: bot.position.y + 1.42, z: bot.position.z };
  const target = { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z };
  return !arena.colliders.some((box) => segmentIntersectsBox(origin, target, box));
}

function activeBotGrenadeCount(): number {
  return grenades.reduce((count, grenade) => count + (grenade.ownerKind === 'bot' ? 1 : 0), 0);
}

function releaseBotGrenadeOwner(entity: GrenadeEntity): void {
  if (entity.ownerKind !== 'bot') return;
  const owner = bots.get(entity.ownerId) ?? dormantBots.get(entity.ownerId);
  if (owner) owner.grenadeActive = false;
}

function throwBotGrenade(
  bot: BotPlayer,
  now: number,
  fuseMs = 2_300,
  target = player.position,
  targetStance: Stance = player.stance,
): boolean {
  if (!bot.alive || bot.grenadeActive || activeBotGrenadeCount() > 0) return false;
  const origin = bot.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const targetGroundY = Math.max(0.18, target.y - stanceEyeHeight(targetStance) + 0.18);
  const targetGround = new THREE.Vector3(target.x, targetGroundY, target.z);
  const horizontalDistance = Math.hypot(targetGround.x - origin.x, targetGround.z - origin.z);
  const flightTime = THREE.MathUtils.clamp(horizontalDistance / 12, 0.72, 1.35);
  const velocity = targetGround.clone().sub(origin).divideScalar(flightTime);
  velocity.y += 9 * flightTime;
  const mesh = createGrenadePresentation();
  mesh.position.copy(origin);
  mesh.castShadow = true;
  scene.add(mesh);
  grenades.push({
    mesh,
    velocity,
    angularVelocity: new THREE.Vector3(7.6, 5.8, 9.4),
    explodeAt: now + Math.max(120, fuseMs),
    lastBounceAt: 0,
    actionNonce: randomNonce(),
    ownerKind: 'bot',
    ownerId: bot.id,
  });
  bot.grenadeActive = true;
  bot.nextGrenadeAt = now + BOT_GRENADE_COOLDOWN_MS;
  botGrenadeThrows += 1;
  botGrenadeMaxActive = Math.max(botGrenadeMaxActive, activeBotGrenadeCount());
  addFeed(`${bot.name} THREW FRAG`, 'coral');
  return true;
}

function selectBotTacticalWaypoint(
  bot: BotPlayer,
  targetPosition = player.position,
  targetAlive = player.alive,
): number {
  const target = { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z };
  return chooseTacticalWaypoint(arena.patrolPoints.map((point, index) => {
    const eye = { x: point.x, y: 1.42, z: point.z };
    return {
      index,
      distanceFromBot: point.distanceTo(bot.position),
      distanceFromPlayer: point.distanceTo(targetPosition),
      seesPlayer: targetAlive && !arena.colliders.some((box) => segmentIntersectsBox(eye, target, box)),
    };
  }), bot.waypoint, bot.deaths + bot.kills);
}

function applyBotDamage(
  bot: BotPlayer,
  damage: number,
  zone: HitZone,
  cause: KillCause = { kind: 'gun', weapon: player.weapon },
  attackerId = player.id,
  evidence?: Readonly<{ wallbang?: boolean; penetrationMultiplier?: number; distanceMeters?: number }>,
): number {
  const now = performance.now();
  if (!bot.alive || now < bot.invulnerableUntil) return 0;
  reactOperator(bot.root, zone);
  const healthBefore = bot.hp;
  const dealt = Math.min(bot.hp, Math.max(0, damage));
  recordDamageEvent({
    actorId: attackerId,
    targetId: bot.id,
    weaponOrEffect: cause.kind === 'gun' ? cause.weapon : cause.kind,
    healthBefore,
    healthAfter: Math.max(0, healthBefore - dealt),
    damageRequested: damage,
    damageApplied: dealt,
    hitZone: zone,
    critical: zone === 'head',
    wallbang: evidence?.wallbang,
    penetrationMultiplier: evidence?.penetrationMultiplier,
    distanceMeters: evidence?.distanceMeters,
    reason: bot.id.startsWith('host-bot-') ? 'hosted-bot-authority' : 'solo-bot-authority',
  });
  if (attackerId === player.id) roundDamageDealt += dealt;
  if (network.role === 'host') recordAuthoritativeDamage(attackerId, bot.id, dealt);
  else if (attackerId === player.id) addFeed('DAMAGE DONE +' + Math.round(dealt), 'gold', { damageDealt: dealt });
  bot.hp = Math.max(0, bot.hp - damage);
  if (attackerId === player.id) {
    showHitmarker(zone === 'head');
    audio.hit(zone === 'head');
  }
  if (bot.hp > 0) {
    if (network.role === 'host') broadcastHostedBotState();
    return dealt;
  }
  const eliminationStarted = performance.now();
  bot.alive = false;
  bot.deaths += 1;
  soloBotDeaths += 1;
  const death: DeathMessage = { type: 'death', killer: attackerId, victim: bot.id, cause, nonce: randomNonce() };
  if (network.role === 'host') {
    processedNonces.add(death.nonce);
    network.send(death);
    processDeath(death);
    broadcastHostedBotState();
  } else {
    spawnDeathDrop(death, now);
  }
  const afterDeathDrop = performance.now();
  bot.respawnAt = now + 2_200;
  bot.deathVisibleUntil = now + 1_050;
  deathOperator(bot.root);
  const afterDeathPose = performance.now();
  if (gameMode === 'solo' && attackerId === player.id) {
    player.kills += 1;
    if (isKillstreakEligible(cause)) awardSupportElimination();
    audio.kill();
    addFeed(`${player.name} eliminated ${bot.name}${zone === 'head' ? ' · HEADSHOT' : ''} · ${Math.round(damage)} DMG`, 'gold');
  }
  const afterRewardAndFeed = performance.now();
  spawnEarnedBotReinforcement();
  const afterReinforcement = performance.now();
  lastBotEliminationProfile = {
    deathDropMs: afterDeathDrop - eliminationStarted,
    deathPoseMs: afterDeathPose - afterDeathDrop,
    rewardAndFeedMs: afterRewardAndFeed - afterDeathPose,
    reinforcementMs: afterReinforcement - afterRewardAndFeed,
    totalSyncMs: afterReinforcement - eliminationStarted,
  };
  checkMatchEnd();
  return dealt;
}

function respawnBot(bot: BotPlayer, now: number): void {
  const state = respawnBotState(now);
  const spawn = selectSafeBotSpawn(bot.team);
  bot.position.set(spawn.x, spawn.y - 1.7, spawn.z);
  bot.root.position.copy(bot.position);
  bot.continuity += 1;
  bot.positionHistory.length = 0;
  bot.hp = state.health;
  bot.alive = state.alive;
  bot.invulnerableUntil = state.invulnerableUntil;
  bot.lastShotAt = state.lastShotAt;
  bot.lastSightAt = 0;
  bot.hasLineOfSight = false;
  bot.sightStartedAt = 0;
  bot.burstShots = 0;
  bot.nextDecisionAt = 0;
  bot.blockedSince = 0;
  bot.nextGrenadeAt = Math.max(bot.nextGrenadeAt, now + 3_000);
  bot.deathVisibleUntil = 0;
  resetOperator(bot.root);
  bot.root.visible = true;
}

function houseContainsXZ(house: ArenaMap['houses'][number], point: THREE.Vector3, margin = 1): boolean {
  return Math.abs(point.x - house.origin.x) <= house.dimensions.width / 2 + margin
    && Math.abs(point.z - house.origin.z) <= house.dimensions.depth / 2 + margin;
}

function botVerticalRouteTarget(bot: BotPlayer, targetPosition = player.position): THREE.Vector3 | null {
  const authored = authoredVerticalRouteTarget(
    arena.root.userData.verticalNavigation as ArenaVerticalNavigation | undefined,
    bot.position,
    targetPosition,
  );
  if (authored) return new THREE.Vector3(authored.x, authored.y, authored.z);
  const playerUpper = targetPosition.y > 3;
  const botOnGround = bot.position.y <= 0.1;
  const botOnUpper = bot.position.y >= 3.2;
  if (playerUpper && botOnUpper || !playerUpper && botOnGround) return null;
  const house = arena.houses.find((candidate) => houseContainsXZ(candidate, playerUpper ? targetPosition : bot.position, 2));
  if (!house) return null;
  const foot = house.anchors.find((anchor) => anchor.id === 'indoor-ramp-foot');
  const top = house.anchors.find((anchor) => anchor.id === 'indoor-ramp-top');
  if (!foot || !top) return null;
  const footPoint = new THREE.Vector3(foot.position[0], 0, foot.position[2]);
  const topPoint = new THREE.Vector3(top.position[0], 3.48, top.position[2]);
  if (playerUpper) return botOnGround && bot.position.distanceToSquared(footPoint) > 1 ? footPoint : topPoint;
  return botOnUpper && bot.position.distanceToSquared(topPoint) > 1 ? topPoint : footPoint;
}

function botElevationAt(position: THREE.Vector3, previousY: number): number {
  const authoredNavigation = arena.root.userData.verticalNavigation as ArenaVerticalNavigation | undefined;
  if (authoredNavigation) return authoredElevationAt(authoredNavigation, position, previousY);
  for (const house of arena.houses) {
    for (const prefix of ['indoor-ramp', 'ramp'] as const) {
      const foot = house.anchors.find((anchor) => anchor.id === `${prefix}-foot`);
      const top = house.anchors.find((anchor) => anchor.id === `${prefix}-top`);
      if (!foot || !top) continue;
      const fx = foot.position[0];
      const fz = foot.position[2];
      const dx = top.position[0] - fx;
      const dz = top.position[2] - fz;
      const lengthSq = dx * dx + dz * dz;
      const progress = lengthSq > 0 ? ((position.x - fx) * dx + (position.z - fz) * dz) / lengthSq : 0;
      if (progress < -0.04 || progress > 1.04) continue;
      const nearestX = fx + dx * progress;
      const nearestZ = fz + dz * progress;
      const distance = Math.hypot(position.x - nearestX, position.z - nearestZ);
      if (distance <= 1.05) return THREE.MathUtils.lerp(0, 3.48, THREE.MathUtils.clamp(progress, 0, 1));
    }
    if (previousY > 1.5 && houseContainsXZ(house, position, 0)) return 3.48;
  }
  return 0;
}

function navigationCollidersFor(activeArena: ArenaMap): ArenaMap['colliders'] {
  return activeArena.colliders.filter((box) => {
    const minY = box.minY ?? 0;
    const maxY = box.maxY ?? 8;
    const thinSurface = maxY - minY <= 0.5;
    return !(thinSurface && (minY > 2 || Boolean(box.rotation)));
  });
}

let botNavigationColliders = navigationCollidersFor(arena);

type BotCombatTarget = Readonly<{
  id: string;
  team: Team;
  position: THREE.Vector3;
  stance: Stance;
  kind: 'local' | 'remote';
}>;

function nearestBotCombatTarget(bot: BotPlayer): BotCombatTarget | null {
  const candidates: BotCombatTarget[] = [];
  if (player.alive && areCombatantsHostile(bot.id, bot.team, player.id, player.team)) {
    candidates.push({ id: player.id, team: player.team, position: player.position.clone(), stance: player.stance, kind: 'local' });
  }
  for (const remote of remotes.values()) {
    if (remote.snapshot.hp <= 0 || !areCombatantsHostile(bot.id, bot.team, remote.snapshot.id, remote.snapshot.team)) continue;
    const stance = remote.snapshot.stance ?? 'stand';
    candidates.push({
      id: remote.snapshot.id,
      team: remote.snapshot.team,
      position: new THREE.Vector3(
        remote.snapshot.x,
        remote.snapshot.y + stanceEyeHeight(stance),
        remote.snapshot.z,
      ),
      stance,
      kind: 'remote',
    });
  }
  candidates.sort((a, b) => a.position.distanceToSquared(bot.position) - b.position.distanceToSquared(bot.position) || a.id.localeCompare(b.id));
  return candidates[0] ?? null;
}

function applyHostedBotDamageToRemote(
  bot: BotPlayer,
  target: BotCombatTarget,
  damage: number,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  now: number,
): void {
  if (network.role !== 'host' || target.kind !== 'remote') return;
  const health = remoteHealthAuthorities.get(target.id);
  const remote = remotes.get(target.id);
  if (!health || !remote) return;
  const handicappedDamage = applyDhvIncomingDamage(damage, health.hp, memberDhv(target.id));
  const result = applyAuthoritativeRemoteDamage(health, handicappedDamage, now);
  if (!result.applied) return;
  const damageApplied = Math.max(0, health.hp - result.state.hp);
  if (damageApplied <= 0) return;
  remoteHealthAuthorities.set(target.id, result.state);
  remote.snapshot = { ...remote.snapshot, hp: result.state.hp };
  remote.root.visible = result.state.alive;
  recordDamageEvent({
    actorId: bot.id,
    targetId: target.id,
    weaponOrEffect: bot.weapon,
    healthBefore: health.hp,
    healthAfter: result.state.hp,
    damageRequested: damage,
    damageApplied,
    reason: 'hosted-bot-remote-health-authority',
  });
  recordAuthoritativeDamage(bot.id, target.id, damageApplied);
  const message: BotDamageMessage = {
    type: 'bot-damage',
    by: player.id,
    botId: bot.id,
    target: target.id,
    weapon: bot.weapon,
    origin: origin.toArray(),
    direction: direction.toArray(),
    damageApplied,
    healthBefore: health.hp,
    healthAfter: result.state.hp,
    nonce: randomNonce(),
  };
  network.send(message);
  if (result.died) {
    bot.kills += 1;
    const death: DeathMessage = {
      type: 'death', killer: bot.id, victim: target.id,
      cause: { kind: 'gun', weapon: bot.weapon }, nonce: randomNonce(),
    };
    processedNonces.add(death.nonce);
    network.send(death);
    processDeath(death);
  }
  broadcastHostedBotState();
}

function acceptHostedBotDamage(message: BotDamageMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId || processedNonces.has(message.nonce)) return;
  const bot = bots.get(message.botId);
  if (!bot || bot.weapon !== message.weapon) return;
  processedNonces.add(message.nonce);
  const origin = new THREE.Vector3(...message.origin);
  const direction = new THREE.Vector3(...message.direction).normalize();
  spawnTracer(bot.root.getObjectByName('muzzle-socket')?.getWorldPosition(new THREE.Vector3()) ?? origin, origin.clone().addScaledVector(direction, 55), WEAPONS[message.weapon].color);
  audio.shot(message.weapon, true, origin.distanceTo(camera.position));
  if (message.target === player.id) {
    const canonicalDamage = Math.max(0, player.hp - message.healthAfter);
    if (canonicalDamage > 0) {
      applyDamage(canonicalDamage, message.botId, 0, false, { kind: 'gun', weapon: message.weapon }, true);
    }
    // Hosted matches use the host's remote-health ledger as the canonical value.
    // Reconcile upward as well as downward so prior client-side drift cannot persist.
    if (player.alive) player.hp = message.healthAfter;
  } else {
    const remote = remotes.get(message.target);
    if (remote) reactOperator(remote.root, 'body');
  }
  trimNonceSet();
}
function updateBots(dt: number, now: number): void {
  if ((gameMode !== 'solo' && gameMode !== 'host') || matchState.phase !== 'active') return;
  let botIndex = 0;
  for (const bot of bots.values()) {
    botIndex += 1;
    const haze = bot.root.getObjectByName('neon-purple-bot-haze');
    if (haze instanceof THREE.Sprite && haze.material instanceof THREE.SpriteMaterial) {
      const pulse = Math.sin(now * 0.0022 + Number(haze.userData.phase ?? 0));
      haze.material.opacity = 0.33 + pulse * 0.055;
      haze.scale.set(2.35 + pulse * 0.08, 3.15 + pulse * 0.12, 1);
    }
    if (!bot.alive) {
      bot.root.visible = now < bot.deathVisibleUntil;
      if (bot.root.visible) poseOperator(bot.root, 'stand', 0, now * 0.001);
      if (now >= bot.respawnAt && !matchFinished) respawnBot(bot, now);
      continue;
    }
    recordCombatantPose(bot.positionHistory, {
      at: currentHostTimeMs(), x: bot.position.x, y: bot.position.y + 1.7, z: bot.position.z,
      yaw: bot.root.rotation.y, stance: 'stand', continuity: bot.continuity,
    });
    if (botsFrozen) {
      poseOperator(bot.root, debugBotStanceOverride ?? 'stand', debugBotSpeedOverride, now * 0.001);
      continue;
    }
    // A corrupted position can never become an out-of-arena damage source.
    if (!pointInsideBounds(bot.position, arena.bounds, 0.44)) {
      const safeSpawn = selectSafeBotSpawn(bot.team);
      bot.position.set(safeSpawn.x, safeSpawn.y - 1.7, safeSpawn.z);
      bot.root.position.copy(bot.position);
      bot.hasLineOfSight = false;
      bot.sightStartedAt = 0;
      bot.burstShots = 0;
      bot.blockedSince = 0;
      bot.lastSightAt = now;
      continue;
    }

    const combatTarget = nearestBotCombatTarget(bot);
    const targetPosition = combatTarget?.position ?? player.position;
    const toPlayer = targetPosition.clone().setY(0).sub(bot.position.clone().setY(0));
    const distance = toPlayer.length();
    const sightInterval = 120 + botIndex * 19;
    if (now - bot.lastSightAt >= sightInterval) {
      bot.lastSightAt = now;
      const previousSight = bot.hasLineOfSight;
      bot.hasLineOfSight = combatTarget !== null && botHasLineOfSight(bot, targetPosition);
      if (bot.hasLineOfSight && !previousSight) bot.sightStartedAt = now;
      if (!bot.hasLineOfSight) {
        if (previousSight) bot.waypoint = selectBotTacticalWaypoint(bot, targetPosition, combatTarget !== null);
        bot.sightStartedAt = 0;
        bot.burstShots = 0;
      }
    }
    const lineOfSight = bot.hasLineOfSight;
    const madeTacticalDecision = now >= bot.nextDecisionAt;
    if (madeTacticalDecision) {
      bot.strafeSign = bot.strafeSign === 1 ? -1 : 1;
      bot.nextDecisionAt = now + 850 + botIndex * 95;
    }

    let patrolTarget = arena.patrolPoints[bot.waypoint % arena.patrolPoints.length];
    let toPatrol = patrolTarget.clone().sub(bot.position).setY(0);
    const waypointReached = toPatrol.lengthSq() < 5.2;
    if (waypointReached) {
      bot.waypoint = lineOfSight
        ? (bot.waypoint + 1 + botIndex) % arena.patrolPoints.length
        : selectBotTacticalWaypoint(bot, targetPosition, combatTarget !== null);
    }
    const intent = chooseBotIntent({
      alive: bot.alive,
      distanceToPlayer: distance,
      hasLineOfSight: lineOfSight,
      health: bot.hp,
      now,
      lastShotAt: bot.lastShotAt,
      waypointReached,
      random: bot.strafeSign === 1 ? 0.25 : 0.75,
      lineOfSightSince: bot.sightStartedAt,
      reactionDelay: BOT_REACTION_DELAY,
      burstShotsRemaining: bot.burstShots,
      fireIntervalMs: botWeaponFireInterval(bot.weapon, bot.burstShots > 0),
    });
    if (intent.changeWaypoint && !waypointReached) {
      bot.waypoint = selectBotTacticalWaypoint(bot, targetPosition, combatTarget !== null);
    }
    patrolTarget = arena.patrolPoints[bot.waypoint % arena.patrolPoints.length];
    toPatrol = patrolTarget.clone().sub(bot.position).setY(0);

    const verticalRouteTarget = botVerticalRouteTarget(bot, targetPosition);
    const pursuit = verticalRouteTarget
      ? verticalRouteTarget.clone().sub(bot.position).setY(0)
      : lineOfSight ? toPlayer : toPatrol;
    const forward = pursuit.lengthSq() > 0.01 ? pursuit.normalize() : new THREE.Vector3(0, 0, -1);
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const routeMovement = verticalRouteTarget ? 'advance' : intent.movement;
    const desiredDirection = routeMovement === 'advance' ? forward
      : routeMovement === 'retreat' ? forward.clone().multiplyScalar(-1)
        : routeMovement === 'strafe-left' ? side.clone().multiplyScalar(-1)
          : routeMovement === 'strafe-right' ? side : new THREE.Vector3();
    const speed = routeMovement.startsWith('strafe') ? 4.05 : lineOfSight ? 4.65 : 5.85;
    const desired = bot.position.clone().addScaledVector(desiredDirection, speed * dt);
    let resolved = resolveHorizontalMove(bot.position, desired, botNavigationColliders, arena.bounds, 0.44);
    const stalled = Math.hypot(resolved.x - bot.position.x, resolved.z - bot.position.z) < 0.002
      && desiredDirection.lengthSq() > 0;
    if (stalled) {
      const detour = bot.position.clone().addScaledVector(side, bot.strafeSign * speed * dt * 1.5);
      resolved = resolveHorizontalMove(bot.position, detour, botNavigationColliders, arena.bounds, 0.44);
      const detourStalled = Math.hypot(resolved.x - bot.position.x, resolved.z - bot.position.z) < 0.002;
      if (detourStalled) {
        if (bot.blockedSince === 0) bot.blockedSince = now;
        else if (now - bot.blockedSince >= 400) {
          bot.waypoint = selectBotTacticalWaypoint(bot, targetPosition, combatTarget !== null);
          bot.blockedSince = 0;
        }
      } else {
        bot.blockedSince = 0;
      }
    } else {
      bot.blockedSince = 0;
    }
    const resolvedPosition = new THREE.Vector3(resolved.x, bot.position.y, resolved.z);
    bot.position.set(resolved.x, botElevationAt(resolvedPosition, bot.position.y), resolved.z);
    bot.root.position.copy(bot.position);
    const lookTarget = lineOfSight ? targetPosition : verticalRouteTarget ?? patrolTarget;
    bot.root.rotation.y = operatorYawToward(bot.position, lookTarget);
    poseOperator(bot.root, 'stand', desiredDirection.lengthSq() > 0 ? speed : 0, now * 0.008 + botIndex, Math.min(1, dt * 12));

    const threwBotGrenade = madeTacticalDecision && shouldBotThrowGrenade({
      alive: bot.alive,
      hasLineOfSight: lineOfSight,
      reacted: bot.sightStartedAt > 0 && now - bot.sightStartedAt >= BOT_REACTION_DELAY,
      distanceToPlayer: distance,
      now,
      nextGrenadeAt: bot.nextGrenadeAt,
      botGrenadeActive: bot.grenadeActive,
      activeBotGrenades: activeBotGrenadeCount(),
      random: gameplayRandom(),
    }) && combatTarget !== null && throwBotGrenade(bot, now, 2_300, targetPosition, combatTarget.stance);

    if (!threwBotGrenade && botCanFireWhileProtected(intent.fire, now, bot.invulnerableUntil) && combatTarget !== null) {
      if (bot.burstShots <= 0) bot.burstShots = botWeaponBurstSize(bot.weapon, botIndex);
      bot.burstShots -= 1;
      bot.lastShotAt = now;
      fireOperator(bot.root);
      const origin = bot.position.clone().add(new THREE.Vector3(0, 1.42, 0));
      const direction = targetPosition.clone().sub(origin).normalize();
      const jitter = botAimJitter(distance) + bot.burstShots * 0.006;
      direction.x += (gameplayRandom() - 0.5) * jitter;
      direction.y += (gameplayRandom() - 0.5) * jitter;
      direction.z += (gameplayRandom() - 0.5) * jitter;
      direction.normalize();
      const shotLength = Math.min(distance + 2, 75);
      const targetRadius = combatTarget.stance === 'prone' ? 0.38 : combatTarget.stance === 'crouch' ? 0.48 : 0.55;
      const botWeapon = WEAPONS[bot.weapon];
      const resolution = resolveBallisticHitscanAgainstTarget(
        origin,
        direction,
        shotLength,
        targetPosition,
        targetRadius,
        botWeapon.penetration,
        activeBallisticSurfaces(),
      );
      const visibleEnd = origin.clone().addScaledVector(direction, resolution.tracerDistance);
      const botMuzzle = bot.root.getObjectByName('muzzle-socket')?.getWorldPosition(new THREE.Vector3());
      spawnTracer(botMuzzle ?? origin, visibleEnd, botWeapon.color);
      let impactAudioPlayed = false;
      for (const impact of resolution.trace.impacts) {
        const impactDistance = impact.penetrated ? impact.entryDistance : impact.exitDistance;
        const point = origin.clone().addScaledVector(direction, impactDistance);
        const surface = ballisticImpactSurface(impact.surface.material);
        spawnImpactFlash(point, surface, new THREE.Vector3(
          impact.entryNormal.x,
          impact.entryNormal.y,
          impact.entryNormal.z,
        ));
        if (!impactAudioPlayed) {
          impactAudioPlayed = true;
          audio.impact(surface, point.distanceTo(player.position));
        }
      }
      if (combatTarget.kind === 'local' && !resolution.hitTarget && resolution.trace.impacts.length === 0) {
        audio.nearMiss(nearMissStrength(player.position, origin, visibleEnd));
      }
      audio.shot(bot.weapon, true);
      if (resolution.hitTarget) {
        const damage = botScaledDamage(applyPenetrationDamage(
          computeDamage(botWeapon, distance, 'body'),
          resolution.damageMultiplier,
        ));
        if (combatTarget.kind === 'remote') {
          applyHostedBotDamageToRemote(bot, combatTarget, damage, origin, direction, now);
        } else {
          applyDamage(damage, bot.id, 1, false, { kind: 'gun', weapon: bot.weapon });
          if (!player.alive) {
            bot.kills += 1;
            checkMatchEnd();
          }
        }
      }
    }
  }
}

function melee(): void {
  const now = performance.now();
  const previousMeleeAt = player.lastMeleeAt;
  // A melee action must animate and play even when it misses. The old code
  // checked a fake distance of 2 m against a 1.75 m strike range, so it could
  // never enter the action at all.
  if (!meleeStrike(0, now, previousMeleeAt).hit || !player.alive || matchState.phase !== 'active') return;
  endSpawnProtectionOnOffense(now);
  player.lastMeleeAt = now;
  weaponView.melee();
  audio.melee();
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const meleeNonce = randomNonce();
  network.send({ type: 'melee', by: player.id, origin: origin.toArray(), direction: direction.toArray(), timing: nextCombatTiming(), nonce: meleeNonce });
  const hit = castShot(origin, direction, player.weapon, false);
  if (hit.windowId) {
    const strike = meleeStrike(hit.distance, now, previousMeleeAt);
    if (strike.hit) {
      breakHouseWindow(
        hit.windowId,
        hit.impactPoint ?? origin.clone().addScaledVector(direction, hit.distance),
        hit.impactNormal ?? direction.clone().multiplyScalar(-1),
        true,
        origin,
      );
    }
    return;
  }
  if (!hit.playerId) return;
  const strike = meleeStrike(hit.distance, now, previousMeleeAt);
  if (!strike.hit) return;
  const bot = bots.get(hit.playerId);
  if (bot) {
    if (gameMode === 'client' && bot.id.startsWith('host-bot-')) {
      sendAuthoritativeHit({
        type: 'hit', by: player.id, target: bot.id, damage: strike.damage, kind: 'melee',
        actionNonce: meleeNonce, nonce: randomNonce(),
      });
    } else applyBotDamage(bot, outgoingDamage(strike.damage, now), hit.hitZone ?? 'body', { kind: 'melee' });
  } else if (remotes.has(hit.playerId)) sendAuthoritativeHit({
    type: 'hit', by: player.id, target: hit.playerId, damage: strike.damage, kind: 'melee',
    actionNonce: meleeNonce, nonce: randomNonce(),
  });
}

function throwGrenade(): void {
  if (!rangeGrenadesAllowed(selectedArena.id)) {
    addFeed('GRENADES LOCKED ON THE GUN RANGE');
    return;
  }
  if (!player.alive || player.grenades <= 0 || matchState.phase !== 'active') return;
  endSpawnProtectionOnOffense(performance.now());
  player.grenades -= 1;
  weaponView.throwGrenade();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const origin = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, 0.7);
  const velocity = direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 5.2, 0));
  const actionNonce = randomNonce();
  network.send({
    type: 'grenade-throw', by: player.id,
    origin: origin.toArray() as [number, number, number],
    velocity: velocity.toArray() as [number, number, number],
    actionNonce,
    timing: nextCombatTiming(),
    nonce: randomNonce(),
  });
  const mesh = createGrenadePresentation();
  mesh.position.copy(origin);
  mesh.castShadow = true;
  scene.add(mesh);
  grenades.push({
    mesh,
    velocity,
    angularVelocity: new THREE.Vector3(8.4, 5.2, 10.8),
    explodeAt: performance.now() + 2_300,
    lastBounceAt: 0,
    actionNonce,
    ownerKind: 'player',
    ownerId: player.id,
  });
}

function presentRemoteGrenade(message: Extract<GameMessage, { type: 'grenade-throw' }>): void {
  const mesh = createGrenadePresentation();
  mesh.position.fromArray(message.origin);
  mesh.castShadow = true;
  scene.add(mesh);
  grenades.push({
    mesh,
    velocity: new THREE.Vector3(...message.velocity),
    angularVelocity: new THREE.Vector3(8.4, 5.2, 10.8),
    explodeAt: performance.now() + 2_300,
    lastBounceAt: 0,
    actionNonce: message.actionNonce,
    ownerKind: 'remote',
    ownerId: message.by,
  });
}

function spawnGrenadeExplosionVisual(point: THREE.Vector3, now: number): void {
  grenadeExplosionPresentation.emit(point, now);
  grenadeExplosions += 1;
  lastGrenadeExplosionFrameAt = now;
}

function updateGrenadeExplosionVisuals(now: number): void {
  grenadeExplosionPresentation.update(now);
}

function clearGrenadeExplosionVisuals(): void {
  grenadeExplosionPresentation.clear();
}

function breakWindowsInGrenadeBlast(point: THREE.Vector3, actionNonce: number, replicate: boolean): number {
  let broken = 0;
  for (const pane of arena.breakableWindows) {
    if (pane.broken) continue;
    const centre = pane.mesh.getWorldPosition(new THREE.Vector3());
    if (centre.distanceTo(point) > GRENADE_RADIUS) continue;
    if (windowBreakPathBlocked(point, centre, arena.colliders)) continue;
    const normal = centre.clone().sub(point);
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    else normal.normalize().multiplyScalar(-1);
    if (breakHouseWindow(pane.id, centre, normal, replicate, point, 'explosive', actionNonce)) broken += 1;
  }
  return broken;
}

function explodeGrenade(entity: GrenadeEntity): void {
  const started = performance.now();
  const point = entity.mesh.position.clone();
  if (entity.mesh.userData.fallback === true) retireSupportRoot(entity.mesh);
  else scene.remove(entity.mesh);
  releaseBotGrenadeOwner(entity);
  const afterPresentationDetach = performance.now();
  if (entity.ownerKind === 'bot') audio.explosion(afterPresentationDetach);
  else audio.sanctifiedFragExplosion();
  const afterAudio = performance.now();
  spawnGrenadeExplosionVisual(point, afterAudio);
  if (entity.ownerKind !== 'remote') breakWindowsInGrenadeBlast(point, entity.actionNonce, entity.ownerKind === 'player');
  const afterVisual = performance.now();
  // Remote grenades are presentation-only. Authoritative hit/window events are the sole mutation path.
  if (entity.ownerKind === 'remote') return;
  if (entity.ownerKind === 'bot') {
    const blocked = arena.colliders.some((box) => segmentIntersectsBox(point, player.position, box));
    const damage = blocked ? 0 : botScaledDamage(grenadeDamage(player.position.distanceTo(point)));
    lastBotGrenadeDamage = damage;
    if (damage > 0 && player.alive) {
      applyDamage(damage, entity.ownerId, 0, false, { kind: 'grenade' });
      const owner = bots.get(entity.ownerId);
      if (owner && !player.alive) {
        owner.kills += 1;
        checkMatchEnd();
      }
    }
    const finished = performance.now();
    lastGrenadeExplosionProfile = {
      presentationDetachMs: afterPresentationDetach - started,
      audioMs: afterAudio - afterPresentationDetach,
      visualMs: afterVisual - afterAudio,
      targetDamageMs: finished - afterVisual,
      selfDamageMs: 0,
      totalSyncMs: finished - started,
    };
    return;
  }
  for (const bot of bots.values()) {
    const target = bot.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const blocked = arena.colliders.some((box) => segmentIntersectsBox(point, target, box));
    const damage = blocked ? 0 : outgoingDamage(grenadeDamage(bot.position.distanceTo(point)), afterAudio);
    if (damage > 0) applyBotDamage(bot, damage, 'body', { kind: 'grenade' });
  }
  const blastNonce = entity.actionNonce;
  for (const remote of remotes.values()) {
    const target = remote.target.clone().add(new THREE.Vector3(0, 1.1, 0));
    if (arena.colliders.some((box) => segmentIntersectsBox(point, target, box))) continue;
    const baseDamage = grenadeDamage(target.distanceTo(point));
    if (baseDamage > 0) sendAuthoritativeHit({
      type: 'hit', by: player.id, target: remote.snapshot.id, damage: Math.min(100, baseDamage), kind: 'explosive',
      explosiveSource: 'grenade', origin: point.toArray(), actionNonce: blastNonce, nonce: randomNonce(),
    });
  }
  const afterTargets = performance.now();
  const selfBlocked = arena.colliders.some((box) => segmentIntersectsBox(point, player.position, box));
  const selfDamage = selfBlocked ? 0 : grenadeDamage(player.position.distanceTo(point)) * 0.35;
  if (selfDamage > 0) applyDamage(selfDamage, player.id, 1, false, { kind: 'grenade' });
  const finished = performance.now();
  lastGrenadeExplosionProfile = {
    presentationDetachMs: afterPresentationDetach - started,
    audioMs: afterAudio - afterPresentationDetach,
    visualMs: afterVisual - afterAudio,
    targetDamageMs: afterTargets - afterVisual,
    selfDamageMs: finished - afterTargets,
    totalSyncMs: finished - started,
  };
}

function updateGrenades(dt: number, now: number): void {
  for (let index = grenades.length - 1; index >= 0; index -= 1) {
    const grenade = grenades[index];
    grenade.velocity.y -= 18 * dt;
    grenade.mesh.rotation.x += grenade.angularVelocity.x * dt;
    grenade.mesh.rotation.y += grenade.angularVelocity.y * dt;
    grenade.mesh.rotation.z += grenade.angularVelocity.z * dt;
    const start = grenade.mesh.position.clone();
    const delta = grenade.velocity.clone().multiplyScalar(dt);
    const collision = sweepSphereAgainstBoxes(start, delta, arena.colliders);
    if (collision) {
      const collisionNormal = new THREE.Vector3(collision.normal.x, collision.normal.y, collision.normal.z);
      grenade.mesh.position.copy(start).addScaledVector(delta, collision.time).addScaledVector(collisionNormal, 0.025);
      const incoming = grenade.velocity.dot(collisionNormal);
      grenade.velocity.addScaledVector(collisionNormal, -(1.38 * incoming));
      grenade.velocity.multiplyScalar(0.76);
      if (Math.abs(incoming) > 1.8 && now - grenade.lastBounceAt > 90) {
        grenade.lastBounceAt = now;
        audio.grenadeBounce(Math.abs(incoming));
      }
    } else {
      grenade.mesh.position.add(delta);
    }
    if (!pointInsideBounds(grenade.mesh.position, arena.bounds, 0.16)) {
      const impact = clampPointToBounds(grenade.mesh.position, arena.bounds, 0.16);
      grenade.mesh.position.set(impact.x, impact.y, impact.z);
      spawnImpactFlash(grenade.mesh.position.clone());
      audio.coverImpact(grenade.mesh.position.distanceTo(player.position));
      disposeGrenadePresentation(grenade.mesh);
      releaseBotGrenadeOwner(grenade);
      grenades.splice(index, 1);
      continue;
    }
    if (grenade.mesh.position.y < 0.18) {
      const impactSpeed = Math.abs(grenade.velocity.y);
      if (impactSpeed > 1.8 && now - grenade.lastBounceAt > 90) {
        grenade.lastBounceAt = now;
        audio.grenadeBounce(impactSpeed);
      }
      grenade.mesh.position.y = 0.18;
      grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.42;
      grenade.velocity.x *= 0.72;
      grenade.velocity.z *= 0.72;
    }
    if (now >= grenade.explodeAt) {
      grenades.splice(index, 1);
      explodeGrenade(grenade);
    }
  }
}

function hitPracticeTarget(
  id: string,
  damage: number,
  zone: HitZone = 'body',
  evidence?: Readonly<{ wallbang?: boolean; penetrationMultiplier?: number; distanceMeters?: number }>,
): void {
  const target = arena.targets.find((entry) => entry.id === id);
  if (!target || !target.active) return;
  if (target.alwaysCritical) zone = 'head';
  const admittedDamage = Math.max(0, Number.isFinite(damage) ? damage : 0);
  if (admittedDamage <= 0) return;
  const healthBefore = target.health;
  target.health = Math.max(0, target.health - admittedDamage);
  const appliedDamage = healthBefore - target.health;
  recordDamageEvent({
    actorId: player.id,
    targetId: target.id,
    weaponOrEffect: player.weapon,
    healthBefore,
    healthAfter: target.health,
    damageRequested: admittedDamage,
    damageApplied: appliedDamage,
    hitZone: zone,
    critical: zone === 'head',
    wallbang: evidence?.wallbang,
    penetrationMultiplier: evidence?.penetrationMultiplier,
    distanceMeters: evidence?.distanceMeters,
    reason: 'gun-range-practice-target',
  });
  targetHits += 1;
  const headshot = selectedArena.id === 'gun-range' && zone === 'head';
  showHitmarker(headshot);
  showDamageNumber(appliedDamage, zone);
  audio.hit(headshot);
  if (selectedArena.id === 'gun-range') {
    addFeed(
      `${headshot ? 'CRITICAL · ' : ''}${target.id.toUpperCase()} · +${Math.round(appliedDamage)} DMG · ${Math.ceil(target.health)} / ${target.maxHealth} HP`,
      headshot ? 'gold' : 'aqua',
      { damageDealt: appliedDamage },
    );
  }
  if (target.health > 0) {
    return;
  }
  target.active = false;
  target.respawnAt = performance.now() + (target.respawnDelayMs ?? 2_200);
  target.root.visible = false;
  rangeScore = selectedArena.id === 'gun-range'
    ? advanceRangeScore(rangeScore, target.scoreValue)
    : rangeScore + 1;
  publishRangeScore();
  addFeed(selectedArena.id === 'gun-range'
    ? target.kind === 'flying-cat'
      ? `BLACK CAT CRIT · +500 PTS · ${rangeScore} TOTAL · BACK IN 30 SEC`
      : `${headshot ? 'BULLSEYE · ' : ''}+${target.scoreValue} PTS · ${rangeScore} TOTAL · TARGET RESETTING`
    : '+1 test mannequin', 'gold');
}

function updateTargets(now: number): void {
  for (const target of arena.targets) {
    if (gameMode === 'solo' && selectedArena.id !== 'gun-range') {
      target.root.visible = false;
      continue;
    }
    if (!target.active && now >= target.respawnAt) {
      target.active = true;
      target.health = target.maxHealth;
    }
    target.root.visible = target.active;
    if (target.active && target.kind === 'flying-cat') {
      const phase = now * 0.00055;
      const x = Math.cos(phase) * 10.5;
      const z = -22 + Math.sin(phase * 1.35) * 12;
      const y = 3.65 + Math.sin(phase * 2.4) * 0.72;
      const nextX = Math.cos(phase + 0.01) * 10.5;
      const nextZ = -22 + Math.sin((phase + 0.01) * 1.35) * 12;
      target.root.position.set(x, y, z);
      target.root.rotation.y = Math.atan2(nextX - x, nextZ - z);
      const trail = target.root.userData.starTrail as THREE.Mesh[] | undefined;
      trail?.forEach((star, index) => {
        star.rotation.z = now * (0.0018 + index * 0.00008) + index;
        const pulse = 0.72 + Math.sin(now * 0.006 - index * 0.9) * 0.18;
        star.scale.setScalar(Math.max(0.2, pulse * (1 - index * 0.075)));
      });
    }
  }
}

function spawnImpactFlash(
  point: THREE.Vector3,
  surface: ImpactSurface = 'concrete',
  normal = new THREE.Vector3(0, 1, 0),
): void {
  impactPresentation.impact(point, normal.normalize(), surface);
}

function spawnTracer(start: THREE.Vector3, end: THREE.Vector3, color: number): void {
  tracerPool.emit(start, end, color);
}

function showHitmarker(headshot = false): void {
  const marker = element<HTMLElement>('#hitmarker');
  marker.classList.remove('show', 'headshot');
  if (headshot) marker.classList.add('headshot');
  requestAnimationFrame(() => marker.classList.add('show'));
}

function showDamageNumber(damage: number, zone: HitZone): void {
  const presentation = damageNumberPresentation(damage, zone);
  if (!presentation) return;
  const root = element<HTMLElement>('#damage-numbers');
  root.dataset.lastDamage = String(presentation.amount);
  root.dataset.lastCritical = String(presentation.critical);
  root.dataset.lastLabel = presentation.label;
  const row = document.createElement('strong');
  row.textContent = presentation.label;
  row.dataset.damage = String(presentation.amount);
  row.classList.toggle('critical', presentation.critical);
  row.style.setProperty('--damage-lane', String((root.childElementCount % 7) - 3));
  root.append(row);
  while (root.childElementCount > 8) root.firstElementChild?.remove();
  window.setTimeout(() => row.remove(), presentation.durationMs);
}

function addFeed(
  text: string,
  kind?: 'aqua' | 'coral' | 'gold',
  details?: { damageDealt?: number; damageTaken?: number },
): void {
  const destination = feedDestination(details);
  const feed = element<HTMLElement>(destination === 'damage-done' ? '#damage-done-feed' : destination === 'damage-taken' ? '#damage-taken-feed' : '#killfeed');
  const row = document.createElement('div');
  row.textContent = text;
  row.title = text;
  row.setAttribute('aria-label', accessibleFeedLabel(destination, text));
  row.dataset.feedDestination = destination;
  if (details?.damageDealt !== undefined) row.dataset.damageDealt = String(details.damageDealt);
  if (details?.damageTaken !== undefined) row.dataset.damageTaken = String(details.damageTaken);
  if (kind) row.classList.add(kind);
  feed.prepend(row);
  const limit = destination === 'events' ? EVENT_FEED_LIMIT : DAMAGE_FEED_LIMIT;
  while (feed.children.length > limit) feed.lastElementChild?.remove();
  const visibleMs = destination === 'events' ? 5_000 : DAMAGE_FEED_VISIBLE_MS;
  setTimeout(() => row.classList.add('fade'), visibleMs - 800);
  setTimeout(() => row.remove(), visibleMs);
}
function updateFieldSupportHud(): void {
  element<HTMLElement>('#support-streak').textContent = `STREAK ${fieldSupport.streak}`;
  document.querySelectorAll<HTMLElement>('[data-support]').forEach((item) => {
    const support = item.dataset.support as FieldSupportId;
    const ready = fieldSupport.available[support] === true;
    item.classList.toggle('ready', ready);
    item.classList.toggle('controller-selected', support === gamepadSupportSelection);
    const state = item.querySelector<HTMLElement>('.support-state');
    if (state) state.textContent = ready ? 'READY' : 'LOCKED';
  });
}

function overdriveStateMessage(now: number): OverdriveStateMessage {
  return {
    type: 'overdrive-state', by: player.id, holderId: overdriveState.holderId, available: overdriveState.available,
    generation: overdriveState.generation,
    activeRemainingMs: Math.min(OVERDRIVE_DURATION_MS, Math.max(0, overdriveState.activeUntil - now)),
    nextSpawnInMs: Math.min(OVERDRIVE_SPAWN_INTERVAL_MS, Math.max(0, overdriveState.nextSpawnAt - now)),
    nonce: randomNonce(),
  };
}

function broadcastOverdriveState(now: number): void {
  if (network.role === 'host') network.send(overdriveStateMessage(now));
}

function registerOverdrivePickup(holderId: string, now: number): void {
  overdrivePickups += 1;
  recordMatchDiagnostic('effect-pickup', network.role === 'client' ? 'observed' : 'accepted', {
    actorId: holderId,
    weaponOrEffect: 'overdrive',
    position: [OVERDRIVE_POSITION.x, OVERDRIVE_POSITION.y, OVERDRIVE_POSITION.z],
    reason: network.role === 'client' ? 'host-replicated-state' : 'authoritative-claim',
  });
  overdriveClaimGeneration = overdriveState.generation;
  const holderName = holderId === player.id ? player.name : remotes.get(holderId)?.snapshot.name ?? 'Operator';
  const seconds = Math.max(1, Math.ceil(overdriveRemainingMs(overdriveState, holderId, now) / 1_000));
  addFeed(`${holderName} secured 2× OVERDRIVE · ${seconds} SECONDS`, 'gold');
  if (holderId === player.id) {
    audio.overdrivePickup();
    showQuadDamageAnnouncement('QUAD DAMAGE', `2× DAMAGE · ${seconds} SECONDS`);
  } else showQuadDamageAnnouncement(`${holderName} HAS QUAD DAMAGE`, 'DENY THE POWER HOLDER');
  broadcastOverdriveState(now);
}

let quadAnnouncementTimer = 0;
function showQuadDamageAnnouncement(title: string, subtitle: string): void {
  const announcement = element<HTMLElement>('#power-announcement');
  element<HTMLElement>('#power-announcement strong').textContent = title;
  element<HTMLElement>('#power-announcement span').textContent = subtitle;
  announcement.hidden = false;
  announcement.classList.remove('announce');
  requestAnimationFrame(() => requestAnimationFrame(() => announcement.classList.add('announce')));
  window.clearTimeout(quadAnnouncementTimer);
  quadAnnouncementTimer = window.setTimeout(() => {
    announcement.hidden = true;
    announcement.classList.remove('announce');
  }, 3_500);
}

function acceptOverdriveClaim(message: OverdriveClaimMessage): void {
  if (network.role !== 'host' || message.generation !== overdriveState.generation || processedNonces.has(message.nonce)) return;
  const remote = remotes.get(message.by);
  if (!remote || remote.snapshot.hp <= 0 || !pointInsideBounds(remote.snapshot, arena.bounds, 0.44)) return;
  const now = performance.now();
  if (remote.claimRequiresCoreExit || !remoteCanClaimTimedPickup(now, remote.lastSeen, remote.claimEligibleAt)) return;
  const claimedPosition = new THREE.Vector3(...message.position);
  const authoritativePosition = new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z);
  if (claimedPosition.distanceTo(authoritativePosition) > 1.25) return;
  const result = claimOverdrive(overdriveState, message.by, authoritativePosition, true, now);
  if (!result.claimed) return;
  processedNonces.add(message.nonce);
  overdriveState = result.state;
  registerOverdrivePickup(message.by, now);
  trimNonceSet();
}

function acceptOverdriveState(message: OverdriveStateMessage): void {
  if (network.role !== 'client' || message.by === player.id || !remotes.has(message.by) || message.generation < overdriveState.generation) return;
  const now = performance.now();
  const previousHolder = overdriveState.holderId;
  const previousGeneration = overdriveState.generation;
  overdriveState = {
    generation: message.generation,
    available: message.available,
    holderId: message.holderId,
    activeUntil: message.holderId ? now + message.activeRemainingMs : 0,
    nextSpawnAt: now + message.nextSpawnInMs,
  };
  if (message.available && previousGeneration !== message.generation) {
    overdriveSpawns += 1;
    overdriveClaimGeneration = -1;
    overdriveClaimLastSentAt = Number.NEGATIVE_INFINITY;
  }
  if (message.holderId && message.holderId !== previousHolder) registerOverdrivePickup(message.holderId, now);
}

function outgoingDamage(value: number, now = performance.now()): number {
  const powered = value * overdriveDamageMultiplier(overdriveState, player.id, now);
  return handicapOutgoingDamage(player.id, powered, player.weapon);
}

function updateOverdrive(now: number): void {
  if (!selectedArena.overdrive) {
    overdriveRoot.visible = false;
    element<HTMLElement>('#overdrive-hud').hidden = true;
    return;
  }
  const wasAvailable = overdriveState.available;
  const previousHolder = overdriveState.holderId;
  if (network.role !== 'client') overdriveState = advanceOverdrive(overdriveState, now);
  if (!wasAvailable && overdriveState.available) {
    const spawnWorkStarted = performance.now();
    overdriveSpawns += 1;
    overdriveClaimGeneration = -1;
    addFeed('QUAD DAMAGE ONLINE · VISIBLE MID-MAP ICON', 'gold');
    showQuadDamageAnnouncement('QUAD DAMAGE ONLINE', 'CENTRE CORE · CLAIM 2× DAMAGE');
    audio.overdriveAvailable();
    broadcastOverdriveState(now);
    requestAnimationFrame((frameAt) => recordMatchDiagnostic('overdrive-spawn-frame', 'observed', {
      weaponOrEffect: 'overdrive',
      reason: 'first visible Quad spawn transition',
      modifiers: [
        `sync-work-ms:${Math.round((performance.now() - spawnWorkStarted) * 10) / 10}`,
        `next-frame-ms:${Math.round((frameAt - spawnWorkStarted) * 10) / 10}`,
      ],
    }));
  }
  if (previousHolder !== null && overdriveState.holderId === null) {
    overdriveExpiries += 1;
    if (previousHolder === player.id) audio.overdriveExpire();
    broadcastOverdriveState(now);
  }
  const distance = Math.hypot(player.position.x - OVERDRIVE_POSITION.x, player.position.z - OVERDRIVE_POSITION.z);
  if (gameStarted && matchState.phase === 'active' && player.alive && overdriveState.available && distance <= OVERDRIVE_PICKUP_RADIUS) {
    if (network.role === 'client') {
      if (overdriveClaimGeneration !== overdriveState.generation || now - overdriveClaimLastSentAt >= 250) {
        overdriveClaimGeneration = overdriveState.generation;
        overdriveClaimLastSentAt = now;
        network.send({ type: 'overdrive-claim', by: player.id, position: player.position.toArray(), generation: overdriveState.generation, nonce: randomNonce() });
      }
    } else {
      const result = claimOverdrive(overdriveState, player.id, player.position, true, now);
      if (result.claimed) {
        overdriveState = result.state;
        registerOverdrivePickup(player.id, now);
      }
    }
  } else if (distance > OVERDRIVE_PICKUP_RADIUS + 0.5) {
    overdriveClaimGeneration = -1;
    overdriveClaimLastSentAt = Number.NEGATIVE_INFINITY;
  }

  overdriveRoot.visible = overdriveState.available && gameStarted && matchState.phase === 'active';
  if (overdriveRoot.visible) {
    overdriveRoot.position.y = OVERDRIVE_POSITION.y + Math.sin(now * 0.0032) * 0.14;
    overdriveCore.rotation.y = now * 0.0017;
    overdriveCore.rotation.x = Math.sin(now * 0.0011) * 0.32;
    overdriveRings[0].rotation.z = now * 0.0013;
    overdriveRings[1].rotation.y = -now * 0.0016;
    quadWorldIcon.position.y = 1.75 + Math.sin(now * 0.004) * 0.12;
    quadWorldIcon.material.rotation = Math.sin(now * 0.0014) * 0.025;
  }
  const localRemaining = overdriveRemainingMs(overdriveState, player.id, now);
  const hud = element<HTMLElement>('#overdrive-hud');
  hud.hidden = localRemaining <= 0;
  if (localRemaining > 0) element<HTMLElement>('#overdrive-time').textContent = (localRemaining / 1_000).toFixed(1);
  document.documentElement.dataset.overdrive = localRemaining > 0 ? 'active' : overdriveState.available ? 'available' : 'charging';
}

function awardSupportElimination(syncGlobalLeaderboard = true): void {
  const before = fieldSupport.available;
  fieldSupport = recordSupportElimination(fieldSupport);
  bestStreakThisMatch = Math.max(bestStreakThisMatch, fieldSupport.streak);
  for (const [id, label] of [
    ['scout-sweep', 'SCOUT SWEEP'],
    ['yardhawk', 'YARDHAWK'],
    ['tri-pass', 'TRI-PASS STRIKE'],
    ['hunter-swarm', 'HUNTER SWARM'],
    ['nuke', 'NUKE'],
  ] as const) {
    if (!before[id] && fieldSupport.available[id]) addFeed(`${label} READY`, 'gold');
  }
  recordImmediateStreak(syncGlobalLeaderboard);
  updateFieldSupportHud();
}

function supportTargetState(id: string): { point: THREE.Vector3; stance: Stance } | null {
  const bot = bots.get(id);
  if (bot?.alive) return { point: bot.position.clone().add(new THREE.Vector3(0, 1.15, 0)), stance: 'stand' };
  const remote = remotes.get(id);
  if (remote && areCombatantsHostile(player.id, player.team, remote.snapshot.id, remote.snapshot.team) && remote.snapshot.hp > 0) {
    return { point: remote.target.clone().add(new THREE.Vector3(0, 1.15, 0)), stance: remote.snapshot.stance ?? 'stand' };
  }
  return null;
}

function supportTargetPosition(id: string): THREE.Vector3 | null {
  return supportTargetState(id)?.point ?? null;
}

function nearestSupportTarget(): { id: string; point: THREE.Vector3 } | null {
  const candidates: { id: string; point: THREE.Vector3 }[] = [];
  for (const bot of bots.values()) if (bot.alive && bot.team !== player.team) candidates.push({ id: bot.id, point: bot.position.clone().add(new THREE.Vector3(0, 1.15, 0)) });
  for (const remote of remotes.values()) {
    if (areCombatantsHostile(player.id, player.team, remote.snapshot.id, remote.snapshot.team) && remote.snapshot.hp > 0) candidates.push({ id: remote.snapshot.id, point: remote.target.clone().add(new THREE.Vector3(0, 1.15, 0)) });
  }
  candidates.sort((a, b) => a.point.distanceToSquared(player.position) - b.point.distanceToSquared(player.position));
  return candidates[0] ?? null;
}

function hunterTargetAssignments(): string[] {
  const candidates = [
    ...[...bots.values()].map((bot) => ({
      id: bot.id,
      team: bot.team,
      alive: bot.alive,
      distanceFromCentreSq: bot.position.x * bot.position.x + bot.position.z * bot.position.z,
    })),
    ...[...remotes.values()].map((remote) => ({
      id: remote.snapshot.id,
      team: remote.snapshot.team,
      alive: remote.snapshot.hp > 0,
      distanceFromCentreSq: remote.target.x * remote.target.x + remote.target.z * remote.target.z,
    })),
  ];
  if (privateMatchMode === 'ffa' && gameMode !== 'solo') {
    return candidates.filter((candidate) => candidate.alive && candidate.id !== player.id)
      .sort((a, b) => a.distanceFromCentreSq - b.distanceFromCentreSq || a.id.localeCompare(b.id))
      .slice(0, 5)
      .map((candidate) => candidate.id);
  }
  return assignHunterSwarmTargets(candidates, player.team);
}

function makeHunterDrone(index: number): THREE.Group {
  const root = new THREE.Group();
  root.name = `hunter-swarm-drone-${index}`;
  const shell = new THREE.MeshStandardMaterial({ color: 0x263139, roughness: 0.34, metalness: 0.82 });
  const edge = new THREE.MeshStandardMaterial({ color: 0xe0a54e, emissive: 0x8a3517, emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.52 });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff563e, toneMapped: false });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), shell);
  body.scale.set(1, 0.48, 1.55);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.075, 0.42), edge);
  wing.position.z = 0.08;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.72, 8), shell);
  tail.rotation.x = Math.PI / 2;
  tail.position.z = 0.9;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 7), eyeMaterial);
  eye.position.z = -0.58;
  const trail = new THREE.Mesh(
    new THREE.ConeGeometry(0.16, 1.35, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff9d50, transparent: true, opacity: 0.54, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  );
  trail.rotation.x = -Math.PI / 2;
  trail.position.z = 1.25;
  root.add(body, wing, tail, eye, trail);
  root.traverse((node) => {
    node.userData.presentationOnly = true;
    node.userData.blocksShots = false;
    if (node instanceof THREE.Mesh) {
      node.castShadow = !reducedRenderMode && index < 2;
      node.receiveShadow = false;
    }
  });
  return root;
}

function spawnHunterSwarm(now: number): string[] | null {
  const assignments = hunterTargetAssignments();
  if (assignments.length === 0) return null;
  const centre = new THREE.Vector3(0, 13.5, 0);
  assignments.forEach((targetId, index) => {
    const angle = index / HUNTER_SWARM_COUNT * Math.PI * 2 - Math.PI / 2;
    const root = makeHunterDrone(index);
    root.position.set(centre.x + Math.cos(angle) * 4.2, centre.y + (index % 2) * 0.65, centre.z + Math.sin(angle) * 4.2);
    root.rotation.y = -angle;
    scene.add(root);
    hunterDrones.push({
      root,
      targetId,
      index,
      spawnedAt: now,
      diveAt: now + 850 + index * 120,
      expiresAt: now + 8_000,
    });
    audio.hunterLaunch(index);
  });
  hunterSwarmLaunches += assignments.length;
  addFeed('HUNTER SWARM · FIVE DRONES OVER MID-MAP', 'gold');
  return assignments;
}

function detonateHunterDrone(drone: HunterDroneEntity, point: THREE.Vector3): void {
  const started = performance.now();
  const presentationProfile = supportBlast(point, HUNTER_SWARM_BLAST_RADIUS, 0, 'hunter-swarm', false);
  const afterPresentation = performance.now();
  const blastNonce = randomNonce();
  const supportNonce = localSupportNonces.get('hunter-swarm');
  for (const bot of bots.values()) {
    if (!bot.alive || bot.team === player.team) continue;
    const target = bot.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distance = target.distanceTo(point);
    if (arena.colliders.some((box) => segmentIntersectsBox(point, target, box))) continue;
    const damage = outgoingDamage(hunterSwarmDamage(distance, 'stand'));
    if (damage > 0) applyBotDamage(bot, damage, 'body', { kind: 'killstreak', effect: 'hunter-swarm' });
  }
  for (const remote of remotes.values()) {
    if (!areCombatantsHostile(player.id, player.team, remote.snapshot.id, remote.snapshot.team) || remote.snapshot.hp <= 0) continue;
    const target = remote.target.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distance = target.distanceTo(point);
    if (arena.colliders.some((box) => segmentIntersectsBox(point, target, box))) continue;
    const baseDamage = hunterSwarmDamage(distance, remote.snapshot.stance ?? 'stand');
    if (baseDamage > 0 && supportNonce !== undefined) {
      sendAuthoritativeHit({
        type: 'hit',
        by: player.id,
        target: remote.snapshot.id,
        damage: Math.min(100, baseDamage),
        kind: 'explosive',
        explosiveSource: 'hunter-swarm',
        origin: point.toArray(),
        actionNonce: blastNonce,
        supportNonce,
        nonce: randomNonce(),
      });
    }
  }
  const finished = performance.now();
  recordSupportExplosionProfile({
    source: 'hunter-swarm',
    audioMs: presentationProfile.audioMs,
    visualMs: presentationProfile.visualMs,
    targetDamageMs: finished - afterPresentation,
    totalSyncMs: finished - started,
  });
  hunterSwarmImpacts += 1;
  retireSupportRoot(drone.root);
  const index = hunterDrones.indexOf(drone);
  if (index >= 0) hunterDrones.splice(index, 1);
}

function beginNuke(now: number, authoritativeDamage = true): void {
  nukeShockwave.scale.setScalar(0.1);
  (nukeShockwave.material as THREE.MeshBasicMaterial).opacity = 0;
  nukeShockwave.visible = false;
  nukeSequence = {
    startedAt: now,
    detonateAt: now + NUKE_WARNING_MS,
    finishedAt: now + NUKE_WARNING_MS + 4_500,
    detonated: false,
    shockwave: nukeShockwave,
    authoritativeDamage,
  };
  const warning = element<HTMLElement>('#nuke-warning');
  warning.hidden = false;
  element<HTMLElement>('#nuke-warning b').textContent = '5';
  audio.nukeWarning();
  nukeLaunches += 1;
  addFeed('NUKE ARMED · FIVE-SECOND ATOMIC WARNING', 'gold');
}

function detonateNuke(sequence: NukeSequence): void {
  const started = performance.now();
  sequence.detonated = true;
  audio.nukeDetonation();
  const afterAudio = performance.now();
  sequence.shockwave.visible = true;
  sequence.shockwave.scale.setScalar(0.1);
  const flash = element<HTMLElement>('#nuke-flash');
  flash.hidden = false;
  flash.style.opacity = '1';
  landingImpulse = Math.max(landingImpulse, 1);
  nukeDetonations += 1;
  const afterVisual = performance.now();
  const blastNonce = randomNonce();
  const supportNonce = localSupportNonces.get('nuke');
  if (sequence.authoritativeDamage) {
    for (const remote of remotes.values()) {
      const damage = nukeDamageForTarget(player.team, remote.snapshot.team, remote.snapshot.hp > 0);
      if (damage <= 0 || supportNonce === undefined) continue;
      sendAuthoritativeHit({
        type: 'hit',
        by: player.id,
        target: remote.snapshot.id,
        damage: Math.min(100, damage),
        kind: 'explosive',
        explosiveSource: 'nuke',
        origin: [0, 1.5, 0],
        actionNonce: blastNonce,
        supportNonce,
        nonce: randomNonce(),
      });
    }
    for (const bot of [...bots.values()]) {
      const damage = nukeDamageForTarget(player.team, bot.team, bot.alive);
      if (damage > 0) applyBotDamage(bot, outgoingDamage(damage), 'body', { kind: 'killstreak', effect: 'nuke' });
    }
  }
  const finished = performance.now();
  recordSupportExplosionProfile({
    source: 'nuke',
    audioMs: afterAudio - started,
    visualMs: afterVisual - afterAudio,
    targetDamageMs: finished - afterVisual,
    totalSyncMs: finished - started,
  });
  addFeed(sequence.authoritativeDamage ? 'ATOMIC DETONATION · HOSTILE FIELD PURGED' : 'HOSTILE ATOMIC DETONATION', sequence.authoritativeDamage ? 'gold' : 'coral');
}

function updateNuke(now: number): void {
  const sequence = nukeSequence;
  if (!sequence) return;
  const warning = element<HTMLElement>('#nuke-warning');
  if (!sequence.detonated) {
    const remaining = Math.max(0, sequence.detonateAt - now);
    element<HTMLElement>('#nuke-warning b').textContent = String(Math.max(1, Math.ceil(remaining / 1_000)));
    const charge = THREE.MathUtils.clamp((now - sequence.startedAt) / NUKE_WARNING_MS, 0, 1);
    if (skyMaterial) skyMaterial.uniforms.nukeFlash.value = Math.max(0, Math.sin(now * 0.018)) * charge * 0.18;
    if (scene.fog) scene.fog.color.set(activeLighting.fogColor).lerp(new THREE.Color(0x8c536f), charge * 0.24);
    if (now >= sequence.detonateAt) detonateNuke(sequence);
    return;
  }
  warning.hidden = true;
  const elapsed = now - sequence.detonateAt;
  const blastProgress = THREE.MathUtils.clamp(elapsed / 2_600, 0, 1);
  const flashStrength = Math.exp(-elapsed / 620);
  sequence.shockwave.scale.setScalar(0.1 + blastProgress * 180);
  (sequence.shockwave.material as THREE.MeshBasicMaterial).opacity = 0.72 * (1 - blastProgress);
  if (skyMaterial) skyMaterial.uniforms.nukeFlash.value = flashStrength;
  if (scene.fog) scene.fog.color.set(activeLighting.fogColor).lerp(new THREE.Color(0xff9f5b), flashStrength * 0.72);
  const flash = element<HTMLElement>('#nuke-flash');
  flash.style.opacity = String(Math.min(1, flashStrength * 1.25));
  if (now < sequence.finishedAt) return;
  sequence.shockwave.visible = false;
  (sequence.shockwave.material as THREE.MeshBasicMaterial).opacity = 0;
  if (skyMaterial) skyMaterial.uniforms.nukeFlash.value = 0;
  if (scene.fog) scene.fog.color.set(activeLighting.fogColor);
  flash.hidden = true;
  flash.style.opacity = '0';
  nukeSequence = null;
}

const triPassMissileBodyGeometry = new THREE.CylinderGeometry(0.14, 0.18, 2.4, 10);
const triPassMissileNoseGeometry = new THREE.ConeGeometry(0.18, 0.55, 10);
const triPassMissileFinGeometry = new THREE.BoxGeometry(0.9, 0.08, 0.28);
const triPassMissileBodyMaterial = new THREE.MeshBasicMaterial({ color: 0xd5bf76 });
const triPassMissileNoseMaterial = new THREE.MeshBasicMaterial({ color: 0xff765f });
const triPassMissileFinMaterial = new THREE.MeshBasicMaterial({ color: 0x29393d });
const triPassMarkerGeometry = new THREE.RingGeometry(1.35, 1.75, 28);
const triPassMarkerMaterial = new THREE.MeshBasicMaterial({
  color: 0xff684f,
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide,
  depthWrite: false,
  toneMapped: false,
});

function makeSkyMissile(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'tri-pass-sky-missile';
  root.userData.pooledSupportPresentation = true;
  const body = new THREE.Mesh(triPassMissileBodyGeometry, triPassMissileBodyMaterial);
  const nose = new THREE.Mesh(triPassMissileNoseGeometry, triPassMissileNoseMaterial);
  nose.position.y = -1.45;
  nose.rotation.z = Math.PI;
  const fins = new THREE.Mesh(triPassMissileFinGeometry, triPassMissileFinMaterial);
  fins.position.y = 0.92;
  root.add(body, nose, fins);
  return root;
}

function disposeSupportRoot(root: THREE.Object3D): void {
  scene.remove(root);
  // Shared Tri-Pass missile/marker GPU resources must not be disposed per impact.
  if (root.userData.pooledSupportPresentation === true) {
    root.visible = false;
    return;
  }
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => material.dispose());
  });
}

function retireSupportRoot(root: THREE.Object3D): void {
  scene.remove(root);
  root.visible = false;
  deferredSupportDisposals.push(root);
}

function supportBlast(
  point: THREE.Vector3,
  radius: number,
  maximumDamage: number,
  explosiveSource: OffensiveSupportSource,
  recordProfile = true,
): ExplosionSyncProfile {
  const started = performance.now();
  audio.explosion(started);
  const afterAudio = performance.now();
  supportExplosionPresentation.emit(point, radius, started);
  const afterVisual = performance.now();
  if (maximumDamage <= 0) {
    const profile: ExplosionSyncProfile = {
      source: explosiveSource,
      audioMs: afterAudio - started,
      visualMs: afterVisual - afterAudio,
      targetDamageMs: 0,
      totalSyncMs: afterVisual - started,
    };
    if (recordProfile) recordSupportExplosionProfile(profile);
    return profile;
  }
  for (const bot of bots.values()) {
    if (!bot.alive) continue;
    const target = bot.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distance = target.distanceTo(point);
    if (distance > radius || arena.colliders.some((box) => segmentIntersectsBox(point, target, box))) continue;
    const damage = Math.min(400, outgoingDamage(Math.max(1, Math.round(maximumDamage * (1 - distance / radius)))));
    applyBotDamage(bot, damage, 'body', { kind: 'killstreak', effect: explosiveSource });
  }
  const blastNonce = randomNonce();
  const supportNonce = localSupportNonces.get(explosiveSource);
  for (const remote of remotes.values()) {
    if (!areCombatantsHostile(player.id, player.team, remote.snapshot.id, remote.snapshot.team) || remote.snapshot.hp <= 0) continue;
    if (supportNonce === undefined) {
      supportNetworkHitTelemetry[explosiveSource].missingAuthorization += 1;
      continue;
    }
    const target = remote.target.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distance = target.distanceTo(point);
    if (distance > radius) {
      supportNetworkHitTelemetry[explosiveSource].outOfRange += 1;
      continue;
    }
    if (arena.colliders.some((box) => segmentIntersectsBox(point, target, box))) {
      supportNetworkHitTelemetry[explosiveSource].blocked += 1;
      continue;
    }
    const baseDamage = Math.max(1, Math.round(maximumDamage * (1 - distance / radius)));
    supportNetworkHitTelemetry[explosiveSource].sent += 1;
    sendAuthoritativeHit({
      type: 'hit', by: player.id, target: remote.snapshot.id, damage: Math.min(100, baseDamage),
      kind: 'explosive', explosiveSource, origin: point.toArray(), actionNonce: blastNonce,
      supportNonce, nonce: randomNonce(),
    });
  }
  const finished = performance.now();
  const profile: ExplosionSyncProfile = {
    source: explosiveSource,
    audioMs: afterAudio - started,
    visualMs: afterVisual - afterAudio,
    targetDamageMs: finished - afterVisual,
    totalSyncMs: finished - started,
  };
  if (recordProfile) recordSupportExplosionProfile(profile);
  return profile;
}

function currentTriPassHostiles(): Array<{ id: string; kind: 'bot' | 'remote'; x: number; z: number }> {
  const freeForAll = gameMode !== 'solo' && privateMatchMode === 'ffa';
  return selectTriPassHostiles([
    ...[...bots.values()].map((bot) => ({
      id: bot.id,
      kind: 'bot' as const,
      team: bot.team,
      alive: bot.alive,
      x: bot.position.x,
      z: bot.position.z,
    })),
    ...[...remotes.values()]
      .filter((remote) => remote.snapshot.id !== player.id)
      .map((remote) => ({
      id: remote.snapshot.id,
      kind: 'remote' as const,
      team: remote.snapshot.team,
      alive: remote.snapshot.hp > 0,
      x: remote.target.x,
      z: remote.target.z,
    })),
  ], player.team, { freeForAll });
}

function drawStrikeMap(now = performance.now()): void {
  const context = strikeMapContext;
  const width = strikeMapCanvas.width;
  const height = strikeMapCanvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#10232a';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(181, 224, 222, 0.12)';
  context.lineWidth = 1;
  for (let line = 1; line < 8; line += 1) {
    context.beginPath(); context.moveTo(line * width / 8, 0); context.lineTo(line * width / 8, height); context.stroke();
    context.beginPath(); context.moveTo(0, line * height / 8); context.lineTo(width, line * height / 8); context.stroke();
  }
  // Road band is Atomic Acres-specific; other maps get a lighter centre guide only.
  if (selectedArena.id === 'atomic-acres') {
    const [roadRight] = worldToTacticalMap(-9.5, 0, arena.bounds, width, height);
    const [roadLeft] = worldToTacticalMap(9.5, 0, arena.bounds, width, height);
    context.fillStyle = 'rgba(88, 102, 105, 0.78)';
    context.fillRect(roadLeft, 0, roadRight - roadLeft, height);
  }
  context.strokeStyle = '#e3bd5f';
  context.setLineDash([10, 10]);
  context.beginPath(); context.moveTo(width / 2, 0); context.lineTo(width / 2, height); context.stroke();
  context.setLineDash([]);
  for (const house of arena.houses) {
    const [cx, cy] = worldToTacticalMap(house.origin.x, house.origin.z, arena.bounds, width, height);
    const [maxX] = worldToTacticalMap(house.origin.x - house.dimensions.width / 2, house.origin.z, arena.bounds, width, height);
    const [, minY] = worldToTacticalMap(house.origin.x, house.origin.z + house.dimensions.depth / 2, arena.bounds, width, height);
    const [minX] = worldToTacticalMap(house.origin.x + house.dimensions.width / 2, house.origin.z, arena.bounds, width, height);
    const [, maxY] = worldToTacticalMap(house.origin.x, house.origin.z - house.dimensions.depth / 2, arena.bounds, width, height);
    context.fillStyle = house.team === 0 ? 'rgba(72, 185, 183, 0.58)' : 'rgba(214, 113, 91, 0.58)';
    context.strokeStyle = house.team === 0 ? '#80f5f0' : '#ff9a7f';
    context.lineWidth = 3;
    context.fillRect(minX, minY, maxX - minX, maxY - minY);
    context.strokeRect(minX, minY, maxX - minX, maxY - minY);
    context.fillStyle = '#f6ead6'; context.font = '700 14px sans-serif'; context.textAlign = 'center';
    context.fillText(house.label.toUpperCase(), cx, cy + 5);
  }
  // Yard cover / solid props for maps without houses (Rustworks) so you can aim bombs relative to structure.
  if (arena.houses.length === 0) {
    context.fillStyle = 'rgba(120, 112, 98, 0.55)';
    context.strokeStyle = 'rgba(210, 190, 150, 0.35)';
    context.lineWidth = 1;
    let drawn = 0;
    for (const box of arena.colliders) {
      const sizeX = box.maxX - box.minX;
      const sizeZ = box.maxZ - box.minZ;
      if (sizeX < 1.2 || sizeZ < 1.2 || sizeX > 30 || sizeZ > 30) continue;
      if ((box.maxY ?? 4) < 0.8) continue;
      const [maxX, minY] = worldToTacticalMap(box.minX, box.maxZ, arena.bounds, width, height);
      const [minX, maxY] = worldToTacticalMap(box.maxX, box.minZ, arena.bounds, width, height);
      context.fillRect(minX, minY, Math.max(2, maxX - minX), Math.max(2, maxY - minY));
      context.strokeRect(minX, minY, Math.max(2, maxX - minX), Math.max(2, maxY - minY));
      drawn += 1;
      if (drawn >= 48) break;
    }
  }
  // Local player always drawn so you can orient bombs relative to yourself.
  {
    const [px, py] = worldToTacticalMap(player.position.x, player.position.z, arena.bounds, width, height);
    context.fillStyle = 'rgba(120, 245, 237, 0.28)';
    context.beginPath(); context.arc(px, py, 16, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#78f5ed';
    context.beginPath(); context.arc(px, py, 9, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#fff4d9'; context.lineWidth = 2; context.stroke();
    context.fillStyle = '#10232a'; context.font = '900 10px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText('YOU', px, py);
    context.textBaseline = 'alphabetic';
  }
  const hostilePulse = 10 + Math.sin(now * 0.012) * 2;
  triPassHostileMarkers = currentTriPassHostiles().map((hostile, index) => {
    const [x, y] = worldToTacticalMap(hostile.x, hostile.z, arena.bounds, width, height);
    context.fillStyle = 'rgba(255, 70, 49, 0.38)';
    context.beginPath(); context.arc(x, y, hostilePulse + 10, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#ff4631';
    context.beginPath(); context.arc(x, y, hostilePulse, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#fff4d9'; context.lineWidth = 3; context.stroke();
    context.fillStyle = '#fff4d9'; context.font = '900 11px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(hostile.kind === 'bot' ? 'BOT' : 'P', x, y + 0.5);
    context.textBaseline = 'alphabetic';
    context.fillStyle = '#ffd2a8'; context.font = '800 11px sans-serif';
    context.fillText(String(index + 1), x, y - hostilePulse - 8);
    return { id: hostile.id, kind: hostile.kind, world: [hostile.x, hostile.z], canvas: [x, y] };
  });
  element<HTMLElement>('#strike-hostile-count').textContent = triPassHostileMarkers.length === 0
    ? 'NO LIVE ENEMIES ON MAP'
    : `ENEMIES LIVE · ${triPassHostileMarkers.length} (red = people/bots)`;
  const points = triPassTargeting?.points ?? [];
  points.forEach((point, index) => {
    const [x, y] = worldToTacticalMap(point.x, point.z, arena.bounds, width, height);
    context.fillStyle = '#ff684f';
    context.beginPath(); context.arc(x, y, 16, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#fff4d9'; context.lineWidth = 3; context.stroke();
    context.fillStyle = '#10232a'; context.font = '900 18px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(String(index + 1), x, y + 1);
  });
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#fff4d9'; context.font = '900 22px sans-serif'; context.textAlign = 'center';
  context.fillText('N', width / 2, 28);
  element<HTMLElement>('#strike-target-count').textContent = `${points.length} / 3`;
  lastStrikeMapDrawAt = now;
}

function beginTriPassTargeting(): void {
  triPassTargeting = createTriPassTargeting();
  tacticalMapOpen = true;
  lastStrikeMapDrawAt = Number.NEGATIVE_INFINITY;
  const overlay = element<HTMLElement>('#strike-map-overlay');
  overlay.hidden = false;
  menu.classList.add('hidden');
  clearGameplayInput();
  drawStrikeMap();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function cancelTriPassTargeting(refund: boolean, reacquirePointer = true): void {
  const wasIncomplete = triPassTargeting !== null && !triPassTargeting.complete;
  if (refund && wasIncomplete) {
    fieldSupport = { ...fieldSupport, available: { ...fieldSupport.available, 'tri-pass': true } };
    addFeed('TRI-PASS TARGETING CANCELLED · REFUNDED', 'gold');
  }
  triPassTargeting = null;
  tacticalMapOpen = false;
  triPassHostileMarkers = [];
  element<HTMLElement>('#strike-hostile-count').textContent = 'ENEMIES LIVE · 0';
  element<HTMLElement>('#strike-map-overlay').hidden = true;
  updateFieldSupportHud();
  if (reacquirePointer && gameStarted && player.alive && !matchFinished) requestGamePointerLock();
}

function scheduleTriPassMissiles(points: readonly { x: number; z: number }[], confirmedAt: number): void {
  const schedule = triPassSchedule(confirmedAt);
  triPassLaunches += Math.min(3, points.length);
  points.slice(0, 3).forEach((point, index) => {
    const target = new THREE.Vector3(point.x, 0.2, point.z);
    const missile = makeSkyMissile();
    missile.position.set(target.x, 30 + index * 1.5, target.z);
    scene.add(missile);
    const marker = new THREE.Mesh(triPassMarkerGeometry, triPassMarkerMaterial);
    marker.name = 'tri-pass-impact-marker';
    marker.userData.pooledSupportPresentation = true;
    marker.rotation.x = -Math.PI / 2;
    marker.position.copy(target);
    scene.add(marker);
    strikeMissiles.push({ missile, marker, target, startedAt: confirmedAt, impactAt: schedule[index], resolved: false });
  });
  audio.supportInbound('tri-pass');
  addFeed('TRI-PASS · THREE MISSILES INBOUND · 1.0 SEC', 'gold');
}

function registerTriPassClick(clientX: number, clientY: number, confirmedAt = performance.now()): boolean {
  if (!tacticalMapOpen || !triPassTargeting || triPassTargeting.complete) return false;
  const rect = strikeMapCanvas.getBoundingClientRect();
  const x = (clientX - rect.left) * strikeMapCanvas.width / Math.max(1, rect.width);
  const y = (clientY - rect.top) * strikeMapCanvas.height / Math.max(1, rect.height);
  // Prefer locking onto a live hostile when the click is near their blip.
  let point = tacticalMapToWorld(x, y, arena.bounds, strikeMapCanvas.width, strikeMapCanvas.height);
  let nearestDistance = 36;
  for (const marker of triPassHostileMarkers) {
    const dx = marker.canvas[0] - x;
    const dy = marker.canvas[1] - y;
    const distance = Math.hypot(dx, dy);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      point = { x: marker.world[0], z: marker.world[1] };
    }
  }
  const next = registerTriPassTarget(triPassTargeting, point, arena.bounds);
  if (next === triPassTargeting) return false;
  triPassTargeting = next;
  drawStrikeMap();
  if (next.complete) {
    authorizeLocalOffensiveSupport('tri-pass', next.points.map((point) => [point.x, 0.2, point.z]));
    scheduleTriPassMissiles(next.points, confirmedAt);
    cancelTriPassTargeting(false);
  }
  return true;
}

strikeMapCanvas.addEventListener('click', (event) => {
  registerTriPassClick(event.clientX, event.clientY);
});

function authorizeLocalOffensiveSupport(
  source: OffensiveSupportSource,
  effectOrigins: [number, number, number][] = [],
  targetIds: string[] = [],
): number {
  const activationNonce = randomNonce();
  localSupportNonces.set(source, activationNonce);
  if (network.role !== 'offline') {
    network.send({ type: 'support-activate', by: player.id, source, activationNonce, effectOrigins, targetIds, timing: nextCombatTiming(), nonce: randomNonce() });
  }
  return activationNonce;
}

function activateFieldSupport(id: FieldSupportId): void {
  if (!selectedArena.fieldSupport || !player.alive || matchState.phase !== 'active' || tacticalMapOpen) return;
  const consumed = consumeFieldSupport(fieldSupport, id);
  if (!consumed.activated) return;
  const now = performance.now();
  endSpawnProtectionOnOffense(now);
  fieldSupport = consumed.state;
  if (id === 'scout-sweep') {
    scoutSweepUntil = now + SCOUT_SWEEP_DURATION_MS;
    audio.scoutSweep();
    addFeed('SCOUT SWEEP · PULSE 1.5 SEC / 3 SEC · 12 SEC', 'gold');
  } else if (id === 'yardhawk') {
    const target = nearestSupportTarget();
    if (!target) {
      fieldSupport = { ...fieldSupport, available: { ...fieldSupport.available, yardhawk: true } };
      updateFieldSupportHud();
      return;
    }
    if (yardhawk) disposeSupportRoot(yardhawk.root);
    const root = new THREE.Group(); root.name = 'yardhawk-hunter-killer';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.9), new THREE.MeshBasicMaterial({ color: 0x29393d }));
    const wings = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.32), new THREE.MeshBasicMaterial({ color: 0xe0bd68 }));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff765f })); eye.position.z = -0.48;
    root.add(body, wings, eye);
    const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
    root.position.copy(camera.position).addScaledVector(forward, 0.85).add(new THREE.Vector3(0, -0.32, 0));
    scene.add(root);
    yardhawk = {
      root,
      targetId: target.id,
      phase: 'thrown',
      velocity: forward.multiplyScalar(10).add(new THREE.Vector3(0, 4.2, 0)),
      spawnedAt: now,
      armedAt: now + 450,
      expiresAt: now + 6_500,
    };
    audio.supportInbound('yardhawk');
    authorizeLocalOffensiveSupport('yardhawk', [], [target.id]);
    addFeed('YARDHAWK THROWN · HOMING SYSTEM ARMING', 'gold');
  } else if (id === 'tri-pass') {
    beginTriPassTargeting();
  } else if (id === 'hunter-swarm') {
    const assignments = spawnHunterSwarm(now);
    if (!assignments) {
      fieldSupport = { ...fieldSupport, available: { ...fieldSupport.available, 'hunter-swarm': true } };
      addFeed('HUNTER SWARM · NO HOSTILE TARGETS · REFUNDED', 'gold');
    } else authorizeLocalOffensiveSupport('hunter-swarm', [], assignments);
  } else {
    authorizeLocalOffensiveSupport('nuke');
    beginNuke(now);
  }
  updateFieldSupportHud();
}

function detonateYardhawk(point: THREE.Vector3, radius: number, maxDamage: number): void {
  if (!yardhawk) return;
  supportBlast(point, radius, maxDamage, 'yardhawk');
  yardhawkExplosions += 1;
  retireSupportRoot(yardhawk.root);
  yardhawk = null;
}

function updateHunterDrones(dt: number, now: number): void {
  for (let index = hunterDrones.length - 1; index >= 0; index -= 1) {
    const drone = hunterDrones[index];
    let target = supportTargetState(drone.targetId);
    if (!target) {
      const replacement = nearestSupportTarget();
      if (replacement) {
        drone.targetId = replacement.id;
        target = supportTargetState(replacement.id);
      }
    }
    if (now >= drone.expiresAt || !target) {
      detonateHunterDrone(drone, drone.root.position.clone());
      continue;
    }
    if (now < drone.diveAt) {
      const angle = drone.index / HUNTER_SWARM_COUNT * Math.PI * 2 + (now - drone.spawnedAt) * 0.0014;
      const formation = new THREE.Vector3(Math.cos(angle) * 4.2, 13.5 + Math.sin(now * 0.004 + drone.index) * 0.35, Math.sin(angle) * 4.2);
      drone.root.position.lerp(formation, Math.min(1, dt * 4.5));
      drone.root.lookAt(target.point);
      continue;
    }
    const direction = target.point.clone().sub(drone.root.position);
    const distance = direction.length();
    if (distance <= 0.85) {
      detonateHunterDrone(drone, target.point);
      continue;
    }
    const step = direction.normalize().multiplyScalar(Math.min(distance, dt * (20 + drone.index * 0.85)));
    const collision = sweepSphereAgainstBoxes(drone.root.position, step, arena.colliders, 0.24);
    if (collision) {
      const normal = new THREE.Vector3(collision.normal.x, collision.normal.y, collision.normal.z);
      const impact = drone.root.position.clone().addScaledVector(step, collision.time).addScaledVector(normal, 0.26);
      detonateHunterDrone(drone, impact);
      continue;
    }
    drone.root.position.add(step);
    drone.root.lookAt(target.point);
    drone.root.rotation.z = Math.sin(now * 0.012 + drone.index) * 0.2;
  }
}

function remoteSupportTargetPoints(message: Extract<GameMessage, { type: 'support-activate' }>, sender: PlayerSnapshot): THREE.Vector3[] {
  if (message.effectOrigins.length > 0) return message.effectOrigins.map((point) => new THREE.Vector3(...point));
  const targets = message.targetIds.map((id) => id === player.id ? player.position.clone() : supportTargetPosition(id)).filter((point): point is THREE.Vector3 => point !== null);
  return targets.length > 0 ? targets : [new THREE.Vector3(sender.x, sender.y, sender.z)];
}

function presentRemoteSupportActivation(message: Extract<GameMessage, { type: 'support-activate' }>, sender: PlayerSnapshot): void {
  const now = performance.now();
  if (message.source === 'nuke') {
    if (!nukeSequence) beginNuke(now, false);
    addFeed('HOSTILE NUKE INBOUND · FULL-FIELD WARNING', 'coral');
    return;
  }
  audio.supportInbound(message.source);
  const points = remoteSupportTargetPoints(message, sender).slice(0, 5);
  const roots = points.map((target, index) => {
    const root = new THREE.Group();
    root.name = 'remote-' + message.source + '-presentation-' + index;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(message.source === 'nuke' ? 0.72 : 0.34, 0),
      new THREE.MeshBasicMaterial({ color: 0xff8a55, transparent: true, opacity: 0.78, depthWrite: false, toneMapped: false }),
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.75, 20),
      new THREE.MeshBasicMaterial({ color: 0xffd06b, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
    );
    ring.rotation.x = -Math.PI / 2;
    const trail = new THREE.Mesh(
      new THREE.ConeGeometry(message.source === 'hunter-swarm' ? 0.32 : 0.22, message.source === 'tri-pass' ? 4.8 : 2.8, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffb45d, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    trail.position.y = 1.8;
    root.add(core, ring, trail);
    root.position.copy(target).add(new THREE.Vector3(0, 10, 0));
    root.userData.presentationOnly = true;
    root.traverse((node) => { node.userData.blocksShots = false; });
    scene.add(root);
    return { root, target: target.clone() };
  });
  const delay = 900;
  remoteSupportPresentations.push({ source: message.source, roots, startedAt: now, detonateAt: now + delay, expiresAt: now + delay + 1_800, detonated: false });
  addFeed('REMOTE ' + message.source.toUpperCase().replaceAll('-', ' ') + ' ACTIVATED', 'coral');
}

function updateRemoteSupportPresentations(now: number): void {
  for (let index = remoteSupportPresentations.length - 1; index >= 0; index -= 1) {
    const effect = remoteSupportPresentations[index];
    const progress = THREE.MathUtils.clamp((now - effect.startedAt) / Math.max(1, effect.detonateAt - effect.startedAt), 0, 1);
    for (const { root, target } of effect.roots) {
      root.position.y = THREE.MathUtils.lerp(target.y + (10), target.y + 0.35, progress);
      root.rotation.y = now * 0.004;
      root.scale.setScalar(0.9 + Math.sin(now * 0.012) * 0.12);
    }
    if (!effect.detonated && now >= effect.detonateAt) {
      effect.detonated = true;
      for (const { target } of effect.roots) supportBlast(target, effect.source === 'nuke' ? 14 : 3.2, 0, effect.source, false);
      for (const { root } of effect.roots) retireSupportRoot(root);
    }
    if (now >= effect.expiresAt) remoteSupportPresentations.splice(index, 1);
  }
}
function updateFieldSupport(dt: number, now: number): void {
  supportExplosionFrameSerial += 1;
  supportExplosionPresentation.update(now);
  if (tacticalMapOpen && now - lastStrikeMapDrawAt >= 100) drawStrikeMap(now);
  if (yardhawk) {
    if (now >= yardhawk.expiresAt) {
      detonateYardhawk(yardhawk.root.position.clone(), 2.8, 150);
    } else if (yardhawk.phase === 'thrown') {
      yardhawk.velocity.y -= 9.5 * dt;
      const start = yardhawk.root.position.clone();
      const delta = yardhawk.velocity.clone().multiplyScalar(dt);
      const collision = sweepSphereAgainstBoxes(start, delta, arena.colliders, 0.24);
      if (collision) {
        const normal = new THREE.Vector3(collision.normal.x, collision.normal.y, collision.normal.z);
        const impact = start.clone().addScaledVector(delta, collision.time).addScaledVector(normal, 0.26);
        detonateYardhawk(impact, 2.8, 150);
      } else {
        yardhawk.root.position.add(delta);
      }
      if (yardhawk) {
        yardhawk.root.rotation.x += dt * 8;
        yardhawk.root.rotation.z += dt * 11;
        if (now >= yardhawk.armedAt) {
          yardhawk.phase = 'homing';
          yardhawk.velocity.set(0, 0, 0);
          addFeed('YARDHAWK ARMED · TARGET LOCK', 'gold');
        }
      }
    } else {
      let target = supportTargetPosition(yardhawk.targetId);
      if (!target) {
        const replacement = nearestSupportTarget();
        if (replacement) {
          yardhawk.targetId = replacement.id;
          target = replacement.point;
        }
      }
      if (target) {
        const direction = target.clone().sub(yardhawk.root.position);
        const distance = direction.length();
        if (distance <= 1.15) {
          detonateYardhawk(target, 3.2, 200);
        } else {
          const step = direction.normalize().multiplyScalar(Math.min(distance, dt * 16));
          const start = yardhawk.root.position.clone();
          const collision = sweepSphereAgainstBoxes(start, step, arena.colliders, 0.24);
          if (collision) {
            const normal = new THREE.Vector3(collision.normal.x, collision.normal.y, collision.normal.z);
            const impact = start.clone().addScaledVector(step, collision.time).addScaledVector(normal, 0.26);
            detonateYardhawk(impact, 2.8, 150);
          } else {
            yardhawk.root.position.add(step);
            yardhawk.root.lookAt(target);
          }
        }
      } else {
        yardhawk.root.position.y += Math.sin(now * 0.009) * dt * 0.16;
        yardhawk.root.rotation.y += dt * 2;
      }
    }
  }
  updateHunterDrones(dt, now);
  updateRemoteSupportPresentations(now);
  for (let index = strikeMissiles.length - 1; index >= 0; index -= 1) {
    const strike = strikeMissiles[index];
    const progress = THREE.MathUtils.clamp((now - strike.startedAt) / Math.max(1, strike.impactAt - strike.startedAt), 0, 1);
    strike.missile.position.y = THREE.MathUtils.lerp(30, 0.65, progress ** 1.35);
    strike.missile.rotation.y += dt * 7;
    (strike.marker.material as THREE.MeshBasicMaterial).opacity = 0.38 + Math.sin(now * 0.022) * 0.22;
    strike.marker.scale.setScalar(0.88 + progress * 0.22);
    if (!strike.resolved && now >= strike.impactAt) {
      strike.resolved = true;
      supportBlast(strike.target, TRI_PASS_BLAST_RADIUS, TRI_PASS_MAX_DAMAGE, 'tri-pass');
      triPassImpacts += 1;
      triPassLastImpactDelayMs = now - strike.startedAt;
      retireSupportRoot(strike.missile);
      retireSupportRoot(strike.marker);
      strikeMissiles.splice(index, 1);
    }
  }
  updateNuke(now);
}

function clearGrenades(): void {
  for (const grenade of grenades) {
    releaseBotGrenadeOwner(grenade);
    disposeGrenadePresentation(grenade.mesh);
  }
  grenades.length = 0;
}

function clearFieldSupport(): void {
  if (yardhawk) disposeSupportRoot(yardhawk.root);
  yardhawk = null;
  for (const strike of strikeMissiles) {
    disposeSupportRoot(strike.missile);
    disposeSupportRoot(strike.marker);
  }
  strikeMissiles.length = 0;
  for (const drone of hunterDrones) disposeSupportRoot(drone.root);
  hunterDrones.length = 0;
  for (const effect of remoteSupportPresentations) for (const { root } of effect.roots) disposeSupportRoot(root);
  remoteSupportPresentations.length = 0;
  for (const root of deferredSupportDisposals) disposeSupportRoot(root);
  deferredSupportDisposals.length = 0;
  supportExplosionPresentation.clear();
  if (nukeSequence) nukeSequence = null;
  nukeShockwave.visible = false;
  (nukeShockwave.material as THREE.MeshBasicMaterial).opacity = 0;
  if (skyMaterial) skyMaterial.uniforms.nukeFlash.value = 0;
  if (scene.fog) scene.fog.color.set(activeLighting.fogColor);
  const nukeWarning = element<HTMLElement>('#nuke-warning');
  const nukeFlash = element<HTMLElement>('#nuke-flash');
  nukeWarning.hidden = true;
  nukeFlash.hidden = true;
  nukeFlash.style.opacity = '0';
  cancelTriPassTargeting(false, false);
  scoutSweepUntil = 0;
  yardhawkExplosions = 0;
  triPassLaunches = 0;
  triPassImpacts = 0;
  triPassLastImpactDelayMs = null;
  hunterSwarmLaunches = 0;
  hunterSwarmImpacts = 0;
  nukeLaunches = 0;
  nukeDetonations = 0;
  fieldSupport = createFieldSupportState();
  localSupportNonces.clear();
  admittedRemoteShots.clear();
  admittedRemoteMelees.clear();
  admittedRemoteExplosions.clear();
  for (const id of remotes.keys()) remoteSupportAuthorities.set(id, createRemoteSupportAuthorityState());
  for (const id of remotes.keys()) remoteGrenadeAuthorities.set(id, createRemoteGrenadeAuthorityState());
  for (const id of remotes.keys()) remoteHealthAuthorities.set(id, createRemoteHealthAuthorityState(true));
  updateFieldSupportHud();
}

function clearTeamPings(): void {
  for (const ping of activeTeamPings) removeTeamPing(ping);
  activeTeamPings.length = 0;
  remotePingAdmissions.clear();
  localPingAdmission = createTeamPingAdmissionState();
}

function updatePhysics(dt: number): void {
  if (!playerSimulationEnabled() || !characterPhysics) return;
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const forwardInput = THREE.MathUtils.clamp(Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - gamepadMove.y, -1, 1);
  const strafeInput = THREE.MathUtils.clamp(Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + gamepadMove.x, -1, 1);
  const input = forward.clone().multiplyScalar(forwardInput).addScaledVector(right, strafeInput);
  if (input.lengthSq() > 1) input.normalize();
  const now = performance.now();
  const crouched = player.stance === 'crouch';
  const prone = player.stance === 'prone';
  const wantsSprint = (keys.has('ShiftLeft') || gamepadSprint) && input.lengthSq() > 0 && playerGrounded;
  const validSprintDirection = sprintEligible(forwardInput, strafeInput, adsHeld, false, false);
  if (wantsSprint && validSprintDirection && player.stance !== 'stand') requestStance('stand');
  currentSprinting = wantsSprint
    && !triggerHeld && !player.reloadState && now >= player.switchingUntil && now - player.lastMeleeAt > 500
    && sprintEligible(forwardInput, strafeInput, adsHeld, crouched, prone);
  const profile = movementProfile({ crouched, prone, ads: adsHeld, sprinting: currentSprinting, grounded: playerGrounded });
  const integrated = integrateHorizontalVelocity(
    { x: player.velocity.x, z: player.velocity.z },
    { x: input.x, z: input.z },
    profile,
    dt,
  );
  player.velocity.x = integrated.x;
  player.velocity.z = integrated.z;

  if (player.hp < 100 && now - lastDamageAt >= 5_000) player.hp = Math.min(100, player.hp + 18 * dt);
  if (playerGrounded) lastGroundedAt = now;
  const jumpBuffered = now - jumpQueuedAt <= 125;
  const coyoteGrounded = playerGrounded || now - lastGroundedAt <= 95;
  if (jumpBuffered && coyoteGrounded && !adsHeld && player.stance === 'stand' && matchState.phase === 'active') {
    player.velocity.y = profile.jumpVelocity;
    playerGrounded = false;
    jumpQueuedAt = -10_000;
  } else {
    player.velocity.y -= 24.5 * dt;
    if (playerGrounded) player.velocity.y = Math.max(0, player.velocity.y);
  }

  const impactVelocity = player.velocity.y;
  // Ocean buoyancy/drag when looking/falling outside the island pad.
  const preWater = waterSystem.samplePhysics(player.position);
  if (preWater.inWater) {
    player.velocity.y += preWater.buoyancy * dt;
    player.velocity.y += (preWater.surfaceVelocityY - player.velocity.y) * Math.min(1, 1.8 * dt);
    player.velocity.x *= Math.max(0.2, 1 - preWater.drag * dt);
    player.velocity.z *= Math.max(0.2, 1 - preWater.drag * dt);
    player.velocity.y *= Math.max(0.25, 1 - preWater.drag * 0.65 * dt);
  }
  const movement = characterPhysics.move({
    x: player.velocity.x * dt,
    y: player.velocity.y * dt,
    z: player.velocity.z * dt,
  }, dt);
  player.position.set(movement.position.x, movement.position.y, movement.position.z);
  playerGrounded = movement.grounded;
  const postWater = waterSystem.samplePhysics(player.position);
  if (postWater.inWater && player.position.y < postWater.surfaceY + 0.35) {
    // Soft float toward surface so OOB falls feel like water, not a void clip.
    player.position.y = Math.min(postWater.surfaceY + 0.55, Math.max(player.position.y, postWater.surfaceY - 0.9));
    characterPhysics.teleportEye(player.position);
    if (player.velocity.y < 0.4) player.velocity.y = Math.max(player.velocity.y, 1.2);
    playerGrounded = false;
  }
  if (playerGrounded) lastGroundedAt = now;
  if (playerGrounded && !wasGrounded && impactVelocity < -5) {
    const impactSpeed = Math.abs(impactVelocity);
    landingImpulse = Math.min(1, impactSpeed / 14);
    audio.land(impactSpeed);
    lastFallImpactSpeed = impactSpeed;
    lastFallDamage = computeFallDamage(impactSpeed);
    if (lastFallDamage > 0) applyDamage(lastFallDamage, player.id, 0, true);
  }
  wasGrounded = playerGrounded;
  if (movement.blockedX && !movement.slopeAdjusted) player.velocity.x = movement.appliedDelta.x / Math.max(dt, 0.001);
  if (movement.blockedY && player.velocity.y < 0) player.velocity.y = 0;
  if (movement.blockedZ && !movement.slopeAdjusted) player.velocity.z = movement.appliedDelta.z / Math.max(dt, 0.001);

  const moving = input.lengthSq() > 0 && playerGrounded;
  const appliedHorizontalDistance = playerGrounded ? Math.hypot(movement.appliedDelta.x, movement.appliedDelta.z) : 0;
  const footsteps = advanceFootsteps(
    footstepAccumulator,
    appliedHorizontalDistance,
    strideLength(player.stance, currentSprinting),
  );
  footstepAccumulator = footsteps.state;
  for (let index = 0; index < footsteps.emitted; index += 1) {
    audio.footstep(classifyFootstepSurface(player.position), currentSprinting, crouched || prone);
  }
  weaponBob += dt * (currentSprinting ? 15 : prone ? 3.6 : crouched ? 7 : 10) * (moving ? 1 : 0.25);
  recoilVisual = recoverRecoil(recoilVisual, WEAPONS[player.weapon], dt);
  recoilCamera = recoverRecoilImpulse(recoilCamera, WEAPONS[player.weapon], dt);
  landingImpulse = damp(landingImpulse, 0, 10, dt);
  cameraHeightOffset = damp(cameraHeightOffset, 0, prone ? 9 : 15, dt);
  const lateralSpeed = player.velocity.dot(right) / Math.max(1, profile.maxSpeed);
  cameraRoll = damp(cameraRoll, -lateralSpeed * (adsHeld ? 0.006 : 0.016), 11, dt);
  const weaponActionEvents = weaponView.update({
    dt,
    moving,
    sprinting: currentSprinting,
    crouched,
    prone,
    ads: adsHeld,
    phase: weaponBob,
    landingImpulse,
    lateralSpeed,
    reloadProgress: debugReloadProgress ?? gameplayReloadProgress(player.reloadState, performance.now()),
    surfaceRetreat: currentViewmodelSurfaceRetreat(),
  });
  for (const event of weaponActionEvents) {
    audio.weaponAction(player.weapon, event);
    weaponActionHistory.push(event);
  }
  if (weaponActionHistory.length > 16) weaponActionHistory.splice(0, weaponActionHistory.length - 16);
  const aimingFov = player.weapon === 'sniper'
    ? magnifiedFovDegrees(preferredFov, 3)
    : Math.max(55, preferredFov - 20);
  const targetFov = adsHeld ? aimingFov : currentSprinting ? preferredFov + 4.5 : preferredFov;
  camera.fov = player.weapon === 'sniper' ? targetFov : damp(camera.fov, targetFov, 10, dt);
  camera.updateProjectionMatrix();
  const sniperScopeActive = player.alive
    && player.weapon === 'sniper'
    && adsHeld
    && weaponView.adsProgress() >= 0.9
    && Math.abs(camera.fov - aimingFov) < 0.35;
  sniperScopeOverlay.hidden = !sniperScopeActive;
  hudRoot.classList.toggle('sniper-scope-active', sniperScopeActive);
  weaponView.root.visible = gameStarted && !sniperScopeActive && !debugCaptureViewmodelHidden;
  camera.position.copy(player.position);
  camera.position.y += cameraHeightOffset - landingImpulse * 0.035;
  camera.rotation.y = player.yaw + recoilCamera.yaw;
  camera.rotation.x = THREE.MathUtils.clamp(player.pitch - recoilCamera.pitch, -1.42, 1.42);
  camera.rotation.z = cameraRoll;
}

function updateRemotes(dt: number, now: number): void {
  const hostNow = currentHostTimeMs();
  recordCombatantPose(localPositionHistory, {
    at: hostNow, x: player.position.x, y: player.position.y, z: player.position.z,
    yaw: player.yaw, stance: player.stance, continuity: localContinuity,
  });
  for (const [id, remote] of remotes) {
    if (now - remote.lastSeen > 12_000) {
      removeRemote(id, 'timed out');
      continue;
    }
    const rendered = remote.interpolation.sample(hostNow, SNAPSHOT_INTERPOLATION_DELAY_MS);
    const renderedSnapshot = rendered?.value ?? remote.snapshot;
    const renderedTarget = new THREE.Vector3(
      renderedSnapshot.x,
      renderedSnapshot.y - stanceEyeHeight(renderedSnapshot.stance),
      renderedSnapshot.z,
    );
    const remainingDistance = remote.root.position.distanceTo(renderedTarget);
    remote.root.position.copy(renderedTarget);
    remote.root.rotation.y = renderedSnapshot.yaw;
    remote.target.copy(renderedTarget);
    remote.targetYaw = renderedSnapshot.yaw;
    remote.renderedHostTimeMs = rendered?.renderedHostTimeMs ?? hostNow;
    remote.renderedWorldAgeMs = rendered?.renderedWorldAgeMs ?? 0;
    const stance = renderedSnapshot.stance ?? 'stand';
    const operator = remote.root.userData.operator as THREE.Group;
    setOperatorWeapon(operator, renderedSnapshot.weapon, flattenOperatorMaterials);
    poseOperator(operator, stance, remainingDistance / Math.max(dt, 0.001), now * 0.008, Math.min(1, dt * 24), renderedSnapshot.pitch);
  }
}

function teamScores(): [number, number] {
  if (gameMode !== 'solo' && privateLobbySnapshot) {
    return teamTotals([...authoritativeScores.values()], privateLobbySnapshot.members);
  }
  let aqua = player.team === 0 ? player.kills : 0;
  let coral = player.team === 1 ? player.kills : 0;
  for (const remote of remotes.values()) {
    const admittedKills = verifiedRemoteKills.get(remote.snapshot.id) ?? 0;
    if (remote.snapshot.team === 0) aqua += admittedKills;
    else coral += admittedKills;
  }
  for (const bot of bots.values()) {
    if (bot.team === 0) aqua += bot.kills;
    else coral += bot.kills;
  }
  return [aqua, coral];
}

function matchParticipantReports(): Array<{ id: string; report: MatchParticipantReportInput }> {
  const reports: Array<{ id: string; report: MatchParticipantReportInput }> = [];
  const timelineDamage = (name: string, direction: 'from' | 'to') => Math.round(humanDamageTimeline.reduce(
    (total, event) => total + (event[direction] === name ? event.damage : 0),
    0,
  ));
  const scoreFor = (id: string): PlayerScore | undefined => authoritativeScores.get(id) ?? privateLobbySnapshot?.scores.find((score) => score.id === id);
  if (gameMode !== 'solo' && privateLobbySnapshot) {
    for (const member of privateLobbySnapshot.members) {
      const score = scoreFor(member.id) ?? emptyPlayerScore(member.id);
      const remote = remotes.get(member.id);
      const isLocal = member.id === player.id;
      reports.push({
        id: member.id,
        report: {
          name: member.name,
          kind: 'player',
          team: privateMatchMode === 'ffa' ? 'free-for-all' : `team-${member.team + 1}`,
          kills: score.kills,
          deaths: score.deaths,
          damageDealt: score.damageDealt,
          damageTaken: score.damageTaken,
          finalHealth: isLocal ? player.hp : remote?.snapshot.hp,
          ...(selectedArena.id === 'gun-range' ? {
            score: score.rangeScore ?? (isLocal ? rangeScore : 0),
            hits: score.rangeHits ?? (isLocal ? targetHits : 0),
            shots: score.rangeShots ?? (isLocal ? rangeShotsFired : 0),
          } : isLocal ? { hits: roundHitShots, shots: roundShotsFired } : {}),
        },
      });
    }
  } else {
    reports.push({
      id: player.id,
      report: {
        name: player.name,
        kind: 'player',
        team: `team-${player.team + 1}`,
        kills: player.kills,
        deaths: player.deaths,
        damageDealt: Math.round(roundDamageDealt),
        damageTaken: Math.round(roundDamageTaken),
        finalHealth: player.hp,
        ...(selectedArena.id === 'gun-range'
          ? { score: rangeScore, hits: targetHits, shots: rangeShotsFired }
          : { hits: roundHitShots, shots: roundShotsFired }),
      },
    });
  }
  const seen = new Set(reports.map((entry) => entry.id));
  for (const bot of [...bots.values(), ...dormantBots.values()]) {
    if (seen.has(bot.id)) continue;
    seen.add(bot.id);
    const score = scoreFor(bot.id);
    reports.push({
      id: bot.id,
      report: {
        name: bot.name,
        kind: bot.id.startsWith('host-bot-') ? 'hosted-bot' : 'solo-bot',
        team: privateMatchMode === 'ffa' && gameMode !== 'solo' ? 'free-for-all' : `team-${bot.team + 1}`,
        kills: score?.kills ?? bot.kills,
        deaths: score?.deaths ?? bot.deaths,
        damageDealt: score?.damageDealt ?? timelineDamage(bot.name, 'from'),
        damageTaken: score?.damageTaken ?? timelineDamage(bot.name, 'to'),
        finalHealth: bot.hp,
      },
    });
  }
  return reports;
}

function updateMatchState(now: number): void {
  const previous = matchState.phase;
  const scores = teamScores();
  const rules = currentMatchRules();
  const ffa = gameMode !== 'solo' && privateMatchMode === 'ffa';
  const orderedFfa = freeForAllLeaders([...authoritativeScores.values()]);
  matchState = ffa
    ? advanceFreeForAllMatch(matchState, now, orderedFfa, rules)
    : advanceMatch(matchState, now, scores, rules);
  let presentation = matchPresentationAt(matchState, now, scores, player.team, rules, arena.label);
  if (ffa) {
    const localRank = Math.max(1, orderedFfa.findIndex((entry) => entry.id === player.id) + 1);
    const leaders = orderedFfa.length === 0 ? [] : orderedFfa.filter((entry) => entry.kills === orderedFfa[0].kills);
    const winner = matchState.winnerPlayerId ? privateLobbySnapshot?.members.find((member) => member.id === matchState.winnerPlayerId) : undefined;
    presentation = {
      timer: presentation.timer,
      headline: matchState.phase === 'warmup'
        ? String(Math.max(1, Math.ceil((matchState.endsAt - now) / 1_000)))
        : matchState.phase === 'ended'
          ? winner ? `${winner.name.toUpperCase()} WINS` : 'STALEMATE'
          : null,
      subline: matchState.phase === 'ended'
        ? `${leaders.map((entry) => privateLobbySnapshot?.members.find((member) => member.id === entry.id)?.name ?? entry.id).join(' · ')} · YOUR PLACE #${localRank}`
        : `FREE FOR ALL · PLACE #${localRank}`,
      objective: `${orderedFfa[0]?.kills ?? 0} LEADING KILLS`,
    };
  }
  const countdown = element<HTMLElement>('#countdown');
  if (matchState.phase === 'warmup') {
    countdown.textContent = presentation.headline ?? '';
    countdown.hidden = false;
  } else {
    countdown.hidden = true;
  }
  if (previous === matchState.phase) return;
  const banner = element<HTMLElement>('#banner');
  if (matchState.phase === 'active') {
    if (network.role === 'host' && privateLobbySnapshot?.phase !== 'active') broadcastHostLobby('active');
    else if (privateLobbySnapshot) privateLobbySnapshot = { ...privateLobbySnapshot, phase: 'active' };
    banner.innerHTML = `<strong>ENGAGE</strong><span>${privateMatchMode === 'ffa' && gameMode !== 'solo' ? 'FREE FOR ALL · EVERY PLAYER HOSTILE' : selectedArena.rulesLabel}</span>`;
    banner.hidden = false;
    window.setTimeout(() => { if (matchState.phase === 'active') banner.hidden = true; }, 900);
    return;
  }
  if (matchState.phase === 'ended') {
    matchFinished = true;
    if (network.role === 'host' && privateLobbySnapshot?.phase !== 'ended') broadcastHostLobby('ended');
    else if (privateLobbySnapshot) privateLobbySnapshot = { ...privateLobbySnapshot, phase: 'ended' };
    recordCompletedMatch();
    clearGrenades();
    clearFieldSupport();
    const privateMatch = gameMode !== 'solo';
    const authoritativeLocal = authoritativeScores.get(player.id);
    const summary = roundStatSummary({
      kills: authoritativeLocal?.kills ?? player.kills,
      deaths: authoritativeLocal?.deaths ?? player.deaths,
      shotsFired: roundShotsFired,
      hitShots: roundHitShots,
      damageDealt: Math.max(roundDamageDealt, authoritativeLocal?.damageDealt ?? 0),
      headshots: roundHeadshots,
    });
    const statsMarkup = `<div class="round-stats" aria-label="Round statistics"><b><small>KILLS</small>${summary.kills}</b><b><small>DEATHS</small>${summary.deaths}</b><b><small>K/D</small>${summary.kd}</b><b><small>ACCURACY</small>${summary.accuracy}</b><b><small>DAMAGE</small>${summary.damageDealt}</b><b><small>HEADSHOTS</small>${summary.headshots}</b></div>`;
    const returnLabel = privateMatch ? network.role === 'host' ? 'RETURN EVERYONE TO LOBBY' : 'WAITING FOR HOST' : 'REMATCH';
    recordMatchDiagnostic('match-end', 'observed', {
      actorId: player.id,
      reason: presentation.headline ?? 'match-ended',
      modifiers: [`kills:${summary.kills}`, `deaths:${summary.deaths}`, `damage:${summary.damageDealt}`],
    });
    const completedAt = new Date().toISOString();
    const participants = matchParticipantReports();
    matchDiagnostics?.setFinalState({
      completedAt,
      result: presentation.headline ?? 'MATCH COMPLETE',
      durationMs: Math.max(0, performance.now() - matchDiagnosticsStartedAt),
      participants: participants.map(({ id, report }) => ({
        participantId: matchDiagnostics?.participantKey(id),
        ...report,
      })),
      damageLedgerEventCount: humanDamageTimeline.length,
      droppedHumanDamageEvents,
      clientRuntimeLog: readClientRuntimeLog(clientSessionStorage()),
      experimentalNetcode: {
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        hostTime: hostTimeDiagnostics(hostTimeMapping),
        selectedRateHz: localSnapshotRateState.rateHz,
        stateIntervalMs: snapshotIntervalMs(localSnapshotRateState.rateHz),
        receiverSequenceGaps,
        receiverReordered,
        bufferedPressure: network.stateBufferedPressure(),
        shotLifecycle: { ...shotProtocolTelemetry },
        remoteInterpolation: [...remotes.values()].map((remote) => ({
          playerId: matchDiagnostics?.participantKey(remote.snapshot.id),
          renderedWorldAgeMs: remote.renderedWorldAgeMs,
          bufferDepth: remote.interpolation.depth,
          ...remote.interpolation.stats,
        })),
      },
    });
    const technical = matchDiagnostics?.export();
    if (technical) {
      lastMatchDownloads = {
        technical,
        summary: createHumanMatchReport({
          build: latestChangelogEntry().pass,
          arena: selectedArena.displayName,
          mode: gameMode === 'solo' ? 'solo' : privateMatchMode,
          role: network.role === 'client' ? 'guest' : network.role,
          result: presentation.headline ?? 'MATCH COMPLETE',
          durationMs: performance.now() - matchDiagnosticsStartedAt,
          kills: summary.kills,
          deaths: summary.deaths,
          shotsFired: roundShotsFired,
          hitShots: roundHitShots,
          damageDealt: summary.damageDealt,
          damageTaken: Math.max(roundDamageTaken, authoritativeLocal?.damageTaken ?? 0),
          headshots: summary.headshots,
          bestKillstreak: bestStreakThisMatch,
          completedAt,
          participants: participants.map((entry) => entry.report),
          damageTimeline: humanDamageTimeline,
          droppedDamageEvents: droppedHumanDamageEvents,
        }),
      };
      syncMatchReportDownloads();
    }
    banner.innerHTML = `<strong>${presentation.headline}</strong><span>${presentation.subline} · ${presentation.objective}</span>${statsMarkup}<div class="match-end-actions"><button id="download-match-summary" type="button">HUMAN SUMMARY JSON</button><button id="download-match-diagnostics" type="button">TECHNICAL DEBUG JSON</button><button id="rematch" type="button" ${privateMatch && network.role !== 'host' ? 'disabled' : ''}>${returnLabel}</button><button id="match-main-menu" type="button">MAIN MENU</button></div>`;
    banner.hidden = false;
    element<HTMLButtonElement>('#download-match-summary').addEventListener('click', downloadMatchSummary);
    element<HTMLButtonElement>('#download-match-diagnostics').addEventListener('click', downloadMatchDiagnostics);
    const rematch = element<HTMLButtonElement>('#rematch');
    if (!rematch.disabled) rematch.addEventListener('click', () => {
      if (privateMatch && network.role === 'host') returnPrivateMatchToLobby(true);
      else {
        network.close();
        resetForMode();
        startGame('solo', false);
      }
    }, { once: true });
    element<HTMLButtonElement>('#match-main-menu').addEventListener('click', returnToMainMenu, { once: true });
    document.exitPointerLock();
  }
}

function checkMatchEnd(): void {
  updateMatchState(performance.now());
}

function drawMinimapLandmark(
  context: CanvasRenderingContext2D,
  id: string,
  kind: MinimapLandmarkKind,
  footprint: { x: number; y: number; width: number; height: number },
): void {
  const { x, y, width, height } = footprint;
  const inset = Math.max(1.5, Math.min(width, height) * 0.12);
  context.save();
  context.lineWidth = 2.5;
  context.strokeStyle = '#fff1bd';
  context.fillStyle = id.startsWith('south-') ? 'rgba(255, 118, 95, .66)' : 'rgba(88, 227, 220, .62)';

  if (kind === 'bus') {
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
    context.strokeStyle = 'rgba(7, 15, 18, .88)';
    context.beginPath();
    context.moveTo(x + width * 0.18, y + inset);
    context.lineTo(x + width * 0.18, y + height - inset);
    context.moveTo(x + width * 0.82, y + inset);
    context.lineTo(x + width * 0.82, y + height - inset);
    context.stroke();
  } else if (kind === 'cargo-stack') {
    context.fillStyle = 'rgba(225, 171, 52, .76)';
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
    context.strokeStyle = 'rgba(7, 15, 18, .78)';
    context.beginPath();
    context.moveTo(x + width / 3, y); context.lineTo(x + width / 3, y + height);
    context.moveTo(x + width * 2 / 3, y); context.lineTo(x + width * 2 / 3, y + height);
    context.moveTo(x, y + height / 2); context.lineTo(x + width, y + height / 2);
    context.stroke();
  } else if (kind === 'pipe-stack') {
    context.fillStyle = 'rgba(173, 186, 188, .72)';
    const radius = Math.max(2.5, Math.min(width / 6, height / 3.2));
    const centres: Array<[number, number]> = [
      [0.22, 0.66], [0.5, 0.66], [0.78, 0.66], [0.36, 0.30], [0.64, 0.30],
    ];
    for (const [px, py] of centres) {
      context.beginPath();
      context.arc(x + width * px, y + height * py, radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
  } else if (kind === 'service-skip') {
    context.fillStyle = 'rgba(225, 171, 52, .78)';
    context.beginPath();
    context.moveTo(x + inset, y);
    context.lineTo(x + width - inset, y);
    context.lineTo(x + width, y + height);
    context.lineTo(x, y + height);
    context.closePath();
    context.fill();
    context.stroke();
    context.strokeStyle = 'rgba(7, 15, 18, .82)';
    context.beginPath();
    context.moveTo(x + inset, y + height * 0.34);
    context.lineTo(x + width - inset, y + height * 0.34);
    context.stroke();
  } else if (kind === 'jetliner') {
    context.fillStyle = 'rgba(226, 240, 244, .78)';
    context.beginPath();
    context.ellipse(x + width / 2, y + height / 2, Math.max(3, width / 2), Math.max(3, height / 2), 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else if (kind === 'terminal') {
    context.fillStyle = 'rgba(56, 178, 165, .62)';
    context.fillRect(x, y, width, Math.max(3, height));
    context.strokeRect(x, y, width, Math.max(3, height));
  } else if (kind === 'fuel') {
    context.fillStyle = 'rgba(217, 159, 46, .82)';
    context.beginPath();
    context.ellipse(x + width / 2, y + height / 2, Math.max(3, width / 2), Math.max(3, height / 2), 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  } else {
    context.fillStyle = 'rgba(232, 203, 92, .74)';
    context.fillRect(x + inset, y + inset, width - inset * 2, height - inset * 2);
    context.strokeRect(x + inset, y + inset, width - inset * 2, height - inset * 2);
    context.fillStyle = '#10232a';
    const wheelRadius = Math.max(2.3, Math.min(width, height) * 0.13);
    for (const wheelX of [x + width * 0.24, x + width * 0.76]) {
      context.beginPath();
      context.arc(wheelX, y + height - inset * 0.45, wheelRadius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function updateMinimap(now: number): void {
  minimapRenderCount += 1;
  const context = minimapContext;
  const width = minimapCanvas.width;
  const height = minimapCanvas.height;
  const bounds = arena.bounds;
  const point = (x: number, z: number): [number, number] => worldToMinimap(x, z, bounds, width, height);
  context.clearRect(0, 0, width, height);
  context.fillStyle = 'rgba(7, 15, 18, .86)';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(244, 196, 79, .62)';
  context.lineWidth = 4;
  context.strokeRect(4, 4, width - 8, height - 8);

  const [worldPlayerX, worldPlayerY] = point(player.position.x, player.position.z);
  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(playerUpRotationRadians(player.yaw));
  context.scale(playerUpScaleX(), 1);
  context.translate(-worldPlayerX, -worldPlayerY);

  const renderedLandmarks: Array<{ id: string; kind: MinimapLandmarkKind; label: string }> = [];
  const landmarkLabels: Array<{ label: string; x: number; y: number }> = [];
  if (selectedArena.id === 'atomic-acres') {
    const [roadLeft] = point(-10.25, 0);
    const [roadRight] = point(10.25, 0);
    context.fillStyle = 'rgba(126, 137, 132, .23)';
    context.fillRect(roadLeft, 4, roadRight - roadLeft, height - 8);
    context.strokeStyle = 'rgba(244, 196, 79, .42)';
    context.lineWidth = 2;
    context.setLineDash([10, 10]);
    context.beginPath(); context.moveTo(width / 2, 4); context.lineTo(width / 2, height - 4); context.stroke();
    context.setLineDash([]);
    for (const house of arena.houses) {
      const [cx, cy] = point(house.origin.x, house.origin.z);
      const houseWidth = (house.dimensions.width / (bounds.maxX - bounds.minX)) * width;
      const houseHeight = (house.dimensions.depth / (bounds.maxZ - bounds.minZ)) * height;
      context.fillStyle = house.team === 0 ? 'rgba(88, 227, 220, .24)' : 'rgba(255, 118, 95, .24)';
      context.strokeStyle = house.team === 0 ? 'rgba(88, 227, 220, .7)' : 'rgba(255, 118, 95, .7)';
      context.lineWidth = 2;
      context.fillRect(cx - houseWidth / 2, cy - houseHeight / 2, houseWidth, houseHeight);
      context.strokeRect(cx - houseWidth / 2, cy - houseHeight / 2, houseWidth, houseHeight);
    }
    for (const cover of arena.physicalCover) {
      const kind = physicalCoverMinimapKind(cover.id, cover.performanceVisualKind);
      if (!kind) continue;
      const footprint = minimapLandmarkFootprint(cover.bounds, bounds, width, height);
      drawMinimapLandmark(context, cover.id, kind, footprint);
      const label = minimapLandmarkLabel(kind);
      const centre = context.getTransform().transformPoint(new DOMPoint(
        footprint.x + footprint.width / 2,
        footprint.y + footprint.height / 2,
      ));
      landmarkLabels.push({ label, x: centre.x, y: centre.y - 10 });
      renderedLandmarks.push({ id: cover.id, kind, label });
    }
  } else {
    context.lineWidth = 1.5;
    context.fillStyle = selectedArena.id === 'gun-range' ? 'rgba(244, 196, 79, .18)' : 'rgba(170, 113, 72, .28)';
    context.strokeStyle = selectedArena.id === 'gun-range' ? 'rgba(244, 196, 79, .6)' : 'rgba(221, 164, 111, .65)';
    for (const collider of arena.colliders) {
      const footprint = minimapLandmarkFootprint(collider, bounds, width, height);
      context.fillRect(footprint.x, footprint.y, footprint.width, footprint.height);
      context.strokeRect(footprint.x, footprint.y, footprint.width, footprint.height);
    }
    for (const cover of arena.physicalCover) {
      const kind = physicalCoverMinimapKind(cover.id, cover.performanceVisualKind);
      if (!kind) continue;
      const footprint = minimapLandmarkFootprint(cover.bounds, bounds, width, height);
      drawMinimapLandmark(context, cover.id, kind, footprint);
      const label = minimapLandmarkLabel(kind);
      const centre = context.getTransform().transformPoint(new DOMPoint(
        footprint.x + footprint.width / 2,
        footprint.y + footprint.height / 2,
      ));
      landmarkLabels.push({ label, x: centre.x, y: centre.y - 10 });
      renderedLandmarks.push({ id: cover.id, kind, label });
    }
    for (const target of arena.targets) {
      const [x, y] = point(target.root.position.x, target.root.position.z);
      context.fillStyle = target.distanceBand === 'near' ? '#58e3dc' : target.distanceBand === 'mid' ? '#f4c44f' : '#ff765f';
      context.beginPath(); context.arc(x, y, target.active ? 5 : 2.5, 0, Math.PI * 2); context.fill();
    }
  }
  minimapLandmarksRendered = renderedLandmarks;
  for (const remote of remotes.values()) {
    const friendly = privateMatchMode === 'tdm' && remote.snapshot.team === player.team;
    const scoutActive = scoutSweepPulseVisible(now, scoutSweepUntil);
    if (!friendly && !scoutActive && remote.target.distanceTo(player.position) > 15) continue;
    const [x, y] = point(remote.target.x, remote.target.z);
    context.fillStyle = friendly ? '#58e3dc' : '#ff765f';
    context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill();
  }
  for (const bot of bots.values()) {
    if (!bot.alive || !scoutSweepPulseVisible(now, scoutSweepUntil) && !shouldRevealEnemy(bot.position.distanceTo(player.position), now, bot.lastShotAt)) continue;
    const [x, y] = point(bot.position.x, bot.position.z);
    context.fillStyle = '#ff765f';
    context.beginPath(); context.arc(x, y, 6, 0, Math.PI * 2); context.fill();
  }
  if (selectedArena.overdrive && overdriveState.available) {
    const [x, y] = point(OVERDRIVE_POSITION.x, OVERDRIVE_POSITION.z);
    context.save();
    context.translate(x, y);
    const pulse = 15 + Math.sin(now * 0.006) * 2;
    context.fillStyle = '#7864dc';
    context.strokeStyle = '#79f3eb';
    context.lineWidth = 4;
    context.beginPath(); context.arc(0, 0, pulse, 0, Math.PI * 2); context.fill(); context.stroke();
    context.fillStyle = '#fff7ff';
    context.font = '900 15px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('2×', 0, 1);
    context.restore();
    context.textBaseline = 'alphabetic';
  }
  context.restore();
  context.save();
  context.font = '900 15px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'bottom';
  context.lineJoin = 'round';
  context.lineWidth = 4;
  context.strokeStyle = 'rgba(7, 15, 18, .94)';
  context.fillStyle = '#fff1bd';
  for (const label of landmarkLabels) {
    if (label.x < 18 || label.x > width - 18 || label.y < 22 || label.y > height - 8) continue;
    context.strokeText(label.label, label.x, label.y);
    context.fillText(label.label, label.x, label.y);
  }
  context.restore();
  const px = width / 2;
  const py = height / 2;
  const facing = playerFacingGeometry(px, py, Math.PI);
  context.fillStyle = player.team === 0 ? 'rgba(88, 227, 220, .18)' : 'rgba(255, 118, 95, .18)';
  context.beginPath();
  context.moveTo(px, py);
  context.lineTo(...facing.coneLeft);
  context.lineTo(...facing.coneRight);
  context.closePath();
  context.fill();
  context.fillStyle = player.team === 0 ? '#58e3dc' : '#ff765f';
  context.strokeStyle = '#fff7df';
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(...facing.nose);
  context.lineTo(...facing.right);
  context.lineTo(...facing.tail);
  context.lineTo(...facing.left);
  context.closePath();
  context.fill();
  context.stroke();
  context.strokeStyle = '#10232a';
  context.lineWidth = 3;
  context.beginPath(); context.moveTo(...facing.tail); context.lineTo(...facing.nose); context.stroke();
  context.fillStyle = '#fff7df';
  context.beginPath(); context.arc(px, py, 4.5, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#fff7df';
  context.font = '900 22px sans-serif';
  context.textAlign = 'center';
  const [northX, northY] = northMarkerPosition(player.yaw, width, height);
  context.fillText('N', northX, northY + 7);
  element<HTMLElement>('#map-heading').textContent = `PLAYER UP · ${String(headingDegrees(player.yaw)).padStart(3, '0')}°`;
}

function updateHud(now: number): void {
  // DOM reconstruction can stay at 10 Hz. The rotating minimap is intentionally
  // drawn from frame() so camera-relative direction remains smooth and accurate.
  if (now - lastHudAt < 100) return;
  lastHudAt = now;
  if (gameStarted) updateMatchState(now);
  const spec = WEAPONS[player.weapon];
  const speed = Math.hypot(player.velocity.x, player.velocity.z);
  const adsSettled = adsHeld && weaponView.adsProgress() >= 0.9;
  const spread = computeSpread(spec, {
    ads: adsSettled,
    moving: speed > 1.2,
    crouched: player.stance === 'crouch',
    prone: player.stance === 'prone',
    sustainedShots: player.sustainedShots,
  });
  const crosshairGap = THREE.MathUtils.clamp(5 + spread * 320, 5, 23);
  const crosshair = element<HTMLElement>('#crosshair');
  crosshair.style.setProperty('--spread', `${crosshairGap}px`);
  crosshair.classList.toggle('ads', adsSettled);
  const [aqua, coral] = teamScores();
  const scores: [number, number] = [aqua, coral];
  const presentation = matchPresentationAt(matchState, now, scores, player.team, currentMatchRules(), arena.label);
  const ffaHud = gameMode !== 'solo' && privateMatchMode === 'ffa';
  const orderedFfa = ffaHud ? freeForAllLeaders([...authoritativeScores.values()]) : [];
  const localFfaScore = authoritativeScores.get(player.id)?.kills ?? player.kills;
  const leaderFfaScore = orderedFfa[0]?.kills ?? 0;
  const arenaZone = classifyArenaZone(player.position.x, player.position.z);
  element<HTMLElement>('#location-label').textContent = selectedArena.id === 'atomic-acres'
    ? arenaZoneLabel(arenaZone)
    : arena.label.toUpperCase();
  audio.setArenaZone(arenaZone);
  element<HTMLElement>('#health').textContent = String(Math.ceil(player.hp));
  element<HTMLElement>('#health-fill').style.width = `${player.hp}%`;
  const localScore = authoritativeScores.get(player.id) ?? emptyPlayerScore(player.id);
  element<HTMLElement>('#damage-dealt').textContent = String(gameMode === 'solo' ? Math.round(roundDamageDealt) : localScore.damageDealt);
  element<HTMLElement>('#damage-taken').textContent = String(gameMode === 'solo' ? Math.round(roundDamageTaken) : localScore.damageTaken);
  renderMatchNetworkStrip();
  element<HTMLElement>('#weapon-name').textContent = spec.name.toUpperCase();
  element<HTMLElement>('#ammo').textContent = String(player.ammo[player.weapon]);
  element<HTMLElement>('#reserve').textContent = reserveHudValue(selectedArena.id, player.reserve[player.weapon]);
  const aquaScore = element<HTMLElement>('#aqua-score');
  const coralScore = element<HTMLElement>('#coral-score');
  const hudScores: [number, number] = selectedArena.id === 'gun-range'
    ? [rangeScore, targetHits]
    : ffaHud ? [localFfaScore, leaderFfaScore] : scores;
  element<HTMLElement>('#match-mode-label').textContent = ffaHud ? 'FREE FOR ALL' : selectedArena.id === 'gun-range' ? 'TARGET DRILL' : 'TEAM DEATHMATCH';
  element<HTMLElement>('#aqua-label').textContent = selectedArena.id === 'gun-range' ? 'SCORE' : ffaHud ? 'YOU' : 'AQUA';
  element<HTMLElement>('#coral-label').textContent = selectedArena.id === 'gun-range' ? 'HITS' : ffaHud ? 'LEADER' : 'CORAL';
  aquaScore.textContent = String(hudScores[0]);
  coralScore.textContent = String(hudScores[1]);
  hudScores.forEach((score, team) => {
    if (score === previousHudScores[team]) return;
    const scoreElement = team === 0 ? aquaScore : coralScore;
    scoreElement.classList.remove('score-pulse');
    requestAnimationFrame(() => scoreElement.classList.add('score-pulse'));
  });
  previousHudScores = hudScores;
  element<HTMLElement>('#timer').textContent = presentation.timer;
  element<HTMLElement>('#objective').textContent = selectedArena.id === 'gun-range'
    ? `GUN RANGE · SCORE ${rangeScore} · ${targetHits} HITS`
    : ffaHud
      ? `FREE FOR ALL · PLACE #${Math.max(1, orderedFfa.findIndex((entry) => entry.id === player.id) + 1)} · ${localFfaScore} KILLS`
      : presentation.objective;
  if (!player.alive && respawnEndsAt > 0) {
    element<HTMLElement>('#respawn-countdown').textContent = respawnPresentation(respawnEndsAt, now);
  }
  const reloadStateElement = element<HTMLElement>('#reload-state');
  reloadStateElement.textContent = player.reloadState
    ? `RELOADING ${Math.max(0, (player.reloadState.endsAt - now) / 1000).toFixed(1)}s`
    : selectedArena.id === 'gun-range'
      ? `SCORE ${rangeScore} · ${targetHits} TARGETS HIT`
      : gameMode === 'solo' ? `${player.kills} K / ${player.deaths} D · ${targetHits} TARGETS` : `${player.kills} K / ${player.deaths} D`;
  reloadStateElement.classList.toggle('active', player.reloadState !== null);
  element<HTMLElement>('#stance').textContent = player.stance.toUpperCase();
  element<HTMLElement>('#grenades').textContent = `FRAG ×${player.grenades}`;
  updateFieldSupportHud();
  element<HTMLElement>('#health-block').classList.toggle('critical', player.hp <= 30);
  if (!element<HTMLElement>('#roster').hidden) updateRoster();
}

function renderMatchNetworkStrip(): void {
  const strip = element<HTMLElement>('#network-strip');
  if (gameMode === 'solo') {
    strip.hidden = true;
    strip.innerHTML = '';
    return;
  }
  const members = privateLobbySnapshot?.members ?? [];
  strip.hidden = members.length === 0;
  strip.innerHTML = members.filter((member) => member.connected).map((member) => {
    const ping = member.id === player.id && network.role === 'client' ? localLobbyPingMs : member.pingMs;
    const quality = latencyQuality(ping);
    const label = ping === null ? '—' : `${Math.round(ping)} ms`;
    const score = authoritativeScores.get(member.id);
    const range = selectedArena.id === 'gun-range'
      ? ` · ${score?.rangeScore ?? 0} PTS · ${rangeAccuracyPercent(score?.rangeHits ?? 0, score?.rangeShots ?? 0)}%`
      : '';
    return `<span class="latency-${quality}" title="${escapeHtml(member.name)} · DHV ${member.dhv} · latency ${label}${range}"><b>${escapeHtml(member.name)}</b>${range || ` · DHV ${member.dhv} · ${label}`}</span>`;
  }).join('');
}

function updateRoster(): void {
  const entries = [
    snapshot(),
    ...[...remotes.values()].map((remote) => remote.snapshot),
    ...[...bots.values()].map((bot) => ({
      id: bot.id, name: bot.name, team: bot.team, x: bot.position.x, y: bot.position.y, z: bot.position.z,
      yaw: bot.root.rotation.y, pitch: 0, hp: bot.hp, kills: bot.kills, deaths: bot.deaths, primary: bot.weapon, weapon: bot.weapon, seq: 0,
    })),
  ].sort((a, b) => selectedArena.id === 'gun-range'
    ? (authoritativeScores.get(b.id)?.rangeScore ?? (b.id === player.id ? rangeScore : 0))
      - (authoritativeScores.get(a.id)?.rangeScore ?? (a.id === player.id ? rangeScore : 0))
    : b.kills - a.kills || a.deaths - b.deaths);
  element<HTMLElement>('#roster-list').innerHTML = entries.map((entry) => {
    const score = authoritativeScores.get(entry.id) ?? emptyPlayerScore(entry.id);
    const member = privateLobbySnapshot?.members.find((candidate) => candidate.id === entry.id);
    const ping = member?.id === player.id && network.role === 'client' ? localLobbyPingMs : member?.pingMs ?? null;
    const latency = ping === null ? '—' : `${Math.round(ping)}ms`;
    if (selectedArena.id === 'gun-range') {
      const points = score.rangeScore ?? (entry.id === player.id ? rangeScore : 0);
      const hits = score.rangeHits ?? (entry.id === player.id ? targetHits : 0);
      const shots = score.rangeShots ?? (entry.id === player.id ? rangeShotsFired : 0);
      const title = `${entry.name}: ${points} points, ${hits} hits, ${rangeAccuracyPercent(hits, shots)}% accuracy, ${shots} shots`;
      return `<div title="${escapeHtml(title)}"><span class="aqua">${escapeHtml(entry.name)}</span><b>${points}</b><i>${hits}</i><strong>${rangeAccuracyPercent(hits, shots)}% ACC</strong><small>${shots} SHOTS</small><em>${latency}</em></div>`;
    }
    const title = `${entry.name}: ${entry.kills} kills, ${entry.deaths} deaths, ${score.damageDealt} damage dealt, ${score.damageTaken} damage taken, ${latency} ping`;
    return `<div title="${escapeHtml(title)}"><span class="${entry.team === 0 ? 'aqua' : 'coral'}">${escapeHtml(entry.name)}</span><b>${entry.kills}</b><i>${entry.deaths}</i><strong>${score.damageDealt} / ${score.damageTaken} DMG</strong><small>${latency}</small><em>${entry.hp > 0 ? Math.ceil(entry.hp) + ' HP' : 'DOWN'}</em></div>`;
  }).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  atomicSignal.resize();
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const launchParams = new URLSearchParams(window.location.search);
const invitedRoom = launchParams.get('room')?.trim() ?? '';
if (invitedRoom) element<HTMLInputElement>('#room-input').value = invitedRoom;
const invitedName = launchParams.get('name');
const normalizedInvitedName = normalizeRequiredPlayerName(invitedName ?? '');
if (normalizedInvitedName) element<HTMLInputElement>('#player-name').value = normalizedInvitedName;
const teamSelect = element<HTMLSelectElement>('#team');
const invitedTeam = launchParams.get('team');
let teamSelectionTouched = invitedTeam === '0' || invitedTeam === '1';
if (teamSelectionTouched) teamSelect.value = invitedTeam!;
teamSelect.addEventListener('change', () => { teamSelectionTouched = true; });

const sensitivityInput = element<HTMLInputElement>('#sensitivity');
const controllerSensitivityInput = element<HTMLInputElement>('#controller-sensitivity');
const fovInput = element<HTMLInputElement>('#field-of-view');
const graphicsProfileInput = element<HTMLSelectElement>('#graphics-profile');
const storedRange = (key: string, fallback: number, minimum: number, maximum: number): number => {
  const parsed = Number(localStorage.getItem(key));
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};
sensitivity = storedRange('atomic-acres-sensitivity', Number(sensitivityInput.value), 0.6, 2);
controllerSensitivity = storedRange('atomic-acres-controller-sensitivity', Number(controllerSensitivityInput.value), 0.5, 1.8);
preferredFov = storedRange('atomic-acres-fov', Number(fovInput.value), 70, 100);
sensitivityInput.value = String(sensitivity);
controllerSensitivityInput.value = String(controllerSensitivity);
fovInput.value = String(preferredFov);
// Compatibility remains query-only for diagnostic QA; players choose only
// Performance or the fully Blender-authored environment presentation.
graphicsProfileInput.value = renderProfile === 'blender' ? 'blender' : 'performance';
sensitivityInput.addEventListener('input', () => {
  sensitivity = Number(sensitivityInput.value);
  localStorage.setItem('atomic-acres-sensitivity', String(sensitivity));
});
controllerSensitivityInput.addEventListener('input', () => {
  controllerSensitivity = Number(controllerSensitivityInput.value);
  localStorage.setItem('atomic-acres-controller-sensitivity', String(controllerSensitivity));
});
fovInput.addEventListener('input', () => {
  preferredFov = Number(fovInput.value);
  localStorage.setItem('atomic-acres-fov', String(preferredFov));
});
graphicsProfileInput.addEventListener('change', () => {
  const value = graphicsProfileInput.value;
  const selected: RenderProfile = value === 'blender' ? 'blender' : 'performance';
  localStorage.setItem(RENDER_PROFILE_STORAGE_KEY, selected);
  const next = new URL(window.location.href);
  if (selected === 'performance') next.searchParams.delete('render');
  else next.searchParams.set('render', selected);
  window.location.assign(next);
});

const GAMEPAD_SUPPORT_LABELS: Record<FieldSupportId, string> = {
  'scout-sweep': 'SCOUT SWEEP',
  yardhawk: 'YARDHAWK',
  'tri-pass': 'TRI-PASS',
  'hunter-swarm': 'HUNTER SWARM',
  nuke: 'NUKE',
};

function selectGamepadSupport(direction: -1 | 1): void {
  gamepadSupportSelection = cycleFieldSupportSelection(gamepadSupportSelection, direction);
  addFeed(`PAD SUPPORT · ${GAMEPAD_SUPPORT_LABELS[gamepadSupportSelection]}`, 'gold');
  updateFieldSupportHud();
}

function pollGamepad(dt: number): void {
  const pad = navigator.getGamepads?.().find((candidate): candidate is Gamepad => Boolean(candidate && candidate.connected));
  if (!pad) {
    gamepadMove = { x: 0, y: 0 };
    gamepadLookRate = { yaw: 0, pitch: 0 };
    gamepadSprint = false;
    previousGamepadButtons = [];
    triggerHeld = mouseTriggerHeld;
    adsHeld = debugAdsOverride ?? mouseAdsHeld;
    return;
  }
  const shapedMove = applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.14, 1.6);
  const look = applyRadialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.1, 1.6);
  const buttons = pad.buttons.map((button) => button.pressed || button.value > 0.55);
  const pressed = (index: number) => buttons[index] && !previousGamepadButtons[index];
  const padAds = Boolean(buttons[6]) || (pad.buttons[6]?.value ?? 0) > 0.22;
  const padTrigger = Boolean(buttons[7]) || (pad.buttons[7]?.value ?? 0) > 0.22;
  const canControlPlayer = gameplayInputEnabled();
  if (!padTrigger) gamepadTriggerArmed = true;
  else if (!canControlPlayer) gamepadTriggerArmed = false;
  if (!padAds) gamepadAdsArmed = true;
  else if (!canControlPlayer) gamepadAdsArmed = false;
  const padTriggerActive = canControlPlayer && padTrigger && gamepadTriggerArmed;
  const padAdsActive = canControlPlayer && padAds && gamepadAdsArmed;
  gamepadSprint = canControlPlayer && Boolean(buttons[10]);
  adsHeld = debugAdsOverride ?? (mouseAdsHeld || padAdsActive);
  triggerHeld = mouseTriggerHeld || padTriggerActive;
  gamepadMove = canControlPlayer ? shapedMove : { x: 0, y: 0 };
  gamepadLookRate = integrateGamepadLookRate(
    gamepadLookRate,
    canControlPlayer ? look : { x: 0, y: 0 },
    dt,
    adsHeld,
    controllerSensitivity,
  );
  if (canControlPlayer) {
    player.yaw -= gamepadLookRate.yaw * dt;
    player.pitch = THREE.MathUtils.clamp(player.pitch - gamepadLookRate.pitch * dt, -1.42, 1.42);
    if (pressed(0)) {
      if (player.stance !== 'stand') requestStance('stand');
      jumpQueuedAt = performance.now();
    }
    if (pressed(1)) requestStance('toggle-crouch');
    if (pressed(13)) requestStance('toggle-prone');
    if (pressed(2)) reload();
    if (pressed(3)) switchWeapon(player.weapon === player.primaryWeapon ? 1 : 0);
    if (pressed(4)) throwGrenade();
    if (pressed(5)) melee();
    if (pressed(14)) selectGamepadSupport(-1);
    if (pressed(15)) selectGamepadSupport(1);
    if (pressed(12)) activateFieldSupport(gamepadSupportSelection);
  }
  previousGamepadButtons = buttons;
}

window.addEventListener('keydown', (event) => {
  if (tacticalMapOpen && event.code === 'Escape' && !event.repeat) {
    event.preventDefault();
    cancelTriPassTargeting(true);
    return;
  }
  if (gameplayInputEnabled()) keys.add(event.code);
  else if (event.code !== 'Tab') return;
  if (event.code === 'Space' && !event.repeat) {
    if (player.stance !== 'stand') requestStance('stand');
    jumpQueuedAt = performance.now();
  }
  if (event.code === 'KeyC' && !event.repeat) requestStance('toggle-crouch');
  if ((event.code === 'KeyZ' || event.code === 'ControlLeft') && !event.repeat) requestStance('toggle-prone');
  if (event.code === 'Digit1') switchWeapon(0);
  if (event.code === 'Digit2') switchWeapon(1);
  if (event.code === 'Digit3' && !event.repeat) activateFieldSupport('scout-sweep');
  if (event.code === 'Digit4' && !event.repeat) activateFieldSupport('yardhawk');
  if (event.code === 'Digit5' && !event.repeat) activateFieldSupport('tri-pass');
  if (event.code === 'Digit6' && !event.repeat) activateFieldSupport('hunter-swarm');
  if (event.code === 'Digit7' && !event.repeat) activateFieldSupport('nuke');
  if (event.code === 'KeyR') reload();
  if (event.code === 'KeyV' && !event.repeat) melee();
  if (event.code === 'KeyG' && !event.repeat) throwGrenade();
  if (event.code === 'KeyF' && !event.repeat) interactWithWeaponPickup();
  if (event.code === 'KeyT' && !event.repeat) sendTeamPing('enemy');
  if (event.code === 'KeyY' && !event.repeat) sendTeamPing('regroup');
  if (event.code === 'KeyU' && !event.repeat) sendTeamPing('push');
  if (event.code === 'KeyI' && !event.repeat) sendTeamPing('nice');
  if (event.code === 'Tab') {
    event.preventDefault();
    updateRoster();
    element<HTMLElement>('#roster').hidden = false;
  }
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Tab') element<HTMLElement>('#roster').hidden = true;
});
window.addEventListener('blur', () => {
  lastWindowBlurAt = performance.now();
  clearGameplayInput();
});
window.addEventListener('focus', () => {
  if (gameStarted && player.alive && !matchFinished) menu.classList.add('hidden');
});
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas || !player.alive) return;
  const aimScale = mouseSensitivityMultiplier(adsHeld, currentSprinting);
  player.yaw -= event.movementX * 0.00215 * sensitivity * aimScale;
  player.pitch = Math.max(-1.42, Math.min(1.42, player.pitch - event.movementY * 0.0019 * sensitivity * aimScale));
  weaponView.addMouseDelta(event.movementX, event.movementY);
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('mousedown', (event) => {
  if (document.pointerLockElement !== canvas) {
    requestGamePointerLock();
    return;
  }
  if (event.button === 2) {
    mouseAdsHeld = true;
    adsHeld = true;
    return;
  }
  if (event.button !== 0) return;
  mouseTriggerHeld = true;
  triggerHeld = true;
  tryFire(performance.now());
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) mouseTriggerHeld = false;
  if (event.button === 2) mouseAdsHeld = false;
  triggerHeld = mouseTriggerHeld;
  adsHeld = mouseAdsHeld;
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) {
    clearGameplayInput();
    if (tacticalMapOpen) {
      menu.classList.add('hidden');
      return;
    }
    if (gameStarted && player.alive && !matchFinished) {
      const focusTransition = !document.hasFocus() || performance.now() - lastWindowBlurAt < 300;
      if (focusTransition) {
        // Losing pointer lock because another tab/app took focus must not pause
        // a host or guest. The canvas click handler recaptures controls on return.
        menu.classList.add('hidden');
        return;
      }
      element<HTMLButtonElement>('#resume').hidden = false;
      element<HTMLButtonElement>('#main-menu').hidden = false;
      menu.classList.remove('hidden');
    }
  } else {
    element<HTMLButtonElement>('#resume').hidden = true;
    element<HTMLButtonElement>('#main-menu').hidden = true;
    menu.classList.add('hidden');
  }
});

function syncArenaSelectionUi(): void {
  const lobbyArenaLocked = network.role !== 'offline' || privateLobbySnapshot !== null;
  const rangeArmoryMode = selectedArena.id === 'gun-range';
  const fieldKitTab = element<HTMLButtonElement>('[data-menu-tab="kit"]');
  fieldKitTab.hidden = rangeArmoryMode;
  fieldKitTab.disabled = rangeArmoryMode;
  if (rangeArmoryMode && fieldKitTab.classList.contains('active')) setMenuTab('deploy');
  for (const button of document.querySelectorAll<HTMLButtonElement>('.map-card[data-arena-id]')) {
    const selected = button.dataset.arenaId === selectedArena.id;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    button.disabled = !arenaSelectionReady || gameStarted || lobbyArenaLocked;
  }
  const soloButton = element<HTMLButtonElement>('#solo');
  const hostButton = element<HTMLButtonElement>('#host');
  const joinButton = element<HTMLButtonElement>('#join');
  soloButton.textContent = selectedArena.id === 'gun-range' ? 'START RANGE' : selectedArena.id === 'rustworks-1v1' ? '1 BOT SKIRMISH' : 'BOT SKIRMISH';
  hostButton.textContent = 'HOST LOBBY';
  soloButton.disabled = !arenaSelectionReady;
  hostButton.disabled = !arenaSelectionReady || !selectedArena.multiplayer || !webRtcSupported;
  joinButton.disabled = !arenaSelectionReady || !selectedArena.multiplayer || !webRtcSupported;
  element<HTMLInputElement>('#room-input').disabled = !selectedArena.multiplayer;
  element<HTMLElement>('#arena-title').innerHTML = selectedArena.id === 'atomic-acres'
    ? 'ATOMIC <span>ACRES</span>'
    : selectedArena.id === 'rustworks-1v1'
      ? 'RUST<span>WORKS</span>'
      : selectedArena.id === 'gun-range'
        ? 'GUN <span>RANGE</span>'
        : 'SKYLINE <span>TERMINAL</span>';
  element<HTMLElement>('#arena-lede').textContent = selectedArena.id === 'atomic-acres'
    ? 'Fight through an authored living neighbourhood with physical transit cover, tactical viewmodels, atmospheric dust and a contested 2× Quad Damage Core.'
    : selectedArena.id === 'rustworks-1v1'
      ? 'Host private industrial tower matches for up to six, or solo a single bot through the climbable central plant and yard cover.'
      : selectedArena.id === 'gun-range'
        ? 'Explore the indoor armory, pick a weapon from a bench, then work the 100 / 200 / 300 point lanes.'
        : 'Fight through an original airport concourse and jetliner apron with security chokes, a narrow gangway, and open tarmac sightlines.';
  renderFieldKitSelection();
}

function setArenaPresentationVisibility(): void {
  const atomicVisible = selectedArena.id === 'atomic-acres';
  const rustworksVisible = selectedArena.id === 'rustworks-1v1';
  for (const candidate of Object.values(arenaById)) {
    candidate.root.visible = candidate.id === selectedArena.id;
    if (candidate === atomicArena) candidate.root.visible = proceduralArenaRootVisible(selectedArena.id, blenderArenaActive);
  }
  worldIdentityPresentation.root.visible = atomicVisible;
  setWorldIdentityHouseShellPresentation(worldIdentityPresentation.root, atomicVisible && !blenderArenaActive);
  neighbourhoodLifeRoot.visible = atomicVisible;
  // Rustworks' ocean needs a long view frustum so water, not void, meets the horizon.
  const desiredFarPlane = rustworksVisible ? 1_400 : 180;
  if (camera.far !== desiredFarPlane) {
    camera.far = desiredFarPlane;
    camera.updateProjectionMatrix();
  }
  atmosphereSystem.setArena(selectedArena.id);
  atmosphereSystem.root.visible = atmosphereSystem.telemetry().enabled;
  waterSystem.configure(selectedArena.id, renderProfile, {
    halfX: Math.max(Math.abs(arena.bounds.minX), Math.abs(arena.bounds.maxX)),
    halfZ: Math.max(Math.abs(arena.bounds.minZ), Math.abs(arena.bounds.maxZ)),
  }, { night: selectedArena.id === 'rustworks-1v1', waterLevel: selectedArena.id === 'rustworks-1v1' ? -19.5 : -0.55 });
  ensureRustworksStarfield(scene, selectedArena.id);
  applyArenaFogProfile();
  applyArenaLightingForSelection();
  setRustworksQualityPresentationActive(rustworksVisible, renderProfile);
  applyAdditionalMapPresentationProfile(skylineTerminalArena.root, renderProfile);
  if (rustworksVisible) {
    if (renderProfile === 'blender' && rustworksBlenderTelemetry().status === 'ready') {
      setRustworksProceduralPresentationVisible(rustworksArena.root, false);
    } else {
      applyRustworksPresentationProfile(rustworksArena.root, renderProfile);
      setRustworksProceduralPresentationVisible(rustworksArena.root, true);
    }
  }
  grassSystem.root.visible = atomicVisible;
  if (arenaArtRoot) arenaArtRoot.visible = atomicVisible;
  overdriveRoot.visible = false;
  if (activeRenderConfig.shadowMode === 'static') renderer.shadowMap.needsUpdate = true;
  atomicSignal.invalidateValidation();
}

function applyArenaLightingForSelection(): void {
  activeLighting = arenaLightingProfile(renderProfile, selectedArena.id);
  const lighting = rustworksLightingTint(activeLighting, renderProfile, selectedArena.id);
  renderer.toneMappingExposure = lighting.exposure;
  if (scene.fog instanceof THREE.Fog) scene.fog.color.setHex(lighting.fogColor);
  if (skyMaterial) {
    skyMaterial.uniforms.top.value.setHex(lighting.skyTop);
    skyMaterial.uniforms.horizon.value.setHex(lighting.skyHorizon);
    skyMaterial.uniforms.bottom.value.setHex(lighting.skyBottom);
    skyMaterial.uniforms.sunColor.value.setHex(lighting.skySun);
    skyMaterial.uniforms.cloudColor.value.setHex(lighting.skyCloud);
    skyMaterial.uniforms.cloudShadow.value.setHex(lighting.skyCloudShadow);
    skyMaterial.uniforms.cloudLight.value.setHex(lighting.skyCloudLight);
    skyMaterial.uniforms.rayStrength.value = (raysQuery === 'off' || (softwareRenderer && raysQuery !== 'on'))
      ? 0
      : lighting.godRayStrength;
    skyMaterial.uniforms.rayLobes.value = skyMaterial.uniforms.rayStrength.value > 0 ? lighting.godRayLobes : 0;
  }
  if (hemisphereLight) {
    hemisphereLight.color.setHex(lighting.hemisphereSky);
    hemisphereLight.groundColor.setHex(lighting.hemisphereGround);
    hemisphereLight.intensity = lighting.hemisphereIntensity;
  }
  if (ambientLight) {
    ambientLight.color.setHex(lighting.ambientColor);
    ambientLight.intensity = lighting.ambientIntensity;
  }
  if (sunLight) {
    sunLight.color.setHex(lighting.sunColor);
    sunLight.intensity = lighting.sunIntensity;
    sunLight.position.set(...lighting.sunPosition);
    graphicsRefinement.applyArena(
      selectedArena.id,
      arena.bounds,
      sunLight,
      lighting.sunPosition,
      renderer.shadowMap.enabled ? activeRenderConfig.shadowMapSize : 0,
    );
  }
  if (fillLight) {
    fillLight.color.setHex(lighting.fillColor);
    fillLight.intensity = lighting.fillIntensity;
    fillLight.position.set(...lighting.fillPosition);
  }
}

function setArenaMenuCamera(): void {
  const centreX = (arena.bounds.minX + arena.bounds.maxX) / 2;
  const centreZ = (arena.bounds.minZ + arena.bounds.maxZ) / 2;
  if (selectedArena.id === 'gun-range') {
    camera.position.set(17, 5.35, 17.5);
    camera.lookAt(0, 1.65, -28);
  } else if (selectedArena.id === 'rustworks-1v1') {
    // Keep the tall tower on the unobstructed right side of the deployment panel.
    camera.position.set(18, 20, -28);
    camera.lookAt(centreX + 14, 5.8, centreZ);
  } else if (selectedArena.id === 'skyline-terminal') {
    // Compose the facade, jetbridge and aircraft from the open apron. The old
    // high concourse camera could sit behind dark roof/soffit geometry and
    // leave the deploy-menu preview black even after selection completed.
    camera.position.set(29, 10.5, 27);
    camera.lookAt(1.5, 3.35, -6);
  } else {
    camera.position.set(centreX, 31, centreZ - 22);
    camera.lookAt(centreX, 0.8, centreZ);
  }
  camera.fov = 65;
  camera.updateProjectionMatrix();
}

async function performArenaSelection(id: ArenaId): Promise<void> {
  if (gameStarted || !arenaSelectionReady || id === selectedArena.id) return;
  const nextSelection = arenaSelection(id);
  const previousSelection = selectedArena;
  const previousArena = arena;
  const previousPhysics = characterPhysics;
  let nextPhysics: CharacterPhysics | null = null;
  arenaSelectionReady = false;
  syncArenaSelectionUi();
  setStatus(`Loading ${nextSelection.displayName} collision…`);
  try {
    const nextArena = arenaById[nextSelection.id];
    if (localArenaSwitchQaDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, localArenaSwitchQaDelayMs));
    }
    nextPhysics = await CharacterPhysics.create(nextArena.physicsColliders, nextArena.bounds);
    characterPhysics = nextPhysics;
    selectedArena = nextSelection;
    arena = nextArena;
    botNavigationColliders = navigationCollidersFor(arena);
    document.documentElement.dataset.arenaId = selectedArena.id;
    await ensureSelectedQualityPresentation(selectedArena.id);
    setArenaPresentationVisibility();
    matchState = createMatch(performance.now(), selectedArena.matchRules);
    lastPlayerSpawnIndex = -1;
    lastPlayerSpawnAudit = null;
    recentDeathPositions.length = 0;
    lastBotSpawnAudit.clear();
    respawn(false);
    setArenaMenuCamera();
    try {
      previousPhysics?.dispose();
    } catch (disposeError) {
      console.warn('[Atomic Acres previous map physics disposal failed]', disposeError);
    }
    setStatus(`${selectedArena.displayName} selected · ${selectedArena.rulesLabel}.`);
    renderHighScores();
  } catch (error) {
    console.error('[Atomic Acres map selection failed]', error);
    if (nextPhysics) nextPhysics.dispose();
    characterPhysics = previousPhysics;
    selectedArena = previousSelection;
    arena = previousArena;
    botNavigationColliders = navigationCollidersFor(arena);
    document.documentElement.dataset.arenaId = selectedArena.id;
    setArenaPresentationVisibility();
    matchState = createMatch(performance.now(), selectedArena.matchRules);
    lastPlayerSpawnIndex = -1;
    lastPlayerSpawnAudit = null;
    recentDeathPositions.length = 0;
    lastBotSpawnAudit.clear();
    respawn(false);
    setArenaMenuCamera();
    setStatus(`Map switch failed — ${selectedArena.displayName} remains selected.`, 'warn');
  } finally {
    arenaSelectionReady = true;
    syncArenaSelectionUi();
    if (network.role !== 'offline' || privateLobbySnapshot) renderPrivateLobby();
  }
}

function activateArenaSelection(id: ArenaId): Promise<void> {
  const queued = arenaSelectionTask
    .catch(() => undefined)
    .then(() => performArenaSelection(id));
  arenaSelectionTask = queued;
  return queued;
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.map-card[data-arena-id]')) {
  button.addEventListener('click', () => {
    const id = button.dataset.arenaId as ArenaId | undefined;
    if (id) void activateArenaSelection(id);
  });
}

function resetForMode(): void {
  interruptReload(true);
  lastPrincipalShotAlignment = null;
  player.kills = 0;
  player.deaths = 0;
  player.hp = 100;
  player.grenades = 2;
  player.reloadState = null;
  player.sustainedShots = 0;
  player.stance = 'stand';
  characterPhysics?.setStance('stand');
  targetHits = 0;
  rangeScore = 0;
  rangeShotsFired = 0;
  roundShotsFired = 0;
  roundHitShots = 0;
  roundHeadshots = 0;
  roundDamageDealt = 0;
  roundDamageTaken = 0;
  for (const target of arena.targets) {
    target.active = true;
    target.health = target.maxHealth;
    target.respawnAt = 0;
    target.root.visible = true;
  }
  previousHudScores = [0, 0];
  respawnEndsAt = 0;
  clearBots();
  hostedBotStateSeq = 0;
  lastHostedBotStateSeq = -1;
  clearGrenades();
  clearGrenadeExplosionVisuals();
  clearFieldSupport();
  clearTeamPings();
  clearDeathDrops();
  resetBreakableWindows();
  for (const id of remotes.keys()) removeRemote(id, 'cleared');
  verifiedRemoteKills.clear();
  element<HTMLElement>('#banner').hidden = true;
  element<HTMLElement>('#countdown').hidden = true;
  element<HTMLElement>('#respawn').hidden = true;
  rangePrimaryUnlocked = false;
  player.primaryWeapon = selectedArena.id === 'gun-range' ? 'carbine' : fieldKitById(selectedFieldKit).weapon;
  player.weapon = selectedArena.id === 'gun-range' ? 'pistol' : player.primaryWeapon;
  player.switchingUntil = 0;
  weaponView.setWeapon(player.weapon, true);
  renderFieldKitSelection();
  player.ammo = { carbine: WEAPONS.carbine.mag, smg: WEAPONS.smg.mag, lmg: WEAPONS.lmg.mag, scattergun: WEAPONS.scattergun.mag, sniper: WEAPONS.sniper.mag, pistol: WEAPONS.pistol.mag, magnum: WEAPONS.magnum.mag, 'machine-pistol': WEAPONS['machine-pistol'].mag };
  player.reserve = { carbine: WEAPONS.carbine.reserve, smg: WEAPONS.smg.reserve, lmg: WEAPONS.lmg.reserve, scattergun: WEAPONS.scattergun.reserve, sniper: WEAPONS.sniper.reserve, pistol: WEAPONS.pistol.reserve, magnum: WEAPONS.magnum.reserve, 'machine-pistol': WEAPONS['machine-pistol'].reserve };
}

function returnToMainMenu(): void {
  if (network.role !== 'offline') network.send({ type: 'leave', playerId: player.id, voluntary: true });
  network.close();
  resetForMode();
  resetPrivateLobbyState();
  gameStarted = false;
  matchFinished = false;
  weaponView.root.visible = false;
  hudRoot.hidden = true;
  roomCard.hidden = true;
  roomCodeEl.textContent = '';
  element<HTMLElement>('#room-hud').textContent = '';
  element<HTMLButtonElement>('#resume').hidden = true;
  element<HTMLButtonElement>('#main-menu').hidden = true;
  menu.classList.remove('hidden');
  syncMatchReportDownloads();
  arenaSelectionReady = true;
  syncArenaSelectionUi();
  setArenaMenuCamera();
  setStatus(`${selectedArena.displayName} ready · choose a map or deploy again.`);
  if (document.pointerLockElement) void document.exitPointerLock();
}

element<HTMLButtonElement>('#resume').addEventListener('click', () => {
  if (gameStarted && player.alive && !matchFinished) requestGamePointerLock();
});
element<HTMLButtonElement>('#main-menu').addEventListener('click', returnToMainMenu);
element<HTMLButtonElement>('#menu-download-match-summary').addEventListener('click', downloadMatchSummary);
element<HTMLButtonElement>('#menu-download-match-technical').addEventListener('click', downloadMatchDiagnostics);

function setChangelogOpen(open: boolean): void {
  const panel = element<HTMLElement>('#changelog-panel');
  const backdrop = element<HTMLElement>('#changelog-backdrop');
  const button = element<HTMLButtonElement>('#last-updated-btn');
  panel.hidden = !open;
  backdrop.hidden = !open;
  button.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) element<HTMLButtonElement>('#changelog-close').focus();
  else button.focus();
}

element<HTMLButtonElement>('#last-updated-btn').addEventListener('click', () => {
  setChangelogOpen(true);
});
element<HTMLButtonElement>('#changelog-close').addEventListener('click', () => setChangelogOpen(false));
element<HTMLElement>('#changelog-backdrop').addEventListener('click', () => setChangelogOpen(false));
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !element<HTMLElement>('#changelog-panel').hidden) {
    event.preventDefault();
    setChangelogOpen(false);
  }
});

element<HTMLButtonElement>('#solo').addEventListener('click', () => {
  if (!requirePlayerName()) return;
  network.close();
  resetForMode();
  resetPrivateLobbyState();
  startGame('solo');
});
element<HTMLButtonElement>('#host').addEventListener('click', () => {
  if (!requirePlayerName()) return;
  resetForMode();
  resetPrivateLobbyState();
  player.team = Number(element<HTMLSelectElement>('#team').value) === 1 ? 1 : 0;
  network.setCapacity(DEFAULT_PRIVATE_MATCH_CONFIG.capacity);
  network.host(initializeHostLobby);
});
element<HTMLButtonElement>('#join').addEventListener('click', () => {
  if (!requirePlayerName()) return;
  if (!teamSelectionTouched) teamSelect.value = '1';
  resetForMode();
  resetPrivateLobbyState();
  player.team = Number(teamSelect.value) === 1 ? 1 : 0;
  const code = element<HTMLInputElement>('#room-input').value.trim();
  restoreRoomIdentity(code);
  element<HTMLElement>('#private-lobby').hidden = false;
  network.join(code, sendLobbyJoin);
});
element<HTMLButtonElement>('#copy-room').addEventListener('click', async () => {
  const roomCode = network.roomCode.trim();
  if (!roomCode) {
    setStatus('Room code is not ready yet', 'warn');
    return;
  }

  const writeText = navigator.clipboard?.writeText
    ? navigator.clipboard.writeText.bind(navigator.clipboard)
    : undefined;
  const result = await copyTextWithFallback(roomCode, writeText, () => false);
  if (result === 'failed') {
    selectLobbyCodeForManualCopy(roomCode);
    setStatus('Clipboard blocked — room code selected for manual copy', 'warn');
    return;
  }
  setStatus('Lobby code copied', 'ok');
});
element<HTMLButtonElement>('#lobby-ready').addEventListener('click', () => {
  if (!privateLobbySnapshot || privateLobbySnapshot.phase !== 'waiting') return;
  const ready = !localLobbyReady;
  if (network.role === 'host') updateHostReady({ type: 'lobby-ready', by: player.id, ready, nonce: randomNonce() });
  else if (network.role === 'client') network.send({ type: 'lobby-ready', by: player.id, ready, nonce: randomNonce() });
});
element<HTMLElement>('#lobby-roster').addEventListener('change', (event) => {
  const select = event.target instanceof HTMLSelectElement && event.target.matches('[data-lobby-dhv]') ? event.target : null;
  if (!select || !privateLobbySnapshot || privateLobbySnapshot.phase !== 'waiting') return;
  const parsed: unknown = select.value === 'X' ? 'X' : Number(select.value);
  if (!isDhv(parsed)) return;
  localDhv = parsed;
  const message: LobbyHandicapMessage = { type: 'lobby-handicap', by: player.id, dhv: parsed, nonce: randomNonce() };
  if (network.role === 'host') updateHostHandicap(message);
  else if (network.role === 'client') network.send(message);
});
element<HTMLButtonElement>('#lobby-start').addEventListener('click', hostStartPrivateMatch);
element<HTMLButtonElement>('#lobby-leave').addEventListener('click', returnToMainMenu);
element<HTMLButtonElement>('#lobby-balance').addEventListener('click', () => {
  if (network.role !== 'host' || !privateLobbySnapshot || privateLobbySnapshot.phase !== 'waiting') return;
  for (const member of balanceLobbyTeams([...hostLobbyMembers.values()])) hostLobbyMembers.set(member.id, { ...member, ready: false });
  broadcastHostLobby('waiting');
});
const updateLobbyConfigFromUi = (): void => {
  if (network.role !== 'host') return;
  const rangeLobby = privateMatchConfig.arenaId === 'gun-range';
  const mode: MatchMode = rangeLobby || element<HTMLSelectElement>('#lobby-mode').value === 'ffa' ? 'ffa' : 'tdm';
  const capacity = element<HTMLSelectElement>('#lobby-capacity').value === '6' ? 6 : 4;
  const requestedBots = Number(element<HTMLSelectElement>('#lobby-bots').value);
  const hostedBotCount: HostedBotCount = rangeLobby ? 0 : isHostedBotCount(requestedBots) ? requestedBots : 0;
  applyHostLobbyConfig({
    ...privateMatchConfig,
    mode,
    capacity,
    hostedBotCount,
    autoBalance: !rangeLobby && mode === 'tdm' && element<HTMLInputElement>('#lobby-auto-balance').checked,
  });
};
element<HTMLSelectElement>('#lobby-mode').addEventListener('change', updateLobbyConfigFromUi);
element<HTMLSelectElement>('#lobby-capacity').addEventListener('change', updateLobbyConfigFromUi);
element<HTMLSelectElement>('#lobby-bots').addEventListener('change', updateLobbyConfigFromUi);
element<HTMLInputElement>('#lobby-auto-balance').addEventListener('change', updateLobbyConfigFromUi);
teamSelect.addEventListener('change', () => {
  if (!privateLobbySnapshot || privateLobbySnapshot.phase !== 'waiting' || privateLobbySnapshot.config.mode !== 'tdm') return;
  const team: Team = teamSelect.value === '1' ? 1 : 0;
  if (network.role === 'host') updateHostTeam({ type: 'lobby-team', by: player.id, team, nonce: randomNonce() });
  else if (network.role === 'client') network.send({ type: 'lobby-team', by: player.id, team, nonce: randomNonce() });
});

if (invitedRoom && launchParams.get('autojoin') === '1') {
  window.setTimeout(() => element<HTMLButtonElement>('#join').click(), 100);
}

function scheduleStateBroadcast(): void {
  if (stateBroadcastTimer) clearTimeout(stateBroadcastTimer);
  const delay = snapshotIntervalMs(localSnapshotRateState.rateHz);
  stateBroadcastTimer = setTimeout(() => {
    if (gameStarted && network.role !== 'offline' && player.alive) {
      const now = performance.now();
      localSnapshotRateState = updateSnapshotRate(localSnapshotRateState, {
        rttMs: hostTimeMapping.sampleCount > 0 ? hostTimeMapping.rttMs : localLobbyPingMs ?? 20,
        jitterMs: hostTimeMapping.sampleCount > 0 ? hostTimeMapping.jitterMs : 0,
        sequenceGaps: outboundFeedbackSequenceGaps,
        reordered: outboundFeedbackReordered,
        bufferedPressure: Math.max(outboundFeedbackPressure, network.stateBufferedPressure()),
      }, now);
      network.send(createStateMessage());
      if (network.role === 'host' && privateMatchConfig.hostedBotCount > 0) broadcastHostedBotState();
    }
    scheduleStateBroadcast();
  }, delay);
}
scheduleStateBroadcast();
window.addEventListener('beforeunload', () => {
  network.close();
});

function refreshStaticShadowsForDynamicCasters(now: number): void {
  const castsVisibleShadow = (root: THREE.Object3D): boolean => {
    if (!root.visible) return false;
    let casts = false;
    root.traverse((node) => {
      if (!casts && node.visible && node instanceof THREE.Mesh && node.castShadow) casts = true;
    });
    return casts;
  };
  const hasDynamicCasters = !botsFrozen && [...bots.values()].some((bot) => bot.alive && castsVisibleShadow(bot.root))
    || [...remotes.values()].some((remote) => castsVisibleShadow(remote.root))
    || grenades.length > 0 || yardhawk !== null || strikeMissiles.length > 0 || hunterDrones.length > 0;
  const admittedAt = admitStaticShadowDynamicRefresh({
    shadowMode: activeRenderConfig.shadowMode,
    shadowsEnabled: renderer.shadowMap.enabled,
    contextLost: webglContextLost,
    hasDynamicCasters,
    now,
    lastRefreshAt: lastStaticShadowRefreshAt,
  });
  if (admittedAt === null) return;
  renderer.shadowMap.needsUpdate = true;
  lastStaticShadowRefreshAt = admittedAt;
  staticShadowDynamicRefreshes += 1;
}

function frame(now: number, scheduleNext = true): void {
  frameCount += 1;
  try {
    const rawFrameMs = Math.max(0, now - lastFrame);
    // The HUD must report even pathologically slow software-rendered frames.
    // Adaptive quality still receives the unclamped sample and independently
    // rejects values above its 250 ms control window.
    if (scheduleNext) framePacing.record(Math.min(rawFrameMs, 1_000));
    const adaptivePixelRatio = scheduleNext ? adaptiveQuality.record(
      rawFrameMs,
      gameStarted && menu.classList.contains('hidden') && document.visibilityState === 'visible' && !debugRenderPaused,
    ) : null;
    if (adaptivePixelRatio !== null) {
      applyAdaptiveRenderBudget(adaptivePixelRatio);
      grassSystem.setAdaptivePixelRatio(adaptivePixelRatio);
      resize();
    }
    const pacing = framePacing.summary();
    if (now - lastFpsHudAt >= 250) {
      const fps = pacing.sampleCount >= 1 ? Math.max(1, Math.round(pacing.cadenceHz)) : null;
      fpsCounterValue.textContent = fps === null ? '--' : String(fps);
      fpsCounter.dataset.pacing = fps === null ? 'warming' : fps >= 55 ? 'smooth' : fps >= 40 ? 'strained' : 'slow';
      lastFpsHudAt = now;
    }
    const refreshWarning = element<HTMLElement>('#refresh-warning');
    refreshWarning.hidden = !(pacing.displayLimited && now < refreshWarningUntil);
    if (pacing.displayLimited) {
      refreshWarning.querySelector('strong')!.textContent = `${Math.round(pacing.cadenceHz)} HZ PRESENTATION LIMIT`;
    }
    const frameDt = Math.min(0.05, rawFrameMs / 1000);
    lastFrame = now;
    pollGamepad(frameDt);
    accumulator += frameDt;
    const step = 1 / SIMULATION_HZ;
    let iterations = 0;
    while (accumulator >= step && iterations < 6) {
      updatePhysics(step);
      accumulator -= step;
      iterations += 1;
    }
    if (triggerHeld && WEAPONS[player.weapon].automatic) tryFire(now);
    finishReload(now);
    updateTargets(now);
    updateBots(frameDt, now);
    updateGrenades(frameDt, now);
    updateGrenadeExplosionVisuals(now);
    updateFieldSupport(frameDt, now);
    updateOverdrive(now);
    updateTeamPings(now);
    updateDeathDrops(now);
    impactPresentation.update(frameDt);
    tracerPool.update(frameDt);
    updateRemotes(frameDt, now);
    if (selectedArena.id === 'atomic-acres') {
      if (arenaArtRoot && !blenderArenaActive) updateArenaArt(arenaArtRoot, now);
      updateArenaArt(neighbourhoodLifeRoot, now);
      atmosphereSystem.update(now / 1_000);
      grassSystem.update(now / 1_000, camera.position, player.position, gameStarted);
    } else if (selectedArena.id === 'rustworks-1v1') {
      atmosphereSystem.update(now / 1_000);
    } else if (selectedArena.id === 'gun-range') {
      updateGunRangePresentation(gunRangeArena.root, now);
    }
    waterSystem.update(now / 1_000);
    if (gameStarted) updateMinimap(now);
    updateHud(now);
    if (debugCaptureCameraActive) {
      camera.position.copy(debugCaptureCameraPosition);
      camera.rotation.set(debugCaptureCameraPitch, debugCaptureCameraYaw, 0, 'YXZ');
      camera.updateMatrixWorld(true);
    }
    refreshStaticShadowsForDynamicCasters(now);
    if (!debugRenderPaused && !webglContextLost && document.visibilityState === 'visible') {
      atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);
      if (activeRenderConfig.shadowMode === 'static') renderer.shadowMap.needsUpdate = false;
    }
    if (scheduleNext) requestAnimationFrame(frame);
  } catch (error) {
    showFatalError(error);
  }
}

// requestAnimationFrame is suspended by background tabs. Keep a bounded,
// no-render heartbeat so host/guest simulation, clocks, AI and network state do
// not turn a tab switch into an implicit multiplayer pause.
window.setInterval(() => {
  if (document.visibilityState === 'hidden' && gameStarted && !matchFinished) frame(performance.now(), false);
}, 50);
const debugWindow = window as Window & {
  __ATOMIC_ACRES_DEBUG__?: {
    snapshot: () => Record<string, unknown>;
    traceBallistics: (
      weapon: WeaponId,
      origin: [number, number, number],
      direction: [number, number, number],
      distance: number,
      arenaId?: ArenaId,
    ) => BallisticTrace;
    startSolo: () => void;
    setBotsFrozen: (frozen: boolean) => void;
    stageHostedBotAgainstRemote: () => { botId: string; targetId: string } | null;
    setBotPresentation: (stance: PlayerSnapshot['stance'] | null, speed?: number, weapon?: PrimaryWeaponId) => void;
    clearBots: () => void;
    placeBotAhead: (distance?: number) => void;
    placeBotRelative: (right: number, forward: number) => void;
    showBotDamageDirection: () => number | null;
    respawn: () => void;
    aimAtBot: (zone?: HitZone) => void;
    aimAtRemote: (zone?: HitZone) => void;
    stageWindow: (index: number, distance?: number) => void;
    detonateGrenadeAtWindow: (index: number) => number;
    stageYardhawkWall: (team?: Team) => boolean;
    stageBotAtIndoorRamp: (team?: Team, descending?: boolean) => boolean;
    damageBot: (amount: number, zone?: HitZone) => void;
    damageBotWithCause: (cause: KillCause['kind']) => void;
    meleeBot: () => void;
    activateDormantReinforcement: () => { activated: boolean; syncMs: number };
    stageHouseRamp: (kind: 'interior' | 'exterior', team?: Team) => {
      kind: 'interior' | 'exterior';
      start: number[];
      foot: number[];
      top: number[];
      uphill: number[];
      run: number;
    } | null;
    stageRustworksAccess: (route: 'ground-to-lower' | 'lower-to-upper', descending?: boolean) => {
      route: 'ground-to-lower' | 'lower-to-upper';
      descending: boolean;
      start: number[];
      target: number[];
      direction: number[];
      run: number;
    } | null;
    teleportPlayer: (x: number, y: number, z: number, yaw?: number, pitch?: number) => void;
    setCaptureCameraPose: (x: number | null, y?: number, z?: number, yaw?: number, pitch?: number) => void;
    setCaptureViewmodelHidden: (hidden: boolean) => void;
    stageLoadingCaptureSquad: () => { staged: boolean; characters: number; positions: number[][] };
    collisionProbe: (x: number, z: number) => boolean;
    collisionProbeAt: (x: number, y: number, z: number) => boolean;
    segmentBlocked: (x1: number, z1: number, x2: number, z2: number) => boolean;
    selectTriPassWorldTargets: (points: [number, number][]) => boolean;
    captureShadowProbeFrame: (horizontalOffset: number) => string;
    setRenderPaused: (paused: boolean) => void;
    openMenu: () => void;
    fireOnce: () => void;
    throwGrenade: () => void;
    switchWeapon: (index: number) => void;
    equipKit: (id: FieldKitId) => void;
    equipWeapon: (weapon: WeaponId) => void;
    interactDrop: () => void;
    setAmmo: (weapon: WeaponId, ammo: number, reserve: number) => void;
    setGrenades: (count: number) => void;
    reload: () => void;
    melee: () => { accepted: boolean; alive: boolean; phase: string; lastMeleeAt: number };
    setAds: (held: boolean) => void;
    setMovement: (forward: boolean, sprint?: boolean) => void;
    setMeleeCaptureProgress: (progress: number | null) => void;
    setFireCaptureAgeMs: (ageMs: number | null) => void;
    setReloadCaptureProgress: (progress: number | null) => void;
    setGrassTime: (timeSeconds: number | null) => void;
    setGrassInteractionProbe: (x: number | null, z: number | null) => void;
    sampleGrassBend: (index: number) => Record<string, number> | null;
    renderAudit: () => Array<{ name: string; material: string; triangles: number }>;
    setStance: (stance: Stance) => void;
    damage: (amount: number) => void;
    damageFromRemote: (amount: number, cause?: KillCause['kind']) => void;
    earnSupport: (eliminations: number) => void;
    forceBotGrenade: (fuseMs?: number) => boolean;
    activateSupport: (id: FieldSupportId) => void;
    setOverdrive: (mode: 'charging' | 'available' | 'active' | 'expired') => void;
    degradeStateChannel: () => boolean;
    sendPing: (kind: TeamPingKind) => void;
    holdPings: (durationMs?: number) => void;
    endMatch: () => void;
    rematch: () => void;
    returnToMainMenu: () => void;
    selectArena: (id: ArenaId) => Promise<void>;
    hitRangeTarget: (id: string, damage?: number, zone?: HitZone) => void;
    spawnDeathDrop: (ageMs?: number) => string | null;
    setKills: (kills: number) => void;

  };
};
debugWindow.__ATOMIC_ACRES_DEBUG__ = {
  snapshot: () => ({
    gameStarted,
    frameCount,
    gameMode,
    matchPhase: matchState.phase,
    matchEndReason: matchState.endReason ?? null,
    privateMatch: privateLobbySnapshot ? {
      mode: privateMatchMode,
      arenaId: privateLobbySnapshot.config.arenaId,
      phase: privateLobbySnapshot.phase,
      revision: privateLobbySnapshot.revision,
      capacity: privateLobbySnapshot.config.capacity,
      hostedBotCount: privateLobbySnapshot.config.hostedBotCount,
      autoBalance: privateLobbySnapshot.config.autoBalance,
      members: privateLobbySnapshot.members.map((member) => ({ ...member })),
      scores: [...authoritativeScores.values()].map((score) => ({ ...score })),
      activeAtHostTimeMs: privateMatchActiveAtHostTimeMs,
      activeAtEpochMs: privateMatchActiveAtEpochMs,
      hostTimeOffsetMs: network.role === 'client' ? hostTimeMapping.offsetMs : 0,
      localPingMs: localLobbyPingMs,
    } : null,
    scores: teamScores(),
    arenaSelection: {
      id: selectedArena.id,
      label: arena.label,
      rules: selectedArena.matchRules,
      rulesLabel: selectedArena.rulesLabel,
      multiplayer: selectedArena.multiplayer,
      soloBotCount: selectedArena.soloBotCount,
      rootVisible: arena.root.visible,
      activeRoots: Object.values(arenaById).filter((entry) => entry.root.visible).map((entry) => entry.id),
      bounds: { ...arena.bounds },
      spawnCounts: [arena.spawns[0].length, arena.spawns[1].length],
      colliders: arena.colliders.length,
      physicsColliders: arena.physicsColliders.length,
      physicsBoundaryWalls: worldBoundaryColliders(arena.bounds).length,
      navigationColliders: botNavigationColliders.length,
      navigationCollidersMatchArena: botNavigationColliders.every((box) => arena.colliders.includes(box)),
      raycastMeshes: arena.raycastMeshes.length,
      targets: arena.targets.length,
      skylineAssetAudit: selectedArena.id === 'skyline-terminal' ? arena.root.userData.skylineAssetAudit : null,
      skylineCabinClearance: selectedArena.id === 'skyline-terminal' ? arena.root.userData.skylineCabinClearance : null,
      pass59GeometryAudit: selectedArena.id === 'atomic-acres'
        ? arena.root.userData.atomicCollisionAudit
        : selectedArena.id === 'rustworks-1v1'
          ? arena.root.userData.rustworksCentreCoverAudit
          : selectedArena.id === 'skyline-terminal'
            ? arena.root.userData.skylineDoorAudit
            : null,
    },
    ballistics: {
      activeSurfaces: activeBallisticSurfaces().length,
      weaponProfiles: Object.fromEntries(Object.entries(WEAPONS).map(([id, weapon]) => [id, { ...weapon.penetration }])),
      arenas: Object.fromEntries(Object.entries(arenaById).map(([id, entry]) => [id, {
        raycastMeshes: entry.raycastMeshes.length,
        shotSurfaces: entry.shotSurfaces.length,
        fallbackSurfaces: entry.shotSurfaces.filter((surface) => surface.classification === 'fallback').map((surface) => surface.name),
      }])),
    },
    rangePractice: {
      score: rangeScore,
      hits: targetHits,
      armoryOnly: selectedArena.id === 'gun-range',
      primaryUnlocked: rangePrimaryUnlocked,
      stations: GUN_RANGE_WEAPON_STATIONS.map((station) => ({
        id: station.id,
        weapon: station.weapon,
        label: station.label,
        position: [station.position.x, station.position.y, station.position.z],
        visible: arena.root.getObjectByName(`gun-range-weapon-station-${station.weapon}`)?.visible ?? false,
      })),
      unlimitedAmmo: hasUnlimitedRangeAmmo(selectedArena.id),
      reserveHud: reserveHudValue(selectedArena.id, player.reserve[player.weapon]),
      firingLineZ: GUN_RANGE_FIRING_LINE_Z,
      playerDownrange: selectedArena.id === 'gun-range' && player.position.z < GUN_RANGE_FIRING_LINE_Z,
      activeTargets: arena.targets.filter((target) => target.active).length,
      values: arena.targets.map((target) => target.scoreValue),
      targets: arena.targets.map((target) => ({
        id: target.id,
        kind: target.kind ?? 'plate',
        alwaysCritical: target.alwaysCritical === true,
        active: target.active,
        health: target.health,
        maxHealth: target.maxHealth,
        respawnDelayMs: target.respawnDelayMs ?? 2_200,
        respawnInMs: target.active ? 0 : Math.max(0, target.respawnAt - performance.now()),
        visible: target.root.visible,
        position: target.root.position.toArray(),
        screenPosition: target.root.localToWorld(new THREE.Vector3(0, 1.65, 0)).project(camera).toArray(),
      })),
    },
    leaderboard: {
      schemaVersion: HIGH_SCORE_SCHEMA_VERSION,
      entries: highScores.map((entry) => ({ ...entry })),
      uniquePlayerKeys: new Set(highScores.map((entry) => leaderboardNameKey(entry.name))).size,
      renderedRows: element<HTMLOListElement>('#high-score-list').querySelectorAll('li:not(.empty)').length,
    },
    random: runtimeRandomTelemetry(),
    aimAlignment: (() => {
      const canvasBounds = canvas.getBoundingClientRect();
      const activeReticle = sniperScopeOverlay.hidden
        ? element<HTMLElement>('#crosshair')
        : element<HTMLElement>('.scope-reticle');
      const reticleBounds = activeReticle.getBoundingClientRect();
      const direction = camera.getWorldDirection(new THREE.Vector3());
      const rayNdc = camera.position.clone().addScaledVector(direction, 100).project(camera);
      const canvasCentre = { x: canvasBounds.left + canvasBounds.width / 2, y: canvasBounds.top + canvasBounds.height / 2 };
      const reticleCentre = { x: reticleBounds.left + reticleBounds.width / 2, y: reticleBounds.top + reticleBounds.height / 2 };
      return {
        canvas: { left: canvasBounds.left, top: canvasBounds.top, width: canvasBounds.width, height: canvasBounds.height },
        reticleCentre,
        rayNdc: [rayNdc.x, rayNdc.y],
        errorCssPixels: Math.hypot(reticleCentre.x - canvasCentre.x, reticleCentre.y - canvasCentre.y),
      };
    })(),
    lastPrincipalShotAlignment,
    operatorAsset: {
      ready: riggedOperatorAssetReady(),
      error: riggedOperatorLoadError,
      weaponError: importedWeaponLoadError,
    },
    player: {
      team: player.team,
      hp: player.hp,
      alive: player.alive,
      lastMeleeAt: player.lastMeleeAt,
      kills: player.kills,
      deaths: player.deaths,
      weapon: player.weapon,
      primaryWeapon: player.primaryWeapon,
      equippedWeapons: selectedArena.id === 'gun-range'
        ? [rangePrimaryUnlocked ? player.primaryWeapon : null, handicapSidearm(player.primaryWeapon)]
        : handicapLoadout(player.primaryWeapon),
      dhv: localDhv,
      ammo: player.ammo[player.weapon],
      reserve: player.reserve[player.weapon],
      reloading: player.reloadState !== null,
      stance: player.stance,
      crouched: player.stance === 'crouch',
      prone: player.stance === 'prone',
      sprinting: currentSprinting,
      grenades: player.grenades,
      lastFallDamage,
      lastFallImpactSpeed,
      position: player.position.toArray(),
      seq: player.seq,
    },
    spawnSelection: lastPlayerSpawnAudit ? { ...lastPlayerSpawnAudit } : null,
    bots: [...bots.values()].map((bot) => ({
      id: bot.id,
      hp: bot.hp,
      alive: bot.alive,
      kills: bot.kills,
      weapon: bot.weapon,
      nextGrenadeInMs: Math.max(0, bot.nextGrenadeAt - performance.now()),
      grenadeActive: bot.grenadeActive,
      position: bot.position.toArray(),
      waypoint: bot.waypoint,
      blockedSince: bot.blockedSince,
      hasLineOfSight: bot.hasLineOfSight,
      rootVisible: bot.root.visible,
      screenPosition: bot.root.localToWorld(new THREE.Vector3(0, 1.35, 0)).project(camera).toArray(),
      visibleMeshCount: (() => {
        let count = 0;
        bot.root.traverse((node) => {
          if (node instanceof THREE.Mesh && node.visible && node.userData.authoritativeProxy !== true) count += 1;
        });
        return count;
      })(),
      operatorModel: riggedOperatorTelemetry(bot.root),
      neonHaze: bot.root.userData.neonBotHaze === true
        && bot.root.getObjectByName('neon-purple-bot-haze') instanceof THREE.Sprite,
      presentationReady: riggedOperatorTelemetry(bot.root) !== null || ['presentation-reaction-gear', 'field-radio-pack', 'asymmetric-shoulder-plate', 'team-radio-antenna']
        .every((name) => bot.root.getObjectByName(name) !== undefined),
      presentationWeaponSafe: (() => {
        const weapon = bot.root.getObjectByName(`operator-${bot.root.userData.operatorRig?.weaponId ?? 'carbine'}`);
        if (!weapon) return false;
        let safe = true;
        weapon.traverse((node) => {
          if (node instanceof THREE.Mesh && node.userData.presentationOnly !== true) safe = false;
        });
        return safe;
      })(),
    })),
    botEscalation: {
      deaths: soloBotDeaths,
      initialBots: selectedArena.soloBotCount,
      targetBots: activeSoloBotTarget(selectedArena, soloBotDeaths),
      activeBots: bots.size,
      dormantBots: dormantBots.size,
      dormantBotsPrewarmed,
      dynamicReinforcementLights: 0,
      maximumBots: selectedArena.maximumSoloBots,
      nextReinforcementAt: selectedArena.id === 'atomic-acres' && bots.size < selectedArena.maximumSoloBots
        ? (Math.floor(soloBotDeaths / 5) + 1) * 5
        : null,
      lastEliminationProfile: { ...lastBotEliminationProfile },
    },
    remotes: remotes.size,
    networkSync: {
      selectedRateHz: localSnapshotRateState.rateHz,
      stateIntervalMs: snapshotIntervalMs(localSnapshotRateState.rateHz),
      rateTransitions: localSnapshotRateState.transitions,
      receiverSequenceGaps,
      receiverReordered,
      outboundFeedbackSequenceGaps,
      outboundFeedbackReordered,
      outboundFeedbackPressure,
      hostTime: hostTimeDiagnostics(hostTimeMapping),
      shotProtocol: { ...shotProtocolTelemetry },
      localContinuity,
      localHistory: {
        count: localPositionHistory.length,
        first: localPositionHistory[0]?.at ?? null,
        latest: localPositionHistory.at(-1)?.at ?? null,
        firstContinuity: localPositionHistory[0]?.continuity ?? null,
        latestContinuity: localPositionHistory.at(-1)?.continuity ?? null,
      },
    },
    networkLifecycle: network.diagnostics(),
    remoteHitAdmission: { ...remoteHitAdmissionTelemetry },
    remotePlayers: [...remotes.values()].map((remote) => ({
      id: remote.snapshot.id,
      hp: remote.snapshot.hp,
      primary: remote.snapshot.primary,
      weapon: remote.snapshot.weapon,
      stance: remote.snapshot.stance ?? 'stand',
      seq: remote.snapshot.seq,
      position: remote.target.toArray(),
      renderedHostTimeMs: remote.renderedHostTimeMs,
      renderedWorldAgeMs: remote.renderedWorldAgeMs,
      snapshotBufferDepth: remote.interpolation.depth,
      snapshotBuffer: remote.interpolation.stats,
      continuity: remote.continuity,
      historyFirst: remote.positionHistory[0]?.at ?? null,
      historyLatest: remote.positionHistory.at(-1)?.at ?? null,
      visualPosition: remote.root.position.toArray(),
      snapshotAgeMs: Math.max(0, performance.now() - remote.lastSeen),
      interpolationError: remote.root.position.distanceTo(remote.target),
    })),
    grenades: grenades.length,
    remotePresentation: {
      grenades: grenades.filter((grenade) => grenade.ownerKind === 'remote').length,
      supportEffects: remoteSupportPresentations.length,
      supportRoots: remoteSupportPresentations.reduce((count, effect) => count + effect.roots.length, 0),
      presentationOnly: remoteSupportPresentations.every((effect) => effect.roots.every(({ root }) => root.userData.presentationOnly === true)),
    },
    botGrenades: {
      active: activeBotGrenadeCount(),
      maximumActiveObserved: botGrenadeMaxActive,
      throws: botGrenadeThrows,
      lastDamage: lastBotGrenadeDamage,
      damageMultiplier: BOT_DAMAGE_MULTIPLIER,
      ownerIds: grenades.filter((grenade) => grenade.ownerKind === 'bot').map((grenade) => grenade.ownerId),
    },
    grenadeVisual: {
      ...grenadePresentationTelemetry(),
      active: grenades.map((grenade) => ({
        name: grenade.mesh.name,
        authored: grenade.mesh.userData.authoredGrenade === true,
        meshes: (() => {
          let count = 0;
          grenade.mesh.traverse((node) => { if (node instanceof THREE.Mesh) count += 1; });
          return count;
        })(),
      })),
    },
    grenadeExplosion: {
      total: grenadeExplosions,
      activeVisuals: grenadeExplosionPresentation.telemetry().active,
      poolCapacity: grenadeExplosionPresentation.telemetry().capacity,
      dynamicLights: grenadeExplosionPresentation.telemetry().dynamicLights,
      prewarmed: grenadeExplosionPresentation.telemetry().prewarmed,
      lastExplosionAgeMs: lastGrenadeExplosionFrameAt > 0 ? Math.max(0, performance.now() - lastGrenadeExplosionFrameAt) : null,
      profile: { ...lastGrenadeExplosionProfile },
    },
    audio: audio.telemetry(),
    fieldSupport: {
      streak: fieldSupport.streak,
      rewardCycle: fieldSupport.rewardCycle,
      bestStreakThisMatch,
      available: { ...fieldSupport.available },
      scoutActive: performance.now() < scoutSweepUntil,
      scoutPulseVisible: scoutSweepPulseVisible(performance.now(), scoutSweepUntil),
      yardhawk: yardhawk ? {
        active: true,
        phase: yardhawk.phase,
        targetId: yardhawk.targetId,
        position: yardhawk.root.position.toArray(),
        armedInMs: Math.max(0, yardhawk.armedAt - performance.now()),
      } : { active: false, phase: null },
      yardhawkExplosions,
      tacticalMapOpen,
      tacticalTargets: triPassTargeting?.points.map((point) => ({ ...point })) ?? [],
      tacticalHostiles: triPassHostileMarkers.map((marker) => ({
        id: marker.id,
        kind: marker.kind,
        world: [...marker.world] as [number, number],
        canvas: [...marker.canvas] as [number, number],
      })),
      explosionPresentation: supportExplosionPresentation.telemetry(),
      explosionProfile: lastSupportExplosionProfile
        ? { ...lastSupportExplosionProfile }
        : { source: null, audioMs: 0, visualMs: 0, targetDamageMs: 0, totalSyncMs: 0 },
      explosionFrameProfile: { ...lastSupportExplosionFrameProfile, sources: [...lastSupportExplosionFrameProfile.sources] },
      retiredPresentationRoots: deferredSupportDisposals.length,
      prewarmedNuke: {
        shockwaveInScene: nukeShockwave.parent === scene,
        prewarmed: nukePresentationPrewarmed,
        dynamicLights: 0,
      },
      strikeMissiles: strikeMissiles.map((strike) => ({
        target: strike.target.toArray(),
        impactInMs: Math.max(0, strike.impactAt - performance.now()),
        position: strike.missile.position.toArray(),
      })),
      triPassLaunches,
      triPassImpacts,
      triPassLastImpactDelayMs,
      hunterDrones: hunterDrones.map((drone) => ({
        targetId: drone.targetId,
        index: drone.index,
        position: drone.root.position.toArray(),
        diveInMs: Math.max(0, drone.diveAt - performance.now()),
        expiresInMs: Math.max(0, drone.expiresAt - performance.now()),
      })),
      hunterSwarmLaunches,
      hunterSwarmImpacts,
      gamepadSelection: gamepadSupportSelection,
      nuke: nukeSequence ? {
        active: true,
        detonated: nukeSequence.detonated,
        detonateInMs: Math.max(0, nukeSequence.detonateAt - performance.now()),
        finishInMs: Math.max(0, nukeSequence.finishedAt - performance.now()),
      } : { active: false, detonated: false, detonateInMs: 0, finishInMs: 0 },
      nukeActivations: nukeLaunches,
      nukeDetonations,
      networkHits: Object.fromEntries(Object.entries(supportNetworkHitTelemetry).map(([source, telemetry]) => [source, { ...telemetry }])),
    },
    remoteSupportAuthority: [...remoteSupportAuthorities.entries()].map(([id, authority]) => ({
      id,
      streak: authority.progression.streak,
      available: { ...authority.progression.available },
      authorizations: Object.fromEntries(
        Object.entries(authority.authorizations).map(([source, authorization]) => [source, authorization ? {
          activationNonce: authorization.activationNonce,
          expiresInMs: Math.max(0, authorization.expiresAt - performance.now()),
          admittedOrigins: Object.keys(authorization.targetsByOrigin).length,
        } : null]),
      ),
    })),
    overdrive: {
      ...overdriveState,
      position: [OVERDRIVE_POSITION.x, OVERDRIVE_POSITION.y, OVERDRIVE_POSITION.z],
      damageMultiplier: overdriveDamageMultiplier(overdriveState, player.id, performance.now()),
      remainingMs: overdriveRemainingMs(overdriveState, player.id, performance.now()),
      spawns: overdriveSpawns,
      pickups: overdrivePickups,
      expiries: overdriveExpiries,
      visible: overdriveRoot.visible,
      worldIconVisible: overdriveRoot.visible && quadWorldIcon.visible,
      worldIconName: quadWorldIcon.name,
      minimapSymbol: '2×',
    },
    deathDropPresentation: deathDropPresentationPool.telemetry(),
    deathDrops: deathDrops.map((entity) => ({
      id: entity.drop.id,
      weapon: entity.drop.weapon,
      ammoAvailable: deathDropAmmoAvailable(entity.drop, performance.now()),
      weaponAvailable: deathDropWeaponAvailable(entity.drop, performance.now()),
      position: [entity.drop.position.x, entity.drop.position.y, entity.drop.position.z],
      expiresInMs: Math.max(0, entity.drop.expiresAt - performance.now()),
    })),
    breakableWindows: arena.breakableWindows.map((window) => ({
      id: window.id,
      broken: window.broken,
      visible: window.mesh.visible,
      position: window.mesh.getWorldPosition(new THREE.Vector3()).toArray(),
    })),
    physicalCover: arena.physicalCover.map((cover) => ({
      id: cover.id,
      bounds: { ...cover.bounds },
      blocksMovement: cover.blocksMovement,
      blocksShots: cover.blocksShots,
      performanceVisualKind: cover.performanceVisualKind ?? null,
      performanceVisualMeshes: cover.performanceVisualMeshes ?? 0,
    })),
    minimap: {
      backingWidth: minimapCanvas.width,
      cssWidth: minimapCanvas.getBoundingClientRect().width,
      headingDegrees: headingDegrees(player.yaw),
      landmarks: minimapLandmarksRendered.map((landmark) => ({ ...landmark })),
    },
    spawnSafety: ([0, 1] as Team[]).map((team) => ({
      team,
      authored: arena.spawns[team].length,
      valid: arena.spawns[team].filter((point) => {
        const bodyPoint = { x: point.x, y: 0, z: point.z };
        return pointInsideBounds(bodyPoint, arena.bounds, 0.44) && !isBlocked(bodyPoint, arena.colliders, 0.44);
      }).length,
    })),
    houseNavigation: arena.houses.map((house) => ({
      id: house.id,
      dimensions: { ...house.dimensions },
      rampWidth: (() => {
        const ramp = house.solids.find((solid) => solid.name === 'exterior-access-ramp');
        return ramp ? Math.min(ramp.size[0], ramp.size[2]) : 0;
      })(),
      indoorRampWidth: (() => {
        const ramp = house.solids.find((solid) => solid.name === 'interior-access-ramp');
        return ramp ? Math.min(ramp.size[0], ramp.size[2]) : 0;
      })(),
      rampNames: house.solids.filter((solid) => solid.kind === 'ramp').map((solid) => solid.name),
      floorSections: house.solids.filter((solid) => solid.kind === 'floor').map((solid) => solid.name),
      routeAnchors: house.routes['ramp-room-flow'].length,
      indoorRouteAnchors: house.routes['indoor-ramp-room-flow'].length,
    })),
    teamPings: activeTeamPings.map((ping) => ({
      kind: ping.root.name.replace('team-ping-', ''),
      expiresInMs: Math.max(0, ping.expiresAt - performance.now()),
      position: ping.root.position.toArray(),
    })),
    activeImpactParticles: impactPresentation.activeParticles(),
    activeImpactMarks: impactPresentation.activeMarks(),
    activeTracers: tracerPool.activeCount(),
    originalArtLoaded: blenderArenaActive || scene.getObjectByName('original-arena-art') !== undefined,
    arenaZone: classifyArenaZone(player.position.x, player.position.z),
    worldIdentity: routeIdentityTelemetry(),
    worldIdentityPresentation: {
      routeLights: worldIdentityPresentation.routeLights,
      routeSigns: worldIdentityPresentation.routeSigns,
      cueInstances: worldIdentityPresentation.cueInstances,
      atmosphericParticles: worldIdentityPresentation.atmosphericParticles,
      practicalLights: worldIdentityPresentation.practicalLights,
      streetLights: worldIdentityPresentation.streetLights,
      interiorLights: worldIdentityPresentation.interiorLights,
      fixtureInstances: worldIdentityPresentation.fixtureInstances,
      ceilingInstances: worldIdentityPresentation.ceilingInstances,
    },
    neighbourhoodLife: (() => {
      const root = scene.getObjectByName('pass31-neighbourhood-life');
      let floraInstances = 0;
      let faunaInstances = 0;
      let streetItems = 0;
      root?.traverse((node) => {
        if (node instanceof THREE.InstancedMesh && /flower/.test(node.name)) floraInstances += node.count;
        if (node instanceof THREE.InstancedMesh && /butterfl|bird/.test(node.name)) faunaInstances += node.count;
        if (/^(street-bench|street-recycling-bin|street-bicycle)$/.test(node.name)) streetItems += 1;
        if (node.name === 'street-wayfinding-markers' && node instanceof THREE.InstancedMesh) streetItems += node.count;
      });
      const contract = root?.userData.neighbourhoodLife as {
        flowerBeds?: number;
        benches?: number;
        bins?: number;
        bicycles?: number;
        markers?: number;
      } | undefined;
      return {
        loaded: root !== undefined,
        floraInstances,
        faunaInstances,
        streetItems,
        flowerBeds: contract?.flowerBeds ?? 0,
        benches: contract?.benches ?? 0,
        bins: contract?.bins ?? 0,
        bicycles: contract?.bicycles ?? 0,
        genericMarkers: contract?.markers ?? 0,
      };
    })(),
    arenaStoryReady: blenderArenaActive || ['route-marker-verdant-array', 'route-marker-civic-transit', 'route-marker-helio-service']
      .every((name) => scene.getObjectByName(name) !== undefined),
    interiorTelemetry: (() => {
      const counts = { ...arena.houseTelemetry, furnishings: 0, fixtures: 0, visibleCollisionProxies: 0, visibleRamps: 0 };
      const materialFamilies = new Set<string>();
      const texturedMaterialFamilies = new Set<string>();
      scene.traverse((node) => {
        if (node instanceof THREE.Mesh && /^(upper-room-(bed|headboard|workbench|console)|performance-interior)/.test(node.name)) {
          counts.furnishings += 1;
          const family = typeof node.userData.interiorMaterialFamily === 'string'
            ? node.userData.interiorMaterialFamily
            : null;
          if (family) {
            materialFamilies.add(family);
            const materials = Array.isArray(node.material) ? node.material : [node.material];
            if (materials.some((material) => material instanceof THREE.MeshStandardMaterial && material.map)) {
              texturedMaterialFamilies.add(family);
            }
          }
        }
        if (/interior-ceiling-light|balcony-rail|house-gable-finish|house-gutter|house-chimney/.test(node.name)) counts.fixtures += 1;
        if (node.userData.collisionProxy === true && node.visible) counts.visibleCollisionProxies += 1;
        if (/^(exterior|interior)-access-ramp$/.test(node.name)
          && (node.visible || node.userData.staticBatchRendered === true)) counts.visibleRamps += 1;
      });
      const semanticRoot = scene.getObjectByName('performance-interior-furnishing-sets');
      const semantic = semanticRoot?.userData.semanticInterior as {
        houses?: number;
        sourcePieces?: number;
        batches?: number;
      } | undefined;
      return {
        ...counts,
        furnishingSets: semantic?.houses ?? 0,
        furnishingSourcePieces: semantic?.sourcePieces ?? 0,
        furnishingBatches: semantic?.batches ?? 0,
        furnishingMaterialFamilies: [...materialFamilies].sort(),
        texturedFurnishingMaterialFamilies: [...texturedMaterialFamilies].sort(),
      };
    })(),
    weaponReady: weaponView.isReady(),
    weaponPresentation: {
      ...weaponView.presentationState(),
      depthSeparatedFromWorld: true,
    },
    sniperScope: {
      active: !sniperScopeOverlay.hidden,
      magnification: 3,
      baseFov: preferredFov,
      cameraFov: camera.fov,
      viewmodelVisible: weaponView.root.visible,
    },
    weaponActionHistory: [...weaponActionHistory],
    menuVisible: !menu.classList.contains('hidden'),
    menuCamera: {
      position: camera.position.toArray(),
      towerNdc: new THREE.Vector3(0, 6, 0).project(camera).toArray(),
    },
    render: {
      profile: renderProfile,
      representation: activeRenderConfig.representation,
      atomicSignal: atomicSignal.telemetry(),
      materialCompatibility: { ...materialCompatibility },
      fpsCounter: {
        value: fpsCounterValue.textContent,
        pacing: fpsCounter.dataset.pacing ?? 'warming',
        visible: !hudRoot.hidden,
        anchor: 'top-right',
      },
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
      antialias: renderer.getContext().getContextAttributes()?.antialias ?? false,
      webglVersion: renderer.getContext().getParameter(renderer.getContext().VERSION),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      sceneObjects: scene.children.length,
      reducedMode: reducedRenderMode,
      shadows: renderer.shadowMap.enabled,
      shadowAutoUpdate: renderer.shadowMap.autoUpdate,
      shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
      staticShadowDynamicRefreshes,
      contextLifecycle: {
        lost: webglContextLost,
        losses: webglContextLosses,
        restorations: webglContextRestorations,
      },
      authoredShadows: activeRenderConfig.shadows,
      shadowMode: activeRenderConfig.shadowMode,
      framePacing: framePacing.summary(),
      minimapRenders: minimapRenderCount,
      adaptive: adaptiveQuality.telemetry(),
      graphicsRefinement: graphicsRefinement.telemetry(),
      qualityAssetStreaming: { ...qualityAssetStreaming },
      lighting: {
        ...activeLighting,
        fogNear: scene.fog instanceof THREE.Fog ? scene.fog.near : activeLighting.fogNear,
        fogFar: scene.fog instanceof THREE.Fog ? scene.fog.far : activeLighting.fogFar,
      },
      sky: {
        pass: 30,
        top: `#${activeLighting.skyTop.toString(16).padStart(6, '0')}`,
        horizon: `#${activeLighting.skyHorizon.toString(16).padStart(6, '0')}`,
        bottom: `#${activeLighting.skyBottom.toString(16).padStart(6, '0')}`,
        cloudShadow: `#${activeLighting.skyCloudShadow.toString(16).padStart(6, '0')}`,
        cloudLight: `#${activeLighting.skyCloudLight.toString(16).padStart(6, '0')}`,
        cloudBands: skyCloudsEnabled ? 2 : 0,
        fogColor: `#${activeLighting.fogColor.toString(16).padStart(6, '0')}`,
        fogNear: scene.fog instanceof THREE.Fog ? scene.fog.near : activeLighting.fogNear,
        fogFar: scene.fog instanceof THREE.Fog ? scene.fog.far : activeLighting.fogFar,
        godRayStrength: actualGodRayStrength,
        godRayLobes: actualGodRayLobes,
        extraDraws: 0,
        extraTextureSamples: 0,
        linearHdr: true,
      },
      grass: grassSystem.telemetry(),
      atmosphere: atmosphereSystem.telemetry(),
      water: waterSystem.telemetry(),
      blenderEnvironment: {
        ...blenderArenaTelemetry(),
        proceduralRootActuallyVisible: atomicArena.root.visible,
        qualityArtRootVisible: blenderArenaActive && arenaArtRoot?.visible === true,
        overlappingPrimaryArenaRoots: atomicArena.root.visible && blenderArenaActive && arenaArtRoot?.visible === true,
      },
      rustworksBlender: rustworksBlenderTelemetry(),
      rustworksQuality: rustworksQualityTelemetry(renderProfile, selectedArena.id),
      staticBatchPalette: scene.getObjectByName('Atomic Acres arena-render-batches')?.children.flatMap((node) => {
        const sourcePalette = node.userData.sourcePalette;
        if (Array.isArray(sourcePalette)) return sourcePalette.filter((color): color is string => typeof color === 'string');
        const material = node instanceof THREE.Mesh ? node.material : null;
        return !Array.isArray(material) && material && 'color' in material
          ? [(material as THREE.MeshBasicMaterial).color.getHexString()]
          : [];
      }) ?? [],
    },
  }),
  traceBallistics: (weapon, origin, direction, distance, arenaId = selectedArena.id) => {
    const traceArena = arenaById[arenaId];
    const brokenWindowIds = new Set(traceArena.breakableWindows.filter((pane) => pane.broken).map((pane) => pane.id));
    const surfaces = traceArena.shotSurfaces.filter(
      (surface) => !surface.breakableWindowId || !brokenWindowIds.has(surface.breakableWindowId),
    );
    return traceBallisticPath(
      new THREE.Vector3(...origin),
      new THREE.Vector3(...direction),
      distance,
      WEAPONS[weapon].penetration,
      surfaces,
    );
  },
  startSolo: () => {
    element<HTMLInputElement>('#player-name').value = 'QA Operator';
    network.close();
    resetForMode();
    startGame('solo', false);
  },
  setBotsFrozen: (frozen: boolean) => { botsFrozen = frozen; },
  stageHostedBotAgainstRemote: () => {
    if (network.role !== 'host') return null;
    const remote = [...remotes.values()].find((candidate) => candidate.snapshot.hp > 0);
    if (!remote) return null;
    const bot = [...bots.values()].find((candidate) => candidate.id.startsWith('host-bot-'));
    if (!bot) return null;
    // This debug-only stage isolates the bot→guest authority adapter even when
    // the surrounding QA lobby is TDM and its default hosted bots share the guest team.
    if (!areCombatantsHostile(bot.id, bot.team, remote.snapshot.id, remote.snapshot.team)) {
      bot.team = remote.snapshot.team === 0 ? 1 : 0;
    }
    const remoteStance = remote.snapshot.stance ?? 'stand';
    const target = remote.target.clone();
    target.y += stanceEyeHeight(remoteStance);
    let staged: THREE.Vector3 | null = null;
    for (const radius of [3, 5, 7, 9, 12]) {
      for (let index = 0; index < 16; index += 1) {
        const angle = index * Math.PI / 8;
        const candidate = new THREE.Vector3(
          target.x + Math.cos(angle) * radius,
          0,
          target.z + Math.sin(angle) * radius,
        );
        const bodyPoint = { x: candidate.x, y: 0, z: candidate.z };
        if (!pointInsideBounds(bodyPoint, arena.bounds, 0.55) || isBlocked(bodyPoint, arena.colliders, 0.45)) continue;
        bot.position.copy(candidate);
        if (botHasLineOfSight(bot, target)) {
          staged = candidate;
          break;
        }
      }
      if (staged) break;
    }
    if (!staged) return null;
    const now = performance.now();
    bot.position.copy(staged);
    bot.root.position.copy(staged);
    bot.root.rotation.y = operatorYawToward(bot.position, target);
    bot.root.updateMatrixWorld(true);
    bot.lastSightAt = 0;
    bot.hasLineOfSight = false;
    bot.sightStartedAt = now - BOT_REACTION_DELAY;
    bot.lastShotAt = 0;
    bot.burstShots = 0;
    bot.nextDecisionAt = 0;
    bot.nextGrenadeAt = now + 60_000;
    bot.invulnerableUntil = 0;
    botsFrozen = false;
    return { botId: bot.id, targetId: remote.snapshot.id };
  },
  setBotPresentation: (stance, speed = 0, weapon) => {
    debugBotStanceOverride = stance;
    debugBotSpeedOverride = Math.max(0, Number.isFinite(speed) ? speed : 0);
    botsFrozen = stance !== null;
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (bot && weapon) {
      bot.weapon = weapon;
      setOperatorWeapon(bot.root, weapon, flattenOperatorMaterials);
    }
  },
  clearBots: () => clearBots(),
  placeBotAhead: (distance = 5) => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (!bot) return;
    const stagedDistance = THREE.MathUtils.clamp(distance, 2.5, 9);
    const origin = player.position.clone();
    let stagedPosition: THREE.Vector3 | null = null;
    // QA combat staging must not place the target inside a house, bus or cover
    // AABB. Try the requested forward ray first, then nearby clear bearings.
    const stagedYawOffsets = Array.from({ length: 16 }, (_, index) => {
      if (index === 0) return 0;
      const step = Math.ceil(index / 2);
      return step * (Math.PI / 8) * (index % 2 === 1 ? 1 : -1);
    });
    for (const yawOffset of stagedYawOffsets) {
      const yaw = player.yaw + yawOffset;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const candidate = new THREE.Vector3(player.position.x, 0, player.position.z)
        .addScaledVector(forward, stagedDistance);
      const bodyPoint = { x: candidate.x, y: 0, z: candidate.z };
      if (!pointInsideBounds(bodyPoint, arena.bounds, 0.55) || isBlocked(bodyPoint, arena.colliders, 0.45)) continue;
      const clearAtHeight = (height: number) => {
        const target = candidate.clone().add(new THREE.Vector3(0, height, 0));
        const ray = target.clone().sub(origin);
        const targetDistance = ray.length();
        return !new THREE.Raycaster(origin, ray.normalize(), 0, targetDistance)
          .intersectObjects(arena.raycastMeshes, false)
          .some((hit) => hit.distance < targetDistance - 0.2);
      };
      // The old probe only cleared a torso ray, so a tree/awning could still
      // mask the visible skull and make the headshot acceptance intermittent.
      if (!clearAtHeight(1.06) || !clearAtHeight(1.58)) continue;
      stagedPosition = candidate;
      break;
    }
    if (!stagedPosition) return;
    bot.position.copy(stagedPosition);
    bot.root.position.copy(bot.position);
    bot.velocity.set(0, 0, 0);
    bot.root.rotation.y = operatorYawToward(bot.position, player.position);
    poseOperator(bot.root, 'stand', 0, performance.now() * 0.001);
    bot.root.updateMatrixWorld(true);
    bot.invulnerableUntil = 0;
  },
  placeBotRelative: (right = 0, forward = 5) => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (!bot) return;
    const cameraForward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const cameraRight = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    bot.position.set(player.position.x, 0, player.position.z)
      .addScaledVector(cameraRight, THREE.MathUtils.clamp(right, -9, 9))
      .addScaledVector(cameraForward, THREE.MathUtils.clamp(forward, -9, 9));
    bot.root.position.copy(bot.position);
    bot.velocity.set(0, 0, 0);
    bot.root.rotation.y = operatorYawToward(bot.position, player.position);
    bot.root.updateMatrixWorld(true);
    bot.invulnerableUntil = 0;
    bot.lastShotAt = performance.now();
  },
  showBotDamageDirection: () => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (!bot) return null;
    showDamageDirection(bot.id);
    return sourceScreenAngle(player.position, player.yaw, bot.position);
  },
  respawn: () => respawn(false),
  aimAtBot: (zone: HitZone = 'body') => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (!bot) return;
    const targetOffset = hitProxyZoneCentre(zone, bot.root.userData.operatorStance ?? 'stand');
    const target = bot.position.clone().add(new THREE.Vector3(...targetOffset));
    const delta = target.sub(player.position);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
  },
  aimAtRemote: (zone: HitZone = 'body') => {
    const remote = remotes.values().next().value as RemotePlayer | undefined;
    if (!remote) return;
    const targetOffset = hitProxyZoneCentre(zone, remote.snapshot.stance ?? 'stand');
    const target = remote.target.clone().add(new THREE.Vector3(...targetOffset));
    const delta = target.sub(player.position);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    remote.root.position.copy(remote.target);
    remote.root.updateMatrixWorld(true);
  },
  stageWindow: (index: number, distance = 3) => {
    const window = arena.breakableWindows[Math.max(0, Math.min(arena.breakableWindows.length - 1, Math.floor(index)))];
    if (!window) return;
    const target = window.mesh.getWorldPosition(new THREE.Vector3());
    const house = arena.houses.reduce((nearest, candidate) => {
      const currentDistance = Math.hypot(target.x - candidate.origin.x, target.z - candidate.origin.z);
      const nearestDistance = Math.hypot(target.x - nearest.origin.x, target.z - nearest.origin.z);
      return currentDistance < nearestDistance ? candidate : nearest;
    }, arena.houses[0]);
    const staged = selectPlayableWindowApproach(target, house.origin, arena.bounds, arena.colliders, distance);
    if (!staged) return;
    const eye = new THREE.Vector3(staged.x, staged.y, staged.z);
    player.position.copy(eye);
    characterPhysics?.teleportEye(player.position);
    player.velocity.set(0, 0, 0);
    const delta = target.clone().sub(player.position);
    player.yaw = Math.atan2(-delta.x, -delta.z);
    player.pitch = Math.atan2(delta.y, Math.hypot(delta.x, delta.z));
    player.invulnerableUntil = 0;
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
  },
  detonateGrenadeAtWindow: (index: number) => {
    const pane = arena.breakableWindows[Math.max(0, Math.min(arena.breakableWindows.length - 1, Math.floor(index)))];
    return pane ? breakWindowsInGrenadeBlast(pane.mesh.getWorldPosition(new THREE.Vector3()), randomNonce(), true) : 0;
  },
  stageYardhawkWall: (team: Team = 0) => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    const house = arena.houses.find((candidate) => candidate.team === team);
    const wall = house?.solids.find((solid) => solid.name === 'front-ground-centre');
    if (!bot || !house || !wall) return false;
    fieldSupport = { ...fieldSupport, available: { ...fieldSupport.available, yardhawk: true } };
    activateFieldSupport('yardhawk');
    if (!yardhawk) return false;
    const outward = house.origin.facing;
    const start = new THREE.Vector3(wall.position[0], 1.15, wall.position[2] + outward * 1.2);
    const target = new THREE.Vector3(wall.position[0], 0, wall.position[2] - outward * 1.4);
    bot.position.copy(target);
    bot.root.position.copy(target);
    bot.root.updateMatrixWorld(true);
    bot.hp = 100;
    bot.alive = true;
    bot.invulnerableUntil = 0;
    yardhawk.root.position.copy(start);
    yardhawk.phase = 'homing';
    yardhawk.targetId = bot.id;
    yardhawk.armedAt = 0;
    yardhawk.expiresAt = performance.now() + 5_000;
    return true;
  },
  stageBotAtIndoorRamp: (team: Team = 0, descending = false) => {
    const house = arena.houses.find((candidate) => candidate.team === team);
    const foot = house?.anchors.find((anchor) => anchor.id === 'indoor-ramp-foot');
    const top = house?.anchors.find((anchor) => anchor.id === 'indoor-ramp-top');
    const bot = [...bots.values()][0];
    if (!house || !foot || !top || !bot) return false;
    const playerAnchor = descending ? foot : top;
    const botAnchor = descending ? top : foot;
    player.position.set(playerAnchor.position[0], descending ? 1.7 : top.position[1], playerAnchor.position[2]);
    characterPhysics?.teleportEye(player.position);
    player.velocity.set(0, 0, 0);
    player.hp = 100;
    player.alive = true;
    player.invulnerableUntil = performance.now() + 30_000;
    bot.position.set(botAnchor.position[0], descending ? 3.48 : 0, botAnchor.position[2]);
    bot.root.position.copy(bot.position);
    bot.velocity.set(0, 0, 0);
    bot.hp = 100;
    bot.alive = true;
    bot.blockedSince = 0;
    bot.hasLineOfSight = false;
    bot.sightStartedAt = 0;
    botsFrozen = false;
    return true;
  },
  damageBot: (amount, zone = 'body') => {
    const bot = [...bots.values()].find((candidate) => candidate.alive);
    if (!bot || !Number.isFinite(amount) || amount <= 0) return;
    bot.invulnerableUntil = 0;
    applyBotDamage(bot, amount, zone);
  },
  damageBotWithCause: (kind) => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (!bot) return;
    if (!bot.alive) respawnBot(bot, performance.now());
    bot.invulnerableUntil = 0;
    const cause: KillCause = kind === 'gun' ? { kind: 'gun', weapon: player.weapon }
      : kind === 'killstreak' ? { kind: 'killstreak', effect: 'tri-pass' }
        : kind === 'grenade' ? { kind: 'grenade' }
          : kind === 'melee' ? { kind: 'melee' }
            : { kind: 'environment' };
    applyBotDamage(bot, 999, 'body', cause);
  },
  meleeBot: () => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (bot) meleeOperator(bot.root);
  },
  activateDormantReinforcement: () => {
    const started = performance.now();
    const activated = activateDormantBot(bots.size);
    return { activated, syncMs: performance.now() - started };
  },
  stageHouseRamp: (kind: 'interior' | 'exterior', team: Team = 0) => {
    const house = arena.houses.find((candidate) => candidate.team === team);
    const footId = kind === 'interior' ? 'indoor-ramp-foot' : 'ramp-foot';
    const topId = kind === 'interior' ? 'indoor-ramp-top' : 'ramp-top';
    const foot = house?.anchors.find((entry) => entry.id === footId);
    const top = house?.anchors.find((entry) => entry.id === topId);
    if (!house || !foot || !top) return null;
    const uphill = new THREE.Vector3(
      top.position[0] - foot.position[0],
      0,
      top.position[2] - foot.position[2],
    );
    const run = uphill.length();
    if (run < 0.01) return null;
    uphill.multiplyScalar(1 / run);
    const start = new THREE.Vector3(foot.position[0], 1.7, foot.position[2]).addScaledVector(uphill, -0.65);
    player.position.copy(start);
    characterPhysics?.teleportEye(player.position);
    player.velocity.set(0, 0, 0);
    playerGrounded = false;
    wasGrounded = false;
    player.yaw = Math.atan2(-uphill.x, -uphill.z);
    player.pitch = 0;
    player.invulnerableUntil = 0;
    camera.position.copy(player.position);
    camera.rotation.set(0, player.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    return {
      kind,
      start: start.toArray(),
      foot: [...foot.position],
      top: [...top.position],
      uphill: uphill.toArray(),
      run,
    };
  },
  stageRustworksAccess: (route: 'ground-to-lower' | 'lower-to-upper', descending = false) => {
    if (selectedArena.id !== 'rustworks-1v1') return null;
    const routes = arena.root.userData.rustworksRoutes as Record<string, Array<{
      id: string;
      position: [number, number, number];
    }>> | undefined;
    const anchors = routes?.[route];
    if (!anchors || anchors.length < 2) return null;
    const from = descending ? anchors[1] : anchors[0];
    const to = descending ? anchors[0] : anchors[1];
    const direction = new THREE.Vector3(
      to.position[0] - from.position[0],
      0,
      to.position[2] - from.position[2],
    );
    const run = direction.length();
    if (run < 0.01) return null;
    direction.multiplyScalar(1 / run);
    const start = new THREE.Vector3(...from.position);
    player.position.copy(start);
    characterPhysics?.teleportEye(player.position);
    player.velocity.set(0, 0, 0);
    playerGrounded = false;
    wasGrounded = false;
    player.yaw = Math.atan2(-direction.x, -direction.z);
    player.pitch = 0;
    player.hp = 100;
    player.alive = true;
    player.invulnerableUntil = performance.now() + 30_000;
    camera.position.copy(player.position);
    camera.rotation.set(0, player.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    return {
      route,
      descending,
      start: start.toArray(),
      target: [...to.position],
      direction: direction.toArray(),
      run,
    };
  },
  teleportPlayer: (x, y, z, yaw = player.yaw, pitch = player.pitch) => {
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
    player.position.set(x, y, z);
    characterPhysics?.teleportEye(player.position);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = THREE.MathUtils.clamp(pitch, -1.5, 1.5);
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    player.invulnerableUntil = 0;
  },
  setCaptureCameraPose: (x, y = 0, z = 0, yaw = 0, pitch = 0) => {
    debugCaptureCameraActive = [x, y, z, yaw, pitch].every(Number.isFinite);
    if (!debugCaptureCameraActive) return;
    debugCaptureCameraPosition.set(x!, y, z);
    debugCaptureCameraYaw = yaw;
    debugCaptureCameraPitch = THREE.MathUtils.clamp(pitch, -1.5, 1.5);
  },
  setCaptureViewmodelHidden: (hidden) => { debugCaptureViewmodelHidden = hidden; },
  stageLoadingCaptureSquad: () => {
    if (selectedArena.id !== 'atomic-acres' || gameMode !== 'solo' || !gameStarted) {
      return { staged: false, characters: 0, positions: [] };
    }
    while (bots.size < 3 && activateDormantBot(bots.size)) {
      // Capture three genuine runtime operators without changing live match defaults.
    }
    const captureCamera = new THREE.Vector3(0, 0, 18);
    const placements = [
      new THREE.Vector3(0.75, 0, 12.25),
      new THREE.Vector3(3.35, 0, 10.3),
      new THREE.Vector3(5.55, 0, 8.4),
    ].map((position) => ({ position, yaw: operatorYawToward(position, captureCamera) }));
    const stagedBots = [...bots.values()].slice(0, placements.length);
    const now = performance.now();
    for (let index = 0; index < stagedBots.length; index += 1) {
      const bot = stagedBots[index];
      const placement = placements[index];
      bot.position.copy(placement.position);
      bot.velocity.set(0, 0, 0);
      bot.hp = 100;
      bot.alive = true;
      bot.hasLineOfSight = false;
      bot.sightStartedAt = 0;
      bot.burstShots = 0;
      bot.invulnerableUntil = now + 60_000;
      bot.root.position.copy(bot.position);
      bot.root.rotation.set(0, placement.yaw, 0);
      bot.root.scale.setScalar(1);
      bot.root.visible = true;
      const haze = bot.root.getObjectByName('neon-purple-bot-haze');
      if (haze) haze.visible = false;
      resetOperator(bot.root);
      poseOperator(bot.root, 'stand', 0, now * 0.001);
      bot.root.updateMatrixWorld(true);
    }
    botsFrozen = true;
    return {
      staged: stagedBots.length === placements.length,
      characters: stagedBots.length,
      positions: stagedBots.map((bot) => bot.position.toArray()),
    };
  },
  collisionProbe: (x, z) => Number.isFinite(x) && Number.isFinite(z)
    ? isBlocked({ x, y: 0, z }, arena.colliders, 0.44)
    : true,
  collisionProbeAt: (x, y, z) => [x, y, z].every(Number.isFinite)
    ? isBlocked({ x, y, z }, arena.colliders, 0.36)
    : true,
  segmentBlocked: (x1, z1, x2, z2) => arena.colliders.some((box) => segmentIntersectsBox(
    new THREE.Vector3(x1, 0.2, z1),
    new THREE.Vector3(x2, 1.1, z2),
    box,
  )),
  selectTriPassWorldTargets: (points) => {
    if (!triPassTargeting || !tacticalMapOpen) return false;
    let next = triPassTargeting;
    for (const [x, z] of points.slice(0, 3)) next = registerTriPassTarget(next, { x, z }, arena.bounds);
    triPassTargeting = next;
    drawStrikeMap();
    if (!next.complete) return false;
    authorizeLocalOffensiveSupport('tri-pass', next.points.map((point) => [point.x, 0.2, point.z]));
    scheduleTriPassMissiles(next.points, performance.now());
    cancelTriPassTargeting(false);
    return true;
  },
  captureShadowProbeFrame: (horizontalOffset) => {
    if (!debugShadowProbe) {
      debugShadowProbe = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 2, 0.9),
        new THREE.MeshStandardMaterial({ colorWrite: false, depthWrite: false }),
      );
      debugShadowProbe.name = 'pass25a-shadow-output-probe';
      debugShadowProbe.castShadow = true;
      debugShadowProbe.frustumCulled = false;
      scene.add(debugShadowProbe);
    }
    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    debugShadowProbe.position.copy(camera.position)
      .addScaledVector(forward, 6)
      .addScaledVector(right, THREE.MathUtils.clamp(horizontalOffset, -3, 3));
    debugShadowProbe.position.y = 1;
    renderer.shadowMap.needsUpdate = true;
    atomicSignal.render(scene, camera);
    const gl = renderer.getContext();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 0x811c9dc5;
    for (const byte of pixels) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  },
  setRenderPaused: (paused: boolean) => { debugRenderPaused = paused; },
  openMenu: () => {
    clearGameplayInput();
    menu.classList.remove('hidden');
  },
  fireOnce: () => {
    debugInputUnlocked = true;
    triggerHeld = true;
    tryFire(performance.now());
    triggerHeld = false;
    debugInputUnlocked = false;
  },
  throwGrenade: () => throwGrenade(),
  switchWeapon: (index: number) => switchWeapon(index),
  equipKit: (id: FieldKitId) => {
    const kit = fieldKitById(id);
    selectedFieldKit = kit.id;
    localStorage.setItem(FIELD_KIT_STORAGE_KEY, serializeFieldKitSelection(selectedFieldKit));
    player.primaryWeapon = kit.weapon;
    player.weapon = kit.weapon;
    player.ammo[kit.weapon] = WEAPONS[kit.weapon].mag;
    player.reserve[kit.weapon] = WEAPONS[kit.weapon].reserve;
    player.nextShotAt = 0;
    weaponView.setWeapon(player.weapon, true);
    renderFieldKitSelection();
  },
  equipWeapon: (weapon: WeaponId) => {
    if (PRIMARY_WEAPON_IDS.includes(weapon as PrimaryWeaponId)) {
      player.primaryWeapon = weapon as PrimaryWeaponId;
      if (selectedArena.id === 'gun-range') rangePrimaryUnlocked = true;
    }
    player.weapon = weapon;
    player.ammo[weapon] = WEAPONS[weapon].mag;
    player.reserve[weapon] = WEAPONS[weapon].reserve;
    player.nextShotAt = 0;
    weaponView.setWeapon(weapon, true);
  },
  interactDrop: () => interactWithWeaponPickup(),
  setAmmo: (weapon: WeaponId, ammo: number, reserve: number) => {
    player.ammo[weapon] = Math.max(0, Math.min(WEAPONS[weapon].mag, Math.floor(ammo)));
    player.reserve[weapon] = Math.max(0, Math.min(WEAPONS[weapon].reserve, Math.floor(reserve)));
  },
  setGrenades: (count: number) => {
    if (Number.isFinite(count)) player.grenades = Math.max(0, Math.min(2, Math.floor(count)));
  },
  reload: () => reload(),
  melee: () => {
    const before = player.lastMeleeAt;
    melee();
    return { accepted: player.lastMeleeAt !== before, alive: player.alive, phase: matchState.phase, lastMeleeAt: player.lastMeleeAt };
  },
  setAds: (held: boolean) => { debugAdsOverride = held; adsHeld = held; },
  setMovement: (forward: boolean, sprint = false) => {
    keys.delete('KeyW');
    keys.delete('ShiftLeft');
    keys.delete('ShiftRight');
    if (forward) keys.add('KeyW');
    if (forward && sprint) keys.add('ShiftLeft');
  },
  setMeleeCaptureProgress: (progress: number | null) => weaponView.setMeleeCaptureProgress(progress),
  setFireCaptureAgeMs: (ageMs: number | null) => weaponView.setFireCaptureAgeMs(ageMs),
  setReloadCaptureProgress: (progress: number | null) => {
    debugReloadProgress = progress === null ? null : THREE.MathUtils.clamp(progress, 0, 1);
  },
  setGrassTime: (timeSeconds: number | null) => grassSystem.setDebugTime(timeSeconds),
  setGrassInteractionProbe: (x: number | null, z: number | null) => grassSystem.setDebugInteraction(x, z),
  sampleGrassBend: (index: number) => grassSystem.sampleDebugBend(index),
  renderAudit: () => {
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projection);
    const visible: Array<{ name: string; material: string; triangles: number }> = [];
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh) || !node.layers.test(camera.layers)) return;
      let ancestor: THREE.Object3D | null = node;
      while (ancestor) {
        if (!ancestor.visible) return;
        ancestor = ancestor.parent;
      }
      if (node.frustumCulled && !frustum.intersectsObject(node)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      const positionCount = node.geometry.getAttribute('position')?.count ?? 0;
      const triangles = Math.floor((node.geometry.index?.count ?? positionCount) / 3);
      visible.push({
        name: node.name || node.parent?.name || '(unnamed)',
        material: materials.map((material) => `${material.type}:${material.name || material.uuid.slice(0, 8)}`).join(','),
        triangles,
      });
    });
    return visible.sort((a, b) => a.name.localeCompare(b.name));
  },
  setStance: (stance: Stance) => {
    if (stance === player.stance) return;
    if (stance === 'stand') requestStance('stand');
    else if (stance === 'prone') requestStance('toggle-prone');
    else requestStance('toggle-crouch');
  },
  damage: (amount: number) => {
    player.invulnerableUntil = 0;
    applyDamage(amount, bots.keys().next().value ?? player.id);
  },
  damageFromRemote: (amount: number, kind = 'gun') => {
    const remote = remotes.values().next().value as RemotePlayer | undefined;
    if (!remote) return;
    player.invulnerableUntil = 0;
    const cause: KillCause = kind === 'gun' ? { kind: 'gun', weapon: remote.snapshot.weapon }
      : kind === 'killstreak' ? { kind: 'killstreak', effect: 'tri-pass' }
        : kind === 'grenade' ? { kind: 'grenade' }
          : kind === 'melee' ? { kind: 'melee' }
            : { kind: 'environment' };
    applyDamage(amount, remote.snapshot.id, 1, false, cause);
  },
  earnSupport: (eliminations: number) => {
    for (let index = 0; index < Math.max(0, Math.min(15, Math.floor(eliminations))); index += 1) awardSupportElimination(false);
  },
  forceBotGrenade: (fuseMs = 1_100) => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    return bot ? throwBotGrenade(bot, performance.now(), fuseMs) : false;
  },
  activateSupport: (id: FieldSupportId) => activateFieldSupport(id),
  setOverdrive: (mode: 'charging' | 'available' | 'active' | 'expired') => {
    const now = performance.now();
    if (mode === 'charging') overdriveState = createOverdriveState(now);
    else if (mode === 'available') overdriveState = { ...createOverdriveState(now), available: false, nextSpawnAt: now };
    else if (mode === 'active') overdriveState = {
      generation: overdriveState.generation + 1, available: false, nextSpawnAt: now + OVERDRIVE_SPAWN_INTERVAL_MS,
      holderId: player.id, activeUntil: now + OVERDRIVE_DURATION_MS,
    };
    else overdriveState = { ...overdriveState, available: false, holderId: null, activeUntil: 0, nextSpawnAt: now + OVERDRIVE_SPAWN_INTERVAL_MS };
    updateOverdrive(now);
    broadcastOverdriveState(now);
  },
  degradeStateChannel: () => localMultiplayerQa && network.degradeStateChannelForQa(),
  sendPing: (kind: TeamPingKind) => sendTeamPing(kind),
  holdPings: (durationMs = 30_000) => {
    const expiresAt = performance.now() + Math.max(0, Math.min(60_000, durationMs));
    for (const ping of activeTeamPings) ping.expiresAt = expiresAt;
  },
  endMatch: () => {
    const now = performance.now();
    matchState = {
      phase: 'active',
      phaseStartedAt: now - (selectedArena.matchRules.durationMs ?? 0),
      endsAt: now,
      winner: null,
    };
    if (selectedArena.matchRules.durationMs === null) {
      matchState = { phase: 'ended', phaseStartedAt: now, endsAt: now, winner: 0, endReason: 'time' };
      matchFinished = true;
      return;
    }
    updateMatchState(now);
  },
  rematch: () => {
    network.close();
    resetForMode();
    startGame('solo', false);
  },
  returnToMainMenu,
  selectArena: async (id: ArenaId) => activateArenaSelection(id),
  hitRangeTarget: (id, damage = 500, zone = 'body') => hitPracticeTarget(id, damage, zone),
  spawnDeathDrop: (ageMs = 0) => spawnDeathDrop({
    type: 'death',
    killer: 'qa-drop-auditor',
    victim: player.id,
    cause: { kind: 'environment' },
    nonce: randomNonce(),
  }, performance.now() - THREE.MathUtils.clamp(ageMs, 0, 30_100))?.drop.id ?? null,
  setKills: (kills: number) => {
    if (Number.isFinite(kills)) player.kills = Math.max(0, Math.floor(kills));
  },

};

async function bootstrap(): Promise<void> {
  const soloButton = element<HTMLButtonElement>('#solo');
  const hostButton = element<HTMLButtonElement>('#host');
  const joinButton = element<HTMLButtonElement>('#join');
  soloButton.disabled = true;
  hostButton.disabled = true;
  joinButton.disabled = true;
  setStatus('Loading authored arena art, weapons and advanced collision…');

  const physicsPromise = CharacterPhysics.create(arena.physicsColliders, arena.bounds);
  const weaponPromise = weaponView.load((loaded, total) => {
    setStatus(`Loading authored weapons ${loaded}/${total}…`);
  });
  const artPromise = renderProfile === 'blender' && selectedArena.id === 'atomic-acres'
    ? (async () => {
        qualityAssetStreaming.eagerQualityGlbs += 1;
        try {
          const art = await loadBlenderArena(scene, atomicArena, (loaded, total) => {
            const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
            setStatus(`Loading Quality Graphics arena ${percent}%…`);
          });
          blenderArenaActive = true;
          qualityAssetStreaming.atomicAcres = 'ready';
          return art;
        } catch (error) {
          markBlenderArenaFallback(error);
          qualityAssetStreaming.atomicAcres = 'fallback';
          console.error('[Atomic Acres Quality Graphics asset load failed; using authored fallback]', error);
          return loadArenaArt(scene, (loaded, total) => {
            setStatus(`Quality Graphics fallback ${loaded}/${total}…`);
          }, false);
        }
      })()
    : loadArenaArt(scene, (loaded, total) => {
        setStatus(`Loading authored arena models ${loaded}/${total}…`);
      }, reducedWorldDetail);
  const rustworksArtPromise = renderProfile === 'blender' && selectedArena.id === 'rustworks-1v1'
    ? (qualityAssetStreaming.eagerQualityGlbs += 1, loadRustworksBlenderTower(rustworksArena.root)).then((root) => {
        // Authored kit is the Quality silhouette; keep only dirt ray-target + lights from procedural.
        setRustworksProceduralPresentationVisible(rustworksArena.root, false);
        setRustworksQualityPresentationActive(selectedArena.id === 'rustworks-1v1', renderProfile);
        qualityAssetStreaming.rustworks = 'ready';
        return root;
      }).catch((error) => {
        markRustworksBlenderFallback(error);
        qualityAssetStreaming.rustworks = 'fallback';
        console.error('[Rustworks Blender tower asset load failed; keeping procedural tower]', error);
        applyRustworksPresentationProfile(rustworksArena.root, renderProfile);
        setRustworksProceduralPresentationVisible(rustworksArena.root, true);
        return null;
      })
    : Promise.resolve(null).then((value) => {
        applyRustworksPresentationProfile(rustworksArena.root, renderProfile);
        setRustworksProceduralPresentationVisible(rustworksArena.root, true);
        return value;
      });
  const grenadePromise = loadGrenadePresentation();
  const choirPromise = audio.preloadSanctifiedFragChoir();
  const [physics, , art] = await Promise.all([
    physicsPromise, weaponPromise, artPromise, rustworksArtPromise, grenadePromise, choirPromise,
  ]);
  characterPhysics = physics;
  arenaArtRoot = art.root;
  // First-person geometry is composited after world depth is cleared. Contact
  // retreat still keeps it visually tucked near walls, while floor/wall depth
  // can no longer cut holes through hands and weapons in prone/crouch poses.
  weaponView.root.traverse((node) => node.layers.set(VIEWMODEL_RENDER_LAYER));
  await grenadeExplosionPresentation.prewarm(renderer, camera);
  await supportExplosionPresentation.prewarm(renderer, camera);
  await deathDropPresentationPool.prewarm(renderer, camera);
  await prewarmNukePresentation();
  const visibleMapMeshes = atomicArena.raycastMeshes.filter((mesh) => mesh.visible || mesh.userData.collisionProxy === true);
  atomicArena.raycastMeshes.splice(0, atomicArena.raycastMeshes.length, ...visibleMapMeshes);
  art.root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.userData.blocksShots === true) atomicArena.raycastMeshes.push(node);
  });
  materialCompatibility = tuneMaterialsForAtomicSignal(
    scene,
    weaponView.root,
    renderProfile,
    renderer.capabilities.getMaxAnisotropy(),
  );
  graphicsRefinement.refine(scene, renderer.capabilities.getMaxAnisotropy());
  await renderer.compileAsync(scene, camera);
  const arenaRoot = scene.getObjectByName('Atomic Acres arena');
  if (renderProfile !== 'blender') {
    batchStaticMeshes(rustworksArena.root, rustworksArena.root, () => '', staticMaterialMode);
    batchStaticMeshes(gunRangeArena.root, gunRangeArena.root, () => '', staticMaterialMode);
  } else {
    enhanceRustworksQualityMaterials(rustworksArena.root, renderProfile);
  }
  if (!blenderArenaActive) {
    if (arenaRoot) batchStaticMeshes(arenaRoot, arenaRoot, () => '', staticMaterialMode);
    const decorativeMaterialMode = staticMaterialMode === 'texture-lit' ? 'palette-lit' : staticMaterialMode;
    batchStaticMeshes(art.root, art.root, () => '', decorativeMaterialMode);
  }
  const lifeMaterialMode = staticMaterialMode === 'texture-lit' ? 'palette-lit' : staticMaterialMode;
  batchStaticMeshes(neighbourhoodLifeRoot, neighbourhoodLifeRoot, () => '', lifeMaterialMode);
  if (activeRenderConfig.shadowMode === 'static') renderer.shadowMap.needsUpdate = true;
  weaponView.setWeapon(player.weapon, true);
  setArenaPresentationVisibility();
  respawn();
  weaponView.root.visible = false;
  setArenaMenuCamera();

  arenaSelectionReady = true;
  syncArenaSelectionUi();
  setStatus(`${selectedArena.displayName} ready · ${selectedArena.rulesLabel}.`);
  requestAnimationFrame(frame);
}

void bootstrap().catch(showFatalError);
