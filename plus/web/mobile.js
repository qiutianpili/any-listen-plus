/* WebView compat (2026-10-18): Android WebView lacks navigator.mediaSession / MediaMetadata / setSinkId → AL player init threw. In the Android app, QQ stream URLs 403 from the phone's network → fetch them through the server (/__m/qqa/). */
(function(){
  try{
    if(!('mediaSession' in navigator)||!navigator.mediaSession){
      var ms={metadata:null,playbackState:'none',setActionHandler:function(){},setPositionState:function(){},setMicrophoneActive:function(){},setCameraActive:function(){}};
      try{Object.defineProperty(navigator,'mediaSession',{value:ms,configurable:true})}catch(e){}
    }
    if(typeof window.MediaMetadata!=='function'){window.MediaMetadata=function(o){o=o||{};this.title=o.title||'';this.artist=o.artist||'';this.album=o.album||'';this.artwork=o.artwork||[]}}
    var HP=window.HTMLMediaElement&&HTMLMediaElement.prototype;
    if(HP&&typeof HP.setSinkId!=='function'){HP.setSinkId=function(){return Promise.resolve()};try{Object.defineProperty(HP,'sinkId',{get:function(){return ''},configurable:true})}catch(e){}}
    if(HP&&/AnyListenApp\//.test(navigator.userAgent)){
      var re=/^https?:\/\/ws\.stream\.qqmusic\.qq\.com\/(M[0-9A-Za-z]+\.(?:mp3|m4a|flac|ogg))(\?.*)?$/;
      var fix=function(u){var m=typeof u==='string'&&re.exec(u);return m?location.origin+'/__m/qqa/'+m[1]+(m[2]||''):u};
      var d=Object.getOwnPropertyDescriptor(HP,'src');
      if(d&&d.set){Object.defineProperty(HP,'src',{configurable:true,enumerable:d.enumerable,get:d.get,set:function(v){return d.set.call(this,fix(v))}})}
      var sa=Element.prototype.setAttribute;
      Element.prototype.setAttribute=function(n,v){if(this instanceof HTMLMediaElement&&String(n).toLowerCase()==='src')v=fix(v);return sa.call(this,n,v)};
    }
  }catch(e){}
})();
/* boot splash (2026-10-18): animated cover over the blank/"Loading..." boot phase; removed once the app shell (#app-main) or a password form shows */
(function(){
  if(window.self!==window.top)return;var pn=location.pathname;if(pn!=='/'&&pn!=='/index.html')return;
  var d=document.createElement('div');d.id='m-splash';d.setAttribute('aria-hidden','true');
  d.innerHTML='<div class="m-sp-in"><div class="m-sp-logo"><img src="/__m/256x256.png" alt="" decoding="async"></div><div class="m-sp-eq"><i></i><i></i><i></i><i></i><i></i></div><div class="m-sp-t">Any Listen</div><div class="m-sp-tip">如长时间未响应，请<a href="" class="m-sp-rl">再次刷新此页面</a></div></div>';
  document.documentElement.appendChild(d);document.documentElement.classList.add('m-booting');
  /* refresh link (2026-10-19): rapid repeated taps count once — first tap reloads, further taps are ignored until the reload has had 8s */
  var rl=d.querySelector('.m-sp-rl'),rlT=0,rlTx=rl.textContent;
  rl.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var n=Date.now();if(n-rlT<8000)return;rlT=n;rl.textContent='正在刷新…';rl.classList.add('busy');
    setTimeout(function(){rl.textContent=rlTx;rl.classList.remove('busy')},8000);location.reload()});
  var t0=Date.now(),iv=0;
  function done(){if(!iv)return;clearInterval(iv);iv=0;document.documentElement.classList.remove('m-booting');d.classList.add('out');setTimeout(function(){d.remove()},500)}
  iv=setInterval(function(){var pw=document.querySelector('#root input[type=password]');if(document.getElementById('app-main')||(pw&&pw.offsetParent!==null&&Date.now()-t0>2500)||Date.now()-t0>60000)done();if(Date.now()-t0>4000)d.classList.add('slow')},80);
})();
/* lighter sound effects for phones: bigger audio buffers + shorter reverb tail (2026-10-09) */
(function(){
  var C=window.AudioContext||window.webkitAudioContext;if(!C)return;
  function A(o){o=Object.assign({},o||{});if(!o.latencyHint)o.latencyHint='playback';return new C(o)}
  var last=null,routed=false;var D=C;C=function(o){last=new D(o);return last};
  var ms=D.prototype.createMediaElementSource;if(ms)D.prototype.createMediaElementSource=function(){routed=true;last=this;return ms.apply(this,arguments)};
  /* lyric clock compensation: audio routed through WebAudio is heard outputLatency later */
  window.__alLat=function(){try{if(!routed||!last||last.state!=='running')return 0;return ((last.outputLatency||0)+(last.baseLatency||0))*1000}catch(e){return 0}};
  A.prototype=D.prototype;Object.setPrototypeOf(A,D);window.AudioContext=A;if(window.webkitAudioContext)window.webkitAudioContext=A;
  var d=Object.getOwnPropertyDescriptor(AudioBuffer&&window.ConvolverNode?ConvolverNode.prototype:{},'buffer');
  if(d&&d.set)Object.defineProperty(ConvolverNode.prototype,'buffer',{configurable:true,enumerable:d.enumerable,get:d.get,set:function(b){
    try{var max=Math.floor(b.sampleRate*1.5);if(b&&b.length>max){var n=this.context.createBuffer(b.numberOfChannels,max,b.sampleRate),f=Math.floor(b.sampleRate*0.3);
      for(var c=0;c<b.numberOfChannels;c++){var src=b.getChannelData(c).subarray(0,max),dst=n.getChannelData(c);dst.set(src);for(var i=0;i<f;i++)dst[max-f+i]*=1-i/f}b=n}}catch(e){}
    d.set.call(this,b)}});
})();
/* one-time browser cache clear (2026-10-12): bump CLR to clear this site's HTTP cache once per browser (nginx /__m/clear sends Clear-Site-Data: "cache") */
(function(){var CLR='2';try{if(/AnyListenApp\//.test(navigator.userAgent))return;/* app: never wipe its HTTP cache (2026-10-18) */if(localStorage.getItem('al-clr')===CLR)return;localStorage.setItem('al-clr',CLR);sessionStorage.removeItem('al-direct-bad');
  if(window.caches&&caches.keys)caches.keys().then(function(k){k.forEach(function(n){caches.delete(n)})}).catch(function(){});
  setTimeout(function(){fetch('/__m/clear',{cache:'no-store',credentials:'same-origin'}).catch(function(){})},8000)}catch(e){}})();
/* shared, frame-throttled DOM observer (perf 2026-10-09) */
(function(){
  var fns=[],queued=false;
  function run(){queued=false;for(var i=0;i<fns.length;i++){try{fns[i]()}catch(e){}}}
  window.__alObs=function(fn){fns.push(fn)};
  new MutationObserver(function(){if(!queued){queued=true;(window.requestAnimationFrame||setTimeout)(run)}}).observe(document.documentElement,{childList:true,subtree:true});
})();
(function(){
  var mq=window.matchMedia('(max-width: 820px), (pointer: coarse) and (max-width: 1024px)');
  function close(){document.documentElement.classList.remove('m-aside-open')}
  function inject(){
    var tb=document.querySelector('#app-right .toolbar');
    if(tb&&!document.getElementById('m-menu-btn')){
      var b=document.createElement('button');b.id='m-menu-btn';b.type='button';b.setAttribute('aria-label','菜单');
      b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
      b.addEventListener('click',function(e){e.stopPropagation();document.documentElement.classList.toggle('m-aside-open')});
      tb.insertBefore(b,tb.firstChild);
    }
    var am=document.getElementById('app-main');
    if(am&&!document.getElementById('m-mask')){
      var m=document.createElement('div');m.id='m-mask';m.addEventListener('click',close);am.appendChild(m);
    }
    var aside=document.querySelector('#app-main>.aside');
    if(aside&&!aside.__m){aside.__m=1;aside.addEventListener('click',function(e){if(e.target.closest('a,li.list-item'))setTimeout(close,120)})}
  }
  window.__alObs(function(){if(mq.matches)inject()});
  if(document.readyState!=='loading')inject();else document.addEventListener('DOMContentLoaded',inject);
})();

/* covers from CN CDNs are unreachable from the VPS proxy: load them directly in the browser */
(function(){
  var RX=/\/api\/p_url\/(https?%3A%2F%2F[^?#]+)/i;
  var HOST=/(^|\.)(126\.net|gtimg\.cn|qq\.com|kugou\.com|kuwo\.cn|migu\.cn|joox\.com|hdslb\.com)$/i;
  function fix(img){
    var s=img.getAttribute('src');if(!s)return;var m=s.match(RX);if(!m)return;
    var u;try{u=decodeURIComponent(m[1])}catch(e){return}
    var a=document.createElement('a');a.href=u;if(!HOST.test(a.hostname))return;
    u=u.replace(/^http:/i,'https:');img.setAttribute('referrerpolicy','no-referrer');img.setAttribute('src',u);
  }
  function scan(root){if(root.tagName==='IMG')fix(root);if(root.querySelectorAll)root.querySelectorAll('img[src*="/api/p_url/"]').forEach(fix)}
  new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='attributes')fix(m.target);else m.addedNodes.forEach(function(n){if(n.nodeType===1)scan(n)})})})
    .observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  scan(document);
})();

/* drag to reorder LX source priority (2026-10-09) */
(function(){
  var EXT='lx-api-source-loader',PFX='extenstion_configCheckboxMultiple_enabledScripts_';
  var css=document.createElement('style');
  css.textContent='.al-drag{cursor:grab;touch-action:none;user-select:none;padding:0 10px;font-size:20px;line-height:1;opacity:.6;align-self:center}'+
    '.al-dragging{position:relative;z-index:10;opacity:.85;box-shadow:0 4px 14px rgba(0,0,0,.18);background:var(--color-content-background,#fff)}'+
    '.al-target{box-shadow:inset 0 3px 0 var(--color-primary,#5b6ee1)}.al-target-after{box-shadow:inset 0 -3px 0 var(--color-primary,#5b6ee1)}'+
    '.al-hint{font-size:12px;opacity:.7;margin:4px 0 6px}';
  document.head.appendChild(css);
  function idOf(item){var i=item.querySelector('input[id^="'+PFX+'"]');return i?i.id.slice(PFX.length):null}
  function setup(){
    if(!/[?&]id=lx-api-source-loader/.test(location.hash))return;
    var box=document.querySelector('.settings-item-config-checkbox');
    if(!box||!box.querySelector('input[id^="'+PFX+'"]'))return;
    if(!box.previousElementSibling||!box.previousElementSibling.classList.contains('al-hint')){
      var h=document.createElement('div');h.className='al-hint';h.textContent='按住 ≡ 拖动排序：越靠前越优先，失败时自动换下一个';box.parentNode.insertBefore(h,box);
    }
    box.querySelectorAll('.settings-item-config-checkbox-item').forEach(function(item){
      var row=item.querySelector('.settings-item-config-checkbox-item-content');
      if(!row||row.querySelector('.al-drag'))return;
      var g=document.createElement('span');g.className='al-drag';g.textContent='≡';row.insertBefore(g,row.firstChild);
      g.addEventListener('pointerdown',function(ev){start(ev,item,box)});
    });
  }
  function start(ev,item,box){
    ev.preventDefault();var items=[].slice.call(box.querySelectorAll('.settings-item-config-checkbox-item'));
    var y0=ev.clientY,target=null,after=false;item.classList.add('al-dragging');
    try{ev.target.setPointerCapture(ev.pointerId)}catch(e){}
    function clear(){items.forEach(function(x){x.classList.remove('al-target','al-target-after')})}
    function move(e){
      item.style.transform='translateY('+(e.clientY-y0)+'px)';clear();target=null;
      for(var i=0;i<items.length;i++){var it=items[i];if(it===item)continue;var r=it.getBoundingClientRect();
        if(e.clientY>=r.top&&e.clientY<=r.bottom){target=it;after=e.clientY>r.top+r.height/2;it.classList.add(after?'al-target-after':'al-target');break}}
    }
    function up(){
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',up);
      item.classList.remove('al-dragging');item.style.transform='';clear();
      if(!target)return;
      var ids=items.map(idOf),from=ids.indexOf(idOf(item));ids.splice(from,1);
      var to=ids.indexOf(idOf(target))+(after?1:0);ids.splice(to,0,idOf(item));
      if(window.__alExtSet)window.__alExtSet(EXT,{sourceOrder:ids}).catch(function(e){alert('保存排序失败：'+e.message)});
    }
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',up);
  }
  window.__alObs(setup);
  window.addEventListener('hashchange',setup);setup();
})();

/* whitelist gateway integration: auto-login to own instance + account menu (2026-10-09) */
(function(){
  var me=null;
  fetch('/__gw/me',{credentials:'same-origin'}).then(function(r){if(r.status===401){if(location.pathname.indexOf('/__gw/')!==0)location.href='/__gw/login';return null}return r.ok?r.json():null}).then(function(j){me=j;tick()}).catch(function(){});
  var tried=0;
  function autoLogin(){
    if(!me||!me.k||tried>3)return;var i=document.querySelector('input[type=password]');if(!i||i.offsetParent===null)return;
    if(i.closest('.m-gw-skip'))return;tried++;
    var set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(i,me.k);i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));
    setTimeout(function(){var f=i.closest('form');if(f&&f.requestSubmit)f.requestSubmit();else i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}))},150);
  }
  var IC={users:'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    key:'M12.65 10A5.99 5.99 0 0 0 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6a5.99 5.99 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z',
    out:'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z'};
  /* user management as a modal (iframe) so playback is never interrupted (2026-10-11) */
  function openAdmin(src,title){
    src=src||'/__gw/admin';title=title||'用户管理'; /* also used for 账号音源 /al-login/ (2026-10-14) */
    if(document.getElementById('m-gw-modal'))return;
    var o=document.createElement('div');o.id='m-gw-modal';
    o.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center';
    o.innerHTML='<div style="position:relative;width:min(92vw,40rem);height:min(88vh,44rem);background:var(--color-content-background,#fff);border-radius:.75rem;box-shadow:0 .5rem 2rem rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;color:var(--color-primary,#5b6ee1);font-size:1rem;font-weight:600">'+title+'<button type="button" aria-label="关闭" style="border:none;background:none;font-size:1.5rem;line-height:1;cursor:pointer;color:inherit;padding:0 .25rem">×</button></div>'+
      '<div class="m-gw-body" style="position:relative;flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:none"><iframe src="'+src+'" scrolling="no" style="display:block;width:100%;height:300px;border:0;background:transparent"></iframe></div>'+
      '<div class="m-gw-sbt" style="position:absolute;right:3px;width:8px;bottom:6px;display:none;touch-action:none;z-index:2"><div style="position:absolute;left:0;right:0;top:0;border-radius:4px;background:rgba(91,110,225,.6);touch-action:none;cursor:grab"></div></div></div>';
    function close(){o.remove();document.removeEventListener('keydown',esc,true)}
    function esc(e){if(e.key==='Escape'){e.stopPropagation();close()}}
    o.addEventListener('click',function(e){if(e.target===o)close()});
    o.querySelector('button').onclick=close;document.addEventListener('keydown',esc,true);
    document.body.appendChild(o);
    /* the iframe grows to its content and the modal body scrolls, with an always-visible bar (2026-10-11):
       scrolling inside the iframe itself failed on some phones (desktop mode) */
    var body=o.querySelector('.m-gw-body'),fr=o.querySelector('iframe'),t=o.querySelector('.m-gw-sbt'),h=t.firstChild,ro=null;
    function fit(){try{var d=fr.contentDocument;if(d&&d.body){var hh=Math.max(d.body.scrollHeight,d.documentElement.scrollHeight);if(Math.abs(fr.offsetHeight-hh)>1)fr.style.height=hh+'px'}}catch(e){}bar()}
    function bar(){var ch=body.clientHeight,sh=body.scrollHeight;t.style.top=(body.offsetTop+4)+'px';if(sh<=ch+2){t.style.display='none';return}t.style.display='block';
      var tr=ch-10,th=Math.max(32,tr*ch/sh);h.style.height=th+'px';h.style.transform='translateY('+((tr-th)*body.scrollTop/(sh-ch))+'px)'}
    fr.addEventListener('load',function(){try{fr.contentDocument.documentElement.style.overflow='hidden';if(ro)ro.disconnect();ro=new ResizeObserver(fit);ro.observe(fr.contentDocument.body)}catch(e){}body.scrollTop=0;fit();setTimeout(fit,300)});
    body.addEventListener('scroll',bar,{passive:true});window.addEventListener('resize',fit);
    var y0=null,s0=0;h.addEventListener('pointerdown',function(e){y0=e.clientY;s0=body.scrollTop;h.setPointerCapture(e.pointerId);e.preventDefault();e.stopPropagation()});
    h.addEventListener('pointermove',function(e){if(y0===null)return;var ch=body.clientHeight,sh=body.scrollHeight,tr=ch-10;body.scrollTop=s0+(e.clientY-y0)*(sh-ch)/Math.max(1,tr-h.offsetHeight)});
    h.addEventListener('pointerup',function(){y0=null});h.addEventListener('pointercancel',function(){y0=null});
    t.addEventListener('pointerdown',function(e){if(e.target!==t)return;var r=t.getBoundingClientRect();body.scrollTop=(e.clientY-r.top)/r.height*(body.scrollHeight-body.clientHeight)});
  }
  function menu(){
    if(!me)return;var aside=document.querySelector('.aside');if(!aside||document.getElementById('m-gw-menu'))return;
    var ref=aside.querySelector('.aside-nav'),h=ref?[].filter.call(ref.classList,function(c){return c.indexOf('svelte-')===0})[0]||'':'';
    function item(id,label,icon,href){
      return '<li class="nav-item '+h+'" role="presentation"><a id="'+id+'" role="tab" data-ignore-tip="" class="link '+h+'" href="'+href+'" aria-label="'+label+'"><div class="left '+h+'"><div class="icon '+h+'"><svg class="'+h+'" viewBox="0 0 24 24" fill="currentColor"><path d="'+icon+'"/></svg></div> <span class="nav-name '+h+'">'+label+'</span></div></a></li>';
    }
    var d=document.createElement('div');d.id='m-gw-menu';d.style.cssText='margin-top:auto;padding:.5rem 0 .75rem;flex:none';
    d.innerHTML='<div style="padding:0 1.25rem .25rem;font-size:.75rem;color:var(--color-font,inherit);display:flex;align-items:center;gap:.25rem"><span style="opacity:.55">当前用户：<span id="m-gw-uname"></span></span><button type="button" id="m-gw-ren" title="修改用户名" aria-label="修改用户名" style="border:none;background:none;padding:.15rem;cursor:pointer;color:inherit;opacity:.55;display:flex;line-height:0"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg></button></div>'+
      '<ul class="aside-nav '+h+'" role="menu">'+item('m-gw-acc','账号音源',IC.key,'/al-login/')+(me.role==='admin'?item('m-gw-admin','用户管理',IC.users,'/__gw/admin'):'')+item('m-gw-out','退出登录',IC.out,'/__gw/logout')+'</ul>';
    aside.appendChild(d);
    document.getElementById('m-gw-uname').textContent=me.name;
    document.getElementById('m-gw-ren').addEventListener('click',function(){
      var n=prompt('修改用户名（2–16 位中文、字母、数字、_ 或 -）',me.name);if(n==null)return;n=n.trim();if(!n||n===me.name)return;
      fetch('/__gw/rename',{method:'POST',credentials:'same-origin',headers:{'x-al':'1','Content-Type':'application/x-www-form-urlencoded'},body:'u='+encodeURIComponent(n)}).then(function(r){return r.json()}).then(function(j){
        if(j.ok){me.name=j.name;document.getElementById('m-gw-uname').textContent=j.name}else alert(j.err||'修改失败')}).catch(function(){alert('修改失败，请稍后再试')});
    });
    var ad=document.getElementById('m-gw-admin');if(ad)ad.addEventListener('click',function(e){e.preventDefault();openAdmin()});
    var ac=document.getElementById('m-gw-acc');if(ac)ac.addEventListener('click',function(e){e.preventDefault();openAdmin('/al-login/','账号音源（扫码登录）')});
  }
  function tick(){autoLogin();menu()}
  window.__alObs(tick);
})();

