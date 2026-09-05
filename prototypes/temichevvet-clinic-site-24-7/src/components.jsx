import React, { useEffect, useState } from 'react';
import { clinic, services } from './content.js';
export const Arrow = () => <span aria-hidden="true" className="arrow">↗</span>;
export function Button({ href = clinic.tel, children = 'Позвонить в клинику', light = false, ...props }) {
  return <a className={`button ${light ? 'lime' : ''}`} href={href} {...props}>{children}<Arrow /></a>;
}
export function Photo({ name, alt, portrait = false, priority = false, caption }) {
  return <figure className={portrait ? 'portrait' : ''}><img src={`/images/${name}-1280.webp`} srcSet={`/images/${name}-640.webp 640w, /images/${name}-1280.webp 1280w`} sizes="(max-width: 700px) 100vw, 55vw" alt={alt} width="1280" height={portrait ? '1600' : '850'} loading={priority ? 'eager' : 'lazy'} decoding="async" />{caption && <figcaption>{caption}</figcaption>}</figure>;
}
const navItems = [['/about', 'Клиника'], ['/services', 'Услуги'], ['/team', 'Врачи'], ['/prices', 'Цены'], ['/reviews', 'Отзывы'], ['/contacts', 'Контакты']];
export function Header({ path }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = event => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close);
  }, []);
  return <><a className="skip" href="#main">Перейти к содержанию</a><header className="header">
    <a href="/" className="brand" aria-label="TemichevVET — главная">Temichev<b>VET</b></a>
    <button className="menu" aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen(!open)}>{open ? 'Закрыть' : 'Меню'}</button>
    <nav id="main-menu" aria-label="Главное меню" className={open ? 'expanded' : ''}>{navItems.map(([href, title]) => <a key={href} href={href} aria-current={path === href ? 'page' : undefined}>{title}</a>)}</nav>
    <a className="header-phone" href={clinic.tel}>{clinic.phone}</a>
  </header></>;
}
export function Footer() {
  return <><footer><div><span className="eyebrow">TEMICHEVVET · АРМАВИР</span><h2>Мы здесь.<br />Днём и ночью.</h2><a className="footer-phone" href={clinic.tel}>{clinic.phone}</a><p>Ночью перед приездом позвоните.</p></div><div className="footer-right"><p>{clinic.address}<br />Круглосуточно</p><a href="/visit">Плановый приём <Arrow /></a><a href={clinic.route} target="_blank" rel="noopener noreferrer">Построить маршрут <Arrow /></a><a href="/night">Ночной приём <Arrow /></a></div><div className="footer-base"><span>TemichevVET · Ветеринарная клиника</span><a href="/contacts">Контакты</a><a href="/prices">Прейскурант</a><a href={clinic.reviews} target="_blank" rel="noopener noreferrer">Яндекс Карты</a></div></footer><nav className="mobile-actions" aria-label="Быстрые действия"><a href={clinic.tel}>Позвонить</a><a href="/visit">На приём</a><a href={clinic.route} target="_blank" rel="noopener noreferrer">Маршрут</a></nav></>;
}
export function Breadcrumb({ title, parent }) {
  return <nav className="breadcrumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><span>/</span>{parent && <><a href={parent[0]}>{parent[1]}</a><span>/</span></>}<span aria-current="page">{title}</span></nav>;
}
export function Intro({ label, title, children }) {
  return <section className="page-intro"><span className="eyebrow">{label}</span><h1>{title}</h1>{children && <div className="intro-copy">{children}</div>}</section>;
}
export function ServiceList() {
  return <div className="service-list">{services.map((s, i) => <a key={s.slug} href={`/services/${s.slug}`}><span className="index">0{i + 1}</span>{s.title}<Arrow /></a>)}</div>;
}
export function RouteBlock({ detailed = false }) {
  return <section className="route-section"><Photo name="facade-real" alt="Фасад клиники по адресу Каспарова, 27/2" priority caption={detailed ? 'Вход в клинику — справа на фотографии. На фасаде вывеска «Айболит».' : undefined} /><div><span className="eyebrow">КАК НАС НАЙТИ</span><h2>Вы уже знаете,<br />куда ехать.</h2><p>{clinic.address}</p><Button href={clinic.route} target="_blank" rel="noopener noreferrer">Построить маршрут</Button>{detailed && <><p className="spaced">Работаем круглосуточно.<br />Ночью перед приездом позвоните.</p><a className="route-phone" href={clinic.tel}>{clinic.phone}</a></>}</div></section>;
}
export function NightBlock() {
  return <section className="night-section"><div><span className="eyebrow">ЕСЛИ НУЖНА ПОМОЩЬ НОЧЬЮ</span><h2>Сначала позвоните.<br />Затем приезжайте.</h2></div><div><p>С 20:00 до 09:00 перед приездом свяжитесь с клиникой. Расскажите, что произошло и как чувствует себя питомец.</p><div className="actions"><Button /><a className="text-link" href="/night">О ночном приёме <Arrow /></a></div></div></section>;
}
export function FAQ({ entries }) { return <div className="faq">{entries.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div>; }
