import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowsOut, X } from "@phosphor-icons/react";

const photo = (id, title, kind = "portrait", description = "Портрет после ухода.") => ({
  id, title, kind, description,
  image: `/assets/works-20261021/${id}.jpg`,
  thumb: `/assets/works-20261021/${id}-thumb.jpg`,
});

export const WORKS = [
  photo("48887916955", "Маленькие перемены. Большая разница.", "before-after", "До ухода — слева. После стрижки — справа."),
  photo("48887917467", "Йоркширский терьер", "before-after", "До стрижки — сверху. После — снизу."),
  photo("48887917723", "Пекинес", "before-after", "До стрижки — слева. После — справа."),
  photo("48887919003", "Внимание к каждому волоску", "before-after", "До ухода — слева. После — справа."),
  photo("48887917211", "Новый силуэт", "before-after", "До стрижки — слева. После — справа."),
  photo("48888777883", "Уход за густой шерстью", "before-after", "До ухода — сверху. После — снизу."),
  photo("48887916187", "В руках грумера", "before-after", "Знакомство с мастером и готовый образ — в одной истории."),
  photo("48887916443", "Всё внимание — деталям"),
  photo("48887916699", "Характер в каждом образе"),
  photo("48888338587", "Мягкость и объём"),
  photo("48887918235", "Спокойный момент"),
  photo("48888338331", "Естественная красота"),
  photo("48888778139", "Немецкая овчарка"),
  photo("48887917979", "Наш гость", "portrait", "Ещё один портрет из альбома салона."),
  photo("48887918747", "Аккуратный силуэт"),
  photo("48887918491", "Большой характер"),
  photo("48888777627", "Чау-чау"),
];

function FullPhoto({ item, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current.showModal();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <dialog ref={ref} className="work-lightbox" aria-label={item.title} onCancel={onClose} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="work-lightbox-head"><span>{item.title}</span><button className="icon-button" onClick={onClose} aria-label="Закрыть фотографию"><X size={25}/></button></div>
    <img src={item.image} alt={`${item.title}. ${item.description}`}/>
    <p>{item.description}</p>
  </dialog>;
}

export function OurWorks() {
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(WORKS[0].id);
  const [zoom, setZoom] = useState(false);
  const thumbs = useRef(null);
  const items = WORKS.filter(item => filter === "all" || item.kind === filter);
  const item = items.find(item => item.id === selected) || items[0];
  const index = items.indexOf(item);
  useEffect(() => {
    // Keep the active thumb visible inside its rail without moving the page.
    const rail = thumbs.current, active = rail?.querySelector('[aria-pressed="true"]');
    if (!active) return;
    if (active.offsetLeft < rail.scrollLeft) rail.scrollLeft = active.offsetLeft;
    else if (active.offsetLeft + active.offsetWidth > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = active.offsetLeft + active.offsetWidth - rail.clientWidth;
  }, [item.id]);
  const move = direction => setSelected(items[(index + direction + items.length) % items.length].id);
  return <section className="our-works section" id="works" aria-labelledby="works-title">
    <div className="section-heading reveal"><div><p className="eyebrow">НАШИ РАБОТЫ</p><h2 id="works-title">Наши работы<br/>в деталях.</h2></div><p>Сравните фотографии до и после ухода.<br/>Любой снимок можно открыть целиком.</p></div>
    <div className="works-filters" role="group" aria-label="Фотографии работ">
      {[["all", "Все работы", 17], ["before-after", "До / после", 7], ["portrait", "Портреты", 10]].map(([value, label, count]) => <button key={value} aria-pressed={filter === value} onClick={() => { setFilter(value); setSelected(WORKS.find(item => value === "all" || item.kind === value).id); }}>{label}<span>{count}</span></button>)}
    </div>
    <div className="work-stage">
      <div className="work-story"><span className="work-counter">{String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span><div aria-live="polite" aria-atomic="true"><p className="eyebrow">{item.kind === "before-after" ? "ДО / ПОСЛЕ" : "ПОРТРЕТ"}</p><h3>{item.title}</h3><p>{item.description}</p></div><div className="work-controls"><button className="icon-button" aria-label="Предыдущая работа" onClick={() => move(-1)}><ArrowLeft size={26}/></button><button className="icon-button" aria-label="Следующая работа" onClick={() => move(1)}><ArrowRight size={26}/></button></div></div>
      <button className="work-photo" onClick={() => setZoom(true)} aria-label={`Увеличить: ${item.title}`}><img key={item.id} src={item.image} alt={`${item.title}. ${item.description}`} loading="lazy"/><span className="work-enlarge"><ArrowsOut size={20}/>Смотреть ближе</span></button>
    </div>
    <div className="work-thumbs" ref={thumbs} aria-label="Выбрать работу">{items.map((entry, i) => <button key={entry.id} className="work-thumb" aria-pressed={item.id === entry.id} aria-label={`${i + 1}. ${entry.title}`} onClick={() => setSelected(entry.id)}><img src={entry.thumb} alt="" loading="lazy"/><span>{String(i + 1).padStart(2, "0")}</span></button>)}</div>
    {zoom && <FullPhoto item={item} onClose={() => setZoom(false)}/>}
  </section>;
}
