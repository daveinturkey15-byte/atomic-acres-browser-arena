export type Pass71GrenadeNativeExpected = Readonly<{
  sourceSha: string;
  tooling: Readonly<Record<string, string>>;
}>;

export const PASS71_GRENADE_NATIVE_EVIDENCE: Readonly<{
  schemaVersion: 1;
  evidenceId: 'HF-298';
  kind: 'pass71-hf298-grenade-native-webgpu-component';
  contract: string;
  gate: string;
  grenades: readonly ['frag', 'flash', 'smoke', 'semtex'];
  phases: readonly ['cold', 'warm'];
}>;
export const PASS71_GRENADE_NATIVE_TOOL_PATHS: Readonly<Record<string, string>>;
export function pass71GrenadeNativeCanonicalBytes(record: Readonly<Record<string, unknown>>): Buffer;
export function pass71GrenadeNativeRecordSha256(record: Readonly<Record<string, unknown>>): string;
export function pass71GrenadeNativeToolingHashes(repositoryRoot: string): Readonly<Record<string, string>>;
export function pass71GrenadeNativeToolingHashesAtSource(repositoryRoot: string, sourceSha: string): Readonly<Record<string, string>>;
export function pass71GrenadeNativeEvidenceFailures(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71GrenadeNativeExpected,
): readonly string[];
export function assertPass71GrenadeNativeEvidence(
  record: Readonly<Record<string, unknown>>,
  expected: Pass71GrenadeNativeExpected,
): Readonly<Record<string, unknown>>;
export function createPass71GrenadeNativeEvidenceFixture(options?: Readonly<{
  sourceSha?: string;
  tooling?: Readonly<Record<string, string>>;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, any>;
