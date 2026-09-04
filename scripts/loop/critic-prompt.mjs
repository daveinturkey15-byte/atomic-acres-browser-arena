// Reference-grounded loop - the critic prompt builder.
//
// One message carries: the reference image(s), the capture at the
// reference-matched camera WITH the probe stamp, the tier-0 measurement JSON,
// the reference set's caveats and notUsableFor lines, and the contract rules
// the critic may not propose breaking.
//
// It carries NO builder rationale and NO history. A critic that is told what
// the builder was trying to do grades the intention.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { probeToken, probeBlocks } from './probe.mjs';
import { stampProbe } from './image.mjs';
import { criticTargetSources, criticCaveats } from './reference-set.mjs';
import { CRITIC_CONTRACT, ROWS, ROW_WEIGHT, ROW_GATE_SCORE, ROOT_CAUSE_CLASSES, DECISIONS } from './critic-schema.mjs';

// Rules a critic may observe but may never propose breaking. If the only way to
// close a gap is to break one of these, the critic sets contractConflict and
// the controller escalates it to a human instead of letting a builder do it.
export const IMMUTABLE_CONTRACT_RULES = Object.freeze([
  'TSL only. No GLSL ShaderMaterial, no imported meshes or textures - everything is built in code.',
  'No new runtime dependency.',
  'The cold-compile fence stands: zero pipeline creations after the in-combat mark.',
  'The art-direction bounds stand. Do not propose moving the arena toward a reference photograph\'s colour grade.',
  'Deterministic construction: one seeded random stream, materials created at construction, no per-frame allocation.',
  'Do not propose lowering a threshold, widening a fence, removing a review camera, or re-running a check until it agrees.',
]);

export const CRITIC_LENSES = Object.freeze({
  A: 'geometry and proportion',
  B: 'material and surface read',
  C: 'lighting, value composition and technical hygiene',
});

/**
 * Build one critic round: stamps the probe into a copy of the capture and
 * returns the message text plus the ordered attachment list.
 *
 * The stamped copy goes under artifacts/, never over the archived evidence
 * capture. `dryRun` skips the sharp write so the plumbing can be proven with
 * no image work and no quota.
 */
export async function buildCriticRound({
  manifest,
  subject,
  cycle,
  criticId,
  referencePath,
  capturePath,
  captureSha256,
  precheck,
  precheckPath,
  outDir,
  dryRun = false,
}) {
  if (!CRITIC_LENSES[criticId]) throw new RangeError(`buildCriticRound: unknown criticId ${criticId} (expected A, B or C)`);
  const token = probeToken({ subject, cycle, criticId, captureSha256 });
  const stampedPath = join(outDir, `capture-critic-${criticId}-stamped.png`);
  let stamp = null;
  if (!dryRun) {
    mkdirSync(dirname(stampedPath), { recursive: true });
    stamp = await stampProbe(capturePath, stampedPath, probeBlocks(token));
  }
  const caveats = criticCaveats(manifest);
  const targets = criticTargetSources(manifest);
  const referenceSource = targets.find((s) => (s.localPath ?? s.cachePath ?? '').endsWith(referencePath.split(/[\\/]/).pop())) ?? targets[0] ?? null;

  const text = criticInstruction({
    manifest, subject, cycle, criticId, referenceSource, caveats, precheck, token,
  });

  return {
    token,
    stampedPath,
    stamp,
    text,
    attachments: [referencePath, dryRun ? capturePath : stampedPath, precheckPath].filter(Boolean),
    lens: CRITIC_LENSES[criticId],
  };
}

