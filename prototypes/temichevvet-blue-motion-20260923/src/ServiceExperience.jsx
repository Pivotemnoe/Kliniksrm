import { useState } from "react";
import { ArrowRight, ArrowUpRight, Copy, Phone, Stethoscope, Heart, PawPrint, Flask, Scan, Pill, ClipboardText } from "@phosphor-icons/react";
import { ArticleCatalog, useArticleCatalog } from "./ArticleServices.jsx";
import { displayPrice, filterCatalog, rub } from "./catalog.js";
import { serviceCatalogItems, selectedServiceItems } from "./service-catalog.js";
import { clinic, services } from "./content.js";
import { priceSelectionBooking } from "./price-selection.js";

const experiences = {
  consultation: {
    title: "От знакомства — к понятному плану.",
    stages: [
      ["Рассказать", "Что изменилось дома?", "Расскажите о привычках и самочувствии питомца. Прежние заключения и короткое видео необычного поведения могут помочь разговору.", "reception-real"],
      ["Осмотреть", "В центре — ваш питомец", "Врач проведёт осмотр и обсудит ваши наблюдения. Можно заранее записать вопросы, чтобы ничего не забыть.", null],
      ["Обсудить", "Что дальше и почему", "Уточните цель предложенных исследований, подготовку и дальнейшую связь с клиникой.", null],
    ], article: "checkup",
  },
  diagnostics: {
    title: "Два способа увидеть больше.",
    stages: [
      ["УЗИ", "Посмотреть на мягкие ткани", "Ультразвуковое исследование помогает врачу оценивать внутренние органы. Область исследования и подготовку уточняют по клинической задаче.", "ultrasound-real"],
      ["Рентген", "Оценить структуры на снимке", "Рентгенография и УЗИ не заменяют друг друга. Какие снимки и проекции нужны, решает врач; ниже можно посмотреть отдельные позиции прайса.", null],
      ["Результаты", "Соединить с осмотром", "Заключение обсуждают вместе с жалобами, осмотром и другими результатами. Возьмите прежние исследования для сравнения.", null],
    ], article: "movement",
  },
  laboratory: {
    title: "За каждой пробой — конкретный вопрос.",
    stages: [
      ["Выбор", "Что хотим узнать?", "Врач подбирает исследования с учётом осмотра и истории питомца. Не нужно самостоятельно выбирать все анализы из списка.", "laboratory-real"],
      ["Подготовка", "Согласовать до визита", "Уточните правила подготовки, способ забора и возможность принести материал. Не отменяйте препараты без согласования с врачом.", null],
      ["Обсуждение", "Цифры — часть картины", "Срок готовности и способ получения результатов уточните в клинике. Разбирать их важно с врачом, а не по одному отклонению.", null],
    ], article: "digestion",
  },
  surgery: {
    title: "Операция — не один момент.",
    stages: [
      ["До", "Подготовка и ваши вопросы", "Перед плановой операцией обсудите показания, подготовку, обследования, анестезию и предполагаемый объём расходов. Инструкции зависят от конкретного вмешательства.", null],
      ["В клинике", "Согласованный план помощи", "Уточните, что входит в стоимость выбранной позиции, а что оплачивается отдельно. Категория сложности и состояние питомца могут влиять на окончательный план.", null],
      ["После", "Восстановление продолжается", "До выписки обсудите уход, ограничения, назначения и дату контроля. Спросите, при каких изменениях нужно сразу связаться с клиникой.", null],
    ], article: "checkup",
  },
  inpatient: {
    title: "Когда забота нужна дольше.",
    stages: [
      ["Размещение", "Сначала уточним возможность", "Позвоните до приезда: нужно уточнить наличие места и подходящее отделение. На фото — неинфекционный стационар клиники.", "inpatient-noninfectious-real"],
      ["Наблюдение", "Договоримся о связи", "Обсудите план ухода, способ получения информации о состоянии и состав расходов. Препараты и процедуры могут учитываться отдельно.", null],
      ["Домой", "Продолжим заботу дома", "При выписке уточните назначения, контрольный визит и контакты для вопросов. Возьмите письменные рекомендации с собой.", null],
    ], article: "checkup",
  },
  pharmacy: {
    title: "Важно не только название.",
    stages: [
      ["Назначение", "Сверить точные данные", "Для уточнения препарата нужны название, дозировка и форма выпуска из назначения врача. Сохраните назначение, чтобы не перепутать детали.", null],
      ["Наличие", "Позвонить перед поездкой", "Наличие и цену препаратов уточняют отдельно: публичный каталог клинических услуг не показывает остатки аптеки.", null],
      ["Вопросы", "Замены — с лечащим врачом", "Не подбирайте аналог или новую дозировку по сайту. Если нужного препарата нет, согласуйте дальнейшие действия с врачом.", null],
    ], article: "checkup",
  },
};

