// Any Listen song download (2026-10-20). Admin-only for now (gw.js gates the route).
// POST /__gw/dl  (X-AL: 1, JSON {url, name, singer, album, cover, lrc, tlrc})  -> {t}
// GET  /__gw/dl/<t>  -> streams the audio with tags written on the fly (mp3: ID3v2.3, flac: Vorbis comment + PICTURE;
// other containers pass through untouched). Nothing is stored on the server; jobs live in memory for 15 minutes.
'use strict';
const crypto = require('crypto'), dns = require('dns').promises, net = require('net');
const jobs = new Map(), TTL = 15 * 60e3, UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function privIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const s = ip.toLowerCase();
  if (s.startsWith('::ffff:')) return privIp(s.slice(7));
  return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s);
}
async function safeUrl(u) {
  let x; try { x = new URL(u); } catch (e) { return false; }
  if (!/^https?:$/.test(x.protocol) || x.username || x.password) return false;
  const h = x.hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(h)) return !privIp(h);
  try { const a = await dns.lookup(h, { all: true }); return a.length > 0 && a.every(r => !privIp(r.address)); } catch (e) { return false; }
}
// manual redirects so every hop passes the SSRF check
async function get(u, max = 4) {
  for (let i = 0; i <= max; i++) {
    if (!await safeUrl(u)) throw new Error('url not allowed');
    const r = await fetch(u, { redirect: 'manual', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = new URL(r.headers.get('location'), u).href; continue; }
    if (!r.ok) throw new Error('upstream ' + r.status);
    return r;
  }
  throw new Error('too many redirects');
}
async function getBuf(u, limit) {
  const r = await get(u); const b = Buffer.from(await r.arrayBuffer());
  if (b.length > limit) throw new Error('too big'); return b;
}

// ---- lyrics: original + translation on the same timestamp (one line each) ----
const TAG = /^\[(\d+):(\d+(?:[.:]\d+)?)\]/;
const tkey = t => { const m = t.match(TAG); return m ? Math.round((+m[1] * 60 + parseFloat(m[2].replace(':', '.'))) * 100) : null; };
function mergeLrc(lrc, tlrc) {
  lrc = String(lrc || '').replace(/\r/g, ''); if (!tlrc) return lrc;
  const tr = new Map();
  for (const ln of String(tlrc).replace(/\r/g, '').split('\n')) { const k = tkey(ln); const tx = ln.replace(/^(\[[^\]]*\])+/, '').trim(); if (k != null && tx && tx !== '//') tr.set(k, tx); }
  const out = [];
  for (const ln of lrc.split('\n')) {
    out.push(ln); const k = tkey(ln); if (k == null) continue;
    const t = tr.get(k); if (t) out.push(ln.match(/^(\[[^\]]*\])+/)[0] + t);
  }
  return out.join('\n');
}

