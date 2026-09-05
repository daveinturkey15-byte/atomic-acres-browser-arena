import { describe, expect, it } from 'vitest';
import { railgunStatusCopy, setHudStyle, setHudText } from './hud-write-cache';

/**
 * PASS 95 finish round, item 3 - the dirty-flag contract: helpers that skip
 * the DOM write when the value is already there, so the 10 Hz HUD tick stops
 * churning identical text and custom properties every 100 ms.
 */
function fakeElement(): { element: HTMLElement; textWrites: () => number; styleWrites: () => number } {
  let textWrites = 0;
  let current: string | null = '';
  const styleWrites: Array<[string, string]> = [];
  const element = {
    style: {
      setProperty(property: string, value: string): void {
        styleWrites.push([property, value]);
      },
    },
  } as unknown as HTMLElement;
  Object.defineProperty(element, 'textContent', {
    get: () => current,
    set: (value: string | null) => {
      textWrites += 1;
      current = value;
    },
  });
  return { element, textWrites: () => textWrites, styleWrites: () => styleWrites.length };
}

describe('hud-write-cache dirty flags', () => {
  it('writes text once and skips identical rewrites', () => {
    const { element, textWrites } = fakeElement();
    setHudText(element, 'AMMO 30');
    expect(textWrites()).toBe(1);
    setHudText(element, 'AMMO 30');
    expect(textWrites()).toBe(1);
    setHudText(element, 'AMMO 29');
    expect(textWrites()).toBe(2);
    expect(element.textContent).toBe('AMMO 29');
  });

  it('writes a style property once per distinct value', () => {
    const { element, styleWrites } = fakeElement();
    setHudStyle(element, '--spread', '10px');
    expect(styleWrites()).toBe(1);
    setHudStyle(element, '--spread', '10px');
    expect(styleWrites()).toBe(1);
    setHudStyle(element, '--spread', '11px');
    expect(styleWrites()).toBe(2);
  });

  it('tracks style properties independently', () => {
    const { element, styleWrites } = fakeElement();
    setHudStyle(element, '--spread', '10px');
    setHudStyle(element, 'width', '80%');
    expect(styleWrites()).toBe(2);
    setHudStyle(element, '--spread', '10px');
    setHudStyle(element, 'width', '80%');
    expect(styleWrites()).toBe(2);
  });

  it('reproduces every railgun status branch', () => {
    const base = {
      roundsRemaining: 3,
      weapon: 'railgun',
      rechamberRemainingMs: 0,
      adsResetRequired: false,
      railgunName: 'RAILGUN',
    };
    expect(railgunStatusCopy({ ...base, roundsRemaining: 0 })).toBe('RAILGUN DEPLETED · NO RESUPPLY');
    expect(railgunStatusCopy({ ...base, weapon: 'carbine' })).toBe('SIDEARM ACTIVE · RAILGUN 3 ROUNDS');
    expect(railgunStatusCopy({ ...base, rechamberRemainingMs: 450 })).toBe('RAILGUN RECHAMBER 0.5s');
    expect(railgunStatusCopy({ ...base, adsResetRequired: true })).toBe('RAILGUN RELEASE ADS');
    expect(railgunStatusCopy(base)).toBe('RAILGUN THERMAL READY');
  });
});
