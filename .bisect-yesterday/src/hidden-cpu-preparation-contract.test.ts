import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

type HiddenCpuSources = Readonly<{
  scheduler: string;
  botVocabulary: string;
  grenade: string;
  killstreak: string;
  operator: string;
  renderRuntime: string;
}>;

function currentSources(): HiddenCpuSources {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  return {
    scheduler: read('./browser-preparation-scheduler.ts'),
    botVocabulary: read('./bot-weapon-gpu-vocabulary.ts'),
    grenade: read('./grenade-presentation.ts'),
    killstreak: read('./killstreak-presentation.ts'),
    operator: read('./operator-model.ts'),
    renderRuntime: read('./rendering/render-runtime.ts'),
  };
}

function hiddenCpuPreparationIssues(sources: HiddenCpuSources): readonly string[] {
  const issues: string[] = [];
  const cpuOwners = [
    ['bot-vocabulary', sources.botVocabulary],
    ['grenade', sources.grenade],
    ['killstreak', sources.killstreak],
    ['operator', sources.operator],
  ] as const;
  for (const [owner, source] of cpuOwners) {
    if (/(?:globalThis\.)?setTimeout\s*\(\s*(?:resolve|task)\s*,\s*0\s*\)/.test(source)) {
      issues.push(`${owner}:direct-zero-delay-timer`);
    }
    if (!source.includes('yieldBrowserCpuTask')) issues.push(`${owner}:central-cpu-lane-missing`);
  }
  if (!sources.killstreak.includes('yieldBrowserPreparationFrame')) {
    issues.push('killstreak:visible-frame-yield-missing');
  }

  const laneStart = sources.scheduler.indexOf('export class BrowserCpuTaskLane');
  const laneEnd = sources.scheduler.indexOf('const browserCpuTaskLane', laneStart);
  const lane = laneStart >= 0 && laneEnd > laneStart ? sources.scheduler.slice(laneStart, laneEnd) : '';
  for (const token of [
    'channel.port2.postMessage(undefined)',
    'this.queue.shift()',
    'this.queue.splice(0, this.queue.length)',
    'channel.port1.close()',
    'channel.port2.close()',
    'queueMicrotask(',
  ]) {
    if (!lane.includes(token)) issues.push(`scheduler:missing:${token}`);
  }
  for (const forbidden of ['requestAnimationFrame', 'compileAndRender', 'submitFrame', 'navigator.gpu']) {
    if (lane.includes(forbidden)) issues.push(`scheduler:cpu-lane-owns-presentation:${forbidden}`);
  }
  if (!sources.scheduler.includes('return yieldBrowserCpuTask();')) {
    issues.push('scheduler:hidden-frame-cpu-route-missing');
  }
  if ((sources.scheduler.match(/scheduleBrowserCpuTask\(run\)/g)?.length ?? 0) < 1
    || !sources.scheduler.includes('scheduleBrowserCpuTask(task);')) {
    issues.push('scheduler:hidden-idle-cpu-route-missing');
  }

  const webGpuStart = sources.renderRuntime.indexOf('export class WebGpuRenderRuntime');
  const compileStart = sources.renderRuntime.indexOf('async compileAndRender(', webGpuStart);
  const submitStart = sources.renderRuntime.indexOf('\n  submitFrame(', compileStart);
  const submitEnd = sources.renderRuntime.indexOf('\n  async flush(', submitStart);
  const compile = sources.renderRuntime.slice(compileStart, submitStart);
  const submit = sources.renderRuntime.slice(submitStart, submitEnd);
  if ((compile.match(/await waitForVisibleBrowserPreparation\(\);/g)?.length ?? 0) < 2) {
    issues.push('render-runtime:foreground-barrier-missing');
  }
  // Cold prewarm must still take the FORCED submission path.
  if (!compile.includes("submitted = this.submitFrame(this.clock(), true, 'serialized', force);")) {
    issues.push('render-runtime:forced-submission-path-missing');
  }
  // Prewarm may settle for a VISIBLE-but-unfocused document after waiting
  // politely for focus (an unbounded focus wait hung loading forever), but it
  // must never settle for a HIDDEN one. Pin all three halves of that rule:
  // the bounded patience, the visibility re-check before forcing, and a
  // submitFrame guard that still refuses a hidden document in either mode.
  if (!compile.includes('const force = attempt >= WebGpuRenderRuntime.PREWARM_FOCUS_ATTEMPTS;')) {
    issues.push('render-runtime:prewarm-focus-patience-missing');
  }
  if (!compile.includes('if (force && !browserPresentationIsVisible()) continue;')) {
    issues.push('render-runtime:prewarm-hidden-escape-missing');
  }
  if (!submit.includes('? !browserPresentationIsVisible()')
    || !submit.includes(': !browserOwnsForegroundPresentation()) return false;')) {
    issues.push('render-runtime:hidden-submission-guard-missing');
  }
  // The weaker gate must be reachable ONLY through the explicit prewarm flag -
  // gameplay submission keeps the strict foreground requirement.
  if (!submit.includes('allowUnfocusedVisible = false,')) {
    issues.push('render-runtime:unfocused-allowance-not-opt-in');
  }
  return Object.freeze(issues);
}

describe('hidden CPU preparation contract', () => {
  it('routes every bounded CPU/decode yield through the fair task lane without taking GPU ownership', () => {
    expect(hiddenCpuPreparationIssues(currentSources())).toEqual([]);
  });

  it('rejects direct hidden timer, presentation-lane and foreground-guard mutations', () => {
    const source = currentSources();
    const directTimer = {
      ...source,
      operator: source.operator.replace(
        'await yieldBrowserCpuTask();',
        'await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));',
      ),
    };
    expect(hiddenCpuPreparationIssues(directTimer)).toContain('operator:direct-zero-delay-timer');

    const directTaskTimer = {
      ...source,
      botVocabulary: source.botVocabulary.replace(
        'return yieldBrowserCpuTask();',
        'globalThis.setTimeout(task, 0); return Promise.resolve();',
      ),
    };
    expect(hiddenCpuPreparationIssues(directTaskTimer)).toContain('bot-vocabulary:direct-zero-delay-timer');

    const presentationOwned = {
      ...source,
      scheduler: source.scheduler.replace(
        'export class BrowserCpuTaskLane {',
        'export class BrowserCpuTaskLane {\n  private forbidden = requestAnimationFrame;',
      ),
    };
    expect(hiddenCpuPreparationIssues(presentationOwned)).toContain(
      'scheduler:cpu-lane-owns-presentation:requestAnimationFrame',
    );

    const unguarded = {
      ...source,
      renderRuntime: source.renderRuntime.replaceAll(
        'await waitForVisibleBrowserPreparation();',
        'await Promise.resolve();',
      ),
    };
    expect(hiddenCpuPreparationIssues(unguarded)).toContain('render-runtime:foreground-barrier-missing');
  });
});
