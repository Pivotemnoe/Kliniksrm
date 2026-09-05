import React, { useEffect } from 'react';
import { services, pageMeta } from './content.js';
import { Header, Footer, Intro, Button } from './components.jsx';
import { Home, About, Services, ServicePage, Team, Night, Contacts, PhotoPlan } from './pages.jsx';
import { Prices, Reviews, Visit } from './interactive-pages.jsx';
export function App({ initialPath }) {
  const path = (initialPath || (typeof window !== 'undefined' ? window.location.pathname : '/')).replace(/\/$/, '') || '/';
  const service = services.find(s => path === `/services/${s.slug}`);
  const meta = pageMeta[path];
  useEffect(() => { document.title = meta ? `${meta[0]} — TemichevVET` : 'Страница не найдена — TemichevVET'; }, [path]);
  const page = path === '/' ? <Home /> : path === '/about' ? <About /> : path === '/services' ? <Services /> : service ? <ServicePage service={service} /> : path === '/team' ? <Team /> : path === '/team/temichev' ? <Team doctor /> : path === '/prices' ? <Prices /> : path === '/reviews' ? <Reviews /> : path === '/contacts' ? <Contacts /> : path === '/visit' ? <Visit /> : path === '/night' ? <Night /> : path === '/photo-plan' ? <PhotoPlan /> : <Intro label="404" title="Страница не найдена"><p>Возможно, адрес изменился.</p><Button href="/">На главную</Button></Intro>;
  return <><Header path={path} /><main id="main" tabIndex="-1" className={path === '/night' ? 'night-page' : ''}>{page}</main><Footer /></>;
}
