import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight } from "@phosphor-icons/react";
import { ArticleServiceCard } from "./ArticleServices.jsx";
import { articlePath, articleServices, articleVisitHref } from "./articles-data.js";
import { systemCutaways } from "./system-cutaways.js";

export const systems = {
  heart: {
    label: "Четыре камеры сердца",
    instruction: "Найдите сердце у собаки, приблизьте и откройте его условную модель. Выбирайте камеры или клапаны справа — нужная область подсветится.",
    zoomLabels: ["Питомец целиком", "Область сердца", "Сердце ближе"],
    steps: [
      { name: "Правое предсердие", short: "Правое предсердие", text: "Сюда возвращается кровь от тела. Затем она направляется в правый желудочек.", shift: [-85, -72] },
      { name: "Правый желудочек", short: "Правый желудочек", text: "Эта камера направляет кровь к лёгким. На иллюстрации путь показан условно, без точных пропорций сосудов.", shift: [-108, 82] },
      { name: "Левое предсердие", short: "Левое предсердие", text: "Сюда поступает кровь из лёгких, после чего она проходит в левый желудочек.", shift: [92, -72] },
      { name: "Левый желудочек", short: "Левый желудочек", text: "Он направляет кровь по телу. Работу сердца оценивают на осмотре, а не по такой иллюстрации.", shift: [106, 82] },
    ],
    chapters: [
      { eyebrow: "Одна система, четыре камеры", title: "Работают не по отдельности.", paragraphs: ["В обычном сердце млекопитающего четыре камеры. Предсердия принимают кровь, желудочки помогают продвигать её дальше. Клапаны направляют поток между камерами и сосудами.", "В раскрытой модели можно выбрать камеру или клапан. Это условная учебная иллюстрация: по ней нельзя судить о размере сердца или состоянии клапанов конкретного животного."], service: "consultation" },
      { eyebrow: "Наблюдения дома", title: "Замечайте перемены, не угадывайте диагноз.", paragraphs: ["Если питомец стал быстрее уставать, необычно дышит после привычной нагрузки или пережил эпизод слабости, запишите, когда и в каких обстоятельствах это произошло.", "Похожие признаки встречаются при разных состояниях. Врач сопоставит рассказ, осмотр и при необходимости предложит дальнейшее обследование."], service: null },
    ],
    observations: [["В покое", "Обратите внимание, как питомец дышит и ведёт себя во сне или после отдыха."], ["При привычной активности", "Что стало даваться труднее: прогулка, игра, подъём по лестнице?"], ["На приёме", "Покажите прежние заключения и список лекарств; уточните, какие изменения требуют срочного звонка."]],
  },
  breathing: {
    label: "Путь воздуха в дыхательной системе",
    instruction: "Приблизьте грудную клетку и откройте модель дыхательных путей. Выберите трахею, бронхи, лёгкие или альвеолы.",
    zoomLabels: ["Питомец целиком", "Область лёгких", "Дыхание ближе"],
    steps: [
      { name: "Трахея", short: "Трахея", text: "После верхних дыхательных путей воздух проходит по трахее к бронхам.", shift: [0, -92] },
      { name: "Бронхи", short: "Бронхи", text: "Бронхи ветвятся внутри лёгких и проводят воздух дальше по дыхательным путям.", shift: [0, 72] },
      { name: "Лёгкие", short: "Лёгкие", text: "Лёгкие содержат разветвлённые дыхательные пути и множество мельчайших воздушных пространств.", shift: [-100, 12] },
      { name: "Альвеолы", short: "Альвеолы", text: "В альвеолах происходит обмен кислорода и углекислого газа. Кружки на модели — только условное увеличение.", shift: [104, 28] },
    ],
    chapters: [
      { eyebrow: "Вдох — это маршрут", title: "Не только лёгкие.", paragraphs: ["Воздух проходит через верхние дыхательные пути, трахею и ветви бронхов. В альвеолах кислород переходит в кровь, а углекислый газ выводится при выдохе.", "Иллюстрация показывает маршрут и позволяет приблизить область лёгких. Цвета не передают реальный вид тканей и не показывают заболевание."], service: "consultation" },
      { eyebrow: "Если дыхание изменилось", title: "Опишите, что видите.", paragraphs: ["Для врача полезно знать, есть ли кашель, необычные звуки, заметное усилие при вдохе или перемены в активности. Короткое видео дыхания в покое может дополнить ваш рассказ, если оно уже снято без стресса для питомца.", "Нужна ли рентгенография, какую область исследовать и сколько снимков сделать, решают после оценки животного. Не откладывайте срочную помощь ради записи видео."], service: "radiography" },
    ],
    observations: [["Когда", "Вспомните, когда впервые услышали кашель или заметили необычное дыхание."], ["В какой ситуации", "В покое, после игры, ночью или постоянно? Не создавайте нагрузку ради проверки."], ["Что ещё", "Расскажите о настроении, аппетите и всех уже назначенных препаратах."]],
  },
  urinary: {
    label: "Почки и мочевыводящие пути",
    instruction: "Приблизьте живот кошки, откройте модель и проследите путь от почек до мочевого пузыря и уретры.",
    zoomLabels: ["Кошка целиком", "Область живота", "Путь мочи ближе"],
    steps: [
      { name: "Почки", short: "Почки", text: "Почки образуют мочу и участвуют в поддержании внутреннего равновесия организма.", shift: [0, -70] },
      { name: "Мочеточники", short: "Мочеточники", text: "По двум мочеточникам моча поступает из почек в мочевой пузырь.", shift: [-104, 14] },
      { name: "Мочевой пузырь", short: "Мочевой пузырь", text: "Он накапливает мочу до мочеиспускания. По внешнему виду живота дома нельзя оценить, что происходит внутри.", shift: [78, 48] },
      { name: "Уретра", short: "Уретра", text: "Через уретру моча выводится наружу. Затруднение мочеиспускания требует внимания врача.", shift: [0, 86] },
    ],
    chapters: [
      { eyebrow: "Путь начинается выше", title: "Почки, трубки, резервуар.", paragraphs: ["Почки образуют мочу, мочеточники проводят её в мочевой пузырь, а затем она выходит через уретру. Приближение помогает увидеть общий маршрут; назначение каждого отдела раскрывается по кнопке.", "Иллюстрация не показывает причины частых позывов, болезненности или изменений количества мочи: одинаковые наблюдения могут иметь разное объяснение."], service: "consultation" },
      { eyebrow: "Исследования по вопросу", title: "Сначала понять, что изменилось.", paragraphs: ["Запишите, как часто питомец мочится и пьёт, есть ли дискомфорт или безрезультатные попытки. Сохраните прежние анализы и заключения, если они есть.", "После осмотра врач решит, нужны ли лабораторные исследования или УЗИ брюшной полости, и объяснит подготовку. Это отдельные услуги, а не обязательный набор для каждого животного."], service: "ultrasound", otherService: "laboratory" },
    ],
    observations: [["Вода", "Замечайте изменение привычного питья, не ограничивая доступ к воде самостоятельно."], ["Лоток или прогулка", "Запишите частоту, длительность и наличие безрезультатных попыток."], ["Раньше и сейчас", "Сравните с обычными привычками именно этого питомца; возьмите прошлые результаты."]],
  },
  ear: {
    label: "Наружное, среднее и внутреннее ухо",
    instruction: "Приблизьте ухо кошки и раскройте модель: от ушной раковины и прохода к среднему и внутреннему уху.",
    zoomLabels: ["Кошка целиком", "Область уха", "Ухо ближе"],
    steps: [
      { name: "Ушная раковина", short: "Ушная раковина", text: "Видимая наружная часть помогает улавливать звук. Форма различается у пород и отдельных животных.", shift: [-100, -52] },
      { name: "Слуховой проход", short: "Слуховой проход", text: "По наружному слуховому проходу звук идёт к барабанной перепонке.", shift: [-54, 70] },
      { name: "Среднее ухо", short: "Среднее ухо", text: "За барабанной перепонкой находится среднее ухо со слуховыми косточками, передающими колебания дальше.", shift: [75, -42] },
      { name: "Внутреннее ухо", short: "Внутреннее ухо", text: "Внутреннее ухо участвует в слухе и чувстве равновесия. Форма на иллюстрации условна, не анатомический снимок.", shift: [108, 64] },
    ],
    chapters: [
      { eyebrow: "Слышать и держать равновесие", title: "Видимая часть — только начало.", paragraphs: ["Наружное ухо собирает звук, барабанная перепонка и структуры среднего уха передают колебания, а внутреннее ухо участвует в восприятии звука и равновесии.", "Приближение помогает рассмотреть отделы, но не передаёт их точные размеры. По такой иллюстрации нельзя определить, в каком именно отделе у питомца проблема."], service: "consultation" },
      { eyebrow: "Уход без догадок", title: "Сначала осмотр, потом средства.", paragraphs: ["Расскажите врачу, если питомец трясёт головой, чешет ухо, появилась болезненность, запах или выделения. Важны также прежние случаи и всё, что уже капали или чистили.", "Не вводите предметы глубоко в ухо и не применяйте новые капли наугад: выбор средства зависит от состояния уха и осмотра."], service: null },
    ],
    observations: [["Движения", "Трясёт ли питомец головой или склоняет её на одну сторону?"], ["Внешний вид", "Когда появились покраснение, выделения, необычный запах или болезненность?"], ["Что уже делали", "Запишите названия средств и даты применения, чтобы показать врачу."]],
  },
};

