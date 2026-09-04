from pathlib import Path

p = Path('index.html')
text = p.read_text(encoding='utf-8')
original = text


def replace_once(old: str, new: str, label: str, required: bool = True):
    global text
    if new in text:
        print(f'[ok] {label}: ya aplicado')
        return
    count = text.count(old)
    if count != 1:
        msg = f'{label}: se esperaba 1 coincidencia y hubo {count}'
        if required:
            raise RuntimeError(msg)
        print('[warn]', msg)
        return
    text = text.replace(old, new, 1)
    print(f'[ok] {label}')


# 1) Recursos V51 externos.
if 'assets/v51-performance.css' not in text:
    if '</head>' not in text:
        raise RuntimeError('No se encontró </head>')
    text = text.replace(
        '</head>',
        '<link rel="stylesheet" href="assets/v51-performance.css?v=51">\n</head>',
        1,
    )
    print('[ok] CSS V51 enlazado')

if 'assets/v51-sync-engine.js' not in text:
    if '</body>' not in text:
        raise RuntimeError('No se encontró </body>')
    text = text.replace(
        '</body>',
        '<script src="assets/v51-sync-engine.js?v=51"></script>\n</body>',
        1,
    )
    print('[ok] JS V51 enlazado')

# 2) Catálogo: actualizar los datos completos, pero renderizar sólo la sección visible.
replace_once(
    '  try{renderExplore();render();}catch(e){}',
    '  try{if(typeof window.v51RenderVisible==="function")window.v51RenderVisible("catalog");else{renderExplore();render();}}catch(e){}',
    'render selectivo del catálogo',
)

# 3) V30: conserva layout/permisos, elimina su reloj de sincronización duplicado.
replace_once(
    'setInterval(()=>sync(false),300000);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")sync(false)});addEventListener("focus",()=>sync(false));',
    '/* V51: sincronización V30 delegada al motor central */',
    'reloj V30 desactivado',
)

# 4) V40: conserva la función por compatibilidad, pero el motor V51 decide cuándo ejecutarla.
replace_once(
    '  setInterval(v40SyncSharedCatalog,60000);\n  window.addEventListener("focus",v40SyncSharedCatalog);',
    '  window.v51LegacyCatalogSync=v40SyncSharedCatalog;\n  /* V51: sin interval/focus duplicados; el motor central programa el catálogo. */',
    'reloj V40 desactivado',
)

# 5) V50: conserva boot, publicación y carga compartida; elimina los relojes paralelos.
replace_once(
    '  document.addEventListener("visibilitychange",()=>{\n    if(document.visibilityState==="visible" && Date.now()-lastCloudAt>60000)loadShared(false);\n  });\n  window.addEventListener("focus",()=>{\n    if(Date.now()-lastCloudAt>60000)loadShared(false);\n  });\n  setInterval(()=>loadShared(false),120000);',
    '  window.v51LoadSharedTop500=loadShared;\n  /* V51: visibility/focus/interval del Top 500 quedan a cargo del motor central. */',
    'reloj V50 desactivado',
)

# 6) Trading: mantiene exactamente el escaneo y el botón manual; sólo elimina el timer autónomo.
replace_once(
    'LIVE.timer=setInterval(scan,300000)',
    'LIVE.timer=null',
    'reloj V47 Trading delegado',
)

# 7) V32: el observer ya no vigila TODO document.body ni el Top500.
replace_once(
    "['assetGrid','radarResults','top500Rows'].forEach",
    "['assetGrid','radarResults'].forEach",
    'Top500 retirado de paginación V32',
)
replace_once(
    'o.observe(document.body,{subtree:true,childList:true});setTimeout(apply,600)',
    "['assetGrid','radarResults','marketHistoryContent'].forEach(id=>{const e=document.getElementById(id);if(e)o.observe(e,{subtree:true,childList:true})});setTimeout(apply,600)",
    'MutationObserver acotado',
)

# 8) Top500: datos completos, pero sólo 30 filas DOM por página.
if 'window.v51Top500Page=window.v51Top500Page||1;' not in text:
    marker = 'function renderTop500(){'
    if text.count(marker) != 1:
        raise RuntimeError(f'renderTop500: se esperaba 1 función y hubo {text.count(marker)}')
    text = text.replace(marker, 'window.v51Top500Page=window.v51Top500Page||1;\n\n' + marker, 1)
    print('[ok] estado de página Top500 agregado')

replace_once(
    '  rows=rows.slice(0,500);',
    '''  rows=rows.slice(0,500);\n  const pageSize=30;\n  const pages=Math.max(1,Math.ceil(rows.length/pageSize));\n  if(!Number.isFinite(Number(window.v51Top500Page))||window.v51Top500Page<1)window.v51Top500Page=1;\n  if(window.v51Top500Page>pages)window.v51Top500Page=pages;\n  const start=(window.v51Top500Page-1)*pageSize;\n  const pageRows=rows.slice(start,start+pageSize);''',
    'slice real Top500',
)

