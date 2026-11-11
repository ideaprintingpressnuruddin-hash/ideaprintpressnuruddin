import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,signOut} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {getDatabase,ref,get,set,push,update,onValue,serverTimestamp,query,orderByChild,limitToLast} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

// Project web configuration retrieved from your existing GitHub index.html.
// Realtime Database URL: বাস্তব URL নিচে বসানো হয়েছে (Firebase Console → Build → Realtime Database
// পেজের উপরে দেখানো URL)। শেষে কোনো trailing slash নেই।
const firebaseConfig={
 apiKey:'AIzaSyBE3PCNTsoODYSS8NBoNFx0qhxZ5gliaQo',
 authDomain:'ideaprintingpressnuruddi-a44ad.firebaseapp.com',
 databaseURL:'https://ideaprintingpressnuruddi-a44ad-default-rtdb.asia-southeast1.firebasedatabase.app',
 projectId:'ideaprintingpressnuruddi-a44ad',
 appId:'1:946792937246:web:e424437160270fbdce3b0f'
};
const ADMIN_UID='d9UNgMBw3bRRDEc2nSc95NF90Gg2';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtMoney=p=>`৳ ${(Number(p||0)/100).toLocaleString('en-BD',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const asMoney=p=>Number(p||0)/100;
const takaToPaisa=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0)throw Error('সঠিক টাকা লিখুন।');return Math.round(n*100)};
const today=()=>new Date().toLocaleDateString('en-CA');
const dateText=x=>x?new Date(Number(x)).toLocaleString('bn-BD'):'—';
const obj=x=>x&&typeof x==='object'?x:{};
const vals=x=>Object.entries(obj(x)).map(([id,v])=>({id,...obj(v)}));
const keySafe=s=>String(s||'').trim().toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,40);
const auth= getAuth(initializeApp(firebaseConfig));
const isDatabaseUrlConfigured=()=>/^https:\/\/.+\.(?:firebasedatabase\.app|firebaseio\.com)\/?$/.test(firebaseConfig.databaseURL);
let db=null,user=null,member=null,isAdmin=false,masters={locations:{},products:{},accounts:{},boms:{},customers:{},suppliers:{}},events={},attendance={},leaves={},payrollData={salaries:{},runs:{}},members={},pageName='dashboard',unsubs=[],trackingTimer=null,activeShift=false;
const pageDefs=[
 ['dashboard','ড্যাশবোর্ড','overview'],['masters','মাস্টার ডেটা','admin'],['purchases','ক্রয়','work'],['stock','স্টক ও ইনভেন্টরি','work'],['production','উৎপাদন','work'],['sales','বিক্রয়','work'],['expenses','খরচ','work'],['attendance','হাজিরা ও GPS','work'],['leave','ছুটি','work'],['assets','সম্পদ','work'],['accounting','হিসাব ও লাভ-ক্ষতি','work'],['payroll','বেতন','admin'],['reports','রিপোর্ট','work'],['workers','কর্মী ও অনুমতি','admin'],['backup','ডেটা ব্যাকআপ','admin']
];
function setStatus(msg,good=false){$('globalStatus').textContent=msg||'';$('globalStatus').className='status'+(good?' good':'')}
function activeLocations(){let all=vals(masters.locations).filter(x=>x.active!==false);if(!isAdmin)all=all.filter(x=>x.id===member?.location);return all}
function opts(items,placeholder='বেছে নিন'){return `<option value="">${placeholder}</option>`+items.map(x=>`<option value="${esc(x.id)}">${esc(x.name||x.id)}</option>`).join('')}
function f(name,label,type='text',required=true,extra=''){return `<label>${label}<input name="${name}" type="${type}" ${required?'required':''} ${extra}></label>`}
function s(name,label,items,required=true){return `<label>${label}<select name="${name}" ${required?'required':''}>${opts(items)}</select></label>`}
function area(name,label,required=true){return `<label>${label}<textarea name="${name}" ${required?'required':''}></textarea></label>`}
function form(id,fields,button='সংরক্ষণ করুন'){return `<form class="form" data-form="${id}">${fields}<div class="actions"><button type="submit">${button}</button></div></form>`}
function panel(title,body){return `<section class="panel"><h2>${title}</h2>${body}</section>`}
function table(headers,rows){return `<div class="tablewrap"><table><thead><tr>${headers.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr>${r.map(v=>`<td>${v??'—'}</td>`).join('')}</tr>`).join(''):`<tr><td class="empty" colspan="${headers.length}">কোনো তথ্য নেই</td></tr>`}</tbody></table></div>`}
function allEventRows(){
 if(!isAdmin)return vals(events);
 const seen=new Map();
 for(const [loc,sub] of Object.entries(obj(events)))for(const [id,v] of Object.entries(obj(sub)))if(!seen.has(id))seen.set(id,{id,...obj(v)});
 return [...seen.values()];
}
function listEvents(type){return allEventRows().filter(e=>!type||e.type===type).sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0))}
function findEvent(id){return listEvents().find(e=>e.id===id)||null}
function flattenLeaves(){let rows=[];if(isAdmin){for(const [uid,sub] of Object.entries(obj(leaves)))for(const [id,v] of Object.entries(obj(sub)))rows.push({uid,id,...obj(v)})}else for(const [id,v] of Object.entries(obj(leaves)))rows.push({uid:user.uid,id,...obj(v)});return rows.sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0))}
function latestLeave(id){return flattenLeaves().find(x=>x.id===id)||null}
function leaveStatus(id){return latestLeave(id)?.status||'pending'}
function payload(e){return obj(e?.payload)}
function expenseDecision(id){const e=listEvents('expense_review').find(x=>payload(x).expenseId===id);return e?.payload?.decision||null}
function isApprovedExpense(id){return expenseDecision(id)==='approved'}
function stockAt(locationId,productId){let total=0;for(const e of listEvents()){const p=payload(e);if(e.type==='purchase'&&p.locationId===locationId&&p.productId===productId)total+=Number(p.quantity||0);if(e.type==='stock_adjustment'&&p.locationId===locationId&&p.productId===productId)total+=Number(p.delta||0);if(e.type==='transfer'&&p.productId===productId){if(p.fromLocationId===locationId)total-=Number(p.quantity||0);if(p.toLocationId===locationId)total+=Number(p.quantity||0)}if(e.type==='production'&&p.locationId===locationId){if(p.inputProductId===productId)total-=Number(p.inputQuantity||0);if(p.outputProductId===productId)total+=Number(p.outputQuantity||0)}if(e.type==='sales_delivery'&&p.locationId===locationId&&p.productId===productId)total-=Number(p.quantity||0);if(e.type==='sales_settlement'&&p.locationId===locationId&&p.productId===productId)total+=Number(p.returnedQuantity||0);if(e.type==='customer_return'&&p.locationId===locationId&&p.productId===productId)total+=Number(p.quantity||0);if(e.type==='legacy_stock_movement'&&p.loc===locationId&&p.product===productId)total+=Number(p.qty||0)}return total}
function avgCost(productId){let qty=0,value=0;for(const e of listEvents()){const p=payload(e);if(e.type==='purchase'&&p.productId===productId){qty+=Number(p.quantity||0);value+=Number(p.totalCostPaisa||0)}if(e.type==='production'&&p.outputProductId===productId){qty+=Number(p.outputQuantity||0);value+=Number(p.totalCostPaisa||0)}}return qty>0?Math.round(value/qty):Number(masters.products?.[productId]?.costPaisa||0)}
function allStock(){let rows=[];for(const l of activeLocations())for(const p of vals(masters.products)){const q=stockAt(l.id,p.id);rows.push({location:l,product:p,qty:q,value:q*avgCost(p.id)})}return rows}
function unsettledDeliveries(){const settled=new Set(listEvents('sales_settlement').map(e=>payload(e).deliveryId));return listEvents('sales_delivery').filter(e=>!settled.has(e.id))}
function deliveryRows(){return listEvents('sales_delivery').map(e=>{const p=payload(e),settlement=listEvents('sales_settlement').find(x=>payload(x).deliveryId===e.id);return {e,p,settlement}})}
function totalSalesPaisa(){return listEvents('sales_settlement').reduce((sum,e)=>{const p=payload(e);return sum+Number(p.soldQuantity||0)*Number(p.unitPricePaisa||0)},0)}
function totalCogsPaisa(){return listEvents('sales_settlement').reduce((sum,e)=>{const p=payload(e);return sum+Number(p.soldQuantity||0)*Number(p.cogsPerUnitPaisa||0)},0)}
function totalPaidExpenses(){return listEvents('expense_payment').reduce((a,e)=>a+Number(payload(e).amountPaisa||0),0)}
function totalDepreciation(){return listEvents('asset_depreciation').reduce((a,e)=>a+Number(payload(e).amountPaisa||0),0)}
function totalPayrollPaisa(){return listEvents('payroll_cost').reduce((a,e)=>a+Number(payload(e).amountPaisa||0),0)}
function manualProfit(){let income=0,expense=0;for(const e of listEvents('journal')){const p=payload(e),debit=masters.accounts?.[p.debitAccount]?.type,credit=masters.accounts?.[p.creditAccount]?.type,amt=Number(p.amountPaisa||0);if(credit==='income')income+=amt;if(debit==='income')income-=amt;if(debit==='expense')expense+=amt;if(credit==='expense')expense-=amt}return income-expense}
function pAndL(){const sales=totalSalesPaisa(),cogs=totalCogsPaisa(),expenses=totalPaidExpenses(),depr=totalDepreciation(),payroll=totalPayrollPaisa(),manual=manualProfit();return {sales,cogs,expenses,depr,payroll,manual,net:sales-cogs-expenses-depr-payroll+manual}}
function nameOf(path,id){return masters[path]?.[id]?.name||id||'—'}
function navRender(){const groups=[['সারসংক্ষেপ',['dashboard']],['ব্যবসা পরিচালনা',['purchases','stock','production','sales','expenses']],['কর্মী ব্যবস্থাপনা',['attendance','leave']],['হিসাব ও সম্পদ',['assets','accounting','payroll','reports']],['সেটআপ',['masters','workers','backup']]];let h='';for(const [g,items] of groups){let visible=items.filter(id=>pageDefs.find(x=>x[0]===id)?.[2]!=='admin'||isAdmin);if(!visible.length)continue;h+=`<div class="navgroup">${g}</div>`+visible.map(id=>{const d=pageDefs.find(x=>x[0]===id);return `<button class="nav ${pageName===id?'active':''}" data-page="${id}">${d[1]}</button>`}).join('')}$('nav').innerHTML=h;$('nav').querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>{pageName=b.dataset.page;render()}))}
function render(){if(!user)return;navRender();let def=pageDefs.find(x=>x[0]===pageName);$('pageTitle').textContent=def?.[1]||'ড্যাশবোর্ড';$('identity').textContent=`${member?.name||user.uid} · ${isAdmin?'অ্যাডমিন':'Operational কর্মী'}${member?.location?' · '+nameOf('locations',member.location):''}`;let html='';try{switch(pageName){case'dashboard':html=renderDashboard();break;case'masters':html=renderMasters();break;case'purchases':html=renderPurchases();break;case'stock':html=renderStock();break;case'production':html=renderProduction();break;case'sales':html=renderSales();break;case'expenses':html=renderExpenses();break;case'attendance':html=renderAttendance();break;case'leave':html=renderLeave();break;case'assets':html=renderAssets();break;case'accounting':html=renderAccounting();break;case'payroll':html=renderPayroll();break;case'reports':html=renderReports();break;case'workers':html=renderWorkers();break;case'backup':html=renderBackup();break;default:html=renderDashboard()}}catch(err){console.error(err);html=`<div class="panel">এই পৃষ্ঠা তৈরি করা যায়নি: ${esc(err.message)}</div>`}$('page').innerHTML=html;$('globalStatus').textContent='';}
function renderDashboard(){const p=pAndL(),stock=allStock().reduce((a,x)=>a+x.value,0),pending=listEvents('expense_request').filter(e=>!listEvents('expense_review').some(r=>payload(r).expenseId===e.id)).length;return `<div class="cards"><div class="card"><div class="k">বর্তমান স্টকের আনুমানিক মূল্য</div><strong>${fmtMoney(stock)}</strong><small>সর্বশেষ মজুদ × গড় ক্রয়মূল্য</small></div><div class="card"><div class="k">সমন্বিত বিক্রয়</div><strong>${fmtMoney(p.sales)}</strong><small>বিক্রয় সমন্বয় থেকে</small></div><div class="card"><div class="k">অপেক্ষমাণ খরচ</div><strong>${pending}</strong><small>অনুমোদনের অপেক্ষায়</small></div><div class="card"><div class="k">আনুমানিক নিট লাভ/ক্ষতি</div><strong>${fmtMoney(p.net)}</strong><small>বর্তমান ডেটা অনুযায়ী</small></div></div><div class="grid">${panel('সর্বশেষ লেনদেন',table(['তারিখ','ধরন','ব্যবহারকারী','বিবরণ'],listEvents().slice(0,8).map(e=>[esc(e.date),esc(e.type),esc(e.actorName),esc(shortPayload(payload(e)))])))}${panel('স্টক সতর্কতা',table(['লোকেশন','পণ্য','পরিমাণ'],allStock().filter(x=>x.qty<0).map(x=>[esc(x.location.name),esc(x.product.name),`<span class="tag bad">${x.qty}</span>`])))}</div><p class="subtle">লাভ-ক্ষতি একটি ব্যবস্থাপনাগত অনুমান। সম্পূর্ণ যাচাইকৃত আর্থিক বিবরণী নয়; পুরোনো ডেটা মাইগ্রেশন, পাওনা-দেনা ও হিসাবের নীতিমালা মিলিয়ে নিতে হবে।</p>`}
function shortPayload(p){return p.description||p.remark||p.productName||p.name||p.category||p.reason||p.expenseId||p.deliveryId||''}
function renderMasters(){
 if(!isAdmin)return '<div class="panel">শুধু অ্যাডমিন Master Data সম্পাদনা করতে পারবেন।</div>';
 const locations=vals(masters.locations),products=vals(masters.products),accounts=vals(masters.accounts),customers=vals(masters.customers),suppliers=vals(masters.suppliers);
 return `<div class="notice">প্রথমবার হলে “প্রাথমিক মাস্টার ডেটা তৈরি” চাপুন। এরপর লোকেশন, পণ্য, কাস্টমার, সাপ্লায়ার ও হিসাব খাত যোগ করুন। Master Data পরিবর্তন অ্যাডমিন-নিয়ন্ত্রিত।</div>
 <div class="row"><button data-action="seed">প্রাথমিক মাস্টার ডেটা তৈরি</button></div>
 <div class="grid">
 ${panel('নতুন লোকেশন',form('location',f('id','লোকেশন ID (ইংরেজি)','text',true,'pattern="[A-Za-z0-9_-]{2,40}"')+f('name','লোকেশনের নাম')))}
 ${panel('নতুন পণ্য',form('product',f('name','পণ্যের নাম')+f('unit','একক (পিস/রিম/কেজি)')+f('category','ধরন (কাঁচামাল/ফিনিশড)')+f('sellingPrice','বিক্রয় মূল্য (টাকা)','number',false,'min="0" step="0.01"')))}
 ${panel('নতুন হিসাব খাত',form('account',f('id','খাত ID','text',true,'pattern="[A-Za-z0-9_-]{2,40}"')+f('name','খাতের নাম')+s('type','খাতের ধরন',[{id:'asset',name:'সম্পদ'},{id:'liability',name:'দায়'},{id:'equity',name:'মূলধন'},{id:'income',name:'আয়'},{id:'expense',name:'ব্যয়'}])))}
 ${panel('নতুন কাস্টমার',form('customer',f('name','কাস্টমারের নাম')+f('phone','মোবাইল','tel',false)+f('address','ঠিকানা','text',false)))}
 ${panel('নতুন সাপ্লায়ার',form('supplier',f('name','সাপ্লায়ারের নাম')+f('phone','মোবাইল','tel',false)+f('address','ঠিকানা','text',false)))}
 </div>
 ${panel('BOM / উৎপাদন অনুপাত',form('bom',s('inputProductId','কাঁচামাল',products)+s('outputProductId','তৈরি পণ্য',products)+f('inputQuantity','কাঁচামালের পরিমাণ','number',true,'min="0.001" step="any"')+f('outputQuantity','তৈরি পণ্যের পরিমাণ','number',true,'min="0.001" step="any"')))}
 <div class="grid">
 ${panel('লোকেশন তালিকা',table(['ID','নাম'],locations.map(x=>[esc(x.id),esc(x.name)])))}
 ${panel('পণ্য তালিকা',table(['পণ্য','একক','ধরন','বিক্রয় মূল্য'],products.map(x=>[esc(x.name),esc(x.unit),esc(x.category),fmtMoney(x.sellingPricePaisa)])))}
 ${panel('কাস্টমার তালিকা',table(['নাম','মোবাইল','ঠিকানা'],customers.map(x=>[esc(x.name),esc(x.phone),esc(x.address)])))}
 ${panel('সাপ্লায়ার তালিকা',table(['নাম','মোবাইল','ঠিকানা'],suppliers.map(x=>[esc(x.name),esc(x.phone),esc(x.address)])))}
 </div>${panel('হিসাব খাত',table(['ID','নাম','ধরন'],accounts.map(x=>[esc(x.id),esc(x.name),esc(x.type)])))}
`;
}
function renderPurchases(){const ls=activeLocations(),ps=vals(masters.products);return `<div class="grid">${panel('নতুন ক্রয় / স্টক গ্রহণ',form('purchase',s('locationId','লোকেশন',ls)+s('productId','পণ্য',ps)+f('supplier','সাপ্লায়ারের নাম','text',true,'list="supplierOptions"')+`<datalist id="supplierOptions">${vals(masters.suppliers).map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist>`+f('quantity','পরিমাণ','number',true,'min="0.001" step="any"')+f('unitCost','একক ক্রয়মূল্য (টাকা)','number',true,'min="0" step="0.01"')+f('otherCost','পরিবহন/লোডিং/অন্যান্য মোট (টাকা)','number',false,'min="0" step="0.01"')+s('paymentMode','পেমেন্ট',[{id:'cash',name:'নগদ'},{id:'bank',name:'ব্যাংক'},{id:'credit',name:'বাকি'}])))}${panel('সাম্প্রতিক ক্রয়',table(['তারিখ','পণ্য','লোকেশন','পরিমাণ','মোট খরচ'],listEvents('purchase').slice(0,20).map(e=>{let p=payload(e);return [esc(e.date),esc(nameOf('products',p.productId)),esc(nameOf('locations',p.locationId)),p.quantity,fmtMoney(p.totalCostPaisa)]})))}</div>`}
function renderStock(){
 const rows=allStock(),targets=vals(masters.locations).filter(x=>x.active!==false);
 const transferForm=form('transfer',s('fromLocationId','যে লোকেশন থেকে',activeLocations())+s('toLocationId','যে লোকেশনে',targets)+s('productId','পণ্য',vals(masters.products))+f('quantity','পরিমাণ','number',true,'min="0.001" step="any"')+f('remark','মন্তব্য','text',false));
 const movements=listEvents().filter(e=>['purchase','stock_adjustment','transfer','production','sales_delivery','sales_settlement','customer_return'].includes(e.type)).slice(0,50).map(e=>{let p=payload(e);let where=p.locationId?nameOf('locations',p.locationId):`${nameOf('locations',p.fromLocationId)} → ${nameOf('locations',p.toLocationId)}`;let qty=p.quantity??p.delta??`${p.inputQuantity||0} → ${p.outputQuantity||0}`;return [esc(e.date),esc(e.type),esc(nameOf('products',p.productId||p.inputProductId||p.outputProductId)),esc(where),esc(qty)]});
 return `<div class="grid">${panel('লোকেশনভিত্তিক স্টক স্থানান্তর',transferForm)}${isAdmin?panel('স্টক সমন্বয় (শুধু অ্যাডমিন)',form('stock_adjustment',s('locationId','লোকেশন',activeLocations())+s('productId','পণ্য',vals(masters.products))+f('delta','পরিমাণ (+ যোগ / − বিয়োগ)','number',true,'step="any"')+f('reason','কারণ'))):''}</div>${panel('বর্তমান মজুদ',table(['লোকেশন','পণ্য','পরিমাণ','গড় একক খরচ','আনুমানিক মূল্য'],rows.map(x=>[esc(x.location.name),esc(x.product.name),x.qty,fmtMoney(avgCost(x.product.id)),fmtMoney(x.value)])))}${panel('সাম্প্রতিক স্টক মুভমেন্ট',table(['তারিখ','ধরন','পণ্য','লোকেশন/রুট','পরিমাণ'],movements))}`;
}
function renderProduction(){const ps=vals(masters.products);return `<div class="grid">${panel('উৎপাদন এন্ট্রি',form('production',s('locationId','লোকেশন',activeLocations())+s('inputProductId','কাঁচামাল',ps)+s('outputProductId','তৈরি পণ্য',ps)+f('inputQuantity','ব্যবহৃত কাঁচামাল','number',true,'min="0.001" step="any"')+f('outputQuantity','উৎপাদিত পরিমাণ','number',true,'min="0.001" step="any"')+f('extraCost','অতিরিক্ত উৎপাদন খরচ (টাকা)','number',false,'min="0" step="0.01"')+area('remark','বিবরণ',false)))}${panel('উৎপাদনের ইতিহাস',table(['তারিখ','কাঁচামাল','ব্যবহৃত','তৈরি পণ্য','পরিমাণ','মোট খরচ'],listEvents('production').slice(0,25).map(e=>{let p=payload(e);return [esc(e.date),esc(nameOf('products',p.inputProductId)),p.inputQuantity,esc(nameOf('products',p.outputProductId)),p.outputQuantity,fmtMoney(p.totalCostPaisa)]})))}</div>`}
function renderSales(){
 const ps=vals(masters.products),ds=unsettledDeliveries();
 const deliveryForm=form('sales_delivery',
  s('locationId','লোকেশন',activeLocations())+
  s('productId','পণ্য',ps)+f('customer','কাস্টমারের নাম','text',true,'list="customerOptions"')+`<datalist id="customerOptions">${vals(masters.customers).map(x=>`<option value="${esc(x.name)}"></option>`).join('')}</datalist>`+
  f('quantity','পরিমাণ','number',true,'min="0.001" step="any"')+
  f('unitPrice','একক বিক্রয়মূল্য (টাকা)','number',true,'min="0" step="0.01"')+
  f('salesperson','বিক্রয়কর্মী','text',false));
 const settlementForm=ds.length ? form('sales_settlement',
  s('deliveryId','ডেলিভারি',ds.map(e=>({id:e.id,name:`${e.id.slice(-6)} · ${nameOf('products',payload(e).productId)} · ${payload(e).quantity}`})))+
  f('soldQuantity','বিক্রিত পরিমাণ','number',true,'min="0" step="any"')+
  f('returnedQuantity','ফেরত পরিমাণ','number',true,'min="0" step="any"')+
  f('received','প্রাপ্ত টাকা (টাকা)','number',true,'min="0" step="0.01"')) : '<p class="muted">সমন্বয়ের জন্য অপেক্ষমাণ ডেলিভারি নেই।</p>';
 const rows=deliveryRows().slice(0,50).map(x=>[
  esc(x.e.date),esc(x.e.id.slice(-8)),esc(nameOf('products',x.p.productId)),x.p.quantity,
  fmtMoney(x.p.unitPricePaisa),x.settlement?'<span class="tag">সমন্বিত</span>':'<span class="tag warn">অপেক্ষমাণ</span>'
 ]);
 const returnForm=form('customer_return',
  s('settlementId','সমন্বিত বিক্রয়',listEvents('sales_settlement').map(e=>({id:e.id,name:`${e.id.slice(-6)} · ${nameOf('products',payload(e).productId)}`})))+
  f('quantity','ভালো পণ্য ফেরত পরিমাণ','number',true,'min="0.001" step="any"')+
  f('refund','ফেরত টাকা (টাকা)','number',false,'min="0" step="0.01"')+
  f('remark','ফেরতের কারণ'));
 return `<div class="grid">${panel('বিক্রয় ডেলিভারি',deliveryForm)}${panel('বিক্রয় সমন্বয় / টাকা জমা',settlementForm)}</div>`+
  panel('বিক্রয় তালিকা',table(['তারিখ','ডেলিভারি','পণ্য','পরিমাণ','একক মূল্য','সমন্বয়'],rows))+
  panel('বিক্রয়-পরবর্তী ফেরত',returnForm);
}
function renderExpenses(){
 const req=listEvents('expense_request');
 const rows=req.map(e=>{
  const p=payload(e),decision=expenseDecision(e.id),approved=decision==='approved',paid=listEvents('expense_payment').some(x=>payload(x).expenseId===e.id);
  let action='—';
  if(isAdmin&&!decision) action=`<button class="small" data-action="expense-approve" data-id="${e.id}">অনুমোদন</button> <button class="small danger" data-action="expense-reject" data-id="${e.id}">প্রত্যাখ্যান</button>`;
  else if(isAdmin&&approved&&!paid) action=`<button class="small" data-action="expense-pay" data-id="${e.id}">পরিশোধ</button>`;
  return [esc(e.date),esc(p.category),fmtMoney(p.amountPaisa),paid?'পরিশোধিত':decision==='approved'?'অনুমোদিত':decision==='rejected'?'প্রত্যাখ্যাত':'অপেক্ষমাণ',action];
 });
 return `<div class="grid">${panel('খরচের আবেদন',form('expense_request',s('locationId','লোকেশন',activeLocations())+f('category','খরচের খাত')+f('amount','টাকার পরিমাণ','number',true,'min="0.01" step="0.01"')+area('description','বিবরণ')))}${panel('খরচ অনুমোদন ও পরিশোধ (অ্যাডমিন অনুমোদন)',table(['তারিখ','খাত','পরিমাণ','অবস্থা','কাজ'],rows))}</div>`;
}
function flattenAttendance(){let rows=[];if(isAdmin){for(const [uid,sub] of Object.entries(obj(attendance)))for(const [id,v] of Object.entries(obj(sub)))rows.push({uid,id,...obj(v)})}else for(const [id,v] of Object.entries(obj(attendance)))rows.push({uid:user.uid,id,...obj(v)});return rows.sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0))}
function renderAttendance(){
 const rows=flattenAttendance();
 const controls=`<p class="subtle">চেক-ইন/চেক-আউটে সেলফি ও GPS নেওয়া হবে। GPS আপডেট কেবল পেজ খোলা, সক্রিয় ও দৃশ্যমান থাকলে ৩০ মিনিট অন্তর চেষ্টা করবে। পেজ বন্ধ/ব্যাকগ্রাউন্ডে থাকলে চলবে না।</p>
 <label style="display:block;margin:10px 0"><input id="attendanceConsent" type="checkbox" style="width:auto"> ছবি ও অবস্থান সংগ্রহে সম্মতি দিচ্ছি</label>
 <label style="display:block;margin:10px 0">সেলফি<input id="attendancePhoto" type="file" accept="image/*" capture="user"></label>
 <div class="row"><button data-action="checkin">চেক-ইন</button><button class="secondary" data-action="checkout">চেক-আউট</button><button class="secondary" data-action="gps">GPS আপডেট</button></div><p id="attStatus" class="status"></p>`;
 const history=table(['সময়','কর্মী','ধরন','GPS','ছবি'],rows.slice(0,100).map(x=>[
  dateText(x.createdAt),esc(x.name||members[x.uid]?.name||x.uid),esc(x.kind),
  `<a class="maplink" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${encodeURIComponent(x.latitude+','+x.longitude)}">ম্যাপ</a>`,
  x.photo?`<a target="_blank" rel="noopener" href="${x.photo}">ছবি দেখুন</a>`:'—'
 ]));
 return `<div class="grid">${panel('নিজের হাজিরা',controls)}${panel(isAdmin?'সব কর্মীর হাজিরা':'আমার হাজিরা',history)}</div>`;
}
function renderLeave(){
 const req=flattenLeaves().filter(e=>isAdmin||e.uid===user.uid);
 const rows=req.map(e=>[
  esc(members[e.uid]?.name||e.name||e.uid),`${esc(e.startDate)} – ${esc(e.endDate)}`,esc(e.type),
  e.status==='approved'?'অনুমোদিত':e.status==='rejected'?'প্রত্যাখ্যাত':'অপেক্ষমাণ',
  isAdmin&&(!e.status||e.status==='pending')?`<button class="small" data-action="leave-approve" data-id="${e.id}" data-uid="${e.uid}">অনুমোদন</button> <button class="small danger" data-action="leave-reject" data-id="${e.id}" data-uid="${e.uid}">প্রত্যাখ্যান</button>`:'—'
 ]);
 return `<div class="grid">${panel('ছুটির আবেদন',form('leave_request',s('type','ছুটির ধরন',[{id:'annual',name:'বার্ষিক'},{id:'sick',name:'অসুস্থতা'},{id:'casual',name:'নৈমিত্তিক'},{id:'other',name:'অন্যান্য'}])+f('startDate','শুরুর তারিখ','date')+f('endDate','শেষ তারিখ','date')+area('reason','কারণ')))}${panel('আবেদন ও সিদ্ধান্ত',table(['কর্মী','তারিখ','ধরন','অবস্থা','সিদ্ধান্ত'],rows))}</div>`;
}
function renderAssets(){const acquired=listEvents('asset_acquire');return `<div class="grid">${panel('সম্পদ নিবন্ধন',form('asset_acquire',f('name','সম্পদের নাম')+s('locationId','লোকেশন',activeLocations())+f('cost','ক্রয়মূল্য (টাকা)','number',true,'min="0.01" step="0.01"')+f('salvage','অবশিষ্ট মূল্য (টাকা)','number',false,'min="0" step="0.01"')+f('lifeMonths','ব্যবহারকাল (মাস)','number',true,'min="1" step="1"')+f('acquisitionDate','তারিখ','date')))}${isAdmin?panel('মাসিক অবচয়',acquired.length?form('asset_depreciation',s('assetId','সম্পদ',acquired.map(e=>({id:e.id,name:payload(e).name})))+f('month','মাস','month')):'<p class="muted">আগে সম্পদ নিবন্ধন করুন।') : ''}</div>${panel('সম্পদ তালিকা',table(['সম্পদ','লোকেশন','মূল্য','ব্যবহারকাল','অবচয় এন্ট্রি'],acquired.map(e=>[esc(payload(e).name),esc(nameOf('locations',payload(e).locationId)),fmtMoney(payload(e).costPaisa),payload(e).lifeMonths,listEvents('asset_depreciation').filter(x=>payload(x).assetId===e.id).length])))}`}
function renderAccounting(){const accounts=vals(masters.accounts);let entries=listEvents('journal');let balances={};for(const a of accounts)balances[a.id]=0;for(const e of entries){const p=payload(e),amt=Number(p.amountPaisa||0);if(balances[p.debitAccount]!==undefined)balances[p.debitAccount]+=amt;if(balances[p.creditAccount]!==undefined)balances[p.creditAccount]-=amt}const pl=pAndL();return `<div class="grid">${panel('নতুন ডাবল-এন্ট্রি জার্নাল',form('journal',s('locationId','লোকেশন',activeLocations())+s('debitAccount','ডেবিট খাত',accounts)+s('creditAccount','ক্রেডিট খাত',accounts)+f('amount','পরিমাণ (টাকা)','number',true,'min="0.01" step="0.01"')+f('description','বিবরণ')))}${panel('লাভ-ক্ষতি (আনুমানিক)',`<div class="cards"><div class="card"><div class="k">বিক্রয় আয়</div><strong>${fmtMoney(pl.sales)}</strong></div><div class="card"><div class="k">বিক্রিত পণ্যের খরচ</div><strong>${fmtMoney(pl.cogs)}</strong></div><div class="card"><div class="k">পরিশোধিত খরচ</div><strong>${fmtMoney(pl.expenses)}</strong></div><div class="card"><div class="k">নিট লাভ/ক্ষতি</div><strong>${fmtMoney(pl.net)}</strong></div></div><p class="subtle">হিসাব: সমন্বিত বিক্রয় − আনুমানিক COGS − পরিশোধিত খরচ − বেতন − অবচয় + ম্যানুয়াল আয়/ব্যয়। বাকি বিক্রয়, কর, বেতন ও পুরোনো opening balance অন্তর্ভুক্ত না-ও থাকতে পারে।</p>`)} </div>${panel('হিসাব খাতের জার্নাল ব্যালান্স',table(['খাত','ধরন','ডেবিট-ক্রেডিট নেট (পয়সা)'],accounts.map(a=>[esc(a.name),esc(a.type),balances[a.id]||0])))}${panel('সাম্প্রতিক জার্নাল',table(['তারিখ','ডেবিট','ক্রেডিট','পরিমাণ','বিবরণ'],entries.slice(0,60).map(e=>{let p=payload(e);return [esc(e.date),esc(nameOf('accounts',p.debitAccount)),esc(nameOf('accounts',p.creditAccount)),fmtMoney(p.amountPaisa),esc(p.description)]})))}`}
function renderPayroll(){
 if(!isAdmin)return '<div class="panel">বেতন-সংক্রান্ত সংবেদনশীল তথ্য শুধু অ্যাডমিন দেখতে পারবেন।</div>';
 const staff=vals(members).filter(m=>m.role==='operational');
 const salaries=vals(payrollData.salaries),runs=vals(payrollData.runs);
 return `<div class="grid">${panel('মাসিক বেতন নির্ধারণ',form('salary_set',s('employeeUid','কর্মী',staff.map(x=>({id:x.id,name:x.name||x.id})))+f('month','কার্যকর মাস','month')+f('monthlySalary','মাসিক বেতন (টাকা)','number',true,'min="0" step="0.01"')))}${panel('মাসিক বেতন প্রসেস',form('payroll_run',s('employeeUid','কর্মী',staff.map(x=>({id:x.id,name:x.name||x.id})))+f('month','বেতনের মাস','month')))}</div>${panel('বেতন সেটিং',table(['কর্মী','মাস','বেতন'],salaries.map(e=>[esc(members[e.employeeUid]?.name||e.employeeUid),esc(e.month),fmtMoney(e.monthlySalaryPaisa)])))}${panel('প্রসেস করা বেতন',table(['কর্মী','মাস','পরিমাণ','তারিখ'],runs.map(e=>[esc(members[e.employeeUid]?.name||e.employeeUid),esc(e.month),fmtMoney(e.amountPaisa),dateText(e.createdAt)])))}`;
}
function renderReports(){const pl=pAndL();return `${panel('ব্যবসার সারাংশ',`<div class="cards"><div class="card"><div class="k">বিক্রয়</div><strong>${fmtMoney(pl.sales)}</strong></div><div class="card"><div class="k">COGS</div><strong>${fmtMoney(pl.cogs)}</strong></div><div class="card"><div class="k">খরচ</div><strong>${fmtMoney(pl.expenses+pl.depr)}</strong></div><div class="card"><div class="k">নিট</div><strong>${fmtMoney(pl.net)}</strong></div></div>`)}${panel('স্টক রিপোর্ট',table(['লোকেশন','পণ্য','পরিমাণ','একক মূল্য','স্টক মূল্য'],allStock().map(x=>[esc(x.location.name),esc(x.product.name),x.qty,fmtMoney(avgCost(x.product.id)),fmtMoney(x.value)])))}${panel('লেনদেন রিপোর্ট',table(['তারিখ','ধরন','ব্যবহারকারী','রেফারেন্স'],listEvents().slice(0,100).map(e=>[esc(e.date),esc(e.type),esc(e.actorName),esc(shortPayload(payload(e)))])))}`}
function renderWorkers(){
 if(!isAdmin)return '<div class="panel">শুধু অ্যাডমিন কর্মী ব্যবস্থাপনা করতে পারবেন।</div>';
 const staff=vals(members).filter(m=>m.id!==ADMIN_UID);
 const intro='<p class="subtle">আগে Firebase Authentication → Users থেকে কর্মীর Email/Password অ্যাকাউন্ট তৈরি করুন। Login email: 01XXXXXXXXX@idea-press.example.com। এরপর UID এখানে দিন। এই ফর্ম Auth user তৈরি করে না।</p>';
 return `${panel('নতুন কর্মী প্রোফাইল',intro+form('worker',f('uid','Firebase Auth UID')+f('name','কর্মীর নাম')+s('location','নিজস্ব লোকেশন',vals(masters.locations))+s('active','অবস্থা',[{id:'true',name:'সক্রিয়'},{id:'false',name:'নিষ্ক্রিয়'}])))}${panel('কর্মী তালিকা',table(['UID','নাম','ভূমিকা','লোকেশন','অবস্থা','অ্যাকশন'],staff.map(m=>[esc(m.id),esc(m.name),esc(m.role),esc(nameOf('locations',m.location)),m.active?'সক্রিয়':'নিষ্ক্রিয়',`<button class="small ${m.active?'danger':'secondary'}" data-action="worker-toggle" data-uid="${esc(m.id)}">${m.active?'নিষ্ক্রিয় করুন':'সক্রিয় করুন'}</button>`])))}`;
}
function renderBackup(){return `${panel('JSON ব্যাকআপ',`<p class="subtle">আপনার অনুমোদিত Realtime Database ডেটা JSON আকারে ডাউনলোড হবে। ব্যাকআপে হাজিরার ছবি থাকতে পারে; নিরাপদে সংরক্ষণ করুন।</p><button data-action="backup">ব্যাকআপ ডাউনলোড</button>`)}${panel('ডেটা স্ট্রাকচার',`<p class="subtle">/members · /masters · /erp/events · /erp/attendance</p><p class="subtle">এই সংস্করণ Firestore/Cloud Functions/Node.js API ব্যবহার করে না।</p>`)}`}

