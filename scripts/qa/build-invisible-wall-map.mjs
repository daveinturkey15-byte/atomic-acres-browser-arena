#!/usr/bin/env node
// Builds the invisible-wall coordinate MAP for the invisible-geometry team
// from sweep-invisible-walls-cdp.mjs output (artifacts/qa/invisible-walls/).
//
// Read-only over the sweep JSONs; writes MAP-INVISIBLE-WALLS.md next to them.
//
// v2 (2026-08-26, playtest-and-debug): frame review of the v4 atomic-acres
// findings showed three distinct situations were being reported under one
// "invisible wall" label:
//   1. PERIMETER CONTAINMENT - the grid's outermost column walks outward and
//      presses the world-boundary collider. Expected game behaviour (you
//      cannot leave the map), NOT a defect. Counted separately, still listed.
//   2. SLOPE / STEP CLIMB - the nearest visible mesh is terrain (earth_edge,
//      ground verge) touching the eye; the authority march blocks at knee
//      height on a rise whose visible surface sits below the knee/chest/eye
//      ray bands. Likely correct "too steep to climb" authority; handed to
//      invisible-geometry as terrain-authority review items, not missing mesh.
//   3. COLLIDER PROTRUSION / TRUE INVISIBLE WALL - a collider face with no
//      visible solid surface in the probe corridor at knee/chest/eye heights.
//      Sub-split by whether visible geometry stands near (protrusion or
//      offset collider - check the frame) or nothing is visible at all
//      (pure invisible wall).
// Every finding keeps its raw record and frame; classification only changes
// how the handoff table is sorted and counted. Nothing is deleted.
//
// Clustering: findings whose blockedAt positions are within 1.5 m horizontally
// and 2.5 m vertically are one SITE. A site blocked in 3+ distinct directions
// at the same spot is classified "enclosure/stuck volume".
//
// Usage: node scripts/qa/build-invisible-wall-map.mjs [--dir artifacts/qa/invisible-walls]
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const argv = process.argv.slice(2);
const dirIndex = argv.indexOf('--dir');
const DIR = dirIndex >= 0 && argv[dirIndex + 1] ? argv[dirIndex + 1] : 'artifacts/qa/invisible-walls';

// Bounds duplicated from sweep-invisible-walls-cdp.mjs ARENAS (keep in sync).
// Used only to recognise perimeter-containment findings; a drift here would
// mislabel boundary sites, never lose one.
const ARENA_BOUNDS = {
  'atomic-acres': { minX: -31, maxX: 31, minZ: -40, maxZ: 40 },
  'rustworks-1v1': { minX: -24, maxX: 24, minZ: -26, maxZ: 26 },
  'gun-range': { minX: -16, maxX: 16, minZ: -44, maxZ: 34 },
  'skyline-terminal': { minX: -32, maxX: 32, minZ: -32, maxZ: 32 },
  'high-seas': { minX: -9, maxX: 9, minZ: -41, maxZ: 41 },
  farcrysis: { minX: -29, maxX: 29, minZ: -29, maxZ: 29 },
};

const TERRAIN_NAME = /earth|ground|terrain|slope|verge|dirt|hill/i;

// One finding -> evidence class. Order matters: perimeter first (the grid
// deliberately walks into the boundary), then terrain, then the rest.
function classify(finding, bounds) {
  const [x, , z] = finding.probePoint ?? finding.blockedAt;
  const [bx, , bz] = finding.blockedAt;
  if (bounds) {
    const nearMinX = bx - bounds.minX < 0.75 && finding.direction === 'west';
    const nearMaxX = bounds.maxX - bx < 0.75 && finding.direction === 'east';
    const nearMinZ = bz - bounds.minZ < 0.75 && finding.direction === 'north';
    const nearMaxZ = bounds.maxZ - bz < 0.75 && finding.direction === 'south';
    const outward = x < bounds.minX - 0.2 || x > bounds.maxX + 0.2
      || z < bounds.minZ - 0.2 || z > bounds.maxZ + 0.2;
    if (outward || ((nearMinX || nearMaxX || nearMinZ || nearMaxZ) && (x <= bounds.minX || x >= bounds.maxX || z <= bounds.minZ || z >= bounds.maxZ))) {
      return 'perimeter-containment';
    }
  }
  const nearest = finding.nearestVisibleMesh;
  if (nearest && TERRAIN_NAME.test(nearest.name) && nearest.gapM <= 0.5) {
    return 'slope-or-step-climb';
  }
  if (nearest && nearest.gapM <= 1.0) {
    return 'collider-protrusion-near-visible';
  }
  return 'unexplained-invisible-wall';
}

