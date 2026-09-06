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
  previewSha?: string | null,
  options?: Readonly<{ graph?: unknown }>,
): Readonly<{ ok: boolean; paths: string[]; reason: string }>;

export function pass66FinalizerOutputPaths(previewSha: string, graph?: unknown): string[];

export function selectCiAcceptanceManifest(impact: string, manifestPaths: readonly string[]): string | null;

export function assertCiImpactMatchesPaths(
  impact: string,
  paths: readonly string[],
): Readonly<{ mode: 'none' | 'smoke' | 'full'; reason: string }>;

export function committedManifestBytes(
  worktreeBytes: Buffer,
  headBytes: Buffer,
  manifestPath: string,
  head: string,
): Buffer;

export type AncestryRootAllowlist = Readonly<{
  legitimate: string[];
  quarantined: string[];
  allowed: string[];
}>;

export type ReconciliationMergeFacts = Readonly<{
  head?: unknown;
  base?: unknown;
  parents?: unknown;
  headTree?: unknown;
  firstParentTree?: unknown;
  firstParentIsRoot?: unknown;
  firstParentRoots?: unknown;
  allowedRoots?: unknown;
  quarantinedRoots?: unknown;
}>;

export type ReconciliationMergeShape = Readonly<{
  reconciliation: true;
  treeIdenticalTo: string;
  base: string;
  head: string;
  tree: string;
  rootCount: number;
  quarantinedRoots: string[];
}>;

export function readAncestryRootAllowlist(source: unknown): AncestryRootAllowlist;

export function assertReconciliationMergeShape(facts: ReconciliationMergeFacts): ReconciliationMergeShape;

export function selectReconciliationManifest(
  manifestPaths: readonly string[],
  policy: Readonly<{ manifestDirectory: string; enforceFromPass: number }>,
): string;

export function evaluateAcceptance(values: Readonly<Record<string, string>>): unknown;
