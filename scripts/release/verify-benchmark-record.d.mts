export type BenchmarkVerification = {
  ok: true;
  releasePass: string;
  sourceSha: string;
  hosted: null | {
    digestedFiles: number;
    completeSubtreeFiles: number;
    treeSha256: string;
  };
};

export function verifyBenchmarkRecord(
  record: Record<string, unknown>,
  channels: Record<string, unknown>,
  options?: { verifyGit?: boolean },
): BenchmarkVerification;
