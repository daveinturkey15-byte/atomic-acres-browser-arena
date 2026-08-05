const { execFileSync } = require('child_process');
const raw = 'artifacts/pass66/killstreak-demo-capture/raw-playwright/care-package-74aedf2a-871a-458b-b872-d49131cfef90.webm';
// Timer region top-left (x 8..180, y 8..40) — pure DOM text.
// 3D region center-left (x 200..400, y 250..450) — pure world.
function regionHash(idx, x, y, w, h) {
  const out = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', raw, '-vf', `select=eq(n\\,${idx}),crop=${w}:${h}:${x}:${y},format=gray`, '-vsync', '0', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 2000000 });
  const crypto = require('crypto');
  return crypto.createHash('md5').update(out).digest('hex').slice(0, 8);
}
console.log('idx | timer(top-left DOM) | world(center-left 3D)');
let prevT = null, prevW = null;
for (let i = 285; i <= 312; i += 1) {
  const t = regionHash(i, 8, 8, 172, 32);
  const w = regionHash(i, 200, 250, 200, 200);
  const tMark = prevT && t !== prevT ? 'CHG' : '   ';
  const wMark = prevW && w !== prevW ? 'CHG' : '   ';
  console.log(`${i} (${(i / 25).toFixed(2)}s) | ${t} ${tMark} | ${w} ${wMark}`);
  prevT = t; prevW = w;
}
