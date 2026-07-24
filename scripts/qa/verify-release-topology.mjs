import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const root = resolve('.');
const dist = join(root, 'dist');
const config = JSON.parse(readFileSync(join(root, 'release-channels.json'), 'utf8'));
if (config.schemaVersion !== 3) throw new Error('release topology verifier requires schemaVersion 3');
const rootIndex = readFileSync(join(dist, 'index.html'), 'utf8');
if (!rootIndex.includes('release-shell.js') || rootIndex.includes('type="module"') || existsSync(join(dist, 'assets'))) {
  throw new Error('Root must be a chooser-only shell with no game runtime assets');
}
const publicConfigSource = readFileSync(join(dist, 'release-channel-config.js'), 'utf8');
const publicConfig = JSON.parse(publicConfigSource.slice(publicConfigSource.indexOf('=') + 1).replace(/;\s*$/, ''));
if (JSON.stringify(Object.keys(publicConfig)) !== JSON.stringify(['experimental', 'stable'])) {
  throw new Error(`Root chooser must expose only experimental and stable: ${Object.keys(publicConfig).join(', ')}`);
}
if (publicConfig.experimental.pass !== 'PASS 62' || publicConfig.experimental.label !== 'EXPERIMENTAL NEW NETCODE') {
  throw new Error('Root chooser is missing live Pass 62 experimental netcode');
}
if (publicConfig.stable.pass !== 'PASS 60' || publicConfig.stable.label !== 'NEW NETCODE') {
  throw new Error('Root chooser is missing stable Pass 60 new netcode');
}
const stagedChannelDirectories = readdirSync(join(dist, 'channels'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
if (JSON.stringify(stagedChannelDirectories) !== JSON.stringify(['experimental-netcode-pass', 'recent-stable'])) {
  throw new Error(`Unexpected staged channels: ${stagedChannelDirectories.join(', ')}`);
}

function verifyPinned(channel) {
  const targetRoot = resolve(dist, channel.path);
  if (!targetRoot.startsWith(`${dist}${sep}`)) throw new Error('Unsafe staged channel');
  const paths = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', channel.pagesSha, '--', 'index.html', 'assets'], {
    cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  }).split('\0').filter(Boolean);
  for (const path of paths) {
    const staged = readFileSync(join(targetRoot, path));
    const pinned = execFileSync('git', ['cat-file', 'blob', `${channel.pagesSha}:${path}`], {
      cwd: root, encoding: null, maxBuffer: 32 * 1024 * 1024,
    });
    if (!staged.equals(pinned)) throw new Error(`${channel.pass} staged byte mismatch: ${path}`);
  }
  return paths.length;
}
const stableFiles = verifyPinned(config.stable);
const stableProvenance = JSON.parse(readFileSync(join(dist, config.stable.path, 'channel-provenance.json'), 'utf8'));
if (stableProvenance.schemaVersion !== 3
  || stableProvenance.releasePass !== config.stable.pass
  || stableProvenance.sourceSha !== config.stable.sourceSha
  || stableProvenance.pagesSha !== config.stable.pagesSha) {
  throw new Error('Stable Pass 60 provenance does not match the exact configured source and Pages SHAs');
}
const experimentalRoot = resolve(dist, config.experimental.path);
if (!existsSync(join(experimentalRoot, 'index.html')) || !existsSync(join(experimentalRoot, 'assets'))) throw new Error('Experimental channel is incomplete');
const experimentalAssets = readdirSync(join(experimentalRoot, 'assets')).filter((name) => name.endsWith('.js'));
if (!experimentalAssets.some((name) => readFileSync(join(experimentalRoot, 'assets', name)).includes(Buffer.from(config.experimental.pass)))) {
  throw new Error(`Experimental channel does not contain ${config.experimental.pass}`);
}
console.log(JSON.stringify({ releaseTopology: 'verified', stableFiles, experimentalAssets: experimentalAssets.length }));
