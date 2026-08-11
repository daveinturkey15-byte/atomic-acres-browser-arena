import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildGunRange, RUSTWORKS_CONTAINER_LIGHTS, RUSTWORKS_WORK_LIGHTS } from './additional-maps';
import { ArenaContrastLighting, sampleArenaPracticalLight } from './arena-contrast-lighting';
import { arenaVolumeContainsPoint, MAX_PRACTICAL_MOTION_FREQUENCY_HZ } from './rendering/arena-visual-definition';
import { definition as atomicDefinition } from './rendering/arenas/atomic-acres';
import { definition as gunRangeDefinition } from './rendering/arenas/gun-range';
import { definition as rustworksDefinition } from './rendering/arenas/rustworks-1v1';
import { definition as terminalDefinition } from './rendering/arenas/skyline-terminal';

describe('Pass 62 arena contrast lighting', () => {
  it('provides bounded real-time keys only where the arena lacks enough authored practical light', () => {
    const scene = new THREE.Scene();
    const rig = new ArenaContrastLighting(scene, 'blender');
    for (const definition of [atomicDefinition, terminalDefinition]) {
      rig.applyDefinition(definition);
      expect(rig.telemetry()).toMatchObject({
        arenaId: definition.id,
        definitionId: definition.id,
        activeLights: 2,
        shadowCastingLights: 2,
        occlusion: { activeLocalLights: 2, shadowedLocalLights: 2, violations: [] },
      });
      const visibleRoots = scene.children.filter((node) => node.name.includes('definition-practicals') && node.visible);
      expect(visibleRoots).toHaveLength(1);
    }
    rig.applyDefinition(rustworksDefinition);
    expect(rig.telemetry()).toMatchObject({
      arenaId: 'rustworks-1v1',
      maximumShadowLights: 7,
      activeLights: 6,
      shadowCastingLights: 6,
      occlusion: { activeLocalLights: 6, shadowedLocalLights: 6, violations: [] },
    });
    const fixture = RUSTWORKS_WORK_LIGHTS.find((entry) => entry.id === 'north');
    const southFixture = RUSTWORKS_WORK_LIGHTS.find((entry) => entry.id === 'south');
    const mountedLight = scene.getObjectByName('rustworks-1v1-tower-mounted-work-light-1') as THREE.SpotLight;
    const southMountedLight = scene.getObjectByName('rustworks-1v1-tower-mounted-work-light-south-2') as THREE.SpotLight;
    expect(fixture).toBeTruthy();
    expect(mountedLight).toBeInstanceOf(THREE.SpotLight);
    expect(mountedLight.position.toArray()).toEqual([...(fixture?.position ?? [])]);
    expect(mountedLight.target.position.toArray()).toEqual([...(fixture?.target ?? [])]);
    expect(mountedLight.shadow.mapSize.toArray()).toEqual([512, 512]);
    expect(southMountedLight).toBeInstanceOf(THREE.SpotLight);
    expect(southMountedLight.position.toArray()).toEqual([...(southFixture?.position ?? [])]);
    expect(southMountedLight.target.position.toArray()).toEqual([...(southFixture?.target ?? [])]);
    expect(southMountedLight.shadow.mapSize.toArray()).toEqual([512, 512]);
    const northIntensity = mountedLight.intensity;
    rig.update(2_400);
    expect(mountedLight.intensity).not.toBe(northIntensity);
    expect(mountedLight.intensity).toBeGreaterThanOrEqual(fixture!.intensity * 0.925);
    expect(mountedLight.intensity).toBeLessThanOrEqual(fixture!.intensity * 1.075);
    const authoredContainerLights = rig.telemetry().authoredLights.filter(({ practicalId }) => practicalId.startsWith('container-dynamic-'));
    expect(authoredContainerLights).toHaveLength(4);
    expect(authoredContainerLights.map(({ practicalId }) => practicalId)).toEqual(
      RUSTWORKS_CONTAINER_LIGHTS.map(({ id }) => `container-dynamic-${id}`),
    );
    for (const [index, containerFixture] of RUSTWORKS_CONTAINER_LIGHTS.entries()) {
      const light = scene.getObjectByName(`rustworks-1v1-container-dynamic-${containerFixture.id}-${index + 3}`) as THREE.SpotLight;
      expect(light, containerFixture.id).toBeInstanceOf(THREE.SpotLight);
      expect(light.position.toArray()).toEqual([...containerFixture.position]);
      expect(light.target.position.toArray()).toEqual([...containerFixture.target]);
      expect(light.color.getHex()).toBe(containerFixture.color);
      expect(light.shadow.mapSize.toArray()).toEqual([256, 256]);
      expect(light.userData).toMatchObject({
        presentationOnly: true,
        blocksShots: false,
        practicalPolicyId: `container-dynamic-${containerFixture.id}`,
      });
      expect(light.intensity).not.toBe(containerFixture.intensity);
    }
    expect(rustworksDefinition.reviewCameras.map((camera) => camera.id)).toEqual(expect.arrayContaining([
      'rustrig-mounted-work-lights',
      'rustrig-deck-surface',
      'rustrig-container-dynamic-northwest',
      'rustrig-container-dynamic-southeast',
    ]));
    rig.applyDefinition(gunRangeDefinition);
    expect(rig.telemetry()).toMatchObject({ arenaId: 'gun-range', activeLights: 6, shadowCastingLights: 6 });
    const rangeLight = scene.getObjectByName('gun-range-range-inspection-key-1') as THREE.SpotLight;
    const targetX = rangeLight.target.position.x;
    rig.update(3_000);
    expect(rangeLight.target.position.x).not.toBe(targetX);
  });

  it('keeps unshadowed Performance and Compatibility free of the contrast-light volume', () => {
    const performance = new ArenaContrastLighting(new THREE.Scene(), 'performance');
    const compat = new ArenaContrastLighting(new THREE.Scene(), 'compat');
    performance.applyDefinition(atomicDefinition);
    expect(performance.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0, occlusion: { violations: [] } });
    performance.applyDefinition(rustworksDefinition);
    expect(performance.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
    expect(compat.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
  });

  it('bypasses the extra rig on software WebGL', () => {
    const rig = new ArenaContrastLighting(new THREE.Scene(), 'blender', true);
    expect(rig.telemetry()).toMatchObject({ activeLights: 0, shadowCastingLights: 0 });
  });
});

describe('Pass 65 Gun Range authored contrast light', () => {
  it('keeps the canonical fixture and its complete target sweep inside the occluded room shell', () => {
    const practical = gunRangeDefinition.lighting.practicals.find((entry) => entry.id === 'range-inspection-key');
    const light = practical?.light;
    expect(light).toBeDefined();
    expect(gunRangeDefinition.budgets.maximumShadowLights).toBe(6);
    expect(gunRangeDefinition.lighting.practicals.filter((entry) => entry.castsShadow)).toHaveLength(6);
    for (const authored of gunRangeDefinition.lighting.practicals.flatMap((entry) => entry.light ? [entry.light] : [])) {
      expect(arenaVolumeContainsPoint(authored.intendedVolume, authored.position), `${authored.position}`).toBe(true);
      expect(arenaVolumeContainsPoint(authored.intendedVolume, authored.target), `${authored.target}`).toBe(true);
    }
    expect(arenaVolumeContainsPoint(light!.intendedVolume, light!.position)).toBe(true);
    expect(arenaVolumeContainsPoint(light!.intendedVolume, light!.target)).toBe(true);
    const targetAmplitude = light!.motion?.target?.amplitude ?? [0, 0, 0];
    const targetMinimum = light!.target.map((value, axis) => value - Math.abs(targetAmplitude[axis])) as [number, number, number];
    const targetMaximum = light!.target.map((value, axis) => value + Math.abs(targetAmplitude[axis])) as [number, number, number];
    expect(arenaVolumeContainsPoint(light!.intendedVolume, targetMinimum)).toBe(true);
    expect(arenaVolumeContainsPoint(light!.intendedVolume, targetMaximum)).toBe(true);

    const scene = new THREE.Scene();
    const map = buildGunRange(scene);
    map.root.updateMatrixWorld(true);
    const shell = {
      left: new THREE.Box3().setFromObject(map.root.getObjectByName('gun-range-left-wall')!),
      right: new THREE.Box3().setFromObject(map.root.getObjectByName('gun-range-right-wall')!),
      backstop: new THREE.Box3().setFromObject(map.root.getObjectByName('gun-range-backstop')!),
      rear: new THREE.Box3().setFromObject(map.root.getObjectByName('gun-range-rear-wall')!),
      ceiling: new THREE.Box3().setFromObject(map.root.getObjectByName('gun-range-ceiling')!),
    };
    expect(light!.intendedVolume.minimum[0]).toBeGreaterThan(shell.left.max.x);
    expect(light!.intendedVolume.maximum[0]).toBeLessThan(shell.right.min.x);
    expect(light!.intendedVolume.minimum[2]).toBeGreaterThan(shell.backstop.max.z);
    expect(light!.intendedVolume.maximum[2]).toBeLessThan(shell.rear.min.z);
    expect(light!.intendedVolume.maximum[1]).toBeLessThan(shell.ceiling.min.y);

    const origin = new THREE.Vector3(...light!.position);
    const outsideProbes = [
      new THREE.Vector3(-22, 4.8, -12),
      new THREE.Vector3(22, 4.8, -12),
      new THREE.Vector3(0, 4.8, -50),
      new THREE.Vector3(0, 4.8, 21),
      new THREE.Vector3(8, 8, -12),
    ];
    for (const outside of outsideProbes) {
      const ray = outside.clone().sub(origin);
      const distance = ray.length();
      const hits = new THREE.Raycaster(origin, ray.normalize(), 0, distance).intersectObjects(map.raycastMeshes, false);
      expect(hits.some((hit) => hit.distance < distance && hit.object.castShadow), `unoccluded probe ${outside.toArray()}`).toBe(true);
    }
  });

  it('applies deterministic, non-zero, bounded slow motion without entering a strobe cadence', () => {
    const practical = gunRangeDefinition.lighting.practicals.find((entry) => entry.id === 'range-inspection-key')!;
    const lightDefinition = practical.light!;
    const intensityMotion = lightDefinition.motion!.intensity!;
    const targetMotion = lightDefinition.motion!.target!;
    expect(intensityMotion.frequencyHz).toBeGreaterThan(0);
    expect(targetMotion.frequencyHz).toBeGreaterThan(0);
    expect(Math.max(intensityMotion.frequencyHz, targetMotion.frequencyHz)).toBeLessThanOrEqual(MAX_PRACTICAL_MOTION_FREQUENCY_HZ);

    const scene = new THREE.Scene();
    const rig = new ArenaContrastLighting(scene, 'blender');
    rig.applyDefinition(gunRangeDefinition);
    const rangeLight = scene.getObjectByName('gun-range-range-inspection-key-1') as THREE.SpotLight;
    expect(rangeLight).toBeInstanceOf(THREE.SpotLight);
    expect(rangeLight.position.toArray()).toEqual([...lightDefinition.position]);
    expect(rangeLight.target.position.toArray()).toEqual([...lightDefinition.target]);
    expect(rangeLight.castShadow).toBe(true);
    expect(rangeLight.shadow.mapSize.toArray()).toEqual([512, 512]);
    expect(rangeLight.userData).toMatchObject({ presentationOnly: true, blocksShots: false, practicalPolicyId: practical.id });
    expect(rig.telemetry()).toMatchObject({
      activeLights: 6,
      shadowCastingLights: 6,
      maximumShadowLights: 6,
      authoredLights: expect.arrayContaining([
        expect.objectContaining({
          practicalId: practical.id,
          intendedVolume: expect.objectContaining({ id: lightDefinition.intendedVolume.id }),
        }),
        expect.objectContaining({ practicalId: 'range-cyan-lane-key', color: 0x53e9e1, shadowMapSize: 256 }),
        expect.objectContaining({ practicalId: 'range-amber-lane-key', color: 0xffb84f, shadowMapSize: 256 }),
        expect.objectContaining({ practicalId: 'test-bay-door-approach-key', color: 0x72f4ed, shadowMapSize: 256 }),
        expect.objectContaining({ practicalId: 'test-bay-inspection-key', color: 0xc8f7ff, shadowMapSize: 512 }),
        expect.objectContaining({ practicalId: 'test-bay-support-key', color: 0xffbf66, shadowMapSize: 256 }),
      ]),
      occlusion: { activeLocalLights: 6, shadowedLocalLights: 6, violations: [] },
    });

    const stepMs = 100;
    const durationMs = 60_000;
    const intensities: number[] = [];
    const targets: THREE.Vector3[] = [];
    for (let nowMs = 0; nowMs <= durationMs; nowMs += stepMs) {
      const expected = sampleArenaPracticalLight(lightDefinition, nowMs);
      expect(sampleArenaPracticalLight(lightDefinition, nowMs)).toEqual(expected);
      rig.update(nowMs);
      expect(rangeLight.intensity).toBeCloseTo(expected.intensity, 12);
      expect(rangeLight.target.position.toArray()).toEqual([...expected.target]);
      expect(arenaVolumeContainsPoint(lightDefinition.intendedVolume, expected.target)).toBe(true);
      intensities.push(rangeLight.intensity);
      targets.push(rangeLight.target.position.clone());
    }

    const intensitySpan = Math.max(...intensities) - Math.min(...intensities);
    const targetXSpan = Math.max(...targets.map((target) => target.x)) - Math.min(...targets.map((target) => target.x));
    expect(intensitySpan).toBeGreaterThan(lightDefinition.intensity * intensityMotion.amplitudeRatio * 1.9);
    expect(intensitySpan).toBeLessThanOrEqual(lightDefinition.intensity * intensityMotion.amplitudeRatio * 2 + 1e-9);
    expect(targetXSpan).toBeGreaterThan(targetMotion.amplitude[0] * 1.9);
    expect(targetXSpan).toBeLessThanOrEqual(targetMotion.amplitude[0] * 2 + 1e-9);

    const maximumIntensityDelta = lightDefinition.intensity * intensityMotion.amplitudeRatio
      * Math.PI * 2 * intensityMotion.frequencyHz * (stepMs / 1_000);
    const maximumTargetDelta = new THREE.Vector3(...targetMotion.amplitude).length()
      * Math.PI * 2 * targetMotion.frequencyHz * (stepMs / 1_000);
    for (let index = 1; index < intensities.length; index += 1) {
      expect(Math.abs(intensities[index] - intensities[index - 1])).toBeLessThanOrEqual(maximumIntensityDelta + 1e-9);
      expect(targets[index].distanceTo(targets[index - 1])).toBeLessThanOrEqual(maximumTargetDelta + 1e-9);
    }
  });
});
