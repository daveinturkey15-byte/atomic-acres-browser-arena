export type Pass71NativeBrowserParityExpected = Readonly<{
  sourceSha?: string;
  tooling?: Readonly<Record<string, string>>;
  machine?: string;
  contract?: typeof PASS71_NATIVE_BROWSER_PARITY;
}>;

export const PASS71_NATIVE_BROWSER_PARITY: Readonly<{
  schemaVersion: 3;
  evidenceId: 'HF-311';
  kind: 'pass71-firefox-chrome-quality-parity';
  contract: 'atomic-acres/pass71-firefox-chrome-quality-parity@3';
  gate: string;
  viewport: Readonly<{ width: number; height: number; deviceScaleFactor: number }>;
  sceneModes: readonly ['solo-quality-combat', 'hosted-quality-combat'];
  actionTimeline: readonly ['pointer-lock', 'ads-down', 'fire', 'ads-up', 'reload'];
  settleMs: number;
  minimumWindowMs: number;
  maximumWindowMs: number;
  targetWindowMs: number;
  minimumSamples: number;
  minimumGameFrameToCallbackRatio: number;
  maximumGameFrameToCallbackRatio: number;
  minimumFirefoxMedianFpsRatio: number;
  minimumFirefoxPresentedFpsRatio: number;
  maximumFirefoxP95FrameTimeRatio: number;
  maximumFirefoxMaximumFrameTimeRatio: number;
  maximumLongTasksPerScene: number;
  stableTelemetrySampleCount: number;
  sceneStageContract: string;
  scenePositionToleranceM: number;
  maximumSceneSampleDriftM: number;
}>;
export const PASS71_NATIVE_BROWSER_PARITY_TRUSTED_ACTION_EVENTS: readonly Readonly<{
  phase: 'pointer-lock' | 'ads-down' | 'fire' | 'ads-up' | 'reload';
  type: 'mousedown' | 'mouseup' | 'click' | 'keydown' | 'keyup';
  button: number | null;
  key: string | null;
  code: string | null;
}>[];
export const PASS71_NATIVE_BROWSER_PARITY_TOOL_PATHS: Readonly<Record<string, string>>;
export const PASS71_NATIVE_BROWSER_PARITY_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-311';
  kind: 'pass71-firefox-chrome-quality-parity';
  minimumCount: 1;
  maximumCount: 1;
}>;
export const PASS71_QUALITY_REQUESTED_GRAPHICS: Readonly<Record<string, unknown>>;
export const PASS71_QUALITY_EFFECTIVE_GRAPHICS: Readonly<Record<string, unknown>>;
export function percentile(values: readonly number[], fraction: number): number | null;
export function summarizePass71FrameWindow(intervalsMs: readonly number[], elapsedMs: number): Readonly<{
  elapsedMs: number;
  sampleCount: number;
  callbackFps: number | null;
  medianFrameTimeMs: number | null;
  medianFps: number | null;
  p95FrameTimeMs: number | null;
  p99FrameTimeMs: number | null;
  maximumFrameTimeMs: number | null;
}>;
export function pass71NativeBrowserParityCanonicalBytes(record: Readonly<Record<string, unknown>>): Buffer;
export function pass71NativeBrowserParityRecordSha256(record: Readonly<Record<string, unknown>>): string;
export function pass71NativeBrowserParitySceneSignature(
  scene: Readonly<Record<string, unknown>>,
  contract?: typeof PASS71_NATIVE_BROWSER_PARITY,
): string;
export function pass71NativeBrowserParityToolingHashesAtSource(repositoryRoot: string, sourceSha: string): Readonly<Record<string, string>>;
export function pass71NativeBrowserParityFailures(
  record: Readonly<Record<string, any>>,
  expected?: Pass71NativeBrowserParityExpected,
): readonly string[];
export function assertPass71NativeBrowserParityReceipt(
  record: Readonly<Record<string, any>>,
  expected?: Pass71NativeBrowserParityExpected,
): Readonly<Record<string, any>>;
export function validatePass71NativeBrowserParityEvidence(
  record: Readonly<Record<string, any>>,
  context: Readonly<{ repositoryRoot: string; sourceSha: string }>,
): readonly string[];
export function createPass71NativeBrowserParityFixture(options?: Readonly<{
  sourceSha?: string;
  tooling?: Readonly<Record<string, string>>;
  startedAt?: string;
  completedAt?: string;
}>): Record<string, any>;
