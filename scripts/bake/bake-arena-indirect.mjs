/**
 * HF-418 / Lane AL — the OFFLINE bake, and the cache that makes it worth doing.
 *
 * WHAT THIS IS FOR. The runtime bakes on the machine that is playing, spread
 * over frames so nothing stalls (see `baked-indirect-runtime.ts`). That works
 * everywhere and needs no build step, which is deliberate: a feature that only
 * works on arenas somebody remembered to bake is a feature that is silently off
 * on the newest map. But it costs CPU during loading on every machine, every
 * session, for a result that is identical every time. This script pays that
 * cost once, at build time, and the runtime then pays a decode.
 *
 * THE CACHE KEY IS THE DIGEST, AND THE DIGEST COVERS EVERYTHING THAT MATTERS.
 * Geometry, lighting AND tier. A cached volume whose digest does not match the
 * inputs is not served - it is not "close enough". A noon bake served at dusk
 * is a lighting bug that presents as an art bug, and the day someone decides
 * the cache should be keyed on the arena name instead is the day that ships.
 *
 * WHERE THE PROXY SCENE COMES FROM. The extractor walks a live three.js scene
 * graph, so a genuinely offline bake needs the arena built - which needs a
 * browser with WebGPU. This script therefore takes an already-extracted proxy
 * scene as JSON (`--proxy`) rather than pretending it can build an arena in
 * Node. `scripts/qa/extract-arena-proxy.mjs` is the headless stage that
 * produces one. Splitting them this way keeps the expensive, deterministic,
 * GPU-free half runnable on any machine at any time, including in CI.
 *
 * Usage:
 *   node scripts/bake/bake-arena-indirect.mjs --proxy artifacts/proxy/atomic-acres.json \
 *     --arena atomic-acres --tier low --out src/rendering/lighting/baked
 *   node scripts/bake/bake-arena-indirect.mjs --self-test \
 *     --proxy artifacts/proxy/atomic-acres.json --tier low --repeats 3
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsx = (() => {
  try { return require.resolve('tsx'); } catch { return null; }
})();
if (!tsx) {
  console.error('[bake] needs `tsx` to import the TypeScript bake module. Run through `npx tsx`.');
}

// A flag parser that understands VALUELESS flags. The previous one advanced two
// at a time unconditionally, so `--self-test --tier high` set `self-test` to
// "--tier" and then read `high` as a key: the tier was silently dropped unless
// it happened to be written before `--self-test`. A CLI that quietly ignores the
// argument that selects what you are measuring is how a table of numbers comes
// to describe something other than what its caller asked for.
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index];
  if (!token.startsWith('--')) continue;
  const next = process.argv[index + 1];
  if (next === undefined || next.startsWith('--')) {
    args.set(token.replace(/^--/, ''), true);
  } else {
    args.set(token.replace(/^--/, ''), next);
    index += 1;
  }
}

const {
  BAKED_INDIRECT_RUNTIME_GRID,
  beginIrradianceBake,
  computeBakeDigest,
  deserialiseIrradianceVolume,
  resolveBakedIndirectTuning,
  serialiseIrradianceVolume,
} = await import(pathToFileURL(join(process.cwd(), 'src/rendering/lighting/baked-indirect.ts')).href);

const TIER = args.get('tier') ?? 'low';
const OUT = args.get('out') ?? 'src/rendering/lighting/baked';
const tuning = resolveBakedIndirectTuning(TIER);

if (args.has('self-test')) {
  // A bake of a known scene, repeated, to prove the cache key and the output are
  // both reproducible on this machine before anyone trusts a committed volume.
  //
  // WHAT THIS BAKES MATTERS AS MUCH AS WHETHER IT REPEATS. The default scene is
  // `syntheticScene()`, which has SIX occluders. Every shipped arena's runtime
  // receipt reports TWENTY-FOUR, and bake cost is dominated by shape count -
  // every ray intersects every shape. The first version of the lighting document
  // quoted this synthetic run as the arena bake cost and was several times too
  // low as a result. Pass `--proxy <file from scripts/qa/extract-arena-proxy.mjs>`
  // to self-test against a real arena, which is what the published table now is.
  const selfTestProxyPath = args.get('proxy');
  let scene = syntheticScene();
  let lighting = syntheticLighting();
  let sceneName = 'synthetic-6-occluders';
  if (selfTestProxyPath) {
    const loaded = JSON.parse(await readFile(selfTestProxyPath, 'utf8'));
    if (!loaded.lighting) {
      console.error('[bake] the proxy file carries no `lighting` block; the digest would be a lie.');
      process.exit(2);
    }
    scene = loaded.scene;
    lighting = loaded.lighting;
    sceneName = `${loaded.arenaId ?? 'arena'} (extracted)`;
  }
  const repeats = Math.max(2, Number(args.get('repeats') ?? '2'));
  const runs = [];
  for (let index = 0; index < repeats; index += 1) runs.push(runBake(scene, lighting, 'self-test'));
  const first = runs[0];
  const identical = runs.every((run) => run.volume.coefficients
    .every((value, index) => value === first.volume.coefficients[index]));
  const digestStable = runs.every((run) => run.volume.digest === first.volume.digest);
  const times = runs.map((run) => Math.round(run.elapsedMs));
  // The cached path, measured rather than asserted: serialise and deserialise
  // the volume the way a committed build-time bake is consumed. The old table
  // published a "cached 0 ms" row with no measurement behind it anywhere.
  const cacheStart = performance.now();
  const roundTripped = deserialiseIrradianceVolume(serialiseIrradianceVolume(first.volume));
  const cacheMs = performance.now() - cacheStart;
  const serialised = JSON.stringify(serialiseIrradianceVolume(first.volume));
  console.log(JSON.stringify({
    tier: TIER,
    scene: sceneName,
    proxy: selfTestProxyPath ?? null,
    digest: first.volume.digest,
    digestStable,
    coefficientsIdentical: identical,
    probes: first.volume.dimensions.reduce((a, b) => a * b, 1),
    grid: first.volume.dimensions.join('x'),
    repeats,
    bakeMs: times,
    bakeMsMedian: [...times].sort((a, b) => a - b)[Math.floor(times.length / 2)],
    bakeMsMin: Math.min(...times),
    bakeMsMax: Math.max(...times),
    cacheDecodeMs: Number(cacheMs.toFixed(2)),
    cacheDecodeMatches: roundTripped.digest === first.volume.digest,
    occluderShapes: first.volume.bake.occluderShapes,
    filledProbes: first.volume.bake.filledProbes,
    serialisedBytes: serialised.length,
    at: new Date().toISOString(),
  }, null, 2));
  process.exit(identical && digestStable ? 0 : 1);
}

const proxyPath = args.get('proxy');
if (!proxyPath) {
  console.error('[bake] --proxy <extracted proxy scene json> is required (or --self-test).');
  process.exit(2);
}
const proxy = JSON.parse(await readFile(proxyPath, 'utf8'));
const arenaId = args.get('arena') ?? proxy.arenaId ?? 'arena';
const lighting = proxy.lighting;
if (!lighting) {
  console.error('[bake] the proxy file carries no `lighting` block; the digest would be a lie.');
  process.exit(2);
}
const digest = computeBakeDigest(proxy.scene, lighting, tuning);

await mkdir(OUT, { recursive: true });
const existing = (await readdir(OUT).catch(() => [])).filter((name) => name.startsWith(`${arenaId}.`));
const cacheName = `${arenaId}.${digest}.json`;
if (existing.includes(cacheName)) {
  console.log(JSON.stringify({ arenaId, tier: TIER, digest, cached: true, bakeMs: 0, file: join(OUT, cacheName) }, null, 2));
  process.exit(0);
}

const { volume, elapsedMs } = runBake(proxy.scene, lighting, arenaId);
const payload = serialiseIrradianceVolume(volume);
const text = `${JSON.stringify(payload)}\n`;
await writeFile(join(OUT, cacheName), text, 'utf8');
// A stale volume for the same arena under a different digest is dead weight,
// but deleting it is the caller's call: an arena baked for two times of day
// legitimately has two.
console.log(JSON.stringify({
  arenaId,
  tier: TIER,
  digest,
  cached: false,
  bakeMs: Math.round(elapsedMs),
  probes: volume.dimensions.reduce((a, b) => a * b, 1),
  grid: volume.dimensions.join('x'),
  occluderShapes: volume.bake.occluderShapes,
  filledProbes: volume.bake.filledProbes,
  bytes: text.length,
  supersededVolumesForThisArena: existing,
  file: join(OUT, cacheName),
}, null, 2));

function runBake(scene, lighting, arenaId) {
  const startedAt = performance.now();
  const session = beginIrradianceBake(scene, lighting, {
    arenaId, tuning, fixedDimensions: BAKED_INDIRECT_RUNTIME_GRID,
  });
  while (!session.step(Number.POSITIVE_INFINITY)) { /* one pass */ }
  return { volume: session.volume(), elapsedMs: performance.now() - startedAt };
}

