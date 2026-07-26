import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  DMR_THERMAL_MAGNIFICATION,
  DMR_THERMAL_MAX_CONTACTS,
  DMR_THERMAL_OCCLUSION_POLICY,
  DMR_THERMAL_TARGET_POLICY,
  DMR_THERMAL_WORLD_DRAW_CALLS,
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
    expect(DMR_THERMAL_WORLD_DRAW_CALLS).toBe(2);
    expect(DMR_THERMAL_TARGET_POLICY).toBe('living-friendly-and-hostile');
    expect(DMR_THERMAL_OCCLUSION_POLICY).toBe('smoke-bypass-solid-block');
    expect(selected.map(({ id, relation }) => ({ id, relation }))).toEqual([
      { id: 'hostile', relation: 'hostile' },
      { id: 'friendly', relation: 'friendly' },
    ]);
  });

  it('never admits dead targets or targets behind static/dynamic solid occlusion', () => {
    const selected = selectDmrThermalContacts([
      contact('dead', { living: false }),
      contact('static-wall', { solidOccluded: true }),
      contact('dynamic-wall', { solidOccluded: true, relation: 'friendly' }),
      contact('clear'),
    ]);
    expect(selected.map(({ id }) => id)).toEqual(['clear']);
  });

  it('deduplicates and hard-bounds presentation contacts', () => {
    const contacts = Array.from({ length: DMR_THERMAL_MAX_CONTACTS + 8 }, (_, index) => contact(`contact-${index}`));
    contacts.push(contact('contact-0'));
    expect(selectDmrThermalContacts(contacts)).toHaveLength(DMR_THERMAL_MAX_CONTACTS);
  });
});
