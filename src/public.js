'use strict';
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const express=require('express');
const {createClient}=require('@supabase/supabase-js');

const PUBLIC_PORT=Number(process.env.PORT||10000);
const CORE_PORT=PUBLIC_PORT+1;
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const BREVO_API_KEY=process.env.BREVO_API_KEY||'';
const SENDER_EMAIL=process.env.BREVO_SENDER_EMAIL||process.env.MAIL_FROM||'';
const SENDER_NAME=process.env.BREVO_SENDER_NAME||process.env.MAIL_FROM_NAME||'Mis finanzas';
const APP_URL=process.env.APP_PUBLIC_URL||'https://mis-finanzas-7hyw.onrender.com';

const authClient=()=>createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const userClient=token=>createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
const adminClient=()=>createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const cookies=req=>Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim()).filter(Boolean).map(x=>{const i=x.indexOf('=');return[decodeURIComponent(x.slice(0,i)),decodeURIComponent(x.slice(i+1))]}));
const cookieOpts=s=>`HttpOnly; Path=/; SameSite=Lax; Max-Age=${s}; ${process.env.NODE_ENV==='production'?'Secure;':''}`;
function setSession(res,s){res.append('Set-Cookie',`fin_access=${encodeURIComponent(s.access_token)}; ${cookieOpts(Math.max(60,s.expires_in||3600))}`);res.append('Set-Cookie',`fin_refresh=${encodeURIComponent(s.refresh_token)}; ${cookieOpts(2592000)}`)}

async function apiUser(req,res){const c=cookies(req);let access=c.fin_access;if(access){const {data,error}=await authClient().auth.getUser(access);if(!error&&data.user)return {user:data.user,access}}if(c.fin_refresh){const {data,error}=await authClient().auth.refreshSession({refresh_token:c.fin_refresh});if(!error&&data.session){setSession(res,data.session);return {user:data.user,access:data.session.access_token}}}return null}
async function requireApiUser(req,res,next){try{const a=await apiUser(req,res);if(!a)return res.status(401).json({error:'Sesión vencida. Inicia sesión nuevamente.'});req.apiUser=a.user;req.apiAccess=a.access;req.apiDb=userClient(a.access);next()}catch(e){res.status(401).json({error:'No fue posible validar la sesión.'})}}

const text=(v,n=200)=>String(v||'').trim().slice(0,n);
const hash=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
const money=v=>{const n=Number(v);if(!Number.isFinite(n)||n<=0)throw new Error('Importe inválido');return Math.round(n*100)/100};
const validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''))?String(v):null;
const signupCooldown=new Map();
const resetCooldown=new Map();

function requireAdminConfig(){if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)throw new Error('Supabase admin no configurado');}
async function sendBrevo(to,subject,htmlContent){
  if(!BREVO_API_KEY||!SENDER_EMAIL)throw new Error('Correo transaccional no configurado');
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'content-type':'application/json','api-key':BREVO_API_KEY},body:JSON.stringify({sender:{name:SENDER_NAME,email:SENDER_EMAIL},to:[{email:to}],subject,htmlContent})});
  const body=await r.text();
  if(!r.ok)throw new Error(`Brevo ${r.status}: ${body.slice(0,200)}`);
}
async function findUserByEmail(db,email){
  for(let page=1;page<=50;page++){
    const {data,error}=await db.auth.admin.listUsers({page,perPage:100});
    if(error)throw error;
    const users=data?.users||[];
    const found=users.find(u=>String(u.email||'').toLowerCase()===email);
    if(found)return found;
    if(users.length<100)break;
  }
  return null;
}

