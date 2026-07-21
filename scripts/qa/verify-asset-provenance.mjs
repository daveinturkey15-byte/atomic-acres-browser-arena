import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve } from 'node:path';

const root = resolve(process.cwd());
const manifest = JSON.parse(await readFile(resolve(root, 'assets.manifest.json'), 'utf8'));
const expected = new Map();
const errors = [];
const textExtensions = new Set(['.json', '.md', '.txt', '.gltf', '.ts', '.mjs', '.js', '.py']);

function add(path, sha256, source) {
  if (typeof path !== 'string' || typeof sha256 !== 'string') return;
  if (!/^[a-f0-9]{64}$/i.test(sha256)) {
    errors.push(`${source}: invalid sha256`);
    return;
  }
  const current = expected.get(path);
  if (current && current.sha256 !== sha256.toLowerCase()) errors.push(`${path}: conflicting manifest digests`);
  expected.set(path, { sha256: sha256.toLowerCase(), source });
}

function walk(value, source = 'manifest') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${source}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  add(value.path, value.sha256, source);
  for (const [key, path] of Object.entries(value)) {
    if (typeof path !== 'string' || (!key.endsWith('Path') && !key.startsWith('source'))) continue;
    add(path, value[`${key}Sha256`], `${source}.${key}`);
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key !== 'path') walk(nested, `${source}.${key}`);
  }
}

walk(manifest);
for (const [path, record] of expected) {
  const absolute = resolve(root, path);
  const outside = relative(root, absolute).startsWith('..') || isAbsolute(relative(root, absolute));
  if (outside) {
    errors.push(`${path}: resolves outside repository root`);
    continue;
  }
  try {
    if (!(await stat(absolute)).isFile()) throw new Error('not a file');
    let bytes = await readFile(absolute);
    if (textExtensions.has(extname(path).toLowerCase())) {
      bytes = Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'), 'utf8');
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== record.sha256) errors.push(`${path}: expected ${record.sha256}, got ${actual}`);
  } catch (error) {
    errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ manifest: 'assets.manifest.json', provenance: 'ok', verifiedDigests: expected.size }));
}
