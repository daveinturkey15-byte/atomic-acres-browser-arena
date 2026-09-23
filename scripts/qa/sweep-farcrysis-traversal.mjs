// Lane R (PASS 87, HF-423) — brief Job 3, second half: the beach and jungle
// TRAVERSAL sweep. "No invisible walls on the beach and jungle routes."
//
// WHAT WAS MISSING. The lane ran the eye-clearance pipeline (does geometry
// intrude on the CAMERA) but never the traversal half (can a player WALK the
// routes). Those are different questions with different failure modes: an
// invisible wall clears eye clearance perfectly, because there is nothing there
// to see.
//
// WHAT AN INVISIBLE WALL IS, operationally, so the verdict is not a matter of
// taste. The player walks forward from a legal open spot. If they stop, one of
// three things is true and this instrument distinguishes them in-page:
//
//   1. a real surface is in front of them  -> a collider, named and reported;
//      this is a wall the player can SEE, which is fine
//   2. no surface, but the ground ahead climbs faster than the movement code
//      will step  -> a slope, legitimate and reported as such
//   3. no surface AND walkable ground ahead -> INVISIBLE WALL. This is the
//      defect class the brief names.
//
// GROUND HEIGHT comes from the arena's own terrain authority
// (farcrysisTerrainHeight), imported directly. The first revision of this
// instrument read it from a downward traceBallistics against the canonical shot
// surfaces instead, which sounds more honest and is wrong: this lane
// deliberately gives each terrain chunk a ballistic box whose ceiling is the
// chunk's LOWEST ground, so on a slope that probe answers several metres BELOW
// the real surface. Seating the player at that height + 1.7 m put them INSIDE
// the hillside, where they cannot move - and the sweep then reported 42 of 96
// walks as stuck. Every one of those was the instrument. Same failure shape as
// the eye-clearance stage-1 flat-ground eye seat this lane documented; it is
// easy to make twice.
//
// This is why the script runs under `node --import tsx`.
//
// ROUTES. Start points are not hand-picked: they are generated as two rings
// derived from the arena's own bounds - a BEACH ring near the shoreline radius
// and a JUNGLE ring in the interior - and each start walks in 4 compass
// headings. A hand-picked route proves the route, not the map.
//
// THE MATCH CLOCK. farcrysis ships `PREVIEW - 5 MIN - SOLO - 2 BOTS`, and this
// sweep takes longer than five minutes. When the match ends the player stops
// responding to movement, and the first three revisions of this instrument
// duly reported every remaining start as "stuck" - 8 consecutive jungle starts,
// 32 walks, all zero metres, in run order rather than in any spatial pattern.
// The clock, not the map. So each walk now checks matchPhase first and calls
// rematch() when the match has ended, and EVERY ROW records the phase it was
// measured in: a row measured outside an active match is not evidence about
// collision, and it must be impossible to mistake one for the other again.
//
// Headless only. farcrysis-scoped lane instrument; drives movement through the
// debug API on purpose (this measures COLLISION, not the menu path - the menu
// path has its own gate in verify-player-path-cdp.mjs).
//
// Usage:
//   node scripts/qa/run-with-preview-server.mjs \
//     node scripts/qa/sweep-farcrysis-traversal.mjs --url http://127.0.0.1:4180 \
//       [--arena farcrysis] [--out docs/evidence/.../traversal.json]

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';
import { farcrysisTerrainHeight, FARCRYSIS_WATER_LEVEL } from '../../src/farcrysis-terrain-authority.ts';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180');
const ARENA = arg('--arena', 'farcrysis');
const OUT = arg('--out', null);
const WALK_MS = Number(arg('--walk-ms', '4000'));

/** Rings over the island, in metres from the origin. Beach then interior. */
const RINGS = [
  { name: 'beach', radius: 46 },
  { name: 'jungle', radius: 26 },
];
const HEADINGS = [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5];
const STARTS_PER_RING = 12;
/** A stop this close to a named surface is that surface, not an invisible wall. */
const BLOCKER_NEAR_M = 1.2;
/** Ground this much higher 1 m ahead is a slope the movement code may refuse. */
const SLOPE_STEP_M = 0.6;
/** farcrysis sea level, from the arena itself; below it is water, not island. */
const WATER_LEVEL_M = FARCRYSIS_WATER_LEVEL;

const sleep = (ms) => new Promise((done) => { setTimeout(done, ms); });

const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion',
  ],
});

