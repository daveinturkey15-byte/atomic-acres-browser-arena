import { describe, expect, it } from 'vitest';
import { classifyPaths } from '../scripts/release/change-impact.mjs';

describe('release change impact', () => {
  it('skips expensive browser groups for process-only changes', () => {
    expect(classifyPaths([
      'AGENTS.md',
      'docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md',
      '.github/workflows/verify.yml',
      'scripts/release/change-impact.mjs',
    ])).toEqual({ mode: 'none', reason: 'process-only' });
  });

  it('uses a focused browser smoke for release-shell changes', () => {
    expect(classifyPaths(['index.html', 'src/release-channel.test.ts']))
      .toEqual({ mode: 'smoke', reason: 'release-shell-only' });
  });

  it('fails safe to the full browser contract for runtime or unknown paths', () => {
    expect(classifyPaths(['src/network.ts'])).toEqual({ mode: 'full', reason: 'runtime-or-unclassified' });
    expect(classifyPaths(['mystery/new-surface.bin'])).toEqual({ mode: 'full', reason: 'runtime-or-unclassified' });
    expect(classifyPaths([])).toEqual({ mode: 'full', reason: 'empty-or-unresolvable-diff' });
  });
});
