export declare const PASS71_HF307_CHOPPER_MG_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-307';
  kind: 'pass71-hf307-exact-chopper-mg-splash-coverage';
  contract: 'atomic-acres/pass71-hf307-exact-chopper-mg-splash-coverage@1';
  feedbackId: 'HF-307';
  status: 'passed';
  closesFeedback: true;
  closingAuthority: true;
  ownerSubjectiveApproval: 'not-claimed';
}>;
export declare const PASS71_HF307_CHOPPER_MG_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-307';
  kind: 'pass71-hf307-exact-chopper-mg-splash-coverage';
  minimumCount: 0;
  maximumCount: 1;
}>;
export declare const PASS71_HF307_ARENAS: readonly ['atomic-acres'];
export declare const PASS71_HF307_RENDERERS: readonly ('webgl2' | 'webgpu')[];
export declare const PASS71_HF307_SCOPES: readonly Readonly<{
  arena: 'atomic-acres';
  renderer: 'webgl2' | 'webgpu';
}>[];
export declare const PASS71_HF307_REQUIRED_ASSERTIONS: readonly string[];
export declare const PASS71_HF307_MECHANICAL_TEST_FILES: readonly string[];
export declare const PASS71_HF307_TOOLING_PATHS: readonly string[];
export declare function pass71Hf307RecordSha256(record: unknown): string;
export declare function pass71Hf307ToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): readonly Readonly<{ path: string; sha256: string }>[];
export declare function pass71Hf307EvidenceFailures(
  record: unknown,
  expected?: Readonly<Record<string, any>>,
): readonly string[];
export declare function createPass71Hf307EvidenceRegistryEntry(): Readonly<{
  descriptor: typeof PASS71_HF307_CHOPPER_MG_DESCRIPTOR;
  closesFeedback: true;
  ownerSubjectiveApproval: 'not-claimed';
  validate(record: unknown, context: Readonly<Record<string, any>>): readonly string[];
}>;
export declare const PASS71_HF307_CHOPPER_MG_EVIDENCE_REGISTRY_ENTRY: ReturnType<
  typeof createPass71Hf307EvidenceRegistryEntry
>;
export declare function createPass71Hf307EvidenceFixture(
  options?: Readonly<Record<string, any>>,
): Record<string, any>;
