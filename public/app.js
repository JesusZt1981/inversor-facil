'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={me:null,cards:[],transactions:[],statements:[],receiptBase64:null,transactionView:'expense'};
const categories=['Supermercado','Comida','Casa','Servicios','Salud','Transporte','Gasolina','Ropa','Entretenimiento','Deudas','Otros'];
const fmt=n=>Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
const today=()=>new Date().toISOString().slice(0,10);
function toast(msg,error=false){const t=$('#toast');if(!t)return; t.textContent=msg;t.className='toast show'+(error?' error':'');setTimeout(()=>t.className='toast',2800)}
async function api(url,opt={}){const r=await fetch(url,{...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||'Ocurrió un error');return data}
function showApp(on){$('#authView').classList.toggle('hidden',on);$('#appView').classList.toggle('hidden',!on)}

function applyTheme(theme){
  const dark=theme==='dark';
  document.body.dataset.theme=dark?'dark':'light';
  localStorage.setItem('mf_theme',dark?'dark':'light');
  const b=$('#themeSwitch');
  if(b)b.innerHTML=dark?'☀️ <span>Claro</span>':'🌙 <span>Oscuro</span>';
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.content=dark?'#0f1115':'#f4f6f8';
}
applyTheme(localStorage.getItem('mf_theme')||'light');
if($('#themeSwitch'))$('#themeSwitch').onclick=()=>applyTheme(document.body.dataset.theme==='dark'?'light':'dark');

function go(screen){
  $$('.screen').forEach(x=>x.classList.toggle('active',x.dataset.screen===screen));
  $$('[data-go]').forEach(x=>x.classList.toggle('active',x.dataset.go===screen));
  if(screen==='transactions')loadTransactions();
  if(screen==='cards')loadCardsAndStatements();
}
$$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go));

async function boot(){
  try{
    const me=await api('/api/me');
    if(me?.authenticated===false)throw new Error('guest');
    state.me=me;
    showApp(true);
    $('#notificationEmail').value=state.me.settings?.notification_email||state.me.user?.email||'';
    $('#emailNotifications').checked=state.me.settings?.email_notifications!==false;
    $('#monthFilter').value=today().slice(0,7);
    await Promise.all([loadCards(),loadDashboard()]);
  }catch{showApp(false)}
}

$('#loginBtn').onclick=async()=>{try{await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('#authEmail').value,password:$('#authPassword').value})});await boot();toast('Sesión iniciada')}catch(e){toast(e.message,true)}};
$('#signupBtn').onclick=async()=>{try{const d=await api('/api/auth/signup',{method:'POST',body:JSON.stringify({email:$('#authEmail').value,password:$('#authPassword').value})});if(d.needs_confirmation)toast('Revisa tu correo para confirmar la cuenta');else{await boot();toast('Cuenta creada')}}catch(e){toast(e.message,true)}};
$('#logoutBtn').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});location.reload()};

async function loadCards(){state.cards=await api('/api/cards');renderCardOptions()}
function renderCardOptions(){const s=$('#txCard');s.innerHTML=state.cards.filter(c=>c.is_active).map(c=>`<option value="${c.id}">${esc(c.name)}${c.last4?' • '+esc(c.last4):''}</option>`).join('')}

