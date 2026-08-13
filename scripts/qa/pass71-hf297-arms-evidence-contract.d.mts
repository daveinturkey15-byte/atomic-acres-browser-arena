export type Pass71Hf297EvidenceDescriptor = Readonly<{
  evidenceId: 'HF-297';
  kind: 'pass71-hf297-first-person-arms-component';
  minimumCount: 0;
  maximumCount: 1;
}>;

export declare const PASS71_HF297_ARMS_EVIDENCE_DESCRIPTOR: Pass71Hf297EvidenceDescriptor;
export declare const PASS71_HF297_ARMS_EVIDENCE_REGISTRY_ENTRY: Readonly<{
  descriptor: Pass71Hf297EvidenceDescriptor;
  validate(record: unknown, context: {
    sourceSha: string;
    repositoryRoot: string;
    options?: {
      pass71Hf297Tooling?: Readonly<Record<string, string>>;
      pass71Hf297SourceTreeSha?: string;
    };
  }): string[];
}>;
export declare function pass71Hf297EvidenceFailures(
  record: unknown,
  expected?: { sourceSha?: string; sourceTreeSha?: string; tooling?: Readonly<Record<string, string>> },
): string[];
export declare function assertPass71Hf297Evidence<T>(
  record: T,
  expected: { sourceSha: string; sourceTreeSha: string; tooling: Readonly<Record<string, string>> },
): T;
export declare function pass71Hf297RecordSha256(record: unknown): string;
export declare function pass71Hf297ToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): Readonly<Record<string, string>>;
export declare function pass71Hf297SourceTreeAtSource(repositoryRoot: string, sourceSha: string): string;
export declare function createPass71Hf297EvidenceFixture(
  options?: Readonly<Record<string, unknown>>,
): Record<string, unknown>;
export declare function pass71Hf297VerifiedRequirementFailures(
  requirement: unknown,
  records: readonly unknown[],
): string[];
