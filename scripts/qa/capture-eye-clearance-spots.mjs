// Lane J, 2026-09-02: headless first-person capture from a flagged eye seat.
//
// The eye-clearance sweep reports a DISTANCE; a distance does not show you a
// near plane slicing a jet engine. This teleports the real player to a named
// spot in the requested stance, aims the camera down the direction the sweep
// flagged, and screenshots the game canvas from the actual camera seat - the
// before/after evidence the triage rows cite.
//
// It also records the RESOLVED seat and the runtime clearance alongside each
// frame, because on an unreachable spot the interesting fact is precisely that
// the player did not end up where the sweep said: a screenshot with no seat
// beside it cannot tell those two cases apart.
//
// Usage:
//   node scripts/qa/run-with-preview-server.mjs \
//     node scripts/qa/capture-eye-clearance-spots.mjs --label before
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SILENT_ARGS } from './lib/browser-launch-flags.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = arg('--url', process.env.QA_BASE_URL ?? 'http://127.0.0.1:4180');
const LABEL = arg('--label', 'capture');
const PROBE_M = Number(arg('--probe', '0.15'));
const OUT = 'artifacts/qa/eye-clearance/frames';

/**
 * The triaged rows, by class. Coordinates and directions are copied from the
 * stage-2 artifact of the BEFORE run (artifacts/qa/eye-clearance/before.json),
 * so the same seats are shot on both sides of the fix.
 */
const SPOTS = [
  {
    id: 'skyline-nacelle-prone-a', arena: 'skyline-terminal', triage: 'a-real-geometry',
    x: -0.63, z: 13.72, stance: 'prone', dir: [0, 0.6, 0.8],
    note: 'prone under jetliner engine 1; sweep d=0.067, runtime d=0.035 with the resolve at its 0.34 m push cap',
  },
  {
    id: 'skyline-nacelle-prone-b', arena: 'skyline-terminal', triage: 'a-real-geometry',
    x: 0.75, z: 12.38, stance: 'prone', dir: [0, 0.6, -0.8],
    note: 'prone under jetliner engine 1, opposite flank',
  },
  {
    id: 'skyline-nacelle-prone-c', arena: 'skyline-terminal', triage: 'a-real-geometry',
    x: -0.63, z: -9.72, stance: 'prone', dir: [0, 0.6, -0.8],
    note: 'prone under jetliner engine 2',
  },
  {
    id: 'gunrange-door-stand', arena: 'gun-range', triage: 'b-probe-artefact',
    x: 51.1, z: 8.64, stance: 'stand', dir: [1, 0, 0],
    note: 'inside the closed test-bay door leaf (51.15..51.85); a 0.38 m capsule here is 0.33 m into the door',
  },
  {
    id: 'gunrange-door-prone', arena: 'gun-range', triage: 'b-probe-artefact',
    x: 51.12, z: 12.0, stance: 'prone', dir: [1, 0, 0],
    note: 'same leaf, prone, mid-door',
  },
  {
    id: 'gunrange-wallbang-glass', arena: 'gun-range', triage: 'c-intentional-fixture',
    x: -17.96, z: -7.67, stance: 'stand', dir: [-0.83, 0, 0.56],
    note: 'annotated: wallbang glass panel, authored solid:false shots:true',
  },
  {
    id: 'gunrange-wallbang-brick', arena: 'gun-range', triage: 'c-intentional-fixture',
    x: -9.04, z: -7.67, stance: 'stand', dir: [1, 0, 0],
    note: 'annotated: wallbang brick panel, authored solid:false shots:true',
  },
];

const STANCE_EYE = { stand: 1.7, crouch: 1.16, prone: 0.61 };

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  headless: true, channel: 'chrome',
  args: [...SILENT_ARGS,
    '--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const session = await page.context().newCDPSession(page);
await session.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});

const receipts = [];
let currentArena = null;
for (const spot of SPOTS) {
  if (spot.arena !== currentArena) {
    await page.goto(`${BASE}/?release=latest&renderer=webgpu&render=quality&seed=eyeshot&previewTime=0`,
      { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
    await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, spot.arena);
    await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    await page.waitForFunction(() => {
      const snap = window.__ATOMIC_ACRES_DEBUG__.snapshot();
      return snap.matchPhase === 'active' && snap.gameStarted === true;
    }, undefined, { timeout: 300_000 });
    await page.waitForTimeout(1500);
    currentArena = spot.arena;
  }

  const seated = await page.evaluate(async ({ row, probe, stanceEye, arenaId }) => {
    const debug = window.__ATOMIC_ACRES_DEBUG__;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const yaw = Math.atan2(row.dir[0], row.dir[2]);
    const pitch = Math.asin(row.dir[1] / Math.hypot(row.dir[0], row.dir[1], row.dir[2]));
    // Same order stage 3 uses: land standing at the spot's feet, then take the
    // stance. Teleporting a standing body to a prone eye buries the capsule.
    debug.setStanceForQa('stand');
    debug.teleportPlayer(row.x, stanceEye.stand, row.z, yaw, pitch);
    await frame();
    debug.setStanceForQa('stand');
    await frame();
    const stance = debug.setStanceForQa(row.stance);
    await frame();
    await frame();
    const seat = debug.cameraSeat();
    let worst = null;
    for (const dir of [row.dir, [0, 1, 0], [0, -1, 0]]) {
      let trace;
      try { trace = debug.traceBallistics('carbine', seat, dir, probe, arenaId); } catch { continue; }
      const impact = trace?.impacts?.[0];
      if (impact || trace?.stoppedBy) {
        const distance = impact?.entryDistance ?? impact?.distance ?? 0;
        if (!worst || distance < worst.distance) {
          worst = {
            distance: Math.round(distance * 1000) / 1000,
            surface: impact?.surface?.name ?? trace?.stoppedBy?.name ?? null,
          };
        }
      }
    }
    return {
      requestedStance: row.stance,
      stance,
      seat: seat.map((v) => Math.round(v * 1000) / 1000),
      resolve: debug.lastEyeClearance(),
      nearest: worst,
    };
  }, { row: spot, probe: PROBE_M, stanceEye: STANCE_EYE, arenaId: spot.arena });

  await page.waitForTimeout(300);
  const file = `${OUT}/${spot.id}-${LABEL}.png`;
  await page.locator('canvas').first().screenshot({ path: file });
  receipts.push({ ...spot, label: LABEL, file, ...seated });
  console.log(`${spot.id.padEnd(26)} ${LABEL} stance=${seated.stance} seat=${JSON.stringify(seated.seat)} nearest=${JSON.stringify(seated.nearest)}`);
}

writeFileSync(`${OUT}/seats-${LABEL}.json`, JSON.stringify(receipts, null, 1));
await browser.close();
