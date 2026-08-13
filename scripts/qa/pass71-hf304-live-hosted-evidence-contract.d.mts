export type Pass71Hf304LiveHostedEvidenceDescriptor = Readonly<{
  evidenceId: 'HF-304';
  kind: 'pass71-hf304-live-hosted-native';
  minimumCount: 0;
  maximumCount: 1;
}>;

export declare const PASS71_HF304_LIVE_HOSTED_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-304';
  kind: 'pass71-hf304-live-hosted-native';
  contract: 'atomic-acres/pass71-hf304-live-hosted-native@1';
  feedbackId: 'HF-304';
  status: 'passed';
  closesFeedback: true;
  closingAuthority: true;
  ownerSubjectiveApproval: 'not-claimed';
}>;
export declare const PASS71_HF304_LIVE_HOSTED_DESCRIPTOR: Pass71Hf304LiveHostedEvidenceDescriptor;
export declare const PASS71_HF304_LIVE_HOSTED_SCOPES: readonly Readonly<{
  id: string;
  renderer: 'webgl2' | 'webgpu';
  requestedProfile: 'quality' | 'performance';
  actualProfile: 'blender' | 'performance';
}>[];
export declare const PASS71_HF304_LIVE_HOSTED_ARENAS: readonly unknown[];
export declare const PASS71_HF304_LIVE_HOSTED_PANES: readonly Readonly<{ arenaId: string; paneId: string }>[];
export declare const PASS71_HF304_LIVE_HOSTED_WEAPONS: readonly string[];
export declare const PASS71_HF304_LIVE_HOSTED_FIRE_KINDS: readonly string[];
export declare const PASS71_HF304_LIVE_HOSTED_MODES: readonly ['solo', 'hosted'];
export declare const PASS71_HF304_LIVE_HOSTED_CELL_COUNT_PER_SCOPE: 480;
export declare const PASS71_HF304_LIVE_HOSTED_TOTAL_CELL_COUNT: 1920;
export declare const PASS71_HF304_LIVE_HOSTED_CRACK_CONTROLS_PER_SCOPE: 24;
export declare const PASS71_HF304_LIVE_HOSTED_TOTAL_CRACK_CONTROLS: 96;
export declare const PASS71_HF304_LIVE_HOSTED_DEBRIS_TRAILS_PER_SCOPE: 36;
export declare const PASS71_HF304_LIVE_HOSTED_TOTAL_DEBRIS_TRAILS: 144;
export declare const PASS71_HF304_LIVE_HOSTED_VISUALS_PER_SCOPE: 4;
export declare const PASS71_HF304_LIVE_HOSTED_VISUAL_WIDTH: 192;
export declare const PASS71_HF304_LIVE_HOSTED_VISUAL_HEIGHT: 144;
export declare const PASS71_HF304_LIVE_HOSTED_MAX_VISUAL_BYTES: 106496;
export declare const PASS71_HF304_LIVE_HOSTED_MAX_RECORD_BYTES: 12582912;
export declare const PASS71_HF304_LIVE_HOSTED_MACHINE_HOSTNAME_SHA256: string;
export declare const PASS71_HF304_LIVE_HOSTED_TOOLING_PATHS: readonly string[];

export declare function canonicalJson(value: unknown): string;
export declare function pass71Hf304LiveHostedRecordSha256(record: Record<string, unknown>): string;
export declare function pass71Hf304LiveHostedToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): readonly Readonly<{ path: string; sha256: string }>[];
export declare function pass71Hf304LiveHostedEvidenceFailures(
  record: unknown,
  expected?: Readonly<{ sourceSha?: string; sourceTreeSha?: string; tooling?: unknown }>,
): string[];
export declare function assertPass71Hf304LiveHostedEvidence<T>(
  record: T,
  expected: Readonly<{ sourceSha: string; sourceTreeSha: string; tooling: unknown }>,
): T;
export declare function createPass71Hf304LiveHostedEvidenceRegistryEntry(): Readonly<{
  descriptor: Pass71Hf304LiveHostedEvidenceDescriptor;
  closesFeedback: true;
  ownerSubjectiveApproval: 'not-claimed';
  validate(record: unknown, context?: unknown): string[];
}>;
export declare const PASS71_HF304_LIVE_HOSTED_EVIDENCE_REGISTRY_ENTRY:
  ReturnType<typeof createPass71Hf304LiveHostedEvidenceRegistryEntry>;
export declare function createPass71Hf304LiveHostedEvidenceFixture(options?: Readonly<{
  sourceSha?: string;
  sourceTreeSha?: string;
  productVersion?: string;
  tooling?: unknown;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, unknown>;
