import { expect, type Page, type TestInfo } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type FrameHitchRenderer = 'webgl2' | 'webgpu';
export type FrameHitchEvidenceKind = 'glass-m14' | 'flamethrower' | 'flare-gun';

const requestedRenderer = process.env.PASS69_3_FRAME_HITCH_RENDERER ?? 'webgl2';
if (requestedRenderer !== 'webgl2' && requestedRenderer !== 'webgpu') {
  throw new Error(`Pass 69.3 frame-hitch renderer must be webgl2 or webgpu; received ${requestedRenderer}`);
}
export const frameHitchRenderer: FrameHitchRenderer = requestedRenderer;

const requestedRenderProfile = process.env.PASS69_3_FRAME_HITCH_RENDER_PROFILE ?? 'compat';
if (!['compat', 'performance', 'blender'].includes(requestedRenderProfile)) {
  throw new Error(`Pass 69.3 frame-hitch render profile is invalid: ${requestedRenderProfile}`);
}
export const frameHitchRenderProfile = requestedRenderProfile;

const expectedSourceSha = process.env.PASS69_3_FRAME_HITCH_SOURCE_SHA ?? '';
const expectedTarget = process.env.PASS69_3_FRAME_HITCH_TARGET ?? '';
const officialEvidence = expectedSourceSha !== '' || expectedTarget !== '';
const expectedTargetForRenderer = `edge-${frameHitchRenderer}`;
if (officialEvidence && (!/^[a-f0-9]{40}$/u.test(expectedSourceSha)
  || expectedTarget !== expectedTargetForRenderer
  || frameHitchRenderProfile !== 'blender')) {
  throw new Error(`Pass 69.3 frame-hitch evidence has incomplete target provenance for ${expectedTargetForRenderer}`);
}

const repositoryRoot = process.cwd();

function gitOutput(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}

const sourceSha = gitOutput(['rev-parse', 'HEAD']);
const sourceStatus = gitOutput(['status', '--porcelain', '--untracked-files=all']);
if (officialEvidence && (sourceSha !== expectedSourceSha || sourceStatus !== '')) {
  throw new Error('Pass 69.3 frame-hitch evidence must start from the requested clean exact HEAD');
}

export function frameHitchRoute(
  map: 'atomic-acres' | 'gun-range',
  seed: string,
  options: Readonly<{ signal?: boolean }> = {},
): string {
  const requireWebGpu = frameHitchRenderer === 'webgpu' ? '&requireWebGPU=1' : '';
  const signalOverride = options.signal === false ? '&signal=off' : '';
  return `/?release=latest&map=${map}&renderer=${frameHitchRenderer}${requireWebGpu}`
    + `&render=${frameHitchRenderProfile}${signalOverride}&grass=off&mist=off&clouds=off&rays=off`
    + `&externalServices=off&seed=${seed}-${frameHitchRenderer}`;
}

export type FrameHitchRendererEvidence = Readonly<{
  map: string;
  renderProfile: string;
  browser: Readonly<{
    project: string;
    channel: 'msedge' | 'configured-chromium';
    userAgent: string;
  }>;
  servedCandidate: Record<string, unknown>;
  runtime: any;
  contextLifecycle: any;
  runtimeErrorVisible: boolean;
  webgl: Readonly<{
    adapterClass: 'WebGL2RenderingContext';
    maskedVendor: string;
    maskedRenderer: string;
    unmaskedVendor: string | null;
    unmaskedRenderer: string | null;
    version: string;
  }> | null;
}>;

export async function captureFrameHitchRendererEvidence(
  page: Page,
  testInfo: TestInfo,
): Promise<FrameHitchRendererEvidence> {
  const evidence = await page.evaluate(async (expectedRenderer) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const snapshot = debug.snapshot() as any;
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    const gl = expectedRenderer === 'webgl2' ? canvas?.getContext('webgl2') ?? null : null;
    const debugInfo = gl?.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const response = await fetch('/channels/the-big-one/channel-provenance.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Frame-hitch candidate provenance returned HTTP ${response.status}`);
    return {
      map: snapshot.arenaSelection.id,
      renderProfile: snapshot.render.profile,
      userAgent: navigator.userAgent,
      servedCandidate: await response.json() as Record<string, unknown>,
      runtime: snapshot.render.runtime,
      contextLifecycle: snapshot.render.contextLifecycle,
      runtimeErrorVisible: document.querySelector<HTMLElement>('#runtime-error')?.hidden === false,
      webgl: gl ? {
        adapterClass: 'WebGL2RenderingContext' as const,
        maskedVendor: String(gl.getParameter(gl.VENDOR)),
        maskedRenderer: String(gl.getParameter(gl.RENDERER)),
        unmaskedVendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)) : null,
        unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : null,
        version: String(gl.getParameter(gl.VERSION)),
      } : null,
    };
  }, frameHitchRenderer);
  return {
    map: evidence.map,
    renderProfile: evidence.renderProfile,
    browser: {
      project: testInfo.project.name,
      channel: process.env.QA_INSTALLED_EDGE === '1' ? 'msedge' : 'configured-chromium',
      userAgent: evidence.userAgent,
    },
    servedCandidate: evidence.servedCandidate,
    runtime: evidence.runtime,
    contextLifecycle: evidence.contextLifecycle,
    runtimeErrorVisible: evidence.runtimeErrorVisible,
    webgl: evidence.webgl,
  };
}

