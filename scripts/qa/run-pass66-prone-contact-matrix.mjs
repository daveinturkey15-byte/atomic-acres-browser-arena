import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const artifactRoot = resolve(root, 'artifacts/pass66/prone-contact-matrix');
const receiptPath = resolve(artifactRoot, 'receipt.json');
const receiptTempPath = `${receiptPath}.tmp`;
const profiles = ['performance', 'blender', 'compat'];
const phases = ['solo', 'multiplayer'];
const arenas = ['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range'];
const renderer = process.env.PASS66_PRONE_CONTACT_RENDERER ?? 'webgl2';
const basePeerPort = Number(process.env.PASS66_PRONE_CONTACT_PEER_PORT ?? '9071');
const basePreviewPort = Number(process.env.QA_PREVIEW_PORT ?? '4524');
mkdirSync(artifactRoot, { recursive: true });
rmSync(receiptPath, { force: true });
rmSync(receiptTempPath, { force: true });
for (const profile of profiles) {
  rmSync(resolve(artifactRoot, `receipt-${profile}.json`), { force: true });
  for (const phase of phases) {
    rmSync(resolve(artifactRoot, `receipt-${profile}-${phase}.json`), { force: true });
    for (const arena of arenas) {
      rmSync(resolve(artifactRoot, `receipt-${profile}-${phase}-${arena}.json`), { force: true });
      rmSync(resolve(artifactRoot, `receipt-${profile}-${phase}-${arena}.json.tmp`), { force: true });
    }
  }
}

const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
if (dirty) throw new Error('Pass 66 prone contact matrix requires a completely clean worktree');
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) throw new Error(`Invalid candidate source SHA ${sourceSha}`);

const cellReceipts = [];
let exitStatus = 0;
let processIndex = 0;
outer: for (const profile of profiles) {
  for (const phase of phases) {
    for (const arena of arenas) {
      const result = spawnSync(process.execPath, [
        resolve('node_modules/@playwright/test/cli.js'),
        'test',
        'tests/e2e/pass66-prone-contact-matrix.spec.ts',
        '--project=chromium',
        '--workers=1',
        '--retries=0',
        '--grep',
        phase === 'solo' ? 'keeps prone hip' : 'replicates both peers',
      ], {
        cwd: root,
        env: {
          ...process.env,
          PASS66_PRONE_CONTACT_MATRIX: '1',
          PASS66_PRONE_CONTACT_SOURCE_SHA: sourceSha,
          PASS66_PRONE_CONTACT_RENDERER: renderer,
          PASS66_PRONE_CONTACT_PROFILE: profile,
          PASS66_PRONE_CONTACT_PHASE: phase,
          PASS66_PRONE_CONTACT_ARENA: arena,
          PASS66_PRONE_CONTACT_PEER_PORT: String(basePeerPort + processIndex),
          QA_INSTALLED_EDGE: '1',
          QA_EXTERNAL_PREVIEW: '0',
          QA_REQUIRE_OWNED_FRESH_PREVIEW: '1',
          QA_PREVIEW_PORT: String(basePreviewPort + processIndex),
        },
        stdio: 'inherit',
        windowsHide: true,
      });
      processIndex += 1;
      if (result.error) throw result.error;
      if (result.signal) throw new Error(`Pass 66 prone contact ${profile}/${phase}/${arena} process terminated by ${result.signal}`);
      if (result.status !== 0) {
        exitStatus = result.status ?? 1;
        break outer;
      }
      const cellReceiptPath = resolve(artifactRoot, `receipt-${profile}-${phase}-${arena}.json`);
      const receipt = JSON.parse(readFileSync(cellReceiptPath, 'utf8'));
      const expectedSolo = phase === 'solo' ? 1 : 0;
      const expectedMultiplayer = phase === 'multiplayer' ? 1 : 0;
      if (receipt.status !== 'PASS' || receipt.sourceSha !== sourceSha || receipt.renderer !== renderer
        || receipt.contract?.soloCells !== expectedSolo || receipt.contract?.twoPeerCells !== expectedMultiplayer
        || receipt.contract?.renderProfiles?.length !== 1 || receipt.contract.renderProfiles[0] !== profile
        || receipt.contract?.arenas?.length !== 1 || receipt.contract.arenas[0] !== arena
        || receipt.contract?.browserProcessIsolation !== 'single-render-profile-phase-and-arena') {
        throw new Error(`Invalid Pass 66 prone contact ${profile}/${phase}/${arena} receipt ${JSON.stringify({
          status: receipt.status,
          sourceSha: receipt.sourceSha,
          renderer: receipt.renderer,
          contract: receipt.contract,
        })}`);
      }
      cellReceipts.push({ profile, phase, arena, receipt });
    }
  }
}

if (exitStatus === 0 && cellReceipts.length === profiles.length * phases.length * arenas.length) {
  const finalDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const finalSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (finalDirty || finalSha !== sourceSha) throw new Error('Pass 66 prone contact runner detected source drift');
  const solo = cellReceipts.flatMap(({ receipt }) => receipt.solo);
  const multiplayer = cellReceipts.flatMap(({ receipt }) => receipt.multiplayer);
  if (solo.length !== 12 || multiplayer.length !== 12) {
    throw new Error(`Pass 66 prone contact aggregate expected 12+12 cells; received ${solo.length}+${multiplayer.length}`);
  }
  const receipt = {
    schema: 'atomic-acres/pass66-prone-contact-matrix@2',
    status: 'PASS',
    sourceSha,
    generatedAt: new Date().toISOString(),
    renderer,
    contract: {
      arenas,
      renderProfiles: profiles,
      browserProcessIsolation: 'one fresh installed-Edge process per render profile, phase, and arena cell',
      soloCells: solo.length,
      twoPeerCells: multiplayer.length,
      fixtureDiscovery: cellReceipts[0].receipt.contract.fixtureDiscovery,
      actions: cellReceipts[0].receipt.contract.actions,
      peers: cellReceipts[0].receipt.contract.peers,
      receiptPolicy: 'cell receipts atomically written after each gate; aggregate written only after all 24 fresh processes pass',
    },
    cellReceipts: cellReceipts.map(({ profile, phase, arena, receipt }) => ({
      renderProfile: profile,
      phase,
      arena,
      generatedAt: receipt.generatedAt,
      soloCells: receipt.contract.soloCells,
      twoPeerCells: receipt.contract.twoPeerCells,
    })),
    solo,
    multiplayer,
  };
  writeFileSync(receiptTempPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  renameSync(receiptTempPath, receiptPath);
} else {
  rmSync(receiptPath, { force: true });
  rmSync(receiptTempPath, { force: true });
}
process.exitCode = exitStatus || (cellReceipts.length === profiles.length * phases.length * arenas.length ? 0 : 1);
