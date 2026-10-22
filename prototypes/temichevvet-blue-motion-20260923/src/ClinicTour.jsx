import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Lightbulb,
  Phone,
  MapPin,
  Plus,
  X,
} from "@phosphor-icons/react";
import { clinic } from "./content.js";
import { clamp } from "./motion-math.js";

const rooms = [
  {
    title: "Ресепшн",
    image: "reception-real",
    line: "Первое знакомство.",
    text: "Место, где начинается визит. Администратор поможет с записью и подскажет, куда пройти.",
    detail: "Зона ожидания и стойка администратора на Каспарова, 27/2.",
    link: "/visit",
    label: "Спланировать визит",
  },
  {
    title: "Кабинет УЗИ",
    image: "ultrasound-real",
    line: "Увидеть больше.",
    text: "Здесь проводят ультразвуковые исследования. Какие обследования нужны питомцу, врач обсудит после осмотра.",
    detail:
      "Подготовка зависит от исследования — уточните её заранее при записи.",
    link: "/services/diagnostics",
    label: "Об обследованиях",
  },
  {
    title: "Лаборатория",
    image: "laboratory-real",
    line: "Внимание к деталям.",
    text: "Собственная лаборатория клиники. Результаты исследований помогают врачу дополнить картину состояния питомца.",
    detail:
      "Стоимость, подготовку и срок готовности конкретного анализа можно уточнить до визита.",
    link: "/services/laboratory",
    label: "О лаборатории",
  },
  {
    title: "Стационар",
    image: "inpatient-noninfectious-real",
    line: "Забота продолжается.",
    text: "Если питомцу нужно остаться под наблюдением. На фотографии — неинфекционный стационар клиники.",
    detail: "До приезда уточните наличие места и обсудите с врачом план ухода.",
    link: "/services/inpatient",
    label: "О стационаре",
  },
  {
    title: "Запись",
    image: "reception-real",
    line: "А теперь — лично.",
    text: "Вы уже немного знакомы с нами. Расскажите администратору о питомце — вместе выберем время приёма.",
    detail: "Ночью, с 20:00 до 09:00, перед приездом обязательно позвоните.",
    link: "/visit",
    label: "Подготовиться к приёму",
  },
];

