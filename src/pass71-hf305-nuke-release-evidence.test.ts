import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS71_HF305_NUKE_WARNING_DESCRIPTOR,
  PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY,
  PASS71_HF305_TOOLING_PATHS,
} from '../scripts/qa/pass71-hf305-nuke-warning-evidence-contract.mjs';

const packageManifest = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
const playwrightConfig = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../scripts/qa/run-pass71-hf305-nuke-warning-evidence.mjs', import.meta.url), 'utf8');
const browserSpec = readFileSync(new URL('../tests/e2e/pass71-hf305-nuke-warning-evidence.spec.ts', import.meta.url), 'utf8');
const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('Pass 71 HF-305 release evidence integration', () => {
  it('exports one optional strict closing registry entry without fabricating owner approval', () => {
    expect(PASS71_HF305_NUKE_WARNING_DESCRIPTOR).toEqual({
      evidenceId: 'HF-305',
      kind: 'pass71-hf305-nuke-warning-native',
      minimumCount: 0,
      maximumCount: 1,
    });
    expect(PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY).toMatchObject({
      closesFeedback: true,
      ownerSubjectiveApproval: 'not-claimed',
    });
    expect(PASS71_HF305_TOOLING_PATHS).toContain('src/pass71-hf305-nuke-release-evidence.test.ts');
  });

  it('owns a signed installed-Edge launch and a fresh topology process per renderer', () => {
    expect(packageManifest).toContain('"qa:pass71:hf305-nuke:contract"');
    expect(packageManifest).toContain('"qa:pass71:hf305-nuke"');
    expect(playwrightConfig).toContain('PASS71_HF305_EDGE_EXECUTABLE');
    expect(playwrightConfig).toContain('pass71Hf305EdgeExecutable && !installedEdgeChannel');
    expect(runner).toContain('assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable))');
    expect(runner).toContain("sha256File(edgeExecutable) !== executableSha256");
    expect(runner).toContain("for (const [rendererIndex, requestedRenderer] of PASS71_HF305_RENDERERS.entries())");
    expect(runner).toContain("'scripts/qa/run-playwright-with-topology.mjs'");
    expect(runner).toContain("PASS70_NATIVE_ENGINE_USER_AGENT: '1'");
    expect(runner).toContain("QA_INSTALLED_EDGE: '1'");
  });

  it('binds visible pixels, sensory precedence and detonation authority to the exact candidate route', () => {
    expect(browserSpec).toContain("new URL('/channels/the-big-one/', baseURL)");
    expect(browserSpec).toContain("new URL('/channels/the-big-one/channel-provenance.json', baseURL)");
    expect(browserSpec).toContain("setEvidenceCamera(page, reduced ? 'inside-room' : 'outside-room')");
    expect(browserSpec).toContain("setEvidenceCamera(page, 'inside-room')");
    expect(browserSpec).toContain('snapshot.deterministicReview.presentedCamera');
    expect(browserSpec).toContain("phase: 'open'");
    expect(browserSpec).toContain('freezeNukeWarningEvidenceFrame()');
    expect(browserSpec).toContain('captureNukeWarningHiddenControl()');
    expect(browserSpec).toContain('nukeDetonations === before + 1');
    expect(browserSpec).toContain('targetsAfter: snapshot.rangePractice.targets');
    expect(browserSpec).toContain('reducedPeak).toBeLessThanOrEqual(standardPeak * 0.9)');
    expect(main).toContain('audio.nukeWarning(accessibilityRuntime.reducedSensory);');
  });
});
