// Temporary HF-340 probe — measures pole/solver bend geometry to pin the
// symmetry-regression tolerances. DELETE after measurements are collected.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  FIRST_PERSON_FIRING_ELBOW_POLE_LOWERED,
  FIRST_PERSON_FIRING_ELBOW_POLE_RAISED,
  FIRST_PERSON_SUPPORT_ELBOW_POLE,
  firstPersonFiringElbowPole,
} from './weapon-presentation-pose-profiles';
import { solveTwoBoneElbow } from './ik';


function measure(label: string, shoulder: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, out: unknown[]) {
  const upper = 0.34;
  const lower = 0.30;
  const elbow = solveTwoBoneElbow(shoulder, target, upper, lower, pole);
  const chord = target.clone().sub(shoulder);
  const t = THREE.MathUtils.clamp(elbow.clone().sub(shoulder).dot(chord) / chord.lengthSq(), 0, 1);
  const closest = shoulder.clone().addScaledVector(chord, t);
  const offset = elbow.clone().sub(closest);
  const offsetLen = offset.length();
  const upperSeg = shoulder.clone().sub(elbow);
  const lowerSeg = target.clone().sub(elbow);
  const interior = Math.acos(THREE.MathUtils.clamp(upperSeg.dot(lowerSeg) / (upperSeg.length() * lowerSeg.length()), -1, 1));
  out.push({
    label,
    offsetYDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(offset.y / Math.max(offsetLen, 1e-9), -1, 1))),
    offsetXDeg: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(offset.x / Math.max(offsetLen, 1e-9), -1, 1))),
    interiorDeg: THREE.MathUtils.radToDeg(interior),
  });
}

describe('HF-340 pole symmetry probe', () => {
  it('measures', async () => {
    const rows: unknown[] = [];
    // Mirrored chains: production-like firing (right) shoulder low-right off-frame
    // aiming at a centre-right grip; support (left) is the x-negated mirror.
    const rightShoulder = new THREE.Vector3(0.62, -0.66, -0.18);
    const rightTarget = new THREE.Vector3(0.30, -0.36, -0.72);
    const leftShoulder = rightShoulder.clone().multiply(new THREE.Vector3(-1, 1, 1));
    const leftTarget = rightTarget.clone().multiply(new THREE.Vector3(-1, 1, 1));
    for (const [family, pole] of [
      ['long-gun-lowered', FIRST_PERSON_FIRING_ELBOW_POLE_LOWERED],
      ['raised(14a9344c)', FIRST_PERSON_FIRING_ELBOW_POLE_RAISED],
    ] as const) {
      measure(`right/${family}`, rightShoulder, rightTarget, pole, rows);
    }
    measure('left/support', leftShoulder, leftTarget, FIRST_PERSON_SUPPORT_ELBOW_POLE, rows);
    // High-ready blend samples for long-gun
    for (const blend of [0, 0.25, 0.5, 0.75, 1]) {
      const pole = firstPersonFiringElbowPole('long-gun', blend, new THREE.Vector3());
      measure(`right/long-gun@${blend}`, rightShoulder, rightTarget, pole, rows);
    }
    const fs = await import('node:fs');
    fs.writeFileSync(
      'C:/Users/david/AppData/Local/Temp/claude/C--Users-david-Desktop-stuff/51a3bc77-45cc-4dd5-a1a1-cb32efb10af8/scratchpad/hf340-pole-probe.json',
      JSON.stringify(rows, null, 2),
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
