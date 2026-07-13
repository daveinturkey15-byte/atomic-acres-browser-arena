// Measures Atomic Acres in an already-running Windows Chrome via raw CDP.
// Launch Chrome with --remote-debugging-port=9223 --disable-frame-rate-limit --disable-gpu-vsync
// so a 30 Hz virtual display does not hide the AMD renderer's actual throughput.
const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9223';
const targets = await (await fetch(`${endpoint}/json`)).json();
const target = targets.find((item) => item.type === 'page');
if (!target) throw new Error('No Windows Chrome page target found');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let nextId = 1;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(JSON.stringify(message.error)));
  else resolve(message.result);
};
function cdp(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'evaluation failed');
  return result.result.value;
}
async function waitFor(expression, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { if (await evaluate(expression)) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out: ${expression}`);
}
async function profile(url, label) {
  await cdp('Page.navigate', { url });
  await waitFor('Boolean(window.__ATOMIC_ACRES_DEBUG__?.snapshot && document.readyState === "complete")', 45_000);
  await evaluate('window.__ATOMIC_ACRES_DEBUG__.startSolo(); window.__ATOMIC_ACRES_DEBUG__.setBotsFrozen(true); true');
  await waitFor('window.__ATOMIC_ACRES_DEBUG__.snapshot().matchPhase === "active"', 20_000);
  await new Promise((resolve) => setTimeout(resolve, 1_500));
  const gpu = await evaluate(`(() => {
    const gl = document.querySelector('canvas')?.getContext('webgl2');
    if (!gl) return { renderer: 'no-webgl2' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
      dpr: devicePixelRatio, width: innerWidth, height: innerHeight,
    };
  })()`);
  const timing = await evaluate(`new Promise(resolve => {
    const intervals = [];
    const start = performance.now();
    let last = start;
    function frame(now) {
      intervals.push(now - last); last = now;
      if (now - start >= 5000) {
        const values = intervals.slice(1).sort((a,b) => a-b);
        const q = p => values[Math.min(values.length - 1, Math.floor(values.length * p))];
        resolve({
          frames: values.length, seconds: (now - start) / 1000,
          fps: values.length * 1000 / (now - start),
          p50ms: q(0.50), p95ms: q(0.95), p99ms: q(0.99), maxms: values.at(-1),
          long33ms: values.filter(v => v > 33.4).length,
          long50ms: values.filter(v => v > 50).length,
        });
      } else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })`);
  const state = await evaluate('window.__ATOMIC_ACRES_DEBUG__.snapshot()');
  return { label, url, gpu, timing, render: state.render, botCount: state.bots.length, phase: state.matchPhase };
}
try {
  const base = process.env.ATOMIC_BASE || 'https://daveinturkey15-byte.github.io/atomic-acres-browser-arena/';
  const results = [
    await profile(`${base}?render=balanced&perf=desktop-balanced`, 'balanced'),
    await profile(`${base}?render=quality&perf=desktop-quality`, 'quality'),
    await profile(`${base}?render=compat&perf=desktop-compat`, 'compat'),
  ];
  console.log(JSON.stringify(results, null, 2));
  const balanced = results[0];
  if (!String(balanced.gpu.renderer).includes('AMD')) throw new Error(`Expected AMD renderer, got ${balanced.gpu.renderer}`);
  if (balanced.timing.fps < 90) throw new Error(`Responsive profile missed 90 FPS headroom: ${balanced.timing.fps.toFixed(2)}`);
  if (balanced.timing.p95ms > 20) throw new Error(`Responsive p95 exceeded 20ms: ${balanced.timing.p95ms.toFixed(2)}`);
  if (balanced.timing.maxms > 50) throw new Error(`Responsive max frame exceeded 50ms: ${balanced.timing.maxms.toFixed(2)}`);
  if (balanced.render.calls > 120) throw new Error(`Responsive draw calls exceeded 120: ${balanced.render.calls}`);
  if (balanced.render.triangles > 150_000) throw new Error(`Responsive triangles exceeded 150000: ${balanced.render.triangles}`);
} finally {
  ws.close();
}
