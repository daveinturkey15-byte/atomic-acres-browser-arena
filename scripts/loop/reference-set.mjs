// Reference-grounded loop - the reference-set format and its validator.
// Contract: reference-set-v1, one manifest per subject at
//   docs/references/<subject>/manifest.json
//
// WHY A FORMAT AT ALL. docs/nuketown-rebuild/REFERENCE_SCHEMATIC.md had to
// reject its own predecessor because four of its five citations did not
// resolve - a Medium page-not-found shell returning HTTP 200, a 403, a 404 and
// a bare domain - so every dimension in that document was an unsourced
// recollection wearing a citation marker. The rules below are that incident
// turned into code: a source with no resolving fetch receipt is not a source.
//
// THE SOURCE LADDER (tier travels with the source into every critic prompt):
//   T1  first-party artefact  - the publisher's own image/drawing/data.
//                               MEASURABLE. Shown to a critic only when
//                               criticTargets says so.
//   T2  own capture           - our photograph, or our own approved build.
//                               MEASURABLE, and licence-free by construction.
//   T3  permissive third party- CC0/CC-BY/PD, licence read and dated.
//                               MEASURABLE, licence line recorded.
//   T4  reported              - prose, a search summary, an indirect fetch.
//                               CORROBORATION ONLY. Never a critic target,
//                               never the sole basis for a number.
//
// THE LINE THIS FORMAT EXISTS TO HOLD:
//   Measure a first-party game artefact for geometry and proportion.
//   Never hand a commercial game's art to a critic as "make it look like this".
//   For LOOK, the bar is a T2/T3 photograph of the real-world thing, or our own
//   approved build. That is what lets the loop be reference-grounded and
//   original at the same time.

export const REFERENCE_SET_CONTRACT = 'reference-set-v1';
export const TIERS = Object.freeze(['T1', 'T2', 'T3', 'T4']);
export const SOURCE_KINDS = Object.freeze(['photo', 'drawing', 'minimap', 'measurement', 'own-capture', 'reported']);
export const SUBJECT_KINDS = Object.freeze(['arena', 'street-cell', 'building', 'prop', 'material']);

/** Tiers that may ever be put in front of a vision critic as a visual target. */
export const TARGETABLE_TIERS = Object.freeze(['T2', 'T3']);

function fail(errors, message) { errors.push(message); }

/**
 * Validate a parsed manifest. Returns { ok, errors, warnings }.
 * Errors are contract violations; warnings are honesty smells that a human
 * should look at but that do not by themselves make the set unusable.
 */
