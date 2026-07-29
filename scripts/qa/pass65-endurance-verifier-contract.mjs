export const maximumVerifierBoundaryP99Ms = 4;
export const maximumVerifierOwnedTaskMs = 50;

function finiteDurations(values) {
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

export function percentileNearestRank(values, quantile) {
  const sorted = finiteDurations(values).sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const rank = Math.max(1, Math.ceil(Math.min(1, Math.max(0, quantile)) * sorted.length));
  return sorted[rank - 1];
}

export function auditVerifierBoundaryOwnWork(boundaries) {
  const boundaryTotals = finiteDurations(boundaries.map((boundary) => boundary.verifierBoundaryOwnWorkMs));
  const substageDurations = finiteDurations(boundaries.flatMap((boundary) => (
    Object.values(boundary.verifierBoundaryOwnWorkSubstages ?? {})
  )));
  const p99Ms = percentileNearestRank(boundaryTotals, 0.99);
  const maximumBoundaryMs = boundaryTotals.length > 0 ? Math.max(...boundaryTotals) : 0;
  const maximumSubstageMs = substageDurations.length > 0 ? Math.max(...substageDurations) : 0;
  const maximumOwnedTaskMs = Math.max(maximumBoundaryMs, maximumSubstageMs);
  const violations = [];
  if (boundaryTotals.length !== boundaries.length) {
    violations.push(`finite boundary samples ${boundaryTotals.length}/${boundaries.length}`);
  }
  if (p99Ms >= maximumVerifierBoundaryP99Ms) {
    violations.push(`verifier boundary p99 ${p99Ms.toFixed(3)}ms/${maximumVerifierBoundaryP99Ms}ms`);
  }
  if (maximumOwnedTaskMs >= maximumVerifierOwnedTaskMs) {
    violations.push(`verifier-owned task ${maximumOwnedTaskMs.toFixed(3)}ms/${maximumVerifierOwnedTaskMs}ms`);
  }
  return Object.freeze({
    sampleCount: boundaryTotals.length,
    p99Ms,
    maximumBoundaryMs,
    maximumSubstageMs,
    maximumOwnedTaskMs,
    maximumVerifierBoundaryP99Ms,
    maximumVerifierOwnedTaskMs,
    pass: violations.length === 0,
    violations: Object.freeze(violations),
  });
}
