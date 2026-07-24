import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const distRoot = join(repositoryRoot, 'dist');
const config = JSON.parse(readFileSync(join(repositoryRoot, 'release-channels.json'), 'utf8'));
const sourceSha = process.env.SOURCE_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const releasePass = process.env.RELEASE_PASS ?? config.experimental.pass;

const safePath = (value, label) => {
  if (typeof value !== 'string' || !value || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} must be a safe relative path`);
  }
  return value;
};
const exactSha = (value, label) => {
  if (!/^[0-9a-f]{40}$/.test(value ?? '')) throw new Error(`${label} must be one exact 40-character Git SHA`);
  return value;
};
exactSha(sourceSha, 'SOURCE_SHA');
if (config.schemaVersion !== 3) throw new Error('release-channels.json schemaVersion must be 3');
if (releasePass !== config.experimental.pass) throw new Error(`Expected ${config.experimental.pass}, received ${releasePass}`);
if (!existsSync(join(distRoot, 'index.html')) || !existsSync(join(distRoot, 'assets'))) throw new Error('Pass 62 candidate dist is incomplete');

const walkFiles = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else files.push(path);
    }
  };
  visit(root);
  return files.sort();
};
const treeDigest = (root, paths = walkFiles(root)) => {
  const hash = createHash('sha256');
  for (const path of paths) {
    hash.update(relative(root, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
};
const channelRoot = (path) => {
  const target = resolve(distRoot, safePath(path, 'channel path'));
  if (!target.startsWith(`${distRoot}${sep}`)) throw new Error('Channel target escaped dist');
  return target;
};

rmSync(join(distRoot, 'channels'), { recursive: true, force: true });
const experimentalRoot = channelRoot(config.experimental.path);
mkdirSync(experimentalRoot, { recursive: true });
renameSync(join(distRoot, 'index.html'), join(experimentalRoot, 'index.html'));
renameSync(join(distRoot, 'assets'), join(experimentalRoot, 'assets'));
const experimentalJs = walkFiles(join(experimentalRoot, 'assets')).filter((path) => path.endsWith('.js'));
if (!experimentalJs.some((path) => readFileSync(path).includes(Buffer.from(config.experimental.pass)))) {
  throw new Error(`Experimental candidate does not contain ${config.experimental.pass}`);
}

function stagePinned(channelName, channel) {
  const pagesSha = exactSha(channel.pagesSha, `${channelName}.pagesSha`);
  const pinnedSourceSha = exactSha(channel.sourceSha, `${channelName}.sourceSha`);
  execFileSync('git', ['cat-file', '-e', `${pagesSha}^{commit}`], { cwd: repositoryRoot, stdio: 'pipe' });
  const sourceSubject = execFileSync('git', ['show', '-s', '--format=%s', pagesSha], {
    cwd: repositoryRoot, encoding: 'utf8',
  }).trim();
  if (!sourceSubject.includes(channel.pass) || !sourceSubject.includes(pinnedSourceSha)) {
    throw new Error(`${channelName} Pages commit does not attest ${channel.pass} from ${pinnedSourceSha}`);
  }
  const output = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', pagesSha, '--', 'index.html', 'assets'], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  const paths = output.split('\0').filter(Boolean);
  if (!paths.includes('index.html') || !paths.some((path) => path.startsWith('assets/'))) throw new Error(`${pagesSha} is not a complete root release`);
  const targetRoot = channelRoot(channel.path);
  mkdirSync(targetRoot, { recursive: true });
  const passEvidenceFiles = [];
  for (const path of paths) {
    const target = resolve(targetRoot, path);
    if (!target.startsWith(`${targetRoot}${sep}`)) throw new Error(`Unsafe Pages path: ${path}`);
    mkdirSync(dirname(target), { recursive: true });
    const blob = execFileSync('git', ['cat-file', 'blob', `${pagesSha}:${path}`], {
      cwd: repositoryRoot, encoding: null, maxBuffer: 32 * 1024 * 1024,
    });
    if (path.endsWith('.js') && blob.includes(Buffer.from(channel.pass))) passEvidenceFiles.push(path);
    writeFileSync(target, blob);
  }
  if (passEvidenceFiles.length === 0) throw new Error(`${pagesSha} does not contain configured ${channel.pass}`);
  const digest = treeDigest(targetRoot, paths.map((path) => join(targetRoot, path)));
  const provenance = {
    schemaVersion: 3, channel: channelName, releasePass: channel.pass,
    pagesSha, sourceSha: pinnedSourceSha, sourceSubject, path: channel.path,
    exactRootFileCount: paths.length, passEvidenceFiles, treeSha256: digest,
  };
  writeFileSync(join(targetRoot, 'channel-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}

const stable = stagePinned('recent-stable', config.stable);
const experimentalFiles = walkFiles(experimentalRoot);
const experimental = {
  schemaVersion: 3, channel: 'experimental-netcode-pass', releasePass,
  sourceSha, path: config.experimental.path,
  exactRootFileCount: experimentalFiles.length,
  treeSha256: treeDigest(experimentalRoot, experimentalFiles),
};
writeFileSync(join(experimentalRoot, 'channel-provenance.json'), `${JSON.stringify(experimental, null, 2)}\n`);

for (const file of ['index.html', 'release-shell.css', 'release-shell.js']) {
  copyFileSync(join(repositoryRoot, 'release-shell', file), join(distRoot, file));
}
const publicConfig = Object.fromEntries(['experimental', 'stable'].map((key) => [key, {
  label: config[key].label, description: config[key].description, pass: config[key].pass, path: config[key].path,
}]));
writeFileSync(join(distRoot, 'release-channel-config.js'), `window.__ATOMIC_ACRES_RELEASE_CHANNELS__=${JSON.stringify(publicConfig)};\n`);

mkdirSync(join(repositoryRoot, 'artifacts', 'pipeline'), { recursive: true });
const topology = {
  schemaVersion: 3, sourceSha, releasePass,
  root: { kind: 'chooser-only', files: ['index.html', 'release-shell.css', 'release-shell.js', 'release-channel-config.js'] },
  channels: { experimental, stable },
};
writeFileSync(join(repositoryRoot, 'artifacts', 'pipeline', 'release-topology.json'), `${JSON.stringify(topology, null, 2)}\n`);
console.log(JSON.stringify({ releaseTopology: 'ok', sourceSha, channels: {
  experimental: { pass: experimental.releasePass, sourceSha, digest: experimental.treeSha256 },
  stable: { pass: stable.releasePass, pagesSha: stable.pagesSha, digest: stable.treeSha256 },
} }));