async function loadDashboard(){
  try{
    const d=await api('/api/dashboard');
    $('#monthLabel').textContent=new Date(d.month+'-02T12:00:00').toLocaleDateString('es-MX',{month:'long',year:'numeric'});
    $('#kIncome').textContent=fmt(d.summary.income);
    $('#kExpense').textContent=fmt(d.summary.expenses);
    $('#kBalance').textContent=fmt(d.summary.balance);
    renderUpcoming(d.upcoming);renderCycles(d.card_cycles);renderCategories(d.by_category);
  }catch(e){toast(e.message,true)}
}
function renderUpcoming(list){const el=$('#upcomingList');if(!list.length){el.className='stack-list empty-state';el.textContent='No hay pagos pendientes.';return}el.className='stack-list';el.innerHTML=list.map(s=>{const days=Math.round((new Date(s.due_date+'T12:00:00')-new Date(today()+'T12:00:00'))/864e5);return `<div class="payment-row ${days<=1?'urgent':''}"><div><b>${esc(s.credit_cards?.name||'Tarjeta')}</b><div class="date">Vence ${dateMx(s.due_date)}</div><span class="due-badge">${days<0?'Vencido':days===0?'Vence hoy':days===1?'Vence mañana':`Faltan ${days} días`}</span></div><div class="amount">${fmt(s.remaining)}</div></div>`}).join('')}
function renderCycles(rows){const el=$('#cycleList');if(!rows.length){el.className='stack-list empty-state';el.textContent='Agrega una tarjeta para comenzar.';return}el.className='stack-list';el.innerHTML=rows.map(({card,cycle})=>`<div class="payment-row"><div><b>${esc(card.name)}</b><div class="date">Compras ${dateMx(cycle.period_start)} a ${dateMx(cycle.period_end)}</div><span class="due-badge">Se pagaría ${dateMx(cycle.projected_due_date)}</span></div><div class="amount">${fmt(cycle.accrued)}</div></div>`).join('')}
function renderCategories(rows){const el=$('#categoryBars');if(!rows.length){el.className='category-bars empty-state';el.textContent='Todavía no hay gastos este mes.';return}const max=Math.max(...rows.map(r=>Number(r[1])));el.className='category-bars';el.innerHTML=rows.map(([cat,val])=>`<div class="bar-row"><b>${esc(cat)}</b><div class="bar-track"><div class="bar-fill" style="width:${Math.max(5,Number(val)/max*100)}%"></div></div><strong>${fmt(val)}</strong></div>`).join('')}
$('#refreshBtn').onclick=()=>loadDashboard();

function openTx(type='expense',tx=null){
  $('#txForm').reset();$('#txId').value=tx?.id||'';$('#txType').value=type;$('#txDate').value=tx?.transaction_date||today();$('#txDescription').value=tx?.description||'';$('#txAmount').value=tx?.amount||'';$('#txNotes').value=tx?.notes||'';
  $('#txCategory').innerHTML=categories.map(c=>`<option ${c===(tx?.category||'Otros')?'selected':''}>${c}</option>`).join('');
  $('#txPaymentMethod').value=tx?.payment_method||'cash';$('#txCard').value=tx?.card_id||state.cards[0]?.id||'';state.receiptBase64=null;$('#receiptPreview').classList.add('hidden');
  const income=type==='income';$('#txTitle').textContent=tx?'Editar movimiento':income?'Agregar ingreso':'Agregar gasto';$('#paymentMethodWrap').classList.toggle('hidden',income);$('#receiptWrap').classList.toggle('hidden',income);toggleCard();$('#txDialog').showModal();
}
$('#newExpenseBtn').onclick=()=>openTx('expense');$('#newIncomeBtn').onclick=()=>openTx('income');
$('#newTxBtn').onclick=()=>openTx(state.transactionView==='income'?'income':'expense');
function toggleCard(){$('#cardWrap').classList.toggle('hidden',$('#txPaymentMethod').value!=='credit'||$('#txType').value==='income')}
$('#txPaymentMethod').onchange=toggleCard;
$('#txReceipt').onchange=async e=>{const f=e.target.files[0];if(!f)return;state.receiptBase64=await compressImage(f);$('#receiptPreview').src=state.receiptBase64;$('#receiptPreview').classList.remove('hidden')};
async function compressImage(file){return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);resolve(c.toDataURL('image/jpeg',.78))};img.onerror=reject;img.src=url})}
$('#saveTxBtn').onclick=async()=>{try{const id=$('#txId').value,type=$('#txType').value;const body={type,transaction_date:$('#txDate').value,description:$('#txDescription').value,category:$('#txCategory').value,amount:$('#txAmount').value,payment_method:type==='income'?'transfer':$('#txPaymentMethod').value,card_id:type!=='income'&&$('#txPaymentMethod').value==='credit'?$('#txCard').value:null,notes:$('#txNotes').value};if(!id&&state.receiptBase64)body.receipt_base64=state.receiptBase64;await api(id?`/api/transactions/${id}`:'/api/transactions',{method:id?'PUT':'POST',body:JSON.stringify(body)});$('#txDialog').close();toast('Movimiento guardado');await Promise.all([loadDashboard(),loadTransactions()])}catch(e){toast(e.message,true)}};

