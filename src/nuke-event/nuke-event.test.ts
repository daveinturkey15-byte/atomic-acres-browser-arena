import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  NukeEventPresentation,
  NUKE_EVENT_BACKGROUND_BUDGET_P50_MS,
  NUKE_EVENT_BACKGROUND_DISTANCE_M,
  NUKE_EVENT_CAMERA_FAR_M,
  NUKE_EVENT_PIPELINE_IDS,
  NUKE_EVENT_RAY_STEPS,
  sampleNukeEventTimeline,
  deriveNukeEventTriggerFromReplicatedState,
} from './index';
import { NUKE_EVENT_RISE_SECONDS, NUKE_EVENT_TOTAL_SECONDS } from './timeline';
import { definition as nuketown2Definition } from '../rendering/arenas/nuketown2';

const legacySource = readFileSync(resolve(__dirname, '../legacy-main.ts'), 'utf8');
const moduleSource = readFileSync(resolve(__dirname, './index.ts'), 'utf8');
const timelineSource = readFileSync(resolve(__dirname, './timeline.ts'), 'utf8');

describe('HF-490 Nuke Town event timeline', () => {
  it('has explicit flash, rise, dissipation and completion phases', () => {
    expect(sampleNukeEventTimeline(10_000, 10_000).phase).toBe('flash');
    expect(sampleNukeEventTimeline(10_000, 11_001).phase).toBe('rising');
    expect(sampleNukeEventTimeline(10_000, 35_001).phase).toBe('dissipating');
    expect(sampleNukeEventTimeline(10_000, 70_001).phase).toBe('complete');
    expect(sampleNukeEventTimeline(10_000, 70_001).active).toBe(false);
  });

  it('is deterministic from a host timestamp, independent of peer frame timing', () => {
    const first = sampleNukeEventTimeline(250_000, 263_500);
    const second = sampleNukeEventTimeline(250_000, 263_500);
    expect(second).toEqual(first);
    expect(sampleNukeEventTimeline(250_000, 250_000).flashStrength).toBe(1);
  });

  it('admits only a replicated ended state on nuketown2', () => {
    expect(deriveNukeEventTriggerFromReplicatedState('nuketown2', {
      phase: 'ended', snapshotHostTimeMs: 88_000,
    })).toBe(88_000);
    expect(deriveNukeEventTriggerFromReplicatedState('nuketown2', {
      phase: 'active', snapshotHostTimeMs: 88_000,
    })).toBeNull();
    expect(deriveNukeEventTriggerFromReplicatedState('atomic-acres', {
      phase: 'ended', snapshotHostTimeMs: 88_000,
    })).toBeNull();
    expect(deriveNukeEventTriggerFromReplicatedState('nuketown2', {
      phase: 'ended', snapshotHostTimeMs: null,
    })).toBeNull();
    expect(timelineSource).not.toContain('performance.now');
    expect(timelineSource).not.toContain('Date.now');
  });

  it('pins the two-pipeline budget and the defendable background estimate', () => {
    expect(NUKE_EVENT_RAY_STEPS).toBeGreaterThanOrEqual(32);
    expect(NUKE_EVENT_RAY_STEPS).toBeLessThanOrEqual(48);
    expect(NUKE_EVENT_BACKGROUND_BUDGET_P50_MS).toBeLessThanOrEqual(0.6);
    expect(NUKE_EVENT_RISE_SECONDS).toBe(25);
    expect(NUKE_EVENT_TOTAL_SECONDS).toBe(60);
    expect(NUKE_EVENT_BACKGROUND_DISTANCE_M).toBeGreaterThanOrEqual(500);
    expect(NUKE_EVENT_BACKGROUND_DISTANCE_M).toBeLessThanOrEqual(800);
    expect(NUKE_EVENT_CAMERA_FAR_M).toBeGreaterThan(NUKE_EVENT_BACKGROUND_DISTANCE_M);
    expect(NUKE_EVENT_PIPELINE_IDS).toHaveLength(2);
  });

  it('pins the three review stations and their long horizon frustum', () => {
    const stations = ['nuketown2-nuke-street', 'nuketown2-nuke-north-balcony', 'nuketown2-nuke-south-balcony']
      .map((id) => nuketown2Definition.reviewCameras.find((camera) => camera.id === id));
    expect(stations.every((camera) => camera !== undefined)).toBe(true);
    for (const camera of stations) {
      expect(camera!.far).toBe(NUKE_EVENT_CAMERA_FAR_M);
      expect(camera!.target[2]).toBe(NUKE_EVENT_BACKGROUND_DISTANCE_M);
    }
  });

  it('registers the event in the menu-time precompile path', () => {
    expect(legacySource).toContain('prewarmNukePresentation(), nukeEvent.prewarm(renderRuntime, camera, scene)');
    expect(legacySource).toContain('await nukeEvent.prewarm(renderRuntime, camera, scene);');
    expect(legacySource.match(/nukeEvent\.triggerFromMatchEnd/g)).toHaveLength(1);
    expect(legacySource).toContain("source: 'nuke'");
    expect(moduleSource).toContain('NUKE_EVENT_PIPELINE_IDS');
    expect(moduleSource).toContain('compileAndRender(this.root, camera, scene)');
    expect(moduleSource).not.toContain('WebGLRenderTarget');
  });

  it('uses uniforms for per-instance volume/ring values and allocates no live update objects', () => {
    expect(moduleSource).toContain('uniform(new THREE.Vector3())');
    expect(moduleSource).toContain("uniformInstance = 'background-origin-extents-mode'");
    expect(moduleSource).toContain("uniformInstance = 'event-origin-extents-mode'");
    expect(moduleSource).toContain("uniformInstance = 'ring-radius-opacity-clock'");
    expect(moduleSource).not.toContain('InstancedBufferAttribute');
    expect(moduleSource).not.toContain("attribute('");
    const update = moduleSource.slice(moduleSource.indexOf('  update(nowHostTimeMs'), moduleSource.indexOf('  async prewarm'));
    expect(update).not.toContain('new ');
  });

  it('keeps background and event volume materials and uniforms isolated', () => {
    const presentation = new NukeEventPresentation(new THREE.Scene(), { backend: 'webgpu' });
    const background = presentation.root.getObjectByName('nuketown2-horizon-mushroom-cloud') as THREE.Mesh;
    const event = presentation.root.getObjectByName('nuketown2-detonation-mushroom-cloud') as THREE.Mesh;
    expect(background.material).not.toBe(event.material);
    expect(moduleSource).toContain('const eventVolumeMaterial = createVolumeMaterial(');
    expect(moduleSource).toContain('private readonly eventVolumeOrigin = uniform(new THREE.Vector3())');
    expect(moduleSource).toContain('private readonly eventVolumeOpacity = uniform(1)');
  });

  it('prewarms both graph families through one menu-time submission', async () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const presentation = new NukeEventPresentation(scene, { backend: 'webgpu' });
    const roots: THREE.Object3D[] = [];
    const runtime = {
      backend: 'webgpu' as const,
      compileAndRender: async (root: THREE.Object3D) => { roots.push(root); },
    };
    await presentation.prewarm(runtime, camera, scene);
    await presentation.prewarm(runtime, camera, scene);
    expect(roots).toHaveLength(1);
    expect(roots[0]).toBe(presentation.root);
    expect(presentation.root.userData.pipelineIds).toEqual(NUKE_EVENT_PIPELINE_IDS);
  });
});
