#!/usr/bin/env node
/**
 * HF-400 two-channel release policy guard.
 *
 * Owner, 2026-09-02 06:58 BST, verbatim: "also when you push the next pass, pin this version
 * and remove all past versions, this can be the safe backup".
 *
 * So gh-pages carries EXACTLY two trees: the live pass and the immediately preceding pass,
 * pinned as the single safe backup. `scripts/orchestration/publish_pass<N>.py` implements
 * that and asserts its own post-state. This guard is the check that the rest of the release
 * machinery still AGREES with it - the failure Lane F found in PASS 84 was the opposite:
 * `.github/workflows/release-production.yml` still staged and published the pre-PASS-80
 * six-tree topology (`the-big-one`, `pass72/70/69-retained`, `recent-stable`,
 * `pass63-rollback`) with `gh-pages -d dist`, which REPLACES the branch content. Running it
 * would have deleted the pinned PASS 85 safe backup and resurrected six retired trees.
 *
 * Nothing here is hardcoded to a pass number: the live pass, the backup pass and the publish
 * script are all derived from release-channels.json.
 *
 * Usage:
 *   node scripts/release/verify-two-channel-policy.mjs [--json <path>]
 * Environment:
 *   TWO_CHANNEL_POLICY_SKIP_GIT=1   do not consult origin/gh-pages (offline / first deploy)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const CHANNEL_PREFIX = 'channels/';

/** `channels/pass86` -> 86. Returns null for a channel that is not a numbered pass tree. */
export function passNumberOfChannel(path) {
  const match = /^channels\/pass(\d+)$/u.exec(path ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * Pure policy evaluation. Everything it needs is passed in, so the contract test can drive
 * it with synthetic inputs and watch every branch go red.
 *
 * @param {object} input
 * @param {object} input.config              parsed release-channels.json
 * @param {string|null} input.publishSource  text of scripts/orchestration/publish_pass<N>.py, or null if absent
 * @param {string} input.publishScriptName   the file name that was looked for
 * @param {string[]|null} input.livePagesChannels directory names under channels/ on origin/gh-pages, or null if unavailable
 */
export function evaluateTwoChannelPolicy({ config, publishSource, publishScriptName, livePagesChannels }) {
  const errors = [];
  const livePath = config?.experimental?.path;
  const liveNumber = passNumberOfChannel(livePath);
  if (liveNumber === null) {
    errors.push(`experimental.path must be one channels/pass<N> tree, received ${JSON.stringify(livePath)}`);
    return { ok: false, errors, live: null, backup: null };
  }
  if (config.experimental.pass !== `PASS ${liveNumber}`) {
    errors.push(`experimental.pass ${JSON.stringify(config.experimental.pass)} does not name ${livePath}`);
  }

  const backupKeys = Object.keys(config).filter((key) => /^pass\d+Backup$/u.test(key));
  if (backupKeys.length !== 1) {
    errors.push(`release-channels.json must declare exactly one pass<N>Backup key, found ${backupKeys.length}`
      + `${backupKeys.length ? `: ${backupKeys.join(', ')}` : ''}`);
    return { ok: false, errors, live: `pass${liveNumber}`, backup: null };
  }
  const backupKey = backupKeys[0];
  const backup = config[backupKey];
  const backupNumber = passNumberOfChannel(backup?.path);
  if (backupNumber === null) {
    errors.push(`${backupKey}.path must be one channels/pass<N> tree, received ${JSON.stringify(backup?.path)}`);
    return { ok: false, errors, live: `pass${liveNumber}`, backup: null };
  }
  // The policy is "pin THIS version", i.e. the build that was live when the new one lands -
  // the immediate predecessor, not an arbitrary older pass.
  if (backupNumber !== liveNumber - 1) {
    errors.push(`the safe backup must be the immediate predecessor PASS ${liveNumber - 1}, `
      + `but ${backupKey} pins PASS ${backupNumber}`);
  }
  if (backupKey !== `pass${backupNumber}Backup`) {
    errors.push(`backup key ${backupKey} does not name its own pass ${backupNumber}`);
  }
  if (backup.pass !== `PASS ${backupNumber}`) {
    errors.push(`${backupKey}.pass ${JSON.stringify(backup.pass)} does not name ${backup.path}`);
  }

  // Every OTHER channel in the config is a retired tree that this policy does not publish.
  // It may stay in the file (the local browser-QA topology still stages the pinned subtrees),
  // but it must never be mistaken for a published channel: only two trees go live.
  const publishedChannels = [`pass${liveNumber}`, `pass${backupNumber}`];

  if (publishSource === null) {
    errors.push(`${publishScriptName} does not exist; the live pass has no publish script that implements HF-400`);
  } else {
    const required = [
      `LIVE_TREE = "pass${liveNumber}"`,
      `BACKUP_TREE = "pass${backupNumber}"`,
      'EXPECTED_POST_STATE = {LIVE_TREE, BACKUP_TREE}',
      `KEEP_AT_LEAST = {"pass${backupNumber}"}`,
    ];
    for (const needle of required) {
      if (!publishSource.includes(needle)) errors.push(`${publishScriptName} is missing \`${needle}\``);
    }
  }

  if (livePagesChannels !== null) {
    const unexpected = livePagesChannels.filter((name) => !/^pass\d+$/u.test(name));
    if (unexpected.length) {
      errors.push(`gh-pages still carries retired tree(s) ${unexpected.join(', ')}; `
        + 'HF-400 keeps exactly the live pass and its pinned backup');
    }
    if (livePagesChannels.length > 2) {
      errors.push(`gh-pages carries ${livePagesChannels.length} channel trees `
        + `(${livePagesChannels.join(', ')}); HF-400 allows at most two`);
    }
    // Before a cut gh-pages is {backup, backup-1}; after it is {live, backup}. The pinned
    // backup is present in both, so its absence means the safe backup is already gone.
    if (!livePagesChannels.includes(`pass${backupNumber}`)) {
      errors.push(`the pinned safe backup pass${backupNumber} is not on gh-pages `
        + `(present: ${livePagesChannels.join(', ') || 'none'})`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    live: `pass${liveNumber}`,
    backup: `pass${backupNumber}`,
    publishedChannels,
    livePagesChannels,
  };
}

export function readLivePagesChannels(repositoryRoot) {
  try {
    const output = execFileSync('git', ['ls-tree', '-d', '--name-only', 'origin/gh-pages', 'channels/'], {
      cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024,
    });
    return output.split('\n').map((line) => line.trim()).filter(Boolean)
      .map((line) => line.slice(CHANNEL_PREFIX.length))
      .filter(Boolean)
      .sort();
  } catch {
    return null;
  }
}

if (process.argv[1]?.endsWith('verify-two-channel-policy.mjs')) {
  const repositoryRoot = resolve(import.meta.dirname, '..', '..');
  const config = JSON.parse(readFileSync(join(repositoryRoot, 'release-channels.json'), 'utf8'));
  const liveNumber = passNumberOfChannel(config?.experimental?.path);
  const publishScriptName = `scripts/orchestration/publish_pass${liveNumber ?? 'UNKNOWN'}.py`;
  const publishPath = join(repositoryRoot, publishScriptName);
  const publishSource = existsSync(publishPath) ? readFileSync(publishPath, 'utf8') : null;
  const livePagesChannels = process.env.TWO_CHANNEL_POLICY_SKIP_GIT === '1'
    ? null
    : readLivePagesChannels(repositoryRoot);
  if (livePagesChannels === null && process.env.TWO_CHANNEL_POLICY_SKIP_GIT !== '1') {
    // Skipped, not passed. A verifier that could not run must never be mistaken for one
    // that ran green - the same rule verify-release-topology.mjs already states for its
    // dropped-channel check.
    console.warn('[two-channel-policy] origin/gh-pages is unreachable; the live-tree half of '
      + 'this guard did NOT run. Fetch gh-pages to enable it.');
  }
  const result = evaluateTwoChannelPolicy({ config, publishSource, publishScriptName, livePagesChannels });
  const jsonFlag = process.argv.indexOf('--json');
  if (jsonFlag !== -1) {
    const target = resolve(process.argv[jsonFlag + 1] ?? '');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify({ schemaVersion: 1, policy: 'HF-400', ...result }, null, 2)}\n`);
  }
  if (!result.ok) {
    console.error(`HF-400 two-channel policy VIOLATED:\n- ${result.errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    twoChannelPolicy: 'ok', live: result.live, backup: result.backup, livePagesChannels: result.livePagesChannels,
  }));
}