const stagePhotos = {
  "reception-real": { alt: "Зона ресепшн клиники TemichevVET", caption: "Ресепшн клиники" },
  "ultrasound-real": { alt: "Кабинет ультразвуковой диагностики TemichevVET", caption: "Кабинет УЗИ" },
  "laboratory-real": { alt: "Оборудование лаборатории TemichevVET", caption: "Лаборатория клиники" },
  "inpatient-noninfectious-real": { alt: "Неинфекционный стационар TemichevVET", caption: "Неинфекционный стационар" },
};

const stageIcons = {
  consultation: Stethoscope,
  diagnostics: Scan,
  laboratory: Flask,
  surgery: Heart,
  inpatient: PawPrint,
  pharmacy: Pill,
};

function StageVisual({ service, stages, step, photo }) {
  if (photo) {
    const description = stagePhotos[photo];
    return <figure key={`${service.id}-${step}`} className="service-stage-photo">
      <img src={`/images/${photo}-1280.webp`} srcSet={`/images/${photo}-640.webp 640w, /images/${photo}-1280.webp 1280w`} sizes="(max-width: 760px) 100vw, 55vw" alt={description.alt} loading="lazy" />
      <figcaption>{description.caption}</figcaption>
    </figure>;
  }

  const Icon = stageIcons[service.id] || ClipboardText;
  return <div key={`${service.id}-${step}`} className={`service-stage-visual visual-${service.id}`} aria-hidden="true">
    <div className="service-stage-visual-top"><span>{service.title}</span><span>0{step + 1} / 03</span></div>
    <div className="service-stage-visual-body">
      <div className="service-stage-visual-emblem"><Icon size={86} weight="duotone" /></div>
      <div className="service-stage-visual-track">
        {stages.map(([label], index) => <div key={label} className={index === step ? "is-current" : ""}>
          <span>0{index + 1}</span><strong>{label}</strong>
        </div>)}
      </div>
    </div>
  </div>;
}

export function ServiceExperience({ service }) {
  const [step, setStep] = useState(0);
  const experience = experiences[service.id];
  if (!experience) return null;
  const [name, title, text, photo] = experience.stages[step];
  return <section className={`service-experience wrap experience-${service.id}`}>
    <div className="article-section-heading"><div><p className="eyebrow">Разберёмся вместе</p><h2>{experience.title}</h2></div><a className="text-link" href="#direction-prices">К стоимости<ArrowRight size={20} /></a></div>
    <div className="service-experience-layout">
      <div className="service-stage-nav" aria-label={`Этапы: ${service.title}`}>
        {experience.stages.map(([label, heading], i) => <button key={label} aria-pressed={step === i} onClick={() => setStep(i)}><span>0{i + 1}</span><strong>{label}</strong><small>{heading}</small><ArrowUpRight size={22} /></button>)}
      </div>
      <div className="service-stage-content" aria-live="polite">
        <StageVisual service={service} stages={experience.stages} step={step} photo={photo} />
        <div key={name} className="service-stage-copy"><p className="eyebrow">{name}</p><h3>{title}</h3><p>{text}</p><a className="text-link" href={`/journal/articles/${experience.article}`}>Подробнее в журнале<ArrowUpRight size={18} /></a></div>
      </div>
    </div>
  </section>;
}

export function ServiceDirectory({ active }) {
  return <nav className="service-directory wrap" aria-label="Наглядно об услугах">
    {services.map((service) => <a key={service.id} href={`/services/${service.id}`} aria-current={active === service.id ? "page" : undefined}>{service.title}<ArrowUpRight size={16} /></a>)}
  </nav>;
}

