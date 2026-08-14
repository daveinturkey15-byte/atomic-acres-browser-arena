import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_BASELINE = Object.freeze({
  sourceSha: '130fd59bd2cf1e1719b802463219ddf36e2484d5',
  pagesSha: 'ecd683116163b4940566f82f7edb87ed9c964cb6',
  pagesPath: 'channels/the-big-one',
  runtimeFileCount: 515,
  runtimeTreeSha256: '1a0e90676ffc411eaefeaebef0c970481aad416084a1dc21e9bf7de6de369196',
  guardPolicySha256: 'bca3777642a18a0e759367548f5f42b59f24e6d569511a89931af06cbc91890b',
});

const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_RECORD_PATH = join(SCRIPT_ROOT, 'baselines', 'pass70', 'atomic-acres-quality.json');
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const BLOB_CACHE = new Map();

function git(root, args, encoding = null) {
  return execFileSync('git', args, {
    cwd: root,
    encoding,
    maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function qualityGuardPolicy(record) {
  return {
    sourceFileTreeSha256: record.sourceFileTreeSha256,
    protectedSourceFiles: record.protectedSourceFiles,
    auditedSourceVariants: record.auditedSourceVariants,
    protectedSourceSets: record.protectedSourceSets,
    protectedManifestEntries: record.protectedManifestEntries,
    runtimeAssetMappings: record.runtimeAssetMappings,
    runtimeAssetTreeSha256: record.runtimeAssetTreeSha256,
    arenaGlb: record.arenaGlb,
    semanticDeclarationParity: record.semanticDeclarationParity,
    semanticFunctionParity: record.semanticFunctionParity,
    semanticMethodParity: record.semanticMethodParity,
    semanticTokenParity: record.semanticTokenParity,
    pagesBundleTokens: record.pagesBundleTokens,
    candidateBundleTokens: record.candidateBundleTokens,
    allowedRendererOptimization: record.allowedRendererOptimization,
  };
}

function lexicalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function treeDigest(entries) {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((left, right) => lexicalCompare(left.path, right.path))) {
    hash.update(entry.path.replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(entry.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function gitObjectExists(root, object) {
  try {
    git(root, ['cat-file', '-e', object]);
    return true;
  } catch {
    return false;
  }
}

function blobAt(root, commit, path) {
  const key = `${resolve(root)}\0${commit}:${path}`;
  if (!BLOB_CACHE.has(key)) BLOB_CACHE.set(key, git(root, ['cat-file', 'blob', `${commit}:${path}`]));
  return BLOB_CACHE.get(key);
}

function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

function blobsAt(root, commit, paths) {
  const missing = paths.filter((path) => !BLOB_CACHE.has(`${resolve(root)}\0${commit}:${path}`));
  if (missing.length > 0) {
    const output = execFileSync('git', ['cat-file', '--batch'], {
      cwd: root,
      input: Buffer.from(`${missing.map((path) => `${commit}:${path}`).join('\n')}\n`),
      encoding: null,
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let offset = 0;
    for (const path of missing) {
      const headerEnd = output.indexOf(0x0a, offset);
      if (headerEnd < 0) throw new Error(`missing cat-file header for ${path}`);
      const header = output.toString('utf8', offset, headerEnd);
      const fields = header.split(' ');
      if (fields.at(-1) === 'missing' || fields.length !== 3 || fields[1] !== 'blob') {
        throw new Error(`expected Git blob ${commit}:${path}; received ${header}`);
      }
      const size = Number(fields[2]);
      if (!Number.isSafeInteger(size) || size < 0) throw new Error(`invalid Git blob size for ${path}`);
      const start = headerEnd + 1;
      const end = start + size;
      if (end >= output.length || output[end] !== 0x0a) throw new Error(`truncated Git blob for ${path}`);
      BLOB_CACHE.set(`${resolve(root)}\0${commit}:${path}`, Buffer.from(output.subarray(start, end)));
      offset = end + 1;
    }
    if (offset !== output.length) throw new Error('unexpected trailing Git cat-file output');
  }
  return paths.map((path) => blobAt(root, commit, path));
}

function listGitFiles(root, commit, path) {
  return git(root, ['ls-tree', '-r', '-z', '--name-only', commit, '--', path], 'utf8')
    .split('\0')
    .filter(Boolean)
    .sort();
}

function normalizeEol(value) {
  return value.replace(/\r\n?/gu, '\n');
}

/** Extract one named function without relying on checkout TypeScript packages. */
export function extractFunctionDeclaration(source, name) {
  const normalized = normalizeEol(source);
  const match = new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\(`, 'u').exec(normalized);
  if (!match) throw new Error(`missing function declaration ${name}`);
  const openingBrace = normalized.indexOf('{', match.index);
  if (openingBrace < 0) throw new Error(`missing function body ${name}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return normalized.slice(match.index, index + 1);
  }
  throw new Error(`unterminated function body ${name}`);
}

/** Extract one const declaration, including a typed or nested initializer. */
export function extractConstDeclaration(source, name) {
  const normalized = normalizeEol(source);
  const match = new RegExp(`(?:export\\s+)?const\\s+${name}\\b`, 'u').exec(normalized);
  if (!match) throw new Error(`missing const declaration ${name}`);
  let braces = 0;
  let brackets = 0;
  let parentheses = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = match.index; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '{') braces += 1;
    else if (character === '}') braces -= 1;
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets -= 1;
    else if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === ';' && braces === 0 && brackets === 0 && parentheses === 0) {
      return normalized.slice(match.index, index + 1);
    }
  }
  throw new Error(`unterminated const declaration ${name}`);
}

/** Extract one two-space-indented TypeScript class method. */
export function extractClassMethod(source, className, name) {
  const normalized = normalizeEol(source);
  const classMatch = new RegExp(`(?:export\\s+)?class\\s+${className}\\b`, 'u').exec(normalized);
  if (!classMatch) throw new Error(`missing class ${className}`);
  const classOpeningBrace = normalized.indexOf('{', classMatch.index);
  const methodMatch = new RegExp(`\\n  (?:(?:public|private|protected|static|async|readonly)\\s+)*${name}\\s*\\(`, 'u')
    .exec(normalized.slice(classOpeningBrace));
  if (!methodMatch) throw new Error(`missing method ${className}#${name}`);
  const methodStart = classOpeningBrace + methodMatch.index + 1;
  const openingBrace = normalized.indexOf('{', methodStart);
  if (openingBrace < 0) throw new Error(`missing method body ${className}#${name}`);
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openingBrace; index < normalized.length; index += 1) {
    const character = normalized[index];
    const next = normalized[index + 1];
    if (lineComment) {
      if (character === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') quote = character;
    else if (character === '{') depth += 1;
    else if (character === '}' && --depth === 0) return normalized.slice(methodStart, index + 1);
  }
  throw new Error(`unterminated method ${className}#${name}`);
}

function parseGlb(buffer) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') throw new Error('arena asset is not a GLB');
  if (buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) throw new Error('arena GLB header is invalid');
  const jsonLength = buffer.readUInt32LE(12);
  if (buffer.toString('ascii', 16, 20) !== 'JSON' || 20 + jsonLength > buffer.length) throw new Error('arena GLB JSON chunk is invalid');
  return JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).trimEnd());
}

function textureIndex(value) {
  return Number.isInteger(value?.index) ? value.index : null;
}

export function glbSceneSignature(buffer) {
  const gltf = parseGlb(buffer);
  const bufferViews = Array.isArray(gltf.bufferViews) ? gltf.bufferViews : [];
  const atomicExtras = (extras) => Object.fromEntries(Object.entries(extras ?? {})
    .filter(([key]) => key.startsWith('atomic_'))
    .sort(([left], [right]) => lexicalCompare(left, right)));
  return {
    assetVersion: gltf.asset?.version ?? null,
    extensionsUsed: [...(gltf.extensionsUsed ?? [])].sort(),
    counts: {
      scenes: gltf.scenes?.length ?? 0,
      nodes: gltf.nodes?.length ?? 0,
      meshes: gltf.meshes?.length ?? 0,
      materials: gltf.materials?.length ?? 0,
      textures: gltf.textures?.length ?? 0,
      images: gltf.images?.length ?? 0,
    },
    materials: (gltf.materials ?? []).map((material) => ({
      name: material.name ?? null,
      alphaMode: material.alphaMode ?? 'OPAQUE',
      doubleSided: material.doubleSided === true,
      baseColorTexture: textureIndex(material.pbrMetallicRoughness?.baseColorTexture),
      metallicRoughnessTexture: textureIndex(material.pbrMetallicRoughness?.metallicRoughnessTexture),
      normalTexture: textureIndex(material.normalTexture),
      occlusionTexture: textureIndex(material.occlusionTexture),
      emissiveTexture: textureIndex(material.emissiveTexture),
    })),
    images: (gltf.images ?? []).map((image) => ({
      name: image.name ?? null,
      mimeType: image.mimeType ?? null,
      embedded: Number.isInteger(image.bufferView),
      byteLength: Number.isInteger(image.bufferView) ? bufferViews[image.bufferView]?.byteLength ?? null : null,
      uri: image.uri ?? null,
    })),
    nodes: (gltf.nodes ?? []).map((node) => ({
      name: node.name ?? null,
      mesh: Number.isInteger(node.mesh) ? node.mesh : null,
      extras: atomicExtras(node.extras),
    })),
  };
}

function directFiles(directory, extension) {
  if (!existsSync(directory) || !statSync(directory).isDirectory()) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name)
    .sort();
}

function relativeBelow(prefix, path) {
  if (!path.startsWith(`${prefix}/`)) throw new Error(`${path} is outside ${prefix}`);
  return path.slice(prefix.length + 1);
}

function countToken(source, token) {
  return source.split(token).length - 1;
}

function runtimeTreeEntries(root, record) {
  const all = listGitFiles(root, record.pagesSha, record.pagesPath);
  const provenancePath = `${record.pagesPath}/channel-provenance.json`;
  const runtimePaths = all.filter((path) => path !== provenancePath);
  const runtimeBlobs = blobsAt(root, record.pagesSha, runtimePaths);
  const runtime = runtimePaths.map((path, index) => ({
    path: relativeBelow(record.pagesPath, path), bytes: runtimeBlobs[index],
  }));
  return { all, runtime, provenancePath };
}

function readManifestEntry(bytes, id) {
  const manifest = JSON.parse(bytes.toString('utf8'));
  const matches = (manifest.assets ?? []).filter((entry) => entry.id === id);
  if (matches.length !== 1) throw new Error(`manifest must contain exactly one ${id} entry; found ${matches.length}`);
  return matches[0];
}

function candidateBundleBytes(candidateDist) {
  const assets = join(candidateDist, 'assets');
  if (!existsSync(assets)) return Buffer.alloc(0);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.name.endsWith('.js')) files.push(path);
    }
  };
  visit(assets);
  return Buffer.concat(files.sort().map((path) => readFileSync(path)));
}

