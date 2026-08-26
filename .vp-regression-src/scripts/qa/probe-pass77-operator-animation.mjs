#!/usr/bin/env node
// Pass 77 / HF-375 live operator-animation probe.
//
// The Pass 77 modules are pure and fully unit tested, but a unit test cannot
// show that the director is actually DRIVING the game - the previous lane's
// seven modules were imported by nothing but their own tests, and every frame
// of the game was unchanged. This runs the real renderer, lets the real bots
// fight, and reads the runtime's own telemetry back out, then captures a
// third-person frame of a live operator.
//
// It asserts nothing it has not measured. Every claim in the receipt is a
// number this script observed.
//
// Usage:
//   node scripts/qa/probe-pass77-operator-animation.mjs [--url http://127.0.0.1:41876] [--arena atomic-acres]
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

const BASE = arg('--url', 'http://127.0.0.1:41876');
const ARENA = arg('--arena', 'atomic-acres');
const OUT = resolve(process.cwd(), 'artifacts/pass77/operator-animation');
mkdirSync(OUT, { recursive: true });

const SAMPLE = () => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return (snapshot.bots ?? []).map((bot) => {
    const contract = bot.operatorModel?.animationContract ?? null;
    const pass77 = contract?.pass77 ?? null;
    return {
      id: bot.id,
      alive: bot.alive,
      rootYaw: bot.rootYaw,
      activeClip: contract?.activeClip ?? bot.operatorModel?.activeClip ?? null,
      pass77,
    };
  });
};

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (error) => console.error('[pageerror]', error.message));

await page.goto(`${BASE}/?renderer=webgl2&render=quality&seed=pass77`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.__ATOMIC_ACRES_DEBUG__), undefined, { timeout: 180_000 });
await page.evaluate(async (id) => { await window.__ATOMIC_ACRES_DEBUG__.selectArena(id); }, ARENA);
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.startSolo(); });
await page.waitForFunction(() => {
  const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
  return snapshot.matchPhase === 'active' && snapshot.gameStarted === true;
}, undefined, { timeout: 180_000 });
await page.waitForTimeout(2_000);

// ---------------------------------------------------------------- live phase
// Real bots, real AI, no overrides. Everything below is observed, not staged.
const samples = [];
for (let index = 0; index < 90; index += 1) {
  samples.push(await page.evaluate(SAMPLE));
  await page.waitForTimeout(90);
}

const flat = samples.flat().filter((entry) => entry.pass77);
const withPass77 = flat.length;
const archetypes = [...new Set(flat.map((entry) => entry.pass77.archetype))].sort();
const states = [...new Set(flat.map((entry) => entry.pass77.state))].sort();
const selectedClips = [...new Set(flat.map((entry) => entry.activeClip).filter(Boolean))].sort();
const mixedClipNames = [...new Set(flat.flatMap((entry) => entry.pass77.mixedClips ?? []))].sort();
const directionalUsed = mixedClipNames.filter((clip) => ['Run_Back', 'Run_Left', 'Run_Right'].includes(clip));
const accentClips = ['Gun_Shoot', 'Idle_Gun_Shoot', 'HitRecieve', 'HitRecieve_2', 'Punch_Right', 'Kick_Right'];

const baseWeightSums = flat.map((entry) => entry.pass77.baseWeightSum).filter((value) => value > 0);
const playbackRates = flat.map((entry) => entry.pass77.playbackRate).filter((value) => typeof value === 'number');
const blendedFrames = flat.filter((entry) => (entry.pass77.layers ?? []).length > 1).length;
const aimPitches = flat.map((entry) => entry.pass77.aimPitchRadians).filter((value) => typeof value === 'number');
const yawLags = flat.map((entry) => Math.abs(entry.pass77.visualYawLagRadians ?? 0));
const mixedActionCounts = flat.map((entry) => (entry.pass77.mixedActions ?? []).length);
const lazyDirectionalBinds = Math.max(0, ...flat.map((entry) => entry.pass77.lazilyBoundDirectionalClips ?? 0));

