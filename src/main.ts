import * as THREE from 'three';
import './style.css';
import { ArenaAudio } from './audio';
import { damp, resolveHorizontalMove, shortestAngleDelta } from './collision';
import { ArenaMap, buildArena } from './map';
import { ArenaNetwork } from './network';
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

type WeaponSpec = {
  id: WeaponId;
  name: string;
  damage: number;
  rpm: number;
  mag: number;
  reserve: number;
  reload: number;
  spread: number;
  pellets: number;
  recoil: number;
  automatic: boolean;
  color: number;
};

type RemotePlayer = {
  root: THREE.Group;
  snapshot: PlayerSnapshot;
  target: THREE.Vector3;
  targetYaw: number;
  lastSeen: number;
};

const WEAPONS: Record<WeaponId, WeaponSpec> = {
  carbine: { id: 'carbine', name: 'M86 Carbine', damage: 31, rpm: 540, mag: 24, reserve: 96, reload: 1.75, spread: 0.008, pellets: 1, recoil: 0.018, automatic: false, color: 0xffd166 },
  smg: { id: 'smg', name: 'Vectorline SMG', damage: 18, rpm: 820, mag: 32, reserve: 128, reload: 1.45, spread: 0.019, pellets: 1, recoil: 0.011, automatic: true, color: 0x65e7ff },
  scattergun: { id: 'scattergun', name: 'Model 12 Scattergun', damage: 13, rpm: 90, mag: 8, reserve: 40, reload: 2.3, spread: 0.072, pellets: 9, recoil: 0.05, automatic: false, color: 0xff8a5b },
};
const WEAPON_ORDER: WeaponId[] = ['carbine', 'smg', 'scattergun'];

