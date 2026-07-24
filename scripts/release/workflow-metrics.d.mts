export type WorkflowJobInput = Readonly<{
  name: string;
  conclusion: string;
  started_at: string | null;
  completed_at: string | null;
}>;

export type WorkflowRunInput = Readonly<{
  id: number | string;
  name: string;
  event: string;
  head_sha: string;
  created_at: string;
  repository?: Readonly<{ full_name?: string }>;
}>;

export function summarizeWorkflow(
  run: WorkflowRunInput,
  jobs: readonly WorkflowJobInput[],
  acceptance?: Record<string, unknown> | null,
): Readonly<{
  wallMs: number | null;
  feedbackToPreviewMs?: number | null;
  previewToApprovalMs?: number | null;
  jobs: Array<Readonly<{ startDelayMs: number | null; durationMs: number | null }>>;
  [key: string]: unknown;
}>;
