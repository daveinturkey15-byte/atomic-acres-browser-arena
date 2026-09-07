import { describe, expect, it } from 'vitest';
import {
  definition,
  HIGH_SEAS_SERVICE_DECK_PRACTICALS,
  HIGH_SEAS_SERVICE_DECK_VOLUME,
} from './high-seas';
import { validateArenaVisualDefinition, type ArenaSpotLightDefinition } from '../arena-visual-definition';
import { HIGH_SEAS_LEVELS } from '../../high-seas';

const lightOf = (practical: { light?: ArenaSpotLightDefinition }): ArenaSpotLightDefinition => {
  expect(practical.light, 'every service-deck practical must carry a canonical light spec').toBeDefined();
  return practical.light as ArenaSpotLightDefinition;
};

describe('High Seas service-deck practical rig', () => {
  it('accepts the authored definition', () => {
    expect(() => validateArenaVisualDefinition(definition)).not.toThrow();
  });

  it('cannot light the deck players fight on', () => {
    // This is the property that let the service deck have real lights at all.
    // The emissive-only policy existed because an unoccluded local light spills
    // through a bulkhead onto the open deck; these fixtures cannot, for three
    // independent reasons, and the test checks all three rather than trusting
    // any one of them.
    const deckPlaneY = HIGH_SEAS_LEVELS.mainDeck;

    // 1. The declared volume's ceiling is below the deck plane, and the
    //    definition validator refuses any light that escapes its volume.
    expect(HIGH_SEAS_SERVICE_DECK_VOLUME.maximum[1]).toBeLessThan(deckPlaneY);

    for (const practical of HIGH_SEAS_SERVICE_DECK_PRACTICALS) {
      const light = lightOf(practical);

      // 2. Every cone points straight down: the target sits directly beneath
      //    the position, so the lit half-space is strictly below the fixture.
      //    A spot contributes exactly zero outside its cone, so this is a hard
      //    bound, not a tuning choice.
      expect(light.target[0], `${practical.id} x`).toBeCloseTo(light.position[0], 6);
      expect(light.target[2], `${practical.id} z`).toBeCloseTo(light.position[2], 6);
      expect(light.target[1], `${practical.id} must aim downward`).toBeLessThan(light.position[1]);
      expect(light.angle, `${practical.id} cone must stay under a hemisphere`).toBeLessThan(Math.PI / 2);

      // 3. The fixture itself is below the deck plane, so even the cone's
      //    horizontal limit cannot reach it.
      expect(light.position[1], `${practical.id} height`).toBeLessThan(deckPlaneY);

      // Shadowed, which is what the occlusion policy demands of any active
      // local light and what stops it reading through the bulkheads.
      expect(practical.policy).toBe('shadowed-local');
      expect(practical.castsShadow).toBe(true);
      expect(light.distance).toBeLessThanOrEqual(practical.maximumDistance);
    }
  });

  it('declares every active fixture against the arena shadow budget', () => {
    // verify-pass64-webgpu.mjs fails the arena if the live scene carries more
    // active local lights than this budget, or any that do not cast shadows.
    // Keeping the two numbers equal here means that gate cannot be surprised by
    // a fixture added without a matching budget decision.
    const shadowed = definition.lighting.practicals.filter((practical) => practical.policy === 'shadowed-local');
    expect(shadowed).toHaveLength(HIGH_SEAS_SERVICE_DECK_PRACTICALS.length);
    expect(shadowed.every((practical) => practical.light !== undefined), 'no legacy spec-less shadowed practicals').toBe(true);
    expect(definition.budgets.maximumShadowLights).toBe(HIGH_SEAS_SERVICE_DECK_PRACTICALS.length);

    const shadowPixels = shadowed.reduce((total, practical) => total + lightOf(practical).shadowMapSize ** 2, 0);
    expect(shadowPixels).toBeLessThanOrEqual(definition.budgets.maximumShadowMapPixels);
  });

  it('covers the whole 40 m run rather than pooling in one place', () => {
    // The measured failure mode was a lit floor under each lamp and median
    // 0/255 between them, so spacing is part of the contract. No point on the
    // corridor centre line may be further than this from a fixture.
    const MAX_GAP_M = 7;
    const zs = HIGH_SEAS_SERVICE_DECK_PRACTICALS.map((practical) => lightOf(practical).position[2]).sort((a, b) => a - b);
    const [minZ, , maxZ] = [HIGH_SEAS_SERVICE_DECK_VOLUME.minimum[2], 0, HIGH_SEAS_SERVICE_DECK_VOLUME.maximum[2]];
    expect(zs[0] - minZ).toBeLessThanOrEqual(MAX_GAP_M);
    expect(maxZ - zs[zs.length - 1]).toBeLessThanOrEqual(MAX_GAP_M);
    for (let index = 1; index < zs.length; index += 1) {
      expect(zs[index] - zs[index - 1], `gap between fixtures at z=${zs[index - 1]} and z=${zs[index]}`).toBeLessThanOrEqual(MAX_GAP_M);
    }

    // The engine-room pair sits off the centre line, over the machinery. A
    // centre-line pair measured 91% of the room bulkhead crushed to black
    // against 22% for the corridor, purely because the room walls are 2.35 m
    // off axis where the corridor's are 0.72 m.
    const roomFixtures = HIGH_SEAS_SERVICE_DECK_PRACTICALS
      .filter((practical) => Math.abs(lightOf(practical).position[2]) < 6.5);
    expect(roomFixtures.length).toBeGreaterThanOrEqual(2);
    expect(roomFixtures.every((practical) => Math.abs(lightOf(practical).position[0]) > 1), 'engine-room fixtures hug the machinery, not the centre line').toBe(true);
    // Left/right symmetric, so neither side of the room is the dark side.
    const xs = roomFixtures.map((practical) => lightOf(practical).position[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-xs[xs.length - 1], 6);
  });

  it('keeps the rig symmetric bow to stern', () => {
    // Both teams reach the service deck from their own ramp. If one leg were
    // brighter than the other, that is a spawn-side advantage measured in
    // whoever gets seen first.
    const byZ = new Map<number, number>();
    for (const practical of HIGH_SEAS_SERVICE_DECK_PRACTICALS) {
      const light = lightOf(practical);
      byZ.set(Number(light.position[2].toFixed(3)), light.intensity);
    }
    for (const [z, intensity] of byZ) {
      if (z === 0) continue;
      expect(byZ.get(Number((-z).toFixed(3))), `no mirrored fixture for z=${z}`).toBe(intensity);
    }
  });
});
