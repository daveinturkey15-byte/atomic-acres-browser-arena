import { WEAPON_CATALOG } from "./src/combat/weapon-catalog";
const rows = Object.values(WEAPON_CATALOG).map((w) => ({
  id: w.id, slot: w.slot, rpm: w.rpm, dmg: w.damage.base, pellets: w.pellets,
  dps: Math.round(w.damage.base * w.pellets * w.rpm / 60),
  falloff: `${w.damage.falloffStartM}-${w.damage.falloffEndM}m`,
  minDmg: w.damage.minimum,
  recoil: +(w.recoil.pitchRadians + w.recoil.yawRadians).toFixed(4),
  pen: `${w.penetration.maximumSurfaces}s/p${w.penetration.power}`,
  mag: w.magazine,
}));
console.table(rows);