async function logEvent(type,payloadData){
 if(!user||(!isAdmin&&member?.active!==true))throw Error('অ্যাকাউন্ট সক্রিয় নয়।');
 if(!payloadData||typeof payloadData!=='object')throw Error('লেনদেনের ডেটা পাওয়া যায়নি।');
 const from=payloadData.fromLocationId||payloadData.locationId||member?.location;
 if(!from)throw Error('আপনার কর্মী প্রোফাইলে লোকেশন নির্ধারণ করা নেই।');
 const r=push(ref(db,`erp/events/${from}`));
 const value={actor:user.uid,actorName:member?.name||user.email||user.uid,type,date:today(),createdAt:serverTimestamp(),payload:payloadData};
 await set(r,value);
 if(type==='transfer'&&payloadData.toLocationId&&payloadData.toLocationId!==from){
  await set(ref(db,`erp/events/${payloadData.toLocationId}/${r.key}`),value);
 }
 return r.key;
}
async function saveLeave(fd){
 const r=push(ref(db,`erp/leaves/${user.uid}`));
 await set(r,{uid:user.uid,name:member?.name||user.uid,type:fd.type,startDate:fd.startDate,endDate:fd.endDate,reason:fd.reason.trim(),status:'pending',createdAt:serverTimestamp()});
}
async function putMaster(path,id,value){if(!isAdmin)throw Error('শুধু অ্যাডমিন Master Data পরিবর্তন করতে পারবেন।');await set(ref(db,`masters/${path}/${id}`),{...value,active:value.active!==false,createdAt:serverTimestamp(),updatedBy:user.uid})}
function requirePositive(n,label){const v=Number(n);if(!Number.isFinite(v)||v<=0)throw Error(label+' শূন্যের বেশি হতে হবে।');return v}
function requireLocation(locationId){const allowed=activeLocations().some(x=>x.id===locationId);if(!allowed)throw Error('এই লোকেশনে আপনার কাজের অনুমতি নেই।')}
async function onSubmit(ev){const formEl=ev.target.closest('form[data-form]');if(!formEl)return;ev.preventDefault();const kind=formEl.dataset.form,fd=Object.fromEntries(new FormData(formEl));const btn=formEl.querySelector('button[type="submit"]');if(btn)btn.disabled=true;try{switch(kind){
case'location':{const id=keySafe(fd.id);if(id.length<2||!fd.name.trim())throw Error('সঠিক লোকেশন ID ও নাম দিন।');await putMaster('locations',id,{name:fd.name.trim(),active:true});break}
case'product':{if(!fd.name.trim())throw Error('পণ্যের নাম দিন।');const p=push(ref(db,'masters/products'));await set(p,{name:fd.name.trim(),unit:fd.unit.trim()||'পিস',category:fd.category.trim()||'সাধারণ',sellingPricePaisa:takaToPaisa(fd.sellingPrice||0),costPaisa:0,active:true,createdAt:serverTimestamp()});break}
case'customer':{if(!fd.name.trim())throw Error('কাস্টমারের নাম দিন।');const r=push(ref(db,'masters/customers'));await set(r,{name:fd.name.trim(),phone:(fd.phone||'').trim(),address:(fd.address||'').trim(),active:true,createdAt:serverTimestamp()});break}
case'supplier':{if(!fd.name.trim())throw Error('সাপ্লায়ারের নাম দিন।');const r=push(ref(db,'masters/suppliers'));await set(r,{name:fd.name.trim(),phone:(fd.phone||'').trim(),address:(fd.address||'').trim(),active:true,createdAt:serverTimestamp()});break}
case'account':{let id=keySafe(fd.id);if(id.length<2)throw Error('খাত ID দিন।');await putMaster('accounts',id,{name:fd.name.trim(),type:fd.type});break}
case'bom':{if(fd.inputProductId===fd.outputProductId)throw Error('কাঁচামাল ও তৈরি পণ্য আলাদা হতে হবে।');let id=fd.inputProductId+'_'+fd.outputProductId;await putMaster('boms',id,{inputProductId:fd.inputProductId,outputProductId:fd.outputProductId,inputQuantity:requirePositive(fd.inputQuantity,'কাঁচামালের পরিমাণ'),outputQuantity:requirePositive(fd.outputQuantity,'তৈরি পরিমাণ')});break}
case'purchase':{requireLocation(fd.locationId);const qty=requirePositive(fd.quantity,'পরিমাণ'),unit=takaToPaisa(fd.unitCost),extras=takaToPaisa(fd.otherCost||0);const total=qty*unit+extras;if(!Number.isSafeInteger(Math.round(total)))throw Error('মোট মূল্য অনেক বড়।');await logEvent('purchase',{locationId:fd.locationId,productId:fd.productId,quantity:qty,supplier:fd.supplier.trim(),unitCostPaisa:unit,otherCostPaisa:extras,totalCostPaisa:Math.round(total),paymentMode:fd.paymentMode});break}
case'stock_adjustment':{if(!isAdmin)throw Error('শুধু অ্যাডমিন');requireLocation(fd.locationId);const delta=Number(fd.delta);if(!Number.isFinite(delta)||delta===0)throw Error('সমন্বয়ের পরিমাণ শূন্য হতে পারবে না।');if(stockAt(fd.locationId,fd.productId)+delta<0)throw Error('স্টক শূন্যের নিচে নামতে পারবে না।');await logEvent('stock_adjustment',{locationId:fd.locationId,productId:fd.productId,delta,reason:fd.reason.trim()});break}
case'transfer':{requireLocation(fd.fromLocationId);if(!vals(masters.locations).some(x=>x.id===fd.toLocationId&&x.active!==false))throw Error('গন্তব্য লোকেশন পাওয়া যায়নি।');if(fd.fromLocationId===fd.toLocationId)throw Error('উৎস ও গন্তব্য লোকেশন আলাদা হতে হবে।');const qty=requirePositive(fd.quantity,'পরিমাণ');if(stockAt(fd.fromLocationId,fd.productId)<qty)throw Error('উৎস লোকেশনে পর্যাপ্ত স্টক নেই।');await logEvent('transfer',{fromLocationId:fd.fromLocationId,toLocationId:fd.toLocationId,productId:fd.productId,quantity:qty,remark:fd.remark.trim()});break}
case'production':{requireLocation(fd.locationId);if(fd.inputProductId===fd.outputProductId)throw Error('কাঁচামাল ও তৈরি পণ্য আলাদা হতে হবে।');const iq=requirePositive(fd.inputQuantity,'কাঁচামালের পরিমাণ'),oq=requirePositive(fd.outputQuantity,'তৈরি পণ্যের পরিমাণ');if(stockAt(fd.locationId,fd.inputProductId)<iq)throw Error('কাঁচামালের স্টক পর্যাপ্ত নয়।');const extra=takaToPaisa(fd.extraCost||0),cost=Math.round(iq*avgCost(fd.inputProductId)+extra);await logEvent('production',{locationId:fd.locationId,inputProductId:fd.inputProductId,outputProductId:fd.outputProductId,inputQuantity:iq,outputQuantity:oq,extraCostPaisa:extra,totalCostPaisa:cost,remark:fd.remark.trim()});break}
case'sales_delivery':{requireLocation(fd.locationId);const qty=requirePositive(fd.quantity,'পরিমাণ');if(stockAt(fd.locationId,fd.productId)<qty)throw Error('স্টক পর্যাপ্ত নয়।');const id=await logEvent('sales_delivery',{locationId:fd.locationId,productId:fd.productId,quantity:qty,unitPricePaisa:takaToPaisa(fd.unitPrice),cogsPerUnitPaisa:avgCost(fd.productId),customer:fd.customer.trim(),salesperson:fd.salesperson.trim()});setStatus('বিক্রয় ডেলিভারি সংরক্ষিত। রেফারেন্স: '+id,true);break}
case'sales_settlement':{const delivery=findEvent(fd.deliveryId);if(!delivery||delivery.type!=='sales_delivery')throw Error('ডেলিভারি পাওয়া যায়নি।');const p=payload(delivery);if(!unsettledDeliveries().some(x=>x.id===delivery.id))throw Error('এই ডেলিভারি আগে সমন্বয় হয়েছে।');requireLocation(p.locationId);const sold=Number(fd.soldQuantity||0),returned=Number(fd.returnedQuantity||0);if(!Number.isFinite(sold)||!Number.isFinite(returned)||sold<0||returned<0||sold+returned<=0||sold+returned>Number(p.quantity))throw Error('বিক্রিত ও ফেরত পরিমাণ সঠিকভাবে দিন; যোগফল ডেলিভারির বেশি বা শূন্য হতে পারবে না।');const expected=sold*Number(p.unitPricePaisa);await logEvent('sales_settlement',{deliveryId:delivery.id,locationId:p.locationId,productId:p.productId,soldQuantity:sold,returnedQuantity:returned,unitPricePaisa:p.unitPricePaisa,cogsPerUnitPaisa:p.cogsPerUnitPaisa,expectedPaisa:expected,receivedPaisa:takaToPaisa(fd.received)});break}
case'customer_return':{const settlement=findEvent(fd.settlementId);if(!settlement||settlement.type!=='sales_settlement')throw Error('মূল বিক্রয় সমন্বয় পাওয়া যায়নি।');const p=payload(settlement),qty=requirePositive(fd.quantity,'ফেরত পরিমাণ');if(!isAdmin&&p.locationId!==member.location)throw Error('নিজস্ব লোকেশনের বাইরে ফেরত নেওয়া যাবে না।');await logEvent('customer_return',{locationId:p.locationId,productId:p.productId,settlementId:settlement.id,quantity:qty,refundPaisa:takaToPaisa(fd.refund||0),remark:fd.remark.trim()});break}
case'expense_request':{requireLocation(fd.locationId);await logEvent('expense_request',{locationId:fd.locationId,category:fd.category.trim(),amountPaisa:takaToPaisa(fd.amount),description:fd.description.trim()});break}
case'leave_request':{if(!isAdmin&&!member.location)throw Error('আপনার প্রোফাইলে লোকেশন নির্ধারিত নেই।');if(fd.startDate>fd.endDate)throw Error('শেষ তারিখ শুরুর তারিখের আগে হতে পারে না।');await saveLeave(fd);break}
case'asset_acquire':{requireLocation(fd.locationId);await logEvent('asset_acquire',{name:fd.name.trim(),locationId:fd.locationId,costPaisa:takaToPaisa(fd.cost),salvagePaisa:takaToPaisa(fd.salvage||0),lifeMonths:requirePositive(fd.lifeMonths,'ব্যবহারকাল'),acquisitionDate:fd.acquisitionDate});break}
case'asset_depreciation':{const asset=findEvent(fd.assetId);if(!asset||asset.type!=='asset_acquire')throw Error('সম্পদ পাওয়া যায়নি।');const p=payload(asset),already=listEvents('asset_depreciation').filter(x=>payload(x).assetId===asset.id).some(x=>payload(x).month===fd.month);if(already)throw Error('এই মাসের অবচয় আগে পোস্ট করা হয়েছে।');const amount=Math.max(0,Math.round((p.costPaisa-p.salvagePaisa)/p.lifeMonths));await logEvent('asset_depreciation',{assetId:asset.id,locationId:p.locationId,month:fd.month,amountPaisa:amount});break}
case'journal':{if(fd.debitAccount===fd.creditAccount)throw Error('ডেবিট ও ক্রেডিট খাত আলাদা হতে হবে।');await logEvent('journal',{locationId:fd.locationId,debitAccount:fd.debitAccount,creditAccount:fd.creditAccount,amountPaisa:takaToPaisa(fd.amount),description:fd.description.trim()});break}
case'salary_set':{if(!isAdmin)throw Error('শুধু অ্যাডমিন');const id=fd.employeeUid+'_'+fd.month;await set(ref(db,'erp/private/payroll/salaries/'+id),{employeeUid:fd.employeeUid,month:fd.month,monthlySalaryPaisa:takaToPaisa(fd.monthlySalary),createdAt:serverTimestamp(),createdBy:user.uid});break}
case'payroll_run':{if(!isAdmin)throw Error('শুধু অ্যাডমিন');const salaries=vals(payrollData.salaries).filter(x=>x.employeeUid===fd.employeeUid&&x.month<=fd.month).sort((a,b)=>String(a.month).localeCompare(String(b.month)));const salary=salaries.at(-1);if(!salary)throw Error('এই মাসের জন্য বেতন নির্ধারিত নেই।');if(vals(payrollData.runs).some(x=>x.employeeUid===fd.employeeUid&&x.month===fd.month))throw Error('এই মাসের বেতন আগে প্রসেস হয়েছে।');const r=push(ref(db,'erp/private/payroll/runs'));await set(r,{employeeUid:fd.employeeUid,month:fd.month,amountPaisa:salary.monthlySalaryPaisa,createdAt:serverTimestamp(),createdBy:user.uid});await logEvent('payroll_cost',{locationId:members[fd.employeeUid]?.location||'dhaka',month:fd.month,amountPaisa:salary.monthlySalaryPaisa});break}
case'worker':{if(!isAdmin)throw Error('শুধু অ্যাডমিন');if(!/^[A-Za-z0-9_-]{10,128}$/.test(fd.uid.trim()))throw Error('সঠিক Firebase UID দিন।');if(fd.uid.trim()===ADMIN_UID)throw Error('অ্যাডমিন UID কর্মী হিসেবে যোগ করবেন না।');await set(ref(db,'members/'+fd.uid.trim()),{name:fd.name.trim(),active:fd.active==='true',role:'operational',location:fd.location,createdAt:serverTimestamp(),createdBy:user.uid});break}
default:throw Error('অজানা ফর্ম।');}
formEl.reset();setStatus('তথ্য সফলভাবে Realtime Database-এ সংরক্ষিত হয়েছে।',true);render();}catch(err){console.error(err);setStatus(err.message||'সংরক্ষণ করা যায়নি।')}finally{if(btn)btn.disabled=false}}

