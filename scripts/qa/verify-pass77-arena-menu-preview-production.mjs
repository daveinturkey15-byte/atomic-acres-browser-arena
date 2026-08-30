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
 * This verifier owns the additive pass77 family, and since 2026-08-30 it also
 * owns the SHELF-WIDE invariants no per-family gate can express (see "THE SHELF
 * INVARIANTS" near the bottom). It deliberately re-derives everything it asserts
 * rather than trusting the finalizer's own receipt, and it pins the one contract
 * that makes an additive family legitimate: the retained Pass 66 masters
 * choreography still describes exactly the four arenas it was captured for. Pass 74 broke that by appending a fifth arena to the retained
 * file, which moved its digest and took the retained gate red; the fifth arena
 * belongs in its own extension recipe beside it, which is where it now lives.
 *
 *   node scripts/qa/verify-pass77-arena-menu-preview-production.mjs
 *
 * Exit 0 prints a machine-readable summary; any failure exits 1 and lists every
 * issue found, not just the first.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
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
const mapSelectionPath = path.join(root, 'src/map-selection.ts');
const menuSourceRoot = path.join(root, 'source-assets/menu');
const cameraSourcePath = path.join(root, 'src/ui/menu-preview-camera.ts');
const runtimeRoot = path.join(root, 'public/assets/original/menu-previews');

/** Display order, matching ARENA_SELECTIONS: farcrysis fifth, high-seas sixth. */
const ARENAS = Object.freeze(['farcrysis', 'high-seas']);
/** The arenas the retained Pass 66 capture actually covers, in capture order. */
const RETAINED_ARENAS = Object.freeze(['atomic-acres', 'skyline-terminal', 'rustworks-1v1', 'gun-range']);
const FAMILY_ID = 'pass77-farcrysis-high-seas-menu-previews';
const CACHE_KEY = 'pass77-arena-preview-v1';
const MOTION_CONTRACT = 'pass66-authoritative-runtime-menu-preview-v2';
/**
 * Every extension recipe on the shelf, not just this family's two.
 *
 * The per-arena loop below only ever looks up the arenas in this family's
 * provenance, so the extra entries cost it nothing; the camera-import check at
 * the bottom iterates the whole map, which is what makes it notice a recipe the
 * runtime evaluator forgot to merge. test1/test2 were added here on 2026-08-30
 * after exactly that: their recipe was merged into src/ui/menu-preview-camera.ts
 * but not into the capture generator, so no capture could run for them.
 */
const EXTENSION_RECIPES = Object.freeze({
  farcrysis: 'source-assets/menu/pass77-farcrysis-preview/choreography.json',
  'high-seas': 'source-assets/menu/pass75-high-seas-preview/choreography.json',
  test1: 'source-assets/menu/pass79-test-arena-previews/choreography.json',
  test2: 'source-assets/menu/pass79-test-arena-previews/choreography.json',
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


// ---------------------------------------------------------------------------
// THE SHELF INVARIANTS (2026-08-30).
//
// Everything above this line verifies ONE family against ITS OWN provenance,
// and that is exactly how two arenas shipped another map's footage without a
// single gate going red:
//
//   1. Coverage was a hardcoded roster. `ARENAS` is ['farcrysis','high-seas'],
//      taken from this family's provenance; the retained gate's roster is its
//      own four. test1 and test2 were selectable, shipped three files each and
//      belonged to NO family - so no verifier ever opened their bytes. A gate
//      that only checks what it was told about cannot report what it was never
//      told about.
//   2. Every digest check was intra-arena. `pinDigest(file.path, file.sha256)`
//      compares a file to ITS OWN recorded hash, so a byte-for-byte copy of
//      another arena's preview passes perfectly - it matches the digest that was
//      recorded from the copy. Nothing anywhere compared one arena against
//      another, so duplicated footage was invisible by construction.
//
// The assertions below are therefore whole-shelf rather than per-family, and
// they DERIVE their rosters instead of listing them, so the next arena cannot
// fall into the same gap:
//
//   A. Every selectable arena ships its own preview trio, and every preview file
//      on the public shelf is claimed by exactly one family's provenance.
//   B. No two arenas share a preview digest.
// ---------------------------------------------------------------------------

/**
 * The arena roster, derived from ARENA_SELECTIONS rather than listed here.
 *
 * This verifier is plain ESM and src/map-selection.ts pulls in the gameplay and
 * bot modules, so the roster is read out of the source text. Each entry is an
 * `Object.freeze({ ... })` whose `id` and `selectable` both precede its
 * `matchRules: Object.freeze({`, so splitting on that token yields one chunk per
 * arena carrying both. A shape change makes the roster empty or short, which
 * fails loudly immediately below rather than silently passing an empty loop.
 */
function selectableArenaRoster(source) {
  const start = source.indexOf('export const ARENA_SELECTIONS');
  const end = source.indexOf('\n]);', start);
  if (start < 0 || end < 0) return null;
  const roster = [];
  for (const chunk of source.slice(start, end).split('Object.freeze({')) {
    const id = /^\s*id: '([a-z0-9-]+)' as const,$/m.exec(chunk)?.[1];
    if (!id) continue;
    roster.push({ id, selectable: !/^\s*selectable: false,$/m.test(chunk) });
  }
  return roster;
}

const selectionSource = await readFile(mapSelectionPath, 'utf8').catch(() => null);
const roster = selectionSource === null ? null : selectableArenaRoster(selectionSource);
if (!roster || roster.length < RETAINED_ARENAS.length + ARENAS.length) {
  fail(`could not derive the arena roster from src/map-selection.ts (found ${roster?.length ?? 0}); the shelf invariants cannot run`);
}
const selectableArenas = (roster ?? []).filter((arena) => arena.selectable).map((arena) => arena.id);

/**
 * Every menu-preview file every family claims, indexed by public path.
 *
 * Families are DISCOVERED (source-assets/menu/<family>/provenance.json), never
 * listed, so a family added beside the existing ones extends this check with no
 * edit here. Both provenance shapes are read: the retained Pass 66 family
 * carries a top-level `runtimeFiles`, the additive families carry
 * `arenas[].runtimeFiles`.
 */
const declaredCacheKeys = new Map();

async function declaredPreviewFiles() {
  const claims = new Map();
  const directories = await readdir(menuSourceRoot, { withFileTypes: true }).catch(() => []);
  for (const directory of directories) {
    if (!directory.isDirectory()) continue;
    const file = path.join(menuSourceRoot, directory.name, 'provenance.json');
    const document = await readFile(file, 'utf8').then(JSON.parse).catch(() => null);
    if (!document) continue;
    if (typeof document.cacheKey === 'string') declaredCacheKeys.set(directory.name, document.cacheKey);
    const declared = [
      ...(Array.isArray(document.runtimeFiles) ? document.runtimeFiles : []),
      ...(Array.isArray(document.arenas) ? document.arenas.flatMap((arena) => arena.runtimeFiles ?? []) : []),
    ];
    for (const entry of declared) {
      if (typeof entry?.path !== 'string') continue;
      if (!entry.path.startsWith('public/assets/original/menu-previews/')) continue;
      const existing = claims.get(entry.path);
      if (existing && existing.family !== directory.name) {
        fail(`${entry.path} is claimed by two preview families: ${existing.family} and ${directory.name}`);
      }
      claims.set(entry.path, { family: directory.name, sha256: entry.sha256 });
    }
  }
  return claims;
}

const declaredFiles = await declaredPreviewFiles();
const shippedFiles = (await readdir(runtimeRoot).catch(() => []))
  .filter((name) => /\.(mp4|webm|webp)$/.test(name))
  .map((name) => `public/assets/original/menu-previews/${name}`)
  .sort();

// A. Coverage. Every selectable arena ships all three files, and every shipped
//    file is owned by a family. Both halves matter: a missing file is the blank
//    card the owner reported, and an unclaimed file is media that no gate
//    anywhere re-derives - which is the state test1/test2 shipped in.
for (const arenaId of selectableArenas) {
  for (const extension of ['mp4', 'webm', 'webp']) {
    const relativePath = `public/assets/original/menu-previews/${arenaId}.${extension}`;
    const bytes = await sizeOf(relativePath);
    if (bytes === null || bytes <= 0) {
      fail(`selectable arena ${arenaId} ships no ${extension} menu preview (${relativePath})`);
      continue;
    }
    if (!declaredFiles.has(relativePath)) {
      fail(`${relativePath} ships to players but no preview family's provenance claims it, so no gate re-derives its bytes`);
    }
    const ceiling = extension === 'webp' ? budget?.maximumPosterBytes : budget?.maximumBytesPerVideo;
    if (budget && bytes > ceiling) fail(`${relativePath} is ${bytes} bytes, over the inherited ${ceiling} byte budget`);
  }
}
for (const relativePath of shippedFiles) {
  if (!declaredFiles.has(relativePath)) fail(`${relativePath} is on the public shelf but unclaimed by every preview family`);
}

// A2. One manifest claim per file. assets.manifest.json is what the public-asset
//     provenance gate re-hashes, and it drives that gate purely by declared
//     digest - so TWO entries claiming the same path is a coin flip over which
//     digest is authoritative. That is not hypothetical: on 2026-08-30 the
//     retired placeholder entry and the real capture family both claimed all six
//     test1/test2 preview files, and the placeholder still pinned the stub bytes.
const manifestClaims = new Map();
for (const asset of manifest?.assets ?? []) {
  for (const file of asset.files ?? []) {
    if (typeof file?.path !== 'string' || !file.path.startsWith('public/assets/original/menu-previews/')) continue;
    const existing = manifestClaims.get(file.path);
    if (existing && existing !== asset.id) {
      fail(`${file.path} is claimed by two assets.manifest.json entries: ${existing} and ${asset.id}`);
    }
    manifestClaims.set(file.path, asset.id);
  }
}
for (const relativePath of shippedFiles) {
  if (!manifestClaims.has(relativePath)) fail(`${relativePath} ships to players but assets.manifest.json declares no entry for it`);
}

// B. Distinctness. The defect this closes: test1.{mp4,webm,webp} were
//    byte-identical copies of gun-range.* and test2.* of high-seas.*, so
//    hovering Test1 in the live menu played the Gun Range flyover. Every
//    per-file digest still matched its own provenance record, because the record
//    was taken FROM the copy - which is why this has to be a cross-arena
//    comparison and cannot live inside any one family's section above.
// C. Cache-family honesty. New bytes under an old key are what the cache-family
//    lock exists to prevent, and a key nothing references means the family's
//    media is unreachable from the menu. Both are shelf-wide, not per-family.
for (const [family, cacheKey] of declaredCacheKeys) {
  if (runtimeSource !== null && !runtimeSource.includes(cacheKey)) {
    fail(`preview family ${family} declares cache key ${cacheKey}, which src/ui/menu-preview-video.ts never references`);
  }
}

const digestOwners = new Map();
for (const relativePath of shippedFiles) {
  const arenaId = path.basename(relativePath).replace(/\.(mp4|webm|webp)$/, '');
  let digest = null;
  try {
    digest = await sha256File(path.join(root, relativePath));
  } catch (error) {
    fail(`${relativePath} could not be hashed for the cross-arena distinctness check: ${error.message}`);
    continue;
  }
  // Re-derive every claim, not just this family's. The per-arena loops above
  // only pin the arenas their own provenance lists, so without this a family
  // whose media drifted after its provenance was written would go unnoticed
  // exactly the way test1/test2 did.
  const claim = declaredFiles.get(relativePath);
  if (claim && typeof claim.sha256 === 'string' && claim.sha256 !== digest) {
    fail(`${relativePath} does not match the digest recorded by preview family ${claim.family}: recorded ${claim.sha256}, got ${digest}`);
  }
  const owner = digestOwners.get(digest);
  if (owner && owner.arenaId !== arenaId) {
    fail(`${relativePath} is byte-identical to ${owner.path}: ${arenaId} would play ${owner.arenaId} footage in the menu (sha256 ${digest})`);
  } else if (owner) {
    fail(`${relativePath} is byte-identical to ${owner.path}; one arena must not ship the same bytes under two containers`);
  } else {
    digestOwners.set(digest, { arenaId, path: relativePath });
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
  shelf: {
    selectableArenas,
    shippedPreviewFiles: shippedFiles.length,
    claimedPreviewFiles: declaredFiles.size,
    distinctPreviewDigests: digestOwners.size,
  },
  finalMediaSetSha256: provenance.finalMediaSet.sha256,
  provenanceSha256: createHash('sha256').update(await readFile(provenancePath)).digest('hex'),
  verified: 'passed',
}, null, 2));
