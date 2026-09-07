import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { outputsFor } from '../scripts/release/change-impact.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const boundedRunner = readFileSync(resolve(repositoryRoot, 'scripts/qa/run-bounded-e2e.mjs'), 'utf8');
const selectorSpec = 'tests/e2e/pass66-field-kit-killstreak-menu.spec.ts';
const selectorGroup = 'pass74-selector-layout';
const desktopTest = 'previews the equipped streak on hover/focus without gameplay render ownership';
const narrowTest = 'uses poster-only demo mode for reduced motion and stacks cleanly at narrow width';

describe('Pass 74 selector layout CI wiring', () => {
  it('registers one explicit Chromium bounded group with the two targeted visual contracts', () => {
    const lines = boundedRunner.split(/\r?\n/u).filter((line) => line.includes(`name: '${selectorGroup}'`));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('default: false');
    expect(lines[0]).toContain(`'${selectorSpec}'`);
    expect(lines[0]).toContain("'--project=chromium'");
    expect(lines[0]).toContain("'--workers=1'");
    expect(lines[0]).toContain(`'${desktopTest}|${narrowTest}'`);
  });

  it('selects the group exactly once for full Windows and Linux impact only', () => {
    const full = outputsFor({ mode: 'full', reason: 'runtime-or-unclassified' });
    for (const groups of [full.windows_groups, full.linux_groups]) {
      expect(groups.split(',').filter((group) => group === selectorGroup)).toHaveLength(1);
    }
    for (const mode of ['none', 'smoke'] as const) {
      const output = outputsFor({ mode, reason: mode === 'none' ? 'process-only' : 'release-shell-only' });
      expect(output.windows_groups.split(',')).not.toContain(selectorGroup);
      expect(output.linux_groups.split(',')).not.toContain(selectorGroup);
    }
  });
});
