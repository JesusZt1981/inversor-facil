/* Inversor Fácil V53 · motor ágil + interfaz compacta + patrón estadístico
   Conserva las fuentes y datos existentes. Reduce trabajo de pantalla,
   concentra sincronizaciones y agrega probabilidades históricas sin consultas extra. */
(function(){
  'use strict';

  const VERSION=53;
  const STATE_KEY='inversorFacilV53SyncState';
  const LOG_KEY='inversorFacilV53PerfLog';
  const DATA_VERSION_KEY='inversorFacilV53DataVersion';
  const tasks=new Map();
  const queue=[];
  let running=null;
  let started=false;
  let dataVersion=Number(localStorage.getItem(DATA_VERSION_KEY)||0);
  let manualPriorityUntil=0;
  let renderQueued=false;
  let explorePage=1;

  const now=()=>Date.now();
  const $id=id=>document.getElementById(id);

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
      localStorage.setItem(LOG_KEY,JSON.stringify(rows.slice(-30)));
    }catch(e){}
  }

  function installStyle(){
    if(document.getElementById('v53LeanStyle'))return;
    const st=document.createElement('style');
    st.id='v53LeanStyle';
    st.textContent=`
      body.v53-lean:before{animation:none!important;transform:none!important}
      body.v53-lean .v44-kicker{display:none!important}
      body.v53-lean .section-head>div>p.muted{display:none!important}
      body.v53-lean .asset-card{padding:12px!important;content-visibility:auto;contain-intrinsic-size:160px}
      body.v53-lean .asset-meta{margin-bottom:6px!important}
      body.v53-lean .v47-card-grid .v47-card:first-child{display:none!important}
      body.v53-lean .v47-alert-note{display:none!important}
      body.v53-lean .v47-card-grid{grid-template-columns:1fr!important}
      body.v53-lean .v47-hero{padding:12px!important}
      .v53-sync-pill{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line,#4a3932);border-radius:999px;padding:6px 9px;font-size:11px;color:var(--muted,#c9b9ad);background:rgba(25,20,19,.9)}
      .v53-sync-pill[data-state="busy"]{border-color:#8a6b28;color:#fde68a}.v53-sync-pill[data-state="error"]{border-color:#8a3445;color:#fecdd3}.v53-sync-pill[data-state="ok"]{border-color:#23745e;color:#a7f3d0}
      .v53-dot{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
      .v53-asset-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .v53-asset-head h3{margin:0!important}.v53-symbol{font-size:11px;color:var(--muted,#c9b9ad);margin-top:3px}
      .v53-quote{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:9px 0}
      .v53-quote>div{background:var(--panel2,#2a211e);border-radius:9px;padding:8px}
      .v53-quote span{display:block;color:var(--muted,#c9b9ad);font-size:10px;margin-bottom:3px}.v53-quote strong{font-size:14px}
      .v53-pager{display:flex;justify-content:center;align-items:center;gap:8px;flex-wrap:wrap;margin:13px 0}.v53-pager span{font-size:11px;color:var(--muted,#c9b9ad)}
      .v53-detail-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:11px 0}
      .v53-detail-summary>div{background:var(--panel2,#2a211e);border:1px solid var(--line,#4a3932);border-radius:10px;padding:9px}.v53-detail-summary span{display:block;font-size:10px;color:var(--muted,#c9b9ad);margin-bottom:4px}.v53-detail-summary strong{font-size:15px}
      .v53-stat{border:1px solid #3b628d;border-radius:12px;padding:12px;margin-top:11px;background:rgba(24,31,39,.84)}
      .v53-stat-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.v53-stat-head small{color:var(--muted,#c9b9ad)}
      .v53-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.v53-stat-grid>div{border-top:1px solid rgba(120,150,175,.25);padding-top:7px}.v53-stat-grid span{display:block;font-size:10px;color:var(--muted,#c9b9ad);margin-bottom:3px}.v53-stat-grid strong{font-size:14px}
      .v53-note{font-size:11px;color:var(--muted,#c9b9ad);margin-top:8px;line-height:1.4}
      .v53-details{border:1px solid var(--line,#4a3932);border-radius:10px;margin-top:9px;padding:0 10px;background:rgba(24,20,20,.65)}.v53-details summary{cursor:pointer;padding:10px 0;font-weight:700}.v53-details>div{padding-bottom:10px}
      @media(max-width:720px){.v53-quote,.v53-detail-summary,.v53-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(st);
  }

  function ensurePill(){
    let pill=$id('v53SyncPill');
    if(pill)return pill;
    const top=$id('v27TopStrip')||document.querySelector('header .actions')||document.querySelector('header');
    if(!top)return null;
    pill=document.createElement('span');
    pill.id='v53SyncPill';
    pill.className='v53-sync-pill';
    pill.dataset.state='ok';
    pill.innerHTML='<span class="v53-dot"></span><span id="v53SyncText">Datos listos</span>';
    top.appendChild(pill);
    return pill;
  }
  function paint(text,state='ok'){
    const pill=ensurePill();
    if(!pill)return;
    pill.dataset.state=state;
    const tx=$id('v53SyncText');if(tx)tx.textContent=text;
  }

  function currentTab(){
    const ids=['dashboard','portfolio','explore','marketHistory','externalRadar','top500','trading','compare','backtest','goals','builder','academy','settings'];
    for(const id of ids){const el=$id('tab-'+id);if(el&&!el.classList.contains('hidden'))return id}
    return 'dashboard';
  }

  function renderVisibleNow(reason='data'){
    const tab=currentTab();
    try{
      if(tab==='explore'&&typeof window.renderExplore==='function')return window.renderExplore();
      if(tab==='marketHistory'&&typeof window.renderMarketHistory==='function')return window.renderMarketHistory();
      if(tab==='externalRadar'&&typeof window.renderExternalRadar==='function')return window.renderExternalRadar();
      if(tab==='top500'&&typeof window.renderTop500==='function')return window.renderTop500();
      if(tab==='trading'&&window.v47Trading?.render)return window.v47Trading.render();
      if(tab==='compare'&&typeof window.renderCompare==='function')return window.renderCompare();
      if(tab==='backtest'&&typeof window.renderBacktest==='function')return window.renderBacktest();
      if(tab==='goals'&&typeof window.calculateGoal==='function')return window.calculateGoal();
      if(tab==='builder'&&typeof window.renderBuilder==='function')return window.renderBuilder();
      if(tab==='academy'&&typeof window.renderAcademy==='function')return window.renderAcademy();
      if(tab==='settings')return;
      if(typeof window.render==='function')return window.render();
    }catch(e){console.warn('V53 render visible',reason,tab,e)}
  }
  window.v51RenderVisible=function(reason='data'){
    if(renderQueued)return;
    renderQueued=true;
    requestAnimationFrame(()=>{renderQueued=false;renderVisibleNow(reason)});
  };

  function markData(taskName){
    dataVersion++;
    try{localStorage.setItem(DATA_VERSION_KEY,String(dataVersion))}catch(e){}
    const at=new Date().toISOString();
    saveSmallState({lastSuccess:at,lastTask:taskName,dataVersion});
    document.dispatchEvent(new CustomEvent('inversor:data-updated',{detail:{task:taskName,version:dataVersion,at}}));
  }

  function authReady(){return typeof window.v24Supabase!=='undefined'&&window.v24Supabase?.auth}
  async function hasSession(){
    if(!authReady())return false;
    try{const {data}=await window.v24Supabase.auth.getSession();return !!data?.session?.access_token}catch(e){return false}
  }
  function heavyManualRunning(){
    try{if(typeof top500QueueState!=='undefined'&&top500QueueState?.running)return true}catch(e){}
    try{if(typeof radarQueueState!=='undefined'&&radarQueueState?.running)return true}catch(e){}
    try{if(typeof catalogQueueState!=='undefined'&&catalogQueueState?.running)return true}catch(e){}
    try{if(window.v47Trading?.state?.running)return true}catch(e){}
    return now()<manualPriorityUntil;
  }

  function register(name,{label,interval,priority,initialDelay,run,visibleOnly=false}){
    tasks.set(name,{name,label,interval,priority,run,visibleOnly,nextAt:now()+initialDelay,lastAt:0,lastMs:0,lastOk:null});
  }
  function enqueue(name,priorityOverride=null,force=false){
    const task=tasks.get(name);if(!task)return false;
    if(queue.some(x=>x.name===name)||running?.name===name)return false;
    queue.push({name,priority:priorityOverride??task.priority,force,queuedAt:now()});
    queue.sort((a,b)=>b.priority-a.priority||a.queuedAt-b.queuedAt);
    return true;
  }
  window.v51RequestSync=function(name,opts={}){
    const priority=Number.isFinite(Number(opts.priority))?Number(opts.priority):100;
    return enqueue(name,priority,!!opts.force);
  };

  async function runOne(){
    if(running||!queue.length||document.hidden||!navigator.onLine)return;
    if(heavyManualRunning()){paint('Consulta manual prioritaria','busy');return}
    const job=queue.shift(),task=tasks.get(job.name);if(!task)return;
    if(task.visibleOnly&&currentTab()!==task.visibleOnly){task.nextAt=now()+task.interval;return}
    if(!(await hasSession())){task.nextAt=now()+20000;return}
    running=task;const start=performance.now();paint(task.label,'busy');
    try{
      const ok=await task.run(job.force),ms=Math.round(performance.now()-start);
      task.lastAt=now();task.lastMs=ms;task.lastOk=ok!==false;task.nextAt=now()+task.interval;
      if(ok!==false)markData(task.name);
      logPerf({at:new Date().toISOString(),task:task.name,ms,ok:ok!==false,tab:currentTab()});
      paint(ok===false?'Datos pendientes':'Datos actualizados',ok===false?'busy':'ok');
      window.v51RenderVisible('sync:'+task.name);
    }catch(e){
      const ms=Math.round(performance.now()-start);task.lastAt=now();task.lastMs=ms;task.lastOk=false;task.nextAt=now()+Math.min(task.interval,45000);
      logPerf({at:new Date().toISOString(),task:task.name,ms,ok:false,error:String(e?.message||e),tab:currentTab()});
      paint('Error al actualizar','error');console.warn('V53 sync',task.name,e);
    }finally{running=null}
  }
  function scheduleDue(){
    if(document.hidden||!navigator.onLine)return;
    const t=now();for(const task of tasks.values())if(t>=task.nextAt)enqueue(task.name);runOne();
  }
  function scheduleReturn(){
    const t=now(),cat=tasks.get('catalog'),top=tasks.get('top500');
    if(cat&&t-cat.lastAt>120000){cat.nextAt=t;enqueue('catalog',80)}
    if(top&&t-top.lastAt>300000){top.nextAt=t+2500;setTimeout(()=>{enqueue('top500',60);runOne()},2500)}
    runOne();
  }
  function registerTasks(){
    register('catalog',{label:'Actualizando catálogo',interval:120000,priority:40,initialDelay:3500,run:async()=>{if(typeof window.v27LoadSharedCatalog!=='function')return false;await window.v27LoadSharedCatalog();return true}});
    register('top500',{label:'Actualizando Top 500',interval:300000,priority:30,initialDelay:12000,run:async force=>{const fn=window.v50LoadTop500Shared||window.v51LoadSharedTop500;if(typeof fn!=='function')return false;return await fn(!!force)}});
    register('trading',{label:'Actualizando Trading',interval:300000,priority:20,initialDelay:25000,visibleOnly:'trading',run:async()=>{if(!window.v47Trading?.scan)return false;await window.v47Trading.scan();return true}});
  }

  function markManualOnlineAction(e){
    const target=e.target.closest?.('#top500Analyze,.v48Validate,#scanExternalRadar,#catalogQueueStart,#v47Scan,#updatePrices,#updateAllHoldings,[data-online-validate]');
    if(!target)return;manualPriorityUntil=now()+90000;paint('Consulta manual prioritaria','busy');
  }

  function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
  function sd(a){if(a.length<2)return 1;const m=mean(a),v=mean(a.map(x=>(x-m)**2));return Math.sqrt(v)||1}
  function quantile(a,q){if(!a.length)return 0;const x=[...a].sort((m,n)=>m-n),p=(x.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?x[lo]:x[lo]+(x[hi]-x[lo])*(p-lo)}
  function historyRows(symbol){
    try{return (window.radarLoad?.()?.histories?.[symbol]||[]).map(x=>({day:String(x.day||x.datetime||'').slice(0,10),close:Number(x.close)})).filter(x=>x.day&&Number.isFinite(x.close)&&x.close>0).sort((a,b)=>a.day.localeCompare(b.day))}catch(e){return []}
  }
  function nextBusinessRange(days=5){
    let d=new Date(),arr=[];while(arr.length<days){d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1,12);const w=d.getDay();if(w!==0&&w!==6)arr.push(new Date(d))}
    const f=x=>x.toLocaleDateString('es-MX',{day:'2-digit',month:'short'});return `${f(arr[0])} – ${f(arr.at(-1))}`;
  }
  function statModel(symbol){
    const rows=historyRows(symbol);if(rows.length<55)return {ok:false,n:rows.length};
    const c=rows.map(x=>x.close),daily=[];for(let i=1;i<c.length;i++)daily.push((c[i]/c[i-1]-1)*100);
    const features=[];
    for(let i=20;i<c.length-5;i++){
      const d1=(c[i]/c[i-1]-1)*100,d5=(c[i]/c[i-5]-1)*100,recent=[];
      for(let j=i-19;j<=i;j++)if(j>0)recent.push((c[j]/c[j-1]-1)*100);
      const vol=sd(recent),n1=(c[i+1]/c[i]-1)*100,n5=(c[i+5]/c[i]-1)*100;
      let mx=-Infinity,mn=Infinity;for(let j=1;j<=5;j++){const r=(c[i+j]/c[i]-1)*100;mx=Math.max(mx,r);mn=Math.min(mn,r)}
      features.push({d1,d5,vol,n1,n5,mx,mn});
    }
    if(features.length<30)return {ok:false,n:rows.length};
    const i=c.length-1,cur1=(c[i]/c[i-1]-1)*100,cur5=(c[i]/c[i-5]-1)*100,recent=[];
    for(let j=i-19;j<=i;j++)if(j>0)recent.push((c[j]/c[j-1]-1)*100);
    const curVol=sd(recent),s1=sd(features.map(x=>x.d1)),s5=sd(features.map(x=>x.d5)),sv=sd(features.map(x=>x.vol));
    features.forEach(x=>x.dist=Math.abs(x.d1-cur1)/s1+Math.abs(x.d5-cur5)/s5+Math.abs(x.vol-curVol)/sv);
    const k=Math.min(60,Math.max(25,Math.floor(features.length*.28))),near=[...features].sort((a,b)=>a.dist-b.dist).slice(0,k);
    const p1=near.filter(x=>x.n1>0).length/near.length*100,p5=near.filter(x=>x.n5>0).length/near.length*100;
    const base5=features.filter(x=>x.n5>0).length/features.length*100,strong=quantile(daily.map(Math.abs),.95);
    const upStrong=near.filter(x=>x.mx>=strong).length/near.length*100,downStrong=near.filter(x=>x.mn<=-strong).length/near.length*100;
    const edge=p5-base5,confidence=near.length>=50&&Math.abs(edge)>=7?'Alta':near.length>=35?'Media':'Baja';
    const strongRisk=Math.max(upStrong,downStrong)>=30?'Alta':Math.max(upStrong,downStrong)>=20?'Media':'Baja';
    return {ok:true,n:near.length,p1,p5,base5,edge,avg1:mean(near.map(x=>x.n1)),avg5:mean(near.map(x=>x.n5)),strong,upStrong,downStrong,confidence,strongRisk,window:nextBusinessRange(5)};
  }
  window.v53StatModel=statModel;

  function esc(v){return String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')}
  function pct(v){return Number.isFinite(Number(v))?`${Number(v)>=0?'+':''}${Number(v).toFixed(2)}%`:'—'}

  function renderExploreLean(){
    if(typeof filteredAssets!=='function'||!$id('assetGrid'))return;
    const catalog=(typeof assets!=='undefined'?assets:[]);
    const full=filteredAssets(),size=24,q=$id('search')?.value?.trim()||'',allText=typeof searchMatches==='function'?catalog.filter(a=>searchMatches(a,q)):[],hint=$id('filterHint');
    const pages=Math.max(1,Math.ceil(full.length/size));explorePage=Math.max(1,Math.min(explorePage,pages));const start=(explorePage-1)*size,list=full.slice(start,start+size);
    if($id('resultCount'))$id('resultCount').textContent=`${full.length} resultados`;
    if(hint){
      if(q&&!full.length&&allText.length){hint.innerHTML=`Encontré ${esc(allText.slice(0,3).map(a=>a.name).join(', '))}, pero un filtro lo oculta. <button id="v53ClearFilters" class="primary small" type="button">Quitar filtros</button>`;hint.classList.remove('hidden');setTimeout(()=>$id('v53ClearFilters')?.addEventListener('click',()=>{['typeFilter','countryFilter','sectorFilter','riskFilter'].forEach(id=>{const el=$id(id);if(el)el.value='all'});explorePage=1;renderExploreLean()}),0)}
      else if(q&&!full.length){hint.textContent='No está en el catálogo local. Puedes buscarlo en internet.';hint.classList.remove('hidden')}
      else{hint.classList.add('hidden');hint.innerHTML=''}
    }
    $id('assetGrid').innerHTML=list.map((a,i)=>{
      const summary=typeof window.symbolSummary==='function'?window.symbolSummary(a.symbol):{invested:0,current:0},has=Number(summary?.invested)>0,d=Number(a.dailyPercent),cls=!Number.isFinite(d)?'flat':d>0?'up':d<0?'down':'flat';
      const price=a.currency==='USD'&&typeof window.usd==='function'?window.usd(a.price):`${Number(a.price||0).toLocaleString('es-MX',{maximumFractionDigits:2})} ${a.currency||''}`;
      const rankMode=$id('marketSort')?.value||'default',rankValue=typeof window.v31CatalogPeriodReturn==='function'?window.v31CatalogPeriodReturn(a.symbol,rankMode):null,rankLabels={dailyDesc:'Hoy',weekDesc:'Semana',monthDesc:'Mes',yearDesc:'Año',dailyAsc:'Hoy'};
      const rank=rankLabels[rankMode]?`<div class="v53-symbol">${rankLabels[rankMode]} ${Number.isFinite(rankValue)?pct(rankValue):'S/A'}</div>`:'';
      return `<div class="asset-card" data-chart-symbol="${esc(a.symbol)}" data-chart-source="catalog"><div class="v53-asset-head"><div><h3>${esc(a.name)}</h3><div class="v53-symbol">${esc(a.symbol)} · ${a.type==='etf'?'ETF':'Empresa'} · ${esc(a.sector||'')}</div>${rank}</div><span class="rank-badge">${start+i+1}</span></div><div class="v53-quote"><div><span>Precio</span><strong>${price}</strong></div><div><span>Hoy</span><strong class="daily-chip ${cls}" style="padding:2px 6px">${pct(d)}</strong></div><div><span>Riesgo</span><strong>${esc(a.risk||'—')}</strong></div></div>${has?`<div class="status ok">En cartera · ${typeof window.money==='function'?window.money(summary.invested):summary.invested}</div>`:''}<div class="actions"><button class="primary small addAsset" data-symbol="${esc(a.symbol)}">${has?'Invertir más':'Simular'}</button><button class="secondary small detailAsset" data-symbol="${esc(a.symbol)}">Analizar</button><button class="secondary small compareAsset" data-symbol="${esc(a.symbol)}">Comparar</button>${has?`<button class="secondary small updateFromExplore" data-symbol="${esc(a.symbol)}">Actualizar</button>`:''}</div></div>`;
    }).join('')||'<div class="empty">No se encontraron resultados.</div>';

    let nav=$id('v53ExplorePager');if(!nav){nav=document.createElement('div');nav.id='v53ExplorePager';$id('assetGrid').insertAdjacentElement('afterend',nav)}
    nav.className='v53-pager';nav.innerHTML=`<button type="button" class="secondary small" data-v53="prev" ${explorePage<=1?'disabled':''}>‹</button><span>Página ${explorePage} de ${pages} · ${full.length} resultados</span><button type="button" class="secondary small" data-v53="next" ${explorePage>=pages?'disabled':''}>›</button>`;
    nav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{explorePage=b.dataset.v53==='next'?Math.min(pages,explorePage+1):Math.max(1,explorePage-1);renderExploreLean();$id('assetGrid')?.scrollIntoView({block:'start'})}));
    document.querySelectorAll('.addAsset').forEach(b=>b.addEventListener('click',()=>window.addAssetDialog?.(b.dataset.symbol)));
    document.querySelectorAll('.compareAsset').forEach(b=>b.addEventListener('click',()=>{window.addCompare?.(b.dataset.symbol);window.showTab?.('compare')}));
    document.querySelectorAll('.detailAsset').forEach(b=>b.addEventListener('click',()=>window.openAssetDetail?.(b.dataset.symbol)));
    document.querySelectorAll('.updateFromExplore').forEach(b=>b.addEventListener('click',()=>window.updateSinglePrice?.(b.dataset.symbol,true)));
  }

  function installExplore(){
    if(typeof window.renderExplore!=='function')return;
    window.v53OriginalRenderExplore=window.renderExplore;
    window.renderExplore=renderExploreLean;
    const rebind=id=>{
      const old=$id(id);if(!old||old.dataset.v53Rebound==='1')return;
      const c=old.cloneNode(true);c.dataset.v53Rebound='1';old.replaceWith(c);
      const refresh=()=>{explorePage=1;renderExploreLean()};
      c.addEventListener('input',refresh);c.addEventListener('change',refresh);
    };
    ['search','typeFilter','countryFilter','sectorFilter','riskFilter','marketSort'].forEach(rebind);
  }

  function openAssetDetailLean(symbol){
    let a=(typeof assets!=='undefined'?assets:[]).find(x=>x.symbol===symbol);if(!a)return window.v53OriginalOpenAssetDetail?.(symbol);
    const summary=typeof window.symbolSummary==='function'?window.symbolSummary(symbol):{invested:0,current:0},fx=Number($id('fx')?.value)||1,mxn=a.currency==='USD'?Number(a.price)*fx:Number(a.price),s=statModel(symbol);
    const money=v=>typeof window.money==='function'?window.money(v):Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'}),price=a.currency==='USD'&&typeof window.usd==='function'?window.usd(a.price):`${Number(a.price||0).toFixed(2)} ${a.currency||''}`;
    const direction=s.ok?(s.p5>=55?'Sesgo alcista':s.p5<=45?'Sesgo bajista':'Sin sesgo claro'):'Sin datos suficientes';
    const stat=s.ok?`<div class="v53-stat"><div class="v53-stat-head"><div><strong>Patrón estadístico actual</strong><br><small>${direction} · ${s.n} casos similares · confianza ${s.confidence.toLowerCase()}</small></div><span class="badge">${s.window}</span></div><div class="v53-stat-grid"><div><span>Subir próxima sesión</span><strong>${s.p1.toFixed(1)}%</strong></div><div><span>Subir en 5 sesiones</span><strong>${s.p5.toFixed(1)}%</strong></div><div><span>Retorno medio 5 sesiones</span><strong>${pct(s.avg5)}</strong></div><div><span>Ventaja vs base</span><strong>${s.edge>=0?'+':''}${s.edge.toFixed(1)} pp</strong></div><div><span>Movimiento fuerte</span><strong>±${s.strong.toFixed(2)}%</strong></div><div><span>Alza fuerte en ventana</span><strong>${s.upStrong.toFixed(1)}%</strong></div><div><span>Baja fuerte en ventana</span><strong>${s.downStrong.toFixed(1)}%</strong></div><div><span>Riesgo de movimiento fuerte</span><strong>${s.strongRisk}</strong></div></div><div class="v53-note">Ventana estadística aproximada, no fecha garantizada. Se calcula con históricos ya guardados y no consume créditos adicionales.</div></div>`:`<div class="status">Patrón estadístico: todavía faltan datos diarios suficientes para ${esc(symbol)} (${s.n||0} registros).</div>`;
    const description=typeof window.defaultDescription==='function'?window.defaultDescription(a):(a.description||`${a.name} · ${a.sector||''}`);
    const content=$id('assetDetailContent'),back=$id('assetDetailBackdrop');if(!content||!back)return window.v53OriginalOpenAssetDetail?.(symbol);
    content.innerHTML=`<div class="detail-hero"><div class="detail-title"><div><h2>${esc(a.name)}</h2><div class="muted">${esc(a.symbol)} · ${a.type==='etf'?'ETF':'Empresa'} · ${esc(a.sector||'')}</div></div></div><div class="v53-detail-summary"><div><span>Precio</span><strong>${price}</strong></div><div><span>MXN aprox.</span><strong>${money(mxn)}</strong></div><div><span>Hoy</span><strong>${pct(a.dailyPercent)}</strong></div><div><span>Tu inversión</span><strong>${Number(summary.invested)>0?money(summary.invested):'Sin posición'}</strong></div></div>${stat}<details class="v53-details"><summary>Información del activo</summary><div><p>${description}</p><p><b>País:</b> ${esc(a.country||'—')} · <b>Sector:</b> ${esc(a.sector||'—')} · <b>Bolsa:</b> ${esc(a.exchange||'—')} · <b>Moneda:</b> ${esc(a.currency||'USD')}</p></div></details><details class="v53-details"><summary>Riesgo</summary><div>Riesgo orientativo: <b>${esc(a.risk||'—')}</b>. El precio puede bajar; el patrón estadístico no garantiza el movimiento futuro.</div></details>`;
    back.classList.remove('hidden');
  }
  function installDetail(){
    if(typeof window.openAssetDetail!=='function')return;
    window.v53OriginalOpenAssetDetail=window.openAssetDetail;
    window.openAssetDetail=openAssetDetailLean;
  }

  function hookTabs(){
    if(typeof window.showTab!=='function')return;
    const previous=window.showTab;if(previous.__v53Wrapped)return;
    function wrapped(name){
      const result=previous.apply(this,arguments);
      requestAnimationFrame(()=>{
        saveSmallState({activeTab:name});
        if(name==='explore')renderExploreLean();
        if(name==='top500')enqueue('top500',95,true);
        if(name==='trading')enqueue('trading',90,true);
        runOne();
      });
      return result;
    }
    wrapped.__v53Wrapped=true;window.showTab=wrapped;
  }

  function installLeanUi(){
    installStyle();
    document.body?.classList.add('v53-lean');
    installExplore();
    installDetail();
    hookTabs();
  }

  function start(){
    if(started)return;started=true;
    installLeanUi();ensurePill();registerTasks();
    document.addEventListener('click',markManualOnlineAction,true);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleReturn()});
    window.addEventListener('focus',scheduleReturn,{passive:true});
    window.addEventListener('online',()=>{paint('Conexión recuperada','ok');scheduleReturn()},{passive:true});
    window.addEventListener('offline',()=>paint('Sin conexión','busy'),{passive:true});
    setInterval(scheduleDue,10000);setTimeout(scheduleDue,1200);paint('Datos listos','ok');
  }

  window.v51PerformanceReport=function(){
    return {version:VERSION,dataVersion,currentTab:currentTab(),running:running?.name||null,queue:queue.map(x=>x.name),tasks:[...tasks.values()].map(t=>({name:t.name,lastAt:t.lastAt,lastMs:t.lastMs,lastOk:t.lastOk,nextAt:t.nextAt})),recent:safeJson(LOG_KEY,[])};
  };

  installStyle();
  if(document.body)document.body.classList.add('v53-lean');
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,150));
  else setTimeout(start,0);
})();
