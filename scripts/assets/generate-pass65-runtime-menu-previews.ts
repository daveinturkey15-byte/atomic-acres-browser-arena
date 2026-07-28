import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium, type Browser, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import choreographyJson from '../../source-assets/menu/pass65-preview-masters/choreography.json';
import { menuPreviewDefinition, menuPreviewPose } from '../../src/ui/menu-preview-camera';
import type { ArenaId } from '../../src/map-selection';

const root = path.resolve(process.cwd());
const frameRoot = path.join(root, 'artifacts/pass65/menu-preview-master-frames');
const receiptPath = path.join(root, 'source-assets/menu/pass65-preview-masters/runtime-capture-receipt.json');
const port = Number(process.env.AA_PREVIEW_PORT ?? '44166');
const choreography = choreographyJson;
const canonicalArenas = Object.keys(choreography.arenas) as ArenaId[];
const captureRuntimePaths = ['src/legacy-main.ts', 'src/ui/menu-preview-camera.ts'] as const;
const captureToolPath = 'scripts/assets/generate-pass65-runtime-menu-previews.ts';
const arenaRuntimeSourcePaths: Readonly<Record<ArenaId, readonly string[]>> = Object.freeze({
  'atomic-acres': ['src/map.ts', 'src/arena-layout.ts', 'src/rendering/arenas/atomic-acres.ts'],
  'skyline-terminal': ['src/additional-maps.ts', 'src/rendering/arenas/skyline-terminal.ts'],
  'rustworks-1v1': ['src/additional-maps.ts', 'src/rendering/arenas/rustworks-1v1.ts'],
  'gun-range': ['src/additional-maps.ts', 'src/rendering/arenas/gun-range.ts'],
});
const selectedArenas = process.env.AA_PREVIEW_ARENAS
  ? process.env.AA_PREVIEW_ARENAS.split(',').map((value) => value.trim()).filter(Boolean) as ArenaId[]
  : canonicalArenas;
const requestedFrames = process.env.AA_PREVIEW_STILL_FRAME
  ? [Number(process.env.AA_PREVIEW_STILL_FRAME)]
  : process.env.AA_PREVIEW_STILL_FRAMES
    ? process.env.AA_PREVIEW_STILL_FRAMES.split(',').map(Number)
    : Array.from({ length: choreography.frameCount }, (_, index) => index + 1);
