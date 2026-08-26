// A pass-through proxy in front of the dev server whose only job is to stop the
// page reloading itself mid-measurement.
//
// WHY THIS EXISTS: the dev server hot-reloads. When another agent saves a file
// under src/, Vite broadcasts a full-reload and every open page throws away
// whatever it was doing. For a normal browser session that is the feature; for
// a QA lane that is thirty seconds into a frame-rate sample, or three minutes
// into a host-migration loss window, it silently destroys the run and the
// failure looks like a product fault. Playwright-driven pages can be protected
// with context.route(), but an INSTALLED browser cannot be reached that way at
// all - which is exactly the population the cross-browser row exists to cover.
//
// So the interception moves to the only place that reaches every browser: the
// wire. Everything is proxied byte-for-byte except Vite's own HMR client, whose
// three `location.reload()` calls are replaced with a console warning. HMR is
// otherwise untouched - modules and CSS still update - and nothing about the
// application under test is modified. The page still knows it was asked to
// reload, and still says so in the console, so a reload that would have
// happened is visible rather than hidden.
//
// Loopback only, in both directions: it forwards to 127.0.0.1 and binds to
// 127.0.0.1, so it can never become a way out of this machine.
import { createServer, request as httpRequest } from 'node:http';
import { connect } from 'node:net';

const RELOAD_CALL = 'location.reload()';
const RELOAD_REPLACEMENT = 'console.warn("[qa] dev-server full-reload suppressed for this QA lane")';

/**
 * @param {{ target: URL, port?: number }} options target dev server, and the
 *   port to bind (0 picks a free one).
 * @returns {Promise<{ origin: string, close: () => Promise<void>, suppressedReloads: () => number }>}
 */
export async function startStableDevProxy({ target, port = 0 }) {
  if (target.hostname !== '127.0.0.1' && target.hostname !== 'localhost') {
    throw new Error(`stable dev proxy refuses a non-loopback target: ${target.href}`);
  }
  let suppressed = 0;

  const server = createServer((clientRequest, clientResponse) => {
    const isViteClient = (clientRequest.url ?? '').startsWith('/@vite/client');
    const upstream = httpRequest({
      host: target.hostname,
      port: Number(target.port || 80),
      method: clientRequest.method,
      path: clientRequest.url,
      // identity so the body is rewritable without a decompression step; the
      // dev server is local, so nothing is lost by it.
      headers: { ...clientRequest.headers, host: target.host, 'accept-encoding': 'identity' },
    }, (upstreamResponse) => {
      if (!isViteClient) {
        clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(clientResponse);
        return;
      }
      const chunks = [];
      upstreamResponse.on('data', (chunk) => chunks.push(chunk));
      upstreamResponse.on('end', () => {
        const source = Buffer.concat(chunks).toString('utf8');
        const patched = source.split(RELOAD_CALL).join(RELOAD_REPLACEMENT);
        if (patched !== source) suppressed += 1;
        const headers = { ...upstreamResponse.headers };
        delete headers['content-length'];
        clientResponse.writeHead(upstreamResponse.statusCode ?? 502, {
          ...headers,
          'content-length': Buffer.byteLength(patched),
        });
        clientResponse.end(patched);
      });
    });
    upstream.on('error', () => {
      if (!clientResponse.headersSent) clientResponse.writeHead(502);
      clientResponse.end('dev server unreachable');
    });
    clientRequest.pipe(upstream);
  });

  // The HMR socket is forwarded untouched. Dropping it instead would make the
  // client believe the server died, and its recovery path is - of course - a
  // reload.
  server.on('upgrade', (clientRequest, clientSocket, head) => {
    const upstreamSocket = connect(Number(target.port || 80), target.hostname, () => {
      const headerLines = Object.entries(clientRequest.headers)
        .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(', ') : value}`);
      upstreamSocket.write(`${clientRequest.method} ${clientRequest.url} HTTP/1.1\r\n${headerLines.join('\r\n')}\r\n\r\n`);
      if (head?.length) upstreamSocket.write(head);
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
    const drop = () => { try { upstreamSocket.destroy(); } catch { /* gone */ } try { clientSocket.destroy(); } catch { /* gone */ } };
    upstreamSocket.on('error', drop);
    clientSocket.on('error', drop);
  });

  await new Promise((ready) => server.listen(port, '127.0.0.1', ready));
  const bound = server.address();
  return {
    origin: `http://127.0.0.1:${bound.port}`,
    suppressedReloads: () => suppressed,
    close: () => new Promise((closed) => server.close(closed)),
  };
}