async function initDefaults(){if(!isAdmin)return;const current=obj((await get(ref(db,'masters'))).val());const baseLocs={dhaka:{name:'ঢাকা',active:true},pakundia:{name:'পাকুন্দিয়া',active:true},katiadi:{name:'কটিয়াদী',active:true}};const baseAccounts={cash:{name:'নগদ',type:'asset',active:true},bank:{name:'ব্যাংক',type:'asset',active:true},inventory:{name:'মজুদ',type:'asset',active:true},receivable:{name:'পাওনা',type:'asset',active:true},payable:{name:'প্রদেয়',type:'liability',active:true},capital:{name:'মূলধন',type:'equity',active:true},sales:{name:'বিক্রয় আয়',type:'income',active:true},expense:{name:'সাধারণ ব্যয়',type:'expense',active:true},cogs:{name:'বিক্রিত পণ্যের খরচ',type:'expense',active:true}};const updates={};for(const [id,v] of Object.entries(baseLocs))if(!current.locations?.[id])updates[`locations/${id}`]=v;for(const [id,v] of Object.entries(baseAccounts))if(!current.accounts?.[id])updates[`accounts/${id}`]=v;if(Object.keys(updates).length)await update(ref(db,'masters'),updates);setStatus('প্রাথমিক লোকেশন ও হিসাব খাত প্রস্তুত।',true)}

