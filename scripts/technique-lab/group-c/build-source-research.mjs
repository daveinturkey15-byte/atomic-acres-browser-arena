/**
 * Rebuilds docs/technique-lab/group-c/SOURCE_RESEARCH.json from the evidence
 * that already exists on this machine. It fetches nothing.
 *
 * Inputs (all read-only, all outside the repository):
 *   - the dispatch source packet, for stable IDs, URLs, canonical pins and the
 *     register text that carries each licence finding;
 *   - the per-URL fetch-attempt ledger written by the earlier pass, for the
 *     outcome, HTTP status, byte count, sha256 and timestamp of every URL;
 *   - the canonical skill store, for the carrier SKILL.md bodies, which are
 *     re-hashed here and compared against the hashes the packet recorded.
 *
 * `carrierReads` is the one field that is not derived: it records which carrier
 * bodies were actually read end to end in the 2026-09-12 recovery window. A
 * hash match proves the file did not drift; it does not prove anyone read it,
 * and conflating the two is the failure this field exists to prevent.
 *
 * Usage: node scripts/technique-lab/group-c/build-source-research.mjs [--check]
 * `--check` exits non-zero if the committed report differs from a fresh build.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const OUT = resolve(REPO, 'docs/technique-lab/group-c/SOURCE_RESEARCH.json');

const WORK = 'C:/Users/david/Documents/Codex/2026-09-11/p-le/work/technique-lab-20260912';
const PACKET = `${WORK}/sources-group-c.json`;
const ATTEMPTS = `${WORK}/group-c-fetch-attempts.json`;

/**
 * Carrier SKILL.md bodies read end to end during the recovery window, with the
 * section that actually specifies the technique. Anything not listed here was
 * NOT read in this window and is reported as such — see the header.
 */
const CARRIER_READS = {
  'threejs-game-development': {
    readAt: '2026-09-12',
    coverage: 'full body, 131 lines, frontmatter to final line',
    specifyingSection:
      '"Full-procedural scene & map prompts (register rows 34, 35, 37)", lines 95-122: the '
      + 'one-page-brief pattern, the three-verb whitelist with an explicit forbidden list, the '
      + 'all-procedural clause, and the fable-test Z-up-centimetres to Y-up-metres conversion '
      + 'with cache-build progress UX.',
  },
  'ai-3d-asset-generation-loop': {
    readAt: '2026-09-12',
    coverage: 'full body, 203 lines, frontmatter to final line',
    specifyingSection:
      '"Mesh optimization station: Needle Mesh Baker (register row 36)", lines 168-179 (voxel '
      + 'remesh plus highpoly-to-lowpoly attribute bake), and "The local native route for the '
      + 'AI-generated-mesh lane (register row 45)", lines 181-203.',
  },
  'threejs-webgpu-water': {
    readAt: '2026-09-12',
    coverage: 'full body, 343 lines, frontmatter to final line',
    specifyingSection:
      '"1. Beer-Lambert absorption first", lines 90-106, and "2. Broadband backscatter", lines '
      + '108-131: the bubble term is scattering injected UPSTREAM of the absorption integral, '
      + 'flat-in/red-filtered-out gives the green shift, and it must be zero in calm water. '
      + 'Restated by the gotcha at line 333 and the acceptance line at 313-314.',
  },
  'comfyui-3d-native-pipeline': {
    readAt: '2026-09-12',
    coverage: 'full body, 247 lines, frontmatter to final line',
    specifyingSection:
      '"The node chain, in execution order" step 6, lines 70-72, plus the licence-reality '
      + 'section at 195-210 (the DINOv3 backbone under Meta\'s custom licence inside a bundle '
      + 'whose model card says MIT).',
  },
  'realtime-browser-qa': {
    readAt: '2026-09-12',
    coverage: 'full body, 216 lines, frontmatter to final line',
    specifyingSection:
      '"10. Sweep the whole artifact mechanically when it is too large to audit by playing it", '
      + 'lines 91-138, and the gotcha at line 142 which cites register row 50 by name: step the '
      + 'centreline at a fixed interval, sweep the full width, require a player-radius disc to '
      + 'fit, collapse blocked stations into runs, exit non-zero. Its "build the probe out of '
      + 'the product\'s own runtime, not a re-implementation" rule is the limitation this row '
      + 'declares against itself.',
  },
};

