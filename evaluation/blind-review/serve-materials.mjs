import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const modelCode = process.argv[2];
const port = Number(process.argv[3] ?? 16401);
if (!/^MODEL-[A-Z]$/.test(modelCode ?? '')) throw new Error('Usage: node serve-materials.mjs MODEL-X [port]');

const root = path.resolve(import.meta.dirname, '..', '..', 'artifacts', 'external-eval', 'blind-review', 'materials', modelCode, 'app');
const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json'], ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2'],
]);

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
    let relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    let target = path.resolve(root, relative);
    if (!target.startsWith(root)) throw new Error('invalid path');
    const info = await stat(target).catch(() => null);
    if (!info?.isFile()) target = path.join(root, 'index.html');
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': contentTypes.get(path.extname(target)) ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(String(error));
  }
});

server.listen(port, '127.0.0.1', () => process.stdout.write(`${modelCode} blind app: http://127.0.0.1:${port}\n`));