async function geolocate(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(Error('এই ডিভাইসে GPS পাওয়া যায়নি।'));navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),()=>reject(Error('GPS অনুমতি দিন এবং অবস্থান চালু করুন।')),{enableHighAccuracy:true,timeout:20000,maximumAge:0})})}
async function photoData(){const file=$('attendancePhoto')?.files?.[0];if(!file)throw Error('চেক-ইন/আউটের জন্য সেলফি নির্বাচন করুন।');if(!file.type.startsWith('image/')||file.size>12000000)throw Error('১২ MB-এর কম ছবি দিন।');const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),ratio=Math.min(1,260/Math.max(bitmap.width,bitmap.height));canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();let q=.48,data=canvas.toDataURL('image/jpeg',q);while(data.length>135000&&q>.2){q-=.06;data=canvas.toDataURL('image/jpeg',q)}if(data.length>140000)throw Error('ছবিটি ছোট করা যাচ্ছে না; কম রেজোলিউশনের ছবি নিন।');return data}
async function attendanceWrite(kind,withPhoto=true){if(!$('attendanceConsent')?.checked)throw Error('আগে ছবি ও অবস্থান সংগ্রহের সম্মতি দিন।');let location=await geolocate(),photo=withPhoto?await photoData():null;const r=push(ref(db,`erp/attendance/${user.uid}`));let v={uid:user.uid,name:member.name,kind,...location,createdAt:serverTimestamp()};if(photo)v.photo=photo;await set(r,v);return r.key}
async function handleAttendance(kind){try{const status=$('attStatus');status.textContent='GPS ও ছবি নেওয়া হচ্ছে…';const key=await attendanceWrite(kind,true);status.className='status good';status.textContent=kind+' সংরক্ষিত হয়েছে · '+key;activeShift=kind==='চেক-ইন';$('attendancePhoto').value='';if(activeShift)startGpsTracking();else{clearInterval(trackingTimer);trackingTimer=null}render()}catch(e){$('attStatus').textContent=e.message||'হাজিরা সংরক্ষণ ব্যর্থ।'}}
function startGpsTracking(){clearInterval(trackingTimer);trackingTimer=setInterval(async()=>{if(!activeShift||document.visibilityState!=='visible'||!auth.currentUser)return;try{const location=await geolocate(),r=push(ref(db,`erp/attendance/${user.uid}`));await set(r,{uid:user.uid,name:member.name,kind:'GPS আপডেট',...location,createdAt:serverTimestamp()});const s=$('attStatus');if(s)s.textContent='GPS আপডেট হয়েছে: '+new Date().toLocaleTimeString('bn-BD')}catch(e){console.warn('GPS update failed',e)}},30*60*1000)}