function setTransactionView(type){
  state.transactionView=type==='income'?'income':'expense';
  $('#showExpensesBtn').classList.toggle('active',state.transactionView==='expense');
  $('#showIncomeBtn').classList.toggle('active',state.transactionView==='income');
  const isIncome=state.transactionView==='income';
  $('#movementSheetLabel').textContent=isIncome?'INGRESOS DEL MES':'GASTOS DEL MES';
  $('#movementSheetTitle').textContent=isIncome?'Tabla de ingresos':'Tabla de gastos';
  $('#newTxBtn').title=isIncome?'Agregar ingreso':'Agregar gasto';
  renderTransactions();
}
$('#showExpensesBtn').onclick=()=>setTransactionView('expense');
$('#showIncomeBtn').onclick=()=>setTransactionView('income');

async function loadTransactions(){try{const m=$('#monthFilter').value;state.transactions=await api('/api/transactions'+(m?'?month='+m:''));renderTransactions()}catch(e){toast(e.message,true)}}
$('#applyFilter').onclick=loadTransactions;

function renderTransactions(){
  const el=$('#transactionsList');
  if(!el)return;
  const rows=state.transactions.filter(t=>t.type===state.transactionView);
  const total=rows.reduce((s,t)=>s+Number(t.amount||0),0);
  const incomes=state.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
  const expenseRaw=state.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
  const refunds=state.transactions.filter(t=>t.type==='refund').reduce((s,t)=>s+Number(t.amount||0),0);
  const expenses=Math.max(0,expenseRaw-refunds);
  const balance=incomes-expenses;
  $('#movementTotal').textContent=fmt(total);$('#movementTotalFooter').textContent=fmt(total);$('#movementCount').textContent=`${rows.length} ${rows.length===1?'movimiento':'movimientos'}`;
  $('#summaryIncome').textContent=fmt(incomes);$('#summaryExpense').textContent=fmt(expenses);$('#summaryBalance').textContent=fmt(balance);
  $('#summaryBalance').style.color=balance<0?'var(--red)':'var(--blue)';
  if(!rows.length){el.innerHTML='<tr><td colspan="6" class="empty-cell">Sin movimientos en esta vista.</td></tr>';return}
  el.innerHTML=rows.map(t=>`<tr>
    <td>${dateMx(t.transaction_date)}</td>
    <td><span class="sheet-concept">${esc(t.description)}</span>${t.notes?`<span class="sheet-sub">${esc(t.notes)}</span>`:''}</td>
    <td>${esc(t.category)}</td>
    <td>${paymentLabel(t)}</td>
    <td class="num"><span class="sheet-amount ${t.type==='income'?'income':'expense'}">${t.type==='income'?'+':'−'}${fmt(t.amount)}</span></td>
    <td><div class="sheet-actions"><button class="tiny-btn" onclick="editTx('${t.id}')" title="Editar">✎</button>${t.receipt_path?`<button class="tiny-btn" onclick="viewReceipt('${t.id}')" title="Ver ticket">▣</button>`:''}<button class="tiny-btn" onclick="deleteTx('${t.id}')" title="Eliminar">🗑</button></div></td>
  </tr>`).join('');
}
window.editTx=id=>{const t=state.transactions.find(x=>x.id===id);if(t)openTx(t.type,t)};
window.deleteTx=async id=>{if(!confirm('¿Borrar este movimiento?'))return;try{await api('/api/transactions/'+id,{method:'DELETE'});toast('Movimiento eliminado');await Promise.all([loadTransactions(),loadDashboard()])}catch(e){toast(e.message,true)}};
window.viewReceipt=async id=>{try{const d=await api(`/api/transactions/${id}/receipt`);window.open(d.url,'_blank','noopener')}catch(e){toast(e.message,true)}};
function paymentLabel(t){if(t.type==='income')return'Ingreso';return({cash:'Efectivo',debit:'Débito',credit:'Crédito',transfer:'Transferencia'})[t.payment_method]||'—'}

