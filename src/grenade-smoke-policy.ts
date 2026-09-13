import type { GrenadeId } from './combat/grenade-catalog';
import { EXPLOSION_RESIDUE_SMOKE_RADIUS_M, SMOKE_VOLUME_RADIUS_M } from './smoke-authority';

// HF563/564: bounded frag/Semtex slice. A new grenade ID requires an explicit
// decision here; utility flash and generic visual explosions are not producers.
const GRENADE_SMOKE_RADII = Object.freeze({
  frag: EXPLOSION_RESIDUE_SMOKE_RADIUS_M,
  smoke: SMOKE_VOLUME_RADIUS_M,
  flash: null,
  semtex: EXPLOSION_RESIDUE_SMOKE_RADIUS_M,
} satisfies Record<GrenadeId, number | null>);

export function grenadeSmokeRadiusM(grenade: GrenadeId): number | null {
  return GRENADE_SMOKE_RADII[grenade];
}
