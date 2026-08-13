import { describe, expect, it } from 'vitest';
import { classifyPaths, outputsFor } from '../scripts/release/change-impact.mjs';

describe('release change impact', () => {
  it('skips expensive browser groups for process-only changes', () => {
    expect(classifyPaths([
      'AGENTS.md',
      'docs/CONTRIBUTION_AND_RELEASE_PIPELINE.md',
      '.github/workflows/verify.yml',
      'scripts/release/change-impact.mjs',
      'scripts/qa/run-with-preview-server.mjs',
      'src/release-topology.test.ts',
    ])).toEqual({ mode: 'none', reason: 'process-only' });
  });

  it('treats only exact-SHA finalizer receipt JSON as process-only evidence', () => {
    const sha = 'a'.repeat(40);
    expect(classifyPaths([
      `artifacts/pass65-owner-feedback/t-owner-gate-${sha}.json`,
      `artifacts/pass65-owner-feedback/hardware-webgl2-admission-${sha}.json`,
      `artifacts/pass65/hardware-webgl2-admission/${sha}-receipt.json`,
      `artifacts/pass65/hardware-webgl2-admission/${sha}-dist-manifest.json`,
    ])).toEqual({ mode: 'none', reason: 'process-only' });

    for (const path of [
      `artifacts/pass65-owner-feedback/t-owner-gate-${'a'.repeat(39)}.json`,
      `artifacts/pass65-owner-feedback/runtime-${sha}.json`,
      `artifacts/pass65-owner-feedback/t-owner-gate-${sha}.bin`,
      `artifacts/pass65/hardware-webgl2-admission/${sha}-receipt.json.sha256`,
      `artifacts/pass65/hardware-webgl2-admission/${sha}-other.json`,
      `artifacts/pass65/other/${sha}-receipt.json`,
    ]) {
      expect(classifyPaths([path]), path).toEqual({ mode: 'full', reason: 'runtime-or-unclassified' });
    }
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

  it('keeps the release chooser contract in both full browser matrices', () => {
    const output = outputsFor(classifyPaths(['src/network.ts']));
    expect(output.windows_groups.split(',')).toContain('release-shell');
    expect(output.linux_groups.split(',')).toContain('release-shell');
  });

  it('leaves the passing Linux HUD batch intact and removes it from the split Windows runner', () => {
    const output = outputsFor(classifyPaths(['src/network.ts']));
    expect(output.windows_groups.split(',')).not.toContain('pass64-hud-contracts');
    expect(output.linux_groups.split(',')).toContain('pass64-hud-contracts');
  });

  it('routes the Pass 71 hitch and lifecycle gates through bounded supplemental shards', () => {
    const output = outputsFor(classifyPaths(['src/legacy-main.ts']));
    expect(output.windows_supplemental_groups.split(',')).toEqual([
      'pass71-grenade-first-action',
      'pass70-chopper-gunner',
    ]);
    expect(output.linux_supplemental_groups.split(',')).toEqual([
      'pass71-glass-quality-matrix',
      'pass71-glass-quality-flare',
      'pass71-glass-quality-crossbow',
      'pass71-glass-performance-matrix',
      'pass71-glass-performance-flare',
      'pass71-glass-performance-crossbow',
      'pass71-nuke-warning',
    ]);
    const smoke = outputsFor(classifyPaths(['index.html']));
    expect(smoke.windows_supplemental_groups).toBe('');
    expect(smoke.linux_supplemental_groups).toBe('');
  });
});