export function expectFrameHitchRendererEvidence(
  evidence: FrameHitchRendererEvidence,
  expectedMap: 'atomic-acres' | 'gun-range',
  label: string,
): void {
  expect(evidence.map, `${label}: exact arena`).toBe(expectedMap);
  expect(evidence.renderProfile, `${label}: exact render profile`).toBe(frameHitchRenderProfile);
  expect(evidence.runtimeErrorVisible, `${label}: runtime error surface remains hidden`).toBe(false);
  expect(evidence.runtime, `${label}: exact renderer and zero runtime failures`).toMatchObject({
    requestedBackend: frameHitchRenderer,
    actualBackend: frameHitchRenderer,
    initialized: true,
    failClosed: false,
    deviceLost: false,
    uncapturedErrors: 0,
  });
  if (frameHitchRenderer === 'webgpu') {
    expect(evidence.runtime, `${label}: native WebGPU device and healthy presentation`).toMatchObject({
      adapterClass: 'GPUAdapter',
      deviceClass: 'GPUDevice',
      presentation: { status: 'healthy' },
    });
    expect(evidence.webgl, `${label}: WebGPU canvas never masquerades as WebGL2`).toBeNull();
  } else {
    expect(evidence.runtime, `${label}: real WebGL2 context and synchronous presentation`).toMatchObject({
      adapterClass: 'WebGL2RenderingContext',
      presentation: { status: 'synchronous' },
    });
    expect(evidence.contextLifecycle, `${label}: zero WebGL context loss`).toEqual({
      lost: false, losses: 0, restorations: 0,
    });
    expect(evidence.webgl, `${label}: raw WebGL2 context evidence`).toMatchObject({
      adapterClass: 'WebGL2RenderingContext',
    });
  }

  if (!officialEvidence) return;
  expect(evidence.browser, `${label}: installed Edge`).toMatchObject({ project: 'chromium', channel: 'msedge' });
  expect(evidence.browser.userAgent, `${label}: Edge user agent`).toMatch(/Edg\//u);
  expect(evidence.runtime.softwareAdapter, `${label}: hardware adapter`).toBe(false);
  expect(evidence.runtime.adapterLabel, `${label}: concrete adapter identity`).toEqual(expect.any(String));
  expect(evidence.runtime.adapterLabel.trim().length, `${label}: non-empty adapter identity`).toBeGreaterThan(0);
  expect(evidence.runtime.adapterLabel, `${label}: non-software adapter label`)
    .not.toMatch(/swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic/iu);
  if (frameHitchRenderer === 'webgl2') {
    expect(evidence.runtime.adapterLabel, `${label}: Windows hardware ANGLE adapter`).toMatch(/ANGLE/iu);
    expect(evidence.webgl?.unmaskedRenderer, `${label}: raw hardware renderer matches runtime identity`)
      .toBe(evidence.runtime.adapterLabel);
  }
  expect(evidence.servedCandidate, `${label}: staged exact source candidate`).toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: 'PASS 69',
    path: 'channels/the-big-one',
    sourceSha,
  });
  expect(evidence.servedCandidate.treeSha256, `${label}: staged tree digest`).toMatch(/^[a-f0-9]{64}$/u);
  expect(evidence.servedCandidate.exactRootFileCount, `${label}: staged file count`).toEqual(expect.any(Number));
  expect(evidence.servedCandidate.exactRootFileCount as number, `${label}: non-empty staged candidate`)
    .toBeGreaterThanOrEqual(2);
}

const evidenceScopes: Readonly<Record<FrameHitchEvidenceKind, string>> = Object.freeze({
  'glass-m14': 'cold-and-warm-window-breach-plus-m14-event-to-presented-frame',
  flamethrower: 'cold-and-held-flamethrower-emission-ground-fire-and-release-frame-pacing',
  'flare-gun': 'cold-flare-flight-impact-and-burn-frame-pacing',
});

export function writeOfficialFrameHitchReceipt(
  kind: FrameHitchEvidenceKind,
  before: FrameHitchRendererEvidence,
  after: FrameHitchRendererEvidence,
  thresholds: Record<string, number>,
  evidence: Record<string, unknown>,
  browserErrors: readonly string[],
): void {
  if (!officialEvidence) return;
  const endingSourceSha = gitOutput(['rev-parse', 'HEAD']);
  const endingSourceStatus = gitOutput(['status', '--porcelain', '--untracked-files=all']);
  expect(endingSourceSha, `${kind}: exact source remains fixed`).toBe(sourceSha);
  expect(endingSourceStatus, `${kind}: source remains clean`).toBe('');
  const outputRoot = resolve(repositoryRoot, 'artifacts/pass69-3/frame-hitch', frameHitchRenderer);
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(resolve(outputRoot, `${kind}.json`), `${JSON.stringify({
    schemaVersion: 1,
    status: 'PASS',
    contract: 'atomic-acres/pass69-3-frame-hitch-evidence@1',
    evidenceKind: kind,
    evidenceScope: evidenceScopes[kind],
    target: expectedTarget,
    sourceSha,
    endingSourceSha,
    cleanSource: sourceStatus === '' && endingSourceStatus === '',
    renderer: frameHitchRenderer,
    renderProfile: frameHitchRenderProfile,
    browser: after.browser,
    servedCandidate: before.servedCandidate,
    runtimeBefore: before.runtime,
    runtimeAfter: after.runtime,
    contextLifecycleBefore: before.contextLifecycle,
    contextLifecycleAfter: after.contextLifecycle,
    webglBefore: before.webgl,
    webglAfter: after.webgl,
    runtimeErrorVisibleBefore: before.runtimeErrorVisible,
    runtimeErrorVisibleAfter: after.runtimeErrorVisible,
    map: after.map,
    thresholds,
    evidence,
    browserErrors,
  }, null, 2)}\n`, 'utf8');
}
