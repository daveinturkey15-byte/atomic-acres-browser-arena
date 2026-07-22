import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..', '..');
const config = JSON.parse(readFileSync(join(repositoryRoot, 'release-channels.json'), 'utf8'));
const pagesSha = config?.stable?.pagesSha;
const configuredPath = config?.stable?.path;

if (!/^[0-9a-f]{40}$/.test(pagesSha ?? '')) throw new Error('stable.pagesSha must be one exact 40-character Git SHA');
if (typeof configuredPath !== 'string' || !configuredPath || configuredPath.split('/').some((part) => !part || part === '.' || part === '..')) {
  throw new Error('stable.path must be a safe relative path');
}

const distRoot = join(repositoryRoot, 'dist');
if (!existsSync(join(distRoot, 'index.html'))) throw new Error('dist/index.html is missing; run npm run build first');

execFileSync('git', ['cat-file', '-e', `${pagesSha}^{commit}`], { cwd: repositoryRoot, stdio: 'pipe' });
const treeOutput = execFileSync(
  'git',
  ['ls-tree', '-r', '-z', '--name-only', pagesSha, '--', 'index.html', 'assets'],
  { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
const paths = treeOutput.split('\0').filter(Boolean);
if (!paths.includes('index.html') || !paths.some((path) => path.startsWith('assets/'))) {
  throw new Error(`Pinned Pages commit ${pagesSha} is not a complete root release`);
}

const targetRoot = resolve(distRoot, configuredPath);
if (!targetRoot.startsWith(`${distRoot}${sep}`)) throw new Error('Stable target escaped dist');
rmSync(targetRoot, { recursive: true, force: true });

const passEvidenceFiles = [];
for (const path of paths) {
  const target = resolve(targetRoot, path);
  if (!target.startsWith(`${targetRoot}${sep}`)) throw new Error(`Rejected unsafe Pages path: ${path}`);
  mkdirSync(dirname(target), { recursive: true });
  const blob = execFileSync('git', ['cat-file', 'blob', `${pagesSha}:${path}`], {
    cwd: repositoryRoot,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (path.endsWith('.js') && blob.includes(Buffer.from(config.stable.pass))) passEvidenceFiles.push(path);
  writeFileSync(target, blob);
}

const sourceSubject = execFileSync('git', ['show', '-s', '--format=%s', pagesSha], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
if (passEvidenceFiles.length === 0) throw new Error(`Pinned Pages tree does not contain configured stable pass ${config.stable.pass}`);
writeFileSync(join(targetRoot, 'channel-provenance.json'), `${JSON.stringify({
  schemaVersion: 1,
  channel: 'recent-stable',
  releasePass: config.stable.pass,
  pagesSha,
  sourceSubject,
  passEvidenceFiles,
  exactRootFileCount: paths.length,
}, null, 2)}\n`);

console.log(JSON.stringify({ stableChannel: 'ok', pagesSha, path: configuredPath, exactRootFiles: paths.length }));
