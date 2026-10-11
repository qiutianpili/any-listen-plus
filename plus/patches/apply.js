#!/usr/bin/env node
// Apply Any Listen Plus patches to an official Any Listen v0.11.0 server build.
// usage: node apply.js /opt/any-listen        (stop the service first)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = process.argv[2];
if (!root) { console.error('usage: node apply.js <any-listen dir>'); process.exit(1); }
const where = { 'indexBzjGy48v.js': 'public', 'app.js': 'server', 'extension-service.worker.js': 'server' };
const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'v0.11.0.json'), 'utf8'));
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
let bad = 0;
for (const [name, p] of Object.entries(set)) {
  const file = path.join(root, where[name], name);
  const src = fs.readFileSync(file, 'utf8'), h = sha(src);
  if (h === p.sha256_patched) { console.log('already patched:', file); continue; }
  if (h !== p.sha256_original) { console.error('unexpected version, skipped:', file); bad++; continue; }
  let out = '', cur = 0;
  for (const k of p.hunks) {
    const i = src.indexOf(k.find, cur);
    if (i < 0) throw new Error('hunk not found in ' + file);
    out += src.slice(cur, i) + k.replace; cur = i + k.find.length;
  }
  out += src.slice(cur);
  if (sha(out) !== p.sha256_patched) throw new Error('result mismatch for ' + file);
  fs.copyFileSync(file, file + '.orig');
  fs.writeFileSync(file, out);
  console.log('patched:', file, '(backup .orig)');
}
process.exit(bad ? 2 : 0);
