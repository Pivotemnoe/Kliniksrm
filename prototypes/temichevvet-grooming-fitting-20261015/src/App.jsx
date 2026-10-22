import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ArrowDown, ArrowsHorizontal, BookmarkSimple, Check, CheckCircle, ChatCircleDots, List, MagnifyingGlass, PaperPlaneTilt, X, Pause, Play } from "@phosphor-icons/react";
import { GROOMING_BREEDS as BREEDS, GROOMING_SERVICES as SERVICES, GROOMING_LOOK_COUNT, groomingLook } from "../../../apps/owner-gateway/src/grooming/catalog";
import { useGroomingMotion } from "./motion";
import { PriceList } from "./PriceList";
import { SiteBooking } from "./SiteBooking";
import { OurWorks } from "./OurWorks";
import { HotelTeaser, HOTEL_URL } from "./HotelTeaser";
import { CLINIC_CONTACT } from "./clinic-contact";
import { browserAttribution } from "../../../packages/booking-attribution/browser.mjs";

const STORE = "temichevvet-grooming-wishes-v1";
const DEVICE_QA = import.meta.env.VITE_GROOMING_QA_TRANSPORT === "device";
const VISUAL_PREVIEW = import.meta.env.VITE_GROOMING_VISUAL_PREVIEW === "1";
const readSaved = () => {
 try { const x = JSON.parse(localStorage.getItem(STORE) || "{}"); return {ids:Array.isArray(x.ids) ? x.ids.filter(id => typeof id === "string" && groomingLook(id)).slice(0,GROOMING_LOOK_COUNT) : [], notes:typeof x.notes === "string" ? x.notes.slice(0,1500) : ""}; }
 catch { return {ids:[],notes:""}; }
};
const searchKey = text => text.toLocaleLowerCase("ru").replace(/ё/g,"е").replace(/[^\p{L}\p{N}]/gu,"");
const DOG_COUNT = BREEDS.filter(v=>v.species==="dog").length, CAT_COUNT = BREEDS.filter(v=>v.species==="cat").length;
const initialParams=new URLSearchParams(window.location.search);
const initialBreed=BREEDS.find(breed=>breed.id===initialParams.get("breed"))||BREEDS[0];
const initialStyle=initialBreed.styles.find(style=>style.id===initialParams.get("style"))?.id||"shape";
function LookPhoto({breed,frame=0,className="",label}) {
 return <div className={"look-photo "+className} role="img" aria-label={label || breed.name}><img loading="lazy" src={breed.image} alt="" style={{transform:"translateX(-"+(frame*100/3)+"%)"}} /></div>;
}
function Dialog({title,onClose,children,wide=false}) {
 const ref=useRef(null), titleId=useId();
 useEffect(()=>{ const el=ref.current, previous=document.activeElement; el.showModal(); document.body.classList.add("dialog-open"); return()=>{document.body.classList.remove("dialog-open"); (previous?.isConnected?previous:document.querySelector(".help-button"))?.focus?.();};},[]);
 return <dialog ref={ref} aria-labelledby={titleId} className={wide?"dialog wide":"dialog"} onCancel={onClose} onClick={e=>{if(e.target===ref.current)onClose();}}>
  <div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Закрыть окно" onClick={onClose}><X size={24}/></button></div>{children}
 </dialog>;
}
export function App() {
 const [saved,setSaved]=useState(readSaved),[storageError,setStorageError]=useState("");
 const [breedId,setBreedId]=useState(initialBreed.id),[query,setQuery]=useState(""),[expanded,setExpanded]=useState(false);
 const [species,setSpecies]=useState(initialBreed.species),[size,setSize]=useState("all");
 const [a,setA]=useState(initialStyle),[b,setB]=useState(initialStyle==="everyday"?"shape":"everyday"),[position,setPosition]=useState(50);
 const [savedOnly,setSavedOnly]=useState(false),[overlay,setOverlay]=useState(null),[menu,setMenu]=useState(false);
 const [motion,setMotion]=useState(true),[toast,setToast]=useState("");
 const [bookingContext,setBookingContext]=useState(null);
 const [config,setConfig]=useState({enabled:false,mode:"unavailable",privacyUrl:null});
 const breed=BREEDS.find(v=>v.id===breedId)||BREEDS[0];
 useGroomingMotion(motion);
 useEffect(()=>{browserAttribution('GROOMING');},[]);
 useEffect(()=>{if(initialParams.has("breed")&&location.hash==="#looks")requestAnimationFrame(()=>document.getElementById("looks")?.scrollIntoView({behavior:"instant"}));},[]);
 useEffect(()=>{if(VISUAL_PREVIEW){let live=true;fetch("/visual-preview-catalog.json").then(r=>r.json()).then(x=>{if(live)setConfig(x);}).catch(()=>{});return()=>{live=false;};}let live=true;const load=()=>fetch("/v1/public/grooming/catalog",{cache:"no-store"}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(x=>{if(live)setConfig(x);}).catch(()=>{});void load();const timer=setInterval(()=>{if(document.visibilityState==="visible")void load();},30000);return()=>{live=false;clearInterval(timer);};},[]);
 useEffect(()=>{try{localStorage.setItem(STORE,JSON.stringify(saved));setStorageError("");}catch{setStorageError("Браузер не разрешил сохранение. Образы доступны до закрытия страницы.");}},[saved]);
 useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),2800);return()=>clearTimeout(t);},[toast]);
 const chooseBreed=id=>{const next=BREEDS.find(v=>v.id===id);if(!next)return;setSpecies(next.species);setBreedId(id);setA("shape");setB("everyday");setPosition(50);};
 const chooseSpecies=value=>{setSpecies(value);setQuery("");setSize("all");setExpanded(false);if(breed.species!==value)chooseBreed(BREEDS.find(v=>v.species===value).id);};
 const savedHere=saved.ids.filter(id=>groomingLook(id)?.species===species);
 const openSaved=()=>{if(!savedHere.length&&saved.ids.length)chooseSpecies(groomingLook(saved.ids[0]).species);setSavedOnly(true);setQuery("");setSize("all");go("catalogue");};
 const toggleSave=id=>{const exists=saved.ids.includes(id);setSaved(v=>({...v,ids:exists?v.ids.filter(x=>x!==id):[...v.ids,id]}));setToast(exists?"Образ убран из избранного":"Образ сохранён на этом устройстве");};
 const openBooking=()=>{setBookingContext(null);setMenu(false);setOverlay("booking");};
 const go=id=>{setMenu(false);document.getElementById(id)?.scrollIntoView({behavior:motion&&!matchMedia("(prefers-reduced-motion: reduce)").matches?"smooth":"instant"});};
 const found=BREEDS.filter(v=>v.species===species&&(species==="cat"||size==="all"||v.size===size)&&searchKey(v.name+" "+v.group).includes(searchKey(query))&&(!savedOnly||saved.ids.some(id=>id.startsWith(v.id+":"))));
 const shown=query||expanded||savedOnly?found:found.slice(0,6);
 return <>
  <a className="skip-link" href="#catalogue">К каталогу образов</a>
  <header className="header"><a className="brand" href="#" aria-label="TemichevVET — груминг"><img src="/assets/temichevvet-logo.jpg" alt="TemichevVET"/><span>ГРУМИНГ</span></a>
   <nav aria-label="Основное меню" className={menu?"nav is-open":"nav"}><a href="#works" onClick={()=>setMenu(false)}>Наши работы</a><a href="#services" onClick={()=>setMenu(false)}>Услуги и цены</a><a href="#catalogue" onClick={()=>setMenu(false)}>Образы</a><a className="hotel-menu-link" href={HOTEL_URL}>Зоогостиница ↗</a>{config.bookingPortalUrl&&<a className="mobile-cabinet" href={config.bookingPortalUrl}>Мой кабинет</a>}</nav>
   <button className="header-saved icon-button" onClick={openSaved} aria-label={"Сохранённые образы: "+saved.ids.length}><BookmarkSimple size={22}/>{saved.ids.length>0&&<span>{saved.ids.length}</span>}</button>
   {config.bookingPortalUrl&&<a className="text-link cabinet-link" href={config.bookingPortalUrl}>Мой кабинет</a>}<button className="button header-book" onClick={openBooking}>Записаться <ArrowRight size={22}/></button>
   <button className="mobile-menu icon-button" aria-label="Открыть меню" aria-expanded={menu} onClick={()=>setMenu(!menu)}>{menu?<X size={24}/>:<List size={24}/>}</button>
  </header>
  {VISUAL_PREVIEW&&<aside className="visual-preview-note">Просмотр фотографий · <a href="http://127.0.0.1:4264/">Открыть проверенную версию с записью ↗</a><a href="http://127.0.0.1:4274/pet-hotel/">Зоогостиница ↗</a></aside>}
  <main>
   <section className="hero hero-start" aria-labelledby="hero-title">
    <div className="hero-copy"><p className="eyebrow light">TEMICHEVVET · ГРУМИНГ В АРМАВИРЕ</p><h1 id="hero-title">Стрижка и уход<br/>для вашего питомца.</h1><p className="hero-description">Подберите образ для собаки или кошки.<br className="desktop-break"/> Форму, длину и стоимость согласуем с вами до начала ухода.</p><div className="hero-actions"><button className="button" onClick={openBooking}>Записаться на груминг <ArrowRight size={23}/></button><a className="text-link white" href="#catalogue">Подобрать образ <ArrowRight size={23}/></a></div><p className="hero-location">{CLINIC_CONTACT.address} · <a href={CLINIC_CONTACT.phoneHref}>{CLINIC_CONTACT.phone}</a></p><a className="hero-price-link" href="#services">Посмотреть услуги и цены <ArrowRight size={18}/></a></div>
    <figure className="hero-portrait"><a href="#works" className="hero-groomer-crop" aria-label="Посмотреть работы нашего грумера"><img className="hero-groomer-photo" src="/assets/works-20261021/48887916187.jpg" alt="Наш грумер держит пуделя на руках в салоне" fetchPriority="high"/><img className="hero-photo-brand" src="/assets/temichevvet-logo.jpg" alt=""/></a><figcaption><span>Знакомство с грумером</span><a href="#works">Смотреть работы <ArrowRight size={19}/></a></figcaption></figure>
   </section>
   <section className="intro section" id="intro">
    <div className="intro-copy reveal"><h2>ПОНЯТЬ ОБРАЗ.<br/>ОБСУДИТЬ ДЕТАЛИ.</h2><p>Для собак и кошек.<br/>Выберите образ и добавьте<br className="desktop-break"/> его к записи на груминг.</p><a className="text-link" href="#catalogue">Открыть каталог <ArrowRight size={23}/></a></div>
    <div className="intro-photos">{[{id:"48888338587",title:"Мягкость и объём"},{id:"48887918235",title:"Спокойный момент"}].map((item,i)=><figure className="reveal" key={item.id} style={{"--reveal-delay":i*90+"ms"}}><button onClick={()=>go("works")} aria-label={"Наши работы: "+item.title}><img className="real-intro-photo" src={"/assets/works-20261021/"+item.id+".jpg"} alt={item.title} loading="lazy"/></button><figcaption>{item.title}</figcaption></figure>)}<p className="image-note"><a href="#works">Из альбома нашего салона ↗</a></p></div>
   </section>
   <OurWorks/>
   <section className="section visit" id="visit"><details><summary>Первый визит: что рассказать о питомце?<ArrowRight size={26}/></summary><p>Расскажите о привычках питомца, предыдущем груминге и пожеланиях к длине и форме. Состав ухода согласуем с вами. {config.storefront?.selfBookingEnabled?"Грумера, стоимость и свободное время можно выбрать в кабинете. После подтверждения время будет забронировано.":"Позвоните администратору: согласуем уход, стоимость и время визита."}</p></details></section>
   <section className="catalogue section" id="catalogue"><div className="section-heading reveal"><div><p className="eyebrow">КАТАЛОГ ОБРАЗОВ</p><h2>Начнём с породы.</h2></div><p>{DOG_COUNT} пород собак · {CAT_COUNT} разделов для кошек.<br/>{GROOMING_LOOK_COUNT} референсов для обсуждения.</p></div>
    <div className="species-selector" role="group" aria-label="Вид питомца"><button aria-pressed={species==="dog"} onClick={()=>chooseSpecies("dog")}>Собаки <span>{DOG_COUNT}</span></button><button aria-pressed={species==="cat"} onClick={()=>chooseSpecies("cat")}>Кошки <span>{CAT_COUNT}</span></button></div>
    <div className="catalogue-toolbar"><label className="search"><MagnifyingGlass size={21}/><input aria-label="Найти породу" placeholder={species==="cat"?"Найти породу или тип шерсти":"Найти породу"} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="icon-button" aria-label="Очистить поиск" onClick={()=>setQuery("")}><X size={18}/></button>}</label>{species==="dog"&&<label className="size-filter">Размер собаки<select aria-label="Размер собаки" value={size} onChange={e=>{setSize(e.target.value);setExpanded(false);}}><option value="all">Все размеры</option><option value="small">Небольшие</option><option value="medium">Средние</option><option value="large">Крупные</option></select></label>}<button className={savedOnly?"filter active":"filter"} aria-pressed={savedOnly} onClick={()=>setSavedOnly(!savedOnly)}><BookmarkSimple size={20} weight={savedOnly?"fill":"regular"}/>Сохранённые <span>{savedHere.length}</span></button></div>
    {storageError&&<p role="status" className="notice">{storageError}</p>}
    <div className="breed-grid">{shown.map(item=><button key={item.id} className={"breed-tile "+(breedId===item.id?"selected":"")} aria-pressed={breedId===item.id} onClick={()=>{chooseBreed(item.id);go("looks");}}><LookPhoto breed={item}/><span>{item.name}<ArrowRight size={20}/></span><small>{item.group}</small></button>)}</div>
    {!shown.length&&<div className="empty"><h3>{savedOnly?"Пока нет сохранённых образов":"Порода не найдена"}</h3><p>{savedOnly?"Откройте породу и нажмите «Сохранить» у понравившегося образа.":"Попробуйте другое название или оставьте заявку — обсудим уход."}</p><button className="button secondary" onClick={()=>{setQuery("");setSize("all");setSavedOnly(false);}}>Показать каталог</button></div>}
    {!query&&!savedOnly&&found.length>6&&<button className="button secondary show-all" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?"Показать меньше":"Показать все ("+found.length+")"}<ArrowDown size={21}/></button>}
    <p className="catalogue-note">Иллюстративные референсы. Форму и длину согласуем с учётом шерсти питомца. Это не портфолио салона.</p>
   </section>
   <section className="looks-section section" id="looks"><div className="section-heading"><div><p className="eyebrow">{breed.species==="cat"?"УХОД ЗА ШЕРСТЬЮ КОШКИ":"ВЫБЕРИТЕ ОРИЕНТИР"}</p><h2>{breed.name}</h2></div><label className="breed-select">{species==="cat"?"Другая порода или тип шерсти":"Другая порода"}<select aria-label="Порода для сравнения" value={breedId} onChange={e=>chooseBreed(e.target.value)}>{BREEDS.filter(v=>v.species===species).map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label></div>
    <p className="care-context">{breed.defaultServiceId==="coat"?"Обсуждаем уход за шерстью и естественный силуэт. Состав процедуры подберём для вашего питомца.":"Сравните форму и детали стрижки. Выбор согласуем с грумером."}</p>
    <div className="look-grid">{breed.styles.map(s=>{const id=breed.id+":"+s.id,isSaved=saved.ids.includes(id);return <article className="look-card" key={id}><LookPhoto breed={breed} frame={s.frame} label={breed.name+" — "+s.name}/><div className="look-card-title"><h3>{s.name}</h3><button className="icon-button" onClick={()=>toggleSave(id)} aria-label={(isSaved?"Убрать из избранного: ":"Сохранить: ")+s.name} aria-pressed={isSaved}><BookmarkSimple size={24} weight={isSaved?"fill":"regular"}/></button></div><button className="text-link" onClick={()=>{setA(s.id);setB(breed.styles.find(v=>v.id!==s.id).id);go("compare");}}>Сравнить <ArrowsHorizontal size={20}/></button></article>;})}</div>
   </section>
   <section className="compare-section section" id="compare"><div className="compare-copy"><p className="eyebrow">СРАВНЕНИЕ ОБРАЗОВ</p><h2>Проведите грань.<br/>Выберите детали.</h2><p>{breed.species==="cat"?"Уход за шерстью кошки.":"Образы и уход для собаки."}<br/>Передвиньте разделитель и сравните силуэт.</p><label>Слева<select aria-label="Левый образ" value={a} onChange={e=>setA(e.target.value)}>{breed.styles.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></label><label>Справа<select aria-label="Правый образ" value={b} onChange={e=>setB(e.target.value)}>{breed.styles.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></label>
     <button className="button secondary" onClick={()=>{const ids=[...new Set([breed.id+":"+a,breed.id+":"+b])];setSaved(v=>({...v,ids:[...new Set([...v.ids,...ids])]}));setToast("Выбранные образы сохранены");}}><BookmarkSimple size={21}/>Сохранить выбранные</button><small>Ползунок сравнивает референсы.<br/>Это не «до / после» вашего питомца.</small></div>
    <div className="comparison-wrap"><div className="comparison" style={{"--split":position+"%"}}>
     <LookPhoto breed={breed} frame={breed.styles.find(v=>v.id===b).frame} label={"Правый образ: "+breed.styles.find(v=>v.id===b).name}/>
     <div className="comparison-left"><LookPhoto breed={breed} frame={breed.styles.find(v=>v.id===a).frame} label={"Левый образ: "+breed.styles.find(v=>v.id===a).name}/></div>
     <div className="comparison-line" aria-hidden="true"><span><ArrowsHorizontal size={22}/></span></div>
     <input type="range" min="0" max="100" value={position} aria-label="Разделитель сравнения образов" aria-valuetext={position+"% левого образа"} onChange={e=>setPosition(Number(e.target.value))}/>
    </div><div className="comparison-captions"><span>{breed.styles.find(v=>v.id===a).name}</span><span>{breed.styles.find(v=>v.id===b).name}</span></div></div>
   </section>
   <section className="wish-section section"><BookmarkSimple size={35} weight="light"/><div><p className="eyebrow">КАРТОЧКА ПОЖЕЛАНИЙ</p><h2>Образ — с собой.</h2><p>Сохранено: {saved.ids.length}. Выбор хранится на этом устройстве.</p><label htmlFor="wishes">Что особенно нравится в образе?</label><textarea id="wishes" value={saved.notes} maxLength={1500} rows={3} placeholder="Например: оставить объём на ушах, обсудить длину корпуса" onChange={e=>setSaved(v=>({...v,notes:e.target.value}))}/></div><button className="button" onClick={openBooking}>Обсудить и записаться <ArrowRight size={22}/></button></section>
   <PriceList breed={breed} storefront={config.storefront} bookingPortalUrl={config.bookingPortalUrl} onShowLooks={id=>{chooseBreed(id);go("looks");}} onBook={context=>{const target=BREEDS.find(b=>b.id===context.breedId)||{id:context.breedId,name:context.breedName,species:context.species,size:"",defaultServiceId:"haircut"};if(BREEDS.some(b=>b.id===target.id))chooseBreed(target.id);setBookingContext({...context,breed:target});setOverlay("booking");}}/>
   <HotelTeaser/>
   <section className="closing section reveal"><p className="eyebrow">НАЧНЁМ СО ЗНАКОМСТВА</p><h2>У вашего питомца<br/>свой характер.<br/><span>Расскажите о нём.</span></h2><button className="button" onClick={openBooking}>{config.storefront?.selfBookingEnabled?"Выбрать время":"Записаться на груминг"} <ArrowRight size={23}/></button></section>
  </main>
  <footer className="footer"><div><a href="#" className="footer-brand">TemichevVET · груминг</a><p>{CLINIC_CONTACT.city}, {CLINIC_CONTACT.address}<br/><a href={CLINIC_CONTACT.phoneHref}>{CLINIC_CONTACT.phone}</a></p></div><p><a href="#works">Наши работы</a> · <a href={HOTEL_URL}>Зоогостиница ↗</a><br/>Каталог: иллюстративные образы для обсуждения с грумером.</p><button className="motion-button" onClick={()=>setMotion(!motion)} aria-pressed={motion}>{motion?<Pause size={17}/>:<Play size={17}/>}Движение {motion?"включено":"выключено"}</button>{config.mode==="qa"&&<p className="qa-note">{DEVICE_QA ? "Проверка на телефоне: вымышленные данные и тестовые сообщения MAX." : "Локальная проверка: заявки сохраняются в тестовой базе. Сообщения MAX перехватываются тестовым получателем."}</p>}</footer>
  <button className="help-button" onClick={()=>setOverlay("help")} aria-label="Помощь с записью"><ChatCircleDots size={26}/><span>Помочь с выбором?</span></button>
  {toast&&<div className="toast" role="status"><Check size={20}/>{toast}</div>}
  {overlay==="help"&&<Dialog title="Поможем с выбором" onClose={()=>setOverlay(null)}><p>Выберите породу, сохраните понравившиеся образы и расскажите о привычках питомца. Помощник соберёт эти пожелания в заявку.</p><div className="help-options"><button onClick={()=>{setOverlay(null);go("catalogue");}}>Хочу выбрать образ <ArrowRight size={21}/></button><button onClick={()=>setOverlay("booking:first")}>Это первый груминг <ArrowRight size={21}/></button><button onClick={openBooking}>Нужна помощь сотрудника <ArrowRight size={21}/></button></div><p className="muted">Стоимость, длительность и время визита согласует администратор.</p></Dialog>}
  {VISUAL_PREVIEW&&overlay?.startsWith("booking")&&<Dialog title="Перейти к записи" onClose={()=>setOverlay(null)}><p>Сейчас открыт просмотр новых фотографий. Выбор специалиста и времени доступен в проверенной версии сайта.</p><a className="button" href={"http://127.0.0.1:4264/?breed="+encodeURIComponent(bookingContext?.breed?.id||breed.id)+"&style="+encodeURIComponent(a)+"#services"}>Открыть запись <ArrowRight size={22}/></a></Dialog>}
  {!VISUAL_PREVIEW&&overlay?.startsWith("booking")&&<Booking config={config} breed={bookingContext?.breed||breed} priceContext={bookingContext} saved={saved} defaultLook={breed.id+":"+a} serviceId={overlay.split(":")[1]||breed.defaultServiceId} onChooseBreed={id=>{chooseBreed(id);setBookingContext(null);}} onClose={()=>setOverlay(null)}/>}
 </>
}

function Booking({config,breed,priceContext,saved,defaultLook,serviceId,onChooseBreed,onClose}) {
 const ids=[...new Set([...saved.ids.filter(id=>id.startsWith(breed.id+":")),...(groomingLook(defaultLook)?.breedId===breed.id?[defaultLook]:[])])].slice(0,3);
 const [form,setForm]=useState({contactName:"",phone:"",petName:"",serviceId,preferredDate:"",timeWindow:"ANY",notes:saved.notes,contactConsent:false,website:""});
 const [selected,setSelected]=useState(ids),[busy,setBusy]=useState(false),[error,setError]=useState(""),[result,setResult]=useState(null);
 const [manual,setManual]=useState(!config.bookingPortalUrl);
 useEffect(()=>setManual(!config.bookingPortalUrl),[config.bookingPortalUrl]);
 useEffect(()=>setSelected(ids),[breed.id]);
 const requestId=useRef(crypto.randomUUID());
 const change=(key,value)=>{setForm(v=>({...v,[key]:value}));requestId.current=crypto.randomUUID();setError("");};
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const submit=async e=>{e.preventDefault();if(busy)return;setError("");setBusy(true);try{
  const payload={...form,clientRequestId:requestId.current,breedId:breed.id,lookIds:selected};if(!payload.preferredDate)delete payload.preferredDate;
  const response=await fetch("/v1/public/grooming/bookings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null);if(!response.ok)throw Error(Array.isArray(data?.message)?data.message.join(". "):data?.message||"Не удалось отправить заявку. Попробуйте ещё раз.");
  if(!data?.ok||!data.requestId)throw Error("Сервер не подтвердил сохранение заявки. Попробуйте ещё раз.");
  setResult(data);
 }catch(e){setError(e.name==="TimeoutError"?"Ответ задержался. Нажмите ещё раз: повтор не создаст вторую заявку.":e.name==="TypeError"?"Нет связи с сервером. Попробуйте ещё раз.":e.message||"Нет связи с сервером. Попробуйте ещё раз.");}finally{setBusy(false);}};
 return <Dialog title={result?"Заявка сохранена":manual?"Заявка на груминг":"Записаться на груминг"} onClose={onClose} wide>
  {result?<div className="booking-result"><CheckCircle size={52} weight="light"/><h3>{result.mode==="qa"?"Тестовая заявка принята":"Спасибо, "+form.contactName+"."}</h3><p>{result.mode==="qa"?"Данные сохранены в отдельной тестовой базе. Реальным сотрудникам сообщения не отправлялись.":"Администратор свяжется с вами, чтобы согласовать уход, стоимость и время."}</p><p>Питомец: {form.petName} · {breed.name}<br/>Образов в заявке: {selected.length}</p><p className="request-number">Номер заявки: {result.requestId}</p><p>Время визита пока не подтверждено.</p><button className="button" onClick={onClose}>Вернуться к образам <ArrowRight size={22}/></button></div>:
   !manual?<><label className="booking-pet">Для кого выбираем уход?<select aria-label="Порода питомца для записи" value={breed.id} onChange={e=>onChooseBreed(e.target.value)}>{[["dog","Собаки"],["cat","Кошки"]].map(([species,label])=><optgroup label={label} key={species}>{BREEDS.filter(item=>item.species===species).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></label><SiteBooking config={config} breed={breed} priceContext={priceContext} notes={form.notes} onNotes={value=>change("notes",value)} lookIds={ids} selectedLooks={selected} onToggleLook={id=>setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])} lookName={id=>groomingLook(id)?.styleName||id}/></>:

   <form onSubmit={submit}><p className="booking-intro">{breed.species==="cat"?"Кошка":"Собака"} · {breed.name} · пожелания и выбранные образы прикрепим к заявке.</p>{config.mode==="qa"&&<p className="notice">Локальная проверка. Используйте тестовые данные; сообщения в MAX не уходят реальным людям.</p>}{!config.enabled&&<div className="notice"><p>Уточните стоимость и запишитесь через администратора.</p><a className="text-link" href={CLINIC_CONTACT.phoneHref}>{CLINIC_CONTACT.phone} <ArrowRight size={20}/></a></div>}
    <fieldset disabled={busy}><div className="booking-grid"><label>Как к вам обращаться<input autoComplete="given-name" required minLength={2} maxLength={100} value={form.contactName} onChange={e=>change("contactName",e.target.value)}/></label><label>Телефон<input type="tel" autoComplete="tel" required maxLength={32} placeholder="+7 …" pattern="[+0-9 ()-]{10,32}" value={form.phone} onChange={e=>change("phone",e.target.value)}/></label><label>Кличка питомца<input required maxLength={80} value={form.petName} onChange={e=>change("petName",e.target.value)}/></label><label>Услуга<select value={form.serviceId} onChange={e=>change("serviceId",e.target.value)}>{SERVICES.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label><label>Желаемая дата · необязательно<input type="date" min={today} value={form.preferredDate} onInput={e=>change("preferredDate",e.target.value)} onChange={e=>change("preferredDate",e.target.value)}/></label><label>Удобное время<select value={form.timeWindow} onChange={e=>change("timeWindow",e.target.value)}><option value="ANY">Обсудить</option><option value="MORNING">Утро</option><option value="AFTERNOON">День</option><option value="EVENING">Вечер</option></select></label></div>
    <div className="booking-looks"><p>Образы для грумера</p>{ids.map(id=>{const look=groomingLook(id);return <label className="check-line" key={id}><input type="checkbox" checked={selected.includes(id)} onChange={()=>{setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);requestId.current=crypto.randomUUID();}}/>{look.styleName}</label>;})}</div>
    <label>Пожелания и привычки питомца<textarea maxLength={1500} rows={3} value={form.notes} onChange={e=>change("notes",e.target.value)} /></label>
    <div className="honeypot" aria-hidden="true"><label>Ваш сайт<input tabIndex={-1} autoComplete="off" value={form.website} onChange={e=>change("website",e.target.value)}/></label></div>
    <label className="check-line consent"><input type="checkbox" required checked={form.contactConsent} onChange={e=>change("contactConsent",e.target.checked)}/><span>Разрешаю связаться со мной по этой заявке.{config.privacyUrl&&<> <a href={config.privacyUrl} target="_blank" rel="noreferrer">Обработка данных</a>.</>}</span></label>
    {error&&<p className="error" role="alert">{error}</p>}<button className="button booking-submit" type="submit" disabled={!config.enabled||busy}>{busy?"Сохраняем заявку…":"Отправить заявку"}<PaperPlaneTilt size={21}/></button><p className="muted">Заявка не бронирует время автоматически. Его согласует администратор.</p></fieldset>
   </form>}
 </Dialog>;
}
