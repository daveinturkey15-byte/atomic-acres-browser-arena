import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifestPath = path.join(root, 'assets.manifest.json');
const publicAssetsRoot = path.join(root, 'public/assets');

const slash = (value) => value.split(path.sep).join('/');
const relative = (value) => slash(path.relative(root, value));
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(absolute));
    else if (entry.isFile()) files.push(relative(absolute));
  }
  return files.sort();
}

function wildcardPattern(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replaceAll('*', '.*').replaceAll('?', '.')}$`);
}

function declaredPublicPatterns(asset) {
  const declarations = [];
  const add = (value) => {
    if (typeof value === 'string' && value.startsWith('public/assets/')) declarations.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) add(typeof entry === 'object' && entry !== null ? entry.path : entry);
    }
  };
  add(asset.files);
  add(asset.contactSheet);
  add(asset.licenseFile);
  add(asset.provenanceFile);
  return declarations;
}

async function verifyHash(file, expected, label, failures) {
  if (!expected) return;
  const absolute = path.join(root, file);
  try {
    const actual = await sha256(absolute);
    if (actual !== expected) failures.push(`${label} hash mismatch: expected ${expected}, got ${actual}`);
  } catch (error) {
    failures.push(`${label} cannot be read: ${error.message}`);
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (!Array.isArray(manifest.assets)) throw new Error('assets.manifest.json must contain an assets array');

const publicFiles = await filesBelow(publicAssetsRoot);
const covered = new Set();
const failures = [];

for (const asset of manifest.assets) {
  const patterns = declaredPublicPatterns(asset);
  if (patterns.length === 0) failures.push(`${asset.id ?? '<missing id>'} declares no public asset path`);
  for (const pattern of patterns) {
    const matcher = wildcardPattern(pattern);
    const matches = publicFiles.filter((file) => matcher.test(file));
    if (matches.length === 0) failures.push(`${asset.id}: declaration matched no file: ${pattern}`);
    matches.forEach((file) => covered.add(file));
  }

  if (typeof asset.files === 'string' && !asset.files.includes('*') && !asset.files.includes('?')) {
    await verifyHash(asset.files, asset.sha256, `${asset.id}.files`, failures);
  }
  if (Array.isArray(asset.files)) {
    for (const entry of asset.files) {
      if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
        await verifyHash(entry.path, entry.sha256, `${asset.id}:${entry.path}`, failures);
      }
    }
  }
  for (const [pathField, hashField] of [
    ['sourceBlend', 'sourceBlendSha256'],
    ['sourceSpec', 'sourceSpecSha256'],
    ['sourceImage', 'sourceImageSha256'],
    ['sourceProvenance', 'sourceProvenanceSha256'],
    ['sourceScript', 'sourceScriptSha256'],
  ]) {
    if (typeof asset[pathField] === 'string') {
      try {
        if (!(await stat(path.join(root, asset[pathField]))).isFile()) failures.push(`${asset.id}.${pathField} is not a file`);
      } catch {
        failures.push(`${asset.id}.${pathField} missing: ${asset[pathField]}`);
      }
      await verifyHash(asset[pathField], asset[hashField], `${asset.id}.${pathField}`, failures);
    }
  }
}

const uncovered = publicFiles.filter((file) => !covered.has(file));
if (uncovered.length > 0) failures.push(`uncovered public assets:\n${uncovered.map((file) => `  - ${file}`).join('\n')}`);

if (failures.length > 0) {
  console.error(`Asset provenance verification FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Asset provenance verification passed: ${covered.size}/${publicFiles.length} public assets covered; declared hashes and versioned source inputs verified.`);