/* settings > security: remove all other logged-in devices (2026-10-09) */
(function(){
  function add(){
    var box=document.querySelector('.settings-login-devices');if(!box||document.getElementById('m-rm-all'))return;
    var w=document.createElement('div');w.style.cssText='margin:6px 0 10px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
    var b=document.createElement('button');b.id='m-rm-all';b.type='button';b.textContent='一键移除所有其他设备';
    b.style.cssText='border:none;border-radius:6px;padding:6px 14px;cursor:pointer;background:#e5566a;color:#fff;font-size:13px';
    var tip=document.createElement('span');tip.style.cssText='font-size:12px;opacity:.7';tip.textContent='保留当前设备，其他设备需重新登录';
    w.appendChild(b);w.appendChild(tip);box.parentNode.insertBefore(w,box);
    b.onclick=async function(){
      if(!window.__alDev){alert('页面版本过旧，请强制刷新后再试');return}
      if(!confirm('移除除当前设备外的所有已登录设备？'))return;
      b.disabled=true;b.textContent='正在移除…';
      try{
        var r=await fetch('/__gw/logout-others',{method:'POST',headers:{'X-AL':'1'},credentials:'same-origin'});
        if(!r.ok)throw new Error('网关 '+r.status);
        var d=await window.__alDev.list(),n=0;
        for(var i=0;i<d.list.length;i++){var c=d.list[i];if(c.clientId!==d.currentId){try{await window.__alDev.rm(c.clientId);n++}catch(e){}}}
        tip.textContent='已移除 '+n+' 台设备';b.textContent='一键移除所有其他设备';
        setTimeout(function(){location.reload()},1200);
      }catch(e){alert('移除失败：'+e.message);b.textContent='一键移除所有其他设备'}
      b.disabled=false;
    };
  }
  window.__alObs(add);
})();

/* play songs from CN CDNs directly in the browser instead of through the US VPS proxy; fall back to proxy on error (2026-10-09) */
(function(){
  var RX=/^(?:https?:\/\/[^/]+)?\/api\/p_url\/(https?%3A%2F%2F[^?#]+)/i;
  var HOST=/(^|\.)music\.126\.net$/i,BAD='al-direct-bad';
  var d=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');if(!d||!d.set)return;
  function direct(v){var m=RX.exec(v||'');if(!m)return null;var u;try{u=decodeURIComponent(m[1])}catch(e){return null}
    var a=document.createElement('a');a.href=u;if(!HOST.test(a.hostname)||sessionStorage.getItem(BAD))return null;return u.replace(/^http:/i,'https:')}
  Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,enumerable:d.enumerable,
    get:function(){var v=d.get.call(this);return this.__alNew&&v===this.__alNew?this.__alOrig:v},
    set:function(v){var u=direct(String(v));
      if(u&&this.__alFail!==v){this.__alOrig=String(v);this.__alNew=u;var el=this;
        if(!el.__alErr){el.__alErr=1;el.addEventListener('error',function(){if(el.__alNew&&d.get.call(el)===el.__alNew){var o=el.__alOrig;try{sessionStorage.setItem(BAD,'1')}catch(e){}el.__alFail=o;el.__alNew=null;d.set.call(el,o);el.play().catch(function(){})}})}
        d.set.call(this,u)}
      else{this.__alNew=null;d.set.call(this,v)}}});
})();

/* keep lyrics locked to the real audio clock (player bar + detail page share one lyric player) (2026-10-09) */
(function(){
  /* gentler (2026-10-11): resync only after 2 consecutive readings >500 ms off, at most once per 5 s, never while the output latency is still moving */
  var bad=0,lastSync=0,lastLat=-1;
  setInterval(function(){var L=window.__alLrc;if(!L||document.hidden)return;try{
    if(!L.playing()){bad=0;return}var lat=window.__alLat?window.__alLat():0,steady=lastLat<0||Math.abs(lat-lastLat)<30;lastLat=lat;
    var c=L.cur(),t=L.t();if(!(typeof c==='number'&&isFinite(t))||!steady){bad=0;return}
    if(Math.abs(c-t)>500){if(++bad>=2&&Date.now()-lastSync>5000){bad=0;lastSync=Date.now();L.sync()}}else bad=0;
  }catch(e){}},1000);
})();

/* wake a sleeping player (idle auto-stop, 2026-10-10): on real user interaction, reload into the gateway's starting page */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;var last=0;
  function chk(){var n=Date.now();if(n-last<8000)return;last=n;
    fetch('/__gw/status',{cache:'no-store',credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.running===false)location.reload()}).catch(function(){})}
  document.addEventListener('pointerdown',chk,true);document.addEventListener('keydown',chk,true);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)chk()});
})();

/* page scale (desktop, 2026-10-11): main page = html font-size (default 125%); song-detail page scaled on its own via zoom on .play-detail
   (shown 100% = real 80% of original, 50..150% shown), so opening/closing the detail page never resizes the main page.
   zoom makes Chrome report offsetX/clientX in visual px while clientWidth stays local, so mouse events inside the zoomed detail page are rescaled. */
(function(){
  var MQ='(min-width: 821px) and (not (pointer: coarse))',STEP=5,mq=window.matchMedia(MQ);
  var CFG={main:{key:'al-scale-main',def:125,min:80,max:200},detail:{key:'al-scale-detail2',def:100,min:50,max:150}};
  function get(k){var c=CFG[k],v=parseInt(localStorage.getItem(c.key),10);return v>=c.min&&v<=c.max?v:c.def}
  function set(k,v){var c=CFG[k];v=Math.max(c.min,Math.min(c.max,v));localStorage.setItem(c.key,v);apply();paint()}
  var st=document.getElementById('m-scale-style');if(!st){st=document.createElement('style');st.id='m-scale-style';(document.head||document.documentElement).appendChild(st)}
  var cur='',Z=1;
  function apply(){
    var m=get('main'),px=(16*m/100).toFixed(2);Z=mq.matches?Math.round(80*get('detail')/m*1000)/100000:1;
    var css='@media '+MQ+'{html,html.web{font-size:'+px+'px!important}.play-detail{zoom:'+Z+'}}';if(css!==cur){st.textContent=css;cur=css}
  }
  var drag=false,P=['clientX','clientY','offsetX','offsetY','pageX','pageY','x','y'];
  function fix(e){
    if(Z===1||e.__alZ)return;var t=e.target,inD=t&&t.closest&&t.closest('.play-detail');
    if(e.type==='mousedown'||e.type==='pointerdown')drag=!!inD;
    if(!inD&&!drag)return;e.__alZ=1;e.__alRawX=e.clientX;
    P.forEach(function(p){var v=e[p];if(typeof v==='number')Object.defineProperty(e,p,{value:v/Z,configurable:true})});
    if(e.type==='mouseup'||e.type==='pointerup')setTimeout(function(){drag=false},0);
  }
  ['mousedown','mousemove','mouseup','click','dblclick','contextmenu','pointerdown','pointermove','pointerup','mouseover','mouseout'].forEach(function(t){window.addEventListener(t,fix,true)});
  function widget(id,k,label){
    var w=document.createElement('div');w.id=id;w.className='m-scale';w.dataset.k=k;
    w.innerHTML='<span style="opacity:.6;margin-right:.25rem">'+label+'</span><button type="button" data-d="-1" title="缩小">−</button><span class="v" title="点击恢复默认"></span><button type="button" data-d="1" title="放大">+</button>';
    w.addEventListener('click',function(e){var b=e.target.closest('button');e.stopPropagation();if(b)set(k,get(k)+STEP*b.dataset.d);else if(e.target.classList.contains('v'))set(k,CFG[k].def)});
    ['mousedown','pointerdown','dblclick','contextmenu'].forEach(function(t){w.addEventListener(t,function(e){e.stopPropagation()})});
    return w;
  }
  function paint(){document.querySelectorAll('.m-scale').forEach(function(w){w.querySelector('.v').textContent=get(w.dataset.k)+'%'})}
  function setup(){
    apply();
    var menu=document.getElementById('m-gw-menu');
    if(menu&&!document.getElementById('m-scale-main')){menu.insertBefore(widget('m-scale-main','main','页面大小'),menu.firstChild);paint()}
    var pd=document.querySelector('.play-detail');
    if(pd&&!pd.querySelector('#m-scale-detail')){pd.appendChild(widget('m-scale-detail','detail','详情页大小'));paint()}
    /* 倍速 popup: reset-to-1x button (needs window.__alRate from bundle patch) */
    document.querySelectorAll('.setting > .info').forEach(function(info){
      var box=info.parentNode;if(box.querySelector('.m-rate-reset')||!box.querySelector('.slider')||!window.__alRate)return;
      var sp=info.querySelector('span');if(!sp||!/x$/.test(sp.textContent.trim()))return;
      var b=document.createElement('button');b.type='button';b.className='m-rate-reset';b.textContent='重置 1.00x';
      b.addEventListener('click',function(e){e.stopPropagation();window.__alRate(1)});
      info.insertBefore(b,sp.nextSibling);
    });
  }
  apply();mq.addEventListener&&mq.addEventListener('change',apply);
  if(window.__alObs)window.__alObs(setup);else document.addEventListener('DOMContentLoaded',function(){new MutationObserver(setup).observe(document.body,{childList:true,subtree:true})});
})();

/* self-heal stale bundle (2026-10-11): browsers cached the original indexBzjGy48v.js as immutable for 60 days, so in-place patches (lyric sync, rate reset...) never loaded.
   If the patched globals are missing after load, refresh that cache entry once and reload. */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  window.addEventListener('load',function(){setTimeout(function(){
    if(window.__alLrc||!document.querySelector('script[src*="indexBzjGy48v.js"]'))return;
    var k='al-bundle-bust';try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1')}catch(e){return}
    fetch('/indexBzjGy48v.js',{cache:'reload',credentials:'same-origin'}).then(function(r){return r.text()}).then(function(t){if(t.indexOf('__alLrc')>=0)location.reload()}).catch(function(){});
  },2500)});
})();

/* 歌单内搜索 (2026-10-11): search only the user's own lists (播放历史, 我喜欢, 试听列表, created lists), not online sources.
   Needs window.__alLib from bundle patch (lists / musics / play). Opens as an in-page modal so playback continues. */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var ICON='M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z';
  var data=null,loading=null;
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function load(only){
    var L=window.__alLib;if(!L)return Promise.reject(new Error('nolib'));
    var lists=L.lists().filter(function(l){return l.type!=='folder'&&(!only||l.id===only)});
    if(only)return Promise.all(lists.map(function(l){return L.musics(l.id).then(function(m){return {l:l,m:m||[]}})}));
    return loading=Promise.all(lists.map(function(l){return L.musics(l.id).then(function(m){return {l:l,m:m||[]}},function(){return {l:l,m:[]}})})).then(function(r){data=r;loading=null;return r});
  }
  function fmt(s){s=Math.round(s||0);return s?(Math.floor(s/60)+':'+('0'+s%60).slice(-2)):''}
  function open(only){
    if(document.getElementById('m-ls-modal'))return;
    var oname='';if(only){var ol=(window.__alLib?window.__alLib.lists():[]).filter(function(l){return l.id===only})[0];if(!ol)only=null;else oname=ol.name}
    var o=document.createElement('div');o.id='m-ls-modal';
    o.innerHTML='<div class="m-ls-box"><div class="m-ls-head"><span>'+(only?'在「'+esc(oname)+'」中搜索':'歌单内搜索')+'</span><button type="button" class="m-ls-x" aria-label="关闭">×</button></div>'+
      '<div class="m-ls-bar"><input type="search" placeholder="歌名、歌手或专辑" autocomplete="off"><select'+(only?' style="display:none"':'')+'></select></div>'+
      '<div class="m-ls-info"></div><div class="m-ls-res"></div></div>';
    document.body.appendChild(o);
    var mine=null,inp=o.querySelector('input'),sel=o.querySelector('select'),res=o.querySelector('.m-ls-res'),info=o.querySelector('.m-ls-info'),hits=[],t=0;
    function close(){o.remove();document.removeEventListener('keydown',key,true)}
    function key(e){if(e.key==='Escape'){e.stopPropagation();close()}else if(e.key==='Enter'&&document.activeElement===inp&&hits[0]){e.preventDefault();play(0)}}
    o.addEventListener('click',function(e){if(e.target===o)close()});o.querySelector('.m-ls-x').onclick=close;document.addEventListener('keydown',key,true);
    ['keydown','keyup','keypress'].forEach(function(ev){o.addEventListener(ev,function(e){if(e.key!=='Escape')e.stopPropagation()})});
    function fillSel(){var v=sel.value;sel.innerHTML='<option value="">全部歌单</option>'+data.map(function(d){return '<option value="'+esc(d.l.id)+'">'+esc(d.l.name)+'（'+d.m.length+'）</option>'}).join('');sel.value=v}
    function play(i){var h=hits[i];if(!h)return;window.__alLib.play(h.l.id,h.list,h.idx);res.querySelectorAll('.m-ls-row').forEach(function(r,j){r.classList.toggle('on',j===i)})}
    function locate(i){var h=hits[i];if(!h)return;close();location.hash='#/library?id='+encodeURIComponent(h.l.id)+'&mid='+encodeURIComponent(h.m.id)}
    function run(){
      if(only?!mine:!data){info.textContent='正在读取歌单…';return}
      var q=inp.value.trim().toLowerCase(),ws=q.split(/\s+/).filter(Boolean),scope=sel.value;hits=[];
      var src=only?mine:data;
      if(!ws.length){res.innerHTML='';var n=0;src.forEach(function(d){n+=d.m.length});info.textContent=only?('本歌单共 '+n+' 首，输入歌名、歌手或专辑'):('共 '+src.length+' 个歌单、'+n+' 首，输入关键词开始搜索');return}
      src.forEach(function(d){if(scope&&d.l.id!==scope)return;d.m.forEach(function(m,idx){
        var s=((m.name||'')+' '+(m.singer||'')+' '+((m.meta&&m.meta.albumName)||'')).toLowerCase();
        if(ws.every(function(w){return s.indexOf(w)>=0}))hits.push({l:d.l,list:d.m,idx:idx,m:m});
      })});
      info.textContent=hits.length?('找到 '+hits.length+' 首'+(hits.length>300?'，显示前 300 首':'')+(only?'。点歌曲播放，「定位」在列表中找到它':'。点歌曲播放，「定位」跳到所在歌单')):'没有找到匹配的歌曲';
      res.innerHTML=hits.slice(0,300).map(function(h,i){var m=h.m;return '<div class="m-ls-row" data-i="'+i+'"><div class="m-ls-main"><div class="m-ls-name">'+esc(m.name)+'</div><div class="m-ls-sub">'+esc(m.singer)+((m.meta&&m.meta.albumName)?' · '+esc(m.meta.albumName):'')+'</div></div>'+(only?'':'<span class="m-ls-list">'+esc(h.l.name)+'</span>')+'<span class="m-ls-dur">'+esc(m.interval||'')+'</span><button type="button" class="m-ls-loc" data-i="'+i+'">定位</button></div>'}).join('');
    }
    res.addEventListener('click',function(e){var b=e.target.closest('.m-ls-loc');if(b){e.stopPropagation();locate(+b.dataset.i);return}var r=e.target.closest('.m-ls-row');if(r)play(+r.dataset.i)});
    inp.addEventListener('input',function(){clearTimeout(t);t=setTimeout(run,120)});sel.addEventListener('change',run);
    setTimeout(function(){inp.focus()},30);
    info.textContent='正在读取歌单…';
    if(only){load(only).then(function(r){mine=r;run()}).catch(function(){info.textContent='读取歌单失败，请刷新页面后再试'});return}
    (data&&!loading?Promise.resolve(data):(loading||load())).then(function(){fillSel();run()}).catch(function(){info.textContent='读取歌单失败，请刷新页面后再试'});
    load().then(function(){if(document.body.contains(o)){fillSel();run()}}).catch(function(){}); /* refresh in background so new songs show up */
  }
  window.__alLocalSearch=open;
  /* per-list: the list toolbar's 歌曲查找 button opens this search scoped to that list (2026-10-11, replaces the sidebar entry) */
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('button[aria-label="歌曲查找"],button[aria-label="Song search"]');if(!b)return;
    var m=/^#\/library(?:\?(.*))?$/.exec(location.hash);if(!m||!window.__alLib)return;
    var id=new URLSearchParams(m[1]||'').get('id');
    if(!id){var ls=window.__alLib.lists();id=ls[1]&&ls[1].id} /* /library without id shows 我喜欢 */
    if(!id)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();open(id);
  },true);
})();

