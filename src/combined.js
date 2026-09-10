'use strict';
const http=require('node:http');
const path=require('node:path');
const {spawn}=require('node:child_process');
const express=require('express');
const {createClient}=require('@supabase/supabase-js');
const {runReminders}=require('./reminderRunner');

const PUBLIC_PORT=Number(process.env.PORT||10000);
const APP_PORT=PUBLIC_PORT+1;
const MAIL_TOKEN=process.env.FINANCE_MAIL_TOKEN||'';
const BREVO_API_KEY=process.env.BREVO_API_KEY||'';
const SENDER_EMAIL=process.env.BREVO_SENDER_EMAIL||process.env.MAIL_FROM||'';
const SENDER_NAME=process.env.BREVO_SENDER_NAME||'Mis Finanzas';
const CRON_SECRET=process.env.CRON_SECRET||'';
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const APP_URL='https://finanzas-mama.onrender.com';
let lastScheduledRun=0;
const resetCooldown=new Map();

const admin=()=>createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const asToken=t=>createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${t}`}}});

async function sendBrevo(to,subject,htmlContent){
  if(!BREVO_API_KEY||!SENDER_EMAIL)throw new Error('Brevo no configurado');
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{
    method:'POST',
    headers:{'content-type':'application/json','api-key':BREVO_API_KEY},
    body:JSON.stringify({sender:{name:SENDER_NAME,email:SENDER_EMAIL},to:[{email:to}],subject,htmlContent})
  });
  const txt=await r.text();
  if(!r.ok)throw new Error(`Brevo ${r.status}: ${txt.slice(0,220)}`);
}

const child=spawn(process.execPath,['src/server.js'],{
  stdio:'inherit',
  env:{...process.env,PORT:String(APP_PORT)}
});
child.on('exit',code=>{console.error('Finanzas app child exited',code);process.exit(code||1)});

const app=express();

app.post('/api/auth/forgot',express.json({limit:'16kb'}),async(req,res)=>{
  const email=String(req.body?.email||'').trim().toLowerCase().slice(0,200);
  if(!email.includes('@'))return res.status(400).json({error:'Escribe un correo válido.'});
  const key=`${req.ip}|${email}`;
  const now=Date.now();
  if(now-(resetCooldown.get(key)||0)<60000)return res.json({ok:true,message:'Si la cuenta existe, recibirás un correo para cambiar la contraseña.'});
  resetCooldown.set(key,now);
  try{
    if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY)throw new Error('Supabase admin no configurado');
    const {data,error}=await admin().auth.admin.generateLink({type:'recovery',email,options:{redirectTo:`${APP_URL}/?recovery=1`}});
    if(!error&&data?.properties?.action_link){
      const link=data.properties.action_link;
      const html=`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#172033"><h2>Recupera tu contraseña</h2><p>Recibimos una solicitud para cambiar la contraseña de tu cuenta de <b>Mis Finanzas</b>.</p><p><a href="${link}" style="display:inline-block;background:#3568f5;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700">Cambiar contraseña</a></p><p style="font-size:13px;color:#64748b">Si no pediste este cambio, puedes ignorar este correo.</p></div>`;
      await sendBrevo(email,'Recupera tu contraseña - Mis Finanzas',html);
      console.log('FINANCE PASSWORD RESET SENT',email);
    }
    res.json({ok:true,message:'Si la cuenta existe, recibirás un correo para cambiar la contraseña.'});
  }catch(e){
    console.error('FINANCE PASSWORD RESET ERROR',e.message);
    res.status(500).json({error:'No se pudo enviar el correo de recuperación. Intenta nuevamente.'});
  }
});

