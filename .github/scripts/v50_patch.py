from pathlib import Path
import re

p=Path('index.html')
s=p.read_text(encoding='utf-8')

# Remove every previous V49 block, including the malformed one with literal
# backslashes at line ends. We locate the marker and remove the surrounding
# script tag rather than depending on a fragile exact regex.
v49_marker='/* ===== V49 · Top 500 compartido entre dispositivos/usuarios ===== */'
while v49_marker in s:
    idx=s.index(v49_marker)
    start=s.rfind('<script>',0,idx)
    end=s.find('</script>',idx)
    if start<0 or end<0:
        s=s.replace(v49_marker,'',1)
        continue
    end+=len('</script>')
    while start>0 and s[start-1] in '\\\r\n':
        start-=1
    while end<len(s) and s[end] in '\\\r\n':
        end+=1
    s=s[:start]+s[end:]

# Update save hook.
s=re.sub(
    r'function top500Save\(d\)\{\s*localStorage\.setItem\(TOP500_KEY,JSON\.stringify\(d\)\);\s*if\(typeof window\.v49ScheduleTop500Publish===\"function\"\) window\.v49ScheduleTop500Publish\(d\);\s*\}',
    'function top500Save(d){\n  localStorage.setItem(TOP500_KEY,JSON.stringify(d));\n  if(typeof window.v50ScheduleTop500Publish==="function") window.v50ScheduleTop500Publish(d);\n}',
    s,
    count=1,
)
s=s.replace(
    'function top500Save(d){localStorage.setItem(TOP500_KEY,JSON.stringify(d));}',
    'function top500Save(d){\n  localStorage.setItem(TOP500_KEY,JSON.stringify(d));\n  if(typeof window.v50ScheduleTop500Publish==="function") window.v50ScheduleTop500Publish(d);\n}',
    1,
)
# In case the V50 hook was already installed, leave it unchanged.

# Keep internal storage rows out of normal asset catalog.
old='  for(const r of data){\n    const a=bySymbol.get(r.symbol);'
if old in s:
    s=s.replace(old,'  for(const r of data){\n    if(String(r.symbol||"").startsWith("T5SYS")) continue;\n    const a=bySymbol.get(r.symbol);',1)

