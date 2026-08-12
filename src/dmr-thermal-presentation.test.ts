import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { PresentationPrewarmRuntime } from './rendering/render-runtime';
import {
  DMR_THERMAL_MAGNIFICATION,
  DMR_THERMAL_MAX_CONTACTS,
  DMR_THERMAL_MODEL_POLICY,
  DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME,
  DMR_THERMAL_OCCLUSION_POLICY,
  DMR_THERMAL_TARGET_POLICY,
  DMR_THERMAL_WORLD_DRAW_CALLS,
  DmrThermalPresentation,
  dmrThermalOcclusionBudget,
  selectDmrThermalContacts,
  type DmrThermalContact,
} from './dmr-thermal-presentation';

function contact(id: string, overrides: Partial<DmrThermalContact> = {}): DmrThermalContact {
  return {
    id,
    kind: 'player',
    relation: 'hostile',
    position: new THREE.Vector3(0, 1, -10),
    living: true,
    solidOccluded: false,
    ...overrides,
  };
}

describe('M14 EBR 2.5x thermal presentation policy', () => {
  it('shows living hostiles and friendlies through smoke while keeping team identity explicit', () => {
    const selected = selectDmrThermalContacts([
      contact('hostile'),
      contact('friendly', { relation: 'friendly' }),
    ]);
    expect(DMR_THERMAL_MAGNIFICATION).toBe(2.5);
    expect(DMR_THERMAL_WORLD_DRAW_CALLS).toBe(0);
    expect(DMR_THERMAL_TARGET_POLICY).toBe('living-friendly-and-hostile');
    expect(DMR_THERMAL_OCCLUSION_POLICY).toBe('through-wall-reveal');
    expect(selected.map(({ id, relation }) => ({ id, relation }))).toEqual([
      { id: 'hostile', relation: 'hostile' },
      { id: 'friendly', relation: 'friendly' },
    ]);
  });

  it('never admits dead targets but reveals living targets through solid occlusion', () => {
    const selected = selectDmrThermalContacts([
      contact('dead', { living: false }),
      contact('static-wall', { solidOccluded: true }),
      contact('dynamic-wall', { solidOccluded: true, relation: 'friendly' }),
      contact('clear'),
    ]);
    expect(selected.map(({ id }) => id)).toEqual(['static-wall', 'dynamic-wall', 'clear']);
  });

  it('deduplicates and hard-bounds presentation contacts', () => {
    const contacts = Array.from({ length: DMR_THERMAL_MAX_CONTACTS + 8 }, (_, index) => contact(`contact-${index}`));
    contacts.push(contact('contact-0'));
    expect(selectDmrThermalContacts(contacts)).toHaveLength(DMR_THERMAL_MAX_CONTACTS);
  });

  it('hard-bounds expensive solid-occlusion work per display frame', () => {
    expect(DMR_THERMAL_OCCLUSION_CHECKS_PER_FRAME).toBe(2);
    expect(dmrThermalOcclusionBudget(0)).toBe(0);
    expect(dmrThermalOcclusionBudget(1)).toBe(1);
    expect(dmrThermalOcclusionBudget(DMR_THERMAL_MAX_CONTACTS)).toBe(2);
    expect(dmrThermalOcclusionBudget(Number.NaN)).toBe(0);
  });

  it('delegates body rendering/prewarm to the shared exact-operator path without proxy pipelines', async () => {
    const scene = new THREE.Scene();
    const overlay = { hidden: true } as HTMLElement;
    const presentation = new DmrThermalPresentation(scene, overlay);
    const compileAndRender = vi.fn(async () => undefined);
    const runtime = { compileAndRender } as unknown as PresentationPrewarmRuntime;
    const camera = new THREE.PerspectiveCamera(76, 1, 0.08, 180);
    camera.position.set(0, 1.7, 0);
    scene.add(camera);

    await presentation.prewarm(runtime, camera, 7);
    await presentation.prewarm(runtime, camera, 7);

    expect(compileAndRender).not.toHaveBeenCalled();
    expect(presentation.worldRoot.visible).toBe(false);
    expect(presentation.telemetry()).toMatchObject({
      gpuPrewarmGeneration: 7,
      worldDrawCalls: 0,
      modelPolicy: DMR_THERMAL_MODEL_POLICY,
      proxyMeshes: 0,
      domBodyMarkers: 0,
    });
    presentation.terminalDispose();
  });
});
