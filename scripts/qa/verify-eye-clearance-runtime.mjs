// Owner 2026-08-29: verify the RUNTIME camera eye-clearance resolve at every
// spot the analytic sweep flagged. The sweep traces from the authored eye
// seat; this script teleports the real player there (matching stance), lets
// the camera seat settle, reads the ACTUAL camera position, and re-traces the
// sweep's probe fan from it. A spot passes when no shot surface remains
// within PROBE_M of the real camera.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  partitionAnnotatedViolations, readLedger, resolveArenaRoster,
} from './eye-clearance-roster.mjs';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// Lane J 2026-09-02: same bug the live sweep was fixed for on 2026-08-31, still
// sitting in stage 3. This defaulted to a fixed 41975 while
// run-with-preview-server.mjs defaults to 4180 and exports QA_BASE_URL to its
// child, so the stage could not be run by the runner that starts its server -
// every invocation without an explicit --url died on ERR_CONNECTION_REFUSED
// before teleporting to a single spot. Follow the server the runner started.
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:41975');
const PROBE_M = Number(arg('--probe', '0.15'));
// Owner 2026-08-31: this was a hand-written FOUR-id list - narrower even than
// the five the live sweep measured, silently dropping rustworks-1v1 on top of
// test1/test2. Derived from the same source as the other two stages now.
const ROSTER = resolveArenaRoster(arg('--arenas', null));
const ARENAS = ROSTER.ids;
const LEDGER = readLedger();
console.log(`[eye-clearance] runtime verifier roster (${ARENAS.length}): ${ARENAS.join(', ')}`);

/**
 * The camera's REAL near plane, read from the shipped camera construction.
 *
 * Lane J 2026-09-02. Until now stage 3 printed REMAINING and returned 0
 * regardless, so it carried no verdict: `qa:eye-clearance` did not even invoke
 * it, and the ledger's claim that "every remaining runtime row clears the bare
 * near plane" was prose nobody could fail. `--check` now asserts exactly that
 * claim, at the one threshold that is not a matter of taste: below the near
 * plane the player literally sees through the surface.
 *
 * Scraped rather than hardcoded, and it throws instead of guessing, because a
 * frozen copy of a value that lives somewhere else is how every other stale
 * roster in this pipeline started. This is a floor for judging, never a new
 * budget: the 0.15 m probe radius the sweep and the runtime resolve share is
 * still the target, and rows between 0.08 and 0.15 stay visible in the log.
 */
function cameraNearPlaneM() {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(resolvePath(here, '../../src/legacy-main.ts'), 'utf8');
  const match = /const camera = new THREE\.PerspectiveCamera\(\s*[\d.]+,\s*[\d.]+,\s*([\d.]+),/u.exec(source);
  if (!match) {
    throw new Error(
      'eye-clearance stage 3: could not read the player camera near plane from src/legacy-main.ts. '
      + 'Refusing to judge runtime clearance against a guessed threshold.',
    );
  }
  return Number(match[1]);
}

const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: [...SILENT_ARGS,
      '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
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
  // `unannotated: []` is not decoration: the --check loop walks it on EVERY
  // summary row, and an arena stage 2 found clean is exactly the row that
  // reaches this branch. Omit it and the verdict throws on the clean case.
  if (!violations.length) { summary.push({ arena, sweep: 0, remaining: 0, unannotated: [], unverified: [] }); continue; }
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

  // A remaining row on an annotated surface is design-exempt at runtime too -
  // resolveEyeClearance deliberately declines to push the camera out of a
  // walk-through fixture (measured pushedM 0 on every wallbang row). Same named
  // annotations stage 2 uses, so the two stages cannot disagree about what is
  // forgiven.
  const partition = partitionAnnotatedViolations(LEDGER, arena, result.remaining);
  // A `stance-blocked` row carries NO runtime probe: the stance machine refused
  // the target stance at that spot, so nothing was measured there. It must not
  // be folded into the distance verdict - reading a missing measurement as
  // `distance 0` reports the worst possible clip at a seat the player could not
  // even take, which is the same "unreachable spot reported as a clip" mistake
  // that produced 51 of this pass's red rows. It is UNVERIFIED, and it is
  // printed as such rather than being silently dropped.
  const measured = partition.unannotated.filter((row) => row.runtime);
  const unverified = partition.unannotated.filter((row) => !row.runtime);
  console.log(
    `${arena.padEnd(18)} sweep=${violations.length} checked=${result.checked}`
    + ` REMAINING=${result.remaining.length} (unannotated ${partition.unannotated.length},`
    + ` measured ${measured.length}, unverified ${unverified.length})`,
  );
  for (const row of result.remaining) console.log('  ', JSON.stringify(row));
  summary.push({
    arena,
    sweep: violations.length,
    remaining: result.remaining.length,
    unannotated: measured.map((row) => ({
      distance: row.runtime.distance,
      surface: row.runtime.surface ?? row.surface,
      stance: row.stance,
      seat: row.seat,
    })),
    unverified: unverified.map((row) => ({
      surface: row.surface,
      stance: row.stance,
      sweepDistance: row.distance,
      note: row.note ?? 'no runtime probe was taken at this row',
    })),
  });
}
console.log('SUMMARY', JSON.stringify(summary));
await browser.close();

let failed = false;
if (missingSweep.length > 0) {
  console.error(
    `[eye-clearance] no stage-2 violations artifact for ${missingSweep.join(', ')} - `
    + 'run scripts/qa/sweep-eye-clearance-live.mjs over the full roster first. '
    + 'An unswept arena is uncovered, not clean.',
  );
  failed = true;
}

if (argv.includes('--check')) {
  const nearPlaneM = cameraNearPlaneM();
  console.log(`[eye-clearance] runtime verdict floor = the shipped camera near plane, ${nearPlaneM} m`);
  // Coverage before verdict, the same way stage 2 does it: a stage that only
  // judges the arenas that happened to run can never notice the ones it missed.
  const judged = new Set(summary.map((row) => row.arena));
  for (const arena of ROSTER.full) {
    if (!judged.has(arena)) {
      console.error(`[eye-clearance] ${arena} is selectable but stage 3 produced no row - no verdict is possible`);
      failed = true;
    }
  }
  for (const row of summary) {
    // Reported, never judged, and never silent: stage 3's stance machine can
    // refuse a stance at a spot (order-dependent - a previous row can leave it
    // somewhere it could not stand), and those rows carry no measurement.
    for (const skipped of row.unverified ?? []) {
      console.warn(
        `[eye-clearance] ${row.arena}: UNVERIFIED row on ${skipped.surface} (${skipped.stance},`
        + ` sweep d=${skipped.sweepDistance}) - ${skipped.note}. Stage 3 measured nothing here;`
        + ' it is neither clean nor a clip.',
      );
    }
    for (const remaining of row.unannotated) {
      if (remaining.distance < nearPlaneM) {
        console.error(
          `[eye-clearance] ${row.arena}: the REAL camera seat ${JSON.stringify(remaining.seat)} sits`
          + ` ${remaining.distance} m from ${remaining.surface} (${remaining.stance}), inside the`
          + ` ${nearPlaneM} m near plane. The player sees through that surface after the runtime`
          + ' resolve has already had its say. Fix the geometry - the resolve is the backstop, not the answer.',
        );
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
