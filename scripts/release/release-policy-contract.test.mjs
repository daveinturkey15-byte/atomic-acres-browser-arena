// Lane AD (PASS 87) release-policy contract.
//
// Two properties, both of which the repository violated at integration head d329628d:
//
//  1. HF-400 two-channel policy: gh-pages carries exactly the live pass and the immediately
//     preceding pass as the single pinned safe backup, and the release machinery agrees
//     with the publish script that implements it.
//  2. No release/topology script spells a channel path as a literal. The pre-PASS-80 live
//     channel `channels/the-big-one` was hardcoded in three places in
//     scripts/qa/verify-release-topology.mjs and three more in
//     scripts/qa/verify-release-topology-browser.mjs. It has not been the live channel
//     since the pass80 cut, so `npm run verify:release-topology` threw
//     `Root chooser is missing live PASS 86` on a correctly staged tree and the production
//     workflow could never reach its own publish step.
//
// Both detectors are self-tested RED on fixtures before they are pointed at the repository:
// a gate nobody has watched fail is a gate nobody has checked.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { evaluateTwoChannelPolicy, passNumberOfChannel } from './verify-two-channel-policy.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const read = (relative) => readFileSync(join(repositoryRoot, relative), 'utf8');
const config = JSON.parse(read('release-channels.json'));

const BACKUP_KEY = /^pass\d+Backup$/u;
const CHANNEL_PATH = /channels\/[a-z0-9.-]+/gu;

/**
 * The channel paths an owned release source is allowed to spell out, built by SUBTRACTION
 * rather than by union - which is the whole point of this detector.
 *
 * REPAIR (skeptic, PASS 87): the first version of this function allowed every `channels/<id>`
 * string anywhere in release-channels.json. That let through exactly the defect class the lane
 * exists for, because the config also records where channels USED to live:
 *   - `channels/the-big-one` appears three times as a historical `pagesPath`, so the retired
 *     live path this lane removed from two verifiers could have been written straight back in;
 *   - after every cut the outgoing live path is parked in `pass<N>Backup.path`, so a
 *     one-pass-stale live literal - the precise failure that made `verify:release-topology`
 *     throw `Root chooser is missing live PASS 86` - was allowed the moment the stamp moved.
 * Measured before this repair: hardcodedChannelPaths("... !== 'channels/pass86'", a config
 * whose live path is channels/pass87 and whose pass86Backup.path is channels/pass86) -> [],
 * and hardcodedChannelPaths("const live='channels/the-big-one'", today's config) -> [].
 * Both are asserted below and both now return the literal.
 *
 * So: allowed = the `path` of every channel that is NEITHER the experimental (live) channel
 * NOR a `pass<N>Backup` - i.e. the frozen retained trees whose path cannot move. A path that
 * only ever appears as a historical `pagesPath` is not stageable and is therefore not allowed.
 */
export function stageableChannelPaths(channelConfig) {
  const stageable = new Set();
  for (const [key, value] of Object.entries(channelConfig)) {
    if (key === 'experimental' || BACKUP_KEY.test(key)) continue;
    if (value && typeof value === 'object' && typeof value.path === 'string'
      && /^channels\/[a-z0-9.-]+$/u.test(value.path)) stageable.add(value.path);
  }
  return stageable;
}

/**
 * The string literals of a JS/TS source, each with the code that immediately precedes it.
 * Comments and regex literals are skipped, so a `channels/<id>` written in prose or inside a
 * shape-validating regex such as /^channels\/[a-z0-9-]+$/ is not read as a destination -
 * unlike the previous quote-matching regex, which counted a backticked path in a comment.
 * Template substitutions are skipped by brace counting; a backtick inside `${...}` would
 * confuse this, and none of the owned sources has one.
 */
