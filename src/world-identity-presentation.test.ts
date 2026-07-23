import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { arenaLightingProfile } from './blender-lighting';
import { createWorldIdentityPresentation, setWorldIdentityHouseShellPresentation } from './world-identity-presentation';

describe('Pass 29 practical and interior presentation', () => {
  it('creates three route beacons, four sourced street lights, four interior lights and one eight-panel fixture draw in Blender', () => {
    const scene = new THREE.Scene();
    const presentation = createWorldIdentityPresentation(scene, arenaLightingProfile('blender'));
    expect(presentation).toMatchObject({
      routeLights: 3,
      routeSigns: 3,
      cueInstances: 0,
      atmosphericParticles: 0,
      practicalLights: 7,
      streetLights: 4,
      interiorLights: 4,
      fixtureInstances: 8,
      ceilingInstances: 10,
    });
    expect(scene.getObjectByName('pass27-world-identity-presentation')).toBe(presentation.root);
    const lights = presentation.root.children.filter((node): node is THREE.PointLight => node instanceof THREE.PointLight);
    expect(lights).toHaveLength(11);
    expect(lights.every((light) => light.castShadow === false && light.decay === 2 && light.distance > 0)).toBe(true);
    const fixtures = presentation.root.getObjectByName('pass29-interior-ceiling-panels');
    expect(fixtures).toBeInstanceOf(THREE.InstancedMesh);
    expect((fixtures as THREE.InstancedMesh).count).toBe(8);
    const ceilings = presentation.root.getObjectByName('pass29-structural-room-ceilings');
    expect(ceilings).toBeInstanceOf(THREE.InstancedMesh);
    expect((ceilings as THREE.InstancedMesh).count).toBe(10);
    const doorFinishes = presentation.root.getObjectByName('pass60-upper-room-door-finishes');
    expect(doorFinishes?.children).toHaveLength(2);
    expect(doorFinishes?.getObjectByName('aqua-irrigation-workshop-upper-room-door-finish-lit-threshold')).toBeInstanceOf(THREE.Mesh);
    expect(doorFinishes?.getObjectByName('coral-orchard-conservatory-upper-room-door-finish-lit-threshold')).toBeInstanceOf(THREE.Mesh);
    expect(doorFinishes?.getObjectByName('aqua-irrigation-workshop-upper-room-door-finish-open-leaf')).toBeUndefined();
    doorFinishes?.traverse((node) => expect(node.userData.blocksShots).toBe(false));
  });

  it('hides duplicate procedural house shell meshes while Quality art owns the shell', () => {
    const presentation = createWorldIdentityPresentation(new THREE.Scene(), arenaLightingProfile('blender'));
    setWorldIdentityHouseShellPresentation(presentation.root, false);
    expect(presentation.root.getObjectByName('pass29-interior-ceiling-panels')?.visible).toBe(false);
    expect(presentation.root.getObjectByName('pass29-structural-room-ceilings')?.visible).toBe(false);
    expect(presentation.root.getObjectByName('pass60-upper-room-door-finishes')?.visible).toBe(true);
    setWorldIdentityHouseShellPresentation(presentation.root, true);
    expect(presentation.root.getObjectByName('pass29-structural-room-ceilings')?.visible).toBe(true);
  });

  it('uses two house lights in Performance and zero local lights on software/Compatibility', () => {
    const performanceScene = new THREE.Scene();
    const performance = createWorldIdentityPresentation(performanceScene, arenaLightingProfile('performance'));
    expect(performance).toMatchObject({ practicalLights: 7, streetLights: 4, interiorLights: 2, fixtureInstances: 8, ceilingInstances: 10 });

    const compatScene = new THREE.Scene();
    const compat = createWorldIdentityPresentation(compatScene, arenaLightingProfile('compat'), true);
    expect(compat).toMatchObject({ practicalLights: 0, streetLights: 0, interiorLights: 0, fixtureInstances: 8, routeSigns: 3 });
    expect(compat.root.children.filter((node) => node instanceof THREE.Light)).toHaveLength(0);
  });
});
