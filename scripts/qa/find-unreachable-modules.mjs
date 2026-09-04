#!/usr/bin/env node
// Reachability sweep over src/ that reports modules production code can no longer
// reach, walking the real import graph from the index.html entry points.
//
// Usage: node scripts/qa/find-unreachable-modules.mjs [--json]
// --json            (default: off) emit a machine-readable JSON report instead of
//                   the human-readable tables
// (no environment variables are read; the sweep root defaults to the current
// working directory)
//
// Writes: nothing (the report goes to stdout).
// Exit codes: 0 = pass (no unreachable modules and no test-only modules beyond the
//             allowlist); 1 = fail (any unreachable or unallowlisted test-only
//             module found).
// Reachability sweep over src/.
//
// Walks the real import graph from the app entry points and reports which
// modules nothing can reach. Dead modules are not merely clutter: this repo had
// a 2,300-line farcrysis-terrain.ts that no longer had a single importer, and
// it cost real time - edits were made to it, verified as type-clean and
// test-green, and changed nothing at runtime because the live arena is built by
// a different module entirely.
//
// Test-only reachability is reported separately: a module reachable ONLY from
// tests is code that exists to be tested and nothing else, which is its own
// smell.
//
// Usage: node scripts/qa/find-unreachable-modules.mjs [--json]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWLISTED_TEST_ONLY_MODULES = new Set([
  'src/sound-event-inventory.ts',
  'src/pass64-diagnostics-analyzer.ts',
  'src/pass65-renderer-feature-inventory.ts',
  'src/ui/menu-preview-camera.ts',
  'src/pass65-frame-pacing-gate.ts',
  'src/gameplay-replay.ts',
  'src/animation/kimodo-operator-retarget.ts',
  'src/gameplay-contract.ts',
  'src/rigged-hand-evidence.ts',
  'src/pass65-hardware-webgl2-admission-gate.ts',
  'src/combat/weapon-role-distance.ts',
  'src/pass65-settings-inventory.ts',
  'src/network-chaos.ts',
  'src/pass66-pass63-multiplayer-comparator-contract.ts',
]);

// Entry points come from index.html, because that is what the browser actually
// starts from. Guessing at filenames instead once reported src/bootstrap.ts -
// the real entry - as dead code.
function htmlEntryPoints(root = process.cwd()) {
  const found = [];
  const full = resolve(root, 'index.html');
  if (!existsSync(full)) return found;
  const html = readFileSync(full, 'utf8');
  for (const match of html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)) {
    const candidate = resolve(root, match[1].replace(/^\//, ''));
    if (existsSync(candidate)) found.push(candidate);
  }
  return found;
}

function walk(directory) {
  const out = [];
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx'), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function reachableFrom(roots, importsOf) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.pop();
    if (!file || seen.has(file)) continue;
    seen.add(file);
    for (const target of importsOf.get(file) ?? []) queue.push(target);
  }
  return seen;
}

export function auditUnreachableModules(root = process.cwd()) {
  const srcDir = resolve(root, 'src');
  const allFiles = walk(srcDir);
  const isTest = (file) => /\.(test|spec)\.tsx?$/.test(file);

  const importsOf = new Map();
  for (const file of allFiles) {
    const source = readFileSync(file, 'utf8');
    const targets = new Set();
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = resolveSpecifier(file, match[1]);
      if (resolved) targets.add(resolved);
    }
    for (const match of source.matchAll(DYNAMIC_RE)) {
      const resolved = resolveSpecifier(file, match[1]);
      if (resolved) targets.add(resolved);
    }
    importsOf.set(file, targets);
  }

  const entries = htmlEntryPoints(root);
  const productionReachable = reachableFrom(entries, importsOf);
  const testFiles = allFiles.filter(isTest);
  const testReachable = reachableFrom(testFiles, importsOf);

  const rows = [];
  for (const file of allFiles) {
    if (isTest(file)) continue;
    if (productionReachable.has(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n').length;
    rows.push({
      file: relative(root, file).replace(/\\/g, '/'),
      lines,
      reachedByTestsOnly: testReachable.has(file),
    });
  }

  rows.sort((a, b) => b.lines - a.lines);

  const dead = rows.filter((row) => !row.reachedByTestsOnly);
  const testOnly = rows.filter((row) => row.reachedByTestsOnly);
  const summary = {
    entryPoints: entries.map((file) => relative(root, file).replace(/\\/g, '/')),
    totalModules: allFiles.filter((file) => !isTest(file)).length,
    unreachableFromProduction: rows.length,
    deadLines: rows.reduce((total, row) => total + row.lines, 0),
  };

  const unallowlistedTestOnly = testOnly.filter((row) => !ALLOWLISTED_TEST_ONLY_MODULES.has(row.file));
  const pass = dead.length === 0 && unallowlistedTestOnly.length === 0;

  return {
    summary,
    dead,
    testOnly,
    unallowlistedTestOnly,
    pass,
  };
}

function runCli() {
  const jsonOut = process.argv.includes('--json');
  const audit = auditUnreachableModules();

  if (jsonOut) {
    console.log(JSON.stringify({ summary: audit.summary, dead: audit.dead, testOnly: audit.testOnly }, null, 2));
  } else {
    console.log(`entry points: ${audit.summary.entryPoints.join(', ') || '(none found)'}`);
    console.log(`${audit.summary.unreachableFromProduction} of ${audit.summary.totalModules} modules unreachable, ${audit.summary.deadLines} lines\n`);
    if (audit.dead.length) {
      console.log('UNREACHABLE (not even from tests):');
      for (const row of audit.dead) console.log(`  ${String(row.lines).padStart(6)}  ${row.file}`);
    }
    if (audit.testOnly.length) {
      console.log('\nREACHABLE ONLY FROM TESTS:');
      for (const row of audit.testOnly) console.log(`  ${String(row.lines).padStart(6)}  ${row.file}`);
    }
  }

  if (!audit.pass) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && (resolve(process.argv[1]) === fileURLToPath(import.meta.url) || resolve(process.argv[1]).endsWith('find-unreachable-modules.mjs'))) {
  runCli();
}
