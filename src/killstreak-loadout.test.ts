import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KILLSTREAK_LOADOUT,
  KILLSTREAK_LOADOUT_STORAGE_KEY,
  KillstreakLoadoutController,
  readKillstreakLoadout,
  replaceKillstreakSlot,
} from './killstreak-loadout';

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe('Pass 65 killstreak loadout persistence', () => {
  it('loads the exact legal default and persists every slot family', () => {
    const storage = new MemoryStorage();
    const controller = new KillstreakLoadoutController(storage);
    expect(controller.selected).toEqual(DEFAULT_KILLSTREAK_LOADOUT);
    controller.select(1, 'adrenaline');
    controller.select(2, 'piloted-drone');
    controller.select(3, 'carpet-bomber');
    controller.select(4, 'hunter-swarm');
    controller.select(5, 'drone-swarm');
    expect(new KillstreakLoadoutController(storage).selected.slots).toEqual([
      'adrenaline', 'piloted-drone', 'carpet-bomber', 'hunter-swarm', 'drone-swarm',
    ]);
  });

  it('repairs malformed or illegal persisted state without propagating free text', () => {
    const storage = new MemoryStorage();
    storage.setItem(KILLSTREAK_LOADOUT_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'tri-pass', 'future-free-text'],
    }));
    const result = readKillstreakLoadout(storage);
    expect(result).toMatchObject({ source: 'default', repaired: true });
    expect(result.loadout).toEqual(DEFAULT_KILLSTREAK_LOADOUT);
    expect(JSON.parse(storage.getItem(KILLSTREAK_LOADOUT_STORAGE_KEY)!)).toEqual(DEFAULT_KILLSTREAK_LOADOUT);
  });

  it('rejects illegal slot families and duplicate slots 3/4', () => {
    expect(() => replaceKillstreakSlot(DEFAULT_KILLSTREAK_LOADOUT, 1, 'yardhawk')).toThrow(/does not allow/);
    expect(() => replaceKillstreakSlot(DEFAULT_KILLSTREAK_LOADOUT, 4, 'tri-pass')).toThrow(/distinct|duplicate/);
    expect(() => replaceKillstreakSlot(DEFAULT_KILLSTREAK_LOADOUT, 3, 'nuke')).toThrow(/does not allow/);
  });

  it('freezes one immutable match snapshot and refuses mid-match mutation', () => {
    const storage = new MemoryStorage();
    const controller = new KillstreakLoadoutController(storage);
    controller.select(5, 'drone-swarm');
    const first = controller.freezeAtMatchStart();
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.slots[4]).toBe('drone-swarm');
    expect(() => controller.select(5, 'nuke')).toThrow(/frozen/);
    expect(controller.freezeAtMatchStart()).toEqual(first);
    controller.releaseAfterMatch();
    controller.select(5, 'nuke');
    expect(controller.freezeAtMatchStart().slots[4]).toBe('nuke');
  });

  it('supports a canonical profile-backed repository without touching the legacy key', () => {
    const storage = new MemoryStorage();
    const persisted: unknown[] = [];
    const controller = new KillstreakLoadoutController(null, {
      initialLoadout: DEFAULT_KILLSTREAK_LOADOUT,
      persist: (loadout) => { persisted.push(loadout); return true; },
    });
    controller.select(1, 'care-package');
    expect(controller.selected.slots[0]).toBe('care-package');
    expect(persisted).toHaveLength(1);
    expect(storage.values.has(KILLSTREAK_LOADOUT_STORAGE_KEY)).toBe(false);
  });
});
