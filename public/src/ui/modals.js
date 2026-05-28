import { getState, newId, updateState } from "../core/store.js";
import { h, field, selectInput, textInput } from "./components.js";
import { render } from "../core/router.js";

function stateOptions(items, emptyLabel) {
  return [{ value: "", label: emptyLabel }, ...items.map((item) => ({ value: item.id, label: item.name || item.title }))];
}

function modal(title, body) {
  document.querySelector("#modal-root").innerHTML = `
    <div class="modal-backdrop" data-action="close-modal">
      <section class="modal" role="dialog" aria-modal="true" aria-label="${h(title)}" data-modal-surface>
        <header><h2>${h(title)}</h2><button type="button" data-action="close-modal">Закрыть</button></header>
        ${body}
      </section>
    </div>
  `;
}

export function closeModal() {
  document.querySelector("#modal-root").innerHTML = "";
}

export function openQueueModal() {
  const state = getState();
  modal("Запись на приём", `
    <form data-submit="queue-primary">
      <nav class="segmented"><span class="active">Первичный</span><span>Существующий</span></nav>
      ${field("Владелец", textInput("ownerName", "Введите ФИО владельца", true))}
      ${field("Мобильный телефон", `<input name="phone" placeholder="+7 (___) ___-__-__" required>`)}
      ${field("Срочность", selectInput("urgency", [{ value: "плановый", label: "плановый" }, { value: "срочный", label: "срочный" }], "плановый"))}
      ${field("Сотрудник", selectInput("employeeId", stateOptions(state.employees, "Без выбора врача")))}
      ${field("Кабинет", selectInput("room", stateOptions(state.rooms, "Без кабинета")))}
      ${field("Комментарий", `<textarea name="comment" placeholder="Комментарий администратора"></textarea>`)}
      <button class="btn primary" type="submit">Сохранить</button>
    </form>
  `);
}

export function openOwnerModal() {
  modal("Регистрация владельца и пациента", `
    <form data-submit="owner-animal">
      <h3>Данные владельца</h3>
      ${field("ФИО", textInput("ownerName", "Введите ФИО", true))}
      ${field("Организация", textInput("organization", "Введите название организации"))}
      ${field("Мобильный телефон", `<input name="phone" placeholder="+7 (___) ___-__-__" required>`)}
      ${field("Дополнительный телефон", `<input name="phoneExtra" placeholder="+7 (___) ___-__-__">`)}
      ${field("Адрес", textInput("address", "Введите адрес"))}
      ${field("Электронная почта", `<input name="email" placeholder="Введите@Почту" type="email">`)}
      ${field("Откуда узнали", textInput("source", "Выберите источник"))}
      ${field("Паспортные данные", textInput("passport", ""))}
      ${field("Скидка на товары", `<input name="discountGoods" placeholder="0" type="number" min="0" max="100">`)}
      ${field("Скидка на услуги", `<input name="discountServices" placeholder="0" type="number" min="0" max="100">`)}
      <h3>Пациент</h3>
      ${field("Кличка", textInput("animalName", "Введите кличку", true))}
      ${field("Вид", selectInput("kind", [{ value: "Кошка", label: "Кошка" }, { value: "Собака", label: "Собака" }, { value: "Птица", label: "Птица" }, { value: "Другое", label: "Другое" }], "Кошка"))}
      ${field("Порода", textInput("breed", "Введите породу"))}
      ${field("Пол", selectInput("sex", [{ value: "Самка", label: "Самка" }, { value: "Самец", label: "Самец" }]))}
      ${field("Дата рождения", `<input name="birthDate" type="date">`)}
      ${field("Окрас", textInput("color", "Введите окрас"))}
      ${field("Микрочип", textInput("chip", "Номер микрочипа"))}
      ${field("Клеймо", textInput("mark", ""))}
      ${field("Стерилизация", `<label class="checkline"><input name="sterilized" type="checkbox"> Да</label>`)}
      <button class="btn primary" type="submit">Сохранить</button>
    </form>
  `);
}

