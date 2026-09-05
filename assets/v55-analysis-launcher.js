/* Inversor Fácil V55 · abre análisis 360° en una pestaña nueva */
(function(){
  'use strict';
  const ANALYSIS_URL='analisis.html?symbol=';
  let scheduled=false;

  function cleanSymbol(value){return String(value||'').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g,'')}
  function openAnalysis(symbol){
    const s=cleanSymbol(symbol);if(!s)return;
    window.open(`${ANALYSIS_URL}${encodeURIComponent(s)}`,'_blank','noopener');
  }
  window.ifOpenAnalysis360=openAnalysis;

  function button(symbol,extra=''){
    const b=document.createElement('button');
    b.type='button';b.className=`secondary small if-v55-analyze ${extra}`.trim();b.dataset.symbol=cleanSymbol(symbol);b.textContent='Análisis 360°';b.title='Abrir análisis completo en una pestaña nueva';
    return b;
  }

  function decorateExplore(){
    document.querySelectorAll('.detailAsset[data-symbol]').forEach(b=>{
      b.textContent='Análisis 360°';b.title='Abrir análisis completo en una pestaña nueva';b.classList.add('if-v55-detail');
    });
  }

  function decorateTop500(){
    document.querySelectorAll('.top500Add[data-symbol]').forEach(add=>{
      const cell=add.closest('td')||add.parentElement;if(!cell)return;
      const s=cleanSymbol(add.dataset.symbol);if(!s||cell.querySelector(`.if-v55-analyze[data-symbol="${CSS.escape(s)}"]`))return;
      const b=button(s,'if-v55-top500');b.style.marginRight='5px';cell.insertBefore(b,add);
    });
  }

  function decorateRadar(){
    document.querySelectorAll('.radar-card').forEach(card=>{
      const actions=card.querySelector('.radar-actions');if(!actions||actions.querySelector('.if-v55-analyze'))return;
      const s=cleanSymbol(card.dataset.chartSymbol||card.querySelector('[data-symbol]')?.dataset.symbol||card.querySelector('.asset-meta')?.textContent?.split('·')?.[0]);
      if(!s)return;actions.insertBefore(button(s,'if-v55-radar'),actions.firstChild);
    });
  }

  function decoratePortfolio(){
    document.querySelectorAll('[data-chart-symbol].investment-card,[data-chart-symbol].portfolio-visual').forEach(card=>{
      const s=cleanSymbol(card.dataset.chartSymbol);const actions=card.querySelector('.actions');if(!s||!actions||actions.querySelector('.if-v55-analyze'))return;
      actions.insertBefore(button(s,'if-v55-portfolio'),actions.firstChild);
    });
  }

  function decorate(){scheduled=false;decorateExplore();decorateTop500();decorateRadar();decoratePortfolio()}
  function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(decorate)}

  document.addEventListener('click',e=>{
    const target=e.target.closest?.('.detailAsset[data-symbol],.if-v55-analyze[data-symbol]');
    if(!target)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openAnalysis(target.dataset.symbol);
  },true);

  const obs=new MutationObserver(schedule);
  function start(){
    ['assetGrid','top500Rows','radarResults','portfolioVisualCards','dashEtfList','dashStockList'].forEach(id=>{const el=document.getElementById(id);if(el)obs.observe(el,{childList:true,subtree:true})});
    decorate();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,800));else setTimeout(start,250);
})();
