// repo-state snapshot — read-only Git-state dashboard for Atomic Acres lanes.
// Usage: node snapshot.mjs [repo-path] [out-dir]
// Writes state-<ts>.json + index.html. Re-run anytime for before/after compare.
// Never mutates repos: only git worktree/branch/rev-parse/status/diff plumbing.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repo = process.argv[2] ?? 'C:/Users/david/Desktop/stuff/atomic-acres';
const outDir = process.argv[3] ?? 'C:/Users/david/Desktop/stuff/repo-state';
mkdirSync(outDir, { recursive: true });

const git = (cwd, ...args) => {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', timeout: 60000 }).trim();
  } catch { return 'ERR'; }
};
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);

const porcelain = git(repo, 'worktree', 'list', '--porcelain').split('\n');
const trees = [];
let cur = null;
for (const line of porcelain) {
  if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; trees.push(cur); }
  else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
  else if (line === 'detached' && cur) cur.detached = true;
  else if (line === 'bare' && cur) cur.bare = true;
}
for (const t of trees) {
  t.head = git(t.path, 'rev-parse', '--short', 'HEAD');
  t.branchName = t.detached ? 'HEAD' : (t.branch ?? git(t.path, 'rev-parse', '--abbrev-ref', 'HEAD'));
  const status = git(t.path, 'status', '--porcelain').split('\n').filter(Boolean);
  t.dirty = status.length;
  t.untracked = status.filter((l) => l.startsWith('??')).length;
  t.staged = status.filter((l) => l[0] !== ' ' && l[0] !== '?').length;
  const ahead = git(t.path, 'rev-list', '--count', 'origin/main..HEAD');
  t.ahead = /^\d+$/.test(ahead) ? Number(ahead) : -1;
  t.flags = [];
  if (t.detached) t.flags.push('detached-HEAD');
  if (t.dirty > 0) t.flags.push('dirty');
  if (t.branchName.includes('world-studio-20260912')) t.flags.push('live-line·PASS96');
  if (t.branchName.includes('newworld-prime-20260914')) t.flags.push('tonight·PR69');
  if (t.branchName.includes('newworld-20260913')) t.flags.push('overnight·PR68');
  if (t.branchName.includes('reconcile-hitl')) t.flags.push('reconciliation-line');
}
const branches = git(repo, 'branch', '--list').split('\n').filter(Boolean).length;
const data = {
  generatedAt: new Date().toISOString(), repo, stamp,
  totals: {
    worktrees: trees.length,
    dirtyPaths: trees.reduce((a, t) => a + t.dirty, 0),
    clean: trees.filter((t) => t.dirty === 0).length,
    localBranches: branches,
    detached: trees.filter((t) => t.detached).length,
    maxAhead: Math.max(...trees.map((t) => t.ahead)),
  },
  trees,
};
writeFileSync(join(outDir, `state-${stamp}.json`), JSON.stringify(data, null, 1));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const rows = [...trees].sort((a, b) => b.dirty - a.dirty || b.ahead - a.ahead).map((t) => {
  const state = t.dirty > 0 ? '<span class="pill dirty">dirty</span>' : '<span class="pill clean">clean</span>';
  return `<tr><td class="mono">${esc(t.path)}</td><td>${state}</td><td class="num">${t.dirty}</td>`
    + `<td class="num">${t.ahead >= 0 ? t.ahead : '?'}</td><td class="mono">${esc(t.branchName)}</td>`
    + `<td class="mono">${esc(t.head)}</td><td>${t.flags.map((f) => `<span class="flag">${esc(f)}</span>`).join(' ')}</td></tr>`;
}).join('\n');
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Repository state — ${esc(stamp)}</title>
<style>body{background:#0b0e14;color:#dbe2f1;font:14px/1.45 system-ui,sans-serif;margin:0;padding:24px}
h1{font-size:18px;margin:0 0 4px}.sub{color:#8b93a7;font-size:12px;margin-bottom:20px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px}
.card{background:#121724;border:1px solid #232c44;border-radius:10px;padding:14px}
.card b{display:block;font-size:26px;color:#ffb454}.card span{font-size:11px;color:#8b93a7;text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;color:#8b93a7;text-transform:uppercase;font-size:10px;letter-spacing:.06em;padding:8px;border-bottom:1px solid #232c44}
td{padding:7px 8px;border-bottom:1px solid #161c2c;vertical-align:top}.mono{font-family:ui-monospace,monospace;font-size:11px}.num{text-align:right;font-variant-numeric:tabular-nums}
.pill{font-size:10px;padding:2px 8px;border-radius:20px;text-transform:uppercase}.dirty{background:#3a1f1f;color:#ff8a8a}.clean{background:#17301f;color:#7dffa8}
.flag{font-size:10px;background:#232c44;border-radius:4px;padding:2px 6px;margin-right:4px;white-space:nowrap}</style></head>
<body><h1>Repository state — ${esc(stamp)}</h1>
<div class="sub">${esc(repo)} · generated ${esc(data.generatedAt)} · read-only snapshot</div>
<div class="cards">
<div class="card"><b>${data.totals.worktrees}</b><span>working trees</span></div>
<div class="card"><b>${data.totals.dirtyPaths}</b><span>dirty paths</span></div>
<div class="card"><b>${data.totals.clean} of ${data.totals.worktrees}</b><span>clean</span></div>
<div class="card"><b>${data.totals.maxAhead}</b><span>max local-only commits</span></div>
<div class="card"><b>${data.totals.localBranches}</b><span>local branches</span></div>
<div class="card"><b>${data.totals.detached}</b><span>detached heads</span></div>
</div>
<table><tr><th>Repo / worktree</th><th>State</th><th>Dirty</th><th>Ahead of origin/main</th><th>Branch</th><th>HEAD</th><th>Flags</th></tr>
${rows}</table></body></html>`;
writeFileSync(join(outDir, 'index.html'), html);
console.log(`wrote state-${stamp}.json + index.html (${trees.length} worktrees, ${data.totals.dirtyPaths} dirty)`);
