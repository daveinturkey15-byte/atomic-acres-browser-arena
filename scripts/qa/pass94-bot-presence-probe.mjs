// PASS 94 / HF-491: headless bot-presence + spawn-distribution probe.
//
// Boots a Solo match on each named arena, samples the live debug snapshot for a
// fixed window, and records: requested vs alive bot count, where every bot was
// SPAWNED (selectSafeBotSpawn's own audit), how far each bot has travelled since
// its spawn, its navigation state, and every console warning/error. Headless
// only; one browser, closed on exit.
//
// Usage: node scripts/qa/pass94-bot-presence-probe.mjs <label> [arenaIds...]
//   BASE_URL      default http://127.0.0.1:4300/
//   SAMPLE_MS     default 60000
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:4300/';
const SAMPLE_MS = Number(process.env.SAMPLE_MS ?? 60_000);
const LABEL = process.argv[2] ?? 'run';
const ARENAS = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ['nuketown2', 'skyline-terminal'];
const OUT = resolve('docs/evidence/pass94/bots-hitl5');

const MENU_QUERY = '?release=latest&renderer=webgpu&grass=off&mist=off&clouds=off&rays=off&seed=hf491-bot-probe&previewTime=0';

function sample(page) {
  return page.evaluate(() => {
    const api = globalThis.__ATOMIC_ACRES_DEBUG__;
    const s = typeof api?.snapshot === 'function' ? api.snapshot() : null;
    if (!s) return null;
    return {
      t: Math.round(performance.now()),
      matchPhase: s.matchPhase ?? null,
      gameStarted: s.gameStarted ?? null,
      escalation: s.botEscalation ?? null,
      playerPosition: s.player?.position ?? null,
      spawnSelections: s.botSpawnSelections ?? [],
      bots: (s.bots ?? []).map((b) => ({
        id: b.id, alive: b.alive, hp: b.hp, position: b.position, waypoint: b.waypoint,
        blockedSince: b.blockedSince, hasLineOfSight: b.hasLineOfSight,
        rootVisible: b.rootVisible, rootEffectivelyVisible: b.rootEffectivelyVisible,
        effectivelyVisibleMeshCount: b.effectivelyVisibleMeshCount,
      })),
    };
  }).catch(() => null);
}

