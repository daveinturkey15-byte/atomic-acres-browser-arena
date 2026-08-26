import { readdirSync, readFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = fileURLToPath(new URL('.', import.meta.url));
const retiredLabels = [
  /\bM86\b/i,
  /\bVectorline\b/i,
  /\bMastiff(?:\s+63)?\b/i,
  /\bModel\s+12\b/i,
  /\bLongline\b/i,
  /\bVX-8\b/i,
  /\bAster(?:\s*9|\s*18)?\b/i,
  /\bVerdict(?:\s+Magnum)?\b/i,
  /\bG18\s+AUTO\b/i,
] as const;

function runtimeSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return runtimeSourceFiles(path);
    if (extname(path) !== '.ts' || path.endsWith('.test.ts')) return [];
    const normalized = relative(sourceRoot, path).replaceAll('\\', '/');
    if (normalized === 'changelog.ts' || normalized.startsWith('combat/fixtures/')) return [];
    return [path];
  });
}

describe('real-world weapon display-name contract', () => {
  it('does not emit retired fictional labels outside explicit historical fixtures', () => {
    const violations = runtimeSourceFiles(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return retiredLabels
        .filter((pattern) => pattern.test(source))
        .map((pattern) => `${relative(sourceRoot, path).replaceAll('\\', '/')}: ${pattern.source}`);
    });
    expect(violations).toEqual([]);
  });
});
