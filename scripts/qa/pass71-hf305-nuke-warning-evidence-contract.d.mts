export type Pass71Hf305EvidenceDescriptor = Readonly<{
  evidenceId: 'HF-305';
  kind: 'pass71-hf305-nuke-warning-native';
  minimumCount: 0;
  maximumCount: 1;
}>;

export declare const PASS71_HF305_NUKE_WARNING_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-305';
  kind: 'pass71-hf305-nuke-warning-native';
  contract: 'atomic-acres/pass71-hf305-nuke-warning-native@1';
  feedbackId: 'HF-305';
  status: 'passed';
  closesFeedback: true;
  closingAuthority: true;
  ownerSubjectiveApproval: 'not-claimed';
}>;
export declare const PASS71_HF305_NUKE_WARNING_DESCRIPTOR: Pass71Hf305EvidenceDescriptor;
export declare const PASS71_HF305_RENDERERS: readonly ['webgl2', 'webgpu'];
export declare const PASS71_HF305_TIMELINE_REMAINING_MS: readonly [4400, 3400, 2400, 1400, 600];
export declare const PASS71_HF305_WARNING_POSITION: readonly [75.75, 7.5, 6];
export declare const PASS71_HF305_INSIDE_CAMERA: readonly [91, 8.5, 20];
export declare const PASS71_HF305_OUTSIDE_CAMERA: readonly [43, 8, 12];
export declare const PASS71_HF305_TOOLING_PATHS: readonly string[];

export declare function canonicalJson(value: unknown): string;
export declare function pass71Hf305RecordSha256(record: Record<string, unknown>): string;
export declare function pass71Hf305ToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): readonly Readonly<{ path: string; sha256: string }>[];
export declare function pass71Hf305EvidenceFailures(
  record: unknown,
  expected?: Readonly<{ sourceSha?: string; sourceTreeSha?: string; tooling?: unknown }>,
): string[];
export declare function assertPass71Hf305Evidence<T>(
  record: T,
  expected: Readonly<{ sourceSha: string; sourceTreeSha: string; tooling: unknown }>,
): T;
export declare function createPass71Hf305EvidenceRegistryEntry(): Readonly<{
  descriptor: Pass71Hf305EvidenceDescriptor;
  closesFeedback: true;
  ownerSubjectiveApproval: 'not-claimed';
  validate(record: unknown, context: unknown): string[];
}>;
export declare const PASS71_HF305_NUKE_WARNING_EVIDENCE_REGISTRY_ENTRY: ReturnType<typeof createPass71Hf305EvidenceRegistryEntry>;
export declare function createPass71Hf305EvidenceFixture(options?: Readonly<{
  sourceSha?: string;
  sourceTreeSha?: string;
  tooling?: unknown;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, unknown>;
