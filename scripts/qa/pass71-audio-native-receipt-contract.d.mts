export const PASS71_AUDIO_NATIVE: Readonly<{
  schema: string; arenaSchema: string; arenas: readonly string[]; events: readonly string[];
  durationMsPerArena: number; profile: Readonly<{ name: 'Quality'; renderer: 'webgpu'; render: 'blender' }>;
  retainedSampleCount: number;
  toolingPaths: readonly string[];
}>;
export function canonicalJson(value: unknown): string;
export function sha256Canonical(value: unknown): string;
export function pass71AudioNativeFailures(receipt: unknown, expectedSourceSha: string): string[];
export function assertPass71AudioNativeReceipt(receipt: unknown, expectedSourceSha: string): unknown;
