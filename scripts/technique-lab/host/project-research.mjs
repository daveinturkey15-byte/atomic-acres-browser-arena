// Build a public, allowlisted projection. Never import the private research
// records into browser code: omitted properties would still ship in chunks.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function projectResearch(data) {
  const safe = (v) => typeof v === 'string' && !/[a-z]:[\\/]|\\\\|\/Users\/|\/home\//i.test(v) ? v : undefined;
  const keys = ['pin', 'canonical', 'licence', 'readDepth', 'method', 'methodConsumer', 'decision', 'cpuCheck', 'pixelValidation', 'renderedAcceptance'];
  const records = (data.records ?? data.rows ?? []).map((row) => {
    const out = { sourceId: row.sourceId };
    for (const key of keys) if (safe(row[key]) !== undefined) out[key] = safe(row[key]);
    if (typeof row.methodExtracted === 'boolean') out.methodExtracted = row.methodExtracted;
    else if (safe(row.methodExtracted) !== undefined) out.methodExtracted = safe(row.methodExtracted);
    if (typeof row.carrierReadComplete === 'boolean') out.carrierReadComplete = row.carrierReadComplete;
    out.filesRead = (row.filesRead ?? []).map(safe).filter(Boolean);
    out.urls = (row.urls ?? row.urlAttempts ?? []).map((url) => ({
      outcome: safe(url.outcome), readDepth: safe(url.readDepth),
      sha256: /^[a-f0-9]{64}$/i.test(url.sha256 ?? '') ? url.sha256 : undefined,
      attemptedAt: safe(url.attemptedAt ?? url.timestamp),
    }));
    return out;
  });
  return { records };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceRoot = path.resolve(process.argv[2] ?? '.');
  const destination = path.resolve(process.argv[3] ?? 'scripts/technique-lab/host/public-research.json');
  const records = [], inputs = [];
  for (const group of ['a', 'b', 'c']) {
    const relative = `docs/technique-lab/group-${group}/SOURCE_RESEARCH.json`;
    const file = path.join(sourceRoot, relative);
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    inputs.push({ file: relative, sha256: createHash('sha256').update(bytes).digest('hex') });
    records.push(...projectResearch(JSON.parse(bytes.toString('utf8'))).records.map((row) => ({ ...row, group: `group-${group}` })));
  }
  fs.writeFileSync(destination, JSON.stringify({ schemaVersion: 1, inputs, records }, null, 2) + '\n');
  console.log(JSON.stringify({ projectedFiles: inputs.length, projectedRecords: records.length }));
}
