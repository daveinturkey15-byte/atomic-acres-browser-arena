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
  }>;
}>;

export function validateAcceptanceManifest(
  manifest: unknown,
  options?: Readonly<{ policy?: AcceptancePolicy }>,
): AcceptanceValidation;

export function classifyPreviewDelta(
  paths: readonly string[],
  manifestPath: string,
): Readonly<{ ok: boolean; paths: string[]; reason: string }>;
