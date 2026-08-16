import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import {
  expect,
  test,
  type Browser,
  type CDPSession,
  type Page,
} from '@playwright/test';
import {
  PASS71_HF305_INSIDE_CAMERA,
  PASS71_HF305_OUTSIDE_CAMERA,
  PASS71_HF305_TIMELINE_REMAINING_MS,
  PASS71_HF305_WARNING_POSITION,
} from '../../scripts/qa/pass71-hf305-nuke-warning-evidence-contract.mjs';

const enabled = process.env.PASS71_HF305_NATIVE === '1';
const renderer = process.env.PASS71_HF305_RENDERER === 'webgpu' ? 'webgpu' : 'webgl2';
const expectedSourceSha = process.env.PASS71_HF305_SOURCE_SHA ?? '';
const expectedReleasePass = process.env.PASS71_HF305_RELEASE_PASS ?? '';
const componentPath = process.env.PASS71_HF305_COMPONENT_PATH ?? '';
const outputRoot = resolve(process.cwd(), 'artifacts/pass71/hf305-nuke-warning');
const imageRoot = resolve(outputRoot, 'images', renderer);

test.skip(!enabled, 'Run through qa:pass71:hf305-nuke for fresh exact-candidate-A signed-Edge evidence.');
test.describe.configure({ mode: 'serial' });

type Fault = Readonly<{ kind: 'pageerror' | 'console-error'; text: string }>;
function warningCamera(position: readonly number[]) {
  const yaw = Math.atan2(
    position[0]! - PASS71_HF305_WARNING_POSITION[0],
    position[2]! - PASS71_HF305_WARNING_POSITION[2],
  );
  const pitch = Math.atan2(
    PASS71_HF305_WARNING_POSITION[1] - position[1]!,
    Math.hypot(
      position[0]! - PASS71_HF305_WARNING_POSITION[0],
      position[2]! - PASS71_HF305_WARNING_POSITION[2],
    ),
  );
  return { position, yaw, pitch };
}

function imageReceipt(id: string, absolutePath: string, bytes: Buffer) {
  return {
    id,
    path: relative(process.cwd(), absolutePath).replaceAll('\\', '/'),
    pngBase64: bytes.toString('base64'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    byteLength: bytes.length,
    width: 1_920,
    height: 1_080,
  };
}

async function captureSurface(cdp: CDPSession, id: string) {
  const absolutePath = resolve(imageRoot, `${id}.png`);
  const surface = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(surface.data, 'base64');
  writeFileSync(absolutePath, bytes);
  return imageReceipt(id, absolutePath, bytes);
}

async function setEvidenceCamera(page: Page, id: 'inside-room' | 'outside-room') {
  const position = id === 'inside-room' ? PASS71_HF305_INSIDE_CAMERA : PASS71_HF305_OUTSIDE_CAMERA;
  const pose = warningCamera(position);
  const receipt = await page.evaluate(async ({ cameraPosition, yaw, pitch }) => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    const revision = api.setCaptureCameraPose(
      cameraPosition[0], cameraPosition[1], cameraPosition[2], yaw, pitch, 60, 1_000, 7_305,
    );
    if (revision === null) return null;
    await api.awaitCommittedCameraCompletion();
    const snapshot = api.snapshot();
    return {
      revision,
      presented: snapshot.deterministicReview.presentedCamera,
      door: snapshot.testBayDoor,
    };
  }, { cameraPosition: [...position], yaw: pose.yaw, pitch: pose.pitch });
  expect(receipt, `${renderer}/${id}: exact camera reaches a committed presentation`).not.toBeNull();
  expect(receipt!.presented, `${renderer}/${id}: native camera receipt exists`).toMatchObject({
    contract: 'capture-camera-committed-frame-v1',
    renderer,
    arenaId: 'gun-range',
    captureRevision: receipt!.revision,
    position: [...position],
  });
  expect(receipt!.presented.completedSequence).toBeGreaterThanOrEqual(receipt!.presented.submissionSequence);
  expect(receipt!.door, `${renderer}/${id}: the test-bay room is physically open`).toMatchObject({
    phase: 'open',
    openness: 1,
    dynamicColliderCount: 0,
    dynamicBallisticSurfaceCount: 0,
  });
  return {
    id,
    position: [...receipt!.presented.position],
    classification: id === 'inside-room' ? 'inside' : 'outside',
    committed: true,
    renderer: receipt!.presented.renderer,
    arenaId: receipt!.presented.arenaId,
    captureRevision: receipt!.presented.captureRevision,
    simulationFrame: receipt!.presented.frame,
    submissionSequence: receipt!.presented.submissionSequence,
    completedSequence: receipt!.presented.completedSequence,
    door: {
      phase: receipt!.door.phase,
      openness: receipt!.door.openness,
      dynamicColliderCount: receipt!.door.dynamicColliderCount,
      dynamicBallisticSurfaceCount: receipt!.door.dynamicBallisticSurfaceCount,
    },
  };
}