function syntheticScene() {
  const shape = (name, centre, halfExtents, albedo) => ({
    kind: 'box', centre, halfExtents, yaw: 0, normal: [0, 0, 0],
    albedo, metalness: 0, roughness: 0.8, name,
  });
  const shapes = [
    { kind: 'plane', centre: [0, 0, 0], halfExtents: [0, 0, 0], yaw: 0, normal: [0, 1, 0], albedo: [0.42, 0.4, 0.38], metalness: 0, roughness: 0.85, name: 'ground' },
    shape('north-wall', [0, 4, 26], [30, 4, 0.5], [0.78, 0.16, 0.12]),
    shape('south-wall', [0, 4, -26], [30, 4, 0.5], [0.62, 0.6, 0.55]),
    shape('block-a', [-9, 3, 4], [5, 3, 5], [0.55, 0.53, 0.48]),
    shape('block-b', [11, 2.5, -6], [4, 2.5, 6], [0.5, 0.5, 0.46]),
    shape('roof', [0, 9, 0], [14, 0.4, 14], [0.35, 0.34, 0.32]),
  ];
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const item of shapes) {
    const extent = item.kind === 'sphere' ? [item.halfExtents[0], item.halfExtents[0], item.halfExtents[0]] : item.halfExtents;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], item.centre[axis] - extent[axis]);
      max[axis] = Math.max(max[axis], item.centre[axis] + extent[axis]);
    }
  }
  return {
    shapes, boundsMin: min, boundsMax: max, candidatesConsidered: shapes.length,
    reflectiveMeshCount: 0, reflectiveFootprintM2: 0, capReason: 'synthetic self-test scene',
  };
}

function syntheticLighting() {
  return {
    sunDirection: [0.3333333333333333, 0.8333333333333334, 0.4166666666666667],
    sunColour: [1.5, 1.375, 1.25],
    skyZenithColour: [0.25, 0.25, 0.25],
    skyHorizonColour: [0.25, 0.25, 0.25],
    skyGroundColour: [0.125, 0.125, 0.125],
  };
}
