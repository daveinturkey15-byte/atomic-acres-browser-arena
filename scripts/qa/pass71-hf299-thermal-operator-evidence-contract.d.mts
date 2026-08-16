export declare const PASS71_HF299_THERMAL_EVIDENCE_DESCRIPTOR: Readonly<{
  evidenceId: 'HF-299';
  kind: 'pass71-hf299-exact-thermal-operator-coverage';
  minimumCount: 0;
  maximumCount: 1;
}>;
export declare const PASS71_HF299_THERMAL_EVIDENCE_REGISTRY_ENTRY: Readonly<{
  descriptor: typeof PASS71_HF299_THERMAL_EVIDENCE_DESCRIPTOR;
  validate(record: unknown, context: Readonly<Record<string, any>>): string[];
}>;
export declare const PASS71_HF299_SCOPES: readonly Readonly<{
  targetKind: 'bot' | 'remote';
  renderer: 'webgl2' | 'webgpu';
  weapon: 'm14-ebr' | 'railgun';
}>[];
export declare const PASS71_HF299_TOOL_PATHS: readonly string[];
export declare function pass71Hf299EvidenceFailures(record: unknown, expected?: Readonly<Record<string, unknown>>): string[];
export declare function pass71Hf299RecordSha256(record: unknown): string;
export declare function pass71Hf299ThermalRasterAttribution(
  visibleBytes: Buffer,
  controlBytes: Buffer,
): Readonly<{
  width: number;
  height: number;
  pixelCount: number;
  changedPixelsAt24: number;
  changedPixelRatioAt24: number;
  attributableThermalPixels: number;
  attributableThermalPixelRatio: number;
  maximumChannelDelta: number;
}>;
export declare function pass71Hf299ToolingHashesAtSource(repositoryRoot: string, sourceSha: string): readonly Readonly<{ path: string; sha256: string }>[];
export declare function createPass71Hf299EvidenceFixture(options?: Readonly<Record<string, any>>): Record<string, any>;
