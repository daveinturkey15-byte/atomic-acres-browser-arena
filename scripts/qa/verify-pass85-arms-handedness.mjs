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
//   1. Any node in the arms, weapon or operator corpus whose local transform
//      has a non-positive determinant. A negative determinant IS a mirror: it
//      flips winding, turns a right hand into a left hand and cannot be
//      expressed by the quaternion IK solver, which is exactly how a mirrored
//      arm survives a green test suite.
//   2. Any first-person/world weapon socket whose authored side contradicts its
//      name. `grip-socket-r` and `eject-socket` are firing-side (+X);
//      `support-socket-l` and `reload-socket-l` are support-side (-X). The
//      runtime binds the left chain's IK target to the `-l` sockets and the
//      right chain's to `grip-socket-r` (src/weapon-presentation.ts,
//      solveRiggedArms), so a `-l` socket on positive X makes the support arm
//      sweep across the body and through the receiver.
//
// Run: npm run qa:pass85:arms-handedness
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const CORPUS_ROOTS = Object.freeze([
  'public/assets/original/models/operators',
  'public/assets/original/models/weapons',
]);

/**
 * Sign every socket family must be authored on, measured on the socket's own
 * local X in weapon space. `0` is accepted for centreline sockets.
 */
const SOCKET_SIDE_CONTRACT = Object.freeze([
  { name: 'grip-socket-r', side: 'firing', minimum: 0 },
  { name: 'eject-socket', side: 'firing', minimum: 0 },
  { name: 'support-socket-l', side: 'support', maximum: 0 },
  { name: 'reload-socket-l', side: 'support', maximum: 0 },
]);

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

/** Determinant of a node's local transform, from TRS or from a raw matrix. */
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

export function auditGlbHandedness(file) {
  const json = readGlbJson(file);
  const nodes = json.nodes ?? [];
  const violations = [];
  let checkedSockets = 0;
  for (const [index, node] of nodes.entries()) {
    const name = node.name ?? `<node ${index}>`;
    const determinant = nodeDeterminant(node);
    if (!Number.isFinite(determinant) || determinant <= 0) {
      violations.push(`${basename(file)}: node "${name}" has a non-positive transform determinant ${determinant} (mirrored node)`);
    }
    const contract = SOCKET_SIDE_CONTRACT.find((entry) => entry.name === name);
    if (!contract) continue;
    checkedSockets += 1;
    const x = (node.translation ?? [0, 0, 0])[0];
    if (!Number.isFinite(x)) {
      violations.push(`${basename(file)}: socket "${name}" has a non-finite X`);
      continue;
    }
    if (contract.minimum !== undefined && x < contract.minimum) {
      violations.push(`${basename(file)}: ${contract.side}-side socket "${name}" is authored at x=${x.toFixed(3)}, on the support side`);
    }
    if (contract.maximum !== undefined && x > contract.maximum) {
      violations.push(`${basename(file)}: ${contract.side}-side socket "${name}" is authored at x=${x.toFixed(3)}, on the firing side`);
    }
  }
  return { file, nodes: nodes.length, checkedSockets, violations };
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
    schema: 'atomic-acres/pass85-arms-handedness@1',
    verdict: report.violations.length === 0 ? 'pass' : 'fail',
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
