// HF-406 — does the BUILD call itself the pass the SOURCE stamped?
//
// The unit test `src/ui/release-identity-surfaces.test.ts` proves the source renders one
// consistent identity. This script proves the shipped bytes do, because that is where the
// class keeps recurring: the PASS 82 publish shipped with the PASS 81 stamp still in the
// bundle, and on 2026-09-02 the live PASS 83 channel served
// `HITL CANDIDATE · NOT LIVE` out of `channels/pass83/assets/changelog-CgKeduvY.js`
// while `index.html` looked perfectly fine.
//
// Checks (all read the expected pass out of src/release-identity.ts — no argument to get
// wrong, and no way for the checker to agree with a stale build by accident):
//
//   1. the identity chunk exists, names the stamped pass, and names no OTHER pass except
//      the documented PASS 64 failed-regression record that lives in the same module;
//   2. no shipped asset contains the internal review acronym in player-facing text
//      (one documented exception: the hidden Farcrysis arena's own dev overlay label);
//   3. the changelog chunk carries the current pass's own entry title (`Pass <n> · …`),
//      so a build cannot ship with last pass's release notes behind the badge.
//
// Optional `--shell <file>` applies checks 2 and 3's spirit to a generated release shell
// or chooser document: it must mention no pass outside `--allow-pass`.
//
// Usage:
//   node scripts/qa/verify-built-release-identity.mjs                       # dist/
//   node scripts/qa/verify-built-release-identity.mjs --dist dist-pass84
//   node scripts/qa/verify-built-release-identity.mjs --shell .gh-pages-publish/index.html \
//        --allow-pass "PASS 84,PASS 83"
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const at = args.indexOf(name);
  return at === -1 ? fallback : args[at + 1] ?? fallback;
};
const distDir = resolve(flag('--dist', 'dist'));
const shellFile = flag('--shell', null);
const allowedShellPasses = new Set((flag('--allow-pass', '') ?? '').split(',').map((s) => s.trim()).filter(Boolean));

/** The one source of the expected pass: the stamp itself. */
const identitySource = readFileSync(resolve('src/release-identity.ts'), 'utf8');
const stamped = /PASS66_RELEASE_IDENTITY = Object\.freeze\(\{[\s\S]*?pass:\s*'([^']+)'/u.exec(identitySource)?.[1];
if (!stamped) {
  console.error('FAIL: could not read the stamped pass out of src/release-identity.ts');
  process.exit(1);
}
const stampedNumber = stamped.replace(/[^0-9]+/gu, '');

/**
 * `release-identity.ts` deliberately also carries the PASS 64 failed-regression record
 * (published evidence, pinned by src/pass65-release-foundation-evidence.test.ts). It is
 * the only other pass allowed in that chunk.
 */
const IDENTITY_CHUNK_ALLOWED = new Set([stamped, 'PASS 64']);

const failures = [];
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

let files;
try {
  files = walk(distDir);
} catch {
  console.error(`FAIL: no build at ${distDir} (run npm run build first)`);
  process.exit(1);
}

// 1. the identity chunk
const identityChunks = files.filter((f) => /release-identity-[^/\\]*\.js$/u.test(f));
if (identityChunks.length !== 1) {
  failures.push(`expected exactly one release-identity chunk in ${distDir}, found ${identityChunks.length}`);
} else {
  const body = readFileSync(identityChunks[0], 'utf8');
  const seen = [...new Set(body.match(/PASS \d+/gu) ?? [])];
  if (!seen.includes(stamped)) failures.push(`${identityChunks[0]} does not contain the stamped ${stamped}`);
  for (const pass of seen) {
    if (!IDENTITY_CHUNK_ALLOWED.has(pass)) failures.push(`${identityChunks[0]} still names ${pass}; the build is stamped ${stamped}`);
  }
}

