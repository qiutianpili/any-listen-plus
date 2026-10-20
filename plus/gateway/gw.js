// Any Listen whitelist gateway: per-user isolated instances (2026-10-09), on-demand start / idle stop (2026-10-10)
'use strict';
const http = require('http'), net = require('net'), fs = require('fs'), path = require('path'),
  crypto = require('crypto'), { execFile } = require('child_process');
const DIR = '/opt/al-gateway', USERS = DIR + '/users.json', SECRET_F = DIR + '/secret',
  UROOT = '/opt/al-users', ADMIN_DATA = '/opt/any-listen/data', PORT = 9400, MAX_USERS = 4;
if (!fs.existsSync(SECRET_F)) fs.writeFileSync(SECRET_F, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(SECRET_F, 'utf8').trim();
let users = JSON.parse(fs.readFileSync(USERS, 'utf8'));
const SETTINGS = DIR + '/settings.json';
let settings = { idleMin: 15, maxUsers: 10 }; try { Object.assign(settings, JSON.parse(fs.readFileSync(SETTINGS, 'utf8'))); } catch (e) {}
const saveSettings = () => fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2), { mode: 0o600 });
// admin push messages (2026-10-11): {id, ts, by, to:'*'|name, mode:'modal'|'toast'|'home', title, text}; kept 24h, max 50
const PUSH_F = DIR + '/push.json', PUSH_TTL = 24 * 3600e3;
// homepage announcement (2026-10-11): single notice, no history {title,text,ts,by}
const NOTICE_F = DIR + '/notice.json';
let notice = null; try { notice = JSON.parse(fs.readFileSync(NOTICE_F, 'utf8')); } catch (e) {}
const saveNotice = () => { if (notice) fs.writeFileSync(NOTICE_F, JSON.stringify(notice), { mode: 0o600 }); else try { fs.unlinkSync(NOTICE_F); } catch (e) {} };
let pushes = []; try { pushes = JSON.parse(fs.readFileSync(PUSH_F, 'utf8')); } catch (e) {}
const savePush = () => { const t = Date.now() - PUSH_TTL; pushes = pushes.filter(p => p.ts > t).slice(-50); fs.writeFileSync(PUSH_F, JSON.stringify(pushes), { mode: 0o600 }); };
const pushFor = (u, after) => { const t = Math.max(after || 0, Date.now() - PUSH_TTL); return pushes.filter(p => p.ts > t && (p.to === u.name || (p.to === '*' && p.by !== u.name))).map(p => ({ id: p.id, ts: p.ts, mode: p.mode, title: p.title, text: p.text })); };
const unitOf = u => u.role === 'admin' ? 'any-listen' : 'any-listen-u@' + u.name;
const lastActive = new Map(), starting = new Map(), BOOT = Date.now();
const dn = u => u.display || u.name; // display name (user-editable); u.name is the fixed instance id
// username rules (2026-10-11): display-only, never used in paths/units/shell (instance id is u<port>); always escaped on output
const RESERVED = /^(admin|administrator|root|system|sys|server|null|undefined|guest|hark|anylisten|any-listen|cloudflare|管理员|系统|官方|客服)$/i;
const lastRename = new Map();
const nameErr = (n0, self) => {
  const n = String(n0 || '').normalize('NFC');
  if (n !== n0) return '用户名包含不支持的字符';
  if (!/^[\p{Script=Han}A-Za-z0-9_-]{2,16}$/u.test(n)) return '用户名需为 2–16 位，只能用中文、英文字母、数字、下划线或短横线';
  if (/^[-_]/.test(n)) return '用户名不能以下划线或短横线开头';
  if (/^\d+$/.test(n) && n.length > 11) return '用户名不能是过长的纯数字';
  if (RESERVED.test(n) || /^u\d+$/i.test(n)) return '这个用户名是保留名，换一个吧';
  if (users.some(x => x !== self && (dn(x).toLowerCase() === n.toLowerCase() || x.name.toLowerCase() === n.toLowerCase()))) return '这个用户名已被占用';
  return '';
};
const regPage = (err = '', v = '') => page('设置用户名', `<h1>欢迎使用 Any Listen</h1>${err ? `<div class="err">${esc(err)}</div>` : ''}<form method="post" action="/__gw/register"><label>请输入您的用户名<input name="u" maxlength="16" value="${esc(v)}" autofocus required></label><button style="width:100%">进入</button></form><div class="tip">2–16 位中文、字母、数字、下划线或短横线。之后可以在侧栏用户名旁的小铅笔修改。</div><p class="gw-foot"><a href="/cdn-cgi/access/logout">换个邮箱</a></p>`);
const touch = u => lastActive.set(u.name, Date.now());
// last-online persistence (2026-10-12): daily.py skips users not seen for 7 days
const SEEN_F = DIR + '/seen.json';
let seenAt = {}; try { seenAt = JSON.parse(fs.readFileSync(SEEN_F, 'utf8')); } catch (e) {}
setInterval(() => { let ch = false; for (const [k, v] of lastActive) if ((seenAt[k] || 0) < v) { seenAt[k] = v; ch = true; } if (ch) try { fs.writeFileSync(SEEN_F, JSON.stringify(seenAt), { mode: 0o600 }); } catch (e) {} }, 60000).unref();
// 每日推荐 (2026-10-12): daily.py writes DIR/daily/<name>.json; serve today's, or generate it now for an online user who has none yet
const DAILY_DIR = DIR + '/daily', dailyRun = new Map();
const cnDate = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
// 每日推荐 dedupe (2026-10-19): ids of the user's existing 每日推荐 lists read from their DB (read-only), so the page never
// creates a second one when its own list state loads late, and removes extras made by two devices at once. null = unknown.
async function dailyIds(u) {
  try { return JSON.parse(await helper(['dailyids', u.role === 'admin' ? 'admin' : u.name], null, 10000)); } catch (e) { console.error('dailyIds', u.name, e.message); return null; }
}
async function dailyFor(u) {
  const today = cnDate(); let d = null;
  try { d = JSON.parse(fs.readFileSync(path.join(DAILY_DIR, u.name + '.json'), 'utf8')); } catch (e) {}
  if (d && d.date === today) return { date: d.date, list: d.list || [], ids: await dailyIds(u) };
  if (dailyRun.get(u.name) !== today) {
    dailyRun.set(u.name, today);
    helper(['daily', u.name, 'active'], null, 180000).catch(e => console.error('daily', u.name, e.message));
  }
  return { pending: true };
}
const portUp = port => new Promise(ok => { const s = net.connect(port, '127.0.0.1'); s.setTimeout(800); s.on('connect', () => { s.destroy(); ok(true); }); s.on('error', () => ok(false)); s.on('timeout', () => { s.destroy(); ok(false); }); });
async function ensureStarted(u) {
  touch(u);
  if (await portUp(u.port)) return true;
  if (!starting.has(u.name)) { starting.set(u.name, Date.now()); helper(['start', u.role === 'admin' ? 'admin' : u.name]).catch(e => console.error('start', u.name, e.message)).finally(() => setTimeout(() => starting.delete(u.name), 30000)); }
  return false;
}
setInterval(async () => {
  const lim = settings.idleMin * 60e3;
  for (const u of users) {
    const t = lastActive.get(u.name) || BOOT;
    if (Date.now() - t < lim || starting.has(u.name)) continue;
    if (!(await portUp(u.port))) continue;
    console.log('idle stop', u.name); helper(['stop', u.role === 'admin' ? 'admin' : u.name]).catch(e => console.error('stop', u.name, e.message));
  }
}, 30000);
const saveUsers = () => fs.writeFileSync(USERS, JSON.stringify(users, null, 2), { mode: 0o600 });
const hash = (pw, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const check = (pw, h) => { const [s, d] = h.split(':'); const x = crypto.scryptSync(pw, s, 32); return crypto.timingSafeEqual(x, Buffer.from(d, 'hex')); };
const sign = v => v + '.' + crypto.createHmac('sha256', SECRET).update(v).digest('hex').slice(0, 32);
// Cloudflare Access login (2026-10-10): only the admin email is allowed; whitelist passwords no longer used
const https = require('https');
// fill in /opt/al-gateway/config.json: {"cfTeam":"https://<team>.cloudflareaccess.com","cfAud":"<Access app AUD tag>","adminEmails":["you@example.com"]}
const GW_CFG = JSON.parse(fs.readFileSync(DIR + '/config.json', 'utf8'));
const CF_TEAM = String(GW_CFG.cfTeam || '').replace(/\/+$/, ''), CF_AUD = String(GW_CFG.cfAud || '');
const ADMIN_EMAILS = (GW_CFG.adminEmails || []).map(e => String(e).toLowerCase());
let jwks = {}, jwksAt = 0, jwksP = null;
function loadCerts() {
  if (jwksP) return jwksP;
  jwksP = new Promise(ok => https.get(CF_TEAM + '/cdn-cgi/access/certs', r => { let b = ''; r.on('data', d => b += d); r.on('end', () => { try { const k = {}; for (const j of JSON.parse(b).keys) k[j.kid] = crypto.createPublicKey({ key: j, format: 'jwk' }); jwks = k; jwksAt = Date.now(); } catch (e) { console.error('certs', e.message); } ok(); }); }).on('error', e => { console.error('certs', e.message); ok(); })).finally(() => setTimeout(() => { jwksP = null; }, 5000));
  return jwksP;
}
loadCerts(); setInterval(loadCerts, 3600e3);
const b64j = x => JSON.parse(Buffer.from(x, 'base64url').toString());
function cfToken(req) {
  const h = req.headers['cf-access-jwt-assertion']; if (h) return h;
  const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(req.headers.cookie || ''); return m ? m[1] : null;
}
async function sessionUser(req) {
  const t = cfToken(req); if (!t) return null;
  const [h, p, sg] = t.split('.'); if (!sg) return null;
  let hd, pl; try { hd = b64j(h); pl = b64j(p); } catch (e) { return null; }
  if (hd.alg !== 'RS256') return null;
  if (!jwks[hd.kid] && Date.now() - jwksAt > 60e3) await loadCerts();
  const key = jwks[hd.kid]; if (!key) return null;
  if (!crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), key, Buffer.from(sg, 'base64url'))) return null;
  const now = Date.now() / 1000;
  if (pl.iss !== CF_TEAM || !(Array.isArray(pl.aud) ? pl.aud : [pl.aud]).includes(CF_AUD) || !(pl.exp > now) || (pl.nbf && pl.nbf > now + 60)) return null;
  const em = String(pl.email || '').toLowerCase();
  const u = ADMIN_EMAILS.includes(em) ? users.find(x => x.role === 'admin') : users.find(x => x.role !== 'admin' && String(x.email || '').toLowerCase() === em);
  if (!u) { if (em) req._email = em; return null; } // whitelisted by Access but not bound yet -> self-register
  if (u.minIat && pl.iat < u.minIat && u.keepSig !== sg.slice(0, 32)) { req._kicked = u.kicked && u.kicked >= u.minIat ? 'admin' : 'self'; return null; } // "remove other devices" / admin kick
  return u;
}
// optional Cloudflare Access sync: /opt/al-gateway/cf.json {token, account, app, policy}
const CF_F = DIR + '/cf.json'; const CF_SYNC = () => { try { return JSON.parse(fs.readFileSync(CF_F, 'utf8')); } catch (e) { return null; } };
function cfReq(c, method, p, body) { return new Promise(ok => { const r = https.request({ host: 'api.cloudflare.com', path: '/client/v4' + p, method, headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' } }, x => { let d = ''; x.on('data', y => d += y); x.on('end', () => { try { ok(JSON.parse(d)); } catch (e) { ok(null); } }); }); r.on('error', () => ok(null)); if (body) r.write(JSON.stringify(body)); r.end(); }); }
async function cfAllow(email, add) {
  const c = CF_SYNC(); if (!c) return false;
  const base = `/accounts/${c.account}/access/apps/${c.app}/policies/${c.policy}`;
  const g = await cfReq(c, 'GET', base); if (!g || !g.success) return false;
  const p = g.result; let inc = p.include || [];
  const has = inc.some(i => i.email && String(i.email.email).toLowerCase() === email);
  if (add && has) return true; if (!add && !has) return true;
  inc = add ? [...inc, { email: { email } }] : inc.filter(i => !(i.email && String(i.email.email).toLowerCase() === email));
  const r = await cfReq(c, 'PUT', base, { name: p.name, decision: p.decision, include: inc, exclude: p.exclude || [], require: p.require || [], precedence: p.precedence });
  return !!(r && r.success);
}
const fails = new Map();
const WS_ACTIVE_BYTES = 400; // client->server ws traffic counted as activity (player progress events); tuned 2026-10-10
const ip = req => req.headers['x-real-ip'] || req.socket.remoteAddress;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CSS = `body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f5fb;font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;color:#333}
.card{background:#fff;border-radius:12px;box-shadow:0 4px 24px rgba(80,90,180,.12);padding:28px;width:min(92vw,420px);box-sizing:border-box}
h1{font-size:20px;margin:0 0 18px;color:#5b6ee1}input,select{width:100%;box-sizing:border-box;padding:10px 12px;margin:6px 0 12px;border:1px solid #d8dbf0;border-radius:8px;font-size:15px}
button{background:#5b6ee1;color:#fff;border:none;border-radius:8px;padding:10px 16px;font-size:15px;cursor:pointer}button.del{background:#e5566a;padding:6px 10px;font-size:13px}
.err{color:#e5566a;margin-bottom:10px}.ok{color:#2a9d63;margin-bottom:10px}table{width:100%;border-collapse:collapse;margin-bottom:18px}td,th{padding:8px 4px;border-bottom:1px solid #eef;text-align:left;font-size:14px}
a{color:#5b6ee1}.tip{font-size:12px;opacity:.65;margin-top:8px}
.emb body{min-height:0;display:block;background:transparent}.emb .card{box-shadow:none;width:100%;padding:20px 24px}.emb .gw-foot,.emb h1{display:none}.emb td,.emb th,.emb label,.emb input,.emb button{font-size:15px}.emb .tip{font-size:13px}
.ut .ops{white-space:nowrap}.ut .ops form{display:inline-block;margin:2px 0}.ut .em{word-break:break-all}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}html::-webkit-scrollbar{display:none}.emb,.emb body{height:auto;overflow-x:hidden}
#sbt{position:fixed;top:2px;right:2px;bottom:2px;width:10px;z-index:9;display:none;touch-action:none}#sbh{position:absolute;left:2px;right:2px;top:0;border-radius:4px;background:rgba(91,110,225,.55);touch-action:none;cursor:grab}
@media (max-width:560px){.card{padding:20px 16px}.emb .card{padding:14px 12px}.ut,.ut tbody,.ut tr,.ut td{display:block;width:100%;box-sizing:border-box}.ut tr:first-child{display:none}
.ut tr{border:1px solid #e6e8f5;border-radius:10px;padding:8px 12px;margin-bottom:10px}.ut td{border:none;padding:4px 0;display:flex;gap:10px;align-items:baseline}
.ut td::before{content:attr(data-l);flex:none;width:3em;opacity:.55;font-size:13px}.ut td>*{min-width:0}.ut .ops{flex-wrap:wrap;white-space:normal}.ut .ops:empty{display:none}
input,select,button{font-size:16px!important}}`;
const page = (title, body) => `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="icon" href="/__m/icon.ico"><link rel="icon" type="image/png" sizes="256x256" href="/__m/256x256.png"><link rel="apple-touch-icon" href="/__m/256x256.png"><style>${CSS}</style><script>if(self!==top)document.documentElement.className='emb'</script></head><body><div class="card">${body}</div><div id="sbt"><div id="sbh"></div></div><script>(function(){var se=document.scrollingElement||document.documentElement,t=document.getElementById('sbt'),h=document.getElementById('sbh');
function up(){var ch=innerHeight,sh=se.scrollHeight;if(sh<=ch+2){t.style.display='none';return}t.style.display='block';var th=Math.max(36,ch*ch/sh);h.style.height=th+'px';h.style.transform='translateY('+((ch-th)*se.scrollTop/(sh-ch))+'px)'}
addEventListener('scroll',up,{passive:true});addEventListener('resize',up);new ResizeObserver(up).observe(document.body);up();
var y0=null,s0=0;h.addEventListener('pointerdown',function(e){y0=e.clientY;s0=se.scrollTop;h.setPointerCapture(e.pointerId);e.preventDefault()});
h.addEventListener('pointermove',function(e){if(y0===null)return;var ch=innerHeight,sh=se.scrollHeight,th=h.offsetHeight;se.scrollTop=s0+(e.clientY-y0)*(sh-ch)/Math.max(1,ch-th)});
h.addEventListener('pointerup',function(){y0=null});h.addEventListener('pointercancel',function(){y0=null});
t.addEventListener('pointerdown',function(e){if(e.target!==t)return;var r=e.clientY/innerHeight;se.scrollTop=r*(se.scrollHeight-innerHeight)});})()</script></body></html>`;
// CSRF (2026-10-14): every POST to /__gw/* must come from our own origin; admin POSTs additionally need the
// per-admin form token (or the X-AL header that only same-origin script can set).
const ORIGIN = process.env.GW_ORIGIN || 'https://music.example.com';
const csrfTok = u => crypto.createHmac('sha256', SECRET).update('csrf|' + u.name).digest('hex').slice(0, 32);
// Origin may be "null" for form posts under a strict Referrer-Policy; then trust the browser-set Sec-Fetch-Site.
const sameOrigin = req => { const o = req.headers.origin, s = req.headers['sec-fetch-site']; if (o && o !== 'null') return o === ORIGIN; if (s) return s === 'same-origin'; return !o && req.headers['x-al'] === '1'; };
const csrfOk = (u, v) => { const a = Buffer.from(String(v || '')), b = Buffer.from(csrfTok(u)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
function send(res, code, body, headers = {}) { res.writeHead(code, Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }, headers)); res.end(body); }
function readBody(req) { return new Promise(r => { let b = ''; req.on('data', d => { b += d; if (b.length > 1e5) req.destroy(); }); req.on('end', () => r(new URLSearchParams(b))); }); }
const loginPage = (err = '') => page('登录 Any Listen', `<h1>Any Listen 登录</h1>${err ? `<div class="err">${esc(err)}</div>` : ''}<form method="post" action="/__gw/login"><label>用户名<input name="u" autocomplete="username" required></label><label>密码<input name="p" type="password" autocomplete="current-password" required></label><button style="width:100%">登录</button></form><div class="tip">仅限白名单用户</div>`);
function run(cmd, args) { return new Promise((ok, no) => execFile(cmd, args, { timeout: 60000 }, (e, so, se) => e ? no(new Error(se || e.message)) : ok(so))); }
// privilege drop (2026-10-19): the gateway runs as al-gw; anything that needs root goes through the fixed-verb helper via sudo
const HELPER = '/opt/al-gateway-root/helper.js', NODE = process.execPath;
function helper(args, input, timeout = 60000) { return new Promise((ok, no) => { const c = execFile('sudo', ['-n', NODE, HELPER, ...args], { timeout }, (e, so, se) => e ? no(new Error(String(se || e.message).trim())) : ok(so)); if (input != null) c.stdin.end(input); else c.stdin.end(); }); }
const SKIP_CFG = /^player\.|^list\.|^playDetail|^common\.lastPlay/;
// security (2026-10-14): each player runs as its own system user al-<id> (data dir 0700), ids are never reused,
// and the admin's per-user account-source script/token is stripped from the cloned extension dir before first start.
const sysUser = name => 'al-' + name;
const SAFE_ID = /^[A-Za-z0-9_]{1,24}$/, regBusy = new Set();
function allocPort() {
  // monotonic: a deleted user's id (u<port>) is never handed to someone else
  let p = Math.max(9501, settings.nextPort || 0, ...users.map(x => x.port + 1));
  while (users.some(x => x.port === p) || fs.existsSync(path.join(UROOT, 'u' + p))) p++;
  settings.nextPort = p + 1; saveSettings();
  return p;
}
async function createInstance(name, port, alpw) {
  if (!SAFE_ID.test(name)) throw new Error('bad id');
  await helper(['create', name, String(port)], alpw, 120000);
}
async function removeInstance(name) {
  if (!SAFE_ID.test(name)) return;
  await helper(['remove', name], null, 120000);
}
const sendAdmin = (res, me, html) => send(res, 200, html.replace(/(<form method="post"[^>]*>)/g, `$1<input type="hidden" name="_csrf" value="${csrfTok(me)}">`));
async function adminPage(req, res, me, msg = '', err = '') {
  let mem = ''; try { mem = (await run('free', ['-m'])).split('\n')[1].trim().split(/\s+/); mem = `可用内存 ${mem[6]} MB / ${mem[1]} MB`; } catch (e) {}
  const up = {}; await Promise.all(users.map(async u => { up[u.name] = await portUp(u.port); }));
  const nUsers = users.filter(u => u.role !== 'admin').length;
  let llm = {}; try { llm = JSON.parse(await helper(['llmstat', 'admin'], null, 10000)); } catch (e) { console.error('llmstat', e.message); }
  const rows = users.map(u => `<tr><td data-l="用户">${esc(dn(u))}${dn(u) !== u.name ? `<div class="tip" style="margin:0">${esc(u.name)}</div>` : ''}</td><td data-l="身份" class="em">${u.role === 'admin' ? '管理员' : (u.email ? esc(u.email) : '用户（已停用）')}</td><td data-l="状态">${up[u.name] ? '运行中' : '休眠'}</td><td data-l="操作" class="ops">${u === me ? '' : `<form method="post" action="/__gw/admin/kick" style="display:inline" onsubmit="return confirm('把 ${esc(dn(u))} 踢下线？他需要重新登录才能继续使用')"><input type="hidden" name="u" value="${esc(u.name)}"><button class="del" style="background:#f0a020">踢下线</button></form>`}${u.role === 'admin' ? '' : ` <form method="post" action="/__gw/admin/del" style="display:inline" onsubmit="return confirm('删除用户 ${esc(dn(u))}？他的歌单和播放记录会一并删除，无法恢复')"><input type="hidden" name="u" value="${esc(u.name)}"><button class="del">删除</button></form>`}</td></tr>`).join('');
  sendAdmin(res, me, page('用户管理', `<h1>用户管理</h1>${msg ? `<div class="ok">${esc(msg)}</div>` : ''}${err ? `<div class="err">${esc(err)}</div>` : ''}<div class="tip" style="margin:0 0 12px">登录使用 Cloudflare Access（邮箱验证码、Google 或 GitHub）。管理员：${esc(ADMIN_EMAILS.join('、'))}；白名单里的其他邮箱首次登录时自己设置用户名。</div><table class="ut"><tr><th>用户</th><th>身份</th><th>状态</th><th>操作</th></tr>${rows}</table>
<div class="tip" style="margin:-8px 0 14px">普通用户 ${nUsers} / ${settings.maxUsers} 人（不含管理员）</div>
<h2 style="font-size:16px;color:#5b6ee1;margin:22px 0 8px">主页公告</h2>
<form method="post" action="/__gw/admin/notice"><label>标题（可不填）<input name="title" maxlength="40" placeholder="公告" value="${esc(notice ? notice.title : '')}"></label>
<label>内容<textarea name="text" maxlength="2000" rows="5" style="width:100%;box-sizing:border-box;padding:10px 12px;margin:6px 0 12px;border:1px solid #d8dbf0;border-radius:8px;font:inherit;font-size:15px;resize:vertical">${esc(notice ? notice.text : '')}</textarea></label><button style="width:100%">保存公告</button></form>
${notice ? `<form method="post" action="/__gw/admin/notice" style="margin-top:8px" onsubmit="return confirm('清除主页公告？')"><input type="hidden" name="clear" value="1"><button class="del" style="width:100%">清除公告</button></form><div class="tip">上次更新：${new Date(notice.ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</div>` : '<div class="tip">当前没有公告，主页不显示公告卡片。</div>'}
<div class="tip">所有用户（包括你自己）在主页看到；保存新公告会直接替换旧的，不保留历史。</div>
<h2 style="font-size:16px;color:#5b6ee1;margin:22px 0 8px">推送通知</h2>
<form method="post" action="/__gw/admin/push"><label>发送给<select name="to"><option value="*">全体用户（不含自己）</option>${users.map(u => `<option value="${esc(u.name)}">${esc(dn(u))}${u === me ? '（自己，测试用）' : ''}</option>`).join('')}</select></label>
<div style="display:flex;gap:18px;margin:2px 0 10px;font-size:15px"><label style="display:flex;align-items:center;gap:6px"><input type="radio" name="mode" value="modal" checked style="width:auto;margin:0">弹窗提示</label><label style="display:flex;align-items:center;gap:6px"><input type="radio" name="mode" value="toast" style="width:auto;margin:0">右下角提示</label><label style="display:flex;align-items:center;gap:6px"><input type="radio" name="mode" value="home" style="width:auto;margin:0">主页推送</label></div>
<label>标题（可不填）<input name="title" maxlength="40" placeholder="管理员通知"></label>
<label>内容<textarea name="text" maxlength="500" required rows="4" style="width:100%;box-sizing:border-box;padding:10px 12px;margin:6px 0 12px;border:1px solid #d8dbf0;border-radius:8px;font:inherit;font-size:15px;resize:vertical"></textarea></label><button style="width:100%">发送</button></form>
<div class="tip">在线用户约 20 秒内收到；不在线的用户 24 小时内打开 Any Listen 时收到。主页推送显示在对方主页公告下方，保留 24 小时，对方可以点 × 关掉。</div>
${pushes.length ? `<table class="ut" style="margin-top:12px"><tr><th>最近推送</th><th>对象</th><th>方式</th><th>操作</th></tr>${pushes.slice().reverse().map(p => { const tu = users.find(x => x.name === p.to); return `<tr><td data-l="内容">${p.title ? `<b>${esc(p.title)}</b> ` : ''}${esc(p.text.length > 40 ? p.text.slice(0, 40) + '…' : p.text)}<div class="tip" style="margin:0">${new Date(p.ts).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })}</div></td><td data-l="对象">${p.to === '*' ? '全体' : esc(tu ? dn(tu) : p.to)}</td><td data-l="方式">${p.mode === 'toast' ? '右下角' : p.mode === 'home' ? '主页' : '弹窗'}</td><td data-l="操作" class="ops"><form method="post" action="/__gw/admin/unpush" style="display:inline"><input type="hidden" name="id" value="${esc(p.id)}"><button class="del">撤回</button></form></td></tr>`; }).join('')}</table><div class="tip" style="margin:-8px 0 14px">撤回后还没收到的人不会再收到。</div>` : ''}
<form method="post" action="/__gw/admin/max" style="margin-top:18px"><label>普通用户上限（1–50）<input name="m" type="number" min="1" max="50" value="${settings.maxUsers}" required></label><button style="width:100%">保存用户上限</button></form>

<h2 style="font-size:16px;color:#5b6ee1;margin:22px 0 8px">每日推荐 · 大模型</h2>
<div class="tip" style="margin:0 0 8px">DeepSeek：${llm.llm ? '已配置（…' + esc(llm.llm) + '）' : '未配置，现用 QQ 音乐相似歌曲算法'}；Clef 重排：${llm.clef ? '已配置' : '未配置（可选）'}。密钥只保存在服务器（root 权限文件），页面不会显示完整内容。开启后会把每位用户最近播放和歌单歌手发给 DeepSeek / Cloudflare 用于推荐。</div>
<form method="post" action="/__gw/admin/llm" autocomplete="off"><label>DeepSeek API Key<input name="k" type="password" autocomplete="new-password" placeholder="${llm.llm ? '留空则不修改' : 'sk-…'}"></label>
<label>Cloudflare 账户 ID（Clef，可选）<input name="ca" autocomplete="off" placeholder="${llm.clefAcct ? '…' + esc(llm.clefAcct) + '，留空则不修改' : '32 位'}"></label>
<label>Cloudflare Workers AI Token（Clef，可选）<input name="ct" type="password" autocomplete="new-password" placeholder="${llm.clef ? '留空则不修改' : ''}"></label>
<button style="width:100%">保存，并重新生成我今天的推荐</button></form>
${llm.llm || llm.clef ? `<form method="post" action="/__gw/admin/llm" style="margin-top:8px" onsubmit="return confirm('清除全部大模型密钥？之后回到原来的相似歌曲算法')"><input type="hidden" name="clear" value="1"><button class="del" style="width:100%">清除密钥</button></form>` : ''}

<form method="post" action="/__gw/admin/idle" style="margin-top:18px"><label>闲置多少分钟后自动停止播放器（1–1440）<input name="m" type="number" min="1" max="1440" value="${settings.idleMin}" required></label><button style="width:100%">保存闲置时间</button></form>

<div class="tip">播放器按需启动，闲置 ${settings.idleMin} 分钟自动休眠（运行时约 120MB）。${mem}</div><p class="gw-foot"><a href="/">← 返回 Any Listen</a> · <a href="/__gw/logout">退出登录</a></p>`));
}
const startingPage = () => page('正在启动', `<h1>播放器正在启动…</h1><p>闲置一段时间后播放器会自动休眠，现在正在唤醒，通常 10 秒左右，好了会自动进入。</p><div class="tip" id="s">请稍候</div><script>let n=0;(function f(){fetch('/__gw/status',{cache:'no-store'}).then(r=>r.json()).then(j=>{if(j.running)location.reload();else{document.getElementById('s').textContent='已等待 '+(++n)+' 秒';setTimeout(f,1000)}}).catch(()=>setTimeout(f,1500))})()</script>`);
function proxyHttp(req, res, port) {
  const p = http.request({ host: '127.0.0.1', port, method: req.method, path: req.url, headers: req.headers }, r => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  p.on('error', () => { if (!res.headersSent) send(res, 502, startingPage()); else res.destroy(); });
  res.on('close', () => { if (!res.writableFinished) p.destroy(); });
  req.pipe(p);
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x'), me = await sessionUser(req);
    if (req.method !== 'GET' && req.method !== 'HEAD' && url.pathname.startsWith('/__gw/') && !sameOrigin(req)) return send(res, 403, 'bad origin', { 'Content-Type': 'text/plain' });
    if (url.pathname === '/__gw/login') return send(res, 302, '', { Location: '/' });
    if (url.pathname === '/__gw/logout') return send(res, 302, '', { Location: '/cdn-cgi/access/logout' });
    if (!me) {
      if (req._kicked) return send(res, 403, page('已下线', `<h1>${req._kicked === 'admin' ? '你已被管理员踢下线' : '此设备已退出登录'}</h1><p>如需继续使用，请重新登录。</p><p><a href="/cdn-cgi/access/logout">重新登录</a></p>`), { 'X-GW-Kicked': req._kicked });
      if (req._email) {
        const full = users.filter(x => x.role !== 'admin').length >= settings.maxUsers;
        if (full) return send(res, 403, page('人数已满', `<h1>用户人数已满</h1><p>当前最多 ${settings.maxUsers} 位用户，请联系管理员。</p><p><a href="/cdn-cgi/access/logout">换个邮箱</a></p>`));
        if (url.pathname === '/__gw/me') return send(res, 403, '{"reg":true}', { 'Content-Type': 'application/json' });
        if (url.pathname === '/__gw/register' && req.method === 'POST') {
          const n = String((await readBody(req)).get('u') || '').trim(), e = nameErr(n);
          if (e) return send(res, 200, regPage(e, n));
          if (regBusy.has(req._email) || users.some(x => String(x.email || '').toLowerCase() === req._email)) return send(res, 302, '', { Location: '/' });
          regBusy.add(req._email); setTimeout(() => regBusy.delete(req._email), 130e3);
          const port = allocPort(), id = 'u' + port, alpw = crypto.randomBytes(12).toString('hex');
          const nu = { name: id, display: n, role: 'user', port, email: req._email, ver: 0, alpw, created: new Date().toISOString() };
          users.push(nu); saveUsers(); touch({ name: id });
          try { await createInstance(id, port, alpw); } catch (e) { console.error('createInstance', id, e.message); users = users.filter(x => x !== nu); saveUsers(); await removeInstance(id).catch(() => {}); return send(res, 500, page('出错了', '<h1>创建播放器失败</h1><p>请稍后重试或联系管理员。</p>')); }
          console.log('register', id, n, req._email);
          return send(res, 302, '', { Location: '/' });
        }
        return send(res, 200, regPage());
      }
      if (cfToken(req)) return send(res, 403, page('无权限', '<h1>登录已失效</h1><p>请重新登录。</p><p><a href="/cdn-cgi/access/logout">重新登录</a></p>'));
      return send(res, 401, page('需要登录', '<h1>请通过 Cloudflare Access 登录</h1><p><a href="/">重新打开</a></p>'));
    }
    if (url.pathname === '/__gw/logout-others' && req.method === 'POST' && req.headers['x-al'] === '1') {
      me.minIat = Math.floor(Date.now() / 1000); me.keepSig = (cfToken(req) || '').split('.')[2].slice(0, 32); saveUsers();
      return send(res, 200, '{"ok":true}', { 'Content-Type': 'application/json' });
    }
    if (url.pathname === '/__gw/rename' && req.method === 'POST' && req.headers['x-al'] === '1') {
      if (Date.now() - (lastRename.get(me.name) || 0) < 10e3) return send(res, 429, JSON.stringify({ ok: false, err: '改得太频繁了，过几秒再试' }), { 'Content-Type': 'application/json' });
      const n = String((await readBody(req)).get('u') || '').trim(), e = nameErr(n, me);
      lastRename.set(me.name, Date.now());
      if (e) return send(res, 400, JSON.stringify({ ok: false, err: e }), { 'Content-Type': 'application/json' });
      me.display = n; saveUsers();
      return send(res, 200, JSON.stringify({ ok: true, name: n }), { 'Content-Type': 'application/json' });
    }
    // per-user emoji covers for 主页 list cards (2026-10-11): me.covers {listId: emoji}; emoji only, never images
    if (url.pathname === '/__gw/daily') return send(res, 200, JSON.stringify(await dailyFor(me)), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    if (url.pathname === '/__gw/covers' && req.method === 'GET') return send(res, 200, JSON.stringify(me.covers || {}), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    if (url.pathname === '/__gw/covers' && req.method === 'POST' && req.headers['x-al'] === '1') {
      const b = await readBody(req), id = String(b.get('id') || ''), e = String(b.get('e') || '').trim();
      const J = (c, o) => send(res, c, JSON.stringify(o), { 'Content-Type': 'application/json' });
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || id === 'love') return J(400, { ok: false, err: '无效歌单' });
      const cv = me.covers || {};
      if (!e) { delete cv[id]; me.covers = cv; saveUsers(); return J(200, { ok: true }); }
      const one = [...new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(e)].length === 1;
      if (e.length > 32 || !one || !/^[\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F\u20E3]+$/u.test(e) || !/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(e)) return J(400, { ok: false, err: '只能填一个 emoji' });
      if (!(id in cv) && Object.keys(cv).length >= 300) return J(400, { ok: false, err: '数量太多' });
      cv[id] = e; me.covers = cv; saveUsers(); return J(200, { ok: true, e });
    }
    if (url.pathname === '/__gw/register') return send(res, 302, '', { Location: '/' });
    if (url.pathname === '/__gw/status') return send(res, 200, JSON.stringify({ running: await portUp(me.port) }), { 'Content-Type': 'application/json' });
    if (url.pathname === '/__gw/notice') return send(res, 200, JSON.stringify(notice ? { title: notice.title, text: notice.text, ts: notice.ts } : null), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    if (url.pathname === '/__gw/push') return send(res, 200, JSON.stringify({ u: me.name, list: pushFor(me, +url.searchParams.get('a') || 0) }), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    if (url.pathname === '/__gw/me') return send(res, 200, JSON.stringify({ name: dn(me), role: me.role, k: me.alpw || '' }), { 'Content-Type': 'application/json' });
    if (url.pathname.startsWith('/__gw/admin')) {
      if (me.role !== 'admin') return send(res, 403, page('无权限', '<h1>仅管理员可用</h1><p><a href="/">返回</a></p>'));
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') return send(res, 405, 'method', { 'Content-Type': 'text/plain' });
      if (req.method === 'POST') {
        const b = await readBody(req), name = b.get('u') || '', pw = b.get('p') || '';
        if (req.headers['x-al'] !== '1' && !csrfOk(me, b.get('_csrf'))) return send(res, 403, page('请求无效', '<h1>请求已过期</h1><p><a href="/__gw/admin">刷新用户管理</a></p>'));
        if (url.pathname === '/__gw/admin/add') return adminPage(req, res, me, '', '请把对方的邮箱加入 Cloudflare Access 白名单，对方首次登录时会自己创建账号');
        if (url.pathname === '/__gw/admin/pw') return adminPage(req, res, me, '', '已改为 Access 登录，此功能暂停');
        if (url.pathname === '/__gw/admin/add') {
          const email = String(b.get('e') || '').trim().toLowerCase();
          if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) return adminPage(req, res, me, '', '用户名需为 3–20 位字母、数字或下划线');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return adminPage(req, res, me, '', '邮箱格式不对');
          if (users.some(x => x.name.toLowerCase() === name.toLowerCase())) return adminPage(req, res, me, '', '用户名已存在');
          if (ADMIN_EMAILS.includes(email) || users.some(x => String(x.email || '').toLowerCase() === email)) return adminPage(req, res, me, '', '这个邮箱已经绑定了用户');
          if (users.filter(x => x.role !== 'admin').length >= settings.maxUsers) return adminPage(req, res, me, '', `已达用户上限 ${settings.maxUsers} 人，可先调高上限或删除用户`);
          const port = allocPort(), alpw = crypto.randomBytes(12).toString('hex');
          users.push({ name, role: 'user', port, email, ver: 0, alpw, created: new Date().toISOString() }); saveUsers();
          await createInstance(name, port, alpw);
          touch({ name });
          const cf = await cfAllow(email, true);
          return adminPage(req, res, me, `已添加 ${name}（${email}），播放器大约 30 秒后可用${cf === true ? '，已在 Cloudflare 放行' : ''}`, cf === true ? '' : '还需在 Cloudflare Access 放行这个邮箱，他才能登录');
        }
        if (url.pathname === '/__gw/admin/del') {
          const u = users.find(x => x.name === name);
          if (!u || u.role === 'admin') return adminPage(req, res, me, '', '不能删除这个用户');
          users = users.filter(x => x !== u); saveUsers(); dropSockets(u.name); await removeInstance(u.name);
          if (u.email) await cfAllow(u.email, false);
          return adminPage(req, res, me, `已删除 ${name}`);
        }
        if (url.pathname === '/__gw/admin/kick') {
          const u = users.find(x => x.name === name);
          if (!u || u === me) return adminPage(req, res, me, '', '不能踢这个用户');
          const t = Math.floor(Date.now() / 1000) + 1; u.minIat = t; u.kicked = t; delete u.keepSig; saveUsers();
          const n = dropSockets(u.name);
          if (u.role !== 'admin') helper(['stop', u.role === 'admin' ? 'admin' : u.name]).catch(() => {});
          return adminPage(req, res, me, `已把 ${name} 踢下线${n ? `（断开 ${n} 个连接）` : ''}，他需要重新登录`);
        }
        if (url.pathname === '/__gw/admin/push') {
          const to = String(b.get('to') || '*'), mode = ['toast', 'home'].includes(b.get('mode')) ? b.get('mode') : 'modal';
          const title = String(b.get('title') || '').trim().slice(0, 40), text = String(b.get('text') || '').replace(/\r\n?/g, '\n').trim().slice(0, 500);
          if (!text) return adminPage(req, res, me, '', '请填写推送内容');
          if (to !== '*' && !users.some(x => x.name === to)) return adminPage(req, res, me, '', '找不到这个用户');
          pushes.push({ id: crypto.randomBytes(6).toString('hex'), ts: Date.now(), by: me.name, to, mode, title, text }); savePush();
          const tu = users.find(x => x.name === to);
          return adminPage(req, res, me, `已推送给${to === '*' ? '全体用户' : ' ' + dn(tu)}（${mode === 'toast' ? '右下角提示' : mode === 'home' ? '主页推送' : '弹窗提示'}）`);
        }
        if (url.pathname === '/__gw/admin/notice') {
          if (b.get('clear')) { notice = null; saveNotice(); return adminPage(req, res, me, '公告已清除'); }
          const title = String(b.get('title') || '').trim().slice(0, 40), text = String(b.get('text') || '').replace(/\r\n?/g, '\n').trim().slice(0, 2000);
          if (!text) return adminPage(req, res, me, '', '请填写公告内容（要删除公告请点“清除公告”）');
          notice = { title, text, ts: Date.now(), by: me.name }; saveNotice();
          return adminPage(req, res, me, '公告已保存，用户主页会显示新公告');
        }
        if (url.pathname === '/__gw/admin/unpush') {
          const id = String(b.get('id') || ''), n = pushes.length; pushes = pushes.filter(p => p.id !== id); savePush();
          return adminPage(req, res, me, n !== pushes.length ? '已撤回这条推送' : '', n !== pushes.length ? '' : '这条推送已不存在');
        }
        if (url.pathname === '/__gw/admin/max') {
          const m = parseInt(b.get('m'), 10);
          if (!(m >= 1 && m <= 50)) return adminPage(req, res, me, '', '用户上限需在 1–50 之间');
          settings.maxUsers = m; saveSettings();
          return adminPage(req, res, me, `已保存：普通用户上限 ${m} 人`);
        }
        if (url.pathname === '/__gw/admin/llm') {
          const j = b.get('clear') === '1' ? { clear: ['AL_LLM_API_KEY', 'AL_CLEF_ACCOUNT_ID', 'AL_CLEF_API_TOKEN'] }
            : { AL_LLM_API_KEY: String(b.get('k') || '').trim(), AL_CLEF_ACCOUNT_ID: String(b.get('ca') || '').trim().toLowerCase(), AL_CLEF_API_TOKEN: String(b.get('ct') || '').trim() };
          try { await helper(['setllm', 'admin'], JSON.stringify(j), 10000); }
          catch (e) { return adminPage(req, res, me, '', /bad AL_/.test(e.message) ? '格式不对：' + e.message.replace('bad ', '') : '保存失败'); }
          if (j.clear) return adminPage(req, res, me, '已清除大模型密钥，每日推荐回到相似歌曲算法');
          helper(['daily', me.name, 'force'], null, 180000).catch(e => console.error('daily force', me.name, e.message));
          return adminPage(req, res, me, '已保存。正在重新生成你今天的每日推荐，约 1 分钟后刷新主页查看；其他人从明天起生效');
        }
        if (url.pathname === '/__gw/admin/idle') {
          const m = parseInt(b.get('m'), 10);
          if (!(m >= 1 && m <= 1440)) return adminPage(req, res, me, '', '闲置时间需在 1–1440 分钟之间');
          settings.idleMin = m; saveSettings();
          return adminPage(req, res, me, `已保存：闲置 ${m} 分钟后自动停止`);
        }
        if (url.pathname === '/__gw/admin/pw') {
          const u = users.find(x => x.name === name);
          if (!u || pw.length < 6) return adminPage(req, res, me, '', '密码至少 6 位');
          u.hash = hash(pw); u.ver = (u.ver || 0) + 1; saveUsers();
          if (u === me) return send(res, 302, '', { Location: '/__gw/login', 'Set-Cookie': 'algw=; Path=/; Max-Age=0' });
          return adminPage(req, res, me, `已修改 ${name} 的密码，他需要重新登录`);
        }
      }
      return adminPage(req, res, me);
    }
    const nav = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
    touch(me);
    if (!(await portUp(me.port))) {
      if (nav) { ensureStarted(me); return send(res, 503, startingPage(), { 'Retry-After': '2' }); }
      return send(res, 503, 'instance sleeping', { 'Content-Type': 'text/plain' });
    }
    proxyHttp(req, res, me.port);
  } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, 'error'); }
});
const socks = new Map();
function dropSockets(name) { const s = socks.get(name); if (!s) return 0; const n = s.size; for (const x of s) x.destroy(); socks.delete(name); return n; }
server.on('upgrade', async (req, sock, head) => {
  const me = await sessionUser(req);
  if (!me) { sock.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
  touch(me);
  if (!socks.has(me.name)) socks.set(me.name, new Set()); socks.get(me.name).add(sock); sock.on('close', () => { const s = socks.get(me.name); if (s) s.delete(sock); });
  const up = net.connect(me.port, '127.0.0.1', () => {
    let h = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) h += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    up.write(h + '\r\n'); if (head && head.length) up.write(head); up.pipe(sock); sock.pipe(up);
    let acc = 0; sock.on('data', d => { acc += d.length; if (acc >= WS_ACTIVE_BYTES) { acc = 0; touch(me); } });
  });
  up.on('error', () => sock.destroy()); sock.on('error', () => up.destroy());
});
server.listen(PORT, '127.0.0.1', () => console.log('gateway on', PORT));
