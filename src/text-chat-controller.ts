// Text-chat controller — extracted verbatim from src/legacy-main.ts
// (Pass 79 gauntlet streamlining, plan unit "Text chat subsystem").
// Pure protocol rules (history/rate-limit/text normalization) remain in
// './text-chat'; this module owns the live glue: history + rate-limit state,
// DOM rendering and relocation, open/close lifecycle, and host-authoritative
// chat admission/broadcast.
//
// Environment access is injected because everything this subsystem reads
// outside its own state is mutable module state in legacy-main:
//  - `network` is passed as the LIVE ArenaNetwork reference; `role` is a
//    public mutable field, so reads stay fresh.
//  - `player`, `privateLobbySnapshot`, `gameStarted`, `matchFinished` are
//    re-readable module bindings in legacy-main, so they cross the seam as
//    thunks, never as copied values.
import {
  admitChatRate,
  appendChatHistory,
  normalizeChatHistory,
  normalizeChatSenderName,
  normalizeChatText,
  type ChatEntry,
  type ChatRateState,
} from './text-chat';
import { roomChatPresentation } from './room-chat-presentation';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type ChatHistoryMessage,
  type ChatMessage,
  type ChatSubmitMessage,
  type GameMessage,
} from './protocol';

/** Structural view of the shared network; pass the live instance. */
export type TextChatNetwork = {
  role: 'offline' | 'host' | 'client';
  send(message: GameMessage): void;
  sendToPlayer(playerId: string, message: GameMessage): boolean;
};

export type TextChatHostContext = {
  /** Chat surface nodes, resolved once by the host (missing node throws). */
  elements: {
    root: HTMLElement;
    log: HTMLElement;
    hint: HTMLElement;
    input: HTMLInputElement;
  };
  /** Live shared ArenaNetwork instance. */
  network: TextChatNetwork;
  appRoot: HTMLElement;
  hudRoot: HTMLElement;
  localPlayerId(): string;
  /** `privateLobbySnapshot?.hostId ?? null`, read live. */
  hostId(): string | null;
  /** A private lobby snapshot exists right now. */
  hasLobby(): boolean;
  /** The match is running (`gameStarted`), read live. */
  inGame(): boolean;
  /** Safe to hand control back to gameplay after closing chat. */
  shouldResumeControls(): boolean;
  /** The game canvas currently owns the pointer. */
  inPointerLock(): boolean;
  clearGameplayInput(): void;
  resumePointerLock(): void;
  nonce(): number;
  /** Lobby roster lookup for host-side admission. */
  hostMember(id: string): { id: string; name: string; connected: boolean } | undefined;
};

/** Public surface of the controller; field names map onto the legacy-main
 * call sites this extraction replaced one-for-one. */
export interface TextChatController {
  available(): boolean;
  typing(): boolean;
  render(): void;
  markActivity(): void;
  showNotice(message: string, durationMs?: number): void;
  open(): void;
  close(resumeControls: boolean): void;
  reset(): void;
  acceptEntry(entry: ChatEntry): void;
  sendHistory(playerId: string): void;
  admitHostSubmit(message: ChatSubmitMessage): void;
  submit(): void;
  acceptHostMessage(message: ChatMessage): void;
  acceptHostHistory(message: ChatHistoryMessage): void;
  /** Drop per-player host rate-limit/nonce bookkeeping (participant left). */
  forgetPlayer(playerId: string): void;
  /** Exact field contract consumed by `__ATOMIC_ACRES_DEBUG__.snapshot().textChat`. */
  debugSnapshot(): { open: boolean; focused: boolean; entries: ChatEntry[] };
}

function requiredElement<T extends HTMLElement>(selector: string): T {
  const value = document.querySelector<T>(selector);
  if (!value) throw new Error(`Missing element ${selector}`);
  return value;
}

