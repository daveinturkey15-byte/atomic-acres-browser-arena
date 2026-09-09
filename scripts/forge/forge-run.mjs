#!/usr/bin/env node
// PASS 0 one-command wrapper (HF-536 ART-FORGE-RULESET stage 0-7 orchestrator).
//
// Usage:
//   node scripts/forge/forge-run.mjs --label <pass-id> [--base <captureDir>]
//     [--cameras a,b] [--no-build] [--dry-run]
//
// --dry-run prints the stage plan and runs nothing heavy (no powercfg, no
// lock, no build, no browser). Do NOT run it heavy in the PASS 0 lane; prove
// it with --dry-run and unit tests of buildPlan().
//
// Stage 0 preflight mirrors root-build-capture.sh lines 11-27 in Node:
// powercfg High performance, >= 4 GiB free RAM, %TEMP%/aa-heavy.lock by
// mkdir, port 41931 not squatted. Any preflight failure exits 2 (void).
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(name);

export const HIGH_PERF_GUID = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
export const MIN_FREE_RAM_BYTES = 4 * 1024 * 1024 * 1024;
export const SERVE_PORT = 41931;
export const STAGES = ['preflight', 'build', 'capture', 'diff', 'fps', 'score', 'critic', 'scoreboard'];

// Pure: the full stage plan for a label. Unit-tested; --dry-run prints it.
export function buildPlan({ label, base = null, cameras = null, noBuild = false }) {
  if (!label) throw new Error('buildPlan needs --label <pass-id>');
  const dist = `dist-forge-${label}`;
  const captureOut = `artifacts/viewpoint-regression/${label}`;
  const cameraArgs = cameras && cameras.length ? ` --cameras ${cameras.join(',')}` : '';
  return {
    version: 1,
    label,
    base,
    cameras,
    dist,
    stages: [
      { stage: 0, name: 'preflight', runs: `powercfg check ${HIGH_PERF_GUID}; free RAM >= 4 GiB; mkdir %TEMP%/aa-heavy.lock; port ${SERVE_PORT} free` },
      { stage: 1, name: 'build', runs: noBuild ? '(skipped: --no-build)' : `npx vite build --outDir ${dist}`, skip: noBuild },
      { stage: 2, name: 'capture', runs: `node scripts/qa/capture-arena-viewpoints.mjs --label ${label} --sha <head> --arenas nuketown2 --samples 2 --serve-dist ${dist}${cameraArgs}` },
      { stage: 3, name: 'diff', runs: base ? `node scripts/qa/diff-arena-viewpoints.mjs --base ${base} --candidate ${captureOut}` : '(skipped: no --base)' , skip: !base },
      { stage: 4, name: 'fps', runs: 'node scripts/qa/measure-arena-fps.mjs --arenas nuketown2 --seconds 8' },
      { stage: 5, name: 'score', runs: `node scripts/forge/score-stations.mjs --candidate ${captureOut} --base ${base ?? '<base>'} --boxes scripts/forge/boxes.json --out docs/forge/${label}-score.json` },
      { stage: 6, name: 'critic', runs: '(external: Gemini 3.8 Flash first pass, then Opus deciding critic -> critic.json)' },
      { stage: 7, name: 'scoreboard', runs: `node scripts/forge/scoreboard.mjs --score docs/forge/${label}-score.json --sha <head> --label ${label} --verdict <keep-rule verdict> --at <ISO>` },
    ],
  };
}

export function checkPowerPlan(exec = execSync) {
  const out = String(exec('powershell -NoProfile -Command "powercfg /getactivescheme"', { encoding: 'utf8' }));
  if (!out.toLowerCase().includes(HIGH_PERF_GUID)) throw new Error('POWER-PLAN-FAIL: High performance not active');
  return out.trim();
}

export function checkFreeRam(osModule = null) {
  const free = osModule ? osModule.freemem() : null;
  if (free === null) throw new Error('RAM-CHECK-UNAVAILABLE');
  if (free < MIN_FREE_RAM_BYTES) throw new Error(`RAM-FAIL: ${(free / 2 ** 30).toFixed(2)} GiB < 4 GiB`);
  return free;
}