export function openVisitModal() {
  const state = getState();
  modal("Новый приём", `
    <form data-submit="visit">
      ${field("Пациент", selectInput("animalId", stateOptions(state.animals, "Выберите пациента"), ""))}
      ${field("Тип приёма", selectInput("title", state.services.map((service) => ({ value: service.title, label: service.title })), "Первичный приём"))}
      ${field("Исполнитель", selectInput("employeeId", stateOptions(state.employees, "Выберите сотрудника"), ""))}
      ${field("Цель визита", textInput("reason", "Цель визита", true))}
      <button class="btn primary" type="submit">Создать приём</button>
    </form>
  `);
}

export function openTaskModal() {
  const state = getState();
  modal("Новая задача", `
    <form data-submit="task">
      <nav class="segmented"><span class="active">Сотрудник</span><span>Должность</span><span>Без владельца</span></nav>
      ${field("Владелец", selectInput("ownerId", stateOptions(state.owners, "Без владельца"), ""))}
      ${field("Пациент", selectInput("animalId", stateOptions(state.animals, "Выберите пациента"), ""))}
      ${field("Тип", selectInput("type", [{ value: "Контроль", label: "Контроль" }, { value: "Звонок", label: "Звонок" }, { value: "Вакцинация", label: "Вакцинация" }], "Контроль"))}
      ${field("Исполнитель", selectInput("employeeId", stateOptions(state.employees, "Выберите исполнителя"), ""))}
      ${field("Дата и время", `<input name="due" type="datetime-local" required>`)}
      ${field("Комментарий", `<textarea name="title" placeholder="Комментарий"></textarea>`)}
      <button class="btn primary" type="submit">Сохранить</button>
    </form>
  `);
}

export function openGoodModal() {
  modal("Добавление товара", `
    <form data-submit="noop">
      ${field("Название", textInput("title", "Введите название", true))}
      ${field("Категория", textInput("group", "Выберите категорию"))}
      ${field("НДС", textInput("vat", "Выберите НДС"))}
      ${field("GTIN", textInput("gtin", "Отсканируйте GTIN"))}
      ${field("Штрих-коды", textInput("barcode", "Отсканируйте штрих-код"))}
      ${field("Фиксированная цена / Наценка", `<input name="price" placeholder="Введите фиксированную цену" type="number">`)}
      ${field("Учёт в расходах", textInput("expenseAccounting", "Выберите учёт"))}
      ${field("Срок годности", textInput("shelfLife", "Выберите срок годности"))}
      ${field("Единица измерения на складе", textInput("stockUnit", "Выберите единицу измерения"))}
      ${field("Количество в упаковке", `<input name="packRatio" placeholder="0" type="number">`)}
      ${field("Единица измерения списания", textInput("writeOffUnit", "Выберите единицу измерения"))}
      ${field("Минимальный остаток", `<input name="min" placeholder="Введите минимальный остаток" type="number">`)}
      ${field("Дополнительная информация", `<textarea name="comment" placeholder="Введите дополнительную информацию"></textarea>`)}
      <button class="btn primary" type="submit">Сохранить</button>
    </form>
  `);
}

export function openServiceModal() {
  modal("Добавить услугу", `
    <form data-submit="noop">
      ${field("Название", textInput("title", "Введите название", true))}
      ${field("Категория", textInput("group", "Выберите категорию"))}
      ${field("Цена", `<input name="price" placeholder="Введите цену" type="number">`)}
      ${field("Тип цены", textInput("priceType", "Выберите тип"))}
      ${field("НДС", textInput("vat", "Выберите НДС"))}
      ${field("Описание", `<textarea name="description" placeholder="Введите описание"></textarea>`)}
      <h3>Используемые товары</h3>
      ${field("Товар", textInput("good", "Введите название товара"))}
      ${field("Количество", `<input name="quantity" type="number">`)}
      <button class="btn primary" type="submit">Сохранить</button>
    </form>
  `);
}

