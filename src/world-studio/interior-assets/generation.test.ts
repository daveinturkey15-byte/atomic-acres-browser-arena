import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Regeneration tests for the interior set (wave 6).
 *
 * Wave 6 was asked to run Blender and bring the corrected source and the shipped GLBs back into
 * agreement. The gate marker it is allowed to run behind
 * (`recovery/build18-house-probe-released.json`) was absent for the whole call, so **no Blender
 * ran and no byte changed**. These tests exist to make that statement checkable rather than
 * claimed, in three parts:
 *
 * 1. a byte census — every shipped GLB still hashes to what `catalog.json` publishes, so "before"
 *    and "after" are provably the same bytes;
 * 2. the wave-6 source fits, checked as arithmetic on the very constants `build_interiors.py`
 *    feeds Blender, so the fix can be reviewed before the export exists; and
 * 3. what wave 6 did *not* do — the dinette overrun stays open at its measured value, and every
 *    accepted overrun stays pinned at the number the shipped bytes measure.
 *
 * None of this is a substitute for measuring the export. When Blender is finally run, the byte
 * census below fails, `catalog.test.ts`'s 180 deg sofa pin fails, and `fit.test.ts`'s
 * "script is ahead of the GLBs" test fails. That trio failing together is the intended alarm and
 * the signal to re-measure, not a regression to paper over.
 */

const REPO = resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = 'scripts/blender/world-studio/interiors/build_interiors.py';
const script = readFileSync(resolve(REPO, SCRIPT_PATH), 'utf8');

const catalogJson = JSON.parse(
  readFileSync(resolve(REPO, 'public/assets/world-studio/blender/interiors/catalog.json'), 'utf8'),
) as {
  assets: readonly {
    id: string;
    assetUrl: string;
    sha256: string;
    metrics: { bytes: number };
  }[];
};

/** The slice of the script between one `def build_*` and the next. */
const builder = (name: string): string => {
  const start = script.indexOf(`def ${name}(`);
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const next = script.indexOf('\ndef ', start + 1);
  return script.slice(start, next === -1 ? undefined : next);
};

/**
 * The builder with its `_rotate_group` pivot line removed. The pivot is the one place `lz` must
 * still appear raw — it is the anchor centre — so it is excluded before asserting that no *part*
 * is authored about it any more.
 */
const partsOnly = (source: string): string =>
  source
    .split('\n')
    .filter((line) => !line.includes('_rotate_group('))
    .join('\n');

const constant = (source: string, name: string): number => {
  const match = source.match(new RegExp(`${name}\\s*=\\s*([\\d.]+)`));
  expect(match, `${name} is a named constant`).not.toBeNull();
  return Number(match![1]);
};

describe('interior GLB byte census', () => {
  it('publishes ten assets and one row per file', () => {
    expect(catalogJson.assets).toHaveLength(10);
  });

  it.each(catalogJson.assets.map((asset) => [asset.id, asset] as const))(
    '%s still hashes to the sha256 and size catalog.json publishes',
    (_id, asset) => {
      // `assetUrl` is deploy-base-relative; the file lives under `public/`.
      const bytes = readFileSync(resolve(REPO, 'public', asset.assetUrl));
      expect(bytes.byteLength, 'size').toBe(asset.metrics.bytes);
      expect(createHash('sha256').update(bytes).digest('hex'), 'sha256').toBe(asset.sha256);
    },
  );

  it('is the evidence that wave 6 ran no Blender: before and after are the same bytes', () => {
    // Deliberately duplicates the loop above as a single fingerprint over the whole set, so a
    // partial re-export of one or two assets cannot slip through a per-file assertion that
    // someone updated one row at a time.
    const fingerprint = createHash('sha256');
    // Codepoint order, not locale order, so the digest is reproducible outside this runtime.
    for (const asset of [...catalogJson.assets].sort((a, b) => (a.id < b.id ? -1 : 1))) {
      fingerprint.update(asset.id);
      fingerprint.update(readFileSync(resolve(REPO, 'public', asset.assetUrl)));
    }
    expect(fingerprint.digest('hex')).toBe(
      '8be2b30d74cd4b2e3537ae3c670821147fe9c22755da3382660877a51f4a92f1',
    );
  });
});

