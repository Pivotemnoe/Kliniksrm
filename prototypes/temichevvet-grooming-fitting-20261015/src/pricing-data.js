// Final owner-approved prices. The 300 RUB increase is already applied in this shared catalog.
import catalog from '../../../apps/api/src/modules/grooming/price-catalog.json';
export const PRICE_INCREASE_RUB = catalog.pricePolicy.increaseRub;
export const DOG_PRICES = catalog.dogs;
export const CAT_PRICES = catalog.cats;
export const EXTRA_SERVICES = catalog.extras;

export const DOG_SERVICE_DETAILS = [
 {key:'dry',name:'Стрижка без мытья',description:'Для питомца, которого вы вымыли и расчесали дома.',includes:['Чистая шерсть без колтунов','Мытьё дома за день до визита или в день стрижки'],serviceId:'haircut'},
 {key:'hygiene',name:'Гигиенический уход',description:'Мытьё и аккуратные детали.',includes:['Мытьё и сушка феном','Чистка ушей','Окантовка морды, лап и ушей','Уход за зоной гигиены'],serviceId:'hygiene'},
 {key:'full',name:'Полный комплекс',description:'Мытьё, уход и согласованная форма.',includes:['Мытьё и сушка феном','Чистка ушей и подстригание когтей','Стрижка с учётом породы и ваших пожеланий','Тримминг для подходящих пород — по согласованию'],serviceId:'haircut'},
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
