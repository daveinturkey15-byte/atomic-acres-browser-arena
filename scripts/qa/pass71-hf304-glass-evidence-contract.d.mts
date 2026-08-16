export type Pass71Hf304EvidenceRecord = Readonly<Record<string, unknown>>;
export type Pass71Hf304EvidenceValidationContext = Readonly<{
  sourceSha?: string;
  repositoryRoot?: string;
  options?: Readonly<{
    pass71Hf304SourceTreeSha?: string;
    pass71Hf304Tooling?: Readonly<Record<string, string>>;
  }>;
}>;

export const PASS71_HF304_GLASS_EVIDENCE: Readonly<Record<string, unknown>>;
export const PASS71_HF304_GLASS_EVIDENCE_DESCRIPTOR: Readonly<{
  evidenceId: string;
  kind: string;
  minimumCount: number;
  maximumCount: number;
}>;
export const PASS71_HF304_WEAPONS: readonly string[];
export const PASS71_HF304_WEAPON_FIRE_KINDS: readonly string[];
export const PASS71_HF304_ARENAS: readonly Readonly<{ id: string; paneIds: readonly string[] }>[];
export const PASS71_HF304_PANES: readonly Readonly<{ arenaId: string; paneId: string }>[];
export const PASS71_HF304_MODES: readonly string[];
export const PASS71_HF304_DEBRIS_SAMPLE_INPUTS: readonly Readonly<{
  ageMs: number;
  positionY: number;
  restY: number | null;
  physicsActive: boolean;
  sleeping: boolean;
  receivedPhysicsPose: boolean;
  noProgressMs: number;
  fallbackSettled: boolean;
}>[];
export const PASS71_HF304_DEBRIS_SAMPLE_MODES: readonly string[];
export const PASS71_HF304_BROWSER_CASES: readonly string[];
export const PASS71_HF304_COVERAGE: Readonly<Record<string, unknown>>;
export const PASS71_HF304_UNKNOWNS: readonly string[];
export const PASS71_HF304_MACHINE_HOSTNAME_SHA256: string;
export const PASS71_HF304_TOOL_PATHS: Readonly<Record<string, string>>;

export function pass71Hf304CanonicalBytes(record: Pass71Hf304EvidenceRecord): Buffer;
export function pass71Hf304RecordSha256(record: Pass71Hf304EvidenceRecord): string;
export function pass71Hf304ToolingHashes(repositoryRoot: string): Readonly<Record<string, string>>;
export function pass71Hf304ToolingHashesAtSource(
  repositoryRoot: string,
  sourceSha: string,
): Readonly<Record<string, string>>;
export function pass71Hf304SourceTreeAtSource(repositoryRoot: string, sourceSha: string): string;
export function pass71Hf304EvidenceFailures(
  record: unknown,
  expected?: Readonly<{ sourceSha?: string; sourceTreeSha?: string; tooling?: Readonly<Record<string, string>> }>,
): string[];
export function assertPass71Hf304Evidence(
  record: Pass71Hf304EvidenceRecord,
  expected: Readonly<{ sourceSha: string; sourceTreeSha: string; tooling: Readonly<Record<string, string>> }>,
): Pass71Hf304EvidenceRecord;
export function createPass71Hf304EvidenceRegistryEntry(): Readonly<{
  descriptor: typeof PASS71_HF304_GLASS_EVIDENCE_DESCRIPTOR;
  validate: (record: unknown, context: Pass71Hf304EvidenceValidationContext) => string[];
}>;
export const PASS71_HF304_GLASS_EVIDENCE_REGISTRY_ENTRY: ReturnType<typeof createPass71Hf304EvidenceRegistryEntry>;
export function createPass71Hf304EvidenceFixture(options?: Readonly<Record<string, unknown>>): Pass71Hf304EvidenceRecord;
