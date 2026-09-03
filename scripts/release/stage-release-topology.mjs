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
const deploymentState = process.env.RELEASE_BUILT_AT?.trim() ? 'live' : 'candidate';
const TOPOLOGY_SCHEMA_VERSION = 5;
const PASS63_PREVIEW_PIN = Object.freeze({
  pagesSha: '46d366d188bfc5ebc5ee7a991fd52b792575316c',
  pagesPath: 'channels/pass63-rollback',
  runtimeFileCount: 119,
  runtimeTreeSha256: 'b7416e02c190d8ff0403a65cd7a7c894970507bc6a8de7b196cc2d7979d69bce',
});

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
if (config.schemaVersion !== TOPOLOGY_SCHEMA_VERSION) {
  throw new Error(`release-channels.json schemaVersion must be ${TOPOLOGY_SCHEMA_VERSION}`);
}
if (!/^PASS [1-9][0-9]*$/.test(config.experimental.pass) || config.experimental.label !== config.latest.label
  || !/^channels\/[a-z0-9-]+$/.test(config.experimental.path)) {
  throw new Error(`Experimental production topology must stage ${config.latest.label} at its own channel`);
}
if (config.stable.pass !== 'PASS 67.1' || config.stable.label !== 'STABLE SINGLEPLAYER') {
  throw new Error('Pass 67.1 must remain the approved-source stable singleplayer channel');
}
if (config.previous.pass !== 'PASS 72'
  || config.previous.sourceSha !== '5da686551d92387d08b00be40125386c391bb3ed'
  || config.previous.pagesSha !== 'd5b77dc3b9e46608264c52eb0737b50590d70eb5'
  || config.previous.pagesPath !== 'channels/the-big-one'
  || config.previous.runtimeFileCount !== 515
  || config.previous.runtimeTreeSha256 !== '62fafc5e5c39fa744dfc4f7067b3e0953dd190d8ffecc04e203b2b86d6a8974f'
  || config.previous.path !== 'channels/pass72-retained') {
  throw new Error('Previous Pass 72 must remain pinned to the exact previously live Pages runtime');
}
if (config.retained.pass !== 'PASS 70'
  || config.retained.sourceSha !== '130fd59bd2cf1e1719b802463219ddf36e2484d5'
  || config.retained.pagesSha !== '3b5e675c54eaea2a2dd721eca6f247c933361587'
  || config.retained.pagesPath !== 'channels/the-big-one'
  || config.retained.runtimeFileCount !== 515
  || config.retained.runtimeTreeSha256 !== 'c8f6aeed492cd747ef83aa41bdc0d05f2fd86264418d40d0ebbd0916c85d6160'
  || config.retained.path !== 'channels/pass70-retained') {
  throw new Error('Retained Pass 70 must remain pinned to the exact hosted Pages runtime');
}
if (config.historical.pass !== 'PASS 69'
  || config.historical.sourceSha !== '685ed7865018e107df5acf6cb6f7498b4468940c'
  || config.historical.pagesSha !== '71ec5616504d8e24241450742d01b25c1d6ff4e4'
  || config.historical.pagesPath !== 'channels/the-big-one'
  || config.historical.runtimeFileCount !== 515
  || config.historical.runtimeTreeSha256 !== '5ace26fdf83a4cf695d0075a40523f70e0d6fcee02cb6ae5b42666b6679107b9'
  || config.historical.path !== 'channels/pass69-retained') {
  throw new Error('Historical Pass 69 must remain pinned to the exact previously hosted Pages runtime');
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

// VALIDATE BEFORE MOVING. The pass-identity check below used to run AFTER the
// two renames, and `renameSync` is a move, not a copy: once index.html and
// assets/ had left the dist root, a throw here returned a tree that no longer
// satisfied the `candidate dist is incomplete` guard at the top of this script.
// The staging step was therefore not idempotent on failure - the second run
// failed for a different and more confusing reason than the first, and the only
// recovery was a full rebuild. The check reads the same bytes either side of a
// rename, so hoisting it costs nothing and makes the failure non-destructive.
const candidateJs = walkFiles(join(distRoot, 'assets')).filter((path) => path.endsWith('.js'));
if (!candidateJs.some((path) => readFileSync(path).includes(Buffer.from(config.experimental.pass)))) {
  throw new Error(`Experimental candidate does not contain ${config.experimental.pass}`);
}

mkdirSync(experimentalRoot, { recursive: true });
renameSync(join(distRoot, 'index.html'), join(experimentalRoot, 'index.html'));
renameSync(join(distRoot, 'assets'), join(experimentalRoot, 'assets'));
// MAP3 (HF-409): the Map 3 showcase page is a second build input, so vite emits
// it beside index.html at the dist root with `./assets/...` links. Those links
// only resolve inside the candidate channel, which is where index.html and the
// assets directory just went - without this move /map3.html is served with a
// 200 and every one of its chunks 404s, and the page never leaves its
// "Starting Map 3..." banner. Measured: 9 x 404, banner still up after 180 s.
//
// `existsSync` rather than an unconditional move: the pinned historical
// channels this script also stages were built before map3.html was an input,
// and a rebuild of one of those must not fail for want of a page it never had.
if (existsSync(join(distRoot, 'map3.html'))) {
  renameSync(join(distRoot, 'map3.html'), join(experimentalRoot, 'map3.html'));
}

function stagePinned(channelName, channel) {
  const pagesSha = exactSha(channel.pagesSha, `${channelName}.pagesSha`);
  const pinnedSourceSha = exactSha(channel.sourceSha, `${channelName}.sourceSha`);
  const pagesPath = channel.pagesPath ? safePath(channel.pagesPath, `${channelName}.pagesPath`) : '';
  execFileSync('git', ['cat-file', '-e', `${pagesSha}^{commit}`], { cwd: repositoryRoot, stdio: 'pipe' });
  const sourceSubject = execFileSync('git', ['show', '-s', '--format=%s', pagesSha], {
    cwd: repositoryRoot, encoding: 'utf8',
  }).trim();
  const sourceSubjectAttests = sourceSubject.includes(channel.pass) && sourceSubject.includes(pinnedSourceSha);
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
  if (!sourceSubjectAttests && !pinnedRuntime) {
    throw new Error(`${channelName} Pages commit does not attest ${channel.pass} from ${pinnedSourceSha}`);
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
    schemaVersion: TOPOLOGY_SCHEMA_VERSION, channel: channelName, releasePass: channel.pass,
    pagesSha, pagesPath: pagesPath || '.', sourceSha: pinnedSourceSha, sourceSubject, path: channel.path,
    exactRootFileCount: paths.length, passEvidenceFiles, treeSha256: digest, pinnedRuntime,
  };
  const provenanceFile = paths.includes('channel-provenance.json')
    ? 'pinned-channel-provenance.json'
    : 'channel-provenance.json';
  writeFileSync(join(targetRoot, provenanceFile), `${JSON.stringify(provenance, null, 2)}\n`);
  return { ...provenance, provenanceFile };
}

function stageRebuilt(channelName, channel, configuredDist, releasedAt) {
  if (!configuredDist || !isAbsolute(configuredDist)) {
    throw new Error(`RELEASE_STABLE_DIST must be an absolute path to the ${channel.pass} rebuilt dist`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(releasedAt ?? '')
    || Number.isNaN(Date.parse(releasedAt))) {
    throw new Error('STABLE_RELEASED_AT must be one strict UTC ISO-8601 instant');
  }
  const rebuiltDist = resolve(configuredDist);
  const rebuiltSourceSha = exactSha(channel.sourceSha, `${channelName}.sourceSha`);
  const rebuiltFiles = walkFiles(rebuiltDist)
    .filter((path) => path.endsWith('index.html') || path.includes(`${sep}assets${sep}`));
  if (!rebuiltFiles.some((path) => path.endsWith('index.html'))
    || !rebuiltFiles.some((path) => path.includes(`${sep}assets${sep}`))) {
    throw new Error(`${channel.pass} rebuilt stable dist is incomplete`);
  }
  const targetRoot = channelRoot(channel.path);
  mkdirSync(targetRoot, { recursive: true });
  for (const path of rebuiltFiles) {
    const target = resolve(targetRoot, relative(rebuiltDist, path));
    if (!target.startsWith(`${targetRoot}${sep}`)) throw new Error(`Unsafe rebuilt stable path: ${path}`);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(path, target);
  }
  const passEvidenceFiles = rebuiltFiles
    .filter((path) => path.endsWith('.js') && readFileSync(path).includes(Buffer.from(channel.pass)));
  const sourceEvidenceFiles = rebuiltFiles
    .filter((path) => path.endsWith('.js') && readFileSync(path).includes(Buffer.from(rebuiltSourceSha)));
  if (passEvidenceFiles.length === 0) throw new Error(`${channel.pass} rebuilt stable dist does not contain its pass identity`);
  if (sourceEvidenceFiles.length === 0) throw new Error(`${channel.pass} rebuilt stable dist does not contain its source SHA`);
  const provenance = {
    schemaVersion: TOPOLOGY_SCHEMA_VERSION,
    channel: channelName,
    releasePass: channel.pass,
    sourceSha: rebuiltSourceSha,
    path: channel.path,
    exactRootFileCount: rebuiltFiles.length,
    treeSha256: treeDigest(targetRoot, rebuiltFiles.map((path) => resolve(targetRoot, relative(rebuiltDist, path)))),
    rebuiltFromSource: true,
    releasedAt,
    originalPagesSha: exactSha(channel.pagesSha, `${channelName}.pagesSha`),
    originalPagesPath: channel.pagesPath,
    passEvidenceFiles: passEvidenceFiles.map((path) => relative(rebuiltDist, path).replaceAll('\\', '/')),
    sourceEvidenceFiles: sourceEvidenceFiles.map((path) => relative(rebuiltDist, path).replaceAll('\\', '/')),
  };
  writeFileSync(join(targetRoot, 'channel-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  return { ...provenance, provenanceFile: 'channel-provenance.json' };
}

const configuredStableDist = process.env.RELEASE_STABLE_DIST;
const stableRebuildRequired = process.env.REQUIRE_STABLE_RELEASE_TIMESTAMP === '1';
if (stableRebuildRequired && (!configuredStableDist || !isAbsolute(configuredStableDist))) {
  throw new Error('Production topology requires RELEASE_STABLE_DIST');
}
const stable = configuredStableDist
  ? stageRebuilt('recent-stable', config.stable, configuredStableDist, process.env.STABLE_RELEASED_AT)
  : stagePinned('recent-stable', config.stable);
const previous = stagePinned('pass72-retained', config.previous);
const retained = stagePinned('pass70-retained', config.retained);
const historical = stagePinned('pass69-retained', config.historical);
const experimentalFiles = walkFiles(experimentalRoot);
const experimental = {
  schemaVersion: TOPOLOGY_SCHEMA_VERSION, channel: liveChannelId, releasePass,
  sourceSha, path: config.experimental.path,
  exactRootFileCount: experimentalFiles.length,
  treeSha256: treeDigest(experimentalRoot, experimentalFiles),
};
writeFileSync(join(experimentalRoot, 'channel-provenance.json'), `${JSON.stringify(experimental, null, 2)}\n`);

let rollback = null;
if (config.rollback) {
  // The Pass 63 rollback is a deterministic rebuild from its approved source
  // SHA and staged from a separately built subtree (RELEASE_ROLLBACK_DIST) in
  // production. Browser previews reuse the exact currently hosted subtree.
  // Provenance remains explicit in both cases.
  const configuredRollbackDist = process.env.RELEASE_ROLLBACK_DIST;
  const rollbackReleasedAt = process.env.ROLLBACK_RELEASED_AT?.trim();
  const rollbackRequired = process.env.REQUIRE_ROLLBACK_CHANNEL === '1';
  if (!configuredRollbackDist || !isAbsolute(configuredRollbackDist)) {
    if (!rollbackRequired) {
      // Browser-QA previews pin the exact currently hosted Pass 63 subtree so
      // the selectable rollback is exercised without rebuilding historical code.
      // Production still supplies RELEASE_ROLLBACK_DIST and stages the separate
      // source-bound rebuild below.
      rollback = stagePinned('rollback', { ...config.rollback, ...PASS63_PREVIEW_PIN });
    } else {
      throw new Error('RELEASE_ROLLBACK_DIST must be an absolute path to the Pass 63 rebuilt dist');
    }
  } else {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(rollbackReleasedAt ?? '')
    || Number.isNaN(Date.parse(rollbackReleasedAt))) {
    throw new Error('ROLLBACK_RELEASED_AT must be one strict UTC ISO-8601 instant');
  }
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
    schemaVersion: TOPOLOGY_SCHEMA_VERSION, channel: 'rollback', releasePass: config.rollback.pass,
    sourceSha: rollbackSourceSha, path: config.rollback.path,
    exactRootFileCount: rollbackFiles.length,
    treeSha256: treeDigest(rollbackRoot, rollbackFiles.map((path) => resolve(rollbackRoot, relative(rollbackDist, path)))),
    rebuiltFromSource: true,
    releasedAt: rollbackReleasedAt,
    originalPagesSha: exactSha(config.rollback.pagesSha, 'rollback.pagesSha'),
    originalPagesPath: config.rollback.pagesPath,
    passEvidenceFiles: rollbackEvidence.map((path) => relative(rollbackRoot, resolve(rollbackRoot, relative(rollbackDist, path)))),
  };
  writeFileSync(join(rollbackRoot, 'channel-provenance.json'), `${JSON.stringify(rollback, null, 2)}\n`);
  }
}

for (const file of ['index.html', 'release-shell.css', 'release-shell.js']) {
  copyFileSync(join(repositoryRoot, 'release-shell', file), join(distRoot, file));
}
const publicConfig = {
  experimental: {
    label: config.experimental.label,
    // LANE AD (PASS 87): both strings named "Pass 73" - the pass this file was last edited
    // for - so every chooser card the staging step produced from the pass80 cut onwards
    // described the live build as Pass 73 while the card beside it was stamped PASS 86. The
    // live copy is the config's own description; the candidate sentence is derived from the
    // stamped pass and keeps its exact publication-disabled wording.
    description: deploymentState === 'live'
      ? config.experimental.description
      : `The local ${config.experimental.pass} mechanically gated candidate. `
        + 'Publication remains disabled until exact preview binding.',
    pass: config.experimental.pass,
    path: config.experimental.path,
    deploymentState,
  },
  previous: {
    label: config.previous.label,
    description: config.previous.description,
    pass: config.previous.pass,
    path: config.previous.path,
  },
  retained: {
    label: config.retained.label,
    description: config.retained.description,
    pass: config.retained.pass,
    path: config.retained.path,
  },
  historical: {
    label: config.historical.label,
    description: config.historical.description,
    pass: config.historical.pass,
    path: config.historical.path,
  },
  ...(rollback ? {
    stable: {
      label: config.rollback.label,
      description: config.rollback.description,
      pass: config.rollback.pass,
      path: config.rollback.path,
    },
  } : {}),
};
writeFileSync(join(distRoot, 'release-channel-config.js'), `window.__ATOMIC_ACRES_RELEASE_CHANNELS__=${JSON.stringify(publicConfig)};\n`);

mkdirSync(dirname(topologyReceiptPath), { recursive: true });
const topology = {
  schemaVersion: TOPOLOGY_SCHEMA_VERSION, sourceSha, releasePass,
  root: { kind: 'chooser-only', files: ['index.html', 'release-shell.css', 'release-shell.js', 'release-channel-config.js'] },
  channels: Object.fromEntries(Object.entries({ experimental, previous, retained, historical, stable, rollback })
    .filter(([, channel]) => channel)),
};
writeFileSync(topologyReceiptPath, `${JSON.stringify(topology, null, 2)}\n`);
console.log(JSON.stringify({ releaseTopology: 'ok', sourceSha, channels: {
  experimental: { pass: experimental.releasePass, sourceSha, digest: experimental.treeSha256 },
  previous: { pass: previous.releasePass, pagesSha: previous.pagesSha, digest: previous.treeSha256 },
  retained: { pass: retained.releasePass, pagesSha: retained.pagesSha, digest: retained.treeSha256 },
  historical: { pass: historical.releasePass, pagesSha: historical.pagesSha, digest: historical.treeSha256 },
  stable: { pass: stable.releasePass, pagesSha: stable.pagesSha, digest: stable.treeSha256 },
  ...(rollback ? { rollback: { pass: rollback.releasePass, sourceSha: rollback.sourceSha, digest: rollback.treeSha256 } } : {}),
} }));
