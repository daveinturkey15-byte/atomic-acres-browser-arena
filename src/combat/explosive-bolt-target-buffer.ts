import * as THREE from 'three';

export type ExplosiveBoltTargetKind = 'player' | 'remote' | 'bot';

/**
 * A target snapshot leased from {@link ExplosiveBoltTargetBuffer}.
 *
 * Callers must consume the record synchronously before the next `reset()`.
 * Positions are copied into buffer-owned vectors so live actor transforms and
 * target records never alias one another.
 */
export type ExplosiveBoltTarget<TTeam> = {
  id: string;
  team: TTeam;
  lifeId: number;
  kind: ExplosiveBoltTargetKind;
  position: THREE.Vector3;
};

/**
 * High-water scratch storage for the projectile target hot path.
 *
 * Growth allocates one record and Vector3 for a newly observed concurrent
 * target. Once warm, reset/append/at reuse those exact objects without making
 * a per-frame array, record, or position clone.
 */
export class ExplosiveBoltTargetBuffer<TTeam> {
  readonly #slots: ExplosiveBoltTarget<TTeam>[] = [];
  #length = 0;

  get length(): number {
    return this.#length;
  }

  reset(): void {
    this.#length = 0;
  }

  append(
    id: string,
    team: TTeam,
    lifeId: number,
    kind: ExplosiveBoltTargetKind,
    sourcePosition: Readonly<{ x: number; y: number; z: number }>,
    verticalOffset: number,
  ): void {
    const index = this.#length;
    let target = this.#slots[index];
    if (!target) {
      target = { id, team, lifeId, kind, position: new THREE.Vector3() };
      this.#slots.push(target);
    }
    target.id = id;
    target.team = team;
    target.lifeId = lifeId;
    target.kind = kind;
    target.position.set(sourcePosition.x, sourcePosition.y + verticalOffset, sourcePosition.z);
    this.#length = index + 1;
  }

  at(index: number): ExplosiveBoltTarget<TTeam> {
    if (!Number.isInteger(index) || index < 0 || index >= this.#length) {
      throw new RangeError(`Explosive-bolt target scratch index ${index} is outside active length ${this.#length}`);
    }
    return this.#slots[index]!;
  }

  findIndex(id: string, lifeId: number): number {
    for (let index = 0; index < this.#length; index += 1) {
      const target = this.#slots[index]!;
      if (target.id === id && target.lifeId === lifeId) return index;
    }
    return -1;
  }
}
