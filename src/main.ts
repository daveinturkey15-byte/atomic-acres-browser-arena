import * as THREE from 'three';
import './style.css';
import { batchStaticMeshes, buildOperator } from './art-kit';
import { chooseBotIntent, respawnBotState } from './bot-ai';
import { ArenaAudio } from './audio';
import { damp, resolveHorizontalMove, segmentIntersectsBox, shortestAngleDelta, sweepSphereAgainstBoxes } from './collision';
import {
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
  integrateHorizontalVelocity,
  meleeStrike,
  mouseSensitivityMultiplier,
  movementProfile,
  recoverRecoil,
  recoverRecoilImpulse,
  sampleSpreadDisk,
  sprintEligible,
  type HitZone,
  type MatchState,
  type ReloadState,
} from './gameplay';
import { ArenaMap, buildArena } from './map';
import { shouldRevealEnemy, worldToMinimap } from './minimap';
import { loadArenaArt } from './environment-assets';
import { ArenaNetwork } from './network';
import { CharacterPhysics } from './physics';
import { WeaponPresentation } from './weapon-presentation';
import {
  DeathMessage,
  GameMessage,
  PlayerSnapshot,
  ShotMessage,
  Team,
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
  waypoint: number;
};

type GrenadeEntity = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  explodeAt: number;
  lastBounceAt: number;
};

const WEAPON_ORDER: WeaponId[] = ['carbine', 'smg', 'scattergun'];
const BOT_PATROL_POINTS = [
  new THREE.Vector3(-25, 0, -12), new THREE.Vector3(-18, 0, 15),
  new THREE.Vector3(-4, 0, 24), new THREE.Vector3(8, 0, 15),
  new THREE.Vector3(24, 0, 8), new THREE.Vector3(19, 0, -18),
  new THREE.Vector3(2, 0, -24), new THREE.Vector3(-12, 0, -17),
];

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
    <div class="eyebrow">ORIGINAL WEB ARENA · COMBAT FEEL PASS 02</div>
    <h1>ATOMIC <span>ACRES</span></h1>
    <p class="lede">A close-quarters retro-future skirmish with spring-tuned movement, layered weapon handling, tactical bots and peer-to-peer multiplayer.</p>
    <div class="setup-grid">
      <label>CALLSIGN<input id="player-name" maxlength="16" autocomplete="nickname" value="Player${Math.floor(Math.random() * 900 + 100)}"></label>
      <label>SQUAD<select id="team"><option value="0">Aqua</option><option value="1">Coral</option></select></label>
    </div>
    <div class="menu-actions">
      <button id="resume" class="primary" hidden>RETURN TO MATCH</button>
      <button id="solo" class="primary">BOT SKIRMISH</button>
      <button id="host">HOST LOBBY</button>
    </div>
    <div class="join-row"><input id="room-input" placeholder="Paste room code" autocomplete="off"><button id="join">JOIN</button></div>
    <div id="room-card" hidden><span>ROOM CODE</span><strong id="room-code"></strong><button id="copy-room" class="small-button">COPY</button></div>
    <div id="network-status" data-kind="ok">Ready for deployment.</div>
    <div class="settings-grid">
      <label>SENSITIVITY<input id="sensitivity" type="range" min="0.6" max="2" step="0.05" value="1"></label>
      <label>FIELD OF VIEW<input id="field-of-view" type="range" min="70" max="100" step="1" value="82"></label>
    </div>
    <div class="controls"><b>WASD</b> move · <b>SHIFT</b> sprint · <b>C</b> crouch · <b>SPACE</b> jump · <b>RMB</b> ADS · <b>LMB</b> fire · <b>R</b> reload · <b>V</b> melee · <b>G</b> frag · <b>1–3</b> weapons · <b>TAB</b> roster<br><b>PAD</b> left stick move · right stick aim · <b>LT/RT</b> ADS/fire · <b>A</b> jump · <b>B</b> crouch · <b>X</b> reload · <b>Y</b> switch</div>
    <p class="legal">Fan-made original arena. No Activision assets, branding, code or ripped map geometry. Keyboard/mouse and standard gamepads supported.</p>
  </section>
  <div id="hud" hidden>
    <header id="matchbar"><div><span class="tiny">TEAM DEATHMATCH</span><strong id="timer">05:00</strong></div><div id="scoreline"><span class="aqua">AQUA <b id="aqua-score">0</b></span><i>25</i><span class="coral"><b id="coral-score">0</b> CORAL</span></div><div id="connection-pill">SOLO</div></header>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hitmarker">×</div>
    <div id="killfeed"></div>
    <div id="objective">ATOMIC ACRES · FIRST TO 25</div>
    <canvas id="minimap" width="180" height="180" aria-label="Tactical minimap"></canvas>
    <div id="health-block"><div><span>VITALS</span><b id="health">100</b></div><div class="health-track"><i id="health-fill"></i></div></div>
    <div id="weapon-block"><span id="weapon-name">M86 CARBINE</span><div><b id="ammo">30</b><i>/</i><em id="reserve">120</em></div><small id="reload-state"></small></div>
    <div id="equipment-block"><span id="stance">STANDING</span><b id="grenades">FRAG ×1</b><small>V MELEE · G THROW</small></div>
    <div id="room-hud"></div>
    <div id="respawn" hidden><strong>ELIMINATED</strong><span>Reconstituting mannequin operator…</span></div>
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

