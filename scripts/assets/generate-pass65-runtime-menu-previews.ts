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
import { canonicalPass65PreviewArenaDependencies } from './pass65-menu-preview-arena-dependencies';
import { buildDependencyClosure, digestOrderedFileSet } from './pass65-menu-preview-integrity.mjs';

const root = path.resolve(process.cwd());
const frameRoot = path.join(root, 'artifacts/pass65/menu-preview-master-frames');
const receiptPath = path.join(root, 'source-assets/menu/pass65-preview-masters/runtime-capture-receipt.json');
const reviewReceiptPath = path.join(root, 'artifacts/pass65/menu-preview-rotor-review/runtime-capture-receipt.json');
const port = Number(process.env.AA_PREVIEW_PORT ?? '44166');
const reviewOnly = process.env.AA_PREVIEW_REVIEW_ONLY === '1';
const choreography = choreographyJson;
const generatedAt = choreography.generatedAt;
const canonicalArenas = Object.keys(choreography.arenas) as ArenaId[];
const captureToolPaths = [
  'scripts/assets/generate-pass65-runtime-menu-previews.ts',
  'scripts/assets/pass65-menu-preview-integrity.mjs',
  'scripts/assets/pass65-menu-preview-integrity.d.mts',
  'scripts/assets/pass65-menu-preview-arena-dependencies.ts',
] as const;
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
if (choreography.schemaVersion !== 4
  || choreography.recipeId !== 'pass66-authoritative-runtime-menu-preview-v2'
  || choreography.captureId !== 'pass66-authoritative-runtime-menu-preview-capture-v2'
  || choreography.generatedAt !== '2026-08-02'
  || choreography.media.cacheKey !== 'pass66-runtime-preview-v13'
  || choreography.fps !== 30
  || choreography.durationSeconds !== 8
  || choreography.frameCount !== 240
  || choreography.capture.source !== 'authoritative-runtime-arena'
  || choreography.capture.viewport[0] !== 2560
  || choreography.capture.viewport[1] !== 1440
  || choreography.capture.overlayReferenceViewport[0] !== 1280
  || choreography.capture.overlayReferenceViewport[1] !== 720
  || choreography.capture.overlayOutputScale !== 2) {
  throw new Error('Pass 66 runtime capture requires the canonical 2560x1440 schema 4 authoritative-runtime choreography');
}
if (selectedArenas.some((arena) => !canonicalArenas.includes(arena))) {
  throw new Error(`AA_PREVIEW_ARENAS contains an unknown arena: ${selectedArenas.join(', ')}`);
}
if (requestedFrames.some((frame) => !Number.isInteger(frame) || frame < 1 || frame > choreography.frameCount)) {
  throw new Error(`Requested frames must be integers in 1..${choreography.frameCount}`);
}
if (new Set(requestedFrames).size !== requestedFrames.length
  || requestedFrames.some((frame, index) => index > 0 && frame <= requestedFrames[index - 1]!)) {
  throw new Error('Requested frames must be unique and strictly ascending');
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
  frameSet: {
    algorithm: string;
    domain: string;
    fileCount: number;
    totalBytes: number;
    sha256: string;
    frameRoster: number[];
  };
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
    rotorProjection?: {
      mode: string | null;
      stageTopFraction: number;
      stageBottomFraction: number;
      stageWidthFraction: number;
      stageHeightFraction: number;
      stageAreaFraction: number;
      bladeCount: number;
      arcCount: number;
      temporalTrailCount: number;
      legibleBladeSweeps: number;
      projectedBladeThresholdPixels: number;
      shortestProjectedBladeLengthPixels: number;
      projectedSweepSpanPixels: number;
      projectedArcSpanPixels: number;
      authoredBladeThicknessPixels: number;
      bladeOpacity: number;
      contrastMode: string | null;
      filledDiscDetected: boolean;
      hubDiameterPixels: number;
      hubCanopyOverlapPixels: number;
      hubCanopyOcclusionFraction: number;
      mastCanopyOverlapPixels: number;
      structuralTieCount: number;
      leftTieHeaderOverlapAreaPixels: number;
      rightTieHeaderOverlapAreaPixels: number;
      leftTieCanopyOverlapAreaPixels: number;
      rightTieCanopyOverlapAreaPixels: number;
      leftTieHeaderOcclusionSampled: boolean;
      rightTieHeaderOcclusionSampled: boolean;
      leftTieCanopyOcclusionSampled: boolean;
      rightTieCanopyOcclusionSampled: boolean;
      hubCanopyOcclusionSampled: boolean;
      mastCanopyOcclusionSampled: boolean;
      occlusionStackValid: boolean;
      reticleClear: boolean;
      tailOpticClear: boolean;
      poseTransform: string;
      poseResponsive: boolean;
      poseShiftXPixels: number;
      poseShiftYPixels: number;
      poseBankDegrees: number;
      discPitchResponseDegrees: number;
      discYawResponseDegrees: number;
    };
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
  captureTools: Array<{ path: string; sha256: string }>;
  canonicalArenaDependencies: Awaited<ReturnType<typeof canonicalPass65PreviewArenaDependencies>>;
  dependencyClosure: Awaited<ReturnType<typeof buildDependencyClosure>>;
}> {
  const canonicalArenaDependencies = await canonicalPass65PreviewArenaDependencies();
  if (canonicalArenaDependencies.arenaOrder.join(',') !== canonicalArenas.join(',')) {
    throw new Error('Canonical arena dependency roster/order does not match preview choreography');
  }
  const extraPaths = canonicalArenaDependencies.arenas.flatMap((arena) => arena.localAssetPaths);
  return {
    captureTools: await Promise.all(captureToolPaths.map(sourceDigest)),
    canonicalArenaDependencies,
    dependencyClosure: await buildDependencyClosure(root, { extraPaths }),
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
  await page.evaluate(({ kind, palette, scale, referenceViewport, outputScale, rotorPresentation }) => {
    document.querySelector('#offline-menu-preview-overlay')?.remove();
    const style = document.createElement('style');
    style.id = 'offline-menu-preview-capture-style';
    style.textContent = `
      html,body,#app{width:100%;height:100%;margin:0!important;overflow:hidden!important;background:#000!important}
      #app>*:not(#game):not(#offline-menu-preview-overlay){display:none!important}
      #game{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;display:block!important}
      #offline-menu-preview-overlay{position:fixed;left:0;top:0;width:${referenceViewport[0]}px;height:${referenceViewport[1]}px;z-index:2147483647;pointer-events:none;color:${palette[3]};font:600 9px/1.1 ui-monospace,Consolas,monospace;letter-spacing:.16em;text-shadow:0 1px 2px #000;transform:scale(${outputScale});transform-origin:0 0}
      #offline-menu-preview-overlay *{box-sizing:border-box}
      .aa-main-rotor-stage{position:absolute;z-index:1;left:${(100 - rotorPresentation.mainStageWidthPercent) / 2}%;top:${rotorPresentation.mainStageTopPercent}%;width:${rotorPresentation.mainStageWidthPercent}%;height:${rotorPresentation.mainStageHeightPercent}%;perspective:1400px;transform-style:preserve-3d;overflow:hidden;isolation:isolate;transform-origin:50% 68%;transform:translate3d(var(--aa-main-rotor-shift-x,0px),var(--aa-main-rotor-shift-y,0px),0) rotate(var(--aa-main-rotor-bank,0deg));filter:drop-shadow(0 2px 4px rgba(0,0,0,.62));opacity:.9}
      .aa-main-rotor-arc{position:absolute;z-index:1;left:4%;right:4%;height:52%;border-radius:50%;border-top:2px solid rgba(151,190,193,.22);filter:blur(1.1px);transform-origin:50% 100%;pointer-events:none}
      .aa-main-rotor-arc.near{top:4%;border-top-color:rgba(203,227,225,.27);transform:rotate(-1.2deg) scaleY(.72)}
      .aa-main-rotor-arc.mid{left:10%;right:10%;top:12%;border-top-color:rgba(111,160,164,.2);filter:blur(1.7px);transform:rotate(.8deg) scaleY(.58)}
      .aa-main-rotor-arc.far{left:18%;right:18%;top:20%;border-top-color:rgba(81,129,133,.14);filter:blur(2.2px);transform:rotate(-.45deg) scaleY(.44)}
      .aa-main-rotor-plane{position:absolute;z-index:2;left:-5%;right:-5%;top:-30%;height:165%;transform-origin:50% 52%;transform-style:preserve-3d;transform:rotateX(calc(${rotorPresentation.mainDiscPitchDegrees}deg + var(--aa-main-rotor-pitch-response,0deg))) rotateY(var(--aa-main-rotor-yaw-response,0deg)) rotateZ(var(--aa-main-rotor-angle,0deg))}
      .aa-main-rotor-blade{position:absolute;left:50%;top:51%;width:48%;height:3px;transform-origin:0 50%;border-radius:2px 88% 88% 2px;background:linear-gradient(90deg,rgba(12,18,20,.72) 0%,rgba(31,43,46,.52) 32%,rgba(94,119,121,.26) 72%,rgba(179,205,203,.08) 94%,transparent 100%);filter:blur(.75px);box-shadow:0 1px 2px rgba(0,0,0,.34);opacity:0.32}
      .aa-main-rotor-blade:before,.aa-main-rotor-blade:after{content:"";position:absolute;left:2%;top:-1px;width:96%;height:4px;transform-origin:0 50%;border-radius:2px 90% 90% 2px;pointer-events:none}
      .aa-main-rotor-blade:before{transform:rotate(-${rotorPresentation.mainNearTrailDegrees}deg) scaleX(.985);background:linear-gradient(90deg,rgba(155,190,191,${rotorPresentation.mainMotionBlurOpacity}) 0%,rgba(92,121,123,.1) 46%,transparent 100%);filter:blur(1.8px)}
      .aa-main-rotor-blade:after{transform:rotate(-${rotorPresentation.mainFarTrailDegrees}deg) scaleX(.95);background:linear-gradient(90deg,rgba(130,165,167,${(rotorPresentation.mainMotionBlurOpacity * 0.55).toFixed(3)}) 0%,rgba(72,101,103,.05) 48%,transparent 91%);filter:blur(2.4px)}
      .aa-main-rotor-blade:nth-child(2){transform:rotate(90deg)}.aa-main-rotor-blade:nth-child(3){transform:rotate(180deg)}.aa-main-rotor-blade:nth-child(4){transform:rotate(270deg)}
      .aa-main-rotor-mast{position:absolute;left:49.55%;top:25%;width:.9%;height:49%;border-radius:5px;background:linear-gradient(90deg,#050809 0%,#1b292c 28%,${palette[2]} 50%,#111a1c 72%,#040708 100%);box-shadow:0 2px 4px #000,inset 1px 0 rgba(193,229,222,.14);z-index:3}
      .aa-main-rotor-hub{position:absolute;left:48.8%;top:52%;width:2.4%;height:14%;border-radius:48% 52% 44% 56%;background:radial-gradient(ellipse at 38% 28%,#a7c4c1 0%,${palette[2]} 27%,#152225 58%,${palette[0]} 84%);border:1px solid rgba(164,214,207,.34);box-shadow:0 2px 5px #000,0 0 6px rgba(134,196,188,.1);z-index:4}
      .aa-main-rotor-structural-tie{position:absolute;top:69%;width:${rotorPresentation.mainStructuralTieWidthPercent}%;height:5px;border-top:1px solid rgba(150,198,195,.22);border-bottom:1px solid rgba(0,0,0,.78);border-radius:3px;background:linear-gradient(180deg,#33474a 0%,#121d20 44%,#05090b 100%);box-shadow:0 2px 4px #000;z-index:5}
      .aa-main-rotor-structural-tie.left{left:${rotorPresentation.mainStructuralTieInsetPercent}%;transform-origin:100% 50%;transform:rotate(-${rotorPresentation.mainStructuralTieAngleDegrees}deg)}
      .aa-main-rotor-structural-tie.right{right:${rotorPresentation.mainStructuralTieInsetPercent}%;transform-origin:0 50%;transform:rotate(${rotorPresentation.mainStructuralTieAngleDegrees}deg)}
      .aa-main-rotor-canopy-header{position:absolute;left:${(100 - rotorPresentation.mainCanopyHeaderWidthPercent) / 2}%;right:${(100 - rotorPresentation.mainCanopyHeaderWidthPercent) / 2}%;top:63%;height:37%;clip-path:polygon(9% 0,91% 0,100% 100%,0 100%);background:linear-gradient(180deg,#25383b 0%,#111c1f 25%,#070d0f 61%,#020506 100%);border-top:2px solid rgba(148,207,199,.24);box-shadow:0 -2px 4px rgba(0,0,0,.9),inset 0 1px rgba(184,224,217,.1);filter:drop-shadow(0 -1px 2px #000);z-index:6}
      .aa-main-rotor-canopy-header:before{content:"";position:absolute;left:12%;right:12%;top:5px;height:2px;background:linear-gradient(90deg,rgba(107,142,147,.18),rgba(181,222,226,.42) 50%,rgba(107,142,147,.18));box-shadow:20px 5px 0 -1px rgba(151,195,199,.18),-20px 5px 0 -1px rgba(151,195,199,.18)}
      .aa-tail-rotor-camera{position:absolute;z-index:8;right:12%;top:15%;width:8.4%;height:7.2%;overflow:hidden;border:1px solid rgba(89,213,194,.24);border-radius:2px;background:linear-gradient(180deg,rgba(9,23,25,.48),rgba(1,6,8,.72));box-shadow:inset 0 0 8px rgba(50,203,177,.08),0 2px 5px #000;opacity:.56}
      .aa-tail-rotor-camera:before{content:"TAIL CAM";position:absolute;left:6%;top:6%;z-index:4;color:rgba(126,236,206,.62);font-size:5px;letter-spacing:.11em;text-shadow:0 1px #000}
      .aa-tail-rotor-stage{position:absolute;inset:6% 5%;perspective:180px;transform-style:preserve-3d}
      .aa-tail-rotor-plane{position:absolute;right:8%;top:10%;width:43%;height:76%;transform-origin:50% 50%;transform-style:preserve-3d;transform:rotateY(${rotorPresentation.tailDiscYawDegrees}deg) rotateZ(var(--aa-tail-rotor-angle,0deg))}
      .aa-tail-rotor-plane:before{content:"";position:absolute;inset:3%;border:1px dashed rgba(140,217,203,.34);border-radius:50%;filter:blur(.65px)}
      .aa-tail-rotor-blade{position:absolute;left:4%;right:4%;top:48%;height:4%;border-radius:80%;background:linear-gradient(90deg,transparent,rgba(174,226,216,.52),transparent);filter:blur(.7px)}.aa-tail-rotor-blade:nth-child(2){transform:rotate(90deg)}
      .aa-tail-rotor-hub{position:absolute;left:43%;top:43%;width:14%;aspect-ratio:1;border-radius:50%;background:${palette[2]};border:1px solid rgba(210,245,247,.62);box-shadow:0 0 3px #000}
      .aa-tail-boom-occluder{position:absolute;left:-8%;top:47%;width:70%;height:14%;z-index:3;transform:rotate(-8deg);transform-origin:0 50%;clip-path:polygon(0 20%,100% 0,100% 100%,0 80%);background:linear-gradient(180deg,#35474b,#0c1315);border-top:1px solid rgba(151,203,209,.32)}
      .aa-cockpit{position:absolute;left:31%;bottom:1.4%;width:38%;height:11.8%;display:grid;grid-template-columns:1fr 1.28fr 1fr;gap:5px;padding:8px 10px 7px;border:1px solid rgba(91,222,199,.36);border-radius:9px 9px 22px 22px;clip-path:polygon(5% 0,95% 0,100% 34%,97% 100%,3% 100%,0 34%);background:linear-gradient(180deg,rgba(20,34,36,.94),rgba(3,9,11,.98) 45%,rgba(1,4,6,.99));box-shadow:0 8px 22px rgba(0,0,0,.82),0 0 9px rgba(52,209,181,.09),inset 0 1px rgba(185,232,222,.11)}
      .aa-cockpit:before{content:"";position:absolute;left:7%;right:7%;top:4px;height:1px;background:linear-gradient(90deg,transparent,#49bfc2 22%,#8ff0b6 50%,#49bfc2 78%,transparent);box-shadow:0 0 5px rgba(77,221,190,.42);opacity:.72}
      .aa-cockpit:after{content:"";position:absolute;left:44%;right:44%;bottom:4px;height:2px;border-radius:2px;background:#8ee8ac;box-shadow:-13px 0 #43aeb8,13px 0 #43aeb8,0 0 5px rgba(99,232,175,.38)}
      .aa-panel{position:relative;min-width:0;border:1px solid rgba(72,183,177,.28);border-radius:3px;background:radial-gradient(circle at 50% 120%,rgba(61,218,148,.14),transparent 58%),linear-gradient(180deg,rgba(6,19,22,.94),rgba(1,7,9,.98));padding:5px 5px;overflow:hidden;box-shadow:inset 0 0 6px rgba(55,187,177,.09)}
      .aa-panel:after{content:"";position:absolute;left:13%;right:13%;bottom:4px;height:1px;background:linear-gradient(90deg,#3aaab7,#78dca1);box-shadow:0 0 4px rgba(74,213,180,.32)}
      .aa-panel strong{display:block;color:#a3e9b9;font-size:9px;margin-top:3px;letter-spacing:.07em;text-shadow:0 0 4px rgba(82,205,144,.42)}
      .aa-panel span{display:block;color:#71bfc4;font-size:6px;white-space:nowrap;text-shadow:0 1px #000}
      .aa-brace{position:absolute;bottom:0;width:5px;height:27%;background:linear-gradient(transparent,#111b1e 40%,#263b3e 72%,#3f8e8a);box-shadow:0 0 3px rgba(56,157,151,.2);opacity:.94}.aa-brace.left{left:18%;transform:rotate(15deg)}.aa-brace.right{right:18%;transform:rotate(-15deg)}
      .aa-canopy{position:absolute;top:12%;bottom:10%;width:9%;border-style:solid;border-color:#18272a;filter:drop-shadow(0 4px 7px #000);opacity:.96}.aa-canopy.left{left:15%;border-width:0 5px 5px 0;transform:skewX(-7deg)}.aa-canopy.right{right:15%;border-width:0 0 5px 5px;transform:skewX(7deg)}
      .aa-glass{position:absolute;top:14%;bottom:13%;width:15%;opacity:.1;mix-blend-mode:screen}.aa-glass.left{left:20%;background:linear-gradient(118deg,rgba(79,193,184,.46),transparent 25%)}.aa-glass.right{right:20%;background:linear-gradient(242deg,rgba(79,193,184,.46),transparent 25%)}
      .aa-reticle{position:absolute;left:calc(50% - 10px);top:36%;width:20px;height:20px;border:1px solid rgba(109,222,166,.46);border-radius:50%;box-shadow:0 0 5px rgba(73,204,150,.24)}
      .aa-reticle:before,.aa-reticle:after{content:"";position:absolute;background:#93eab1;box-shadow:0 0 3px rgba(72,207,146,.44)}.aa-reticle:before{left:9px;top:-6px;width:1px;height:30px}.aa-reticle:after{left:-6px;top:9px;width:30px;height:1px}
      .aa-cat-crown{position:absolute;left:29%;right:29%;top:-5%;height:11%;border-radius:46% 46% 38% 38%;background:radial-gradient(ellipse at 50% 100%,#617076 0%,#242d31 48%,#070b0d 78%);filter:drop-shadow(0 4px 6px #000);opacity:.96}
      .aa-ear{position:absolute;top:.7%;width:9%;height:13%;border:1px solid rgba(190,207,210,.46);background:linear-gradient(145deg,#a7b4b8 0%,#59676d 25%,#1b2327 63%,#070a0c 100%);clip-path:polygon(50% 0,94% 83%,76% 73%,100% 100%,0 100%,24% 73%,6% 83%);filter:drop-shadow(0 0 2px rgba(205,222,224,.52)) drop-shadow(0 4px 6px #000);z-index:2}
      .aa-ear:before{content:"";position:absolute;inset:17% 21% 13%;background:linear-gradient(165deg,#efb7b7 4%,#916d78 48%,#30383d 100%);clip-path:polygon(50% 0,94% 100%,6% 100%);opacity:.96}
      .aa-ear:after{content:"";position:absolute;left:34%;right:34%;bottom:0;height:34%;background:linear-gradient(#c9d4d7,#637177);clip-path:polygon(50% 0,100% 100%,0 100%)}.aa-ear.left{left:29%;transform:rotate(-7deg)}.aa-ear.right{right:29%;transform:scaleX(-1) rotate(-7deg)}
      .aa-foreleg{position:absolute;bottom:-4%;width:7%;height:16%;border:1px solid rgba(185,204,207,.34);border-radius:48% 48% 30% 30%;background:linear-gradient(100deg,#080c0e,#56646a 46%,#20292d 78%,#070b0d);box-shadow:0 -3px 8px #000}.aa-foreleg.left{left:30%;transform:rotate(6deg)}.aa-foreleg.right{right:30%;transform:scaleX(-1) rotate(6deg)}
      .aa-paw{position:absolute;bottom:.5%;width:8.5%;height:7.5%;border:1px solid rgba(188,205,208,.5);border-radius:50% 50% 38% 38%;background:radial-gradient(circle at 50% 22%,#87959a,#364247 56%,#080c0e 100%);box-shadow:0 -3px 8px #000,0 0 3px rgba(188,216,217,.2);z-index:3}.aa-paw.left{left:29.2%;transform:rotate(6deg)}.aa-paw.right{right:29.2%;transform:rotate(-6deg)}
      .aa-paw:before{content:"";position:absolute;inset:12% 14% 18%;border-radius:46%;background:radial-gradient(circle at 12% 34%,rgba(218,226,227,.46) 0 5%,transparent 6%),radial-gradient(circle at 38% 18%,rgba(218,226,227,.46) 0 5%,transparent 6%),radial-gradient(circle at 64% 18%,rgba(218,226,227,.46) 0 5%,transparent 6%),radial-gradient(circle at 88% 34%,rgba(218,226,227,.46) 0 5%,transparent 6%),radial-gradient(ellipse at 50% 94%,rgba(196,133,139,.34) 0 17%,transparent 18%)}
      .aa-paw:after{content:"";position:absolute;left:20%;right:20%;top:10%;height:18%;border-top:1px solid rgba(225,235,236,.58);border-radius:50%}
    `;
    document.head.append(style);
    const overlay = document.createElement('div');
    overlay.id = 'offline-menu-preview-overlay';
    overlay.dataset.kind = kind;
    overlay.dataset.scale = String(scale);
    overlay.dataset.palette = palette.join(',');
    overlay.dataset.minimumProjectedBladeLength = String(rotorPresentation.mainMinimumProjectedBladeLengthPixels);
    overlay.dataset.minimumProjectedSweepSpan = String(rotorPresentation.mainMinimumProjectedSweepSpanPixels);
    overlay.dataset.minimumProjectedArcSpan = String(rotorPresentation.mainMinimumProjectedArcSpanPixels);
    overlay.innerHTML = kind === 'helicopter'
      ? '<div class="aa-main-rotor-stage" data-projection="perspective-elliptic-motion-arcs" data-contrast="graphite-low-contrast-motion-v1" data-occlusion-order="rotor-arcs<rotor-plane<mast-hub<structural-ties<canopy-header"><i class="aa-main-rotor-arc near"></i><i class="aa-main-rotor-arc mid"></i><i class="aa-main-rotor-arc far"></i><div class="aa-main-rotor-plane"><i class="aa-main-rotor-blade"></i><i class="aa-main-rotor-blade"></i><i class="aa-main-rotor-blade"></i><i class="aa-main-rotor-blade"></i></div><i class="aa-main-rotor-mast"></i><i class="aa-main-rotor-hub"></i><i class="aa-main-rotor-structural-tie left"></i><i class="aa-main-rotor-structural-tie right"></i><i class="aa-main-rotor-canopy-header"></i></div><div class="aa-tail-rotor-camera"><div class="aa-tail-rotor-stage"><div class="aa-tail-rotor-plane"><i class="aa-tail-rotor-blade"></i><i class="aa-tail-rotor-blade"></i><i class="aa-tail-rotor-hub"></i></div><i class="aa-tail-boom-occluder"></i></div></div><i class="aa-canopy left"></i><i class="aa-canopy right"></i><i class="aa-glass left"></i><i class="aa-glass right"></i><i class="aa-brace left"></i><i class="aa-brace right"></i><i class="aa-reticle"></i><div class="aa-cockpit"><div class="aa-panel"><span>ALT / RADAR</span><strong id="aa-alt">024 M</strong></div><div class="aa-panel"><span>VECTOR</span><strong id="aa-heading">HOLD 000</strong></div><div class="aa-panel"><span>ROTOR / LINK</span><strong>SYNC</strong></div></div>'
      : '<div class="aa-cat-crown"></div><div class="aa-ear left"></div><div class="aa-ear right"></div><div class="aa-foreleg left"></div><div class="aa-foreleg right"></div><div class="aa-paw left"></div><div class="aa-paw right"></div>';
    document.querySelector('#app')?.append(overlay);
  }, {
    kind,
    palette: choreography.capture.overlayPalette,
    scale: choreography.capture.overlayScale,
    referenceViewport: choreography.capture.overlayReferenceViewport,
    outputScale: choreography.capture.overlayOutputScale,
    rotorPresentation: choreography.helicopter.rotorPresentation,
  });
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
  // TSX names nested helpers during transpilation. Playwright serializes this
  // callback into the page realm, so provide the inert helper explicitly.
  await page.evaluate('globalThis.__name = globalThis.__name || ((target) => target);');
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
    await page.evaluate(({ pose, yaw, pitch, fixedTimeMs, seed, frame, mainRotorTurns, tailRotorTurns, altitude, rotorPose }) => {
      const debug = (window as unknown as { __ATOMIC_ACRES_DEBUG__: any }).__ATOMIC_ACRES_DEBUG__;
      debug.setCaptureCameraPose(pose.position[0], pose.position[1], pose.position[2], yaw, pitch, pose.fov, fixedTimeMs, seed);
      // Respawn, weapon-switch, and match lifecycle events may directly reveal
      // the viewmodel after the capture starts. Reassert the existing
      // synchronous authoring hide for every requested frame so late gameplay
      // presentation cannot leak into an otherwise healthy offline master.
      debug.setCaptureViewmodelHidden(true);
      debug.setGrassTime(fixedTimeMs / 1_000);
      const overlay = document.querySelector<HTMLElement>('#offline-menu-preview-overlay');
      if (overlay) {
        overlay.dataset.frame = String(frame);
        overlay.style.setProperty('--aa-main-rotor-angle', `${pose.pathProgress * mainRotorTurns * 360}deg`);
        overlay.style.setProperty('--aa-tail-rotor-angle', `${pose.pathProgress * tailRotorTurns * 360}deg`);
        if (pose.frame === 'helicopter') {
          const bankDegrees = pose.bankRadians * 180 / Math.PI;
          const normalizedLateral = pose.variance.yawDegrees / rotorPose.maximumYawDegrees * 0.62
            + bankDegrees / rotorPose.maximumFlightBankDegrees * 0.38;
          const shiftXPixels = Math.max(-rotorPose.maximumShiftPixels, Math.min(rotorPose.maximumShiftPixels, normalizedLateral * rotorPose.maximumShiftPixels));
          const shiftYPixels = Math.max(-rotorPose.maximumVerticalShiftPixels, Math.min(rotorPose.maximumVerticalShiftPixels, -pose.variance.pitchDegrees / rotorPose.maximumPitchDegrees * rotorPose.maximumVerticalShiftPixels));
          const presentationBankDegrees = Math.max(-rotorPose.maximumBankDegrees, Math.min(rotorPose.maximumBankDegrees, bankDegrees * 0.56));
          const discPitchResponseDegrees = Math.max(-rotorPose.maximumDiscPitchResponseDegrees, Math.min(rotorPose.maximumDiscPitchResponseDegrees, -pose.variance.pitchDegrees * 0.72));
          const discYawResponseDegrees = Math.max(-rotorPose.maximumDiscYawResponseDegrees, Math.min(rotorPose.maximumDiscYawResponseDegrees,
            pose.variance.yawDegrees * 0.56 + bankDegrees / rotorPose.maximumFlightBankDegrees * rotorPose.maximumDiscYawResponseDegrees * 0.24));
          overlay.style.setProperty('--aa-main-rotor-shift-x', `${shiftXPixels.toFixed(3)}px`);
          overlay.style.setProperty('--aa-main-rotor-shift-y', `${shiftYPixels.toFixed(3)}px`);
          overlay.style.setProperty('--aa-main-rotor-bank', `${presentationBankDegrees.toFixed(3)}deg`);
          overlay.style.setProperty('--aa-main-rotor-pitch-response', `${discPitchResponseDegrees.toFixed(3)}deg`);
          overlay.style.setProperty('--aa-main-rotor-yaw-response', `${discYawResponseDegrees.toFixed(3)}deg`);
          overlay.dataset.rotorPoseResponsive = 'true';
          overlay.dataset.rotorShiftX = shiftXPixels.toFixed(3);
          overlay.dataset.rotorShiftY = shiftYPixels.toFixed(3);
          overlay.dataset.rotorBank = presentationBankDegrees.toFixed(3);
          overlay.dataset.rotorDiscPitchResponse = discPitchResponseDegrees.toFixed(3);
          overlay.dataset.rotorDiscYawResponse = discYawResponseDegrees.toFixed(3);
        }
        overlay.querySelector<HTMLElement>('#aa-alt')?.replaceChildren(`${Math.round(altitude).toString().padStart(3, '0')} M`);
        overlay.querySelector<HTMLElement>('#aa-heading')?.replaceChildren(`HDG ${Math.round(((yaw * 180 / Math.PI) % 360 + 360) % 360).toString().padStart(3, '0')}`);
        if (pose.frame === 'cat') {
          const gait = Math.sin(pose.pathProgress * Math.PI * 8);
          const bob = Math.sin(pose.pathProgress * Math.PI * 4) * 2;
          overlay.querySelector<HTMLElement>('.aa-paw.left')?.style.setProperty('translate', `0 ${-Math.max(0, gait) * 8}px`);
          overlay.querySelector<HTMLElement>('.aa-paw.right')?.style.setProperty('translate', `0 ${-Math.max(0, -gait) * 8}px`);
          overlay.querySelector<HTMLElement>('.aa-foreleg.left')?.style.setProperty('translate', `0 ${-Math.max(0, gait) * 4}px`);
          overlay.querySelector<HTMLElement>('.aa-foreleg.right')?.style.setProperty('translate', `0 ${-Math.max(0, -gait) * 4}px`);
          overlay.querySelector<HTMLElement>('.aa-cat-crown')?.style.setProperty('translate', `0 ${bob}px`);
          overlay.querySelector<HTMLElement>('.aa-ear.left')?.style.setProperty('rotate', `${Math.max(0, Math.sin(pose.pathProgress * Math.PI * 6)) * -3}deg`);
          overlay.querySelector<HTMLElement>('.aa-ear.right')?.style.setProperty('rotate', `${Math.max(0, Math.sin(pose.pathProgress * Math.PI * 6 + 1.4)) * 3}deg`);
        }
      }
    }, {
      pose,
      yaw: angles.yaw,
      pitch: angles.pitch,
      fixedTimeMs: fixedVisualTimeMs,
      seed: definition.seed,
      frame,
      mainRotorTurns: choreography.helicopter.rotorPresentation.mainTurnsPerLoop,
      tailRotorTurns: choreography.helicopter.rotorPresentation.tailTurnsPerLoop,
      altitude: pose.position[1],
      rotorPose: {
        maximumShiftPixels: choreography.helicopter.rotorPresentation.mainMaximumPoseShiftPixels,
        maximumVerticalShiftPixels: choreography.helicopter.rotorPresentation.mainMaximumVerticalPoseShiftPixels,
        maximumBankDegrees: choreography.helicopter.rotorPresentation.mainMaximumPoseBankDegrees,
        maximumDiscPitchResponseDegrees: choreography.helicopter.rotorPresentation.mainMaximumDiscPitchResponseDegrees,
        maximumDiscYawResponseDegrees: choreography.helicopter.rotorPresentation.mainMaximumDiscYawResponseDegrees,
        maximumYawDegrees: choreography.helicopter.maximumYawDegrees,
        maximumPitchDegrees: choreography.helicopter.maximumPitchDegrees,
        maximumFlightBankDegrees: choreography.helicopter.maximumBankDegrees,
      },
    });
    try {
      await page.waitForFunction((minimum) => {
        const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot();
        return snapshot.frameCount >= minimum.frameCount + 4
          && snapshot.render.runtime.presentation.submissionSequence >= minimum.submissionSequence + 3
          && snapshot.sniperScope.viewmodelVisible === false;
      }, before, { timeout: 60_000 });
    } catch (error) {
      const stalled = await page.evaluate(() => {
        const snapshot = (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot();
        return {
          frameCount: snapshot.frameCount,
          submissionSequence: snapshot.render.runtime.presentation.submissionSequence,
          presentationStatus: snapshot.render.runtime.presentation.status,
          viewmodelVisible: snapshot.sniperScope.viewmodelVisible,
          runtimeErrors: snapshot.render.runtime.errors,
        };
      }).catch((snapshotError) => ({ snapshotError: snapshotError instanceof Error ? snapshotError.message : String(snapshotError) }));
      throw new Error(`${arenaId} frame ${frame} did not advance the requested capture presentation: ${JSON.stringify({ before, stalled })}`, { cause: error });
    }
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
    const rotorProjection = pose.frame === 'helicopter' ? await page.evaluate(() => {
      const overlay = document.querySelector<HTMLElement>('#offline-menu-preview-overlay')!;
      const stage = overlay.querySelector<HTMLElement>('.aa-main-rotor-stage')!;
      const plane = overlay.querySelector<HTMLElement>('.aa-main-rotor-plane')!;
      const arcs = [...overlay.querySelectorAll<HTMLElement>('.aa-main-rotor-arc')];
      const mast = overlay.querySelector<HTMLElement>('.aa-main-rotor-mast')!;
      const hub = overlay.querySelector<HTMLElement>('.aa-main-rotor-hub')!;
      const structuralTies = [...overlay.querySelectorAll<HTMLElement>('.aa-main-rotor-structural-tie')];
      const leftTie = overlay.querySelector<HTMLElement>('.aa-main-rotor-structural-tie.left')!;
      const rightTie = overlay.querySelector<HTMLElement>('.aa-main-rotor-structural-tie.right')!;
      const canopyHeader = overlay.querySelector<HTMLElement>('.aa-main-rotor-canopy-header')!;
      const leftCanopy = overlay.querySelector<HTMLElement>('.aa-canopy.left')!;
      const rightCanopy = overlay.querySelector<HTMLElement>('.aa-canopy.right')!;
      const tailOptic = overlay.querySelector<HTMLElement>('.aa-tail-rotor-camera')!;
      const reticle = overlay.querySelector<HTMLElement>('.aa-reticle')!;
      const rect = stage.getBoundingClientRect();
      const hubRect = hub.getBoundingClientRect();
      const mastRect = mast.getBoundingClientRect();
      const leftTieRect = leftTie.getBoundingClientRect();
      const rightTieRect = rightTie.getBoundingClientRect();
      const canopyHeaderRect = canopyHeader.getBoundingClientRect();
      const leftCanopyRect = leftCanopy.getBoundingClientRect();
      const rightCanopyRect = rightCanopy.getBoundingClientRect();
      const reticleRect = reticle.getBoundingClientRect();
      const planeStyle = getComputedStyle(plane);
      const before = getComputedStyle(plane, '::before');
      const after = getComputedStyle(plane, '::after');
      const blades = [...plane.querySelectorAll<HTMLElement>('.aa-main-rotor-blade')];
      const bladeRects = blades.map((blade) => blade.getBoundingClientRect());
      const arcRects = arcs.map((arc) => arc.getBoundingClientRect());
      const bladeLengths = bladeRects.map((bladeRect) => Math.max(bladeRect.width, bladeRect.height));
      const bladeStyle = getComputedStyle(blades[0]!);
      const bladeBefore = getComputedStyle(blades[0]!, '::before');
      const bladeAfter = getComputedStyle(blades[0]!, '::after');
      const overlayRect = overlay.getBoundingClientRect();
      const authoredScaleX = overlayRect.width / Math.max(1, overlay.offsetWidth);
      const authoredScaleY = overlayRect.height / Math.max(1, overlay.offsetHeight);
      const authoredStageWidth = stage.offsetWidth * authoredScaleX;
      const authoredStageHeight = stage.offsetHeight * authoredScaleY;
      const projectedBladeThresholdPixels = Number(overlay.dataset.minimumProjectedBladeLength);
      const visibleSweepLeft = Math.max(rect.left, Math.min(...bladeRects.map((bladeRect) => bladeRect.left)));
      const visibleSweepRight = Math.min(rect.right, Math.max(...bladeRects.map((bladeRect) => bladeRect.right)));
      const intersectionHeight = (left: DOMRect, right: DOMRect): number => Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
      const intersectionArea = (left: DOMRect, right: DOMRect): number => Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
        * intersectionHeight(left, right);
      const rectanglesOverlap = (left: DOMRect, right: DOMRect): boolean => left.left < right.right
        && left.right > right.left
        && left.top < right.bottom
        && left.bottom > right.top;
      const zIndex = (element: HTMLElement): number => Number.parseInt(getComputedStyle(element).zIndex, 10) || 0;
      const sampleOcclusion = (front: HTMLElement, back: HTMLElement, frontRect: DOMRect, backRect: DOMRect): boolean => {
        const left = Math.max(frontRect.left, backRect.left);
        const right = Math.min(frontRect.right, backRect.right);
        const top = Math.max(frontRect.top, backRect.top);
        const bottom = Math.min(frontRect.bottom, backRect.bottom);
        if (right <= left || bottom <= top) return false;
        for (const xRatio of [0.05, 0.25, 0.5, 0.75, 0.95]) {
          for (const yRatio of [0.05, 0.25, 0.5, 0.75, 0.95]) {
            const stack = document.elementsFromPoint(left + (right - left) * xRatio, top + (bottom - top) * yRatio);
            const frontIndex = stack.indexOf(front);
            const backIndex = stack.indexOf(back);
            if (frontIndex >= 0 && backIndex >= 0 && frontIndex < backIndex) return true;
          }
        }
        return false;
      };
      const previousPointerEvents = overlay.style.pointerEvents;
      overlay.style.pointerEvents = 'auto';
      const hubCanopyOverlapPixels = intersectionHeight(hubRect, canopyHeaderRect);
      const leftTieHeaderOcclusionSampled = sampleOcclusion(canopyHeader, leftTie, canopyHeaderRect, leftTieRect);
      const rightTieHeaderOcclusionSampled = sampleOcclusion(canopyHeader, rightTie, canopyHeaderRect, rightTieRect);
      const leftTieCanopyOcclusionSampled = sampleOcclusion(leftTie, leftCanopy, leftTieRect, leftCanopyRect);
      const rightTieCanopyOcclusionSampled = sampleOcclusion(rightTie, rightCanopy, rightTieRect, rightCanopyRect);
      const hubCanopyOcclusionSampled = sampleOcclusion(canopyHeader, hub, canopyHeaderRect, hubRect);
      const mastCanopyOcclusionSampled = sampleOcclusion(canopyHeader, mast, canopyHeaderRect, mastRect);
      overlay.style.pointerEvents = previousPointerEvents;
      const temporalTrailCount = [bladeBefore, bladeAfter].filter((style) => style.content !== 'none'
        && style.content !== 'normal'
        && style.backgroundImage !== 'none').length;
      const hasPseudoSurface = [before, after].some((style) => style.content !== 'none' && style.content !== 'normal');
      const hasPlaneSurface = planeStyle.backgroundImage !== 'none'
        || !['rgba(0, 0, 0, 0)', 'transparent'].includes(planeStyle.backgroundColor);
      return {
        mode: stage.dataset.projection ?? null,
        stageTopFraction: rect.top / window.innerHeight,
        stageBottomFraction: rect.bottom / window.innerHeight,
        // The capture overlay is authored at the reference viewport and then
        // scaled losslessly to 1440p. Measure the authored stage envelope at
        // output scale, excluding the permitted pose rotation/translation
        // that expands getBoundingClientRect near the loop extremes.
        stageWidthFraction: authoredStageWidth / window.innerWidth,
        stageHeightFraction: authoredStageHeight / window.innerHeight,
        stageAreaFraction: authoredStageWidth * authoredStageHeight / (window.innerWidth * window.innerHeight),
        bladeCount: blades.length,
        arcCount: arcs.length,
        temporalTrailCount,
        legibleBladeSweeps: bladeLengths.filter((length) => length >= projectedBladeThresholdPixels).length,
        projectedBladeThresholdPixels,
        shortestProjectedBladeLengthPixels: Math.min(...bladeLengths),
        projectedSweepSpanPixels: Math.max(0, visibleSweepRight - visibleSweepLeft),
        projectedArcSpanPixels: Math.max(...arcRects.map((arcRect) => arcRect.width)),
        authoredBladeThicknessPixels: Number.parseFloat(bladeStyle.height),
        bladeOpacity: Number.parseFloat(bladeStyle.opacity),
        contrastMode: stage.dataset.contrast ?? null,
        filledDiscDetected: hasPseudoSurface || hasPlaneSurface,
        hubDiameterPixels: Math.min(hubRect.width, hubRect.height),
        hubCanopyOverlapPixels,
        hubCanopyOcclusionFraction: hubCanopyOverlapPixels / Math.max(1, hubRect.height),
        mastCanopyOverlapPixels: intersectionHeight(mastRect, canopyHeaderRect),
        structuralTieCount: structuralTies.length,
        leftTieHeaderOverlapAreaPixels: intersectionArea(leftTieRect, canopyHeaderRect),
        rightTieHeaderOverlapAreaPixels: intersectionArea(rightTieRect, canopyHeaderRect),
        leftTieCanopyOverlapAreaPixels: intersectionArea(leftTieRect, leftCanopyRect),
        rightTieCanopyOverlapAreaPixels: intersectionArea(rightTieRect, rightCanopyRect),
        leftTieHeaderOcclusionSampled,
        rightTieHeaderOcclusionSampled,
        leftTieCanopyOcclusionSampled,
        rightTieCanopyOcclusionSampled,
        hubCanopyOcclusionSampled,
        mastCanopyOcclusionSampled,
        occlusionStackValid: stage.dataset.occlusionOrder === 'rotor-arcs<rotor-plane<mast-hub<structural-ties<canopy-header'
          && arcs.every((arc) => zIndex(arc) < zIndex(plane))
          && zIndex(plane) < zIndex(mast)
          && zIndex(mast) <= zIndex(hub)
          && zIndex(hub) < zIndex(leftTie)
          && zIndex(hub) < zIndex(rightTie)
          && zIndex(leftTie) < zIndex(canopyHeader)
          && zIndex(rightTie) < zIndex(canopyHeader),
        reticleClear: !rectanglesOverlap(rect, reticleRect),
        tailOpticClear: zIndex(tailOptic) > zIndex(stage),
        poseTransform: getComputedStyle(stage).transform,
        poseResponsive: overlay.dataset.rotorPoseResponsive === 'true',
        poseShiftXPixels: Number(overlay.dataset.rotorShiftX),
        poseShiftYPixels: Number(overlay.dataset.rotorShiftY),
        poseBankDegrees: Number(overlay.dataset.rotorBank),
        discPitchResponseDegrees: Number(overlay.dataset.rotorDiscPitchResponse),
        discYawResponseDegrees: Number(overlay.dataset.rotorDiscYawResponse),
      };
    }) : undefined;
    if (rotorProjection && (rotorProjection.mode !== 'perspective-elliptic-motion-arcs'
      || rotorProjection.bladeCount !== choreography.helicopter.rotorPresentation.mainBladeCount
      || rotorProjection.arcCount !== choreography.helicopter.rotorPresentation.mainArcCount
      || rotorProjection.temporalTrailCount !== choreography.helicopter.rotorPresentation.mainMotionBlurTrailCount
      || rotorProjection.legibleBladeSweeps < choreography.helicopter.rotorPresentation.mainMinimumLegibleBladeSweeps
      || rotorProjection.projectedBladeThresholdPixels !== choreography.helicopter.rotorPresentation.mainMinimumProjectedBladeLengthPixels
      || !Number.isFinite(rotorProjection.shortestProjectedBladeLengthPixels)
      || rotorProjection.projectedSweepSpanPixels < choreography.helicopter.rotorPresentation.mainMinimumProjectedSweepSpanPixels
      || rotorProjection.projectedArcSpanPixels < choreography.helicopter.rotorPresentation.mainMinimumProjectedArcSpanPixels
      || rotorProjection.authoredBladeThicknessPixels < choreography.helicopter.rotorPresentation.mainMinimumAuthoredBladeThicknessPixels
      || rotorProjection.bladeOpacity < choreography.helicopter.rotorPresentation.mainMinimumBladeOpacity
      || rotorProjection.bladeOpacity > choreography.helicopter.rotorPresentation.mainMaximumBladeOpacity
      || rotorProjection.contrastMode !== choreography.helicopter.rotorPresentation.mainContrastMode
      || rotorProjection.filledDiscDetected
      || rotorProjection.stageTopFraction > choreography.helicopter.rotorPresentation.mainMaximumStageTopFraction
      || rotorProjection.stageBottomFraction < choreography.helicopter.rotorPresentation.mainMinimumStageBottomFraction
      || rotorProjection.stageBottomFraction > choreography.helicopter.rotorPresentation.mainMaximumStageBottomFraction
      || rotorProjection.stageWidthFraction < choreography.helicopter.rotorPresentation.mainMinimumScreenWidthFraction
      || rotorProjection.stageWidthFraction > choreography.helicopter.rotorPresentation.mainMaximumScreenWidthFraction
      || rotorProjection.stageHeightFraction < choreography.helicopter.rotorPresentation.mainMinimumScreenHeightFraction
      || rotorProjection.stageHeightFraction > choreography.helicopter.rotorPresentation.mainMaximumScreenHeightFraction
      || rotorProjection.stageAreaFraction < choreography.helicopter.rotorPresentation.mainMinimumScreenAreaFraction
      || rotorProjection.stageAreaFraction > choreography.helicopter.rotorPresentation.mainMaximumScreenAreaFraction
      || rotorProjection.hubDiameterPixels < choreography.helicopter.rotorPresentation.mainMinimumHubDiameterPixels
      || rotorProjection.hubCanopyOverlapPixels < choreography.helicopter.rotorPresentation.mainMinimumHubCanopyOverlapPixels
      || rotorProjection.hubCanopyOcclusionFraction > choreography.helicopter.rotorPresentation.mainMaximumHubCanopyOcclusionFraction
      || rotorProjection.mastCanopyOverlapPixels < choreography.helicopter.rotorPresentation.mainMinimumMastCanopyOverlapPixels
      || rotorProjection.structuralTieCount !== 2
      || rotorProjection.leftTieHeaderOverlapAreaPixels < choreography.helicopter.rotorPresentation.mainMinimumTieHeaderOverlapAreaPixels
      || rotorProjection.rightTieHeaderOverlapAreaPixels < choreography.helicopter.rotorPresentation.mainMinimumTieHeaderOverlapAreaPixels
      || rotorProjection.leftTieCanopyOverlapAreaPixels < choreography.helicopter.rotorPresentation.mainMinimumTieCanopyOverlapAreaPixels
      || rotorProjection.rightTieCanopyOverlapAreaPixels < choreography.helicopter.rotorPresentation.mainMinimumTieCanopyOverlapAreaPixels
      || rotorProjection.leftTieHeaderOcclusionSampled !== true
      || rotorProjection.rightTieHeaderOcclusionSampled !== true
      || rotorProjection.leftTieCanopyOcclusionSampled !== true
      || rotorProjection.rightTieCanopyOcclusionSampled !== true
      || rotorProjection.hubCanopyOcclusionSampled !== true
      || rotorProjection.mastCanopyOcclusionSampled !== true
      || rotorProjection.occlusionStackValid !== true
      || rotorProjection.reticleClear !== true
      || rotorProjection.tailOpticClear !== true
      || rotorProjection.poseResponsive !== true
      || !Number.isFinite(rotorProjection.poseShiftXPixels)
      || !Number.isFinite(rotorProjection.poseShiftYPixels)
      || !Number.isFinite(rotorProjection.poseBankDegrees)
      || !Number.isFinite(rotorProjection.discPitchResponseDegrees)
      || !Number.isFinite(rotorProjection.discYawResponseDegrees)
      || Math.abs(rotorProjection.poseShiftXPixels) > choreography.helicopter.rotorPresentation.mainMaximumPoseShiftPixels
      || Math.abs(rotorProjection.poseShiftYPixels) > choreography.helicopter.rotorPresentation.mainMaximumVerticalPoseShiftPixels
      || Math.abs(rotorProjection.poseBankDegrees) > choreography.helicopter.rotorPresentation.mainMaximumPoseBankDegrees
      || Math.abs(rotorProjection.discPitchResponseDegrees) > choreography.helicopter.rotorPresentation.mainMaximumDiscPitchResponseDegrees
      || Math.abs(rotorProjection.discYawResponseDegrees) > choreography.helicopter.rotorPresentation.mainMaximumDiscYawResponseDegrees)) {
      throw new Error(`${arenaId} frame ${frame} violates the perspective-elliptic rotor projection contract: ${JSON.stringify(rotorProjection)}`);
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
        ...(rotorProjection ? { rotorProjection } : {}),
      });
    }
  }

  const snapshot = await page.evaluate(() => (window as unknown as { __ATOMIC_ACRES_DEBUG__: { snapshot(): any } }).__ATOMIC_ACRES_DEBUG__.snapshot());
  if (errors.length > 0) throw new Error(`${arenaId} runtime capture errors: ${[...new Set(errors)].join(' | ')}`);
  const frameNames = requestedFrames.map((frame) => `frame-${String(frame).padStart(4, '0')}.png`);
  const frameSet = await digestOrderedFileSet(directory, frameNames, `menu-preview-frames:${arenaId}`);
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
    frameSet: { ...frameSet, frameRoster: [...requestedFrames] },
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
    for (const arenaId of selectedArenas) {
      // A fresh browser owns each 1440p arena capture. This prevents delayed
      // WebGPU resource retirement from an earlier 240-frame arena from
      // starving the final arena while preserving one exact input receipt.
      browser = await chromium.launch({
        headless: true,
        executablePath,
        args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
      });
      const page = await browser.newPage({
        viewport: { width: choreography.capture.viewport[0], height: choreography.capture.viewport[1] },
        deviceScaleFactor: 1,
      });
      try {
        evidence.push(await captureArena(page, arenaId));
      } finally {
        await page.close();
        await browser.close();
        browser = undefined;
      }
    }
    const finalRuntimeInputs = await runtimeInputReceipt();
    if (JSON.stringify(finalRuntimeInputs) !== JSON.stringify(runtimeInputs)) {
      throw new Error('Runtime capture inputs changed during authoring; all staged frames are rejected as stale');
    }
    const receipt = {
      schemaVersion: 4,
      captureId: choreography.captureId,
      generatedAt,
      recipeId: choreography.recipeId,
      recipeDigest: sha256(JSON.stringify(choreography)),
      source: choreography.capture.source,
      backendRequired: choreography.capture.backend,
      viewport: choreography.capture.viewport,
      overlay: {
        scale: choreography.capture.overlayScale,
        referenceViewport: choreography.capture.overlayReferenceViewport,
        outputScale: choreography.capture.overlayOutputScale,
        palette: choreography.capture.overlayPalette,
        mode: 'offline-baked-minimal-graphite-green',
        liveLoadingRenderer: false,
      },
      frameRoster: requestedFrames,
      runtimeInputs,
      arenas: evidence,
    };
    const outputReceiptPath = reviewOnly ? reviewReceiptPath : receiptPath;
    await mkdir(path.dirname(outputReceiptPath), { recursive: true });
    await writeFile(outputReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ capture: 'passed', reviewOnly, receipt: path.relative(root, outputReceiptPath), arenas: evidence }, null, 2));
  } finally {
    await browser?.close();
    await server?.close();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
