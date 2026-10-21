import { useEffect, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react";

export const HOTEL_URL = "https://pet.temichevvet.ru/pet-hotel/";
const rubles = value => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);

export function HotelTeaser() {
  const [catalog, setCatalog] = useState(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const response = await fetch("/v1/public/pet-hotel/catalog", { cache: "no-store", signal: AbortSignal.timeout(6000) });
        if (!response.ok) throw Error();
        const data = await response.json();
        if (live) setCatalog(data.connected && data.fresh === true ? data : null);
      } catch { if (live) setCatalog(null); }
    };
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 60000);
    return () => { live = false; clearInterval(timer); };
  }, []);
  const rates = (catalog?.rooms || []).filter(room => room.isActive).map(room => Number(room.dailyRate)).filter(rate => Number.isFinite(rate) && rate > 0);
  const rate = rates.length ? Math.min(...rates) : null;
  const walkRate = Number(catalog?.settings?.walkRate);
  return <section className="hotel-teaser" id="hotel" aria-labelledby="hotel-title">
    <a className="hotel-teaser-image" href={HOTEL_URL + "#rooms"} aria-label="Посмотреть номера зоогостиницы"><img src="/assets/works-20261021/hotel-room.jpg" alt="Настоящий номер нашей зоогостиницы с полкой и прозрачной дверью" loading="lazy"/><span>ЗАГЛЯНУТЬ ВНУТРЬ <ArrowUpRight size={28}/></span></a>
    <div className="hotel-teaser-copy"><p className="eyebrow">В НАШЕЙ КЛИНИКЕ · ЗООГОСТИНИЦА</p><h2 id="hotel-title">Вы — в поездке.<br/><span>Питомец — у нас.</span></h2><p className="hotel-teaser-description">Номера для кошек и собак до 10 кг.<br/>Знакомое место, когда нужно побыть порознь.</p><dl className="hotel-teaser-facts"><div><dt>Проживание</dt><dd>{rate ? <>от {rubles(rate)} ₽ <small>/ сутки</small></> : "От 2 суток"}</dd></div><div><dt>Заселение</dt><dd>09:00–18:00</dd></div></dl><p className="hotel-teaser-note">Минимум 2 суток. Возьмите привычный корм, миски и любимые вещи.{Number.isFinite(walkRate) && walkRate > 0 && <> Выгул собак — {rubles(walkRate)} ₽.</>}</p><a className="button" href={HOTEL_URL + "#rooms"}>Выбрать номер <ArrowUpRight size={25}/></a></div>
  </section>;
}
