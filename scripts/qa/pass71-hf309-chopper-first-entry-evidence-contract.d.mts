export type Pass71Hf309EvidenceDescriptor = Readonly<{
  evidenceId: 'HF-309';
  kind: 'pass71-hf309-chopper-first-entry-native';
  minimumCount: 0;
  maximumCount: 1;
}>;

export declare const PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-309';
  kind: 'pass71-hf309-chopper-first-entry-native';
  contract: 'atomic-acres/pass71-hf309-chopper-first-entry-native@1';
  feedbackId: 'HF-309';
  status: 'passed';
  closesFeedback: true;
  closingAuthority: true;
  ownerSubjectiveApproval: 'not-claimed';
}>;
export declare const PASS71_HF309_CHOPPER_FIRST_ENTRY_DESCRIPTOR: Pass71Hf309EvidenceDescriptor;
export declare const PASS71_HF309_RENDERERS: readonly ['webgl2', 'webgpu'];
export declare const PASS71_HF309_REQUIRED_CHOPPER_ASSETS: readonly string[];
export declare const PASS71_HF309_EXPECTED_SUPPORT_ASSETS: readonly string[];
export declare const PASS71_HF309_REQUIRED_CHOPPER_ACTIONS: readonly string[];
export declare const PASS71_HF309_TOOLING_PATHS: readonly string[];

export declare function canonicalJson(value: unknown): string;
export declare function pass71Hf309RecordSha256(record: Record<string, unknown>): string;
export declare function pass71Hf309ToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): readonly Readonly<{ path: string; sha256: string }>[];
export declare function pass71Hf309EvidenceFailures(
  record: unknown,
  expected?: Readonly<{ sourceSha?: string; sourceTreeSha?: string; tooling?: unknown }>,
): string[];
export declare function assertPass71Hf309Evidence<T>(
  record: T,
  expected: Readonly<{ sourceSha: string; sourceTreeSha: string; tooling: unknown }>,
): T;
export declare function createPass71Hf309EvidenceRegistryEntry(): Readonly<{
  descriptor: Pass71Hf309EvidenceDescriptor;
  closesFeedback: true;
  ownerSubjectiveApproval: 'not-claimed';
  validate(record: unknown, context?: unknown): string[];
}>;
export declare const PASS71_HF309_CHOPPER_FIRST_ENTRY_EVIDENCE_REGISTRY_ENTRY:
  ReturnType<typeof createPass71Hf309EvidenceRegistryEntry>;
export declare function createPass71Hf309EvidenceFixture(options?: Readonly<{
  sourceSha?: string;
  sourceTreeSha?: string;
  tooling?: unknown;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, unknown>;
