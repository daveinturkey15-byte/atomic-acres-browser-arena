import { createHash } from 'node:crypto';

/** Preservation only: this never grants candidate acceptance or release authority. */
export function validateAcceptanceArchive({ map, archives, projection, candidate }) {
  const errors = [];
  const originals = new Map();
  for (const entry of map.archives) {
    const bytes = archives.get(entry.to);
    if (!bytes) {
      errors.push(`Missing archive: ${entry.to}`);
      continue;
    }
    // JSON is tracked text; Git checkout line endings do not change its blob identity.
    const canonical = Buffer.from(Buffer.from(bytes).toString('utf8').replaceAll('\r\n', '\n'));
    const blob = createHash('sha1').update(`blob ${canonical.length}\0`).update(canonical).digest('hex');
    if (blob !== entry.blobSha) errors.push(`Changed historical bytes: ${entry.to}`);
    let manifest;
    try {
      manifest = JSON.parse(canonical.toString('utf8'));
    } catch {
      errors.push(`Invalid archived JSON: ${entry.to}`);
      continue;
    }
    if (manifest.status !== entry.originalStatus) errors.push(`Changed historical status: ${entry.to}`);
    const source = entry.from.split('/').at(-1).replace(/\.json$/, '');
    const ids = manifest.requirements.map((requirement) => requirement.id);
    if (JSON.stringify([...ids].sort()) !== JSON.stringify([...entry.requirementIds].sort())) {
      errors.push(`Archive map loses requirement IDs: ${entry.to}`);
    }
    for (const requirement of manifest.requirements) {
      const key = `${source}:${requirement.id}`;
      if (originals.has(key)) errors.push(`Duplicate original requirement: ${key}`);
      originals.set(key, requirement);
    }
  }

  const seen = new Set();
  const candidateIds = new Set(candidate.requirements.map((requirement) => requirement.id));
  const activePass = map.activeManifest.split('/').at(-1).replace(/\.json$/, '');
  for (const entry of projection.projection) {
    const key = `${entry.source}:${entry.id}`;
    if (seen.has(key)) errors.push(`Duplicate projection: ${key}`);
    seen.add(key);
    const original = originals.get(key);
    if (!original) errors.push(`Invented original requirement: ${key}`);
    else if (entry.originalState !== original.state) errors.push(`Changed original state: ${key}`);
    if (!['PROJECT', 'SUPERSEDED', 'HISTORICAL'].includes(entry.disposition) || !entry.basis?.trim()) {
      errors.push(`Unexplained disposition: ${key}`);
    }
    if (entry.disposition === 'PROJECT' && !entry.projectedInto) errors.push(`Dropped product obligation: ${key}`);
    if (entry.projectedInto) {
      const target = /^(pass-\d+)\s+(R\d+)(?:\s|$)/.exec(entry.projectedInto);
      if (!target || target[1] !== activePass || !candidateIds.has(target[2])) {
        errors.push(`Missing active requirement target: ${key}`);
      }
    }
  }
  for (const key of originals.keys()) if (!seen.has(key)) errors.push(`Omitted original requirement: ${key}`);
  if (candidateIds.size !== candidate.requirements.length) errors.push('Duplicate active requirement ID');
  if (map.grantsAcceptance !== false) errors.push('An archive cannot grant acceptance');
  return { ok: errors.length === 0, errors, originalCount: originals.size, projectedCount: seen.size, grantsAcceptance: false };
}