function addDays(iso,days){const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function addMonths(iso,months){const d=new Date(`${iso}T12:00:00Z`),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate();d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10)}
function nextDue(o,current){if(o.frequency==='weekly')return addDays(current,7);if(o.frequency==='biweekly')return addDays(current,14);if(o.frequency==='monthly')return addMonths(current,1);if(o.frequency==='custom')return addDays(current,Number(o.interval_days||1));return current}
function cleanSmallInts(v,min,max){return [...new Set((Array.isArray(v)?v:[]).map(Number).filter(n=>Number.isInteger(n)&&n>=min&&n<=max))]}
function obligationRow(b,userId){const kind=['debt','recurring'].includes(b.kind)?b.kind:'debt';const frequency=['weekly','biweekly','monthly','once','custom'].includes(b.frequency)?b.frequency:'monthly';const installment=money(b.installment_amount);const initial=kind==='debt'?money(b.initial_amount):null;const remaining=kind==='debt'?Math.max(0,Number(b.remaining_balance??initial)):null;if(frequency==='custom'&&(!Number.isInteger(Number(b.interval_days))||Number(b.interval_days)<1))throw new Error('Indica cada cuántos días se repite.');return {user_id:userId,concept:text(b.concept,120)||'Pago',category:text(b.category,80)||'Deudas',kind,frequency,interval_days:frequency==='custom'?Number(b.interval_days):null,initial_amount:initial,remaining_balance:remaining,installment_amount:installment,next_due_date:validDate(b.next_due_date),end_date:validDate(b.end_date),reminder_days_before:cleanSmallInts(b.reminder_days_before,0,30),reminder_weekdays:cleanSmallInts(b.reminder_weekdays,0,6),auto_record_expense:b.auto_record_expense!==false,status:['active','paused'].includes(b.status)?b.status:'active',notes:text(b.notes,500)||null,updated_at:new Date().toISOString()}}

const child=spawn(process.execPath,['src/server.js'],{stdio:'inherit',env:{...process.env,PORT:String(CORE_PORT)}});
child.on('exit',code=>{console.error('Mis finanzas core exited',code);process.exit(code||1)});

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'10mb'}));
app.get('/api/health',(_req,res)=>res.json({ok:true,app:'mis-finanzas',mode:'standalone',auth_admin:!!SUPABASE_SERVICE_ROLE_KEY,mail:!!BREVO_API_KEY&&!!SENDER_EMAIL,time:new Date().toISOString()}));

app.post('/api/auth/signup',async(req,res)=>{
  const email=text(req.body?.email,200).toLowerCase();
  const password=String(req.body?.password||'');
  if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Escribe un correo válido.'});
  if(password.length<8)return res.status(400).json({error:'La contraseña debe tener al menos 8 caracteres.'});
  const key=`${req.ip}|${email}`;
  if(Date.now()-(signupCooldown.get(key)||0)<10000)return res.status(429).json({error:'Espera unos segundos antes de volver a intentar.'});
  signupCooldown.set(key,Date.now());
  let createdUserId=null;
  try{
    requireAdminConfig();
    const db=adminClient();
    const existing=await findUserByEmail(db,email);
    if(existing)return res.status(409).json({error:existing.email_confirmed_at?'Esta cuenta ya existe. Usa Entrar o recupera tu contraseña.':'Esta cuenta ya existe y está pendiente de confirmar. Usa recuperación de contraseña si necesitas acceso.'});
    const {data,error}=await db.auth.admin.createUser({email,password,email_confirm:false});
    if(error)throw error;
    createdUserId=data.user.id;
    const token=crypto.randomBytes(32).toString('base64url');
    const expiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
    const {error:tokenError}=await db.from('finance_email_confirmations').insert({user_id:createdUserId,token_hash:hash(token),expires_at:expiresAt});
    if(tokenError)throw tokenError;
    const {error:settingsError}=await db.from('user_settings').upsert({user_id:createdUserId,notification_email:email,email_notifications:true,theme:'steel'},{onConflict:'user_id'});
    if(settingsError)throw settingsError;
    const link=`${APP_URL}/?confirm_token=${encodeURIComponent(token)}`;
    const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>Confirma tu cuenta</h2><p>Activa tu cuenta de <b>Mis finanzas</b>.</p><p><a href="${link}" style="display:inline-block;background:#0f7f8f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Confirmar mi cuenta</a></p><p style="font-size:13px;color:#64748b">Este enlace vence en 24 horas.</p></div>`;
    await sendBrevo(email,'Confirma tu cuenta - Mis finanzas',html);
    console.log('MIS FINANZAS SIGNUP SENT',email);
    return res.status(201).json({ok:true,needs_confirmation:true,email,message:'Cuenta creada. Revisa tu correo para confirmarla.'});
  }catch(e){
    console.error('MIS FINANZAS SIGNUP ERROR',e.message);
    if(createdUserId){try{await adminClient().auth.admin.deleteUser(createdUserId)}catch{}}
    return res.status(500).json({error:'No se pudo completar el registro. Intenta nuevamente en unos segundos.'});
  }
});

