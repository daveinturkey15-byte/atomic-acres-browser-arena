import { setTimeout as delay } from 'node:timers/promises';

export async function boundedStep(task, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function waitOrStop(ms, signal) {
  try { await delay(Math.max(0, ms), undefined, { signal }); return !signal.aborted; }
  catch (error) { if (signal.aborted) return false; throw error; }
}

export function commonAliveLife(players, roles) {
  const first = players?.[roles[0]];
  return Number.isSafeInteger(first?.continuity) && roles.every(role => {
    const p = players?.[role];
    return p?.alive === true && p.hp === 100 && p.continuity === first.continuity;
  });
}

// A prerequisite, not an acceptance exclusion: all timed replication samples
// continue throughout this wait. Never mutate HP/life to manufacture a baseline.
export async function settledLife(read, roles, { timeoutMs = 6000, stableMs = 250, pollMs = 50, accept = commonAliveLife } = {}) {
  const startedAt = Date.now(), observations = [];
  let stableSince = null, life = null, last = null;
  while (Date.now() - startedAt < timeoutMs) {
    last = await boundedStep(read, Math.max(1, timeoutMs - (Date.now() - startedAt)), 'life baseline read');
    const atEpochMs = Date.now();
    const common = accept(last, roles), current = last?.[roles[0]]?.continuity;
    observations.push({ atEpochMs, players: Object.fromEntries(roles.map(role => [role, {
      hp: last?.[role]?.hp ?? null, alive: last?.[role]?.alive ?? null, continuity: last?.[role]?.continuity ?? null,
      supportLife: last?.[role]?.supportLife ?? null, deathCount: last?.[role]?.deathCount ?? null,
    }])) });
    if (!common) { stableSince = null; life = null; }
    else if (stableSince === null || current !== life) { stableSince = atEpochMs; life = current; }
    if (common && stableSince !== null && atEpochMs - stableSince >= stableMs) {
      return { ok: true, before: last, observations, stableMs, timeoutMs };
    }
    await delay(Math.min(pollMs, Math.max(0, timeoutMs - (Date.now() - startedAt))));
  }
  return { ok: false, before: last, observations, stableMs, timeoutMs, reason: 'common settled full-health life not observed' };
}
