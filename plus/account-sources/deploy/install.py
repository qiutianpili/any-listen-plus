#!/usr/bin/env python3
"""Install / update / remove the per-user "我的账号音源" LX script in every Any Listen instance.

Run as root on the AL server, with the target AL instances STOPPED (the gateway starts them on demand;
an instance that is running is skipped unless --force).

  install.py install [user ...]   # default: every user in the gateway users.json
  install.py remove  [user ...]
  install.py install --missing    # only users that don't have the script yet (used by the timer; also applies `drop`)
  install.py drop [user ...]      # remove dead third-party sources listed in DROP_IDS (stopped instances only)
  install.py rotate [user ...]    # new token now for stopped instances; running ones rotate at their next start
  install.py purge <user ...>     # forget a deleted user: token record + saved platform logins (gateway calls this)

The player units run `install.py install %i --force` as ExecStartPre, so every start has the user's own, current
script (and a cloned admin script / pending rotation is fixed before the player loads its sources).

Per user it:
  * ensures a random token for that user in ACC_STATE/config.json (al-accsrc reloads it automatically)
  * writes the LX script (with that token) into the user's lx-api-source-loader storage
  * puts it FIRST in importedScriptSources / sourceOrder / enabledScripts (other sources stay as fallback)
  * patches the loader main.js so errors tagged "[nocool]" don't trigger the 10-minute source demotion
Backups go to BACKUP_DIR/<user>/ before anything is changed.
"""
import hashlib, json, os, secrets, shutil, subprocess, sys, pwd

USERS_JSON = os.environ.get('AL_USERS_JSON', '/opt/al-gateway/users.json')
ADMIN_DATA = os.environ.get('AL_ADMIN_DATA', '/opt/any-listen/data')
USERS_DATA = os.environ.get('AL_USERS_DATA', '/opt/al-users/{name}/data')
ACC_STATE = os.environ.get('ACC_STATE', '/opt/al-accsrc/state')
# /int/url lives on its own localhost listener (not the one nginx proxies /al-login to)
API = os.environ.get('ACC_API', 'http://127.0.0.1:9412/int/url')
BACKUP_DIR = os.environ.get('BACKUP_DIR', '/var/backups/al-accsrc')
TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'account-source.template.js')
LOADER = 'lx-api-source-loader'
MAX_SOURCES = 10
# Dead third-party LX sources to purge from every instance (and never carry over). 2026-10-14: ikun音源
# (api.ikunshare.com no longer resolves). `drop` / the timer remove these when the instance is stopped.
DROP_IDS = {'8fd88463775867a7bd08ea7588615717'}
DROP_BACKUP_DIR = os.environ.get('DROP_BACKUP_DIR', '/var/backups/al-accsrc-drop')
COOL_OLD = 'coolUntil.set(sc.id, Date.now() + COOL);'
COOL_NEW = 'if (!/\\[nocool\\]/.test(String(error && error.message))) coolUntil.set(sc.id, Date.now() + COOL); /* al-accsrc: account-source misses (not logged in / not entitled) do not demote */'


def users():
    return json.load(open(USERS_JSON))


def data_dir(u):
    return ADMIN_DATA if u['role'] == 'admin' else USERS_DATA.format(name=u['name'])


def unit(u):
    return 'any-listen' if u['role'] == 'admin' else f"any-listen-u@{u['name']}"


def running(u):
    return subprocess.run(['systemctl', 'is-active', '--quiet', unit(u)]).returncode == 0


def script_id(name):
    return hashlib.md5(f'al-accsrc-{name}'.encode()).hexdigest()


def load_cfg():
    f = os.path.join(ACC_STATE, 'config.json')
    try:
        return json.load(open(f))
    except FileNotFoundError:
        return {'users': {}}


def save_cfg(c):
    f = os.path.join(ACC_STATE, 'config.json')
    t = f'{f}.{os.getpid()}.tmp'
    with open(t, 'w') as fh:
        json.dump(c, fh)
    os.chmod(t, 0o600)
    try:
        pw = pwd.getpwnam('alaccsrc'); os.chown(t, pw.pw_uid, pw.pw_gid)
    except KeyError:
        pass
    os.replace(t, f)


def chown_like(path, ref):
    # files belong to whoever owns the instance's data dir (each player has its own system user)
    st = os.stat(ref); os.chown(path, st.st_uid, st.st_gid)


def owner_id(u):
    # binds a token record to one gateway account (email + creation time), so a stale record is never inherited
    return hashlib.sha256(f"{u['name']}|{u.get('email', '')}|{u.get('created', '')}".encode()).hexdigest()[:16]


def wipe_logins(name):
    shutil.rmtree(os.path.join(ACC_STATE, 'users', name), ignore_errors=True)


def backup(u, paths):
    d = os.path.join(BACKUP_DIR, u['name']); os.makedirs(d, exist_ok=True)
    for p in paths:
        if os.path.exists(p):
            dst = os.path.join(d, os.path.basename(p))
            if not os.path.exists(dst):
                shutil.copy2(p, dst)


