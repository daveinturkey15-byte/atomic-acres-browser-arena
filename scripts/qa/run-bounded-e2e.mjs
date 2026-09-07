import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const groups = [
  { name: 'release-shell', args: ['tests/e2e/release-channel-chooser.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass25a-baseline', timeoutMs: 1_080_000, args: ['tests/e2e/pass25a-baseline.spec.ts', '--project=chromium', '--workers=1', '--grep-invert', 'neutralizes input on focus loss'] },
  { name: 'pointer-lock-headed', xvfb: true, args: ['tests/e2e/pass25a-baseline.spec.ts', '--project=chromium', '--workers=1', '--headed', '--grep', 'neutralizes input on focus loss'] },
  { name: 'pass25a-capability-chromium', args: ['tests/e2e/pass25a-capability.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'boot-and-authored', timeoutMs: 1_200_000, args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'boot and authored presentation', '--grep-invert', 'field kit for deployment'] },
  { name: 'field-kit-persistence', xvfb: true, args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--headed', '--grep', 'field kit for deployment'] },
  { name: 'solo-mechanics', timeoutMs: 900_000, args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'solo mechanics', '--grep-invert', 'resolves three player-selected sky missiles|normal frags'] },
  { name: 'tri-pass-support', args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'resolves three player-selected sky missiles'] },
  { name: 'grenade-hitch', args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'normal frags'] },
  { name: 'performance-and-stability', timeoutMs: 900_000, args: ['tests/e2e/atomic-acres.spec.ts', '--project=chromium', '--workers=1', '--grep', 'performance and stability'] },
  { name: 'pass34-contracts', timeoutMs: 900_000, args: ['tests/e2e/pass34-combat-menu-tower-range.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass35-contracts', timeoutMs: 900_000, args: ['tests/e2e/pass35-explosion-tri-pass.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass36-contracts', timeoutMs: 900_000, args: ['tests/e2e/pass36-range-atmosphere-windows-drops-leaderboard.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass37-contracts', timeoutMs: 900_000, args: ['tests/e2e/pass37-quality-bounds.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass69-mobile-controls', timeoutMs: 900_000, args: ['tests/e2e/pass69-mobile-touch-layout.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass69-3-ads-physical', timeoutMs: 900_000, args: ['tests/e2e/pass69-3-ads-physical-clearance.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass69-3-frame-hitch', timeoutMs: 900_000, args: ['tests/e2e/pass69-3-glass-m14-frame-hitch.spec.ts', 'tests/e2e/pass69-3-special-weapon-frame-hitch.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass72-corrections', default: false, timeoutMs: 600_000, args: ['tests/e2e/pass72-lobby-squad-reset.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass73-gameplay-regressions', default: false, timeoutMs: 600_000, args: ['tests/e2e/pass73-gameplay-regressions.spec.ts', 'tests/e2e/pass73-network-reveal-authority.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass74-chopper-hud', default: false, timeoutMs: 240_000, args: ['tests/e2e/pass74-chopper-hud.spec.ts', '--project=chromium', '--workers=1'] },
  // Boot gate for every arena the game can name. Deliberately in the DEFAULT
  // set: it was authored after a boot incident and then executed by nothing -
  // no npm script, no group here, neither workflow - for as long as it existed.
  // Opt-in was how it stayed dark, so it runs whenever the bounded suite runs
  // without an explicit selection. The per-arena test allows 240 s (SwiftShader
  // boot x 8 arenas); the group ceiling is the worst case plus headroom, so a
  // slow-but-passing run is never killed and reported as a boot failure.
  { name: 'pass74-arena-boot-smoke', timeoutMs: 2_100_000, args: ['tests/e2e/pass74-arena-boot-smoke.spec.ts', '--project=chromium', '--workers=1'] },
  // PASS 85 Lane N. tests/e2e/pass84-gamepad.spec.ts shipped with the gamepad +
  // aim-assist feature the owner asked for on 2026-08-31 and was executed by
  // NOTHING: no npm script, no group here, neither workflow. Six tests covering
  // pad connect/disconnect mid-match, HUD glyph swap, aim-assist near a staged
  // target vs open air, the no-assist guarantee for keyboard/mouse players,
  // pad-driven rebinding in Options, and the touch-overlay suppression on mobile.
  // Measured before wiring: 6/6 green in 5.0 min on installed Chrome headless with
  // a real WebGPU adapter, and re-checked green on bundled Chromium/SwiftShader
  // (the CI path) for one in-match and one lobby test. DEFAULT, for the reason
  // written on pass74-arena-boot-smoke below: opt-in is how a spec stays dark.
  { name: 'pass84-gamepad', timeoutMs: 900_000, args: ['tests/e2e/pass84-gamepad.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass74-selector-layout', default: false, timeoutMs: 420_000, args: ['tests/e2e/pass66-field-kit-killstreak-menu.spec.ts', '--project=chromium', '--workers=1', '--grep', 'previews the equipped streak on hover/focus without gameplay render ownership|uses poster-only demo mode for reduced motion and stacks cleanly at narrow width'] },
  { name: 'pass64-hud-contracts', default: false, timeoutMs: 900_000, args: ['tests/e2e/pass64-hud-menu.spec.ts', 'tests/e2e/pass65-menu-lifecycle.spec.ts', '--project=chromium', '--workers=1'] },
  { name: 'pass64-renderer-foundation', default: false, timeoutMs: 420_000, args: ['tests/e2e/pass64-renderer-foundation.spec.ts', '--project=chromium', '--workers=1'] },
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
