// RED-FIRST contract for the capture frame-variety guard (HF-541).
//
// The fixture below is not invented: it is the MEASURED distinct-RGB count of
// every station in the interim-11 root capture
// (aa-day-2026-09-06/root-captures/interim-11/nuketown2, sample 0, 1280x720),
// taken 2026-09-07. `nuketown2-perimeter-wall-end-close` is the station whose
// camera aimed 36 degrees into the perimeter end wall so that one shaded
// surface filled 64.6 % of the frame and only 4.0 % of it was sky (measured
// offline against the built geometry, artifacts/hf-viewpoint-end-close).
//
// Its frame is a low-variance sample, and including it in the 29-station tonal
// aggregate pulled the reported gap TOWARD the boards: on interim-11 the
// midtone delta reads +20.90 with it and +23.86 without, the highlight delta
// -4.66 with it and +1.00 without. A flat frame therefore does not merely look
// wrong, it makes the instrument optimistic - which is why this is a capture
// gate and not a note in a report.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFrameVariety, VARIETY_FLOOR_RATIO } from './capture-frame-variety.mjs';

/** MEASURED, interim-11, 2026-09-07. Station -> distinct RGB values in sample 0. */
const INTERIM_11 = Object.freeze({
  'nuketown2-perimeter-wall-end-close': 13025,
  'nuketown2-border-path-close': 40172,
  'nuketown2-south-interior': 45944,
  'nuketown2-nuke-north-balcony': 46079,
  'nuketown2-north-interior': 47298,
  'nuketown2-perimeter-wall-long-close': 50316,
  'nuketown2-garage': 52724,
  'nuketown2-nuke-south-balcony': 55487,
  'nuketown2-glasshouse-north-close': 57411,
  'nuketown2-coach-elevation': 67394,
  'nuketown2-north-yard': 71240,
  'nuketown2-sand-pit-north-close': 74582,
  'nuketown2-north-balcony': 76050,
  'nuketown2-garden-pod-north-close': 79742,
  'nuketown2-driveway-apron-close': 92715,
  'nuketown2-north-upper-window': 98593,
  'nuketown2-vehicle-mid': 100601,
  'nuketown2-nuke-street': 101031,
  'nuketown2-south-yard': 101180,
  'nuketown2-vehicle-near': 104367,
  'nuketown2-vehicle-far': 104563,
  'nuketown2-into-sun-street': 107181,
  'nuketown2-south-upper-window': 107457,
  'nuketown2-appliance-bank-south-close': 108442,
  'nuketown2-truck-cab-near': 113713,
  'nuketown2-appliance-bank-north-close': 114788,
  'nuketown2-overhead': 124850,
  'nuketown2-street-centre': 128798,
  'nuketown2-front-porch': 147991,
});

const rows = (map) => Object.entries(map).map(([station, distinct]) => ({ station, distinct }));

test('the interim-11 capture that shipped is REJECTED, and the flat station is named', () => {
  const result = assessFrameVariety(rows(INTERIM_11));
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.offenders.map((o) => o.station), ['nuketown2-perimeter-wall-end-close']);
  assert.equal(result.median, 92715);
  // The reported reason must carry the number a reader can re-measure.
  assert.match(result.offenders[0].reason, /13025/);
  assert.match(result.offenders[0].reason, /92715/);
});

test('an order-of-magnitude band alone would have PASSED this fault, so it is not the only bar', () => {
  // 13025 / 92715 = 0.1405, i.e. inside 0.1x-10x. This test exists so that a
  // later "simplification" down to the order-of-magnitude rule cannot land
  // silently: it is the falsifier for the weaker bar.
  const ratio = 13025 / 92715;
  assert.ok(ratio > 0.1, 'the shipped fault sits inside a 10x band');
  assert.ok(ratio < VARIETY_FLOOR_RATIO, 'and outside the derived floor this guard applies');
});

test('the floor separates the fault from the healthiest-but-lowest real station with margin', () => {
  // Healthy interim-11 floor: border-path-close at 40172 = 0.433x median.
  // Fault: 13025 = 0.140x. VARIETY_FLOOR_RATIO is the log-space midpoint of
  // those two, so it clears each by ~1.75x rather than being fitted to either.
  assert.ok(VARIETY_FLOOR_RATIO > 13025 / 92715);
  assert.ok(VARIETY_FLOOR_RATIO < 40172 / 92715);
});

test('the same set with the flat station repaired PASSES', () => {
  const repaired = { ...INTERIM_11, 'nuketown2-perimeter-wall-end-close': 48000 };
  const result = assessFrameVariety(rows(repaired));
  assert.equal(result.status, 'pass');
  assert.deepEqual(result.offenders, []);
});

test('a frame far ABOVE the median is caught by the order-of-magnitude ceiling', () => {
  const repaired = { ...INTERIM_11, 'nuketown2-perimeter-wall-end-close': 48000 };
  const blown = { ...repaired, 'nuketown2-overhead': 92715 * 11 };
  const result = assessFrameVariety(rows(blown));
  assert.equal(result.status, 'fail');
  assert.deepEqual(result.offenders.map((o) => o.station), ['nuketown2-overhead']);
});

test('a subset run is SKIPPED with a reason, never reported as a pass', () => {
  const result = assessFrameVariety(rows(INTERIM_11).slice(0, 3));
  assert.equal(result.status, 'skipped');
  assert.match(result.reason, /3/);
  assert.notEqual(result.status, 'pass');
});

test('every offender is named, not just the worst one', () => {
  const two = { ...INTERIM_11, 'nuketown2-garage': 900, 'nuketown2-north-yard': 1200 };
  const result = assessFrameVariety(rows(two));
  assert.equal(result.status, 'fail');
  assert.deepEqual(
    result.offenders.map((o) => o.station).sort(),
    ['nuketown2-garage', 'nuketown2-north-yard', 'nuketown2-perimeter-wall-end-close'],
  );
});
