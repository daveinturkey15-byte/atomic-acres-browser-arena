/** Release metadata is injected once by Vite; reloading never invents a drop time. */
export function buildStampMarkup(): string {
  const number = String(import.meta.env.VITE_BUILD_NUMBER ?? 'DEV').replace(/[^\w.-]/g, '');
  const droppedAt = import.meta.env.VITE_BUILD_DROPPED_AT as string | undefined;
  const date = droppedAt ? new Date(droppedAt) : null;
  const stamp = date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(date)
    : 'Development';
  return `<div class="build-stamp">
    <button type="button" aria-describedby="build-changes"><b>BUILD ${number}</b><time>${stamp}${date ? ' UK' : ''}</time></button>
    <div id="build-changes" role="tooltip"><strong>In this build</strong><ul>
      <li>Readable Skills Lab with three browsing tabs.</li>
      <li>Original source links and clearer unblock steps.</li>
      <li>Blender asset gallery with real model inspection.</li>
    </ul></div>
  </div>`;
}