app.post('/api/auth/confirm-email',async(req,res)=>{
  const token=String(req.body?.token||'');
  if(!token)return res.status(400).json({error:'Enlace de confirmación inválido.'});
  try{
    requireAdminConfig();
    const db=adminClient();
    const {data:row,error}=await db.from('finance_email_confirmations').select('id,user_id,expires_at,used_at').eq('token_hash',hash(token)).maybeSingle();
    if(error)throw error;
    if(!row||row.used_at||new Date(row.expires_at).getTime()<Date.now())return res.status(400).json({error:'El enlace de confirmación no es válido o expiró.'});
    const {error:updateError}=await db.auth.admin.updateUserById(row.user_id,{email_confirm:true});
    if(updateError)throw updateError;
    await db.from('finance_email_confirmations').update({used_at:new Date().toISOString()}).eq('id',row.id);
    return res.json({ok:true,message:'Correo confirmado. Ya puedes entrar.'});
  }catch(e){
    console.error('MIS FINANZAS CONFIRM ERROR',e.message);
    return res.status(500).json({error:'No se pudo confirmar la cuenta.'});
  }
});

app.post('/api/auth/forgot',async(req,res)=>{
  const email=text(req.body?.email,200).toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email))return res.status(400).json({error:'Escribe un correo válido.'});
  const generic={ok:true,message:'Si la cuenta existe, recibirás un correo para cambiar la contraseña.'};
  const key=`${req.ip}|${email}`;
  if(Date.now()-(resetCooldown.get(key)||0)<60000)return res.json(generic);
  resetCooldown.set(key,Date.now());
  try{
    requireAdminConfig();
    const db=adminClient();
    const user=await findUserByEmail(db,email);
    if(user){
      const token=crypto.randomBytes(32).toString('base64url');
      const expiresAt=new Date(Date.now()+30*60*1000).toISOString();
      await db.from('finance_password_resets').delete().eq('user_id',user.id).is('used_at',null);
      const {error:insertError}=await db.from('finance_password_resets').insert({user_id:user.id,token_hash:hash(token),expires_at:expiresAt});
      if(insertError)throw insertError;
      const link=`${APP_URL}/?reset_token=${encodeURIComponent(token)}`;
      const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>Recupera tu contraseña</h2><p>Recibimos una solicitud para cambiar la contraseña de tu cuenta de <b>Mis finanzas</b>.</p><p><a href="${link}" style="display:inline-block;background:#0f7f8f;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Cambiar contraseña</a></p><p style="font-size:13px;color:#64748b">Este enlace vence en 30 minutos.</p></div>`;
      await sendBrevo(email,'Recupera tu contraseña - Mis finanzas',html);
      console.log('MIS FINANZAS RESET SENT',email);
    }
    return res.json(generic);
  }catch(e){
    console.error('MIS FINANZAS PASSWORD RESET ERROR',e.message);
    return res.status(500).json({error:'No se pudo enviar el correo de recuperación. Intenta nuevamente.'});
  }
});

