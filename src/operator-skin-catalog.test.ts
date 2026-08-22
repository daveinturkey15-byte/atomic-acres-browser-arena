import { describe, expect, it } from 'vitest';
import {
  OPERATOR_SKIN_SOURCES,
  OPERATOR_SKIN_CATALOG,
  createOperatorSkinCatalog,
  validateOperatorSkinId,
  getOperatorSkinDefinition,
  type Pass74OperatorSkinId,
  type OperatorSkinCatalog,
  type OperatorSkinCatalogSourceDefinition,
} from './operator-skin-catalog';

describe('operator skin catalog', () => {
  describe('source definitions', () => {
    it('has exactly four entries', () => {
      expect(OPERATOR_SKIN_SOURCES.length).toBe(4);
    });

    it('contains default entry first', () => {
      expect(OPERATOR_SKIN_SOURCES[0].id).toBe('default');
      expect(OPERATOR_SKIN_SOURCES[0].displayName).toBe('Standard Operator');
      expect(OPERATOR_SKIN_SOURCES[0].archetype).toBe('standard');
      expect(OPERATOR_SKIN_SOURCES[0].assetId).toBe('pass65-third-person-operator-family-v1');
      expect(OPERATOR_SKIN_SOURCES[0].availability).toBe('selectable');
    });

    it('contains explorer archetype', () => {
      const explorer = OPERATOR_SKIN_SOURCES.find((s) => s.id === 'explorer');
      expect(explorer).toBeDefined();
      expect(explorer?.displayName).toBe('Sunspire Wayfarer');
      expect(explorer?.archetype).toBe('explorer');
      expect(explorer?.assetId).toBe('explorer-trailworn-canvas-v1');
      expect(explorer?.availability).toBe('selectable');
    });

    it('contains symbiote archetype', () => {
      const symbiote = OPERATOR_SKIN_SOURCES.find((s) => s.id === 'symbiote');
      expect(symbiote).toBeDefined();
      expect(symbiote?.displayName).toBe('Carapace Bulwark');
      expect(symbiote?.archetype).toBe('symbiote');
      expect(symbiote?.assetId).toBe('symbiote-graftplate-composite-v1');
      expect(symbiote?.availability).toBe('selectable');
    });

    it('contains navalops archetype', () => {
      const navalops = OPERATOR_SKIN_SOURCES.find((s) => s.id === 'navalops');
      expect(navalops).toBeDefined();
      expect(navalops?.displayName).toBe('Tidewrack Operative');
      expect(navalops?.archetype).toBe('navalops');
      expect(navalops?.assetId).toBe('navalops-bluewater-lowprofile-v1');
      expect(navalops?.availability).toBe('selectable');
    });

    it('all sources are frozen', () => {
      for (const source of OPERATOR_SKIN_SOURCES) {
        expect(Object.isFrozen(source)).toBe(true);
      }
      expect(Object.isFrozen(OPERATOR_SKIN_SOURCES)).toBe(true);
    });
  });

  describe('catalog creation', () => {
    it('creates a frozen catalog with all definitions frozen', () => {
      expect(Object.isFrozen(OPERATOR_SKIN_CATALOG)).toBe(true);
      expect(Object.isFrozen(OPERATOR_SKIN_CATALOG.definitions)).toBe(true);
      for (const def of OPERATOR_SKIN_CATALOG.definitions) {
        expect(Object.isFrozen(def)).toBe(true);
      }
    });

    it('has exactly four definitions', () => {
      expect(OPERATOR_SKIN_CATALOG.definitions.length).toBe(4);
    });

    it('ids are unique', () => {
      const ids = OPERATOR_SKIN_CATALOG.definitions.map((d) => d.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('contains default as first entry and it is selectable', () => {
      expect(OPERATOR_SKIN_CATALOG.definitions[0].id).toBe('default');
      expect(OPERATOR_SKIN_CATALOG.definitions[0].availability).toBe('selectable');
    });

    it('rejects catalog without default', () => {
      const sources = OPERATOR_SKIN_SOURCES.slice(1);
      expect(() => createOperatorSkinCatalog(sources)).toThrow('default operator skin is required');
    });

    it('rejects catalog with non-selectable default', () => {
      const sources = [
        { ...OPERATOR_SKIN_SOURCES[0], availability: 'retired' as const },
        ...OPERATOR_SKIN_SOURCES.slice(1),
      ] as const;
      expect(() => createOperatorSkinCatalog(sources)).toThrow('default must be selectable');
    });

    it('rejects duplicate IDs', () => {
      const sources = [
        OPERATOR_SKIN_SOURCES[0],
        { ...OPERATOR_SKIN_SOURCES[1], id: 'default' },
        ...OPERATOR_SKIN_SOURCES.slice(2),
      ] as const;
      expect(() => createOperatorSkinCatalog(sources)).toThrow('operator skin catalog IDs must be unique');
    });

    it('rejects unknown keys in source definition', () => {
      const sources: OperatorSkinCatalogSourceDefinition[] = [
        { id: 'default', displayName: 'Standard Operator', archetype: 'standard', assetId: 'pass65-third-person-operator-family-v1', availability: 'selectable', unknownKey: 'value' } as any,
        { id: 'explorer', displayName: 'Sunspire Wayfarer', archetype: 'explorer', assetId: 'explorer-trailworn-canvas-v1', availability: 'selectable' },
        { id: 'symbiote', displayName: 'Carapace Bulwark', archetype: 'symbiote', assetId: 'symbiote-graftplate-composite-v1', availability: 'selectable' },
        { id: 'navalops', displayName: 'Tidewrack Operative', archetype: 'navalops', assetId: 'navalops-bluewater-lowprofile-v1', availability: 'selectable' },
      ];
      expect(() => createOperatorSkinCatalog(sources)).toThrow('keys invalid');
    });

    it('rejects missing keys in source definition', () => {
      const sources: OperatorSkinCatalogSourceDefinition[] = [
        { id: 'default', displayName: 'Standard Operator', archetype: 'standard', assetId: 'pass65-third-person-operator-family-v1', availability: 'selectable' },
        { id: 'explorer', displayName: 'Sunspire Wayfarer', archetype: 'explorer', availability: 'selectable' } as any,
        { id: 'symbiote', displayName: 'Carapace Bulwark', archetype: 'symbiote', assetId: 'symbiote-graftplate-composite-v1', availability: 'selectable' },
        { id: 'navalops', displayName: 'Tidewrack Operative', archetype: 'navalops', assetId: 'navalops-bluewater-lowprofile-v1', availability: 'selectable' },
      ];
      expect(() => createOperatorSkinCatalog(sources)).toThrow('keys invalid');
    });

    it('rejects invalid ID format', () => {
      const sources: OperatorSkinCatalogSourceDefinition[] = [
        { id: 'Invalid_ID', displayName: 'Standard Operator', archetype: 'standard', assetId: 'pass65-third-person-operator-family-v1', availability: 'selectable' },
        { id: 'explorer', displayName: 'Sunspire Wayfarer', archetype: 'explorer', assetId: 'explorer-trailworn-canvas-v1', availability: 'selectable' },
        { id: 'symbiote', displayName: 'Carapace Bulwark', archetype: 'symbiote', assetId: 'symbiote-graftplate-composite-v1', availability: 'selectable' },
        { id: 'navalops', displayName: 'Tidewrack Operative', archetype: 'navalops', assetId: 'navalops-bluewater-lowprofile-v1', availability: 'selectable' },
      ];
      expect(() => createOperatorSkinCatalog(sources)).toThrow('has invalid ID');
    });

    it('rejects empty displayName', () => {
      const sources: OperatorSkinCatalogSourceDefinition[] = [
        { id: 'default', displayName: 'Standard Operator', archetype: 'standard', assetId: 'pass65-third-person-operator-family-v1', availability: 'selectable' },
        { id: 'explorer', displayName: '', archetype: 'explorer', assetId: 'explorer-trailworn-canvas-v1', availability: 'selectable' },
        { id: 'symbiote', displayName: 'Carapace Bulwark', archetype: 'symbiote', assetId: 'symbiote-graftplate-composite-v1', availability: 'selectable' },
        { id: 'navalops', displayName: 'Tidewrack Operative', archetype: 'navalops', assetId: 'navalops-bluewater-lowprofile-v1', availability: 'selectable' },
      ];
      expect(() => createOperatorSkinCatalog(sources)).toThrow('has invalid display name');
    });

    it('rejects invalid availability', () => {
      const sources: OperatorSkinCatalogSourceDefinition[] = [
        { id: 'default', displayName: 'Standard Operator', archetype: 'standard', assetId: 'pass65-third-person-operator-family-v1', availability: 'selectable' },
        { id: 'explorer', displayName: 'Sunspire Wayfarer', archetype: 'explorer', assetId: 'explorer-trailworn-canvas-v1', availability: 'invalid' } as any,
        { id: 'symbiote', displayName: 'Carapace Bulwark', archetype: 'symbiote', assetId: 'symbiote-graftplate-composite-v1', availability: 'selectable' },
        { id: 'navalops', displayName: 'Tidewrack Operative', archetype: 'navalops', assetId: 'navalops-bluewater-lowprofile-v1', availability: 'selectable' },
      ];
      expect(() => createOperatorSkinCatalog(sources)).toThrow('has invalid availability');
    });

    it('rejects invalid assetId format', () => {
      const sources: OperatorSkinCatalogSourceDefinition[] = [
        { id: 'default', displayName: 'Standard Operator', archetype: 'standard', assetId: 'pass65-third-person-operator-family-v1', availability: 'selectable' },
        { id: 'explorer', displayName: 'Sunspire Wayfarer', archetype: 'explorer', assetId: 'Invalid Asset ID', availability: 'selectable' },
        { id: 'symbiote', displayName: 'Carapace Bulwark', archetype: 'symbiote', assetId: 'symbiote-graftplate-composite-v1', availability: 'selectable' },
        { id: 'navalops', displayName: 'Tidewrack Operative', archetype: 'navalops', assetId: 'navalops-bluewater-lowprofile-v1', availability: 'selectable' },
      ];
      expect(() => createOperatorSkinCatalog(sources)).toThrow('has invalid assetId');
    });

    it('rejects empty array', () => {
      expect(() => createOperatorSkinCatalog([])).toThrow('operator skin catalog must be a non-empty array');
    });
  });

  describe('validateOperatorSkinId', () => {
    it('returns true for valid selectable IDs', () => {
      expect(validateOperatorSkinId(OPERATOR_SKIN_CATALOG, 'default')).toBe(true);
      expect(validateOperatorSkinId(OPERATOR_SKIN_CATALOG, 'explorer')).toBe(true);
      expect(validateOperatorSkinId(OPERATOR_SKIN_CATALOG, 'symbiote')).toBe(true);
      expect(validateOperatorSkinId(OPERATOR_SKIN_CATALOG, 'navalops')).toBe(true);
    });

    it('returns false for unknown IDs', () => {
      expect(validateOperatorSkinId(OPERATOR_SKIN_CATALOG, 'unknown')).toBe(false);
      expect(validateOperatorSkinId(OPERATOR_SKIN_CATALOG, 'retired-skin')).toBe(false);
      expect(validateOperatorSkinId(OPERATOR_SKIN_CATALOG, '')).toBe(false);
    });
  });

  describe('getOperatorSkinDefinition', () => {
    it('returns definition for valid IDs', () => {
      const def = getOperatorSkinDefinition(OPERATOR_SKIN_CATALOG, 'explorer');
      expect(def).toBeDefined();
      expect(def?.id).toBe('explorer');
      expect(def?.displayName).toBe('Sunspire Wayfarer');
      expect(def?.archetype).toBe('explorer');
      expect(def?.assetId).toBe('explorer-trailworn-canvas-v1');
    });

    it('returns undefined for unknown IDs', () => {
      expect(getOperatorSkinDefinition(OPERATOR_SKIN_CATALOG, 'unknown')).toBeUndefined();
    });
  });

  describe('type exports', () => {
    it('Pass74OperatorSkinId is a union of the four IDs', () => {
      const ids: Pass74OperatorSkinId[] = ['default', 'explorer', 'symbiote', 'navalops'];
      expect(ids.length).toBe(4);
    });

    it('OperatorSkinCatalog definitions type is correct', () => {
      const catalog: OperatorSkinCatalog = OPERATOR_SKIN_CATALOG;
      expect(catalog.definitions.length).toBe(4);
    });
  });
});