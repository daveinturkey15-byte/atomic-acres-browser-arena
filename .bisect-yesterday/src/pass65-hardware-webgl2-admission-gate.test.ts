import { describe, expect, it } from 'vitest';
import {
  PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS,
  validateAdmissionReadPixels,
  validateHardwareWebGl2AdmissionTiming,
  validateHardwareWebGl2Runtime,
  validatePostReadyFiftyMillisecondFrames,
} from './pass65-hardware-webgl2-admission-gate';

describe('Pass 65 installed-Chrome hardware WebGL2 admission gate', () => {
  const runtime = Object.freeze({
    requestedBackend: 'webgl2', actualBackend: 'webgl2', initialized: true,
    adapterLabel: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 5080 Direct3D11)',
    adapterClass: 'WebGL2RenderingContext', softwareAdapter: false,
    deviceLost: false, uncapturedErrors: 0,
    contextLifecycle: Object.freeze({ lost: false, losses: 0, restorations: 0 }),
  });

  it('requires real ANGLE hardware identity and zero context loss', () => {
    expect(validateHardwareWebGl2Runtime(runtime)).toEqual([]);
    expect(validateHardwareWebGl2Runtime({ ...runtime, softwareAdapter: true })).toContain('software-adapter:true');
    expect(validateHardwareWebGl2Runtime({ ...runtime, adapterLabel: 'Google SwiftShader' }).join('|')).toContain('software-adapter-label');
    expect(validateHardwareWebGl2Runtime({ ...runtime, deviceLost: undefined }).join('|')).toContain('renderer-device-lost-or-unknown');
    expect(validateHardwareWebGl2Runtime({ ...runtime, contextLifecycle: { lost: false, losses: 1, restorations: 1 } }).join('|'))
      .toContain('webgl-context-losses');
  });

  it('freezes the ten-second first-presentation and fifteen-second active limits', () => {
    expect(PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.maximumFirstPresentationMs).toBe(10_000);
    expect(PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS.maximumActiveIncludingCountdownMs).toBe(15_000);
    expect(validateHardwareWebGl2AdmissionTiming({
      deploymentStartedAt: 100, transitionReadyAt: 9_900, firstGameplayPresentedAt: 10_100, activeAt: 15_100,
    })).toEqual([]);
    expect(validateHardwareWebGl2AdmissionTiming({
      deploymentStartedAt: 100, transitionReadyAt: 9_900, firstGameplayPresentedAt: 10_101, activeAt: 15_100,
    }).join('|'))
      .toContain('first-presentation-over-10000ms');
    expect(validateHardwareWebGl2AdmissionTiming({
      deploymentStartedAt: 100, transitionReadyAt: 9_900, firstGameplayPresentedAt: 10_100, activeAt: 15_101,
    }).join('|'))
      .toContain('active-including-countdown-over-15000ms');
    expect(validateHardwareWebGl2AdmissionTiming({
      deploymentStartedAt: 100, transitionReadyAt: 10_000, firstGameplayPresentedAt: 9_000, activeAt: 15_000,
    })).toContain('admission-timing-order-invalid');
  });

  it('allows only bounded 1x1 admission probes and no readPixels at or after transition-ready', () => {
    expect(validateAdmissionReadPixels([
      { at: 20, width: 1, height: 1, stack: 'AtomicSignalPass.validateOutput' },
      { at: 30, width: 1, height: 1, stack: 'AtomicSignalPass.validateOutput' },
      { at: 40, width: 1, height: 1, stack: 'AtomicSignalPass.validateOutput' },
    ], 50)).toEqual([]);
    expect(validateAdmissionReadPixels([{ at: 20, width: 2, height: 1, stack: 'validateOutput' }], 50).join('|')).toContain('not-1x1');
    expect(validateAdmissionReadPixels([{ at: 50, width: 1, height: 1, stack: 'validateOutput' }], 50).join('|'))
      .toContain('at-or-after-transition-ready-readpixels');
    expect(validateAdmissionReadPixels([{ at: 2_050, width: 1, height: 1, stack: 'validateOutput' }], 2_000).join('|'))
      .toContain('at-or-after-transition-ready-readpixels');
    expect(validateAdmissionReadPixels([{ at: 20, width: 1, height: 1, stack: 'AtomicSignalPass.render' }], 50))
      .toContain('admission-readpixels-callsite-invalid');
  });

  it('makes zero >=50ms intervals a post-ready invariant, not a cold-compile claim', () => {
    expect(validatePostReadyFiftyMillisecondFrames([16.6, 49.999])).toEqual([]);
    expect(validatePostReadyFiftyMillisecondFrames([16.6, 50]).join('|')).toContain('post-ready-frames-at-or-above-50ms');
    expect(validatePostReadyFiftyMillisecondFrames([16.6, Number.NaN]).join('|')).toContain('invalid-post-ready-frame-intervals');
  });
});
