/* Inversor Fácil V51 · motor central de sincronización
   Objetivo: conservar las mismas fuentes y datos, pero evitar que varias
   sincronizaciones y renders pesados compitan al mismo tiempo. */
(function(){
  'use strict';

  const VERSION=51;
  const STATE_KEY='inversorFacilV51SyncState';
  const LOG_KEY='inversorFacilV51PerfLog';
  const tasks=new Map();
  const queue=[];
  let running=null;
  let started=false;
  let dataVersion=Number(localStorage.getItem('inversorFacilV51DataVersion')||0);
  let manualPriorityUntil=0;

  const now=()=>Date.now();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function safeJson(key,fallback){
    try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch(e){return fallback}
  }

  function saveSmallState(patch={}){
    const prev=safeJson(STATE_KEY,{});
    const next={...prev,...patch,version:VERSION};
    try{localStorage.setItem(STATE_KEY,JSON.stringify(next))}catch(e){}
    return next;
  }

  function logPerf(entry){
    try{
      const rows=safeJson(LOG_KEY,[]);
      rows.push(entry);
      localStorage.setItem(LOG_KEY,JSON.stringify(rows.slice(-40)));
    }catch(e){}
  }

  function ensureBar(){
    if(document.getElementById('v51SyncBar'))return;
    const host=document.querySelector('.app');
    if(!host)return;
    const bar=document.createElement('div');
    bar.id='v51SyncBar';
    bar.dataset.state='ok';
    bar.innerHTML='<div class="v51-left"><span id="v51SyncDot"></span><strong id="v51SyncTask">Listo</strong><span id="v51SyncMeta">Esperando actualización</span></div><div class="v51-right"><span id="v51SyncQueue">Cola: 0</span><span id="v51DataVersion">Datos v0</span></div>';
    host.insertBefore(bar,host.firstChild);
  }

  function paint(text,state='ok',meta=''){
    ensureBar();
    const bar=document.getElementById('v51SyncBar');
    const task=document.getElementById('v51SyncTask');
    const m=document.getElementById('v51SyncMeta');
    const q=document.getElementById('v51SyncQueue');
    const v=document.getElementById('v51DataVersion');
    if(bar)bar.dataset.state=state;
    if(task)task.textContent=text;
    if(m)m.textContent=meta||'';
    if(q)q.textContent=`Cola: ${queue.length}${running?' + 1 activa':''}`;
    if(v)v.textContent=`Datos v${dataVersion}`;
  }

  function currentTab(){
    const ids=['dashboard','portfolio','explore','marketHistory','externalRadar','top500','trading','compare','backtest','goals','builder','academy','settings'];
    for(const id of ids){
      const el=document.getElementById('tab-'+id);
      if(el && !el.classList.contains('hidden'))return id;
    }
    return 'dashboard';
  }

  window.v51RenderVisible=function(reason='data'){
    const tab=currentTab();
    try{
      if(tab==='explore' && typeof renderExplore==='function')return renderExplore();
      if(tab==='marketHistory' && typeof renderMarketHistory==='function')return renderMarketHistory();
      if(tab==='externalRadar' && typeof renderExternalRadar==='function')return renderExternalRadar();
      if(tab==='top500' && typeof renderTop500==='function')return renderTop500();
      if(tab==='trading' && window.v47Trading?.render)return window.v47Trading.render();
      if(tab==='compare' && typeof renderCompare==='function')return renderCompare();
      if(tab==='backtest' && typeof renderBacktest==='function')return renderBacktest();
      if(tab==='goals' && typeof calculateGoal==='function')return calculateGoal();
      if(tab==='builder' && typeof renderBuilder==='function')return renderBuilder();
      if(tab==='academy' && typeof renderAcademy==='function')return renderAcademy();
      if(tab==='settings')return;
      if(typeof render==='function')return render();
    }catch(e){console.warn('V51 render visible',reason,tab,e)}
  };

  function markData(taskName){
    dataVersion++;
    try{localStorage.setItem('inversorFacilV51DataVersion',String(dataVersion))}catch(e){}
    const at=new Date().toISOString();
    saveSmallState({lastSuccess:at,lastTask:taskName,dataVersion});
    document.dispatchEvent(new CustomEvent('inversor:data-updated',{detail:{task:taskName,version:dataVersion,at}}));
  }

  function authReady(){
    return typeof v24Supabase!=='undefined' && v24Supabase?.auth;
  }

  async function hasSession(){
    if(!authReady())return false;
    try{
      const {data}=await v24Supabase.auth.getSession();
      return !!data?.session?.access_token;
    }catch(e){return false}
  }

  function heavyManualRunning(){
    try{if(typeof top500QueueState!=='undefined' && top500QueueState?.running)return true}catch(e){}
    try{if(typeof radarQueueState!=='undefined' && radarQueueState?.running)return true}catch(e){}
    try{if(typeof catalogQueueState!=='undefined' && catalogQueueState?.running)return true}catch(e){}
    try{if(window.v47Trading?.state?.running)return true}catch(e){}
    return now()<manualPriorityUntil;
  }

  function register(name,{label,interval,priority,initialDelay,run,visibleOnly=false}){
    tasks.set(name,{name,label,interval,priority,run,visibleOnly,nextAt:now()+initialDelay,lastAt:0,lastMs:0,lastOk:null});
  }

  function enqueue(name,priorityOverride=null,force=false){
    const task=tasks.get(name);
    if(!task)return false;
    if(queue.some(x=>x.name===name))return false;
    if(running?.name===name)return false;
    queue.push({name,priority:priorityOverride??task.priority,force,queuedAt:now()});
    queue.sort((a,b)=>b.priority-a.priority||a.queuedAt-b.queuedAt);
    paint(running?running.label:'Listo',running?'busy':'ok',running?'Sincronización en curso':'Actualizaciones ordenadas');
    return true;
  }

  window.v51RequestSync=function(name,opts={}){
    const priority=Number.isFinite(Number(opts.priority))?Number(opts.priority):100;
    return enqueue(name,priority,!!opts.force);
  };

  async function runOne(){
    if(running||!queue.length)return;
    if(document.hidden||!navigator.onLine)return;

    if(heavyManualRunning()){
      paint('Validación online prioritaria','busy','Las tareas automáticas esperan para no competir con la consulta actual.');
      return;
    }

    const job=queue.shift();
    const task=tasks.get(job.name);
    if(!task)return;

    if(task.visibleOnly && currentTab()!==task.visibleOnly){
      task.nextAt=now()+task.interval;
      return;
    }

    if(!(await hasSession())){
      task.nextAt=now()+15000;
      return;
    }

    running=task;
    const start=performance.now();
    paint(task.label,'busy','Consultando y aplicando datos en orden cronológico…');

    try{
      const ok=await task.run(job.force);
      const ms=Math.round(performance.now()-start);
      task.lastAt=now();task.lastMs=ms;task.lastOk=ok!==false;task.nextAt=now()+task.interval;
      if(ok!==false)markData(task.name);
      logPerf({at:new Date().toISOString(),task:task.name,ms,ok:ok!==false,tab:currentTab()});
      paint(ok===false?'Actualización pendiente':'Actualizado',ok===false?'warn':'ok',`${task.label} · ${ms} ms · ${new Date().toLocaleTimeString('es-MX')}`);
    }catch(e){
      const ms=Math.round(performance.now()-start);
      task.lastAt=now();task.lastMs=ms;task.lastOk=false;task.nextAt=now()+Math.min(task.interval,30000);
      logPerf({at:new Date().toISOString(),task:task.name,ms,ok:false,error:String(e?.message||e),tab:currentTab()});
      paint('Error de sincronización','error',`${task.label}: ${e?.message||e}`);
      console.warn('V51 sync',task.name,e);
    }finally{
      running=null;
    }
  }

  function scheduleDue(){
    if(document.hidden||!navigator.onLine)return;
    const t=now();
    for(const task of tasks.values()){
      if(t>=task.nextAt)enqueue(task.name);
    }
    runOne();
  }

  function scheduleReturn(){
    const t=now();
    const cat=tasks.get('catalog');
    const top=tasks.get('top500');
    if(cat && t-cat.lastAt>30000){cat.nextAt=t;enqueue('catalog',80)}
    if(top && t-top.lastAt>60000){top.nextAt=t+4000;setTimeout(()=>enqueue('top500',60),4000)}
    runOne();
  }

  function registerTasks(){
    register('catalog',{
      label:'Sincronizando catálogo',
      interval:60000,
      priority:40,
      initialDelay:2500,
      run:async()=>{
        if(typeof v27LoadSharedCatalog!=='function')return false;
        await v27LoadSharedCatalog();
        return true;
      }
    });

    register('top500',{
      label:'Sincronizando Top 500',
      interval:120000,
      priority:30,
      initialDelay:10000,
      run:async(force)=>{
        const fn=window.v50LoadTop500Shared||window.v51LoadSharedTop500;
        if(typeof fn!=='function')return false;
        return await fn(!!force);
      }
    });

    register('trading',{
      label:'Actualizando Trading intradía',
      interval:300000,
      priority:20,
      initialDelay:25000,
      visibleOnly:'trading',
      run:async()=>{
        if(!window.v47Trading?.scan)return false;
        await window.v47Trading.scan();
        return true;
      }
    });
  }

  function markManualOnlineAction(e){
    const target=e.target.closest?.('#top500Analyze,.v48Validate,#scanExternalRadar,#catalogQueueStart,#v47Scan,#updatePrices,#updateAllHoldings,[data-online-validate]');
    if(!target)return;
    manualPriorityUntil=now()+90000;
    paint('Validación online prioritaria','busy','La consulta solicitada por ti tiene prioridad sobre sincronizaciones automáticas.');
  }

  function hookTabs(){
    if(typeof window.showTab!=='function')return;
    const previous=window.showTab;
    if(previous.__v51Wrapped)return;
    function wrapped(name){
      const result=previous.apply(this,arguments);
      requestAnimationFrame(()=>{
        saveSmallState({activeTab:name});
        if(name==='top500')enqueue('top500',95,true);
        if(name==='trading')enqueue('trading',90,true);
        runOne();
      });
      return result;
    }
    wrapped.__v51Wrapped=true;
    window.showTab=wrapped;
  }

  function start(){
    if(started)return;started=true;
    ensureBar();
    registerTasks();
    hookTabs();
    document.addEventListener('click',markManualOnlineAction,true);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleReturn()});
    window.addEventListener('focus',scheduleReturn,{passive:true});
    window.addEventListener('online',()=>{paint('Conexión recuperada','ok','Reanudando sincronización…');scheduleReturn()},{passive:true});
    window.addEventListener('offline',()=>paint('Sin conexión','warn','Se mantienen los últimos datos guardados hasta recuperar internet.'),{passive:true});

    /* Un solo reloj para todas las tareas automáticas. Las consultas reales
       permanecen iguales; sólo se evita ejecutarlas simultáneamente. */
    setInterval(scheduleDue,5000);
    setTimeout(scheduleDue,1000);
    paint('Listo','ok','Motor V51 activo · actualizaciones ordenadas');
  }

  window.v51PerformanceReport=function(){
    return {
      version:VERSION,
      dataVersion,
      currentTab:currentTab(),
      running:running?.name||null,
      queue:queue.map(x=>x.name),
      tasks:[...tasks.values()].map(t=>({name:t.name,lastAt:t.lastAt,lastMs:t.lastMs,lastOk:t.lastOk,nextAt:t.nextAt})),
      recent:safeJson(LOG_KEY,[])
    };
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,3600));
  else setTimeout(start,1200);
})();
