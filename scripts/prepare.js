// Netlify build step: rewrites public/index.html so every JS/CSS asset gets a
// unique ?v=<sha256> fingerprint. On each deploy the URLs change, so neither
// the browser nor Cloudflare can ever serve a stale frontend copy.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const ASSETS = [
  'css/style.css',
  'js/api.js',
  'js/ui.js',
  'js/auth.js',
  'js/contacts.js',
  'js/app.js',
];

function sha1Short(rel) {
  const data = fs.readFileSync(path.join(PUBLIC_DIR, rel));
  return crypto.createHash('sha256').update(data).digest('hex').slice(0, 10);
}

function prepare() {
  const indexFile = path.join(PUBLIC_DIR, 'index.html');
  let html = fs.readFileSync(indexFile, 'utf8');

  for (const rel of ASSETS) {
    const esc = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const plain = new RegExp('((?:src|href)="' + esc + ')"', 'g');
    const stamped = new RegExp('((?:src|href)="' + esc + ')\\?v=[^"]*"', 'g');

    // Idempotent: first drop any ?v= already injected by a previous run…
    html = html.replace(stamped, '$1"');
    // …then stamp the current fingerprint.
    html = html.replace(plain, '$1?v=' + sha1Short(rel) + '"');
  }

  fs.writeFileSync(indexFile, html);
  // eslint-disable-next-line no-console
  console.log('Fingerprinted assets in public/index.html for this deploy.');
}

if (require.main === module) {
  prepare();
}

module.exports = prepare;