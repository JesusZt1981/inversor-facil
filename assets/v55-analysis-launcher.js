/* Inversor Fácil V56 · Análisis 360° + Radar semanal */
(function(){
  'use strict';
  const ANALYSIS_URL='analisis.html?symbol=';
  let scheduled=false;

  function cleanSymbol(value){return String(value||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'')}
  function openAnalysis(symbol){const s=cleanSymbol(symbol);if(!s)return;window.open(`${ANALYSIS_URL}${encodeURIComponent(s)}`,'_blank','noopener')}
  window.ifOpenAnalysis360=openAnalysis;

  function button(symbol,extra=''){
    const b=document.createElement('button');b.type='button';b.className=`secondary small if-v55-analyze ${extra}`.trim();b.dataset.symbol=cleanSymbol(symbol);b.textContent='Análisis 360°';b.title='Abrir análisis completo en una pestaña nueva';return b;
  }

  function decorateExplore(){document.querySelectorAll('.detailAsset[data-symbol]').forEach(b=>{b.textContent='Análisis 360°';b.title='Abrir análisis completo en una pestaña nueva';b.classList.add('if-v55-detail')})}
  function decoratePortfolio(){document.querySelectorAll('[data-chart-symbol].investment-card,[data-chart-symbol].portfolio-visual').forEach(card=>{const s=cleanSymbol(card.dataset.chartSymbol);const actions=card.querySelector('.actions');if(!s||!actions||actions.querySelector('.if-v55-analyze'))return;actions.insertBefore(button(s,'if-v55-portfolio'),actions.firstChild)})}

  function disableLegacyRankings(){
    const styleId='ifV56WeeklyOnly';
    if(!document.getElementById(styleId)){
      const s=document.createElement('style');s.id=styleId;s.textContent='#tab-top500,#tab-externalRadar{display:none!important}';document.head.appendChild(s);
    }
    document.querySelectorAll('.if-nav-btn[data-if-tab="top500"],.if-nav-btn[data-if-tab="externalRadar"]').forEach(x=>x.style.display='none');
    try{window.v50LoadTop500Shared=async()=>false;window.v51LoadSharedTop500=async()=>false}catch{}
  }

  function mountWeeklyNav(){
    const nav=document.querySelector('#ifPremiumSidebar .if-nav-scroll');if(!nav)return;
    disableLegacyRankings();
    if(document.getElementById('ifWeeklyRadarNav'))return;
    const dashboard=nav.querySelector('.if-nav-btn[data-if-tab="dashboard"]');
    const b=document.createElement('button');b.type='button';b.id='ifWeeklyRadarNav';b.className='if-nav-btn';b.title='Top 20 semanal';
    b.innerHTML='<span class="if-nav-icon">▥</span><span class="if-nav-label">Radar semanal</span>';
    b.onclick=()=>{location.href='weekly.html'};
    dashboard?.insertAdjacentElement('afterend',b);
  }

  function replaceDailyWords(){
    const replacements=[[/Resumen diario/gi,'Resumen semanal'],[/resumen diario/gi,'resumen semanal'],[/Top 20 del día/gi,'Top 20 semanal'],[/Top 20 diario/gi,'Top 20 semanal']];
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(n=>{let t=n.nodeValue;for(const [a,b] of replacements)t=t.replace(a,b);if(t!==n.nodeValue)n.nodeValue=t});
  }

  function decorate(){scheduled=false;decorateExplore();decoratePortfolio();mountWeeklyNav();replaceDailyWords()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(decorate)}

  document.addEventListener('click',e=>{const target=e.target.closest?.('.detailAsset[data-symbol],.if-v55-analyze[data-symbol]');if(!target)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openAnalysis(target.dataset.symbol)},true);

  const obs=new MutationObserver(schedule);
  function start(){
    ['assetGrid','portfolioVisualCards','dashEtfList','dashStockList','ifPremiumSidebar'].forEach(id=>{const el=document.getElementById(id);if(el)obs.observe(el,{childList:true,subtree:true})});
    disableLegacyRankings();decorate();setTimeout(decorate,900);setTimeout(decorate,2200);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,500));else setTimeout(start,200);
})();
