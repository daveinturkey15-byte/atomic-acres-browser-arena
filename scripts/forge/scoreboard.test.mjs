// scoreboard tests: idempotent append, Markdown regeneration, --at honesty.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendRow, renderMarkdown, summarizeScore } from './scoreboard.mjs';

const SCOREBOARD = fileURLToPath(new URL('./scoreboard.mjs', import.meta.url));

const scoreFixture = () => ({
  version: 1, candidate: 'c', base: 'b',
  stations: {
    st1: { newlyBlack: 0, healed: 0.01, boxes: { sky: { luma: { p50: 150 }, stddev: 5, hueDeg: 60, protected: true } } },
  },
});

const row = (sha, label) => ({
  label, sha, base: 'b', verdict: 'KEEP', programSetDelta: 0, draws: 400, tris: 600000,
  fps: { median: 100, min: 80 }, hitches: { p50: 10, p95: 14, p99: 17 },
  stations: summarizeScore(scoreFixture()), at: '2026-09-06T10:00:00.000Z',
});

describe('scoreboard', () => {
  it('appends idempotently on same sha+label', () => {
    let board = { version: 1, passes: [] };
    board = appendRow(board, row('abc', 'l1'));
    board = appendRow(board, row('abc', 'l1'));
    assert.equal(board.passes.length, 1);
    board = appendRow(board, row('def', 'l2'));
    assert.equal(board.passes.length, 2);
  });

  it('CLI writes the row with the passed --at and regenerates Markdown', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-board-'));
    const scorePath = join(tmp, 'score.json');
    writeFileSync(scorePath, JSON.stringify(scoreFixture()));
    const outPath = join(tmp, 'board.json');
    const at = '2020-01-02T03:04:05.000Z';
    for (let i = 0; i < 2; i += 1) {
      const run = spawnSync(process.execPath, [SCOREBOARD, '--score', scorePath, '--sha', 'abc123', '--label', 't1',
        '--verdict', 'BASE', '--at', at, '--program-set-delta', '0', '--out', outPath], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
    }
    const board = JSON.parse(readFileSync(outPath, 'utf8'));
    assert.equal(board.passes.length, 1);
    assert.equal(board.passes[0].at, at);
    assert.equal(board.passes[0].stations.st1.boxes.sky.p50, 150);
    const mdPath = join(tmp, 'SCOREBOARD.md');
    assert.ok(existsSync(mdPath));
    const md = readFileSync(mdPath, 'utf8');
    assert.match(md, /t1/);
    assert.match(md, /abc123/);
  });

  it('CLI rejects a missing --at', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'forge-board-'));
    const scorePath = join(tmp, 'score.json');
    writeFileSync(scorePath, JSON.stringify(scoreFixture()));
    const run = spawnSync(process.execPath, [SCOREBOARD, '--score', scorePath, '--sha', 'x', '--label', 'y',
      '--verdict', 'BASE', '--out', join(tmp, 'b.json')], { encoding: 'utf8' });
    assert.notEqual(run.status, 0);
  });
});
