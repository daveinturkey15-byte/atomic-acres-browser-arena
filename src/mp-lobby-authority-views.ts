import { arenaSelection, type ArenaSelection } from './map-selection';
import { arenaDaylightProfile } from './rendering/lighting-conditions';
import { hostTimeToGuestMono, type HostTimeMapping } from './host-time';
import { canHostCommitStart, latencyQuality, type LobbySnapshot } from './private-match';
import { DHV_VALUES, dhvLabel } from './handicap';
import { renderSquadRosterBadge, sanitizeSquadPresentation } from './squad-presentation';
import { teamSwapRefusal } from './team-prescription';
import { escapeHtml } from './legacy-pure-helpers';
import type { NetworkRole } from './network';

type LobbyViewState = Readonly<{
  networkRole: NetworkRole;
  privateLobbySnapshot: LobbySnapshot | null;
  gameStarted: boolean;
  playerId: string;
  menu: HTMLElement;
  selectedArena: ArenaSelection;
  arenaSelectionReady: boolean;
  hostTimeMapping: HostTimeMapping;
  localLobbyPingMs: number | null;
  lobbyArenaSyncFailed: boolean;
}>;

export type PrivateLobbyAuthorityViewContext = Readonly<{
  getState: () => LobbyViewState;
  element: <T extends HTMLElement>(selector: string) => T;
  syncArenaSelectionUi: () => void;
  scheduleLobbyCountdownRefresh: () => void;
  trackLobbyArenaSyncDeadline: (synchronized: boolean, targetArenaId: string | null) => void;
  hostHasPendingGuestConnection: () => boolean;
  commitLocalSquadPresentation: () => void;
  getLocalLobbyReady: () => boolean;
  setLocalLobbyReady: (ready: boolean) => void;
  getLastCommittedSquadKey: () => string | null;
  setLastCommittedSquadKey: (key: string) => void;
  setLocalSquadPresentation: (name: string, color: string) => void;
}>;

