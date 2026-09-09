#!/usr/bin/env node
/**
 * THE OBJECTIVE ANSWER TO "the gun still goes through walls and floor".
 *
 * Every previous attempt at this defect was graded on something that was not
 * the defect: the muzzle socket (one authored point - it passed while the
 * magazine sat 0.26 m through a wall), or a screenshot (the viewmodel draws on
 * a depth-cleared overlay, so it paints over world geometry whether or not it
 * is inside it, and a human cannot tell those two apart by looking).
 *
 * This drives the real game through the real WebGPU route and reads
 * `__ATOMIC_ACRES_DEBUG__.sampleViewmodelPenetration()`, which walks every
 * visible viewmodel VERTEX in world space and reports how deep the deepest one
 * is inside a solid, and how far the lowest one is below the standing surface.
 *
 * The scenario set is deliberately not just "walk at a wall head on". That case
 * a camera-perpendicular clip plane can already handle. The interesting rows
 * are the ones it structurally cannot: strafing ALONGSIDE a wall (the rig sits
 * ~0.33 m right of the eye, so the gun is in the wall while the crosshair is
 * parallel to it), inside corners, and sloped ground.
 *
 * Headless. Never opens a window on the owner's display.
 *
 * Usage:
 *   node scripts/qa/run-with-preview-server.mjs \
 *     node scripts/qa/measure-viewmodel-penetration-cdp.mjs --out artifacts/qa/penetration
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRatchet, gradeAgainstRatchet, updateRefusals } from './viewmodel-penetration-ratchet.mjs';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:41933/');
const OUT = arg('--out', 'artifacts/qa/viewmodel-penetration');
const ARENAS = arg('--arenas', 'atomic-acres,test2').split(',').map((s) => s.trim()).filter(Boolean);
const WEAPONS = arg('--weapons', 'carbine,m4a1,lmg').split(',').map((s) => s.trim()).filter(Boolean);
const LABEL = arg('--label', 'run');
/**
 * THE RATCHET. A fixed pose set is only evidence once for the run that measured
 * it; checked in, it becomes a floor nothing may fall through. `--ratchet`
 * grades this run against `scripts/qa/viewmodel-penetration-ratchet.json` and
 * exits non-zero when any scenario is WORSE than the recorded number. There is
 * no automatic relaxation: `--update-ratchet` is the only way the file moves,
 * and it refuses to record a run that covers less than the file already does,
 * so a shrunken weapon or arena list can never launder a regression into green.
 */
const RATCHET_PATH = resolve(arg('--ratchet-file', 'scripts/qa/viewmodel-penetration-ratchet.json'));
const GRADE_AGAINST_RATCHET = argv.includes('--ratchet');
const UPDATE_RATCHET = argv.includes('--update-ratchet');

mkdirSync(resolve(OUT), { recursive: true });

/**
 * Scenarios are authored as a pose plus a reason. `sweepYaw` rotates the player
 * on the spot through a full turn, which is what finds the glancing-angle cases:
 * a wall is only "head on" for a few degrees of the circle.
 */
const SCENARIOS = {
  'atomic-acres': [
    { name: 'house-front-wall', x: 4, z: -6.4, yaw: Math.PI, pitch: 0, sweepYaw: true, why: 'head-on and every glancing angle against the aqua house front wall' },
    { name: 'bus-van-gap', x: 4.5, z: -3.75, yaw: Math.PI / 2, pitch: 0, sweepYaw: true, why: 'narrow gap with a solid on both sides' },
    { name: 'garage-door', x: 17.7, z: -6.2, yaw: Math.PI, pitch: 0, sweepYaw: true, why: 'flush door line' },
    { name: 'west-fence-corner', x: -36.6, z: 23.0, yaw: Math.PI / 2, pitch: 0, sweepYaw: true, why: 'the corner that emptied the frame on 2026-08-31' },
    { name: 'open-ground-down', x: 0, z: 0, yaw: 0, pitch: -1.2, sweepYaw: false, why: 'looking down at flat ground, weapon must stay above it' },
    { name: 'grass-slope-down', x: -24, z: 26, yaw: 2.2, pitch: -0.85, sweepYaw: true, why: 'the owner screenshot: sloped grass, looking down' },
  ],
  test2: [
    { name: 'zone-a-wall', x: -34, z: -0.5, yaw: 0, pitch: 0, sweepYaw: true, why: 'Domination zone A surrounds' },
    { name: 'zone-b-court', x: 0, z: 14, yaw: 0, pitch: -0.6, sweepYaw: true, why: 'sunken court, looking down' },
    { name: 'zone-c-wall', x: 34, z: -0.5, yaw: Math.PI, pitch: 0, sweepYaw: true, why: 'Domination zone C surrounds' },
    { name: 'upper-room', x: 0, z: -20, yaw: 0, pitch: -0.4, sweepYaw: true, why: 'upper floor interior, floor beneath and walls around' },
  ],
};

