'use strict';
const {createClient}=require('@supabase/supabase-js');
const {iso,statementPeriod,dueDateForStatement,closedStatementEnds,daysBetween}=require('./cardLogic');

const URL=process.env.SUPABASE_URL||'';
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const BREVO_API_KEY=process.env.BREVO_API_KEY||'';
const SENDER_EMAIL=process.env.BREVO_SENDER_EMAIL||process.env.MAIL_FROM||'';
const SENDER_NAME=process.env.BREVO_SENDER_NAME||'Mis finanzas';

const db=()=>createClient(URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const money=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
const target=s=>Number(s.statement_amount??s.calculated_amount??0);
const remaining=s=>Math.max(0,target(s)-Number(s.paid_amount||0));

function localToday(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Ciudad_Juarez',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return `${o.year}-${o.month}-${o.day}`;
}
function localWeekday(isoDate){return new Date(`${isoDate}T12:00:00-06:00`).getDay()}

async function syncStatement(client,card,end){
  const p=statementPeriod(end,card.cutoff_day),start=iso(p.start),periodEnd=iso(p.end);
  const {data:tx,error:txError}=await client.from('transactions').select('type,amount').eq('user_id',card.user_id).eq('card_id',card.id).gte('transaction_date',start).lte('transaction_date',periodEnd).in('type',['expense','refund']);
  if(txError)throw txError;
  const calculated=Math.max(0,(tx||[]).reduce((sum,x)=>sum+(x.type==='refund'?-Number(x.amount):Number(x.amount)),0));
  const due=iso(dueDateForStatement(end,card.payment_day));
  const {data:old,error:oldError}=await client.from('card_statements').select('*').eq('card_id',card.id).eq('period_end',periodEnd).maybeSingle();
  if(oldError)throw oldError;
  if(!old){const {data,error}=await client.from('card_statements').insert({user_id:card.user_id,card_id:card.id,period_start:start,period_end:periodEnd,due_date:due,calculated_amount:calculated,status:calculated<=0?'paid':'pending'}).select('*').single();if(error)throw error;return data}
  const finalTarget=old.statement_amount==null?calculated:Number(old.statement_amount),paid=Number(old.paid_amount||0);
  const {data,error}=await client.from('card_statements').update({period_start:start,due_date:due,calculated_amount:calculated,status:paid+.005>=finalTarget?'paid':'pending',updated_at:new Date().toISOString()}).eq('id',old.id).select('*').single();if(error)throw error;return data;
}

async function sendMail(to,subject,htmlContent){
  const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{accept:'application/json','content-type':'application/json','api-key':BREVO_API_KEY},body:JSON.stringify({sender:{name:SENDER_NAME,email:SENDER_EMAIL},to:[{email:to}],subject,htmlContent})});
  const txt=await r.text();if(!r.ok)throw new Error(`Brevo ${r.status}: ${txt.slice(0,300)}`);
}
async function probeBrevo(){const r=await fetch('https://api.brevo.com/v3/account',{headers:{accept:'application/json','api-key':BREVO_API_KEY}});if(!r.ok)throw new Error(`Brevo API key rechazada (${r.status})`);return true}

