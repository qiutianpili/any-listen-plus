#!/usr/bin/env python3
# 每日推荐 (2026-10-12): per user, 30 songs from QQ Music "similar songs" seeded by play history + own lists.
# Skips users not seen for 7 days. Writes /opt/al-gateway/daily/<name>.json {date, ts, list:[Any Listen music items]}.
# usage: daily.py            -> all users
#        daily.py --user X --active -> one user who is online now (gateway calls this when there is no list for today yet)
import json, os, random, re, sqlite3, sys, time, unicodedata, urllib.request, datetime
from concurrent.futures import ThreadPoolExecutor

DIR = '/opt/al-gateway'; OUT = DIR + '/daily'; SEEN = DIR + '/seen.json'
UROOT = '/opt/al-users'; ADMIN_DATA = '/opt/any-listen/data'
N = 30; INACTIVE = 7 * 86400; PER_ARTIST = 3
TZ = datetime.timezone(datetime.timedelta(hours=8))
H = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://y.qq.com', 'Content-Type': 'application/json'}
BAD = re.compile(r'伴奏|inst(rumental)?\b|karaoke|铃声|片段|dj版|\bdj\b|纯音乐|翻自|cover|0\.\dx|加速版|降速版|慢速版', re.I)

def log(*a): sys.stderr.write(' '.join(str(x) for x in a) + '\n')

def qq(module, method, param):
    body = json.dumps({'comm': {'ct': 24, 'cv': 0}, 'req': {'module': module, 'method': method, 'param': param}}).encode()
    for i in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://u.y.qq.com/cgi-bin/musicu.fcg', body, H), timeout=12) as r:
                d = json.loads(r.read())
            if d.get('code') == 0 and (d.get('req') or {}).get('code') == 0: return d['req'].get('data') or {}
        except Exception as e:
            log('qq err', method, e)
        time.sleep(2 + 2 * i)
    return None

def norm(s):
    s = unicodedata.normalize('NFKC', s or '').lower()
    s = re.sub(r'\s*[\(（\[【][^\)）\]】]*[\)）\]】]', '', s) or s
    return re.sub(r"[\s'’\"“”.,!！?？、:：\-_~·]", '', s)

