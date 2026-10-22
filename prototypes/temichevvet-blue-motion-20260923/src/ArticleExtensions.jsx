import { useState } from "react";
import { ArrowRight, ArrowUpRight, ArrowLeft } from "@phosphor-icons/react";
import { ArticleServiceCard } from "./ArticleServices.jsx";
import { articleVisitHref } from "./articles-data.js";
import { ExplodedAnatomy } from "./ExplodedAnatomy.jsx";

function Editorial({ topic, eyebrow, title, children, serviceKey }) {
  return <section className="article-editorial wrap">
    <div className="article-prose"><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{children}</div>
    <ArticleServiceCard topic={topic} serviceKey={serviceKey} compact />
  </section>;
}

export function TeethBody() {
  return <>
    <div id="explore-article"><ExplodedAnatomy bookingHref={articleVisitHref("teeth")} /></div>
    <Editorial topic="teeth" eyebrow="Смотреть шире" title="У зуба есть невидимая сторона.">
      <p>Эмаль покрывает коронку, дентин составляет основную массу зуба, а пульпа занимает внутреннюю полость и каналы. Но зуб не существует отдельно: его окружают десна, связочный аппарат и кость. Наша модель показывает только три компонента, а не всю систему.</p>
      <p>По цвету коронки нельзя оценить всё, что происходит ниже края десны. Осмотр бодрствующего питомца — важное начало; для полного обследования и процедур врач может обсудить анестезию и дополнительные исследования.</p>
      <p>Задача владельца — не поставить диагноз по картинке, а вовремя заметить перемены. Расскажите, как питомец ест, берёт игрушки и реагирует на привычный уход.</p>
    </Editorial>
    <section className="article-observation-cards wrap" aria-label="Что замечать дома">
      {[
        ["Во время еды", "Питомец роняет корм, медленнее жуёт или избегает привычной еды? Зафиксируйте эти изменения для врача."],
        ["В обычном общении", "Новый неприятный запах, слюнотечение или изменение поведения при касании морды заслуживают внимания."],
        ["Между визитами", "Обсудите подходящий уход и средства для животных. Если прикосновение вызывает боль, не продолжайте осмотр дома силой."],
      ].map(([title, text], i) => <div key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></div>)}
    </section>
    <Editorial topic="teeth" serviceKey="dentistry" eyebrow="План, который понятен" title="Сначала осмотр. Затем решения.">
      <p>На приёме полезно обсудить три вопроса: что уже видно при осмотре, что требует уточнения и какой следующий шаг предлагается. Спросите, как будет оцениваться состояние питомца перед процедурой и какие рекомендации понадобятся дома.</p>
      <p>Домашняя чистка помогает уменьшать накопление налёта, но не заменяет необходимую профессиональную помощь. Технику и подходящие средства лучше подобрать вместе с врачом, с учётом состояния рта и реакции животного.</p>
      <p>В TemichevVET можно начать с осмотра и обсуждения помощи. Конкретные процедуры, подготовку и итоговую стоимость уточняют отдельно — иллюстрация не выбирает лечение за вас.</p>
    </Editorial>
  </>;
}

const skinLayers = [
  { name: "Эпидермис", x: 70.3, y: 44.1, title: "Первая линия защиты", text: "Наружный слой помогает удерживать влагу и защищает от воздействий окружающей среды. Клетки поверхности постепенно обновляются." },
  { name: "Дерма", x: 70.3, y: 57.6, title: "Опора и ощущения", text: "Здесь располагаются соединительная ткань, сосуды и нервные окончания. Этот слой поддерживает кожу и участвует в её чувствительности." },
  { name: "Подкожная клетчатка", x: 70.3, y: 73, title: "Мягкая поддержка", text: "Под кожей находятся жировая ткань и другие структуры. Они участвуют в сохранении тепла, запасании энергии и амортизации." },
  { name: "Волосяной фолликул", x: 49, y: 54.2, title: "Где начинается шерсть", text: "Волос растёт в фолликуле. Сальные железы выделяют секрет, который помогает поддерживать поверхность кожи и шерсть." },
];