const reducedRenderMode = new URLSearchParams(window.location.search).get('render') === 'compat';
document.documentElement.classList.toggle('compat-render', reducedRenderMode);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !reducedRenderMode, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = !reducedRenderMode;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.setPixelRatio(reducedRenderMode ? 0.25 : Math.min(window.devicePixelRatio, 1.75));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xaec2c7, 62, 128);
const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);
camera.rotation.order = 'YXZ';
scene.add(camera);

function buildSky(): void {
  const geometry = new THREE.SphereGeometry(150, 32, 18);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2c668d) },
      horizon: { value: new THREE.Color(0xabcbd1) },
      bottom: { value: new THREE.Color(0xd8d3b6) },
    },
    vertexShader: 'varying vec3 worldPos; void main(){ worldPos=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 worldPos; uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; void main(){ float h=normalize(worldPos).y; vec3 c=h>0.0?mix(horizon,top,smoothstep(0.0,.75,h)):mix(horizon,bottom,smoothstep(0.0,-.35,h)); gl_FragColor=vec4(c,1.0); }',
  });
  scene.add(new THREE.Mesh(geometry, material));
  scene.add(new THREE.HemisphereLight(0xd9efff, 0x52664b, 1.7));
  scene.add(new THREE.AmbientLight(0xc8d5d9, 0.62));
  const sun = new THREE.DirectionalLight(0xffe1b5, 2.55);
  sun.position.set(-32, 68, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -48;
  sun.shadow.camera.right = 48;
  sun.shadow.camera.top = 54;
  sun.shadow.camera.bottom = -54;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 150;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
}
buildSky();
const arena: ArenaMap = buildArena(scene);

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
  ammo: { carbine: WEAPONS.carbine.mag, smg: WEAPONS.smg.mag, scattergun: WEAPONS.scattergun.mag } as Record<WeaponId, number>,
  reserve: { carbine: WEAPONS.carbine.reserve, smg: WEAPONS.smg.reserve, scattergun: WEAPONS.scattergun.reserve } as Record<WeaponId, number>,
  reloadState: null as ReloadState | null,
  switchingUntil: 0,
  lastShotAt: 0,
  nextShotAt: 0,
  sustainedShots: 0,
  crouched: false,
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
const processedNonces = new Set<number>();
let gameStarted = false;
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
let lastGroundedAt = 0;
let jumpQueuedAt = -10_000;
let lastDamageAt = -10_000;
let lastFootstepAt = 0;
let lastFrame = performance.now();
let lastHudAt = 0;
let debugRenderPaused = new URLSearchParams(window.location.search).get('renderPaused') === '1';
let matchState: MatchState = createMatch(performance.now());
let matchFinished = false;
let adsHeld = false;
let mouseTriggerHeld = false;
let mouseAdsHeld = false;
let gamepadMove = { x: 0, y: 0 };
let gamepadSprint = false;
let gamepadCrouch = false;
let previousGamepadButtons: boolean[] = [];
let playerGrounded = false;
let wasGrounded = false;
let sensitivity = 1;
let preferredFov = 82;
let botsFrozen = false;
let debugInputUnlocked = false;
let debugAdsOverride: boolean | null = null;
let characterPhysics: CharacterPhysics | null = null;

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
const viewFill = new THREE.PointLight(0xd8ecff, 0.9, 5);
viewFill.position.set(0, 0.4, 0.2);
camera.add(viewFill);

function createRemote(snapshot: PlayerSnapshot): RemotePlayer {
  const root = buildOperator(snapshot.team, 'remote-player', reducedRenderMode);
  root.userData.playerId = snapshot.id;
  root.traverse((child) => {
    child.userData.playerId = snapshot.id;
    child.userData.targetRoot = root;
  });

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
  sprite.visible = snapshot.team === player.team;
  sprite.position.y = 2.5;
  sprite.scale.set(2.4, 0.6, 1);
  root.add(sprite);

  root.position.set(snapshot.x, snapshot.y - 1.7, snapshot.z);
  scene.add(root);
  return { root, snapshot, target: new THREE.Vector3(snapshot.x, snapshot.y - 1.7, snapshot.z), targetYaw: snapshot.yaw, lastSeen: performance.now() };
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
    weapon: player.weapon,
    seq: ++player.seq,
  };
}

