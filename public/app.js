import { ensureState, resetState } from "./src/core/store.js";
import { startRouter, render } from "./src/core/router.js";
import {
  closeModal,
  handleSubmit,
  openDiagnosisModal,
  openDocumentTemplateModal,
  openGoodModal,
  openOwnerModal,
  openQueueModal,
  openServiceModal,
  openSimpleModal,
  openSupplyModal,
  openTaskModal,
  openVisitModal
} from "./src/ui/modals.js";
import { field, textInput } from "./src/ui/components.js";

ensureState();
startRouter();

document.addEventListener("click", (event) => {
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (event.target.closest("[data-modal-surface]") && action === "close-modal" && event.target.closest("[data-modal-surface]") !== event.target) {
    event.stopPropagation();
  }
  if (action === "close-modal") closeModal();
  if (action === "open-queue-modal") openQueueModal();
  if (action === "open-owner-modal" || action === "open-animal-modal") openOwnerModal();
  if (action === "open-visit-modal" || action === "open-appointment-modal") openVisitModal();
  if (action === "open-task-modal") openTaskModal();
  if (action === "open-bill-modal") openSimpleModal("Новый счёт", "noop", field("Название", textInput("title", "Основание счёта", true)));
  if (action === "open-sale-modal") openSimpleModal("Новая продажа", "noop", field("Позиция", textInput("title", "Товар или услуга", true)));
  if (action === "open-good-modal") openGoodModal();
  if (action === "open-service-modal") openServiceModal();
  if (action === "open-supply-modal") openSupplyModal();
  if (action === "open-document-template-modal") openDocumentTemplateModal();
  if (action === "open-diagnosis-modal") openDiagnosisModal();
  if (action === "open-employee-modal") openSimpleModal("Новый сотрудник", "noop", field("ФИО", textInput("name", "Введите ФИО", true)));
  if (action === "open-template-modal") openSimpleModal("Новый шаблон", "noop", field("Название", textInput("title", "Название шаблона", true)));
  if (action === "open-balance-modal") openSimpleModal("Операция с балансом", "noop", `${field("Операция", textInput("operation", "Пополнить", true))}${field("Тип", textInput("method", "Выберите тип"))}${field("Сумма", "<input name=\"amount\" type=\"number\">")}`);
  if (action === "open-trusted-modal") openSimpleModal("Добавить доверенное лицо", "noop", `${field("ФИО", textInput("name", "Введите ФИО", true))}${field("Контактный телефон", textInput("phone", "Введите телефон"))}`);
  if (action === "open-cost-modal") openSimpleModal("Добавить в расходы", "noop", `${field("Наименование", textInput("title", "Введите наименование", true))}${field("Организация", textInput("organization", "Введите название организации"))}${field("Категория", textInput("category", "Выберите категорию"))}${field("Дата", "<input name=\"date\" type=\"date\">")}${field("Сумма", "<input name=\"amount\" type=\"number\">")}${field("Комментарий", "<textarea name=\"comment\"></textarea>")}`);
  if (action === "open-wage-modal") openSimpleModal("Добавить зарплатный профиль", "noop", field("Название", textInput("title", "Введите название профиля", true)));
  if (action === "open-room-modal") openSimpleModal("Добавить кабинет", "noop", field("Название", textInput("title", "Введите название кабинета", true)));
  if (action === "open-hospital-box-modal") openSimpleModal("Добавить бокс", "noop", field("Название", textInput("title", "Введите название бокса", true)));
  if (action === "open-warehouse-modal") openSimpleModal("Добавить склад", "noop", field("Название", textInput("title", "Введите название склада", true)));
  if (action === "open-cashbox-modal") openSimpleModal("Подключение онлайн-кассы", "noop", "<p>АТОЛ, ФФД 1.2, Честный знак, рецептурные препараты, эквайринг Сбербанка.</p>");
  if (action === "reset-demo") {
    resetState();
    render();
  }
});

document.addEventListener("submit", handleSubmit);
