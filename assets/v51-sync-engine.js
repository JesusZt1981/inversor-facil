/* Inversor Fácil V54 · Premium UI + motor ágil + estadística
   Mantiene la lógica del index existente y reorganiza únicamente la presentación,
   sincronización y análisis probabilístico para reducir saturación. */
(function(){
  'use strict';

  const VERSION=54;
  const SIDEBAR_KEY='inversorFacilV54Sidebar';
  const STATE_KEY='inversorFacilV54SyncState';
  const PERF_KEY='inversorFacilV54Perf';
  const DATA_VERSION_KEY='inversorFacilV54DataVersion';
  const EXPLORE_PAGE=24;
  const tasks=new Map();
  const queue=[];
  let running=null;
  let started=false;
  let manualPriorityUntil=0;
  let dataVersion=Number(localStorage.getItem(DATA_VERSION_KEY)||0);
  let explorePage=1;
  let renderScheduled=false;

  const $=id=>document.getElementById(id);
  const now=()=>Date.now();
  const safeJson=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'')||fallback}catch{return fallback}};
  const saveJson=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value))}catch{}};
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));

  function injectCSS(){
    if($('ifV54Style'))return;
    const style=document.createElement('style');
    style.id='ifV54Style';
    style.textContent=`
:root{
  --if-bg:#090d12;--if-panel:#111821;--if-panel2:#171f2b;--if-panel3:#1c2634;
  --if-line:#263448;--if-line2:#33445b;--if-text:#f4f7fb;--if-muted:#8fa1b7;
  --if-cyan:#10d9c4;--if-cyan-soft:rgba(16,217,196,.12);--if-blue:#4c8dff;
  --if-green:#18d8a3;--if-red:#ff5f68;--if-amber:#f6bd48;--if-sidebar:208px;--if-sidebar-mini:72px;
}
html{background:var(--if-bg)!important}
body.if-v54{background:var(--if-bg)!important;color:var(--if-text)!important;min-height:100%;}
body.if-v54:before{display:none!important;animation:none!important}
body.if-v54 .app{max-width:none!important;width:auto!important;margin:0!important;margin-left:var(--if-sidebar)!important;padding:16px 18px 34px!important;min-height:100vh;transition:margin-left .22s ease;background:var(--if-bg)!important}
body.if-v54.if-sidebar-collapsed .app{margin-left:var(--if-sidebar-mini)!important}
body.if-v54 #v30DesktopLeft,body.if-v54 #v30DesktopRight,body.if-v54 #v26MobileNav,body.if-v54 .v44-main-tabs,body.if-v54 #v27MenuButtonTop{display:none!important}
body.if-v54 header,body.if-v54 .app>.notice,body.if-v54 #v30MarketNotice{display:none!important}
body.if-v54 .if-legacy-top-metrics{display:none!important}
body.if-v54 .card,body.if-v54 .investment-card,body.if-v54 .asset-card,body.if-v54 .compare-card,body.if-v54 .portfolio-visual,body.if-v54 .chart-panel,body.if-v54 .strategy-card,body.if-v54 .scenario-card{
  background:var(--if-panel)!important;border:1px solid var(--if-line)!important;border-radius:12px!important;box-shadow:none!important;backdrop-filter:none!important
}
body.if-v54 .card:hover,body.if-v54 .asset-card:hover{border-color:var(--if-line2)!important}
body.if-v54 .metric,body.if-v54 .mini,body.if-v54 .metric-soft,body.if-v54 .asset-stat,body.if-v54 .control-panel{background:var(--if-panel2)!important;border-color:var(--if-line)!important}
body.if-v54 h1,body.if-v54 h2,body.if-v54 h3,body.if-v54 strong,body.if-v54 b{color:var(--if-text)}
body.if-v54 .muted,body.if-v54 small{color:var(--if-muted)!important}
body.if-v54 input,body.if-v54 select{background:var(--if-panel2)!important;border:1px solid var(--if-line)!important;color:var(--if-text)!important;border-radius:9px!important}
body.if-v54 button{border-radius:9px!important}
body.if-v54 .primary{background:var(--if-cyan)!important;color:#03251f!important;box-shadow:none!important}
body.if-v54 .secondary{background:var(--if-panel2)!important;border:1px solid var(--if-line)!important;color:var(--if-text)!important}
body.if-v54 .danger{background:rgba(255,95,104,.11)!important;border:1px solid rgba(255,95,104,.35)!important;color:#ff9299!important}
body.if-v54 .badge{background:var(--if-cyan-soft)!important;border:1px solid rgba(16,217,196,.32)!important;color:#75f4e7!important}
body.if-v54 .positive{color:var(--if-green)!important} body.if-v54 .negative{color:var(--if-red)!important}
body.if-v54 .table-wrap,body.if-v54 .top500-table-wrap{border-color:var(--if-line)!important;border-radius:12px!important;background:var(--if-panel)!important}
body.if-v54 table{background:var(--if-panel)!important}
body.if-v54 th{background:#1b2533!important;color:#91a8c4!important;border-color:var(--if-line)!important;font-size:11px!important;letter-spacing:.04em}
body.if-v54 td{border-color:var(--if-line)!important;padding:11px 10px!important}
body.if-v54 tr:hover td{background:rgba(255,255,255,.018)}
body.if-v54 .status{background:var(--if-panel2)!important;border-color:var(--if-line)!important}
body.if-v54 footer{display:none!important}
body.if-v54 .top500-note{margin:0!important}

#ifPremiumSidebar{position:fixed;inset:0 auto 0 0;width:var(--if-sidebar);z-index:80;background:#111821;border-right:1px solid #263448;display:flex;flex-direction:column;transition:width .22s ease,transform .22s ease;overflow:hidden}
.if-brand{padding:14px 14px 10px;border-bottom:1px solid rgba(255,255,255,.045)}
.if-brand-row{display:flex;align-items:center;gap:10px;min-width:0}
.if-logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#0bdac3,#25a9ff);display:flex;align-items:center;justify-content:center;color:#032421;font-weight:900;flex:0 0 28px}
.if-brand-copy{min-width:0;flex:1}.if-brand-copy strong{font-size:14px;display:block;white-space:nowrap}.if-brand-copy small{font-size:9px!important;display:block;margin-top:2px;white-space:nowrap;color:#56c9f5!important}
#ifSidebarToggle{width:30px;height:30px;padding:0!important;display:flex;align-items:center;justify-content:center;background:#1c2735!important;border:1px solid #32445a!important;color:#cfe0f3!important;flex:0 0 30px}
.if-mode-pill{margin-top:11px;height:18px;border-radius:99px;border:1px solid #11607a;background:#0b3447;color:#57d9ff;font-size:9px;font-weight:800;display:flex;align-items:center;padding:0 8px;white-space:nowrap;overflow:hidden}
.if-nav-scroll{padding:9px 8px 12px;overflow:auto;flex:1;scrollbar-width:thin}
.if-nav-group{margin:5px 0 12px}.if-nav-title{padding:5px 9px;color:#667d98;font-size:9px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;white-space:nowrap}
.if-nav-btn{width:100%;min-height:36px;padding:8px 10px!important;margin:2px 0;background:transparent!important;border:1px solid transparent!important;color:#a9bdd5!important;display:flex;gap:9px;align-items:center;text-align:left;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden}
.if-nav-btn:hover{background:#182332!important;color:white!important}.if-nav-btn.active{background:#1c2735!important;border-color:#2c3d52!important;color:white!important}
.if-nav-icon{width:17px;text-align:center;flex:0 0 17px}.if-nav-label{overflow:hidden;text-overflow:ellipsis}.if-nav-btn.active .if-nav-icon{color:var(--if-cyan)}
.if-sidebar-footer{padding:10px 12px 14px;border-top:1px solid rgba(255,255,255,.05)}
.if-credit-card{background:#182332;border:1px solid #27384c;border-radius:9px;padding:10px;font-size:10px;color:#8ea5bd;margin-bottom:8px}
.if-credit-head{display:flex;justify-content:space-between;gap:8px;margin-bottom:7px}.if-credit-track{height:5px;background:#263447;border-radius:99px;overflow:hidden}.if-credit-fill{height:100%;width:0;background:var(--if-cyan);border-radius:99px}.if-credit-meta{font-size:9px;color:#6f849e;margin-top:6px}
#ifOptimizeData{width:100%;background:#1a2533!important;border:1px solid #293a50!important;color:white!important;font-size:11px;padding:8px!important}.if-footnote{font-size:8.5px;color:#60758e;line-height:1.35;margin-top:8px}
body.if-v54.if-sidebar-collapsed #ifPremiumSidebar{width:var(--if-sidebar-mini)}
body.if-v54.if-sidebar-collapsed .if-brand{padding-left:10px;padding-right:10px}.if-sidebar-collapsed .if-brand-copy,.if-sidebar-collapsed .if-mode-pill,.if-sidebar-collapsed .if-nav-label,.if-sidebar-collapsed .if-nav-title,.if-sidebar-collapsed .if-credit-card,.if-sidebar-collapsed .if-footnote{display:none!important}
.if-sidebar-collapsed .if-brand-row{justify-content:center;flex-wrap:wrap}.if-sidebar-collapsed #ifSidebarToggle{order:2}.if-sidebar-collapsed .if-nav-btn{justify-content:center;padding:8px!important}.if-sidebar-collapsed .if-nav-icon{font-size:15px}.if-sidebar-collapsed .if-sidebar-footer{padding:9px}.if-sidebar-collapsed #ifOptimizeData{font-size:0}.if-sidebar-collapsed #ifOptimizeData:before{content:'⚡';font-size:15px}

#ifPremiumTopbar{min-height:42px;background:var(--if-panel);border:1px solid var(--if-line);border-radius:11px;display:flex;align-items:center;gap:9px;padding:7px 10px;margin:0 0 16px;position:sticky;top:8px;z-index:60;box-shadow:0 8px 25px rgba(0,0,0,.18)}
.if-top-status{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;min-width:max-content}.if-status-dot{width:8px;height:8px;border-radius:50%;background:var(--if-green);box-shadow:0 0 0 5px rgba(24,216,163,.08)}
.if-top-chip{border:1px solid var(--if-line);background:var(--if-panel2);border-radius:99px;padding:6px 10px;font-size:10px;color:#9ab0c9;white-space:nowrap}.if-top-chip.good{border-color:rgba(24,216,163,.34);color:#46e7ba;background:rgba(24,216,163,.07)}
.if-top-spacer{flex:1}.if-top-action{background:var(--if-cyan)!important;color:#06251f!important;font-size:11px;padding:7px 13px!important;font-weight:900!important}.if-mobile-menu{display:none!important}

.if-section-kicker{font-size:10px;letter-spacing:.11em;text-transform:uppercase;color:#7590ad;font-weight:800}.if-inline-title{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.if-inline-title h2{margin:0!important;font-size:18px!important}.if-subtle{color:#7f95ae;font-size:11px}
.if-compact-details{border:1px solid var(--if-line);background:var(--if-panel);border-radius:10px;margin:10px 0;padding:0}.if-compact-details summary{cursor:pointer;list-style:none;padding:10px 12px;font-size:11px;font-weight:800;color:#9db2c9}.if-compact-details summary::-webkit-details-marker{display:none}.if-compact-details>div{padding:0 12px 12px;color:#8fa1b7;font-size:11px;line-height:1.5}

#ifExplorePager{display:flex;gap:6px;align-items:center;justify-content:flex-end;margin:10px 0;flex-wrap:wrap}.if-page-btn{min-width:30px;padding:6px 8px!important;background:var(--if-panel2)!important;border:1px solid var(--if-line)!important;color:#b8c9dc!important}.if-page-btn.active{background:var(--if-cyan)!important;color:#03251f!important;border-color:var(--if-cyan)!important}.if-page-info{font-size:10px;color:#7890aa;margin-left:5px}

#ifStatPanel{margin-top:12px;border:1px solid var(--if-line);background:#0f1620;border-radius:11px;padding:12px}.if-stat-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px}.if-stat-title{font-size:13px;font-weight:900}.if-stat-confidence{font-size:9px;border:1px solid #35506b;border-radius:99px;padding:5px 8px;color:#9ac6ed}.if-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.if-stat{background:#171f2b;border:1px solid #253448;border-radius:9px;padding:9px}.if-stat span{display:block;color:#7f95ae;font-size:9px;margin-bottom:4px}.if-stat strong{font-size:15px}.if-stat-note{margin-top:9px;color:#8195ac;font-size:10px;line-height:1.45}.if-window{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}.if-window-day{border:1px solid #2c4056;background:#151f2c;border-radius:8px;padding:6px 8px;font-size:9px;color:#9eb4cb}.if-window-day.hot{border-color:#9b6b28;color:#ffd87d;background:rgba(246,189,72,.08)}

body.if-v54 .asset-grid{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))!important;gap:9px!important}
body.if-v54 .asset-card{padding:11px!important}
body.if-v54 .asset-stats{gap:6px!important}.asset-stat{padding:7px!important;font-size:11px!important}
body.if-v54 .grid{gap:10px!important}.grid2,.grid3,.grid4{gap:10px!important}
body.if-v54 .section-head{margin-bottom:9px!important}.section-head h2{font-size:18px!important}
body.if-v54 .top500-toolbar{gap:7px!important}.top500-toolbar>*{min-width:0}
body.if-v54 .v47-card-grid{display:none!important}
body.if-v54 .v47-alert-note{display:none!important}
body.if-v54 #tab-trading .v47-hero p.muted{max-width:720px}
body.if-v54 #tab-trading .v47-grid{grid-template-columns:repeat(4,minmax(120px,1fr))!important}
body.if-v54 #tab-settings .card,body.if-v54 #tab-academy .card{padding:13px!important}

@media(max-width:980px){.if-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.if-top-chip.if-hide-medium{display:none}}
@media(max-width:820px){
  body.if-v54 .app,body.if-v54.if-sidebar-collapsed .app{margin-left:0!important;padding:10px 10px 30px!important}
  #ifPremiumSidebar{transform:translateX(-101%);width:min(265px,84vw)!important;box-shadow:18px 0 50px rgba(0,0,0,.42)}body.if-v54.if-sidebar-open #ifPremiumSidebar{transform:translateX(0)}
  .if-mobile-menu{display:flex!important;width:31px;height:31px;align-items:center;justify-content:center;padding:0!important;background:var(--if-panel2)!important;border:1px solid var(--if-line)!important;color:white!important}.if-top-status span:last-child{display:none}.if-top-chip.if-hide-mobile{display:none}.if-top-action{padding:7px 9px!important}
  #ifPremiumTopbar{top:5px;margin-bottom:10px}.if-stat-grid{grid-template-columns:1fr 1fr}
}
@media(max-width:560px){.if-stat-grid{grid-template-columns:1fr}.if-top-chip{display:none!important}.if-top-spacer{display:none}.if-top-action{margin-left:auto}.asset-grid{grid-template-columns:1fr!important}}
`;
    document.head.appendChild(style);
  }

  const navPrimary=[
    ['dashboard','⌂','Inicio'],['top500','▥','Clasificación Top 500'],['portfolio','▣','Mi Portafolio'],
    ['explore','⌕','Explorar'],['externalRadar','⌁','Radar Probabilidad'],['trading','↗','Trading'],['marketHistory','◷','Historial']
  ];
  const navTools=[
    ['compare','⇄','Comparar'],['backtest','⟲','¿Qué habría pasado?'],['goals','◎','Metas'],
    ['builder','▤','Constructor'],['academy','◇','Academia'],['settings','⚙','Datos & Origen']
  ];

  function navHTML(rows){return rows.map(([tab,icon,label])=>`<button type="button" class="if-nav-btn" data-if-tab="${tab}" title="${label}"><span class="if-nav-icon">${icon}</span><span class="if-nav-label">${label}</span></button>`).join('')}

  function markLegacyMetrics(){
    const right=$('v30DesktopRight');
    if(right)right.querySelectorAll('.grid.grid4').forEach(x=>x.classList.add('if-legacy-top-metrics'));
    document.querySelectorAll('.app > section.grid.grid4').forEach(x=>{if(!x.id)x.classList.add('if-legacy-top-metrics')});
  }

  function mountShell(){
    if($('ifPremiumSidebar'))return;
    document.body.classList.add('if-v54');
    markLegacyMetrics();
    const saved=localStorage.getItem(SIDEBAR_KEY);
    if(saved==='collapsed')document.body.classList.add('if-sidebar-collapsed');

    const aside=document.createElement('aside');
    aside.id='ifPremiumSidebar';
    aside.innerHTML=`
      <div class="if-brand">
        <div class="if-brand-row"><div class="if-logo">IF</div><div class="if-brand-copy"><strong>Inversor Fácil V54</strong><small>Premium UI · ágil y sin saturación</small></div><button id="ifSidebarToggle" type="button" aria-label="Ocultar o mostrar panel">‹</button></div>
        <div class="if-mode-pill">PAPER TRADING</div>
      </div>
      <div class="if-nav-scroll">
        <div class="if-nav-group"><div class="if-nav-title">Principal</div>${navHTML(navPrimary)}</div>
        <div class="if-nav-group"><div class="if-nav-title">Herramientas</div>${navHTML(navTools)}</div>
      </div>
      <div class="if-sidebar-footer">
        <div class="if-credit-card"><div class="if-credit-head"><span>Créditos Twelve</span><strong id="ifCreditPct">0%</strong></div><div class="if-credit-track"><div id="ifCreditFill" class="if-credit-fill"></div></div><div id="ifCreditMeta" class="if-credit-meta">Esperando lectura…</div></div>
        <button id="ifOptimizeData" type="button">⚡ Optimizar Datos</button><div class="if-footnote">V54 usa caché, páginas reales y sincronización ordenada. Los cálculos probabilísticos reutilizan históricos guardados.</div>
      </div>`;
    document.body.insertBefore(aside,document.body.firstChild);

    const app=document.querySelector('.app');
    if(app){
      const top=document.createElement('div');
      top.id='ifPremiumTopbar';
      top.innerHTML=`<button class="if-mobile-menu" id="ifMobileMenu" type="button">☰</button><div class="if-top-status"><span class="if-status-dot" id="ifStatusDot"></span><span id="ifSyncText">Sincronizado</span></div><span class="if-top-chip" id="ifDataChip">Datos v${dataVersion}</span><span class="if-top-spacer"></span><span class="if-top-chip if-hide-medium" id="ifFxChip">USD/MXN —</span><span class="if-top-chip good if-hide-mobile" id="ifCapitalChip">Capital —</span><button class="if-top-action" id="ifRefreshNow" type="button">↻ Actualizar</button>`;
      const anchor=[...app.children].find(x=>!['v30DesktopLeft','v30DesktopRight','v24UserBar'].includes(x.id));
      app.insertBefore(top,anchor||app.firstChild);
    }

    $('ifSidebarToggle')?.addEventListener('click',()=>{
      const collapsed=document.body.classList.toggle('if-sidebar-collapsed');
      localStorage.setItem(SIDEBAR_KEY,collapsed?'collapsed':'open');
      $('ifSidebarToggle').textContent=collapsed?'›':'‹';
    });
    $('ifMobileMenu')?.addEventListener('click',()=>document.body.classList.toggle('if-sidebar-open'));
    document.addEventListener('click',e=>{if(innerWidth<=820&&document.body.classList.contains('if-sidebar-open')&&!e.target.closest('#ifPremiumSidebar')&&!e.target.closest('#ifMobileMenu'))document.body.classList.remove('if-sidebar-open')});
    aside.querySelectorAll('[data-if-tab]').forEach(b=>b.addEventListener('click',()=>{
      if(typeof window.showTab==='function')window.showTab(b.dataset.ifTab);
      setActiveNav(b.dataset.ifTab);
      if(innerWidth<=820)document.body.classList.remove('if-sidebar-open');
    }));
    $('ifOptimizeData')?.addEventListener('click',()=>{enqueue('catalog',100,true);enqueue('top500',80,true);runOne();paint('Optimizando datos','busy','Actualizando sólo lo necesario…')});
    $('ifRefreshNow')?.addEventListener('click',()=>{const tab=currentTab();enqueue('catalog',110,true);if(tab==='top500')enqueue('top500',105,true);if(tab==='trading')enqueue('trading',105,true);runOne()});
    setActiveNav(currentTab());
    updateTopbar();
    setTimeout(compactLongBlocks,500);
  }

  function setActiveNav(tab){document.querySelectorAll('[data-if-tab]').forEach(b=>b.classList.toggle('active',b.dataset.ifTab===tab))}
  function currentTab(){for(const id of [...navPrimary,...navTools].map(x=>x[0])){const el=$('tab-'+id);if(el&&!el.classList.contains('hidden'))return id}return 'dashboard'}

  function updateTopbar(){
    const fx=Number($('fx')?.value);
    if($('ifFxChip'))$('ifFxChip').textContent=Number.isFinite(fx)&&fx>0?`USD/MXN · $${fx.toFixed(4)}`:'USD/MXN · —';
    try{const capital=Number($('capital')?.value)||0;const t=typeof totals==='function'?totals():null;if(t&&$('ifCapitalChip')){const ret=t.invested?((t.current-t.invested)/t.invested)*100:0;$('ifCapitalChip').textContent=`Capital ${fmtMoney(capital)} · ${ret>=0?'+':''}${ret.toFixed(2)}%`}}catch{}
    if($('ifDataChip'))$('ifDataChip').textContent=`Datos v${dataVersion}`;updateCredits();
  }
  function fmtMoney(v){try{return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(v)||0)}catch{return '$'+Math.round(Number(v)||0).toLocaleString('es-MX')}}
  function updateCredits(){let used=null,limit=800;for(const id of ['v41DailyUsed','v42DailyUsed','dailyCreditsUsed']){const el=$(id);const n=Number(String(el?.textContent||'').replace(/[^0-9.]/g,''));if(Number.isFinite(n)){used=n;break}}if(used===null){const d=safeJson('inversorFacilV41Usage',null);if(d&&Number.isFinite(Number(d.used)))used=Number(d.used)}used=Number.isFinite(used)?used:0;const pct=clamp(used/limit*100,0,100);if($('ifCreditPct'))$('ifCreditPct').textContent=pct.toFixed(0)+'%';if($('ifCreditFill'))$('ifCreditFill').style.width=pct+'%';if($('ifCreditMeta'))$('ifCreditMeta').textContent=`${Math.round(used)} / ${limit} hoy · cola inteligente`}

  function compactLongBlocks(){const note=document.querySelector('.top500-note');if(note&&!note.dataset.v54){note.dataset.v54='1';const details=document.createElement('details');details.className='if-compact-details';details.innerHTML=`<summary>ℹ Cómo funciona esta clasificación</summary><div>${note.innerHTML}</div>`;note.replaceWith(details)}document.querySelectorAll('#tab-trading .v47-card-grid,#tab-trading .v47-alert-note').forEach(el=>el.setAttribute('aria-hidden','true'))}

  function installExplorePager(){
    if(typeof window.filteredAssets!=='function'||typeof window.renderExplore!=='function'||window.renderExplore.__v54)return;
    const nativeFiltered=window.filteredAssets,nativeRender=window.renderExplore;
    function pagedRender(){const all=nativeFiltered();const pages=Math.max(1,Math.ceil(all.length/EXPLORE_PAGE));explorePage=clamp(explorePage,1,pages);const start=(explorePage-1)*EXPLORE_PAGE;const previous=window.filteredAssets;window.filteredAssets=()=>all.slice(start,start+EXPLORE_PAGE);try{nativeRender()}finally{window.filteredAssets=previous}const count=$('resultCount');if(count)count.textContent=`${all.length} resultados · ${start+1}-${Math.min(start+EXPLORE_PAGE,all.length)}`;mountExplorePager(all.length,pages)}
    pagedRender.__v54=true;window.renderExplore=pagedRender;
    ['search','typeFilter','countryFilter','sectorFilter','riskFilter','marketSort'].forEach(id=>{const old=$(id);if(!old||old.dataset.v54Rebound)return;const clone=old.cloneNode(true);clone.value=old.value;clone.dataset.v54Rebound='1';old.replaceWith(clone);clone.addEventListener(id==='search'?'input':'change',()=>{explorePage=1;pagedRender()});if(id!=='search')clone.addEventListener('input',()=>{explorePage=1;pagedRender()})});
    setTimeout(()=>{if(currentTab()==='explore')pagedRender()},100);
  }
  function mountExplorePager(total,pages){const grid=$('assetGrid');if(!grid)return;let host=$('ifExplorePager');if(total<=EXPLORE_PAGE){host?.remove();return}if(!host){host=document.createElement('div');host.id='ifExplorePager';grid.insertAdjacentElement('afterend',host)}const lo=Math.max(1,explorePage-2),hi=Math.min(pages,lo+4);let html=`<button class="if-page-btn" data-p="prev">‹</button>`;for(let p=lo;p<=hi;p++)html+=`<button class="if-page-btn ${p===explorePage?'active':''}" data-p="${p}">${p}</button>`;html+=`<button class="if-page-btn" data-p="next">›</button><span class="if-page-info">${total} activos · ${EXPLORE_PAGE} por página</span>`;host.innerHTML=html;host.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{explorePage=b.dataset.p==='prev'?Math.max(1,explorePage-1):b.dataset.p==='next'?Math.min(pages,explorePage+1):Number(b.dataset.p);window.renderExplore();grid.scrollIntoView({behavior:'smooth',block:'start'})}))}

  function seriesFor(symbol){const map=new Map();try{if(typeof marketHistoryLoad==='function'){const h=marketHistoryLoad();(h?.records?.[symbol]||[]).forEach(r=>{const day=String(r.day||'').slice(0,10),close=Number(r.price);if(day&&close>0)map.set(day,{day,close})})}}catch{}try{if(typeof radarLoad==='function'){const r=radarLoad();(r?.histories?.[symbol]||[]).forEach(x=>{const day=String(x.day||x.datetime||'').slice(0,10),close=Number(x.close||x.price);if(day&&close>0)map.set(day,{day,close})})}}catch{}return [...map.values()].sort((a,b)=>a.day.localeCompare(b.day))}
  function mean(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
  function sd(a){if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)**2,0)/(a.length-1))}
  function percentile(a,p){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);const i=(s.length-1)*p,l=Math.floor(i),u=Math.ceil(i);return l===u?s[l]:s[l]+(s[u]-s[l])*(i-l)}
  function businessDays(n){const out=[];const d=new Date();while(out.length<n){d.setDate(d.getDate()+1);const day=d.getDay();if(day!==0&&day!==6)out.push(new Date(d))}return out}
  function fmtDay(d){return d.toLocaleDateString('es-MX',{day:'2-digit',month:'short'}).replace('.','')}

  function analyzePattern(symbol){
    const rows=seriesFor(symbol);if(rows.length<45)return {ok:false,n:rows.length};
    const returns=[];for(let i=1;i<rows.length;i++)returns.push((rows[i].close/rows[i-1].close-1)*100);
    const last=rows.length-1,d1=(rows[last].close/rows[last-1].close-1)*100,m5=last>=5?(rows[last].close/rows[last-5].close-1)*100:0,curVol=sd(returns.slice(-20)),threshold=percentile(returns.map(Math.abs),.95)||Math.max(1,curVol*2),candidates=[];
    for(let i=25;i<rows.length-6;i++){const r1=(rows[i].close/rows[i-1].close-1)*100,rm5=(rows[i].close/rows[i-5].close-1)*100,histRet=[];for(let j=i-19;j<=i;j++)if(j>0)histRet.push((rows[j].close/rows[j-1].close-1)*100);const v=sd(histRet),dist=Math.abs(r1-d1)/Math.max(curVol,1)+Math.abs(rm5-m5)/Math.max(curVol*2,2)+Math.abs(v-curVol)/Math.max(curVol,.8),f1=(rows[i+1].close/rows[i].close-1)*100,f5=(rows[i+5].close/rows[i].close-1)*100,next=[];for(let k=1;k<=5;k++)next.push((rows[i+k].close/rows[i+k-1].close-1)*100);let firstStrong=null,strongDir=0;next.forEach((x,idx)=>{if(firstStrong===null&&Math.abs(x)>=threshold){firstStrong=idx+1;strongDir=x>0?1:-1}});candidates.push({dist,f1,f5,next,firstStrong,strongDir})}
    candidates.sort((a,b)=>a.dist-b.dist);let sample=candidates.filter(x=>x.dist<=2.8).slice(0,120);if(sample.length<25)sample=candidates.slice(0,Math.min(80,candidates.length));if(sample.length<18)return {ok:false,n:sample.length};
    const p1=sample.filter(x=>x.f1>0).length/sample.length,p5=sample.filter(x=>x.f5>0).length/sample.length,avg1=mean(sample.map(x=>x.f1)),avg5=mean(sample.map(x=>x.f5)),base=candidates.filter(x=>x.f1>0).length/Math.max(1,candidates.length),strongUp=sample.filter(x=>x.strongDir===1).length/sample.length,strongDown=sample.filter(x=>x.strongDir===-1).length/sample.length,hazard=[1,2,3,4,5].map(k=>sample.filter(x=>x.firstStrong===k).length/sample.length),peak=Math.max(...hazard),peakDay=hazard.indexOf(peak)+1,confidence=sample.length>=70?'Alta':sample.length>=40?'Media-alta':sample.length>=25?'Media':'Baja';
    return {ok:true,n:sample.length,p1,p5,avg1,avg5,base,edge:p1-base,strongUp,strongDown,threshold,peak,peakDay,curVol,d1,m5,confidence,hazard};
  }
  function statHTML(symbol){const s=analyzePattern(symbol);if(!s.ok)return `<div id="ifStatPanel"><div class="if-stat-head"><div><div class="if-stat-title">Patrón de probabilidad</div><div class="if-subtle">Aún faltan históricos comparables</div></div><span class="if-stat-confidence">${s.n||0} observaciones</span></div><div class="if-stat-note">Cuando existan al menos ~45 cierres utilizables, este panel calculará probabilidades sin consumir consultas nuevas.</div></div>`;const days=businessDays(5),win=days.map((d,i)=>`<span class="if-window-day ${i+1===s.peakDay?'hot':''}">${fmtDay(d)}${i+1===s.peakDay?` · ${(s.peak*100).toFixed(0)}% fuerte`:''}</span>`).join('');return `<div id="ifStatPanel"><div class="if-stat-head"><div><div class="if-stat-title">Patrón de probabilidad · ${symbol}</div><div class="if-subtle">Estado actual comparado con movimientos históricos similares</div></div><span class="if-stat-confidence">Confianza ${s.confidence} · N=${s.n}</span></div><div class="if-stat-grid"><div class="if-stat"><span>Próxima sesión</span><strong class="${s.p1>=.5?'positive':'negative'}">${(s.p1*100).toFixed(1)}% ↑</strong></div><div class="if-stat"><span>Próximas 5 sesiones</span><strong class="${s.p5>=.5?'positive':'negative'}">${(s.p5*100).toFixed(1)}% ↑</strong></div><div class="if-stat"><span>Retorno medio 5D</span><strong class="${s.avg5>=0?'positive':'negative'}">${s.avg5>=0?'+':''}${s.avg5.toFixed(2)}%</strong></div><div class="if-stat"><span>Edge vs base</span><strong>${s.edge>=0?'+':''}${(s.edge*100).toFixed(1)} pp</strong></div><div class="if-stat"><span>Umbral movimiento fuerte</span><strong>±${s.threshold.toFixed(2)}%</strong></div><div class="if-stat"><span>Alza fuerte ≤5D</span><strong class="positive">${(s.strongUp*100).toFixed(1)}%</strong></div><div class="if-stat"><span>Baja fuerte ≤5D</span><strong class="negative">${(s.strongDown*100).toFixed(1)}%</strong></div><div class="if-stat"><span>Volatilidad reciente</span><strong>${s.curVol.toFixed(2)}%</strong></div></div><div class="if-window">${win}</div><div class="if-stat-note">La fecha resaltada es la sesión donde los casos similares concentraron más movimientos ≥ ±${s.threshold.toFixed(2)}%. Es una ventana estadística, no una predicción determinista.</div></div>`}
  function installAssetStats(){if(typeof window.openAssetDetail==='function'&&!window.openAssetDetail.__v54){const native=window.openAssetDetail;function wrapped(symbol){const out=native.apply(this,arguments);setTimeout(()=>{const c=$('assetDetailContent');if(c){$('ifStatPanel')?.remove();c.insertAdjacentHTML('beforeend',statHTML(symbol))}},0);return out}wrapped.__v54=true;window.openAssetDetail=wrapped}}

  function paint(title,state='ok',meta=''){const text=$('ifSyncText'),dot=$('ifStatusDot');if(text)text.textContent=title+(meta?` · ${meta}`:'');if(dot)dot.style.background=state==='error'?'var(--if-red)':state==='warn'?'var(--if-amber)':state==='busy'?'var(--if-blue)':'var(--if-green)';updateTopbar()}
  function hasSession(){if(typeof v24Supabase==='undefined'||!v24Supabase?.auth)return Promise.resolve(false);return v24Supabase.auth.getSession().then(({data})=>!!data?.session?.access_token).catch(()=>false)}
  function heavyManual(){try{if(typeof top500QueueState!=='undefined'&&top500QueueState?.running)return true}catch{}try{if(typeof radarQueueState!=='undefined'&&radarQueueState?.running)return true}catch{}try{if(window.v47Trading?.state?.running)return true}catch{}return now()<manualPriorityUntil}
  function register(name,o){tasks.set(name,{name,...o,nextAt:now()+o.initialDelay,lastAt:0,lastMs:0,lastOk:null})}
  function enqueue(name,priorityOverride=null,force=false){const t=tasks.get(name);if(!t||queue.some(x=>x.name===name)||running?.name===name)return false;queue.push({name,priority:priorityOverride??t.priority,force,queuedAt:now()});queue.sort((a,b)=>b.priority-a.priority||a.queuedAt-b.queuedAt);return true}
  window.v51RequestSync=window.v54RequestSync=(name,opts={})=>enqueue(name,Number.isFinite(Number(opts.priority))?Number(opts.priority):100,!!opts.force);
  function markData(name){dataVersion++;localStorage.setItem(DATA_VERSION_KEY,String(dataVersion));saveJson(STATE_KEY,{version:VERSION,lastTask:name,lastSuccess:new Date().toISOString(),dataVersion});document.dispatchEvent(new CustomEvent('inversor:data-updated',{detail:{task:name,version:dataVersion}}));scheduleVisibleRender();updateTopbar()}
  function scheduleVisibleRender(){if(renderScheduled)return;renderScheduled=true;requestAnimationFrame(()=>{renderScheduled=false;const tab=currentTab();try{if(tab==='explore'&&typeof window.renderExplore==='function')window.renderExplore();else if(tab==='marketHistory'&&typeof renderMarketHistory==='function')renderMarketHistory();else if(tab==='externalRadar'&&typeof renderExternalRadar==='function')renderExternalRadar();else if(tab==='top500'&&typeof renderTop500==='function')renderTop500();else if(tab==='trading'&&window.v47Trading?.render)window.v47Trading.render();else if(tab==='compare'&&typeof renderCompare==='function')renderCompare();else if(tab==='backtest'&&typeof renderBacktest==='function')renderBacktest();else if(tab==='goals'&&typeof calculateGoal==='function')calculateGoal();else if(tab==='builder'&&typeof renderBuilder==='function')renderBuilder();else if(tab==='academy'&&typeof renderAcademy==='function')renderAcademy();else if(tab==='dashboard'&&typeof render==='function')render()}catch(e){console.warn('V54 render',tab,e)}compactLongBlocks();updateTopbar()})}
  async function runOne(){if(running||!queue.length||document.hidden||!navigator.onLine||heavyManual())return;const job=queue.shift(),task=tasks.get(job.name);if(!task)return;if(task.visibleOnly&&currentTab()!==task.visibleOnly){task.nextAt=now()+task.interval;return}if(!(await hasSession())){task.nextAt=now()+15000;return}running=task;const start=performance.now();paint(task.label,'busy','procesando');try{const ok=await task.run(job.force),ms=Math.round(performance.now()-start);task.lastAt=now();task.lastMs=ms;task.lastOk=ok!==false;task.nextAt=now()+task.interval;if(ok!==false)markData(task.name);const perf=safeJson(PERF_KEY,[]);perf.push({at:new Date().toISOString(),task:task.name,ms,ok:ok!==false});saveJson(PERF_KEY,perf.slice(-30));paint(ok===false?'Pendiente':'Sincronizado',ok===false?'warn':'ok',`${ms} ms`)}catch(e){task.lastOk=false;task.nextAt=now()+30000;paint('Error de sincronización','error',String(e?.message||e).slice(0,70))}finally{running=null;setTimeout(runOne,50)}}
  function registerTasks(){register('catalog',{label:'Catálogo',interval:120000,priority:40,initialDelay:3000,run:async()=>{if(typeof v27LoadSharedCatalog!=='function')return false;await v27LoadSharedCatalog();return true}});register('top500',{label:'Top 500',interval:300000,priority:30,initialDelay:12000,run:async force=>{const fn=window.v50LoadTop500Shared||window.v51LoadSharedTop500;if(typeof fn!=='function')return false;return await fn(!!force)}});register('trading',{label:'Trading',interval:300000,priority:20,initialDelay:25000,visibleOnly:'trading',run:async()=>{if(!window.v47Trading?.scan)return false;await window.v47Trading.scan();return true}})}
  function tick(){if(document.hidden||!navigator.onLine)return;const t=now();for(const task of tasks.values())if(t>=task.nextAt)enqueue(task.name);runOne()}
  function hookShowTab(){if(typeof window.showTab!=='function'||window.showTab.__v54)return;const native=window.showTab;function wrapped(name){const out=native.apply(this,arguments);setActiveNav(name);setTimeout(()=>{if(name==='explore')window.renderExplore?.();if(name==='top500')enqueue('top500',90,true);if(name==='trading')enqueue('trading',90,true);compactLongBlocks();updateTopbar();runOne()},30);return out}wrapped.__v54=true;window.showTab=wrapped}
  function installManualPriority(){document.addEventListener('click',e=>{const t=e.target.closest?.('#top500Analyze,#scanExternalRadar,#catalogQueueStart,#v47Scan,#updatePrices,#updateAllHoldings,[data-online-validate]');if(t){manualPriorityUntil=now()+90000;paint('Consulta prioritaria','busy','esperando resultado')}} ,true)}
  function start(){if(started)return;started=true;injectCSS();mountShell();installExplorePager();installAssetStats();hookShowTab();installManualPriority();registerTasks();const fx=$('fx'),capital=$('capital');fx?.addEventListener('input',updateTopbar);capital?.addEventListener('input',updateTopbar);document.addEventListener('inversor:data-updated',updateTopbar);document.addEventListener('visibilitychange',()=>{if(!document.hidden){enqueue('catalog',70);runOne()}});window.addEventListener('online',()=>{paint('Conexión recuperada','ok','reanudando');enqueue('catalog',80);runOne()},{passive:true});window.addEventListener('offline',()=>paint('Sin conexión','warn','datos guardados'),{passive:true});setInterval(tick,7000);setInterval(updateTopbar,30000);setTimeout(tick,1200);setTimeout(()=>{installAssetStats();installExplorePager();compactLongBlocks();updateTopbar()},3500);paint('Sincronizado','ok','V54 listo')}
  window.v54PerformanceReport=()=>({version:VERSION,dataVersion,currentTab:currentTab(),running:running?.name||null,queue:queue.map(x=>x.name),tasks:[...tasks.values()].map(t=>({name:t.name,lastMs:t.lastMs,lastOk:t.lastOk,nextAt:t.nextAt})),recent:safeJson(PERF_KEY,[])});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,900));else setTimeout(start,300);
})();