export function deriveAtomicQualityBaseline(root, record) {
  const sourceFiles = record.protectedSourceFiles.map((path) => ({
    path,
    bytes: blobAt(root, record.sourceSha, path),
  }));
  const texture = record.protectedSourceSets[0];
  const baselineTexturePaths = listGitFiles(root, record.sourceSha, texture.path)
    .filter((path) => !relativeBelow(texture.path, path).includes('/') && path.endsWith(texture.extension));
  const textureEntries = baselineTexturePaths.map((path) => ({ path, bytes: blobAt(root, record.sourceSha, path) }));
  const manifestEntries = Object.fromEntries(record.protectedManifestEntries.map(({ path, id }) => {
    const entry = readManifestEntry(blobAt(root, record.sourceSha, path), id);
    return [id, sha256(Buffer.from(canonicalJson(entry)))];
  }));
  const glb = blobAt(root, record.sourceSha, record.arenaGlb.sourcePath);
  const auditedSourceVariants = Object.fromEntries(record.auditedSourceVariants.map(({ path }) => [
    path,
    sha256(blobAt(root, record.sourceSha, path)),
  ]));
  const runtimeAssets = [
    ...record.runtimeAssetMappings.map(({ sourcePath }) => sourcePath),
    ...baselineTexturePaths,
  ].map((path) => ({ path, bytes: blobAt(root, record.sourceSha, path) }));
  return {
    sourceFileTreeSha256: treeDigest(sourceFiles),
    textureFileCount: textureEntries.length,
    textureTreeSha256: treeDigest(textureEntries),
    auditedSourceVariants,
    manifestEntries,
    arenaSceneSignatureSha256: sha256(Buffer.from(canonicalJson(glbSceneSignature(glb)))),
    runtimeAssetTreeSha256: treeDigest(runtimeAssets),
  };
}

