export const articles = {
  digestion: {
    title: "От миски до энергии",
    kicker: "Пищеварение · интерактивная история",
    short:
      "Что происходит после обеда — и какие изменения стоит обсудить с врачом.",
    lead: "Для вас обед заканчивается, когда миска пуста. Для организма питомца всё только начинается.",
    image: "digestive-dog",
    time: "5 минут",
    cta: "Проверить пищеварение",
    visitLabel: "Приём по вопросам пищеварения",
    visitMessage:
      "Хочу записать питомца на приём, чтобы обсудить его пищеварение.",
    serviceKeys: ["consultation", "ultrasound", "stool"],
    checklist: [
      "Когда изменились аппетит или стул",
      "Чем питомец питается, включая лакомства",
      "Были ли рвота и изменения самочувствия",
      "Какие препараты и добавки он получает",
    ],
    sources: [
      [
        "Colorado State University: строение и длина тонкой кишки",
        "https://vivo.colostate.edu/hbooks/pathphys/digestion/smallgut/anatomy.html",
      ],
      [
        "MSD / Merck: пищеварение и обследование собаки",
        "https://www.merckvetmanual.com/dog-owners/digestive-disorders-of-dogs/introduction-to-digestive-disorders-of-dogs",
      ],
      [
        "MSD / Merck: пищеварительная система животных",
        "https://www.merckvetmanual.com/digestive-system/digestive-system-introduction/the-digestive-system-in-animals",
      ],
      [
        "MSD / Merck: усвоение питательных веществ",
        "https://www.merckvetmanual.com/management-and-nutrition/nutrition-small-animals/nutritional-requirements-of-small-animals",
      ],
      [
        "Cornell: признаки неотложного состояния",
        "https://www.vet.cornell.edu/hospitals/services/emergency-and-critical-care-0",
      ],
    ],
  },
  movement: {
    title: "За каждым прыжком — целая система",
    kicker: "Движение · интерактивная история",
    short:
      "Кости, мышцы, суставы: заглянем под шерсть и научимся замечать перемены.",
    lead: "Потянуться после сна. Подойти к вам. Забраться на любимый диван. За привычными движениями работает целая команда.",
    image: "anatomy-dog-muscles-v2",
    time: "5 минут",
    cta: "Обсудить движение с врачом",
    visitLabel: "Приём по вопросам движения",
    visitMessage:
      "Хочу записать питомца на осмотр и обсудить изменения в его движении.",
    serviceKeys: ["consultation", "radiography"],
    checklist: [
      "Когда и после чего изменилось движение",
      "Какие привычные действия стали сложнее",
      "Короткое видео обычной ходьбы, если оно уже есть",
      "Прежние снимки, заключения и список препаратов",
    ],
    sources: [
      [
        "MSD / Merck: опорно-двигательная система животных",
        "https://www.merckvetmanual.com/musculoskeletal-system/musculoskeletal-system-introduction/overview-of-the-musculoskeletal-system-in-animals",
      ],
      [
        "AAHA: оценка хронической боли у собак",
        "https://www.aaha.org/resources/2022-aaha-pain-management-guidelines-for-dogs-and-cats/chronic-pain-assessment-in-dogs/",
      ],
      [
        "AAHA: наблюдение за движением кошек",
        "https://www.aaha.org/resources/2022-aaha-pain-management-guidelines-for-dogs-and-cats/chronic-pain-assessment-in-cats/",
      ],
      [
        "Cornell: признаки неотложного состояния",
        "https://www.vet.cornell.edu/hospitals/services/emergency-and-critical-care-0",
      ],
    ],
  },
};

