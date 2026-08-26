#!/usr/bin/env node
// Builds the invisible-wall coordinate MAP for the invisible-geometry team
// from sweep-invisible-walls-cdp.mjs output (artifacts/qa/invisible-walls/).
//
// Read-only over the sweep JSONs; writes MAP-INVISIBLE-WALLS.md next to them.
// Clustering: findings whose blockedAt positions are within 1.5 m horizontally
// and 2.5 m vertically are one SITE. A site blocked in 3+ distinct directions
// at the same spot is classified "enclosure/stuck volume" (the probe could not
// move at all - the blocker surrounds the cell) versus "planar wall" (1-2
// directions). Both are hand-off items; the distinction tells the repair team
// whether to look for a missing wall mesh or a volume/overlap bug.
//
// Usage: node scripts/qa/build-invisible-wall-map.mjs [--dir artifacts/qa/invisible-walls]
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const argv = process.argv.slice(2);
const dirIndex = argv.indexOf('--dir');
const DIR = dirIndex >= 0 && argv[dirIndex + 1] ? argv[dirIndex + 1] : 'artifacts/qa/invisible-walls';

const arenaFiles = readdirSync(DIR)
  .filter((name) => name.endsWith('.json') && name !== 'sweep.json');

const hypot2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

const lines = [];
lines.push('# Invisible-wall map - playtest-and-debug handoff to invisible-geometry');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}. Source: \`scripts/qa/sweep-invisible-walls-cdp.mjs\` (v3)`);
lines.push('sweep output in this directory; regenerate this map with `node scripts/qa/build-invisible-wall-map.mjs`.');
lines.push('');
lines.push('Method (what a finding means): the player was teleported to a grid cell,');
lines.push('held W for 500 ms, and moved < 0.35 m. The game\'s own authority');
lines.push('(`collisionProbeAt`, capsule radius 0.36) was marched forward to locate the');
lines.push('blocking surface; triangle-accurate raycasts from the player eye to knee/');
lines.push('chest/eye heights on that wall face found NO visible, solid-relevant mesh');
lines.push('(camera subtree and decorative non-solid layers excluded per repo rule).');
lines.push('Every coordinate below is a world position where the game blocks movement');
lines.push('with nothing visible there. Per-finding first-person frames captured during');
lines.push('active play are `<arena>/<finding-id>.png` in this directory.');
lines.push('');

for (const file of arenaFiles) {
  const data = JSON.parse(readFileSync(resolve(DIR, file), 'utf8'));
  const arena = data.arena ?? basename(file, '.json');
  const findings = data.findings ?? [];
  lines.push('');
  lines.push(`## ${arena}`);
  lines.push('');
  lines.push(`- moves tested: ${data.movesTested} across ${data.cellsTested} cells (grid, 4 directions each)`);
  lines.push(`- blocked stops explained by a VISIBLE collider: ${data.blockedExplained}`);
  lines.push(`- **invisible-wall findings: ${findings.length}** -> clustered sites below`);
  lines.push(`- no-collider blocks (authority stops the player but the march finds no collider - terrain/slope/step authority gap, NOT a missing mesh): ${nc.length}`);
  lines.push(`- match re-boots during sweep (5-min solo clock): ${data.reloadsSurvived}`);
  lines.push('');

  // Cluster.
  const sites = [];
  for (const f of findings) {
    const site = sites.find((s) => hypot2(s.rep.blockedAt, f.blockedAt) < 1.5
      && Math.abs(s.rep.blockedAt[1] - f.blockedAt[1]) < 2.5);
    if (site) site.members.push(f);
    else sites.push({ rep: f, members: [f] });
  }
  sites.sort((a, b) => b.members.length - a.members.length);

  if (findings.length === 0) {
    lines.push('No invisible-wall findings in this arena.');
    lines.push('');
    continue;
  }

  lines.push('| # | world position (x, y, z) | dirs blocked | hits | wall dist (m) | nearest visible mesh | class | frames |');
  lines.push('|---|---|---|---|---|---|---|---|');
  sites.forEach((site, index) => {
    const p = site.rep.blockedAt;
    const dirs = [...new Set(site.members.map((m) => m.direction))];
    const dists = site.members.map((m) => m.wallDistanceM).filter((v) => v != null);
    const distRange = dists.length ? `${Math.min(...dists).toFixed(2)}-${Math.max(...dists).toFixed(2)}` : '?';
    const names = [...new Set(site.members.map((m) => m.nearestVisibleMesh?.name ?? '?'))];
    const kind = dirs.length >= 3 ? 'ENCLOSURE/stuck-volume' : 'planar wall';
    const frames = site.members.filter((m) => existsSync(resolve(DIR, arena, `${m.id}.png`))).map((m) => m.id);
    lines.push(`| ${index + 1} | (${p[0].toFixed(2)}, ${p[1].toFixed(2)}, ${p[2].toFixed(2)}) | ${dirs.join(',')} | ${site.members.length} | ${distRange} | ${names.slice(0, 2).join('; ')} | ${kind} | ${frames.slice(0, 3).map((id) => `\`${arena}/${id}.png\``).join(' ')} |`);
  });
  lines.push('');
  lines.push(`Clustered: ${findings.length} findings -> ${sites.length} distinct sites.`);
  lines.push('');
}

const outFile = resolve(DIR, 'MAP-INVISIBLE-WALLS.md');
writeFileSync(outFile, `${lines.join('\n')}\n`);
console.log(`wrote ${outFile}`);