// ---- tag builders ----
const u16 = s => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(String(s), 'utf16le')]);
function id3Frame(id, data) { const h = Buffer.alloc(10); h.write(id, 0, 'latin1'); h.writeUInt32BE(data.length, 4); return Buffer.concat([h, data]); }
function picMime(b) { return b[0] === 0x89 && b[1] === 0x50 ? 'image/png' : 'image/jpeg'; }
function buildId3(m) {
  const fr = [];
  const txt = (id, v) => { if (v) fr.push(id3Frame(id, Buffer.concat([Buffer.from([1]), u16(v)]))); };
  txt('TIT2', m.name); txt('TPE1', m.singer); txt('TALB', m.album);
  if (m.lyric) fr.push(id3Frame('USLT', Buffer.concat([Buffer.from([1]), Buffer.from('XXX', 'latin1'), u16(''), Buffer.from([0, 0]), u16(m.lyric)])));
  if (m.pic) fr.push(id3Frame('APIC', Buffer.concat([Buffer.from([0]), Buffer.from(picMime(m.pic) + '\0', 'latin1'), Buffer.from([3, 0]), m.pic])));
  const body = Buffer.concat(fr), pad = Buffer.alloc(1024), size = body.length + pad.length;
  const h = Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, (size >> 21) & 0x7f, (size >> 14) & 0x7f, (size >> 7) & 0x7f, size & 0x7f]);
  return Buffer.concat([h, body, pad]);
}
function flacBlock(type, data, last) { const h = Buffer.alloc(4); h[0] = (last ? 0x80 : 0) | type; h.writeUIntBE(data.length, 1, 3); return Buffer.concat([h, data]); }
function vorbis(m) {
  const vendor = Buffer.from('Any Listen'), items = [];
  const add = (k, v) => { if (v) items.push(Buffer.from(k + '=' + v, 'utf8')); };
  add('TITLE', m.name); add('ARTIST', m.singer); add('ALBUM', m.album); add('LYRICS', m.lyric);
  const parts = [Buffer.alloc(4), vendor, Buffer.alloc(4)]; parts[0].writeUInt32LE(vendor.length); parts[2].writeUInt32LE(items.length);
  for (const it of items) { const l = Buffer.alloc(4); l.writeUInt32LE(it.length); parts.push(l, it); }
  return Buffer.concat(parts);
}
function flacPic(pic) {
  const mime = Buffer.from(picMime(pic)), b = Buffer.alloc(32 + mime.length);
  let o = 0; b.writeUInt32BE(3, o); o += 4; b.writeUInt32BE(mime.length, o); o += 4; mime.copy(b, o); o += mime.length;
  b.writeUInt32BE(0, o); o += 4; /* desc */ o += 16; /* w,h,depth,colors = 0 */ b.writeUInt32BE(pic.length, o);
  return Buffer.concat([b, pic]);
}

// ---- streaming ----
function reader(body) {
  const rd = body.getReader(); let buf = Buffer.alloc(0), done = false;
  return {
    async need(n) { while (buf.length < n && !done) { const r = await rd.read(); if (r.done) done = true; else buf = Buffer.concat([buf, Buffer.from(r.value)]); } return buf.length >= n; },
    get buf() { return buf; }, take(n) { const b = buf.subarray(0, n); buf = buf.subarray(n); return b; },
    async *rest() { if (buf.length) { const b = buf; buf = Buffer.alloc(0); yield b; } while (true) { const r = await rd.read(); if (r.done) return; yield Buffer.from(r.value); } },
    cancel() { try { rd.cancel(); } catch (e) {} },
  };
}
const fname = (j, ext) => ((j.singer ? j.singer + ' - ' : '') + (j.name || 'music')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 150).trim() + '.' + ext;

