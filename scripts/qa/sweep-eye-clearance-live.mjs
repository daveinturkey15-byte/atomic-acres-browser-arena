// HF-387 stage 2 (live): probe every legal wall-hug eye position against the VISUAL
// shot surfaces of the running arena.
//
// Stage 1 proved a flat-wall hug cannot clip (stance radius 0.36 m vs 0.08 m near
// plane), so what this measures is exactly the felt bug's habitat: visual geometry
// protruding past its collider, inside corners, and low overhangs. A hit within
// PROBE_M of a legal eye point means the near plane can slice that surface with a
// little camera bob or lean - the "I clip through walls when prone/near walls" report.
//
// Probes go through __ATOMIC_ACRES_DEBUG__.traceBallistics, which raycasts the same
// canonical shot-surface set combat uses - the parity-gated stand-in for the visuals.
//
// Usage: node scripts/qa/sweep-eye-clearance-live.mjs [--url ...] [--arenas a,b]

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  annotationsForArena, arenaSideCeiling, countArenaSideViolations, partitionAnnotatedViolations,
  readLedger, resolveArenaRoster, UNMEASURED_CEILING,
} from './eye-clearance-roster.mjs';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
// Owner 2026-08-31: follow the server the runner actually started. This
// defaulted to a fixed 41975 while run-with-preview-server.mjs defaults to
// 4180 and exports QA_BASE_URL to its child, so `npm run qa:eye-clearance`
// died with ERR_CONNECTION_REFUSED before measuring anything - a gate that
// could not be run by the command that names it, whatever its roster said.
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:41975');
// Owner 2026-08-31: this used to be a hand-written five-id default while stage 1
// already generated spots for all seven selectable arenas, so the pipeline
// measured five and printed a green ratchet over a roster it had not covered.
// Derived now, with a floor, and a narrowed --arenas may not produce a verdict.
const ROSTER = resolveArenaRoster(arg('--arenas', null));
const ARENAS = ROSTER.ids;
const PROBE_M = Number(arg('--probe', '0.15'));
// Read once, up front: the annotations partition rows during measurement, not
// only during the ratchet, so an exempt row is visible in every run's log.
const LEDGER = readLedger();

