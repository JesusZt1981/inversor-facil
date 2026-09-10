'use strict';
const http=require('node:http');
const {spawn}=require('node:child_process');
const express=require('express');
const {runReminders}=require('./reminderRunner');

const PUBLIC_PORT=Number(process.env.PORT||10000);
const APP_PORT=PUBLIC_PORT+1;
const MAIL_TOKEN=process.env.FINANCE_MAIL_TOKEN||'';
const BREVO_API_KEY=process.env.BREVO_API_KEY||'';
const SENDER_EMAIL=process.env.BREVO_SENDER_EMAIL||process.env.MAIL_FROM||'';
const SENDER_NAME=process.env.BREVO_SENDER_NAME||'Mis Finanzas';
const CRON_SECRET=process.env.CRON_SECRET||'';

const child=spawn(process.execPath,['src/server.js'],{
  stdio:'inherit',
  env:{...process.env,PORT:String(APP_PORT)}
});
child.on('exit',code=>{console.error('Finanzas app child exited',code);process.exit(code||1)});

const app=express();
app.post('/internal/send-reminder-mail',express.json({limit:'256kb'}),async(req,res)=>{
  try{
    if(!MAIL_TOKEN||req.get('x-finance-mail-token')!==MAIL_TOKEN)return res.status(401).json({error:'No autorizado'});
    if(!BREVO_API_KEY||!SENDER_EMAIL)return res.status(503).json({error:'Brevo no configurado'});
    const to=String(req.body?.to||'').trim();
    const subject=String(req.body?.subject||'Recordatorio Mis Finanzas').slice(0,180);
    const htmlContent=String(req.body?.htmlContent||'').slice(0,30000);
    if(!to.includes('@'))return res.status(400).json({error:'Correo inválido'});
    const r=await fetch('https://api.brevo.com/v3/smtp/email',{
      method:'POST',
      headers:{'content-type':'application/json','api-key':BREVO_API_KEY},
      body:JSON.stringify({sender:{name:SENDER_NAME,email:SENDER_EMAIL},to:[{email:to}],subject,htmlContent})
    });
    const txt=await r.text();
    if(!r.ok)return res.status(502).json({error:`Brevo ${r.status}`,detail:txt.slice(0,300)});
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
