#!/usr/bin/env node
// Wait for a QUIET machine before a frame-time measurement, then run the
// given command. Shared workstation: other lanes build, type-check and run
// their own headless browsers beside this one, and a frame-time number taken
// while a tsc or a second Chrome is running is not a number (measured
// 2026-09-02: the same build read 39 fps quiet and 32 fps beside a tsc run).
//
// Quiet = total CPU below --cpu-max (default 35%) for --stable consecutive
// samples 2 s apart AND at least --gpu-free-mib (default 3000) free.
//
// Usage: node scripts/qa/hf399-quiet-window.mjs [--cpu-max 35] [--stable 3]
//          [--timeout-min 20] -- <command...>
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const options = split >= 0 ? argv.slice(0, split) : argv;
const command = split >= 0 ? argv.slice(split + 1) : [];
const arg = (name, fallback) => { const index = options.indexOf(name); return index >= 0 && options[index + 1] ? options[index + 1] : fallback; };
const CPU_MAX = Number(arg('--cpu-max', '35'));
const STABLE = Number(arg('--stable', '3'));
const TIMEOUT_MIN = Number(arg('--timeout-min', '20'));
const GPU_FREE_MIB = Number(arg('--gpu-free-mib', '3000'));
if (command.length === 0) throw new Error('Pass the command after --');

const cpuPercent = () => {
  const result = spawnSync('powershell', ['-NoProfile', '-Command',
    "(Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 2 -MaxSamples 1).CounterSamples[0].CookedValue"],
  { encoding: 'utf8', windowsHide: true });
  const value = Number.parseFloat(result.stdout.trim());
  return Number.isFinite(value) ? value : 100;
};
const gpuFreeMib = () => {
  const result = spawnSync('nvidia-smi', ['--query-gpu=memory.used,memory.total', '--format=csv,noheader,nounits'], { encoding: 'utf8', windowsHide: true });
  const [used, total] = result.stdout.trim().split(',').map((entry) => Number.parseInt(entry, 10));
  return Number.isFinite(used) && Number.isFinite(total) ? total - used : 0;
};

const deadline = Date.now() + TIMEOUT_MIN * 60_000;
let stable = 0;
while (Date.now() < deadline) {
  const cpu = cpuPercent();
  const gpu = gpuFreeMib();
  const quiet = cpu <= CPU_MAX && gpu >= GPU_FREE_MIB;
  stable = quiet ? stable + 1 : 0;
  console.error(`[quiet] cpu ${cpu.toFixed(0)}% gpu-free ${gpu} MiB -> ${quiet ? `quiet ${stable}/${STABLE}` : 'busy'}`);
  if (stable >= STABLE) break;
  if (!quiet) await new Promise((wake) => setTimeout(wake, 8_000));
}
if (stable < STABLE) {
  console.error(`[quiet] machine never went quiet within ${TIMEOUT_MIN} min; refusing to measure`);
  process.exit(3);
}
console.error(`[quiet] running: ${command.join(' ')}`);
const executable = process.platform === 'win32' && (command[0] === 'npm' || command[0] === 'npx') ? `${command[0]}.cmd` : command[0];
const run = spawnSync(executable, command.slice(1), { stdio: 'inherit', windowsHide: true });
process.exit(run.status ?? 1);
