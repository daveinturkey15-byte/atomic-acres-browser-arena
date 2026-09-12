import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  deterministicWindowUnit,
  escapeHtml,
  framePercentile,
  KEY_CODE_LABELS,
  percentile,
  persistentWindowDebrisId,
  prettyKeyCode,
  segmentSphereFraction,
  windowDebrisPoolKey,
} from './legacy-pure-helpers';

describe('segmentSphereFraction', () => {
  const origin = new THREE.Vector3(0, 0, 0);

  it('returns null for a zero-length segment', () => {
    expect(segmentSphereFraction(origin, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 1)).toBeNull();
  });

  it('returns the nearest-approach fraction when the segment pierces the sphere', () => {
    const alpha = segmentSphereFraction(origin, new THREE.Vector3(10, 0, 0), new THREE.Vector3(5, 0, 0), 2);
    // Closest approach of a segment through the sphere centre is its midpoint.
    expect(alpha).toBeCloseTo(0.5, 10);
  });

  it('clamps to 1 when only the segment end lies inside the sphere', () => {
    expect(segmentSphereFraction(origin, new THREE.Vector3(10, 0, 0), new THREE.Vector3(12, 0, 0), 2)).toBe(1);
  });

  it('returns null when even the clamped end is outside the sphere', () => {
    expect(segmentSphereFraction(origin, new THREE.Vector3(10, 0, 0), new THREE.Vector3(20, 0, 0), 2)).toBeNull();
  });

  it('clamps to 0 when the segment starts inside the sphere', () => {
    expect(segmentSphereFraction(origin, new THREE.Vector3(10, 0, 0), origin, 2)).toBe(0);
  });

  it('returns null on a clean miss', () => {
    expect(segmentSphereFraction(origin, new THREE.Vector3(10, 0, 0), new THREE.Vector3(5, 50, 0), 2)).toBeNull();
  });
});

describe('deterministicWindowUnit', () => {
  it('is deterministic for identical inputs', () => {
    expect(deterministicWindowUnit('window:1', 7)).toBe(deterministicWindowUnit('window:1', 7));
  });

  it('varies with id and salt', () => {
    expect(deterministicWindowUnit('window:1', 7)).not.toBe(deterministicWindowUnit('window:2', 7));
    expect(deterministicWindowUnit('window:1', 7)).not.toBe(deterministicWindowUnit('window:1', 8));
  });

  it('stays within [0, 1) across many inputs', () => {
    for (let salt = 0; salt < 50; salt += 1) {
      for (let i = 0; i < 50; i += 1) {
        const unit = deterministicWindowUnit(`w-${i}`, salt);
        expect(unit).toBeGreaterThanOrEqual(0);
        expect(unit).toBeLessThan(1);
      }
    }
  });
});

describe('persistentWindowDebrisId', () => {
  it('canonicalises case and characters', () => {
    expect(persistentWindowDebrisId('House_A/Pane 1')).toBe('window-debris:house-a-pane-1');
  });

  it('caps the canonical segment at 104 characters', () => {
    const id = persistentWindowDebrisId('x'.repeat(300));
    expect(id.startsWith('window-debris:')).toBe(true);
    expect(id.length).toBe('window-debris:'.length + 104);
  });
});

describe('windowDebrisPoolKey', () => {
  it('prefixes the arena id onto the debris id', () => {
    expect(windowDebrisPoolKey('atomic-acres', 'Pane#2')).toBe('atomic-acres:window-debris:pane-2');
  });
});

describe('escapeHtml', () => {
  it('escapes all five markup characters', () => {
    expect(escapeHtml(`<a href="x" class='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;&amp;',
    );
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('hello world 123')).toBe('hello world 123');
  });
});

describe('KEY_CODE_LABELS and prettyKeyCode', () => {
  it('strips the Key prefix and uppercases', () => {
    expect(prettyKeyCode('KeyW')).toBe('W');
    expect(prettyKeyCode('KeyF')).toBe('F');
  });

  it('strips the Digit prefix', () => {
    expect(prettyKeyCode('Digit5')).toBe('5');
  });

  it('maps labelled codes through the table', () => {
    expect(prettyKeyCode('Space')).toBe('SPACE');
    expect(prettyKeyCode('ShiftLeft')).toBe('L-SHIFT');
    expect(prettyKeyCode('ArrowUp')).toBe('↑');
    for (const [code, label] of Object.entries(KEY_CODE_LABELS)) {
      expect(prettyKeyCode(code)).toBe(label);
    }
  });

  it('passes unknown codes through unchanged', () => {
    expect(prettyKeyCode('F13')).toBe('F13');
  });
});

describe('percentile', () => {
  it('returns +Infinity for empty input', () => {
    expect(percentile([], 0.5)).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns min, median, max by quantile', () => {
    const values = [30, 10, 20];
    expect(percentile(values, 0)).toBe(10);
    expect(percentile(values, 0.5)).toBe(20);
    expect(percentile(values, 1)).toBe(30);
  });

  it('clamps out-of-range quantiles', () => {
    const values = [1, 2, 3];
    expect(percentile(values, -1)).toBe(1);
    expect(percentile(values, 2)).toBe(3);
  });

  it('does not mutate its input', () => {
    const values = [3, 1, 2];
    percentile(values, 0.5);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe('framePercentile', () => {
  it('returns 0 for empty input', () => {
    expect(framePercentile([], 0.99)).toBe(0);
  });

  it('returns the nearest-rank value', () => {
    const samples = [16, 8, 33, 12, 25];
    expect(framePercentile(samples, 0)).toBe(8);
    expect(framePercentile(samples, 1)).toBe(33);
    expect(framePercentile(samples, 0.5)).toBe(16);
  });

  it('does not mutate its input', () => {
    const samples = [16, 8, 33];
    framePercentile(samples, 0.5);
    expect(samples).toEqual([16, 8, 33]);
  });
});