// 2. no internal review acronym in any shipped asset.
//
// Two occurrences are allowed, and only these two: the hidden Farcrysis arena's own
// developer overlay label. That arena is not selectable in a published build and the
// label is owned by the Farcrysis lane, not by release identity. Everything else -
// a badge, a chooser card, a release note - is a defect, which is how this check
// found `Local HITL candidate - not yet published.` on the in-build chooser.
// A production build reaches this check minified, which USED to be load-bearing by
// accident: `FLASHBANG_HITL_CONTRACT` and `SEMTEX_HITL_CONTRACT` in
// src/combat/pass65-ordnance-contract.ts are mangled away by esbuild, so a bare `HITL`
// scan passed only because nobody ran it on an unminified or debug build. Those are
// identifiers, not player-facing text, and failing on them would be a false alarm that
// teaches the next agent to weaken this gate. The scan therefore matches the acronym as
// a WORD - not glued to an identifier character on either side - which still catches
// every rendered form (`HITL CANDIDATE · NOT LIVE`, `AWAITING OWNER HITL`, `Local HITL
// candidate - not yet published.`), and the known player-facing phrasings are banned
// outright regardless of what surrounds them, so narrowing the acronym scan cannot
// quietly narrow the gate.
const ALLOWED_HITL_LABELS = ['[F4RCry515 HITL]', '[farcrysis-hitl]'];
const PLAYER_FACING_HITL_PHRASES = [
  'HITL CANDIDATE',
  'AWAITING OWNER HITL',
  'HITL candidate',
  'OWNER HITL',
];
const HITL_WORD = /.{0,60}(?<![A-Za-z0-9_$])HITL(?![A-Za-z0-9_$]).{0,60}/u;
const textish = /\.(?:js|css|html|json|txt|svg)$/u;
for (const file of files.filter((f) => textish.test(f))) {
  const raw = readFileSync(file, 'utf8');
  let body = raw;
  for (const allowed of ALLOWED_HITL_LABELS) body = body.split(allowed).join('');
  const phrase = PLAYER_FACING_HITL_PHRASES.find((needle) => body.includes(needle));
  if (phrase) {
    failures.push(`${file} ships the player-facing review phrase "${phrase}" - it belongs to the owner checklist under docs/, not to a build`);
    continue;
  }
  const hit = HITL_WORD.exec(body);
  if (hit) failures.push(`${file} ships the acronym as player-facing text - ...${hit[0].trim()}... - it belongs to the owner checklist under docs/, not to a build`);
}

// 3. the changelog chunk carries THIS pass's entry
const changelogChunks = files.filter((f) => /changelog-[^/\\]*\.js$/u.test(f));
if (changelogChunks.length !== 1) {
  failures.push(`expected exactly one changelog chunk in ${distDir}, found ${changelogChunks.length}`);
} else {
  const body = readFileSync(changelogChunks[0], 'utf8');
  if (!body.includes(`Pass ${stampedNumber} · `)) {
    failures.push(`${changelogChunks[0]} has no "Pass ${stampedNumber} · …" entry title: the build would open its release notes on an older pass`);
  }
}

// optional: a generated release shell / chooser document
if (shellFile) {
  const body = readFileSync(resolve(shellFile), 'utf8');
  if (/HITL/u.test(body)) failures.push(`${shellFile} ships the string "HITL"`);
  for (const pass of new Set(body.match(/PASS \d+/gu) ?? [])) {
    if (allowedShellPasses.size && !allowedShellPasses.has(pass)) {
      failures.push(`${shellFile} offers ${pass}, which is not in --allow-pass (${[...allowedShellPasses].join(', ')})`);
    }
  }
}

if (failures.length) {
  console.error(`RELEASE IDENTITY: ${failures.length} problem(s) against stamp ${stamped}`);
  for (const line of failures) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(`RELEASE IDENTITY OK: ${distDir} calls itself ${stamped}, opens its notes on Pass ${stampedNumber}, ships no HITL string${shellFile ? `; ${shellFile} offers only ${[...allowedShellPasses].join(', ') || 'the passes it names'}` : ''}`);
