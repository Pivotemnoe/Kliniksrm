// Transcribed from the owner's five photographs, 20 October 2026.
// Null means the source is blank, crossed out without a clear replacement,
// or ambiguous. These cells must not fall back to an old printed amount.
const rub = (min, max = min) => ({ min, max });
const upTo = max => ({ max, kind: 'upTo' });
const dog = (id, name, group, source, dry, hygiene, full, extra = {}) =>
 ({ id, name, group, source, dry, hygiene, full, ...extra });

export const DOG_PRICES = [
 dog('westie','Вест-хайленд-уайт-терьер','Жёсткая шерсть',3,null,null,rub(2200,3000),{catalogueId:'westie',duration:'около 3 часов'}),
 dog('griffon','Брюссельский гриффон','Жёсткая шерсть',3,null,null,null),
 dog('fox-terrier','Фокстерьер','Жёсткая шерсть',3,null,null,rub(2500,4000)),
 dog('airedale','Эрдельтерьер','Жёсткая шерсть',3,null,null,null,{catalogueId:'airedale',duration:'около 3 часов'}),
 dog('mini-schnauzer','Цвергшнауцер','Жёсткая шерсть',3,null,null,null,{catalogueId:'schnauzer'}),
 dog('mittel-schnauzer','Миттельшнауцер','Жёсткая шерсть',3,null,null,null,{catalogueId:'standard-schnauzer'}),
 dog('giant-schnauzer','Ризеншнауцер','Жёсткая шерсть',3,null,null,rub(4500,6000),{catalogueId:'giant-schnauzer'}),
 dog('scottie','Скотч-терьер','Жёсткая шерсть',3,rub(1300),rub(1200),rub(1900,2500),{catalogueId:'scottie'}),
 dog('afghan','Афганская борзая','Длинная шерсть',3,null,null,rub(4000,7000)),
 dog('york','Йоркширский терьер','Длинная шерсть',3,rub(1500),rub(1800),null,{catalogueId:'york',duration:'2–2,5 часа'}),
 dog('chinese-crested','Китайская хохлатая','Длинная шерсть',3,rub(1300,1500),rub(1100,1500),rub(1800,2200),{note:'Голая и пуховая разновидности — состав ухода обсудим отдельно.'}),
 dog('lhasa','Лхаса апсо','Длинная шерсть',3,rub(1100),rub(1000),null,{catalogueId:'lhasa',duration:'около 2 часов'}),
 dog('maltese','Мальтийская болонка','Длинная шерсть',3,rub(1500),rub(1200),rub(1800,2200),{catalogueId:'maltese'}),
 dog('pekingese','Пекинес','Длинная шерсть',3,rub(1500),rub(1300),rub(1800,2500),{catalogueId:'pekingese'}),
 dog('skye','Скайтерьер','Длинная шерсть',3,null,null,rub(1800,2500)),
 dog('bobtail','Бобтейл','Длинная шерсть',3,rub(3000),rub(2500),rub(6000,7000),{duration:'2–6 часов'}),
 dog('shihtzu','Ши-тцу','Длинная шерсть',3,rub(1500),rub(1300),rub(2200,2500),{catalogueId:'shih-tzu'}),
 dog('japanese-chin','Японский хин','Длинная шерсть',3,rub(1200),rub(1100),rub(1800,2200)),
 dog('maltipoo','Мальтипу','Длинная шерсть',3,null,null,null,{catalogueId:'maltipoo',note:'Стоимость зависит от размера питомца и состояния шерсти.'}),
 dog('sheltie','Шелти','Средняя длина шерсти',3,rub(2500),rub(2000),rub(2400,3300),{coatCare:true}),
 dog('english-setter','Английский сеттер','Средняя длина шерсти',3,rub(1800),rub(1600),rub(2400)),
 dog('bernese','Бернский зенненхунд','Средняя длина шерсти',3,rub(2800),rub(3000),rub(3400,5000),{catalogueId:'bernese',coatCare:true}),
 dog('border-collie','Бордер-колли','Средняя длина шерсти',3,rub(1800),rub(1600),rub(4000,5000),{catalogueId:'border-collie',coatCare:true}),
 dog('welsh-springer','Вельш-спрингер-спаниель','Средняя длина шерсти',3,rub(1500),rub(1300),rub(3000,4500)),
 dog('golden','Золотистый ретривер','Средняя длина шерсти',3,rub(1900),rub(1800),rub(4000,5500),{catalogueId:'golden-retriever',coatCare:true}),
 dog('irish-setter','Ирландский сеттер','Средняя длина шерсти',3,rub(1800),rub(2000),rub(2400,3000)),
 dog('cavalier','Кавалер-кинг-чарльз-спаниель','Средняя длина шерсти',3,null,null,rub(2200,2500)),
 dog('papillon','Папильон','Средняя длина шерсти',3,rub(1500),rub(1300),null,{catalogueId:'papillon'}),
 dog('borzoi','Русская псовая борзая','Средняя длина шерсти',3,rub(2000),rub(1800),rub(4000,5000)),
 dog('dachshund-long','Такса длинношёрстная','Средняя длина шерсти',3,rub(1200),rub(1100),rub(2000,2500)),
 dog('chihuahua','Чихуахуа','Средняя длина шерсти',3,rub(1100),rub(1200),rub(2000,2500)),
 dog('silky','Австралийский силки-терьер','Средняя длина шерсти',3,rub(1100),rub(1000),null),
 dog('poodle-toy','Пудель карликовый','Пудели',4,rub(1300),rub(1200),rub(1600,1800),{catalogueId:'poodle-mini',duration:'2,5–3,5 часа'}),
 dog('poodle-small','Пудель малый','Пудели',4,rub(1400),rub(1300),rub(1700,2000),{duration:'2,5–3,5 часа'}),
 dog('poodle-medium','Пудель средний','Пудели',4,rub(1600),rub(1400),rub(1900,2500),{duration:'2,5–3,5 часа'}),
 dog('poodle-royal','Пудель королевский','Пудели',4,rub(1800),rub(1600),rub(2500,3500),{catalogueId:'poodle-standard',duration:'2,5–3,5 часа'}),
 dog('russian-spaniel','Русский спаниель','Стрижка и тримминг',4,rub(1700),rub(1500),rub(3000,3500)),
 dog('cocker','Английский кокер-спаниель','Стрижка и тримминг',4,null,null,rub(2300,2800),{catalogueId:'cocker',duration:'2,5–3,5 часа'}),
 dog('american-cocker','Американский кокер-спаниель','Стрижка и тримминг',4,rub(1700),rub(1800),rub(2000,3500)),
 dog('english-springer','Английский спрингер-спаниель','Стрижка и тримминг',4,rub(1700),rub(1600),rub(2000)),
 dog('bedlington','Бедлингтон-терьер','Стрижка и тримминг',4,rub(2000),rub(1800),rub(2600),{catalogueId:'bedlington'}),
 dog('bichon','Бишон фризе','Стрижка и тримминг',4,rub(1700),rub(1300),rub(2000,2500),{catalogueId:'bichon',duration:'2–3,5 часа'}),
 dog('kerry-blue','Керри-блю-терьер','Стрижка и тримминг',4,rub(2000),rub(1800),rub(2600)),
 dog('black-terrier','Русский чёрный терьер','Стрижка и тримминг',4,rub(3000),rub(2500,3500),rub(3500,8500)),
 dog('malamute','Аляскинский маламут','Густая шерсть',4,rub(3000),null,rub(3500,6000),{catalogueId:'malamute',coatCare:true}),
 dog('collie','Длинношёрстный колли','Густая шерсть',4,null,null,rub(2500,3000),{catalogueId:'rough-collie',coatCare:true}),
 dog('german-shepherd','Немецкая овчарка','Густая шерсть',4,rub(2000),null,rub(3500,4500),{catalogueId:'german-shepherd',coatCare:true}),
 dog('newfoundland','Ньюфаундленд','Густая шерсть',4,rub(3200),rub(4000),rub(3800,6000),{catalogueId:'newfoundland',coatCare:true}),
 dog('german-spitz','Шпиц немецкий','Густая шерсть',4,rub(1500),rub(1300),rub(2000),{coatCare:true}),
 dog('pomeranian','Шпиц померанский','Густая шерсть',4,rub(1500),rub(1300),rub(1700,1900),{catalogueId:'pomeranian',coatCare:true}),
 dog('chow','Чау-чау','Густая шерсть',4,rub(3500),null,rub(6000),{catalogueId:'chow-chow',coatCare:true,note:'Стоимость зависит от состояния подшёрстка.'}),
 dog('samoyed','Самоед','Густая шерсть',4,rub(2800),null,null,{catalogueId:'samoyed',coatCare:true,note:'Стоимость зависит от состояния подшёрстка.'}),
 dog('saint','Сенбернар','Густая шерсть',4,rub(3600),null,upTo(5000),{catalogueId:'saint-bernard',coatCare:true,note:'Вычёсывание — без колтунов; комплекс зависит от состояния подшёрстка.'}),
 dog('husky','Сибирский хаски','Густая шерсть',4,rub(2500,4000),null,upTo(6000),{catalogueId:'husky',coatCare:true,note:'Стоимость зависит от состояния подшёрстка.'}),
 dog('tibetan-mastiff','Тибетский мастиф','Густая шерсть',4,null,null,rub(4000,6000),{coatCare:true,note:'Стоимость зависит от состояния подшёрстка.'}),
 dog('akita','Акита','Густая шерсть',4,null,null,rub(4500,6000),{coatCare:true}),
 dog('mixed-small','Метис до 5 кг','Метисы',4,rub(1700),rub(1300),rub(1700)),
 dog('mixed-medium','Метис 5–10 кг','Метисы',4,rub(1800),rub(1400),rub(1600,1800)),
 dog('mixed-large','Метис 10–20 кг','Метисы',4,rub(2000),rub(1500),rub(3000,3500)),
 dog('mixed-xl','Метис более 20 кг','Метисы',5,rub(2500,3500),null,null),
 dog('pug','Мопс','Гладкая шерсть',5,rub(1200,1500),null,rub(1700),{coatCare:true}),
 dog('toy-terrier','Той-терьер','Гладкая шерсть',5,null,null,rub(1400),{coatCare:true}),
 dog('french-bulldog','Французский бульдог','Гладкая шерсть',5,null,null,rub(1900,2500),{coatCare:true}),
 dog('labrador','Лабрадор-ретривер','Гладкая шерсть',5,null,null,rub(3000,4500),{catalogueId:'labrador',coatCare:true}),
 dog('kurzhaar','Курцхаар','Гладкая шерсть',5,null,null,rub(3000),{coatCare:true}),
];