/* kicked by admin (2026-10-11): check the session every 20 s; when the gateway says this login was ended, stop audio and show a notice */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var done=false;
  function show(kind){
    if(done)return;done=true;
    document.querySelectorAll('audio,video').forEach(function(a){try{a.pause();a.src=''}catch(e){}});
    var o=document.createElement('div');o.style.cssText='position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center';
    o.innerHTML='<div style="background:var(--color-content-background,#fff);color:var(--color-font,#333);border-radius:.75rem;padding:1.5rem 1.75rem;width:min(88vw,22rem);text-align:center;box-shadow:0 .5rem 2rem rgba(0,0,0,.3)"><div style="font-size:1.1rem;font-weight:600;color:var(--color-primary,#5b6ee1);margin-bottom:.5rem">'+(kind==='admin'?'你已被管理员踢下线':'此设备已退出登录')+'</div><div style="font-size:.875rem;opacity:.7;margin-bottom:1rem">如需继续使用，请重新登录。</div><a href="/cdn-cgi/access/logout" style="display:inline-block;background:var(--color-primary,#5b6ee1);color:#fff;border-radius:.5rem;padding:.5rem 1.25rem;text-decoration:none">重新登录</a></div>';
    document.body.appendChild(o);
  }
  function chk(){if(done||document.hidden&&Math.random()<.5)return;fetch('/__gw/me',{credentials:'same-origin',cache:'no-store'}).then(function(r){var k=r.headers.get('X-GW-Kicked');if(r.status===403&&k)show(k)}).catch(function(){})}
  setInterval(chk,20000);document.addEventListener('visibilitychange',function(){if(!document.hidden)chk()});
})();