export function SkinBody() {
  const [active, setActive] = useState(0);
  return <>
    <section className="topic-explorer wrap" id="explore-article" aria-label="Строение кожи">
      <div className="article-section-heading"><div><p className="eyebrow">Рассмотрите поближе</p><h2>Больше, чем шерсть.</h2></div><p>Выберите название на модели или под ней. У каждого слоя своя работа.</p></div>
      <div className="topic-explorer-grid">
        <div>
          <div className="skin-scene">
            <img src="/assets/skin-layers.webp" alt="Условная модель слоёв кожи с волосами и фолликулом" width="1536" height="1024" loading="lazy" />
            {skinLayers.map((layer, i) => <button key={layer.name} className={`skin-pin ${active === i ? "active" : ""}`} style={{ left: `${layer.x}%`, top: `${layer.y}%` }} aria-label={layer.name} aria-pressed={active === i} onClick={() => setActive(i)}>{i + 1}</button>)}
          </div>
          <p className="experience-note">Учебная модель: цвета и толщина слоёв условны. Она не передаёт все детали строения кожи собаки или кошки.</p>
        </div>
        <div className="topic-layer-controls">
          {skinLayers.map((layer, i) => <button key={layer.name} aria-pressed={active === i} onClick={() => setActive(i)}><span>0{i + 1}</span>{layer.name}<ArrowUpRight size={18} /></button>)}
          <div className="topic-layer-copy" aria-live="polite"><h3>{skinLayers[active].title}</h3><p>{skinLayers[active].text}</p></div>
        </div>
      </div>
    </section>
    <Editorial topic="skin" eyebrow="Зуд — не диагноз" title="Одна жалоба. Разные причины.">
      <p>Частое чесание, вылизывание или покусывание кожи — повод обратить внимание на питомца. Паразиты, инфекции и аллергические реакции могут давать похожие проявления. По одному фото или внешнему виду участка определить причину нельзя.</p>
      <p>Врач начинает с истории и осмотра: когда всё началось, что изменилось в уходе, какие обработки и препараты уже применялись. При необходимости он предложит исследования, которые помогут разобраться именно в этой ситуации.</p>
      <p>Не меняйте сразу несколько средств и не отменяйте назначенное лечение самостоятельно. Если что-то уже пробовали, запишите названия и даты — врачу важно знать всю последовательность событий.</p>
    </Editorial>
    <section className="article-observation-cards wrap">
      {[
        ["Когда", "Вспомните первое изменение, а не только день, когда оно стало особенно заметным. Есть ли связь с сезоном или новым уходом?"],
        ["Где", "Какие места питомец вылизывает чаще? Есть ли изменения шерсти, запаха или привычного поведения? Не тревожьте болезненные участки."],
        ["Как меняется", "Если уже есть фотографии разных дней, возьмите их на приём. Снимайте в похожем освещении, без фильтров и обработки."],
      ].map(([title, text], i) => <div key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p></div>)}
    </section>
    <section className="article-clinic-bridge wrap"><figure><img src="/images/konstantin-cat-original-1280.webp" alt="Константин Темичев с кошкой" loading="lazy" /><figcaption>TemichevVET · знакомство начинается с осмотра</figcaption></figure><div><p className="eyebrow">От наблюдений к плану</p><h2>Покажите, что изменилось.</h2><p>Возьмите свои заметки и вопросы. Вместе с врачом проще выстроить понятную последовательность: что проверить сейчас, какой уход обсуждать и когда оценить результат.</p><a className="text-link" href={articleVisitHref("skin")}>Обсудить кожу и шерсть<ArrowRight size={20} /></a></div></section>
  </>;
}