export function openSupplyModal() {
  const state = getState();
  modal("Новая поставка товара", `
    <form data-submit="noop">
      ${field("Склад", selectInput("warehouseId", state.warehouses.map((item) => ({ value: item.id, label: item.title })), "wh-1"))}
      ${field("Файл поставки", `<input name="file" type="file">`)}
      ${field("Поставщик", textInput("supplier", "Введите название поставщика"))}
      ${field("№ накладной", textInput("invoice", "Накладная"))}
      ${field("Дата поставки", `<input name="date" type="date">`)}
      ${field("Товар", textInput("good", "Введите название товара"))}
      ${field("Срок годности", `<div class="inline-fields"><input name="month" placeholder="Месяц"><input name="year" placeholder="Год"></div>`)}
      ${field("Количество", `<input name="quantity" placeholder="0" type="number">`)}
      ${field("Закупочная цена", `<input name="purchasePrice" placeholder="0" type="number">`)}
      ${field("Скидка", `<input name="discount" placeholder="0" type="number">`)}
      ${field("Стеллаж", textInput("rack", "Выберите стеллаж"))}
      ${field("№ стеллажа и полки", `<div class="inline-fields"><input name="rackNumber" placeholder="Стеллаж"><input name="shelf" placeholder="Полка"></div>`)}
      ${field("Серия", textInput("series", "Введите серию товара"))}
      <button class="btn primary" type="submit">Добавить</button>
    </form>
  `);
}

export function openDocumentTemplateModal() {
  const state = getState();
  modal("Шаблоны", `
    <form data-submit="noop">
      ${field("Поиск", `<input type="search" placeholder="Поиск шаблона">`)}
      <div class="template-picker">
        ${state.templates.map((item) => `<button type="button"><strong>${h(item.title)}</strong><span>${h(item.type)} · ${h(item.target)}</span></button>`).join("")}
      </div>
    </form>
  `);
}

export function openDiagnosisModal() {
  modal("Добавить диагноз", `
    <form data-submit="noop">
      ${field("Тип", textInput("type", "Выберите тип"))}
      ${field("Диагноз", textInput("diagnosis", "Введите диагноз", true))}
      ${field("Описание", `<textarea name="description"></textarea>`)}
      ${field("Статус", textInput("status", "Выберите результат"))}
      <button class="btn primary" type="submit">Сохранить</button>
    </form>
  `);
}

export function openSimpleModal(title, submit, fields) {
  modal(title, `
    <form data-submit="${h(submit)}">
      ${fields}
      <button class="btn primary" type="submit">Сохранить</button>
    </form>
  `);
}

export function handleSubmit(event) {
  const form = event.target.closest("form[data-submit]");
  if (!form) return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  const type = form.dataset.submit;

  updateState((state) => {
    if (type === "queue-primary") {
      state.queue.unshift({
        id: newId("queue"),
        status: "await",
        kind: "primary",
        ownerName: data.ownerName,
        phone: data.phone,
        urgency: data.urgency,
        employeeId: data.employeeId,
        room: state.rooms.find((room) => room.id === data.room)?.name || "",
        comment: data.comment,
        wait: "0 мин"
      });
    }
    if (type === "owner-animal") {
      const ownerId = newId("owner");
      state.owners.unshift({ id: ownerId, name: data.ownerName, phone: data.phone, balance: 0, source: data.source, registered: new Date().toISOString().slice(0, 10) });
      state.animals.unshift({ id: newId("animal"), ownerId, name: data.animalName, kind: data.kind, breed: data.breed || "—", sex: data.sex, birthDate: data.birthDate, color: data.color, chip: data.chip, mark: data.mark, age: "—", weight: "—", sterilized: data.sterilized === "on", favorite: false, status: "Здоров" });
    }
    if (type === "visit") {
      const animal = state.animals.find((item) => item.id === data.animalId);
      state.visits.unshift({
        id: newId("visit"),
        animalId: data.animalId,
        ownerId: animal?.ownerId,
        status: "Черновик",
        title: data.title,
        employeeId: data.employeeId,
        date: new Date().toISOString(),
        total: 0,
        reason: data.reason,
        anamnesis: "",
        exam: "",
        recommendation: ""
      });
    }
    if (type === "task") {
      state.tasks.unshift({ id: newId("task"), title: data.title || "Задача", type: data.type, due: data.due, ownerId: data.ownerId, animalId: data.animalId, employeeId: data.employeeId, status: "Текущая" });
    }
  });

  closeModal();
  render();
}
