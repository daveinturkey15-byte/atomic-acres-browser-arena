import { chromium } from 'playwright';
// Hypothesis: Chrome limits concurrent WebGPU devices per browser. Dave has opened
// the game many times across many tabs today; each live tab holds a device. Once the
// limit is hit, requestAdapter returns null in NEW tabs - which is exactly his symptom,
// and exactly why a fresh browser always works.
const URL = 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/channels/pass81/?release=latest';
const b = await chromium.launch({ headless: true, channel: 'chrome', args: ['--mute-audio'] });
const held = [];
for (let i = 1; i <= 20; i += 1) {
  const p = await b.newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const r = await p.evaluate(async () => {
    if (!navigator.gpu) return { ok: false, why: 'no navigator.gpu' };
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { ok: false, why: 'requestAdapter returned null' };
    try { const d = await a.requestDevice(); window.__held = d; return { ok: true }; }
    catch (e) { return { ok: false, why: String(e).slice(0, 60) }; }
  });
  held.push(p);
  if (!r.ok) { console.log(`FAILED at tab ${i}: ${r.why}`); break; }
  if (i % 5 === 0 || i <= 3) console.log(`tab ${i}: device acquired`);
  if (i === 20) console.log('20 tabs all acquired a device - no per-browser limit hit');
}
await b.close();
