import * as THREE from 'three';
import './style.css';
import { AdaptiveQualityController, adaptiveShadowsEnabled, classifyDisplayFrameMs } from './adaptive-quality';
import { batchStaticMeshes, buildOperator, deathOperator, fireOperator, meleeOperator, poseOperator, reactOperator, resetOperator, setOperatorWeapon } from './art-kit';
import { PATROL_LAYOUT } from './arena-layout';
import {
  BOT_REACTION_DELAY,
  SOLO_BOT_COUNT,
  botAimJitter,
  botCanFireWhileProtected,
  chooseBotIntent,
  chooseTacticalWaypoint,
  respawnBotState,
  scoreBotSpawn,
} from './bot-ai';
import { classifyFootstepSurface, classifyImpactSurface, nearMissStrength, type ImpactSurface } from './combat-feedback';
import { FIELD_KITS, FIELD_KIT_STORAGE_KEY, deployedWeapons, fieldKitById, parseFieldKitSelection, serializeFieldKitSelection, type FieldKitId } from './loadout';
import { ArenaAudio } from './audio';
import { clampPointToBounds, damp, isBlocked, pointInsideBounds, resolveHitscanAgainstTarget, resolveHorizontalMove, segmentIntersectsBox, shortestAngleDelta, sweepSphereAgainstBoxes } from './collision';
import {
  BOT_DAMAGE_MULTIPLIER,
  WEAPONS,
  advanceMatch,
  applyRadialDeadzone,
  beginReload,
  cancelReload,
  completeReload as completeReloadState,
  computeDamage,
  computeRecoilImpulse,
  computeSpread,
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
  sampleSpreadDisk,
  sprintEligible,
  type HitZone,
  type MatchState,
  type ReloadState,
  type Stance,
} from './gameplay';
import { ArenaMap, buildArena } from './map';
import { shouldRevealEnemy, worldToMinimap } from './minimap';
import { arenaZoneLabel, classifyArenaZone } from './arena-storytelling';
import { matchPresentationAt, respawnPresentation } from './match-presentation';
import { loadArenaArt, updateArenaArt } from './environment-assets';
import { ImpactPresentation } from './impact-presentation';
import { advanceFootsteps, strideLength, type FootstepAccumulator } from './footsteps';
import { FramePacingSampler } from './frame-pacing';
import { consumeFieldSupport, createFieldSupportState, recordSupportDeath, recordSupportElimination, triPassSchedule, type FieldSupportId } from './field-support';
import { ArenaNetwork } from './network';
import { MAX_ACTIVE_TEAM_PINGS, TEAM_PING_LIFETIME_MS, admitTeamPing, createTeamPingAdmissionState, type TeamPingAdmissionState } from './social-ping';
import { REMOTE_INTERPOLATION_RATE, STATE_BROADCAST_INTERVAL_MS, remoteInterpolationAlpha } from './network-sync';
import { admitRemoteShot, createRemoteShotAdmissionState, type RemoteShotAdmissionState } from './remote-shot-admission';
import { admitRemoteMelee, createRemoteMeleeAdmissionState, meleeActionHitsPoint, type RemoteMeleeAdmissionState } from './remote-melee-admission';
import { CharacterPhysics } from './physics';
import { TracerPool } from './tracer-pool';
import { loadRiggedOperatorAsset, riggedOperatorAssetReady, riggedOperatorTelemetry } from './operator-model';
import { loadImportedWeaponAssets } from './weapon-model';
import { WeaponPresentation } from './weapon-presentation';
import { RENDER_PROFILE_STORAGE_KEY, renderProfileConfig, resolveRenderProfile, type RenderProfile } from './render-profile';
import {
  DeathMessage,
  GameMessage,
  PlayerSnapshot,
  PrimaryWeaponId,
  ShotMessage,
  Team,
  TeamPingKind,
  TeamPingMessage,
  WeaponId,
  sanitizeName,
} from './protocol';

window.addEventListener('error', (event) => {
  console.error('[Atomic Acres runtime error]', event.message || 'unknown error', event.error?.stack || '');
});
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? `${event.reason.message}\n${event.reason.stack ?? ''}` : String(event.reason);
  console.error('[Atomic Acres unhandled rejection]', reason);
});

type RemotePlayer = {
  root: THREE.Group;
  snapshot: PlayerSnapshot;
  target: THREE.Vector3;
  targetYaw: number;
  lastSeen: number;
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
};

type GrenadeEntity = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  explodeAt: number;
  lastBounceAt: number;
};

type YardhawkEntity = {
  root: THREE.Group;
  targetId: string;
  expiresAt: number;
};

type StrikePassEntity = {
  plane: THREE.Group;
  marker: THREE.Mesh;
  target: THREE.Vector3;
  startedAt: number;
  impactAt: number;
  resolved: boolean;
};

type ActiveTeamPing = {
  root: THREE.Group;
  expiresAt: number;
};

const BOT_PATROL_POINTS = PATROL_LAYOUT.map(([x, z]) => new THREE.Vector3(x, 0, z));

function createPlayerId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');
app.innerHTML = `
  <canvas id="game" aria-label="Atomic Acres multiplayer arena"></canvas>
  <div id="color-grade"></div><div id="film-grain"></div>
  <div id="vignette"></div><div id="damage-flash"></div><div id="damage-direction"><i></i></div>
  <section id="menu" class="panel">
    <div class="eyebrow">ORIGINAL WEB ARENA · HIGH REFINEMENT PASS 17</div>
    <h1>ATOMIC <span>ACRES</span></h1>
    <p class="lede">Three original weapon families meet readable garden, transit, service and model-home routes with a complete score race and rematch flow.</p>
    <nav class="menu-tabs" aria-label="Deployment menu">
      <button type="button" data-menu-tab="deploy" class="active" aria-selected="true">DEPLOY</button>
      <button type="button" data-menu-tab="kit" aria-selected="false">FIELD KIT</button>
      <button type="button" data-menu-tab="options" aria-selected="false">OPTIONS</button>
    </nav>
    <div class="menu-panel active" data-menu-panel="deploy">
      <div class="setup-grid">
        <label>CALLSIGN<input id="player-name" maxlength="16" autocomplete="nickname" value="Player${Math.floor(Math.random() * 900 + 100)}"></label>
        <label>SQUAD<select id="team"><option value="0">Aqua</option><option value="1">Coral</option></select></label>
      </div>
      <div id="selected-kit-summary" class="selected-kit-summary"></div>
      <div class="menu-actions">
        <button id="resume" class="primary" hidden>RETURN TO MATCH</button>
        <button id="solo" class="primary">BOT SKIRMISH</button>
        <button id="host">HOST LOBBY</button>
      </div>
      <div class="join-row"><input id="room-input" placeholder="Paste room code" autocomplete="off"><button id="join">JOIN</button></div>
      <div id="room-card" hidden><span>ROOM CODE</span><strong id="room-code"></strong><button id="copy-room" class="small-button">COPY</button></div>
      <div id="network-status" data-kind="ok">Ready for deployment.</div>
    </div>
    <div class="menu-panel" data-menu-panel="kit" hidden>
      <div class="kit-heading"><div><b>FIELD KIT</b><span>Choose the primary issued on deployment.</span></div><small>Changes made mid-life queue for the next deployment.</small></div>
      <div class="kit-grid">
        ${FIELD_KITS.map((kit) => `<button type="button" class="kit-card" data-kit-id="${kit.id}">
          <span>${kit.role}</span><strong>${kit.title}</strong><b>${WEAPONS[kit.weapon].name}</b><p>${kit.summary}</p>
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
        <label>GRAPHICS<select id="graphics-profile"><option value="performance">PERFORMANCE</option><option value="quality">QUALITY</option></select></label>
      </div>
      <div class="controls"><b>WASD</b> move · <b>SHIFT</b> sprint · <b>C</b> crouch · <b>Z/CTRL</b> prone · <b>SPACE</b> jump · <b>RMB</b> ADS · <b>LMB</b> fire · <b>R</b> reload · <b>V</b> knife · <b>G</b> frag · <b>1/2</b> primary/pistol · <b>TAB</b> roster<br><b>PAD</b> left stick move · right stick aim · <b>LT/RT</b> ADS/fire · <b>A</b> jump · <b>B</b> crouch · <b>D-PAD DOWN</b> prone · <b>X</b> reload · <b>Y</b> switch · <b>RB</b> knife</div>
      <p class="legal">Fan-made original arena. No Activision assets, branding, code or ripped map geometry. Keyboard/mouse and standard gamepads supported.</p>
    </div>
  </section>
  <div id="refresh-warning" hidden><strong>30 HZ DISPLAY LIMIT</strong><span>Set Windows Advanced display or the remote-stream client to 60 Hz+ for synchronized motion.</span></div>
  <div id="hud" hidden>
    <header id="matchbar"><div><span class="tiny">TEAM DEATHMATCH</span><strong id="timer">05:00</strong></div><div id="scoreline"><span class="aqua">AQUA <b id="aqua-score">0</b></span><i>25</i><span class="coral"><b id="coral-score">0</b> CORAL</span></div><div id="connection-pill">SOLO</div></header>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hitmarker">×</div>
    <div id="killfeed"></div>
    <div id="objective">ATOMIC ACRES · FIRST TO 25</div>
    <canvas id="minimap" width="180" height="180" aria-label="Tactical minimap"></canvas>
    <div id="location-label">ATOM-LINER CROSSING</div>
    <div id="health-block"><div><span>VITALS</span><b id="health">100</b></div><div class="health-track"><i id="health-fill"></i></div></div>
    <div id="weapon-block"><span id="weapon-name">M86 CARBINE</span><div><b id="ammo">30</b><i>/</i><em id="reserve">120</em></div><small id="reload-state"></small></div>
    <div id="equipment-block"><span id="stance">STANDING</span><b id="grenades">FRAG ×1</b><small>V KNIFE · G THROW</small></div>
    <div id="support-block"><span id="support-streak">STREAK 0</span><b data-support="scout-sweep">3 · SCOUT</b><b data-support="yardhawk">5 · YARDHAWK</b><b data-support="tri-pass">7 · TRI-PASS</b><small>3 / 4 / 5 ACTIVATE</small></div>
    <div id="ping-block"><span>TEAM PINGS</span><small>T ENEMY · Y REGROUP · U PUSH · I NICE</small></div>
    <div id="room-hud"></div>
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
const roomCard = element<HTMLElement>('#room-card');
const roomCodeEl = element<HTMLElement>('#room-code');
const statusEl = element<HTMLElement>('#network-status');
const minimapCanvas = element<HTMLCanvasElement>('#minimap');
const minimapContextValue = minimapCanvas.getContext('2d');
if (!minimapContextValue) throw new Error('Canvas2D minimap is unavailable');
const minimapContext: CanvasRenderingContext2D = minimapContextValue;
const audio = new ArenaAudio();

