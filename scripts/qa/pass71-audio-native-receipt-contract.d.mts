export const PASS71_AUDIO_NATIVE: Readonly<{
  schemaVersion: 2; evidenceId: 'HF-302'; kind: 'pass71-hf302-audio-native-long-run';
  contract: string; feedbackId: 'HF-302'; schema: string; arenaSchema: string; arenas: readonly string[]; events: readonly string[];
  durationMsPerArena: number; profile: Readonly<{ name: 'Quality'; renderer: 'webgpu'; render: 'blender' }>;
  retainedSampleCount: number;
  toolingPaths: readonly string[];
}>;
export const PASS71_AUDIO_NATIVE_MACHINE_ID: 'dave-gaming-pc';
export const PASS71_AUDIO_NATIVE_MACHINE_HOSTNAME_SHA256: string;
export const PASS71_AUDIO_NATIVE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-302'; kind: 'pass71-hf302-audio-native-long-run'; minimumCount: 0; maximumCount: 1;
}>;
export function canonicalJson(value: unknown): string;
export function sha256Canonical(value: unknown): string;
export function pass71AudioNativeToolingHashesAtSource(repositoryRoot: string, sourceSha: string): readonly Readonly<{ path: string; sha256: string }>[];
export function pass71AudioNativeFailures(receipt: unknown, expected: string | Readonly<{ sourceSha: string; tooling?: readonly Readonly<{ path: string; sha256: string }>[] }>): string[];
export function assertPass71AudioNativeReceipt(receipt: unknown, expected: string | Readonly<{ sourceSha: string; tooling?: readonly Readonly<{ path: string; sha256: string }>[] }>): unknown;
export const PASS71_AUDIO_NATIVE_REGISTRY_ENTRY: Readonly<{ descriptor: typeof PASS71_AUDIO_NATIVE_DESCRIPTOR; validate(record: unknown, context: Readonly<Record<string, any>>): readonly string[] }>;
export function createPass71AudioNativeEvidenceFixture(options?: Readonly<{ sourceSha?: string; tooling?: readonly Readonly<{ path: string; sha256: string }>[]; startedAt?: string; completedAt?: string }>): Record<string, any>;
