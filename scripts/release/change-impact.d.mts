export type ChangeImpact = Readonly<{
  mode: 'none' | 'smoke' | 'full';
  reason: 'process-only' | 'release-shell-only' | 'runtime-or-unclassified' | 'empty-or-unresolvable-diff';
}>;

export type ChangeImpactOutputs = ChangeImpact & Readonly<{
  windows_groups: string;
  linux_groups: string;
  windows_supplemental_groups: string;
  linux_supplemental_groups: string;
}>;

export function classifyPaths(paths: readonly string[]): ChangeImpact;
export function outputsFor(classification: ChangeImpact): ChangeImpactOutputs;
