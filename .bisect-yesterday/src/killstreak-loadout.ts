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

export type KillstreakLoadoutControllerOptions = Readonly<{
  initialLoadout?: KillstreakLoadoutV1;
  persist?: (loadout: KillstreakLoadoutV1) => boolean;
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

export type KillstreakSlotSelectionResult = Readonly<{
  loadout: KillstreakLoadoutV1;
  /** HF-316 owner correction: when the requested id was already held by the
   * sibling heavy slot (3 <-> 4), the sibling that received the displaced pick;
   * null when no swap was needed. */
  swappedSlot: 3 | 4 | null;
}>;

/**
 * HF-316 owner correction (swap-on-conflict): slots 3 and 4 share one heavy
 * pool and must stay distinct. Picking the sibling's current reward used to be
 * blocked as a silent no-op in the menu; the requested resolution is an
 * automatic swap — the displaced pick moves into the sibling slot, then the
 * whole loadout is re-validated. Non-conflicting picks behave exactly like
 * replaceKillstreakSlot.
 */
export function replaceKillstreakSlotWithSwap(
  loadout: KillstreakLoadoutV1,
  slot: 1 | 2 | 3 | 4 | 5,
  id: Pass65KillstreakId,
): KillstreakSlotSelectionResult {
  const definition = PASS65_KILLSTREAK_SLOT_DEFINITIONS[slot - 1];
  if (!definition.allowedIds.includes(id)) throw new Error(`slot ${slot} does not allow ${id}`);
  const sibling: 3 | 4 | null = slot === 3 ? 4 : slot === 4 ? 3 : null;
  const displaced = loadout.slots[slot - 1];
  const slots = [...loadout.slots] as Pass65KillstreakId[];
  slots[slot - 1] = id;
  let swappedSlot: 3 | 4 | null = null;
  if (sibling !== null && loadout.slots[sibling - 1] === id && displaced !== id) {
    slots[sibling - 1] = displaced;
    swappedSlot = sibling;
  }
  const validation = validateKillstreakLoadout({ schemaVersion: 1, slots });
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return Object.freeze({ loadout: parseKillstreakLoadout({ schemaVersion: 1, slots }), swappedSlot });
}

/**
 * Owns the editable persisted selection and the immutable match-start snapshot.
 * UI edits never mutate a running match, even if a caller forgets to disable a
 * form control.
 */
export class KillstreakLoadoutController {
  private editable: KillstreakLoadoutV1;
  private frozenMatch: KillstreakLoadoutV1 | null = null;
  private readonly persistSelection: ((loadout: KillstreakLoadoutV1) => boolean) | null;

  constructor(
    private readonly storage: KillstreakLoadoutStorage | null,
    options: KillstreakLoadoutControllerOptions = {},
  ) {
    this.editable = options.initialLoadout
      ? cloneLoadout(options.initialLoadout)
      : readKillstreakLoadout(storage).loadout;
    this.persistSelection = options.persist ?? null;
  }

  get selected(): KillstreakLoadoutV1 {
    return cloneLoadout(this.editable);
  }

  get activeMatch(): KillstreakLoadoutV1 | null {
    return this.frozenMatch ? cloneLoadout(this.frozenMatch) : null;
  }

  /** HF-316 owner correction: routes through replaceKillstreakSlotWithSwap so
   * a sibling heavy-slot (3 <-> 4) conflict swaps instead of throwing. */
  select(slot: 1 | 2 | 3 | 4 | 5, id: Pass65KillstreakId): KillstreakSlotSelectionResult {
    if (this.frozenMatch) throw new Error('killstreak loadout is frozen for the active match');
    const { loadout: next, swappedSlot } = replaceKillstreakSlotWithSwap(this.editable, slot, id);
    const persisted = this.persistSelection
      ? this.persistSelection(next)
      : persistKillstreakLoadout(this.storage, next);
    if (!persisted && (this.persistSelection || this.storage)) {
      throw new Error('killstreak loadout persistence verification failed');
    }
    this.editable = next;
    return Object.freeze({ loadout: this.selected, swappedSlot });
  }

  freezeAtMatchStart(): KillstreakLoadoutV1 {
    if (!this.frozenMatch) this.frozenMatch = cloneLoadout(this.editable);
    return this.activeMatch!;
  }

  /** Replace only the running-match projection after an authenticated host
   * resume. The editable/persisted menu choice remains local and will become
   * eligible again when the match ends. */
  reconcileActiveMatchAuthority(loadout: KillstreakLoadoutV1): KillstreakLoadoutV1 {
    if (!this.frozenMatch) throw new Error('cannot reconcile killstreak authority outside an active match');
    this.frozenMatch = cloneLoadout(loadout);
    return this.activeMatch!;
  }

  releaseAfterMatch(): void {
    this.frozenMatch = null;
  }
}
