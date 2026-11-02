// Final owner-approved prices. The 300 RUB increase is already applied in this shared catalog.
import catalog from '../../../apps/api/src/modules/grooming/price-catalog.json';
export const PRICE_INCREASE_RUB = catalog.pricePolicy.increaseRub;
export const DOG_PRICES = catalog.dogs;
export const CAT_PRICES = catalog.cats;
export const EXTRA_SERVICES = catalog.extras;
// Owner policy, 21 Oct: dry brushing remains; haircuts require washing.
const retiredHaircuts = new Set([
 ...catalog.dogs.filter(breed => !breed.coatCare).map(breed => `dog:${breed.id}:dry`),
 'cat:clean:dry', 'cat:matted:dry',
]);
const withoutWashingHaircut = /стрижк[а-яё]*[^.;]*без\s+(?:мыть[яё]|купания)/iu;
export const groomingServiceOffered = service => !retiredHaircuts.has(service.catalogKey)
 && ![service.title,service.catalogData?.serviceName].some(name=>withoutWashingHaircut.test(name||''));

export const DOG_SERVICE_DETAILS = [
 {key:'hygiene',name:'Гигиенический уход',description:'Аккуратный уход за мордой, лапами и зоной гигиены.',includes:['Чистка ушей','Окантовка морды, лап и ушей','Уход за зоной гигиены'],serviceId:'hygiene'},
 {key:'full',name:'Полный комплекс',description:'Мытьё, уход и согласованная форма.',includes:['Мытьё и сушка феном','Чистка ушей и подстригание когтей','Стрижка с учётом породы и ваших пожеланий','Тримминг для подходящих пород — по согласованию'],serviceId:'haircut'},
];

export const COAT_SERVICE_DETAILS = [
 {key:'dry',name:'Вычёсывание без мытья',description:'Уход за шерстью и подшёрстком.',includes:['Вычёсывание шерсти','Объём работы согласуем по состоянию подшёрстка'],serviceId:'coat'},
 ...DOG_SERVICE_DETAILS.map(service=>service.key==='full'?{...service,name:'Мытьё и уход за шерстью',description:'Полный уход с естественным силуэтом.',includes:['Мытьё и сушка феном','Вычёсывание шерсти','Чистка ушей и подстригание когтей','Детали ухода согласуем с вами']}:service),
];

const number = new Intl.NumberFormat('ru-RU');
export function priceText(price,{supplement=false,unit}={}) {
 if(!price) return 'Уточним перед записью';
 const prefix=supplement?'+ ':'';
 if(price.percent) return prefix+price.percent+'%';
 if(price.kind==='upTo') return 'до '+number.format(price.max)+' ₽';
 const value=price.min===price.max?number.format(price.min):number.format(price.min)+'–'+number.format(price.max);
 return prefix+value+' ₽'+(unit==='hour'?' / час':'');
}
