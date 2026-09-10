'use strict';
const http=require('node:http');
const {spawn}=require('node:child_process');
const express=require('express');

const PORT=Number(process.env.PORT||10000);
const INNER_PORT=PORT+1;

const child=spawn(process.execPath,['src/public.js'],{
  stdio:'inherit',
  env:{...process.env,PORT:String(INNER_PORT)}
});
child.on('exit',code=>{console.error('Mis finanzas inner exited',code);process.exit(code||1)});

const app=express();
app.disable('x-powered-by');

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
    req.on('data',c=>{
      size+=c.length;
      if(size>12*1024*1024){reject(new Error('Solicitud demasiado grande'));req.destroy();return}
      chunks.push(c);
    });
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
      const chunks=[];
      up.on('data',c=>chunks.push(c));
      up.on('end',()=>resolve({status:up.statusCode||502,headers:up.headers,body:Buffer.concat(chunks)}));
    });
    p.on('timeout',()=>p.destroy(new Error('Timeout interno')));
    p.on('error',reject);
    if(body.length)p.write(body);
    p.end();
  });
}

app.listen(PORT,'0.0.0.0',()=>console.log(`Mis finanzas entry listo en ${PORT}`));
