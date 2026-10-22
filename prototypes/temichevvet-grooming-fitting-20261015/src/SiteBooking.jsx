import {useEffect,useRef,useState} from 'react';
import {ArrowRight,Check} from '@phosphor-icons/react';
import {groomingServiceOffered} from './pricing-data';
import {CLINIC_CONTACT} from './clinic-contact';
import {browserAttribution} from '../../../packages/booking-attribution/browser.mjs';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const clock=value=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const errorText=data=>Array.isArray(data?.message)?data.message.join('. '):data?.message;
const serviceOrder=service=>({full:0,wash:0,hygiene:1,deshedWash:1,dry:2}[service.catalogData?.kind]??3);

function BookingContact(){
 return <aside className="booking-contact" aria-label="Запись через администратора"><h3>Подберём уход и время по телефону.</h3><p>Расскажите, кого хотите привести и какая стрижка нравится. Администратор уточнит стоимость и предложит время визита.</p><a className="button" href={CLINIC_CONTACT.phoneHref}>Позвонить и записаться <ArrowRight size={21}/></a><p className="contact-number"><a href={CLINIC_CONTACT.phoneHref}>{CLINIC_CONTACT.phone}</a> · {CLINIC_CONTACT.city}</p></aside>;
}

function BookingEmpty({hasSpecialists}){
 return <aside className="booking-contact booking-empty" aria-label="Нет свободного времени"><h3>Пока нет свободного времени.</h3><p>{hasSpecialists?'Попробуйте другую дату или грумера. Можно позвонить — поможем договориться о визите.':'Новые часы появятся здесь, как только будут доступны. А пока позвоните — поможем подобрать уход и договориться о визите.'}</p><a className="button" href={CLINIC_CONTACT.phoneHref}>Позвонить в салон <ArrowRight size={21}/></a><p className="contact-number"><a href={CLINIC_CONTACT.phoneHref}>{CLINIC_CONTACT.phone}</a></p></aside>;
}

