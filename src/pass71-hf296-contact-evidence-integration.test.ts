import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PASS71_HF296_ARENAS,
  PASS71_HF296_WEAPONS,
} from '../scripts/qa/pass71-hf296-full-matrix.mjs';
import { ARENA_SELECTIONS } from './map-selection';
import { WEAPON_IDS } from './protocol';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const spec = readFileSync(new URL('../tests/e2e/pass71-hf296-full-contact-matrix.spec.ts', import.meta.url), 'utf8');
const runner = readFileSync(new URL('../scripts/qa/run-pass71-hf296-contact-evidence.mjs', import.meta.url), 'utf8');

function sourceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  expect(from, `missing ${start}`).toBeGreaterThanOrEqual(0);
  expect(to, `missing ${end}`).toBeGreaterThan(from);
  return source.slice(from, to);
}

describe('Pass 71 HF-296 runtime evidence integration', () => {
  it('fails if the canonical arena or firearm catalog outgrows the exact matrix', () => {
    expect(PASS71_HF296_ARENAS).toEqual(ARENA_SELECTIONS.map(({ id }) => id));
    expect(PASS71_HF296_WEAPONS).toEqual(WEAPON_IDS);
  });

  it('samples the shipped Rapier controller and production ballistic ray separately from the muzzle', () => {
    const sample = sourceBetween(main, 'function sampleHf296FireIdentity(', '\nfunction stageHf296ContactAction');
    expect(sample).toContain('camera.getWorldPosition');
    expect(sample).toContain('camera.getWorldDirection');
    expect(sample).toContain('weaponView.muzzleWorldPosition');
    expect(sample).toContain("authority: 'presentation-only-tracer-origin'");
    expect(sample).toContain('const resolution = castShot(');
    const contact = sourceBetween(main, 'function sampleHf296ContactEvidence()', '\nfunction sampleHf296ColliderField');
    expect(contact).toContain('characterPhysics?.debugContactSnapshot()');
    expect(contact).toContain('fireIdentity: sampleHf296FireIdentity(presentation)');
    expect(main).toContain('renderedPosition: Object.freeze(remote.root.position.toArray())');
  });

  it('stages every declared action through the shipped presentation implementation', () => {
    const stage = sourceBetween(main, 'function stageHf296ContactAction(', '\nfunction sampleHf296ContactEvidence');
    expect(stage).toContain("action === 'ads'");
    expect(stage).toContain('weaponView.fire(0)');
    expect(stage).toContain('weaponView.reload()');
    expect(stage).toContain('weaponView.melee()');
    expect(stage).toContain('weaponView.setFireCaptureAgeMs(24)');
    expect(stage).toContain('debugReloadProgress = 0.45');
  });

  it('runs page-side exact matrices and retains Node only for lossless captures', () => {
    expect(spec).toContain('return page.evaluate(async');
    expect(spec).toContain('assertPass71Hf296ExactSets({ localKeys, remoteKeys, visualKeys })');
    expect(spec).toContain('await page.screenshot({');
    expect(spec).toContain('clip: { ...PASS71_HF296_VISUAL_CROP }');
    expect(spec).toContain("runPageMatrix(host, arena, 'host-local')");
    expect(spec).toContain("runPageMatrix(guest, arena, 'guest-local')");
    expect(spec).toContain("guest, host, arena, 'host-saw-guest'");
    expect(spec).toContain("host, guest, arena, 'guest-saw-host'");
    expect(spec).toContain('const [rows, acknowledgements] = await Promise.all');
  });

  it('owns exact staged candidate A and signed installed Edge provenance', () => {
    expect(runner).toContain('assertInstalledEdgeExecutableIdentity(readWindowsExecutableIdentity(edgeExecutable))');
    expect(runner).toContain("resolve(root, 'scripts/qa/run-playwright-with-topology.mjs')");
    expect(runner).toContain("PASS71_HF296_FULL_MATRIX: '1'");
    expect(runner).toContain('assertPass71Hf296ExactSets({ localKeys, remoteKeys, visualKeys })');
    expect(runner).toContain("encoding: 'lossless-png-embedded-base64'");
    expect(runner).toContain('bytes.length > PASS71_HF296_MAX_VISUAL_BYTES');
    expect(runner).toContain('payload, \'utf8\') > PASS71_HF296_MAX_RECORD_JSON_BYTES');
  });
});
