/**
 * map3/main.ts — Map 3 Demo Showcase, standalone preview.
 *
 * WHY THIS IS A SEPARATE HTML ENTRY.
 *
 * Registering a new arena in Atomic Acres touches ~80 files across 21 hardcoded
 * rosters, two of which are frozen rollback benchmarks that must not be edited
 * at all. Doing that FIRST, before anyone has looked at the art, spends the
 * risky half of the work on content that may well change. So this is a second
 * Vite page: it imports from `three` and `three/webgpu` exactly as the game
 * does, shares the repo's no-ShaderMaterial contract, and touches not one
 * existing file. When the corridors are approved, the corridor modules move
 * into an arena unchanged and only the registration work remains.
 *
 * Controls: WASD to walk, mouse to look (click to capture), Shift to sprint,
 * Space to jump, Escape to release the pointer.
 */
import * as THREE from 'three';
import { WebGPURenderer, MeshStandardNodeMaterial } from 'three/webgpu';
import { vec3 } from 'three/tsl';

import {
  createNatureCorridor, createMathsCorridor, createGrammarCorridor, type Corridor,
} from './corridors';

/* ---------------------------------------------------------------- */
/* Signage — canvas to CanvasTexture on a world plane.               */
/* The repo's own lesson, kept: never a THREE.Sprite. A billboarded  */
/* sign grows across the viewport as you approach and clips.         */
/* ---------------------------------------------------------------- */

