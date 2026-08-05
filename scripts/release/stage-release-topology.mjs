import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const configuredDistRoot = process.env.RELEASE_DIST_ROOT;
if (configuredDistRoot && !isAbsolute(configuredDistRoot)) throw new Error('RELEASE_DIST_ROOT must be absolute');
const distRoot = configuredDistRoot ? resolve(configuredDistRoot) : join(repositoryRoot, 'dist');
const configuredTopologyReceipt = process.env.RELEASE_TOPOLOGY_RECEIPT_PATH;
if (configuredTopologyReceipt && !isAbsolute(configuredTopologyReceipt)) {
  throw new Error('RELEASE_TOPOLOGY_RECEIPT_PATH must be absolute');
}
const topologyReceiptPath = configuredTopologyReceipt
  ? resolve(configuredTopologyReceipt)
  : join(repositoryRoot, 'artifacts', 'pipeline', 'release-topology.json');
const config = JSON.parse(readFileSync(join(repositoryRoot, 'release-channels.json'), 'utf8'));
const sourceSha = process.env.SOURCE_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const releasePass = process.env.RELEASE_PASS ?? config.experimental.pass;
const liveChannelId = config.experimental.path.split('/').at(-1);

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
if (config.schemaVersion !== 4) throw new Error('release-channels.json schemaVersion must be 4');
if (config.experimental.pass !== 'PASS 68' || !config.experimental.label.startsWith('THE BIG ONE')
  || config.experimental.path !== 'channels/the-big-one') {
  throw new Error('Pass 68 production topology must stage THE BIG ONE at channels/the-big-one');
}
if (config.stable.pass !== 'PASS 67.1' || config.stable.label !== 'STABLE SINGLEPLAYER') {
  throw new Error('Pass 67.1 must remain the byte-exact stable singleplayer channel');
}
if (config.rollback && (config.rollback.pass !== 'PASS 63' || config.rollback.path !== 'channels/pass63-rollback')) {
  throw new Error('Rollback must be the Pass 63 rebuild at channels/pass63-rollback');
}
if (releasePass !== config.experimental.pass) throw new Error(`Expected ${config.experimental.pass}, received ${releasePass}`);
if (!existsSync(join(distRoot, 'index.html')) || !existsSync(join(distRoot, 'assets'))) throw new Error(`${releasePass} candidate dist is incomplete`);

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
  const pagesPath = channel.pagesPath ? safePath(channel.pagesPath, `${channelName}.pagesPath`) : '';
  execFileSync('git', ['cat-file', '-e', `${pagesSha}^{commit}`], { cwd: repositoryRoot, stdio: 'pipe' });
  const sourceSubject = execFileSync('git', ['show', '-s', '--format=%s', pagesSha], {
    cwd: repositoryRoot, encoding: 'utf8',
  }).trim();
  if (!sourceSubject.includes(channel.pass) || !sourceSubject.includes(pinnedSourceSha)) {
    throw new Error(`${channelName} Pages commit does not attest ${channel.pass} from ${pinnedSourceSha}`);
  }
  const treePaths = pagesPath ? [pagesPath] : ['index.html', 'assets'];
  const output = execFileSync('git', ['ls-tree', '-r', '-z', '--name-only', pagesSha, '--', ...treePaths], {
    cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  const sourcePaths = output.split('\0').filter(Boolean);
  const prefix = pagesPath ? `${pagesPath}/` : '';
  const paths = sourcePaths.map((path) => prefix && path.startsWith(prefix) ? path.slice(prefix.length) : path);
  if (!paths.includes('index.html') || !paths.some((path) => path.startsWith('assets/'))) throw new Error(`${pagesSha} is not a complete root release`);
  let pinnedRuntime = null;
  if (pagesPath) {
    const sourceProvenancePath = `${pagesPath}/channel-provenance.json`;
    if (!sourcePaths.includes(sourceProvenancePath)) throw new Error(`${pagesSha} is missing pinned runtime provenance`);
    pinnedRuntime = JSON.parse(execFileSync('git', ['cat-file', 'blob', `${pagesSha}:${sourceProvenancePath}`], {
      cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 1024 * 1024,
    }));
    if (pinnedRuntime.releasePass !== channel.pass
      || pinnedRuntime.sourceSha !== pinnedSourceSha
      || pinnedRuntime.path !== pagesPath
      || pinnedRuntime.exactRootFileCount !== channel.runtimeFileCount
      || pinnedRuntime.treeSha256 !== channel.runtimeTreeSha256) {
      throw new Error(`${channelName} runtime provenance does not match the configured benchmark`);
    }
  }
  const targetRoot = channelRoot(channel.path);
  mkdirSync(targetRoot, { recursive: true });
  const passEvidenceFiles = [];
  for (const [index, path] of paths.entries()) {
    const sourcePath = sourcePaths[index];
    const target = resolve(targetRoot, path);
    if (!target.startsWith(`${targetRoot}${sep}`)) throw new Error(`Unsafe Pages path: ${path}`);
    mkdirSync(dirname(target), { recursive: true });
    const blob = execFileSync('git', ['cat-file', 'blob', `${pagesSha}:${sourcePath}`], {
      cwd: repositoryRoot, encoding: null, maxBuffer: 32 * 1024 * 1024,
    });
    if (path.endsWith('.js') && blob.includes(Buffer.from(channel.pass))) passEvidenceFiles.push(path);
    writeFileSync(target, blob);
  }
  if (passEvidenceFiles.length === 0) throw new Error(`${pagesSha} does not contain configured ${channel.pass}`);
  const digest = treeDigest(targetRoot, paths.map((path) => join(targetRoot, path)));
  const provenance = {
    schemaVersion: 4, channel: channelName, releasePass: channel.pass,
    pagesSha, pagesPath: pagesPath || '.', sourceSha: pinnedSourceSha, sourceSubject, path: channel.path,
    exactRootFileCount: paths.length, passEvidenceFiles, treeSha256: digest, pinnedRuntime,
  };
  const provenanceFile = paths.includes('channel-provenance.json')
    ? 'pinned-channel-provenance.json'
    : 'channel-provenance.json';
  writeFileSync(join(targetRoot, provenanceFile), `${JSON.stringify(provenance, null, 2)}\n`);
  return { ...provenance, provenanceFile };
}

const stable = stagePinned('recent-stable', config.stable);
const experimentalFiles = walkFiles(experimentalRoot);
const experimental = {
  schemaVersion: 4, channel: liveChannelId, releasePass,
  sourceSha, path: config.experimental.path,
  exactRootFileCount: experimentalFiles.length,
  treeSha256: treeDigest(experimentalRoot, experimentalFiles),
};
writeFileSync(join(experimentalRoot, 'channel-provenance.json'), `${JSON.stringify(experimental, null, 2)}\n`);

let rollback = null;
if (config.rollback) {
  // The Pass 63 rollback is a deterministic rebuild from its approved source
  // SHA, staged from a separately built subtree (RELEASE_ROLLBACK_DIST) because
  // the original Pass 63 Pages deploy is not byte-retrievable. Provenance is
  // honest: exact source SHA + rebuiltFromSource, never a false byte-exact claim.
  const configuredRollbackDist = process.env.RELEASE_ROLLBACK_DIST;
  const rollbackRequired = process.env.REQUIRE_ROLLBACK_CHANNEL === '1';
  if (!configuredRollbackDist || !isAbsolute(configuredRollbackDist)) {
    if (!rollbackRequired) {
      // Browser-QA previews (killstreak capture, HUD e2e) exercise the live
      // candidate + byte-exact stable topology; the Pass 63 rebuild subtree is
      // only staged by the production workflow that builds it.
      console.log(`[stage-release-topology] skipping ${config.rollback.pass} rollback (RELEASE_ROLLBACK_DIST unset; preview topology)`);
    } else {
      throw new Error('RELEASE_ROLLBACK_DIST must be an absolute path to the Pass 63 rebuilt dist');
    }
  } else {
  const rollbackDist = resolve(configuredRollbackDist);
  const rollbackSourceSha = exactSha(config.rollback.sourceSha, 'rollback.sourceSha');
  const rollbackFiles = walkFiles(rollbackDist).filter((path) => path.endsWith('index.html') || path.includes(`${sep}assets${sep}`));
  if (!rollbackFiles.some((path) => path.endsWith('index.html'))
    || !rollbackFiles.some((path) => path.includes(`${sep}assets${sep}`))) {
    throw new Error(`${config.rollback.pass} rebuilt dist is incomplete`);
  }
  const rollbackRoot = channelRoot(config.rollback.path);
  for (const path of rollbackFiles) {
    const target = resolve(rollbackRoot, relative(rollbackDist, path));
    if (!target.startsWith(`${rollbackRoot}${sep}`)) throw new Error(`Unsafe rollback path: ${path}`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(path, target);
  }
  const rollbackEvidence = rollbackFiles.filter((path) => path.endsWith('.js') && readFileSync(path).includes(Buffer.from(config.rollback.pass)));
  if (rollbackEvidence.length === 0) throw new Error(`${config.rollback.pass} rebuilt dist does not contain ${config.rollback.pass}`);
  rollback = {
    schemaVersion: 4, channel: 'rollback', releasePass: config.rollback.pass,
    sourceSha: rollbackSourceSha, path: config.rollback.path,
    exactRootFileCount: rollbackFiles.length,
    treeSha256: treeDigest(rollbackRoot, rollbackFiles.map((path) => resolve(rollbackRoot, relative(rollbackDist, path)))),
    rebuiltFromSource: true, passEvidenceFiles: rollbackEvidence.map((path) => relative(rollbackRoot, resolve(rollbackRoot, relative(rollbackDist, path)))),
  };
  writeFileSync(join(rollbackRoot, 'channel-provenance.json'), `${JSON.stringify(rollback, null, 2)}\n`);
  }
}

for (const file of ['index.html', 'release-shell.css', 'release-shell.js']) {
  copyFileSync(join(repositoryRoot, 'release-shell', file), join(distRoot, file));
}
const publicConfig = Object.fromEntries(['experimental', 'stable', 'rollback'].filter((key) => config[key] && (key !== 'rollback' || rollback)).map((key) => [key, {
  label: config[key].label, description: config[key].description, pass: config[key].pass, path: config[key].path,
}]));
writeFileSync(join(distRoot, 'release-channel-config.js'), `window.__ATOMIC_ACRES_RELEASE_CHANNELS__=${JSON.stringify(publicConfig)};\n`);

mkdirSync(dirname(topologyReceiptPath), { recursive: true });
const topology = {
  schemaVersion: 4, sourceSha, releasePass,
  root: { kind: 'chooser-only', files: ['index.html', 'release-shell.css', 'release-shell.js', 'release-channel-config.js'] },
  channels: Object.fromEntries(Object.entries({ experimental, stable, rollback }).filter(([, channel]) => channel)),
};
writeFileSync(topologyReceiptPath, `${JSON.stringify(topology, null, 2)}\n`);
console.log(JSON.stringify({ releaseTopology: 'ok', sourceSha, channels: {
  experimental: { pass: experimental.releasePass, sourceSha, digest: experimental.treeSha256 },
  stable: { pass: stable.releasePass, pagesSha: stable.pagesSha, digest: stable.treeSha256 },
  ...(rollback ? { rollback: { pass: rollback.releasePass, sourceSha: rollback.sourceSha, digest: rollback.treeSha256 } } : {}),
} }));
