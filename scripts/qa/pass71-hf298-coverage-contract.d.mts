export type Pass71Hf298CoverageExpected = Readonly<{
  sourceSha: string;
  tooling: Readonly<Record<string, string>>;
  components: readonly Readonly<Record<string, any>>[];
}>;

export const PASS71_HF298_COVERAGE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-298';
  kind: 'pass71-hf298-full-scope-coverage';
  contract: string;
  feedbackId: 'HF-298';
  scopes: readonly Readonly<{ mode: 'solo' | 'hosted'; renderer: 'webgl2' | 'webgpu' }>[];
}>;
export const PASS71_HF298_COVERAGE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-298';
  kind: 'pass71-hf298-full-scope-coverage';
  minimumCount: 0;
  maximumCount: 1;
}>;
export function pass71Hf298CoverageCanonicalBytes(record: Readonly<Record<string, unknown>>): Buffer;
export function pass71Hf298CoverageRecordSha256(record: Readonly<Record<string, unknown>>): string;
export function pass71Hf298CoverageFailures(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71Hf298CoverageExpected,
): readonly string[];
export function assertPass71Hf298Coverage(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71Hf298CoverageExpected,
): Readonly<Record<string, unknown>>;
export function createPass71Hf298CoverageRecord(options: Readonly<{
  sourceSha: string;
  tooling: Readonly<Record<string, string>>;
  components: readonly Readonly<Record<string, any>>[];
  finalizedAt: string;
}>): Readonly<Record<string, any>>;
export function createPass71Hf298CoverageFixture(options?: Readonly<{
  sourceSha?: string;
  tooling?: Readonly<Record<string, string>>;
  components?: readonly Readonly<Record<string, any>>[];
  finalizedAt?: string;
}>): Readonly<{ record: Record<string, any>; components: Record<string, any>[] }>;
