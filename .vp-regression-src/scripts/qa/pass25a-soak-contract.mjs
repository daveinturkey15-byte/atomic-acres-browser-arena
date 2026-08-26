const EXPECTED_INJECTED_WEBGL_LOSS = '[atomic-acres:frame] Error: Renderer presentation device-lost: WebGL context lost';

export const PASS25A_SOAK_THRESHOLDS = Object.freeze({
  minimumSamples: 2,
  minimumAverageFps: 4,
  maximumSteadyFrameMs: 500,
  maximumImpactParticles: 72,
  maximumImpactMarks: 32,
  maximumTracers: 18,
  maximumHeapGrowthRatio: 0.25,
});

function object(value) {
  return value !== null && typeof value === 'object' ? value : {};
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function lifecycle(value) {
  const candidate = object(value);
  return {
    lost: candidate.lost,
    losses: finiteNumber(candidate.losses),
    restorations: finiteNumber(candidate.restorations),
  };
}

function checkpoint(value) {
  const candidate = object(value);
  const render = object(candidate.render);
  return {
    frameCount: finiteNumber(candidate.frameCount),
    contextLifecycle: lifecycle(candidate.contextLifecycle ?? render.contextLifecycle),
    framePacing: object(candidate.framePacing ?? render.framePacing),
  };
}

function exactLifecycle(actual, expected) {
  return actual.lost === expected.lost
    && actual.losses === expected.losses
    && actual.restorations === expected.restorations;
}

export function pass25aContextRecoveryFailures(recovery) {
  const evidence = object(recovery);
  const before = checkpoint(evidence.before);
  const lost = checkpoint(evidence.lost);
  const recovered = checkpoint(evidence.recovered);
  const failures = [];

  if (evidence.exercised !== true) failures.push('the deliberate WEBGL_lose_context cycle was not exercised');
  if (!exactLifecycle(before.contextLifecycle, { lost: false, losses: 0, restorations: 0 })) {
    failures.push(`the context was not clean before injection: ${JSON.stringify(before.contextLifecycle)}`);
  }
  if (!exactLifecycle(lost.contextLifecycle, { lost: true, losses: 1, restorations: 0 })) {
    failures.push(`the injected context loss was not observed exactly once: ${JSON.stringify(lost.contextLifecycle)}`);
  }
  if (!exactLifecycle(recovered.contextLifecycle, { lost: false, losses: 1, restorations: 1 })) {
    failures.push(`the injected context loss did not recover exactly once: ${JSON.stringify(recovered.contextLifecycle)}`);
  }
  if (before.frameCount === null || recovered.frameCount === null || recovered.frameCount <= before.frameCount) {
    failures.push(`presentation did not advance after context recovery: ${String(before.frameCount)} -> ${String(recovered.frameCount)}`);
  }
  const recoveryMaxFrameMs = finiteNumber(recovered.framePacing.maxMs);
  if (recoveryMaxFrameMs === null || recoveryMaxFrameMs < 0 || recoveryMaxFrameMs > 1_000) {
    failures.push(`the injected recovery frame evidence is outside the application's bounded sampler: ${String(recoveryMaxFrameMs)}`);
  }
  return failures;
}

function exactInjectedLossMessage(message) {
  if (typeof message !== 'string') return false;
  const lines = message.replaceAll('\r\n', '\n').split('\n');
  if (lines.shift() !== EXPECTED_INJECTED_WEBGL_LOSS) return false;
  return lines.every((line) => /^\s+at\s+\S/u.test(line));
}

export function classifyPass25aSoakBrowserIssues(issues, recovery) {
  const recoveryHealthy = pass25aContextRecoveryFailures(recovery).length === 0;
  const expectedInjected = [];
  const unexpected = [];

  for (const value of Array.isArray(issues) ? issues : []) {
    const issue = object(value);
    const expected = recoveryHealthy
      && expectedInjected.length === 0
      && issue.phase === 'intentional-context-loss'
      && issue.source === 'console:error'
      && exactInjectedLossMessage(issue.message);
    if (expected) expectedInjected.push(issue);
    else unexpected.push(issue);
  }
  return { expectedInjected, unexpected };
}

export function pass25aSoakFailures(report, thresholds = PASS25A_SOAK_THRESHOLDS) {
  const evidence = object(report);
  const samples = Array.isArray(evidence.sampleFrames) ? evidence.sampleFrames : [];
  const failures = pass25aContextRecoveryFailures(evidence.contextRecovery);
  const classified = classifyPass25aSoakBrowserIssues(evidence.browserIssues, evidence.contextRecovery);
  const minimumSamples = finiteNumber(thresholds.minimumSamples);
  const minimumAverageFps = finiteNumber(thresholds.minimumAverageFps);
  const maximumSteadyFrameMs = finiteNumber(thresholds.maximumSteadyFrameMs);
  const maximumImpactParticles = finiteNumber(thresholds.maximumImpactParticles);
  const maximumImpactMarks = finiteNumber(thresholds.maximumImpactMarks);
  const maximumTracers = finiteNumber(thresholds.maximumTracers);
  const maximumHeapGrowthRatio = finiteNumber(thresholds.maximumHeapGrowthRatio);

  if (classified.unexpected.length > 0) {
    failures.push(`unexpected browser/runtime/GPU issues: ${classified.unexpected.map((issue) => String(issue.message)).join(' | ')}`);
  }
  if (minimumSamples === null || samples.length < minimumSamples) {
    failures.push(`insufficient soak samples: ${samples.length}/${String(minimumSamples)}`);
  }
  if (minimumAverageFps === null || finiteNumber(evidence.minAverageFps) === null || evidence.minAverageFps < minimumAverageFps) {
    failures.push(`minimum average FPS failed: ${String(evidence.minAverageFps)}/${String(minimumAverageFps)}`);
  }
  const steadyFramePacing = object(evidence.steadyFramePacing);
  const steadySampleCount = finiteNumber(steadyFramePacing.sampleCount);
  const steadyMaxFrameMs = finiteNumber(steadyFramePacing.maxMs);
  if (steadySampleCount === null || steadySampleCount < 1) failures.push('the post-recovery frame clock collected no samples');
  if (maximumSteadyFrameMs === null || steadyMaxFrameMs === null || steadyMaxFrameMs > maximumSteadyFrameMs) {
    failures.push(`steady-state maximum frame failed: ${String(steadyMaxFrameMs)}/${String(maximumSteadyFrameMs)}ms`);
  }

  const expectedLifecycle = { lost: false, losses: 1, restorations: 1 };
  samples.forEach((sample, index) => {
    const actual = checkpoint(sample).contextLifecycle;
    if (!exactLifecycle(actual, expectedLifecycle)) {
      failures.push(`sample ${index} has an unexpected context lifecycle: ${JSON.stringify(actual)}`);
    }
  });
  const firstFrameCount = checkpoint(samples[0]).frameCount;
  const lastFrameCount = checkpoint(samples.at(-1)).frameCount;
  if (firstFrameCount === null || lastFrameCount === null || lastFrameCount <= firstFrameCount) {
    failures.push(`the game frame loop did not advance during the soak: ${String(firstFrameCount)} -> ${String(lastFrameCount)}`);
  }

  const maximumEffects = object(evidence.maximumEffects);
  if (maximumImpactParticles === null || finiteNumber(maximumEffects.impactParticles) === null
    || maximumEffects.impactParticles > maximumImpactParticles) {
    failures.push(`impact particle pool exceeded: ${String(maximumEffects.impactParticles)}/${String(maximumImpactParticles)}`);
  }
  if (maximumImpactMarks === null || finiteNumber(maximumEffects.impactMarks) === null
    || maximumEffects.impactMarks > maximumImpactMarks) {
    failures.push(`impact mark pool exceeded: ${String(maximumEffects.impactMarks)}/${String(maximumImpactMarks)}`);
  }
  if (maximumTracers === null || finiteNumber(maximumEffects.tracers) === null
    || maximumEffects.tracers > maximumTracers) {
    failures.push(`tracer pool exceeded: ${String(maximumEffects.tracers)}/${String(maximumTracers)}`);
  }
  const heapGrowthRatio = evidence.heapGrowthRatio;
  if (heapGrowthRatio !== null && (maximumHeapGrowthRatio === null || finiteNumber(heapGrowthRatio) === null
    || heapGrowthRatio > maximumHeapGrowthRatio)) {
    failures.push(`heap growth ratio exceeded: ${String(heapGrowthRatio)}/${String(maximumHeapGrowthRatio)}`);
  }
  return failures;
}

export function summarizePass25aSoakBrowserIssues(issues, recovery) {
  const classified = classifyPass25aSoakBrowserIssues(issues, recovery);
  return Object.freeze({
    expectedInjected: Object.freeze(classified.expectedInjected.map((issue) => String(issue.message))),
    unexpected: Object.freeze(classified.unexpected.map((issue) => String(issue.message))),
  });
}