export function ClinicTour() {
  const [room, setRoom] = useState(0),
    [light, setLight] = useState(false),
    [detail, setDetail] = useState(false);
  const track = useRef(null),
    stage = useRef(null),
    manual = useRef(false),
    currentRoom = useRef(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (
        manual.current ||
        (innerWidth > 700 && innerWidth < 900) ||
        (innerWidth <= 700 && innerHeight <= 620) ||
        document.documentElement.dataset.motion === "off"
      )
        return;
      const box = track.current.getBoundingClientRect();
      const length = track.current.offsetHeight - stage.current.offsetHeight;
      const stickyTop = parseFloat(getComputedStyle(stage.current).top) || 0;
      const progress = clamp((stickyTop - box.top) / Math.max(length, 1));
      const next = Math.round(progress * (rooms.length - 1));
      if (currentRoom.current !== next) {
        currentRoom.current = next;
        setRoom(next);
        setDetail(false);
      }
      track.current.style.setProperty("--tour-progress", progress);
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    queue();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
    };
  }, []);
  function choose(index) {
    const next = clamp(index, 0, rooms.length - 1);
    currentRoom.current = next;
    setRoom(next);
    setDetail(false);
    if (
      innerWidth >= 900 &&
      document.documentElement.dataset.motion !== "off"
    ) {
      const stickyTop = parseFloat(getComputedStyle(stage.current).top) || 0;
      const top =
        track.current.getBoundingClientRect().top + scrollY - stickyTop;
      const length = track.current.offsetHeight - stage.current.offsetHeight;
      window.scrollTo({
        top: top + (length * next) / (rooms.length - 1),
        behavior: "instant",
      });
    } else {
      manual.current = true;
      track.current.dataset.manual = "true";
      const photo = track.current.querySelector(".tour-window");
      const header = document.querySelector(".header")?.offsetHeight || 90;
      if (photo.getBoundingClientRect().top < header)
        window.scrollTo({
          top: scrollY + photo.getBoundingClientRect().top - header - 15,
          behavior:
            document.documentElement.dataset.motion === "off"
              ? "instant"
              : "smooth",
        });
    }
  }
  const current = rooms[room];
  return (
    <section
      id="clinic-tour"
      className="clinic-tour"
      ref={track}
      aria-label="Фотопрогулка по клинике"
    >
      <div className="tour-stage" ref={stage}>
        <div className="tour-heading wrap">
          <p className="eyebrow">Загляните к нам</p>
          <h2>Уже как знакомые.</h2>
          <p>Фотопрогулка по нашей клинике</p>
        </div>
        <div className="tour-layout wrap">
          <div className="tour-copy">
            <span className="tour-count">
              0{room + 1}
              <span> / 05</span>
            </span>
            <div
              key={room}
              className="tour-text"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="eyebrow">{current.title}</p>
              <h3>{current.line}</h3>
              <p>{current.text}</p>
            </div>
            {room === 4 ? (
              <a className="button light" href={clinic.tel}>
                <Phone size={19} />
                Позвонить в клинику
              </a>
            ) : (
              <button className="button light" onClick={() => choose(room + 1)}>
                Пройдём дальше
                <ArrowRight size={22} />
              </button>
            )}
            <a className="tour-link" href={current.link}>
              {current.label}
              <ArrowUpRight size={19} />
            </a>
            <div className="tour-navigation" aria-label="Помещения клиники">
              {rooms.map((r, i) => (
                <button
                  key={r.title}
                  onClick={() => choose(i)}
                  aria-current={room === i ? "step" : undefined}
                  aria-label={`Открыть: ${r.title}`}
                  title={r.title}
                >
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <span className="tour-stop-label">{r.title}</span>
                </button>
              ))}
            </div>
            <p className="tour-scroll-note">
              Листайте страницу или выбирайте комнату
            </p>
          </div>
          <div
            className={`tour-window ${light ? "light-on" : ""} ${room === 4 ? "at-reception" : ""}`}
            onPointerMove={(event) => {
              if (
                event.pointerType === "touch" ||
                document.documentElement.dataset.motion === "off"
              )
                return;
              const rect = event.currentTarget.getBoundingClientRect();
              event.currentTarget.style.setProperty(
                "--light-x",
                `${((event.clientX - rect.left) / rect.width) * 100}%`,
              );
              event.currentTarget.style.setProperty(
                "--light-y",
                `${((event.clientY - rect.top) / rect.height) * 100}%`,
              );
            }}
          >
            {rooms.map((r, i) => (
              <img
                key={r.title}
                className={`tour-photo ${room === i ? "current" : ""} ${i < room ? "passed" : ""}`}
                src={`/images/${r.image}-1280.webp`}
                srcSet={`/images/${r.image}-640.webp 640w, /images/${r.image}-1280.webp 1280w`}
                sizes="(max-width: 760px) 100vw, 65vw"
                width="1280"
                height="960"
                alt={room === i ? r.title + " — фотография клиники" : ""}
                aria-hidden={room !== i}
                loading="lazy"
              />
            ))}
            <div className="tour-light" aria-hidden="true" />
            <div className="tour-window-top">
              <span>
                <MapPin size={15} />
                Каспарова, 27/2
              </span>
              <button
                onClick={() => setLight(!light)}
                aria-pressed={light}
                aria-label={
                  light
                    ? "Выключить подсветку деталей"
                    : "Включить подсветку деталей"
                }
                title="Подсветить детали"
              >
                <Lightbulb size={21} weight={light ? "fill" : "regular"} />
              </button>
            </div>
            <button
              className="tour-hotspot"
              onClick={() => setDetail(!detail)}
              aria-expanded={detail}
              aria-controls="tour-room-detail"
              aria-label={
                detail ? "Закрыть описание помещения" : "Рассмотреть помещение"
              }
            >
              {detail ? <X size={22} /> : <Plus size={22} />}
            </button>
            {detail && (
              <div id="tour-room-detail" className="tour-detail">
                <strong>{current.title}</strong>
                <p>{current.detail}</p>
              </div>
            )}
            <div className="tour-window-bottom">
              <span>{current.title}</span>
              <button onClick={() => choose(room === 4 ? 0 : 4)}>
                {room === 4 ? "Начать прогулку" : "К ресепшну"}
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
