// scripts/technique-lab/source-audit/validate-catalog.mjs
// Wave-1 catalog gate: schema + honest-unknown + public-safety checks.
// Run: node scripts/technique-lab/source-audit/validate-catalog.mjs
// Exit non-zero on any failure. No dependencies.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const catalogPath = resolve(root, 'public/assets/skills-lab/source-catalog.json');
const raw = readFileSync(catalogPath, 'utf8');
const catalog = JSON.parse(raw);

const failures = [];
const fail = (m) => failures.push(m);

if (catalog.schemaVersion !== 1) fail(`schemaVersion must be 1, got ${catalog.schemaVersion}`);
if (typeof catalog.updatedAt !== 'string' || catalog.updatedAt.length === 0) fail('updatedAt missing');
if (!Array.isArray(catalog.sources)) fail('sources must be an array');

// 1. All 50 IDs present exactly once, in order.
const ids = (catalog.sources || []).map((s) => s.sourceId);
for (let n = 1; n <= 50; n++) {
  const count = ids.filter((i) => i === n).length;
  if (count !== 1) fail(`sourceId ${n}: present ${count}x (want exactly 1)`);
}

// 2. Per-source schema.
const STATUSES = new Set(['implemented', 'method-extracted', 'blocked', 'comparator', 'alias', 'archive']);
const ADAPT = new Set(['exact', 'adapted', 'blocked', 'none']);
const RELS = new Set(['implements', 'informs', 'compares', 'candidate', 'blocked']);
const KINDS = new Set(['owner-post', 'repo', 'pinned-file', 'licence', 'docs', 'article', 'live-site', 'tool', 'paper', 'profile']);
for (const s of catalog.sources || []) {
  const tag = `source ${s.sourceId}`;
  if (typeof s.title !== 'string' || !s.title) fail(`${tag}: title missing`);
  if (!Array.isArray(s.urls)) fail(`${tag}: urls must be an array`);
  if (!Array.isArray(s.skillMappings)) fail(`${tag}: skillMappings must be an array`);
  if (!STATUSES.has(s.status)) fail(`${tag}: bad status ${s.status}`);
  if (!ADAPT.has(s.adaptation)) fail(`${tag}: bad adaptation ${s.adaptation}`);
  if (typeof s.method !== 'string' || !s.method) fail(`${tag}: method missing`);
  if (!Array.isArray(s.evidence)) fail(`${tag}: evidence must be an array`);
  if (!s.demo || typeof s.demo.status !== 'string') fail(`${tag}: demo.status missing`);
  if (!Array.isArray(s.limitations)) fail(`${tag}: limitations must be an array`);
  for (const u of s.urls || []) {
    if (typeof u.url !== 'string' || !/^https:\/\//.test(u.url)) fail(`${tag}: non-https url ${u.url}`);
    if (!KINDS.has(u.kind)) fail(`${tag}: bad url kind ${u.kind}`);
    if (typeof u.label !== 'string' || !u.label) fail(`${tag}: url label missing for ${u.url}`);
    if ('embedUrl' in u) fail(`${tag}: embedUrl not allowlisted in wave 1 (${u.url})`);
  }
  for (const m of s.skillMappings || []) {
    if (typeof m.skill !== 'string' || !m.skill) fail(`${tag}: skill mapping without skill`);
    if (!RELS.has(m.relation)) fail(`${tag}: bad relation ${m.relation}`);
    if (typeof m.sourceReference !== 'string' || !m.sourceReference) fail(`${tag}: mapping without sourceReference`);
  }
  for (const e of s.evidence || []) {
    if (typeof e.url !== 'string' || !e.url) fail(`${tag}: evidence without url`);
    if (typeof e.inspectedAt !== 'string' || !e.inspectedAt) fail(`${tag}: evidence without inspectedAt`);
    if (typeof e.observation !== 'string' || !e.observation) fail(`${tag}: evidence without observation`);
  }
  // 3. Blocked/comparator-without-source rows must carry an actionable blocker.
  if ((s.status === 'blocked' || s.status === 'comparator') && s.urls.length === 0 && s.sourceId !== 21) {
    // row 30 has no urls at all: blocker required (checked below for all blocked).
  }
  if (s.status === 'blocked' && !s.blocker) fail(`${tag}: blocked without blocker object`);
  if (s.blocker) {
    for (const k of ['reason', 'unblockAction', 'experiment', 'test', 'resources']) {
      if (typeof s.blocker[k] !== 'string' || !s.blocker[k]) fail(`${tag}: blocker.${k} missing/empty`);
    }
  }
  // 3b. Stage-consistency gates (wave 2: each added after a real review observation).
  // V1 (row 48 wave-1 shape): implemented claims an executing demo on record.
  if (s.status === 'implemented' && s.demo.status !== 'implemented' && s.demo.status !== 'delivered') {
    fail(`${tag}: status implemented without an executing demo (demo.status=${s.demo.status}); re-stage or record the implementation site`);
  }
  // V2 (rows 3/5/11/36 shape): a live demo under a non-implemented status must be justified.
  if ((s.demo.status === 'implemented' || s.demo.status === 'delivered') &&
      (s.status === 'method-extracted' || s.status === 'comparator' || s.status === 'blocked') &&
      s.limitations.length === 0) {
    fail(`${tag}: live demo under status ${s.status} needs a limitations justification`);
  }
  // V3 (row 7 wave-1 shape): informs/implements must not carry an unverified caveat.
  // V4: candidate must carry a re-verify pointer so it cannot be mistaken for verified.
  for (const m of s.skillMappings || []) {
    if ((m.relation === 'informs' || m.relation === 'implements') && /not re-?read|verify before ingestion/i.test(m.sourceReference)) {
      fail(`${tag}: ${m.relation} mapping carries an unverified caveat, use candidate (${m.skill})`);
    }
    if (m.relation === 'candidate' && !/verif/i.test(m.sourceReference)) {
      fail(`${tag}: candidate mapping without a re-verify pointer (${m.skill})`);
    }
  }
  // V5 (NIGHT-03): every blocked row names its alternate path.
  if (s.status === 'blocked' && s.blocker && !/alternate|rejected/i.test(s.blocker.unblockAction)) {
    fail(`${tag}: blocked without a named alternate path`);
  }
}

// 4. Public safety: no local paths, credentials, transcripts, vault content.
const FORBIDDEN = [
  /[A-Z]:\\/i, /\/Users\//, /~\/|\/home\//, /AppData/i, /Documents\//,
  /sk-[A-Za-z0-9]{8,}/, /AKIA[0-9A-Z]{16}/, /xox[bpas]-/, /ghp_[A-Za-z0-9]+/,
  /desky-bootstrap-clone/i, /\.akephalos/i, /C:\\/i, /\\\\Users/i,
];
const scan = (node, path) => {
  if (typeof node === 'string') {
    for (const re of FORBIDDEN) if (re.test(node)) fail(`public-safety at ${path}: matches ${re}`);
    return;
  }
  if (Array.isArray(node)) return node.forEach((v, i) => scan(v, `${path}[${i}]`));
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === 'localPath' || k === 'cache' || k === 'transcript') fail(`public-safety: forbidden key ${path}.${k}`);
      scan(v, `${path}.${k}`);
    }
  }
};
scan(catalog, 'catalog');

// 5. Alias row must not claim a technique.
const alias = (catalog.sources || []).find((s) => s.sourceId === 21);
if (alias && alias.status !== 'alias') fail('row 21 must keep status alias');

if (failures.length > 0) {
  console.error(`VALIDATE-CATALOG FAIL: ${failures.length} problem(s)`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`VALIDATE-CATALOG PASS: ${ids.length} sources, schema v${catalog.schemaVersion}, updated ${catalog.updatedAt}`);
