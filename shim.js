/* =====================================================================
   RKVM Apps — Offline ব্যবস্থা (GitHub Pages)
   • অ্যাপের পাতা Apps Script থেকে এনে এই ফোন / কম্পিউটারে জমিয়ে রাখে → নেট না থাকলেও খোলে
   • google.script.run-এর জায়গায় fetch দিয়ে একই server function ডাকে
   • নেট না থাকলে: আগে দেখা তথ্য জমা থেকে দেখায়; Save-গুলো লাইনে রাখে, নেট এলে নিজে থেকে পাঠায়
   ===================================================================== */
(function(){
'use strict';
var CFG=window.APP_CFG||{},KEY=CFG.key||'app';
var LS=function(k,v){try{if(v===undefined)return localStorage.getItem('OFFL_'+KEY+'_'+k);if(v===null)localStorage.removeItem('OFFL_'+KEY+'_'+k);else localStorage.setItem('OFFL_'+KEY+'_'+k,v);}catch(e){return null;}};
function execUrl(){return LS('url')||CFG.url||'';}
var HAS_CACHE=typeof caches!=='undefined';
var CNAME='rkvm-offl-'+KEY;
function cPut(k,val){if(!HAS_CACHE)return Promise.resolve();return caches.open(CNAME).then(function(c){return c.put(new Request('/__offl/'+encodeURIComponent(k)),new Response(JSON.stringify({v:val,t:Date.now()}),{headers:{'Content-Type':'application/json'}}));}).catch(function(){});}
function cGet(k){if(!HAS_CACHE)return Promise.resolve(null);return caches.open(CNAME).then(function(c){return c.match(new Request('/__offl/'+encodeURIComponent(k)));}).then(function(r){return r?r.json():null;}).catch(function(){return null;});}
function cClearData(){if(!HAS_CACHE)return Promise.resolve();return caches.open(CNAME).then(function(c){return c.keys().then(function(ks){return Promise.all(ks.filter(function(q){return q.url.indexOf('/__offl/d%7C')>=0||q.url.indexOf('/__offl/d|')>=0;}).map(function(q){return c.delete(q);}));});}).catch(function(){});}
function sha(s){try{return crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)).then(function(b){return Array.from(new Uint8Array(b)).map(function(x){return ('0'+x.toString(16)).slice(-2);}).join('');});}catch(e){return Promise.resolve(String(s.length)+'_'+s.slice(0,40));}}

/* ---- কোন কাজ কী ধরনের ---- */
var QUEUE=CFG.queue||[];                    /* নেট না থাকলে লাইনে রাখা যায় এমন Save */
var LOGIN=CFG.loginFns||[],LOGOUT=CFG.logoutFns||[],OFFLINE_READ=CFG.offlineRead||[];
var WRITE_RE=/^(save|add|delete|remove|update|edit|set|link|mark|apply|upload|create|move|release|readmit|import|restore|reset|clear|publish|unpublish|finalize|lock|unlock|send|request|approve|reject|switch|logout|login|verify|change|run|rebuild|prepare|bsd|scan|cmp|cancel|undo|archive|transfer|merge|fix|generate|make|copy|rename)/i;
function isWrite(fn){return OFFLINE_READ.indexOf(fn)<0&&(QUEUE.indexOf(fn)>=0||WRITE_RE.test(fn));}
function curToken(){var t='';(CFG.tokenVars||[]).forEach(function(v){try{if(!t&&window.eval('typeof '+v+'!=="undefined"&&'+v))t=window.eval(v);}catch(e){}});return t||'';}
function curCtx(){var v='';try{if(CFG.ctxExpr)v=String(window.eval(CFG.ctxExpr)||'');}catch(e){}return v;}
function normArgs(args){var tok=curToken();return JSON.stringify(args,function(k,v){if(tok&&v===tok)return '§';if((k==='token'||k==='sessionToken'||k==='TOKEN')&&typeof v==='string'&&v)return '§';return v;});}
function swapToken(args,oldT,newT){if(!oldT||!newT||oldT===newT)return args;return JSON.parse(JSON.stringify(args),function(k,v){return v===oldT?newT:v;});}

