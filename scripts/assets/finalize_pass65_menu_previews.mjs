import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frameRoot = path.join(root, 'artifacts/pass65/menu-preview-master-frames');
const runtimeRoot = path.join(root, 'public/assets/original/menu-previews');
const sourceRoot = path.join(root, 'source-assets/menu/pass65-preview-masters');
const provenancePath = path.join(sourceRoot, 'provenance.json');
const manifestPath = path.join(root, 'assets.manifest.json');
const generatorPath = path.join(root, 'scripts/assets/generate_pass65_menu_previews.py');
const chopperSourcePath = path.join(root, 'source-assets/blender/pass65-chopper-gunner.blend');

const helicopterArenas = [
  ['atomic-acres', 'Original authored-helicopter cockpit flyover of the Nuke Town theatre'],
  ['skyline-terminal', 'Original authored-helicopter cockpit flyover of the Terminal theatre'],
  ['rustworks-1v1', 'Original authored-helicopter cockpit flyover of the RustRig theatre'],
];
const gunRangeFiles = new Map([
  ['public/assets/original/menu-previews/gun-range.mp4', '3de2c28899d32ee48b8a023613305690d59227b1e64189ffafaf1aa0b447fc13'],
  ['public/assets/original/menu-previews/gun-range.webm', '708bdf00af28906a8ce7b1605dc1c534c854c537fb82fecab62173dbce1e9885'],
  ['public/assets/original/menu-previews/gun-range.webp', '23479fe37b290d909e21d0c3015e49f3b09a244d51d986b67c665136fce210fe'],
  ['source-assets/menu/pass65-preview-masters/gun-range.blend', '14d9f6bc7b3a3b1b0948559d9d172c2666156c1730110540a88650b2a5c1994b'],
]);

const slash = (value) => value.split(path.sep).join('/');
const relative = (value) => slash(path.relative(root, value));
const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
}

async function assertPinnedGunRange() {
  for (const [file, expected] of gunRangeFiles) {
    const actual = await sha256(path.join(root, file));
    if (actual !== expected) throw new Error(`Refusing to continue: protected Gun Range asset changed: ${file}`);
  }
}

async function assertFrames(arena) {
  const directory = path.join(frameRoot, arena);
  const frames = (await readdir(directory)).filter((entry) => /^frame-\d{4}\.png$/.test(entry)).sort();
  const expected = Array.from({ length: 192 }, (_, index) => `frame-${String(index + 1).padStart(4, '0')}.png`);
  if (frames.length !== expected.length || frames.some((frame, index) => frame !== expected[index])) {
    throw new Error(`${arena} must provide the exact 192-frame sequence frame-0001.png..frame-0192.png`);
  }
}

function transcode(arena) {
  const input = path.join(frameRoot, arena, 'frame-%04d.png');
  const mp4 = path.join(runtimeRoot, `${arena}.mp4`);
  const webm = path.join(runtimeRoot, `${arena}.webm`);
  const poster = path.join(runtimeRoot, `${arena}.webp`);
  const rotor = 'sine=frequency=43:sample_rate=48000:duration=8';
  const rotorAudio = '[1:a]volume=0.030,lowpass=f=180,afade=t=in:st=0:d=0.15,afade=t=out:st=7.75:d=0.25[a]';

  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', '24', '-start_number', '1', '-i', input,
    '-f', 'lavfi', '-i', rotor,
    '-fflags', '+bitexact', '-map_metadata', '-1',
    '-filter_complex', rotorAudio, '-map', '0:v:0', '-map', '[a]',
    '-t', '8', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25',
    '-flags:v', '+bitexact', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    '-c:a', 'aac', '-flags:a', '+bitexact', '-b:a', '64k', mp4,
  ]);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', '24', '-start_number', '1', '-i', input,
    '-f', 'lavfi', '-i', rotor,
    '-fflags', '+bitexact', '-map_metadata', '-1',
    '-filter_complex', rotorAudio, '-map', '0:v:0', '-map', '[a]',
    '-t', '8', '-c:v', 'libvpx-vp9', '-crf', '34', '-b:v', '0',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-flags:v', '+bitexact', '-pix_fmt', 'yuv420p',
    '-c:a', 'libopus', '-flags:a', '+bitexact', '-b:a', '48k', webm,
  ]);
  run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-fflags', '+bitexact',
    '-i', path.join(frameRoot, arena, 'frame-0048.png'), '-map_metadata', '-1',
    '-frames:v', '1', '-c:v', 'libwebp', '-quality', '82', poster,
  ]);
}