app.post('/api/auth/reset-password',express.json({limit:'16kb'}),async(req,res)=>{
  try{
    const token=String(req.body?.access_token||'');
    const password=String(req.body?.password||'');
    if(!token)return res.status(400).json({error:'El enlace de recuperación no es válido o expiró.'});
    if(password.length<8)return res.status(400).json({error:'La nueva contraseña debe tener al menos 8 caracteres.'});
    const {data,error}=await asToken(token).auth.getUser(token);
    if(error||!data?.user)return res.status(400).json({error:'El enlace de recuperación no es válido o expiró.'});
    const {error:updateError}=await admin().auth.admin.updateUserById(data.user.id,{password});
    if(updateError)throw updateError;
    res.json({ok:true});
  }catch(e){
    console.error('FINANCE PASSWORD UPDATE ERROR',e.message);
    res.status(500).json({error:'No se pudo actualizar la contraseña.'});
  }
});

app.get('/auth-recovery.js',(_req,res)=>res.sendFile(path.join(__dirname,'..','public','auth-recovery.js')));

app.get('/',(req,res)=>{
  const headers={...req.headers,host:`127.0.0.1:${APP_PORT}`};
  const p=http.request({hostname:'127.0.0.1',port:APP_PORT,path:req.originalUrl,method:'GET',headers},up=>{
    const chunks=[];
    up.on('data',c=>chunks.push(c));
    up.on('end',()=>{
      let body=Buffer.concat(chunks).toString('utf8');
      if(String(up.headers['content-type']||'').includes('text/html'))body=body.replace('</body>','<script src="/auth-recovery.js" defer></script></body>');
      const outHeaders={...up.headers};
      delete outHeaders['content-length'];
      res.writeHead(up.statusCode||200,outHeaders);
      res.end(body);
    });
  });
  p.on('error',e=>res.status(502).json({error:'Aplicación interna no disponible',detail:e.message}));
  p.end();
});

app.post('/internal/send-reminder-mail',express.json({limit:'256kb'}),async(req,res)=>{
  try{
    if(!MAIL_TOKEN||req.get('x-finance-mail-token')!==MAIL_TOKEN)return res.status(401).json({error:'No autorizado'});
    const to=String(req.body?.to||'').trim();
    const subject=String(req.body?.subject||'Recordatorio Mis Finanzas').slice(0,180);
    const htmlContent=String(req.body?.htmlContent||'').slice(0,30000);
    if(!to.includes('@'))return res.status(400).json({error:'Correo inválido'});
    await sendBrevo(to,subject,htmlContent);
    res.json({ok:true});
  }catch(e){res.status(500).json({error:e.message})}
});

app.post('/api/reminders/run',express.json({limit:'64kb'}),async(req,res)=>{
  try{
    if(!CRON_SECRET||req.get('x-cron-secret')!==CRON_SECRET)return res.status(401).json({error:'No autorizado'});
    const result=await runReminders({probe:req.body?.probe===true});
    res.status(result.ok?200:207).json(result);
  }catch(e){
    console.error('FINANCE REMINDERS ERROR',e);
    res.status(500).json({ok:false,error:e.message});
  }
});

app.post('/internal/finance-reminders-scheduled',express.json({limit:'8kb'}),async(req,res)=>{
  if(req.get('x-finance-scheduler')!=='supabase-cron-v1')return res.status(404).end();
  const now=Date.now();
  if(now-lastScheduledRun<30*60*1000)return res.json({ok:true,skipped:'recent-run'});
  lastScheduledRun=now;
  try{
    const result=await runReminders();
    console.log('FINANCE REMINDERS SCHEDULED',result);
    res.status(result.ok?200:207).json({ok:result.ok});
  }catch(e){
    lastScheduledRun=0;
    console.error('FINANCE REMINDERS SCHEDULED ERROR',e);
    res.status(500).json({ok:false});
  }
});

app.use((req,res)=>{
  const headers={...req.headers,host:`127.0.0.1:${APP_PORT}`};
  const p=http.request({hostname:'127.0.0.1',port:APP_PORT,path:req.originalUrl,method:req.method,headers},up=>{
    res.writeHead(up.statusCode||502,up.headers);
    up.pipe(res);
  });
  p.on('error',e=>res.status(502).json({error:'Aplicación interna no disponible',detail:e.message}));
  req.pipe(p);
});

app.listen(PUBLIC_PORT,'0.0.0.0',()=>console.log(`Mis Finanzas wrapper listo en ${PUBLIC_PORT}`));
