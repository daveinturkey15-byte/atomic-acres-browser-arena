import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Owner-facing regression, found twice by the cross-browser gate.
 *
 * showFatalError() is reachable DURING module evaluation: the WebGPU
 * requirement path calls it from the top-level bootstrap ("This game needs
 * WebGPU"), which runs thousands of lines before the module state it touches is
 * declared. Assigning - or reading - a module `let` from inside its temporal
 * dead zone throws a ReferenceError, so the error reporter destroys the very
 * message it exists to deliver, in the one situation where a clear message
 * matters most: a browser that cannot run the game at all.
 *
 * 2026-08-30 the player saw "Cannot access 'clientWorldRepairAdmission' before
 * initialization". That was fixed by guarding that one binding - and 2026-08-31
 * the gate caught "Cannot access 'bootstrapStage' before initialization"
 * instead, because setBootstrapStage() sat on the very next line, outside the
 * guard. The first gate had pinned the FIX (it asserted the presence of
 * `clientWorldRepairAdmission = null` and of `setBootstrapStage('failed')`)
 * rather than the INVARIANT, so the same bug walked straight back through it.
 *
 * THE INVARIANT, pinned here instead: outside its guard, showFatalError may do
 * exactly two things - derive the message, and console.error it. Both depend on
 * nothing. EVERYTHING else it does must sit inside a try/catch, and the catch
 * must fall back to a DOM write that touches no module state at all. Stated
 * that way it does not matter WHICH binding a future edit reaches for, which is
 * the whole point: the previous gate only knew about the binding that had
 * already bitten us.
 *
 * Source-level, because the failure only reproduces during module
 * initialisation, which a unit test cannot re-enter.
 */
const SOURCE = readFileSync(resolve(import.meta.dirname, 'legacy-main.ts'), 'utf8');

function functionBody(name: string): string {
  const start = SOURCE.indexOf(`function ${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const end = SOURCE.indexOf('\nfunction ', start + 1);
  return SOURCE.slice(start, end === -1 ? undefined : end);
}

/** Statements in a body, flattened, with comments and blank lines removed. */
function statementsOutsideTry(body: string): string[] {
  const open = body.indexOf('  try {');
  expect(open, 'showFatalError must guard its state work in a try block').toBeGreaterThan(-1);
  const head = body.slice(body.indexOf('{') + 1, open);
  return head
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('//') && !line.startsWith('*') && !line.startsWith('/*'));
}

describe('showFatalError survives being called before module init (owner 2026-08-30, re-broken and re-fixed 2026-08-31)', () => {
  it('does nothing outside its guard except derive the message and log it', () => {
    const outside = statementsOutsideTry(functionBody('showFatalError'));
    // Exactly two statements, in this order. Anything else - a module `let`, a
    // helper that assigns one, a UI call - belongs inside the try, because at
    // the WebGPU call site none of it exists yet.
    expect(outside).toEqual([
      'const message = error instanceof Error ? error.message : String(error);',
      "console.error('[Nuke Town fatal]', error);",
    ]);
  });

  it('falls back to a DOM write that cannot itself throw on module state', () => {
    const body = functionBody('showFatalError');
    expect(body).toMatch(/}\s*catch\s*\{/);
    expect(body).toContain('renderPreInitFatalMessage(message)');

    // The fallback is the floor under everything. It must be a hoisted function
    // declaration (so it is callable before its own line runs) and must touch
    // nothing but `document` - no module binding, no imported singleton.
    const fallback = functionBody('renderPreInitFatalMessage');
    expect(SOURCE).toContain('function renderPreInitFatalMessage(');
    expect(fallback).toContain("typeof document === 'undefined'");
    for (const forbidden of ['setStatus(', 'presentBanner(', 'applyMenuLifecycle(', 'audio.', 'element<', 'setBootstrapStage(']) {
      expect(fallback, `the pre-init fallback must not call ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('still marks the bootstrap failed and reports the message on the normal path', () => {
    // The guard must not have turned into a silent swallow: the real work is
    // still there, just inside the try.
    const body = functionBody('showFatalError');
    expect(body).toContain("setBootstrapStage('failed')");
    expect(body).toContain('bootstrapError = message');
    expect(body).toContain('clientWorldRepairAdmission = null');
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

  it('is called before the state it touches is declared - the reason all of this exists', () => {
    // Proves the hazard is real rather than theoretical, and fails loudly if a
    // future reorder makes it stop being real (at which point this whole gate
    // deserves re-reading rather than silently passing for the wrong reason).
    const firstCall = SOURCE.indexOf('showFatalError(new Error(');
    expect(firstCall).toBeGreaterThan(-1);
    for (const binding of ['let bootstrapStage', 'let clientWorldRepairAdmission']) {
      const declared = SOURCE.indexOf(`\n${binding}`);
      expect(declared, `${binding} must exist`).toBeGreaterThan(-1);
      expect(
        declared,
        `${binding} is declared AFTER the first showFatalError call, so touching it there is a TDZ throw`,
      ).toBeGreaterThan(firstCall);
    }
  });
});
