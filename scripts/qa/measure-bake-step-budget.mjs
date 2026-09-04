/**
 * WHAT: pure-CPU measurement of what one step of the runtime baked-indirect
 * irradiance bake actually costs (worst, mean, p95, and >2x-budget overrun
 * count) per tier (low/high), on a 24-occluder proxy scene, so the bake
 * frame budget is checked as a bound rather than asserted.
 *
 * Usage:
 *   npx tsx scripts/qa/measure-bake-step-budget.mjs --steps 400 --budget 3 --out docs/evidence/pass85/lane-al/step-budget.json
 *
 * Flags (all read from process.argv; no environment variables are read):
 *   --steps <n>    number of bake steps measured per tier (default: 400)
 *   --budget <ms>  bake frame budget in milliseconds used to count overruns (default: 3)
 *   --out <path>   file to write the JSON report to (default: none, stdout only)
 *
 * Writes:
 *   - the JSON report to stdout, always
 *   - when --out is given: the report to that file, creating parent directories
 *
 * Exit codes: no explicit process.exit calls; 0 on success, non-zero on
 * uncaught exception (e.g. the --out path is not writable).
 */
/**
 * HF-418 / Lane AL - what one step of the runtime bake actually costs.
 *
 * WHY THIS EXISTS. `BAKE_FRAME_BUDGET_MS = 3` was a declared budget that the
 * stepper did not honour: it tested its deadline every 16 probes, so a step
 * paid up to sixteen probes of straight-line JavaScript however small the
 * budget was. A skeptic measured 79 ms worst at LOW and 198 ms worst at HIGH on
 * a 24-occluder proxy - the shape count every shipped arena's runtime receipt
 * reports - which is the freeze class the owner has been complaining about
 * since HF-399. The unit of work is now a RAY, and this instrument is how the
 * claim "the budget is a bound" is checked rather than asserted.
 *
 * It measures the SAME quantity in the same way for both tiers, on a proxy of
 * the size a real arena produces, and reports the whole distribution rather
 * than a headline: worst, mean, p95, and how many steps exceeded twice the
 * budget. A mean under budget with a 198 ms tail is exactly the shape of a
 * freeze, so a mean on its own would be a misleading number to publish.
 *
 * Pure CPU, no GPU, no browser. Run it any time; it disturbs nothing.
 *
 * Usage:
 *   npx tsx scripts/qa/measure-bake-step-budget.mjs --steps 400 \
 *     --out docs/evidence/pass85/lane-al/step-budget.json
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/, ''), process.argv[index + 1]);
}
const STEPS = Number(args.get('steps') ?? '400');
const BUDGET = Number(args.get('budget') ?? '3');
const OUT = args.get('out') ?? null;

const load = (relative) => import(pathToFileURL(join(process.cwd(), relative)).href);
const {
  BAKED_INDIRECT_RUNTIME_GRID, beginIrradianceBake, resolveBakedIndirectTuning,
} = await load('src/rendering/lighting/baked-indirect.ts');
const { finaliseProxyScene, groundPlaneProxy, vec3 } = await load('src/rendering/raytracing/analytic-proxy-scene.ts');

const DAYLIGHT = Object.freeze({
  sunDirection: vec3(0.3, 0.87, 0.39), sunColour: vec3(3.1, 2.9, 2.6),
  skyZenithColour: vec3(0.18, 0.26, 0.42), skyHorizonColour: vec3(0.32, 0.34, 0.38),
  skyGroundColour: vec3(0.08, 0.075, 0.07),
});

/** 24 occluders: one ground plane and 23 masses, matching the live receipts. */
function proxy24() {
  const box = (name, centre, halfExtents, albedo) => Object.freeze({
    kind: 'box', centre, halfExtents, yaw: 0, normal: vec3(0, 0, 0),
    albedo, metalness: 0, roughness: 0.8, name,
  });
  const shapes = [groundPlaneProxy(0, vec3(0.42, 0.4, 0.38))];
  for (let index = 0; index < 23; index += 1) {
    const angle = (index / 23) * Math.PI * 2;
    const radius = 8 + (index % 5) * 4;
    shapes.push(box(
      `mass-${index}`,
      vec3(Math.cos(angle) * radius, 1.5 + (index % 4), Math.sin(angle) * radius),
      vec3(2 + (index % 3), 1.5 + (index % 4), 2 + ((index + 1) % 3)),
      vec3(0.3 + (index % 7) * 0.08, 0.3 + (index % 5) * 0.1, 0.3 + (index % 3) * 0.12),
    ));
  }
  return finaliseProxyScene(shapes, shapes.length);
}

const rows = {};
for (const tier of ['low', 'high']) {
  const scene = proxy24();
  const session = beginIrradianceBake(scene, DAYLIGHT, {
    arenaId: 'step-budget', tuning: resolveBakedIndirectTuning(tier),
    fixedDimensions: BAKED_INDIRECT_RUNTIME_GRID,
  });
  const durations = [];
  while (durations.length < STEPS && !session.done()) {
    const before = performance.now();
    session.step(BUDGET);
    durations.push(performance.now() - before);
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const round = (value) => Number(value.toFixed(2));
  rows[tier] = {
    occluderShapes: scene.shapes.length,
    grid: BAKED_INDIRECT_RUNTIME_GRID.join('x'),
    budgetMs: BUDGET,
    steps: durations.length,
    // The first step carries the JIT warm-up of the whole trace path and is
    // reported separately rather than quietly dropped or quietly included.
    firstStepMs: round(durations[0]),
    worstMs: round(sorted[sorted.length - 1]),
    worstAfterFirstMs: round([...durations.slice(1)].sort((a, b) => a - b).pop() ?? 0),
    meanMs: round(durations.reduce((a, b) => a + b, 0) / durations.length),
    p95Ms: round(sorted[Math.floor(sorted.length * 0.95)]),
    overTwiceBudget: durations.filter((value) => value > BUDGET * 2).length,
    progressAfterSteps: Number(session.progress().toFixed(5)),
  };
}
const report = { at: new Date().toISOString(), node: process.version, rows };
console.log(JSON.stringify(report, null, 2));
if (OUT) {
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
