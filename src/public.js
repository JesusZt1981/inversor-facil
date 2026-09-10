'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const express=require('express');
const {createClient}=require('@supabase/supabase-js');

const PUBLIC_PORT=Number(process.env.PORT||10000);
const CORE_PORT=PUBLIC_PORT+1;
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const BREVO_API_KEY=process.env.BREVO_API_KEY||'';
const SENDER_EMAIL=process.env.BREVO_SENDER_EMAIL||process.env.MAIL_FROM||'';
const SENDER_NAME=process.env.BREVO_SENDER_NAME||'Mis finanzas';
const APP_URL=process.env.APP_PUBLIC_URL||'https://mis-finanzas-7hyw.onrender.com';
const cooldown=new Map();

const admin=()=>createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const hash=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
const text=(v,n=200)=>String(v||'').trim().slice(0,n);

async function sendBrevo(to,subject,htmlContent){
  if(!BREVO_API_KEY||!SENDER_EMAIL)throw new Error('Brevo no configurado');
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{
    method:'POST',
    headers:{'content-type':'application/json','api-key':BREVO_API_KEY},
    body:JSON.stringify({sender:{name:SENDER_NAME,email:SENDER_EMAIL},to:[{email:to}],subject,htmlContent})
  });
  const body=await r.text();
  if(!r.ok)throw new Error(`Brevo ${r.status}: ${body.slice(0,200)}`);
}

async function findUserByEmail(db,email){
  for(let page=1;page<=20;page++){
    const {data,error}=await db.auth.admin.listUsers({page,perPage:100});
    if(error)throw error;
    const found=(data?.users||[]).find(u=>String(u.email||'').toLowerCase()===email);
    if(found)return found;
    if((data?.users||[]).length<100)break;
  }
  return null;
}

const child=spawn(process.execPath,['src/combined.js'],{
  stdio:'inherit',
  env:{...process.env,PORT:String(CORE_PORT),APP_PUBLIC_URL:APP_URL}
});
child.on('exit',code=>{console.error('Mis finanzas core exited',code);process.exit(code||1)});

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'10mb'}));

app.post('/api/auth/signup',async(req,res)=>{
  const email=text(req.body?.email).toLowerCase();
  const password=String(req.body?.password||'');
  if(!email.includes('@')||password.length<8)return res.status(400).json({error:'Usa un correo válido y una contraseña de al menos 8 caracteres.'});
  try{
    const db=admin();
    const existing=await findUserByEmail(db,email);
    if(existing)return res.status(400).json({error:'Ese correo ya tiene una cuenta. Usa “¿Olvidaste tu contraseña?” para entrar.'});
    const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:false});
    if(error)throw error;
    const user=data.user;
    const token=crypto.randomBytes(32).toString('base64url');
    const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    const {error:tokenError}=await db.from('finance_email_confirmations').insert({user_id:user.id,token_hash:hash(token),expires_at:expiresAt});
    if(tokenError){await db.auth.admin.deleteUser(user.id);throw tokenError}
    await db.from('user_settings').upsert({user_id:user.id,notification_email:email,email_notifications:true},{onConflict:'user_id'});
    const link=`${APP_URL}/?confirm_token=${encodeURIComponent(token)}`;
    const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>Confirma tu cuenta</h2><p>Confirma tu correo para activar tu cuenta de <b>Mis finanzas</b>.</p><p><a href="${link}" style="display:inline-block;background:#3568f5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Confirmar mi cuenta</a></p><p style="font-size:13px;color:#64748b">Este enlace vence en 24 horas.</p></div>`;
    try{await sendBrevo(email,'Confirma tu cuenta - Mis finanzas',html)}catch(e){await db.auth.admin.deleteUser(user.id);throw e}
    console.log('MIS FINANZAS SIGNUP EMAIL SENT',email);
    res.json({ok:true,needs_confirmation:true,email});
  }catch(e){
    console.error('MIS FINANZAS SIGNUP ERROR',e.message);
    res.status(500).json({error:'No se pudo crear la cuenta o enviar el correo. Intenta nuevamente.'});
  }
});

