export type SquadColor = string;

// HF-328 (Pass 74 owner requirement): squad identity is prescribed. The
// canonical colour-name pair for the member's team is the ONLY squad identity
// — colour NAMES are the identity; there is no free text and no colour picker.
export const DEFAULT_SQUAD_PRESENTATION = Object.freeze({
  aqua: Object.freeze({ name: 'AQUA', color: '#55e6ff' }),
  coral: Object.freeze({ name: 'CORAL', color: '#ff6b73' }),
});

/**
 * Wire-boundedness validator only (protocol-18 `lobby-squad` / `lobby-join`
 * compatibility). Passing this check does NOT make a value a squad identity:
 * the host stamps the canonical pair regardless (HF-328).
 */
export function isSquadName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9 _-]{0,19}$/.test(value);
}

/** Wire-boundedness validator only; see isSquadName (HF-328). */
export function isSquadColor(value: unknown): value is SquadColor {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function defaultSquadPresentation(team: 0 | 1): Readonly<{ name: string; color: SquadColor }> {
  return team === 0 ? DEFAULT_SQUAD_PRESENTATION.aqua : DEFAULT_SQUAD_PRESENTATION.coral;
}

/**
 * HF-328 host-side validation: client-supplied names and colours (including
 * protocol-18 `lobby-squad` wire values and pre-Pass-74 checkpoint restores)
 * are accepted for compatibility but IGNORED. The canonical colour-name pair
 * for the member's team is always the identity, so pre-match and mid-match
 * squad rendering can never diverge from team authority.
 */
export function sanitizeSquadPresentation(
  _name: unknown,
  _color: unknown,
  team: 0 | 1,
): Readonly<{ name: string; color: SquadColor }> {
  return defaultSquadPresentation(team);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]!));
}

/** Render the prescribed identity for the team; gameplay team remains authoritative. */
export function renderSquadRosterBadge(name: unknown, color: unknown, team: 0 | 1): string {
  const squad = sanitizeSquadPresentation(name, color, team);
  return `<span class="lobby-squad-badge" style="--lobby-squad-color:${squad.color}"><span class="lobby-squad-swatch" aria-hidden="true"></span>${escapeHtml(squad.name)}</span>`;
}