const renderProfile: RenderProfile = resolveRenderProfile(
  window.location.search,
  localStorage.getItem(RENDER_PROFILE_STORAGE_KEY),
);
const activeRenderConfig = renderProfileConfig(renderProfile);
const reducedRenderMode = activeRenderConfig.reducedPresentationDetail;
const reducedWorldDetail = activeRenderConfig.reducedWorldDetail;
const staticMaterialMode = activeRenderConfig.staticMaterialMode;
const flattenOperatorMaterials = reducedRenderMode || renderProfile === 'quality';
document.documentElement.classList.toggle('compat-render', renderProfile === 'compat');
document.documentElement.classList.toggle('performance-render', renderProfile === 'performance');
document.documentElement.classList.toggle('quality-render', renderProfile === 'quality');
document.documentElement.dataset.renderProfile = renderProfile;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: activeRenderConfig.antialias,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = activeRenderConfig.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = activeRenderConfig.shadowMode === 'dynamic';
renderer.shadowMap.needsUpdate = activeRenderConfig.shadowMode === 'static';
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;
// Both public profiles can reduce their internal framebuffer when sustained
// frame time exceeds the detected display budget. Shadows disable
// automatically below a moderate DPR threshold.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, activeRenderConfig.pixelRatioCap));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb6c5c1, 70, 142);
const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);
camera.rotation.order = 'YXZ';
scene.add(camera);

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
      top: { value: new THREE.Color(0x245b82) },
      horizon: { value: new THREE.Color(0xb9d1cd) },
      bottom: { value: new THREE.Color(0xe2c99e) },
      sunColor: { value: new THREE.Color(0xffd39a) },
      cloudColor: { value: new THREE.Color(0xe8eee7) },
      sunDirection: { value: new THREE.Vector3(-0.39, 0.83, 0.42).normalize() },
      cloudStrength: { value: reducedRenderMode ? 0 : 0.035 },
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
      uniform vec3 sunDirection;
      uniform float cloudStrength;
      void main(){
        vec3 direction = normalize(skyDirection);
        float h = direction.y;
        vec3 color = h > 0.0
          ? mix(horizon, top, smoothstep(0.0, 0.78, h))
          : mix(horizon, bottom, smoothstep(0.0, -0.38, h));
        float sunDot = max(dot(direction, sunDirection), 0.0);
        float sunDisc = pow(sunDot, 420.0);
        float sunHalo = pow(sunDot, 18.0) * 0.28;
        ${reducedRenderMode ? '' : `
        float azimuth = atan(direction.z, direction.x);
        float highBand = 1.0 - smoothstep(0.0, 0.075, abs(h - 0.48));
        float lowBand = 1.0 - smoothstep(0.0, 0.06, abs(h - 0.3));
        float waveA = 0.5 + 0.5 * sin(azimuth * 8.0 + sin(azimuth * 3.0) * 1.8);
        float waveB = 0.5 + 0.5 * sin(azimuth * 17.0 - h * 12.0);
        float cloudMask = smoothstep(0.62, 0.9, waveA * 0.72 + waveB * 0.28) * max(highBand, lowBand * 0.72);
        color = mix(color, cloudColor, cloudMask * cloudStrength);
        `}
        color += sunColor * (sunDisc * 1.4 + sunHalo);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.name = 'procedural-atmosphere-sky';
  sky.frustumCulled = false;
  sky.onBeforeRender = () => sky.position.copy(camera.position);
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xdcefff, 0x4d6046, 1.48));
  scene.add(new THREE.AmbientLight(0xc7d3d4, 0.38));
  const sun = new THREE.DirectionalLight(0xffd9a5, 2.8);
  sun.position.set(-32, 68, 34);
  sun.castShadow = activeRenderConfig.shadows;
  if (activeRenderConfig.shadows) sun.shadow.mapSize.set(activeRenderConfig.shadowMapSize, activeRenderConfig.shadowMapSize);
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 54;
  sun.shadow.camera.bottom = -54;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.00028;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
}
buildSky();
const arena: ArenaMap = buildArena(scene);
const impactPresentation = new ImpactPresentation(scene, reducedRenderMode);
const tracerPool = new TracerPool(scene);
let arenaArtRoot: THREE.Group | null = null;

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
  ammo: { carbine: WEAPONS.carbine.mag, smg: WEAPONS.smg.mag, scattergun: WEAPONS.scattergun.mag, pistol: WEAPONS.pistol.mag } as Record<WeaponId, number>,
  reserve: { carbine: WEAPONS.carbine.reserve, smg: WEAPONS.smg.reserve, scattergun: WEAPONS.scattergun.reserve, pistol: WEAPONS.pistol.reserve } as Record<WeaponId, number>,
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
const grenades: GrenadeEntity[] = [];
let fieldSupport = createFieldSupportState();
let scoutSweepUntil = 0;
let yardhawk: YardhawkEntity | null = null;
const strikePasses: StrikePassEntity[] = [];
const processedNonces = new Set<number>();
const remoteShotAdmissions = new Map<string, RemoteShotAdmissionState>();
const remoteMeleeAdmissions = new Map<string, RemoteMeleeAdmissionState>();
const remotePingAdmissions = new Map<string, TeamPingAdmissionState>();
let localPingAdmission = createTeamPingAdmissionState();
const activeTeamPings: ActiveTeamPing[] = [];
const verifiedRemoteKills = new Map<string, number>();
const weaponActionHistory: string[] = [];
let gameStarted = false;
let refreshWarningUntil = 0;
let gameMode: 'solo' | 'host' | 'client' = 'solo';
let triggerHeld = false;
let targetHits = 0;
let accumulator = 0;
let recoilVisual = 0;
let recoilCamera = { pitch: 0, yaw: 0 };
let landingImpulse = 0;
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
const framePacing = new FramePacingSampler();
let lastHudAt = 0;
let debugRenderPaused = new URLSearchParams(window.location.search).get('renderPaused') === '1';
let matchState: MatchState = createMatch(performance.now());
let matchFinished = false;
let respawnEndsAt = 0;
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
let playerGrounded = false;
let wasGrounded = false;
let sensitivity = 1;
let controllerSensitivity = 1;
let preferredFov = 82;
let botsFrozen = false;
let debugInputUnlocked = false;
let debugAdsOverride: boolean | null = null;
let debugReloadProgress: number | null = null;
let characterPhysics: CharacterPhysics | null = null;

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

canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showFatalError(new Error('Graphics context was lost'));
});
canvas.addEventListener('webglcontextrestored', () => window.location.reload());

const network = new ArenaNetwork(onNetworkMessage, setStatus);

const weaponView = new WeaponPresentation(camera, reducedRenderMode);
let selectedFieldKit: FieldKitId = parseFieldKitSelection(localStorage.getItem(FIELD_KIT_STORAGE_KEY));

