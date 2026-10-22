import { useEffect, useRef, useState } from "react";
import { CheckupPrograms } from "./CheckupPrograms.jsx";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDown,
  Phone,
  Check,
  Copy,
  BookOpen,
  ArrowsHorizontal,
} from "@phosphor-icons/react";
import { articles, articlePath, articleVisitHref, isArticleVisible } from "./articles-data.js";
import { ArticleCatalog, ArticleServiceCard } from "./ArticleServices.jsx";
import { clinic } from "./content.js";
import { clamp } from "./motion-math.js";
import { ExplodedAnatomy, IntestineScale } from "./ExplodedAnatomy.jsx";
import { TeethBody, SkinBody, CheckupBody } from "./ArticleExtensions.jsx";
import { SystemArt, SystemStory } from "./SystemStories.jsx";

const digestiveSteps = [
  {
    name: "Рот",
    headline: "Первое знакомство с едой",
    text: "Зубы помогают захватить и измельчить пищу, язык — направить её дальше. Самочувствие во время еды начинается уже здесь, а не только в животе.",
    x: 13,
    y: 22.5,
  },
  {
    name: "Пищевод",
    headline: "Движение, которого не видно",
    text: "После глотка пища продвигается по пищеводу к желудку благодаря согласованным сокращениям его стенки. Это работа мышц, а не просто падение еды вниз.",
    x: 25.4,
    y: 37.5,
  },
  {
    name: "Желудок",
    headline: "Подготовить к усвоению",
    text: "Желудок перемешивает содержимое с пищеварительными соками. Здесь продолжается обработка пищи, прежде чем она порциями перейдёт в тонкую кишку.",
    x: 42.2,
    y: 46.9,
  },
  {
    name: "Кишечник",
    headline: "Из пищи — в питательные вещества",
    text: "В тонкой кишке усваивается основная часть питательных веществ. Печень и поджелудочная железа тоже участвуют в пищеварении. В толстой кишке продолжается всасывание воды и формируется кал.",
    x: 54.4,
    y: 48.8,
  },
];

export function ArticleCards({ omit }) {
  return (
    <div className="article-cards">
      {Object.entries(articles)
        .filter(([id, article]) => id !== omit && isArticleVisible(article))
        .map(([id, article], index) => (
          <a className="article-card" href={articlePath(id)} key={id}>
            <div className="article-card-image">
              {article.diagram ? <SystemArt topic={id} compact /> : <img
                src={`/assets/${article.image}.webp`}
                alt=""
                width="1536"
                height="1024"
                loading="lazy"
              />}
              <span>0{index + 1} / Изучаем вместе</span>
            </div>
            <div className="article-card-copy">
              <p className="eyebrow">
                {article.kicker.split(" · ")[0]} · {article.time}
              </p>
              <h3>{article.title}</h3>
              <p>{article.short}</p>
              <span className="text-link">
                Читать и исследовать
                <ArrowUpRight size={21} />
              </span>
            </div>
          </a>
        ))}
    </div>
  );
}

