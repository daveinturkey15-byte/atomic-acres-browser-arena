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
    nativeEvidence: null | Readonly<{
      evidenceId: string | null;
      kind: string | null;
      receiptSha256: string | null;
      startedAt: string | null;
      completedAt: string | null;
    }>;
  }>;
}>;

export type AcceptanceWorkflowOutputs = Readonly<{
  manifest_selected: 'true' | 'false';
  manifest_path: string;
}>;

export function validateAcceptanceManifest(
  manifest: unknown,
  options?: Readonly<{
    policy?: AcceptancePolicy;
    pass71NativeEvidenceTooling?: Readonly<Record<string, string>>;
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
