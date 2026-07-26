import {
  PASS65_KILLSTREAK_SLOT_DEFINITIONS,
  parseKillstreakLoadout,
  validateKillstreakLoadout,
  type KillstreakLoadoutV1,
  type Pass65KillstreakId,
} from './killstreak-catalog';

export const KILLSTREAK_LOADOUT_STORAGE_KEY = 'atomic-acres:killstreak-loadout:v1';

export const DEFAULT_KILLSTREAK_LOADOUT: KillstreakLoadoutV1 = parseKillstreakLoadout({
  schemaVersion: 1,
  slots: ['scout-sweep', 'yardhawk', 'tri-pass', 'chopper', 'nuke'],
});

export type KillstreakLoadoutStorage = Pick<Storage, 'getItem' | 'setItem'>;

export type KillstreakLoadoutReadResult = Readonly<{
  loadout: KillstreakLoadoutV1;
  source: 'persisted' | 'default';
  repaired: boolean;
}>;

function cloneLoadout(loadout: KillstreakLoadoutV1): KillstreakLoadoutV1 {
  return parseKillstreakLoadout({ schemaVersion: 1, slots: [...loadout.slots] });
}

export function readKillstreakLoadout(storage: KillstreakLoadoutStorage | null): KillstreakLoadoutReadResult {
  if (!storage) return Object.freeze({ loadout: cloneLoadout(DEFAULT_KILLSTREAK_LOADOUT), source: 'default', repaired: false });
  let raw: string | null = null;
  try {
    raw = storage.getItem(KILLSTREAK_LOADOUT_STORAGE_KEY);
    if (raw === null) {
      return Object.freeze({ loadout: cloneLoadout(DEFAULT_KILLSTREAK_LOADOUT), source: 'default', repaired: false });
    }
    const loadout = parseKillstreakLoadout(JSON.parse(raw));
    return Object.freeze({ loadout, source: 'persisted', repaired: false });
  } catch {
    const loadout = cloneLoadout(DEFAULT_KILLSTREAK_LOADOUT);
    try { storage.setItem(KILLSTREAK_LOADOUT_STORAGE_KEY, JSON.stringify(loadout)); } catch { /* Storage is optional. */ }
    return Object.freeze({ loadout, source: 'default', repaired: raw !== null });
  }
}

export function persistKillstreakLoadout(
  storage: KillstreakLoadoutStorage | null,
  loadout: KillstreakLoadoutV1,
): boolean {
  const canonical = cloneLoadout(loadout);
  if (!storage) return false;
  try {
    storage.setItem(KILLSTREAK_LOADOUT_STORAGE_KEY, JSON.stringify(canonical));
    return storage.getItem(KILLSTREAK_LOADOUT_STORAGE_KEY) === JSON.stringify(canonical);
  } catch {
    return false;
  }
}

export function replaceKillstreakSlot(
  loadout: KillstreakLoadoutV1,
  slot: 1 | 2 | 3 | 4 | 5,
  id: Pass65KillstreakId,
): KillstreakLoadoutV1 {
  const definition = PASS65_KILLSTREAK_SLOT_DEFINITIONS[slot - 1];
  if (!definition.allowedIds.includes(id)) throw new Error(`slot ${slot} does not allow ${id}`);
  const slots = [...loadout.slots] as Pass65KillstreakId[];
  slots[slot - 1] = id;
  const validation = validateKillstreakLoadout({ schemaVersion: 1, slots });
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return parseKillstreakLoadout({ schemaVersion: 1, slots });
}

/**
 * Owns the editable persisted selection and the immutable match-start snapshot.
 * UI edits never mutate a running match, even if a caller forgets to disable a
 * form control.
 */
export class KillstreakLoadoutController {
  private editable: KillstreakLoadoutV1;
  private frozenMatch: KillstreakLoadoutV1 | null = null;

  constructor(private readonly storage: KillstreakLoadoutStorage | null) {
    this.editable = readKillstreakLoadout(storage).loadout;
  }

  get selected(): KillstreakLoadoutV1 {
    return cloneLoadout(this.editable);
  }

  get activeMatch(): KillstreakLoadoutV1 | null {
    return this.frozenMatch ? cloneLoadout(this.frozenMatch) : null;
  }

  select(slot: 1 | 2 | 3 | 4 | 5, id: Pass65KillstreakId): KillstreakLoadoutV1 {
    if (this.frozenMatch) throw new Error('killstreak loadout is frozen for the active match');
    const next = replaceKillstreakSlot(this.editable, slot, id);
    if (!persistKillstreakLoadout(this.storage, next) && this.storage) {
      throw new Error('killstreak loadout persistence verification failed');
    }
    this.editable = next;
    return this.selected;
  }

  freezeAtMatchStart(): KillstreakLoadoutV1 {
    if (!this.frozenMatch) this.frozenMatch = cloneLoadout(this.editable);
    return this.activeMatch!;
  }

  releaseAfterMatch(): void {
    this.frozenMatch = null;
  }
}

