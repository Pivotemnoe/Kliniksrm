import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowsOut,
  ArrowsIn,
  ArrowUpRight,
} from "@phosphor-icons/react";
import { clamp } from "./motion-math.js";

const models = {
  tooth: {
    eyebrow: "Один зуб. Три разных слоя.",
    title: (
      <>
        Разобрать.
        <br />
        Понять. Собрать.
      </>
    ),
    description:
      "Передвиньте ползунок или выберите деталь. Зуб раскроется на отдельные слои и соберётся обратно.",
    base: "tooth-exterior",
    label: "Разобрать зуб на слои",
    note: "Учебная иллюстрация клыка собаки: показаны три основных компонента. Полное строение сложнее, а состояние зубов питомца оценивает врач.",
    href: "/visit",
    cta: "Записаться на осмотр зубов",
    parts: [
      {
        id: "enamel",
        name: "Эмаль",
        image: "tooth-layer-enamel",
        text: "Твёрдая наружная оболочка коронки. Она покрывает часть зуба над десной; на корне эмали нет.",
      },
      {
        id: "dentin",
        name: "Дентин",
        image: "tooth-layer-dentin",
        text: "Основной объём зуба. В этой схеме корпус раскрыт, чтобы показать полость и канал, в которых располагается пульпа.",
      },
      {
        id: "pulp",
        name: "Пульпа",
        image: "tooth-layer-pulp",
        text: "Мягкая ткань с сосудами и нервами внутри зуба. Продолжается из полости коронки в канал корня.",
      },
    ],
  },
  digestion: {
    eyebrow: "Посмотреть на части целого",
    title: (
      <>
        Одна история.
        <br />
        Разные задачи.
      </>
    ),
    description:
      "Раздвиньте модель, чтобы рассмотреть отдельные участки пути пищи. Затем соберите её обратно.",
    base: "digestive-dog",
    label: "Разобрать пищеварительную систему",
    note: "Схематические иллюстрации. Размеры деталей и их взаимное положение условны; показана только часть пищеварительной системы.",
    href: "/visit?topic=digestion&service=consultation",
    cta: "Обсудить пищеварение с врачом",
    parts: [
      {
        id: "stomach",
        name: "Желудок",
        image: "digestive-stomach",
        text: "Перемешивает и обрабатывает пищу перед её переходом в тонкую кишку. Желудок — отдельный орган, не отдел кишечника.",
      },
      {
        id: "small",
        name: "Тонкая кишка",
        departments: "Двенадцатиперстная · тощая · подвздошная",
        image: "digestive-small-intestine",
        text: "Состоит из двенадцатиперстной, тощей и подвздошной кишки. Здесь происходит основная часть усвоения питательных веществ.",
      },
      {
        id: "large",
        name: "Толстая кишка",
        departments: "Слепая · ободочная · прямая",
        image: "digestive-large-intestine",
        text: "Включает слепую, ободочную и прямую кишку. Здесь продолжается всасывание воды и формирование кала.",
      },
    ],
  },
};

