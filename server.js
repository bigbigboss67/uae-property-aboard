const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mp4': 'video/mp4'
};

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (reqUrl.pathname === '/api/broadcast') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8');
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch {
      req.body = {};
    }
    const resAdapter = {
      status(code) { res.statusCode = code; return this; },
      json(obj) {
        if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(obj));
      }
    };
    try {
      const { pathToFileURL } = require('url');
      const mod = await import(pathToFileURL(path.join(__dirname, 'api', 'broadcast.js')).href);
      const handler = mod.default || mod;
      await handler(req, resAdapter);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
    return;
  }
  if (reqUrl.pathname === '/api/agents' || reqUrl.pathname === '/api/dld-developer') {
    try {
      const upstream = await fetch(`https://www.ai-home.world${reqUrl.pathname}${reqUrl.search}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'AI-Home-Global-Portal/1.0' }
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(text);
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  const relPath = reqUrl.pathname === '/' ? 'index.html' : reqUrl.pathname.replace(/^\/+/, '');
  const filePath = path.join(__dirname, relPath);
  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server listening on http://127.0.0.1:${PORT}`);
});
