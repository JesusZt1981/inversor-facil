from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')


def replace_once(old, new, label):
    global s
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    s = s.replace(old, new, 1)

replace_once(
    '<title>Inversor Fácil V51 · Sincronización ordenada</title>',
    '<title>Inversor Fácil V52 · Rendimiento + almacenamiento estable</title>',
    'title'
)

replace_once(
"""  const queue=[];
  const queued=new Set();
  let running=false,lastRequestAt=0;

  function loadStore(){
    try{return JSON.parse(localStorage.getItem(V45_HISTORY_KEY)||'{}')||{}}
    catch(e){return {}}
  }
  function saveStore(d){
    try{localStorage.setItem(V45_HISTORY_KEY,JSON.stringify(d))}catch(e){console.warn('V45 history cache lleno',e)}
  }
""",
"""  const queue=[];
  const queued=new Set();
  let running=false,lastRequestAt=0;
  let memoryStore=null;

  function pickSummary(h){
    if(!h||typeof h!=='object')return null;
    const out={};
    ['day','price','today','week','month','year','fiveYear','coverageDays','points','updatedAt','error','lastErrorAt'].forEach(k=>{
      if(h[k]!==undefined)out[k]=h[k];
    });
    return Object.keys(out).length?out:null;
  }

  function loadStore(){
    if(memoryStore)return memoryStore;
    const store={};

    // V52: migrar una sola vez el cache V45 que duplicaba datos en localStorage.
    // Se conserva en memoria durante la sesión y se reconstruye desde Top500/Radar
    // al volver a abrir la app. Así no perdemos información visible ni llenamos cuota.
    try{
      const legacy=JSON.parse(localStorage.getItem(V45_HISTORY_KEY)||'{}')||{};
      Object.entries(legacy).forEach(([symbol,h])=>{const x=pickSummary(h);if(x)store[symbol]=x});
      localStorage.removeItem(V45_HISTORY_KEY);
    }catch(e){try{localStorage.removeItem(V45_HISTORY_KEY)}catch(x){}}

    try{
      const d=top500Load();
      Object.entries(d.metrics||{}).forEach(([symbol,h])=>{
        const x=pickSummary(h);if(!x)return;
        const prev=store[symbol];
        if(!prev || Number(x.coverageDays||0)>=Number(prev.coverageDays||0))store[symbol]=x;
      });
    }catch(e){}

    try{
      const r=radarLoad();
      Object.entries(r.histories||{}).forEach(([symbol,values])=>{
        const x=summarize(values||[]);if(!x)return;
        const prev=store[symbol];
        if(!prev || Number(x.coverageDays||0)>=Number(prev.coverageDays||0))store[symbol]=x;
      });
    }catch(e){}

    memoryStore=store;
    return memoryStore;
  }

  function saveStore(d){
    // V52: memoria solamente. La persistencia real ya existe en Top500 y Radar.
    // Evita JSON.stringify + setItem de cientos de símbolos en cada vuelta de la cola.
    memoryStore=d||{};
  }
""",
    'V45 store migration'
)

replace_once(
"""  function hasCoverage(entry,days){
    if(!entry)return false;
    if(days<=370)return Number.isFinite(Number(entry.year)) || Number(entry.coverageDays)>=330;
    return Number.isFinite(Number(entry.fiveYear)) || Number(entry.coverageDays)>=1650;
  }
""",
"""  function hasCoverage(entry,days){
    if(!entry)return false;
    // Si ya se consultó hoy, no volver a descargar el mismo símbolo aunque sea
    // una empresa nueva que todavía no tenga 1 o 5 años de historia bursátil.
    const today=(typeof nyDayKey==='function'?nyDayKey():new Date().toISOString().slice(0,10));
    const checked=String(entry.updatedAt||entry.day||entry.lastErrorAt||'').slice(0,10);
    if(checked===today)return true;
    if(days<=370)return Number.isFinite(Number(entry.year)) || Number(entry.coverageDays)>=330;
    return Number.isFinite(Number(entry.fiveYear)) || Number(entry.coverageDays)>=1650;
  }
""",
    'hasCoverage'
)

replace_once(
"""  function syncEverywhere(symbol,summary,values){
    mergeSummary(symbol,summary);
    syncToRadar(symbol,values);
""",
"""  function syncEverywhere(symbol,summary,values,source){
    mergeSummary(symbol,summary);
    // Top 500 sólo necesita métricas resumidas. Guardar 270 velas de cada una de
    // 500 empresas dentro del Radar duplicaba megabytes y agotaba localStorage.
    // Radar conserva su histórico completo para gráficas y métricas propias.
    if(source==='radar')syncToRadar(symbol,values);
""",
    'syncEverywhere signature'
)

replace_once(
    "syncEverywhere(job.symbol,summary,values||[]);",
    "syncEverywhere(job.symbol,summary,values||[],job.source);",
    'syncEverywhere call'
)

replace_once(
"""      }catch(e){
        const store=loadStore();store[job.symbol]={...(store[job.symbol]||{}),error:String(e.message||e),lastErrorAt:new Date().toISOString()};saveStore(store);
        status(job.source,`${job.symbol}: historial no disponible (${e.message}).`,'warn');
      }finally{queued.delete(job.key)}
      try{v45HydrateTop500();window.renderTop500?.();window.renderExternalRadar?.()}catch(e){}
""",
"""      }catch(e){
        const store=loadStore();store[job.symbol]={...(store[job.symbol]||{}),error:String(e.message||e),lastErrorAt:new Date().toISOString()};saveStore(store);
        status(job.source,`${job.symbol}: historial no disponible (${e.message}).`,'warn');
      }finally{queued.delete(job.key)}
      try{
        v45HydrateTop500();
        if(typeof window.v51RenderVisible==='function')window.v51RenderVisible('v52-history');
        else if(job.source==='top500')window.renderTop500?.();
        else if(job.source==='radar')window.renderExternalRadar?.();
      }catch(e){}
""",
    'runQueue render'
)

replace_once(
"""  function v45HydrateTop500(){
    try{
      const store=loadStore(),d=top500Load();let changed=false;d.metrics=d.metrics||{};
      (d.universe||[]).forEach(row=>{
        const h=store[row.symbol];if(!h)return;
        const prev=d.metrics[row.symbol]||{};
        d.metrics[row.symbol]={...prev,...h,checkedDay:new Date().toISOString().slice(0,10),v45Auto:true};changed=true;
      });
      if(changed)top500Save(d);
    }catch(e){}
  }
""",
"""  function v45HydrateTop500(){
    try{
      const store=loadStore(),d=top500Load();let changed=false;d.metrics=d.metrics||{};
      (d.universe||[]).forEach(row=>{
        const h=store[row.symbol];if(!h)return;
        const prev=d.metrics[row.symbol]||{};
        const stamp=String(h.updatedAt||h.day||'');
        if(prev.v52HistoryStamp===stamp)return;
        d.metrics[row.symbol]={...prev,...h,checkedDay:new Date().toISOString().slice(0,10),v45Auto:true,v52HistoryStamp:stamp};
        changed=true;
      });
      if(changed)top500Save(d);
    }catch(e){}
  }
""",
    'hydrate only changes'
)

replace_once(
    "setInterval(tick,30000);",
    "setInterval(tick,60000);",
    'V45 tick interval'
)

# Mark version in visible heading without changing the application's content model.
replace_once(
    '<h1>Inversor Fácil V49</h1>',
    '<h1>Inversor Fácil V52</h1>',
    'visible version heading'
)

p.write_text(s, encoding='utf-8')
print('V52 patch applied successfully')