const systemMedia = {
  heart: { path: "/assets/story-heart-dog.webp", focus: [.34, .46], alt: "Учебная иллюстрация собаки с видимой областью сердца" },
  breathing: { path: "/assets/story-breathing-dog.webp", focus: [.36, .46], alt: "Учебная иллюстрация собаки с видимыми дыхательными путями и лёгкими" },
  urinary: { path: "/assets/story-urinary-cat.webp", focus: [.52, .47], alt: "Учебная иллюстрация кошки с видимыми почками и мочевым пузырём" },
  ear: { path: "/assets/story-ear-cat.webp", focus: [.57, .39], alt: "Учебная иллюстрация кошки с увеличенным изображением уха" },
};

export function SystemArt({ topic, stage = 0, compact = false, opened = false, active = 0, mode = "parts", onSelect }) {
  const media = systemMedia[topic];
  const cutaway = systemCutaways[topic];
  const items = mode === "valves" && cutaway.valves ? cutaway.valves : cutaway.items;
  const labels = mode === "valves" && cutaway.valves ? cutaway.valves : systems[topic].steps;
  const isOpen = !compact && stage === 2 && opened;
  const scale = stage === 2 ? 2.2 : stage === 1 ? 1.45 : 1;
  const travel = (scale - 1) / 1.2;
  const imageStyle = compact ? undefined : {
    transformOrigin: `${media.focus[0] * 100}% ${media.focus[1] * 100}%`,
    transform: `translate(${((.5 - media.focus[0]) * travel * 100).toFixed(1)}%, ${((.5 - media.focus[1]) * travel * 100).toFixed(1)}%) scale(${scale})`,
  };
  return <div className={`system-art system-art-${topic}${compact ? " is-compact" : ""}`} data-stage={stage} data-opened={isOpen}>
    <img className="system-art-base" src={media.path} alt={media.alt} loading={compact ? "lazy" : "eager"} style={imageStyle} draggable="false" />
    {!compact && <div className="system-cutaway" aria-hidden={!isOpen} inert={!isOpen}>
      <div className="system-cutaway-head"><span>Модель изнутри</span><strong>{String(active + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")} · {labels[active].name}</strong></div>
      <div className="system-cutaway-model" style={{ aspectRatio: cutaway.aspect }}>
        <img src={cutaway.image} alt="" draggable="false" loading="lazy" />
        {items.map((item, i) => <div key={labels[i].name} className="system-cutaway-area">
          {i === active && item.points.map(([x, y], index) => <span key={index} className="system-cutaway-glow" style={{ left: `${x}%`, top: `${y}%`, width: `${item.size}%`, height: `${item.size}%` }} />)}
          <button type="button" className={`system-cutaway-hotspot${i === active ? " is-active" : ""}`} style={{ left: `${item.points[0][0]}%`, top: `${item.points[0][1]}%` }} aria-label={`Показать: ${labels[i].name}`} aria-pressed={i === active} tabIndex={isOpen ? 0 : -1} onClick={() => onSelect?.(i)}>{String(i + 1).padStart(2, "0")}</button>
        </div>)}
      </div>
    </div>}
    {!compact && <span className="system-art-caption">{String(stage + 1).padStart(2, "0")} / 03 · {isOpen ? cutaway.openLabel : systems[topic].zoomLabels[stage]}</span>}
  </div>;
}

function SystemExplorer({ topic }) {
  const system = systems[topic];
  const root = useRef(null);
  const manual = useRef(false);
  const [stage, setStage] = useState(0);
  const [active, setActive] = useState(0);
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState("parts");
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (manual.current || !root.current || document.documentElement.dataset.motion === "off") return;
      const box = root.current.getBoundingClientRect();
      const distance = Math.max(220, Math.min(520, box.width * .48));
      const progress = Math.max(0, Math.min(1, (innerHeight * .78 - box.top) / distance));
      setStage(progress > .78 ? 2 : progress > .24 ? 1 : 0);
      setOpened(progress > .93);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame); };
  }, []);
  const select = (i) => { setActive(i); setStage(2); setOpened(true); manual.current = true; };
  const cutaway = systemCutaways[topic];
  const isValves = topic === "heart" && mode === "valves";
  const items = isValves ? cutaway.valves : system.steps;
  return <section ref={root} id="explore-article" className="system-explorer wrap" aria-label={system.label}>
    <div className="article-section-heading"><div><p className="eyebrow">Посмотрите ближе</p><h2>От питомца —<br/>к детали.</h2></div><p>{system.instruction}</p></div>
    <div className="system-explorer-layout">
      <div className="system-explorer-visual">
        <SystemArt topic={topic} stage={stage} opened={opened} active={active} mode={mode} onSelect={select}/>
        <div className="system-zoom-control" role="group" aria-label="Масштаб иллюстрации">
          {system.zoomLabels.map((label, i) => <button key={label} type="button" aria-pressed={stage === i} onClick={() => { manual.current = true; setStage(i); setOpened(false); }}><span>0{i + 1}</span>{label}</button>)}
        </div>
        <button type="button" className="system-open-control" aria-pressed={opened && stage === 2} onClick={() => { manual.current = true; setStage(2); setOpened((value) => !value); }}>{opened && stage === 2 ? "Закрыть модель" : `Открыть ${topic === "heart" ? "сердце" : topic === "breathing" ? "лёгкие" : topic === "urinary" ? "мочевыводящую систему" : "ухо"} изнутри`} <ArrowUpRight size={20}/></button>
        <p className="experience-note">Учебная иллюстрация, не диагностическое изображение. Цвета, размеры и расположение внутренних частей условны.{topic === "heart" ? " Правая и левая стороны названы со стороны животного." : ""}</p>
      </div>
      <div className="system-parts-panel">
        <p className="eyebrow">{topic === "heart" ? "Внутри сердца" : "Части системы"}</p>
        {topic === "heart" && <div className="system-part-tabs" role="group" aria-label="Что рассмотреть в сердце"><button type="button" aria-pressed={!isValves} onClick={() => { setMode("parts"); setActive(0); setOpened(true); setStage(2); manual.current = true; }}>Камеры</button><button type="button" aria-pressed={isValves} onClick={() => { setMode("valves"); setActive(0); setOpened(true); setStage(2); manual.current = true; }}>Клапаны</button></div>}
        {items.map((step, i) => <button type="button" key={step.name} aria-pressed={active === i} onClick={() => select(i)}><span>0{i + 1}</span><strong>{step.name}</strong><ArrowUpRight size={17}/></button>)}
        <div key={`${mode}-${active}`} className="system-part-detail" aria-live="polite"><span>0{active + 1} / {String(items.length).padStart(2, "0")}</span><h3>{items[active].name}</h3><p>{items[active].text}</p></div>
        <div className="system-help-actions" aria-label="Связаться с клиникой">
          <button type="button" onClick={() => window.dispatchEvent(new Event("clinic-open-chat"))}>Задать вопрос в чате <ArrowUpRight size={16}/></button>
          <button type="button" onClick={() => window.dispatchEvent(new Event("clinic-open-offers"))}>Акции клиники <ArrowUpRight size={16}/></button>
        </div>
      </div>
    </div>
  </section>;
}