export function ExplodedAnatomy({ type = "tooth", bookingHref }) {
  const model = models[type],
    section = useRef(null);
  const [spread, setSpread] = useState(0),
    [part, setPart] = useState(1),
    [manual, setManual] = useState(false);
  useEffect(() => {
    if (manual) return;
    let frame = 0;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      frame = 0;
      if (
        reduced.matches ||
        document.documentElement.dataset.motion === "off"
      )
        return;
      const top =
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue(
            "--site-header",
          ),
        ) || 112;
      const rect = section.current.getBoundingClientRect();
      const mobile = innerWidth < 900;
      setSpread(
        Math.round(
          clamp(
            mobile
              ? (innerHeight * 0.72 - rect.top) /
                  Math.max(240, rect.height - innerHeight * 0.35)
              : (top + 60 - rect.top) /
                  Math.max(300, rect.height - innerHeight * 0.8),
          ) * 100,
        ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    return () => {
      window.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [manual]);
  const set = (value) => {
    setManual(true);
    setSpread(value);
  };
  return (
    <section
      className={`exploded-section exploded-${type} wrap`}
      ref={section}
      id={`${type}-exploded`}
      aria-label={
        type === "tooth"
          ? "Зуб, разбор на слои"
          : "Пищеварение, отдельные органы"
      }
    >
      <div className="exploded-sticky">
        <div className="exploded-heading">
          <div>
            <p className="eyebrow">{model.eyebrow}</p>
            <h2>{model.title}</h2>
          </div>
          <p>{model.description}</p>
        </div>
        <div className="exploded-layout">
          <div
            className="exploded-display"
            style={{ "--spread": spread / 100 }}
          >
            <div className="exploded-scene" data-spread={spread}>
              <img
                className="exploded-base"
                src={`/assets/${model.base}.webp`}
                alt=""
                aria-hidden="true"
                loading="lazy"
              />
              {model.parts.map((item, i) => (
                <img
                  key={item.id}
                  className={`exploded-part part-${item.id} ${i === part ? "selected" : ""}`}
                  src={`/assets/${item.image}.webp`}
                  alt={item.name}
                  loading="lazy"
                  width="1254"
                  height="1254"
                />
              ))}
              <div className={`anatomy-callouts ${spread >= 45 ? "visible" : ""}`} aria-hidden={spread < 45} inert={spread < 45 ? true : undefined}>
                {model.parts.map((item, i) => (
                  <button key={item.id} className={`anatomy-callout callout-${item.id}`} aria-pressed={part === i}
                    onClick={() => { setPart(i); set(100); }}>
                    <strong>{item.name}</strong>
                    {item.departments && <span>{item.departments}</span>}
                  </button>
                ))}
              </div>
              <span className="exploded-state">
                {spread < 10
                  ? "Вместе"
                  : spread > 85
                    ? "По отдельности"
                    : "Раскрываем детали"}
              </span>
            </div>
            <div className="exploded-controls">
              <div className="view-switch">
                <button aria-pressed={spread === 0} onClick={() => set(0)}>
                  <ArrowsIn size={17} />
                  Собрать
                </button>
                <button aria-pressed={spread === 100} onClick={() => set(100)}>
                  <ArrowsOut size={17} />
                  Разобрать
                </button>
              </div>
              <label>
                <span className="sr-only">{model.label}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={spread}
                  aria-label={model.label}
                  onChange={(e) => set(Number(e.target.value))}
                />
              </label>
            </div>
          </div>
          <div className="exploded-notes">
            {model.parts.map((item, i) => (
              <button
                key={item.id}
                className={part === i ? "selected" : ""}
                aria-expanded={part === i}
                onClick={() => {
                  setPart(i);
                  set(100);
                }}
              >
                <span>0{i + 1}</span>
                <strong>{item.name}</strong>
                <ArrowUpRight size={19} />
                {part === i && <p>{item.text}</p>}
              </button>
            ))}
            <p className="experience-note">{model.note}</p>
            <a className="text-link" href={bookingHref || model.href}>
              {model.cta}
              <ArrowRight size={20} />
            </a>
          </div>
        </div>
        {type === "tooth" && (
          <p className="experience-source">
            О строении зуба:{" "}
            <a
              href="https://www.merckvetmanual.com/digestive-system/dental-development-and-anatomy/dentition-and-dental-nomenclature-of-animals"
              target="_blank"
              rel="noopener noreferrer"
            >
              MSD / Merck Veterinary Manual
            </a>
            .
          </p>
        )}
      </div>
    </section>
  );
}

export function IntestineScale() {
  const [part, setPart] = useState(0);
  const parts = [
    [
      "Двенадцатиперстная",
      "Первый участок тонкой кишки после желудка. Сюда поступают желчь и секрет поджелудочной железы, участвующие в обработке пищи.",
    ],
    [
      "Тощая",
      "Средняя и обычно самая длинная часть тонкой кишки. Множество петель позволяет разместить длинный путь внутри живота.",
    ],
    [
      "Подвздошная",
      "Конечная часть тонкой кишки перед переходом к толстой. Отдельный участок одного непрерывного пути, а не самостоятельный орган.",
    ],
  ];
  return (
    <section className="intestine-scale wrap">
      <div>
        <p className="eyebrow">Масштаб, который удивляет</p>
        <h2>
          Несколько метров.
          <br />
          Внутри одного питомца.
        </h2>
        <p>
          В учебном материале Colorado State University приведён пример: около 6
          метров тонкой кишки у крупной собаки. Это ориентир масштаба, а не
          норма для любого размера или породы.
        </p>
        <a
          href="https://vivo.colostate.edu/hbooks/pathphys/digestion/smallgut/anatomy.html"
          target="_blank"
          rel="noopener noreferrer"
          className="text-link"
        >
          Откуда эта цифра
          <ArrowUpRight size={17} />
        </a>
      </div>
      <div className="intestine-facts">
        <strong className="intestine-number">
          ≈ 6<span>м</span>
        </strong>
        <p>Тонкая кишка крупной собаки · учебный пример</p>
        <div
          className="intestine-section-buttons"
          aria-label="Три отдела тонкой кишки"
        >
          {parts.map(([title], i) => (
            <button
              aria-pressed={part === i}
              key={title}
              onClick={() => setPart(i)}
            >
              <span>0{i + 1}</span>
              {title}
            </button>
          ))}
        </div>
        <p className="intestine-part-copy" aria-live="polite">
          {parts[part][1]}
        </p>
      </div>
    </section>
  );
}
