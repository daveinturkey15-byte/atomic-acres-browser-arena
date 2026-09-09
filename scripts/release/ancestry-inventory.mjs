import { execFileSync } from 'node:child_process';

/** Shallow cutoffs are not parentless commits and must never seed an allowlist. */
export function readCompleteAncestry(repository, ref = 'HEAD') {
  const git = (...args) => execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024,
  }).trim();
  if (git('rev-parse', '--is-shallow-repository') !== 'false') {
    throw new Error('Ancestry unavailable: shallow repository boundaries are not actual roots; restore complete history in an isolated repository before contributing or reconciling. Do not add shallow cutoffs to the root allowlist.');
  }
  const roots = git('rev-list', '--max-parents=0', ref).split(/\r?\n/).filter(Boolean).sort();
  if (roots.length === 0) throw new Error('Complete ancestry must contain at least one root');
  for (const root of roots) {
    const header = git('cat-file', '-p', root).split(/\r?\n\r?\n/, 1)[0];
    if (/^parent /m.test(header)) throw new Error(`Reported root ${root} has a raw parent header; ancestry is incomplete or rewritten`);
  }
  return roots;
}