export function validateReferenceSet(manifest) {
  const errors = [];
  const warnings = [];
  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest is not an object'], warnings };
  }
  if (manifest.contract !== REFERENCE_SET_CONTRACT) {
    fail(errors, `contract must be "${REFERENCE_SET_CONTRACT}", got ${JSON.stringify(manifest.contract)}`);
  }
  if (typeof manifest.subject !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.subject)) {
    fail(errors, 'subject must be a lowercase kebab-case identifier');
  }
  if (!SUBJECT_KINDS.includes(manifest.subjectKind)) {
    fail(errors, `subjectKind must be one of ${SUBJECT_KINDS.join(', ')}`);
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    fail(errors, 'sources must be a non-empty array');
    return { ok: false, errors, warnings };
  }

  const ids = new Set();
  for (const source of manifest.sources) {
    const label = `source ${source?.id ?? '<no id>'}`;
    if (typeof source.id !== 'string' || source.id.length === 0) { fail(errors, `${label}: id is required`); continue; }
    if (ids.has(source.id)) fail(errors, `${label}: duplicate id`);
    ids.add(source.id);
    if (!TIERS.includes(source.tier)) fail(errors, `${label}: tier must be one of ${TIERS.join(', ')}`);
    if (!SOURCE_KINDS.includes(source.kind)) fail(errors, `${label}: kind must be one of ${SOURCE_KINDS.join(', ')}`);
    if (typeof source.evidenceFor !== 'string' || source.evidenceFor.length < 8) {
      fail(errors, `${label}: evidenceFor must say, in a sentence, what this source is evidence FOR`);
    }
    if (typeof source.licence !== 'string' || source.licence.length === 0) {
      fail(errors, `${label}: licence is required (write "UNKNOWN" and it will be rejected, not ignored)`);
    } else if (source.licence.toUpperCase() === 'UNKNOWN') {
      fail(errors, `${label}: licence UNKNOWN is not a reference. If the licence cannot be read, the source does not go in the file.`);
    }
    // The fetch receipt. This is the whole point of the format.
    const receipt = source.fetch;
    if (source.tier === 'T2' && source.kind === 'own-capture') {
      // Our own build output: no URL, but it still needs a byte identity.
      if (typeof source.localPath !== 'string') fail(errors, `${label}: T2 own-capture needs localPath`);
      if (!/^[0-9a-f]{64}$/.test(source.sha256 ?? '')) fail(errors, `${label}: T2 own-capture needs a sha256`);
    } else {
      if (!receipt || typeof receipt !== 'object') {
        fail(errors, `${label}: fetch receipt is required - a source with no resolving fetch receipt is not a source`);
      } else {
        if (typeof source.url !== 'string' || !/^https?:\/\//.test(source.url)) fail(errors, `${label}: url must be http(s)`);
        if (receipt.httpStatus !== 200) fail(errors, `${label}: fetch.httpStatus is ${receipt.httpStatus}, not 200`);
        if (!Number.isInteger(receipt.bytes) || receipt.bytes <= 0) fail(errors, `${label}: fetch.bytes must be a positive integer`);
        if (typeof receipt.servedContentType !== 'string') {
          fail(errors, `${label}: fetch.servedContentType must be RECORDED, not inferred from the URL extension`);
        }
        if (!/^[0-9a-f]{64}$/.test(receipt.sha256 ?? '')) fail(errors, `${label}: fetch.sha256 must be a 64-hex digest`);
        if (typeof receipt.fetchedAt !== 'string') fail(errors, `${label}: fetch.fetchedAt must be an ISO timestamp`);
      }
    }
    if (!Array.isArray(source.usableFor) || source.usableFor.length === 0) {
      fail(errors, `${label}: usableFor must list what this source may be used for`);
    }
    if (!Array.isArray(source.notUsableFor)) {
      fail(errors, `${label}: notUsableFor is mandatory - write [] only if the source distorts nothing`);
    } else if (source.notUsableFor.length === 0) {
      warnings.push(`${label}: notUsableFor is empty. Every real source distorts something (stroke inflation, foreshortening, a colour grade). Check this is honest.`);
    }
  }

  // criticTargets is an allow-list, not a hint.
  const targets = manifest.criticTargets;
  if (!Array.isArray(targets)) {
    fail(errors, 'criticTargets must be an array (an empty array means: this set feeds measurement only)');
  } else {
    for (const target of targets) {
      const source = manifest.sources.find((s) => s.id === target.sourceId);
      if (!source) { fail(errors, `criticTargets: unknown sourceId ${target.sourceId}`); continue; }
      if (target.asTarget !== true) continue;
      if (!TARGETABLE_TIERS.includes(source.tier)) {
        fail(errors, `criticTargets: ${source.id} is ${source.tier}. Only ${TARGETABLE_TIERS.join('/')} may be a visual target - a first-party commercial artefact feeds measurement only.`);
      }
      if (typeof target.reason !== 'string' || target.reason.length < 8) {
        fail(errors, `criticTargets: ${source.id} needs a reason for being shown to a critic`);
      }
    }
  }

  // Two independent sources per load-bearing number, with the agreement published.
  for (const measurement of manifest.measurements ?? []) {
    const label = `measurement "${measurement.metric ?? '<unnamed>'}"`;
    if (typeof measurement.metric !== 'string') fail(errors, `${label}: metric name required`);
    if (typeof measurement.method !== 'string' || measurement.method.length < 8) fail(errors, `${label}: method must say how the number was derived`);
    if (!Array.isArray(measurement.sources) || measurement.sources.length === 0) fail(errors, `${label}: sources required`);
    if (measurement.loadBearing === true) {
      const cross = measurement.crossCheck;
      if (!cross || typeof cross.source !== 'string' || typeof cross.agreementPct !== 'number') {
        fail(errors, `${label}: a load-bearing number needs a second independent source and a published agreementPct. One source is a hypothesis.`);
      }
    }
    if (!['VERIFIED', 'CLAIMED', 'OPEN'].includes(measurement.state)) {
      fail(errors, `${label}: state must be VERIFIED, CLAIMED or OPEN`);
    }
  }

  if (!Array.isArray(manifest.unknowns)) {
    fail(errors, 'unknowns must be an array - name what this set cannot tell you rather than leaving it blank');
  } else if (manifest.unknowns.length === 0) {
    warnings.push('unknowns is empty. Absolute scale is almost never derivable from photographs; check this is honest.');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/** The sources a critic is allowed to be shown, in manifest order. */
export function criticTargetSources(manifest) {
  const allowed = new Set((manifest.criticTargets ?? []).filter((t) => t.asTarget === true).map((t) => t.sourceId));
  return manifest.sources.filter((s) => allowed.has(s.id));
}

/** The caveat lines that must travel into the critic prompt with the images. */
export function criticCaveats(manifest) {
  const lines = [];
  for (const source of criticTargetSources(manifest)) {
    for (const item of source.notUsableFor ?? []) lines.push(`${source.id} is NOT usable for ${item}.`);
    if (source.caveats) lines.push(`${source.id}: ${source.caveats}`);
  }
  for (const line of manifest.notMatchable ?? []) lines.push(line);
  return lines;
}
