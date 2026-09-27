// Tiny static server for test-pages/. Any hostname works; the e2e suite maps fake domains to it.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../test-pages/', import.meta.url).pathname;
const PORT = Number(process.env.PORT ?? 5174);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/' ) path = '/index.html';
  if (path.startsWith('/spa/')) path = '/spa.html';
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(PORT, () => console.log(`test pages on http://localhost:${PORT}`));
