export type Pass71Hf308ScopeIdentity = Readonly<{
  arena: 'atomic-acres' | 'skyline-terminal' | 'rustworks-1v1' | 'gun-range';
  renderer: 'webgl2' | 'webgpu';
  mode: 'offline' | 'hosted';
}>;

export type Pass71Hf308EvidenceRecord = Readonly<Record<string, unknown> & {
  schemaVersion: 1;
  evidenceId: 'HF-308';
  kind: 'pass71-hf308-chopper-missile-full-closure';
  contract: 'atomic-acres/pass71-hf308-chopper-missile-full-closure@1';
  status: 'passed';
  closesFeedback: true;
  scopes: readonly Readonly<Record<string, unknown> & Pass71Hf308ScopeIdentity>[];
  receiptSha256: string;
}>;

export const PASS71_HF308_CHOPPER_MISSILE_EVIDENCE: Readonly<Record<string, unknown>>;
export const PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-308';
  kind: 'pass71-hf308-chopper-missile-full-closure';
  minimumCount: 0;
  maximumCount: 1;
}>;
export const PASS71_HF308_ARENAS: readonly Pass71Hf308ScopeIdentity['arena'][];
export const PASS71_HF308_RENDERERS: readonly Pass71Hf308ScopeIdentity['renderer'][];
export const PASS71_HF308_MODES: readonly Pass71Hf308ScopeIdentity['mode'][];
export const PASS71_HF308_SCOPES: readonly Pass71Hf308ScopeIdentity[];
export const PASS71_HF308_REQUIRED_ASSERTIONS: readonly string[];
export const PASS71_HF308_MECHANICAL_TEST_FILES: readonly string[];
export const PASS71_HF308_TOOLING_PATHS: readonly string[];
export const PASS71_HF308_MACHINE_HOSTNAME_SHA256: string;
export const PASS71_HF308_POLICY: Readonly<{
  authorityContract: string;
  capacity: 6;
  cadenceMs: 1000;
  flightMs: 780;
  blastRadiusM: 4.5;
  socketLocal: Readonly<Record<'left' | 'right', readonly number[]>>;
  rasterContract: string;
  rasterRoiWidth: 96;
  rasterRoiHeight: 96;
  maximumAttachmentBytes: number;
  maximumEncodedRecordBytes: number;
}>;
export const PASS71_HF308_CHOPPER_MISSILE_EVIDENCE_REGISTRY_ENTRY: Readonly<{
  descriptor: typeof PASS71_HF308_CHOPPER_MISSILE_DESCRIPTOR;
  closesFeedback: true;
  ownerSubjectiveApproval: 'not-claimed';
  validate(record: unknown, context?: unknown): readonly string[];
}>;

export function pass71Hf308RecordSha256(record: Record<string, unknown>): string;
export function pass71Hf308ToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): readonly Readonly<{ path: string; sha256: string }>[];
export function pass71Hf308DecodeLosslessPng(bytes: Buffer): Readonly<{
  width: number;
  height: number;
  rgb: Buffer;
}>;
export function pass71Hf308RasterDifference(
  visible: Readonly<{ width: number; height: number; rgb: Buffer }>,
  hidden: Readonly<{ width: number; height: number; rgb: Buffer }>,
): Readonly<Record<string, unknown>>;
export function pass71Hf308EvidenceFailures(
  record: unknown,
  expected?: Readonly<Record<string, unknown>>,
): readonly string[];
export function createPass71Hf308EvidenceRegistryEntry(): typeof PASS71_HF308_CHOPPER_MISSILE_EVIDENCE_REGISTRY_ENTRY;
export function createPass71Hf308EvidenceFixture(
  options?: Readonly<Record<string, unknown>>,
): Pass71Hf308EvidenceRecord;
