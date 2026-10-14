'use strict';
/*
 * al-accsrc — account-based music sources for Any Listen (网易云 / QQ音乐 / 酷狗).
 *
 * One Node process, bound to 127.0.0.1 only:
 *   - NeteaseCloudMusicApi Enhanced + KuGouMusicApi are called in-process as modules.
 *   - qq-music-api (Koa) is required in-process and forced onto 127.0.0.1:QQ_PORT.
 *   - Public routes under /al-login/ (proxied by nginx behind Cloudflare Access): login page + API.
 *     The caller's identity is resolved by asking the Any Listen gateway (which verifies the CF Access JWT).
 *   - Internal route /int/url (NOT proxied by nginx): used by the LX source script inside each user's AL
 *     instance; the script carries a per-user random token, so user A's script can never use user B's logins.
 *
 * Per-user storage: STATE_DIR/users/<name>/{wy,kg,tx}.json (0600). Nothing secret is ever logged.
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const BASE = process.env.ACC_BASE || '/opt/al-accsrc';
const STATE = process.env.ACC_STATE || path.join(BASE, 'state');
const PORT = +process.env.ACC_PORT || 9410;
const QQ_PORT = +process.env.QQ_PORT || 9411;
const GW = process.env.ACC_GATEWAY || 'http://127.0.0.1:9400';
const ADMIN = process.env.ACC_ADMIN_USER || 'admin';
const HOST = '127.0.0.1';
const CFG_F = path.join(STATE, 'config.json');
fs.mkdirSync(path.join(STATE, 'users'), { recursive: true, mode: 0o700 });

// ---------- tiny persistence helpers ----------
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const writeJ = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(o), { mode: 0o600 }); fs.renameSync(t, f); };
// config: { users: { <name>: { token, enabled, shareFromAdmin } } }
let cfg = readJ(CFG_F, { users: {} }), cfgM = 0;
const saveCfg = () => { writeJ(CFG_F, cfg); try { cfgM = fs.statSync(CFG_F).mtimeMs; } catch (e) {} };
const reloadCfg = () => { try { const m = fs.statSync(CFG_F).mtimeMs; if (m !== cfgM) { cfg = readJ(CFG_F, cfg); cfgM = m; } } catch (e) {} };
const userCfg = (name) => {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(name)) throw new Error('bad user');
  if (!cfg.users[name]) { cfg.users[name] = { token: crypto.randomBytes(24).toString('hex'), enabled: true, shareFromAdmin: false }; saveCfg(); }
  return cfg.users[name];
};
const acctF = (user, p) => path.join(STATE, 'users', user, p + '.json');
const getAcct = (user, p) => readJ(acctF(user, p), null);
const setAcct = (user, p, o) => o ? writeJ(acctF(user, p), o) : fs.rmSync(acctF(user, p), { force: true });

// ---------- NetEase (in-process) ----------
process.env.ENABLE_GENERAL_UNBLOCK = 'false';
const NCM = '@neteasecloudmusicapienhanced/api';
const ncm = require(NCM);
let ncmReady = require(`${NCM}/generateConfig`)().catch(() => {});
const cookieMapFromSetCookie = (arr) => { const m = {}; for (const c of arr || []) { const f = String(c).split(';', 1)[0]; const i = f.indexOf('='); if (i > 0) m[f.slice(0, i).trim()] = f.slice(i + 1).trim(); } return m; };
const wy = {
  async qr() { await ncmReady; const k = await ncm.login_qr_key({ timestamp: Date.now() }); const key = k.body?.data?.unikey; if (!key) throw new Error('no key'); const c = await ncm.login_qr_create({ key, qrimg: true }); return { key, img: c.body?.data?.qrimg, link: c.body?.data?.qrurl }; },
  async check(user, key) {
    await ncmReady;
    let r; try { r = await ncm.login_qr_check({ key, timestamp: Date.now() }); } catch (e) { r = e; }
    const code = Number(r?.body?.code);
    if (code === 801) return { state: 'waiting' };
    if (code === 802) return { state: 'scanned', nick: r.body?.nickname };
    if (code === 800) return { state: 'expired' };
    if (code === 803) {
      const cookie = cookieMapFromSetCookie(r.cookie);
      if (!cookie.MUSIC_U) return { state: 'error', message: '未取得登录凭据' };
      const info = await wy.profile(cookie);
      setAcct(user, 'wy', { cookie, nick: info.nick, vip: info.vip, at: Date.now() });
      return { state: 'confirmed', nick: info.nick };
    }
    return { state: 'error', message: `code ${isNaN(code) ? '?' : code}` };
  },
  async profile(cookie) {
    try { const r = await ncm.login_status({ cookie, timestamp: Date.now() }); const p = r.body?.data?.profile || r.body?.profile; const a = r.body?.data?.account || r.body?.account; return { nick: p?.nickname || '', vip: Number(a?.vipType || 0) > 0, ok: !!p }; } catch (e) { return { nick: '', ok: false }; }
  },
  LEVELS: { '128k': 'standard', '320k': 'exhigh', flac: 'lossless', flac24bit: 'hires' },
  async url(acct, info, q) {
    await ncmReady;
    const order = ['flac24bit', 'flac', '320k', '128k']; const start = Math.max(0, order.indexOf(q));
    let lastErr = 'no url';
    for (const qq of order.slice(start)) {
      const r = await ncm.song_url_v1({ id: info.id, level: wy.LEVELS[qq], cookie: acct.cookie, randomCNIP: true, timestamp: Date.now() }).catch(e => e);
      const d = r?.body?.data?.[0];
      if (d?.url && !d.freeTrialInfo) return { url: d.url, quality: qq, br: d.br };
      if (d?.freeTrialInfo) lastErr = 'trial only (account not entitled)';
      else lastErr = `code ${r?.body?.code ?? '?'}`;
      if (d && !d.url) break; // no url at all: lower levels won't help
    }
    throw new Error(lastErr);
  },
};

// ---------- KuGou (in-process, lite/概念版 like Folia) ----------
process.env.platform = 'lite';
const kgApi = require('kugoumusicapi');
const newKgDevice = () => { const guid = crypto.randomUUID().replace(/-/g, '').toUpperCase(); const dg = crypto.createHash('md5').update(guid).digest('hex'); return { KUGOU_API_PLATFORM: 'lite', KUGOU_API_GUID: guid, KUGOU_API_MID: BigInt('0x' + dg).toString(10), KUGOU_API_DEV: crypto.randomBytes(5).toString('hex').toUpperCase(), KUGOU_API_MAC: Array.from(crypto.randomBytes(6)).map(v => v.toString(16).padStart(2, '0')).join(':').toUpperCase(), KUGOU_API_WEBGL: BigInt('0x' + crypto.randomBytes(8).toString('hex')).toString(10) }; };
const kgDevices = {}; // per user, pre-login device identity (persisted with the account after login)
const kgNeedsVerify = (b) => Number(b?.errcode ?? b?.error_code) === 20028 || String(b?.error ?? b?.error_msg ?? b?.msg ?? '').includes('本次请求需要验证');
const kgCall = async (name, params, cookies) => {
  const r = await kgApi[name]({ ...params, ...(cookies.userid ? { userid: cookies.userid, uid: cookies.userid } : {}), ...(cookies.token ? { token: cookies.token } : {}), cookie: { ...cookies } }).catch(e => e);
  for (const [k, v] of Object.entries(cookieMapFromSetCookie(Array.isArray(r?.cookie) ? r.cookie : []))) if (v && v !== 'undefined' && v !== 'null') cookies[k] = v;
  const b = r?.body ?? r; const d = b?.data ?? b;
  if (d?.token) cookies.token = String(d.token); if (d?.userid ?? d?.user_id) cookies.userid = String(d.userid ?? d.user_id); if (d?.dfid) cookies.dfid = String(d.dfid);
  return b;
};
const kgEnsureDev = async (cookies) => { if (cookies.dfid === 'undefined') delete cookies.dfid; if (!cookies.dfid) await kgCall('register_dev', {}, cookies); };
const kgReq = async (name, params, cookies) => { await kgEnsureDev(cookies); let b = await kgCall(name, params, cookies); if (kgNeedsVerify(b)) { delete cookies.dfid; await kgEnsureDev(cookies); b = await kgCall(name, params, cookies); } return b; };
const kg = {
  async qr(user) { const dev = kgDevices[user] || (kgDevices[user] = (getAcct(user, 'kg')?.cookies && { ...getAcct(user, 'kg').cookies }) || newKgDevice()); delete dev.token; delete dev.userid; const k = await kgReq('login_qr_key', {}, dev); const key = String(k?.data?.qrcode || k?.data?.qrkey || ''); if (!key) throw new Error('no key'); const c = await kgCall('login_qr_create', { key, qrimg: true }, dev); return { key, img: c?.data?.base64, link: c?.data?.url }; },
  async check(user, key) {
    const dev = kgDevices[user] || (kgDevices[user] = newKgDevice());
    const b = await kgCall('login_qr_check', { key, qrcode: key }, dev);
    const st = Number(b?.data?.status);
    if (st === 0) return { state: 'expired' };
    if (st === 1) return { state: 'waiting' };
    if (st === 2 || st === 3) return { state: 'scanned', nick: b?.data?.nickname };
    if (st === 4 || b?.data?.token) {
      const cookies = { ...dev }; const nick = b?.data?.nickname || '';
      let vip = false; try { const v = await kgReq('user_vip_detail', {}, cookies); vip = Number(v?.data?.is_vip || 0) > 0; } catch (e) {}
      setAcct(user, 'kg', { cookies, nick, vip, at: Date.now() }); delete kgDevices[user];
      return { state: 'confirmed', nick };
    }
    return { state: 'error', message: String(b?.data?.message || b?.error_msg || b?.msg || 'unknown') };
  },
  Q: { '128k': '128', '320k': '320', flac: 'flac', flac24bit: 'high' },
  async url(user, acct, info, q) {
    const cookies = acct.cookies; const order = ['flac24bit', 'flac', '320k', '128k']; const start = Math.max(0, order.indexOf(q));
    const hash = String(info.hash || '').toUpperCase(); if (!hash) throw new Error('no hash');
    let lastErr = 'no url';
    try {
      for (const qq of order.slice(start)) {
        let b = await kgReq('song_url', { hash, quality: kg.Q[qq], album_id: info.albumId || 0 }, cookies);
        if (info.albumId && !(b?.url || []).length) b = await kgReq('song_url', { hash, quality: kg.Q[qq], album_id: 0 }, cookies);
        const u = [].concat(b?.url || [], b?.backupUrl || [], b?.data?.[0]?.url || []).find(x => /^https?:/.test(x));
        if (u) return { url: u, quality: qq };
        lastErr = `status ${b?.status ?? '?'} err ${b?.error_code ?? b?.errcode ?? '?'}`;
        if (Number(b?.error_code ?? b?.errcode) === 152) throw new Error('kugou login expired');
      }
    } finally { setAcct(user, 'kg', { ...acct, cookies }); }
    throw new Error(lastErr);
  },
};

// ---------- QQ (qq-music-api in-process, forced to localhost) ----------
process.env.PORT = String(QQ_PORT); process.env.AUTO_OPEN_EXPLORER = 'false'; process.env.QQ_DISABLE_UPDATE_CHECK = 'true';
process.env.QQ_AUTH_STATE_PATH = process.env.QQ_AUTH_STATE_PATH || path.join(STATE, 'qq-device.json');
{ const orig = http.Server.prototype.listen; let qqBound = false;
  http.Server.prototype.listen = function (...a) { if (!qqBound && Number(a[0]) === QQ_PORT) { qqBound = true; return orig.call(this, QQ_PORT, HOST, ...a.slice(1).filter(x => typeof x === 'function')); } return orig.apply(this, a); }; }
require('@yakult-green-tea/qq-music-api');
const qqGet = (p, token) => new Promise((ok, no) => {
  const r = http.get({ host: HOST, port: QQ_PORT, path: p, headers: token ? { 'X-QQ-Session': token } : {}, timeout: 15000 }, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { ok({ status: res.statusCode, body: JSON.parse(d) }); } catch (e) { ok({ status: res.statusCode, body: null }); } }); });
  r.on('timeout', () => r.destroy(new Error('timeout'))); r.on('error', no);
});
const qqTok = (cookie) => { const m = /(?:^|;)\s*qqmusic_session=([^;]+)/.exec(cookie || ''); return m ? m[1] : ''; };
const tx = {
  async qr() { const k = await qqGet('/login/qr/key?channel=qq'); const key = k.body?.data?.unikey; if (!key) throw new Error(`no key (${k.status})`); const c = await qqGet('/login/qr/create?key=' + encodeURIComponent(key)); return { key, img: c.body?.data?.qrimg }; },
  async check(user, key) {
    const r = await qqGet('/login/qr/check?key=' + encodeURIComponent(key)); const code = Number(r.body?.code);
    if (code === 801) return { state: 'waiting' };
    if (code === 802) return { state: 'scanned' };
    if (code === 803) {
      const token = qqTok(r.body?.cookie); if (!token) return { state: 'error', message: '未取得会话' };
      const info = await tx.profile(token); setAcct(user, 'tx', { token, nick: info.nick, at: Date.now() });
      return { state: 'confirmed', nick: info.nick };
    }
    if (code === 800) return r.body?.failureReason && r.body.failureReason !== 'qr-timeout' ? { state: 'error', message: String(r.body.failureReason) } : { state: 'expired' };
    return { state: 'error', message: `code ${isNaN(code) ? r.status : code}` };
  },
  async profile(token) { try { const r = await qqGet('/user/detail', token); const d = r.body?.data || {}; const nick = d.creator?.nick || d.nick || d.nickname || d.name || ''; const s = await qqGet('/login/status', token); return { nick, ok: !!(s.body?.data?.isLogin ?? s.body?.isLogin ?? s.body?.data?.loggedIn ?? (s.status === 200 && nick)) }; } catch (e) { return { nick: '', ok: false }; } },
  Q: { '128k': '128', '320k': '320', flac: 'flac', flac24bit: 'flac' },
  async url(acct, info, q) {
    const order = ['flac', '320k', '128k']; const start = Math.max(0, order.indexOf(q === 'flac24bit' ? 'flac' : q));
    let lastErr = 'no url';
    for (const qq of order.slice(start)) {
      const r = await qqGet(`/getMusicPlay/${encodeURIComponent(info.songmid)}?quality=${tx.Q[qq]}${info.mediaMid ? '&mediaId=' + encodeURIComponent(info.mediaMid) : ''}`, acct.token);
      if (r.status === 401) throw new Error('qq login expired');
      const m = r.body?.data?.playUrl || {}; const e = m[info.songmid] || Object.values(m)[0];
      if (e?.url && /^https?:/.test(e.url)) return { url: e.url, quality: qq };
      lastErr = `status ${r.status}`;
    }
    throw new Error(lastErr);
  },
};
const P = { wy, tx, kg };
const PNAME = { wy: '网易云音乐', tx: 'QQ音乐', kg: '酷狗音乐' };

// ---------- identity via the gateway (CF Access JWT verified there) ----------
const idCache = new Map();
const whoami = (req) => new Promise((ok) => {
  const ck = req.headers.cookie || '', jw = req.headers['cf-access-jwt-assertion'] || '';
  const ckey = crypto.createHash('sha256').update(ck + '|' + jw).digest('hex'); const c = idCache.get(ckey);
  if (c && c.exp > Date.now()) return ok(c.v);
  const h = {}; if (ck) h.cookie = ck; if (jw) h['cf-access-jwt-assertion'] = jw;
  const get = (p) => new Promise((r) => { const q = http.get(GW + p, { headers: h, timeout: 5000 }, (res) => { let d = ''; res.on('data', x => d += x); res.on('end', () => { try { r(res.statusCode === 200 ? JSON.parse(d) : null); } catch (e) { r(null); } }); }); q.on('timeout', () => q.destroy()); q.on('error', () => r(null)); });
  Promise.all([get('/__gw/push?a=0'), get('/__gw/me')]).then(([p, m]) => {
    const v = p && m && p.u ? { name: String(p.u), display: m.name || p.u, admin: m.role === 'admin' } : null;
    if (v) idCache.set(ckey, { v, exp: Date.now() + 60e3 }); ok(v);
  });
});
const allUsers = () => { try { return JSON.parse(fs.readFileSync(process.env.ACC_USERS_JSON || '/opt/al-gateway/users.json', 'utf8')).map(u => ({ name: u.name, display: u.display || u.name, admin: u.role === 'admin' })); } catch (e) { return []; } };

// ---------- account resolution for playback ----------
const resolveAcct = (user, p) => {
  const own = getAcct(user, p); if (own) return { acct: own, owner: user };
  if (user !== ADMIN && cfg.users[user]?.shareFromAdmin) { const a = getAcct(ADMIN, p); if (a) return { acct: a, owner: ADMIN }; }
  return null;
};
const urlCache = new Map(); // short cache so the loader's verify + replays don't hammer upstream
async function playUrl(user, p, info, q) {
  const uc = cfg.users[user]; if (!uc?.enabled) { const e = new Error('account source disabled by user'); e.code = 403; throw e; }
  const r = resolveAcct(user, p); if (!r) { const e = new Error(`${p} not logged in`); e.code = 401; throw e; }
  const ck = `${r.owner}|${p}|${info.songmid || info.id || info.hash}|${q}`; const c = urlCache.get(ck);
  if (c && c.exp > Date.now()) return c.v;
  let v;
  if (p === 'wy') v = await wy.url(r.acct, { id: info.songmid }, q);
  else if (p === 'tx') v = await tx.url(r.acct, { songmid: info.songmid, mediaMid: info.mediaMid }, q);
  else v = await kg.url(r.owner, r.acct, { hash: info.hash, albumId: info.albumId }, q);
  urlCache.set(ck, { v, exp: Date.now() + 10 * 60e3 }); if (urlCache.size > 500) urlCache.delete(urlCache.keys().next().value);
  return v;
}

// ---------- HTTP ----------
const PAGE = fs.readFileSync(path.join(__dirname, 'login.html'));
const J = (res, code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(o)); };
const body = (req) => new Promise((ok) => { let d = ''; req.on('data', c => { d += c; if (d.length > 4096) req.destroy(); }); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch (e) { ok({}); } }); });
const qrKeys = new Map(); // key -> {user, p, exp}: a user may only poll the QR they created
const tokUser = () => { const m = {}; for (const [n, u] of Object.entries(cfg.users)) m[u.token] = n; return m; };

async function stateFor(me) {
  const uc = userCfg(me.name); const out = { user: me.display, admin: me.admin, enabled: uc.enabled, shareFromAdmin: !!uc.shareFromAdmin, platforms: {} };
  for (const p of Object.keys(P)) { const a = getAcct(me.name, p); const sh = !a && me.name !== ADMIN && uc.shareFromAdmin && getAcct(ADMIN, p); out.platforms[p] = { name: PNAME[p], loggedIn: !!a, nick: a?.nick || '', vip: !!a?.vip, since: a?.at || 0, sharedFromAdmin: !!sh }; }
  if (me.admin) out.users = allUsers().filter(u => !u.admin).map(u => ({ name: u.name, display: u.display, share: !!cfg.users[u.name]?.shareFromAdmin }));
  return out;
}

const server = http.createServer(async (req, res) => {
  try {
    reloadCfg(); const u = new URL(req.url, 'http://x');
    // ---- internal: called only by the LX script inside AL instances (nginx never proxies /int/) ----
    if (u.pathname === '/int/url') {
      const user = tokUser()[req.headers['x-acc-token'] || ''];
      if (!user) return J(res, 403, { error: 'bad token' });
      const p = u.searchParams.get('src'); if (!P[p]) return J(res, 400, { error: 'bad src' });
      const info = { songmid: u.searchParams.get('id') || '', hash: u.searchParams.get('hash') || '', mediaMid: u.searchParams.get('mmid') || '', albumId: u.searchParams.get('aid') || '' };
      const q = u.searchParams.get('q') || '320k';
      try { const v = await playUrl(user, p, info, q); return J(res, 200, v); }
      catch (e) { return J(res, e.code || 404, { error: String(e.message || e).slice(0, 120) }); }
    }
    if (u.pathname === '/healthz') return J(res, 200, { ok: true });
    if (!u.pathname.startsWith('/al-login')) return J(res, 404, { error: 'not found' });
    if (u.pathname === '/al-login' ) { res.writeHead(302, { Location: '/al-login/' }); return res.end(); }
    const me = await whoami(req);
    if (!me) return J(res, 401, { error: '未登录 Any Listen' });
    if (u.pathname === '/al-login/' || u.pathname === '/al-login/index.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'no-referrer' }); return res.end(PAGE); }
    const api = /^\/al-login\/api\/(.+)$/.exec(u.pathname); if (!api) return J(res, 404, { error: 'not found' });
    const route = api[1];
    if (req.method !== 'GET' && req.headers['x-al'] !== '1') return J(res, 403, { error: 'csrf' });
    if (route === 'state') return J(res, 200, await stateFor(me));
    if (route === 'enable' && req.method === 'POST') { const b = await body(req); userCfg(me.name).enabled = !!b.enabled; saveCfg(); return J(res, 200, await stateFor(me)); }
    if (route === 'share' && req.method === 'POST') { if (!me.admin) return J(res, 403, { error: '仅管理员' }); const b = await body(req); if (!allUsers().some(x => x.name === b.user && !x.admin)) return J(res, 400, { error: 'bad user' }); userCfg(b.user).shareFromAdmin = !!b.share; saveCfg(); return J(res, 200, await stateFor(me)); }
    const m = /^(wy|tx|kg)\/(qr|check|logout|refresh)$/.exec(route); if (!m) return J(res, 404, { error: 'not found' });
    const [, p, act] = m; userCfg(me.name);
    if (act === 'qr' && req.method === 'POST') { const r = await P[p].qr(me.name); for (const [k, v] of qrKeys) if (v.exp < Date.now() || (v.user === me.name && v.p === p)) qrKeys.delete(k); qrKeys.set(r.key, { user: me.name, p, exp: Date.now() + 200e3 }); return J(res, 200, { key: r.key, img: r.img, link: /^https:\/\/(music\.163\.com|h5\.kugou\.com)\//.test(r.link || '') ? r.link : '', ttl: p === 'tx' ? 175 : 170 }); }
    if (act === 'check') { const key = u.searchParams.get('key') || ''; const k = qrKeys.get(key); if (!k || k.user !== me.name || k.p !== p) return J(res, 200, { state: 'expired' }); const r = await P[p].check(me.name, key); if (r.state !== 'waiting' && r.state !== 'scanned') qrKeys.delete(key); return J(res, 200, r); }
    if (act === 'logout' && req.method === 'POST') { const a = getAcct(me.name, p); if (p === 'tx' && a?.token) await qqGet('/logout', a.token).catch(() => {}); setAcct(me.name, p, null); for (const k of urlCache.keys()) if (k.startsWith(me.name + '|' + p + '|')) urlCache.delete(k); return J(res, 200, await stateFor(me)); }
    if (act === 'refresh' && req.method === 'POST') {
      const a = getAcct(me.name, p); if (!a) return J(res, 200, { ok: false, error: '未登录' });
      let info; if (p === 'wy') info = await wy.profile(a.cookie); else if (p === 'tx') info = await tx.profile(a.token); else { const c = { ...a.cookies }; const b = await kgReq('user_detail', {}, c).catch(() => null); info = { nick: b?.data?.nickname || a.nick, ok: !!b?.data?.nickname }; }
      if (info.nick) setAcct(me.name, p, { ...a, nick: info.nick });
      return J(res, 200, { ok: !!info.ok, nick: info.nick || a.nick });
    }
    return J(res, 405, { error: 'method' });
  } catch (e) {
    console.error('[accsrc] handler error:', String(e && e.message || e).slice(0, 200));
    if (!res.headersSent) J(res, 500, { error: '服务内部错误' });
  }
});
server.listen(PORT, HOST, () => console.log(`[accsrc] listening ${HOST}:${PORT} (qq ${HOST}:${QQ_PORT})`));