const checkupSteps = [
  { name: "Наблюдения", image: "reception-real", title: "История начинается дома", text: "Как питомец ест, пьёт, двигается и общается? На плановом приёме полезны не только жалобы, но и сведения о привычной жизни. Возьмите паспорт и прежние заключения — это помогает видеть изменения во времени." },
  { name: "Осмотр", image: "konstantin-cat-original", title: "Посмотреть на целую картину", text: "Врач оценивает состояние питомца, обсуждает рацион, активность, уход и профилактику. Возраст и образ жизни имеют значение. Один и тот же список обследований не подходит всем животным." },
  { name: "План", image: "laboratory-real", title: "Понятные следующие шаги", text: "Если нужны анализы или другие исследования, уточните их цель и подготовку. Договоритесь, как получить и обсудить результаты, какие изменения отслеживать дома и когда запланировать следующий осмотр." },
];
export function CheckupBody() {
  const [step, setStep] = useState(0), current = checkupSteps[step];
  return <>
    <section className="topic-explorer wrap" id="explore-article" aria-label="Путь профилактического осмотра">
      <div className="article-section-heading"><div><p className="eyebrow">Три части одного визита</p><h2>Начнём с привычного.</h2></div><p>Пройдите путь от домашних наблюдений до плана заботы. На фотографиях — наша клиника.</p></div>
      <div className="checkup-stage">
        <figure><img key={current.image} src={`/images/${current.image}-1280.webp`} alt={current.name === "Осмотр" ? "Константин Темичев с кошкой в клинике" : `${current.name === "План" ? "Лаборатория" : "Ресепшн"} TemichevVET`} loading="lazy" /><figcaption>TemichevVET · реальные фотографии клиники</figcaption></figure>
        <div><nav className="checkup-tabs" aria-label="Этапы визита">{checkupSteps.map((s, i) => <button key={s.name} aria-pressed={step === i} onClick={() => setStep(i)}><span>0{i + 1}</span>{s.name}</button>)}</nav><div aria-live="polite"><h3>{current.title}</h3><p>{current.text}</p></div><div className="checkup-arrows"><button aria-label="Предыдущий этап" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={22} /></button><span>0{step + 1} / 03</span><button aria-label="Следующий этап" disabled={step === 2} onClick={() => setStep(step + 1)}><ArrowRight size={22} /></button></div></div>
      </div>
    </section>
    <Editorial topic="checkup" eyebrow="Даже если всё хорошо" title="Знать, что обычно именно для него.">
      <p>Регулярные визиты помогают сравнивать состояние питомца с его собственными прежними результатами. Изменение веса, привычек или активности бывает важнее одного отдельно взятого числа.</p>
      <p>Периодичность визитов обсудите с врачом. Она зависит от возраста, состояния здоровья и уже известных заболеваний. При новых тревожных признаках не нужно ждать заранее запланированной даты.</p>
      <p>Профилактический приём — время для ваших вопросов: о питании, зубах, поведении, вакцинации и защите от паразитов. Лучше записать их заранее, чтобы ничего не забыть.</p>
    </Editorial>
    <Editorial topic="checkup" serviceKey="laboratory" eyebrow="Не пакет наугад" title="У каждого исследования — свой вопрос.">
      <p>Анализы могут дополнить то, что видно при осмотре. Но больше исследований не всегда означает более полезный визит: важны показания, правильная подготовка и интерпретация результатов.</p>
      <p>Если у вас сохранились старые результаты, покажите их врачу. Не пытайтесь оценивать отдельные отклонения без истории питомца и осмотра.</p>
      <p>Здесь можно посмотреть направления помощи и действующий прайс. Состав диспансеризации и её стоимость уточняются в клинике: готовый обязательный комплекс на этой странице не предлагается.</p>
      <a href="/offers" className="text-link">Узнать о диспансеризации<ArrowUpRight size={18} /></a>
    </Editorial>
  </>;
}
