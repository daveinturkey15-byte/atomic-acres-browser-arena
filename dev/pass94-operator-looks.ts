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
 * game.
 */

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { buildOperator, poseOperator } from '../src/art-kit';
import {
  deathRiggedOperator,
  loadOperatorSkinAsset,
  loadRiggedOperatorAsset,
} from '../src/operator-model';
import { OPERATOR_LOOK_REGISTRY, resolveOperatorLook } from '../src/operator-skin-look-registry';
import { setOperatorLookRenderBackend } from '../src/operator-skin-tsl-materials';
import type { Team } from '../src/protocol';

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
const TILE_W = 320;
const TILE_H = 400;
const SETTLE_FRAMES = 150;
const STEP_S = 1 / 60;

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
  // Three-quarter front, slightly above the chest; dropped and pulled back for
  // the ground stances so the whole body stays in frame.
  if (stance === 'prone') {
    camera.position.set(2.6, 1.15, 3.0);
    camera.lookAt(0, 0.25, 0);
  } else if (stance === 'crouch') {
    camera.position.set(2.1, 1.25, 2.9);
    camera.lookAt(0, 0.65, 0);
  } else {
    camera.position.set(2.2, 1.55, 3.1);
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
  canvas: HTMLCanvasElement,
  tiles: readonly Tile[],
): Promise<void> {
  const rows = Math.ceil(tiles.length / COLUMNS);
  canvas.width = COLUMNS * TILE_W;
  canvas.height = rows * TILE_H;
  canvas.style.width = `${COLUMNS * TILE_W}px`;
  sheet.style.width = `${COLUMNS * TILE_W}px`;
  renderer.setSize(canvas.width, canvas.height, false);
  labels.replaceChildren();

  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, canvas.width, canvas.height);
  renderer.clear();
  renderer.autoClear = false;
  renderer.setScissorTest(true);

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index]!;
    say(`rendering ${index + 1}/${tiles.length}: ${tile.label}`);

    const scene = studio();
    const operator = buildOperator(tile.team, `capture-${index}`, false, null, 'team', tile.skinId);
    scene.add(operator);
    // `buildOperator` returns the rigged root itself, so the death clip is
    // requested on it directly; the fallback covers a wrapper if that ever
    // changes.
    if (tile.dead === true && !deathRiggedOperator(operator)) {
      for (const child of operator.children) if (deathRiggedOperator(child)) break;
    }
    // Settle the blend graphs, the posture cross-fade and the sprint envelope
    // at a fixed step, so the sheet is deterministic rather than whatever the
    // frame the screenshot happened to land on.
    for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
      if (tile.travel === true) operator.position.z -= tile.speedMps * STEP_S;
      poseOperator(operator, tile.stance, tile.speedMps, frame * 0.016, 1, 0, STEP_S);
    }
    // Bring the operator back under the camera; the pose is already settled.
    operator.position.set(0, 0, 0);
    operator.updateWorldMatrix(true, true);

    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    // WebGPU viewport origin is bottom-left; the grid is authored top-left.
    const y = canvas.height - (row + 1) * TILE_H;
    renderer.setViewport(column * TILE_W, y, TILE_W, TILE_H);
    renderer.setScissor(column * TILE_W, y, TILE_W, TILE_H);
    await renderer.renderAsync(scene, tileCamera(tile.stance));
    drawLabel(index, tile.label);

    scene.remove(operator);
  }

  renderer.setScissorTest(false);
  renderer.autoClear = true;
}

async function main(): Promise<void> {
  const mode = new URLSearchParams(location.search).get('mode') ?? 'gaits';
  // `procedural` opens the look gate; `tinted` closes it, which reproduces the
  // shipped multiply-tint path on the same renderer, same lights, same poses.
  const backend = new URLSearchParams(location.search).get('looks') === 'tinted' ? 'webgl2' : 'webgpu';
  setOperatorLookRenderBackend(backend);

  const canvas = document.createElement('canvas');
  sheet.insertBefore(canvas, labels);
  const renderer = new WebGPURenderer({ canvas, antialias: true });
  await renderer.init();
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  say('loading operator assets');
  await loadAll();

  const tiles = mode === 'skins' ? SKIN_TILES : GAIT_TILES;
  await renderSheet(renderer, canvas, tiles);

  const looks = OPERATOR_LOOK_REGISTRY.looks.map((look) => look.id).join(', ');
  say(`READY mode=${mode} looks=${backend === 'webgpu' ? 'procedural' : 'tinted'} registry=[${looks}]`);
  document.body.dataset.captureReady = '1';
}

void main().catch((error: unknown) => {
  say(`FAILED ${String(error)}`);
  document.body.dataset.captureFailed = '1';
});
