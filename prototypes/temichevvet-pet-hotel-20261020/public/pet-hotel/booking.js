const $ = s => document.querySelector(s);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rub = v => new Intl.NumberFormat('ru-RU', {style:'currency',currency:'RUB',minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(v));
export function validQuote(q, walkCount) {
  if (!q || !Number.isInteger(q.billableDays) || q.billableDays < 1 || q.billableDays > 365) return false;
  const keys = ['dailyRate','walkRate','stayPrice','walksPrice','totalPrice'];
  if (!keys.every(k => /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(String(q[k])) && Number.isSafeInteger(Math.round(Number(q[k])*100)))) return false;
  return Math.round(Number(q.stayPrice)*100) + Math.round(Number(q.walksPrice)*100) === Math.round(Number(q.totalPrice)*100) && Math.round(Number(q.dailyRate)*100)*q.billableDays === Math.round(Number(q.stayPrice)*100) && (walkCount === undefined || Math.round(Number(q.walkRate)*100)*walkCount === Math.round(Number(q.walksPrice)*100));
}
export function tripInput(trip) {
  return trip ? {species:trip.dog?'DOG':'CAT',startsAt:new Date(trip.arrival+'T'+trip.arrivalTime+':00+03:00').toISOString(),endsAt:new Date(trip.departure+'T'+trip.departureTime+':00+03:00').toISOString(),...(trip.dog?{weightKg:trip.dogWeight}:{}),walkCount:trip.walkCount} : null;
}
export class HotelBooking {
  constructor({getTrip,onCatalog,onQuote}) {
    this.getTrip=getTrip;this.onCatalog=onCatalog;this.onQuote=onQuote;this.serial=0;this.catalog=null;this.selected=null;this.last='';
    $('#check-rooms').onclick=()=>void this.search();$('#continue-booking').onclick=()=>void this.continue();
    void this.load();
  }
  async request(path,body,signal) {
    const r=await fetch('/v1/public/pet-hotel/'+path,{cache:'no-store',credentials:'omit',signal:signal||AbortSignal.timeout(12000),...(body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
    const data=await r.json().catch(()=>null);
    if(!r.ok){const e=new Error(Array.isArray(data?.message)?data.message.join('. '):data?.message||'Не удалось проверить номера. Попробуйте ещё раз.');e.status=r.status;throw e;}
    return data;
  }
  async load() {
    try {
      const data=await this.request('catalog');
      this.catalog=data;
      if(data.connected&&data.fresh&&data.settings&&Array.isArray(data.rooms))this.onCatalog(data);
      $('#room-booking').hidden=false;
      $('#check-rooms').hidden=!data.selfBookingEnabled;
      $('#room-booking-status').textContent=data.selfBookingEnabled?'Покажем номера, доступные на ваши даты, и стоимость каждого.':'Онлайн-бронирование пока не открыто. Расчёт можно обсудить с администратором.';
      if(data.testMode){$('#hotel-test-mode').hidden=false;}
      if(data.portalUrl){const u=new URL(data.portalUrl);if((u.protocol==='https:'||['127.0.0.1','localhost'].includes(u.hostname))&&u.pathname==='/portal/pet-hotel'){this.portal=u;$('#hotel-account').href=u.href;$('#hotel-account').hidden=false;}}
      this.updateTrip(this.getTrip());
    }catch{
      $('#room-booking').hidden=false;$('#check-rooms').hidden=false;
      $('#room-booking-status').textContent='Пока не удалось получить занятость номеров. Можно повторить проверку или позвонить администратору.';
    }
  }
  updateTrip(trip) {
    const input=tripInput(trip),key=JSON.stringify(input);
    $('#check-rooms').disabled=!input;
    if(key===this.last)return;
    this.last=key;++this.serial;this.abort?.abort();clearTimeout(this.expiry);
    this.selected=null;this.rooms=[];$('#room-options').replaceChildren();$('#continue-booking').hidden=true;this.onQuote(null);
    if(this.catalog?.selfBookingEnabled)$('#room-booking-status').textContent='Проверьте свободные номера на выбранные даты.';
  }
  async search() {
    if(!this.catalog?.selfBookingEnabled){await this.load();if(!this.catalog?.selfBookingEnabled)return;}
    const input=tripInput(this.getTrip());if(!input)return;
    const serial=++this.serial;this.abort?.abort();this.abort=new AbortController();
    const timeout=setTimeout(()=>this.abort?.abort(),12000);
    this.selected=null;clearTimeout(this.expiry);this.onQuote(null);$('#continue-booking').hidden=true;$('#room-options').replaceChildren();$('#check-rooms').disabled=true;
    $('#room-booking-status').textContent='Проверяем даты и тарифы…';
    try {
      const data=await this.request('availability?'+new URLSearchParams(input),undefined,this.abort.signal);
      if(serial!==this.serial)return;
      if(!data.enabled){$('#room-booking-status').textContent=data.notice||'Бронирование временно закрыто.';return;}
      if(!Array.isArray(data.rooms)||data.rooms.some(r=>!validQuote(r.quote,input.walkCount)||typeof r.id!=='string'||typeof r.offerToken!=='string'||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=Date.now()))throw new Error('Не удалось проверить стоимость. Повторите запрос.');
      this.rooms=data.rooms;
      $('#room-booking-status').textContent=this.rooms.length?'Выберите подходящий номер. До подтверждения в кабинете он остаётся доступен другим клиентам.':'На эти даты свободных номеров нет. Попробуйте другие даты.';
      $('#room-options').innerHTML=this.rooms.map((r,i)=>`<button type="button" class="room-choice" data-hotel-room="${i}" aria-pressed="false"><span class="room-choice-number">${escape(r.code)}</span><strong>${escape(r.name)}</strong><span>${rub(r.quote.dailyRate)} / сутки</span><small>${r.quote.billableDays} сут. · всего ${rub(r.quote.totalPrice)}${input.walkCount?' с выгулом':''}</small><i aria-hidden="true">↗</i></button>`).join('');
      $('#room-options').querySelectorAll('[data-hotel-room]').forEach(b=>b.onclick=()=>this.select(Number(b.dataset.hotelRoom)));
    }catch(e){if(serial===this.serial)$('#room-booking-status').textContent=e.name==='AbortError'?'Проверка заняла больше времени. Повторите запрос.':e.message;}
    finally{clearTimeout(timeout);if(serial===this.serial)$('#check-rooms').disabled=!this.getTrip();}
  }
  select(index) {
    const room=this.rooms[index];if(!room)return;
    if(Date.parse(room.expiresAt)<=Date.now()){this.expire();return;}
    this.selected=room;$('#room-options').querySelectorAll('[data-hotel-room]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.hotelRoom)===index)));
    this.onQuote({...room.quote,roomId:room.id,roomName:room.name});
    $('#continue-booking').hidden=false;$('#continue-booking').disabled=!this.portal;
    $('#room-booking-status').textContent=this.portal?'Выбрано: '+room.name+'. Продолжите в кабинете владельца.':'Номер выбран. Переход в кабинет пока настраивается; свяжитесь с администратором.';
    clearTimeout(this.expiry);this.expiry=setTimeout(()=>this.expire(),Math.max(0,Date.parse(room.expiresAt)-Date.now()));
  }
  expire(message='Время предложения истекло. Проверьте номера и стоимость заново.'){this.selected=null;this.onQuote(null);$('#continue-booking').hidden=true;$('#room-options').replaceChildren();$('#room-booking-status').textContent=message;}
  async continue() {
    if(!this.selected||!this.portal)return;
    if(Date.parse(this.selected.expiresAt)<=Date.now()){this.expire();return;}
    const serial=this.serial,offer=this.selected;$('#continue-booking').disabled=true;
    try {
      const result=await this.request('drafts',{offerToken:offer.offerToken});
      if(serial!==this.serial||this.selected!==offer)return;
      if(typeof result.token!=='string'||!/^[A-Za-z0-9_-]{32,100}$/.test(result.token))throw new Error('Не удалось перенести выбор в кабинет. Повторите проверку.');
      const target=new URL(this.portal);target.hash=new URLSearchParams({draft:result.token}).toString();location.assign(target.href);
    }catch(e){if(serial===this.serial){$('#room-booking-status').textContent=e.message;if([404,409].includes(e.status))this.expire(e.message);}}
    finally{if(serial===this.serial)$('#continue-booking').disabled=false;}
  }
}
