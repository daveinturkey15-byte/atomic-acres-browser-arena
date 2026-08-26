import { describe, expect, it } from 'vitest';
import {
  auditVerifierBoundaryOwnWork,
  maximumVerifierBoundaryP99Ms,
  maximumVerifierOwnedTaskMs,
  percentileNearestRank,
} from '../scripts/qa/pass65-endurance-verifier-contract.mjs';

describe('Pass 65 endurance verifier own-work contract', () => {
  const boundary = (total: number, substages: Record<string, number> = { healthSampleMs: total / 2 }) => ({
    verifierBoundaryOwnWorkMs: total,
    verifierBoundaryOwnWorkSubstages: substages,
  });

  it('uses nearest-rank p99 and admits only allocation-light live boundaries', () => {
    expect(percentileNearestRank([0.4, 1.2, 3.9], 0.99)).toBe(3.9);
    expect(auditVerifierBoundaryOwnWork([
      boundary(0.4),
      boundary(1.2),
      boundary(3.9),
    ])).toMatchObject({
      sampleCount: 3,
      p99Ms: 3.9,
      maximumOwnedTaskMs: 3.9,
      maximumVerifierBoundaryP99Ms,
      maximumVerifierOwnedTaskMs,
      pass: true,
      violations: [],
    });
  });

  it('rejects the exact p99 boundary and every verifier-owned 50ms task', () => {
    expect(auditVerifierBoundaryOwnWork([boundary(4)])).toMatchObject({ pass: false, p99Ms: 4 });
    const longTask = auditVerifierBoundaryOwnWork([
      boundary(3, { healthSampleMs: 1, nextWindowSetupMs: 50 }),
    ]);
    expect(longTask).toMatchObject({ pass: false, maximumOwnedTaskMs: 50 });
    expect(longTask.violations).toContain('verifier-owned task 50.000ms/50ms');
  });

  it('rejects missing or non-finite boundary receipts', () => {
    const audit = auditVerifierBoundaryOwnWork([
      boundary(1),
      boundary(Number.NaN),
    ]);
    expect(audit.pass).toBe(false);
    expect(audit.violations).toContain('finite boundary samples 1/2');
  });
});
