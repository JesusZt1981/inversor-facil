'use strict';
const https=require('node:https');
const path=require('node:path');
const express=require('express');

const app=express();
const PORT=Number(process.env.PORT||10000);
const TARGET='finanzas-mama.onrender.com';
const TRANSIENT=new Set([502,503,504]);
const PUBLIC_DIR=path.join(__dirname,'..','public');

app.disable('x-powered-by');
app.get('/api/health',(_req,res)=>res.json({ok:true,app:'mis-finanzas',target:TARGET,time:new Date().toISOString()}));

// La interfaz se sirve desde este mismo servicio. Así la app abre aunque el backend esté despertando.
app.use(express.static(PUBLIC_DIR,{maxAge:'5m',etag:true}));

app.use('/api',async(req,res)=>{
  try{
    const body=await readBody(req);
    const result=await forwardWithRetry(req,body,5);

    if(req.method==='GET'&&req.path==='/me'&&result.status===401){
      return res.status(200).json({authenticated:false});
    }

    const headers={...result.headers};
    delete headers['content-security-policy'];
    delete headers['content-length'];
    res.writeHead(result.status,headers);
    res.end(result.body);
  }catch(e){
    console.error('MIS FINANZAS API PROXY ERROR',e.message);
    res.status(503).json({error:'El servicio de datos está iniciando. Intenta nuevamente en unos segundos.'});
  }
});

app.use((_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'index.html')));

function readBody(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];
    let size=0;
    req.on('data',c=>{
      size+=c.length;
      if(size>10*1024*1024){reject(new Error('Solicitud demasiado grande'));req.destroy();return}
      chunks.push(c);
    });
    req.on('end',()=>resolve(Buffer.concat(chunks)));
    req.on('error',reject);
  });
}

async function forwardWithRetry(req,body,maxAttempts){
  let lastError=null;
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      const r=await forwardOnce(req,body);
      if(!TRANSIENT.has(r.status)||attempt===maxAttempts)return r;
      lastError=new Error(`Backend ${r.status}`);
    }catch(e){
      lastError=e;
      if(attempt===maxAttempts)throw e;
    }
    await sleep(Math.min(3500,attempt*1000));
  }
  throw lastError||new Error('Backend no disponible');
}

function forwardOnce(req,body){
  return new Promise((resolve,reject)=>{
    const headers={...req.headers,host:TARGET};
    delete headers['content-length'];
    delete headers['transfer-encoding'];
    if(body.length)headers['content-length']=String(body.length);
    const apiPath='/api'+req.originalUrl;
    const p=https.request({hostname:TARGET,port:443,path:apiPath,method:req.method,headers,timeout:20000},up=>{
      const chunks=[];
      up.on('data',c=>chunks.push(c));
      up.on('end',()=>resolve({status:up.statusCode||502,headers:up.headers,body:Buffer.concat(chunks)}));
    });
    p.on('timeout',()=>p.destroy(new Error('Timeout del backend')));
    p.on('error',reject);
    if(body.length)p.write(body);
    p.end();
  });
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
app.listen(PORT,'0.0.0.0',()=>console.log(`Mis finanzas UI + API proxy listo en ${PORT}`));
