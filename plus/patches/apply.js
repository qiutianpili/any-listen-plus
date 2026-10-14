#!/usr/bin/env node
// Apply Any Listen Plus patches to an official Any Listen v0.11.0 server build.
// usage: node apply.js /opt/any-listen        (stop the service first)
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = process.argv[2];
if (!root) { console.error('usage: node apply.js <any-listen dir>'); process.exit(1); }
const where = { 'indexBzjGy48v.js': 'public', 'app.js': 'server', 'extension-service.worker.js': 'server',
  // music-source loader extension (install it from the app first): hedged source race + parallel source init
  'lx-api-source-loader_0.1.7/main.js': 'data/app/extension/ext' };
const set = JSON.parse(fs.readFileSync(path.join(__dirname, 'v0.11.0.json'), 'utf8'));
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
let bad = 0;
for (const [name, p] of Object.entries(set)) {
  const file = path.join(root, where[name], name);
  if (!fs.existsSync(file)) { console.error('not found, skipped:', file); bad++; continue; }
  let src = fs.readFileSync(file, 'utf8'), h = sha(src), upgrade = false;
  if (h === p.sha256_patched) { console.log('already patched:', file); continue; }
  if (h !== p.sha256_original && (p.sha256_previous || []).includes(h)) {
    // patched by an older Plus release: re-patch from the .orig backup that run left behind
    const o = fs.existsSync(file + '.orig') ? fs.readFileSync(file + '.orig', 'utf8') : '';
    if (sha(o) !== p.sha256_original) { console.error('older Plus patch found but no matching .orig backup, skipped:', file); bad++; continue; }
    src = o; h = sha(src); upgrade = true;
  }
  if (h !== p.sha256_original) { console.error('unexpected version, skipped:', file); bad++; continue; }
  let out = '', cur = 0;
  for (const k of p.hunks) {
    const i = src.indexOf(k.find, cur);
    if (i < 0) throw new Error('hunk not found in ' + file);
    out += src.slice(cur, i) + k.replace; cur = i + k.find.length;
  }
  out += src.slice(cur);
  if (sha(out) !== p.sha256_patched) throw new Error('result mismatch for ' + file);
  if (!upgrade) fs.copyFileSync(file, file + '.orig');
  fs.writeFileSync(file, out);
  console.log(upgrade ? 'upgraded patch:' : 'patched:', file, '(backup .orig)');
}
process.exit(bad ? 2 : 0);
