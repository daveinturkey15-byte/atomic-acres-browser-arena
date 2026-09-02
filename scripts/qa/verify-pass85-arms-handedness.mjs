// HF-413 (Lane Z, PASS 85) - standing falsifier for the first-person arms and
// weapon MIRRORING/HANDEDNESS class.
//
// Why this exists. August's first-person arms burned 13 GLB regenerations and
// 11 .blend rewrites, and the recurring defect class was never asset quality -
// it was handedness: a negative scale somewhere in the chain, or a socket
// authored on the wrong side of the weapon. Nothing in the tree asserted either
// property, so both could return silently after any re-export.
//
// This gate reads the shipped GLB node graphs directly (no Blender, no browser,
// no GPU) and rejects:
//
//   1. Any node in the arms, weapon or operator corpus whose LOCAL TRANSFORM
//      has a non-positive determinant. A negative determinant IS a mirror: it
//      flips winding, turns a right hand into a left hand and cannot be
//      expressed by the quaternion IK solver, which is exactly how a mirrored
//      arm survives a green test suite.
//      SCOPE, stated so nobody over-reads this gate: local node TRS/matrix
//      only. A handedness flip baked into vertex data or into accessor winding
//      is NOT detected here; the receipt repeats this scope note.
//   2. A firing-side socket ('grip-socket-r', 'eject-socket') on the support
//      side, or a support-side socket ('support-socket-l') on the firing side.
//   3. A reload contact that does not sit beside the ammunition it is supposed
//      to reach.
//
// HOW CLAUSE 3 WAS DERIVED, and the review that corrected it (2026-09-02).
// The first version of this gate asserted "a `*-socket-l` socket must be on
// negative X" and reported six violations - the M134's `reload-socket-l` at
// x=+0.250. That rule read the socket's NAME instead of the weapon, and acting
// on it moved the M134 reload contact 0.53 m AWAY from its own ammunition.
// Re-measured over all 120 shipped weapon GLBs that carry a reload socket
// (every one of them also carries `magazine-socket`):
//
//   114 files: magazine-socket on the centreline (x = 0.000 exactly),
//              reload-socket-l at x = -0.070 .. -0.200,
//              reload-to-magazine distance 0.083 .. 0.328 m
//     6 files: the M134 minigun, the one weapon with a SIDE-MOUNTED drum -
//              magazine-socket AND the modelled M134_AmmoDrum both at x=+0.28,
//              reload-socket-l at +0.250, distance 0.062 m (the tightest
//              reload/magazine relationship in the corpus)
//
// So the invariant the corpus expresses is ADJACENCY to that weapon's own
// magazine, plus support-side handedness for the weapons whose magazine is on
// the centreline. Both clauses below report zero violations on the shipped
// corpus, and between them they still catch the defect the gate exists for:
// mirroring an ordinary weapon's reload contact to +X trips the centreline
// clause, and mirroring the M134's to -X trips the adjacency clause at 0.533 m.
//
// Run: npm run qa:pass85:arms-handedness
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const CORPUS_ROOTS = Object.freeze([
  'public/assets/original/models/operators',
  'public/assets/original/models/weapons',
]);

export const ARMS_HANDEDNESS_CONTRACT = 'positive-determinant-nodes-magazine-adjacent-reload-contact-v2';

/**
 * Sign every socket family must be authored on, measured on the socket's own
 * local X in weapon space. `0` is accepted for centreline sockets.
 * `reload-socket-l` is deliberately absent: its side is decided by where that
 * weapon's magazine actually is (see RELOAD_CONTACT_CONTRACT below).
 */
const SOCKET_SIDE_CONTRACT = Object.freeze([
  { name: 'grip-socket-r', side: 'firing', minimum: 0 },
  { name: 'eject-socket', side: 'firing', minimum: 0 },
  { name: 'support-socket-l', side: 'support', maximum: 0 },
]);

export const RELOAD_CONTACT_CONTRACT = Object.freeze({
  /**
   * The support hand's reload contact must be able to reach that weapon's own
   * magazine. Measured corpus maximum is 0.328 m (machine-pistol, a grip-fed
   * magazine with a long draw); the ceiling leaves that headroom and still
   * rejects a mirrored M134 contact at 0.533 m.
   */
  maximumMagazineDistanceMeters: 0.4,
  /**
   * A magazine within this of the centreline is a centreline magwell. Every
   * shipped centreline magazine is at exactly x = 0.000.
   */
  centrelineToleranceMeters: 0.02,
});

