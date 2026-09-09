import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCompleteAncestry } from '../scripts/release/ancestry-inventory.mjs';
import { assertReconciliationMergeShape, readAncestryRootAllowlist } from '../scripts/release/acceptance-gate.mjs';

function fixture() {
  // Synthetic bare repositories only; no production worktree or refs are edited.
  const repo = mkdtempSync(join(tmpdir(), 'aa-ancestry-fixture-'));
  const git = (...args: string[]) => execFileSync('git', ['-C', repo,
    '-c', 'user.name=Ancestry fixture', '-c', 'user.email=fixture@example.invalid', ...args],
  { encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--bare');
  const tree = execFileSync('git', ['-C', repo, 'hash-object', '-t', 'tree', '--stdin', '-w'],
    { input: '', encoding: 'utf8', windowsHide: true }).trim();
  const root = git('commit-tree', tree, '-m', 'fixture root');
  const child = git('commit-tree', tree, '-p', root, '-m', 'fixture child');
  git('update-ref', 'refs/heads/main', child);
  git('symbolic-ref', 'HEAD', 'refs/heads/main');
  return { repo, git, root, child, tree };
}

describe('complete ancestry inventory', () => {
  it('derives actual roots from parent headers, not shallow cutoffs', () => {
    const f = fixture();
    expect(readCompleteAncestry(f.repo)).toEqual([f.root]);
    expect(f.git('cat-file', '-p', f.child)).toContain(`parent ${f.root}`);
    writeFileSync(join(f.repo, 'shallow'), `${f.child}\n`);
    expect(f.git('rev-list', '--max-parents=0', 'HEAD')).toBe(f.child);
    expect(() => readCompleteAncestry(f.repo)).toThrow(/shallow repository boundaries are not actual roots/);
  });

  it('still rejects a genuinely unlisted orphan root in the reconciliation guard', () => {
    const f = fixture();
    const orphan = f.git('commit-tree', f.tree, '-m', 'unlisted fixture orphan');
    const joined = f.git('commit-tree', f.tree, '-p', f.child, '-p', orphan, '-m', 'fixture merge');
    const roots = readCompleteAncestry(f.repo, joined);
    expect(roots).toEqual([f.root, orphan].sort());
    expect(() => assertReconciliationMergeShape({
      head: 'a'.repeat(40), base: f.child, parents: [joined, f.child],
      headTree: f.tree, firstParentTree: f.tree, firstParentIsRoot: false,
      firstParentRoots: roots, allowedRoots: [f.root], quarantinedRoots: [],
    })).toThrow(/introduces 1 root commit/);
  });

  it('the checked-in allowlist exactly matches complete repository ancestry', () => {
    const repo = fileURLToPath(new URL('..', import.meta.url));
    const recorded = readAncestryRootAllowlist(readFileSync(join(repo, '.github/ancestry-roots.json'), 'utf8'));
    expect([...recorded.allowed].sort()).toEqual(readCompleteAncestry(repo));
  });
});
