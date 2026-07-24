import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/release-production.yml', 'utf8');

describe('production release workflow', () => {
  it('configures a repository-local bot identity before publishing gh-pages', () => {
    const identityStep = workflow.indexOf('Configure release commit identity');
    const publishStep = workflow.indexOf('Publish complete exact dist snapshot');

    expect(identityStep).toBeGreaterThan(-1);
    expect(publishStep).toBeGreaterThan(identityStep);
    expect(workflow).toContain('git config user.name "github-actions[bot]"');
    expect(workflow).toContain('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');
    expect(workflow).not.toContain('git config --global');
  });

  it('stages pinned Pass 60 and Pass 59 beside isolated Pass 61 before a complete publish', () => {
    expect(workflow).toContain('npm run stage:release-topology');
    expect(workflow).toContain('npm run verify:release-topology');
    expect(workflow).toContain('SOURCE_SHA: ${{ inputs.source_sha }}');
    expect(workflow).toContain('RELEASE_PASS: ${{ inputs.release_pass }}');
    expect(workflow).not.toContain('stage:stable-channel');
    expect(readFileSync('package.json', 'utf8')).toContain('"deploy:ci": "gh-pages -d dist"');
    expect(readFileSync('package.json', 'utf8')).not.toContain('"deploy:ci": "gh-pages -d dist --add"');
  });

  it('allows the external Pages deployment queue to drain without weakening exact-SHA verification', () => {
    expect(workflow).toContain('for attempt in $(seq 1 120); do');
    expect(workflow).toContain('if [[ "$build_sha" == "$pages_sha" && "$status" == "built" ]]');
    expect(workflow).toContain('if [[ "$build_sha" == "$pages_sha" && "$status" == "errored" ]]; then exit 1; fi');
    expect(workflow).toContain('sleep 10');
  });

  it('injects one production timestamp before building and records it in the receipt', () => {
    const timestampStep = workflow.indexOf('Capture immutable production build timestamp');
    const buildStep = workflow.indexOf('Build production bytes');
    const verifyStep = workflow.indexOf('Verify exact production bytes');
    expect(timestampStep).toBeGreaterThan(-1);
    expect(buildStep).toBeGreaterThan(timestampStep);
    expect(verifyStep).toBeGreaterThan(buildStep);
    expect(workflow).toContain('VITE_RELEASED_AT=$released_at');
    expect(workflow).toContain('--arg releaseBuiltAt "$RELEASE_BUILT_AT"');
  });

  it('does not use a blocking GitHub Actions watcher inside the workflow', () => {
    expect(workflow).not.toContain('gh run watch');
  });
});