async function openSession(browser: Browser, reduced: boolean, baseURL: string) {
  const context = await browser.newContext({ viewport: { width: 1_280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const faults: Fault[] = [];
  page.on('pageerror', (error) => faults.push({ kind: 'pageerror', text: error.stack ?? error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error') faults.push({ kind: 'console-error', text: message.text() });
  });
  await page.addInitScript(() => {
    localStorage.removeItem('atomic-acres:client-runtime-log:v1');
    (window as any).__HF305_PHYSICAL_START__ = null;
    document.addEventListener('pointerdown', (event) => {
      const target = event.target instanceof Element ? event.target.closest('#solo') : null;
      if (!target) return;
      (window as any).__HF305_PHYSICAL_START__ = {
        selector: '#solo',
        eventType: event.type,
        isTrusted: event.isTrusted,
      };
    }, true);
  });
  const url = new URL('/channels/the-big-one/', baseURL);
  for (const [key, value] of Object.entries({
    release: 'latest',
    map: 'gun-range',
    renderer,
    requireWebGPU: renderer === 'webgpu' ? '1' : undefined,
    render: 'blender',
    signal: 'on',
    grass: 'off',
    mist: 'off',
    clouds: 'off',
    rays: 'off',
    externalServices: 'off',
    seed: `pass71-hf305-${renderer}-${reduced ? 'reduced' : 'standard'}`,
  })) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForFunction(() => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.bootstrap?.stage === 'ready'
      && !(document.querySelector<HTMLButtonElement>('#solo')?.disabled ?? true);
  }, undefined, { timeout: 90_000 });
  if (reduced) {
    await page.locator('#menu-tab-options').click();
    await page.locator('#reduced-sensory-effects').check();
    await expect(page.locator('html')).toHaveAttribute('data-reduced-sensory', 'true');
    await page.locator('#menu-tab-deploy').click();
  }
  await page.locator('#solo').click();
  await page.waitForFunction(() => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__?.snapshot();
    return snapshot?.matchPhase === 'active'
      && snapshot.frameCount > 3
      && snapshot.audio.context.state === 'running'
      && snapshot.audio.outputProbe.available === true;
  }, undefined, { timeout: 90_000 });
  await page.setViewportSize({ width: 1_920, height: 1_080 });
  await page.evaluate(() => {
    const api = (window as any).__ATOMIC_ACRES_DEBUG__;
    api.setBotsFrozen(true);
    api.setCaptureViewmodelHidden(true);
    api.teleportPlayer(48.75, 1.7, 12, -Math.PI / 2, 0);
  });
  await page.waitForFunction(() => (window as any).__ATOMIC_ACRES_DEBUG__.collisionProbeAt(51.5, 1.7, 12) === false);
  await page.waitForTimeout(350);
  const start = await page.evaluate(() => {
    const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
    const physical = (window as any).__HF305_PHYSICAL_START__;
    return {
      physicalStart: { ...physical, audioContext: snapshot.audio.context.state },
      accessibility: {
        requested: snapshot.settings.requested.accessibility.reducedSensoryEffects,
        effective: snapshot.settings.accessibility.reducedSensory,
        reasons: [...snapshot.settings.accessibility.reasons],
        html: document.documentElement.dataset.reducedSensory ?? null,
      },
      targetsBefore: snapshot.rangePractice.targets
        .filter((target: any) => target.kind === 'training-dummy')
        .map((target: any) => ({
          id: target.id,
          kind: target.kind,
          active: target.active,
          visible: target.visible,
          health: target.health,
          maxHealth: target.maxHealth,
        }))
        .sort((left: any, right: any) => left.id.localeCompare(right.id)),
    };
  });
  return { context, page, faults, ...start };
}

async function runWarning(browser: Browser, reduced: boolean, baseURL: string) {
  const session = await openSession(browser, reduced, baseURL);
  const { context, page, faults } = session;
  const cdp = await context.newCDPSession(page);
  const images: ReturnType<typeof imageReceipt>[] = [];
  const cameras: Awaited<ReturnType<typeof setEvidenceCamera>>[] = [];
  let frozenFrame: any = null;
  let hiddenControl: any = null;
  let attributionCrop: any = null;
  try {
    cameras.push(await setEvidenceCamera(page, reduced ? 'inside-room' : 'outside-room'));
    const activation = await page.evaluate(() => {
      const api = (window as any).__ATOMIC_ACRES_DEBUG__;
      const before = api.snapshot();
      const activatedAtMs = performance.now();
      api.earnSupport(15);
      api.activateSupport('nuke');
      const after = api.snapshot();
      return {
        activatedAtMs,
        activationsBefore: before.fieldSupport.nukeActivations,
        activationsAfter: after.fieldSupport.nukeActivations,
        detonationsBefore: before.fieldSupport.nukeDetonations,
        supportCuesBefore: before.audio.support.cues,
        supportCuesAfter: after.audio.support.cues,
        active: after.fieldSupport.nuke.active,
        detonated: after.fieldSupport.nuke.detonated,
        detonateInMs: after.fieldSupport.nuke.detonateInMs,
        warning: {
          visible: after.fieldSupport.nuke.warning.visible,
          arenaId: after.fieldSupport.nuke.warning.arenaId,
          position: [...after.fieldSupport.nuke.warning.position],
          scale: after.fieldSupport.nuke.warning.scale,
          coreOpacity: after.fieldSupport.nuke.warning.coreOpacity,
          ringOpacity: after.fieldSupport.nuke.warning.ringOpacity,
          reducedSensory: after.fieldSupport.nuke.warning.reducedSensory,
        },
      };
    });
    expect(activation).toMatchObject({
      activationsAfter: activation.activationsBefore + 1,
      supportCuesAfter: activation.supportCuesBefore + 1,
      active: true,
      detonated: false,
      warning: { visible: true, arenaId: 'gun-range', position: [...PASS71_HF305_WARNING_POSITION], reducedSensory: reduced },
    });

    const timeline = [];
    for (const [index, targetRemainingMs] of PASS71_HF305_TIMELINE_REMAINING_MS.entries()) {
      await page.waitForFunction((target) => {
        const nuke = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.nuke;
        return nuke.active && !nuke.detonated && nuke.detonateInMs <= target && nuke.detonateInMs > 0;
      }, targetRemainingMs, { timeout: 8_000 });
      const sample = await page.evaluate(({ activatedAtMs, targetRemainingMs: target }) => {
        const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
        const hud = document.querySelector<HTMLElement>('#nuke-warning')!;
        return {
          targetRemainingMs: target,
          elapsedMs: performance.now() - activatedAtMs,
          detonateInMs: snapshot.fieldSupport.nuke.detonateInMs,
          hudVisible: !hud.hidden,
          hudCountdown: hud.querySelector('b')?.textContent?.trim() ?? '',
          warning: {
            visible: snapshot.fieldSupport.nuke.warning.visible,
            arenaId: snapshot.fieldSupport.nuke.warning.arenaId,
            position: [...snapshot.fieldSupport.nuke.warning.position],
            scale: snapshot.fieldSupport.nuke.warning.scale,
            coreOpacity: snapshot.fieldSupport.nuke.warning.coreOpacity,
            ringOpacity: snapshot.fieldSupport.nuke.warning.ringOpacity,
            reducedSensory: snapshot.fieldSupport.nuke.warning.reducedSensory,
          },
          audio: {
            contextState: snapshot.audio.context.state,
            available: snapshot.audio.outputProbe.available,
            rms: snapshot.audio.outputProbe.rms,
            peak: snapshot.audio.outputProbe.peak,
            suspiciousBroadbandHiss: snapshot.audio.outputProbe.suspiciousBroadbandHiss,
            voices: snapshot.audio.runtime.voices,
            globalCap: snapshot.audio.runtime.globalCap,
            supportCues: snapshot.audio.support.cues,
          },
        };
      }, { activatedAtMs: activation.activatedAtMs, targetRemainingMs });
      const audioWindow = [sample.audio];
      for (let audioIndex = 0; audioIndex < 5; audioIndex += 1) {
        await page.waitForTimeout(25);
        audioWindow.push(await page.evaluate(() => {
          const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
          return {
            contextState: snapshot.audio.context.state,
            available: snapshot.audio.outputProbe.available,
            rms: snapshot.audio.outputProbe.rms,
            peak: snapshot.audio.outputProbe.peak,
            suspiciousBroadbandHiss: snapshot.audio.outputProbe.suspiciousBroadbandHiss,
            voices: snapshot.audio.runtime.voices,
            globalCap: snapshot.audio.runtime.globalCap,
            supportCues: snapshot.audio.support.cues,
          };
        }));
      }
      sample.audio = audioWindow.reduce((loudest, current) => (
        current.peak > loudest.peak ? current : loudest
      ));
      timeline.push(sample);

      if (!reduced && index === 2) {
        images.push(await captureSurface(cdp, 'standard-outside'));
        cameras.push(await setEvidenceCamera(page, 'inside-room'));
      }
      if (index === PASS71_HF305_TIMELINE_REMAINING_MS.length - 1) {
        if (reduced) {
          images.push(await captureSurface(cdp, 'reduced-inside'));
        } else {
          frozenFrame = await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.freezeNukeWarningEvidenceFrame());
          expect(frozenFrame, `${renderer}: standard visible frame freezes before detonation`).not.toBeNull();
          const framing = await page.evaluate(() => {
            const canvas = document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
            const hud = document.querySelector<HTMLElement>('#nuke-warning')!.getBoundingClientRect();
            return {
              canvas: { left: canvas.left, top: canvas.top, right: canvas.right, bottom: canvas.bottom },
              hud: { left: hud.left, top: hud.top, right: hud.right, bottom: hud.bottom },
            };
          });
          images.push(await captureSurface(cdp, 'standard-inside-visible'));
          hiddenControl = await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.captureNukeWarningHiddenControl());
          expect(hiddenControl, `${renderer}: paired hidden control submits`).not.toBeNull();
          images.push(await captureSurface(cdp, 'standard-inside-hidden-control'));
          const cropTop = Math.max(Math.ceil(framing.hud.bottom + 16), Math.floor(1_080 * 0.28));
          attributionCrop = {
            left: Math.floor(1_920 * 0.25),
            top: cropTop,
            width: Math.ceil(1_920 * 0.75) - Math.floor(1_920 * 0.25),
            height: Math.ceil(1_080 * 0.78) - cropTop,
          };
          expect(framing.canvas).toEqual({ left: 0, top: 0, right: 1_920, bottom: 1_080 });
          expect(attributionCrop.top).toBeGreaterThan(framing.hud.bottom);
          expect(await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__.releaseNukeWarningEvidenceFrame())).toBe(true);
        }
      }
    }

    await page.waitForFunction((before) => (
      (window as any).__ATOMIC_ACRES_DEBUG__.snapshot().fieldSupport.nukeDetonations === before + 1
    ), activation.detonationsBefore, { timeout: 8_000 });
    await expect(page.locator('#nuke-warning')).toBeHidden({ timeout: 2_000 });
    const ending = await page.evaluate(({ activatedAtMs, activationBaseline, detonationBaseline, requestedRenderer }) => {
      const snapshot = (window as any).__ATOMIC_ACRES_DEBUG__.snapshot();
      let clientRuntimeLog: unknown = [];
      try {
        clientRuntimeLog = JSON.parse(localStorage.getItem('atomic-acres:client-runtime-log:v1') ?? '[]');
      } catch {
        clientRuntimeLog = ['invalid-client-runtime-log-json'];
      }
      return {
        detonation: {
          observedElapsedMs: performance.now() - activatedAtMs,
          activationsDelta: snapshot.fieldSupport.nukeActivations - activationBaseline,
          detonationsDelta: snapshot.fieldSupport.nukeDetonations - detonationBaseline,
          targetsAfter: snapshot.rangePractice.targets
            .filter((target: any) => target.kind === 'training-dummy')
            .map((target: any) => ({
              id: target.id,
              kind: target.kind,
              active: target.active,
              visible: target.visible,
              health: target.health,
              maxHealth: target.maxHealth,
            }))
            .sort((left: any, right: any) => left.id.localeCompare(right.id)),
          warningHidden: document.querySelector<HTMLElement>('#nuke-warning')!.hidden,
          nukeActive: snapshot.fieldSupport.nuke.active,
          nukeDetonated: snapshot.fieldSupport.nuke.detonated,
          explosionSource: snapshot.fieldSupport.explosionProfile.source,
          explosionFrameSources: [...snapshot.fieldSupport.explosionFrameProfile.sources],
        },
        runtime: {
          requested: requestedRenderer,
          actual: snapshot.render.runtime.actualBackend,
          adapterLabel: snapshot.render.runtime.adapterLabel,
          softwareRenderer: /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/iu
            .test(snapshot.render.runtime.adapterLabel),
          requireWebGpu: requestedRenderer === 'webgpu',
        },
        userAgent: navigator.userAgent,
        clientRuntimeLog,
      };
    }, {
      activatedAtMs: activation.activatedAtMs,
      activationBaseline: activation.activationsBefore,
      detonationBaseline: activation.detonationsBefore,
      requestedRenderer: renderer,
    });
    return {
      run: {
        mode: reduced ? 'reduced' : 'standard',
        accessibility: session.accessibility,
        physicalStart: session.physicalStart,
        targetsBefore: session.targetsBefore,
        activation,
        timeline,
        cameras,
        images,
        frozenFrame,
        hiddenControl,
        attributionCrop,
        detonation: ending.detonation,
      },
      runtime: ending.runtime,
      userAgent: ending.userAgent,
      clientRuntimeLog: ending.clientRuntimeLog,
      faults,
    };
  } finally {
    await page.evaluate(() => (window as any).__ATOMIC_ACRES_DEBUG__?.releaseNukeWarningEvidenceFrame?.()).catch(() => false);
    await cdp.detach().catch(() => undefined);
    await context.close();
  }
}