function setMenuTab(tab: 'deploy' | 'kit' | 'options'): void {
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
  const kit = fieldKitById(selectedFieldKit);
  const queued = gameStarted && player.primaryWeapon !== kit.weapon;
  element<HTMLElement>('#selected-kit-summary').innerHTML = `<span>${queued ? 'QUEUED NEXT DEPLOYMENT' : 'ACTIVE FIELD KIT'}</span><strong>${kit.title}</strong><b>${WEAPONS[kit.weapon].name}</b>`;
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
camera.add(viewFill);

function stanceEyeHeight(stance: PlayerSnapshot['stance']): number {
  return stance === 'prone' ? 0.5 : stance === 'crouch' ? 1.16 : 1.7;
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
  sprite.visible = snapshot.team === player.team;
  sprite.position.y = 2.5;
  sprite.scale.set(2.4, 0.6, 1);
  root.add(sprite);

  root.position.set(snapshot.x, snapshot.y - stanceEyeHeight(snapshot.stance), snapshot.z);
  scene.add(root);
  return { root, snapshot, target: new THREE.Vector3(snapshot.x, snapshot.y - stanceEyeHeight(snapshot.stance), snapshot.z), targetYaw: snapshot.yaw, lastSeen: performance.now() };
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
  if (!gameStarted || !player.alive) return;
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

function onNetworkMessage(message: GameMessage): void {
  if (message.type === 'join' || message.type === 'state') {
    const incoming = message.player;
    if (incoming.id === player.id || !pointInsideBounds(incoming, arena.bounds, 0.44)) return;
    let remote = remotes.get(incoming.id);
    if (!remote) {
      remote = createRemote(incoming);
      remotes.set(incoming.id, remote);
      addFeed(`${incoming.name} entered the test block`, incoming.team === 0 ? 'aqua' : 'coral');
      if (message.type === 'join') network.send({ type: 'state', player: snapshot() });
    }
    if (incoming.seq > remote.snapshot.seq) {
      const respawned = remote.snapshot.hp <= 0 && incoming.hp > 0;
      if (incoming.team !== remote.snapshot.team) return;
      if (incoming.primary !== remote.snapshot.primary && !respawned) return;
      remote.snapshot = incoming;
      remote.target.set(incoming.x, incoming.y - stanceEyeHeight(incoming.stance), incoming.z);
      remote.targetYaw = incoming.yaw;
      remote.lastSeen = performance.now();
      remote.root.visible = incoming.hp > 0;
    }
    return;
  }
  if (message.type === 'ping') {
    const pingPoint = { x: message.position[0], y: message.position[1], z: message.position[2] };
    if (message.by === player.id || message.team !== player.team || !pointInsideBounds(pingPoint, arena.bounds, 0)) return;
    const sender = remotes.get(message.by);
    const prior = remotePingAdmissions.get(message.by) ?? createTeamPingAdmissionState();
    const admission = admitTeamPing(message, sender?.snapshot, performance.now(), prior);
    if (!admission.accepted || !sender) return;
    remotePingAdmissions.set(message.by, admission.nextState);
    presentTeamPing(message, sender.snapshot.name);
    return;
  }
  if (message.type === 'shot') {
    if (message.by === player.id) return;
    const sender = remotes.get(message.by);
    const prior = remoteShotAdmissions.get(message.by) ?? createRemoteShotAdmissionState();
    const admission = admitRemoteShot(message, sender?.snapshot, performance.now(), prior);
    if (!admission.accepted) return;
    remoteShotAdmissions.set(message.by, admission.nextState);
    renderRemoteShot(message);
    return;
  }
  if (message.type === 'melee') {
    if (message.by === player.id) return;
    const sender = remotes.get(message.by);
    const prior = remoteMeleeAdmissions.get(message.by) ?? createRemoteMeleeAdmissionState();
    const admission = admitRemoteMelee(message, sender?.snapshot, performance.now(), prior);
    if (!admission.accepted || !sender) return;
    remoteMeleeAdmissions.set(message.by, admission.nextState);
    const operator = sender.root.userData.operator as THREE.Group | undefined;
    if (operator) meleeOperator(operator);
    audio.melee();
    const origin = new THREE.Vector3(...message.origin);
    if (player.alive && sender.snapshot.team !== player.team
      && meleeActionHitsPoint(message, player.position)
      && !arena.colliders.some((box) => segmentIntersectsBox(origin, player.position, box))) {
      applyDamage(100, message.by);
    }
    return;
  }
  if (message.type === 'hit' && message.target === player.id && !processedNonces.has(message.nonce)) {
    const attacker = remotes.get(message.by);
    if (!attacker || !pointInsideBounds(attacker.snapshot, arena.bounds, 0.44)) return;
    let validationOrigin: THREE.Vector3;
    if (message.kind === 'explosive') {
      if (!message.origin) return;
      validationOrigin = new THREE.Vector3(...message.origin);
      if (!pointInsideBounds(validationOrigin, arena.bounds, 0) || validationOrigin.distanceTo(player.position) > 6.2) return;
    } else {
      validationOrigin = new THREE.Vector3(attacker.snapshot.x, attacker.snapshot.y, attacker.snapshot.z);
    }
    if (arena.colliders.some((box) => segmentIntersectsBox(validationOrigin, player.position, box))) return;
    processedNonces.add(message.nonce);
    applyDamage(message.damage, message.by);
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

function renderRemoteShot(message: ShotMessage): void {
  const origin = new THREE.Vector3(...message.origin);
  if (!pointInsideBounds(origin, arena.bounds, 0.44)) return;
  const direction = new THREE.Vector3(...message.direction).normalize();
  const end = origin.clone().addScaledVector(direction, 50);
  const trace = resolveHitscanAgainstTarget(origin, direction, 50, end, 0, arena.colliders);
  const visibleEnd = origin.clone().addScaledVector(direction, trace.tracerDistance);
  const remoteOperator = remotes.get(message.by)?.root.userData.operator as THREE.Group | undefined;
  const remoteMuzzle = remoteOperator?.getObjectByName('muzzle-socket')?.getWorldPosition(new THREE.Vector3());
  spawnTracer(remoteMuzzle ?? origin, visibleEnd, WEAPONS[message.weapon].color);
  if (remoteOperator) fireOperator(remoteOperator);
  if (trace.blockedByCover) {
    spawnImpactFlash(visibleEnd, 'concrete', direction.clone().multiplyScalar(-1));
    audio.impact('concrete', visibleEnd.distanceTo(camera.position));
  }
  if (player.alive) audio.nearMiss(nearMissStrength(player.position, origin, visibleEnd));
  audio.shot(message.weapon, true, origin.distanceTo(camera.position));
}

function showDamageDirection(attacker: string): void {
  const attackerPosition = remotes.get(attacker)?.target ?? bots.get(attacker)?.position;
  if (!attackerPosition || attacker === player.id) return;
  const dx = attackerPosition.x - player.position.x;
  const dz = attackerPosition.z - player.position.z;
  const attackerYaw = Math.atan2(-dx, -dz);
  const indicator = element<HTMLElement>('#damage-direction');
  indicator.style.setProperty('--damage-angle', `${shortestAngleDelta(player.yaw, attackerYaw)}rad`);
  indicator.classList.remove('pulse');
  requestAnimationFrame(() => indicator.classList.add('pulse'));
}

function applyDamage(damage: number, attacker: string): void {
  const now = performance.now();
  if (!player.alive || now < player.invulnerableUntil) return;
  player.hp = Math.max(0, player.hp - Math.min(100, Math.max(1, damage)));
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
    const death: DeathMessage = { type: 'death', killer: attacker, victim: player.id, nonce: randomNonce() };
    network.send(death);
    processDeath(death);
    element<HTMLElement>('#respawn').hidden = false;
    respawnEndsAt = now + 1_900;
    document.exitPointerLock();
    setTimeout(respawn, 1900);
  }
}

function processDeath(message: DeathMessage): void {
  const killer = message.killer === player.id ? player.name : remotes.get(message.killer)?.snapshot.name ?? bots.get(message.killer)?.name ?? 'Unknown';
  const victim = message.victim === player.id ? player.name : remotes.get(message.victim)?.snapshot.name ?? bots.get(message.victim)?.name ?? 'Unknown';
  if (message.killer === player.id && message.victim !== player.id) {
    player.kills += 1;
    awardSupportElimination();
    audio.kill();
  } else if (message.victim === player.id && message.killer !== player.id) {
    const remoteKiller = remotes.get(message.killer);
    if (remoteKiller && remoteKiller.snapshot.team !== player.team) {
      verifiedRemoteKills.set(message.killer, (verifiedRemoteKills.get(message.killer) ?? 0) + 1);
    }
  }
  addFeed(`${killer} eliminated ${victim}`, message.killer === player.id ? 'gold' : undefined);
  const remote = remotes.get(message.victim);
  if (remote) remote.root.visible = false;
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
  remoteMeleeAdmissions.delete(id);
  remotePingAdmissions.delete(id);
  addFeed(`${remote.snapshot.name} ${reason}`);
}

function spawnPoint(): THREE.Vector3 {
  const options = arena.spawns[player.team];
  const preferredIndex = gameMode === 'client' ? Math.min(1, options.length - 1) : gameMode === 'host' ? 0 : player.deaths % options.length;
  const occupied = [
    ...[...remotes.values()].map((remote) => new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z)),
    ...[...bots.values()].filter((bot) => bot.alive).map((bot) => bot.position.clone()),
  ];
  const threats = [
    ...[...remotes.values()]
      .filter((remote) => remote.snapshot.team !== player.team && remote.snapshot.hp > 0)
      .map((remote) => new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z)),
    ...[...bots.values()]
      .filter((bot) => bot.team !== player.team && bot.alive)
      .map((bot) => bot.position.clone().add(new THREE.Vector3(0, 1.42, 0))),
  ];
  const valid = options.map((point, index) => ({ point, index })).filter(({ point }) => {
    const bodyPoint = { x: point.x, y: 0, z: point.z };
    return Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.z)
      && pointInsideBounds(bodyPoint, arena.bounds, 0.44)
      && !isBlocked(bodyPoint, arena.colliders, 0.44);
  });
  if (valid.length === 0) throw new Error(`No valid authored player spawn for team ${player.team}`);
  const scored = valid.map(({ point, index }) => {
    const nearestThreatDistanceSq = threats.length === 0 ? 0 : Math.min(...threats.map((threat) => threat.distanceToSquared(point)));
    const visibleThreats = threats.filter((threat) => !arena.colliders.some((box) => segmentIntersectsBox(threat, point, box))).length;
    return {
      point,
      index,
      score: scoreBotSpawn({
        nearestThreatDistanceSq,
        visibleThreats,
        occupied: occupied.some((position) => position.distanceToSquared(point) < 20),
        preferred: index === preferredIndex,
      }),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].point.clone();
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
  if (!characterPhysics || !player.alive || !playerGrounded) return false;
  const target = nextStance(player.stance, action);
  if (target === player.stance) return true;
  const previous = player.stance;
  const before = characterPhysics.eyePosition();
  if (!characterPhysics.setStance(target)) {
    setStatus('Low clearance — stance change blocked.', 'warn');
    return false;
  }
  const after = characterPhysics.eyePosition();
  cameraHeightOffset += before.y - after.y;
  player.position.set(after.x, after.y, after.z);
  player.stance = target;
  stanceRecoveryUntil = performance.now() + (target === 'prone' ? 260 : previous === 'prone' ? 290 : 135);
  currentSprinting = false;
  return true;
}

function respawn(requestLock = true): void {
  interruptReload(true);
  player.stance = 'stand';
  characterPhysics?.setStance('stand');
  player.position.copy(spawnPoint());
  characterPhysics?.teleportEye(player.position);
  player.velocity.set(0, 0, 0);
  player.hp = 100;
  lastDamageAt = -10_000;
  player.grenades = 1;
  player.reloadState = null;
  player.alive = true;
  respawnEndsAt = 0;
  player.invulnerableUntil = performance.now() + 1350;
  player.yaw = player.team === 0 ? Math.PI : 0;
  player.pitch = 0;
  recoilCamera = { pitch: 0, yaw: 0 };
  stanceRecoveryUntil = 0;
  sprintRecoveryUntil = 0;
  deferredFireAt = 0;
  cameraHeightOffset = 0;
  cameraRoll = 0;
  jumpQueuedAt = -10_000;
  footstepAccumulator = { distance: 0, side: 0 };
  const deploymentWeapon = fieldKitById(selectedFieldKit).weapon;
  player.primaryWeapon = deploymentWeapon;
  for (const weapon of deployedWeapons(deploymentWeapon)) {
    player.ammo[weapon] = WEAPONS[weapon].mag;
    player.reserve[weapon] = WEAPONS[weapon].reserve;
  }
  if (player.weapon !== player.primaryWeapon) {
    player.weapon = player.primaryWeapon;
    player.switchingUntil = 0;
    weaponView.setWeapon(player.primaryWeapon, true);
  }
  renderFieldKitSelection();
  element<HTMLElement>('#respawn').hidden = true;
  if (gameStarted && requestLock) requestGamePointerLock();
  network.send({ type: 'state', player: snapshot() });
}

function startGame(mode: 'solo' | 'host' | 'client', requestLock = true): void {
  player.name = sanitizeName(element<HTMLInputElement>('#player-name').value);
  player.team = Number(element<HTMLSelectElement>('#team').value) === 1 ? 1 : 0;
  gameStarted = true;
  refreshWarningUntil = performance.now() + 6_000;
  weaponView.root.visible = true;
  gameMode = mode;
  botsFrozen = false;
  matchState = createMatch(performance.now());
  matchFinished = false;
  previousHudScores = [0, 0];
  respawnEndsAt = 0;
  menu.classList.add('hidden');
  hudRoot.hidden = false;
  element<HTMLElement>('#connection-pill').textContent = mode === 'solo' ? 'BOT SKIRMISH' : mode === 'host' ? 'HOST' : 'PEER';
  element<HTMLElement>('#room-hud').textContent = network.roomCode ? `ROOM ${network.roomCode.slice(0, 8).toUpperCase()}` : '';
  respawn(requestLock);
  if (mode === 'solo') spawnBots();
  audio.unlock();
  addFeed('Welcome to Atomic Acres', 'gold');
  if (mode !== 'solo') network.send({ type: 'join', player: snapshot() });
}

function randomNonce(): number {
  return Math.floor(performance.now() * 1000 + Math.random() * 1_000_000);
}

function endSpawnProtectionOnOffense(now: number): void {
  if (now < player.invulnerableUntil) player.invulnerableUntil = 0;
}

function switchWeapon(index: number): void {
  const equippedWeapons = deployedWeapons(player.primaryWeapon);
  const id = equippedWeapons[index];
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
  if (player.reloadState || ammo >= spec.mag || player.reserve[player.weapon] <= 0) return;
  player.reloadState = beginReload(spec, ammo, player.reserve[player.weapon], performance.now());
  weaponActionHistory.length = 0;
  audio.reload();
  weaponView.reload();
  addFeed(`Reloading ${spec.name}`);
}

function finishReload(now: number): void {
  if (!player.reloadState) return;
  const state = completeReloadState(player.reloadState, now, player.ammo[player.weapon], player.reserve[player.weapon]);
  if (state.completed) {
    player.ammo[player.weapon] = state.ammo;
    player.reserve[player.weapon] = state.reserve;
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
  player.ammo[player.weapon] -= 1;
  const ammoDisplay = element<HTMLElement>('#ammo');
  ammoDisplay.classList.remove('fired');
  requestAnimationFrame(() => ammoDisplay.classList.add('fired'));
  const recoil = computeRecoilImpulse(spec, player.sustainedShots, Math.random());
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
  const hitDamage = new Map<string, { damage: number; zone: HitZone }>();
  let impactAudioPlayed = false;
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  for (let pellet = 0; pellet < spec.pellets; pellet += 1) {
    const sample = sampleSpreadDisk(spread, Math.random(), Math.random());
    const direction = baseDirection.clone()
      .addScaledVector(cameraRight, sample.x)
      .addScaledVector(cameraUp, sample.y)
      .normalize();
    const result = castShot(origin, direction);
    const authoritativeEnd = origin.clone().addScaledVector(direction, result.distance);
    const visualStart = weaponView.muzzleWorldPosition(new THREE.Vector3()) ?? origin;
    spawnTracer(visualStart, authoritativeEnd, spec.color);
    if (!result.playerId && !result.targetId && result.distance < 89) {
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
      const damage = computeDamage(spec, result.distance, zone);
      const prior = hitDamage.get(result.playerId);
      hitDamage.set(result.playerId, { damage: (prior?.damage ?? 0) + damage, zone: prior?.zone === 'head' || zone === 'head' ? 'head' : zone });
    }
    if (result.targetId) hitPracticeTarget(result.targetId);
  }
  for (const [target, hit] of hitDamage) {
    const bot = bots.get(target);
    if (bot) applyBotDamage(bot, Math.min(100, hit.damage), hit.zone);
    else {
      const remote = remotes.get(target);
      if (remote && remote.snapshot.team !== player.team) {
        const remoteOperator = remote.root.userData.operator as THREE.Group | undefined;
        if (remoteOperator) reactOperator(remoteOperator, hit.zone);
        const nonce = randomNonce();
        network.send({ type: 'hit', by: player.id, target, damage: Math.min(100, hit.damage), kind: 'shot', nonce });
        showHitmarker(hit.zone === 'head');
        audio.hit(hit.zone === 'head');
      }
    }
  }
  const shot: ShotMessage = {
    type: 'shot',
    by: player.id,
    weapon: player.weapon,
    origin: origin.toArray() as [number, number, number],
    direction: baseDirection.toArray() as [number, number, number],
    nonce: randomNonce(),
  };
  network.send(shot);
  if (player.ammo[player.weapon] === 0) setTimeout(reload, 120);
}

type ShotCastResult = {
  distance: number;
  playerId?: string;
  targetId?: string;
  hitZone?: HitZone;
  impactPoint?: THREE.Vector3;
  impactNormal?: THREE.Vector3;
  impactSurface?: ImpactSurface;
};

function castShot(origin: THREE.Vector3, direction: THREE.Vector3): ShotCastResult {
  const ray = new THREE.Raycaster(origin, direction, 0.1, 110);
  ray.camera = camera;
  const remoteObjects = [...remotes.values()].filter((remote) => remote.root.visible).map((remote) => remote.root);
  const botObjects = [...bots.values()].filter((bot) => bot.alive && bot.root.visible).map((bot) => bot.root);
  const activeTargets = arena.targets.filter((target) => target.active).map((target) => target.root);
  const intersections = ray.intersectObjects([...arena.raycastMeshes, ...remoteObjects, ...botObjects, ...activeTargets], true);
  const first = intersections[0];
  if (!first) return { distance: 90 };
  let node: THREE.Object3D | null = first.object;
  let playerId: string | undefined;
  let targetId: string | undefined;
  let hitZone: HitZone | undefined;
  let surfaceHint: unknown;
  const names: string[] = [];
  while (node) {
    playerId ??= node.userData.playerId as string | undefined;
    targetId ??= node.userData.targetId as string | undefined;
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
    playerId,
    targetId,
    hitZone,
    impactPoint: first.point.clone(),
    impactNormal,
    impactSurface: classifyImpactSurface({ hint: surfaceHint, name: names.join(' '), metalness }),
  };
}

function selectSafeBotSpawn(team: Team, preferredIndex: number): THREE.Vector3 {
  const options = arena.spawns[team];
  const threats = [
    ...(player.alive && player.team !== team ? [player.position.clone()] : []),
    ...[...remotes.values()]
      .filter((remote) => remote.snapshot.team !== team && remote.snapshot.hp > 0)
      .map((remote) => new THREE.Vector3(remote.snapshot.x, remote.snapshot.y, remote.snapshot.z)),
  ];
  const occupied = [
    ...[...remotes.values()].map((remote) => remote.target.clone()),
    ...[...bots.values()].filter((bot) => bot.alive).map((bot) => bot.position.clone()),
  ];
  const valid = options.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => {
    const bodyPoint = { x: candidate.x, y: 0, z: candidate.z };
    return Number.isFinite(candidate.x) && Number.isFinite(candidate.z)
      && pointInsideBounds(bodyPoint, arena.bounds, 0.44)
      && !isBlocked(bodyPoint, arena.colliders, 0.44);
  });
  if (valid.length === 0) throw new Error(`No valid authored spawn for team ${team}`);
  const scored = valid.map(({ candidate, index }) => {
    const nearestThreatDistanceSq = threats.length === 0
      ? 0
      : Math.min(...threats.map((threat) => threat.distanceToSquared(candidate)));
    const visibleThreats = threats.filter((threat) => !arena.colliders.some((box) => segmentIntersectsBox(candidate, threat, box))).length;
    return {
      candidate,
      index,
      score: scoreBotSpawn({
        nearestThreatDistanceSq,
        visibleThreats,
        occupied: occupied.some((position) => position.distanceToSquared(candidate) < 20),
        preferred: index === ((preferredIndex % options.length) + options.length) % options.length,
      }),
    };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored[0].candidate;
}

function spawnBots(): void {
  clearBots();
  const botTeam: Team = player.team === 0 ? 1 : 0;
  const names = ['RIVET'].slice(0, SOLO_BOT_COUNT);
  names.forEach((name, index) => {
    const id = `bot-${index}`;
    const root = buildOperator(botTeam, 'bot-operator', flattenOperatorMaterials);
    root.userData.playerId = id;
    root.traverse((node) => {
      node.userData.playerId = id;
      node.userData.targetRoot = root;
    });
    const spawn = selectSafeBotSpawn(botTeam, index);
    const position = new THREE.Vector3(spawn.x, spawn.y - 1.7, spawn.z);
    root.position.copy(position);
    scene.add(root);
    bots.set(id, {
      id, name, team: botTeam, root, position, velocity: new THREE.Vector3(), hp: 100, alive: true,
      kills: 0, deaths: 0, lastShotAt: 0, lastSightAt: 0, hasLineOfSight: false,
      sightStartedAt: 0, burstShots: 0, nextDecisionAt: 0, strafeSign: index % 2 === 0 ? 1 : -1,
      invulnerableUntil: performance.now() + 1_000, respawnAt: 0, deathVisibleUntil: 0, waypoint: index, blockedSince: 0,
    });
  });
  addFeed('One hostile operator entered the block', 'coral');
}

function clearBots(): void {
  for (const bot of bots.values()) scene.remove(bot.root);
  bots.clear();
}

function botHasLineOfSight(bot: BotPlayer): boolean {
  const origin = { x: bot.position.x, y: bot.position.y + 1.42, z: bot.position.z };
  const target = { x: player.position.x, y: player.position.y, z: player.position.z };
  return !arena.colliders.some((box) => segmentIntersectsBox(origin, target, box));
}

function selectBotTacticalWaypoint(bot: BotPlayer): number {
  const target = { x: player.position.x, y: player.position.y, z: player.position.z };
  return chooseTacticalWaypoint(BOT_PATROL_POINTS.map((point, index) => {
    const eye = { x: point.x, y: 1.42, z: point.z };
    return {
      index,
      distanceFromBot: point.distanceTo(bot.position),
      distanceFromPlayer: point.distanceTo(player.position),
      seesPlayer: player.alive && !arena.colliders.some((box) => segmentIntersectsBox(eye, target, box)),
    };
  }), bot.waypoint, bot.deaths + bot.kills);
}

function applyBotDamage(bot: BotPlayer, damage: number, zone: HitZone): void {
  const now = performance.now();
  if (!bot.alive || now < bot.invulnerableUntil) return;
  reactOperator(bot.root, zone);
  bot.hp = Math.max(0, bot.hp - damage);
  showHitmarker(zone === 'head');
  audio.hit(zone === 'head');
  if (bot.hp > 0) return;
  bot.alive = false;
  bot.deaths += 1;
  bot.respawnAt = now + 2_200;
  bot.deathVisibleUntil = now + 1_050;
  deathOperator(bot.root);
  player.kills += 1;
  awardSupportElimination();
  audio.kill();
  addFeed(`${player.name} eliminated ${bot.name}${zone === 'head' ? ' · HEADSHOT' : ''}`, 'gold');
  checkMatchEnd();
}

function respawnBot(bot: BotPlayer, now: number): void {
  const state = respawnBotState(now);
  const spawn = selectSafeBotSpawn(bot.team, bot.deaths + bot.waypoint);
  bot.position.set(spawn.x, spawn.y - 1.7, spawn.z);
  bot.root.position.copy(bot.position);
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
  bot.deathVisibleUntil = 0;
  resetOperator(bot.root);
  bot.root.visible = true;
}

function updateBots(dt: number, now: number): void {
  if (gameMode !== 'solo' || matchState.phase !== 'active') return;
  let botIndex = 0;
  for (const bot of bots.values()) {
    botIndex += 1;
    if (!bot.alive) {
      bot.root.visible = now < bot.deathVisibleUntil;
      if (bot.root.visible) poseOperator(bot.root, 'stand', 0, now * 0.001);
      if (now >= bot.respawnAt && !matchFinished) respawnBot(bot, now);
      continue;
    }
    if (botsFrozen) {
      poseOperator(bot.root, 'stand', 0, now * 0.001);
      continue;
    }
    // A corrupted position can never become an out-of-arena damage source.
    if (!pointInsideBounds(bot.position, arena.bounds, 0.44)) {
      const safeSpawn = selectSafeBotSpawn(bot.team, bot.waypoint);
      bot.position.set(safeSpawn.x, safeSpawn.y - 1.7, safeSpawn.z);
      bot.root.position.copy(bot.position);
      bot.hasLineOfSight = false;
      bot.sightStartedAt = 0;
      bot.burstShots = 0;
      bot.blockedSince = 0;
      bot.lastSightAt = now;
      continue;
    }

    const toPlayer = player.position.clone().setY(0).sub(bot.position.clone().setY(0));
    const distance = toPlayer.length();
    const sightInterval = 120 + botIndex * 19;
    if (now - bot.lastSightAt >= sightInterval) {
      bot.lastSightAt = now;
      const previousSight = bot.hasLineOfSight;
      bot.hasLineOfSight = player.alive && botHasLineOfSight(bot);
      if (bot.hasLineOfSight && !previousSight) bot.sightStartedAt = now;
      if (!bot.hasLineOfSight) {
        if (previousSight) bot.waypoint = selectBotTacticalWaypoint(bot);
        bot.sightStartedAt = 0;
        bot.burstShots = 0;
      }
    }
    const lineOfSight = bot.hasLineOfSight;
    if (now >= bot.nextDecisionAt) {
      bot.strafeSign = bot.strafeSign === 1 ? -1 : 1;
      bot.nextDecisionAt = now + 850 + botIndex * 95;
    }

    let patrolTarget = BOT_PATROL_POINTS[bot.waypoint % BOT_PATROL_POINTS.length];
    let toPatrol = patrolTarget.clone().sub(bot.position).setY(0);
    const waypointReached = toPatrol.lengthSq() < 5.2;
    if (waypointReached) {
      bot.waypoint = lineOfSight
        ? (bot.waypoint + 1 + botIndex) % BOT_PATROL_POINTS.length
        : selectBotTacticalWaypoint(bot);
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
    });
    if (intent.changeWaypoint && !waypointReached) bot.waypoint = selectBotTacticalWaypoint(bot);
    patrolTarget = BOT_PATROL_POINTS[bot.waypoint % BOT_PATROL_POINTS.length];
    toPatrol = patrolTarget.clone().sub(bot.position).setY(0);

    const pursuit = lineOfSight ? toPlayer : toPatrol;
    const forward = pursuit.lengthSq() > 0.01 ? pursuit.normalize() : new THREE.Vector3(0, 0, -1);
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const desiredDirection = intent.movement === 'advance' ? forward
      : intent.movement === 'retreat' ? forward.clone().multiplyScalar(-1)
        : intent.movement === 'strafe-left' ? side.clone().multiplyScalar(-1)
          : intent.movement === 'strafe-right' ? side : new THREE.Vector3();
    const speed = intent.movement.startsWith('strafe') ? 4.05 : lineOfSight ? 4.65 : 5.85;
    const desired = bot.position.clone().addScaledVector(desiredDirection, speed * dt);
    let resolved = resolveHorizontalMove(bot.position, desired, arena.colliders, arena.bounds, 0.44);
    const stalled = Math.hypot(resolved.x - bot.position.x, resolved.z - bot.position.z) < 0.002
      && desiredDirection.lengthSq() > 0;
    if (stalled) {
      const detour = bot.position.clone().addScaledVector(side, bot.strafeSign * speed * dt * 1.5);
      resolved = resolveHorizontalMove(bot.position, detour, arena.colliders, arena.bounds, 0.44);
      const detourStalled = Math.hypot(resolved.x - bot.position.x, resolved.z - bot.position.z) < 0.002;
      if (detourStalled) {
        if (bot.blockedSince === 0) bot.blockedSince = now;
        else if (now - bot.blockedSince >= 400) {
          bot.waypoint = selectBotTacticalWaypoint(bot);
          bot.blockedSince = 0;
        }
      } else {
        bot.blockedSince = 0;
      }
    } else {
      bot.blockedSince = 0;
    }
    bot.position.set(resolved.x, bot.position.y, resolved.z);
    bot.root.position.copy(bot.position);
    const lookTarget = lineOfSight ? player.position : patrolTarget;
    bot.root.lookAt(lookTarget.x, bot.position.y + 1.1, lookTarget.z);
    poseOperator(bot.root, 'stand', desiredDirection.lengthSq() > 0 ? speed : 0, now * 0.008 + botIndex, Math.min(1, dt * 12));

    if (botCanFireWhileProtected(intent.fire, now, bot.invulnerableUntil) && player.alive) {
      if (bot.burstShots <= 0) bot.burstShots = 2 + (botIndex % 2);
      bot.burstShots -= 1;
      bot.lastShotAt = now;
      fireOperator(bot.root);
      const origin = bot.position.clone().add(new THREE.Vector3(0, 1.42, 0));
      const direction = player.position.clone().sub(origin).normalize();
      const jitter = botAimJitter(distance) + bot.burstShots * 0.006;
      direction.x += (Math.random() - 0.5) * jitter;
      direction.y += (Math.random() - 0.5) * jitter;
      direction.z += (Math.random() - 0.5) * jitter;
      direction.normalize();
      const shotLength = Math.min(distance + 2, 75);
      const targetRadius = player.stance === 'prone' ? 0.38 : player.stance === 'crouch' ? 0.48 : 0.55;
      const resolution = resolveHitscanAgainstTarget(origin, direction, shotLength, player.position, targetRadius, arena.colliders);
      const visibleEnd = origin.clone().addScaledVector(direction, resolution.tracerDistance);
      const botMuzzle = bot.root.getObjectByName('muzzle-socket')?.getWorldPosition(new THREE.Vector3());
      spawnTracer(botMuzzle ?? origin, visibleEnd, WEAPONS.carbine.color);
      if (resolution.blockedByCover) {
        spawnImpactFlash(visibleEnd, 'concrete', direction.clone().multiplyScalar(-1));
        audio.impact('concrete', visibleEnd.distanceTo(player.position));
      } else if (!resolution.hitTarget) {
        audio.nearMiss(nearMissStrength(player.position, origin, visibleEnd));
      }
      audio.shot('carbine', true);
      if (resolution.hitTarget) {
        const damage = computeDamage(WEAPONS.carbine, distance, 'body') * BOT_DAMAGE_MULTIPLIER;
        applyDamage(damage, bot.id);
        if (!player.alive) {
          bot.kills += 1;
          checkMatchEnd();
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
  network.send({ type: 'melee', by: player.id, origin: origin.toArray(), direction: direction.toArray(), nonce: randomNonce() });
  const hit = castShot(origin, direction);
  if (!hit.playerId) return;
  const strike = meleeStrike(hit.distance, now, previousMeleeAt);
  if (!strike.hit) return;
  const bot = bots.get(hit.playerId);
  if (bot) applyBotDamage(bot, strike.damage, hit.hitZone ?? 'body');
}

function throwGrenade(): void {
  if (!player.alive || player.grenades <= 0 || matchState.phase !== 'active') return;
  endSpawnProtectionOnOffense(performance.now());
  player.grenades -= 1;
  weaponView.throwGrenade();
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const origin = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(direction, 0.7);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0x34413a, roughness: 0.55, metalness: 0.48 }),
  );
  mesh.position.copy(origin);
  mesh.castShadow = true;
  scene.add(mesh);
  grenades.push({
    mesh,
    velocity: direction.multiplyScalar(13).add(new THREE.Vector3(0, 5.2, 0)),
    explodeAt: performance.now() + 2_300,
    lastBounceAt: 0,
  });
}

function explodeGrenade(entity: GrenadeEntity): void {
  const point = entity.mesh.position.clone();
  scene.remove(entity.mesh);
  audio.explosion();
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xffb24c, transparent: true, opacity: 0.72 }),
  );
  flash.position.copy(point); flash.scale.setScalar(0.2); scene.add(flash);
  const light = new THREE.PointLight(0xff7b2e, 12, 18, 2); light.position.copy(point); scene.add(light);
  const started = performance.now();
  const animate = () => {
    const t = (performance.now() - started) / 420;
    if (t >= 1) { scene.remove(flash, light); return; }
    flash.scale.setScalar(0.2 + t * 5.5);
    (flash.material as THREE.MeshBasicMaterial).opacity = 0.72 * (1 - t);
    light.intensity = 12 * (1 - t);
    requestAnimationFrame(animate);
  };
  animate();
  for (const bot of bots.values()) {
    const target = bot.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const blocked = arena.colliders.some((box) => segmentIntersectsBox(point, target, box));
    const damage = blocked ? 0 : grenadeDamage(bot.position.distanceTo(point));
    if (damage > 0) applyBotDamage(bot, damage, 'body');
  }
  for (const remote of remotes.values()) {
    const target = remote.target.clone().add(new THREE.Vector3(0, 1.1, 0));
    if (arena.colliders.some((box) => segmentIntersectsBox(point, target, box))) continue;
    const damage = grenadeDamage(target.distanceTo(point));
    if (damage > 0) network.send({ type: 'hit', by: player.id, target: remote.snapshot.id, damage, kind: 'explosive', origin: point.toArray(), nonce: randomNonce() });
  }
  const selfBlocked = arena.colliders.some((box) => segmentIntersectsBox(point, player.position, box));
  const selfDamage = selfBlocked ? 0 : grenadeDamage(player.position.distanceTo(point)) * 0.35;
  if (selfDamage > 0) applyDamage(selfDamage, player.id);
}

function updateGrenades(dt: number, now: number): void {
  for (let index = grenades.length - 1; index >= 0; index -= 1) {
    const grenade = grenades[index];
    grenade.velocity.y -= 18 * dt;
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
      scene.remove(grenade.mesh);
      grenade.mesh.geometry.dispose();
      (grenade.mesh.material as THREE.Material).dispose();
      grenades.splice(index, 1);
      continue;
    }
    grenade.mesh.rotation.x += dt * 8;
    grenade.mesh.rotation.z += dt * 11;
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

function hitPracticeTarget(id: string): void {
  const target = arena.targets.find((entry) => entry.id === id);
  if (!target || !target.active) return;
  target.active = false;
  target.root.visible = false;
  target.respawnAt = performance.now() + 3200;
  targetHits += 1;
  showHitmarker();
  audio.hit();
  addFeed('+1 test mannequin', 'gold');
}

function updateTargets(now: number): void {
  for (const target of arena.targets) {
    if (gameMode === 'solo') {
      target.root.visible = false;
      continue;
    }
    if (!target.active && now >= target.respawnAt) {
      target.active = true;
      target.root.visible = true;
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

function addFeed(text: string, kind?: 'aqua' | 'coral' | 'gold'): void {
  const feed = element<HTMLElement>('#killfeed');
  const row = document.createElement('div');
  row.textContent = text;
  if (kind) row.classList.add(kind);
  feed.prepend(row);
  while (feed.children.length > 6) feed.lastElementChild?.remove();
  setTimeout(() => row.classList.add('fade'), 4200);
  setTimeout(() => row.remove(), 5000);
}

function updateFieldSupportHud(): void {
  element<HTMLElement>('#support-streak').textContent = `STREAK ${fieldSupport.streak}`;
  document.querySelectorAll<HTMLElement>('[data-support]').forEach((item) => {
    item.classList.toggle('ready', fieldSupport.available[item.dataset.support as FieldSupportId] === true);
  });
}

function awardSupportElimination(): void {
  const before = fieldSupport.available;
  fieldSupport = recordSupportElimination(fieldSupport);
  for (const [id, label] of [['scout-sweep', 'SCOUT SWEEP'], ['yardhawk', 'YARDHAWK'], ['tri-pass', 'TRI-PASS STRIKE']] as const) {
    if (!before[id] && fieldSupport.available[id]) addFeed(`${label} READY`, 'gold');
  }
  updateFieldSupportHud();
}

function supportTargetPosition(id: string): THREE.Vector3 | null {
  const bot = bots.get(id);
  if (bot?.alive) return bot.position.clone().add(new THREE.Vector3(0, 1.15, 0));
  const remote = remotes.get(id);
  if (remote && remote.snapshot.team !== player.team && remote.snapshot.hp > 0) return remote.target.clone().add(new THREE.Vector3(0, 1.15, 0));
  return null;
}

function nearestSupportTarget(): { id: string; point: THREE.Vector3 } | null {
  const candidates: { id: string; point: THREE.Vector3 }[] = [];
  for (const bot of bots.values()) if (bot.alive && bot.team !== player.team) candidates.push({ id: bot.id, point: bot.position.clone().add(new THREE.Vector3(0, 1.15, 0)) });
  for (const remote of remotes.values()) {
    if (remote.snapshot.team !== player.team && remote.snapshot.hp > 0) candidates.push({ id: remote.snapshot.id, point: remote.target.clone().add(new THREE.Vector3(0, 1.15, 0)) });
  }
  candidates.sort((a, b) => a.point.distanceToSquared(player.position) - b.point.distanceToSquared(player.position));
  return candidates[0] ?? null;
}

function makeSupportPlane(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'tri-pass-plane';
  const material = new THREE.MeshBasicMaterial({ color: 0xd5bf76 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x29393d });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 2.8), dark);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.1, 0.62), material);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.42), material); tail.position.z = 1.05;
  root.add(body, wing, tail);
  root.scale.setScalar(0.8);
  return root;
}