export function SystemStory({ topic }) {
  const system = systems[topic];
  return <>
    <SystemExplorer topic={topic}/>
    {system.chapters.map((chapter, i) => <section key={chapter.title} className="article-editorial wrap"><div className="article-prose"><p className="eyebrow">{chapter.eyebrow}</p><h2>{chapter.title}</h2>{chapter.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{chapter.otherService && <a className="text-link" href={articleServices[chapter.otherService].path}>{articleServices[chapter.otherService].title} <ArrowRight size={19}/></a>}{i === 1 && <a className="text-link" href={articleVisitHref(topic)}>Обсудить с врачом <ArrowRight size={19}/></a>}</div>{chapter.service && <ArticleServiceCard topic={topic} serviceKey={chapter.service} compact/>}</section>)}
    <section className="article-observation-cards wrap" aria-label="Что заметить дома">{system.observations.map(([title, copy], i) => <div key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{copy}</p></div>)}</section>
    <section className="system-clinic-bridge wrap"><div><p className="eyebrow">От иллюстрации — к вашему питомцу</p><h2>Решение начинается с осмотра.</h2><p>Иллюстрация помогает задавать вопросы, но не выбирает исследование и лечение. Расскажите врачу, что изменилось; дальнейший план составят для конкретного животного.</p><a className="text-link" href={articleVisitHref(topic)}>Записаться на приём <ArrowUpRight size={20}/></a></div><figure><img src={topic === "urinary" ? "/images/ultrasound-real-1280.webp" : "/images/reception-real-1280.webp"} alt={topic === "urinary" ? "Кабинет УЗИ клиники TemichevVET" : "Ресепшн клиники TemichevVET"} loading="lazy"/><figcaption>Реальная фотография клиники TemichevVET</figcaption></figure></section>
    <nav className="system-story-links wrap" aria-label="Другие интерактивные истории"><p className="eyebrow">Продолжить исследование</p>{Object.entries(systems).filter(([key]) => key !== topic).map(([key, value]) => <a key={key} href={articlePath(key)}>{value.label}<ArrowUpRight size={18}/></a>)}</nav>
  </>;
}
