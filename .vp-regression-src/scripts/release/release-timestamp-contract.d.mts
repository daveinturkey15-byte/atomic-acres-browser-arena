export type ProductionReleaseTimestampObservation = Readonly<{
  expectedReleasedAt: string;
  observedReleasedAt: string | null;
  observedLabel: string | null;
  observedState: string | null;
}>;

export type VerifiedProductionReleaseTimestamp = Readonly<{
  releasedAt: string;
  label: string;
  state: 'CURRENT LIVE';
}>;

export declare function expectedLastReleaseLabel(releasedAt: string): string;

export declare function verifyProductionReleaseTimestamp(
  observation: ProductionReleaseTimestampObservation,
): VerifiedProductionReleaseTimestamp;
