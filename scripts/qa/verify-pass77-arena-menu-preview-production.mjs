/**
 * verify-pass77-arena-menu-preview-production.mjs — HF-372.
 *
 * The four Pass 66 arenas ship their menu previews behind a fail-closed gate
 * (verify-pass65-menu-preview-production.mjs): every digest is recomputed, every
 * budget re-measured, and the runtime wiring is read back out of the source. The
 * two arenas added afterwards — Farcrysis and High Seas — shipped their media,
 * their provenance and their manifest record, but no gate. "Like the other maps"
 * has to include the gate, or the next refactor silently unwires a card and QA
 * finds out from the owner.
 *
 * This verifier owns the additive pass77 family only. It deliberately re-derives
 * everything it asserts rather than trusting the finalizer's own receipt, and it
 * pins the one contract that makes an additive family legitimate: the retained
 * Pass 66 masters choreography still describes exactly the four arenas it was
 * captured for. Pass 74 broke that by appending a fifth arena to the retained
 * file, which moved its digest and took the retained gate red; the fifth arena
 * belongs in its own extension recipe beside it, which is where it now lives.
 *
 *   node scripts/qa/verify-pass77-arena-menu-preview-production.mjs
 *
 * Exit 0 prints a machine-readable summary; any failure exits 1 and lists every
 * issue found, not just the first.
 */
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  FINAL_MEDIA_SET_ALGORITHM,
  digestFinalMediaSet,
  sha256File,
} from '../assets/pass65-menu-preview-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const provenancePath = path.join(root, 'source-assets/menu/pass77-arena-previews/provenance.json');
const mastersPath = path.join(root, 'source-assets/menu/pass65-preview-masters/choreography.json');
const manifestPath = path.join(root, 'assets.manifest.json');
const finalizerPath = path.join(root, 'scripts/assets/finalize-pass77-arena-menu-previews.mjs');
const generatorPath = path.join(root, 'scripts/assets/generate-pass65-runtime-menu-previews.ts');
const runtimeSourcePath = path.join(root, 'src/ui/menu-preview-video.ts');
const cameraSourcePath = path.join(root, 'src/ui/menu-preview-camera.ts');
const runtimeRoot = path.join(root, 'public/assets/original/menu-previews');

/** Display order, matching ARENA_SELECTIONS: farcrysis fifth, high-seas sixth. */
const ARENAS = Object.freeze(['farcrysis', 'high-seas']);
/** The arenas the retained Pass 66 capture actually covers, in capture order. */
const RETAINED_ARENAS = Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range']);
const FAMILY_ID = 'pass77-farcrysis-high-seas-menu-previews';
const CACHE_KEY = 'pass77-arena-preview-v1';
const MOTION_CONTRACT = 'pass66-authoritative-runtime-menu-preview-v2';
const EXTENSION_RECIPES = Object.freeze({
  farcrysis: 'source-assets/menu/pass77-farcrysis-preview/choreography.json',
  'high-seas': 'source-assets/menu/pass75-high-seas-preview/choreography.json',
});

const failures = [];
const fail = (message) => failures.push(message);
const slash = (value) => value.split(path.sep).join('/');

async function readJson(file, label) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    fail(`${label} is missing or not readable JSON: ${error.message}`);
    return null;
  }
}

async function sizeOf(relativePath) {
  try {
    return (await stat(path.join(root, relativePath))).size;
  } catch {
    return null;
  }
}

/** Re-hashes a repository file and reports a mismatch against the recorded digest. */
async function pinDigest(relativePath, recorded, label) {
  const absolute = path.join(root, relativePath);
  let actual = null;
  try {
    actual = await sha256File(absolute);
  } catch (error) {
    fail(`${label} ${relativePath} could not be hashed: ${error.message}`);
    return null;
  }
  if (typeof recorded !== 'string' || !/^[0-9a-f]{64}$/.test(recorded)) {
    fail(`${label} ${relativePath} has no recorded sha256`);
    return actual;
  }
  if (actual !== recorded) fail(`${label} ${relativePath} digest mismatch: recorded ${recorded}, got ${actual}`);
  return actual;
}

