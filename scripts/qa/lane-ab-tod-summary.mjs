import { ARENA_DAYLIGHT_PROFILES, resolveLightingConditions, resolveLightingHour, LIGHTING_CONDITION_BOUNDS } from '../../src/rendering/lighting-conditions.ts';
import { ARENA_IDS } from '../../src/arena-identity.ts';
import { ARENA_WEATHER_PROFILES } from '../../src/weather/weather-state.ts';
const LABEL = { 'atomic-acres':'Nuke Town','skyline-terminal':'Terminal','rustworks-1v1':'RustRig','gun-range':'Gun Range',farcrysis:'Farcrysis','high-seas':'High Seas',test1:'Firing Range',test2:'Raid',map3:'Map 3',nuketown2:'Nuke Town Rebuild' };
const label = (id) => { if (!LABEL[id]) throw new Error(`no display label for arena '${id}' -- add it to LABEL`); return LABEL[id]; };
const hm = (h)=>`${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round((h%1)*60)).padStart(2,'0')}`;
const f=(n,d=3)=>Number(n).toFixed(d);
console.log('| arena | identity | band | anchor | weather set | key x (min..max) | shadow floor x (max) | exposure x (max) | sun elev delta (deg) | sun azim delta (deg) |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
for (const id of ARENA_IDS) {
  const p = ARENA_DAYLIGHT_PROFILES[id];
  let kmin=Infinity,kmax=-Infinity,fmax=0,emax=0,elmin=0,elmax=0,azmin=0,azmax=0;
  const steps=192;
  for (let s=0;s<=steps;s+=1){
    const h=p.hourRange[0]+((p.hourRange[1]-p.hourRange[0])*s)/steps;
    const w=resolveLightingConditions({arenaId:id,fixedHour:h});
    kmin=Math.min(kmin,w.sunIntensityScale); kmax=Math.max(kmax,w.sunIntensityScale);
    fmax=Math.max(fmax,w.shadowFloorScale); emax=Math.max(emax,w.exposureScale);
    elmin=Math.min(elmin,w.sunElevationDeltaDegrees); elmax=Math.max(elmax,w.sunElevationDeltaDegrees);
    azmin=Math.min(azmin,w.sunAzimuthDeltaDegrees); azmax=Math.max(azmax,w.sunAzimuthDeltaDegrees);
  }
  const wx = ARENA_WEATHER_PROFILES[id].availableStates.join(', ');
  console.log(`| ${label(id)} | ${p.identity}${p.pinned?' **(pinned)**':''} | ${hm(p.hourRange[0])}-${hm(p.hourRange[1])} | ${hm(p.authoredHour)} | ${wx} | ${f(kmin)}..${f(kmax)} | ${f(fmax)} | ${f(emax)} | ${f(elmin,1)}..${f(elmax,1)} | ${f(azmin,1)}..${f(azmax,1)} |`);
}
console.log('\nBOUNDS ' + JSON.stringify(LIGHTING_CONDITION_BOUNDS));
