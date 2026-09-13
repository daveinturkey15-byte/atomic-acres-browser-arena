#!/usr/bin/env node
/**
 * frame_loop_audit.mjs — source 9's method as a usable artefact.
 *
 * An independently written static scanner for the HIGH-severity frame-loop and
 * disposal findings restated from `millionco/react-doctor@e183c351`
 * `skills/improve-threejs/SKILL.md` (Modified MIT; read, not installed, and not
 * executed). React Doctor itself is not invoked and no third-party code runs.
 *
 * The principle it encodes is the one the source leads with: severity follows
 * the render loop. A finding inside a `useFrame`/`requestAnimationFrame` body or
 * inside a function named `update`/`tick`/`animate` is HIGH; the same pattern
 * elsewhere is at most MEDIUM.
 *
 *   node scripts/technique-lab/group-a/frame_loop_audit.mjs <file-or-dir>...
 *   node scripts/technique-lab/group-a/frame_loop_audit.mjs --json src/map3
 *
 * Exit code is 0 when there are no HIGH findings and 1 when there are, so it can
 * be wired into a gate later. It is not wired into one now, and adding it would
 * be a separate reviewed decision.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const HOT_ENTRY = /\b(useFrame|requestAnimationFrame|setAnimationLoop)\b|\b(?:function\s+)?(update|tick|animate|onBeforeRender)\s*\(/;

/** Each rule: id, regex, severity when cold, and a one-line fix. */
const RULES = [
  {
    id: 'alloc-in-loop',
    pattern: /new\s+(?:THREE\.)?(Vector2|Vector3|Vector4|Quaternion|Euler|Matrix3|Matrix4|Color|Box3|Sphere|Ray)\s*\(/,
    cold: 'low',
    fix: 'Hoist a scratch instance to module scope or a closure and mutate it in place.',
  },
  {
    id: 'geometry-or-material-in-loop',
    pattern: /new\s+(?:THREE\.)?\w*(Geometry|Material|Texture|RenderTarget)\s*\(/,
    cold: 'medium',
    fix: 'Build it once outside the loop; rebuilding per frame leaks GPU memory and stalls on upload.',
  },
  {
    id: 'setstate-in-loop',
    pattern: /\bset[A-Z]\w*\s*\(\s*(?!\s*\))/,
    cold: 'ignore',
    hotOnly: true,
    fix: 'Mutate a ref instead; setState in a frame callback re-renders the tree every frame.',
  },
  {
    id: 'array-literal-arg-in-loop',
    pattern: /\.(set|copy|lerp)\s*\(\s*\[/,
    cold: 'low',
    fix: 'Pass numbers or a hoisted vector; a fresh array per frame is a per-frame allocation.',
  },
];

const DISPOSABLE = /new\s+(?:THREE\.)?(\w*(?:Geometry|Material|Texture|RenderTarget))\s*\(/g;

function listFiles(target) {
  const out = [];
  const walk = (path) => {
    const info = statSync(path);
    if (info.isDirectory()) {
      if (/node_modules|\.git|dist|artifacts/.test(path)) return;
      for (const entry of readdirSync(path)) walk(join(path, entry));
      return;
    }
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(extname(path))) out.push(path);
  };
  walk(target);
  return out;
}

/**
 * Brace-depth tracking is enough to know whether a line sits inside a hot entry
 * point, and unlike a parser it has no dependency. It is deliberately
 * conservative: an unmatched brace ends the hot region rather than extending it.
 */
function scanFile(path) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split(/\r?\n/);
  const findings = [];

  let hotDepth = -1;
  let depth = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const code = line.replace(/\/\/.*$/, '');
    const entering = hotDepth < 0 && HOT_ENTRY.test(code);
    if (entering) hotDepth = depth;

    const hot = hotDepth >= 0;
    for (const rule of RULES) {
      if (rule.hotOnly && !hot) continue;
      if (!rule.pattern.test(code)) continue;
      const severity = hot ? 'high' : rule.cold;
      if (severity === 'ignore') continue;
      findings.push({ file: path, line: i + 1, rule: rule.id, severity, hot, fix: rule.fix, text: line.trim().slice(0, 140) });
    }

    for (const ch of code) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
    }
    if (hot && depth <= hotDepth && !entering) hotDepth = -1;
  }

  // Disposal balance: every constructed disposable against every dispose() call.
  const created = [...text.matchAll(DISPOSABLE)].length;
  const disposed = [...text.matchAll(/\.dispose\s*\(\s*\)/g)].length;
  const registered = [...text.matchAll(/\b(?:registry\.)?track(?:All)?\s*\(/g)].length;
  if (created > 0 && disposed + registered === 0) {
    findings.push({
      file: path,
      line: 0,
      rule: 'no-disposal-path',
      severity: 'high',
      hot: false,
      fix: 'Call dispose() in teardown, or register the resource with a disposal registry.',
      text: `${created} disposable resources constructed, no dispose() or registry call in this file`,
    });
  }
  return { findings, created, disposed, registered };
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const targets = args.filter((a) => !a.startsWith('--'));
  if (targets.length === 0) {
    console.error('usage: frame_loop_audit.mjs [--json] <file-or-dir>...');
    process.exit(2);
  }

  const all = [];
  let files = 0;
  for (const target of targets) {
    for (const file of listFiles(target)) {
      files += 1;
      all.push(...scanFile(file).findings);
    }
  }

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const finding of all) bySeverity[finding.severity] += 1;

  if (asJson) {
    console.log(JSON.stringify({ files, bySeverity, findings: all }, null, 2));
  } else {
    for (const finding of all.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1))) {
      const where = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      console.log(`${finding.severity.toUpperCase().padEnd(6)} ${finding.rule.padEnd(28)} ${where}`);
      console.log(`       ${finding.text}`);
      console.log(`       fix: ${finding.fix}`);
    }
    console.log(`\n${files} files scanned — high=${bySeverity.high} medium=${bySeverity.medium} low=${bySeverity.low}`);
  }
  process.exit(bySeverity.high > 0 ? 1 : 0);
}

main();
