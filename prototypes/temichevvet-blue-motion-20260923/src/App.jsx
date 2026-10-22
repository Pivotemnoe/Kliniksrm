import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Phone,
  MapPin,
  Clock,
  List,
  X,
  Stethoscope,
  Heart,
  PawPrint,
  Flask,
  Scan,
  Pill,
  Plus,
  MagnifyingGlass,
  Check,
  Copy,
  Printer,
  CircleNotch,
  Play,
  BookOpen,
  Tooth,
} from "@phosphor-icons/react";
import { clinic, plans, services, routeTitles } from "./content";
import { team } from "./team-data.js";
import { displayPrice, filterCatalog, normalizeCatalog, rub } from "./catalog";
import { priceSelectionBooking } from "./price-selection.js";
import { useMotion } from "./motion";
import { PetPortrait } from "./PetPortrait.jsx";
import { ClinicTour } from "./ClinicTour.jsx";
import { ToothExplorer, PetAnatomy, ExploreLinks } from "./Explore.jsx";
import { ClinicSupport, Promotions } from "./Support.jsx";
import { CheckupPrograms } from "./CheckupPrograms.jsx";
import { getCheckupVisitContext, checkupProgram } from "./checkup-programs.js";
import { PrivacyPolicy, ContactConsent } from "./Legal.jsx";
import { Article, ArticleCards } from "./Articles.jsx";
import { ServiceExperience, ServicePrices, ServiceDirectory } from "./ServiceExperience.jsx";
import { getDirectionVisitContext } from "./service-catalog.js";
import {
  articles,
  articleVisitHref,
  getArticleVisitContext,
  isArticleVisible,
} from "./articles-data.js";

const icons = {
  stethoscope: Stethoscope,
  heart: Heart,
  paw: PawPrint,
  flask: Flask,
  scan: Scan,
  pill: Pill,
  tooth: Tooth,
};
const Arrow = () => <ArrowRight size={22} aria-hidden="true" />;
function Button({
  href = "/visit",
  children,
  light = false,
  outline = false,
  ...props
}) {
  return (
    <a
      className={`button ${light ? "light" : ""} ${outline ? "outline" : ""}`}
      href={href}
      {...props}
    >
      {children}
      <Arrow />
    </a>
  );
}
function TextLink({ href, children, ...props }) {
  return (
    <a className="text-link" href={href} {...props}>
      {children}
      <ArrowUpRight size={20} aria-hidden="true" />
    </a>
  );
}
function Photo({ name, alt, className = "", eager = false, ...props }) {
  return (
    <img
      className={className}
      src={`/images/${name}-1280.webp`}
      srcSet={`/images/${name}-640.webp 640w, /images/${name}-1280.webp 1280w`}
      sizes="(max-width: 760px) 100vw, 55vw"
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      {...props}
    />
  );
}
function PageIntro({ label, title, children }) {
  return (
    <section className="page-intro wrap">
      <p className="eyebrow">{label}</p>
      <h1>{title}</h1>
      {children && <div className="intro-copy">{children}</div>}
    </section>
  );
}
function Breadcrumb({ title, parent }) {
  return (
    <nav className="breadcrumb wrap" aria-label="Хлебные крошки">
      <a href="/">Главная</a>
      <span>/</span>
      {parent && (
        <>
          <a href={parent[0]}>{parent[1]}</a>
          <span>/</span>
        </>
      )}
      <span aria-current="page">{title}</span>
    </nav>
  );
}

function Header({ path, bookingHref = "/visit" }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        menuRef.current?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <div className="topline">
        <a href="/contacts">
          <MapPin size={16} weight="fill" />
          Армавир · Каспарова, 27/2
        </a>
        <a href="/night">
          <Clock size={16} />
          Круглосуточно · ночью сначала позвоните
        </a>
      </div>
      <header className="header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="TemichevVET — главная">
            <img
              src="/brand/temichevvet-logo.jpg"
              width="112"
              height="112"
              alt="TemichevVET"
            />
          </a>
          <nav
            id="main-navigation"
            className={open ? "nav is-open" : "nav"}
            aria-label="Основная навигация"
          >
            {[
              ["/", "Главная"],
              ["/clinic", "Клиника"],
              ["/team", "Команда"],
              ["/services", "Услуги и цены"],
              ["/pets", "О питомцах"],
              ["/journal", "Журнал"],
              ["/contacts", "Контакты"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}
              >
                {label}
              </a>
            ))}
            <a className="mobile-nav-extra" href="/reviews">
              Отзывы
            </a>
            <a className="mobile-nav-extra" href="/offers">
              Акции
            </a>
          </nav>
          <a className="header-phone" href={clinic.tel} aria-label={`Позвонить: ${clinic.phone}`}>
            <Phone size={19} weight="fill" />
            <span>{clinic.phone}</span>
          </a>
          <a className="button header-book" href={bookingHref}>
            Записаться
          </a>
          <button
            ref={menuRef}
            className="menu-button"
            aria-expanded={open}
            aria-controls="main-navigation"
            aria-label={open ? "Закрыть меню" : "Открыть меню"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={26} /> : <List size={26} />}
          </button>
        </div>
      </header>
    </>
  );
}
function Footer({ paused, setPaused }) {
  return (
    <footer>
      <div className="footer-main wrap">
        <h2>
          До встречи
          <br /> в TemichevVET
        </h2>
        <div>
          <a href="/contacts">
            <MapPin size={25} weight="fill" />
            {clinic.address}
          </a>
          <a className="footer-phone" href={clinic.tel}>
            <Phone size={25} weight="fill" />
            {clinic.phone}
          </a>
        </div>
        <PawPrint
          className="footer-paw"
          weight="fill"
          size={146}
          aria-hidden="true"
        />
      </div>
      <div className="footer-links wrap">
        <a href="/">Главная</a>
        <a href="/team">Врачи</a>
        <a href="/prices">Прейскурант</a>
        <a href="/reviews">Отзывы</a>
        <a href="/night">Помощь ночью</a>
        <a href="/journal">Журнал</a>
        <a href="/pets">О питомцах</a>
        <a href="/offers">Акции</a>
        <a href="/privacy">Обработка данных</a>
        <button onClick={() => setPaused(!paused)} aria-pressed={paused}>
          {paused ? "Включить анимацию" : "Выключить анимацию"}
        </button>
      </div>
      <div className="footer-bottom wrap">
        <span>TemichevVET · Ветеринарная клиника в Армавире</span>
        <span>Ночью, с 20:00 до 09:00, перед приездом позвоните.</span>
      </div>
    </footer>
  );
}

