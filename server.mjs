import { createServer as http } from 'node:http';
import { createServer as https } from 'node:https';
import { readFile, readdir } from 'node:fs/promises';
import { X509Certificate } from 'node:crypto';
import { networkInterfaces } from 'node:os';

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
const cert = TLS_CERT && await readFile(TLS_CERT);
const server = cert ? https({ cert, key: await readFile(TLS_KEY) }, handler) : http(handler);
server.listen(Number(PORT), HOST, () => {
  const { port } = server.address();
  if (!cert) {
    const host = HOST.includes(':') ? `[${HOST}]` : HOST;
    console.log(`SonicVision on http://${host}:${port} (use localhost for camera and microphone over HTTP).`);
    return;
  }
  const certificate = new X509Certificate(cert);
  if (HOST !== '0.0.0.0' && HOST !== '::') {
    const host = HOST.includes(':') ? `[${HOST}]` : HOST;
    console.log(`SonicVision on https://${host}:${port}. The client must trust the certificate and it must cover ${HOST}.`);
    return;
  }
  const addresses = [...new Set(Object.values(networkInterfaces()).flat()
    .filter(info => info.family === 'IPv4' && !info.internal).map(info => info.address))];
  const covered = addresses.filter(address => certificate.checkIP(address));
  for (const address of covered) console.log(`SonicVision on https://${address}:${port} (requires certificate trust on the client).`);
  if (!covered.length) {
    console.warn(`HTTPS is listening on port ${port}, but the certificate covers none of these LAN IPv4 addresses: ${addresses.join(', ') || 'none'}.`);
    console.warn('For IP-based access, issue a certificate for the current Wi-Fi address and restart. See README.md.');
  }
});