/**
 * How many yaw samples per sweeping scenario. 12 (30 degrees apart) is the
 * authored sweep and what the ratchet records; a smaller number is a COARSER
 * run, and the ratchet refuses to be rewritten from one, so it can never be
 * used to make a failing pose disappear.
 */
const YAW_STEPS = Number(arg('--yaw-steps', '12'));
const STANCES = ['stand', 'crouch', 'prone'];

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--use-angle=d3d11',
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));

await page.goto(BASE, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), null, { timeout: 120_000 });

const rows = [];

for (const arena of ARENAS) {
  const scenarios = SCENARIOS[arena];
  if (!scenarios) { console.error(`no scenarios authored for ${arena}, skipping`); continue; }

  await page.evaluate(async (id) => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena(id);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  }, arena);
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot?.player && snapshot.gameStarted !== false;
  }, null, { timeout: 180_000 }).catch(() => {});
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen?.(true));

  for (const weapon of WEAPONS) {
    await page.evaluate((id) => window.__ATOMIC_ACRES_DEBUG__.equipWeapon?.(id), weapon).catch(() => {});
    await page.waitForTimeout(350);

    for (const scenario of scenarios) {
      const yaws = scenario.sweepYaw
        ? Array.from({ length: YAW_STEPS }, (_unused, step) => (step / YAW_STEPS) * Math.PI * 2)
        : [scenario.yaw];

      for (const stance of STANCES) {
        for (const yaw of yaws) {
          const sample = await page.evaluate(async (pose) => {
            const api = window.__ATOMIC_ACRES_DEBUG__;
            const frame = () => new Promise((done) => requestAnimationFrame(done));
            // HF-395 (2026-09-02): the stance was requested BEFORE the teleport
            // and the teleport leaves the player airborne, and requestStance
            // refuses stand/prone while not grounded. Every "prone" and "stand"
            // row of the pass 81 runs was therefore measured at whatever stance
            // the machine was left in, with the eye still 1.7-1.8 m up: the
            // ground plane never engaged in any stance and the stance column
            // was noise. Land first, THEN drive the stance machine, THEN settle.
            // Landing from the 1.7 m teleport eye into prone takes ~30 frames;
            // 90 bounds a pose that never grounds (water, a ledge) at 1.5 s.
            //
            // REVIEW REPAIR (2026-09-02): one attempt is not enough, and the
            // proof is in the lane's own two runs. On the SAME coordinates
            // test2/zone-c-wall landed 36/36 in one run and 0/36 in the other,
            // eleven minutes apart, on builds differing only in a pure geometry
            // module that cannot touch physics. A teleport that arrives while
            // the previous pose's motion is still resolving can leave the
            // player falling, and the whole scenario then reports numbers about
            // a player who is nowhere near the pose. Re-teleporting from a
            // standstill recovers it; a row that still will not land is marked
            // INVALID rather than counted.
            let grounded = false;
            let landingAttempts = 0;
            for (let attempt = 0; attempt < 3 && !grounded; attempt += 1) {
              landingAttempts = attempt + 1;
              api.teleportPlayer(pose.x, pose.y, pose.z, pose.yaw, pose.pitch);
              for (let waited = 0; waited < 90 && !grounded; waited += 1) {
                await frame();
                grounded = api.snapshot()?.player?.grounded === true;
              }
            }
            const stanceReached = api.setStanceForQa(pose.stance);
            if (grounded) {
              // Stance recovery is up to 290 ms; the eye height eases over it.
              for (let waited = 0; waited < 24; waited += 1) await frame();
              // The stance change can re-seat the eye; restore the exact look.
              const now = api.snapshot()?.player;
              api.teleportPlayer(now.position[0], now.position[1], now.position[2], pose.yaw, pose.pitch);
              for (let waited = 0; waited < 90; waited += 1) {
                await frame();
                if (api.snapshot()?.player?.grounded === true) break;
              }
            }
            // Settle: the contact fold and the clip planes are driven per frame,
            // so a single frame after a teleport is not the resting pose.
            await frame(); await frame(); await frame();
            const measured = api.sampleViewmodelPenetration();
            return {
              ...measured,
              grounded: api.snapshot()?.player?.grounded === true,
              stanceReached,
              landingAttempts,
            };
          }, { x: scenario.x, y: 1.7, z: scenario.z, yaw, pitch: scenario.pitch, stance });

          const verticesMeasured = Number(sample.verticesMeasured) || 0;
          const clippedVertices = Number(sample.clippedVertices) || 0;
          rows.push({
            arena,
            weapon,
            stance,
            // The stance the machine actually reached and whether the player
            // was standing on something when sampled: a row where either
            // disagrees with the request is not evidence about that stance.
            stanceReached: sample.stanceReached,
            grounded: sample.grounded,
            landingAttempts: sample.landingAttempts,
            /**
             * WHETHER THIS ROW IS EVIDENCE AT ALL.
             *
             * A row sampled airborne, or in a stance the machine refused, does
             * not describe the pose that was asked for. Such a row is written
             * out in full - it is never deleted - but every graded number is
             * computed over valid rows only, and the ratchet records how many
             * valid rows each scenario produced so a run that silently loses
             * them fails on coverage instead of passing on a smaller sample.
             * This replaces the previous scenario-level exclusion list, which
             * threw away 34 good rows of test2/zone-b-court to drop 2 bad ones.
             */
            valid: sample.grounded === true && sample.stanceReached === stance,
            scenario: scenario.name,
            why: scenario.why,
            yawDegrees: Math.round((yaw * 180) / Math.PI),
            pitchRadians: scenario.pitch,
            maxPenetrationM: sample.maxPenetrationM,
            maxBelowFloorM: sample.maxBelowFloorM,
            worstMesh: sample.worstMesh,
            worstBox: sample.worstBox,
            worstPoint: sample.worstPoint,
            activeClipPlanes: sample.activeClipPlanes,
            clippedVertices,
            verticesMeasured,
            /**
             * HOW MUCH OF THE RIG THE CLIP PLANES REMOVED.
             *
             * The blind spot in the previous grading. A viewmodel that is
             * entirely discarded reports 0 m penetration and 0 m below the
             * floor - it grades as PERFECT - so "fix the clipping by cutting
             * the whole weapon away" passed every check. It is also a defect
             * the owner would see instantly. Recorded per row, ratcheted per
             * scenario.
             */
            clippedFraction: verticesMeasured > 0
              ? Math.round((clippedVertices / verticesMeasured) * 10_000) / 10_000
              : 0,
            solidBoxes: sample.solidBoxes,
            dressingBoxes: sample.dressingBoxes,
          });
          if (rows.length % 25 === 0) console.error(`[penetration] ${rows.length} rows (${arena}/${weapon}/${stance}/${scenario.name})`);
        }
      }
    }
  }
}

