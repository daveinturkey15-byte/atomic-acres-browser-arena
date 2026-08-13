export type Pass71StuckEvidenceExpected = Readonly<{
  sourceSha: string;
  tooling: Readonly<Record<string, string>>;
}>;

export const PASS71_STUCK_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-310';
  kind: 'pass71-hf310-stuck-two-peer-raster-component';
  contract: string;
  gate: string;
  sources: readonly ['semtex', 'explosive-crossbow'];
  audiences: readonly ['attacker', 'victim'];
  layouts: readonly Readonly<{
    id: 'desktop' | 'mobile-landscape' | 'reduced-sensory';
    width: number;
    height: number;
    reducedSensory: boolean;
  }>[];
  frameCount: 12;
}>;

export const PASS71_STUCK_EVIDENCE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-310';
  kind: 'pass71-hf310-stuck-two-peer-raster-component';
  minimumCount: 1;
  maximumCount: 1;
}>;

export const PASS71_STUCK_EVIDENCE_TOOL_PATHS: Readonly<Record<string, string>>;
export const PASS71_STUCK_CLAIMS: Readonly<{
  observed: string;
  inference: string;
  assumption: string;
  unknown: string;
  falsifiers: string;
}>;

export function pass71StuckEvidenceCanonicalBytes(record: Readonly<Record<string, unknown>>): Buffer;
export function pass71StuckEvidenceRecordSha256(record: Readonly<Record<string, unknown>>): string;
export function pass71StuckEvidenceToolingHashes(repositoryRoot: string): Readonly<Record<string, string>>;
export function pass71StuckEvidenceToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): Readonly<Record<string, string>>;
export function pass71StuckRasterMetrics(
  pngBytes: Buffer,
  bounds: Readonly<{ left: number; top: number; width: number; height: number }>,
): Readonly<{
  imageWidth: number;
  imageHeight: number;
  crop: Readonly<{ left: number; top: number; width: number; height: number }>;
  pixelCount: number;
  brightRedPixels: number;
  darkPanelPixels: number;
  brightRedFraction: number;
  darkPanelFraction: number;
}>;
export function pass71StuckEvidenceFailures(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71StuckEvidenceExpected,
): readonly string[];
export function assertPass71StuckEvidence(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71StuckEvidenceExpected,
): Readonly<Record<string, unknown>>;
export function createPass71StuckEvidenceFixture(options?: Readonly<{
  sourceSha?: string;
  tooling?: Readonly<Record<string, string>>;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, any>;
