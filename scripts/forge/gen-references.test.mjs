/**
 * scripts/forge/gen-references.test.mjs
 *
 * Offline contract tests for the ART FORGE reference generator.
 * No network, no secret read, no image model call: these cover the prompt
 * builder, the argument/cap parsing and the manifest writer only.
 *
 * Run: node --test scripts/forge/gen-references.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ALLOWED_USE,
  DEFAULT_MODEL,
  FALLBACK_MODEL,
  HARD_MAX_CALLS,
  HARD_MAX_COST_USD,
  LICENCE,
  NOTE_POOL,
  STATION_NOTES,
  buildManifest,
  buildPrompt,
  decodeDataUrl,
  extractImageDataUrl,
  noteKeysFor,
  parseArgs,
  sha256,
  sheetLayout,
  stationFromFile,
  writeManifest,
} from './gen-references.mjs';

// --------------------------------------------------------------------------
// Prompt builder
// --------------------------------------------------------------------------

test('every station in the table carries 3 to 5 known note keys', () => {
  const stations = Object.keys(STATION_NOTES);
  assert.equal(stations.length, 29, 'the table must cover all 29 review stations');
  for (const s of stations) {
    const keys = noteKeysFor(s);
    assert.ok(keys.length >= 3 && keys.length <= 5, `${s} has ${keys.length} notes`);
    for (const k of keys) assert.ok(NOTE_POOL[k], `${s} references unknown key ${k}`);
    assert.equal(new Set(keys).size, keys.length, `${s} repeats a note key`);
  }
});

test('prompt repaints OUR frame and pins camera, layout and aspect ratio', () => {
  const p = buildPrompt('overhead');
  assert.match(p, /Image 1 is a fixed review-camera frame from our game/);
  assert.match(p, /image 2 is the style target/i);
  assert.match(p, /identical camera, framing, layout, object positions and proportions/);
  assert.match(p, /Do not add, move or remove buildings, vehicles, roads or trees/);
  assert.match(p, /Do not change the aspect ratio \(16:9/);
  assert.match(p, /1950s suburban test-town layout/);
  assert.match(p, /two houses, the coach and truck in the middle street/);
});

test('prompt carries the look definition and rules out the wrong registers', () => {
  const p = buildPrompt('street-centre');
  assert.match(p, /Low poly, HIGH QUALITY/);
  assert.match(p, /jagged two-tone rock/);
  assert.match(p, /golden-hour/);
  assert.match(p, /NOT blown to white/);
  assert.match(p, /contact shadow/i);
  assert.match(p, /Firewatch/);
  assert.match(p, /NOT photoreal, NOT voxel, NOT Roblox-like, NOT cartoon/);
});

test('station-specific notes reach the frames whose weakness they name', () => {
  assert.match(buildPrompt('coach-elevation'), /wheels in image 1 are detached and floating/);
  assert.match(buildPrompt('truck-cab-near'), /wheels in image 1 are detached and floating/);
  assert.match(buildPrompt('into-sun-street'), /sky in image 1 is blown to a flat near-white void/);
  assert.match(buildPrompt('overhead'), /mountain backdrop in image 1 is one smooth flat band/);
  assert.match(buildPrompt('north-upper-window'), /mountain backdrop in image 1 is one smooth flat band/);
  assert.match(buildPrompt('street-centre'), /street lamp heads in image 1 are plain rectangular boxes/);
});

test('a station only gets the notes it was assigned', () => {
  const interior = buildPrompt('north-interior');
  assert.doesNotMatch(interior, /wheels in image 1 are detached/);
  assert.match(interior, /interior surfaces in image 1 are flat untextured planes/);
});

test('prompts are deterministic and station-distinct', () => {
  assert.equal(sha256(buildPrompt('garage')), sha256(buildPrompt('garage')));
  assert.notEqual(sha256(buildPrompt('garage')), sha256(buildPrompt('overhead')));
  assert.match(buildPrompt('garage'), /review station "garage"/);
});

test('an unknown station falls back to the default note set rather than throwing', () => {
  const p = buildPrompt('some-future-station');
  assert.match(p, /review station "some-future-station"/);
  assert.equal(noteKeysFor('some-future-station').length, 4);
});

test('noteKeysFor rejects a malformed table row', () => {
  const saved = STATION_NOTES['garage'];
  try {
    STATION_NOTES['garage'] = ['CONTACT', 'SIDING'];
    assert.throws(() => noteKeysFor('garage'), /3 to 5/);
    STATION_NOTES['garage'] = ['CONTACT', 'NOT_A_KEY', 'SIDING'];
    assert.throws(() => noteKeysFor('garage'), /unknown note key/);
  } finally {
    STATION_NOTES['garage'] = saved;
  }
});

// --------------------------------------------------------------------------
// Arguments and caps
// --------------------------------------------------------------------------

test('defaults use the flash image model and the hard caps', () => {
  const a = parseArgs([]);
  assert.equal(a.model, DEFAULT_MODEL);
  assert.equal(a.maxImages, HARD_MAX_CALLS);
  assert.equal(a.maxCostUsd, HARD_MAX_COST_USD);
  assert.equal(a.dryRun, false);
  assert.equal(a.stations, null);
});

test('caps may be lowered but never raised', () => {
  assert.equal(parseArgs(['--max-images', '5']).maxImages, 5);
  assert.equal(parseArgs(['--max-images', '900']).maxImages, HARD_MAX_CALLS);
  assert.equal(parseArgs(['--max-cost', '0.5']).maxCostUsd, 0.5);
  assert.equal(parseArgs(['--max-cost', '99']).maxCostUsd, HARD_MAX_COST_USD);
});

test('flags parse and unknown flags fail loudly', () => {
  const a = parseArgs(['--dry-run', '--stations', 'overhead, street-centre', '--model', 'x/y']);
  assert.equal(a.dryRun, true);
  assert.deepEqual(a.stations, ['overhead', 'street-centre']);
  assert.equal(a.model, 'x/y');
  assert.throws(() => parseArgs(['--nope']), /unknown argument/);
  assert.throws(() => parseArgs(['--max-images']), /needs a value/);
  assert.throws(() => parseArgs(['--max-images', '0']), /positive integer/);
});

test('--skip-existing is off unless asked for, so a rerun never silently re-bills', () => {
  assert.equal(parseArgs([]).skipExisting, false);
  assert.equal(parseArgs(['--skip-existing']).skipExisting, true);
});

test('the manifest carries a per-chunk run ledger, empty by default', () => {
  const m = buildManifest({
    arena: 'nuketown2',
    model: DEFAULT_MODEL,
    fallbackModel: FALLBACK_MODEL,
    stylePath: 'x.png',
    styleSha256: 'abc',
    entries: [],
  });
  assert.deepEqual(m.runs, []);
  const m2 = buildManifest({
    arena: 'nuketown2',
    model: DEFAULT_MODEL,
    fallbackModel: FALLBACK_MODEL,
    stylePath: 'x.png',
    styleSha256: 'abc',
    entries: [],
    runs: [{ startedAt: 'a', finishedAt: 'b', model: DEFAULT_MODEL, stations: ['overhead'], callsMade: 1, spendUSD: 0.07 }],
  });
  assert.equal(m2.runs.length, 1);
  assert.equal(m2.runs[0].spendUSD, 0.07);
});

test('station discovery ignores the second sample', () => {
  assert.equal(stationFromFile('nuketown2-overhead.png', 'nuketown2'), 'overhead');
  assert.equal(stationFromFile('nuketown2-overhead.s1.png', 'nuketown2'), null);
  assert.equal(stationFromFile('capture-manifest.json', 'nuketown2'), null);
  assert.equal(stationFromFile('terminal-overhead.png', 'nuketown2'), null);
});

// --------------------------------------------------------------------------
// Response parsing
// --------------------------------------------------------------------------

test('the generated image is read from choices[0].message.images[i].image_url.url', () => {
  const url = 'data:image/png;base64,aGVsbG8=';
  assert.equal(extractImageDataUrl({ choices: [{ message: { images: [{ image_url: { url } }] } }] }), url);
  assert.equal(extractImageDataUrl({ choices: [{ message: { content: 'sorry' } }] }), null);
  assert.equal(extractImageDataUrl({}), null);
  assert.equal(decodeDataUrl(url).toString('utf8'), 'hello');
});

// --------------------------------------------------------------------------
// Manifest writer
// --------------------------------------------------------------------------

function entry(station, extra = {}) {
  return {
    station,
    path: `docs/forge/references/nuketown2/${station}.target.png`,
    model: DEFAULT_MODEL,
    provider: 'openrouter',
    promptSha256: sha256(buildPrompt(station)),
    inputSha256: sha256(`base-${station}`),
    styleSha256: sha256('style'),
    usage: { promptTokens: 1200, completionTokens: 1300, cost: 0.0312 },
    generatedAt: '2026-09-06T14:44:01.000Z',
    licence: LICENCE,
    allowedUse: ALLOWED_USE,
    ok: true,
    error: null,
    ...extra,
  };
}

test('manifest round-trips with every contracted field, sorted by station', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'forge-refs-'));
  try {
    const manifest = buildManifest({
      arena: 'nuketown2',
      model: DEFAULT_MODEL,
      fallbackModel: FALLBACK_MODEL,
      stylePath: 'C:/style/Nuke-Town-Visual-Target.png',
      styleSha256: sha256('style'),
      entries: [entry('overhead'), entry('coach-elevation'), entry('garage', { ok: false, error: 'no image in response' })],
      runStartedAt: '2026-09-06T14:40:00.000Z',
      runFinishedAt: '2026-09-06T14:59:00.000Z',
      spendUSD: 0.0936,
      callsMade: 3,
    });
    const p = await writeManifest(dir, manifest);
    const read = JSON.parse(await readFile(p, 'utf8'));

    assert.equal(read.arena, 'nuketown2');
    assert.equal(read.provider, 'openrouter');
    assert.equal(read.model, DEFAULT_MODEL);
    assert.equal(read.spendUSD, 0.0936);
    assert.equal(read.callsMade, 3);
    assert.equal(read.sources[0].licence, LICENCE);
    assert.equal(read.sources[0].allowedUse, ALLOWED_USE);
    assert.match(read.provenanceRule, /never evidence of implementation/);

    assert.deepEqual(
      read.entries.map((e) => e.station),
      ['coach-elevation', 'garage', 'overhead'],
    );
    for (const e of read.entries) {
      for (const k of [
        'station',
        'path',
        'model',
        'provider',
        'promptSha256',
        'inputSha256',
        'styleSha256',
        'usage',
        'generatedAt',
        'licence',
        'allowedUse',
      ]) {
        assert.ok(Object.prototype.hasOwnProperty.call(e, k), `entry ${e.station} is missing ${k}`);
      }
      assert.equal(e.licence, LICENCE);
      assert.equal(e.allowedUse, ALLOWED_USE);
      assert.equal(typeof e.usage, 'object');
    }
    const failed = read.entries.find((e) => e.station === 'garage');
    assert.equal(failed.ok, false);
    assert.equal(failed.error, 'no image in response');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generatedAt is taken from the caller, never invented by the writer', () => {
  const m = buildManifest({
    arena: 'nuketown2',
    model: DEFAULT_MODEL,
    fallbackModel: FALLBACK_MODEL,
    stylePath: 'x.png',
    styleSha256: 'abc',
    entries: [entry('overhead', { generatedAt: null })],
  });
  assert.equal(m.entries[0].generatedAt, null);
  assert.equal(m.runStartedAt, null);
});

// --------------------------------------------------------------------------
// Contact sheet layout
// --------------------------------------------------------------------------

test('a full sheet is 8 rows of label + two 640x360 cells', () => {
  const L = sheetLayout(8);
  assert.equal(L.cellW, 640);
  assert.equal(L.cellH, 360);
  assert.equal(L.width, 8 + 300 + 8 + 640 + 8 + 640 + 8);
  assert.equal(L.height, 60 + 8 * (360 + 8) + 8);
  assert.ok(sheetLayout(5).height < L.height, 'a short final sheet is shorter');
});
