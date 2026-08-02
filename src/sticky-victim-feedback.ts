import type { HitMessage } from './protocol';
import type { StickyAttachmentSource } from './remote-sticky-attachment-authority';

export type StickyVictimFeedback = Readonly<{
  label: 'STUCK';
  source: StickyAttachmentSource;
  targetId: string;
  targetLifeId: number;
  actionNonce: number;
  resultNonce: number;
}>;

/**
 * Project victim UI only from the host's already-admitted canonical result.
 * Callers must run nonce admission first so transport duplicates remain silent.
 */
export function projectStickyVictimFeedback(
  message: Pick<HitMessage, 'target' | 'kind' | 'explosiveSource' | 'stuck' | 'hostAuthority' | 'actionNonce' | 'nonce'>,
  expectedTargetId: string,
  expectedTargetLifeId: number,
): StickyVictimFeedback | null {
  if (message.target !== expectedTargetId
    || message.kind !== 'explosive'
    || message.stuck !== true
    || message.explosiveSource !== 'grenade' && message.explosiveSource !== 'explosive-crossbow') return null;
  const authority = message.hostAuthority;
  const attachment = authority?.stickyAttachment;
  if (!authority || !attachment
    || authority.targetLifeId !== expectedTargetLifeId
    || attachment.targetId !== expectedTargetId
    || attachment.targetLifeId !== expectedTargetLifeId) return null;
  return Object.freeze({
    label: 'STUCK',
    source: message.explosiveSource === 'grenade' ? 'semtex' : 'explosive-crossbow',
    targetId: expectedTargetId,
    targetLifeId: expectedTargetLifeId,
    actionNonce: message.actionNonce,
    resultNonce: message.nonce,
  });
}
