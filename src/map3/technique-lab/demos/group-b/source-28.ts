/**
 * Source 28 - WebGPU/TSL practice skill (dgreenheck/webgpu-claude-skill).
 *
 * Primary source, re-read at the pinned revision on 2026-09-12 (cached outside the
 * repository, sha256 in SOURCE_RESEARCH.json):
 *   https://github.com/dgreenheck/webgpu-claude-skill @ af2319bd01bb7cc881267a9ef42cafdaf5e9029d
 *   skills/webgpu-threejs-tsl/SKILL.md (3,202 B) and skills/webgpu-threejs-tsl/docs/
 *   materials.md (8,786 B), both read IN FULL this session.
 *
 * LICENCE POSITION - load-bearing: the repository has NO licence (our own probe at the
 * pinned revision returned HTTP 404; the GitHub licence field is null). All rights reserved.
 * The materials document was read to learn what it teaches; NOTHING of its text or code is
 * reproduced. The method below is restated in our own implementation from the concepts it
 * catalogues.
 *
 * THE EXTRACTED METHOD, restated: the skill teaches node-material properties - notably an
 * emissive/color graph driven by a threshold over procedural per-fragment noise, with an
 * edge term isolated via smoothstep between the threshold and a narrow band above it, and a
 * uniform controlling the threshold over time. THE SCENE evaluates that exact graph shape on
 * the CPU: per-vertex hash noise over a dense grid, an animated uniform threshold, vertex
 * colors lerped solid-to-void with a bright edge band. Two panels stand side by side as
 * before (threshold 0, intact) and after (dissolving) - the comparison the skill's
 * "custom material" example category exists to teach.
 *
 * COMPATIBILITY DIFFERENCE: the source technique is a per-FRAGMENT GPU graph on a
 * MeshStandardNodeMaterial; a lab scene owns no renderer and this repo forbids GLSL on the
 * WebGPU path, so the graph is evaluated per-VERTEX on the CPU into vertex colors - coarser,
 * and honest about being so. The node graph one would build is recorded in
 * docs/technique-lab/group-b/skill-pack-comparisons.md.
 */

import { hash2 } from './rng';
import { disposeGroup, type Demo, type DemoContext } from './types';
import type { Mesh } from 'three';

const GRID = 48;
const NOISE_SCALE = 7;
const EDGE_BAND = 0.1;

export function createDemo(context: DemoContext): Demo {
  const { THREE } = context;
  const root = new THREE.Group();
  const disposables: { dispose: () => void }[] = [];

  const panelGeometry = new THREE.PlaneGeometry(1.4, 1.4, GRID, GRID);
  const panelMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    side: THREE.DoubleSide,
    metalness: 0,
    roughness: 0.8,
  });
  disposables.push(panelGeometry, panelMaterial);

  const before = new THREE.Mesh(panelGeometry, panelMaterial);
  before.position.set(-0.8, 0.5, 0);
  root.add(before);

  const after = new THREE.Mesh(panelGeometry.clone(), panelMaterial);
  after.position.set(0.8, 0.5, 0);
  root.add(after);
  disposables.push(after.geometry);

  const stats = {
    threshold: 0,
    dissolvedVertices: 0,
    edgeVertices: 0,
  };

  /** One CPU evaluation of the threshold/noise/edge graph for a whole panel. */
  const evaluate = (mesh: Mesh, threshold: number): void => {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    let colors = geometry.getAttribute('color');
    if (!colors) {
      colors = new THREE.BufferAttribute(new Float32Array(position.count * 3), 3);
      geometry.setAttribute('color', colors);
    }
    let dissolved = 0;
    let edge = 0;
    for (let i = 0; i < position.count; i += 1) {
      const gx = position.getX(i);
      const gy = position.getY(i);
      // Deterministic hash noise in [0,1) - the procedural cutoff field.
      const noise = hash2(
        Math.round((gx + 0.7) * NOISE_SCALE * 10),
        Math.round((gy + 0.7) * NOISE_SCALE * 10),
        9176,
      );
      let r = 0.85;
      let g = 0.85;
      let b = 0.85;
      if (noise < threshold) {
        // Void side: near-black with a cool tint so the dissolve reads against the panel.
        r = 0.05;
        g = 0.05;
        b = 0.09;
        dissolved += 1;
      } else if (noise < threshold + EDGE_BAND) {
        // Edge band: hot rim isolated by the narrow window above the threshold.
        r = 1.0;
        g = 0.55;
        b = 0.15;
        edge += 1;
      }
      colors.setXYZ(i, r, g, b);
    }
    colors.needsUpdate = true;
    stats.dissolvedVertices = dissolved;
    stats.edgeVertices = edge;
  };

  evaluate(before, 0);

  const update = (time: number, _dt: number): void => {
    // Uniform-style threshold sweeping 0 -> 0.85 -> 0 on the unfrozen clock.
    const threshold = 0.425 * (1 - Math.cos(time * 0.7));
    stats.threshold = threshold;
    evaluate(after, threshold);
  };

  const dispose = (): void => {
    for (const entry of disposables) entry.dispose();
    disposables.length = 0;
    disposeGroup(root);
  };

  root.userData.stats = stats;

  return {
    root,
    update,
    dispose,
    metadata: {
      sourceId: 28,
      title: 'WebGPU Claude skill (dgreenheck)',
      method:
        'Threshold-driven dissolve over a deterministic hash-noise field with a bright edge '
        + 'band isolated just above the threshold, threshold animated as a uniform - the '
        + 'node-material graph shape the skill teaches, evaluated per-vertex on the CPU with '
        + 'an intact/dissolving before-after pair.',
      adaptation: 'adapted',
      sources: ['https://github.com/dgreenheck/webgpu-claude-skill'],
      limitation:
        'Source has NO licence (probe 404) - all rights reserved; concepts restated, nothing '
        + 'copied. CPU per-vertex evaluation approximates the source per-fragment GPU graph; '
        + 'no WebGPURenderer, no node-material construction, no compute or post-processing. '
        + 'Our own webgpu-tsl-arena-forging skill already covers the fail-closed attestation '
        + 'route this source does not.',
    },
  };
}

export default createDemo;