export function createTextChatController(ctx: TextChatHostContext): TextChatController {
  const { root: textChatRoot, log: textChatLog, hint: textChatHint, input: textChatInput } = ctx.elements;

  let textChatHistory: ChatEntry[] = [];
  let localChatRateState: ChatRateState = [];
  const hostChatRateStates = new Map<string, ChatRateState>();
  const hostChatNonces = new Map<string, number[]>();
  let textChatOpen = false;
  let textChatNotice: string | null = null;
  let textChatHintTimer: ReturnType<typeof setTimeout> | undefined;
  let textChatFadeTimer: ReturnType<typeof setTimeout> | undefined;
  let textChatLastActivityAtMs: number | null = null;
  let textChatWasAvailable = false;

  function textChatAvailable(): boolean {
    return ctx.network.role !== 'offline' && ctx.hasLobby();
  }

  function isTextChatTyping(): boolean {
    return textChatOpen;
  }

  function renderTextChat(): void {
    const available = textChatAvailable();
    const now = performance.now();
    const context = ctx.inGame() ? 'game' : 'lobby';
    if (context === 'lobby') {
      const lobby = requiredElement<HTMLElement>('#private-lobby');
      const roster = requiredElement<HTMLElement>('#lobby-roster');
      if (textChatRoot.parentElement !== lobby) roster.after(textChatRoot);
    } else if (textChatRoot.parentElement !== ctx.appRoot) {
      ctx.appRoot.insertBefore(textChatRoot, ctx.hudRoot);
    }
    if (available && !textChatWasAvailable) textChatLastActivityAtMs = now;
    textChatWasAvailable = available;
    const presentation = roomChatPresentation(now, available, textChatOpen, textChatLastActivityAtMs, context === 'lobby');
    textChatRoot.hidden = !available;
    textChatRoot.dataset.open = textChatOpen ? 'true' : 'false';
    textChatRoot.dataset.visible = presentation.visible ? 'true' : 'false';
    textChatRoot.dataset.context = context;
    textChatHint.textContent = textChatNotice ?? (textChatOpen ? 'ENTER SEND / ESC CANCEL' : 'ENTER TO CHAT');
    clearTimeout(textChatFadeTimer);
    textChatFadeTimer = presentation.fadeAfterMs === null ? undefined : setTimeout(() => {
      textChatFadeTimer = undefined;
      renderTextChat();
    }, presentation.fadeAfterMs);
    if (!available) return;

    textChatLog.replaceChildren();
    if (textChatHistory.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'text-chat-empty';
      empty.textContent = 'No messages yet.';
      textChatLog.append(empty);
    } else {
      for (const entry of textChatHistory) {
        const row = document.createElement('p');
        row.className = entry.senderId === ctx.localPlayerId() ? 'text-chat-own' : '';
        const sender = document.createElement('strong');
        const message = document.createElement('span');
        sender.textContent = entry.senderName;
        message.textContent = entry.text;
        row.append(sender, message);
        textChatLog.append(row);
      }
    }
    textChatLog.scrollTop = textChatLog.scrollHeight;
  }

  function markTextChatActivity(): void {
    textChatLastActivityAtMs = performance.now();
    renderTextChat();
  }

  function showTextChatNotice(message: string, durationMs = 1_800): void {
    clearTimeout(textChatHintTimer);
    textChatNotice = message;
    markTextChatActivity();
    textChatHintTimer = setTimeout(() => {
      textChatHintTimer = undefined;
      textChatNotice = null;
      renderTextChat();
    }, durationMs);
  }

  function openTextChat(): void {
    if (!textChatAvailable() || textChatOpen) return;
    ctx.clearGameplayInput();
    requiredElement<HTMLElement>('#roster').hidden = true;
    textChatOpen = true;
    markTextChatActivity();
    if (ctx.inPointerLock()) void document.exitPointerLock();
    textChatInput.focus({ preventScroll: true });
  }

  function closeTextChat(resumeControls: boolean): void {
    if (!textChatOpen) return;
    textChatOpen = false;
    textChatInput.value = '';
    textChatInput.blur();
    markTextChatActivity();
    if (resumeControls && ctx.shouldResumeControls()) {
      ctx.resumePointerLock();
    }
  }

  function resetTextChat(): void {
    clearTimeout(textChatHintTimer);
    clearTimeout(textChatFadeTimer);
    textChatHintTimer = undefined;
    textChatFadeTimer = undefined;
    textChatNotice = null;
    textChatOpen = false;
    textChatLastActivityAtMs = null;
    textChatWasAvailable = false;
    textChatInput.value = '';
    textChatInput.blur();
    textChatHistory = [];
    localChatRateState = [];
    hostChatRateStates.clear();
    hostChatNonces.clear();
    renderTextChat();
  }

  function acceptChatEntry(entry: ChatEntry): void {
    textChatHistory = appendChatHistory(textChatHistory, entry);
    markTextChatActivity();
  }

  function sendTextChatHistory(playerId: string): void {
    if (ctx.network.role !== 'host') return;
    const message: ChatHistoryMessage = {
      type: 'chat-history',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: ctx.localPlayerId(),
      forPlayerId: playerId,
      entries: [...textChatHistory],
      nonce: ctx.nonce(),
    };
    ctx.network.sendToPlayer(playerId, message);
  }

  function admitHostChatSubmit(message: ChatSubmitMessage): void {
    if (ctx.network.role !== 'host') return;
    const member = ctx.hostMember(message.by);
    if (!member?.connected) return;
    const recentNonces = hostChatNonces.get(message.by) ?? [];
    if (recentNonces.includes(message.nonce)) return;

    const now = performance.now();
    const rate = admitChatRate(hostChatRateStates.get(message.by) ?? [], now);
    hostChatRateStates.set(message.by, rate.state);
    if (!rate.accepted) {
      if (message.by === ctx.localPlayerId()) showTextChatNotice('SLOW DOWN');
      return;
    }
    hostChatNonces.set(message.by, [...recentNonces, message.nonce].slice(-64));

    let id = ctx.nonce();
    while (textChatHistory.some((entry) => entry.id === id)) id += 1;
    const entry: ChatEntry = {
      id,
      senderId: member.id,
      senderName: normalizeChatSenderName(member.name),
      text: message.text,
      sentAtHostTimeMs: now,
    };
    acceptChatEntry(entry);
    const accepted: ChatMessage = {
      type: 'chat-message',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: ctx.localPlayerId(),
      entry,
      nonce: id,
    };
    ctx.network.send(accepted);
  }

  function submitTextChat(): void {
    const text = normalizeChatText(textChatInput.value);
    if (!text) {
      closeTextChat(true);
      return;
    }
    const rate = admitChatRate(localChatRateState, performance.now());
    localChatRateState = rate.state;
    if (!rate.accepted) {
      showTextChatNotice('SLOW DOWN');
      textChatInput.select();
      return;
    }
    const message: ChatSubmitMessage = {
      type: 'chat-submit',
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      by: ctx.localPlayerId(),
      text,
      nonce: ctx.nonce(),
    };
    if (ctx.network.role === 'host') admitHostChatSubmit(message);
    else if (ctx.network.role === 'client') ctx.network.send(message);
    closeTextChat(true);
  }

  function acceptHostChatMessage(message: ChatMessage): void {
    if (ctx.network.role !== 'client' || message.by !== ctx.hostId()) return;
    acceptChatEntry(message.entry);
  }

  function acceptHostChatHistory(message: ChatHistoryMessage): void {
    if (ctx.network.role !== 'client' || message.by !== ctx.hostId() || message.forPlayerId !== ctx.localPlayerId()) return;
    textChatHistory = normalizeChatHistory(message.entries);
    markTextChatActivity();
  }

  function debugSnapshot(): { open: boolean; focused: boolean; entries: ChatEntry[] } {
    return {
      open: textChatOpen,
      focused: document.activeElement === textChatInput,
      entries: textChatHistory.map((entry) => ({ ...entry })),
    };
  }

  return {
    available: textChatAvailable,
    typing: isTextChatTyping,
    render: renderTextChat,
    markActivity: markTextChatActivity,
    showNotice: showTextChatNotice,
    open: openTextChat,
    close: closeTextChat,
    reset: resetTextChat,
    acceptEntry: acceptChatEntry,
    sendHistory: sendTextChatHistory,
    admitHostSubmit: admitHostChatSubmit,
    submit: submitTextChat,
    acceptHostMessage: acceptHostChatMessage,
    acceptHostHistory: acceptHostChatHistory,
    forgetPlayer(playerId: string): void {
      hostChatRateStates.delete(playerId);
      hostChatNonces.delete(playerId);
    },
    debugSnapshot,
  };
}
