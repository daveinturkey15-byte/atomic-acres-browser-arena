import { readdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
const dir = 'docs/assets/ibl-fix-2026-08-31';
const lin = (c) => (c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4);
async function analyse(file){
  const {data,info}=await sharp(`${dir}/${file}`).raw().toBuffer({resolveWithObject:true});
  const n=info.width*info.height; const l=new Float64Array(n);
  let clipped=0, dark=0;
  for(let i=0,p=0;p<n;p++,i+=info.channels){
    const y=0.2126*lin(data[i]/255)+0.7152*lin(data[i+1]/255)+0.0722*lin(data[i+2]/255);
    l[p]=y; if (data[i]>=250 && data[i+1]>=250 && data[i+2]>=250) clipped++; if (y<0.005) dark++;
  }
  const sorted=Float64Array.from(l).sort();
  const q=(f)=>+sorted[Math.floor(n*f)].toFixed(4);
  return { p01:q(0.01), p50:q(0.5), p99:q(0.99), clippedPct:+((clipped/n)*100).toFixed(2), crushedPct:+((dark/n)*100).toFixed(2) };
}
const files = readdirSync(dir).filter((f)=>f.endsWith('.png'));
const rows = {};
for (const f of files.sort()) {
  const key = f.replace(/-(before|after)\.png$/, '');
  const side = f.endsWith('-before.png') ? 'before' : 'after';
  rows[key] = rows[key] || {};
  rows[key][side] = await analyse(f);
}
for (const [k,v] of Object.entries(rows)) {
  console.log(k.padEnd(42), 'p01', v.before.p01, '->', v.after.p01, '| p50', v.before.p50, '->', v.after.p50, '| p99', v.before.p99, '->', v.after.p99, '| clipped%', v.before.clippedPct, '->', v.after.clippedPct, '| crushed%', v.before.crushedPct, '->', v.after.crushedPct);
}
writeFileSync(`${dir}/frame-tone-analysis.json`, `${JSON.stringify(rows, null, 2)}\n`);
