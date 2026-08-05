import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import {
  KILLSTREAK_DEMO_CAPTURE_EXCLUDED_SOURCE_PREFIXES,
  KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS,
  KILLSTREAK_DEMO_CAPTURE_SOURCE_ROOTS,
  type KillstreakDemoCaptureSourceInput,
} from '../../src/killstreak-demo-capture-contract';

function normalizeRepositoryPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function absoluteRepositoryPath(repositoryRoot: string, repositoryPath: string): string {
  const absolute = resolve(repositoryRoot, repositoryPath);
  const fromRoot = relative(repositoryRoot, absolute);
  if (!fromRoot || fromRoot.startsWith(`..${sep}`) || fromRoot === '..' || isAbsolute(fromRoot)) {
    throw new Error(`Killstreak source-closure path escaped the repository: ${repositoryPath}`);
  }
  return absolute;
}

function excluded(repositoryPath: string): boolean {
  return KILLSTREAK_DEMO_CAPTURE_EXCLUDED_SOURCE_PREFIXES.some((prefix) => (
    repositoryPath === prefix.slice(0, -1) || repositoryPath.startsWith(prefix)
  ));
}

async function collectTreeFiles(
  repositoryRoot: string,
  repositoryDirectory: string,
  output: Set<string>,
): Promise<void> {
  const absoluteDirectory = absoluteRepositoryPath(repositoryRoot, repositoryDirectory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const repositoryPath = normalizeRepositoryPath(`${repositoryDirectory}/${entry.name}`);
    if (excluded(repositoryPath)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Killstreak source closure rejects symbolic links: ${repositoryPath}`);
    if (entry.isDirectory()) {
      await collectTreeFiles(repositoryRoot, repositoryPath, output);
      continue;
    }
    if (!entry.isFile()) throw new Error(`Killstreak source closure rejects non-files: ${repositoryPath}`);
    output.add(repositoryPath);
  }
}

export function killstreakDemoSourceClosureSha256(
  inputs: readonly KillstreakDemoCaptureSourceInput[],
): string {
  const hash = createHash('sha256');
  for (const input of inputs) {
    hash.update(input.path);
    hash.update('\0');
    hash.update(input.sha256);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function collectKillstreakDemoSourceClosure(
  repositoryRoot: string,
): Promise<readonly KillstreakDemoCaptureSourceInput[]> {
  const paths = new Set<string>(KILLSTREAK_DEMO_CAPTURE_FIXED_SOURCE_INPUTS);
  for (const root of KILLSTREAK_DEMO_CAPTURE_SOURCE_ROOTS) {
    await collectTreeFiles(repositoryRoot, root, paths);
  }
  const inputs = await Promise.all([...paths].sort().map(async (path) => Object.freeze({
    path,
    sha256: createHash('sha256').update(await readFile(absoluteRepositoryPath(repositoryRoot, path))).digest('hex'),
  })));
  return Object.freeze(inputs);
}
