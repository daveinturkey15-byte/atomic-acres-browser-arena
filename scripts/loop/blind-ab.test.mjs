// Blind A/B critic - unit tests. node --test, no network, no GPU, no quota.
// Fixture-based: synthetic captures and references are generated with sharp
// into a temp directory, and the critic is a recorded fixture map.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import sharp from 'sharp';
import {
  BLIND_AB_CONTRACT, MIN_DECISIVE_FOR_CLAIM,
  sideAssignment, abProbeToken, unblind, validateAbResponse, aggregate, wilsonInterval,
  renderWinRateTable, buildAbInstruction, prepareBlindImage, commonStations, runBlindAb, normaliseConfidence, revalidateRun,
} from './blind-ab.mjs';
import { PROBE_ALPHABET, PROBE_LENGTH } from './probe.mjs';

const STATIONS = ['nuketown2-garage', 'nuketown2-north-yard', 'nuketown2-overhead', 'nuketown2-street-centre',
  'nuketown2-vehicle-near', 'nuketown2-appliance-bank-south-close', 'nuketown2-front-porch', 'nuketown2-south-yard'];

async function writePng(path, { width = 320, height = 180, r = 40, g = 90, b = 140 } = {}) {
  const buffer = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    const x = i % width;
    const y = Math.floor(i / width);
    buffer[i * 3] = (r + x) & 255; buffer[i * 3 + 1] = (g + y) & 255; buffer[i * 3 + 2] = b;
  }
  await sharp(buffer, { raw: { width, height, channels: 3 } }).png().toFile(path);
  return path;
}

async function await_mkdir(dir) { mkdirSync(dir, { recursive: true }); }

test('side assignment is deterministic, seed-bound and not a constant coin', () => {
  const first = STATIONS.map((station) => sideAssignment({ seed: 'run-1', station }));
  const again = STATIONS.map((station) => sideAssignment({ seed: 'run-1', station }));
  assert.deepEqual(first, again);
  for (const a of first) assert.ok((a.left === 'A' && a.right === 'B') || (a.left === 'B' && a.right === 'A'));
  const leftA = first.filter((a) => a.left === 'A').length;
  assert.ok(leftA > 0 && leftA < STATIONS.length, `A sat on the left ${leftA}/${STATIONS.length} times - a constant side is not blinding`);
  const other = STATIONS.map((station) => sideAssignment({ seed: 'run-2', station }));
  assert.notDeepEqual(first, other, 'a different seed must be able to change sides');
  assert.throws(() => sideAssignment({ seed: '', station: 'x' }), TypeError);
});

test('probe tokens differ per side and stay in the alphabet', () => {
  const sha = 'a'.repeat(64);
  const left = abProbeToken({ seed: 's', station: 'st', side: 'left', sha256: sha });
  const right = abProbeToken({ seed: 's', station: 'st', side: 'right', sha256: sha });
  assert.equal(left.length, PROBE_LENGTH);
  assert.notEqual(left, right);
  for (const ch of left + right) assert.ok(PROBE_ALPHABET.includes(ch));
  assert.throws(() => abProbeToken({ seed: 's', station: 'st', side: 'middle', sha256: sha }), RangeError);
});

test('unblinding maps the critic side back to the candidate, and only for a valid side', () => {
  const assignment = { left: 'B', right: 'A' };
  assert.equal(unblind('left', assignment), 'B');
  assert.equal(unblind('right', assignment), 'A');
  assert.equal(unblind('tie', assignment), 'tie');
  assert.equal(unblind('both', assignment), null);
  assert.equal(unblind(null, assignment), null);
});

const goodResponse = (over = {}) => ({
  contract: BLIND_AB_CONTRACT, station: 'x', probes: { left: 'ACDE', right: 'HJKM' }, winner: 'right', confidence: 0.7,
  why: 'RIGHT keeps the garage vault massing the references show in r1c1.', leftCloser: [], rightCloser: ['garage vault massing r1c1'],
  largestDifference: { region: 'r1c1', what: 'garage roof' }, ...over,
});

