import * as THREE from 'three';
import './style.css';
import { AtomicSignalPass, atomicSignalBypassReason, isSoftwareWebGLRenderer } from './atomic-signal';
import { AdaptiveQualityController, DeferredAdaptivePixelRatio, adaptiveShadowsEnabled, assertWebGpuAdmissionCompletionLatency, classifyDisplayFrameMs, configuredAdaptiveQualityLevels, shouldFreezeAdaptiveQualityForMatch } from './adaptive-quality';
import { GraphicsRefinementSystem, graphicsEffectsBudget, type GraphicsEffectsBudget } from './graphics-refinement';
import { ArenaContrastLighting } from './arena-contrast-lighting';
import { centeredReadbackRegion, detectLivePresentationStall, LegacyWebGlRenderRuntime, shouldResetPresentationAfterSchedulerGap, WebGpuRenderRuntime, resolveRenderRuntimeRequest, type WebGpuSubmissionMode } from './rendering/render-runtime';
import { estimateResidentObjectMemory } from './rendering/resident-memory';
import { ArenaVisualStreamController, loadArenaVisualModule, type ArenaVisualSwitchReceipt } from './rendering/arena-visual-stream';
import { ArenaRenderWatchdog, auditArenaRenderLiveness } from './rendering/arena-render-watchdog';
import { withArenaFrustumCullingDisabled } from './rendering/arena-coverage-prewarm';
import { ArenaTransitionProfiler, type ArenaTransitionProfilePhase } from './arena-transition-profile';
import { isViewmodelShadowLight, VIEWMODEL_SHADOW_BUDGET } from './rendering/runtime-shadow-budget';
import { auditRuntimeTslTraversal, assertRuntimeTslTraversal, createPass64TslSceneSystems, type Pass64TslSceneSystems } from './rendering/pass64-tsl-scene';
import type { ArenaVisualBudgets, ArenaVisualDefinition } from './rendering/arena-visual-definition';
import { auditLocalLightOcclusion } from './rendering/light-occlusion';
import { AtmosphereSystem, atmosphereFogRange } from './atmosphere-system';
import { WaterSystem } from './water-system';
import { PASS66_RELEASE_IDENTITY } from './release-identity';
import { batchStaticMeshes, buildOperator, deathOperator, fireOperator, meleeOperator, poseOperator, reactOperator, resetOperator, setOperatorWeapon, waitForPendingArtTextures } from './art-kit';
import {
  invalidatePass65PresentationTree,
  pass65WeaponCacheTelemetry,
  prewarmPass65RuntimeWeaponCorpus,
  releasePass65WeaponModelsIn,
} from './weapon-model';
import { applyBotEmissiveBrightness } from './operator-model';
import { isSharedMeshGeometry } from './gpu-resource-ownership';
import { GUN_RANGE_FIRING_LINE_Z, applyAdditionalMapPresentationProfile, applyRustworksPresentationProfile, buildGunRange, buildRustworks1v1, buildSkylineTerminal, updateGunRangePresentation } from './additional-maps';
import {
  BOT_DEATHS_PER_REINFORCEMENT,
  BOT_GRENADE_POOL,
  BOT_REACTION_DELAY,
  BOT_GRENADE_COOLDOWN_MS,
  BOT_WEAPON_POOL,
  advanceSpawnFlipHysteresis,
  botAimJitter,
  botCanFireWhileProtected,
  botWeaponBurstSize,
  botWeaponDefinition,
  botWeaponFireInterval,
  chooseBotIntent,
  chooseTacticalWaypoint,
  createShuffleBag,
  createSpawnFlipHysteresis,
  grenadeDefinition,
  operatorYawToward,
  respawnBotState,
  shouldBotThrowGrenade,
  shouldFlipSpawnSide,
  type SpawnFlipHysteresis,
} from './bot-ai';
import type { ShuffleBag } from './bot-arsenal';
import {
  admitBotFlash,
  createBotPerceptionState,
  resolveBotPerception,
  type BotPerceptionState,
} from './bot-perception-authority';
import { classifyFootstepSurface, classifyImpactSurface, nearMissStrength, type ImpactSurface } from './combat-feedback';
import { nextShotDeadline } from './combat-timing';
import { SEMTEX_HITL_CONTRACT, flashbangPresentation, semtexBlastDamage, semtexBlastRadiusM } from './combat/pass65-ordnance-contract';
import { ExplosiveBoltTargetBuffer, type ExplosiveBoltTargetKind } from './combat/explosive-bolt-target-buffer';
import { latestChangelogEntry } from './changelog';
import { bindReleaseHistoryDialog } from './ui/release-history-dialog';
import { bindProjectMapDialog } from './ui/project-map-dialog';
import { bindKillstreakLoadoutMenu, type KillstreakMenuBinding } from './ui/killstreak-loadout-menu';
import { assertUiSurfaceInventory } from './ui/surface-registry';
import { createPass64ShellViewModel, renderPass64Shell } from './ui/pass64-shell';
import { bindAdvancedGraphicsControls } from './ui/advanced-graphics-controls';
import { ADVANCED_GRAPHICS_CONTROLS, GRAPHICS_CAPABILITY_NOTICES, GRAPHICS_PRESET_VALUES } from './graphics-settings-registry';
import {
  INITIAL_MENU_LIFECYCLE_STATE,
  reduceMenuLifecycle,
  type MenuLifecycleEvent,
  type PointerLockRequestSource,
} from './ui/menu-lifecycle';
import { MenuPreviewVideoController, menuPreviewVideoDefinition } from './ui/menu-preview-video';
import { PresentationSchedulingLifecycle, type PresentationSchedulingDecision } from './presentation-scheduling-lifecycle';
import { PriorityPreparationCoordinator, type PreparationPriority } from './priority-preparation-coordinator';
import { flyingCatPose } from './gun-range-cat-choreography';
import { KillstreakLoadoutController } from './killstreak-loadout';
import type { KillstreakLoadoutV1, Pass65KillstreakId } from './killstreak-catalog';
import {
  HostKillstreakRuntime,
  chopperGunnerCameraOrigin,
  type KillstreakDamageEvent,
  type KillstreakRecipientSnapshot,
  type KillstreakWorld,
} from './killstreak-runtime';
import { KillstreakPresentation, loadHunterDronePresentation, loadSupportVehiclePresentations, supportVehiclePresentationTelemetry } from './killstreak-presentation';
import { PASS65_FLIGHT_NAVIGATION, resolveSupportFlightStep } from './killstreak-flight-navigation';
import { SupportPlacementGroundSampler } from './support-placement-ground';
import {
  applyPilotedDronePointerDelta,
  applyPilotedDroneScreenLookDelta,
  pilotedDroneControlAxes,
} from './killstreak-drone-input';
import {
  admitKillstreakCareCaptureResultMessage,
  admitKillstreakStateMessage,
  type KillstreakActivateIntentMessage,
  type KillstreakCareCaptureResultMessage,
  type KillstreakControlIntentMessage,
  type KillstreakDamageResultMessage,
  type KillstreakLoadoutIntentMessage,
  type KillstreakStateMessage,
} from './killstreak-protocol';
import {
  applyCareCaptureProjection,
  applyCareCaptureResult,
  careCaptureCrateId,
  createCareCaptureClientState,
  requestCareCapture,
  requestCareCaptureRelease,
} from './care-capture-client';
import { copyTextWithFallback } from './clipboard';
import { fieldKitById, type FieldKitId } from './loadout';
import { WEAPON_CATALOG } from './combat/weapon-catalog';
import {
  LOADOUT_STORAGE_SCHEMA_VERSION,
  createDefaultCustomPresets,
  createLoadoutItemEligibility,
  sanitizeLoadoutPresetName,
  type GrenadeId as LoadoutGrenadeId,
  type LoadoutPresetId,
  type LoadoutStorageV2,
  type SelectedLoadoutRef,
} from './loadout-preset-schema';
import { DHV_VALUES, applyDhvIncomingDamage, applyDhvWeaponOutgoingDamage, dhvLabel, isDhv, reportedDhvRawDamage, type Dhv } from './handicap';
import { GUN_RANGE_WEAPON_STATIONS, nearestGunRangeWeaponStation, type GunRangeWeaponStation } from './gun-range-armory';
import { loadGunRangeRackPresentation } from './gun-range-rack-presentation';
import { menuWeaponPrewarmCatalog, weaponPrewarmCatalogForArena } from './weapon-prewarm-catalog';
import { ArenaAudio, GRENADE_FUSE_BEEP_START_MS, crossbowFuseBeepIntervalMs, grenadeFuseBeepIntervalMs } from './audio';
import { clampPointToBounds, damp, isBlocked, pointInsideBounds, resolveHorizontalMove, segmentIntersectsBox, sphereIntersectsBox, sweepSphereAgainstBoxes } from './collision';
import {
  applyPenetrationDamage,
  ballisticImpactSurface,
  resolveBallisticHitscanAgainstTarget,
  traceBallisticPath,
  type BallisticMaterialId,
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
  effectiveHitZoneForWeapon,
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
import { preserveSoloCountdownCue, type MatchCountdownCue } from './match-countdown-continuity';
import { ArenaMap, buildArena } from './map';
import {
  admitCrossbowThroughGlass,
  admitGlassImpact,
  createGlassState,
  glassAuthorityProjection,
  type GlassImpactProfile,
} from './glass-authority';
import { activeSoloBotTarget, arenaSelection, soloLaunchLabel, type ArenaId, type ArenaSelection } from './map-selection';
import { headingDegrees, minimapLandmarkFootprint, minimapLandmarkLabel, northMarkerPosition, physicalCoverMinimapKind, playerFacingGeometry, playerUpRotationRadians, playerUpScaleX, shouldRevealEnemy, tacticalMapToWorld, worldToMinimap, worldToTacticalMap, type MinimapLandmarkKind } from './minimap';
import { authoredElevationAt, authoredVerticalRouteTarget, type ArenaVerticalNavigation } from './vertical-navigation';
import { sourceScreenAngle } from './directional-hud';
import { hitProxyZoneCentre } from './hit-proxies';
import { arenaZoneLabel, classifyArenaZone } from './arena-storytelling';
import { routeIdentityTelemetry } from './world-identity';
import { damageNumberPresentation, roundStatSummary } from './player-feedback';
import { SupportDamageFeedbackTelemetry, projectSupportDamageAnchor, type SupportDamageScreenAnchor } from './support-damage-feedback';
import { isHoldInteraction, primaryInteraction, type InteractionCandidate } from './interaction-arbitration';
import {
  createFInteractionPressState,
  fInteractionHoldProgress,
  reduceFInteractionPress,
  type FInteractionCancelReason,
  type FInteractionPressState,
} from './interaction-press-lifecycle';
import { LEADERBOARD_SEASON } from '../shared/leaderboard-season';
import { createWorldIdentityPresentation, setWorldIdentityHouseShellPresentation, type WorldIdentityPresentation } from './world-identity-presentation';
import { matchPresentationAt, respawnPresentation } from './match-presentation';
import { tuneMaterialsForAtomicSignal, type AtomicSignalMaterialAudit } from './material-compatibility';
import { addNeighbourhoodLife, loadArenaArt, updateArenaArt } from './environment-assets';
import { BLENDER_ARENA_ASSET, blenderArenaTelemetry, loadBlenderArena, markBlenderArenaFallback } from './blender-environment';
import {
  assertAtomicHouseAuthorityParity,
  auditAtomicHouseAuthorityParity,
  type AtomicHouseAuthorityParityReport,
} from './atomic-profile-authority-parity';
import { rustworksBlenderTelemetry, setRustworksProceduralPresentationVisible } from './rustworks-blender';
import {
  createRustworksQualityLights,
  enhanceRustworksQualityMaterials,
  ensureRustworksStarfield,
  rustworksLightingTint,
  rustworksQualityTelemetry,
  setRustworksQualityPresentationActive,
} from './rustworks-quality';
import { arenaLightingProfile } from './blender-lighting';
import { ImpactPresentation, type ImpactPresentationSurface } from './impact-presentation';
import {
  AUDIO_BUS_IDS,
  advancePresentationFrameAnchor,
  normalizePass65Settings,
  presentationFrameDue,
  resolveActiveGraphicsConfig,
  resolveAccessibilityRuntime,
  resolveDisplayedGraphicsPreset,
  resolveGraphicsRuntime,
  type GraphicsPreset,
  type Pass65Settings,
} from './pass65-settings';
import { PlayerProfileStore, type PlayerControlPreferencesV1 } from './player-profile';
import { arenaFootstepSurface, AudioOcclusionBudget, FootstepEmitterRegistry, type FootstepMovement } from './spatial-audio';
import {
  createDirectionalDamageState,
  createLowHealthFeedbackState,
  directionalDamagePresentation,
  recordDirectionalDamage,
  sampleLowHealthFeedback,
  type DirectionalDamageState,
  type LowHealthFeedbackState,
} from './sensory-feedback';
import { FramePacingSampler, cadenceWithNoProgressAge } from './frame-pacing';
import { GrenadeExplosionPresentation } from './grenade-explosion-presentation';
import { SupportExplosionPresentation } from './support-explosion-presentation';
import { GrassSystem } from './grass-system';
import {
  advanceRangeScore,
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
  OVERDRIVE_DURATION_MS,
  OVERDRIVE_PICKUP_RADIUS,
  OVERDRIVE_POSITION,
  OVERDRIVE_SPAWN_INTERVAL_MS,
  advanceOverdrive,
  claimOverdrive,
  createOverdriveState,
  dropOverdriveOnElimination,
  overdriveDamageMultiplier,
  overdriveRemainingMs,
  type OverdriveState,
} from './overdrive';
import {
  HUNTER_SWARM_BLAST_RADIUS,
  HUNTER_SWARM_COUNT,
  FIELD_SUPPORT,
  NUKE_WARNING_MS,
  SCOUT_SWEEP_DURATION_MS,
  TRI_PASS_BLAST_RADIUS,
  TRI_PASS_MAX_DAMAGE,
  assignHunterSwarmTargets,
  createTriPassTargeting,
  cycleFieldSupportSelection,
  hunterSwarmDamage,
  nukeDamageForTarget,
  projectFieldSupportActor,
  remoteExplosiveHitMaximumDistance,
  registerTriPassTarget,
  scoutSweepPulseVisible,
  selectTriPassHostiles,
  triPassSchedule,
  type FieldSupportId,
  type TriPassTargeting,
} from './field-support';
import { GrenadeWorldPresentationPool, grenadePresentationTelemetry, loadGrenadePresentation } from './grenade-presentation';
import {
  EXPLOSIVE_BOLT_ARM_DELAY_MS,
  EXPLOSIVE_BOLT_BLAST_MAX_DAMAGE,
  EXPLOSIVE_BOLT_DIRECT_DAMAGE,
  EXPLOSIVE_BOLT_MAX_LIFE_MS,
  EXPLOSIVE_BOLT_SPEED_MPS,
  explosiveBoltBlastDamage,
  explosiveBoltBlastRadiusM,
  calculateFlashExposure,
  shouldResolveFlashAgainstBots,
  smokeDensityAlongRay,
  type SmokeVolume,
} from './combat/ordnance';
import {
  DEATH_DROP_INTERACTION_RANGE,
  DEATH_DROP_SCAVENGE_RANGE,
  MAX_DEATH_DROPS,
  consumeDeathDropWeapon,
  createDeathDrop,
  deathDropAmmoAvailable,
  deathDropAvailable,
  deathDropWeaponAvailable,
  isPrimaryWeaponId,
  nearestDeathDrop,
  nearestScavengeDeathDrop,
  pruneDeathDrops,
  scavengeDeathDrop,
  type DeathDrop,
} from './death-drops';
import { DeathDropPresentationPool } from './death-drop-presentation';
import { ArenaNetwork } from './network';
import { loadRoomRejoinIdentity, releaseRoomRejoinIdentityLease, saveRoomRejoinIdentity } from './room-rejoin-identity';
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
  forgetLeaderboardInstallId,
  leaderboardNetworkEnabled,
  leaderboardInstallId,
  submitGlobalStreak,
} from './global-leaderboard';
import {
  SnapshotInterpolationBuffer,
  createInterpolationDelayState,
  createSnapshotRateState,
  snapshotIntervalMs,
  stateBroadcastWakeIntervalMs,
  updateInterpolationDelay,
  updateSnapshotRate,
  shortestYaw,
  type InterpolationDelayState,
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
  canHostCommitStart,
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
  MAX_AUTHORITATIVE_REWIND_MS,
  MAX_SHOT_FIRE_AGE_MS,
  admitAuthoritativeShot,
  canonicalShotDirection,
  createAuthoritativeShotAdmissionState,
  freezeAuthoredBulletRecord,
  freezeAuthoredShotTimeline,
  validateShotOrigin,
  type AuthoredShotTimeline,
  type AuthoritativeShotAdmissionState,
} from './authoritative-shot';
import { HostTriggerAuthorityRegistry } from './host-trigger-authority';
import { ShotTimingTelemetry } from './shot-timing-telemetry';
import {
  admitRemoteSupportActivation,
  admitRemoteSupportHit,
  createRemoteSupportAuthorityState,
  isLegacyOffensiveSupport,
  recordRemoteSupportDeath,
  registerRemoteSupportActivation,
  type RemoteSupportAuthorityState,
} from './remote-support-authority';
import { admitRemoteGrenadeExplosion, admitRemoteGrenadeHit, admitRemoteGrenadeThrow, createRemoteGrenadeAuthorityState, recordRemoteGrenadeDeath, recordRemoteGrenadeRespawn, remoteGrenadeForAction, remoteGrenadeLifeForAction, replenishRemoteGrenadeAuthorityState, type RemoteGrenadeAuthorityState } from './remote-grenade-admission';
import { admitHostCanonicalHitResult } from './host-canonical-hit-admission';
import {
  createRemoteStickyAttachmentAuthorityState,
  pruneRemoteStickyAttachments,
  recordRemoteStickyAttachment,
  removeRemoteStickyAttachmentsForActor,
  sealRemoteStickyDetonation,
  stickyAttachmentRecord,
  stickyAttachmentRecordForAction,
  verifyRemoteStickyAttachment,
  type StickyAttachmentRecord,
  type StickyAttachmentSource,
} from './remote-sticky-attachment-authority';
import {
  advanceRemoteHealthAuthority,
  admitAuthoritativeRemoteRespawn,
  applyAuthoritativeRemoteDamage,
  applyAuthoritativeRemoteRedeploy,
  createRemoteHealthAuthorityState,
  type AuthoritativeRemoteDamageResult,
  type RemoteHealthAuthorityState,
} from './remote-health-authority';
import { isKillstreakEligible, killCauseFromHit, type KillCause } from './kill-provenance';
import { reconstructShooterPoseAtFireTime, recordCombatantPose, rewindCombatantPose, rewindCombatantPoseStrict, type CombatantPoseSample } from './lag-compensation';
import { appendClientRuntimeLog, readClientRuntimeLog } from './client-runtime-log';
import { isHostedBotCount, type HostedBotCount, type HostedBotSnapshot } from './hosted-bots';
import { DAMAGE_FEED_LIMIT, DAMAGE_FEED_VISIBLE_MS, EVENT_FEED_LIMIT, accessibleFeedLabel, feedDestination } from './hud-feed';
import { MatchDiagnostics, type DiagnosticAdmission, type MatchDiagnosticInput } from './match-diagnostics';
import { MATCH_DIAGNOSTICS_ENDPOINT, MatchDiagnosticUploader } from './match-diagnostics-upload';
import {
  createLastMultiplayerDiagnostic,
  loadLastMultiplayerDiagnostic,
  saveLastMultiplayerDiagnostic,
} from './last-multiplayer-diagnostic';
import {
  admitChatRate,
  appendChatHistory,
  normalizeChatHistory,
  normalizeChatSenderName,
  normalizeChatText,
  type ChatEntry,
  type ChatRateState,
} from './text-chat';
import { roomChatPresentation } from './room-chat-presentation';
import {
  createHumanMatchReport,
  type HumanDamageEventInput,
  type MatchParticipantReportInput,
} from './match-report';
import { FFA_MINIMUM_SPAWN_SEPARATION, initialFfaSpawnReservation, playerSpawnProtectionMs, scoreSpawnCandidates, stableSpawnTieBreakSeed, type SpawnMode } from './spawn-safety';
import { admitCombatTiming, createPeerTimingState, shouldRetainRemoteCombatAuthority, updatePeerTiming, type CombatTiming, type PeerTimingState } from './network-fairness';
import {
  CharacterPhysics,
  MAX_MAJOR_DEBRIS_BODIES,
  worldBoundaryColliders,
  type MajorDebrisBodyDefinition,
  type MajorDebrisBodySnapshot,
  type DynamicWorldCollider,
} from './physics';
import { InteractiveWorldRuntime } from './interactive-world-runtime';
import { shedPlacementsForArena } from './destructible-shed-registry';
import { FIELD_SHED_EXPLOSION_DAMAGE_MULTIPLIER } from './destructible-shed-definition';
import { canAdmitMajorDebris, SHARED_MAJOR_DEBRIS_BUDGET } from './major-debris-budget';
import { createFracturedWindowDebrisVisual } from './window-glass-debris-presentation';
import {
  INTERACTIVE_WORLD_SCHEMA_VERSION,
  type InteractiveWorldSnapshotMessage,
  type ShedInteractionIntentMessage,
} from './interactive-world-protocol';
import { TracerPool } from './tracer-pool';
import { AsyncSerialQueue } from './async-serial-queue';
import { RIGGED_OPERATOR_CORPSE_ACTION_NAMES, loadRiggedOperatorAsset, prewarmRiggedOperatorActions, riggedOperatorAssetReady, riggedOperatorTelemetry } from './operator-model';
import {
  WeaponPresentation,
  type WeaponViewmodelCatalogGpuPrewarmer,
  type WeaponViewmodelGpuPrewarmer,
} from './weapon-presentation';
import { magnifiedFovDegrees, viewmodelSurfaceRetreat } from './weapon-presentation-state';
import { RailgunPresentation, type RailgunThermalContact } from './railgun-presentation';
import { DMR_THERMAL_MAGNIFICATION, DmrThermalPresentation, type DmrThermalContact } from './dmr-thermal-presentation';
import {
  SmokeVolumePresentationPool,
  type SmokeVolumePresentationLease,
} from './smoke-volume-presentation';
import {
  SMOKE_AUTHORITY_SCHEMA_VERSION,
  SmokeAuthority,
  type SmokeAuthoritySnapshot,
  type SmokeCorridorSnapshot,
  type SmokeShotSegment,
} from './smoke-authority';
import type { SmokeStateMessage } from './smoke-protocol';
import {
  FLASH_AUTHORITY_SCHEMA_VERSION,
  FlashHostAuthority,
  FlashVictimResultConsumer,
  flashActivationId,
  type FlashResult,
  type FlashVictimAdmission,
} from './flash-authority';
import { isFlashResultMessage, type FlashResultMessage } from './flash-protocol';
import {
  RAILGUN_BEAM_LENGTH_M,
  RAILGUN_DAMAGE,
  RAILGUN_RECHAMBER_MS,
  RAILGUN_SPAWN_DELAY_MS,
  RAILGUN_TOTAL_ROUNDS,
  RAILGUN_UPPER_ROOM_SPAWN_SITES,
  admitRailgunTargets,
  advanceRailgunAuthority,
  advanceRailgunChamber,
  claimRailgun,
  createRailgunBeamAuthority,
  createRailgunAuthorityState,
  dropRailgun,
  fireRailgun,
  isStaleRailgunAuthorityState,
  railgunStateResyncDue,
  railgunThermalTargetEligible,
  type RailgunAuthorityState,
  type RailgunBeamAuthority,
  type RailgunClaimRequestMessage,
  type RailgunShotRequestMessage,
  type RailgunShotResultMessage,
  type RailgunStateMessage,
} from './railgun-authority';
import { selectPlayableWindowApproach, windowBreakPathBlocked } from './window-breaks';
import { resolveRenderProfile, type RenderProfile } from './render-profile';
import { configureRuntimeRandom, gameplayRandom, presentationRandom, protocolRandom, runtimeRandomTelemetry, runtimeSeed } from './runtime-random';
import {
  BotDamageMessage,
  BotStateMessage,
  ChatHistoryMessage,
  ChatMessage,
  ChatSubmitMessage,
  DeathMessage,
  ExplosiveSource,
  GameMessage,
  HitMessage,
  HostVerifiedStickyAttachment,
  LobbyJoinMessage,
  LobbyHandicapMessage,
  LobbyReadyMessage,
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
  SidearmWeaponId,
  GRENADE_IDS,
  GrenadeId,
  RedeployCommitMessage,
  RedeployRequestMessage,
  ShotMessage,
  ShotRequestMessage,
  ShotResultMessage,
  StateMessage,
  MULTIPLAYER_PROTOCOL_VERSION,
  Team,
  TriggerStateMessage,
  WEAPON_IDS,
  WeaponId,
  WindowBreakMessage,
} from './protocol';

const configuredRuntimeSeed = runtimeSeed(window.location.search);
configureRuntimeRandom(configuredRuntimeSeed);

function clientSessionStorage(): Storage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

function clientPersistentStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

window.addEventListener('error', (event) => {
  appendClientRuntimeLog({
    kind: 'error', message: event.message || 'unknown error', source: event.filename,
    line: event.lineno, column: event.colno, stack: event.error?.stack,
  }, clientSessionStorage());
  console.error('[Nuke Town runtime error]', event.message || 'unknown error', event.error?.stack || '');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? `${event.reason.message}\n${event.reason.stack ?? ''}` : String(event.reason);
  appendClientRuntimeLog({
    kind: 'unhandled-rejection',
    message: event.reason instanceof Error ? event.reason.message : String(event.reason),
    stack: event.reason instanceof Error ? event.reason.stack : undefined,
  }, clientSessionStorage());
  console.error('[Nuke Town unhandled rejection]', reason);
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
  snapshotRateHz: 20 | 30 | 40;
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
  weapon: WeaponId;
  grenade: GrenadeId;
  nextGrenadeAt: number;
  grenadeActive: boolean;
  positionHistory: CombatantPoseSample[];
  continuity: number;
  perception: BotPerceptionState;
  perceptionCanFire: boolean;
  perceptionAimError: number;
};

type GrenadeEntity = {
  grenade: GrenadeId;
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  explodeAt: number;
  nextFuseBeepAt: number;
  lastBounceAt: number;
  actionNonce: number;
  ownerKind: 'player' | 'bot' | 'remote';
  ownerId: string;
  ownerLifeId: number;
  ownerTeam: Team;
  impactedAt: number | null;
  attachedTargetId: string | null;
  attachedTargetLifeId: number | null;
};

type RuntimeSmokeVolume = Omit<SmokeVolume, 'corridors'> & {
  corridors: SmokeCorridorSnapshot[];
  observedCorridorIds: Set<string>;
  presentationLease: SmokeVolumePresentationLease;
};

type ExplosiveBoltEntity = {
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  ownerId: string;
  ownerLifeId: number;
  ownerTeam: Team;
  authority: boolean;
  spawnedAt: number;
  expiresAt: number;
  impactedAt: number | null;
  detonatesAt: number;
  nextFuseBeepAt: number | null;
  targetId: string | null;
  targetLifeId: number | null;
  actionNonce: number;
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
app.innerHTML = renderPass64Shell(createPass64ShellViewModel(storedPlayerName));
let killstreakMenuBinding: KillstreakMenuBinding;

assertUiSurfaceInventory(document);
document.documentElement.dataset.uiContract = 'pass64-command-v2';

function element<T extends HTMLElement>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing element ${selector}`);
  return value;
}

const canvas = element<HTMLCanvasElement>('#game');
const menu = element<HTMLElement>('#menu');
const damageDirectionIndicator = element<HTMLElement>('#damage-direction');
const damageFlash = element<HTMLElement>('#damage-flash');
const lowHealthVignette = element<HTMLElement>('#low-health-vignette');
menu.dataset.context = 'deployment';
const menuShowcase = element<HTMLElement>('#menu-showcase');
const menuPreviewFrame = element<HTMLElement>('#menu-preview-frame');
const menuPreviewVideo = element<HTMLVideoElement>('#menu-preview-video');
const menuPreviewVideoHomeAnchor = document.createComment('menu-preview-video-home');
menuPreviewVideo.after(menuPreviewVideoHomeAnchor);
const menuPreviewPoster = element<HTMLImageElement>('#menu-preview-poster');
const menuPreviewLabel = element<HTMLElement>('#menu-preview-label');
const menuPreviewMotion = element<HTMLElement>('#menu-preview-motion');
const menuPreviewVideoController = new MenuPreviewVideoController({
  frame: menuPreviewFrame,
  video: menuPreviewVideo,
  poster: menuPreviewPoster,
  label: menuPreviewLabel,
  motion: menuPreviewMotion,
});
const matchPauseBackdrop = element<HTMLElement>('#match-pause-backdrop');
const deploymentTransition = element<HTMLElement>('#deployment-transition');
const deploymentTransitionPoster = element<HTMLImageElement>('#deployment-transition-poster');
const deploymentTransitionVideo = element<HTMLVideoElement>('#deployment-transition-video');
const deploymentTransitionTitle = element<HTMLElement>('#deployment-transition-title');
const deploymentTransitionStatus = element<HTMLElement>('#deployment-transition-status');
const matchPauseFrameFallback = element<HTMLCanvasElement>('#match-pause-frame-fallback');
const matchPauseFrameFallbackContextValue = matchPauseFrameFallback.getContext('2d', { alpha: false });
if (!matchPauseFrameFallbackContextValue) throw new Error('Canvas2D pause-only fallback is unavailable');
const matchPauseFrameFallbackContext: CanvasRenderingContext2D = matchPauseFrameFallbackContextValue;
const MATCH_PAUSE_BACKDROP_CONTRACT = 'game-canvas-css-compositor-v1';
const MATCH_PAUSE_FALLBACK_MAX_WIDTH = 960;
const MATCH_PAUSE_FALLBACK_MAX_HEIGHT = 540;
const resumeButton = element<HTMLButtonElement>('#resume');
const mainMenuButton = element<HTMLButtonElement>('#main-menu');
const canvasHomeAnchor = document.createComment('game-canvas-home');
canvas.after(canvasHomeAnchor);
const reducedMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
let menuLifecycle = INITIAL_MENU_LIFECYCLE_STATE;
let lastGameplayPresentedFrame = 0;
let matchAdmissionGeneration = 0;
let matchPauseBackdropPresentationCount = 0;
let matchPauseBackdropFallbackCount = 0;
let matchPauseSourceCaptureAttemptCount = 0;
let matchPauseSourceCaptureCount = 0;
const hudRoot = element<HTMLElement>('#hud');
const fpsCounter = element<HTMLElement>('#fps-counter');
const fpsCounterValue = element<HTMLElement>('#fps-counter b');
const sniperScopeOverlay = element<HTMLElement>('#sniper-scope');
const roomCard = element<HTMLElement>('#room-card');
const roomCodeEl = element<HTMLElement>('#room-code');
const statusEl = element<HTMLElement>('#network-status');
const textChatRoot = element<HTMLElement>('#text-chat');
const textChatLog = element<HTMLElement>('#text-chat-log');
const textChatHint = element<HTMLElement>('#text-chat-hint');
const textChatForm = element<HTMLFormElement>('#text-chat-form');
const textChatInput = element<HTMLInputElement>('#text-chat-input');
const minimapCanvas = element<HTMLCanvasElement>('#minimap');
const minimapContextValue = minimapCanvas.getContext('2d');
if (!minimapContextValue) throw new Error('Canvas2D minimap is unavailable');
const minimapContext: CanvasRenderingContext2D = minimapContextValue;
const strikeMapCanvas = element<HTMLCanvasElement>('#strike-map');
const strikeMapContextValue = strikeMapCanvas.getContext('2d');
if (!strikeMapContextValue) throw new Error('Canvas2D tactical map is unavailable');
const strikeMapContext: CanvasRenderingContext2D = strikeMapContextValue;
const audio = new ArenaAudio();
const capabilityHints = {
  hardwareConcurrency: navigator.hardwareConcurrency,
  deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
};
const loadoutEligibility = createLoadoutItemEligibility(WEAPON_CATALOG);
const baseCustomPresets = createDefaultCustomPresets(
  { primary: 'm4a1', secondary: 'pistol', grenade: 'frag' },
  loadoutEligibility,
);
const defaultCustomPresets = Object.freeze(baseCustomPresets.map((preset) => Object.freeze({
  ...preset,
  ...(preset.id === 'custom-2'
    ? { primary: 'mp5', secondary: 'machine-pistol', grenade: 'smoke' }
    : preset.id === 'custom-3'
      ? { primary: 'm14-ebr', secondary: 'flashlight-pistol', grenade: 'flash' }
      : {}),
})));
const fallbackLoadoutState: LoadoutStorageV2 = Object.freeze({
  schemaVersion: LOADOUT_STORAGE_SCHEMA_VERSION,
  selected: Object.freeze({ kind: 'curated', kitId: 'balanced' }),
  customPresets: defaultCustomPresets,
});
const playerProfileStore = new PlayerProfileStore(clientPersistentStorage() ?? null, {
  capabilityHints,
  loadoutEligibility,
  defaultLoadout: fallbackLoadoutState,
});
let pass65Settings: Pass65Settings = playerProfileStore.current.settings;
const killstreakLoadoutController = new KillstreakLoadoutController(null, {
  initialLoadout: playerProfileStore.current.killstreakLoadout,
  persist: (loadout) => playerProfileStore.update({ killstreakLoadout: loadout }).ok,
});
if (!pass65Settings.privacy.shareGlobalLeaderboard) forgetLeaderboardInstallId(localStorage);
const explicitRenderQuery = new URLSearchParams(window.location.search).get('render');
const offlineMenuPreviewCapture = new URLSearchParams(window.location.search).get('menuPreviewCapture') === '1';
const queryRenderProfile = explicitRenderQuery ? resolveRenderProfile(window.location.search, null) : null;
const graphicsRuntime = resolveGraphicsRuntime(pass65Settings.graphics, queryRenderProfile === 'compat');
const reducedTransparencyMedia = window.matchMedia('(prefers-reduced-transparency: reduce)');
let accessibilityRuntime = resolveAccessibilityRuntime(pass65Settings.accessibility, {
  reducedMotion: reducedMotionMedia.matches,
  reducedTransparency: reducedTransparencyMedia.matches,
});
function configureMenuPreviewAudio(settings: Pass65Settings = pass65Settings): void {
  const masterGain = settings.audio.gains.master / 100;
  const menuGain = settings.audio.gains['menu-music'] / 100;
  menuPreviewVideoController.configureAudio(0.22 * masterGain * menuGain, (
    settings.audio.mutes.master
    || settings.audio.mutes['menu-music']
    || accessibilityRuntime.reducedSensory
  ));
}
audio.configure(pass65Settings.audio);
configureMenuPreviewAudio();
const unlockAudioFromGesture = (event: Event) => {
  if (!event.isTrusted) return;
  audio.unlock();
  menuPreviewVideoController.unlockAudio();
};
window.addEventListener('pointerdown', unlockAudioFromGesture, { passive: true });
window.addEventListener('keydown', unlockAudioFromGesture);

const renderProfile: RenderProfile = resolveRenderProfile(
  explicitRenderQuery ? window.location.search : '',
  queryRenderProfile ?? graphicsRuntime.renderProfile,
);
const activeRenderConfig = resolveActiveGraphicsConfig(graphicsRuntime, renderProfile, queryRenderProfile);
const displayedGraphicsPreset: GraphicsPreset = resolveDisplayedGraphicsPreset(pass65Settings.graphics.preset, queryRenderProfile);
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
document.documentElement.dataset.graphicsPreset = displayedGraphicsPreset;
document.documentElement.dataset.graphicsFrameRateLimit = graphicsRuntime.frameRateLimit === 0
  ? 'uncapped'
  : String(graphicsRuntime.frameRateLimit);
document.documentElement.dataset.graphicsAntialiasSamples = String(graphicsRuntime.antialiasSamples);
document.documentElement.dataset.graphicsToneMapping = graphicsRuntime.post.toneMapping;
document.documentElement.dataset.reducedSensory = accessibilityRuntime.reducedSensory ? 'true' : 'false';
document.documentElement.dataset.reducedMotion = accessibilityRuntime.reducedMotion ? 'true' : 'false';
document.documentElement.style.setProperty('--damage-flash-scale', String(accessibilityRuntime.damageFlashScale));
const runtimeRequest = resolveRenderRuntimeRequest(window.location.search);
const renderRuntime = runtimeRequest.requestedBackend === 'webgpu'
  ? await WebGpuRenderRuntime.create({
      canvas,
      antialias: graphicsRuntime.antialiasSamples > 0,
      samples: Math.max(1, graphicsRuntime.antialiasSamples),
      requireWebGPU: true,
    })
  : await LegacyWebGlRenderRuntime.create({
      canvas,
      alpha: false,
      antialias: activeRenderConfig.antialias,
      powerPreference: 'high-performance',
    });
if (renderRuntime.backend === 'webgpu') renderRuntime.assertCandidateReady();
const legacyRenderer = renderRuntime.backend === 'webgl2' ? renderRuntime.renderer : null;
function submitWebGpuFrame(
  now = performance.now(),
  force = false,
  submissionMode: WebGpuSubmissionMode = 'serialized',
): boolean {
  return renderRuntime.backend === 'webgpu' && renderRuntime.submitFrame(now, force, submissionMode);
}
async function flushWebGpuFrames(timeoutMs = 4_000): Promise<void> {
  if (renderRuntime.backend === 'webgpu') await renderRuntime.waitForSubmittedWork(timeoutMs);
}

type DeferredGpuRetirement = Readonly<{
  kind: 'root';
  root: THREE.Object3D;
  disposeResources: boolean;
  afterFence?: () => void;
}> | Readonly<{
  kind: 'geometry';
  geometry: THREE.BufferGeometry;
}>;

const deferredGpuRetirements: DeferredGpuRetirement[] = [];
const scheduledGpuRetirementRoots = new WeakSet<THREE.Object3D>();
const scheduledGpuRetirementGeometries = new WeakSet<THREE.BufferGeometry>();
let gpuRetirementTask: Promise<void> | null = null;
let gpuRetirementFences = 0;
let gpuRetirementScheduledRoots = 0;
let gpuRetirementScheduledGeometries = 0;
let gpuRetirementDisposedRoots = 0;
let gpuRetirementDisposedGeometries = 0;
let gpuRetirementFailures = 0;

async function yieldDeferredGpuRetirementTask(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function' && document.visibilityState === 'visible') {
      requestAnimationFrame(() => resolve());
    } else {
      globalThis.setTimeout(resolve, 0);
    }
  });
}

function disposeDetachedRootResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      const entries = Array.isArray(node.material) ? node.material : [node.material];
      entries.forEach((material) => materials.add(material));
    }
    if (node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight) {
      node.shadow.map?.dispose();
    }
  });
  geometries.forEach((geometry) => { if (!isSharedMeshGeometry(geometry)) geometry.dispose(); });
  materials.forEach((material) => material.dispose());
  root.clear();
}

async function drainDeferredGpuRetirements(): Promise<void> {
  while (deferredGpuRetirements.length > 0) {
    // Snapshot before fencing. Roots detached after this target was captured
    // may have appeared in a newer submission and must wait for the next
    // fence, never piggyback on this one.
    const batch = deferredGpuRetirements.splice(0, deferredGpuRetirements.length);
    try {
      await flushWebGpuFrames();
      if (renderRuntime.backend === 'webgpu') gpuRetirementFences += 1;
    } catch (error) {
      gpuRetirementFailures += 1;
      deferredGpuRetirements.unshift(...batch);
      console.warn('[Pass 65 GPU retirement fence failed; resources retained]', error);
      return;
    }
    for (const [retirementIndex, retirement] of batch.entries()) {
      if (retirement.kind === 'geometry') {
        retirement.geometry.dispose();
        gpuRetirementDisposedGeometries += 1;
      } else {
        // Cache ownership outlives one clone. Release refs only after the GPU
        // fence and before generic teardown clears the nested weapon roots.
        releasePass65WeaponModelsIn(retirement.root);
        if (retirement.disposeResources) disposeDetachedRootResources(retirement.root);
        retirement.afterFence?.();
        gpuRetirementDisposedRoots += 1;
      }
      // Fence completion only establishes that disposal is safe; it does not
      // require every detached hierarchy to be torn down in one browser task.
      // One retirement per frame prevents cleanup of prewarm clones and old
      // operators from colliding with match admission or a weapon switch.
      if (retirementIndex + 1 < batch.length || deferredGpuRetirements.length > 0) {
        await yieldDeferredGpuRetirementTask();
      }
    }
  }
}

function scheduleDeferredGpuRetirement(
  root: THREE.Object3D,
  disposeResourcesOrAfterFence: boolean | (() => void) = true,
  explicitAfterFence?: () => void,
): void {
  if (scheduledGpuRetirementRoots.has(root)) return;
  const disposeResources = typeof disposeResourcesOrAfterFence === 'boolean' ? disposeResourcesOrAfterFence : true;
  const afterFence = typeof disposeResourcesOrAfterFence === 'function' ? disposeResourcesOrAfterFence : explicitAfterFence;
  scheduledGpuRetirementRoots.add(root);
  gpuRetirementScheduledRoots += 1;
  invalidatePass65PresentationTree(root);
  root.removeFromParent();
  root.visible = false;
  deferredGpuRetirements.push(Object.freeze({ kind: 'root', root, disposeResources, afterFence }));
  scheduleGpuRetirementDrain();
}

function scheduleDeferredGpuGeometryRetirement(geometry: THREE.BufferGeometry): void {
  if (scheduledGpuRetirementGeometries.has(geometry)) return;
  scheduledGpuRetirementGeometries.add(geometry);
  gpuRetirementScheduledGeometries += 1;
  deferredGpuRetirements.push(Object.freeze({ kind: 'geometry', geometry }));
  scheduleGpuRetirementDrain();
}

function scheduleGpuRetirementDrain(): void {
  if (gpuRetirementTask) return;
  gpuRetirementTask = drainDeferredGpuRetirements().finally(() => {
    gpuRetirementTask = null;
    if (deferredGpuRetirements.length > 0) {
      // A failed fence retains resources safely. A later admitted frame or map
      // transition will give the queue another completion target.
      window.setTimeout(() => {
        if (!gpuRetirementTask) {
          gpuRetirementTask = drainDeferredGpuRetirements().finally(() => { gpuRetirementTask = null; });
        }
      }, 250);
    }
  });
}
document.documentElement.dataset.renderBackend = renderRuntime.backend;
const effectiveGraphicsExposure = (authoredExposure: number): number => authoredExposure * graphicsRuntime.post.exposureScale;
renderRuntime.configureOutput(effectiveGraphicsExposure(activeLighting.exposure), graphicsRuntime.post.toneMapping);
renderRuntime.configureShadows({
  enabled: activeRenderConfig.shadows,
  type: THREE.PCFShadowMap,
  autoUpdate: activeRenderConfig.shadowMode === 'dynamic',
  needsUpdate: activeRenderConfig.shadowMode === 'static',
});
const signalQuery = new URLSearchParams(window.location.search).get('signal');
const rendererLabel = renderRuntime.telemetry().adapterLabel;
const softwareRenderer = isSoftwareWebGLRenderer(rendererLabel);
const atomicSignalBypass = atomicSignalBypassReason(signalQuery, rendererLabel);
document.documentElement.dataset.atomicSignalRenderer = softwareRenderer ? 'software' : 'hardware';
const atomicSignal = renderRuntime.backend === 'webgl2'
  ? new AtomicSignalPass(renderRuntime.renderer, renderProfile, (reason) => {
      document.documentElement.classList.remove('atomic-signal-render');
      document.documentElement.dataset.atomicSignal = 'fallback';
      console.warn('[Nuke Town Atomic Signal fallback]', reason);
    }, atomicSignalBypass)
  : null;
const grassQuery = new URLSearchParams(window.location.search).get('grass');
const mistQuery = new URLSearchParams(window.location.search).get('mist');
const cloudsQuery = new URLSearchParams(window.location.search).get('clouds');
const skyCloudsEnabled = !reducedRenderMode || cloudsQuery === 'on';
const raysQuery = new URLSearchParams(window.location.search).get('rays');
const actualGodRayStrength = (raysQuery === 'off' || (softwareRenderer && raysQuery !== 'on')) ? 0 : activeLighting.godRayStrength;
const actualGodRayLobes = actualGodRayStrength > 0 ? activeLighting.godRayLobes : 0;
// Both renderer backends own grade, dither/grain and vignette in their GPU
// pipeline. CSS post overlays must never double-apply on the WebGPU route.
document.documentElement.classList.toggle(
  'atomic-signal-render',
  renderRuntime.backend === 'webgpu' || (atomicSignal?.telemetry().enabled ?? false),
);
document.documentElement.dataset.atomicSignal = atomicSignal?.telemetry().enabled ? 'active' : 'tsl-hdr';
let webglContextLost = false;
let webglContextLosses = 0;
let webglContextRestorations = 0;
let staticShadowDynamicRefreshes = 0;
if (renderRuntime.backend === 'webgl2') {
  renderRuntime.renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    webglContextLost = true;
    webglContextLosses += 1;
    document.documentElement.dataset.webglContext = 'lost';
  });
}
document.documentElement.dataset.webglContext = 'ready';
// Both public profiles can reduce their internal framebuffer when sustained
// frame time exceeds the detected display budget. Shadows disable
// automatically below a moderate DPR threshold.
renderRuntime.setPixelRatio(Math.min(window.devicePixelRatio, activeRenderConfig.pixelRatioCap));

const scene = new THREE.Scene();
const killstreakPresentation = new KillstreakPresentation(
  scene,
  (root) => scheduleDeferredGpuRetirement(root, root.userData.authoredSharedAsset !== true),
  renderRuntime.backend === 'webgpu',
);
scene.fog = new THREE.Fog(activeLighting.fogColor, activeLighting.fogNear, activeLighting.fogFar);
const graphicsRefinement = new GraphicsRefinementSystem(
  legacyRenderer,
  scene,
  renderProfile,
  softwareRenderer || renderRuntime.backend === 'webgpu',
  activeRenderConfig.pixelRatioCap,
  graphicsRuntime.maximumAnisotropy,
  graphicsRuntime.reflectionScale,
);
const maximumAnisotropy = renderRuntime.maximumAnisotropy();

function requestStaticShadowRefresh(value = true): void {
  renderRuntime.requestShadowUpdate(value);
  // Three's WebGPU ShadowNode clears `needsUpdate` after rendering. Avoid a
  // full-scene traversal on every frame merely to repeat that clear; traverse
  // only when a real refresh/configuration is requested. WebGL retains its
  // renderer-level flag plus the per-light schedule for parity.
  if (value || renderRuntime.backend === 'webgl2') {
    renderRuntime.configureLightShadows(
      scene,
      activeRenderConfig.shadowMode === 'dynamic',
      value,
    );
  }
}
let applyPresentationEffectsBudget: ((budget: GraphicsEffectsBudget) => void) | null = null;
function applyGraphicsPreferenceBudget(budget: GraphicsEffectsBudget): GraphicsEffectsBudget {
  return Object.freeze({
    ...budget,
    bloomStrength: Math.min(budget.bloomStrength, graphicsRuntime.post.bloomStrength),
    depthFogStrength: budget.depthFogStrength * graphicsRuntime.volumetricScale,
    particleDensityScale: budget.particleDensityScale * graphicsRuntime.particleScale,
    decalLifetimeScale: budget.decalLifetimeScale * graphicsRuntime.decalScale,
  });
}
const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);
camera.rotation.order = 'YXZ';
scene.add(camera);
const railgunPresentation = new RailgunPresentation(scene, element<HTMLElement>('#railgun-thermal'), reducedRenderMode);
const dmrThermalPresentation = new DmrThermalPresentation(scene, element<HTMLElement>('#dmr-thermal'));
const smokeVolumePresentationPool = new SmokeVolumePresentationPool(scene);
smokeVolumePresentationPool.setQualityScale(graphicsRuntime.smokeScale);
const VIEWMODEL_RENDER_LAYER = 2;
camera.layers.enable(VIEWMODEL_RENDER_LAYER);
let skyMaterial: THREE.ShaderMaterial | null = null;

let riggedOperatorLoadError: string | null = null;
type BootstrapStage =
  | 'loading-module-assets'
  | 'measuring-display'
  | 'module-ready'
  | 'menu-video-ready'
  | 'loading-gameplay-assets'
  | 'prewarming-weapon-catalog'
  | 'prewarming-batched-presentations'
  | 'prewarming-grenade-world-presentations'
  | 'prewarming-killstreak-presentations'
  | 'prewarming-smoke-presentations'
  | 'prewarming-combat-tracers'
  | 'prewarming-combat-impacts'
  | 'prewarming-explosive-bolts'
  | 'prewarming-grenade-explosion'
  | 'prewarming-support-explosion'
  | 'prewarming-death-drops'
  | 'prewarming-nuke'
  | 'binding-world'
  | 'waiting-for-authored-textures'
  | 'compiling-scene'
  | 'batching-static-meshes'
  | 'prewarming-overdrive'
  | 'finalizing'
  | 'verifying-first-presentation'
  | 'gameplay-assets-ready'
  | 'ready'
  | 'failed';
let bootstrapStage: BootstrapStage = 'loading-module-assets';
let bootstrapError: string | null = null;
type MatchAdmissionCadence = Readonly<{
  backend: 'webgpu' | 'webgl2';
  waitedMs: number;
  stableWindowMs: number;
  samples: number;
  resets: number;
  maximumGapMs: number;
  startingSubmissionSequence: number;
  endingSubmissionSequence: number;
  startingCompletedSequence: number;
  endingCompletedSequence: number;
  submissionAdvances: number;
  completionAdvances: number;
  maximumSubmissionGapMs: number;
  maximumCompletionGapMs: number;
  maximumPendingForMs: number;
  maximumCompletionLatencyMs: number;
  drained: boolean;
  admittedDegraded: boolean;
  visibilityState: DocumentVisibilityState;
  documentHasFocus: boolean;
}>;
let lastMatchAdmissionCadence: MatchAdmissionCadence | null = null;
type WebGlReadyPrime = Readonly<{
  startedAt: number;
  synchronizedAt: number;
  firstRenderedAt: number;
  settledAt: number;
  finalRenderedAt: number;
  firstRenderDurationMs: number;
  finalRenderDurationMs: number;
  settleDelayMs: number;
}>;
let lastWebGlReadyPrime: WebGlReadyPrime | null = null;
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
bootstrapStage = 'measuring-display';
const detectedDisplayFrameMs = await displayCadencePromise;
bootstrapStage = 'module-ready';
const configuredAdaptiveLevels = configuredAdaptiveQualityLevels(
  renderProfile,
  activeRenderConfig.pixelRatioCap,
  graphicsRuntime.adaptive,
);
const adaptiveQuality = new AdaptiveQualityController({
  profile: renderProfile,
  targetFrameMs: Math.max(detectedDisplayFrameMs, 1_000 / graphicsRuntime.targetFps),
  initialPixelRatioCap: activeRenderConfig.pixelRatioCap,
  enabled: graphicsRuntime.adaptive,
  levels: configuredAdaptiveLevels,
});
const deferredWebGpuAdaptivePixelRatio = new DeferredAdaptivePixelRatio();
const MATCH_ADMISSION_ADAPTIVE_WARMUP_SUBMISSIONS = 8;
const MATCH_ADMISSION_ADAPTIVE_SAMPLE_COUNT = 60;
// A 1.5 s window on a genuinely weak ~30 Hz device yields roughly 36 admitted
// gaps after warmup. Twenty-four samples preserve a meaningful p95 while still
// allowing that exact severe-underperformance case to trigger one safe step.
const MATCH_ADMISSION_ADAPTIVE_MINIMUM_SAMPLES = 24;
const MATCH_ADMISSION_ADAPTIVE_WINDOW_TIMEOUT_MS = 1_500;
const MATCH_ADMISSION_SEVERE_P50_MS = 25;
const MATCH_ADMISSION_SEVERE_P95_MS = 50;
const MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS = 4_000;
type MatchAdmissionAdaptiveCalibration = Readonly<{
  label: string;
  status: 'stable' | 'skipped' | 'failed';
  initialPixelRatioCap: number;
  presetPixelRatioCap: number;
  finalPixelRatioCap: number;
  windows: readonly Readonly<{
    tier: number;
    pixelRatioCap: number;
    samples: number;
    p50SubmissionGapMs: number;
    p95SubmissionGapMs: number;
    submittedCadenceHz: number;
    maximumSubmissionGapMs: number;
    maximumQueueLatencyMs: number;
    startingSubmissionSequence: number;
    endingSubmissionSequence: number;
    startingCompletedSequence: number;
    endingCompletedSequence: number;
    submissionAdvances: number;
    completionAdvances: number;
    decision: 'stable' | 'downshift' | 'preset-locked' | 'insufficient-sample';
  }>[];
  startedAt: number;
  completedAt: number;
}>;
let lastMatchAdmissionAdaptiveCalibration: MatchAdmissionAdaptiveCalibration | null = null;
let matchWebGpuQualityFrozen = false;
renderRuntime.setPixelRatio(Math.min(window.devicePixelRatio, adaptiveQuality.telemetry().pixelRatioCap));
let activeArenaVisualDefinition: ArenaVisualDefinition | null = null;

function applyAdaptiveRenderBudget(pixelRatioCap: number): void {
  renderRuntime.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
  const effectsBudget = applyGraphicsPreferenceBudget(graphicsEffectsBudget(renderProfile, pixelRatioCap));
  graphicsRefinement.setBudget(effectsBudget);
  atomicSignal?.setEffectsBudget(effectsBudget);
  applyPresentationEffectsBudget?.(effectsBudget);
  const shadowsEnabled = adaptiveShadowsEnabled(renderProfile, activeRenderConfig.shadows, pixelRatioCap)
    && (activeArenaVisualDefinition?.shadows.enabled ?? true);
  if (renderRuntime.shadowsEnabled() !== shadowsEnabled) {
    renderRuntime.setShadowsEnabled(shadowsEnabled);
    renderRuntime.requestShadowUpdate(shadowsEnabled);
  }
  document.documentElement.dataset.adaptiveShadows = shadowsEnabled ? 'on' : 'off';
}
applyAdaptiveRenderBudget(adaptiveQuality.telemetry().pixelRatioCap);

async function collectMatchAdmissionWebGpuSubmissionGaps(): Promise<Readonly<{
  status: 'sampled' | 'skipped';
  samples: readonly number[];
  maximumQueueLatencyMs: number;
  startingSubmissionSequence: number;
  startingCompletedSequence: number;
}>> {
  const before = renderRuntime.backend === 'webgpu' ? renderRuntime.presentationTelemetry() : null;
  if (renderRuntime.backend !== 'webgpu' || document.visibilityState !== 'visible' || !document.hasFocus()) {
    return Object.freeze({
      status: 'skipped',
      samples: Object.freeze([]),
      maximumQueueLatencyMs: before?.lastCompletionLatencyMs ?? 0,
      startingSubmissionSequence: before?.submissionSequence ?? 0,
      startingCompletedSequence: before?.completedSequence ?? 0,
    });
  }
  await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
  renderRuntime.resetPresentationProgressWindow(performance.now());
  const startingPresentation = renderRuntime.presentationTelemetry();
  return new Promise((resolve, reject) => {
    const samples: number[] = [];
    let warmupGapsRemaining = MATCH_ADMISSION_ADAPTIVE_WARMUP_SUBMISSIONS;
    let priorSubmittedAt: number | null = null;
    let maximumQueueLatencyMs = startingPresentation.lastCompletionLatencyMs ?? 0;
    let finished = false;
    const finish = (status: 'sampled' | 'skipped'): void => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      resolve(Object.freeze({
        status,
        samples: Object.freeze([...samples]),
        maximumQueueLatencyMs,
        startingSubmissionSequence: startingPresentation.submissionSequence,
        startingCompletedSequence: startingPresentation.completedSequence,
      }));
    };
    const timeout = window.setTimeout(() => finish(
      document.visibilityState === 'visible' && document.hasFocus() ? 'sampled' : 'skipped',
    ), MATCH_ADMISSION_ADAPTIVE_WINDOW_TIMEOUT_MS);
    const sample = (now: number): void => {
      if (finished) return;
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        finish('skipped');
        return;
      }
      try {
        const admitted = submitWebGpuFrame(now, false, 'warmed-live');
        const presentation = renderRuntime.presentationTelemetry(performance.now());
        if (presentation.status === 'stalled' || presentation.status === 'device-lost'
          || presentation.status === 'failed') {
          throw new Error(`Adaptive admission presentation was ${presentation.status}`);
        }
        maximumQueueLatencyMs = Math.max(
          maximumQueueLatencyMs,
          presentation.progress.maximumCompletionLatencyMs,
          presentation.lastCompletionLatencyMs ?? 0,
        );
        if (admitted && presentation.lastSubmittedAt !== null) {
          if (priorSubmittedAt !== null) {
            const submissionGapMs = Math.max(0, presentation.lastSubmittedAt - priorSubmittedAt);
            if (warmupGapsRemaining > 0) warmupGapsRemaining -= 1;
            else samples.push(submissionGapMs);
          }
          priorSubmittedAt = presentation.lastSubmittedAt;
        }
        if (samples.length >= MATCH_ADMISSION_ADAPTIVE_SAMPLE_COUNT) {
          finish('sampled');
          return;
        }
        requestAnimationFrame(sample);
      } catch (error) {
        finished = true;
        window.clearTimeout(timeout);
        reject(error);
      }
    };
    requestAnimationFrame(sample);
  });
}

async function settleMatchAdmissionAdaptiveWebGpuPresentation(label: string): Promise<void> {
  if (renderRuntime.backend !== 'webgpu') return;
  const startedAt = performance.now();
  const initialPixelRatioCap = adaptiveQuality.telemetry().pixelRatioCap;
  const presetPixelRatioCap = adaptiveQuality.seedPixelRatioCap(
    activeRenderConfig.pixelRatioCap,
    `${displayedGraphicsPreset} preset match seed`,
  );
  const windows: Array<MatchAdmissionAdaptiveCalibration['windows'][number]> = [];
  try {
    if (presetPixelRatioCap !== initialPixelRatioCap) {
      await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
      deferredWebGpuAdaptivePixelRatio.request(presetPixelRatioCap);
      if (!applyDeferredAdaptiveWebGpuRenderBudget(performance.now())) {
        throw new Error(`${label} preset seed resize was not admitted after its WebGPU completion fence`);
      }
      submitWebGpuFrame(performance.now(), true);
      await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
      assertWebGpuAdmissionCompletionLatency(
        `${label} preset seed`,
        renderRuntime.presentationTelemetry().lastCompletionLatencyMs,
        MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS,
      );
    }
    const current = adaptiveQuality.telemetry();
    if (!current.enabled || displayedGraphicsPreset !== 'custom') {
      const presetPresentation = renderRuntime.presentationTelemetry();
      windows.push(Object.freeze({
        tier: current.tier,
        pixelRatioCap: current.pixelRatioCap,
        samples: 0,
        p50SubmissionGapMs: 0,
        p95SubmissionGapMs: 0,
        submittedCadenceHz: 0,
        maximumSubmissionGapMs: 0,
        maximumQueueLatencyMs: presetPresentation.lastCompletionLatencyMs ?? 0,
        startingSubmissionSequence: presetPresentation.submissionSequence,
        endingSubmissionSequence: presetPresentation.submissionSequence,
        startingCompletedSequence: presetPresentation.completedSequence,
        endingCompletedSequence: presetPresentation.completedSequence,
        submissionAdvances: 0,
        completionAdvances: 0,
        decision: 'preset-locked',
      }));
    } else {
      const sampled = await collectMatchAdmissionWebGpuSubmissionGaps();
      await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
      const completedPresentation = renderRuntime.presentationTelemetry();
      const submissionAdvances = completedPresentation.submissionSequence - sampled.startingSubmissionSequence;
      const completionAdvances = completedPresentation.completedSequence - sampled.startingCompletedSequence;
      if (sampled.status === 'skipped') {
        matchWebGpuQualityFrozen = true;
        lastMatchAdmissionAdaptiveCalibration = Object.freeze({
          label,
          status: 'skipped',
          initialPixelRatioCap,
          presetPixelRatioCap,
          finalPixelRatioCap: adaptiveQuality.telemetry().pixelRatioCap,
          windows: Object.freeze([...windows]),
          startedAt,
          completedAt: performance.now(),
        });
        return;
      }
      if (submissionAdvances <= 0 || completionAdvances <= 0
        || completedPresentation.completedSequence < completedPresentation.submissionSequence) {
        throw new Error(`${label} adaptive admission lacked completed WebGPU evidence: ${JSON.stringify({
          startingSubmissionSequence: sampled.startingSubmissionSequence,
          endingSubmissionSequence: completedPresentation.submissionSequence,
          startingCompletedSequence: sampled.startingCompletedSequence,
          endingCompletedSequence: completedPresentation.completedSequence,
        })}`);
      }
      const finalQueueLatencyMs = completedPresentation.lastCompletionLatencyMs;
      assertWebGpuAdmissionCompletionLatency(
        `${label} adaptive admission final completion`,
        finalQueueLatencyMs,
        MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS,
      );
      const maximumQueueLatencyMs = Math.max(
        sampled.maximumQueueLatencyMs,
        completedPresentation.progress.maximumCompletionLatencyMs,
        finalQueueLatencyMs,
      );
      assertWebGpuAdmissionCompletionLatency(
        `${label} adaptive admission`,
        maximumQueueLatencyMs,
        MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS,
      );
      const nextPixelRatio = adaptiveQuality.calibrateSevereAdmissionDownshift(
        sampled.samples,
        `${label} admitted WebGPU submission window`,
        MATCH_ADMISSION_SEVERE_P50_MS,
        MATCH_ADMISSION_SEVERE_P95_MS,
        MATCH_ADMISSION_ADAPTIVE_MINIMUM_SAMPLES,
      );
      const calibrated = adaptiveQuality.telemetry();
      windows.push(Object.freeze({
        tier: current.tier,
        pixelRatioCap: current.pixelRatioCap,
        samples: sampled.samples.length,
        p50SubmissionGapMs: calibrated.p50Ms,
        p95SubmissionGapMs: calibrated.p95Ms,
        submittedCadenceHz: calibrated.p50Ms > 0 ? 1_000 / calibrated.p50Ms : 0,
        maximumSubmissionGapMs: Math.max(0, ...sampled.samples),
        maximumQueueLatencyMs,
        startingSubmissionSequence: sampled.startingSubmissionSequence,
        endingSubmissionSequence: completedPresentation.submissionSequence,
        startingCompletedSequence: sampled.startingCompletedSequence,
        endingCompletedSequence: completedPresentation.completedSequence,
        submissionAdvances,
        completionAdvances,
        decision: sampled.samples.length < MATCH_ADMISSION_ADAPTIVE_MINIMUM_SAMPLES
          ? 'insufficient-sample'
          : nextPixelRatio === null ? 'stable' : 'downshift',
      }));
      if (sampled.samples.length < MATCH_ADMISSION_ADAPTIVE_MINIMUM_SAMPLES) {
        matchWebGpuQualityFrozen = true;
        lastMatchAdmissionAdaptiveCalibration = Object.freeze({
          label,
          status: 'skipped',
          initialPixelRatioCap,
          presetPixelRatioCap,
          finalPixelRatioCap: adaptiveQuality.telemetry().pixelRatioCap,
          windows: Object.freeze([...windows]),
          startedAt,
          completedAt: performance.now(),
        });
        return;
      }
      if (nextPixelRatio !== null) {
        deferredWebGpuAdaptivePixelRatio.request(nextPixelRatio);
        if (!applyDeferredAdaptiveWebGpuRenderBudget(performance.now())) {
          throw new Error(`${label} adaptive admission resize was not admitted after its WebGPU completion fence`);
        }
        submitWebGpuFrame(performance.now(), true);
        await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
        assertWebGpuAdmissionCompletionLatency(
          `${label} adaptive resize`,
          renderRuntime.presentationTelemetry().lastCompletionLatencyMs,
          MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS,
        );
      }
    }
    matchWebGpuQualityFrozen = true;
    lastMatchAdmissionAdaptiveCalibration = Object.freeze({
      label,
      status: 'stable',
      initialPixelRatioCap,
      presetPixelRatioCap,
      finalPixelRatioCap: adaptiveQuality.telemetry().pixelRatioCap,
      windows: Object.freeze([...windows]),
      startedAt,
      completedAt: performance.now(),
    });
  } catch (error) {
    matchWebGpuQualityFrozen = false;
    lastMatchAdmissionAdaptiveCalibration = Object.freeze({
      label,
      status: 'failed',
      initialPixelRatioCap,
      presetPixelRatioCap,
      finalPixelRatioCap: adaptiveQuality.telemetry().pixelRatioCap,
      windows: Object.freeze([...windows]),
      startedAt,
      completedAt: performance.now(),
    });
    throw error;
  }
}

async function settleWebGpuPresentation(label: string): Promise<void> {
  if (renderRuntime.backend !== 'webgpu') return;
  await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
  for (let sample = 0; sample < 3; sample += 1) {
    submitWebGpuFrame(performance.now(), true);
    await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
    const presentation = renderRuntime.presentationTelemetry();
    if (presentation.status !== 'healthy') {
      throw new Error(`${label} presentation was not healthy: ${JSON.stringify(presentation)}`);
    }
    assertWebGpuAdmissionCompletionLatency(
      label,
      presentation.lastCompletionLatencyMs,
      MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS,
    );
  }
  await settleMatchAdmissionAdaptiveWebGpuPresentation(label);
}

async function waitForStableMatchAdmissionCadence(): Promise<void> {
  const minimumStableWindowMs = 1_000;
  const maximumWaitMs = 5_000;
  const hitchThresholdMs = 50;
  bootstrapStage = 'verifying-first-presentation';
  if (renderRuntime.backend === 'webgpu') {
    await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
    renderRuntime.resetPresentationProgressWindow(performance.now());
  }
  const startingPresentation = renderRuntime.backend === 'webgpu'
    ? renderRuntime.presentationTelemetry()
    : null;
  const sampledCadence = await new Promise<Omit<MatchAdmissionCadence,
    'endingSubmissionSequence' | 'endingCompletedSequence' | 'submissionAdvances' | 'completionAdvances'
    | 'maximumSubmissionGapMs' | 'maximumCompletionGapMs' | 'maximumPendingForMs'
    | 'maximumCompletionLatencyMs' | 'drained'
  >>((resolve, reject) => {
    const startedAt = performance.now();
    let stableSince = startedAt;
    let previousAt = 0;
    let samples = 0;
    let resets = 0;
    let maximumGapMs = 0;
    const sample = (now: number): void => {
      samples += 1;
      let resetStableWindow = false;
      if (previousAt > 0) {
        const gapMs = Math.max(0, now - previousAt);
        maximumGapMs = Math.max(maximumGapMs, gapMs);
        if (gapMs > hitchThresholdMs) resetStableWindow = true;
      }
      previousAt = now;
      let presentationProgressReady = renderRuntime.backend === 'webgl2';
      if (renderRuntime.backend === 'webgpu'
        && document.visibilityState === 'visible' && document.hasFocus()) {
        // Render the exact staged gameplay composition while the prerecorded
        // transition remains opaque. This advances no simulation, authority,
        // input, networking or audio; it proves real submitted/completed frames
        // instead of declaring an idle requestAnimationFrame loop hitch-free.
        try {
          submitWebGpuFrame(now, false, 'warmed-live');
          const presentation = renderRuntime.presentationTelemetry(performance.now());
          if (presentation.status === 'device-lost' || presentation.status === 'failed') {
            reject(new Error(`Match admission renderer was ${presentation.status}: ${presentation.lastFailure ?? 'unknown failure'}`));
            return;
          }
          if (presentation.status === 'stalled') {
            resetStableWindow = true;
          }
          const progress = presentation.progress;
          presentationProgressReady = progress.submissionAdvances > 0
            && progress.completionAdvances > 0
            && progress.maximumSubmissionGapMs <= hitchThresholdMs
            && progress.maximumCompletionGapMs <= hitchThresholdMs
            && progress.currentSubmissionGapMs <= hitchThresholdMs
            && progress.currentCompletionGapMs <= hitchThresholdMs;
          if (!presentationProgressReady && (
            progress.maximumSubmissionGapMs > hitchThresholdMs
            || progress.maximumCompletionGapMs > hitchThresholdMs
            || progress.currentSubmissionGapMs > hitchThresholdMs
            || progress.currentCompletionGapMs > hitchThresholdMs
          )) resetStableWindow = true;
        } catch (error) {
          reject(error);
          return;
        }
      }
      if (resetStableWindow) {
        stableSince = now;
        resets += 1;
        if (renderRuntime.backend === 'webgpu') {
          renderRuntime.resetPresentationProgressWindow(performance.now());
        }
        presentationProgressReady = renderRuntime.backend === 'webgl2';
      }
      const waitedMs = Math.max(0, now - startedAt);
      if (now - stableSince >= minimumStableWindowMs && presentationProgressReady) {
        resolve(Object.freeze({
          backend: renderRuntime.backend,
          waitedMs,
          stableWindowMs: now - stableSince,
          samples,
          resets,
          maximumGapMs,
          startingSubmissionSequence: startingPresentation?.submissionSequence ?? 0,
          startingCompletedSequence: startingPresentation?.completedSequence ?? 0,
          admittedDegraded: false,
          visibilityState: document.visibilityState,
          documentHasFocus: document.hasFocus(),
        }));
        return;
      }
      if (waitedMs >= maximumWaitMs) {
        // A backgrounded tab can be throttled to roughly one animation frame
        // per second even when its GPU work is fully retired. Admission
        // telemetry must record that degraded cadence, not turn it into a
        // fatal error that bounces one multiplayer peer back to the menu.
        resolve(Object.freeze({
          backend: renderRuntime.backend,
          waitedMs,
          stableWindowMs: now - stableSince,
          samples,
          resets,
          maximumGapMs,
          startingSubmissionSequence: startingPresentation?.submissionSequence ?? 0,
          startingCompletedSequence: startingPresentation?.completedSequence ?? 0,
          admittedDegraded: true,
          visibilityState: document.visibilityState,
          documentHasFocus: document.hasFocus(),
        }));
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  if (renderRuntime.backend === 'webgpu') {
    await flushWebGpuFrames(MATCH_ADMISSION_MAX_COMPLETION_LATENCY_MS);
  }
  const endingPresentation = renderRuntime.backend === 'webgpu'
    ? renderRuntime.presentationTelemetry()
    : null;
  const endingSubmissionSequence = endingPresentation?.submissionSequence ?? 0;
  const endingCompletedSequence = endingPresentation?.completedSequence ?? 0;
  const submissionAdvances = endingSubmissionSequence - sampledCadence.startingSubmissionSequence;
  const completionAdvances = endingCompletedSequence - sampledCadence.startingCompletedSequence;
  const maximumSubmissionGapMs = endingPresentation?.progress.maximumSubmissionGapMs ?? 0;
  const maximumCompletionGapMs = endingPresentation?.progress.maximumCompletionGapMs ?? 0;
  const maximumPendingForMs = endingPresentation?.progress.maximumPendingForMs ?? 0;
  const maximumCompletionLatencyMs = endingPresentation?.progress.maximumCompletionLatencyMs ?? 0;
  const drained = renderRuntime.backend === 'webgl2' || (
    submissionAdvances > 0
    && completionAdvances > 0
    && endingCompletedSequence === endingSubmissionSequence
    && maximumSubmissionGapMs <= hitchThresholdMs
    && maximumCompletionGapMs <= hitchThresholdMs
    && maximumPendingForMs <= hitchThresholdMs
    && maximumCompletionLatencyMs <= hitchThresholdMs
  );
  lastMatchAdmissionCadence = Object.freeze({
    ...sampledCadence,
    endingSubmissionSequence,
    endingCompletedSequence,
    submissionAdvances,
    completionAdvances,
    maximumSubmissionGapMs,
    maximumCompletionGapMs,
    maximumPendingForMs,
    maximumCompletionLatencyMs,
    drained,
    admittedDegraded: sampledCadence.admittedDegraded || !drained,
  });
  // Never bounce a player back to the menu merely because a browser cadence
  // sample was degraded. The exact-SHA cold WebGPU release gate rejects a
  // candidate with admittedDegraded=true; the runtime records it and proceeds
  // so a background peer or transiently occluded window can still recover.
  bootstrapStage = 'ready';
}

function synchronizeFinalWebGlMatchPrimePresentation(): void {
  if (!gameStarted || !player.alive) {
    throw new Error('Final WebGL2 match prime requires a live respawned player');
  }
  // Match admission intentionally blocks updatePhysics while the prerecorded
  // deployment surface is visible. Snap only presentation state here: never
  // advance character physics, weapon actions, audio, authority or networking.
  weaponBob = 0;
  recoilVisual = 0;
  recoilCamera = { pitch: 0, yaw: 0 };
  landingImpulse = 0;
  cameraHeightOffset = 0;
  cameraRoll = 0;
  camera.fov = preferredFov;
  camera.updateProjectionMatrix();
  camera.position.copy(player.position);
  camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  weaponView.setWeapon(player.weapon, true);
  weaponView.snapToMatchStartRestPose(currentViewmodelSurfaceRetreat());
  weaponView.setPresentationVisible(shouldShowWeaponViewmodel());
  camera.updateMatrixWorld(true);
}

async function primeFinalWebGlMatchPresentation(): Promise<void> {
  if (renderRuntime.backend === 'webgpu') return;
  if (!atomicSignal) throw new Error('Final WebGL2 match prime requires the AtomicSignal pass');
  bootstrapStage = 'verifying-first-presentation';
  const startedAt = performance.now();
  const priorRenderSubmissionPaused = renderSubmissionPaused;
  const priorMatchAdmissionPresentationPaused = matchAdmissionPresentationPaused;
  renderSubmissionPaused = true;
  matchAdmissionPresentationPaused = true;
  try {
    synchronizeFinalWebGlMatchPrimePresentation();
    const synchronizedAt = performance.now();
    // Keep the deployment surface up for one compositor/driver settle boundary.
    // The admission-presentation pause prevents the global frame loop from
    // consuming gameplay, countdown, audio, HUD or network progression.
    await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    const firstRenderStartedAt = performance.now();
    atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);
    const firstRenderedAt = performance.now();
    // One more frozen settle boundary absorbs deferred driver work, then a
    // second exact normal-frustum draw lands immediately before ready.
    const settledAt = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    const finalRenderStartedAt = performance.now();
    atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);
    const finalRenderedAt = performance.now();
    lastWebGlReadyPrime = Object.freeze({
      startedAt,
      synchronizedAt,
      firstRenderedAt,
      settledAt,
      finalRenderedAt,
      firstRenderDurationMs: Number((firstRenderedAt - firstRenderStartedAt).toFixed(3)),
      finalRenderDurationMs: Number((finalRenderedAt - finalRenderStartedAt).toFixed(3)),
      settleDelayMs: Number((settledAt - firstRenderedAt).toFixed(3)),
    });
    bootstrapStage = 'ready';
  } finally {
    // The final synchronous WebGL draw can itself be expensive. Never feed its
    // hidden duration into the first live simulation/adaptive-quality sample.
    lastFrame = performance.now();
    accumulator = 0;
    matchAdmissionPresentationPaused = priorMatchAdmissionPresentationPaused;
    renderSubmissionPaused = priorRenderSubmissionPaused;
  }
}

function buildSky(): void {
  if (renderRuntime.backend === 'webgl2') {
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
  }
  hemisphereLight = new THREE.HemisphereLight(
    activeLighting.hemisphereSky,
    activeLighting.hemisphereGround,
    activeLighting.hemisphereIntensity * graphicsRuntime.indirectLightScale,
  );
  ambientLight = new THREE.AmbientLight(activeLighting.ambientColor, activeLighting.ambientIntensity * graphicsRuntime.indirectLightScale);
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
  sunLight.shadow.radius = activeLighting.softShadows ? 2.2 : 1;
  scene.add(sunLight);
  fillLight = new THREE.DirectionalLight(activeLighting.fillColor, activeLighting.fillIntensity * graphicsRuntime.indirectLightScale);
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
let selectedArena: ArenaSelection = arenaSelection(new URLSearchParams(window.location.search).get('map'));
audio.setArena(selectedArena.id);
const arenaFactories: Readonly<Record<ArenaId, (target: THREE.Scene) => ArenaMap>> = Object.freeze({
  'atomic-acres': buildArena,
  'rustworks-1v1': buildRustworks1v1,
  'gun-range': buildGunRange,
  'skyline-terminal': buildSkylineTerminal,
});
const arenaCache = new Map<ArenaId, ArenaMap>();
const ARENA_CACHE_BOUND = 2;
const arenaConstructionHistory: ArenaId[] = [];
const arenaRetirementInventory = {
  roots: 0,
  auxiliaryRoots: 0,
  geometries: 0,
  materials: 0,
  shadowMaps: 0,
  texturesDeferredToSharedCache: 0,
};

function prepareArenaPresentation(candidate: ArenaMap): void {
  candidate.root.visible = false;
  candidate.root.userData.authoritativeArenaId = candidate.id;
  if (candidate.id === 'rustworks-1v1') {
    applyRustworksPresentationProfile(candidate.root, renderProfile);
    createRustworksQualityLights(candidate.root, renderProfile);
    if (renderProfile === 'blender') enhanceRustworksQualityMaterials(candidate.root, renderProfile);
  } else if (candidate.id === 'skyline-terminal') {
    applyAdditionalMapPresentationProfile(candidate.root, renderProfile);
  }
}

function constructArena(arenaId: ArenaId, recordConstruction = true): ArenaMap {
  const stagingScene = new THREE.Scene();
  const candidate = arenaFactories[arenaId](stagingScene);
  candidate.root.removeFromParent();
  prepareArenaPresentation(candidate);
  if (recordConstruction) arenaConstructionHistory.push(arenaId);
  return candidate;
}

function ensureArenaConstructed(arenaId: ArenaId): ArenaMap {
  const cached = arenaCache.get(arenaId);
  if (cached) {
    // Map insertion order is the LRU order. Touching a cached arena keeps the
    // current and most-recently-used roots while older GPU-heavy roots retire.
    arenaCache.delete(arenaId);
    arenaCache.set(arenaId, cached);
    return cached;
  }
  const candidate = constructArena(arenaId);
  arenaCache.set(arenaId, candidate);
  return candidate;
}

function retireArenaAfterGpuFence(arenaId: ArenaId, candidate: ArenaMap): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let shadowMaps = 0;
  candidate.root.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of nodeMaterials) {
        materials.add(material);
        const record = material as THREE.Material & Record<string, unknown>;
        for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
          if (record[key] instanceof THREE.Texture) textures.add(record[key] as THREE.Texture);
        }
      }
    }
    if (node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight) {
      if (node.shadow.map) shadowMaps += 1;
    }
  });
  arenaRetirementInventory.roots += 1;
  arenaRetirementInventory.geometries += geometries.size;
  arenaRetirementInventory.materials += materials.size;
  arenaRetirementInventory.shadowMaps += shadowMaps;
  arenaRetirementInventory.texturesDeferredToSharedCache += textures.size;
  arenaCache.delete(arenaId);
  scheduleDeferredGpuRetirement(candidate.root);
}

function disposeRetiredArena(arenaId: ArenaId, candidate: ArenaMap): void {
  candidate.root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let shadowMaps = 0;
  candidate.root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const nodeMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of nodeMaterials) {
      materials.add(material);
      const record = material as THREE.Material & Record<string, unknown>;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        if (record[key] instanceof THREE.Texture) textures.add(record[key] as THREE.Texture);
      }
    }
    if (node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight) {
      if (node.shadow.map) shadowMaps += 1;
      node.shadow.map?.dispose();
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  // TextureLoader/Cache may return the same texture to a newly constructed
  // arena. Keep shared texture objects alive; terminal teardown owns them.
  arenaRetirementInventory.roots += 1;
  arenaRetirementInventory.geometries += geometries.size;
  arenaRetirementInventory.materials += materials.size;
  arenaRetirementInventory.shadowMaps += shadowMaps;
  arenaRetirementInventory.texturesDeferredToSharedCache += textures.size;
  candidate.root.clear();
  arenaCache.delete(arenaId);
}

function disposeArenaPresentationRoot(root: THREE.Group): void {
  root.removeFromParent();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let shadowMaps = 0;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const nodeMaterials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of nodeMaterials) {
      materials.add(material);
      const record = material as THREE.Material & Record<string, unknown>;
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap']) {
        if (record[key] instanceof THREE.Texture) textures.add(record[key] as THREE.Texture);
      }
    }
    if (node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight) {
      if (node.shadow.map) shadowMaps += 1;
      node.shadow.map?.dispose();
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  arenaRetirementInventory.auxiliaryRoots += 1;
  arenaRetirementInventory.geometries += geometries.size;
  arenaRetirementInventory.materials += materials.size;
  arenaRetirementInventory.shadowMaps += shadowMaps;
  arenaRetirementInventory.texturesDeferredToSharedCache += textures.size;
  root.clear();
}

async function retireAllArenasExcept(arenaId: ArenaId): Promise<void> {
  // Keep the selected and one most-recent arena. A four-root cache avoided the
  // original use-after-destroy race but retained enough material/pipeline state
  // to exhaust Dawn during repeated 2560x1440 switches. Evictions now occur
  // only after the selected root compiled and the prior GPU queue was fenced.
  for (const [candidateId, candidate] of arenaCache) {
    if (candidateId === arenaId) continue;
    candidate.root.removeFromParent();
    candidate.root.visible = false;
  }
  while (arenaCache.size > ARENA_CACHE_BOUND) {
    const oldest = [...arenaCache].find(([candidateId]) => candidateId !== arenaId);
    if (!oldest) break;
    retireArenaAfterGpuFence(oldest[0], oldest[1]);
  }
  if (arenaCache.size > ARENA_CACHE_BOUND) {
    throw new Error(`Arena cache exceeded canonical bound: ${arenaCache.size}`);
  }
}

function createDormantMenuArena(arenaId: ArenaId): ArenaMap {
  const root = new THREE.Group();
  root.name = 'Dormant menu arena placeholder';
  root.visible = false;
  root.userData.menuOnlyPlaceholder = true;
  return {
    id: arenaId,
    label: arenaSelection(arenaId).displayName,
    root,
    colliders: [],
    physicsColliders: [],
    raycastMeshes: [],
    shotSurfaces: [],
    spawns: { 0: [], 1: [] },
    patrolPoints: [],
    targets: [],
    houses: [],
    breakableWindows: [],
    physicalCover: [],
    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 0, maxY: 2 },
    houseTelemetry: {
      houses: 0,
      groundRooms: 0,
      upperRooms: 0,
      doors: 0,
      windows: 0,
      ramps: 0,
      wallMaterialVariants: 0,
      pbrMaterialFamilies: 0,
    },
  };
}

// The menu owns prerecorded media. Do not construct, stream, compile, upload,
// or submit any gameplay arena until the player explicitly deploys.
let arena: ArenaMap = createDormantMenuArena(selectedArena.id);
let gameplayArenaPrepared = false;
let interactiveWorldRuntime: InteractiveWorldRuntime | null = null;
let interactiveWorldMatchEpoch = 1;
let interactiveWorldTick = 0;
let lastInteractiveWorldBroadcastRevision = -1;
let activeWorldColliderCacheArena: ArenaMap | null = null;
let activeWorldColliderCacheRuntime: InteractiveWorldRuntime | null = null;
let activeWorldColliderCacheRevision = -1;
let activeWorldColliderCache: ArenaMap['colliders'] = [];
type PersistentWindowDebris = {
  id: string;
  windowId: string;
  root: THREE.Group;
  definition: MajorDebrisBodyDefinition;
};
const persistentWindowDebris = new Map<string, PersistentWindowDebris>();

function createInteractiveWorldRuntime(
  activeArena: ArenaMap,
  matchEpoch: number,
  hostAuthority: boolean,
): InteractiveWorldRuntime {
  const runtime = new InteractiveWorldRuntime(
    activeArena.id,
    matchEpoch,
    shedPlacementsForArena(activeArena.id),
    hostAuthority,
    undefined,
    scheduleDeferredGpuGeometryRetirement,
    activeArena.houseDestruction?.definitions ?? [],
  );
  // Quality/Blender arena presentation may intentionally hide the procedural
  // arena root while retaining its collision authority. Interactive gameplay
  // must remain visible in either presentation mode, so it owns a scene-level
  // dynamic root rather than inheriting that procedural visibility toggle.
  scene.add(runtime.root);
  return runtime;
}

function invalidateActiveWorldCollisionCache(): void {
  activeWorldColliderCacheArena = null;
  activeWorldColliderCacheRuntime = null;
  activeWorldColliderCacheRevision = -1;
  activeWorldColliderCache = [];
}

function activeGlassDynamicColliders(activeArena: ArenaMap = arena): readonly DynamicWorldCollider[] {
  const entries: DynamicWorldCollider[] = [];
  for (const pane of activeArena.breakableWindows) {
    const solid = pane.glassState
      ? glassAuthorityProjection(pane.glassState).movementSolid
      : !pane.broken;
    if (!solid) continue;
    pane.mesh.updateWorldMatrix(true, false);
    const bounds = new THREE.Box3().setFromObject(pane.mesh);
    if (bounds.isEmpty() || ![
      bounds.min.x, bounds.max.x, bounds.min.y, bounds.max.y, bounds.min.z, bounds.max.z,
    ].every(Number.isFinite)) continue;
    entries.push(Object.freeze({
      id: `glass:${pane.id}`,
      bounds: Object.freeze({
        minX: bounds.min.x,
        maxX: bounds.max.x,
        minY: bounds.min.y,
        maxY: bounds.max.y,
        minZ: bounds.min.z,
        maxZ: bounds.max.z,
      }),
    }));
  }
  return Object.freeze(entries);
}

function activeWorldColliders(activeArena: ArenaMap = arena): ArenaMap['colliders'] {
  if (activeArena !== arena || !interactiveWorldRuntime) {
    return [...activeArena.colliders, ...activeGlassDynamicColliders(activeArena).map((entry) => entry.bounds)];
  }
  const collision = interactiveWorldRuntime.collisions();
  if (activeWorldColliderCacheArena !== activeArena
    || activeWorldColliderCacheRuntime !== interactiveWorldRuntime
    || activeWorldColliderCacheRevision !== collision.revision) {
    activeWorldColliderCacheArena = activeArena;
    activeWorldColliderCacheRuntime = interactiveWorldRuntime;
    activeWorldColliderCacheRevision = collision.revision;
    const replacedStatic = new Set(activeArena.houseDestruction?.staticColliders ?? []);
    activeWorldColliderCache = [
      ...activeArena.colliders.filter((collider) => !replacedStatic.has(collider)),
      ...collision.movementColliders,
      ...activeGlassDynamicColliders(activeArena).map((entry) => entry.bounds),
    ];
  }
  return activeWorldColliderCache;
}

function syncInteractiveWorldPhysics(authoritativeResync = false): void {
  invalidateActiveWorldCollisionCache();
  if (!characterPhysics) return;
  const collision = interactiveWorldRuntime?.collisions();
  const interactiveDynamicColliders = collision
    ? collision.dynamicColliders.filter((entry) => !entry.id.includes('debris:'))
    : [];
  // Major debris has real Rapier rigid bodies. Do not duplicate it as a
  // second static collider while retaining it in the shared collision view
  // used by ballistics, LOS, support and diagnostics.
  characterPhysics.syncDynamicColliders(
    [
      ...interactiveDynamicColliders,
      ...activeGlassDynamicColliders(),
    ],
  );
  if (!interactiveWorldRuntime) return;
  characterPhysics.syncMajorDebrisBodies(activeMajorDebrisPhysicsBodies(), authoritativeResync);
  for (const mesh of interactiveWorldRuntime.housePresentationRaycastMeshes()) {
    if (!arena.raycastMeshes.includes(mesh)) arena.raycastMeshes.push(mesh);
  }
  botNavigationColliders = navigationCollidersFor(arena);
  syncAtomicHouseStructuralPresentation();
}

function activeMajorDebrisPhysicsBodies(): readonly MajorDebrisBodyDefinition[] {
  const runtimeBodies = interactiveWorldRuntime?.majorDebrisPhysicsBodies() ?? [];
  const capacity = Math.max(0, MAX_MAJOR_DEBRIS_BODIES - runtimeBodies.length);
  const windowBodies = [...persistentWindowDebris.values()]
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, Math.min(capacity, SHARED_MAJOR_DEBRIS_BUDGET.window))
    .map((entry) => entry.definition);
  const bodies = [...runtimeBodies, ...windowBodies];
  if (bodies.length > MAX_MAJOR_DEBRIS_BODIES) throw new TypeError('Shared major debris budget exceeded');
  return Object.freeze(bodies);
}

function updatePersistentWindowDebrisPhysics(): void {
  if (!characterPhysics || persistentWindowDebris.size === 0) return;
  const snapshots = new Map(characterPhysics.majorDebrisSnapshots().map((snapshot) => [snapshot.id, snapshot]));
  for (const entry of persistentWindowDebris.values()) {
    const snapshot = snapshots.get(entry.id);
    if (!snapshot) continue;
    entry.root.position.set(snapshot.position.x, snapshot.position.y, snapshot.position.z);
    entry.root.quaternion.set(snapshot.rotation.x, snapshot.rotation.y, snapshot.rotation.z, snapshot.rotation.w);
    entry.definition = majorDebrisDefinitionFromSnapshot(entry.definition, snapshot);
  }
}

function majorDebrisDefinitionFromSnapshot(
  definition: MajorDebrisBodyDefinition,
  snapshot: MajorDebrisBodySnapshot,
): MajorDebrisBodyDefinition {
  return Object.freeze({
    ...definition,
    position: snapshot.position,
    rotation: snapshot.rotation,
    linearVelocity: snapshot.linearVelocity,
    angularVelocity: snapshot.angularVelocity,
    sleeping: snapshot.sleeping,
  });
}

function reconcileInteractiveWorldDoorObstructions(): boolean {
  if (!interactiveWorldRuntime?.hasHostAuthority()) return false;
  const blockers: Array<Readonly<{
    kind: 'player' | 'major-debris';
    id: string;
    position: THREE.Vector3;
    radius: number;
  }>> = [];
  if (player.alive) blockers.push({ kind: 'player', id: player.id, position: player.position.clone(), radius: 0.42 });
  for (const remote of remotes.values()) {
    if (remote.snapshot.hp <= 0) continue;
    blockers.push({
      kind: 'player', id: remote.snapshot.id,
      position: new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z), radius: 0.42,
    });
  }
  for (const bot of bots.values()) {
    if (!bot.alive) continue;
    blockers.push({ kind: 'player', id: bot.id, position: bot.position.clone().add(new THREE.Vector3(0, 1.55, 0)), radius: 0.42 });
  }
  for (const body of interactiveWorldRuntime.majorDebrisPhysicsBodies()) {
    blockers.push({
      kind: 'major-debris', id: body.id.split(':').at(-1) ?? 'shed-debris',
      position: new THREE.Vector3(body.position.x, body.position.y, body.position.z), radius: 0.72,
    });
  }
  let changed = false;
  for (const door of interactiveWorldRuntime.doorCollisionStates()) {
    const blocker = blockers.find((candidate) => isBlocked(candidate.position, [door.bounds], candidate.radius));
    if (door.phase === 'closed' && blocker?.kind === 'player') {
      if (interactiveWorldRuntime.pushDoorFromPlayerContact({
        placementId: door.placementId,
        actorId: blocker.id,
        tick: interactiveWorldTick,
      })?.accepted) {
        changed = true;
        audio.shedDoorMotion(blocker.position.distanceTo(camera.position));
      }
      continue;
    }
    if (door.phase === 'blocked') {
      if (!blocker
        && door.resumePolicy === 'resume-when-clear'
        && interactiveWorldRuntime.resumeDoor(door.placementId, interactiveWorldTick)?.accepted) changed = true;
      continue;
    }
    if (door.phase === 'opening' && blocker?.kind === 'player') continue;
    if (door.phase !== 'opening' && door.phase !== 'closing') continue;
    if (blocker && interactiveWorldRuntime.blockDoor({
      placementId: door.placementId,
      tick: interactiveWorldTick,
      kind: blocker.kind,
      entityId: blocker.id,
    })?.accepted) changed = true;
  }
  return changed;
}

function stepInteractiveWorldAuthority(): void {
  if (!interactiveWorldRuntime || !gameStarted || matchState.phase !== 'active') return;
  interactiveWorldTick += 1;
  if (!interactiveWorldRuntime.hasHostAuthority()) return;
  let changed = reconcileInteractiveWorldDoorObstructions();
  changed = interactiveWorldRuntime.step(interactiveWorldTick) || changed;
  if (characterPhysics && interactiveWorldTick % 6 === 0 && characterPhysics.majorDebrisBodyCount() > 0) {
    changed = interactiveWorldRuntime.adoptMajorDebrisPhysics(characterPhysics.majorDebrisSnapshots()) || changed;
  }
  if (changed) syncInteractiveWorldPhysics();
  broadcastInteractiveWorldState();
}

let worldIdentityPresentation: WorldIdentityPresentation | null = null;
let neighbourhoodLifeRoot: THREE.Group | null = null;

function ensureAtomicWorldPresentation(): void {
  if (!worldIdentityPresentation) {
    worldIdentityPresentation = createWorldIdentityPresentation(scene, atomicLighting, softwareRenderer);
  }
  if (!neighbourhoodLifeRoot) neighbourhoodLifeRoot = addNeighbourhoodLife(scene, reducedWorldDetail);
}

const arenaVisualStream = new ArenaVisualStreamController(scene);
let arenaVisualReceipt: ArenaVisualSwitchReceipt | null = null;
const arenaRenderWatchdog = new ArenaRenderWatchdog(3);
let pass64TslSystems: Pass64TslSceneSystems | null = null;
let appliedTslArenaDefinitions = 0;
let activeArenaReviewCameraId: string | null = null;
let activeArenaReviewFixedTimeMs: number | null = null;
let activeArenaReviewSeed: number | null = null;
let activeArenaReviewExposure: number | null = null;
let activeArenaReviewHud: 'hidden' | 'visible' | null = null;
const arenaContrastLighting = new ArenaContrastLighting(scene, renderProfile, softwareRenderer);
let appliedArenaVisualPolicy: Readonly<{
  definitionId: ArenaId;
  sun: Readonly<{ color: number; intensity: number }>;
  ambient: Readonly<{ color: number; intensity: number }>;
  fog: ArenaVisualDefinition['fog'];
  shadows: ArenaVisualDefinition['shadows'];
  atmosphere: ArenaVisualDefinition['atmosphere'];
  colorPipelineId: string;
  budgets: ArenaVisualBudgets;
  reviewCameraIds: readonly string[];
}> | null = null;

function applySelectedArenaVisualDefinition(definition: ArenaVisualDefinition): void {
  activeLighting = rustworksLightingTint(arenaLightingProfile(renderProfile, definition.id), renderProfile, definition.id);
  renderRuntime.setExposure(effectiveGraphicsExposure(definition.colorPipeline.exposure));
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.color.setHex(definition.fog.color);
    scene.fog.near = definition.fog.near;
    scene.fog.far = definition.fog.far;
  }
  ambientLight.color.setHex(definition.lighting.ambientColor);
  ambientLight.intensity = definition.lighting.ambientIntensity * graphicsRuntime.indirectLightScale;
  sunLight.color.setHex(definition.lighting.sunColor);
  sunLight.intensity = definition.lighting.sunIntensity;
  const definitionShadowsEnabled = adaptiveShadowsEnabled(
    renderProfile,
    activeRenderConfig.shadows && definition.shadows.enabled,
    adaptiveQuality.telemetry().pixelRatioCap,
  );
  renderRuntime.setShadowsEnabled(definitionShadowsEnabled);
  sunLight.castShadow = definitionShadowsEnabled && definition.lighting.sunIntensity > 0;
  const shadowMapSize = Math.min(definition.shadows.mapSize, activeRenderConfig.shadowMapSize);
  sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  sunLight.shadow.normalBias = definition.shadows.normalBias;
  graphicsRefinement.applyArena(
    definition.id,
    arena.bounds,
    sunLight,
    activeLighting.sunPosition,
    sunLight.castShadow ? shadowMapSize : 0,
  );
  sunLight.shadow.camera.far = Math.min(sunLight.shadow.camera.far, definition.shadows.maximumDistance);
  sunLight.shadow.camera.updateProjectionMatrix();
  arenaContrastLighting.applyDefinition(definition);
  appliedArenaVisualPolicy = Object.freeze({
    definitionId: definition.id,
    sun: Object.freeze({ color: definition.lighting.sunColor, intensity: definition.lighting.sunIntensity }),
    ambient: Object.freeze({ color: definition.lighting.ambientColor, intensity: definition.lighting.ambientIntensity }),
    fog: definition.fog,
    shadows: definition.shadows,
    atmosphere: definition.atmosphere,
    colorPipelineId: definition.colorPipeline.id,
    budgets: definition.budgets,
    reviewCameraIds: Object.freeze(definition.reviewCameras.map((entry) => entry.id)),
  });
  if (renderRuntime.shadowsEnabled()) requestStaticShadowRefresh();
}

async function configurePlayableArenaVisuals(arenaId: ArenaId, root: THREE.Group, fence = true): Promise<void> {
  // Never retire buffers or post targets while the prior WebGPU submission can
  // still reference them. The awaited queue fence makes map-switch disposal a
  // real lifecycle boundary instead of a use-after-destroy race.
  if (renderRuntime.backend === 'webgpu' && fence) await flushWebGpuFrames();
  arenaVisualReceipt = await arenaVisualStream.adoptGameplayRoot(arenaId, root);
  const module = await loadArenaVisualModule(arenaId);
  activeArenaVisualDefinition = module.definition;
  applySelectedArenaVisualDefinition(module.definition);
  if (renderRuntime.backend === 'webgpu') {
    if (pass64TslSystems) pass64TslSystems.applyDefinition(module.definition);
    else {
      pass64TslSystems = createPass64TslSceneSystems(scene, camera, renderRuntime.renderPipeline, module.definition, {
        principalSamples: graphicsRuntime.antialiasSamples === 4 ? 4 : graphicsRuntime.antialiasSamples === 2 ? 2 : 1,
        volumetricScale: graphicsRuntime.volumetricScale,
        ambientOcclusion: graphicsRuntime.ambientOcclusion,
        post: graphicsRuntime.post,
      });
      // Menu preparation retains and decodes every viewmodel against the
      // renderer's bootstrap output. Only this first real TSL/HDR graph creation
      // invalidates that pipeline-dependent GPU receipt; the retained models
      // are re-prewarmed below without another asset load.
      weaponView.invalidateBrowserWeaponGpuReadinessForPipelineChange();
    }
    appliedTslArenaDefinitions += 1;
    renderRuntime.setRenderTargetTelemetry(pass64TslSystems.principalHdrTarget.samples, pass64TslSystems.bloomSamples);
    const traversal = auditRuntimeTslTraversal(scene, pass64TslSystems.compiledPipelineIds);
    assertRuntimeTslTraversal(traversal);
  }
  activeArenaReviewCameraId = null;
  activeArenaReviewFixedTimeMs = null;
  activeArenaReviewSeed = null;
  activeArenaReviewExposure = null;
  activeArenaReviewHud = null;
}
function activeBallisticSurfaces(activeArena: ArenaMap = arena): readonly BallisticSurface[] {
  const brokenWindowIds = new Set(activeArena.breakableWindows.filter((pane) => (
    pane.glassState ? glassAuthorityProjection(pane.glassState).apertureOpen : pane.broken
  )).map((pane) => pane.id));
  const runtimeOwnsHouseSurfaces = activeArena === arena && interactiveWorldRuntime !== null;
  const replacedHouseSurfaces = new Set(
    runtimeOwnsHouseSurfaces ? activeArena.houseDestruction?.staticBallisticSurfaceIds ?? [] : [],
  );
  const staticSurfaces = activeArena.shotSurfaces.filter(
    (surface) => (!surface.breakableWindowId || !brokenWindowIds.has(surface.breakableWindowId))
      && !replacedHouseSurfaces.has(surface.id),
  );
  return activeArena === arena && interactiveWorldRuntime
    ? [...staticSurfaces, ...interactiveWorldRuntime.collisions().ballisticSurfaces]
    : staticSurfaces;
}

function activeRaycastMeshes(activeArena: ArenaMap = arena): THREE.Object3D[] {
  const runtimeOwnsHouseMeshes = activeArena === arena && interactiveWorldRuntime !== null;
  return activeArena.raycastMeshes.filter((object) => {
    if (runtimeOwnsHouseMeshes && object.userData.dynamicAuthorityReplacement === true) return false;
    if (activeArena !== arena) return true;
    let ancestor = object.parent;
    while (ancestor) {
      if (!ancestor.visible) return false;
      ancestor = ancestor.parent;
    }
    return object.visible || object.userData.collisionProxy === true;
  });
}

function traceWeaponPath(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
  weapon: WeaponId,
): BallisticTrace {
  return traceBallisticPath(
    origin,
    direction,
    distance,
    WEAPONS[weapon].penetration,
    activeBallisticSurfaces(),
    interactiveWorldRuntime?.apertureQuery,
  );
}

function applyInteractiveWorldBallisticTrace(
  trace: BallisticTrace,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  weapon: WeaponId,
): boolean {
  if (!interactiveWorldRuntime?.hasHostAuthority() || trace.impacts.length === 0) return false;
  const spec = WEAPONS[weapon];
  const unitDirection = direction.clone().normalize();
  const penetrationEnergyQ = Math.max(0, Math.round(
    spec.penetration.penetrationPower * spec.penetration.fmjMultiplier * 10,
  ));
  const damageQ = Math.max(1, Math.round(spec.damage));
  const apertureRadiusQ = weapon === 'railgun' ? 700 : weapon === 'scattergun' ? 420 : 300;
  let changed = false;
  for (const impact of trace.impacts) {
    if (!impact.surface.destructibleSurface
      && !impact.surface.majorDebris
      && !impact.surface.houseFragment
      && !impact.surface.houseMajorDebris) continue;
    const point = origin.clone().addScaledVector(unitDirection, impact.entryDistance);
    const impulseMagnitudeQ = Math.min(50_000, Math.max(500, Math.round(damageQ * 280)));
    const impulseQ = Object.freeze({
      xQ: Math.round(unitDirection.x * impulseMagnitudeQ),
      yQ: Math.round(unitDirection.y * impulseMagnitudeQ),
      zQ: Math.round(unitDirection.z * impulseMagnitudeQ),
    });
    const result = impact.surface.houseFragment || impact.surface.houseMajorDebris
      ? interactiveWorldRuntime.applyHouseBulletImpact({
        surface: impact.surface,
        damageQ,
        penetrationEnergyQ,
        impulseQ,
      })
      : interactiveWorldRuntime.applyBulletImpact({
        surface: impact.surface,
        point,
        tick: interactiveWorldTick,
        damageQ,
        penetrationEnergyQ,
        radiusUQ: apertureRadiusQ,
        radiusVQ: apertureRadiusQ,
        impulseQ,
      });
    if (!result?.accepted) continue;
    changed = true;
    if (impact.surface.majorDebris && characterPhysics) {
      characterPhysics.applyMajorDebrisImpulse(
        `${impact.surface.majorDebris.placementId}:debris:${impact.surface.majorDebris.chunkId}`,
        unitDirection.clone().multiplyScalar(Math.min(12, Math.max(0.5, damageQ * 0.055))),
        point,
      );
    }
    if (impact.surface.houseMajorDebris && characterPhysics) {
      characterPhysics.applyMajorDebrisImpulse(
        `house-debris:${impact.surface.houseMajorDebris.fragmentId}`,
        unitDirection.clone().multiplyScalar(Math.min(12, Math.max(0.5, damageQ * 0.055))),
        point,
      );
    }
  }
  if (changed) {
    syncInteractiveWorldPhysics();
    broadcastInteractiveWorldState();
  }
  return changed;
}

function applyInteractiveWorldExplosion(
  point: THREE.Vector3,
  radius: number,
  maximumDamage: number,
  shedBlastClass?: 'grenade-major-collapse' | 'carpet-bomber-obliteration',
): boolean {
  if (!interactiveWorldRuntime?.hasHostAuthority() || radius <= 0 || maximumDamage <= 0) return false;
  // Shed panels need the stronger close-blast calibration, while house
  // fragments retain the weapon's authored damage instead of inheriting a
  // global 4x multiplier.
  const mutations = interactiveWorldRuntime.applyExplosionAt({
    origin: point,
    radius,
    maximumDamageQ: Math.max(1, Math.round(maximumDamage)),
    shedMaximumDamageQ: Math.max(1, Math.round(maximumDamage * FIELD_SHED_EXPLOSION_DAMAGE_MULTIPLIER)),
    shedBlastClass,
  });
  let debrisImpulses = 0;
  if (mutations > 0) syncInteractiveWorldPhysics();
  if (characterPhysics) {
    for (const body of activeMajorDebrisPhysicsBodies()) {
      const bodyPosition = new THREE.Vector3(body.position.x, body.position.y, body.position.z);
      const distance = bodyPosition.distanceTo(point);
      if (distance > radius) continue;
      const direction = bodyPosition.sub(point);
      if (direction.lengthSq() < 1e-6) direction.set(0, 1, 0);
      else direction.normalize().addScaledVector(new THREE.Vector3(0, 1, 0), 0.32).normalize();
      // Pass 65: launch freshly detached panels hard enough to visibly fly (physics caps at 80).
      if (characterPhysics.applyMajorDebrisImpulse(
        body.id,
        direction.multiplyScalar(Math.min(64, Math.max(6, maximumDamage * 0.3 * (1 - distance / radius)))),
      )) debrisImpulses += 1;
    }
  }
  if (mutations <= 0 && debrisImpulses <= 0) return false;
  broadcastInteractiveWorldState(true);
  return true;
}
document.documentElement.dataset.arenaId = selectedArena.id;
function applyArenaFogProfile(): void {
  const fog = activeArenaVisualDefinition?.id === selectedArena.id
    ? activeArenaVisualDefinition.fog
    : atmosphereFogRange(renderProfile, selectedArena.id);
  if (scene.fog instanceof THREE.Fog) {
    scene.fog.near = fog.near;
    scene.fog.far = fog.far;
  }
}
applyArenaFogProfile();
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
if (!quadIconContext) throw new Error('Canvas2D unavailable for 2× Damage world icon');
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
quadIconContext.fillText('2× DAMAGE', 128, 103);
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
// The core, rings and beacon own the visible emissive glow. Do not attach a
// zero-intensity Light as metadata: WebGPU still includes that object in the
// structural lighting key and would compile a second pipeline for every arena
// material when the pickup root becomes visible during match admission.
overdriveRoot.add(overdriveCore, ...overdriveRings, overdrivePedestal, quadWorldIcon, quadBeacon);
overdriveRoot.traverse((node) => { node.userData.presentationOnly = true; node.userData.blocksShots = false; node.raycast = () => undefined; });
scene.add(overdriveRoot);
let overdrivePresentationPrewarmed = false;
async function prewarmOverdrivePresentation(): Promise<void> {
  if (overdrivePresentationPrewarmed) return;
  overdriveRoot.visible = true;
  overdriveRoot.scale.setScalar(0.0001);
  try {
    // Traverse only the hidden pickup while the target scene supplies its real
    // lighting/environment variants. Compiling the entire arena here repeats
    // Quality-scene work and can starve menu readiness under SwiftShader.
    await renderRuntime.compileAndRender(overdriveRoot, camera, scene);
    overdrivePresentationPrewarmed = true;
  } finally {
    overdriveRoot.visible = false;
    overdriveRoot.scale.setScalar(1);
  }
}
const atmosphereSystem = renderRuntime.backend === 'webgl2'
  ? new AtmosphereSystem(scene, renderProfile, rendererLabel, mistQuery, selectedArena.id)
  : null;
const waterSystem = new WaterSystem(scene, renderRuntime.backend === 'webgpu' ? 'external-tsl' : 'legacy-glsl');
waterSystem.configure(selectedArena.id, renderProfile, {
  halfX: Math.max(Math.abs(arena.bounds.minX), Math.abs(arena.bounds.maxX)),
  halfZ: Math.max(Math.abs(arena.bounds.minZ), Math.abs(arena.bounds.maxZ)),
}, { night: selectedArena.id === 'rustworks-1v1', waterLevel: selectedArena.id === 'rustworks-1v1' ? -19.5 : -0.55 });
ensureRustworksStarfield(scene, selectedArena.id);
const grassSystem = renderRuntime.backend === 'webgl2'
  ? new GrassSystem(
      scene,
      renderProfile,
      rendererLabel,
      grassQuery,
      // Grass is an Atomic Acres-only presentation layer, so deep-linked solo maps
      // must never seed its permanent placements from their collision geometry.
      selectedArena.id === 'atomic-acres' ? activeWorldColliders() : [],
      atomicLighting,
    )
  : null;
grassSystem?.setAdaptivePixelRatio(adaptiveQuality.telemetry().pixelRatioCap);
if (renderRuntime.backend === 'webgl2') {
  renderRuntime.renderer.domElement.addEventListener('webglcontextrestored', () => {
    webglContextLost = false;
    webglContextRestorations += 1;
    document.documentElement.dataset.webglContext = 'ready';
    renderRuntime.requestShadowUpdate(activeRenderConfig.shadows);
    atomicSignal?.invalidateValidation();
    atmosphereSystem?.handleContextRestored();
    grassSystem?.handleContextRestored();
    resize();
  });
}
const impactPresentation = new ImpactPresentation(scene, reducedRenderMode);
applyPresentationEffectsBudget = (budget) => {
  atmosphereSystem?.setDensityScale(budget.particleDensityScale);
  impactPresentation.setBudget(budget.particleDensityScale, budget.decalLifetimeScale);
};
applyPresentationEffectsBudget(applyGraphicsPreferenceBudget(graphicsEffectsBudget(renderProfile, adaptiveQuality.telemetry().pixelRatioCap)));
const tracerPool = new TracerPool(scene);
const grenadeExplosionPresentation = new GrenadeExplosionPresentation(scene);
const supportExplosionPresentation = new SupportExplosionPresentation(scene, reducedRenderMode);
const deathDropPresentationPool = new DeathDropPresentationPool(
  scene,
  MAX_DEATH_DROPS,
  (root, afterFence) => scheduleDeferredGpuRetirement(root, true, afterFence),
);
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
    await renderRuntime.compileAndRender(nukeShockwave, camera, scene);
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
let atomicHouseAuthorityParity: AtomicHouseAuthorityParityReport | null = null;
let atomicAuthoredLoadPromise: Promise<THREE.Group | null> | null = null;
let atomicQualityLoadPromise: Promise<THREE.Group | null> | null = null;
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

function selectedArenaAuthority(expected: ArenaId): ArenaMap {
  if (selectedArena.id !== expected || arena.id !== expected) {
    throw new Error(`Cannot stream ${expected} presentation while ${selectedArena.id} owns gameplay authority`);
  }
  return arena;
}

function bindAtomicPresentationRaycasts(root: THREE.Group, authority: ArenaMap): void {
  const visibleMapMeshes = authority.raycastMeshes.filter((mesh) => mesh.visible || mesh.userData.collisionProxy === true);
  authority.raycastMeshes.splice(0, authority.raycastMeshes.length, ...visibleMapMeshes);
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.userData.blocksShots === true && !authority.raycastMeshes.includes(node)) {
      authority.raycastMeshes.push(node);
    }
  });
}

async function ensureAtomicAuthoredPresentation(): Promise<THREE.Group | null> {
  ensureAtomicWorldPresentation();
  const authority = selectedArenaAuthority('atomic-acres');
  if (arenaArtRoot && !blenderArenaActive) return arenaArtRoot;
  if (atomicAuthoredLoadPromise) return atomicAuthoredLoadPromise;
  qualityAssetStreaming.atomicAcres = 'loading';
  atomicAuthoredLoadPromise = loadArenaArt(scene, (loaded, total) => {
    setStatus(`Streaming Nuke Town authored art ${loaded}/${total}\u2026`);
  }, reducedWorldDetail).then(async (art) => {
    if (selectedArena.id !== 'atomic-acres') {
      disposeArenaPresentationRoot(art.root);
      return null;
    }
    arenaArtRoot = art.root;
    blenderArenaActive = false;
    atomicHouseAuthorityParity = auditAtomicHouseAuthorityParity(authority.root, art.root, 'performance');
    assertAtomicHouseAuthorityParity(atomicHouseAuthorityParity);
    art.root.userData.atomicHouseAuthorityParity = atomicHouseAuthorityParity;
    qualityAssetStreaming.atomicAcres = 'ready';
    bindAtomicPresentationRaycasts(art.root, authority);
    graphicsRefinement.refine(art.root, maximumAnisotropy);
    return art.root;
  });
  return atomicAuthoredLoadPromise;
}

async function ensureAtomicQualityPresentation(): Promise<THREE.Group | null> {
  if (renderProfile !== 'blender') return ensureAtomicAuthoredPresentation();
  ensureAtomicWorldPresentation();
  const authority = selectedArenaAuthority('atomic-acres');
  if (blenderArenaActive && arenaArtRoot) return arenaArtRoot;
  if (atomicQualityLoadPromise) return atomicQualityLoadPromise;
  qualityAssetStreaming.atomicAcres = 'loading';
  atomicQualityLoadPromise = (async () => {
    try {
      arenaVisualStream.recordSelectedAssetRequest('atomic-acres', BLENDER_ARENA_ASSET);
      const art = await loadBlenderArena(scene, authority, (loaded, total) => {
        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
        setStatus(`Streaming Nuke Town Quality art ${percent}%...`);
      });
      blenderArenaActive = true;
      arenaArtRoot = art.root;
      atomicHouseAuthorityParity = auditAtomicHouseAuthorityParity(authority.root, art.root, 'quality');
      assertAtomicHouseAuthorityParity(atomicHouseAuthorityParity);
      art.root.userData.atomicHouseAuthorityParity = atomicHouseAuthorityParity;
      qualityAssetStreaming.atomicAcres = 'ready';
      bindAtomicPresentationRaycasts(art.root, authority);
      graphicsRefinement.refine(art.root, maximumAnisotropy);
      return art.root;
    } catch (error) {
      markBlenderArenaFallback(error);
      console.error('[Nuke Town Quality Graphics asset load failed; using authored fallback]', error);
      const fallback = await loadArenaArt(scene, (loaded, total) => {
        setStatus(`Quality Graphics fallback ${loaded}/${total}...`);
      }, false);
      blenderArenaActive = false;
      arenaArtRoot = fallback.root;
      atomicHouseAuthorityParity = auditAtomicHouseAuthorityParity(authority.root, fallback.root, 'quality-fallback');
      assertAtomicHouseAuthorityParity(atomicHouseAuthorityParity);
      fallback.root.userData.atomicHouseAuthorityParity = atomicHouseAuthorityParity;
      qualityAssetStreaming.atomicAcres = 'fallback';
      bindAtomicPresentationRaycasts(fallback.root, authority);
      graphicsRefinement.refine(fallback.root, maximumAnisotropy);
      return fallback.root;
    }
  })();
  return atomicQualityLoadPromise;
}

async function ensureRustworksQualityPresentation(): Promise<THREE.Group | null> {
  if (renderProfile !== 'blender') return null;
  const authority = selectedArenaAuthority('rustworks-1v1');
  // The duplicate authored tower is retired in favour of this procedural
  // gameplay authority. Never fetch/decode/upload its permanently hidden
  // 206 MiB presentation merely to hide it again.
  setRustworksProceduralPresentationVisible(authority.root, true);
  setRustworksQualityPresentationActive(selectedArena.id === 'rustworks-1v1', renderProfile);
  qualityAssetStreaming.rustworks = 'ready';
  return null;
}

async function ensureSelectedQualityPresentation(id: ArenaId): Promise<void> {
  if (id === 'atomic-acres') await ensureAtomicQualityPresentation();
  else if (id === 'rustworks-1v1' && renderProfile === 'blender') await ensureRustworksQualityPresentation();
  else if (id === 'gun-range') {
    await loadGunRangeRackPresentation(selectedArenaAuthority('gun-range').root, {
      recordRequest: (url) => arenaVisualStream.recordSelectedAssetRequest('gun-range', url),
    });
  }
  graphicsRefinement.refreshSelectiveBloom(scene);
}

function retireAtomicPresentation(): void {
  const roots = new Set<THREE.Group>();
  if (arenaArtRoot) roots.add(arenaArtRoot);
  if (worldIdentityPresentation) roots.add(worldIdentityPresentation.root);
  if (neighbourhoodLifeRoot) roots.add(neighbourhoodLifeRoot);
  for (const root of roots) disposeArenaPresentationRoot(root);
  arenaArtRoot = null;
  worldIdentityPresentation = null;
  neighbourhoodLifeRoot = null;
  blenderArenaActive = false;
  atomicHouseAuthorityParity = null;
  atomicAuthoredLoadPromise = null;
  atomicQualityLoadPromise = null;
  qualityAssetStreaming.atomicAcres = 'idle';
}

function createWeaponCapacityRegistry(kind: 'mag' | 'reserve'): Record<WeaponId, number> {
  return Object.fromEntries(WEAPON_IDS.map((weapon) => [
    weapon,
    weapon === 'railgun' ? 0 : WEAPONS[weapon][kind],
  ])) as Record<WeaponId, number>;
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
  secondaryWeapon: 'pistol' as SidearmWeaponId,
  selectedGrenade: 'frag' as GrenadeId,
  ammo: createWeaponCapacityRegistry('mag'),
  reserve: createWeaponCapacityRegistry('reserve'),
  reloadState: null as ReloadState | null,
  switchingUntil: 0,
  lastShotAt: 0,
  nextShotAt: 0,
  sustainedShots: 0,
  stance: 'stand' as Stance,
  grenades: 1,
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
const grenadeWorldPresentationPool = new GrenadeWorldPresentationPool(scene);
const smokeVolumes: RuntimeSmokeVolume[] = [];
let smokeAuthority = new SmokeAuthority(interactiveWorldMatchEpoch, 'host');
let lastSmokeStateBroadcastRevision = -1;
let lastSmokeStateBroadcastAt = Number.NEGATIVE_INFINITY;
let flashHostAuthority = new FlashHostAuthority(interactiveWorldMatchEpoch, 'host');
let flashVictimConsumer = new FlashVictimResultConsumer(interactiveWorldMatchEpoch, 'pending-player', 0);
const explosiveBolts: ExplosiveBoltEntity[] = [];
const explosiveBoltStartScratch = new THREE.Vector3();
const explosiveBoltDeltaScratch = new THREE.Vector3();
const explosiveBoltTargetPositionScratch = new THREE.Vector3();
const EXPLOSIVE_BOLT_PRESENTATION_POOL_CAPACITY = 32;
const explosiveBoltShaftGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8);
const explosiveBoltTipGeometry = new THREE.ConeGeometry(0.048, 0.16, 8);
const explosiveBoltShaftMaterial = new THREE.MeshStandardMaterial({ color: 0x29363b, roughness: 0.42, metalness: 0.72 });
const explosiveBoltArmedMaterial = new THREE.MeshBasicMaterial({ color: 0xff8b48, toneMapped: false });
const explosiveBoltPresentationRoot = new THREE.Group();
explosiveBoltPresentationRoot.name = 'explosive-bolt-presentation-pool';
explosiveBoltPresentationRoot.userData.presentationOnly = true;
scene.add(explosiveBoltPresentationRoot);
const explosiveBoltPresentationPool = Array.from(
  { length: EXPLOSIVE_BOLT_PRESENTATION_POOL_CAPACITY },
  (_, index) => {
    const root = createExplosiveBoltMesh();
    root.name = `tac15-explosive-bolt-${index + 1}`;
    explosiveBoltPresentationRoot.add(root);
    return root;
  },
);
let explosiveBoltPresentationPrewarmGeneration = -1;
let flashExposureUntilHostTimeMs = 0;
let flashExposureStrength = 0;
let lastFlashResultAdmission: Readonly<{
  resultId: string;
  intensity: number;
  remainingDurationMs: number;
  reducedSensory: boolean;
  audioGain: number;
}> | null = null;
const lastAuthoredFlashResults = new Map<string, FlashResult>();
const remoteFlashVictimLifeIds = new Map<string, number>();
let lastFlashDispatch: Readonly<{
  targetId: string;
  resultId: string;
  messageValid: boolean;
  delivery: 'local' | 'sent' | 'failed';
}> | null = null;
let localGrenadeActionSequence = 0;
const remoteSupportPresentations: RemoteSupportPresentation[] = [];
let botWeaponCycle: ShuffleBag<WeaponId> | null = null;
let botGrenadeCycle: ShuffleBag<GrenadeId> | null = null;
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
let killstreakMatchEpoch = 0;
let fInteractionPressState: FInteractionPressState = createFInteractionPressState();
let fInteractionPressSequence = 0;
let lastFInteractionTransition: ReturnType<typeof reduceFInteractionPress> | null = null;
let killstreakRuntime = new HostKillstreakRuntime(killstreakMatchEpoch);
let killstreakActivationSequence = 0;
let killstreakControlSequence = 0;
let localCareCaptureState = createCareCaptureClientState();
let killstreakSnapshot: KillstreakRecipientSnapshot = killstreakRuntime.snapshotFor(null, 0);
let lastKillstreakStateBroadcastAt = Number.NEGATIVE_INFINITY;
const LOCAL_KILLSTREAK_SNAPSHOT_REFRESH_INTERVAL_MS = 50;
let lastLocalKillstreakSnapshotRefreshAt = Number.NEGATIVE_INFINITY;
const SUPPORT_ROTOR_AUDIO_REFRESH_INTERVAL_MS = 50;
const SUPPORT_STATUS_HUD_REFRESH_INTERVAL_MS = 100;
let lastSupportRotorAudioRefreshAt = Number.NEGATIVE_INFINITY;
let lastSupportStatusHudRefreshAt = Number.NEGATIVE_INFINITY;
const appliedKillstreakDamageResults = new Set<string>();
const killstreakRegisteredActors = new Set<string>();
let displayedCareReward: Pass65KillstreakId | null = null;
const supportDamageDealtByActivation = new Map<string, number>();
const liveSupportActivationIds = new Set<string>();
const supportDamageFeedbackTelemetry = new SupportDamageFeedbackTelemetry();
let adrenalineHudWasActive = false;
let lastMatchCountdownCue: MatchCountdownCue | null = null;
let matchCountdownCueSequence = 0;
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
const LEADERBOARD_BUILD_ID = 'neighbourhood-overdrive-pass31';
const configuredDiagnosticBuildId = (import.meta.env.VITE_MATCH_BUILD_ID ?? '').trim();
const PASS64_DIAGNOSTIC_BUILD_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(configuredDiagnosticBuildId)
  ? configuredDiagnosticBuildId
  : 'pass65-local-hitl-candidate';
const PASS65_DIAGNOSTIC_SOURCE_ID = 'pass65-automatic-post-match';
const localMultiplayerQa = new URLSearchParams(window.location.search).get('multiplayerQa') === '1'
  && (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost');
const localArenaSwitchQaDelayMs = localMultiplayerQa
  ? Math.min(1_000, Math.max(0, Number(new URLSearchParams(window.location.search).get('arenaSwitchQaDelayMs')) || 0))
  : 0;
const matchDiagnosticUploader = new MatchDiagnosticUploader(
  MATCH_DIAGNOSTICS_ENDPOINT,
  clientPersistentStorage(),
  window.fetch.bind(window),
  navigator.sendBeacon?.bind(navigator),
);
void matchDiagnosticUploader.flushPending();
window.addEventListener('online', () => { void matchDiagnosticUploader.flushPending(); });
const externalLeaderboardNetworkEnabled = leaderboardNetworkEnabled(window.location.search);
let globalLeaderboardState: 'pending' | 'live' | 'cached' | 'saved' = GLOBAL_LEADERBOARD_ENDPOINT && externalLeaderboardNetworkEnabled ? 'pending' : 'cached';
const highScoreChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('atomic-acres:high-scores:v2') : null;
let scoutSweepUntil = 0;
let yardhawk: YardhawkEntity | null = null;
const strikeMissiles: StrikeMissileEntity[] = [];
const hunterDrones: HunterDroneEntity[] = [];
let supportPresentationRetirements = 0;
let nukeSequence: NukeSequence | null = null;
let triPassTargeting: TriPassTargeting | null = null;
type PointSupportTargeting = Readonly<{ id: 'care-package' | 'carpet-bomber' }>;
let pointSupportTargeting: PointSupportTargeting | null = null;
let tacticalMapOpen = false;
let lastStrikeMapDrawAt = Number.NEGATIVE_INFINITY;
let crosshairPreviewMarker: THREE.Group | null = null;
let crosshairPreviewLastPoint: THREE.Vector3 | null = null;
const crosshairSupportRaycaster = new THREE.Raycaster();
const crosshairSupportScreenCenter = new THREE.Vector2(0, 0);
const crosshairSupportFloorPoint = new THREE.Vector3();
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
let remoteStickyAttachmentAuthority = createRemoteStickyAttachmentAuthorityState();
const pendingStickyHits = new Map<number, Readonly<{ message: HitMessage; queuedAtMs: number; source: StickyAttachmentSource; ownerLifeId: number }>>();
const pendingStickyWindowBreaks = new Map<number, Readonly<{ message: WindowBreakMessage; queuedAtMs: number; ownerLifeId: number }>>();
const stickyTimingReplayNonces = new Set<number>();
const PENDING_STICKY_HIT_LIMIT = 64;
const PENDING_STICKY_HIT_LIFETIME_MS = 1_500;
const STICKY_AUTHORITY_POST_DETONATION_LIFETIME_MS = 3_000;
const hostTriggerAuthorities = new HostTriggerAuthorityRegistry();
const authorizedRemoteRedeploys = new Map<string, {
  primary: PrimaryWeaponId;
  secondary: SidearmWeaponId;
  grenade: GrenadeId;
  expiresAt: number;
  nonce: number;
}>();
const peerTimingStates = new Map<string, PeerTimingState>();
const incomingCombatRewindMs = new Map<number, number>();
const localPositionHistory: CombatantPoseSample[] = [];
let localCombatEventSeq = 0;
let localContinuity = 1;
let localSnapshotRateState: SnapshotRateState = createSnapshotRateState(performance.now());
let interpolationDelayState: InterpolationDelayState = createInterpolationDelayState(performance.now());
let lastObservedInterpolationUnderruns = 0;
let receiverSequenceGaps = 0;
let receiverReordered = 0;
let outboundFeedbackSequenceGaps = 0;
let outboundFeedbackReordered = 0;
let outboundFeedbackPressure = 0;
let localShotSeq = 0;
const localWeaponSequences = new Map<WeaponId, number>();
let localConnectionEpoch: string = crypto.randomUUID();
const resolvedShotRequests = new Map<string, ShotResultMessage>();
const resolvedRailgunShots = new Map<string, RailgunShotResultMessage>();
const processedRailgunShotResults = new Set<string>();
let lastAuthoritativeRailgunResult: RailgunShotResultMessage | null = null;
const railgunQaHeldDeadBots = new Set<string>();
let railgunLocalFeedbackPresentations = 0;
let lastRailgunLocalFeedbackSummary: string | null = null;
let railgunDeathPresentationCount = 0;
const railgunDeathPresentations: Array<{
  killerId: string;
  victimId: string;
  text: string;
}> = [];
let railgunState: RailgunAuthorityState = createRailgunAuthorityState('disabled', 0, 0, 0);
let localRailgunPendingUntilHostTimeMs = 0;
let lastRailgunStateBroadcastAt = -Infinity;
let railgunAdsResetRequired = false;
let railgunRechamberPresentationActive = false;
const RAILGUN_PICKUP_RANGE = 2.65;
const createRailgunClaimAudit = () => ({
  received: 0,
  accepted: 0,
  rejected: 0,
  lastReason: null as string | null,
  lastGeneration: null as number | null,
  lastAuthoritativeToReportedMeters: null as number | null,
  lastAuthoritativeToPickupMeters: null as number | null,
});
let railgunClaimAudit = createRailgunClaimAudit();
const presentedShotResults = new Set<string>();
const processedShotResults = new Set<string>();
const shotProtocolTelemetry: Record<string, number> = {};
const shotTimingTelemetry = new ShotTimingTelemetry();
let lastAuthoredShotTimeline: AuthoredShotTimeline | null = null;
let lastResolvedShotTimeline: Readonly<{
  fireTimeMs: number;
  targetViewTimeMs: number;
  receivedHostTimeMs: number;
  resolvedAtHostTimeMs: number;
  appliedRewindMs: number;
}> | null = null;
type ShotResolutionTrace = Readonly<{
  shotSeq: number;
  weaponSequence: number;
  lifeId: number;
  fireTimeMs: number;
  targetViewTimeMs: number;
  receivedHostTimeMs: number;
  resolvedAtHostTimeMs: number;
  appliedRewindMs: number;
  shooterHistoryFirstMs: number | null;
  shooterHistoryLatestMs: number | null;
  outcome: string;
}>;
const recentShotResolutionTraces: ShotResolutionTrace[] = [];
function recordShotResolutionTrace(trace: ShotResolutionTrace): void {
  recentShotResolutionTraces.push(trace);
  while (recentShotResolutionTraces.length > 16) recentShotResolutionTraces.shift();
}
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
const deathDrops: DeathDropEntity[] = [];
const authorizedRemotePickups = new Map<string, { weapon: PrimaryWeaponId; expiresAt: number }>();
const verifiedRemoteKills = new Map<string, number>();
const weaponActionHistory: string[] = [];
let gameStarted = false;
let matchStartPreparing = false;
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
const hostLobbyConnectionEpochs = new Map<string, string>();
const hostDisconnectedAt = new Map<string, number>();
const authoritativeScores = new Map<string, PlayerScore>();
let textChatHistory: ChatEntry[] = [];
let localChatRateState: ChatRateState = [];
const hostChatRateStates = new Map<string, ChatRateState>();
const hostChatNonces = new Map<string, number[]>();
let textChatOpen = false;
let textChatNotice: string | null = null;
let textChatHintTimer: ReturnType<typeof setTimeout> | null = null;
let textChatFadeTimer: ReturnType<typeof setTimeout> | null = null;
let textChatLastActivityAtMs: number | null = null;
let textChatWasAvailable = false;

function memberDhv(id: string): Dhv {
  return privateLobbySnapshot?.members.find((member) => member.id === id)?.dhv
    ?? hostLobbyMembers.get(id)?.dhv
    ?? (id === player.id ? localDhv : 10);
}

function handicapSidearm(_primary: PrimaryWeaponId, dhv = localDhv): WeaponId {
  return dhv === 'X' ? 'magnum' : player.secondaryWeapon;
}

function handicapLoadout(primary: PrimaryWeaponId, dhv = localDhv): readonly [PrimaryWeaponId, WeaponId] {
  return [primary, handicapSidearm(primary, dhv)];
}

function handicapOutgoingDamage(attackerId: string, damage: number, weapon?: WeaponId): number {
  const dhv = memberDhv(attackerId);
  return applyDhvWeaponOutgoingDamage(damage, dhv, weapon === 'magnum');
}
let triggerHeld = false;
let localTriggerActionSequence = 0;
let transmittedTriggerHeld = false;
let transmittedTriggerWeapon: WeaponId | null = null;
let spinUpWeapon: WeaponId | null = null;
let spinUpStartedAtPerformanceMs: number | null = null;
let spinUpStartedAtHostTimeMs: number | null = null;
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
const recentFrameWorkMs: number[] = [];
const FRAME_WORK_SAMPLE_LIMIT = 240;
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
const footstepEmitters = new FootstepEmitterRegistry();
const audioOcclusionBudget = new AudioOcclusionBudget();
let directionalDamageState: DirectionalDamageState = createDirectionalDamageState();
let lowHealthFeedbackState: LowHealthFeedbackState = createLowHealthFeedbackState();
let lastSensoryPresentationAt = -Infinity;

function isFootstepOccluded(source: Readonly<{ x: number; y: number; z: number }>): boolean {
  if (!audioOcclusionBudget.admit(frameCount)) return false;
  const origin = { x: player.position.x, y: player.position.y, z: player.position.z };
  const target = { x: source.x, y: source.y + 1.1, z: source.z };
  return activeWorldColliders().some((box) => segmentIntersectsBox(origin, target, box));
}
let lastFrame = performance.now();
let lastPresentedFrameAt = lastFrame;
let lastWindowBlurAt = -Infinity;
const framePacing = new FramePacingSampler();
const LIVE_WEBGPU_PRESENTATION_STALL_MS = 1_000;
let lastObservedWebGpuCompletionSequence = 0;

function resetWebGpuPresentationEpoch(reason: string, now: number): void {
  renderRuntime.resetPresentationProgressTelemetry(reason, now);
  if (renderRuntime.backend !== 'webgpu') return;
  // A completion which retired during a hidden/pre-admission epoch is not live
  // foreground performance evidence. Consume its sequence and discard any
  // queued resize so refocus cannot apply a stale downshift to HDR targets.
  lastObservedWebGpuCompletionSequence = renderRuntime.presentationTelemetry(now).completedSequence;
  deferredWebGpuAdaptivePixelRatio.clear();
}
let lastHudAt = 0;
let lastFpsHudAt = -Infinity;
let minimapRenderCount = 0;
const MINIMAP_RENDER_HZ = 60;
let lastMinimapRenderAt = Number.NEGATIVE_INFINITY;
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
let renderSubmissionPaused = false;
let matchAdmissionPresentationPaused = false;
let arenaTransitionGeneration = 0;
let arenaTransitionPhase: 'idle' | 'fencing' | 'preparing' | 'committing' | 'rolling-back' | 'failed' = 'idle';
let arenaTransitionStartedAt: number | null = null;
let arenaTransitionCompletedAt: number | null = null;
let arenaTransitionFailure: string | null = null;
const arenaTransitionProfiler = new ArenaTransitionProfiler();

function profileArenaTransition(phase: ArenaTransitionProfilePhase): void {
  arenaTransitionProfiler.enter(phase, performance.now());
}
let lastArenaRenderAuditAt = -Infinity;
const ARENA_RENDER_AUDIT_INTERVAL_MS = 250;
let debugShadowProbe: THREE.Mesh | null = null;
const debugCaptureCameraPosition = new THREE.Vector3();
let debugCaptureCameraYaw = 0;
let debugCaptureCameraPitch = 0;
let debugCaptureCameraActive = false;
let debugCaptureCameraFov: number | null = null;
let debugCaptureFixedVisualTimeMs: number | null = null;
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
  matchDiagnosticUploader.beginMatch();
  matchDiagnostics = new MatchDiagnostics({
    buildId: PASS64_DIAGNOSTIC_BUILD_ID,
    sourceId: PASS65_DIAGNOSTIC_SOURCE_ID,
    sessionId: `${player.id}:${Date.now()}:${crypto.randomUUID()}`,
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

function recordHealthRegeneration(actorId: string, healthBefore: number, healthAfter: number, reason: string): void {
  if (healthAfter <= healthBefore) return;
  recordMatchDiagnostic('health-regen', 'accepted', {
    actorId,
    actorKind: 'player',
    healthBefore,
    healthAfter,
    reason,
  });
}

function recordAuthoritativeRemoteRegeneration(
  targetId: string,
  result: AuthoritativeRemoteDamageResult,
  reason: string,
): void {
  recordHealthRegeneration(targetId, result.healthBeforeAdvance, result.healthBefore, reason);
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
let sniperScopeActive = false;
let dmrThermalActive = false;
let mouseTriggerHeld = false;
let mouseAdsHeld = false;
let gamepadMove = { x: 0, y: 0 };
let gamepadLookRate = { yaw: 0, pitch: 0 };
let gamepadDroneVertical = 0;
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

killstreakMenuBinding = bindKillstreakLoadoutMenu(document, killstreakLoadoutController, () => {
  const selected = killstreakLoadoutController.selected;
  gamepadSupportSelection = selected.slots[0];
  syncFieldSupportRows(selected);
  updateFieldSupportHud();
});
gamepadSupportSelection = killstreakLoadoutController.selected.slots[0];
syncFieldSupportRows(killstreakLoadoutController.selected);

function gameplayInputEnabled(): boolean {
  return gameStarted && player.alive && matchState.phase === 'active' && menu.classList.contains('hidden') && !isTextChatTyping();
}

function playerSimulationEnabled(): boolean {
  return gameStarted && player.alive && matchState.phase !== 'ended' && menu.classList.contains('hidden')
    && !localKillstreakActorSnapshot()?.possession;
}

function resetLocalSpinUp(): void {
  spinUpWeapon = null;
  spinUpStartedAtPerformanceMs = null;
  spinUpStartedAtHostTimeMs = null;
}

function sendLocalTriggerEdge(pressed: boolean, weapon: WeaponId): void {
  if (network.role !== 'client') return;
  const message: TriggerStateMessage = {
    type: 'trigger-state',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id,
    connectionEpoch: localConnectionEpoch,
    lifeId: localContinuity,
    actionSequence: localTriggerActionSequence,
    weapon,
    pressed,
    nonce: randomNonce(),
  };
  localTriggerActionSequence += 1;
  network.send(message);
}

function syncLocalTriggerAuthority(held: boolean): void {
  if (network.role !== 'client') {
    transmittedTriggerHeld = false;
    transmittedTriggerWeapon = null;
    return;
  }
  const weaponChanged = transmittedTriggerHeld && transmittedTriggerWeapon !== player.weapon;
  if (transmittedTriggerHeld && (!held || weaponChanged) && transmittedTriggerWeapon) {
    sendLocalTriggerEdge(false, transmittedTriggerWeapon);
    transmittedTriggerHeld = false;
    transmittedTriggerWeapon = null;
  }
  if (!held || !gameStarted || !player.alive || matchState.phase !== 'active') return;
  if (!transmittedTriggerHeld) {
    // The reliable state commit and following edge share the ordered event lane,
    // so the host admits the current weapon/life before starting its hold clock.
    network.sendStateCommitReliably(createStateMessage());
    sendLocalTriggerEdge(true, player.weapon);
    transmittedTriggerHeld = true;
    transmittedTriggerWeapon = player.weapon;
  }
}

function setLocalTriggerHeld(held: boolean): void {
  triggerHeld = held;
  syncLocalTriggerAuthority(held);
  if (!held) resetLocalSpinUp();
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
  cancelFInteractionPress('manual-reset');
  releaseCareCapture();
  interruptReload(false);
  keys.clear();
  gamepadMove = { x: 0, y: 0 };
  gamepadLookRate = { yaw: 0, pitch: 0 };
  gamepadDroneVertical = 0;
  gamepadSprint = false;
  mouseTriggerHeld = false;
  mouseAdsHeld = false;
  setLocalTriggerHeld(false);
  adsHeld = false;
  sniperScopeActive = false;
  dmrThermalActive = false;
  sniperScopeOverlay.hidden = true;
  hudRoot.classList.remove('sniper-scope-active');
  dmrThermalPresentation.update(camera, [], false);
  hudRoot.classList.remove('dmr-thermal-active');
  audio.minigunDrive(0, 'idle', false);
  currentSprinting = false;
  jumpQueuedAt = -10_000;
  player.velocity.x = 0;
  player.velocity.z = 0;
}

function setStatus(text: string, kind: 'ok' | 'warn' | 'error' = 'ok'): void {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
  if (menuLifecycle.surface === 'deploying') {
    deploymentTransitionStatus.textContent = text;
    deploymentTransition.dataset.statusKind = kind;
  }
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
  element<HTMLElement>('#high-score-title').textContent = 'NUKE TOWN LEADERBOARD';
  element<HTMLElement>('#high-score-footnote').textContent = pass65Settings.privacy.shareGlobalLeaderboard
    ? 'Global result sharing is enabled · local cache remains available offline.'
    : 'Public records are readable · sharing your results is off by default in Options.';
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
  if (!GLOBAL_LEADERBOARD_ENDPOINT || !externalLeaderboardNetworkEnabled) {
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
  const fieldSupport = localFieldSupportProjection();
  const existing = personalBest(highScores, player.name);
  if (existing && existing.bestStreak >= fieldSupport.streak) return;
  const entry = immediateStreakEntry(
    player.name,
    fieldSupport.streak,
    player.kills,
    player.deaths,
  );
  if (!entry) return;
  persistMergedHighScores([entry]);
  if (network.role !== 'offline') network.send({ type: 'high-score', by: player.id, season: LEADERBOARD_SEASON, entry });
  if (!syncGlobal || !externalLeaderboardNetworkEnabled || !pass65Settings.privacy.shareGlobalLeaderboard) return;
  const leaderboardInstallation = leaderboardInstallId(localStorage, true);
  if (!leaderboardInstallation) return;
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
  }, pass65Settings.privacy.shareGlobalLeaderboard).then((accepted) => {
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
  bootstrapStage = 'failed';
  bootstrapError = message;
  gameStarted = false;
  clearGameplayInput();
  setLocalTriggerHeld(false);
  setStatus(`Game paused: ${message}`, 'error');
  applyMenuLifecycle({ type: 'fatal-error' });
  const banner = element<HTMLElement>('#banner');
  banner.innerHTML = '<strong>SYSTEM PAUSED</strong><span>Reload the page to re-enter the test block.</span>';
  banner.hidden = false;
  console.error('[Nuke Town fatal]', error);
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

function textChatAvailable(): boolean {
  return network.role !== 'offline' && privateLobbySnapshot !== null;
}

function isTextChatTyping(): boolean {
  return textChatOpen;
}

function renderTextChat(): void {
  const available = textChatAvailable();
  const now = performance.now();
  if (available && !textChatWasAvailable) textChatLastActivityAtMs = now;
  textChatWasAvailable = available;
  const presentation = roomChatPresentation(now, available, textChatOpen, textChatLastActivityAtMs);
  textChatRoot.hidden = !available;
  textChatRoot.dataset.open = textChatOpen ? 'true' : 'false';
  textChatRoot.dataset.visible = presentation.visible ? 'true' : 'false';
  textChatRoot.dataset.context = gameStarted ? 'game' : 'lobby';
  textChatHint.textContent = textChatNotice ?? (textChatOpen ? 'ENTER SEND / ESC CANCEL' : 'ENTER TO CHAT');
  if (textChatFadeTimer) clearTimeout(textChatFadeTimer);
  textChatFadeTimer = presentation.fadeAfterMs === null ? null : setTimeout(() => {
    textChatFadeTimer = null;
    renderTextChat();
  }, presentation.fadeAfterMs);
  if (!available) return;

  textChatLog.replaceChildren();
  if (textChatHistory.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'text-chat-empty';
    empty.textContent = 'No messages yet.';
    textChatLog.append(empty);
  } else {
    for (const entry of textChatHistory) {
      const row = document.createElement('p');
      row.className = entry.senderId === player.id ? 'text-chat-own' : '';
      const sender = document.createElement('strong');
      const message = document.createElement('span');
      sender.textContent = entry.senderName;
      message.textContent = entry.text;
      row.append(sender, message);
      textChatLog.append(row);
    }
  }
  textChatLog.scrollTop = textChatLog.scrollHeight;
}

function markTextChatActivity(): void {
  textChatLastActivityAtMs = performance.now();
  renderTextChat();
}

function showTextChatNotice(message: string, durationMs = 1_800): void {
  if (textChatHintTimer) clearTimeout(textChatHintTimer);
  textChatNotice = message;
  markTextChatActivity();
  textChatHintTimer = setTimeout(() => {
    textChatHintTimer = null;
    textChatNotice = null;
    renderTextChat();
  }, durationMs);
}

function openTextChat(): void {
  if (!textChatAvailable() || textChatOpen) return;
  clearGameplayInput();
  element<HTMLElement>('#roster').hidden = true;
  textChatOpen = true;
  markTextChatActivity();
  if (document.pointerLockElement === canvas) void document.exitPointerLock();
  textChatInput.focus({ preventScroll: true });
}

function closeTextChat(resumeControls: boolean): void {
  if (!textChatOpen) return;
  textChatOpen = false;
  textChatInput.value = '';
  textChatInput.blur();
  markTextChatActivity();
  if (resumeControls && gameStarted && player.alive && !matchFinished && menu.classList.contains('hidden')) {
    requestGamePointerLock('chat-close');
  }
}

function resetTextChat(): void {
  if (textChatHintTimer) clearTimeout(textChatHintTimer);
  if (textChatFadeTimer) clearTimeout(textChatFadeTimer);
  textChatHintTimer = null;
  textChatFadeTimer = null;
  textChatNotice = null;
  textChatOpen = false;
  textChatLastActivityAtMs = null;
  textChatWasAvailable = false;
  textChatInput.value = '';
  textChatInput.blur();
  textChatHistory = [];
  localChatRateState = [];
  hostChatRateStates.clear();
  hostChatNonces.clear();
  renderTextChat();
}

function acceptChatEntry(entry: ChatEntry): void {
  textChatHistory = appendChatHistory(textChatHistory, entry);
  markTextChatActivity();
}

function sendTextChatHistory(playerId: string): void {
  if (network.role !== 'host') return;
  const message: ChatHistoryMessage = {
    type: 'chat-history',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id,
    forPlayerId: playerId,
    entries: [...textChatHistory],
    nonce: randomNonce(),
  };
  network.sendToPlayer(playerId, message);
}

function admitHostChatSubmit(message: ChatSubmitMessage): void {
  if (network.role !== 'host') return;
  const member = hostLobbyMembers.get(message.by);
  if (!member?.connected) return;
  const recentNonces = hostChatNonces.get(message.by) ?? [];
  if (recentNonces.includes(message.nonce)) return;

  const now = performance.now();
  const rate = admitChatRate(hostChatRateStates.get(message.by) ?? [], now);
  hostChatRateStates.set(message.by, rate.state);
  if (!rate.accepted) {
    if (message.by === player.id) showTextChatNotice('SLOW DOWN');
    return;
  }
  hostChatNonces.set(message.by, [...recentNonces, message.nonce].slice(-64));

  let id = randomNonce();
  while (textChatHistory.some((entry) => entry.id === id)) id += 1;
  const entry: ChatEntry = {
    id,
    senderId: member.id,
    senderName: normalizeChatSenderName(member.name),
    text: message.text,
    sentAtHostTimeMs: now,
  };
  acceptChatEntry(entry);
  const accepted: ChatMessage = {
    type: 'chat-message',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id,
    entry,
    nonce: id,
  };
  network.send(accepted);
}

function submitTextChat(): void {
  const text = normalizeChatText(textChatInput.value);
  if (!text) {
    closeTextChat(true);
    return;
  }
  const rate = admitChatRate(localChatRateState, performance.now());
  localChatRateState = rate.state;
  if (!rate.accepted) {
    showTextChatNotice('SLOW DOWN');
    textChatInput.select();
    return;
  }
  const message: ChatSubmitMessage = {
    type: 'chat-submit',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id,
    text,
    nonce: randomNonce(),
  };
  if (network.role === 'host') admitHostChatSubmit(message);
  else if (network.role === 'client') network.send(message);
  closeTextChat(true);
}

function acceptHostChatMessage(message: ChatMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId) return;
  acceptChatEntry(message.entry);
}

function acceptHostChatHistory(message: ChatHistoryMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId || message.forPlayerId !== player.id) return;
  textChatHistory = normalizeChatHistory(message.entries);
  markTextChatActivity();
}

function randomLobbyCredential(): string {
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  return `room_${Date.now().toString(36)}_${Math.floor(protocolRandom() * Number.MAX_SAFE_INTEGER).toString(36)}`;
}

const roomIdentityTabId = randomLobbyCredential();
let activeRoomIdentityCode = '';

function saveActiveRoomIdentity(roomCode: string): void {
  saveRoomRejoinIdentity(
    roomCode,
    { playerId: player.id, token: localResumeToken },
    sessionStorage,
    localStorage,
    REJOIN_GRACE_MS,
    Date.now(),
    roomIdentityTabId,
  );
  activeRoomIdentityCode = roomCode;
}

function restoreRoomIdentity(roomCode: string): void {
  let restored: ReturnType<typeof loadRoomRejoinIdentity> = null;
  try {
    restored = loadRoomRejoinIdentity(roomCode, sessionStorage, localStorage, Date.now(), roomIdentityTabId);
  } catch { /* Hardened storage falls back to a fresh identity. */ }
  if (restored) {
    player.id = restored.playerId;
    localResumeToken = restored.token;
    try { saveActiveRoomIdentity(roomCode); } catch { /* The in-memory credential remains valid. */ }
    return;
  }
  localResumeToken = randomLobbyCredential();
  try {
    saveActiveRoomIdentity(roomCode);
  } catch { /* Rejoin remains available only while this page stays open. */ }
}

function persistRoomIdentityForCloseTabRejoin(): void {
  if (network.role !== 'client' || !network.roomCode || !localResumeToken) return;
  try {
    saveActiveRoomIdentity(network.roomCode);
    releaseRoomRejoinIdentityLease(network.roomCode, localStorage, roomIdentityTabId);
  } catch { /* Browser storage policy can make close-tab recovery unavailable. */ }
}

function hidePrivateLobbyPresentation(): void {
  menu.classList.remove('private-lobby-active');
  element<HTMLElement>('#private-lobby').hidden = true;
}

function resetPrivateLobbyState(): void {
  if (activeRoomIdentityCode) {
    try { releaseRoomRejoinIdentityLease(activeRoomIdentityCode, localStorage, roomIdentityTabId); } catch { /* Lease expires if storage is unavailable. */ }
    activeRoomIdentityCode = '';
  }
  if (lobbyClockTimer) clearTimeout(lobbyClockTimer);
  lobbyClockTimer = null;
  privateLobbySnapshot = null;
  privateLobbyRevision = 0;
  privateMatchActiveAtHostTimeMs = null;
  privateMatchActiveAtEpochMs = null;
  privateMatchMode = 'tdm';
  privateMatchConfig = DEFAULT_PRIVATE_MATCH_CONFIG;
  hostTimeMapping = createHostTimeMapping();
  interpolationDelayState = createInterpolationDelayState(performance.now());
  lastObservedInterpolationUnderruns = 0;
  localCombatEventSeq = 0;
  peerTimingStates.clear();
  localLobbyPingMs = null;
  localLobbyReady = false;
  localDhv = 10;
  localResumeToken = '';
  localConnectionEpoch = randomLobbyCredential();
  localTriggerActionSequence = 0;
  transmittedTriggerHeld = false;
  transmittedTriggerWeapon = null;
  hostTriggerAuthorities.clear('match-reset');
  lobbyArenaSyncPromise = Promise.resolve();
  hostLobbyMembers.clear();
  hostLobbyTokens.clear();
  hostLobbyConnectionEpochs.clear();
  hostDisconnectedAt.clear();
  authoritativeScores.clear();
  resetTextChat();
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
  renderTextChat();
}

function initializeHostLobby(): void {
  privateMatchConfig = selectedArena.id === 'gun-range'
    ? { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: 'gun-range', mode: 'ffa', hostedBotCount: 0, autoBalance: false, durationMs: selectedArena.matchRules.durationMs ?? 120_000 }
    : { ...DEFAULT_PRIVATE_MATCH_CONFIG, arenaId: selectedArena.id };
  privateMatchMode = privateMatchConfig.mode;
  localResumeToken = randomLobbyCredential();
  hostLobbyTokens.set(player.id, localResumeToken);
  hostLobbyConnectionEpochs.set(player.id, localConnectionEpoch);
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
  localConnectionEpoch = randomLobbyCredential();
  localTriggerActionSequence = 0;
  transmittedTriggerHeld = false;
  transmittedTriggerWeapon = null;
  const message: LobbyJoinMessage = {
    type: 'lobby-join',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    playerId: player.id,
    connectionEpoch: localConnectionEpoch,
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
  const joiningNewMember = existing === undefined;
  const currentPhase = privateLobbySnapshot?.phase ?? 'waiting';
  if (existing) {
    if (hostLobbyTokens.get(message.playerId) !== message.resumeToken) {
      rejectLobbyPlayer(message.playerId, 'rejoin-denied');
      return;
    }
    hostDisconnectedAt.delete(message.playerId);
    const priorConnectionEpoch = hostLobbyConnectionEpochs.get(message.playerId);
    hostLobbyConnectionEpochs.set(message.playerId, message.connectionEpoch);
    if (priorConnectionEpoch !== message.connectionEpoch) {
      authoritativeShotAdmissions.delete(message.playerId);
      hostTriggerAuthorities.reset(message.playerId, 'connection-epoch');
    }
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
    hostLobbyConnectionEpochs.set(message.playerId, message.connectionEpoch);
    authoritativeShotAdmissions.delete(message.playerId);
    hostTriggerAuthorities.reset(message.playerId, 'connection-epoch');
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
  // Reconnecting an existing identity does not change lobby composition or
  // teams, so it must not clear everybody else's readiness.
  if (joiningNewMember && currentPhase === 'waiting' && privateMatchConfig.autoBalance) {
    for (const member of balanceLobbyTeams([...hostLobbyMembers.values()])) hostLobbyMembers.set(member.id, { ...member, ready: false });
  }
  broadcastHostLobby(currentPhase);
  sendTextChatHistory(message.playerId);
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
  if (!member.connected && hostDisconnectedAt.has(playerId)) return;
  hostLobbyMembers.set(playerId, { ...member, connected: false, ready: false, pingMs: null });
  hostDisconnectedAt.set(playerId, performance.now());
  const reservationMatchEpoch = killstreakMatchEpoch;
  broadcastHostLobby(privateLobbySnapshot?.phase ?? 'waiting');
  window.setTimeout(() => {
    const disconnectedAt = hostDisconnectedAt.get(playerId);
    const current = hostLobbyMembers.get(playerId);
    if (!disconnectedAt || !current || current.connected || !rejoinReservationExpired(disconnectedAt, performance.now())) return;
    hostDisconnectedAt.delete(playerId);
    hostLobbyMembers.delete(playerId);
    hostLobbyTokens.delete(playerId);
    network.forgetPlayerRejoinCredential(playerId);
    hostLobbyConnectionEpochs.delete(playerId);
    authoritativeShotAdmissions.delete(playerId);
    authoritativeScores.delete(playerId);
    hostChatRateStates.delete(playerId);
    hostChatNonces.delete(playerId);
    remoteSupportAuthorities.delete(playerId);
    remoteGrenadeAuthorities.delete(playerId);
    remoteHealthAuthorities.delete(playerId);
    remoteFlashVictimLifeIds.delete(playerId);
    lastAuthoredFlashResults.delete(playerId);
    if (network.role === 'host' && killstreakMatchEpoch === reservationMatchEpoch
      && killstreakRegisteredActors.has(playerId)) {
      killstreakRuntime.unregisterActor(playerId);
      killstreakRegisteredActors.delete(playerId);
      refreshLocalKillstreakSnapshot();
      broadcastKillstreakState();
    }
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
  if (network.role !== 'host' || damage <= 0) return;
  if (killstreakRuntime.recordActorDamage(victimId)) broadcastKillstreakState();
  if (attackerId === victimId) return;
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
  await startGame(mode, false, activeAtLocalMonoMs);
}

function hostStartPrivateMatch(): void {
  if (network.role !== 'host') return;
  const candidate = hostSnapshot('waiting');
  if (!canHostCommitStart(candidate)) {
    setStatus('Every connected guest must be ready before the host starts.', 'warn');
    return;
  }
  const hostMember = hostLobbyMembers.get(player.id);
  if (!hostMember?.connected) return;
  if (!hostMember.ready) {
    hostLobbyMembers.set(player.id, { ...hostMember, ready: true });
  }
  const current = hostSnapshot('waiting');
  if (!canHostStart(current)) {
    setStatus('Every connected guest must be ready before the host starts.', 'warn');
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
  weaponView.setPresentationVisible(false);
  hudRoot.hidden = true;
  element<HTMLElement>('#banner').hidden = true;
  element<HTMLElement>('#countdown').hidden = true;
  applyMenuLifecycle({ type: 'return-pre-match' });
  setArenaMenuCamera();
  if (document.pointerLockElement) void document.exitPointerLock();
  // Both clocks form one lobby-start identity. Leaving either populated makes
  // the waiting snapshot invalid and prevents peers from readying a rematch.
  privateMatchActiveAtHostTimeMs = null;
  privateMatchActiveAtEpochMs = null;
  if (asHost && network.role === 'host') {
    authoritativeScores.clear();
    for (const member of hostLobbyMembers.values()) {
      hostLobbyMembers.set(member.id, { ...member, ready: false });
      authoritativeScores.set(member.id, emptyPlayerScore(member.id));
    }
    broadcastHostLobby('waiting');
  }
  renderPrivateLobby();
  renderTextChat();
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
  renderTextChat();
  if (message.snapshot.activeAtHostTimeMs !== null && message.snapshot.activeAtEpochMs !== null
    && message.snapshot.phase !== 'waiting' && !gameStarted) {
    void beginPrivateMatch('client', message.snapshot.activeAtHostTimeMs, message.snapshot.activeAtEpochMs, message.snapshot.snapshotHostTimeMs);
  }
}

function authorizeRedeploy(message: RedeployCommitMessage, now = performance.now()): void {
  authorizedRemoteRedeploys.set(message.target, {
    primary: message.primary,
    secondary: message.secondary,
    grenade: message.grenade,
    expiresAt: now + 5_000,
    nonce: message.nonce,
  });
}

function acceptRedeployCommit(message: RedeployCommitMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId || processedNonces.has(message.nonce)) return;
  processedNonces.add(message.nonce);
  authorizeRedeploy(message);
  if (message.target === player.id) {
    applyLocalClassRedeploy({ primary: message.primary, secondary: message.secondary, grenade: message.grenade }, true);
    authorizedRemoteRedeploys.delete(player.id);
  }
  trimNonceSet();
}

function handleLobbyMessage(message: GameMessage): boolean {
  if (message.type === 'chat-submit') {
    admitHostChatSubmit(message);
    return true;
  }
  if (message.type === 'chat-message') {
    acceptHostChatMessage(message);
    return true;
  }
  if (message.type === 'chat-history') {
    acceptHostChatHistory(message);
    return true;
  }
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
  if (message.type === 'redeploy-request') {
    if (network.role === 'host' && gameStarted && matchState.phase === 'active' && !processedNonces.has(message.nonce)) {
      const member = hostLobbyMembers.get(message.by);
      const remote = remotes.get(message.by);
      const health = remoteHealthAuthorities.get(message.by);
      if (member && remote && health?.alive) {
        const now = performance.now();
        const result = applyAuthoritativeRemoteRedeploy(health, now);
        if (result.applied) {
          dropHeldRailgun(message.by, remote.target.clone().add(new THREE.Vector3(0, 0.3, 0)));
          processedNonces.add(message.nonce);
          remoteHealthAuthorities.set(message.by, result.state);
          const commit: RedeployCommitMessage = {
            type: 'redeploy-commit', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
            by: player.id, target: message.by, primary: message.primary,
            secondary: message.secondary, grenade: message.grenade,
            hostTimeMs: now, nonce: randomNonce(),
          };
          authorizeRedeploy(commit, now);
          network.send(commit);
          recordMatchDiagnostic('field-kit-redeploy', 'accepted', {
            actorId: message.by,
            reason: 'host-authoritative-noncombat-redeploy',
            modifiers: [`primary:${message.primary}`, `secondary:${message.secondary}`, `grenade:${message.grenade}`],
          });
          trimNonceSet();
        }
      }
    }
    return true;
  }
  if (message.type === 'redeploy-commit') {
    acceptRedeployCommit(message);
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
    resetTextChat();
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
    removeRemote(message.playerId, message.voluntary ? 'left the lobby' : 'disconnected', !message.voluntary);
    if (network.role === 'host') {
      if (message.voluntary) {
        hostLobbyMembers.delete(message.playerId);
        hostLobbyTokens.delete(message.playerId);
        network.forgetPlayerRejoinCredential(message.playerId);
        hostLobbyConnectionEpochs.delete(message.playerId);
        authoritativeShotAdmissions.delete(message.playerId);
        hostDisconnectedAt.delete(message.playerId);
        authoritativeScores.delete(message.playerId);
        hostChatRateStates.delete(message.playerId);
        hostChatNonces.delete(message.playerId);
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
  start.disabled = network.role !== 'host' || !snapshot || !lobbyArenaSynchronized || !canHostCommitStart(snapshot);
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

const streamedWeaponGpuPrewarmQueue = new AsyncSerialQueue();
const runStreamedWeaponCatalogGpuPrewarm: WeaponViewmodelCatalogGpuPrewarmer = async (entries) => {
      if (entries.length === 0) return;
      const priorStates = entries.map(({ weaponId, model }) => Object.freeze({
        weaponId,
        model,
        parent: model.parent,
        visible: model.visible,
        scale: model.scale.clone(),
      }));
      const ancestorVisibility = new Map<THREE.Object3D, boolean>();
      const restoreParent = (state: typeof priorStates[number]): void => {
        if (state.parent && state.model.parent !== state.parent) state.parent.add(state.model);
        else if (!state.parent && state.model.parent) state.model.removeFromParent();
      };
      const revealAncestors = (model: THREE.Object3D): void => {
        let ancestor = model.parent;
        while (ancestor && ancestor !== scene) {
          if (!ancestorVisibility.has(ancestor)) ancestorVisibility.set(ancestor, ancestor.visible);
          ancestor.visible = true;
          ancestor = ancestor.parent;
        }
      };

      // Detach the candidate while the last complete viewmodel keeps
      // presenting, then stage its exact gameplay scale in the fenced TSL/HDR
      // submission below. A default-context compile does not warm that path.
      for (const { model } of priorStates) {
        model.removeFromParent();
        model.visible = true;
      }
      try {
        const submissionWasPaused = renderSubmissionPaused;
        renderSubmissionPaused = true;
        try {
          await flushWebGpuFrames(12_000);
          for (const state of priorStates) restoreParent(state);
          // The menu/deployment lifecycle normally hides the entire viewmodel
          // ancestry. Reveal that chain only for this fenced upload frame or a
          // compile-only receipt could still leave first draw work in combat.
          for (const { model } of priorStates) revealAncestors(model);
          await renderRuntime.compileAndRender(priorStates[0].model, camera, scene);
          const presentation = renderRuntime.presentationTelemetry();
          if (presentation.status !== 'healthy') {
            throw new Error(`Streamed ${priorStates.map(({ weaponId }) => weaponId).join(', ')} viewmodel prewarm was ${presentation.status}`);
          }
        } finally {
          renderSubmissionPaused = submissionWasPaused;
        }
      } finally {
        for (const state of priorStates) restoreParent(state);
        for (const [ancestor, visible] of ancestorVisibility) ancestor.visible = visible;
        for (const state of priorStates) {
          state.model.visible = state.visible;
          state.model.scale.copy(state.scale);
        }
      }
    };
const runStreamedWeaponGpuPrewarm: WeaponViewmodelGpuPrewarmer = async (model, { weaponId, requestGeneration }) => (
  runStreamedWeaponCatalogGpuPrewarm([{ weaponId, model }], { requestGeneration })
);
const streamedWeaponGpuPrewarmer: WeaponViewmodelGpuPrewarmer | undefined = renderRuntime.backend === 'webgpu'
  ? (model, context) => streamedWeaponGpuPrewarmQueue.run(() => runStreamedWeaponGpuPrewarm(model, context))
  : undefined;
const streamedWeaponCatalogGpuPrewarmer: WeaponViewmodelCatalogGpuPrewarmer | undefined = renderRuntime.backend === 'webgpu'
  ? (entries, context) => streamedWeaponGpuPrewarmQueue.run(() => runStreamedWeaponCatalogGpuPrewarm(entries, context))
  : undefined;
const weaponView = new WeaponPresentation(
  camera,
  reducedRenderMode,
  (root, afterFence) => scheduleDeferredGpuRetirement(root, true, afterFence),
  streamedWeaponGpuPrewarmer,
  streamedWeaponCatalogGpuPrewarmer,
);
let loadoutState: LoadoutStorageV2 = playerProfileStore.current.loadout;
let managedPresetId: LoadoutPresetId = loadoutState.selected.kind === 'custom'
  ? loadoutState.selected.presetId
  : 'custom-1';

type CombatLoadoutSelection = Readonly<{
  primary: PrimaryWeaponId;
  secondary: SidearmWeaponId;
  grenade: GrenadeId;
}>;

function activeLoadoutSelection(state = loadoutState): CombatLoadoutSelection {
  const selected = state.selected;
  if (selected.kind === 'curated') {
    const kit = fieldKitById(selected.kitId);
    return Object.freeze({ primary: kit.weapon, secondary: kit.sidearm, grenade: kit.grenade });
  }
  const preset = state.customPresets.find((entry) => entry.id === selected.presetId)
    ?? state.customPresets[0]!;
  return Object.freeze({
    primary: preset.primary as PrimaryWeaponId,
    secondary: preset.secondary as SidearmWeaponId,
    grenade: preset.grenade as GrenadeId,
  });
}

function gunRangeSidearmForWeaponPrewarm(): SidearmWeaponId {
  return localDhv === 'X' ? 'magnum' : 'pistol';
}

function selectedLoadoutLabel(state = loadoutState): string {
  const selected = state.selected;
  if (selected.kind === 'curated') return fieldKitById(selected.kitId).title;
  return state.customPresets.find((entry) => entry.id === selected.presetId)?.displayName ?? 'Custom 1';
}

function loadoutMatchesPlayer(selection: CombatLoadoutSelection): boolean {
  return player.primaryWeapon === selection.primary
    && player.secondaryWeapon === selection.secondary
    && player.selectedGrenade === selection.grenade;
}

function persistLoadoutState(candidate: LoadoutStorageV2): boolean {
  const result = playerProfileStore.update({ loadout: candidate });
  if (!result.ok) {
    setStatus(`Loadout could not be saved (${result.reason}).`, 'warn');
    return false;
  }
  loadoutState = result.value.loadout;
  return true;
}

let menuLoadoutPresentationGeneration = 0;
function applyMenuLoadoutImmediately(): void {
  if (gameStarted || selectedArena.id === 'gun-range') return;
  const selection = activeLoadoutSelection();
  player.primaryWeapon = selection.primary;
  player.secondaryWeapon = selection.secondary;
  player.selectedGrenade = selection.grenade;
  player.grenades = 1;
  player.weapon = selection.primary;
  if (renderRuntime.backend !== 'webgpu') {
    weaponView.setWeapon(player.weapon, true);
    return;
  }
  const generation = ++menuLoadoutPresentationGeneration;
  const selectedWeapon = player.weapon;
  const retainedCatalog = menuDeploymentAssetsPromise
    ? WEAPON_IDS
    : menuWeaponPrewarmCatalog(selection.primary, selection.secondary);
  void weaponView.prewarmBrowserWeaponCatalog(retainedCatalog).then(() => {
    if (generation !== menuLoadoutPresentationGeneration || gameStarted || player.weapon !== selectedWeapon) return;
    weaponView.setWeapon(selectedWeapon, true);
  }).catch((error: unknown) => {
    if (generation !== menuLoadoutPresentationGeneration) return;
    setStatus(`Selected loadout presentation could not be prepared: ${error instanceof Error ? error.message : String(error)}`, 'warn');
  });
}

let activeMenuTabId: 'deploy' | 'kit' | 'streaks' | 'options' = 'deploy';
function setMenuTab(tab: 'deploy' | 'kit' | 'streaks' | 'options', flushOptions = true): void {
  if (tab === 'kit' && selectedArena.id === 'gun-range') tab = 'deploy';
  // Pass 65: leaving the options tab is a graphics save point — batched edits
  // flush here instead of reloading the page per control change.
  if (flushOptions && activeMenuTabId === 'options' && tab !== 'options') flushPendingGraphics();
  activeMenuTabId = tab;
  document.querySelectorAll<HTMLButtonElement>('[data-menu-tab]').forEach((button) => {
    const active = button.dataset.menuTab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll<HTMLElement>('[data-menu-panel]').forEach((panel) => {
    const active = panel.dataset.menuPanel === tab;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  queueMicrotask(syncMenuPreviewCanvasPlacement);
}

function renderCustomLoadoutEditor(): void {
  const editor = document.querySelector<HTMLElement>('#loadout-manager');
  if (!editor) return;
  const preset = loadoutState.customPresets.find((entry) => entry.id === managedPresetId) ?? loadoutState.customPresets[0];
  if (!preset) return;
  element<HTMLSelectElement>('#loadout-manage-preset').value = preset.id;
  element<HTMLInputElement>('#loadout-preset-name').value = preset.displayName;
  element<HTMLSelectElement>('#loadout-primary').value = preset.primary;
  element<HTMLSelectElement>('#loadout-secondary').value = preset.secondary;
  element<HTMLSelectElement>('#loadout-grenade').value = preset.grenade;
}

function renderFieldKitSelection(): void {
  const summary = element<HTMLElement>('#selected-kit-summary');
  const redeploy = element<HTMLButtonElement>('#field-kit-redeploy');
  redeploy.textContent = 'REDEPLOY NOW WITH SELECTED LOADOUT';
  if (selectedArena.id === 'gun-range') {
    redeploy.hidden = true;
    summary.dataset.rangeArmory = 'true';
    const equipped = rangePrimaryUnlocked ? WEAPONS[player.primaryWeapon].name : 'Service Pistol';
    summary.replaceChildren();
    const label = document.createElement('span');
    label.textContent = 'RANGE ARMORY';
    const title = document.createElement('strong');
    title.textContent = 'PICK UP YOUR WEAPON INSIDE';
    const detail = document.createElement('b');
    detail.textContent = `${equipped} · PRESS F AT A BENCH`;
    summary.append(label, title, detail);
    return;
  }
  delete summary.dataset.rangeArmory;
  const selection = activeLoadoutSelection();
  const queued = gameStarted && !loadoutMatchesPlayer(selection);
  redeploy.hidden = !queued || !player.alive || matchFinished;
  redeploy.disabled = !queued || !player.alive || matchFinished;
  const status = document.createElement('span');
  status.textContent = queued ? 'QUEUED NEXT DEPLOYMENT' : 'ACTIVE LOADOUT';
  const title = document.createElement('strong');
  title.textContent = selectedLoadoutLabel();
  const equipment = document.createElement('b');
  equipment.textContent = `${WEAPONS[selection.primary].name} · ${WEAPONS[selection.secondary].name} · ${selection.grenade.toUpperCase()}`;
  summary.replaceChildren(status, title, equipment);
  document.querySelectorAll<HTMLButtonElement>('[data-kit-id]').forEach((card) => {
    const selected = loadoutState.selected.kind === 'curated' && card.dataset.kitId === loadoutState.selected.kitId;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-custom-preset-id]').forEach((card) => {
    const presetId = card.dataset.customPresetId as LoadoutPresetId;
    const preset = loadoutState.customPresets.find((entry) => entry.id === presetId);
    const selected = loadoutState.selected.kind === 'custom' && loadoutState.selected.presetId === presetId;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
    const label = card.querySelector<HTMLElement>('[data-custom-name]');
    const equipmentLabel = card.querySelector<HTMLElement>('[data-custom-equipment]');
    if (label && preset) label.textContent = preset.displayName;
    if (equipmentLabel && preset) {
      equipmentLabel.textContent = `${WEAPONS[preset.primary as WeaponId].name} · ${WEAPONS[preset.secondary as WeaponId].name} · ${preset.grenade.toUpperCase()}`;
    }
  });
  renderCustomLoadoutEditor();
}

function chooseFieldKit(id: string): void {
  const kitId = fieldKitById(id).id;
  const candidate = { ...loadoutState, selected: { kind: 'curated', kitId } as SelectedLoadoutRef };
  if (!persistLoadoutState(candidate)) return;
  applyMenuLoadoutImmediately();
  renderFieldKitSelection();
}

function chooseCustomPreset(presetId: LoadoutPresetId): void {
  if (!loadoutState.customPresets.some((preset) => preset.id === presetId)) return;
  managedPresetId = presetId;
  const candidate = { ...loadoutState, selected: { kind: 'custom', presetId } as SelectedLoadoutRef };
  if (!persistLoadoutState(candidate)) return;
  applyMenuLoadoutImmediately();
  renderFieldKitSelection();
}

function saveManagedPreset(): void {
  const current = loadoutState.customPresets.find((entry) => entry.id === managedPresetId);
  if (!current) return;
  const primary = element<HTMLSelectElement>('#loadout-primary').value;
  const secondary = element<HTMLSelectElement>('#loadout-secondary').value;
  const grenade = element<HTMLSelectElement>('#loadout-grenade').value;
  if (!loadoutEligibility.primaryIds.includes(primary)
    || !loadoutEligibility.secondaryIds.includes(secondary)
    || !GRENADE_IDS.includes(grenade as GrenadeId)) return;
  const updated = Object.freeze({
    ...current,
    displayName: sanitizeLoadoutPresetName(element<HTMLInputElement>('#loadout-preset-name').value, managedPresetId),
    primary,
    secondary,
    grenade: grenade as LoadoutGrenadeId,
  });
  const candidate = {
    ...loadoutState,
    customPresets: loadoutState.customPresets.map((preset) => preset.id === managedPresetId ? updated : preset),
  };
  if (!persistLoadoutState(candidate)) return;
  applyMenuLoadoutImmediately();
  renderFieldKitSelection();
  setStatus(`${updated.displayName} saved.`, 'ok');
}

document.querySelectorAll<HTMLButtonElement>('[data-menu-tab]').forEach((button) => {
  button.addEventListener('click', () => setMenuTab(button.dataset.menuTab as 'deploy' | 'kit' | 'streaks' | 'options'));
  button.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-menu-tab]:not([hidden]):not(:disabled)')];
    const index = tabs.indexOf(button);
    if (index < 0 || tabs.length === 0) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex]!;
    setMenuTab(next.dataset.menuTab as 'deploy' | 'kit' | 'streaks' | 'options');
    next.focus();
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-kit-id]').forEach((button) => {
  button.addEventListener('click', () => chooseFieldKit(button.dataset.kitId ?? 'balanced'));
});
document.querySelectorAll<HTMLButtonElement>('[data-custom-preset-id]').forEach((button) => {
  button.addEventListener('click', () => chooseCustomPreset(button.dataset.customPresetId as LoadoutPresetId));
});
const loadoutManageButton = element<HTMLButtonElement>('#loadout-manage');
loadoutManageButton.addEventListener('click', () => {
  const manager = element<HTMLElement>('#loadout-manager');
  manager.hidden = !manager.hidden;
  loadoutManageButton.setAttribute('aria-expanded', String(!manager.hidden));
  if (!manager.hidden) renderCustomLoadoutEditor();
});
element<HTMLSelectElement>('#loadout-manage-preset').addEventListener('change', (event) => {
  managedPresetId = (event.currentTarget as HTMLSelectElement).value as LoadoutPresetId;
  renderCustomLoadoutEditor();
});
element<HTMLButtonElement>('#loadout-save').addEventListener('click', saveManagedPreset);
element<HTMLButtonElement>('#field-kit-redeploy').addEventListener('click', () => {
  const selection = activeLoadoutSelection();
  if (!gameStarted || !player.alive || matchFinished || selectedArena.id === 'gun-range' || loadoutMatchesPlayer(selection)) return;
  const message: RedeployRequestMessage = {
    type: 'redeploy-request' as const,
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id,
    primary: selection.primary,
    secondary: selection.secondary,
    grenade: selection.grenade,
    nonce: randomNonce(),
  };
  if (network.role === 'client') {
    network.send(message);
    const button = element<HTMLButtonElement>('#field-kit-redeploy');
    button.disabled = true;
    button.textContent = 'REDEPLOY REQUESTED';
    setStatus('Redeploy requested from host.', 'ok');
    return;
  }
  if (network.role === 'host') {
    processedNonces.add(message.nonce);
    const commit: RedeployCommitMessage = {
      type: 'redeploy-commit', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: player.id, target: player.id, primary: selection.primary,
      secondary: selection.secondary, grenade: selection.grenade,
      hostTimeMs: performance.now(), nonce: randomNonce(),
    };
    network.send(commit);
  }
  applyLocalClassRedeploy(selection, true);
});
const initialLoadoutSelection = activeLoadoutSelection();
player.primaryWeapon = initialLoadoutSelection.primary;
player.secondaryWeapon = initialLoadoutSelection.secondary;
player.selectedGrenade = initialLoadoutSelection.grenade;
player.weapon = player.primaryWeapon;
renderFieldKitSelection();

const viewFill = new THREE.PointLight(0xe3f1ff, 1.35, 5);
viewFill.position.set(0, 0.4, 0.2);
viewFill.layers.set(VIEWMODEL_RENDER_LAYER);
camera.add(viewFill);

function stanceEyeHeight(stance: PlayerSnapshot['stance']): number {
  return stance === 'prone' ? 0.61 : stance === 'crouch' ? 1.16 : 1.7;
}

function currentViewmodelSurfaceRetreat(): number {
  const direction = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ')).normalize();
  let nearest: number | null = null;
  for (let distance = 0.2; distance <= 1.2; distance += 0.1) {
    const sample = player.position.clone().addScaledVector(direction, distance);
    if (!isBlocked(sample, activeWorldColliders(), 0.09)) continue;
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
    snapshotRateHz: 40,
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
    secondary: player.secondaryWeapon,
    grenade: player.selectedGrenade,
    weapon: player.weapon,
    stance: player.stance,
    seq: ++player.seq,
  };
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

function isTimedCombatMessage(message: GameMessage): message is ShotMessage | MeleeMessage | Extract<GameMessage, {
  type: 'grenade-throw' | 'hit' | 'support-activate' | 'killstreak-activate-intent' | 'killstreak-control-intent' | 'killstreak-care-capture-intent';
}> {
  return message.type === 'shot' || message.type === 'melee' || message.type === 'grenade-throw' || message.type === 'hit'
    || message.type === 'support-activate' || message.type === 'killstreak-activate-intent'
    || message.type === 'killstreak-control-intent' || message.type === 'killstreak-care-capture-intent';
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

function stickySourceForHit(message: HitMessage): StickyAttachmentSource | null {
  if (message.kind !== 'explosive') return null;
  if (message.explosiveSource === 'explosive-crossbow') {
    const action = admittedRemoteShots.get(message.by)?.get(message.actionNonce);
    return action?.message.weapon === 'explosive-crossbow' ? 'explosive-crossbow' : null;
  }
  if (message.explosiveSource !== 'grenade') return null;
  const grenadeAuthority = remoteGrenadeAuthorities.get(message.by);
  if (grenadeAuthority && remoteGrenadeForAction(grenadeAuthority, message.actionNonce) === 'semtex') return 'semtex';
  return stickyAttachmentRecordForAction(
    remoteStickyAttachmentAuthority,
    interactiveWorldMatchEpoch,
    message.by,
    'semtex',
    message.actionNonce,
  ) ? 'semtex' : null;
}

function hostStickyVerificationForAction(
  ownerId: string,
  source: StickyAttachmentSource,
  actionNonce: number,
  claimedOrigin: readonly [number, number, number],
  now: number,
) {
  const record = stickyAttachmentRecordForAction(
    remoteStickyAttachmentAuthority,
    interactiveWorldMatchEpoch,
    ownerId,
    source,
    actionNonce,
  );
  const grenadeAuthority = source === 'semtex' ? remoteGrenadeAuthorities.get(ownerId) : undefined;
  const ownerLifeId = record?.ownerLifeId
    ?? (grenadeAuthority ? remoteGrenadeLifeForAction(grenadeAuthority, actionNonce) : null);
  if (ownerLifeId === null) return null;
  return {
    source,
    ownerLifeId,
    verification: verifyRemoteStickyAttachment(remoteStickyAttachmentAuthority, {
      matchEpoch: interactiveWorldMatchEpoch,
      ownerId,
      ownerLifeId,
      source,
      actionNonce,
      claimedOrigin,
      now,
    }),
  } as const;
}

function hostStickyVerification(message: HitMessage, now: number) {
  if (!message.origin) return null;
  const source = stickySourceForHit(message);
  return source
    ? hostStickyVerificationForAction(message.by, source, message.actionNonce, message.origin, now)
    : null;
}

function verifiedStickyAttachment(record: StickyAttachmentRecord): HostVerifiedStickyAttachment {
  return Object.freeze({ targetId: record.targetId, targetLifeId: record.targetLifeId });
}

function queuePendingHostStickyHit(message: GameMessage, now: number): boolean {
  if (network.role !== 'host' || message.type !== 'hit' || message.stuck !== true || message.hostAuthority !== undefined) return false;
  const result = hostStickyVerification(message, now);
  if (!result || result.verification.status !== 'pending') return false;
  // Explosive-crossbow damage is already simulated by the host from the
  // admitted shot request. A guest hit claim never waits for or joins that path.
  if (result.source === 'explosive-crossbow') return false;
  for (const [nonce, pending] of pendingStickyHits) {
    if (now - pending.queuedAtMs > PENDING_STICKY_HIT_LIFETIME_MS) pendingStickyHits.delete(nonce);
  }
  if (pendingStickyHits.has(message.nonce)) return true;
  if (pendingStickyHits.size >= PENDING_STICKY_HIT_LIMIT) {
    const oldest = pendingStickyHits.keys().next().value;
    if (oldest !== undefined) pendingStickyHits.delete(oldest);
  }
  pendingStickyHits.set(message.nonce, Object.freeze({
    message: Object.freeze({ ...message }),
    queuedAtMs: now,
    source: result.source,
    ownerLifeId: result.ownerLifeId,
  }));
  return true;
}

function flushPendingStickyHits(ownerId: string, ownerLifeId: number, source: StickyAttachmentSource, actionNonce: number): void {
  const now = performance.now();
  for (const [nonce, pending] of pendingStickyHits) {
    if (now - pending.queuedAtMs > PENDING_STICKY_HIT_LIFETIME_MS) {
      pendingStickyHits.delete(nonce);
      incomingCombatRewindMs.delete(nonce);
      continue;
    }
    if (pending.message.by !== ownerId || pending.ownerLifeId !== ownerLifeId
      || pending.source !== source || pending.message.actionNonce !== actionNonce) continue;
    pendingStickyHits.delete(nonce);
    const verification = hostStickyVerification(pending.message, now);
    if (verification?.verification.status !== 'verified') {
      incomingCombatRewindMs.delete(nonce);
      continue;
    }
    stickyTimingReplayNonces.add(nonce);
    onNetworkMessage(pending.message);
  }
  if (source !== 'semtex') return;
  for (const [nonce, pending] of pendingStickyWindowBreaks) {
    if (now - pending.queuedAtMs > PENDING_STICKY_HIT_LIFETIME_MS) {
      pendingStickyWindowBreaks.delete(nonce);
      continue;
    }
    if (pending.message.by !== ownerId || pending.ownerLifeId !== ownerLifeId
      || pending.message.actionNonce !== actionNonce) continue;
    pendingStickyWindowBreaks.delete(nonce);
    acceptRemoteWindowBreak(pending.message);
  }
}

function recordReceiverStickyAttachment(input: Readonly<{
  ownerId: string;
  ownerLifeId: number;
  source: StickyAttachmentSource;
  actionNonce: number;
  targetId: string;
  targetLifeId: number;
  attachedAtMs: number;
  expiresAtMs: number;
}>): void {
  if (network.role === 'client') return;
  remoteStickyAttachmentAuthority = pruneRemoteStickyAttachments(remoteStickyAttachmentAuthority, input.attachedAtMs);
  const result = recordRemoteStickyAttachment(remoteStickyAttachmentAuthority, {
    matchEpoch: interactiveWorldMatchEpoch,
    ...input,
  });
  if (result.accepted) remoteStickyAttachmentAuthority = result.state;
}

function sealReceiverStickyDetonation(input: Readonly<{
  ownerId: string;
  ownerLifeId: number;
  source: StickyAttachmentSource;
  actionNonce: number;
  origin: readonly [number, number, number];
  detonatedAtMs: number;
  currentAttachmentTarget: Readonly<{ id: string; lifeId: number }> | null;
}>): StickyAttachmentRecord | null {
  if (network.role === 'client') return null;
  const result = sealRemoteStickyDetonation(remoteStickyAttachmentAuthority, {
    matchEpoch: interactiveWorldMatchEpoch,
    ...input,
  });
  if (!result.accepted) return null;
  remoteStickyAttachmentAuthority = result.state;
  const record = stickyAttachmentRecord(
    remoteStickyAttachmentAuthority,
    interactiveWorldMatchEpoch,
    input.ownerId,
    input.ownerLifeId,
    input.source,
    input.actionNonce,
  );
  if (record?.detonationOrigin) flushPendingStickyHits(input.ownerId, input.ownerLifeId, input.source, input.actionNonce);
  return record;
}

function interactiveWorldLineOfSight(
  placementId: string,
  from: Readonly<{ x: number; y: number; z: number }>,
  to: Readonly<{ x: number; y: number; z: number }>,
  collision = interactiveWorldRuntime?.collisions(),
): boolean {
  if (!collision) return false;
  const origin = new THREE.Vector3(from.x, from.y, from.z);
  const target = new THREE.Vector3(to.x, to.y, to.z);
  const replacedHouseColliders = new Set(arena.houseDestruction?.staticColliders ?? []);
  if (arena.colliders.some((box) => !replacedHouseColliders.has(box) && segmentIntersectsBox(origin, target, box))) return false;
  return !collision.dynamicColliders.some((entry) => {
    // The segment terminates at the requested door centre; that exact door is
    // the interaction target, not an occluder. Every other live shed panel and
    // debris body remains authoritative cover.
    if (entry.id === `${placementId}:door-south`) return false;
    return segmentIntersectsBox(origin, target, entry.bounds);
  });
}

function broadcastInteractiveWorldState(forceReliable = false): void {
  if (network.role !== 'host' || !interactiveWorldRuntime || !gameStarted) return;
  const revision = interactiveWorldRuntime.collisions().revision;
  if (!forceReliable && (interactiveWorldTick % 6 !== 0 || revision === lastInteractiveWorldBroadcastRevision)) return;
  const envelope = interactiveWorldRuntime.stateEnvelope();
  const message: InteractiveWorldSnapshotMessage = {
    type: 'interactive-world-snapshot',
    schemaVersion: INTERACTIVE_WORLD_SCHEMA_VERSION,
    by: player.id,
    envelope,
    nonce: randomNonce(),
  };
  network.send(message);
  if (forceReliable || interactiveWorldTick % 30 === 0) network.sendStateCommitReliably(message);
  lastInteractiveWorldBroadcastRevision = envelope.revision;
}

function handleInteractiveWorldMessage(message: GameMessage): boolean {
  if (message.type === 'interactive-world-snapshot') {
    if (network.role !== 'client'
      || message.by !== privateLobbySnapshot?.hostId
      || !interactiveWorldRuntime
      || message.envelope.arenaId !== selectedArena.id
      || message.envelope.matchEpoch !== interactiveWorldMatchEpoch) return true;
    if (interactiveWorldRuntime.applyAuthoritativeEnvelope(message.envelope)) syncInteractiveWorldPhysics(true);
    return true;
  }
  if (message.type !== 'shed-interact-request') return false;
  if (network.role !== 'host'
    || !interactiveWorldRuntime
    || message.arenaId !== selectedArena.id
    || message.matchEpoch !== interactiveWorldMatchEpoch) return true;
  const remote = remotes.get(message.by);
  const health = remoteHealthAuthorities.get(message.by);
  if (!remote || !health?.alive || message.lifeId !== remote.continuity) return true;
  const actorPosition = Object.freeze({
    x: remote.snapshot.x,
    y: remote.snapshot.y,
    z: remote.snapshot.z,
  });
  const result = interactiveWorldRuntime.interactDoor({
    placementId: message.placementId,
    actorId: message.by,
    actorAlive: health.alive,
    actorPosition,
    sequence: message.actionSequence,
    tick: interactiveWorldTick,
    hasLineOfSight: (from, to, collision) => interactiveWorldLineOfSight(message.placementId, from, to, collision),
  });
  if (result?.accepted) {
    syncInteractiveWorldPhysics();
    broadcastInteractiveWorldState(true);
  }
  return true;
}

function handleSmokeAuthorityMessage(message: GameMessage): boolean {
  if (message.type !== 'smoke-state') return false;
  if (network.role !== 'client'
    || message.by !== privateLobbySnapshot?.hostId
    || message.snapshot.matchEpoch !== interactiveWorldMatchEpoch) return true;
  if (smokeAuthority.applyAuthoritativeSnapshot(message.snapshot)) {
    synchronizeSmokePresentation(message.snapshot, currentHostTimeMs());
  }
  return true;
}

function handleFlashAuthorityMessage(message: GameMessage): boolean {
  if (message.type !== 'flash-result') return false;
  // The host transport rejects host-authority message kinds from guests before
  // this handler. Keep a second fail-closed role/identity/recipient fence here
  // so a direct or future transport integration cannot turn a guest result into
  // local presentation authority.
  if (network.role !== 'client'
    || message.by !== privateLobbySnapshot?.hostId
    || message.forPlayerId !== player.id
    || message.result.targetId !== player.id
    || matchState.phase !== 'active'
    || !player.alive) return true;
  applyAuthoritativeFlashResult(message.result);
  return true;
}

function onNetworkMessage(message: GameMessage): void {
  if (handleLobbyMessage(message)) return;
  if (!gameStarted) return;
  if (handleInteractiveWorldMessage(message)) return;
  if (handleSmokeAuthorityMessage(message)) return;
  if (handleFlashAuthorityMessage(message)) return;
  if (message.type === 'killstreak-loadout-intent') {
    if (network.role !== 'host' || message.matchEpoch !== killstreakMatchEpoch || killstreakRegisteredActors.has(message.by)) return;
    const member = privateLobbySnapshot?.members.find((entry) => entry.id === message.by);
    const remote = remotes.get(message.by);
    if (!member || !remote || message.lifeId !== remote.continuity) return;
    killstreakRuntime.registerActor(message.by, member.team, message.lifeId, message.loadout);
    killstreakRegisteredActors.add(message.by);
    broadcastKillstreakState();
    return;
  }
  if (message.type === 'killstreak-activate-intent') {
    if (network.role !== 'host' || message.matchEpoch !== killstreakMatchEpoch || !admitIncomingCombatTiming(message)) return;
    const now = performance.now();
    const admission = killstreakRuntime.activate(message, now, killstreakWorldState());
    if (admission.accepted) {
      if (admission.activationId && admission.activatedId && isLegacyOffensiveSupport(admission.activatedId)) {
        const state = remoteSupportAuthorities.get(message.by) ?? createRemoteSupportAuthorityState();
        remoteSupportAuthorities.set(message.by, registerRemoteSupportActivation(state, {
          activationRequestId: message.activationId,
          canonicalActivationId: admission.activationId,
          source: admission.activatedId,
          now,
        }));
      }
      addFeed(`${combatantLabel(message.by).name} CALLED ${GAMEPAD_SUPPORT_LABELS[admission.activatedId!]}`, 'gold');
      broadcastKillstreakState();
    }
    return;
  }
  if (message.type === 'killstreak-control-intent') {
    if (network.role !== 'host' || message.matchEpoch !== killstreakMatchEpoch || !admitIncomingCombatTiming(message)) return;
    if (killstreakRuntime.control(message, performance.now()).accepted) broadcastKillstreakState();
    return;
  }
  if (message.type === 'killstreak-care-capture-intent') {
    if (network.role !== 'host' || message.matchEpoch !== killstreakMatchEpoch || !admitIncomingCombatTiming(message)) return;
    const now = performance.now();
    const result = message.holding
      ? killstreakRuntime.beginCareCapture(message.by, message.lifeId, message.crateId, now, killstreakWorldState())
      : (() => {
        const released = killstreakRuntime.interruptCareCapture(message.by, message.lifeId);
        return { accepted: released, reason: released ? 'released' as const : 'not-capturing' as const };
      })();
    const response: KillstreakCareCaptureResultMessage = {
      type: 'killstreak-care-capture-result',
      by: player.id,
      forPlayerId: message.by,
      matchEpoch: killstreakMatchEpoch,
      lifeId: message.lifeId,
      sequence: message.sequence,
      crateId: message.crateId,
      holding: message.holding,
      accepted: result.accepted,
      reason: result.reason,
      revision: killstreakRuntime.snapshotFor(message.by, now).revision,
      nonce: randomNonce(),
    };
    network.send(response);
    broadcastKillstreakState(now);
    return;
  }
  if (message.type === 'killstreak-care-capture-result') {
    if (network.role !== 'client') return;
    const admission = admitKillstreakCareCaptureResultMessage(message, {
      expectedHostId: privateLobbySnapshot?.hostId ?? null,
      expectedRecipientId: player.id,
      expectedMatchEpoch: killstreakMatchEpoch,
      expectedLifeId: localContinuity,
      seenNonces: processedNonces,
    });
    if (!admission.accepted) return;
    processedNonces.add(message.nonce);
    const applied = applyCareCaptureResult(localCareCaptureState, message);
    localCareCaptureState = applied.state;
    if (applied.transition === 'acknowledged') addFeed('CARE PACKAGE - SECURING', 'gold');
    else if (applied.transition === 'rejected') {
      addFeed(`CARE PACKAGE - CLAIM REJECTED (${message.reason.replaceAll('-', ' ').toUpperCase()})`, 'coral');
    }
    return;
  }
  if (message.type === 'killstreak-state') {
    if (network.role !== 'client') return;
    const admission = admitKillstreakStateMessage(message, {
      expectedHostId: privateLobbySnapshot?.hostId ?? null,
      expectedRecipientId: player.id,
      expectedMatchEpoch: killstreakMatchEpoch,
      currentRevision: killstreakSnapshot.revision,
      seenNonces: processedNonces,
    });
    if (!admission.accepted) return;
    processedNonces.add(message.nonce);
    const previousActor = localKillstreakActorSnapshot();
    killstreakSnapshot = message.snapshot;
    const actor = localKillstreakActorSnapshot();
    if (actor) {
      const previousCharges = new Map(previousActor?.availableCharges.map(({ id, count }) => [id, count]) ?? []);
      if (previousActor) {
        for (const { id, count } of actor.availableCharges) {
          if (count > (previousCharges.get(id) ?? 0)) {
            addFeed(`${GAMEPAD_SUPPORT_LABELS[id]} READY${count > 1 ? ` ×${count}` : ''}`, 'gold');
          }
        }
      }
      bestStreakThisMatch = Math.max(bestStreakThisMatch, actor.streak);
      refreshLocalKillstreakSnapshot();
      if (actor.streak > (previousActor?.streak ?? actor.streak)) recordImmediateStreak();
      updateFieldSupportHud();
    }
    return;
  }
  if (message.type === 'killstreak-damage-result') {
    if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId || message.matchEpoch !== killstreakMatchEpoch) return;
    for (const event of message.events) {
      if (event.ownerId === player.id) recordOwnerSupportDamage(event);
      if (event.targetId === player.id) applyKillstreakDamageEvent(event);
    }
    const presentedAt = performance.now();
    for (const impact of message.impacts) {
      if (impact.phase !== 'impact') continue;
      const point = new THREE.Vector3(...impact.position);
      audio.explosion(presentedAt);
      supportExplosionPresentation.emit(point, 4.5, presentedAt);
    }
    killstreakPresentation.presentImpacts(message.impacts, presentedAt);
    return;
  }
  if (message.type === 'railgun-state') {
    if (network.role === 'client' && message.by === privateLobbySnapshot?.hostId) applyRailgunState(message.state);
    return;
  }
  if (message.type === 'railgun-shot-result') {
    acceptRailgunShotResult(message);
    return;
  }
  if (message.type === 'railgun-claim-request') {
    if (network.role !== 'host') return;
    railgunClaimAudit.received += 1;
    const remote = remotes.get(message.by);
    const health = remoteHealthAuthorities.get(message.by);
    const pickup = railgunState.pickupPosition ? new THREE.Vector3(...railgunState.pickupPosition) : null;
    const reported = new THREE.Vector3(...message.position);
    const authoritative = remote ? new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z) : null;
    const authoritativeToReported = authoritative?.distanceTo(reported) ?? null;
    const authoritativeToPickup = authoritative && pickup ? authoritative.distanceTo(pickup) : null;
    const rejectionReason = processedNonces.has(message.nonce) ? 'duplicate-nonce'
      : !remote ? 'unknown-remote'
        : !health?.alive ? 'remote-not-alive'
          : !pickup || !authoritative ? 'pickup-unavailable'
            : authoritativeToReported !== null && authoritativeToReported > 2.8 ? 'reported-position-mismatch'
              : authoritativeToPickup !== null && authoritativeToPickup > RAILGUN_PICKUP_RANGE + 0.5 ? 'outside-authoritative-pickup-range'
                : null;
    railgunClaimAudit = {
      ...railgunClaimAudit,
      lastReason: rejectionReason,
      lastGeneration: message.generation,
      lastAuthoritativeToReportedMeters: authoritativeToReported,
      lastAuthoritativeToPickupMeters: authoritativeToPickup,
    };
    if (rejectionReason) {
      railgunClaimAudit.rejected += 1;
      recordMatchDiagnostic('railgun-pickup', 'rejected', { actorId: message.by, weaponOrEffect: 'railgun', reason: rejectionReason });
      return;
    }
    if (!remote || !authoritative) return;
    const claimed = claimRailgun(railgunState, message.by, message.generation);
    if (!claimed.accepted) {
      railgunClaimAudit.rejected += 1;
      railgunClaimAudit.lastReason = 'authority-state-rejected';
      recordMatchDiagnostic('railgun-pickup', 'rejected', { actorId: message.by, weaponOrEffect: 'railgun', reason: 'authority-state-rejected' });
      return;
    }
    railgunClaimAudit.accepted += 1;
    railgunClaimAudit.lastReason = 'accepted';
    processedNonces.add(message.nonce);
    applyRailgunState(claimed.state);
    remote.snapshot = { ...remote.snapshot, weapon: 'railgun' };
    setOperatorWeapon(remote.root.userData.operator as THREE.Group, 'railgun', flattenOperatorMaterials, scheduleDeferredGpuRetirement);
    recordMatchDiagnostic('railgun-pickup', 'accepted', { actorId: message.by, weaponOrEffect: 'railgun', position: authoritative.toArray(), reason: 'host-authoritative-pickup' });
    broadcastRailgunState();
    trimNonceSet();
    return;
  }
  if (message.type === 'railgun-shot-request') {
    resolveRailgunShot(message);
    return;
  }
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
  if (message.type === 'trigger-state') {
    if (network.role !== 'host' || message.by === player.id) return;
    const sender = remotes.get(message.by);
    const health = remoteHealthAuthorities.get(message.by);
    const admission = hostTriggerAuthorities.admit(message, sender?.snapshot, performance.now(), {
      expectedConnectionEpoch: hostLobbyConnectionEpochs.get(message.by) ?? '',
      expectedLifeId: sender?.continuity ?? -1,
      shooterAlive: health?.alive ?? false,
    });
    recordMatchDiagnostic('trigger-authority', admission.accepted ? 'accepted' : 'rejected', {
      actorId: message.by,
      weaponOrEffect: message.weapon,
      reason: admission.reason,
      modifiers: [message.pressed ? 'pressed' : 'released', `sequence:${message.actionSequence}`],
    }, `trigger-${message.actionSequence}`);
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
  const stickyTimingAlreadyAdmitted = message.type === 'hit' && stickyTimingReplayNonces.delete(message.nonce);
  if (!stickyTimingAlreadyAdmitted && !admitIncomingCombatTiming(message)) return;
  if (queuePendingHostStickyHit(message, performance.now())) return;
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
      const initialHealth = retainedHealth ?? createRemoteHealthAuthorityState(incoming.hp > 0, performance.now());
      const initialIncoming = network.role === 'host' ? { ...incoming, hp: initialHealth.hp } : incoming;
      remote = createRemote(initialIncoming);
      remotes.set(incoming.id, remote);
      if (!remoteSupportAuthorities.has(incoming.id)) remoteSupportAuthorities.set(incoming.id, createRemoteSupportAuthorityState());
      if (!remoteGrenadeAuthorities.has(incoming.id)) remoteGrenadeAuthorities.set(incoming.id, createRemoteGrenadeAuthorityState(incoming.grenade));
      if (!retainedHealth) remoteHealthAuthorities.set(incoming.id, initialHealth);
      if (network.role === 'host') network.send({ type: 'join', player: initialIncoming });
      addFeed(`${initialIncoming.name} entered the test block`, initialIncoming.team === 0 ? 'aqua' : 'coral');
      sendLeaderboardSync();
      if (message.type === 'join') {
        network.send(createStateMessage());
        broadcastOverdriveState(performance.now());
        broadcastRailgunState();
        broadcastInteractiveWorldState(true);
        broadcastSmokeState(true);
      }
    }
    if (network.role === 'host' && message.type === 'state') {
      // The remote continuity reducer is intentionally stricter than movement
      // presentation and can lag the authenticated sender's match-start token
      // by one. Bind flash presentation to that bounded sender-life token even
      // when a movement sample is independently rejected; it grants no health,
      // movement, damage, or detonation authority.
      const claimedLifeId = message.continuity;
      if (claimedLifeId === remote.continuity || claimedLifeId === remote.continuity + 1) {
        remoteFlashVictimLifeIds.set(incoming.id, Math.max(remoteFlashVictimLifeIds.get(incoming.id) ?? 0, claimedLifeId));
      }
    }
    if (incoming.seq > remote.snapshot.seq) {
      const now = performance.now();
      const redeployAuthorization = authorizedRemoteRedeploys.get(incoming.id);
      const redeployed = redeployAuthorization !== undefined
        && redeployAuthorization.expiresAt >= now
        && redeployAuthorization.primary === incoming.primary
        && redeployAuthorization.secondary === incoming.secondary
        && redeployAuthorization.grenade === incoming.grenade;
      if (redeployAuthorization && redeployAuthorization.expiresAt < now) authorizedRemoteRedeploys.delete(incoming.id);
      let admittedIncoming = incoming;
      let respawned = remote.snapshot.hp <= 0 && incoming.hp > 0 || redeployed;
      if (network.role === 'host') {
        const priorHealth = remoteHealthAuthorities.get(incoming.id) ?? createRemoteHealthAuthorityState(remote.snapshot.hp > 0, now);
        const health = advanceRemoteHealthAuthority(priorHealth, now);
        if (Math.floor(priorHealth.hp) !== Math.floor(health.hp) || health.hp === 100 && priorHealth.hp < 100) {
          recordHealthRegeneration(incoming.id, priorHealth.hp, health.hp, 'host-remote-health-authority');
        }
        const respawnAdmission = admitAuthoritativeRemoteRespawn(health, incoming.hp, now);
        if (respawnAdmission.respawned) {
          const support = remoteSupportAuthorities.get(incoming.id) ?? createRemoteSupportAuthorityState();
          remoteSupportAuthorities.set(incoming.id, recordRemoteSupportDeath(support));
          remoteGrenadeAuthorities.set(incoming.id, recordRemoteGrenadeRespawn(
            remoteGrenadeAuthorities.get(incoming.id) ?? createRemoteGrenadeAuthorityState(incoming.grenade),
            incoming.grenade,
            now,
          ));
          hostTriggerAuthorities.reset(incoming.id, 'respawn');
        }
        if (redeployed) {
          const support = remoteSupportAuthorities.get(incoming.id) ?? createRemoteSupportAuthorityState();
          remoteSupportAuthorities.set(incoming.id, recordRemoteSupportDeath(support));
          remoteGrenadeAuthorities.set(incoming.id, recordRemoteGrenadeRespawn(
            remoteGrenadeAuthorities.get(incoming.id) ?? createRemoteGrenadeAuthorityState(incoming.grenade),
            incoming.grenade,
            now,
          ));
          hostTriggerAuthorities.reset(incoming.id, 'respawn');
        }
        const authoritativeHealth = respawnAdmission.state;
        remoteHealthAuthorities.set(incoming.id, authoritativeHealth);
        respawned = respawnAdmission.respawned || redeployed;
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
      if (network.role === 'host' && admittedIncoming.weapon === 'railgun' && railgunState.holderId !== admittedIncoming.id) return;
      if (admittedIncoming.primary !== remote.snapshot.primary && !respawned && !pickupAllowed) return;
      if ((admittedIncoming.secondary !== remote.snapshot.secondary || admittedIncoming.grenade !== remote.snapshot.grenade)
        && !respawned) return;
      if (pickupAllowed) authorizedRemotePickups.delete(admittedIncoming.id);
      if (redeployed) authorizedRemoteRedeploys.delete(admittedIncoming.id);
      if (network.role === 'host') hostTriggerAuthorities.resetIfWeaponChanged(admittedIncoming.id, admittedIncoming.weapon);
      remote.claimEligibleAt = movement.claimEligibleAt;
      const coreDistance = Math.hypot(admittedIncoming.x - overdriveState.position.x, admittedIncoming.z - overdriveState.position.z);
      if (movement.resynchronized && coreDistance <= OVERDRIVE_PICKUP_RADIUS + 3) remote.claimRequiresCoreExit = true;
      else if (remote.claimRequiresCoreExit && !movement.resynchronized && coreDistance > OVERDRIVE_PICKUP_RADIUS + 3) {
        remote.claimRequiresCoreExit = false;
        remote.claimEligibleAt = Math.max(remote.claimEligibleAt, now + 1_500);
      }
      const claimedContinuity = message.type === 'state' ? message.continuity : remote.continuity;
      const admittedContinuity = network.role === 'host'
        ? respawned || movement.resynchronized
          ? Math.max(remote.continuity + 1, claimedContinuity)
          : remote.positionHistory.length <= 1 && claimedContinuity >= remote.continuity
            ? claimedContinuity
            : remote.continuity
        : claimedContinuity;
      const admittedHostTimeMs = message.type === 'state'
        ? network.role === 'host' ? Math.max(now - 250, Math.min(now + 50, message.hostTimeMs)) : message.hostTimeMs
        : currentHostTimeMs();
      remote.snapshot = admittedIncoming;
      if (message.type === 'state') remote.snapshotRateHz = message.rateHz;
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
    // Kept as a no-op for protocol compatibility with older peers.
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
    const sender = remotes.get(message.by);
    if (!sender || sender.snapshot.hp <= 0) return;
    if (message.effectOrigins.some((origin) => !pointInsideBounds(new THREE.Vector3(...origin), arena.bounds, 0))) return;
    if (message.targetIds.some((id) => {
      if (id === player.id) return !player.alive || !areCombatantsHostile(message.by, sender.snapshot.team, player.id, player.team);
      const target = remotes.get(id);
      const botTarget = bots.get(id);
      if (target) return target.snapshot.hp <= 0 || !areCombatantsHostile(message.by, sender.snapshot.team, target.snapshot.id, target.snapshot.team);
      if (botTarget) return !botTarget.alive || !areCombatantsHostile(message.by, sender.snapshot.team, botTarget.id, botTarget.team);
      return true;
    })) return;
    if (network.role !== 'host') {
      presentRemoteSupportActivation(message, sender.snapshot);
      return;
    }
    const state = remoteSupportAuthorities.get(message.by);
    if (!state) return;
    const admission = admitRemoteSupportActivation(state, message, performance.now());
    if (admission.accepted) {
      remoteSupportAuthorities.set(message.by, admission.state);
      presentRemoteSupportActivation(message, sender.snapshot);
      network.send(message);
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
    presentRemoteGrenade(message, sender.snapshot.team);
    if (network.role === 'host') network.send(message);
    return;
  }
  if (message.type === 'shot') {
    if (message.by === player.id) return;
    if (message.weapon === 'railgun') {
      if (network.role === 'host' || processedNonces.has(message.nonce)) return;
      processedNonces.add(message.nonce);
      trimNonceSet();
      renderRemoteShot(message);
      return;
    }
    const sender = remotes.get(message.by);
    const prior = remoteShotAdmissions.get(message.by) ?? createRemoteShotAdmissionState();
    const admission = admitRemoteShot(message, sender?.snapshot, performance.now(), prior);
    if (!admission.accepted) return;
    remoteShotAdmissions.set(message.by, admission.nextState);
    const now = performance.now();
    const actions = admittedRemoteShots.get(message.by) ?? new Map<number, AdmittedRemoteShot>();
    for (const [nonce, action] of actions) {
      const lifetimeMs = action.message.weapon === 'explosive-crossbow' ? EXPLOSIVE_BOLT_MAX_LIFE_MS + 1_000 : 1_000;
      if (now - action.receivedAt > lifetimeMs) actions.delete(nonce);
    }
    actions.set(message.nonce, { message, receivedAt: now, targets: new Set() });
    admittedRemoteShots.set(message.by, actions);
    if (network.role === 'host') {
      admitAuthoritativeSmokeShot(
        `legacy:${interactiveWorldMatchEpoch}:${message.by}:${message.nonce}`,
        new THREE.Vector3(...message.origin),
        message.pelletDirections.map((entry) => new THREE.Vector3(...entry)),
        message.weapon,
        now,
      );
      network.send(message);
      applyKillstreakEntityShot(
        message.by,
        sender!.snapshot.team,
        new THREE.Vector3(...message.origin),
        message.pelletDirections.map((entry) => new THREE.Vector3(...entry)),
        message.weapon,
        now,
      );
    }
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
      && !activeWorldColliders().some((box) => segmentIntersectsBox(origin, player.position, box))) {
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
    const targetLifeId = targetIsLocal ? localContinuity : remoteTarget?.continuity ?? botTarget!.continuity;
    if (network.role === 'client') {
      const canonicalResult = admitHostCanonicalHitResult(message.hostAuthority, {
        expectedHostId: privateLobbySnapshot?.hostId,
        targetId,
        expectedTargetId: player.id,
        expectedTargetLifeId: targetLifeId,
        alreadyProcessed: processedNonces.has(message.nonce),
      });
      if (!canonicalResult.accepted) return;
      processedNonces.add(message.nonce);
      reconcileLocalAuthoritativeHealth(
        canonicalResult.resultingHealth,
        canonicalResult.appliedDamage,
        message.by,
        1,
        killCauseFromHit(message, attacker.snapshot.weapon),
      );
      trimNonceSet();
      return;
    } else if (message.hostAuthority !== undefined) {
      return;
    }
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
    let authoritativeHit = message;

    if (message.kind === 'shot') {
      const action = admittedRemoteShots.get(message.by)?.get(message.actionNonce);
      if (!action) { recordRemoteHitAdmission('shot-missing-action'); return; }
      const actionAgeMs = now - action.receivedAt;
      const actionLifetimeMs = action.message.weapon === 'explosive-crossbow' ? EXPLOSIVE_BOLT_MAX_LIFE_MS + 1_000 : 1_000;
      if (actionAgeMs > actionLifetimeMs) { recordRemoteHitAdmission('shot-expired-action'); return; }
      if (action.targets.has(message.target)) { recordRemoteHitAdmission('shot-duplicate-target'); return; }
      if (action.message.weapon === 'explosive-crossbow') {
        if (network.role === 'host') {
          recordRemoteHitAdmission('shot-projectile-host-authority-only');
          return;
        }
        if (actionAgeMs < EXPLOSIVE_BOLT_ARM_DELAY_MS - 150
          || Math.abs(message.damage - EXPLOSIVE_BOLT_DIRECT_DAMAGE) > 1e-6
          || !message.origin) {
          recordRemoteHitAdmission('shot-projectile-invalid');
          return;
        }
        const impact = new THREE.Vector3(...message.origin);
        if (!pointInsideBounds(impact, arena.bounds, 0)
          || impact.distanceTo(blastTargetPosition) > 1.15) {
          recordRemoteHitAdmission('shot-projectile-path-mismatch');
          return;
        }
        action.targets.add(message.target);
        recordRemoteHitAdmission('shot-projectile-admitted');
        admittedDamage = handicapOutgoingDamage(message.by, resolveRemotePoweredDamage(
          EXPLOSIVE_BOLT_DIRECT_DAMAGE,
          overdriveDamageMultiplier(overdriveState, message.by, now),
        ), 'explosive-crossbow');
      } else {
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
      }
    } else if (message.kind === 'melee') {
      const action = admittedRemoteMelees.get(message.by)?.get(message.actionNonce);
      if (!action || now - action.receivedAt > 1_000 || action.targets.has(message.target)) return;
      if (Math.abs(message.damage - 100) > 1e-6
        || !meleeActionHitsPoint(action.message, blastTargetPosition)
        || activeWorldColliders().some((box) => segmentIntersectsBox(new THREE.Vector3(...action.message.origin), blastTargetPosition, box))) return;
      action.targets.add(message.target);
      admittedDamage = handicapOutgoingDamage(message.by, resolveRemotePoweredDamage(100, overdriveDamageMultiplier(overdriveState, message.by, now)));
    } else {
      const source = message.explosiveSource;
      const originTuple = message.origin;
      if (!source || !originTuple) return;
      const hostSticky = network.role === 'host' ? hostStickyVerification(message, now) : null;
      const hostVerifiedRecord = hostSticky?.verification.status === 'verified'
        ? hostSticky.verification.attachment
        : null;
      const verifiedStuck = source === 'grenade' || source === 'explosive-crossbow'
        ? hostVerifiedRecord !== null
        : false;
      const canonicalOriginTuple = hostVerifiedRecord?.detonationOrigin ?? originTuple;
      const validationOrigin = new THREE.Vector3(...canonicalOriginTuple);
      if (!pointInsideBounds(validationOrigin, arena.bounds, 0)) return;
      const distance = validationOrigin.distanceTo(blastTargetPosition);
      if (distance > remoteExplosiveHitMaximumDistance(source, verifiedStuck)) return;
      if (source !== 'nuke' && activeWorldColliders().some((box) => segmentIntersectsBox(validationOrigin, blastTargetPosition, box))) return;
      const grenadeAuthority = source === 'grenade' ? remoteGrenadeAuthorities.get(message.by) : undefined;
      const grenade = grenadeAuthority ? remoteGrenadeForAction(grenadeAuthority, message.actionNonce) : null;
      const maximumBaseDamage = maximumRemoteExplosiveBaseDamage(source, distance, targetStance, grenade, verifiedStuck);
      if (network.role !== 'host' || !hostVerifiedRecord) {
        if (!admitRemoteBaseDamage(message.damage, maximumBaseDamage)
          || Math.abs(message.damage - maximumBaseDamage) > 1e-6) return;
      } else if (maximumBaseDamage <= 0) return;

      if (source === 'grenade') {
        if (!grenadeAuthority) return;
        const grenadeAdmission = admitRemoteGrenadeHit(grenadeAuthority, {
          actionNonce: message.actionNonce,
          explosionOrigin: canonicalOriginTuple,
          target: message.target,
          now,
        });
        if (!grenadeAdmission.accepted) return;
        remoteGrenadeAuthorities.set(message.by, grenadeAdmission.state);
      } else if (source === 'explosive-crossbow') {
        if (network.role === 'host') return;
        const projectile = admittedRemoteShots.get(message.by)?.get(message.actionNonce);
        const actionAgeMs = projectile ? now - projectile.receivedAt : Number.POSITIVE_INFINITY;
        if (!projectile || projectile.message.weapon !== 'explosive-crossbow'
          || actionAgeMs < EXPLOSIVE_BOLT_ARM_DELAY_MS - 150
          || actionAgeMs > EXPLOSIVE_BOLT_MAX_LIFE_MS + 1_000) return;
      } else {
        const supportNonce = message.supportNonce;
        const authority = remoteSupportAuthorities.get(message.by);
        if (supportNonce === undefined || !authority) return;
        const supportAdmission = admitRemoteSupportHit(authority, {
          source,
          activationNonce: supportNonce,
          origin: canonicalOriginTuple,
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
      const canonicalBaseDamage = hostVerifiedRecord ? maximumBaseDamage : message.damage;
      const { hostAuthority: _untrustedHostAuthority, stuck: _untrustedStuck, ...untrustedHit } = message;
      authoritativeHit = {
        ...untrustedHit,
        damage: canonicalBaseDamage,
        origin: canonicalOriginTuple as [number, number, number],
        ...(verifiedStuck ? { stuck: true as const } : {}),
      };
      admittedDamage = handicapOutgoingDamage(message.by, resolveRemotePoweredDamage(
        canonicalBaseDamage,
        overdriveDamageMultiplier(overdriveState, message.by, now),
      ));
    }

    processedNonces.add(message.nonce);
    const cause = killCauseFromHit(authoritativeHit, attacker.snapshot.weapon);
    if (targetIsLocal) applyDamage(admittedDamage, message.by, 1, false, cause);
    else if (botTarget) applyBotDamage(botTarget, admittedDamage, 'body', cause, message.by);
    else sendAuthoritativeHit(authoritativeHit);
    trimNonceSet();
    return;
  }
  if (message.type === 'death' && !processedNonces.has(message.nonce)) {
    processedNonces.add(message.nonce);
    processDeath(message);
    trimNonceSet();
    return;
  }
  if (message.type === 'leave') removeRemote(message.playerId, 'left the block', !message.voluntary);
}

function trimNonceSet(): void {
  if (processedNonces.size > 512) processedNonces.clear();
}

function sendAuthoritativeHit(
  message: HitMessage,
  evidence?: Readonly<{ hitZone?: HitZone; wallbang?: boolean; penetrationMultiplier?: number; distanceMeters?: number }>,
): void {
  if (network.role !== 'host') {
    const timedMessage: HitMessage = message.timing ? message : { ...message, timing: nextCombatTiming() };
    network.send(timedMessage);
    return;
  }
  const remote = remotes.get(message.target);
  const health = remoteHealthAuthorities.get(message.target);
  if (!remote || !health) return;
  const now = performance.now();
  const sticky = hostStickyVerification(message, now);
  const attachment = sticky?.verification.status === 'verified' ? sticky.verification.attachment : null;
  if (message.stuck === true && !attachment) return;
  const { hostAuthority: _untrustedHostAuthority, stuck: _untrustedStuck, ...untrustedMessage } = message;
  const canonicalMessage: HitMessage = {
    ...untrustedMessage,
    ...(attachment?.detonationOrigin ? { origin: [...attachment.detonationOrigin] as [number, number, number], stuck: true as const } : {}),
  };
  const timedMessage: HitMessage = canonicalMessage.timing ? canonicalMessage : { ...canonicalMessage, timing: nextCombatTiming() };
  const admittedWeapon = admittedRemoteShots.get(timedMessage.by)?.get(timedMessage.actionNonce)?.message.weapon;
  const attackerWeapon = admittedWeapon ?? remotes.get(timedMessage.by)?.snapshot.weapon ?? player.weapon;
  const poweredDamage = resolveRemotePoweredDamage(
    timedMessage.damage,
    overdriveDamageMultiplier(overdriveState, timedMessage.by, now),
  );
  const damageWeapon = timedMessage.kind === 'shot' || timedMessage.explosiveSource === 'explosive-crossbow'
    ? attackerWeapon
    : undefined;
  const outgoingHandicapped = handicapOutgoingDamage(timedMessage.by, poweredDamage, damageWeapon);
  const targetDhv = memberDhv(timedMessage.target);
  const result = applyAuthoritativeRemoteDamage(
    health,
    outgoingHandicapped,
    now,
    (damage, canonicalHealth) => applyDhvIncomingDamage(damage, canonicalHealth, targetDhv),
  );
  if (!result.applied) return;
  remoteHealthAuthorities.set(timedMessage.target, result.state);
  remote.snapshot = { ...remote.snapshot, hp: result.state.hp };
  remote.root.visible = result.state.alive;
  recordAuthoritativeRemoteRegeneration(timedMessage.target, result, 'host-remote-health-authority-before-legacy-hit');
  recordDamageEvent({
    actorId: timedMessage.by,
    targetId: timedMessage.target,
    weaponOrEffect: timedMessage.kind === 'shot' ? attackerWeapon : timedMessage.explosiveSource ?? timedMessage.kind,
    healthBefore: result.healthBefore,
    healthAfter: result.healthAfter,
    damageRequested: result.damageRequested,
    damageApplied: result.damageApplied,
    hitZone: evidence?.hitZone,
    critical: evidence?.hitZone === 'head',
    wallbang: evidence?.wallbang,
    penetrationMultiplier: evidence?.penetrationMultiplier,
    distanceMeters: evidence?.distanceMeters,
    reason: 'host-remote-health-authority',
  });
  recordAuthoritativeDamage(timedMessage.by, timedMessage.target, result.damageApplied);
  const authoritativeTimedMessage: HitMessage = {
    ...timedMessage,
    hostAuthority: {
      hostId: player.id,
      targetLifeId: remote.continuity,
      appliedDamage: result.damageApplied,
      resultingHealth: result.healthAfter,
      stickyAttachment: attachment ? verifiedStickyAttachment(attachment) : null,
    },
  };
  network.send(authoritativeTimedMessage);
  if (result.died) {
    const death: DeathMessage = {
      type: 'death', killer: timedMessage.by, victim: timedMessage.target,
      cause: killCauseFromHit(authoritativeTimedMessage, remotes.get(timedMessage.by)?.snapshot.weapon ?? player.weapon),
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
  receivedAtHostTimeMs: number | null,
  resolvedAtHostTimeMs: number | null,
  appliedRewindMs: number,
  outcomes: ShotResultMessage['outcomes'] = [],
): ShotResultMessage {
  return {
    type: 'shot-result', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: player.id, forPlayerId: request.by,
    shotId: request.shotId, shotSeq: request.shotSeq, status, reason,
    fireTimeMs: request.fireTimeMs, targetViewTimeMs: request.targetViewTimeMs,
    receivedAtHostTimeMs, resolvedAtHostTimeMs,
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
  const shooterHealth = remoteHealthAuthorities.get(request.by);
  const admission = admitAuthoritativeShot(request, sender?.snapshot, receivedAt, prior, {
    expectedConnectionEpoch: hostLobbyConnectionEpochs.get(request.by) ?? '',
    expectedLifeId: sender?.continuity ?? -1,
    clockUncertaintyMs: peerTimingStates.get(request.by)?.uncertaintyMs ?? 0,
    shooterDiedAtHostTimeMs: shooterHealth?.diedAtHostTimeMs ?? null,
    hostTriggerState: hostTriggerAuthorities.stateFor(request.by) ?? null,
  });
  const resolutionTrace = (outcome: string, resolvedAtHostTimeMs: number, appliedRewindMs: number): ShotResolutionTrace => ({
    shotSeq: request.shotSeq,
    weaponSequence: request.weaponSequence,
    lifeId: request.lifeId,
    fireTimeMs: request.fireTimeMs,
    targetViewTimeMs: request.targetViewTimeMs,
    receivedHostTimeMs: receivedAt,
    resolvedAtHostTimeMs,
    appliedRewindMs,
    shooterHistoryFirstMs: sender?.positionHistory[0]?.at ?? null,
    shooterHistoryLatestMs: sender?.positionHistory.at(-1)?.at ?? null,
    outcome,
  });
  const finish = (
    status: ShotResultMessage['status'],
    reason: ShotResultMessage['reason'],
    appliedRewindMs: number,
    outcomes: ShotResultMessage['outcomes'] = [],
  ): ShotResultMessage => {
    const resolvedAtHostTimeMs = performance.now();
    const result = makeShotResult(request, status, reason, receivedAt, resolvedAtHostTimeMs, appliedRewindMs, outcomes);
    resolvedShotRequests.set(cacheKey, result);
    while (resolvedShotRequests.size > 256) resolvedShotRequests.delete(resolvedShotRequests.keys().next().value!);
    lastResolvedShotTimeline = {
      fireTimeMs: request.fireTimeMs,
      targetViewTimeMs: request.targetViewTimeMs,
      receivedHostTimeMs: receivedAt,
      resolvedAtHostTimeMs,
      appliedRewindMs,
    };
    recordShotResolutionTrace(resolutionTrace(status === 'rejected' ? `rejected-${reason}` : status, resolvedAtHostTimeMs, appliedRewindMs));
    shotTimingTelemetry.recordHostResolution({
      fireTimeMs: request.fireTimeMs,
      receivedAtHostTimeMs: receivedAt,
      resolvedAtHostTimeMs,
      appliedRewindMs,
      rejected: status === 'rejected',
      eventLaneBufferedBytes: network.eventBufferedAmount(request.by),
    });
    recordShotProtocol(status === 'rejected' ? `rejected-${reason}` : status);
    if (status === 'rejected') network.sendToPlayer(request.by, result);
    else network.send(result);
    return result;
  };
  if (!admission.accepted || !sender) {
    finish('rejected', admission.reason, 0);
    return;
  }
  authoritativeShotAdmissions.set(request.by, admission.state);
  const visualShot: ShotMessage = {
    type: 'shot', by: request.by, weapon: request.weapon, origin: request.origin,
    direction: canonicalShotDirection(request.weapon, request.direction, request.pelletDirections),
    pelletDirections: request.pelletDirections, nonce: request.nonce,
  };
  const shooterRewind = reconstructShooterPoseAtFireTime(sender.positionHistory, request.fireTimeMs, request.lifeId);
  if (!shooterRewind.pose) {
    const reason = shooterRewind.reason === 'continuity-mismatch' ? 'continuity-mismatch' : 'missing-history';
    recordShotProtocol(`rejected-shooter-${shooterRewind.reason}`);
    finish('rejected', reason, admission.appliedRewindMs);
    return;
  }
  if (!validateShotOrigin(request, shooterRewind.pose)) {
    finish('rejected', 'bad-origin', admission.appliedRewindMs);
    return;
  }
  const admittedSmokeSegments = traceAuthoritativeSmokeShotSegments(
    new THREE.Vector3(...request.origin),
    request.pelletDirections.map((entry) => new THREE.Vector3(...entry)),
    request.weapon,
  );
  const actions = admittedRemoteShots.get(request.by) ?? new Map<number, AdmittedRemoteShot>();
  for (const [nonce, action] of actions) {
    const lifetimeMs = action.message.weapon === 'explosive-crossbow' ? EXPLOSIVE_BOLT_MAX_LIFE_MS + 1_000 : 1_000;
    if (receivedAt - action.receivedAt > lifetimeMs) actions.delete(nonce);
  }
  actions.set(visualShot.nonce, { message: visualShot, receivedAt, targets: new Set() });
  admittedRemoteShots.set(request.by, actions);
  network.send(visualShot, request.by);
  if (request.weapon === 'explosive-crossbow') {
    spawnExplosiveBolt(
      request.by,
      sender.snapshot.team,
      new THREE.Vector3(...request.origin),
      new THREE.Vector3(...visualShot.direction),
      true,
      request.nonce,
      receivedAt,
    );
    const operator = sender.root.userData.operator as THREE.Group | undefined;
    if (operator) fireOperator(operator);
    audio.shot('explosive-crossbow', true, new THREE.Vector3(...request.origin).distanceTo(camera.position));
    finish('accepted-miss', 'none', admission.appliedRewindMs);
    return;
  }
  renderRemoteShot(visualShot);
  applyKillstreakEntityShot(
    request.by,
    sender.snapshot.team,
    new THREE.Vector3(...request.origin),
    request.pelletDirections.map((entry) => new THREE.Vector3(...entry)),
    request.weapon,
    receivedAt,
  );

  const targetPoses: Array<{ id: string; x: number; y: number; z: number; yaw: number; stance: Stance }> = [];
  if (player.alive && areCombatantsHostile(request.by, sender.snapshot.team, player.id, player.team)) {
    const target = rewindCombatantPoseStrict(localPositionHistory, request.targetViewTimeMs, localContinuity);
    if (!target.pose) {
      const reason = target.reason === 'continuity-mismatch' ? 'continuity-mismatch' : 'missing-history';
      recordShotProtocol(`rejected-host-target-${target.reason}`);
      finish('rejected', reason, admission.appliedRewindMs);
      return;
    }
    targetPoses.push({ id: player.id, ...target.pose });
  }
  for (const [targetId, targetRemote] of remotes) {
    if (targetId === request.by || targetRemote.snapshot.hp <= 0
      || !areCombatantsHostile(request.by, sender.snapshot.team, targetId, targetRemote.snapshot.team)) continue;
    const target = rewindCombatantPoseStrict(targetRemote.positionHistory, request.targetViewTimeMs, targetRemote.continuity);
    if (!target.pose) continue;
    targetPoses.push({ id: targetId, ...target.pose });
  }
  for (const bot of bots.values()) {
    if (!bot.alive || !areCombatantsHostile(request.by, sender.snapshot.team, bot.id, bot.team)) continue;
    const target = rewindCombatantPoseStrict(bot.positionHistory, request.targetViewTimeMs, bot.continuity);
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
    const powerMultiplier = overdriveDamageMultiplier(overdriveState, request.by, receivedAt)
      * killstreakActorModifiers(request.by, receivedAt).damage;
    const powered = resolveRemotePoweredDamage(hit.damage, powerMultiplier);
    const outgoing = handicapOutgoingDamage(request.by, powered, request.weapon);
    const rawOutgoing = handicapOutgoingDamage(request.by, hit.rawDamage * powerMultiplier, request.weapon);
    let appliedDamage = 0;
    let reportedRawDamage = rawOutgoing;
    let resultingHealth = 0;
    let died = false;
    if (targetId === player.id) {
      const healthBefore = player.hp;
      const finalDamage = applyDhvIncomingDamage(outgoing, player.hp, localDhv);
      applyDamage(finalDamage, request.by, 1, false, { kind: 'gun', weapon: request.weapon }, true);
      appliedDamage = Math.max(0, healthBefore - player.hp);
      reportedRawDamage = reportedDhvRawDamage(rawOutgoing, healthBefore, localDhv, appliedDamage);
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
      const targetDhv = memberDhv(targetId);
      const applied = applyAuthoritativeRemoteDamage(
        health,
        outgoing,
        receivedAt,
        (damage, canonicalHealth) => applyDhvIncomingDamage(damage, canonicalHealth, targetDhv),
      );
      if (!applied.applied) continue;
      appliedDamage = applied.damageApplied;
      reportedRawDamage = reportedDhvRawDamage(rawOutgoing, applied.healthBefore, targetDhv, appliedDamage);
      resultingHealth = applied.state.hp;
      died = applied.died;
      remoteHealthAuthorities.set(targetId, applied.state);
      remote.snapshot = { ...remote.snapshot, hp: applied.state.hp };
      remote.root.visible = applied.state.alive;
      recordAuthoritativeRemoteRegeneration(targetId, applied, 'host-remote-health-authority-before-authored-shot');
      recordDamageEvent({
        actorId: request.by, targetId, weaponOrEffect: request.weapon,
        healthBefore: applied.healthBefore, healthAfter: applied.healthAfter,
        damageRequested: applied.damageRequested, damageApplied: appliedDamage,
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
      rawDamage: Math.max(appliedDamage, reportedRawDamage),
      resultingHealth, died, hitZone: hit.hitZone, wallbang: hit.wallbang,
      penetrationMultiplier: hit.penetrationMultiplier,
    });
  }
  admitAuthoritativeSmokeSegments(
    request.shotId,
    admittedSmokeSegments,
    performance.now(),
  );
  finish(outcomes.length > 0 ? 'accepted-hit' : 'accepted-miss', 'none', admission.appliedRewindMs, outcomes);
}

function reconcileLocalAuthoritativeHealth(
  resultingHealth: number,
  admittedDamage: number,
  attacker: string,
  minimumDamage: number,
  cause: KillCause,
): void {
  if (!player.alive) return;
  const localHealthBefore = player.hp;
  const canonicalDamage = Math.max(0, localHealthBefore - resultingHealth);
  recordMatchDiagnostic('health-reconciliation', 'accepted', {
    actorId: attacker,
    targetId: player.id,
    actorKind: combatantLabel(attacker).kind,
    targetKind: 'player',
    weaponOrEffect: cause.kind === 'gun' ? cause.weapon : cause.kind,
    healthBefore: localHealthBefore,
    healthAfter: resultingHealth,
    damageRequested: admittedDamage,
    damageApplied: canonicalDamage,
    reason: canonicalDamage > admittedDamage + 0.1 ? 'host-canonical-catch-down' : canonicalDamage <= 0 ? 'host-canonical-upward' : 'host-canonical-result',
  });
  if (canonicalDamage > 0) {
    applyDamage(canonicalDamage, attacker, minimumDamage, false, cause, true);
  } else if (admittedDamage > 0) {
    // A host result can move health upward when the local fixed-step simulation
    // lagged host time. The admitted hit still restarts the regen delay.
    lastDamageAt = performance.now();
  }
  if (player.alive) player.hp = resultingHealth;
}

function acceptAuthoritativeShotResult(message: ShotResultMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId) return;
  shotTimingTelemetry.recordResultDelivery(performance.now());
  const resultKey = `${message.by}:${message.forPlayerId}:${message.shotId}`;
  if (processedShotResults.has(resultKey)) {
    recordShotProtocol('duplicate-result');
    return;
  }
  processedShotResults.add(resultKey);
  while (processedShotResults.size > 512) processedShotResults.delete(processedShotResults.values().next().value!);
  for (const outcome of message.outcomes) {
    if (outcome.target !== player.id || !player.alive) continue;
    reconcileLocalAuthoritativeHealth(
      outcome.resultingHealth,
      outcome.damage,
      message.forPlayerId,
      0,
      { kind: 'gun', weapon: remotes.get(message.forPlayerId)?.snapshot.weapon ?? 'carbine' },
    );
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
  const totalRawDamage = message.outcomes.reduce((total, outcome) => total + (outcome.rawDamage ?? outcome.damage), 0);
  const totalHealthBefore = message.outcomes.reduce((total, outcome) => total + outcome.damage + outcome.resultingHealth, 0);
  showHitmarker(headshot);
  showDamageNumber(totalRawDamage, headshot ? 'head' : 'body', totalHealthBefore);
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
  if (message.weapon === 'explosive-crossbow') {
    const ownerTeam = message.by === player.id
      ? player.team
      : remotes.get(message.by)?.snapshot.team;
    if (ownerTeam === undefined) return;
    spawnExplosiveBolt(message.by, ownerTeam, origin, direction, false, message.nonce);
    const remoteOperator = remotes.get(message.by)?.root.userData.operator as THREE.Group | undefined;
    if (remoteOperator) fireOperator(remoteOperator);
    audio.shot(message.weapon, true, origin.distanceTo(camera.position));
    return;
  }
  const trace = traceWeaponPath(origin, direction, message.weapon === 'railgun' ? RAILGUN_BEAM_LENGTH_M : 50, message.weapon);
  applyInteractiveWorldBallisticTrace(trace, origin, direction, message.weapon);
  const visibleEnd = origin.clone().addScaledVector(direction, trace.travelDistance);
  const remoteOperator = remotes.get(message.by)?.root.userData.operator as THREE.Group | undefined;
  const remoteMuzzle = remoteOperator?.getObjectByName('muzzle-socket')?.getWorldPosition(new THREE.Vector3());
  if (message.weapon !== 'railgun') {
    spawnTracer(remoteMuzzle ?? origin, visibleEnd, WEAPONS[message.weapon].color);
  }
  if (remoteOperator) fireOperator(remoteOperator);
  let impactAudioPlayed = false;
  for (const impact of trace.impacts) {
    const impactDistance = impact.penetrated ? impact.entryDistance : impact.exitDistance;
    const point = origin.clone().addScaledVector(direction, impactDistance);
    const surface = ballisticImpactSurface(impact.surface.material);
    spawnImpactFlash(point, impact.surface.material, new THREE.Vector3(
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
  if (message.weapon !== 'railgun') audio.shot(message.weapon, true, origin.distanceTo(camera.position));
}

function showDamageDirection(attacker: string, damage = 12, now = performance.now()): void {
  const attackerPosition = remotes.get(attacker)?.target ?? bots.get(attacker)?.position;
  if (!attackerPosition || attacker === player.id) return;
  directionalDamageState = recordDirectionalDamage(directionalDamageState, {
    sourceId: attacker,
    sourceType: remotes.has(attacker) ? 'remote' : bots.has(attacker) ? 'bot' : 'world',
    angleRadians: sourceScreenAngle(player.position, player.yaw, attackerPosition),
    cameraYawRadians: player.yaw,
    damage,
    now,
  });
}

function updateSensoryFeedback(now: number): void {
  audio.updateListener(camera.position, player.yaw);
  if (now - lastSensoryPresentationAt < 1000 / 30) return;
  lastSensoryPresentationAt = now;
  const directions = directionalDamagePresentation(directionalDamageState, now, player.yaw);
  while (damageDirectionIndicator.childElementCount < directions.length) damageDirectionIndicator.append(document.createElement('i'));
  while (damageDirectionIndicator.childElementCount > directions.length) damageDirectionIndicator.lastElementChild?.remove();
  directions.forEach((direction, index) => {
    const marker = damageDirectionIndicator.children.item(index) as HTMLElement;
    marker.style.setProperty('--damage-angle', `${direction.angleRadians}rad`);
    marker.style.setProperty('--damage-opacity', direction.opacity.toFixed(4));
    marker.dataset.sector = String(direction.sector);
    marker.dataset.sourceType = direction.sourceType;
  });
  const lowHealth = sampleLowHealthFeedback(lowHealthFeedbackState, {
    health: player.hp,
    alive: player.alive,
    now,
    reducedSensory: accessibilityRuntime.reducedSensory,
  });
  lowHealthFeedbackState = lowHealth.state;
  lowHealthVignette.style.setProperty('--low-health-opacity', lowHealth.presentation.vignetteOpacity.toFixed(4));
  audio.setLowHealthFeedback(lowHealth.presentation);
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
  if (appliedDamage > 0) releaseCareCapture(now);
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
  showDamageDirection(attacker, appliedDamage, now);
  if (accessibilityRuntime.damageFlashScale > 0) {
    damageFlash.classList.remove('pulse');
    requestAnimationFrame(() => damageFlash.classList.add('pulse'));
  }
  if (player.hp <= 0) {
    interruptReload(true, now);
    cancelFInteractionPress('death', now);
    player.alive = false;
    player.deaths += 1;
    if (network.role !== 'client') {
      killstreakRuntime.recordActorDeath(player.id, localContinuity + 1);
      refreshLocalKillstreakSnapshot(now);
      broadcastKillstreakState(now);
    }
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

function deathDropVictim(message: DeathMessage): { weapon: WeaponId; position: THREE.Vector3 } | null {
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
  const root = deathDropPresentationPool.acquire(id, spec.color, victim.position, victim.weapon);
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

function interactWithWeaponPickup(now = performance.now(), expectedTargetId?: string): boolean {
  if (expectedTargetId && !fInteractionCandidates(now).some((candidate) => (
    candidate.kind === 'weapon-pickup' && candidate.targetId === expectedTargetId && candidate.enabled !== false
  ))) return false;
  return interactWithRailgunPickup(now) || interactWithGunRangeArmory(now) || interactWithDeathDrop(now);
}

function interactWithShedDoor(expectedPlacementId?: string): boolean {
  if (!interactiveWorldRuntime || !player.alive || matchState.phase !== 'active') return false;
  const nearest = interactiveWorldRuntime.nearestDoor(player.position);
  if (!nearest || nearest.distance > 2.35 || (expectedPlacementId && nearest.placementId !== expectedPlacementId)) return false;
  const actionSequence = interactiveWorldRuntime.nextInteractionSequence(nearest.placementId, player.id);
  if (actionSequence === null) return false;
  if (network.role === 'client') {
    const request: ShedInteractionIntentMessage = {
      type: 'shed-interact-request',
      schemaVersion: INTERACTIVE_WORLD_SCHEMA_VERSION,
      by: player.id,
      arenaId: selectedArena.id,
      placementId: nearest.placementId,
      matchEpoch: interactiveWorldMatchEpoch,
      lifeId: localContinuity,
      actionSequence,
      nonce: randomNonce(),
    };
    network.send(request);
    return true;
  }
  const result = interactiveWorldRuntime.interactDoor({
    placementId: nearest.placementId,
    actorId: player.id,
    actorAlive: player.alive,
    actorPosition: player.position,
    sequence: actionSequence,
    tick: interactiveWorldTick,
    hasLineOfSight: (from, to, collision) => interactiveWorldLineOfSight(nearest.placementId, from, to, collision),
  });
  if (result?.accepted) {
    syncInteractiveWorldPhysics();
    broadcastInteractiveWorldState(true);
    audio.shedDoorMotion(nearest.distance);
  }
  return true;
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
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id,
    dropId: drop.id,
    weapon: result.inventory.primary,
    mode: 'weapon',
    selectedGrenade: player.selectedGrenade,
    grenadeGranted: 0,
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
    now,
  );
  if (!result.scavenged) return false;
  entity.drop = result.drop;
  player.reserve[activeWeapon] = result.inventory.reserve;
  player.grenades = result.inventory.grenades;
  const pickup: PickupMessage = {
    type: 'pickup',
    protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id,
    dropId: drop.id,
    weapon: drop.weapon,
    mode: 'scavenge',
    selectedGrenade: player.selectedGrenade,
    grenadeGranted: result.grenadeGranted as 0 | 1,
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
  const gains = [result.ammoGranted > 0 ? `+${result.ammoGranted} ${WEAPONS[activeWeapon].name.toUpperCase()} AMMO` : '', result.grenadeGranted > 0 ? `+1 ${player.selectedGrenade.toUpperCase()}` : ''].filter(Boolean).join(' · ');
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
  const nearbyRailgun = player.alive && railgunPickupNearby();
  const nearby = player.alive && !nearbyRailgun && !nearbyStation
    ? nearestDeathDrop(candidates, player.position, DEATH_DROP_INTERACTION_RANGE, now, 'weapon')
    : null;
  const prompt = element<HTMLElement>('#pickup-prompt');
  prompt.hidden = !nearbyRailgun && !nearby && !nearbyStation;
  if (nearbyRailgun) {
    prompt.querySelector<HTMLElement>('span')!.textContent = 'TAP · PICK UP';
    prompt.querySelector<HTMLElement>('strong')!.textContent = WEAPONS.railgun.name.toUpperCase();
  } else if (nearbyStation) {
    const replenish = rangePrimaryUnlocked && nearbyStation.weapon === player.primaryWeapon;
    prompt.querySelector<HTMLElement>('span')!.textContent = replenish ? 'TAP · REFILL' : 'TAP · EQUIP';
    prompt.querySelector<HTMLElement>('strong')!.textContent = WEAPONS[nearbyStation.weapon].name.toUpperCase();
  } else if (nearby) {
    const replenish = nearby.weapon === player.primaryWeapon;
    prompt.querySelector<HTMLElement>('span')!.textContent = replenish ? 'TAP · REPLENISH' : 'TAP · PICK UP';
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
  const grenadeAuthority = remoteGrenadeAuthorities.get(message.by);
  const expectedGrenadeGranted = message.mode === 'scavenge' && grenadeAuthority?.remaining === 0 ? 1 : 0;
  if (!pointInsideBounds(position, arena.bounds, 0.44)
    || position.distanceTo(senderPosition) > 2.8
    || !validDropDistance
    || message.mode === 'scavenge' && !deathDropAmmoAvailable(entity.drop, now)
    || message.mode === 'weapon' && (!isPrimaryWeaponId(message.weapon) || !deathDropWeaponAvailable(entity.drop, now))
    || message.selectedGrenade !== remote.snapshot.grenade
    || message.grenadeGranted !== expectedGrenadeGranted) return;
  processedNonces.add(message.nonce);
  if (message.mode === 'scavenge') {
    entity.drop = { ...entity.drop, ammoConsumedAt: now };
    if (grenadeAuthority && message.grenadeGranted === 1) {
      remoteGrenadeAuthorities.set(message.by, replenishRemoteGrenadeAuthorityState(grenadeAuthority));
    }
  } else {
    if (!isPrimaryWeaponId(message.weapon)) return;
    entity.drop = { ...entity.drop, weaponConsumedAt: now };
    authorizedRemotePickups.set(message.by, { weapon: message.weapon, expiresAt: now + 2_000 });
    setOperatorWeapon(remote.root.userData.operator as THREE.Group, message.weapon, flattenOperatorMaterials, scheduleDeferredGpuRetirement);
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

function deterministicWindowUnit(windowId: string, salt: number): number {
  let hash = 0x811c9dc5 ^ salt;
  for (let index = 0; index < windowId.length; index += 1) {
    hash ^= windowId.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function persistentWindowDebrisId(windowId: string): string {
  const canonical = windowId.toLowerCase().replace(/[^a-z0-9:-]/g, '-').slice(0, 104);
  return `window-debris:${canonical}`;
}

function spawnPersistentWindowDebris(window: ArenaMap['breakableWindows'][number], normal: THREE.Vector3): void {
  const id = persistentWindowDebrisId(window.id);
  if (persistentWindowDebris.has(id)) return;
  const counts = Object.freeze({
    shed: interactiveWorldRuntime?.shedMajorBodyCount() ?? 0,
    house: interactiveWorldRuntime?.houseMajorBodyCount() ?? 0,
    window: persistentWindowDebris.size,
  });
  if (!canAdmitMajorDebris(counts, 'window')) return;

  window.mesh.updateWorldMatrix(true, false);
  window.mesh.geometry.computeBoundingBox();
  const localSize = window.mesh.geometry.boundingBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1.4, 1.2, 0.04);
  const worldScale = window.mesh.getWorldScale(new THREE.Vector3());
  const halfExtents = Object.freeze({
    x: Math.max(0.12, localSize.x * Math.abs(worldScale.x) * 0.34),
    y: Math.max(0.12, localSize.y * Math.abs(worldScale.y) * 0.32),
    z: Math.max(0.025, localSize.z * Math.abs(worldScale.z) * 0.55),
  });
  const centre = window.mesh.getWorldPosition(new THREE.Vector3());
  const paneRotation = window.mesh.getWorldQuaternion(new THREE.Quaternion());
  const direction = normal.lengthSq() > 1e-6 ? normal.clone().normalize() : new THREE.Vector3(0, 0.15, 1).normalize();
  centre.addScaledVector(direction, Math.max(0.06, halfExtents.z * 1.4));

  const root = createFracturedWindowDebrisVisual({ id, halfExtents, reducedRenderMode });
  root.position.copy(centre);
  root.quaternion.copy(paneRotation);
  root.userData.persistentMajorDebris = true;
  root.userData.windowId = window.id;
  scene.add(root);

  const definition: MajorDebrisBodyDefinition = Object.freeze({
    id,
    position: Object.freeze({ x: centre.x, y: centre.y, z: centre.z }),
    rotation: Object.freeze({ x: paneRotation.x, y: paneRotation.y, z: paneRotation.z, w: paneRotation.w }),
    halfExtents,
    linearVelocity: Object.freeze({
      x: direction.x * (1.8 + deterministicWindowUnit(window.id, 1) * 1.2),
      y: 1.1 + deterministicWindowUnit(window.id, 2) * 1.4,
      z: direction.z * (1.8 + deterministicWindowUnit(window.id, 3) * 1.2),
    }),
    angularVelocity: Object.freeze({
      x: (deterministicWindowUnit(window.id, 4) - 0.5) * 5,
      y: (deterministicWindowUnit(window.id, 5) - 0.5) * 4,
      z: (deterministicWindowUnit(window.id, 6) - 0.5) * 6,
    }),
    sleeping: false,
  });
  persistentWindowDebris.set(id, { id, windowId: window.id, root, definition });
  syncInteractiveWorldPhysics();
}

function clearPersistentWindowDebris(): void {
  for (const entry of persistentWindowDebris.values()) scheduleDeferredGpuRetirement(entry.root);
  persistentWindowDebris.clear();
  syncInteractiveWorldPhysics();
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
  if (!window) return false;
  const state = window.glassState?.matchEpoch === interactiveWorldMatchEpoch
    ? window.glassState
    : createGlassState(window.id, interactiveWorldMatchEpoch);
  const profile: GlassImpactProfile = kind === 'explosive' ? 'explosion' : kind === 'knife' ? 'knife' : 'bullet';
  const impactId = `${profile}:${player.id}:${actionNonce ?? randomNonce()}:${state.revision}`;
  const result = admitGlassImpact(state, {
    // Network-originated mutations reach this point only after the existing
    // host/replica admission checks. Offline/local host actions are authority.
    isHost: true,
    matchEpoch: interactiveWorldMatchEpoch,
    expectedRevision: state.revision,
    impactId,
    tick: interactiveWorldTick,
    profile,
  });
  if (!result.accepted) return false;
  window.glassState = result.state;
  const projection = glassAuthorityProjection(result.state);
  invalidateActiveWorldCollisionCache();
  if (!projection.apertureOpen) {
    window.broken = false;
    window.mesh.visible = projection.paneVisible;
    syncInteractiveWorldPhysics();
    return true;
  }
  if (window.broken) return false;
  spawnPersistentWindowDebris(window, normal);
  window.broken = true;
  window.mesh.visible = projection.paneVisible;
  syncInteractiveWorldPhysics();
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
    network.send(network.role === 'host' ? canonicalHostWindowBreak(message, performance.now()) : message);
  }
  return true;
}

function canonicalHostWindowBreak(message: WindowBreakMessage, now: number): WindowBreakMessage {
  const sticky = message.kind === 'explosive' && Number.isFinite(message.actionNonce)
    ? hostStickyVerificationForAction(message.by, 'semtex', message.actionNonce!, message.origin, now)
    : null;
  const attachment = sticky?.verification.status === 'verified' ? sticky.verification.attachment : null;
  const { hostAuthority: _untrustedHostAuthority, ...untrustedMessage } = message;
  return {
    ...untrustedMessage,
    ...(attachment?.detonationOrigin ? { origin: [...attachment.detonationOrigin] as [number, number, number] } : {}),
    hostAuthority: {
      hostId: player.id,
      stickyAttachment: attachment ? verifiedStickyAttachment(attachment) : null,
    },
  };
}

function acceptRemoteWindowBreak(message: WindowBreakMessage): void {
  if (message.by === player.id || processedNonces.has(message.nonce)) return;
  if (network.role === 'client') {
    if (!message.hostAuthority || message.hostAuthority.hostId !== privateLobbySnapshot?.hostId) return;
  } else if (message.hostAuthority !== undefined) {
    return;
  }
  const remote = remotes.get(message.by);
  const window = arena.breakableWindows.find((candidate) => candidate.id === message.windowId);
  if (!remote || !window || window.broken) return;
  const sender = new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z);
  const centre = window.mesh.getWorldPosition(new THREE.Vector3());
  const explosive = message.kind === 'explosive';
  const grenadeAuthority = explosive ? remoteGrenadeAuthorities.get(message.by) : undefined;
  const grenade = explosive && grenadeAuthority && Number.isFinite(message.actionNonce)
    ? remoteGrenadeForAction(grenadeAuthority, message.actionNonce!)
    : null;
  const now = performance.now();
  const hostSticky = network.role === 'host' && grenade === 'semtex' && Number.isFinite(message.actionNonce)
    ? hostStickyVerificationForAction(message.by, 'semtex', message.actionNonce!, message.origin, now)
    : null;
  const hostVerifiedRecord = hostSticky?.verification.status === 'verified' ? hostSticky.verification.attachment : null;
  const clientVerifiedAttachment = network.role === 'client' ? message.hostAuthority?.stickyAttachment ?? null : null;
  if (clientVerifiedAttachment && (!explosive || grenade !== 'semtex')) return;
  const verifiedStuck = hostVerifiedRecord !== null || clientVerifiedAttachment !== null;
  const canonicalOriginTuple = hostVerifiedRecord?.detonationOrigin ?? message.origin;
  const origin = new THREE.Vector3(...canonicalOriginTuple);
  const explosiveRadius = grenade === 'semtex' ? semtexBlastRadiusM(verifiedStuck) : GRENADE_RADIUS;
  const senderOriginLimit = explosive ? 36 : 2.8;
  const shotDelta = centre.clone().sub(origin);
  const shotTrace = explosive ? null : traceWeaponPath(origin, shotDelta, shotDelta.length(), remote.snapshot.weapon);
  if (!pointInsideBounds(origin, arena.bounds, 0.44)
    || origin.distanceTo(sender) > senderOriginLimit
    || explosive && origin.distanceTo(centre) > explosiveRadius + 0.5
    || !explosive && origin.distanceTo(centre) > 110
    || explosive && windowBreakPathBlocked(origin, centre, activeWorldColliders())
    || !explosive && !shotTrace?.reachedDistance) {
    if (network.role === 'host' && explosive && grenade === 'semtex'
      && hostSticky?.verification.status === 'pending'
      && pointInsideBounds(new THREE.Vector3(...message.origin), arena.bounds, 0.44)
      && new THREE.Vector3(...message.origin).distanceTo(sender) <= senderOriginLimit
      && new THREE.Vector3(...message.origin).distanceTo(centre) <= semtexBlastRadiusM(true) + 0.5
      && !windowBreakPathBlocked(new THREE.Vector3(...message.origin), centre, activeWorldColliders())) {
      for (const [nonce, pending] of pendingStickyWindowBreaks) {
        if (now - pending.queuedAtMs > PENDING_STICKY_HIT_LIFETIME_MS) pendingStickyWindowBreaks.delete(nonce);
      }
      if (!pendingStickyWindowBreaks.has(message.nonce)) {
        if (pendingStickyWindowBreaks.size >= PENDING_STICKY_HIT_LIMIT) {
          const oldest = pendingStickyWindowBreaks.keys().next().value;
          if (oldest !== undefined) pendingStickyWindowBreaks.delete(oldest);
        }
        pendingStickyWindowBreaks.set(message.nonce, Object.freeze({
          message: Object.freeze({ ...message }),
          queuedAtMs: now,
          ownerLifeId: hostSticky.ownerLifeId,
        }));
      }
    }
    return;
  }
  if (explosive && !localMultiplayerQa) {
    if (!grenadeAuthority || !Number.isFinite(message.actionNonce)) return;
    const admission = admitRemoteGrenadeExplosion(grenadeAuthority, {
      actionNonce: message.actionNonce!,
      explosionOrigin: canonicalOriginTuple,
      now,
    });
    if (!admission.accepted) return;
    remoteGrenadeAuthorities.set(message.by, admission.state);
  }
  processedNonces.add(message.nonce);
  const normal = centre.clone().sub(origin).normalize().multiplyScalar(-1);
  breakHouseWindow(message.windowId, centre, normal, false, origin);
  if (network.role === 'host') network.send(canonicalHostWindowBreak({ ...message, origin: canonicalOriginTuple as [number, number, number] }, now), message.by);
  trimNonceSet();
}

function resetBreakableWindows(): void {
  clearPersistentWindowDebris();
  for (const window of arena.breakableWindows) {
    window.glassState = createGlassState(window.id, interactiveWorldMatchEpoch);
    window.broken = false;
    window.mesh.visible = true;
  }
  syncInteractiveWorldPhysics(true);
}

const CORPSE_LIFETIME_MS = 7_500;
const MAX_CORPSE_PRESENTATIONS = 12;
const CORPSE_POOL_CAPACITY_PER_TEAM = 4;
const corpsePresentations: Array<{ root: THREE.Group; expiresAt: number }> = [];
const corpsePresentationPool: Array<{ root: THREE.Group; team: Team; inUse: boolean }> = [];
const deferredDeathPresentations: Array<{
  victimId: string;
  source: CorpseSource | null;
  death: DeathMessage;
  now: number;
  matchEpoch: number;
}> = [];
let deferredDeathPresentationTimer: ReturnType<typeof setTimeout> | null = null;

function drainDeferredDeathPresentation(): void {
  deferredDeathPresentationTimer = null;
  const pending = deferredDeathPresentations.shift();
  if (!pending) return;
  if (pending.matchEpoch === interactiveWorldMatchEpoch && gameStarted) {
    spawnCorpsePresentation(pending.victimId, pending.source, performance.now());
    spawnDeathDrop(pending.death, pending.now);
  }
  if (deferredDeathPresentations.length > 0) {
    deferredDeathPresentationTimer = globalThis.setTimeout(drainDeferredDeathPresentation, 48);
  }
}

function deferDeathPresentation(victimId: string, source: CorpseSource | null, death: DeathMessage, now: number): void {
  deferredDeathPresentations.push({ victimId, source, death, now, matchEpoch: interactiveWorldMatchEpoch });
  if (deferredDeathPresentationTimer === null) {
    deferredDeathPresentationTimer = globalThis.setTimeout(drainDeferredDeathPresentation, 24);
  }
}

function hideCorpseHeldWeapon(root: THREE.Group): void {
  const rig = root.userData.operatorRig as { weapon?: THREE.Object3D; meleeKnife?: THREE.Object3D } | undefined;
  if (rig?.weapon) rig.weapon.visible = false;
  if (rig?.meleeKnife) rig.meleeKnife.visible = false;
}

function prepareCorpsePresentationRoot(root: THREE.Group): void {
  root.userData.presentationOnly = true;
  root.userData.blocksShots = false;
  root.traverse((node) => {
    node.userData.presentationOnly = true;
    node.userData.blocksShots = false;
    if (node instanceof THREE.Mesh) {
      node.castShadow = false;
      node.raycast = () => undefined;
    }
  });
  hideCorpseHeldWeapon(root);
}

async function ensureCorpsePresentationPool(): Promise<void> {
  if (corpsePresentationPool.length > 0) return;
  for (const team of [0, 1] as const) {
    for (let index = 0; index < CORPSE_POOL_CAPACITY_PER_TEAM; index += 1) {
      const root = buildOperator(team, 'prewarmed-fallen-operator', flattenOperatorMaterials, 'carbine');
      await prewarmRiggedOperatorActions(root, RIGGED_OPERATOR_CORPSE_ACTION_NAMES);
      prepareCorpsePresentationRoot(root);
      root.visible = false;
      scene.add(root);
      corpsePresentationPool.push({ root, team, inUse: false });
      await yieldDeploymentPrewarmFrame();
    }
  }
}

function stageCorpsePresentationPoolForPrewarm(): () => void {
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  for (const [index, entry] of corpsePresentationPool.entries()) {
    resetOperator(entry.root);
    hideCorpseHeldWeapon(entry.root);
    entry.root.position.copy(cameraPosition)
      .addScaledVector(forward, 5 + Math.floor(index / 4) * 1.4)
      .addScaledVector(right, (index % 4 - 1.5) * 0.9);
    entry.root.rotation.set(0, Math.PI, 0);
    entry.root.visible = true;
  }
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    for (const entry of corpsePresentationPool) {
      entry.root.visible = false;
      entry.root.position.set(0, 0, 0);
      entry.root.rotation.set(0, 0, 0);
    }
  };
}

async function prewarmExactWebGlMatchComposition(): Promise<void> {
  if (renderRuntime.backend !== 'webgl2' || !atomicSignal) {
    throw new Error('Exact WebGL2 match composition prewarm requires the WebGL2 AtomicSignal pass');
  }
  const priorCameraLayerMask = camera.layers.mask;
  try {
    await withArenaFrustumCullingDisabled(scene, async () => {
      // Keep this identical to the live WebGL2 frame path: world-only first,
      // then the viewmodel layer after clearDepth through AtomicSignalPass.
      atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);
    });
  } finally {
    camera.layers.mask = priorCameraLayerMask;
  }
}

function disposeCorpsePresentation(root: THREE.Group): void {
  const pooled = corpsePresentationPool.find((entry) => entry.root === root);
  if (!pooled) {
    scheduleDeferredGpuRetirement(root);
    return;
  }
  root.visible = false;
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  resetOperator(root);
  hideCorpseHeldWeapon(root);
  pooled.inUse = false;
}

function clearCorpsePresentations(): void {
  deferredDeathPresentations.length = 0;
  if (deferredDeathPresentationTimer !== null) globalThis.clearTimeout(deferredDeathPresentationTimer);
  deferredDeathPresentationTimer = null;
  while (corpsePresentations.length > 0) disposeCorpsePresentation(corpsePresentations.pop()!.root);
}

function updateCorpsePresentations(now: number): void {
  for (let index = corpsePresentations.length - 1; index >= 0; index -= 1) {
    if (now < corpsePresentations[index].expiresAt) continue;
    disposeCorpsePresentation(corpsePresentations[index].root);
    corpsePresentations.splice(index, 1);
  }
}

type CorpseSource = Readonly<{ team: Team; weapon: WeaponId; position: THREE.Vector3; yaw: number }>;

function corpseSource(victimId: string): CorpseSource | null {
  if (victimId === player.id) return {
    team: player.team,
    weapon: player.weapon,
    position: new THREE.Vector3(player.position.x, player.position.y - stanceEyeHeight(player.stance), player.position.z),
    yaw: player.yaw,
  };
  const remote = remotes.get(victimId);
  if (remote) return { team: remote.snapshot.team, weapon: remote.snapshot.weapon, position: remote.target.clone(), yaw: remote.targetYaw };
  const bot = bots.get(victimId);
  if (bot) return { team: bot.team, weapon: bot.weapon, position: bot.position.clone(), yaw: bot.root.rotation.y };
  return null;
}

function spawnCorpsePresentation(victimId: string, source = corpseSource(victimId), now = performance.now()): void {
  if (!source) return;
  let pooled = corpsePresentationPool.find((entry) => entry.team === source.team && !entry.inUse);
  if (!pooled) {
    const recycledIndex = corpsePresentations.findIndex((entry) => (
      corpsePresentationPool.some((candidate) => candidate.root === entry.root && candidate.team === source.team)
    ));
    if (recycledIndex >= 0) {
      const [recycled] = corpsePresentations.splice(recycledIndex, 1);
      disposeCorpsePresentation(recycled!.root);
      pooled = corpsePresentationPool.find((entry) => entry.team === source.team && !entry.inUse);
    }
  }
  if (!pooled) return;
  pooled.inUse = true;
  const root = pooled.root;
  resetOperator(root);
  hideCorpseHeldWeapon(root);
  root.name = 'fallen-operator';
  root.position.copy(source.position);
  root.position.y += 0.08;
  root.rotation.y = source.yaw;
  root.rotation.z = [...victimId].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 2 === 0 ? 1.38 : -1.38;
  root.visible = true;
  deathOperator(root);
  corpsePresentations.push({ root, expiresAt: now + CORPSE_LIFETIME_MS });
  if (corpsePresentations.length > MAX_CORPSE_PRESENTATIONS) disposeCorpsePresentation(corpsePresentations.shift()!.root);
}

function overdriveDropPosition(victimId: string): THREE.Vector3 | null {
  const source = corpseSource(victimId);
  return source ? source.position.clone().setY(source.position.y + OVERDRIVE_POSITION.y) : null;
}

function processDeath(message: DeathMessage): void {
  // Capture the canonical live rig state before authoritative item drops mutate
  // the holder back to their primary weapon.
  const fallenOperatorSource = corpseSource(message.victim);
  if (network.role === 'host') hostTriggerAuthorities.reset(message.victim, 'death');
  const deathSource = message.cause.kind === 'gun'
    ? message.cause.weapon
    : message.cause.kind === 'killstreak'
      ? message.cause.effect
      : message.cause.kind;
  recordMatchDiagnostic('death-authoritative', network.role === 'client' ? 'observed' : 'accepted', {
    actorId: message.killer,
    actorKind: combatantLabel(message.killer).kind,
    targetId: message.victim,
    targetKind: combatantLabel(message.victim).kind,
    weaponOrEffect: deathSource,
    healthAfter: 0,
    reason: 'authoritative-death-transition',
  }, `death-${message.nonce}`);
  const victimPoint = message.victim === player.id ? player.position : remotes.get(message.victim)?.target ?? bots.get(message.victim)?.position;
  if (victimPoint) recordSpawnDeath(victimPoint);
  if (victimPoint && network.role !== 'client') dropHeldRailgun(message.victim, victimPoint.clone().add(new THREE.Vector3(0, 0.3, 0)));
  const killer = message.killer === player.id ? player.name : remotes.get(message.killer)?.snapshot.name ?? bots.get(message.killer)?.name ?? 'Unknown';
  const victim = message.victim === player.id ? player.name : remotes.get(message.victim)?.snapshot.name ?? bots.get(message.victim)?.name ?? 'Unknown';
  spawnCorpsePresentation(message.victim, fallenOperatorSource);
  spawnDeathDrop(message);
  if (message.victim === player.id && player.alive) {
    const now = performance.now();
    interruptReload(true, now);
    cancelFInteractionPress('death', now);
    clearLocalFlashPresentation();
    player.hp = 0;
    player.alive = false;
    if (gameMode === 'solo') player.deaths += 1;
    updateFieldSupportHud();
    renderFieldKitSelection();
    document.exitPointerLock();
  }
  if (message.victim === player.id) scheduleLocalRespawn();
  if (message.killer !== message.victim && isKillstreakEligible(message.cause)) {
    if (network.role === 'host' && message.killer !== player.id) killstreakRuntime.recordEligibleElimination(message.killer, 'weapon');
  }
  const victimAuthority = remoteSupportAuthorities.get(message.victim);
  if (victimAuthority) remoteSupportAuthorities.set(message.victim, recordRemoteSupportDeath(victimAuthority));
  if (network.role === 'host' && message.victim !== player.id) {
    killstreakRuntime.recordActorDeath(message.victim, (remotes.get(message.victim)?.continuity ?? 0) + 1);
    broadcastKillstreakState();
  }
  const victimGrenadeAuthority = remoteGrenadeAuthorities.get(message.victim);
  if (victimGrenadeAuthority) remoteGrenadeAuthorities.set(message.victim, recordRemoteGrenadeDeath(victimGrenadeAuthority));
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
  if (network.role !== 'client') {
    const now = performance.now();
    const dropPosition = overdriveDropPosition(message.victim);
    const drop = dropPosition ? dropOverdriveOnElimination(overdriveState, message.victim, dropPosition, now) : null;
    if (drop?.dropped) {
      overdriveState = drop.state;
      addFeed('2× DAMAGE CORE DROPPED · CLAIM ITS REMAINING TIME', 'gold');
      broadcastOverdriveState(now);
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
  const eliminationFeedText = `${killer} eliminated ${victim}`;
  if (message.cause.kind === 'gun' && message.cause.weapon === 'railgun') {
    railgunDeathPresentationCount += 1;
    railgunDeathPresentations.push({ killerId: message.killer, victimId: message.victim, text: eliminationFeedText });
    if (railgunDeathPresentations.length > 32) railgunDeathPresentations.shift();
  }
  addFeed(eliminationFeedText, message.killer === player.id ? 'gold' : undefined);
  const remote = remotes.get(message.victim);
  if (remote) {
    remote.snapshot = { ...remote.snapshot, hp: 0 };
    remote.root.visible = false;
  }
  const bot = bots.get(message.victim);
  if (bot) bot.root.visible = false;
  checkMatchEnd();
}

function removeRemote(id: string, reason: string, allowRejoinReservation = true): void {
  const remote = remotes.get(id);
  if (!remote) return;
  if (network.role === 'host') dropHeldRailgun(id, remote.target.clone().add(new THREE.Vector3(0, 0.3, 0)));
  scheduleDeferredGpuRetirement(remote.root);
  footstepEmitters.reset(`remote:${id}`);
  remotes.delete(id);
  verifiedRemoteKills.delete(id);
  remoteShotAdmissions.delete(id);
  hostTriggerAuthorities.reset(id, 'disconnect');
  admittedRemoteShots.delete(id);
  admittedRemoteMelees.delete(id);
  admittedRemoteExplosions.delete(id);
  remoteStickyAttachmentAuthority = removeRemoteStickyAttachmentsForActor(remoteStickyAttachmentAuthority, id);
  for (const [nonce, pending] of pendingStickyHits) {
    if (pending.message.by !== id && pending.message.target !== id) continue;
    pendingStickyHits.delete(nonce);
    stickyTimingReplayNonces.delete(nonce);
    incomingCombatRewindMs.delete(nonce);
  }
  for (const [nonce, pending] of pendingStickyWindowBreaks) {
    if (pending.message.by === id) pendingStickyWindowBreaks.delete(nonce);
  }
  const retainCombatAuthority = allowRejoinReservation && shouldRetainRemoteCombatAuthority(
    network.role,
    privateLobbySnapshot?.phase ?? null,
    hostLobbyMembers.has(id),
  );
  if (network.role === 'host' && killstreakRegisteredActors.has(id)) {
    if (retainCombatAuthority) killstreakRuntime.recordActorDisconnect(id);
    else {
      killstreakRuntime.unregisterActor(id);
      killstreakRegisteredActors.delete(id);
    }
    refreshLocalKillstreakSnapshot();
    broadcastKillstreakState();
  }
  if (network.role === 'host' && retainCombatAuthority) markLobbyDisconnected(id);
  if (!retainCombatAuthority) {
    remoteSupportAuthorities.delete(id);
    remoteGrenadeAuthorities.delete(id);
    remoteHealthAuthorities.delete(id);
    remoteFlashVictimLifeIds.delete(id);
    lastAuthoredFlashResults.delete(id);
  }
  peerTimingStates.delete(id);
  remoteMeleeAdmissions.delete(id);
  authorizedRemotePickups.delete(id);
  authorizedRemoteRedeploys.delete(id);
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
  const spawnMode = activeSpawnMode();
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
      .filter((bot) => (spawnMode === 'ffa' || bot.team !== player.team) && bot.alive)
      .map((bot) => bot.position.clone().add(new THREE.Vector3(0, 1.42, 0))),
  ];
  const validForSide = (side: Team) => arena.spawns[side]
    .map((point, localIndex) => ({ point, side, index: side * 100 + localIndex }))
    .filter(({ point }) => {
      const bodyPoint = { x: point.x, y: 0, z: point.z };
      return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
        && pointInsideBounds(bodyPoint, arena.bounds, 0.44)
        && !isBlocked(bodyPoint, activeWorldColliders(), 0.44);
    });
  const home = validForSide(player.team);
  const oppositeTeam: Team = player.team === 0 ? 1 : 0;
  const opposite = validForSide(oppositeTeam);
  if (home.length === 0 && (spawnMode !== 'ffa' || opposite.length === 0)) throw new Error(`No valid authored player spawn for team ${player.team}`);
  const pressure = (options: ReturnType<typeof validForSide>) => {
    const scored = options.map(({ point }) => ({
      visibleThreats: threats.filter((threat) => !activeWorldColliders().some((box) => segmentIntersectsBox(threat, point, box))).length,
      nearestThreatDistanceSq: threats.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...threats.map((threat) => threat.distanceToSquared(point))),
    }));
    const minimumVisibleThreats = Math.min(...scored.map((entry) => entry.visibleThreats));
    return {
      minimumVisibleThreats,
      safestNearestThreatDistanceSq: Math.max(...scored.filter((entry) => entry.visibleThreats === minimumVisibleThreats).map((entry) => entry.nearestThreatDistanceSq)),
    };
  };
  const instantaneousFlip = spawnMode !== 'ffa' && threats.length > 0 && opposite.length > 0 && shouldFlipSpawnSide(pressure(home), pressure(opposite));
  const flipDecision = spawnMode === 'ffa'
    ? { flip: false, state: spawnFlipHysteresis[player.team] }
    : advanceSpawnFlipHysteresis(spawnFlipHysteresis[player.team], instantaneousFlip, performance.now());
  spawnFlipHysteresis[player.team] = flipDecision.state;
  const flipped = flipDecision.flip;
  const valid = spawnMode === 'ffa' ? [...home, ...opposite] : flipped ? opposite : home;
  const minimumSeparationSq = spawnMode === 'ffa' ? FFA_MINIMUM_SPAWN_SEPARATION ** 2 : 20;
  const unoccupied = valid.filter(({ point }) => !otherPlayers.some((position) => position.distanceToSquared(point) < minimumSeparationSq));
  const initialFfaReservation = spawnMode === 'ffa' && lastPlayerSpawnIndex < 0 && privateLobbySnapshot
    ? initialFfaSpawnReservation(
        player.id,
        privateLobbySnapshot.members.filter((member) => member.connected).map((member) => member.id),
        valid,
        stableSpawnTieBreakSeed(`${selectedArena.id}:${privateMatchActiveAtHostTimeMs ?? 0}`),
      )
    : null;
  const reserved = initialFfaReservation === null
    ? []
    : valid.filter(({ index }) => index === initialFfaReservation);
  const selectable = reserved.length > 0 ? reserved : unoccupied.length > 0 ? unoccupied : valid;
  const candidates = selectable.map(({ point, index }) => ({
    index,
    point,
    nearestPlayerDistanceSq: otherPlayers.length === 0
      ? Number.POSITIVE_INFINITY
      : Math.min(...otherPlayers.map((other) => other.distanceToSquared(point))),
    visibleThreats: threats.filter((threat) => !activeWorldColliders().some((box) => segmentIntersectsBox(threat, point, box))).length,
  }));
  const previousIndex = lastPlayerSpawnIndex;
  const population = otherPlayers.length + 1;
  const selection = scoreSpawnCandidates({
    arenaId: selectedArena.id,
    mode: spawnMode,
    population,
    candidates: candidates.map(({ index, point }) => ({ index, point })),
    threats,
    occupants: otherPlayers,
    recentDeaths: recentSpawnDeathPoints(),
    colliders: activeWorldColliders(),
    previousIndex,
    tieBreakSeed: stableSpawnTieBreakSeed(player.id),
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
    modifiers: [
      spawnMode,
      `population:${population}`,
      initialFfaReservation === null ? 'dynamic-selection' : 'initial-roster-reservation',
      flipped ? 'spawn-flipped' : 'home-side',
    ],
  });
  lastPlayerSpawnIndex = selectedIndex;
  return selectedSpawn.point.clone();
}

function syncMenuLifecyclePresentation(): void {
  const pausedMatch = menuLifecycle.surface === 'paused-match';
  const deploying = menuLifecycle.surface === 'deploying';
  // Deployment owns a dedicated full-screen prerecorded-video surface which
  // sits outside #menu. Keeping the menu in layout while merely inert/aria-
  // hidden lets it flash behind the transition and makes browser visibility
  // semantics disagree with the lifecycle contract.
  const menuVisible = menuLifecycle.surface !== 'hidden' && !deploying;
  menu.classList.toggle('hidden', !menuVisible);
  menu.inert = !menuVisible;
  menu.setAttribute('aria-hidden', String(!menuVisible));
  menu.dataset.lifecycleSurface = menuLifecycle.surface;
  menu.dataset.lifecycleReason = menuLifecycle.reason;
  menu.dataset.pointerLock = menuLifecycle.pointerLock;
  menu.dataset.pointerRequestSource = menuLifecycle.requestSource ?? 'none';
  menu.dataset.lifecycleEvents = String(menuLifecycle.eventCount);
  menu.dataset.lifecycleTransitions = String(menuLifecycle.transitionCount);
  document.documentElement.dataset.menuLifecycle = menuLifecycle.surface;
  document.documentElement.dataset.pointerLockLifecycle = menuLifecycle.pointerLock;
  menuShowcase.dataset.menuContext = pausedMatch ? 'paused-match' : 'pre-match';
  matchPauseBackdrop.hidden = !pausedMatch;
  deploymentTransition.hidden = !deploying;
  deploymentTransition.setAttribute('aria-hidden', String(!deploying));
  deploymentTransition.dataset.active = String(deploying);
  if (!deploying) {
    if (menuPreviewVideo.parentNode !== menuPreviewVideoHomeAnchor.parentNode && menuPreviewVideoHomeAnchor.parentNode) {
      menuPreviewVideoHomeAnchor.parentNode.insertBefore(menuPreviewVideo, menuPreviewVideoHomeAnchor);
    }
    menuPreviewVideo.classList.remove('deployment-shared-video');
  }
  menuPreviewFrame.hidden = menuLifecycle.surface !== 'pre-match';
  resumeButton.hidden = !pausedMatch;
  mainMenuButton.hidden = !pausedMatch;
}

function prepareDeploymentTransition(): void {
  const preview = menuPreviewVideoDefinition(selectedArena.id);
  delete deploymentTransition.dataset.readyAt;
  delete deploymentTransition.dataset.readyGeneration;
  delete deploymentTransition.dataset.readyPresentedGameplayFrame;
  deploymentTransitionPoster.src = preview.poster;
  deploymentTransitionPoster.width = preview.width;
  deploymentTransitionPoster.height = preview.height;
  deploymentTransitionPoster.hidden = false;
  deploymentTransitionVideo.hidden = true;
  const reducedMotion = accessibilityRuntime.reducedMotion;
  if (!reducedMotion) {
    // Reuse the already-buffered menu element. Starting a second VP9/H264
    // decoder while the selected arena streams caused avoidable deployment
    // hitching on lower-performance machines.
    menuPreviewVideo.classList.add('deployment-shared-video');
    deploymentTransition.insertBefore(menuPreviewVideo, deploymentTransition.querySelector('.deployment-transition-scrim'));
    deploymentTransitionPoster.hidden = menuPreviewVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    void menuPreviewVideo.play().catch(() => { deploymentTransitionPoster.hidden = false; });
  }
  deploymentTransitionTitle.textContent = selectedArena.displayName.toUpperCase();
  deploymentTransitionStatus.textContent = `Preparing ${selectedArena.displayName} authoritative arena state…`;
  deploymentTransition.dataset.arena = selectedArena.id;
  deploymentTransition.dataset.presentation = preview.presentationId;
  deploymentTransition.dataset.media = reducedMotion ? 'reduced-motion-poster' : 'shared-prerecorded-video';
  deploymentTransition.dataset.liveRender = 'false';
  deploymentTransition.dataset.statusKind = 'ok';
}

function applyMenuLifecycle(event: MenuLifecycleEvent): void {
  menuLifecycle = reduceMenuLifecycle(menuLifecycle, event);
  syncMenuLifecyclePresentation();
}

function resetMatchPauseBackdrop(): void {
  matchPauseFrameFallback.hidden = true;
  matchPauseFrameFallback.width = 1;
  matchPauseFrameFallback.height = 1;
  matchPauseBackdrop.dataset.frameProvenance = 'game-canvas-css-compositor';
  matchPauseBackdrop.dataset.captureStatus = 'empty';
  matchPauseBackdrop.dataset.captureReason = 'none';
  matchPauseBackdrop.dataset.sourceCanvas = 'none';
  matchPauseBackdrop.dataset.sourceArena = 'none';
  matchPauseBackdrop.dataset.sourceFrame = '0';
  matchPauseBackdrop.dataset.sourceSize = '0x0';
  matchPauseBackdrop.dataset.captureSize = '0x0';
  matchPauseBackdrop.dataset.heldAt = '0';
  matchPauseBackdrop.dataset.capturedFromSurface = menuLifecycle.surface;
  matchPauseBackdrop.dataset.capturedBeforeMenuVisible = 'false';
  matchPauseBackdrop.dataset.contract = MATCH_PAUSE_BACKDROP_CONTRACT;
  matchPauseBackdrop.dataset.periodicReadbackCount = '0';
  matchPauseBackdrop.dataset.sourceCaptureAttemptCount = String(matchPauseSourceCaptureAttemptCount);
  matchPauseBackdrop.dataset.sourceCaptureCount = String(matchPauseSourceCaptureCount);
  matchPauseBackdrop.dataset.presentationCount = String(matchPauseBackdropPresentationCount);
  matchPauseBackdrop.dataset.fallbackCount = String(matchPauseBackdropFallbackCount);
}

function pauseBackdropCompositorSupported(): boolean {
  try {
    return CSS.supports('backdrop-filter', 'blur(1px)')
      || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  } catch {
    return false;
  }
}

function presentPauseOnlyWebGlBackdrop(reason: 'escape' | 'debug-pause'): boolean {
  if (renderRuntime.backend !== 'webgl2' || !atomicSignal) return false;
  const sourceWidth = Math.max(1, canvas.width);
  const sourceHeight = Math.max(1, canvas.height);
  const scale = Math.min(
    1,
    MATCH_PAUSE_FALLBACK_MAX_WIDTH / sourceWidth,
    MATCH_PAUSE_FALLBACK_MAX_HEIGHT / sourceHeight,
  );
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  matchPauseFrameFallback.width = width;
  matchPauseFrameFallback.height = height;
  // WebGL drawing buffers are not reliably preserved after presentation. One
  // fresh pause-only submission keeps this copy current without any gameplay-
  // loop polling or periodic GPU readback.
  atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);
  matchPauseSourceCaptureAttemptCount += 1;
  matchPauseFrameFallbackContext.drawImage(canvas, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
  matchPauseSourceCaptureCount += 1;
  matchPauseBackdropPresentationCount += 1;
  const heldAt = performance.now();
  matchPauseFrameFallback.hidden = false;
  matchPauseBackdrop.dataset.frameProvenance = 'pause-only-renderer-canvas';
  matchPauseBackdrop.dataset.captureStatus = 'pause-snapshot';
  matchPauseBackdrop.dataset.captureReason = reason;
  matchPauseBackdrop.dataset.sourceCanvas = canvas.id;
  matchPauseBackdrop.dataset.sourceArena = selectedArena.id;
  matchPauseBackdrop.dataset.sourceFrame = String(lastGameplayPresentedFrame);
  matchPauseBackdrop.dataset.sourceSize = `${sourceWidth}x${sourceHeight}`;
  matchPauseBackdrop.dataset.captureSize = `${width}x${height}`;
  matchPauseBackdrop.dataset.heldAt = heldAt.toFixed(3);
  matchPauseBackdrop.dataset.capturedFromSurface = menuLifecycle.surface;
  matchPauseBackdrop.dataset.capturedBeforeMenuVisible = String(
    menuLifecycle.surface === 'hidden' && menu.classList.contains('hidden'),
  );
  matchPauseBackdrop.dataset.contract = MATCH_PAUSE_BACKDROP_CONTRACT;
  matchPauseBackdrop.dataset.periodicReadbackCount = '0';
  matchPauseBackdrop.dataset.sourceCaptureAttemptCount = String(matchPauseSourceCaptureAttemptCount);
  matchPauseBackdrop.dataset.sourceCaptureCount = String(matchPauseSourceCaptureCount);
  matchPauseBackdrop.dataset.presentationCount = String(matchPauseBackdropPresentationCount);
  matchPauseBackdrop.dataset.fallbackCount = String(matchPauseBackdropFallbackCount);
  menuPreviewLabel.textContent = `HELD GAMEPLAY // ${selectedArena.displayName}`;
  menuPreviewMotion.textContent = 'PAUSE-ONLY FRAME // MATCH PAUSED';
  return true;
}

function renderSafePauseBackdropFallback(reason: 'escape' | 'debug-pause', failure: unknown): void {
  const heldAt = performance.now();
  matchPauseBackdropFallbackCount += 1;
  matchPauseFrameFallback.hidden = true;
  matchPauseBackdrop.dataset.frameProvenance = 'generated-safe-fallback';
  matchPauseBackdrop.dataset.captureStatus = 'fallback';
  matchPauseBackdrop.dataset.captureReason = reason;
  matchPauseBackdrop.dataset.sourceCanvas = 'none';
  matchPauseBackdrop.dataset.sourceArena = selectedArena.id;
  matchPauseBackdrop.dataset.sourceFrame = '0';
  matchPauseBackdrop.dataset.sourceSize = '0x0';
  matchPauseBackdrop.dataset.captureSize = '0x0';
  matchPauseBackdrop.dataset.heldAt = heldAt.toFixed(3);
  matchPauseBackdrop.dataset.capturedFromSurface = menuLifecycle.surface;
  matchPauseBackdrop.dataset.capturedBeforeMenuVisible = String(
    menuLifecycle.surface === 'hidden' && menu.classList.contains('hidden'),
  );
  matchPauseBackdrop.dataset.contract = MATCH_PAUSE_BACKDROP_CONTRACT;
  matchPauseBackdrop.dataset.periodicReadbackCount = '0';
  matchPauseBackdrop.dataset.sourceCaptureAttemptCount = String(matchPauseSourceCaptureAttemptCount);
  matchPauseBackdrop.dataset.sourceCaptureCount = String(matchPauseSourceCaptureCount);
  matchPauseBackdrop.dataset.presentationCount = String(matchPauseBackdropPresentationCount);
  matchPauseBackdrop.dataset.fallbackCount = String(matchPauseBackdropFallbackCount);
  menuPreviewLabel.textContent = `HELD GAMEPLAY UNAVAILABLE // ${selectedArena.displayName}`;
  menuPreviewMotion.textContent = 'SAFE VISUAL FALLBACK';
  console.warn('[Pass 65 menu backdrop used safe fallback]', failure);
}

function presentActiveMatchBackdrop(reason: 'escape' | 'debug-pause'): boolean {
  let pauseOnlyCaptureFailure: unknown = null;
  try {
    if (lastGameplayPresentedFrame <= 0) throw new Error('No presented gameplay frame is available');
    if (renderRuntime.backend === 'webgl2') {
      try {
        if (presentPauseOnlyWebGlBackdrop(reason)) return true;
      } catch (error) {
        pauseOnlyCaptureFailure = error;
      }
    }
    if (!pauseBackdropCompositorSupported()) throw new Error('CSS backdrop compositor is unavailable');
    const heldAt = performance.now();
    matchPauseBackdropPresentationCount += 1;
    matchPauseFrameFallback.hidden = true;
    matchPauseBackdrop.dataset.frameProvenance = 'game-canvas-css-compositor';
    matchPauseBackdrop.dataset.captureStatus = 'compositor';
    matchPauseBackdrop.dataset.captureReason = reason;
    matchPauseBackdrop.dataset.sourceCanvas = canvas.id;
    matchPauseBackdrop.dataset.sourceArena = selectedArena.id;
    matchPauseBackdrop.dataset.sourceFrame = String(lastGameplayPresentedFrame);
    matchPauseBackdrop.dataset.heldAt = heldAt.toFixed(3);
    matchPauseBackdrop.dataset.capturedFromSurface = menuLifecycle.surface;
    matchPauseBackdrop.dataset.capturedBeforeMenuVisible = String(
      menuLifecycle.surface === 'hidden' && menu.classList.contains('hidden'),
    );
    matchPauseBackdrop.dataset.contract = MATCH_PAUSE_BACKDROP_CONTRACT;
    matchPauseBackdrop.dataset.periodicReadbackCount = '0';
    matchPauseBackdrop.dataset.sourceCaptureAttemptCount = String(matchPauseSourceCaptureAttemptCount);
    matchPauseBackdrop.dataset.sourceCaptureCount = String(matchPauseSourceCaptureCount);
    matchPauseBackdrop.dataset.presentationCount = String(matchPauseBackdropPresentationCount);
    matchPauseBackdrop.dataset.fallbackCount = String(matchPauseBackdropFallbackCount);
    menuPreviewLabel.textContent = `HELD GAMEPLAY // ${selectedArena.displayName}`;
    menuPreviewMotion.textContent = 'CSS COMPOSITOR BLUR // MATCH PAUSED';
    return true;
  } catch (error) {
    renderSafePauseBackdropFallback(reason, pauseOnlyCaptureFailure ?? error);
    return false;
  }
}

function openActiveMatchPause(reason: 'escape' | 'debug-pause'): void {
  if (!gameStarted || !player.alive || matchFinished || menuLifecycle.surface === 'paused-match') return;
  cancelFInteractionPress('pause');
  clearGameplayInput();
  presentActiveMatchBackdrop(reason);
  applyMenuLifecycle({ type: 'pause-requested', reason });
  if (document.pointerLockElement === canvas) void document.exitPointerLock();
  requestAnimationFrame(() => resumeButton.focus({ preventScroll: true }));
}

let pointerLockRequestSerial = 0;

function requestGamePointerLock(source: PointerLockRequestSource = 'canvas'): void {
  if (!gameStarted || !player.alive || matchFinished) return;
  applyMenuLifecycle({ type: 'pointer-request', source });
  const requestSerial = ++pointerLockRequestSerial;
  const rejectRequest = (): void => {
    if (requestSerial !== pointerLockRequestSerial || document.pointerLockElement === canvas) return;
    if (menuLifecycle.pointerLock !== 'requesting') return;
    applyMenuLifecycle({ type: 'pointer-rejected' });
    setStatus('Mouse capture was blocked. Click the match to retry.', 'warn');
  };
  try {
    const request = canvas.requestPointerLock();
    if (request instanceof Promise) void request.catch(rejectRequest);
  } catch {
    // Browsers can reject pointer lock outside a user gesture (for example, auto-join smoke tests).
    rejectRequest();
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

function respawn(
  requestLock = true,
  forceNewLife = false,
  deploymentOverride?: CombatLoadoutSelection,
  pointerLockSource: PointerLockRequestSource = 'respawn',
  broadcastState = true,
): void {
  const startsNewLife = !player.alive || forceNewLife;
  if (startsNewLife) {
    localContinuity += 1;
    localPositionHistory.length = 0;
    resetFlashVictimLife();
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
  player.grenades = 1;
  player.reloadState = null;
  player.alive = true;
  respawnEndsAt = 0;
  player.invulnerableUntil = performance.now() + playerSpawnProtectionMs(activeSpawnMode());
  player.yaw = operatorYawToward({ x: player.position.x, z: player.position.z }, { x: 0, z: 0 });
  player.pitch = 0;
  recoilCamera = { pitch: 0, yaw: 0 };
  stanceRecoveryUntil = 0;
  sprintRecoveryUntil = 0;
  deferredFireAt = 0;
  cameraHeightOffset = 0;
  cameraRoll = 0;
  jumpQueuedAt = -10_000;
  const deployment = deploymentOverride ?? activeLoadoutSelection();
  player.selectedGrenade = deployment.grenade;
  footstepEmitters.reset(`local:${player.id}`);
  directionalDamageState = createDirectionalDamageState();
  lowHealthFeedbackState = createLowHealthFeedbackState();
  audio.setLowHealthFeedback({ active: false, severity: 0, vignetteOpacity: 0, breathingGain: 0, heartbeatGain: 0, pulseHz: 0 });
  damageDirectionIndicator.replaceChildren();
  lowHealthVignette.style.setProperty('--low-health-opacity', '0');
  if (selectedArena.id === 'gun-range') {
    rangePrimaryUnlocked = false;
    player.primaryWeapon = 'carbine';
    player.secondaryWeapon = 'pistol';
    const sidearm = handicapSidearm(player.primaryWeapon);
    player.weapon = sidearm;
    player.ammo[sidearm] = WEAPONS[sidearm].mag;
    player.reserve[sidearm] = WEAPONS[sidearm].reserve;
    player.switchingUntil = 0;
    weaponView.setWeapon(sidearm, true);
  } else {
    player.primaryWeapon = deployment.primary;
    player.secondaryWeapon = deployment.secondary;
    for (const weapon of handicapLoadout(deployment.primary)) {
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
  if (gameStarted && requestLock) requestGamePointerLock(pointerLockSource);
  if (broadcastState) network.send(createStateMessage());
}

function applyLocalClassRedeploy(selection: CombatLoadoutSelection, requestLock: boolean): void {
  if (!gameStarted || matchFinished || !player.alive || selectedArena.id === 'gun-range') return;
  dropHeldRailgun(player.id, player.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
  respawn(requestLock, true, selection);
  setStatus(`Redeployed with ${WEAPONS[selection.primary].name} without a combat death.`, 'ok');
}

async function startGame(mode: 'solo' | 'host' | 'client', requestLock = true, activeAtLocalMonoMs?: number): Promise<void> {
  if (gameStarted || matchStartPreparing) return;
  if (mode !== 'solo' && !selectedArena.multiplayer) {
    setStatus(`${selectedArena.displayName} is solo-only.`, 'warn');
    return;
  }
  const requiredName = requirePlayerName();
  if (!requiredName) return;
  matchStartPreparing = true;
  matchWebGpuQualityFrozen = false;
  matchAdmissionGeneration += 1;
  lastGameplayPresentedFrame = 0;
  lastMatchAdmissionCadence = null;
  lastWebGlReadyPrime = null;
  prepareDeploymentTransition();
  applyMenuLifecycle({ type: 'match-start' });
  syncMenuPreviewCanvasPlacement();
  try {
  const requestedArenaId = selectedArena.id;
  if (!gameplayArenaPrepared || arena.id !== requestedArenaId) {
    setStatus(`Streaming ${selectedArena.displayName} gameplay for deployment…`);
    await activateArenaSelection(requestedArenaId, true);
    if (!gameplayArenaPrepared || arena.id !== requestedArenaId) {
      const arenaTransitionDetail = arenaTransitionFailure ? `: ${arenaTransitionFailure}` : '';
      throw new Error(`Selected arena ${requestedArenaId} did not commit before match start${arenaTransitionDetail}`);
    }
  }
  bootstrapStage = 'prewarming-weapon-catalog';
  const matchStartWeapon = selectedArena.id === 'gun-range'
    ? gunRangeSidearmForWeaponPrewarm()
    : activeLoadoutSelection().primary;
  await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(
    selectedArena.id,
    gunRangeSidearmForWeaponPrewarm(),
  ));
  await weaponView.prepareBrowserWeapon(matchStartWeapon);
  weaponView.setWeapon(player.weapon, true);
  killstreakLoadoutController.releaseAfterMatch();
  const frozenKillstreakLoadout = killstreakLoadoutController.freezeAtMatchStart();
  gamepadSupportSelection = frozenKillstreakLoadout.slots[0];
  syncFieldSupportRows(frozenKillstreakLoadout);
  killstreakMenuBinding.setMatchActive(true);
  cancelFInteractionPress('epoch-change');
  killstreakMatchEpoch = mode === 'solo'
    ? killstreakMatchEpoch + 1
    : Math.max(1, Math.floor(privateMatchActiveAtEpochMs ?? Date.now()) % 1_000_000_000);
  interactiveWorldMatchEpoch = killstreakMatchEpoch;
  remoteStickyAttachmentAuthority = createRemoteStickyAttachmentAuthorityState();
  pendingStickyHits.clear();
  pendingStickyWindowBreaks.clear();
  stickyTimingReplayNonces.clear();
  impactPresentation.resetForRound();
  smokeVolumePresentationPool.clear();
  smokeVolumes.length = 0;
  smokeAuthority.reset(interactiveWorldMatchEpoch, mode === 'client' ? 'replica' : 'host');
  lastSmokeStateBroadcastRevision = -1;
  lastSmokeStateBroadcastAt = Number.NEGATIVE_INFINITY;
  flashHostAuthority.reset(interactiveWorldMatchEpoch, mode === 'client' ? 'replica' : 'host');
  lastAuthoredFlashResults.clear();
  remoteFlashVictimLifeIds.clear();
  lastFlashDispatch = null;
  interactiveWorldTick = 0;
  lastInteractiveWorldBroadcastRevision = -1;
  if (interactiveWorldRuntime) {
    const priorEpoch = interactiveWorldRuntime.telemetry().matchEpoch;
    if (interactiveWorldMatchEpoch > priorEpoch) interactiveWorldRuntime.reset(interactiveWorldMatchEpoch);
    else if (interactiveWorldMatchEpoch < priorEpoch) {
      throw new Error(`Interactive-world match epoch regressed (${interactiveWorldMatchEpoch} < ${priorEpoch})`);
    }
    interactiveWorldRuntime.setHostAuthority(mode !== 'client');
    syncInteractiveWorldPhysics(true);
  }
  killstreakRuntime = new HostKillstreakRuntime(killstreakMatchEpoch);
  killstreakActivationSequence = 0;
  killstreakControlSequence = 0;
  localCareCaptureState = createCareCaptureClientState();
  displayedCareReward = null;
  appliedKillstreakDamageResults.clear();
  killstreakRegisteredActors.clear();
  killstreakPresentation.clear();
  lastLocalKillstreakSnapshotRefreshAt = Number.NEGATIVE_INFINITY;
  lastSupportRotorAudioRefreshAt = Number.NEGATIVE_INFINITY;
  lastSupportStatusHudRefreshAt = Number.NEGATIVE_INFINITY;
  supportDamageFeedbackTelemetry.reset();
  player.name = requiredName;
  player.team = Number(element<HTMLSelectElement>('#team').value) === 1 ? 1 : 0;
  resetMatchPauseBackdrop();
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
  resetFlashVictimLife();
  if (mode !== 'client') {
    killstreakRuntime.registerActor(player.id, player.team, localContinuity, frozenKillstreakLoadout);
    killstreakRegisteredActors.add(player.id);
  }
  killstreakSnapshot = killstreakRuntime.snapshotFor(mode === 'client' ? null : player.id, performance.now());
  localPositionHistory.length = 0;
  localShotSeq = 0;
  localWeaponSequences.clear();
  localTriggerActionSequence = 0;
  transmittedTriggerHeld = false;
  transmittedTriggerWeapon = null;
  hostTriggerAuthorities.clear('match-reset');
  resolvedShotRequests.clear();
  presentedShotResults.clear();
  processedShotResults.clear();
  processedRailgunShotResults.clear();
  lastAuthoritativeRailgunResult = null;
  railgunQaHeldDeadBots.clear();
  railgunLocalFeedbackPresentations = 0;
  lastRailgunLocalFeedbackSummary = null;
  railgunDeathPresentationCount = 0;
  railgunDeathPresentations.length = 0;
  railgunPresentation.resetBeams();
  authoritativeShotAdmissions.clear();
  for (const key of Object.keys(shotProtocolTelemetry)) delete shotProtocolTelemetry[key];
  localSnapshotRateState = createSnapshotRateState(performance.now());
  interpolationDelayState = createInterpolationDelayState(performance.now());
  lastObservedInterpolationUnderruns = 0;
  lastAuthoredShotTimeline = null;
  lastResolvedShotTimeline = null;
  recentShotResolutionTraces.length = 0;
  shotTimingTelemetry.reset();
  for (const target of arena.targets) {
    target.active = true;
    target.health = target.maxHealth;
    target.respawnAt = 0;
    target.root.visible = true;
  }
  refreshWarningUntil = performance.now() + 6_000;
  weaponView.setPresentationVisible(true);
  gameMode = mode;
  lastPlayerSpawnIndex = -1;
  lastPlayerSpawnAudit = null;
  recentDeathPositions.length = 0;
  lastBotSpawnAudit.clear();
  spawnFlipHysteresis = [createSpawnFlipHysteresis(), createSpawnFlipHysteresis()];
  botsFrozen = false;
  debugBotStanceOverride = null;
  debugBotSpeedOverride = 0;
  // Hold all simulation in a non-active state while newly staged operators
  // compile behind the transition surface. Official match clocks begin only
  // after the first submitted presentation has completed.
  matchState = {
    phase: 'warmup',
    phaseStartedAt: performance.now(),
    endsAt: Number.POSITIVE_INFINITY,
    winner: null,
  };
  if (mode === 'solo') await spawnBots();
  else if (mode === 'host') await spawnBots(privateMatchConfig.hostedBotCount);
  await ensureCorpsePresentationPool();
  const restoreCorpsePoolPrewarm = stageCorpsePresentationPoolForPrewarm();
  // Compile and retire the first complete gameplay presentation while the
  // transition surface still owns the screen. Bot operators, the selected
  // viewmodel and their textures do not exist in the menu-only bootstrap
  // frame; admitting them after the clock starts caused a multi-second WebGPU
  // stall that looked like a frozen match and tripped the fatal watchdog.
  const priorRenderSubmissionPaused = renderSubmissionPaused;
  renderSubmissionPaused = true;
  const matchActiveOverdrivePrewarm = selectedArena.overdrive;
  if (matchActiveOverdrivePrewarm) {
    // The Atomic-only overdrive tree first becomes resident when the countdown
    // ends. Compile that exact visibility/light variant against the completed
    // arena while the transition surface still owns the screen; its earlier
    // root-only bootstrap compile predates the selected arena lighting rig.
    overdriveRoot.visible = true;
    overdriveRoot.scale.setScalar(0.0001);
  }
  try {
    setStatus(`Preparing ${selectedArena.displayName} operators and viewmodel…`);
    if (renderRuntime.backend === 'webgpu') {
      await settleWebGpuPresentation('Initial match');
      restoreCorpsePoolPrewarm();
      // Match-only operators, support pools and their prewarm bookkeeping are
      // created immediately before this boundary. Keep the opaque deployment
      // surface in control until the browser has delivered a full hitch-free
      // second; deferred driver work or a major collection must never spill
      // into the first controllable frame.
      await waitForStableMatchAdmissionCadence();
    } else {
      await prewarmExactWebGlMatchComposition();
      restoreCorpsePoolPrewarm();
      await waitForStableMatchAdmissionCadence();
    }
  } finally {
    restoreCorpsePoolPrewarm();
    renderSubmissionPaused = priorRenderSubmissionPaused;
  }
  // Admission can legitimately span several seconds of cold renderer work.
  // None of that scheduler time may enter the first live simulation delta.
  lastFrame = performance.now();
  accumulator = 0;
  matchWebGpuQualityFrozen = shouldFreezeAdaptiveQualityForMatch(renderRuntime.backend);
  resetWebGpuPresentationEpoch('match admitted', performance.now());
  gameStarted = true;
  const matchRules = currentMatchRules();
  overdriveClaimGeneration = -1;
  overdriveClaimLastSentAt = Number.NEGATIVE_INFINITY;
  overdriveSpawns = 0;
  overdrivePickups = 0;
  overdriveExpiries = 0;
  overdriveRoot.visible = selectedArena.overdrive;
  overdriveRoot.scale.setScalar(0.0001);
  element<HTMLElement>('#overdrive-hud').hidden = true;
  matchFinished = false;
  previousHudScores = [0, 0];
  if (respawnTimer) clearTimeout(respawnTimer);
  respawnTimer = null;
  respawnEndsAt = 0;
  hudRoot.hidden = false;
  element<HTMLElement>('#connection-pill').textContent = selectedArena.id === 'gun-range'
    ? mode === 'solo' ? 'SOLO RANGE' : mode === 'host' ? 'RANGE HOST' : 'RANGE PEER'
    : mode === 'solo' ? (selectedArena.soloBotCount === 1 ? '1V1 BOT' : 'BOT SKIRMISH') : mode === 'host' ? 'HOST' : 'PEER';
  element<HTMLElement>('#match-mode-label').textContent = selectedArena.id === 'gun-range' ? 'SCORE PRACTICE' : selectedArena.id === 'rustworks-1v1' ? (gameMode === 'solo' ? 'RUSTRIG DUEL' : 'RUSTRIG MATCH') : 'TEAM DEATHMATCH';
  element<HTMLElement>('#score-limit').textContent = selectedArena.matchRules.scoreLimit === null ? '—' : String(selectedArena.matchRules.scoreLimit);
  element<HTMLElement>('#aqua-label').textContent = selectedArena.id === 'gun-range' ? 'SCORE' : 'AQUA';
  element<HTMLElement>('#coral-label').textContent = selectedArena.id === 'gun-range' ? 'HITS' : 'CORAL';
  element<HTMLElement>('#support-block').hidden = !selectedArena.fieldSupport;
  element<HTMLElement>('#room-hud').textContent = network.roomCode ? `ROOM ${network.roomCode.slice(0, 8).toUpperCase()}` : '';
  respawn(false, false, undefined, 'match-start', false);
  addFeed(`Welcome to ${arena.label}`, 'gold');
  if (selectedArena.id === 'gun-range') addFeed('100 / 200 / 300 POINT TARGETS · SCORE ATTACK', 'gold');
  // Hide any retained pickup from the previous match. The authoritative
  // railgun schedule is anchored only after the hidden presentation prime.
  railgunPresentation.updateWorld(
    createRailgunAuthorityState('disabled', 0, 0, railgunState.generation),
    performance.now(),
  );
  renderTextChat();
  await primeFinalWebGlMatchPresentation();
  const matchStartedAt = performance.now();
  lastFrame = matchStartedAt;
  accumulator = 0;
  beginMatchDiagnostics(mode, matchStartedAt);
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
  const railgunActiveAt = matchState.phase === 'active' ? matchState.phaseStartedAt : matchState.endsAt;
  initializeRailgunForMatch(railgunActiveAt);
  player.invulnerableUntil = matchStartedAt + playerSpawnProtectionMs(activeSpawnMode());
  if (mode !== 'solo') {
    network.send({ type: 'join', player: snapshot() });
    if (mode === 'client') {
      const loadoutMessage: KillstreakLoadoutIntentMessage = {
        type: 'killstreak-loadout-intent', by: player.id, matchEpoch: killstreakMatchEpoch,
        lifeId: localContinuity, sequence: 0, loadout: frozenKillstreakLoadout, nonce: randomNonce(),
      };
      network.send(loadoutMessage);
    }
    sendLeaderboardSync();
    if (mode === 'host') broadcastOverdriveState(activeAtLocalMonoMs ?? matchStartedAt);
  }
  deploymentTransition.dataset.readyPresentedGameplayFrame = String(lastGameplayPresentedFrame);
  deploymentTransition.dataset.readyGeneration = String(matchAdmissionGeneration);
  deploymentTransition.dataset.readyAt = performance.now().toFixed(3);
  applyMenuLifecycle({ type: 'match-ready' });
  syncMenuPreviewCanvasPlacement();
  if (requestLock) requestGamePointerLock('match-start');
  } catch (error) {
    gameStarted = false;
    clearBots();
    killstreakLoadoutController.releaseAfterMatch();
    killstreakMenuBinding.setMatchActive(false);
    showFatalError(error);
  } finally {
    matchStartPreparing = false;
  }
}

function randomNonce(): number {
  return Math.floor(performance.now() * 1000 + protocolRandom() * 1_000_000);
}

function localHoldsRailgun(state = railgunState): boolean {
  return state.holderId === player.id && (state.status === 'held' || state.status === 'depleted');
}

function syncRailgunHolderPresentation(previous: RailgunAuthorityState, next: RailgunAuthorityState): void {
  if (next.holderId === player.id && previous.holderId !== player.id) {
    interruptReload(true);
    player.weapon = 'railgun';
    player.ammo.railgun = next.roundsRemaining;
    player.reserve.railgun = 0;
    player.switchingUntil = performance.now() + 420;
    weaponView.setWeapon('railgun');
    audio.weaponSwitch();
    addFeed(`${WEAPONS.railgun.name.toUpperCase()} ACQUIRED · ${RAILGUN_TOTAL_ROUNDS} FINITE ROUNDS`, 'gold');
  } else if (previous.holderId === player.id && next.holderId !== player.id && player.weapon === 'railgun') {
    player.weapon = player.primaryWeapon;
    player.switchingUntil = performance.now() + 280;
    weaponView.setWeapon(player.weapon);
  }
  player.ammo.railgun = next.holderId === player.id ? next.roundsRemaining : 0;
  player.reserve.railgun = 0;

  if (previous.holderId && previous.holderId !== next.holderId) {
    const priorRemote = remotes.get(previous.holderId);
    if (priorRemote && priorRemote.snapshot.weapon === 'railgun') {
      priorRemote.snapshot = { ...priorRemote.snapshot, weapon: priorRemote.snapshot.primary };
      setOperatorWeapon(priorRemote.root.userData.operator as THREE.Group, priorRemote.snapshot.primary, flattenOperatorMaterials, scheduleDeferredGpuRetirement);
    }
  }
  if (next.holderId && next.holderId !== player.id) {
    const remote = remotes.get(next.holderId);
    if (remote) {
      remote.snapshot = { ...remote.snapshot, weapon: 'railgun' };
      setOperatorWeapon(remote.root.userData.operator as THREE.Group, 'railgun', flattenOperatorMaterials, scheduleDeferredGpuRetirement);
    }
  }
}

function applyRailgunState(next: RailgunAuthorityState, announce = false): void {
  if (isStaleRailgunAuthorityState(railgunState, next)) return;
  const previous = railgunState;
  railgunState = next;
  syncRailgunHolderPresentation(previous, next);
  if (next.holderId === player.id) localRailgunPendingUntilHostTimeMs = 0;
  if (announce || next.announcementSent && !previous.announcementSent) addFeed(`${WEAPONS.railgun.name.toUpperCase()} SPAWNED`, 'gold');
}

function broadcastRailgunState(reliableCommit = true): void {
  if (network.role !== 'host') return;
  const message: RailgunStateMessage = {
    type: 'railgun-state', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id, state: railgunState, nonce: randomNonce(),
  };
  network.send(message);
  if (reliableCommit) network.sendStateCommitReliably(message);
  lastRailgunStateBroadcastAt = performance.now();
}

function initializeRailgunForMatch(activeAtHostTimeMs: number): void {
  const generation = railgunState.generation + 1;
  const next = network.role === 'client'
    ? createRailgunAuthorityState('disabled', 0, 0, generation)
    : createRailgunAuthorityState(selectedArena.id, activeAtHostTimeMs, gameplayRandom(), generation);
  applyRailgunState(next);
  localRailgunPendingUntilHostTimeMs = 0;
  railgunAdsResetRequired = false;
  railgunRechamberPresentationActive = false;
  resolvedRailgunShots.clear();
  processedRailgunShotResults.clear();
  lastAuthoritativeRailgunResult = null;
  railgunQaHeldDeadBots.clear();
  railgunLocalFeedbackPresentations = 0;
  lastRailgunLocalFeedbackSummary = null;
  railgunDeathPresentationCount = 0;
  railgunDeathPresentations.length = 0;
  railgunPresentation.resetBeams();
  railgunClaimAudit = createRailgunClaimAudit();
  railgunPresentation.updateWorld(railgunState, performance.now());
  if (network.role === 'host') broadcastRailgunState();
}

function railgunPickupNearby(position = player.position): boolean {
  return railgunState.status === 'available' && railgunState.pickupPosition !== null
    && position.distanceTo(new THREE.Vector3(...railgunState.pickupPosition)) <= RAILGUN_PICKUP_RANGE;
}

function interactWithRailgunPickup(now = performance.now()): boolean {
  if (!player.alive || matchState.phase !== 'active' || !railgunPickupNearby()) return false;
  if (network.role === 'client') {
    if (now < localRailgunPendingUntilHostTimeMs) return true;
    const request: RailgunClaimRequestMessage = {
      type: 'railgun-claim-request', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: player.id, generation: railgunState.generation,
      position: player.position.toArray() as [number, number, number], nonce: randomNonce(),
    };
    network.send(request);
    localRailgunPendingUntilHostTimeMs = now + 800;
    setStatus('Railgun pickup requested from host.', 'ok');
    return true;
  }
  const claimed = claimRailgun(railgunState, player.id, railgunState.generation);
  if (!claimed.accepted) return false;
  applyRailgunState(claimed.state);
  recordMatchDiagnostic('railgun-pickup', 'accepted', { actorId: player.id, weaponOrEffect: 'railgun', position: player.position.toArray(), reason: 'host-authoritative-pickup' });
  broadcastRailgunState();
  return true;
}

function dropHeldRailgun(holderId: string, position: THREE.Vector3): boolean {
  if (network.role === 'client') return false;
  const bounded = clampPointToBounds(position, arena.bounds, 0.5);
  const dropped = dropRailgun(railgunState, holderId, [bounded.x, bounded.y, bounded.z]);
  if (!dropped.dropped) return false;
  applyRailgunState(dropped.state);
  addFeed(`${WEAPONS.railgun.name.toUpperCase()} DROPPED · AMMO PRESERVED`, 'gold');
  recordMatchDiagnostic('railgun-drop', 'accepted', { actorId: holderId, weaponOrEffect: 'railgun', position: [bounded.x, bounded.y, bounded.z], reason: 'holder-lifecycle-drop' });
  broadcastRailgunState();
  return true;
}

type RailgunTarget = Readonly<{
  id: string;
  team: Team;
  kind: 'player' | 'bot';
  health: number;
  alive: boolean;
  hostile: boolean;
  position: THREE.Vector3;
}>;

function railgunTargets(shooterId: string, shooterTeam: Team): RailgunTarget[] {
  const targets: RailgunTarget[] = [];
  if (player.id !== shooterId) {
    targets.push({
      id: player.id, team: player.team, kind: 'player', health: player.hp, alive: player.alive,
      hostile: areCombatantsHostile(shooterId, shooterTeam, player.id, player.team),
      position: player.position.clone().add(new THREE.Vector3(0, -0.63, 0)),
    });
  }
  for (const remote of remotes.values()) {
    if (remote.snapshot.id === shooterId) continue;
    targets.push({
      id: remote.snapshot.id, team: remote.snapshot.team, kind: 'player', health: remote.snapshot.hp,
      alive: remote.snapshot.hp > 0,
      hostile: areCombatantsHostile(shooterId, shooterTeam, remote.snapshot.id, remote.snapshot.team),
      position: new THREE.Vector3(remote.snapshot.x, remote.snapshot.y - 0.63, remote.snapshot.z),
    });
  }
  for (const bot of bots.values()) {
    if (bot.id === shooterId) continue;
    targets.push({
      id: bot.id, team: bot.team, kind: 'bot', health: bot.hp, alive: bot.alive,
      hostile: areCombatantsHostile(shooterId, shooterTeam, bot.id, bot.team),
      position: bot.position.clone().add(new THREE.Vector3(0, 0.95, 0)),
    });
  }
  return targets;
}

function selectRailgunTargets(
  shooterId: string,
  shooterTeam: Team,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): { accepted: boolean; targets: ReadonlyArray<{ target: RailgunTarget; distance: number }> } {
  const candidates = railgunTargets(shooterId, shooterTeam);
  const byId = new Map(candidates.map((target) => [target.id, target]));
  const admission = admitRailgunTargets(
    origin.toArray() as [number, number, number],
    direction.toArray() as [number, number, number],
    candidates.map((target) => ({
      target: target.id,
      position: target.position.toArray() as [number, number, number],
      alive: target.alive,
      hostile: target.hostile,
    })),
  );
  if (!admission.accepted) return { accepted: false, targets: [] };
  return {
    accepted: true,
    targets: admission.targets.flatMap(({ target: targetId, distanceMeters }) => {
      const target = byId.get(targetId);
      return target ? [{ target, distance: distanceMeters }] : [];
    }),
  };
}

function applyAuthoritativeRailgunDamage(shooterId: string, target: RailgunTarget, distance: number): RailgunShotResultMessage['outcomes'][number] | null {
  const cause: KillCause = { kind: 'gun', weapon: 'railgun' };
  if (target.id === player.id) {
    const healthBefore = player.hp;
    applyDamage(RAILGUN_DAMAGE, shooterId, 1, false, cause, true);
    const damage = Math.max(0, healthBefore - player.hp);
    return damage > 0 ? {
      target: player.id, damageRequested: RAILGUN_DAMAGE, damageApplied: damage,
      resultingHealth: player.hp, died: !player.alive, distanceMeters: distance,
    } : null;
  }
  const bot = bots.get(target.id);
  if (bot) {
    const damage = applyBotDamage(
      bot,
      RAILGUN_DAMAGE,
      'body',
      cause,
      shooterId,
      { wallbang: true, penetrationMultiplier: 1, distanceMeters: distance },
      false,
      true,
    );
    return damage > 0 ? {
      target: bot.id, damageRequested: RAILGUN_DAMAGE, damageApplied: damage,
      resultingHealth: bot.hp, died: !bot.alive, distanceMeters: distance,
    } : null;
  }
  const remote = remotes.get(target.id);
  const health = remoteHealthAuthorities.get(target.id);
  if (!remote || !health) return null;
  const now = performance.now();
  const applied = applyAuthoritativeRemoteDamage(health, RAILGUN_DAMAGE, now);
  if (!applied.applied) return null;
  remoteHealthAuthorities.set(target.id, applied.state);
  remote.snapshot = { ...remote.snapshot, hp: applied.state.hp };
  remote.root.visible = applied.state.alive;
  recordAuthoritativeRemoteRegeneration(target.id, applied, 'host-remote-health-authority-before-railgun');
  recordDamageEvent({
    actorId: shooterId, targetId: target.id, weaponOrEffect: 'railgun',
    healthBefore: applied.healthBefore, healthAfter: applied.healthAfter,
    damageRequested: applied.damageRequested, damageApplied: applied.damageApplied,
    hitZone: 'body', wallbang: true, penetrationMultiplier: 1, distanceMeters: distance,
    reason: 'host-railgun-authority',
  });
  recordAuthoritativeDamage(shooterId, target.id, applied.damageApplied);
  if (applied.died) {
    const death: DeathMessage = { type: 'death', killer: shooterId, victim: target.id, cause, nonce: randomNonce() };
    processedNonces.add(death.nonce);
    network.send(death);
    processDeath(death);
  }
  return {
    target: target.id, damageRequested: RAILGUN_DAMAGE, damageApplied: applied.damageApplied,
    resultingHealth: applied.healthAfter, died: applied.died, distanceMeters: distance,
  };
}

function presentLocalRailgunFeedback(outcomes: RailgunShotResultMessage['outcomes']): void {
  if (outcomes.length === 0) return;
  railgunLocalFeedbackPresentations += 1;
  const damageApplied = outcomes.reduce((total, outcome) => total + outcome.damageApplied, 0);
  const lethalHits = outcomes.filter((outcome) => outcome.died).length;
  showHitmarker(false);
  showDamageNumber(damageApplied, 'body');
  audio.hit(false);
  roundHitShots += 1;
  roundDamageDealt += damageApplied;
  if (outcomes.length > 1) {
    lastRailgunLocalFeedbackSummary = `RAILGUN MULTI-HIT ×${outcomes.length} · ${Math.round(damageApplied)} DAMAGE${lethalHits > 0 ? ` · ${lethalHits} LETHAL` : ''}`;
    addFeed(lastRailgunLocalFeedbackSummary, 'gold');
  }
}

function presentLocalRailgunTrigger(): void {
  const recoil = computeRecoilImpulse(WEAPONS.railgun, 0, 0.5, { ads: adsHeld, crouched: player.stance === 'crouch', prone: player.stance === 'prone' });
  recoilCamera.pitch = Math.min(0.16, recoilCamera.pitch + recoil.pitch);
  recoilVisual = Math.min(0.24, recoilVisual + recoil.pitch * 4.2);
  weaponView.fire(recoil.pitch);
  weaponView.reload();
  railgunRechamberPresentationActive = true;
}

function railgunReportEmitter(beam: RailgunBeamAuthority, local: boolean): number | { x: number; y: number; z: number } {
  return local ? 0 : { x: beam.start[0], y: beam.start[1], z: beam.start[2] };
}

function presentAuthoritativeRailgunResult(message: RailgunShotResultMessage, local: boolean): boolean {
  const presented = railgunPresentation.presentAcceptedResult(message, performance.now(), local ? 'shooter' : 'peer');
  if (!presented || !message.beam) return false;
  audio.railgunReport(!local, railgunReportEmitter(message.beam, local));
  return true;
}

function railgunResult(
  shooterId: string,
  generation: number,
  shotId: string,
  status: RailgunShotResultMessage['status'],
  reason: RailgunShotResultMessage['reason'],
  outcomes: RailgunShotResultMessage['outcomes'],
  beam: RailgunBeamAuthority | null,
): RailgunShotResultMessage {
  return {
    type: 'railgun-shot-result', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
    by: player.id, forPlayerId: shooterId, generation, shotId, status, reason, outcomes, beam, nonce: randomNonce(),
  };
}

function resolveRailgunShot(request: RailgunShotRequestMessage): RailgunShotResultMessage | null {
  if (network.role !== 'host' || request.by === player.id) return null;
  const cacheKey = `${request.by}:${request.shotId}`;
  const cached = resolvedRailgunShots.get(cacheKey);
  if (cached) {
    network.sendToPlayer(request.by, cached);
    return cached;
  }
  const remote = remotes.get(request.by);
  const health = remoteHealthAuthorities.get(request.by);
  const origin = new THREE.Vector3(...request.origin);
  const direction = new THREE.Vector3(...request.direction);
  const expectedOrigin = remote ? new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z) : null;
  if (!remote || !health?.alive || request.generation !== railgunState.generation || !expectedOrigin
    || origin.distanceTo(expectedOrigin) > 2.5 || direction.length() < 0.96 || direction.length() > 1.04) {
    const rejected = railgunResult(request.by, request.generation, request.shotId, 'rejected', 'invalid', [], null);
    network.sendToPlayer(request.by, rejected);
    return rejected;
  }
  const normalized = direction.normalize();
  const admission = selectRailgunTargets(request.by, remote.snapshot.team, origin, normalized);
  if (!admission.accepted) {
    const rejected = railgunResult(request.by, request.generation, request.shotId, 'rejected', 'invalid', [], null);
    network.sendToPlayer(request.by, rejected);
    return rejected;
  }
  const fired = fireRailgun(railgunState, request.by, request.shotId, performance.now());
  if (!fired.accepted) {
    const rejected = railgunResult(request.by, request.generation, request.shotId, 'rejected', fired.reason, [], null);
    network.sendToPlayer(request.by, rejected);
    return rejected;
  }
  applyRailgunState(fired.state);
  broadcastRailgunState();
  const outcomes = admission.targets.flatMap(({ target, distance }) => {
    const outcome = applyAuthoritativeRailgunDamage(request.by, target, distance);
    return outcome ? [outcome] : [];
  });
  const beam = createRailgunBeamAuthority(request.generation, request.shotId, request.origin, normalized.toArray() as [number, number, number]);
  const result = railgunResult(
    request.by,
    request.generation,
    request.shotId,
    outcomes.length > 0 ? 'accepted-hit' : 'accepted-miss',
    'accepted',
    outcomes,
    beam,
  );
  lastAuthoritativeRailgunResult = result;
  resolvedRailgunShots.set(cacheKey, result);
  while (resolvedRailgunShots.size > 64) resolvedRailgunShots.delete(resolvedRailgunShots.keys().next().value!);
  const visual: ShotMessage = {
    type: 'shot', by: request.by, weapon: 'railgun', origin: request.origin as [number, number, number],
    direction: request.direction as [number, number, number], pelletDirections: [request.direction as [number, number, number]], nonce: request.nonce,
  };
  applyKillstreakEntityShot(request.by, remote.snapshot.team, origin, [normalized], 'railgun');
  presentAuthoritativeRailgunResult(result, false);
  renderRemoteShot(visual);
  network.send(visual, request.by);
  network.send(result);
  return result;
}

function acceptRailgunShotResult(message: RailgunShotResultMessage): void {
  if (network.role !== 'client' || message.by !== privateLobbySnapshot?.hostId || message.generation !== railgunState.generation) return;
  const resultKey = `${message.by}:${message.forPlayerId}:${message.generation}:${message.shotId}`;
  if (processedRailgunShotResults.has(resultKey)) return;
  processedRailgunShotResults.add(resultKey);
  while (processedRailgunShotResults.size > 512) processedRailgunShotResults.delete(processedRailgunShotResults.values().next().value!);
  presentAuthoritativeRailgunResult(message, message.forPlayerId === player.id);
  for (const outcome of message.outcomes) {
    if (outcome.target !== player.id || !player.alive) continue;
    reconcileLocalAuthoritativeHealth(
      outcome.resultingHealth,
      outcome.damageRequested,
      message.forPlayerId,
      1,
      { kind: 'gun', weapon: 'railgun' },
    );
  }
  if (message.forPlayerId !== player.id || message.status !== 'accepted-hit') return;
  presentLocalRailgunFeedback(message.outcomes);
}

function tryFireRailgun(now: number): void {
  if (!localHoldsRailgun() || player.weapon !== 'railgun' || railgunState.roundsRemaining <= 0) {
    audio.empty();
    return;
  }
  const hostNow = currentHostTimeMs();
  if (hostNow < Math.max(railgunState.chamberReadyAtHostTimeMs, localRailgunPendingUntilHostTimeMs)) return;
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const direction = camera.getWorldDirection(new THREE.Vector3()).normalize();
  const hostAdmission = network.role === 'client' ? null : selectRailgunTargets(player.id, player.team, origin, direction);
  if (hostAdmission && !hostAdmission.accepted) return;
  const shotId = `${localConnectionEpoch}:rail:${localShotSeq++}`;
  railgunAdsResetRequired = true;
  adsHeld = false;
  presentLocalRailgunTrigger();
  roundShotsFired += 1;
  if (network.role === 'client') {
    localRailgunPendingUntilHostTimeMs = hostNow + RAILGUN_RECHAMBER_MS;
    const request: RailgunShotRequestMessage = {
      type: 'railgun-shot-request', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: player.id, generation: railgunState.generation, shotId,
      origin: origin.toArray() as [number, number, number], direction: direction.toArray() as [number, number, number],
      fireTimeMs: hostNow, nonce: randomNonce(),
    };
    network.send(request);
    return;
  }
  const fired = fireRailgun(railgunState, player.id, shotId, now);
  if (!fired.accepted) return;
  applyRailgunState(fired.state);
  broadcastRailgunState();
  applyInteractiveWorldBallisticTrace(traceWeaponPath(origin, direction, RAILGUN_BEAM_LENGTH_M, 'railgun'), origin, direction, 'railgun');
  applyKillstreakEntityShot(player.id, player.team, origin, [direction], 'railgun', now);
  const outcomes = (hostAdmission?.targets ?? []).flatMap(({ target, distance }) => {
    const outcome = applyAuthoritativeRailgunDamage(player.id, target, distance);
    return outcome ? [outcome] : [];
  });
  presentLocalRailgunFeedback(outcomes);
  const beam = createRailgunBeamAuthority(railgunState.generation, shotId, origin.toArray() as [number, number, number], direction.toArray() as [number, number, number]);
  const result = railgunResult(
    player.id,
    railgunState.generation,
    shotId,
    outcomes.length > 0 ? 'accepted-hit' : 'accepted-miss',
    'accepted',
    outcomes,
    beam,
  );
  lastAuthoritativeRailgunResult = result;
  presentAuthoritativeRailgunResult(result, true);
  if (network.role === 'host') {
    const visual: ShotMessage = {
      type: 'shot', by: player.id, weapon: 'railgun', origin: origin.toArray() as [number, number, number],
      direction: direction.toArray() as [number, number, number], pelletDirections: [direction.toArray() as [number, number, number]], nonce: randomNonce(),
    };
    network.send(visual);
    network.send(result);
  }
}

function railgunThermalContacts(): RailgunThermalContact[] {
  const mode = gameMode === 'solo' ? 'tdm' : privateMatchMode;
  const observer = { id: player.id, team: player.team };
  return [
    ...[...remotes.values()].filter((remote) => railgunThermalTargetEligible(observer, {
      id: remote.snapshot.id, team: remote.snapshot.team, alive: remote.snapshot.hp > 0, kind: 'player',
    }, mode)).map((remote) => ({ id: remote.snapshot.id, kind: 'player' as const, position: remote.target.clone().add(new THREE.Vector3(0, 1.05, 0)) })),
    ...[...bots.values()].filter((bot) => railgunThermalTargetEligible(observer, {
      id: bot.id, team: bot.team, alive: bot.alive, kind: 'bot',
    }, mode)).map((bot) => ({ id: bot.id, kind: 'bot' as const, position: bot.position.clone().add(new THREE.Vector3(0, 1.05, 0)) })),
  ];
}

type RuntimeDmrThermalContact = {
  id: string;
  kind: 'player' | 'bot';
  relation: 'friendly' | 'hostile';
  position: THREE.Vector3;
  living: boolean;
  solidOccluded: boolean;
};

const dmrThermalContactBuffer: RuntimeDmrThermalContact[] = [];
const dmrThermalContactCache = new Map<string, RuntimeDmrThermalContact>();

function acquireDmrThermalContact(id: string, kind: 'player' | 'bot'): RuntimeDmrThermalContact {
  const key = `${kind}:${id}`;
  const cached = dmrThermalContactCache.get(key);
  if (cached) return cached;
  const created: RuntimeDmrThermalContact = {
    id,
    kind,
    relation: 'hostile',
    position: new THREE.Vector3(),
    living: false,
    solidOccluded: true,
  };
  dmrThermalContactCache.set(key, created);
  return created;
}

function dmrThermalSolidOccluded(observer: THREE.Vector3, contact: THREE.Vector3): boolean {
  for (const box of activeWorldColliders()) {
    if (segmentIntersectsBox(observer, contact, box)) return true;
  }
  return false;
}

function dmrThermalContacts(): readonly DmrThermalContact[] {
  const mode = gameMode === 'solo' ? 'tdm' : privateMatchMode;
  const observer = camera.position;
  dmrThermalContactBuffer.length = 0;
  for (const remote of remotes.values()) {
    const contact = acquireDmrThermalContact(remote.snapshot.id, 'player');
    contact.position.copy(remote.target);
    contact.position.y += 1.05;
    contact.relation = mode === 'tdm' && remote.snapshot.team === player.team ? 'friendly' : 'hostile';
    contact.living = remote.snapshot.hp > 0;
    contact.solidOccluded = dmrThermalSolidOccluded(observer, contact.position);
    dmrThermalContactBuffer.push(contact);
  }
  for (const bot of bots.values()) {
    const contact = acquireDmrThermalContact(bot.id, 'bot');
    contact.position.copy(bot.position);
    contact.position.y += 1.05;
    contact.relation = mode === 'tdm' && bot.team === player.team ? 'friendly' : 'hostile';
    contact.living = bot.alive;
    contact.solidOccluded = dmrThermalSolidOccluded(observer, contact.position);
    dmrThermalContactBuffer.push(contact);
  }
  return dmrThermalContactBuffer;
}

function updateDmrThermal(): void {
  if (!dmrThermalActive) {
    dmrThermalPresentation.update(camera, [], false);
    return;
  }
  dmrThermalPresentation.update(camera, dmrThermalContacts(), true);
}

function updateRailgun(now: number): void {
  if (network.role !== 'client') {
    const chambered = advanceRailgunChamber(railgunState, now);
    if (chambered !== railgunState) {
      applyRailgunState(chambered);
      broadcastRailgunState();
    }
    const advanced = advanceRailgunAuthority(railgunState, now);
    if (advanced.state !== railgunState) {
      applyRailgunState(advanced.state, advanced.announcement !== null);
      broadcastRailgunState();
    }
    if (railgunStateResyncDue(lastRailgunStateBroadcastAt, now)) broadcastRailgunState(false);
  }
  if (localHoldsRailgun()) player.ammo.railgun = railgunState.roundsRemaining;
  const hostNow = currentHostTimeMs();
  if (railgunRechamberPresentationActive && hostNow >= railgunState.chamberReadyAtHostTimeMs) {
    weaponView.cancelReload();
    railgunRechamberPresentationActive = false;
  }
  railgunPresentation.updateWorld(railgunState, now);
  const thermalActive = localHoldsRailgun() && player.weapon === 'railgun' && adsHeld
    && !railgunAdsResetRequired && weaponView.adsProgress() >= 0.82;
  railgunPresentation.updateThermal(camera, railgunThermalContacts(), thermalActive);
}

function admittedAdsHeld(rawHeld: boolean): boolean {
  if (!railgunAdsResetRequired) return rawHeld;
  if (!rawHeld && weaponView.adsProgress() <= 0.05) railgunAdsResetRequired = false;
  return false;
}

function endSpawnProtectionOnOffense(now: number): void {
  if (now < player.invulnerableUntil) player.invulnerableUntil = 0;
}

function switchWeapon(index: number): void {
  const id = selectedArena.id === 'gun-range'
    ? index === 0 ? rangePrimaryUnlocked ? player.primaryWeapon : undefined : index === 1 ? handicapSidearm(player.primaryWeapon) : undefined
    : index === 0 && localHoldsRailgun() ? 'railgun' : handicapLoadout(player.primaryWeapon)[index];
  if (!id || id === player.weapon || !player.alive) return;
  if (player.reloadState) {
    if (!cancelReload(player.reloadState, performance.now())) return;
    player.reloadState = null;
    weaponView.cancelReload();
  }
  player.weapon = id;
  resetLocalSpinUp();
  syncLocalTriggerAuthority(triggerHeld);
  player.switchingUntil = performance.now() + 360;
  player.sustainedShots = 0;
  weaponView.setWeapon(id);
  audio.weaponSwitch();
}

function reload(): void {
  if (!player.alive || matchState.phase !== 'active') return;
  if (player.weapon === 'railgun') return;
  const spec = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  const availableReserve = reloadSupply(selectedArena.id, player.reserve[player.weapon], spec.mag);
  if (player.reloadState || ammo >= spec.mag || availableReserve <= 0) return;
  const reloadStartedAt = performance.now();
  const reloadState = beginReload(spec, ammo, availableReserve, reloadStartedAt);
  const reloadDuration = killstreakActorModifiers(player.id, reloadStartedAt).reloadDuration;
  player.reloadState = reloadState ? {
    ...reloadState,
    seatAt: reloadStartedAt + (reloadState.seatAt - reloadStartedAt) * reloadDuration,
    endsAt: reloadStartedAt + (reloadState.endsAt - reloadStartedAt) * reloadDuration,
  } : null;
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
  if (pointSupportTargeting && !tacticalMapOpen) return;
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
  if (player.weapon === 'railgun') {
    if (now < player.switchingUntil) return;
    tryFireRailgun(now);
    return;
  }
  const spec = WEAPONS[player.weapon];
  if (!triggerHeld && spec.automatic) return;
  if (spec.spinUpMs > 0) {
    if (spinUpWeapon !== player.weapon || spinUpStartedAtPerformanceMs === null || spinUpStartedAtHostTimeMs === null) {
      spinUpWeapon = player.weapon;
      spinUpStartedAtPerformanceMs = now;
      spinUpStartedAtHostTimeMs = currentHostTimeMs();
      return;
    }
    if (now - spinUpStartedAtPerformanceMs < spec.spinUpMs) return;
  }
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
  player.nextShotAt = nextShotDeadline(now, shotInterval);
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
  const shotTimeline = network.role === 'client'
    ? freezeAuthoredShotTimeline(
        currentHostTimeMs(),
        interpolationDelayState.delayMs,
        [...remotes.values()].map((remote) => remote.renderedHostTimeMs),
      )
    : null;
  if (shotTimeline) lastAuthoredShotTimeline = shotTimeline;
  const hitDamage = new Map<string, {
    damage: number;
    zone: HitZone;
    wallbang: boolean;
    penetrationMultiplier: number;
    distanceMeters: number;
  }>();
  const pelletDirections: [number, number, number][] = [];
  const localSmokeShotSegments: SmokeShotSegment[] = [];
  let impactAudioPlayed = false;
  const presentedSurfaceIds = new Set<string>();
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const projectileShot = spec.fireKind === 'projectile';
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
    if (projectileShot) continue;
    const result = castShot(origin, direction, player.weapon, true);
    const authoritativeEnd = origin.clone().addScaledVector(direction, result.distance);
    localSmokeShotSegments.push(Object.freeze({
      pelletIndex: pellet,
      start: Object.freeze({ x: origin.x, y: origin.y, z: origin.z }),
      end: Object.freeze({ x: authoritativeEnd.x, y: authoritativeEnd.y, z: authoritativeEnd.z }),
    }));
    if (result.ballisticTrace) applyInteractiveWorldBallisticTrace(result.ballisticTrace, origin, direction, player.weapon);
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
      spawnImpactFlash(point, impact.surface.material, normal);
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
      spawnImpactFlash(point, result.impactMaterial ?? surface, normal);
      if (!impactAudioPlayed) {
        impactAudioPlayed = true;
        audio.impact(surface, point.distanceTo(camera.position));
      }
    }
    if (result.playerId) {
      const zone = effectiveHitZoneForWeapon(spec, result.hitZone ?? 'body');
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
      const zone = effectiveHitZoneForWeapon(spec, practiceTarget?.alwaysCritical ? 'head' : result.hitZone ?? 'body');
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
  if (!projectileShot) {
    applyKillstreakEntityShot(
      player.id,
      player.team,
      origin,
      pelletDirections.map((entry) => new THREE.Vector3(...entry)),
      player.weapon,
      now,
    );
  }
  const shot: ShotMessage = {
    type: 'shot',
    by: player.id,
    weapon: player.weapon,
    origin: origin.toArray() as [number, number, number],
    direction: canonicalShotDirection(
      player.weapon,
      baseDirection.toArray() as [number, number, number],
      pelletDirections,
    ),
    pelletDirections,
    timing: nextCombatTiming(),
    nonce: randomNonce(),
  };
  if (!projectileShot && network.role !== 'client') {
    admitAuthoritativeSmokeSegments(
      `local:${interactiveWorldMatchEpoch}:${player.id}:${shot.nonce}`,
      localSmokeShotSegments,
      now,
    );
  }
  if (projectileShot) {
    if (network.role !== 'client') {
      const actions = admittedRemoteShots.get(player.id) ?? new Map<number, AdmittedRemoteShot>();
      for (const [nonce, action] of actions) {
        const lifetimeMs = action.message.weapon === 'explosive-crossbow' ? EXPLOSIVE_BOLT_MAX_LIFE_MS + 1_000 : 1_000;
        if (now - action.receivedAt > lifetimeMs) actions.delete(nonce);
      }
      actions.set(shot.nonce, { message: shot, receivedAt: now, targets: new Set() });
      admittedRemoteShots.set(player.id, actions);
    }
    spawnExplosiveBolt(
      player.id,
      player.team,
      origin,
      new THREE.Vector3(...pelletDirections[0]!),
      network.role !== 'client',
      shot.nonce,
      now,
    );
  }
  if (network.role === 'client') {
    const weaponSequence = localWeaponSequences.get(player.weapon) ?? 0;
    const request = freezeAuthoredBulletRecord({
      type: 'shot-request', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: player.id,
      shotId: `${localConnectionEpoch}:${localShotSeq}`,
      connectionEpoch: localConnectionEpoch,
      lifeId: localContinuity,
      shotSeq: localShotSeq,
      weaponSequence,
      weapon: player.weapon,
      fireTimeMs: shotTimeline!.fireTimeMs,
      triggerStartedAtMs: spec.spinUpMs > 0 && spinUpWeapon === player.weapon && spinUpStartedAtHostTimeMs !== null
        ? spinUpStartedAtHostTimeMs
        : shotTimeline!.fireTimeMs,
      targetViewTimeMs: shotTimeline!.targetViewTimeMs,
      origin: shot.origin, direction: shot.direction, pelletDirections: shot.pelletDirections,
      nonce: shot.nonce,
    });
    localShotSeq += 1;
    localWeaponSequences.set(player.weapon, weaponSequence + 1);
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
        showDamageNumber(poweredDamage, hit.zone, bot.hp);
      } else {
        const healthBefore = bot.hp;
        applyBotDamage(bot, Math.min(400, poweredDamage), hit.zone, undefined, player.id, hit);
        showDamageNumber(poweredDamage, hit.zone, healthBefore);
      }
    }
    else {
      const remote = remotes.get(target);
      if (remote && areCombatantsHostile(player.id, player.team, remote.snapshot.id, remote.snapshot.team)) {
        const remoteOperator = remote.root.userData.operator as THREE.Group | undefined;
        if (remoteOperator) reactOperator(remoteOperator, hit.zone);
        const nonce = randomNonce();
        const dealt = Math.min(100, hit.damage);
        sendAuthoritativeHit({
          type: 'hit', by: player.id, target, damage: dealt, kind: 'shot',
          actionNonce: shot.nonce, nonce,
        }, { ...hit, hitZone: hit.zone });
        showHitmarker(hit.zone === 'head');
        showDamageNumber(poweredDamage, hit.zone, remote.snapshot.hp);
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
  impactMaterial?: BallisticMaterialId;
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
        impactMaterial: ballisticTrace.stoppedBy?.material,
        ballisticTrace,
      };
    }
    if (!first) return { distance: 90, damageMultiplier: 1, ballisticTrace };
  } else {
    const brokenWindowIds = new Set(arena.breakableWindows.filter((pane) => (
      pane.glassState ? glassAuthorityProjection(pane.glassState).apertureOpen : pane.broken
    )).map((pane) => pane.id));
    const activeWorldMeshes = activeRaycastMeshes().filter((object) => {
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
  let materialHint: BallisticMaterialId | undefined;
  const names: string[] = [];
  while (node) {
    playerId ??= node.userData.playerId as string | undefined;
    targetId ??= node.userData.targetId as string | undefined;
    windowId ??= node.userData.breakableWindowId as string | undefined;
    hitZone ??= node.userData.hitZone as HitZone | undefined;
    surfaceHint ??= node.userData.impactSurface;
    materialHint ??= node.userData.ballisticMaterial as BallisticMaterialId | undefined;
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
    impactMaterial: materialHint,
    ballisticTrace,
  };
}

function selectSafeBotSpawn(team: Team, actorId = `bot-team-${team}`): THREE.Vector3 {
  const spawnMode = activeSpawnMode();
  const otherPlayers = [
    ...(player.alive ? [player.position.clone()] : []),
    ...[...remotes.values()].filter((remote) => remote.snapshot.hp > 0).map((remote) => remote.target.clone()),
    ...[...bots.values()].filter((bot) => bot.alive).map((bot) => bot.position.clone()),
  ];
  const threats = [
    ...(player.alive && (spawnMode === 'ffa' || player.team !== team) ? [player.position.clone()] : []),
    ...[...remotes.values()]
      .filter((remote) => (spawnMode === 'ffa' || remote.snapshot.team !== team) && remote.snapshot.hp > 0)
      .map((remote) => new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z)),
  ];
  const validForSide = (side: Team) => arena.spawns[side]
    .map((candidate, localIndex) => ({ candidate, index: side * 100 + localIndex }))
    .filter(({ candidate }) => {
      const bodyPoint = { x: candidate.x, y: 0, z: candidate.z };
      return Number.isFinite(candidate.x) && Number.isFinite(candidate.z)
        && pointInsideBounds(bodyPoint, arena.bounds, 0.44)
        && !isBlocked(bodyPoint, activeWorldColliders(), 0.44);
    });
  const home = validForSide(team);
  const opposite = validForSide(team === 0 ? 1 : 0);
  if (home.length === 0 && (spawnMode !== 'ffa' || opposite.length === 0)) throw new Error(`No valid authored spawn for team ${team}`);
  const pressure = (options: ReturnType<typeof validForSide>) => {
    const scores = options.map(({ candidate }) => ({
      visibleThreats: threats.filter((threat) => !activeWorldColliders().some((box) => segmentIntersectsBox(candidate, threat, box))).length,
      distance: threats.length === 0 ? Number.POSITIVE_INFINITY : Math.min(...threats.map((threat) => threat.distanceToSquared(candidate))),
    }));
    const minimumVisibleThreats = Math.min(...scores.map((score) => score.visibleThreats));
    return {
      minimumVisibleThreats,
      safestNearestThreatDistanceSq: Math.max(...scores.filter((score) => score.visibleThreats === minimumVisibleThreats).map((score) => score.distance)),
    };
  };
  const instantaneousFlip = spawnMode !== 'ffa' && threats.length > 0 && opposite.length > 0 && shouldFlipSpawnSide(pressure(home), pressure(opposite));
  const flipDecision = spawnMode === 'ffa'
    ? { flip: false, state: spawnFlipHysteresis[team] }
    : advanceSpawnFlipHysteresis(spawnFlipHysteresis[team], instantaneousFlip, performance.now());
  spawnFlipHysteresis[team] = flipDecision.state;
  const valid = spawnMode === 'ffa' ? [...home, ...opposite] : flipDecision.flip ? opposite : home;
  const minimumSeparationSq = spawnMode === 'ffa' ? FFA_MINIMUM_SPAWN_SEPARATION ** 2 : 20;
  const unoccupied = valid.filter(({ candidate }) => !otherPlayers.some((position) => position.distanceToSquared(candidate) < minimumSeparationSq));
  const selectable = unoccupied.length > 0 ? unoccupied : valid;
  const selection = scoreSpawnCandidates({
    arenaId: selectedArena.id,
    mode: spawnMode,
    population: otherPlayers.length + 1,
    candidates: selectable.map(({ candidate, index }) => ({ index, point: candidate })),
    threats,
    occupants: otherPlayers,
    recentDeaths: recentSpawnDeathPoints(),
    colliders: activeWorldColliders(),
    previousIndex: lastBotSpawnIndices.get(team) ?? -1,
    tieBreakSeed: stableSpawnTieBreakSeed(actorId),
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
    opacity: 0.17,
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

function resetBotArsenalCycles(): void {
  botWeaponCycle = createShuffleBag(BOT_WEAPON_POOL, gameplayRandom);
  botGrenadeCycle = createShuffleBag(BOT_GRENADE_POOL, gameplayRandom);
}

function nextBotWeapon(): WeaponId {
  if (!botWeaponCycle) resetBotArsenalCycles();
  return botWeaponCycle!.next();
}

function nextBotGrenade(): GrenadeId {
  if (!botGrenadeCycle) resetBotArsenalCycles();
  return botGrenadeCycle!.next();
}

function equipNextBotArsenal(bot: BotPlayer): void {
  const weapon = nextBotWeapon();
  const grenade = nextBotGrenade();
  if (bot.weapon !== weapon) {
    bot.weapon = weapon;
    setOperatorWeapon(bot.root, weapon, flattenOperatorMaterials, scheduleDeferredGpuRetirement);
  }
  bot.grenade = grenade;
}

function spawnBot(index: number, hosted = false, dormantPresentation = false): void {
  const botTeam: Team = player.team === 0 ? 1 : 0;
  const name = SOLO_BOT_NAMES[index] ?? `RIVAL ${index + 1}`;
  const id = hosted ? `host-bot-${index}` : `bot-${index}`;
  // Dormant operators exist only to prewarm reinforcement presentation. Their
  // real arsenal draw occurs atomically when they become player-visible.
  const weapon = dormantPresentation
    ? BOT_WEAPON_POOL[index % BOT_WEAPON_POOL.length]!
    : nextBotWeapon();
  const grenade = dormantPresentation
    ? BOT_GRENADE_POOL[index % BOT_GRENADE_POOL.length]!
    : nextBotGrenade();
  const spawnedAt = performance.now();
  // Every reinforcement uses the same source-rigged humanoid and approved
  // neon-purple treatment. Only the lead owns the dynamic shadow proxy.
  const root = buildOperator(botTeam, 'bot-operator', renderProfile !== 'blender', weapon, 'neon-purple');
  applyBotEmissiveBrightness(root);
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
  const spawn = selectSafeBotSpawn(botTeam, id);
  const position = new THREE.Vector3(spawn.x, spawn.y - 1.7, spawn.z);
  root.position.copy(position);
  scene.add(root);
  bots.set(id, {
    id, name, team: botTeam, root, position, velocity: new THREE.Vector3(), hp: 100, alive: true,
    kills: 0, deaths: 0, lastShotAt: 0, lastSightAt: 0, hasLineOfSight: false,
    sightStartedAt: 0, burstShots: 0, nextDecisionAt: 0, strafeSign: index % 2 === 0 ? 1 : -1,
    invulnerableUntil: spawnedAt + 1_000, respawnAt: 0, deathVisibleUntil: 0, waypoint: index, blockedSince: 0,
    weapon, grenade, nextGrenadeAt: spawnedAt + 5_000 + gameplayRandom() * 3_000, grenadeActive: false,
    positionHistory: [{
      at: currentHostTimeMs(), x: position.x, y: position.y + 1.7, z: position.z,
      yaw: root.rotation.y, stance: 'stand', continuity: 1,
    }],
    continuity: 1,
    perception: createBotPerceptionState(interactiveWorldMatchEpoch, id, 1),
    perceptionCanFire: true,
    perceptionAimError: 0,
  });
}

async function prewarmBotPresentations(): Promise<void> {
  if (bots.size === 0 && dormantBots.size === 0) {
    dormantBotsPrewarmed = true;
    return;
  }
  const submissionWasPaused = renderSubmissionPaused;
  renderSubmissionPaused = true;
  for (const bot of dormantBots.values()) {
    bot.root.visible = true;
    bot.root.scale.setScalar(0.0001);
  }
  try {
    // Never let cold operator shaders enter the live frame loop. Completion of
    // this hidden first submission is the boundary between loading and play.
    await renderRuntime.compileAndRender(scene, camera, scene);
    dormantBotsPrewarmed = true;
  } finally {
    for (const bot of dormantBots.values()) {
      bot.root.visible = false;
      bot.root.scale.setScalar(1);
    }
    renderSubmissionPaused = submissionWasPaused;
  }
}

function activateDormantBot(index: number): boolean {
  const id = `bot-${index}`;
  const bot = dormantBots.get(id);
  if (!bot) return false;
  dormantBots.delete(id);
  const now = performance.now();
  const spawn = selectSafeBotSpawn(bot.team, bot.id);
  equipNextBotArsenal(bot);
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

async function spawnBots(hostedCount?: HostedBotCount): Promise<void> {
  clearBots();
  const activeCount = hostedCount ?? selectedArena.soloBotCount;
  resetBotArsenalCycles();
  botGrenadeThrows = 0;
  botGrenadeMaxActive = 0;
  lastBotGrenadeDamage = 0;
  soloBotDeaths = 0;
  dormantBotsPrewarmed = false;
  for (let index = 0; index < activeCount; index += 1) {
    spawnBot(index, hostedCount !== undefined);
    const id = hostedCount !== undefined ? `host-bot-${index}` : `bot-${index}`;
    const bot = bots.get(id);
    if (bot) await prewarmRiggedOperatorActions(bot.root);
    await yieldDeploymentPrewarmFrame();
  }
  if (hostedCount !== undefined) {
    for (const bot of bots.values()) authoritativeScores.set(bot.id, emptyPlayerScore(bot.id));
    if (activeCount > 0) addFeed(String(activeCount) + ' HOST-AUTHORITATIVE BOTS DEPLOYED', 'coral');
    broadcastHostedBotState();
    // Private-match activation uses an already-announced shared host clock.
    // Do not move that clock behind a host-only compile boundary.
    dormantBotsPrewarmed = activeCount === 0;
    return;
  }
  const activeSpawnHistory = new Map(lastBotSpawnIndices);
  for (let index = selectedArena.soloBotCount; index < selectedArena.maximumSoloBots; index += 1) {
    spawnBot(index, false, true);
    const bot = bots.get(`bot-${index}`)!;
    await prewarmRiggedOperatorActions(bot.root);
    bots.delete(bot.id);
    bot.alive = false;
    bot.root.visible = false;
    dormantBots.set(bot.id, bot);
    await yieldDeploymentPrewarmFrame();
  }
  lastBotSpawnIndices.clear();
  for (const [team, index] of activeSpawnHistory) lastBotSpawnIndices.set(team, index);
  await prewarmBotPresentations();
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
  for (const bot of bots.values()) {
    scheduleDeferredGpuRetirement(bot.root);
    footstepEmitters.reset(`bot:${bot.id}`);
  }
  for (const bot of dormantBots.values()) {
    scheduleDeferredGpuRetirement(bot.root);
    footstepEmitters.reset(`bot:${bot.id}`);
  }
  bots.clear();
  dormantBots.clear();
  dormantBotsPrewarmed = false;
  soloBotDeaths = 0;
  lastBotSpawnIndices.clear();
  botWeaponCycle = null;
  botGrenadeCycle = null;
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
      spawnBot(index, true);
      bot = bots.get(snapshot.id);
    }
    if (!bot || snapshot.seq <= Number(bot.root.userData.networkSeq ?? -1)) continue;
    const priorPosition = bot.position.clone();
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
    setOperatorWeapon(bot.root, snapshot.weapon, flattenOperatorMaterials, scheduleDeferredGpuRetirement);
    if (snapshot.alive) {
      const surface = arenaFootstepSurface(selectedArena.id, classifyFootstepSurface(bot.position));
      const hostedFootsteps = footstepEmitters.sample({
        actorId: `bot:${bot.id}`,
        lifeId: snapshot.deaths,
        continuityId: snapshot.deaths,
        position: bot.position,
        grounded: true,
        stale: false,
        movement: priorPosition.distanceTo(bot.position) > 0.55 ? 'sprint' : 'walk',
        surface,
        now: performance.now(),
      });
      for (const footstep of hostedFootsteps) audio.worldFootstep(footstep.position, footstep.surface, footstep.movement, isFootstepOccluded(footstep.position));
    } else {
      footstepEmitters.reset(`bot:${bot.id}`);
    }
  }
  for (const [id, bot] of bots) {
    if (!id.startsWith('host-bot-') || incomingIds.has(id)) continue;
    scheduleDeferredGpuRetirement(bot.root);
    footstepEmitters.reset(`bot:${id}`);
    bots.delete(id);
  }
}
function botHasLineOfSight(bot: BotPlayer, targetPosition = player.position, targetId = player.id): boolean {
  const origin = { x: bot.position.x, y: bot.position.y + 1.42, z: bot.position.z };
  const target = { x: targetPosition.x, y: targetPosition.y, z: targetPosition.z };
  const nowHostTimeMs = currentHostTimeMs();
  const projection = resolveBotPerception(bot.perception, {
    hostTimeMs: nowHostTimeMs,
    targetId,
    solidLineOfSight: !activeWorldColliders().some((box) => segmentIntersectsBox(origin, target, box)),
    smokeDensity: smokeDensityAlongRay(origin, target, smokeVolumes, nowHostTimeMs),
  });
  bot.perception = projection.state;
  bot.perceptionCanFire = projection.canFire;
  bot.perceptionAimError = projection.aimErrorRadians;
  return projection.canSeeTarget;
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
  grenade: GrenadeId = bot.grenade,
): boolean {
  if (!bot.alive || bot.grenadeActive || activeBotGrenadeCount() > 0) return false;
  const origin = bot.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const targetGroundY = Math.max(0.18, target.y - stanceEyeHeight(targetStance) + 0.18);
  const targetGround = new THREE.Vector3(target.x, targetGroundY, target.z);
  const horizontalDistance = Math.hypot(targetGround.x - origin.x, targetGround.z - origin.z);
  const flightTime = THREE.MathUtils.clamp(horizontalDistance / 12, 0.72, 1.35);
  const velocity = targetGround.clone().sub(origin).divideScalar(flightTime);
  velocity.y += 9 * flightTime;
  const mesh = acquireGrenadeWorldPresentation(grenade);
  mesh.position.copy(origin);
  mesh.castShadow = true;
  const grenadeSpec = grenadeDefinition(grenade);
  const impactDetonated = grenadeSpec.runtimeKind === 'impact-flash' || grenadeSpec.runtimeKind === 'smoke-volume';
  const sticky = grenadeSpec.runtimeKind === 'sticky-explosive';
  const maximumLifetimeMs = impactDetonated || sticky
    ? SEMTEX_HITL_CONTRACT.maximumNoImpactLifetimeMs
    : Math.max(120, fuseMs);
  grenades.push({
    grenade,
    mesh,
    velocity,
    angularVelocity: new THREE.Vector3(7.6, 5.8, 9.4),
    explodeAt: now + maximumLifetimeMs,
    nextFuseBeepAt: impactDetonated || sticky
      ? Number.POSITIVE_INFINITY
      : now + maximumLifetimeMs - GRENADE_FUSE_BEEP_START_MS,
    lastBounceAt: 0,
    actionNonce: randomNonce(),
    ownerKind: 'bot',
    ownerId: bot.id,
    ownerLifeId: bot.continuity,
    ownerTeam: bot.team,
    impactedAt: null,
    attachedTargetId: null,
    attachedTargetLifeId: null,
  });
  bot.grenadeActive = true;
  bot.nextGrenadeAt = now + BOT_GRENADE_COOLDOWN_MS;
  botGrenadeThrows += 1;
  botGrenadeMaxActive = Math.max(botGrenadeMaxActive, activeBotGrenadeCount());
  addFeed(`${bot.name} THREW ${grenadeSpec.displayName.toUpperCase()}`, 'coral');
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
      seesPlayer: targetAlive && !activeWorldColliders().some((box) => segmentIntersectsBox(eye, target, box)),
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
  deferPresentation = false,
  suppressAttackerFeedback = false,
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
  if (attackerId === player.id && !suppressAttackerFeedback) roundDamageDealt += dealt;
  if (network.role === 'host') recordAuthoritativeDamage(attackerId, bot.id, dealt);
  else if (attackerId === player.id) addFeed('DAMAGE DONE +' + Math.round(dealt), 'gold', { damageDealt: dealt });
  bot.hp = Math.max(0, bot.hp - damage);
  if (attackerId === player.id && !suppressAttackerFeedback) {
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
    const source = corpseSource(bot.id);
    if (deferPresentation) deferDeathPresentation(bot.id, source, death, now);
    else {
      spawnCorpsePresentation(bot.id, source, now);
      spawnDeathDrop(death, now);
    }
  }
  const afterDeathDrop = performance.now();
  bot.respawnAt = railgunQaHeldDeadBots.has(bot.id) ? Number.POSITIVE_INFINITY : now + 2_200;
  bot.deathVisibleUntil = now + 1_050;
  deathOperator(bot.root);
  // The pooled corpse owns the persistent death pose. Keeping the live bot
  // visible as well rendered the same operator twice during support-streak
  // kills and was a repeatable frame-time spike on the owner hardware.
  bot.root.visible = false;
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
  const spawn = selectSafeBotSpawn(bot.team, bot.id);
  equipNextBotArsenal(bot);
  bot.position.set(spawn.x, spawn.y - 1.7, spawn.z);
  bot.root.position.copy(bot.position);
  bot.continuity += 1;
  bot.perception = createBotPerceptionState(interactiveWorldMatchEpoch, bot.id, bot.continuity);
  bot.perceptionCanFire = true;
  bot.perceptionAimError = 0;
  footstepEmitters.reset(`bot:${bot.id}`);
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
  return activeWorldColliders(activeArena).filter((box) => {
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
  const targetDhv = memberDhv(target.id);
  const result = applyAuthoritativeRemoteDamage(
    health,
    damage,
    now,
    (requested, canonicalHealth) => applyDhvIncomingDamage(requested, canonicalHealth, targetDhv),
  );
  if (!result.applied) return;
  remoteHealthAuthorities.set(target.id, result.state);
  remote.snapshot = { ...remote.snapshot, hp: result.state.hp };
  remote.root.visible = result.state.alive;
  recordAuthoritativeRemoteRegeneration(target.id, result, 'host-remote-health-authority-before-hosted-bot');
  if (result.damageApplied <= 0) return;
  recordDamageEvent({
    actorId: bot.id,
    targetId: target.id,
    weaponOrEffect: bot.weapon,
    healthBefore: result.healthBefore,
    healthAfter: result.healthAfter,
    damageRequested: result.damageRequested,
    damageApplied: result.damageApplied,
    reason: 'hosted-bot-remote-health-authority',
  });
  recordAuthoritativeDamage(bot.id, target.id, result.damageApplied);
  const message: BotDamageMessage = {
    type: 'bot-damage',
    by: player.id,
    botId: bot.id,
    target: target.id,
    weapon: bot.weapon,
    origin: origin.toArray(),
    direction: direction.toArray(),
    damageApplied: result.damageApplied,
    healthBefore: result.healthBefore,
    healthAfter: result.healthAfter,
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
    reconcileLocalAuthoritativeHealth(message.healthAfter, message.damageApplied, message.botId, 0, { kind: 'gun', weapon: message.weapon });
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
      bot.root.visible = false;
      if (now >= bot.respawnAt && !matchFinished) respawnBot(bot, now);
      continue;
    }
    if (network.role === 'host' && remotes.size > 0) {
      recordCombatantPose(bot.positionHistory, {
        at: currentHostTimeMs(), x: bot.position.x, y: bot.position.y + 1.7, z: bot.position.z,
        yaw: bot.root.rotation.y, stance: 'stand', continuity: bot.continuity,
      });
    }
    if (botsFrozen) {
      poseOperator(bot.root, debugBotStanceOverride ?? 'stand', debugBotSpeedOverride, now * 0.001, 1, 0, dt);
      continue;
    }
    // A corrupted position can never become an out-of-arena damage source.
    if (!pointInsideBounds(bot.position, arena.bounds, 0.44)) {
      const safeSpawn = selectSafeBotSpawn(bot.team, bot.id);
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
      bot.hasLineOfSight = combatTarget !== null && botHasLineOfSight(bot, targetPosition, combatTarget.id);
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
      fireSuppressed: !bot.perceptionCanFire,
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
    poseOperator(bot.root, 'stand', desiredDirection.lengthSq() > 0 ? speed : 0, now * 0.008 + botIndex, Math.min(1, dt * 12), 0, dt);
    const botSurface = arenaFootstepSurface(selectedArena.id, classifyFootstepSurface(bot.position));
    const botFootsteps = footstepEmitters.sample({
      actorId: `bot:${bot.id}`,
      lifeId: bot.deaths,
      continuityId: bot.continuity,
      position: bot.position,
      grounded: true,
      stale: false,
      movement: desiredDirection.lengthSq() > 0 && speed > 5.2 ? 'sprint' : 'walk',
      surface: botSurface,
      now,
    });
    for (const footstep of botFootsteps) audio.worldFootstep(footstep.position, footstep.surface, footstep.movement, isFootstepOccluded(footstep.position));

    const threwBotGrenade = madeTacticalDecision && shouldBotThrowGrenade({
      alive: bot.alive,
      hasLineOfSight: lineOfSight,
      reacted: bot.perceptionCanFire && bot.sightStartedAt > 0 && now - bot.sightStartedAt >= BOT_REACTION_DELAY,
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
      const baseDirection = targetPosition.clone().sub(origin).normalize();
      const jitter = botAimJitter(distance) + bot.perceptionAimError + bot.burstShots * 0.006;
      const shotLength = Math.min(distance + 2, 75);
      const targetRadius = combatTarget.stance === 'prone' ? 0.38 : combatTarget.stance === 'crouch' ? 0.48 : 0.55;
      const botWeapon = WEAPONS[bot.weapon];
      const canonicalDefinition = botWeaponDefinition(bot.weapon);
      const pelletCount = canonicalDefinition.fireKind === 'pellet' ? canonicalDefinition.pellets : 1;
      const shotRight = new THREE.Vector3().crossVectors(baseDirection, new THREE.Vector3(0, 1, 0));
      if (shotRight.lengthSq() < 1e-8) shotRight.set(1, 0, 0);
      else shotRight.normalize();
      const shotUp = new THREE.Vector3().crossVectors(shotRight, baseDirection).normalize();
      const botMuzzle = bot.root.getObjectByName('muzzle-socket')?.getWorldPosition(new THREE.Vector3());
      let impactAudioPlayed = false;
      let hitTarget = false;
      let damage = 0;
      let principalDirection = baseDirection;
      let visibleEnd = origin.clone().addScaledVector(baseDirection, shotLength);
      let impactCount = 0;
      for (let pellet = 0; pellet < pelletCount; pellet += 1) {
        const sample = sampleWeaponPellet(botWeapon, pellet, jitter, gameplayRandom(), gameplayRandom());
        const direction = baseDirection.clone()
          .addScaledVector(shotRight, sample.x)
          .addScaledVector(shotUp, sample.y)
          .normalize();
        if (pellet === 0) principalDirection = direction;
        const resolution = resolveBallisticHitscanAgainstTarget(
          origin,
          direction,
          shotLength,
          targetPosition,
          targetRadius,
          botWeapon.penetration,
          activeBallisticSurfaces(),
        );
        applyInteractiveWorldBallisticTrace(resolution.trace, origin, direction, bot.weapon);
        const pelletVisibleEnd = origin.clone().addScaledVector(direction, resolution.tracerDistance);
        if (pellet === 0) visibleEnd = pelletVisibleEnd;
        spawnTracer(botMuzzle ?? origin, pelletVisibleEnd, botWeapon.color);
        impactCount += resolution.trace.impacts.length;
        for (const impact of resolution.trace.impacts) {
          const impactDistance = impact.penetrated ? impact.entryDistance : impact.exitDistance;
          const point = origin.clone().addScaledVector(direction, impactDistance);
          const surface = ballisticImpactSurface(impact.surface.material);
          spawnImpactFlash(point, impact.surface.material, new THREE.Vector3(
            impact.entryNormal.x,
            impact.entryNormal.y,
            impact.entryNormal.z,
          ));
          if (!impactAudioPlayed) {
            impactAudioPlayed = true;
            audio.impact(surface, point.distanceTo(player.position));
          }
        }
        if (resolution.hitTarget) {
          hitTarget = true;
          damage += botScaledDamage(applyPenetrationDamage(
            computeDamage(botWeapon, distance, 'body'),
            resolution.damageMultiplier,
          ));
        }
      }
      if (combatTarget.kind === 'local' && !hitTarget && impactCount === 0) {
        audio.nearMiss(nearMissStrength(player.position, origin, visibleEnd));
      }
      audio.shot(bot.weapon, true);
      if (hitTarget) {
        if (combatTarget.kind === 'remote') {
          applyHostedBotDamageToRemote(bot, combatTarget, damage, origin, principalDirection, now);
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
        'knife',
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

const explosiveBoltTargetBuffer = new ExplosiveBoltTargetBuffer<Team>();

function fillExplosiveBoltTargets(ownerId: string, ownerTeam: Team): number {
  explosiveBoltTargetBuffer.reset();
  if (player.id !== ownerId && player.alive && areCombatantsHostile(ownerId, ownerTeam, player.id, player.team)) {
    explosiveBoltTargetBuffer.append(player.id, player.team, localContinuity, 'player', player.position, -0.62);
  }
  for (const remote of remotes.values()) {
    if (remote.snapshot.id === ownerId || remote.snapshot.hp <= 0
      || !areCombatantsHostile(ownerId, ownerTeam, remote.snapshot.id, remote.snapshot.team)) continue;
    explosiveBoltTargetBuffer.append(remote.snapshot.id, remote.snapshot.team, remote.continuity, 'remote', remote.target, 1);
  }
  for (const bot of bots.values()) {
    if (bot.id === ownerId || !bot.alive || !areCombatantsHostile(ownerId, ownerTeam, bot.id, bot.team)) continue;
    explosiveBoltTargetBuffer.append(bot.id, bot.team, bot.continuity, 'bot', bot.position, 1);
  }
  return explosiveBoltTargetBuffer.length;
}

function explosiveBoltTargetDistance(
  origin: Readonly<{ x: number; y: number; z: number }>,
  targetX: number,
  targetY: number,
  targetZ: number,
): number {
  const dx = origin.x - targetX;
  const dy = origin.y - targetY;
  const dz = origin.z - targetZ;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function segmentSphereFraction(start: THREE.Vector3, delta: THREE.Vector3, centre: THREE.Vector3, radius: number): number | null {
  const denominator = delta.lengthSq();
  if (denominator < 1e-9) return null;
  const offsetX = centre.x - start.x;
  const offsetY = centre.y - start.y;
  const offsetZ = centre.z - start.z;
  const alpha = THREE.MathUtils.clamp(
    (offsetX * delta.x + offsetY * delta.y + offsetZ * delta.z) / denominator,
    0,
    1,
  );
  const nearestX = start.x + delta.x * alpha - centre.x;
  const nearestY = start.y + delta.y * alpha - centre.y;
  const nearestZ = start.z + delta.z * alpha - centre.z;
  return nearestX * nearestX + nearestY * nearestY + nearestZ * nearestZ <= radius * radius ? alpha : null;
}

function createExplosiveBoltMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'tac15-explosive-bolt';
  const shaft = new THREE.Mesh(explosiveBoltShaftGeometry, explosiveBoltShaftMaterial);
  shaft.rotation.x = Math.PI / 2;
  root.add(shaft);
  const tip = new THREE.Mesh(explosiveBoltTipGeometry, explosiveBoltArmedMaterial);
  tip.rotation.x = -Math.PI / 2;
  tip.position.z = -0.42;
  root.add(tip);
  root.userData.presentationOnly = true;
  root.userData.presentationPoolInUse = false;
  root.visible = false;
  return root;
}

async function prewarmExplosiveBoltPresentation(sceneGeneration = 0): Promise<void> {
  if (explosiveBoltPresentationPrewarmGeneration === sceneGeneration) return;
  const states = new Map<THREE.Object3D, Readonly<{
    visible: boolean;
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
    scale: THREE.Vector3;
    frustumCulled: boolean;
  }>>();
  for (const root of explosiveBoltPresentationPool) {
    root.traverse((node) => {
      states.set(node, Object.freeze({
        visible: node.visible,
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
        frustumCulled: node.frustumCulled,
      }));
      node.visible = true;
      node.frustumCulled = false;
    });
    // Preserve exact projectile scale so the loading-boundary fence covers
    // the same presentation submitted by the first live crossbow bolt.
  }
  camera.updateWorldMatrix(true, false);
  explosiveBoltPresentationRoot.updateWorldMatrix(true, false);
  const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
  const columns = 8;
  for (let index = 0; index < explosiveBoltPresentationPool.length; index += 1) {
    const root = explosiveBoltPresentationPool[index]!;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const target = cameraPosition.clone()
      .addScaledVector(forward, 8)
      .addScaledVector(right, (column - 3.5) * 0.34)
      .addScaledVector(up, (1.5 - row) * 0.34);
    root.position.copy(explosiveBoltPresentationRoot.worldToLocal(target));
  }
  try {
    await renderRuntime.compileAndRender(explosiveBoltPresentationRoot, camera, scene);
    explosiveBoltPresentationPrewarmGeneration = sceneGeneration;
  } finally {
    for (const [node, state] of states) {
      node.visible = state.visible;
      node.position.copy(state.position);
      node.quaternion.copy(state.quaternion);
      node.scale.copy(state.scale);
      node.frustumCulled = state.frustumCulled;
    }
  }
}

async function prewarmGrenadeWorldPresentations(sceneGeneration: number): Promise<void> {
  await grenadeWorldPresentationPool.prewarm(renderRuntime, camera, sceneGeneration);
}

function acquireGrenadeWorldPresentation(grenade: GrenadeId): THREE.Object3D {
  const presentation = grenadeWorldPresentationPool.acquire(grenade);
  if (presentation) return presentation;
  // The six-player lobby and one-grenade inventory fit well inside the fixed
  // family capacity. A malformed remote burst must not allocate an uncompiled
  // visible clone or crash the match, so it receives a simulation-only anchor.
  const anchor = new THREE.Object3D();
  anchor.name = 'grenade-world-pool-overflow-anchor';
  anchor.visible = false;
  anchor.userData.presentationOnly = true;
  anchor.userData.grenadePresentationOverflow = true;
  return anchor;
}

function releaseGrenadeWorldPresentation(root: THREE.Object3D): void {
  if (grenadeWorldPresentationPool.release(root)) return;
  root.removeFromParent();
  root.visible = false;
}

function acquireExplosiveBoltMesh(): THREE.Group {
  const root = explosiveBoltPresentationPool.find((candidate) => candidate.userData.presentationPoolInUse !== true);
  if (!root) throw new Error('Explosive-bolt presentation pool exhausted');
  root.userData.presentationPoolInUse = true;
  root.visible = true;
  root.scale.setScalar(1);
  return root;
}

function spawnExplosiveBolt(
  ownerId: string,
  ownerTeam: Team,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  authority: boolean,
  actionNonce: number,
  now = performance.now(),
): void {
  const normalized = direction.clone().normalize();
  const mesh = acquireExplosiveBoltMesh();
  mesh.position.copy(origin);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), normalized);
  explosiveBolts.push({
    mesh,
    velocity: normalized.multiplyScalar(EXPLOSIVE_BOLT_SPEED_MPS),
    ownerId,
    ownerLifeId: ownerId === player.id
      ? localContinuity
      : remotes.get(ownerId)?.continuity ?? bots.get(ownerId)?.continuity ?? 0,
    ownerTeam,
    authority,
    spawnedAt: now,
    expiresAt: now + EXPLOSIVE_BOLT_MAX_LIFE_MS,
    impactedAt: null,
    detonatesAt: now + EXPLOSIVE_BOLT_MAX_LIFE_MS,
    nextFuseBeepAt: null,
    targetId: null,
    targetLifeId: null,
    actionNonce,
  });
}

function disposeExplosiveBolt(entity: ExplosiveBoltEntity): void {
  entity.mesh.visible = false;
  entity.mesh.userData.presentationPoolInUse = false;
  entity.mesh.position.set(0, 0, 0);
  entity.mesh.quaternion.identity();
}

function applyExplosiveBoltTargetDamage(
  bolt: ExplosiveBoltEntity,
  targetId: string,
  targetKind: ExplosiveBoltTargetKind,
  targetX: number,
  targetY: number,
  targetZ: number,
  damage: number,
  kind: 'direct' | 'blast',
  origin: THREE.Vector3,
): void {
  if (damage <= 0) return;
  const boundedDamage = Math.min(100, damage);
  const stuck = kind === 'blast' && bolt.targetId !== null && bolt.targetLifeId !== null;
  const cause: KillCause = { kind: 'gun', weapon: 'explosive-crossbow' };
  if (targetKind === 'player') {
    const authoredDamage = handicapOutgoingDamage(bolt.ownerId, resolveRemotePoweredDamage(
      boundedDamage,
      overdriveDamageMultiplier(overdriveState, bolt.ownerId, performance.now()),
    ), 'explosive-crossbow');
    applyDamage(authoredDamage, bolt.ownerId, 1, false, cause, true);
    return;
  }
  if (targetKind === 'bot') {
    const bot = bots.get(targetId);
    const authoredDamage = handicapOutgoingDamage(bolt.ownerId, resolveRemotePoweredDamage(
      boundedDamage,
      overdriveDamageMultiplier(overdriveState, bolt.ownerId, performance.now()),
    ), 'explosive-crossbow');
    if (bot) applyBotDamage(bot, authoredDamage, 'body', cause, bolt.ownerId, {
      distanceMeters: explosiveBoltTargetDistance(origin, targetX, targetY, targetZ),
    });
    return;
  }
  const hit: HitMessage = kind === 'direct'
    ? {
        type: 'hit', by: bolt.ownerId, target: targetId, damage: boundedDamage, kind: 'shot',
        origin: origin.toArray() as [number, number, number], actionNonce: bolt.actionNonce, nonce: randomNonce(),
      }
    : {
        type: 'hit', by: bolt.ownerId, target: targetId, damage: boundedDamage, kind: 'explosive',
        explosiveSource: 'explosive-crossbow', origin: origin.toArray() as [number, number, number],
        actionNonce: bolt.actionNonce, nonce: randomNonce(),
        ...(stuck ? { stuck: true as const } : {}),
      };
  sendAuthoritativeHit(hit, {
    hitZone: 'body',
    distanceMeters: explosiveBoltTargetDistance(origin, targetX, targetY, targetZ),
  });
}

function detonateExplosiveBoltEntity(bolt: ExplosiveBoltEntity, now: number): void {
  const point = bolt.mesh.position.clone();
  const attachedTargetId = bolt.targetId;
  const attachedTargetLifeId = bolt.targetLifeId;
  let liveAttachedTargetFound = false;
  if (attachedTargetId !== null && attachedTargetLifeId !== null) {
    fillExplosiveBoltTargets(bolt.ownerId, bolt.ownerTeam);
    liveAttachedTargetFound = explosiveBoltTargetBuffer.findIndex(attachedTargetId, attachedTargetLifeId) >= 0;
  }
  const sealedAttachment = bolt.authority && liveAttachedTargetFound
    ? sealReceiverStickyDetonation({
        ownerId: bolt.ownerId,
        ownerLifeId: bolt.ownerLifeId,
        source: 'explosive-crossbow',
        actionNonce: bolt.actionNonce,
        origin: point.toArray() as [number, number, number],
        detonatedAtMs: now,
        currentAttachmentTarget: { id: attachedTargetId!, lifeId: attachedTargetLifeId! },
      })
    : null;
  disposeExplosiveBolt(bolt);
  spawnGrenadeExplosionVisual(point, now);
  audio.explosion(now);
  if (!bolt.authority) return;
  const stuck = sealedAttachment !== null;
  const blastRadiusM = explosiveBoltBlastRadiusM(stuck);
  applyInteractiveWorldExplosion(point, blastRadiusM, EXPLOSIVE_BOLT_BLAST_MAX_DAMAGE * (stuck ? 2 : 1));
  const targetCount = fillExplosiveBoltTargets(bolt.ownerId, bolt.ownerTeam);
  for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
    const target = explosiveBoltTargetBuffer.at(targetIndex);
    const targetId = target.id;
    const targetLifeId = target.lifeId;
    const targetKind = target.kind;
    const targetX = target.position.x;
    const targetY = target.position.y;
    const targetZ = target.position.z;
    if (targetId === bolt.targetId && targetLifeId !== bolt.targetLifeId) continue;
    const direct = targetId === bolt.targetId && targetLifeId === bolt.targetLifeId;
    if (direct) applyExplosiveBoltTargetDamage(
      bolt, targetId, targetKind, targetX, targetY, targetZ, EXPLOSIVE_BOLT_DIRECT_DAMAGE, 'direct', point,
    );
    const distance = explosiveBoltTargetDistance(point, targetX, targetY, targetZ);
    if (distance > blastRadiusM) continue;
    explosiveBoltTargetPositionScratch.set(targetX, targetY, targetZ);
    const blocked = !direct && activeWorldColliders().some((box) => (
      segmentIntersectsBox(point, explosiveBoltTargetPositionScratch, box)
    ));
    if (blocked) continue;
    applyExplosiveBoltTargetDamage(
      bolt, targetId, targetKind, targetX, targetY, targetZ, explosiveBoltBlastDamage(distance, stuck), 'blast', point,
    );
  }
}

const crossbowGlassRay = new THREE.Raycaster();
function crossbowGlassCollision(
  start: THREE.Vector3,
  delta: THREE.Vector3,
): Readonly<{ time: number; windowId: string }> | null {
  const distance = delta.length();
  if (distance <= 1e-8) return null;
  crossbowGlassRay.set(start, delta.clone().divideScalar(distance));
  crossbowGlassRay.near = 0;
  crossbowGlassRay.far = distance;
  let nearest: Readonly<{ time: number; windowId: string }> | null = null;
  for (const pane of arena.breakableWindows) {
    const state = pane.glassState?.matchEpoch === interactiveWorldMatchEpoch
      ? pane.glassState
      : createGlassState(pane.id, interactiveWorldMatchEpoch);
    pane.glassState = state;
    const admission = admitCrossbowThroughGlass(state, {
      matchEpoch: interactiveWorldMatchEpoch,
      observedRevision: state.revision,
      tick: interactiveWorldTick,
    });
    if (admission.passes) continue;
    pane.mesh.updateWorldMatrix(true, false);
    const hit = crossbowGlassRay.intersectObject(pane.mesh, false)[0];
    if (!hit) continue;
    const candidate = Object.freeze({ time: hit.distance / distance, windowId: pane.id });
    if (!nearest || candidate.time < nearest.time) nearest = candidate;
  }
  return nearest;
}

function updateExplosiveBolts(dt: number, now: number): void {
  for (let index = explosiveBolts.length - 1; index >= 0; index -= 1) {
    const bolt = explosiveBolts[index];
    if (bolt.impactedAt === null) {
      const start = explosiveBoltStartScratch.copy(bolt.mesh.position);
      const delta = explosiveBoltDeltaScratch.copy(bolt.velocity).multiplyScalar(dt);
      const worldCollision = sweepSphereAgainstBoxes(start, delta, activeWorldColliders());
      const glassCollision = crossbowGlassCollision(start, delta);
      let targetHitIndex = -1;
      let targetFraction = 2;
      const targetCount = fillExplosiveBoltTargets(bolt.ownerId, bolt.ownerTeam);
      for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
        const target = explosiveBoltTargetBuffer.at(targetIndex);
        const fraction = segmentSphereFraction(start, delta, target.position, 0.58);
        if (fraction !== null && fraction < targetFraction) {
          targetHitIndex = targetIndex;
          targetFraction = fraction;
        }
      }
      const worldFraction = worldCollision?.time ?? 2;
      const glassFraction = glassCollision?.time ?? 2;
      if (targetHitIndex >= 0 && targetFraction <= worldFraction && targetFraction <= glassFraction) {
        const targetHit = explosiveBoltTargetBuffer.at(targetHitIndex);
        bolt.mesh.position.copy(targetHit.position);
        const targetHitId = targetHit.id;
        const targetHitLifeId = targetHit.lifeId;
        const targetHitKind = targetHit.kind;
        bolt.targetId = targetHitId;
        bolt.targetLifeId = targetHitLifeId;
        bolt.impactedAt = now;
        bolt.detonatesAt = Math.min(bolt.expiresAt, now + EXPLOSIVE_BOLT_ARM_DELAY_MS);
        bolt.nextFuseBeepAt = now;
        bolt.velocity.set(0, 0, 0);
        if (bolt.authority) recordReceiverStickyAttachment({
          ownerId: bolt.ownerId,
          ownerLifeId: bolt.ownerLifeId,
          source: 'explosive-crossbow',
          actionNonce: bolt.actionNonce,
          targetId: targetHitId,
          targetLifeId: targetHitLifeId,
          attachedAtMs: now,
          expiresAtMs: bolt.detonatesAt + STICKY_AUTHORITY_POST_DETONATION_LIFETIME_MS,
        });
        if (targetHitKind === 'player') addFeed('STUCK', 'coral');
        else if (bolt.ownerId === player.id) addFeed('STUCK', 'gold');
      } else if (worldCollision || glassCollision) {
        const collisionFraction = Math.min(worldFraction, glassFraction);
        bolt.mesh.position.copy(start).addScaledVector(delta, collisionFraction);
        bolt.impactedAt = now;
        bolt.detonatesAt = Math.min(bolt.expiresAt, now + EXPLOSIVE_BOLT_ARM_DELAY_MS);
        bolt.nextFuseBeepAt = now;
        bolt.velocity.set(0, 0, 0);
      } else {
        bolt.mesh.position.add(delta);
      }
    } else if (bolt.targetId !== null && bolt.targetLifeId !== null) {
      fillExplosiveBoltTargets(bolt.ownerId, bolt.ownerTeam);
      const attachedTargetIndex = explosiveBoltTargetBuffer.findIndex(bolt.targetId, bolt.targetLifeId);
      if (attachedTargetIndex >= 0) bolt.mesh.position.copy(explosiveBoltTargetBuffer.at(attachedTargetIndex).position);
    }
    if (bolt.impactedAt !== null && bolt.nextFuseBeepAt !== null && now >= bolt.nextFuseBeepAt && now < bolt.detonatesAt) {
      const remainingMs = bolt.detonatesAt - now;
      audio.crossbowFuseBeep(bolt.mesh.position, remainingMs, now);
      bolt.nextFuseBeepAt = now + crossbowFuseBeepIntervalMs(remainingMs);
    }
    if (now >= bolt.detonatesAt || now >= bolt.expiresAt || !pointInsideBounds(bolt.mesh.position, arena.bounds, 0)) {
      explosiveBolts.splice(index, 1);
      detonateExplosiveBoltEntity(bolt, now);
    }
  }
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
    type: 'grenade-throw', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, by: player.id,
    grenade: player.selectedGrenade,
    lifeId: localContinuity,
    actionSequence: localGrenadeActionSequence,
    origin: origin.toArray() as [number, number, number],
    velocity: velocity.toArray() as [number, number, number],
    actionNonce,
    timing: nextCombatTiming(),
    nonce: randomNonce(),
  });
  localGrenadeActionSequence += 1;
  const mesh = acquireGrenadeWorldPresentation(player.selectedGrenade);
  mesh.position.copy(origin);
  mesh.castShadow = true;
  const thrownAt = performance.now();
  const impactDetonated = player.selectedGrenade === 'flash' || player.selectedGrenade === 'smoke';
  const sticky = player.selectedGrenade === 'semtex';
  grenades.push({
    grenade: player.selectedGrenade,
    mesh,
    velocity,
    angularVelocity: new THREE.Vector3(8.4, 5.2, 10.8),
    explodeAt: thrownAt + (impactDetonated || sticky ? SEMTEX_HITL_CONTRACT.maximumNoImpactLifetimeMs : 2_300),
    nextFuseBeepAt: impactDetonated ? Number.POSITIVE_INFINITY : thrownAt + 2_300 - GRENADE_FUSE_BEEP_START_MS,
    lastBounceAt: 0,
    actionNonce,
    ownerKind: 'player',
    ownerId: player.id,
    ownerLifeId: localContinuity,
    ownerTeam: player.team,
    impactedAt: null,
    attachedTargetId: null,
    attachedTargetLifeId: null,
  });
}

function presentRemoteGrenade(message: Extract<GameMessage, { type: 'grenade-throw' }>, ownerTeam: Team): void {
  const mesh = acquireGrenadeWorldPresentation(message.grenade);
  mesh.position.fromArray(message.origin);
  mesh.castShadow = true;
  const receivedAt = performance.now();
  const impactDetonated = message.grenade === 'flash' || message.grenade === 'smoke';
  const sticky = message.grenade === 'semtex';
  grenades.push({
    grenade: message.grenade,
    mesh,
    velocity: new THREE.Vector3(...message.velocity),
    angularVelocity: new THREE.Vector3(8.4, 5.2, 10.8),
    explodeAt: receivedAt + (impactDetonated || sticky ? SEMTEX_HITL_CONTRACT.maximumNoImpactLifetimeMs : 2_300),
    nextFuseBeepAt: impactDetonated ? Number.POSITIVE_INFINITY : receivedAt + 2_300 - GRENADE_FUSE_BEEP_START_MS,
    lastBounceAt: 0,
    actionNonce: message.actionNonce,
    ownerKind: 'remote',
    ownerId: message.by,
    ownerLifeId: message.lifeId,
    ownerTeam,
    impactedAt: null,
    attachedTargetId: null,
    attachedTargetLifeId: null,
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

function breakWindowsInGrenadeBlast(point: THREE.Vector3, actionNonce: number, replicate: boolean, radius = GRENADE_RADIUS): number {
  let broken = 0;
  for (const pane of arena.breakableWindows) {
    if (pane.broken) continue;
    const centre = pane.mesh.getWorldPosition(new THREE.Vector3());
    if (centre.distanceTo(point) > radius) continue;
    if (windowBreakPathBlocked(point, centre, activeWorldColliders())) continue;
    const normal = centre.clone().sub(point);
    if (normal.lengthSq() < 1e-8) normal.set(0, 0, 1);
    else normal.normalize().multiplyScalar(-1);
    if (breakHouseWindow(pane.id, centre, normal, replicate, point, 'explosive', actionNonce)) broken += 1;
  }
  return broken;
}

function synchronizeSmokePresentation(snapshot: SmokeAuthoritySnapshot, nowHostTimeMs: number): void {
  const existingById = new Map(smokeVolumes.map((volume) => [volume.id, volume]));
  const activeIds = new Set(snapshot.volumes.map((volume) => volume.id));
  for (const existing of smokeVolumes) {
    if (!activeIds.has(existing.id)) smokeVolumePresentationPool.release(existing.presentationLease);
  }
  const synchronized: RuntimeSmokeVolume[] = [];
  for (const volume of snapshot.volumes) {
    const existing = existingById.get(volume.id);
    const presentationLease = existing?.presentationLease ?? smokeVolumePresentationPool.emit(
      volume.centre,
      volume.startsAtMs,
      volume.expiresAtMs,
      volume.radiusM,
    );
    const observedCorridorIds = existing?.observedCorridorIds ?? new Set<string>();
    for (const corridor of volume.corridors) {
      if (observedCorridorIds.has(corridor.id)) continue;
      const direction = new THREE.Vector3(
        corridor.end.x - corridor.start.x,
        corridor.end.y - corridor.start.y,
        corridor.end.z - corridor.start.z,
      );
      smokeVolumePresentationPool.disturb(presentationLease, direction, 0.82, corridor.createdAtHostTimeMs);
    }
    observedCorridorIds.clear();
    for (const corridor of volume.corridors) observedCorridorIds.add(corridor.id);
    const runtime: RuntimeSmokeVolume = {
      id: volume.id,
      centre: volume.centre,
      radiusM: volume.radiusM,
      startsAtMs: volume.startsAtMs,
      expiresAtMs: volume.expiresAtMs,
      corridors: [...volume.corridors],
      observedCorridorIds,
      presentationLease,
    };
    smokeVolumePresentationPool.update(presentationLease, nowHostTimeMs);
    synchronized.push(runtime);
  }
  smokeVolumes.splice(0, smokeVolumes.length, ...synchronized);
}

function updateSmokePresentationLeases(nowHostTimeMs: number): void {
  for (const volume of smokeVolumes) {
    smokeVolumePresentationPool.update(volume.presentationLease, nowHostTimeMs);
  }
}

function smokeStateMessage(nowHostTimeMs = currentHostTimeMs()): SmokeStateMessage {
  return {
    type: 'smoke-state',
    schemaVersion: SMOKE_AUTHORITY_SCHEMA_VERSION,
    by: player.id,
    snapshot: smokeAuthority.snapshot(nowHostTimeMs),
    nonce: randomNonce(),
  };
}

function broadcastSmokeState(
  forceReliable = false,
  nowHostTimeMs = currentHostTimeMs(),
  authorityChanged = false,
): void {
  if (network.role !== 'host' || !gameStarted) return;
  const repairWindowDue = smokeVolumes.length > 0 && nowHostTimeMs - lastSmokeStateBroadcastAt >= 250;
  // Avoid constructing a deeply frozen authority snapshot on every render frame.
  // Changed revisions still leave immediately; unchanged active smoke retains
  // the existing four-Hz repair cadence for packet-loss and late-join recovery.
  if (!forceReliable && !authorityChanged && !repairWindowDue) return;
  const message = smokeStateMessage(nowHostTimeMs);
  const repairDue = message.snapshot.volumes.length > 0 && nowHostTimeMs - lastSmokeStateBroadcastAt >= 250;
  if (!forceReliable && message.snapshot.revision === lastSmokeStateBroadcastRevision && !repairDue) return;
  network.send(message);
  if (forceReliable) network.sendStateCommitReliably(message);
  lastSmokeStateBroadcastRevision = message.snapshot.revision;
  lastSmokeStateBroadcastAt = nowHostTimeMs;
}

function spawnSmokeVolume(point: THREE.Vector3, nowHostTimeMs: number, actionNonce: number, ownerId: string): string | null {
  if (network.role === 'client') return null;
  const centre = point.clone().add(new THREE.Vector3(0, 1.25, 0));
  const accepted = smokeAuthority.registerVolume({
    matchEpoch: interactiveWorldMatchEpoch,
    ownerId,
    actionNonce,
    centre,
    startsAtHostTimeMs: nowHostTimeMs,
  });
  if (!accepted) return null;
  const snapshot = smokeAuthority.snapshot(nowHostTimeMs);
  synchronizeSmokePresentation(snapshot, nowHostTimeMs);
  broadcastSmokeState(true, nowHostTimeMs);
  return `smoke-${ownerId}-${actionNonce}`;
}

function traceAuthoritativeSmokeShotSegments(
  origin: THREE.Vector3,
  directions: readonly THREE.Vector3[],
  weapon: WeaponId,
): SmokeShotSegment[] {
  return directions.slice(0, 12).map((rawDirection, pelletIndex) => {
    const direction = rawDirection.clone().normalize();
    const requestedDistance = weapon === 'railgun' ? RAILGUN_BEAM_LENGTH_M : 110;
    const trace = traceWeaponPath(origin, direction, requestedDistance, weapon);
    const end = origin.clone().addScaledVector(direction, trace.travelDistance);
    return Object.freeze({
      pelletIndex,
      start: Object.freeze({ x: origin.x, y: origin.y, z: origin.z }),
      end: Object.freeze({ x: end.x, y: end.y, z: end.z }),
    });
  });
}

function admitAuthoritativeSmokeSegments(
  shotResultId: string,
  segments: readonly SmokeShotSegment[],
  nowHostTimeMs: number,
): number {
  if (network.role === 'client') return 0;
  const result = smokeAuthority.admitShot({
    matchEpoch: interactiveWorldMatchEpoch,
    shotResultId,
    resolvedAtHostTimeMs: nowHostTimeMs,
    segments,
  });
  if (!result.accepted || result.createdCorridorIds.length === 0) return 0;
  synchronizeSmokePresentation(smokeAuthority.snapshot(nowHostTimeMs), nowHostTimeMs);
  broadcastSmokeState(false, nowHostTimeMs, true);
  return result.createdCorridorIds.length;
}

function admitAuthoritativeSmokeShot(
  shotResultId: string,
  origin: THREE.Vector3,
  directions: readonly THREE.Vector3[],
  weapon: WeaponId,
  nowHostTimeMs: number,
): number {
  if (weapon === 'explosive-crossbow') return 0;
  return admitAuthoritativeSmokeSegments(
    shotResultId,
    traceAuthoritativeSmokeShotSegments(origin, directions, weapon),
    nowHostTimeMs,
  );
}

function flashLookDirection(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')).normalize();
}

function flashVictimAdmission(
  point: THREE.Vector3,
  entity: GrenadeEntity,
  targetId: string,
  targetLifeId: number,
  targetTeam: Team,
  eyes: THREE.Vector3,
  lookDirection: THREE.Vector3,
): FlashVictimAdmission | null {
  const solidOccluded = activeWorldColliders().some((box) => segmentIntersectsBox(point, eyes, box));
  const exposure = calculateFlashExposure({
    origin: point,
    eyes,
    lookDirection,
    maximumRadiusM: 14,
    solidOccluded,
    // Self-flash uses the full host calculation; only a distinct friendly
    // combatant receives the frozen exact 0.5 duration/intensity multiplier.
    friendly: entity.ownerId !== targetId && entity.ownerTeam === targetTeam,
  });
  return exposure.accepted ? Object.freeze({
    targetId,
    targetLifeId,
    intensity: exposure.intensity,
    durationMs: exposure.durationMs,
  }) : null;
}

function clearLocalFlashPresentation(): void {
  flashExposureUntilHostTimeMs = 0;
  flashExposureStrength = 0;
  lastFlashResultAdmission = null;
  const overlay = element<HTMLElement>('#ordnance-flash');
  overlay.hidden = true;
  overlay.style.opacity = '0';
}

function resetFlashVictimLife(): void {
  flashVictimConsumer.reset(interactiveWorldMatchEpoch, player.id, localContinuity);
  clearLocalFlashPresentation();
}

function applyAuthoritativeFlashResult(result: FlashResult): boolean {
  const estimatedHostNowMs = currentHostTimeMs();
  const admission = flashVictimConsumer.admit(result, estimatedHostNowMs);
  if (!admission.accepted) return false;
  const presentation = flashbangPresentation(admission.intensity, accessibilityRuntime.reducedSensory);
  const effectiveRemainingMs = Math.min(admission.remainingDurationMs, presentation.recoveryMs);
  flashExposureStrength = Math.max(flashExposureStrength, presentation.whiteoutOpacity);
  flashExposureUntilHostTimeMs = Math.max(flashExposureUntilHostTimeMs, estimatedHostNowMs + effectiveRemainingMs);
  audio.flashbang(presentation.audioGain);
  lastFlashResultAdmission = Object.freeze({
    resultId: result.resultId,
    intensity: admission.intensity,
    remainingDurationMs: effectiveRemainingMs,
    reducedSensory: accessibilityRuntime.reducedSensory,
    audioGain: presentation.audioGain,
  });
  return true;
}

function dispatchAuthoritativeFlashResult(result: FlashResult): void {
  lastAuthoredFlashResults.set(result.targetId, result);
  if (result.targetId === player.id) {
    lastFlashDispatch = Object.freeze({
      targetId: result.targetId,
      resultId: result.resultId,
      messageValid: true,
      delivery: applyAuthoritativeFlashResult(result) ? 'local' : 'failed',
    });
    return;
  }
  if (network.role !== 'host') return;
  const message: FlashResultMessage = {
    type: 'flash-result',
    schemaVersion: FLASH_AUTHORITY_SCHEMA_VERSION,
    by: player.id,
    forPlayerId: result.targetId,
    result,
    nonce: randomNonce(),
  };
  const messageValid = isFlashResultMessage(message);
  const sent = messageValid && network.sendToPlayer(result.targetId, message);
  lastFlashDispatch = Object.freeze({
    targetId: result.targetId,
    resultId: result.resultId,
    messageValid,
    delivery: sent ? 'sent' : 'failed',
  });
}

function applyFlashGrenade(point: THREE.Vector3, entity: GrenadeEntity, nowHostTimeMs: number): void {
  // Clients may predict only projectile/world presentation. Human and AI flash
  // authority is resolved once by the host (or by the offline host runtime).
  if (network.role === 'client') return;
  const humanVictims: FlashVictimAdmission[] = [];
  if (player.alive) {
    const local = flashVictimAdmission(
      point,
      entity,
      player.id,
      localContinuity,
      player.team,
      player.position,
      flashLookDirection(player.yaw, player.pitch),
    );
    if (local) humanVictims.push(local);
  }
  if (network.role === 'host') {
    for (const remote of remotes.values()) {
      const health = remoteHealthAuthorities.get(remote.snapshot.id);
      if (!health?.alive || remote.snapshot.hp <= 0) continue;
      const admitted = flashVictimAdmission(
        point,
        entity,
        remote.snapshot.id,
        remoteFlashVictimLifeIds.get(remote.snapshot.id) ?? remote.continuity,
        remote.snapshot.team,
        new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z),
        flashLookDirection(remote.snapshot.yaw, remote.snapshot.pitch),
      );
      if (admitted) humanVictims.push(admitted);
    }
  }
  const activationId = flashActivationId(interactiveWorldMatchEpoch, entity.ownerId, entity.actionNonce);
  const resolution = flashHostAuthority.resolveDetonation({
    matchEpoch: interactiveWorldMatchEpoch,
    activationId,
    startsAtHostTimeMs: nowHostTimeMs,
    victims: humanVictims,
  });
  if (resolution.accepted) for (const result of resolution.results) dispatchAuthoritativeFlashResult(result);

  if (!shouldResolveFlashAgainstBots(network.role, entity.ownerKind)) return;
  for (const bot of bots.values()) {
    if (!bot.alive) continue;
    const botEyes = bot.position.clone().add(new THREE.Vector3(0, 1.42, 0));
    const botOccluded = activeWorldColliders().some((box) => segmentIntersectsBox(point, botEyes, box));
    const botLook = new THREE.Vector3(Math.sin(bot.root.rotation.y), 0, -Math.cos(bot.root.rotation.y));
    const botExposure = calculateFlashExposure({
      origin: point,
      eyes: botEyes,
      lookDirection: botLook,
      maximumRadiusM: 14,
      solidOccluded: botOccluded,
      friendly: entity.ownerId !== bot.id && bot.team === entity.ownerTeam,
    });
    if (!botExposure.accepted) continue;
    const toFlash = point.clone().sub(botEyes);
    const facingDot = toFlash.lengthSq() > 1e-8 ? toFlash.normalize().dot(botLook) : 1;
    const admission = admitBotFlash(bot.perception, {
      isHost: true,
      matchEpoch: interactiveWorldMatchEpoch,
      targetLifeId: bot.continuity,
      resultId: `${activationId}:target:${bot.id}:${bot.continuity}`,
      hostTimeMs: nowHostTimeMs,
      durationMs: botExposure.durationMs,
      intensity: botExposure.intensity,
      facingDot,
      hasLineOfSight: !botOccluded,
    });
    if (!admission.accepted) continue;
    bot.perception = admission.state;
    bot.perceptionCanFire = false;
    bot.perceptionAimError = 0.18;
    bot.hasLineOfSight = false;
    bot.sightStartedAt = 0;
    bot.burstShots = 0;
    bot.root.userData.flashBlindedUntil = admission.state.blindUntilHostTimeMs;
  }
}

function updateOrdnanceVolumes(_now: number): void {
  const nowHostTimeMs = currentHostTimeMs();
  const authorityChanged = smokeAuthority.advance(nowHostTimeMs);
  if (authorityChanged) synchronizeSmokePresentation(smokeAuthority.snapshot(nowHostTimeMs), nowHostTimeMs);
  else updateSmokePresentationLeases(nowHostTimeMs);
  broadcastSmokeState(authorityChanged, nowHostTimeMs, authorityChanged);
  const overlay = element<HTMLElement>('#ordnance-flash');
  const remainingFlash = flashExposureUntilHostTimeMs - nowHostTimeMs;
  if (remainingFlash <= 0) {
    flashExposureStrength = 0;
    overlay.hidden = true;
    overlay.style.opacity = '0';
  } else {
    overlay.hidden = false;
    overlay.style.opacity = String(Math.min(1, flashExposureStrength * Math.min(1, remainingFlash / 550)));
  }
}

function explodeGrenade(entity: GrenadeEntity): void {
  const started = performance.now();
  const point = entity.mesh.position.clone();
  releaseGrenadeWorldPresentation(entity.mesh);
  releaseBotGrenadeOwner(entity);
  const afterPresentationDetach = performance.now();
  if (entity.grenade === 'smoke') {
    audio.coverImpact(point.distanceTo(player.position));
    spawnSmokeVolume(point, afterPresentationDetach, entity.actionNonce, entity.ownerId);
    return;
  }
  if (entity.grenade === 'flash') {
    spawnImpactFlash(point, 'metal');
    applyFlashGrenade(point, entity, afterPresentationDetach);
    return;
  }
  audio.explosion(afterPresentationDetach);
  const afterAudio = performance.now();
  spawnGrenadeExplosionVisual(point, afterAudio);
  const attachedTargetId = entity.attachedTargetId;
  const attachedTargetLifeId = entity.attachedTargetLifeId;
  let liveAttachedTargetFound = false;
  if (entity.grenade === 'semtex' && attachedTargetId !== null && attachedTargetLifeId !== null) {
    fillExplosiveBoltTargets(entity.ownerId, entity.ownerTeam);
    liveAttachedTargetFound = explosiveBoltTargetBuffer.findIndex(attachedTargetId, attachedTargetLifeId) >= 0;
  }
  const sealedAttachment = entity.grenade === 'semtex' && liveAttachedTargetFound
    ? sealReceiverStickyDetonation({
        ownerId: entity.ownerId,
        ownerLifeId: entity.ownerLifeId,
        source: 'semtex',
        actionNonce: entity.actionNonce,
        origin: point.toArray() as [number, number, number],
        detonatedAtMs: started,
        currentAttachmentTarget: { id: attachedTargetId!, lifeId: attachedTargetLifeId! },
      })
    : null;
  const semtexStuckToLiveActor = network.role === 'client'
    ? liveAttachedTargetFound
    : sealedAttachment !== null;
  const blastRadius = entity.grenade === 'semtex'
    ? semtexBlastRadiusM(semtexStuckToLiveActor)
    : GRENADE_RADIUS;
  if (entity.ownerKind !== 'remote') {
    breakWindowsInGrenadeBlast(point, entity.actionNonce, entity.ownerKind === 'player', blastRadius);
  }
  const afterVisual = performance.now();
  // Remote grenades are presentation-only. Authoritative hit/window events are the sole mutation path.
  if (entity.ownerKind === 'remote') return;
  const blastDamage = (distance: number, prone = false): number => entity.grenade === 'semtex'
    ? semtexBlastDamage(distance, prone, semtexStuckToLiveActor)
    : grenadeDamage(distance);
  applyInteractiveWorldExplosion(
    point,
    blastRadius,
    entity.grenade === 'semtex' ? blastDamage(0) : 100,
    'grenade-major-collapse',
  );
  if (entity.ownerKind === 'bot') {
    const blocked = activeWorldColliders().some((box) => segmentIntersectsBox(point, player.position, box));
    const distance = player.position.distanceTo(point);
    const damage = blocked ? 0 : botScaledDamage(blastDamage(distance, player.stance === 'prone'));
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
    const blocked = activeWorldColliders().some((box) => segmentIntersectsBox(point, target, box));
    const distance = bot.position.distanceTo(point);
    const damage = blocked ? 0 : outgoingDamage(blastDamage(distance), afterAudio);
    if (damage > 0) applyBotDamage(bot, damage, 'body', { kind: 'grenade' });
  }
  const blastNonce = entity.actionNonce;
  for (const remote of remotes.values()) {
    const target = remote.target.clone().add(new THREE.Vector3(0, 1.1, 0));
    if (activeWorldColliders().some((box) => segmentIntersectsBox(point, target, box))) continue;
    const distance = target.distanceTo(point);
    const baseDamage = blastDamage(distance, remote.snapshot.stance === 'prone');
    if (baseDamage > 0) sendAuthoritativeHit({
      type: 'hit', by: player.id, target: remote.snapshot.id, damage: Math.min(100, baseDamage), kind: 'explosive',
      explosiveSource: 'grenade', origin: point.toArray(), actionNonce: blastNonce, nonce: randomNonce(),
      ...(semtexStuckToLiveActor ? { stuck: true as const } : {}),
    });
  }
  const afterTargets = performance.now();
  const selfBlocked = activeWorldColliders().some((box) => segmentIntersectsBox(point, player.position, box));
  const selfDamage = selfBlocked ? 0 : blastDamage(player.position.distanceTo(point), player.stance === 'prone') * 0.35;
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

function grenadeDetonatesOnFirstImpact(grenade: GrenadeId): boolean {
  return grenade === 'flash' || grenade === 'smoke';
}

function armImpactGrenade(
  grenade: GrenadeEntity,
  now: number,
  position: THREE.Vector3,
  targetId: string | null = null,
  targetLifeId: number | null = null,
  targetKind: ExplosiveBoltTargetKind | null = null,
): void {
  if (grenade.impactedAt !== null) return;
  grenade.impactedAt = now;
  grenade.mesh.position.copy(position);
  grenade.velocity.set(0, 0, 0);
  grenade.angularVelocity.set(0, 0, 0);
  grenade.attachedTargetId = targetId;
  grenade.attachedTargetLifeId = targetLifeId;
  if (grenadeDetonatesOnFirstImpact(grenade.grenade)) {
    grenade.explodeAt = now;
    grenade.nextFuseBeepAt = Number.POSITIVE_INFINITY;
  } else if (grenade.grenade === 'semtex') {
    grenade.explodeAt = now + SEMTEX_HITL_CONTRACT.fuseMs;
    grenade.nextFuseBeepAt = now;
    if (targetId !== null && targetLifeId !== null && targetKind !== null) {
      const remoteGrenadeAuthority = grenade.ownerKind === 'remote'
        ? remoteGrenadeAuthorities.get(grenade.ownerId)
        : undefined;
      const receiverCanAuthorAttachment = grenade.ownerKind !== 'remote'
        || remoteGrenadeAuthority !== undefined
          && remoteGrenadeForAction(remoteGrenadeAuthority, grenade.actionNonce) === 'semtex'
          && remoteGrenadeLifeForAction(remoteGrenadeAuthority, grenade.actionNonce) === grenade.ownerLifeId;
      if (receiverCanAuthorAttachment) recordReceiverStickyAttachment({
        ownerId: grenade.ownerId,
        ownerLifeId: grenade.ownerLifeId,
        source: 'semtex',
        actionNonce: grenade.actionNonce,
        targetId,
        targetLifeId,
        attachedAtMs: now,
        expiresAtMs: grenade.explodeAt + STICKY_AUTHORITY_POST_DETONATION_LIFETIME_MS,
      });
      if (targetKind === 'player') addFeed('STUCK', 'coral');
      else if (grenade.ownerKind === 'player') addFeed('STUCK', 'gold');
    }
  }
  audio.coverImpact(position.distanceTo(player.position));
}

function updateGrenades(dt: number, now: number): void {
  updateOrdnanceVolumes(now);
  for (let index = grenades.length - 1; index >= 0; index -= 1) {
    const grenade = grenades[index];
    const fuseRemainingMs = grenade.explodeAt - now;
    if (!grenadeDetonatesOnFirstImpact(grenade.grenade) && fuseRemainingMs <= GRENADE_FUSE_BEEP_START_MS && now >= grenade.nextFuseBeepAt) {
      audio.grenadeFuseBeep(fuseRemainingMs, now);
      grenade.nextFuseBeepAt = now + grenadeFuseBeepIntervalMs(fuseRemainingMs);
    }
    if (grenade.impactedAt !== null) {
      if (grenade.attachedTargetId !== null && grenade.attachedTargetLifeId !== null) {
        fillExplosiveBoltTargets(grenade.ownerId, grenade.ownerTeam);
        const attachedTargetIndex = explosiveBoltTargetBuffer.findIndex(grenade.attachedTargetId, grenade.attachedTargetLifeId);
        if (attachedTargetIndex >= 0) grenade.mesh.position.copy(explosiveBoltTargetBuffer.at(attachedTargetIndex).position);
      }
      if (now >= grenade.explodeAt) {
        grenades.splice(index, 1);
        explodeGrenade(grenade);
      }
      continue;
    }
    grenade.velocity.y -= 18 * dt;
    grenade.mesh.rotation.x += grenade.angularVelocity.x * dt;
    grenade.mesh.rotation.y += grenade.angularVelocity.y * dt;
    grenade.mesh.rotation.z += grenade.angularVelocity.z * dt;
    const start = grenade.mesh.position.clone();
    const delta = grenade.velocity.clone().multiplyScalar(dt);
    const collision = sweepSphereAgainstBoxes(start, delta, activeWorldColliders());
    let targetHitIndex = -1;
    let targetFraction = 2;
    if (grenadeDetonatesOnFirstImpact(grenade.grenade) || grenade.grenade === 'semtex') {
      const targetCount = fillExplosiveBoltTargets(grenade.ownerId, grenade.ownerTeam);
      for (let targetIndex = 0; targetIndex < targetCount; targetIndex += 1) {
        const target = explosiveBoltTargetBuffer.at(targetIndex);
        const fraction = segmentSphereFraction(start, delta, target.position, 0.58);
        if (fraction !== null && fraction < targetFraction) {
          targetHitIndex = targetIndex;
          targetFraction = fraction;
        }
      }
    }
    const worldFraction = collision?.time ?? 2;
    if (targetHitIndex >= 0 && targetFraction <= worldFraction) {
      const targetHit = explosiveBoltTargetBuffer.at(targetHitIndex);
      armImpactGrenade(
        grenade,
        now,
        start.clone().addScaledVector(delta, targetFraction),
        targetHit.id,
        targetHit.lifeId,
        targetHit.kind,
      );
    } else if (collision && (grenadeDetonatesOnFirstImpact(grenade.grenade) || grenade.grenade === 'semtex')) {
      const collisionNormal = new THREE.Vector3(collision.normal.x, collision.normal.y, collision.normal.z);
      armImpactGrenade(grenade, now, start.clone().addScaledVector(delta, collision.time).addScaledVector(collisionNormal, 0.025));
    } else if (collision) {
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
    if (grenade.impactedAt !== null && now >= grenade.explodeAt) {
      grenades.splice(index, 1);
      explodeGrenade(grenade);
      continue;
    }
    if (!pointInsideBounds(grenade.mesh.position, arena.bounds, 0.16)) {
      const impact = clampPointToBounds(grenade.mesh.position, arena.bounds, 0.16);
      grenade.mesh.position.set(impact.x, impact.y, impact.z);
      if (grenadeDetonatesOnFirstImpact(grenade.grenade) || grenade.grenade === 'semtex') {
        armImpactGrenade(grenade, now, grenade.mesh.position);
        if (grenadeDetonatesOnFirstImpact(grenade.grenade)) {
          grenades.splice(index, 1);
          explodeGrenade(grenade);
        }
        continue;
      }
      spawnImpactFlash(grenade.mesh.position.clone());
      audio.coverImpact(grenade.mesh.position.distanceTo(player.position));
      releaseGrenadeWorldPresentation(grenade.mesh);
      releaseBotGrenadeOwner(grenade);
      grenades.splice(index, 1);
      continue;
    }
    if (grenade.mesh.position.y < 0.18) {
      if (grenadeDetonatesOnFirstImpact(grenade.grenade) || grenade.grenade === 'semtex') {
        grenade.mesh.position.y = 0.18;
        armImpactGrenade(grenade, now, grenade.mesh.position);
        if (grenadeDetonatesOnFirstImpact(grenade.grenade)) {
          grenades.splice(index, 1);
          explodeGrenade(grenade);
        }
        continue;
      }
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
      const pose = flyingCatPose(now);
      target.root.position.set(...pose.position);
      target.root.rotation.set(pose.pitchRadians, pose.yawRadians, pose.rollRadians);
      const tail = target.root.getObjectByName('flying-black-cat-tail');
      if (tail) tail.rotation.z = 0.3 + Math.sin(pose.tailPhase) * 0.18;
      const trail = target.root.userData.starTrail as THREE.Mesh[] | undefined;
      trail?.forEach((star, index) => {
        star.rotation.z = pose.trailPhase * (0.72 + index * 0.035) + index;
        const pulse = 0.72 + Math.sin(pose.trailPhase - index * 0.9) * 0.18;
        star.scale.setScalar(Math.max(0.2, pulse * (1 - index * 0.075)));
      });
    }
  }
}

function spawnImpactFlash(
  point: THREE.Vector3,
  surface: ImpactPresentationSurface = 'concrete',
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

function showDamageNumber(
  damage: number,
  zone: HitZone,
  healthBefore?: number,
  worldAnchor?: SupportDamageScreenAnchor & Readonly<{ targetId: string }>,
): void {
  const presentation = damageNumberPresentation(damage, zone, healthBefore);
  if (!presentation || worldAnchor && !worldAnchor.visible) return;
  const root = element<HTMLElement>('#damage-numbers');
  root.dataset.lastDamage = String(presentation.amount);
  root.dataset.lastOverkill = String(presentation.overkill);
  root.dataset.lastCritical = String(presentation.critical);
  root.dataset.lastLabel = presentation.label;
  const row = document.createElement('strong');
  row.textContent = presentation.label;
  row.dataset.damage = String(presentation.amount);
  row.classList.toggle('critical', presentation.critical);
  if (worldAnchor) {
    row.classList.add('support-hit', 'world-anchored');
    row.dataset.targetId = worldAnchor.targetId;
    row.dataset.anchorSource = 'authoritative-target-position';
    row.textContent = `× ${presentation.label}`;
    row.style.setProperty('--damage-screen-x', `${worldAnchor.xPx.toFixed(2)}px`);
    row.style.setProperty('--damage-screen-y', `${worldAnchor.yPx.toFixed(2)}px`);
  } else {
    row.style.setProperty('--damage-lane', String((root.childElementCount % 7) - 3));
  }
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

function syncFieldSupportRows(loadout: KillstreakLoadoutV1): void {
  loadout.slots.forEach((id, index) => {
    const row = document.querySelector<HTMLElement>(`[data-support-slot="${index + 1}"]`);
    const definition = FIELD_SUPPORT.find((entry) => entry.id === id);
    if (!row || !definition) return;
    row.dataset.support = id;
    const key = row.querySelector<HTMLElement>('kbd');
    const threshold = row.querySelector<HTMLElement>('.support-meta small');
    const name = row.querySelector<HTMLElement>('.support-name');
    if (key) key.textContent = String(index + 3);
    if (threshold) threshold.textContent = `${definition.eliminations} KILLS`;
    if (name) name.textContent = definition.name.toUpperCase();
  });
}

function updateFieldSupportHud(): void {
  const fieldSupport = localFieldSupportProjection();
  element<HTMLElement>('#support-streak').textContent = `STREAK ${fieldSupport.streak}`;
  document.querySelectorAll<HTMLElement>('[data-support]').forEach((item) => {
    const support = item.dataset.support as FieldSupportId;
    const ready = fieldSupport.available[support] === true;
    item.classList.toggle('ready', ready);
    item.classList.toggle('controller-selected', support === gamepadSupportSelection);
    const state = item.querySelector<HTMLElement>('.support-state');
    const charges = fieldSupport.availableCharges[support];
    if (state) state.textContent = ready ? charges > 1 ? `READY ×${charges}` : 'READY' : 'LOCKED';
  });
  refreshSupportStatusHud(performance.now(), true);
}

function localKillstreakActorSnapshot(): KillstreakRecipientSnapshot['actors'][number] | null {
  return killstreakSnapshot.actors.find((actor) => actor.actorId === player.id) ?? null;
}

function localFieldSupportProjection() {
  return projectFieldSupportActor(
    localKillstreakActorSnapshot(),
    killstreakLoadoutController.activeMatch ?? killstreakLoadoutController.selected,
  );
}

function preferredOwnedSupportEntity(): KillstreakRecipientSnapshot['entities'][number] | undefined {
  const possession = localKillstreakActorSnapshot()?.possession;
  let firstOwned: KillstreakRecipientSnapshot['entities'][number] | undefined;
  let nearestControllable: KillstreakRecipientSnapshot['entities'][number] | undefined;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const entity of killstreakSnapshot.entities) {
    if ((entity.kind !== 'chopper' && entity.kind !== 'drone')
      || entity.ownerId !== player.id || entity.expiresInMs <= 0) continue;
    firstOwned ??= entity;
    if (possession) {
      if (entity.id === possession.entityId) return entity;
      continue;
    }
    if (entity.kind !== 'chopper' && entity.mode !== 'piloted') continue;
    const dx = entity.position[0] - player.position.x;
    const dy = entity.position[1] - player.position.y;
    const dz = entity.position[2] - player.position.z;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    if (distanceSquared >= nearestDistanceSquared) continue;
    nearestDistanceSquared = distanceSquared;
    nearestControllable = entity;
  }
  if (possession) return undefined;
  return nearestControllable ?? firstOwned;
}

function updateSupportStatusHud(): void {
  const actor = localKillstreakActorSnapshot();
  const adrenalineRemainingMs = Math.max(0, actor?.adrenalineRemainingMs ?? 0);
  const adrenalineActive = adrenalineRemainingMs > 0;
  const adrenalineHud = element<HTMLElement>('#adrenaline-hud');
  adrenalineHud.hidden = !adrenalineActive;
  element<HTMLElement>('#adrenaline-time').textContent = (adrenalineRemainingMs / 1_000).toFixed(1);
  if (adrenalineActive !== adrenalineHudWasActive) {
    audio.adrenalineState(adrenalineActive);
    adrenalineHudWasActive = adrenalineActive;
  }

  const possession = actor?.possession;
  const ownedSupport = preferredOwnedSupportEntity();
  const feedback = element<HTMLElement>('#support-combat-feedback');
  feedback.hidden = !ownedSupport;
  feedback.dataset.supportKind = ownedSupport?.kind ?? 'none';
  feedback.dataset.possessed = String(Boolean(possession && ownedSupport?.id === possession.entityId));
  liveSupportActivationIds.clear();
  for (const entity of killstreakSnapshot.entities) {
    if ((entity.kind === 'chopper' || entity.kind === 'drone') && entity.ownerId === player.id && entity.expiresInMs > 0) {
      liveSupportActivationIds.add(entity.activationId);
    }
  }
  for (const activationId of supportDamageDealtByActivation.keys()) {
    if (!liveSupportActivationIds.has(activationId)) supportDamageDealtByActivation.delete(activationId);
  }
  if (ownedSupport) {
    const platformName = ownedSupport.kind === 'chopper'
      ? 'CHOPPER GUNNER'
      : ownedSupport.mode === 'swarm' ? 'HUNTER DRONE SWARM' : 'PILOTED HUNTER DRONE';
    element<HTMLElement>('#support-platform-name').textContent = platformName;
    element<HTMLElement>('#support-platform-mode').textContent = possession ? 'PLAYER GUN · AI FLIGHT' : 'AUTONOMOUS · AI FLIGHT';
    element<HTMLElement>('#support-platform-health').textContent = String(Math.max(0, Math.round(ownedSupport.health)));
    element<HTMLElement>('#support-platform-ammo').textContent = ownedSupport.magazine === null ? 'BELT' : String(ownedSupport.magazine);
    element<HTMLElement>('#support-platform-time').textContent = (ownedSupport.expiresInMs / 1_000).toFixed(1);
    element<HTMLElement>('#support-platform-altitude').textContent = `${Math.max(0, Math.round(ownedSupport.position[1] - (arena.bounds.minY ?? 0)))}`;
    element<HTMLElement>('#support-platform-speed').textContent = String(Math.round(Math.hypot(ownedSupport.velocity[0], ownedSupport.velocity[1], ownedSupport.velocity[2])));
    element<HTMLElement>('#support-control-action').textContent = possession
      ? 'HOLD F · EXIT · AI FLIGHT CONTINUES'
      : ownedSupport.mode === 'swarm' ? 'AUTONOMOUS TARGETING' : 'HOLD F · ENTER · AI FLIGHT CONTINUES';
  }
  element<HTMLElement>('#chopper-damage-dealt').textContent = String(Math.round(
    ownedSupport ? supportDamageDealtByActivation.get(ownedSupport.activationId) ?? 0 : 0,
  ));
}

function refreshSupportStatusHud(now: number, force = false): void {
  if (!force && now - lastSupportStatusHudRefreshAt < SUPPORT_STATUS_HUD_REFRESH_INTERVAL_MS) return;
  lastSupportStatusHudRefreshAt = now;
  updateSupportStatusHud();
}

function fInteractionCandidates(now = performance.now()): readonly InteractionCandidate[] {
  if (!player.alive || matchState.phase !== 'active') return [];
  const candidates: InteractionCandidate[] = [];
  const actor = localKillstreakActorSnapshot();
  if (actor?.possession) {
    candidates.push({
      kind: 'support-exit',
      targetId: actor.possession.entityId,
      proximityM: 0,
      prompt: actor.possession.kind === 'chopper-gunner' ? 'EXIT CHOPPER GUNNER' : 'EXIT DRONE - AUTONOMOUS CONTROL',
    });
  }
  if (!actor?.possession) {
    for (const entity of killstreakSnapshot.entities) {
      if (entity.ownerId !== player.id || entity.expiresInMs <= 0) continue;
      const proximity = Math.hypot(
        entity.position[0] - player.position.x,
        entity.position[1] - player.position.y,
        entity.position[2] - player.position.z,
      );
      if (entity.kind === 'drone' && entity.mode === 'piloted') {
        candidates.push({ kind: 'support-enter-drone', targetId: entity.id, proximityM: proximity, prompt: 'ENTER DRONE - FIRST PERSON' });
      } else if (entity.kind === 'chopper') {
        candidates.push({ kind: 'support-enter-chopper', targetId: entity.id, proximityM: proximity, prompt: 'ENTER CHOPPER GUNNER - FIRST PERSON' });
      }
    }
  }

  const playerEye = { x: player.position.x, y: player.position.y + 1.1, z: player.position.z };
  const activeCareCrateId = careCaptureCrateId(localCareCaptureState);
  for (const crate of killstreakSnapshot.entities) {
    if (crate.kind !== 'care-crate' || crate.phase !== 'landed' || crate.id === activeCareCrateId) continue;
    const proximity = Math.hypot(crate.position[0] - player.position.x, crate.position[1] - player.position.y, crate.position[2] - player.position.z);
    const lineOfSight = proximity <= 2.75 && !arena.colliders.some((box) => segmentIntersectsBox(
      playerEye,
      { x: crate.position[0], y: crate.position[1] + 0.45, z: crate.position[2] },
      box,
    ));
    candidates.push({ kind: 'care-package', targetId: crate.id, proximityM: proximity, prompt: 'COLLECT KILLSTREAK', enabled: lineOfSight });
  }

  const door = interactiveWorldRuntime?.nearestDoor(player.position);
  if (door) candidates.push({ kind: 'shed-door', targetId: door.placementId, proximityM: door.distance, prompt: 'OPEN / CLOSE DOOR', enabled: door.distance <= 2.35 });

  const railgun = railgunPickupNearby();
  const station = nearbyGunRangeWeaponStation();
  const drop = !railgun && !station
    ? nearestDeathDrop(
      deathDrops.map((entity) => entity.drop).filter((entry) => deathDropWeaponAvailable(entry, now)),
      player.position,
      DEATH_DROP_INTERACTION_RANGE,
      now,
      'weapon',
    )
    : null;
  if (railgun) candidates.push({ kind: 'weapon-pickup', targetId: 'railgun', proximityM: 0, prompt: `PICK UP ${WEAPONS.railgun.name.toUpperCase()}` });
  else if (station) candidates.push({ kind: 'weapon-pickup', targetId: `station:${station.weapon}`, proximityM: 0, prompt: `${rangePrimaryUnlocked && station.weapon === player.primaryWeapon ? 'REFILL' : 'EQUIP'} ${WEAPONS[station.weapon].name.toUpperCase()}` });
  else if (drop) candidates.push({ kind: 'weapon-pickup', targetId: drop.id, proximityM: Math.hypot(drop.position.x - player.position.x, drop.position.y - player.position.y, drop.position.z - player.position.z), prompt: `${drop.weapon === player.primaryWeapon ? 'REPLENISH' : 'PICK UP'} ${WEAPONS[drop.weapon].name.toUpperCase()}` });
  return candidates;
}

function selectedFInteraction(now = performance.now()): InteractionCandidate | null {
  return primaryInteraction(fInteractionCandidates(now));
}

function applyFInteractionTransition(
  transition: ReturnType<typeof reduceFInteractionPress>,
): boolean {
  if (transition.state !== fInteractionPressState || transition.commit || transition.cancellation) {
    lastFInteractionTransition = transition;
  }
  fInteractionPressState = transition.state;
  if (!transition.commit) return false;
  return executePinnedFInteraction(transition.commit.candidate, transition.commit.committedAtMs);
}

function beginFInteractionPress(now = performance.now()): boolean {
  return applyFInteractionTransition(reduceFInteractionPress(fInteractionPressState, {
    type: 'press',
    pressId: ++fInteractionPressSequence,
    nowMs: now,
    matchEpoch: killstreakMatchEpoch,
    lifeId: localContinuity,
    inputEligible: gameplayInputEnabled(),
    candidates: fInteractionCandidates(now),
  }));
}

function advanceFInteractionPress(now = performance.now()): boolean {
  return applyFInteractionTransition(reduceFInteractionPress(fInteractionPressState, {
    type: 'advance',
    nowMs: now,
    matchEpoch: killstreakMatchEpoch,
    lifeId: localContinuity,
    inputEligible: gameplayInputEnabled(),
    candidates: fInteractionCandidates(now),
  }));
}

function releaseFInteractionPress(now = performance.now()): boolean {
  return applyFInteractionTransition(reduceFInteractionPress(fInteractionPressState, {
    type: 'release',
    nowMs: now,
    matchEpoch: killstreakMatchEpoch,
    lifeId: localContinuity,
    inputEligible: gameplayInputEnabled(),
    candidates: fInteractionCandidates(now),
  }));
}

function cancelFInteractionPress(reason: FInteractionCancelReason, now = performance.now()): void {
  if (fInteractionPressState.phase === 'idle') return;
  applyFInteractionTransition(reduceFInteractionPress(fInteractionPressState, { type: 'cancel', nowMs: now, reason }));
}

function updateFInteractionPrompt(now = performance.now()): void {
  const supportPrompt = element<HTMLElement>('#support-interaction-prompt');
  const pickupPrompt = element<HTMLElement>('#pickup-prompt');
  if (pointSupportTargeting && !tacticalMapOpen) {
    cancelFInteractionPress('manual-reset', now);
    supportPrompt.hidden = false;
    pickupPrompt.hidden = true;
    delete supportPrompt.dataset.interactionKind;
    delete supportPrompt.dataset.targetId;
    const label = supportPrompt.querySelector<HTMLElement>('span');
    if (label) label.textContent = 'LEFT CLICK or [F] to confirm target  [ESC] to cancel';
    return;
  }
  advanceFInteractionPress(now);
  const pressedCandidate = fInteractionPressState.phase === 'pressed'
    ? fInteractionPressState.holdCandidate ?? fInteractionPressState.tapCandidate
    : null;
  const selected = fInteractionPressState.phase === 'committed'
    ? null
    : pressedCandidate ?? selectedFInteraction(now);
  const weaponPrompt = selected?.kind === 'weapon-pickup';
  supportPrompt.hidden = !selected || weaponPrompt;
  pickupPrompt.hidden = !selected || !weaponPrompt;
  delete supportPrompt.dataset.interactionKind;
  delete supportPrompt.dataset.targetId;
  delete pickupPrompt.dataset.interactionKind;
  delete pickupPrompt.dataset.targetId;
  delete supportPrompt.dataset.holdActive;
  supportPrompt.style.setProperty('--f-hold-progress', '0%');
  if (!selected) return;
  const prompt = weaponPrompt ? pickupPrompt : supportPrompt;
  prompt.dataset.interactionKind = selected.kind;
  prompt.dataset.targetId = selected.targetId;
  if (!weaponPrompt) {
    const label = supportPrompt.querySelector<HTMLElement>('span');
    const holdInteraction = isHoldInteraction(selected.kind);
    if (label) label.textContent = `${holdInteraction ? 'HOLD F' : 'TAP F'} · ${selected.prompt}`;
    if (holdInteraction && fInteractionPressState.phase === 'pressed') {
      supportPrompt.dataset.holdActive = 'true';
      supportPrompt.style.setProperty('--f-hold-progress', `${(fInteractionHoldProgress(fInteractionPressState, now) * 100).toFixed(1)}%`);
    }
  }
}

function recordOwnerSupportDamage(event: KillstreakDamageEvent): void {
  if (event.ownerId !== player.id || event.damage <= 0) return;
  const targetPosition = new THREE.Vector3(...event.targetPosition);
  if (targetPosition && (event.source === 'chopper' || event.source === 'piloted-drone' || event.source === 'drone-swarm')) {
    const drone = event.source === 'piloted-drone' || event.source === 'drone-swarm';
    spawnTracer(new THREE.Vector3(...event.tracerOrigin), new THREE.Vector3(...event.endpoint), drone ? 0x52e8ff : 0xffc65c);
    audio.supportGun(drone ? 'drone' : 'chopper');
  }
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const anchor = projectSupportDamageAnchor(targetPosition, camera, viewport);
  supportDamageFeedbackTelemetry.record(event, anchor, viewport);
  showDamageNumber(event.damage, 'body', undefined, { ...anchor, targetId: event.targetId });
  audio.hit(false);
  supportDamageDealtByActivation.set(
    event.activationId,
    (supportDamageDealtByActivation.get(event.activationId) ?? 0) + event.damage,
  );
  const displayedSupport = preferredOwnedSupportEntity();
  if (displayedSupport?.activationId === event.activationId) {
    element<HTMLElement>('#chopper-damage-dealt').textContent = String(Math.round(
      supportDamageDealtByActivation.get(event.activationId) ?? 0,
    ));
  }
}

function killstreakActorModifiers(actorId: string, now: number): Readonly<{ damage: number; movement: number; reloadDuration: number }> {
  if (network.role !== 'client') return killstreakRuntime.modifiersForActor(actorId, now);
  const actor = killstreakSnapshot.actors.find((entry) => entry.actorId === actorId);
  const active = (actor?.adrenalineRemainingMs ?? 0) > 0;
  return { damage: active ? 1.1 : 1, movement: active ? 1.1 : 1, reloadDuration: active ? 0.9 : 1 };
}

function killstreakWorldState(): KillstreakWorld {
  const targets: KillstreakWorld['targets'][number][] = [];
  targets.push({
    id: player.id,
    kind: 'player',
    team: player.team,
    lifeId: localContinuity,
    alive: player.alive,
    position: [player.position.x, player.position.y, player.position.z],
  });
  for (const bot of bots.values()) targets.push({
    id: bot.id,
    kind: 'bot',
    team: bot.team,
    lifeId: bot.continuity,
    alive: bot.alive,
    position: [bot.position.x, bot.position.y + 1.15, bot.position.z],
  });
  for (const remote of remotes.values()) targets.push({
    id: remote.snapshot.id,
    kind: 'player',
    team: remote.snapshot.team,
    lifeId: remote.continuity,
    alive: remote.snapshot.hp > 0,
    position: [remote.target.x, remote.target.y + 1.15, remote.target.z],
  });
  const flightNavigation = PASS65_FLIGHT_NAVIGATION[selectedArena.id];
  const centrePortal = [...flightNavigation.portals]
    .sort((left, right) => right.altitudeM - left.altitudeM || left.id.localeCompare(right.id))[0];
  const centreSpawn: [number, number, number] = [
    (arena.bounds.minX + arena.bounds.maxX) / 2
      + (centrePortal?.xQ ?? 0) * (arena.bounds.maxX - arena.bounds.minX) / 2,
    centrePortal?.altitudeM ?? flightNavigation.ceilingY * 0.45,
    (arena.bounds.minZ + arena.bounds.maxZ) / 2
      + (centrePortal?.zQ ?? 0) * (arena.bounds.maxZ - arena.bounds.minZ) / 2,
  ];
  // Centre-spawn admission can run hundreds of bounded probes. Snapshot the
  // current collision authority once so each probe does not rebuild/enumerate
  // the full collider set and introduce an activation hitch.
  const flightSolids = activeWorldColliders();
  let groundSampler: SupportPlacementGroundSampler | null = null;
  const groundHeightAt = (x: number, z: number): number => {
    groundSampler ??= new SupportPlacementGroundSampler({
      bounds: arena.bounds,
      ceilingY: flightNavigation.ceilingY,
      colliders: flightSolids,
      prepareRaycastMeshes: () => {
        arena.root.updateWorldMatrix(true, true);
        return activeRaycastMeshes();
      },
    });
    return groundSampler.heightAt(x, z);
  };
  return {
    bounds: {
      minX: arena.bounds.minX,
      maxX: arena.bounds.maxX,
      minZ: arena.bounds.minZ,
      maxZ: arena.bounds.maxZ,
      floorY: 0,
      ceilingY: flightNavigation.ceilingY,
    },
    targets,
    areHostile: (ownerId, ownerTeam, target) => areCombatantsHostile(ownerId, ownerTeam, target.id, target.team),
    hasLineOfSight: (from, to) => !flightSolids.some((box) => segmentIntersectsBox(
      { x: from[0], y: from[1], z: from[2] },
      { x: to[0], y: to[1], z: to[2] },
      box,
    )),
    groundHeightAt,
    resolveFlightPosition: (from, desired, radius) => {
      const result = resolveSupportFlightStep({
        definition: flightNavigation,
        arenaBounds: arena.bounds,
        solids: flightSolids,
        from: { x: from[0], y: from[1], z: from[2] },
        desired: { x: desired[0], y: desired[1], z: desired[2] },
        radius,
      });
      return [result.position.x, result.position.y, result.position.z];
    },
    isFlightPositionValid: (position) => {
      const point = { x: position[0], y: position[1], z: position[2] };
      return pointInsideBounds(point, arena.bounds, 0.35)
        && !flightSolids.some((solid) => sphereIntersectsBox(point, 0.35, solid));
    },
    droneCentreSpawnVolume: {
      centre: centreSpawn,
      halfExtents: [
        Math.min(7.5, (arena.bounds.maxX - arena.bounds.minX) * 0.12),
        Math.min(2, flightNavigation.ceilingY * 0.05),
        Math.min(7.5, (arena.bounds.maxZ - arena.bounds.minZ) * 0.12),
      ],
    },
  };
}

function refreshLocalKillstreakSnapshot(now = performance.now(), force = true): boolean {
  if (network.role !== 'client') {
    const clockRegressed = now < lastLocalKillstreakSnapshotRefreshAt;
    if (!force && !clockRegressed
      && now - lastLocalKillstreakSnapshotRefreshAt < LOCAL_KILLSTREAK_SNAPSHOT_REFRESH_INTERVAL_MS) return false;
    killstreakSnapshot = killstreakRuntime.snapshotFor(player.id, now);
    lastLocalKillstreakSnapshotRefreshAt = now;
  }
  const activeCareCrateId = careCaptureCrateId(localCareCaptureState);
  if (activeCareCrateId) {
    const heldCrate = killstreakSnapshot.entities.find((entity) => (
      entity.id === activeCareCrateId && entity.kind === 'care-crate'
    ));
    const reconciliation = applyCareCaptureProjection(localCareCaptureState, {
      revision: killstreakSnapshot.revision,
      cratePhase: heldCrate?.phase ?? null,
      captureActorId: heldCrate?.captureActorId ?? null,
    });
    localCareCaptureState = reconciliation.state;
    if (reconciliation.transition === 'interrupted') {
      addFeed('CARE PACKAGE - CLAIM INTERRUPTED / UNAVAILABLE', 'coral');
    }
  }
  const actor = localKillstreakActorSnapshot();
  const reward = actor?.revealedCareRewards[0] ?? null;
  let hudChanged = false;
  if (reward && displayedCareReward !== reward) {
    addFeed(`CARE PACKAGE SECURED · ${GAMEPAD_SUPPORT_LABELS[reward]} READY`, 'gold');
    hudChanged = true;
  }
  if (displayedCareReward !== reward) {
    displayedCareReward = reward;
    const slotOne = document.querySelector<HTMLElement>('[data-support-slot="1"] .support-name');
    if (slotOne) slotOne.textContent = reward
      ? `CARE DROP: ${GAMEPAD_SUPPORT_LABELS[reward]}`
      : GAMEPAD_SUPPORT_LABELS[localFieldSupportProjection().loadout.slots[0]];
    hudChanged = true;
  }
  if (hudChanged) updateFieldSupportHud();
  return true;
}

function broadcastKillstreakState(now = performance.now()): void {
  if (network.role !== 'host') return;
  for (const remote of remotes.values()) {
    const message: KillstreakStateMessage = {
      type: 'killstreak-state',
      by: player.id,
      forPlayerId: remote.snapshot.id,
      snapshot: killstreakRuntime.snapshotFor(remote.snapshot.id, now),
      nonce: randomNonce(),
    };
    network.sendToPlayer(remote.snapshot.id, message);
  }
  lastKillstreakStateBroadcastAt = now;
}

function applyKillstreakEntityShot(
  shooterId: string,
  shooterTeam: Team,
  origin: THREE.Vector3,
  directions: readonly THREE.Vector3[],
  weapon: WeaponId,
  now = performance.now(),
): boolean {
  if (network.role === 'client' || directions.length === 0) return false;
  const spec = WEAPONS[weapon];
  let applied = false;
  const destroyed = new Set<string>();
  for (const authoredDirection of directions) {
    const direction = authoredDirection.clone().normalize();
    const ray = new THREE.Ray(origin, direction);
    let nearest: { id: string; distance: number } | null = null;
    const entities = killstreakRuntime.snapshotFor(null, now).entities;
    for (const entity of entities) {
      if ((entity.kind === 'care-crate' || entity.kind === 'aircraft')
        || !areCombatantsHostile(shooterId, shooterTeam, entity.ownerId, entity.team)
        || destroyed.has(entity.id)) continue;
      const centre = new THREE.Vector3(...entity.position);
      const along = centre.clone().sub(origin).dot(direction);
      if (along <= 0.1 || along > 220) continue;
      const radius = entity.kind === 'chopper' ? 1.25 : 0.58;
      if (ray.at(along, new THREE.Vector3()).distanceToSquared(centre) > radius * radius) continue;
      const trace = traceWeaponPath(origin, direction, along, weapon);
      if (!trace.reachedDistance) continue;
      if (!nearest || along < nearest.distance) nearest = { id: entity.id, distance: along };
    }
    if (!nearest) continue;
    const damage = Math.max(1, computeDamage(spec, nearest.distance, 'body'));
    const result = killstreakRuntime.damageEntity(nearest.id, damage);
    if (!result.applied) continue;
    applied = true;
    if (result.destroyed) {
      destroyed.add(nearest.id);
      addFeed(`${spec.name.toUpperCase()} DESTROYED HOSTILE AIR SUPPORT`, 'gold');
    }
  }
  if (applied) {
    refreshLocalKillstreakSnapshot(now);
    broadcastKillstreakState(now);
  }
  return applied;
}

function killstreakSlotFor(id: Pass65KillstreakId): 1 | 2 | 3 | 4 | 5 | null {
  const careReward = localKillstreakActorSnapshot()?.revealedCareRewards[0];
  if (careReward === id) return 1;
  const index = localFieldSupportProjection().loadout.slots.indexOf(id);
  return index < 0 ? null : (index + 1) as 1 | 2 | 3 | 4 | 5;
}

function requestKillstreakActivation(
  id: Pass65KillstreakId,
  now: number,
  anchor?: [number, number, number],
  facing?: [number, number, number],
): string | null {
  const slot = killstreakSlotFor(id);
  if (!slot) return null;
  killstreakActivationSequence += 1;
  const activationRequestId = `activation-${killstreakMatchEpoch}-${killstreakActivationSequence}`;
  const message: KillstreakActivateIntentMessage = {
    type: 'killstreak-activate-intent',
    by: player.id,
    matchEpoch: killstreakMatchEpoch,
    lifeId: localContinuity,
    sequence: killstreakActivationSequence,
    slot,
    activationId: activationRequestId,
    expectedId: id,
    ...(anchor ? { anchor } : {}),
    ...(facing ? { facing } : {}),
    timing: nextCombatTiming(),
    nonce: randomNonce(),
  };
  if (network.role === 'client') {
    network.send(message);
    return activationRequestId;
  }
  const admission = killstreakRuntime.activate(message, now, killstreakWorldState());
  if (!admission.accepted) {
    addFeed(`${GAMEPAD_SUPPORT_LABELS[id]} REJECTED · ${admission.reason.toUpperCase()}`, 'coral');
    return null;
  }
  // Host authority is already committed and remote projections are broadcast
  // below. Coalesce the local immutable projection into the next active frame:
  // consecutive support keys otherwise allocate an intermediate chopper-only
  // snapshot immediately before the final chopper-plus-24-drone snapshot.
  // Avoiding that redundant allocation removes an idle major-GC/compositor
  // risk on the owner hardware. The next frame refreshes before presentation
  // and before the earliest support fire gate.
  lastLocalKillstreakSnapshotRefreshAt = Number.NEGATIVE_INFINITY;
  broadcastKillstreakState(now);
  return activationRequestId;
}

function requestKillstreakControl(
  entityId: string,
  action: KillstreakControlIntentMessage['action'],
  control: Pick<KillstreakControlIntentMessage, 'yawQ' | 'pitchQ' | 'thrustQ' | 'strafeQ' | 'verticalQ' | 'fire'> = {},
  now = performance.now(),
): boolean {
  killstreakControlSequence += 1;
  const message: KillstreakControlIntentMessage = {
    type: 'killstreak-control-intent',
    by: player.id,
    matchEpoch: killstreakMatchEpoch,
    lifeId: localContinuity,
    sequence: killstreakControlSequence,
    entityId,
    action,
    ...control,
    timing: nextCombatTiming(),
    nonce: randomNonce(),
  };
  if (network.role === 'client') {
    network.send(message);
    return true;
  }
  const result = killstreakRuntime.control(message, now);
  if (!result.accepted) return false;
  refreshLocalKillstreakSnapshot(now);
  broadcastKillstreakState(now);
  return true;
}

function interactWithSelectedKillstreakSupport(interaction: InteractionCandidate, now = performance.now()): boolean {
  if (interaction.kind === 'support-exit') {
    const possession = localKillstreakActorSnapshot()?.possession;
    if (!possession || possession.entityId !== interaction.targetId) return false;
    const action = possession.kind === 'chopper-gunner' ? 'toggle-chopper-gunner' : 'toggle-piloted-drone';
    const accepted = requestKillstreakControl(possession.entityId, action, {}, now);
    if (accepted) addFeed(possession.kind === 'chopper-gunner' ? 'CHOPPER GUNNER - AI CONTROL' : 'PILOTED DRONE - AUTONOMOUS CONTROL', 'gold');
    return accepted;
  }
  if (interaction.kind === 'support-enter-drone' || interaction.kind === 'support-enter-chopper') {
    const entity = killstreakSnapshot.entities.find((entry) => entry.id === interaction.targetId && entry.ownerId === player.id && entry.expiresInMs > 0);
    if (!entity) return false;
    const action = interaction.kind === 'support-enter-drone' ? 'toggle-piloted-drone' : 'toggle-chopper-gunner';
    const accepted = requestKillstreakControl(entity.id, action, {}, now);
    if (accepted) addFeed(interaction.kind === 'support-enter-drone' ? 'PILOTED DRONE - FIRST-PERSON CONTROL' : 'CHOPPER GUNNER - FIRST-PERSON CONTROL', 'gold');
    return accepted;
  }
  if (interaction.kind !== 'care-package') return false;
  const crate = killstreakSnapshot.entities.find((entity) => entity.id === interaction.targetId && entity.kind === 'care-crate');
  if (!crate || crate.phase !== 'landed' || localCareCaptureState.status !== 'idle') return false;
  const sequence = ++killstreakControlSequence;
  const requested = requestCareCapture(localCareCaptureState, {
    actorId: player.id,
    lifeId: localContinuity,
    crateId: crate.id,
    sequence,
    currentRevision: killstreakSnapshot.revision,
  });
  if (requested.transition !== 'requested') return false;
  localCareCaptureState = requested.state;
  if (network.role === 'client') {
    network.send({
      type: 'killstreak-care-capture-intent', by: player.id, matchEpoch: killstreakMatchEpoch,
      lifeId: localContinuity, sequence, crateId: crate.id,
      holding: true, timing: nextCombatTiming(), nonce: randomNonce(),
    });
    addFeed('CARE PACKAGE - REQUESTING AUTHORITY', 'gold');
    return true;
  }
  const admission = killstreakRuntime.beginCareCapture(player.id, localContinuity, crate.id, now, killstreakWorldState());
  const result = applyCareCaptureResult(localCareCaptureState, {
    forPlayerId: player.id,
    lifeId: localContinuity,
    sequence,
    crateId: crate.id,
    holding: true,
    accepted: admission.accepted,
    revision: killstreakRuntime.snapshotFor(player.id, now).revision,
  });
  localCareCaptureState = result.state;
  if (!admission.accepted) {
    addFeed(`CARE PACKAGE - CLAIM REJECTED (${admission.reason.replaceAll('-', ' ').toUpperCase()})`, 'coral');
    return false;
  }
  refreshLocalKillstreakSnapshot(now);
  broadcastKillstreakState(now);
  addFeed('CARE PACKAGE - SECURING', 'gold');
  return true;
}

function executePinnedFInteraction(interaction: InteractionCandidate, now = performance.now()): boolean {
  if (interaction.kind === 'support-exit'
    || interaction.kind === 'support-enter-drone'
    || interaction.kind === 'support-enter-chopper'
    || interaction.kind === 'care-package') return interactWithSelectedKillstreakSupport(interaction, now);
  if (interaction.kind === 'shed-door') return interactWithShedDoor(interaction.targetId);
  if (interaction.kind === 'weapon-pickup') return interactWithWeaponPickup(now, interaction.targetId);
  return false;
}

function releaseCareCapture(now = performance.now()): void {
  const crateId = careCaptureCrateId(localCareCaptureState);
  if (!crateId) return;
  const sequence = ++killstreakControlSequence;
  const release = requestCareCaptureRelease(localCareCaptureState, sequence, killstreakSnapshot.revision);
  if (release.transition !== 'release-requested') return;
  localCareCaptureState = release.state;
  if (network.role === 'client') {
    network.send({
      type: 'killstreak-care-capture-intent', by: player.id, matchEpoch: killstreakMatchEpoch,
      lifeId: localContinuity, sequence, crateId,
      holding: false, timing: nextCombatTiming(), nonce: randomNonce(),
    });
  } else {
    const released = killstreakRuntime.interruptCareCapture(player.id, localContinuity);
    localCareCaptureState = applyCareCaptureResult(localCareCaptureState, {
      forPlayerId: player.id,
      lifeId: localContinuity,
      sequence,
      crateId,
      holding: false,
      accepted: released,
      revision: killstreakRuntime.snapshotFor(player.id, now).revision,
    }).state;
    refreshLocalKillstreakSnapshot(now);
    broadcastKillstreakState(now);
  }
}

function applyKillstreakDamageEvent(event: KillstreakDamageEvent): KillstreakDamageEvent | null {
  if (appliedKillstreakDamageResults.has(event.resultId)) return null;
  appliedKillstreakDamageResults.add(event.resultId);
  if (appliedKillstreakDamageResults.size > 512) {
    const oldest = appliedKillstreakDamageResults.values().next().value;
    if (oldest) appliedKillstreakDamageResults.delete(oldest);
  }
  const cause: KillCause = { kind: 'killstreak', effect: event.source };
  if (event.targetId === player.id) {
    if (event.targetLifeId !== localContinuity) return null;
    const before = player.hp;
    applyDamage(event.damage, event.ownerId, 1, true, cause);
    return { ...event, damage: Math.max(0, before - player.hp) };
  }
  const bot = bots.get(event.targetId);
  if (bot && network.role !== 'client') {
    if (event.targetLifeId !== bot.continuity) return null;
    const damage = applyBotDamage(bot, event.damage, 'body', cause, event.ownerId);
    return { ...event, damage };
  }
  if (network.role !== 'host') return event;
  const remote = remotes.get(event.targetId);
  const health = remoteHealthAuthorities.get(event.targetId);
  if (!remote || !health || event.targetLifeId !== remote.continuity) return null;
  const result = applyAuthoritativeRemoteDamage(
    health,
    event.damage,
    event.atMs,
    (damage, canonicalHealth) => applyDhvIncomingDamage(damage, canonicalHealth, memberDhv(event.targetId)),
  );
  if (!result.applied) return null;
  remoteHealthAuthorities.set(event.targetId, result.state);
  remote.snapshot = { ...remote.snapshot, hp: result.state.hp };
  remote.root.visible = result.state.alive;
  recordAuthoritativeDamage(event.ownerId, event.targetId, result.damageApplied);
  if (result.died) {
    const death: DeathMessage = { type: 'death', killer: event.ownerId, victim: event.targetId, cause, nonce: randomNonce() };
    processedNonces.add(death.nonce);
    network.send(death);
    processDeath(death);
  }
  return { ...event, damage: result.damageApplied };
}

let lastKillstreakControlSentAt = Number.NEGATIVE_INFINITY;
type SupportRotorAudioSource = {
  id: string;
  position: { x: number; y: number; z: number };
  phase: 'inbound' | 'orbiting' | 'outbound';
};
const supportRotorAudioSourcePool: SupportRotorAudioSource[] = Array.from({ length: 4 }, () => ({
  id: '',
  position: { x: 0, y: 0, z: 0 },
  phase: 'orbiting',
}));
const activeSupportRotorAudioSources: SupportRotorAudioSource[] = [];

function syncActiveSupportRotorAudio(now: number): void {
  if (now - lastSupportRotorAudioRefreshAt < SUPPORT_ROTOR_AUDIO_REFRESH_INTERVAL_MS) return;
  lastSupportRotorAudioRefreshAt = now;
  activeSupportRotorAudioSources.length = 0;
  for (const entity of killstreakSnapshot.entities) {
    if (entity.kind !== 'chopper' || entity.expiresInMs <= 0) continue;
    const source = supportRotorAudioSourcePool[activeSupportRotorAudioSources.length];
    source.id = entity.id;
    source.position.x = entity.position[0];
    source.position.y = entity.position[1];
    source.position.z = entity.position[2];
    source.phase = entity.phase === 'inbound' || entity.phase === 'outbound' ? entity.phase : 'orbiting';
    activeSupportRotorAudioSources.push(source);
    if (activeSupportRotorAudioSources.length >= supportRotorAudioSourcePool.length) break;
  }
  audio.syncChopperRotors(activeSupportRotorAudioSources);
}

function updateKillstreakPossession(now: number): void {
  const possession = localKillstreakActorSnapshot()?.possession;
  if (!possession) {
    killstreakPresentation.setFirstPersonEntity(null);
    if (camera.near !== 0.08) {
      camera.near = 0.08;
      camera.updateProjectionMatrix();
    }
    return;
  }
  const entity = killstreakSnapshot.entities.find((entry) => entry.id === possession.entityId);
  if (!entity) {
    killstreakPresentation.setFirstPersonEntity(null);
    return;
  }
  killstreakPresentation.setFirstPersonEntity(entity.id);
  const position = possession.kind === 'chopper-gunner'
    ? new THREE.Vector3(...chopperGunnerCameraOrigin(entity.position, entity.attitude))
    : killstreakPresentation.firstPersonCameraAnchor(entity.id) ?? new THREE.Vector3(...entity.position);
  camera.position.copy(position);
  if (camera.near !== 0.35) {
    camera.near = 0.35;
    camera.updateProjectionMatrix();
  }
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  killstreakPresentation.alignFirstPersonCockpit(entity.id, camera.quaternion);
  weaponView.setPresentationVisible(false);
  if (now - lastKillstreakControlSentAt < 50) return;
  const droneAxes = pilotedDroneControlAxes({
    keyboardForward: keys.has('KeyW'),
    keyboardBackward: keys.has('KeyS'),
    keyboardRight: keys.has('KeyD'),
    keyboardLeft: keys.has('KeyA'),
    keyboardAscend: keys.has('Space'),
    keyboardDescend: keys.has('ControlLeft') || keys.has('KeyC'),
    gamepadMoveX: gamepadMove.x,
    gamepadMoveY: gamepadMove.y,
    gamepadVertical: gamepadDroneVertical,
  });
  requestKillstreakControl(entity.id, 'pilot-control', {
    yawQ: player.yaw,
    pitchQ: player.pitch,
    thrustQ: possession.kind === 'piloted-drone' ? droneAxes.thrust : 0,
    strafeQ: possession.kind === 'piloted-drone' ? droneAxes.strafe : 0,
    verticalQ: possession.kind === 'piloted-drone' ? droneAxes.vertical : 0,
    fire: triggerHeld,
  }, now);
  lastKillstreakControlSentAt = now;
}

function updatePass65KillstreakRuntime(now: number): void {
  if (!gameStarted) {
    audio.syncChopperRotors([]);
    killstreakPresentation.clear();
    return;
  }
  if (matchState.phase === 'ended') {
    audio.syncChopperRotors([]);
    killstreakPresentation.clear();
    return;
  }
  if (network.role !== 'client' && matchState.phase === 'active') {
    const result = killstreakRuntime.advance(now, killstreakWorldState());
    const applied = result.damageEvents.map(applyKillstreakDamageEvent).filter((event): event is KillstreakDamageEvent => event !== null && event.damage > 0);
    for (const event of applied) recordOwnerSupportDamage(event);
    for (const impact of result.impactEvents) {
      if (impact.phase !== 'impact') continue;
      const point = new THREE.Vector3(...impact.position);
      applyInteractiveWorldExplosion(
        point,
        4.5,
        240,
        impact.source === 'carpet-bomber' ? 'carpet-bomber-obliteration' : undefined,
      );
      if (impact.source === 'carpet-bomber') {
        audio.explosion(now);
        supportExplosionPresentation.emit(point, 4.5, now);
      }
    }
    killstreakPresentation.presentImpacts(result.impactEvents, now);
    refreshLocalKillstreakSnapshot(now,
      result.damageEvents.length > 0 || result.impactEvents.length > 0 || result.expiredEntityIds.length > 0);
    if (network.role === 'host' && (applied.length > 0 || result.impactEvents.length > 0)) {
      const message: KillstreakDamageResultMessage = {
        type: 'killstreak-damage-result', by: player.id, matchEpoch: killstreakMatchEpoch,
        revision: killstreakSnapshot.revision, events: applied, impacts: result.impactEvents, nonce: randomNonce(),
      };
      network.send(message);
    }
    if (network.role === 'host' && now - lastKillstreakStateBroadcastAt >= 100) broadcastKillstreakState(now);
  }
  killstreakPresentation.sync(killstreakSnapshot, now);
  syncActiveSupportRotorAudio(now);
  refreshSupportStatusHud(now);
  const possession = localKillstreakActorSnapshot()?.possession;
  document.documentElement.dataset.killstreakPossession = possession?.kind ?? 'none';
  weaponView.setPresentationVisible(shouldShowWeaponViewmodel());
  updateKillstreakPossession(now);
}

function overdriveStateMessage(now: number): OverdriveStateMessage {
  return {
    type: 'overdrive-state', by: player.id, holderId: overdriveState.holderId, available: overdriveState.available,
    generation: overdriveState.generation,
    position: [overdriveState.position.x, overdriveState.position.y, overdriveState.position.z],
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
    position: [overdriveState.position.x, overdriveState.position.y, overdriveState.position.z],
    reason: network.role === 'client' ? 'host-replicated-state' : 'authoritative-claim',
  });
  overdriveClaimGeneration = overdriveState.generation;
  const holderName = holderId === player.id ? player.name : remotes.get(holderId)?.snapshot.name ?? 'Operator';
  const seconds = Math.max(1, Math.ceil(overdriveRemainingMs(overdriveState, holderId, now) / 1_000));
  addFeed(`${holderName} secured 2× OVERDRIVE · ${seconds} SECONDS`, 'gold');
  if (holderId === player.id) {
    audio.overdrivePickup();
    showQuadDamageAnnouncement('2× DAMAGE', `${seconds} SECONDS REMAINING`);
  } else showQuadDamageAnnouncement(`${holderName} HAS 2× DAMAGE`, 'DENY THE POWER HOLDER');
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
    activeUntil: message.activeRemainingMs > 0 ? now + message.activeRemainingMs : 0,
    nextSpawnAt: now + message.nextSpawnInMs,
    position: { x: message.position[0], y: message.position[1], z: message.position[2] },
  };
  if (message.available && message.activeRemainingMs === 0 && previousGeneration !== message.generation) {
    overdriveSpawns += 1;
    overdriveClaimGeneration = -1;
    overdriveClaimLastSentAt = Number.NEGATIVE_INFINITY;
  }
  if (message.holderId && message.holderId !== previousHolder) registerOverdrivePickup(message.holderId, now);
}

function outgoingDamage(value: number, now = performance.now()): number {
  const powered = value * overdriveDamageMultiplier(overdriveState, player.id, now)
    * killstreakActorModifiers(player.id, now).damage;
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
    addFeed('2× DAMAGE CORE ONLINE · VISIBLE MID-MAP ICON', 'gold');
    showQuadDamageAnnouncement('2× DAMAGE ONLINE', 'CENTRE CORE · CLAIM IT');
    audio.overdriveAvailable();
    broadcastOverdriveState(now);
    requestAnimationFrame((frameAt) => recordMatchDiagnostic('overdrive-spawn-frame', 'observed', {
      weaponOrEffect: 'overdrive',
      reason: 'first visible 2× Damage spawn transition',
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
  const distance = Math.hypot(player.position.x - overdriveState.position.x, player.position.z - overdriveState.position.z);
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

  // Keep the already-submitted presentation resident at sub-pixel scale while
  // the opaque deployment surface is compiling and throughout the match. The
  // frame loop remains active during async match admission; hiding this tree
  // merely because gameStarted is still false changes Three's lighting cache
  // key between support prewarm and first live activation, rebuilding every
  // chopper/swarm node pipeline in combat.
  overdriveRoot.visible = gameStarted || matchStartPreparing;
  overdriveRoot.scale.setScalar(overdriveState.available ? 1 : 0.0001);
  if (overdriveRoot.visible && overdriveState.available) {
    overdriveRoot.position.set(
      overdriveState.position.x,
      overdriveState.position.y + Math.sin(now * 0.0032) * 0.14,
      overdriveState.position.z,
    );
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
  let newlyEarned: readonly Pass65KillstreakId[] = [];
  if (network.role !== 'client') {
    newlyEarned = killstreakRuntime.recordEligibleElimination(player.id, 'weapon');
    refreshLocalKillstreakSnapshot();
    broadcastKillstreakState();
  }
  const fieldSupport = localFieldSupportProjection();
  bestStreakThisMatch = Math.max(bestStreakThisMatch, fieldSupport.streak);
  for (const id of newlyEarned) addFeed(`${GAMEPAD_SUPPORT_LABELS[id]} READY`, 'gold');
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
  applyInteractiveWorldExplosion(point, HUNTER_SWARM_BLAST_RADIUS, 100);
  const afterPresentation = performance.now();
  const blastNonce = randomNonce();
  const supportNonce = localSupportNonces.get('hunter-swarm');
  for (const bot of bots.values()) {
    if (!bot.alive || bot.team === player.team) continue;
    const target = bot.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distance = target.distanceTo(point);
    if (activeWorldColliders().some((box) => segmentIntersectsBox(point, target, box))) continue;
    const damage = outgoingDamage(hunterSwarmDamage(distance, 'stand'));
    if (damage > 0) applyBotDamage(bot, damage, 'body', { kind: 'killstreak', effect: 'hunter-swarm' });
  }
  for (const remote of remotes.values()) {
    if (!areCombatantsHostile(player.id, player.team, remote.snapshot.id, remote.snapshot.team) || remote.snapshot.hp <= 0) continue;
    const target = remote.target.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distance = target.distanceTo(point);
    if (activeWorldColliders().some((box) => segmentIntersectsBox(point, target, box))) continue;
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
    applyInteractiveWorldExplosion(new THREE.Vector3(0, 1.5, 0), 220, 400);
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
      if (damage > 0) applyBotDamage(
        bot,
        outgoingDamage(damage),
        'body',
        { kind: 'killstreak', effect: 'nuke' },
        player.id,
        undefined,
        true,
      );
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
    if (scene.fog) scene.fog.color.set(activeArenaVisualDefinition?.fog.color ?? activeLighting.fogColor).lerp(new THREE.Color(0x8c536f), charge * 0.24);
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
  if (scene.fog) scene.fog.color.set(activeArenaVisualDefinition?.fog.color ?? activeLighting.fogColor).lerp(new THREE.Color(0xff9f5b), flashStrength * 0.72);
  const flash = element<HTMLElement>('#nuke-flash');
  flash.style.opacity = String(Math.min(1, flashStrength * 1.25));
  if (now < sequence.finishedAt) return;
  sequence.shockwave.visible = false;
  (sequence.shockwave.material as THREE.MeshBasicMaterial).opacity = 0;
  if (skyMaterial) skyMaterial.uniforms.nukeFlash.value = 0;
  if (scene.fog) scene.fog.color.set(activeArenaVisualDefinition?.fog.color ?? activeLighting.fogColor);
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
  // Shared Tri-Pass missile/marker GPU resources must not be disposed per impact.
  if (root.userData.pooledSupportPresentation === true) {
    root.removeFromParent();
    root.visible = false;
    return;
  }
  scheduleDeferredGpuRetirement(root);
}

function retireSupportRoot(root: THREE.Object3D): void {
  supportPresentationRetirements += 1;
  disposeSupportRoot(root);
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
  if (maximumDamage > 0) applyInteractiveWorldExplosion(
    point,
    radius,
    maximumDamage,
  );
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
    if (distance > radius || activeWorldColliders().some((box) => segmentIntersectsBox(point, target, box))) continue;
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
    if (activeWorldColliders().some((box) => segmentIntersectsBox(point, target, box))) {
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
    for (const box of activeWorldColliders()) {
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
  const targetCount = pointSupportTargeting ? 1 : 3;
  element<HTMLElement>('#strike-target-mode').textContent = pointSupportTargeting
    ? pointSupportTargeting.id === 'care-package' ? 'CARE PACKAGE' : 'CARPET BOMBER'
    : 'TRI-PASS';
  element<HTMLElement>('#strike-target-instruction').textContent = pointSupportTargeting
    ? 'SELECT DELIVERY AREA'
    : 'SELECT THREE TARGETS';
  element<HTMLElement>('#strike-target-help').innerHTML = pointSupportTargeting
    ? 'CLICK ONE LOCATION TO CONFIRM · <kbd>ESC</kbd> CANCELS AND REFUNDS'
    : 'CLICK THREE LOCATIONS · <kbd>ESC</kbd> CANCELS AND REFUNDS';
  element<HTMLElement>('#strike-target-count').textContent = `${points.length} / ${targetCount}`;
  lastStrikeMapDrawAt = now;
}

function beginTriPassTargeting(): void {
  pointSupportTargeting = null;
  triPassTargeting = createTriPassTargeting();
  tacticalMapOpen = true;
  lastStrikeMapDrawAt = Number.NEGATIVE_INFINITY;
  const overlay = element<HTMLElement>('#strike-map-overlay');
  overlay.hidden = false;
  clearGameplayInput();
  drawStrikeMap();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function beginPointSupportTargeting(id: PointSupportTargeting['id']): void {
  triPassTargeting = null;
  pointSupportTargeting = Object.freeze({ id });
  tacticalMapOpen = false;
  lastStrikeMapDrawAt = Number.NEGATIVE_INFINITY;
  if (id === 'care-package' || id === 'carpet-bomber') {
    updateFieldSupportHud();
    return;
  }
  tacticalMapOpen = true;
  element<HTMLElement>('#strike-map-overlay').hidden = false;
  clearGameplayInput();
  drawStrikeMap();
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}

function cancelSupportTargeting(refund: boolean, reacquirePointer = true): void {
  const refundId = pointSupportTargeting?.id
    ?? (triPassTargeting !== null && !triPassTargeting.complete ? 'tri-pass' : null);
  if (refund && refundId) {
    addFeed(`${GAMEPAD_SUPPORT_LABELS[refundId]} TARGETING CANCELLED · REWARD RETAINED`, 'gold');
  }
  const wasCrosshair = pointSupportTargeting !== null && !tacticalMapOpen;
  if (crosshairPreviewMarker) {
    scene.remove(crosshairPreviewMarker);
    disposeSupportRoot(crosshairPreviewMarker);
    crosshairPreviewMarker = null;
  }
  crosshairPreviewLastPoint = null;
  triPassTargeting = null;
  pointSupportTargeting = null;
  tacticalMapOpen = false;
  triPassHostileMarkers = [];
  element<HTMLElement>('#strike-hostile-count').textContent = 'ENEMIES LIVE · 0';
  element<HTMLElement>('#strike-map-overlay').hidden = true;
  updateFieldSupportHud();
  if (reacquirePointer && gameStarted && player.alive && !matchFinished && !wasCrosshair) requestGamePointerLock('targeting-close');
}

function updateCrosshairSupportPreview(): void {
  if (!pointSupportTargeting || tacticalMapOpen) return;
  crosshairSupportRaycaster.setFromCamera(crosshairSupportScreenCenter, camera);
  const meshes = activeRaycastMeshes();
  const hits = crosshairSupportRaycaster.intersectObjects(meshes, true);
  const floorY = arena.bounds.minY ?? 0;
  const ceilingY = PASS65_FLIGHT_NAVIGATION[selectedArena.id].ceilingY;
  const groundHit = hits.find((candidate) => candidate.point.y >= floorY - 0.05 && candidate.point.y <= ceilingY + 2);
  let point = groundHit?.point ?? null;
  if (!point && crosshairSupportRaycaster.ray.direction.y < -0.0001) {
    const floorDistance = (floorY - crosshairSupportRaycaster.ray.origin.y) / crosshairSupportRaycaster.ray.direction.y;
    if (floorDistance >= 0) {
      crosshairSupportRaycaster.ray.at(floorDistance, crosshairSupportFloorPoint);
      if (crosshairSupportFloorPoint.x >= arena.bounds.minX && crosshairSupportFloorPoint.x <= arena.bounds.maxX
        && crosshairSupportFloorPoint.z >= arena.bounds.minZ && crosshairSupportFloorPoint.z <= arena.bounds.maxZ) {
        point = crosshairSupportFloorPoint;
      }
    }
  }
  if (!point) {
    if (crosshairPreviewMarker) {
      crosshairPreviewMarker.visible = false;
    }
    crosshairPreviewLastPoint = null;
    return;
  }
  const clampedY = THREE.MathUtils.clamp(point.y, floorY, ceilingY - 0.5);
  const anchor = new THREE.Vector3(point.x, clampedY, point.z);
  crosshairPreviewLastPoint = anchor;
  if (!crosshairPreviewMarker) {
    crosshairPreviewMarker = new THREE.Group();
    crosshairPreviewMarker.name = 'crosshair-support-preview';
    crosshairPreviewMarker.userData.presentationOnly = true;
    crosshairPreviewMarker.raycast = () => undefined;
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.035, 0.34), new THREE.MeshBasicMaterial({
        color: 0xff253f,
        transparent: true,
        opacity: 0.72,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }));
      bar.name = 'crosshair-preview-x-bar';
      bar.rotation.y = angle;
      bar.renderOrder = 18;
      bar.raycast = () => undefined;
      crosshairPreviewMarker.add(bar);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.5, 2.68, 48), new THREE.MeshBasicMaterial({
      color: 0xff253f,
      transparent: true,
      opacity: 0.45,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));
    ring.name = 'crosshair-preview-x-ring';
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 18;
    ring.raycast = () => undefined;
    crosshairPreviewMarker.add(ring);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16), new THREE.MeshBasicMaterial({
      color: 0xff253f,
      transparent: true,
      opacity: 0.88,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }));
    dot.name = 'crosshair-preview-x-dot';
    dot.rotation.x = -Math.PI / 2;
    dot.renderOrder = 19;
    dot.raycast = () => undefined;
    crosshairPreviewMarker.add(dot);
    scene.add(crosshairPreviewMarker);
  }
  crosshairPreviewMarker.position.copy(anchor);
  crosshairPreviewMarker.position.y += 0.055;
  crosshairPreviewMarker.visible = true;
}

function confirmCrosshairSupportTarget(confirmedAt = performance.now()): boolean {
  if (!pointSupportTargeting || tacticalMapOpen) return false;
  const targeting = pointSupportTargeting;
  const point = crosshairPreviewLastPoint;
  if (!point) return false;
  if (!requestKillstreakActivation(targeting.id, confirmedAt, [point.x, point.y, point.z])) {
    addFeed(`${GAMEPAD_SUPPORT_LABELS[targeting.id]} AUTHORITY REJECTED · REWARD RETAINED`, 'coral');
    cancelSupportTargeting(false);
    return true;
  }
  addFeed(targeting.id === 'care-package'
    ? 'CARE PACKAGE · TARGET CONFIRMED · DELIVERY INBOUND'
    : 'CARPET BOMBER · TARGET CONFIRMED · 20-IMPACT RUN INBOUND', 'gold');
  cancelSupportTargeting(false);
  return true;
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
    const anchor = next.points[1] ?? next.points[0];
    const activationRequestId = anchor
      ? requestKillstreakActivation('tri-pass', confirmedAt, [anchor.x, 0.2, anchor.z])
      : null;
    if (!activationRequestId) {
      addFeed('TRI-PASS AUTHORITY REJECTED · REWARD RETAINED', 'coral');
      cancelSupportTargeting(false);
      return true;
    }
    authorizeLocalOffensiveSupport('tri-pass', activationRequestId, next.points.map((point) => [point.x, 0.2, point.z]));
    scheduleTriPassMissiles(next.points, confirmedAt);
    cancelSupportTargeting(false);
  }
  return true;
}

function registerPointSupportClick(clientX: number, clientY: number, confirmedAt = performance.now()): boolean {
  const targeting = pointSupportTargeting;
  if (!tacticalMapOpen || !targeting) return false;
  const rect = strikeMapCanvas.getBoundingClientRect();
  const x = (clientX - rect.left) * strikeMapCanvas.width / Math.max(1, rect.width);
  const y = (clientY - rect.top) * strikeMapCanvas.height / Math.max(1, rect.height);
  const point = tacticalMapToWorld(x, y, arena.bounds, strikeMapCanvas.width, strikeMapCanvas.height);
  if (!requestKillstreakActivation(targeting.id, confirmedAt, [point.x, 0, point.z])) {
    addFeed(`${GAMEPAD_SUPPORT_LABELS[targeting.id]} AUTHORITY REJECTED · REWARD RETAINED`, 'coral');
    cancelSupportTargeting(false);
    return true;
  }
  addFeed(targeting.id === 'care-package'
    ? 'CARE PACKAGE · TARGET CONFIRMED · DELIVERY INBOUND'
    : 'CARPET BOMBER · TARGET CONFIRMED · 20-IMPACT RUN INBOUND', 'gold');
  cancelSupportTargeting(false);
  return true;
}

strikeMapCanvas.addEventListener('click', (event) => {
  if (!registerPointSupportClick(event.clientX, event.clientY)) registerTriPassClick(event.clientX, event.clientY);
});

function authorizeLocalOffensiveSupport(
  source: OffensiveSupportSource,
  activationRequestId: string,
  effectOrigins: [number, number, number][] = [],
  targetIds: string[] = [],
): number {
  const activationNonce = randomNonce();
  localSupportNonces.set(source, activationNonce);
  if (network.role !== 'offline') {
    network.send({
      type: 'support-activate', by: player.id, source, activationRequestId,
      activationNonce, effectOrigins, targetIds, timing: nextCombatTiming(), nonce: randomNonce(),
    });
  }
  return activationNonce;
}

function activateFieldSupport(id: FieldSupportId): void {
  if (!selectedArena.fieldSupport || !player.alive || matchState.phase !== 'active' || tacticalMapOpen) return;
  const fieldSupport = localFieldSupportProjection();
  const revealedCareReward = id === fieldSupport.loadout.slots[0] ? fieldSupport.revealedCareReward ?? undefined : undefined;
  const activatedId = revealedCareReward ?? id;
  if (!fieldSupport.available[activatedId]) return;
  const now = performance.now();
  endSpawnProtectionOnOffense(now);
  if (activatedId === 'scout-sweep') {
    if (!requestKillstreakActivation(activatedId, now)) return;
    scoutSweepUntil = now + SCOUT_SWEEP_DURATION_MS;
    audio.scoutSweep();
    addFeed('SCOUT SWEEP · PULSE 1.5 SEC / 3 SEC · 12 SEC', 'gold');
  } else if (activatedId === 'yardhawk') {
    const target = nearestSupportTarget();
    if (!target) {
      return;
    }
    const activationRequestId = requestKillstreakActivation(activatedId, now, [target.point.x, target.point.y, target.point.z]);
    if (!activationRequestId) return;
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
    authorizeLocalOffensiveSupport('yardhawk', activationRequestId, [], [target.id]);
    addFeed('YARDHAWK THROWN · HOMING SYSTEM ARMING', 'gold');
  } else if (activatedId === 'tri-pass') {
    beginTriPassTargeting();
  } else if (activatedId === 'hunter-swarm') {
    const firstSpawnedDrone = hunterDrones.length;
    const assignments = spawnHunterSwarm(now);
    if (!assignments) {
      addFeed('HUNTER SWARM · NO HOSTILE TARGETS · REWARD RETAINED', 'gold');
    } else {
      const activationRequestId = requestKillstreakActivation(activatedId, now);
      if (!activationRequestId) {
        for (const drone of hunterDrones.splice(firstSpawnedDrone)) disposeSupportRoot(drone.root);
        return;
      }
      authorizeLocalOffensiveSupport('hunter-swarm', activationRequestId, [], assignments);
    }
  } else if (activatedId === 'nuke') {
    const activationRequestId = requestKillstreakActivation(activatedId, now);
    if (!activationRequestId) return;
    authorizeLocalOffensiveSupport('nuke', activationRequestId);
    beginNuke(now);
  } else if (activatedId === 'adrenaline') {
    if (!requestKillstreakActivation(activatedId, now)) return;
    addFeed('ADRENALINE BOOST · +10% DAMAGE / MOVE · -10% RELOAD · 15 SEC', 'gold');
  } else if (activatedId === 'care-package') {
    beginPointSupportTargeting('care-package');
  } else if (activatedId === 'carpet-bomber') {
    beginPointSupportTargeting('carpet-bomber');
  } else if (activatedId === 'piloted-drone') {
    if (!requestKillstreakActivation(activatedId, now, [player.position.x, player.position.y, player.position.z])) return;
    addFeed('PILOTED DRONE · 20 ROUNDS + ONE SPARE CLIP · F EXITS', 'gold');
  } else if (activatedId === 'chopper') {
    if (!requestKillstreakActivation(activatedId, now)) return;
    addFeed('CHOPPER GUNNER · AI ONLINE · F TO TAKE / RELEASE GUN · 30 SEC', 'gold');
  } else if (activatedId === 'drone-swarm') {
    const ingressFacing = camera.getWorldDirection(new THREE.Vector3());
    if (!requestKillstreakActivation(
      activatedId,
      now,
      [player.position.x, player.position.y, player.position.z],
      [ingressFacing.x, 0, ingressFacing.z],
    )) return;
    addFeed('DRONE SWARM · 24 DRONES · 60 SEC', 'gold');
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
    const collision = sweepSphereAgainstBoxes(drone.root.position, step, activeWorldColliders(), 0.24);
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
      const collision = sweepSphereAgainstBoxes(start, delta, activeWorldColliders(), 0.24);
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
          const collision = sweepSphereAgainstBoxes(start, step, activeWorldColliders(), 0.24);
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
    releaseGrenadeWorldPresentation(grenade.mesh);
  }
  grenades.length = 0;
  for (const bolt of explosiveBolts) disposeExplosiveBolt(bolt);
  explosiveBolts.length = 0;
  smokeVolumePresentationPool.clear();
  smokeVolumes.length = 0;
  smokeAuthority.reset(interactiveWorldMatchEpoch, network.role === 'client' ? 'replica' : 'host');
  lastSmokeStateBroadcastRevision = -1;
  lastSmokeStateBroadcastAt = Number.NEGATIVE_INFINITY;
  clearLocalFlashPresentation();
}

function clearFieldSupport(): void {
  localCareCaptureState = createCareCaptureClientState();
  lastKillstreakControlSentAt = Number.NEGATIVE_INFINITY;
  lastLocalKillstreakSnapshotRefreshAt = Number.NEGATIVE_INFINITY;
  lastSupportRotorAudioRefreshAt = Number.NEGATIVE_INFINITY;
  lastSupportStatusHudRefreshAt = Number.NEGATIVE_INFINITY;
  killstreakPresentation.setFirstPersonEntity(null);
  killstreakPresentation.clear();
  document.documentElement.dataset.killstreakPossession = 'none';
  if (camera.near !== 0.08) {
    camera.near = 0.08;
    camera.updateProjectionMatrix();
  }
  weaponView.setPresentationVisible(player.alive);
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
  supportExplosionPresentation.clear();
  if (nukeSequence) nukeSequence = null;
  nukeShockwave.visible = false;
  (nukeShockwave.material as THREE.MeshBasicMaterial).opacity = 0;
  if (skyMaterial) skyMaterial.uniforms.nukeFlash.value = 0;
  if (scene.fog) scene.fog.color.set(activeArenaVisualDefinition?.fog.color ?? activeLighting.fogColor);
  const nukeWarning = element<HTMLElement>('#nuke-warning');
  const nukeFlash = element<HTMLElement>('#nuke-flash');
  nukeWarning.hidden = true;
  nukeFlash.hidden = true;
  nukeFlash.style.opacity = '0';
  cancelSupportTargeting(false, false);
  scoutSweepUntil = 0;
  yardhawkExplosions = 0;
  triPassLaunches = 0;
  triPassImpacts = 0;
  triPassLastImpactDelayMs = null;
  hunterSwarmLaunches = 0;
  hunterSwarmImpacts = 0;
  nukeLaunches = 0;
  nukeDetonations = 0;
  localSupportNonces.clear();
  admittedRemoteShots.clear();
  admittedRemoteMelees.clear();
  admittedRemoteExplosions.clear();
  remoteStickyAttachmentAuthority = createRemoteStickyAttachmentAuthorityState();
  pendingStickyHits.clear();
  pendingStickyWindowBreaks.clear();
  stickyTimingReplayNonces.clear();
  for (const id of remotes.keys()) remoteSupportAuthorities.set(id, createRemoteSupportAuthorityState());
  for (const [id, remote] of remotes) remoteGrenadeAuthorities.set(id, createRemoteGrenadeAuthorityState(remote.snapshot.grenade));
  for (const id of remotes.keys()) remoteHealthAuthorities.set(id, createRemoteHealthAuthorityState(true));
  updateFieldSupportHud();
}

function shouldShowWeaponViewmodel(): boolean {
  return gameStarted
    && player.alive
    && !localKillstreakActorSnapshot()?.possession
    && !sniperScopeActive
    && !dmrThermalActive
    && !debugCaptureViewmodelHidden;
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
  const baseProfile = movementProfile({
    crouched,
    prone,
    ads: adsHeld,
    sprinting: currentSprinting,
    grounded: playerGrounded,
    equippedMovementMultiplier: WEAPONS[player.weapon].movementMultiplier,
  });
  const movementBoost = killstreakActorModifiers(player.id, now).movement;
  const profile = {
    ...baseProfile,
    maxSpeed: baseProfile.maxSpeed * movementBoost,
    acceleration: baseProfile.acceleration * movementBoost,
  };
  const integrated = integrateHorizontalVelocity(
    { x: player.velocity.x, z: player.velocity.z },
    { x: input.x, z: input.z },
    profile,
    dt,
  );
  player.velocity.x = integrated.x;
  player.velocity.z = integrated.z;

  if (player.hp < 100 && now - lastDamageAt >= 5_000) {
    const healthBeforeRegen = player.hp;
    player.hp = Math.min(100, player.hp + 18 * dt);
    if (Math.floor(healthBeforeRegen) !== Math.floor(player.hp) || player.hp === 100) {
      recordMatchDiagnostic('health-regen', 'accepted', {
        actorId: player.id,
        actorKind: 'player',
        healthBefore: healthBeforeRegen,
        healthAfter: player.hp,
      });
    }
  }
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
  const localSurface = arenaFootstepSurface(selectedArena.id, classifyFootstepSurface(player.position));
  const localMovement: FootstepMovement = prone ? 'prone' : crouched ? 'crouch' : currentSprinting ? 'sprint' : 'walk';
  const localFootsteps = footstepEmitters.sample({
    actorId: `local:${player.id}`,
    lifeId: localContinuity,
    continuityId: localContinuity,
    position: player.position,
    grounded: playerGrounded,
    stale: false,
    movement: localMovement,
    surface: localSurface,
    now,
  });
  for (let index = 0; index < localFootsteps.length; index += 1) {
    audio.footstep(localSurface, currentSprinting, crouched || prone);
  }
  weaponBob += dt * (currentSprinting ? 15 : prone ? 3.6 : crouched ? 7 : 10) * (moving ? 1 : 0.25);
  recoilVisual = recoverRecoil(recoilVisual, WEAPONS[player.weapon], dt);
  recoilCamera = recoverRecoilImpulse(recoilCamera, WEAPONS[player.weapon], dt);
  landingImpulse = damp(landingImpulse, 0, 10, dt);
  cameraHeightOffset = damp(cameraHeightOffset, 0, prone ? 9 : 15, dt);
  const lateralSpeed = player.velocity.dot(right) / Math.max(1, profile.maxSpeed);
  cameraRoll = damp(cameraRoll, -lateralSpeed * (adsHeld ? 0.006 : 0.016), 11, dt);
  const railgunReloadProgress = player.weapon === 'railgun' && railgunRechamberPresentationActive
    ? THREE.MathUtils.clamp(1 - Math.max(0, railgunState.chamberReadyAtHostTimeMs - currentHostTimeMs()) / RAILGUN_RECHAMBER_MS, 0, 1)
    : 0;
  const weaponActionEvents = weaponView.update({
    dt,
    moving,
    sprinting: currentSprinting,
    crouched,
    prone,
    ads: adsHeld,
    phase: weaponBob * accessibilityRuntime.weaponMotionScale,
    landingImpulse: landingImpulse * accessibilityRuntime.weaponMotionScale,
    lateralSpeed: lateralSpeed * accessibilityRuntime.weaponMotionScale,
    reloadProgress: debugReloadProgress ?? (player.weapon === 'railgun' ? railgunReloadProgress : gameplayReloadProgress(player.reloadState, performance.now())),
    surfaceRetreat: currentViewmodelSurfaceRetreat(),
    triggerHeld,
  });
  audio.minigunDrive(
    weaponView.minigunSpoolFraction(),
    weaponView.minigunSpoolPhase(),
    gameStarted && player.alive && player.weapon === 'minigun',
  );
  for (const event of weaponActionEvents) {
    audio.weaponAction(player.weapon, event);
    weaponActionHistory.push(event);
  }
  if (weaponActionHistory.length > 16) weaponActionHistory.splice(0, weaponActionHistory.length - 16);
  const aimingFov = player.weapon === 'sniper'
    ? magnifiedFovDegrees(preferredFov, 3)
    : player.weapon === 'm14-ebr'
      ? magnifiedFovDegrees(preferredFov, DMR_THERMAL_MAGNIFICATION)
      : Math.max(55, preferredFov - 20);
  const targetFov = adsHeld ? aimingFov : currentSprinting ? preferredFov + 4.5 : preferredFov;
  camera.fov = player.weapon === 'sniper' ? targetFov : damp(camera.fov, targetFov, 10, dt);
  camera.updateProjectionMatrix();
  sniperScopeActive = player.alive
    && player.weapon === 'sniper'
    && adsHeld
    && weaponView.adsProgress() >= 0.9
    && Math.abs(camera.fov - aimingFov) < 0.35;
  sniperScopeOverlay.hidden = !sniperScopeActive;
  hudRoot.classList.toggle('sniper-scope-active', sniperScopeActive);
  dmrThermalActive = player.alive
    && player.weapon === 'm14-ebr'
    && adsHeld
    && weaponView.adsProgress() >= 0.9
    && Math.abs(camera.fov - aimingFov) < 0.35;
  hudRoot.classList.toggle('dmr-thermal-active', dmrThermalActive);
  weaponView.setPresentationVisible(shouldShowWeaponViewmodel());
  camera.position.copy(player.position);
  camera.position.y += cameraHeightOffset - landingImpulse * 0.035 * accessibilityRuntime.weaponMotionScale;
  camera.rotation.y = player.yaw + recoilCamera.yaw;
  camera.rotation.x = THREE.MathUtils.clamp(player.pitch - recoilCamera.pitch, -1.42, 1.42);
  camera.rotation.z = cameraRoll * accessibilityRuntime.weaponMotionScale;
}

function interpolationSourceSnapshotRateHz(): 20 | 30 | 40 {
  return remotes.size > 0
    ? Math.min(...[...remotes.values()].map((remote) => remote.snapshotRateHz)) as 20 | 30 | 40
    : 40;
}

function updateRemotes(dt: number, now: number): void {
  if (remotes.size === 0) return;
  const hostNow = currentHostTimeMs();
  recordCombatantPose(localPositionHistory, {
    at: hostNow, x: player.position.x, y: player.position.y, z: player.position.z,
    yaw: player.yaw, stance: player.stance, continuity: localContinuity,
  });
  const observedUnderruns = [...remotes.values()].reduce(
    (total, remote) => total + remote.interpolation.stats.underruns,
    0,
  );
  const newUnderruns = observedUnderruns >= lastObservedInterpolationUnderruns
    ? observedUnderruns - lastObservedInterpolationUnderruns
    : 0;
  lastObservedInterpolationUnderruns = observedUnderruns;
  const slowestSnapshotRate = interpolationSourceSnapshotRateHz();
  const measuredJitterMs = network.role === 'client'
    ? hostTimeMapping.jitterMs
    : Math.max(0, ...[...peerTimingStates.values()].map((timing) => timing.jitterMs));
  interpolationDelayState = updateInterpolationDelay(interpolationDelayState, {
    snapshotRateHz: slowestSnapshotRate,
    jitterMs: measuredJitterMs,
    underruns: newUnderruns,
  }, now);
  for (const [id, remote] of remotes) {
    if (now - remote.lastSeen > 12_000) {
      removeRemote(id, 'timed out');
      continue;
    }
    const rendered = remote.interpolation.sample(hostNow, interpolationDelayState.delayMs);
    const renderedSnapshot = rendered?.value ?? remote.snapshot;
    const renderedTarget = new THREE.Vector3(
      renderedSnapshot.x,
      renderedSnapshot.y - stanceEyeHeight(renderedSnapshot.stance),
      renderedSnapshot.z,
    );
    const previousFootY = remote.root.position.y;
    const remainingDistance = remote.root.position.distanceTo(renderedTarget);
    remote.root.position.copy(renderedTarget);
    remote.root.rotation.y = renderedSnapshot.yaw;
    remote.target.copy(renderedTarget);
    remote.targetYaw = renderedSnapshot.yaw;
    remote.renderedHostTimeMs = rendered?.renderedHostTimeMs ?? hostNow;
    remote.renderedWorldAgeMs = rendered?.renderedWorldAgeMs ?? 0;
    const stance = renderedSnapshot.stance ?? 'stand';
    const operator = remote.root.userData.operator as THREE.Group;
    setOperatorWeapon(operator, renderedSnapshot.weapon, flattenOperatorMaterials, scheduleDeferredGpuRetirement);
    poseOperator(operator, stance, remainingDistance / Math.max(dt, 0.001), now * 0.008, Math.min(1, dt * 24), renderedSnapshot.pitch, dt);
    const remoteSurface = arenaFootstepSurface(selectedArena.id, classifyFootstepSurface(renderedTarget));
    const expectedGround = botElevationAt(renderedTarget, previousFootY);
    const remoteMovement: FootstepMovement = stance === 'prone' ? 'prone' : stance === 'crouch'
      ? 'crouch' : remainingDistance / Math.max(dt, 0.001) > 5.2 ? 'sprint' : 'walk';
    const footsteps = footstepEmitters.sample({
      actorId: `remote:${id}`,
      lifeId: renderedSnapshot.deaths,
      continuityId: remote.continuity,
      position: renderedTarget,
      grounded: Math.abs(renderedTarget.y - expectedGround) <= 0.28,
      stale: remote.renderedWorldAgeMs > 500,
      movement: remoteMovement,
      surface: remoteSurface,
      now,
    });
    for (const footstep of footsteps) audio.worldFootstep(footstep.position, footstep.surface, footstep.movement, isFootstepOccluded(footstep.position));
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

function presentMatchCountdownCue(cue: MatchCountdownCue): number {
  const countdown = element<HTMLElement>('#countdown');
  const sequence = ++matchCountdownCueSequence;
  countdown.classList.remove('countdown-cue-active');
  countdown.textContent = cue === 'engage' ? 'ENGAGE' : cue;
  countdown.setAttribute('aria-label', cue === 'engage' ? 'Match active. Engage.' : `Deployment countdown ${cue}`);
  countdown.dataset.cue = cue;
  countdown.dataset.cueSequence = String(sequence);
  countdown.dataset.cueKey = sequence % 2 === 0 ? 'even' : 'odd';
  countdown.hidden = false;
  // Reflow is bounded to four match-start cues and guarantees a fresh CSS
  // timeline while the single accessible HUD node remains mounted.
  void countdown.offsetWidth;
  countdown.classList.add('countdown-cue-active');
  return sequence;
}

function hideMatchCountdownCue(): void {
  const countdown = element<HTMLElement>('#countdown');
  countdown.hidden = true;
  countdown.classList.remove('countdown-cue-active');
  countdown.textContent = '';
  countdown.removeAttribute('aria-label');
  delete countdown.dataset.cue;
  delete countdown.dataset.cueKey;
  delete countdown.dataset.cueSequence;
}

function updateMatchState(now: number): void {
  if (matchAdmissionPresentationPaused) return;
  const previous = matchState.phase;
  const scores = teamScores();
  const rules = currentMatchRules();
  const ffa = gameMode !== 'solo' && privateMatchMode === 'ffa';
  const orderedFfa = freeForAllLeaders([...authoritativeScores.values()]);
  matchState = preserveSoloCountdownCue(matchState, now, lastMatchCountdownCue, gameMode === 'solo');
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
  if (matchState.phase === 'warmup') {
    const headline = presentation.headline ?? '';
    if (headline !== lastMatchCountdownCue && /^(1|2|3)$/.test(headline)) {
      const cue = headline as Extract<MatchCountdownCue, '1' | '2' | '3'>;
      presentMatchCountdownCue(cue);
      audio.matchCountdown(Number(cue) as 1 | 2 | 3);
      lastMatchCountdownCue = cue;
    }
  } else if (matchState.phase !== 'active' || lastMatchCountdownCue !== 'engage') hideMatchCountdownCue();
  if (previous === matchState.phase) return;
  const banner = element<HTMLElement>('#banner');
  if (matchState.phase === 'active') {
    const engageSequence = presentMatchCountdownCue('engage');
    audio.matchCountdown('engage');
    lastMatchCountdownCue = 'engage';
    if (network.role === 'host' && privateLobbySnapshot?.phase !== 'active') broadcastHostLobby('active');
    else if (privateLobbySnapshot) privateLobbySnapshot = { ...privateLobbySnapshot, phase: 'active' };
    banner.innerHTML = `<strong>ENGAGE</strong><span>${privateMatchMode === 'ffa' && gameMode !== 'solo' ? 'FREE FOR ALL · EVERY PLAYER HOSTILE' : selectedArena.rulesLabel}</span>`;
    banner.hidden = false;
    window.setTimeout(() => {
      if (matchState.phase !== 'active') return;
      banner.hidden = true;
      if (element<HTMLElement>('#countdown').dataset.cueSequence === String(engageSequence)) hideMatchCountdownCue();
    }, 900);
    return;
  }
  if (matchState.phase === 'ended') {
    lastMatchCountdownCue = null;
    matchFinished = true;
    killstreakLoadoutController.releaseAfterMatch();
    killstreakMenuBinding.setMatchActive(false);
    if (network.role === 'host' && privateLobbySnapshot?.phase !== 'ended') broadcastHostLobby('ended');
    else if (privateLobbySnapshot) privateLobbySnapshot = { ...privateLobbySnapshot, phase: 'ended' };
    recordCompletedMatch();
    if (network.role !== 'client') {
      killstreakRuntime.endMatch();
      refreshLocalKillstreakSnapshot(now);
      if (network.role === 'host') broadcastKillstreakState(now);
    }
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
    if (privateMatch) {
      saveLastMultiplayerDiagnostic(createLastMultiplayerDiagnostic({
        completedAtEpochMs: Date.now(),
        arena: selectedArena.id,
        mode: privateMatchMode,
        role: network.role === 'host' ? 'host' : 'guest',
        protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
        durationMs: Math.max(0, performance.now() - matchDiagnosticsStartedAt),
        participantCount: participants.length,
        localPlayerName: player.name,
        local: {
          kills: summary.kills,
          deaths: summary.deaths,
          shotsFired: roundShotsFired,
          hitShots: roundHitShots,
          damageDealt: summary.damageDealt,
          damageTaken: Math.max(roundDamageTaken, authoritativeLocal?.damageTaken ?? 0),
          headshots: summary.headshots,
        },
        network: {
          rttMs: localLobbyPingMs,
          clockOffsetMs: network.role === 'client' ? hostTimeMapping.offsetMs : 0,
          interpolationDelayMs: interpolationDelayState.delayMs,
          receiverSequenceGaps,
          receiverReordered,
          droppedDamageEvents: droppedHumanDamageEvents,
        },
        damageTimeline: humanDamageTimeline,
      }), clientPersistentStorage());
    }
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
        shotTimeline: {
          authored: lastAuthoredShotTimeline,
          resolved: lastResolvedShotTimeline,
          recentResolutions: [...recentShotResolutionTraces],
          rewindCeilingMs: MAX_AUTHORITATIVE_REWIND_MS,
          maximumFireAgeMs: MAX_SHOT_FIRE_AGE_MS,
          timing: shotTimingTelemetry.snapshot(),
        },
        interpolationDelay: {
          ...interpolationDelayState,
          sourceSnapshotRateHz: interpolationSourceSnapshotRateHz(),
          targetViewRewindHeadroomMs: Math.max(0, MAX_AUTHORITATIVE_REWIND_MS - interpolationDelayState.delayMs),
        },
        remoteInterpolation: [...remotes.values()].map((remote) => ({
          playerId: matchDiagnostics?.participantKey(remote.snapshot.id),
          renderedWorldAgeMs: remote.renderedWorldAgeMs,
          bufferDepth: remote.interpolation.depth,
          ...remote.interpolation.stats,
        })),
      },
    });
    if (matchDiagnostics) {
      const remoteEnvelope = matchDiagnostics.remoteEnvelope({
        completedAtEpochMs: Date.now(),
        pass: PASS66_RELEASE_IDENTITY.pass,
        backend: renderRuntime.telemetry().actualBackend === 'webgpu' ? 'webgpu' : 'webgl-compatibility',
        durationMs: Math.max(0, performance.now() - matchDiagnosticsStartedAt),
        network: {
          rttMs: gameMode === 'solo' ? null : localLobbyPingMs,
          jitterMs: network.role === 'client' ? hostTimeMapping.jitterMs : 0,
          clockOffsetMs: network.role === 'client' ? hostTimeMapping.offsetMs : 0,
          interpolationDelayMs: interpolationDelayState.delayMs,
          receiverSequenceGaps,
          receiverReordered,
          droppedDamageEvents: droppedHumanDamageEvents,
        },
        participants: participants.map(({ id, report }) => ({
          id,
          kind: report.kind,
          team: report.team ?? 'free-for-all',
          kills: report.kills,
          deaths: report.deaths,
          damageDealt: report.damageDealt,
          damageTaken: report.damageTaken,
          finalHealth: report.finalHealth,
        })),
        local: {
          kills: summary.kills,
          deaths: summary.deaths,
          shotsFired: roundShotsFired,
          hitShots: roundHitShots,
          damageDealt: summary.damageDealt,
          damageTaken: Math.max(roundDamageTaken, authoritativeLocal?.damageTaken ?? 0),
          headshots: summary.headshots,
        },
      });
      void matchDiagnosticUploader.completeMatch(remoteEnvelope).catch(() => undefined);
    }
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
      else restartSoloMatch();
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
  if (!presentationFrameDue(now, lastMinimapRenderAt, MINIMAP_RENDER_HZ)) return;
  lastMinimapRenderAt = Number.isFinite(lastMinimapRenderAt)
    ? advancePresentationFrameAnchor(now, lastMinimapRenderAt, MINIMAP_RENDER_HZ)
    : now;
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
    for (const collider of activeWorldColliders()) {
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
    const [x, y] = point(overdriveState.position.x, overdriveState.position.z);
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
  const headingText = `PLAYER UP · ${String(headingDegrees(player.yaw)).padStart(3, '0')}°`;
  const headingElement = element<HTMLElement>('#map-heading');
  if (headingElement.textContent !== headingText) headingElement.textContent = headingText;
}

function updateHud(now: number): void {
  // DOM reconstruction can stay at 10 Hz. The rotating minimap has its own
  // bounded 60 Hz cadence so uncapped rendering cannot flood Canvas2D work.
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
  const railgunStatus = element<HTMLElement>('#railgun-status');
  railgunStatus.hidden = !localHoldsRailgun();
  const railgunRechamberRemainingMs = Math.max(0, railgunState.chamberReadyAtHostTimeMs - currentHostTimeMs());
  if (!railgunStatus.hidden) {
    railgunStatus.textContent = railgunState.roundsRemaining <= 0
      ? `${WEAPONS.railgun.name.toUpperCase()} DEPLETED · NO RESUPPLY`
      : player.weapon !== 'railgun'
        ? `SIDEARM ACTIVE · ${WEAPONS.railgun.name.toUpperCase()} ${railgunState.roundsRemaining} ROUNDS`
        : railgunRechamberRemainingMs > 0
          ? `${WEAPONS.railgun.name.toUpperCase()} RECHAMBER ${Math.ceil(railgunRechamberRemainingMs / 100) / 10}s`
          : railgunAdsResetRequired
            ? `${WEAPONS.railgun.name.toUpperCase()} RELEASE ADS`
            : `${WEAPONS.railgun.name.toUpperCase()} THERMAL READY`;
  }
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
  reloadStateElement.textContent = player.weapon === 'railgun' && railgunRechamberRemainingMs > 0
    ? `RECHAMBERING ${(railgunRechamberRemainingMs / 1_000).toFixed(1)}s`
    : player.reloadState
    ? `RELOADING ${Math.max(0, (player.reloadState.endsAt - now) / 1000).toFixed(1)}s`
    : selectedArena.id === 'gun-range'
      ? `SCORE ${rangeScore} · ${targetHits} TARGETS HIT`
      : gameMode === 'solo' ? `${player.kills} K / ${player.deaths} D · ${targetHits} TARGETS` : `${player.kills} K / ${player.deaths} D`;
  reloadStateElement.classList.toggle('active', player.reloadState !== null || player.weapon === 'railgun' && railgunRechamberRemainingMs > 0);
  element<HTMLElement>('#stance').textContent = player.stance.toUpperCase();
  element<HTMLElement>('#grenades').textContent = `${player.selectedGrenade.toUpperCase()} ×${player.grenades}`;
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
  renderRuntime.setSize(width, height, false);
  atomicSignal?.resize();
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
const reducedMotionInput = element<HTMLInputElement>('#reduced-motion');
const reducedDamageFlashInput = element<HTMLInputElement>('#reduced-damage-flash');
const reducedSensoryEffectsInput = element<HTMLInputElement>('#reduced-sensory-effects');
const damageFlashScaleInput = element<HTMLInputElement>('#damage-flash-scale');
const weaponMotionScaleInput = element<HTMLInputElement>('#weapon-motion-scale');
const shareGlobalLeaderboardInput = element<HTMLInputElement>('#share-global-leaderboard');
sensitivity = playerProfileStore.current.controls.mouseSensitivity;
controllerSensitivity = playerProfileStore.current.controls.controllerSensitivity;
preferredFov = playerProfileStore.current.controls.fieldOfView;
sensitivityInput.value = String(sensitivity);
controllerSensitivityInput.value = String(controllerSensitivity);
fovInput.value = String(preferredFov);
graphicsProfileInput.value = displayedGraphicsPreset;
reducedMotionInput.checked = pass65Settings.accessibility.reducedMotion;
reducedDamageFlashInput.checked = pass65Settings.accessibility.reducedDamageFlash;
reducedSensoryEffectsInput.checked = pass65Settings.accessibility.reducedSensoryEffects;
damageFlashScaleInput.value = String(pass65Settings.accessibility.damageFlashScale);
weaponMotionScaleInput.value = String(pass65Settings.accessibility.weaponMotionScale);
shareGlobalLeaderboardInput.checked = pass65Settings.privacy.shareGlobalLeaderboard;
element<HTMLElement>('#graphics-effective').textContent = `EFFECTIVE: ${displayedGraphicsPreset.toUpperCase()}${graphicsRuntime.reason ? ` · ${graphicsRuntime.reason.toUpperCase()}` : ''}`;

function persistPass65Settings(next: Pass65Settings): boolean {
  const result = playerProfileStore.update({ settings: next }, { sessionOnFailure: true });
  pass65Settings = result.value.settings;
  return result.ok;
}

function persistControlPreferences(patch: Partial<PlayerControlPreferencesV1>): void {
  const controls: PlayerControlPreferencesV1 = Object.freeze({
    ...playerProfileStore.current.controls,
    ...patch,
    schemaVersion: 1,
  });
  playerProfileStore.update({ controls }, { sessionOnFailure: true });
}

function applyAccessibilitySettings(): void {
  accessibilityRuntime = resolveAccessibilityRuntime(pass65Settings.accessibility, {
    reducedMotion: reducedMotionMedia.matches,
    reducedTransparency: reducedTransparencyMedia.matches,
  });
  document.documentElement.dataset.reducedSensory = accessibilityRuntime.reducedSensory ? 'true' : 'false';
  document.documentElement.dataset.reducedMotion = accessibilityRuntime.reducedMotion ? 'true' : 'false';
  configureMenuPreviewAudio();
  damageFlash.style.setProperty('--damage-flash-scale', String(accessibilityRuntime.damageFlashScale));
  element<HTMLElement>('#accessibility-effective').textContent = accessibilityRuntime.reducedSensory
    ? `REDUCED SENSORY · ${accessibilityRuntime.reasons.join(' + ') || 'PLAYER'}`
    : 'STANDARD SENSORY';
}

function applyPrivacySettings(): void {
  const enabled = pass65Settings.privacy.shareGlobalLeaderboard;
  element<HTMLElement>('#global-leaderboard-sharing-state').textContent = enabled ? 'SHARING ENABLED' : 'SHARING OFF';
  renderHighScores();
}

// Pass 65: graphics changes batch here and flush when the player leaves the
// options screen (tab switch, resume, or main menu), so adjusting several
// settings never kicks them out of the graphics menu or the match per control.
let pendingGraphicsPreset: GraphicsPreset | null = null;
let pendingRendererReload = false;

function reloadForGraphicsRuntime(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete('render');
  window.location.assign(url);
}

function refreshGraphicsPendingBadge(): void {
  const pending = pendingGraphicsPreset !== null || advancedGraphicsBinding.hasPendingEdits();
  element<HTMLElement>('#graphics-effective').textContent = pending
    ? 'PENDING · SAVES WHEN YOU LEAVE OPTIONS'
    : `EFFECTIVE: ${displayedGraphicsPreset.toUpperCase()}${graphicsRuntime.reason ? ` · ${graphicsRuntime.reason.toUpperCase()}` : ''}`;
}

function flushPendingGraphics(): void {
  const hasEdits = advancedGraphicsBinding.hasPendingEdits();
  const preset = pendingGraphicsPreset;
  let merged: Partial<Pass65Settings['graphics']>;
  if (preset === null && !hasEdits) {
    return;
  } else if (preset === 'custom' || hasEdits) {
    // The transaction retains the most recently displayed named profile as
    // its baseline, so Custom is exactly that profile plus the staged edits.
    merged = advancedGraphicsBinding.customSettings();
  } else {
    merged = { preset: preset! };
  }
  const next = normalizePass65Settings({ ...pass65Settings, graphics: merged }, capabilityHints);
  if (!persistPass65Settings(next)) {
    setStatus('Graphics could not be saved; renderer reload was cancelled.', 'warn');
    return;
  }
  advancedGraphicsBinding.clearPendingEdits();
  pendingGraphicsPreset = null;
  refreshGraphicsPendingBadge();
  if (gameStarted) {
    // Never yank the player out of a session: the renderer reload waits until
    // they are back at the main menu.
    pendingRendererReload = true;
    setStatus('Graphics saved · new renderer settings apply when you return to the main menu.');
    return;
  }
  reloadForGraphicsRuntime();
}

const advancedGraphicsBinding = bindAdvancedGraphicsControls(document, pass65Settings.graphics, () => {
  pendingGraphicsPreset = 'custom';
  graphicsProfileInput.value = 'custom';
  refreshGraphicsPendingBadge();
});
document.documentElement.dataset.graphicsRegistryCount = String(advancedGraphicsBinding.registeredKeys.length);

applyAccessibilitySettings();
applyPrivacySettings();
sensitivityInput.addEventListener('input', () => {
  sensitivity = Number(sensitivityInput.value);
  persistControlPreferences({ mouseSensitivity: sensitivity });
});
controllerSensitivityInput.addEventListener('input', () => {
  controllerSensitivity = Number(controllerSensitivityInput.value);
  persistControlPreferences({ controllerSensitivity });
});
fovInput.addEventListener('input', () => {
  preferredFov = Number(fovInput.value);
  persistControlPreferences({ fieldOfView: preferredFov });
});
graphicsProfileInput.addEventListener('change', () => {
  const preset = graphicsProfileInput.value as GraphicsPreset;
  pendingGraphicsPreset = preset;
  if (preset !== 'custom' && preset in GRAPHICS_PRESET_VALUES) {
    // Show the picked preset's real values in the advanced panel so the player
    // can see what they were before deciding to tweak them into a custom set.
    advancedGraphicsBinding.refresh({ schemaVersion: 1, preset, ...GRAPHICS_PRESET_VALUES[preset as keyof typeof GRAPHICS_PRESET_VALUES] });
  }
  refreshGraphicsPendingBadge();
});

for (const id of AUDIO_BUS_IDS) {
  const gain = element<HTMLInputElement>(`#audio-${id}-gain`);
  const mute = element<HTMLInputElement>(`#audio-${id}-mute`);
  gain.value = String(pass65Settings.audio.gains[id]);
  mute.checked = pass65Settings.audio.mutes[id];
  const apply = () => {
    const next = normalizePass65Settings({
      ...pass65Settings,
      audio: {
        schemaVersion: 1,
        gains: { ...pass65Settings.audio.gains, [id]: Number(gain.value) },
        mutes: { ...pass65Settings.audio.mutes, [id]: mute.checked },
      },
    }, capabilityHints);
    audio.configure(next.audio);
    persistPass65Settings(next);
    configureMenuPreviewAudio(next);
  };
  gain.addEventListener('input', apply);
  mute.addEventListener('change', apply);
}

function updateAccessibilityFromInputs(): void {
  const next = normalizePass65Settings({
    ...pass65Settings,
    accessibility: {
      reducedMotion: reducedMotionInput.checked,
      reducedDamageFlash: reducedDamageFlashInput.checked,
      reducedSensoryEffects: reducedSensoryEffectsInput.checked,
      damageFlashScale: Number(damageFlashScaleInput.value),
      weaponMotionScale: Number(weaponMotionScaleInput.value),
    },
  }, capabilityHints);
  pass65Settings = next;
  applyAccessibilitySettings();
  persistPass65Settings(next);
}
for (const input of [reducedMotionInput, reducedDamageFlashInput, reducedSensoryEffectsInput, damageFlashScaleInput, weaponMotionScaleInput]) {
  input.addEventListener(input.type === 'range' ? 'input' : 'change', updateAccessibilityFromInputs);
}
shareGlobalLeaderboardInput.addEventListener('change', () => {
  const enabled = shareGlobalLeaderboardInput.checked;
  const next = normalizePass65Settings({
    ...pass65Settings,
    privacy: { schemaVersion: 1, shareGlobalLeaderboard: enabled },
  }, capabilityHints);
  if (!enabled) forgetLeaderboardInstallId(localStorage);
  persistPass65Settings(next);
  applyPrivacySettings();
});
reducedMotionMedia.addEventListener('change', applyAccessibilitySettings);
reducedTransparencyMedia.addEventListener('change', applyAccessibilitySettings);
function recoverFromSchedulingInterruption(reason: string): void {
  // Browser rAF throttling while hidden or unfocused pollutes every frame-time
  // sampler. Re-anchor pacing and drop adaptive evidence before presentation
  // resumes; elapsed scheduler time is not evidence of a GPU/device hang.
  audio.resume();
  const refocusAt = performance.now();
  lastFrame = refocusAt;
  lastPresentedFrameAt = refocusAt;
  framePacing.reset(reason);
  resetWebGpuPresentationEpoch(reason, refocusAt);
  adaptiveQuality.resetSampling(reason);
}

function currentPresentationSchedulingInput() {
  const presentationRequested = debugCaptureCameraActive
    || (gameStarted && !matchFinished && menuLifecycle.surface === 'hidden');
  return {
    pageVisible: document.visibilityState === 'visible',
    windowFocused: document.hasFocus(),
    presentationRequested,
    hostedAuthority: network.role === 'host' && gameStarted && !matchFinished,
    networkConnected: network.role !== 'offline' && gameStarted && !matchFinished,
  } as const;
}

const presentationSchedulingLifecycle = new PresentationSchedulingLifecycle(currentPresentationSchedulingInput());
let lastPresentationSchedulingDecision: PresentationSchedulingDecision = presentationSchedulingLifecycle.observe(
  currentPresentationSchedulingInput(),
  'initial',
);
let hostedBackgroundNetworkHeartbeatCount = 0;

function reconcilePresentationScheduling(reason: string): PresentationSchedulingDecision {
  const decision = presentationSchedulingLifecycle.observe(currentPresentationSchedulingInput(), reason);
  lastPresentationSchedulingDecision = decision;
  if (decision.leftForeground) {
    clearGameplayInput();
    audio.suspend();
    accumulator = 0;
    lastFrame = performance.now();
  }
  if (decision.resumedForeground) {
    recoverFromSchedulingInterruption(`${reason} · recovery ${decision.recoveryGeneration}`);
    accumulator = 0;
  }
  return decision;
}

document.addEventListener('visibilitychange', () => {
  reconcilePresentationScheduling(document.hidden ? 'tab visibility hidden' : 'tab visibility regained');
});
window.addEventListener('beforeunload', () => audio.dispose(), { once: true });

const GAMEPAD_SUPPORT_LABELS: Record<FieldSupportId, string> = {
  'scout-sweep': 'SCOUT SWEEP',
  adrenaline: 'ADRENALINE BOOST',
  'care-package': 'CARE PACKAGE',
  yardhawk: 'YARDHAWK',
  'piloted-drone': 'PILOTED DRONE',
  'tri-pass': 'TRI-PASS',
  'carpet-bomber': 'CARPET BOMBER',
  'hunter-swarm': 'HUNTER SWARM',
  chopper: 'CHOPPER GUNNER',
  'drone-swarm': 'DRONE SWARM',
  nuke: 'NUKE',
};

function selectGamepadSupport(direction: -1 | 1): void {
  gamepadSupportSelection = cycleFieldSupportSelection(gamepadSupportSelection, direction, localFieldSupportProjection().loadout);
  addFeed(`PAD SUPPORT · ${GAMEPAD_SUPPORT_LABELS[gamepadSupportSelection]}`, 'gold');
  updateFieldSupportHud();
}

function pollGamepad(dt: number): void {
  const pad = navigator.getGamepads?.().find((candidate): candidate is Gamepad => Boolean(candidate && candidate.connected));
  if (!pad) {
    gamepadMove = { x: 0, y: 0 };
    gamepadLookRate = { yaw: 0, pitch: 0 };
    gamepadDroneVertical = 0;
    gamepadSprint = false;
    previousGamepadButtons = [];
    setLocalTriggerHeld(mouseTriggerHeld);
    adsHeld = admittedAdsHeld(debugAdsOverride ?? mouseAdsHeld);
    return;
  }
  const shapedMove = applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.14, 1.6);
  const look = applyRadialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.1, 1.6);
  const buttons = pad.buttons.map((button) => button.pressed || button.value > 0.55);
  const pressed = (index: number) => buttons[index] && !previousGamepadButtons[index];
  const padAds = Boolean(buttons[6]) || (pad.buttons[6]?.value ?? 0) > 0.22;
  const padTrigger = Boolean(buttons[7]) || (pad.buttons[7]?.value ?? 0) > 0.22;
  const canControlPlayer = gameplayInputEnabled();
  const possession = localKillstreakActorSnapshot()?.possession ?? null;
  const pilotedDronePossessed = possession?.kind === 'piloted-drone';
  if (!padTrigger) gamepadTriggerArmed = true;
  else if (!canControlPlayer) gamepadTriggerArmed = false;
  if (!padAds) gamepadAdsArmed = true;
  else if (!canControlPlayer) gamepadAdsArmed = false;
  const padTriggerActive = canControlPlayer && padTrigger && gamepadTriggerArmed;
  const padAdsActive = canControlPlayer && padAds && gamepadAdsArmed;
  gamepadSprint = canControlPlayer && Boolean(buttons[10]);
  adsHeld = admittedAdsHeld(debugAdsOverride ?? (mouseAdsHeld || padAdsActive));
  setLocalTriggerHeld(mouseTriggerHeld || padTriggerActive);
  gamepadMove = canControlPlayer ? shapedMove : { x: 0, y: 0 };
  gamepadDroneVertical = canControlPlayer && pilotedDronePossessed
    ? THREE.MathUtils.clamp(Number(buttons[0]) - Number(buttons[1]), -1, 1)
    : 0;
  gamepadLookRate = integrateGamepadLookRate(
    gamepadLookRate,
    canControlPlayer ? look : { x: 0, y: 0 },
    dt,
    adsHeld,
    controllerSensitivity,
  );
  if (canControlPlayer) {
    if (pilotedDronePossessed) {
      const pose = applyPilotedDroneScreenLookDelta({
        yaw: player.yaw,
        pitch: player.pitch,
        horizontalLookDelta: gamepadLookRate.yaw * dt,
        verticalLookDelta: gamepadLookRate.pitch * dt,
      });
      player.yaw = pose.yaw;
      player.pitch = pose.pitch;
    } else {
      player.yaw -= gamepadLookRate.yaw * dt;
      player.pitch = THREE.MathUtils.clamp(player.pitch - gamepadLookRate.pitch * dt, -1.42, 1.42);
    }
    if (!possession) {
      if (pressed(0)) {
        if (player.stance !== 'stand') requestStance('stand');
        jumpQueuedAt = performance.now();
      }
      if (pressed(1)) requestStance('toggle-crouch');
      if (pressed(13)) requestStance('toggle-prone');
      if (pressed(2)) reload();
      if (pressed(3)) switchWeapon(player.weapon === (localHoldsRailgun() ? 'railgun' : player.primaryWeapon) ? 1 : 0);
      if (pressed(4)) throwGrenade();
      if (pressed(5)) melee();
      if (pressed(14)) selectGamepadSupport(-1);
      if (pressed(15)) selectGamepadSupport(1);
      if (pressed(12)) activateFieldSupport(gamepadSupportSelection);
    }
  }
  previousGamepadButtons = buttons;
}

textChatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  event.stopPropagation();
  submitTextChat();
});
textChatInput.addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTextChat(true);
  }
});
textChatInput.addEventListener('input', markTextChatActivity);
textChatInput.addEventListener('keyup', (event) => event.stopPropagation());
window.addEventListener('keydown', (event) => {
  if (isTextChatTyping()) {
    if (event.target === textChatInput) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.key === 'Escape') closeTextChat(true);
    else textChatInput.focus({ preventScroll: true });
    return;
  }
  if (event.key !== 'Enter' || event.repeat || !textChatAvailable()) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, button, [contenteditable="true"]')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openTextChat();
});

window.addEventListener('keydown', (event) => {
  if (isTextChatTyping()) return;
  if (
    event.code === 'Escape'
    && !event.repeat
    && activeMenuTabId === 'options'
    && gameStarted
    && player.alive
    && !matchFinished
    && menuLifecycle.surface === 'paused-match'
  ) {
    event.preventDefault();
    resumeActiveMatchFromMenu();
    return;
  }
  if (pointSupportTargeting && !tacticalMapOpen && event.code === 'Escape' && !event.repeat) {
    event.preventDefault();
    cancelSupportTargeting(true);
    return;
  }
  if (tacticalMapOpen && event.code === 'Escape' && !event.repeat) {
    event.preventDefault();
    cancelSupportTargeting(true);
    return;
  }
  if (
    event.code === 'Escape'
    && !event.repeat
    && gameStarted
    && player.alive
    && !matchFinished
    && menuLifecycle.surface === 'hidden'
    && document.pointerLockElement !== canvas
  ) {
    event.preventDefault();
    openActiveMatchPause('escape');
    return;
  }
  if (gameplayInputEnabled()) keys.add(event.code);
  else if (event.code !== 'Tab') return;
  const supportPossession = localKillstreakActorSnapshot()?.possession ?? null;
  if (!supportPossession) {
    if (event.code === 'Space' && !event.repeat) {
      if (player.stance !== 'stand') requestStance('stand');
      jumpQueuedAt = performance.now();
    }
    if (event.code === 'KeyC' && !event.repeat) requestStance('toggle-crouch');
    if ((event.code === 'KeyZ' || event.code === 'ControlLeft') && !event.repeat) requestStance('toggle-prone');
    if (event.code === 'Digit1') switchWeapon(0);
    if (event.code === 'Digit2') switchWeapon(1);
    const supportSlot = ['Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'].indexOf(event.code);
    if (supportSlot >= 0 && !event.repeat) activateFieldSupport(localFieldSupportProjection().loadout.slots[supportSlot]);
    if (event.code === 'KeyR') reload();
    if (event.code === 'KeyV' && !event.repeat) melee();
    if (event.code === 'KeyG' && !event.repeat) throwGrenade();
  }
  if (event.code === 'KeyF' && !event.repeat) {
    const now = performance.now();
    if (pointSupportTargeting && !tacticalMapOpen) {
      confirmCrosshairSupportTarget(now);
    } else {
      beginFInteractionPress(now);
    }
  }
  if (event.code === 'Tab') {
    event.preventDefault();
    updateRoster();
    element<HTMLElement>('#roster').hidden = false;
  }
});
window.addEventListener('keyup', (event) => {
  if (event.code === 'KeyF') releaseFInteractionPress(performance.now());
  keys.delete(event.code);
  if (event.code === 'Tab') element<HTMLElement>('#roster').hidden = true;
});
window.addEventListener('blur', () => {
  lastWindowBlurAt = performance.now();
  cancelFInteractionPress('blur', lastWindowBlurAt);
  applyMenuLifecycle({ type: 'focus-lost' });
  reconcilePresentationScheduling('window focus lost');
});
window.addEventListener('focus', () => {
  applyMenuLifecycle({ type: 'focus-gained' });
  reconcilePresentationScheduling('window focus regained');
});
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas || !player.alive || isTextChatTyping()) return;
  const aimScale = mouseSensitivityMultiplier(adsHeld, currentSprinting);
  if (localKillstreakActorSnapshot()?.possession?.kind === 'piloted-drone') {
    const pose = applyPilotedDronePointerDelta({
      yaw: player.yaw,
      pitch: player.pitch,
      deltaX: event.movementX,
      deltaY: event.movementY,
      radiansPerPixel: 0.00215 * sensitivity * aimScale,
      verticalRadiansPerPixel: 0.0019 * sensitivity * aimScale,
    });
    player.yaw = pose.yaw;
    player.pitch = pose.pitch;
  } else {
    player.yaw -= event.movementX * 0.00215 * sensitivity * aimScale;
    player.pitch = Math.max(-1.42, Math.min(1.42, player.pitch - event.movementY * 0.0019 * sensitivity * aimScale));
  }
  if (!localKillstreakActorSnapshot()?.possession) weaponView.addMouseDelta(event.movementX, event.movementY);
});
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('mousedown', (event) => {
  if (isTextChatTyping()) return;
  if (document.pointerLockElement !== canvas) {
    requestGamePointerLock('canvas');
    return;
  }
  if (pointSupportTargeting && !tacticalMapOpen && event.button === 0) {
    event.preventDefault();
    confirmCrosshairSupportTarget(performance.now());
    return;
  }
  if (event.button === 2) {
    mouseAdsHeld = true;
    adsHeld = admittedAdsHeld(true);
    return;
  }
  if (event.button !== 0) return;
  mouseTriggerHeld = true;
  setLocalTriggerHeld(true);
  tryFire(performance.now());
});
window.addEventListener('mouseup', (event) => {
  if (event.button === 0) mouseTriggerHeld = false;
  if (event.button === 2) mouseAdsHeld = false;
  setLocalTriggerHeld(mouseTriggerHeld);
  adsHeld = admittedAdsHeld(mouseAdsHeld);
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    if (!gameStarted || menuLifecycle.surface === 'pre-match' || menuLifecycle.surface === 'error') {
      // A delayed browser grant from an obsolete match/request must never own
      // input over a lobby or a deployment transition.
      void document.exitPointerLock();
      return;
    }
    const pauseAlreadyOpen = menuLifecycle.surface === 'paused-match';
    applyMenuLifecycle({ type: 'pointer-acquired' });
    if (pauseAlreadyOpen) void document.exitPointerLock();
    return;
  }
  clearGameplayInput();
  const overlay = isTextChatTyping() ? 'chat' : tacticalMapOpen ? 'tactical-map' : null;
  const pauseAllowed = gameStarted && player.alive && !matchFinished;
  const focusTransition = !document.hasFocus() || performance.now() - lastWindowBlurAt < 300;
  const openingPause = menuLifecycle.pointerLock === 'locked'
    && !focusTransition
    && overlay === null
    && pauseAllowed;
  if (openingPause) presentActiveMatchBackdrop('escape');
  applyMenuLifecycle({ type: 'pointer-lost', focusTransition, overlay, pauseAllowed });
  if (menuLifecycle.surface === 'paused-match') {
    requestAnimationFrame(() => resumeButton.focus({ preventScroll: true }));
  }
});
document.addEventListener('pointerlockerror', () => {
  if (menuLifecycle.pointerLock !== 'requesting') return;
  applyMenuLifecycle({ type: 'pointer-rejected' });
  setStatus('Mouse capture was blocked. Click the match to retry.', 'warn');
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
    button.disabled = !arenaSelectionReady || gameStarted || matchStartPreparing || lobbyArenaLocked;
  }
  const soloButton = element<HTMLButtonElement>('#solo');
  const hostButton = element<HTMLButtonElement>('#host');
  const joinButton = element<HTMLButtonElement>('#join');
  soloButton.textContent = soloLaunchLabel(selectedArena);
  hostButton.textContent = 'HOST LOBBY';
  soloButton.disabled = !arenaSelectionReady;
  hostButton.disabled = !arenaSelectionReady || !selectedArena.multiplayer || !webRtcSupported;
  joinButton.disabled = !arenaSelectionReady || !selectedArena.multiplayer || !webRtcSupported;
  element<HTMLInputElement>('#room-input').disabled = !selectedArena.multiplayer;
  element<HTMLElement>('#arena-title').innerHTML = selectedArena.titleAccent
    ? `${selectedArena.titleLead} <span>${selectedArena.titleAccent}</span>`
    : selectedArena.titleLead;
  element<HTMLElement>('#arena-lede').textContent = selectedArena.menuLede;
  renderFieldKitSelection();
}

function atomicQualityHousePresentationActive(): boolean {
  return blenderArenaActive
    && !(interactiveWorldRuntime?.hasDetachedProfileOwnedHouseFragment() ?? false);
}

function syncAtomicHouseStructuralPresentation(): void {
  if (selectedArena.id !== 'atomic-acres' || arena.id !== 'atomic-acres') return;
  const qualityOwnsStaticFragments = atomicQualityHousePresentationActive();
  interactiveWorldRuntime?.setExternalHouseProfilePresentationActive(qualityOwnsStaticFragments);
  arena.root.visible = !qualityOwnsStaticFragments;
  if (arenaArtRoot) arenaArtRoot.visible = blenderArenaActive ? qualityOwnsStaticFragments : true;
}

function setArenaPresentationVisibility(): void {
  const atomicVisible = selectedArena.id === 'atomic-acres';
  const rustworksVisible = selectedArena.id === 'rustworks-1v1';
  const atomicQualityPrimary = atomicVisible && atomicQualityHousePresentationActive();
  arena.root.visible = arena.id === 'atomic-acres'
    ? !atomicQualityPrimary
    : true;
  interactiveWorldRuntime?.setExternalHouseProfilePresentationActive(atomicQualityPrimary);
  if (worldIdentityPresentation) {
    worldIdentityPresentation.root.visible = atomicVisible;
    setWorldIdentityHouseShellPresentation(worldIdentityPresentation.root, atomicVisible && !blenderArenaActive);
  }
  if (neighbourhoodLifeRoot) neighbourhoodLifeRoot.visible = atomicVisible;
  // Rustworks' ocean needs a long view frustum so water, not void, meets the horizon.
  const desiredFarPlane = rustworksVisible ? 1_400 : 180;
  if (camera.far !== desiredFarPlane) {
    camera.far = desiredFarPlane;
    camera.updateProjectionMatrix();
  }
  atmosphereSystem?.setArena(selectedArena.id);
  if (atmosphereSystem) atmosphereSystem.root.visible = atmosphereSystem.telemetry().enabled;
  waterSystem.configure(selectedArena.id, renderProfile, {
    halfX: Math.max(Math.abs(arena.bounds.minX), Math.abs(arena.bounds.maxX)),
    halfZ: Math.max(Math.abs(arena.bounds.minZ), Math.abs(arena.bounds.maxZ)),
  }, { night: selectedArena.id === 'rustworks-1v1', waterLevel: selectedArena.id === 'rustworks-1v1' ? -19.5 : -0.55 });
  ensureRustworksStarfield(scene, selectedArena.id);
  applyArenaFogProfile();
  applyArenaLightingForSelection();
  setRustworksQualityPresentationActive(rustworksVisible, renderProfile);
  if (selectedArena.id === 'skyline-terminal') applyAdditionalMapPresentationProfile(arena.root, renderProfile);
  if (rustworksVisible) {
    applyRustworksPresentationProfile(arena.root, renderProfile);
    setRustworksProceduralPresentationVisible(arena.root, true);
  }
  if (grassSystem) grassSystem.root.visible = atomicVisible;
  if (arenaArtRoot) arenaArtRoot.visible = atomicVisible && (!blenderArenaActive || atomicQualityPrimary);
  overdriveRoot.visible = false;
  if (activeRenderConfig.shadowMode === 'static') requestStaticShadowRefresh();
  atomicSignal?.invalidateValidation();
}

function applyArenaLightingForSelection(): void {
  activeLighting = rustworksLightingTint(
    arenaLightingProfile(renderProfile, selectedArena.id),
    renderProfile,
    selectedArena.id,
  );
  const lighting = activeLighting;
  const definition = activeArenaVisualDefinition?.id === selectedArena.id ? activeArenaVisualDefinition : null;
  renderRuntime.setExposure(effectiveGraphicsExposure(definition?.colorPipeline.exposure ?? lighting.exposure));
  renderRuntime.configureShadows({ enabled: renderRuntime.shadowsEnabled(), type: THREE.PCFShadowMap });
  if (scene.fog instanceof THREE.Fog) scene.fog.color.setHex(definition?.fog.color ?? lighting.fogColor);
  if (skyMaterial) {
    skyMaterial.uniforms.top.value.setHex(lighting.skyTop);
    skyMaterial.uniforms.horizon.value.setHex(lighting.skyHorizon);
    skyMaterial.uniforms.bottom.value.setHex(lighting.skyBottom);
    skyMaterial.uniforms.sunColor.value.setHex(lighting.skySun);
    skyMaterial.uniforms.cloudColor.value.setHex(lighting.skyCloud);
    skyMaterial.uniforms.cloudShadow.value.setHex(lighting.skyCloudShadow);
    skyMaterial.uniforms.cloudLight.value.setHex(lighting.skyCloudLight);
    skyMaterial.uniforms.sunDirection.value.set(...lighting.sunPosition).normalize();
    skyMaterial.uniforms.rayStrength.value = (raysQuery === 'off' || (softwareRenderer && raysQuery !== 'on'))
      ? 0
      : lighting.godRayStrength;
    skyMaterial.uniforms.rayLobes.value = skyMaterial.uniforms.rayStrength.value > 0 ? lighting.godRayLobes : 0;
  }
  if (hemisphereLight) {
    hemisphereLight.color.setHex(lighting.hemisphereSky);
    hemisphereLight.groundColor.setHex(lighting.hemisphereGround);
    hemisphereLight.intensity = lighting.hemisphereIntensity * graphicsRuntime.indirectLightScale;
  }
  if (ambientLight) {
    ambientLight.color.setHex(definition?.lighting.ambientColor ?? lighting.ambientColor);
    ambientLight.intensity = (definition?.lighting.ambientIntensity ?? lighting.ambientIntensity) * graphicsRuntime.indirectLightScale;
  }
  if (sunLight) {
    sunLight.color.setHex(definition?.lighting.sunColor ?? lighting.sunColor);
    sunLight.intensity = definition?.lighting.sunIntensity ?? lighting.sunIntensity;
    sunLight.position.set(...lighting.sunPosition);
    sunLight.shadow.radius = lighting.softShadows ? 2.2 : 1;
    const shadowsEnabled = adaptiveShadowsEnabled(
      renderProfile,
      activeRenderConfig.shadows && (definition?.shadows.enabled ?? true),
      adaptiveQuality.telemetry().pixelRatioCap,
    );
    renderRuntime.setShadowsEnabled(shadowsEnabled);
    sunLight.castShadow = shadowsEnabled && (definition?.lighting.sunIntensity ?? lighting.sunIntensity) > 0;
    if (definition) {
      const shadowMapSize = Math.min(definition.shadows.mapSize, activeRenderConfig.shadowMapSize);
      sunLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      sunLight.shadow.normalBias = definition.shadows.normalBias;
    }
    graphicsRefinement.applyArena(
      selectedArena.id,
      arena.bounds,
      sunLight,
      lighting.sunPosition,
      renderRuntime.shadowsEnabled()
        ? Math.min(definition?.shadows.mapSize ?? activeRenderConfig.shadowMapSize, activeRenderConfig.shadowMapSize)
        : 0,
    );
    if (definition) {
      sunLight.shadow.camera.far = Math.min(sunLight.shadow.camera.far, definition.shadows.maximumDistance);
      sunLight.shadow.camera.updateProjectionMatrix();
    }
  }
  if (fillLight) {
    fillLight.color.setHex(lighting.fillColor);
    fillLight.intensity = lighting.fillIntensity * graphicsRuntime.indirectLightScale;
    fillLight.position.set(...lighting.fillPosition);
  }
  if (definition) arenaContrastLighting.applyDefinition(definition);
  if (renderRuntime.shadowsEnabled()) requestStaticShadowRefresh();
}

function menuPreviewShouldBeActive(): boolean {
  return (menuLifecycle.surface === 'pre-match' || menuLifecycle.surface === 'deploying')
    && !gameStarted
    && !menu.classList.contains('hidden')
    && (menuLifecycle.surface === 'deploying' || !element<HTMLElement>('#menu-panel-deploy').hidden);
}

function syncMenuPreviewCanvasPlacement(): void {
  const active = menuPreviewShouldBeActive();
  if (canvas.parentElement === menuShowcase && canvasHomeAnchor.parentNode) {
    canvasHomeAnchor.parentNode.insertBefore(canvas, canvasHomeAnchor);
  }
  menuPreviewVideoController.setActive(active);
  menuShowcase.dataset.previewActive = String(active);
  document.documentElement.dataset.menuPreview = active ? 'prerecorded-video' : 'inactive';
  if (!active) {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
  }
}

function setArenaMenuCamera(): void {
  menuPreviewVideoController.select(selectedArena.id, accessibilityRuntime.reducedMotion);
  syncMenuPreviewCanvasPlacement();
}

const menuPreviewObserver = new MutationObserver(syncMenuPreviewCanvasPlacement);
menuPreviewObserver.observe(menu, { attributes: true, attributeFilter: ['class'] });
menuPreviewObserver.observe(element<HTMLElement>('#menu-panel-deploy'), { attributes: true, attributeFilter: ['hidden'] });
reducedMotionMedia.addEventListener('change', () => setArenaMenuCamera());
syncMenuLifecyclePresentation();
syncMenuPreviewCanvasPlacement();

async function performArenaSelection(id: ArenaId, allowWhilePreparing = false): Promise<void> {
  if (gameStarted
    || matchStartPreparing && !allowWhilePreparing
    || !arenaSelectionReady
    || gameplayArenaPrepared && id === arena.id) return;
  arenaTransitionGeneration += 1;
  const nextSelection = arenaSelection(id);
  const previousSelection = gameplayArenaPrepared ? arenaSelection(arena.id) : selectedArena;
  const previousArena = arena;
  const previousPhysics = characterPhysics;
  const previousInteractiveWorldRuntime = interactiveWorldRuntime;
  const hadPreparedArena = gameplayArenaPrepared;
  let nextArena: ArenaMap | null = null;
  let nextPhysics: CharacterPhysics | null = null;
  let nextInteractiveWorldRuntime: InteractiveWorldRuntime | null = null;
  let committed = false;
  arenaSelectionReady = false;
  renderSubmissionPaused = true;
  arenaTransitionPhase = 'fencing';
  arenaTransitionStartedAt = performance.now();
  arenaTransitionProfiler.begin(
    arenaTransitionGeneration,
    nextSelection.id,
    arenaTransitionStartedAt,
    'shared-gameplay-assets',
  );
  arenaTransitionCompletedAt = null;
  arenaTransitionFailure = null;
  syncArenaSelectionUi();
  setStatus(`Preparing ${nextSelection.displayName} deployment assets…`);
  try {
    await prepareMenuDeploymentAssets();
    // A map generation may only replace renderer-visible authority once every
    // earlier WebGPU submission has completed. This prevents the old root's
    // buffers from being detached or destroyed while the queue still uses it.
    profileArenaTransition('previous-webgpu-fence');
    await flushWebGpuFrames();
    arenaTransitionPhase = 'preparing';
    profileArenaTransition('arena-construction');
    nextArena = ensureArenaConstructed(nextSelection.id);
    profileArenaTransition('interactive-world-construction');
    nextInteractiveWorldRuntime = createInteractiveWorldRuntime(
      nextArena,
      interactiveWorldMatchEpoch,
      true,
    );
    nextInteractiveWorldRuntime.root.visible = false;
    latestArenaPerformanceBudgetSample = null;
    if (localArenaSwitchQaDelayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, localArenaSwitchQaDelayMs));
    }
    profileArenaTransition('physics-construction');
    nextPhysics = await CharacterPhysics.create(nextArena.physicsColliders, nextArena.bounds);
    profileArenaTransition('authority-commit');
    characterPhysics = nextPhysics;
    selectedArena = nextSelection;
    arena = nextArena;
    interactiveWorldRuntime = nextInteractiveWorldRuntime;
    previousInteractiveWorldRuntime?.root.removeFromParent();
    interactiveWorldRuntime.root.visible = true;
    syncInteractiveWorldPhysics(true);
    audio.setArena(selectedArena.id);
    footstepEmitters.reset();
    document.documentElement.dataset.arenaId = selectedArena.id;
    profileArenaTransition('visual-definition');
    await configurePlayableArenaVisuals(selectedArena.id, arena.root, false);
    profileArenaTransition('quality-presentation');
    await ensureSelectedQualityPresentation(selectedArena.id);
    profileArenaTransition('material-tuning');
    materialCompatibility = tuneMaterialsForAtomicSignal(
      scene,
      weaponView.root,
      renderProfile,
      maximumAnisotropy,
    );
    graphicsRefinement.refine(scene, maximumAnisotropy);
    profileArenaTransition('art-texture-settle');
    await waitForPendingArtTextures();
    bootstrapStage = 'prewarming-weapon-catalog';
    profileArenaTransition('weapon-catalog-prewarm');
    await weaponView.prewarmBrowserWeaponCatalog(weaponPrewarmCatalogForArena(
      nextSelection.id,
      gunRangeSidearmForWeaponPrewarm(),
    ));
    profileArenaTransition('presentation-batching');
    batchSelectedArenaPresentation();
    setArenaPresentationVisibility();
    profileArenaTransition('match-authority-reset');
    matchState = createMatch(performance.now(), selectedArena.matchRules);
    lastPlayerSpawnIndex = -1;
    lastPlayerSpawnAudit = null;
    recentDeathPositions.length = 0;
    lastBotSpawnAudit.clear();
    respawn(false);
    setArenaMenuCamera();
    // Scene-dependent WebGPU render objects can only be proven after the
    // selected arena has installed its HDR/light graph and the review camera
    // has a valid transform. Keep these exact gameplay draws behind the opaque
    // deployment surface and fence them before live submission resumes.
    await prewarmArenaBoundGameplayPresentations(arenaTransitionGeneration);
    arenaTransitionPhase = 'committing';
    // Lazy arena roots and their selected TSL definition must be compiled while
    // submissions remain paused. This also compiles the awaited Gun Range rack
    // assets before their first live frame can trip the presentation watchdog.
    const presentationRoot = selectedArena.id === 'atomic-acres' && arenaArtRoot?.visible
      ? arenaArtRoot
      : arena.root;
    profileArenaTransition('coverage-submit-fence');
    renderRuntime.resetRenderInfo();
    if (renderRuntime.backend === 'webgpu') {
      await flushWebGpuFrames(12_000);
      await withArenaFrustumCullingDisabled(presentationRoot, async () => {
        submitWebGpuFrame(performance.now(), true);
        // This is an admitted cold-generation fence, not the live-frame stall
        // budget. Keep the longer allowance behind the menu/loading surface.
        await flushWebGpuFrames(12_000);
      });
    } else {
      atomicSignal?.render(scene, camera, VIEWMODEL_RENDER_LAYER);
    }
    const readiness = auditArenaRenderLiveness(
      scene,
      arena.root,
      selectedArena.id,
      renderRuntime.renderInfo(),
      true,
      camera,
      presentationRoot,
    );
    if (readiness.reasons.length > 0) {
      throw new Error(`Map presentation failed readiness: ${readiness.reasons.join(', ')}`);
    }
    profileArenaTransition('retire-previous-arenas');
    await retireAllArenasExcept(selectedArena.id);
    profileArenaTransition('commit-bookkeeping');
    renderHighScores();
    committed = true;
    gameplayArenaPrepared = true;
    bootstrapStage = 'ready';
    document.documentElement.dataset.gameplayArena = selectedArena.id;
    previousInteractiveWorldRuntime?.dispose();
    try {
      previousPhysics?.dispose();
    } catch (disposeError) {
      console.warn('[Nuke Town previous map physics disposal failed]', disposeError);
    }
    setStatus(`${selectedArena.displayName} selected · ${selectedArena.rulesLabel}.`);
  } catch (error) {
    console.error('[Nuke Town map selection failed]', error);
    arenaTransitionPhase = 'rolling-back';
    arenaTransitionFailure = error instanceof Error ? error.message : String(error);
    profileArenaTransition('rollback');
    characterPhysics = previousPhysics;
    selectedArena = previousSelection;
    arena = previousArena;
    interactiveWorldRuntime = previousInteractiveWorldRuntime;
    gameplayArenaPrepared = hadPreparedArena;
    document.documentElement.dataset.gameplayArena = hadPreparedArena
      ? previousArena.id
      : 'deferred-until-deployment';
    if (interactiveWorldRuntime) {
      scene.add(interactiveWorldRuntime.root);
      interactiveWorldRuntime.root.visible = true;
    }
    syncInteractiveWorldPhysics(true);
    audio.setArena(selectedArena.id);
    footstepEmitters.reset();
    document.documentElement.dataset.arenaId = selectedArena.id;
    if (!hadPreparedArena) {
      arenaVisualReceipt = null;
      nextArena?.root.removeFromParent();
      if (nextArena) nextArena.root.visible = false;
      arenaTransitionPhase = 'failed';
      setArenaMenuCamera();
      setStatus(`${nextSelection.displayName} deployment preparation failed. Choose a map and retry.`, 'warn');
    } else try {
      await configurePlayableArenaVisuals(selectedArena.id, arena.root, false);
      await ensureSelectedQualityPresentation(selectedArena.id);
      await retireAllArenasExcept(selectedArena.id);
      setArenaPresentationVisibility();
      matchState = createMatch(performance.now(), selectedArena.matchRules);
      lastPlayerSpawnIndex = -1;
      lastPlayerSpawnAudit = null;
      recentDeathPositions.length = 0;
      lastBotSpawnAudit.clear();
      respawn(false);
      setArenaMenuCamera();
      setStatus(`Map switch failed — ${selectedArena.displayName} remains selected.`, 'warn');
    } catch (rollbackError) {
      arenaTransitionPhase = 'failed';
      arenaTransitionFailure = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
      showFatalError(new Error(`Map switch rollback failed: ${arenaTransitionFailure}`));
    }
  } finally {
    profileArenaTransition('finalize');
    if (!committed && nextPhysics && nextPhysics !== characterPhysics) nextPhysics.dispose();
    if (!committed && nextInteractiveWorldRuntime && nextInteractiveWorldRuntime !== interactiveWorldRuntime) {
      try {
        await flushWebGpuFrames();
        nextInteractiveWorldRuntime.dispose();
      } catch (retirementError) {
        nextInteractiveWorldRuntime.root.removeFromParent();
        nextInteractiveWorldRuntime.root.visible = false;
        console.warn('[Pass 65 failed arena interactive world retained after fence failure]', retirementError);
      }
    }
    renderSubmissionPaused = false;
    if (arenaTransitionPhase !== 'failed') arenaTransitionPhase = 'idle';
    arenaTransitionCompletedAt = performance.now();
    arenaTransitionProfiler.finish(
      arenaTransitionCompletedAt,
      committed ? 'committed' : arenaTransitionPhase === 'failed' ? 'failed' : 'rolled-back',
    );
    arenaSelectionReady = true;
    syncArenaSelectionUi();
    if (network.role !== 'offline' || privateLobbySnapshot) renderPrivateLobby();
  }
}

function activateArenaSelection(id: ArenaId, allowWhilePreparing = false): Promise<void> {
  const queued = arenaSelectionTask
    .catch(() => undefined)
    .then(() => performArenaSelection(id, allowWhilePreparing));
  arenaSelectionTask = queued;
  return queued;
}

function stageMenuArenaSelection(id: ArenaId): void {
  if (gameStarted || matchStartPreparing || !arenaSelectionReady || network.role !== 'offline' || privateLobbySnapshot) return;
  const nextSelection = arenaSelection(id);
  if (nextSelection.id === selectedArena.id) return;
  selectedArena = nextSelection;
  document.documentElement.dataset.menuArenaId = selectedArena.id;
  syncArenaSelectionUi();
  setArenaMenuCamera();
  renderHighScores();
  setStatus(`${selectedArena.displayName} selected · prerecorded preview ready · gameplay streams on deployment.`);
}

for (const button of document.querySelectorAll<HTMLButtonElement>('.map-card[data-arena-id]')) {
  button.addEventListener('click', () => {
    const id = button.dataset.arenaId as ArenaId | undefined;
    if (id) stageMenuArenaSelection(id);
  });
}

function resetForMode(): void {
  matchDiagnosticUploader.abandonActiveMatch();
  clearGameplayInput();
  interruptReload(true);
  lastMatchCountdownCue = null;
  matchCountdownCueSequence = 0;
  lastPrincipalShotAlignment = null;
  player.kills = 0;
  player.deaths = 0;
  player.hp = 100;
  player.grenades = 1;
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
  clearDeathDrops();
  clearCorpsePresentations();
  applyRailgunState(createRailgunAuthorityState('disabled', 0, 0, railgunState.generation + 1));
  railgunAdsResetRequired = false;
  railgunRechamberPresentationActive = false;
  localRailgunPendingUntilHostTimeMs = 0;
  lastRailgunStateBroadcastAt = -Infinity;
  railgunClaimAudit = createRailgunClaimAudit();
  resolvedRailgunShots.clear();
  processedRailgunShotResults.clear();
  lastAuthoritativeRailgunResult = null;
  railgunQaHeldDeadBots.clear();
  railgunLocalFeedbackPresentations = 0;
  lastRailgunLocalFeedbackSummary = null;
  railgunDeathPresentationCount = 0;
  railgunDeathPresentations.length = 0;
  railgunPresentation.resetBeams();
  railgunPresentation.updateWorld(railgunState, performance.now());
  railgunPresentation.updateThermal(camera, [], false);
  authorizedRemoteRedeploys.clear();
  resetBreakableWindows();
  for (const id of remotes.keys()) removeRemote(id, 'cleared', false);
  verifiedRemoteKills.clear();
  element<HTMLElement>('#banner').hidden = true;
  element<HTMLElement>('#countdown').hidden = true;
  element<HTMLElement>('#respawn').hidden = true;
  rangePrimaryUnlocked = false;
  const menuLoadout = activeLoadoutSelection();
  player.primaryWeapon = selectedArena.id === 'gun-range' ? 'carbine' : menuLoadout.primary;
  player.secondaryWeapon = selectedArena.id === 'gun-range' ? 'pistol' : menuLoadout.secondary;
  player.selectedGrenade = menuLoadout.grenade;
  player.weapon = selectedArena.id === 'gun-range' ? 'pistol' : player.primaryWeapon;
  player.switchingUntil = 0;
  if (renderRuntime.backend !== 'webgpu') weaponView.setWeapon(player.weapon, true);
  renderFieldKitSelection();
  player.ammo = createWeaponCapacityRegistry('mag');
  player.reserve = createWeaponCapacityRegistry('reserve');
}

function restartSoloMatch(): void {
  network.close();
  // startGame deliberately refuses to overlap an active match. Clear the old
  // lifecycle identity before resetting per-round state, otherwise a rematch
  // click leaves the expired 00:00 match running and startGame returns early.
  gameStarted = false;
  matchFinished = false;
  resetForMode();
  void startGame('solo', false);
}

function returnToMainMenu(): void {
  if (network.role !== 'offline') network.send({ type: 'leave', playerId: player.id, voluntary: true });
  network.close();
  resetForMode();
  resetPrivateLobbyState();
  gameStarted = false;
  matchFinished = false;
  matchWebGpuQualityFrozen = false;
  killstreakLoadoutController.releaseAfterMatch();
  killstreakMenuBinding.setMatchActive(false);
  weaponView.setPresentationVisible(false);
  hudRoot.hidden = true;
  roomCard.hidden = true;
  roomCodeEl.textContent = '';
  element<HTMLElement>('#room-hud').textContent = '';
  applyMenuLifecycle({ type: 'return-pre-match' });
  syncMatchReportDownloads();
  arenaSelectionReady = true;
  syncArenaSelectionUi();
  setArenaMenuCamera();
  setStatus(`${selectedArena.displayName} ready · choose a map or deploy again.`);
  void menuPreviewVideoController.whenFirstFramePresented()
    .then(() => prepareMenuDeploymentAssets('idle'))
    .catch(showFatalError);
  if (document.pointerLockElement) void document.exitPointerLock();
  // Pass 65: apply graphics saved mid-match now that we are back at the menu.
  flushPendingGraphics();
  if (pendingRendererReload) {
    pendingRendererReload = false;
    reloadForGraphicsRuntime();
  }
}

function resumeActiveMatchFromMenu(): void {
  if (!gameStarted || !player.alive || matchFinished) return;
  // One explicit transaction owns every pending Options edit. Switching the
  // visible panel after it must not perform a second persistence operation.
  flushPendingGraphics();
  if (activeMenuTabId === 'options') setMenuTab('deploy', false);
  applyMenuLifecycle({ type: 'resume' });
  requestGamePointerLock('resume');
}

resumeButton.addEventListener('click', () => {
  resumeActiveMatchFromMenu();
});
mainMenuButton.addEventListener('click', returnToMainMenu);
element<HTMLButtonElement>('#menu-download-match-summary').addEventListener('click', downloadMatchSummary);
element<HTMLButtonElement>('#menu-download-match-technical').addEventListener('click', downloadMatchDiagnostics);

bindReleaseHistoryDialog();
bindProjectMapDialog();

element<HTMLButtonElement>('#solo').addEventListener('click', () => {
  if (matchStartPreparing) return;
  if (!requirePlayerName()) return;
  network.close();
  resetForMode();
  resetPrivateLobbyState();
  void startGame('solo');
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
  const delay = stateBroadcastWakeIntervalMs(network.role, gameStarted, player.alive, localSnapshotRateState.rateHz);
  stateBroadcastTimer = setTimeout(() => {
    const schedulingDecision = reconcilePresentationScheduling('network heartbeat eligibility');
    if (schedulingDecision.mode === 'hosted-authority-network') hostedBackgroundNetworkHeartbeatCount += 1;
    if (gameStarted && !matchAdmissionPresentationPaused && network.role !== 'offline' && player.alive) {
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
window.setInterval(() => {
  if (network.role !== 'client' || !network.roomCode || !localResumeToken) return;
  try { saveActiveRoomIdentity(network.roomCode); } catch { /* Rejoin isolation is best effort under restrictive storage policies. */ }
}, 3_000);
window.addEventListener('pagehide', () => {
  persistRoomIdentityForCloseTabRejoin();
  matchDiagnosticUploader.flushForPageLifecycle();
});
window.addEventListener('beforeunload', () => {
  persistRoomIdentityForCloseTabRejoin();
  matchDiagnosticUploader.flushForPageLifecycle();
  network.close();
  menuPreviewVideoController.dispose();
  pass64TslSystems?.dispose();
  arenaVisualStream.dispose();
  retireAtomicPresentation();
  for (const [arenaId, cachedArena] of [...arenaCache]) disposeRetiredArena(arenaId, cachedArena);
  renderRuntime.dispose();
});

function effectiveFramePacing(now = performance.now()) {
  const callback = framePacing.summary();
  if (renderRuntime.backend !== 'webgpu') {
    return Object.freeze({
      ...callback,
      source: 'animation-frame' as const,
      callbackCadenceHz: callback.cadenceHz,
      completedCadenceHz: callback.cadenceHz,
    });
  }
  const progress = renderRuntime.presentationTelemetry(now).progress;
  const submittedCadenceHz = cadenceWithNoProgressAge(
    progress.submissionPacing.cadenceHz,
    progress.currentSubmissionGapMs,
  );
  const completedCadenceHz = cadenceWithNoProgressAge(
    progress.completionPacing.cadenceHz,
    progress.currentCompletionGapMs,
  );
  return Object.freeze({
    ...progress.submissionPacing,
    cadenceHz: submittedCadenceHz,
    source: 'webgpu-submission' as const,
    callbackCadenceHz: callback.cadenceHz,
    completedCadenceHz,
    progressWindow: Object.freeze({
      elapsedMs: progress.elapsedMs,
      submissionAdvances: progress.submissionAdvances,
      completionAdvances: progress.completionAdvances,
      currentSubmissionGapMs: progress.currentSubmissionGapMs,
      currentCompletionGapMs: progress.currentCompletionGapMs,
      maximumSubmissionGapMs: progress.maximumSubmissionGapMs,
      maximumCompletionGapMs: progress.maximumCompletionGapMs,
      maximumPendingForMs: progress.maximumPendingForMs,
    }),
  });
}

function applyDeferredAdaptiveWebGpuRenderBudget(now: number): boolean {
  if (renderRuntime.backend !== 'webgpu') return false;
  const pixelRatioCap = deferredWebGpuAdaptivePixelRatio.takeWhenPresentationIdle(
    renderRuntime.presentationTelemetry(now),
  );
  if (pixelRatioCap === null) return false;
  applyAdaptiveRenderBudget(pixelRatioCap);
  grassSystem?.setAdaptivePixelRatio(pixelRatioCap);
  resize();
  return true;
}

function monitorCompletedWebGpuQueueHealth(now: number): void {
  if (renderRuntime.backend !== 'webgpu') return;
  const presentation = renderRuntime.presentationTelemetry(now);
  if (presentation.status === 'stalled' || presentation.status === 'device-lost'
    || presentation.status === 'failed') {
    throw new Error(`Live WebGPU presentation was ${presentation.status}: ${presentation.lastFailure ?? 'no failure detail'}`);
  }
  if (presentation.completedSequence <= lastObservedWebGpuCompletionSequence) return;
  lastObservedWebGpuCompletionSequence = presentation.completedSequence;
}

function selectedArenaPresentationRoot(): THREE.Group {
  if (selectedArena.id === 'atomic-acres' && arenaArtRoot?.visible) return arenaArtRoot;
  return arena.root;
}

function monitorSelectedArenaRender(now: number): void {
  if (now - lastArenaRenderAuditAt < ARENA_RENDER_AUDIT_INTERVAL_MS) return;
  lastArenaRenderAuditAt = now;
  // Visual authority may be a quality-art root while collision/raycast
  // authority stays on the procedural root. Audit both halves of that
  // contract instead of exempting the map whose art can actually disappear.
  const eligible = arenaSelectionReady && !renderSubmissionPaused;
  const presentationBeforeAudit = renderRuntime.presentationTelemetry(now);
  const submissionExpected = !presentationBeforeAudit.backpressureActive;
  let presentationRoot = selectedArenaPresentationRoot();
  let audit = auditArenaRenderLiveness(
    scene,
    arena.root,
    selectedArena.id,
    renderRuntime.renderInfo(),
    eligible,
    camera,
    presentationRoot,
    submissionExpected,
  );
  if (eligible && audit.reasons.length > 0) {
    let restored = false;
    if (presentationRoot !== arena.root) {
      if (presentationRoot.parent !== scene) {
        scene.add(presentationRoot);
        restored = true;
      }
      if (!presentationRoot.visible) {
        presentationRoot.visible = true;
        restored = true;
      }
    } else {
      restored = arenaVisualStream.restoreGameplayRoot(selectedArena.id, arena.root);
    }
    if (restored) {
      arenaRenderWatchdog.recordRecovery(audit.reasons.join(','));
      requestStaticShadowRefresh();
    }
    // Profiles own source-vs-batch visibility. Reapply that contract once for
    // an empty root; never blindly unhide collision proxies or source meshes.
    if (audit.reasons.includes('selected-world-empty')) {
      if (selectedArena.id === 'skyline-terminal') applyAdditionalMapPresentationProfile(arena.root, renderProfile);
      if (selectedArena.id === 'rustworks-1v1') applyRustworksPresentationProfile(arena.root, renderProfile);
    }
    presentationRoot = selectedArenaPresentationRoot();
    audit = auditArenaRenderLiveness(
      scene,
      arena.root,
      selectedArena.id,
      renderRuntime.renderInfo(),
      eligible,
      camera,
      presentationRoot,
      submissionExpected,
    );
    if (selectedArena.id === 'atomic-acres' && presentationRoot !== arena.root && audit.reasons.length > 0) {
      // A broken quality root must degrade to the already-resident gameplay
      // presentation rather than leave HUD/audio running over a blank canvas.
      presentationRoot.visible = false;
      blenderArenaActive = false;
      qualityAssetStreaming.atomicAcres = 'fallback';
      arena.root.visible = true;
      presentationRoot = arena.root;
      arenaRenderWatchdog.recordRecovery(`quality-root-fallback:${audit.reasons.join(',')}`);
      audit = auditArenaRenderLiveness(
        scene,
        arena.root,
        selectedArena.id,
        renderRuntime.renderInfo(),
        eligible,
        camera,
        presentationRoot,
        submissionExpected,
      );
    }
  }
  const presentation = renderRuntime.presentationTelemetry(now);
  const liveStall = detectLivePresentationStall({
    activeMatch: gameStarted && matchState.phase === 'active',
    menuHidden: menuLifecycle.surface === 'hidden',
    documentVisible: document.visibilityState === 'visible',
    documentFocused: document.hasFocus() && !offlineMenuPreviewCapture,
    arenaSelectionReady,
    debugRenderPaused,
    renderSubmissionPaused,
    backpressureActive: presentation.backpressureActive,
    currentSubmissionGapMs: presentation.progress.currentSubmissionGapMs,
    pendingForMs: presentation.pendingForMs,
    stallThresholdMs: LIVE_WEBGPU_PRESENTATION_STALL_MS,
  });
  if (liveStall?.kind === 'pending-completion') {
    throw new Error(
      `Renderer presentation made no GPU progress for ${Math.round(liveStall.elapsedMs)}ms`
      + ` (${presentation.submissionSequence - presentation.completedSequence} submission pending)`,
    );
  }
  if (liveStall?.kind === 'missing-submission') {
    throw new Error(`Renderer admitted no foreground WebGPU submission for ${Math.round(liveStall.elapsedMs)}ms`);
  }
  const foregroundPresentationEligible = gameStarted && matchState.phase === 'active'
    && menuLifecycle.surface === 'hidden' && document.visibilityState === 'visible' && document.hasFocus()
    && arenaSelectionReady && !debugRenderPaused && !renderSubmissionPaused;
  if (eligible && (presentation.status === 'device-lost' || presentation.status === 'failed')) {
    throw new Error(`Renderer presentation ${presentation.status}: ${presentation.lastFailure ?? 'device failure'}`);
  }
  if (foregroundPresentationEligible && presentation.status === 'stalled') {
    throw new Error(`Renderer presentation ${presentation.status}: ${presentation.lastFailure ?? `${Math.round(presentation.pendingForMs)} ms pending`}`);
  }
  const watchdog = arenaRenderWatchdog.observe(audit, now);
  if (watchdog.fatal) {
    throw new Error(`Arena presentation lost (${audit.reasons.join(', ')})`);
  }
}

function frame(now: number, scheduleNext = true): void {
  const schedulingDecision = reconcilePresentationScheduling('animation frame eligibility');
  if (schedulingDecision.mode !== 'foreground-presentation') {
    // The prerecorded menu/loading media owns its own browser compositor path.
    // An ineligible game frame must not poll input, step physics/AI/effects,
    // touch HUD/audio presentation or submit either renderer backend.
    lastFrame = now;
    accumulator = 0;
    if (scheduleNext) requestAnimationFrame(frame);
    return;
  }
  if (matchAdmissionPresentationPaused) {
    // Hidden WebGL2 prime frames are GPU settle boundaries, not simulation
    // ticks. Keep the next live delta bounded without consuming countdown,
    // physics, bot, audio, HUD or network progression behind the transition.
    lastFrame = now;
    accumulator = 0;
    if (scheduleNext) requestAnimationFrame(frame);
    return;
  }
  if (scheduleNext && !presentationFrameDue(now, lastPresentedFrameAt, graphicsRuntime.frameRateLimit)) {
    requestAnimationFrame(frame);
    return;
  }
  if (scheduleNext) {
    lastPresentedFrameAt = advancePresentationFrameAnchor(now, lastPresentedFrameAt, graphicsRuntime.frameRateLimit);
  }
  const frameWorkStartedAt = performance.now();
  frameCount += 1;
  try {
    const rawFrameMs = Math.max(0, now - lastFrame);
    const activeForegroundWebGpuFrame = scheduleNext && renderRuntime.backend === 'webgpu'
      && gameStarted && matchState.phase === 'active' && menuLifecycle.surface === 'hidden'
      && document.visibilityState === 'visible' && document.hasFocus();
    if (activeForegroundWebGpuFrame
      && shouldResetPresentationAfterSchedulerGap(rawFrameMs, LIVE_WEBGPU_PRESENTATION_STALL_MS)) {
      resetWebGpuPresentationEpoch('foreground scheduler gap', now);
    }
    monitorCompletedWebGpuQueueHealth(now);
    // The HUD must report even pathologically slow software-rendered frames.
    // Adaptive quality still receives the unclamped sample and independently
    // rejects values above its 250 ms control window.
    if (scheduleNext) framePacing.record(Math.min(rawFrameMs, 1_000));
    if (scheduleNext && gameStarted && matchState.phase === 'active') matchDiagnostics?.recordFrame(rawFrameMs);
    const adaptivePixelRatio = scheduleNext && renderRuntime.backend !== 'webgpu' ? adaptiveQuality.record(
      rawFrameMs,
      !matchWebGpuQualityFrozen && gameStarted && menu.classList.contains('hidden')
        && document.visibilityState === 'visible' && !debugRenderPaused,
    ) : null;
    if (adaptivePixelRatio !== null) {
      applyAdaptiveRenderBudget(adaptivePixelRatio);
      grassSystem?.setAdaptivePixelRatio(adaptivePixelRatio);
      resize();
    }
    if (renderRuntime.backend === 'webgpu' && !matchWebGpuQualityFrozen) {
      applyDeferredAdaptiveWebGpuRenderBudget(now);
    }
    if (now - lastFpsHudAt >= 250) {
      // Sorting three 180-sample pacing windows is HUD work, not frame work.
      // Keep it on the four-Hz display cadence so uncapped WebGPU does not
      // manufacture sustained allocation/GC pressure merely to repaint text.
      const pacing = effectiveFramePacing(now);
      const fps = pacing.sampleCount >= 1 ? Math.max(1, Math.round(pacing.cadenceHz)) : null;
      fpsCounterValue.textContent = fps === null ? '--' : String(fps);
      fpsCounter.dataset.pacing = fps === null ? 'warming' : fps >= 55 ? 'smooth' : fps >= 40 ? 'strained' : 'slow';
      const refreshWarning = element<HTMLElement>('#refresh-warning');
      refreshWarning.hidden = !(pacing.displayLimited && now < refreshWarningUntil);
      if (pacing.displayLimited) {
        refreshWarning.querySelector('strong')!.textContent = `${Math.round(pacing.cadenceHz)} HZ PRESENTATION LIMIT`;
      }
      lastFpsHudAt = now;
    }
    const frameDt = Math.min(0.05, rawFrameMs / 1000);
    lastFrame = now;
    pollGamepad(frameDt);
    accumulator += frameDt;
    const step = 1 / SIMULATION_HZ;
    let iterations = 0;
    while (accumulator >= step && iterations < 6) {
      updatePhysics(step);
      stepInteractiveWorldAuthority();
      accumulator -= step;
      iterations += 1;
    }
    updatePersistentWindowDebrisPhysics();
    if (triggerHeld && WEAPONS[player.weapon].automatic && !localKillstreakActorSnapshot()?.possession) tryFire(now);
    finishReload(now);
    const visualNow = debugCaptureFixedVisualTimeMs ?? now;
    updateTargets(visualNow);
    updateBots(frameDt, now);
    updateGrenades(frameDt, now);
    updateExplosiveBolts(frameDt, now);
    updateGrenadeExplosionVisuals(now);
    updateFieldSupport(frameDt, now);
    updatePass65KillstreakRuntime(now);
    updateOverdrive(now);
    updateRailgun(now);
    updateDmrThermal();
    updateDeathDrops(now);
    updateFInteractionPrompt(now);
    if (debugCaptureCameraActive) {
      camera.position.copy(debugCaptureCameraPosition);
      camera.rotation.set(debugCaptureCameraPitch, debugCaptureCameraYaw, 0, 'YXZ');
      if (debugCaptureCameraFov !== null) {
        camera.fov = debugCaptureCameraFov;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld(true);
    }
    updateCrosshairSupportPreview();
    updateCorpsePresentations(now);
    impactPresentation.update(frameDt);
    tracerPool.update(frameDt);
    updateRemotes(frameDt, now);
    updateSensoryFeedback(now);
    if (selectedArena.id === 'atomic-acres') {
      if (arenaArtRoot && !blenderArenaActive) updateArenaArt(arenaArtRoot, visualNow);
      if (neighbourhoodLifeRoot) updateArenaArt(neighbourhoodLifeRoot, visualNow);
      atmosphereSystem?.update(visualNow / 1_000);
      grassSystem?.update(visualNow / 1_000, camera.position, player.position, gameStarted);
    } else if (selectedArena.id === 'rustworks-1v1') {
      atmosphereSystem?.update(visualNow / 1_000);
    } else if (selectedArena.id === 'gun-range') {
      updateGunRangePresentation(arena.root, visualNow);
    }
    waterSystem.update(visualNow / 1_000);
    if (gameStarted) updateMinimap(now);
    updateHud(now);
    arenaContrastLighting.update(visualNow);
    pass64TslSystems?.update(visualNow);
    if (activeArenaReviewHud) hudRoot.hidden = activeArenaReviewHud === 'hidden';
    const rendererFrameEligible = (gameStarted && menuLifecycle.surface === 'hidden') || debugCaptureCameraActive;
    if (rendererFrameEligible && !debugRenderPaused && !renderSubmissionPaused && !webglContextLost
      && document.visibilityState === 'visible' && document.hasFocus()) {
      let frameSubmitted = false;
      if (renderRuntime.backend === 'webgpu') {
        const submissionMode: WebGpuSubmissionMode = gameStarted && matchState.phase === 'active'
          && menuLifecycle.surface === 'hidden' && arenaSelectionReady && !renderSubmissionPaused
          ? 'warmed-live'
          : 'serialized';
        frameSubmitted = submitWebGpuFrame(now, false, submissionMode);
      } else {
        atomicSignal?.render(scene, camera, VIEWMODEL_RENDER_LAYER);
        frameSubmitted = true;
      }
      if (frameSubmitted && gameStarted && menuLifecycle.surface === 'hidden') {
        lastGameplayPresentedFrame = frameCount;
      }
      monitorSelectedArenaRender(now);
      if (activeRenderConfig.shadowMode === 'static') requestStaticShadowRefresh(false);
    }
    if (scheduleNext) {
      recentFrameWorkMs.push(Math.max(0, performance.now() - frameWorkStartedAt));
      if (recentFrameWorkMs.length > FRAME_WORK_SAMPLE_LIMIT) {
        recentFrameWorkMs.splice(0, recentFrameWorkMs.length - FRAME_WORK_SAMPLE_LIMIT);
      }
      requestAnimationFrame(frame);
    }
  } catch (error) {
    showFatalError(error);
  }
}

// Multiplayer transport and snapshot timers remain independent below. Hidden
// or unfocused pages never re-enter the complete visual/simulation frame.

function activePostTelemetry(): Record<string, unknown> {
  if (atomicSignal) return atomicSignal.telemetry();
  const target = pass64TslSystems?.principalHdrTarget;
  return {
    enabled: true,
    profile: renderProfile,
    owner: 'pass64-webgpu-tsl',
    fallbackReason: null,
    bypassReason: null,
    samples: frameCount,
    canvasAntialias: graphicsRuntime.antialiasSamples > 0,
    canvasSamples: Math.max(1, graphicsRuntime.antialiasSamples),
    principalHdrSamples: target?.samples ?? 0,
    bloomSamples: pass64TslSystems?.bloomSamples ?? 0,
    targetValidated: target?.samples === Math.max(1, graphicsRuntime.antialiasSamples),
    outputValidated: pass64TslSystems?.depthAwareBloom === true,
    depthAwareBloom: pass64TslSystems?.depthAwareBloom === true,
    bloomGraphId: pass64TslSystems?.bloomGraphId ?? null,
    bloomOcclusionSource: pass64TslSystems?.bloomOcclusionSource ?? null,
    advancedGraphics: pass64TslSystems?.root.userData.pass65AdvancedGraphics ?? null,
  };
}

function activeRuntimeTelemetry(): ReturnType<LegacyWebGlRenderRuntime['telemetry']> {
  if (renderRuntime.backend === 'webgpu') {
    return renderRuntime.telemetry(runtimeRequest.requestedBackend);
  }
  return renderRuntime.telemetry(atomicSignal?.targetSampleTelemetry());
}

type ArenaPerformanceBudgetSample = Readonly<{
  definitionId: ArenaId;
  cpuFrameP50Ms: number;
  cpuFrameP95Ms: number;
  cpuFrameP99Ms: number;
  cpuFrameMaxMs: number;
  presentationFrameP50Ms: number;
  presentationFrameP95Ms: number;
  presentationFrameP99Ms: number;
  presentationFrameMaxMs: number;
  queueSubmissionP50Ms: number;
  queueSubmissionP95Ms: number;
  queueSubmissionP99Ms: number;
  queueSubmissionMaxMs: number;
  frameSampleCount: number;
  presentationFrameSampleCount: number;
  queueSubmissionSampleCount: number;
  frameHitchThresholdMs: number;
  frameHitchCount: number;
  steadyStateFps: number;
  activeTextureBytesEstimate: number;
  cachedTextureBytesEstimate: number;
  textureBytesEstimate: number;
  activeGeometryBytesEstimate: number;
  cachedGeometryBytesEstimate: number;
  geometryBytesEstimate: number;
  transientBytesEstimate: number;
  gpuTimingMethod: 'minimum-of-presentation-and-queue-upper-bounds';
  textureEstimateMethod: 'unique-visible-plus-hidden-and-detached-resident-textures-rgba8-mip-chain';
  geometryEstimateMethod: 'unique-visible-plus-hidden-and-detached-resident-buffer-arrays';
  transientEstimateMethod: 'principal-msaa-hdr-depth-post-upper-bound';
}>;
let latestArenaPerformanceBudgetSample: ArenaPerformanceBudgetSample | null = null;

function percentile(values: readonly number[], quantile: number): number {
  if (values.length === 0) return Number.POSITIVE_INFINITY;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * THREE.MathUtils.clamp(quantile, 0, 1))];
}

function estimateRendererResidency() {
  return estimateResidentObjectMemory(scene, [
    ...[...arenaCache.values()].map((entry) => entry.root),
    arenaArtRoot,
    worldIdentityPresentation?.root,
    neighbourhoodLifeRoot,
  ]);
}

function estimateTransientRenderBytes(): number {
  const size = renderRuntime.drawingBufferSize();
  const pixels = Math.max(1, size.x) * Math.max(1, size.y);
  const samples = Math.max(1, pass64TslSystems?.principalHdrTarget.samples ?? 1);
  // RGBA16F HDR + 32-bit depth at MSAA sample count, resolved HDR output and
  // a conservative full-resolution equivalent for the bloom mip chain.
  return Math.ceil(pixels * ((8 + 4) * samples + 8 + 8));
}

async function sampleArenaPerformanceBudget(): Promise<ArenaPerformanceBudgetSample> {
  const definition = activeArenaVisualDefinition;
  if (!definition) throw new Error('Cannot sample arena budget without an active ArenaVisualDefinition');
  for (let index = 0; index < 60; index += 1) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  recentFrameWorkMs.length = 0;
  const presentationFrameMs: number[] = [];
  let previous = performance.now();
  for (let index = 0; index < 90; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const now = performance.now();
    presentationFrameMs.push(now - previous);
    previous = now;
  }
  for (let attempt = 0; recentFrameWorkMs.length < 90 && attempt < 30; attempt += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  const frameMs = recentFrameWorkMs.slice(-90);
  if (frameMs.length !== 90) throw new Error(`CPU frame-work sampler collected ${frameMs.length}/90 samples`);
  const queueMs: number[] = [];
  const previousRenderPaused = debugRenderPaused;
  debugRenderPaused = true;
  try {
    await flushWebGpuFrames();
    for (let index = 0; index < 7; index += 1) {
      const started = performance.now();
      renderRuntime.resetRenderInfo();
      submitWebGpuFrame(performance.now(), true);
      await flushWebGpuFrames();
      queueMs.push(performance.now() - started);
    }
  } finally {
    debugRenderPaused = previousRenderPaused;
  }
  const cpuFrameP50Ms = percentile(frameMs, 0.5);
  const cpuFrameP95Ms = percentile(frameMs, 0.95);
  const cpuFrameP99Ms = percentile(frameMs, 0.99);
  const presentationFrameP50Ms = percentile(presentationFrameMs, 0.5);
  const presentationFrameP95Ms = percentile(presentationFrameMs, 0.95);
  const presentationFrameP99Ms = percentile(presentationFrameMs, 0.99);
  const queueSubmissionP50Ms = percentile(queueMs, 0.5);
  const queueSubmissionP95Ms = percentile(queueMs, 0.95);
  const queueSubmissionP99Ms = percentile(queueMs, 0.99);
  const frameHitchThresholdMs = 50;
  const residency = estimateRendererResidency();
  latestArenaPerformanceBudgetSample = Object.freeze({
    definitionId: definition.id,
    cpuFrameP50Ms,
    cpuFrameP95Ms,
    cpuFrameP99Ms,
    cpuFrameMaxMs: Math.max(...frameMs),
    presentationFrameP50Ms,
    presentationFrameP95Ms,
    presentationFrameP99Ms,
    presentationFrameMaxMs: Math.max(...presentationFrameMs),
    queueSubmissionP50Ms,
    queueSubmissionP95Ms,
    queueSubmissionP99Ms,
    queueSubmissionMaxMs: Math.max(...queueMs),
    frameSampleCount: frameMs.length,
    presentationFrameSampleCount: presentationFrameMs.length,
    queueSubmissionSampleCount: queueMs.length,
    frameHitchThresholdMs,
    frameHitchCount: frameMs.filter((durationMs) => durationMs > frameHitchThresholdMs).length,
    steadyStateFps: presentationFrameMs.length * 1_000
      / Math.max(0.001, presentationFrameMs.reduce((sum, durationMs) => sum + durationMs, 0)),
    activeTextureBytesEstimate: residency.activeTextureBytes,
    cachedTextureBytesEstimate: residency.cachedTextureBytes,
    textureBytesEstimate: residency.totalTextureBytes,
    activeGeometryBytesEstimate: residency.activeGeometryBytes,
    cachedGeometryBytesEstimate: residency.cachedGeometryBytes,
    geometryBytesEstimate: residency.totalGeometryBytes,
    transientBytesEstimate: estimateTransientRenderBytes(),
    gpuTimingMethod: 'minimum-of-presentation-and-queue-upper-bounds',
    textureEstimateMethod: 'unique-visible-plus-hidden-and-detached-resident-textures-rgba8-mip-chain',
    geometryEstimateMethod: 'unique-visible-plus-hidden-and-detached-resident-buffer-arrays',
    transientEstimateMethod: 'principal-msaa-hdr-depth-post-upper-bound',
  });
  return latestArenaPerformanceBudgetSample;
}

function arenaVisualBudgetAudit(): Record<string, unknown> {
  const definition = activeArenaVisualDefinition;
  if (!definition) return { definitionId: null, pass: false, violations: ['no active ArenaVisualDefinition'] };
  let shadowLights = 0;
  let shadowMapPixels = 0;
  let viewmodelShadowLights = 0;
  let viewmodelShadowMapPixels = 0;
  let residentViewmodelShadowLights = 0;
  let residentViewmodelShadowMapPixels = 0;
  const shadowLightInventory: Array<Record<string, unknown>> = [];
  let drawCalls = 0;
  let triangles = 0;
  const renderableBreakdown = new Map<string, { drawCalls: number; triangles: number }>();
  scene.traverseVisible((node) => {
    if (camera.layers.test(node.layers) && (node instanceof THREE.Mesh || node instanceof THREE.Points || node instanceof THREE.Line || node instanceof THREE.Sprite)) {
      const material = node.material as THREE.Material | THREE.Material[];
      const nodeDrawCalls = Array.isArray(material) ? material.length : 1;
      let nodeTriangles = 0;
      drawCalls += nodeDrawCalls;
      if (node instanceof THREE.Mesh) {
        const geometry = node.geometry;
        const baseTriangles = geometry.index ? geometry.index.count / 3 : (geometry.getAttribute('position')?.count ?? 0) / 3;
        const instances = node instanceof THREE.InstancedMesh ? node.count : 1;
        nodeTriangles = baseTriangles * instances;
        triangles += nodeTriangles;
      }
      let owner: THREE.Object3D = node;
      while (owner.parent && owner.parent !== scene) owner = owner.parent;
      const ownerName = owner.name || owner.type;
      const aggregate = renderableBreakdown.get(ownerName) ?? { drawCalls: 0, triangles: 0 };
      aggregate.drawCalls += nodeDrawCalls;
      aggregate.triangles += nodeTriangles;
      renderableBreakdown.set(ownerName, aggregate);
    }
    if (!(node instanceof THREE.PointLight || node instanceof THREE.SpotLight || node instanceof THREE.DirectionalLight)) return;
    if (!node.castShadow) return;
    const mapPixels = node.shadow.mapSize.x * node.shadow.mapSize.y;
    const viewmodel = isViewmodelShadowLight(node);
    const active = !viewmodel || node.userData.shadowBudgetActive === true;
    shadowLightInventory.push({
      name: node.name || node.type,
      scope: viewmodel ? 'viewmodel' : 'arena',
      active,
      intensity: node.intensity,
      mapPixels,
    });
    if (viewmodel) {
      residentViewmodelShadowLights += 1;
      residentViewmodelShadowMapPixels += mapPixels;
      if (!active) return;
      viewmodelShadowLights += 1;
      viewmodelShadowMapPixels += mapPixels;
      return;
    }
    shadowLights += 1;
    shadowMapPixels += mapPixels;
  });
  const measured = {
    drawCalls,
    triangles: Math.ceil(triangles),
    rendererReportedCalls: renderRuntime.renderInfo().calls,
    drawCallMethod: 'visible-camera-layer-renderable-upper-bound',
    drawCallsByRoot: [...renderableBreakdown.entries()]
      .map(([root, value]) => ({ root, drawCalls: value.drawCalls, triangles: Math.ceil(value.triangles) }))
      .sort((left, right) => right.drawCalls - left.drawCalls || left.root.localeCompare(right.root)),
    shadowLights,
    shadowMapPixels,
    viewmodelShadowLights,
    viewmodelShadowMapPixels,
    residentViewmodelShadowLights,
    residentViewmodelShadowMapPixels,
    totalActiveShadowLights: shadowLights + viewmodelShadowLights,
    totalActiveShadowMapPixels: shadowMapPixels + viewmodelShadowMapPixels,
    shadowLightInventory,
    postTextureSamples: renderRuntime.backend === 'webgpu' ? 18 : 0,
    textureBytes: latestArenaPerformanceBudgetSample?.definitionId === definition.id
      ? latestArenaPerformanceBudgetSample.activeTextureBytesEstimate
      : null,
    residentTextureBytes: latestArenaPerformanceBudgetSample?.definitionId === definition.id
      ? latestArenaPerformanceBudgetSample.textureBytesEstimate
      : null,
    residentGeometryBytes: latestArenaPerformanceBudgetSample?.definitionId === definition.id
      ? latestArenaPerformanceBudgetSample.geometryBytesEstimate
      : null,
    transientBytes: latestArenaPerformanceBudgetSample?.definitionId === definition.id
      ? latestArenaPerformanceBudgetSample.transientBytesEstimate
      : null,
    cpuFrameP95Ms: latestArenaPerformanceBudgetSample?.definitionId === definition.id
      ? latestArenaPerformanceBudgetSample.cpuFrameP95Ms
      : null,
    gpuFrameP95Ms: latestArenaPerformanceBudgetSample?.definitionId === definition.id
      // Both serial queue retirement and presentation cadence are GPU upper
      // bounds with different scheduler noise. Their tighter value avoids
      // calling browser rAF jitter or driver synchronization overhead GPU time.
      ? Math.min(
          latestArenaPerformanceBudgetSample.presentationFrameP95Ms,
          latestArenaPerformanceBudgetSample.queueSubmissionP95Ms,
        )
      : null,
  };
  const limits = definition.budgets;
  const violations: string[] = [];
  if (measured.drawCalls > limits.maximumDrawCalls) violations.push(`drawCalls ${measured.drawCalls}/${limits.maximumDrawCalls}`);
  if (measured.triangles > limits.maximumTriangles) violations.push(`triangles ${measured.triangles}/${limits.maximumTriangles}`);
  if (measured.shadowLights > limits.maximumShadowLights) violations.push(`shadowLights ${measured.shadowLights}/${limits.maximumShadowLights}`);
  if (measured.shadowMapPixels > limits.maximumShadowMapPixels) violations.push(`shadowMapPixels ${measured.shadowMapPixels}/${limits.maximumShadowMapPixels}`);
  if (measured.viewmodelShadowLights > VIEWMODEL_SHADOW_BUDGET.maximumLights) {
    violations.push(`viewmodelShadowLights ${measured.viewmodelShadowLights}/${VIEWMODEL_SHADOW_BUDGET.maximumLights}`);
  }
  if (measured.viewmodelShadowMapPixels > VIEWMODEL_SHADOW_BUDGET.maximumMapPixels) {
    violations.push(`viewmodelShadowMapPixels ${measured.viewmodelShadowMapPixels}/${VIEWMODEL_SHADOW_BUDGET.maximumMapPixels}`);
  }
  if (measured.residentViewmodelShadowLights > VIEWMODEL_SHADOW_BUDGET.maximumLights) {
    violations.push(`residentViewmodelShadowLights ${measured.residentViewmodelShadowLights}/${VIEWMODEL_SHADOW_BUDGET.maximumLights}`);
  }
  if (measured.residentViewmodelShadowMapPixels > VIEWMODEL_SHADOW_BUDGET.maximumMapPixels) {
    violations.push(`residentViewmodelShadowMapPixels ${measured.residentViewmodelShadowMapPixels}/${VIEWMODEL_SHADOW_BUDGET.maximumMapPixels}`);
  }
  if (measured.postTextureSamples > limits.maximumPostTextureSamples) violations.push(`postTextureSamples ${measured.postTextureSamples}/${limits.maximumPostTextureSamples}`);
  if (measured.textureBytes === null) violations.push('textureBytes budget has not been sampled');
  else if (measured.textureBytes > limits.maximumTextureBytes) violations.push(`textureBytes ${measured.textureBytes}/${limits.maximumTextureBytes}`);
  if (measured.residentTextureBytes === null) violations.push('residentTextureBytes budget has not been sampled');
  else if (measured.residentTextureBytes > limits.maximumResidentTextureBytes) {
    violations.push(`residentTextureBytes ${measured.residentTextureBytes}/${limits.maximumResidentTextureBytes}`);
  }
  if (measured.transientBytes === null) violations.push('transientBytes budget has not been sampled');
  else if (measured.transientBytes > limits.maximumTransientBytes) violations.push(`transientBytes ${measured.transientBytes}/${limits.maximumTransientBytes}`);
  if (measured.cpuFrameP95Ms === null) violations.push('cpuFrameP95Ms budget has not been sampled');
  else if (measured.cpuFrameP95Ms > limits.cpuFrameP95Ms) violations.push(`cpuFrameP95Ms ${measured.cpuFrameP95Ms}/${limits.cpuFrameP95Ms}`);
  if (measured.gpuFrameP95Ms === null) violations.push('gpuFrameP95Ms budget has not been sampled');
  else if (measured.gpuFrameP95Ms > limits.gpuFrameP95Ms) violations.push(`gpuFrameP95Ms ${measured.gpuFrameP95Ms}/${limits.gpuFrameP95Ms}`);
  return {
    definitionId: definition.id,
    limits: { ...limits, viewmodelShadows: VIEWMODEL_SHADOW_BUDGET },
    measured,
    performanceSample: latestArenaPerformanceBudgetSample?.definitionId === definition.id ? latestArenaPerformanceBudgetSample : null,
    pass: violations.length === 0,
    violations,
  };
}

function playableSceneProof(): Record<string, unknown> {
  const authoritativeRoots = scene.children.filter((node) => node.userData.arenaVisualDefinitionId !== undefined);
  const traversal = pass64TslSystems
    ? auditRuntimeTslTraversal(scene, pass64TslSystems.compiledPipelineIds)
    : null;
  const water = pass64TslSystems?.root.getObjectByName('Pass 64 TSL perimeter water') as THREE.Mesh | undefined;
  water?.geometry.computeBoundingBox();
  return {
    route: 'complete-playable-game',
    sceneId: scene.uuid,
    arena: arenaVisualReceipt,
    authoritativeArenaRoots: authoritativeRoots.length,
    authoritativeArenaRootIsGameplayRoot: authoritativeRoots[0] === arena.root,
    duplicateArenaRoots: authoritativeRoots.length !== 1,
    renderWatchdog: arenaRenderWatchdog.telemetry(),
    playerCamera: camera.parent === scene,
    cameraComposition: {
      position: camera.position.toArray(),
      insideHorizontalCollider: isBlocked(camera.position, activeWorldColliders(), 0.16),
      aboveArenaFloor: camera.position.y > -1,
    },
    botObjects: bots.size + dormantBots.size,
    weaponObject: weaponView.root.parent !== null,
    railgunObject: railgunPresentation.root.parent === scene,
    multiplayerSystem: true,
    remoteObjects: remotes.size,
    traversal,
    appliedTslArenaDefinitions,
    appliedArenaVisualPolicy,
    deterministicReview: {
      cameraId: activeArenaReviewCameraId,
      fixedTimeMs: activeArenaReviewFixedTimeMs,
      seed: activeArenaReviewSeed,
      exposure: activeArenaReviewExposure,
      hud: activeArenaReviewHud,
      tslTimeMs: pass64TslSystems?.root.userData.tslReviewTimeMs ?? null,
      tslSeed: pass64TslSystems?.root.userData.tslReviewSeed ?? null,
    },
    actualArenaVisualPolicy: {
      definitionId: activeArenaVisualDefinition?.id ?? null,
      sun: { color: sunLight.color.getHex(), intensity: sunLight.intensity },
      ambient: { color: ambientLight.color.getHex(), intensity: ambientLight.intensity },
      fog: scene.fog instanceof THREE.Fog ? { color: scene.fog.color.getHex(), near: scene.fog.near, far: scene.fog.far } : null,
      shadows: {
        enabled: renderRuntime.shadowsEnabled(),
        sunCastShadow: sunLight.castShadow,
        mapSize: sunLight.shadow.mapSize.x,
        maximumDistance: sunLight.shadow.camera.far,
        normalBias: sunLight.shadow.normalBias,
      },
      atmosphereDefinitionId: pass64TslSystems?.root.userData.tslArenaVisualDefinitionId ?? null,
      atmosphere: pass64TslSystems?.root.userData.tslAtmosphere ?? null,
      practicals: arenaContrastLighting.telemetry(),
    },
    budgetAudit: arenaVisualBudgetAudit(),
    tslSystemVisibility: {
      waterVisible: water?.visible ?? false,
      waterGeometryMinY: water?.geometry.boundingBox?.min.y ?? null,
      waterGeometryMaxY: water?.geometry.boundingBox?.max.y ?? null,
      grassVisible: pass64TslSystems?.root.getObjectByName('Pass 64 TSL grass')?.visible ?? false,
    },
  };
}

function sampleEnduranceHealth() {
  let choppers = 0;
  let swarmDrones = 0;
  for (const entity of killstreakSnapshot.entities) {
    if (entity.kind === 'chopper') choppers += 1;
    else if (entity.kind === 'drone' && entity.mode === 'swarm') swarmDrones += 1;
  }
  const grenadeWorldPool = grenadeWorldPresentationPool.telemetry();
  const smokePresentation = smokeVolumePresentationPool.telemetry();
  return {
    frameCount,
    gameStarted,
    playerPosition: [player.position.x, player.position.y, player.position.z] as [number, number, number],
    arenaId: selectedArena.id,
    transition: {
      phase: arenaTransitionPhase,
      failure: arenaTransitionFailure,
      renderSubmissionPaused,
    },
    runtime: renderRuntime.healthTelemetry(),
    watchdog: arenaRenderWatchdog.telemetry(),
    gpuRetirement: { failures: gpuRetirementFailures },
    killstreak: {
      revision: killstreakSnapshot.revision,
      entities: killstreakSnapshot.entities.length,
      choppers,
      swarmDrones,
    },
    grenadeWorldPool: {
      exhaustions: grenadeWorldPool.exhaustions,
      prewarmBlockedAcquisitions: grenadeWorldPool.prewarmBlockedAcquisitions,
    },
    smokePresentation: {
      active: smokePresentation.active,
      liveDisposals: smokePresentation.liveDisposals,
    },
    weaponCatalog: weaponView.browserCatalogHealth(),
  };
}

function sampleAdmissionState() {
  return {
    bootstrapStage,
    gameStarted,
    matchPhase: matchState.phase,
    arenaId: selectedArena.id,
    arenaTransitionPhase,
    presentedGameplayFrame: lastGameplayPresentedFrame,
    matchAdmissionGeneration,
  };
}

const debugWindow = window as Window & {
  __ATOMIC_ACRES_DEBUG__?: {
    snapshot: () => Record<string, unknown>;
    admissionState: () => ReturnType<typeof sampleAdmissionState>;
    samplePresentationTelemetry: () => ReturnType<typeof renderRuntime.presentationTelemetry>;
    sampleEnduranceHealth: () => ReturnType<typeof sampleEnduranceHealth>;
    sampleWeaponCatalogReadiness: () => ReturnType<typeof weaponView.browserCatalogReadiness>;
    sampleWeaponAssetCache: () => ReturnType<typeof pass65WeaponCacheTelemetry>;
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
    setBotPresentation: (stance: PlayerSnapshot['stance'] | null, speed?: number, weapon?: WeaponId) => void;
    clearBots: () => void;
    placeBotAhead: (distance?: number) => void;
    placeBotRelative: (right: number, forward: number) => void;
    showBotDamageDirection: () => number | null;
    respawn: () => void;
    aimAtBot: (zone?: HitZone) => void;
    aimAtRemote: (zone?: HitZone) => void;
    aimAtRemoteWithOffset: (yawOffset: number, pitchOffset?: number) => void;
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
    setCaptureCameraPose: (
      x: number | null,
      y?: number,
      z?: number,
      yaw?: number,
      pitch?: number,
      fov?: number,
      fixedVisualTimeMs?: number,
      seed?: number,
    ) => void;
    setArenaReviewCamera: (cameraId: string) => boolean;
    setPass64SystemVisibility: (name: 'sky' | 'mist' | 'smoke' | 'dust' | 'grass' | 'water', visible: boolean) => boolean;
    setCaptureViewmodelHidden: (hidden: boolean) => void;
    stageLoadingCaptureSquad: () => { staged: boolean; characters: number; positions: number[][] };
    collisionProbe: (x: number, z: number) => boolean;
    collisionProbeAt: (x: number, y: number, z: number) => boolean;
    segmentBlocked: (x1: number, z1: number, x2: number, z2: number) => boolean;
    selectTriPassWorldTargets: (points: [number, number][]) => boolean;
    captureShadowProbeFrame: (horizontalOffset: number) => string;
    readbackWebGpuFrame: () => Promise<{ bytes: number; hash: string; x: number; y: number; width: number; height: number }>;
    sampleRendererResidency: () => ReturnType<typeof estimateRendererResidency>;
    sampleArenaPerformanceBudget: () => Promise<ArenaPerformanceBudgetSample>;
    resetPresentationProgressWindow: () => void;
    setRenderPaused: (paused: boolean) => void;
    recoverFromVisibilityRegain: () => void;
    openMenu: () => void;
    fireOnce: () => void;
    setTriggerHeld: (held: boolean) => void;
    stageSmokeVolume: (distance?: number) => string;
    authorFlashResult: (targetId: string, intensity?: number, durationMs?: number) => boolean;
    replayLastFlashResult: (targetId: string) => boolean;
    sendForgedFlashResult: () => boolean;
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
    sendRawChat: (text: string, claimedBy?: string) => boolean;
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
    damageRemoteAuthoritatively: (amount: number, playerId?: string) => { targetId: string; storedBefore: number; canonicalBefore: number; storedAfter: number } | null;
    earnSupport: (eliminations: number) => void;
    activateKillstreak: (id: Pass65KillstreakId, anchor?: [number, number, number]) => boolean;
    togglePilotedDroneControl: (entityId?: string) => boolean;
    forceBotGrenade: (fuseMs?: number, grenade?: GrenadeId) => boolean;
    activateSupport: (id: FieldSupportId) => void;
    setOverdrive: (mode: 'charging' | 'available' | 'active' | 'expired') => void;
    stageRailgunSpawn: (siteIndex?: number) => RailgunAuthorityState;
    stageRailgunMultiHitTargets: (shooterId?: string) => {
      staged: boolean;
      shooterId: string | null;
      hostileIds: string[];
      friendlyId: string | null;
      distances: number[];
      health: number[];
      positions: number[][];
    };
    replayLastRailgunResult: () => boolean;
    grantRailgunToRemote: (playerId: string) => boolean;
    interactRailgun: () => boolean;
    degradeStateChannel: () => boolean;
    endMatch: () => void;
    rematch: () => void;
    returnToMainMenu: () => void;
    selectArena: (id: ArenaId) => Promise<void>;
    hitRangeTarget: (id: string, damage?: number, zone?: HitZone) => void;
    spawnDeathDrop: (ageMs?: number) => string | null;
    setKills: (kills: number) => void;
    interactShed: () => boolean;
    damageShed: (placementId?: string, surfaceId?: string, damageQ?: number) => boolean;
    bulletHitShed: (placementId?: string, surfaceId?: string, damageQ?: number, penetrationEnergyQ?: number) => boolean;
    detonateGrenadeAtShed: (placementId?: string, surfaceId?: string) => {
      accepted: boolean;
      placementId: string | null;
      surfaceId: string;
      point: number[] | null;
      revisionBefore: number | null;
      revisionAfter: number | null;
      detachedChunksBefore: number | null;
      detachedChunksAfter: number | null;
      grenadeExplosionsBefore: number;
      grenadeExplosionsAfter: number;
    };

  };
};
debugWindow.__ATOMIC_ACRES_DEBUG__ = {
  admissionState: sampleAdmissionState,
  samplePresentationTelemetry: () => renderRuntime.presentationTelemetry(),
  sampleEnduranceHealth,
  sampleWeaponCatalogReadiness: () => weaponView.browserCatalogReadiness(),
  sampleWeaponAssetCache: () => pass65WeaponCacheTelemetry(),
  snapshot: () => ({
    bootstrap: {
      stage: bootstrapStage,
      error: bootstrapError,
      matchAdmissionCadence: lastMatchAdmissionCadence,
      webGlReadyPrime: lastWebGlReadyPrime,
      menuDeploymentAssetsProfile: lastMenuDeploymentAssetsProfile,
      menuDeploymentAssets: menuDeploymentAssetsCoordinator.snapshot(),
      effectPrewarmProfile: lastArenaEffectPrewarmProfile,
    },
    gameStarted,
    frameCount,
    presentationScheduling: {
      ...presentationSchedulingLifecycle.snapshot(),
      lastDecision: lastPresentationSchedulingDecision,
      hostedBackgroundNetworkHeartbeatCount,
    },
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
    textChat: {
      open: textChatOpen,
      focused: document.activeElement === textChatInput,
      entries: textChatHistory.map((entry) => ({ ...entry })),
      heldKeys: [...keys].sort(),
      triggerHeld,
      adsHeld,
    },
    railgun: {
      ...railgunState,
      spawnSite: railgunState.spawnSite ? { ...railgunState.spawnSite, position: [...railgunState.spawnSite.position] } : null,
      pickupPosition: railgunState.pickupPosition ? [...railgunState.pickupPosition] : null,
      processedShotIds: [...railgunState.processedShotIds],
      localHolder: localHoldsRailgun(),
      adsResetRequired: railgunAdsResetRequired,
      rechamberPresentationActive: railgunRechamberPresentationActive,
      adsProgress: weaponView.adsProgress(),
      thermalVisible: !element<HTMLElement>('#railgun-thermal').hidden,
      presentation: railgunPresentation.telemetry(),
      claimAudit: { ...railgunClaimAudit },
      localFeedbackPresentations: railgunLocalFeedbackPresentations,
      lastLocalFeedbackSummary: lastRailgunLocalFeedbackSummary,
      deathPresentationCount: railgunDeathPresentationCount,
      deathPresentations: railgunDeathPresentations.map((entry) => ({ ...entry })),
      lastAuthoritativeResult: localMultiplayerQa && lastAuthoritativeRailgunResult ? {
        ...lastAuthoritativeRailgunResult,
        outcomes: lastAuthoritativeRailgunResult.outcomes.map((outcome) => ({ ...outcome })),
        beam: lastAuthoritativeRailgunResult.beam ? {
          ...lastAuthoritativeRailgunResult.beam,
          start: [...lastAuthoritativeRailgunResult.beam.start],
          end: [...lastAuthoritativeRailgunResult.beam.end],
        } : null,
      } : null,
    },
    dmrThermal: {
      ...dmrThermalPresentation.telemetry(),
      weapon: player.weapon,
      magnification: DMR_THERMAL_MAGNIFICATION,
      cameraFov: camera.fov,
      smokeVolumes: smokeVolumes.length,
      smokeAuthority: smokeAuthority.telemetry(currentHostTimeMs()),
      smokePresentation: smokeVolumePresentationPool.telemetry(),
    },
    flashAuthority: {
      host: flashHostAuthority.telemetry(),
      victim: flashVictimConsumer.telemetry(),
      remainingDurationMs: Math.max(0, flashExposureUntilHostTimeMs - currentHostTimeMs()),
      whiteoutStrength: flashExposureStrength,
      overlayVisible: !element<HTMLElement>('#ordnance-flash').hidden,
      lastAdmission: lastFlashResultAdmission ? { ...lastFlashResultAdmission } : null,
      lastDispatch: lastFlashDispatch ? { ...lastFlashDispatch } : null,
      remoteVictimLifeIds: Object.fromEntries(remoteFlashVictimLifeIds),
    },
    lastCompletedMultiplayerDiagnostic: loadLastMultiplayerDiagnostic(clientPersistentStorage()),
    matchDiagnosticsUpload: matchDiagnosticUploader.telemetry(),
    scores: teamScores(),
    arenaSelection: {
      id: selectedArena.id,
      label: arena.label,
      rules: selectedArena.matchRules,
      rulesLabel: selectedArena.rulesLabel,
      multiplayer: selectedArena.multiplayer,
      soloBotCount: selectedArena.soloBotCount,
      rootVisible: arena.root.visible,
      activeRoots: [...arenaCache.values()].filter((entry) => entry.root.visible).map((entry) => entry.id),
      streaming: {
        initialArena: arenaConstructionHistory[0],
        constructionHistory: [...arenaConstructionHistory],
        constructionCount: arenaConstructionHistory.length,
        constructedArenaIds: [...new Set(arenaConstructionHistory)],
        residentArenaIds: [...arenaCache.keys()],
        residentArenaRoots: arenaCache.size,
        cachePolicy: 'fenced-two-arena-lru',
        canonicalCacheBound: ARENA_CACHE_BOUND,
        selectedOnlyResident: arenaCache.size === 1 && arenaCache.has(selectedArena.id),
        transition: {
          generation: arenaTransitionGeneration,
          phase: arenaTransitionPhase,
          startedAt: arenaTransitionStartedAt,
          completedAt: arenaTransitionCompletedAt,
          failure: arenaTransitionFailure,
          renderSubmissionPaused,
          profile: arenaTransitionProfiler.snapshot(performance.now()),
        },
        retirement: { ...arenaRetirementInventory },
        atomicAuxiliaryRoots: [arenaArtRoot, worldIdentityPresentation?.root, neighbourhoodLifeRoot]
          .filter((root): root is THREE.Group => root !== null && root !== undefined && root.parent !== null).length,
      },
      bounds: { ...arena.bounds },
      spawnCounts: [arena.spawns[0].length, arena.spawns[1].length],
      colliders: activeWorldColliders().length,
      physicsColliders: arena.physicsColliders.length,
      physicsBoundaryWalls: worldBoundaryColliders(arena.bounds).length,
      navigationColliders: botNavigationColliders.length,
      navigationCollidersMatchArena: botNavigationColliders.every((box) => activeWorldColliders().includes(box)),
      raycastMeshes: arena.raycastMeshes.length,
      targets: arena.targets.length,
      skylineAssetAudit: selectedArena.id === 'skyline-terminal' ? arena.root.userData.skylineAssetAudit : null,
      skylineCabinClearance: selectedArena.id === 'skyline-terminal' ? arena.root.userData.skylineCabinClearance : null,
      skylineOpeningAudit: selectedArena.id === 'skyline-terminal' ? arena.root.userData.skylineOpeningAudit : null,
      pass59GeometryAudit: selectedArena.id === 'atomic-acres'
        ? arena.root.userData.atomicCollisionAudit
        : selectedArena.id === 'rustworks-1v1'
          ? arena.root.userData.rustworksCentreCoverAudit
          : selectedArena.id === 'skyline-terminal'
            ? arena.root.userData.skylineDoorAudit
            : null,
    },
    interactiveWorld: {
      telemetry: interactiveWorldRuntime?.telemetry() ?? null,
      envelope: interactiveWorldRuntime?.stateEnvelope() ?? null,
      presentationRootInScene: interactiveWorldRuntime?.root.parent === scene,
      presentationRootVisible: interactiveWorldRuntime?.root.visible ?? false,
      collisionCacheRevision: activeWorldColliderCacheRevision,
      rapierMajorBodies: characterPhysics?.majorDebrisBodyCount() ?? 0,
      gpuRetirement: {
        queuedResources: deferredGpuRetirements.length,
        queuedRoots: deferredGpuRetirements.filter((entry) => entry.kind === 'root').length,
        queuedGeometries: deferredGpuRetirements.filter((entry) => entry.kind === 'geometry').length,
        draining: gpuRetirementTask !== null,
        fences: gpuRetirementFences,
        scheduledRoots: gpuRetirementScheduledRoots,
        scheduledGeometries: gpuRetirementScheduledGeometries,
        disposedRoots: gpuRetirementDisposedRoots,
        disposedGeometries: gpuRetirementDisposedGeometries,
        failures: gpuRetirementFailures,
      },
    },
    ballistics: {
      activeSurfaces: activeBallisticSurfaces().length,
      weaponProfiles: Object.fromEntries(Object.entries(WEAPONS).map(([id, weapon]) => [id, { ...weapon.penetration }])),
      arenas: Object.fromEntries([...arenaCache.entries()].map(([id, entry]) => [id, {
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
      rackPresentation: arena.root.userData.gunRangeRackPresentation ?? null,
      stations: GUN_RANGE_WEAPON_STATIONS.map((station) => {
        const stationRoot = arena.root.getObjectByName(`gun-range-weapon-station-${station.weapon}`);
        const rackModel = stationRoot?.getObjectByName(`gun-range-rack-weapon-${station.weapon}`);
        return {
          id: station.id,
          weapon: station.weapon,
          label: station.label,
          position: [station.position.x, station.position.y, station.position.z],
          visible: stationRoot?.visible ?? false,
          presentationSource: stationRoot?.userData.rackPresentationSource ?? null,
          modelId: rackModel?.userData.weaponModelId ?? null,
          importedWeaponSource: rackModel?.userData.importedWeaponSource ?? null,
          authored: rackModel?.userData.projectOriginalWeapon === true,
          deliveryVariant: rackModel?.userData.deliveryVariant ?? null,
        };
      }),
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
      const activeReticle = dmrThermalActive
        ? element<HTMLElement>('.dmr-thermal-reticle')
        : sniperScopeOverlay.hidden
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
      secondaryWeapon: player.secondaryWeapon,
      selectedGrenade: player.selectedGrenade,
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
      name: bot.name,
      team: bot.team,
      hp: bot.hp,
      alive: bot.alive,
      kills: bot.kills,
      deaths: bot.deaths,
      weapon: bot.weapon,
      grenade: bot.grenade,
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
        ? (Math.floor(soloBotDeaths / BOT_DEATHS_PER_REINFORCEMENT) + 1) * BOT_DEATHS_PER_REINFORCEMENT
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
      shotTimeline: {
        authored: lastAuthoredShotTimeline,
        resolved: lastResolvedShotTimeline,
        recentResolutions: [...recentShotResolutionTraces],
        rewindCeilingMs: MAX_AUTHORITATIVE_REWIND_MS,
        maximumFireAgeMs: MAX_SHOT_FIRE_AGE_MS,
        timing: shotTimingTelemetry.snapshot(),
      },
      interpolationDelay: {
        ...interpolationDelayState,
        sourceSnapshotRateHz: interpolationSourceSnapshotRateHz(),
        targetViewRewindHeadroomMs: Math.max(0, MAX_AUTHORITATIVE_REWIND_MS - interpolationDelayState.delayMs),
      },
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
      name: remote.snapshot.name,
      team: remote.snapshot.team,
      hp: remote.snapshot.hp,
      primary: remote.snapshot.primary,
      weapon: remote.snapshot.weapon,
      stance: remote.snapshot.stance ?? 'stand',
      seq: remote.snapshot.seq,
      position: remote.target.toArray(),
      authoritativePosition: [remote.snapshot.x, remote.snapshot.y, remote.snapshot.z],
      yaw: remote.snapshot.yaw,
      pitch: remote.snapshot.pitch,
      renderedHostTimeMs: remote.renderedHostTimeMs,
      renderedWorldAgeMs: remote.renderedWorldAgeMs,
      snapshotBufferDepth: remote.interpolation.depth,
      snapshotBuffer: remote.interpolation.stats,
      snapshotRateHz: remote.snapshotRateHz,
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
    corpses: {
      active: corpsePresentations.length,
      lifetimeMs: CORPSE_LIFETIME_MS,
      remainingMs: corpsePresentations.map((corpse) => Math.max(0, Math.round(corpse.expiresAt - performance.now()))),
      models: corpsePresentations.map((corpse) => riggedOperatorTelemetry(corpse.root)),
    },
    grenadeVisual: {
      ...grenadePresentationTelemetry(),
      pool: grenadeWorldPresentationPool.telemetry(),
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
    audio: { ...audio.telemetry(), occlusion: audioOcclusionBudget.telemetry() },
    settings: {
      requested: pass65Settings,
      graphics: graphicsRuntime,
      displayedGraphicsPreset,
      accessibility: accessibilityRuntime,
      playerProfile: {
        schemaVersion: playerProfileStore.current.schemaVersion,
        revision: playerProfileStore.current.revision,
        source: playerProfileStore.loadResult.source,
        writeProtected: playerProfileStore.loadResult.writeProtected,
        legacyCleanupFailures: [...playerProfileStore.loadResult.legacyCleanup.failed],
      },
      advancedGraphicsRegistry: {
        registeredKeys: advancedGraphicsBinding.registeredKeys,
        controls: ADVANCED_GRAPHICS_CONTROLS.map(({ key, runtimeConsumer, applyMode }) => ({ key, runtimeConsumer, applyMode })),
        unavailableCapabilities: GRAPHICS_CAPABILITY_NOTICES.map(({ id, reason, evidence }) => ({ id, reason, evidence })),
      },
    },
    sensory: {
      directions: directionalDamagePresentation(directionalDamageState, performance.now(), player.yaw),
      lowHealthActive: lowHealthFeedbackState.active,
      lowHealthOpacity: Number(lowHealthVignette.style.getPropertyValue('--low-health-opacity') || 0),
    },
    killstreak: killstreakSnapshot,
    killstreakPresentation: killstreakPresentation.telemetry(),
    supportVehiclePresentation: supportVehiclePresentationTelemetry(),
    supportDamageFeedback: supportDamageFeedbackTelemetry.snapshot(),
    fieldSupport: {
      streak: localFieldSupportProjection().streak,
      rewardCycle: localFieldSupportProjection().rewardCycle,
      careCapture: { status: localCareCaptureState.status, heldCrateId: careCaptureCrateId(localCareCaptureState) },
      fInteraction: {
        state: fInteractionPressState,
        lastCancellation: lastFInteractionTransition?.cancellation ?? null,
        lastCommit: lastFInteractionTransition?.commit ?? null,
        inputEligible: gameplayInputEnabled(),
        candidates: fInteractionCandidates(performance.now()).map((candidate) => ({ ...candidate })),
      },
      bestStreakThisMatch,
      available: { ...localFieldSupportProjection().available },
      availableCharges: { ...localFieldSupportProjection().availableCharges },
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
      targetingMode: pointSupportTargeting?.id ?? (triPassTargeting ? 'tri-pass' : null),
      crosshairTarget: crosshairPreviewLastPoint?.toArray() ?? null,
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
      retiredPresentationRoots: supportPresentationRetirements,
      pendingRetiredPresentationRoots: deferredGpuRetirements.filter((entry) => entry.kind === 'root').length,
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
      pendingActivationRequestIds: Object.keys(authority.pending),
      authorizations: Object.fromEntries(
        Object.entries(authority.authorizations).map(([source, authorization]) => [source, authorization ? {
          canonicalActivationId: authorization.canonicalActivationId,
          activationNonce: authorization.activationNonce,
          expiresInMs: Math.max(0, authorization.expiresAt - performance.now()),
          admittedOrigins: Object.keys(authorization.targetsByOrigin).length,
        } : null]),
      ),
    })),
    overdrive: {
      ...overdriveState,
      position: [overdriveState.position.x, overdriveState.position.y, overdriveState.position.z],
      damageMultiplier: overdriveDamageMultiplier(overdriveState, player.id, performance.now()),
      remainingMs: overdriveRemainingMs(overdriveState, player.id, performance.now()),
      spawns: overdriveSpawns,
      pickups: overdrivePickups,
      expiries: overdriveExpiries,
      presentationPrewarmed: overdrivePresentationPrewarmed,
      visible: overdriveState.available && overdriveRoot.visible,
      renderResident: overdriveRoot.visible,
      worldIconVisible: overdriveState.available && overdriveRoot.visible && quadWorldIcon.visible,
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
      persistentDebrisId: [...persistentWindowDebris.values()].find((entry) => entry.windowId === window.id)?.id ?? null,
    })),
    persistentWindowDebris: [...persistentWindowDebris.values()].map((entry) => ({
      id: entry.id,
      windowId: entry.windowId,
      position: entry.root.position.toArray(),
      visible: entry.root.visible,
      physical: characterPhysics?.majorDebrisSnapshots().some((snapshot) => snapshot.id === entry.id) ?? false,
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
        return pointInsideBounds(bodyPoint, arena.bounds, 0.44) && !isBlocked(bodyPoint, activeWorldColliders(), 0.44);
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
    activeImpactParticles: impactPresentation.activeParticles(),
    activeImpactMarks: impactPresentation.activeMarks(),
    activeTracers: tracerPool.activeCount(),
    originalArtLoaded: gameplayArenaPrepared
      ? blenderArenaActive || scene.getObjectByName('original-arena-art') !== undefined
      : menuPreviewVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || menuPreviewPoster.naturalWidth > 0,
    arenaZone: classifyArenaZone(player.position.x, player.position.z),
    worldIdentity: routeIdentityTelemetry(),
    worldIdentityPresentation: {
      routeLights: worldIdentityPresentation?.routeLights ?? 0,
      routeSigns: worldIdentityPresentation?.routeSigns ?? 0,
      cueInstances: worldIdentityPresentation?.cueInstances ?? 0,
      atmosphericParticles: worldIdentityPresentation?.atmosphericParticles ?? 0,
      practicalLights: worldIdentityPresentation?.practicalLights ?? 0,
      streetLights: worldIdentityPresentation?.streetLights ?? 0,
      interiorLights: worldIdentityPresentation?.interiorLights ?? 0,
      fixtureInstances: worldIdentityPresentation?.fixtureInstances ?? 0,
      ceilingInstances: worldIdentityPresentation?.ceilingInstances ?? 0,
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
        profileAuthorityParity: selectedArena.id === 'atomic-acres' ? atomicHouseAuthorityParity : null,
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
    menuLifecycle: {
      ...menuLifecycle,
      backdrop: {
        visible: !matchPauseBackdrop.hidden,
        provenance: matchPauseBackdrop.dataset.frameProvenance ?? null,
        captureStatus: matchPauseBackdrop.dataset.captureStatus ?? null,
        captureReason: matchPauseBackdrop.dataset.captureReason ?? null,
        sourceCanvas: matchPauseBackdrop.dataset.sourceCanvas ?? null,
        sourceArena: matchPauseBackdrop.dataset.sourceArena ?? null,
        sourceFrame: Number(matchPauseBackdrop.dataset.sourceFrame ?? 0),
        sourceSize: matchPauseBackdrop.dataset.sourceSize ?? null,
        captureSize: matchPauseBackdrop.dataset.captureSize ?? null,
        capturedFromSurface: matchPauseBackdrop.dataset.capturedFromSurface ?? null,
        capturedBeforeMenuVisible: matchPauseBackdrop.dataset.capturedBeforeMenuVisible === 'true',
        contract: matchPauseBackdrop.dataset.contract ?? null,
        periodicReadbackCount: Number(matchPauseBackdrop.dataset.periodicReadbackCount ?? 0),
        sourceCaptureAttemptCount: Number(matchPauseBackdrop.dataset.sourceCaptureAttemptCount ?? 0),
        sourceCaptureCount: Number(matchPauseBackdrop.dataset.sourceCaptureCount ?? 0),
        presentationCount: Number(matchPauseBackdrop.dataset.presentationCount ?? 0),
        fallbackCount: Number(matchPauseBackdrop.dataset.fallbackCount ?? 0),
      },
    },
    menuCamera: {
      position: camera.position.toArray(),
      towerNdc: new THREE.Vector3(0, 6, 0).project(camera).toArray(),
    },
    menuPreview: {
      ...menuPreviewVideoController.snapshot(),
      frame: menuPreviewFrame.dataset.frame,
      arena: menuPreviewFrame.dataset.arena,
      motion: menuPreviewFrame.dataset.motion,
      phase: menuPreviewVideo.currentTime.toFixed(3),
      canvasParent: canvas.parentElement?.id ?? null,
      context: menuShowcase.dataset.menuContext,
      label: menuPreviewLabel.textContent,
      videoPaused: menuPreviewVideo.paused,
      videoReadyState: menuPreviewVideo.readyState,
      videoCurrentSrc: menuPreviewVideo.currentSrc,
      rendererEvidence: {
        renderCalls: renderRuntime.renderInfo().calls,
        presentation: renderRuntime.presentationTelemetry(),
        gameplayArenaPrepared,
        arenaConstructionCount: arenaConstructionHistory.length,
      },
    },
    render: {
      profile: renderProfile,
      representation: activeRenderConfig.representation,
      atomicSignal: activePostTelemetry(),
      runtime: activeRuntimeTelemetry(),
      playableScene: playableSceneProof(),
      materialCompatibility: { ...materialCompatibility },
      fpsCounter: {
        value: fpsCounterValue.textContent,
        pacing: fpsCounter.dataset.pacing ?? 'warming',
        visible: !hudRoot.hidden,
        anchor: 'top-right',
      },
      pixelRatio: renderRuntime.pixelRatio(),
      drawingBuffer: renderRuntime.drawingBufferSize().toArray(),
      antialias: activeRuntimeTelemetry().canvasAntialias,
      webglVersion: renderRuntime.webGlVersion(),
      calls: renderRuntime.renderInfo().calls,
      triangles: renderRuntime.renderInfo().triangles,
      points: renderRuntime.renderInfo().points,
      lines: renderRuntime.renderInfo().lines,
      sceneObjects: scene.children.length,
      reducedMode: reducedRenderMode,
      shadows: renderRuntime.shadowState().enabled,
      shadowAutoUpdate: renderRuntime.shadowState().autoUpdate,
      shadowNeedsUpdate: renderRuntime.shadowState().needsUpdate,
      staticShadowDynamicRefreshes,
      contextLifecycle: {
        lost: webglContextLost,
        losses: webglContextLosses,
        restorations: webglContextRestorations,
      },
      authoredShadows: activeRenderConfig.shadows,
      shadowMode: activeRenderConfig.shadowMode,
      framePacing: effectiveFramePacing(),
      minimapRenders: minimapRenderCount,
      minimapTargetHz: MINIMAP_RENDER_HZ,
      adaptive: adaptiveQuality.telemetry(),
      adaptiveAdmission: lastMatchAdmissionAdaptiveCalibration,
      adaptiveMatchFrozen: matchWebGpuQualityFrozen,
      graphicsRefinement: graphicsRefinement.telemetry(),
      arenaContrastLighting: arenaContrastLighting.telemetry(),
      worldLocalLightOcclusion: auditLocalLightOcclusion(scene, 1),
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
      grass: grassSystem?.telemetry() ?? { enabled: true, owner: 'pass64.grass.tsl.v1' },
      atmosphere: atmosphereSystem?.telemetry() ?? { enabled: true, owner: 'pass64.atmosphere.tsl' },
      water: waterSystem.telemetry(),
      blenderEnvironment: {
        ...blenderArenaTelemetry(),
        proceduralRootActuallyVisible: selectedArena.id === 'atomic-acres' && arena.root.visible,
        qualityArtRootVisible: blenderArenaActive && arenaArtRoot?.visible === true,
        overlappingPrimaryArenaRoots: selectedArena.id === 'atomic-acres' && arena.root.visible && blenderArenaActive && arenaArtRoot?.visible === true,
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
    const temporaryAuthority = arenaId === selectedArena.id ? null : constructArena(arenaId, false);
    const traceArena = temporaryAuthority ?? arena;
    try {
      const surfaces = activeBallisticSurfaces(traceArena);
      return traceBallisticPath(
        new THREE.Vector3(...origin),
        new THREE.Vector3(...direction),
        distance,
        WEAPONS[weapon].penetration,
        surfaces,
      );
    } finally {
      if (temporaryAuthority) disposeRetiredArena(arenaId, temporaryAuthority);
    }
  },
  startSolo: () => {
    element<HTMLInputElement>('#player-name').value = 'QA Operator';
    network.close();
    resetForMode();
    void startGame('solo', false);
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
        if (!pointInsideBounds(bodyPoint, arena.bounds, 0.55) || isBlocked(bodyPoint, activeWorldColliders(), 0.45)) continue;
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
      setOperatorWeapon(bot.root, weapon, flattenOperatorMaterials, scheduleDeferredGpuRetirement);
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
      if (!pointInsideBounds(bodyPoint, arena.bounds, 0.55) || isBlocked(bodyPoint, activeWorldColliders(), 0.45)) continue;
      const clearAtHeight = (height: number) => {
        const target = candidate.clone().add(new THREE.Vector3(0, height, 0));
        const ray = target.clone().sub(origin);
        const targetDistance = ray.length();
        return !new THREE.Raycaster(origin, ray.normalize(), 0, targetDistance)
          .intersectObjects(activeRaycastMeshes(), false)
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
  aimAtRemoteWithOffset: (yawOffset = 0, pitchOffset = 0) => {
    const remote = remotes.values().next().value as RemotePlayer | undefined;
    if (!remote || !Number.isFinite(yawOffset) || !Number.isFinite(pitchOffset)) return;
    const targetOffset = hitProxyZoneCentre('body', remote.snapshot.stance ?? 'stand');
    const target = remote.target.clone().add(new THREE.Vector3(...targetOffset));
    const delta = target.sub(player.position);
    player.yaw = Math.atan2(-delta.x, -delta.z) + THREE.MathUtils.clamp(yawOffset, -Math.PI, Math.PI);
    player.pitch = THREE.MathUtils.clamp(
      Math.atan2(delta.y, Math.hypot(delta.x, delta.z)) + pitchOffset,
      -1.42,
      1.42,
    );
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
    const staged = selectPlayableWindowApproach(target, house.origin, arena.bounds, activeWorldColliders(), distance);
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
    const actor = localKillstreakActorSnapshot();
    if (network.role === 'client' || !actor?.loadout.slots.includes('yardhawk')) return false;
    const yardhawkCost = FIELD_SUPPORT.find((entry) => entry.id === 'yardhawk')?.eliminations ?? 5;
    while (!localKillstreakActorSnapshot()?.available.includes('yardhawk')
      && localFieldSupportProjection().streak < yardhawkCost) {
      killstreakRuntime.recordEligibleElimination(player.id, 'weapon');
      refreshLocalKillstreakSnapshot();
    }
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
    localContinuity += 1;
    localPositionHistory.length = 0;
    resetFlashVictimLife();
    player.position.set(x, y, z);
    characterPhysics?.teleportEye(player.position);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = THREE.MathUtils.clamp(pitch, -1.5, 1.5);
    camera.position.copy(player.position);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    camera.updateMatrixWorld(true);
    player.invulnerableUntil = 0;
    if (gameStarted) network.send(createStateMessage());
  },
  setCaptureCameraPose: (x, y = 0, z = 0, yaw = 0, pitch = 0, fov = camera.fov, fixedVisualTimeMs, seed = 6501) => {
    debugCaptureCameraActive = [x, y, z, yaw, pitch].every(Number.isFinite);
    if (!debugCaptureCameraActive) {
      debugCaptureCameraFov = null;
      debugCaptureFixedVisualTimeMs = null;
      pass64TslSystems?.clearReviewCamera();
      activeArenaReviewCameraId = null;
      activeArenaReviewFixedTimeMs = null;
      activeArenaReviewSeed = null;
      activeArenaReviewExposure = null;
      activeArenaReviewHud = null;
      hudRoot.hidden = !gameStarted || menuLifecycle.surface !== 'hidden';
      camera.fov = preferredFov;
      camera.updateProjectionMatrix();
      return;
    }
    debugCaptureFixedVisualTimeMs = Number.isFinite(fixedVisualTimeMs) ? Math.max(0, fixedVisualTimeMs!) : null;
    debugCaptureCameraPosition.set(x!, y, z);
    debugCaptureCameraYaw = yaw;
    debugCaptureCameraPitch = THREE.MathUtils.clamp(pitch, -1.5, 1.5);
    debugCaptureCameraFov = THREE.MathUtils.clamp(Number.isFinite(fov) ? fov : camera.fov, 35, 100);
    camera.fov = debugCaptureCameraFov;
    camera.updateProjectionMatrix();
    if (activeArenaVisualDefinition) renderRuntime.setExposure(effectiveGraphicsExposure(activeArenaVisualDefinition.colorPipeline.exposure));
    if (debugCaptureFixedVisualTimeMs !== null && activeArenaVisualDefinition) {
      const horizontal = Math.cos(debugCaptureCameraPitch);
      const target = [
        x! - Math.sin(debugCaptureCameraYaw) * horizontal,
        y + Math.sin(debugCaptureCameraPitch),
        z - Math.cos(debugCaptureCameraYaw) * horizontal,
      ] as const;
      const exposure = activeArenaVisualDefinition.colorPipeline.exposure;
      pass64TslSystems?.setReviewCamera({
        id: 'pass65-offline-menu-preview-capture',
        position: [x!, y, z],
        target,
        fov: camera.fov,
        near: camera.near,
        far: camera.far,
        fixedTimeMs: debugCaptureFixedVisualTimeMs,
        seed: Math.floor(seed),
        exposure,
        hud: 'hidden',
        purpose: 'overview',
      });
      activeArenaReviewCameraId = 'pass65-offline-menu-preview-capture';
      activeArenaReviewFixedTimeMs = debugCaptureFixedVisualTimeMs;
      activeArenaReviewSeed = Math.floor(seed);
      activeArenaReviewExposure = exposure;
      activeArenaReviewHud = 'hidden';
    } else {
      pass64TslSystems?.clearReviewCamera();
      activeArenaReviewCameraId = null;
      activeArenaReviewFixedTimeMs = null;
      activeArenaReviewSeed = null;
      activeArenaReviewExposure = null;
      activeArenaReviewHud = null;
    }
  },
  setArenaReviewCamera: (cameraId) => {
    const reviewCamera = activeArenaVisualDefinition?.reviewCameras.find((entry) => entry.id === cameraId);
    if (!reviewCamera) return false;
    camera.position.set(...reviewCamera.position);
    camera.lookAt(...reviewCamera.target);
    camera.fov = reviewCamera.fov;
    camera.near = reviewCamera.near;
    camera.far = reviewCamera.far;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    renderRuntime.setExposure(effectiveGraphicsExposure(reviewCamera.exposure));
    pass64TslSystems?.setReviewCamera(reviewCamera);
    activeArenaReviewCameraId = reviewCamera.id;
    activeArenaReviewFixedTimeMs = reviewCamera.fixedTimeMs;
    activeArenaReviewSeed = reviewCamera.seed;
    activeArenaReviewExposure = reviewCamera.exposure;
    activeArenaReviewHud = reviewCamera.hud;
    hudRoot.hidden = reviewCamera.hud === 'hidden';
    debugCaptureCameraPosition.copy(camera.position);
    debugCaptureCameraYaw = camera.rotation.y;
    debugCaptureCameraPitch = camera.rotation.x;
    debugCaptureCameraFov = camera.fov;
    debugCaptureCameraActive = true;
    return true;
  },
  setPass64SystemVisibility: (name, visible) => {
    const objectNames = {
      sky: 'Pass 64 TSL atmosphere sky',
      mist: 'Pass 64 TSL mist',
      smoke: 'Pass 64 TSL smoke',
      dust: 'Pass 64 TSL deterministic dust',
      grass: 'Pass 64 TSL grass',
      water: 'Pass 64 TSL perimeter water',
    } as const;
    const object = pass64TslSystems?.root.getObjectByName(objectNames[name]);
    if (!object) return false;
    object.visible = visible;
    return true;
  },
  setCaptureViewmodelHidden: (hidden) => {
    debugCaptureViewmodelHidden = hidden;
    weaponView.setPresentationVisible(shouldShowWeaponViewmodel());
  },
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
    ? isBlocked({ x, y: 0, z }, activeWorldColliders(), 0.44)
    : true,
  collisionProbeAt: (x, y, z) => [x, y, z].every(Number.isFinite)
    ? isBlocked({ x, y, z }, activeWorldColliders(), 0.36)
    : true,
  segmentBlocked: (x1, z1, x2, z2) => activeWorldColliders().some((box) => segmentIntersectsBox(
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
    const anchor = next.points[1] ?? next.points[0];
    const now = performance.now();
    const activationRequestId = anchor
      ? requestKillstreakActivation('tri-pass', now, [anchor.x, 0.2, anchor.z])
      : null;
    if (!activationRequestId) return false;
    authorizeLocalOffensiveSupport('tri-pass', activationRequestId, next.points.map((point) => [point.x, 0.2, point.z]));
    scheduleTriPassMissiles(next.points, now);
    cancelSupportTargeting(false);
    return true;
  },
  captureShadowProbeFrame: (horizontalOffset) => {
    if (renderRuntime.backend === 'webgpu') {
      throw new Error('Synchronous WebGL shadow readback is compatibility-only; use readbackWebGpuFrame()');
    }
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
    requestStaticShadowRefresh();
    atomicSignal?.render(scene, camera);
    if (!legacyRenderer) throw new Error('WebGL shadow readback requires the explicit compatibility renderer');
    const gl = legacyRenderer.getContext();
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 0x811c9dc5;
    for (const byte of pixels) {
      hash ^= byte;
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  },
  readbackWebGpuFrame: async () => {
    if (renderRuntime.backend !== 'webgpu' || !pass64TslSystems) {
      throw new Error('WebGPU HDR readback is unavailable on the explicit WebGL compatibility route');
    }
    const previousRenderPaused = debugRenderPaused;
    debugRenderPaused = true;
    try {
      // Keep live rAF admission paused across the complete drain-submit-drain
      // boundary. A warmed frame admitted between the first drain and this
      // forced readback submission would violate its required idle frontier.
      await flushWebGpuFrames();
      submitWebGpuFrame(performance.now(), true);
      await flushWebGpuFrames();
      const target = pass64TslSystems.principalHdrTarget;
      const { x, y, width, height } = centeredReadbackRegion(target.width, target.height);
      const pixels = await renderRuntime.readRenderTargetPixels(target, x, y, width, height);
      const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
      let hash = 0x811c9dc5;
      for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193);
      }
      return { bytes: bytes.byteLength, hash: (hash >>> 0).toString(16).padStart(8, '0'), x, y, width, height };
    } finally {
      debugRenderPaused = previousRenderPaused;
    }
  },
  sampleRendererResidency: estimateRendererResidency,
  sampleArenaPerformanceBudget,
  resetPresentationProgressWindow: () => renderRuntime.resetPresentationProgressWindow(performance.now()),
  setRenderPaused: (paused: boolean) => { debugRenderPaused = paused; },
  recoverFromVisibilityRegain: () => recoverFromSchedulingInterruption('debug visibility regain'),
  openMenu: () => openActiveMatchPause('debug-pause'),
  fireOnce: () => {
    debugInputUnlocked = true;
    setLocalTriggerHeld(true);
    tryFire(performance.now());
    setLocalTriggerHeld(false);
    debugInputUnlocked = false;
  },
  setTriggerHeld: (held: boolean) => {
    mouseTriggerHeld = held;
    triggerHeld = held;
    if (!held) {
      spinUpWeapon = null;
      spinUpStartedAtPerformanceMs = null;
      spinUpStartedAtHostTimeMs = null;
    }
  },
  stageSmokeVolume: (distance = 3) => {
    const direction = camera.getWorldDirection(new THREE.Vector3());
    const point = camera.position.clone().addScaledVector(direction, THREE.MathUtils.clamp(distance, 1.5, 8));
    const actionNonce = randomNonce();
    return spawnSmokeVolume(point, currentHostTimeMs(), actionNonce, player.id) ?? '';
  },
  authorFlashResult: (targetId, intensity = 0.8, durationMs = 2_000) => {
    if (!localMultiplayerQa || network.role !== 'host' || matchState.phase !== 'active') return false;
    const targetLifeId = targetId === player.id
      ? localContinuity
      : remoteFlashVictimLifeIds.get(targetId) ?? remotes.get(targetId)?.continuity;
    if (targetLifeId === undefined || !Number.isFinite(intensity) || !Number.isFinite(durationMs)) return false;
    const nowHostTimeMs = currentHostTimeMs();
    const resolution = flashHostAuthority.resolveDetonation({
      matchEpoch: interactiveWorldMatchEpoch,
      activationId: flashActivationId(interactiveWorldMatchEpoch, player.id, randomNonce()),
      startsAtHostTimeMs: nowHostTimeMs,
      victims: [{
        targetId,
        targetLifeId,
        intensity: THREE.MathUtils.clamp(intensity, 0.01, 1),
        durationMs: THREE.MathUtils.clamp(durationMs, 1, 2_800),
      }],
    });
    if (!resolution.accepted || resolution.results.length !== 1) return false;
    dispatchAuthoritativeFlashResult(resolution.results[0]!);
    return true;
  },
  replayLastFlashResult: (targetId) => {
    if (!localMultiplayerQa || network.role !== 'host') return false;
    const result = lastAuthoredFlashResults.get(targetId);
    if (!result) return false;
    dispatchAuthoritativeFlashResult(result);
    return true;
  },
  sendForgedFlashResult: () => {
    if (!localMultiplayerQa || network.role !== 'client' || matchState.phase !== 'active') return false;
    const nowHostTimeMs = currentHostTimeMs();
    const nextSequence = flashVictimConsumer.telemetry().lastSequence + 1;
    const activationId = `flash:${interactiveWorldMatchEpoch}:forged-${player.id}:${randomNonce()}`;
    const forged: FlashResult = Object.freeze({
      schemaVersion: FLASH_AUTHORITY_SCHEMA_VERSION,
      matchEpoch: interactiveWorldMatchEpoch,
      resultId: `${activationId}:target:${player.id}:${localContinuity}`,
      activationId,
      targetId: player.id,
      targetLifeId: localContinuity,
      sequence: nextSequence,
      intensityQ: 1_000,
      startsAtHostTimeMs: nowHostTimeMs,
      endsAtHostTimeMs: nowHostTimeMs + 2_000,
    });
    network.send({
      type: 'flash-result',
      schemaVersion: FLASH_AUTHORITY_SCHEMA_VERSION,
      by: player.id,
      forPlayerId: player.id,
      result: forged,
      nonce: randomNonce(),
    });
    return true;
  },
  throwGrenade: () => throwGrenade(),
  switchWeapon: (index: number) => switchWeapon(index),
  equipKit: (id: FieldKitId) => {
    chooseFieldKit(id);
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
    if (Number.isFinite(count)) player.grenades = Math.max(0, Math.min(1, Math.floor(count)));
  },
  reload: () => reload(),
  melee: () => {
    const before = player.lastMeleeAt;
    melee();
    return { accepted: player.lastMeleeAt !== before, alive: player.alive, phase: matchState.phase, lastMeleeAt: player.lastMeleeAt };
  },
  setAds: (held: boolean) => { debugAdsOverride = held; adsHeld = admittedAdsHeld(held); },
  setMovement: (forward: boolean, sprint = false) => {
    keys.delete('KeyW');
    keys.delete('ShiftLeft');
    keys.delete('ShiftRight');
    if (forward) keys.add('KeyW');
    if (forward && sprint) keys.add('ShiftLeft');
  },
  sendRawChat: (text, claimedBy = player.id) => {
    if (new URLSearchParams(window.location.search).get('multiplayerQa') !== '1' || network.role === 'offline') return false;
    const normalized = normalizeChatText(text);
    if (!normalized) return false;
    const message: ChatSubmitMessage = {
      type: 'chat-submit', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: claimedBy, text: normalized, nonce: randomNonce(),
    };
    if (network.role === 'host') admitHostChatSubmit(message);
    else network.send(message);
    return true;
  },
  setMeleeCaptureProgress: (progress: number | null) => weaponView.setMeleeCaptureProgress(progress),
  setFireCaptureAgeMs: (ageMs: number | null) => weaponView.setFireCaptureAgeMs(ageMs),
  setReloadCaptureProgress: (progress: number | null) => {
    debugReloadProgress = progress === null ? null : THREE.MathUtils.clamp(progress, 0, 1);
  },
  setGrassTime: (timeSeconds: number | null) => grassSystem?.setDebugTime(timeSeconds),
  setGrassInteractionProbe: (x: number | null, z: number | null) => grassSystem?.setDebugInteraction(x, z),
  sampleGrassBend: (index: number) => grassSystem?.sampleDebugBend(index) ?? null,
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
  damageRemoteAuthoritatively: (amount: number, playerId) => {
    if (!localMultiplayerQa || network.role !== 'host' || !Number.isFinite(amount) || amount <= 0) return null;
    const remote = playerId ? remotes.get(playerId) : remotes.values().next().value as RemotePlayer | undefined;
    if (!remote) return null;
    const health = remoteHealthAuthorities.get(remote.snapshot.id);
    if (!health) return null;
    const storedBefore = health.hp;
    const result = applyAuthoritativeRemoteDamage(health, Math.min(100, amount), performance.now());
    if (!result.applied) return null;
    remoteHealthAuthorities.set(remote.snapshot.id, result.state);
    remote.snapshot = { ...remote.snapshot, hp: result.state.hp };
    recordAuthoritativeRemoteRegeneration(remote.snapshot.id, result, 'qa-host-ledger-before-small-hit');
    return {
      targetId: remote.snapshot.id,
      storedBefore,
      canonicalBefore: result.healthBefore,
      storedAfter: result.state.hp,
    };
  },
  earnSupport: (eliminations: number) => {
    if (network.role === 'client') return;
    const admitted = Math.max(0, Math.min(15, Math.floor(eliminations)));
    for (let index = 0; index < admitted; index += 1) {
      killstreakRuntime.recordEligibleElimination(player.id, 'weapon');
    }
    // QA grants model elapsed eliminations, not fifteen kills occurring in one
    // browser task. Project and paint the resulting authority once so activation
    // endurance does not benchmark synthetic snapshot/HUD churn.
    refreshLocalKillstreakSnapshot();
    bestStreakThisMatch = Math.max(bestStreakThisMatch, localFieldSupportProjection().streak);
    broadcastKillstreakState();
    updateFieldSupportHud();
  },
  activateKillstreak: (id: Pass65KillstreakId, anchor) => Boolean(requestKillstreakActivation(id, performance.now(), anchor)),
  togglePilotedDroneControl: (entityId) => {
    const entity = killstreakSnapshot.entities.find((candidate) => (
      candidate.kind === 'drone'
      && candidate.mode === 'piloted'
      && candidate.ownerId === player.id
      && candidate.expiresInMs > 0
      && (!entityId || candidate.id === entityId)
    ));
    return entity ? requestKillstreakControl(entity.id, 'toggle-piloted-drone') : false;
  },
  forceBotGrenade: (fuseMs = 1_100, grenade: GrenadeId = 'frag') => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    return bot ? throwBotGrenade(bot, performance.now(), fuseMs, player.position, player.stance, grenade) : false;
  },
  activateSupport: (id: FieldSupportId) => activateFieldSupport(id),
  setOverdrive: (mode: 'charging' | 'available' | 'active' | 'expired') => {
    const now = performance.now();
    if (mode === 'charging') overdriveState = createOverdriveState(now);
    else if (mode === 'available') overdriveState = { ...createOverdriveState(now), available: false, nextSpawnAt: now };
    else if (mode === 'active') overdriveState = {
      generation: overdriveState.generation + 1, available: false, nextSpawnAt: now + OVERDRIVE_SPAWN_INTERVAL_MS,
      holderId: player.id, activeUntil: now + OVERDRIVE_DURATION_MS,
      position: OVERDRIVE_POSITION,
    };
    else overdriveState = { ...overdriveState, available: false, holderId: null, activeUntil: 0, nextSpawnAt: now + OVERDRIVE_SPAWN_INTERVAL_MS };
    updateOverdrive(now);
    broadcastOverdriveState(now);
  },
  stageRailgunSpawn: (siteIndex = 0) => {
    if (!gameStarted || selectedArena.id !== 'atomic-acres') return railgunState;
    const boundedIndex = Math.max(0, Math.min(RAILGUN_UPPER_ROOM_SPAWN_SITES.length - 1, Math.floor(siteIndex)));
    const scheduled = createRailgunAuthorityState('atomic-acres', 0, (boundedIndex + 0.01) / RAILGUN_UPPER_ROOM_SPAWN_SITES.length, railgunState.generation + 1);
    const advanced = advanceRailgunAuthority(scheduled, RAILGUN_SPAWN_DELAY_MS);
    applyRailgunState(advanced.state, advanced.announcement !== null);
    broadcastRailgunState();
    return railgunState;
  },
  stageRailgunMultiHitTargets: (shooterId = player.id) => {
    const failed = {
      staged: false,
      shooterId: null,
      hostileIds: [] as string[],
      friendlyId: null,
      distances: [] as number[],
      health: [] as number[],
      positions: [] as number[][],
    };
    if (!localMultiplayerQa || !gameStarted || network.role !== 'host' || privateMatchMode !== 'tdm') return failed;
    const remoteShooter = shooterId === player.id ? null : remotes.get(shooterId);
    if (shooterId !== player.id && !remoteShooter) return failed;
    const shooterTeam = remoteShooter?.snapshot.team ?? player.team;
    const origin = remoteShooter
      ? new THREE.Vector3(remoteShooter.snapshot.x, remoteShooter.snapshot.y, remoteShooter.snapshot.z)
      : camera.getWorldPosition(new THREE.Vector3());
    const yaw = remoteShooter?.snapshot.yaw ?? player.yaw;
    const pitch = remoteShooter?.snapshot.pitch ?? player.pitch;
    const direction = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      -Math.cos(yaw) * Math.cos(pitch),
    ).normalize();
    const stagedBots = [...bots.values()].filter((bot) => bot.id.startsWith('host-bot-')).slice(0, 4);
    if (stagedBots.length !== 4 || Math.abs(direction.y) > 0.05) return failed;
    const distances = [12, 22, 32, 42] as const;
    const health = [100, 40, 10, 100] as const;
    const hostileTeam: Team = shooterTeam === 0 ? 1 : 0;
    const now = performance.now();
    railgunQaHeldDeadBots.clear();
    for (const [index, bot] of stagedBots.entries()) {
      const centre = origin.clone().addScaledVector(direction, distances[index]);
      bot.team = index < 3 ? hostileTeam : shooterTeam;
      bot.position.set(centre.x, 0, centre.z);
      bot.velocity.set(0, 0, 0);
      bot.hp = health[index];
      bot.alive = true;
      bot.invulnerableUntil = 0;
      bot.respawnAt = 0;
      bot.deathVisibleUntil = 0;
      bot.lastSightAt = 0;
      bot.hasLineOfSight = false;
      bot.sightStartedAt = 0;
      bot.burstShots = 0;
      bot.nextDecisionAt = 0;
      bot.nextGrenadeAt = now + 60_000;
      bot.grenadeActive = false;
      bot.continuity += 1;
      bot.positionHistory = [{
        at: currentHostTimeMs(), x: bot.position.x, y: bot.position.y + 1.7, z: bot.position.z,
        yaw: operatorYawToward(bot.position, origin), stance: 'stand', continuity: bot.continuity,
      }];
      bot.root.position.copy(bot.position);
      bot.root.rotation.set(0, operatorYawToward(bot.position, origin), 0);
      bot.root.scale.setScalar(1);
      bot.root.visible = true;
      resetOperator(bot.root);
      poseOperator(bot.root, 'stand', 0, now * 0.001);
      bot.root.updateMatrixWorld(true);
      if (index < 3) railgunQaHeldDeadBots.add(bot.id);
    }
    botsFrozen = true;
    broadcastHostedBotState();
    return {
      staged: true,
      shooterId,
      hostileIds: stagedBots.slice(0, 3).map((bot) => bot.id),
      friendlyId: stagedBots[3].id,
      distances: [...distances],
      health: [...health],
      positions: stagedBots.map((bot) => bot.position.toArray()),
    };
  },
  replayLastRailgunResult: () => {
    if (!localMultiplayerQa || network.role !== 'host' || !lastAuthoritativeRailgunResult) return false;
    network.send(lastAuthoritativeRailgunResult);
    return true;
  },
  grantRailgunToRemote: (playerId) => {
    if (!localMultiplayerQa || network.role !== 'host' || !remotes.has(playerId)) return false;
    const health = remoteHealthAuthorities.get(playerId);
    if (!health?.alive) return false;
    const claimed = claimRailgun(railgunState, playerId, railgunState.generation);
    if (!claimed.accepted) return false;
    applyRailgunState(claimed.state);
    broadcastRailgunState();
    return true;
  },
  interactRailgun: () => interactWithRailgunPickup(),
  degradeStateChannel: () => localMultiplayerQa && network.degradeStateChannelForQa(),
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
    restartSoloMatch();
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
  interactShed: () => interactWithShedDoor(),
  bulletHitShed: (placementId, surfaceId = 'door-south', damageQ = 30, penetrationEnergyQ = 20) => {
    if (!interactiveWorldRuntime?.hasHostAuthority()) return false;
    const targetPlacementId = placementId ?? interactiveWorldRuntime.nearestDoor(player.position)?.placementId;
    if (!targetPlacementId || ![damageQ, penetrationEnergyQ].every(Number.isFinite)) return false;
    const surface = interactiveWorldRuntime.collisions().ballisticSurfaces.find((candidate) => (
      candidate.destructibleSurface?.placementId === targetPlacementId
      && candidate.destructibleSurface.surfaceId === surfaceId
    ));
    if (!surface) return false;
    const result = interactiveWorldRuntime.applyBulletImpact({
      surface,
      point: {
        x: (surface.bounds.minX + surface.bounds.maxX) / 2,
        y: ((surface.bounds.minY ?? 0) + (surface.bounds.maxY ?? 0)) / 2,
        z: (surface.bounds.minZ + surface.bounds.maxZ) / 2,
      },
      tick: interactiveWorldTick,
      damageQ: Math.max(1, Math.floor(damageQ)),
      penetrationEnergyQ: Math.max(0, Math.floor(penetrationEnergyQ)),
      radiusUQ: 700,
      radiusVQ: 700,
    });
    if (!result?.accepted) return false;
    syncInteractiveWorldPhysics();
    broadcastInteractiveWorldState(true);
    return true;
  },
  damageShed: (placementId, surfaceId = 'wall-west', damageQ = 220) => {
    if (!interactiveWorldRuntime?.hasHostAuthority()) return false;
    const targetPlacementId = placementId ?? interactiveWorldRuntime.nearestDoor(player.position)?.placementId;
    if (!targetPlacementId || !Number.isFinite(damageQ)) return false;
    const result = interactiveWorldRuntime.applyExplosion({
      placementId: targetPlacementId,
      surfaceId,
      damageQ: Math.max(1, Math.floor(damageQ)),
    });
    if (!result?.accepted) return false;
    syncInteractiveWorldPhysics();
    broadcastInteractiveWorldState(true);
    return true;
  },
  detonateGrenadeAtShed: (placementId, surfaceId = 'door-south') => {
    const rejected = {
      accepted: false,
      placementId: placementId ?? null,
      surfaceId,
      point: null,
      revisionBefore: null,
      revisionAfter: null,
      detachedChunksBefore: null,
      detachedChunksAfter: null,
      grenadeExplosionsBefore: grenadeExplosions,
      grenadeExplosionsAfter: grenadeExplosions,
    };
    if (!interactiveWorldRuntime?.hasHostAuthority()) return rejected;
    const envelopeBefore = interactiveWorldRuntime.stateEnvelope();
    const targetPlacementId = placementId ?? envelopeBefore.sheds[0]?.placementId;
    if (!targetPlacementId) return rejected;
    const surface = interactiveWorldRuntime.collisions().ballisticSurfaces.find((candidate) => (
      candidate.destructibleSurface?.placementId === targetPlacementId
      && candidate.destructibleSurface.surfaceId === surfaceId
    ));
    if (!surface) return { ...rejected, placementId: targetPlacementId };
    const point = new THREE.Vector3(
      (surface.bounds.minX + surface.bounds.maxX) / 2,
      ((surface.bounds.minY ?? 0) + (surface.bounds.maxY ?? 0)) / 2,
      (surface.bounds.minZ + surface.bounds.maxZ) / 2,
    );
    const detachedChunksBefore = interactiveWorldRuntime.telemetry().detachedChunks;
    const grenadeExplosionsBefore = grenadeExplosions;
    const detonatedAt = performance.now();
    audio.explosion(detonatedAt);
    spawnGrenadeExplosionVisual(point, detonatedAt);
    breakWindowsInGrenadeBlast(point, randomNonce(), true, GRENADE_RADIUS);
    const accepted = applyInteractiveWorldExplosion(point, GRENADE_RADIUS, 100, 'grenade-major-collapse');
    const envelopeAfter = interactiveWorldRuntime.stateEnvelope();
    return {
      accepted,
      placementId: targetPlacementId,
      surfaceId,
      point: point.toArray(),
      revisionBefore: envelopeBefore.revision,
      revisionAfter: envelopeAfter.revision,
      detachedChunksBefore,
      detachedChunksAfter: interactiveWorldRuntime.telemetry().detachedChunks,
      grenadeExplosionsBefore,
      grenadeExplosionsAfter: grenadeExplosions,
    };
  },

};

let menuWeaponAssetPromise: Promise<void> | null = null;
let sharedGameplayAssetsPromise: Promise<void> | null = null;
let menuDeploymentAssetsPromise: Promise<void> | null = null;

function yieldMenuPreparationIdleSlice(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 180 });
      return;
    }
    window.setTimeout(resolve, document.visibilityState === 'visible' ? 16 : 50);
  });
}

const menuDeploymentAssetsCoordinator = new PriorityPreparationCoordinator(yieldMenuPreparationIdleSlice);

async function prepareMenuWeaponAsset(): Promise<void> {
  if (menuWeaponAssetPromise) return menuWeaponAssetPromise;
  menuWeaponAssetPromise = weaponView.load(undefined, { mode: 'asset-only' }).then(() => {
    // Decoding the shared viewmodel after the video menu becomes interactive
    // preserves legacy readiness consumers without compiling or submitting a
    // selected gameplay arena.
    weaponView.root.traverse((node) => node.layers.set(VIEWMODEL_RENDER_LAYER));
  }).catch((error) => {
    menuWeaponAssetPromise = null;
    throw error;
  });
  return menuWeaponAssetPromise;
}

function batchPresentationRootOnce(root: THREE.Group, materialMode: typeof staticMaterialMode): void {
  if (root.userData.pass65StaticBatchReady === true) return;
  batchStaticMeshes(root, root, () => '', materialMode);
  root.userData.pass65StaticBatchReady = true;
}

function batchSelectedArenaPresentation(): void {
  const arenaRoot = arena.root;
  if (selectedArena.id === 'rustworks-1v1' && renderProfile === 'blender') {
    if (arenaRoot.userData.pass65StaticBatchReady !== true) {
      enhanceRustworksQualityMaterials(arenaRoot, renderProfile);
      // RustRig keeps its named collision/raycast sources for gameplay, but
      // rendering hundreds of immutable authored pieces individually caused
      // the severe frame-pacing regression reported on this arena. Preserve
      // the enhanced PBR materials while collapsing only visible static meshes;
      // batchStaticMeshes leaves the source objects resident and merely hidden.
      batchStaticMeshes(arenaRoot, arenaRoot, () => '', 'preserve');
      arenaRoot.userData.pass65StaticBatchReady = true;
    }
  } else if (!(selectedArena.id === 'atomic-acres' && blenderArenaActive)
    && !(renderRuntime.backend === 'webgl2' && selectedArena.id === 'skyline-terminal')) {
    batchPresentationRootOnce(arenaRoot, staticMaterialMode);
  }
  if (selectedArena.id === 'atomic-acres' && !blenderArenaActive && arenaArtRoot) {
    const decorativeMaterialMode = staticMaterialMode === 'texture-lit' ? 'palette-lit' : staticMaterialMode;
    batchPresentationRootOnce(arenaArtRoot, decorativeMaterialMode);
  }
  if (neighbourhoodLifeRoot) {
    const lifeMaterialMode = staticMaterialMode === 'texture-lit' ? 'palette-lit' : staticMaterialMode;
    batchPresentationRootOnce(neighbourhoodLifeRoot, lifeMaterialMode);
  }
}

async function prepareSharedGameplayAssets(): Promise<void> {
  if (sharedGameplayAssetsPromise) return sharedGameplayAssetsPromise;
  sharedGameplayAssetsPromise = (async () => {
    const operatorPromise = loadRiggedOperatorAsset().catch((error: unknown) => {
      riggedOperatorLoadError = error instanceof Error ? error.message : String(error);
      console.error('[Nuke Town operator asset load failed]', riggedOperatorLoadError);
    });
    await Promise.all([
      operatorPromise,
      prepareMenuWeaponAsset(),
      loadGrenadePresentation(),
      loadHunterDronePresentation(),
      loadSupportVehiclePresentations(),
    ]);
    // Every streamed viewmodel must inherit the camera's isolated compositing
    // layer before any match-boundary GPU prewarm can stage it.
    weaponView.root.traverse((node) => node.layers.set(VIEWMODEL_RENDER_LAYER));
    await killstreakPresentation.prewarmAuthoredAssets();
    // First-person geometry is composited after world depth is cleared. Contact
    // retreat still keeps it tucked near walls without world geometry cutting
    // holes through hands and weapons.
    // WebGPU menu preparation is asset-only: selecting a model here would call
    // the renderer hook before the selected arena owns its final TSL graph.
    // WebGL2 has no injected hook and retains its existing eager selection.
    if (renderRuntime.backend !== 'webgpu') weaponView.setWeapon(player.weapon, true);
    weaponView.setPresentationVisible(false);
  })().catch((error) => {
    sharedGameplayAssetsPromise = null;
    throw error;
  });
  return sharedGameplayAssetsPromise;
}

let lastMenuDeploymentAssetsProfile: Readonly<{
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  completed: boolean;
  error: string | null;
  phases: readonly Readonly<{ name: string; durationMs: number }>[];
}> | null = null;

function prepareMenuDeploymentAssets(priority: PreparationPriority = 'deployment'): Promise<void> {
  const operation = menuDeploymentAssetsCoordinator.prepare(priority, async ({ checkpoint }) => {
    const startedAt = performance.now();
    const phases: Array<{ name: string; durationMs: number }> = [];
    const runPhase = async (name: string, task: () => Promise<unknown>): Promise<void> => {
      await checkpoint();
      const phaseStartedAt = performance.now();
      await task();
      phases.push({ name, durationMs: Number((performance.now() - phaseStartedAt).toFixed(3)) });
      await checkpoint();
    };
    lastMenuDeploymentAssetsProfile = Object.freeze({
      startedAt,
      completedAt: null,
      durationMs: null,
      completed: false,
      error: null,
      phases: Object.freeze([]),
    });
    try {
      await runPhase('shared-assets', () => prepareSharedGameplayAssets());
      if (renderRuntime.backend === 'webgpu') {
        await runPhase('first-person-catalog', () => weaponView.prewarmBrowserWeaponCatalog(
          WEAPON_IDS,
          undefined,
          checkpoint,
        ));
      }
      await runPhase('world-drop-corpus', () => prewarmPass65RuntimeWeaponCorpus(checkpoint));
      const completedAt = performance.now();
      lastMenuDeploymentAssetsProfile = Object.freeze({
        startedAt,
        completedAt,
        durationMs: Number((completedAt - startedAt).toFixed(3)),
        completed: true,
        error: null,
        phases: Object.freeze(phases.map((phase) => Object.freeze(phase))),
      });
    } catch (error) {
      const completedAt = performance.now();
      lastMenuDeploymentAssetsProfile = Object.freeze({
        startedAt,
        completedAt,
        durationMs: Number((completedAt - startedAt).toFixed(3)),
        completed: false,
        error: error instanceof Error ? error.message : String(error),
        phases: Object.freeze(phases.map((phase) => Object.freeze(phase))),
      });
      throw error;
    }
  });
  menuDeploymentAssetsPromise = operation;
  void operation.catch(() => {
    if (menuDeploymentAssetsPromise === operation) menuDeploymentAssetsPromise = null;
  });
  return operation;
}

let lastArenaEffectPrewarmProfile: Readonly<{
  sceneGeneration: number;
  durationMs: number;
  groups: readonly Readonly<{ name: string; startedAt: number; completedAt: number; durationMs: number }>[];
}> | null = null;

async function yieldDeploymentPrewarmFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function prewarmArenaBoundGameplayPresentations(sceneGeneration: number): Promise<void> {
  if (renderRuntime.backend === 'webgpu') {
    bootstrapStage = 'prewarming-batched-presentations';
    profileArenaTransition('prewarm-batched-effects');
    const startedAt = performance.now();
    const runGroup = async (name: string, operation: () => Promise<unknown>) => {
      const groupStartedAt = performance.now();
      await operation();
      const completedAt = performance.now();
      return {
        name,
        startedAt: groupStartedAt,
        completedAt,
        durationMs: Number((completedAt - groupStartedAt).toFixed(3)),
      };
    };
    const groupDefinitions = [
      ['tracers-impacts', () => Promise.all([
        tracerPool.prewarm(renderRuntime, camera, sceneGeneration),
        impactPresentation.prewarm(renderRuntime, camera, sceneGeneration),
      ])],
      ['explosions', () => Promise.all([
        grenadeExplosionPresentation.prewarm(renderRuntime, camera, sceneGeneration),
        supportExplosionPresentation.prewarm(renderRuntime, camera, sceneGeneration),
      ])],
      ['death-drops', () => deathDropPresentationPool.prewarm(renderRuntime, camera, player.weapon)],
      ['world-ordnance', () => prewarmGrenadeWorldPresentations(sceneGeneration)],
      ['nuke-overdrive-bolts', () => Promise.all([
        prewarmNukePresentation(),
        prewarmOverdrivePresentation(),
        prewarmExplosiveBoltPresentation(sceneGeneration),
      ])],
      ['smoke-volumes', () => smokeVolumePresentationPool.prewarm(renderRuntime, camera, sceneGeneration)],
      // This retains the complete vehicle/effect vocabulary, three authored LOD
      // bands, 24-drone formation and possessed-cockpit submissions. Its
      // internal CPU yields naturally place later exact draws in bounded waves.
      ['killstreak-vocabulary', () => killstreakPresentation.prewarm(renderRuntime, camera, sceneGeneration)],
    ] as const;
    // Start every compatible family in one call stack. RenderRuntime coalesces
    // their first exact roots into one masked TSL/HDR submission, while
    // Promise.all preserves the seven-name evidence order regardless of which
    // family completes first.
    const groups = await Promise.all(groupDefinitions.map(([name, operation]) => runGroup(name, operation)));
    lastArenaEffectPrewarmProfile = Object.freeze({
      sceneGeneration,
      durationMs: Number((performance.now() - startedAt).toFixed(3)),
      groups: Object.freeze(groups.map((group) => Object.freeze(group))),
    });
    return;
  }
  bootstrapStage = 'prewarming-combat-tracers';
  profileArenaTransition('prewarm-tracers');
  await tracerPool.prewarm(renderRuntime, camera, sceneGeneration);
  bootstrapStage = 'prewarming-combat-impacts';
  profileArenaTransition('prewarm-impacts');
  await impactPresentation.prewarm(renderRuntime, camera, sceneGeneration);
  bootstrapStage = 'prewarming-grenade-explosion';
  profileArenaTransition('prewarm-grenade-explosion');
  await grenadeExplosionPresentation.prewarm(renderRuntime, camera, sceneGeneration);
  bootstrapStage = 'prewarming-support-explosion';
  profileArenaTransition('prewarm-support-explosion');
  await supportExplosionPresentation.prewarm(renderRuntime, camera, sceneGeneration);
  bootstrapStage = 'prewarming-death-drops';
  profileArenaTransition('prewarm-death-drops');
  await deathDropPresentationPool.prewarm(renderRuntime, camera, player.weapon);
  bootstrapStage = 'prewarming-nuke';
  profileArenaTransition('prewarm-nuke');
  await prewarmNukePresentation();
  bootstrapStage = 'prewarming-overdrive';
  profileArenaTransition('prewarm-overdrive');
  await prewarmOverdrivePresentation();
  bootstrapStage = 'prewarming-grenade-world-presentations';
  profileArenaTransition('prewarm-grenade-world');
  await prewarmGrenadeWorldPresentations(sceneGeneration);
  bootstrapStage = 'prewarming-killstreak-presentations';
  profileArenaTransition('prewarm-killstreaks');
  await killstreakPresentation.prewarm(renderRuntime, camera, sceneGeneration);
  bootstrapStage = 'prewarming-smoke-presentations';
  profileArenaTransition('prewarm-smoke');
  await smokeVolumePresentationPool.prewarm(renderRuntime, camera, sceneGeneration);
  bootstrapStage = 'prewarming-explosive-bolts';
  profileArenaTransition('prewarm-explosive-bolts');
  await prewarmExplosiveBoltPresentation(sceneGeneration);
}

function bootstrapMenuPreview(): void {
  document.documentElement.dataset.gameplayArena = 'deferred-until-deployment';
  arenaSelectionReady = true;
  syncArenaSelectionUi();
  setArenaMenuCamera();
  setStatus(`${selectedArena.displayName} preview ready · deployment assets prepare in the background.`);
  bootstrapStage = 'ready';
  requestAnimationFrame(frame);
  void menuPreviewVideoController.whenFirstFramePresented().then(() => {
    if (gameStarted || matchStartPreparing) return;
    return prepareMenuDeploymentAssets('idle').then(() => {
      if (gameStarted || matchStartPreparing) return;
      setStatus(`${selectedArena.displayName} ready · deployment assets retained.`);
    });
  }).catch(showFatalError);
}

bootstrapMenuPreview();