const provenance = await readJson(provenancePath, 'pass77 provenance');
const masters = await readJson(mastersPath, 'retained Pass 66 masters choreography');
const manifest = await readJson(manifestPath, 'assets.manifest.json');

if (provenance) {
  if (provenance.schemaVersion !== 1) fail('pass77 provenance schemaVersion must be 1');
  if (provenance.familyId !== FAMILY_ID) fail(`pass77 provenance familyId drifted: ${provenance.familyId}`);
  if (provenance.cacheKey !== CACHE_KEY) fail(`pass77 cache key drifted: ${provenance.cacheKey}`);
  if (provenance.inheritsMotionContract !== MOTION_CONTRACT) fail('pass77 family must inherit the Pass 66 motion contract');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(provenance.generatedAt ?? '')) fail('pass77 provenance generatedAt must be an ISO date');
  if ((provenance.arenas ?? []).map((arena) => arena.arenaId).join(',') !== ARENAS.join(',')) {
    fail(`pass77 arena roster/order drifted: ${(provenance.arenas ?? []).map((arena) => arena.arenaId).join(',')}`);
  }
  await pinDigest('scripts/assets/finalize-pass77-arena-menu-previews.mjs', provenance.finalizer?.sha256, 'pass77 finalizer');
  if (slash(path.relative(root, finalizerPath)) !== provenance.finalizer?.path) fail('pass77 provenance finalizer path drifted');
  await pinDigest('scripts/assets/generate-pass65-runtime-menu-previews.ts', provenance.generator?.sha256, 'pass77 capture generator');
  if (slash(path.relative(root, generatorPath)) !== provenance.generator?.path) fail('pass77 provenance generator path drifted');
}

/**
 * The additive-family contract. If the retained masters ever grow a fifth arena
 * again, this family is no longer additive and the retained gate is red — catch
 * it here, next to the family that exists precisely to avoid reopening it.
 */
if (masters) {
  const retained = Object.keys(masters.arenas ?? {});
  if (retained.join(',') !== RETAINED_ARENAS.join(',')) {
    fail(`retained Pass 66 masters choreography must describe exactly its four captured arenas, found: ${retained.join(',')}`);
  }
  if (masters.recipeId !== MOTION_CONTRACT) fail('retained masters recipeId drifted');
}

const budget = masters?.media?.encodingBudget ?? null;
if (!budget) fail('retained masters choreography carries no encoding budget for the additive family to inherit');

const frameCount = masters?.frameCount ?? null;