# KuGou "youth" CDN hosts (fs.youthandroid*.kugou.com) are http-only; the loader's direct-CDN rule would hand the
# browser a dead https:// link, so let AL proxy those instead.
DIRECT_OLD = 'if (/^https?:\\/\\/([\\w-]+\\.)*(music\\.126\\.net|stream\\.qqmusic\\.qq\\.com|kugou\\.com)\\//i.test(url))'
DIRECT_NEW = DIRECT_OLD[:-1] + ' && !/^https?:\\/\\/fs\\.youthandroid\\d*\\.kugou\\.com\\//i.test(url)) /* al-accsrc: http-only host -> proxy */'


def patch_loader(main_js):
    s = open(main_js, encoding='utf-8').read(); out = []
    for old, new, label in ((COOL_OLD, COOL_NEW, 'nocool'), (DIRECT_OLD, DIRECT_NEW, 'kg-youth-proxy')):
        if new in s:
            out.append(label + ' already')
        elif s.count(old) == 1:
            s = s.replace(old, new); out.append(label + ' patched')
        else:
            out.append(label + ' TARGET NOT FOUND (loader changed?) - skipped')
    open(main_js, 'w', encoding='utf-8').write(s)
    return ', '.join(out)


def install(u, force=False, missing_only=False):
    name = u['name']; dd = data_dir(u)
    base = os.path.join(dd, 'app/extension/datas', LOADER)
    if missing_only and os.path.exists(os.path.join(base, 'storage/scripts', script_id(name))):
        return None
    conf_f = os.path.join(base, 'configuration.json')
    ext = [x for x in os.listdir(os.path.join(dd, 'app/extension/ext')) if x.startswith(LOADER + '_')]
    main_js = os.path.join(dd, 'app/extension/ext', sorted(ext)[-1], 'main.js') if ext else None
    if running(u) and not force:
        return f'{name}: instance running - skipped (stop it or use --force)'
    if not os.path.exists(conf_f):
        return f'{name}: no loader configuration - skipped'
    backup(u, [conf_f] + ([main_js] if main_js else []))
    cfg = load_cfg(); uc = cfg['users'].setdefault(name, {})
    oid = owner_id(u); note = ''
    if uc.get('owner') and uc['owner'] != oid:  # record left over from a deleted account with the same id
        uc.clear(); wipe_logins(name); note = ' (stale record reset)'
    if uc.pop('rotate', False) or not isinstance(uc.get('token'), str) or len(uc['token']) != 48:
        uc['token'] = secrets.token_hex(24); note += ' (token rotated)'
    uc['owner'] = oid; uc.setdefault('enabled', True); uc.setdefault('shareFromAdmin', False)
    save_cfg(cfg)
    sid = script_id(name)
    raw = open(TEMPLATE, encoding='utf-8').read().replace('__TOKEN__', uc['token']).replace('__API__', API)
    sdir = os.path.join(base, 'storage/scripts'); os.makedirs(sdir, exist_ok=True)
    sf = os.path.join(sdir, sid)
    open(sf, 'w', encoding='utf-8').write(raw); os.chmod(sf, 0o600); chown_like(sf, dd)
    c = json.load(open(conf_f, encoding='utf-8'))
    info = {'id': sid, 'name': '我的账号音源', 'description': '用你自己扫码登录的网易云/QQ/酷狗账号取播放链接（在 /al-login/ 登录）',
            'version': '1.0.0', 'author': 'any-listen-plus', 'homepage': '', 'allowShowUpdateAlert': False,
            'fileName': 'account-source.js', 'fileDesc': '[1.0.0] 我的账号音源（扫码登录：/al-login/）'}
    # also drop DROP_IDS and any OTHER user's "我的账号音源" copy (new instances are cloned from admin's extension dir,
    # which would otherwise carry admin's token)
    gone = {x.get('id') for x in c.get('importedScriptSources', [])
            if x.get('id') in DROP_IDS or (x.get('fileName') == 'account-source.js' and x.get('id') != sid)}
    for g in gone:
        try:
            os.remove(os.path.join(sdir, g))
        except FileNotFoundError:
            pass
    srcs = [x for x in c.get('importedScriptSources', []) if x.get('id') != sid and x.get('id') not in gone]
    for k in ('sourceOrder', 'enabledScripts'):
        if k in c:
            c[k] = [x for x in c[k] if x not in gone]
    if len(srcs) >= MAX_SOURCES:
        return f'{name}: already {len(srcs)} sources (max {MAX_SOURCES}) - remove one first'
    c['importedScriptSources'] = [info] + srcs
    c['sourceOrder'] = [sid] + [x for x in c.get('sourceOrder', [s['id'] for s in srcs]) if x != sid]
    c['enabledScripts'] = [sid] + [x for x in c.get('enabledScripts', []) if x != sid]
    t = f'{conf_f}.{os.getpid()}.tmp'
    json.dump(c, open(t, 'w', encoding='utf-8'), ensure_ascii=False, indent='\t'); os.chmod(t, 0o600); chown_like(t, dd); os.replace(t, conf_f)
    lp = patch_loader(main_js) if main_js else 'no main.js'
    for dn in os.listdir(os.path.join(dd, 'app/extension/datas')):  # extension logs: owner-only
        lf = os.path.join(dd, 'app/extension/datas', dn, 'output.log')
        if os.path.isfile(lf):
            os.chmod(lf, 0o600)
    return f'{name}: installed script {sid} first of {len(c["importedScriptSources"])}; loader {lp}{note}'