test('a misread probe on EITHER side carries no vote', () => {
  const ok = validateAbResponse(goodResponse(), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(ok.valid, true); assert.equal(ok.winnerSide, 'right'); assert.equal(ok.confidence, 0.7);
  const leftWrong = validateAbResponse(goodResponse({ probes: { left: 'ACDX', right: 'HJKM' } }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(leftWrong.valid, false); assert.equal(leftWrong.invalidReason, 'probe-mismatch-left'); assert.equal(leftWrong.winnerSide, null);
  const rightMissing = validateAbResponse(goodResponse({ probes: { left: 'ACDE', right: 'NONE' } }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(rightMissing.invalidReason, 'probe-mismatch-right');
  const both = validateAbResponse(goodResponse({ probes: {} }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(both.invalidReason, 'probe-mismatch-both');
  // Punctuation and case are forgiven; a hallucinated wall of characters is not.
  const punctuated = validateAbResponse(goodResponse({ probes: { left: 'a-c-d-e', right: 'hjkm.' } }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(punctuated.valid, true);
  const wall = validateAbResponse(goodResponse({ probes: { left: 'ACDEACDEACDEACDEACDE', right: 'HJKM' } }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(wall.valid, false);
});

test('confidence accepts a fraction or a percentage, never a unit outside both', () => {
  // Muse's first real round answered `confidence: 78` with both probes right.
  assert.equal(normaliseConfidence(78), 0.78);
  assert.equal(normaliseConfidence(0.78), 0.78);
  assert.equal(normaliseConfidence('78%'), 0.78);
  assert.equal(normaliseConfidence(1), 1, '1 is read as certainty, never as 1%');
  assert.equal(normaliseConfidence(0), 0);
  assert.equal(normaliseConfidence(101), null);
  assert.equal(normaliseConfidence(-1), null);
  assert.equal(normaliseConfidence('high'), null);
  const percent = validateAbResponse(goodResponse({ confidence: 78 }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(percent.valid, true); assert.equal(percent.confidence, 0.78);
});

test('a malformed verdict is schema-invalid even with correct probes', () => {
  const noWinner = validateAbResponse(goodResponse({ winner: 'both' }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(noWinner.valid, false); assert.equal(noWinner.invalidReason, 'schema-invalid');
  const noReason = validateAbResponse(goodResponse({ winner: 'left', leftCloser: [] }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(noReason.valid, false);
  const tie = validateAbResponse(goodResponse({ winner: 'tie', rightCloser: [] }), { expectedLeft: 'ACDE', expectedRight: 'HJKM' });
  assert.equal(tie.valid, true, 'a tie needs no "closer" list');
  assert.equal(validateAbResponse(null, { expectedLeft: 'ACDE', expectedRight: 'HJKM' }).invalidReason, 'unparseable');
});

test('aggregation counts wins, ties and invalids, and derives the claim-state itself', () => {
  const row = (winner, valid = true, invalidReason = null, confidence = 0.6) => ({ valid, winner: valid ? winner : null, invalidReason, confidence: valid ? confidence : null });
  const rows = [row('A'), row('A'), row('B'), row('tie'), row(null, false, 'probe-mismatch-left'), row('A'), row('A'), row('B')];
  const agg = aggregate(rows, { labelA: 'four-b', labelB: 'five' });
  assert.equal(agg.stations, 8); assert.equal(agg.valid, 7); assert.equal(agg.invalid, 1);
  assert.deepEqual(agg.invalidReasons, { 'probe-mismatch-left': 1 });
  assert.equal(agg.candidates.A.wins, 4); assert.equal(agg.candidates.B.wins, 2); assert.equal(agg.ties, 1); assert.equal(agg.decisive, 6);
  assert.equal(agg.candidates.A.winRateDecisive, 0.6667);
  assert.equal(agg.candidates.A.winRateWithHalfTies, 0.6429);
  assert.equal(agg.claimState, 'VERIFIED');
  assert.equal(agg.separates, false, 'four to two does not exclude 50%');
  const few = aggregate(rows.slice(0, 3), { labelA: 'a', labelB: 'b' });
  assert.equal(few.claimState, 'VERIFIED-UNDERPOWERED');
  assert.ok(few.decisive < MIN_DECISIVE_FOR_CLAIM);
  assert.equal(aggregate([row(null, false, 'route-failed')], { labelA: 'a', labelB: 'b' }).claimState, 'INVALID');
  assert.equal(aggregate([], { labelA: 'a', labelB: 'b' }).claimState, 'OPEN');
  const sweep = aggregate([row('A'), row('A'), row('A'), row('A'), row('A'), row('A'), row('A'), row('A')], { labelA: 'a', labelB: 'b' });
  assert.equal(sweep.separates, true, 'eight of eight excludes 50%');
});

test('wilson interval behaves at the edges', () => {
  assert.equal(wilsonInterval(0, 0), null);
  const half = wilsonInterval(3, 6);
  assert.ok(half.low < 0.5 && half.high > 0.5);
  const all = wilsonInterval(8, 8);
  assert.ok(all.low > 0.5 && all.high === 1);
});

test('the instruction carries no label, path or seed and demands both probes', () => {
  const text = buildAbInstruction({ station: 'nuketown2-garage', referenceCount: 3 });
  assert.ok(text.includes('probes.left') && text.includes('probes.right'));
  assert.ok(text.includes(BLIND_AB_CONTRACT));
  assert.ok(text.includes('1..3. THE REFERENCE SET'));
  assert.ok(text.includes('4. LEFT') && text.includes('5. RIGHT'));
  for (const leak of ['candidate', 'C:\\', 'aa-claude', 'pass94', 'seed', 'hitl']) {
    assert.ok(!text.toLowerCase().includes(leak.toLowerCase()), `instruction leaks "${leak}"`);
  }
  assert.ok(text.includes('tie'));
});

test('prepareBlindImage strips metadata, stamps the probe and changes the bytes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'blind-ab-img-'));
  const source = await writePng(join(root, 'nuketown2-garage.png'));
  // Give the source something to strip: an EXIF block and an ICC-less XMP-free
  // file still proves the output carries none of the fields we check.
  const tagged = join(root, 'tagged.png');
  await sharp(source).withMetadata({ exif: { IFD0: { ImageDescription: 'candidate5 pass94 build' } } }).png().toFile(tagged);
  const out = await prepareBlindImage({ sourcePath: tagged, destPath: join(root, 'left.png'), token: 'ACDE' });
  assert.deepEqual(out.metadata.leakedFields, [], 'no exif/icc/xmp/iptc field may survive');
  assert.equal(out.metadata.width, 320); assert.equal(out.metadata.height, 180);
  assert.notEqual(out.sha256, (await import('./image.mjs')).sha256File(tagged));
  assert.ok(out.stamp.patchW > 0 && out.stamp.corner === 'bottom-right');
  const bytes = readFileSync(out.destPath, 'latin1');
  assert.ok(!bytes.includes('candidate5'), 'the EXIF description leaked into the blind copy');
});

test('commonStations excludes persistence samples and HUD/minimap shots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'blind-ab-common-'));
  const a = join(root, 'a'); const b = join(root, 'b');
  await await_mkdir(a); await await_mkdir(b);
  for (const name of ['nuketown2-garage.png', 'nuketown2-garage.s1.png', 'hud-solo-nuketown2.png', 'nuketown2-overhead.png', 'nuketown2-only-a.png']) await writePng(join(a, name));
  for (const name of ['nuketown2-garage.png', 'nuketown2-overhead.png', 'minimap-solo-nuketown2.png']) await writePng(join(b, name));
  assert.deepEqual(commonStations(a, b), ['nuketown2-garage', 'nuketown2-overhead']);
});

test('dry run end to end: fixture critic, blinding receipt, refusals and the table', async () => {
  const root = mkdtempSync(join(tmpdir(), 'blind-ab-run-'));
  const a = join(root, 'A'); const b = join(root, 'B'); const refs = join(root, 'refs'); const out = join(root, 'out');
  await await_mkdir(a); await await_mkdir(b); await await_mkdir(refs);
  const stations = STATIONS.slice(0, 6);
  for (const station of stations) { await writePng(join(a, `${station}.png`), { r: 10 }); await writePng(join(b, `${station}.png`), { r: 200 }); }
  const reference = await writePng(join(refs, 'nt2025-street.png'), { r: 120, g: 20 });
  // Six recorded critics: four echo the probes and vote, one votes tie, one
  // misreads a probe and must be refused.
  const fixtures = {
    [stations[0]]: { ...goodResponse({ winner: 'left' , leftCloser: ['x r1c1'] }), probes: 'ECHO' },
    [stations[1]]: { ...goodResponse({ winner: 'right' }), probes: 'ECHO' },
    [stations[2]]: { ...goodResponse({ winner: 'left', leftCloser: ['y r0c0'] }), probes: 'ECHO' },
    [stations[3]]: { ...goodResponse({ winner: 'tie', rightCloser: [] }), probes: 'ECHO' },
    [stations[4]]: { ...goodResponse({ winner: 'left', leftCloser: ['z r2c2'] }), probes: { left: 'ECHO', right: 'XXXX' } },
    [stations[5]]: { ...goodResponse({ winner: 'right' }), probes: 'ECHO' },
  };
  const receipt = await runBlindAb({ aDir: a, bDir: b, labelA: 'four-b', labelB: 'five', references: [reference], stations, critic: 'fixture', fixtures, seed: 'unit', outDir: out });
  assert.equal(receipt.rows.length, 6);
  const refused = receipt.rows.find((r) => r.station === stations[4]);
  assert.equal(refused.valid, false); assert.equal(refused.invalidReason, 'probe-mismatch-right'); assert.equal(refused.winner, null);
  for (const row of receipt.rows.filter((r) => r.valid)) {
    // The unblinded winner must agree with the side assignment recorded for that station.
    const expectedWinner = unblind(row.winnerSide, sideAssignment({ seed: 'unit', station: row.station }));
    assert.equal(row.winner, expectedWinner);
    assert.deepEqual(row.images.left.leakedFields, []); assert.deepEqual(row.images.right.leakedFields, []);
    assert.equal(row.images.left.candidate, row.assignment.left);
    assert.ok(existsSync(join(out, row.station, 'blind', 'left.png')) && existsSync(join(out, row.station, 'blind', 'reference-1.png')));
    assert.ok(!existsSync(join(out, row.station, 'blind', 'nt2025-street.png')), 'reference must be shown under a neutral name');
  }
  assert.equal(receipt.aggregate.valid, 5); assert.equal(receipt.aggregate.invalid, 1); assert.equal(receipt.aggregate.ties, 1);
  assert.equal(receipt.aggregate.candidates.A.wins + receipt.aggregate.candidates.B.wins, 4);
  assert.equal(receipt.aggregate.claimState, 'VERIFIED-UNDERPOWERED');
  const table = renderWinRateTable(receipt.aggregate, receipt.rows);
  assert.ok(table.includes('| A: four-b |') && table.includes('| B: five |'));
  assert.ok(table.includes('INVALID (probe-mismatch-right)'));
  const results = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8'));
  assert.equal(results.contract, BLIND_AB_CONTRACT);
  assert.ok(existsSync(join(out, 'WIN-RATE.md')));
});

test('revalidate re-judges stored raw verdicts without calling a critic and keeps the originals', async () => {
  const root = mkdtempSync(join(tmpdir(), 'blind-ab-reval-'));
  const a = join(root, 'A'); const b = join(root, 'B'); const out = join(root, 'out');
  await await_mkdir(a); await await_mkdir(b);
  const stations = STATIONS.slice(0, 2);
  for (const station of stations) { await writePng(join(a, `${station}.png`), { r: 10 }); await writePng(join(b, `${station}.png`), { r: 200 }); }
  const reference = await writePng(join(root, 'ref.png'), { r: 120 });
  const fixtures = {
    [stations[0]]: { ...goodResponse({ winner: 'left', leftCloser: ['x r1c1'], confidence: 78 }), probes: 'ECHO' },
    [stations[1]]: { ...goodResponse({ winner: 'right' }), probes: 'ECHO' },
  };
  const first = await runBlindAb({ aDir: a, bDir: b, labelA: 'a', labelB: 'b', references: [reference], stations, critic: 'fixture', fixtures, seed: 'reval', outDir: out });
  assert.equal(first.aggregate.valid, 2);
  // Simulate the verdict an older validator wrote: refused over the unit.
  const verdictPath = join(out, stations[0], 'verdict.json');
  const stale = JSON.parse(readFileSync(verdictPath, 'utf8'));
  const { writeFileSync } = await import('node:fs');
  writeFileSync(verdictPath, JSON.stringify({ ...stale, valid: false, invalidReason: 'schema-invalid', errors: ['confidence must be a number in 0..1'], winner: null, winnerSide: null, confidence: null }));
  const results = JSON.parse(readFileSync(join(out, 'results.json'), 'utf8'));
  results.rows[0] = { ...results.rows[0], valid: false, invalidReason: 'schema-invalid', winner: null };
  results.aggregate = aggregate(results.rows, { labelA: 'a', labelB: 'b' });
  writeFileSync(join(out, 'results.json'), JSON.stringify(results));
  assert.equal(results.aggregate.valid, 1);

  const receipt = revalidateRun(out);
  assert.equal(receipt.aggregate.valid, 2, 'the stored raw verdict carries a receipted vote once the unit is read correctly');
  assert.equal(receipt.originalAggregate.valid, 1, 'the aggregate before re-validation is kept beside the new one');
  assert.ok(existsSync(join(out, stations[0], 'verdict.original.json')));
  const row = receipt.rows.find((r) => r.station === stations[0]);
  assert.equal(row.confidence, 0.78);
  assert.equal(row.winner, unblind('left', sideAssignment({ seed: 'reval', station: stations[0] })));
  assert.equal(row.revalidated.previousInvalidReason, 'schema-invalid');
  assert.ok(receipt.revalidatedAt);
});

test('the runner refuses a critic that is not admitted, and an A/B with no reference', async () => {
  await assert.rejects(() => runBlindAb({ aDir: '.', bDir: '.', labelA: 'a', labelB: 'b', references: ['x.png'], critic: 'qwen-local', outDir: '.' }), RangeError);
  await assert.rejects(() => runBlindAb({ aDir: '.', bDir: '.', labelA: 'a', labelB: 'b', references: [], critic: 'fixture', outDir: '.' }), /reference/);
});
