import type { Pass71Hf297SourceCatalog } from './pass71-hf297-full-arms-matrix.mjs';

export type Pass71Hf297FullArmsValidationExpected = Readonly<{
  sourceSha: string;
  sourceTreeSha: string;
  tooling: Readonly<Record<string, string>>;
  catalog: Pass71Hf297SourceCatalog;
}>;

export type Pass71Hf297FullArmsRegistryContext = Readonly<{
  repositoryRoot: string;
  sourceSha: string;
  options?: Readonly<{
    pass71Hf297FullTooling?: Readonly<Record<string, string>>;
    pass71Hf297FullSourceTreeSha?: string;
    pass71Hf297FullSourceCatalog?: Pass71Hf297SourceCatalog;
  }>;
}>;

export declare const PASS71_HF297_FULL_ARMS_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-297';
  kind: 'pass71-hf297-first-person-arms-full-closure';
  contract: 'atomic-acres/pass71-hf297-first-person-arms-full-closure@1';
  feedbackId: 'HF-297';
  status: 'passed';
  coverageDisposition: 'literal-source-derived-cartesian-closure';
  closesFeedback: true;
  closingAuthority: true;
  ownerSubjectiveApproval: 'not-claimed';
}>;
export declare const PASS71_HF297_FULL_ARMS_EVIDENCE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-297';
  kind: 'pass71-hf297-first-person-arms-full-closure';
  minimumCount: 0;
  maximumCount: 1;
}>;
export declare const PASS71_HF297_FULL_ARMS_SAMPLE_PROGRESS: Readonly<Record<string, readonly (number | null)[]>>;
export declare const PASS71_HF297_FULL_ARMS_MAX_RECORD_BYTES: number;
export declare const PASS71_HF297_FULL_ARMS_MAX_PNG_BYTES: number;
export declare const PASS71_HF297_FULL_ARMS_RECORD_SIZE_POLICY: Readonly<{
  encoding: string;
  maximumEncodedRecordBytes: number;
  controlCropWidth: number;
  controlCropHeight: number;
  maximumRawRgbaScanlineBytes: number;
  maximumLosslessCodecAndContainerOverheadBytes: number;
  maximumVisualCells: number;
  maximumPngBytesPerCell: number;
  maximumVisualPngBase64Bytes: number;
  maximumTelemetryEvidenceBase64Bytes: number;
  maximumTelemetryKeyBase64Bytes: number;
  maximumNonPayloadJsonBytes: number;
  worstCaseEncodedEnvelopeBytes: number;
  githubSingleFileBoundaryBytes: number;
}>;
export declare const PASS71_HF297_FULL_ARMS_TOOL_PATHS: Readonly<Record<string, string>>;
export declare function pass71Hf297FullVisualCrop(viewport: Readonly<{
  width: number; height: number;
}>): Readonly<{ x: number; y: number; width: number; height: number; policy: string }>;

export declare function pass71Hf297FullArmsCanonicalBytes(record: unknown): Buffer;
export declare function pass71Hf297FullArmsRecordSha256(record: unknown): string;
export declare function pass71Hf297FullArmsEncodedRecordBytes(record: unknown): number;
export declare function pass71Hf297FullArmsTelemetryCellSha256(cell: unknown): string;
export declare function pass71Hf297FullArmsToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): Readonly<Record<string, string>>;
export declare function pass71Hf297FullArmsSourceTreeAtSource(repositoryRoot: string, sourceSha: string): string;
export declare function pass71Hf297FullArmsCoverage(catalog: Pass71Hf297SourceCatalog): Readonly<Record<string, unknown>>;
export declare function createPass71Hf297FullArmsEmbeddedMatrix(
  cells: readonly Record<string, unknown>[],
  catalog: Pass71Hf297SourceCatalog,
): Readonly<Record<string, unknown>>;
export declare function pass71Hf297FullArmsEvidenceFailures(
  record: unknown,
  expected?: Partial<Pass71Hf297FullArmsValidationExpected>,
): string[];
export declare function assertPass71Hf297FullArmsEvidence<T>(
  record: T,
  expected: Pass71Hf297FullArmsValidationExpected,
): T;
export declare function createPass71Hf297FullArmsEvidenceRegistryEntry(): Readonly<{
  descriptor: typeof PASS71_HF297_FULL_ARMS_EVIDENCE_DESCRIPTOR;
  closesFeedback: true;
  closingAuthority: true;
  validate(record: unknown, context: Pass71Hf297FullArmsRegistryContext): string[];
}>;
export declare const PASS71_HF297_FULL_ARMS_EVIDENCE_REGISTRY_ENTRY:
  ReturnType<typeof createPass71Hf297FullArmsEvidenceRegistryEntry>;
export declare function createPass71Hf297FullArmsEvidenceFixture(options: Readonly<{
  catalog: Pass71Hf297SourceCatalog;
  sourceSha?: string;
  sourceTreeSha?: string;
  tooling?: Readonly<Record<string, string>>;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, any>;