const arenaFiles = readdirSync(DIR)
  .filter((name) => name.endsWith('.json') && name !== 'sweep.json');

const hypot2 = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);

const lines = [];
lines.push('# Invisible-wall map - playtest-and-debug handoff to invisible-geometry');
lines.push('');
lines.push(`Generated: ${new Date().toISOString()}. Source: \`scripts/qa/sweep-invisible-walls-cdp.mjs\` (v4)`);
lines.push('sweep output in this directory; regenerate this map with `node scripts/qa/build-invisible-wall-map.mjs`.');
lines.push('');
lines.push('Method (what a finding means): the player was teleported to a grid cell,');
lines.push('held W for 500 ms, and moved < 0.35 m on the REAL WebGPU route (installed');
lines.push('Chrome headless, nvidia/blackwell device). The game\'s own authority');
lines.push('(`collisionProbeAt`, capsule radius 0.36) was marched forward to locate the');
lines.push('blocking surface; triangle-accurate raycasts from the player eye to knee/');
lines.push('chest/eye heights on that wall face found NO visible, solid-relevant mesh');
lines.push('(camera subtree and decorative non-solid layers excluded per repo rule).');
lines.push('Every coordinate below is a world position where the game blocks movement');
lines.push('with no visible solid surface in the probe corridor. Per-finding');
lines.push('first-person frames captured during active play are `<arena>/<finding-id>.png`.');
lines.push('');
lines.push('Classes (v2 triage - read the frame before repairing):');
lines.push('');
lines.push('- **unexplained-invisible-wall** - nothing visible near the block. Top priority.');
lines.push('- **collider-protrusion-near-visible** - visible geometry stands within ~1 m;');
lines.push('  the collider face sits in front of it (oversized/offset collision volume).');
lines.push('- **slope-or-step-climb** - terrain is the nearest visible surface; likely');
lines.push('  step/climb authority on a rise, review terrain-height vs collision agreement.');
lines.push('- **perimeter-containment** - outward walk into the world boundary. Expected;');
lines.push('  NOT a defect, listed only for completeness and excluded from defect counts.');
lines.push('');

