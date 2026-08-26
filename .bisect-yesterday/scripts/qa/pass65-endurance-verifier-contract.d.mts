export const maximumVerifierBoundaryP99Ms: 4;
export const maximumVerifierOwnedTaskMs: 50;

export type VerifierBoundaryOwnWorkSample = Readonly<{
  verifierBoundaryOwnWorkMs: number;
  verifierBoundaryOwnWorkSubstages: Readonly<Record<string, number>>;
}>;

export type VerifierBoundaryOwnWorkAudit = Readonly<{
  sampleCount: number;
  p99Ms: number;
  maximumBoundaryMs: number;
  maximumSubstageMs: number;
  maximumOwnedTaskMs: number;
  maximumVerifierBoundaryP99Ms: 4;
  maximumVerifierOwnedTaskMs: 50;
  pass: boolean;
  violations: readonly string[];
}>;

export function percentileNearestRank(values: readonly number[], quantile: number): number;
export function auditVerifierBoundaryOwnWork(
  boundaries: readonly VerifierBoundaryOwnWorkSample[],
): VerifierBoundaryOwnWorkAudit;