/** What consumes the method in this lane, per row. Written, not derived. */
const CONSUMERS = {
  35: 'applyBrief() enforces the three-verb whitelist and returns a reason per refusal; the surface is hashed from src/map3/noise.ts with no external asset.',
  36: 'voxelRemesh() clusters vertices on a settable grid and averages the highpoly normals into the replacing cell.',
  37: 'convertZupCentimetres() is the single ingest boundary; the cache pass reveals a record only as its entry completes.',
  38: 'splineDensity() and maskField() are separate functions; the mask decides admissibility before density is consulted.',
  39: 'replay() walks OPERATION_LOG and rejects an operation whose precondition is unmet instead of reordering it.',
  40: 'litRoomCells() recomputes emission from the live voxel grid; no THREE light object exists in the demo.',
  41: 'Each bay is built by index and is resolvable without constructing any other.',
  42: 'deriveBuilding() rewrites a footprint into podium/shaft/crown and derives bay count from face width over bay width.',
  43: 'The same props are built twice: merged with irradiance in vertex colour, and separable under one positioned light that moves in update().',
  44: 'None. Blocked: no factory is exported and the manifest entry carries no createDemo.',
  45: 'voxelToMesh() -> weldVertices() -> fillHoles() -> averaged normals, in that order, with the order itself asserted by the CPU check.',
  46: 'shadeCorrect() injects the bubble term inside the absorption integral; shadeTintedAfter() adds the same energy afterwards, and the test asserts only the first produces a green shift.',
  47: 'The cell is authored road first, then paving and kerb, then instanced facade bays, then furniture.',
  48: 'A narrow desaturated value band, emissive fixtures, two declared short-range lights on visible fixtures, and per-vertex distance darkening.',
  49: 'stepCriticallyDamped() places each constraint; the last four produced frames are retained as the next window\'s context.',
  50: 'sweepCorridor() walks the centreline every 1.5 m and admits a 0.34 m disc or records a blocked run; the companion script exits non-zero on any survivor.',
};

/** CPU checks actually executed against each row on 2026-09-12. */
const CPU_CHECKS = {
  all: 'group-c-demos.test.ts: instantiate, assert metadata agrees with the manifest, assert every position is finite, assert bounded mesh/vertex counts, assert no undeclared light, advance 12 steps, dispose and assert the root is empty.',
  35: 'whitelist admits exactly pump/door/fridge and refuses the rest with a reason.',
  36: 'coarse remesh reduces triangle count; a finer grid keeps more; every baked normal is unit length.',
  37: 'source Z becomes scene Y, handedness preserved by negating source Y, extents follow the same swap.',
  38: 'a point dense by the spline field is still refused by the mask.',
  39: 'the scatter that arrives before its terrain is rejected with a reason naming terrain.',
  40: 'lit cells fall after the ceiling above them is carved; an empty grid lights nothing.',
  42: 'the mass tiles the height exactly; a wider building gets MORE bays of the same width.',
  45: 'weld strictly reduces vertices without changing triangle count, and after fill no edge is used by exactly one triangle.',
  46: 'scatter-inside is green-shifted and tint-after is not; both agree exactly at zero turbulence.',
  49: 'converges to the target with overshoot below 1e-3.',
  50: 'the defective corridor reports blocked runs, the cleared one reports none, and a corridor narrower than the disc fails at every station.',
};

const packet = JSON.parse(readFileSync(PACKET, 'utf8'));
const attempts = JSON.parse(readFileSync(ATTEMPTS, 'utf8'));

const byId = new Map();
for (const attempt of attempts.attempts) {
  if (!byId.has(attempt.sourceId)) byId.set(attempt.sourceId, []);
  byId.get(attempt.sourceId).push(attempt);
}

/** Pulls one bolded register field (Canonical, Licence, Decision) out of a row. */
function registerField(section, label) {
  const line = section
    .split('\n')
    .find((entry) => entry.trim().startsWith(`- **${label}`));
  return line ? line.trim().replace(/^- \*\*/, '').trim() : null;
}