function createSign(title: string, skill: string, widthM = 5.2, heightM = 1.5): THREE.Mesh | null {
  if (typeof document === 'undefined') return null;
  const W = 1024;
  const H = Math.round((W * heightM) / widthM);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0d1416';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#4fbfc6';
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 8, W - 16, H - 16);

  // Skill name — the label Dave asked to see at both ends of every corridor.
  ctx.fillStyle = '#4fbfc6';
  ctx.font = '600 34px "Arial Narrow", "Roboto Condensed", Arial, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(skill.toUpperCase(), 40, 34);

  // Title, auto-fitted so a long one never overflows the plate.
  let size = 58;
  ctx.font = `700 ${size}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
  while (ctx.measureText(title).width > W - 80 && size > 22) {
    size -= 2;
    ctx.font = `700 ${size}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`;
  }
  ctx.fillStyle = '#e7efee';
  ctx.fillText(title, 40, 92);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    toneMapped: false, side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(widthM, heightM);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 8;
  mesh.userData.presentationOnly = true;
  return mesh;
}

/**
 * Report which GPU is actually rendering.
 *
 * A browser can silently fall back to a software rasteriser (Microsoft Basic
 * Render Driver on Windows, SwiftShader, llvmpipe) and everything still works
 * — it just runs on the CPU. An fps number measured there is not a performance
 * number, and it looks exactly like a real one. This cost a whole optimisation
 * round on 2026-08-31: 22 fps that turned out to be a software rasteriser in an
 * embedded preview pane, not a scene problem.
 *
 * So the HUD says which it is, always. If it says SOFTWARE, ignore the fps.
 */
function gpuIdentity(): { renderer: string; software: boolean } {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') as WebGL2RenderingContext | null;
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg && gl
      ? String(gl.getParameter((dbg as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL))
      : 'unknown';
    return {
      renderer,
      software: /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer),
    };
  } catch {
    return { renderer: 'unknown', software: false };
  }
}

/* ---------------------------------------------------------------- */
/* Bootstrap                                                         */
/* ---------------------------------------------------------------- */

async function main(): Promise<void> {
  const status = document.getElementById('status')!;
  const hud = document.getElementById('hud')!;

  if (!('gpu' in navigator)) {
    status.textContent =
      'WebGPU is not available in this browser. Map 3 is a WebGPU-only exhibit by design — '
      + 'the corridors use TSL node materials the WebGL2 path cannot compile.';
    return;
  }

  const renderer = new WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  await renderer.init();
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fb3c4);
  scene.fog = new THREE.Fog(0x8fb3c4, 30, 150);

  const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.08, 400);
  camera.position.set(2.5, 1.7, 4.0);

  // --- lighting -------------------------------------------------------
  // A low sun is what makes translucency visible at all: with the sun overhead
  // no leaf is ever backlit from the player's eye height.
  // Intensity and elevation are tuned, not guessed: leaf albedo in linear
  // working space is genuinely dark (a healthy leaf is ~0.07/0.19/0.03), so a
  // "reasonable-looking" intensity leaves a canopy black. The sun is also LOW
  // and placed down the nature corridor's axis rather than overhead, because
  // transmission is only visible when the leaf is between the light and the
  // eye — an overhead sun makes the whole technique invisible.
  const sun = new THREE.DirectionalLight(0xfff0d0, 4.2);
  sun.position.set(60, 16, 104);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 190;
  const s = 34;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbcd8e8, 0x38402c, 1.9));

  // --- hub ------------------------------------------------------------
  const hubMat = new MeshStandardNodeMaterial();
  hubMat.roughness = 0.94;
  hubMat.colorNode = vec3(0.29, 0.3, 0.29);
  const hubGeo = new THREE.CircleGeometry(15, 48);
  hubGeo.rotateX(-Math.PI / 2);
  const hub = new THREE.Mesh(hubGeo, hubMat);
  hub.receiveShadow = true;
  scene.add(hub);

  // Ground plane beyond the hub so the world does not end in void.
  const groundMat = new MeshStandardNodeMaterial();
  groundMat.roughness = 1;
  groundMat.colorNode = vec3(0.23, 0.26, 0.2);
  const groundGeo = new THREE.PlaneGeometry(600, 600);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // --- corridors ------------------------------------------------------
  const corridors: Corridor[] = [
    createNatureCorridor(7),
    createMathsCorridor(),
    createGrammarCorridor(11),
  ];

  const HUB_R = 15;
  corridors.forEach((c, i) => {
    // Fan the corridors out from the hub. Three of them at 90 degrees apart
    // keeps each fully visible from the centre.
    const angle = -Math.PI / 2 + (i - 1) * (Math.PI / 3);
    const pivot = new THREE.Group();
    pivot.rotation.y = angle;
    pivot.position.set(0, 0, 0);

    c.group.position.set(0, 0, -HUB_R + 1);
    pivot.add(c.group);
    scene.add(pivot);

    // Sign at the hub end, facing the player as they arrive.
    const near = createSign(c.title, c.skill);
    if (near) {
      near.position.set(0, 2.6, -HUB_R + 0.5);
      // Faces back toward the hub, so it is readable on approach.
      pivot.add(near);
    }
    // Sign at the far end, facing back — so you always know what you walked.
    const far = createSign(c.title, c.skill);
    if (far) {
      far.position.set(0, 2.6, -HUB_R - c.length + 1);
      far.rotation.y = Math.PI;   // readable when walking back out
      pivot.add(far);
    }
  });

  // --- first-person controls ------------------------------------------
  // Matched to the game's real numbers so the feel carries over:
  // walk 6.15 m/s, sprint 8.7, eye height 1.7, jump 6.35 at g = -24.5.
  const keys = new Set<string>();
  let yaw = -2.618;   // face the nature corridor from the hub
  let pitch = 0;
  let vy = 0;
  let grounded = true;
  const EYE = 1.7;

  renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
  document.addEventListener('pointerlockchange', () => {
    hud.style.opacity = document.pointerLockElement ? '0.35' : '1';
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.42, Math.min(1.42, pitch));
  });
  window.addEventListener('keydown', (e) => {
    keys.add(e.code);
    if (e.code === 'Space' && grounded) { vy = 6.35; grounded = false; }
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const gpu = gpuIdentity();
  const gpuShort = gpu.software
    ? 'SOFTWARE RENDERER — fps below is NOT a hardware number'
    : gpu.renderer.replace(/^ANGLE \(|\)$/g, '').slice(0, 46);

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const clock = new THREE.Clock();
  let frames = 0;
  let fpsAccum = 0;
  let fps = 0;

  function tick(): void {
    const dt = Math.min(clock.getDelta(), 0.05);
    const elapsed = clock.elapsedTime;

    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const speed = sprint ? 8.7 : 6.15;

    forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    right.set(Math.cos(yaw), 0, -Math.sin(yaw));

    const move = new THREE.Vector3();
    if (keys.has('KeyW')) move.add(forward);
    if (keys.has('KeyS')) move.sub(forward);
    if (keys.has('KeyD')) move.add(right);
    if (keys.has('KeyA')) move.sub(right);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);
    camera.position.add(move);

    vy += -24.5 * dt;
    camera.position.y += vy * dt;
    if (camera.position.y <= EYE) { camera.position.y = EYE; vy = 0; grounded = true; }

    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    corridors.forEach((c) => c.update(elapsed, dt));

    renderer.renderAsync(scene, camera);

    frames++;
    fpsAccum += dt;
    if (fpsAccum >= 0.5) {
      fps = Math.round(frames / fpsAccum);
      frames = 0;
      fpsAccum = 0;
      const dc = (renderer.info?.render as { drawCalls?: number } | undefined)?.drawCalls ?? 0;
      hud.textContent = `${fps} fps · ${dc} draws · ${gpuShort}`;
      hud.style.color = gpu.software ? '#e2865c' : '#cfe3e2';
    }
    requestAnimationFrame(tick);
  }

  status.remove();
  hud.textContent = 'click to look around · WASD to walk · ' + gpuShort;
  requestAnimationFrame(tick);

  // Expose a tiny probe so a QA harness can drive the camera from the render
  // loop rather than a page timer (a page-context setInterval is throttled the
  // moment the tab loses focus and freezes the capture half a second in).
  (window as unknown as Record<string, unknown>).__MAP3 = {
    camera,
    scene,
    renderer,
    sun,
    setPose(x: number, y: number, z: number, ry: number, rx = 0) {
      camera.position.set(x, y, z);
      yaw = ry; pitch = rx;
    },
    fps: () => fps,
  };
}

main().catch((err) => {
  const status = document.getElementById('status');
  if (status) status.textContent = 'Map 3 failed to start: ' + (err?.message ?? String(err));
  console.error(err);
});
