export type ChangeImpact = Readonly<{
  mode: 'none' | 'smoke' | 'full';
  reason: 'process-only' | 'release-shell-only' | 'runtime-or-unclassified' | 'empty-or-unresolvable-diff';
}>;

export function classifyPaths(paths: readonly string[]): ChangeImpact;