function supportBlast(point: THREE.Vector3, radius: number, maximumDamage: number): void {
  audio.explosion();
  const flash = new THREE.Mesh(
    new THREE.SphereGeometry(1, reducedRenderMode ? 10 : 18, reducedRenderMode ? 7 : 12),
    new THREE.MeshBasicMaterial({ color: 0xffb24c, transparent: true, opacity: 0.76, depthWrite: false }),
  );
  flash.position.copy(point); scene.add(flash);
  const started = performance.now();
  const animate = () => {
    const t = (performance.now() - started) / 460;
    if (t >= 1) { scene.remove(flash); flash.geometry.dispose(); (flash.material as THREE.Material).dispose(); return; }
    flash.scale.setScalar(0.25 + t * radius);
    (flash.material as THREE.MeshBasicMaterial).opacity = 0.76 * (1 - t);
    requestAnimationFrame(animate);
  };
  animate();
  for (const bot of bots.values()) {
    if (!bot.alive) continue;
    const target = bot.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distance = target.distanceTo(point);
    if (distance > radius || arena.colliders.some((box) => segmentIntersectsBox(point, target, box))) continue;
    applyBotDamage(bot, Math.max(1, Math.round(maximumDamage * (1 - distance / radius))), 'body');
  }
  for (const remote of remotes.values()) {
    if (remote.snapshot.team === player.team || remote.snapshot.hp <= 0) continue;
    const target = remote.target.clone().add(new THREE.Vector3(0, 1.1, 0));
    const distance = target.distanceTo(point);
    if (distance > radius || arena.colliders.some((box) => segmentIntersectsBox(point, target, box))) continue;
    network.send({ type: 'hit', by: player.id, target: remote.snapshot.id, damage: Math.min(100, Math.max(1, Math.round(maximumDamage * (1 - distance / radius)))), kind: 'explosive', origin: point.toArray(), nonce: randomNonce() });
  }
}

