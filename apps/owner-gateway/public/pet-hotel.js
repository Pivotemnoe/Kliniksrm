const app=document.querySelector('#hotel-owner-app');
const base='/v1/portal/pet-hotel',pendingKey='hotel-owner-pending-v1',draftKey='hotel-site-draft-v1';
const statusLabel={CONFIRMED:'Забронирован',IN_HOUSE:'Питомец у нас',CHECKED_OUT:'Проживание завершено',CANCELLED:'Бронь отменена',NO_SHOW:'Не состоялось'};
let state=null,ownerKey='',draft={},offers=[],moving=null,busy=false,timer=null,polling=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rub=v=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v));
const when=v=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'long',timeStyle:'short'}).format(new Date(v));
const date=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
const clock=v=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v));
const read=k=>{try{return JSON.parse(sessionStorage.getItem(k)||'null');}catch{return null;}};
const save=(k,v)=>{if(v===null)sessionStorage.removeItem(k);else sessionStorage.setItem(k,JSON.stringify(v));};
const incoming=new URLSearchParams(location.hash.slice(1)).get('draft');
if(incoming&&/^[A-Za-z0-9_-]{32,100}$/.test(incoming)){save(draftKey,incoming);history.replaceState({},'','/portal/pet-hotel');}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,body){
  const r=await fetch(path,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(12000),...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
  const data=await r.json().catch(()=>null);
  if(!r.ok){const e=new Error(Array.isArray(data?.message)?data.message.join('. '):data?.message||'Нет связи с кабинетом. Повторите проверку.');e.status=r.status;throw e;}return data;
}
async function wait(operation){
  for(let i=0;i<25&&operation.status==='PENDING';i++){await sleep(800);operation=await api(base+'/operations/'+encodeURIComponent(operation.id));}
  if(operation.status==='PENDING')throw new Error('CRM ещё проверяет запрос. Нажмите «Обновить»: сохраним тот же запрос, повторной брони не будет.');
  if(operation.status!=='DONE'){const e=new Error(operation.error||'Не удалось выполнить действие');e.terminal=true;throw e;}return operation.result;
}
async function recover(){
  const pending=read(pendingKey);if(!pending)return;
  if(pending.ownerKey!==ownerKey){save(pendingKey,null);return;}
  try{
    let operation;
    try{operation=await api(base+'/operations/by-key/'+encodeURIComponent(pending.clientKey));}
    catch(e){if(e.status!==404)throw e;operation=await api(base+'/operations',pending.command);}
    await wait(operation);save(pendingKey,null);
  }catch(e){if(e.terminal)save(pendingKey,null);throw e;}
}
async function command(kind,input={}){
  const mutate=['BOOK','RESCHEDULE','CANCEL','PET_CREATE'].includes(kind);
  if(mutate)await recover();
  const body={kind,input,clientKey:crypto.randomUUID()};
  if(mutate)save(pendingKey,{ownerKey,clientKey:body.clientKey,command:body});
  try{const result=await wait(await api(base+'/operations',body));if(mutate)save(pendingKey,null);return result;}
  catch(e){if(mutate&&(e.terminal||[400,409,422].includes(e.status)))save(pendingKey,null);throw e;}
}
async function start(){
  try{
    const session=await api(base+'/session');ownerKey=session.ownerKey;
    await recover();state=await command('STATE');
    const token=read(draftKey);if(token){try{draft={...draft,...await api(base+'/draft',{token})};save(draftKey,null);}catch(e){if(e.status===404)save(draftKey,null);else throw e;}}
    document.querySelector('#logout').hidden=false;render();
  }catch(e){if([401,403].includes(e.status))login();else failure(e.message);}
}
function failure(message){app.innerHTML=`<section class="state"><p class="eyebrow">Кабинет зоогостиницы</p><h1>Проверяем связь.</h1><p class="error" role="alert">${esc(message)}</p><button class="button" id="retry">Обновить</button><p class="muted">Сохранённый запрос можно проверить после восстановления связи.</p><a href="tel:+79284214542">Позвонить администратору ↗</a></section>`;document.querySelector('#retry').onclick=()=>void start();}
function login(){
  clearInterval(timer);document.querySelector('#logout').hidden=true;
  app.innerHTML=`<section class="login-layout"><div class="login-copy"><p class="eyebrow">Кошки и небольшие собаки</p><h1>Пока вы<br>в отъезде.</h1><p>Выбранный номер, даты и стоимость проживания — в вашем кабинете. После входа проверим свободное место повторно.</p><p class="muted">Пользуемся общим кабинетом владельца клиники. Если он уже связан с вашим MAX, ваши питомцы появятся здесь.</p></div><div class="login-card"><p class="eyebrow">Зоогостиница TemichevVET</p><h2>Войти через MAX</h2><p>Откроем текущего бота клиники. Подтвердите вход и вернитесь на эту страницу.</p><button class="button" id="begin-login">Продолжить в MAX ↗</button><div id="login-status" role="status"></div><p class="muted">Для нового клиента создадим кабинет после подтверждения MAX. Один номер телефона не открывает чужую карточку.</p></div></section>`;
  document.querySelector('#begin-login').onclick=async event=>{
    event.target.disabled=true;
    try{const result=await api(base+'/registration',{});const url=new URL(result.url);if(url.origin!=='https://max.ru')throw new Error('Не удалось открыть вход через MAX.');
      document.querySelector('#login-status').innerHTML=`<p><a class="button secondary" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">Открыть бота MAX ↗</a></p><p>Нажмите «Начать» в боте, затем вернитесь сюда. Ждём подтверждения…</p>`;timer=setInterval(()=>void pollLogin(),2500);
    }catch(e){document.querySelector('#login-status').textContent=e.message;event.target.disabled=false;}
  };
}
async function pollLogin(){
  if(polling)return;polling=true;
  try{const result=await api(base+'/registration');
    if(result.status==='READY'){clearInterval(timer);await api(base+'/registration/session',{});await start();}
    else if(result.status==='NEEDS_DETAILS'){
      clearInterval(timer);document.querySelector('#login-status').innerHTML=`<form id="registration-details"><h3>Знакомимся</h3><label>Как к вам обращаться<input name="fullName" required minlength="2" maxlength="120" autocomplete="name"></label><label>Телефон<input name="phone" type="tel" required minlength="10" maxlength="32" autocomplete="tel"></label><label class="check"><input name="contactConsent" type="checkbox" required><span>Разрешаю связаться со мной по размещению питомца</span></label><button class="button">Создать кабинет</button><p class="error" id="registration-error" role="alert"></p></form>`;
      document.querySelector('#registration-details').onsubmit=async event=>{event.preventDefault();const form=new FormData(event.target),button=event.target.querySelector('button');button.disabled=true;try{await api(base+'/registration/details',{fullName:form.get('fullName'),phone:form.get('phone'),contactConsent:form.get('contactConsent')==='on'});document.querySelector('#login-status').textContent='Создаём кабинет в CRM…';timer=setInterval(()=>void pollLogin(),2500);}catch(e){document.querySelector('#registration-error').textContent=e.message;button.disabled=false;}};
    }else if(result.status==='REVIEW_REQUIRED'){clearInterval(timer);document.querySelector('#login-status').textContent=result.error||'Для привязки существующего кабинета свяжитесь с администратором.';}
  }catch(e){clearInterval(timer);const target=document.querySelector('#login-status');if(target)target.textContent=e.message;const button=document.querySelector('#begin-login');if(button)button.disabled=false;}
  finally{polling=false;}
}
const petSpecies=pet=>!pet?null:/CAT|кош|кот/i.test(pet.species)?'CAT':/DOG|собак|пёс|пес/i.test(pet.species)?'DOG':null;
const option=(id,label,current)=>`<option value="${esc(id)}"${id===current?' selected':''}>${esc(label)}</option>`;
function render(message=''){
  const qaBanner=state.mode==='qa'?`<p class="test-mode">Локальная проверка · данные вымышленные · ${state.qaDelivery==='intercepted'?'MAX перехвачен':'отправка MAX отключена'}</p>`:'';
  app.innerHTML=`${qaBanner}<section class="hero"><div><p class="eyebrow">Кабинет владельца</p><h1>Проживание<br>моих питомцев.</h1><p>${esc(state.owner.fullName)}</p></div><button class="button secondary" id="refresh">Обновить</button></section>${message?`<p class="success" role="status">${esc(message)}</p>`:''}<div class="workspace"><aside><section class="card"><h2>Мои питомцы</h2>${state.animals.map(p=>`<div class="small-pet"><strong>${esc(p.nickname)}</strong><p class="muted">${esc(p.breed||p.species)}</p></div>`).join('')||'<p>Добавьте питомца для бронирования.</p>'}<button class="text-button" id="add-pet">+ Добавить питомца</button><div id="pet-slot"></div></section><section class="card"><h3>С собой — привычное</h3><p>Корм и миски обязательны. Любимую игрушку, лежанку, туалет и наполнитель можно привезти по необходимости.</p></section></aside><div><section class="card"><p class="eyebrow">${moving?'Перенос проживания':'Выбор проживания'}</p><h2>${moving?'Новые даты и номер':'Кто к нам приедет?'}</h2>${moving?'<button class="text-button" id="stop-moving">Отменить перенос</button>':''}${state.selfBookingEnabled?bookingForm():'<p class="notice">Самостоятельное бронирование пока закрыто. Сохранённые размещения доступны ниже.</p>'}</section><section class="history"><h2 class="history-heading">Мои брони и история</h2>${state.bookings.map(historyCard).join('')||'<p class="muted">Здесь появится ваше первое размещение.</p>'}</section></div></div>`;
  document.querySelector('#refresh').onclick=()=>void guarded(async()=>{await recover();state=await command('STATE');render('Данные обновлены');});
  document.querySelector('#add-pet').onclick=petForm;
  document.querySelector('#stop-moving')?.addEventListener('click',()=>{moving=null;draft={};offers=[];render();});
  const form=document.querySelector('#booking-form');
  if(form){form.onchange=event=>{draft={...draft,...Object.fromEntries(new FormData(form))};if(event.target.name==='animalId'){const pet=state.animals.find(p=>p.id===draft.animalId),species=petSpecies(pet);if(species){if(species!==draft.species){delete draft.roomName;delete draft.roomId;}draft.species=species;if(species==='CAT')draft.walkCount=0;if(pet.weightKg)draft.weightKg=pet.weightKg;}render();}else if(event.target.name==='species'){delete draft.roomName;delete draft.roomId;if(draft.species==='CAT')draft.walkCount=0;render();}offers=[];document.querySelector('#offers')?.replaceChildren();};
    form.onsubmit=event=>{event.preventDefault();draft={...draft,...Object.fromEntries(new FormData(form))};void guarded(async()=>{const input={animalId:draft.animalId,species:draft.species||'CAT',startsAt:new Date(draft.arrival+'T'+draft.arrivalTime+':00+03:00').toISOString(),endsAt:new Date(draft.departure+'T'+draft.departureTime+':00+03:00').toISOString(),walkCount:draft.species==='DOG'?Number(draft.walkCount||0):0,...(draft.species==='DOG'?{weightKg:Number(draft.weightKg)}:{}),...(moving?{reservationId:moving.id}:{})};const data=await command('OPTIONS',input);offers=data.rooms||[];renderOffers(data.notice);});};}
  app.querySelectorAll('[data-cancel]').forEach(button=>button.onclick=()=>{const b=state.bookings.find(b=>b.id===button.dataset.cancel),slot=button.closest('.history-actions');slot.innerHTML='<p>Отменить эту бронь?</p><button class="button danger" id="confirm-cancel">Да, отменить</button><button class="text-button" id="keep-booking">Оставить бронь</button>';document.querySelector('#keep-booking').onclick=()=>render();document.querySelector('#confirm-cancel').onclick=()=>void guarded(async()=>{await command('CANCEL',{reservationId:b.id,version:b.version});state=await command('STATE');render('Бронь отменена. Статус уведомлений уточняется отдельно.');});});
  app.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{moving=state.bookings.find(b=>b.id===button.dataset.move);draft={animalId:moving.animalId,species:moving.species||(/CAT|кош|кот/i.test(state.animals.find(p=>p.id===moving.animalId)?.species)?'CAT':'DOG'),weightKg:moving.weightKg,startsAt:moving.startsAt,endsAt:moving.endsAt,walkCount:moving.walkCount,notes:moving.notes,roomId:moving.roomId};offers=[];render();document.querySelector('#booking-form')?.scrollIntoView({block:'start'});});
}
function bookingForm(){
  const eligible=state.animals.filter(p=>petSpecies(p)),selectedPet=eligible.find(p=>p.id===draft.animalId),selectedSpecies=petSpecies(selectedPet)||draft.species||'CAT';
  const tomorrow=new Date(Date.now()+86400000),start=draft.startsAt?new Date(draft.startsAt):tomorrow,end=draft.endsAt?new Date(draft.endsAt):new Date(+start+state.settings.minimumDays*86400000),dog=selectedSpecies==='DOG';
  return `${draft.roomName?`<p class="notice">На сайте выбран ${esc(draft.roomName)}. Проверим его занятость и стоимость перед подтверждением.</p>`:''}<form id="booking-form"><div class="form-grid"><label>Питомец<select name="animalId" required${moving?' disabled':''}>${option('','Выберите питомца',draft.animalId)}${eligible.map(p=>option(p.id,p.nickname,draft.animalId)).join('')}</select>${moving?`<input type="hidden" name="animalId" value="${esc(moving.animalId)}">`:''}</label><label>Вид питомца<select name="species"${selectedPet?' disabled':''}>${option('CAT','Кошка',selectedSpecies)}${option('DOG','Собака',selectedSpecies)}</select>${selectedPet?`<input type="hidden" name="species" value="${esc(selectedSpecies)}">`:''}</label><label>Заезд<input name="arrival" type="date" min="${date(new Date())}" required value="${esc(draft.arrival||date(start))}"></label><label>Выезд<input name="departure" type="date" required value="${esc(draft.departure||date(end))}"></label><label>Время заезда<input name="arrivalTime" type="time" min="${esc(state.settings.checkInFrom)}" max="${esc(state.settings.checkInTo)}" required value="${esc(draft.arrivalTime||(draft.startsAt?clock(start):'10:00'))}"></label><label>Время выезда<input name="departureTime" type="time" required value="${esc(draft.departureTime||(draft.endsAt?clock(end):'10:00'))}"></label>${dog?`<label>Вес собаки, кг<input name="weightKg" type="number" min="0.01" max="${esc(state.settings.maximumDogWeightKg)}" step="0.01" required value="${esc(draft.weightKg||'')}"></label><label>Выгулов за всё проживание<input name="walkCount" type="number" min="0" max="1000" step="1" value="${esc(draft.walkCount||0)}"></label>`:''}<label class="wide">Пожелания по уходу<textarea name="notes" maxlength="4000" rows="3">${esc(draft.notes||'')}</textarea></label></div><p class="muted">От ${esc(state.settings.minimumDays)} суток; неполные сутки округляются вверх. Время выезда согласуем при размещении.</p><button class="button"${eligible.length?'':' disabled'}>Показать свободные номера</button></form><div id="offers" aria-live="polite"></div><p class="error" id="action-error" role="alert"></p>`;
}
function renderOffers(notice){
  const target=document.querySelector('#offers');target.innerHTML=`<p class="muted">${esc(notice||'')}</p>${offers.length?`<div class="rooms">${offers.map((o,i)=>`<button class="room-offer" type="button" data-offer="${i}" aria-pressed="false"><strong>${esc(o.name)}</strong><span>${rub(o.quote.dailyRate)} / сутки</span><small>${o.quote.billableDays} сут. · ${rub(o.quote.totalPrice)} за проживание${Number(draft.walkCount)?' и выгул':''}</small></button>`).join('')}</div><div id="confirmation"></div>`:'<p class="notice">Свободных номеров на эти даты нет. Выберите другие даты.</p>'}`;
  target.querySelectorAll('[data-offer]').forEach(button=>button.onclick=()=>{
    const offer=offers[Number(button.dataset.offer)];target.querySelectorAll('[data-offer]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector('#confirmation').innerHTML=`<section class="confirmation" tabindex="-1"><h3>${esc(offer.name)}</h3><p>${esc(when(draft.arrival+'T'+draft.arrivalTime+':00+03:00'))} — ${esc(when(draft.departure+'T'+draft.departureTime+':00+03:00'))}</p><div class="quote-lines"><span>${offer.quote.billableDays} сут. × ${rub(offer.quote.dailyRate)}</span><span>${rub(offer.quote.stayPrice)}</span><span>Выгул</span><span>${rub(offer.quote.walksPrice)}</span><strong>Итого</strong><strong>${rub(offer.quote.totalPrice)}</strong></div>${moving?'<p class="muted">Ставка сохранённой брони учитывается сервером при переносе.</p>':''}<label class="check"><input type="checkbox" id="booking-consent"><span>Подтверждаю бронирование и разрешаю связаться со мной по размещению</span></label>${state.bridgeReady===false?'<p class="notice">Это проверка интерфейса. Сохранение в CRM ещё не подключено.</p>':''}<button type="button" class="button" id="confirm-booking"${state.bridgeReady===false?' disabled':''}>${moving?'Подтвердить перенос':'Подтвердить бронь'}</button></section>`;
    document.querySelector('#confirm-booking').onclick=()=>{if(!document.querySelector('#booking-consent').checked){document.querySelector('#action-error').textContent='Подтвердите бронирование и разрешение на связь.';return;}if(offer.expiresAt&&Date.parse(offer.expiresAt)<=Date.now()){document.querySelector('#action-error').textContent='Предложение истекло. Проверьте номера заново.';return;}void guarded(async()=>{await command(moving?'RESCHEDULE':'BOOK',{animalId:draft.animalId,offerToken:offer.offerToken,notes:draft.notes||'',contactConsent:true,bookingConsent:true,...(moving?{reservationId:moving.id,version:moving.version}:{})});state=await command('STATE');moving=null;draft={};offers=[];render('Бронь сохранена в CRM. Здесь отображается её текущий статус.');});};
    document.querySelector('.confirmation').focus({preventScroll:true});document.querySelector('.confirmation').scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  });
}
function historyCard(b){return `<article class="history-card"><span class="badge">${esc(statusLabel[b.status]||b.status)}</span><h3>${esc(b.animal.nickname)} · ${esc(b.room.name)}</h3><p>${esc(when(b.startsAt))} — ${esc(when(b.endsAt))}<br>${b.billableDays} сут. · ${rub(b.dailyRate)} / сутки<br>Выгулов: ${b.walkCount}<br><strong>Согласованная стоимость: ${rub(b.totalPrice)}</strong></p>${b.notes?`<p class="muted">${esc(b.notes)}</p>`:''}<div class="history-actions">${b.canReschedule?`<button class="button secondary" data-move="${esc(b.id)}">Перенести</button>`:''}${b.canCancel?`<button class="text-button" data-cancel="${esc(b.id)}">Отменить бронь</button>`:''}</div></article>`;}
function petForm(){document.querySelector('#pet-slot').innerHTML='<form id="new-pet"><label>Кличка<input name="nickname" required maxlength="80"></label><label>Вид<select name="species"><option value="CAT">Кошка</option><option value="DOG">Собака</option></select></label><label>Порода<input name="breed" maxlength="120"></label><button class="button secondary">Сохранить питомца</button><p class="error" id="pet-error" role="alert"></p></form>';document.querySelector('#new-pet').onsubmit=event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));void guarded(async()=>{await command('PET_CREATE',data);state=await command('STATE');render('Питомец добавлен в общий кабинет.');},'#pet-error');};}
async function guarded(action,errorSelector='#action-error'){
  if(busy)return;busy=true;const controls=Array.from(app.querySelectorAll('button,input,select,textarea')).map(e=>[e,e.disabled]);controls.forEach(([e])=>e.disabled=true);
  try{await action();}catch(e){if(e.status===401||e.status===403&&/Войдите/.test(e.message))login();else{const target=document.querySelector(errorSelector);if(target)target.textContent=e.message;else failure(e.message);}}
  finally{busy=false;controls.forEach(([e,disabled])=>{if(e.isConnected)e.disabled=disabled;});}
}
document.querySelector('#logout').onclick=async()=>{clearInterval(timer);await api('/v1/portal/logout',{});save(pendingKey,null);ownerKey='';location.assign('/portal/pet-hotel');};
void start();