await browser.close();

/**
 * EVERY GRADED NUMBER IS COMPUTED OVER VALID ROWS ONLY.
 *
 * A row the instrument could not pose (never landed, or the stance machine
 * refused) is not evidence about that pose on either build. It is still written
 * to `-rows.json` in full and counted in `invalidRows`, and the ratchet demands
 * that each scenario keep producing at least as many valid rows as it did when
 * the ratchet was recorded - so losing rows can never be mistaken for improving.
 */
const graded = rows.filter((row) => row.valid);
const penetrating = graded.filter((row) => row.maxPenetrationM > 0.01);
const belowFloor = graded.filter((row) => row.maxBelowFloorM > 0.01);
const worst = [...graded].sort((left, right) => right.maxPenetrationM - left.maxPenetrationM).slice(0, 15);
/** A rig this fraction clipped is not clipped, it is gone. */
const ERASED_FRACTION = 0.99;

const summary = {
  label: LABEL,
  rows: rows.length,
  gradedRows: graded.length,
  invalidRows: rows.length - graded.length,
  penetratingRows: penetrating.length,
  belowFloorRows: belowFloor.length,
  // Rows whose stance or footing did not match the request are listed, not
  // hidden: they are excluded from the graded numbers and reported here, so a
  // stance-machine regression shows up instead of silently turning prone rows
  // into standing ones or shrinking the sample.
  stanceMismatchRows: rows.filter((row) => row.stanceReached !== row.stance).length,
  airborneRows: rows.filter((row) => !row.grounded).length,
  retriedLandings: rows.filter((row) => (row.landingAttempts ?? 1) > 1).length,
  erasedRows: graded.filter((row) => row.clippedFraction >= ERASED_FRACTION).length,
  worstClippedFraction: graded.reduce((peak, row) => Math.max(peak, row.clippedFraction), 0),
  byStance: Object.fromEntries(STANCES.map((stance) => {
    const scoped = graded.filter((row) => row.stance === stance);
    return [stance, {
      rows: scoped.length,
      penetrating: scoped.filter((row) => row.maxPenetrationM > 0.01).length,
      belowFloor: scoped.filter((row) => row.maxBelowFloorM > 0.01).length,
      worstPenetrationM: scoped.reduce((peak, row) => Math.max(peak, row.maxPenetrationM), 0),
      worstBelowFloorM: scoped.reduce((peak, row) => Math.max(peak, row.maxBelowFloorM), 0),
      worstClippedFraction: scoped.reduce((peak, row) => Math.max(peak, row.clippedFraction), 0),
    }];
  })),
  maxPenetrationM: graded.reduce((peak, row) => Math.max(peak, row.maxPenetrationM), 0),
  maxBelowFloorM: graded.reduce((peak, row) => Math.max(peak, row.maxBelowFloorM), 0),
  // Where it fails matters as much as how often: a defect only at glancing
  // angles points at the clip plane's orientation, not at its distance.
  byScenario: Object.fromEntries(
    [...new Set(rows.map((row) => `${row.arena}/${row.scenario}`))].map((key) => {
      const all = rows.filter((row) => `${row.arena}/${row.scenario}` === key);
      const scoped = all.filter((row) => row.valid);
      return [key, {
        rows: all.length,
        gradedRows: scoped.length,
        penetrating: scoped.filter((row) => row.maxPenetrationM > 0.01).length,
        worstM: scoped.reduce((peak, row) => Math.max(peak, row.maxPenetrationM), 0),
        belowFloor: scoped.filter((row) => row.maxBelowFloorM > 0.01).length,
        worstBelowFloorM: scoped.reduce((peak, row) => Math.max(peak, row.maxBelowFloorM), 0),
        // The erasure metric. See the row-level comment on clippedFraction.
        worstClippedFraction: scoped.reduce((peak, row) => Math.max(peak, row.clippedFraction), 0),
        erased: scoped.filter((row) => row.clippedFraction >= ERASED_FRACTION).length,
      }];
    }),
  ),
  // The unfiltered totals, so nothing is hidden by the validity filter.
  unfiltered: {
    penetratingRows: rows.filter((row) => row.maxPenetrationM > 0.01).length,
    belowFloorRows: rows.filter((row) => row.maxBelowFloorM > 0.01).length,
    maxPenetrationM: rows.reduce((peak, row) => Math.max(peak, row.maxPenetrationM), 0),
    maxBelowFloorM: rows.reduce((peak, row) => Math.max(peak, row.maxBelowFloorM), 0),
    erasedRows: rows.filter((row) => row.clippedFraction >= ERASED_FRACTION).length,
  },
  worst,
};