function activateFieldSupport(id: FieldSupportId): void {
  if (!player.alive || matchState.phase !== 'active') return;
  const consumed = consumeFieldSupport(fieldSupport, id);
  if (!consumed.activated) return;
  endSpawnProtectionOnOffense(performance.now());
  fieldSupport = consumed.state;
  const now = performance.now();
  if (id === 'scout-sweep') {
    scoutSweepUntil = now + 12_000;
    addFeed('SCOUT SWEEP ACTIVE · 12 SEC', 'gold');
  } else if (id === 'yardhawk') {
    const target = nearestSupportTarget();
    if (!target) {
      fieldSupport = { ...fieldSupport, available: { ...fieldSupport.available, yardhawk: true } };
      updateFieldSupportHud();
      return;
    }
    if (yardhawk) scene.remove(yardhawk.root);
    const root = new THREE.Group(); root.name = 'yardhawk-pursuit-drone';
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.24, 0.9), new THREE.MeshBasicMaterial({ color: 0x29393d }));
    const wings = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.08, 0.32), new THREE.MeshBasicMaterial({ color: 0xe0bd68 }));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff765f })); eye.position.z = -0.48;
    root.add(body, wings, eye);
    root.position.copy(player.position).add(new THREE.Vector3(0, 2.3, 0));
    scene.add(root);
    yardhawk = { root, targetId: target.id, expiresAt: now + 5_000 };
    addFeed('YARDHAWK LAUNCHED', 'gold');
  } else {
    const target = nearestSupportTarget();
    const base = target?.point ?? new THREE.Vector3(0, 0, 0);
    const schedule = triPassSchedule(now);
    for (let index = 0; index < schedule.length; index += 1) {
      const clamped = clampPointToBounds(new THREE.Vector3(base.x + (index - 1) * 2.4, 0.2, base.z + (index % 2 === 0 ? -1.5 : 1.5)), arena.bounds, 1);
      const targetPoint = new THREE.Vector3(clamped.x, 0.2, clamped.z);
      const plane = makeSupportPlane();
      plane.position.set(-42, 18 + index * 1.2, targetPoint.z); scene.add(plane);
      const marker = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.65, 24), new THREE.MeshBasicMaterial({ color: 0xff765f, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false }));
      marker.rotation.x = -Math.PI / 2; marker.position.copy(targetPoint); scene.add(marker);
      strikePasses.push({ plane, marker, target: targetPoint, startedAt: now, impactAt: schedule[index], resolved: false });
    }
    addFeed('TRI-PASS STRIKE INBOUND', 'gold');
  }
  updateFieldSupportHud();
}