function DigestiveJourney() {
  const [active, setActive] = useState(0),
    [outside, setOutside] = useState(false);
  const section = useRef(null),
    swipeStart = useRef(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (innerWidth < 900 || document.documentElement.dataset.motion === "off")
        return;
      const steps = [...section.current.querySelectorAll(".digestive-step")];
      const next = steps.reduce(
        (best, el, i) =>
          el.getBoundingClientRect().top < innerHeight * 0.6 ? i : best,
        0,
      );
      setActive(next);
    };
    const scroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", scroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", scroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  function select(i) {
    setActive(i);
    setOutside(false);
    if (innerWidth >= 900)
      section.current
        .querySelectorAll(".digestive-step")
        [
          i
        ].scrollIntoView({ block: "center", behavior: document.documentElement.dataset.motion === "off" ? "instant" : "smooth" });
  }
  return (
    <section
      className="digestive-journey wrap"
      id="explore-article"
      ref={section}
      aria-label="Путь пищи"
    >
      <div className="digestive-visual">
        <div className="article-scene-heading">
          <span className="eyebrow">Внутри знакомого мира</span>
          <span>0{active + 1} / 04</span>
        </div>
        <div className="digestive-scene"
          onTouchStart={(event) => {
            const touch = event.touches[0];
            swipeStart.current = [touch.clientX, touch.clientY];
          }}
          onTouchEnd={(event) => {
            if (!swipeStart.current || innerWidth >= 900) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - swipeStart.current[0];
            const dy = touch.clientY - swipeStart.current[1];
            swipeStart.current = null;
            if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3)
              select(clamp(active + (dx < 0 ? 1 : -1), 0, digestiveSteps.length - 1));
          }}
        >
          <img
            src={`/assets/${outside ? "anatomy-dog-exterior" : "digestive-dog"}.webp`}
            alt={
              outside
                ? "Собака, внешний вид"
                : "Упрощённая схема пищеварительного тракта собаки"
            }
            width="1536"
            height="1024"
          />
          {!outside &&
            digestiveSteps.map((step, i) => (
              <button
                key={step.name}
                className={`organ-point ${i === active ? "active" : ""}`}
                style={{ left: `${step.x}%`, top: `${step.y}%` }}
                aria-label={step.name}
                aria-pressed={i === active}
                onClick={() => select(i)}
              >
                {i + 1}
              </button>
            ))}
        </div>
        <div className="article-scene-controls">
          <div className="view-switch">
            <button aria-pressed={outside} onClick={() => setOutside(true)}>
              Снаружи
            </button>
            <button aria-pressed={!outside} onClick={() => setOutside(false)}>
              Путь пищи
            </button>
          </div>
          <span className="small">Нажмите на точку</span>
        </div>
        <p className="experience-note">
          Условная схема на примере собаки. Пропорции и расположение органов
          упрощены; это не снимок и не инструмент диагностики.
        </p>
        <nav className="digestive-mobile-tabs" aria-label="Этапы пищеварения">
          {digestiveSteps.map((s, i) => (
            <button
              key={s.name}
              aria-pressed={active === i}
              onClick={() => select(i)}
            >
              {s.name}
            </button>
          ))}
        </nav>
      </div>
      <div className="digestive-reading">
        {digestiveSteps.map((step, i) => (
          <section
            className={`digestive-step ${active === i ? "current" : ""}`}
            key={step.name}
          >
            <span className="article-step-number">0{i + 1}</span>
            <div>
              <p className="eyebrow">{step.name}</p>
              <h3>{step.headline}</h3>
              <p>{step.text}</p>
              {i === 0 && (
                <a href="/services/dentistry" className="text-link">
                  Здоровье зубов
                  <ArrowUpRight size={18} />
                </a>
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

const layers = [
  {
    name: "Скелет",
    file: "anatomy-dog-skeleton",
    text: "Кости создают опору. Суставы соединяют их и позволяют частям тела двигаться относительно друг друга. Связки помогают удерживать суставы стабильными.",
  },
  {
    name: "Мышцы",
    file: "anatomy-dog-muscles-v2",
    text: "Мышцы создают усилие, а сухожилия передают его костям. Для шага, поворота и прыжка важна согласованная работа всей системы, а не одной лапы.",
  },
  {
    name: "Пищеварение",
    file: "digestive-dog",
    text: "Движению нужна энергия. Пищеварительная система помогает получить питательные вещества из еды — у неё тоже есть своя история.",
  },
];

export function MovementLayers() {
  const [layer, setLayer] = useState(0),
    [split, setSplit] = useState(50);
  const scene = useRef(null),
    dragging = useRef(false);
  const move = (e) => {
    const rect = scene.current.getBoundingClientRect();
    setSplit(Math.round(clamp((e.clientX - rect.left) / rect.width) * 100));
  };
  const choose = (i) => {
    setLayer(i);
    setSplit(28);
  };
  return (
    <section
      className="movement-explorer wrap"
      id="explore-article"
      aria-label="Слои строения собаки"
    >
      <div className="article-section-heading">
        <div>
          <p className="eyebrow">Один питомец — разные системы</p>
          <h2>
            Загляните
            <br />
            под шерсть.
          </h2>
        </div>
        <p>
          Выберите слой и потяните разделитель. На одной стороне — знакомая
          собака, на другой — то, что обычно скрыто.
        </p>
      </div>
      <div className="movement-layout">
        <div>
          <div className="movement-scene" ref={scene}>
            <img
              src={`/assets/${layers[layer].file}.webp`}
              width="1536"
              height="1024"
              alt={`Учебная схема: ${layers[layer].name.toLowerCase()}`}
              loading="lazy"
            />
            <img
              className="movement-exterior"
              style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              src="/assets/anatomy-dog-exterior.webp"
              alt=""
              width="1536"
              height="1024"
              loading="lazy"
            />
            <div
              className="movement-divider"
              style={{ left: `clamp(22px, ${split}%, calc(100% - 22px))` }}
              role="slider"
              tabIndex={0}
              aria-label="Сравнить собаку и выбранную систему"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={split}
              aria-valuetext={`${split}% внешний вид, ${100 - split}% ${layers[layer].name.toLowerCase()}`}
              onPointerDown={(e) => {
                dragging.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
                move(e);
              }}
              onPointerMove={(e) => {
                if (dragging.current) move(e);
              }}
              onPointerUp={() => (dragging.current = false)}
              onPointerCancel={() => (dragging.current = false)}
              onLostPointerCapture={() => (dragging.current = false)}
              onKeyDown={(e) => {
                if (
                  ![
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End",
                  ].includes(e.key)
                )
                  return;
                e.preventDefault();
                setSplit(
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 100
                      : clamp(
                          split +
                            (["ArrowRight", "ArrowUp"].includes(e.key)
                              ? 5
                              : -5),
                          0,
                          100,
                        ),
                );
              }}
            >
              <span>
                <ArrowsHorizontal size={22} />
              </span>
            </div>
            <span className="movement-scene-label">Снаружи</span>
            <span className="movement-scene-label right">
              {layers[layer].name}
            </span>
          </div>
          <p className="experience-note">
            Упрощённые иллюстрации, не диагностические изображения. Для удобства
            слои показаны условно, без подробностей тканей.
          </p>
        </div>
        <div className="movement-layer-menu">
          {layers.map((item, i) => (
            <button
              key={item.name}
              className={i === layer ? "selected" : ""}
              aria-pressed={i === layer}
              onClick={() => choose(i)}
            >
              <span>0{i + 1}</span>
              <strong>{item.name}</strong>
              <ArrowUpRight size={20} />
            </button>
          ))}
          <p aria-live="polite">{layers[layer].text}</p>
          {layer === 2 ? (
            <a className="text-link" href={articlePath("digestion")}>
              История пищеварения
              <ArrowRight size={20} />
            </a>
          ) : (
            <a className="text-link" href={`${articlePath("movement")}#movement-observations`}>
              Что замечать дома
              <ArrowDown size={20} />
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function ArticleChecklist({ topic }) {
  const [checked, setChecked] = useState([]),
    [message, setMessage] = useState("");
  const article = articles[topic];
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${article.visitLabel}\n${article.checklist.map((s, i) => `${checked.includes(i) ? "✓" : "—"} ${s}`).join("\n")}\n${clinic.phone}\n${clinic.address}`,
      );
      setMessage("Памятка скопирована.");
    } catch {
      setMessage(
        "Не удалось скопировать. Можно сохранить памятку снимком экрана.",
      );
    }
  };
  return (
    <section className="article-checklist">
      <div>
        <p className="eyebrow">Помогите врачу понять историю</p>
        <h2>
          Что взять
          <br />
          на заметку.
        </h2>
        <p>
          Отмечайте то, что уже подготовили. Отметки остаются только на этой
          странице и никуда не отправляются.
        </p>
      </div>
      <div>
        {article.checklist.map((text, i) => (
          <label key={text}>
            <input
              type="checkbox"
              checked={checked.includes(i)}
              onChange={() =>
                setChecked((x) =>
                  x.includes(i) ? x.filter((j) => j !== i) : [...x, i],
                )
              }
            />
            <span>{text}</span>
          </label>
        ))}
        <button className="text-link" onClick={copy}>
          <Copy size={19} />
          Скопировать памятку
        </button>
        <p className="small" role="status">
          {message}
        </p>
      </div>
    </section>
  );
}

function DigestionBody() {
  return (
    <>
      <DigestiveJourney />
      <ExplodedAnatomy type="digestion" />
      <IntestineScale />
      <section className="article-editorial wrap">
        <div className="article-prose">
          <p className="eyebrow">Замечать важнее, чем угадывать</p>
          <h2>
            Пустая миска —<br />
            не весь рассказ.
          </h2>
          <p>
            Аппетит, стул и общее самочувствие дополняют друг друга. Если
            привычки изменились, полезно вспомнить, когда это началось и что
            происходило до этого: новый корм, доступ к непривычной еде, приём
            препаратов.
          </p>
          <p>
            Рвота, диарея и снижение аппетита встречаются при разных состояниях.
            По одному признаку нельзя понять причину, а похожие проявления не
            означают одинаковое лечение.
          </p>
          <p>
            Не нужно выбирать все исследования из прайса самостоятельно. Начните
            с осмотра и рассказа о питомце: так врачу будет проще предложить
            обоснованный план.
          </p>
        </div>
        <ArticleServiceCard topic="digestion" compact />
      </section>
      <section className="article-clinic-bridge wrap">
        <figure>
          <img
            src="/images/ultrasound-real-1280.webp"
            alt="Кабинет ультразвуковой диагностики TemichevVET"
            loading="lazy"
            width="1280"
            height="720"
          />
          <figcaption>УЗИ в нашей клинике · Армавир</figcaption>
        </figure>
        <div>
          <p className="eyebrow">От любопытства — к заботе</p>
          <h2>
            На картинке — схема.
            <br />
            На приёме — ваш питомец.
          </h2>
          <p>
            Если по результатам осмотра понадобятся исследования, врач объяснит,
            на какой вопрос должно ответить каждое из них. УЗИ и лабораторная
            диагностика дают разные части общей картины.
          </p>
          <a className="text-link" href="/services/diagnostics">
            Как проходит диагностика
            <ArrowUpRight size={20} />
          </a>
        </div>
      </section>
      <section
        className="article-diagnostics wrap"
        aria-labelledby="digestion-services"
      >
        <div className="article-section-heading">
          <div>
            <p className="eyebrow">Помощь рядом</p>
            <h2 id="digestion-services">
              Обсудим,
              <br />
              что нужно проверить.
            </h2>
          </div>
          <p>
            Это отдельные услуги, а не обязательный комплекс. Необходимость и
            подготовку определяет врач. Цены сверяются с действующим
            прейскурантом клиники.
          </p>
        </div>
        <div className="article-service-grid">
          <ArticleServiceCard topic="digestion" serviceKey="ultrasound" />
          <ArticleServiceCard topic="digestion" serviceKey="stool" />
        </div>
      </section>
    </>
  );
}

function MovementBody() {
  return (
    <>
      <MovementLayers />
      <section className="article-editorial wrap" id="movement-observations">
        <div className="article-prose">
          <p className="eyebrow">Сравнивайте с его привычками</p>
          <h2>
            Иногда перемены
            <br />
            совсем тихие.
          </h2>
          <p>
            Питомец может иначе вставать после отдыха, реже играть или дольше
            выбирать место для прыжка. Такие перемены стоит обсудить с врачом, а
            не автоматически списывать на возраст или характер.
          </p>
          <div className="observation-pair">
            <div>
              <h3>У собаки</h3>
              <p>
                Обратите внимание на обычную ходьбу, подъём по ступеням и
                желание гулять. Сравнивайте с тем, как именно ваша собака
                двигалась раньше.
              </p>
            </div>
            <div>
              <h3>У кошки</h3>
              <p>
                Важны повседневные мелочи: как она забирается на диван,
                спускается с него, играет и ухаживает за собой. В клинике она
                может вести себя иначе, чем дома.
              </p>
            </div>
          </div>
          <p>
            Если безопасно, короткое видео привычного движения поможет
            рассказать о наблюдениях. Не заставляйте питомца прыгать или
            повторять болезненное действие ради записи.
          </p>
        </div>
        <ArticleServiceCard topic="movement" compact />
      </section>
      <section className="article-clinic-bridge wrap">
        <figure>
          <img
            src="/images/konstantin-cat-original-1280.webp"
            alt="Константин Темичев с кошкой в клинике"
            loading="lazy"
          />
          <figcaption>Константин Темичев · TemichevVET</figcaption>
        </figure>
        <div>
          <p className="eyebrow">Больше, чем один снимок</p>
          <h2>
            Сначала смотрим
            <br />
            на самого питомца.
          </h2>
          <p>
            Наблюдение за движением и осмотр помогают определить дальнейшие
            шаги. Снимок может дополнять обследование, но сам по себе не
            показывает, насколько комфортно чувствует себя животное.
          </p>
          <a className="text-link" href="/team/temichev">
            Познакомиться с врачом
            <ArrowUpRight size={20} />
          </a>
        </div>
      </section>
      <section className="article-editorial wrap">
        <div className="article-prose">
          <p className="eyebrow">Диагностика по задаче</p>
          <h2>
            Не «сделать всё».
            <br />
            Понять, что изменилось.
          </h2>
          <p>
            Не выбирайте область рентгенографии по иллюстрации. Покажите врачу
            прошлые заключения и расскажите о нагрузке, травмах и изменениях
            поведения. Он обсудит с вами необходимость новых исследований.
          </p>
          <p>
            В прейскуранте есть несколько вариантов рентгенографии. Какой нужен,
            сколько потребуется снимков и нужна ли подготовка — уточняется после
            осмотра или по направлению.
          </p>
        </div>
        <ArticleServiceCard topic="movement" serviceKey="radiography" />
      </section>
    </>
  );
}

export function Article({ topic }) {
  const article = articles[topic];
  return (
    <ArticleCatalog>
      <article className={`longread longread-${topic}`}>
        <nav className="breadcrumb wrap" aria-label="Хлебные крошки">
          <a href="/">Главная</a>
          <span>/</span>
          <a href="/journal/articles">Журнал</a>
          <span>/</span>
          <span aria-current="page">
            {article.kicker.split(" · ")[0]}
          </span>
        </nav>
        <header className="article-hero wrap">
          <div className="article-hero-copy">
            <p className="eyebrow">{article.kicker}</p>
            <h1>{article.title}</h1>
            <p className="article-lead">{article.lead}</p>
            <div className="article-hero-actions">
              <a className="button" href={articleVisitHref(topic)}>
                {article.cta}
                <ArrowRight size={21} />
              </a>
              <a className="text-link" href="#explore-article">
                Исследовать
                <ArrowDown size={20} />
              </a>
            </div>
            <p className="article-meta">
              <BookOpen size={16} />
              {article.time} · Для владельцев собак и кошек
            </p>
          </div>
          <div className="article-hero-art">
            {article.diagram ? <SystemArt topic={topic} compact /> : <img
              src={`/assets/${article.image}.webp`}
              alt={
                article.imageAlt || (topic === "digestion"
                  ? "Мягкая иллюстрация пищеварительной системы собаки"
                  : "Иллюстрация мышечной системы собаки")
              }
              width="1536"
              height="1024"
              fetchPriority="high"
            />}
            <span>Понимать — значит заботиться</span>
          </div>
        </header>
        <div className="article-reading-nav wrap">
          <a href="#explore-article">Рассмотреть</a>
          <a href="#prepare-article">Подготовиться</a>
          <a href={articleVisitHref(topic)}>
            Записаться на приём
            <ArrowUpRight size={18} />
          </a>
        </div>
        {article.diagram ? <SystemStory topic={topic} /> : topic === "digestion" ? <DigestionBody /> : topic === "movement" ? <MovementBody /> : topic === "teeth" ? <TeethBody /> : topic === "skin" ? <SkinBody /> : <CheckupBody />}
        {topic === "checkup" && <CheckupPrograms />}
        <section className="wrap article-preparation" id="prepare-article">
          <ArticleChecklist topic={topic} />
        </section>
        <aside className="article-urgent wrap">
          <Phone size={24} />
          <div>
            <h3>Когда не стоит ждать</h3>
            <p>
              {article.urgent || (topic === "digestion"
                ? "Безрезультатные позывы к рвоте, заметное вздутие живота, резкая слабость или обморок — повод немедленно обратиться за ветеринарной помощью."
                : topic === "movement" ? "Сильная травма, внезапная невозможность стоять или ходить, потеря сознания — повод немедленно обратиться за ветеринарной помощью."
                : "Затруднённое дыхание, потеря сознания или сильная травма — повод немедленно обратиться за ветеринарной помощью.")}{" "}
              Позвоните в клинику сейчас. Не откладывайте обращение ради чтения
              статьи.
            </p>
            <a className="text-link" href={clinic.tel}>
              {clinic.phone}
              <ArrowUpRight size={20} />
            </a>
          </div>
        </aside>
        <section className="article-ending wrap">
          <div>
            <p className="eyebrow">Теперь — о вашем питомце</p>
            <h2>
              {article.ending || (topic === "digestion" ? (
                <>
                  Есть вопросы
                  <br />о пищеварении?
                </>
              ) : (
                <>
                  Движение изменилось?
                  <br />
                  Давайте разберёмся.
                </>
              ))}
            </h2>
            <p>
              Запишитесь на приём в TemichevVET. Начнём с ваших наблюдений,
              внимательно осмотрим питомца и обсудим дальнейшие шаги.
            </p>
            <a className="button light" href={articleVisitHref(topic)}>
              Записаться на приём
              <ArrowRight size={20} />
            </a>
            <span className="small">Заявка на сайте или по телефону · {clinic.address}</span>
          </div>
          <img
            src="/images/reception-real-640.webp"
            alt="Ресепшн клиники TemichevVET"
            loading="lazy"
          />
        </section>
        <section className="article-sources wrap">
          <p>
            Материал помогает разобраться в теме, но не заменяет осмотр и
            индивидуальные рекомендации ветеринарного врача. Иллюстрации
            художественные и не передают точные размеры внутренних структур.
          </p>
          <details>
            <summary>Источники и медицинская основа материала</summary>
            <ul>
              {article.sources.map(([title, url]) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {title}
                    <ArrowUpRight size={16} />
                  </a>
                </li>
              ))}
            </ul>
            <p>
              Источники проверены {article.diagram ? "17 октября" : "23 сентября"} 2026 года. Материал не содержит
              назначения лечения.
            </p>
          </details>
        </section>
        <section className="article-related wrap">
          <p className="eyebrow">Продолжим знакомство</p>
          <h2>Ещё одна история внутри.</h2>
          <ArticleCards omit={topic} />
          <a className="text-link" href="/services/dentistry">
            А как устроен зуб?
            <ArrowUpRight size={20} />
          </a>
        </section>
      </article>
    </ArticleCatalog>
  );
}
