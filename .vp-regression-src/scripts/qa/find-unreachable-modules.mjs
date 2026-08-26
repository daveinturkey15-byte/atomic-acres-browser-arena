#!/usr/bin/env node
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

const SRC = resolve(process.cwd(), 'src');
const JSON_OUT = process.argv.includes('--json');

// Entry points come from index.html, because that is what the browser actually
// starts from. Guessing at filenames instead once reported src/bootstrap.ts -
// the real entry - as dead code.
function htmlEntryPoints() {
  const found = [];
  const full = resolve(process.cwd(), 'index.html');
  if (!existsSync(full)) return found;
  const html = readFileSync(full, 'utf8');
  for (const match of html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)) {
    const candidate = resolve(process.cwd(), match[1].replace(/^\//, ''));
    if (existsSync(candidate)) found.push(candidate);
  }
  return found;
}

function walk(directory) {
  const out = [];
  for (const name of readdirSync(directory)) {
    const full = join(directory, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const allFiles = walk(SRC);
const isTest = (file) => /\.(test|spec)\.tsx?$/.test(file);

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

function reachableFrom(roots) {
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

const entries = htmlEntryPoints();
const productionReachable = reachableFrom(entries);
const testFiles = allFiles.filter(isTest);
const testReachable = reachableFrom(testFiles);

const rows = [];
for (const file of allFiles) {
  if (isTest(file)) continue;
  if (productionReachable.has(file)) continue;
  const lines = readFileSync(file, 'utf8').split('\n').length;
  rows.push({
    file: relative(process.cwd(), file).replace(/\\/g, '/'),
    lines,
    reachedByTestsOnly: testReachable.has(file),
  });
}

rows.sort((a, b) => b.lines - a.lines);

const dead = rows.filter((row) => !row.reachedByTestsOnly);
const testOnly = rows.filter((row) => row.reachedByTestsOnly);
const summary = {
  entryPoints: entries.map((file) => relative(process.cwd(), file).replace(/\\/g, '/')),
  totalModules: allFiles.filter((file) => !isTest(file)).length,
  unreachableFromProduction: rows.length,
  deadLines: rows.reduce((total, row) => total + row.lines, 0),
};

if (JSON_OUT) {
  console.log(JSON.stringify({ summary, dead, testOnly }, null, 2));
} else {
  console.log(`entry points: ${summary.entryPoints.join(', ') || '(none found)'}`);
  console.log(`${summary.unreachableFromProduction} of ${summary.totalModules} modules unreachable, ${summary.deadLines} lines\n`);
  if (dead.length) {
    console.log('UNREACHABLE (not even from tests):');
    for (const row of dead) console.log(`  ${String(row.lines).padStart(6)}  ${row.file}`);
  }
  if (testOnly.length) {
    console.log('\nREACHABLE ONLY FROM TESTS:');
    for (const row of testOnly) console.log(`  ${String(row.lines).padStart(6)}  ${row.file}`);
  }
}