/* ---- server ডাকা ---- */
function post(fn,args){
  var u=execUrl();if(!u)return Promise.reject(new Error('Apps Script-এর Link বসানো নেই'));
  var ctl=typeof AbortController!=='undefined'?new AbortController():null,tm=ctl?setTimeout(function(){ctl.abort();},330000):null;
  return fetch(u,{method:'POST',body:JSON.stringify({fn:fn,args:args}),headers:{'Content-Type':'text/plain;charset=utf-8'},redirect:'follow',signal:ctl?ctl.signal:undefined})
    .then(function(r){if(tm)clearTimeout(tm);if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(j){if(!j||typeof j!=='object')throw new Error('Server-এর উত্তর বোঝা গেল না');j.__net=true;return j;});
}

/* ---- লাইনে থাকা Save (outbox) ---- */
function qList(){try{return JSON.parse(LS('outbox')||'[]')||[];}catch(e){return [];}}
function qSave(a){try{LS('outbox',JSON.stringify(a));return true;}catch(e){return false;}}
function qFailed(){try{return JSON.parse(LS('failed')||'[]')||[];}catch(e){return [];}}
function qSaveFailed(a){try{LS('failed',JSON.stringify(a));}catch(e){}}
var FLUSHING=false,LAST_CTX='';
function restoreCtx(){var c=curCtx();if(CFG.ctxFn&&LAST_CTX&&c&&c!==LAST_CTX){post(CFG.ctxFn,[curToken(),c]).catch(function(){});}LAST_CTX='';}
function flush(){
  if(FLUSHING)return;var q=qList();if(!q.length){badge();return;}
  FLUSHING=true;badge();
  var item=q[0],tok=curToken()||item.tok,args=swapToken(item.args,item.tok,tok);
  var pre=(CFG.ctxFn&&item.ctx&&item.ctx!==LAST_CTX)?post(CFG.ctxFn,[tok,item.ctx]).then(function(){LAST_CTX=item.ctx;}):Promise.resolve();
  pre.then(function(){return post(item.fn,args);}).then(function(res){
    var q2=qList();q2.shift();qSave(q2);
    if(!res.ok){var f=qFailed();f.push({fn:item.fn,args:item.args,tok:item.tok,ctx:item.ctx,at:item.at,err:res.e});qSaveFailed(f);}
    FLUSHING=false;if(q2.length)setTimeout(flush,200);else{restoreCtx();badge();toast(res.ok?'✔ অফলাইনে রাখা সব কাজ Save হয়ে গেছে।':'⚠ একটা কাজ Save হল না — নিচের বোতামে দেখুন।');}
  }).catch(function(){FLUSHING=false;badge();});
}
function enqueue(fn,args){
  var s=JSON.stringify(args);if(s.length>900000)return false;
  var q=qList();q.push({fn:fn,args:args,tok:curToken(),ctx:curCtx(),at:Date.now()});return qSave(q);
}

/* ---- google.script.run-এর বদলি ---- */
var OFFLINE_MSG='📴 নেট নেই — এই কাজটা নেট ছাড়া করা যায় না। নেট এলে আবার চেষ্টা করুন।';
function call(fn,args,ok,fail,uo){
  var key='d|'+curCtx()+'|'+fn+'|'+normArgs(args),w=isWrite(fn);
  var done=function(v){try{ok&&ok(v,uo);}catch(e){console.error(e);}};
  var bad=function(m){try{fail?fail(new Error(m),uo):console.warn(m);}catch(e){console.error(e);}};
  var offline=function(){
    if(LOGIN.indexOf(fn)>=0){sha(KEY+'|'+JSON.stringify(args)).then(function(h){return cGet('login|'+h);}).then(function(c){if(c&&c.v){toast('📴 অফলাইনে Login — আগের Login দিয়ে খোলা হল।');done(c.v);}else bad('📴 নেট নেই — এই ফোনে আগে একবার নেট থাকতে এই User ID / Password দিয়ে Login করা থাকলে তবেই অফলাইনে Login হয়।');});return;}
    if(LOGOUT.indexOf(fn)>=0){done({success:true,ok:true});return;}
    if(QUEUE.indexOf(fn)>=0){if(enqueue(fn,args)){badge();toast('📴 নেট নেই — রাখা হল। নেট এলে নিজে থেকে Save হবে।');done({success:true,ok:true,queued:true,offline:true,saved:0,count:0,message:'📴 অফলাইনে রাখা হল — নেট এলে Save হবে'});}else bad('📴 নেট নেই, আর এটা অনেক বড় (ছবি ইত্যাদি) — নেট এলে করুন।');return;}
    if(w){bad(OFFLINE_MSG);return;}
    cGet(key).then(function(c){if(c){done(c.v);}else bad('📴 নেট নেই — এই তথ্য এই ফোনে আগে খোলা হয়নি, তাই অফলাইনে দেখানো যাচ্ছে না।');});
  };
  if(navigator.onLine===false){offline();return;}
  post(fn,args).then(function(res){
    if(!res.ok){bad(res.e);return;}
    if(LOGIN.indexOf(fn)>=0)sha(KEY+'|'+JSON.stringify(args)).then(function(h){cPut('login|'+h,res.r);});
    if(LOGOUT.indexOf(fn)>=0)cClearData();
    if(!w)cPut(key,res.r);
    done(res.r);
    if(qList().length)setTimeout(flush,300);
  }).catch(function(){offline();});
}
function runner(st){
  return new Proxy({},{get:function(t,p){
    if(p==='withSuccessHandler')return function(f){return runner({ok:f,fail:st.fail,uo:st.uo});};
    if(p==='withFailureHandler')return function(f){return runner({ok:st.ok,fail:f,uo:st.uo});};
    if(p==='withUserObject')return function(u){return runner({ok:st.ok,fail:st.fail,uo:u});};
    if(typeof p!=='string'||p==='then')return undefined;
    return function(){call(p,Array.prototype.slice.call(arguments),st.ok,st.fail,st.uo);};
  }});
}
var params={};try{new URLSearchParams(location.search).forEach(function(v,k){params[k]=v;});}catch(e){}
window.google={script:{
  get run(){return runner({});},
  url:{getLocation:function(cb){var p={};Object.keys(params).forEach(function(k){p[k]=[params[k]];});cb&&cb({parameter:params,parameters:p,hash:(location.hash||'').replace(/^#/,'')});}},
  host:{close:function(){},setHeight:function(){},setWidth:function(){},editor:{focus:function(){}},origin:location.origin},
  history:{push:function(){},replace:function(){},setChangeHandler:function(){}}
}};

/* ---- ছোট সংকেত (নিচে বাঁদিকে) ---- */
function ensureUi(){
  if(document.getElementById('offlBadge'))return;
  var st=document.createElement('style');st.textContent='#offlBadge{position:fixed;left:8px;bottom:8px;z-index:2147483000;font:700 12px Arial,sans-serif;border-radius:16px;padding:6px 11px;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;display:none}#offlToast{position:fixed;left:50%;bottom:44px;transform:translateX(-50%);z-index:2147483001;background:#1e293b;color:#fff;font:600 13px Arial,sans-serif;padding:9px 14px;border-radius:10px;max-width:90vw;display:none;text-align:center}@media print{#offlBadge,#offlToast{display:none!important}}';
  document.head.appendChild(st);
  var b=document.createElement('div');b.id='offlBadge';b.onclick=panel;document.body.appendChild(b);
  var t=document.createElement('div');t.id='offlToast';document.body.appendChild(t);
}
function badge(){
  var b=document.getElementById('offlBadge');if(!b)return;
  var n=qList().length,f=qFailed().length,on=navigator.onLine!==false;
  var txt='',bg='';
  if(f){txt='⚠ '+f+'টা Save হয়নি';bg='#c62828';}
  else if(n){txt=(on?'⏳ ':'📴 ')+n+'টা Save বাকি';bg=on?'#b26a00':'#455a64';}
  else if(!on){txt='📴 অফলাইন';bg='#455a64';}
  b.style.display=txt?'block':'none';b.style.background=bg;b.style.color='#fff';b.textContent=txt;
}
var toastT=null;
function toast(m){var t=document.getElementById('offlToast');if(!t)return;t.textContent=m;t.style.display='block';clearTimeout(toastT);toastT=setTimeout(function(){t.style.display='none';},3500);}
function panel(){
  var f=qFailed(),n=qList().length;
  var msg=(navigator.onLine===false?'📴 এখন নেট নেই।\n':'')+(n?n+'টা কাজ Save হওয়ার অপেক্ষায় — নেট এলে নিজে থেকে যাবে।\n':'');
  if(f.length){msg+='\n⚠ এগুলো Save হয়নি:\n'+f.map(function(x,i){return (i+1)+'. '+x.fn+' — '+x.err;}).join('\n')+'\n\nOK = আবার চেষ্টা (দরকার হলে আগে আবার Login করুন)\nCancel = বাতিল করে মুছে দিন';
    if(confirm(msg)){var q=qList();qSave(f.map(function(x){return {fn:x.fn,args:x.args,tok:x.tok,ctx:x.ctx,at:x.at};}).concat(q));qSaveFailed([]);flush();}
    else if(confirm('সত্যিই '+f.length+'টা না-হওয়া কাজ মুছে দেবেন?')){qSaveFailed([]);}
    badge();return;}
  if(msg)alert(msg);else alert('✔ সব ঠিক আছে — নেট আছে, কোনো কাজ বাকি নেই।');
}
window.__offlInit=function(){
  ensureUi();badge();
  window.addEventListener('online',function(){badge();toast('🌐 নেট এসেছে');flush();});
  window.addEventListener('offline',function(){badge();toast('📴 নেট চলে গেছে — অ্যাপ চলবে, Save-গুলো পরে যাবে।');});
  setInterval(function(){if(qList().length&&navigator.onLine!==false)flush();},30000);
  if(qList().length)setTimeout(flush,1500);
};

/* ---- শুরু: পাতা আনা / জমা থেকে খোলা ---- */
function bootMsg(h){var b=document.getElementById('offlBoot');if(b)b.innerHTML=h;}
function askUrl(err){
  bootMsg('<h2>'+(CFG.name||'')+'</h2><p>'+(err?'<b style="color:#c62828">'+err+'</b><br>':'')+'Apps Script-এর Web app Link দিন (…/exec):</p><input id="offlUrl" style="width:95%;max-width:520px;padding:8px" value="'+(execUrl()||'').replace(/"/g,'&quot;')+'"><br><button id="offlGo" style="margin-top:8px;padding:8px 18px;font-weight:700">চালু করুন</button>');
  document.getElementById('offlGo').onclick=function(){var v=document.getElementById('offlUrl').value.trim().replace(/[?#].*$/,'');if(!/^https:\/\/script\.google\.com\/macros\/s\/[-\w]+\/exec$/.test(v)){alert('ঠিক Link নয় — https://script.google.com/macros/s/…/exec');return;}LS('url',v);location.reload();};
}
function inject(html){
  /* Install-এর জন্য: loader পাতার manifest / icon / theme-color নতুন পাতাতেও রাখা (document.write পুরনো head মুছে দেয়) */
  var keep='';
  try{document.querySelectorAll('link[rel="manifest"],link[rel="icon"],link[rel="apple-touch-icon"],meta[name="theme-color"],meta[name="apple-mobile-web-app-title"]').forEach(function(el){
    var c=el.cloneNode(true);if(c.href!==undefined&&el.getAttribute('href'))c.setAttribute('href',el.href);keep+=c.outerHTML;});}catch(e){}
  keep+='<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">';
  html=String(html).replace(/<base[^>]*>/i,'').replace(/<link[^>]+rel=["']?(manifest|icon|apple-touch-icon)["']?[^>]*>/gi,'');
  html=/<head[^>]*>/i.test(html)?html.replace(/<head[^>]*>/i,function(m){return m+keep;}):keep+html;
  var tail='<script>try{window.__offlInit&&window.__offlInit();}catch(e){}<\/script>';
  html=/<\/body>/i.test(html)?html.replace(/<\/body>(?![\s\S]*<\/body>)/i,tail+'</body>'):html+tail;

  document.open();document.write(html);document.close();
}
function boot(){
  if('serviceWorker' in navigator){try{navigator.serviceWorker.register(CFG.sw||'../sw.js');}catch(e){}}
  if(!execUrl()||/PASTE/.test(execUrl())){askUrl();return;}
  var fromNet=function(){
    var u=execUrl()+'?raw=1&_='+Date.now();
    return fetch(u,{redirect:'follow',cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();}).then(function(j){
      if(j&&j.moved){LS('url',j.moved);location.reload();throw new Error('moved');}
      if(!j||!j.html)throw new Error('পাতা আসেনি — Apps Script-এ নতুন Code.gs বসিয়ে New version Deploy করা আছে তো?');
      return cPut('page',j.html).then(function(){return j.html;});
    });
  };
  var go=function(){
    if(navigator.onLine===false)return cGet('page').then(function(c){if(c&&c.v)return c.v;throw new Error('প্রথমবার খুলতে নেট লাগবে।');});
    return fromNet().catch(function(e){if(e&&e.message==='moved')throw e;return cGet('page').then(function(c){if(c&&c.v){return c.v;}throw e;});});
  };
  go().then(inject).catch(function(e){if(e&&e.message==='moved')return;askUrl('❌ '+(e&&e.message||e));});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
