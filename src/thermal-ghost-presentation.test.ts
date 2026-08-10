import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ThermalGhostPresentation } from './thermal-ghost-presentation';

describe('M14 thermal ghost residency', () => {
  it('retains exact live-id ghost records across inactive ADS frames', () => {
    const scene = new THREE.Scene();
    const root = new THREE.Group();
    root.add(
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()),
      new THREE.Mesh(new THREE.SphereGeometry(0.4), new THREE.MeshBasicMaterial()),
    );
    scene.add(root);
    const presentation = new ThermalGhostPresentation();
    const target = { id: 'bot-live-7', relation: 'hostile' as const, root };

    presentation.sync([target], true);
    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 1, activeGhosts: 2 });
    const childrenAfterFirstAds = root.children.map((child) => child.children.length);

    presentation.sync([], false);
    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 1, activeGhosts: 0 });
    presentation.sync([target], true);

    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 1, activeGhosts: 2 });
    expect(root.children.map((child) => child.children.length)).toEqual(childrenAfterFirstAds);
    expect(root.getObjectsByProperty('name', 'thermal-ghost')).toHaveLength(2);
    presentation.terminalDispose();
  });
});
