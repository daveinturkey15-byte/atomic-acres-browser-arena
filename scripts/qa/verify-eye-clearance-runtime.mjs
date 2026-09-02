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
  forcedProbesForArena, partitionAnnotatedViolations, readLedger, resolveArenaRoster,
  unverifiedCeilingFor,
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
  // Lane J repair 2026-09-02: forced probes are measured even when stage 2 is
  // clean here. Stage 3 used to visit only the spots stage 2 flagged, so an
  // arena whose ANALYTIC clearance was fixed lost its runtime coverage at the
  // same moment - the pipeline stopped looking at skyline-terminal's nacelles
  // on the very run that moved them. See `forcedProbes` in the ledger.
  const forcedRows = forcedProbesForArena(LEDGER, arena);
  // `unannotated: []` is not decoration: the --check loop walks it on EVERY
  // summary row, and an arena stage 2 found clean is exactly the row that
  // reaches this branch. Omit it and the verdict throws on the clean case.
  if (!violations.length && forcedRows.length === 0) {
    summary.push({ arena, sweep: 0, remaining: 0, unannotated: [], unverified: [], forced: [] });
    continue;
  }
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

  const result = await page.evaluate(async ({ rows, forced, probe, arenaId }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const STANCE_EYE = { stand: 1.7, crouch: 1.16, prone: 0.61 };
    // Lane J repair 2026-09-02. `teleportPlayer` sets the EYE and clears
    // grounding, so the body then falls and depenetrates for as long as that
    // takes. The old code read `cameraSeat()` four frames later and wrote down
    // whatever it found - which is how two of this lane's own nacelle captures
    // recorded a "prone" seat at y 1.66, about 0.04 m below the 1.7 m teleport
    // height: a camera photographed mid-fall, a metre above the stance it
    // claimed. A seat is only a measurement once the body has stopped moving.
    const SETTLE_WINDOW = 10;
    const SETTLE_RANGE_M = 0.01;
    const SETTLE_MAX_FRAMES = 150;
    const settle = async () => {
      const recent = [];
      for (let index = 0; index < SETTLE_MAX_FRAMES; index += 1) {
        await frame();
        recent.push(debug.cameraSeat());
        if (recent.length > SETTLE_WINDOW) recent.shift();
        if (recent.length < SETTLE_WINDOW) continue;
        let range = 0;
        for (let axis = 0; axis < 3; axis += 1) {
          const values = recent.map((seat) => seat[axis]);
          range = Math.max(range, Math.max(...values) - Math.min(...values));
        }
        if (range <= SETTLE_RANGE_M) {
          return { settled: true, frames: index + 1, rangeM: Math.round(range * 10000) / 10000 };
        }
      }
      return { settled: false, frames: SETTLE_MAX_FRAMES, rangeM: null };
    };
    const probeFrom = (seat, dir) => {
      const yaw = Math.atan2(dir[0], dir[2]);
      const dirs = [
        [Math.sin(yaw), 0, Math.cos(yaw)],
        [Math.sin(yaw + 0.6), 0, Math.cos(yaw + 0.6)],
        [Math.sin(yaw - 0.6), 0, Math.cos(yaw - 0.6)],
        [Math.sin(yaw) * 0.8, 0.6, Math.cos(yaw) * 0.8],
        [Math.sin(yaw) * 0.8, -0.6, Math.cos(yaw) * 0.8],
        [0, 1, 0],
        // Lane J repair 2026-09-02: the fan used to point only where the sweep
        // was looking. After the runtime has moved the seat sideways (the
        // character controller ejecting a capsule out of a collider, then
        // resolveEyeClearance on top) the nearest surface is very often the one
        // the seat was pushed AWAY from, i.e. behind or beside. A fan blind to
        // four of the six axes reports "nearest: null" from a seat two
        // centimetres off a jet engine - which is exactly what it did.
        [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
        [dir[0], dir[1], dir[2]],
      ];
      let worst = null;
      for (const direction of dirs) {
        let trace;
        try { trace = debug.traceBallistics('carbine', seat, direction, probe, arenaId); } catch { continue; }
        const impact = trace?.impacts?.[0];
        if (impact || trace?.stoppedBy) {
          const distance = impact?.entryDistance ?? impact?.distance ?? 0;
          if (!worst || distance < worst.distance) {
            worst = {
              distance: Math.round(distance * 1000) / 1000,
              surface: impact?.surface?.name ?? trace?.stoppedBy?.name ?? null,
              dir: direction,
            };
          }
        }
      }
      return worst;
    };
    // Land STANDING with the feet where the spot's feet are and let the body
    // come to rest, THEN take the stance and let it rest again - teleporting a
    // standing body to a prone eye height buries the capsule, and reading the
    // seat before either rest reads a falling camera.
    const pose = async (row) => {
      const eyeY = row.eyeY ?? STANCE_EYE[row.stance];
      debug.setStanceForQa('stand');
      debug.teleportPlayer(row.x, eyeY + (STANCE_EYE.stand - STANCE_EYE[row.stance]), row.z, 0, 0);
      await frame();
      const landed = await settle();
      // A previous row can leave the machine stuck prone somewhere it could
      // not stand; recover at the NEW location before taking the target.
      debug.setStanceForQa('stand');
      await frame();
      const stance = debug.setStanceForQa(row.stance);
      const posed = await settle();
      return { stance, landed, posed, seat: debug.cameraSeat() };
    };

    const remaining = [];
    let checked = 0;
    for (const row of rows) {
      const { stance, landed, posed, seat } = await pose(row);
      if (stance !== row.stance) {
        remaining.push({ ...row, note: `stance-blocked:${stance}`, landed, posed });
        continue;
      }
      if (!posed.settled) {
        remaining.push({ ...row, note: `unsettled:${posed.frames}-frames`, landed, posed });
        continue;
      }
      checked += 1;
      const worst = probeFrom(seat, row.dir);
      if (worst) {
        remaining.push({
          ...row, runtime: worst, seat: seat.map((v) => Math.round(v * 1000) / 1000),
          resolve: debug.lastEyeClearance(), posed,
        });
      }
    }

    const forcedResults = [];
    for (const row of forced) {
      const { stance, landed, posed, seat } = await pose(row);
      const measurable = stance === row.stance && posed.settled;
      forcedResults.push({
        id: row.id,
        stance: row.stance,
        achievedStance: stance,
        settled: posed.settled,
        settleFrames: posed.frames,
        seat: seat.map((v) => Math.round(v * 1000) / 1000),
        resolve: debug.lastEyeClearance(),
        runtime: measurable ? probeFrom(seat, row.dir) : null,
        landed,
      });
    }
    return { checked, remaining, forced: forcedResults };
  }, { rows: violations, forced: forcedRows, probe: PROBE_M, arenaId: arena });

  // A remaining row on an annotated surface is design-exempt at runtime too -
  // resolveEyeClearance never pushes the camera out of a walk-through fixture,
  // because it only probes solid-backed surfaces and these are authored
  // `solid: false` (measured pushedM 0 on every wallbang row). Same named
  // annotations stage 2 uses, so the two stages cannot disagree about what is
  // forgiven - and matched on the surface stage 3 actually HIT, not the one
  // stage 2 flagged, so a runtime fan that lands somewhere else is still judged.
  const partition = partitionAnnotatedViolations(
    LEDGER, arena, result.remaining, (row) => row.runtime?.surface ?? row.surface,
  );
  // A `stance-blocked` or `unsettled` row carries NO runtime probe: nothing was
  // measured there. It must not be folded into the distance verdict - reading a
  // missing measurement as `distance 0` reports the worst possible clip at a
  // seat the player could not even take, which is the same "unreachable spot
  // reported as a clip" mistake that produced 51 of this pass's red rows. It is
  // UNVERIFIED, it is printed as such rather than being silently dropped, and
  // since the Lane J repair it is RATCHETED (`unverifiedCeiling`), so a run that
  // measured nothing can no longer look exactly like a clean one.
  const measured = partition.unannotated.filter((row) => row.runtime);
  const unverified = partition.unannotated.filter((row) => !row.runtime);
  const forcedUnverified = result.forced.filter((row) => !(row.achievedStance === row.stance && row.settled));
  console.log(
    `${arena.padEnd(18)} sweep=${violations.length} checked=${result.checked}`
    + ` REMAINING=${result.remaining.length} (unannotated ${partition.unannotated.length},`
    + ` measured ${measured.length}, unverified ${unverified.length})`
    + ` forced=${result.forced.length}`,
  );
  for (const row of result.remaining) console.log('  ', JSON.stringify(row));
  for (const row of result.forced) console.log('   [forced]', JSON.stringify(row));
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
    unverified: [
      ...unverified.map((row) => ({
        surface: row.surface,
        stance: row.stance,
        sweepDistance: row.distance,
        note: row.note ?? 'no runtime probe was taken at this row',
      })),
      ...forcedUnverified.map((row) => ({
        surface: `forced:${row.id}`,
        stance: row.stance,
        sweepDistance: null,
        note: row.achievedStance !== row.stance
          ? `forced probe stance-blocked:${row.achievedStance}`
          : `forced probe unsettled after ${row.settleFrames} frames`,
      })),
    ],
    forced: result.forced.map((row) => ({
      id: row.id,
      stance: row.stance,
      achievedStance: row.achievedStance,
      settled: row.settled,
      seat: row.seat,
      pushedM: row.resolve?.pushedM ?? null,
      distance: row.runtime?.distance ?? null,
      surface: row.runtime?.surface ?? null,
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
  // Every forced probe named in the ledger must actually have run. An entry
  // that silently stops being visited is the stale-roster failure again, one
  // level down.
  for (const entry of LEDGER.forcedProbes ?? []) {
    const row = summary.find((item) => item.arena === entry.arena);
    if (!row || !(row.forced ?? []).some((item) => item.id === entry.id)) {
      console.error(
        `[eye-clearance] forced probe ${entry.id} (${entry.arena}) was never run. `
        + 'A named runtime probe that stops being measured forgives whatever it was watching.',
      );
      failed = true;
    }
  }
  for (const row of summary) {
    // Reported, never judged as a distance - but no longer unbounded. Stage 3's
    // stance machine can refuse a stance at a spot, and a teleported body can
    // still be falling; those rows carry no measurement. A regression that
    // pushed EVERY row into that bucket used to produce a fully green stage 3
    // that had measured nothing at all.
    for (const skipped of row.unverified ?? []) {
      console.warn(
        `[eye-clearance] ${row.arena}: UNVERIFIED row on ${skipped.surface} (${skipped.stance},`
        + ` sweep d=${skipped.sweepDistance}) - ${skipped.note}. Stage 3 measured nothing here;`
        + ' it is neither clean nor a clip.',
      );
    }
    const unverifiedCount = (row.unverified ?? []).length;
    const allowance = unverifiedCeilingFor(LEDGER, row.arena);
    if (allowance === undefined) {
      console.error(
        `[eye-clearance] ${row.arena} has no unverifiedCeiling entry in docs/eye-clearance/ledger.json. `
        + 'Every selectable arena needs one, so that "stage 3 measured nothing here" is a number somebody '
        + 'signed for rather than a warning nothing reads.',
      );
      failed = true;
    } else if (unverifiedCount > allowance) {
      console.error(
        `[eye-clearance] ${row.arena}: ${unverifiedCount} UNVERIFIED rows > allowance ${allowance} - REGRESSED. `
        + 'Those rows were not measured, so this is coverage loss, not clearance: fix the stance/settle path '
        + 'or the geometry. The allowance is a ratchet; it may hold or shrink, never grow.',
      );
      failed = true;
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
    // Forced probes are judged by the same floor. They exist precisely because
    // stage 2 going green at a spot is when stage 3 stops looking at it.
    for (const forced of row.forced ?? []) {
      if (forced.distance !== null && forced.distance < nearPlaneM) {
        console.error(
          `[eye-clearance] ${row.arena}: forced probe ${forced.id} seated at ${JSON.stringify(forced.seat)}`
          + ` sits ${forced.distance} m from ${forced.surface} (${forced.stance}), inside the ${nearPlaneM} m`
          + ' near plane. Stage 2 no longer flags this spot; the runtime still puts the camera in the surface.',
        );
        failed = true;
      }
    }
  }
}

if (failed) process.exit(1);
