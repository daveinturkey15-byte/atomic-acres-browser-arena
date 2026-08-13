export type Pass71Hf300TargetKind = 'bot' | 'remote-human';
export type Pass71Hf300Renderer = 'webgl2' | 'webgpu';
export type Pass71Hf300ScopeIdentity = Readonly<{
  targetKind: Pass71Hf300TargetKind;
  mode: 'solo' | 'hosted';
  renderer: Pass71Hf300Renderer;
}>;

export const PASS71_HF300_DRONE_THERMAL_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-300';
  kind: 'pass71-hf300-piloted-drone-exact-thermal';
  contract: 'atomic-acres/pass71-hf300-piloted-drone-exact-thermal-closure@1';
  feedbackId: 'HF-300';
  status: 'passed';
  coverageDisposition: 'full-exact-native-matrix';
  closesFeedback: true;
}>;

export const PASS71_HF300_DRONE_THERMAL_EVIDENCE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-300';
  kind: 'pass71-hf300-piloted-drone-exact-thermal';
  minimumCount: 0;
  maximumCount: 1;
}>;

export const PASS71_HF300_DRONE_THERMAL_SCOPES: readonly Pass71Hf300ScopeIdentity[];
export const PASS71_HF300_DRONE_THERMAL_COVERAGE: Readonly<Record<string, unknown>>;
export const PASS71_HF300_DRONE_THERMAL_TOOL_PATHS: Readonly<Record<string, string>>;

export type Pass71Hf300RegistryContext = Readonly<{
  repositoryRoot?: string;
  sourceSha?: string;
  options?: Readonly<{
    pass71Hf300Tooling?: Readonly<Record<string, string>>;
    pass71Hf300SourceTreeSha?: string;
  }>;
}>;

export type Pass71Hf300RegistryEntry = Readonly<{
  descriptor: typeof PASS71_HF300_DRONE_THERMAL_EVIDENCE_DESCRIPTOR;
  closesFeedback: true;
  validate(record: unknown, context?: Pass71Hf300RegistryContext): string[];
}>;

export function pass71Hf300PngEvidence(bytes: Buffer): Readonly<Record<string, unknown>>;
export function pass71Hf300PngPairMetrics(
  activeBytes: Buffer,
  cleanupBytes: Buffer,
): Readonly<Record<string, number>>;
export function pass71Hf300CanonicalBytes(record: unknown): Buffer;
export function pass71Hf300RecordSha256(record: unknown): string;
export function pass71Hf300ToolingHashes(repositoryRoot: string): Readonly<Record<string, string>>;
export function pass71Hf300ToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): Readonly<Record<string, string>>;
export function pass71Hf300SourceTreeAtSource(repositoryRoot: string, sourceSha: string): string;
export function pass71Hf300EvidenceFailures(
  record: unknown,
  expected?: Readonly<{ sourceSha?: string; sourceTreeSha?: string; tooling?: Readonly<Record<string, string>> }>,
): string[];
export function assertPass71Hf300Evidence<T>(
  record: T,
  expected?: Readonly<{ sourceSha?: string; sourceTreeSha?: string; tooling?: Readonly<Record<string, string>> }>,
): T;
export function createPass71Hf300EvidenceRegistryEntry(): Pass71Hf300RegistryEntry;
export const PASS71_HF300_DRONE_THERMAL_EVIDENCE_REGISTRY_ENTRY: Pass71Hf300RegistryEntry;
export function createPass71Hf300EvidenceFixture(options?: Readonly<{
  sourceSha?: string;
  sourceTreeSha?: string;
  tooling?: Readonly<Record<string, string>>;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, any>;
