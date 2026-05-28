import { date, dateTime, money } from "../core/format.js";
import { animalVisits, byId, ownerAnimals } from "../core/store.js";
import { badge, button, emptyState, h, pageHeader, panel, route, searchBar, table, tabs } from "../ui/components.js";

function ownerName(state, id) {
  return byId(state.owners, id)?.name || "—";
}

function animalName(state, id) {
  return byId(state.animals, id)?.name || "—";
}

function employeeName(state, id) {
  return byId(state.employees, id)?.name || "—";
}

function visitDate(state, animalId) {
  return animalVisits(state, animalId)[0]?.date ? dateTime(animalVisits(state, animalId)[0].date) : "—";
}

export function ownersPage({ state }) {
  const rows = state.owners.map((owner) => {
    const animals = ownerAnimals(state, owner.id);
    return [
      route(`/owners/${owner.id}`, owner.name),
      h(owner.phone),
      h(money(owner.balance)),
      h(animals.map((animal) => animal.name).join(", ") || "—"),
      h(state.user.clinic),
      h(date(owner.registered))
    ];
  });
  return `
    ${pageHeader("Владельцы", "Клиенты, контакты, баланс и связанные пациенты", button("Добавить владельца и пациента", "open-owner-modal"))}
    <div class="toolbar">${searchBar()}${button("Фильтры", "noop", "secondary")}</div>
    ${table(["Владелец", "Телефон", "Баланс", "Пациент", "Филиал", "Последний приём"], rows)}
  `;
}

export function ownerCardPage({ state, params }) {
  const owner = byId(state.owners, params.id);
  if (!owner) return emptyState("Владелец не найден");
  const tab = params.tab || "animals";
  const animals = ownerAnimals(state, owner.id);
  const visits = state.visits.filter((visit) => visit.ownerId === owner.id);
  const body = {
    animals: table(["Состояние", "Пациент", "Филиал", "Последний приём"], animals.map((animal) => [
      badge(animal.status, animal.status === "Здоров" ? "ok" : "warn"),
      route(`/animals/${animal.id}/visits`, `${animal.kind} ${animal.name}`),
      h(state.user.clinic),
      h(visits.find((visit) => visit.animalId === animal.id)?.date ? dateTime(visits.find((visit) => visit.animalId === animal.id).date) : "—")
    ])),
    timetable: emptyState("Записей на приём нет"),
    visits: table(["Статус", "Приём", "Пациент", "Дата", "Сумма"], visits.map((visit) => [
      badge(visit.status, "ok"),
      route(`/visits/${visit.id}/exam`, visit.title),
      h(animalName(state, visit.animalId)),
      h(dateTime(visit.date)),
      h(money(visit.total))
    ])),
    balance: `
      ${panel("Финансы", `<div class="kv"><span>Общий оборот</span><b>${money(owner.balance)}</b><span>Депозит</span><b>${money(owner.deposit || 0)}</b></div>`, button("Операция с балансом", "open-balance-modal", "secondary"))}
      ${table(["Операция", "Дата", "Тип", "Сумма"], [])}
    `,
    trusted: `
      ${button("Добавить доверенное лицо", "open-trusted-modal", "secondary")}
      ${table(["ФИО", "Телефон"], state.trustedPeople.filter((person) => person.ownerId === owner.id).map((person) => [h(person.name), h(person.phone)]))}
    `
  }[tab] || emptyState("Раздел не найден");
  return `
    ${pageHeader(owner.name, `${owner.phone} · зарегистрирован ${date(owner.registered)}`, button("Добавить пациента", "open-animal-modal"))}
    <section class="card-layout">
      <aside class="side-card">
        <h2>${h(owner.name)}</h2>
        <dl>
          <dt>Телефон</dt><dd>${h(owner.phone)}</dd>
          <dt>Источник</dt><dd>${h(owner.source || "—")}</dd>
          <dt>Скидка товары</dt><dd>${h(owner.discountGoods || 0)}%</dd>
          <dt>Скидка услуги</dt><dd>${h(owner.discountServices || 0)}%</dd>
          <dt>Каналы</dt><dd>${h((owner.channels || []).join(", ") || "—")}</dd>
          <dt>Баланс</dt><dd>${money(owner.balance)}</dd>
        </dl>
      </aside>
      <div>
        ${tabs([
          { path: `/owners/${owner.id}/animals`, label: "Пациенты" },
          { path: `/owners/${owner.id}/timetable`, label: "Записи на приём" },
          { path: `/owners/${owner.id}/visits`, label: "Приёмы" },
          { path: `/owners/${owner.id}/balance`, label: "Баланс" },
          { path: `/owners/${owner.id}/trusted`, label: "Доверенные лица" }
        ], `/owners/${owner.id}/${tab}`)}
        ${body}
      </div>
    </section>
  `;
}

