// Contract test for the arena viewpoint regression instrument.
// Run: node --test scripts/qa/arena-viewpoint-regression.test.mjs
//
// Pins the things that keep the instrument trustworthy:
//   1. The viewpoint catalog never drifts from the AUTHORED review cameras in
//      src/rendering/arenas/*.ts (both directions: missing and stale).
//   2. The capture script keeps its environment proofs: installed-Chrome
//      headless WebGPU route, adapter/device/vendor validation, game-loop
//      commit proof before every screenshot, manifest provenance.
//   3. The diff thresholds stay at their calibrated strictness. Loosening one
//      requires editing THIS file with evidence - that is the point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { VIEWPOINT_CATALOG, CATALOG_ARENAS, CATALOG_VIEWPOINT_COUNT } from './viewpoint-catalog.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ARENA_SOURCES = {
  'atomic-acres': 'src/rendering/arenas/atomic-acres.ts',
  farcrysis: 'src/rendering/arenas/farcrysis.ts',
  'gun-range': 'src/rendering/arenas/gun-range.ts',
  'high-seas': 'src/rendering/arenas/high-seas.ts',
  'rustworks-1v1': 'src/rendering/arenas/rustworks-1v1.ts',
  'skyline-terminal': 'src/rendering/arenas/skyline-terminal.ts',
};

