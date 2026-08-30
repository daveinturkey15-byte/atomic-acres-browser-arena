import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner-facing regression, found by the cross-browser gate 2026-08-30.
 *
 * showFatalError() is reachable DURING module evaluation: the WebGPU
 * requirement path calls it from the top-level bootstrap (legacy-main.ts,
 * "This game needs WebGPU"), which runs thousands of lines before the client
 * world-repair state it resets is declared. A module-level `let` assigned from
 * inside its temporal dead zone throws a ReferenceError, so the player saw
 *
 *   Cannot access 'clientWorldRepairAdmission' before initialization
 *
 * instead of the WebGPU guidance - the error reporter destroyed the message it
 * existed to deliver, in exactly the situation where a clear message matters
 * most (a browser that cannot run the game at all).
 *
 * The gate: any module-scope state that showFatalError touches must be reset
 * defensively, because the function's contract is that it works at ANY point
 * in the lifecycle. Source-level, because the failure only reproduces during
 * module init, which a unit test cannot re-enter.
 */
const SOURCE = readFileSync(resolve(import.meta.dirname, 'legacy-main.ts'), 'utf8');

function showFatalErrorBody(): string {
  const start = SOURCE.indexOf('function showFatalError(');
  expect(start, 'showFatalError must exist').toBeGreaterThan(-1);
  const end = SOURCE.indexOf('\nfunction ', start + 1);
  return SOURCE.slice(start, end === -1 ? undefined : end);
}

describe('showFatalError survives being called before module init (owner 2026-08-30)', () => {
  it('resets module state defensively so it can never mask the real failure', () => {
    const body = showFatalErrorBody();
    expect(body).toContain('clientWorldRepairAdmission = null');
    // The reset must be guarded. Without this, a pre-initialisation call
    // throws and the player never sees why the game would not start.
    const resetIndex = body.indexOf('clientWorldRepairAdmission = null');
    const tryIndex = body.indexOf('try {');
    expect(tryIndex, 'the module-state reset must sit inside a try block').toBeGreaterThan(-1);
    expect(tryIndex).toBeLessThan(resetIndex);
    expect(body).toMatch(/}\s*catch\s*\{/);
  });

  it('still reports the real message and marks the bootstrap failed', () => {
    const body = showFatalErrorBody();
    expect(body).toContain("setBootstrapStage('failed')");
    expect(body).toContain('bootstrapError = message');
    // The message must be derived before any state work, so nothing that
    // follows can prevent it being reported.
    expect(body.indexOf('const message =')).toBeLessThan(body.indexOf('setBootstrapStage'));
  });

  it('keeps the WebGPU requirement path routed through showFatalError', () => {
    // If this ever stops calling showFatalError, the guarantee above stops
    // protecting the case it was written for.
    expect(SOURCE).toContain('This game needs WebGPU');
    const webgpuIndex = SOURCE.indexOf('This game needs WebGPU');
    const callIndex = SOURCE.lastIndexOf('showFatalError(', webgpuIndex);
    expect(callIndex, 'the WebGPU requirement must be raised via showFatalError').toBeGreaterThan(-1);
    expect(webgpuIndex - callIndex).toBeLessThan(400);
  });
});