function mailFor(kind,s,card){
  const due=s.due_date,amount=remaining(s),name=card.name||'Tarjeta',last4=card.last4?` •••• ${card.last4}`:'';
  const title=kind==='cutoff'?'Ya cerró tu tarjeta':kind==='due_5'?'Tu pago vence en 5 días':kind==='due_1'?'Tu pago vence mañana':'Tu pago vence hoy';
  const source=s.statement_amount==null?'Importe estimado con los movimientos registrados en Mis finanzas.':'Importe tomado del estado de cuenta capturado en Mis finanzas.';
  return {subject:`Mis finanzas · ${title} · ${name}`,htmlContent:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#172033"><h2>${esc(title)}</h2><p><b>${esc(name+last4)}</b></p><p style="font-size:32px;font-weight:700">${esc(money(amount))}</p><p><b>Fecha límite:</b> ${esc(due)}</p><p><b>Corte:</b> ${esc(s.period_end)}</p><p style="font-size:13px;color:#667085">${esc(source)}</p></div>`};
}
function obligationMail(o,delta){
  const title=delta<0?'Pago vencido':delta===0?'Pago vence hoy':delta===1?'Pago vence mañana':`Pago próximo: faltan ${delta} días`;
  const debt=o.kind==='debt'?`<p><b>Saldo pendiente:</b> ${esc(money(o.remaining_balance))}</p>`:'';
  return {subject:`Mis finanzas · ${title} · ${o.concept}`,htmlContent:`<div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:24px;color:#172033"><h2>${esc(title)}</h2><p><b>${esc(o.concept)}</b></p><p style="font-size:32px;font-weight:700;margin:18px 0">${esc(money(o.installment_amount))}</p><p><b>Vence:</b> ${esc(o.next_due_date)}</p>${debt}<p style="font-size:13px;color:#667085">Cuando registres el pago en Mis finanzas, el saldo y la siguiente fecha se actualizarán automáticamente.</p></div>`};
}

async function runReminders({probe=false}={}){
  if(!URL||!SERVICE_KEY)throw new Error('Falta configuración de Supabase en Render.');
  if(!BREVO_API_KEY||!SENDER_EMAIL)throw new Error('Falta configuración de Brevo en Render.');
  if(probe)await probeBrevo();
  const client=db(),today=localToday();
  const {data:cards,error:cardsError}=await client.from('credit_cards').select('*').eq('is_active',true);if(cardsError)throw cardsError;
  for(const card of cards||[])for(const end of closedStatementEnds(today,Number(card.cutoff_day||15),3))await syncStatement(client,card,end);
  const {data:settings,error:settingsError}=await client.from('user_settings').select('user_id,notification_email,email_notifications').eq('email_notifications',true);if(settingsError)throw settingsError;
  const emails=new Map((settings||[]).filter(x=>String(x.notification_email||'').includes('@')).map(x=>[x.user_id,x.notification_email]));
  const cardMap=new Map((cards||[]).map(x=>[x.id,x]));
  const {data:statements,error:stError}=await client.from('card_statements').select('*').eq('status','pending');if(stError)throw stError;

  let sent=0,skipped=0,failed=0;const errors=[];
  for(const s of statements||[]){
    const to=emails.get(s.user_id),card=cardMap.get(s.card_id);if(!to||!card||remaining(s)<=0){skipped++;continue}
    const delta=daysBetween(today,s.due_date);let kind=null;if(s.period_end===today)kind='cutoff';else if(delta===5)kind='due_5';else if(delta===1)kind='due_1';else if(delta===0)kind='due_today';if(!kind){skipped++;continue}
    const {data:already}=await client.from('notification_log').select('id').eq('statement_id',s.id).eq('kind',kind).maybeSingle();if(already){skipped++;continue}
    try{const m=mailFor(kind,s,card);await sendMail(to,m.subject,m.htmlContent);const {error:logError}=await client.from('notification_log').insert({user_id:s.user_id,statement_id:s.id,kind,sent_to:to});if(logError&&logError.code!=='23505')throw logError;sent++}catch(e){failed++;errors.push({statement_id:s.id,error:e.message})}
  }

  const {data:obligations,error:oErr}=await client.from('payment_obligations').select('*').eq('status','active').not('next_due_date','is',null);if(oErr)throw oErr;
  const weekday=localWeekday(today);
  for(const o of obligations||[]){
    const to=emails.get(o.user_id);if(!to){skipped++;continue}
    const delta=daysBetween(today,o.next_due_date),days=Array.isArray(o.reminder_days_before)?o.reminder_days_before.map(Number):[],weekdays=Array.isArray(o.reminder_weekdays)?o.reminder_weekdays.map(Number):[];
    const dueMatch=days.includes(delta),weekdayMatch=weekdays.includes(weekday)&&delta>=0&&delta<=6;
    if(!dueMatch&&!weekdayMatch){skipped++;continue}
    const {data:already}=await client.from('obligation_notification_log').select('id').eq('obligation_id',o.id).eq('occurrence_due_date',o.next_due_date).eq('reminder_date',today).maybeSingle();if(already){skipped++;continue}
    try{const m=obligationMail(o,delta);await sendMail(to,m.subject,m.htmlContent);const {error:logError}=await client.from('obligation_notification_log').insert({user_id:o.user_id,obligation_id:o.id,occurrence_due_date:o.next_due_date,reminder_date:today,sent_to:to});if(logError&&logError.code!=='23505')throw logError;sent++}catch(e){failed++;errors.push({obligation_id:o.id,error:e.message})}
  }
  return {ok:failed===0,today,cards:(cards||[]).length,statements:(statements||[]).length,obligations:(obligations||[]).length,sent,skipped,failed,probe:probe?'brevo-ok':'not-requested',errors:errors.slice(0,10)};
}

module.exports={runReminders};