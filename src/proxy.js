'use strict';
const http=require('node:http');
const express=require('express');
const app=express();
const PORT=Number(process.env.PORT||10000);
const TARGET='finanzas-mama.onrender.com';
app.use((req,res)=>{
  const headers={...req.headers,host:TARGET};
  const p=httpsRequest(req,res,headers);
  req.pipe(p);
});
function httpsRequest(req,res,headers){
  const https=require('node:https');
  const p=https.request({hostname:TARGET,port:443,path:req.originalUrl,method:req.method,headers},up=>{
    const outHeaders={...up.headers};
    delete outHeaders['content-security-policy'];
    res.writeHead(up.statusCode||502,outHeaders);
    up.pipe(res);
  });
  p.on('error',e=>res.status(502).json({error:'Mis finanzas no disponible',detail:e.message}));
  return p;
}
app.listen(PORT,'0.0.0.0',()=>console.log(`Mis finanzas proxy listo en ${PORT}`));