async function stream(req, res, j) {
  const [up, pic] = await Promise.all([get(j.url), j.cover ? getBuf(j.cover, 5e6).catch(() => null) : null]);
  const len = +up.headers.get('content-length') || 0, rd = reader(up.body);
  const meta = { name: j.name, singer: j.singer, album: j.album, lyric: j.lyric, pic };
  let head = Buffer.alloc(0), skip = 0, ext = 'mp3';
  await rd.need(12); const b = rd.buf;
  if (b.subarray(0, 3).toString('latin1') === 'ID3') {
    const sz = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    skip = 10 + sz + (b[5] & 0x10 ? 10 : 0); await rd.need(skip); rd.take(skip); head = buildId3(meta);
  } else if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0) {
    head = buildId3(meta);
  } else if (b.subarray(0, 4).toString('latin1') === 'fLaC') {
    ext = 'flac'; let o = 4; const keep = [];
    for (;;) {
      if (!await rd.need(o + 4)) throw new Error('bad flac');
      const bb = rd.buf, last = bb[o] & 0x80, type = bb[o] & 0x7f, l = bb.readUIntBE(o + 1, 3);
      if (!await rd.need(o + 4 + l)) throw new Error('bad flac');
      if (type !== 4 && type !== 6 && type !== 1) keep.push({ type, data: Buffer.from(rd.buf.subarray(o + 4, o + 4 + l)) });
      o += 4 + l; if (last) break;
    }
    skip = o; rd.take(o);
    const blocks = keep.map(k => [k.type, k.data]); blocks.push([4, vorbis(meta)]); if (pic) blocks.push([6, flacPic(pic)]);
    blocks.push([1, Buffer.alloc(1024)]);
    head = Buffer.concat([Buffer.from('fLaC'), ...blocks.map((x, i) => flacBlock(x[0], x[1], i === blocks.length - 1))]);
  } else if (b.subarray(4, 8).toString('latin1') === 'ftyp') ext = 'm4a';
  else if (b.subarray(0, 4).toString('latin1') === 'OggS') ext = 'ogg';
  else if (!/^audio\/|octet-stream/i.test(up.headers.get('content-type') || '')) { rd.cancel(); throw new Error('not audio'); }
  else ext = 'bin';
  const hd = { 'Content-Type': ext === 'flac' ? 'audio/flac' : ext === 'm4a' ? 'audio/mp4' : ext === 'ogg' ? 'audio/ogg' : 'audio/mpeg',
    'Content-Disposition': `attachment; filename="${encodeURIComponent(fname(j, ext))}"; filename*=UTF-8''${encodeURIComponent(fname(j, ext))}`,
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (len) hd['Content-Length'] = len - skip + head.length;
  res.writeHead(200, hd);
  if (req.method === 'HEAD') { rd.cancel(); return res.end(); }
  if (head.length) res.write(head);
  let gone = false; res.on('close', () => { gone = true; });
  for await (const c of rd.rest()) {
    if (gone) { rd.cancel(); return; }
    if (!res.write(c)) await new Promise(ok => { res.once('drain', ok); res.once('close', ok); });
  }
  res.end();
}

function readJson(req, max = 512e3) {
  return new Promise((ok, no) => { let n = 0; const a = []; req.on('data', c => { n += c.length; if (n > max) { no(new Error('too big')); req.destroy(); } else a.push(c); }); req.on('end', () => { try { ok(JSON.parse(Buffer.concat(a).toString('utf8'))); } catch (e) { no(e); } }); req.on('error', no); });
}
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

async function handle(req, res, url, me, send) {
  const now = Date.now(); for (const [k, v] of jobs) if (v.exp < now) jobs.delete(k);
  const J = (c, o) => send(res, c, JSON.stringify(o), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (url.pathname === '/__gw/dl' && req.method === 'POST') {
    if (req.headers['x-al'] !== '1') return J(403, { ok: false });
    let b; try { b = await readJson(req); } catch (e) { return J(400, { ok: false, err: '请求无效' }); }
    if (!await safeUrl(str(b.url, 4000))) return J(400, { ok: false, err: '下载地址无效' });
    if (b.cover && !await safeUrl(str(b.cover, 2000))) b.cover = '';
    if ([...jobs.values()].filter(x => x.user === me.name).length > 200) return J(429, { ok: false, err: '任务太多，稍后再试' });
    const t = crypto.randomBytes(16).toString('hex');
    const lyric = b.lrc ? mergeLrc(str(b.lrc, 200e3), b.tlrc ? str(b.tlrc, 200e3) : '') : '';
    jobs.set(t, { user: me.name, exp: now + TTL, url: str(b.url, 4000), name: str(b.name, 200), singer: str(b.singer, 200), album: str(b.album, 200), cover: str(b.cover, 2000), lyric });
    return J(200, { ok: true, t });
  }
  const m = url.pathname.match(/^\/__gw\/dl\/([0-9a-f]{32})$/);
  if (m && (req.method === 'GET' || req.method === 'HEAD')) {
    const j = jobs.get(m[1]);
    if (!j || j.user !== me.name) return send(res, 404, '下载链接已过期，请重新下载', { 'Content-Type': 'text/plain; charset=utf-8' });
    try { await stream(req, res, j); }
    catch (e) { console.error('dl', me.name, e.message); if (!res.headersSent) send(res, 502, '下载失败：' + e.message, { 'Content-Type': 'text/plain; charset=utf-8' }); else res.destroy(); }
    return;
  }
  return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
}
module.exports = { handle, mergeLrc, buildId3 };
