import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

describe('remote operator telemetry integration', () => {
  it('observes the canonical rig beneath the network wrapper', () => {
    expect(main).toContain(
      'operatorModel: riggedOperatorTelemetry(remote.root.userData.operator as THREE.Object3D)',
    );
    expect(main).not.toContain('operatorModel: riggedOperatorTelemetry(remote.root),');
    expect(main).toContain(
      'readability: remoteHumanReadabilityTelemetry(remote.root.userData.operator as THREE.Object3D)',
    );
  });
});
