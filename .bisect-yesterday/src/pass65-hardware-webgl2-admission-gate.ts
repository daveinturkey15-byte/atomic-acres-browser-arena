export const PASS65_HARDWARE_WEBGL2_FEEDBACK_IDS = Object.freeze([
  'HF-001', 'HF-002', 'HF-003', 'HF-041', 'HF-064',
  'HF-065', 'HF-098', 'HF-118', 'HF-138',
] as const);

export const PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS = Object.freeze({
  freshBrowserTrials: 3,
  maximumFirstPresentationMs: 10_000,
  maximumActiveIncludingCountdownMs: 15_000,
  steadyWindowMs: 10_000,
  maximumAdmissionReadPixelsCalls: 3,
  maximumAdmissionReadPixelsArea: 1,
  maximumPostReadyFramesAtOrAbove50Ms: 0,
});

export type HardwareWebGl2RuntimeAudit = Readonly<{
  requestedBackend: unknown;
  actualBackend: unknown;
  initialized: unknown;
  adapterLabel: unknown;
  adapterClass: unknown;
  softwareAdapter: unknown;
  deviceLost: unknown;
  uncapturedErrors: unknown;
  contextLifecycle: Readonly<{ lost: unknown; losses: unknown; restorations: unknown }> | null;
}>;

export type HardwareWebGl2AdmissionTiming = Readonly<{
  deploymentStartedAt: number;
  transitionReadyAt: number | null;
  firstGameplayPresentedAt: number | null;
  activeAt: number | null;
}>;

export type WebGlReadPixelsEvent = Readonly<{
  at: number;
  width: number;
  height: number;
  stack: string;
}>;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|softpipe|\bwarp\b|microsoft basic render driver/i;

export function validateHardwareWebGl2Runtime(audit: HardwareWebGl2RuntimeAudit): readonly string[] {
  const issues: string[] = [];
  if (audit.requestedBackend !== 'webgl2' || audit.actualBackend !== 'webgl2' || audit.initialized !== true) {
    issues.push('hardware-webgl2-not-active');
  }
  if (audit.softwareAdapter !== false) issues.push(`software-adapter:${String(audit.softwareAdapter)}`);
  if (audit.adapterClass !== 'WebGL2RenderingContext') {
    issues.push(`webgl2-context-class-invalid:${String(audit.adapterClass)}`);
  }
  const adapterLabel = typeof audit.adapterLabel === 'string' ? audit.adapterLabel : '';
  if (!/ANGLE/i.test(adapterLabel)) issues.push(`angle-adapter-proof-missing:${adapterLabel || '<missing>'}`);
  if (SOFTWARE_RENDERER.test(adapterLabel)) issues.push(`software-adapter-label:${adapterLabel}`);
  if (audit.deviceLost !== false) issues.push(`renderer-device-lost-or-unknown:${String(audit.deviceLost)}`);
  if (Number(audit.uncapturedErrors) !== 0) issues.push(`renderer-uncaptured-errors:${String(audit.uncapturedErrors)}`);
  if (!audit.contextLifecycle) issues.push('webgl-context-lifecycle-missing');
  else {
    if (audit.contextLifecycle.lost !== false) issues.push(`webgl-context-currently-lost:${String(audit.contextLifecycle.lost)}`);
    if (Number(audit.contextLifecycle.losses) !== 0) issues.push(`webgl-context-losses:${String(audit.contextLifecycle.losses)}`);
    if (Number(audit.contextLifecycle.restorations) !== 0) issues.push(`webgl-context-restorations:${String(audit.contextLifecycle.restorations)}`);
  }
  return Object.freeze(issues);
}

export function validateHardwareWebGl2AdmissionTiming(
  timing: HardwareWebGl2AdmissionTiming,
  thresholds = PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS,
): readonly string[] {
  const issues: string[] = [];
  const transitionReadyMs = timing.transitionReadyAt === null
    ? Number.POSITIVE_INFINITY
    : timing.transitionReadyAt - timing.deploymentStartedAt;
  const firstPresentationMs = timing.firstGameplayPresentedAt === null
    ? Number.POSITIVE_INFINITY
    : timing.firstGameplayPresentedAt - timing.deploymentStartedAt;
  const activeMs = timing.activeAt === null
    ? Number.POSITIVE_INFINITY
    : timing.activeAt - timing.deploymentStartedAt;
  if (!(timing.deploymentStartedAt <= (timing.transitionReadyAt ?? Number.NaN)
    && (timing.transitionReadyAt ?? Number.NaN) <= (timing.firstGameplayPresentedAt ?? Number.NaN)
    && (timing.firstGameplayPresentedAt ?? Number.NaN) <= (timing.activeAt ?? Number.NaN))) {
    issues.push('admission-timing-order-invalid');
  }
  if (!Number.isFinite(transitionReadyMs) || transitionReadyMs < 0
    || transitionReadyMs > thresholds.maximumFirstPresentationMs) {
    issues.push(`transition-ready-over-${thresholds.maximumFirstPresentationMs}ms:${transitionReadyMs}`);
  }
  if (!Number.isFinite(firstPresentationMs) || firstPresentationMs < 0
    || firstPresentationMs > thresholds.maximumFirstPresentationMs) {
    issues.push(`first-presentation-over-${thresholds.maximumFirstPresentationMs}ms:${firstPresentationMs}`);
  }
  if (!Number.isFinite(activeMs) || activeMs < firstPresentationMs
    || activeMs > thresholds.maximumActiveIncludingCountdownMs) {
    issues.push(`active-including-countdown-over-${thresholds.maximumActiveIncludingCountdownMs}ms:${activeMs}`);
  }
  return Object.freeze(issues);
}

export function validateAdmissionReadPixels(
  events: readonly WebGlReadPixelsEvent[],
  transitionReadyAt: number | null,
  thresholds = PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS,
): readonly string[] {
  const issues: string[] = [];
  if (events.length > thresholds.maximumAdmissionReadPixelsCalls) {
    issues.push(`admission-readpixels-count:${events.length}/${thresholds.maximumAdmissionReadPixelsCalls}`);
  }
  for (const event of events) {
    if (typeof event.stack !== 'string' || !/validateOutput/.test(event.stack)) {
      issues.push('admission-readpixels-callsite-invalid');
    }
    if (event.width * event.height > thresholds.maximumAdmissionReadPixelsArea
      || event.width !== 1 || event.height !== 1) {
      issues.push(`admission-readpixels-not-1x1:${event.width}x${event.height}`);
    }
    if (transitionReadyAt !== null && event.at >= transitionReadyAt) {
      issues.push(`at-or-after-transition-ready-readpixels:${event.at}/${transitionReadyAt}`);
    }
  }
  return Object.freeze([...new Set(issues)]);
}

export function validatePostReadyFiftyMillisecondFrames(
  intervalsMs: readonly number[],
  thresholds = PASS65_HARDWARE_WEBGL2_ADMISSION_THRESHOLDS,
): readonly string[] {
  const issues: string[] = [];
  const invalid = intervalsMs.filter((interval) => !Number.isFinite(interval) || interval <= 0).length;
  if (invalid > 0) issues.push(`invalid-post-ready-frame-intervals:${invalid}`);
  const count = intervalsMs.filter((interval) => Number.isFinite(interval) && interval >= 50).length;
  if (count > thresholds.maximumPostReadyFramesAtOrAbove50Ms) {
    issues.push(`post-ready-frames-at-or-above-50ms:${count}/${thresholds.maximumPostReadyFramesAtOrAbove50Ms}`);
  }
  return Object.freeze(issues);
}
