'use strict';
(()=>{
  const qs=s=>document.querySelector(s);
  document.title='Mis finanzas';
  document.querySelectorAll('h1').forEach(h=>{if(h.textContent.trim()==='Mis Finanzas'||h.textContent.trim()==='Mis finanzas')h.textContent='Mis finanzas'});
  const api=async(url,opt={})=>{const r=await fetch(url,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Ocurrió un error');return d};
  const toast=(msg,error=false)=>{const t=qs('#toast');if(!t)return alert(msg);t.textContent=msg;t.className='toast show'+(error?' error':'');setTimeout(()=>t.className='toast',4200)};

  const signup=qs('#signupBtn');
  if(signup&&!qs('#forgotPasswordBtn')){
    const b=document.createElement('button');
    b.type='button';
    b.id='forgotPasswordBtn';
    b.className='btn ghost';
    b.style.marginTop='8px';
    b.textContent='¿Olvidaste tu contraseña?';
    signup.insertAdjacentElement('afterend',b);
    b.onclick=async()=>{
      const email=String(qs('#authEmail')?.value||'').trim();
      if(!email.includes('@'))return toast('Escribe primero tu correo electrónico.',true);
      b.disabled=true;const old=b.textContent;b.textContent='Enviando...';
      try{const d=await api('/api/auth/forgot',{method:'POST',body:JSON.stringify({email})});toast(d.message||'Revisa tu correo para cambiar la contraseña.')}catch(e){toast(e.message,true)}finally{b.disabled=false;b.textContent=old}
    };
  }

  const params=new URLSearchParams(location.search);
  const confirmToken=params.get('confirm_token');
  if(confirmToken){
    (async()=>{
      try{
        await api('/api/auth/confirm-email',{method:'POST',body:JSON.stringify({token:confirmToken})});
        const clean=new URL(location.href);clean.searchParams.delete('confirm_token');history.replaceState(null,'',clean.pathname+(clean.search||''));
        toast('Cuenta confirmada. Ya puedes iniciar sesión.');
      }catch(e){toast(e.message,true)}
    })();
  }

  const token=params.get('reset_token');
  if(!token)return;
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(15,23,42,.55);display:grid;place-items:center;z-index:9999;padding:20px';
  overlay.innerHTML='<div style="width:min(420px,100%);background:#fff;border-radius:22px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.2);font-family:inherit"><h2 style="margin:0 0 8px">Nueva contraseña</h2><p style="margin:0 0 18px;color:#64748b">Escribe una contraseña nueva para tu cuenta de Mis finanzas.</p><label style="display:block;font-weight:700">Nueva contraseña<input id="newRecoveryPassword" type="password" minlength="8" placeholder="Mínimo 8 caracteres" style="display:block;width:100%;box-sizing:border-box;margin-top:7px;padding:13px;border:1px solid #cbd5e1;border-radius:12px"></label><button id="saveRecoveryPassword" type="button" style="width:100%;margin-top:16px;padding:13px;border:0;border-radius:12px;background:#3568f5;color:#fff;font-weight:800;cursor:pointer">Guardar contraseña</button></div>';
  document.body.appendChild(overlay);
  const btn=overlay.querySelector('#saveRecoveryPassword');
  btn.onclick=async()=>{
    const password=overlay.querySelector('#newRecoveryPassword').value;
    if(password.length<8)return toast('La contraseña debe tener al menos 8 caracteres.',true);
    btn.disabled=true;btn.textContent='Guardando...';
    try{
      await api('/api/auth/reset-password',{method:'POST',body:JSON.stringify({token,password})});
      const clean=new URL(location.href);clean.searchParams.delete('reset_token');history.replaceState(null,'',clean.pathname+(clean.search||''));
      overlay.remove();toast('Contraseña actualizada. Ya puedes iniciar sesión.');
      const p=qs('#authPassword');if(p){p.value='';p.focus()}
    }catch(e){toast(e.message,true);btn.disabled=false;btn.textContent='Guardar contraseña'}
  };
})();
