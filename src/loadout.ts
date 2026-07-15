import type { PrimaryWeaponId, SidearmWeaponId } from './protocol';

export type FieldKitId = 'balanced' | 'runner' | 'breacher' | 'marksman';

export type FieldKit = {
  id: FieldKitId;
  title: string;
  weapon: PrimaryWeaponId;
  sidearm: SidearmWeaponId;
  role: string;
  summary: string;
  traits: [string, string, string];
};

export const FIELD_KITS: readonly FieldKit[] = [
  {
    id: 'balanced',
    title: 'Linekeeper',
    weapon: 'carbine',
    sidearm: 'pistol',
    role: 'CONTROL / MID RANGE',
    summary: 'Stable automatic pressure with the cleanest sight picture.',
    traits: ['Range 4', 'Control 4', 'Mobility 3'],
  },
  {
    id: 'runner',
    title: 'Circuit Runner',
    weapon: 'smg',
    sidearm: 'pistol',
    role: 'MOBILITY / CLOSE RANGE',
    summary: 'Fast handling and dense close-range fire for side routes.',
    traits: ['Range 2', 'Control 3', 'Mobility 5'],
  },
  {
    id: 'breacher',
    title: 'Doorbreaker',
    weapon: 'scattergun',
    sidearm: 'pistol',
    role: 'BURST / VERY CLOSE',
    summary: 'Heavy short-range impact with a deliberate pump cycle.',
    traits: ['Range 1', 'Control 2', 'Mobility 3'],
  },
  {
    id: 'marksman',
    title: 'Longline Marksman',
    weapon: 'sniper',
    sidearm: 'machine-pistol',
    role: 'PRECISION / LONG RANGE',
    summary: 'One-headshot Longline precision backed by a compact full-auto G18-style sidearm.',
    traits: ['Range 5', 'Control 2', 'Mobility 2'],
  },
] as const;

export const DEFAULT_FIELD_KIT: FieldKitId = 'balanced';
export const FIELD_KIT_STORAGE_KEY = 'atomic-acres.field-kit.v1';
export const SERVICE_PISTOL = 'pistol' as const;
export const MARKSMAN_AUTO_PISTOL = 'machine-pistol' as const;

export function sidearmForPrimary(primary: PrimaryWeaponId): SidearmWeaponId {
  return primary === 'sniper' ? MARKSMAN_AUTO_PISTOL : SERVICE_PISTOL;
}

export function deployedWeapons(primary: PrimaryWeaponId): readonly [PrimaryWeaponId, SidearmWeaponId] {
  return [primary, sidearmForPrimary(primary)];
}

export function fieldKitById(value: unknown): FieldKit {
  return FIELD_KITS.find((kit) => kit.id === value) ?? FIELD_KITS.find((kit) => kit.id === DEFAULT_FIELD_KIT)!;
}

export function parseFieldKitSelection(value: string | null): FieldKitId {
  if (!value) return DEFAULT_FIELD_KIT;
  try {
    const parsed = JSON.parse(value) as { version?: unknown; selected?: unknown };
    if (parsed.version !== 1) return DEFAULT_FIELD_KIT;
    return fieldKitById(parsed.selected).id;
  } catch {
    return DEFAULT_FIELD_KIT;
  }
}

export function serializeFieldKitSelection(selected: FieldKitId): string {
  return JSON.stringify({ version: 1, selected: fieldKitById(selected).id });
}