export const DOG_SERVICE_DETAILS = [
 {key:'dry',name:'Стрижка без мытья',description:'Для питомца, которого вы вымыли и расчесали дома.',includes:['Чистая шерсть без колтунов','Мытьё дома за день до визита или в день стрижки'],serviceId:'haircut'},
 {key:'hygiene',name:'Гигиенический уход',description:'Мытьё и аккуратные детали.',includes:['Мытьё и сушка феном','Чистка ушей','Окантовка морды, лап и ушей','Уход за зоной гигиены'],serviceId:'hygiene'},
 {key:'full',name:'Полный комплекс',description:'Мытьё, уход и согласованная форма.',includes:['Мытьё и сушка феном','Чистка ушей и подстригание когтей','Стрижка с учётом породы и ваших пожеланий','Тримминг для подходящих пород — по согласованию'],serviceId:'haircut'},
];

export const CAT_PRICES = {
 clean: {dry:rub(1700,2500),wash:rub(2200,3000),deshedWash:null},
 matted: {dry:rub(2000,2300),wash:rub(1800,2500),deshedWash:rub(1700,2500)},
 deshed:rub(1000,2000),assistant:rub(500),duration:'1–2 часа',source:5,
};

export const EXTRA_SERVICES = [
 {id:'claws',name:'Подстригание когтей',price:rub(250),source:1},
 {id:'ear-clean',name:'Чистка ушей',price:rub(100),source:1},
 {id:'ear-cut',name:'Стрижка ушей',price:rub(100),source:1},
 {id:'muzzle',name:'Стрижка морды',price:rub(500),source:1},
 {id:'groin',name:'Стрижка паха',price:rub(100),source:1},
 {id:'tail',name:'Оформление области под хвостом',price:rub(200),source:1},
 {id:'mats',name:'Удаление колтунов',price:rub(1000),unit:'hour',source:1},
 {id:'undercoat',name:'Вычёсывание подшёрстка',price:rub(500),unit:'hour',source:1},
 {id:'poodle-feet',name:'Выстригание шерсти на лапах по типу пуделиных',price:rub(300),supplement:true,note:'К полному комплексу',source:1},
 {id:'show',name:'Подготовка к выставке',price:{percent:30},supplement:true,note:'От стоимости полного комплекса',source:1},
 {id:'behaviour',name:'Доплата за агрессивное поведение животного',price:rub(500,1500),supplement:true,note:'Без ассистента',source:1},
 {id:'parasite-wash',name:'Мытьё от паразитов',price:rub(300,500),supplement:true,note:'К полному комплексу',source:1},
 {id:'teeth',name:'Гигиена полости рта с использованием пасты',price:rub(300),source:2},
 {id:'glitter',name:'Блеск-тату',price:rub(200),source:2},
 {id:'ear-stones',name:'Стразы на уши',price:rub(150,300),source:2},
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
