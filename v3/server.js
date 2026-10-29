'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = 8133;
const SHOTS = path.join(ROOT, 'shots');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8'
};

if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });

function saveShot(req, res, url) {
  const chunks = [];
  let size = 0;
  req.on('data', (c) => {
    size += c.length;
    if (size > 30 * 1024 * 1024) { req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => {
    try {
      const body = Buffer.concat(chunks).toString('utf8');
      const m = body.match(/^data:image\/png;base64,(.+)$/);
      if (!m) { res.writeHead(400); res.end('bad image'); return; }
      const q = new URL(url, 'http://x').searchParams;
      const name = (q.get('name') || 'latest').replace(/[^a-zA-Z0-9_-]/g, '');
      fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(m[1], 'base64'));
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    } catch (e) {
      res.writeHead(500); res.end(String(e.message));
    }
  });
}

http.createServer((req, res) => {
  const url = req.url || '/';
  if (req.method === 'POST' && url.startsWith('/__shot')) {
    saveShot(req, res, url);
    return;
  }
  const clean = decodeURIComponent(url.split('?')[0]);
  const rel = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, '127.0.0.1', () => {
  const link = `http://127.0.0.1:${PORT}/`;
  console.log('孤影峡谷 3D 已启动：' + link);
  if (process.argv.includes('--open')) {
    const { spawn } = require('child_process');
    spawn('cmd', ['/c', 'start', '', link], { detached: true, stdio: 'ignore' }).unref();
  }
});