function updateFieldSupport(dt: number, now: number): void {
  if (yardhawk) {
    const target = supportTargetPosition(yardhawk.targetId);
    if (!target || now >= yardhawk.expiresAt) {
      scene.remove(yardhawk.root); yardhawk = null;
    } else {
      const direction = target.clone().sub(yardhawk.root.position);
      const distance = direction.length();
      if (distance <= 1.1) {
        supportBlast(target, 2.6, 200);
        scene.remove(yardhawk.root); yardhawk = null;
      } else {
        yardhawk.root.position.addScaledVector(direction.normalize(), Math.min(distance, dt * 14));
        yardhawk.root.lookAt(target);
      }
    }
  }
  for (let index = strikePasses.length - 1; index >= 0; index -= 1) {
    const pass = strikePasses[index];
    const progress = THREE.MathUtils.clamp((now - pass.startedAt) / Math.max(1, pass.impactAt - pass.startedAt), 0, 1);
    pass.plane.position.x = THREE.MathUtils.lerp(-42, 42, progress);
    (pass.marker.material as THREE.MeshBasicMaterial).opacity = 0.32 + Math.sin(now * 0.018) * 0.18;
    if (!pass.resolved && now >= pass.impactAt) {
      pass.resolved = true;
      supportBlast(pass.target, 5.2, 120);
      scene.remove(pass.plane, pass.marker);
      pass.plane.traverse((node) => { if (node instanceof THREE.Mesh) { node.geometry.dispose(); (node.material as THREE.Material).dispose(); } });
      pass.marker.geometry.dispose(); (pass.marker.material as THREE.Material).dispose();
      strikePasses.splice(index, 1);
    }
  }
}

function clearGrenades(): void {
  for (const grenade of grenades) {
    scene.remove(grenade.mesh);
    grenade.mesh.geometry.dispose();
    (grenade.mesh.material as THREE.Material).dispose();
  }
  grenades.length = 0;
}

function clearFieldSupport(): void {
  if (yardhawk) scene.remove(yardhawk.root);
  yardhawk = null;
  for (const pass of strikePasses) scene.remove(pass.plane, pass.marker);
  strikePasses.length = 0;
  scoutSweepUntil = 0;
  fieldSupport = createFieldSupportState();
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
  const movement = characterPhysics.move({
    x: player.velocity.x * dt,
    y: player.velocity.y * dt,
    z: player.velocity.z * dt,
  }, dt);
  player.position.set(movement.position.x, movement.position.y, movement.position.z);
  playerGrounded = movement.grounded;
  if (playerGrounded) lastGroundedAt = now;
  if (playerGrounded && !wasGrounded && impactVelocity < -5) {
    landingImpulse = Math.min(1, Math.abs(impactVelocity) / 14);
    audio.land(Math.abs(impactVelocity));
  }
  wasGrounded = playerGrounded;
  if (movement.blockedX) player.velocity.x = movement.appliedDelta.x / Math.max(dt, 0.001);
  if (movement.blockedY && player.velocity.y < 0) player.velocity.y = 0;
  if (movement.blockedZ) player.velocity.z = movement.appliedDelta.z / Math.max(dt, 0.001);

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
  });
  for (const event of weaponActionEvents) {
    audio.weaponAction(player.weapon, event);
    weaponActionHistory.push(event);
  }
  if (weaponActionHistory.length > 16) weaponActionHistory.splice(0, weaponActionHistory.length - 16);
  camera.fov = damp(camera.fov, adsHeld ? Math.max(55, preferredFov - 20) : currentSprinting ? preferredFov + 4.5 : preferredFov, 10, dt);
  camera.updateProjectionMatrix();
  camera.position.copy(player.position);
  camera.position.y += cameraHeightOffset - landingImpulse * 0.035;
  camera.rotation.y = player.yaw + recoilCamera.yaw;
  camera.rotation.x = THREE.MathUtils.clamp(player.pitch - recoilCamera.pitch, -1.42, 1.42);
  camera.rotation.z = cameraRoll;
}

function updateRemotes(dt: number, now: number): void {
  for (const [id, remote] of remotes) {
    if (now - remote.lastSeen > 12_000) {
      removeRemote(id, 'timed out');
      continue;
    }
    const alpha = remoteInterpolationAlpha(dt);
    const remainingDistance = remote.root.position.distanceTo(remote.target);
    remote.root.position.lerp(remote.target, alpha);
    remote.root.rotation.y += shortestAngleDelta(remote.root.rotation.y, remote.targetYaw) * alpha;
    const stance = remote.snapshot.stance ?? 'stand';
    const operator = remote.root.userData.operator as THREE.Group;
    setOperatorWeapon(operator, remote.snapshot.weapon, flattenOperatorMaterials);
    poseOperator(operator, stance, remainingDistance / Math.max(dt, 0.001), now * 0.008, alpha, remote.snapshot.pitch);
  }
}

function teamScores(): [number, number] {
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

function updateMatchState(now: number): void {
  const previous = matchState.phase;
  const scores = teamScores();
  matchState = advanceMatch(matchState, now, scores);
  const presentation = matchPresentationAt(matchState, now, scores, player.team);
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
    banner.innerHTML = '<strong>ENGAGE</strong><span>First squad to 25</span>';
    banner.hidden = false;
    window.setTimeout(() => { if (matchState.phase === 'active') banner.hidden = true; }, 900);
    return;
  }
  if (matchState.phase === 'ended') {
    matchFinished = true;
    clearGrenades();
    clearFieldSupport();
    banner.innerHTML = `<strong>${presentation.headline}</strong><span>${presentation.subline} · ${presentation.objective}</span><button id="rematch" type="button">REMATCH</button>`;
    banner.hidden = false;
    const rematch = element<HTMLButtonElement>('#rematch');
    rematch.addEventListener('click', () => {
      network.close();
      resetForMode();
      startGame('solo', false);
    }, { once: true });
    document.exitPointerLock();
  }
}

function checkMatchEnd(): void {
  updateMatchState(performance.now());
}