export function stringLiterals(source) {
  const literals = [];
  let index = 0;
  let code = '';
  const regexMayStart = () => {
    const previous = code.replace(/\s+$/u, '').at(-1);
    return previous === undefined || '=(,:[!&|?{};+*%<>~^'.includes(previous);
  };
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      index = end === -1 ? source.length : end + 2;
      code += ' ';
      continue;
    }
    if (char === '/' && regexMayStart()) {
      index += 1;
      let inClass = false;
      while (index < source.length) {
        const inner = source[index];
        if (inner === '\\') { index += 2; continue; }
        if (inner === '\n') break;
        if (inner === '[') inClass = true;
        else if (inner === ']') inClass = false;
        else if (inner === '/' && !inClass) { index += 1; break; }
        index += 1;
      }
      code += ' ';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      index += 1;
      let value = '';
      while (index < source.length) {
        const inner = source[index];
        if (inner === '\\') { value += source.slice(index, index + 2); index += 2; continue; }
        if (inner === quote) { index += 1; break; }
        if (inner === '\n' && quote !== '`') break;
        if (quote === '`' && inner === '$' && source[index + 1] === '{') {
          let depth = 1;
          index += 2;
          while (index < source.length && depth > 0) {
            if (source[index] === '{') depth += 1;
            else if (source[index] === '}') depth -= 1;
            index += 1;
          }
          value += '${}';
          continue;
        }
        value += inner;
        index += 1;
      }
      literals.push({ value, precedingCode: code.slice(-80) });
      code += ' ';
      continue;
    }
    code += char;
    index += 1;
  }
  return literals;
}

/**
 * A channel path spelled as a literal is a defect unless it is a frozen retained tree
 * (`stageableChannelPaths`). The live path, any pinned-backup path, any retired Pages
 * location and any tree unknown to the config are all defects.
 *
 * ONE exemption, and it is contextual rather than value-based: a literal compared directly
 * against a recorded `.pagesPath` field pins an immutable historical fact (where a frozen
 * channel was once served on Pages) and can never be used as a route. `.path !== '...'`
 * with the same value is still flagged - asserted in the red test below.
 */
