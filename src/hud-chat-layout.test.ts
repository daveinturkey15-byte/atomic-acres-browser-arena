import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { HUD_CHAT_COMPACT_HEIGHT_PX, hudChatLayoutForViewport, rectsOverlap } from './hud-chat-layout';

const chatCss = readFileSync(new URL('./ui/pass94-hud-chat.css', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('./legacy-main.ts', import.meta.url), 'utf8');

const viewports = [
  { name: '1080p', width: 1920, height: 1080 },
  { name: '1440p', width: 2560, height: 1440 },
  { name: 'mobile', width: 390, height: 844 },
] as const;

describe('HF-500 in-match chat layout', () => {
  it.each(viewports)('keeps the open chat above ammo, out of the crosshair band and clear of the minimap at $name', (viewport) => {
    const layout = hudChatLayoutForViewport(viewport);
    expect(layout.chat.top + layout.chat.height).toBeLessThanOrEqual(layout.crosshairBand.top);
    expect(layout.chat.top + layout.chat.height).toBeLessThan(layout.ammo.top);
    expect(rectsOverlap(layout.chat, layout.minimap)).toBe(false);
  });

  it('models the compact strip as a single readable header lane', () => {
    const layout = hudChatLayoutForViewport({ width: 1920, height: 1080 });
    expect(layout.chat.width).toBe(360);
    expect(HUD_CHAT_COMPACT_HEIGHT_PX).toBeLessThan(40);
    expect(layout.chat.height).toBeGreaterThan(HUD_CHAT_COMPACT_HEIGHT_PX);
  });

  it('makes an unfocused game panel collapsed and pointer-inert, with explicit Enter opening', () => {
    expect(chatCss).toContain("#text-chat[data-context='game'][data-open='false']");
    expect(chatCss).toContain('pointer-events: none;');
    expect(chatCss).toContain("#text-chat[data-context='game'][data-open='false'] #text-chat-log");
    expect(chatCss).toContain("#text-chat[data-context='game'][data-open='false'] #text-chat-form");
    expect(chatCss).toContain('height: auto;');
    expect(chatCss).toContain('max-height: none;');
    expect(chatCss).toContain('display: none !important;');
    expect(chatCss).toContain("#text-chat[data-context='game'][data-open='true']");
    expect(chatCss).toContain('pointer-events: auto;');
    expect(mainSource).toContain("if (textChatRoot.dataset.context === 'game') return;");
    expect(mainSource).toContain("if (event.key !== 'Enter' || event.repeat || !textChatAvailable()) return;");
  });
});
