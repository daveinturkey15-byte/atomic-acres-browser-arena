// Owner 2026-08-29: verify the RUNTIME camera eye-clearance resolve at every
// spot the analytic sweep flagged. The sweep traces from the authored eye
// seat; this script teleports the real player there (matching stance), lets
// the camera seat settle, reads the ACTUAL camera position, and re-traces the
// sweep's probe fan from it. A spot passes when no shot surface remains
// within PROBE_M of the real camera.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolveArenaRoster } from './eye-clearance-roster.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', 'http://127.0.0.1:41975');
const PROBE_M = Number(arg('--probe', '0.15'));
// Owner 2026-08-31: this was a hand-written FOUR-id list - narrower even than
// the five the live sweep measured, silently dropping rustworks-1v1 on top of
// test1/test2. Derived from the same source as the other two stages now.
const ROSTER = resolveArenaRoster(arg('--arenas', null));
const ARENAS = ROSTER.ids;
console.log(`[eye-clearance] runtime verifier roster (${ARENAS.length}): ${ARENAS.join(', ')}`);

const browser = await chromium.launch({
  headless: false, channel: 'chrome',
  args: ['--mute-audio', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const summary = [];
const missingSweep = [];
for (const arena of ARENAS) {
  let violations;
  try {
    violations = JSON.parse(readFileSync(`artifacts/qa/eye-clearance/${arena}-violations.json`, 'utf8')).violations;
  } catch {
    // A missing stage-2 artifact is NOT "nothing to verify". It means the live
    // sweep never covered this arena, which is exactly the hole this file was
    // on the wrong side of until 2026-08-31. Recorded and reported, not skipped.
    missingSweep.push(arena);
    continue;
  }
  if (!violations.length) { summary.push({ arena, sweep: 0, remaining: 0 }); continue; }
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=eyeverify&previewTime=0`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snap.matchPhase === 'active' && snap.gameStarted === true;
  }, undefined, { timeout: 300_000 });
  await page.waitForTimeout(1500);

  const result = await page.evaluate(async ({ rows, probe, arenaId }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const remaining = [];
    let checked = 0;
    const STANCE_EYE = { stand: 1.7, crouch: 1.16, prone: 0.61 };
    for (const row of rows) {
      debug.setStanceForQa('stand');
      // Teleport as STANDING with the feet where the spot's feet are, THEN
      // change stance - teleporting a standing body to a prone eye height
      // buries the capsule and the stance machine refuses.
      debug.teleportPlayer(row.x, row.eyeY + (STANCE_EYE.stand - STANCE_EYE[row.stance]), row.z, 0, 0);
      await frame();
      // A previous row can leave the machine stuck prone somewhere it could
      // not stand; recover at the NEW location before taking the target.
      debug.setStanceForQa('stand');
      await frame();
      const stance = debug.setStanceForQa(row.stance);
      await frame();
      await frame();
      if (stance !== row.stance) {
        remaining.push({ ...row, note: `stance-blocked:${stance}` });
        continue;
      }
      checked += 1;
      const seat = debug.cameraSeat();
      const yaw = Math.atan2(row.dir[0], row.dir[2]);
      const dirs = [
        [Math.sin(yaw), 0, Math.cos(yaw)],
        [Math.sin(yaw + 0.6), 0, Math.cos(yaw + 0.6)],
        [Math.sin(yaw - 0.6), 0, Math.cos(yaw - 0.6)],
        [Math.sin(yaw) * 0.8, 0.6, Math.cos(yaw) * 0.8],
        [Math.sin(yaw) * 0.8, -0.6, Math.cos(yaw) * 0.8],
        [0, 1, 0],
        [row.dir[0], row.dir[1], row.dir[2]],
      ];
      let worst = null;
      for (const dir of dirs) {
        let trace;
        try { trace = debug.traceBallistics('carbine', seat, dir, probe, arenaId); } catch { continue; }
        const impact = trace?.impacts?.[0];
        if (impact || trace?.stoppedBy) {
          const distance = impact?.entryDistance ?? impact?.distance ?? 0;
          if (!worst || distance < worst.distance) {
            worst = { distance: Math.round(distance * 1000) / 1000, surface: impact?.surface?.name ?? trace?.stoppedBy?.name ?? null, dir };
          }
        }
      }
      if (worst) remaining.push({ ...row, runtime: worst, seat: seat.map((v) => Math.round(v * 1000) / 1000), resolve: debug.lastEyeClearance() });
    }
    return { checked, remaining };
  }, { rows: violations, probe: PROBE_M, arenaId: arena });

  console.log(`${arena.padEnd(18)} sweep=${violations.length} checked=${result.checked} REMAINING=${result.remaining.length}`);
  for (const row of result.remaining) console.log('  ', JSON.stringify(row));
  summary.push({ arena, sweep: violations.length, remaining: result.remaining.length });
}
console.log('SUMMARY', JSON.stringify(summary));
await browser.close();

if (missingSweep.length > 0) {
  console.error(
    `[eye-clearance] no stage-2 violations artifact for ${missingSweep.join(', ')} - `
    + 'run scripts/qa/sweep-eye-clearance-live.mjs over the full roster first. '
    + 'An unswept arena is uncovered, not clean.',
  );
  process.exit(1);
}