Object.assign(articles, {
  teeth: {
    title: "Больше, чем белая улыбка",
    kicker: "Здоровье зубов · интерактивная история",
    short: "Из чего устроен зуб и почему красивой коронки недостаточно, чтобы оценить его здоровье.",
    lead: "Снаружи — твёрдая оболочка. Внутри — живая ткань. Давайте посмотрим, что скрывает один зуб и о чём рассказать врачу.",
    image: "tooth-cutaway", imageAlt: "Условная иллюстрация клыка собаки в разрезе",
    time: "4 минуты", cta: "Записаться на осмотр зубов", ending: "Позаботимся о зубах питомца?",
    visitLabel: "Осмотр зубов и полости рта", visitMessage: "Хочу записать питомца на осмотр зубов и полости рта.",
    serviceKeys: ["consultation", "dentistry"],
    checklist: ["Что изменилось во время еды или игры", "Когда появился необычный запах из пасти", "Были ли стоматологические процедуры раньше", "Какие средства ухода и препараты используются"],
    sources: [
      ["MSD / Merck: строение зубов животных", "https://www.merckvetmanual.com/digestive-system/dental-development-and-anatomy/dentition-and-dental-nomenclature-of-animals"],
      ["AAHA: осмотр, профессиональная помощь и домашний уход", "https://www.aaha.org/resources/your-pets-dental-care/"],
      ["AAHA: регулярный контроль здоровья полости рта", "https://www.aaha.org/resources/2019-aaha-dental-care-guidelines-for-dogs-and-cats/regular-oral-healthcare/"],
    ],
  },
  skin: {
    title: "Под шерстью — целый мир",
    kicker: "Кожа и шерсть · интерактивная история",
    short: "Знакомимся с защитным барьером организма и разбираемся, почему зуд — это повод для осмотра.",
    lead: "Мягкая шерсть — только то, что мы видим. Под ней работает сложная система защиты, ощущений и обновления.",
    image: "skin-layers", imageAlt: "Упрощённая модель слоёв кожи и волосяного фолликула",
    time: "4 минуты", cta: "Обсудить состояние кожи", ending: "Кожа или шерсть изменились?",
    visitLabel: "Приём по вопросам кожи и шерсти", visitMessage: "Хочу записать питомца на приём и обсудить состояние кожи и шерсти.",
    serviceKeys: ["consultation"],
    checklist: ["Когда появились зуд или изменения шерсти", "Какие участки питомец чешет или вылизывает", "Названия и даты последних обработок", "Фотографии изменений и список средств ухода"],
    sources: [
      ["MSD / Merck: строение кожи собаки", "https://www.merckvetmanual.com/dog-owners/skin-disorders-of-dogs/structure-of-the-skin-in-dogs"],
      ["MSD / Merck: кожа и её придатки у животных", "https://www.merckvetmanual.com/integumentary-system/integumentary-system-introduction/the-integumentary-system-in-animals"],
      ["MSD / Merck: зуд — признак, а не диагноз", "https://www.merckvetmanual.com/dog-owners/skin-disorders-of-dogs/itching-pruritus-in-dogs"],
    ],
  },
  checkup: {
    title: "Здоровье в деталях",
    kicker: "Профилактика · интерактивная история",
    short: "Как обычные наблюдения дома помогают сделать плановый визит к врачу полезнее.",
    lead: "Вроде всё хорошо — и это отличный повод поговорить о профилактике. Не о списке всех анализов, а о том, что важно вашему питомцу.",
    image: "anatomy-dog-exterior", imageAlt: "Иллюстрация собаки перед профилактическим осмотром",
    time: "4 минуты", cta: "Запланировать осмотр", ending: "Составим план заботы вместе?",
    visitLabel: "Профилактический осмотр", visitMessage: "Хочу записать питомца на профилактический осмотр и обсудить индивидуальный план заботы.",
    serviceKeys: ["consultation", "laboratory"],
    checklist: ["Ветеринарный паспорт и прежние заключения", "Привычный рацион и изменения веса", "Даты прививок и обработок от паразитов", "Вопросы о поведении, активности и уходе"],
    sources: [
      ["AAHA: зачем нужны регулярные осмотры", "https://www.aaha.org/resources/why-are-regular-veterinary-visits-important/"],
      ["AAHA / AVMA: принципы профилактической помощи", "https://www.aaha.org/resources/preventive-healthcare-for-pets/"],
      ["AAHA: что обсуждают на плановом визите", "https://www.aaha.org/resources/essential-care-why-wellness-visits-matter-for-pets/"],
    ],
  },
});

