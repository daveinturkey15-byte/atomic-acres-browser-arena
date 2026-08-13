export type Pass71QualityVisualExpected = Readonly<{
  sourceSha: string;
  tooling: Readonly<Record<string, string>>;
}>;

export type Pass71QualityVisualPngEvidence = Readonly<{
  encoding: 'png-base64-lossless';
  sha256: string;
  encodedBytes: number;
  width: 640;
  height: 360;
  bitDepth: 8;
  colorType: 2 | 6;
  opaque: boolean;
  base64: string;
  metrics: Readonly<{
    meanLuminance255: number;
    luminanceStdDev255: number;
    meanEdgeDelta255: number;
    entropyBits: number;
  }>;
}>;

export type Pass71QualityVisualPairMetrics = Readonly<{
  meanAbsoluteChannelDelta255: number;
  rootMeanSquareChannelDelta255: number;
  p95AbsoluteChannelDelta255: number;
  changedPixelRatioAt8: number;
  globalSsim: number;
  candidateToBaselineLuminanceStdDevRatio: number;
  candidateToBaselineEdgeEnergyRatio: number;
  candidateToBaselineEntropyDeltaBits: number;
}>;

export const PASS71_QUALITY_VISUAL_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-303';
  feedbackId: 'HF-303';
  kind: 'pass71-hf303-atomic-quality-visual-parity';
  contract: string;
  gate: string;
  baseline: Readonly<Record<string, string | number>>;
  backends: readonly ['webgl2', 'webgpu'];
  subjects: readonly ['pass70', 'candidate'];
  namedQuality: Readonly<{
    label: 'QUALITY'; preset: 'high'; storageKey: 'atomic-acres-pass65-settings-v1';
    storageVersion: 1; queryRenderProfileOverride: null; resolvedRenderProfile: 'blender';
  }>;
  camera: Readonly<Record<string, string | number | readonly number[]>>;
  viewport: Readonly<{ width: 640; height: 360; deviceScaleFactor: 1 }>;
  thresholds: Readonly<Record<string, number>>;
}>;
export const PASS71_QUALITY_VISUAL_EVIDENCE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-303';
  kind: 'pass71-hf303-atomic-quality-visual-parity';
  minimumCount: 0;
  maximumCount: 1;
}>;
export const PASS71_QUALITY_VISUAL_TOOL_PATHS: Readonly<Record<string, string>>;
export const PASS71_QUALITY_GRAPHICS: Readonly<Record<string, unknown>>;
export const PASS71_QUALITY_RUNTIME: Readonly<Record<string, unknown>>;
export type Pass71QualityVisualEvidenceRegistryEntry = Readonly<{
  descriptor: typeof PASS71_QUALITY_VISUAL_EVIDENCE_DESCRIPTOR;
  closesFeedback: true;
  ownerSubjectiveApproval: 'not-claimed';
  validate(
    record: Readonly<Record<string, unknown>>,
    context: Readonly<{
      sourceSha?: string;
      repositoryRoot?: string;
      options?: Readonly<{ pass71QualityVisualTooling?: Readonly<Record<string, string>> }>;
    }>,
  ): readonly string[];
}>;
export function createPass71QualityVisualEvidenceRegistryEntry(): Pass71QualityVisualEvidenceRegistryEntry;
export const PASS71_QUALITY_VISUAL_EVIDENCE_REGISTRY_ENTRY: Pass71QualityVisualEvidenceRegistryEntry;
export function pass71QualityVisualCanonicalBytes(record: Readonly<Record<string, unknown>>): Buffer;
export function pass71QualityVisualRecordSha256(record: Readonly<Record<string, unknown>>): string;
export function pass71QualityVisualToolingHashes(repositoryRoot: string): Readonly<Record<string, string>>;
export function pass71QualityVisualToolingHashesAtSource(repositoryRoot: string, sourceSha: string): Readonly<Record<string, string>>;
export function pass71QualityVisualCaptureSignatures(
  capture: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>>;
export function pass71QualityVisualPngEvidence(bytes: Buffer): Pass71QualityVisualPngEvidence;
export function pass71QualityVisualPairMetrics(baselineBytes: Buffer, candidateBytes: Buffer): Pass71QualityVisualPairMetrics;
export function pass71QualityVisualPairPasses(metrics: Pass71QualityVisualPairMetrics): boolean;
export function pass71QualityVisualEvidenceDisposition(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71QualityVisualExpected,
): Readonly<{
  status: 'closing' | 'partial-non-closing';
  closesFeedback: boolean;
  mechanicalVisualParity: 'proven-by-this-native-receipt' | 'not-proven';
  ownerSubjectiveApproval: 'not-claimed';
  failures: readonly string[];
}>;
export function pass71QualityVisualEvidenceFailures(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71QualityVisualExpected,
): readonly string[];
export function assertPass71QualityVisualEvidence(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71QualityVisualExpected,
): Readonly<Record<string, unknown>>;
export function createPass71QualityVisualEvidenceFixture(options?: Readonly<{
  sourceSha?: string;
  tooling?: Readonly<Record<string, string>>;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, any>;
