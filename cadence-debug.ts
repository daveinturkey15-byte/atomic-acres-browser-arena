import { execFileSync } from 'node:child_process';
const path = process.argv[2] ?? 'artifacts/pass66/killstreak-demo-capture/staged/scout-sweep.mp4';
const W = 96, H = 54;
const raw = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path, '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-vsync', '0', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, maxBuffer: 300_000_000 });
const frameCount = Math.floor(raw.length / (W * H));
let near = 0;
const runs: number[] = [];
let run = 0;
for (let i = 1; i < frameCount; i++) {
  const a = raw.subarray((i - 1) * W * H, i * W * H);
  const b = raw.subarray(i * W * H, (i + 1) * W * H);
  let sum = 0;
  for (let j = 0; j < a.length; j += 7) sum += Math.abs(a[j] - b[j]);
  const meanDelta = sum / (a.length / 7);
  const dup = meanDelta < 1.5;
  if (dup) { near++; run++; } else { if (run > 0) runs.push(run); run = 0; }
}
if (run > 0) runs.push(run);
console.log(JSON.stringify({ frameCount, nearRatio: (near / (frameCount - 1)).toFixed(3), longestRun: Math.max(...runs), runs: runs.slice(0, 24) }));
