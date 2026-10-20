import {articles} from './articles.js';
import {HotelBooking} from './booking.js';
const $=selector=>document.querySelector(selector), $$=selector=>[...document.querySelectorAll(selector)];
const root=document.documentElement;
const rubles=value=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',minimumFractionDigits:0,maximumFractionDigits:2}).format(value);
const dateLabel=value=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(new Date(value+'T12:00:00Z'));
const dateShort=value=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',timeZone:'Europe/Moscow'}).format(new Date(value+'T12:00:00Z'));
const todayParts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
const today=['year','month','day'].map(k=>todayParts.find(x=>x.type===k).value).join('-');
const addDays=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const arrival=$('#arrival'), departure=$('#departure'), arrivalTime=$('#arrival-time'), departureTime=$('#departure-time'), kind=$('#pet-kind'), weight=$('#dog-weight'), walks=$('#walk-count');
arrival.min=today; arrival.value=addDays(today,1); departure.min=addDays(arrival.value,2); departure.value=departure.min;
let trip=null, selectedQuote=null, booking=null, startingRate=700;
let terms={dailyRate:700,walkRate:150,minimumDays:2,maximumDogWeightKg:10,checkInFrom:'09:00',checkInTo:'18:00'};
function updateMobile(quote,currentTrip,dog){
 const mobileBar=$('.mobile-trip-bar');
 $('#mobile-pet').textContent=quote?`${quote.roomName} · ${currentTrip.days} сут.`:dog?`Для собаки до ${terms.maximumDogWeightKg} кг · от ${terms.minimumDays} суток`:`Для кошки · от ${terms.minimumDays} суток`;
 mobileBar.querySelector('[data-start-rate]').textContent=quote?new Intl.NumberFormat('ru-RU').format(currentTrip.total):'от '+new Intl.NumberFormat('ru-RU').format(startingRate);
 mobileBar.querySelector('i').textContent=quote?'за проживание':'/ сутки';
 mobileBar.querySelector('a').href=quote?'#trip-summary':'#estimate';
 mobileBar.querySelector('a').innerHTML=(quote?'К итогу':'Спланировать')+' <span aria-hidden="true">↗</span>';
}
function recalculate(){
 const dog=kind.value==='DOG';
 $('#dog-options').hidden=!dog;weight.disabled=!dog;weight.required=dog;walks.disabled=!dog;
 const elapsedHours=(Date.parse(departure.value+'T'+departureTime.value+':00+03:00')-Date.parse(arrival.value+'T'+arrivalTime.value+':00+03:00'))/3600000;
 const days=Math.ceil(elapsedHours/24);
 const walkCount=dog?Number(walks.value):0,dogWeight=Number(weight.value);let error='';
 if(!arrival.value||!departure.value||!arrivalTime.value||!departureTime.value||!Number.isFinite(days))error='Выберите даты и время заезда и выезда.';
 else if(arrival.value<today)error='Выберите дату заезда сегодня или позже.';
 else if(Date.parse(arrival.value+'T'+arrivalTime.value+':00+03:00')<=Date.now())error='Выберите будущее время заезда.';
 else if(arrivalTime.value<terms.checkInFrom||arrivalTime.value>terms.checkInTo)error=`Заселение проходит с ${terms.checkInFrom} до ${terms.checkInTo}. Выберите время в этом промежутке.`;
 else if(elapsedHours<terms.minimumDays*24)error=`Минимальный срок — ${terms.minimumDays} сут. (${terms.minimumDays*24} ч.). Проверьте дату и время выезда.`;
 else if(days>365)error='Для более длительного проживания обсудите расчёт с администратором.';
 else if(dog&&(!Number.isFinite(dogWeight)||dogWeight<=0||dogWeight>terms.maximumDogWeightKg))error=`Принимаем собак весом до ${terms.maximumDogWeightKg} кг. Проверьте вес питомца.`;
 else if(!Number.isInteger(walkCount)||walkCount<0||walkCount>100)error='Укажите количество выгулов от 0 до 100 либо обсудите их с администратором.';
 $('#estimate-error').textContent=error;$('#estimate-error').hidden=!error;$('#estimate-result').hidden=!!error;$('#summary-invalid').hidden=!error;$('#copy-trip').disabled=!!error;$('#copy-status').textContent='';
 $('#summary-pet').textContent=dog?'Для вашей собаки.':'Для вашей кошки.';
 $('#summary-dates').textContent=!error?`${dateShort(arrival.value)}, ${arrivalTime.value} — ${dateShort(departure.value)}, ${departureTime.value}`:'Желаемые даты проживания';
 $$('[data-duration]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.duration)*24===elapsedHours)));
 if(error){trip=null;updateMobile(null,null,dog);booking?.updateTrip(null);return;}
 const stay=selectedQuote?Number(selectedQuote.stayPrice):days*Number(terms.dailyRate),walkPrice=selectedQuote?Number(selectedQuote.walksPrice):walkCount*Number(terms.walkRate);trip={dog,days,elapsedHours,walkCount,dogWeight,arrival:arrival.value,departure:departure.value,arrivalTime:arrivalTime.value,departureTime:departureTime.value,total:stay+walkPrice,...(selectedQuote?{roomName:selectedQuote.roomName}: {})};
 $('#stay-label').textContent=`${days} сут. × ${rubles(selectedQuote?.dailyRate??terms.dailyRate)}`;$('#stay-price').textContent=rubles(stay);
 $('#walk-price-line').hidden=!dog||walkCount===0;$('#walk-price-label').textContent=`${walkCount} выгул. × ${rubles(selectedQuote?.walkRate??terms.walkRate)}`;$('#walk-price').textContent=rubles(walkPrice);$('#trip-total').textContent=rubles(trip.total);
 $('#total-label').textContent=selectedQuote?'По выбранному номеру':'Предварительно';
 updateMobile(selectedQuote,trip,dog);
 booking?.updateTrip(trip);
}
function choosePet(value){
 const dog=value==='DOG';kind.value=dog?'DOG':'CAT';if(!dog)walks.value='0';
 $$('input[name="species"]').forEach(input=>{input.checked=input.value===kind.value;input.closest('.pet-option').classList.toggle('is-selected',input.checked);});
 $$('[data-pet-choose]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.petChoose===kind.value)));
 $('#hero-cat').classList.toggle('is-active',!dog);$('#hero-dog').classList.toggle('is-active',dog);
 $('#packing-image').src=dog?'assets/guest-6.jpg':'assets/guest-2.jpg';
 $('#packing-image').alt=dog?'Вест-хайленд-терьер в нашей гостинице, обработка качества с AI':'Кошки в нашей гостинице, обработка качества с AI';
 recalculate();
}
$$('[data-pet-choose]').forEach(button=>button.addEventListener('click',()=>choosePet(button.dataset.petChoose)));
$$('input[name="species"]').forEach(input=>input.addEventListener('change',()=>choosePet(input.value)));
$('#trip-form').addEventListener('input',event=>{if(event.target===arrival&&arrival.value){departure.min=addDays(arrival.value,2);}recalculate();});
$('#trip-form').addEventListener('submit',event=>event.preventDefault());
$$('[data-duration]').forEach(button=>button.addEventListener('click',()=>{if(!arrival.value)arrival.value=today;departure.min=addDays(arrival.value,2);departure.value=addDays(arrival.value,Number(button.dataset.duration));departureTime.value=arrivalTime.value;recalculate();}));
choosePet('CAT');
booking=new HotelBooking({getTrip:()=>trip,onQuote:q=>{selectedQuote=q;recalculate();},onCatalog:data=>{terms={...terms,...data.settings};arrivalTime.min=terms.checkInFrom;arrivalTime.max=terms.checkInTo;weight.max=String(terms.maximumDogWeightKg);const rates=data.rooms.map(r=>Number(r.dailyRate)).filter(Number.isFinite);if(rates.length){startingRate=Math.min(...rates);$$('[data-start-rate]').forEach(e=>e.textContent='от '+new Intl.NumberFormat('ru-RU').format(startingRate));}recalculate();}});
$('#copy-trip').addEventListener('click',async()=>{
 if(!trip)return;
 const text=`Здравствуйте! Хочу уточнить размещение в зоогостинице TemichevVET.\nПитомец: ${trip.dog?'собака, '+trip.dogWeight+' кг':'кошка'}.\nЖелаемые даты: ${dateLabel(trip.arrival)}, ${trip.arrivalTime} — ${dateLabel(trip.departure)}, ${trip.departureTime}.\nОплачиваемых суток: ${trip.days}; неполные сутки округляются вверх.\n${trip.dog?'Выгулов за всё проживание: '+trip.walkCount+'.\n':''}Предварительно: ${rubles(trip.total)}. Прошу подтвердить наличие номера, время выезда и итоговую стоимость.\nКорм и миски привезу с собой.`;
 try{await navigator.clipboard.writeText(text);$('#copy-status').textContent='План скопирован. Передайте администратору для согласования — бронь ещё не создана.';}
 catch{$('#copy-fallback').value=text;$('#copy-dialog').showModal();$('#copy-fallback').focus();$('#copy-fallback').select();}
});
$('#copy-close').onclick=()=>$('#copy-dialog').close();
const checks=$$('.checklist input'),packingKey='temichevvet-hotel-packing-v1';
try{const saved=JSON.parse(localStorage.getItem(packingKey)||'[]');if(Array.isArray(saved))checks.forEach(c=>c.checked=saved.includes(c.value));}catch{}
function updatePacking(){const count=checks.filter(c=>c.checked).length;$('#check-count').textContent=`${count}/${checks.length}`;$('.progress-ring').style.setProperty('--done',`${count/checks.length*100}%`);$('#check-progress').textContent=count===checks.length?'Всё отмечено. Уточните детали размещения у администратора.':count?`Приготовлено ${count} из ${checks.length}. Список сохранён на этом устройстве.`:'Пока ничего не собрано. Начнём с привычного корма?';}
checks.forEach(c=>c.addEventListener('change',()=>{try{localStorage.setItem(packingKey,JSON.stringify(checks.filter(c=>c.checked).map(c=>c.value)));}catch{}updatePacking();}));updatePacking();
const roomPhotos=[
 {src:'assets/hotel-rooms-4814.jpg',title:'С порога.',alt:'Ряд номеров с остеклёнными дверцами',description:'Общий вид номеров с деревянными перегородками и остеклёнными дверцами.',detailTitle:'Остеклённые дверцы',detail:'Можно рассмотреть помещение через стекло. Подходящий номер обсудим при согласовании размещения.',x:'56%',y:'55%'},
 {src:'assets/hotel-glass-4812.jpg',title:'За стеклом.',alt:'Номера зоогостиницы со стеклянными дверцами',description:'Другой ракурс: стеклянные дверцы, перегородки и полочки внутри.',detailTitle:'Детали изнутри',detail:'На фотографии видны стеклянные перегородки и полочки. Обсудите, какое размещение подойдёт вашему питомцу.',x:'47%',y:'48%'},
 {src:'assets/hotel-inside-4817-clean.jpg',title:'Внутри.',alt:'Вид через открытую дверцу внутрь номера',description:'Открытая дверца и обстановка внутри одного из помещений.',detailTitle:'Свои привычные вещи',detail:'Корм и миски нужно привезти с собой. Лежанку, игрушку, туалет и наполнитель можно взять по необходимости.',x:'68%',y:'56%'}
];
const guestPhotos=[
 {src:'assets/guest-1.jpg',alt:'Мопс в помещении зоогостиницы',species:'DOG'},
 {src:'assets/guest-2.jpg',alt:'Кошки за стеклянными дверцами',species:'CAT'},
 {src:'assets/guest-3.jpg',alt:'Кошки на полочках в зоогостинице',species:'CAT'},
 {src:'assets/guest-4.jpg',alt:'Французский бульдог у стеклянной дверцы',species:'DOG'},
 {src:'assets/guest-5.jpg',alt:'Такса рядом со своим укрытием',species:'DOG'},
 {src:'assets/guest-6.jpg',alt:'Вест-хайленд-терьер в номере',species:'DOG'}
];
let angle=0;
$$('[data-angle]').forEach(button=>button.addEventListener('click',()=>{
 angle=Number(button.dataset.angle);const photo=roomPhotos[angle];
 const roomImage=$('#room-image');(roomImage.getAnimations?.()||[]).forEach(animation=>animation.cancel());roomImage.src=photo.src;roomImage.alt=photo.alt;
 if(motion&&!reduced.matches)roomImage.animate?.([{opacity:.45,transform:'scale(1.025)'},{opacity:1,transform:'scale(1)'}],{duration:550,easing:'cubic-bezier(.2,.7,.2,1)'});
 $('#room-title').textContent=photo.title;$('#room-description').textContent=photo.description;$('.room-stage').dataset.angle=String(angle);$('.room-shot-number').textContent=`0${angle+1} / 03`;
 $('#room-detail').hidden=true;$('#room-detail-title').textContent=photo.detailTitle;$('#room-detail-text').textContent=photo.detail;$('#room-hotspot').setAttribute('aria-expanded','false');$('#room-hotspot').style.left=photo.x;$('#room-hotspot').style.top=photo.y;
 $$('[data-angle]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
}));
$('#room-hotspot').onclick=()=>{const open=$('#room-detail').hidden;$('#room-detail').hidden=!open;$('#room-hotspot').setAttribute('aria-expanded',String(open));};
const dialog=$('#photo-dialog');let photoIndex=0,photoSet=roomPhotos,opener=null,captionNote='Наши помещения · ретушь с AI';
function showPhoto(index){photoIndex=(index+photoSet.length)%photoSet.length;$('#photo-full').src=photoSet[photoIndex].src;$('#photo-full').alt=photoSet[photoIndex].alt;$('#photo-caption').textContent=`${photoSet[photoIndex].alt}. ${captionNote}`;$('#photo-number').textContent=`${photoIndex+1} / ${photoSet.length}`;}
function openPhoto(set,index,trigger,note){photoSet=set;opener=trigger;captionNote=note;showPhoto(index);dialog.showModal();}
$('#room-expand').onclick=event=>openPhoto(roomPhotos,angle,event.currentTarget,'Наши помещения · ретушь с AI');
$('#photo-close').onclick=()=>dialog.close();$('#photo-previous').onclick=()=>showPhoto(photoIndex-1);$('#photo-next').onclick=()=>showPhoto(photoIndex+1);
dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(photoIndex-1);}if(event.key==='ArrowRight'){event.preventDefault();showPhoto(photoIndex+1);}});dialog.addEventListener('close',()=>opener?.focus({preventScroll:true}));
$$('[data-guest-photo]').forEach(button=>button.addEventListener('click',()=>{const active=$('[data-guest-filter][aria-pressed="true"]').dataset.guestFilter;const photos=guestPhotos.filter(photo=>active==='ALL'||photo.species===active);openPhoto(photos,photos.indexOf(guestPhotos[Number(button.dataset.guestPhoto)]),button,'Фото из нашего объявления · обработка качества с AI');}));
const guestTrack=$('#guest-track');
$$('[data-guest-filter]').forEach(button=>button.addEventListener('click',()=>{
 $$('[data-guest-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
 $$('[data-guest-species]').forEach(card=>card.hidden=button.dataset.guestFilter!=='ALL'&&card.dataset.guestSpecies!==button.dataset.guestFilter);
 guestTrack.scrollTo({left:0,behavior:'instant'});updateGuestNav();
}));
function updateGuestNav(){if(!guestTrack)return;$('#guests-previous').disabled=guestTrack.scrollLeft<5;$('#guests-next').disabled=guestTrack.scrollLeft+guestTrack.clientWidth>=guestTrack.scrollWidth-5;}
$('#guests-previous').onclick=()=>guestTrack.scrollBy({left:-guestTrack.clientWidth*.8,behavior:motion?'smooth':'instant'});$('#guests-next').onclick=()=>guestTrack.scrollBy({left:guestTrack.clientWidth*.8,behavior:motion?'smooth':'instant'});guestTrack.addEventListener('scroll',updateGuestNav,{passive:true});window.addEventListener('resize',updateGuestNav);
let articleOpener=null;
$$('[data-article]').forEach(link=>link.addEventListener('click',event=>{if(event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;const article=articles[link.dataset.article];if(!article)return;event.preventDefault();articleOpener=link;$('#article-category').textContent=article.category;$('#article-title').textContent=article.title;$('#article-body').innerHTML=article.body;$('#article-permalink').href=`journal/${article.slug}.html`;$('#article-dialog').showModal();}));
$('#article-close').onclick=()=>$('#article-dialog').close();$('#article-dialog').addEventListener('close',()=>articleOpener?.focus({preventScroll:true}));
if(!['127.0.0.1','localhost'].includes(location.hostname))$$('[data-grooming-link]').forEach(a=>a.href='/'+(a.hash||''));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let motion=!reduced.matches,ticking=false;
function updateMotion(){root.classList.toggle('motion-off',!motion);$('#motion-toggle').textContent=motion?'Движение включено':'Движение выключено';$('#motion-toggle').setAttribute('aria-pressed',String(motion));if(!motion){($('#room-image').getAnimations?.()||[]).forEach(animation=>animation.cancel());$('.hero-scene').style.transform='';$('.scroll-progress span').style.transform='scaleX(0)';}}
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.08});$$('[data-reveal]').forEach(el=>observer.observe(el));
$('#motion-toggle').onclick=()=>{motion=!motion;updateMotion();};reduced.addEventListener('change',()=>{motion=!reduced.matches;updateMotion();});updateMotion();root.classList.add('js');updateGuestNav();
window.addEventListener('scroll',()=>{if(ticking||!motion||reduced.matches)return;ticking=true;requestAnimationFrame(()=>{const hero=$('.hero'),ratio=Math.min(1,Math.max(0,window.scrollY/hero.offsetHeight));$('.hero-scene').style.transform=`translateY(${ratio*48}px) scale(${1+ratio*.045})`;$('.scroll-progress span').style.transform=`scaleX(${ratio})`;ticking=false;});},{passive:true});
const tripBarObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{$('.mobile-trip-bar').hidden=entry.isIntersecting&&entry.intersectionRatio>.2;}),{threshold:[0,.2]});tripBarObserver.observe($('.hero'));