export function criticInstruction({ manifest, subject, cycle, criticId, referenceSource, caveats, precheck, token }) {
  const lines = [];
  lines.push('FIRST INSTRUCTION, before anything else.');
  lines.push('The CAPTURE image has a small white box in its bottom-right corner containing four large black characters, drawn in a blocky pixel ' +
    'font. The characters are from this set only: A C D E F G H J K M N P Q R T U V W X Y 3 4 6 7. Read them and report them as sawImages.answer. ' +
    'If you cannot see that white box, set sawImages.answer to "NONE". Do not guess a plausible code: a wrong code makes this round invalid, which ' +
    'is the correct outcome when you did not receive pixels, and is far better than a fabricated score.');
  lines.push('');
  lines.push(`YOU ARE CRITIC ${criticId}. Your lens is ${CRITIC_LENSES[criticId]}. You score all four rows, but you look hardest through that lens.`);
  lines.push('');
  lines.push('WHAT YOU HAVE BEEN GIVEN, in order:');
  lines.push('  1. THE REFERENCE. This is the target.' + (referenceSource ? ` Tier ${referenceSource.tier}, ${referenceSource.kind}. It is evidence for: ${referenceSource.evidenceFor}` : ''));
  lines.push('  2. THE CAPTURE. A frame from our renderer, at a camera hand-authored to approximate the reference framing.');
  lines.push('  3. THE MEASUREMENT JSON. Mechanical per-region numbers computed before you were called.');
  lines.push('');
  lines.push('HOW TO SCORE. Every row is scored as AGREEMENT WITH THE REFERENCE, not as a quality opinion. ' +
    `Four rows, ${ROW_WEIGHT} points each. A row at or above ${ROW_GATE_SCORE} passes; below that you must propose exactly ONE bounded correction for it.`);
  lines.push(`  geometry-match  - is the structure present, and is it the structure the reference has?`);
  lines.push(`  proportion      - do the ratios agree? Reconcile with the measured edge IoU per region.`);
  lines.push(`  material-read   - does the surface read as the same MATERIAL CLASS at this distance? Not "is it pretty".`);
  lines.push(`  lighting-match  - do the VALUE relationships agree: which plane is brightest, where the terminator falls, how deep the contact shadow is?`);
  lines.push('');
  lines.push('EVERY ROW MUST NAME REGIONS. Regions are the 3x3 grid ids r0c0 (top-left) through r2c2 (bottom-right), or the named regions in the ' +
    'measurement JSON. A finding with no region cannot be turned into a bounded correction and will be rejected.');
  lines.push('');
  lines.push('THE MEASUREMENT JSON IS EVIDENCE YOU MUST RECONCILE WITH, not a suggestion. If you score geometry-match high on a region whose ' +
    'measured edge IoU is on the floor, say in the finding WHY the measurement is wrong about that region (different camera, a foreground occluder, ' +
    'a colour grade). If you cannot say why, score it down. "Looks fine" does not outvote a measurement.');
  lines.push('');
  if (caveats.length > 0) {
    lines.push('WHAT THIS REFERENCE CANNOT TELL YOU. These are not matchable and must NOT be scored against us:');
    for (const line of caveats) lines.push(`  - ${line}`);
    lines.push('');
  }
  lines.push('RULES YOU MAY NOT PROPOSE BREAKING. If the only fix you can see breaks one of these, set contractConflict to the rule and set ' +
    'decision to "request-input" instead of proposing it:');
  for (const rule of IMMUTABLE_CONTRACT_RULES) lines.push(`  - ${rule}`);
  lines.push('');
  lines.push('notMatchable IS MANDATORY AND MUST NOT BE EMPTY. No render and no reference agree on everything. List at least one thing that ' +
    'legitimately differs and that you therefore did not score. A critic that lists nothing is over-claiming and the controller records it as such.');
  lines.push('');
  lines.push('REPLY WITH ONE JSON OBJECT AND NOTHING ELSE. Shape:');
  lines.push(JSON.stringify(exampleResponse({ subject, cycle, criticId }), null, 2));
  return lines.join('\n');
}

export function exampleResponse({ subject, cycle, criticId }) {
  return {
    contract: CRITIC_CONTRACT,
    subject,
    cycle,
    criticId,
    sawImages: { answer: '<the four-character code from the capture corner, or NONE>' },
    rows: ROWS.map((row) => ({
      row,
      weight: ROW_WEIGHT,
      score: 0,
      regions: ['r1c1'],
      finding: 'One sentence saying what disagrees, in this region, against the reference.',
      referenceEvidence: 'where in the reference you looked',
      captureEvidence: 'where in the capture you looked',
      severity: 'P1',
      boundedCorrection: 'One change. Name it. Change nothing else.',
    })),
    largestGap: { row: ROWS[0], regions: ['r1c1'], rootCauseClass: ROOT_CAUSE_CLASSES[1] },
    contractConflict: null,
    decision: DECISIONS[2],
    notMatchable: ['at least one honest non-matchable difference'],
  };
}