function createPlayerId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');
app.innerHTML = `
  <canvas id="game" aria-label="Atomic Acres multiplayer arena"></canvas>
  <div id="vignette"></div><div id="damage-flash"></div>
  <section id="menu" class="panel">
    <div class="eyebrow">ORIGINAL WEB ARENA · BUILD 86</div>
    <h1>ATOMIC <span>ACRES</span></h1>
    <p class="lede">A fast retro-future two-house arena: tiny sightlines, frantic flanks, coach-versus-truck chaos and peer-to-peer multiplayer.</p>
    <div class="setup-grid">
      <label>CALLSIGN<input id="player-name" maxlength="16" autocomplete="nickname" value="Player${Math.floor(Math.random() * 900 + 100)}"></label>
      <label>SQUAD<select id="team"><option value="0">Aqua</option><option value="1">Coral</option></select></label>
    </div>
    <div class="menu-actions">
      <button id="resume" class="primary" hidden>RETURN TO MATCH</button>
      <button id="solo" class="primary">TRAIN SOLO</button>
      <button id="host">HOST LOBBY</button>
    </div>
    <div class="join-row"><input id="room-input" placeholder="Paste room code" autocomplete="off"><button id="join">JOIN</button></div>
    <div id="room-card" hidden><span>ROOM CODE</span><strong id="room-code"></strong><button id="copy-room" class="small-button">COPY</button></div>
    <div id="network-status" data-kind="ok">Ready for deployment.</div>
    <div class="controls"><b>WASD</b> move · <b>SHIFT</b> sprint · <b>SPACE</b> jump · <b>MOUSE</b> aim/fire · <b>R</b> reload · <b>1–3</b> weapons · <b>TAB</b> roster · <b>ESC</b> menu</div>
    <p class="legal">Fan-made original arena. No Activision assets, branding, code or ripped map geometry. Desktop keyboard and mouse recommended.</p>
  </section>
  <div id="hud" hidden>
    <header id="matchbar"><div><span class="tiny">TEAM DEATHMATCH</span><strong id="timer">05:00</strong></div><div id="scoreline"><span class="aqua">AQUA <b id="aqua-score">0</b></span><i>25</i><span class="coral"><b id="coral-score">0</b> CORAL</span></div><div id="connection-pill">SOLO</div></header>
    <div id="crosshair"><i></i><i></i><i></i><i></i></div><div id="hitmarker">×</div>
    <div id="killfeed"></div>
    <div id="objective">ATOMIC ACRES · FIRST TO 25</div>
    <div id="health-block"><div><span>VITALS</span><b id="health">100</b></div><div class="health-track"><i id="health-fill"></i></div></div>
    <div id="weapon-block"><span id="weapon-name">M86 CARBINE</span><div><b id="ammo">24</b><i>/</i><em id="reserve">96</em></div><small id="reload-state"></small></div>
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
const audio = new ArenaAudio();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8b781, 55, 118);
const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);
camera.rotation.order = 'YXZ';
scene.add(camera);

function buildSky(): void {
  const geometry = new THREE.SphereGeometry(150, 32, 18);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x3d7fb0) },
      horizon: { value: new THREE.Color(0xf5c27f) },
      bottom: { value: new THREE.Color(0xeee0b9) },
    },
    vertexShader: 'varying vec3 worldPos; void main(){ worldPos=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 worldPos; uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; void main(){ float h=normalize(worldPos).y; vec3 c=h>0.0?mix(horizon,top,smoothstep(0.0,.75,h)):mix(horizon,bottom,smoothstep(0.0,-.35,h)); gl_FragColor=vec4(c,1.0); }',
  });
  scene.add(new THREE.Mesh(geometry, material));
  scene.add(new THREE.HemisphereLight(0xd9efff, 0x435833, 1.45));
  const sun = new THREE.DirectionalLight(0xffdfb2, 2.3);
  sun.position.set(-38, 74, 22);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 65;
  sun.shadow.camera.bottom = -65;
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
  ammo: { carbine: 24, smg: 32, scattergun: 8 } as Record<WeaponId, number>,
  reserve: { carbine: 96, smg: 128, scattergun: 40 } as Record<WeaponId, number>,
  reloadingUntil: 0,
  lastShotAt: 0,
  alive: true,
  invulnerableUntil: 0,
  seq: 0,
};

const keys = new Set<string>();
const remotes = new Map<string, RemotePlayer>();
const processedNonces = new Set<number>();
let gameStarted = false;
let triggerHeld = false;
let startTime = 0;
let targetHits = 0;
let accumulator = 0;
let recoilVisual = 0;
let weaponBob = 0;
let lastFrame = performance.now();
let matchFinished = false;

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

function createWeaponView(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'weapon-view';
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2228, roughness: 0.48, metalness: 0.55 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xb77d3c, roughness: 0.75 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.72), dark);
  body.position.z = -0.35;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.46, 10), dark);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.92);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.15), accent);
  grip.rotation.x = -0.25;
  grip.position.set(0, -0.17, -0.25);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.1), dark);
  sight.position.set(0, 0.13, -0.55);
  root.add(body, barrel, grip, sight);
  root.position.set(0.34, -0.27, -0.48);
  camera.add(root);
  return root;
}
const weaponView = createWeaponView();
const viewFill = new THREE.PointLight(0xd8ecff, 0.9, 5);
viewFill.position.set(0, 0.4, 0.2);
camera.add(viewFill);

function createRemote(snapshot: PlayerSnapshot): RemotePlayer {
  const root = new THREE.Group();
  root.name = 'remote-player';
  root.userData.playerId = snapshot.id;
  const teamMaterial = new THREE.MeshStandardMaterial({ color: snapshot.team === 0 ? 0x52d5d2 : 0xff765f, roughness: 0.62 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202a31, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.05, 5, 10), teamMaterial);
  body.position.y = 0.96;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 10), dark);
  head.position.y = 1.85;
  head.castShadow = true;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), dark);
  gun.position.set(0.28, 1.25, -0.35);
  root.add(body, head, gun);
  root.traverse((child) => { child.userData.playerId = snapshot.id; });

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
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
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
  audio.shot(message.weapon, true);
}

function applyDamage(damage: number, attacker: string): void {
  const now = performance.now();
  if (!player.alive || now < player.invulnerableUntil) return;
  player.hp = Math.max(0, player.hp - Math.min(100, Math.max(1, damage)));
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
  const killer = message.killer === player.id ? player.name : remotes.get(message.killer)?.snapshot.name ?? 'Unknown';
  const victim = message.victim === player.id ? player.name : remotes.get(message.victim)?.snapshot.name ?? 'Unknown';
  if (message.killer === player.id && message.victim !== player.id) player.kills += 1;
  addFeed(`${killer} eliminated ${victim}`, message.killer === player.id ? 'gold' : undefined);
  const remote = remotes.get(message.victim);
  if (remote) remote.root.visible = false;
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

function respawn(): void {
  player.position.copy(spawnPoint());
  player.velocity.set(0, 0, 0);
  player.hp = 100;
  player.alive = true;
  player.invulnerableUntil = performance.now() + 1350;
  player.yaw = player.team === 0 ? Math.PI : 0;
  player.pitch = 0;
  element<HTMLElement>('#respawn').hidden = true;
  if (gameStarted) requestGamePointerLock();
  network.send({ type: 'state', player: snapshot() });
}

function startGame(mode: 'solo' | 'host' | 'client'): void {
  player.name = sanitizeName(element<HTMLInputElement>('#player-name').value);
  player.team = Number(element<HTMLSelectElement>('#team').value) === 1 ? 1 : 0;
  gameStarted = true;
  matchFinished = false;
  startTime = performance.now();
  menu.classList.add('hidden');
  hudRoot.hidden = false;
  element<HTMLElement>('#connection-pill').textContent = mode === 'solo' ? 'SOLO DRILL' : mode === 'host' ? 'HOST' : 'PEER';
  element<HTMLElement>('#room-hud').textContent = network.roomCode ? `ROOM ${network.roomCode.slice(0, 8).toUpperCase()}` : '';
  respawn();
  audio.unlock();
  addFeed('Welcome to Atomic Acres', 'gold');
  if (mode !== 'solo') network.send({ type: 'join', player: snapshot() });
}

function randomNonce(): number {
  return Math.floor(performance.now() * 1000 + Math.random() * 1_000_000);
}

function switchWeapon(index: number): void {
  const id = WEAPON_ORDER[index];
  if (!id || id === player.weapon) return;
  player.weapon = id;
  player.reloadingUntil = 0;
  weaponView.rotation.set(0, 0, 0);
}

function reload(): void {
  if (!player.alive) return;
  const spec = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  if (player.reloadingUntil || ammo >= spec.mag || player.reserve[player.weapon] <= 0) return;
  player.reloadingUntil = performance.now() + spec.reload * 1000;
  audio.reload();
  addFeed(`Reloading ${spec.name}`);
}

function completeReload(now: number): void {
  if (!player.reloadingUntil || now < player.reloadingUntil) return;
  const spec = WEAPONS[player.weapon];
  const needed = spec.mag - player.ammo[player.weapon];
  const amount = Math.min(needed, player.reserve[player.weapon]);
  player.ammo[player.weapon] += amount;
  player.reserve[player.weapon] -= amount;
  player.reloadingUntil = 0;
}

function tryFire(now: number): void {
  if (!player.alive || !gameStarted || document.pointerLockElement !== canvas || matchFinished) return;
  const spec = WEAPONS[player.weapon];
  if (!triggerHeld && spec.automatic) return;
  if (player.reloadingUntil) return;
  if (now - player.lastShotAt < 60_000 / spec.rpm) return;
  if (player.ammo[player.weapon] <= 0) {
    audio.empty();
    reload();
    player.lastShotAt = now;
    return;
  }
  player.lastShotAt = now;
  player.ammo[player.weapon] -= 1;
  recoilVisual = Math.min(0.22, recoilVisual + spec.recoil * 3.8);
  player.pitch = Math.max(-1.42, player.pitch - spec.recoil);
  audio.shot(player.weapon);

  const origin = camera.getWorldPosition(new THREE.Vector3());
  const baseDirection = camera.getWorldDirection(new THREE.Vector3());
  const hitDamage = new Map<string, number>();
  for (let pellet = 0; pellet < spec.pellets; pellet += 1) {
    const direction = baseDirection.clone();
    direction.x += (Math.random() - 0.5) * spec.spread;
    direction.y += (Math.random() - 0.5) * spec.spread;
    direction.z += (Math.random() - 0.5) * spec.spread;
    direction.normalize();
    const result = castShot(origin, direction);
    spawnTracer(origin, direction, result.distance, spec.color);
    if (result.playerId) hitDamage.set(result.playerId, (hitDamage.get(result.playerId) ?? 0) + spec.damage);
    if (result.targetId) hitPracticeTarget(result.targetId);
  }
  for (const [target, damage] of hitDamage) {
    const nonce = randomNonce();
    network.send({ type: 'hit', by: player.id, target, damage: Math.min(100, damage), nonce });
    showHitmarker();
    audio.hit();
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

function castShot(origin: THREE.Vector3, direction: THREE.Vector3): { distance: number; playerId?: string; targetId?: string } {
  const ray = new THREE.Raycaster(origin, direction, 0.1, 110);
  const remoteObjects = [...remotes.values()].filter((remote) => remote.root.visible).map((remote) => remote.root);
  const activeTargets = arena.targets.filter((target) => target.active).map((target) => target.root);
  const intersections = ray.intersectObjects([...arena.raycastMeshes, ...remoteObjects, ...activeTargets], true);
  const first = intersections[0];
  if (!first) return { distance: 90 };
  let node: THREE.Object3D | null = first.object;
  while (node && node.parent && node.parent !== scene) {
    if (node.userData.playerId || node.userData.targetId) break;
    if (node.userData.targetRoot) node = node.userData.targetRoot as THREE.Object3D;
    else node = node.parent;
  }
  const playerId = first.object.userData.playerId as string | undefined;
  const targetRoot = first.object.userData.targetRoot as THREE.Group | undefined;
  const targetId = (targetRoot?.userData.targetId ?? node?.userData.targetId) as string | undefined;
  return { distance: Math.min(first.distance, 110), playerId, targetId };
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
    if (!target.active && now >= target.respawnAt) {
      target.active = true;
      target.root.visible = true;
    }
  }
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

function showHitmarker(): void {
  const marker = element<HTMLElement>('#hitmarker');
  marker.classList.remove('show');
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
  if (!gameStarted || !player.alive || matchFinished) return;
  const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
  const input = new THREE.Vector3();
  if (keys.has('KeyW')) input.add(forward);
  if (keys.has('KeyS')) input.sub(forward);
  if (keys.has('KeyD')) input.add(right);
  if (keys.has('KeyA')) input.sub(right);
  if (input.lengthSq() > 0) input.normalize();
  const sprinting = keys.has('ShiftLeft') && input.lengthSq() > 0;
  const acceleration = sprinting ? 43 : 34;
  const maxSpeed = sprinting ? 10.6 : 7.2;
  player.velocity.x += input.x * acceleration * dt;
  player.velocity.z += input.z * acceleration * dt;
  const friction = Math.exp(-8.5 * dt);
  player.velocity.x *= friction;
  player.velocity.z *= friction;
  const horizontal = Math.hypot(player.velocity.x, player.velocity.z);
  if (horizontal > maxSpeed) {
    player.velocity.x *= maxSpeed / horizontal;
    player.velocity.z *= maxSpeed / horizontal;
  }
  player.velocity.y -= 22 * dt;
  const grounded = player.position.y <= 1.705;
  if (grounded) {
    player.position.y = 1.7;
    player.velocity.y = Math.max(0, player.velocity.y);
    if (keys.has('Space')) player.velocity.y = 7.1;
  }
  const desired = player.position.clone().addScaledVector(player.velocity, dt);
  if (desired.y < 1.7) desired.y = 1.7;
  const resolved = resolveHorizontalMove(player.position, desired, arena.colliders, arena.bounds);
  if (Math.abs(resolved.x - desired.x) > 0.001) player.velocity.x = 0;
  if (Math.abs(resolved.z - desired.z) > 0.001) player.velocity.z = 0;
  player.position.set(resolved.x, resolved.y, resolved.z);

  const moving = input.lengthSq() > 0 && grounded;
  weaponBob += dt * (sprinting ? 15 : 10) * (moving ? 1 : 0.25);
  const bob = moving ? Math.sin(weaponBob) * 0.018 : 0;
  recoilVisual = damp(recoilVisual, 0, 15, dt);
  weaponView.position.set(0.34 + Math.cos(weaponBob * 0.5) * (moving ? 0.012 : 0), -0.27 + bob - recoilVisual * 0.45, -0.48 + recoilVisual);
  weaponView.rotation.x = recoilVisual * 0.9;
  camera.fov = damp(camera.fov, sprinting ? 81 : 76, 7, dt);
  camera.updateProjectionMatrix();
  camera.position.copy(player.position);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
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
  return [aqua, coral];
}

function checkMatchEnd(): void {
  const [aqua, coral] = teamScores();
  if (matchFinished || (aqua < 25 && coral < 25)) return;
  matchFinished = true;
  const won = (player.team === 0 ? aqua : coral) >= 25;
  const banner = element<HTMLElement>('#banner');
  banner.innerHTML = `<strong>${won ? 'VICTORY' : 'DEFEAT'}</strong><span>${aqua} — ${coral}</span>`;
  banner.hidden = false;
  document.exitPointerLock();
}

function updateHud(now: number): void {
  const spec = WEAPONS[player.weapon];
  const [aqua, coral] = teamScores();
  element<HTMLElement>('#health').textContent = String(Math.ceil(player.hp));
  element<HTMLElement>('#health-fill').style.width = `${player.hp}%`;
  element<HTMLElement>('#weapon-name').textContent = spec.name.toUpperCase();
  element<HTMLElement>('#ammo').textContent = String(player.ammo[player.weapon]);
  element<HTMLElement>('#reserve').textContent = String(player.reserve[player.weapon]);
  element<HTMLElement>('#aqua-score').textContent = String(aqua);
  element<HTMLElement>('#coral-score').textContent = String(coral);
  const remaining = Math.max(0, 300 - Math.floor((now - startTime) / 1000));
  element<HTMLElement>('#timer').textContent = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
  element<HTMLElement>('#reload-state').textContent = player.reloadingUntil ? `RELOADING ${Math.max(0, (player.reloadingUntil - now) / 1000).toFixed(1)}s` : network.role === 'offline' ? `${targetHits} TARGETS HIT` : `${player.kills} K / ${player.deaths} D`;
  element<HTMLElement>('#health-block').classList.toggle('critical', player.hp <= 30);
  if (remaining === 0 && !matchFinished) {
    matchFinished = true;
    const won = (player.team === 0 ? aqua : coral) >= (player.team === 0 ? coral : aqua);
    const banner = element<HTMLElement>('#banner');
    banner.innerHTML = `<strong>${won ? 'TIME — VICTORY' : 'TIME — DEFEAT'}</strong><span>${aqua} — ${coral}</span>`;
    banner.hidden = false;
    document.exitPointerLock();
  }
  updateRoster();
}

function updateRoster(): void {
  const entries = [snapshot(), ...[...remotes.values()].map((remote) => remote.snapshot)].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  element<HTMLElement>('#roster-list').innerHTML = entries.map((entry) => `<div><span class="${entry.team === 0 ? 'aqua' : 'coral'}">${escapeHtml(entry.name)}</span><b>${entry.kills}</b><i>${entry.deaths}</i><em>${entry.hp > 0 ? entry.hp + ' HP' : 'DOWN'}</em></div>`).join('');
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

window.addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'Digit1') switchWeapon(0);
  if (event.code === 'Digit2') switchWeapon(1);
  if (event.code === 'Digit3') switchWeapon(2);
  if (event.code === 'KeyR') reload();
  if (event.code === 'Tab') {
    event.preventDefault();
    element<HTMLElement>('#roster').hidden = false;
  }
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  if (event.code === 'Tab') element<HTMLElement>('#roster').hidden = true;
});
window.addEventListener('blur', () => {
  keys.clear();
  triggerHeld = false;
});
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas || !player.alive) return;
  player.yaw -= event.movementX * 0.00215;
  player.pitch = Math.max(-1.42, Math.min(1.42, player.pitch - event.movementY * 0.0019));
});
canvas.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return;
  if (document.pointerLockElement !== canvas) {
    requestGamePointerLock();
    return;
  }
  triggerHeld = true;
  tryFire(performance.now());
});
window.addEventListener('mouseup', (event) => { if (event.button === 0) triggerHeld = false; });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) {
    triggerHeld = false;
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
  targetHits = 0;
  for (const id of remotes.keys()) removeRemote(id, 'cleared');
  element<HTMLElement>('#banner').hidden = true;
  player.ammo = { carbine: 24, smg: 32, scattergun: 8 };
  player.reserve = { carbine: 96, smg: 128, scattergun: 40 };
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
    accumulator += frameDt;
    const step = 1 / 120;
    let iterations = 0;
    while (accumulator >= step && iterations < 6) {
      updatePhysics(step);
      accumulator -= step;
      iterations += 1;
    }
    if (triggerHeld && WEAPONS[player.weapon].automatic) tryFire(now);
    completeReload(now);
    updateTargets(now);
    updateRemotes(frameDt, now);
    updateHud(now);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  } catch (error) {
    showFatalError(error);
  }
}
respawn();
requestAnimationFrame(frame);