export function animalsPage({ state }) {
  return `
    ${pageHeader("Пациенты", "Медицинские карты животных и история приёмов", button("Добавить пациента", "open-animal-modal"))}
    <div class="toolbar">${searchBar()}${button("Фильтры", "noop", "secondary")}</div>
    ${table(["Состояние", "Вид", "Пациент", "Владелец", "Филиал", "Последний приём"], state.animals.map((animal) => [
      badge(animal.status, animal.status === "Здоров" ? "ok" : "warn"),
      h(animal.kind),
      route(`/animals/${animal.id}/visits`, animal.name),
      route(`/owners/${animal.ownerId}`, ownerName(state, animal.ownerId)),
      h(state.user.clinic),
      h(visitDate(state, animal.id))
    ]))}
  `;
}

export function animalCardPage({ state, params }) {
  const animal = byId(state.animals, params.id);
  if (!animal) return emptyState("Пациент не найден");
  const tab = params.tab || "visits";
  const visits = animalVisits(state, animal.id);
  const body = {
    visits: table(["Статус", "Название", "Филиал", "Сотрудник", "Дата", "Сумма"], visits.map((visit) => [
      badge(visit.status, "ok"),
      route(`/visits/${visit.id}/exam`, visit.title),
      h(state.user.clinic),
      h(employeeName(state, visit.employeeId)),
      h(dateTime(visit.date)),
      h(money(visit.total))
    ])),
    vaccinations: `
      ${button("Добавить вакцинацию", "open-vaccination-modal", "secondary")}
      ${table(["Статус", "Название", "Срок действия"], state.vaccinations.filter((item) => item.animalId === animal.id).map((item) => [badge(item.status, "ok"), h(item.title), h(date(item.expires))]))}
    `,
    tasks: `
      ${button("Добавить задачу", "open-task-modal", "secondary")}
      ${tabs([
        { path: `/animals/${animal.id}/tasks`, label: "Не выполненные" },
        { path: `/animals/${animal.id}/tasks/done`, label: "Выполненные" }
      ], `/animals/${animal.id}/${tab}`)}
      ${table(["Задача", "Сотрудник", "Дата"], state.tasks.filter((task) => task.animalId === animal.id).map((task) => [h(task.title), h(employeeName(state, task.employeeId)), h(date(task.due))]))}
    `,
    profile: panel("Профиль пациента", `
      <div class="form-grid">
        <input value="${h(ownerName(state, animal.ownerId))}" aria-label="Владелец">
        <input value="${h(animal.name)}" aria-label="Кличка">
        <input value="${h(animal.kind)}" aria-label="Вид">
        <input value="${h(animal.breed)}" aria-label="Порода">
        <input value="${h(animal.sex)}" aria-label="Пол">
        <input value="${h(animal.birthDate || "")}" aria-label="Дата рождения">
        <input value="${h(animal.color || "")}" placeholder="Окрас">
        <input value="${h(animal.chip || "")}" placeholder="Микрочип">
        <input value="${h(animal.mark || "")}" placeholder="Клеймо">
        <input value="${h(animal.weight)} кг" aria-label="Вес">
      </div>
      <div class="kv compact"><span>Стерилизация</span><b>${animal.sterilized ? "Да" : "Нет"}</b><span>Избранный</span><b>${animal.favorite ? "Да" : "Нет"}</b></div>
    `)
  }[tab] || emptyState("Раздел не найден");
  return `
    ${pageHeader(animal.name, `${animal.kind} · владелец ${ownerName(state, animal.ownerId)}`, button("Добавить приём", "open-visit-modal"))}
    <section class="card-layout">
      <aside class="side-card">
        <h2>${h(animal.name)}</h2>
        <dl>
          <dt>Вид</dt><dd>${h(animal.kind)}</dd>
          <dt>Порода</dt><dd>${h(animal.breed)}</dd>
          <dt>Пол</dt><dd>${h(animal.sex)}</dd>
          <dt>Возраст</dt><dd>${h(animal.age)}</dd>
          <dt>Вес</dt><dd>${h(animal.weight)} кг</dd>
          <dt>Стерилизация</dt><dd>${animal.sterilized ? "Да" : "Нет"}</dd>
          <dt>Статус</dt><dd>${badge(animal.status)}</dd>
        </dl>
      </aside>
      <div>
        ${tabs([
          { path: `/animals/${animal.id}/visits`, label: "Приёмы" },
          { path: `/animals/${animal.id}/vaccinations`, label: "Вакцинации" },
          { path: `/animals/${animal.id}/tasks`, label: "Задачи" },
          { path: `/animals/${animal.id}/profile`, label: "Профиль" }
        ], `/animals/${animal.id}/${tab}`)}
        ${body}
      </div>
    </section>
  `;
}

