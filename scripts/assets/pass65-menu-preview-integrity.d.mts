export type OrderedFileSetDigest = Readonly<{
  algorithm: string;
  domain: string;
  fileCount: number;
  totalBytes: number;
  sha256: string;
}>;

export type DependencyClosure = Readonly<{
  schemaVersion: 1;
  algorithm: string;
  roots: readonly string[];
  excludes: readonly string[];
  extraPaths: readonly string[];
  fileCount: number;
  totalBytes: number;
  treeSha256: string;
  files: readonly Readonly<{ path: string; sizeBytes: number; sha256: string }>[];
}>;

export const FRAME_SET_ALGORITHM: string;
export const DEPENDENCY_TREE_ALGORITHM: string;
export const FINAL_MEDIA_SET_ALGORITHM: string;
export const CACHE_FAMILY_LOCK_SCHEMA_VERSION: number;
export const DEPENDENCY_ROOTS: readonly string[];
export const DEPENDENCY_EXCLUDES: readonly string[];
export const FINAL_MEDIA_EXTENSIONS: readonly string[];
export const RETAINED_CACHE_FAMILY_BASELINE: Readonly<{
  schemaVersion: number;
  algorithm: string;
  families: readonly Readonly<{
    cacheKey: string;
    recipeId: string;
    finalMediaSetSha256: string;
    fileCount: number;
    totalBytes: number;
    recordedAt: string;
  }>[];
}>;

export function sha256File(file: string): Promise<string>;
export function digestOrderedFileSet(baseDirectory: string, relativePaths: readonly string[], domain: string): Promise<OrderedFileSetDigest>;
export function orderedFrameNames(frameCount: number): string[];
export function digestOrderedFrameSet(frameRoot: string, arenaId: string, frameCount: number): Promise<OrderedFileSetDigest>;
export function finalMediaNames(arenas: readonly string[]): string[];
export function digestFinalMediaSet(runtimeRoot: string, arenas: readonly string[]): Promise<OrderedFileSetDigest>;
export function buildDependencyClosure(repositoryRoot: string, options?: {
  roots?: readonly string[];
  excludes?: readonly string[];
  extraPaths?: readonly string[];
}): Promise<DependencyClosure>;
export function cacheFamilyLockFailures(lock: unknown, baseline?: unknown): string[];
export function appendCacheFamily(lock: unknown, entry: unknown): Readonly<{ appended: boolean; lock: unknown }>;
export function runIntegrityMutationSelfTest(): Promise<Readonly<Record<string, true>>>;
