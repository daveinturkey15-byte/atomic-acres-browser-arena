import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');
const shellSource = readFileSync(new URL('./ui/pass64-shell.ts', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

describe('text chat UI contract', () => {
  it('renders one shared room-chat surface outside the menu and HUD', () => {
    expect(shellSource.match(/id="text-chat"/g)).toHaveLength(1);
    expect(shellSource).toContain('id="text-chat-log" role="log" aria-live="polite"');
    expect(shellSource).toContain('id="text-chat-input"');
    expect(shellSource).toContain('maxlength="${CHAT_TEXT_MAX_CHARS}"');
    expect(styleSource).toContain('#text-chat[data-context=lobby]');
    expect(styleSource).toContain('#text-chat[data-open=true] #text-chat-log');
  });

  it('uses Enter/Escape and suppresses gameplay while the input is open', () => {
    expect(mainSource).toContain("event.key !== 'Enter' || event.repeat || !textChatAvailable()");
    expect(mainSource).toContain("if (event.key === 'Escape')");
    expect(mainSource).toContain("if (document.pointerLockElement === canvas) void document.exitPointerLock();");
    expect(mainSource).toContain("menu.classList.contains('hidden') && !isTextChatTyping()");
    expect(mainSource).toContain("if (isTextChatTyping()) return;\n  if (document.pointerLockElement !== canvas)");
    expect(mainSource).toContain("if (document.pointerLockElement !== canvas || !player.alive || isTextChatTyping()) return;");
  });

  it('renders untrusted names and messages through textContent only', () => {
    expect(mainSource).toContain('sender.textContent = entry.senderName;');
    expect(mainSource).toContain('message.textContent = entry.text;');
    expect(mainSource).not.toContain('textChatLog.innerHTML');
  });
});
