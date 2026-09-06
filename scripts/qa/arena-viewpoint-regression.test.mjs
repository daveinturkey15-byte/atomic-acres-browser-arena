// Contract test for the arena viewpoint regression instrument.
// Run: node --test scripts/qa/arena-viewpoint-regression.test.mjs
//
// Pins the things that keep the instrument trustworthy:
//   1. The viewpoint catalog never drifts from the AUTHORED review cameras in
//      src/rendering/arenas/*.ts (both directions: missing and stale). The
//      arena roster is GLOBBED off disk and cross-checked against
//      ARENA_VISUAL_REGISTRY; it is never a literal in this file.
//
//      Until 2026-08-31 it was a literal in this file: a hand-written
//      six-entry ARENA_SOURCES map. Both sides of the completeness assertion
//      then descended from that one decision, so `assert.deepEqual(authored,
//      CATALOG_ARENAS)` compared the six-arena choice with itself and could
//      never fail. Test1 and Test2 had authored reviewCameras that no stage of
//      this instrument had ever rendered or compared. Any roster this file
//      needs must be OBSERVED - from the filesystem, or from the registry the
//      game itself loads arenas through - never typed here.
//   2. The capture script keeps its environment proofs: installed-Chrome
//      headless WebGPU route, adapter/device/vendor validation, game-loop
//      commit proof before every screenshot, manifest provenance.
//   3. The diff thresholds stay at their calibrated strictness. Loosening one
//      requires editing THIS file with evidence - that is the point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { VIEWPOINT_CATALOG, CATALOG_ARENAS, CATALOG_VIEWPOINT_COUNT } from './viewpoint-catalog.mjs';

const ROOT = resolve(import.meta.dirname, '..', '..');
const ARENAS_DIR = 'src/rendering/arenas';
const ARENA_REGISTRY_SOURCE = 'src/rendering/arena-visual-stream.ts';

// Modules that live in ARENAS_DIR and are legitimately not arenas. Everything
// else that carries no definition is a FAILURE rather than a silent skip -
// otherwise the glob reintroduces the omission it exists to prevent.
const NON_ARENA_MODULES = new Set(['shared.ts']);
const isColocatedUnitTest = (file) => file.endsWith('.test.ts');

const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//gu, '')
  .replace(/\/\/[^\n]*/gu, '');