function updateMinimap(now: number): void {
  const context = minimapContext;
  const width = minimapCanvas.width;
  const height = minimapCanvas.height;
  const bounds = arena.bounds;
  const point = (x: number, z: number): [number, number] => worldToMinimap(x, z, bounds, width, height);
  context.clearRect(0, 0, width, height);
  context.fillStyle = 'rgba(7, 15, 18, .78)';
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(244, 196, 79, .5)';
  context.lineWidth = 2;
  context.strokeRect(2, 2, width - 4, height - 4);

  const [roadLeft] = point(-10.25, 0);
  const [roadRight] = point(10.25, 0);
  context.fillStyle = 'rgba(126, 137, 132, .18)';
  context.fillRect(roadLeft, 2, roadRight - roadLeft, height - 4);
  for (const [x, z, team] of [[-11, -34, 0], [11, 34, 1]] as Array<[number, number, Team]>) {
    const [cx, cy] = point(x, z);
    const houseWidth = (16.4 / (bounds.maxX - bounds.minX)) * width;
    const houseHeight = (15 / (bounds.maxZ - bounds.minZ)) * height;
    context.fillStyle = team === 0 ? 'rgba(88, 227, 220, .2)' : 'rgba(255, 118, 95, .2)';
    context.fillRect(cx - houseWidth / 2, cy - houseHeight / 2, houseWidth, houseHeight);
  }
  for (const remote of remotes.values()) {
    const friendly = remote.snapshot.team === player.team;
    const scoutActive = now < scoutSweepUntil;
    if (!friendly && !scoutActive && remote.target.distanceTo(player.position) > 15) continue;
    const [x, y] = point(remote.target.x, remote.target.z);
    context.fillStyle = friendly ? '#58e3dc' : '#ff765f';
    context.beginPath(); context.arc(x, y, 3.5, 0, Math.PI * 2); context.fill();
  }
  for (const bot of bots.values()) {
    if (!bot.alive || now >= scoutSweepUntil && !shouldRevealEnemy(bot.position.distanceTo(player.position), now, bot.lastShotAt)) continue;
    const [x, y] = point(bot.position.x, bot.position.z);
    context.fillStyle = '#ff765f';
    context.beginPath(); context.arc(x, y, 3.5, 0, Math.PI * 2); context.fill();
  }
  const [px, py] = point(player.position.x, player.position.z);
  context.save();
  context.translate(px, py);
  context.rotate(-player.yaw);
  context.fillStyle = player.team === 0 ? '#58e3dc' : '#ff765f';
  context.beginPath(); context.moveTo(0, -7); context.lineTo(5, 6); context.lineTo(-5, 6); context.closePath(); context.fill();
  context.restore();
}

function updateHud(now: number): void {
  // DOM reconstruction and 2D minimap drawing do not need to run at render rate.
  // Keeping them at 10 Hz removes main-thread pressure without reducing simulation
  // or WebGL frame cadence.
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
  const presentation = matchPresentationAt(matchState, now, scores, player.team);
  const arenaZone = classifyArenaZone(player.position.x, player.position.z);
  element<HTMLElement>('#location-label').textContent = arenaZoneLabel(arenaZone);
  audio.setArenaZone(arenaZone);
  element<HTMLElement>('#health').textContent = String(Math.ceil(player.hp));
  element<HTMLElement>('#health-fill').style.width = `${player.hp}%`;
  element<HTMLElement>('#weapon-name').textContent = spec.name.toUpperCase();
  element<HTMLElement>('#ammo').textContent = String(player.ammo[player.weapon]);
  element<HTMLElement>('#reserve').textContent = String(player.reserve[player.weapon]);
  const aquaScore = element<HTMLElement>('#aqua-score');
  const coralScore = element<HTMLElement>('#coral-score');
  aquaScore.textContent = String(aqua);
  coralScore.textContent = String(coral);
  scores.forEach((score, team) => {
    if (score === previousHudScores[team]) return;
    const scoreElement = team === 0 ? aquaScore : coralScore;
    scoreElement.classList.remove('score-pulse');
    requestAnimationFrame(() => scoreElement.classList.add('score-pulse'));
  });
  previousHudScores = scores;
  element<HTMLElement>('#timer').textContent = presentation.timer;
  element<HTMLElement>('#objective').textContent = presentation.objective;
  if (!player.alive && respawnEndsAt > 0) {
    element<HTMLElement>('#respawn-countdown').textContent = respawnPresentation(respawnEndsAt, now);
  }
  element<HTMLElement>('#reload-state').textContent = player.reloadState
    ? `RELOADING ${Math.max(0, (player.reloadState.endsAt - now) / 1000).toFixed(1)}s`
    : gameMode === 'solo' ? `${player.kills} K / ${player.deaths} D · ${targetHits} TARGETS` : `${player.kills} K / ${player.deaths} D`;
  element<HTMLElement>('#stance').textContent = player.stance.toUpperCase();
  element<HTMLElement>('#grenades').textContent = `FRAG ×${player.grenades}`;
  updateFieldSupportHud();
  element<HTMLElement>('#health-block').classList.toggle('critical', player.hp <= 30);
  updateMinimap(now);
  if (!element<HTMLElement>('#roster').hidden) updateRoster();
}

function updateRoster(): void {
  const entries = [
    snapshot(),
    ...[...remotes.values()].map((remote) => remote.snapshot),
    ...[...bots.values()].map((bot) => ({
      id: bot.id, name: bot.name, team: bot.team, x: bot.position.x, y: bot.position.y, z: bot.position.z,
      yaw: bot.root.rotation.y, pitch: 0, hp: bot.hp, kills: bot.kills, deaths: bot.deaths, primary: 'carbine' as PrimaryWeaponId, weapon: 'carbine' as WeaponId, seq: 0,
    })),
  ].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  element<HTMLElement>('#roster-list').innerHTML = entries.map((entry) => `<div><span class="${entry.team === 0 ? 'aqua' : 'coral'}">${escapeHtml(entry.name)}</span><b>${entry.kills}</b><i>${entry.deaths}</i><em>${entry.hp > 0 ? Math.ceil(entry.hp) + ' HP' : 'DOWN'}</em></div>`).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]!);
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const launchParams = new URLSearchParams(window.location.search);
const invitedRoom = launchParams.get('room')?.trim() ?? '';
if (invitedRoom) element<HTMLInputElement>('#room-input').value = invitedRoom;
const invitedName = launchParams.get('name');
if (invitedName) element<HTMLInputElement>('#player-name').value = sanitizeName(invitedName);
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
// Compatibility remains query-only for diagnostic QA; players choose between
// the readable Performance path and the complete Quality presentation.
graphicsProfileInput.value = renderProfile === 'quality' ? 'quality' : 'performance';
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
  const selected: RenderProfile = graphicsProfileInput.value === 'quality' ? 'quality' : 'performance';
  localStorage.setItem(RENDER_PROFILE_STORAGE_KEY, selected);
  const next = new URL(window.location.href);
  if (selected === 'performance') next.searchParams.delete('render');
  else next.searchParams.set('render', selected);
  window.location.assign(next);
});

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
    if (pressed(3)) switchWeapon(player.weapon === 'pistol' ? 0 : 1);
    if (pressed(4)) throwGrenade();
    if (pressed(5)) melee();
    if (pressed(12)) activateFieldSupport('scout-sweep');
    if (pressed(14)) activateFieldSupport('yardhawk');
    if (pressed(15)) activateFieldSupport('tri-pass');
  }
  previousGamepadButtons = buttons;
}

window.addEventListener('keydown', (event) => {
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
  if (event.code === 'KeyR') reload();
  if (event.code === 'KeyV' && !event.repeat) melee();
  if (event.code === 'KeyG' && !event.repeat) throwGrenade();
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
  clearGameplayInput();
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
    if (gameStarted && player.alive && !matchFinished) {
      element<HTMLButtonElement>('#resume').hidden = matchFinished;
      menu.classList.remove('hidden');
    }
  } else {
    element<HTMLButtonElement>('#resume').hidden = true;
    menu.classList.add('hidden');
  }
});

function resetForMode(): void {
  interruptReload(true);
  player.kills = 0;
  player.deaths = 0;
  player.hp = 100;
  player.grenades = 1;
  player.reloadState = null;
  player.sustainedShots = 0;
  player.stance = 'stand';
  characterPhysics?.setStance('stand');
  targetHits = 0;
  previousHudScores = [0, 0];
  respawnEndsAt = 0;
  clearBots();
  for (const grenade of grenades) scene.remove(grenade.mesh);
  grenades.length = 0;
  clearFieldSupport();
  clearTeamPings();
  for (const id of remotes.keys()) removeRemote(id, 'cleared');
  verifiedRemoteKills.clear();
  element<HTMLElement>('#banner').hidden = true;
  element<HTMLElement>('#countdown').hidden = true;
  element<HTMLElement>('#respawn').hidden = true;
  player.primaryWeapon = fieldKitById(selectedFieldKit).weapon;
  player.weapon = player.primaryWeapon;
  player.switchingUntil = 0;
  weaponView.setWeapon(player.weapon, true);
  renderFieldKitSelection();
  player.ammo = { carbine: WEAPONS.carbine.mag, smg: WEAPONS.smg.mag, scattergun: WEAPONS.scattergun.mag, pistol: WEAPONS.pistol.mag };
  player.reserve = { carbine: WEAPONS.carbine.reserve, smg: WEAPONS.smg.reserve, scattergun: WEAPONS.scattergun.reserve, pistol: WEAPONS.pistol.reserve };
}

