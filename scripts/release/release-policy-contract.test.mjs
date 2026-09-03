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

/** Every `channels/<id>` string anywhere in release-channels.json. */
export function configuredChannelPaths(channelConfig) {
  const found = new Set();
  const visit = (value) => {
    if (typeof value === 'string') {
      if (/^channels\/[a-z0-9.-]+$/u.test(value)) found.add(value);
      return;
    }
    if (value && typeof value === 'object') for (const entry of Object.values(value)) visit(entry);
  };
  visit(channelConfig);
  return found;
}

/**
 * A channel path spelled as a literal is a defect when it is EITHER unknown to the config
 * (a retired tree the script still believes in) OR the live channel path (which moves every
 * pass and must always be read from `experimental.path`).
 */
export function hardcodedChannelPaths(source, channelConfig, { requireQuotes = true } = {}) {
  const allowed = configuredChannelPaths(channelConfig);
  const live = channelConfig.experimental.path;
  // In JS/TS sources only QUOTED occurrences count: a `channels/<id>` in prose or inside a
  // validation regex such as /^channels\/[a-z0-9-]+$/ is a description, not a destination.
  // YAML has no regex literals, so every occurrence there is read.
  const pattern = requireQuotes ? /['"`](channels\/[a-z0-9.-]+)['"`]/gu : /(channels\/[a-z0-9.-]+)/gu;
  const literals = new Set([...source.matchAll(pattern)].map((match) => match[1]));
  return [...literals]
    .filter((literal) => literal === live || !allowed.has(literal))
    .sort();
}

// ---------------------------------------------------------------------------------- red

test('the hardcoded-channel-path detector fails on the exact defect it was written for', () => {
  const synthetic = { experimental: { pass: 'PASS 86', path: 'channels/pass86' },
    previous: { pass: 'PASS 72', pagesPath: 'channels/the-big-one', path: 'channels/pass72-retained' } };

  // The retired live channel, still believed in: flagged because the config no longer
  // stages it as anything but a historical pagesPath... which it IS here, so it is allowed.
  assert.deepEqual(hardcodedChannelPaths("stagePinned('previous', 'channels/the-big-one')", synthetic), []);
  // A tree the config knows nothing about at all.
  assert.deepEqual(hardcodedChannelPaths("expect(path).toBe('channels/pass63-rollback')", synthetic),
    ['channels/pass63-rollback']);
  // The live channel path, spelled out - the failure that broke verify:release-topology.
  assert.deepEqual(hardcodedChannelPaths("if (publicConfig.experimental.path !== 'channels/pass86')", synthetic),
    ['channels/pass86']);
  // And a derived read is clean, as is a validation regex that merely describes the shape.
  assert.deepEqual(hardcodedChannelPaths('publicConfig.experimental.path !== config.experimental.path', synthetic), []);
  assert.deepEqual(hardcodedChannelPaths(String.raw`/^channels\/[a-z0-9-]+$/u.test(path)`, synthetic), []);
  // In YAML there are no regex literals, so an unquoted path is still a hardcoded path.
  assert.deepEqual(hardcodedChannelPaths('  run: cp -r dist channels/pass63-rollback\n', synthetic,
    { requireQuotes: false }), ['channels/pass63-rollback']);
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
]);

test('no release or topology script hardcodes a channel path', () => {
  for (const relative of OWNED_RELEASE_SOURCES) {
    assert.deepEqual(hardcodedChannelPaths(read(relative), config, { requireQuotes: !relative.endsWith('.yml') }), [],
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