export function visitPage({ state, params }) {
  const visit = byId(state.visits, params.id);
  if (!visit) return emptyState("Приём не найден");
  const animal = byId(state.animals, visit.animalId);
  const tab = params.tab || "exam";
  const body = {
    exam: `
      ${panel("Цель визита", `<input value="${h(visit.reason)}">`)}
      ${panel("Анамнез", `<textarea>${h(visit.anamnesis)}</textarea>`)}
      ${panel("Осмотр", `<textarea>${h(visit.exam)}</textarea><div class="form-grid"><input placeholder="Ведущие симптомы" value="${h(visit.symptoms || "")}"><input placeholder="Вес, кг" value="${h(animal?.weight || "")}"><input placeholder="Температура, °C" value="${h(visit.temperature || "")}"></div>`)}
      ${panel("Диагнозы", table(["Диагноз", "Тип", "Дата", "Статус"], (visit.diagnoses || []).map((item) => [h(item.title), h(item.type), h(item.date), h(item.status)])), button("Добавить диагноз", "open-diagnosis-modal", "secondary"))}
      ${panel("Манипуляции", `<textarea>${h(visit.manipulations || "")}</textarea>`)}
    `,
    recommendations: `
      ${panel("План лечения", `<textarea>${h(visit.treatmentPlan || visit.recommendation || "")}</textarea>`)}
      ${panel("Рекомендация по уходу", `<textarea>${h(visit.careAdvice || "")}</textarea>`)}
    `,
    goods: panel("Товары и услуги", `
      <div class="form-grid">
        <input placeholder="Товар или услуга">
        <input placeholder="Количество">
        <input placeholder="Скидка">
        <input placeholder="Сумма" disabled>
      </div>
      ${visit.items?.length ? table(["Название", "Тип", "Кол-во", "Цена", "Скидка", "Сумма"], visit.items.map((item) => [h(item.title), h(item.type), h(item.quantity), h(money(item.price)), h(`${item.discount}%`), h(money(item.total))])) : emptyState("Нет товаров и услуг")}
    `, button("Добавить", "noop", "secondary")),
    documents: panel("Документы", `
      <div class="action-grid">
        ${button("Загрузить с устройства", "noop", "secondary")}
        ${button("Загрузить шаблон документа", "open-document-template-modal", "secondary")}
      </div>
      ${visit.documents?.length ? table(["Название", "Тип"], visit.documents.map((doc) => [h(doc.title), h(doc.type)])) : emptyState("Документы не сформированы")}
    `),
    hospital: panel("Стационар", emptyState("Пациент не добавлен в стационар"), button("Добавить пациента в стационар", "noop", "secondary"))
  }[tab] || emptyState("Раздел не найден");
  return `
    ${pageHeader(`Приём № ${visit.id}`, `${dateTime(visit.date)} · ${animal?.name || "пациент"}`, button("Сохранить", "noop"))}
    <section class="card-layout">
      <aside class="side-card">
        <h2>${route(`/animals/${visit.animalId}/visits`, animal?.name || "Пациент")}</h2>
        <dl><dt>Стоимость</dt><dd>${money(visit.total)}</dd><dt>Владелец</dt><dd>${route(`/owners/${visit.ownerId}`, ownerName(state, visit.ownerId))}</dd><dt>Исполнитель</dt><dd>${h(employeeName(state, visit.employeeId))}</dd></dl>
      </aside>
      <div>
        ${tabs([
          { path: `/visits/${visit.id}/exam`, label: "Лист осмотра" },
          { path: `/visits/${visit.id}/recommendations`, label: "Рекомендации" },
          { path: `/visits/${visit.id}/goods`, label: "Товары и услуги" },
          { path: `/visits/${visit.id}/documents`, label: "Документы" },
          { path: `/visits/${visit.id}/hospital`, label: "Стационар" }
        ], `/visits/${visit.id}/${tab}`)}
        ${body}
      </div>
    </section>
  `;
}
