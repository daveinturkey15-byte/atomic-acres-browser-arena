export type Pass71Hf296EvidenceDescriptor = Readonly<{
  evidenceId: 'HF-296';
  kind: 'pass71-hf296-player-viewmodel-contact-component';
  minimumCount: 0;
  maximumCount: 1;
}>;

export declare const PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR: Pass71Hf296EvidenceDescriptor;
export declare const PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY: Readonly<{
  descriptor: Pass71Hf296EvidenceDescriptor;
  validate(record: unknown, context: {
    sourceSha: string;
    repositoryRoot: string;
    options?: {
      pass71Hf296ContactTooling?: Readonly<Record<string, string>>;
      pass71Hf296ContactSourceTreeSha?: string;
    };
  }): string[];
}>;
export declare function pass71Hf296ContactEvidenceFailures(
  record: unknown,
  expected?: { sourceSha?: string; sourceTreeSha?: string; tooling?: Readonly<Record<string, string>> },
): string[];
export declare function assertPass71Hf296ContactEvidence<T>(
  record: T,
  expected: { sourceSha: string; sourceTreeSha: string; tooling: Readonly<Record<string, string>> },
): T;
export declare function pass71Hf296ContactRecordSha256(record: unknown): string;
export declare function pass71Hf296ContactToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): Readonly<Record<string, string>>;
export declare function pass71Hf296ContactSourceTreeAtSource(
  repositoryRoot: string,
  sourceSha: string,
): string;
