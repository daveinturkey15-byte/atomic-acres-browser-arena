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

export function expectedLastReleaseLabel(releasedAt) {
  if (!ISO_RELEASE_TIMESTAMP.test(releasedAt ?? '') || Number.isNaN(Date.parse(releasedAt))) {
    throw new Error(`Expected release timestamp is not strict ISO-8601: ${releasedAt ?? '<missing>'}`);
  }
  const parts = new Map(UK_RELEASE_TIMESTAMP_FORMATTER
    .formatToParts(new Date(releasedAt))
    .map((part) => [part.type, part.value]));
  const month = MONTHS[Number(parts.get('month')) - 1];
  const zone = parts.get('timeZoneName');
  if (!month || !zone) throw new Error(`Unable to format expected release timestamp: ${releasedAt}`);
  return `LAST RELEASE · ${Number(parts.get('day'))} ${month} ${parts.get('year')} · ${parts.get('hour')}:${parts.get('minute')} ${zone}`;
}

export function verifyProductionReleaseTimestamp({
  expectedReleasedAt,
  observedReleasedAt,
  observedLabel,
  observedState,
}) {
  const expectedLabel = expectedLastReleaseLabel(expectedReleasedAt);
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
