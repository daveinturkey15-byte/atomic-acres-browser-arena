export type HostKillstreakLoadoutAckIdentity = Readonly<{
  connectionEpoch: string;
  matchEpoch: number;
  actorId: string;
  lifeId: number;
}>;

function validIdentity(identity: HostKillstreakLoadoutAckIdentity): boolean {
  return identity.connectionEpoch.length > 0
    && Number.isSafeInteger(identity.matchEpoch)
    && identity.matchEpoch > 0
    && identity.actorId.length > 0
    && Number.isSafeInteger(identity.lifeId)
    && identity.lifeId >= 0;
}

function sameIdentity(
  left: HostKillstreakLoadoutAckIdentity,
  right: HostKillstreakLoadoutAckIdentity,
): boolean {
  return left.connectionEpoch === right.connectionEpoch
    && left.matchEpoch === right.matchEpoch
    && left.actorId === right.actorId
    && left.lifeId === right.lifeId;
}

export class HostKillstreakLoadoutAckRegistry {
  private readonly acknowledgedByActor = new Map<string, HostKillstreakLoadoutAckIdentity>();

  needsAck(identity: HostKillstreakLoadoutAckIdentity): boolean {
    if (!validIdentity(identity)) return false;
    const acknowledged = this.acknowledgedByActor.get(identity.actorId);
    return acknowledged === undefined || !sameIdentity(acknowledged, identity);
  }

  recordReliableResult(identity: HostKillstreakLoadoutAckIdentity, reliableSent: boolean): boolean {
    if (!reliableSent || !validIdentity(identity)) return false;
    this.acknowledgedByActor.set(identity.actorId, Object.freeze({ ...identity }));
    return true;
  }

  acknowledged(identity: HostKillstreakLoadoutAckIdentity): boolean {
    const recorded = this.acknowledgedByActor.get(identity.actorId);
    return recorded !== undefined && sameIdentity(recorded, identity);
  }

  clearActor(actorId: string): boolean {
    return this.acknowledgedByActor.delete(actorId);
  }

  clear(): void {
    this.acknowledgedByActor.clear();
  }

  get size(): number {
    return this.acknowledgedByActor.size;
  }
}
