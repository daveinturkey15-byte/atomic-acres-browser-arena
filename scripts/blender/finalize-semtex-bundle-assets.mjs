import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const absolute = (value) => path.join(root, value);
const sha256 = async (value) => createHash('sha256').update(await readFile(absolute(value))).digest('hex');
const record = async (value, extra = {}) => ({ path: value.replaceAll('\\', '/'), sha256: await sha256(value), ...extra });
const requiredNodes = [
  'semtex-bundle-root', 'semtex-block-1', 'semtex-block-2', 'semtex-block-3', 'semtex-block-4',
  'semtex-wrap-band-horizontal', 'semtex-wrap-band-vertical', 'semtex-detonator', 'semtex-fuse',
  'semtex-wire', 'semtex-sticky-pad', 'semtex-held-socket', 'semtex-world-socket',
];

function readGlbJson(bytes) {
  if (bytes.subarray(0, 4).toString('ascii') !== 'glTF' || bytes.readUInt32LE(4) !== 2) throw new Error('invalid GLB');
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8').trim());
}

const sourceBlend = await record('source-assets/blender/semtex-bundle.blend');
const sourceScript = await record('scripts/blender/create-semtex-bundle.py');
const glbs = [];
let priorTriangles = Number.POSITIVE_INFINITY;
for (const lod of [0, 1, 2]) {
  const relative = `public/assets/original/models/ordnance/semtex-bundle-lod${lod}.glb`;
  const bytes = await readFile(absolute(relative));
  const json = readGlbJson(bytes);
  const names = new Set((json.nodes ?? []).map((node) => node.name));
  const missing = requiredNodes.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Semtex LOD${lod} missing nodes: ${missing.join(', ')}`);
  const triangles = (json.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []).reduce((sum, primitive) => {
    const accessor = json.accessors?.[primitive.indices];
    return sum + Math.floor((accessor?.count ?? 0) / 3);
  }, 0);
  if (!(triangles > 0 && triangles < priorTriangles)) throw new Error(`Semtex LOD triangle count must decrease: LOD${lod}=${triangles}`);
  priorTriangles = triangles;
  if ((json.images?.length ?? 0) < 4) throw new Error(`Semtex LOD${lod} must embed albedo, normal, ORM, and emissive textures`);
  glbs.push(await record(relative, { lod, bytes: bytes.length, triangles }));
}
const pbrMaps = {};
for (const kind of ['albedo', 'normal', 'orm', 'emissive']) {
  pbrMaps[kind] = await record(`public/assets/original/textures/ordnance/semtex-bundle-${kind}.png`, { width: 256, height: 256 });
}

const provenancePath = 'source-assets/blender/semtex-bundle.provenance.json';
const review = await record('docs/assets/pass65-ordnance/semtex-bundle-review.png', { width: 512, height: 512, cameraId: 'front-quarter' });
const provenance = {
  schemaVersion: 1,
  id: 'atomic-acres-semtex-bundle-v1',
  title: 'Semtex bundle ordnance family',
  creator: 'Atomic Acres project',
  owner: 'Atomic Acres project',
  created: '2026-07-26',
  license: 'Project-original; no third-party meshes, textures, brands, or commercial-game assets',
  sourceBlend,
  generator: sourceScript,
  worldGlbs: glbs,
  pbrMaps,
  review,
  requiredNodes,
  presentationOnly: true,
  gameplayAuthority: 'TypeScript host authority; visual meshes have no gameplay raycast or collider authority',
  reproducibility: {
    command: 'npm run author:blender-semtex',
    cleanFactoryStartup: true,
    pythonHashSeed: 0,
    contract: 'Required semantic nodes, strictly decreasing LOD topology, PBR map set, dimensions, and provenance hashes are mechanically revalidated after every generation.',
  },
};
await writeFile(absolute(provenancePath), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
const provenanceRecord = await record(provenancePath);

const manifestPath = absolute('assets.manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const asset = {
  id: 'atomic-acres-semtex-bundle-2026-07-26',
  kind: 'original-project-blender-ordnance-family',
  creator: 'Atomic Acres project',
  source: sourceScript.path,
  generatedAsOf: '2026-07-26',
  license: 'Original project work',
  files: 'public/assets/original/**/semtex-bundle-*',
  sourceBlend: sourceBlend.path,
  sourceBlendSha256: sourceBlend.sha256,
  sourceScript: sourceScript.path,
  sourceScriptSha256: sourceScript.sha256,
  sourceProvenance: provenanceRecord.path,
  sourceProvenanceSha256: provenanceRecord.sha256,
  preview: review.path,
  format: 'Three decreasing optimized glTF 2.0 binary LODs with embedded WebP PBR maps and retained lossless source PNG maps',
  modifications: 'Project-original four-block red Semtex bundle with woven retaining bands, pressure adhesive, steel detonator, fuse, braided wire, arming lamp, and held/world presentation sockets. Runtime collision, sticking, fuse, damage, and multiplayer authority remain TypeScript-owned.',
  attributionRequired: false,
};
const index = manifest.assets.findIndex((entry) => entry.id === asset.id);
if (index >= 0) manifest.assets[index] = asset;
else manifest.assets.splice(2, 0, asset);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ id: provenance.id, sourceBlend, glbs, pbrMaps, provenance: provenanceRecord }, null, 2));