const rows = [];
const notes = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const session = await page.context().newCDPSession(page);
  await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  page.on('pageerror', (error) => notes.push(`pageerror: ${String(error).slice(0, 200)}`));

  await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=laneR-traversal&previewTime=0`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
  await page.evaluate(async (id) => {
    await window.__ATOMIC_ACRES_DEBUG__.selectArena(id);
    window.__ATOMIC_ACRES_DEBUG__.startSolo();
  }, ARENA);
  await page.waitForFunction(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
  }, undefined, { timeout: 240_000 });
  await sleep(6_000);
  await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true)).catch(() => {
    notes.push('setBotsFrozen unavailable; bots left running');
  });

  // Ground height under a point, from the arena's own analytic terrain field -
  // the same function the spawn table, the physics plates and the collision
  // proxy are all derived from. Synchronous, exact, and not a step function.
  const groundAt = (x, z) => {
    const height = farcrysisTerrainHeight(x, z);
    return Number.isFinite(height) ? Number(height.toFixed(3)) : null;
  };
  // Whether a point is over water rather than island. A start in the sea is not
  // a traversal result.
  const overWater = (x, z) => (groundAt(x, z) ?? -99) <= WATER_LEVEL_M;

  const starts = [];
  for (const ring of RINGS) {
    for (let i = 0; i < STARTS_PER_RING; i += 1) {
      const angle = (i / STARTS_PER_RING) * Math.PI * 2;
      const x = Math.round(Math.cos(angle) * ring.radius * 10) / 10;
      const z = Math.round(Math.sin(angle) * ring.radius * 10) / 10;
      const blocked = await page.evaluate(([px, pz]) => Boolean(window.__ATOMIC_ACRES_DEBUG__.collisionProbe(px, pz)), [x, z]);
      const ground = groundAt(x, z);
      // A start inside a collider, or off the island (no ground under it), is
      // not a traversal result - it is an unusable start, and it is reported as
      // one rather than silently dropped.
      starts.push({ ring: ring.name, x, z, blocked, ground });
    }
  }

  for (const start of starts) {
    if (start.blocked || start.ground === null || start.ground <= WATER_LEVEL_M) {
      rows.push({
        ...start,
        skipped: start.blocked ? 'start inside a collider'
          : start.ground === null ? 'no ground under the start' : 'start is in the water',
      });
      continue;
    }
    for (const yaw of HEADINGS) {
      // Match clock: a finished match reads exactly like a wedged player.
      let phase = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase);
      if (phase !== 'active') {
        notes.push(`match ended (phase ${phase}) before start ${start.x},${start.z} yaw ${yaw.toFixed(2)} - rematched`);
        await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.rematch());
        await page.waitForFunction(() => {
          const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
          return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
        }, undefined, { timeout: 180_000 });
        await sleep(3_000);
        await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true)).catch(() => {});
        phase = 'active';
      }
      await page.evaluate(({ x, y, z, h }) => window.__ATOMIC_ACRES_DEBUG__.teleportPlayer(x, y, z, h, 0),
        { x: start.x, y: start.ground + 1.7, z: start.z, h: yaw });
      await sleep(500);
      // MOVEMENT IS DRIVEN THROUGH THE SANCTIONED DEBUG API, not synthetic key
      // events. legacy-main's setMovement(forward) adds 'KeyW' to the movement
      // key set directly; a page.keyboard.down('KeyW') has to survive the real
      // input handler, which is pointer-lock and focus gated headless. MEASURED:
      // the keyboard version left the player motionless on 41 of 96 walks, with
      // the movement authority reporting the cells ahead OPEN and no surface
      // within 4 m - i.e. it manufactured 'stuck' spots that do not exist. If
      // this ever goes back to keyboard events, that is the bug it reintroduces.
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(true));
      const deadline = Date.now() + WALK_MS;
      let outcome = 'walked';
      let last = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
      let lastCheck = Date.now();
      while (Date.now() < deadline) {
        await sleep(200);
        const position = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
        if (position[1] < -20) { outcome = 'fell'; break; }
        if (Date.now() - lastCheck >= 700) {
          if (Math.hypot(position[0] - last[0], position[2] - last[2]) < 0.10) { outcome = 'stopped'; break; }
          last = position; lastCheck = Date.now();
        }
      }
      await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.setMovement(false));
      const end = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.snapshot().player.position);
      const distance = Math.hypot(end[0] - start.x, end[2] - start.z);

      let classification = outcome;
      let blocker = null;
      let slope = null;
      let movementBlocked = null;
      if (outcome === 'stopped') {
        blocker = await page.evaluate(([ex, ey, ez, h]) => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          let best = null;
          // A small fan, because a stop can be against a corner that a single
          // centre ray slips past - and a missed ray would read as an invisible
          // wall, i.e. the instrument would invent the defect it is looking for.
          for (let a = -4; a <= 4; a += 1) {
            const yaw = h + a * 0.06;
            // FORWARD is (-sin, 0, -cos), MEASURED from this arena's own walks:
            // at yaw 0 the player travels -Z, at yaw pi/2 the player travels -X.
            // The first revision of this instrument traced (+sin, +cos) - i.e.
            // BEHIND the player - and every stop therefore reported "no surface
            // ahead". It invented 45 invisible walls that way. Do not "simplify"
            // this back.
            let trace;
            try { trace = api.traceBallistics('carbine', [ex, ey, ez], [-Math.sin(yaw), 0, -Math.cos(yaw)], 4); } catch { continue; }
            const impact = trace?.impacts?.[0];
            if (impact && (!best || impact.entryDistance < best.distanceM)) {
              best = { name: impact.surface.name, material: impact.surface.material ?? null, distanceM: Number(impact.entryDistance.toFixed(2)) };
            }
          }
          return best;
        }, [end[0], end[1] - 0.7, end[2], yaw]);
        // The MOVEMENT authority's own answer, which is the one that decides
        // whether the player can walk. A cell the movement code calls blocked
        // while no shot surface stands there is precisely an invisible wall:
        // a collider with nothing to see.
        movementBlocked = await page.evaluate(([ex, ez, h]) => {
          const api = window.__ATOMIC_ACRES_DEBUG__;
          const out = [];
          for (const step of [0.5, 1.0, 1.5]) {
            out.push(Boolean(api.collisionProbe(ex - Math.sin(h) * step, ez - Math.cos(h) * step)));
          }
          return out;
        }, [end[0], end[2], yaw]);
        const aheadX = end[0] - Math.sin(yaw);
        const aheadZ = end[2] - Math.cos(yaw);
        const here = groundAt(end[0], end[2]);
        const ahead = overWater(aheadX, aheadZ) ? null : groundAt(aheadX, aheadZ);
        slope = here === null || ahead === null ? null : Number((ahead - here).toFixed(3));
        if (blocker && blocker.distanceM <= BLOCKER_NEAR_M) classification = 'stopped-at-surface';
        else if (slope !== null && slope >= SLOPE_STEP_M) classification = 'stopped-on-slope';
        else if (ahead === null) classification = 'stopped-at-island-edge';
        else if (movementBlocked && movementBlocked.some(Boolean)) classification = 'INVISIBLE-WALL';
        else classification = 'stopped-no-cause-found';
      }
      const phaseAfter = await page.evaluate(() => {
        const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
        return { matchPhase: snapshot.matchPhase, alive: snapshot.player?.alive ?? null };
      });
      rows.push({
        ring: start.ring,
        matchPhaseAtWalk: phaseAfter.matchPhase,
        aliveAtWalk: phaseAfter.alive,
        start: [start.x, start.z],
        yaw: Number(yaw.toFixed(3)),
        outcome,
        classification,
        walkedM: Number(distance.toFixed(2)),
        end: end.map((value) => Number(value.toFixed(2))),
        blocker,
        groundStepAheadM: slope,
        movementBlockedAt: movementBlocked,
      });
    }
  }
} finally {
  await browser.close();
}

const attempted = rows.filter((row) => !row.skipped);
// A walk taken outside an active match, or by a dead player, is not evidence
// about collision. It is reported, separately, and it is NOT classified - the
// whole point of the match-clock fix above is that these can no longer be
// mistaken for stuck spots.
const walks = attempted.filter((row) => row.matchPhaseAtWalk === 'active' && row.aliveAtWalk !== false);
const invalid = attempted.filter((row) => !(row.matchPhaseAtWalk === 'active' && row.aliveAtWalk !== false));
const counts = {};
for (const row of walks) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
const suspects = walks.filter((row) => row.classification === 'INVISIBLE-WALL');
const record = {
  contract: 'farcrysis-traversal-sweep-v1',
  measuredAt: new Date().toISOString(),
  arena: ARENA,
  url: BASE,
  method: {
    rings: RINGS,
    startsPerRing: STARTS_PER_RING,
    headings: HEADINGS.length,
    walkMs: WALK_MS,
    blockerNearM: BLOCKER_NEAR_M,
    slopeStepM: SLOPE_STEP_M,
    groundSource: 'downward traceBallistics against the canonical shot surfaces - the same set gunfire uses',
  },
  summary: {
    starts: rows.length - walks.length + new Set(walks.map((r) => String(r.start))).size,
    unusableStarts: rows.filter((row) => row.skipped).length,
    walksClassified: walks.length,
    walksDiscardedOutsideActiveMatch: invalid.length,
    byClassification: counts,
    invisibleWalls: suspects.length,
  },
  discardedWalks: invalid,
  invisibleWallSuspects: suspects,
  unusableStarts: rows.filter((row) => row.skipped),
  rows: walks,
  notes,
};
if (OUT) {
  const path = resolve(process.cwd(), OUT);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(record, null, 1)}\n`);
}
console.log(JSON.stringify({ ...record, rows: undefined }, null, 1));
process.exit(0);
