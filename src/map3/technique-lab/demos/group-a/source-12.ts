/**
 * Source 12 — Closed-loop asset generation with browser self-verification.
 *
 * Primary source read 2026-09-12: the post, served by x.com. Author text
 * verbatim from the page's own og:description:
 *   "Wow, if you connect Fable to image-gen and image-to-3D APIs, it's *insane*
 *    for game dev. / It made an infinite explorable universe, with characters
 *    and lore. All assets and sound completely from scratch. / 3 prompts in 2
 *    hours, max effort. Workflow below."
 * The register records the named ingredients: an image-generation API (Gemini),
 * an image-to-3D API (fal.ai), and a browser self-verification loop
 * (agent-browser CLI) that let the agent VERIFY assets visually and close the
 * loop. No repository; the playable result is hosted.
 *
 * The reusable atom is the loop shape, not the vendors. fal.ai and Gemini are
 * paid external APIs and were NOT invoked. The browser leg is not run here
 * either — this lane runs no browser or GPU job.
 *
 * So the artefact is the half that can be honestly closed on a CPU: a candidate
 * acceptance harness with declared, falsifiable criteria. Candidates are
 * proposed from a seeded generator, each is measured, and the harness REJECTS
 * until one passes. The scene keeps the last rejected candidate beside the
 * accepted one, with its failing criterion marked, so the loop's decision is
 * inspectable instead of asserted.
 */

import {
  DisposalRegistry,
  countDrawables,
  countTriangles,
  geometryIsFinite,
  makeRng,
  sideBySide,
  type Demo,
  type DemoContext,
  type ThreeNamespace,
} from './_shared';
import type * as THREE_NS from 'three';

export interface AcceptanceCriteria {
  maxTriangles: number;
  minTriangles: number;
  heightMetres: [number, number];
  maxDegenerateTriangles: number;
  requireFinite: boolean;
  maxAspect: number;
}

export const CRITERIA: AcceptanceCriteria = {
  minTriangles: 60,
  maxTriangles: 800,
  heightMetres: [0.45, 0.75],
  maxDegenerateTriangles: 0,
  requireFinite: true,
  maxAspect: 3.2,
};

export interface CandidateReport {
  index: number;
  triangles: number;
  height: number;
  aspect: number;
  degenerate: number;
  finite: boolean;
  accepted: boolean;
  failures: string[];
}

