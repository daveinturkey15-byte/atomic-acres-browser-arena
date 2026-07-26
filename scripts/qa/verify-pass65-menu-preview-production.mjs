import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const provenancePath = path.join(root, 'source-assets/menu/pass65-preview-masters/provenance.json');
const manifestPath = path.join(root, 'assets.manifest.json');
const generatorPath = path.join(root, 'scripts/assets/generate_pass65_menu_previews.py');
const runtimeSourcePath = path.join(root, 'src/ui/menu-preview-video.ts');
const acceptedCockpitEvidence = 'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png';
const acceptedCockpitDigest = 'a09ec4d7344a369546fde3179b17012badf434681a37f9e8bab663a142ca3b8f';
const helicopterArenas = ['atomic-acres', 'skyline-terminal', 'rustworks-1v1'];
const pinnedGunRange = new Map([
  ['public/assets/original/menu-previews/gun-range.mp4', '232aaebe4ddce666c43f4ac36da2fc9713933d2cd0b8f027dfcd5af8db001f05'],
  ['public/assets/original/menu-previews/gun-range.webm', '842cd51d05e7b9dd6fde9c808d21da9da8e43a4a75cd0a21cd9038d735194fe7'],
  ['public/assets/original/menu-previews/gun-range.webp', '00e476fd509bd94ad75abdc7e2af16c6c81fe667bf1f629a3fa53e3a51c65288'],
  ['source-assets/menu/pass65-preview-masters/gun-range.blend', 'f681075ab3b963754202f1a6ca9993aa31acfb7db6cb2ab0dabce8374b04680d'],
]);
const blenderCandidates = [
  process.env.BLENDER_EXECUTABLE,
  'C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.3\\blender.exe',
].filter(Boolean);

const failures = [];
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
const relative = (file) => path.relative(root, file).split(path.sep).join('/');

async function checkHash(file, expected, label = relative(file)) {
  try {
    const actual = await sha256(file);
    if (actual !== expected) failures.push(`${label} digest mismatch: expected ${expected}, got ${actual}`);
  } catch (error) {
    failures.push(`${label} cannot be read: ${error.message}`);
  }
}

function runJson(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    failures.push(`${label} failed: ${(result.stderr || result.stdout).trim()}`);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    failures.push(`${label} did not return JSON: ${error.message}`);
    return null;
  }
}

function inspectMedia(file) {
  return runJson('ffprobe', [
    '-v', 'error', '-show_entries',
    'format=duration:stream=index,codec_type,codec_name,width,height,r_frame_rate,duration',
    '-of', 'json', file,
  ], `ffprobe ${relative(file)}`);
}

function validateVideo(file, videoCodec, audioCodec) {
  const probe = inspectMedia(file);
  if (!probe) return;
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format?.duration ?? video?.duration);
  if (video?.codec_name !== videoCodec) failures.push(`${relative(file)} must use ${videoCodec} video`);
  if (video?.width !== 960 || video?.height !== 540) failures.push(`${relative(file)} must be 960x540`);
  if (video?.r_frame_rate !== '24/1') failures.push(`${relative(file)} must be 24 FPS`);
  if (!Number.isFinite(duration) || Math.abs(duration - 8) > 0.08) failures.push(`${relative(file)} must be an eight-second loop`);
  if (audio?.codec_name !== audioCodec) failures.push(`${relative(file)} must include ${audioCodec} audio`);
}

function validatePoster(file) {
  const probe = inspectMedia(file);
  if (!probe) return;
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  if (video?.codec_name !== 'webp' || video?.width !== 960 || video?.height !== 540) {
    failures.push(`${relative(file)} must be a 960x540 WebP poster`);
  }
}