function onNetworkMessage(message: GameMessage): void {
  if (message.type === 'join' || message.type === 'state') {
    const incoming = message.player;
    if (incoming.id === player.id) return;
    let remote = remotes.get(incoming.id);
    if (!remote) {
      remote = createRemote(incoming);
      remotes.set(incoming.id, remote);
      addFeed(`${incoming.name} entered the test block`, incoming.team === 0 ? 'aqua' : 'coral');
      if (message.type === 'join') network.send({ type: 'state', player: snapshot() });
    }
    if (incoming.seq >= remote.snapshot.seq) {
      remote.snapshot = incoming;
      remote.target.set(incoming.x, incoming.y - 1.7, incoming.z);
      remote.targetYaw = incoming.yaw;
      remote.lastSeen = performance.now();
      remote.root.visible = incoming.hp > 0;
    }
    return;
  }
  if (message.type === 'shot') {
    if (message.by !== player.id) renderRemoteShot(message);
    return;
  }
  if (message.type === 'hit' && message.target === player.id && !processedNonces.has(message.nonce)) {
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
  const direction = new THREE.Vector3(...message.direction).normalize();
  spawnTracer(origin, direction, 50, WEAPONS[message.weapon].color);
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
    player.alive = false;
    player.deaths += 1;
    const death: DeathMessage = { type: 'death', killer: attacker, victim: player.id, nonce: randomNonce() };
    network.send(death);
    processDeath(death);
    element<HTMLElement>('#respawn').hidden = false;
    document.exitPointerLock();
    setTimeout(respawn, 1900);
  }
}

