import { describe, expect, it } from 'vitest';
import { supportForwardFromYawPitch, supportYawForDirection } from './support-forward-axis';

describe('support entity negative-Z forward convention', () => {
  it('aligns yaw zero with camera/asset negative Z instead of the old inverted positive Z', () => {
    expect(supportForwardFromYawPitch(0, 0)).toEqual([-0, 0, -1]);
    expect(supportForwardFromYawPitch(Math.PI / 2, 0)[0]).toBeCloseTo(-1, 8);
    expect(supportForwardFromYawPitch(0, Math.PI / 6)[1]).toBeCloseTo(0.5, 8);
  });

  it('round-trips representative travel directions into authored yaw', () => {
    for (const [x, z] of [[0, -1], [-1, 0], [0, 1], [1, 0]] as const) {
      const yaw = supportYawForDirection(x, z);
      const forward = supportForwardFromYawPitch(yaw, 0);
      expect(forward[0]).toBeCloseTo(x, 8);
      expect(forward[2]).toBeCloseTo(z, 8);
    }
  });
});
