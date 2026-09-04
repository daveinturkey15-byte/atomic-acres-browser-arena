/**
 * PASS 94 evidence harness — operator looks and gaits, rendered through the
 * SHIPPED path.
 *
 * This is not a re-implementation. It calls `loadOperatorSkinAsset`,
 * `buildOperator` and `poseOperator` exactly as the game does, so the garment
 * materials come from `materialForTeam` (and therefore from the procedural look
 * registry when the backend gate is open) and the posture and locomotion come
 * from `updateRiggedOperator` -> `advanceOperatorPosture` ->
 * `advanceOperatorAnimation`.
 *
 * What it does NOT reproduce is an arena: lighting here is a neutral studio rig
 * so the garment is judged on its own, not on Nuke Town's sun. Read the sheets
 * as material and pose evidence, not as an in-game look.
 *
 * Driven by `scripts/pass94/capture-operator-looks.mjs`. Never imported by the
 * game. It lives at the repository ROOT, not under `dev/`, because the operator
 * asset URLs are relative (`./assets/...`) and only resolve from the same depth
 * as `index.html`.
 */

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { buildOperator, poseOperator } from './src/art-kit';
import {
  deathRiggedOperator,
  loadOperatorSkinAsset,
  loadRiggedOperatorAsset,
} from './src/operator-model';
import { OPERATOR_LOOK_REGISTRY, resolveOperatorLook } from './src/operator-skin-look-registry';
import { setOperatorLookRenderBackend } from './src/operator-skin-tsl-materials';
import type { Team } from './src/protocol';

type Stance = 'stand' | 'crouch' | 'prone';

type Tile = Readonly<{
  label: string;
  skinId: string;
  team: Team;
  stance: Stance;
  speedMps: number;
  dead?: boolean;
  /** Metres of forward travel per second, so the locomotion solve sees motion. */
  travel?: boolean;
}>;

const COLUMNS = 5;
// `scale` shrinks the sheet for the software-adapter fallback run, where every
// pixel is shaded on the CPU. The layout is identical; only the resolution
// changes, so the two runs stay comparable.
const SCALE = Math.min(1, Math.max(0.25, Number(new URLSearchParams(location.search).get('scale') ?? '1') || 1));
const TILE_W = Math.round(320 * SCALE);
const TILE_H = Math.round(400 * SCALE);
// The settle loop must advance REAL time. `poseOperator`'s explicit delta only
// reaches the weapon animation; `updateRiggedOperator` derives its own dt from
// `performance.now() - lastUpdatedAt`, so a synchronous loop hands the mixer,
// the blend graph and the posture cross-fade a delta of about zero and every
// tile comes out in the same bind-ish pose. The first capture did exactly that:
// idle, walk, run, sprint and death were five photographs of one pose.
const SETTLE_FRAMES = 96;
const STEP_MS = 16;
const STEP_S = STEP_MS / 1000;

function nextFrame(): Promise<void> {
  return new Promise((resolveFrame) => { setTimeout(resolveFrame, STEP_MS); });
}

const SKINS = ['default', 'explorer', 'symbiote', 'navalops'] as const;

const GAIT_TILES: readonly Tile[] = Object.freeze([
  { label: 'idle', skinId: 'default', team: 0, stance: 'stand', speedMps: 0 },
  { label: 'walk 1.2', skinId: 'default', team: 0, stance: 'stand', speedMps: 1.2, travel: true },
  { label: 'run 4.2', skinId: 'default', team: 0, stance: 'stand', speedMps: 4.2, travel: true },
  { label: 'sprint 8.7', skinId: 'default', team: 0, stance: 'stand', speedMps: 8.7, travel: true },
  { label: 'death', skinId: 'default', team: 0, stance: 'stand', speedMps: 0, dead: true },
  { label: 'crouch idle', skinId: 'default', team: 0, stance: 'crouch', speedMps: 0 },
  { label: 'crouch walk 1.8', skinId: 'default', team: 0, stance: 'crouch', speedMps: 1.8, travel: true },
  { label: 'prone idle', skinId: 'default', team: 0, stance: 'prone', speedMps: 0 },
  { label: 'prone crawl 0.9', skinId: 'default', team: 0, stance: 'prone', speedMps: 0.9, travel: true },
]);

const SKIN_TILES: readonly Tile[] = Object.freeze(
  ([0, 1] as const).flatMap((team) => SKINS.map((skinId) => ({
    label: `${skinId} / team ${team} / ${resolveOperatorLook(skinId, team).displayName}`,
    skinId,
    team: team as Team,
    stance: 'stand' as Stance,
    speedMps: 0,
  }))),
);

const status = document.getElementById('status') as HTMLDivElement;
const sheet = document.getElementById('sheet') as HTMLDivElement;
const labels = document.getElementById('labels') as HTMLDivElement;

function say(text: string): void {
  status.textContent = text;
}

function studio(): THREE.Scene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1f23);
  const key = new THREE.DirectionalLight(0xfff2e0, 3.1);
  key.position.set(2.4, 3.6, 2.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xbfd6ff, 1.15);
  fill.position.set(-2.9, 1.6, 1.4);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 1.5);
  rim.position.set(-0.6, 2.2, -3.4);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9fb4c4, 0x2a2622, 0.55));
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x2c3237, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  return scene;
}

