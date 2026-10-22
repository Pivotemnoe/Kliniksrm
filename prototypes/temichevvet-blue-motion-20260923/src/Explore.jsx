import { MovementLayers } from "./Articles.jsx";
import {
  ArrowUpRight,
  ArrowsHorizontal,
  Tooth,
} from "@phosphor-icons/react";
import { ExplodedAnatomy } from "./ExplodedAnatomy.jsx";

export function ToothExplorer() {
  return <ExplodedAnatomy type="tooth" bookingHref="/visit?direction=dentistry" />;
}

export function PetAnatomy() {
  return <MovementLayers />;
}

export function ExploreLinks() {
  return (
    <section className="explore-links wrap">
      <div className="explore-links-heading">
        <p className="eyebrow">О питомцах — с любопытством</p>
        <h2>
          Давайте посмотрим
          <br />
          чуть глубже.
        </h2>
      </div>
      <div className="explore-link-grid">
        <a className="explore-link" href="/pets">
          <img
            src="/assets/anatomy-dog-exterior.webp"
            alt="Иллюстрация собаки"
            loading="lazy"
            width="1536"
            height="1024"
          />
          <div>
            <span>Потяните. Рассмотрите. Узнайте.</span>
            <h3>Что под мягкой шерстью?</h3>
            <ArrowUpRight size={29} />
          </div>
        </a>
        <a className="explore-link tooth-link" href="/services/dentistry">
          <img
            src="/assets/tooth-cutaway.webp"
            alt="Учебная иллюстрация клыка собаки в разрезе"
            loading="lazy"
            width="1254"
            height="1254"
          />
          <div>
            <span>Стоматология · интерактивная иллюстрация</span>
            <h3>Заглянуть внутрь зуба.</h3>
            <ArrowUpRight size={29} />
          </div>
        </a>
      </div>
    </section>
  );
}
