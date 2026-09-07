export type ControllableKillstreakId = 'piloted-drone' | 'chopper';

export type ControllableSupportEntity = Readonly<{
  id: string;
  ownerId: string;
  expiresInMs: number;
  kind: 'drone' | 'chopper' | string;
  mode?: 'piloted' | 'swarm' | string | null;
}>;

export function controllableKillstreakId(id: string): id is ControllableKillstreakId {
  return id === 'piloted-drone' || id === 'chopper';
}

/**
 * Selects one live owned platform for a repeated slot-key press. Entity IDs are
 * host-issued and stable, so lexical ordering gives every client the same
 * supersession target even when snapshot iteration order differs.
 */
export function selectControllableSupportEntity(
  id: ControllableKillstreakId,
  ownerId: string,
  entities: readonly ControllableSupportEntity[],
): ControllableSupportEntity | null {
  // A drone flying AUTONOMOUSLY is still a drone you own and may take over -
  // that is exactly what 'toggle-piloted-drone' means. Requiring mode
  // 'piloted' here made an autonomous drone unselectable, so the key fell
  // through to a fresh activation instead of handing you the controls.
  const candidates = entities.filter((entity) => entity.ownerId === ownerId
    && entity.expiresInMs > 0
    && (id === 'chopper' ? entity.kind === 'chopper' : entity.kind === 'drone'));
  candidates.sort((left, right) => left.id.localeCompare(right.id));
  return candidates[0] ?? null;
}

/**
 * Slot-sharing alternatives that resolve a slot-key press to a CONTROLLABLE
 * platform the player already owns. The killstreak-range stations hand out a
 * piloted drone while the loadout slot still shows yardhawk (its direct
 * slot-2 alternative) - without this mapping the key above a live owned
 * drone activated nothing and the owner could never enter it. Deliberately
 * ONLY the exclusive pair: broader families (chopper vs the slot-3/4
 * strikes) would steal real activation presses in live matches.
 */
export function controllableAlternativeForSlotId(slotId: string): ControllableKillstreakId | null {
  return slotId === 'yardhawk' ? 'piloted-drone' : null;
}
