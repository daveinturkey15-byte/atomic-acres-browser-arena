
import * as THREE from 'three';
import { Peer } from 'peerjs';
import './style.css';
type PlayerNet = { id:string; x:number;y:number;z:number; ry:number; hp:number; team:number; name:string; score:number };
type RemotePlayer = { mesh:THREE.Group; state:PlayerNet; target:THREE.Vector3; targetRy:number; lastSeen:number };
type ShotMsg = { type:'shot'; origin:[number,number,number]; dir:[number,number,number]; by:string };
type StateMsg = { type:'state'; player: PlayerNet };
type JoinMsg = { type:'join'; player: PlayerNet };
type Msg = ShotMsg | StateMsg | JoinMsg | {type:'hit'; target:string; dmg:number; by:string} | {type:'chat'; text:string};
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<div id="hud"><div id="crosshair"></div><div id="damage"></div><div id="stats"><div><b>CUL-DE-SAC 2025</b> <span class="tag">original browser arena</span></div><div id="hp"></div><div id="weapon"></div></div><div id="feed"></div></div><div id="menu"><h1>Cul-de-Sac 2025</h1><p>Fast two-house suburban FPS prototype. Original geometry/assets; inspired by classic tiny-map flow, not a copy.</p><button id="play">Click to play</button><button id="host">Host peer lobby</button><input id="joinCode" placeholder="peer id"><button id="join">Join</button><p class="small">WASD move · Space jump · Shift sprint · Mouse look · Click fire · R reload · 1/2/3 weapon</p><div id="peerOut"></div></div><canvas id="game"></canvas>`;

// --- Globals & State ---
const clock = new THREE.Clock();
const keys = new Set<string>();
const remotes = new Map<string, RemotePlayer>();
let reloading = 0;
const weapons = [
  { name: 'Pistol', fireRate: 0.25, mag: 12, reserve: 60, reloadTime: 1.5, spread: 0.02, damage: 25, color: 0xffd700 },
  { name: 'SMG', fireRate: 0.08, mag: 30, reserve: 120, reloadTime: 2.0, spread: 0.06, damage: 15, color: 0x00ffff },
  { name: 'Shotgun', fireRate: 0.8, mag: 6, reserve: 24, reloadTime: 2.5, spread: 0.15, damage: 80, color: 0xff4500 }
];
const player = {
  id: 'local',
  pos: new THREE.Vector3(0, 1.7, 0),
  vel: new THREE.Vector3(),
  yaw: 0, pitch: 0,
  hp: 100, team: 0, name: 'Player', score: 0,
  weapon: 0, ammo: 12, reserve: 60,
  lastShot: 0
};
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const scene = new THREE.Scene();
const conns: any[] = [];
const spawns = [new THREE.Vector3(0, 1.7, 0), new THREE.Vector3(0, 1.7, 0)];
const feed = (msg: string) => {
  const el = document.querySelector('#feed')!;
  const d = document.createElement('div');
  d.textContent = msg;
  el.prepend(d);
  if (el.children.length > 5) el.lastChild?.remove();
};

// --- Materials ---
const grass = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.9 });
const asphalt = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
const concrete = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
const matRed = new THREE.MeshStandardMaterial({ color: 0xf87171, roughness: 0.5 });
const matBlue = new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.5 });

// --- Map Building ---
function buildMap() {
  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Road
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 140), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  scene.add(road);

  // Houses
  const makeHouse = (x: number, z: number, mat: THREE.Material, rotY: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 10), mat);
    body.position.y = 4; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(11, 5, 4), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }));
    roof.position.y = 10.5; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 0.2), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    door.position.set(0, 2, 5.1); g.add(door);
    g.position.set(x, 0, z); g.rotation.y = rotY;
    scene.add(g);
  };
  makeHouse(-12, 0, matRed, 0);
  makeHouse(12, 0, matBlue, Math.PI);

  // Island Cover
  const island = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 10), concrete);
  island.position.set(0, 0.6, 0); island.castShadow = true; scene.add(island);

  // Bus/Van Cover
  const bus = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 8), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
  bus.position.set(0, 1.5, 25); bus.castShadow = true; scene.add(bus);

  // Streetlights
  const addLight = (x: number, z: number) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6), concrete);
    pole.position.set(x, 3, z); scene.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.1), concrete);
    arm.position.set(x + 1, 6, z); scene.add(arm);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffaa, emissiveIntensity: 2 }));
    bulb.position.set(x + 2, 5.9, z); scene.add(bulb);
  };
  addLight(-7, -20); addLight(7, -20); addLight(-7, 20); addLight(7, 20);

  // Fences
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
  for(let i=-40; i<40; i+=4) {
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 3), fenceMat);
    f1.position.set(-10, 0.75, i); scene.add(f1);
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 3), fenceMat);
    f2.position.set(10, 0.75, i); scene.add(f2);
  }

  // Lighting & Atmosphere
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4ade80, 1.2);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff0dd, 1.5);
  dir.position.set(20, 40, 20);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.left = -30; dir.shadow.camera.right = 30;
  dir.shadow.camera.top = 30; dir.shadow.camera.bottom = -30;
  scene.add(dir);
  scene.fog = new THREE.FogExp2(0xcceeff, 0.012);
  scene.background = new THREE.Color(0xcceeff);
}

// --- Renderer & Loop ---
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xcceeff, 0.012);
scene.background = new THREE.Color(0xcceeff);

buildMap();dow = true; island.receiveShadow = true;
  scene.add(island);

  // Fences
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x86efac });
  for(let i=-40; i<40; i+=4) {
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 3), fenceMat);
    f1.position.set(-8, 1, i); scene.add(f1);
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 3), fenceMat);
    f2.position.set(8, 1, i); scene.add(f2);
  }
}
buildMap();
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
// Gradient Sky
const skyGeo = new THREE.SphereGeometry(120, 32, 32);
const skyMat = new THREE.ShaderMaterial({
 side: THREE.BackSide,
 uniforms: {
  topColor: { value: new THREE.Color(0x0077ff) },
  bottomColor: { value: new THREE.Color(0xffd2a0) },
  offset: { value: 20 },
  exponent: { value: 0.6 }
 },
 vertexShader: `
  varying vec3 vWorldPosition;
  void main() {
   vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
   vWorldPosition = worldPosition.xyz;
   gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }`,
 fragmentShader: `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;
  void main() {
   float h = normalize( vWorldPosition + offset ).y;
   gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
  }`
});
scene.background = skyMat;
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// Lighting
const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffd2a0, 1.2);
sun.position.set(50, 100, 50);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 500;
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(sun);

// Fog for depth
scene.fog = new THREE.Fog(0xffd2a0, 40, 120);

// --- Player Mesh ---
function makePlayerMesh(team: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4), new THREE.MeshStandardMaterial({ color: team ? 0xf97316 : 0x38bdf8 }));
  body.position.y = 0.6; body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xffd166 }));
  head.position.y = 1.4; head.castShadow = true;
  g.add(head);
  return g;
}
const playerMesh = makePlayerMesh(player.team);
scene.add(playerMesh);

// --- Weapon Mesh ---
const weaponMesh = new THREE.Mesh(
  new THREE.BoxGeometry(0.1, 0.1, 0.6),
  new THREE.MeshStandardMaterial({ color: 0x333333 })
);
weaponMesh.position.set(0.3, -0.2, -0.5);
camera.add(weaponMesh);
scene.add(camera);

// --- Input ---
document.addEventListener('keydown', e => keys.add(e.code));
document.addEventListener('keyup', e => keys.delete(e.code));
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas) {
    player.yaw -= e.movementX * 0.002;
    player.pitch -= e.movementY * 0.002;
    player.pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, player.pitch));
  }
});
canvas.addEventListener('click', () => {
  if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
  else fireWeapon();
});
document.addEventListener('keydown', e => {
  if (e.code === 'KeyR') reloadWeapon();
  if (e.code === 'Digit1') player.weapon = 0;
  if (e.code === 'Digit2') player.weapon = 1;
  if (e.code === 'Digit3') player.weapon = 2;
});

// --- Weapon Logic ---
function fireWeapon() {
  const w = weapons[player.weapon];
  const now = performance.now() / 1000;
  if (now - player.lastShot < w.fireRate || reloading || player.ammo <= 0) return;
  player.lastShot = now;
  player.ammo--;
  
  // Muzzle flash
  const flash = new THREE.PointLight(w.color, 5, 5);
  flash.position.set(0.3, -0.2, -1);
  camera.add(flash);
  setTimeout(() => camera.remove(flash), 50);

  // Recoil
  player.pitch += 0.02;

  // Hitscan
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  dir.x += (Math.random() - 0.5) * w.spread;
  dir.y += (Math.random() - 0.5) * w.spread;
  dir.normalize();
  
  const raycaster = new THREE.Raycaster(camera.position.clone(), dir);
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  if (intersects.length > 0) {
    const hit = intersects[0];
    tracer(camera.position.clone(), dir, hit.distance);
    
    // Check if hit remote player
    let hitRemote = false;
    for (const [id, r] of remotes) {
      if (hit.object === r.mesh || r.mesh.children.includes(hit.object)) {
        send({ type: 'hit', target: id, dmg: w.damage, by: player.id });
        hitRemote = true;
        break;
      }
    }
    
    // Check if hit mannequin (dummy target)
    if (!hitRemote && hit.object.name === 'mannequin') {
      hit.object.position.y = -99;
      player.score++;
      feed('+1 mannequin pick');
    }
  } else {
    tracer(camera.position.clone(), dir, 100);
  }
}

function reloadWeapon() {
  const w = weapons[player.weapon];
  if (reloading || player.ammo === w.mag || player.reserve <= 0) return;
  reloading = true;
  feed('Reloading...');
}

function makeRemote(team: number) {
  const g = makePlayerMesh(team);
  scene.add(g);
  return g;
}

function tracer(o:THREE.Vector3,d:THREE.Vector3,len:number){ const g=new THREE.BufferGeometry().setFromPoints([o.clone(), o.clone().addScaledVector(d,len)]); const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xfff0a0,transparent:true,opacity:.7})); scene.add(l); setTimeout(()=>scene.remove(l),45); }
function send(msg:Msg){ for(const c of conns) if(c.open) c.send(msg); }
function netState():PlayerNet{ return {id:player.id,x:player.pos.x,y:player.pos.y,z:player.pos.z,ry:player.yaw,hp:player.hp,team:player.team,name:player.name,score:player.score}; }
function onMsg(m:Msg){ if(m.type==='state'||m.type==='join'){ const p=(m as any).player as PlayerNet; if(p.id===player.id) return; let r=remotes.get(p.id); if(!r){const start=new THREE.Vector3(p.x,p.y-1.7,p.z); r={mesh:makeRemote(p.team?0xf97316:0x38bdf8), state:p, target:start.clone(), targetRy:p.ry, lastSeen:performance.now()}; r.mesh.position.copy(start); remotes.set(p.id,r); feed(p.name+' joined');} r.state=p; r.target.set(p.x,p.y-1.7,p.z); r.targetRy=p.ry; r.lastSeen=performance.now(); } if(m.type==='hit'&&m.target===player.id){ player.hp-=m.dmg; feed('hit by '+m.by+' -'+m.dmg); if(player.hp<=0){ player.hp=100; const spawn=spawns[player.team] || spawns[0]; player.pos.copy(spawn); player.vel.set(0,0,0); feed('respawn'); }} if(m.type==='shot'){ tracer(new THREE.Vector3(...m.origin), new THREE.Vector3(...m.dir), 60); }}
setInterval(()=>{ send({type:'state', player:netState()}); },80);
(document.querySelector('#host') as HTMLButtonElement).onclick=()=>{ const peer=new Peer(); peer.on('open',id=>(document.querySelector('#peerOut')!).textContent='Host id: '+id); peer.on('connection',conn=>wire(conn)); };
(document.querySelector('#join') as HTMLButtonElement).onclick=()=>{ const code=(document.querySelector('#joinCode') as HTMLInputElement).value.trim(); const peer=new Peer(); peer.on('open',()=>wire(peer.connect(code))); };
function wire(conn:any){ conns.push(conn); conn.on('open',()=>{ conn.send({type:'join', player:netState()}); feed('peer connected');}); conn.on('data',(d:Msg)=>onMsg(d)); }
function updateRemotes(dt:number){
 const now=performance.now();
 for(const [id,r] of remotes){
  if(now-r.lastSeen>10000){ scene.remove(r.mesh); remotes.delete(id); continue; }
  const alpha=1-Math.pow(0.001, dt);
  r.mesh.position.lerp(r.target, alpha);
  const diff=Math.atan2(Math.sin(r.targetRy-r.mesh.rotation.y), Math.cos(r.targetRy-r.mesh.rotation.y));
  r.mesh.rotation.y += diff * alpha;
 }
}
const statsEl = document.querySelector('#stats')!;
const weaponEl = document.querySelector('#weapon')!;
function hud(dt:number){ const w=weapons[player.weapon]; if(reloading){ reloading-=dt; if(reloading<=0){ const need=w.mag-player.ammo, take=Math.min(need,player.reserve); player.ammo+=take; player.reserve-=take; reloading=0; }}
 if(statsEl) statsEl.textContent = `HP ${Math.ceil(player.hp)} · Score ${player.score} · Peers ${remotes.size}`;
 if(weaponEl) weaponEl.textContent = `${w.name} ${player.ammo}/${player.reserve}`; }

function physics(step:number){
 const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 14 : 8;
 const move = new THREE.Vector3();
 if(keys['KeyW']) move.z -= 1;
 if(keys['KeyS']) move.z += 1;
 if(keys['KeyA']) move.x -= 1;
 if(keys['KeyD']) move.x += 1;
 if(move.lengthSq() > 0) move.normalize();
 move.applyAxisAngle(new THREE.Vector3(0,1,0), player.yaw);
 player.pos.x += move.x * speed * step;
 player.pos.z += move.z * speed * step;
 player.vel.y -= 25 * step;
 player.pos.y += player.vel.y * step;
 if(player.pos.y < 1.7){ player.pos.y = 1.7; player.vel.y = 0; }
 if(keys['Space'] && player.pos.y <= 1.71){ player.vel.y = 8; }
 // Wall Collision
 player.pos.x = Math.max(-6, Math.min(6, player.pos.x));
 player.pos.z = Math.max(-60, Math.min(60, player.pos.z));
 camera.position.copy(player.pos);
 camera.rotation.order = 'YXZ';
 camera.rotation.y = player.yaw;
 camera.rotation.x = player.pitch;
 playerMesh.position.copy(player.pos);
 playerMesh.rotation.y = player.yaw;
 weaponMesh.position.set(0.3 + Math.sin(performance.now()/200)*0.01, -0.2 + Math.sin(performance.now()/150)*0.01, -0.5);
}

let accumulator=0;
function loop(){
 const frameDt=Math.min(.05, clock.getDelta());
 accumulator += frameDt;
 const step=1/90;
 let ticks=0;
 while(accumulator>=step && ticks<5){ physics(step); accumulator-=step; ticks++; }
 updateRemotes(frameDt);
 hud(frameDt);
 renderer.render(scene,camera);
 requestAnimationFrame(loop);
}

// --- Map Building ---
function buildMap() {
  // Ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Road
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, 140), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  scene.add(road);

  // Houses
  const makeHouse = (x: number, z: number, mat: THREE.Material, rotY: number) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 10), mat);
    body.position.y = 4; body.castShadow = true; body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(11, 5, 4), new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 }));
    roof.position.y = 10.5; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 0.2), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    door.position.set(0, 2, 5.1); g.add(door);
    g.position.set(x, 0, z); g.rotation.y = rotY;
    scene.add(g);
  };
  makeHouse(-12, 0, matRed, 0);
  makeHouse(12, 0, matBlue, Math.PI);

  // Island Cover
  const island = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 10), concrete);
  island.position.set(0, 0.6, 0); island.castShadow = true; island.receiveShadow = true;
  scene.add(island);

  // Fences
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x86efac });
  for(let i=-40; i<40; i+=4) {
    const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 3), fenceMat);
    f1.position.set(-8, 1, i); scene.add(f1);
    const f2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 3), fenceMat);
    f2.position.set(8, 1, i); scene.add(f2);
  }
}
buildMap();
const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({canvas, antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
// Gradient Sky
const skyGeo = new THREE.SphereGeometry(120, 32, 32);
const skyMat = new THREE.ShaderMaterial({
 side: THREE.BackSide,
 uniforms: {
  topColor: { value: new THREE.Color(0x0077ff) },
  bottomColor: { value: new THREE.Color(0xffd2a0) },
  offset: { value: 20 },
  exponent: { value: 0.6 }
 },
 vertexShader: `
  varying vec3 vWorldPosition;
  void main() {
   vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
   vWorldPosition = worldPosition.xyz;
   gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }`,
 fragmentShader: `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;
  varying vec3 vWorldPosition;
  void main() {
   float h = normalize( vWorldPosition + offset ).y;
   gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
  }`
});
scene.background = new THREE.Color(0xffe2a8);
scene.add(new THREE.Mesh(skyGeo, skyMat));
scene.fog = new THREE.FogExp2(0xffe2a8, 0.012); // Warm suburban haze
const camera = new THREE.PerspectiveCamera(76, innerWidth/innerHeight, .05, 250);
const clock = new THREE.Clock();
const sun = new THREE.DirectionalLight(0xfff4e0, 2.8); sun.position.set(-18,32,12); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.near=0.1; sun.shadow.camera.far=100; sun.shadow.camera.left=-40; sun.shadow.camera.right=40; sun.shadow.camera.top=40; sun.shadow.camera.bottom=-40; scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffeeb1, 0x080820, 0.6)); // Brighter sky, darker ground bounce
const player = { id: crypto.randomUUID().slice(0,8), pos:new THREE.Vector3(0,1.7,12), vel:new THREE.Vector3(), yaw:Math.PI, pitch:0, hp:100, team:0, score:0, ammo:30, reserve:120, weapon:0, name:'Jig-'+Math.floor(Math.random()*999), recoil:0, fovBase:76 };
const muzzleLight = new THREE.PointLight(0xffaa00, 0, 10);
scene.add(muzzleLight);
// Materials
const grass = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.9 });
const asphalt = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
const matRed = new THREE.MeshStandardMaterial({ color: 0xf87171, roughness: 0.5 });
const matBlue = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.5 });
const concrete = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
const dummyMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4 });

// Data Arrays
const spawns = [
 new THREE.Vector3(0, 1.7, 40),
 new THREE.Vector3(0, 1.7, -40)
];
const weapons = [
 { name: 'AR', mag: 30, reserve: 120, rate: 0.1, dmg: 25, spread: 0.02 },
 { name: 'SMG', mag: 40, reserve: 200, rate: 0.06, dmg: 18, spread: 0.04 },
 { name: 'Shotgun', mag: 8, reserve: 32, rate: 0.8, dmg: 15, spread: 0.15 }
];
const remotes = new Map<string, RemotePlayer>();
const keys = new Set<string>();
const feed = (t:string) => { const d=document.createElement('div'); d.textContent=t; document.querySelector('#feed')!.prepend(d); setTimeout(()=>d.remove(),3000); };
const reloading = 0;
let reloadingTimer = 0;

// --- SUBURBAN ARENA GEOMETRY ---
const arenaGroup = new THREE.Group();
scene.add(arenaGroup);

// Ground
const groundGeo = new THREE.PlaneGeometry(120, 120);
const ground = new THREE.Mesh(groundGeo, asphalt);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
arenaGroup.add(ground);

// Grass patches
const grassGeo = new THREE.PlaneGeometry(120, 120);
const grassMesh = new THREE.Mesh(grassGeo, grass);
grassMesh.rotation.x = -Math.PI / 2;
grassMesh.position.y = 0.01;
arenaGroup.add(grassMesh);

// Helper to make box
function makeBox(w:number, h:number, d:number, x:number, y:number, z:number, mat:THREE.Material, castShadow=true, receiveShadow=true) {
 const g = new THREE.BoxGeometry(w, h, d);
 const m = new THREE.Mesh(g, mat);
 m.position.set(x, y, z);
 m.castShadow = castShadow;
 m.receiveShadow = receiveShadow;
 arenaGroup.add(m);
 return m;
}

// Two Houses (Symmetric)
// House 1 (Red Team - North)
makeBox(10, 6, 10, 0, 3, -30, matRed);
makeBox(12, 0.5, 12, 0, 6.25, -30, concrete);
makeBox(2, 4, 2, -3, 2, -30, concrete); // Pillar
makeBox(2, 4, 2, 3, 2, -30, concrete); // Pillar

// House 2 (Blue Team - South)
makeBox(10, 6, 10, 0, 3, 30, matBlue);
makeBox(12, 0.5, 12, 0, 6.25, 30, concrete);
makeBox(2, 4, 2, -3, 2, 30, concrete);
makeBox(2, 4, 2, 3, 2, 30, concrete);

// Central Street/Path
makeBox(4, 0.1, 60, 0, 0.05, 0, asphalt);

// Cover Objects (Planters/Crates)
makeBox(2, 1.5, 2, -6, 0.75, 0, concrete);
makeBox(2, 1.5, 2, 6, 0.75, 0, concrete);
makeBox(2, 1.5, 2, -6, 0.75, -15, concrete);
makeBox(2, 1.5, 2, 6, 0.75, -15, concrete);
makeBox(2, 1.5, 2, -6, 0.75, 15, concrete);
makeBox(2, 1.5, 2, 6, 0.75, 15, concrete);

// Mannequins (Targets)
const mannequins: THREE.Group[] = [];
function makeMannequin(x:number, z:number, team:number) {
 const g = new THREE.Group();
 const body = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8), dummyMat);
 body.position.y = 0.9;
 body.castShadow = true;
 g.add(body);
 const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), dummyMat);
 head.position.y = 1.95;
 head.castShadow = true;
 g.add(head);
 g.position.set(x, 0, z);
 g.userData = { type: 'mannequin', team };
 arenaGroup.add(g);
 mannequins.push(g);
 return g;
}

makeMannequin(-3, -10, 1);
makeMannequin(3, -10, 1);
makeMannequin(-3, 10, 0);
makeMannequin(3, 10, 0);
makeMannequin(0, 0, -1);

// --- END SUBURBAN ARENA GEOMETRY ---

const keys: Record<string, boolean> = {};
const remotes = new Map<string, RemotePlayer>();
let reloading = false;

function makeRemote(teamColor: number): THREE.Group {
 const g = new THREE.Group();
 const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8), new THREE.MeshStandardMaterial({ color: teamColor }));
 body.position.y = 0.7; body.castShadow = true;
 const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshStandardMaterial({ color: 0xffccaa }));
 head.position.y = 1.6; head.castShadow = true;
 g.add(body, head);
 return g;
}

function buildArena(){
 // Grass
 const g = new THREE.Mesh(new THREE.PlaneGeometry(120,120), grass);
 g.rotation.x = -Math.PI/2; g.receiveShadow=true; scene.add(g);
 // Road (Raised Box with Curb)
 const roadGeo = new THREE.BoxGeometry(14, 0.2, 120);
 const r = new THREE.Mesh(roadGeo, asphalt);
 r.position.y = 0.1; r.receiveShadow=true; scene.add(r);
 // Curb
 const curbGeo = new THREE.BoxGeometry(15, 0.3, 120);
 const curb = new THREE.Mesh(curbGeo, concrete);
 curb.position.y = 0.05; curb.receiveShadow=true; scene.add(curb);
 // Houses
 const h1 = new THREE.Mesh(new THREE.BoxGeometry(12,10,12), matRed); h1.position.set(25,5,0); h1.castShadow=true; h1.receiveShadow=true; h1.name='house'; scene.add(h1);
 const h2 = new THREE.Mesh(new THREE.BoxGeometry(12,10,12), blue); h2.position.set(-25,5,0); h2.castShadow=true; h2.receiveShadow=true; h2.name='house'; scene.add(h2);
 // Cover
 const c1 = new THREE.Mesh(new THREE.BoxGeometry(4,2,4), concrete); c1.position.set(8,1,15); c1.castShadow=true; scene.add(c1);
 const c2 = new THREE.Mesh(new THREE.BoxGeometry(4,2,4), concrete); c2.position.set(-8,1,-15); c2.castShadow=true; scene.add(c2);
 // Dummies
 const dummyGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
 const d1 = new THREE.Mesh(dummyGeo, dummyMat); d1.position.set(0, 1, 0); d1.castShadow=true; d1.name='mannequin'; scene.add(d1);
 const d2 = new THREE.Mesh(dummyGeo, dummyMat); d2.position.set(15, 1, 10); d2.castShadow=true; d2.name='mannequin'; scene.add(d2);
 const d3 = new THREE.Mesh(dummyGeo, dummyMat); d3.position.set(-15, 1, -10); d3.castShadow=true; d3.name='mannequin'; scene.add(d3);
 const d4 = new THREE.Mesh(dummyGeo, dummyMat); d4.position.set(0, 1, -20); d4.castShadow=true; d4.name='mannequin'; scene.add(d4);
 const d5 = new THREE.Mesh(dummyGeo, dummyMat); d5.position.set(0, 1, 20); d5.castShadow=true; d5.name='mannequin'; scene.add(d5);
}
buildArena();
const weapons = [
 {name:'SMG-83', rpm:820, dmg:18, spread:.018, mag:30, reload:1.4, kick:.010},
 {name:'Burst Carbine', rpm:520, dmg:31, spread:.010, mag:27, reload:1.7, kick:.016},
 {name:'Pump 12', rpm:85, dmg:13, pellets:9, spread:.075, mag:8, reload:2.2, kick:.04},
];
let lastShot=0, reloading=0;
const spawns = [new THREE.Vector3(0,1.7,38), new THREE.Vector3(0,1.7,-38)];
const keys = new Set<string>(); let pointer=false; const remotes = new Map<string, RemotePlayer>(); const conns:any[]=[];
function feed(t:string){ const f=document.querySelector('#feed')!; f.innerHTML = `<div>${t}</div>` + f.innerHTML; [...f.children].slice(5).forEach(x=>x.remove()); }
function mat(c:number, rough=0.8){ return new THREE.MeshStandardMaterial({color:c, roughness:rough, metalness:.05}); }
const asphalt=mat(0x33363a), grass=mat(0x6f8b45), concrete=mat(0xc6b89d), red=mat(0xa55242), blue=mat(0x4e7098), yellow=mat(0xd6bd6a), white=mat(0xe8ddc8), dark=mat(0x22252a), glass=new THREE.MeshStandardMaterial({color:0x86b6c9, roughness:.2, metalness:.1, transparent:true, opacity:.55});
function box(name:string, pos:[number,number,number], scale:[number,number,number], material:THREE.Material, cast=true){ const m=new THREE.Mesh(new THREE.BoxGeometry(scale[0],scale[1],scale[2]),material); m.name=name; m.position.set(...pos); m.castShadow=cast; m.receiveShadow=true; scene.add(m); colliders.push(m); return m; }
const colliders:THREE.Mesh[]=[];
function map(){
 const ground = new THREE.Mesh(new THREE.PlaneGeometry(140,110), grass); ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);
 box('street',[0,.03,0],[26,.06,92],asphalt,false); box('sidewalkL',[-16,.05,0],[5,.08,88],concrete,false); box('sidewalkR',[16,.05,0],[5,.08,88],concrete,false);
 house('blue',[-27,3,-25],blue); house('red',[27,3,25],red);
 box('moving-van',[0,1.4,-7],[4.2,2.8,10],yellow); box('bus',[0,1.8,13],[4.5,3.6,14],mat(0xe0a83a));
 box('garageA',[-18,1.5,-38],[12,3,7],white); box('garageB',[18,1.5,38],[12,3,7],white);
 for(let z of [-43,43]) box('spawnwall'+z,[0,2,z],[58,4,1.2],mat(0xded0b4));
 for(let x of [-34,34]) box('fence'+x,[x,1.7,0],[1.1,3.4,94],mat(0x8c653f));
 for(let i=0;i<14;i++){ const z=-38+i*6; box('cover'+i,[i%2?8:-8,.8,z],[3,1.6,2.2], i%2?red:blue); }
 for(let i=0;i<20;i++) mannequin(i, (Math.random()-.5)*42, (Math.random()-.5)*76);
}
function house(n:string, p:[number,number,number], m:THREE.Material){
 box(n+'base',[p[0],2,p[2]],[18,4,14],m); box(n+'upper',[p[0],6,p[2]],[15,4,11],m); box(n+'roof',[p[0],8.5,p[2]],[19,1.4,15],dark);
 box(n+'door',[p[0],1.4,p[2]+7.05],[3,2.8,.25],dark); box(n+'window1',[p[0]-5,3,p[2]+7.1],[3,1.8,.2],glass,false); box(n+'window2',[p[0]+5,3,p[2]+7.1],[3,1.8,.2],glass,false);
 box(n+'balcony',[p[0],4.5,p[2]-7.7],[12,.5,2],concrete); box(n+'stairs',[p[0]-9,1.0,p[2]-3],[2,2,9],concrete);
}
function mannequin(i:number,x:number,z:number){ const g=new THREE.Group(); g.name='mannequin'; const body=new THREE.Mesh(new THREE.CapsuleGeometry(.34,1.1,4,8), mat(0xd1b28b)); body.position.y=1.1; const head=new THREE.Mesh(new THREE.SphereGeometry(.28,12,8), mat(0xe2c59a)); head.position.y=1.95; g.add(body,head); g.position.set(x,0,z); g.castShadow=true; scene.add(g); }
map();
function makeRemote(color=0x22d3ee){ const g=new THREE.Group(); const b=new THREE.Mesh(new THREE.CapsuleGeometry(.42,1.35,6,10), mat(color)); b.position.y=.95; const h=new THREE.Mesh(new THREE.SphereGeometry(.24,12,8), dark); h.position.y=1.82; g.add(b,h); scene.add(g); return g; }
function resize(){ renderer.setSize(innerWidth,innerHeight,false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); } addEventListener('resize',resize); resize();
document.addEventListener('keydown',e=>{keys.add(e.code); if(e.code==='Digit1') switchW(0); if(e.code==='Digit2') switchW(1); if(e.code==='Digit3') switchW(2); if(e.code==='KeyR') reload();}); document.addEventListener('keyup',e=>keys.delete(e.code));
canvas.addEventListener('click',()=>{ if(!pointer) canvas.requestPointerLock(); else fire(); }); document.addEventListener('pointerlockchange',()=>pointer=document.pointerLockElement===canvas); document.addEventListener('mousemove',e=>{ if(!pointer) return; player.yaw -= e.movementX*.0022; player.pitch = Math.max(-1.35,Math.min(1.35, player.pitch-e.movementY*.002));});
document.querySelector('#play')!.addEventListener('click',()=>{(document.querySelector('#menu') as HTMLElement).style.display='none'; canvas.requestPointerLock();});
function switchW(i:number){ if(i<0||i>=weapons.length) return; player.weapon=i; reloading=0; const w=weapons[i]; player.ammo=Math.min(player.ammo,w.mag); }
function reload(){ const w=weapons[player.weapon]; if(reloading||player.ammo===w.mag||player.reserve<=0) return; reloading=w.reload; feed('reloading '+w.name); }
function physics(dt:number){
 const fwd=new THREE.Vector3(Math.sin(player.yaw),0,Math.cos(player.yaw)); const right=new THREE.Vector3(fwd.z,0,-fwd.x); const acc=new THREE.Vector3();
 if(keys.has('KeyW')) acc.add(fwd); if(keys.has('KeyS')) acc.sub(fwd); if(keys.has('KeyD')) acc.add(right); if(keys.has('KeyA')) acc.sub(right); if(acc.lengthSq()) acc.normalize();
 const sprint=keys.has('ShiftLeft')?1.55:1; player.vel.x += acc.x*38*sprint*dt; player.vel.z += acc.z*38*sprint*dt; player.vel.x*=Math.pow(.0009,dt); player.vel.z*=Math.pow(.0009,dt); player.vel.y-=22*dt;
 if(player.pos.y<=1.7){player.pos.y=1.7; player.vel.y=Math.max(0,player.vel.y); if(keys.has('Space')) player.vel.y=7.2;}
 const old=player.pos.clone(); player.pos.addScaledVector(player.vel,dt);
 if(Math.abs(player.pos.x)>31||Math.abs(player.pos.z)>45) player.pos.copy(old);
 for(const c of colliders){ const b=new THREE.Box3().setFromObject(c); const p=player.pos; if(p.x>b.min.x-.45&&p.x<b.max.x+.45&&p.z>b.min.z-.45&&p.z<b.max.z+.45&&p.y<b.max.y+1.8){ player.pos.x=old.x; player.pos.z=old.z; }}
 camera.position.copy(player.pos); camera.rotation.order='YXZ'; camera.rotation.y=player.yaw; camera.rotation.x=player.pitch;
}
function fire(){ const now=performance.now()/1000; const w:any=weapons[player.weapon]; if(reloading) return; if(player.ammo<=0){reload(); return;} if(now-lastShot<60/w.rpm) return; lastShot=now; player.ammo--;
 player.recoil += w.kick * 2.5; // Visual kickback
 player.pitch -= w.kick;
 const pellets=w.pellets||1;
 for(let i=0;i<pellets;i++){
  const dir=new THREE.Vector3(0,0,-1).applyEuler(camera.rotation);
  dir.x+=(Math.random()-.5)*w.spread;
  dir.y+=(Math.random()-.5)*w.spread;
  dir.z+=(Math.random()-.5)*w.spread;
  dir.normalize();
  traceShot(camera.position,dir,w.dmg);
  send({type:'shot', origin:camera.position.toArray() as any, dir:dir.toArray() as any, by:player.id});
 }
 // Muzzle flash
 const flash = new THREE.PointLight(0xffaa00, 5, 12); flash.position.copy(camera.position); scene.add(flash); setTimeout(()=>scene.remove(flash), 50);
}
function traceShot(origin:THREE.Vector3,dir:THREE.Vector3,dmg:number){ const ray=new THREE.Raycaster(origin,dir,0,95); const objs=[...Array.from(remotes.values()).map(r=>r.mesh), ...scene.children.filter((o:THREE.Object3D)=>o.name==='mannequin')]; const hit=ray.intersectObjects(objs,true)[0]; tracer(origin,dir,hit?.distance||60); if(hit){ let top:any=hit.object; while(top.parent && top.parent!==scene) top=top.parent; if(top.name==='mannequin'){ top.position.y=-99; player.score++; feed('+1 mannequin pick'); } else { const id=[...remotes].find(([,r])=>r.mesh===top)?.[0]; if(id) send({type:'hit', target:id, dmg, by:player.id}); } } }
function tracer(o:THREE.Vector3,d:THREE.Vector3,len:number){ const g=new THREE.BufferGeometry().setFromPoints([o.clone(), o.clone().addScaledVector(d,len)]); const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xfff0a0,transparent:true,opacity:.7})); scene.add(l); setTimeout(()=>scene.remove(l),45); }
function send(msg:Msg){ for(const c of conns) if(c.open) c.send(msg); }
function netState():PlayerNet{ return {id:player.id,x:player.pos.x,y:player.pos.y,z:player.pos.z,ry:player.yaw,hp:player.hp,team:player.team,name:player.name,score:player.score}; }
function onMsg(m:Msg){ if(m.type==='state'||m.type==='join'){ const p=(m as any).player as PlayerNet; if(p.id===player.id) return; let r=remotes.get(p.id); if(!r){const start=new THREE.Vector3(p.x,p.y-1.7,p.z); r={mesh:makeRemote(p.team?0xf97316:0x38bdf8), state:p, target:start.clone(), targetRy:p.ry, lastSeen:performance.now()}; r.mesh.position.copy(start); remotes.set(p.id,r); feed(p.name+' joined');} r.state=p; r.target.set(p.x,p.y-1.7,p.z); r.targetRy=p.ry; r.lastSeen=performance.now(); } if(m.type==='hit'&&m.target===player.id){ player.hp-=m.dmg; feed('hit by '+m.by+' -'+m.dmg); if(player.hp<=0){ player.hp=100; const spawn=spawns[player.team] || spawns[0]; player.pos.copy(spawn); player.vel.set(0,0,0); feed('respawn'); }} if(m.type==='shot'){ tracer(new THREE.Vector3(...m.origin), new THREE.Vector3(...m.dir), 60); }}
setInterval(()=>{ send({type:'state', player:netState()}); },80);
(document.querySelector('#host') as HTMLButtonElement).onclick=()=>{ const peer=new Peer(); peer.on('open',id=>(document.querySelector('#peerOut')!).textContent='Host id: '+id); peer.on('connection',conn=>wire(conn)); };
(document.querySelector('#join') as HTMLButtonElement).onclick=()=>{ const code=(document.querySelector('#joinCode') as HTMLInputElement).value.trim(); const peer=new Peer(); peer.on('open',()=>wire(peer.connect(code))); };
function wire(conn:any){ conns.push(conn); conn.on('open',()=>{ conn.send({type:'join', player:netState()}); feed('peer connected');}); conn.on('data',(d:Msg)=>onMsg(d)); }
function updateRemotes(dt:number){
 const now=performance.now();
 for(const [id,r] of remotes){
  if(now-r.lastSeen>10000){ scene.remove(r.mesh); remotes.delete(id); continue; }
  const alpha=1-Math.pow(0.001, dt);
  r.mesh.position.lerp(r.target, alpha);
  const diff=Math.atan2(Math.sin(r.targetRy-r.mesh.rotation.y), Math.cos(r.targetRy-r.mesh.rotation.y));
  r.mesh.rotation.y += diff * alpha;
 }
}
function hud(dt:number){ const w=weapons[player.weapon]; if(reloading){ reloading-=dt; if(reloading<=0){ const need=w.mag-player.ammo, take=Math.min(need,player.reserve); player.ammo+=take; player.reserve-=take; reloading=0; }}
 const hpEl = document.querySelector('#hp')!;
 if(hpEl) hpEl.textContent = `HP ${Math.ceil(player.hp)}`;
 const scEl = document.querySelector('#score')!;
 if(scEl) scEl.textContent = `Score ${player.score}`;
 const peerEl = document.querySelector('#peers')!;
 if(peerEl) peerEl.textContent = `Peers ${remotes.size}`;
 const wEl = document.querySelector('#weapon')!;
 if(wEl) wEl.textContent = `${w.name} ${player.ammo}/${player.reserve}`; }
let accumulator=0;
function loop(){
 const frameDt=Math.min(.05, clock.getDelta());
 accumulator += frameDt;
 const step=1/90;
 let ticks=0;
 while(accumulator>=step && ticks<5){ physics(step); accumulator-=step; ticks++; }
 updateRemotes(frameDt);
 hud(frameDt);
 renderenderer.render(scene,camera);
 requestAnimationFrame(loop);
}

function fire(){
 const w=weapons[player.weapon];
 if(reloading || player.ammo<=0) return;
 player.ammo--;
 player.recoil=0.15;
 const dir=new THREE.Vector3(0,0,-1).applyEuler(camera.rotation);
 traceShot(camera.position,dir,w.dmg);
 send({type:'shot', origin:camera.position.toArray() as any, dir:dir.toArray() as any, by:player.id});
 const flash = new THREE.PointLight(0xffaa00, 5, 12); flash.position.copy(camera.position); scene.add(flash); setTimeout(()=>scene.remove(flash), 50);
}

function traceShot(origin:THREE.Vector3,dir:THREE.Vector3,dmg:number){ const ray=new THREE.Raycaster(origin,dir,0,95); const objs=[...Array.from(remotes.values()).map(r=>r.mesh), ...scene.children.filter((o:THREE.Object3D)=>o.name==='mannequin')]; const hit=ray.intersectObjects(objs,true)[0]; tracer(origin,dir,hit?.distance||60); if(hit){ let top:any=hit.object; while(top.parent && top.parent!==scene) top=top.parent; if(top.name==='mannequin'){ top.position.y=-99; player.score++; feed('+1 mannequin pick'); } else { const id=[...remotes].find(([,r])=>r.mesh===top)?.[0]; if(id) send({type:'hit', target:id, dmg, by:player.id}); } } }
function tracer(o:THREE.Vector3,d:THREE.Vector3,len:number){ const g=new THREE.BufferGeometry().setFromPoints([o.clone(), o.clone().addScaledVector(d,len)]); const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xfff0a0,transparent:true,opacity:.7})); scene.add(l); setTimeout(()=>scene.remove(l),45); }
function send(msg:Msg){ for(const c of conns) if(c.open) c.send(msg); }
function netState():PlayerNet{ return {id:player.id,x:player.pos.x,y:player.pos.y,z:player.pos.z,ry:player.yaw,hp:player.hp,team:player.team,name:player.name,score:player.score}; }
function onMsg(m:Msg){ if(m.type==='state'||m.type==='join'){ const p=(m as any).player as PlayerNet; if(p.id===player.id) return; let r=remotes.get(p.id); if(!r){const start=new THREE.Vector3(p.x,p.y-1.7,p.z); r={mesh:makeRemote(p.team?0xf97316:0x38bdf8), state:p, target:start.clone(), targetRy:p.ry, lastSeen:performance.now()}; r.mesh.position.copy(start); remotes.set(p.id,r); feed(p.name+' joined');} r.state=p; r.target.set(p.x,p.y-1.7,p.z); r.targetRy=p.ry; r.lastSeen=performance.now(); } if(m.type==='hit'&&m.target===player.id){ player.hp-=m.dmg; feed('hit by '+m.by+' -'+m.dmg); if(player.hp<=0){ player.hp=100; const spawn=spawns[player.team] || spawns[0]; player.pos.copy(spawn); player.vel.set(0,0,0); feed('respawn'); }} if(m.type==='shot'){ tracer(new THREE.Vector3(...m.origin), new THREE.Vector3(...m.dir), 60); }}
setInterval(()=>{ send({type:'state', player:netState()}); },80);
(document.querySelector('#host') as HTMLButtonElement).onclick=()=>{ const peer=new Peer(); peer.on('open',id=>(document.querySelector('#peerOut')!).textContent='Host id: '+id); peer.on('connection',conn=>wire(conn)); };
(document.querySelector('#join') as HTMLButtonElement).onclick=()=>{ const code=(document.querySelector('#joinCode') as HTMLInputElement).value.trim(); const peer=new Peer(); peer.on('open',()=>wire(peer.connect(code))); };
function wire(conn:any){ conns.push(conn); conn.on('open',()=>{ conn.send({type:'join', player:netState()}); feed('peer connected');}); conn.on('data',(d:Msg)=>onMsg(d)); }
function updateRemotes(dt:number){
 const now=performance.now();
 for(const [id,r] of remotes){
  if(now-r.lastSeen>10000){ scene.remove(r.mesh); remotes.delete(id); continue; }
  const alpha=1-Math.pow(0.001, dt);
  r.mesh.position.lerp(r.target, alpha);
  const diff=Math.atan2(Math.sin(r.targetRy-r.mesh.rotation.y), Math.cos(r.targetRy-r.mesh.rotation.y));
  r.mesh.rotation.y += diff * alpha;
 }
}
const statsEl = document.querySelector('#stats')!;
const weaponEl = document.querySelector('#weapon')!;
function hud(dt:number){ const w=weapons[player.weapon]; if(reloading){ reloading-=dt; if(reloading<=0){ const need=w.mag-player.ammo, take=Math.min(need,player.reserve); player.ammo+=take; player.reserve-=take; reloading=0; }}
 if(statsEl) statsEl.textContent = `HP ${Math.ceil(player.hp)} · Score ${player.score} · Peers ${remotes.size}`;
 if(weaponEl) weaponEl.textContent = `${w.name} ${player.ammo}/${player.reserve}`; }

function physics(step:number){
 const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 14 : 8;
 const move = new THREE.Vector3();
 if(keys['KeyW']) move.z -= 1;
 if(keys['KeyS']) move.z += 1;
 if(keys['KeyA']) move.x -= 1;
 if(keys['KeyD']) move.x += 1;
 if(move.lengthSq() > 0) move.normalize();
 move.applyAxisAngle(new THREE.Vector3(0,1,0), player.yaw);
 player.pos.x += move.x * speed * step;
 player.pos.z += move.z * speed * step;
 player.vel.y -= 25 * step;
 player.pos.y += player.vel.y * step;
 if(player.pos.y < 1.7){ player.pos.y = 1.7; player.vel.y = 0; }
 if(keys['Space'] && player.pos.y <= 1.71){ player.vel.y = 8; }
 // Wall Collision
 player.pos.x = Math.max(-6, Math.min(6, player.pos.x));
 player.pos.z = Math.max(-60, Math.min(60, player.pos.z));
 camera.position.copy(player.pos);
 camera.rotation.order = 'YXZ';
 camera.rotation.y = player.yaw;
 camera.rotation.x = player.pitch;
}

let accumulator=0;
function loop(){
 const frameDt=Math.min(.05, clock.getDelta());
 accumulator += frameDt;
 const step=1/90;
 let ticks=0;
 while(accumulator>=step && ticks<5){ physics(step); accumulator-=step; ticks++; }
 updateRemotes(frameDt);
 hud(frameDt);
 renderer.render(scene,camera);
 requestAnimationFrame(loop);
}
