#!/usr/bin/env python3
# 每日推荐 (2026-10-12): per user, 30 songs from QQ Music "similar songs" seeded by play history + own lists.
# Skips users not seen for 7 days. Writes /opt/al-gateway/daily/<name>.json {date, ts, list:[Any Listen music items]}.
# Generation (2026-10-20): with AL_LLM_API_KEY set, candidates are proposed by an LLM (OpenAI-compatible chat API;
# AL_LLM_BASE_URL / AL_LLM_MODEL, default DeepSeek "deepseek-flash") from the user's taste profile, then resolved to
# real QQ tracks via search. The similar-songs path below only tops up when the LLM yields < AL_LLM_MIN (25) usable
# songs, and is the full fallback when the LLM is off or fails.
# Optional (2026-10-20): with AL_CLEF_ACCOUNT_ID + AL_CLEF_API_TOKEN set, top heuristic candidates are also scored by
# Clef-flash (Workers AI) against the user's taste profile and blended in (AL_CLEF_WEIGHT, default 2); any failure
# silently falls back to the plain heuristic ranking, so recommendations are produced either way.
# usage: daily.py            -> all users
#        daily.py --user X --active -> one user who is online now (gateway calls this when there is no list for today yet)
import json, os, random, re, sqlite3, sys, time, unicodedata, urllib.request, datetime
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

DIR = '/opt/al-gateway'; OUT = DIR + '/daily'; SEEN = DIR + '/seen.json'
UROOT = '/opt/al-users'; ADMIN_DATA = '/opt/any-listen/data'
N = 30; INACTIVE = 7 * 86400; PER_ARTIST = 3
TZ = datetime.timezone(datetime.timedelta(hours=8))
H = {'User-Agent': 'Mozilla/5.0', 'Referer': 'https://y.qq.com', 'Content-Type': 'application/json'}
BAD = re.compile(r'伴奏|inst(rumental)?\b|karaoke|铃声|片段|dj版|\bdj\b|纯音乐|翻自|cover|0\.\dx|加速版|降速版|慢速版', re.I)

def log(*a): sys.stderr.write(' '.join(str(x) for x in a) + '\n')

# Keys live in /etc/al-daily.env (root 600, written by the gateway admin page via helper.js setllm). Read here so both
# the systemd timer and the gateway's sudo'd on-demand run (sudo resets the environment) see them (2026-10-20).
ENV_FILE = '/etc/al-daily.env'
def _load_env():
    try:
        for ln in open(ENV_FILE, encoding='utf-8'):
            ln = ln.strip()
            if not ln or ln.startswith('#') or '=' not in ln: continue
            k, v = ln.split('=', 1); k = k.strip()
            if re.fullmatch(r'AL_[A-Z_]+', k) and k not in os.environ: os.environ[k] = v.strip()
    except OSError: pass
_load_env()

# on-demand runs (--active, started by the gateway while the user waits) get fewer/shorter retries and a hard
# overall budget so the gateway's 180 s kill never lands mid-run (2026-10-19)
ACTIVE = '--active' in sys.argv; DEADLINE = time.time() + (120 if ACTIVE else 10 ** 9)
# the LLM may use the budget only up to this point: the similar-songs fallback keeps ~55 s (active runs)
LLM_DEADLINE = DEADLINE - (55 if ACTIVE else 0)

def _env_num(name, default, cast):
    try: return cast(os.environ.get(name, ''))
    except Exception: return default

CLEF_TOPK = max(1, min(64, _env_num('AL_CLEF_TOPK', 48, int)))  # Workers AI caps a request at 64 questions
CLEF_W = _env_num('AL_CLEF_WEIGHT', 2.0, float)
CLEF_TIMEOUT = _env_num('AL_CLEF_TIMEOUT', 20, int)
LLM_MIN = _env_num('AL_LLM_MIN', 25, int)  # usable LLM songs needed before the similar-songs path is skipped entirely
def qq(module, method, param):
    if time.time() > DEADLINE: return None
    body = json.dumps({'comm': {'ct': 24, 'cv': 0}, 'req': {'module': module, 'method': method, 'param': param}}).encode()
    for i in range(2 if ACTIVE else 3):
        if time.time() > DEADLINE: return None
        try:
            with urllib.request.urlopen(urllib.request.Request('https://u.y.qq.com/cgi-bin/musicu.fcg', body, H), timeout=8 if ACTIVE else 12) as r:
                d = json.loads(r.read())
            if d.get('code') == 0 and (d.get('req') or {}).get('code') == 0: return d['req'].get('data') or {}
        except Exception as e:
            log('qq err', method, e)
        time.sleep(1 if ACTIVE else 2 + 2 * i)
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