/* sleep timer (2026-10-11): button inside the song-detail page; presets 10–30 min or custom minutes; optional "stop after this song".
   With both set, when the time is up the current song is allowed to finish (native isPlayedStop via window.__alPl from bundle patch). */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var K='al-sleep',S=load(),PRE=[10,15,20,25,30];
  function load(){try{var o=JSON.parse(localStorage.getItem(K)||'{}');return{end:o.end||0,after:!!o.after,wait:!!o.wait}}catch(e){return{end:0,after:false,wait:false}}}
  function save(){localStorage.setItem(K,JSON.stringify(S))}
  function P(){return window.__alPl}
  function fmt(ms){var s=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return (h?h+':'+(m<10?'0':''):'')+m+':'+(x<10?'0':'')+x}
  function active(){return S.end>0||S.wait}
  function clear(){S.end=0;S.wait=false;save();var p=P();if(p&&p.stopFlag())p.stopAfter(false);paint()}
  function startMin(m){S.end=Date.now()+m*60000;S.wait=false;save();var p=P();if(p&&p.stopFlag())p.stopAfter(false);paint()}
  function stopAfterNow(){S.end=0;S.wait=true;save();var p=P();if(p)p.stopAfter(true);paint()}
  var wasPlaying=false,guard=0,lastUser=0,hooked=null;
  ['pointerdown','keydown','touchstart'].forEach(function(t){addEventListener(t,function(){lastUser=Date.now()},true)});
  function aud(p){try{return p&&p.audio&&p.audio()}catch(e){return null}}
  function isPl(p){var a=aud(p);return !!(p.playing()||(a&&!a.paused&&!a.ended))}
  /* pause through the app and on the audio element itself, then keep it paused for a few seconds
     unless the user touches something (2026-10-11: desktop kept playing after the timer fired) */
  function hardStop(p){try{p.pause()}catch(e){}var a=aud(p);try{if(a&&!a.paused)a.pause()}catch(e){}guard=Date.now()+6000}
  function due(){
    var p=P();
    if(!p){if(S.end&&Date.now()>=S.end){S.end=0;S.wait=false;save();   /* bundle hook missing (stale cached bundle): pause via the UI */
      document.querySelectorAll('audio,video').forEach(function(m){try{m.pause()}catch(e){}});
      var pb=document.querySelector('.player button[aria-label="暂停"],.play-detail button[aria-label="暂停"]');if(pb)pb.click()}return}
    if(guard){if(Date.now()>guard||lastUser>guard-6000)guard=0;else if(isPl(p))hardStop(p)}
    if(!active())return;
    var pl=isPl(p);
    if(S.end&&Date.now()>=S.end){
      if(S.after&&pl){S.end=0;S.wait=true;save();p.stopAfter(true)}
      else{S.end=0;S.wait=false;save();hardStop(p);pl=false}
    }
    if(S.wait){
      if(!pl&&wasPlaying){S.wait=false;save()}
      else if(pl&&!p.stopFlag())p.stopAfter(true);
    }
    wasPlaying=pl;
  }
  setInterval(function(){
    var p=P(),a=aud(p);if(a&&a!==hooked){hooked=a;a.addEventListener('timeupdate',due)}  /* timeupdate keeps firing in throttled background tabs */
    if(!active()&&!guard){wasPlaying=false;return}
    due();if(active()||document.getElementById('m-sleep-pop')||document.querySelector('#m-sleep-btn.on'))paint();
  },1000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden){due();paint()}});
  function status(){
    var p=P();
    if(S.wait){var g=p&&p.progress();var r=g&&g.maxPlayTime?(g.maxPlayTime-g.nowPlayTime)*1000:0;return '播放完这首后关闭'+(r>0?'（约 '+fmt(r)+'）':'')}
    if(S.end){var left=S.end-Date.now();return fmt(left)+' 后关闭'+(S.after?'，并等这首播完':'')}
    return '';
  }
  var IC='<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>';
  function paint(){
    var b=document.getElementById('m-sleep-btn');if(b){var t=b.querySelector('.t');var txt=S.wait?'本首后关闭':(S.end?fmt(S.end-Date.now()):'定时关闭');if(t.textContent!==txt){t.textContent=txt;b.title=txt==='定时关闭'?txt:'定时关闭：'+txt}b.classList.toggle('on',active())}
    var pn=document.getElementById('m-sleep-pop');if(pn){
      var st=pn.querySelector('.m-sl-st'),s=status();st.textContent=s||'未开启定时关闭';st.classList.toggle('on',!!s);
      pn.querySelector('.m-sl-cancel').style.display=active()?'':'none';
      var cb=pn.querySelector('input[type=checkbox]');if(cb.checked!==S.after)cb.checked=S.after;
    }
  }
  function stop(e){e.stopPropagation()}
    /* animated close: element leaves the #m-sleep-pop id so lookups treat it as gone */
    function closeSP(o){if(!o||o.id!=='m-sleep-pop')return;o.id='m-sleep-pop-out';o.classList.add('m-out');setTimeout(function(){o.remove()},170)}
  function openPop(){
    var old=document.getElementById('m-sleep-pop');if(old){closeSP(old);return}
    var pd=document.querySelector('.play-detail');if(!pd)return;
    var pn=document.createElement('div');pn.id='m-sleep-pop';
    pn.innerHTML='<div class="m-sl-h">定时关闭<button type="button" class="m-sl-x" aria-label="关闭">×</button></div>'+
      '<div class="m-sl-st"></div>'+
      '<div class="m-sl-pre">'+PRE.map(function(m){return '<button type="button" data-m="'+m+'">'+m+' 分钟</button>'}).join('')+'</div>'+
      '<div class="m-sl-cus"><input type="number" min="1" max="720" step="1" inputmode="numeric" placeholder="自定义分钟"><button type="button" class="m-sl-go">开始</button></div>'+
      '<label class="m-sl-af"><input type="checkbox"> 播放完这首歌后关闭</label>'+
      '<div class="m-sl-tip">单独勾选：本首播完就停；和时长一起用：时间到后等这首播完再停。</div>'+
      '<button type="button" class="m-sl-cancel">取消定时</button>';
    ['click','mousedown','pointerdown','dblclick','contextmenu','wheel','keydown'].forEach(function(t){pn.addEventListener(t,stop)});
    pn.addEventListener('click',function(e){
      var b=e.target.closest('button');if(!b)return;
      if(b.classList.contains('m-sl-x')){closeSP(pn);return}
      if(b.dataset.m){startMin(+b.dataset.m);return}
      if(b.classList.contains('m-sl-go')){var i=pn.querySelector('.m-sl-cus input'),v=parseInt(i.value,10);if(!(v>=1&&v<=720)){i.focus();i.classList.add('bad');return}i.classList.remove('bad');startMin(v);i.value='';return}
      if(b.classList.contains('m-sl-cancel')){S.after=false;clear();return}
    });
    pn.querySelector('.m-sl-cus input').addEventListener('keydown',function(e){if(e.key==='Enter')pn.querySelector('.m-sl-go').click()});
    pn.querySelector('input[type=checkbox]').addEventListener('change',function(e){
      S.after=e.target.checked;save();
      if(S.after&&!S.end)stopAfterNow();               /* no timer running: stop after the current song */
      else if(!S.after&&S.wait){S.wait=false;save();var p=P();if(p)p.stopAfter(false)}
      paint();
    });
    var sb=document.getElementById('m-sleep-btn');
    if(sb&&sb.classList.contains('in-bar')){
      document.body.appendChild(pn);pn.classList.add('in-bar');
      var r=sb.getBoundingClientRect(),rt=Math.max(8,innerWidth-r.right-40);pn.style.right=rt+'px';pn.style.bottom=(innerHeight-r.top+12)+'px';pn.style.setProperty('--arrow-right',Math.max(6,innerWidth-rt-(r.left+r.width/2)-8)+'px');
      setTimeout(function(){document.addEventListener('mousedown',function h(e){if(!pn.isConnected){document.removeEventListener('mousedown',h,true);return}if(!pn.contains(e.target)&&!sb.contains(e.target)){closeSP(pn);document.removeEventListener('mousedown',h,true)}},true)},0);
    }else pd.appendChild(pn);
    paint();
  }
  var mqD=window.matchMedia('(min-width: 821px) and (not (pointer: coarse))');
  function setup(){
    var pd=document.querySelector('.play-detail');if(!pd){var op=document.querySelector('#m-sleep-pop.in-bar');if(op)op.remove();return}
    var b=pd.querySelector('#m-sleep-btn'),fresh=!b;
    if(!b){b=document.createElement('button');b.type='button';b.id='m-sleep-btn';b.title='定时关闭';b.innerHTML=IC+'<span class="t"></span>';
      ['mousedown','pointerdown','dblclick','contextmenu'].forEach(function(t){b.addEventListener(t,stop)});
      b.addEventListener('click',function(e){e.stopPropagation();var o=document.getElementById('m-sleep-pop');if(o&&b.classList.contains('in-bar')&&o.dataset.hover){delete o.dataset.hover;return}openPop()});
      /* desktop: hovering the clock opens the menu like the native popovers; leaving closes it unless it was clicked open or you're typing */
      var ht=null;function cancelH(){if(ht){clearTimeout(ht);ht=null}}
      function leave(){cancelH();ht=setTimeout(function(){var o=document.getElementById('m-sleep-pop');if(o&&o.dataset.hover&&!o.contains(document.activeElement)&&!o.matches(':hover')&&!b.matches(':hover'))closeSP(o)},350)}
      b.addEventListener('mouseenter',function(){if(!b.classList.contains('in-bar'))return;cancelH();if(!document.getElementById('m-sleep-pop')){openPop();var o=document.getElementById('m-sleep-pop');if(o){o.dataset.hover='1';o.addEventListener('mouseenter',cancelH);o.addEventListener('mouseleave',leave)}}});
      b.addEventListener('mouseleave',function(){if(b.classList.contains('in-bar'))leave()});}
    /* desktop: sits in the play bar's right group, just before 播放列表; phone: top-left pill */
    var ql=mqD.matches&&pd.querySelector('.control .side.right [aria-label="播放列表"]');
    if(ql){if(b.nextElementSibling!==ql){ql.parentNode.insertBefore(b,ql)}b.classList.add('in-bar')}
    else{if(b.parentNode!==pd)pd.appendChild(b);b.classList.remove('in-bar')}
    if(fresh)paint();
  }
  if(mqD.addEventListener)mqD.addEventListener('change',function(){var o=document.getElementById('m-sleep-pop');if(o)o.remove();setup()});
  window.__alSleep={state:function(){return S},set:function(o){for(var k in o)S[k]=o[k];save();paint()}};
  if(window.__alObs)window.__alObs(setup);
})();
/* (2026-10-11) progress: phones get a video-style scrubber (bottom bar + detail page), desktop gets a hover time tip */
(function(){
  var mqP=window.matchMedia('(max-width: 820px), (pointer: coarse) and (max-width: 1024px)');
  function pl(){return window.__alPl}
  function prog(){try{return pl().progress()||{}}catch(e){return {}}}
  function fmt(t){t=Math.max(0,Math.floor(t||0));var m=Math.floor(t/60),s=t%60;return (m<10?'0':'')+m+':'+(s<10?'0':'')+s}
  function seek(sec){
    var p=pl();
    try{if(p&&p.seek){p.seek(sec);return}}catch(e){}
    try{var a=p&&p.audio&&p.audio();if(a)a.currentTime=sec}catch(e){}
  }
  var bars=[],timer=null,drag=null,st=null;
  function stip(){if(!st){st=document.createElement('div');st.id='m-ptip';st.className='m-stip';document.body.appendChild(st)}return st}
  function hideStip(){if(st)st.style.display='none'}
  function make(withTimes){
    var el=document.createElement('div');el.className='m-scrub'+(withTimes?' m-scrub-d':'');
    el.innerHTML='<div class="trk"><div class="fill"></div><div class="dot"></div></div>'+(withTimes?'<div class="tms"><span class="a">00:00</span><span class="b">00:00</span></div>':'');
    el._fill=el.querySelector('.fill');el._dot=el.querySelector('.dot');el._tip=el.querySelector('.tip');el._a=el.querySelector('.a');el._b=el.querySelector('.b');el._trk=el.querySelector('.trk');
    function ratio(x){var r=el._trk.getBoundingClientRect();return r.width?Math.min(1,Math.max(0,(x-r.left)/r.width)):0}
    function show(r){var mx=prog().maxPlayTime||0;paint(el,r,r*mx,mx);if(withTimes)return;var tp=stip(),tr=el._trk.getBoundingClientRect();tp.textContent=fmt(r*mx)+' / '+fmt(mx);tp.style.display='block';tp.style.left=Math.min(innerWidth-50,Math.max(50,tr.left+r*tr.width))+'px';tp.style.top=(tr.top-10)+'px'}
    el.addEventListener('touchstart',function(e){var t=e.changedTouches[0];if(!t||!(prog().maxPlayTime>0))return;e.preventDefault();e.stopPropagation();drag={el:el,r:ratio(t.clientX)};el.classList.add('drag');show(drag.r)},{passive:false});
    el.addEventListener('touchmove',function(e){if(!drag||drag.el!==el)return;e.preventDefault();e.stopPropagation();drag.r=ratio(e.changedTouches[0].clientX);show(drag.r)},{passive:false});
    function end(e){if(!drag||drag.el!==el)return;e&&e.stopPropagation();var mx=prog().maxPlayTime||0,r=drag.r;drag=null;el.classList.remove('drag');hideStip();if(mx>0)seek(r*mx);paint(el,r,r*mx,mx)}
    el.addEventListener('touchend',end);el.addEventListener('touchcancel',function(){drag=null;hideStip();el.classList.remove('drag');tick()});
    ['click','mousedown','pointerdown'].forEach(function(t){el.addEventListener(t,function(e){e.stopPropagation()})});
    return el;
  }
  function paint(el,r,now,mx){
    var v=Math.min(1,Math.max(0,r||0));
    el._fill.style.transform='scaleX('+v+')';el._dot.style.left=(v*100)+'%';
    if(el._a){el._a.textContent=fmt(now);el._b.textContent=fmt(mx)}
  }
  function tick(){
    var p=prog(),mx=p.maxPlayTime||0,now=p.nowPlayTime||0;
    bars=bars.filter(function(b){return b.isConnected});
    bars.forEach(function(b){if(drag&&drag.el===b)return;paint(b,mx?now/mx:0,now,mx)});
    if(!bars.length&&timer){clearInterval(timer);timer=null}
  }
  function setup(){
    if(!mqP.matches)return;
    var pi=document.querySelector('.player .player-inner');
    if(pi&&!pi.querySelector(':scope>.m-scrub')){var b=make(false);pi.appendChild(b);bars.push(b)}
    var mp=document.querySelector('.play-detail .middle-play-progress.svelte-ecc6yq');
    if(mp&&!(mp.nextElementSibling&&mp.nextElementSibling.classList.contains('m-scrub'))){var d=make(true);mp.parentNode.insertBefore(d,mp.nextSibling);bars.push(d)}
    if(bars.length&&!timer){timer=setInterval(function(){if(!document.hidden)tick()},500)}
    tick();
  }
  if(window.__alObs)window.__alObs(setup);
  /* desktop: hover over any progress bar shows the time under the mouse */
  var tip=null;
  document.addEventListener('mousemove',function(e){
    if(mqP.matches)return;
    var m=e.target&&e.target.closest&&e.target.closest('.progress-mask.svelte-19mfxtq');
    if(!m){if(tip)tip.style.display='none';return}
    var mx=prog().maxPlayTime||0;if(!(mx>0))return;
    var x=e.__alRawX!=null?e.__alRawX:e.clientX,r=m.getBoundingClientRect(),v=Math.min(1,Math.max(0,(x-r.left)/r.width));
    if(!tip){tip=document.createElement('div');tip.id='m-ptip';document.body.appendChild(tip)}
    tip.textContent=fmt(v*mx);tip.style.display='block';
    tip.style.left=x+'px';tip.style.top=(r.top-8)+'px';
  },{passive:true});
  document.addEventListener('mouseleave',function(){if(tip)tip.style.display='none'});
})();
/* admin push notices (2026-10-11): poll /__gw/push; mode modal = centred dialog, toast = bottom-right card */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var KEY='al-push:',user=null,queue=[],showing=false,busy=false;
  function seen(){try{return +localStorage.getItem(KEY+user)||0}catch(e){return 0}}
  function mark(ts){try{if(ts>seen())localStorage.setItem(KEY+user,String(ts))}catch(e){}}
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function nextModal(){
    if(showing||!queue.length)return;showing=true;var m=queue.shift();
    var o=el('div','m-push-mask'),c=el('div','m-push-modal');
    c.appendChild(el('div','h',m.title||'管理员通知'));c.appendChild(el('div','b',m.text));
    var ok=el('button','ok','知道了');ok.type='button';c.appendChild(ok);o.appendChild(c);
    ['mousedown','pointerdown','click','dblclick','contextmenu','wheel','keydown','touchstart'].forEach(function(t){o.addEventListener(t,function(e){e.stopPropagation()})});
    ok.addEventListener('click',function(){o.remove();showing=false;nextModal()});
    document.body.appendChild(o);setTimeout(function(){ok.focus()},50);
  }
  function toast(m){
    var box=document.getElementById('m-push-toasts');if(!box){box=el('div');box.id='m-push-toasts';document.body.appendChild(box)}
    var t=el('div','m-push-toast'),x=el('button','x','×');x.type='button';x.setAttribute('aria-label','关闭');
    t.appendChild(x);t.appendChild(el('div','h',m.title||'管理员通知'));t.appendChild(el('div','b',m.text));
    ['mousedown','pointerdown','click','dblclick','contextmenu','wheel','touchstart'].forEach(function(ev){t.addEventListener(ev,function(e){e.stopPropagation()})});
    var timer=null;function close(){if(timer)clearTimeout(timer);t.classList.add('out');setTimeout(function(){t.remove()},250)}
    function arm(){timer=setTimeout(close,15000)}
    x.addEventListener('click',close);t.addEventListener('mouseenter',function(){if(timer){clearTimeout(timer);timer=null}});t.addEventListener('mouseleave',arm);
    box.appendChild(t);arm();
  }
  function poll(){
    if(busy)return;busy=true;
    fetch('/__gw/push?a='+(user?seen():0),{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){
      busy=false;if(!j||!j.list)return;
      if(user!==j.u){user=j.u;}
      var s=seen(),max=s;
      var hp=false;j.list.forEach(function(m){if(m.ts<=s)return;if(m.ts>max)max=m.ts;if(m.mode==='home')hp=true;else if(m.mode==='toast')toast(m);else queue.push(m)});
      mark(max);nextModal();if(hp&&window.__alHome&&window.__alHome.pushes)window.__alHome.pushes();
    }).catch(function(){busy=false});
  }
  setTimeout(poll,3000);
  setInterval(function(){if(!document.hidden)poll()},20000);
  document.addEventListener('visibilitychange',function(){if(!document.hidden)poll()});
  window.__alPush={poll:poll};
})();
/* 主页 (2026-10-11): sidebar entry + landing view with cards: admin notice (/__gw/notice) and the user's lists (我喜欢 + created/collected lists).
   Overlay inside #app-right's view area, so the native router/state is untouched; any navigation closes it. */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var HOME='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',prevHash=null,on=false,opened=false,gen=0,drawnN=-1;
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function view(){var r=document.getElementById('app-right');if(!r)return null;var tb=r.querySelector('.toolbar');var v=tb&&tb.nextElementSibling;return v||null}
  function nav(){
    var a=document.querySelector('#app-main .aside');if(!a)return;var ul=a.querySelector('.aside-nav');if(!ul||document.getElementById('m-home-nav'))return;
    var h=[].filter.call(ul.classList,function(c){return c.indexOf('svelte-')===0})[0]||'';
    var li=document.createElement('li');li.className='nav-item '+h;li.setAttribute('role','presentation');
    li.innerHTML='<a id="m-home-nav" role="tab" data-ignore-tip="" class="link '+h+'" href="#/home" aria-label="主页"><div class="left '+h+'"><div class="icon '+h+'"><svg class="'+h+'" viewBox="0 0 24 24" fill="currentColor"><path d="'+HOME+'"/></svg></div> <span class="nav-name '+h+'">主页</span></div></a>';
    ul.insertBefore(li,ul.firstChild);
    li.firstChild.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();document.documentElement.classList.remove('m-aside-open');show()});
    if(on)li.firstChild.classList.add('m-active');
  }
  /* AL's router has no /home route: its catch-all replaceState()s #/home to the last list. While 主页 is shown keep #/home in the URL and remember that route instead. */
  var _rs=history.replaceState,rehome=0;
  history.replaceState=function(st,t,u){var r=_rs.apply(history,arguments);try{if(on&&u!=null){var x=String(u),k=x.indexOf('#'),h=k>=0?x.slice(k):'';if(h&&h!=='#/home'){prevHash=h;rehome++;setTimeout(function(){rehome--;if(on&&location.hash===h)_rs.call(history,history.state,'','#/home')},0)}}}catch(e){}return r};
  window.addEventListener('popstate',function(){if(location.hash==='#/home'&&!on)show()});
  function restore(){if(!on&&location.hash==='#/home'&&prevHash!=null){try{history.replaceState(history.state,'',prevHash||location.pathname+location.search)}catch(e){}}}
  function hide(nav){if(!on)return;on=false;if(nav)setTimeout(restore,400);else restore();closeEd();gen++;var b=document.getElementById('m-home');if(b)b.remove();document.documentElement.classList.remove('m-home-on');var n=document.getElementById('m-home-nav');if(n)n.classList.remove('m-active')}
  function fmtTime(ts){try{return new Date(ts).toLocaleString('zh-CN',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}}
  function noticeCard(box,n){
    var c=el('div','m-home-card m-home-notice');var hd=el('div','m-home-nh');
    hd.appendChild(el('span','m-home-tag','公告'));hd.appendChild(el('span','m-home-nt',n.title||'管理员公告'));c.appendChild(hd);
    c.appendChild(el('div','m-home-nb',n.text));c.appendChild(el('div','m-home-ts','更新于 '+fmtTime(n.ts)));box.appendChild(c);
  }
  /* 主页推送 (2026-10-12): admin pushes with mode home show as cards under the notice until dismissed (per user, localStorage) or the 24h TTL */
  var pbox=null,puser='';
  function dis(){try{return JSON.parse(localStorage.getItem('al-homepush:'+puser)||'[]')}catch(e){return []}}
  function pushCards(){
    var box=pbox,g=gen;if(!box||!on)return;
    fetch('/__gw/push?a=0',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){
      if(g!==gen||!j||!j.list)return;puser=j.u||'';var d=dis();box.textContent='';
      j.list.filter(function(p){return p.mode==='home'&&d.indexOf(p.id)<0}).sort(function(a,b){return b.ts-a.ts}).forEach(function(p){
        var c=el('div','m-home-card m-home-notice m-home-push');var hd=el('div','m-home-nh');
        hd.appendChild(el('span','m-home-tag','推送'));hd.appendChild(el('span','m-home-nt',p.title||'管理员通知'));
        var x=el('button','m-home-px','×');x.type='button';x.title='关闭';x.setAttribute('aria-label','关闭');hd.appendChild(x);c.appendChild(hd);
        c.appendChild(el('div','m-home-nb',p.text));c.appendChild(el('div','m-home-ts','推送于 '+fmtTime(p.ts)));
        x.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();var d=dis();if(d.indexOf(p.id)<0)d.push(p.id);try{localStorage.setItem('al-homepush:'+puser,JSON.stringify(d.slice(-100)))}catch(er){}c.remove()});
        box.appendChild(c);
      });
    }).catch(function(){});
  }
  var covers={},HEART='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  /* 每日推荐 cover (2026-10-12): fixed vector sun, not editable */
  function isDaily(l){return l&&l.name==='每日推荐'&&l.type==='general'}
  var SUN='<svg class="m-home-heart m-home-sun" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4.6"/><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.85 1.85M17.35 17.35l1.85 1.85M4.8 19.2l1.85-1.85M17.35 6.65l1.85-1.85"/></g></svg>';
  function isEmo(e){try{return e.length<=32&&[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(e)].length===1&&/^[\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F\u20E3]+$/u.test(e)&&/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(e)}catch(x){return false}}
  function paint(cv,l,love){
    cv.textContent='';
    if(love){cv.innerHTML='<svg class="m-home-heart" viewBox="0 0 24 24" fill="currentColor"><path d="'+HEART+'"/></svg>';return}
    /* 2026-10-20: every list except 我喜欢 uses its first song's cover (window.__alLcov); no emoji */
    cv.dataset.lid=l.id;cv.dataset.ph=Array.from(l.name||'?')[0];
    var u=window.__alLcov&&window.__alLcov.get(l.id);
    if(u){var im=el('img','m-home-img');im.referrerPolicy='no-referrer';im.decoding='async';im.alt='';im.onerror=function(){im.remove();if(!cv.querySelector('.m-home-ph'))cv.appendChild(el('span','m-home-ph',cv.dataset.ph))};im.src=u;cv.appendChild(im)}
    else cv.appendChild(el('span','m-home-ph',cv.dataset.ph));
  }
  function closeEd(){var p=document.getElementById('m-home-ed');if(p)p.remove()}
  function editCover(btn,cv,l){
    closeEd();
    var p=el('div');p.id='m-home-ed';
    p.appendChild(el('div','t','设置封面 emoji'));
    var inp=el('input');inp.type='text';inp.maxLength=32;inp.placeholder='输入或粘贴一个 emoji';inp.value=covers[l.id]||'';p.appendChild(inp);
    var row=el('div','picks');'🎵 🎧 🎸 🎹 🎤 💿 🌙 ☀️ 🔥 🌸 🍀 ⭐ 💖 🌊 ☕ 🎮 🚗 🐱'.split(' ').forEach(function(x){var k=el('button','pk',x);k.type='button';k.addEventListener('click',function(){inp.value=x;inp.focus()});row.appendChild(k)});p.appendChild(row);
    var err=el('div','err');p.appendChild(err);
    var bar=el('div','bar'),rs=el('button','rs','恢复默认'),cc=el('button','cc','取消'),ok=el('button','ok','保存');[rs,cc,ok].forEach(function(x){x.type='button';bar.appendChild(x)});p.appendChild(bar);
    function save(v){
      if(v&&!isEmo(v)){err.textContent='只能填一个 emoji';return}
      err.textContent='';ok.disabled=rs.disabled=true;
      fetch('/__gw/covers',{method:'POST',credentials:'same-origin',headers:{'x-al':'1','Content-Type':'application/x-www-form-urlencoded'},body:'id='+encodeURIComponent(l.id)+'&e='+encodeURIComponent(v)})
        .then(function(r){return r.json()}).then(function(j){ok.disabled=rs.disabled=false;if(!j.ok){err.textContent=j.err||'保存失败';return}if(v)covers[l.id]=v;else delete covers[l.id];paint(cv,l,false);closeEd()})
        .catch(function(){ok.disabled=rs.disabled=false;err.textContent='保存失败，请重试'});
    }
    ok.addEventListener('click',function(){save(inp.value.trim())});rs.addEventListener('click',function(){save('')});cc.addEventListener('click',closeEd);
    inp.addEventListener('keydown',function(e){e.stopPropagation();if(e.key==='Enter')save(inp.value.trim());if(e.key==='Escape')closeEd()});
    ['mousedown','pointerdown','click','touchstart','wheel','keyup'].forEach(function(t){p.addEventListener(t,function(e){e.stopPropagation()})});
    document.body.appendChild(p);
    var r=btn.getBoundingClientRect(),w=p.offsetWidth,h=p.offsetHeight;
    var x=Math.min(Math.max(8,r.right-w),innerWidth-w-8),y=r.bottom+6;if(y+h>innerHeight-8)y=Math.max(8,r.top-h-6);
    p.style.left=x+'px';p.style.top=y+'px';setTimeout(function(){inp.focus();inp.select()},30);
  }
  document.addEventListener('mousedown',function(e){var p=document.getElementById('m-home-ed');if(p&&!p.contains(e.target))closeEd()});
  function listCard(grid,l,my){
    var love=l.id===my,c=el('a','m-home-card m-home-list');c.href='#/library?id='+encodeURIComponent(l.id);
    var cv=el('div','m-home-cover'+(love?' love':''));paint(cv,l,love);
    var wrapC=el('div','m-home-cw');wrapC.appendChild(cv);
    if(false){var eb=el('button','m-home-eb');eb.type='button';eb.title='修改封面';eb.setAttribute('aria-label','修改封面');
      eb.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      eb.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();editCover(eb,cv,l)});wrapC.appendChild(eb)}
    c.appendChild(wrapC);
    c.appendChild(el('div','m-home-ln',l.name));var meta=el('div','m-home-lm',l.type==='remote'?'收藏的在线歌单':(love?'我喜欢的歌曲':(l.name==='每日推荐'&&l.type==='general'?'每天自动更新':'自建歌单')));c.appendChild(meta);
    c.addEventListener('click',function(){closeEd();hide(true);setTimeout(function(){fromHome=location.hash},400)});
    grid.appendChild(c);
    var g=gen;try{Promise.resolve(window.__alLib.musics(l.id)).then(function(ms){if(g!==gen||!ms)return;meta.textContent=ms.length+' 首 · '+meta.textContent}).catch(function(){})}catch(e){}
  }
  function show(){
    var v=view();if(!v){setTimeout(show,300);return}
    var boot=!opened;hide(true);on=true;opened=true;drawnN=-1;
    if(location.hash!=='#/home'){prevHash=location.hash;try{history[boot?'replaceState':'pushState'](history.state,'','#/home')}catch(e){}}else if(prevHash==null)prevHash='';var g=++gen;document.documentElement.classList.add('m-home-on');
    var n=document.getElementById('m-home-nav');if(n)n.classList.add('m-active');
    var b=el('div');b.id='m-home';var wrap=el('div','m-home-wrap');b.appendChild(wrap);
    wrap.appendChild(el('h2','m-home-h','主页'));
    var nb=el('div','m-home-nbox');wrap.appendChild(nb);
    pbox=el('div','m-home-nbox m-home-pbox');wrap.appendChild(pbox);
    wrap.appendChild(el('h3','m-home-sh','我的歌单'));var grid=el('div','m-home-grid');wrap.appendChild(grid);
    if(getComputedStyle(v).position==='static')v.style.position='relative';
    v.appendChild(b);
    fetch('/__gw/notice',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){if(g===gen&&j&&j.text)noticeCard(nb,j)}).catch(function(){});
    pushCards();
    (function fill(t){
      if(g!==gen)return;
      if(!window.__alLib){if(t<40)setTimeout(function(){fill(t+1)},250);else grid.appendChild(el('div','m-home-empty','歌单加载失败，请刷新页面'));return}
      var ls=[];try{ls=window.__alLib.lists()}catch(e){}
      var love=ls.filter(function(l){return l.name==='我喜欢'})[0];
      var mine=ls.filter(function(l){return l.type});
      if(!love&&!mine.length&&t<40){setTimeout(function(){fill(t+1)},250);return}
      var draw=function(){if(g!==gen)return;grid.textContent='';
      if(love)listCard(grid,love,love.id);
      drawnN=mine.length;mine.forEach(function(l){listCard(grid,l,love&&love.id)});
      if(!mine.length)grid.appendChild(el('div','m-home-empty','还没有自建或收藏的歌单，可以在左侧“我的列表”里新建，或在在线歌单里点收藏。'));
      };
      draw();
    })(0);
  }
  /* the app redirects to its last list right after boot: ignore route changes the user did not cause during the first seconds */
  var autoAt=0,act=0;['pointerdown','keydown','touchstart'].forEach(function(t){document.addEventListener(t,function(){act=Date.now()},true)});
  window.addEventListener('hashchange',function(){if(location.hash==='#/home'){if(!on)show();return}if(on&&rehome>0)return;if(Date.now()-autoAt<6000&&Date.now()-act>1500){if(on){prevHash=location.hash;try{history.replaceState(history.state,'','#/home')}catch(e){}}return}hide()});
  document.addEventListener('click',function(e){if(!on)return;var a=e.target.closest&&e.target.closest('#app-main .aside a, #app-main .aside .my-list-container .container');if(a&&a.id!=='m-home-nav')hide(true)},true);
  window.__alObs(function(){nav();if(on&&!document.getElementById('m-home'))show();
    /* user lists can load after 主页 rendered (or a list was added/removed): redraw when the count changes */
    if(on&&drawnN>=0&&window.__alLib&&window.__alLib.ul&&window.__alLib.ul().filter(function(l){return l.type}).length!==drawnN&&!document.getElementById('m-home-ed'))show();
    if(!opened&&document.querySelector('#app-main .aside .aside-nav')&&view()&&window.__alLib){autoAt=Date.now();show()}});
  /* toolbar 返回 after opening a list from 主页 goes back to 主页 (native back only knows online-search history) */
  var fromHome=null;
  window.addEventListener('hashchange',function(){if(fromHome&&location.hash!==fromHome)fromHome=null});
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('#app-right .toolbar [aria-label="返回"]');
    if(!b||on||!fromHome||location.hash!==fromHome)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();fromHome=null;show()},true);
  window.__alHome={show:show,hide:hide,pushes:pushCards,
    cover:function(id){if(!on)return;var cs=document.querySelectorAll('#m-home .m-home-cover:not(.love)');for(var i=0;i<cs.length;i++)if(cs[i].dataset.lid===id){var l={id:id,name:cs[i].dataset.ph};paint(cs[i],l,false)}}};
})();
/* 每日推荐 (2026-10-12): the gateway builds 30 songs a day (/__gw/daily, QQ similar songs from history + lists);
   keep a native list named 每日推荐 (first in 我的列表) overwritten with today's songs via the bundle's list actions (__alLib.act). */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var NAME='每日推荐',busy=false,tries=0,doneDate='',stable=null;
  function rid(){var s='',c='abcdefghijklmnopqrstuvwxyz0123456789';for(var i=0;i<11;i++)s+=c[Math.floor(Math.random()*36)];return s}
  function ready(){
    var L=window.__alLib;if(!L||!L.act||!L.ul)return false;
    /* user lists load asynchronously: wait until the list count is unchanged for two checks so an empty early read never creates a duplicate */
    var n=L.ul().length;if(stable&&stable.n===n&&Date.now()-stable.t>=3000)return true;
    if(!stable||stable.n!==n)stable={n:n,t:Date.now()};return false;
  }
  function find(){return window.__alLib.ul().filter(function(l){return l.name===NAME&&l.type==='general'})[0]}
  function sync(){
    if(busy)return;if(!ready()){setTimeout(sync,1500);return}
    busy=true;
    fetch('/__gw/daily',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){
      if(!j){busy=false;return}
      if(j.pending){busy=false;if(++tries<=6)setTimeout(sync,40000);return}
      var L=window.__alLib,now=Date.now(),keep=null,extra=[],created=false,p;
      /* 2026-10-19: the gateway reads the user's DB for existing 每日推荐 ids (j.ids), so a late-loading local list state can no longer
         cause a second list, and extras (two devices at the same moment) are removed; local state is only the fallback */
      if(Array.isArray(j.ids)){keep=j.ids[0]||null;extra=j.ids.slice(1)}
      else{var mine=window.__alLib.ul().filter(function(l){return l.name===NAME&&l.type==='general'});keep=mine[0]?mine[0].id:null;extra=mine.slice(1).map(function(l){return l.id})}
      var rm=extra.length?Promise.resolve(L.act({action:'list_remove',data:extra})).catch(function(e){console.warn('daily dedupe',e)}):Promise.resolve();
      if(j.date===doneDate||!j.list||!j.list.length){return rm.then(function(){busy=false})}
      if(keep)p=Promise.resolve(keep);
      else{var id=rid();created=true;p=L.act({action:'list_create',data:{position:0,listInfos:[{id:id,type:'general',name:NAME,parentId:null,meta:{createTime:now,desc:'',playCount:0,songCount:0,pic:'',posTime:now,updateTime:now}}]}}).then(function(){return id})}
      return rm.then(function(){return p}).then(function(id){
        return Promise.resolve(created?[]:L.musics(id)).then(function(ms){
          ms=ms||[];
          var same=ms.length===j.list.length&&ms.every(function(m,i){return m.id===j.list[i].id});
          if(same)return false;
          var infos=j.list.map(function(m,i){var x=JSON.parse(JSON.stringify(m));x.meta=x.meta||{};x.meta.createTime=now+i;x.meta.updateTime=now;return x});
          return L.act({action:'list_music_overwrite',data:{listId:id,musicInfos:infos}}).then(function(){return true});
        });
      }).then(function(ch){busy=false;doneDate=j.date;if((ch||created||extra.length)&&document.getElementById('m-home')&&window.__alHome)setTimeout(window.__alHome.show,600)});
    }).catch(function(e){busy=false;console.warn('daily',e)});
  }
  setTimeout(sync,4000);
  setInterval(function(){if(!document.hidden){tries=0;sync()}},30*60e3);
  window.__alDaily={sync:sync};
})();

