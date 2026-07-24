import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

const root = resolve('.');
const dist = join(root, 'dist');
const config = JSON.parse(readFileSync(join(root, 'release-channels.json'), 'utf8'));
const rootIndex = readFileSync(join(dist, 'index.html'), 'utf8');
if (!rootIndex.includes('release-shell.js') || rootIndex.includes('type="module"') || existsSync(join(dist, 'assets'))) {
  throw new Error('Root must be a chooser-only shell with no game runtime assets');
}
for (const label of ['NEW NETCODE', 'RECENT STABLE', 'EXPERIMENTAL NETCODE PASS']) {
  const publicConfig = readFileSync(join(dist, 'release-channel-config.js'), 'utf8');
  if (!publicConfig.includes(label)) throw new Error(`Root chooser is missing ${label}`);
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
const normalFiles = verifyPinned(config.normal);
const stableFiles = verifyPinned(config.stable);
const experimentalRoot = resolve(dist, config.experimental.path);
if (!existsSync(join(experimentalRoot, 'index.html')) || !existsSync(join(experimentalRoot, 'assets'))) throw new Error('Experimental channel is incomplete');
const experimentalAssets = readdirSync(join(experimentalRoot, 'assets')).filter((name) => name.endsWith('.js'));
if (!experimentalAssets.some((name) => readFileSync(join(experimentalRoot, 'assets', name)).includes(Buffer.from(config.experimental.pass)))) {
  throw new Error(`Experimental channel does not contain ${config.experimental.pass}`);
}
console.log(JSON.stringify({ releaseTopology: 'verified', normalFiles, stableFiles, experimentalAssets: experimentalAssets.length }));
