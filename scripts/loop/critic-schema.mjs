// Reference-grounded loop - the critic response schema and its validator.
// Contract: reference-critic-v1.
//
// THE ONE CHANGE THAT MATTERS. The overnight rubric scored quality opinions:
// "layout fidelity", "material and texture quality", "lighting and atmosphere".
// A rubric-only critic converges on the absence of things it can NAME, and once
// it can no longer name a missing thing it awards 97. Every row below is scored
// instead as AGREEMENT WITH A NAMED REFERENCE, and every row must cite the
// region of the frame it is talking about, so a score can go DOWN because a
// photograph says so.
//
// Rows, 25 points each:
//   geometry-match  is the structure present, and is it the structure the
//                   reference has? Regions, never the whole frame.
//   proportion      do the ratios agree? The tier-0 per-region edge IoU is the
//                   evidence the critic must reconcile with.
//   material-read   does the surface read as the same MATERIAL CLASS at this
//                   distance - aggregate, sheet metal with a paint sheen,
//                   weathered timber? Not "is it pretty".
//   lighting-match  do the VALUE relationships agree - which plane is
//                   brightest, where the terminator falls, how deep the contact
//                   shadow is? Absolute colour temperature is excluded wherever
//                   the reference set says so, so a critic cannot quietly drag
//                   the art direction toward a photograph's grade.

export const CRITIC_CONTRACT = 'reference-critic-v1';
export const ROWS = Object.freeze(['geometry-match', 'proportion', 'material-read', 'lighting-match']);
export const ROW_WEIGHT = 25;
export const MAX_TOTAL = ROWS.length * ROW_WEIGHT;
export const ROW_GATE_FRACTION = 0.85;
export const ROW_GATE_SCORE = ROW_WEIGHT * ROW_GATE_FRACTION; // 21.25
export const SEVERITIES = Object.freeze(['P0', 'P1', 'P2', 'P3']);
export const ROOT_CAUSE_CLASSES = Object.freeze(['spec', 'implementation', 'camera-lighting', 'missing-evidence', 'performance']);
export const DECISIONS = Object.freeze(['continue', 'refine-spec', 'refine-code', 'request-input', 'stop']);

// A critic that claims the geometry agrees while the mechanical edge IoU on the
// same region is on the floor has not reconciled with the measurement, and a
// critic that disagrees with a measurement without saying why is not evidence.
export const TIER0_CONTRADICTION = Object.freeze({
  geometryScoreAtLeast: 22,
  regionEdgeIoUBelow: 0.4,
});

/** Pull the first balanced top-level JSON object out of a model's prose. */
export function extractJson(text) {
  if (typeof text !== 'string') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  const start = text.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth += 1;
      else if (ch === '}') { depth -= 1; if (depth === 0) { candidates.push(text.slice(start, i + 1)); break; } }
    }
  }
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* try the next candidate */ }
  }
  return null;
}

/**
 * Validate one critic response.
 * `precheck` is the tier-0 JSON for the same pair; when supplied, the tier-0
 * contradiction rule is enforced and can invalidate an otherwise well-formed
 * response. Tier 0 blocks tier 1 from being believed - never the other way.
 */
