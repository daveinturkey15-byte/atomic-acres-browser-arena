import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const root = resolve('.');
const dist = join(root, 'dist');
const config = JSON.parse(readFileSync(join(root, 'release-channels.json'), 'utf8'));
if (config.schemaVersion !== 4) throw new Error('release topology verifier requires schemaVersion 4');
const rootIndex = readFileSync(join(dist, 'index.html'), 'utf8');
if (!rootIndex.includes('release-shell.js') || rootIndex.includes('type="module"') || existsSync(join(dist, 'assets'))) {
  throw new Error('Root must be a chooser-only shell with no game runtime assets');
}
const publicConfigSource = readFileSync(join(dist, 'release-channel-config.js'), 'utf8');
const publicConfig = JSON.parse(publicConfigSource.slice(publicConfigSource.indexOf('=') + 1).replace(/;\s*$/, ''));
const rollbackStaged = Boolean(config.rollback && existsSync(join(dist, config.rollback.path)));
const expectedChannelKeys = rollbackStaged ? ['experimental', 'stable', 'rollback'] : ['experimental', 'stable'];
if (JSON.stringify(Object.keys(publicConfig)) !== JSON.stringify(expectedChannelKeys)) {
  throw new Error(`Root chooser must expose exactly ${expectedChannelKeys.join(', ')}: ${Object.keys(publicConfig).join(', ')}`);
}
if (publicConfig.experimental.pass !== 'PASS 68' || !publicConfig.experimental.label.startsWith('THE BIG ONE')
  || publicConfig.experimental.path !== 'channels/the-big-one') {
  throw new Error('Root chooser is missing live Pass 68 THE BIG ONE');
}
if (publicConfig.stable.pass !== 'PASS 67.1' || publicConfig.stable.label !== 'STABLE SINGLEPLAYER') {
  throw new Error('Root chooser is missing stable Pass 67.1 singleplayer');
}
const stagedChannelDirectories = readdirSync(join(dist, 'channels'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const expectedDirectories = rollbackStaged ? ['pass63-rollback', 'recent-stable', 'the-big-one'] : ['recent-stable', 'the-big-one'];
if (JSON.stringify(stagedChannelDirectories) !== JSON.stringify(expectedDirectories)) {
  throw new Error(`Unexpected staged channels: ${stagedChannelDirectories.join(', ')}`);
}

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
const stableFiles = verifyPinned(config.stable);
const stableProvenanceFile = config.stable.pagesPath ? 'pinned-channel-provenance.json' : 'channel-provenance.json';
const stableProvenance = JSON.parse(readFileSync(join(dist, config.stable.path, stableProvenanceFile), 'utf8'));
if (stableProvenance.schemaVersion !== 4
  || stableProvenance.releasePass !== config.stable.pass
  || stableProvenance.sourceSha !== config.stable.sourceSha
  || stableProvenance.pagesSha !== config.stable.pagesSha
  || stableProvenance.pagesPath !== config.stable.pagesPath
  || stableProvenance.pinnedRuntime?.exactRootFileCount !== config.stable.runtimeFileCount
  || stableProvenance.pinnedRuntime?.treeSha256 !== config.stable.runtimeTreeSha256) {
  throw new Error('Stable Pass 67.1 provenance does not match the exact configured source and Pages SHAs');
}
const experimentalRoot = resolve(dist, config.experimental.path);
if (!existsSync(join(experimentalRoot, 'index.html')) || !existsSync(join(experimentalRoot, 'assets'))) throw new Error('Experimental channel is incomplete');
const experimentalAssets = readdirSync(join(experimentalRoot, 'assets')).filter((name) => name.endsWith('.js'));
if (!experimentalAssets.some((name) => readFileSync(join(experimentalRoot, 'assets', name)).includes(Buffer.from(config.experimental.pass)))) {
  throw new Error(`Experimental channel does not contain ${config.experimental.pass}`);
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
  const rollbackProvenance = JSON.parse(readFileSync(join(rollbackRoot, 'channel-provenance.json'), 'utf8'));
  if (rollbackProvenance.schemaVersion !== 4
    || rollbackProvenance.releasePass !== config.rollback.pass
    || rollbackProvenance.sourceSha !== config.rollback.sourceSha
    || rollbackProvenance.path !== config.rollback.path
    || rollbackProvenance.rebuiltFromSource !== true) {
    throw new Error('Rollback provenance does not match the configured Pass 63 rebuilt-source record');
  }
}
console.log(JSON.stringify({ releaseTopology: 'verified', stableFiles, experimentalAssets: experimentalAssets.length }));