const authoredCameraIds = () => {
  const found = {};
  for (const [arenaId, relPath] of Object.entries(ARENA_SOURCES)) {
    const source = readFileSync(resolve(ROOT, relPath), 'utf8');
    const blockStart = source.indexOf('reviewCameras: [');
    // Scan to the TWO-SPACE-indented closer: the first ']' belongs to a
    // nested position array, not the reviewCameras list.
    const blockEnd = source.indexOf('\n  ],', blockStart);
    assert.notEqual(blockStart, -1, `${relPath} must declare reviewCameras`);
    const block = source.slice(blockStart, blockEnd);
    found[arenaId] = [...block.matchAll(/camera\('([a-z0-9-]+)'/g)].map((m) => m[1]);
  }
  return found;
};

test('catalog covers every authored review camera', () => {
  const authored = authoredCameraIds();
  assert.deepEqual(Object.keys(authored).sort(), [...CATALOG_ARENAS].sort(),
    'catalog arenas must equal the arenas that author reviewCameras');
  for (const [arenaId, ids] of Object.entries(authored)) {
    for (const id of ids) {
      assert.ok(VIEWPOINT_CATALOG[arenaId].includes(id),
        `authored camera '${id}' (${arenaId}) is missing from VIEWPOINT_CATALOG - the regression sweep would silently skip it`);
    }
  }
});

test('catalog has no stale entries', () => {
  const authored = authoredCameraIds();
  for (const [arenaId, ids] of Object.entries(VIEWPOINT_CATALOG)) {
    for (const id of ids) {
      assert.ok(authored[arenaId].includes(id),
        `catalog entry '${arenaId}/${id}' no longer exists in ${ARENA_SOURCES[arenaId]} - remove it or fix the id`);
    }
  }
  assert.equal(CATALOG_VIEWPOINT_COUNT,
    CATALOG_ARENAS.reduce((sum, arena) => sum + VIEWPOINT_CATALOG[arena].length, 0));
});

test('capture script keeps its environment proofs', () => {
  const source = readFileSync(resolve(ROOT, 'scripts/qa/capture-arena-viewpoints.mjs'), 'utf8');
  // The owner plays native WebGPU; only installed Chrome headless provides it
  // without a governor slot. Bundled chromium fails requestDevice here.
  assert.match(source, /headless: true/);
  assert.match(source, /channel: 'chrome'/);
  // Software-rasteriser guard: a Microsoft vendor string must invalidate.
  assert.match(source, /vendor/i);
  assert.match(source, /software rasteriser/);
  assert.match(source, /presentedCamera\.captureRevision === review\.captureCameraRevision/);
  assert.match(source, /requestDevice/);
  // Every screenshot waits for the presentation loop to COMMIT the camera
  // revision - a sleep alone cannot prove which pose the pixels show.
  assert.match(source, /presentedCamera\?\.captureRevision === rev/);
  // Provenance manifest so two directories can be attributed to builds.
  assert.match(source, /capture-manifest\.json/);
  assert.match(source, /bundleAtStart/);
  // A webgpu run that got another backend is INVALIDATED, never recorded as a baseline.
  assert.match(source, /asked for webgpu, got backend=/);
});

test('diff script refuses cross-backend comparisons and pins provenance', () => {
  const source = readFileSync(resolve(ROOT, 'scripts/qa/diff-arena-viewpoints.mjs'), 'utf8');
  assert.match(source, /backend mismatch/);
  assert.match(source, /process\.exit\(2\)/);
  assert.match(source, /environmentInvalid/);
  assert.match(source, /diff-report\.json/);
});

test('diff thresholds stay at calibrated strictness', async () => {
  const { THRESHOLDS } = await import('./diff-arena-viewpoints.mjs');
  // Calibrated 2026-08-25 by same-build self-diff on the shared preview
  // (see artifacts/viewpoint-regression/). Tightening is fine; loosening any
  // value needs a new same-build calibration proving the old floor was noise,
  // recorded next to this comment.
  assert.deepEqual({ ...THRESHOLDS }, {
    meanQuiet: 0.5,
    regionMin: 0.0025,
    regionGlobal: 0.15,
    deltaHard: 32,
    deltaSoft: 8,
  });
});

test('capture takes multi-sample persistence evidence per viewpoint', () => {
  const source = readFileSync(resolve(ROOT, 'scripts/qa/capture-arena-viewpoints.mjs'), 'utf8');
  // Same-commit repeats must not alarm every round: bots walk, containers
  // slide, water animates and work lights flicker BETWEEN sessions while
  // geometry does not. Capture therefore takes 3 samples per viewpoint by
  // default; the diff keeps a viewpoint quiet when ANY candidate sample
  // matches base, because a REAL regression differs in EVERY sample.
  assert.match(source, /arg\('--samples', '3'\)/);
  assert.match(source, /samplePaths/);
  assert.match(source, /samples: SAMPLES/);
});

test('diff gates verdicts on cross-sample persistence at unchanged strictness', async () => {
  const source = readFileSync(resolve(ROOT, 'scripts/qa/diff-arena-viewpoints.mjs'), 'utf8');
  // Verdict thresholds are applied to the pixel-wise MINIMUM delta across
  // candidate samples (persistence-min). Loosening any threshold value is
  // still forbidden; persistence only removes non-persistent noise.
  assert.match(source, /persistenceMin/);
  const { THRESHOLDS } = await import('./diff-arena-viewpoints.mjs');
  assert.deepEqual({ ...THRESHOLDS }, {
    meanQuiet: 0.5,
    regionMin: 0.0025,
    regionGlobal: 0.15,
    deltaHard: 32,
    deltaSoft: 8,
  });
});

test('diff verdicts come from an exported verdictFor pinned to the documented tiers', async () => {
  // Regression guard: d4585388 (r9) rewrote the diff around persistence-min
  // and deleted verdictFor while keeping its caller - the diff stage then
  // crashed ReferenceError on every real run until a live end-to-end round
  // executed it. Pin both existence and tier boundaries here.
  const { verdictFor, THRESHOLDS } = await import('./diff-arena-viewpoints.mjs');
  const quiet = { meanAbsDelta: 0.1, ratioOver8: 0, ratioOver32: 0, largestRegionFraction: 0 };
  assert.equal(verdictFor(quiet), 'MATCH', 'a quiet frame must read MATCH');
  // Below the region floor: transient actor noise, never blocking.
  assert.equal(
    verdictFor({ ...quiet, meanAbsDelta: 1.2, ratioOver32: THRESHOLDS.regionMin * 0.4 }),
    'DYNAMIC_ONLY',
    'sub-floor scattered change reads DYNAMIC_ONLY',
  );
  // One solid region >= floor blocks.
  assert.equal(
    verdictFor({ ...quiet, largestRegionFraction: THRESHOLDS.regionMin }),
    'REGION_CHANGED',
    'a region at the floor must block',
  );
  // Whole-frame shifts block hardest: large region OR global luminance wash.
  assert.equal(
    verdictFor({ ...quiet, largestRegionFraction: THRESHOLDS.regionGlobal }),
    'GLOBAL_CHANGED',
  );
  assert.equal(verdictFor({ ...quiet, meanAbsDelta: 6 }), 'GLOBAL_CHANGED',
    'a whole-frame exposure/grade wash must read GLOBAL_CHANGED');
});

test('persistence is symmetric: transient change on EITHER side is absorbed', async () => {
  // Measured 2026-08-26: a same-build self-diff flagged 7/37 viewpoints
  // because rail targets and sliding containers sit at a different script
  // phase in EVERY candidate sample relative to ONE base frame. The baseline
  // already stores 3 samples per viewpoint; the min must run over ALL
  // base x candidate pairs. A real regression differs from every base sample
  // and still survives; per-pixel thresholds are unchanged.
  const sharp = (await import('sharp')).default;
  const { comparePair } = await import('./diff-arena-viewpoints.mjs');
  const W = 640; const H = 360;
  const frame = (rects) => sharp({
    create: { width: W, height: H, channels: 3, background: { r: 128, g: 128, b: 128 } },
  }).composite(rects.map((r) => ({
    input: { create: { width: r.w, height: r.h, channels: 3, background: { r: r.v, g: r.v, b: r.v } } },
    left: r.x, top: r.y,
  }))).png().toBuffer();
  const dir = import.meta.dirname;
  const paths = [];
  const images = [
    frame([{ x: 20, y: 20, w: 40, h: 40, v: 255 }]),   // base main: "target" left
    frame([{ x: 300, y: 20, w: 40, h: 40, v: 255 }]),  // base s1: "target" middle
    frame([{ x: 20, y: 20, w: 40, h: 40, v: 255 }]),   // candidate main: left again
  ];
  for (let i = 0; i < images.length; i += 1) {
    const p = resolve(dir, `.tmp-symmetric-${i}.png`);
    await sharp(await images[i]).toFile(p);
    paths.push(p);
  }
  try {
    // Candidate main matches base MAIN exactly; only base s1 is offset.
    // One-sided persistence against base-main-only cannot know that; the
    // symmetric min over base samples must read this pair as quiet.
    const { metrics } = await comparePair([paths[0], paths[1]], [paths[2]]);
    assert.equal(metrics.ratioOver32, 0, 'phase offset in one base sample must not alarm');
    // A persistent change still blocks: candidate carries a dark rectangle
    // no base sample has.
    const persistent = resolve(dir, '.tmp-symmetric-3.png');
    await sharp(await frame([
      { x: 20, y: 20, w: 40, h: 40, v: 255 },
      { x: 300, y: 150, w: 80, h: 60, v: 0 },
    ])).toFile(persistent);
    const blocked = await comparePair([paths[0], paths[1]], [persistent]);
    assert.ok(blocked.metrics.ratioOver32 > 0.015, 'a change no base sample has must survive the symmetric min');
  } finally {
    for (const p of [...paths, resolve(dir, '.tmp-symmetric-3.png')]) rmSync(p, { force: true });
  }
});

test('round runner wires build, capture and diff end to end', () => {
  const source = readFileSync(resolve(ROOT, 'scripts/qa/run-arena-viewpoint-regression.mjs'), 'utf8');
  assert.match(source, /capture-arena-viewpoints\.mjs/);
  assert.match(source, /diff-arena-viewpoints\.mjs/);
  assert.match(source, /vite/, 'runner must build or consume a real production bundle');
  assert.match(source, /process\.exit\(/);
});

test('persistence-min separates transient actor noise from persistent change', async () => {
  // Synthetic proof of the instrument's core claim, no browser needed:
  // base is flat mid-gray; candidate sample A has a bright "bot" square in
  // one place, sample B the same square elsewhere (transient), and BOTH
  // samples carry a dark rectangle the base lacks (a real regression).
  const sharp = (await import('sharp')).default;
  const { comparePair } = await import('./diff-arena-viewpoints.mjs');
  const W = 640; const H = 360;
  const frame = (rects) => sharp({
    create: { width: W, height: H, channels: 3, background: { r: 128, g: 128, b: 128 } },
  }).composite(rects.map((r) => ({
    input: {
      create: {
        width: r.w, height: r.h, channels: 3,
        background: { r: r.v, g: r.v, b: r.v },
      },
    },
    left: r.x, top: r.y,
  }))).png().toBuffer();
  const base = await frame([]);
  const sampleA = await frame([{ x: 20, y: 20, w: 40, h: 40, v: 255 }, { x: 300, y: 150, w: 80, h: 60, v: 0 }]);
  const sampleB = await frame([{ x: 500, y: 250, w: 40, h: 40, v: 255 }, { x: 300, y: 150, w: 80, h: 60, v: 0 }]);
  const tmpA = resolve(import.meta.dirname, '.tmp-persistence-a.png');
  const tmpB = resolve(import.meta.dirname, '.tmp-persistence-b.png');
  const tmpBase = resolve(import.meta.dirname, '.tmp-persistence-base.png');
  await sharp(base).toFile(tmpBase);
  await sharp(sampleA).toFile(tmpA);
  await sharp(sampleB).toFile(tmpB);
  try {
    const { metrics } = await comparePair(tmpBase, [tmpA, tmpB]);
    // Transient bot squares vanish under persistence-min; only the
    // Rectangle is 80x60 = 0.02083 of the 640x360 frame; assert the
    // persistence-min map carries essentially exactly that and nothing else.
    assert.ok(metrics.ratioOver32 > 0.015 && metrics.ratioOver32 < 0.026,
      `persistence-min map should contain only the persistent rectangle (~0.021), got ratioOver32=${metrics.ratioOver32}`);
  } finally {
    for (const p of [tmpA, tmpB, tmpBase]) rmSync(p, { force: true });
  }
});
