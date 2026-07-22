import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const output = process.env.OUTPUT_DIR ?? 'artifacts/pass29/browser';
const scenarioScript = new URL('./verify-pass29-environment.mjs', import.meta.url);
const scenarios = [
  { name: 'ordinary-blender', timeoutMs: 120_000 },
  { name: 'forced-performance', timeoutMs: 210_000 },
  { name: 'compatibility', timeoutMs: 120_000 },
];
await mkdir(output, { recursive: true });

function terminateGroup(child, signal) {
  if (!child.pid || process.platform === 'win32') {
    child.kill(signal);
    return;
  }
  try { process.kill(-child.pid, signal); } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function runScenario({ name, timeoutMs }) {
  console.log(`pass29-qa: isolated ${name}`);
  const child = spawn(process.execPath, [scenarioScript.pathname], {
    detached: process.platform !== 'win32',
    stdio: 'inherit',
    env: { ...process.env, OUTPUT_DIR: output, PASS29_SCENARIO: name },
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    terminateGroup(child, 'SIGTERM');
    setTimeout(() => terminateGroup(child, 'SIGKILL'), 5_000).unref();
  }, timeoutMs);
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);
  terminateGroup(child, 'SIGTERM');
  if (timedOut) throw new Error(`Pass 29 scenario ${name} exceeded ${timeoutMs}ms`);
  if (result.code !== 0) throw new Error(`Pass 29 scenario ${name} failed (code=${result.code}, signal=${result.signal})`);
}

const merged = {};
for (const item of scenarios) {
  await runScenario(item);
  const path = `${output}/verification-${item.name}.json`;
  Object.assign(merged, JSON.parse(await readFile(path, 'utf8')));
}
await writeFile(`${output}/verification.json`, `${JSON.stringify(merged, null, 2)}\n`);
console.log(JSON.stringify({ pass29Environment: 'ok', output, profiles: Object.keys(merged) }));