export function acquireHeavyLock(fs = null, lane = 'forge-run', port = SERVE_PORT) {
  const lock = join(tmpdir(), 'aa-heavy.lock');
  const f = fs ?? { mkdirSync, writeFileSync };
  f.mkdirSync(lock); // throws EEXIST when held: never delete another run's lock
  const owner = { lane, port, started: new Date().toISOString() };
  f.writeFileSync(join(lock, 'owner.json'), JSON.stringify(owner));
  return { lock, owner };
}

export function releaseHeavyLock() {
  const lock = join(tmpdir(), 'aa-heavy.lock');
  if (existsSync(lock)) rmSync(lock, { recursive: true, force: true });
}

export function checkServePort(exec = execSync, port = SERVE_PORT) {
  const cmd = `(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq ${port}} | Measure-Object).Count`;
  const out = String(exec(`powershell -NoProfile -Command "${cmd}"`, { encoding: 'utf8' }));
  const count = Number(out.replace(/\D/g, '') || '0');
  if (count !== 0) throw new Error(`PORT-${port}-SQUATTED (${count})`);
  return count;
}

function sh(cmd, cwd) {
  process.stdout.write(`[forge-run] $ ${cmd}\n`);
  execFileSync('cmd.exe', ['/d', '/s', '/c', cmd], { cwd, stdio: 'inherit', shell: false });
}

async function main() {
  const label = arg('--label');
  const base = arg('--base');
  const cameras = arg('--cameras', null)?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
  const noBuild = flag('--no-build');
  const dryRun = flag('--dry-run');
  let plan;
  try {
    plan = buildPlan({ label, base, cameras, noBuild });
  } catch (error) {
    process.stderr.write(`[forge-run] ERROR ${error.message}\n`);
    process.exit(2);
  }
  if (dryRun) {
    process.stdout.write(`[forge-run] DRY-RUN plan for --label ${label}\n`);
    for (const s of plan.stages) process.stdout.write(`  stage ${s.stage} ${s.name}: ${s.runs}${s.skip ? ' [SKIP]' : ''}\n`);
    process.stdout.write(`[forge-run] DRY-RUN complete: nothing heavy executed (no lock, no build, no browser)\n`);
    return;
  }
  // Stage 0: preflight. Any failure is void (exit 2), never green.
  try {
    checkPowerPlan();
    const { freemem } = await import('node:os');
    checkFreeRam({ freemem });
    acquireHeavyLock(null, `forge-run:${label}`, SERVE_PORT);
    checkServePort();
  } catch (error) {
    process.stderr.write(`[forge-run] PREFLIGHT-FAIL ${error.message}\n`);
    process.exit(2);
  }
  const repo = process.cwd();
  try {
    const head = execSync('git rev-parse --short HEAD', { cwd: repo, encoding: 'utf8' }).trim();
    if (!plan.stages[1].skip) sh(`npx vite build --outDir ${plan.dist}`, repo);
    const bundleAtStart = (() => {
      try {
        return String(execSync(`powershell -NoProfile -Command "(Get-Content ${plan.dist}/index.html -Raw | Select-String -Pattern 'legacy-main-[^\\"]+\\.js').Matches[0].Value"`, { cwd: repo, encoding: 'utf8' })).trim();
      } catch { return '(unresolved)'; }
    })();
    process.stdout.write(`[forge-run] HEAD ${head} bundle ${bundleAtStart}\n`);
    sh(`node scripts/qa/capture-arena-viewpoints.mjs --label ${label} --sha ${head} --arenas nuketown2 --samples 2 --serve-dist ${plan.dist}${cameras?.length ? ` --cameras ${cameras.join(',')}` : ''}`, repo);
    if (base) sh(`node scripts/qa/diff-arena-viewpoints.mjs --base ${base} --candidate artifacts/viewpoint-regression/${label}`, repo);
    sh('node scripts/qa/measure-arena-fps.mjs --arenas nuketown2 --seconds 8', repo);
    sh(`node scripts/forge/score-stations.mjs --candidate artifacts/viewpoint-regression/${label} --base ${base ?? '<base>'} --boxes scripts/forge/boxes.json --out docs/forge/${label}-score.json`, repo);
    process.stdout.write(`[forge-run] stages 0-5 done; stage 6 critic is external, stage 7 scoreboard after keep-rule verdict\n`);
  } finally {
    releaseHeavyLock();
    process.stdout.write('[forge-run] LOCK-RELEASED\n');
  }
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) await main();