async function sourceRecord(arena, composition) {
  const file = path.join(sourceRoot, `${arena}.blend`);
  return { arenaId: arena, path: relative(file), sha256: await sha256(file), composition };
}

async function runtimeRecord(file) {
  const absolute = path.join(runtimeRoot, file);
  return { path: relative(absolute), sha256: await sha256(absolute) };
}

await assertPinnedGunRange();
for (const [arena] of helicopterArenas) {
  await assertFrames(arena);
  transcode(arena);
}
await assertPinnedGunRange();

const sources = [];
for (const [arena, composition] of helicopterArenas) sources.push(await sourceRecord(arena, composition));
sources.push(await sourceRecord(
  'gun-range',
  'Original cat first-person prowl through the illuminated moving-target range with beveled feline ear silhouettes, inset pinnae and articulated forelegs, palms, toes and pads',
));

const runtimeFiles = [];
for (const arena of ['atomic-acres', 'gun-range', 'rustworks-1v1', 'skyline-terminal']) {
  for (const extension of ['mp4', 'webm', 'webp']) runtimeFiles.push(await runtimeRecord(`${arena}.${extension}`));
}

const provenance = {
  schemaVersion: 1,
  assetId: 'atomic-acres-pass65-prerecorded-menu-previews-2026-07-26',
  generatedAt: '2026-07-26',
  creator: 'Atomic Acres project',
  license: 'Original project work',
  generator: {
    path: relative(generatorPath),
    sha256: await sha256(generatorPath),
    blender: '5.1.2',
  },
  authoredCockpit: {
    assetId: 'chopper-gunner-vehicle-v1',
    path: relative(chopperSourcePath),
    sha256: await sha256(chopperSourcePath),
    qualityTier: 'LOD0',
    evidence: 'docs/assets/pass65-vehicles/chopper/pass65-chopper-first-person-instruments-16x9.png',
    evidenceSha256: 'a09ec4d7344a369546fde3179b17012badf434681a37f9e8bab663a142ca3b8f',
  },
  sources,
  render: {
    masterFrames: '192 PNG frames per arena (intermediate frames intentionally excluded from git)',
    dimensions: '960x540',
    frameRate: 24,
    durationSeconds: 8,
    motion: 'Deterministic authored paths with bounded helicopter altitude, gaze, pitch and bank variation; animated authored first-person rotor; animated range targets; authored feline ears with loop-safe twitches; articulated paws with loop-safe foreleg motion',
    audio: 'Project-generated low rotor harmonic for helicopter clips and a quieter tonal cat-range ambience; no sampled audio',
  },
  runtimeFiles,
  externalAssets: [],
  notes: 'Three helicopter previews use the project-original Blender-authored chopper-gunner LOD0 cockpit; the protected Gun Range cat master and runtime files are byte-identical to the accepted build. The menu runtime decodes only the selected prerecorded clip and does not submit the gameplay renderer while maps are browsed.',
};
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const record = manifest.assets.find((asset) => asset.id === provenance.assetId);
if (!record) throw new Error(`Missing ${provenance.assetId} in assets.manifest.json`);
record.sourceScriptSha256 = provenance.generator.sha256;
record.sourceProvenanceSha256 = await sha256(provenancePath);
record.modifications = 'Project-original Blender scenes record three flyovers through the Blender-authored chopper-gunner LOD0 cockpit and one protected cat first-person range prowl. The helicopter clips include deterministic bounded flight variation, visible spinning first-person rotor geometry, a modeled cyan/green glass cockpit and quiet synthesized rotor harmonics. The byte-identical cat clip retains clearer ears and paws plus animated illuminated targets. No downloaded model, texture, video, sampled audio, logo or extracted game asset is used.';
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  releaseState: 'release-ready',
  helicopterArenas: helicopterArenas.map(([arena]) => arena),
  protectedGunRange: 'byte-identical',
  runtimeFiles: runtimeFiles.length,
}, null, 2));
