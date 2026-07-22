import { build, preview } from 'vite';

const host = process.env.QA_PREVIEW_HOST ?? '127.0.0.1';
const port = Number(process.env.QA_PREVIEW_PORT ?? '4173');

await build();
const server = await preview({
  preview: { host, port, strictPort: true },
});

let closing = false;
async function close(signal) {
  if (closing) return;
  closing = true;
  try {
    // Playwright may terminate while Chromium still owns keep-alive sockets.
    // Close them explicitly so graceful shutdown cannot wait indefinitely.
    server.httpServer.closeAllConnections?.();
    await new Promise((resolveClose, rejectClose) => {
      server.httpServer.close((error) => error ? rejectClose(error) : resolveClose());
    });
    process.exit(0);
  } catch (error) {
    console.error(`Preview shutdown after ${signal} failed:`, error);
    process.exit(1);
  }
}

process.once('SIGINT', () => void close('SIGINT'));
process.once('SIGTERM', () => void close('SIGTERM'));
console.log(`Atomic Acres Playwright preview listening at http://${host}:${port}/`);
await new Promise(() => undefined);
