import difflib,json,re,hashlib,sys
out={}
# main.js = data/app/extension/ext/lx-api-source-loader_0.1.7/main.js
for f in ['indexBzjGy48v.js','app.js','extension-service.worker.js','main.js']:
    a=open('o/'+f,encoding='utf-8').read(); b=open('n/'+f,encoding='utf-8').read()
    sp=lambda s: re.findall(r'[^;{}\n]*[;{}\n]|[^;{}\n]+$',s)
    A,B=sp(a),sp(b); assert ''.join(A)==a and ''.join(B)==b
    sm=difflib.SequenceMatcher(None,A,B,autojunk=False)
    hunks=[]
    pos=[0]
    for x in A: pos.append(pos[-1]+len(x))
    for tag,i1,i2,j1,j2 in sm.get_opcodes():
        if tag=='equal': continue
        s,e=pos[i1],pos[i2]; rep=''.join(B[j1:j2])
        # widen context until unique
        c=20
        while True:
            fs=max(0,s-c); fe=min(len(a),e+c)
            find=a[fs:fe]
            if a.count(find)==1: break
            c*=2
        if hunks and fs<=hunks[-1][1]:
            p=hunks[-1]; hunks[-1]=[p[0],max(p[1],fe),p[2]+[(s,e,rep)]]
        else: hunks.append([fs,fe,[(s,e,rep)]])
    H=[]
    for fs,fe,subs in hunks:
        rr='';cur=fs
        for s,e,rep in subs: rr+=a[cur:s]+rep;cur=e
        rr+=a[cur:fe]; find=a[fs:fe]; assert a.count(find)==1
        H.append({'find':find,'replace':rr})
    hunks=H
    r='';cur=0
    for h in hunks:
        i=a.index(h['find']); r+=a[cur:i]+h['replace']; cur=i+len(h['find'])
    r+=a[cur:]
    assert r==b,f
    out[f]={'sha256_original':hashlib.sha256(a.encode()).hexdigest(),'sha256_patched':hashlib.sha256(b.encode()).hexdigest(),'hunks':hunks}
    print(f,len(hunks),sum(len(h['replace']) for h in hunks))
out['lx-api-source-loader_0.1.7/main.js']=out.pop('main.js')
json.dump(out,open('patches.json','w',encoding='utf-8'),ensure_ascii=False,indent=1)