/* Folia 详情页 (2026-10-14): the song-detail page can render with Folia Major's lyric visualizer (AGPL-3.0, chthollyphile).
   localStorage al-detail-style = 'folia' | 'al' (原版); unset → 原版 on phones, Folia on desktop (2026-10-14). The bundle /__m/folia/folia-player.js is import()ed only when
   the detail page opens in Folia style, mounted full-screen in #m-folia (shadow DOM) over .play-detail, and unmounted (no rAF /
   WebGL left running) when the page closes or the user switches to 原版. Needs bundle hooks __alPl.info/exec/detail/shown + __alLrc.off;
   if they or the bundle are missing it falls back to the original page with a console warning. Switching never touches playback. */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var FV='6',K='al-detail-style',SRC='/__m/folia/folia-player.js?v='+FV;
  var mqP=window.matchMedia('(max-width: 820px), (pointer: coarse) and (max-width: 1024px)');
  var mod=null,loading=null,handle=null,host=null,failed=false,warned=false,pdSeen=null,closing=0;
  function style(){var d=mqP.matches?'al':'folia';try{var v=localStorage.getItem(K);return v==='al'||v==='folia'?v:d}catch(e){return d}}
  function setStyle(v){try{localStorage.setItem(K,v)}catch(e){}sync();paintTog()}
  function hooks(){var P=window.__alPl,L=window.__alLrc;return !!(P&&P.info&&P.exec&&P.progress&&L&&L.t)}
  function warn(m,e){if(!warned){warned=true;console.warn('[folia] '+m+' — using the original detail page',e||'')}}
  function exec(c,a){try{var P=window.__alPl;if(arguments.length>1)P.exec(c,a);else P.exec(c)}catch(e){console.warn('[folia]',c,e)}}
  var api={
    snapshot:function(){var P=window.__alPl,m=P.info()||{},g=P.progress()||{};
      return {id:m.id!=null?String(m.id):null,name:m.name||'',singer:m.singer||'',album:m.album||'',pic:m.pic||null,lrc:m.lrc||null,tlrc:m.tlrc||null,rlrc:m.rlrc||null,awlrc:m.awlrc||null,
        playing:!!P.playing(),duration:+g.maxPlayTime||0,volume:P.vol?+P.vol()||0:1,muted:P.mute?!!P.mute():false,rate:P.rate?+P.rate()||1:1,playMode:P.pmode?String(P.pmode()||'listLoop'):'',loved:P.loved?!!P.loved():null}},
    time:function(){var L=window.__alLrc,t=+L.t()||0;return t+(L.off?+L.off()||0:0)},
    toggle:function(){exec('player.togglePlay')},
    prev:function(){exec('player.skipPrev')},
    next:function(){exec('player.skipNext')},
    seek:function(s){try{window.__alPl.seek(Math.max(0,+s||0))}catch(e){}},
    setVolume:function(v){exec('player.setVolume',Math.round(Math.max(0,Math.min(1,+v||0))*100)/100)},
    setMute:function(m){exec('player.setVolumeMute',!!m)},
    close:function(){var P=window.__alPl;unmount();if(P&&P.detail){P.detail(false);return}var b=document.querySelector('.play-detail button.hide');if(b)b.click();else unmount()},
    toOriginal:function(){setStyle('al')},
    setLoved:function(v){try{var P=window.__alPl;if(P.love)P.love(!!v)}catch(e){console.warn('[folia] love',e)}},
    setPlayMode:function(m){try{var P=window.__alPl;if(P.setPmode)P.setPmode(String(m))}catch(e){console.warn('[folia] mode',e)}},
    queue:function(){var P=window.__alPl;if(!P||!P.queue)return null;var q=P.queue()||[];return q.map(function(x){var m=x.musicInfo||{};var pu=(m.meta&&m.meta.picUrl)||null;if(pu&&/^http:\/\//.test(pu))pu='https://'+pu.slice(7);if(pu){pu=pu.replace(/(y\.gtimg\.cn\/music\/photo_new\/T00\dR)\d+x\d+/,'$1150x150');if(/music\.126\.net\//.test(pu)&&pu.indexOf('param=')<0)pu+=(pu.indexOf('?')<0?'?':'&')+'param=100y100'}return {id:String(x.itemId),name:m.name||'',singer:m.singer||'',later:!!x.playLater,pic:pu}})},
    currentItem:function(){var P=window.__alPl;try{var c=P&&P.cur?P.cur():null;return c!=null?String(c):null}catch(e){return null}},
    playItem:function(id){try{var P=window.__alPl;if(P.playItem)P.playItem(String(id))}catch(e){console.warn('[folia] playItem',e)}},
    fail:function(e){failed=true;warn('view crashed',e);unmount()},
    isPhone:function(){return mqP.matches}
  };
  function load(){
    if(mod)return Promise.resolve(mod);
    if(!loading)loading=import(SRC).then(function(m){if(!m||typeof m.mount!=='function')throw new Error('bad module');mod=m;return m});
    return loading;
  }
  function mount(pd){
    if(handle||failed)return;
    if(!host){host=document.createElement('div');host.id='m-folia';
      ['click','mousedown','pointerdown','dblclick','contextmenu','wheel','keydown','touchstart'].forEach(function(t){host.addEventListener(t,function(e){e.stopPropagation()})})}
    load().then(function(m){
      if(handle||failed||style()!=='folia'||!document.querySelector('.play-detail'))return;
      var z=parseInt(getComputedStyle(pd).zIndex,10);host.style.zIndex=String((z>0?z:10)+5);
      host.classList.remove('m-out');document.body.appendChild(host);
      try{handle=m.mount(host,api)}catch(e){failed=true;warn('mount failed',e);host.remove();return}
      document.documentElement.classList.add('m-folia-on');
    }).catch(function(e){failed=true;loading=null;warn('bundle failed to load',e)});
  }
  function unmount(){
    document.documentElement.classList.remove('m-folia-on');
    if(handle){var h=handle;handle=null;try{h.unmount()}catch(e){}}
    if(host&&host.parentNode)host.remove();
  }
  function paintTog(){
    var t=document.getElementById('m-folia-tog');if(!t)return;
    t.querySelector('[data-s=folia]').classList.toggle('on',style()==='folia');t.querySelector('[data-s=al]').classList.toggle('on',style()==='al');
  }
  function tog(pd){
    if(pd.querySelector('#m-folia-tog'))return;
    var t=document.createElement('div');t.id='m-folia-tog';t.setAttribute('role','group');t.title='详情页样式';
    t.innerHTML='<button type="button" data-s="folia">Folia</button><button type="button" data-s="al">原版</button>';
    ['mousedown','pointerdown','dblclick','contextmenu'].forEach(function(n){t.addEventListener(n,function(e){e.stopPropagation()})});
    t.addEventListener('click',function(e){e.stopPropagation();var b=e.target.closest('button');if(!b)return;if(b.dataset.s==='folia'){failed=false;warned=false}setStyle(b.dataset.s)});
    pd.appendChild(t);paintTog();
  }
  function sync(){
    var pd=document.querySelector('.play-detail');
    var P=window.__alPl,shown=!(P&&P.shown)||P.shown();   /* hidden but still animating out: drop Folia right away */
    if(!pd||!shown){if(handle||host&&host.parentNode)unmount();return}
    tog(pd);
    if(style()==='folia'&&!failed){if(!hooks()){warn('bundle hooks missing (stale indexBzjGy48v.js?)');return}mount(pd)}
    else if(handle||host&&host.parentNode)unmount();
  }
  window.__alFolia={style:style,set:setStyle,mod:function(){return mod},state:function(){return {style:style(),mounted:!!handle,failed:failed,loaded:!!mod,mode:mod&&mod.getMode?mod.getMode():null}}};
  if(window.__alObs)window.__alObs(sync);
})();

/* 歌单管理 (2026-10-14): toolbar in the sidebar 我的列表 header — 新建 (blank or from a share link), 更新 (re-sync link-imported lists), 多选管理 (batch update / delete).
   Uses bundle hooks __alLib.{ul,act,sync,sld,tip}. */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var sel=null,busy=false;
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function L(){var l=window.__alLib;return l&&l.ul&&l.act&&l.sync?l:null}
  function tip(m){var l=window.__alLib;if(l&&l.tip)try{l.tip(m);return}catch(e){}console.log(m)}
  function rid(){var s='',c='abcdefghijklmnopqrstuvwxyz0123456789';for(var i=0;i<11;i++)s+=c[Math.floor(Math.random()*36)];return s}
  var SVG={add:'<path d="M12 5v14M5 12h14"/>',sync:'<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>',sel:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'};
  function ico(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+SVG[k]+'</svg>'}
  function btn(k,title,fn){var b=el('button','m-pl-btn');b.type='button';b.title=title;b.setAttribute('aria-label',title);b.innerHTML=ico(k);b.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();fn()});return b}
  function header(){var hs=document.querySelectorAll('#app-main .aside h2');for(var i=0;i<hs.length;i++)if(hs[i].textContent.trim()==='我的列表')return hs[i].parentElement;return null}
  function online(){var l=L();return l?l.ul().filter(function(x){return x.type==='online'&&x.meta&&x.meta.syncId}):[]}
  function guess(t){
    if(/163\.com|163cn\.tv|网易云/.test(t))return 'wy';if(/qq\.com|QQ音乐/i.test(t))return 'tx';
    if(/kugou|酷狗/.test(t))return 'kg';if(/kuwo|酷我/.test(t))return 'kw';if(/migu|咪咕/.test(t))return 'mg';return '';
  }
  /* ---------- toolbar ---------- */
  function tools(){
    var h=header();if(!h)return;
    var t=document.getElementById('m-pl-tools');
    if(t&&t.parentNode===h){t.classList.toggle('sel',!!sel);return}
    if(t)t.remove();
    h.classList.add('m-pl-head');
    t=el('div');t.id='m-pl-tools';
    var n=el('div','m-pl-norm');
    n.appendChild(btn('add','新建歌单',openNew));
    n.appendChild(btn('sync','更新全部链接歌单',function(){update(online())}));
    n.appendChild(btn('sel','多选管理',function(){enter()}));
    var s=el('div','m-pl-selbar');
    var all=el('button','m-pl-tbtn','全选');all.type='button';all.dataset.a='all';
    var up=el('button','m-pl-tbtn','更新');up.type='button';up.dataset.a='up';
    var del=el('button','m-pl-tbtn danger','删除');del.type='button';del.dataset.a='del';
    var ok=el('button','m-pl-tbtn','完成');ok.type='button';ok.dataset.a='done';
    [all,up,del,ok].forEach(function(b){s.appendChild(b)});
    s.addEventListener('click',function(e){var b=e.target.closest('button');if(!b)return;e.preventDefault();e.stopPropagation();
      var a=b.dataset.a,l=L();if(!l)return;
      if(a==='all'){var ids=l.ul().map(function(x){return x.id});var full=ids.every(function(i){return sel.has(i)});sel=new Set(full?[]:ids);marks()}
      else if(a==='up'){var us=l.ul().filter(function(x){return sel.has(x.id)});var on=us.filter(function(x){return x.type==='online'&&x.meta&&x.meta.syncId});
        if(!us.length)return tip('请先勾选歌单');if(!on.length)return tip('所选歌单都不是从分享链接导入的，无需更新');update(on,us.length-on.length)}
      else if(a==='del')remove();
      else if(a==='done')exit();
    });
    t.appendChild(n);t.appendChild(s);h.appendChild(t);t.classList.toggle('sel',!!sel);
  }
  /* ---------- multi-select ---------- */
  function items(){return document.querySelectorAll('#app-main .aside .my-list-container li.list-item:not(.default-list)')}
  function marks(){
    var aside=document.querySelector('#app-main .aside');if(aside)aside.classList.toggle('m-pl-selmode',!!sel);
    items().forEach(function(li){var c=li.querySelector('.m-pl-chk');
      if(!sel){if(c)c.remove();li.classList.remove('m-pl-on');return}
      if(!c){c=el('span','m-pl-chk');li.appendChild(c)}
      li.classList.toggle('m-pl-on',sel.has(li.dataset.id));
    });
    var bar=document.querySelector('#m-pl-tools .m-pl-selbar');
    if(bar&&sel){var n=sel.size;bar.querySelector('[data-a=up]').textContent=n?'更新('+n+')':'更新';bar.querySelector('[data-a=del]').textContent=n?'删除('+n+')':'删除';
      var l=L();bar.querySelector('[data-a=all]').textContent=l&&l.ul().length&&l.ul().every(function(x){return sel.has(x.id)})?'全不选':'全选'}
  }
  function enter(){sel=new Set();tools();marks()}
  function exit(){sel=null;tools();marks()}
  ['click','pointerdown','mousedown','touchstart','contextmenu','dragstart'].forEach(function(t){
    document.addEventListener(t,function(e){
      if(!sel)return;var li=e.target.closest&&e.target.closest('#app-main .aside .my-list-container li.list-item');if(!li)return;
      e.preventDefault();e.stopPropagation();
      if(t!=='click')return;
      if(li.classList.contains('default-list'))return tip('「我喜欢」和「试听列表」是系统列表，不能删除');
      var id=li.dataset.id;if(sel.has(id))sel.delete(id);else sel.add(id);marks();
    },true);
  });
  document.addEventListener('keydown',function(e){if(sel&&e.key==='Escape'&&!document.getElementById('m-pl-modal'))exit()});
  /* ---------- update (re-sync) ---------- */
  function update(lists,skipped){
    var l=L();if(!l)return;if(busy)return tip('正在更新中，请稍候');
    if(!lists.length)return tip('没有从分享链接导入的歌单可以更新');
    busy=true;var ok=0,bad=[],i=0;document.documentElement.classList.add('m-pl-busy');
    tip('开始更新 '+lists.length+' 个歌单…');
    (function next(){
      if(i>=lists.length){busy=false;document.documentElement.classList.remove('m-pl-busy');
        tip('更新完成：成功 '+ok+' 个'+(bad.length?'，失败 '+bad.length+' 个（'+bad.join('、')+'）':'')+(skipped?'，跳过 '+skipped+' 个非链接歌单':''));return}
      var x=lists[i++];
      Promise.resolve(l.sync(x.id)).then(function(){ok++},function(e){bad.push(x.name);console.warn('pl sync',x.name,e)}).then(next);
    })();
  }
  /* ---------- delete ---------- */
  function remove(){
    var l=L();if(!l)return;var ls=l.ul().filter(function(x){return sel.has(x.id)});
    if(!ls.length)return tip('请先勾选要删除的歌单');
    modal('删除歌单',function(body,foot,close){
      body.appendChild(el('p','m-pl-p','确定删除以下 '+ls.length+' 个歌单？删除后无法恢复。'));
      var u=el('ul','m-pl-names');ls.forEach(function(x){u.appendChild(el('li',null,x.name))});body.appendChild(u);
      var go=el('button','m-pl-tbtn danger solid','删除');go.type='button';foot.appendChild(go);
      go.addEventListener('click',function(){go.disabled=true;
        var ids=ls.map(function(x){return x.id}),cur=(/[?&]id=([^&]+)/.exec(location.hash)||[])[1];
        Promise.resolve(l.act({action:'list_remove',data:ids})).then(function(){
          close();tip('已删除 '+ids.length+' 个歌单');
          if(cur&&ids.indexOf(decodeURIComponent(cur))>=0&&/^#\/library/.test(location.hash))location.hash='#/library?id=love';
          exit();
        },function(e){go.disabled=false;tip('删除失败：'+(e&&e.message||e))});
      });
    });
  }
  /* ---------- create ---------- */
  function openNew(){
    var l=L();if(!l)return tip('播放器还没加载完，请稍后再试');
    modal('新建歌单',function(body,foot,close){
      var tabs=el('div','m-pl-tabs'),t1=el('button','on','空白歌单'),t2=el('button',null,'从分享链接导入');t1.type=t2.type='button';tabs.appendChild(t1);tabs.appendChild(t2);body.appendChild(tabs);
      var f1=el('div','m-pl-form'),name=el('input');name.placeholder='歌单名称';name.maxLength=60;f1.appendChild(name);
      var f2=el('div','m-pl-form');f2.style.display='none';
      var link=el('textarea');link.rows=3;link.placeholder='粘贴 QQ音乐 / 网易云 / 酷狗 / 酷我 / 咪咕 的歌单分享链接或分享文字';
      var row=el('div','m-pl-row'),src=el('select');[['','自动识别平台'],['tx','QQ音乐'],['wy','网易云音乐'],['kg','酷狗音乐'],['kw','酷我音乐'],['mg','咪咕音乐']].forEach(function(o){var op=el('option',null,o[1]);op.value=o[0];src.appendChild(op)});
      var nm2=el('input');nm2.placeholder='歌单名称（留空则用原歌单名）';nm2.maxLength=60;row.appendChild(src);row.appendChild(nm2);
      f2.appendChild(link);f2.appendChild(row);f2.appendChild(el('div','m-pl-hint','导入后可随时点「更新」同步原歌单的最新歌曲。'));
      var msg=el('div','m-pl-msg');body.appendChild(f1);body.appendChild(f2);body.appendChild(msg);
      var mode=1;function sw(m){mode=m;t1.classList.toggle('on',m===1);t2.classList.toggle('on',m===2);f1.style.display=m===1?'':'none';f2.style.display=m===2?'':'none';msg.textContent='';setTimeout(function(){(m===1?name:link).focus()},30)}
      t1.addEventListener('click',function(){sw(1)});t2.addEventListener('click',function(){sw(2)});
      var go=el('button','m-pl-tbtn solid','创建');go.type='button';foot.appendChild(go);
      name.addEventListener('keydown',function(e){if(e.key==='Enter')go.click()});
      go.addEventListener('click',function(){
        msg.textContent='';var now=Date.now(),id=rid();
        if(mode===1){
          var n=name.value.trim();if(!n){msg.textContent='请输入歌单名称';return}
          go.disabled=true;
          Promise.resolve(l.act({action:'list_create',data:{position:l.ul().length,listInfos:[{id:id,type:'general',name:n,parentId:null,meta:{createTime:now,desc:'',playCount:0,songCount:0,pic:'',posTime:now,updateTime:now}}]}}))
            .then(function(){close();tip('已新建歌单「'+n+'」');location.hash='#/library?id='+id},function(e){go.disabled=false;msg.textContent='创建失败：'+(e&&e.message||e)});
          return;
        }
        var t=link.value.trim();if(!t){msg.textContent='请粘贴歌单分享链接';return}
        var s=src.value||guess(t);if(!s){msg.textContent='识别不出平台，请手动选择';return}
        var dup=l.ul().filter(function(x){return x.type==='online'&&x.meta&&x.meta.source===s&&x.meta.syncId===t})[0];
        if(dup){msg.textContent='这个歌单已经导入过了：「'+dup.name+'」';return}
        go.disabled=true;msg.textContent='正在读取歌单…';
        Promise.resolve(l.sld({extensionId:'online-metadata',source:s,id:t,page:1,limit:30})).then(function(r){
          var info=(r&&r.info)||{},n=nm2.value.trim()||info.name||'导入歌单 '+new Date().toLocaleString();
          msg.textContent='正在导入「'+n+'」'+(r&&r.total?'（共 '+r.total+' 首）':'')+'…';
          return Promise.resolve(l.act({action:'list_create',data:{position:l.ul().length,listInfos:[{id:id,type:'online',name:n,parentId:null,meta:{extensionId:'online-metadata',source:s,pic:info.img||info.pic||'',desc:'',syncId:t,createTime:now,updateTime:now,playCount:0,posTime:now,songCount:(r&&r.total)||0,syncTime:0,sourceType:'songlist'}}]}}))
            .then(function(){return l.sync(id)}).then(function(){close();tip('已导入歌单「'+n+'」');location.hash='#/library?id='+id});
        }).catch(function(e){go.disabled=false;msg.textContent='导入失败：'+(e&&e.message||e)+'。请检查链接是否正确、歌单是否公开。'});
      });
      setTimeout(function(){name.focus()},50);
    });
  }
  /* ---------- modal ---------- */
  function modal(title,build){
    var old=document.getElementById('m-pl-modal');if(old)old.remove();
    var o=el('div');o.id='m-pl-modal';var box=el('div','m-pl-box'),hd=el('div','m-pl-mh'),x=el('button','m-pl-x','×');x.type='button';x.setAttribute('aria-label','关闭');
    hd.appendChild(el('span',null,title));hd.appendChild(x);var body=el('div','m-pl-mb'),foot=el('div','m-pl-mf'),cancel=el('button','m-pl-tbtn','取消');cancel.type='button';foot.appendChild(cancel);
    box.appendChild(hd);box.appendChild(body);box.appendChild(foot);o.appendChild(box);
    function close(){o.remove()}
    x.addEventListener('click',close);cancel.addEventListener('click',close);o.addEventListener('click',function(e){if(e.target===o)close()});
    ['mousedown','pointerdown','click','dblclick','contextmenu','wheel','keydown','touchstart'].forEach(function(t){o.addEventListener(t,function(e){if(t==='keydown'&&e.key==='Escape')close();e.stopPropagation()})});
    build(body,foot,close);document.body.appendChild(o);
  }
  window.__alPlMgr={open:openNew,update:function(){update(online())},enter:enter,exit:exit};
  if(window.__alObs)window.__alObs(function(){tools();if(sel)marks()});
})();

