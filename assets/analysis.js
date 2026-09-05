/* Inversor Fácil V55 · análisis 360° dinámico */
(function(){
  'use strict';

  const VERSION=55;
  const SYMBOL=(new URLSearchParams(location.search).get('symbol')||'').trim().toUpperCase();
  const CACHE_DB='InversorFacilAnalysisV55';
  const CACHE_STORE='analysis';
  const LOCAL_HISTORY_KEY='inversorFacilMarketHistoryV15';
  const SHARED_HISTORY_KEY='inversorFacilSharedHistoryV45';
  const CONFIG_KEY='inversorFacilV5';
  const QUOTE_TTL=10*60*1000;
  const PROFILE_TTL=7*24*60*60*1000;
  const HISTORY_TTL=18*60*60*1000;
  const state={symbol:SYMBOL,quote:null,profile:null,rows:[],metrics:null,prob:null,sources:[],cache:null};

  const $=id=>document.getElementById(id);
  const finite=v=>Number.isFinite(Number(v));
  const num=v=>finite(v)?Number(v):null;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const pct=v=>finite(v)?`${Number(v)>=0?'+':''}${Number(v).toFixed(2)}%`:'—';
  const usd=v=>finite(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(Number(v)):'—';
  const compact=v=>finite(v)?new Intl.NumberFormat('es-MX',{notation:'compact',maximumFractionDigits:2}).format(Number(v)):'—';
  const esc=s=>String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const stdev=a=>{if(a.length<2)return null;const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)**2,0)/(a.length-1));};
  const qtile=(a,q)=>{const b=a.filter(finite).map(Number).sort((x,y)=>x-y);if(!b.length)return null;const p=(b.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return l===h?b[l]:b[l]+(b[h]-b[l])*(p-l);};

  function config(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'{}')||{}}catch{return {}}}
  function apiKey(){return String(config().marketKey||'').trim()}
  function setText(id,value){const e=$(id);if(e)e.textContent=value}
  function setClass(id,value,cls){const e=$(id);if(!e)return;e.textContent=value;e.className=cls||''}
  function showMessage(text,kind='warn'){
    const e=$('globalMessage');if(!e)return;
    if(!text){e.style.display='none';return}
    e.style.display='block';e.className=`notice ${kind==='error'?'error':kind==='ok'?'ok':''}`;e.textContent=text;
  }
  function source(name,status,detail){state.sources.push({name,status,detail,at:new Date().toISOString()});renderSources()}

  function openDb(){return new Promise(resolve=>{
    if(!('indexedDB' in window))return resolve(null);
    const req=indexedDB.open(CACHE_DB,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(CACHE_STORE))db.createObjectStore(CACHE_STORE,{keyPath:'symbol'})};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);
  })}
  async function dbGet(symbol){const db=await openDb();if(!db)return null;return new Promise(resolve=>{const tx=db.transaction(CACHE_STORE,'readonly'),r=tx.objectStore(CACHE_STORE).get(symbol);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>resolve(null)})}
  async function dbPut(row){const db=await openDb();if(!db)return;return new Promise(resolve=>{const tx=db.transaction(CACHE_STORE,'readwrite');tx.objectStore(CACHE_STORE).put(row);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve()})}

  function localRows(symbol){
    try{
      const d=JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY)||'{}');
      const rows=(d.records?.[symbol]||[]).map(r=>({datetime:r.day||r.datetime,close:Number(r.price),open:null,high:null,low:null,volume:null}))
        .filter(r=>r.datetime&&finite(r.close)&&r.close>0).sort((a,b)=>String(a.datetime).localeCompare(String(b.datetime)));
      return dedupeRows(rows);
    }catch{return []}
  }
  function sharedSummary(symbol){try{return JSON.parse(localStorage.getItem(SHARED_HISTORY_KEY)||'{}')?.[symbol]||null}catch{return null}}

  function dedupeRows(rows){
    const m=new Map();
    (rows||[]).forEach(r=>{const day=String(r.datetime||r.day||'').slice(0,10),close=num(r.close);if(day&&finite(close)&&close>0)m.set(day,{datetime:day,open:num(r.open),high:num(r.high),low:num(r.low),close,volume:num(r.volume)})});
    return [...m.values()].sort((a,b)=>a.datetime.localeCompare(b.datetime));
  }

  async function td(endpoint,params={}){
    const key=apiKey();if(!key)throw new Error('Falta la clave de Twelve Data en Configuración de Inversor Fácil.');
    const u=new URL(`https://api.twelvedata.com/${endpoint}`);
    Object.entries({...params,apikey:key}).forEach(([k,v])=>{if(v!==null&&v!==undefined&&v!=='')u.searchParams.set(k,String(v))});
    const res=await fetch(u.toString());let data={};try{data=await res.json()}catch{}
    if(!res.ok||data?.status==='error'||data?.code)throw new Error(data?.message||`Twelve Data respondió ${res.status}`);
    return data;
  }

  function normalizeSeries(payload){return dedupeRows(Array.isArray(payload?.values)?payload.values:[])}
  function returnAt(rows,n){if(rows.length<=n)return null;const a=rows.at(-1),b=rows.at(-(n+1));return b?.close>0?(a.close/b.close-1)*100:null}
  function movingAverage(rows,n){if(rows.length<n)return null;return mean(rows.slice(-n).map(r=>r.close))}
  function dailyReturns(rows){const out=[];for(let i=1;i<rows.length;i++)if(rows[i-1].close>0)out.push((rows[i].close/rows[i-1].close-1)*100);return out}
  function volFor(rows,n=20){const r=dailyReturns(rows.slice(-(n+1)));return r.length>=5?stdev(r):null}
  function rsi(rows,n=14){if(rows.length<n+1)return null;const r=dailyReturns(rows.slice(-(n+1)));let gains=0,losses=0;r.forEach(x=>{if(x>0)gains+=x;else losses-=x});const ag=gains/n,al=losses/n;if(al===0)return 100;return 100-(100/(1+ag/al))}
  function maxDrawdown(rows){let peak=-Infinity,mdd=0;rows.forEach(r=>{peak=Math.max(peak,r.close);if(peak>0)mdd=Math.min(mdd,(r.close/peak-1)*100)});return mdd}

  function computeMetrics(rows){
    if(rows.length<2)return null;
    const last=rows.at(-1),prev=rows.at(-2),ret1=(last.close/prev.close-1)*100;
    const last252=rows.slice(-252),high52=Math.max(...last252.map(r=>finite(r.high)?r.high:r.close)),low52=Math.min(...last252.map(r=>finite(r.low)?r.low:r.close));
    const rets=dailyReturns(rows),vol20=volFor(rows,20),annVol=stdev(rets.slice(-252));
    const volumes=rows.slice(-20).map(r=>r.volume).filter(finite),avgVol=mean(volumes),relVol=finite(last.volume)&&avgVol>0?last.volume/avgVol:null;
    const ma20=movingAverage(rows,20),ma50=movingAverage(rows,50),ma200=movingAverage(rows,200);
    return {
      last,ret1,ret5:returnAt(rows,5),ret21:returnAt(rows,21),ret63:returnAt(rows,63),ret252:returnAt(rows,252),ret1260:returnAt(rows,Math.min(1260,rows.length-1)),
      high52,low52,fromLow:low52>0?(last.close/low52-1)*100:null,drawdown52:high52>0?(last.close/high52-1)*100:null,
      vol20,annVol:finite(annVol)?annVol*Math.sqrt(252):null,relVol,rsi:rsi(rows,14),ma20,ma50,ma200,maxDd:maxDrawdown(rows),points:rows.length,
      coverageStart:rows[0].datetime,coverageEnd:last.datetime,strongThreshold:qtile(rets.map(Math.abs),.95),baselineUp:rets.length?rets.filter(x=>x>0).length/rets.length*100:null
    };
  }

  function featuresAt(rows,i){
    if(i<21)return null;
    const d1=(rows[i].close/rows[i-1].close-1)*100;
    const m5=(rows[i].close/rows[i-5].close-1)*100;
    const m20=(rows[i].close/rows[i-20].close-1)*100;
    const v=volFor(rows.slice(0,i+1),20);
    return {d1,m5,m20,vol:v};
  }

  function probability(rows,metrics){
    if(rows.length<90||!metrics)return null;
    const cur=featuresAt(rows,rows.length-1);if(!cur)return null;
    const thr=finite(metrics.strongThreshold)?metrics.strongThreshold:3;
    function collect(level){
      const cases=[];
      for(let i=30;i<rows.length-6;i++){
        const f=featuresAt(rows,i);if(!f||!finite(f.vol)||!finite(cur.vol))continue;
        let ok=false;
        if(level===1){ok=Math.abs(f.d1-cur.d1)<=Math.max(.8,thr*.55)&&Math.abs(f.m5-cur.m5)<=Math.max(2.5,thr*1.4)&&Math.abs(f.m20-cur.m20)<=Math.max(5,thr*2.5)&&f.vol/cur.vol>=.55&&f.vol/cur.vol<=1.8}
        else if(level===2){ok=Math.abs(f.d1-cur.d1)<=Math.max(1.4,thr*.9)&&Math.abs(f.m5-cur.m5)<=Math.max(4,thr*2)&&Math.sign(f.m20||0)===Math.sign(cur.m20||0)&&f.vol/cur.vol>=.4&&f.vol/cur.vol<=2.5}
        else {ok=Math.sign(f.d1||0)===Math.sign(cur.d1||0)&&Math.sign(f.m5||0)===Math.sign(cur.m5||0)&&Math.sign(f.m20||0)===Math.sign(cur.m20||0)}
        if(ok)cases.push(i);
      }
      return cases;
    }
    let cases=collect(1),level=1;if(cases.length<30){cases=collect(2);level=2}if(cases.length<20){cases=collect(3);level=3}
    if(!cases.length)return null;
    const horizons={};
    for(let h=1;h<=5;h++){
      const vals=cases.map(i=>(rows[i+h].close/rows[i].close-1)*100).filter(finite);
      horizons[h]={n:vals.length,pUp:vals.length?vals.filter(v=>v>0).length/vals.length*100:null,avg:mean(vals),median:qtile(vals,.5)};
    }
    const next=cases.map(i=>(rows[i+1].close/rows[i].close-1)*100).filter(finite);
    const strong=finite(metrics.strongThreshold)?metrics.strongThreshold:qtile(dailyReturns(rows).map(Math.abs),.95);
    const strongUp=next.length&&finite(strong)?next.filter(v=>v>=strong).length/next.length*100:null;
    const strongDown=next.length&&finite(strong)?next.filter(v=>v<=-strong).length/next.length*100:null;
    const p1=horizons[1]?.pUp,edge=finite(p1)&&finite(metrics.baselineUp)?p1-metrics.baselineUp:null;
    const confidence=cases.length>=120?'Alta':cases.length>=70?'Media-alta':cases.length>=35?'Media':'Baja';
    return {cases:cases.length,level,horizons,strong,strongUp,strongDown,edge,confidence,current:cur};
  }

  function businessDays(count){
    const out=[],d=new Date();d.setHours(12,0,0,0);
    while(out.length<count){d.setDate(d.getDate()+1);const w=d.getDay();if(w!==0&&w!==6)out.push(new Date(d))}
    return out;
  }

  function scoreAnalysis(m,p){
    if(!m)return null;
    let momentum=50;momentum+=clamp((m.ret21||0)*1.8,-30,30);if(finite(m.ma50))momentum+=m.last.close>=m.ma50?8:-8;momentum=clamp(momentum,0,100);
    let trend=50;if(finite(m.ma20))trend+=m.last.close>=m.ma20?10:-10;if(finite(m.ma50))trend+=m.last.close>=m.ma50?12:-12;if(finite(m.ma200))trend+=m.last.close>=m.ma200?18:-18;trend=clamp(trend,0,100);
    const stability=clamp(100-((m.annVol||.35)*100)*1.35,5,95);
    const resilience=clamp(55+(m.fromLow||0)*.35+(m.drawdown52||0)*.5,0,100);
    const probabilityScore=p&&finite(p.horizons?.[5]?.pUp)?clamp(p.horizons[5].pUp,0,100):50;
    const score=Math.round(momentum*.24+trend*.22+stability*.16+resilience*.14+probabilityScore*.24);
    const label=score>=75?'Fuerte / momentum favorable':score>=60?'Favorable con vigilancia':score>=45?'Neutral / en definición':score>=30?'Débil / especulativo':'Deterioro elevado';
    return {score,label,factors:{Momentum:Math.round(momentum),Tendencia:Math.round(trend),Estabilidad:Math.round(stability),Resiliencia:Math.round(resilience),Probabilidad:Math.round(probabilityScore)}};
  }

  function renderHero(){
    const q=state.quote||{},p=state.profile||{},m=state.metrics||{},name=p.name||q.name||SYMBOL,type=String(p.type||q.type||'').toLowerCase().includes('etf')?'ETF':(p.type||q.type||'Empresa');
    document.title=`${SYMBOL} · Análisis 360° · Inversor Fácil`;
    setText('assetTypeLabel',type);setText('assetName',name);
    setText('assetMeta',[SYMBOL,q.exchange||p.exchange,p.sector||p.industry,p.country||q.country].filter(Boolean).join(' · ')||SYMBOL);
    const price=num(q.close)||num(q.price)||num(m.last?.close);setText('assetPrice',price?usd(price):'—');
    const ch=num(q.percent_change)??num(m.ret1);setClass('assetChange',pct(ch),ch>0?'change positive':ch<0?'change negative':'change neutral');
    setClass('mDay',pct(m.ret1),m.ret1>0?'positive':m.ret1<0?'negative':'neutral');
    setClass('mWeek',pct(m.ret5),m.ret5>0?'positive':m.ret5<0?'negative':'neutral');
    setClass('mMonth',pct(m.ret21),m.ret21>0?'positive':m.ret21<0?'negative':'neutral');
    setClass('mYear',pct(m.ret252),m.ret252>0?'positive':m.ret252<0?'negative':'neutral');
    setText('mHigh52',finite(m.high52)?usd(m.high52):'—');setText('mHigh52Sub',finite(m.drawdown52)?`${pct(m.drawdown52)} desde máximo`:'—');
    setText('mLow52',finite(m.low52)?usd(m.low52):'—');setText('mLow52Sub',finite(m.fromLow)?`${pct(m.fromLow)} desde mínimo`:'—');
  }

  function diagnostic(){
    const m=state.metrics,p=state.prob;if(!m)return 'Todavía no hay histórico suficiente para generar un diagnóstico cuantitativo.';
    const trend=finite(m.ma200)?(m.last.close>=m.ma200?'mantiene una tendencia larga favorable':'cotiza por debajo de su tendencia larga'):(m.ret21>=0?'muestra momentum mensual positivo':'muestra debilidad mensual');
    const loc=finite(m.drawdown52)?`Está ${Math.abs(m.drawdown52).toFixed(1)}% por debajo de su máximo de 52 semanas`:'No hay rango anual completo';
    const pr=p&&finite(p.horizons?.[5]?.pUp)?`En ${p.cases} situaciones históricas comparables, terminó arriba a 5 sesiones el ${p.horizons[5].pUp.toFixed(1)}% de las veces.`:'Aún no hay suficientes casos comparables para una probabilidad robusta.';
    return `${SYMBOL} ${trend}. ${loc}. ${pr}`;
  }

  function signal(text,kind='good',icon){return `<div class="signal ${kind}"><i>${icon|| (kind==='good'?'✓':kind==='bad'?'!':'•')}</i><span>${esc(text)}</span></div>`}
  function renderSummary(){
    const m=state.metrics,p=state.prob,s=scoreAnalysis(m,p);setText('diagnosticText',diagnostic());
    if(!s)return;
    setText('scoreValue',s.score);setText('scoreLabel',s.label);$('scoreCircle').style.setProperty('--score',`${s.score}%`);
    setText('scoreExplanation',s.score>=60?'La combinación actual de tendencia, estabilidad y patrón histórico es favorable, pero debe leerse junto con sus riesgos.':s.score>=45?'Las señales están mezcladas; no existe una ventaja suficientemente clara para tratarla como tendencia fuerte.':'El precio y/o la estabilidad muestran deterioro. Si se estudia como oportunidad, requiere tolerancia elevada al riesgo.');
    $('factorList').innerHTML=Object.entries(s.factors).map(([k,v])=>`<div class="factor"><span>${esc(k)}</span><div class="factor-track"><div class="factor-fill" style="width:${clamp(v,0,100)}%"></div></div><strong>${v}</strong></div>`).join('');
    const pos=[],neg=[];
    if(finite(m.ret21)&&m.ret21>5)pos.push(`Momentum de 1 mes positivo: ${pct(m.ret21)}.`);if(finite(m.ma50)&&m.last.close>m.ma50)pos.push('Precio por encima de la media de 50 sesiones.');if(finite(m.ma200)&&m.last.close>m.ma200)pos.push('Precio por encima de la media de 200 sesiones.');if(finite(m.fromLow)&&m.fromLow>20)pos.push(`Recuperación de ${pct(m.fromLow)} desde el mínimo de 52 semanas.`);if(p&&finite(p.edge)&&p.edge>4)pos.push(`La probabilidad 1D supera su base histórica por ${p.edge.toFixed(1)} puntos porcentuales.`);
    if(finite(m.drawdown52)&&m.drawdown52<-25)neg.push(`Sigue ${pct(m.drawdown52)} debajo del máximo de 52 semanas.`);if(finite(m.annVol)&&m.annVol>.45)neg.push(`Volatilidad anualizada elevada: ${(m.annVol*100).toFixed(1)}%.`);if(finite(m.ma200)&&m.last.close<m.ma200)neg.push('Precio por debajo de la media de 200 sesiones.');if(finite(m.rsi)&&m.rsi>75)neg.push(`RSI elevado (${m.rsi.toFixed(0)}): posible sobreextensión.`);if(finite(m.rsi)&&m.rsi<25)neg.push(`RSI muy bajo (${m.rsi.toFixed(0)}): presión vendedora extrema.`);if(p&&p.cases<30)neg.push(`La muestra estadística es pequeña (${p.cases} casos).`);
    $('positiveSignals').innerHTML=(pos.length?pos:['No hay señales favorables suficientemente fuertes con los datos actuales.']).map(x=>signal(x,pos.length?'good':'warn')).join('');
    $('negativeSignals').innerHTML=(neg.length?neg:['No aparece una alerta cuantitativa extraordinaria en los datos disponibles.']).map(x=>signal(x,neg.length?'bad':'warn')).join('');
  }

  function renderBusiness(){
    const p=state.profile||{},q=state.quote||{};const type=String(p.type||q.type||'').toLowerCase().includes('etf')?'ETF':'Empresa';
    setText('businessTitle',type==='ETF'?'Composición / objetivo del ETF':'Qué hace la empresa');
    const desc=p.description||p.about||p.summary||'';
    $('businessDescription').innerHTML=desc?`<p>${esc(desc)}</p>`:`<p>No recibimos una descripción empresarial completa desde la fuente disponible. El sistema no rellenará este espacio con texto inventado.</p>`;
    const items=[['Símbolo',SYMBOL],['Nombre',p.name||q.name],['Tipo',p.type||q.type||type],['Bolsa',p.exchange||q.exchange],['Sector',p.sector],['Industria',p.industry],['País',p.country||q.country],['Moneda',p.currency||q.currency],['Sitio',p.website],['Empleados',p.employees?compact(p.employees):null]].filter(x=>x[1]);
    $('identityList').innerHTML=items.length?items.map(([k,v])=>signal(`${k}: ${v}`,'warn','•')).join(''):'<div class="empty">Sin perfil adicional disponible.</div>';
  }

  function renderPrice(){
    const m=state.metrics;if(!m)return;
    setText('historyCoverage',`${m.points} cierres · ${m.coverageStart} → ${m.coverageEnd}`);setText('sVol',finite(m.annVol)?`${(m.annVol*100).toFixed(1)}%`:'—');setText('sDrawdown',pct(m.drawdown52));setText('sRsi',finite(m.rsi)?m.rsi.toFixed(1):'—');setText('sRelVol',finite(m.relVol)?`${m.relVol.toFixed(2)}×`:'—');setText('sMa20',finite(m.ma20)?`${usd(m.ma20)} · ${pct((m.last.close/m.ma20-1)*100)}`:'—');setText('sMa50',finite(m.ma50)?`${usd(m.ma50)} · ${pct((m.last.close/m.ma50-1)*100)}`:'—');setText('sMa200',finite(m.ma200)?`${usd(m.ma200)} · ${pct((m.last.close/m.ma200-1)*100)}`:'—');setText('sMaxDd',pct(m.maxDd));drawChart();
  }

  function drawChart(){
    const rows=state.rows.slice(-500),svg=$('priceChart');if(!svg||rows.length<2){if(svg)svg.innerHTML='';return}
    const W=1000,H=280,pad={l:48,r:18,t:16,b:28},vals=rows.map(r=>r.close),min=Math.min(...vals),max=Math.max(...vals),range=Math.max(max-min,.0001);
    const pts=rows.map((r,i)=>({x:pad.l+i/(rows.length-1)*(W-pad.l-pad.r),y:pad.t+(max-r.close)/range*(H-pad.t-pad.b),r}));
    const line=pts.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');const area=`${pad.l},${H-pad.b} ${line} ${W-pad.r},${H-pad.b}`;
    const yLines=[max,(max+min)/2,min].map((v,i)=>{const y=pad.t+i*(H-pad.t-pad.b)/2;return `<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#263448" stroke-dasharray="4 5"/><text x="${pad.l-7}" y="${y+4}" text-anchor="end" fill="#7890aa" font-size="10">$${v.toFixed(2)}</text>`}).join('');
    const start=rows[0].datetime,end=rows.at(-1).datetime;
    svg.innerHTML=`<defs><linearGradient id="if55area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#10d9c4" stop-opacity=".24"/><stop offset="1" stop-color="#10d9c4" stop-opacity=".01"/></linearGradient></defs>${yLines}<polygon points="${area}" fill="url(#if55area)"/><polyline points="${line}" fill="none" stroke="#10d9c4" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><text x="${pad.l}" y="${H-7}" fill="#7890aa" font-size="10">${start}</text><text x="${W-pad.r}" y="${H-7}" text-anchor="end" fill="#7890aa" font-size="10">${end}</text>`;
    $('chartLegend').innerHTML=`<span><i class="legend-dot" style="background:#10d9c4"></i>Cierre diario</span><span>${rows.length} puntos visibles</span>`;
  }

  function renderProbability(){
    const p=state.prob,m=state.metrics;if(!p){$('probGrid').innerHTML='<div class="empty">Se necesitan al menos ~90 cierres para calcular patrones comparables.</div>';return}
    setText('probCases',`${p.cases} casos similares · confianza ${p.confidence}`);
    $('probGrid').innerHTML=[1,2,3,4,5].map(h=>{const x=p.horizons[h];const cls=x?.pUp>=55?'positive':x?.pUp<=45?'negative':'neutral';return `<div class="prob"><span>${h} sesión${h===1?'':'es'}</span><strong class="${cls}">${finite(x?.pUp)?x.pUp.toFixed(1)+'%':'—'}</strong><small>retorno medio ${pct(x?.avg)}</small></div>`}).join('');
    const days=businessDays(5);$('probTimeline').innerHTML=days.map((d,i)=>{const x=p.horizons[i+1],pr=x?.pUp;const cls=pr>=55?'positive':pr<=45?'negative':'neutral';return `<div class="day"><div class="date">${d.toLocaleDateString('es-MX',{weekday:'short',day:'2-digit',month:'short'})}</div><strong class="${cls}">${finite(pr)?pr.toFixed(1)+'% ↑':'—'}</strong><small>horizonte ${i+1} sesión${i?'es':''}</small></div>`}).join('');
    setText('strongThreshold',finite(p.strong)?`±${p.strong.toFixed(2)}%`:'—');setClass('probEdge',finite(p.edge)?`${p.edge>=0?'+':''}${p.edge.toFixed(1)} pp`:'—',p.edge>0?'positive':p.edge<0?'negative':'neutral');setText('strongUp',finite(p.strongUp)?`${p.strongUp.toFixed(1)}%`:'—');setText('strongDown',finite(p.strongDown)?`${p.strongDown.toFixed(1)}%`:'—');
  }

  function renderRisk(){
    const m=state.metrics,p=state.prob;if(!m)return;const list=[];
    if(finite(m.annVol))list.push({t:`Volatilidad anualizada ${(m.annVol*100).toFixed(1)}%`,k:m.annVol>.45?'bad':m.annVol>.28?'warn':'good'});
    if(finite(m.maxDd))list.push({t:`Máximo drawdown observado ${pct(m.maxDd)}`,k:m.maxDd<-60?'bad':m.maxDd<-35?'warn':'good'});
    if(finite(m.drawdown52))list.push({t:`Distancia al máximo de 52 semanas ${pct(m.drawdown52)}`,k:m.drawdown52<-30?'bad':m.drawdown52<-12?'warn':'good'});
    if(finite(m.relVol))list.push({t:`Volumen relativo ${m.relVol.toFixed(2)}×`,k:m.relVol>2?'warn':'good'});
    if(p)list.push({t:`Muestra estadística ${p.cases} casos · confianza ${p.confidence}`,k:p.cases<30?'warn':'good'});
    $('riskSignals').innerHTML=list.map(x=>signal(x.t,x.k)).join('')||'<div class="empty">No hay métricas de riesgo suficientes.</div>';
    const vol=finite(m.annVol)?(m.annVol>.45?'muy alta':m.annVol>.28?'media-alta':'moderada'):'no determinada';const dd=finite(m.drawdown52)?Math.abs(m.drawdown52).toFixed(1):'—';
    $('riskNarrative').innerHTML=`<p>La volatilidad histórica actual es <b>${vol}</b>. El activo está aproximadamente <b>${dd}%</b> debajo de su máximo anual. Estos datos describen el comportamiento del precio; no sustituyen el análisis de deuda, ventas, flujo de caja o composición del ETF.</p><p>Cuando los fundamentales detallados no están disponibles en la fuente contratada, Inversor Fácil los marca como pendientes en lugar de fabricar una cifra.</p>`;
  }

  function renderSources(){
    const box=$('sourceList');if(!box)return;box.innerHTML=state.sources.length?state.sources.map(s=>`<div class="source"><strong>${esc(s.name)} · ${esc(s.status)}</strong><small>${esc(s.detail||'')} · ${new Date(s.at).toLocaleString('es-MX')}</small></div>`).join(''):'<div class="empty">Todavía no se consultan fuentes.</div>';
    setText('lastUpdated',`Última ejecución: ${new Date().toLocaleString('es-MX')}`);
  }

  function renderAll(){renderHero();renderBusiness();renderPrice();renderProbability();renderRisk();renderSummary();renderSources()}

  function applyCache(c){
    if(!c)return false;state.cache=c;if(c.quote)state.quote=c.quote;if(c.profile)state.profile=c.profile;if(Array.isArray(c.rows)&&c.rows.length)state.rows=dedupeRows(c.rows);if(state.rows.length){state.metrics=computeMetrics(state.rows);state.prob=probability(state.rows,state.metrics)}renderAll();return !!(state.quote||state.rows.length)
  }

  async function load(force=false){
    if(!SYMBOL){showMessage('No se recibió un símbolo. Abre este análisis desde el catálogo de Inversor Fácil.','error');$('loadingBar').style.display='none';$('refreshBtn').disabled=true;return}
    showMessage('');$('loadingBar').style.display='block';$('refreshBtn').disabled=true;state.sources=[];
    const cached=await dbGet(SYMBOL);applyCache(cached);if(cached)source('Caché local del análisis','OK','Se mostró primero para abrir la pestaña con rapidez.');
    const local=localRows(SYMBOL);if(!state.rows.length&&local.length){state.rows=local;state.metrics=computeMetrics(local);state.prob=probability(local,state.metrics);renderAll();source('Historial guardado de Inversor Fácil','OK',`${local.length} cierres disponibles en este navegador.`)}
    const shared=sharedSummary(SYMBOL);if(shared&&!state.quote&&finite(shared.price)){state.quote={symbol:SYMBOL,name:SYMBOL,close:shared.price,percent_change:shared.today,datetime:shared.day};renderHero();source('Resumen histórico V45','OK','Precio/resumen compartido guardado en el navegador.')}
    const key=apiKey();
    if(!key){showMessage('No encontré la clave de Twelve Data en este navegador. Se muestran los últimos datos guardados; abre Configuración en Inversor Fácil y guarda tu clave para actualizar en línea.','warn');setText('freshChip','Datos guardados');$('freshChip').className='chip warn';$('loadingBar').style.display='none';$('refreshBtn').disabled=false;renderAll();return}
    try{
      const t=Date.now(),needQuote=force||!cached?.quoteAt||t-cached.quoteAt>QUOTE_TTL,needProfile=force||!cached?.profileAt||t-cached.profileAt>PROFILE_TTL,needHistory=force||!cached?.historyAt||t-cached.historyAt>HISTORY_TTL||!state.rows.length;
      const jobs=[];
      if(needQuote)jobs.push(['quote',td('quote',{symbol:SYMBOL})]);
      if(needProfile)jobs.push(['profile',td('profile',{symbol:SYMBOL})]);
      if(needHistory)jobs.push(['history',td('time_series',{symbol:SYMBOL,interval:'1day',outputsize:1300,order:'asc',adjust:'splits'})]);
      if(!jobs.length){source('Twelve Data','Caché vigente','No fue necesario gastar créditos; los datos todavía están dentro de su ventana de actualización.');setText('freshChip','Caché vigente');$('freshChip').className='chip good'}
      const results=await Promise.allSettled(jobs.map(x=>x[1]));
      const next={symbol:SYMBOL,quote:state.quote,profile:state.profile,rows:state.rows,quoteAt:cached?.quoteAt||0,profileAt:cached?.profileAt||0,historyAt:cached?.historyAt||0,version:VERSION};
      results.forEach((r,i)=>{
        const kind=jobs[i][0];
        if(r.status==='fulfilled'){
          if(kind==='quote'){state.quote=r.value;next.quote=r.value;next.quoteAt=Date.now();source('Twelve Data · quote','OK',`Cotización ${r.value.datetime||'más reciente disponible'}.`)}
          if(kind==='profile'){state.profile=r.value;next.profile=r.value;next.profileAt=Date.now();source('Twelve Data · profile','OK','Perfil empresarial/instrumento actualizado.')}
          if(kind==='history'){const rows=normalizeSeries(r.value);if(rows.length){state.rows=rows;next.rows=rows;next.historyAt=Date.now();source('Twelve Data · time_series','OK',`${rows.length} cierres diarios recibidos.`)}else source('Twelve Data · time_series','Sin datos','La respuesta no incluyó velas utilizables.')}
        }else source(`Twelve Data · ${kind}`,'No disponible',r.reason?.message||String(r.reason||'Error'));
      });
      if(state.rows.length){state.metrics=computeMetrics(state.rows);state.prob=probability(state.rows,state.metrics)}
      await dbPut(next);renderAll();
      const current=results.some(r=>r.status==='fulfilled');setText('freshChip',current?'Actualizado':'Datos guardados');$('freshChip').className=`chip ${current?'good':'warn'}`;setText('sourceChip',state.rows.length?`${state.rows.length} cierres`:'Sin histórico');
      if(!current)showMessage('No fue posible actualizar en línea. El análisis permanece con los últimos datos guardados.','warn');
    }catch(e){source('Twelve Data','Error',e.message);showMessage(`No fue posible completar la actualización: ${e.message}. Se mantienen los datos guardados.`,'warn');renderAll()}
    finally{$('loadingBar').style.display='none';$('refreshBtn').disabled=false}
  }

  function setupTabs(){document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('active',p.dataset.panel===b.dataset.tab));if(b.dataset.tab==='price')requestAnimationFrame(drawChart)}))}
  function init(){setupTabs();$('refreshBtn').addEventListener('click',()=>load(true));load(false)}
  init();
})();
