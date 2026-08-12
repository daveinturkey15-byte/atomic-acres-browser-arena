import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyPass25aSoakBrowserIssues,
  pass25aContextRecoveryFailures,
  pass25aSoakFailures,
} from './pass25a-soak-contract.mjs';

const injectedLoss = '[atomic-acres:frame] Error: Renderer presentation device-lost: WebGL context lost\n'
  + '    at renderFrame (http://127.0.0.1:4181/channels/the-big-one/assets/legacy-main.js:1:2)';

function contextRecovery(overrides = {}) {
  return {
    exercised: true,
    before: {
      frameCount: 40,
      contextLifecycle: { lost: false, losses: 0, restorations: 0 },
      framePacing: { maxMs: 16.7 },
    },
    lost: {
      frameCount: 41,
      contextLifecycle: { lost: true, losses: 1, restorations: 0 },
      framePacing: { maxMs: 1_000 },
    },
    recovered: {
      frameCount: 42,
      contextLifecycle: { lost: false, losses: 1, restorations: 1 },
      framePacing: { maxMs: 1_000, lastResetReason: 'animation frame eligibility · recovery 1' },
    },
    ...overrides,
  };
}

function validReport(overrides = {}) {
  const recovery = contextRecovery();
  return {
    schema: 'atomic-acres/pass25a-soak@3',
    browserIssues: [{ phase: 'intentional-context-loss', source: 'console:error', message: injectedLoss }],
    contextRecovery: recovery,
    sampleFrames: [
      { frameCount: 43, contextLifecycle: { lost: false, losses: 1, restorations: 1 } },
      { frameCount: 160, contextLifecycle: { lost: false, losses: 1, restorations: 1 } },
    ],
    minAverageFps: 4.6,
    steadyFramePacing: { sampleCount: 118, maxMs: 283.4 },
    maximumEffects: { impactParticles: 0, impactMarks: 0, tracers: 0 },
    heapGrowthRatio: 0,
    ...overrides,
  };
}

test('admits only the exact one-off runtime error caused by a proven injected-and-restored context loss', () => {
  const report = validReport();
  const classified = classifyPass25aSoakBrowserIssues(report.browserIssues, report.contextRecovery);
  assert.equal(classified.expectedInjected.length, 1);
  assert.deepEqual(classified.unexpected, []);
  assert.deepEqual(pass25aSoakFailures(report), []);
});

test('does not admit the injected-loss signature if recovery is incomplete', () => {
  const recovery = contextRecovery({
    recovered: {
      frameCount: 42,
      contextLifecycle: { lost: true, losses: 1, restorations: 0 },
      framePacing: { maxMs: 1_000 },
    },
  });
  const classified = classifyPass25aSoakBrowserIssues(validReport().browserIssues, recovery);
  assert.equal(classified.expectedInjected.length, 0);
  assert.equal(classified.unexpected.length, 1);
  assert.match(pass25aContextRecoveryFailures(recovery).join('\n'), /did not recover exactly once/u);
});

test('rejects changed, repeated, late and non-console loss errors plus every unrelated error', () => {
  const report = validReport();
  const classified = classifyPass25aSoakBrowserIssues([
    ...report.browserIssues,
    ...report.browserIssues,
    { phase: 'soak', source: 'console:error', message: injectedLoss },
    { phase: 'intentional-context-loss', source: 'pageerror', message: injectedLoss },
    { phase: 'intentional-context-loss', source: 'console:error', message: `${injectedLoss}\nnot a stack frame` },
    { phase: 'soak', source: 'http', message: 'HTTP 500 /leaderboard' },
  ], report.contextRecovery);
  assert.equal(classified.expectedInjected.length, 1);
  assert.equal(classified.unexpected.length, 5);
});

test('keeps the 500ms threshold strict after excluding only the measured recovery interval', () => {
  const admittedRecovery = validReport({
    applicationMaxFrameMsIncludingInjectedRecovery: 1_000,
    steadyFramePacing: { sampleCount: 118, maxMs: 500 },
  });
  assert.deepEqual(pass25aSoakFailures(admittedRecovery), []);

  const laterStall = validReport({
    applicationMaxFrameMsIncludingInjectedRecovery: 1_000,
    steadyFramePacing: { sampleCount: 118, maxMs: 500.01 },
  });
  assert.match(pass25aSoakFailures(laterStall).join('\n'), /steady-state maximum frame failed/u);
});

test('rejects later context loss, a stalled frame loop and the retained effect and heap thresholds', () => {
  const failures = pass25aSoakFailures(validReport({
    sampleFrames: [
      { frameCount: 43, contextLifecycle: { lost: false, losses: 1, restorations: 1 } },
      { frameCount: 43, contextLifecycle: { lost: false, losses: 2, restorations: 2 } },
    ],
    maximumEffects: { impactParticles: 73, impactMarks: 33, tracers: 19 },
    heapGrowthRatio: 0.251,
  })).join('\n');
  assert.match(failures, /unexpected context lifecycle/u);
  assert.match(failures, /frame loop did not advance/u);
  assert.match(failures, /impact particle pool exceeded/u);
  assert.match(failures, /impact mark pool exceeded/u);
  assert.match(failures, /tracer pool exceeded/u);
  assert.match(failures, /heap growth ratio exceeded/u);
});
