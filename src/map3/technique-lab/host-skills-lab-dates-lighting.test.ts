/**
 * src/map3/technique-lab/host-skills-lab-dates-lighting.test.ts — CPU
 * falsifiers for the Skills Lab worker pass: newest-first sorting over
 * recorded dates only, same-host URL targets that are never invented, Blender
 * lane date retention, and the CPU-built lighting preview (supported states,
 * unavailable rejection, disposal). No GPU, no network, no DOM.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  UNKNOWN_DATE_LABEL,
  maxDate,
  parseRecordDate,
  sortNewestFirst,
} from './gallery/sorting';
import { latestEvidenceDate, urlTarget } from './gallery/url-targets';
import {
  LIGHTING_BLADE_COUNT,
  createLightingPreview,
  type LightingPreviewHandle,
  groundHeight,
  isLightingTime,
  isLightingWeather,
  sunParamsFor,
} from './gallery/lighting-preview';
import {
  BUILTIN_BLENDER_ASSETS,
  blenderAssetDate,
  parseBlenderCatalog,
} from './gallery/blender-catalog';

describe('recorded-date parsing', () => {
  it('accepts recorded YYYY-MM-DD and ISO datetimes, rejects everything else', () => {
    expect(parseRecordDate('2026-09-12')).toBe('2026-09-12');
    expect(parseRecordDate('2026-09-02T13:22:54Z')).toBe('2026-09-02');
    expect(parseRecordDate('00dfd5385506022d533c84f6737a09f5f4392623')).toBeNull();
    expect(parseRecordDate('2026-13-01')).toBeNull();
    expect(parseRecordDate('2026-09-12 (wave 2)')).toBeNull();
    expect(parseRecordDate('')).toBeNull();
    expect(parseRecordDate(null)).toBeNull();
    expect(parseRecordDate(20260912)).toBeNull();
    expect(UNKNOWN_DATE_LABEL).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('maxDate keeps the latest usable date and never invents one', () => {
    expect(maxDate(['2026-09-02', '2026-09-12', '2026-09-12'])).toBe('2026-09-12');
    expect(maxDate(['junk', null, undefined])).toBeNull();
    expect(maxDate([])).toBeNull();
    expect(maxDate(['2026-09-12', 'not-a-date'])).toBe('2026-09-12');
  });
});

describe('newest-first comparator', () => {
  it('orders dated newest-first, unknowns last in stable order, without mutating', () => {
    const items = [
      { id: 'old', date: '2026-09-02' },
      { id: 'unknown-a', date: null },
      { id: 'new', date: '2026-09-12' },
      { id: 'unknown-b', date: null },
      { id: 'mid', date: '2026-09-05' },
    ];
    const ordered = sortNewestFirst(items, (item) => item.date);
    expect(ordered.map((item) => item.id)).toEqual(['new', 'mid', 'old', 'unknown-a', 'unknown-b']);
    expect(items[0].id).toBe('old');
  });

  it('keeps equal dates in incoming order so caller tie-breaks win', () => {
    const items = [
      { id: 3, date: '2026-09-12' },
      { id: 1, date: '2026-09-12' },
    ];
    expect(sortNewestFirst(items, (item) => item.date).map((item) => item.id)).toEqual([3, 1]);
  });
});

describe('catalog evidence dates', () => {
  it('uses the newest recorded inspectedAt and nothing else', () => {
    expect(
      latestEvidenceDate({
        sourceId: 1,
        title: null,
        urls: [],
        skillMappings: [],
        status: null,
        method: null,
        adaptation: null,
        blocker: null,
        evidence: [
          { url: 'https://a.example', pin: null, inspectedAt: '2026-09-02', observation: null },
          { url: 'https://b.example', pin: null, inspectedAt: '2026-09-12', observation: null },
        ],
        demo: null,
        limitations: [],
      }),
    ).toBe('2026-09-12');
    expect(latestEvidenceDate(undefined)).toBeNull();
  });
});

describe('same-host URL targets', () => {
  const blender = [
    {
      ...BUILTIN_BLENDER_ASSETS[0],
    },
  ];

  function mappedCatalog(extra: Record<string, unknown> = {}) {
    return {
      sourceId: 1,
      title: null,
      urls: [],
      skillMappings: [{ skill: 'game-animation-asset-pipeline', sourceReference: 'docs/RIG.md', relation: 'informs' }],
      status: null,
      method: null,
      adaptation: null,
      blocker: null,
      evidence: [],
      demo: null,
      limitations: [],
      ...extra,
    };
  }

  it('mapped rows with a demo resolve to the numbered skill demo', () => {
    expect(urlTarget(mappedCatalog(), true, 1, blender)).toEqual({ kind: 'demo', sourceId: 1 });
  });

  it('unmapped rows never resolve, even when a demo exists', () => {
    expect(urlTarget(undefined, true, 1, blender)).toBeNull();
    expect(urlTarget(mappedCatalog({ skillMappings: [] }), true, 1, blender)).toBeNull();
  });

  it('mapped rows without a demo resolve to the Blender asset the catalog names', () => {
    const catalog = mappedCatalog({
      skillMappings: [
        {
          skill: 'atomic-acres-procedural-art-authoring',
          sourceReference: 'built from assets/world-studio/blender/hero-bus.glb',
          relation: 'uses',
        },
      ],
    });
    expect(urlTarget(catalog, false, 9, blender)).toEqual({
      kind: 'blender',
      assetKey: 'shipped/hero-bus',
      assetUrl: 'assets/world-studio/blender/hero-bus.glb',
    });
  });

  it('mapped rows with neither a demo nor a named asset resolve to null', () => {
    expect(urlTarget(mappedCatalog(), false, 1, blender)).toBeNull();
    expect(urlTarget(mappedCatalog(), false, 1, [])).toBeNull();
  });
});

describe('Blender lane dates', () => {
  it('retains recorded lane dates and prefers the latest field', () => {
    const result = parseBlenderCatalog('nature', {
      assets: [
        {
          id: 'rock',
          assetUrl: 'assets/world-studio/blender/nature/rock.glb',
          createdAt: '2026-09-10',
          generatedAsOf: '2026-09-11',
        },
      ],
    });
    expect(blenderAssetDate(result.assets[0])).toBe('2026-09-11');
  });

  it('treats assets without recorded dates as unknown, never as old', () => {
    expect(blenderAssetDate(BUILTIN_BLENDER_ASSETS[0])).toBeNull();
    expect(blenderAssetDate({ createdAt: 'nonsense', updatedAt: null, generatedAsOf: null })).toBeNull();
  });
});

describe('lighting preview', () => {
  it('builds grass, road and shed forms within a CPU-safe budget', () => {
    const preview = createLightingPreview();
    expect(preview.bladeCount).toBeGreaterThan(0);
    expect(preview.bladeCount).toBeLessThanOrEqual(LIGHTING_BLADE_COUNT);
    expect(preview.root.children.length).toBeGreaterThanOrEqual(4);
    expect(preview.time).toBe('noon');
    expect(preview.weather).toBe('clear');
    preview.dispose();
  });

  it('is deterministic: the same seed places the same blades', () => {
    const a = createLightingPreview();
    const b = createLightingPreview();
    const pos = (preview: LightingPreviewHandle): number[] => {
      const mesh = preview.root.children.find(
        (child): child is THREE.InstancedMesh => (child as THREE.InstancedMesh).isInstancedMesh,
      );
      if (!mesh) throw new Error('no grass mesh');
      const matrix = new THREE.Matrix4();
      const out: number[] = [];
      for (let i = 0; i < mesh.count; i += 1) {
        mesh.getMatrixAt(i, matrix);
        out.push(matrix.elements[12], matrix.elements[13], matrix.elements[14]);
      }
      return out;
    };
    expect(pos(a)).toEqual(pos(b));
    a.dispose();
    b.dispose();
  });

  it('keeps grass off the road and the shed footprint', () => {
    const preview = createLightingPreview();
    const mesh = preview.root.children.find(
      (child): child is THREE.InstancedMesh => (child as THREE.InstancedMesh).isInstancedMesh,
    );
    if (!mesh) throw new Error('no grass mesh');
    const matrix = new THREE.Matrix4();
    const at = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, matrix);
      matrix.decompose(at, quat, scale);
      expect(Math.abs(at.x)).toBeGreaterThanOrEqual(1.44);
      expect(Math.hypot(at.x - 4.2, at.z + 2.5)).toBeGreaterThan(1.0);
    }
    preview.dispose();
  });

  it('implements exactly morning/noon/dusk and clear/overcast', () => {
    expect(isLightingTime('dusk')).toBe(true);
    expect(isLightingTime('night')).toBe(false);
    expect(isLightingWeather('overcast')).toBe(true);
    expect(isLightingWeather('rain')).toBe(false);
    const noon = sunParamsFor('noon', 'clear');
    const overcast = sunParamsFor('noon', 'overcast');
    expect(overcast.intensity).toBeLessThan(noon.intensity);
    expect(overcast.color).toBe(0xcfd6dd);
    expect(sunParamsFor('dusk', 'clear').color).toBe(0xff9a5c);
  });

  it('applies supported states to the owned lights and rejects the rest', () => {
    const preview = createLightingPreview();
    const noonIntensity = preview.sun.intensity;
    expect(preview.setTimeOfDay('dusk')).toBe(true);
    expect(preview.time).toBe('dusk');
    expect(preview.sun.intensity).not.toBe(noonIntensity);
    expect(preview.sun.color.getHex()).toBe(0xff9a5c);
    expect(preview.setWeather('overcast')).toBe(true);
    expect(preview.hemi.intensity).toBeGreaterThan(0);
    expect(preview.setTimeOfDay('night' as never)).toBe(false);
    expect(preview.time).toBe('dusk');
    expect(preview.setWeather('storm' as never)).toBe(false);
    expect(preview.weather).toBe('overcast');
    preview.dispose();
  });

  it('disposes every geometry and material exactly once and stays inert after', () => {
    const preview = createLightingPreview();
    const counts = new Map<string, number>();
    const wrapped = new Set<string>();
    preview.root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !wrapped.has('geo:' + mesh.geometry.uuid)) {
        const geo = mesh.geometry;
        wrapped.add('geo:' + geo.uuid);
        const prior = geo.dispose.bind(geo);
        geo.dispose = () => {
          counts.set('geo:' + geo.uuid, (counts.get('geo:' + geo.uuid) ?? 0) + 1);
          prior();
        };
      }
      const material = mesh.material as THREE.Material | undefined;
      if (material && !Array.isArray(material) && !wrapped.has('mat:' + material.uuid)) {
        wrapped.add('mat:' + material.uuid);
        const prior = material.dispose.bind(material);
        material.dispose = () => {
          counts.set('mat:' + material.uuid, (counts.get('mat:' + material.uuid) ?? 0) + 1);
          prior();
        };
      }
    });
    preview.dispose();
    preview.dispose();
    expect(counts.size).toBeGreaterThan(5);
    for (const count of counts.values()) expect(count).toBe(1);
    expect(preview.disposed).toBe(true);
    expect(preview.setTimeOfDay('noon')).toBe(false);
  });

  it('samples finite terrain everywhere in the preview bounds', () => {
    for (let x = -9; x <= 9; x += 1) {
      for (let z = -9; z <= 9; z += 1) {
        const h = groundHeight(x, z);
        expect(Number.isFinite(h)).toBe(true);
        expect(Math.abs(h)).toBeLessThan(2);
      }
    }
    expect(groundHeight(0, 0)).toBe(0);
  });
});
