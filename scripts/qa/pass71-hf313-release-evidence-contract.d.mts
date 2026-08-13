export declare const PASS71_HF313_RELEASE_EVIDENCE: Readonly<Record<string, unknown>>;
export declare const PASS71_HF313_RELEASE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-313'; kind: 'pass71-hf313-protected-release-readiness'; minimumCount: 0; maximumCount: 1;
}>;
export declare const PASS71_HF313_REQUIRED_FEEDBACK_IDS: readonly string[];
export declare const PASS71_HF313_MAX_NATIVE_EVIDENCE_JSON_BYTES: number;
export declare const PASS71_HF313_PUBLIC_CHOICES: readonly ['experimental', 'retained', 'stable'];
export declare const PASS71_HF313_PINNED_CHANNELS: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
export declare const PASS71_HF313_WORKFLOW_STEPS: readonly string[];
export declare const PASS71_HF313_TOOL_PATHS: readonly string[];
export declare function pass71Hf313DependencyProjection(records: readonly any[]): readonly Readonly<Record<string, unknown>>[];
export declare function pass71Hf313NativeEvidenceEnvelope(records: readonly any[]): Readonly<{
  recordCount: number; jsonBytes: number; maxJsonBytes: number;
}>;
export declare function pass71Hf313ToolingAtSource(repositoryRoot: string, sourceSha: string): readonly Readonly<{ path: string; sha256: string }>[];
export declare function pass71Hf313SourceAuditAtSource(repositoryRoot: string, sourceSha: string): Readonly<Record<string, any>>;
export declare function pass71Hf313RecordSha256(record: any): string;
export declare function pass71Hf313EvidenceFailures(record: any, expected?: any): string[];
export declare function createPass71Hf313RegistryEntry(): Readonly<Record<string, any>>;
export declare const PASS71_HF313_RELEASE_EVIDENCE_REGISTRY_ENTRY: ReturnType<typeof createPass71Hf313RegistryEntry>;
export declare function createPass71Hf313EvidenceFixture(options?: any): Record<string, any>;
export declare function pass71Hf313ProductionPostconditionFailures(input: any): string[];
export declare function createPass71Hf313LivePostcondition(input: any): Readonly<Record<string, unknown>>;