// Derivation 1: glob the arena directory. Returns { arenaId -> relative path }
// keyed by the id the module DECLARES, not by its filename, so a module whose
// filename and identity disagree cannot masquerade as the arena it is named
// after.
const arenaSourcesFromDisk = () => {
  const files = readdirSync(resolve(ROOT, ARENAS_DIR))
    .filter((file) => file.endsWith('.ts'))
    .sort();
  assert.ok(files.length > 0, `${ARENAS_DIR} must contain arena modules`);
  const sources = {};
  for (const file of files) {
    const relPath = `${ARENAS_DIR}/${file}`;
    const source = readFileSync(resolve(ROOT, relPath), 'utf8');
    const declaration = /createProceduralArenaVisualDefinition\(\{\s*id:\s*'([a-z0-9-]+)'/u
      .exec(stripComments(source));
    if (!declaration) {
      assert.ok(NON_ARENA_MODULES.has(file) || isColocatedUnitTest(file),
        `${relPath} sits in ${ARENAS_DIR} but this instrument cannot read an arena definition from it. `
        + 'If it is a new arena authored in a shape the derivation does not recognise, widen the derivation - '
        + 'if it is a helper, name it in NON_ARENA_MODULES. Do not leave it silently uncovered.');
      continue;
    }
    const arenaId = declaration[1];
    assert.equal(sources[arenaId], undefined,
      `'${arenaId}' is declared by two modules (${sources[arenaId]} and ${relPath})`);
    sources[arenaId] = relPath;
  }
  return sources;
};

// Derivation 2, independent of the filesystem walk AND of the catalog: the
// registry the running game actually loads arenas through. Disagreement means
// either an arena module the game cannot reach, or a registry entry with no
// module behind it - both of which make a "complete" sweep a lie.
const registryArenaIds = () => {
  const source = readFileSync(resolve(ROOT, ARENA_REGISTRY_SOURCE), 'utf8');
  const start = source.indexOf('export const ARENA_VISUAL_REGISTRY');
  assert.notEqual(start, -1, `${ARENA_REGISTRY_SOURCE} must export ARENA_VISUAL_REGISTRY`);
  const end = source.indexOf('\n});', start);
  assert.notEqual(end, -1, 'ARENA_VISUAL_REGISTRY must close at column 0');
  const block = stripComments(source.slice(start, end));
  const entries = [...block.matchAll(/'([a-z0-9-]+)':\s*\(\)\s*=>\s*import\('\.\/arenas\/([a-z0-9-]+)'\)/gu)];
  assert.ok(entries.length > 0, 'read no arena entries out of ARENA_VISUAL_REGISTRY');
  for (const [, arenaId, modulePath] of entries) {
    assert.equal(modulePath, arenaId,
      `ARENA_VISUAL_REGISTRY maps '${arenaId}' at ./arenas/${modulePath}; the derivation assumes they match`);
  }
  return entries.map(([, arenaId]) => arenaId);
};

const authoredCameraIds = (sources) => {
  const found = {};
  for (const [arenaId, relPath] of Object.entries(sources)) {
    const source = readFileSync(resolve(ROOT, relPath), 'utf8');
    const blockStart = source.indexOf('reviewCameras: [');
    assert.notEqual(blockStart, -1, `${relPath} must declare reviewCameras`);
    // Scan to the TWO-SPACE-indented closer: the first ']' belongs to a
    // nested position array, not the reviewCameras list.
    const blockEnd = source.indexOf('\n  ],', blockStart);
    assert.notEqual(blockEnd, -1, `${relPath} reviewCameras is not closed at two-space indent`);
    const block = stripComments(source.slice(blockStart, blockEnd));
    const ids = [...block.matchAll(/camera\('([a-z0-9-]+)'/gu)].map((match) => match[1]);
    assert.ok(ids.length > 0, `${relPath} declares reviewCameras but the derivation read none out of it`);
    found[arenaId] = ids;
  }
  return found;
};

test('the arena roster is observed, and two independent observations agree', () => {
  const derived = Object.keys(arenaSourcesFromDisk()).sort();
  assert.deepEqual(derived, [...registryArenaIds()].sort(),
    'the arena modules on disk and ARENA_VISUAL_REGISTRY must name the same arenas');
  assert.deepEqual([...CATALOG_ARENAS].sort(), derived,
    'VIEWPOINT_CATALOG must cover exactly the arenas that exist - an arena missing here is never captured, '
    + 'never diffed, and reports no regression because nothing looked at it');
});

test('catalog covers every authored review camera', () => {
  const authored = authoredCameraIds(arenaSourcesFromDisk());
  for (const [arenaId, ids] of Object.entries(authored)) {
    assert.ok(VIEWPOINT_CATALOG[arenaId],
      `arena '${arenaId}' authors review cameras and has no VIEWPOINT_CATALOG entry at all`);
    for (const id of ids) {
      assert.ok(VIEWPOINT_CATALOG[arenaId].includes(id),
        `authored camera '${id}' (${arenaId}) is missing from VIEWPOINT_CATALOG - the regression sweep would silently skip it`);
    }
  }
});

test('catalog has no stale entries', () => {
  const sources = arenaSourcesFromDisk();
  const authored = authoredCameraIds(sources);
  for (const [arenaId, ids] of Object.entries(VIEWPOINT_CATALOG)) {
    for (const id of ids) {
      assert.ok(authored[arenaId]?.includes(id),
        `catalog entry '${arenaId}/${id}' no longer exists in ${sources[arenaId] ?? `${ARENAS_DIR}/${arenaId}.ts`} - remove it or fix the id`);
    }
  }
  assert.equal(CATALOG_VIEWPOINT_COUNT,
    CATALOG_ARENAS.reduce((sum, arena) => sum + VIEWPOINT_CATALOG[arena].length, 0));
});

test('the roster derivation actually fails when an arena is dropped', () => {
  // The defect this file shipped for a day and a half was an assertion that
  // could not fail. Prove the replacement can: run the catalog comparison
  // against a roster with one arena removed and require it to throw.
  const derived = Object.keys(arenaSourcesFromDisk()).sort();
  assert.ok(derived.length > 1, 'need more than one arena for this proof to mean anything');
  assert.throws(
    () => assert.deepEqual([...CATALOG_ARENAS].sort(), derived.slice(1)),
    'dropping an arena from the derived roster must be detectable by the comparison test 1 performs',
  );
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
    // HF-535, ADDED not loosened: newly-clamped-black area per station. Every
    // value above is untouched. 947b937f blackened 22.4% of a frame and this
    // instrument said DIFFS; 0.5% is two orders of magnitude below that and
    // above any measured same-build self-diff.
    newlyBlackFloor: 6,
    newlyBlackFraction: 0.005,
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
    // HF-535, ADDED not loosened: newly-clamped-black area per station. Every
    // value above is untouched. 947b937f blackened 22.4% of a frame and this
    // instrument said DIFFS; 0.5% is two orders of magnitude below that and
    // above any measured same-build self-diff.
    newlyBlackFloor: 6,
    newlyBlackFraction: 0.005,
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
  // HF-535: a candidate that CLAMPS a lit surface to black outranks every
  // other tier, so a relocation like 947b937f can never read as a plain diff.
  assert.equal(
    verdictFor({ ...quiet, newlyBlackFraction: THRESHOLDS.newlyBlackFraction }),
    'NEWLY_BLACK',
    'newly-clamped-black area at the floor must read NEWLY_BLACK',
  );
  assert.equal(
    verdictFor({ ...quiet, newlyBlackFraction: THRESHOLDS.newlyBlackFraction, largestRegionFraction: THRESHOLDS.regionGlobal }),
    'NEWLY_BLACK',
    'newly-black must not be diluted into GLOBAL_CHANGED',
  );
  assert.equal(
    verdictFor({ ...quiet, newlyBlackFraction: THRESHOLDS.newlyBlackFraction * 0.5 }),
    'MATCH',
    'below the newly-black floor the other tiers still decide',
  );
});

test('the diff FAILS, not merely DIFFS, when a station is newly clamped black', () => {
  const source = readFileSync(resolve(ROOT, 'scripts/qa/diff-arena-viewpoints.mjs'), 'utf8');
  // The skeptic finding this closes: 108 + 212 green unit tests, a green
  // pipeline-budget gate and a green fidelity gate all passed on a build that
  // turned 206,067 px of one station black, and the only instrument that saw
  // anything said 'DIFFS' - the same word a legitimate change earns.
  assert.match(source, /NEWLY_BLACK/);
  assert.match(source, /newlyBlackFraction/);
  assert.match(source, /maxChannel/);
  assert.match(source, /'FAIL'/);
  assert.match(source, /blocking = \['NEWLY_BLACK'/);
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

test('diff manifest validation refuses non-PASS verdicts and identical bundleAtStart', async () => {
  const { validateManifests } = await import('./diff-arena-viewpoints.mjs');
  const validBase = { backend: 'webgpu', verdict: 'PASS', bundleAtStart: '/bundle-base.js' };
  const validCand = { backend: 'webgpu', verdict: 'PASS', bundleAtStart: '/bundle-cand.js' };
  assert.deepEqual(validateManifests(validBase, validCand), []);

  // Base verdict !== 'PASS'
  const failBase = { ...validBase, verdict: 'FAIL' };
  const problemsFailBase = validateManifests(failBase, validCand);
  assert.equal(problemsFailBase.length, 1);
  assert.match(problemsFailBase[0], /base capture did not pass \(verdict='FAIL'\)/);

  // Candidate verdict !== 'PASS'
  const failCand = { ...validCand, verdict: 'INVALID' };
  const problemsFailCand = validateManifests(validBase, failCand);
  assert.equal(problemsFailCand.length, 1);
  assert.match(problemsFailCand[0], /candidate capture did not pass \(verdict='INVALID'\)/);

  // Identical bundleAtStart
  const sameBundle = { ...validCand, bundleAtStart: '/bundle-base.js' };
  const problemsSameBundle = validateManifests(validBase, sameBundle);
  assert.equal(problemsSameBundle.length, 1);
  assert.match(problemsSameBundle[0], /both runs served the same bundle '\/bundle-base\.js' - harness mistake, not a code regression/);
});

test('diff CLI refuses real invalid fixture pair on disk (both FAIL and identical bundle)', () => {
  const baseDir = resolve(ROOT, 'artifacts/viewpoint-regression/base-c736d48c');
  const headDir = resolve(ROOT, 'artifacts/viewpoint-regression/head-55833a07');
  const res = spawnSync(process.execPath, [
    resolve(ROOT, 'scripts/qa/diff-arena-viewpoints.mjs'),
    '--base', baseDir,
    '--candidate', headDir,
  ], { encoding: 'utf8' });

  assert.equal(res.status, 2, 'diff CLI must exit 2 when given invalid captures');
  assert.match(res.stderr, /base capture did not pass \(verdict='FAIL'\)/);
  assert.match(res.stderr, /candidate capture did not pass \(verdict='FAIL'\)/);
  assert.match(res.stderr, /both runs served the same bundle '\/legacy-main-C7nXu8gj\.js' - harness mistake, not a code regression/);
});

test('diff CLI refuses when a capture manifest has non-PASS verdict', () => {
  const tmpBase = resolve(import.meta.dirname, '.tmp-test-verdict-base');
  const tmpCand = resolve(import.meta.dirname, '.tmp-test-verdict-cand');
  mkdirSync(tmpBase, { recursive: true });
  mkdirSync(tmpCand, { recursive: true });
  try {
    writeFileSync(resolve(tmpBase, 'capture-manifest.json'), JSON.stringify({
      contract: 'arena-viewpoint-regression-capture-v1',
      verdict: 'PASS',
      backend: 'webgpu',
      bundleAtStart: '/bundle-a.js',
    }));
    writeFileSync(resolve(tmpCand, 'capture-manifest.json'), JSON.stringify({
      contract: 'arena-viewpoint-regression-capture-v1',
      verdict: 'FAIL',
      backend: 'webgpu',
      bundleAtStart: '/bundle-b.js',
    }));
    const res = spawnSync(process.execPath, [
      resolve(ROOT, 'scripts/qa/diff-arena-viewpoints.mjs'),
      '--base', tmpBase,
      '--candidate', tmpCand,
    ], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /candidate capture did not pass \(verdict='FAIL'\)/);
    assert.doesNotMatch(res.stderr, /base capture did not pass/);
    assert.doesNotMatch(res.stderr, /same bundle/);
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
    rmSync(tmpCand, { recursive: true, force: true });
  }
});

test('diff CLI refuses when both captures served the same bundle', () => {
  const tmpBase = resolve(import.meta.dirname, '.tmp-test-bundle-base');
  const tmpCand = resolve(import.meta.dirname, '.tmp-test-bundle-cand');
  mkdirSync(tmpBase, { recursive: true });
  mkdirSync(tmpCand, { recursive: true });
  try {
    writeFileSync(resolve(tmpBase, 'capture-manifest.json'), JSON.stringify({
      contract: 'arena-viewpoint-regression-capture-v1',
      verdict: 'PASS',
      backend: 'webgpu',
      bundleAtStart: '/identical-bundle.js',
    }));
    writeFileSync(resolve(tmpCand, 'capture-manifest.json'), JSON.stringify({
      contract: 'arena-viewpoint-regression-capture-v1',
      verdict: 'PASS',
      backend: 'webgpu',
      bundleAtStart: '/identical-bundle.js',
    }));
    const res = spawnSync(process.execPath, [
      resolve(ROOT, 'scripts/qa/diff-arena-viewpoints.mjs'),
      '--base', tmpBase,
      '--candidate', tmpCand,
    ], { encoding: 'utf8' });
    assert.equal(res.status, 2);
    assert.match(res.stderr, /both runs served the same bundle '\/identical-bundle\.js' - harness mistake, not a code regression/);
    assert.doesNotMatch(res.stderr, /capture did not pass/);
  } finally {
    rmSync(tmpBase, { recursive: true, force: true });
    rmSync(tmpCand, { recursive: true, force: true });
  }
});