function processDeath(message: DeathMessage): void {
  const killer = message.killer === player.id ? player.name : remotes.get(message.killer)?.snapshot.name ?? bots.get(message.killer)?.name ?? 'Unknown';
  const victim = message.victim === player.id ? player.name : remotes.get(message.victim)?.snapshot.name ?? bots.get(message.victim)?.name ?? 'Unknown';
  if (message.killer === player.id && message.victim !== player.id) {
    player.kills += 1;
    audio.kill();
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
  addFeed(`${remote.snapshot.name} ${reason}`);
}

function spawnPoint(): THREE.Vector3 {
  const options = arena.spawns[player.team];
  const remotePositions = [...remotes.values()].map((remote) => remote.target);
  const scored = options.map((point) => ({
    point,
    distance: remotePositions.length ? Math.min(...remotePositions.map((remote) => remote.distanceToSquared(point))) : Infinity,
  }));
  scored.sort((a, b) => b.distance - a.distance);
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

function respawn(requestLock = true): void {
  player.position.copy(spawnPoint());
  characterPhysics?.teleportEye(player.position);
  player.velocity.set(0, 0, 0);
  player.hp = 100;
  lastDamageAt = -10_000;
  player.grenades = 1;
  player.reloadState = null;
  player.crouched = false;
  player.alive = true;
  player.invulnerableUntil = performance.now() + 1350;
  player.yaw = player.team === 0 ? Math.PI : 0;
  player.pitch = 0;
  recoilCamera = { pitch: 0, yaw: 0 };
  cameraHeightOffset = 0;
  cameraRoll = 0;
  jumpQueuedAt = -10_000;
  element<HTMLElement>('#respawn').hidden = true;
  if (gameStarted && requestLock) requestGamePointerLock();
  network.send({ type: 'state', player: snapshot() });
}

function startGame(mode: 'solo' | 'host' | 'client', requestLock = true): void {
  player.name = sanitizeName(element<HTMLInputElement>('#player-name').value);
  player.team = Number(element<HTMLSelectElement>('#team').value) === 1 ? 1 : 0;
  gameStarted = true;
  weaponView.root.visible = true;
  gameMode = mode;
  botsFrozen = false;
  matchState = createMatch(performance.now());
  matchFinished = false;
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

function switchWeapon(index: number): void {
  const id = WEAPON_ORDER[index];
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
  audio.reload();
  weaponView.reload(spec.reload);
  addFeed(`Reloading ${spec.name}`);
}

function finishReload(now: number): void {
  if (!player.reloadState) return;
  const state = completeReloadState(player.reloadState, now, player.ammo[player.weapon], player.reserve[player.weapon]);
  if (state.completed) {
    player.ammo[player.weapon] = state.ammo;
    player.reserve[player.weapon] = state.reserve;
    player.reloadState = null;
  }
}

function tryFire(now: number): void {
  if (!player.alive || !gameStarted || (!debugInputUnlocked && document.pointerLockElement !== canvas) || matchState.phase !== 'active') return;
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
  const spread = computeSpread(spec, {
    ads: adsHeld,
    moving,
    crouched: player.crouched,
    sustainedShots: player.sustainedShots,
  });
  const hitDamage = new Map<string, { damage: number; zone: HitZone }>();
  const cameraRight = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  for (let pellet = 0; pellet < spec.pellets; pellet += 1) {
    const sample = sampleSpreadDisk(spread, Math.random(), Math.random());
    const direction = baseDirection.clone()
      .addScaledVector(cameraRight, sample.x)
      .addScaledVector(cameraUp, sample.y)
      .normalize();
    const result = castShot(origin, direction);
    spawnTracer(origin, direction, result.distance, spec.color);
    if (!result.playerId && !result.targetId && result.distance < 89) {
      spawnImpactFlash(origin.clone().addScaledVector(direction, result.distance));
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
        const nonce = randomNonce();
        network.send({ type: 'hit', by: player.id, target, damage: Math.min(100, hit.damage), nonce });
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

function castShot(origin: THREE.Vector3, direction: THREE.Vector3): { distance: number; playerId?: string; targetId?: string; hitZone?: HitZone } {
  const ray = new THREE.Raycaster(origin, direction, 0.1, 110);
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
  while (node) {
    playerId ??= node.userData.playerId as string | undefined;
    targetId ??= node.userData.targetId as string | undefined;
    hitZone ??= node.userData.hitZone as HitZone | undefined;
    node = node.parent;
  }
  const targetRoot = first.object.userData.targetRoot as THREE.Group | undefined;
  targetId ??= targetRoot?.userData.targetId as string | undefined;
  return { distance: Math.min(first.distance, 110), playerId, targetId, hitZone };
}

function spawnBots(): void {
  clearBots();
  const botTeam: Team = player.team === 0 ? 1 : 0;
  const names = ['RIVET', 'MABEL', 'BOLT', 'TANGO'];
  const spawnOptions = arena.spawns[botTeam];
  names.forEach((name, index) => {
    const id = `bot-${index}`;
    const root = buildOperator(botTeam, 'bot-operator', reducedRenderMode);
    root.userData.playerId = id;
    root.traverse((node) => {
      node.userData.playerId = id;
      node.userData.targetRoot = root;
    });
    const spawn = spawnOptions[index % spawnOptions.length];
    const position = new THREE.Vector3(spawn.x, spawn.y - 1.7, spawn.z);
    root.position.copy(position);
    scene.add(root);
    bots.set(id, {
      id, name, team: botTeam, root, position, velocity: new THREE.Vector3(), hp: 100, alive: true,
      kills: 0, deaths: 0, lastShotAt: 0, lastSightAt: 0, hasLineOfSight: false,
      sightStartedAt: 0, burstShots: 0, nextDecisionAt: 0, strafeSign: index % 2 === 0 ? 1 : -1,
      invulnerableUntil: performance.now() + 1_000, respawnAt: 0, waypoint: index,
    });
  });
  addFeed('Four hostile operators entered the block', 'coral');
}

function clearBots(): void {
  for (const bot of bots.values()) scene.remove(bot.root);
  bots.clear();
}

function botHasLineOfSight(bot: BotPlayer): boolean {
  const origin = { x: bot.position.x, y: bot.position.y + 1.65, z: bot.position.z };
  const target = { x: player.position.x, y: player.position.y, z: player.position.z };
  return !arena.colliders.some((box) => segmentIntersectsBox(origin, target, box));
}

function applyBotDamage(bot: BotPlayer, damage: number, zone: HitZone): void {
  const now = performance.now();
  if (!bot.alive || now < bot.invulnerableUntil) return;
  bot.hp = Math.max(0, bot.hp - damage);
  showHitmarker(zone === 'head');
  audio.hit(zone === 'head');
  if (bot.hp > 0) return;
  bot.alive = false;
  bot.deaths += 1;
  bot.respawnAt = now + 2_200;
  bot.root.visible = false;
  player.kills += 1;
  audio.kill();
  addFeed(`${player.name} eliminated ${bot.name}${zone === 'head' ? ' · HEADSHOT' : ''}`, 'gold');
  checkMatchEnd();
}

function respawnBot(bot: BotPlayer, now: number): void {
  const state = respawnBotState(now);
  const spawns = arena.spawns[bot.team];
  const spawn = spawns[(bot.deaths + bot.waypoint) % spawns.length];
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
  bot.root.visible = true;
}

function updateBots(dt: number, now: number): void {
  if (gameMode !== 'solo' || matchState.phase !== 'active' || botsFrozen) return;
  let botIndex = 0;
  for (const bot of bots.values()) {
    botIndex += 1;
    if (!bot.alive) {
      if (now >= bot.respawnAt && !matchFinished) respawnBot(bot, now);
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
        bot.sightStartedAt = 0;
        bot.burstShots = 0;
      }
    }
    const lineOfSight = bot.hasLineOfSight;
    if (now >= bot.nextDecisionAt) {
      bot.strafeSign = bot.strafeSign === 1 ? -1 : 1;
      bot.nextDecisionAt = now + 850 + botIndex * 95;
    }

    const patrolTarget = BOT_PATROL_POINTS[bot.waypoint % BOT_PATROL_POINTS.length];
    const toPatrol = patrolTarget.clone().sub(bot.position).setY(0);
    const waypointReached = toPatrol.lengthSq() < 5.2;
    if (waypointReached) bot.waypoint = (bot.waypoint + 1 + botIndex) % BOT_PATROL_POINTS.length;
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
      reactionDelay: 210 + botIndex * 45,
      burstShotsRemaining: bot.burstShots,
    });

    const pursuit = lineOfSight ? toPlayer : toPatrol;
    const forward = pursuit.lengthSq() > 0.01 ? pursuit.normalize() : new THREE.Vector3(0, 0, -1);
    const side = new THREE.Vector3(-forward.z, 0, forward.x);
    const desiredDirection = intent.movement === 'advance' ? forward
      : intent.movement === 'retreat' ? forward.clone().multiplyScalar(-1)
        : intent.movement === 'strafe-left' ? side.clone().multiplyScalar(-1)
          : intent.movement === 'strafe-right' ? side : new THREE.Vector3();
    const speed = intent.movement.startsWith('strafe') ? 3.5 : lineOfSight ? 4.05 : 4.45;
    const desired = bot.position.clone().addScaledVector(desiredDirection, speed * dt);
    let resolved = resolveHorizontalMove(bot.position, desired, arena.colliders, arena.bounds, 0.44);
    if (Math.hypot(resolved.x - bot.position.x, resolved.z - bot.position.z) < 0.002 && desiredDirection.lengthSq() > 0) {
      const detour = bot.position.clone().addScaledVector(side, bot.strafeSign * speed * dt * 1.5);
      resolved = resolveHorizontalMove(bot.position, detour, arena.colliders, arena.bounds, 0.44);
      bot.waypoint = (bot.waypoint + 1) % BOT_PATROL_POINTS.length;
    }
    bot.position.set(resolved.x, bot.position.y, resolved.z);
    bot.root.position.copy(bot.position);
    const lookTarget = lineOfSight ? player.position : patrolTarget;
    bot.root.lookAt(lookTarget.x, bot.position.y + 1.1, lookTarget.z);

    if (intent.fire && player.alive) {
      if (bot.burstShots <= 0) bot.burstShots = 2 + (botIndex % 2);
      bot.burstShots -= 1;
      bot.lastShotAt = now;
      const origin = bot.position.clone().add(new THREE.Vector3(0, 1.42, 0));
      const direction = player.position.clone().sub(origin).normalize();
      const matchAccuracy = THREE.MathUtils.lerp(0.038, 0.014, Math.min(1, (now - matchState.phaseStartedAt) / 120_000));
      const jitter = matchAccuracy + bot.burstShots * 0.004;
      direction.x += (Math.random() - 0.5) * jitter;
      direction.y += (Math.random() - 0.5) * jitter;
      direction.z += (Math.random() - 0.5) * jitter;
      direction.normalize();
      spawnTracer(origin, direction, Math.min(distance, 75), WEAPONS.carbine.color);
      audio.shot('carbine', true);
      const rayToPlayer = new THREE.Ray(origin, direction);
      const closest = rayToPlayer.closestPointToPoint(player.position, new THREE.Vector3());
      if (closest.distanceTo(player.position) < 0.55 && lineOfSight) {
        const damage = computeDamage(WEAPONS.carbine, distance, 'body') * 0.62;
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
  if (!meleeStrike(2, now, player.lastMeleeAt).hit || !player.alive || matchState.phase !== 'active') return;
  player.lastMeleeAt = now;
  weaponView.melee();
  audio.melee();
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const hit = castShot(origin, direction);
  if (!hit.playerId || hit.distance > 2.25) return;
  const bot = bots.get(hit.playerId);
  if (bot) applyBotDamage(bot, 70, hit.hitZone ?? 'body');
  else if (remotes.has(hit.playerId)) network.send({ type: 'hit', by: player.id, target: hit.playerId, damage: 70, nonce: randomNonce() });
}

function throwGrenade(): void {
  if (!player.alive || player.grenades <= 0 || matchState.phase !== 'active') return;
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
    if (damage > 0) network.send({ type: 'hit', by: player.id, target: remote.snapshot.id, damage, nonce: randomNonce() });
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

function spawnImpactFlash(point: THREE.Vector3): void {
  const material = new THREE.MeshBasicMaterial({ color: 0xffdda0, transparent: true, opacity: 0.9, depthWrite: false });
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.075, 0), material);
  flash.position.copy(point);
  flash.scale.set(1, 0.55, 1);
  scene.add(flash);
  window.setTimeout(() => {
    scene.remove(flash);
    flash.geometry.dispose();
    material.dispose();
  }, 72);
}

function spawnTracer(origin: THREE.Vector3, direction: THREE.Vector3, distance: number, color: number): void {
  const geometry = new THREE.BufferGeometry().setFromPoints([origin.clone(), origin.clone().addScaledVector(direction, distance)]);
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.72 }));
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, 55);
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

function updatePhysics(dt: number): void {
  if (!gameStarted || !player.alive || matchState.phase === 'ended' || !characterPhysics) return;
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const forwardInput = THREE.MathUtils.clamp(Number(keys.has('KeyW')) - Number(keys.has('KeyS')) - gamepadMove.y, -1, 1);
  const strafeInput = THREE.MathUtils.clamp(Number(keys.has('KeyD')) - Number(keys.has('KeyA')) + gamepadMove.x, -1, 1);
  const input = forward.clone().multiplyScalar(forwardInput).addScaledVector(right, strafeInput);
  if (input.lengthSq() > 1) input.normalize();
  const now = performance.now();
  player.crouched = (keys.has('KeyC') || gamepadCrouch) && playerGrounded;
  currentSprinting = (keys.has('ShiftLeft') || gamepadSprint) && input.lengthSq() > 0 && playerGrounded
    && !triggerHeld && !player.reloadState && now >= player.switchingUntil && now - player.lastMeleeAt > 500
    && sprintEligible(forwardInput, strafeInput, adsHeld, player.crouched);
  const profile = movementProfile({ crouched: player.crouched, ads: adsHeld, sprinting: currentSprinting, grounded: playerGrounded });
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
  if (jumpBuffered && coyoteGrounded && !adsHeld && !player.crouched && matchState.phase === 'active') {
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
  if (moving && now - lastFootstepAt >= (currentSprinting ? 300 : player.crouched ? 575 : 405)) {
    lastFootstepAt = now;
    audio.footstep(currentSprinting, player.crouched);
  }
  weaponBob += dt * (currentSprinting ? 15 : player.crouched ? 7 : 10) * (moving ? 1 : 0.25);
  recoilVisual = recoverRecoil(recoilVisual, WEAPONS[player.weapon], dt);
  recoilCamera = recoverRecoilImpulse(recoilCamera, WEAPONS[player.weapon], dt);
  landingImpulse = damp(landingImpulse, 0, 10, dt);
  cameraHeightOffset = damp(cameraHeightOffset, player.crouched ? -0.54 : 0, 15, dt);
  const lateralSpeed = player.velocity.dot(right) / Math.max(1, profile.maxSpeed);
  cameraRoll = damp(cameraRoll, -lateralSpeed * (adsHeld ? 0.006 : 0.016), 11, dt);
  weaponView.update({
    dt,
    moving,
    sprinting: currentSprinting,
    crouched: player.crouched,
    ads: adsHeld,
    phase: weaponBob,
    landingImpulse,
    lateralSpeed,
  });
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
    const alpha = 1 - Math.exp(-13 * dt);
    remote.root.position.lerp(remote.target, alpha);
    remote.root.rotation.y += shortestAngleDelta(remote.root.rotation.y, remote.targetYaw) * alpha;
  }
}

function teamScores(): [number, number] {
  let aqua = player.team === 0 ? player.kills : 0;
  let coral = player.team === 1 ? player.kills : 0;
  for (const remote of remotes.values()) {
    if (remote.snapshot.team === 0) aqua += remote.snapshot.kills;
    else coral += remote.snapshot.kills;
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
    const won = matchState.winner === player.team;
    const draw = matchState.winner === 'draw';
    banner.innerHTML = `<strong>${draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT'}</strong><span>${scores[0]} — ${scores[1]} · CLICK BOT SKIRMISH FOR REMATCH</span>`;
    banner.hidden = false;
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
    if (!friendly && remote.target.distanceTo(player.position) > 15) continue;
    const [x, y] = point(remote.target.x, remote.target.z);
    context.fillStyle = friendly ? '#58e3dc' : '#ff765f';
    context.beginPath(); context.arc(x, y, 3.5, 0, Math.PI * 2); context.fill();
  }
  for (const bot of bots.values()) {
    if (!bot.alive || !shouldRevealEnemy(bot.position.distanceTo(player.position), now, bot.lastShotAt)) continue;
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
  const spread = computeSpread(spec, {
    ads: adsHeld,
    moving: speed > 1.2,
    crouched: player.crouched,
    sustainedShots: player.sustainedShots,
  });
  const crosshairGap = THREE.MathUtils.clamp(5 + spread * 320, 5, 23);
  const crosshair = element<HTMLElement>('#crosshair');
  crosshair.style.setProperty('--spread', `${crosshairGap}px`);
  crosshair.classList.toggle('ads', adsHeld);
  const [aqua, coral] = teamScores();
  element<HTMLElement>('#health').textContent = String(Math.ceil(player.hp));
  element<HTMLElement>('#health-fill').style.width = `${player.hp}%`;
  element<HTMLElement>('#weapon-name').textContent = spec.name.toUpperCase();
  element<HTMLElement>('#ammo').textContent = String(player.ammo[player.weapon]);
  element<HTMLElement>('#reserve').textContent = String(player.reserve[player.weapon]);
  element<HTMLElement>('#aqua-score').textContent = String(aqua);
  element<HTMLElement>('#coral-score').textContent = String(coral);
  const remainingMs = Math.max(0, matchState.endsAt - now);
  const remaining = matchState.phase === 'warmup' ? Math.ceil(remainingMs / 1000) : Math.floor(remainingMs / 1000);
  element<HTMLElement>('#timer').textContent = matchState.phase === 'warmup'
    ? `00:0${Math.min(9, remaining)}`
    : `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  element<HTMLElement>('#objective').textContent = matchState.phase === 'warmup' ? `MATCH STARTS IN ${remaining}` : 'ATOMIC ACRES · FIRST TO 25';
  element<HTMLElement>('#reload-state').textContent = player.reloadState
    ? `RELOADING ${Math.max(0, (player.reloadState.endsAt - now) / 1000).toFixed(1)}s`
    : gameMode === 'solo' ? `${player.kills} K / ${player.deaths} D · ${targetHits} TARGETS` : `${player.kills} K / ${player.deaths} D`;
  element<HTMLElement>('#stance').textContent = player.crouched ? 'CROUCHED' : 'STANDING';
  element<HTMLElement>('#grenades').textContent = `FRAG ×${player.grenades}`;
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
      yaw: bot.root.rotation.y, pitch: 0, hp: bot.hp, kills: bot.kills, deaths: bot.deaths, weapon: 'carbine' as WeaponId, seq: 0,
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
if (launchParams.get('team') === '1') element<HTMLSelectElement>('#team').value = '1';

const sensitivityInput = element<HTMLInputElement>('#sensitivity');
const fovInput = element<HTMLInputElement>('#field-of-view');
sensitivity = Number(localStorage.getItem('atomic-acres-sensitivity') ?? sensitivityInput.value) || 1;
preferredFov = Number(localStorage.getItem('atomic-acres-fov') ?? fovInput.value) || 82;
sensitivityInput.value = String(sensitivity);
fovInput.value = String(preferredFov);
sensitivityInput.addEventListener('input', () => {
  sensitivity = Number(sensitivityInput.value);
  localStorage.setItem('atomic-acres-sensitivity', String(sensitivity));
});
fovInput.addEventListener('input', () => {
  preferredFov = Number(fovInput.value);
  localStorage.setItem('atomic-acres-fov', String(preferredFov));
});

function pollGamepad(dt: number): void {
  const pad = navigator.getGamepads?.().find((candidate): candidate is Gamepad => Boolean(candidate && candidate.connected));
  if (!pad) {
    gamepadMove = { x: 0, y: 0 };
    gamepadSprint = false;
    gamepadCrouch = false;
    previousGamepadButtons = [];
    triggerHeld = mouseTriggerHeld;
    adsHeld = debugAdsOverride ?? mouseAdsHeld;
    return;
  }
  gamepadMove = applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, 0.14, 1.6);
  const look = applyRadialDeadzone(pad.axes[2] ?? 0, pad.axes[3] ?? 0, 0.1, 1.6);
  const buttons = pad.buttons.map((button) => button.pressed || button.value > 0.55);
  const pressed = (index: number) => buttons[index] && !previousGamepadButtons[index];
  gamepadSprint = Boolean(buttons[10]);
  gamepadCrouch = Boolean(buttons[1]);
  const padAds = Boolean(buttons[6]) || (pad.buttons[6]?.value ?? 0) > 0.22;
  const padTrigger = Boolean(buttons[7]) || (pad.buttons[7]?.value ?? 0) > 0.22;
  adsHeld = debugAdsOverride ?? (mouseAdsHeld || padAds);
  triggerHeld = mouseTriggerHeld || padTrigger;
  if (gameStarted && player.alive && !menu.classList.contains('hidden')) {
    // Do not steer the game behind a pause/menu overlay.
  } else if (gameStarted && player.alive) {
    const turnRate = adsHeld ? 1.92 : 3.66;
    player.yaw -= look.x * turnRate * dt;
    player.pitch = THREE.MathUtils.clamp(player.pitch - look.y * turnRate * 0.82 * dt, -1.42, 1.42);
    if (pressed(0)) jumpQueuedAt = performance.now();
    if (pressed(2)) reload();
    if (pressed(3)) switchWeapon((WEAPON_ORDER.indexOf(player.weapon) + 1) % WEAPON_ORDER.length);
    if (pressed(4)) throwGrenade();
    if (pressed(5)) melee();
  }
  previousGamepadButtons = buttons;
}

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'Space' && !event.repeat) jumpQueuedAt = performance.now();
  if (event.code === 'Digit1') switchWeapon(0);
  if (event.code === 'Digit2') switchWeapon(1);
  if (event.code === 'Digit3') switchWeapon(2);
  if (event.code === 'KeyR') reload();
  if (event.code === 'KeyV' && !event.repeat) melee();
  if (event.code === 'KeyG' && !event.repeat) throwGrenade();
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
  keys.clear();
  mouseTriggerHeld = false;
  mouseAdsHeld = false;
  triggerHeld = false;
  adsHeld = false;
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
    mouseTriggerHeld = false;
    mouseAdsHeld = false;
    triggerHeld = false;
    adsHeld = false;
    if (gameStarted && player.alive) {
      element<HTMLButtonElement>('#resume').hidden = matchFinished;
      menu.classList.remove('hidden');
    }
  } else {
    element<HTMLButtonElement>('#resume').hidden = true;
    menu.classList.add('hidden');
  }
});

function resetForMode(): void {
  player.kills = 0;
  player.deaths = 0;
  player.hp = 100;
  player.grenades = 1;
  player.reloadState = null;
  player.sustainedShots = 0;
  player.crouched = false;
  targetHits = 0;
  clearBots();
  for (const grenade of grenades) scene.remove(grenade.mesh);
  grenades.length = 0;
  for (const id of remotes.keys()) removeRemote(id, 'cleared');
  element<HTMLElement>('#banner').hidden = true;
  player.ammo = { carbine: WEAPONS.carbine.mag, smg: WEAPONS.smg.mag, scattergun: WEAPONS.scattergun.mag };
  player.reserve = { carbine: WEAPONS.carbine.reserve, smg: WEAPONS.smg.reserve, scattergun: WEAPONS.scattergun.reserve };
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
  resetForMode();
  const code = element<HTMLInputElement>('#room-input').value.trim();
  network.join(code, () => startGame('client'));
});
element<HTMLButtonElement>('#copy-room').addEventListener('click', async () => {
  const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(network.roomCode)}`;
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
}, 60);
window.addEventListener('beforeunload', () => {
  if (network.role !== 'offline') network.send({ type: 'leave', playerId: player.id });
  network.close();
});

function frame(now: number): void {
  try {
    const frameDt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
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
    updateRemotes(frameDt, now);
    updateHud(now);
    if (!debugRenderPaused) renderer.render(scene, camera);
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
    setRenderPaused: (paused: boolean) => void;
    fireOnce: () => void;
    throwGrenade: () => void;
    switchWeapon: (index: number) => void;
    reload: () => void;
    melee: () => void;
    setAds: (held: boolean) => void;
    damage: (amount: number) => void;

  };
};
debugWindow.__ATOMIC_ACRES_DEBUG__ = {
  snapshot: () => ({
    gameStarted,
    gameMode,
    matchPhase: matchState.phase,
    player: {
      hp: player.hp,
      kills: player.kills,
      deaths: player.deaths,
      weapon: player.weapon,
      ammo: player.ammo[player.weapon],
      reserve: player.reserve[player.weapon],
      crouched: player.crouched,
      sprinting: currentSprinting,
      grenades: player.grenades,
      position: player.position.toArray(),
    },
    bots: [...bots.values()].map((bot) => ({ id: bot.id, hp: bot.hp, alive: bot.alive, kills: bot.kills, position: bot.position.toArray() })),
    remotes: remotes.size,
    grenades: grenades.length,
    originalArtLoaded: scene.getObjectByName('original-arena-art') !== undefined,
    weaponReady: weaponView.isReady(),
    menuVisible: !menu.classList.contains('hidden'),
    render: {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      sceneObjects: scene.children.length,
      reducedMode: reducedRenderMode,
    },
  }),
  startSolo: () => {
    network.close();
    resetForMode();
    startGame('solo', false);
  },
  setBotsFrozen: (frozen: boolean) => { botsFrozen = frozen; },
  setRenderPaused: (paused: boolean) => { debugRenderPaused = paused; },
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
  melee: () => melee(),
  setAds: (held: boolean) => { debugAdsOverride = held; adsHeld = held; },
  damage: (amount: number) => {
    player.invulnerableUntil = 0;
    applyDamage(amount, bots.keys().next().value ?? player.id);
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
  }, reducedRenderMode);
  const [physics, , art] = await Promise.all([physicsPromise, weaponPromise, artPromise]);
  characterPhysics = physics;
  const visibleMapMeshes = arena.raycastMeshes.filter((mesh) => mesh.visible || mesh.userData.collisionProxy === true);
  arena.raycastMeshes.splice(0, arena.raycastMeshes.length, ...visibleMapMeshes);
  art.root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.userData.blocksShots === true) arena.raycastMeshes.push(node);
  });
  const arenaRoot = scene.getObjectByName('Atomic Acres arena');
  if (arenaRoot) batchStaticMeshes(arenaRoot, scene, () => '', reducedRenderMode);
  batchStaticMeshes(art.root, scene, () => '', reducedRenderMode);
  liftCrushedEnvironmentBlacks(scene, weaponView.root);
  weaponView.setWeapon(player.weapon, true);
  respawn();
  weaponView.root.visible = false;
  camera.position.set(-32, 10.5, -17);
  camera.lookAt(0, 2.8, 4);
  camera.fov = 72;
  camera.updateProjectionMatrix();

  soloButton.disabled = false;
  hostButton.disabled = !webRtcSupported;
  joinButton.disabled = !webRtcSupported;
  setStatus('Combat Feel Pass 02 ready — tuned locomotion, layered audio, expanded arena art and recoil systems active.', 'ok');
  requestAnimationFrame(frame);
}

void bootstrap().catch(showFatalError);