export function verifyAtomicQualityBaseline({
  root = SCRIPT_ROOT,
  recordPath = DEFAULT_RECORD_PATH,
  candidateDist = null,
} = {}) {
  const repositoryRoot = resolve(root);
  const record = JSON.parse(readFileSync(recordPath, 'utf8'));
  const problems = [];
  const check = (condition, message) => { if (!condition) problems.push(message); };
  const guarded = (label, callback) => {
    try { return callback(); } catch (error) {
      problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  check(record.schemaVersion === 1, 'baseline schemaVersion must be 1');
  check(record.releasePass === 'PASS 70' && record.immutable === true, 'baseline must be immutable PASS 70');
  for (const [field, expected] of Object.entries(REQUIRED_BASELINE)) {
    check(record[field] === expected, `${field} must remain pinned to the audited Pass 70 value`);
  }
  check(
    sha256(Buffer.from(canonicalJson(qualityGuardPolicy(record)))) === REQUIRED_BASELINE.guardPolicySha256,
    'Atomic Quality guard policy drift; the protected contract may not be weakened through record edits',
  );
  check(SHA40.test(record.sourceSha ?? '') && SHA40.test(record.pagesSha ?? ''), 'baseline Git identities must be exact lowercase SHAs');
  check(SHA256.test(record.runtimeTreeSha256 ?? ''), 'baseline runtime digest must be lowercase SHA-256');
  check(gitObjectExists(repositoryRoot, `${record.sourceSha}^{commit}`), 'immutable Pass 70 source commit is unavailable');
  check(gitObjectExists(repositoryRoot, `${record.pagesSha}^{commit}`), 'immutable Pass 70 Pages commit is unavailable');
  const candidateSha = guarded('candidate identity', () => git(repositoryRoot, ['rev-parse', 'HEAD'], 'utf8').trim());
  if (candidateSha) {
    const ancestor = guarded('source ancestry', () => {
      try { git(repositoryRoot, ['merge-base', '--is-ancestor', record.sourceSha, candidateSha]); return true; } catch { return false; }
    });
    check(ancestor === true, 'candidate is not descended from the immutable Pass 70 source');
  }

  const runtime = guarded('Pages runtime', () => runtimeTreeEntries(repositoryRoot, record));
  let pagesProvenance = null;
  if (runtime) {
    check(runtime.all.includes(runtime.provenancePath), 'Pass 70 Pages subtree is missing channel-provenance.json');
    check(runtime.runtime.length === record.runtimeFileCount, `Pass 70 Pages runtime count ${runtime.runtime.length} != ${record.runtimeFileCount}`);
    check(treeDigest(runtime.runtime) === record.runtimeTreeSha256, 'Pass 70 Pages runtime digest mismatch');
    check(runtime.runtime.some(({ path }) => path === 'index.html'), 'Pass 70 Pages subtree has no index.html');
    check(runtime.runtime.some(({ path }) => path.startsWith('assets/')), 'Pass 70 Pages subtree has no assets');
    pagesProvenance = guarded('Pages provenance', () => JSON.parse(blobAt(repositoryRoot, record.pagesSha, runtime.provenancePath).toString('utf8')));
    if (pagesProvenance) {
      check(pagesProvenance.releasePass === record.releasePass, 'Pages provenance release pass mismatch');
      check(pagesProvenance.sourceSha === record.sourceSha, 'Pages provenance source SHA mismatch');
      check(pagesProvenance.path === record.pagesPath, 'Pages provenance path mismatch');
      check(pagesProvenance.exactRootFileCount === record.runtimeFileCount, 'Pages provenance runtime count mismatch');
      check(pagesProvenance.treeSha256 === record.runtimeTreeSha256, 'Pages provenance runtime digest mismatch');
    }
    const pagesBundle = Buffer.concat(runtime.runtime.filter(({ path }) => path.endsWith('.js')).map(({ bytes }) => bytes));
    for (const token of record.pagesBundleTokens) {
      check(pagesBundle.includes(Buffer.from(token)), `Pass 70 Pages bundle is missing ${JSON.stringify(token)}`);
    }
  }

  const derived = guarded('derived immutable baseline', () => deriveAtomicQualityBaseline(repositoryRoot, record));
  if (derived) {
    check(derived.sourceFileTreeSha256 === record.sourceFileTreeSha256, 'protected source-file baseline digest mismatch');
    const texture = record.protectedSourceSets[0];
    check(derived.textureFileCount === texture.fileCount, `baseline texture count ${derived.textureFileCount} != ${texture.fileCount}`);
    check(derived.textureTreeSha256 === texture.treeSha256, 'baseline texture-set digest mismatch');
    check(derived.arenaSceneSignatureSha256 === record.arenaGlb.sceneSignatureSha256, 'baseline arena scene signature mismatch');
    check(derived.runtimeAssetTreeSha256 === record.runtimeAssetTreeSha256, 'baseline runtime-asset digest mismatch');
    for (const { path, baselineGitBlobSha, baselineSha256 } of record.auditedSourceVariants) {
      check(derived.auditedSourceVariants[path] === baselineSha256, `audited source baseline digest mismatch: ${path}`);
      check(gitBlobSha(blobAt(repositoryRoot, record.sourceSha, path)) === baselineGitBlobSha, `audited source baseline Git blob mismatch: ${path}`);
    }
    for (const { id, canonicalSha256 } of record.protectedManifestEntries) {
      check(derived.manifestEntries[id] === canonicalSha256, `baseline manifest entry ${id} digest mismatch`);
    }
  }

  let protectedFileCount = 0;
  for (const path of record.protectedSourceFiles) {
    guarded(`protected source ${path}`, () => {
      const expected = blobAt(repositoryRoot, record.sourceSha, path);
      const candidatePath = resolve(repositoryRoot, path);
      check(candidatePath.startsWith(`${repositoryRoot}${sep}`) && existsSync(candidatePath), `candidate is missing protected source ${path}`);
      if (existsSync(candidatePath)) check(readFileSync(candidatePath).equals(expected), `protected source drift: ${path}`);
      protectedFileCount += 1;
    });
  }

  let auditedSourceVariantCount = 0;
  for (const specification of record.auditedSourceVariants) {
    guarded(`audited source variant ${specification.path}`, () => {
      check(SHA256.test(specification.baselineSha256 ?? ''), `audited source baseline digest is invalid: ${specification.path}`);
      check(SHA40.test(specification.baselineGitBlobSha ?? ''), `audited source baseline Git blob is invalid: ${specification.path}`);
      const baseline = blobAt(repositoryRoot, record.sourceSha, specification.path);
      check(sha256(baseline) === specification.baselineSha256, `audited source baseline digest mismatch: ${specification.path}`);
      check(gitBlobSha(baseline) === specification.baselineGitBlobSha, `audited source baseline Git blob mismatch: ${specification.path}`);
      const candidatePath = resolve(repositoryRoot, specification.path);
      check(candidatePath.startsWith(`${repositoryRoot}${sep}`) && existsSync(candidatePath), `candidate is missing audited source ${specification.path}`);
      if (!existsSync(candidatePath)) return;
      const candidate = readFileSync(candidatePath);
      const candidateDigest = sha256(candidate);
      const allowed = specification.allowedVariants.find((variant) => variant.sha256 === candidateDigest);
      const baselineVariant = candidateDigest === specification.baselineSha256;
      check(baselineVariant || allowed !== undefined, `unaudited source drift: ${specification.path}`);
      if (allowed) {
        check(SHA40.test(allowed.auditSourceSha ?? ''), `audited source variant commit is invalid: ${specification.path}`);
        check(SHA40.test(allowed.gitBlobSha ?? ''), `audited source variant Git blob is invalid: ${specification.path}`);
        check(SHA256.test(allowed.sha256 ?? ''), `audited source variant digest is invalid: ${specification.path}`);
        check(typeof allowed.classification === 'string' && allowed.classification.length > 0, `audited source variant classification is missing: ${specification.path}`);
        check(gitObjectExists(repositoryRoot, `${allowed.auditSourceSha}^{commit}`), `audited source variant commit is unavailable: ${allowed.auditSourceSha}`);
        if (gitObjectExists(repositoryRoot, `${allowed.auditSourceSha}:${specification.path}`)) {
          check(blobAt(repositoryRoot, allowed.auditSourceSha, specification.path).equals(candidate), `audited source variant does not match ${allowed.auditSourceSha}: ${specification.path}`);
          check(gitBlobSha(candidate) === allowed.gitBlobSha, `audited source variant Git blob mismatch: ${specification.path}`);
        } else {
          check(false, `audited source variant blob is unavailable: ${allowed.auditSourceSha}:${specification.path}`);
        }
      }
      auditedSourceVariantCount += 1;
    });
  }

  let textureFileCount = 0;
  for (const set of record.protectedSourceSets) {
    guarded(`protected source set ${set.path}`, () => {
      const baselinePaths = listGitFiles(repositoryRoot, record.sourceSha, set.path)
        .filter((path) => !relativeBelow(set.path, path).includes('/') && path.endsWith(set.extension));
      const candidateNames = directFiles(resolve(repositoryRoot, set.path), set.extension);
      const baselineNames = baselinePaths.map((path) => relativeBelow(set.path, path));
      check(JSON.stringify(candidateNames) === JSON.stringify(baselineNames), `protected source set membership drift: ${set.path}`);
      for (const path of baselinePaths) {
        const name = relativeBelow(set.path, path);
        const expected = blobAt(repositoryRoot, record.sourceSha, path);
        const candidatePath = resolve(repositoryRoot, set.path, name);
        if (existsSync(candidatePath)) check(readFileSync(candidatePath).equals(expected), `protected texture drift: ${path}`);
        const pagesPath = `${set.pagesPath}/${name}`;
        check(blobAt(repositoryRoot, record.pagesSha, pagesPath).equals(expected), `Pass 70 Pages texture differs from source: ${path}`);
      }
      textureFileCount += baselinePaths.length;
    });
  }

  for (const { path, id, canonicalSha256 } of record.protectedManifestEntries) {
    guarded(`manifest entry ${id}`, () => {
      const baseline = readManifestEntry(blobAt(repositoryRoot, record.sourceSha, path), id);
      const candidate = readManifestEntry(readFileSync(resolve(repositoryRoot, path)), id);
      check(canonicalJson(candidate) === canonicalJson(baseline), `protected manifest entry drift: ${id}`);
      check(sha256(Buffer.from(canonicalJson(candidate))) === canonicalSha256, `candidate manifest entry digest mismatch: ${id}`);
    });
  }

  let runtimeAssetCount = 0;
  for (const mapping of record.runtimeAssetMappings) {
    guarded(`runtime asset ${mapping.sourcePath}`, () => {
      const baseline = blobAt(repositoryRoot, record.sourceSha, mapping.sourcePath);
      const candidatePath = resolve(repositoryRoot, mapping.sourcePath);
      check(existsSync(candidatePath), `candidate runtime asset missing: ${mapping.sourcePath}`);
      if (existsSync(candidatePath)) check(readFileSync(candidatePath).equals(baseline), `candidate runtime asset drift: ${mapping.sourcePath}`);
      check(blobAt(repositoryRoot, record.pagesSha, mapping.pagesPath).equals(baseline), `Pass 70 Pages runtime asset differs from source: ${mapping.sourcePath}`);
      runtimeAssetCount += 1;
    });
  }

  guarded('arena GLB scene signature', () => {
    const baseline = glbSceneSignature(blobAt(repositoryRoot, record.sourceSha, record.arenaGlb.sourcePath));
    const candidate = glbSceneSignature(readFileSync(resolve(repositoryRoot, record.arenaGlb.sourcePath)));
    const pages = glbSceneSignature(blobAt(repositoryRoot, record.pagesSha, record.arenaGlb.pagesPath));
    const expected = record.arenaGlb.sceneSignatureSha256;
    check(sha256(Buffer.from(canonicalJson(baseline))) === expected, 'baseline GLB scene signature is not pinned');
    check(canonicalJson(candidate) === canonicalJson(baseline), 'candidate GLB scene/material/texture signature drift');
    check(canonicalJson(pages) === canonicalJson(baseline), 'Pass 70 Pages GLB scene/material/texture signature drift');
  });

  let semanticDeclarationCount = 0;
  for (const group of record.semanticDeclarationParity) {
    guarded(`semantic declarations ${group.path}`, () => {
      const baseline = blobAt(repositoryRoot, record.sourceSha, group.path).toString('utf8');
      const candidate = readFileSync(resolve(repositoryRoot, group.path), 'utf8');
      for (const name of group.declarations) {
        check(extractConstDeclaration(candidate, name) === extractConstDeclaration(baseline, name), `quality semantic declaration drift: ${group.path}#${name}`);
        semanticDeclarationCount += 1;
      }
    });
  }

  let semanticFunctionCount = 0;
  for (const group of record.semanticFunctionParity) {
    guarded(`semantic functions ${group.path}`, () => {
      const baseline = blobAt(repositoryRoot, record.sourceSha, group.path).toString('utf8');
      const candidate = readFileSync(resolve(repositoryRoot, group.path), 'utf8');
      for (const name of group.functions) {
        check(extractFunctionDeclaration(candidate, name) === extractFunctionDeclaration(baseline, name), `quality semantic function drift: ${group.path}#${name}`);
        semanticFunctionCount += 1;
      }
    });
  }

  let semanticMethodCount = 0;
  for (const group of record.semanticMethodParity) {
    guarded(`semantic methods ${group.path}`, () => {
      const baseline = blobAt(repositoryRoot, record.sourceSha, group.path).toString('utf8');
      const candidate = readFileSync(resolve(repositoryRoot, group.path), 'utf8');
      for (const name of group.methods) {
        check(
          extractClassMethod(candidate, group.className, name) === extractClassMethod(baseline, group.className, name),
          `quality semantic method drift: ${group.path}#${group.className}.${name}`,
        );
        semanticMethodCount += 1;
      }
    });
  }

  let semanticTokenCount = 0;
  for (const group of record.semanticTokenParity) {
    guarded(`semantic tokens ${group.path}`, () => {
      const baseline = normalizeEol(blobAt(repositoryRoot, record.sourceSha, group.path).toString('utf8'));
      const candidate = normalizeEol(readFileSync(resolve(repositoryRoot, group.path), 'utf8'));
      for (const { token, count } of group.tokens) {
        check(countToken(baseline, token) === count, `baseline token count drift: ${group.path} ${JSON.stringify(token)}`);
        check(countToken(candidate, token) === count, `candidate token count drift: ${group.path} ${JSON.stringify(token)}`);
        semanticTokenCount += 1;
      }
    });
  }

  if (candidateDist !== null) {
    const distRoot = resolve(candidateDist);
    check(existsSync(join(distRoot, 'index.html')), 'candidate dist is missing index.html');
    const candidateBundle = candidateBundleBytes(distRoot);
    for (const token of record.candidateBundleTokens) {
      check(candidateBundle.includes(Buffer.from(token)), `candidate bundle is missing ${JSON.stringify(token)}`);
    }
    for (const mapping of record.runtimeAssetMappings) {
      const distPath = resolve(distRoot, mapping.pagesPath.slice(`${record.pagesPath}/`.length));
      check(existsSync(distPath), `candidate dist is missing ${mapping.sourcePath}`);
      if (existsSync(distPath)) check(readFileSync(distPath).equals(blobAt(repositoryRoot, record.sourceSha, mapping.sourcePath)), `candidate dist asset drift: ${mapping.sourcePath}`);
    }
    for (const set of record.protectedSourceSets) {
      const relativeSet = set.pagesPath.slice(`${record.pagesPath}/`.length);
      const distNames = directFiles(resolve(distRoot, relativeSet), set.extension);
      const baselineNames = listGitFiles(repositoryRoot, record.sourceSha, set.path)
        .filter((path) => !relativeBelow(set.path, path).includes('/') && path.endsWith(set.extension))
        .map((path) => relativeBelow(set.path, path));
      check(JSON.stringify(distNames) === JSON.stringify(baselineNames), `candidate dist texture membership drift: ${set.path}`);
      for (const name of baselineNames) {
        const sourcePath = `${set.path}/${name}`;
        const distPath = resolve(distRoot, relativeSet, name);
        if (existsSync(distPath)) check(readFileSync(distPath).equals(blobAt(repositoryRoot, record.sourceSha, sourcePath)), `candidate dist texture drift: ${sourcePath}`);
      }
    }
  }

  return {
    status: problems.length === 0 ? 'PASS' : 'FAIL',
    claim: 'pass70-source-asset-scene-structural-parity',
    candidateSha,
    baseline: REQUIRED_BASELINE,
    checks: {
      pagesRuntimeFiles: runtime?.runtime.length ?? 0,
      protectedSourceFiles: protectedFileCount,
      auditedSourceVariants: auditedSourceVariantCount,
      protectedTextures: textureFileCount,
      protectedRuntimeAssets: runtimeAssetCount,
      semanticDeclarations: semanticDeclarationCount,
      semanticFunctions: semanticFunctionCount,
      semanticMethods: semanticMethodCount,
      semanticTokens: semanticTokenCount,
      candidateDistChecked: candidateDist !== null,
    },
    pixelParity: {
      status: 'UNPROVEN',
      blocker: record.limitations.pixelParityBlocker,
    },
    problems,
  };
}

function parseArguments(argv) {
  const values = { root: SCRIPT_ROOT, recordPath: DEFAULT_RECORD_PATH, candidateDist: null, derive: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') values.root = resolve(argv[++index]);
    else if (argument === '--record') values.recordPath = resolve(argv[++index]);
    else if (argument === '--candidate-dist') values.candidateDist = resolve(argv[++index]);
    else if (argument === '--derive') values.derive = true;
    else throw new Error(`unknown argument ${argument}`);
  }
  return values;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const values = parseArguments(process.argv.slice(2));
    const record = JSON.parse(readFileSync(values.recordPath, 'utf8'));
    if (values.derive) {
      console.log(JSON.stringify(deriveAtomicQualityBaseline(values.root, record), null, 2));
    } else {
      const report = verifyAtomicQualityBaseline(values);
      console.log(JSON.stringify(report, null, 2));
      if (report.status !== 'PASS') process.exitCode = 1;
    }
  } catch (error) {
    console.error(`FAIL pass71-atomic-quality-baseline: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
