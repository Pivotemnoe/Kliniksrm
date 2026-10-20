import {useEffect,useId,useState} from 'react';
import {ArrowRight,Plus,Clock} from '@phosphor-icons/react';
import {CAT_PRICES,DOG_PRICES,DOG_SERVICE_DETAILS,EXTRA_SERVICES,priceText} from './pricing-data';

const groups=[...new Set(DOG_PRICES.map(item=>item.group))];
const byCatalogue=id=>DOG_PRICES.find(item=>item.catalogueId===id);
const catServices=[
 {key:'dry',name:'Стрижка без мытья',description:'С вашей помощью во время процедуры.'},
 {key:'wash',name:'Стрижка и мытьё',description:'С вашей помощью во время процедуры.'},
 {key:'deshedWash',name:'Экспресс-линька и мытьё',description:'Уход за шерстью и подшёрстком.'},
];

function PriceCard({service,price}) {
 return <article className="price-card">
  <div className="price-card-top"><h3>{service.name}</h3><p className={'price-amount'+(!price?' price-to-agree':'')}>{priceText(price)}</p></div>
  <p className="price-card-description">{service.description}</p>
  {service.includes&&<details className="price-includes"><summary>Что входит <Plus size={18}/></summary><ul>{service.includes.map(text=><li key={text}>{text}</li>)}</ul></details>}
 </article>;
}

export function PriceList({breed,bookingPortalUrl,onShowLooks,onBook}) {
 const [species,setSpecies]=useState(breed.species);
 const [selected,setSelected]=useState(byCatalogue(breed.id)?.id||'other');
 const [coat,setCoat]=useState('clean');
 const selectId=useId(),conditionId=useId();
 useEffect(()=>{setSpecies(breed.species);if(breed.species==='dog')setSelected(byCatalogue(breed.id)?.id||'other');},[breed.id,breed.species]);
 const unlisted=breed.species==='dog'&&!byCatalogue(breed.id);
 const current=DOG_PRICES.find(item=>item.id===selected)||{id:'other',name:unlisted?breed.name:'Другая порода',catalogueId:unlisted?breed.id:null,coatCare:unlisted&&breed.defaultServiceId==='coat'};
 const services=current.coatCare?DOG_SERVICE_DETAILS.map(service=>service.key==='dry'?{...service,name:'Вычёсывание без мытья',description:'Уход за шерстью и подшёрстком.',includes:['Вычёсывание шерсти','Объём работы согласуем по состоянию подшёрстка']}:service.key==='full'?{...service,name:'Мытьё и уход за шерстью',description:'Полный уход с естественным силуэтом.',includes:['Мытьё и сушка феном','Вычёсывание шерсти','Чистка ушей и подстригание когтей','Детали ухода согласуем с вами']}:service):DOG_SERVICE_DETAILS;
 const extras=species==='cat'?[
  {id:'cat-deshed',name:'Экспресс-линька без мытья',price:CAT_PRICES.deshed},
  {id:'cat-assistant',name:'Помощь сотрудника при стрижке кошки',price:CAT_PRICES.assistant,supplement:true},
  ...EXTRA_SERVICES.filter(item=>['claws','ear-clean','mats'].includes(item.id)),
 ]:EXTRA_SERVICES;
 return <section className="services price-section section" id="services" aria-labelledby="prices-title">
  <div className="section-heading"><div><p className="eyebrow">ДЛЯ СОБАК И КОШЕК</p><h2 id="prices-title">Уход и цены.</h2></div><p>Выберите питомца и породу.<br/>Покажем ориентировочную стоимость.</p></div>
  <div className="price-toolbar">
   <div className="price-species" role="group" aria-label="Цены по виду питомца"><button aria-label="Цены для собак" aria-pressed={species==='dog'} onClick={()=>setSpecies('dog')}>Собаки</button><button aria-label="Цены для кошек" aria-pressed={species==='cat'} onClick={()=>setSpecies('cat')}>Кошки</button></div>
   {species==='dog'?<label className="price-select" htmlFor={selectId}>Порода или размер питомца<select id={selectId} value={selected} onChange={event=>setSelected(event.target.value)}><option value="other">{unlisted?breed.name+' — уточнить стоимость':'Другая порода — уточнить стоимость'}</option>{groups.map(group=><optgroup key={group} label={group}>{DOG_PRICES.filter(item=>item.group===group).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>)}</select></label>:<label className="price-select" htmlFor={conditionId}>Состояние шерсти<select id={conditionId} value={coat} onChange={event=>setCoat(event.target.value)}><option value="clean">Без колтунов</option><option value="matted">Есть колтуны</option></select></label>}
  </div>
  <div className="price-current"><h3>{species==='cat'?'Уход для кошки':current.name}</h3>{(species==='cat'||current.duration)&&<span><Clock size={18}/>{species==='cat'?CAT_PRICES.duration:current.duration}<small>ориентировочно</small></span>}</div>
  <div className="price-grid" aria-live="polite" aria-atomic="true">{species==='dog'?services.map(service=><PriceCard key={service.key} service={service} price={current[service.key]}/>):catServices.map(service=><PriceCard key={service.key} service={service} price={CAT_PRICES[coat][service.key]}/>)}</div>
  {species==='dog'&&current.note&&<p className="price-breed-note">{current.note}</p>}
  <div className="price-bottom"><p>Цена зависит от размера питомца, состояния шерсти и выбранного ухода. Итоговую стоимость и возможные доплаты согласуем до начала процедуры.</p><div className="price-actions">{species==='dog'&&current.catalogueId?<button className="button" onClick={()=>onBook(current.catalogueId)}>Выбрать грумера и время <ArrowRight size={22}/></button>:species==='cat'&&breed.species==='cat'?<button className="button" onClick={()=>onBook(breed.id)}>Выбрать грумера и время <ArrowRight size={22}/></button>:bookingPortalUrl?<a className="button" href={bookingPortalUrl}>Выбрать грумера и время <ArrowRight size={22}/></a>:<p className="muted">Подключаем запись. Попробуйте открыть кабинет позже.</p>}{species==='dog'&&current.catalogueId&&<button className="text-link" onClick={()=>onShowLooks(current.catalogueId)}>Посмотреть образы <ArrowRight size={20}/></button>}</div></div>
  <details className="price-extras"><summary><span>Отдельные процедуры и доплаты<small>{species==='cat'?'Экспресс-линька, помощь сотрудника и детали ухода':'Когти, уши, работа с колтунами и другие процедуры'}</small></span><Plus size={27}/></summary><dl>{extras.map(item=><div className="price-extra-row" key={item.id}><dt>{item.name}{item.note&&<small>{item.note}</small>}</dt><dd>{priceText(item.price,item)}</dd></div>)}</dl><p>Состав ухода и дополнительные процедуры подбираем индивидуально.</p></details>
 </section>;
}
