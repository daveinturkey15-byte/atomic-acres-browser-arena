import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const runner = readFileSync(new URL('../scripts/qa/run-pass70-cross-browser.mjs', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../tests/e2e/pass70-cross-browser-firefox-multiplayer.spec.ts', import.meta.url), 'utf8');

function targetBlock(name: string, nextName: string): string {
  const start = runner.indexOf(`  ${name}: Object.freeze({`);
  const end = runner.indexOf(`  ${nextName}: Object.freeze({`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return runner.slice(start, end);
}

describe('Pass 70 cross-browser runner topology ownership', () => {
  it('keeps the desktop lifecycle pair and excludes it from the dedicated iPhone lane', () => {
    expect(targetBlock('available', 'firefox')).toContain('verifyCrossEnginePair: true');
    expect(targetBlock('firefox', 'iphone15')).toContain('verifyCrossEnginePair: true');
    expect(targetBlock('iphone15', 'opera')).toContain('verifyCrossEnginePair: false');
    expect(runner.slice(runner.indexOf('  opera: Object.freeze({'), runner.indexOf('\n});')))
      .toContain('verifyCrossEnginePair: true');
    expect(runner).toContain("PASS70_VERIFY_CROSS_ENGINE_PAIR: target.verifyCrossEnginePair ? '1' : '0'");
  });

  it('makes the explicit pair fail closed unless its runner grants ownership', () => {
    expect(spec).toContain("const verifyCrossEnginePair = process.env.PASS70_VERIFY_CROSS_ENGINE_PAIR === '1'");
    expect(spec).toContain('test.skip(!verifyCrossEnginePair,');
  });
});