const rows = packet.rows.map((row) => {
  const carriers = (row.carrierSkills ?? []).map((carrier) => {
    let actualSha = null;
    let lines = null;
    try {
      const bytes = readFileSync(carrier.path);
      actualSha = createHash('sha256').update(bytes).digest('hex');
      lines = bytes.toString('utf8').split('\n').length;
    } catch {
      actualSha = 'UNREADABLE';
    }
    const read = CARRIER_READS[carrier.name];
    return {
      name: carrier.name,
      path: carrier.path,
      packetSha256: carrier.sha256,
      actualSha256: actualSha,
      driftFromPacket: actualSha !== carrier.sha256,
      lines,
      fullBodyReadInRecoveryWindow: Boolean(read),
      readAt: read?.readAt ?? null,
      coverage: read?.coverage ?? 'NOT READ in the 2026-09-12 recovery window',
      specifyingSection: read?.specifyingSection ?? null,
    };
  });

  return {
    sourceId: row.id,
    registerTitle: row.title,
    registerLine: row.line,
    canonical: registerField(row.registerSection, 'Canonical'),
    licence: registerField(row.registerSection, 'Licence'),
    decision: registerField(row.registerSection, 'Decision'),
    urls: (byId.get(row.id) ?? []).map((attempt) => ({
      url: attempt.url,
      role: attempt.role,
      note: attempt.note ?? null,
      outcome: attempt.outcome,
      httpStatus: attempt.httpStatus ?? null,
      bytes: attempt.bytes ?? null,
      sha256: attempt.sha256 ?? null,
      attemptedAt: attempt.attemptedAt,
      redirected: attempt.redirected ?? null,
      finalUrl: attempt.finalUrl ?? null,
    })),
    unfetchedPacketUrls: row.urls.filter(
      (url) => !(byId.get(row.id) ?? []).some((attempt) => attempt.url === url),
    ),
    carrierSkills: carriers,
    carrierReadComplete: carriers.every((carrier) => carrier.fullBodyReadInRecoveryWindow),
    methodConsumer: CONSUMERS[row.id] ?? null,
    cpuChecks: CPU_CHECKS[row.id] ? [CPU_CHECKS.all, CPU_CHECKS[row.id]] : [CPU_CHECKS.all],
    renderedAcceptance: 'OPEN — root owns the serialized browser pass; nothing here inspects a pixel.',
  };
});

const report = {
  schemaVersion: 1,
  generatedBy: 'scripts/technique-lab/group-c/build-source-research.mjs',
  generatedAt: '2026-09-12',
  scope: { group: 'C', sourceIds: packet.scope },
  provenance: {
    packet: PACKET,
    packetInventorySha256: packet.inventorySha256,
    packetRegisterSha256: packet.registerSha256,
    fetchLedger: ATTEMPTS,
    fetchLedgerGeneratedAt: attempts.generatedAt,
    fetchAttemptCount: attempts.attemptCount,
    note:
      'Every URL record below is the earlier pass\'s dated fetch, reused with attribution '
      + 'rather than refetched. No URL was fetched while building this report.',
  },
  readingRule:
    'A hash match proves the carrier file has not drifted since the packet was built. It does '
    + 'NOT prove the body was read. `fullBodyReadInRecoveryWindow` is the read claim, and it is '
    + 'false wherever the body was not read end to end on 2026-09-12.',
  rows,
};

const serialised = `${JSON.stringify(report, null, 2)}\n`;

if (process.argv.includes('--check')) {
  const existing = readFileSync(OUT, 'utf8');
  if (existing !== serialised) {
    console.error('SOURCE_RESEARCH.json is stale: rebuild it with this script.');
    process.exit(1);
  }
  console.log('SOURCE_RESEARCH.json matches a fresh build.');
} else {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, serialised);
  const blocked = rows.filter((row) => row.urls.some((url) => url.outcome !== 'ok'));
  const unread = rows.filter((row) => !row.carrierReadComplete).map((row) => row.sourceId);
  console.log(`wrote ${OUT}`);
  console.log(`rows: ${rows.length}; rows with a non-ok URL: ${blocked.map((r) => r.sourceId).join(', ')}`);
  console.log(`rows with an unread carrier: ${unread.join(', ')}`);
}
