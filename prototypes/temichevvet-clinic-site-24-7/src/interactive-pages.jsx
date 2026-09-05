import React, { useEffect, useState } from 'react';
import { clinic } from './content.js';
import { Arrow, Button, Breadcrumb, Intro, RouteBlock, FAQ } from './components.jsx';
import { validatePublicCatalog, formatPrice } from './catalog.js';
import { InquiryForm } from './InquiryForm.jsx';

export function Prices() {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('');
  const [catalog, setCatalog] = useState(null); const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { setQuery(new URLSearchParams(window.location.search).get('q') || ''); }, []);
  useEffect(() => {
    let disposed = false; let active;
    async function refresh() {
      active?.abort(); const controller = new AbortController(); active = controller;
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        const base = (import.meta.env.VITE_PUBLIC_GATEWAY_URL || '').replace(/\/$/, '');
        const response = await fetch(`${base}/v1/public/clinic/catalog`, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error('Unavailable');
        const next = validatePublicCatalog(await response.json());
        if (!disposed && active === controller) { setCatalog(next); setState(next ? 'ready' : 'unavailable'); }
      } catch { if (!disposed && active === controller) { setCatalog(null); setState('unavailable'); } }
      finally { clearTimeout(timer); }
    }
    void refresh(); const interval = setInterval(refresh, 60000);
    return () => { disposed = true; clearInterval(interval); active?.abort(); };
  }, [attempt]);
  const categories = [...new Set(catalog?.items.map(s => s.category) || [])].sort((a, b) => a.localeCompare(b, 'ru'));
  const normalized = value => value.toLocaleLowerCase('ru').replaceAll('ё', 'е');
  const visible = catalog?.items.filter(s => (!category || s.category === category) && normalized(`${s.title} ${s.category}`).includes(normalized(query))) || [];
  return <><Breadcrumb title="Цены" /><Intro label="ПРЕЙСКУРАНТ" title={<>Понятно,<br />сколько стоит.</>}><p>Найдите нужную услугу по названию или категории. Если указан диапазон, точную стоимость уточнят в клинике.</p></Intro><section className="price-section section"><div className="price-tools"><label>Найти услугу<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Например, УЗИ" /></label><label>Категория<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Все услуги</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>{state === 'ready' && <button className="print-button" onClick={() => window.print()}>Распечатать</button>}</div><div aria-live="polite" aria-atomic="true" className="catalog-status">{state === 'loading' ? 'Загружаем прейскурант…' : state === 'ready' ? `Найдено услуг: ${visible.length}` : 'Не удалось получить актуальный прейскурант.'}</div>
    {state === 'unavailable' && <div className="catalog-empty"><h2>Уточним стоимость<br />по телефону.</h2><p>Сейчас цены на сайте недоступны. Позвоните — мы поможем найти нужную услугу и уточнить стоимость.</p><div className="actions"><Button /><button className="text-link" onClick={() => { setState('loading'); setAttempt(x => x + 1); }}>Попробовать снова</button></div></div>}
    {state === 'ready' && <>{visible.length ? <div className="price-table"><div className="price-head"><span>Услуга</span><span>Стоимость</span></div>{visible.map(s => <div className="price-row" key={s.id}><div><span className="price-category">{s.category}</span><h2>{s.title}</h2></div><strong>{formatPrice(s)}</strong></div>)}</div> : <div className="catalog-empty"><h2>Услуга не нашлась.</h2><p>Попробуйте другое название или позвоните в клинику.</p><button className="text-link" onClick={() => { setQuery(''); setCategory(''); }}>Сбросить поиск и категорию</button></div>}<p className="small updated">Данные проверены {new Date(catalog.updatedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })} (МСК).</p></>}
    <aside className="price-note"><h3>Что входит в стоимость?</h3><p>Здесь указаны отдельные услуги. Общий состав обследования и лечения обсуждается с врачом. Препараты, расходные материалы и стационар могут оплачиваться отдельно — уточните это до процедуры.</p></aside></section></>;
}
export function Reviews() {
  const [show, setShow] = useState(false);
  return <><Breadcrumb title="Отзывы" /><Intro label="ЯНДЕКС КАРТЫ" title={<>После визита<br />остаётся история.</>}><p>Посмотрите, что рассказывают владельцы питомцев о клинике. Отзывы и оценки показываются из Яндекс Карт.</p></Intro><section className="section reviews-layout"><div className="review-context"><span className="eyebrow">ОТЗЫВЫ ИЗ ИСТОЧНИКА</span><h2>Опыт тех,<br />кто уже был у нас.</h2><p>В Яндекс Картах клиника отмечена как «Айболит». Адрес тот же: {clinic.address}.</p><Button href={clinic.reviews} target="_blank" rel="noopener noreferrer">Все отзывы на Картах</Button><p className="small">Можно прочитать отзывы, посмотреть ответы клиники или рассказать о своём визите.</p></div><div className="review-widget">{show ? <><iframe src={clinic.widget} title="Отзывы о клинике на Яндекс Картах" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /><p className="small">Если блок не открылся, <a href={clinic.reviews} target="_blank" rel="noopener noreferrer">перейдите к отзывам на Яндекс Картах</a>.</p></> : <div className="review-permission"><span className="eyebrow">ЯНДЕКС КАРТЫ</span><h3>Показать отзывы<br />прямо здесь?</h3><p>При загрузке блока браузер подключится к Яндексу. Можно также открыть отзывы по ссылке.</p><button className="button" onClick={() => setShow(true)}>Загрузить отзывы <Arrow /></button></div>}</div></section></>;
}
const checklist = ['Ветеринарный паспорт, если он есть', 'Предыдущие заключения и результаты анализов', 'Список препаратов, которые получает питомец', 'Вопросы, которые хотите обсудить с врачом', 'Переноска или поводок для безопасной поездки'];
export function Visit() {
  const [checked, setChecked] = useState([]);
  const contactOnly = import.meta.env.VITE_SITE_PUBLIC_RELEASE === 'true' && !(import.meta.env.VITE_INQUIRIES_ENABLED === 'true' && /^https:\/\//.test(import.meta.env.VITE_SITE_PRIVACY_URL || ''));
  return <><Breadcrumb title="Плановый приём" /><Intro label="ПЕРЕД ВИЗИТОМ" title={<>Спокойно собраться.<br />Ничего не забыть.</>}><p>Позвоните, чтобы выбрать время и уточнить подготовку. Если нужен определённый врач или обследование, скажите об этом администратору.</p><div className="actions"><Button>Уточнить время приёма</Button><a href={contactOnly ? '#checklist' : '#request'} className="text-link">{contactOnly ? 'Что взять с собой' : 'Оставить заявку'} <Arrow /></a></div></Intro><InquiryForm /><section className="section two-columns warm" id="checklist"><div><span className="eyebrow">ВАШ СПИСОК ПЕРЕД ПОЕЗДКОЙ</span><h2>Что взять с собой</h2><p>Отметки остаются только на открытой странице.</p></div><div className="checklist">{checklist.map((item, i) => <label key={item}><input type="checkbox" checked={checked.includes(i)} onChange={() => setChecked(prev => prev.includes(i) ? prev.filter(n => n !== i) : [...prev, i])} /><span>{item}</span></label>)}<p className="small" aria-live="polite">Готово: {checked.length} из {checklist.length}</p><button className="text-link" onClick={() => window.print()}>Распечатать список</button></div></section><section className="section two-columns"><h2>Нужна ли подготовка?</h2><div><p>Для приёма, анализов, УЗИ и операции требования могут различаться. Уточните их при записи. Индивидуальные назначения даёт врач.</p><FAQ entries={[[ 'Как подтвердить время приёма?', 'Время согласует администратор по телефону. Отметки в чек-листе сами по себе не создают запись.' ], ['Что делать, если планы изменились?', 'Позвоните в клинику, чтобы перенести или отменить визит.']]} /></div></section><RouteBlock /></>;
}