const chromeCandidates = [
  process.env.PASS64_CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter((candidate): candidate is string => Boolean(candidate));
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

if (!executablePath) throw new Error('Authoritative preview capture requires installed Google Chrome with WebGPU support');
if (choreography.schemaVersion !== 3 || choreography.capture.source !== 'authoritative-runtime-arena') {
  throw new Error('Pass 65 runtime capture requires canonical schema 3 authoritative-runtime choreography');
}
if (selectedArenas.some((arena) => !canonicalArenas.includes(arena))) {
  throw new Error(`AA_PREVIEW_ARENAS contains an unknown arena: ${selectedArenas.join(', ')}`);
}
if (requestedFrames.some((frame) => !Number.isInteger(frame) || frame < 1 || frame > choreography.frameCount)) {
  throw new Error(`Requested frames must be integers in 1..${choreography.frameCount}`);
}

type CaptureEvidence = {
  arenaId: ArenaId;
  kind: 'helicopter' | 'cat';
  presentationId: string;
  backend: string;
  softwareAdapter: boolean;
  constructionHistory: string[];
  residentArenaRoots: number;
  colliders: number;
  raycastMeshes: number;
  targets: number;
  viewmodelHidden: boolean;
  firstFrame: number;
  lastFrame: number;
  capturedFrames: number;
  reviewFrames: Array<{
    frame: number;
    requestedPosition: readonly number[];
    renderedPosition: number[];
    requestedFov: number;
    renderedFov: number;
    fixedVisualTimeMs: number;
    aboveArenaFloor: boolean;
    insideHorizontalCollider: boolean;
    pngSha256: string;
    seamSourceFrame?: number;
  }>;
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function sourceDigest(relativePath: string): Promise<{ path: string; sha256: string }> {
  return {
    path: relativePath,
    sha256: createHash('sha256').update(await readFile(path.join(root, relativePath))).digest('hex'),
  };
}

async function runtimeInputReceipt(): Promise<{
  captureTool: { path: string; sha256: string };
  captureRuntime: Array<{ path: string; sha256: string }>;
  arenas: Record<string, Array<{ path: string; sha256: string }>>;
}> {
  return {
    captureTool: await sourceDigest(captureToolPath),
    captureRuntime: await Promise.all(captureRuntimePaths.map(sourceDigest)),
    arenas: Object.fromEntries(await Promise.all(canonicalArenas.map(async (arenaId) => [
      arenaId,
      await Promise.all(arenaRuntimeSourcePaths[arenaId].map(sourceDigest)),
    ]))),
  };
}

function cameraAngles(position: readonly number[], target: readonly number[]): { yaw: number; pitch: number } {
  const dx = target[0]! - position[0]!;
  const dy = target[1]! - position[1]!;
  const dz = target[2]! - position[2]!;
  return {
    yaw: Math.atan2(-dx, -dz),
    pitch: Math.atan2(dy, Math.max(0.000_1, Math.hypot(dx, dz))),
  };
}

async function installCaptureSurface(page: Page, kind: 'helicopter' | 'cat'): Promise<void> {
  await page.evaluate(({ kind, palette, scale }) => {
    document.querySelector('#offline-menu-preview-overlay')?.remove();
    const style = document.createElement('style');
    style.id = 'offline-menu-preview-capture-style';
    style.textContent = `
      html,body,#app{width:100%;height:100%;margin:0!important;overflow:hidden!important;background:#000!important}
      #app>*:not(#game):not(#offline-menu-preview-overlay){display:none!important}
      #game{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;display:block!important}
      #offline-menu-preview-overlay{position:fixed;inset:0;z-index:2147483647;pointer-events:none;color:${palette[3]};font:600 9px/1.1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-shadow:0 1px 2px #000}
      #offline-menu-preview-overlay *{box-sizing:border-box}
      .aa-rotor{position:absolute;left:31%;top:3.1%;width:38%;height:6%;transform-origin:50% 50%;opacity:.78}
      .aa-rotor:before,.aa-rotor:after{content:"";position:absolute;left:0;top:45%;width:100%;height:10%;border-radius:100%;background:linear-gradient(90deg,transparent,${palette[2]} 16%,${palette[3]} 50%,${palette[2]} 84%,transparent);box-shadow:0 0 7px #000}
      .aa-rotor:after{transform:rotate(90deg)}
      .aa-rotor-hub{position:absolute;left:47%;top:25%;width:6%;height:50%;border-radius:50%;background:${palette[0]};border:1px solid ${palette[3]}}
      .aa-cockpit{position:absolute;left:33%;bottom:3%;width:34%;height:12.5%;display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:8px;padding:8px 10px;border:1px solid ${palette[2]};border-radius:7px 7px 16px 16px;background:linear-gradient(180deg,rgba(17,23,25,.84),rgba(5,7,8,.94));box-shadow:0 7px 22px rgba(0,0,0,.7),inset 0 1px rgba(255,255,255,.08)}
      .aa-panel{position:relative;min-width:0;border:1px solid rgba(155,165,170,.38);background:${palette[0]};padding:7px 6px;overflow:hidden}
      .aa-panel:after{content:"";position:absolute;left:12%;right:12%;bottom:6px;height:2px;background:#708b8d;box-shadow:0 0 4px #5e7477}
      .aa-panel strong{display:block;color:#b3bdc1;font-size:10px;margin-top:4px;letter-spacing:.08em}
      .aa-panel span{display:block;color:#708184;font-size:7px;white-space:nowrap}
      .aa-brace{position:absolute;bottom:0;width:2px;height:26%;background:linear-gradient(transparent,${palette[2]});opacity:.65}.aa-brace.left{left:22%;transform:rotate(16deg)}.aa-brace.right{right:22%;transform:rotate(-16deg)}
      .aa-canopy{position:absolute;top:15%;bottom:13%;width:7%;border-style:solid;border-color:${palette[2]};filter:drop-shadow(0 4px 7px #000);opacity:.72}.aa-canopy.left{left:18%;border-width:0 3px 3px 0;transform:skewX(-7deg)}.aa-canopy.right{right:18%;border-width:0 0 3px 3px;transform:skewX(7deg)}
      .aa-glass{position:absolute;top:17%;bottom:16%;width:12%;opacity:.1;mix-blend-mode:screen}.aa-glass.left{left:23%;background:linear-gradient(118deg,rgba(185,205,210,.52),transparent 24%)}.aa-glass.right{right:23%;background:linear-gradient(242deg,rgba(185,205,210,.52),transparent 24%)}
      .aa-ear{position:absolute;top:2.4%;width:9%;height:12%;background:linear-gradient(145deg,#9ba5aa 0%,${palette[2]} 28%,${palette[0]} 78%);clip-path:polygon(50% 0,91% 78%,76% 70%,100% 100%,0 100%,24% 70%,9% 78%);filter:drop-shadow(0 0 2px #c3cacc) drop-shadow(0 4px 5px #000)}
      .aa-ear:before{content:"";position:absolute;inset:15% 19% 12%;background:linear-gradient(160deg,#7f878a,#3d4447);clip-path:polygon(50% 0,92% 100%,8% 100%);opacity:.94}
      .aa-ear:after{content:"";position:absolute;left:42%;right:42%;bottom:0;height:25%;background:#c1c8ca;clip-path:polygon(50% 0,100% 100%,0 100%)}.aa-ear.left{left:29%;transform:rotate(-6deg)}.aa-ear.right{right:29%;transform:scaleX(-1) rotate(-6deg)}
      .aa-paw{position:absolute;bottom:-1.2%;width:8%;height:7.4%;border:2px solid ${palette[3]};border-radius:48% 48% 30% 30%;background:linear-gradient(${palette[2]},${palette[0]});box-shadow:0 -2px 8px #000}.aa-paw.left{left:33%;transform:rotate(7deg)}.aa-paw.right{right:33%;transform:rotate(-7deg)}
      .aa-paw:before{content:"";position:absolute;left:32%;top:31%;width:36%;height:39%;border-radius:50%;background:#777d7f;box-shadow:-14px -9px 0 -4px #777d7f,0 -13px 0 -4px #777d7f,14px -9px 0 -4px #777d7f}
    `;
    document.head.append(style);
    const overlay = document.createElement('div');
    overlay.id = 'offline-menu-preview-overlay';
    overlay.dataset.kind = kind;
    overlay.dataset.scale = String(scale);
    overlay.dataset.palette = palette.join(',');
    overlay.innerHTML = kind === 'helicopter'
      ? '<div class="aa-rotor"><i class="aa-rotor-hub"></i></div><i class="aa-canopy left"></i><i class="aa-canopy right"></i><i class="aa-glass left"></i><i class="aa-glass right"></i><i class="aa-brace left"></i><i class="aa-brace right"></i><div class="aa-cockpit"><div class="aa-panel"><span>ALT / RADAR</span><strong id="aa-alt">024 M</strong></div><div class="aa-panel"><span>FLIGHT PATH</span><strong id="aa-heading">HOLD 000</strong></div><div class="aa-panel"><span>ROTOR / LINK</span><strong>ARMED</strong></div></div>'
      : '<div class="aa-ear left"></div><div class="aa-ear right"></div><div class="aa-paw left"></div><div class="aa-paw right"></div>';
    document.querySelector('#app')?.append(overlay);
  }, { kind, palette: choreography.capture.overlayPalette, scale: choreography.capture.overlayScale });
}

async function captureArena(page: Page, arenaId: ArenaId): Promise<CaptureEvidence> {
  const definition = menuPreviewDefinition(arenaId);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route('**/v1/leaderboard?*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"entries":[]}' }));
  await page.route('**/v1/streak', (route) => route.fulfill({ status: 202, contentType: 'application/json', body: '{"accepted":true}' }));
  await page.goto(`http://127.0.0.1:${port}/?release=latest&renderer=webgpu&render=blender&seed=${definition.seed}&menuPreviewCapture=1`);
  await page.waitForFunction(() => {
    const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__?: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return ['menu-video-ready', 'ready'].includes(snapshot?.bootstrap.stage)
      && snapshot?.render.runtime.actualBackend === 'webgpu'
      && snapshot?.render.runtime.softwareAdapter === false
      && document.querySelector<HTMLButtonElement>('#solo')?.disabled === false;
  }, undefined, { timeout: 75_000 });
  await page.locator(`.map-card[data-arena-id="${arenaId}"]`).click();
  await page.locator('#player-name').fill(`PASS65 ${arenaId} CAPTURE`);
  await page.locator('#solo').click();
  await page.waitForFunction((expected) => {
    const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.gameStarted === true
      && snapshot.arenaSelection.id === expected
      && snapshot.arenaSelection.streaming.constructionHistory[0] === expected
      && snapshot.arenaSelection.streaming.residentArenaRoots === 1
      && snapshot.render.runtime.actualBackend === 'webgpu'
      && snapshot.render.runtime.presentation.status === 'healthy';
  }, arenaId, { timeout: 90_000 });
  await page.evaluate(() => {
    const debug = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
    debug.setCaptureViewmodelHidden(true);
    debug.setBotsFrozen(true);
    debug.clearBots();
  });
  await page.waitForFunction(() => {
    const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.sniperScope.viewmodelVisible === false;
  });
  await installCaptureSurface(page, definition.kind);
  const directory = path.join(frameRoot, arenaId);
  const reviewFrameEvidence: CaptureEvidence['reviewFrames'] = [];
  await mkdir(directory, { recursive: true });
  if (requestedFrames.length === choreography.frameCount) await rm(directory, { recursive: true, force: true }).then(() => mkdir(directory, { recursive: true }));

  for (const frame of requestedFrames) {
    const elapsedMs = (frame - 1) / (choreography.frameCount - 1) * definition.durationMs;
    const fixedVisualTimeMs = choreography.capture.fixedTimeStartMs + (elapsedMs % definition.durationMs);
    const pose = menuPreviewPose(arenaId, elapsedMs);
    const angles = cameraAngles(pose.position, pose.target);
    const before = await page.evaluate(() => {
      const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot();
      return { frameCount: snapshot.frameCount, submissionSequence: snapshot.render.runtime.presentation.submissionSequence };
    });
    await page.evaluate(({ pose, yaw, pitch, fixedTimeMs, seed, frame, rotorTurns, altitude }) => {
      const debug = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
      debug.setCaptureCameraPose(pose.position[0], pose.position[1], pose.position[2], yaw, pitch, pose.fov, fixedTimeMs, seed);
      debug.setGrassTime(fixedTimeMs / 1_000);
      const overlay = document.querySelector<HTMLElement>('#offline-menu-preview-overlay');
      if (overlay) {
        overlay.dataset.frame = String(frame);
        overlay.querySelector<HTMLElement>('.aa-rotor')?.style.setProperty('transform', `rotate(${pose.pathProgress * rotorTurns * 360}deg)`);
        overlay.querySelector<HTMLElement>('#aa-alt')?.replaceChildren(`${Math.round(altitude).toString().padStart(3, '0')} M`);
        overlay.querySelector<HTMLElement>('#aa-heading')?.replaceChildren(`HDG ${Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360).toString().padStart(3, '0')}`);
        if (pose.frame === 'cat') {
          const paw = overlay.querySelector<HTMLElement>(frame % 2 === 0 ? '.aa-paw.left' : '.aa-paw.right');
          paw?.style.setProperty('translate', `0 ${-Math.max(0, Math.sin(pose.pathProgress * Math.PI * 8)) * 5}px`);
        }
      }
    }, {
      pose,
      yaw: angles.yaw,
      pitch: angles.pitch,
      fixedTimeMs: fixedVisualTimeMs,
      seed: definition.seed,
      frame,
      rotorTurns: choreography.helicopter.rotorTurnsPerLoop,
      altitude: pose.position[1],
    });
    await page.waitForFunction((minimum) => {
      const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot();
      return snapshot.frameCount >= minimum.frameCount + 4
        && snapshot.render.runtime.presentation.submissionSequence >= minimum.submissionSequence + 3
        && snapshot.sniperScope.viewmodelVisible === false;
    }, before);
    const rendered = await page.evaluate(() => {
      const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot();
      return {
        position: snapshot.render.playableScene.cameraComposition.position as number[],
        fov: snapshot.sniperScope.cameraFov as number,
        fixedVisualTimeMs: snapshot.render.playableScene.deterministicReview.fixedTimeMs as number | null,
        aboveArenaFloor: snapshot.render.playableScene.cameraComposition.aboveArenaFloor as boolean,
        insideHorizontalCollider: snapshot.render.playableScene.cameraComposition.insideHorizontalCollider as boolean,
      };
    });
    const positionError = Math.hypot(...pose.position.map((value, index) => value - rendered.position[index]!));
    if (positionError > 0.01
      || Math.abs(rendered.fov - pose.fov) > 0.1
      || Math.abs((rendered.fixedVisualTimeMs ?? -1) - fixedVisualTimeMs) > 0.01
      || rendered.aboveArenaFloor !== true
      || rendered.insideHorizontalCollider !== false
      || (pose.frame === 'helicopter' && rendered.position[1]! < definition.safeVolume.y[0])) {
      throw new Error(`${arenaId} frame ${frame} did not present the requested capture camera: ${JSON.stringify({ pose, rendered, positionError })}`);
    }
    const framePath = path.join(directory, `frame-${String(frame).padStart(4, '0')}.png`);
    const seamSourcePath = path.join(directory, 'frame-0001.png');
    const copiedSeam = frame === choreography.frameCount && existsSync(seamSourcePath);
    if (copiedSeam) {
      await copyFile(seamSourcePath, framePath);
    } else {
      await page.screenshot({ path: framePath, animations: 'disabled', scale: 'css' });
    }
    if (choreography.reviewFrames.includes(frame)) {
      reviewFrameEvidence.push({
        frame,
        requestedPosition: pose.position,
        renderedPosition: rendered.position,
        requestedFov: pose.fov,
        renderedFov: rendered.fov,
        fixedVisualTimeMs,
        aboveArenaFloor: rendered.aboveArenaFloor,
        insideHorizontalCollider: rendered.insideHorizontalCollider,
        pngSha256: createHash('sha256').update(await readFile(framePath)).digest('hex'),
        ...(copiedSeam ? { seamSourceFrame: 1 } : {}),
      });
    }
  }

  const snapshot = await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot());
  if (errors.length > 0) throw new Error(`${arenaId} runtime capture errors: ${[...new Set(errors)].join(' | ')}`);
  return {
    arenaId,
    kind: definition.kind,
    presentationId: definition.presentationId,
    backend: snapshot.render.runtime.actualBackend,
    softwareAdapter: snapshot.render.runtime.softwareAdapter,
    constructionHistory: snapshot.arenaSelection.streaming.constructionHistory,
    residentArenaRoots: snapshot.arenaSelection.streaming.residentArenaRoots,
    colliders: snapshot.arenaSelection.colliders,
    raycastMeshes: snapshot.arenaSelection.raycastMeshes,
    targets: snapshot.arenaSelection.targets,
    viewmodelHidden: snapshot.sniperScope.viewmodelVisible === false,
    firstFrame: Math.min(...requestedFrames),
    lastFrame: Math.max(...requestedFrames),
    capturedFrames: requestedFrames.length,
    reviewFrames: reviewFrameEvidence,
  };
}