// The Pass 77 headline defect: a finished clamped one-shot stayed scheduled at
// weight 1 for the rest of an operator's life. Per bot, count the longest run
// of consecutive samples in which the SAME accent clip was still in the mix.
const longestAccentRunByBot = new Map();
for (const bot of new Set(flat.map((entry) => entry.id))) {
  const timeline = samples
    .map((sample) => sample.find((entry) => entry.id === bot))
    .filter((entry) => entry?.pass77);
  const runs = new Map();
  let longest = 0;
  for (const frame of timeline) {
    const mixed = new Set((frame.pass77.mixedActions ?? [])
      .filter((action) => accentClips.includes(action.name))
      .map((action) => action.name));
    for (const clip of accentClips) {
      const next = mixed.has(clip) ? (runs.get(clip) ?? 0) + 1 : 0;
      runs.set(clip, next);
      longest = Math.max(longest, next);
    }
  }
  longestAccentRunByBot.set(bot, longest);
}

const accentsEverSeen = [...new Set(flat.flatMap((entry) => (entry.pass77.mixedActions ?? [])
  .map((action) => action.name)
  .filter((name) => accentClips.includes(name))))].sort();

// ------------------------------------------------------------- turn-in-place
// A deterministic pivot. `placeBotAhead` SNAPS the authoritative root yaw to
// face the player in one frame - exactly the "bot acquires a target behind it
// and rotates 180 degrees with its feet planted" case. Bots are frozen first so
// nothing else can move, then the presentation yaw lag is sampled as it decays.
// The authoritative yaw is never touched by the animation system; the lag lives
// on the stance pivot, which is presentation only.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotPresentation('stand', 0); });
await page.waitForTimeout(400);
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(6));
const turnLags = [];
const turnYaws = [];
for (let index = 0; index < 45; index += 1) {
  const frame = (await page.evaluate(SAMPLE))[0];
  if (frame?.pass77) {
    turnLags.push(frame.pass77.visualYawLagRadians);
    turnYaws.push(frame.rootYaw);
  }
  await page.waitForTimeout(40);
}
const turnInPlace = {
  peakLagRadians: Math.max(...turnLags.map(Math.abs)),
  finalLagRadians: turnLags.at(-1),
  samples: turnLags.length,
  authoritativeYawMovedDuringDecay: Math.max(...turnYaws.map((yaw) => Math.abs(yaw - turnYaws[0]))),
  monotonicDecayAfterPeak: (() => {
    const peakIndex = turnLags.map(Math.abs).indexOf(Math.max(...turnLags.map(Math.abs)));
    const tail = turnLags.slice(peakIndex).map(Math.abs);
    return tail.every((value, index) => index === 0 || value <= tail[index - 1] + 1e-6);
  })(),
};

// -------------------------------------------------------- third-person frame
const staged = await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(6));
const shots = [];
for (const [label, stance, speed] of [
  ['sprint', 'stand', 8.7],
  ['walk', 'stand', 1.3],
  ['idle', 'stand', 0],
]) {
  await page.evaluate(([s, v]) => {
    window.__ATOMIC_ACRES_DEBUG__.setBotPresentation(s, v);
  }, [stance, speed]);
  // Long enough for the cross-fade and the aim smoothing to settle.
  await page.waitForTimeout(900);
  const target = await page.evaluate(() => {
    const snapshot = window.__ATOMIC_ACRES_DEBUG__.snapshot();
    const bot = (snapshot.bots ?? [])[0];
    return bot ? { position: bot.position, id: bot.id } : null;
  });
  if (target) {
    await page.evaluate((position) => {
      window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraOrbit({
        centerX: position[0], centerY: position[1] + 1.5, centerZ: position[2],
        radius: 3.6, orbitRate: 0, yawRate: 0, baseYaw: 2.4, pitch: -0.08, fov: 55,
        lookAtX: position[0], lookAtY: position[1] + 1.05, lookAtZ: position[2],
      });
    }, target.position);
    await page.waitForTimeout(500);
  }
  const file = resolve(OUT, `third-person-${label}.png`);
  await page.screenshot({ path: file });
  const telemetry = await page.evaluate(SAMPLE);
  shots.push({ label, declaredSpeedMps: speed, file, telemetry: telemetry[0]?.pass77 ?? null });
}
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setCaptureCameraOrbit(null); });