test(`HF-305 closes the ${renderer} Nuke warning with exact native standard/reduced evidence`, async ({ browser, request }, testInfo) => {
  test.setTimeout(240_000);
  expect(expectedSourceSha).toMatch(/^[a-f0-9]{40}$/u);
  expect(expectedReleasePass).toBe('PASS 71');
  expect(componentPath).not.toBe('');
  mkdirSync(imageRoot, { recursive: true });
  const baseURL = String(testInfo.project.use.baseURL);
  const provenanceResponse = await request.get(new URL('/channels/the-big-one/channel-provenance.json', baseURL).toString());
  expect(provenanceResponse.ok()).toBe(true);
  const servedCandidate = await provenanceResponse.json();
  expect(servedCandidate).toMatchObject({
    schemaVersion: 4,
    channel: 'the-big-one',
    releasePass: expectedReleasePass,
    sourceSha: expectedSourceSha,
    path: 'channels/the-big-one',
  });

  const standard = await runWarning(browser, false, baseURL);
  const reduced = await runWarning(browser, true, baseURL);
  expect(standard.runtime).toMatchObject({ requested: renderer, actual: renderer, softwareRenderer: false });
  expect(reduced.runtime).toEqual(standard.runtime);
  expect(standard.userAgent).toContain('Edg/');
  expect(reduced.userAgent).toBe(standard.userAgent);
  const standardWarning = standard.run.timeline.at(-1)!.warning;
  const reducedWarning = reduced.run.timeline.at(-1)!.warning;
  expect(reducedWarning.scale).toBeLessThan(standardWarning.scale);
  expect(reducedWarning.coreOpacity).toBeLessThan(standardWarning.coreOpacity * 0.55);
  expect(reducedWarning.ringOpacity).toBeLessThan(standardWarning.ringOpacity * 0.55);
  const standardPeak = Math.max(...standard.run.timeline.map(({ audio }) => audio.peak));
  const reducedPeak = Math.max(...reduced.run.timeline.map(({ audio }) => audio.peak));
  expect(standardPeak).toBeGreaterThan(0.0001);
  expect(reducedPeak).toBeLessThanOrEqual(standardPeak * 0.9);
  expect(standard.faults).toEqual([]);
  expect(reduced.faults).toEqual([]);
  expect(standard.clientRuntimeLog).toEqual([]);
  expect(reduced.clientRuntimeLog).toEqual([]);

  const component = {
    schemaVersion: 1,
    contract: 'atomic-acres/pass71-hf305-nuke-runtime@1',
    status: 'PASS',
    sourceSha: expectedSourceSha,
    servedCandidate,
    renderer: standard.runtime,
    browser: { version: browser.version(), userAgent: standard.userAgent },
    profile: { name: 'Quality', render: 'blender' },
    standard: standard.run,
    reduced: reduced.run,
    clientRuntimeLog: standard.clientRuntimeLog,
    faults: [...standard.faults, ...reduced.faults],
  };
  mkdirSync(dirname(componentPath), { recursive: true });
  writeFileSync(componentPath, `${JSON.stringify(component, null, 2)}\n`, 'utf8');
});