/* song list: header click sort (name/singer/album asc↔desc, with undo) + drag rows to reorder (2026-10-18).
   Both persist through AL's own list_music_update_position (remove ids, insert at position). */
(function(){
  var RE=/^#\/library\?(?:.*&)?id=([^&]+)/;
  function lid(){var m=location.hash.match(RE);return m?decodeURIComponent(m[1]):null}
  function lib(){return window.__alLib}
  var FIELDS=[{re:/^(歌曲名|歌名|song name|name)$/i,k:'name',n:'歌曲名'},{re:/^(艺术家|歌手|歌手名|artist|singer)$/i,k:'singer',n:'艺术家'},{re:/^(专辑名|专辑|album)$/i,k:'album',n:'专辑名'}];
  var state={},busy=false;
  var coll;try{coll=new Intl.Collator(['zh-Hans-CN-u-co-pinyin','zh-Hans','zh'],{numeric:true,sensitivity:'base'})}catch(e){coll=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'})}
  function val(m,k){var v=k==='album'?((m.meta&&(m.meta.albumName||m.meta.album))||m.albumName||''):(m[k]||'');return String(v).trim()}
  function act(id,pos,ids){return lib().act({action:'list_music_update_position',data:{listId:id,position:pos,ids:ids}})}
  /* toast with optional undo */
  var tEl=null,tT=0;
  function toast(msg,undo){
    if(!tEl){tEl=document.createElement('div');tEl.className='m-sort-toast';document.body.appendChild(tEl)}
    tEl.innerHTML='';var s=document.createElement('span');s.textContent=msg;tEl.appendChild(s);
    if(undo){var b=document.createElement('button');b.type='button';b.textContent='撤销';b.onclick=function(){hide();undo()};tEl.appendChild(b)}
    tEl.classList.add('on');clearTimeout(tT);tT=setTimeout(hide,undo?6000:2200);
    function hide(){tEl&&tEl.classList.remove('on')}
  }
  function headerOf(){var hs=document.querySelectorAll('div.header');for(var i=0;i<hs.length;i++){var h=hs[i];if(h.querySelector(':scope > .num')&&h.querySelector(':scope > span'))return h}return null}
  function decorate(){
    var id=lid(),h=id&&headerOf();if(!h)return;var st=state[id];
    [].forEach.call(h.querySelectorAll(':scope > span'),function(sp){
      var f=sp.dataset.mk?FIELDS.find(function(x){return x.k===sp.dataset.mk}):FIELDS.find(function(x){return x.re.test((sp.firstChild&&sp.firstChild.nodeValue||sp.textContent).trim())});
      if(!f)return;
      if(!sp.dataset.mk){sp.dataset.mk=f.k;sp.classList.add('m-sortable');sp.setAttribute('role','button');sp.setAttribute('tabindex','0');var i=document.createElement('i');i.className='m-sort-ind';i.setAttribute('aria-hidden','true');sp.appendChild(i)}
      var on=st&&st.k===f.k;sp.classList.toggle('m-sort-asc',!!(on&&st.dir==='asc'));sp.classList.toggle('m-sort-desc',!!(on&&st.dir==='desc'));
      sp.title=on?(st.dir==='asc'?'按'+f.n+'升序（点击改为降序）':'按'+f.n+'降序（点击改为升序）'):'按'+f.n+'排序';
    });
  }
  function sortBy(k){
    var id=lid();if(!id||busy||!lib())return;var st=state[id];var dir=st&&st.k===k&&st.dir==='asc'?'desc':'asc';var f=FIELDS.find(function(x){return x.k===k});
    busy=true;lib().musics(id).then(function(list){
      list=list||[];if(list.length<2){busy=false;return}
      var prev=list.map(function(m){return m.id});
      var arr=list.map(function(m,i){return {m:m,i:i,v:val(m,k)}});
      arr.sort(function(a,b){if(!a.v!==!b.v)return a.v?-1:1;var r=coll.compare(a.v,b.v);if(dir==='desc')r=-r;return r||a.i-b.i});
      var ids=arr.map(function(x){return x.m.id});
      if(ids.every(function(x,i){return x===prev[i]})){state[id]={k:k,dir:dir};decorate();busy=false;toast('已经是按'+f.n+(dir==='asc'?'升序':'降序')+'排列');return}
      return act(id,0,ids).then(function(){state[id]={k:k,dir:dir};decorate();
        toast('已按'+f.n+(dir==='asc'?'升序':'降序')+'排列',function(){act(id,0,prev).then(function(){delete state[id];decorate();toast('已恢复原来的顺序')})});
      });
    }).catch(function(e){console.warn('[sort]',e);toast('排序失败：'+(e&&e.message||e))}).then(function(){busy=false});
  }
  document.addEventListener('click',function(e){var sp=e.target.closest&&e.target.closest('.m-sortable');if(!sp)return;e.preventDefault();e.stopPropagation();sortBy(sp.dataset.mk)},true);
  document.addEventListener('keydown',function(e){if(e.key!=='Enter'&&e.key!==' ')return;var sp=e.target.closest&&e.target.closest('.m-sortable');if(!sp)return;e.preventDefault();sortBy(sp.dataset.mk)},true);
  var raf=0;new MutationObserver(function(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;decorate()})}).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',decorate);

  /* ---------- drag to reorder ---------- */
  var drag=null,suppressClick=false;
  function rowOf(t){if(!lid()||!t.closest)return null;if(t.closest('button,input,a,.music-heart-btn,.m-sortable'))return null;var li=t.closest('.my-list > ul > li');return li&&li.querySelector(':scope > .container')?li:null}
  function nameOf(li){var n=li.querySelector('.name');return n?(n.getAttribute('aria-label')||n.textContent||'').trim():''}
  function start(li,x,y){
    var ul=li.parentElement,box=ul.parentElement,rh=li.offsetHeight||52,from=Math.round(li.offsetTop/rh);
    var g=document.createElement('div');g.className='m-drag-ghost';var c=li.firstElementChild.cloneNode(true);g.appendChild(c);var r=li.getBoundingClientRect();g.style.width=r.width+'px';g.style.height=r.height+'px';document.body.appendChild(g);
    var line=document.createElement('div');line.className='m-drag-line';ul.appendChild(line);
    li.classList.add('m-drag-src');document.documentElement.classList.add('m-dragging');try{window.getSelection().removeAllRanges()}catch(e){}
    drag={li:li,ul:ul,box:box,rh:rh,from:from,name:nameOf(li),g:g,line:line,dy:y-r.top,x:x,y:y,to:from,id:lid(),raf:0,n:Math.round(ul.offsetHeight/rh)};
    move(x,y);tick();
  }
  function move(x,y){
    if(!drag)return;drag.x=x;drag.y=y;var ur=drag.ul.getBoundingClientRect();
    drag.g.style.transform='translate3d('+ur.left+'px,'+(y-drag.dy)+'px,0)';
    var k=Math.round((y-ur.top)/drag.rh);k=Math.max(0,Math.min(drag.n,k));drag.to=k;drag.line.style.top=(k*drag.rh-1)+'px';
    drag.line.classList.toggle('noop',k===drag.from||k===drag.from+1);
  }
  function tick(){if(!drag)return;var br=drag.box.getBoundingClientRect(),y=drag.y,ed=Math.min(60,br.height/5),v=0;
    if(y<br.top+ed)v=-Math.ceil((br.top+ed-y)/4);else if(y>br.bottom-ed)v=Math.ceil((y-(br.bottom-ed))/4);
    if(v){drag.box.scrollTop+=v;move(drag.x,drag.y)}drag.raf=requestAnimationFrame(tick)}
  function end(cancel){
    if(!drag)return;var d=drag;drag=null;cancelAnimationFrame(d.raf);d.g.remove();d.line.remove();d.li.classList.remove('m-drag-src');document.documentElement.classList.remove('m-dragging');
    suppressClick=true;setTimeout(function(){suppressClick=false},350);
    if(cancel||d.to===d.from||d.to===d.from+1||!lib())return;
    var pos=d.to>d.from?d.to-1:d.to;
    lib().musics(d.id).then(function(list){var m=list&&list[d.from];
      if(!m||(d.name&&(m.name||'').trim()!==d.name))throw new Error('列表已变化，请重试');
      return act(d.id,pos,[m.id]).then(function(){if(state[d.id]){delete state[d.id];decorate()}toast('已移到第 '+(pos+1)+' 首')});
    }).catch(function(e){toast('移动失败：'+(e&&e.message||e))});
  }
  document.addEventListener('click',function(e){if(suppressClick){e.preventDefault();e.stopPropagation();suppressClick=false}},true);
  /* 2026-10-19: touch drag only from the ≡ grip at the row's right edge, so a long-press on the row is left to
     AL's own menu (播放/移除/批量…). Mouse: vertical drag on the row still works, except in 批量选择 mode. */
  function multi(){return !!document.querySelector('.my-list .container.selected')||(!!document.querySelector('.my-list')&&!document.querySelector('button[aria-label="批量选择"]')&&!!document.querySelector('button[aria-label="退出批量选择"],button[aria-label="退出多选"]'))}
  /* 2026-10-19 (user): reorder ONLY inside 多选/批量选择 mode — never by default, it hurt normal scrolling */
  function multiMode(){return !!document.querySelector('.my-list')&&!!document.querySelector('button[aria-label="退出批量选择"],button[aria-label="退出多选"]')}
  function canSort(){var id=lid();return !!id&&id!=='last_played'}
  function grips(){
    var on=canSort()&&multiMode();document.documentElement.classList.toggle('m-can-grip',on);if(!on)return;
    var lis=document.querySelectorAll('.my-list > ul > li');
    for(var i=0;i<lis.length;i++){var li=lis[i];if(li.querySelector(':scope > .m-grip')||!li.querySelector(':scope > .container'))continue;
      var g=document.createElement('span');g.className='m-grip';g.setAttribute('aria-label','拖动排序');g.title='拖动排序';li.appendChild(g)}
  }
  var graf=0;new MutationObserver(function(){if(graf)return;graf=requestAnimationFrame(function(){graf=0;grips()})}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('hashchange',grips);window.__alGrips=grips;
  document.addEventListener('contextmenu',function(e){if(drag){e.preventDefault();e.stopPropagation();return}
    if(e.target.closest&&e.target.closest('.m-grip')){e.preventDefault();e.stopPropagation();return}
    var cli=matchMedia('(pointer: coarse)').matches&&e.target.closest&&e.target.closest('.my-list > ul > li');
    if(cli){try{navigator.vibrate&&navigator.vibrate(10)}catch(_){}if(!multi()&&lid())addMulti(cli)}},true);
  /* phones: long-press sheet gets a 多选 entry — enters AL's 批量选择 with the pressed song already selected */
  function addMulti(li){
    var n=0;(function t(){var m=document.querySelector('div.menu.svelte-oh9zwc');
      if(!m||getComputedStyle(m).opacity==='0'){if(++n<20)requestAnimationFrame(t);return}
      var old=m.querySelector('.m-menu-multi');if(old)old.remove();
      var b=document.createElement('button');b.type='button';b.className=(m.querySelector('.menu-item')||{}).className||'menu-item';b.classList.add('m-menu-multi');b.textContent='多选';
      b.addEventListener('click',function(ev){ev.stopPropagation();ev.preventDefault();
        try{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))}catch(_){}
        try{document.body.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));document.body.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));document.body.dispatchEvent(new MouseEvent('click',{bubbles:true}))}catch(_){}
        var mb=document.querySelector('button[aria-label="批量选择"]');if(mb)mb.click();
        setTimeout(function(){var c=li.isConnected&&li.querySelector(':scope > .container');if(c&&!c.classList.contains('selected'))c.click()},80);
      });
      m.insertBefore(b,m.firstChild);
    })();
  }
  var pend=null;
  document.addEventListener('pointerdown',function(e){
    if(drag||busy)return;
    var gp=e.target.closest&&e.target.closest('.m-grip');
    if(gp){if(e.button!==0&&e.pointerType==='mouse')return;var gli=gp.parentElement;if(!canSort()||!multiMode()||!gli)return;
      e.preventDefault();e.stopPropagation();try{navigator.vibrate&&navigator.vibrate(12)}catch(_){}start(gli,e.clientX,e.clientY);return}
  },true);
  document.addEventListener('pointermove',function(e){
    if(drag){move(e.clientX,e.clientY);return}
    if(!pend)return;var dx=e.clientX-pend.x,dy=e.clientY-pend.y;
    if(Math.abs(dy)>6&&Math.abs(dy)>Math.abs(dx)){var p=pend;pend=null;start(p.li,p.x,p.y);move(e.clientX,e.clientY)}else if(Math.abs(dx)>10)pend=null;
  },true);
  function up(e){pend=null;if(drag)end(e.type==='pointercancel')}
  document.addEventListener('pointerup',up,true);document.addEventListener('pointercancel',function(e){if(drag&&e.pointerType!=='mouse')return;up(e)},true);
  document.addEventListener('touchmove',function(e){if(drag){e.preventDefault();var t=e.touches[0];t&&move(t.clientX,t.clientY)}},{passive:false,capture:true});
  document.addEventListener('touchend',function(){if(drag)end(false)},true);
  document.addEventListener('selectstart',function(e){if(drag)e.preventDefault()},true);
  document.addEventListener('keydown',function(e){if(drag&&e.key==='Escape')end(true)},true);
  window.addEventListener('hashchange',function(){if(drag)end(true)});
})();

