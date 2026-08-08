import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

const profiles = Object.freeze(['performance', 'blender', 'compat']);
const arenas = Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range']);
const snipers = Object.freeze(['sniper', 'm14-ebr', 'railgun']);
const timed = Object.freeze([
  Object.freeze({ weapon: 'flamethrower', arena: 'rustworks-1v1' }),
  Object.freeze({ weapon: 'flare-gun', arena: 'skyline-terminal' }),
]);
const scenarios = Object.freeze([
  ...profiles.flatMap((profile) => arenas.flatMap((arena) => snipers.map((weapon) => Object.freeze({ mode: 'sniper', weapon, arena, profile })))),
  ...profiles.flatMap((profile) => timed.map(({ weapon, arena }) => Object.freeze({ mode: 'timed', weapon, arena, profile }))),
]);

const artifactDirectory = resolve('artifacts/pass69-2/native-r4-r9');
const cellsDirectory = resolve(artifactDirectory, 'cells');
const aggregatePath = resolve(artifactDirectory, 'receipt.json');
rmSync(artifactDirectory, { recursive: true, force: true });
mkdirSync(cellsDirectory, { recursive: true });

const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
if (status) throw new Error('Pass 69.2 native R4/R9 gate requires a completely clean worktree');
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceRevision)) throw new Error(`Invalid source revision ${sourceRevision}`);
const cli = resolve('node_modules/@playwright/test/cli.js');
const receipts = [];

for (const [index, scenario] of scenarios.entries()) {
  const cellId = [scenario.mode, scenario.weapon, scenario.arena, scenario.profile].join('-');
  const receiptPath = resolve(cellsDirectory, `${cellId}.json`);
  const previewPort = String(4560 + index);
  console.log(JSON.stringify({ pass69NativeCell: 'START', cell: index + 1, total: scenarios.length, cellId, previewPort }));
  const result = spawnSync(process.execPath, [
    cli, 'test', 'tests/e2e/pass69-2-native-r4-r9-cell.spec.ts',
    '--project=chromium', '--workers=1', '--retries=0', '--headed',
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      QA_EXTERNAL_PREVIEW: '0',
      QA_REQUIRE_OWNED_FRESH_PREVIEW: '1',
      QA_INSTALLED_EDGE: '1',
      QA_HEADED_EDGE: '1',
      QA_PREVIEW_PORT: previewPort,
      PASS69_NATIVE_MODE: scenario.mode,
      PASS69_NATIVE_WEAPON: scenario.weapon,
      PASS69_NATIVE_ARENA: scenario.arena,
      PASS69_NATIVE_PROFILE: scenario.profile,
      PASS69_NATIVE_SOURCE_SHA: sourceRevision,
      PASS69_NATIVE_CELL_ID: cellId,
    },
    stdio: 'inherit',
    windowsHide: false,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Pass 69.2 native cell ${cellId} terminated by ${result.signal}`);
  if ((result.status ?? 1) !== 0) {
    rmSync(aggregatePath, { force: true });
    throw new Error(`Pass 69.2 native cell ${cellId} failed with exit ${result.status ?? 1}`);
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  const validCycle = (cycle) => cycle
    && ['cold', 'warm'].includes(cycle.cycle)
    && Number.isFinite(cycle.actionDurationMs)
    && cycle.timing?.frames > 8
    && cycle.timing?.maxGapMs < 1_300
    && cycle.after?.runtime?.actualBackend === 'webgpu'
    && cycle.after?.runtime?.softwareAdapter === false
    && cycle.after?.runtime?.deviceLost === false
    && cycle.after?.runtime?.uncapturedErrors === 0
    && cycle.after?.presentation?.status === 'healthy'
    && cycle.after?.presentation?.completionFailures === 0;
  if (receipt.schema !== 'atomic-acres/pass69-2-native-edge-webgpu-r4-r9-cell@1'
    || receipt.verdict !== 'pass'
    || receipt.sourceRevision !== sourceRevision
    || receipt.cellId !== cellId
    || receipt.mode !== scenario.mode
    || receipt.weapon !== scenario.weapon
    || receipt.arena !== scenario.arena
    || receipt.profile !== scenario.profile
    || receipt.browser?.channel !== 'msedge'
    || receipt.browser?.headless !== false
    || !Array.isArray(receipt.cycles)
    || receipt.cycles.length !== 2
    || receipt.cycles[0]?.cycle !== 'cold'
    || receipt.cycles[1]?.cycle !== 'warm'
    || !receipt.cycles.every(validCycle)
    || receipt.pageErrors?.length !== 0
    || receipt.consoleErrors?.length !== 0) {
    rmSync(receiptPath, { force: true });
    rmSync(aggregatePath, { force: true });
    throw new Error(`Pass 69.2 native cell ${cellId} emitted an invalid or stale receipt`);
  }
  receipts.push(receipt);
  console.log(JSON.stringify({ pass69NativeCell: 'PASS', cell: index + 1, total: scenarios.length, cellId }));
}

const endingRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const endingStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
if (endingRevision !== sourceRevision || endingStatus) {
  rmSync(aggregatePath, { force: true });
  throw new Error('Pass 69.2 native R4/R9 gate source changed during execution');
}
const sniperCells = receipts.filter((entry) => entry.mode === 'sniper');
const timedCells = receipts.filter((entry) => entry.mode === 'timed');
if (receipts.length !== 42 || sniperCells.length !== 36 || timedCells.length !== 6) {
  rmSync(aggregatePath, { force: true });
  throw new Error(`Pass 69.2 native R4/R9 coverage mismatch ${receipts.length}/${sniperCells.length}/${timedCells.length}`);
}
writeFileSync(aggregatePath, `${JSON.stringify({
  schema: 'atomic-acres/pass69-2-native-edge-webgpu-r4-r9@1',
  verdict: 'pass',
  checkedAt: new Date().toISOString(),
  sourceRevision,
  browser: { channel: 'msedge', headless: false, versions: [...new Set(receipts.map((entry) => entry.browser.version))] },
  renderer: { requested: 'webgpu', actual: 'webgpu', softwareAdapter: false },
  profiles,
  arenas,
  sniperWeapons: snipers,
  timedWeapons: timed,
  thresholds: { actionProgressStallMs: 1_300, adsEntryMs: 2_500, dwellMs: 1_200 },
  coverage: { totalCells: receipts.length, sniperCells: sniperCells.length, timedCells: timedCells.length, cycles: receipts.length * 2 },
  cells: receipts.map((entry) => ({
    cellId: entry.cellId, mode: entry.mode, weapon: entry.weapon, arena: entry.arena, profile: entry.profile,
    receipt: `artifacts/pass69-2/native-r4-r9/cells/${entry.cellId}.json`,
  })),
}, null, 2)}\n`);
console.log(JSON.stringify({ pass69NativeR4R9: 'PASS', sourceRevision, receiptPath: aggregatePath, cells: receipts.length }));