function Hero() {
  return (
    <section className="hero">
      <div className="hero-backdrop" data-parallax="0.28" aria-hidden="true">
        <img src="/assets/hero-backdrop.webp" alt="" />
      </div>
      <div className="hero-pet cat" data-parallax="0.13" aria-hidden="true">
        <PetPortrait animal="cat" />
      </div>
      <div className="hero-pet dog" data-parallax="0.21" aria-hidden="true">
        <PetPortrait animal="dog" />
      </div>
      <div className="hero-orbit" aria-hidden="true">
        <CircleNotch className="orbit-ring" size={84} weight="light" />
        <PawPrint className="orbit-paw" size={28} weight="light" />
      </div>
      <div className="hero-copy" data-parallax="-0.045">
        <h1>
          Ближе к тем,
          <br /> кого любят.
        </h1>
        <p>
          Ветеринарная клиника TemichevVET в Армавире.
          <br /> Заботимся о здоровье ваших питомцев —
          <br className="wide-only" /> каждый день и каждую ночь.
        </p>
        <div className="hero-actions">
          <Button>Записаться на приём</Button>
          <TextLink href="/prices">Услуги и цены</TextLink>
        </div>
        <a href="#clinic-tour" className="hero-tour-link">
          <img
            src="/images/reception-real-640.webp"
            width="54"
            height="40"
            alt=""
          />
          Заглянуть в клинику
          <ArrowUpRight size={17} />
        </a>
      </div>
    </section>
  );
}
function Statement() {
  return (
    <section className="statement wrap">
      <p className="eyebrow">Знакомимся, чтобы заботиться</p>
      <h2 data-reveal aria-label="Сначала — понять. Потом — помочь.">
        <span className="reveal-line" aria-hidden="true">
          {["Сначала", "—", "понять."].map((w) => (
            <span data-word key={w}>
              {w}{" "}
            </span>
          ))}
        </span>
        <span className="reveal-line sky" aria-hidden="true">
          {["Потом", "—", "помочь."].map((w) => (
            <span data-word key={w}>
              {w}{" "}
            </span>
          ))}
        </span>
      </h2>
    </section>
  );
}
function StoryStack() {
  return (
    <section
      className="story-track"
      data-stack
      aria-label="Знакомство с клиникой"
    >
      <div className="story-stage">
        <div className="story-canvas wrap">
          <figure className="story-doctor">
            <Photo
              name="konstantin-cat-original"
              alt="Константин Валерьевич Темичев с котом"
            />
          </figure>
          <article className="story-intro">
            <h2>
              Врачи, которым
              <br /> можно задать
              <br /> вопросы
            </h2>
            <p>
              Обсудим состояние питомца
              <br /> и следующие шаги на приёме.
            </p>
            <TextLink href="/clinic">О клинике</TextLink>
          </article>
          <article className="stack-card diagnostic-card" data-stack-card>
            <Stethoscope size={70} weight="thin" aria-hidden="true" />
            <div>
              <h3>Диагностика</h3>
              <p>УЗИ, рентген и собственная лаборатория.</p>
              <TextLink href="/services/diagnostics">Об обследованиях</TextLink>
            </div>
          </article>
          <article className="stack-card care-card" data-stack-card>
            <Heart size={70} weight="thin" aria-hidden="true" />
            <div>
              <h3>
                Забота
                <br /> после приёма
              </h3>
              <p>План лечения и восстановления — вместе с врачом.</p>
              <TextLink href="/services/inpatient">О стационаре</TextLink>
            </div>
          </article>
        </div>
        <a className="story-all text-link" href="/team">
          Познакомиться с командой <ArrowUpRight size={20} />
        </a>
      </div>
    </section>
  );
}
function JournalTeaser() {
  const [tab, setTab] = useState("articles");
  return (
    <section className="journal-teaser wrap">
      <div className="journal-heading">
        <h2>
          Журнал о жизни
          <br /> с питомцем
        </h2>
        <div className="tabs" role="tablist" aria-label="Материалы журнала">
          {[
            ["articles", "Статьи"],
            ["videos", "Видео"],
          ].map(([value, title]) => (
            <button
              id={`home-tab-${value}`}
              key={value}
              role="tab"
              aria-selected={tab === value}
              tabIndex={tab === value ? 0 : -1}
              aria-controls="journal-preview"
              onClick={() => setTab(value)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const next =
                  event.key === "Home"
                    ? "articles"
                    : event.key === "End"
                      ? "videos"
                      : tab === "articles"
                        ? "videos"
                        : "articles";
                setTab(next);
                document.getElementById(`home-tab-${next}`)?.focus();
              }}
            >
              {title}
            </button>
          ))}
        </div>
        <PawPrint
          className="journal-paw"
          size={270}
          weight="fill"
          aria-hidden="true"
        />
      </div>
      <div
        id="journal-preview"
        role="tabpanel"
        aria-labelledby={`home-tab-${tab}`}
      >
        {tab === "articles" ? (
          <ArticleCards />
        ) : (
          <>
            <p className="development-caption">Раздел в разработке</p>
            <a className="journal-banner" href={`/journal/${tab}`}>
              <strong>
                {tab === "articles" ? (
                  <>
                    Полезное —<br /> от вашей клиники
                  </>
                ) : (
                  <>
                    Смотреть и узнавать
                    <br /> вместе с врачом
                  </>
                )}
              </strong>
              <img src="/assets/journal-cat.webp" alt="" aria-hidden="true" />
              <ArrowUpRight size={28} />
            </a>
          </>
        )}
      </div>
    </section>
  );
}
function Reviews({ compact = false }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <section
      className={`reviews-layout wrap ${compact ? "compact-reviews" : ""}`}
    >
      <div>
        <p className="eyebrow">Ваше доверие</p>
        <h2>
          Забота,
          <br /> о которой
          <br /> рассказывают.
        </h2>
        <p>Отзывы владельцев и ответы клиники — из Яндекс Карт.</p>
        <TextLink
          href={clinic.reviews}
          target="_blank"
          rel="noopener noreferrer"
        >
          Все отзывы на Яндекс Картах
        </TextLink>
        <p className="small muted">
          На Картах мы указаны как «Айболит».
          <br /> Адрес: Каспарова, 27/2.
        </p>
      </div>
      <iframe
        title="Отзывы о клинике на Яндекс Картах"
        src={mounted ? clinic.widget : undefined}
        loading={compact ? "lazy" : "eager"}
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </section>
  );
}
function Home() {
  return (
    <>
      <Hero />
      <Statement />
      <TeamPreview />
      <StoryStack />
      <ClinicTour />
      <ExploreLinks />
      <JournalTeaser />
      <Promotions compact />
      <Reviews compact />
    </>
  );
}
function TeamPreview() {
  return (
    <section className="home-team wrap" aria-labelledby="home-team-title">
      <div className="home-team-heading">
        <div>
          <p className="eyebrow">Люди TemichevVET</p>
          <h2 id="home-team-title">Познакомьтесь с командой.</h2>
          <p>Врачи, ассистенты и администратор клиники — не только имена в расписании.</p>
        </div>
        <TextLink href="/team">Все врачи и сотрудники</TextLink>
      </div>
      <div className="home-team-grid">
        {team.slice(0, 4).map((person) => (
          <a className="home-team-card" href="/team" key={person.id} aria-label={`Команда клиники: ${person.name}`}>
            <img
              src={`/images/team/${person.id}.webp?v=20261017-nobadge`}
              alt={person.name}
              width="1122"
              height="1402"
              loading="lazy"
              decoding="async"
            />
            <strong>{person.name}</strong>
            <span>{person.role}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
function NightNote() {
  return (
    <aside className="night-note">
      <Clock size={27} />
      <div>
        <strong>Если помощь нужна ночью</strong>
        <p>С 20:00 до 09:00 перед приездом обязательно позвоните.</p>
      </div>
      <a href={clinic.tel}>
        {clinic.phone}
        <Arrow />
      </a>
    </aside>
  );
}
function ServiceList() {
  return (
    <div className="service-list">
      {services.map((s, i) => {
        const Icon = icons[s.icon];
        return (
          <a href={"/services/" + s.id} className="service-row" key={s.id}>
            <span className="row-number">0{i + 1}</span>
            <Icon size={38} weight="light" aria-hidden="true" />
            <div>
              <h2>{s.title}</h2>
              <p>{s.tagline}</p>
            </div>
            <ArrowUpRight size={29} />
          </a>
        );
      })}
    </div>
  );
}
function Services() {
  return (
    <>
      <Breadcrumb title="Услуги" />
      <PageIntro
        label="Помощь питомцу"
        title={
          <>
            От знакомства
            <br /> до восстановления.
          </>
        }
      >
        <p>
          Приём, обследования и лечение. Если не знаете, с чего начать,
          позвоните — администратор поможет выбрать время визита.
        </p>
        <Button href="/prices" outline>
          Посмотреть прейскурант
        </Button>
      </PageIntro>
      <section className="wrap">
        <ServiceList />
        <NightNote />
      </section>
    </>
  );
}
function Service({ service: s }) {
  return (
    <>
      <Breadcrumb title={s.title} parent={["/services", "Услуги"]} />
      <PageIntro label={s.title} title={s.tagline}>
        <p>{s.description}</p>
        <Button href={s.id === "pharmacy" ? clinic.tel : `/visit?direction=${s.id}`}>{s.id === "pharmacy" ? "Уточнить наличие" : "Записаться на приём"}</Button>
      </PageIntro>
      <ServiceDirectory active={s.id} />
      {s.id === "dentistry" && <ToothExplorer />}
      <ServiceExperience key={s.id} service={s} />
      <section className="service-detail wrap">
        {s.image ? (
          <Photo className={`service-photo ${s.image === "konstantin-cat-original" ? "service-photo-portrait" : ""}`} name={s.image} alt={s.image === "konstantin-cat-original" ? "Константин Темичев осматривает кошку" : s.title} />
        ) : (
          <div className="service-editorial">
            <p className="eyebrow">TemichevVET</p>
            <h2>{s.title}</h2>
            <p>
              Обсудим всё на приёме.
              <br /> План помощи зависит от состояния питомца.
            </p>
          </div>
        )}
        <div>
          <h2>Чем можем помочь</h2>
          <ul className="plain-list">
            {s.items.map((x) => (
              <li key={x}>
                <Check size={20} />
                {x}
              </li>
            ))}
          </ul>
          <h3>Перед визитом</h3>
          <p>{s.prepare}</p>
          <TextLink href="#direction-prices">
            Стоимость услуг
          </TextLink>
        </div>
      </section>
      <ServicePrices key={`prices-${s.id}`} service={s} />
      <section className="wrap bottom-space">
        <NightNote />
      </section>
    </>
  );
}
function Clinic() {
  return (
    <>
      <Breadcrumb title="О клинике" />
      <PageIntro
        label="TemichevVET · Армавир"
        title={
          <>
            Знакомое место.
            <br /> Внимательные люди.
          </>
        }
      >
        <p>
          Работаем на Каспарова, 27/2. Здесь можно пройти осмотр, сделать
          обследования и обсудить с врачом лечение питомца.
        </p>
      </PageIntro>
      <figure className="clinic-panorama wrap">
        <Photo
          name="reception-real"
          alt="Зона ожидания и стойка администратора в клинике"
          eager
        />
        <figcaption>TemichevVET, Каспарова, 27/2</figcaption>
      </figure>
      <section className="editorial-section wrap">
        <h2>
          Сначала —<br /> познакомиться.
        </h2>
        <div>
          <p>
            Клиника работает в Армавире с 1996 года. В команде — ветеринарные
            врачи и сотрудники, которые помогают организовать приём и уход за
            питомцами.
          </p>
          <p>
            Приём, УЗИ и рентген, собственная лаборатория, хирургия и стационар
            — в одной клинике. Необходимые обследования и лечение врач обсудит с
            вами после осмотра.
          </p>
          <Button href="/team" outline>
            Познакомиться с врачами
          </Button>
        </div>
      </section>
      <section className="clinic-gallery wrap">
        {[
          ["ultrasound-real", "Кабинет УЗИ"],
          ["laboratory-real", "Собственная лаборатория"],
          ["inpatient-noninfectious-real", "Неинфекционный стационар"],
        ].map(([name, label]) => (
          <figure key={name}>
            <Photo name={name} alt={label} />
            <figcaption>{label}</figcaption>
          </figure>
        ))}
      </section>
      <section className="wrap bottom-space">
        <NightNote />
        <TextLink href="/contacts">Как добраться до клиники</TextLink>
      </section>
    </>
  );
}
function DoctorProfile({ standalone = false }) {
  return (
    <section className="doctor-profile wrap">
      <figure className="doctor-portrait">
        <img src="/images/team/temichev.webp" alt="Константин Валерьевич Темичев, руководитель клиники" loading="eager" />
        <img className="doctor-portrait-logo" src="/brand/temichevvet-logo.jpg" alt="" aria-hidden="true" />
      </figure>
      <div>
        <p className="eyebrow">Руководитель клиники</p>
        {standalone ? (
          <h1>
            Константин
            <br /> Валерьевич
            <br /> Темичев
          </h1>
        ) : (
          <h2>
            Константин
            <br /> Валерьевич
            <br /> Темичев
          </h2>
        )}
        <p className="doctor-role">
          Ветеринарный врач,
          <br /> кандидат ветеринарных наук
        </p>
        <p>
          Если хотите попасть на приём к Константину Валерьевичу, скажите об
          этом администратору. Он уточнит расписание и предложит время.
        </p>
        <Button href={standalone ? clinic.tel : "/team/temichev"}>
          {standalone ? "Уточнить время приёма" : "Познакомиться с врачом"}
        </Button>
      </div>
    </section>
  );
}
function Team() {
  return (
    <>
      <Breadcrumb title="Команда" />
      <PageIntro
        label="Люди TemichevVET"
        title={
          <>
            За заботой
            <br /> стоят люди.
          </>
        }
      >
        <p>
          Знакомство с врачами начинается ещё до визита. Вы можете уточнить
          специалиста и время приёма у администратора.
        </p>
      </PageIntro>
      <DoctorProfile />
      <section className="team-reserve wrap">
        <div className="section-heading">
          <h2>Команда клиники</h2>
          <p>Врачи, ассистенты и администратор</p>
        </div>
        <div className="team-grid">
          {team.map((person) => (
            <article className="team-slot" key={person.id}>
              <div className="team-portrait">
                <img src={`/images/team/${person.id}.webp?v=20261017-nobadge`} alt={person.name} loading="eager" decoding="async" width="1122" height="1402" />
              </div>
              <div className="team-person-copy">
                <h3>{person.name}</h3>
                <p>{person.role}</p>
                {person.degree && <p className="team-degree">{person.degree}</p>}
              </div>
            </article>
          ))}
        </div>
        <p className="small muted">
          Расписание и возможность записи к выбранному специалисту уточняйте у администратора.
        </p>
      </section>
    </>
  );
}
function Contacts() {
  return (
    <>
      <Breadcrumb title="Контакты" />
      <PageIntro
        label="До встречи в клинике"
        title={
          <>
            Нас легко
            <br /> найти.
          </>
        }
      >
        <p>{clinic.address}</p>
      </PageIntro>
      <section className="contacts-layout wrap">
        <figure>
          <Photo
            name="facade-real"
            alt="Фасад клиники на Каспарова, 27/2. Вход со ступенями справа"
            eager
          />
          <figcaption>
            Вход в клинику — справа на фотографии. На фасаде — вывеска
            «Айболит».
          </figcaption>
        </figure>
        <div className="contact-details">
          <div>
            <MapPin size={28} />
            <h2>Каспарова, 27/2</h2>
            <p>Армавир</p>
            <Button
              href={clinic.route}
              target="_blank"
              rel="noopener noreferrer"
            >
              Построить маршрут
            </Button>
          </div>
          <div>
            <Phone size={28} />
            <a className="contact-phone" href={clinic.tel}>
              {clinic.phone}
            </a>
            <p>Позвоните, чтобы согласовать время визита.</p>
          </div>
          <div>
            <Clock size={28} />
            <h3>Круглосуточно</h3>
            <p>С 20:00 до 09:00 перед приездом обязательно позвоните.</p>
          </div>
        </div>
      </section>
      <section className="wrap bottom-space">
        <TextLink href="/visit">Подготовиться к приёму</TextLink>
      </section>
    </>
  );
}
function Visit({ search = "" }) {
  const context = getCheckupVisitContext(search) || getArticleVisitContext(search) || getDirectionVisitContext(search);
  const [purpose, setPurpose] = useState("consultation"),
    [done, setDone] = useState([]),
    [message, setMessage] = useState("");
  const plan = plans[purpose];
  useEffect(() => {
    setPurpose((getCheckupVisitContext(search) || getArticleVisitContext(search) || getDirectionVisitContext(search))?.purpose || "consultation");
    setDone([]);
    setMessage("");
  }, [search]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${plan.title}\n${plan.items.map((x, i) => `${done.includes(i) ? "✓" : "—"} ${x}`).join("\n")}\n${clinic.address}\n${clinic.phone}`,
      );
      setMessage("Список скопирован.");
    } catch {
      setMessage("Не удалось скопировать. Можно распечатать список.");
    }
  }
  return (
    <>
      <Breadcrumb title="Запись на приём" />
      <PageIntro
        label="Будем рады познакомиться"
        title={
          <>
            Давайте выберем
            <br /> время для встречи.
          </>
        }
      >
        <p>
          Оставьте заявку здесь: имя, телефон и удобный способ ответа.
          Администратор уточнит, что беспокоит питомца, и предложит время приёма.
        </p>
        <button className="button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("clinic-booking", { detail: context?.message || "Хочу записать питомца на приём." }))}>Оставить заявку на приём <Arrow /></button>
        <a className="text-link" href={clinic.tel}>Или позвонить: {clinic.phone}</a>
        <p className="small">
          Это заявка, а не подтверждённая запись. Время согласуем с вами отдельно.
        </p>
      </PageIntro>
      {context && (
        <section
          className="article-visit-context wrap"
          aria-label="Тема вашего обращения"
        >
          <p className="eyebrow">{context.title}</p>
          <h2>{context.serviceTitle}</h2>
          <p>Ваша заявка будет связана с этой темой:</p>
          <blockquote>{context.message}</blockquote>
          <p className="small">
            Тема отправится вместе с заявкой после заполнения формы и согласия на обратную связь.
          </p>
          <a className="text-link" href={context.href || (context.topic ? `/journal/articles/${context.topic}` : `/services/${context.direction}`)}>
            {context.href ? "Вернуться к программам" : context.topic ? "Вернуться к статье" : "Вернуться к направлению"}
            <ArrowUpRight size={20} />
          </a>
        </section>
      )}
      <section className="visit-planner wrap">
        <div>
          <p className="eyebrow">Собраться без спешки</p>
          <h2>
            Всё важное —<br /> с собой.
          </h2>
          <label className="field">
            Цель визита
            <select
              value={purpose}
              onChange={(e) => {
                setPurpose(e.target.value);
                setDone([]);
                setMessage("");
              }}
            >
              {Object.entries(plans).map(([key, p]) => (
                <option value={key} key={key}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <p>{plan.note}</p>
        </div>
        <div className="checklist">
          <div className="checklist-heading">
            <h3>{plan.title}</h3>
            <output aria-live="polite">
              {done.length} из {plan.items.length}
            </output>
          </div>
          {plan.items.map((text, i) => (
            <label className="check-row" key={`${purpose}-${i}`}>
              <input
                type="checkbox"
                checked={done.includes(i)}
                onChange={() =>
                  setDone(
                    done.includes(i)
                      ? done.filter((n) => n !== i)
                      : [...done, i],
                  )
                }
              />
              <span>{text}</span>
            </label>
          ))}
          <div className="check-actions">
            <button onClick={copy}>
              <Copy size={18} />
              Скопировать
            </button>
            <button onClick={() => window.print()}>
              <Printer size={18} />
              Распечатать
            </button>
          </div>
          <p className="small status" role="status">
            {message}
          </p>
        </div>
      </section>
      <section className="faq-section wrap">
        <h2>До визита</h2>
        <div>
          {[
            [
              "Нужна ли подготовка?",
              "Для приёма, УЗИ, анализов и операции требования различаются. Уточните их при записи. Индивидуальные назначения даёт врач.",
            ],
            [
              "Можно выбрать врача?",
              "Сообщите о своём пожелании администратору. Он уточнит расписание и доступное время.",
            ],
            [
              "Если планы изменились?",
              "Позвоните в клинику, чтобы перенести или отменить визит.",
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Plus size={21} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="wrap bottom-space">
        <NightNote />
      </section>
    </>
  );
}

function Prices({ search }) {
  const [catalog, setCatalog] = useState(null),
    [state, setState] = useState("loading"),
    [query, setQuery] = useState(new URLSearchParams(search).get("q") || ""),
    [category, setCategory] = useState(""),
    [selected, setSelected] = useState([]),
    [retry, setRetry] = useState(0);
  useEffect(
    () => setQuery(new URLSearchParams(search).get("q") || ""),
    [search],
  );
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch("/api/prices", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw Error();
        const next = normalizeCatalog(await response.json());
        if (active) {
          setCatalog(next);
          setState("ready");
          setSelected((s) =>
            s.filter((id) => next.items.some((x) => x.id === id)),
          );
        }
      } catch (error) {
        if (active && error.name !== "AbortError") {
          setCatalog(null);
          setState("error");
          setSelected([]);
        }
      }
    };
    setState("loading");
    load();
    const timer = setInterval(() => {
      if (!document.hidden) load();
    }, 60000);
    const visibility = () => {
      if (!document.hidden) load();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [retry]);
  const categories = catalog
    ? [...new Set(catalog.items.map((x) => x.category))].sort((a, b) =>
        a.localeCompare(b, "ru"),
      )
    : [];
  const results = catalog ? filterCatalog(catalog.items, query, category) : [];
  const picked = catalog
    ? catalog.items.filter((x) => selected.includes(x.id))
    : [];
  const min = picked.reduce((a, x) => a + (x.minimumPrice || x.price), 0),
    max = picked.reduce((a, x) => a + (x.maximumPrice || x.price), 0),
    range = picked.some((x) => x.priceType === "RANGE");
  const selectionBooking = priceSelectionBooking(catalog, selected);
  const toggle = (id) =>
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  return (
    <>
      <Breadcrumb title="Прейскурант" />
      <PageIntro
        label="Планируем визит"
        title={
          <>
            Понятно
            <br /> о стоимости.
          </>
        }
      >
        <p>
          Найдите услугу и добавьте её в свой список. Состав обследования и
          лечения обсуждается с врачом.
        </p>
        <a className="text-link" href="/offers#checkup-programs">Программы диспансеризации — от {rub(checkupProgram("cat", "clinic", "standard").price)} <Arrow /></a>
      </PageIntro>
      <ServiceDirectory />
      <section className="price-layout wrap">
        <div>
          <div className="price-controls">
            <label className="field">
              Найти услугу
              <div className="search-field">
                <MagnifyingGlass size={21} />
                <input
                  value={query}
                  type="search"
                  placeholder="Например, УЗИ или приём"
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </label>
            <label className="field">
              Направление
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Все услуги</option>
                {categories.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <p role="status" className="price-status">
            {state === "loading"
              ? "Загружаем прейскурант…"
              : state === "error"
                ? "Сейчас прейскурант недоступен. Стоимость можно уточнить по телефону."
                : `Найдено услуг: ${results.length}`}
          </p>
          {state === "error" && (
            <button
              className="button outline"
              onClick={() => setRetry((r) => r + 1)}
            >
              Попробовать снова
            </button>
          )}
          {state === "ready" && !results.length && (
            <div className="empty-results">
              <h3>Такой услуги не нашли</h3>
              <p>Попробуйте другое название или уточните в клинике.</p>
              <button
                className="text-link"
                onClick={() => {
                  setQuery("");
                  setCategory("");
                }}
              >
                Сбросить поиск <Arrow />
              </button>
            </div>
          )}
          <div className="price-results">
            {!!picked.length && <a className="price-selection-jump" href="#selected-services">Выбрано: {picked.length} · {rub(min)}{min !== max ? ` – ${rub(max)}` : ""} <span>Посмотреть список ↓</span></a>}
            {results.map((item) => (
              <article className="price-row" key={item.id}>
                <div>
                  <span className="small muted">{item.category}</span>
                  <h3>{item.title}</h3>
                </div>
                <strong>{displayPrice(item)}</strong>
                <button
                  className={
                    selected.includes(item.id)
                      ? "price-add selected"
                      : "price-add"
                  }
                  aria-label={`${selected.includes(item.id) ? "Убрать" : "Добавить"}: ${item.title}`}
                  aria-pressed={selected.includes(item.id)}
                  onClick={() => toggle(item.id)}
                >
                  {selected.includes(item.id) ? (
                    <Check size={19} />
                  ) : (
                    <Plus size={19} />
                  )}
                </button>
              </article>
            ))}
          </div>
          {catalog && (
            <p className="small muted">
              Прейскурант обновлён{" "}
              {new Date(catalog.updatedAt).toLocaleString("ru-RU", {
                timeZone: "Europe/Moscow",
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              (МСК).
            </p>
          )}
        </div>
        <aside className="price-summary" id="selected-services" tabIndex={-1}>
          <p className="eyebrow">Ваш список</p>
          <h2>
            Услуги
            <br /> и стоимость
          </h2>
          {!picked.length ? (
            <p className="muted">Добавьте нужные услуги из прейскуранта.</p>
          ) : (
            <ul>
              {picked.map((x) => (
                <li key={x.id}>
                  <span>{x.title}</span>
                  <button
                    aria-label={`Убрать из списка: ${x.title}`}
                    onClick={() => toggle(x.id)}
                  >
                    <X size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="price-total">
            <span>По прейскуранту</span>
            <strong>
              {!picked.length
                ? "—"
                : min !== max
                  ? `${rub(min)} – ${rub(max)}`
                  : `${range ? "от " : ""}${rub(min)}`}
            </strong>
          </div>
          <p className="small">
            Это не окончательная стоимость лечения. Препараты, расходные
            материалы и стационар могут оплачиваться отдельно.
          </p>
          {!!picked.length && selectionBooking && <button className="button" type="button" onClick={() => window.dispatchEvent(new CustomEvent("clinic-booking", {detail:selectionBooking.message}))}>Оставить заявку по списку <Arrow /></button>}
          {!!picked.length && !selectionBooking && <p className="small" role="status">Для передачи в заявке сократите список или уточните его по телефону. Ничего из выбранного не отправлено.</p>}
          <Button href={clinic.tel} outline={picked.length > 0}>Уточнить по телефону</Button>
          {!!picked.length && (
            <button className="text-link" onClick={() => window.print()}>
              Распечатать список <Printer size={18} />
            </button>
          )}
        </aside>
      </section>
    </>
  );
}
function Journal({ path }) {
  const video = path.endsWith("/videos");
  return (
    <>
      <Breadcrumb title="Журнал" />
      <PageIntro
        label="От вашей клиники"
        title={
          <>
            О жизни
            <br /> с питомцем.
          </>
        }
      >
        <p>
          Рассмотреть, понять и позаботиться. Наглядные истории о жизни с
          питомцем.
        </p>
      </PageIntro>
      <section className="journal-page wrap">
        <nav className="tabs" aria-label="Разделы журнала">
          <a
            href="/journal/articles"
            aria-current={!video ? "page" : undefined}
          >
            <BookOpen size={20} />
            Статьи
          </a>
          <a href="/journal/videos" aria-current={video ? "page" : undefined}>
            <Play size={20} />
            Видео
          </a>
        </nav>
        {!video ? (
          <ArticleCards />
        ) : (
          <div className="journal-empty">
            <img src="/assets/journal-cat.webp" alt="" />
            <p className="eyebrow">Раздел в разработке</p>
            <h2>
              {video
                ? "Видео скоро появятся здесь."
                : "Здесь будет наш журнал."}
            </h2>
            <p>
              {video
                ? "Разговоры с врачами и видео о жизни с питомцами."
                : "Материалы клиники о заботе, знакомстве и подготовке к визиту."}
            </p>
            <TextLink href="/visit">А пока — подготовиться к приёму</TextLink>
          </div>
        )}
      </section>
    </>
  );
}
function Night() {
  return (
    <>
      <Breadcrumb title="Помощь ночью" />
      <section className="night-page wrap">
        <p className="eyebrow">Круглосуточная клиника</p>
        <h1>
          Если помощь нужна
          <br /> ночью — позвоните.
        </h1>
        <p>
          С 20:00 до 09:00 перед приездом обязательно свяжитесь с клиникой.
          Расскажите, что произошло и как чувствует себя питомец.
        </p>
        <Button href={clinic.tel}>{clinic.phone}</Button>
      </section>
      <section className="editorial-section wrap">
        <h2>
          Что рассказать
          <br /> при звонке
        </h2>
        <ol className="numbered-list">
          {[
            "Кто ваш питомец и сколько ему лет",
            "Что произошло и когда это началось",
            "Что изменилось в его состоянии",
            "Какие препараты он уже получил",
          ].map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </section>
      <section className="wrap bottom-space">
        <TextLink href="/contacts">Как добраться</TextLink>
      </section>
    </>
  );
}
function Page({ path, search }) {
  const topic = path.startsWith("/journal/articles/")
    ? path.slice("/journal/articles/".length)
    : "";
  if (isArticleVisible(articles[topic])) return <Article key={topic} topic={topic} />;
  if (path === "/pets")
    return (
      <>
        <Breadcrumb title="О питомцах" />
        <PageIntro
          label="Узнавать, чтобы понимать"
          title={
            <>
              Любопытство —<br />
              тоже забота.
            </>
          }
        >
          <p>
            Знакомимся со строением питомца через простые интерактивные
            иллюстрации.
          </p>
        </PageIntro>
        <PetAnatomy />
        <section className="wrap bottom-space">
          <TextLink href="/services/dentistry">
            Как устроен зуб питомца
          </TextLink>
        </section>
      </>
    );
  if (path === "/offers") return <><Promotions /><CheckupPrograms /></>;
  if (path === "/privacy") return <PrivacyPolicy />;
  if (path === "/contact-consent") return <ContactConsent />;
  if (path === "/") return <Home />;
  if (path === "/clinic") return <Clinic />;
  if (path === "/team") return <Team />;
  if (path === "/team/temichev")
    return (
      <>
        <Breadcrumb title="Константин Темичев" parent={["/team", "Команда"]} />
        <DoctorProfile standalone />
      </>
    );
  if (path === "/services") return <Services />;
  const service = services.find((s) => path === "/services/" + s.id);
  if (service) return <Service service={service} />;
  if (path === "/prices") return <Prices search={search} />;
  if (path === "/contacts") return <Contacts />;
  if (path === "/visit") return <Visit search={search} />;
  if (path === "/reviews")
    return (
      <>
        <Breadcrumb title="Отзывы" />
        <PageIntro
          label="После визита"
          title={
            <>
              Спасибо,
              <br /> что доверяете.
            </>
          }
        />
        <Reviews />
      </>
    );
  if (path === "/night") return <Night />;
  if (["/journal", "/journal/articles", "/journal/videos"].includes(path))
    return <Journal path={path} />;
  return (
    <PageIntro label="Страница не найдена" title="Давайте вернёмся.">
      <p>Возможно, адрес изменился. Все разделы доступны в меню.</p>
      <Button href="/">На главную</Button>
    </PageIntro>
  );
}
export function App({ initialPath, initialSearch = "" }) {
  const [location, setLocation] = useState(() => ({
    path:
      initialPath ||
      (typeof window === "undefined"
        ? "/"
        : window.location.pathname.replace(/\/$/, "") || "/"),
    search: initialSearch,
  }));
  const [paused, setPaused] = useState(false),
    mounted = useRef(false);
  const articleTopic = location.path.startsWith("/journal/articles/")
    ? location.path.slice("/journal/articles/".length)
    : "";
  const serviceDirection = services.find((s) => location.path === `/services/${s.id}`);
  const bookingHref = location.path === "/visit" && getCheckupVisitContext(location.search) ? `/visit${location.search}` : serviceDirection ? `/visit?direction=${serviceDirection.id}` : articleVisitHref(articleTopic);
  useMotion(location.path, paused);
  useEffect(() => {
    const pop = () =>
      setLocation({
        path: window.location.pathname.replace(/\/$/, "") || "/",
        search: window.location.search,
      });
    window.addEventListener("popstate", pop);
    pop();
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    const previewTitle = isArticleVisible(articles[articleTopic]) ? articles[articleTopic].title : null;
    document.title = `${routeTitles[location.path] || previewTitle || "Страница не найдена"} — TemichevVET`;
    if (mounted.current)
      document.querySelector("#main")?.focus({ preventScroll: true });
    mounted.current = true;
    // Cross-page article links must land on the named section after hydration.
    // Browser fragment scrolling may run before the React layout is ready.
    const anchorFrame = requestAnimationFrame(() => {
      if (!window.location.hash) return;
      let id;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(anchorFrame);
  }, [location.path]);
  function navigate(e) {
    const a = e.target.closest("a");
    if (
      !a ||
      a.target ||
      a.hasAttribute("download") ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.shiftKey ||
      e.altKey
    )
      return;
    const url = new URL(a.href, window.location.href);
    if (
      url.origin !== window.location.origin ||
      url.hash ||
      !/^https?:$/.test(url.protocol)
    )
      return;
    e.preventDefault();
    if (url.pathname === location.path && url.search === location.search) {
      if (window.location.hash)
        window.history.replaceState({}, "", url.pathname + url.search);
      window.scrollTo({ top: 0, behavior: "auto" });
      return;
    }
    window.history.pushState({}, "", url.pathname + url.search);
    setLocation({
      path: url.pathname.replace(/\/$/, "") || "/",
      search: url.search,
    });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  return (
    <div onClick={navigate}>
      <a className="skip-link" href="#main">
        Перейти к содержанию
      </a>
      <Header path={location.path} bookingHref={bookingHref} />
      <main id="main" tabIndex="-1" data-page={location.path}>
        <Page
          key={location.path}
          path={location.path}
          search={location.search}
        />
      </main>
      <Footer paused={paused} setPaused={setPaused} />
      <ClinicSupport path={location.path} bookingHref={bookingHref} />
    </div>
  );
}
