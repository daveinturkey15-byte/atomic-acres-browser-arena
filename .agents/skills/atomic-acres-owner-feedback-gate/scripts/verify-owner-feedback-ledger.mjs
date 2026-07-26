import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'PASS65_HITL_ROUND1_CORRECTION_LEDGER_2026-07-26.md');
const MATRIX_PATH = path.join(REPO_ROOT, 'docs', 'PASS65_REQUIREMENTS_MATRIX.md');
const AGENTS_PATH = path.join(REPO_ROOT, 'AGENTS.md');

function cells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function expandFeedbackRange(value) {
  const match = /^HF-(\d{3})(?:[\u2013-]HF-(\d{3}))?$/.exec(value);
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  if (end < start || end - start > 999) return [];
  return Array.from({ length: end - start + 1 }, (_, offset) => `HF-${String(start + offset).padStart(3, '0')}`);
}

function validate(ledger, matrix, agents) {
  const errors = [];
  const feedbackRows = [];
  const mappingRows = [];

  for (const line of ledger.split(/\r?\n/)) {
    const row = cells(line);
    if (!row) continue;
    if (/^HF-\d{3}$/.test(row[0]) && row.length === 7) feedbackRows.push(row);
    if (/^HF-\d{3}(?:[\u2013-]HF-\d{3})?$/.test(row[0]) && row.length === 2) mappingRows.push(row);
  }

  if (feedbackRows.length === 0) errors.push('No owner-feedback rows were parsed.');
  const byId = new Map();
  const allowedPriority = new Set(['P0', 'P1', 'P2']);
  const allowedState = new Set(['OPEN', 'IMPLEMENTED', 'VERIFIED', 'HITL']);

  for (const row of feedbackRows) {
    const [id, priority, observation, owner, falsifier, scope, state] = row;
    if (byId.has(id)) errors.push(`Duplicate feedback ID ${id}.`);
    byId.set(id, row);
    if (!allowedPriority.has(priority)) errors.push(`${id} has invalid priority ${priority || '<empty>'}.`);
    if (observation.length < 16) errors.push(`${id} has no concrete owner outcome.`);
    if (owner.length < 3) errors.push(`${id} has no accountable owner lane.`);
    if (falsifier.length < 20) errors.push(`${id} has no mechanical falsifier/evidence recipe.`);
    if (scope.length < 2) errors.push(`${id} has no affected maps/modes scope.`);
    if (!allowedState.has(state)) errors.push(`${id} has invalid lifecycle state ${state || '<empty>'}.`);
  }

  const orderedIds = [...byId.keys()].sort();
  for (let index = 0; index < orderedIds.length; index += 1) {
    const expected = `HF-${String(index + 1).padStart(3, '0')}`;
    if (orderedIds[index] !== expected) {
      errors.push(`Feedback IDs are not contiguous: expected ${expected}, found ${orderedIds[index] ?? '<missing>'}.`);
      break;
    }
  }

  const marker = /latest-id:\s*(HF-\d{3})/i.exec(ledger)?.[1];
  const actualLatest = orderedIds.at(-1) ?? null;
  if (!marker) errors.push('Ledger is missing its latest-id marker.');
  if (marker && marker !== actualLatest) errors.push(`Ledger latest-id marker ${marker} does not match ${actualLatest}.`);

  const knownRequirements = new Set(
    [...matrix.matchAll(/^\|\s*(R\d{3})\s*\|/gm)].map((match) => match[1]),
  );
  const mappedCounts = new Map();
  for (const [range, requirementList] of mappingRows) {
    const ids = expandFeedbackRange(range);
    if (ids.length === 0) errors.push(`Invalid feedback mapping range ${range}.`);
    const requirements = requirementList.split(',').flatMap((part) => {
      const trimmed = part.trim();
      const rangeMatch = /^(R\d{3})[\u2013-](R\d{3})$/.exec(trimmed);
      if (!rangeMatch) return [trimmed];
      const start = Number(rangeMatch[1].slice(1));
      const end = Number(rangeMatch[2].slice(1));
      return Array.from({ length: end - start + 1 }, (_, offset) => `R${String(start + offset).padStart(3, '0')}`);
    });
    if (requirements.length === 0) errors.push(`${range} has no planning requirements.`);
    for (const requirement of requirements) {
      if (!/^R\d{3}$/.test(requirement) || !knownRequirements.has(requirement)) {
        errors.push(`${range} references unknown planning requirement ${requirement || '<empty>'}.`);
      }
    }
    for (const id of ids) mappedCounts.set(id, (mappedCounts.get(id) ?? 0) + 1);
  }

  for (const id of byId.keys()) {
    const count = mappedCounts.get(id) ?? 0;
    if (count !== 1) errors.push(`${id} appears in ${count} planning mappings; expected exactly one.`);
  }
  for (const id of mappedCounts.keys()) {
    if (!byId.has(id)) errors.push(`Planning map references unknown feedback ID ${id}.`);
  }

  if (!agents.includes('qa:pass65:owner-feedback')) {
    errors.push('AGENTS.md does not require the owner-feedback gate.');
  }
  if (!agents.includes('prerecorded, compressed')) {
    errors.push('AGENTS.md does not retain the prerecorded-preview invariant.');
  }

  return {
    errors,
    summary: {
      feedbackRows: feedbackRows.length,
      latestId: actualLatest,
      mappingRows: mappingRows.length,
      planningRequirements: knownRequirements.size,
    },
  };
}

function runSelfTest(ledger, matrix, agents) {
  const baseline = validate(ledger, matrix, agents);
  if (baseline.errors.length > 0) return ['Known-good ledger failed before mutation self-tests.'];
  const mutations = [
    ['duplicate ID', `${ledger}\n${ledger.split(/\r?\n/).find((line) => /^\| HF-001 \|/.test(line))}`],
    ['missing mapping', ledger.replace(/^\| HF-068 \| R[^\n]+\r?$/m, '')],
    ['unowned row', ledger.replace(/^(\| HF-001 \| P\d \| [^|]+\|)[^|]+(\|)/m, '$1 $2')],
    ['bad state', ledger.replace(/^(\| HF-001 \|[^\n]*\| )OPEN( \|)$/m, '$1DONE$2')],
  ];
  const failures = [];
  for (const [name, mutatedLedger] of mutations) {
    if (mutatedLedger === ledger) {
      failures.push(`Self-test mutation did not alter input: ${name}.`);
    } else if (validate(mutatedLedger, matrix, agents).errors.length === 0) {
      failures.push(`Verifier accepted invalid fixture: ${name}.`);
    }
  }
  return failures;
}

const ledger = fs.readFileSync(LEDGER_PATH, 'utf8');
const matrix = fs.readFileSync(MATRIX_PATH, 'utf8');
const agents = fs.readFileSync(AGENTS_PATH, 'utf8');
const result = validate(ledger, matrix, agents);
if (process.argv.includes('--self-test')) result.errors.push(...runSelfTest(ledger, matrix, agents));

if (result.errors.length > 0) {
  console.error(JSON.stringify({ ok: false, ...result }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, ...result.summary, selfTest: process.argv.includes('--self-test') }, null, 2));
}
