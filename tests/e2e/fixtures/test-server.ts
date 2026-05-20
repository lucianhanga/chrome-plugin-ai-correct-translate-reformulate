// tests/e2e/fixtures/test-server.ts
// Minimal Node.js HTTP static file server for E2E test pages.
//
// The server is started once in global-setup and torn down in global-teardown.
// It serves files from tests/e2e/fixtures/ so that test-page.html is reachable
// at http://localhost:<port>/test-page.html.
//
// Chrome MV3 extensions cannot inject content scripts into file:// URLs without
// <all_urls> host permission. Serving over HTTP and granting 'http://localhost/*'
// in the test-build manifest (dist-test/) is the least-privilege solution.

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { resolve, extname } from 'path';
import { readFileSync } from 'fs';
import { AddressInfo } from 'net';

const FIXTURES_DIR = resolve(process.cwd(), 'tests', 'e2e', 'fixtures');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function handler(req: IncomingMessage, res: ServerResponse): void {
  // Only serve GET requests.
  if (req.method !== 'GET') {
    res.writeHead(405);
    res.end('Method Not Allowed');
    return;
  }

  // Strip query string and anchor.
  const urlPath = (req.url ?? '/').split('?')[0]?.split('#')[0] ?? '/';
  // Default to test-page.html for bare "/" requests.
  const filePath = urlPath === '/' ? '/test-page.html' : urlPath;

  // Resolve to an absolute path within fixtures dir (prevent path traversal).
  const absPath = resolve(FIXTURES_DIR, '.' + filePath);
  if (!absPath.startsWith(FIXTURES_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let content: Buffer;
  try {
    content = readFileSync(absPath);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }

  const mime = MIME_TYPES[extname(absPath)] ?? 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': mime });
  res.end(content);
}

export interface TestServer {
  port: number;
  close: () => Promise<void>;
}

export function startTestServer(): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);

    server.on('error', reject);

    // Bind to a random free port on loopback.
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      const port = addr.port;
      console.log(`[test-server] Serving ${FIXTURES_DIR} at http://localhost:${port}/`);

      const close = (): Promise<void> =>
        new Promise((res, rej) => {
          server.close((err) => {
            if (err) {
              rej(err);
            } else {
              console.log('[test-server] Server closed.');
              res();
            }
          });
        });

      resolve({ port, close });
    });
  });
}
