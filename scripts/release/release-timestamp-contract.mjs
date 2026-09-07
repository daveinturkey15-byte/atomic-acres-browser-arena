const ISO_RELEASE_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
const PENDING_RELEASE = 'PENDING_PRODUCTION';
const MONTHS = Object.freeze(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']);

const UK_RELEASE_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

const EXPECTED_PASS = /^PASS \d/u;

/**
 * HF-406: the published badge now LEADS with the pass the build is, then its publication
 * instant - `PASS 84 · 3 AUG 2026 · 17:52 BST`. It used to read `LAST RELEASE · <date>`,
 * which named no pass, so a build could publish under the previous pass's number and this
 * contract would still agree with it (PASS 82 shipped stamped PASS 81; PASS 81 before it).
 * The pass is therefore a REQUIRED argument here: the expected label now pins the version
 * as well as the instant, and a wrong-pass publish fails at the same check as a wrong time.
 */
export function expectedLastReleaseLabel(releasedAt, expectedPass) {
  if (!ISO_RELEASE_TIMESTAMP.test(releasedAt ?? '') || Number.isNaN(Date.parse(releasedAt))) {
    throw new Error(`Expected release timestamp is not strict ISO-8601: ${releasedAt ?? '<missing>'}`);
  }
  if (typeof expectedPass !== 'string' || !EXPECTED_PASS.test(expectedPass.trim())) {
    throw new Error(`Expected release label needs the pass it publishes as, received ${JSON.stringify(expectedPass ?? null)}`);
  }
  const parts = new Map(UK_RELEASE_TIMESTAMP_FORMATTER
    .formatToParts(new Date(releasedAt))
    .map((part) => [part.type, part.value]));
  const month = MONTHS[Number(parts.get('month')) - 1];
  const zone = parts.get('timeZoneName');
  if (!month || !zone) throw new Error(`Unable to format expected release timestamp: ${releasedAt}`);
  return `${expectedPass.trim()} · ${Number(parts.get('day'))} ${month} ${parts.get('year')} · ${parts.get('hour')}:${parts.get('minute')} ${zone}`;
}

export function verifyProductionReleaseTimestamp({
  expectedReleasedAt,
  expectedPass,
  observedReleasedAt,
  observedLabel,
  observedState,
}) {
  const expectedLabel = expectedLastReleaseLabel(expectedReleasedAt, expectedPass);
  if (observedReleasedAt === PENDING_RELEASE || observedLabel?.includes(PENDING_RELEASE)) {
    throw new Error('Production candidate still exposes PENDING_PRODUCTION');
  }
  if (observedReleasedAt !== expectedReleasedAt) {
    throw new Error(`Production release timestamp mismatch: expected ${expectedReleasedAt}, observed ${observedReleasedAt ?? '<missing>'}`);
  }
  if (observedLabel !== expectedLabel) {
    throw new Error(`Production Last Release label mismatch: expected ${expectedLabel}, observed ${observedLabel ?? '<missing>'}`);
  }
  if (observedState !== 'CURRENT LIVE') {
    throw new Error(`Production release state must be CURRENT LIVE, observed ${observedState ?? '<missing>'}`);
  }
  return Object.freeze({ releasedAt: observedReleasedAt, label: observedLabel, state: observedState });
}
