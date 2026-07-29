import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const FRAME_SET_ALGORITHM = 'sha256-ordered-name-size-bytes-v1';
export const DEPENDENCY_TREE_ALGORITHM = 'sha256-path-size-file-digest-v1';
export const FINAL_MEDIA_SET_ALGORITHM = 'sha256-ordered-name-size-bytes-v1';
export const CACHE_FAMILY_LOCK_SCHEMA_VERSION = 1;
export const DEPENDENCY_ROOTS = Object.freeze(['src', 'public/assets/original']);
export const DEPENDENCY_EXCLUDES = Object.freeze(['public/assets/original/menu-previews/']);
export const FINAL_MEDIA_EXTENSIONS = Object.freeze(['mp4', 'webm', 'webp']);
export const RETAINED_CACHE_FAMILY_BASELINE = Object.freeze({
  schemaVersion: CACHE_FAMILY_LOCK_SCHEMA_VERSION,
  algorithm: FINAL_MEDIA_SET_ALGORITHM,
  families: Object.freeze([Object.freeze({
    cacheKey: 'pass65-runtime-preview-v7',
    recipeId: 'pass65-authoritative-runtime-menu-preview-v4',
    finalMediaSetSha256: '352bfbbca5a2ad06b501997c6d34f64fa70a4ae7f7a20ad93b45c757a45c5576',
    fileCount: 12,
    totalBytes: 6672030,
    recordedAt: '2026-07-28',
  })]),
});

function slash(value) {
  return value.split(path.sep).join('/');
}

function normalizedRelative(value) {
  const normalized = slash(value).replace(/^\.\//, '').replace(/\/+$/, '');
  if (!normalized || path.isAbsolute(value) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`Unsafe Pass 65 preview integrity path: ${value}`);
  }
  return normalized;
}

function ensureUniqueOrdered(paths) {
  const normalized = paths.map(normalizedRelative);
  if (new Set(normalized).size !== normalized.length) throw new Error('Pass 65 preview integrity set contains duplicate paths');
  return normalized;
}

export async function sha256File(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function digestOrderedFileSet(baseDirectory, relativePaths, domain) {
  const files = ensureUniqueOrdered(relativePaths);
  const aggregate = createHash('sha256');
  aggregate.update(`atomic-acres-pass65:${domain}:${FRAME_SET_ALGORITHM}\n`, 'utf8');
  let totalBytes = 0;
  for (const relativePath of files) {
    const absolutePath = path.resolve(baseDirectory, relativePath);
    const relativeCheck = slash(path.relative(path.resolve(baseDirectory), absolutePath));
    if (relativeCheck !== relativePath) throw new Error(`Pass 65 preview integrity path escaped its base: ${relativePath}`);
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`Pass 65 preview integrity input is not one regular file: ${relativePath}`);
    const bytes = await readFile(absolutePath);
    totalBytes += bytes.length;
    aggregate.update(relativePath, 'utf8');
    aggregate.update('\0', 'utf8');
    aggregate.update(String(bytes.length), 'utf8');
    aggregate.update('\0', 'utf8');
    aggregate.update(bytes);
    aggregate.update('\n', 'utf8');
  }
  return Object.freeze({
    algorithm: FRAME_SET_ALGORITHM,
    domain,
    fileCount: files.length,
    totalBytes,
    sha256: aggregate.digest('hex'),
  });
}

export function orderedFrameNames(frameCount) {
  if (!Number.isInteger(frameCount) || frameCount < 1) throw new Error(`Invalid Pass 65 preview frame count: ${frameCount}`);
  return Array.from({ length: frameCount }, (_, index) => `frame-${String(index + 1).padStart(4, '0')}.png`);
}

export async function digestOrderedFrameSet(frameRoot, arenaId, frameCount) {
  return digestOrderedFileSet(path.join(frameRoot, normalizedRelative(arenaId)), orderedFrameNames(frameCount), `menu-preview-frames:${arenaId}`);
}

export function finalMediaNames(arenas) {
  return ensureUniqueOrdered(arenas.flatMap((arena) => FINAL_MEDIA_EXTENSIONS.map((extension) => `${arena}.${extension}`)));
}

export async function digestFinalMediaSet(runtimeRoot, arenas) {
  const digest = await digestOrderedFileSet(runtimeRoot, finalMediaNames(arenas), 'menu-preview-final-media');
  return Object.freeze({ ...digest, algorithm: FINAL_MEDIA_SET_ALGORITHM });
}

function isExcluded(relativePath, excludes) {
  return excludes.some((prefix) => relativePath === prefix.replace(/\/$/, '') || relativePath.startsWith(prefix));
}