export function SiteBooking({config,breed,priceContext,notes,onNotes,lookIds,selectedLooks,onToggleLook,lookName}) {
 const [storefront,setStorefront]=useState(config.storefront),[loadError,setLoadError]=useState('');
 const [serviceId,setService]=useState(''),[specialistId,setSpecialist]=useState(''),[date,setDate]=useState(today),[size,setSize]=useState(breed.species==='cat'?'ANY':String(breed.size||'').toUpperCase()),[coat,setCoat]=useState('ANY');
 const [slots,setSlots]=useState([]),[selected,setSelected]=useState(null),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const currentRequest=useRef(0);
 const [refreshKey,setRefreshKey]=useState(0);
 const species=breed.species==='cat'?'CAT':'DOG';
 const online=Boolean(storefront?.connected&&storefront?.selfBookingEnabled);
 const specialists=(storefront?.specialists||[]).filter(s=>s.species?.includes(species));
 const specialistIds=specialists.map(s=>s.id).join('|');
 const hasSpecialists=specialists.length>0;
 const matching=(storefront?.services||[]).filter(s=>{const d=s.catalogData||{};if(!groomingServiceOffered(s)||d.category==='SUPPLEMENT')return false;if(d.species&&d.species!=='ANY'&&d.species!==species)return false;if(species==='CAT')return !d.condition||d.condition===(priceContext?.condition||'clean');if(priceContext?.rowId)return d.breedRowId===priceContext.rowId||!d.breedId;return !d.breedId||d.breedId===breed.id;}).sort((a,b)=>serviceOrder(a)-serviceOrder(b));
 const service=matching.find(s=>s.id===serviceId);
 useEffect(()=>{if(config.storefront)setStorefront(config.storefront);},[config.storefront]);
 useEffect(()=>{if(!online||selected||busy)return;const refresh=()=>{if(document.visibilityState==='visible')setRefreshKey(value=>value+1);};const timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[online,selected,busy]);
 useEffect(()=>{let live=true;setLoadError('');fetch('/v1/public/grooming/catalog',{cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('Не удалось обновить расписание');return r.json();}).then(data=>{if(live)setStorefront(data.storefront);}).catch(e=>{if(live)setLoadError(e.message);});return()=>{live=false;};},[refreshKey]);
 useEffect(()=>{if(!matching.some(s=>s.id===serviceId)){const kind=priceContext?.kind||(species==='CAT'?'wash':'full');const preferred=matching.find(s=>s.bookable&&s.catalogData?.kind===kind)||matching.find(s=>s.catalogData?.kind===kind)||matching.find(s=>s.bookable)||matching[0];setService(preferred?.id||'');}},[storefront,breed.id,priceContext?.rowId,priceContext?.condition]);
 useEffect(()=>{setSize(breed.species==='cat'?'ANY':String(breed.size||'').toUpperCase());setSpecialist('');},[breed.id]);
 useEffect(()=>{if(specialistId&&!specialists.some(s=>s.id===specialistId))setSpecialist('');},[specialistIds,specialistId]);
 useEffect(()=>{const id=++currentRequest.current;setSelected(null);setSlots([]);setError('');if(!serviceId||!date||!size||!online||!hasSpecialists||!service?.bookable){setNotice('');setLoading(false);return;}
  const controller=new AbortController();setLoading(true);
  const query=new URLSearchParams({serviceId,specialistId,date,species,size,coat});
  fetch('/v1/public/grooming/availability?'+query,{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json().catch(()=>null);if(!r.ok)throw Error(errorText(data)||'Не удалось проверить свободное время');return data;}).then(data=>{if(id===currentRequest.current){setSlots(data.slots||[]);setNotice(data.notice||'');}}).catch(e=>{if(e.name!=='AbortError'&&id===currentRequest.current)setError(e.message);}).finally(()=>{if(id===currentRequest.current)setLoading(false);});
  return()=>controller.abort();
 },[serviceId,specialistId,date,size,coat,online,specialistIds,service?.bookable,refreshKey]);
 const proceed=async()=>{if(!selected||busy)return;setBusy(true);setError('');try{
  const attribution=browserAttribution('GROOMING');
  const response=await fetch('/v1/public/grooming/drafts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({breedId:breed.id,looks:selectedLooks,notes,selection:{serviceId,specialistId:selected.specialistId,startsAt:selected.startsAt,species,size,coat},...(attribution?{attribution}:{})}),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null);if(!response.ok||!data?.token)throw Error(errorText(data)||'Не удалось сохранить выбранное время');
  const url=new URL(config.bookingPortalUrl);if(!['https:','http:'].includes(url.protocol))throw Error('Кабинет недоступен');url.hash=new URLSearchParams({draft:data.token}).toString();window.location.assign(url.href);
 }catch(e){setError(e.name==='TimeoutError'?'Ответ задержался. Попробуйте ещё раз.':e.message);setBusy(false);}};
 return <div className="site-booking"><p className="booking-intro">{species==='CAT'?'Кошка':'Собака'} · {breed.name}</p>{online&&<p>Выберите услугу, грумера и время. В кабинете через MAX укажите своего питомца и подтвердите запись.</p>}{!online&&<BookingContact/>}{storefront?.testMode&&<p className="notice">Тестовый запуск. Бронирование доступно только участнику проверки.</p>}
  {!storefront?.connected?<div className="notice"><p>{loadError||'Не удалось показать услуги. Позвоните — поможем выбрать уход и время.'}</p><a className="text-link" href={CLINIC_CONTACT.phoneHref}>Позвонить администратору <ArrowRight size={20}/></a></div>:<fieldset disabled={busy}>
   <div className={online?"booking-grid":"booking-grid booking-grid-single"}><label>Услуга<select aria-label="Услуга для записи" value={serviceId} onChange={e=>setService(e.target.value)}><option value="">Выберите услугу</option>{matching.map(s=><option key={s.id} value={s.id}>{s.catalogData?.serviceName||s.title} · {s.priceLabel}{online&&hasSpecialists&&!s.bookable?' · время согласуем':''}</option>)}</select></label>{online&&<><label>Грумер<select aria-label="Грумер для записи" disabled={!hasSpecialists} value={specialistId} onChange={e=>setSpecialist(e.target.value)}><option value="">{hasSpecialists?'Любой доступный':'Пока нет доступных грумеров'}</option>{specialists.map(s=><option key={s.id} value={s.id}>{s.displayName}</option>)}</select></label><label>Дата визита<input aria-label="Дата визита" type="date" min={today()} value={date} onChange={e=>setDate(e.target.value)}/></label>{species==='DOG'&&<label>Размер собаки<select aria-label="Размер собаки для записи" value={size} onChange={e=>setSize(e.target.value)}><option value="">Выберите размер</option><option value="SMALL">Небольшая</option><option value="MEDIUM">Средняя</option><option value="LARGE">Крупная</option></select></label>}</>}</div>
   {online&&hasSpecialists&&service&&!service.bookable&&<p className="notice">Для этой услуги длительность и время согласует администратор. Позвоните <a href={CLINIC_CONTACT.phoneHref}>{CLINIC_CONTACT.phone}</a> или выберите другую услугу.</p>}
   {online&&<><div className="site-times-heading"><h3>Свободное время <small>МСК</small></h3><button className="text-link" type="button" disabled={loading||busy} onClick={()=>setRefreshKey(value=>value+1)}>Обновить время</button></div><div className="site-booking-times" aria-live="polite">{loading?<p role="status">Проверяем расписание…</p>:!hasSpecialists?<BookingEmpty hasSpecialists={false}/>:slots.length?<div className="site-slot-grid">{slots.map(slot=><button type="button" key={slot.specialistId+':'+slot.startsAt} className={'site-slot'+(selected===slot?' is-selected':'')} aria-pressed={selected===slot} onClick={()=>setSelected(slot)}><strong>{clock(slot.startsAt)}–{clock(slot.endsAt)}</strong><span>{slot.specialistName}</span><small>{slot.durationMinutes} мин · {slot.priceLabel}</small></button>)}</div>:service?.bookable&&size?<BookingEmpty hasSpecialists/>:null}</div></>}
   {selected&&<div className="site-selected"><Check size={22}/><p><strong>{clock(selected.startsAt)}–{clock(selected.endsAt)} · {selected.specialistName}</strong><br/>{selected.locationName} · {selected.priceLabel}</p></div>}
   {lookIds.length>0&&<details className="site-booking-looks"><summary>Образы для грумера · {selectedLooks.length}</summary>{lookIds.map(id=><label className="check-line" key={id}><input type="checkbox" checked={selectedLooks.includes(id)} onChange={()=>onToggleLook(id)}/>{lookName(id)}</label>)}</details>}
   {online&&<label>Пожелания и привычки питомца<textarea rows={2} maxLength={1500} value={notes} onChange={e=>onNotes(e.target.value)}/></label>}{error&&<p className="error" role="alert">{error}</p>}
   {online?(slots.length>0&&<><button className="button booking-submit" type="button" onClick={proceed} disabled={!selected||loading||busy}>{busy?'Открываем кабинет…':'Продолжить через MAX'} <ArrowRight size={22}/></button><p className="muted">{notice||'Запись будет завершена после подтверждения в кабинете.'}</p></>):<p className="booking-quote-note">Перед процедурой согласуем итоговую стоимость с учётом размера питомца и состояния шерсти. Понравившийся образ можно показать грумеру.</p>}
  </fieldset>}
 </div>;
}
