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
(function(){var CLR='1';try{if(localStorage.getItem('al-clr')===CLR)return;localStorage.setItem('al-clr',CLR);sessionStorage.removeItem('al-direct-bad');
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
    out:'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z'};
  /* user management as a modal (iframe) so playback is never interrupted (2026-10-11) */
  function openAdmin(){
    if(document.getElementById('m-gw-modal'))return;
    var o=document.createElement('div');o.id='m-gw-modal';
    o.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center';
    o.innerHTML='<div style="position:relative;width:min(92vw,40rem);height:min(88vh,44rem);background:var(--color-content-background,#fff);border-radius:.75rem;box-shadow:0 .5rem 2rem rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden">'+
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;color:var(--color-primary,#5b6ee1);font-size:1rem;font-weight:600">用户管理<button type="button" aria-label="关闭" style="border:none;background:none;font-size:1.5rem;line-height:1;cursor:pointer;color:inherit;padding:0 .25rem">×</button></div>'+
      '<div class="m-gw-body" style="position:relative;flex:1 1 0;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:none"><iframe src="/__gw/admin" scrolling="no" style="display:block;width:100%;height:300px;border:0;background:transparent"></iframe></div>'+
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
      '<ul class="aside-nav '+h+'" role="menu">'+(me.role==='admin'?item('m-gw-admin','用户管理',IC.users,'/__gw/admin'):'')+item('m-gw-out','退出登录',IC.out,'/__gw/logout')+'</ul>';
    aside.appendChild(d);
    document.getElementById('m-gw-uname').textContent=me.name;
    document.getElementById('m-gw-ren').addEventListener('click',function(){
      var n=prompt('修改用户名（2–16 位中文、字母、数字、_ 或 -）',me.name);if(n==null)return;n=n.trim();if(!n||n===me.name)return;
      fetch('/__gw/rename',{method:'POST',credentials:'same-origin',headers:{'x-al':'1','Content-Type':'application/x-www-form-urlencoded'},body:'u='+encodeURIComponent(n)}).then(function(r){return r.json()}).then(function(j){
        if(j.ok){me.name=j.name;document.getElementById('m-gw-uname').textContent=j.name}else alert(j.err||'修改失败')}).catch(function(){alert('修改失败，请稍后再试')});
    });
    var ad=document.getElementById('m-gw-admin');if(ad)ad.addEventListener('click',function(e){e.preventDefault();openAdmin()});
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
    if(bars.length&&!timer){timer=setInterval(tick,500)}
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
  var HOME='M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',on=false,opened=false,gen=0,drawnN=-1;
  function el(tag,cls,txt){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
  function view(){var r=document.getElementById('app-right');if(!r)return null;var tb=r.querySelector('.toolbar');var v=tb&&tb.nextElementSibling;return v||null}
  function nav(){
    var a=document.querySelector('#app-main .aside');if(!a)return;var ul=a.querySelector('.aside-nav');if(!ul||document.getElementById('m-home-nav'))return;
    var h=[].filter.call(ul.classList,function(c){return c.indexOf('svelte-')===0})[0]||'';
    var li=document.createElement('li');li.className='nav-item '+h;li.setAttribute('role','presentation');
    li.innerHTML='<a id="m-home-nav" role="tab" data-ignore-tip="" class="link '+h+'" href="#" aria-label="主页"><div class="left '+h+'"><div class="icon '+h+'"><svg class="'+h+'" viewBox="0 0 24 24" fill="currentColor"><path d="'+HOME+'"/></svg></div> <span class="nav-name '+h+'">主页</span></div></a>';
    ul.insertBefore(li,ul.firstChild);
    li.firstChild.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();document.documentElement.classList.remove('m-aside-open');show()});
    if(on)li.firstChild.classList.add('m-active');
  }
  function hide(){if(!on)return;on=false;closeEd();gen++;var b=document.getElementById('m-home');if(b)b.remove();document.documentElement.classList.remove('m-home-on');var n=document.getElementById('m-home-nav');if(n)n.classList.remove('m-active')}
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
    if(isDaily(l)){cv.innerHTML=SUN;return}
    var e=covers[l.id];
    if(e)cv.appendChild(el('span','m-home-emo',e));
    else cv.appendChild(el('span','m-home-ph',Array.from(l.name||'?')[0]));
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
    var cv=el('div','m-home-cover'+(love?' love':'')+(isDaily(l)?' sun':''));paint(cv,l,love);
    var wrapC=el('div','m-home-cw');wrapC.appendChild(cv);
    if(!love&&!isDaily(l)){var eb=el('button','m-home-eb');eb.type='button';eb.title='修改封面';eb.setAttribute('aria-label','修改封面');
      eb.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';
      eb.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();editCover(eb,cv,l)});wrapC.appendChild(eb)}
    c.appendChild(wrapC);
    c.appendChild(el('div','m-home-ln',l.name));var meta=el('div','m-home-lm',l.type==='remote'?'收藏的在线歌单':(love?'我喜欢的歌曲':(l.name==='每日推荐'&&l.type==='general'?'每天自动更新':'自建歌单')));c.appendChild(meta);
    c.addEventListener('click',function(){closeEd();hide();setTimeout(function(){fromHome=location.hash},400)});
    grid.appendChild(c);
    var g=gen;try{Promise.resolve(window.__alLib.musics(l.id)).then(function(ms){if(g!==gen||!ms)return;meta.textContent=ms.length+' 首 · '+meta.textContent}).catch(function(){})}catch(e){}
  }
  function show(){
    var v=view();if(!v){setTimeout(show,300);return}
    hide();on=true;opened=true;drawnN=-1;var g=++gen;document.documentElement.classList.add('m-home-on');
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
      fetch('/__gw/covers',{credentials:'same-origin',cache:'no-store'}).then(function(r){return r.ok?r.json():{}}).then(function(j){covers=j&&typeof j==='object'?j:{};draw()}).catch(function(){draw()});
    })(0);
  }
  /* the app redirects to its last list right after boot: ignore route changes the user did not cause during the first seconds */
  var autoAt=0,act=0;['pointerdown','keydown','touchstart'].forEach(function(t){document.addEventListener(t,function(){act=Date.now()},true)});
  window.addEventListener('hashchange',function(){if(Date.now()-autoAt<6000&&Date.now()-act>1500)return;hide()});
  document.addEventListener('click',function(e){if(!on)return;var a=e.target.closest&&e.target.closest('#app-main .aside a, #app-main .aside .my-list-container .container');if(a&&a.id!=='m-home-nav')hide()},true);
  window.__alObs(function(){nav();if(on&&!document.getElementById('m-home'))show();
    /* user lists can load after 主页 rendered (or a list was added/removed): redraw when the count changes */
    if(on&&drawnN>=0&&window.__alLib&&window.__alLib.ul&&window.__alLib.ul().filter(function(l){return l.type}).length!==drawnN&&!document.getElementById('m-home-ed'))show();
    if(!opened&&document.querySelector('#app-main .aside .aside-nav')&&view()&&window.__alLib){autoAt=Date.now();show()}});
  /* toolbar 返回 after opening a list from 主页 goes back to 主页 (native back only knows online-search history) */
  var fromHome=null;
  window.addEventListener('hashchange',function(){if(fromHome&&location.hash!==fromHome)fromHome=null});
  document.addEventListener('click',function(e){var b=e.target.closest&&e.target.closest('#app-right .toolbar [aria-label="返回"]');
    if(!b||on||!fromHome||location.hash!==fromHome)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();fromHome=null;show()},true);
  window.__alHome={show:show,hide:hide,pushes:pushCards};
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
      if(j.date===doneDate||!j.list||!j.list.length){busy=false;return}
      var L=window.__alLib,now=Date.now(),l=find(),created=false,p;
      if(l)p=Promise.resolve(l.id);
      else{var id=rid();created=true;p=L.act({action:'list_create',data:{position:0,listInfos:[{id:id,type:'general',name:NAME,parentId:null,meta:{createTime:now,desc:'',playCount:0,songCount:0,pic:'',posTime:now,updateTime:now}}]}}).then(function(){return id})}
      return p.then(function(id){
        return Promise.resolve(created?[]:L.musics(id)).then(function(ms){
          ms=ms||[];
          var same=ms.length===j.list.length&&ms.every(function(m,i){return m.id===j.list[i].id});
          if(same)return false;
          var infos=j.list.map(function(m,i){var x=JSON.parse(JSON.stringify(m));x.meta=x.meta||{};x.meta.createTime=now+i;x.meta.updateTime=now;return x});
          return L.act({action:'list_music_overwrite',data:{listId:id,musicInfos:infos}}).then(function(){return true});
        });
      }).then(function(ch){busy=false;doneDate=j.date;if((ch||created)&&document.getElementById('m-home')&&window.__alHome)setTimeout(window.__alHome.show,600)});
    }).catch(function(e){busy=false;console.warn('daily',e)});
  }
  setTimeout(sync,4000);
  setInterval(function(){if(!document.hidden){tries=0;sync()}},30*60e3);
  window.__alDaily={sync:sync};
})();
