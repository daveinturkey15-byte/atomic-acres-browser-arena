/**
 * PASS 95 — handing the evidence bundle to the person sitting at the keyboard.
 *
 * Split out of the recorder deliberately: the recorder is pure and runs in the
 * unit tests, and this file is the four lines that need a Document and a Blob.
 * Keeping them apart is why `src/netcode-evidence-recorder.test.ts` can assert
 * the bundle's contents without a DOM.
 *
 * The save is a same-document object-URL download with an immediate revoke.
 * There is no upload path here on purpose: the existing
 * `src/match-diagnostics-upload.ts` route is consented, aggregated telemetry;
 * this bundle is a raw trace a friend chooses to send to the owner directly,
 * and it must not acquire a network side effect by accident.
 */

import type { EvidenceBundle } from './netcode-evidence-recorder';
import { evidenceFileName } from './netcode-evidence-recorder';

export type EvidenceSaveResult = Readonly<{ saved: boolean; fileName: string; bytes: number; reason: string }>;

export function serialiseEvidenceBundle(bundle: EvidenceBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function downloadEvidenceBundle(bundle: EvidenceBundle, doc: Document = document): EvidenceSaveResult {
  const fileName = evidenceFileName(bundle);
  const text = serialiseEvidenceBundle(bundle);
  const urlFactory = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL : null;
  if (!urlFactory || typeof Blob === 'undefined') {
    return { saved: false, fileName, bytes: text.length, reason: 'no-blob-support' };
  }
  const href = urlFactory.createObjectURL(new Blob([text], { type: 'application/json' }));
  try {
    const anchor = doc.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    (doc.body ?? doc.documentElement).appendChild(anchor);
    anchor.click();
    anchor.remove();
    return { saved: true, fileName, bytes: text.length, reason: 'saved' };
  } finally {
    if (typeof urlFactory.revokeObjectURL === 'function') urlFactory.revokeObjectURL(href);
  }
}