export function validateCriticResponse(response, { expectedProbe = null, precheck = null } = {}) {
  const errors = [];
  const warnings = [];
  if (!response || typeof response !== 'object') {
    return { valid: false, invalidReason: 'unparseable', errors: ['response is not an object'], warnings, total: null };
  }
  if (response.contract !== CRITIC_CONTRACT) errors.push(`contract must be "${CRITIC_CONTRACT}"`);

  // The receipt comes first: without it nothing else in the response is evidence.
  let invalidReason = null;
  if (expectedProbe !== null) {
    const answer = response.sawImages?.answer;
    if (typeof answer !== 'string' || answer.length === 0) invalidReason = 'probe-missing';
    else {
      const normalised = answer.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const hit = normalised === expectedProbe || (normalised.length <= expectedProbe.length * 3 && normalised.includes(expectedProbe));
      if (!hit) invalidReason = 'probe-mismatch';
    }
  }

  const rows = Array.isArray(response.rows) ? response.rows : [];
  const seen = new Set();
  for (const row of rows) {
    const label = `row ${row?.row ?? '<unnamed>'}`;
    if (!ROWS.includes(row.row)) { errors.push(`${label}: unknown row name`); continue; }
    if (seen.has(row.row)) errors.push(`${label}: duplicated`);
    seen.add(row.row);
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > ROW_WEIGHT) errors.push(`${label}: score must be 0..${ROW_WEIGHT}`);
    if (!Array.isArray(row.regions) || row.regions.length === 0) {
      errors.push(`${label}: regions is mandatory - a finding with no region cannot produce a bounded correction`);
    }
    if (typeof row.finding !== 'string' || row.finding.length < 12) errors.push(`${label}: finding must be a sentence`);
    if (typeof row.referenceEvidence !== 'string') errors.push(`${label}: referenceEvidence must name where in the reference you looked`);
    if (typeof row.captureEvidence !== 'string') errors.push(`${label}: captureEvidence must name where in the capture you looked`);
    if (row.severity !== undefined && !SEVERITIES.includes(row.severity)) errors.push(`${label}: severity must be one of ${SEVERITIES.join('/')}`);
    if (row.score < ROW_GATE_SCORE && (typeof row.boundedCorrection !== 'string' || row.boundedCorrection.length < 12)) {
      errors.push(`${label}: a failing row must propose ONE bounded correction`);
    }
  }
  for (const required of ROWS) if (!seen.has(required)) errors.push(`missing row: ${required}`);

  if (!response.largestGap || !ROWS.includes(response.largestGap.row)) errors.push('largestGap.row must name one of the four rows');
  else if (!Array.isArray(response.largestGap.regions) || response.largestGap.regions.length === 0) errors.push('largestGap.regions is mandatory');
  else if (!ROOT_CAUSE_CLASSES.includes(response.largestGap.rootCauseClass)) errors.push(`largestGap.rootCauseClass must be one of ${ROOT_CAUSE_CLASSES.join('/')}`);

  if (!DECISIONS.includes(response.decision)) errors.push(`decision must be one of ${DECISIONS.join('/')}`);

  // The honesty valve. A critic that lists nothing as not-matchable is
  // over-claiming: no render and no photograph agree on everything.
  if (!Array.isArray(response.notMatchable)) errors.push('notMatchable is mandatory');
  else if (response.notMatchable.length === 0) warnings.push('notMatchable is empty - the critic is over-claiming; the controller records this.');

  // Tier 0 blocks tier 1.
  if (!invalidReason && precheck) {
    const geometry = rows.find((r) => r.row === 'geometry-match');
    if (geometry && geometry.score >= TIER0_CONTRADICTION.geometryScoreAtLeast) {
      const named = new Set(geometry.regions ?? []);
      const contradicted = (precheck.regions ?? []).filter(
        (r) => named.has(r.id) && Number.isFinite(r.edgeIoU) && r.edgeIoU < TIER0_CONTRADICTION.regionEdgeIoUBelow,
      );
      if (contradicted.length > 0) {
        invalidReason = 'tier0-contradiction';
        errors.push(
          `geometry-match scored ${geometry.score}/${ROW_WEIGHT} while measured edge IoU is below ${TIER0_CONTRADICTION.regionEdgeIoUBelow} on ${contradicted.map((r) => `${r.id}=${r.edgeIoU}`).join(', ')}`,
        );
      }
    }
  }

  const wellFormed = errors.length === 0;
  const valid = wellFormed && invalidReason === null;
  // An INVALID round carries NO score - not even a recorded one. A total left
  // on a probe-mismatched critic is a number somebody quotes six weeks later
  // without reading the invalidReason beside it, which is precisely how the
  // unanchored 97/100 became citable in the first place.
  return {
    valid,
    invalidReason: invalidReason ?? (wellFormed ? null : 'schema-invalid'),
    errors,
    warnings,
    total: valid ? rows.reduce((sum, row) => sum + row.score, 0) : null,
    rowsBelowGate: valid ? rows.filter((r) => r.score < ROW_GATE_SCORE).map((r) => r.row) : null,
  };
}

/** Exit gate for one cycle: every row at or above 85% on every valid critic. */
export function rowsPassGate(validated) {
  return validated.every((v) => v.valid && Array.isArray(v.rowsBelowGate) && v.rowsBelowGate.length === 0);
}