function auditBlend(blender, arena) {
  const blendPath = path.join(root, `source-assets/menu/pass65-preview-masters/${arena}.blend`);
  const expression = [
    'import bpy,json',
    `bpy.ops.wm.open_mainfile(filepath=${JSON.stringify(blendPath)})`,
    "roots=[o for o in bpy.data.objects if o.get('asset_id')=='chopper-gunner-vehicle-v1' and o.get('quality_tier')=='LOD0']",
    "semantics=[o.get('canonical_node_name') for o in bpy.data.objects if o.get('canonical_node_name')]",
    "print('AA_BLEND_AUDIT='+json.dumps({'roots':len(roots),'offline':[o.get('offline_preview_source') for o in roots],'visibility':[o.get('offline_preview_visibility') for o in roots],'semantics':semantics,'catEars':len([o for o in bpy.data.objects if o.name.startswith('clear-cat-ear')]),'catPaws':len([o for o in bpy.data.objects if o.name.startswith('clear-cat-paw')])}))",
  ].join(';');
  const result = spawnSync(blender, ['--background', '--factory-startup', '--python-expr', expression], {
    cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    failures.push(`Blender audit failed for ${arena}: ${(result.stderr || result.stdout).trim()}`);
    return;
  }
  const marker = result.stdout.split(/\r?\n/).find((line) => line.startsWith('AA_BLEND_AUDIT='));
  if (!marker) {
    failures.push(`Blender audit emitted no structured result for ${arena}`);
    return;
  }
  const audit = JSON.parse(marker.slice('AA_BLEND_AUDIT='.length));
  if (arena === 'gun-range') {
    if (audit.roots !== 0 || audit.catEars < 2 || audit.catPaws < 2) failures.push('Gun Range master must remain cat-only');
    return;
  }
  for (const semantic of ['chopper-first-person-cockpit', 'chopper-first-person-camera-socket', 'chopper-first-person-rotor']) {
    if (!audit.semantics.includes(semantic)) failures.push(`${arena} master is missing ${semantic}`);
  }
  if (audit.roots !== 1
    || audit.offline[0] !== 'source-assets/blender/pass65-chopper-gunner.blend'
    || audit.visibility[0] !== 'first-person-cockpit-only'
    || audit.catEars !== 0
    || audit.catPaws !== 0) {
    failures.push(`${arena} master must contain exactly one authored LOD0 cockpit and no cat POV geometry`);
  }
}

const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const manifestRecord = manifest.assets.find((asset) => asset.id === provenance.assetId);
if (!manifestRecord) failures.push(`assets.manifest.json is missing ${provenance.assetId}`);

if (provenance.authoredCockpit?.assetId !== 'chopper-gunner-vehicle-v1'
  || provenance.authoredCockpit?.qualityTier !== 'LOD0') {
  failures.push('provenance must pin the authored chopper-gunner LOD0 cockpit');
}
await checkHash(path.join(root, acceptedCockpitEvidence), acceptedCockpitDigest, 'accepted cockpit evidence');
await checkHash(generatorPath, provenance.generator.sha256, 'menu preview generator');
await checkHash(path.join(root, provenance.authoredCockpit.path), provenance.authoredCockpit.sha256, 'authored cockpit source');
for (const source of provenance.sources) await checkHash(path.join(root, source.path), source.sha256);
for (const runtime of provenance.runtimeFiles) await checkHash(path.join(root, runtime.path), runtime.sha256);
for (const [file, digest] of pinnedGunRange) await checkHash(path.join(root, file), digest, `protected ${file}`);

if (manifestRecord) {
  if (manifestRecord.sourceScriptSha256 !== provenance.generator.sha256) failures.push('manifest generator digest does not match provenance');
  if (manifestRecord.sourceProvenanceSha256 !== await sha256(provenancePath)) failures.push('manifest provenance digest is stale');
  if (!manifestRecord.modifications.includes('Blender-authored chopper-gunner LOD0 cockpit')) failures.push('manifest does not describe the authored cockpit source');
}

for (const arena of helicopterArenas) {
  validateVideo(path.join(root, `public/assets/original/menu-previews/${arena}.mp4`), 'h264', 'aac');
  validateVideo(path.join(root, `public/assets/original/menu-previews/${arena}.webm`), 'vp9', 'opus');
  validatePoster(path.join(root, `public/assets/original/menu-previews/${arena}.webp`));
}

const generatorSource = await readFile(generatorPath, 'utf8');
if (!generatorSource.includes('add_authored_helicopter_cockpit(rig)')
  || !generatorSource.includes('CHOPPER_SOURCE')
  || generatorSource.includes('def add_helicopter_cockpit(')) {
  failures.push('offline generator must require the authored cockpit with no primitive cockpit implementation');
}
if (!generatorSource.includes('"atomic-acres,skyline-terminal,rustworks-1v1"')) {
  failures.push('Gun Range must remain outside the default regeneration scope');
}

const runtimeSource = await readFile(runtimeSourcePath, 'utf8');
if (!runtimeSource.includes('<video id="menu-preview-video"')
  || runtimeSource.includes('<canvas')
  || !runtimeSource.includes('rendererSubmissions: 0')
  || !runtimeSource.includes("frame: 'cat'")) {
  failures.push('menu runtime must remain prerecorded-video-only with the cat route preserved');
}

const blender = blenderCandidates.find((candidate) => existsSync(candidate));
if (!blender) {
  failures.push('Blender executable not found; editable master audit is mandatory');
} else {
  for (const arena of [...helicopterArenas, 'gun-range']) auditBlend(blender, arena);
}

if (failures.length > 0) {
  console.error(`Pass 65 menu preview production verification FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  releaseState: 'release-ready',
  authoredCockpit: provenance.authoredCockpit.assetId,
  helicopterArenas,
  protectedGunRange: 'byte-identical-cat-pov',
  runtimeMode: 'prerecorded-video-only',
}, null, 2));
