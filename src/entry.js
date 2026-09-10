'use strict';
const http=require('node:http');
const {spawn}=require('node:child_process');
const express=require('express');
const {createClient}=require('@supabase/supabase-js');

const PORT=Number(process.env.PORT||10000);
const INNER_PORT=PORT+1;
const SUPABASE_URL=process.env.SUPABASE_URL||'';
const SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||'';
const APP_URL='https://mis-finanzas-7hyw.onrender.com';

const auth=()=>createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const text=(v,n=200)=>String(v||'').trim().slice(0,n);

const child=spawn(process.execPath,['src/public.js'],{
  stdio:'inherit',
  env:{...process.env,PORT:String(INNER_PORT)}
});
child.on('exit',code=>{console.error('Mis finanzas inner exited',code);process.exit(code||1)});

const app=express();
app.disable('x-powered-by');

app.post('/api/auth/signup',express.json({limit:'32kb'}),async(req,res)=>{
  const email=text(req.body?.email).toLowerCase();
  const password=String(req.body?.password||'');
  if(!email.includes('@')||password.length<8){
    return res.status(400).json({error:'Escribe un correo válido y una contraseña de al menos 8 caracteres.'});
  }
  try{
    if(!SUPABASE_URL||!SUPABASE_PUBLISHABLE_KEY)throw new Error('Supabase no configurado');
    const {data,error}=await auth().auth.signUp({
      email,
      password,
      options:{emailRedirectTo:APP_URL}
    });
    if(error){
      if(error.status===429||/rate limit|too many/i.test(error.message||'')){
        return res.status(429).json({error:'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentar.'});
      }
      return res.status(400).json({error:error.message||'No se pudo crear la cuenta.'});
    }
    if(data?.user&&Array.isArray(data.user.identities)&&data.user.identities.length===0){
      return res.status(409).json({error:'Este correo ya tiene una cuenta. Usa Entrar o ¿Olvidaste tu contraseña?'});
    }
    return res.json({ok:true,needs_confirmation:!data?.session,email});
  }catch(e){
    console.error('SELF SERVICE SIGNUP ERROR',e.message);
    return res.status(500).json({error:'No se pudo completar el registro. Intenta nuevamente.'});
  }
});

app.use(async(req,res)=>{
  try{
    const body=await readBody(req);
    const result=await forward(req,body);
    if(req.method==='GET'&&req.originalUrl==='/api/me'&&result.status===401){
      return res.status(200).json({authenticated:false});
    }
    const headers={...result.headers};
    delete headers['content-length'];
    res.writeHead(result.status,headers);
    res.end(result.body);
  }catch(e){
    console.error('ENTRY PROXY ERROR',req.method,req.originalUrl,e.message);
    res.status(502).json({error:'Servicio temporalmente no disponible.'});
  }
});

function readBody(req){
  if(req.method==='GET'||req.method==='HEAD')return Promise.resolve(Buffer.alloc(0));
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    req.on('data',c=>{size+=c.length;if(size>12*1024*1024){reject(new Error('Solicitud demasiado grande'));req.destroy();return}chunks.push(c)});
    req.on('end',()=>resolve(Buffer.concat(chunks)));
    req.on('error',reject);
  });
}
function forward(req,body){
  return new Promise((resolve,reject)=>{
    const headers={...req.headers,host:`127.0.0.1:${INNER_PORT}`};
    delete headers['content-length'];delete headers['transfer-encoding'];
    if(body.length)headers['content-length']=String(body.length);
    const p=http.request({hostname:'127.0.0.1',port:INNER_PORT,path:req.originalUrl,method:req.method,headers,timeout:12000},up=>{
      const chunks=[];up.on('data',c=>chunks.push(c));up.on('end',()=>resolve({status:up.statusCode||502,headers:up.headers,body:Buffer.concat(chunks)}));
    });
    p.on('timeout',()=>p.destroy(new Error('Timeout interno')));p.on('error',reject);
    if(body.length)p.write(body);p.end();
  });
}

app.listen(PORT,'0.0.0.0',()=>console.log(`Mis finanzas entry listo en ${PORT}`));
