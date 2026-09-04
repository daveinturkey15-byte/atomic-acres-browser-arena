import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizePort = (port) => {
  const value = Number(port);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`invalid preview port '${port}'`);
  }
  return value;
};

const registryReady = (state, arena, cameraIds) => {
  const loadedArenaIds = Array.isArray(state?.loadedArenaIds) ? state.loadedArenaIds : [];
  return loadedArenaIds.includes(arena) && cameraIds.every((cameraId) =>
    state?.cameraIdsByArena?.[arena]?.includes(cameraId) ?? false);
};

export async function waitForReviewCameraRegistry(readRegistry, {
  arena,
  cameraIds,
  timeoutMs = 30_000,
  pollMs = 100,
  sleepImpl = sleep,
  nowImpl = Date.now,
} = {}) {
  if (typeof readRegistry !== 'function') throw new TypeError('readRegistry must be a function');
  if (!arena || !Array.isArray(cameraIds) || cameraIds.length === 0) {
    throw new TypeError('arena and cameraIds are required');
  }
  const startedAt = nowImpl();
  const deadline = startedAt + timeoutMs;
  let attempts = 0;
  let state = null;
  while (nowImpl() <= deadline) {
    attempts += 1;
    try {
      state = await readRegistry();
    } catch (error) {
      state = { error: String(error).slice(0, 240) };
    }
    if (registryReady(state, arena, cameraIds)) {
      return Object.freeze({
        arena,
        cameraIds: [...cameraIds],
        attempts,
        waitedMs: Math.max(0, nowImpl() - startedAt),
        state,
      });
    }
    if (nowImpl() >= deadline) break;
    await sleepImpl(Math.min(pollMs, Math.max(0, deadline - nowImpl())));
  }
  throw new Error(`review camera registry for '${arena}' did not populate within ${timeoutMs} ms; `
    + `state=${JSON.stringify(state)}`);
}

export async function findListeningPid(port, {
  platform = process.platform,
  execFileImpl = execFileAsync,
} = {}) {
  const value = normalizePort(port);
  if (platform === 'win32') {
    const command = `$connection = Get-NetTCPConnection -LocalPort ${value} -State Listen `
      + '-ErrorAction SilentlyContinue | Select-Object -First 1; '
      + 'if ($null -ne $connection) { $connection.OwningProcess }; exit 0';
    const result = await execFileImpl('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', command,
    ], { windowsHide: true, encoding: 'utf8' });
    const pid = Number(String(result.stdout ?? '').trim().split(/\s+/u)[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }
  const result = await execFileImpl('lsof', ['-nP', '-t', `-iTCP:${value}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  const pid = Number(String(result.stdout ?? '').trim().split(/\s+/u)[0]);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

export async function waitForPortClosed(port, {
  findListeningPidImpl = findListeningPid,
  timeoutMs = 10_000,
  pollMs = 100,
  sleepImpl = sleep,
  nowImpl = Date.now,
} = {}) {
  const startedAt = nowImpl();
  const deadline = startedAt + timeoutMs;
  let listeningPid = null;
  while (nowImpl() <= deadline) {
    listeningPid = await findListeningPidImpl(port);
    if (listeningPid === null) return { closed: true, waitedMs: nowImpl() - startedAt };
    if (nowImpl() >= deadline) break;
    await sleepImpl(Math.min(pollMs, Math.max(0, deadline - nowImpl())));
  }
  throw new Error(`preview port ${port} remained open through teardown (listening pid ${listeningPid})`);
}

const killListeningPid = async (pid, {
  platform = process.platform,
  execFileImpl = execFileAsync,
  killImpl = process.kill,
} = {}) => {
  if (platform === 'win32') {
    await execFileImpl('taskkill', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true, encoding: 'utf8',
    });
  } else {
    killImpl(pid, 'SIGTERM');
  }
};

export async function stopPreviewServer({
  port,
  child,
  platform = process.platform,
  findListeningPidImpl = findListeningPid,
  execFileImpl = execFileAsync,
  killImpl = process.kill,
  sleepImpl = sleep,
  timeoutMs = 10_000,
  pollMs = 100,
  nowImpl = Date.now,
} = {}) {
  if (!child || child.pid == null) throw new TypeError('tracked preview child is required');
  const listeningPid = await findListeningPidImpl(port, { platform, execFileImpl });
  if (listeningPid !== null) {
    await killListeningPid(listeningPid, { platform, execFileImpl, killImpl });
  }
  // A direct vite child normally owns the listening socket. If a platform
  // leaves the child alive after taskkill/SIGTERM, reap that tracked child too;
  // the port fence below remains the final truth.
  if (listeningPid !== child.pid && !child.killed && typeof child.kill === 'function') {
    child.kill('SIGTERM');
  }
  return waitForPortClosed(port, {
    findListeningPidImpl,
    timeoutMs,
    pollMs,
    sleepImpl,
    nowImpl,
  });
}

export async function startPreviewServer({
  serveDist,
  port,
  cwd = process.cwd(),
  spawnImpl = spawn,
  findListeningPidImpl = findListeningPid,
  fetchImpl = fetch,
  timeoutMs = 60_000,
  pollMs = 100,
  sleepImpl = sleep,
  nowImpl = Date.now,
} = {}) {
  const value = normalizePort(port);
  const existingPid = await findListeningPidImpl(value);
  if (existingPid !== null) throw new Error(`preview port ${value} is already listening (pid ${existingPid})`);
  const viteBin = `${cwd.replace(/[\\/]$/u, '')}/node_modules/vite/bin/vite.js`;
  const child = spawnImpl(process.execPath, [viteBin, 'preview', '--outDir', serveDist,
    '--host', '127.0.0.1', '--port', String(value), '--strictPort'], {
    cwd,
    stdio: 'ignore',
    windowsHide: true,
  });
  const deadline = nowImpl() + timeoutMs;
  let up = false;
  while (nowImpl() <= deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${value}/`);
      up = response.ok;
    } catch { /* keep polling while vite boots */ }
    if (up) break;
    if (nowImpl() >= deadline) break;
    await sleepImpl(Math.min(pollMs, Math.max(0, deadline - nowImpl())));
  }
  if (!up) {
    await stopPreviewServer({ port: value, child, findListeningPidImpl, timeoutMs: 5_000, sleepImpl, nowImpl })
      .catch(() => {});
    throw new Error(`served dist never came up on :${value}`);
  }
  const listeningPid = await findListeningPidImpl(value);
  if (listeningPid === null) {
    await stopPreviewServer({ port: value, child, findListeningPidImpl, timeoutMs: 5_000, sleepImpl, nowImpl })
      .catch(() => {});
    throw new Error(`preview responded but :${value} has no listening pid`);
  }
  return Object.freeze({ child, port: value, listeningPid, url: `http://127.0.0.1:${value}` });
}