export function hardcodedChannelPaths(source, channelConfig, { language = 'js' } = {}) {
  const allowed = stageableChannelPaths(channelConfig);
  const found = new Set();
  if (language === 'yaml') {
    // YAML has neither regex nor string-literal syntax to reason about, so every occurrence
    // outside a `#` comment is read as a destination.
    const withoutComments = source.split('\n').map((line) => line.replace(/(^|\s)#.*$/u, '$1')).join('\n');
    for (const match of withoutComments.matchAll(CHANNEL_PATH)) found.add(match[0]);
  } else {
    for (const { value, precedingCode } of stringLiterals(source)) {
      if (/\.pagesPath\s*[!=]==?\s*$/u.test(precedingCode)) continue;
      for (const match of value.matchAll(CHANNEL_PATH)) found.add(match[0]);
    }
  }
  return [...found].filter((literal) => !allowed.has(literal)).sort();
}

// ---------------------------------------------------------------------------------- red

test('the hardcoded-channel-path detector fails on the exact defect it was written for', () => {
  const synthetic = { experimental: { pass: 'PASS 86', path: 'channels/pass86' },
    previous: { pass: 'PASS 72', pagesPath: 'channels/the-big-one', path: 'channels/pass72-retained' } };

  // The retired live channel, still believed in. It survives in the config only as a
  // historical pagesPath, so it is NOT stageable and spelling it is a defect.
  assert.deepEqual(hardcodedChannelPaths("stagePinned('previous', 'channels/the-big-one')", synthetic),
    ['channels/the-big-one']);
  // ... including against today's real config, where it appears three times as a pagesPath.
  // This probe returned [] before the repair.
  assert.deepEqual(hardcodedChannelPaths("const live = 'channels/the-big-one';", config),
    ['channels/the-big-one']);
  // A tree the config knows nothing about at all.
  assert.deepEqual(hardcodedChannelPaths("expect(path).toBe('channels/pass63-rollback')", synthetic),
    ['channels/pass63-rollback']);
  // The live channel path, spelled out - the failure that broke verify:release-topology.
  assert.deepEqual(hardcodedChannelPaths("if (publicConfig.experimental.path !== 'channels/pass86')", synthetic),
    ['channels/pass86']);
  // And the same literal ONE PASS LATER, when the stamp has moved and the outgoing live path
  // is parked in pass86Backup. This probe also returned [] before the repair: a stale live
  // literal became invisible on the very day it went stale.
  assert.deepEqual(hardcodedChannelPaths("if (publicConfig.experimental.path !== 'channels/pass86')", {
    experimental: { pass: 'PASS 87', path: 'channels/pass87' },
    pass86Backup: { pass: 'PASS 86', path: 'channels/pass86' },
    previous: { pass: 'PASS 72', path: 'channels/pass72-retained' },
  }), ['channels/pass86']);
  // A path inside a longer literal - a fetch route, say - is still a spelled destination.
  assert.deepEqual(hardcodedChannelPaths("await fetch('/channels/pass86/channel-provenance.json')", synthetic),
    ['channels/pass86']);
  // A frozen retained tree, whose path cannot move, stays legal.
  assert.deepEqual(hardcodedChannelPaths("config.previous.path !== 'channels/pass72-retained'", synthetic), []);
  // A derived read is clean, as is a validation regex or a comment that describes the shape.
  assert.deepEqual(hardcodedChannelPaths('publicConfig.experimental.path !== config.experimental.path', synthetic), []);
  assert.deepEqual(hardcodedChannelPaths(String.raw`/^channels\/[a-z0-9-]+$/u.test(path)`, synthetic), []);
  assert.deepEqual(hardcodedChannelPaths('// this used to spell `channels/the-big-one` here\n', synthetic), []);
  // The one contextual exemption: pinning a recorded historical Pages location. The same
  // value compared against `.path` - which IS a route - is still flagged.
  assert.deepEqual(hardcodedChannelPaths("config.previous.pagesPath !== 'channels/the-big-one'", synthetic), []);
  assert.deepEqual(hardcodedChannelPaths("config.previous.path !== 'channels/the-big-one'", synthetic),
    ['channels/the-big-one']);
  // In YAML there are no regex or string literals, so a bare path is still a hardcoded path.
  assert.deepEqual(hardcodedChannelPaths('  run: cp -r dist channels/pass63-rollback\n', synthetic,
    { language: 'yaml' }), ['channels/pass63-rollback']);
  assert.deepEqual(hardcodedChannelPaths('  # channels/pass63-rollback was staged here\n', synthetic,
    { language: 'yaml' }), []);
});

test('the two-channel policy detector fails on every way HF-400 can be broken', () => {
  const ok = {
    config: {
      experimental: { pass: 'PASS 86', path: 'channels/pass86' },
      pass85Backup: { pass: 'PASS 85', path: 'channels/pass85' },
    },
    publishSource: 'LIVE_TREE = "pass86"\nBACKUP_TREE = "pass85"\n'
      + 'KEEP_AT_LEAST = {"pass85"}\nEXPECTED_POST_STATE = {LIVE_TREE, BACKUP_TREE}\n',
    publishScriptName: 'scripts/orchestration/publish_pass86.py',
    livePagesChannels: ['pass85', 'pass86'],
  };
  assert.equal(evaluateTwoChannelPolicy(ok).ok, true);
  assert.equal(evaluateTwoChannelPolicy(ok).backup, 'pass85');

  const failing = (mutate, expected) => {
    const input = structuredClone(ok);
    mutate(input);
    const result = evaluateTwoChannelPolicy(input);
    assert.equal(result.ok, false, `expected a violation for: ${expected}`);
    assert.ok(result.errors.some((error) => error.includes(expected)),
      `expected an error mentioning ${JSON.stringify(expected)}, got ${JSON.stringify(result.errors)}`);
  };

  // The Lane F finding itself: gh-pages carrying the retired six-tree topology.
  failing((input) => { input.livePagesChannels = ['pass63-rollback', 'pass69-retained', 'pass86', 'the-big-one']; },
    'retired tree(s)');
  failing((input) => { input.livePagesChannels = ['pass84', 'pass85', 'pass86']; }, 'at most two');
  failing((input) => { input.livePagesChannels = ['pass86']; }, 'pinned safe backup pass85 is not on gh-pages');
  // A backup that is not the immediate predecessor is not "this version" pinned.
  failing((input) => {
    delete input.config.pass85Backup;
    input.config.pass83Backup = { pass: 'PASS 83', path: 'channels/pass83' };
    input.livePagesChannels = ['pass83', 'pass86'];
  }, 'immediate predecessor PASS 85');
  // Two backups is the old many-channel world creeping back.
  failing((input) => { input.config.pass84Backup = { pass: 'PASS 84', path: 'channels/pass84' }; },
    'exactly one pass<N>Backup key');
  failing((input) => { input.publishSource = null; }, 'does not exist');
  failing((input) => { input.publishSource = input.publishSource.replace('BACKUP_TREE = "pass85"', 'BACKUP_TREE = "pass72"'); },
    'BACKUP_TREE = "pass85"');
  failing((input) => {
    input.publishSource = input.publishSource.replace('EXPECTED_POST_STATE = {LIVE_TREE, BACKUP_TREE}', 'EXPECTED_POST_STATE = set()');
  }, 'EXPECTED_POST_STATE = {LIVE_TREE, BACKUP_TREE}');
  failing((input) => { input.config.experimental.path = 'channels/the-big-one'; }, 'channels/pass<N> tree');
  failing((input) => { input.config.experimental.pass = 'PASS 73'; }, 'does not name channels/pass86');

  assert.equal(passNumberOfChannel('channels/pass86'), 86);
  assert.equal(passNumberOfChannel('channels/the-big-one'), null);
});

// -------------------------------------------------------------------------------- green

const OWNED_RELEASE_SOURCES = Object.freeze([
  'scripts/release/stage-release-topology.mjs',
  'scripts/qa/verify-release-topology.mjs',
  'scripts/qa/verify-release-topology-browser.mjs',
  '.github/workflows/release-production.yml',
  // The spec that expected `/channels/the-big-one/` at integration head, and which this lane
  // rewrote to derive every route from the config. It is the same defect class, so it is
  // held to the same contract.
  'tests/e2e/release-channel-chooser.spec.ts',
]);

test('no release or topology script hardcodes a channel path', () => {
  for (const relative of OWNED_RELEASE_SOURCES) {
    assert.deepEqual(hardcodedChannelPaths(read(relative), config,
      { language: relative.endsWith('.yml') ? 'yaml' : 'js' }), [],
      `${relative} spells a channel path that release-channels.json does not stage, `
      + 'or spells the live channel path instead of reading experimental.path');
  }
});

test('the live release channel is never spelled out in an owned release source', () => {
  for (const relative of OWNED_RELEASE_SOURCES) {
    assert.ok(!read(relative).includes(config.experimental.path),
      `${relative} contains the literal live channel path ${config.experimental.path}`);
  }
});

test('the repository itself satisfies the HF-400 two-channel policy', () => {
  const liveNumber = passNumberOfChannel(config.experimental.path);
  const publishScriptName = `scripts/orchestration/publish_pass${liveNumber}.py`;
  const result = evaluateTwoChannelPolicy({
    config,
    publishSource: read(publishScriptName),
    publishScriptName,
    // The live half is exercised by the CLI in CI, where origin/gh-pages is fetched. Here
    // the check is config-vs-publish-script, which needs no network.
    livePagesChannels: null,
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.live, `pass${liveNumber}`);
  assert.equal(result.backup, `pass${liveNumber - 1}`);
});

test('the production workflow cannot publish, and says where publishing lives', () => {
  const workflow = read('.github/workflows/release-production.yml');
  // Every pass since 74 shipped through scripts/orchestration/publish_pass<N>.py. A second
  // publisher that disagrees with the live policy is not a fallback, it is a loaded gun:
  // `gh-pages -d dist` REPLACES the branch, so one dispatch of the old workflow would have
  // deleted the pinned safe backup and resurrected six retired trees.
  for (const forbidden of ['deploy:ci', 'gh-pages -d', 'git remote set-url', 'x-access-token',
    'pages/builds/latest', 'contents: write']) {
    assert.ok(!workflow.includes(forbidden), `release-production.yml must not contain ${forbidden}`);
  }
  assert.ok(workflow.includes('node scripts/release/verify-two-channel-policy.mjs'),
    'the workflow must run the HF-400 policy guard');
  assert.match(workflow, /scripts\/orchestration\/publish_pass<N>\.py/u);
});
