#!/usr/bin/env python3
"""Install / update / remove the per-user "我的账号音源" LX script in every Any Listen instance.

Run as root on the AL server, with the target AL instances STOPPED (the gateway starts them on demand;
an instance that is running is skipped unless --force).

  install.py install [user ...]   # default: every user in the gateway users.json
  install.py remove  [user ...]
  install.py install --missing    # only users that don't have the script yet (used by the timer)

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
API = os.environ.get('ACC_API', 'http://127.0.0.1:9410/int/url')
BACKUP_DIR = os.environ.get('BACKUP_DIR', '/var/backups/al-accsrc')
TEMPLATE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'account-source.template.js')
LOADER = 'lx-api-source-loader'
MAX_SOURCES = 10
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
    t = f + '.tmp'
    with open(t, 'w') as fh:
        json.dump(c, fh)
    os.chmod(t, 0o600)
    try:
        pw = pwd.getpwnam('alaccsrc'); os.chown(t, pw.pw_uid, pw.pw_gid)
    except KeyError:
        pass
    os.replace(t, f)


def chown_al(path):
    pw = pwd.getpwnam('anylisten'); os.chown(path, pw.pw_uid, pw.pw_gid)


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
    uc.setdefault('token', secrets.token_hex(24)); uc.setdefault('enabled', True); uc.setdefault('shareFromAdmin', False)
    save_cfg(cfg)
    sid = script_id(name)
    raw = open(TEMPLATE, encoding='utf-8').read().replace('__TOKEN__', uc['token']).replace('__API__', API)
    sdir = os.path.join(base, 'storage/scripts'); os.makedirs(sdir, exist_ok=True)
    sf = os.path.join(sdir, sid)
    open(sf, 'w', encoding='utf-8').write(raw); os.chmod(sf, 0o640); chown_al(sf)
    c = json.load(open(conf_f, encoding='utf-8'))
    info = {'id': sid, 'name': '我的账号音源', 'description': '用你自己扫码登录的网易云/QQ/酷狗账号取播放链接（在 /al-login/ 登录）',
            'version': '1.0.0', 'author': 'any-listen-plus', 'homepage': '', 'allowShowUpdateAlert': False,
            'fileName': 'account-source.js', 'fileDesc': '[1.0.0] 我的账号音源（扫码登录：/al-login/）'}
    srcs = [x for x in c.get('importedScriptSources', []) if x.get('id') != sid]
    if len(srcs) >= MAX_SOURCES:
        return f'{name}: already {len(srcs)} sources (max {MAX_SOURCES}) - remove one first'
    c['importedScriptSources'] = [info] + srcs
    c['sourceOrder'] = [sid] + [x for x in c.get('sourceOrder', [s['id'] for s in srcs]) if x != sid]
    c['enabledScripts'] = [sid] + [x for x in c.get('enabledScripts', []) if x != sid]
    t = conf_f + '.tmp'
    json.dump(c, open(t, 'w', encoding='utf-8'), ensure_ascii=False, indent='\t'); chown_al(t); os.replace(t, conf_f)
    lp = patch_loader(main_js) if main_js else 'no main.js'
    return f'{name}: installed script {sid} first of {len(c["importedScriptSources"])}; loader {lp}'


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
    t = conf_f + '.tmp'; json.dump(c, open(t, 'w', encoding='utf-8'), ensure_ascii=False, indent='\t'); chown_al(t); os.replace(t, conf_f)
    try:
        os.remove(os.path.join(base, 'storage/scripts', sid))
    except FileNotFoundError:
        pass
    return f'{name}: removed (loader patch left in place; it is inert without the script)'


if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]; force = '--force' in sys.argv
    if not a or a[0] not in ('install', 'remove'):
        print(__doc__); sys.exit(1)
    want = set(a[1:]); missing = '--missing' in sys.argv
    for u in users():
        if want and u['name'] not in want:
            continue
        r = install(u, force, missing) if a[0] == 'install' else remove(u, force)
        if r:
            print(r)