async function main(): Promise<void> {
  let server: ViteDevServer | undefined;
  let browser: Browser | undefined;
  const evidence: CaptureEvidence[] = [];
  const runtimeInputs = await runtimeInputReceipt();
  try {
    server = await createServer({ root, server: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
    await server.listen();
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
    });
    for (const arenaId of selectedArenas) {
      const page = await browser.newPage({
        viewport: { width: choreography.capture.viewport[0], height: choreography.capture.viewport[1] },
        deviceScaleFactor: 1,
      });
      try {
        evidence.push(await captureArena(page, arenaId));
      } finally {
        await page.close();
      }
    }
    const finalRuntimeInputs = await runtimeInputReceipt();
    if (JSON.stringify(finalRuntimeInputs) !== JSON.stringify(runtimeInputs)) {
      throw new Error('Runtime capture inputs changed during authoring; all staged frames are rejected as stale');
    }
    const receipt = {
      schemaVersion: 1,
      captureId: 'pass65-authoritative-runtime-menu-preview-capture-v1',
      generatedAt: '2026-07-28',
      recipeId: choreography.recipeId,
      recipeDigest: sha256(JSON.stringify(choreography)),
      source: choreography.capture.source,
      backendRequired: choreography.capture.backend,
      viewport: choreography.capture.viewport,
      overlay: {
        scale: choreography.capture.overlayScale,
        palette: choreography.capture.overlayPalette,
        mode: 'offline-baked-compact-black-grey',
        liveLoadingRenderer: false,
      },
      frameRoster: requestedFrames,
      runtimeInputs,
      arenas: evidence,
    };
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ capture: 'passed', receipt: path.relative(root, receiptPath), arenas: evidence }, null, 2));
  } finally {
    await browser?.close();
    await server?.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
