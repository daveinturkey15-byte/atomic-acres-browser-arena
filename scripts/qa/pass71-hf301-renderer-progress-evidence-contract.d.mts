export const PASS71_HF301_RENDERER_PROGRESS_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-301';
  kind: 'pass71-hf301-renderer-forward-progress-closure';
  contract: 'atomic-acres/pass71-hf301-renderer-forward-progress-closure@1';
  feedbackId: 'HF-301';
  status: 'passed';
  coverageDisposition: 'exact-reproduction-and-bounded-native-action-matrix';
  closesFeedback: true;
  liveNoProgressThresholdMs: 1000;
}>;

export const PASS71_HF301_RENDERER_PROGRESS_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-301';
  kind: 'pass71-hf301-renderer-forward-progress-closure';
  minimumCount: 0;
  maximumCount: 1;
}>;
export const PASS71_HF301_RENDERERS: readonly ['webgl2', 'webgpu'];
export const PASS71_HF301_TRACE_ORDER: readonly [
  'combat-first-fire', 'glass-first-breach', 'grenade-first-frag', 'support-first-chopper',
];
export const PASS71_HF301_COVERAGE: Readonly<Record<string, unknown>>;
export const PASS71_HF301_TOOL_PATHS: Readonly<Record<string, string>>;

export function pass71Hf301RecordSha256(record: Record<string, unknown>): string;
export function pass71Hf301ToolingHashesAtSource(repositoryRoot: string, sourceSha: string): Record<string, string>;
export function pass71Hf301SourceTreeAtSource(repositoryRoot: string, sourceSha: string): string;
export function pass71Hf301OwnerSourceFailures(sources: Readonly<{
  legacyMain?: string;
  renderRuntime?: string;
}>): string[];
export function pass71Hf301OwnerReplayAtSource(repositoryRoot: string, sourceSha: string): Record<string, unknown>;
export function pass71Hf301EvidenceFailures(record: unknown, expected?: Record<string, unknown>): string[];
export function assertPass71Hf301Evidence<T>(record: T, expected: Record<string, unknown>): T;
export function createPass71Hf301EvidenceRegistryEntry(): Readonly<{
  descriptor: typeof PASS71_HF301_RENDERER_PROGRESS_DESCRIPTOR;
  closesFeedback: true;
  validate(record: unknown, context: Record<string, unknown>): string[];
}>;
export const PASS71_HF301_RENDERER_PROGRESS_REGISTRY_ENTRY: ReturnType<typeof createPass71Hf301EvidenceRegistryEntry>;
export function createPass71Hf301EvidenceFixture(input: Readonly<{
  sourceSha: string;
  sourceTreeSha: string;
  tooling: Record<string, string>;
  ownerReplay?: Record<string, unknown>;
}>): Record<string, any>;