def tx_lookup(name, singer):
    # first QQ search hit whose title matches exactly and whose singers overlap; the entry doubles as a track dict
    d = qq('music.search.SearchCgiService', 'DoSearchForQQMusicDesktop', {'grp': 1, 'num_per_page': 8, 'page_num': 1, 'query': '%s %s' % (singer, name), 'search_type': 0})
    if not d: return None
    want = {norm(x) for x in re.split(r'[、&/,，]', singer) if norm(x)}
    for s in (((d.get('body') or {}).get('song') or {}).get('list') or []):
        if norm(s.get('title') or s.get('name')) == norm(name) and want & {norm(a['name']) for a in s.get('singer') or []}:
            return s
    return None

def tx_songid(name, singer):
    s = tx_lookup(name, singer)
    return s.get('id') if s else None

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

def taste_state(hist, others):
    recent = ['%s - %s' % (m['name'], m['singer']) for m in hist[:25] if m.get('name')]
    top = [a for a, _ in Counter((m['singer'] or '').split('、')[0] for m in others if m.get('singer')).most_common(15) if a]
    parts = ['Listening profile of a music app user. Judge each candidate song by artist, style and mood similarity to this profile.']
    if recent: parts.append('Recently played: ' + '; '.join(recent))
    if top: parts.append("Artists in the user's own playlists: " + ', '.join(top))
    return '\n'.join(parts)