async function handleAction(e){
 const b=e.target.closest('[data-action]');if(!b)return;
 const a=b.dataset.action,id=b.dataset.id,uid=b.dataset.uid;
 try{
  b.disabled=true;
  if(a==='seed'){await initDefaults();render()}
  else if(a==='worker-toggle'){if(!isAdmin)throw Error('শুধু অ্যাডমিন কর্মীর অবস্থা বদলাতে পারবেন।');const target=members[uid];if(!target||uid===ADMIN_UID)throw Error('কর্মী পাওয়া যায়নি।');await update(ref(db,`members/${uid}`),{active:target.active!==true,updatedAt:serverTimestamp(),updatedBy:user.uid});render()}
  else if(a==='expense-approve'||a==='expense-reject'){
   if(!isAdmin)throw Error('শুধু অ্যাডমিন অনুমোদন দিতে পারবেন।');
   const ex=findEvent(id),p=payload(ex);await logEvent('expense_review',{expenseId:id,locationId:p.locationId,decision:a==='expense-approve'?'approved':'rejected',remark:''});render();
  }else if(a==='expense-pay'){
   if(!isAdmin)throw Error('শুধু অ্যাডমিন');const ex=findEvent(id);if(!isApprovedExpense(id))throw Error('খরচ অনুমোদিত নয়।');
   await logEvent('expense_payment',{expenseId:id,locationId:payload(ex).locationId,amountPaisa:payload(ex).amountPaisa,method:'cash'});render();
  }else if(a==='leave-approve'||a==='leave-reject'){
   if(!isAdmin)throw Error('শুধু অ্যাডমিন');const leave=latestLeave(id);if(!leave)throw Error('ছুটির আবেদন পাওয়া যায়নি।');
   await update(ref(db,`erp/leaves/${uid}/${id}`),{status:a==='leave-approve'?'approved':'rejected',reviewedAt:serverTimestamp(),reviewedBy:user.uid});render();
  }else if(a==='checkin')await handleAttendance('চেক-ইন');
  else if(a==='checkout')await handleAttendance('চেক-আউট');
  else if(a==='gps'){
   const st=$('attStatus');st.textContent='GPS নেওয়া হচ্ছে…';if(!$('attendanceConsent').checked)throw Error('সম্মতি দিন।');
   const loc=await geolocate(),r=push(ref(db,`erp/attendance/${user.uid}`));await set(r,{uid:user.uid,name:member.name,kind:'GPS আপডেট',...loc,createdAt:serverTimestamp()});st.className='status good';st.textContent='GPS আপডেট সংরক্ষিত।';
  }else if(a==='backup'){
   const [m,e1,a1,mm,ll,pp]=await Promise.all([get(ref(db,'masters')),get(ref(db,isAdmin?'erp/events':`erp/events/${member.location}`)),get(ref(db,isAdmin?'erp/attendance':`erp/attendance/${user.uid}`)),isAdmin?get(ref(db,'members')):Promise.resolve(null),isAdmin?get(ref(db,'erp/leaves')):get(ref(db,`erp/leaves/${user.uid}`)),isAdmin?get(ref(db,'erp/private/payroll')):Promise.resolve(null)]);
   const data={exportedAt:new Date().toISOString(),masters:m.val(),events:e1.val(),attendance:a1.val(),members:isAdmin?mm.val():undefined,leaves:ll.val(),payroll:pp?.val()};
   const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='idea-press-rtdb-backup-'+today()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('ব্যাকআপ ডাউনলোড হয়েছে।',true);
  }
 }catch(err){setStatus(err.message||'কাজটি সম্পন্ন হয়নি।')}finally{b.disabled=false}
}