app.post('/api/auth/reset-password',async(req,res)=>{
  const token=String(req.body?.token||'');
  const password=String(req.body?.password||'');
  if(!token)return res.status(400).json({error:'El enlace de recuperación no es válido o expiró.'});
  if(password.length<8)return res.status(400).json({error:'La nueva contraseña debe tener al menos 8 caracteres.'});
  try{
    requireAdminConfig();
    const db=adminClient();
    const {data:row,error}=await db.from('finance_password_resets').select('id,user_id,expires_at,used_at').eq('token_hash',hash(token)).maybeSingle();
    if(error)throw error;
    if(!row||row.used_at||new Date(row.expires_at).getTime()<Date.now())return res.status(400).json({error:'El enlace de recuperación no es válido o expiró.'});
    const {error:updateError}=await db.auth.admin.updateUserById(row.user_id,{password,email_confirm:true});
    if(updateError)throw updateError;
    await db.from('finance_password_resets').update({used_at:new Date().toISOString()}).eq('id',row.id);
    return res.json({ok:true,message:'Contraseña actualizada.'});
  }catch(e){
    console.error('MIS FINANZAS PASSWORD UPDATE ERROR',e.message);
    return res.status(500).json({error:'No se pudo actualizar la contraseña.'});
  }
});

app.get('/api/me',async(req,res)=>{
  try{
    const a=await apiUser(req,res);
    if(!a)return res.json({authenticated:false});
    const db=userClient(a.access);
    const {data}=await db.from('user_settings').select('*').eq('user_id',a.user.id).maybeSingle();
    return res.json({authenticated:true,user:{id:a.user.id,email:a.user.email},settings:data||{notification_email:a.user.email,email_notifications:true,theme:'steel'}});
  }catch(e){return res.json({authenticated:false})}
});