function DirectionPrices({ service }) {
  const { catalog, status, retry } = useArticleCatalog();
  const [query, setQuery] = useState(""), [selected, setSelected] = useState([]), [copied, setCopied] = useState("");
  const available = serviceCatalogItems(catalog?.items || [], service.id);
  const visible = filterCatalog(available, query, "");
  const picked = selectedServiceItems(available, selected);
  const selectionBooking = priceSelectionBooking(catalog && { ...catalog, items: available }, selected);
  const minimum = picked.reduce((sum, item) => sum + item.minimumPrice, 0);
  const maximum = picked.reduce((sum, item) => sum + item.maximumPrice, 0);
  const sumLabel = minimum !== maximum ? `${rub(minimum)} – ${rub(maximum)}` : `${picked.some((item) => item.priceType === "RANGE") ? "от " : ""}${rub(minimum)}`;
  const toggle = (id) => { setCopied(""); setSelected((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]); };
  async function copy() {
    try { await navigator.clipboard.writeText(`${service.title} — вопросы для клиники\n${picked.map((item) => `${item.title}: ${displayPrice(item)}`).join("\n")}\nЭто выбранные позиции, не назначение и не полная смета.\n${clinic.phone}`); setCopied("Список скопирован. Ничего не отправлено."); }
    catch { setCopied("Не удалось скопировать. Сохраните список снимком экрана."); }
  }
  return <section className="direction-prices wrap" id="direction-prices">
    <div className="article-section-heading"><div><p className="eyebrow">Прейскурант клиники</p><h2>{service.id === "pharmacy" ? "Уточним перед поездкой." : "Посмотреть. Выбрать. Обсудить."}</h2></div><p>{service.id === "pharmacy" ? "Наличие и стоимость препаратов — по телефону." : "Актуальные позиции этого направления. Отметьте интересующие услуги, чтобы обсудить их с врачом."}</p></div>
    {service.id === "pharmacy" ? <div className="pharmacy-contact"><Phone size={28} /><p>Каталог клинических услуг не содержит остатков аптеки. Позвоните и назовите препарат из назначения.</p><a className="button" href={clinic.tel}>{clinic.phone}</a></div> : <>
      <label className="field direction-search">Найти в этом направлении<input type="search" placeholder="Название услуги" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <p className="small muted" role="status">{status === "loading" ? "Загружаем актуальные цены…" : !catalog ? "Сейчас цены недоступны. Уточните стоимость по телефону." : `Найдено позиций: ${visible.length}`}</p>
      {status === "error" && <button className="button outline" onClick={retry}>Обновить цены</button>}
      <div className="direction-price-layout"><div className="direction-price-list">
        {!!picked.length && <a className="price-selection-jump" href="#direction-selected">Выбрано: {picked.length} · {sumLabel}<span>Посмотреть список ↓</span></a>}
        {visible.map((item) => <label className={`direction-price-row ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}>
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} aria-label={`Выбрать: ${item.title}`} />
          <span><small>{item.category}</small><strong>{item.title}</strong></span><b>{displayPrice(item)}</b>
        </label>)}
        {catalog && !visible.length && <p>Подходящих позиций не нашли. Попробуйте другое название или уточните услугу в клинике.</p>}
      </div><aside className="direction-selection" id="direction-selected" tabIndex={-1}><p className="eyebrow">Для разговора с врачом</p><h3>Ваш список</h3>
        {picked.length ? <><ul>{picked.map((item) => <li key={item.id}><span>{item.title}</span><button onClick={() => toggle(item.id)} aria-label={`Убрать: ${item.title}`}>Убрать</button></li>)}</ul><p>Сумма выбранных позиций<strong>{sumLabel}</strong></p><button className="text-link" onClick={copy}><Copy size={18} />Скопировать список</button></> : <p>Отметьте услуги слева. Это список для обсуждения, а не назначение лечения.</p>}
        <p className="small muted">Не полная смета. Подготовка, препараты, анестезия и дополнительные процедуры могут оплачиваться отдельно. Состав помощи согласуется с врачом.</p>
        {!!picked.length && selectionBooking && <button className="button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("clinic-booking", { detail: selectionBooking.message }))}>Оставить заявку по списку<ArrowRight size={18} /></button>}
        {!!picked.length && !selectionBooking && <p className="small" role="status">Для передачи в заявке сократите список или уточните его по телефону. Ничего из выбранного не отправлено.</p>}
        {!picked.length && <a className="button" href={`/visit?direction=${service.id}`}>Обсудить запись<ArrowRight size={18} /></a>}<p className="small" role="status">{copied}</p>
      </aside></div>
      <a className="text-link" href="/prices">Весь прейскурант<ArrowUpRight size={19} /></a>
    </>}
  </section>;
}
export function ServicePrices({ service }) {
  return <ArticleCatalog><DirectionPrices service={service} /></ArticleCatalog>;
}
