export type Pass71Hf296EvidenceDescriptor = Readonly<{
  evidenceId: 'HF-296';
  kind: 'pass71-hf296-player-viewmodel-contact-component';
  minimumCount: 0;
  maximumCount: 1;
}>;

export declare const PASS71_HF296_CONTACT_EVIDENCE_DESCRIPTOR: Pass71Hf296EvidenceDescriptor;
export declare const PASS71_HF296_VISUAL_SOURCE_VIEWPORT: Readonly<{ width: 960; height: 540 }>;
export declare const PASS71_HF296_VISUAL_CROP: Readonly<{ x: 400; y: 396; width: 160; height: 90 }>;
export declare const PASS71_HF296_MAX_VISUAL_BYTES: number;
export declare const PASS71_HF296_MAX_RECORD_JSON_BYTES: number;
export declare const PASS71_HF296_CONTACT_EVIDENCE_REGISTRY_ENTRY: Readonly<{
  descriptor: Pass71Hf296EvidenceDescriptor;
  closesFeedback: true;
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