export function renderPrivateLobbyView(context: PrivateLobbyAuthorityViewContext): void {
  const {
    networkRole,
    privateLobbySnapshot,
    gameStarted,
    playerId,
    menu,
    selectedArena,
    arenaSelectionReady,
    hostTimeMapping,
    localLobbyPingMs,
    lobbyArenaSyncFailed,
  } = context.getState();
  const {
    element,
    syncArenaSelectionUi,
    scheduleLobbyCountdownRefresh,
    trackLobbyArenaSyncDeadline,
    hostHasPendingGuestConnection,
    commitLocalSquadPresentation,
    getLocalLobbyReady,
    setLocalLobbyReady,
    getLastCommittedSquadKey,
    setLastCommittedSquadKey,
    setLocalSquadPresentation,
  } = context;
  const network = { role: networkRole };
  const section = element<HTMLElement>('#private-lobby');
  const lobbyAvailable = network.role !== 'offline' || privateLobbySnapshot !== null;
  const lobbyVisible = !gameStarted && lobbyAvailable;
  menu.classList.toggle('private-lobby-active', lobbyVisible);
  syncArenaSelectionUi();
  if (!lobbyAvailable) {
    section.hidden = true;
    return;
  }
  section.hidden = !lobbyVisible;
  element<HTMLButtonElement>('#solo').disabled = true;
  element<HTMLButtonElement>('#host').disabled = true;
  element<HTMLButtonElement>('#join').disabled = true;
  const snapshot = privateLobbySnapshot;
  // Every visible lobby field is a projection of the last accepted
  // authoritative snapshot. A guest has no legitimate local roster/config
  // fallback while JOIN is in flight; showing one fabricated from local state
  // made READY look actionable even though the host had not admitted it.
  const members = snapshot?.members ?? [];
  const config = snapshot?.config ?? null;
  const connectedCount = members.filter((member) => member.connected).length;
  const capacity = config?.capacity ?? null;
  element<HTMLElement>('#lobby-capacity-label').textContent = `${connectedCount} / ${capacity ?? '—'}`;
  // The hosted 5-4-3-2-1: the phase carries the host's shared epoch, so every
  // client counts the same five seconds from one authoritative instant. Re-render
  // on a short local tick while the phase lasts; it stops itself otherwise.
  const countdownDeadlineMonoMs = snapshot?.phase === 'countdown' && snapshot.activeAtHostTimeMs !== null
    ? network.role === 'client'
      ? hostTimeToGuestMono(hostTimeMapping, snapshot.activeAtHostTimeMs, performance.now(), snapshot.snapshotHostTimeMs)
      : snapshot.activeAtHostTimeMs
    : null;
  const countdownRemainS = countdownDeadlineMonoMs !== null
    ? Math.max(0, Math.ceil((countdownDeadlineMonoMs - performance.now()) / 1000))
    : null;
  element<HTMLElement>('#private-lobby-title').textContent = snapshot?.phase === 'active'
    ? 'MATCH IN PROGRESS'
    : countdownRemainS !== null ? `DEPLOYING IN ${countdownRemainS}` : 'WAITING ROOM';
  if (countdownRemainS !== null) scheduleLobbyCountdownRefresh();
  const hostControls = network.role === 'host' && snapshot?.phase === 'waiting' && config !== null;
  const arenaInput = element<HTMLSelectElement>('#lobby-arena');
  arenaInput.value = config?.arenaId ?? '';
  arenaInput.disabled = !hostControls;
  const modeInput = element<HTMLSelectElement>('#lobby-mode');
  const capacityInput = element<HTMLSelectElement>('#lobby-capacity');
  const botInput = element<HTMLSelectElement>('#lobby-bots');
  const balanceInput = element<HTMLInputElement>('#lobby-auto-balance');
  const dominationOption = modeInput.querySelector<HTMLOptionElement>('option[value="domination"]');
  if (dominationOption) {
    const lobbyArena = config?.arenaId ?? null;
    dominationOption.disabled = lobbyArena !== 'test2';
    dominationOption.textContent = lobbyArena === 'test2' ? 'DOMINATION' : 'DOMINATION (TEST2)';
  }
  modeInput.value = config?.mode ?? '';
  capacityInput.value = capacity === null ? '' : String(capacity);
  botInput.value = config === null ? '' : String(config.hostedBotCount);
  balanceInput.checked = config?.autoBalance ?? false;
  const rangeLobby = config?.arenaId === 'gun-range';
  modeInput.disabled = !hostControls || rangeLobby;
  capacityInput.disabled = !hostControls;
  botInput.disabled = !hostControls || rangeLobby;
  balanceInput.disabled = !hostControls || modeInput.value === 'ffa' || rangeLobby;
  element<HTMLButtonElement>('#lobby-balance').disabled = !hostControls || modeInput.value === 'ffa' || rangeLobby;
  const timeLimitInput = element<HTMLSelectElement>('#lobby-time-limit');
  const killLimitInput = element<HTMLSelectElement>('#lobby-kill-limit');
  timeLimitInput.value = config === null ? '' : String(config.durationMs);
  killLimitInput.value = config?.scoreLimit === null || config === null ? '' : String(config.scoreLimit);
  timeLimitInput.disabled = !hostControls || rangeLobby;
  killLimitInput.disabled = !hostControls || rangeLobby;
  const timeOfDayInput = element<HTMLSelectElement>('#lobby-time-of-day');
  timeOfDayInput.value = config?.timeOfDay ?? '';
  timeOfDayInput.disabled = !hostControls || arenaDaylightProfile(arenaSelection(
    config?.arenaId ?? selectedArena.id,
  ).id).pinned;
  const member = members.find((candidate) => candidate.id === playerId);
  const squadLabel = element<HTMLElement>('#lobby-squad-label');
  const localSquad = member
    ? sanitizeSquadPresentation(member.squadName, member.squadColor, member.team)
    : null;
  squadLabel.textContent = localSquad?.name ?? 'AWAITING AUTHORITY';
  squadLabel.style.setProperty('--lobby-squad-color', localSquad?.color ?? '#6b7478');
  const squadKey = localSquad ? `${localSquad.name}:${localSquad.color}` : null;
  if (localSquad && squadKey !== getLastCommittedSquadKey()) {
    setLastCommittedSquadKey(squadKey!);
    setLocalSquadPresentation(localSquad.name, localSquad.color);
    commitLocalSquadPresentation();
  }
  squadLabel.dataset.connected = member?.connected ? 'true' : 'false';
  const lobbyArenaSynchronized = snapshot !== null
    && arenaSelectionReady && selectedArena.id === snapshot.config.arenaId;
  trackLobbyArenaSyncDeadline(lobbyArenaSynchronized, snapshot?.config.arenaId ?? null);
  setLocalLobbyReady(member?.ready ?? false);
  const ready = element<HTMLButtonElement>('#lobby-ready');
  const localLobbyReady = getLocalLobbyReady();
  ready.textContent = localLobbyReady ? 'READY ✓' : 'READY';
  ready.classList.toggle('primary', localLobbyReady);
  ready.disabled = !member?.connected || snapshot?.phase !== 'waiting' || !lobbyArenaSynchronized;
  const start = element<HTMLButtonElement>('#lobby-start');
  start.hidden = network.role !== 'host';
  const pendingGuest = hostHasPendingGuestConnection();
  start.disabled = network.role !== 'host' || !snapshot || !lobbyArenaSynchronized || !canHostCommitStart(snapshot, pendingGuest);
  const resetLobby = element<HTMLButtonElement>('#lobby-reset');
  resetLobby.disabled = network.role !== 'host';
  resetLobby.title = network.role === 'host'
    ? 'Close this room and create a fresh code; the old room cannot be reclaimed.'
    : 'Only the host can invalidate the room and create a fresh code.';
  const teamInput = element<HTMLSelectElement>('#team');
  teamInput.disabled = snapshot?.phase !== 'waiting' || config?.mode === 'ffa';
  const swapSides = element<HTMLButtonElement>('#lobby-swap-sides');
  const localConnected = member?.connected ?? false;
  const requestedSwapTeam = (member?.team ?? 0) === 0 ? 1 : 0;
  const swapRefusal = localConnected
    ? teamSwapRefusal(members, playerId, requestedSwapTeam, snapshot?.phase ?? 'waiting', config?.mode ?? 'ffa')
    : 'not-connected';
  swapSides.disabled = !localConnected || swapRefusal !== null;
  swapSides.title = swapRefusal === null
    ? 'Request to swap sides — the host accepts only swaps that keep teams within one player.'
    : `Swap unavailable (${swapRefusal}).`;
  const roster = element<HTMLElement>('#lobby-roster');
  const renderedMembers = members.map((rosterMember) => {
    const ping = rosterMember.id === playerId && network.role === 'client' ? localLobbyPingMs : rosterMember.pingMs;
    const quality = latencyQuality(ping);
    const role = rosterMember.id === snapshot?.hostId ? 'HOST' : 'PEER';
    const team = config?.mode === 'ffa' ? 'FFA' : rosterMember.team === 0 ? 'AQUA' : 'CORAL';
    const squad = renderSquadRosterBadge(rosterMember.squadName, rosterMember.squadColor, rosterMember.team);
    const handicapControl = rosterMember.id === playerId && snapshot?.phase === 'waiting'
      ? `<label class="lobby-dhv">DHV<select data-lobby-dhv aria-label="Damage Handicap Value">${DHV_VALUES.map((value) => `<option value="${value}"${rosterMember.dhv === value ? ' selected' : ''}>${value}</option>`).join('')}</select><small>${dhvLabel(rosterMember.dhv)}</small></label>`
      : `<span class="lobby-dhv-badge" title="${dhvLabel(rosterMember.dhv)}">DHV ${rosterMember.dhv}</span>`;
    return `<div class="lobby-player ${rosterMember.connected ? '' : 'disconnected'}"><span><strong>${escapeHtml(rosterMember.name)}</strong><small>${role} · ${team} · ${squad}</small></span><b class="latency-${quality}">${ping === null ? '—' : `${Math.round(ping)} ms`}</b>${handicapControl}<em>${rosterMember.connected ? rosterMember.ready ? 'READY' : 'SETTING UP' : 'REJOINING…'}</em></div>`;
  }).join('');
  const pendingRow = pendingGuest
    ? '<div class="lobby-player disconnected"><span><strong>PLAYER JOINING...</strong></span></div>'
    : '';
  roster.innerHTML = (renderedMembers + pendingRow) || '<div class="lobby-player disconnected"><span><strong>CONNECTING…</strong></span></div>';
  const isFfa = config?.mode === 'ffa';
  element<HTMLElement>('#lobby-guidance').textContent = snapshot === null
    ? 'Waiting for the host to admit this connection…'
    : !lobbyArenaSynchronized
    ? lobbyArenaSyncFailed
      ? `Arena sync failed twice for ${arenaSelection(snapshot!.config.arenaId).displayName}. LEAVE the lobby and rejoin - the room stays open.`
      : `Synchronizing ${arenaSelection(snapshot!.config.arenaId).displayName} before ready-up…`
    : snapshot?.phase === 'active'
    ? 'Match active · disconnected players have a 90 second rejoin slot.'
    : snapshot?.phase === 'countdown'
      ? 'Synchronized deployment countdown started.'
      : network.role === 'host'
        ? isFfa
          ? 'Share the invite, then start when every player is ready.'
          : 'Share the invite, balance teams, then start when everyone is ready.'
        : isFfa
          ? 'Ready up. The host controls match start.'
          : 'Choose your squad and ready up. The host controls match start.';
}
