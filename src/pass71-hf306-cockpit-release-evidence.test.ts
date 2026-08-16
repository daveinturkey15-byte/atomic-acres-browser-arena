import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS71_HF306_COCKPIT_DESCRIPTOR,
  PASS71_HF306_COCKPIT_EVIDENCE,
  PASS71_HF306_COCKPIT_REGISTRY_ENTRY,
  PASS71_HF306_RENDERERS,
  PASS71_HF306_UNKNOWNS,
  PASS71_HF306_VIEWPORTS,
  pass71Hf306AttachmentKeys,
} from '../scripts/qa/pass71-hf306-cockpit-evidence-contract.mjs';

const source = (path: string) => readFileSync(path, 'utf8');

describe('Pass 71 HF-306 cockpit release evidence integration', () => {
  it('exports one optional strict closing registry entry with the exact matrix identity', () => {
    expect(PASS71_HF306_COCKPIT_EVIDENCE).toMatchObject({
      evidenceId: 'HF-306',
      kind: 'pass71-hf306-chopper-cockpit-framing-closure',
      contract: 'atomic-acres/pass71-hf306-chopper-cockpit-framing-closure@1',
      closesFeedback: true,
    });
    expect(PASS71_HF306_COCKPIT_DESCRIPTOR).toEqual({
      evidenceId: 'HF-306',
      kind: 'pass71-hf306-chopper-cockpit-framing-closure',
      minimumCount: 0,
      maximumCount: 1,
    });
    expect(PASS71_HF306_COCKPIT_REGISTRY_ENTRY).toMatchObject({
      descriptor: PASS71_HF306_COCKPIT_DESCRIPTOR,
      closesFeedback: true,
    });
    expect(PASS71_HF306_RENDERERS).toEqual(['webgl2', 'webgpu']);
    expect(PASS71_HF306_VIEWPORTS.map(({ id }) => id)).toEqual(['desktop', 'ultrawide', 'mobile']);
    expect(pass71Hf306AttachmentKeys()).toHaveLength(15);
    expect(PASS71_HF306_UNKNOWNS).toEqual([
      'owner-subjective-aesthetic-inspection-not-claimed',
      'other-browsers-adapters-and-device-pixel-ratios-not-claimed',
      'remote-multiplayer-possession-not-claimed',
    ]);
  });

  it('wires the exact-SHA installed-Edge runner without weakening browser isolation', () => {
    const manifest = JSON.parse(source('package.json')) as { scripts: Record<string, string> };
    const runner = source('scripts/qa/run-pass71-hf306-cockpit-evidence.mjs');
    const config = source('playwright.config.ts');
    expect(manifest.scripts['qa:pass71:hf306-cockpit:contract']).toBe(
      'node --test scripts/qa/pass71-hf306-cockpit-evidence-contract.test.mjs',
    );
    expect(manifest.scripts['qa:pass71:hf306-cockpit']).toBe(
      'npm run qa:pass71:hf306-cockpit:contract && node scripts/qa/run-pass71-hf306-cockpit-evidence.mjs',
    );
    for (const fragment of [
      "checkoutSourceSha !== expectedSourceSha || !clean()",
      "releaseChannels?.experimental?.pass !== 'PASS 71'",
      "assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable))",
      "PASS71_HF306_EXPECTED_SOURCE_SHA: expectedSourceSha",
      "PASS71_HF306_COMPONENT_PATH: browserComponentPath",
      "pass71Hf306ToolingHashesAtSource(root, expectedSourceSha)",
      "pass71Hf306AssetAuditAtSource(root, expectedSourceSha)",
      "pass71Hf306OwnerSourceAuditAtSource(root, expectedSourceSha)",
      'assertPass71Hf306Evidence(record',
    ]) expect(runner).toContain(fragment);
    expect(config).toContain('const pass71Hf306EdgeExecutable = process.env.PASS71_HF306_EDGE_EXECUTABLE;');
    expect(config).toContain('launchOptions: pass71OwnedEdgeExecutable');
    expect(config).toContain("PASS71_HF306_EDGE_EXECUTABLE is reserved for installed-Edge evidence");
  });

  it('uses the real cockpit roots and renderer submission owner for a same-frame hidden control', () => {
    const frameOwner = source('src/legacy-main.ts');
    const start = frameOwner.indexOf('async function freezeDebugChopperCockpitEvidenceFrame()');
    const end = frameOwner.indexOf('async function captureDebugChopperExteriorHiddenControl()', start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const control = frameOwner.slice(start, end);
    for (const fragment of [
      "node.name === 'chopper-first-person-cockpit'",
      'debugRenderPaused = true;',
      'for (const root of state.cockpitRoots) root.visible = false;',
      "await submitForegroundWebGpuFrame(true, 'serialized');",
      'atomicSignal.render(scene, camera, VIEWMODEL_RENDER_LAYER);',
      'root.visible = state.cockpitRootVisibilities[index]!;',
    ]) expect(control).toContain(fragment);
    expect(control).not.toMatch(/readPixels|toDataURL|toBlob|getImageData|readRenderTargetPixels/u);
  });

  it('captures every viewport and trusted action with lossless visible/control bytes', () => {
    const spec = source('tests/e2e/pass71-hf306-cockpit-framing.spec.ts');
    for (const fragment of [
      'for (const renderer of PASS71_HF306_RENDERERS',
      'for (const viewport of PASS71_HF306_VIEWPORTS',
      'for (const action of PASS71_HF306_ACTIONS',
      'freezeChopperCockpitEvidenceFrame()',
      'captureChopperCockpitHiddenControl()',
      'releaseChopperCockpitEvidenceFrame()',
      "page.keyboard.down('KeyW')",
      "page.mouse.down({ button: 'left' })",
      "page.mouse.down({ button: 'right' })",
      "trustedInputObserved(page, inputIndex, { type: 'keydown', code: 'KeyW' })",
      "encoding: 'lossless-png-embedded-base64'",
      'regions: await rasterDifference(visiblePng!, hiddenPng!, viewport)',
      'runtimeErrorLog:',
      "faults.push(...final.auditFaults)",
    ]) expect(spec).toContain(fragment);
  });
});