replace_once(
    '    $("top500Rows").innerHTML=\'<tr><td colspan="14" class="empty">Carga el universo y ejecuta el análisis para generar la clasificación.</td></tr>\';\n    return;',
    '    $("top500Rows").innerHTML=\'<tr><td colspan="14" class="empty">Carga el universo y ejecuta el análisis para generar la clasificación.</td></tr>\';\n    document.getElementById("v51Top500Pagination")?.remove();\n    return;',
    'estado vacío Top500',
)

replace_once(
    '  $("top500Rows").innerHTML=rows.map((r,i)=>{',
    '  $("top500Rows").innerHTML=pageRows.map((r,i)=>{',
    'render de 30 filas Top500',
)

replace_once(
    '      <td><span class="rank-badge">${i+1}</span></td>',
    '      <td><span class="rank-badge">${start+i+1}</span></td>',
    'ranking absoluto Top500',
)

pagination_anchor = '  document.querySelectorAll(".top500Add").forEach(b=>{'
if 'id="v51Top500Pagination"' not in text:
    if text.count(pagination_anchor) != 1:
        raise RuntimeError(f'ancla paginación: hubo {text.count(pagination_anchor)} coincidencias')
    pagination_code = '''  const top500Host=$("top500Rows").closest(".top500-table-wrap")||$("top500Rows").closest(".table-wrap")||$("top500Rows").closest("table");\n  let top500Nav=document.getElementById("v51Top500Pagination");\n  if(!top500Nav){\n    top500Nav=document.createElement("div");\n    top500Nav.id="v51Top500Pagination";\n    top500Nav.className="v51-pagination";\n    (top500Host||$("top500Rows")).insertAdjacentElement("afterend",top500Nav);\n  }\n  const lo=Math.max(1,window.v51Top500Page-2),hi=Math.min(pages,lo+4);\n  let navHtml='<button type="button" data-v51-page="prev">‹</button>';\n  if(lo>1)navHtml+='<button type="button" data-v51-page="1">1</button>'+(lo>2?'<span>…</span>':'');\n  for(let n=lo;n<=hi;n++)navHtml+=`<button type="button" data-v51-page="${n}" class="${n===window.v51Top500Page?'active':''}">${n}</button>`;\n  if(hi<pages)navHtml+=(hi<pages-1?'<span>…</span>':'')+`<button type="button" data-v51-page="${pages}">${pages}</button>`;\n  navHtml+='<button type="button" data-v51-page="next">›</button>'+`<span class="v51-page-info">${rows.length} resultados · 30 por página</span>`;\n  top500Nav.innerHTML=navHtml;\n  top500Nav.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{\n    const p=b.dataset.v51Page;\n    window.v51Top500Page=p==="prev"?Math.max(1,window.v51Top500Page-1):p==="next"?Math.min(pages,window.v51Top500Page+1):Number(p);\n    renderTop500();\n    top500Host?.scrollIntoView({behavior:"smooth",block:"start"});\n  }));\n\n'''
    text = text.replace(pagination_anchor, pagination_code + pagination_anchor, 1)
    print('[ok] controles de paginación Top500 agregados')

replace_once(
    '$("top500Sort")?.addEventListener("input",renderTop500);',
    '$("top500Sort")?.addEventListener("input",()=>{window.v51Top500Page=1;renderTop500();});',
    'reset página al ordenar Top500',
)

# 9) Fondo Canvas: sigue existiendo, pero baja frecuencia en móvil y casi se pausa oculto.
canvas_old = 'requestAnimationFrame(draw)}requestAnimationFrame(draw)})();\n\n// ===== V26 · Música original de concentración ====='
canvas_new = 'if(document.hidden){setTimeout(()=>requestAnimationFrame(draw),900)}else if(matchMedia("(max-width:760px)").matches){setTimeout(()=>requestAnimationFrame(draw),66)}else requestAnimationFrame(draw)}requestAnimationFrame(draw)})();\n\n// ===== V26 · Música original de concentración ====='
replace_once(canvas_old, canvas_new, 'throttle Canvas móvil/oculto', required=False)

# 10) Versión visible para diagnóstico.
text = text.replace(
    '<title>Inversor Fácil V31 · Listas + Ranking Inteligente</title>',
    '<title>Inversor Fácil V51 · Sincronización ordenada</title>',
    1,
)

if text == original:
    print('Sin cambios: V51 ya estaba aplicado.')
else:
    p.write_text(text, encoding='utf-8')
    print('V51 aplicado. Bytes:', len(text.encode('utf-8')))
