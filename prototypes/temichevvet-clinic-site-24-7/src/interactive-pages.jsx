import React, { useEffect, useState } from 'react';
import { clinic } from './content.js';
import { Arrow, Button, Breadcrumb, Intro, RouteBlock, FAQ, ReviewsWidget } from './components.jsx';
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
  return <><Breadcrumb title="Цены" /><Intro label="ПРЕЙСКУРАНТ" title={<>Понятно,<br />сколько стоит.</>}><p>Найдите нужную услугу по названию или категории. Если указан диапазон, точную стоимость уточнят в клинике.</p></Intro><section className="price-section section"><div className="price-tools"><label>Найти услугу<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Например, УЗИ" /></label><label>Категория<select value={category} onChange={e => setCategory(e.target.value)}><option value="">Все услуги</option>{categories.map(c => <option key={c}>{c}</option>)}</select></label>{state === 'ready' && <button className="print-button" onClick={() => window.print()}>Распечатать</button>}</div><div aria-live="polite" aria-atomic="true" className="catalog-status">{state === 'loading' ? 'Загружаем прейскурант…' : state === 'ready' ? `Найдено услуг: ${visible.length}` : 'Цены временно недоступны.'}</div>
    {state === 'unavailable' && <div className="catalog-empty"><h2>Уточним стоимость<br />по телефону.</h2><p>Сейчас цены на сайте недоступны. Позвоните — мы поможем найти нужную услугу и уточнить стоимость.</p><div className="actions"><Button /><button className="text-link" onClick={() => { setState('loading'); setAttempt(x => x + 1); }}>Попробовать снова</button></div></div>}
    {state === 'ready' && <>{visible.length ? <div className="price-table"><div className="price-head"><span>Услуга</span><span>Стоимость</span></div>{visible.map(s => <div className="price-row" key={s.id}><div><span className="price-category">{s.category}</span><h2>{s.title}</h2></div><strong>{formatPrice(s)}</strong></div>)}</div> : <div className="catalog-empty"><h2>Услуга не нашлась.</h2><p>Попробуйте другое название или позвоните в клинику.</p><button className="text-link" onClick={() => { setQuery(''); setCategory(''); }}>Показать все услуги</button></div>}<p className="small updated">Цены обновлены {new Date(catalog.updatedAt).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', day: 'numeric', month: 'long', year: 'numeric' })}</p></>}
    <aside className="price-note"><h3>Что входит в стоимость?</h3><p>Здесь указаны отдельные услуги. Общий состав обследования и лечения обсуждается с врачом. Препараты, расходные материалы и стационар могут оплачиваться отдельно — уточните это до процедуры.</p></aside></section></>;
}
export function Reviews() {
  return <><Breadcrumb title="Отзывы" /><Intro label="ОТЗЫВЫ О КЛИНИКЕ" title={<>Что говорят<br />после визита.</>}><p>Истории владельцев питомцев и ответы клиники — из Яндекс Карт.</p></Intro><section className="section reviews-layout"><div className="review-context"><h2>Спасибо<br />за ваше доверие.</h2><p>Расскажите, как прошёл приём. Ваш отзыв поможет другим владельцам выбрать клинику, а нам — стать лучше.</p><Button href={clinic.reviews} target="_blank" rel="noopener noreferrer">Все отзывы на Яндекс Картах</Button><p className="small">На Яндекс Картах мы — «Айболит», {clinic.address}.</p></div><ReviewsWidget eager /></section></>;
}
const checklist = ['Ветеринарный паспорт, если он есть', 'Предыдущие заключения и результаты анализов', 'Список препаратов, которые получает питомец', 'Вопросы, которые хотите обсудить с врачом', 'Переноска или поводок для безопасной поездки'];
export function Visit() {
  const [checked, setChecked] = useState([]);
  const contactOnly = import.meta.env.VITE_SITE_PUBLIC_RELEASE === 'true' && !(import.meta.env.VITE_INQUIRIES_ENABLED === 'true' && /^https:\/\//.test(import.meta.env.VITE_SITE_PRIVACY_URL || ''));
  return <><Breadcrumb title="Плановый приём" /><Intro label="ПЕРЕД ВИЗИТОМ" title={<>Спокойно собраться.<br />Ничего не забыть.</>}><p>Позвоните, чтобы выбрать время и уточнить подготовку. Если нужен определённый врач или обследование, скажите об этом администратору.</p><div className="actions"><Button>Уточнить время приёма</Button><a href={contactOnly ? '#checklist' : '#request'} className="text-link">{contactOnly ? 'Что взять с собой' : 'Оставить заявку'} <Arrow /></a></div></Intro><InquiryForm /><section className="section two-columns warm" id="checklist"><div><span className="eyebrow">ВАШ СПИСОК ПЕРЕД ПОЕЗДКОЙ</span><h2>Что взять с собой</h2><p>Отмечайте то, что уже приготовили к поездке.</p></div><div className="checklist">{checklist.map((item, i) => <label key={item}><input type="checkbox" checked={checked.includes(i)} onChange={() => setChecked(prev => prev.includes(i) ? prev.filter(n => n !== i) : [...prev, i])} /><span>{item}</span></label>)}<p className="small" aria-live="polite">Готово: {checked.length} из {checklist.length}</p><button className="text-link" onClick={() => window.print()}>Распечатать список</button></div></section><section className="section two-columns"><h2>Нужна ли подготовка?</h2><div><p>Для приёма, анализов, УЗИ и операции требования могут различаться. Уточните их при записи. Индивидуальные назначения даёт врач.</p><FAQ entries={[[ 'Как подтвердить время приёма?', 'Время приёма согласует администратор по телефону.' ], ['Что делать, если планы изменились?', 'Позвоните в клинику, чтобы перенести или отменить визит.']]} /></div></section><RouteBlock /></>;
}