def rotate(u, force=False):
    name = u['name']; cfg = load_cfg(); uc = cfg['users'].get(name)
    if not uc:
        return f'{name}: no record'
    if running(u) and not force:
        uc['rotate'] = True; save_cfg(cfg)
        return f'{name}: running - token rotates at next start'
    uc['rotate'] = True; save_cfg(cfg)
    return install(u, force=True)


def purge(name):
    cfg = load_cfg(); had = cfg['users'].pop(name, None) is not None
    save_cfg(cfg); wipe_logins(name)
    return f'{name}: purged' + ('' if had else ' (no record)')


def remove(u, force=False):
    name = u['name']; dd = data_dir(u)
    base = os.path.join(dd, 'app/extension/datas', LOADER); conf_f = os.path.join(base, 'configuration.json')
    if running(u) and not force:
        return f'{name}: instance running - skipped'
    if not os.path.exists(conf_f):
        return f'{name}: no loader configuration'
    backup(u, [conf_f]); sid = script_id(name)
    c = json.load(open(conf_f, encoding='utf-8'))
    c['importedScriptSources'] = [x for x in c.get('importedScriptSources', []) if x.get('id') != sid]
    for k in ('sourceOrder', 'enabledScripts'):
        c[k] = [x for x in c.get(k, []) if x != sid]
    t = f'{conf_f}.{os.getpid()}.tmp'; json.dump(c, open(t, 'w', encoding='utf-8'), ensure_ascii=False, indent='\t'); os.chmod(t, 0o600); chown_like(t, dd); os.replace(t, conf_f)
    try:
        os.remove(os.path.join(base, 'storage/scripts', sid))
    except FileNotFoundError:
        pass
    return f'{name}: removed (loader patch left in place; it is inert without the script)'


def drop(u, force=False):
    name = u['name']; dd = data_dir(u)
    base = os.path.join(dd, 'app/extension/datas', LOADER); conf_f = os.path.join(base, 'configuration.json')
    if not os.path.exists(conf_f):
        return None
    c = json.load(open(conf_f, encoding='utf-8'))
    have = {x.get('id') for x in c.get('importedScriptSources', [])} | set(c.get('sourceOrder', [])) | set(c.get('enabledScripts', []))
    sdir = os.path.join(base, 'storage/scripts')
    files = [g for g in DROP_IDS if os.path.exists(os.path.join(sdir, g))]
    if not (have & DROP_IDS) and not files:
        return None
    if running(u) and not force:
        return f'{name}: drop pending (instance running - will retry when stopped)'
    d = os.path.join(DROP_BACKUP_DIR, name); os.makedirs(d, exist_ok=True)
    for p in [conf_f] + [os.path.join(sdir, g) for g in files]:
        dst = os.path.join(d, os.path.basename(p))
        if not os.path.exists(dst):
            shutil.copy2(p, dst)
    c['importedScriptSources'] = [x for x in c.get('importedScriptSources', []) if x.get('id') not in DROP_IDS]
    for k in ('sourceOrder', 'enabledScripts'):
        c[k] = [x for x in c.get(k, []) if x not in DROP_IDS]
    t = f'{conf_f}.{os.getpid()}.tmp'; json.dump(c, open(t, 'w', encoding='utf-8'), ensure_ascii=False, indent='\t'); os.chmod(t, 0o600); chown_like(t, dd); os.replace(t, conf_f)
    for g in files:
        os.remove(os.path.join(sdir, g))
    return f'{name}: dropped {sorted(have & DROP_IDS) or files}; now {len(c["importedScriptSources"])} sources'


if __name__ == '__main__':
    import fcntl
    # players start in parallel (ExecStartPre): serialize all read-modify-write of config.json
    _lock = open('/run/lock/al-accsrc-install.lock', 'w'); fcntl.flock(_lock, fcntl.LOCK_EX)
    a = [x for x in sys.argv[1:] if not x.startswith('--')]; force = '--force' in sys.argv
    if not a or a[0] not in ('install', 'remove', 'drop', 'rotate', 'purge'):
        print(__doc__); sys.exit(1)
    want = set(a[1:]); missing = '--missing' in sys.argv
    if a[0] == 'purge':
        for n in a[1:]:
            if n and n.replace('_', '').replace('-', '').isalnum() and not n.startswith('_'):
                print(purge(n))
        sys.exit(0)
    for u in users():
        if want and u['name'] not in want:
            continue
        if a[0] == 'drop':
            r = drop(u, force)
        elif a[0] == 'rotate':
            r = rotate(u, force)
        elif a[0] == 'install':
            r = install(u, force, missing)
            if missing:
                r2 = drop(u, force)
                r = '; '.join(x for x in (r, r2) if x)
        else:
            r = remove(u, force)
        if r:
            print(r)
