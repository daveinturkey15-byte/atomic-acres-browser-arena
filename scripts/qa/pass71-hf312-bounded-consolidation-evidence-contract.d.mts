export declare const PASS71_HF312_BASE_SOURCE_SHA: string;
export declare const PASS71_HF312_BOUNDED_CONSOLIDATION_EVIDENCE: Readonly<Record<string, unknown>>;
export declare const PASS71_HF312_BOUNDED_CONSOLIDATION_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-312'; kind: 'pass71-hf312-bounded-consolidation-audit'; minimumCount: 0; maximumCount: 1;
}>;
export declare const PASS71_HF312_TOOL_PATHS: readonly string[];
export declare const PASS71_HF312_GATE_COMMANDS: readonly Readonly<{ id: string; command: string }>[];
export declare function pass71Hf312SourceAuditAtSource(repositoryRoot: string, sourceSha: string): Record<string, unknown>;
export declare function pass71Hf312ToolingAtSource(
  repositoryRoot: string,
  sourceSha: string,
): readonly Readonly<{ path: string; sha256: string }>[];
export declare function pass71Hf312RecordSha256(record: Record<string, unknown>): string;
export declare function pass71Hf312EvidenceFailures(record: unknown, expected?: Record<string, unknown>): string[];
export declare function createPass71Hf312RegistryEntry(): Readonly<Record<string, unknown>>;
export declare const PASS71_HF312_BOUNDED_CONSOLIDATION_REGISTRY_ENTRY: ReturnType<typeof createPass71Hf312RegistryEntry>;
export declare function createPass71Hf312EvidenceFixture(input: Record<string, any>): Record<string, any>;