for (const arena of provenance?.arenas ?? []) {
  const arenaId = arena.arenaId;
  const recipePath = EXTENSION_RECIPES[arenaId];
  if (!recipePath) {
    fail(`${arenaId} has no registered extension choreography`);
    continue;
  }
  const recipe = await readJson(path.join(root, recipePath), `${arenaId} extension choreography`);
  if (recipe) {
    if (recipe.recipeId !== arena.recipeId) fail(`${arenaId} recipeId disagrees between provenance and ${recipePath}`);
    if (recipe.inheritsMotionContract !== MOTION_CONTRACT) fail(`${arenaId} extension recipe does not inherit the Pass 66 motion contract`);
    const entry = recipe.arenas?.[arenaId];
    if (!entry) {
      fail(`${recipePath} does not define ${arenaId}`);
    } else {
      if (entry.presentationId !== arena.presentationId) fail(`${arenaId} presentationId disagrees between provenance and its recipe`);
      if (entry.kind !== arena.kind) fail(`${arenaId} camera kind disagrees between provenance and its recipe`);
      if (entry.posterFrame !== arena.posterFrame) fail(`${arenaId} posterFrame disagrees between provenance and its recipe`);
      if (frameCount !== null && !(entry.posterFrame >= 1 && entry.posterFrame <= frameCount)) {
        fail(`${arenaId} posterFrame ${entry.posterFrame} is outside the captured frame roster`);
      }
      // A helicopter recipe that flies below or through its own safe volume is
      // how a preview ends up inside terrain; the offline capture asserts this
      // per frame, and the shipped recipe has to still agree with it.
      const [minY, maxY] = entry.safeVolume?.y ?? [];
      if (!(entry.altitudeM >= minY && entry.altitudeM <= maxY)) {
        fail(`${arenaId} altitude ${entry.altitudeM} m is outside its authored safe volume`);
      }
      if (!(entry.fovDegrees > 30 && entry.fovDegrees < 120)) fail(`${arenaId} field of view ${entry.fovDegrees} is not a plausible flyover FOV`);
      if (!(entry.radius?.[0] > 0 && entry.radius?.[1] > 0)) fail(`${arenaId} orbit radius must be positive on both axes`);
    }
  }

  // Capture honesty. A compat-route capture is allowed — it is what actually
  // exists for farcrysis today — but only if the provenance says so in words.
  const capture = arena.capture ?? {};
  if (capture.source !== 'authoritative-runtime-arena') fail(`${arenaId} capture is not from the authoritative runtime arena`);
  if (capture.softwareAdapter !== false) fail(`${arenaId} capture must not come from a software adapter`);
  if (frameCount !== null && capture.capturedFrames !== frameCount) {
    fail(`${arenaId} captured ${capture.capturedFrames} frames, retained roster is ${frameCount}`);
  }
  if (capture.backendUsed !== capture.backendRequired && !(typeof capture.compatReason === 'string' && capture.compatReason.length > 40)) {
    fail(`${arenaId} was captured on ${capture.backendUsed} instead of ${capture.backendRequired} without a recorded reason`);
  }
  if (capture.backendUsed === capture.backendRequired && capture.compatReason !== null) {
    fail(`${arenaId} records a compat reason but claims the required backend`);
  }
  if (!/^[0-9a-f]{64}$/.test(capture.frameSetSha256 ?? '')) fail(`${arenaId} capture does not bind its staged frame set`);

  const runtimeFiles = arena.runtimeFiles ?? [];
  const expectedFiles = ['mp4', 'webm', 'webp'].map((extension) => `public/assets/original/menu-previews/${arenaId}.${extension}`);
  if (runtimeFiles.map((file) => file.path).join(',') !== expectedFiles.join(',')) {
    fail(`${arenaId} runtime file set/order drifted: ${runtimeFiles.map((file) => file.path).join(',')}`);
  }
  for (const file of runtimeFiles) {
    await pinDigest(file.path, file.sha256, `${arenaId} runtime media`);
    const bytes = await sizeOf(file.path);
    if (bytes === null) {
      fail(`${arenaId} runtime media ${file.path} is missing`);
      continue;
    }
    const ceiling = file.path.endsWith('.webp') ? budget?.maximumPosterBytes : budget?.maximumBytesPerVideo;
    if (budget && bytes > ceiling) fail(`${arenaId} ${path.basename(file.path)} is ${bytes} bytes, over the inherited ${ceiling} byte budget`);
    if (bytes <= 0) fail(`${arenaId} ${path.basename(file.path)} is empty`);
  }

  if (arena.reviewSheet) {
    await pinDigest(arena.reviewSheet.path, arena.reviewSheet.sha256, `${arenaId} review sheet`);
    const bytes = await sizeOf(arena.reviewSheet.path);
    if (bytes === null) fail(`${arenaId} review sheet is missing`);
    else if (budget && bytes > budget.maximumReviewSheetBytes) {
      fail(`${arenaId} review sheet is ${bytes} bytes, over the inherited ${budget.maximumReviewSheetBytes} byte budget`);
    }
  } else {
    fail(`${arenaId} has no review sheet`);
  }
}

// Recompute the family digest from the bytes on disk rather than trusting it.
if (provenance?.finalMediaSet) {
  let recomputed = null;
  try {
    recomputed = await digestFinalMediaSet(runtimeRoot, ARENAS);
  } catch (error) {
    fail(`pass77 final media set could not be digested: ${error.message}`);
  }
  if (recomputed) {
    const recorded = provenance.finalMediaSet;
    if (recorded.algorithm !== FINAL_MEDIA_SET_ALGORITHM) fail('pass77 final media set algorithm drifted');
    if (recorded.fileCount !== recomputed.fileCount) fail(`pass77 final media set file count drifted: recorded ${recorded.fileCount}, got ${recomputed.fileCount}`);
    if (recorded.totalBytes !== recomputed.totalBytes) fail(`pass77 final media set byte total drifted: recorded ${recorded.totalBytes}, got ${recomputed.totalBytes}`);
    if (recorded.sha256 !== recomputed.sha256) fail(`pass77 final media set digest drifted: recorded ${recorded.sha256}, got ${recomputed.sha256}`);
  }
}