// ------------------------------------------------------------- combat phase
// Unfreeze with a bot staged in the player's face, so bots actually acquire,
// aim and fire. This is what exercises aim pitch (patrolling bots correctly
// get none - a waypoint is a floor position) and the accent release path.
await page.evaluate(() => { window.__ATOMIC_ACRES_DEBUG__.setBotPresentation(null, 0); });
await page.evaluate(() => window.__ATOMIC_ACRES_DEBUG__.placeBotAhead(4));
const combatSamples = [];
for (let index = 0; index < 80; index += 1) {
  combatSamples.push(await page.evaluate(SAMPLE));
  await page.waitForTimeout(60);
}
const combatFlat = combatSamples.flat().filter((entry) => entry.pass77);
const combatAim = combatFlat.map((entry) => entry.pass77.aimPitchRadians).filter((value) => typeof value === 'number');
const combatAccentTimeline = combatSamples.map((sample) => new Set(sample.flatMap((entry) => (entry.pass77?.mixedActions ?? [])
  .map((action) => action.name).filter((name) => accentClips.includes(name)))));
let longestCombatAccentRun = 0;
const combatRuns = new Map();
for (const frame of combatAccentTimeline) {
  for (const clip of accentClips) {
    const next = frame.has(clip) ? (combatRuns.get(clip) ?? 0) + 1 : 0;
    combatRuns.set(clip, next);
    longestCombatAccentRun = Math.max(longestCombatAccentRun, next);
  }
}
const aimedFrame = combatFlat.find((entry) => Math.abs(entry.pass77.aimPitchRadians ?? 0) > 5e-3) ?? null;
const combat = {
  samples: combatSamples.length,
  botFrames: combatFlat.length,
  aimPitchRadians: {
    min: Math.min(...combatAim),
    max: Math.max(...combatAim),
    nonZeroFrames: combatAim.filter((value) => Math.abs(value) > 1e-3).length,
  },
  aimedFrameJoints: aimedFrame ? aimedFrame.pass77.aimJointRadians : null,
  aimedFrameJointSum: aimedFrame
    ? Object.values(aimedFrame.pass77.aimJointRadians).reduce((sum, value) => sum + value, 0)
    : null,
  accentClipsEverMixed: [...new Set(combatAccentTimeline.flatMap((set) => [...set]))].sort(),
  longestConsecutiveSamplesOneAccentStayedMixed: longestCombatAccentRun,
  maxMixedActions: Math.max(...combatFlat.map((entry) => (entry.pass77.mixedActions ?? []).length)),
  maxHitReactionWeight: Math.max(...combatFlat.map((entry) => entry.pass77.hitReactionWeight ?? 0)),
  baseWeightSumRange: [
    Math.min(...combatFlat.map((entry) => entry.pass77.baseWeightSum).filter((value) => value > 0)),
    Math.max(...combatFlat.map((entry) => entry.pass77.baseWeightSum).filter((value) => value > 0)),
  ],
};

const receipt = {
  contract: 'pass77-operator-animation-live-probe-v1',
  observedAt: new Date().toISOString(),
  arena: ARENA,
  renderer: 'webgl2',
  liveSamples: samples.length,
  botFramesWithPass77Telemetry: withPass77,
  archetypes,
  directorStatesObserved: states,
  selectedClipsObserved: selectedClips,
  mixedClipsObserved: mixedClipNames,
  directionalClipsUsed: directionalUsed,
  lazilyBoundDirectionalClipsPeak: lazyDirectionalBinds,
  baseWeightSum: {
    min: Math.min(...baseWeightSums),
    max: Math.max(...baseWeightSums),
    samples: baseWeightSums.length,
  },
  framesWithMoreThanOneBaseLayer: blendedFrames,
  playbackRate: {
    min: Math.min(...playbackRates),
    max: Math.max(...playbackRates),
    distinct: [...new Set(playbackRates)].length,
  },
  aimPitchRadians: {
    min: Math.min(...aimPitches),
    max: Math.max(...aimPitches),
    nonZeroFrames: aimPitches.filter((value) => Math.abs(value) > 1e-3).length,
  },
  visualYawLagRadians: { max: Math.max(...yawLags) },
  mixedActions: { max: Math.max(...mixedActionCounts) },
  accentClipsEverMixed: accentsEverSeen,
  longestConsecutiveSamplesOneAccentStayedMixed: Math.max(0, ...longestAccentRunByBot.values()),
  turnInPlace,
  combat,
  stagedThirdPerson: staged ? { contract: staged.contract, stagedDistanceM: staged.stagedDistanceM } : null,
  frames: shots,
};

writeFileSync(resolve(OUT, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));

await browser.close();
