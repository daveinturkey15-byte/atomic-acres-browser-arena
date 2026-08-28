import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const root = resolve('.');
const dist = join(root, 'dist');
const config = JSON.parse(readFileSync(join(root, 'release-channels.json'), 'utf8'));
const expectedRollbackReleasedAt = process.env.ROLLBACK_RELEASED_AT?.trim() || null;
const requireRollbackReleaseTimestamp = process.env.REQUIRE_ROLLBACK_RELEASE_TIMESTAMP === '1';
if (requireRollbackReleaseTimestamp && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(expectedRollbackReleasedAt ?? '')
  || Number.isNaN(Date.parse(expectedRollbackReleasedAt)))) {
  throw new Error('Production topology requires one strict ROLLBACK_RELEASED_AT UTC instant');
}
if (config.schemaVersion !== 5) throw new Error('release topology verifier requires schemaVersion 5');
const rootIndex = readFileSync(join(dist, 'index.html'), 'utf8');
if (!rootIndex.includes('release-shell.js') || rootIndex.includes('type="module"') || existsSync(join(dist, 'assets'))) {
  throw new Error('Root must be a chooser-only shell with no game runtime assets');
}
const publicConfigSource = readFileSync(join(dist, 'release-channel-config.js'), 'utf8');
const publicConfig = JSON.parse(publicConfigSource.slice(publicConfigSource.indexOf('=') + 1).replace(/;\s*$/, ''));
const rollbackStaged = Boolean(config.rollback && existsSync(join(dist, config.rollback.path)));
const requiredChannelKeys = rollbackStaged
  ? ['experimental', 'previous', 'retained', 'historical', 'stable']
  : ['experimental', 'previous', 'retained', 'historical'];