/* app chrome (2026-10-18): status/nav bar colours follow the page edges (theme colour, theme image, detail page, Folia);
   song-detail page gets 全屏 + 横屏 buttons on phones (Android app: native immersive/orientation via AndroidBridge; browsers: Fullscreen API). */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var B=window.AndroidBridge,APP=!!(B&&B.setBars),PHONE=APP||matchMedia('(pointer: coarse)').matches;
  /* ---- edge-to-edge (app ≥1.0.8): page draws under a transparent status bar, frosted strip on top ---- */
  var E2E=!!(B&&B.e2e),sbar=null,HTML=document.documentElement;
  window.__alSide=function(l,r){HTML.style.setProperty('--al-sal',(+l||0)+'px');HTML.style.setProperty('--al-sar',(+r||0)+'px')};
  window.__alSat=function(px){HTML.style.setProperty('--al-sat',(+px||0)+'px');HTML.classList.toggle('al-fs',!(+px))};
  if(E2E){
    try{if(B.safe){var q=String(B.safe()).split(',');window.__alSat(q[0]);window.__alSide(q[1],q[2])}else window.__alSat(B.sat())}catch(e){}
    HTML.classList.add('al-e2e');
    try{B.e2e(true)}catch(e){}
  }
  /* ---- bar colours ---- */
  function parse(c){var m=c&&String(c).match(/rgba?\(([^)]+)\)/);if(!m)return null;var p=m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);if(p.length<3)return null;return [p[0],p[1],p[2],p.length>3?p[3]:1]}
  var imgC={};
  function imgColor(url,edge){var k=url+'|'+edge;if(k in imgC)return imgC[k];imgC[k]=null;var im=new Image();
    im.onload=function(){try{var w=32,h=Math.max(8,Math.round(32*im.naturalHeight/im.naturalWidth)),cv=document.createElement('canvas');cv.width=w;cv.height=h;var x=cv.getContext('2d');x.drawImage(im,0,0,w,h);
      var bh=Math.max(1,h>>3),d=x.getImageData(0,edge==='t'?0:h-bh,w,bh).data,r=0,g=0,b=0,n=0;for(var i=0;i<d.length;i+=4){r+=d[i];g+=d[i+1];b+=d[i+2];n++}imgC[k]=[r/n,g/n,b/n,1];kick()}catch(e){}};
    im.src=url;return null}
  function up(e){return e.parentElement||(e.getRootNode&&e.getRootNode().host)||null}
  function hit(x,y){var e=document.elementFromPoint(x,y),g=0;while(e&&e.shadowRoot&&g++<5){var s=e.shadowRoot.elementFromPoint(x,y);if(!s||s===e)break;e=s}return e}
  function colorAt(x,y,edge){
    var layers=[],e=hit(x,y),g=0;
    for(;e&&e.nodeType===1&&g++<40;e=up(e)){
      if(e.id&&/^m-vbar$/.test(e.id))continue;
      var cs=getComputedStyle(e),bi=cs.backgroundImage,c;
      if(bi&&bi!=='none'){
        var u=bi.match(/url\(["']?([^"')]+)["']?\)/);
        if(u){c=imgColor(u[1],edge);if(c){layers.push(c);break}}
        else{var cols=bi.match(/rgba?\([^)]+\)/g);if(cols&&cols.length){c=parse(cols[edge==='t'?0:cols.length-1]);if(c&&c[3]>0){layers.push(c);if(c[3]>=.95)break}}}
      }
      c=parse(cs.backgroundColor);if(c&&c[3]>0){layers.push(c);if(c[3]>=.95)break}
    }
    var r=[255,255,255];for(var i=layers.length-1;i>=0;i--){var L=layers[i],a=Math.min(1,L[3]);r=[L[0]*a+r[0]*(1-a),L[1]*a+r[1]*(1-a),L[2]*a+r[2]*(1-a)]}
    return '#'+r.map(function(v){return ('0'+Math.round(Math.max(0,Math.min(255,v))).toString(16)).slice(-2)}).join('')}
  var last='',meta=null,qd=false,lastRun=0;
  function run(){qd=false;lastRun=Date.now();
    var w=innerWidth,h=innerHeight;if(!w||!h)return;
    var t=colorAt(1,1,'t'),b=colorAt(1,h-2,'b'),k=t+b;if(k===last)return;last=k;
    if(APP){try{B.setBars(t,b)}catch(e){}}
    else{if(!meta){meta=document.querySelector('meta[name="theme-color"]')||document.head.appendChild(Object.assign(document.createElement('meta'),{name:'theme-color'}))}meta.content=t}}
  function kick(){if(qd)return;qd=true;setTimeout(run,Math.max(0,250-(Date.now()-lastRun)))}
  window.__alBars={run:function(){last='';run()},state:function(){return last}};
  if(window.__alObs)window.__alObs(kick);setInterval(function(){if(!document.hidden)kick()},1500);document.addEventListener('visibilitychange',function(){if(!document.hidden)kick()});addEventListener('resize',kick);kick();

  /* ---- 全屏 / 横屏 on the song-detail page (phones) ---- */
  if(!PHONE||(!APP&&/AnyListenApp\//.test(navigator.userAgent)))return;   /* app < 1.0.6 has no native fullscreen/orientation */
  var FS=false,LAND=false;
  var I={fs:'<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    unfs:'<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>',
    rot:'<rect x="2" y="10" width="14" height="10" rx="2"/><path d="M12 3.5a8 8 0 0 1 8 7.5"/><path d="m22.5 9-2.5 2.5L17.5 9"/>',
    unrot:'<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>'};
  function svg(k){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+I[k]+'</svg>'}
  function isFs(){return APP?FS:!!document.fullscreenElement}
  function setFs(on){
    if(APP){FS=on;try{B.setFullscreen(on)}catch(e){}}
    else{try{if(on)document.documentElement.requestFullscreen({navigationUI:'hide'}).catch(function(){});else if(document.fullscreenElement)document.exitFullscreen().catch(function(){})}catch(e){}}
    if(!on&&LAND&&!APP)LAND=false;paint()}
  function setLand(on){LAND=on;
    if(APP){try{B.setOrientation(on?'landscape':'auto')}catch(e){}FS=on;try{B.setFullscreen(on)}catch(e){}}
    else if(on){var go=function(){try{screen.orientation.lock('landscape').catch(function(){})}catch(e){}};if(!document.fullscreenElement){try{document.documentElement.requestFullscreen({navigationUI:'hide'}).then(go,go)}catch(e){go()}}else go()}
    else{try{screen.orientation.unlock()}catch(e){}try{if(document.fullscreenElement)document.exitFullscreen().catch(function(){})}catch(e){}}
    paint()}
  document.addEventListener('fullscreenchange',function(){if(!document.fullscreenElement&&LAND&&!APP)LAND=false;paint()});
  function btn(id,cls){var b=document.createElement('button');b.type='button';b.id=id;b.className=cls;
    var unlit=function(){b.classList.remove('hover');try{b.blur()}catch(e){}};   /* touch never sends mouseout: AL's .hover would stay lit */
    b.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();if(id.indexOf('fs')>0)setFs(!isFs());else setLand(!LAND);unlit();setTimeout(unlit,0);setTimeout(unlit,400)});
    ['mousedown','pointerdown','dblclick','contextmenu','mouseover','mouseenter'].forEach(function(t){b.addEventListener(t,function(e){e.stopPropagation()})});return b}
  function paintBtn(b,on,a,bOff,lab,labOff){if(!b)return;var k=on?a:bOff;if(b.dataset.k!==k){b.dataset.k=k;b.innerHTML=svg(k)}var l=on?labOff:lab;if(b.getAttribute('aria-label')!==l){b.setAttribute('aria-label',l);b.title=l}b.classList.toggle('on',on)}
  function paint(){var f=isFs();
    var fh=document.getElementById('m-folia'),sr=fh&&fh.shadowRoot;
    paintBtn(document.getElementById('m-vrot'),LAND,'unrot','rot','横屏','竖屏');paintBtn(sr&&sr.getElementById('m-vrot2'),LAND,'unrot','rot','横屏','竖屏')}
  var wasOpen=false;
  function sync(){
    var pd=document.querySelector('.play-detail'),P=window.__alPl,shown=!!pd&&(!(P&&P.shown)||P.shown());
    var F=window.__alFolia,fol=shown&&F&&F.state&&F.state().mounted;
    if(shown){
      var cb=pd.querySelector('.header .control-btn');
      if(cb&&!document.getElementById('m-vrot')){var ref=cb.querySelector('.fullscreen')||cb.firstChild;var cls='m-vbtn '+((cb.className.match(/svelte-\w+/)||[''])[0]);
        cb.insertBefore(btn('m-vrot',cls),ref);paint()}
      if(fol){
        var fh=document.getElementById('m-folia'),sr=fh&&fh.shadowRoot,tp=sr&&sr.querySelector('.fal-top');
        if(sr&&!sr.getElementById('m-fol-x')){var st=document.createElement('style');st.id='m-fol-x';st.textContent='.\\-top-3.right-8.h-14.w-3.rounded-full{display:none!important}.fal-top{top:var(--al-sat,0px)!important}'+(document.documentElement.classList.contains('al-e2e')?'.fal-top{padding-top:max(4px,calc(12px - var(--al-sat,0px)))!important}':'')+'.fal-top,.fal-bottom{left:var(--al-sal,0px)!important;right:var(--al-sar,0px)!important}.fal-q-corner{right:var(--al-sar,0px)!important}#m-vrot2{margin-right:auto;display:flex;align-items:center;justify-content:center}#m-vrot2 svg{width:20px;height:20px}';sr.appendChild(st)}
        var cv=tp&&tp.firstElementChild;
        if(cv&&cv.tagName==='BUTTON'&&cv.id!=='m-vrot2'&&!(cv.nextElementSibling&&cv.nextElementSibling.id==='m-vrot2')){var o=sr.getElementById('m-vrot2');if(o)o.remove();var nb=btn('m-vrot2',cv.className);cv.after(nb);paint()}}
      wasOpen=true;
    }else{
      if(wasOpen){wasOpen=false;if(LAND)setLand(false);if(isFs())setFs(false)}
    }
  }
  if(window.__alObs)window.__alObs(sync);setInterval(function(){if(!document.hidden)sync()},1000);document.addEventListener('visibilitychange',function(){if(!document.hidden)sync()});
  window.__alView={fs:setFs,land:setLand,state:function(){return {fs:isFs(),land:LAND}}};
})();

/* ---- 歌单秒切换 (2026-10-19): persistent per-list cache (IndexedDB) + background preload.
   Bundle patch: Jo(setMusicList) calls window.__alLCput; Library view shows Y.allMusicList / __alLC.peek(id) instantly
   (never the previous list), ignores stale responses; window.__alLib2={Y,Ho,Qs}. ---- */
(function(){
  if(window.__alLC)return;
  var snap=new Map(),db=null,uid='',pend={},timer=null,ready=false;
  window.__alLC={peek:function(id){return snap.get(id)||null},ready:function(){return ready},size:function(){return snap.size}};
  function plain(list){try{return structuredClone(list)}catch(e){try{return JSON.parse(JSON.stringify(list))}catch(e2){return null}}}
  function flush(){timer=null;if(!db)return;var ids=Object.keys(pend);pend={};
    try{var tx=db.transaction('l','readwrite'),st=tx.objectStore('l');
      ids.forEach(function(id){var L2=window.__alLib2,list=L2&&L2.Y.allMusicList.get(id);if(!list||list.length>20000)return;var p=plain(list);if(!p)return;snap.set(id,p);st.put({k:uid+'|'+id,t:Date.now(),list:p})})}catch(e){}}
  function queue(id){if(!id)return;pend[id]=1;if(!timer)timer=setTimeout(flush,1500)}
  window.__alLCput=function(id){queue(id)};
  function hookEvents(){var L2=window.__alLib2;if(!L2||!L2.Ho||L2.Ho.__lc)return !!(L2&&L2.Ho&&L2.Ho.__lc);var H=L2.Ho;H.__lc=1;
    ['listMusicChanged','listMusicUpdated'].forEach(function(n){var f=H[n];if(typeof f!=='function')return;H[n]=function(x){try{var ids=x instanceof Map?Array.from(x.keys()):Array.isArray(x)?x:[x];ids.forEach(queue)}catch(e){}return f.apply(this,arguments)}});return true}
  function open(){
    var rq;try{rq=indexedDB.open('al-lc',1)}catch(e){return}
    rq.onupgradeneeded=function(){rq.result.createObjectStore('l',{keyPath:'k'})};
    rq.onsuccess=function(){db=rq.result;try{var g=db.transaction('l').objectStore('l').getAll();g.onsuccess=function(){(g.result||[]).forEach(function(r){var i=r.k.indexOf('|');if(r.k.slice(0,i)===uid)snap.set(r.k.slice(i+1),r.list)});ready=true;if(Object.keys(pend).length&&!timer)timer=setTimeout(flush,300)}}catch(e){ready=true}};
  }
  fetch('/__gw/me',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).then(function(j){uid=j&&(j.name||j.email||j.user||j.id)||'';open()},function(){open()});
  /* background preload: fetch every list once (sequential, gentle), so switching never waits on the network */
  var started=false;
  function preload(){
    var L=window.__alLib,L2=window.__alLib2;if(!L||!L2||!L.lists){setTimeout(preload,1500);return}
    hookEvents();
    var ids=[];try{ids=L.lists().map(function(l){return l.id}).filter(Boolean)}catch(e){}
    if(!ids.length){setTimeout(preload,1500);return}
    if(started)return;started=true;
    var cur=(/[?&]id=([^&]+)/.exec(location.hash)||[])[1];if(cur){cur=decodeURIComponent(cur);ids.sort(function(a,b){return (a===cur?-1:0)-(b===cur?-1:0)})}
    var i=0;(function next(){if(i>=ids.length)return;var id=ids[i++];
      if(L2.Y.allMusicList.has(id)){next();return}
      var go=function(){L2.Qs(id).catch(function(){}).then(function(){setTimeout(next,document.hidden?800:120)})};
      if(window.requestIdleCallback)requestIdleCallback(go,{timeout:1200});else setTimeout(go,50)})();
  }
  setTimeout(preload,2500);
})();

/* lifecycle + audio sync (2026-10-19): keep the UI mounted while the socket reconnects (no blank page after background), revive the socket on resume / online / when AL's own retry gave up, and keep the play icon in sync when the audio was paused by the system (Bluetooth / headphones unplugged, audio focus). */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  window.__alKeepUI=true;
  var hiddenAt=0;
  function I(){return window.__alIpc}
  function kick(why,force){var i=I();if(!i)return;try{var r=i.kick(!!force);if(r==='kicked')console.log('[al-life] ipc kick ('+why+')')}catch(e){}}
  function playing(){try{return !!(window.__alPl&&window.__alPl.playing())}catch(e){return false}}
  function resume(why){
    var i=I();if(!i)return;var away=hiddenAt?Date.now()-hiddenAt:0;hiddenAt=0;
    var st=i.state();
    if(st!==1){kick(why);return}
    /* socket claims open: after a long sleep with nothing received it is probably half-open */
    if(away>120000&&!playing()&&Date.now()-i.lastMsg()>120000)kick(why+' stale',true);
  }
  window.__alResume=function(){resume('app')};
  document.addEventListener('visibilitychange',function(){if(document.hidden)hiddenAt=Date.now();else resume('visible')});
  window.addEventListener('pageshow',function(){resume('pageshow')});
  window.addEventListener('online',function(){setTimeout(function(){kick('online')},800)});
  /* watchdog: AL stops retrying after a failed reconnect (1006 before open) */
  setInterval(function(){
    if(document.hidden&&!playing())return;
    var i=I();if(!i)return;var st=i.state();
    if((st===-1||st===3)&&!i.pending())kick('watchdog');
  },4000);

  /* play-state sync */
  function audio(){try{return window.__alPl&&window.__alPl.audio()}catch(e){return null}}
  function pauseNow(why){
    var p=window.__alPl;if(!p)return;
    try{if(p.playing())p.pause()}catch(e){}
    setTimeout(function(){var a=audio();try{if(a&&!a.paused)a.pause()}catch(e){}try{if(p.playing())p.pause()}catch(e){}},500);
    console.log('[al-life] paused ('+why+')');
  }
  window.__alNoisy=function(why){pauseNow(why||'noisy')};
  /* only a track that was really playing and then got paused mid-song with no src change counts;
     track switches (new src still loading / waiting for play(), fades, silent data: placeholder) never do */
  var bad=0,livSrc='',hooked=null;
  function hook(a){if(hooked===a)return;hooked=a;livSrc='';
    a.addEventListener('playing',function(){livSrc=a.currentSrc||a.src||''});
    a.addEventListener('emptied',function(){livSrc=''});
    a.addEventListener('loadstart',function(){livSrc=''});}
  setInterval(function(){
    var p=window.__alPl,a=audio();
    if(a)hook(a);
    if(!p||!a||!playing()){bad=0;return}
    var src=a.currentSrc||a.src||'';
    var dur=a.duration||0,t=a.currentTime||0;
    if(a.paused&&!a.ended&&!a.seeking&&a.readyState>=2&&src&&src.indexOf('data:')!==0&&src===livSrc&&t>2&&(!dur||t<dur-2)){if(++bad>=4){bad=0;try{p.pause()}catch(e){}console.log('[al-life] icon resync: audio paused by system')}}
    else bad=0;
  },1000);
})();

