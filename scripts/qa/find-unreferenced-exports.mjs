#!/usr/bin/env node
// Unreferenced-exports sweep over src/ (report only): reports exported
// symbols whose module is reachable but whose name no other file
// references. Complements find-unreachable-modules.mjs, which reports
// modules no importer can reach.
//
// Usage: node scripts/qa/find-unreferenced-exports.mjs [--json <path>]
//
// Flags (from process.argv):
//   --json <path>  Also write the findings as JSON to <path> (default:
//                  not set, no JSON file is written; parent directories
//                  are created as needed).
// Environment variables: none are read.
//
// Writes:
//   - The Markdown report to stdout (always).
//   - The JSON findings file at <path> (only when --json is given).
//
// Exit code: always 0 (process.exitCode = 0). This tool reports, it does
// not gate; findings are not failures, the reviewer decides removals.
//
// Definitions are collected from src/**/*.ts (skipping *.test.ts and
// *.d.ts) for `export function|const|class|type|interface|enum <Name>`
// and `export { A, B }` declarations. Each exported name is then searched
// as a whole identifier (\bName\b) across the search corpus - every
// src/**/*.ts file plus scripts/**/*.{ts,mjs} - outside the defining
// file. Names with zero hits are reported.

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A maximal run of identifier characters is exactly a \bName\b match.
const IDENT_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g;

// `export (declare) (async) (abstract) function|const|class|type|interface|enum Name`
const EXPORT_DECL_RE =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:abstract\s+)?(function|const|class|type|interface|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/gm;

// `export { A, B as C }` - a trailing `from '...'` makes the line a
// re-export (checked separately against the rest of the line).
const EXPORT_LIST_RE = /^export\s+(?:type\s+)?\{([^}]*)\}\s*/gm;
const EXPORT_LIST_ENTRY_RE = /^(?:type\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:as\s+([A-Za-z_$][A-Za-z0-9_$]*))?\s*$/;

function walkFiles(directory, predicate, out = []) {
  let entries = [];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walkFiles(full, predicate, out);
    } else if (entry.isFile() && predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function extractDefinitions(content) {
  const definitions = [];
  for (const match of content.matchAll(EXPORT_DECL_RE)) {
    definitions.push({ name: match[2], kind: match[1] });
  }
  for (const match of content.matchAll(EXPORT_LIST_RE)) {
    const lineEnd = content.indexOf('\n', match.index);
    const after = content.slice(
      match.index + match[0].length,
      lineEnd === -1 ? content.length : lineEnd,
    );
    if (/^from\s*['"]/.test(after)) continue; // re-export: defined elsewhere
    for (const entry of match[1].split(',')) {
      const parsed = EXPORT_LIST_ENTRY_RE.exec(entry.trim());
      if (!parsed) continue;
      const exportedName = parsed[2] ?? parsed[1];
      if (exportedName === 'default') continue; // default export is not importable by name
      definitions.push({ name: exportedName, kind: 'export-list' });
    }
  }
  return definitions;
}

export function auditUnreferencedExports(root = ROOT) {
  const searchFiles = [
    ...walkFiles(join(root, 'src'), (p) => p.endsWith('.ts')),
    ...walkFiles(join(root, 'scripts'), (p) => p.endsWith('.ts') || p.endsWith('.mjs')),
  ].sort();

  // Inverted index: identifier -> set of file indices containing it.
  const inverted = new Map();
  const contents = searchFiles.map((file, index) => {
    const text = readFileSync(file, 'utf8');
    const seenHere = new Set();
    for (const match of text.matchAll(IDENT_RE)) {
      const id = match[0];
      if (seenHere.has(id)) continue;
      seenHere.add(id);
      let files = inverted.get(id);
      if (!files) {
        files = new Set();
        inverted.set(id, files);
      }
      files.add(index);
    }
    return text;
  });

  const items = [];
  let definitionFileCount = 0;
  let exportSymbolCount = 0;
  const srcPrefix = join(root, 'src') + sep;
  searchFiles.forEach((file, index) => {
    const relFile = relative(root, file).split(sep).join('/');
    const isDefinitionFile =
      file.startsWith(srcPrefix) && !file.endsWith('.test.ts') && !file.endsWith('.d.ts');
    if (!isDefinitionFile) return;
    definitionFileCount += 1;
    for (const definition of extractDefinitions(contents[index])) {
      exportSymbolCount += 1;
      const referrers = inverted.get(definition.name);
      const referenced = referrers !== undefined &&
        [...referrers].some((i) => i !== index);
      if (!referenced) {
        items.push({ file: relFile, name: definition.name, kind: definition.kind, _index: index });
      }
    }
  });

  items.sort((a, b) => (a.file === b.file ? a.name.localeCompare(b.name) : a.file < b.file ? -1 : 1));
  for (const item of items) delete item._index;
  return {
    root,
    definitionFileCount,
    exportSymbolCount,
    searchFileCount: searchFiles.length,
    items,
  };
}

function renderReport(result) {
  const lines = [
    '# Unreferenced exports (report only)',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Root: ${result.root}`,
    `Definition corpus: ${result.definitionFileCount} files (src/**/*.ts, skipping *.test.ts and *.d.ts)`,
    `Search corpus: ${result.searchFileCount} files (src/**/*.ts + scripts/**/*.{ts,mjs})`,
    '',
    '# Method',
    'For each exported symbol collected from `export (function|const|class|type|interface|enum) <Name>`',
    'and `export { A, B }` declarations in the definition corpus, the whole identifier `<Name>` was',
    'searched in every search-corpus file outside the defining file; names with zero hits are listed below.',
    '',
    'Known false positives (the name IS used, but the reference is invisible to this sweep):',
    '- names consumed only via dynamic `import()` (specifiers resolved at runtime)',
    '- names pulled through `index.ts` barrel re-exports and consumed elsewhere',
    '- names referenced from HTML or inline `<script>` blocks',
    '- names looked up via strings (registry maps, event names, component strings)',
    '',
    '| file | name | kind |',
    '| --- | --- | --- |',
    ...result.items.map((i) => `| ${i.file} | ${i.name} | ${i.kind} |`),
    '',
    `Total: ${result.items.length} unreferenced export symbol(s)`,
  ];
  return lines.join('\n');
}

export function runCli(argv = process.argv.slice(2)) {
  let jsonPath = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') {
      jsonPath = argv[i + 1];
      i += 1;
    } else {
      throw new Error(`Unexpected argument: ${argv[i]}`);
    }
  }
  const result = auditUnreferencedExports();
  if (jsonPath) {
    const absolute = resolve(jsonPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  }
  console.log(renderReport(result));
  process.exitCode = 0;
}

if (
  process.argv[1] &&
  (resolve(process.argv[1]) === fileURLToPath(import.meta.url) ||
    resolve(process.argv[1]).endsWith('find-unreferenced-exports.mjs'))
) {
  runCli();
}
