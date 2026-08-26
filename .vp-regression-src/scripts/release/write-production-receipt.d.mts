export function buildProductionReceipt(input: Readonly<{
  sourceSha: string;
  releasePass: string;
  releaseStartedAt: string;
  releaseBuiltAt: string;
  workflowRun: string;
  topology: Record<string, unknown>;
  pages: Record<string, unknown>;
  liveSmoke: Record<string, unknown>;
  acceptance: Record<string, unknown>;
}>): Readonly<{
  schemaVersion: number;
  durations: Readonly<{
    startToBuildMs: number;
    buildToPagesMs: number;
    pagesToLiveMs: number;
    totalMs: number;
  }>;
  [key: string]: unknown;
}>;