function collectGlbFiles(root, out = []) {
  if (!statSync(root, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(root)) {
    const candidate = join(root, entry);
    if (statSync(candidate).isDirectory()) collectGlbFiles(candidate, out);
    else if (candidate.endsWith('.glb')) out.push(candidate);
  }
  return out;
}

function readGlbJson(file) {
  const buffer = readFileSync(file);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a GLB container`);
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

/** Determinant of a node's LOCAL transform, from TRS or from a raw matrix. */
function nodeDeterminant(node) {
  if (Array.isArray(node.matrix)) {
    const m = node.matrix;
    return m[0] * (m[5] * m[10] - m[6] * m[9])
      - m[4] * (m[1] * m[10] - m[2] * m[9])
      + m[8] * (m[1] * m[6] - m[2] * m[5]);
  }
  const scale = node.scale ?? [1, 1, 1];
  return scale[0] * scale[1] * scale[2];
}

const translationOf = (node) => node?.translation ?? [0, 0, 0];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Audits one already-parsed glTF node graph. Exported separately from the file
 * reader so the falsifier test can mutate a real shipped graph and prove the
 * audit rejects the mutation instead of trusting a gate that has never failed.
 */
export function auditGlbNodeGraph(label, json) {
  const nodes = json.nodes ?? [];
  const violations = [];
  let checkedSockets = 0;
  const byName = new Map();
  for (const node of nodes) if (node.name && !byName.has(node.name)) byName.set(node.name, node);

  for (const [index, node] of nodes.entries()) {
    const name = node.name ?? `<node ${index}>`;
    const determinant = nodeDeterminant(node);
    if (!Number.isFinite(determinant) || determinant <= 0) {
      violations.push(`${label}: node "${name}" has a non-positive local transform determinant ${determinant} (mirrored node)`);
    }
    const contract = SOCKET_SIDE_CONTRACT.find((entry) => entry.name === name);
    if (!contract) continue;
    checkedSockets += 1;
    const x = translationOf(node)[0];
    if (!Number.isFinite(x)) {
      violations.push(`${label}: socket "${name}" has a non-finite X`);
      continue;
    }
    if (contract.minimum !== undefined && x < contract.minimum) {
      violations.push(`${label}: ${contract.side}-side socket "${name}" is authored at x=${x.toFixed(3)}, on the support side`);
    }
    if (contract.maximum !== undefined && x > contract.maximum) {
      violations.push(`${label}: ${contract.side}-side socket "${name}" is authored at x=${x.toFixed(3)}, on the firing side`);
    }
  }

  const reload = byName.get('reload-socket-l');
  if (reload) {
    checkedSockets += 1;
    const magazine = byName.get('magazine-socket');
    const reloadPosition = translationOf(reload);
    if (!reloadPosition.every(Number.isFinite)) {
      violations.push(`${label}: socket "reload-socket-l" has a non-finite translation`);
    } else if (!magazine) {
      // Every shipped weapon that has a reload contact also has a magazine
      // socket; without one the contact's side cannot be judged at all.
      violations.push(`${label}: "reload-socket-l" exists with no "magazine-socket" to reach`);
    } else {
      const magazinePosition = translationOf(magazine);
      const separation = distance(reloadPosition, magazinePosition);
      if (separation > RELOAD_CONTACT_CONTRACT.maximumMagazineDistanceMeters) {
        violations.push(
          `${label}: reload contact is ${separation.toFixed(3)} m from this weapon's own magazine`
          + ` (reload x=${reloadPosition[0].toFixed(3)}, magazine x=${magazinePosition[0].toFixed(3)},`
          + ` ceiling ${RELOAD_CONTACT_CONTRACT.maximumMagazineDistanceMeters} m) - the support hand reloads empty air`,
        );
      }
      if (Math.abs(magazinePosition[0]) <= RELOAD_CONTACT_CONTRACT.centrelineToleranceMeters
        && reloadPosition[0] > 0) {
        violations.push(
          `${label}: this weapon feeds from a centreline magazine (x=${magazinePosition[0].toFixed(3)})`
          + ` but its reload contact is authored at x=${reloadPosition[0].toFixed(3)}, on the firing side`
          + ' - the support arm would sweep across the receiver',
        );
      }
    }
  }

  return { file: label, nodes: nodes.length, checkedSockets, violations };
}

export function auditGlbHandedness(file) {
  return auditGlbNodeGraph(basename(file), readGlbJson(file));
}

export function readCorpusGlbJson(file) {
  return readGlbJson(file);
}

export function auditArmsAndWeaponCorpus(roots = CORPUS_ROOTS) {
  const files = roots.flatMap((root) => collectGlbFiles(root));
  if (files.length === 0) throw new Error('HF-413 handedness gate found no GLB corpus to audit');
  const audits = files.map((file) => auditGlbHandedness(file));
  return {
    files: audits.length,
    nodes: audits.reduce((total, audit) => total + audit.nodes, 0),
    sockets: audits.reduce((total, audit) => total + audit.checkedSockets, 0),
    violations: audits.flatMap((audit) => audit.violations),
  };
}

const invokedDirectly = process.argv[1]
  && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href;
if (invokedDirectly) {
  const report = auditArmsAndWeaponCorpus();
  const receipt = {
    schema: 'atomic-acres/pass85-arms-handedness@2',
    contract: ARMS_HANDEDNESS_CONTRACT,
    verdict: report.violations.length === 0 ? 'pass' : 'fail',
    scope: 'Local glTF node TRS/matrix determinants and authored socket positions only. '
      + 'A handedness flip baked into vertex data or accessor winding is NOT covered by this gate.',
    reloadContact: RELOAD_CONTACT_CONTRACT,
    files: report.files,
    nodes: report.nodes,
    sockets: report.sockets,
    violations: report.violations,
  };
  console.log(JSON.stringify(receipt, null, 2));
  if (report.violations.length > 0) {
    console.error(`HF-413 arms/weapon handedness gate failed:\n- ${report.violations.join('\n- ')}`);
    process.exit(1);
  }
}