async function runArena(browser, arenaId) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleMessages = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') consoleMessages.push({ type: m.type(), text: m.text().slice(0, 400) });
  });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 400)));

  const result = { arenaId, ok: false, reason: null, samples: [], consoleMessages, pageErrors };
  try {
    await page.goto(BASE_URL.replace(/\/$/, '/') + MENU_QUERY, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForFunction(() => Boolean(globalThis.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 120_000 });
    await page.evaluate(async (id) => { await globalThis.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, arenaId);
    await page.evaluate(() => { globalThis.__ATOMIC_ACRES_DEBUG__.startSolo(); });
    const deployStart = Date.now();
    const outcome = await page.waitForFunction(() => {
      const s = globalThis.__ATOMIC_ACRES_DEBUG__?.snapshot();
      if (s?.matchPhase === 'active' && s?.gameStarted === true) return 'active';
      const status = document.querySelector('#status')?.textContent ?? '';
      if (/deployment preparation failed|renderer blocked/i.test(status)) return 'deploy-failed: ' + status;
      return null;
    }, undefined, { timeout: 180_000 }).then((h) => h.jsonValue());
    result.deployMs = Date.now() - deployStart;
    if (outcome !== 'active') { result.reason = outcome; return result; }

    const started = Date.now();
    while (Date.now() - started < SAMPLE_MS) {
      const s = await sample(page);
      if (s) { s.sinceActiveMs = Date.now() - started; result.samples.push(s); }
      await page.waitForTimeout(1_000);
    }
    result.ok = true;
  } catch (error) {
    result.reason = String(error).slice(0, 500);
  } finally {
    await page.close().catch(() => undefined);
  }
  return result;
}

function summarise(run) {
  if (!run.ok || run.samples.length === 0) {
    return { arenaId: run.arenaId, ok: false, reason: run.reason, pageErrors: run.pageErrors };
  }
  const last = run.samples[run.samples.length - 1];
  const first = run.samples[0];
  const firstAlive = run.samples.find((s) => s.bots.some((b) => b.alive));
  const spawnPoints = new Map();
  const travel = new Map();
  const startPos = new Map();
  const states = new Map();
  for (const s of run.samples) {
    for (const sel of s.spawnSelections) spawnPoints.set(sel.actorId ?? sel.id ?? JSON.stringify(sel.position), sel);
    for (const b of s.bots) {
      if (!startPos.has(b.id)) startPos.set(b.id, b.position);
      const p0 = startPos.get(b.id);
      const d = Math.hypot(b.position[0] - p0[0], b.position[2] - p0[2]);
      travel.set(b.id, Math.max(travel.get(b.id) ?? 0, d));
      const set = states.get(b.id) ?? new Set();
      set.add(!b.alive ? 'dead' : b.blockedSince > 0 ? 'stuck' : (travel.get(b.id) ?? 0) > 1 ? 'navigating' : 'idle');
      states.set(b.id, set);
    }
  }
  return {
    arenaId: run.arenaId,
    ok: true,
    deployMs: run.deployMs,
    requestedBots: last.escalation?.initialBots ?? null,
    targetBots: last.escalation?.targetBots ?? null,
    activeBots: last.escalation?.activeBots ?? null,
    dormantBots: last.escalation?.dormantBots ?? null,
    maximumBots: last.escalation?.maximumBots ?? null,
    nextReinforcementAt: last.escalation?.nextReinforcementAt ?? null,
    firstAliveAtMs: firstAlive ? firstAlive.sinceActiveMs : null,
    aliveAtFirstSample: first.bots.filter((b) => b.alive).length,
    spawnSelections: [...spawnPoints.values()],
    distinctSpawnIndices: [...new Set([...spawnPoints.values()].map((v) => v.index))],
    perBot: [...travel.keys()].map((id) => ({
      id,
      spawnedAt: startPos.get(id),
      travelledM: Number((travel.get(id) ?? 0).toFixed(2)),
      states: [...(states.get(id) ?? [])],
      finalDistanceToPlayerM: (() => {
        const b = last.bots.find((x) => x.id === id);
        if (!b || !last.playerPosition) return null;
        return Number(Math.hypot(b.position[0] - last.playerPosition[0], b.position[2] - last.playerPosition[2]).toFixed(2));
      })(),
      everEffectivelyVisible: run.samples.some((s) => s.bots.find((x) => x.id === id)?.rootEffectivelyVisible === true),
    })),
    warnings: run.consoleMessages.length,
    pageErrors: run.pageErrors,
  };
}

// HITL 5 integration: bundled headless Chromium offers NO WebGPU adapter on
// dave-gaming-pc (the lane recorded exactly that in probe-before.json), so the
// probe launches installed Chrome with the same native-WebGPU flags the stock
// arena gates use (playwright.config.ts under PASS73_NATIVE_WEBGPU=1): headless,
// mute, parked off-screen, real GPU adapter.
const browser = await chromium.launch({
  headless: true,
  channel: 'chrome',
  args: [
    '--mute-audio',
    '--enable-unsafe-webgpu',
    '--use-angle=d3d11',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--window-position=-32000,-32000',
    '--window-size=2640,1520',
  ],
});
const runs = [];
try {
  for (const arenaId of ARENAS) {
    process.stdout.write('[probe] ' + arenaId + ' ...\n');
    const run = await runArena(browser, arenaId);
    runs.push(run);
    process.stdout.write('[probe] ' + arenaId + ' -> ' + JSON.stringify(summarise(run), null, 2) + '\n');
  }
} finally {
  await browser.close();
}
mkdirSync(OUT, { recursive: true });
writeFileSync(
  resolve(OUT, 'probe-' + LABEL + '.json'),
  JSON.stringify({ baseUrl: BASE_URL, sampleMs: SAMPLE_MS, at: new Date().toISOString(), runs: runs.map(summarise), raw: runs }, null, 2),
);
process.stdout.write('[probe] wrote docs/evidence/pass94/bots-hitl5/probe-' + LABEL + '.json\n');
