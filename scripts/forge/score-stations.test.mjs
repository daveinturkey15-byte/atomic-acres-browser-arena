// score-stations tests: synthetic PNGs via sharp; black detection, healed
// mirror, missing-station exit code, hue/stats sanity.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const SCORER = fileURLToPath(new URL('./score-stations.mjs', import.meta.url));

async function solidPng(path, w, h, r, g, b) {
  const px = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i += 1) { px[i * 3] = r; px[i * 3 + 1] = g; px[i * 3 + 2] = b; }
  await sharp(px, { raw: { width: w, height: h, channels: 3 } }).png().toFile(path);
}

function layout(tmp, station = 'st1') {
  const base = join(tmp, 'base', 'nuketown2');
  const cand = join(tmp, 'cand', 'nuketown2');
  mkdirSync(base, { recursive: true });
  mkdirSync(cand, { recursive: true });
  return { baseDir: join(tmp, 'base'), candDir: join(tmp, 'cand'), base, cand, station };
}

const boxesFor = (rect) => ({ stations: { st1: { boxes: [{ name: 'b1', rect, kind: 'subject', protected: false }] } } });

describe('score-stations', () => {
  it('detects a fully blackened candidate box and station', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-score-'));
    const { baseDir, candDir, base, cand } = layout(tmp);
    await solidPng(join(base, 'st1.png'), 200, 120, 200, 150, 100);
    await solidPng(join(cand, 'st1.png'), 200, 120, 0, 0, 0);
    const boxesPath = join(tmp, 'boxes.json');
    writeFileSync(boxesPath, JSON.stringify(boxesFor([10, 10, 50, 40])));
    const out = join(tmp, 'score.json');
    const run = spawnSync(process.execPath, [SCORER, '--candidate', candDir, '--base', baseDir, '--boxes', boxesPath, '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const score = JSON.parse((await import('node:fs')).readFileSync(out, 'utf8'));
    assert.equal(score.stations.st1.newlyBlack, 1);
    assert.equal(score.stations.st1.healed, 0);
    assert.deepEqual(score.stations.st1.boxes.b1.luma, { p10: 0, p50: 0, p90: 0 });
    assert.deepEqual(score.stations.st1.boxes.b1.meanRGB, [0, 0, 0]);
  });

  it('measures healed as the mirror and hue on lit colours', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-score-'));
    const { baseDir, candDir, base, cand } = layout(tmp);
    await solidPng(join(base, 'st1.png'), 200, 120, 0, 0, 0);
    await solidPng(join(cand, 'st1.png'), 200, 120, 0, 255, 0);
    const boxesPath = join(tmp, 'boxes.json');
    writeFileSync(boxesPath, JSON.stringify(boxesFor([0, 0, 200, 120])));
    const out = join(tmp, 'score.json');
    const run = spawnSync(process.execPath, [SCORER, '--candidate', candDir, '--base', baseDir, '--boxes', boxesPath, '--out', out], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const score = JSON.parse((await import('node:fs')).readFileSync(out, 'utf8'));
    assert.equal(score.stations.st1.newlyBlack, 0);
    assert.equal(score.stations.st1.healed, 1);
    assert.equal(score.stations.st1.boxes.b1.hueDeg, 120);
    assert.ok(score.stations.st1.boxes.b1.stddev < 1, 'solid colour has ~zero stddev');
  });

  it('exits non-zero when a station file is missing', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-score-'));
    const { baseDir, candDir, base } = layout(tmp);
    await solidPng(join(base, 'st1.png'), 64, 64, 10, 10, 10);
    const boxesPath = join(tmp, 'boxes.json');
    writeFileSync(boxesPath, JSON.stringify(boxesFor([0, 0, 8, 8])));
    const run = spawnSync(process.execPath, [SCORER, '--candidate', candDir, '--base', baseDir, '--boxes', boxesPath, '--out', join(tmp, 's.json')], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /missing/);
  });

  it('exits non-zero when a box leaves the 1280x720 frame', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-score-'));
    const { baseDir, candDir, base, cand } = layout(tmp);
    await solidPng(join(base, 'st1.png'), 64, 64, 10, 10, 10);
    await solidPng(join(cand, 'st1.png'), 64, 64, 10, 10, 10);
    const boxesPath = join(tmp, 'boxes.json');
    writeFileSync(boxesPath, JSON.stringify(boxesFor([1270, 710, 50, 50])));
    const run = spawnSync(process.execPath, [SCORER, '--candidate', candDir, '--base', baseDir, '--boxes', boxesPath, '--out', join(tmp, 's.json')], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
  });
});
