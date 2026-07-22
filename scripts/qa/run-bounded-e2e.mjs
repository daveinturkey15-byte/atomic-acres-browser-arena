import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const groups = [
  { name: 'pass25a-baseline', timeoutMs: 900_000, args: ['tests/e2e/pass25a-baseline.spec.ts', '--project=chromium', '--workers=1', '--grep-invert', 'neutralizes input on focus loss'] },
  { name: 'pointer-lock-headed', xvfb: true, args: ['tests/e2e/pass25a-baseline.spec.ts', '--project=chromium', '--workers=1', '--headed', '--grep', 'neutralizes input on focus loss'] },
  { name: 'pass25a-capability-chromium', args: ['tests/e2e/pass25a-capability.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'boot-and-authored', timeoutMs: 480_000, args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'boot and authored presentation', '--grep-invert', 'field kit for deployment'] },
  { name: 'field-kit-persistence', xvfb: true, args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--headed', '--grep', 'field kit for deployment'] },
  { name: 'solo-mechanics', timeoutMs: 900_000, args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'solo mechanics', '--grep-invert', 'resolves three player-selected sky missiles|prewarmed Hallelujah explosion'] },
  { name: 'tri-pass-support', args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'resolves three player-selected sky missiles'] },
  { name: 'grenade-hitch', args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'prewarmed Hallelujah explosion'] },
  { name: 'performance-and-stability', timeoutMs: 900_000, args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'performance and stability'] },
  { name: 'pass34-contracts', timeoutMs: 900_000, args: ['tests/e2e/pass34-combat-menu-tower-range.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass35-contracts', timeoutMs: 900_000, args: ['tests/e2e/pass35-explosion-tri-pass.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass36-contracts', timeoutMs: 900_000, args: ['tests/e2e/pass36-range-atmosphere-windows-drops-leaderboard.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass37-contracts', timeoutMs: 900_000, args: ['tests/e2e/pass37-quality-bounds.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'capability-firefox', default: false, xvfb: true, args: ['tests/e2e/pass25a-capability.spec.ts', '--project=firefox', '--workers=1', '--headed'] },
  { name: 'capability-webkit', default: false, args: ['tests/e2e/pass25a-capability.spec.ts', '--project=webkit-smoke', '--workers=1'] },
];

const requestedGroups = new Set((process.env.QA_E2E_GROUPS ?? '').split(',').map((name) => name.trim()).filter(Boolean));
const selectedGroups = requestedGroups.size > 0
  ? groups.filter((group) => requestedGroups.has(group.name))
  : groups.filter((group) => group.default !== false);
if (requestedGroups.size > 0 && selectedGroups.length !== requestedGroups.size) {
  const known = groups.map((group) => group.name).join(', ');
  throw new Error(`Unknown QA_E2E_GROUPS entry. Known groups: ${known}`);
}
if (selectedGroups.length === 0) throw new Error('No QA E2E groups selected.');

for (const group of selectedGroups) {
  console.log(`\n=== bounded e2e: ${group.name} ===`);
  const playwrightCli = resolve('node_modules/@playwright/test/cli.js');
  const useVirtualDisplay = Boolean(group.xvfb && process.platform !== 'win32' && !process.env.DISPLAY);
  const command = useVirtualDisplay ? 'xvfb-run' : process.execPath;
  const args = useVirtualDisplay
    ? ['-a', process.execPath, playwrightCli, 'test', ...group.args, '--retries=0']
    : [playwrightCli, 'test', ...group.args, '--retries=0'];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
    timeout: group.timeoutMs ?? 240_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    console.error(`${group.name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${group.name}: exited ${result.status ?? 'without status'}`);
    process.exit(result.status ?? 1);
  }
}

console.log(`\n${JSON.stringify({ boundedE2E: 'ok', groups: selectedGroups.map((group) => group.name) })}`);
