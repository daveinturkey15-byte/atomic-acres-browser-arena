export type AcceptancePolicy = Readonly<{
  schemaVersion: number;
  enforceFromPass: number;
  manifestDirectory: string;
  ownerHandle: string;
  allowedEvidenceKinds: readonly string[];
}>;

export type AcceptanceValidation = Readonly<{
  ok: boolean;
  errors: string[];
  summary?: Readonly<{
    releasePass: string | null;
    total: number;
    verified: number;
    deferred: number;
    acceptanceRatio: number;
    feedbackReceivedAt: string | null;
    previewCreatedAt: string | null;
    approvedAt: string | null;
    nativeEvidence: readonly Readonly<{
      evidenceId: string | null;
      kind: string | null;
      receiptSha256: string | null;
      startedAt: string | null;
      completedAt: string | null;
      finalizedAt: string | null;
    }>[];
  }>;
}>;

export type AcceptanceWorkflowOutputs = Readonly<{
  manifest_selected: 'true' | 'false';
  manifest_path: string;
}>;

export type Pass71NativeEvidenceRegistryEntry = Readonly<{
  descriptor: Readonly<{
    evidenceId: string;
    kind: string;
    minimumCount: number;
    maximumCount: number;
  }>;
  validate: (record: unknown, context: Readonly<Record<string, any>>) => readonly string[];
}>;

export const PASS71_NATIVE_EVIDENCE_REGISTRY: readonly Pass71NativeEvidenceRegistryEntry[];
export function createPass71NativeEvidenceRegistry(
  additionalEntries?: readonly Pass71NativeEvidenceRegistryEntry[],
): readonly Pass71NativeEvidenceRegistryEntry[];

export function validateAcceptanceManifest(
  manifest: unknown,
  options?: Readonly<{
    policy?: AcceptancePolicy;
    pass71NativeEvidenceTooling?: Readonly<Record<string, string>>;
    pass71StuckEvidenceTooling?: Readonly<Record<string, string>>;
    pass71AudioNativeTooling?: readonly Readonly<{ path: string; sha256: string }>[];
    pass71QualityVisualTooling?: Readonly<Record<string, string>>;
    pass71NativeBrowserParityTooling?: Readonly<Record<string, string>>;
    pass71Hf296ContactTooling?: Readonly<Record<string, string>>;
    pass71Hf296ContactSourceTreeSha?: string;
  }>,
): AcceptanceValidation;

export function classifyPreviewDelta(
  paths: readonly string[],
  manifestPath: string,
  previewSha?: string | null,
  options?: Readonly<{ graph?: unknown }>,
): Readonly<{ ok: boolean; paths: string[]; reason: string }>;

export function pass66FinalizerOutputPaths(previewSha: string, graph?: unknown): string[];

export function selectCiAcceptanceManifest(impact: string, manifestPaths: readonly string[]): string | null;

export function acceptanceWorkflowOutputs(receipt: unknown): AcceptanceWorkflowOutputs;

export function evaluateAcceptance(values: Readonly<Record<string, string>>): unknown;
