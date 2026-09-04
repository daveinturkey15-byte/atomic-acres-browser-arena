// Prints, for every arena in ARENA_IDS, a markdown table of resolved lighting states (hour, sun, shadow floor, exposure, tints) for authored/early/midday/late lighting choices to stdout.
// Usage: npx tsx scripts/qa/lane-ab-tod-table.mjs
// Flags/env: none (script reads no process.argv entries, no process.env variables, no --flags)
// Writes: stdout only (markdown table); no files or directories
// Exit codes: 0 on success (no process.exit calls); non-zero only via uncaught exception
import { ARENA_DAYLIGHT_PROFILES, resolveLightingConditions, resolveLightingHour } from '../../src/rendering/lighting-conditions.ts';
import { ARENA_IDS } from '../../src/arena-identity.ts';
const LABEL = { 'atomic-acres':'Nuke Town','skyline-terminal':'Terminal','rustworks-1v1':'RustRig','gun-range':'Gun Range',farcrysis:'Farcrysis','high-seas':'High Seas',test1:'Firing Range',test2:'Raid',map3:'Map 3',nuketown2:'Nuke Town Rebuild',raid2:'Raid Rebuild' };
const label = (id) => { if (!LABEL[id]) throw new Error(`no display label for arena '${id}' -- add it to LABEL`); return LABEL[id]; };
const hm = (h) => `${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round((h%1)*60)).padStart(2,'0')}`;
const f = (n,d=3) => Number(n).toFixed(d);
for (const id of ARENA_IDS) {
  const p = ARENA_DAYLIGHT_PROFILES[id];
  console.log(`\n### ${label(id)} (\`${id}\`) — ${p.identity}${p.pinned ? ' — PINNED' : ''}`);
  console.log(`anchor ${hm(p.authoredHour)} | band ${hm(p.hourRange[0])}-${hm(p.hourRange[1])} | arc ${hm(p.dayWindow[0])}-${hm(p.dayWindow[1])} | elev ${p.elevationRange[0]}-${p.elevationRange[1]} deg | az swing ${p.azimuthSwingDegrees} deg | cycle ${p.cycleMatchMinutes} min`);
  console.log('| state | hour | sun x | elev d | azim d | shadow floor x | exposure x | sun tint RGB | sky tint RGB |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const choice of ['authored','early','midday','late']) {
    for (const sd of [0, 0.45]) {
      const h = resolveLightingHour(id, 0, 0, choice);
      const w = resolveLightingConditions({ arenaId:id, fixedHour:h, skyDarkenAmount: sd });
      const tag = sd === 0 ? choice : `${choice} + heavy`;
      console.log(`| ${tag} | ${hm(w.hour)} | ${f(w.sunIntensityScale)} | ${f(w.sunElevationDeltaDegrees,1)} | ${f(w.sunAzimuthDeltaDegrees,1)} | ${f(w.shadowFloorScale)} | ${f(w.exposureScale)} | ${w.sunTint.map(v=>f(v,3)).join(' ')} | ${w.ambientTint.map(v=>f(v,3)).join(' ')} |`);
    }
  }
}