app.post('/api/auth/confirm-email',async(req,res)=>{
  const token=String(req.body?.token||'');
  if(!token)return res.status(400).json({error:'Enlace de confirmación inválido.'});
  try{
    const db=admin();
    const {data:row,error}=await db.from('finance_email_confirmations').select('id,user_id,expires_at,used_at').eq('token_hash',hash(token)).maybeSingle();
    if(error)throw error;
    if(!row||row.used_at||new Date(row.expires_at).getTime()<Date.now())return res.status(400).json({error:'El enlace de confirmación no es válido o expiró.'});
    const {error:updateError}=await db.auth.admin.updateUserById(row.user_id,{email_confirm:true});
    if(updateError)throw updateError;
    await db.from('finance_email_confirmations').update({used_at:new Date().toISOString()}).eq('id',row.id);
    res.json({ok:true});
  }catch(e){
    console.error('MIS FINANZAS CONFIRM ERROR',e.message);
    res.status(500).json({error:'No se pudo confirmar la cuenta.'});
  }
});

app.post('/api/auth/forgot',async(req,res)=>{
  const email=text(req.body?.email).toLowerCase();
  if(!email.includes('@'))return res.status(400).json({error:'Escribe un correo válido.'});
  const generic={ok:true,message:'Si la cuenta existe, recibirás un correo para cambiar la contraseña.'};
  const key=`${req.ip}|${email}`,now=Date.now();
  if(now-(cooldown.get(key)||0)<60000)return res.json(generic);
  cooldown.set(key,now);
  try{
    const db=admin();
    const user=await findUserByEmail(db,email);
    if(user){
      const token=crypto.randomBytes(32).toString('base64url');
      const expiresAt=new Date(Date.now()+30*60*1000).toISOString();
      await db.from('finance_password_resets').delete().eq('user_id',user.id).is('used_at',null);
      const {error:insertError}=await db.from('finance_password_resets').insert({user_id:user.id,token_hash:hash(token),expires_at:expiresAt});
      if(insertError)throw insertError;
      const link=`${APP_URL}/?reset_token=${encodeURIComponent(token)}`;
      const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>Recupera tu contraseña</h2><p>Recibimos una solicitud para cambiar la contraseña de tu cuenta de <b>Mis finanzas</b>.</p><p><a href="${link}" style="display:inline-block;background:#3568f5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Cambiar contraseña</a></p><p style="font-size:13px;color:#64748b">Este enlace vence en 30 minutos.</p></div>`;
      await sendBrevo(email,'Recupera tu contraseña - Mis finanzas',html);
      console.log('MIS FINANZAS PASSWORD RESET SENT',email);
    }
    res.json(generic);
  }catch(e){
    console.error('MIS FINANZAS PASSWORD RESET ERROR',e.message);
    res.status(500).json({error:'No se pudo enviar el correo de recuperación. Intenta nuevamente.'});
  }
});

app.post('/api/auth/reset-password',async(req,res)=>{
  const token=String(req.body?.token||'');
  const password=String(req.body?.password||'');
  if(!token)return res.status(400).json({error:'El enlace de recuperación no es válido o expiró.'});
  if(password.length<8)return res.status(400).json({error:'La nueva contraseña debe tener al menos 8 caracteres.'});
  try{
    const db=admin();
    const {data:row,error}=await db.from('finance_password_resets').select('id,user_id,expires_at,used_at').eq('token_hash',hash(token)).maybeSingle();
    if(error)throw error;
    if(!row||row.used_at||new Date(row.expires_at).getTime()<Date.now())return res.status(400).json({error:'El enlace de recuperación no es válido o expiró.'});
    const {error:updateError}=await db.auth.admin.updateUserById(row.user_id,{password,email_confirm:true});
    if(updateError)throw updateError;
    await db.from('finance_password_resets').update({used_at:new Date().toISOString()}).eq('id',row.id);
    res.json({ok:true});
  }catch(e){
    console.error('MIS FINANZAS PASSWORD UPDATE ERROR',e.message);
    res.status(500).json({error:'No se pudo actualizar la contraseña.'});
  }
});

app.use((req,res)=>{
  const headers={...req.headers,host:`127.0.0.1:${CORE_PORT}`};
  delete headers['content-length'];
  delete headers['transfer-encoding'];

  let body=Buffer.alloc(0);
  if(req.body!==undefined && req.method!=='GET' && req.method!=='HEAD'){
    body=Buffer.from(JSON.stringify(req.body));
    headers['content-type']='application/json';
    headers['content-length']=String(body.length);
  }

  const p=http.request({hostname:'127.0.0.1',port:CORE_PORT,path:req.originalUrl,method:req.method,headers},up=>{
    res.writeHead(up.statusCode||502,up.headers);
    up.pipe(res);
  });
  p.on('error',e=>res.status(502).json({error:'Aplicación interna no disponible',detail:e.message}));
  if(body.length)p.write(body);
  p.end();
});

app.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log(`Mis finanzas público listo en ${PUBLIC_PORT} · ${APP_URL}`));