let grandDefects = 0;
for (const file of arenaFiles) {
  const data = JSON.parse(readFileSync(resolve(DIR, file), 'utf8'));
  // v2 sweeps did not write noColliderBlocks; tolerate their files.
  const nc = data.noColliderBlocks ?? [];
  const arena = data.arena ?? basename(file, '.json');
  const findings = data.findings ?? [];
  const bounds = ARENA_BOUNDS[arena] ?? null;
  const classed = findings.map((f) => ({ ...f, evidenceClass: classify(f, bounds) }));
  const defects = classed.filter((f) => f.evidenceClass !== 'perimeter-containment');
  grandDefects += defects.length;
  const byClass = {};
  for (const f of classed) byClass[f.evidenceClass] = (byClass[f.evidenceClass] ?? 0) + 1;
  lines.push('');
  lines.push(`## ${arena}`);
  lines.push('');
  lines.push(`- moves tested: ${data.movesTested} across ${data.cellsTested} cells (grid, 4 directions each)`);
  lines.push(`- blocked stops explained by a VISIBLE collider: ${data.blockedExplained ?? 'n/a (v2/v3 file)'}`);
  lines.push(`- **invisible-wall findings: ${findings.length}** -> ${defects.length} after removing perimeter-containment`);
  lines.push(`- classes: ${Object.entries(byClass).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);
  lines.push(`- no-collider blocks (authority stops the player but the march finds no collider - terrain/slope/step authority gap, NOT a missing mesh): ${nc.length}`);
  lines.push(`- match re-boots during sweep (5-min solo clock): ${data.reloadsSurvived}`);
  lines.push('');

  // Cluster defects only; perimeter rows are appended flat at the end.
  const sites = [];
  for (const f of defects) {
    const site = sites.find((s) => hypot2(s.rep.blockedAt, f.blockedAt) < 1.5
      && Math.abs(s.rep.blockedAt[1] - f.blockedAt[1]) < 2.5);
    if (site) { site.members.push(f); continue; }
    sites.push({ rep: f, members: [f] });
  }
  const classRank = { 'unexplained-invisible-wall': 0, 'collider-protrusion-near-visible': 1, 'slope-or-step-climb': 2 };
  sites.sort((a, b) => (classRank[a.rep.evidenceClass] - classRank[b.rep.evidenceClass]) || (b.members.length - a.members.length));

  if (findings.length === 0) {
    lines.push('No invisible-wall findings in this arena.');
    lines.push('');
    continue;
  }

  lines.push('| # | world position (x, y, z) | class | dirs blocked | hits | wall dist (m) | nearest visible mesh | frames |');
  lines.push('|---|---|---|---|---|---|---|---|');
  sites.forEach((site, index) => {
    const p = site.rep.blockedAt;
    const dirs = [...new Set(site.members.map((m) => m.direction))];
    const dists = site.members.map((m) => m.wallDistanceM).filter((v) => v != null);
    const distRange = dists.length ? `${Math.min(...dists).toFixed(2)}-${Math.max(...dists).toFixed(2)}` : '?';
    const names = [...new Set(site.members.map((m) => m.nearestVisibleMesh?.name ?? '?'))];
    const kind = dirs.length >= 3 ? `${site.rep.evidenceClass} + ENCLOSURE` : site.rep.evidenceClass;
    const frames = site.members.filter((m) => existsSync(resolve(DIR, arena, `${m.id}.png`))).map((m) => m.id);
    lines.push(`| ${index + 1} | (${p[0].toFixed(2)}, ${p[1].toFixed(2)}, ${p[2].toFixed(2)}) | ${kind} | ${dirs.join(',')} | ${site.members.length} | ${distRange} | ${names.slice(0, 2).join('; ')} | ${frames.slice(0, 3).map((id) => `\`${arena}/${id}.png\``).join(' ')} |`);
  });

  const perimeter = classed.filter((f) => f.evidenceClass === 'perimeter-containment');
  if (perimeter.length > 0) {
    lines.push('');
    lines.push(`Perimeter-containment (expected boundary, not a defect): ${perimeter.length} findings at`);
    const uniq = [...new Set(perimeter.map((f) => `(${f.blockedAt[0].toFixed(1)}, ${f.blockedAt[2].toFixed(1)}) ${f.direction}`))];
    lines.push(uniq.map((entry) => `- ${entry}`).join('\n'));
  }

  // no-collider blocks: distinguish "wedged at drop height" (teleport landed
  // the player inside canopy/roof collision - frames show visible foliage all
  // around, not player-reachable) from genuine terrain-authority gaps.
  if (nc.length > 0) {
    const wedged = nc.filter((f) => (f.movedM ?? 1) < 0.02 && Math.abs((f.blockedAt?.[1] ?? 0) - 5) < 0.25);
    if (wedged.length === nc.length) {
      lines.push('');
      lines.push(`NOTE: all ${nc.length} no-collider blocks are wedged-at-drop-height cells (movedM < 0.02,`);
      lines.push('blockedAt y ~= 5.0 = the harness drop height). Frames show the player resting INSIDE');
      lines.push('visible canopy/roof collision - a teleport artifact, not a player-reachable wall.');
      lines.push('Treat as low priority; confirm a walking player can reach these volumes before repairing.');
    } else if (wedged.length > 0) {
      lines.push('');
      lines.push(`NOTE: ${wedged.length} of ${nc.length} no-collider blocks are wedged-at-drop-height cells (see frames).`);
    }
  }
  lines.push('');
  lines.push(`Clustered: ${defects.length} defect findings -> ${sites.length} distinct sites (${findings.length} raw incl. perimeter).`);
  lines.push('');
}

lines.push('');
lines.push(`Total across arenas: ${grandDefects} defect findings (perimeter-containment excluded).`);
lines.push('');

const outFile = resolve(DIR, 'MAP-INVISIBLE-WALLS.md');
writeFileSync(outFile, `${lines.join('\n')}\n`);
console.log(`wrote ${outFile}`);