function tileCamera(stance: Stance): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(30, TILE_W / TILE_H, 0.1, 60);
  // Three-quarter FRONT. The first capture put the camera at +Z and produced
  // eight photographs of the operators' backs: the authored rig faces +Z, not
  // three's default -Z, so the front of the body is on the negative side.
  if (stance === 'prone') {
    camera.position.set(1.7, 1.0, -3.2);
    camera.lookAt(0, 0.2, 0);
  } else if (stance === 'crouch') {
    camera.position.set(1.5, 1.15, -3.1);
    camera.lookAt(0, 0.6, 0);
  } else {
    camera.position.set(1.5, 1.5, -3.4);
    camera.lookAt(0, 0.95, 0);
  }
  return camera;
}

async function loadAll(): Promise<void> {
  await loadRiggedOperatorAsset();
  for (const skinId of SKINS) {
    if (skinId === 'default') continue;
    await loadOperatorSkinAsset(skinId);
  }
}

function drawLabel(index: number, text: string): void {
  const column = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const element = document.createElement('div');
  element.className = 'label';
  element.textContent = text;
  element.style.left = `${column * TILE_W + 8}px`;
  element.style.top = `${row * TILE_H + 8}px`;
  labels.appendChild(element);
}

async function renderSheet(
  renderer: WebGPURenderer,
  gpuCanvas: HTMLCanvasElement,
  sheetCanvas: HTMLCanvasElement,
  tiles: readonly Tile[],
): Promise<void> {
  const rows = Math.ceil(tiles.length / COLUMNS);
  // Each tile is rendered at FULL canvas size and then blitted into the sheet.
  // The first attempt drove one canvas with per-tile viewport and scissor and
  // `autoClear = false`; it produced one black tile and a figure grid offset
  // from its own labels. Rendering whole frames and compositing them in 2D has
  // no such failure mode, and a contact sheet is not a place to be clever.
  gpuCanvas.width = TILE_W;
  gpuCanvas.height = TILE_H;
  renderer.setSize(TILE_W, TILE_H, false);

  sheetCanvas.width = COLUMNS * TILE_W;
  sheetCanvas.height = rows * TILE_H;
  sheetCanvas.style.width = `${COLUMNS * TILE_W}px`;
  sheet.style.width = `${COLUMNS * TILE_W}px`;
  const context = sheetCanvas.getContext('2d');
  if (!context) throw new Error('no 2d context for the contact sheet');
  context.fillStyle = '#14171a';
  context.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);
  labels.replaceChildren();

  const scene = studio();

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index]!;
    say(`rendering ${index + 1}/${tiles.length}: ${tile.label}`);

    const operator = buildOperator(tile.team, `capture-${index}`, false, null, 'team', tile.skinId);
    scene.add(operator);
    // `buildOperator` returns the rigged root itself, so the death clip is
    // requested on it directly; the fallback covers a wrapper if that ever
    // changes.
    if (tile.dead === true && !deathRiggedOperator(operator)) {
      for (const child of operator.children) if (deathRiggedOperator(child)) break;
    }
    // Settle the blend graphs, the posture cross-fade and the sprint envelope
    // at a fixed step, so the sheet is deterministic rather than whatever frame
    // the screenshot happened to land on.
    for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
      await nextFrame();
      if (tile.travel === true) operator.position.z += tile.speedMps * STEP_S;
      poseOperator(operator, tile.stance, tile.speedMps, frame * STEP_S, 1, 0, STEP_S);
    }
    // Bring the operator back under the camera; the pose is already settled.
    operator.position.set(0, 0, 0);
    operator.updateWorldMatrix(true, true);

    await renderer.renderAsync(scene, tileCamera(tile.stance));
    context.drawImage(gpuCanvas, (index % COLUMNS) * TILE_W, Math.floor(index / COLUMNS) * TILE_H);
    drawLabel(index, tile.label);

    scene.remove(operator);
  }
}

async function main(): Promise<void> {
  const mode = new URLSearchParams(location.search).get('mode') ?? 'gaits';
  // `procedural` opens the look gate; `tinted` closes it, which reproduces the
  // shipped multiply-tint path on the same renderer, same lights, same poses.
  const backend = new URLSearchParams(location.search).get('looks') === 'tinted' ? 'webgl2' : 'webgpu';
  setOperatorLookRenderBackend(backend);

  // The WebGPU canvas is off-sheet and tile-sized; the visible sheet is a 2D
  // canvas the tiles are blitted into.
  const gpuCanvas = document.createElement('canvas');
  gpuCanvas.style.display = 'none';
  document.body.appendChild(gpuCanvas);
  const sheetCanvas = document.createElement('canvas');
  sheet.insertBefore(sheetCanvas, labels);
  const renderer = new WebGPURenderer({ canvas: gpuCanvas, antialias: true });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  say('loading operator assets');
  await loadAll();

  const tiles = mode === 'skins' ? SKIN_TILES : GAIT_TILES;
  await renderSheet(renderer, gpuCanvas, sheetCanvas, tiles);

  const looks = OPERATOR_LOOK_REGISTRY.looks.map((look) => look.id).join(', ');
  say(`READY mode=${mode} looks=${backend === 'webgpu' ? 'procedural' : 'tinted'} registry=[${looks}]`);
  document.body.dataset.captureReady = '1';
}

void main().catch((error: unknown) => {
  say(`FAILED ${String(error)}`);
  document.body.dataset.captureFailed = '1';
});
