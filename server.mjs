import { createServer as http } from 'node:http';
import { createServer as https } from 'node:https';
import { readFile, readdir } from 'node:fs/promises';

const site = new URL('./docs/', import.meta.url);
const types = { html: 'text/html', js: 'text/javascript', css: 'text/css', wasm: 'application/wasm' };
const assets = new Map();
for (const name of await readdir(site, { recursive: true })) {
  const type = types[name.split('.').at(-1)];
  if (type) assets.set('/' + name, { type, body: await readFile(new URL(name, site)) });
}
const { TLS_CERT, TLS_KEY, PORT = '8080', HOST = TLS_CERT ? '0.0.0.0' : 'localhost' } = process.env;
if (Boolean(TLS_CERT) !== Boolean(TLS_KEY)) throw new Error('Set TLS_CERT and TLS_KEY together.');
const handler = (req, res) => {
  const path = req.url.split('?')[0];
  const asset = assets.get(path === '/' ? '/index.html' : path);
  if (!['GET', 'HEAD'].includes(req.method) || !asset) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': asset.type, 'X-Content-Type-Options': 'nosniff' });
  res.end(req.method === 'GET' ? asset.body : undefined);
};
const server = TLS_CERT
  ? https({ cert: await readFile(TLS_CERT), key: await readFile(TLS_KEY) }, handler)
  : http(handler);
server.listen(Number(PORT), HOST, () => console.log(`SonicVision on ${TLS_CERT ? 'https' : 'http'}://${HOST}:${PORT}`));