describe('wave 6 source fits, as arithmetic on the constants the script feeds Blender', () => {
  // Both models below are validated against the shipped bytes: run on the *pre-fix* constants
  // they reproduce the measured spans in `fit-report.json` exactly (credenza 0.482 m,
  // kitchen-run 0.664 m). That is why the post-fix numbers are worth reviewing before the export
  // exists - but they remain predictions, not measurements, until Blender runs.

  it('recentres the credenza on its occupied depth instead of its carcass', () => {
    const credenza = builder('build_credenza');
    const bias = constant(credenza, 'CREDENZA_FRONT_BIAS');
    expect(credenza, 'every part is authored about the biased centre').toMatch(
      /cz = lz - CREDENZA_FRONT_BIAS/,
    );
    expect(partsOnly(credenza).match(/_p\([^)]*?\blz\b/g), 'no part still uses the raw lz').toBeNull();

    const carcassDepth = Number(credenza.match(/-carcass",\s*\(1\.56,\s*([\d.]+),/)![1]);
    const pullStandoff = Number(credenza.match(/cz \+ ([\d.]+)\),\s*\n\s*"IntBrass"/)![1]);
    const pullRadius = Number(credenza.match(/-pull-\{index\}",\s*\n\s*([\d.]+),/)![1]);

    const front = pullStandoff + pullRadius - bias;
    const back = carcassDepth / 2 + bias;
    const half = 0.5 / 2;
    expect(front, 'brass pulls inside the front face').toBeLessThan(half);
    expect(back, 'carcass inside the back face').toBeLessThan(half);
    // The bias is the measured asymmetry, not a number chosen to clear a threshold.
    expect(bias).toBeCloseTo((pullStandoff + pullRadius - carcassDepth / 2) / 2, 4);
    expect(Math.max(front, back), 'both faces 9 mm clear').toBeCloseTo(0.241, 3);
  });

  it('brings the kitchen run inside its footprint on both axes', () => {
    const kitchen = builder('build_kitchen_run');
    const depth = constant(kitchen, 'depth');
    const length = constant(kitchen, 'length');
    const bias = constant(kitchen, 'KITCHEN_FRONT_BIAS');
    expect(partsOnly(kitchen).match(/_p\([^)]*?\blz\b/g), 'no part still uses the raw lz').toBeNull();

    // Cause 2: the 40 mm end overhang is gone from all three spans that carried it.
    expect(kitchen, 'no span is authored past the run length').not.toMatch(/length \+ 0\.04/);
    for (const part of ['worktop', 'splash-lip', 'backsplash']) {
      const match = kitchen.match(new RegExp(`-${part}",\\s*\\(([^,]+),`));
      expect(match![1].trim(), `${part} spans the run, not more`).toBe('length');
    }
    // The bullnose is the feature and survives - it is on the front edge, where it belongs.
    expect(kitchen, 'worktop still overhangs the front').toMatch(/-worktop",\s*\(length,\s*depth \+ 0\.03,/);

    // Cause 1: the chrome pulls keep their full standoff and now fit.
    const pullRadius = Number(kitchen.match(/-pull-\{index\}",\s*([\d.]+),/)![1]);
    const pullStandoff = Number(kitchen.match(/kz \+ depth \/ 2 \+ ([\d.]+)\)/)![1]);
    const front = depth / 2 + pullStandoff + pullRadius - bias;
    const back = depth / 2 + 0.015 + bias; // splash lip, half of its 0.03 m thickness

    const footprint = [4.4, 0.65];
    expect(length, 'run spans its anchor exactly').toBe(footprint[0]);
    expect(front, 'pulls inside the front face').toBeLessThan(footprint[1] / 2);
    expect(back, 'splash lip inside the back face').toBeLessThan(footprint[1] / 2);
    expect(bias).toBeCloseTo((pullStandoff + pullRadius - 0.015) / 2, 4);
    expect(Math.max(front, back), 'both faces 3 mm clear').toBeCloseTo(0.322, 3);
  });

  it('keeps both anchors as the rotation pivot, so a fit bias never moves the anchor', () => {
    // The bias shifts geometry inside the piece's own frame. If it leaked into the pivot, the
    // piece would rotate about a point that is not its anchor and land somewhere else entirely.
    for (const name of ['build_credenza', 'build_kitchen_run']) {
      expect(builder(name), `${name} pivot`).toMatch(/_rotate_group\(parts, _p\(lx, 0, lz\), yaw\)/);
    }
  });
});

describe('what wave 6 did not do', () => {
  it('leaves the dinette open: its chairs are not shrunk to flatter a number', () => {
    const dinette = builder('build_dinette');
    expect(dinette, 'no fit edit in the dinette').not.toMatch(/FIT FIX/);
  });

  it('leaves the four fixed assets pinned at the overrun the shipped bytes still measure', () => {
    // A source fix does not move the accepted value. The GLBs have not changed, so neither has
    // what they measure - lowering these now would be claiming an export that did not happen.
    const fit = readFileSync(resolve(__dirname, 'fit.ts'), 'utf8');
    for (const [id, worst] of [
      ['interior-prop-sofa', '0.155'],
      ['interior-prop-coffee-table', '0.07'],
      ['interior-prop-kitchen-run', '0.02'],
      ['interior-prop-dinette', '0.5554'],
    ] as const) {
      const entry = fit.slice(fit.indexOf(`'${id}': {`));
      expect(entry.slice(0, 200), `${id} accepted overrun`).toMatch(
        new RegExp(`worst:\\s*${worst.replace('.', '\\.')},`),
      );
    }
  });

  it('records the gate that stopped it, so the pending work is findable', () => {
    const handoff = readFileSync(
      resolve(REPO, 'docs/technique-lab/interiors/REGENERATION.md'),
      'utf8',
    );
    expect(handoff).toMatch(/build18-house-probe-released\.json/);
    expect(handoff).toMatch(/--background --factory-startup --threads 2/);
  });
});

describe('the pinned one-line command is runnable exactly as written (wave 7)', () => {
  /**
   * Wave 7 held the marker and still could not launch Blender, but it found the defect that would
   * have wasted the launch anyway: the command every document in this lane pins carries no `--`
   * payload, and `main()` required one. `--repo` was `required=True`, so argparse exited 2 before a
   * single object was built, and `--props` was opt-in, so even a "successful" run would have written
   * one GLB where `catalog.json` publishes ten — silently, with the other nine left stale.
   *
   * These assertions are on the flags, not on a run: nothing here proves Blender works.
   */
  const main = script.slice(script.indexOf('def _repo_root('));

  it('needs no `--` payload: --repo defaults to the script own repo root', () => {
    expect(main, '--repo must not be required').not.toMatch(/add_argument\("--repo",\s*required=True/);
    expect(main).toMatch(/add_argument\("--repo",\s*default=_repo_root\(\)\)/);
    expect(main, '_repo_root climbs interiors/world-studio/blender/scripts').toMatch(
      /join\(here,\s*"\.\.",\s*"\.\.",\s*"\.\.",\s*"\.\."\)/,
    );
  });

  it('exports every asset the catalog publishes, not just the hero', () => {
    expect(main).toMatch(/add_argument\("--props",\s*action="store_true",\s*default=True/);
    expect(main, '--hero-only is the opt-out that used to be the default').toMatch(
      /add_argument\("--hero-only",\s*dest="props",\s*action="store_false"/,
    );
    const groups = script.slice(script.indexOf('PROP_GROUPS = {'));
    const props = groups.slice(0, groups.indexOf('}')).match(/^\s{4}"[a-z-]+":/gm) ?? [];
    expect(props.length + 1, 'hero + one GLB per prop group == catalog rows').toBe(
      catalogJson.assets.length,
    );
  });

  it('still refuses to invent a thumbnail it did not render', () => {
    // The pinned line carries no `--render`, so the next successful export publishes
    // `thumbnailUrl: null` rather than pointing the hero row at a still of the *previous*,
    // defective geometry. That is the honest outcome, and it must stay conditional on the render.
    const writer = script.slice(script.indexOf('def write_catalog('));
    expect(writer).toMatch(/"thumbnailUrl": f"\{ASSET_URL_BASE\}\/\{thumb\}" if thumb else None/);
    expect(writer.slice(0, writer.indexOf('assets = []'))).toMatch(
      /thumbnails = report\.get\("thumbnails", \{\}\)/,
    );
  });
});