async function collectDependencyPath(repositoryRoot, relativePath, excludes, records) {
  const normalized = normalizedRelative(relativePath);
  if (isExcluded(normalized, excludes)) return;
  const absolute = path.resolve(repositoryRoot, normalized);
  const relativeCheck = slash(path.relative(path.resolve(repositoryRoot), absolute));
  if (relativeCheck !== normalized) throw new Error(`Dependency closure path escaped the repository: ${normalized}`);
  const metadata = await lstat(absolute);
  if (metadata.isSymbolicLink()) throw new Error(`Dependency closure rejects symbolic links: ${normalized}`);
  if (metadata.isDirectory()) {
    const children = await readdir(absolute, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const child of children) {
      if (child.isSymbolicLink()) throw new Error(`Dependency closure rejects symbolic links: ${normalized}/${child.name}`);
      await collectDependencyPath(repositoryRoot, `${normalized}/${child.name}`, excludes, records);
    }
    return;
  }
  if (!metadata.isFile()) throw new Error(`Dependency closure accepts regular files and directories only: ${normalized}`);
  if (records.has(normalized)) return;
  const bytes = await readFile(absolute);
  records.set(normalized, Object.freeze({ path: normalized, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
}

export async function buildDependencyClosure(repositoryRoot, options = {}) {
  const roots = ensureUniqueOrdered(options.roots ?? DEPENDENCY_ROOTS);
  const excludes = ensureUniqueOrdered(options.excludes ?? DEPENDENCY_EXCLUDES).map((value) => value.endsWith('/') ? value : `${value}/`);
  const extraPaths = [...new Set((options.extraPaths ?? []).map(normalizedRelative))].sort((left, right) => left.localeCompare(right, 'en'));
  for (const extraPath of extraPaths) {
    if (isExcluded(extraPath, excludes)) throw new Error(`Canonical dependency points into excluded generated preview output: ${extraPath}`);
  }
  const records = new Map();
  for (const root of roots) await collectDependencyPath(repositoryRoot, root, excludes, records);
  for (const extraPath of extraPaths) await collectDependencyPath(repositoryRoot, extraPath, excludes, records);
  const files = [...records.values()].sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const aggregate = createHash('sha256');
  aggregate.update(`atomic-acres-pass65:${DEPENDENCY_TREE_ALGORITHM}\n`, 'utf8');
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.sizeBytes;
    aggregate.update(`${file.path}\0${file.sizeBytes}\0${file.sha256}\n`, 'utf8');
  }
  return Object.freeze({
    schemaVersion: 1,
    algorithm: DEPENDENCY_TREE_ALGORITHM,
    roots: Object.freeze([...roots]),
    excludes: Object.freeze([...excludes]),
    extraPaths: Object.freeze([...extraPaths]),
    fileCount: files.length,
    totalBytes,
    treeSha256: aggregate.digest('hex'),
    files: Object.freeze(files),
  });
}

export function cacheFamilyLockFailures(lock, baseline = undefined) {
  const issues = [];
  if (lock?.schemaVersion !== CACHE_FAMILY_LOCK_SCHEMA_VERSION || lock?.algorithm !== FINAL_MEDIA_SET_ALGORITHM || !Array.isArray(lock?.families)) {
    issues.push('cache-family lock schema or algorithm is invalid');
    return issues;
  }
  const keys = new Set();
  for (const [index, family] of lock.families.entries()) {
    if (typeof family?.cacheKey !== 'string' || !/^pass65-runtime-preview-v[1-9][0-9]*$/.test(family.cacheKey)) issues.push(`cache-family entry ${index} has an invalid key`);
    if (keys.has(family?.cacheKey)) issues.push(`cache-family key is duplicated: ${family?.cacheKey}`);
    keys.add(family?.cacheKey);
    if (!/^[0-9a-f]{64}$/.test(family?.finalMediaSetSha256 ?? '')
      || family?.fileCount < 1
      || family?.totalBytes < 1
      || typeof family?.recipeId !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(family?.recordedAt ?? '')) issues.push(`cache-family entry ${family?.cacheKey ?? index} is malformed`);
  }
  if (baseline !== undefined) {
    if (!Array.isArray(baseline?.families) || baseline.families.length > lock.families.length) issues.push('cache-family lock lost retained entries');
    else {
      for (let index = 0; index < baseline.families.length; index += 1) {
        if (JSON.stringify(lock.families[index]) !== JSON.stringify(baseline.families[index])) {
          issues.push(`cache-family lock rewrote retained entry ${index}`);
        }
      }
    }
  }
  return issues;
}

export function appendCacheFamily(lock, entry) {
  const existingIssues = cacheFamilyLockFailures(lock);
  if (existingIssues.length > 0) throw new Error(existingIssues.join(' | '));
  const existing = lock.families.find((family) => family.cacheKey === entry.cacheKey);
  if (existing) {
    if (existing.finalMediaSetSha256 !== entry.finalMediaSetSha256
      || existing.fileCount !== entry.fileCount
      || existing.totalBytes !== entry.totalBytes
      || existing.recipeId !== entry.recipeId
      || existing.recordedAt !== entry.recordedAt) {
      throw new Error(`Cache key ${entry.cacheKey} is already locked to different final media bytes`);
    }
    return Object.freeze({ appended: false, lock });
  }
  const next = Object.freeze({ ...lock, families: Object.freeze([...lock.families, Object.freeze({ ...entry })]) });
  const appendIssues = cacheFamilyLockFailures(next, lock);
  if (appendIssues.length > 0) throw new Error(appendIssues.join(' | '));
  return Object.freeze({ appended: true, lock: next });
}

export async function runIntegrityMutationSelfTest() {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'atomic-acres-pass65-preview-integrity-'));
  try {
    await mkdir(path.join(temporaryRoot, 'src'), { recursive: true });
    await mkdir(path.join(temporaryRoot, 'public/assets/original/menu-previews'), { recursive: true });
    await mkdir(path.join(temporaryRoot, 'public/assets/original/models'), { recursive: true });
    await writeFile(path.join(temporaryRoot, 'src/main.ts'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(temporaryRoot, 'public/assets/original/models/map.glb'), Buffer.from([1, 2, 3, 4]));
    await writeFile(path.join(temporaryRoot, 'public/assets/original/menu-previews/generated.webp'), Buffer.from([8, 8, 8]));
    const baseline = await buildDependencyClosure(temporaryRoot, { extraPaths: ['public/assets/original/models/'] });
    await writeFile(path.join(temporaryRoot, 'src/main.ts'), 'export const value = 2;\n', 'utf8');
    const includedMutation = await buildDependencyClosure(temporaryRoot, { extraPaths: ['public/assets/original/models/'] });
    if (includedMutation.treeSha256 === baseline.treeSha256) throw new Error('dependency closure self-test missed an included source mutation');
    await writeFile(path.join(temporaryRoot, 'src/main.ts'), 'export const value = 1;\n', 'utf8');
    await writeFile(path.join(temporaryRoot, 'public/assets/original/models/map.glb'), Buffer.from([1, 2, 3, 5]));
    const assetMutation = await buildDependencyClosure(temporaryRoot, { extraPaths: ['public/assets/original/models/'] });
    if (assetMutation.treeSha256 === baseline.treeSha256) throw new Error('dependency closure self-test missed an included asset mutation');
    await writeFile(path.join(temporaryRoot, 'public/assets/original/models/map.glb'), Buffer.from([1, 2, 3, 4]));
    await writeFile(path.join(temporaryRoot, 'public/assets/original/menu-previews/generated.webp'), Buffer.from([9, 9, 9]));
    const excludedMutation = await buildDependencyClosure(temporaryRoot, { extraPaths: ['public/assets/original/models/'] });
    if (excludedMutation.treeSha256 !== baseline.treeSha256) throw new Error('dependency closure self-test admitted generated preview output');

    const frameDirectory = path.join(temporaryRoot, 'frames/atomic-acres');
    await mkdir(frameDirectory, { recursive: true });
    await writeFile(path.join(frameDirectory, 'frame-0001.png'), Buffer.from([1, 1, 1]));
    await writeFile(path.join(frameDirectory, 'frame-0002.png'), Buffer.from([2, 2, 2]));
    const frames = await digestOrderedFrameSet(path.join(temporaryRoot, 'frames'), 'atomic-acres', 2);
    await writeFile(path.join(frameDirectory, 'frame-0002.png'), Buffer.from([2, 2, 3]));
    const mutatedFrames = await digestOrderedFrameSet(path.join(temporaryRoot, 'frames'), 'atomic-acres', 2);
    if (mutatedFrames.sha256 === frames.sha256) throw new Error('frame-set self-test missed a staged-frame mutation');

    const initialLock = Object.freeze({
      schemaVersion: CACHE_FAMILY_LOCK_SCHEMA_VERSION,
      algorithm: FINAL_MEDIA_SET_ALGORITHM,
      families: Object.freeze([Object.freeze({
        cacheKey: 'pass65-runtime-preview-v1',
        recipeId: 'fixture-v1',
        finalMediaSetSha256: '1'.repeat(64),
        fileCount: 12,
        totalBytes: 120,
        recordedAt: '2026-07-29',
      })]),
    });
    if (cacheFamilyLockFailures(initialLock).length > 0) throw new Error('cache-family self-test rejected its valid fixture');
    let conflictingKeyRejected = false;
    try {
      appendCacheFamily(initialLock, { ...initialLock.families[0], finalMediaSetSha256: '2'.repeat(64) });
    } catch {
      conflictingKeyRejected = true;
    }
    if (!conflictingKeyRejected) throw new Error('cache-family self-test accepted key reuse with different bytes');
    const rewritten = { ...initialLock, families: [{ ...initialLock.families[0], totalBytes: 121 }] };
    if (!cacheFamilyLockFailures(rewritten, initialLock).some((issue) => issue.includes('rewrote retained entry'))) {
      throw new Error('cache-family self-test missed retained-entry rewriting');
    }
    return Object.freeze({
      dependencyIncludedMutationRejected: true,
      dependencyAssetMutationRejected: true,
      dependencyGeneratedOutputExcluded: true,
      stagedFrameMutationRejected: true,
      cacheKeyReuseRejected: true,
      cacheAppendOnlyRewriteRejected: true,
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}
