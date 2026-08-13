export type Pass71Hf306Renderer = 'webgl2' | 'webgpu';
export type Pass71Hf306ViewportId = 'desktop' | 'ultrawide' | 'mobile';
export type Pass71Hf306Action = 'movement' | 'fire' | 'missile';

export declare const PASS71_HF306_COCKPIT_EVIDENCE: Readonly<Record<string, unknown>>;
export declare const PASS71_HF306_COCKPIT_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-306';
  kind: 'pass71-hf306-chopper-cockpit-framing-closure';
  minimumCount: 0;
  maximumCount: 1;
}>;
export declare const PASS71_HF306_RENDERERS: readonly Pass71Hf306Renderer[];
export declare const PASS71_HF306_VIEWPORTS: readonly Readonly<{
  id: Pass71Hf306ViewportId;
  width: number;
  height: number;
}>[];
export declare const PASS71_HF306_ACTIONS: readonly Pass71Hf306Action[];
export declare const PASS71_HF306_SEMANTIC_NODES: readonly string[];
export declare const PASS71_HF306_ASSET_PATHS: readonly string[];
export declare const PASS71_HF306_PROJECTION_CASES: readonly string[];
export declare const PASS71_HF306_COVERAGE: Readonly<Record<string, unknown>>;
export declare const PASS71_HF306_UNKNOWNS: readonly string[];
export declare const PASS71_HF306_TOOL_PATHS: Readonly<Record<string, string>>;
export declare function pass71Hf306CanonicalBytes(record: unknown): Buffer;
export declare function pass71Hf306RecordSha256(record: unknown): string;
export declare function pass71Hf306ToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): Readonly<Record<string, string>>;
export declare function pass71Hf306SourceTreeAtSource(repositoryRoot: string, sourceSha: string): string;
export declare function pass71Hf306AssetAuditAtSource(repositoryRoot: string, sourceSha: string): readonly unknown[];
export declare function pass71Hf306OwnerSourceFailures(sources: unknown): string[];
export declare function pass71Hf306OwnerSourceAuditAtSource(repositoryRoot: string, sourceSha: string): unknown;
export declare function pass71Hf306AttachmentKeys(): readonly string[];
export declare function pass71Hf306ActionKeys(): readonly string[];
export declare function pass71Hf306RasterDifference(
  visible: { width: number; height: number; rgb: Buffer },
  hidden: { width: number; height: number; rgb: Buffer },
  crop: { left: number; top: number; width: number; height: number },
): Readonly<Record<string, unknown>>;
export declare function pass71Hf306EvidenceFailures(record: unknown, expected?: unknown): string[];
export declare function assertPass71Hf306Evidence(record: unknown, expected: unknown): unknown;
export declare function createPass71Hf306EvidenceRegistryEntry(): Readonly<{
  descriptor: typeof PASS71_HF306_COCKPIT_DESCRIPTOR;
  closesFeedback: true;
  validate(record: unknown, context: unknown): string[];
}>;
export declare const PASS71_HF306_COCKPIT_REGISTRY_ENTRY: ReturnType<typeof createPass71Hf306EvidenceRegistryEntry>;
export declare function createPass71Hf306EvidenceFixture(options?: Record<string, unknown>): any;
