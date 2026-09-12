import * as THREE from 'three';
import { MeshStandardNodeMaterial, WebGPURenderer } from 'three/webgpu';
import { buildNorthHouseFacade } from '../forge-kit/facade';

declare global {
  interface Window {
    __FACADE_READY__?: { mode: string; view: string; skyPreset: string; backend: string };
  }
}

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') === 'before' ? 'before' : 'after';
const view = params.get('view') ?? 'front';
const stage = document.querySelector('#stage');
if (!stage) throw new Error('facade stage missing');
const label = document.querySelector('#label');
if (label) label.textContent = `${mode} · ${view}`;

function material(color: number, roughness: number): MeshStandardNodeMaterial {
  const mat = new MeshStandardNodeMaterial({ color, roughness, metalness: 0.02 });
  mat.type = 'MeshStandardMaterial';
  return mat;
}

function addBox(root: THREE.Group, name: string, size: [number, number, number], position: [number, number, number], mat: THREE.Material): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
}

function buildBeforeFacade(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'arena-current-north-house-front-reconstruction';
  const siding = material(0xd0a47f, 0.78);
  const trim = material(0xf0e2c6, 0.68);
  const glass = material(0x6d9496, 0.25);
  const roof = material(0x4e5555, 0.92);
  addBox(root, 'current-flat-siding-wall', [11, 6.2, 0.30], [0, 3.1, 0], siding);
  for (const x of [-3.95, -1.55, 2.95]) addBox(root, 'current-ground-window', [1.72, 2.1, 0.06], [x, 1.68, 0.19], glass);
  for (const x of [-3.75, 0, 3.75]) addBox(root, 'current-upper-window', [2.05, 2.2, 0.06], [x, 4.75, 0.19], glass);
  addBox(root, 'current-door', [1.04, 2.45, 0.08], [0.05, 1.22, 0.20], trim);
  addBox(root, 'current-roof-deck', [11.2, 0.30, 4.8], [0, 6.35, 0], roof);
  addBox(root, 'current-front-fascia', [11.2, 0.12, 0.12], [0, 6.08, 0.20], trim);
  return root;
}

function lookAtFor(name: string): THREE.Vector3 {
  if (name === 'window-close') return new THREE.Vector3(2.95, 2.0, 0.12);
  return new THREE.Vector3(0, 3.0, 0);
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9b7b5);
const groundMaterial = material(0x6b756e, 0.92);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
ground.receiveShadow = true;
scene.add(ground);

const facade = mode === 'before' ? buildBeforeFacade() : buildNorthHouseFacade();
scene.add(facade);

const sun = new THREE.DirectionalLight(0xfff1ce, 3.2);
sun.position.set(-8, 11, 13);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.1;
sun.shadow.camera.far = 45;
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -4;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8fb0bf, 0.42));
scene.add(new THREE.HemisphereLight(0xfff1ce, 0x8fb0bf, 0.42));
const fill = new THREE.DirectionalLight(0x7897b2, 1.5);
fill.position.set(8, 5, -10);
scene.add(fill);

const camera = new THREE.PerspectiveCamera(38, 1280 / 720, 0.1, 100);
if (view === 'three-quarter') camera.position.set(10.2, 4.4, 14.0);
else if (view === 'window-close') camera.position.set(6.1, 2.8, 8.5);
else camera.position.set(0, 3.7, 17.5);
camera.lookAt(lookAtFor(view));

const renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(1280, 720, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
stage.prepend(renderer.domElement);

await renderer.init();
renderer.render(scene, camera);
await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
renderer.render(scene, camera);
const backend = (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
const backendName = backend?.isWebGPUBackend === true ? 'webgpu' : 'unknown';
document.documentElement.dataset.renderBackend = backendName;
window.__FACADE_READY__ = { mode, view, skyPreset: 'nuketown2-golden-hour', backend: backendName };