def size_str(b): return '%.2f MB' % (b / 1024 / 1024) if b else None
def interval(sec): sec = int(sec or 0); return '%02d:%02d' % (sec // 60, sec % 60)

def item(t):
    f = t.get('file') or {}; al = t.get('album') or {}
    q = {}
    for k, key in (('128k', 'size_128mp3'), ('320k', 'size_320mp3'), ('flac', 'size_flac'), ('flac24bit', 'size_hires')):
        if f.get(key): q[k] = {'sizeStr': size_str(f[key])}
    name = t.get('title') or t.get('name')
    return {'id': 'tx_%s' % t['mid'], 'name': name, 'singer': '、'.join(a['name'] for a in t.get('singer') or []),
            'interval': interval(t.get('interval')), 'isLocal': False,
            'meta': {'albumName': al.get('name') or '', 'source': 'tx', 'musicId': t['mid'], 'qualitys': q,
                     'createTime': 0, 'posTime': 0, 'updateTime': 0, 'albumId': al.get('mid') or '',
                     'songId': str(t.get('id')), 'albumMid': al.get('mid') or '', 'strMediaMid': f.get('media_mid') or '',
                     'picUrl': ('https://y.gtimg.cn/music/photo_new/T002R500x500M000%s.jpg' % al['mid']) if al.get('mid') else None}}

def playable(t):
    f = t.get('file') or {}
    return f.get('media_mid') and (f.get('size_128mp3') or f.get('size_320mp3')) and not BAD.search((t.get('title') or '') + ' ' + (t.get('subtitle') or ''))

def tx_songid(name, singer):
    d = qq('music.search.SearchCgiService', 'DoSearchForQQMusicDesktop', {'grp': 1, 'num_per_page': 8, 'page_num': 1, 'query': '%s %s' % (singer, name), 'search_type': 0})
    if not d: return None
    want = {norm(x) for x in re.split(r'[、&/,，]', singer) if norm(x)}
    for s in (((d.get('body') or {}).get('song') or {}).get('list') or []):
        if norm(s.get('title') or s.get('name')) == norm(name) and want & {norm(a['name']) for a in s.get('singer') or []}:
            return s.get('id')
    return None

def db_path(name, role):
    return (ADMIN_DATA if role == 'admin' else os.path.join(UROOT, name, 'data')) + '/app/anylisten.data.db'

def last_seen(u):
    try: seen = json.load(open(SEEN)).get(u['name'], 0) / 1000
    except Exception: seen = 0
    d = os.path.dirname(db_path(u['name'], u.get('role')))
    for f in ('play_time', 'anylisten.data.db', 'config.json'):
        try: seen = max(seen, os.path.getmtime(os.path.join(d, f)))
        except OSError: pass
    return seen

def read_lists(path):
    # open as the db owner: a WAL read may create -shm/-wal, and root-owned ones would stop the instance from opening its db
    st = os.stat(path); swap = os.geteuid() == 0 and st.st_uid != 0
    if swap: os.setegid(st.st_gid); os.seteuid(st.st_uid)
    try: return _read_lists(path)
    finally:
        if swap: os.seteuid(0); os.setegid(0)

def _read_lists(path):
    c = sqlite3.connect('file:%s?mode=ro' % path, uri=True, timeout=10)
    lists = {r[0]: (r[1], r[2]) for r in c.execute('select id,name,type from my_list')}
    rows = c.execute('select o.list_id,m.id,m.name,m.singer,m.meta from my_list_music_info_order o join my_list_music_info m on m.id=o.music_id and m.list_id=o.list_id order by o.list_id,o."order"').fetchall()
    c.close()
    by = {}
    for lid, mid, name, singer, meta in rows:
        try: meta = json.loads(meta or '{}')
        except Exception: meta = {}
        by.setdefault(lid, []).append({'id': mid, 'name': name, 'singer': singer, 'meta': meta})
    daily = [lid for lid, (n, t) in lists.items() if n == '每日推荐']
    return by, daily

def make(u, rnd):
    path = db_path(u['name'], u.get('role'))
    if not os.path.exists(path): return None
    by, daily = read_lists(path)
    hist = by.get('last_played', [])[:60]
    others = [m for lid, ms in by.items() if lid not in ('last_played', 'default') and lid not in daily for m in ms]
    if not hist and not others: return []
    owned_ids = {m['id'] for lid, ms in by.items() if lid not in daily for m in ms}
    owned_key = {norm(m['name']) + '|' + norm((m['singer'] or '').split('、')[0]) for lid, ms in by.items() if lid not in daily for m in ms}
    # yesterday's picks are avoided too, so the list changes every day
    try: prev = {m['id'] for m in json.load(open(os.path.join(OUT, u['name'] + '.json')))['list']}
    except Exception: prev = set()
    seeds = rnd.sample(hist[:20], min(6, len(hist[:20]))) + rnd.sample(hist[20:], min(2, len(hist[20:])))
    pool = [m for m in others if m['id'] not in {s['id'] for s in seeds}]
    seeds += rnd.sample(pool, min(12 - len(seeds), len(pool)))
    seen_seed = set(); uniq = []
    for i, s in enumerate(seeds):
        k = norm(s['name']) + '|' + norm(s['singer'])
        if k in seen_seed: continue
        seen_seed.add(k)
        uniq.append((i, s))

    def _fetch(arg):
        # worker thread: network I/O only, no shared state touched
        i, s = arg
        try:
            sid = s['meta'].get('songId') if s['meta'].get('source') == 'tx' else None
            if not sid: sid = tx_songid(s['name'], s['singer'] or '')
            if not sid: return (i, [])
            d = qq('music.recommend.TrackRelationServer', 'GetSimilarSongs', {'songid': int(sid), 'num': 30})
            time.sleep(0.6)
            tracks = []
            for v in (d or {}).get('vecSong') or []:
                t = v.get('track') or {}
                if not t.get('mid') or not playable(t) or len(t.get('singer') or []) > 5: continue
                tracks.append(t)
            return (i, tracks)
        except Exception as e:
            log('seed err', s.get('name'), e)
            return (i, [])

    # parallelize the QQ API calls (I/O bound); merge in seed order so scoring stays deterministic
    with ThreadPoolExecutor(max_workers=4) as ex:
        results = list(ex.map(_fetch, uniq))
    cand = {}; order = []
    for i, tracks in sorted(results, key=lambda r: r[0]):
        for t in tracks:
            it = item(t); key = norm(it['name']) + '|' + norm(it['singer'].split('、')[0])
            if it['id'] in owned_ids or key in owned_key: continue
            if it['id'] not in cand: cand[it['id']] = [0, it, key]; order.append(it['id'])
            cand[it['id']][0] += 1 + (0.5 if i < 8 else 0)
    ranked = sorted(order, key=lambda x: (-(cand[x][0] - (1.5 if x in prev else 0)) - rnd.random() * 0.9))
    out, per, keys = [], {}, set()
    for x in ranked:
        sc, it, key = cand[x]; a = norm(it['singer'].split('、')[0])
        if key in keys or per.get(a, 0) >= PER_ARTIST: continue
        keys.add(key); per[a] = per.get(a, 0) + 1; out.append(it)
        if len(out) >= N: break
    return out

def run(users, force=False, active=False):
    os.makedirs(OUT, exist_ok=True)
    today = datetime.datetime.now(TZ).strftime('%Y-%m-%d')
    for u in users:
        f = os.path.join(OUT, u['name'] + '.json')
        try:
            if not force and json.load(open(f)).get('date') == today: continue
        except Exception: pass
        if not active and time.time() - last_seen(u) > INACTIVE:
            log('skip inactive', u['name']); continue
        rnd = random.Random('%s|%s' % (u['name'], today))
        try: lst = make(u, rnd)
        except Exception as e:
            log('fail', u['name'], e); continue
        if lst is None: continue
        tmp = f + '.tmp'
        json.dump({'date': today, 'ts': int(time.time() * 1000), 'list': lst}, open(tmp, 'w'), ensure_ascii=False)
        os.chmod(tmp, 0o640); os.replace(tmp, f)
        log('ok', u['name'], len(lst))

if __name__ == '__main__':
    users = json.load(open(DIR + '/users.json'))
    force = '--force' in sys.argv
    if '--user' in sys.argv:
        n = sys.argv[sys.argv.index('--user') + 1]; users = [u for u in users if u['name'] == n]
    run(users, force, '--active' in sys.argv)