app.get('/api/theme',requireApiUser,async(req,res)=>{const {data,error}=await req.apiDb.from('user_settings').select('theme').eq('user_id',req.apiUser.id).maybeSingle();if(error)return res.status(500).json({error:error.message});res.json({theme:data?.theme||'steel'})});
app.put('/api/theme',requireApiUser,async(req,res)=>{const theme=['light','dark','graphite','olive','steel'].includes(req.body?.theme)?req.body.theme:'steel';const {data:old}=await req.apiDb.from('user_settings').select('notification_email,email_notifications').eq('user_id',req.apiUser.id).maybeSingle();const {error}=await req.apiDb.from('user_settings').upsert({user_id:req.apiUser.id,notification_email:old?.notification_email||req.apiUser.email,email_notifications:old?.email_notifications!==false,theme,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)return res.status(400).json({error:error.message});res.json({theme})});

app.get('/api/obligations',requireApiUser,async(req,res)=>{const status=req.query.status==='completed'?'completed':req.query.status==='all'?'all':'active';let q=req.apiDb.from('payment_obligations').select('*').eq('user_id',req.apiUser.id).order('next_due_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false});if(status!=='all')q=q.eq('status',status);const {data,error}=await q;if(error)return res.status(500).json({error:error.message});res.json(data||[])});
app.post('/api/obligations',requireApiUser,async(req,res)=>{try{const row=obligationRow(req.body,req.apiUser.id);const {data,error}=await req.apiDb.from('payment_obligations').insert(row).select('*').single();if(error)throw error;res.json(data)}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/obligations/:id',requireApiUser,async(req,res)=>{try{const {data:old,error:o}=await req.apiDb.from('payment_obligations').select('*').eq('id',req.params.id).eq('user_id',req.apiUser.id).maybeSingle();if(o)throw o;if(!old)return res.status(404).json({error:'Pago no encontrado'});const row=obligationRow({...old,...req.body,remaining_balance:req.body.remaining_balance??old.remaining_balance},req.apiUser.id);delete row.user_id;const {data,error}=await req.apiDb.from('payment_obligations').update(row).eq('id',old.id).eq('user_id',req.apiUser.id).select('*').single();if(error)throw error;res.json(data)}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/obligations/:id',requireApiUser,async(req,res)=>{const {error}=await req.apiDb.from('payment_obligations').delete().eq('id',req.params.id).eq('user_id',req.apiUser.id);if(error)return res.status(400).json({error:error.message});res.json({ok:true})});
app.get('/api/obligations/:id/payments',requireApiUser,async(req,res)=>{const {data:o}=await req.apiDb.from('payment_obligations').select('id').eq('id',req.params.id).eq('user_id',req.apiUser.id).maybeSingle();if(!o)return res.status(404).json({error:'Pago no encontrado'});const {data,error}=await req.apiDb.from('obligation_payments').select('*').eq('obligation_id',o.id).eq('user_id',req.apiUser.id).order('payment_date',{ascending:false});if(error)return res.status(500).json({error:error.message});res.json(data||[])});
app.post('/api/obligations/:id/pay',requireApiUser,async(req,res)=>{try{const db=req.apiDb,paid=money(req.body.amount),paymentDate=validDate(req.body.payment_date)||new Date().toISOString().slice(0,10),method=['cash','debit','transfer'].includes(req.body.payment_method)?req.body.payment_method:'transfer';const {data:o,error:oErr}=await db.from('payment_obligations').select('*').eq('id',req.params.id).eq('user_id',req.apiUser.id).eq('status','active').maybeSingle();if(oErr)throw oErr;if(!o)return res.status(404).json({error:'El pago ya no está activo.'});let balanceAfter=o.kind==='debt'?Math.max(0,Number(o.remaining_balance||0)-paid):null;const shouldAdvance=o.frequency!=='once'&&(paid+.005>=Number(o.installment_amount||0)||balanceAfter===0);const due=o.next_due_date||paymentDate;let next=o.next_due_date,status='active',completedAt=null;if(o.kind==='debt'&&balanceAfter<=.005){balanceAfter=0;status='completed';completedAt=new Date().toISOString();next=null}else if(o.frequency==='once'&&paid+.005>=Number(o.installment_amount||0)){status=o.kind==='recurring'?'completed':status;completedAt=status==='completed'?new Date().toISOString():null;next=status==='completed'?null:next}else if(shouldAdvance&&o.next_due_date)next=nextDue(o,o.next_due_date);let transactionId=null;if(o.auto_record_expense){const {data:t,error:tErr}=await db.from('transactions').insert({user_id:req.apiUser.id,transaction_date:paymentDate,type:'expense',description:o.concept,category:o.category||'Deudas',amount:paid,payment_method:method,card_id:null,notes:`Pago programado${o.kind==='debt'?' · saldo restante '+balanceAfter.toFixed(2):''}`,obligation_id:o.id}).select('id').single();if(tErr)throw tErr;transactionId=t.id}const {data:p,error:pErr}=await db.from('obligation_payments').insert({user_id:req.apiUser.id,obligation_id:o.id,due_date:due,payment_date:paymentDate,amount:paid,balance_after:balanceAfter,transaction_id:transactionId,notes:text(req.body.notes,300)||null}).select('*').single();if(pErr)throw pErr;const {data:updated,error:uErr}=await db.from('payment_obligations').update({remaining_balance:balanceAfter,next_due_date:next,status,completed_at:completedAt,updated_at:new Date().toISOString()}).eq('id',o.id).eq('user_id',req.apiUser.id).select('*').single();if(uErr)throw uErr;res.json({obligation:updated,payment:p,completed:status==='completed'})}catch(e){console.error('OBLIGATION PAY ERROR',e.message);res.status(400).json({error:e.message})}});

app.use((req,res)=>{const headers={...req.headers,host:`127.0.0.1:${CORE_PORT}`};delete headers['content-length'];delete headers['transfer-encoding'];let body=Buffer.alloc(0);if(req.body!==undefined&&req.method!=='GET'&&req.method!=='HEAD'){body=Buffer.from(JSON.stringify(req.body));headers['content-type']='application/json';headers['content-length']=String(body.length)}const p=http.request({hostname:'127.0.0.1',port:CORE_PORT,path:req.originalUrl,method:req.method,headers,timeout:8000},up=>{res.writeHead(up.statusCode||502,up.headers);up.pipe(res)});p.on('timeout',()=>p.destroy(new Error('Timeout interno')));p.on('error',e=>res.status(502).json({error:'Aplicación interna no disponible',detail:e.message}));if(body.length)p.write(body);p.end()});

app.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log(`Mis finanzas standalone listo en ${PUBLIC_PORT} · auth admin=${!!SUPABASE_SERVICE_ROLE_KEY} · mail=${!!BREVO_API_KEY&&!!SENDER_EMAIL}`));
