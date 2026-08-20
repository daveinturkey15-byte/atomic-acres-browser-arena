export type PreviewIdentity = Readonly<{
  artifactName: string;
  sourceSha: string;
  pullRequest: number;
  createdAt: string;
  artifactId: number | null;
  fileCount: number | null;
  treeSha256: string | null;
}>;

export type PreviewTree = Readonly<{
  fileCount: number;
  treeSha256: string;
  entries: ReadonlyArray<Readonly<{ path: string; sha256: string }>>;
}>;

export function computePreviewTree(
  files: ReadonlyArray<Readonly<{ path: string; bytes: Uint8Array }>>,
): PreviewTree;

export function parsePreviewManifest(manifest: unknown): PreviewIdentity;

export type AcceptanceReceiptSelection = Readonly<
  | { exempt: true; reason: string }
  | {
    exempt: false;
    manifestPath: string;
    manifestSha256: string;
    headSha: string;
    releasePass: string;
  }
>;

export function selectPreviewManifestFromAcceptanceReceipt(receipt: unknown): AcceptanceReceiptSelection;

export function inspectPreviewArtifactZip(
  bytes: Uint8Array,
  identity: PreviewIdentity,
  options?: Readonly<{ maxUncompressedBytes?: number }>,
): PreviewTree & Readonly<{ receipt: unknown }>;

export type PreviewProvenanceOptions = Readonly<{
  repositoryRoot?: string;
  manifestPath?: string;
  manifest?: unknown;
  repository?: string;
  token?: string;
  apiBase?: string;
  now?: Date | number;
  maxArchiveBytes?: number;
  maxUncompressedBytes?: number;
  fetchImpl?: typeof fetch;
}>;

export function verifyPreviewProvenance(options?: PreviewProvenanceOptions): Promise<unknown>;

export type AcceptanceReceiptProvenanceOptions = PreviewProvenanceOptions & Readonly<{
  acceptanceReceiptPath?: string;
  acceptanceReceipt?: unknown;
}>;

export function verifyPreviewProvenanceFromAcceptanceReceipt(
  options?: AcceptanceReceiptProvenanceOptions,
): Promise<unknown>;
