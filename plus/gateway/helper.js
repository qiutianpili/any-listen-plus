#!/usr/bin/env node
// Any Listen gateway root helper (2026-10-19). The gateway runs as al-gw and calls ONLY this file through sudo
// (/etc/sudoers.d/al-gw). Every verb validates its arguments; nothing here takes a path or a command from the caller.
'use strict';
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const UROOT = '/opt/al-users', ADMIN_DATA = '/opt/any-listen/data', ACC_INSTALL = '/opt/al-accsrc/bin/install.py',
  DAILY = '/opt/al-gateway-root/daily.py', LLM_ENV = '/etc/al-daily.env', SAFE_ID = /^[A-Za-z0-9_]{1,24}$/;
const SKIP_CFG = /^player\.|^list\.|^playDetail|^common\.lastPlay/;
const die = (m, c = 2) => { process.stderr.write(m + '\n'); process.exit(c); };
const run = (cmd, args, o = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, ...o }).toString();
const sysUser = n => 'al-' + n;
const unitOf = id => id === 'admin' ? 'any-listen' : 'any-listen-u@' + id;
function stripClonedAccountSource(extDir) {
  const base = path.join(extDir, 'datas', 'lx-api-source-loader'), cf = path.join(base, 'configuration.json');
  for (const dn0 of ['gdstudio', 'online-metadata', 'lx-api-source-loader']) try { fs.rmSync(path.join(extDir, 'datas', dn0, 'output.log'), { force: true }); } catch (e) {}
  let c; try { c = JSON.parse(fs.readFileSync(cf, 'utf8')); } catch (e) { return; }
  const gone = new Set((c.importedScriptSources || []).filter(x => x && x.fileName === 'account-source.js').map(x => x.id));
  if (!gone.size) return;
  c.importedScriptSources = (c.importedScriptSources || []).filter(x => !gone.has(x.id));
  for (const k of ['sourceOrder', 'enabledScripts']) if (Array.isArray(c[k])) c[k] = c[k].filter(x => !gone.has(x));
  for (const g of gone) if (/^[0-9a-f]{32}$/.test(g)) fs.rmSync(path.join(base, 'storage', 'scripts', g), { force: true });
  fs.writeFileSync(cf, JSON.stringify(c, null, '\t'));
}
function create(name, port, alpw) {
  const d = path.join(UROOT, name, 'data');
  try { run('useradd', ['--system', '--no-create-home', '--home-dir', path.join(UROOT, name), '--shell', '/usr/sbin/nologin', '--user-group', sysUser(name)]); }
  catch (e) { if (!/already exists/.test(String(e.stderr || e.message))) throw e; }
  fs.mkdirSync(path.join(d, 'app'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(d, 'config.cjs'), `module.exports = {\n  port: '${port}',\n  bindIp: '127.0.0.1',\n  'upstreamProxy.enabled': true,\n  'upstreamProxy.header': 'x-real-ip',\n  allowPublicDir: ['/srv/music'],\n  password: '${alpw}'\n}\n`, { mode: 0o600 });
  run('cp', ['-a', path.join(ADMIN_DATA, 'app', 'extension'), path.join(d, 'app', 'extension')]);
  stripClonedAccountSource(path.join(d, 'app', 'extension'));
  try {
    const c = JSON.parse(fs.readFileSync(path.join(ADMIN_DATA, 'app', 'config.json'), 'utf8'));
    const out = {}; for (const k of Object.keys(c)) if (!SKIP_CFG.test(k) || k === 'player.playbackRate') out[k] = c[k];
    out['player.playbackRate'] = 1;
    if (out.setting && typeof out.setting === 'object') out.setting = { ...out.setting, 'player.playbackRate': 1, 'player.volume': 0.5, 'player.volumeMute': false, 'player.preservesPitch': false };
    fs.writeFileSync(path.join(d, 'app', 'config.json'), JSON.stringify(out, null, '\t'));
  } catch (e) { process.stderr.write('config copy ' + e.message + '\n'); }
  run('chown', ['-R', sysUser(name) + ':' + sysUser(name), path.join(UROOT, name)]);
  fs.chmodSync(path.join(UROOT, name), 0o700); fs.chmodSync(d, 0o700);
  run('systemctl', ['enable', '--now', 'any-listen-u@' + name]);
}
function remove(name) {
  try { run('systemctl', ['disable', '--now', 'any-listen-u@' + name]); } catch (e) {}
  fs.rmSync(path.join(UROOT, name), { recursive: true, force: true });
  if (fs.existsSync(ACC_INSTALL)) try { run('python3', [ACC_INSTALL, 'purge', name]); } catch (e) { process.stderr.write('accsrc purge ' + e.message + '\n'); }
  try { run('userdel', [sysUser(name)]); } catch (e) {}
}
function dailyIds(id) {
  const { DatabaseSync } = require('node:sqlite');
  const f = id === 'admin' ? ADMIN_DATA + '/app/anylisten.data.db' : path.join(UROOT, id, 'data/app/anylisten.data.db');
  const db = new DatabaseSync(f, { readOnly: true });
  try { return db.prepare("SELECT id FROM my_list l WHERE name = '每日推荐' AND type = 'general' ORDER BY (SELECT COUNT(*) FROM my_list_music_info m WHERE m.list_id = l.id) DESC, json_extract(meta, '$.createTime')").all().map(r => r.id); }
  finally { db.close(); }
}
// 每日推荐 LLM keys (2026-10-20): admin page -> setllm (JSON on stdin) -> /etc/al-daily.env (root 600). llmstat only
// ever returns the last 4 characters.
function readEnv() { const o = {}; try { for (const ln of fs.readFileSync(LLM_ENV, 'utf8').split('\n')) { const m = ln.match(/^(AL_[A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2]; } } catch (e) {} return o; }
function setLlm() {
  let j; try { j = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { die('bad json'); }
  const o = readEnv(), ok = (v, re) => typeof v === 'string' && re.test(v);
  const KEYS = { AL_LLM_API_KEY: /^[A-Za-z0-9_\-.]{16,200}$/, AL_CLEF_ACCOUNT_ID: /^[0-9a-f]{32}$/, AL_CLEF_API_TOKEN: /^[A-Za-z0-9_\-]{20,200}$/ };
  for (const k of Object.keys(KEYS)) {
    if (j.clear && j.clear.includes(k)) { delete o[k]; continue; }
    if (j[k] == null || j[k] === '') continue;
    if (!ok(j[k], KEYS[k])) die('bad ' + k);
    o[k] = j[k];
  }
  const tmp = LLM_ENV + '.tmp';
  fs.writeFileSync(tmp, Object.entries(o).map(([k, v]) => k + '=' + v).join('\n') + '\n', { mode: 0o600 });
  fs.chmodSync(tmp, 0o600); fs.renameSync(tmp, LLM_ENV);
}
const [verb, id, arg] = process.argv.slice(2);
if (!SAFE_ID.test(id || '')) die('bad id');
try {
  switch (verb) {
    case 'start': case 'stop': run('systemctl', [verb, unitOf(id)]); break;
    case 'create': {
      if (id === 'admin' || !/^\d{4,5}$/.test(arg || '')) die('bad args');
      const alpw = fs.readFileSync(0, 'utf8').trim(); if (!/^[0-9a-f]{24}$/.test(alpw)) die('bad pw');
      create(id, +arg, alpw); break;
    }
    case 'remove': if (id === 'admin') die('bad id'); remove(id); break;
    case 'daily': {
      const r = spawnSync('python3', [DAILY, '--user', id].concat(arg === 'active' ? ['--active'] : arg === 'force' ? ['--force'] : []), { stdio: 'inherit', timeout: 175000 });
      process.exit(r.status == null ? 1 : r.status);
    }
    case 'dailyids': process.stdout.write(JSON.stringify(dailyIds(id))); break;
    case 'setllm': if (id !== 'admin') die('bad id'); setLlm(); break;
    case 'llmstat': { if (id !== 'admin') die('bad id'); const o = readEnv(), l4 = v => v ? v.slice(-4) : null;
      process.stdout.write(JSON.stringify({ llm: l4(o.AL_LLM_API_KEY), clef: !!(o.AL_CLEF_ACCOUNT_ID && o.AL_CLEF_API_TOKEN), clefAcct: o.AL_CLEF_ACCOUNT_ID ? o.AL_CLEF_ACCOUNT_ID.slice(-4) : null })); break; }
    default: die('bad verb');
  }
} catch (e) { die(String(e.stderr || e.message).trim(), 1); }
