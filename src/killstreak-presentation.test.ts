import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KillstreakPresentation } from './killstreak-presentation';
import type { KillstreakRecipientSnapshot } from './killstreak-runtime';

const snapshot = (count: number): KillstreakRecipientSnapshot => ({
  schemaVersion: 1,
  matchEpoch: 1,
  revision: 1,
  actors: [],
  entities: Array.from({ length: count }, (_, index) => ({
    id: `ks-1-swarm-drone-${index + 1}`,
    activationId: `activation-${index + 1}`,
    ownerId: 'owner',
    team: 0,
    kind: index === 0 ? 'chopper' : index === 1 ? 'care-crate' : 'drone',
    mode: index <= 1 ? null : 'swarm',
    phase: 'active',
    position: [index, 4, 0],
    velocity: [1, 0, 0],
    health: 50,
    expiresInMs: 10_000,
    magazine: index <= 1 ? null : 20,
    reserveClips: null,
    gunController: index === 0 ? 'ai' : null,
    captureProgress: null,
    revealedReward: null,
    revision: 1,
  })),
});

describe('killstreak presentation', () => {
  it('renders a sleek chopper/care/drone vocabulary and retires stale entities', () => {
    const scene = new THREE.Scene();
    const presentation = new KillstreakPresentation(scene);
    presentation.sync(snapshot(3), 1_000);
    expect(presentation.telemetry()).toEqual({ entities: 3, impactFlashes: 0, bounded: true });
    expect(presentation.root.getObjectByName('chopper-sleek-cockpit-canopy')).toBeDefined();
    expect(presentation.root.getObjectByName('care-package-parachute')).toBeDefined();
    expect(presentation.root.getObjectByName('pass65-swarm-drone')).toBeDefined();
    presentation.sync(snapshot(0), 1_100);
    expect(presentation.telemetry().entities).toBe(0);
    presentation.dispose();
    expect(scene.getObjectByName('pass65-killstreak-presentations')).toBeUndefined();
  });

  it('caps malformed presentation storms at the authority snapshot bound', () => {
    const presentation = new KillstreakPresentation(new THREE.Scene());
    presentation.sync(snapshot(40), 1_000);
    expect(presentation.telemetry()).toMatchObject({ entities: 32, bounded: true });
    presentation.dispose();
  });
});
