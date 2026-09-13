export type ProductionReleaseTimestampObservation = Readonly<{
  expectedReleasedAt: string;
  /**
   * HF-406: the pass the publish is FOR. The published badge leads with it
   * (`PASS 84 - 3 AUG 2026 - 17:52 BST`), so the expected label pins the version as
   * well as the instant. Required: a publish that names the previous pass is the
   * regression this contract exists to catch, and it shipped three times.
   */
  expectedPass: string;
  observedReleasedAt: string | null;
  observedLabel: string | null;
  observedState: string | null;
}>;

export type VerifiedProductionReleaseTimestamp = Readonly<{
  releasedAt: string;
  label: string;
  state: 'CURRENT LIVE';
}>;

export declare function expectedLastReleaseLabel(releasedAt: string, expectedPass: string): string;

export declare function verifyProductionReleaseTimestamp(
  observation: ProductionReleaseTimestampObservation,
): VerifiedProductionReleaseTimestamp;
