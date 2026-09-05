/* Inversor Fácil V55 · panel financiero SEC/EDGAR */
(function(){
  'use strict';
  const symbol=(new URLSearchParams(location.search).get('symbol')||'').trim().toUpperCase();
  const API='https://inversor-facil-mailer.onrender.com';
  const finite=v=>Number.isFinite(Number(v));
  const money=v=>finite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:Math.abs(Number(v))>=1e6?'compact':'standard',maximumFractionDigits:2}).format(Number(v)):'—';
  const pct=v=>finite(v)?`${Number(v)>=0?'+':''}${Number(v).toFixed(1)}%`:'—';
  const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

  function install(){
    const tabs=document.querySelector('.tabs');if(!tabs||document.querySelector('[data-tab="financials"]'))return;
    const priceTab=tabs.querySelector('[data-tab="price"]');
    const btn=document.createElement('button');btn.type='button';btn.className='tab';btn.dataset.tab='financials';btn.textContent='Finanzas';tabs.insertBefore(btn,priceTab||null);
    const panel=document.createElement('section');panel.className='tab-panel';panel.dataset.panel='financials';panel.innerHTML=`
      <div class="section-grid">
        <article class="panel span-12">
          <div class="section-title"><div><div class="kicker">SEC / EDGAR</div><h2>Fundamentales financieros</h2></div><p id="finDate">Consultando…</p></div>
          <div class="stats-grid">
            <div class="stat"><span>Ingresos recientes</span><strong id="finRevenue">—</strong><small id="finRevenueGrowth">—</small></div>
            <div class="stat"><span>Utilidad neta</span><strong id="finNetIncome">—</strong><small>último año disponible</small></div>
            <div class="stat"><span>Margen operativo</span><strong id="finMargin">—</strong><small>último año disponible</small></div>
            <div class="stat"><span>Flujo libre</span><strong id="finFcf">—</strong><small>CFO menos capex</small></div>
            <div class="stat"><span>Activos</span><strong id="finAssets">—</strong><small id="finBalanceDate">—</small></div>
            <div class="stat"><span>Pasivos</span><strong id="finLiabilities">—</strong><small>balance más reciente</small></div>
            <div class="stat"><span>Deuda identificada</span><strong id="finDebt">—</strong><small id="finDebtRatio">—</small></div>
            <div class="stat"><span>Efectivo</span><strong id="finCash">—</strong><small>balance más reciente</small></div>
          </div>
        </article>
        <article class="panel span-8">
          <div class="section-title"><div><div class="kicker">Evolución</div><h2>Últimos ejercicios disponibles</h2></div></div>
          <div class="table-wrap"><table class="data-table"><thead><tr><th>Ejercicio</th><th>Ingresos</th><th>Utilidad neta</th><th>Margen op.</th><th>Flujo operativo</th><th>Flujo libre</th><th>EPS</th></tr></thead><tbody id="finRows"><tr><td colspan="7">Cargando…</td></tr></tbody></table></div>
        </article>
        <article class="panel span-4">
          <div class="section-title"><div><div class="kicker">Lectura financiera</div><h2>Señales</h2></div></div>
          <div class="signal-list" id="finSignals"><div class="empty">Calculando…</div></div>
        </article>
        <article class="panel span-12"><div class="notice">Los datos financieros provienen de SEC EDGAR Company Facts para emisores estadounidenses. Pueden existir diferencias de clasificación entre empresas; Inversor Fácil muestra el concepto reportado disponible y no rellena cifras faltantes.</div></article>
      </div>`;
    const ref=document.querySelector('[data-panel="price"]');ref?.parentNode?.insertBefore(panel,ref);
    btn.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));document.querySelectorAll('.tab-panel').forEach(x=>x.classList.toggle('active',x===panel))});
    load();
  }

  function sig(text,kind='good'){const icon=kind==='good'?'✓':kind==='bad'?'!':'•';return `<div class="signal ${kind}"><i>${icon}</i><span>${esc(text)}</span></div>`}
  function appendSource(status,detail){const box=document.getElementById('sourceList');if(!box)return;const row=document.createElement('div');row.className='source';row.innerHTML=`<strong>SEC EDGAR Company Facts · ${esc(status)}</strong><small>${esc(detail)} · ${new Date().toLocaleString('es-MX')}</small>`;box.appendChild(row)}

  async function load(){
    if(!symbol)return;
    try{
      const r=await fetch(`${API}/api/sec-fundamentals/${encodeURIComponent(symbol)}`,{cache:'no-store'});const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.ok)throw new Error(d.error||`Backend respondió ${r.status}`);
      render(d);appendSource('OK',`CIK ${d.cik} · ${d.entityName||symbol}`);
    }catch(e){
      document.getElementById('finRows').innerHTML=`<tr><td colspan="7">${esc(e.message)}</td></tr>`;
      document.getElementById('finSignals').innerHTML=sig('Fundamentales SEC no disponibles para este símbolo. Si es un ETF, esta sección no aplica como estados financieros corporativos.','warn');
      document.getElementById('finDate').textContent='No disponible';appendSource('No disponible',e.message);
    }
  }

  function render(d){
    const annual=Array.isArray(d.annual)?d.annual:[],latest=annual.at(-1)||{},prev=annual.at(-2)||{},b=d.balance||{};
    const growth=finite(latest.revenue)&&finite(prev.revenue)&&Number(prev.revenue)!==0?(Number(latest.revenue)/Number(prev.revenue)-1)*100:null;
    const debtRatio=finite(b.debt)&&finite(b.assets)&&Number(b.assets)>0?Number(b.debt)/Number(b.assets)*100:null;
    document.getElementById('finDate').textContent=`SEC actualizado ${new Date(d.updatedAt).toLocaleString('es-MX')}`;
    document.getElementById('finRevenue').textContent=money(latest.revenue);document.getElementById('finRevenueGrowth').textContent=finite(growth)?`YoY ${pct(growth)}`:'crecimiento no disponible';
    document.getElementById('finNetIncome').textContent=money(latest.netIncome);document.getElementById('finNetIncome').className=finite(latest.netIncome)?(latest.netIncome>=0?'positive':'negative'):'';
    document.getElementById('finMargin').textContent=finite(latest.operatingMargin)?`${Number(latest.operatingMargin).toFixed(1)}%`:'—';
    document.getElementById('finFcf').textContent=money(latest.freeCashFlow);document.getElementById('finFcf').className=finite(latest.freeCashFlow)?(latest.freeCashFlow>=0?'positive':'negative'):'';
    document.getElementById('finAssets').textContent=money(b.assets);document.getElementById('finBalanceDate').textContent=b.end||'—';document.getElementById('finLiabilities').textContent=money(b.liabilities);document.getElementById('finDebt').textContent=money(b.debt);document.getElementById('finDebtRatio').textContent=finite(debtRatio)?`${debtRatio.toFixed(1)}% de activos`:'proporción no disponible';document.getElementById('finCash').textContent=money(b.cash);
    document.getElementById('finRows').innerHTML=annual.length?annual.slice().reverse().map(x=>`<tr><td>${esc(x.end||'—')}</td><td>${money(x.revenue)}</td><td class="${finite(x.netIncome)?(x.netIncome>=0?'positive':'negative'):''}">${money(x.netIncome)}</td><td>${finite(x.operatingMargin)?Number(x.operatingMargin).toFixed(1)+'%':'—'}</td><td>${money(x.operatingCashFlow)}</td><td class="${finite(x.freeCashFlow)?(x.freeCashFlow>=0?'positive':'negative'):''}">${money(x.freeCashFlow)}</td><td>${finite(x.eps)?Number(x.eps).toFixed(2):'—'}</td></tr>`).join(''):'<tr><td colspan="7">SEC no devolvió ejercicios anuales comparables.</td></tr>';
    const s=[];
    if(finite(growth))s.push({t:`Ingresos ${growth>=0?'crecieron':'cayeron'} ${Math.abs(growth).toFixed(1)}% frente al ejercicio anterior.`,k:growth>=3?'good':growth<=-3?'bad':'warn'});
    if(finite(latest.netIncome))s.push({t:latest.netIncome>=0?'La utilidad neta del último ejercicio fue positiva.':'La empresa reportó pérdida neta en el último ejercicio.',k:latest.netIncome>=0?'good':'bad'});
    if(finite(latest.freeCashFlow))s.push({t:latest.freeCashFlow>=0?'El flujo libre calculado fue positivo.':'El flujo libre calculado fue negativo.',k:latest.freeCashFlow>=0?'good':'bad'});
    if(finite(latest.operatingMargin)&&finite(prev.operatingMargin))s.push({t:`Margen operativo ${latest.operatingMargin>=prev.operatingMargin?'mejoró':'se deterioró'} de ${Number(prev.operatingMargin).toFixed(1)}% a ${Number(latest.operatingMargin).toFixed(1)}%.`,k:latest.operatingMargin>=prev.operatingMargin?'good':'bad'});
    if(finite(debtRatio))s.push({t:`Deuda identificada equivale aproximadamente a ${debtRatio.toFixed(1)}% de los activos reportados.`,k:debtRatio>60?'bad':debtRatio>35?'warn':'good'});
    document.getElementById('finSignals').innerHTML=(s.length?s:[{t:'No hay suficientes conceptos SEC comparables para emitir señales financieras.',k:'warn'}]).map(x=>sig(x.t,x.k)).join('');
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