marker='/* ===== V50 · Top 500 compartido, automático y persistente ===== */'
if marker not in s:
    patch=r'''
<script>
/* ===== V50 · Top 500 compartido, automático y persistente ===== */
(function(){
  const API="https://inversor-facil-mailer.onrender.com";
  let publishTimer=null;
  let publishing=false;
  let loading=false;
  let lastFingerprint="";
  let lastCloudAt=0;

  function isAdmin(){
    try{return typeof v27IsAdmin==="function" && v27IsAdmin();}catch(e){return false;}
  }

  async function authHeaders(){
    const {data,error}=await v24Supabase.auth.getSession();
    if(error||!data?.session?.access_token) throw new Error("No hay sesión válida de Supabase.");
    return {"Content-Type":"application/json","Authorization":"Bearer "+data.session.access_token};
  }

  function normalize(d){
    const universe=Array.isArray(d?.universe)?d.universe.slice(0,500):[];
    return {
      version:50,
      target:Number(d?.target)||500,
      universe,
      metrics:(d?.metrics&&typeof d.metrics==="object")?d.metrics:{},
      lastUniverseLoad:d?.lastUniverseLoad||null,
      lastAnalysis:d?.lastAnalysis||null
    };
  }

  function fingerprint(snap){
    const analyzed=snap.universe.reduce((n,x)=>n+(Number.isFinite(Number(snap.metrics?.[x.symbol]?.price))?1:0),0);
    return [snap.lastAnalysis||"",snap.universe.length,analyzed].join("|");
  }

  function paintSync(text,kind=""){
    const el=document.getElementById("v48Top500PersistentStatus");
    if(!el)return;
    el.dataset.v50sync=text;
    el.title=text;
    if(kind==="error" && !el.textContent.includes("Top 500")) el.textContent=text;
  }

  async function publishNow(data){
    if(publishing||!isAdmin())return false;
    const snap=normalize(data||top500Load());
    if(!snap.universe.length)return false;
    const fp=fingerprint(snap);
    if(fp===lastFingerprint)return true;
    publishing=true;
    try{
      const headers=await authHeaders();
      const r=await fetch(API+"/api/top500-shared",{
        method:"POST",headers,body:JSON.stringify({snapshot:snap})
      });
      const j=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(j.error||("HTTP "+r.status));
      lastFingerprint=fp;
      lastCloudAt=Date.now();
      paintSync(`Top 500 sincronizado: ${j.universe||snap.universe.length} universo · ${j.analyzed??0} analizadas · ${new Date(j.published_at||Date.now()).toLocaleString("es-MX")}`);
      console.info("V50 Top500 publicado",j);
      return true;
    }catch(e){
      console.error("V50 publicación Top500 falló",e);
      paintSync("No se pudo sincronizar Top 500: "+e.message,"error");
      return false;
    }finally{publishing=false;}
  }

  async function loadShared(force=false){
    if(loading)return false;
    loading=true;
    try{
      const headers=await authHeaders();
      const r=await fetch(API+"/api/top500-shared",{headers,cache:"no-store"});
      const j=await r.json().catch(()=>({}));
      if(r.status===404){paintSync("Aún no existe un Top 500 publicado por el administrador.");return false;}
      if(!r.ok)throw new Error(j.error||("HTTP "+r.status));
      const snap=j.snapshot||{};
      if(!Array.isArray(snap.universe)||!snap.universe.length)throw new Error("Snapshot compartido vacío.");
      const cloudTime=Date.parse(snap.lastAnalysis||snap.publishedAt||j.stats?.updated_at||0)||0;
      const local=top500Load();
      const localTime=Date.parse(local.lastAnalysis||0)||0;
      const shouldApply=force || !isAdmin() || !local.universe.length || cloudTime>localTime;
      if(shouldApply){
        localStorage.setItem(TOP500_KEY,JSON.stringify({
          target:Number(snap.target)||500,
          universe:snap.universe.slice(0,500),
          metrics:snap.metrics||{},
          lastUniverseLoad:snap.lastUniverseLoad||null,
          lastAnalysis:snap.lastAnalysis||null
        }));
        renderTop500();
        if(typeof window.v32Paginate==="function")window.v32Paginate();
      }
      lastCloudAt=Date.now();
      const st=j.stats||{};
      paintSync(`Top 500 compartido: ${st.universe||snap.universe.length} universo · ${st.analyzed??0} analizadas · actualizado ${new Date(st.updated_at||snap.publishedAt||Date.now()).toLocaleString("es-MX")}`);
      return true;
    }catch(e){
      console.error("V50 carga Top500 falló",e);
      paintSync("Top 500 usando copia local; sincronización pendiente: "+e.message,"error");
      return false;
    }finally{loading=false;}
  }

  window.v50ScheduleTop500Publish=function(d){
    if(!isAdmin())return;
    clearTimeout(publishTimer);
    publishTimer=setTimeout(()=>publishNow(d||top500Load()),12000);
  };
  window.v50PublishTop500Shared=()=>publishNow(top500Load());
  window.v50LoadTop500Shared=(force=false)=>loadShared(force);

  async function boot(){
    for(let i=0;i<16;i++){
      await new Promise(r=>setTimeout(r,400));
      try{
        const {data}=await v24Supabase.auth.getSession();
        if(data?.session?.access_token)break;
      }catch(e){}
    }
    if(isAdmin())await publishNow(top500Load());
    await loadShared(false);
  }

  document.addEventListener("DOMContentLoaded",()=>setTimeout(boot,700));
  document.addEventListener("click",e=>{
    const b=e.target.closest?.('[data-tab="top500"],[data-v26-tab="top500"],[data-v44-tab="top500"]');
    if(b)setTimeout(()=>loadShared(true),120);
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible" && Date.now()-lastCloudAt>60000)loadShared(false);
  });
  window.addEventListener("focus",()=>{
    if(Date.now()-lastCloudAt>60000)loadShared(false);
  });
  setInterval(()=>loadShared(false),120000);
})();
</script>
'''
    if '</body>' not in s:
        raise SystemExit('No se encontro </body>')
    s=s.replace('</body>',patch+'\n</body>',1)

p.write_text(s,encoding='utf-8')

checks={
    'V50 marker':s.count(marker)==1,
    'V49 removed':v49_marker not in s,
    'V50 save hook':'v50ScheduleTop500Publish' in s,
    'system rows filtered':'startsWith("T5SYS")' in s,
    'Top500 API':'/api/top500-shared' in s,
    'mobile Top500':'data-v26-tab="top500"' in s,
    'desktop Top500':'data-tab="top500"' in s,
}
for k,v in checks.items():
    print(('PASS' if v else 'FAIL'),k)
if not all(checks.values()):
    raise SystemExit('Fallo una prueba estructural')