// The clinic owner approved these four additional interactive articles for
// publication on 2026-10-17. The new pet illustrations remain educational.
export const newArticles = {
  heart: {
    diagram: "heart",
    title: "Сердце: маршрут каждого удара",
    kicker: "Сердце и сосуды · интерактивная история",
    short: "Приблизьте и раскройте модель сердца собаки: камеры, клапаны и поводы обратиться к врачу.",
    lead: "Сердце работает тихо и постоянно. Посмотрим, где оно находится, приблизим его и разберём работу частей — без пугающих изображений.",
    time: "5 минут",
    cta: "Обсудить здоровье сердца",
    ending: "Появились вопросы о сердце питомца?",
    visitLabel: "Приём по вопросам сердца и сосудов",
    visitMessage: "Хочу записать питомца на осмотр и обсудить вопросы о сердце и сосудах.",
    serviceKeys: ["consultation"],
    checklist: ["Когда появились изменения в активности или дыхании", "Были ли эпизоды слабости или обморока", "Прежние заключения, снимки и назначения", "Список принимаемых препаратов и их дозировок"],
    urgent: "Затруднённое дыхание, обморок или выраженная слабость требуют срочного обращения за ветеринарной помощью.",
    sources: [
      ["MSD / Merck: сердечно-сосудистая система животных", "https://www.merckvetmanual.com/circulatory-system/cardiovascular-system-introduction/the-cardiovascular-system-in-animals"],
      ["MSD / Merck: сердце собаки изнутри и расположение клапанов", "https://www.merckvetmanual.com/dog-owners/heart-and-blood-vessel-disorders-of-dogs/introduction-to-heart-and-blood-vessel-disorders-in-dogs"],
      ["MSD / Merck: как обследуют сердце животных", "https://www.merckvetmanual.com/circulatory-system/diagnosis-of-heart-disease/diagnosis-of-heart-disease-in-animals"],
    ],
  },
  breathing: {
    diagram: "breathing",
    title: "Как воздух становится дыханием",
    kicker: "Дыхание · интерактивная история",
    short: "Раскройте модель лёгких собаки и проследите путь воздуха от трахеи до альвеол.",
    lead: "Вдох кажется одним движением. На самом деле воздух проходит несколько участков, а в лёгких происходит обмен газов. Посмотрим на путь по частям.",
    time: "5 минут",
    cta: "Обсудить дыхание питомца",
    ending: "Дыхание питомца изменилось?",
    visitLabel: "Приём по вопросам дыхания",
    visitMessage: "Хочу записать питомца на осмотр и обсудить изменения дыхания.",
    serviceKeys: ["consultation", "radiography"],
    checklist: ["Когда дыхание стало другим", "Есть ли кашель, необычные звуки или утомляемость", "Короткое видео дыхания в покое, если оно уже есть", "Прежние заключения и список препаратов"],
    urgent: "Если питомцу трудно дышать, он дышит с заметным усилием или синеют слизистые, обращайтесь за неотложной ветеринарной помощью.",
    sources: [
      ["MSD / Merck: дыхательная система животных", "https://www.merckvetmanual.com/respiratory-system/respiratory-system-introduction/the-respiratory-system-in-animals"],
      ["MSD / Merck: дыхательные пути и лёгкие собаки", "https://www.msdvetmanual.com/dog-owners/lung-and-airway-disorders-of-dogs/introduction-to-lung-and-airway-disorders-of-dogs"],
      ["Cornell: как распознать дыхательное расстройство у собаки", "https://www.vet.cornell.edu/departments-centers-and-institutes/riney-canine-health-center/canine-health-topics/recognizing-and-responding-canine-respiratory-distress"],
    ],
  },
  urinary: {
    diagram: "urinary",
    title: "От почек до лотка",
    kicker: "Мочевыделительная система · интерактивная история",
    short: "Раскройте модель почек и мочевого пузыря кошки, изучите путь мочи и подготовьтесь к визиту.",
    lead: "Сколько пьёт питомец? Как часто ходит в лоток или на прогулку? Эти привычки помогают врачу понять перемены. Сначала разберём сам путь.",
    time: "5 минут",
    cta: "Обсудить мочеиспускание",
    ending: "Привычки питомца изменились?",
    visitLabel: "Приём по вопросам мочевыделительной системы",
    visitMessage: "Хочу записать питомца на осмотр и обсудить изменения питья или мочеиспускания.",
    serviceKeys: ["consultation", "laboratory", "ultrasound"],
    checklist: ["Как изменились питьё и мочеиспускание", "Когда появились частые позывы или дискомфорт", "Прежние анализы и заключения", "Названия препаратов и рацион питомца"],
    urgent: "Частые безрезультатные попытки помочиться, особенно у кота, — повод немедленно обратиться за ветеринарной помощью.",
    sources: [
      ["MSD / Merck: мочевыделительная система кошек", "https://www.merckvetmanual.com/cat-owners/kidney-and-urinary-tract-disorders-of-cats/the-urinary-system-of-cats"],
      ["MSD / Merck: мочевыделительная система животных", "https://www.merckvetmanual.com/urinary-system/urinary-system-introduction/the-urinary-system-in-animals"],
    ],
  },
  ear: {
    diagram: "ear",
    title: "Ухо: больше, чем слух",
    kicker: "Уши и равновесие · интерактивная история",
    short: "Раскройте модель уха кошки от наружного прохода до внутренних отделов и узнайте, что рассказать врачу.",
    lead: "Ухо — не только видимая ушная раковина. Внутри есть отделы, которые помогают слышать и сохранять равновесие. Приблизим их, чтобы увидеть путь звука.",
    time: "5 минут",
    cta: "Показать уши врачу",
    ending: "Что-то изменилось с ушами?",
    visitLabel: "Осмотр ушей",
    visitMessage: "Хочу записать питомца на осмотр ушей и обсудить замеченные изменения.",
    serviceKeys: ["consultation"],
    checklist: ["Когда появились зуд, запах или выделения", "Трясёт ли питомец головой, наклоняет ли её", "Какие средства и препараты уже использовали", "Были ли проблемы с ушами раньше"],
    urgent: "Выраженное нарушение равновесия, сильная боль или внезапное ухудшение состояния требуют срочной оценки ветеринарного врача.",
    sources: [
      ["MSD / Merck: строение и функции уха кошки", "https://www.merckvetmanual.com/cat-owners/ear-disorders-of-cats/ear-structure-and-function-in-cats"],
      ["MSD / Merck: заболевания среднего и внутреннего уха", "https://www.merckvetmanual.com/ear-disorders/otitis-media-and-interna/otitis-media-and-interna-in-animals"],
    ],
  },
};
Object.assign(articles, newArticles);