document.addEventListener('submit',onSubmit);$('page').addEventListener('click',handleAction);$('logout').addEventListener('click',()=>signOut(auth));$('loginForm').addEventListener('submit',async e=>{e.preventDefault();const phone=$('phone').value.replace(/\D/g,'');if(!/^01[3-9]\d{8}$/.test(phone)){$('loginStatus').textContent='বাংলাদেশের ১১ সংখ্যার মোবাইল নম্বর দিন।';return}$('loginStatus').textContent='লগইন করা হচ্ছে…';if(!isDatabaseUrlConfigured()){$('loginStatus').textContent='Firebase Console থেকে Realtime Database URL কপি করে main.mjs-এর databaseURL-এ বসান।';return}try{await signInWithEmailAndPassword(auth,phone+'@idea-press.example.com',$('password').value);$('password').value=''}catch(err){console.error(err);$('loginStatus').textContent='লগইন ব্যর্থ। Authentication-এ Email/Password চালু, ইমেইল, পাসওয়ার্ড ও Authorized Domain পরীক্ষা করুন। '+(err.code||'')}});

function stopListeners(){unsubs.forEach(fn=>fn());unsubs=[];clearInterval(trackingTimer);trackingTimer=null;activeShift=false;}
function subscribeData(){
 stopListeners();
 const mastersRef=ref(db,'masters'),eventsRef=isAdmin?ref(db,'erp/events'):ref(db,`erp/events/${member.location}`),
 attRef=isAdmin?ref(db,'erp/attendance'):ref(db,`erp/attendance/${user.uid}`),
 membersRef=isAdmin?ref(db,'members'):ref(db,`members/${user.uid}`),
 leaveRef=isAdmin?ref(db,'erp/leaves'):ref(db,`erp/leaves/${user.uid}`);
 unsubs.push(onValue(mastersRef,s=>{masters=obj(s.val());render()},err=>setStatus('Master Data পড়া যায়নি: '+err.message)));
 unsubs.push(onValue(eventsRef,s=>{events=obj(s.val());render()},err=>setStatus('লেনদেন পড়া যায়নি: '+err.message)));
 unsubs.push(onValue(attRef,s=>{attendance=obj(s.val());if(!isAdmin){const shifts=vals(attendance).filter(x=>x.kind==='চেক-ইন'||x.kind==='চেক-আউট').sort((a,b)=>(Number(b.createdAt)||0)-(Number(a.createdAt)||0));activeShift=shifts[0]?.kind==='চেক-ইন';if(activeShift&&!trackingTimer)startGpsTracking();if(!activeShift&&trackingTimer){clearInterval(trackingTimer);trackingTimer=null;}}render()},err=>setStatus('হাজিরা পড়া যায়নি: '+err.message)));
 unsubs.push(onValue(membersRef,s=>{if(isAdmin)members=obj(s.val());else members={[user.uid]:s.val()||{}};render()},err=>setStatus('কর্মী তথ্য পড়া যায়নি: '+err.message)));
 unsubs.push(onValue(leaveRef,s=>{leaves=obj(s.val());render()},err=>setStatus('ছুটির তথ্য পড়া যায়নি: '+err.message)));
 if(isAdmin)unsubs.push(onValue(ref(db,'erp/private/payroll'),s=>{payrollData=obj(s.val());payrollData.salaries=obj(payrollData.salaries);payrollData.runs=obj(payrollData.runs);render()},err=>setStatus('বেতনের তথ্য পড়া যায়নি: '+err.message)));
}