const missingChannelKeys = requiredChannelKeys.filter((key) => !publicConfig[key]);
if (missingChannelKeys.length) {
  throw new Error(`Root chooser must expose ${requiredChannelKeys.join(', ')}; missing ${missingChannelKeys.join(', ')}`);
}
// Additional channels are ALLOWED, and are the point: the owner keeps every published pass
// selectable, so this set grows with each release. The exact-equality check this replaces is
// what let a published PASS 80 sit in the live config while the chooser refused to draw it.
// What is still forbidden - and was never checked before - is a channel the chooser would
// offer that the deploy never staged. A card that 404s is worse than no card.
for (const [key, channel] of Object.entries(publicConfig)) {
  if (!channel?.path) throw new Error(`Root chooser channel ${key} has no path`);
  if (!existsSync(join(dist, channel.path))) {
    throw new Error(`Root chooser channel ${key} points at ${channel.path}, which is not staged`);
  }
}
if (publicConfig.experimental.pass !== config.experimental.pass || publicConfig.experimental.label !== config.experimental.label
  || publicConfig.experimental.path !== 'channels/the-big-one') {
  throw new Error(`Root chooser is missing live ${config.experimental.pass}`);
}
if (publicConfig.previous.pass !== config.previous.pass
  || publicConfig.previous.label !== config.previous.label
  || publicConfig.previous.path !== config.previous.path) {
  throw new Error(`Root chooser is missing previous ${config.previous.pass}`);
}
if (publicConfig.retained.pass !== config.retained.pass
  || publicConfig.retained.label !== config.retained.label
  || publicConfig.retained.path !== config.retained.path) {
  throw new Error(`Root chooser is missing retained ${config.retained.pass}`);
}
if (publicConfig.historical.pass !== config.historical.pass
  || publicConfig.historical.label !== config.historical.label
  || publicConfig.historical.path !== config.historical.path) {
  throw new Error(`Root chooser is missing historical ${config.historical.pass}`);
}
if (rollbackStaged && (publicConfig.stable.pass !== config.rollback.pass
  || publicConfig.stable.label !== config.rollback.label
  || publicConfig.stable.path !== config.rollback.path)) {
  throw new Error(`Root chooser is missing stable ${config.rollback.pass} WebGL`);
}
const stagedChannelDirectories = readdirSync(join(dist, 'channels'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expectedDirectories = rollbackStaged
  ? ['pass63-rollback', 'pass69-retained', 'pass70-retained', 'pass72-retained', 'recent-stable', 'the-big-one']
  : ['pass69-retained', 'pass70-retained', 'pass72-retained', 'recent-stable', 'the-big-one'];
if (JSON.stringify(stagedChannelDirectories) !== JSON.stringify(expectedDirectories)) {
  throw new Error(`Unexpected staged channels: ${stagedChannelDirectories.join(', ')}`);
}

const walkFiles = (directory) => readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? walkFiles(join(directory, entry.name)) : [join(directory, entry.name)])
  .sort();
const treeDigest = (rootPath, paths) => {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(relative(rootPath, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
};

function verifyPinned(channel) {
  const targetRoot = resolve(dist, channel.path);
  if (!targetRoot.startsWith(`${dist}${sep}`)) throw new Error('Unsafe staged channel');
  const pagesPath = channel.pagesPath ?? '';
  const treePaths = pagesPath ? [pagesPath] : ['index.html', 'assets'];
  const sourcePaths = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', channel.pagesSha, '--', ...treePaths], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  const prefix = pagesPath ? `${pagesPath}/` : '';
  const paths = sourcePaths.map((path) => prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path);
  for (const [index, path] of paths.entries()) {
    const staged = readFileSync(join(targetRoot, path));
    const pinned = execFileSync('git', ['cat-file', 'blob', `${channel.pagesSha}:${sourcePaths[index]}`], {
      cwd: root, encoding: null, maxBuffer: 32 * 1024 * 1024,
    });
    if (!staged.equals(pinned)) throw new Error(`${channel.pass} staged byte mismatch: ${path}`);
  }
  return paths.length;
}
const previousFiles = verifyPinned(config.previous);
const previousRoot = resolve(dist, config.previous.path);
const previousEmbedded = JSON.parse(readFileSync(join(previousRoot, 'channel-provenance.json'), 'utf8'));
const previousWrapper = JSON.parse(readFileSync(join(previousRoot, 'pinned-channel-provenance.json'), 'utf8'));
if (previousEmbedded.releasePass !== config.previous.pass
  || previousEmbedded.schemaVersion !== 4
  || previousEmbedded.sourceSha !== config.previous.sourceSha
  || previousEmbedded.path !== config.previous.pagesPath
  || previousEmbedded.exactRootFileCount !== config.previous.runtimeFileCount
  || previousEmbedded.treeSha256 !== config.previous.runtimeTreeSha256
  || previousWrapper.schemaVersion !== 5
  || previousWrapper.channel !== 'pass72-retained'
  || previousWrapper.releasePass !== config.previous.pass
  || previousWrapper.sourceSha !== config.previous.sourceSha
  || previousWrapper.pagesSha !== config.previous.pagesSha
  || previousWrapper.pagesPath !== config.previous.pagesPath
  || previousWrapper.path !== config.previous.path
  || previousWrapper.pinnedRuntime?.treeSha256 !== config.previous.runtimeTreeSha256) {
  throw new Error('Previous Pass 72 does not match the exact previously live runtime');
}
const retainedFiles = verifyPinned(config.retained);
const retainedRoot = resolve(dist, config.retained.path);
const retainedEmbedded = JSON.parse(readFileSync(join(retainedRoot, 'channel-provenance.json'), 'utf8'));
const retainedWrapper = JSON.parse(readFileSync(join(retainedRoot, 'pinned-channel-provenance.json'), 'utf8'));
if (retainedEmbedded.releasePass !== config.retained.pass
  || retainedEmbedded.schemaVersion !== 4
  || retainedEmbedded.sourceSha !== config.retained.sourceSha
  || retainedEmbedded.path !== config.retained.pagesPath
  || retainedEmbedded.exactRootFileCount !== config.retained.runtimeFileCount
  || retainedEmbedded.treeSha256 !== config.retained.runtimeTreeSha256
  || retainedWrapper.schemaVersion !== 5
  || retainedWrapper.channel !== 'pass70-retained'
  || retainedWrapper.releasePass !== config.retained.pass
  || retainedWrapper.sourceSha !== config.retained.sourceSha
  || retainedWrapper.pagesSha !== config.retained.pagesSha
  || retainedWrapper.pagesPath !== config.retained.pagesPath
  || retainedWrapper.path !== config.retained.path
  || retainedWrapper.pinnedRuntime?.treeSha256 !== config.retained.runtimeTreeSha256) {
  throw new Error('Retained Pass 70 does not match the exact hosted runtime');
}
const historicalFiles = verifyPinned(config.historical);
const historicalRoot = resolve(dist, config.historical.path);
const historicalEmbedded = JSON.parse(readFileSync(join(historicalRoot, 'channel-provenance.json'), 'utf8'));
const historicalWrapper = JSON.parse(readFileSync(join(historicalRoot, 'pinned-channel-provenance.json'), 'utf8'));
if (historicalEmbedded.schemaVersion !== 4
  || historicalEmbedded.releasePass !== config.historical.pass
  || historicalEmbedded.sourceSha !== config.historical.sourceSha
  || historicalEmbedded.path !== config.historical.pagesPath
  || historicalEmbedded.exactRootFileCount !== config.historical.runtimeFileCount
  || historicalEmbedded.treeSha256 !== config.historical.runtimeTreeSha256
  || historicalWrapper.schemaVersion !== 5
  || historicalWrapper.channel !== 'pass69-retained'
  || historicalWrapper.releasePass !== config.historical.pass
  || historicalWrapper.sourceSha !== config.historical.sourceSha
  || historicalWrapper.pagesSha !== config.historical.pagesSha
  || historicalWrapper.pagesPath !== config.historical.pagesPath
  || historicalWrapper.path !== config.historical.path
  || historicalWrapper.pinnedRuntime?.treeSha256 !== config.historical.runtimeTreeSha256) {
  throw new Error('Historical Pass 69 does not match the exact previously hosted runtime');
}
const stableRoot = resolve(dist, config.stable.path);
const rebuiltStableProvenancePath = join(stableRoot, 'channel-provenance.json');
const rebuiltStable = existsSync(rebuiltStableProvenancePath)
  ? JSON.parse(readFileSync(rebuiltStableProvenancePath, 'utf8'))
  : null;
let stableFiles;
if (rebuiltStable?.rebuiltFromSource === true) {
  const files = walkFiles(stableRoot).filter((path) => path !== rebuiltStableProvenancePath);
  const passEvidence = files.some((path) => path.endsWith('.js') && readFileSync(path).includes(Buffer.from(config.stable.pass)));
  const sourceEvidence = files.some((path) => path.endsWith('.js') && readFileSync(path).includes(Buffer.from(config.stable.sourceSha)));
  if (rebuiltStable.schemaVersion !== 5
    || rebuiltStable.channel !== 'recent-stable'
    || rebuiltStable.releasePass !== config.stable.pass
    || rebuiltStable.sourceSha !== config.stable.sourceSha
    || rebuiltStable.path !== config.stable.path
    || rebuiltStable.originalPagesSha !== config.stable.pagesSha
    || rebuiltStable.originalPagesPath !== config.stable.pagesPath
    || rebuiltStable.exactRootFileCount !== files.length
    || rebuiltStable.treeSha256 !== treeDigest(stableRoot, files)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(rebuiltStable.releasedAt ?? '')
    || Number.isNaN(Date.parse(rebuiltStable.releasedAt))
    || !passEvidence
    || !sourceEvidence) {
    throw new Error('Stable Pass 67.1 rebuilt provenance does not match its configured source, timestamp, and staged bytes');
  }
  stableFiles = files.length;
} else {
  stableFiles = verifyPinned(config.stable);
  const stableProvenanceFile = config.stable.pagesPath ? 'pinned-channel-provenance.json' : 'channel-provenance.json';
  const stableProvenance = JSON.parse(readFileSync(join(stableRoot, stableProvenanceFile), 'utf8'));
  if (stableProvenance.schemaVersion !== 5
    || stableProvenance.releasePass !== config.stable.pass
    || stableProvenance.sourceSha !== config.stable.sourceSha
    || stableProvenance.pagesSha !== config.stable.pagesSha
    || stableProvenance.pagesPath !== config.stable.pagesPath
    || stableProvenance.pinnedRuntime?.exactRootFileCount !== config.stable.runtimeFileCount
    || stableProvenance.pinnedRuntime?.treeSha256 !== config.stable.runtimeTreeSha256) {
    throw new Error('Stable Pass 67.1 provenance does not match the exact configured source and Pages SHAs');
  }
}
const experimentalRoot = resolve(dist, config.experimental.path);
if (!existsSync(join(experimentalRoot, 'index.html')) || !existsSync(join(experimentalRoot, 'assets'))) throw new Error('Experimental channel is incomplete');
const experimentalAssets = readdirSync(join(experimentalRoot, 'assets')).filter((name) => name.endsWith('.js'));
if (!experimentalAssets.some((name) => readFileSync(join(experimentalRoot, 'assets', name)).includes(Buffer.from(config.experimental.pass)))) {
  throw new Error(`Experimental channel does not contain ${config.experimental.pass}`);
}
const experimentalProvenance = JSON.parse(readFileSync(join(experimentalRoot, 'channel-provenance.json'), 'utf8'));
if (experimentalProvenance.schemaVersion !== 5
  || experimentalProvenance.channel !== 'the-big-one'
  || experimentalProvenance.releasePass !== config.experimental.pass
  || experimentalProvenance.path !== config.experimental.path
  || !/^[0-9a-f]{40}$/.test(experimentalProvenance.sourceSha ?? '')) {
  throw new Error('Experimental provenance does not match the schema 5 live-channel contract');
}
if (config.rollback && existsSync(join(dist, config.rollback.path))) {
  const rollbackRoot = resolve(dist, config.rollback.path);
  if (!rollbackRoot.startsWith(`${dist}${sep}`)) throw new Error('Unsafe rollback channel');
  if (!existsSync(join(rollbackRoot, 'index.html')) || !existsSync(join(rollbackRoot, 'assets'))) {
    throw new Error(`${config.rollback.pass} rollback channel is incomplete`);
  }
  const rollbackAssets = readdirSync(join(rollbackRoot, 'assets')).filter((name) => name.endsWith('.js'));
  if (!rollbackAssets.some((name) => readFileSync(join(rollbackRoot, 'assets', name)).includes(Buffer.from(config.rollback.pass)))) {
    throw new Error(`Rollback channel does not contain ${config.rollback.pass}`);
  }
  const rollbackProvenancePath = join(rollbackRoot, 'channel-provenance.json');
  const rollbackProvenance = JSON.parse(readFileSync(rollbackProvenancePath, 'utf8'));
  if (requireRollbackReleaseTimestamp) {
    const rollbackFiles = walkFiles(rollbackRoot).filter((path) => path !== rollbackProvenancePath);
    const rollbackPassEvidence = rollbackFiles.some((path) => path.endsWith('.js') && readFileSync(path).includes(Buffer.from(config.rollback.pass)));
    if (rollbackProvenance.schemaVersion !== 5
      || rollbackProvenance.releasePass !== config.rollback.pass
      || rollbackProvenance.sourceSha !== config.rollback.sourceSha
      || rollbackProvenance.path !== config.rollback.path
      || rollbackProvenance.rebuiltFromSource !== true
      || rollbackProvenance.exactRootFileCount !== rollbackFiles.length
      || rollbackProvenance.treeSha256 !== treeDigest(rollbackRoot, rollbackFiles)
      || rollbackProvenance.releasedAt !== expectedRollbackReleasedAt
      || rollbackProvenance.originalPagesSha !== config.rollback.pagesSha
      || rollbackProvenance.originalPagesPath !== config.rollback.pagesPath
      || !rollbackPassEvidence) {
      throw new Error('Rollback provenance does not match its source, staged bytes, and original Pages publication');
    }
  } else {
    verifyPinned(config.rollback);
    const rollbackWrapper = JSON.parse(readFileSync(join(rollbackRoot, 'pinned-channel-provenance.json'), 'utf8'));
    if (rollbackProvenance.schemaVersion !== 4
      || rollbackProvenance.releasePass !== config.rollback.pass
      || rollbackProvenance.sourceSha !== config.rollback.sourceSha
      || rollbackProvenance.path !== config.rollback.pagesPath
      || rollbackProvenance.exactRootFileCount !== config.rollback.runtimeFileCount
      || rollbackProvenance.treeSha256 !== config.rollback.runtimeTreeSha256
      || rollbackWrapper.schemaVersion !== 5
      || rollbackWrapper.channel !== 'rollback'
      || rollbackWrapper.pagesSha !== config.rollback.pagesSha
      || rollbackWrapper.pagesPath !== config.rollback.pagesPath
      || rollbackWrapper.path !== config.rollback.path
      || rollbackWrapper.pinnedRuntime?.treeSha256 !== config.rollback.runtimeTreeSha256) {
      throw new Error('Rollback preview does not match the exact pinned Pass 63 Pages subtree');
    }
  }
}
console.log(JSON.stringify({
  releaseTopology: 'verified',
  previousFiles,
  retainedFiles,
  historicalFiles,
  stableFiles,
  experimentalAssets: experimentalAssets.length,
}));
