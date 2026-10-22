import { useState } from "react";
import { ArrowRight, Check, Flask, Stethoscope } from "@phosphor-icons/react";
import { rub } from "./catalog.js";
import { checkupSpecies, checkupLabs, standardCheckupItems, checkupProfiles, checkupProgram, checkupVisitHref } from "./checkup-programs.js";

export function CheckupPrograms() {
  const [species, setSpecies] = useState("cat");
  const [lab, setLab] = useState("clinic");
  const profile = checkupProfiles[species];
  return <section className="checkup-programs wrap" id="checkup-programs" aria-labelledby="checkup-programs-title">
    <div className="checkup-heading">
      <div><p className="eyebrow">Плановая забота · программы клиники</p><h2 id="checkup-programs-title">Диспансеризация.<br />Всё по плану.</h2></div>
      <p>Выберите питомца и место выполнения анализов крови. Посмотрите, что входит в программу, и оставьте заявку на удобное время.</p>
    </div>
    <div className="checkup-choices">
      <fieldset><legend>Ваш питомец</legend><div>{Object.entries(checkupSpecies).map(([id, title]) => <label key={id} className={species === id ? "selected" : ""}><input type="radio" name="checkup-species" value={id} checked={species === id} onChange={() => setSpecies(id)} /><span>{title}</span></label>)}</div></fieldset>
      <fieldset><legend>Основные анализы крови</legend><div>{Object.entries(checkupLabs).map(([id, title]) => <label key={id} className={lab === id ? "selected" : ""}><input type="radio" name="checkup-lab" value={id} checked={lab === id} onChange={() => setLab(id)} /><span>{title}</span></label>)}</div></fieldset>
    </div>
    <p className="checkup-timing">{lab === "clinic" ? "Общий анализ крови в клинике — 30 минут. Срок готовности биохимии уточним при записи." : "Общий и биохимический анализы крови в Инвитро — 2 суток."} Расширенные инфекционные исследования выполняются в Инвитро; их срок уточним отдельно.</p>
    <div className="checkup-card-grid">
      {["standard", "expanded"].map((program, index) => {
        const item = checkupProgram(species, lab, program);
        return <article className={`checkup-card ${program}`} key={program} aria-labelledby={`checkup-${program}-title`}>
          <div className="checkup-card-top"><span>0{index + 1} · {checkupSpecies[species]}</span>{program === "standard" ? <Stethoscope size={30} aria-hidden="true" /> : <Flask size={30} aria-hidden="true" />}</div>
          <h3 id={`checkup-${program}-title`}>{item.title}</h3>
          <p className="checkup-program-description">{program === "standard" ? "Четыре исследования в одной программе." : "Стандартная программа и дополнительный инфекционный профиль."}</p>
          <div className="checkup-price" aria-live="polite" aria-atomic="true"><span>По акции</span><strong>{rub(item.price)}</strong><span>Обычная цена <s>{rub(item.regular)}</s></span></div>
          <ul className="checkup-includes">{standardCheckupItems.map(text => <li key={text}><Check size={19} aria-hidden="true" /><span>{text}</span></li>)}</ul>
          {program === "expanded" && <div className="checkup-profile"><strong>Дополнительно: {profile.title.toLowerCase()}</strong><details><summary>Какие инфекции входят</summary><ul>{profile.items.map(text => <li key={text}>{text}</li>)}</ul></details><p>Профиль отдельно: {rub(profile.price)} по акции · обычная цена {rub(profile.regular)}. В стоимость этой программы уже включён.</p></div>}
          <a className="button" href={checkupVisitHref(species, lab, program)} aria-label={`Записаться: ${item.title.toLowerCase()} диспансеризация, ${checkupSpecies[species].toLowerCase()}, анализы ${checkupLabs[lab].toLowerCase()}`}>Выбрать программу <ArrowRight size={20} aria-hidden="true" /></a>
        </article>;
      })}
    </div>
    <p className="checkup-note">Рентген и УЗИ проводятся в клинике при любом варианте. В расширенной программе место выполнения основных анализов крови выбирается выше, инфекционный профиль выполняется в Инвитро. Подготовку и время визита согласует администратор.</p>
    <details className="checkup-all-prices"><summary>Все программы и цены</summary><div className="checkup-table-scroll" role="region" aria-label="Сравнение цен на диспансеризацию" tabIndex={0}><table><caption>Стоимость полного комплекса</caption><thead><tr><th scope="col">Питомец и программа</th><th scope="col">Анализы крови</th><th scope="col">Обычная цена</th><th scope="col">По акции</th></tr></thead><tbody>{Object.entries(checkupSpecies).flatMap(([animal, label]) => Object.entries(checkupLabs).flatMap(([laboratory, labLabel]) => ["standard", "expanded"].map(program => { const item = checkupProgram(animal, laboratory, program); return <tr key={`${animal}-${laboratory}-${program}`}><th scope="row">{label} · {item.title.toLowerCase()}</th><td>{labLabel}</td><td>{rub(item.regular)}</td><td><strong>{rub(item.price)}</strong></td></tr>; })))}</tbody></table></div></details>
  </section>;
}