// Exact public IDs, not a cheapest-result search or a copy of CRM prices.
// Ambiguous X-ray variants intentionally do not receive a guessed price.
export const articleServices = {
  dentistry: {
    title: "Стоматологическая помощь", path: "/services/dentistry", query: "зуб",
    description: "Начнём с осмотра полости рта. Объём помощи и подготовку к процедурам врач обсудит с вами индивидуально.",
    action: "Обсудить помощь зубам", purpose: "consultation", priceNote: "Стоимость зависит от согласованного объёма помощи.",
    visitMessage: "Хочу уточнить запись на осмотр зубов и полости рта. Подскажите, как подготовиться к визиту.",
  },
  laboratory: {
    title: "Лабораторные исследования", path: "/services/laboratory", query: "исследование",
    description: "Анализы выбирают по результатам осмотра, возрасту и истории питомца. Единого обязательного набора для всех нет.",
    action: "Обсудить обследование", purpose: "diagnostics",
  },
  consultation: {
    title: "Приём врача",
    path: "/services/consultation",
    query: "Первичный прием врача",
    id: "bb02ba91-9e66-49dc-be4d-7e06112e1ec3",
    titlePattern: /^Первичный при[её]м врача$/i,
    description:
      "Начнём с разговора и осмотра. Врач поможет определить, какие следующие шаги нужны именно вашему питомцу.",
    action: "Записаться на приём",
    purpose: "consultation",
  },
  ultrasound: {
    title: "УЗИ брюшной полости",
    path: "/services/diagnostics",
    query: "Ультразвуковое исследование органов брюшной полости",
    id: "7b7ae73c-7236-48d7-aeba-1ef07fd6689d",
    titlePattern: /^Ультразвуковое исследование органов брюшной полости$/i,
    description:
      "Если врач рекомендует УЗИ, уточните запись и подготовку. Исследование дополняет осмотр, а не заменяет его.",
    action: "Уточнить запись на УЗИ",
    purpose: "diagnostics",
  },
  stool: {
    title: "Исследование кала",
    path: "/services/laboratory",
    query: "Копрологическое исследование",
    id: "87694bd7-3ef6-4f07-81fa-fe260205e940",
    titlePattern: /^Копрологическое исследование$/i,
    description:
      "Копрологическое исследование — одна из возможных частей обследования. Нужен ли образец и как его собрать, уточните у врача.",
    action: "Обсудить исследование",
    purpose: "diagnostics",
  },
  radiography: {
    title: "Рентгенография",
    path: "/services/diagnostics",
    query: "рентген",
    description:
      "По показаниям после осмотра. Область исследования и количество проекций определяет врач; от этого зависит стоимость.",
    action: "Уточнить обследование",
    purpose: "diagnostics",
  },
};
export const articlePath = (topic) => `/journal/articles/${topic}`;
export const isArticleVisible = (article) => Boolean(article);
export function articleVisitHref(topic, service = "consultation") {
  if (
    !Object.hasOwn(articles, topic) ||
    !isArticleVisible(articles[topic]) ||
    !articles[topic].serviceKeys.includes(service)
  )
    return "/visit";
  return `/visit?topic=${topic}&service=${service}`;
}
export function getArticleVisitContext(search = "") {
  const params = new URLSearchParams(search);
  const topic = params.get("topic"),
    key = params.get("service") || "consultation";
  if (
    !Object.hasOwn(articles, topic) ||
    !isArticleVisible(articles[topic]) ||
    !articles[topic].serviceKeys.includes(key)
  )
    return null;
  const article = articles[topic],
    service = articleServices[key];
  return {
    topic,
    key,
    title: article.visitLabel,
    articleTitle: article.title,
    purpose: service.purpose,
    serviceTitle: service.title,
    message:
      key === "consultation"
        ? article.visitMessage
        : service.visitMessage || `Хочу уточнить запись на обследование «${service.title}». Подскажите, нужно ли сначала прийти на осмотр и как подготовиться.`,
    checklist: article.checklist,
  };
}
export function serviceFromCatalog(items, key) {
  const service = articleServices[key];
  if (!service?.id) return null;
  return (
    items.find(
      (item) => item.id === service.id && service.titlePattern.test(item.title),
    ) || null
  );
}
