#!/usr/bin/env node

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) values[token.slice(2)] = true;
    else {
      values[token.slice(2)] = next;
      index += 1;
    }
  }
  return values;
}

function milliseconds(start, end) {
  const startMs = Date.parse(start ?? '');
  const endMs = Date.parse(end ?? '');
  return Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null;
}

export function summarizeWorkflow(run, jobs, acceptance = null) {
  const completedJobs = jobs.filter((job) => job.name !== 'pipeline-metrics' && job.started_at && job.completed_at);
  const jobMetrics = completedJobs.map((job) => ({
    name: job.name,
    conclusion: job.conclusion,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    startDelayMs: milliseconds(run.created_at, job.started_at),
    durationMs: milliseconds(job.started_at, job.completed_at),
  })).sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  const lastCompletedAt = jobMetrics.reduce((latest, job) => (
    !latest || Date.parse(job.completedAt) > Date.parse(latest) ? job.completedAt : latest
  ), null);
  const summary = {
    schemaVersion: 1,
    repository: run.repository?.full_name ?? null,
    workflowRun: String(run.id),
    workflowName: run.name,
    event: run.event,
    headSha: run.head_sha,
    createdAt: run.created_at,
    measuredThrough: lastCompletedAt,
    wallMs: lastCompletedAt ? milliseconds(run.created_at, lastCompletedAt) : null,
    jobs: jobMetrics,
    resultCounts: Object.fromEntries([...new Set(jobMetrics.map((job) => job.conclusion))]
      .map((conclusion) => [conclusion, jobMetrics.filter((job) => job.conclusion === conclusion).length])),
    acceptance,
  };
  if (acceptance?.feedbackReceivedAt && acceptance?.previewCreatedAt) {
    summary.feedbackToPreviewMs = milliseconds(acceptance.feedbackReceivedAt, acceptance.previewCreatedAt);
  }
  if (acceptance?.previewCreatedAt && acceptance?.approvedAt) {
    summary.previewToApprovalMs = milliseconds(acceptance.previewCreatedAt, acceptance.approvedAt);
  }
  return summary;
}

function markdown(metrics) {
  const minutes = (value) => value === null ? 'n/a' : `${(value / 60_000).toFixed(2)} min`;
  const rows = metrics.jobs.map((job) => `| ${job.name} | ${job.conclusion} | ${minutes(job.startDelayMs)} | ${minutes(job.durationMs)} |`).join('\n');
  const acceptance = metrics.acceptance
    ? `\nAcceptance: **${metrics.acceptance.verified ?? 0}/${metrics.acceptance.total ?? 0} verified**, ${metrics.acceptance.deferred ?? 0} explicitly deferred.`
    : '\nAcceptance: no receipt was available for this process-only or failed-before-receipt run.';
  return `## Pipeline benchmark\n\nMeasured wall time: **${minutes(metrics.wallMs)}**.${acceptance}\n\n| Job | Result | Start delay | Execution |\n| --- | --- | ---: | ---: |\n${rows}\n`;
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub API ${response.status} for ${url}`);
  return response.json();
}

if (resolve(process.argv[1] ?? '') === SCRIPT_PATH) {
  const values = parseArgs(process.argv.slice(2));
  const repository = values.repository ?? process.env.GITHUB_REPOSITORY;
  const runId = values['run-id'] ?? process.env.GITHUB_RUN_ID;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !runId || !token) throw new Error('repository, run id, and GITHUB_TOKEN are required');
  const api = process.env.GITHUB_API_URL ?? 'https://api.github.com';
  const [run, jobsPayload] = await Promise.all([
    githubJson(`${api}/repos/${repository}/actions/runs/${runId}`, token),
    githubJson(`${api}/repos/${repository}/actions/runs/${runId}/jobs?per_page=100`, token),
  ]);
  const acceptancePath = values.acceptance;
  const acceptance = acceptancePath && existsSync(acceptancePath)
    ? JSON.parse(readFileSync(acceptancePath, 'utf8')) : null;
  const metrics = summarizeWorkflow(run, jobsPayload.jobs ?? [], acceptance);
  const output = values.output ?? 'artifacts/pipeline/workflow-metrics.json';
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(metrics), 'utf8');
  console.log(JSON.stringify(metrics, null, 2));
}