element<HTMLButtonElement>('#resume').addEventListener('click', () => {
  if (gameStarted && player.alive && !matchFinished) requestGamePointerLock();
});
element<HTMLButtonElement>('#solo').addEventListener('click', () => {
  network.close();
  resetForMode();
  startGame('solo');
});
element<HTMLButtonElement>('#host').addEventListener('click', () => {
  resetForMode();
  network.host(() => {
    roomCard.hidden = false;
    roomCodeEl.textContent = network.roomCode;
    startGame('host');
  });
});
element<HTMLButtonElement>('#join').addEventListener('click', () => {
  if (!teamSelectionTouched) teamSelect.value = '1';
  resetForMode();
  const code = element<HTMLInputElement>('#room-input').value.trim();
  network.join(code, () => startGame('client'));
});
element<HTMLButtonElement>('#copy-room').addEventListener('click', async () => {
  const invitedTeam = player.team === 0 ? 1 : 0;
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(network.roomCode)}&team=${invitedTeam}&autojoin=1`;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    setStatus('Invite link copied', 'ok');
  } catch {
    element<HTMLInputElement>('#room-input').value = network.roomCode;
    setStatus('Clipboard blocked — code placed in join field', 'warn');
  }
});

if (invitedRoom && launchParams.get('autojoin') === '1') {
  window.setTimeout(() => element<HTMLButtonElement>('#join').click(), 100);
}

setInterval(() => {
  if (gameStarted && network.role !== 'offline' && player.alive) network.send({ type: 'state', player: snapshot() });
}, STATE_BROADCAST_INTERVAL_MS);
window.addEventListener('beforeunload', () => {
  if (network.role !== 'offline') network.send({ type: 'leave', playerId: player.id });
  network.close();
});

function frame(now: number): void {
  try {
    const rawFrameMs = Math.max(0, now - lastFrame);
    framePacing.record(rawFrameMs);
    const adaptivePixelRatio = adaptiveQuality.record(
      rawFrameMs,
      gameStarted && menu.classList.contains('hidden') && document.visibilityState === 'visible' && !debugRenderPaused,
    );
    if (adaptivePixelRatio !== null) {
      applyAdaptiveRenderBudget(adaptivePixelRatio);
      resize();
    }
    const pacing = framePacing.summary();
    const refreshWarning = element<HTMLElement>('#refresh-warning');
    refreshWarning.hidden = !(pacing.displayLimited && now < refreshWarningUntil);
    if (pacing.displayLimited) {
      refreshWarning.querySelector('strong')!.textContent = `${Math.round(pacing.cadenceHz)} HZ PRESENTATION LIMIT`;
    }
    const frameDt = Math.min(0.05, rawFrameMs / 1000);
    lastFrame = now;
    pollGamepad(frameDt);
    accumulator += frameDt;
    const step = 1 / 120;
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
    updateFieldSupport(frameDt, now);
    updateTeamPings(now);
    impactPresentation.update(frameDt);
    tracerPool.update(frameDt);
    updateRemotes(frameDt, now);
    if (arenaArtRoot) updateArenaArt(arenaArtRoot, now);
    updateHud(now);
    if (!debugRenderPaused) {
      renderer.render(scene, camera);
      if (activeRenderConfig.shadowMode === 'static') renderer.shadowMap.needsUpdate = false;
    }
    requestAnimationFrame(frame);
  } catch (error) {
    showFatalError(error);
  }
}
const debugWindow = window as Window & {
  __ATOMIC_ACRES_DEBUG__?: {
    snapshot: () => Record<string, unknown>;
    startSolo: () => void;
    setBotsFrozen: (frozen: boolean) => void;
    placeBotAhead: (distance?: number) => void;
    damageBot: (amount: number, zone?: HitZone) => void;
    teleportPlayer: (x: number, y: number, z: number, yaw?: number, pitch?: number) => void;
    setRenderPaused: (paused: boolean) => void;
    openMenu: () => void;
    fireOnce: () => void;
    throwGrenade: () => void;
    switchWeapon: (index: number) => void;
    reload: () => void;
    melee: () => { accepted: boolean; alive: boolean; phase: string; lastMeleeAt: number };
    setAds: (held: boolean) => void;
    setMovement: (forward: boolean, sprint?: boolean) => void;
    setMeleeCaptureProgress: (progress: number | null) => void;
    setFireCaptureAgeMs: (ageMs: number | null) => void;
    setReloadCaptureProgress: (progress: number | null) => void;
    setStance: (stance: Stance) => void;
    damage: (amount: number) => void;
    earnSupport: (eliminations: number) => void;
    activateSupport: (id: FieldSupportId) => void;
    sendPing: (kind: TeamPingKind) => void;
    holdPings: (durationMs?: number) => void;
    endMatch: () => void;
    rematch: () => void;

  };
};
debugWindow.__ATOMIC_ACRES_DEBUG__ = {
  snapshot: () => ({
    gameStarted,
    gameMode,
    matchPhase: matchState.phase,
    matchEndReason: matchState.endReason ?? null,
    scores: teamScores(),
    operatorAsset: {
      ready: riggedOperatorAssetReady(),
      error: riggedOperatorLoadError,
      weaponError: importedWeaponLoadError,
    },
    player: {
      hp: player.hp,
      alive: player.alive,
      lastMeleeAt: player.lastMeleeAt,
      kills: player.kills,
      deaths: player.deaths,
      weapon: player.weapon,
      primaryWeapon: player.primaryWeapon,
      equippedWeapons: deployedWeapons(player.primaryWeapon),
      ammo: player.ammo[player.weapon],
      reserve: player.reserve[player.weapon],
      reloading: player.reloadState !== null,
      stance: player.stance,
      crouched: player.stance === 'crouch',
      prone: player.stance === 'prone',
      sprinting: currentSprinting,
      grenades: player.grenades,
      position: player.position.toArray(),
    },
    bots: [...bots.values()].map((bot) => ({
      id: bot.id,
      hp: bot.hp,
      alive: bot.alive,
      kills: bot.kills,
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
    remotes: remotes.size,
    networkSync: {
      stateIntervalMs: STATE_BROADCAST_INTERVAL_MS,
      interpolationRate: REMOTE_INTERPOLATION_RATE,
    },
    networkLifecycle: network.diagnostics(),
    remotePlayers: [...remotes.values()].map((remote) => ({
      id: remote.snapshot.id,
      hp: remote.snapshot.hp,
      primary: remote.snapshot.primary,
      weapon: remote.snapshot.weapon,
      stance: remote.snapshot.stance ?? 'stand',
      position: remote.target.toArray(),
      visualPosition: remote.root.position.toArray(),
      snapshotAgeMs: Math.max(0, performance.now() - remote.lastSeen),
      interpolationError: remote.root.position.distanceTo(remote.target),
    })),
    grenades: grenades.length,
    fieldSupport: {
      streak: fieldSupport.streak,
      available: { ...fieldSupport.available },
      scoutActive: performance.now() < scoutSweepUntil,
      yardhawkActive: yardhawk !== null,
      strikePasses: strikePasses.length,
    },
    teamPings: activeTeamPings.map((ping) => ({
      kind: ping.root.name.replace('team-ping-', ''),
      expiresInMs: Math.max(0, ping.expiresAt - performance.now()),
      position: ping.root.position.toArray(),
    })),
    activeImpactParticles: impactPresentation.activeParticles(),
    activeImpactMarks: impactPresentation.activeMarks(),
    activeTracers: tracerPool.activeCount(),
    originalArtLoaded: scene.getObjectByName('original-arena-art') !== undefined,
    arenaZone: classifyArenaZone(player.position.x, player.position.z),
    arenaStoryReady: ['route-marker-skyline-garden', 'route-marker-atom-liner-crossing', 'route-marker-solar-service']
      .every((name) => scene.getObjectByName(name) !== undefined),
    interiorTelemetry: (() => {
      const counts = { stairs: 0, beds: 0, workbenches: 0, lights: 0, visibleCollisionProxies: 0 };
      scene.traverse((node) => {
        if (node.name === 'interior-stair-tread') counts.stairs += 1;
        if (node.name === 'upper-room-bed-base') counts.beds += 1;
        if (node.name === 'upper-room-workbench') counts.workbenches += 1;
        if (node.name === 'interior-ceiling-light') counts.lights += 1;
        if (node.userData.collisionProxy === true && node.visible) counts.visibleCollisionProxies += 1;
      });
      return counts;
    })(),
    weaponReady: weaponView.isReady(),
    weaponPresentation: weaponView.presentationState(),
    weaponActionHistory: [...weaponActionHistory],
    menuVisible: !menu.classList.contains('hidden'),
    render: {
      profile: renderProfile,
      representation: activeRenderConfig.representation,
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: renderer.getDrawingBufferSize(new THREE.Vector2()).toArray(),
      antialias: renderer.getContext().getContextAttributes()?.antialias ?? false,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      sceneObjects: scene.children.length,
      reducedMode: reducedRenderMode,
      shadows: renderer.shadowMap.enabled,
      shadowAutoUpdate: renderer.shadowMap.autoUpdate,
      shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
      authoredShadows: activeRenderConfig.shadows,
      shadowMode: activeRenderConfig.shadowMode,
      framePacing: framePacing.summary(),
      adaptive: adaptiveQuality.telemetry(),
      staticBatchPalette: scene.getObjectByName('Atomic Acres arena-render-batches')?.children.map((node) => {
        const material = node instanceof THREE.Mesh ? node.material : null;
        return !Array.isArray(material) && material && 'color' in material
          ? (material as THREE.MeshBasicMaterial).color.getHexString()
          : null;
      }) ?? [],
    },
  }),
  startSolo: () => {
    network.close();
    resetForMode();
    startGame('solo', false);
  },
  setBotsFrozen: (frozen: boolean) => { botsFrozen = frozen; },
  placeBotAhead: (distance = 5) => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (!bot) return;
    const forward = new THREE.Vector3(Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    bot.position.set(player.position.x, 0, player.position.z).addScaledVector(forward, THREE.MathUtils.clamp(distance, 2.5, 9));
    bot.root.position.copy(bot.position);
    bot.velocity.set(0, 0, 0);
    bot.root.rotation.y = player.yaw;
  },
  damageBot: (amount, zone = 'body') => {
    const bot = bots.values().next().value as BotPlayer | undefined;
    if (!bot || !Number.isFinite(amount) || amount <= 0) return;
    bot.invulnerableUntil = 0;
    applyBotDamage(bot, amount, zone);
  },
  teleportPlayer: (x, y, z, yaw = player.yaw, pitch = player.pitch) => {
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return;
    player.position.set(x, y, z);
    characterPhysics?.teleportEye(player.position);
    player.velocity.set(0, 0, 0);
    player.yaw = yaw;
    player.pitch = THREE.MathUtils.clamp(pitch, -1.5, 1.5);
    player.invulnerableUntil = 0;
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
  earnSupport: (eliminations: number) => {
    for (let index = 0; index < Math.max(0, Math.min(7, Math.floor(eliminations))); index += 1) awardSupportElimination();
  },
  activateSupport: (id: FieldSupportId) => activateFieldSupport(id),
  sendPing: (kind: TeamPingKind) => sendTeamPing(kind),
  holdPings: (durationMs = 30_000) => {
    const expiresAt = performance.now() + Math.max(0, Math.min(60_000, durationMs));
    for (const ping of activeTeamPings) ping.expiresAt = expiresAt;
  },
  endMatch: () => {
    player.kills = 25;
    updateMatchState(performance.now());
  },
  rematch: () => {
    network.close();
    resetForMode();
    startGame('solo', false);
  },

};

function liftCrushedEnvironmentBlacks(root: THREE.Object3D, excluded: THREE.Object3D): void {
  const adjusted = new Set<THREE.Material>();
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh) || excluded.getObjectById(node.id)) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (adjusted.has(material) || !(material instanceof THREE.MeshStandardMaterial)) continue;
      adjusted.add(material);
      const { r, g, b } = material.color;
      if (Math.max(r, g, b) < 0.16) material.color.lerp(new THREE.Color(0x5b6664), 0.24);
    }
  });
}

async function bootstrap(): Promise<void> {
  const soloButton = element<HTMLButtonElement>('#solo');
  const hostButton = element<HTMLButtonElement>('#host');
  const joinButton = element<HTMLButtonElement>('#join');
  soloButton.disabled = true;
  hostButton.disabled = true;
  joinButton.disabled = true;
  setStatus('Loading authored arena art, weapons and advanced collision…');

  const physicsPromise = CharacterPhysics.create(arena.colliders, arena.bounds);
  const weaponPromise = weaponView.load((loaded, total) => {
    setStatus(`Loading authored weapons ${loaded}/${total}…`);
  });
  const artPromise = loadArenaArt(scene, (loaded, total) => {
    setStatus(`Loading authored arena models ${loaded}/${total}…`);
  }, reducedWorldDetail);
  const [physics, , art] = await Promise.all([physicsPromise, weaponPromise, artPromise]);
  characterPhysics = physics;
  arenaArtRoot = art.root;
  const visibleMapMeshes = arena.raycastMeshes.filter((mesh) => mesh.visible || mesh.userData.collisionProxy === true);
  arena.raycastMeshes.splice(0, arena.raycastMeshes.length, ...visibleMapMeshes);
  art.root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.userData.blocksShots === true) arena.raycastMeshes.push(node);
  });
  const arenaRoot = scene.getObjectByName('Atomic Acres arena');
  if (arenaRoot) batchStaticMeshes(arenaRoot, scene, () => '', staticMaterialMode);
  const decorativeMaterialMode = staticMaterialMode === 'texture-lit' ? 'palette-lit' : staticMaterialMode;
  batchStaticMeshes(art.root, scene, () => '', decorativeMaterialMode);
  if (activeRenderConfig.shadowMode === 'static') renderer.shadowMap.needsUpdate = true;
  liftCrushedEnvironmentBlacks(scene, weaponView.root);
  weaponView.setWeapon(player.weapon, true);
  respawn();
  weaponView.root.visible = false;
  camera.position.set(0, 30, -22);
  camera.lookAt(0, 0.8, 4);
  camera.fov = 65;
  camera.updateProjectionMatrix();

  soloButton.disabled = false;
  hostButton.disabled = !webRtcSupported;
  joinButton.disabled = !webRtcSupported;
  setStatus('Pass 17 refinement candidate — cohesive presentation, authored architecture and synchronized combat.');
  requestAnimationFrame(frame);
}

void bootstrap().catch(showFatalError);