def clef_scores(u, hist, others, items):
    # Clef-flash (Workers AI) P(user enjoys this song) per candidate item; {} on any problem -> caller keeps heuristic order
    acct, tok = os.environ.get('AL_CLEF_ACCOUNT_ID'), os.environ.get('AL_CLEF_API_TOKEN')
    if not acct or not tok or not items or time.time() > DEADLINE: return {}
    qs = {}
    for i, it in enumerate(items):
        qs['q%d' % i] = {'type': 'noul', 'instructions': "Would this user enjoy the song '%s' by %s (album: %s)?" % (it['name'], it['singer'], it['meta'].get('albumName') or 'unknown')}
    body = json.dumps({'model': 'clef-flash', 'state': taste_state(hist, others), 'questions': qs}).encode()
    req = urllib.request.Request('https://api.cloudflare.com/client/v4/accounts/%s/ai/run/@cf/cloudflare/clef-flash' % acct, body,
                                 {'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=min(CLEF_TIMEOUT, max(1, int(DEADLINE - time.time())))) as r: d = json.loads(r.read())
    except Exception as e:
        log('clef err', u['name'], e); return {}
    if not d.get('success'):
        log('clef err', u['name'], d.get('errors')); return {}
    ans = (d.get('result') or {}).get('answers') or {}
    out = {}
    for i, it in enumerate(items):
        v = (ans.get('q%d' % i) or {}).get('noul')
        if isinstance(v, (int, float)) and 0 <= v <= 1: out[it['id']] = float(v)
    log('clef scored', u['name'], len(out), 'of', len(items))
    return out

ANGLES = ['late-night solitude', 'commuting', 'working out', 'deep focus', 'nostalgia', 'light and upbeat', 'rainy day', 'before sleep']

def llm_picks(u, hist, others, exclude, n):
    # one OpenAI-compatible chat call -> [{'name','singer'}]; [] on any problem (bad JSON included)
    key = os.environ.get('AL_LLM_API_KEY')
    if not key: return []
    url = os.environ.get('AL_LLM_BASE_URL', 'https://api.deepseek.com').rstrip('/') + '/chat/completions'
    prompt = (taste_state(hist, others) + '\n\nRecommend %d songs this user is likely to enjoy, with a "%s" mood angle. '
              'Rules: real, existing songs only; do not repeat any song named in the profile above or here: %s; '
              'at most 3 songs per artist; about 70%% close to the profile taste and 30%% adjacent discoveries in similar styles; '
              'original versions only (no covers, remixes, instrumentals, karaoke or sped-up versions). '
              'Reply with JSON only: {"songs": [{"name": "...", "singer": "..."}]}'
              % (n, random.choice(ANGLES), '; '.join(exclude[:80]) or 'none'))
    # thinking off: DeepSeek turns it on by default (slow, and temperature is ignored there)
    body = json.dumps({'model': os.environ.get('AL_LLM_MODEL', 'deepseek-flash'), 'temperature': 0.7,
                       'thinking': {'type': 'disabled'}, 'max_tokens': 4000,
                       'response_format': {'type': 'json_object'},
                       'messages': [{'role': 'system', 'content': 'You are a music recommendation engine. Output valid JSON only.'},
                                    {'role': 'user', 'content': prompt}]}).encode()
    req = urllib.request.Request(url, body, {'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'})
    for i in range(2):
        left = int(LLM_DEADLINE - time.time())
        if left < 5: return []
        try:
            with urllib.request.urlopen(req, timeout=min(_env_num('AL_LLM_TIMEOUT', 25, int), left)) as r: d = json.loads(r.read())
            txt = d['choices'][0]['message']['content']
            songs = json.loads(txt[txt.find('{'):txt.rfind('}') + 1]).get('songs') or []
            out = [{'name': str(s['name']), 'singer': str(s['singer'])} for s in songs if isinstance(s, dict) and s.get('name') and s.get('singer')]
            log('llm picks', u['name'], len(out))
            return out
        except Exception as e:
            log('llm err', u['name'], e)
    return []

def llm_cand(u, hist, others, owned_ids, owned_key):
    # LLM picks resolved to real tracks via QQ search; heuristic score = LLM rank (top pick 3.0 -> last ~0)
    cand, order, tried = {}, [], set()
    base_exclude = [m['name'] for m in hist[:25]] + [m['name'] for m in others[:60]]
    for rnd_i in range(2):
        if time.time() > LLM_DEADLINE - 10: break
        picks = llm_picks(u, hist, others, base_exclude + [cand[x][1]['name'] for x in order], 50 if rnd_i == 0 else 30)
        fresh = []
        for p in picks:
            k = norm(p['name']) + '|' + norm(p['singer'])
            if k in tried: continue
            tried.add(k); fresh.append(p)
        if not fresh: break
        with ThreadPoolExecutor(max_workers=4) as ex:
            tracks = list(ex.map(lambda p: tx_lookup(p['name'], p['singer']), fresh))
        for t in tracks:
            if not t or not t.get('mid') or not playable(t) or len(t.get('singer') or []) > 5: continue
            it = item(t); key = norm(it['name']) + '|' + norm(it['singer'].split('、')[0])
            if it['id'] in owned_ids or key in owned_key or it['id'] in cand: continue
            cand[it['id']] = [0, it, key]; order.append(it['id'])
        log('llm resolved', u['name'], len(order))
        if len(order) >= LLM_MIN: break
    total = len(order)
    for rank, x in enumerate(order): cand[x][0] = (total - rank) / total * 3 if total else 0
    return cand, order

def _similar_cand(u, rnd, hist, others, owned_ids, owned_key):
    # original candidate source: QQ "similar songs" per seed taken from play history + own lists
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
    return cand, order

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
    cand, order = {}, []
    if os.environ.get('AL_LLM_API_KEY'):
        cand, order = llm_cand(u, hist, others, owned_ids, owned_key)
    if len(order) < LLM_MIN:
        sc, so = _similar_cand(u, rnd, hist, others, owned_ids, owned_key)
        if not order:
            cand, order = sc, so
        elif so:
            # LLM picks stay primary: similar-songs candidates join at half their heuristic score
            for x in so:
                if x not in cand: cand[x] = [sc[x][0] * 0.5, sc[x][1], sc[x][2]]; order.append(x)
            log('llm top-up from similar', u['name'], len(order))
    heur = {x: cand[x][0] - (1.5 if x in prev else 0) for x in order}
    top = sorted(order, key=lambda x: -heur[x])[:CLEF_TOPK]
    probs = clef_scores(u, hist, others, [cand[x][1] for x in top])
    ranked = sorted(order, key=lambda x: -(heur[x] + CLEF_W * probs.get(x, 0)) - rnd.random() * 0.9)
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
        if not lst:
            # never save an empty list: it would stand for the whole day; the next open/timer run retries
            log('empty', u['name']); continue
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
