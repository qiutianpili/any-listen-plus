
/* Folia 详情页 (2026-10-14): the song-detail page can render with Folia Major's lyric visualizer (AGPL-3.0, chthollyphile).
   localStorage al-detail-style = 'folia' | 'al' (原版); unset → 原版 on phones, Folia on desktop (2026-10-14). The bundle /__m/folia/folia-player.js is import()ed only when
   the detail page opens in Folia style, mounted full-screen in #m-folia (shadow DOM) over .play-detail, and unmounted (no rAF /
   WebGL left running) when the page closes or the user switches to 原版. Needs bundle hooks __alPl.info/exec/detail/shown + __alLrc.off;
   if they or the bundle are missing it falls back to the original page with a console warning. Switching never touches playback. */
(function(){
  if(/^\/__gw\//.test(location.pathname))return;
  var FV='1',K='al-detail-style',SRC='/__m/folia/folia-player.js?v='+FV;
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
        playing:!!P.playing(),duration:+g.maxPlayTime||0,volume:P.vol?+P.vol()||0:1,muted:P.mute?!!P.mute():false,rate:P.rate?+P.rate()||1:1}},
    time:function(){var L=window.__alLrc,t=+L.t()||0;return t+(L.off?+L.off()||0:0)},
    toggle:function(){exec('player.togglePlay')},
    prev:function(){exec('player.skipPrev')},
    next:function(){exec('player.skipNext')},
    seek:function(s){try{window.__alPl.seek(Math.max(0,+s||0))}catch(e){}},
    setVolume:function(v){exec('player.setVolume',Math.round(Math.max(0,Math.min(1,+v||0))*100)/100)},
    setMute:function(m){exec('player.setVolumeMute',!!m)},
    close:function(){var P=window.__alPl;unmount();if(P&&P.detail){P.detail(false);return}var b=document.querySelector('.play-detail button.hide');if(b)b.click();else unmount()},
    toOriginal:function(){setStyle('al')},
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
