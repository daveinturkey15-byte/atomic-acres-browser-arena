import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stableStringify } from '../../src/canonical-state';
import { buildGameplayContract } from '../../src/gameplay-contract';
import { GOLDEN_REPLAYS, runGameplayReplay } from '../../src/gameplay-replay';

const root = resolve(process.cwd());
const baselineDirectory = resolve(root, 'baselines/pass25a');
const contractPath = resolve(baselineDirectory, 'gameplay-contract.json');
const replayPath = resolve(baselineDirectory, 'golden-replays.json');
const checkOnly = process.argv.includes('--check');

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
    baseline: 'Pass 24 approved gameplay feel plus owner-approved deltas through Pass 55',
    baseSourceRevision: '72c313c494853ed1ee4673f06a8f064330ac9efc',
    approvedDeltas: [
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
    ],
    generatedBy: 'scripts/qa/generate-pass25a-baselines.ts',
    dependencies,
  },
  contract: buildGameplayContract(),
};
const replays = {
  metadata: {
    schemaVersion: 3,
    baseline: 'Pass 24 approved gameplay feel plus owner-approved deltas through Pass 55 range armory LMG',
    baseSourceRevision: '3a1ead06bfdede4b3d6c96f9ecde228520c04ccf',
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
    await mkdir(baselineDirectory, { recursive: true });
    await writeFile(path, expected, 'utf8');
    console.log(`wrote ${path}`);
    return;
  }
  const actual = await readFile(path, 'utf8');
  const normalizeCheckoutEol = (text: string) => text.replaceAll('\r\n', '\n');
  if (normalizeCheckoutEol(actual) !== normalizeCheckoutEol(expected)) throw new Error(`Baseline drift: ${path}. Run npm run baseline:generate and review the diff.`);
  console.log(`verified ${path}`);
}

await verify(contractPath, contract);
await verify(replayPath, replays);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