if (argv.includes('--check') && ROSTER.narrowed) {
  console.error(
    `[eye-clearance] --check refuses a narrowed roster: asked for ${ARENAS.join(', ')} `
    + `but the selectable roster is ${ROSTER.full.join(', ')}. A ratchet verdict must cover everything.`,
  );
  process.exit(1);
}
console.log(`[eye-clearance] live sweep roster (${ARENAS.length}): ${ARENAS.join(', ')}`);

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=eyesweep&previewTime=0`,
  { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });

mkdirSync('artifacts/qa/eye-clearance', { recursive: true });
const summary = [];

for (const [index, arena] of ARENAS.entries()) {
  const spots = JSON.parse(readFileSync(`artifacts/qa/eye-clearance/${arena}-spots.json`, 'utf8')).spots;
  if (index > 0) {
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  }
  await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arena);
  await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
  await page.waitForFunction(() => {
    const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snap.matchPhase === 'active' && snap.gameStarted === true;
  }, undefined, { timeout: 300_000 });

  const result = await page.evaluate(({ spotList, probe, arenaId }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const violations = [];
    let traces = 0;
    for (const spot of spotList) {
      const [fx, , fz] = spot.facing;
      // Facing cone + verticals: the directions bob/lean can push the near plane.
      const yaw = Math.atan2(fx, fz);
      const dirs = [
        [Math.sin(yaw), 0, Math.cos(yaw)],
        [Math.sin(yaw + 0.6), 0, Math.cos(yaw + 0.6)],
        [Math.sin(yaw - 0.6), 0, Math.cos(yaw - 0.6)],
        [Math.sin(yaw) * 0.8, 0.6, Math.cos(yaw) * 0.8],
        [Math.sin(yaw) * 0.8, -0.6, Math.cos(yaw) * 0.8],
        [0, 1, 0],
        [0, -1, 0],
      ];
      for (const dir of dirs) {
        traces += 1;
        let trace;
        try {
          trace = debug.traceBallistics('carbine', [spot.x, spot.eyeY, spot.z], dir, probe, arenaId);
        } catch {
          continue;
        }
        const impact = trace?.impacts?.[0];
        if (impact || trace?.stoppedBy) {
          const distance = impact?.entryDistance ?? impact?.distance ?? 0;
          violations.push({
            x: Math.round(spot.x * 100) / 100,
            z: Math.round(spot.z * 100) / 100,
            eyeY: spot.eyeY,
            stance: spot.stance,
            kind: spot.kind,
            dir: dir.map((v) => Math.round(v * 100) / 100),
            distance: Math.round(distance * 1000) / 1000,
            surface: impact?.surface?.name ?? trace?.stoppedBy?.name ?? null,
          });
          break; // one violation per spot is enough to flag it
        }
      }
    }
    return { traces, violations };
  }, { spotList: spots, probe: PROBE_M, arenaId: arena });

  // Named per-spot exemptions. The rows are still MEASURED and still written to
  // the artifact; the annotation only decides which of them the arena ceiling
  // is allowed to ignore, and every matched row is printed under its id so an
  // exemption can never be silent. See annotationsForArena in the roster module.
  const { annotations, matched, unannotated } =
    partitionAnnotatedViolations(LEDGER, arena, result.violations);
  writeFileSync(`artifacts/qa/eye-clearance/${arena}-violations.json`,
    JSON.stringify({
      arena,
      probeM: PROBE_M,
      spotCount: spots.length,
      ...result,
      annotated: Object.fromEntries([...matched].map(([id, rows]) => [id, rows])),
      unannotatedViolations: unannotated.length,
    }, null, 1));
  const byStance = {};
  for (const v of result.violations) byStance[v.stance] = (byStance[v.stance] ?? 0) + 1;
  // HF-423: the raw count is not the whole verdict on an arena whose rows are
  // mostly an instrument limitation. `arenaSide` is the subset that does NOT
  // name an excluded surface class, and it carries its own, much tighter
  // ceiling below. See eye-clearance-roster.mjs for why. Bound to the
  // module-level LEDGER, not a second read of the file.
  const arenaSide = countArenaSideViolations(arena, result.violations, LEDGER);
  console.log(
    `${arena.padEnd(18)} spots=${spots.length} traces=${result.traces}`
    + ` VIOLATIONS=${result.violations.length}`
    + `${arenaSide === null ? '' : ` (arena-side ${arenaSide})`}`
    + ` (unannotated ${unannotated.length}) ${JSON.stringify(byStance)}`,
  );
  for (const annotation of annotations) {
    const rows = matched.get(annotation.id);
    console.log(`  [annotation ${annotation.id}] ${rows.length}/${annotation.maxRows} rows - ${annotation.class}`);
    for (const row of rows) {
      console.log(`      ${row.surface} ${row.stance} d=${row.distance} at (${row.x}, ${row.eyeY}, ${row.z})`);
    }
  }
  summary.push({
    arena,
    spots: spots.length,
    violations: result.violations.length,
    unannotated: unannotated.length,
    annotated: Object.fromEntries([...matched].map(([id, rows]) => [id, rows.length])),
    ...(arenaSide === null ? {} : { arenaSideViolations: arenaSide }),
    byStance,
  });

  // Back to menu for the next arena.
  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=eyesweep&previewTime=0`,
    { waitUntil: 'domcontentloaded' });
}

writeFileSync('artifacts/qa/eye-clearance/summary.json', JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary));
await browser.close();

