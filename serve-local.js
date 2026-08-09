/* Local development server.
 * Run:  node serve-local.js
 * Serves static files from public/ and the Express API at /api/*.
 */
const path = require('path');
const fs = require('fs');
const http = require('http');
const { app } = require('./netlify/functions/api');
const fingerprint = require('./scripts/prepare');

// Keep local assets fingerprinted exactly like a Netlify build would.
fingerprint();

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Local mirror of Netlify: forward both public API paths to Express.
// Netlify invokes the function with a full prefixed path; the Express app in
// netlify/functions/api.js normalizes the prefix itself, so here we forward
// the request VERBATIM (no manual strip) — exactly like the deployed behavior.
const server = http.createServer((req, res) => {
  const isApi = req.url.startsWith('/api') || req.url.startsWith('/.netlify/functions/api');
  if (isApi) {
    return app(req, res);
  }
  let pathname = decodeURIComponent(req.url.split('?')[0] || '/');
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not found');
      }
      res.writeHead(500);
      return res.end('Server error');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Contact Manager running at http://localhost:${PORT}`);
});