async function loadCardsAndStatements(){try{await loadCards();state.statements=await api('/api/statements');renderCards();renderStatements()}catch(e){toast(e.message,true)}}
function renderCards(){const el=$('#cardsList');if(!state.cards.length){el.innerHTML='<div class="empty-state">Aún no hay tarjetas.</div>';return}el.innerHTML=state.cards.map(c=>`<article class="credit-card"><div><div class="card-bank">${esc(c.bank||'TARJETA')}</div><div class="card-name">${esc(c.name)}</div><div>${c.last4?'•••• '+esc(c.last4):'Crédito'}</div></div><div><div class="card-days"><span>Corte: día <b>${c.cutoff_day}</b></span><span>Pago: día <b>${c.payment_day}</b></span></div><div class="card-actions"><button onclick="editCard('${c.id}')">Editar</button></div></div></article>`).join('')}
function openCard(c=null){$('#cardForm').reset();$('#cardId').value=c?.id||'';$('#cardName').value=c?.name||'';$('#cardBank').value=c?.bank||'';$('#cardLast4').value=c?.last4||'';$('#cardLimit').value=c?.credit_limit||'';$('#cardCutoff').value=c?.cutoff_day||15;$('#cardPayment').value=c?.payment_day||3;$('#cardTitle').textContent=c?'Editar tarjeta':'Agregar tarjeta';$('#cardDialog').showModal()}
$('#newCardBtn').onclick=()=>openCard();window.editCard=id=>openCard(state.cards.find(c=>c.id===id));
$('#saveCardBtn').onclick=async()=>{try{const id=$('#cardId').value;const body={name:$('#cardName').value,bank:$('#cardBank').value,last4:$('#cardLast4').value,credit_limit:$('#cardLimit').value,cutoff_day:Number($('#cardCutoff').value),payment_day:Number($('#cardPayment').value)};await api(id?`/api/cards/${id}`:'/api/cards',{method:id?'PUT':'POST',body:JSON.stringify(body)});$('#cardDialog').close();toast('Tarjeta guardada');await loadCardsAndStatements();await loadDashboard()}catch(e){toast(e.message,true)}};
function renderStatements(){const el=$('#statementsList');if(!state.statements.length){el.className='stack-list empty-state';el.textContent='Sin estados de cuenta.';return}el.className='stack-list';el.innerHTML=state.statements.map(s=>`<div class="statement-row"><div><b>${esc(s.credit_cards?.name||'Tarjeta')}</b><div class="date">Corte ${dateMx(s.period_end)} · vence ${dateMx(s.due_date)}</div><div class="${s.status==='paid'?'status-paid':'status-pending'}">${s.status==='paid'?'✓ Pagado':'Pendiente: '+fmt(s.remaining)}</div></div><div><div class="amount">${fmt(s.target_amount)}</div><div class="statement-actions">${s.status!=='paid'?`<button class="pay-btn" onclick="openPay('${s.id}',${s.remaining})">Registrar pago</button>`:''}<button class="adjust-btn" onclick="openAmount('${s.id}',${s.statement_amount??s.calculated_amount})">Monto banco</button></div></div></div>`).join('')}
window.openPay=(id,amount)=>{$('#statementId').value=id;$('#paymentAmount').value=Number(amount).toFixed(2);$('#paymentDate').value=today();$('#paymentDialog').showModal()};
$('#savePaymentBtn').onclick=async()=>{try{await api(`/api/statements/${$('#statementId').value}/pay`,{method:'POST',body:JSON.stringify({amount:$('#paymentAmount').value,payment_date:$('#paymentDate').value})});$('#paymentDialog').close();toast('Pago registrado');await Promise.all([loadCardsAndStatements(),loadDashboard()])}catch(e){toast(e.message,true)}};
window.openAmount=(id,amount)=>{$('#amountStatementId').value=id;$('#statementAmount').value=Number(amount).toFixed(2);$('#amountDialog').showModal()};
$('#saveStatementAmountBtn').onclick=async()=>{try{await api(`/api/statements/${$('#amountStatementId').value}/amount`,{method:'PUT',body:JSON.stringify({statement_amount:$('#statementAmount').value})});$('#amountDialog').close();toast('Monto actualizado');await Promise.all([loadCardsAndStatements(),loadDashboard()])}catch(e){toast(e.message,true)}};
$('#saveSettingsBtn').onclick=async()=>{try{const d=await api('/api/settings',{method:'PUT',body:JSON.stringify({notification_email:$('#notificationEmail').value,email_notifications:$('#emailNotifications').checked})});state.me.settings=d;toast('Configuración guardada')}catch(e){toast(e.message,true)}};
function dateMx(v){if(!v)return'—';return new Date(v+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}).replace('.','')}
function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}

setTransactionView('expense');
boot();