/* 歌单封面 (2026-10-20): every list except 我喜欢 shows its first song's cover — on 主页 cards and in the sidebar 我的列表.
   Recomputed for all lists on every app start / login, and for a list whenever its songs change (bundle events + __alLCput).
   Cached in localStorage per user so the covers show instantly before the refresh. */
(function(){
  if(/^\/__gw\//.test(location.pathname)||window.__alLcov)return;
  /* map[listId]={s:songId,u:url} of the song the cover came from; a start only refetches a list whose first song changed */
  var map={},uid='',KEY='al-lcov:',busy={},queue=[],all=0;
  try{uid=localStorage.getItem('al-lcov-u')||''}catch(e){}
  function save(){try{localStorage.setItem(KEY+uid,JSON.stringify(map));localStorage.setItem('al-lcov-u',uid)}catch(e){}}
  function load(){try{map=JSON.parse(localStorage.getItem(KEY+uid)||'{}')||{}}catch(e){map={}}for(var k in map)if(typeof map[k]==='string')map[k]={s:'',u:map[k]}}
  function U(id){var v=map[id];return v&&v.u||''}
  /* small thumbnails load much faster than the 500px originals (QQ / NetEase CDNs size by URL) */
  function small(u){u=String(u);if(/y\.gtimg\.cn\/music\/photo_new\/T002R\d+x\d+/.test(u))return u.replace(/T002R\d+x\d+/,'T002R300x300');if(/music\.126\.net\//.test(u))return /[?&]param=\d+y\d+/.test(u)?u.replace(/param=\d+y\d+/,'param=300y300'):u+(u.indexOf('?')<0?'?':'&')+'param=300y300';return u}
  function pic(m){var x=m&&m.meta,u=x&&(x.picUrl||x.pic||x.img)||'';return u?small(u):''}
  function warm(u){if(!u)return;try{var i=new Image();i.referrerPolicy='no-referrer';i.decoding='async';i.src=u}catch(e){}}
  function first(ms){if(!ms)return null;for(var i=0;i<ms.length&&i<30;i++){var u=pic(ms[i]);if(u)return {s:String(ms[i].id||''),u:String(u)}}return null}
  function set(id,f){var o=map[id];if(f&&o&&o.s===f.s&&o.u===f.u)return;if(!f&&!o)return;if(f){map[id]=f;warm(f.u)}else delete map[id];save();side();try{window.__alHome&&window.__alHome.cover&&window.__alHome.cover(id)}catch(e){}}
  function skip(id){return id==='love'||id==='last_played'}
  function refresh(id){if(skip(id)||busy[id])return;if(queue.indexOf(id)<0)queue.push(id);pump()}
  var active=0,MAX=4;   /* a few lists in parallel */
  function pump(){while(active<MAX&&queue.length){var L=window.__alLib;if(!L||!L.musics){setTimeout(pump,300);return}
    (function(id){active++;busy[id]=1;
    Promise.resolve().then(function(){return L.musics(id)}).then(function(ms){set(id,first(ms))},function(){}).then(function(){delete busy[id];active--;pump()})})(queue.shift())}}
  function refreshAll(){var L=window.__alLib;if(!L||!L.lists){setTimeout(refreshAll,250);return}
    var ls=[];try{ls=L.lists()}catch(e){}
    if(!ls.some(function(l){return l.type})&&all<20){all++;setTimeout(refreshAll,250);return}   /* user lists may load a moment later */
    var C=window.__alLC;if(C&&C.ready&&!C.ready()&&(refreshAll.w=(refreshAll.w||0)+1)<12){setTimeout(refreshAll,150);return}   /* wait for the local list snapshots (IndexedDB) */
    var ids={};ls.forEach(function(l){ids[l.id]=1;if(skip(l.id))return;
      var snap=C&&C.peek&&C.peek(l.id),f=snap?first(snap):undefined,o=map[l.id];
      if(o&&o.s&&f&&f.s===o.s&&f.u!==o.u){set(l.id,f);return}
      if(o&&o.s&&(f===undefined||(f&&f.s===o.s)))return;          /* same first song (or no local copy to compare): keep the cover, no fetch */
      if(f&&o&&!o.s&&f.u===o.u){map[l.id]=f;return}
      if(f){set(l.id,f);return}                                     /* local snapshot already knows the new first song */
      refresh(l.id)});
    Object.keys(map).forEach(function(k){if(!ids[k])delete map[k]});save()}
  /* song-change hooks: AL list events + the list-cache hook (setMusicList) */
  var tm={};function soon(id){if(!id||skip(id))return;clearTimeout(tm[id]);tm[id]=setTimeout(function(){delete tm[id];refresh(id)},400)}
  function hook(){var L2=window.__alLib2;if(!L2||!L2.Ho)return false;var H=L2.Ho;if(H.__lcov)return true;H.__lcov=1;
    ['listMusicChanged','listMusicUpdated','listMusicAdded','listMusicRemoved','listMusicOverwrite','listMusicMoved','listMusicCleared','listMusicUpdatePosition'].forEach(function(n){var f=H[n];if(typeof f!=='function')return;
      H[n]=function(x){try{var ids=x instanceof Map?Array.from(x.keys()):Array.isArray(x)?x:x&&typeof x==='object'?[x.listId||x.id].concat(x.ids&&x.listId?[]:[]):[x];ids.forEach(function(i){if(typeof i==='string')soon(i)})}catch(e){}return f.apply(this,arguments)}});return true}
  (function tryHook(n){if(!hook()&&n<60)setTimeout(function(){tryHook(n+1)},1000)})(0);
  (function wrapPut(n){var f=window.__alLCput;if(typeof f!=='function'){if(n<60)setTimeout(function(){wrapPut(n+1)},500);return}if(f.__lcov)return;
    var g=function(id){soon(id);return f.apply(this,arguments)};g.__lcov=1;window.__alLCput=g})(0);
  /* sidebar: our own <img> in each list's .left; AL's own picture node is only hidden by CSS */
  /* our own <img> in a list picture slot (.left); AL's own picture node is only hidden by CSS */
  function deco(left,id){
    var u=skip(id)?'':U(id),im=left.querySelector('img.m-lcov');
    if(!u){if(im)im.remove();left.classList.remove('m-lcov-on');return}
    if(!im){var ref=left.querySelector('.pic');im=document.createElement('img');im.className='m-lcov '+(ref?(ref.className.match(/svelte-\w+/)||[''])[0]:'');im.alt='';im.referrerPolicy='no-referrer';im.decoding='async';im.onerror=function(){var l=this.parentNode;this.remove();if(l)l.classList.remove('m-lcov-on')};left.appendChild(im)}
    if(im.getAttribute('src')!==u)im.src=u;
    left.classList.add('m-lcov-on')}
  function curId(){var m=/^#\/library\?(?:.*&)?id=([^&]+)/.exec(location.hash);try{return m?decodeURIComponent(m[1]):''}catch(e){return ''}}
  function side(){
    var c=document.querySelector('#app-main .aside .my-list-container');
    if(c){var lis=c.querySelectorAll('li[data-id]');
      for(var i=0;i<lis.length;i++){var left=lis[i].querySelector('.left');if(left)deco(left,lis[i].dataset.id)}}
    /* the list page header (点进歌单后的大封面) */
    var hl=document.querySelector('#app-right .view-container>.header>.left'),id=curId();
    if(hl){if(id)deco(hl,id);else{var o=hl.querySelector('img.m-lcov');if(o)o.remove();hl.classList.remove('m-lcov-on')}}}
  window.addEventListener('hashchange',function(){side();setTimeout(side,300)});
  /* list page cover = same size as a 主页 cover (2026-10-20): measured from 主页 when shown, remembered for later */
  function cvSize(){var c=document.querySelector('#m-home .m-home-cover');if(!c)return;var w=Math.round(c.getBoundingClientRect().width);if(w>40){var v=w+'px';if(document.documentElement.style.getPropertyValue('--m-cv')!==v){document.documentElement.style.setProperty('--m-cv',v);try{localStorage.setItem('al-cv',v+'|'+innerWidth)}catch(e){}}}}
  try{var sv=(localStorage.getItem('al-cv')||'').split('|');if(sv[0]&&+sv[1]===innerWidth)document.documentElement.style.setProperty('--m-cv',sv[0])}catch(e){}
  if(window.__alObs)window.__alObs(cvSize);addEventListener('resize',function(){document.documentElement.style.removeProperty('--m-cv');setTimeout(cvSize,300)});
  window.__alLcov={get:function(id){return skip(id)?'':U(id)},refresh:refresh,all:refreshAll,map:function(){return map}};
  load();side();
  if(window.__alObs)window.__alObs(side);
  fetch('/__gw/me',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){var u=j&&(j.name||j.email||j.user||j.id)||'';if(u!==uid){uid=u;load();side();all=0;refreshAll.w=0;refreshAll()}},function(){});
  for(var k in map)warm(map[k].u);refreshAll();   /* cached covers show at once; check right away instead of after /__gw/me */
})();

/* song download (2026-10-20): admin only for now. AL list menu "下载" (single or multi-select, bundle patch
   alDownload) -> options dialog -> per song: AL resolves the url (window.__alDL from bundle) -> POST /__gw/dl
   (gateway streams it back with tags written; nothing kept on the server) -> browser / app download.
   Anti-risk-control: strictly sequential, random 3-6 s gap, max 50 per batch, stop after 3 failures in a row. */
(function(){
  if(window.__alDLinit)return;window.__alDLinit=1;
  fetch('/__gw/me',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(j){if(j&&j.role==='admin')window.__alDLok=1}).catch(function(){});
  var ORDER=['master','flac24bit','flac','320k','128k'],LBL={best:'最高可用',flac24bit:'FLAC 24bit',flac:'FLAC 无损',"320k":'320K MP3',"128k":'128K MP3'};
  var K='al-dl-opt',busy=null;
  function opt(){try{return Object.assign({q:'best',cover:true,lrc:true,tlrc:true},JSON.parse(localStorage.getItem(K)||'{}'))}catch(e){return{q:'best',cover:true,lrc:true,tlrc:true}}}
  function css(){if(document.getElementById('al-dl-css'))return;var s=document.createElement('style');s.id='al-dl-css';s.textContent=
    '.al-dl-mask{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}'+
    '.al-dl-box{background:#fff;color:#222;border-radius:14px;width:100%;max-width:360px;padding:18px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.3);font-size:14px}'+
    '.al-dl-box h3{margin:0 0 4px;font-size:17px}.al-dl-sub{color:#888;font-size:12px;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
    '.al-dl-box label{display:flex;align-items:center;gap:8px;margin:9px 0}.al-dl-box select{flex:1;padding:6px 8px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#222;font-size:14px}'+
    '.al-dl-box input[type=checkbox]{width:18px;height:18px;accent-color:#5b6ee1}.al-dl-box .dis{opacity:.45}'+
    '.al-dl-btns{display:flex;gap:10px;margin-top:14px}.al-dl-btns button{flex:1;padding:9px;border:0;border-radius:9px;font-size:14px;cursor:pointer;background:#eee;color:#333}.al-dl-btns .go{background:#5b6ee1;color:#fff}'+
    '.al-dl-tip{color:#999;font-size:12px;margin-top:8px;line-height:1.5}'+
    '.al-dl-bar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147483000;background:rgba(30,30,30,.92);color:#fff;border-radius:22px;padding:8px 8px 8px 16px;display:flex;align-items:center;gap:10px;font-size:13px;max-width:92vw;box-shadow:0 4px 20px rgba(0,0,0,.3)}'+
    '.al-dl-bar span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62vw}.al-dl-bar button{border:0;background:rgba(255,255,255,.18);color:#fff;border-radius:14px;padding:4px 12px;font-size:12px;cursor:pointer}'+
    '@media (prefers-color-scheme:dark){.al-dl-box{background:#2a2a2e;color:#eee}.al-dl-box select{background:#1f1f23;color:#eee;border-color:#444}.al-dl-btns button{background:#3a3a40;color:#ddd}}';
    document.head.appendChild(s)}
  function pickQ(mi,q){var av=Object.keys((mi.meta&&mi.meta.qualitys)||{});if(!av.length)return q==='best'?'320k':q;
    var i=q==='best'?0:Math.max(0,ORDER.indexOf(q));for(var k=i;k<ORDER.length;k++)if(av.indexOf(ORDER[k])>=0)return ORDER[k];
    for(k=ORDER.length-1;k>=0;k--)if(av.indexOf(ORDER[k])>=0)return ORDER[k];return q}
  function dialog(list,done){css();var o=opt(),n=list.length,qs={};list.forEach(function(m){Object.keys((m.meta&&m.meta.qualitys)||{}).forEach(function(q){qs[q]=1})});
    var opts=['best'].concat(['flac24bit','flac','320k','128k'].filter(function(q){return qs[q]||!Object.keys(qs).length&&q!=='flac24bit'}));if(opts.indexOf(o.q)<0)o.q='best';
    var w=document.createElement('div');w.className='al-dl-mask';
    w.innerHTML='<div class="al-dl-box" role="dialog"><h3>下载'+(n>1?' '+n+' 首歌':'')+'</h3><div class="al-dl-sub"></div>'+
      '<label>音质<select class="q">'+opts.map(function(q){return '<option value="'+q+'"'+(q===o.q?' selected':'')+'>'+LBL[q]+'</option>'}).join('')+'</select></label>'+
      '<label><input type="checkbox" class="cv"'+(o.cover?' checked':'')+'>嵌入封面</label>'+
      '<label><input type="checkbox" class="lr"'+(o.lrc?' checked':'')+'>嵌入歌词</label>'+
      '<label class="tl"><input type="checkbox" class="tr"'+(o.tlrc?' checked':'')+'>歌词附带翻译</label>'+
      '<div class="al-dl-tip">没有所选音质时自动降到最接近的一档。'+(n>1?'为避免账号风控，会一首一首地下，每首间隔几秒'+(n>50?'，一次最多 50 首':'')+'。':'')+'</div>'+
      '<div class="al-dl-btns"><button class="no">取消</button><button class="go">下载</button></div></div>';
    var $=function(c){return w.querySelector(c)};
    $('.al-dl-sub').textContent=n>1?list.slice(0,3).map(function(m){return m.name}).join('、')+(n>3?' 等':''):(list[0].name+(list[0].singer?' - '+list[0].singer:''));
    function syn(){$('.tl').classList.toggle('dis',!$('.lr').checked);$('.tr').disabled=!$('.lr').checked}syn();$('.lr').onchange=syn;
    function close(){w.remove()}
    w.addEventListener('click',function(e){if(e.target===w)close()});$('.no').onclick=close;
    $('.go').onclick=function(){var v={q:$('.q').value,cover:$('.cv').checked,lrc:$('.lr').checked,tlrc:$('.tr').checked};try{localStorage.setItem(K,JSON.stringify(v))}catch(e){}close();done&&done();run(list.slice(0,50),v)};
    document.body.appendChild(w)}
  function bar(){var b=document.createElement('div');b.className='al-dl-bar';b.innerHTML='<span></span><button>取消</button>';document.body.appendChild(b);return b}
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms)})}
  function save(t){var a=document.createElement('a');a.href='/__gw/dl/'+t;a.download='';a.style.display='none';document.body.appendChild(a);a.click();setTimeout(function(){a.remove()},1000)}
  async function one(mi,v){var D=window.__alDL,q=pickQ(mi,v.q),r;
    try{r=await D.url(mi,q)}catch(e){r=null}
    if(!r||!r.url)r=await D.url(mi,q,true);
    if(!r||!/^https?:\/\//.test(r.url))throw new Error('取不到下载地址');
    var cover='',lrc='',tlrc='';
    if(v.cover){cover=(mi.meta&&mi.meta.picUrl)||'';if(!cover)try{var p=await D.pic(mi);cover=(p&&(p.url||p))||''}catch(e){}if(typeof cover!=='string')cover='';cover=cover.replace(/R500x500/,'R800x800')}
    if(v.lrc)try{var l=await D.lrc(mi),i=l&&l.info||{};lrc=i.lyric||'';tlrc=v.tlrc?(i.tlyric||''):''}catch(e){}
    var res=await fetch('/__gw/dl',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-AL':'1'},body:JSON.stringify({url:r.url,name:mi.name,singer:mi.singer,album:mi.meta&&mi.meta.albumName||'',cover:cover,lrc:lrc,tlrc:tlrc})});
    var j=await res.json().catch(function(){return{}});if(!res.ok||!j.t)throw new Error(j.err||('网关 '+res.status));
    save(j.t)}
  async function run(list,v){if(busy){alert('已有下载任务在进行');return}if(!window.__alDL){alert('页面版本太旧，请刷新后再试');return}
    var b=bar(),s=b.querySelector('span'),stop=false,ok=0,fail=0,row=0;busy=b;b.querySelector('button').onclick=function(){stop=true;s.textContent='正在停止…'};
    for(var i=0;i<list.length&&!stop;i++){var m=list[i];s.textContent='下载中 '+(i+1)+'/'+list.length+'：'+m.name;
      try{await one(m,v);ok++;row=0}catch(e){fail++;row++;console.warn('[al-dl]',m.name,e&&e.message);if(row>=3){s.textContent='连续失败 3 次，已停止（'+(e&&e.message||'')+'）';break}}
      if(i<list.length-1&&!stop)await sleep(3000+Math.random()*3000)}
    if(row<3)s.textContent=(stop?'已取消：':'完成：')+'成功 '+ok+' 首'+(fail?'，失败 '+fail+' 首':'');
    b.querySelector('button').textContent='关闭';b.querySelector('button').onclick=function(){b.remove()};busy=null;setTimeout(function(){b.remove()},8000)}
  window.__alDLgo=function(list,done){if(!window.__alDLok)return;list=(list||[]).filter(function(m){return m&&!m.isLocal});if(!list.length){alert('本地歌曲无需下载');return}dialog(list,done)};
})();