/** Count triangles whose area is effectively zero — a classic generator defect. */
function countDegenerate(geometry: THREE_NS.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  let degenerate = 0;
  const ax = [0, 0, 0];
  const bx = [0, 0, 0];
  const cx = [0, 0, 0];
  for (let i = 0; i + 2 < count; i += 3) {
    const i0 = index ? index.getX(i) : i;
    const i1 = index ? index.getX(i + 1) : i + 1;
    const i2 = index ? index.getX(i + 2) : i + 2;
    ax[0] = position.getX(i0); ax[1] = position.getY(i0); ax[2] = position.getZ(i0);
    bx[0] = position.getX(i1); bx[1] = position.getY(i1); bx[2] = position.getZ(i1);
    cx[0] = position.getX(i2); cx[1] = position.getY(i2); cx[2] = position.getZ(i2);
    const ux = bx[0] - ax[0], uy = bx[1] - ax[1], uz = bx[2] - ax[2];
    const vx = cx[0] - ax[0], vy = cx[1] - ax[1], vz = cx[2] - ax[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (Math.hypot(nx, ny, nz) * 0.5 < 1e-9) degenerate += 1;
  }
  return degenerate;
}

/** Propose: a seeded generator whose early candidates are genuinely bad. */
function proposeCandidate(
  THREE: ThreeNamespace,
  registry: DisposalRegistry,
  rng: () => number,
  attempt: number,
): { group: THREE_NS.Group; geometry: THREE_NS.BufferGeometry } {
  const group = new THREE.Group();
  group.name = `candidate-${attempt}`;
  // Attempt 0 is deliberately too tall and too thin; later attempts converge.
  const height = attempt === 0 ? 1.35 : 0.4 + rng() * 0.35;
  const radius = attempt === 0 ? 0.06 : 0.12 + rng() * 0.12;
  const segments = attempt === 0 ? 5 : 10 + Math.floor(rng() * 6);

  const geometry = registry.track(new THREE.CylinderGeometry(radius * 0.75, radius, height, segments, 2));
  const material = registry.track(
    new THREE.MeshStandardMaterial({ color: attempt === 0 ? 0x8a3b3b : 0x3f7f6a, roughness: 0.55, metalness: 0.2 }),
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = height / 2;
  group.add(mesh);

  const capGeometry = registry.track(new THREE.SphereGeometry(radius * 0.9, segments, 6));
  const cap = new THREE.Mesh(capGeometry, material);
  cap.position.y = height;
  group.add(cap);

  return { group, geometry };
}

/** Falsify + verify: measure, then decide. The harness never asks the proposer. */
export function evaluateCandidate(
  THREE: ThreeNamespace,
  group: THREE_NS.Object3D,
  geometry: THREE_NS.BufferGeometry,
  index: number,
): CandidateReport {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const triangles = countTriangles(group);
  const degenerate = countDegenerate(geometry);
  const finite = geometryIsFinite(geometry);
  const aspect = size.y / Math.max(1e-6, Math.max(size.x, size.z));

  const failures: string[] = [];
  if (triangles < CRITERIA.minTriangles) failures.push('below minimum triangle budget');
  if (triangles > CRITERIA.maxTriangles) failures.push('above maximum triangle budget');
  if (size.y < CRITERIA.heightMetres[0] || size.y > CRITERIA.heightMetres[1]) failures.push('height outside declared range');
  if (degenerate > CRITERIA.maxDegenerateTriangles) failures.push('degenerate triangles present');
  if (CRITERIA.requireFinite && !finite) failures.push('non-finite vertex data');
  if (aspect > CRITERIA.maxAspect) failures.push('silhouette aspect outside range');

  return { index, triangles, height: size.y, aspect, degenerate, finite, accepted: failures.length === 0, failures };
}

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const registry = new DisposalRegistry();
  const rng = makeRng(context.seed ^ 0xc105ed);

  const reports: CandidateReport[] = [];
  let rejected: THREE_NS.Group | null = null;
  let accepted: THREE_NS.Group | null = null;

  // Bounded: at most six rounds, exactly as the loop discipline requires. If no
  // candidate passes, the harness reports failure rather than lowering the bar.
  for (let attempt = 0; attempt < 6 && !accepted; attempt += 1) {
    const candidate = proposeCandidate(THREE, registry, rng, attempt);
    const report = evaluateCandidate(THREE, candidate.group, candidate.geometry, attempt);
    reports.push(report);
    if (report.accepted) accepted = candidate.group;
    else if (!rejected) rejected = candidate.group;
  }

  const left = rejected ?? new THREE.Group();
  const right = accepted ?? new THREE.Group();
  left.name = 'before:rejected-candidate';
  right.name = 'after:accepted-candidate';

  // Mark the rejected candidate so the reason is on screen, not only in JSON.
  if (rejected) {
    const flagGeometry = registry.track(new THREE.PlaneGeometry(0.3, 0.06));
    const flagMaterial = registry.track(
      new THREE.MeshBasicMaterial({ color: 0xd94f3d, toneMapped: false, side: THREE.DoubleSide }),
    );
    const flag = new THREE.Mesh(flagGeometry, flagMaterial);
    flag.position.y = 1.5;
    flag.name = `rejected:${reports[0]?.failures.join('; ') || 'unknown'}`;
    rejected.add(flag);
  }

  const root = sideBySide(THREE, registry, left, right, 2.0);
  root.name = 'source-12:closed-loop-asset-acceptance';
  root.userData.candidateReports = reports;

  const metadata = {
    sourceId: 12,
    title: 'Closed-loop asset generation with browser self-verification',
    method:
      'Propose -> falsify -> verify on assets: a bounded loop where a generator proposes candidates and an independent harness measures each against declared criteria (triangle budget, declared height range, degenerate-triangle count, finite vertex data, silhouette aspect) and rejects until one passes, without ever asking the proposer.',
    adaptation: 'adapted' as const,
    sources: [
      'https://x.com/anshuc/status/2065598069790716294',
      'post text read 2026-09-12 from the page served by x.com (og:description)',
    ],
    limitation:
      'The browser visual self-verification leg - the half the author says closed the loop - is OPEN. No browser, screenshot or GPU job runs in this lane, so only CPU-inspectable criteria are enforced and rendered quality is unverified. fal.ai and Gemini are paid external APIs and were never invoked; no image or image-to-3D generation happened. No repository exists upstream to pin.',
    counters: {
      triangles: countTriangles(root),
      drawables: countDrawables(root),
      rounds: reports.length,
      rejectedCandidates: reports.filter((r) => !r.accepted).length,
      acceptedCandidates: reports.filter((r) => r.accepted).length,
    },
  };

  return {
    root,
    update(time: number) {
      left.rotation.y = time * 0.5;
      right.rotation.y = time * 0.5;
    },
    dispose() {
      registry.run();
    },
    metadata,
  };
}

export default createDemo;
