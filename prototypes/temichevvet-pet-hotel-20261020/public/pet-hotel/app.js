const $ = selector => document.querySelector(selector);
const root = document.documentElement;
const rubles = value => new Intl.NumberFormat('ru-RU', {style:'currency',currency:'RUB',maximumFractionDigits:0}).format(value);
const dateLabel = value => new Intl.DateTimeFormat('ru-RU',{dateStyle:'long',timeZone:'Europe/Moscow'}).format(new Date(value+'T12:00:00Z'));
const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const addDays = (date,amount) => new Date(Date.parse(date+'T12:00:00Z')+amount*86400000).toISOString().slice(0,10);
const arrival = $('#arrival'), departure = $('#departure'), kind = $('#pet-kind'), weight = $('#dog-weight'), walks = $('#walk-count');
arrival.min=today; arrival.value=today; departure.min=addDays(today,2); departure.value=departure.min;
let trip = null;
function recalculate() {
  const dog=kind.value==='DOG';
  $('#dog-weight-label').hidden=!dog; weight.disabled=!dog; weight.required=dog;
  $('#walks-label').hidden=!dog; walks.disabled=!dog;
  const days=(Date.parse(departure.value+'T12:00:00Z')-Date.parse(arrival.value+'T12:00:00Z'))/86400000;
  const walkCount=dog?Number(walks.value):0, dogWeight=Number(weight.value);
  let error='';
  if(!arrival.value||!departure.value||!Number.isFinite(days))error='Выберите даты заезда и выезда.';
  else if(arrival.value<today)error='Выберите дату заезда сегодня или позже.';
  else if(!Number.isInteger(days)||days<2)error='Минимальный срок проживания — двое суток. Выберите выезд минимум через два дня после заезда.';
  else if(days>365)error='Для более длительного проживания обсудите расчёт с администратором.';
  else if(dog&&(!Number.isFinite(dogWeight)||dogWeight<=0||dogWeight>10))error='Принимаем собак весом до 10 кг. Проверьте вес питомца.';
  else if(!Number.isInteger(walkCount)||walkCount<0||walkCount>100)error='Укажите количество выгулов от 0 до 100 либо обсудите их с администратором.';
  $('#estimate-error').textContent=error; $('#estimate-error').hidden=!error;
  $('#estimate-result').hidden=!!error; $('#copy-trip').disabled=!!error;
  $('#copy-status').textContent='';
  if(error){trip=null;return;}
  const stay=days*700, walkPrice=walkCount*150;
  trip={dog,days,walkCount,dogWeight,arrival:arrival.value,departure:departure.value,total:stay+walkPrice};
  $('#stay-label').textContent=`${days} сут. × 700 ₽`;
  $('#stay-price').textContent=rubles(stay);
  $('#walk-price-line').hidden=!dog||walkCount===0;
  $('#walk-price-label').textContent=`${walkCount} выгул. × 150 ₽`;
  $('#walk-price').textContent=rubles(walkPrice); $('#trip-total').textContent=rubles(trip.total);
}
$('#trip-form').addEventListener('input',recalculate);
$('#trip-form').addEventListener('change',event=>{
  if(event.target===kind&&kind.value==='CAT')walks.value='0';
  if(event.target===arrival&&arrival.value){departure.min=addDays(arrival.value,2);}
  recalculate();
});
$('#trip-form').addEventListener('submit',event=>event.preventDefault());
$('#copy-trip').addEventListener('click',async()=>{
  if(!trip)return;
  const text=`Здравствуйте! Хочу уточнить размещение в зоогостинице TemichevVET.\nПитомец: ${trip.dog?'собака, '+trip.dogWeight+' кг':'кошка'}.\nЖелаемые даты: ${dateLabel(trip.arrival)} — ${dateLabel(trip.departure)} (${trip.days} сут.).\n${trip.dog?'Выгулов за всё проживание: '+trip.walkCount+'.\n':''}Предварительно: ${rubles(trip.total)}. Прошу подтвердить наличие номера, время выезда и итоговую стоимость.\nКорм и миски привезу с собой.`;
  try {await navigator.clipboard.writeText(text);$('#copy-status').textContent='План скопирован. Передайте его администратору для согласования — бронь ещё не создана.';}
  catch {$('#copy-fallback').value=text;$('#copy-dialog').showModal();$('#copy-fallback').focus();$('#copy-fallback').select();}
});
$('#copy-close').onclick=()=>$('#copy-dialog').close();
recalculate();
const checks=[...document.querySelectorAll('.checklist input')];
checks.forEach(box=>box.addEventListener('change',()=>$('#check-progress').textContent=`Приготовлено ${checks.filter(x=>x.checked).length} из ${checks.length}`));
const gallery=[['assets/hotel-glass-4812.jpg','Стеклянные секции зоогостиницы'],['assets/hotel-rooms-4814.jpg','Ряд номеров с остеклёнными дверцами'],['assets/hotel-inside-4817.jpg','Вид внутри номера']];
const dialog=$('#photo-dialog');let photoIndex=0, opener=null;
function showPhoto(index){photoIndex=(index+gallery.length)%gallery.length;$('#photo-full').src=gallery[photoIndex][0];$('#photo-full').alt=gallery[photoIndex][1];$('#photo-caption').textContent=gallery[photoIndex][1];$('#photo-number').textContent=`${photoIndex+1} / ${gallery.length}`;}
document.querySelectorAll('[data-photo]').forEach(button=>button.addEventListener('click',()=>{opener=button;showPhoto(Number(button.dataset.photo));dialog.showModal();}));
$('#photo-close').onclick=()=>dialog.close();$('#photo-previous').onclick=()=>showPhoto(photoIndex-1);$('#photo-next').onclick=()=>showPhoto(photoIndex+1);
dialog.addEventListener('keydown',event=>{if(event.key==='ArrowLeft'){event.preventDefault();showPhoto(photoIndex-1);}if(event.key==='ArrowRight'){event.preventDefault();showPhoto(photoIndex+1);}});
dialog.addEventListener('close',()=>opener?.focus({preventScroll:true}));
// A separate local preview preserves the accepted grooming runtime on 4264.
if(!['127.0.0.1','localhost'].includes(location.hostname))document.querySelectorAll('[data-grooming-link]').forEach(a=>{a.href='/'+(a.hash||'');});
const reduced=matchMedia('(prefers-reduced-motion: reduce)');let motion=!reduced.matches, ticking=false;
root.classList.add('js');
function updateMotion(){root.classList.toggle('motion-off',!motion);$('#motion-toggle').textContent=motion?'Движение включено':'Движение выключено';$('#motion-toggle').setAttribute('aria-pressed',String(motion));if(!motion)document.querySelector('[data-parallax]').style.transform='';}
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.08});
document.querySelectorAll('[data-reveal]').forEach(element=>observer.observe(element));
$('#motion-toggle').onclick=()=>{motion=!motion;updateMotion();};reduced.addEventListener('change',()=>{motion=!reduced.matches;updateMotion();});updateMotion();
window.addEventListener('scroll',()=>{if(ticking||!motion||reduced.matches)return;ticking=true;requestAnimationFrame(()=>{const photo=document.querySelector('[data-parallax]');const shift=Math.min(25,Math.max(-25,window.scrollY*.045));photo.style.transform=`scale(1.055) translateY(${shift}px)`;ticking=false;});},{passive:true});