// The manifest is what the public-asset provenance verifier reads; it has to
// agree with this family's provenance file byte for byte, not approximately.
const manifestRecord = (manifest?.assets ?? []).find((asset) => asset.id === `atomic-acres-${FAMILY_ID}`);
if (!manifestRecord) {
  fail(`assets.manifest.json is missing atomic-acres-${FAMILY_ID}`);
} else if (provenance) {
  const provenanceFiles = (provenance.arenas ?? []).flatMap((arena) => arena.runtimeFiles ?? []);
  const manifestFiles = manifestRecord.files ?? [];
  if (JSON.stringify(manifestFiles) !== JSON.stringify(provenanceFiles.map((file) => ({ path: file.path, sha256: file.sha256 })))) {
    fail('manifest file set does not match the pass77 provenance runtime files');
  }
  const contactSheets = (provenance.arenas ?? []).map((arena) => arena.reviewSheet?.path).filter(Boolean);
  if (JSON.stringify(manifestRecord.contactSheet ?? []) !== JSON.stringify(contactSheets)) fail('manifest contact sheet list does not match the pass77 review sheets');
  if (manifestRecord.sourceScript !== provenance.finalizer?.path) fail('manifest sourceScript is not the pass77 finalizer');
  if (manifestRecord.sourceScriptSha256 !== provenance.finalizer?.sha256) fail('manifest sourceScriptSha256 is stale against the pass77 finalizer');
  if (manifestRecord.sourceProvenance !== slash(path.relative(root, provenancePath))) fail('manifest sourceProvenance does not point at the pass77 provenance file');
  if (manifestRecord.generatedAsOf !== provenance.generatedAt) fail('manifest generatedAsOf disagrees with the pass77 provenance date');
  if (manifestRecord.attributionRequired !== false) fail('pass77 media is original project work and must not require attribution');
  const retainedPaths = new Set(RETAINED_ARENAS.flatMap((arena) => ['mp4', 'webm', 'webp'].map((extension) => `public/assets/original/menu-previews/${arena}.${extension}`)));
  for (const file of manifestFiles) {
    if (retainedPaths.has(file.path)) fail(`pass77 family claims retained Pass 66 media ${file.path}`);
  }
}

// Runtime wiring: the map card is only non-blank if the menu actually points at
// this family's files. Read it out of the source rather than assuming.
const runtimeSource = await readFile(runtimeSourcePath, 'utf8').catch(() => null);
if (runtimeSource === null) fail('src/ui/menu-preview-video.ts is missing');
else {
  if (!runtimeSource.includes(CACHE_KEY)) fail(`src/ui/menu-preview-video.ts does not use the ${CACHE_KEY} cache key`);
  for (const arenaId of ARENAS) {
    for (const extension of ['webm', 'mp4', 'webp']) {
      if (!runtimeSource.includes(`${arenaId}.${extension}`)) fail(`src/ui/menu-preview-video.ts never references ${arenaId}.${extension}`);
    }
  }
}

const cameraSource = await readFile(cameraSourcePath, 'utf8').catch(() => null);
if (cameraSource === null) fail('src/ui/menu-preview-camera.ts is missing');
else {
  for (const [arenaId, recipePath] of Object.entries(EXTENSION_RECIPES)) {
    const importPath = recipePath.replace(/^source-assets\//, '');
    if (!cameraSource.includes(importPath)) fail(`src/ui/menu-preview-camera.ts does not import the ${arenaId} extension recipe`);
  }
}

if (failures.length > 0) {
  console.error(`Pass 77 arena menu preview verification FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  family: FAMILY_ID,
  cacheKey: CACHE_KEY,
  arenas: ARENAS,
  retainedMastersArenas: RETAINED_ARENAS,
  finalMediaSetSha256: provenance.finalMediaSet.sha256,
  provenanceSha256: createHash('sha256').update(await readFile(provenancePath)).digest('hex'),
  verified: 'passed',
}, null, 2));