onAuthStateChanged(auth,async u=>{stopListeners();user=u;member=null;isAdmin=false;masters={locations:{},products:{},accounts:{},boms:{}};events={};attendance={};leaves={};payrollData={salaries:{},runs:{}};members={};if(!u){$('app').classList.add('hidden');$('loginCover').classList.remove('hidden');$('loginStatus').textContent='মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে প্রবেশ করুন।';return}try{if(!isDatabaseUrlConfigured())throw Error('Firebase Console থেকে Realtime Database URL কপি করে main.mjs-এর databaseURL-এ বসান।');db=getDatabase(auth.app,firebaseConfig.databaseURL);isAdmin=u.uid===ADMIN_UID;if(isAdmin){let snap=await get(ref(db,'members/'+u.uid));if(!snap.exists()){await set(ref(db,'members/'+u.uid),{name:'Administrator',active:true,role:'admin',location:'',createdAt:serverTimestamp()});member={name:'Administrator',active:true,role:'admin'}}else member=snap.val();if(member.active!==true)throw Error('অ্যাডমিন প্রোফাইল নিষ্ক্রিয়।')}else{const snap=await get(ref(db,'members/'+u.uid));if(!snap.exists()||snap.val()?.active!==true||snap.val()?.role!=='operational')throw Error('আপনার কর্মী প্রোফাইল সক্রিয় নয়। অ্যাডমিনকে UID ও Operational Permission দিতে বলুন।');member=snap.val();if(!member.location)throw Error('আপনার কর্মী প্রোফাইলে একটি লোকেশন নির্ধারণ করা নেই। অ্যাডমিনকে সেটি নির্ধারণ করতে বলুন।')}$('loginCover').classList.add('hidden');$('app').classList.remove('hidden');pageName='dashboard';subscribeData();if(isAdmin){try{await initDefaults()}catch(e){console.warn('Defaults not initialized yet',e)}}render()}catch(err){console.error(err);$('loginCover').classList.remove('hidden');$('loginStatus').textContent=err.message||'Realtime Database-এ সংযোগ করা যায়নি। Database URL ও Rules পরীক্ষা করুন।';await signOut(auth)}});