writeFileSync(resolve(OUT, `${LABEL}-rows.json`), `${JSON.stringify(rows, null, 2)}\n`);
writeFileSync(resolve(OUT, `${LABEL}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify(summary, null, 2));
console.log(`\n${penetrating.length}/${graded.length} graded poses have visible weapon geometry inside a solid`);
console.log(`${belowFloor.length}/${graded.length} graded poses have visible weapon geometry below the standing surface`);
console.log(`${summary.erasedRows}/${graded.length} graded poses had the rig ENTIRELY clipped away (worst fraction ${summary.worstClippedFraction})`);
console.log(`${summary.invalidRows}/${rows.length} rows were not evidence (${summary.airborneRows} airborne, ${summary.stanceMismatchRows} stance mismatched); ${summary.retriedLandings} needed a landing retry`);

const ratchetShape = buildRatchet(summary, {
  arenas: ARENAS, weapons: WEAPONS, yawSteps: YAW_STEPS, stances: STANCES,
});

if (UPDATE_RATCHET) {
  const held = existsSync(RATCHET_PATH) ? JSON.parse(readFileSync(RATCHET_PATH, 'utf8')) : null;
  const refusals = updateRefusals(held, ratchetShape);
  if (refusals.length) {
    console.error('refusing to update the ratchet from a run that covers less than it already does:');
    for (const line of refusals) console.error(`  - ${line}`);
    process.exit(3);
  }
  writeFileSync(RATCHET_PATH, `${JSON.stringify(ratchetShape, null, 2)}\n`);
  console.log(`ratchet written to ${RATCHET_PATH}`);
}

if (GRADE_AGAINST_RATCHET) {
  if (!existsSync(RATCHET_PATH)) {
    console.error(`no ratchet at ${RATCHET_PATH}; run once with --update-ratchet first`);
    process.exit(3);
  }
  const regressions = gradeAgainstRatchet(JSON.parse(readFileSync(RATCHET_PATH, 'utf8')), ratchetShape);
  if (regressions.length) {
    console.error(`\nRATCHET FAILED (${regressions.length}):`);
    for (const line of regressions) console.error(`  - ${line}`);
    process.exit(2);
  }
  console.log(`ratchet held: every scenario at or better than ${RATCHET_PATH}`);
}
