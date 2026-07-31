import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stableStringify } from '../../src/canonical-state';
import { buildGameplayContract } from '../../src/gameplay-contract';
import { GOLDEN_REPLAYS, runGameplayReplay } from '../../src/gameplay-replay';

const root = resolve(process.cwd());
const baselineDirectory = resolve(root, 'baselines/pass25a');
const candidateDirectory = resolve(root, 'baselines/pass65-candidate');
const contractPath = resolve(candidateDirectory, 'gameplay-contract.json');
const replayPath = resolve(candidateDirectory, 'golden-replays.json');
const checkOnly = process.argv.includes('--check');
const frozenBaselineDigests = Object.freeze({
  'gameplay-contract.json': '50bc46196b6874eb216ed651e14933847b4db779a23481c3bbca42ef9d9bf18c',
  'golden-replays.json': 'f88b9da639cf9a0f332303c832dae98949d80a9e2f57848249088a5c629309c3',
});

async function main(): Promise<void> {
const packageLock = JSON.parse(await readFile(resolve(root, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, { version?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>;
};
const rootPackage = packageLock.packages[''];
const dependencyNames = Object.keys(rootPackage.dependencies ?? {}).sort();
const dependencies = Object.fromEntries(dependencyNames.map((name) => [name, packageLock.packages[`node_modules/${name}`]?.version ?? 'missing']));

const contract = {
  metadata: {
    schemaVersion: 3,
    baseline: 'Pass 65 pre-HITL arsenal candidate compared against the frozen Pass 25A oracle',
    baseSourceRevision: '5075a52d80c6db69a97ed53acc2df5368728371a',
    candidateStatus: 'pre-hitl-not-approved',
    specifiedDeltas: [
      'scattergun-strength',
      'tri-pass-strength',
      'spawn-safety',
      'streak-cycle',
      'owner-defect-fixes',
      'pass30-double-tri-pass-radius-and-damage',
      'pass30-hunter-swarm-eight-streak',
      'pass30-nuke-fifteen-streak',
      'pass30-stormfront-lighting',
      'pass54-wall-penetration',
      'pass55-range-armory-lmg',
      'pass60-sniper-headshot-three-times',
      'pass60-overdrive-two-times-thirty-seconds',
      'pass60-atomic-acres-collision-completion',
      'pass62-open-house-interior-routes',
      'pass65-protocol-v7-arsenal-and-real-weapon-names',
      'pass65-curated-and-three-custom-loadouts',
      'pass65-single-selected-grenade-and-corpse-refill',
      'pass65-coherent-pellet-shotgun-rebalance',
      'pass65-hitl-minigun-no-crit-and-25-percent-damage-reduction',
      'pass65-hitl-crossbow-compact-1.5x-optic',
      'pass65-canonical-bot-weapon-and-grenade-cycles',
      'pass65-atomic-ten-defeat-reinforcements',
      'pass66-hitl-m14-half-fire-rate-and-through-wall-thermal',
      'pass66-hitl-drone-swarm-thirty-second-lifetime',
      'pass66-hitl-carpet-bomber-friendly-fire',
      'pass66-hitl-balance-m14-62-damage-compensation',
      'pass66-hitl-balance-scattergun-95rpm-13-damage',
    ],
    generatedBy: 'scripts/qa/generate-pass25a-baselines.ts',
    dependencies,
  },
  contract: buildGameplayContract(),
};
const replays = {
  metadata: {
    schemaVersion: 3,
    baseline: 'Pass 65 pre-HITL deterministic replay candidate compared against the frozen Pass 25A oracle',
    baseSourceRevision: '5075a52d80c6db69a97ed53acc2df5368728371a',
    candidateStatus: 'pre-hitl-not-approved',
    specifiedDeltas: ['pass65-coherent-pellet-shotgun-rebalance'],
    fixedSeedPrefix: 'pass25a:',
  },
  replays: Object.fromEntries(Object.entries(GOLDEN_REPLAYS).map(([name, commands]) => {
    const result = runGameplayReplay(`pass25a:${name}`, commands);
    return [name, {
      commands,
      hash: result.hash,
      finalState: result.state,
      timeline: result.timeline,
      checkpoints: result.checkpoints,
      shotSchedule: result.shotSchedule,
    }];
  })),
};

async function verify(path: string, value: unknown): Promise<void> {
  const expected = `${stableStringify(value, 2)}\n`;
  if (!checkOnly) {
    await mkdir(candidateDirectory, { recursive: true });
    await writeFile(path, expected, 'utf8');
    console.log(`wrote ${path}`);
    return;
  }
  const actual = await readFile(path, 'utf8');
  const normalizeCheckoutEol = (text: string) => text.replaceAll('\r\n', '\n');
  if (normalizeCheckoutEol(actual) !== normalizeCheckoutEol(expected)) throw new Error(`Baseline drift: ${path}. Run npm run baseline:generate and review the diff.`);
  console.log(`verified ${path}`);
}

async function verifyFrozenBaseline(): Promise<void> {
  for (const [name, expected] of Object.entries(frozenBaselineDigests)) {
    const path = resolve(baselineDirectory, name);
    const normalized = (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
    const actual = createHash('sha256').update(normalized).digest('hex');
    if (actual !== expected) throw new Error(`Frozen Pass 25A baseline drift: ${path} (${actual} != ${expected})`);
    console.log(`verified frozen ${path}`);
  }
}

await verifyFrozenBaseline();
await verify(contractPath, contract);
await verify(replayPath, replays);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