// Ratchet: measured violation counts may only hold or shrink against the committed
// ledger. Growth is a regression in collider/visual agreement and fails loudly.
if (argv.includes('--check')) {
  const ledger = LEDGER;
  let failed = false;

  // Annotations first, because an exemption that is stale, over-subscribed or
  // pointed at an arena nobody measures is itself a gate failure - the "frozen
  // list quietly outlives the thing it described" trap this file has hit three
  // times. Checked against the FULL roster, not the rows that happened to run.
  const measuredRows = new Map(summary.map((row) => [row.arena, row]));
  for (const annotation of ledger.annotations ?? []) {
    if (!ROSTER.full.includes(annotation.arena)) {
      console.error(
        `[eye-clearance] annotation ${annotation.id} names arena ${annotation.arena}, which is not selectable`,
      );
      failed = true;
      continue;
    }
    const row = measuredRows.get(annotation.arena);
    if (!row) continue; // the coverage check below already fails this arena.
    const hits = row.annotated?.[annotation.id] ?? 0;
    if (hits === 0) {
      console.error(
        `[eye-clearance] annotation ${annotation.id} matched NO measured row on ${annotation.arena}. `
        + 'A per-spot exemption that describes nothing is stale: delete it, or explain what changed. '
        + 'It must never sit here quietly forgiving rows that no longer exist.',
      );
      failed = true;
    } else if (hits > annotation.maxRows) {
      console.error(
        `[eye-clearance] annotation ${annotation.id}: ${hits} rows > maxRows ${annotation.maxRows} - REGRESSED. `
        + 'An annotation is a ratchet too; it may hold or shrink, never grow.',
      );
      failed = true;
    }
  }

  // A ratchet that only inspects the rows it happened to measure can never
  // notice the rows it skipped. Coverage is checked against the roster first.
  const measured = new Set(summary.map((row) => row.arena));
  for (const arena of ROSTER.full) {
    if (!measured.has(arena)) {
      console.error(`[eye-clearance] ${arena} is selectable but was never measured - no verdict is possible`);
      failed = true;
    }
  }

  for (const row of summary) {
    const ceiling = ledger.ceilings[row.arena];
    if (ceiling === undefined) { console.error(`[eye-clearance] no ceiling for ${row.arena}`); failed = true; continue; }
    if (ceiling <= UNMEASURED_CEILING) {
      console.error(
        `[eye-clearance] ${row.arena}: measured ${row.violations} violations against the UNMEASURED sentinel `
        + `(${ceiling}). This arena has never had a real baseline. Record ${row.violations} in `
        + 'docs/eye-clearance/ledger.json with a dated note, and triage those rows - do not raise the '
        + 'ceiling past what was measured.',
      );
      failed = true;
      continue;
    }
    // The ceiling judges the rows nothing explains. Annotated rows were already
    // capped and staleness-checked above, by surface name, under their own id.
    if (row.unannotated > ceiling) {
      console.error(
        `[eye-clearance] ${row.arena}: ${row.unannotated} unannotated violations > ceiling ${ceiling}`
        + ` (${row.violations} measured, ${row.violations - row.unannotated} annotated) - REGRESSED`,
      );
      failed = true;
    }

    // HF-423 second half. A raw ceiling that is mostly instrument slack is a
    // ratchet in name only: farcrysis measured 441, of which 373 are the
    // stage-1 flat-ground eye seat, so the arena's own 68 real rows could grow
    // more than fivefold without the raw ceiling ever firing. Where the ledger
    // names an excluded surface class, the count that excludes it is ratcheted
    // too, and it is the one that catches a real collision regression.
    const sub = arenaSideCeiling(row.arena, ledger);
    if (sub) {
      if (row.arenaSideViolations === undefined) {
        console.error(
          `[eye-clearance] ${row.arena}: an arena-side sub-ceiling of ${sub.ceiling} is committed but this run `
          + 'produced no arena-side count. The sweep must classify every violation before a verdict is possible.',
        );
        failed = true;
      } else if (row.arenaSideViolations > sub.ceiling) {
        console.error(
          `[eye-clearance] ${row.arena}: ${row.arenaSideViolations} ARENA-SIDE violations > sub-ceiling `
          + `${sub.ceiling} - REGRESSED (raw ${row.violations} against ${ceiling}; excluded classes `
          + `${sub.excludeSurfacePrefixes.join(', ')})`,
        );
        failed = true;
      } else {
        console.log(`[eye-clearance] ${row.arena}: arena-side ${row.arenaSideViolations} <= ${sub.ceiling}`);
      }
    }
  }
  process.exit(failed ? 1 : 0);
}
