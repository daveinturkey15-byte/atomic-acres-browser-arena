import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import sharp from 'sharp';

const SCRIPT = join(process.cwd(), 'scripts', 'qa', 'measure-nuketown2-shadow-shaping.mjs');

function runNode(args, cwd = process.cwd()) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function splitImage(low, high) {
  const data = Buffer.alloc(10 * 10 * 3);
  for (let i = 0; i < data.length; i += 3) {
    const value = i / 3 < 50 ? low : high;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }
  return sharp(data, { raw: { width: 10, height: 10, channels: 3 } }).png().toBuffer();
}

test('synthetic pixels prove key contrast and shade fraction for ground and all-surface splits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aa-shadow-shaping-'));
  try {
    const ours = join(root, 'ours');
    const boards = join(root, 'boards');
    const out = join(root, 'result.json');
    const station = 'fixture-fixture-station';
    await Promise.all([mkdir(ours), mkdir(boards)]);
    await Promise.all([
      sharp(await splitImage(10, 100)).toFile(join(ours, `${station}.png`)),
      sharp(await splitImage(20, 200)).toFile(join(boards, 'fixture-station.target.png')),
    ]);
    const boxes = {
      frame: { width: 1280, height: 720 },
      stations: {
        [station]: {
          boxes: [
            { kind: 'ground', name: 'ground', rect: [0, 0, 1280, 720] },
            { kind: 'wall', name: 'wall', rect: [0, 0, 1280, 720] },
          ],
        },
      },
    };
    const boxesPath = join(root, 'boxes.json');
    await writeFile(boxesPath, JSON.stringify(boxes));
    const result = await runNode([
      '--arena', 'fixture', '--boxes', boxesPath, '--ours', ours, '--boards', boards, '--out', out,
    ]);
    assert.equal(result.code, 0, result.stderr);
    const parsed = JSON.parse(await readFile(out, 'utf8'));
    assert.deepEqual(parsed.boxCounts, { ground: 1, allSurface: 2, selected: 2 });
    assert.deepEqual(parsed.meanOverStations.ground, {
      oursKeyContrast: 10, boardKeyContrast: 10, oursShadeFraction: 0.5, boardShadeFraction: 0.5,
    });
    assert.deepEqual(parsed.meanOverStations.allSurface, {
      oursKeyContrast: 10, boardKeyContrast: 10, oursShadeFraction: 0.5, boardShadeFraction: 0.5,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
