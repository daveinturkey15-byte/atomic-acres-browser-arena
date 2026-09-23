import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyHudSway,
  createHudMotionTargets,
  createHudSwayState,
  setHudProperty,
  type HudSwayTarget,
} from './ui/pass77-hud-sway';
import {
  HUD_MOTION_PROPERTIES,
  HUD_MOTION_TARGET_COUNT,
  HUD_MOTION_TARGETS,
} from './ui/surface-registry';

const hudStylesheet = readFileSync(new URL('./ui/pass77-instrument-hud.css', import.meta.url), 'utf8');

function propertyBlock(property: string): string {
  const block = hudStylesheet.match(new RegExp(`@property ${property} \\{([\\s\\S]*?)\\}`, 'u'))?.[1];
  if (!block) throw new Error(`Missing HUD @property ${property}`);
  return block;
}

describe('HUD frame-driven custom-property contract', () => {
  it('does not inherit any frame-driven HUD @property', () => {
    expect(HUD_MOTION_PROPERTIES).toHaveLength(5);
    for (const property of HUD_MOTION_PROPERTIES) {
      expect(propertyBlock(property)).toContain('inherits: false;');
      expect(propertyBlock(property)).not.toContain('inherits: true;');
    }
  });

  it('resolves the registry once and limits a frame write to its target count', () => {
    const queried: string[] = [];
    const writes = new Set<HudSwayTarget>();
    const targets = new Map<string, HudSwayTarget>();
    for (const definition of HUD_MOTION_TARGETS) {
      targets.set(definition.selector, {
        style: { setProperty: () => undefined },
      });
    }
    for (const target of targets.values()) {
      target.style.setProperty = (property: string, value: string) => {
        void property;
        void value;
        writes.add(target);
      };
    }
    const root = {
      querySelector: (selector: string) => {
        queried.push(selector);
        return targets.get(selector) ?? null;
      },
    } as unknown as ParentNode;

    const motionTargets = createHudMotionTargets(root);
    expect(queried).toEqual(HUD_MOTION_TARGETS.map(({ selector }) => selector));
    queried.length = 0;

    applyHudSway(motionTargets, createHudSwayState(), {
      yaw: 0.4, pitch: 0.1, speed: 3, deltaMs: 16,
    });
    setHudProperty(motionTargets.health, '--hud-health', '1.000');

    expect(queried).toEqual([]);
    expect(writes.size).toBeLessThanOrEqual(HUD_MOTION_TARGET_COUNT);
    expect(writes.size).toBe(HUD_MOTION_TARGET_COUNT);
    expect(motionTargets.all).toHaveLength(HUD_MOTION_TARGET_COUNT);
  });
});
