import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DMR_THERMAL_MAGNIFICATION,
  deriveDmrThermalRevealActive,
  selectDmrThermalContacts,
} from './dmr-thermal-presentation';
import { railgunThermalTargetEligible } from './railgun-authority';
import { deriveRailgunScopePresentation } from './railgun-scope-state';
import { ThermalGhostPresentation, type ThermalGhostTarget } from './thermal-ghost-presentation';
import { magnifiedFovDegrees } from './weapon-presentation-state';
import type { WeaponId } from './protocol';

type RuntimeTarget = ThermalGhostTarget & Readonly<{
  kind: 'player' | 'bot';
  team: 0 | 1;
  alive: boolean;
}>;

function target(id: string, kind: 'player' | 'bot', x: number): RuntimeTarget {
  const root = new THREE.Group();
  root.name = `${kind}-${id}`;
  root.position.set(x, 0, -9);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.45), new THREE.MeshBasicMaterial());
  body.name = 'operator-body';
  body.position.y = 0.9;
  root.add(body);
  return { id, kind, team: 1, alive: true, relation: 'hostile', root };
}

function matrixHash(object: THREE.Object3D): string {
  object.updateWorldMatrix(true, true);
  return object.matrixWorld.elements.map((value) => value.toFixed(5)).join(':');
}

function activeFor(
  weapon: WeaponId,
  adsHeld: boolean,
  alive: boolean,
  localHolder = true,
): boolean {
  const baseFov = 82;
  const magnification = weapon === 'railgun' ? 2.5 : DMR_THERMAL_MAGNIFICATION;
  const cameraFov = magnifiedFovDegrees(baseFov, magnification);
  if (weapon === 'railgun') return deriveRailgunScopePresentation({
    alive,
    localHolder,
    weapon,
    adsHeld,
    adsProgress: 1,
    baseFov,
    cameraFov,
  }).revealActive;
  return deriveDmrThermalRevealActive({
    alive,
    weapon,
    adsHeld,
    adsProgress: 1,
    baseFov,
    cameraFov,
  });
}

function admittedTargets(weapon: WeaponId, candidates: readonly RuntimeTarget[]): readonly ThermalGhostTarget[] {
  if (weapon === 'railgun') {
    return candidates.filter((candidate) => railgunThermalTargetEligible(
      { id: 'observer', team: 0 },
      { id: candidate.id, team: candidate.team, alive: candidate.alive, kind: candidate.kind },
      'tdm',
    ));
  }
  if (weapon !== 'm14-ebr') return [];
  const selected = new Set(selectDmrThermalContacts(candidates.map((candidate) => ({
    id: candidate.id,
    kind: candidate.kind,
    relation: candidate.relation,
    position: candidate.root.position,
    living: candidate.alive,
    solidOccluded: true,
  }))).map(({ id }) => id));
  return candidates.filter(({ id }) => selected.has(id));
}

describe('Pass 73 trusted ADS exact-operator reveal lifecycle', () => {
  it('tracks remote and bot transforms at two poses and tears down on release, death, or swap', () => {
    const scene = new THREE.Scene();
    const remote = target('remote-1', 'player', -1.2);
    const bot = target('bot-1', 'bot', 1.2);
    scene.add(remote.root, bot.root);
    const candidates = [remote, bot] as const;
    const presentation = new ThermalGhostPresentation();

    const activate = (weapon: WeaponId, adsHeld = true, alive = true, localHolder = true): void => {
      const active = activeFor(weapon, adsHeld, alive, localHolder);
      presentation.sync(active ? admittedTargets(weapon, candidates) : [], active);
    };

    activate('m14-ebr');
    expect(presentation.telemetry()).toMatchObject({
      activeTargetIds: ['remote-1', 'bot-1'],
      activeTargets: 2,
      throughGeometry: true,
      orangeHalo: true,
    });
    const remoteBody = remote.root.getObjectByName('operator-body')!;
    const remoteGhost = remote.root.getObjectByName('through-wall-exact-operator-model')!;
    const firstPose = { source: matrixHash(remoteBody), ghost: matrixHash(remoteGhost) };
    expect(firstPose.ghost).toBe(firstPose.source);

    remote.root.position.x += 2.4;
    remote.root.rotation.y = 0.62;
    bot.root.position.z -= 1.7;
    activate('m14-ebr');
    const secondPose = { source: matrixHash(remoteBody), ghost: matrixHash(remoteGhost) };
    expect(secondPose.source).not.toBe(firstPose.source);
    expect(secondPose.ghost).not.toBe(firstPose.ghost);
    expect(secondPose.ghost).toBe(secondPose.source);

    activate('m14-ebr', false);
    expect(presentation.telemetry()).toMatchObject({ activeTargets: 0, throughGeometry: false, orangeHalo: false });
    activate('railgun');
    expect(presentation.telemetry().activeTargetIds).toEqual(['remote-1', 'bot-1']);
    activate('railgun', true, true, false);
    expect(presentation.telemetry().activeTargets).toBe(0);
    activate('railgun', true, false);
    expect(presentation.telemetry().activeTargets).toBe(0);
    activate('sniper');
    expect(presentation.telemetry()).toMatchObject({ activeTargets: 0, throughGeometry: false, orangeHalo: false });
    expect(activeFor('sniper', true, true)).toBe(false);

    presentation.terminalDispose();
  });

  it('removes a dead remote without disturbing a living bot reveal', () => {
    const scene = new THREE.Scene();
    const remote = target('remote-dead', 'player', -1);
    const bot = target('bot-live', 'bot', 1);
    scene.add(remote.root, bot.root);
    const presentation = new ThermalGhostPresentation();
    presentation.sync(admittedTargets('railgun', [remote, bot]), true);
    expect(presentation.telemetry().activeTargetIds).toEqual(['remote-dead', 'bot-live']);
    const deadRemote = { ...remote, alive: false };
    presentation.sync(admittedTargets('railgun', [deadRemote, bot]), true);
    expect(presentation.telemetry()).toMatchObject({
      trackedTargets: 2,
      activeTargetIds: ['bot-live'],
      exactModelVisible: true,
      haloVisible: true,
      throughGeometry: true,
    });
    expect((remote.root.getObjectByName('through-wall-exact-operator-model') as THREE.Mesh).visible).toBe(false);
    expect((remote.root.getObjectByName('through-wall-operator-orange-halo') as THREE.Mesh).visible).toBe(false);

    remote.root.removeFromParent();
    presentation.sync(admittedTargets('railgun', [deadRemote, bot]), true);
    expect(presentation.telemetry()).toMatchObject({ trackedTargets: 1, activeTargetIds: ['bot-live'] });
    expect(remote.root.getObjectsByProperty('name', 'through-wall-exact-operator-model')).toHaveLength(0);
    expect(remote.root.getObjectsByProperty('name', 'through-wall-operator-orange-halo')).toHaveLength(0);
    presentation.terminalDispose();
  });
});
