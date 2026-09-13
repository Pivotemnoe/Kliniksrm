const app = document.querySelector('#app');
const logoutButton = document.querySelector('#logout');
const transferStorageKey = 'temichevvet-browser-transfer';
const readNotificationsStoragePrefix = 'temichevvet-owner-read-notifications:';
const serviceWorkerRegistrationPromise = 'serviceWorker' in navigator
  ? navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null)
  : Promise.resolve(null);

let portalResponse = null;
let pendingPortalResponse = null;
let selectedAnimalId = '';
let activeTab = new URL(window.location.href).searchParams.get('section') === 'notifications' ? 'notifications' : 'home';
let documentQuery = '';
let refreshing = false;
let bookingDirty = false;
let bookingAttempt = null;
let bookingDraft = {};

void start();
window.setInterval(() => { if (portalResponse && !document.hidden && !bookingDirty && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) void refreshPortal(); }, 60_000);

async function start() {
  try {
    const currentUrl = new URL(window.location.href);
    const token = currentUrl.searchParams.get('token');
    const transferToken = currentUrl.searchParams.get('transfer');
    let transferReady = false;

    if (token) {
      const session = await exchangeToken(token);
      if (typeof session.transferToken === 'string' && session.transferToken) {
        prepareTransferUrl(session.transferToken);
        transferReady = true;
      } else {
        clearPortalUrl();
      }
    } else if (transferToken) {
      if (window.sessionStorage.getItem(transferStorageKey) === transferToken) {
        transferReady = true;
      } else {
        await exchangeToken(transferToken);
        clearPortalUrl();
      }
    }

    const response = await request('/v1/portal/me');
    renderPortal(response);
    if (transferReady) {
      showBrowserTransferReady();
    }
    logoutButton.hidden = false;
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'Не удалось открыть личный кабинет');
  }
}

async function exchangeToken(token) {
  return request('/v1/portal/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

function prepareTransferUrl(token) {
  window.sessionStorage.setItem(transferStorageKey, token);
  window.history.replaceState({}, '', `/portal?transfer=${encodeURIComponent(token)}`);
}

function clearPortalUrl() {
  window.sessionStorage.removeItem(transferStorageKey);
  window.history.replaceState({}, '', '/portal');
}

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try { await removeCurrentPushSubscription(); } catch {}
  try { await request('/v1/portal/logout', { method: 'POST' }); } catch {}
  window.location.assign('/portal');
});

async function request(path, options = {}) {
  const response = await fetch(path, { credentials: 'include', ...options });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
  if (!response.ok) {
    const message = typeof payload?.message === 'string' ? payload.message : 'Доступ не подтверждён';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function portalData(response) {
  const snapshot = response?.snapshot && typeof response.snapshot === 'object' ? response.snapshot : {};
  const animals = array(snapshot.animals);
  if (selectedAnimalId && !animals.some((animal) => animal.id === selectedAnimalId)) selectedAnimalId = '';
  const forPet = (items) => array(items).filter((item) => !selectedAnimalId || (item.animal?.id ?? item.animalId ?? item.visit?.animal?.id) === selectedAnimalId);
  const visits = forPet(snapshot.visits);
  const documents = [
    ...forPet(snapshot.files).map((file) => ({ ...file, documentKind: 'file' })),
    ...visits.flatMap((visit) => array(visit.documents).map((document) => ({ ...document, visit, documentKind: 'signed' }))),
  ];
  return { snapshot, animals, pets: animals.filter((animal) => !selectedAnimalId || animal.id === selectedAnimalId), visits, documents,
    appointments: forPet(snapshot.appointments), bills: forPet(snapshot.bills), hospital: forPet(snapshot.hospitalStays),
    labs: forPet(snapshot.laboratoryOrders ?? array(snapshot.visits).flatMap((visit) => array(visit.laboratoryOrders).map((order) => ({ ...order, animal: visit.animal })))) };
}

function renderPortal(response) {
  if (portalResponse && portalResponse.ownerId !== response.ownerId) { selectedAnimalId = ''; bookingDraft = {}; bookingAttempt = null; bookingDirty = false; }
  portalResponse = response;
  const data = portalData(response);
  const { snapshot, animals, pets, appointments, visits, documents, bills, labs, hospital } = data;
  const owner = snapshot.owner || {};
  const notifications = array(snapshot.notifications);
  const unread = getUnreadNotificationCount(response.ownerId, notifications);
  const showBrowserTransfer = !isStandaloneMode();
  app.innerHTML = `
    <section class="hero">
      <div><p class="eyebrow">Личный кабинет</p><h1>Мои питомцы</h1><p>${escapeHtml(owner.fullName || response.displayName || '')}</p></div>
      <div class="hero-meta"><span id="freshness">${freshnessText(response.syncedAt)}</span><button id="refresh-portal" class="button secondary" type="button">Обновить</button><span id="refresh-status" role="status"></span></div>
    </section>
    <div class="pet-toolbar"><label for="pet-filter">Питомец</label><select id="pet-filter"><option value="">Все питомцы · ${animals.length}</option>${animals.map((animal) => `<option value="${escapeHtml(animal.id)}"${animal.id === selectedAnimalId ? ' selected' : ''}>${escapeHtml(animal.nickname)}</option>`).join('')}</select><button class="button" data-open="booking" type="button">Записаться</button></div>
    <nav class="portal-menu" aria-label="Разделы кабинета"><div class="tabs" role="tablist">
      ${[['home', 'Главная'], ['health', 'Здоровье'], ['appointments', 'Записи'], ['documents', 'Документы'], ['bills', 'Счета'], ['notifications', 'Сообщения']].map(([key, label]) => tabButton(key, label, key === activeTab, key === 'notifications' ? unread : 0)).join('')}
    </div></nav>
    ${section('home', selectedAnimalId ? `Сегодня · ${pets[0]?.nickname || 'Питомец'}` : 'На сегодня', renderHome(data) + renderServicePromo() + '<h3 class="subheading">Карточки питомцев</h3>' + renderAnimals(pets), activeTab !== 'home')}
    ${section('health', 'Здоровье питомца', `<nav class="subnav" aria-label="Данные о здоровье"><a href="#treatment">Назначения</a><a href="#laboratory">Анализы</a><a href="#prevention">Профилактика</a><a href="#visit-history">Приёмы</a></nav>
      ${hospital.length ? '<h3 class="subheading">Сейчас в стационаре</h3>' + renderHospital(hospital) : ''}
      <h3 id="treatment" class="subheading">Назначения и уход</h3><p class="muted">Рекомендации из завершённых приёмов. Дата показывает, когда врач их выдал.</p>${renderTreatment(visits)}
      <h3 id="laboratory" class="subheading">Анализы</h3>${historyNotice(snapshot.laboratoryOrders, snapshot.historyLimits?.laboratoryOrders, 'исследований')}${renderLaboratory(labs)}
      <h3 id="prevention" class="subheading">Профилактика</h3>${renderPrevention(pets)}
      <h3 id="visit-history" class="subheading">История приёмов</h3>${historyNotice(snapshot.visits, snapshot.historyLimits?.visits, 'приёмов')}${renderVisits(visits)}`, activeTab !== 'health')}
    ${section('appointments', 'Записи в клинику', `${historyNotice(snapshot.appointments, snapshot.historyLimits?.appointments, 'записей')}${renderAppointments(appointments)}<h3 class="subheading">Заявка в клинику</h3>${renderBookingForm(animals)}`, activeTab !== 'appointments')}
    ${section('documents', 'Документы', `<label class="search-label">Поиск в загруженных документах<input id="document-search" type="search" placeholder="Название или категория" value="${escapeHtml(documentQuery)}"></label>${historyNotice(snapshot.files, snapshot.historyLimits?.files, 'файлов')}<div id="document-results">${renderDocuments(searchDocuments(documents))}</div>`, activeTab !== 'documents')}
    ${section('bills', 'Счета и оплаты', `${!selectedAnimalId ? `<p class="muted">Баланс владельца по данным клиники: <strong>${formatMoney(owner.balance)}</strong></p>` : '<p class="muted">Показаны счета выбранного питомца. Счета без привязки к питомцу доступны при выборе «Все питомцы».</p>'}${historyNotice(snapshot.bills, snapshot.historyLimits?.bills, 'счетов')}${renderBills(bills)}`, activeTab !== 'bills')}
    ${section('notifications', 'Сообщения клиники', '<p class="muted">Общие сообщения владельцу — для всех питомцев.</p>' + historyNotice(notifications, snapshot.historyLimits?.notifications, 'сообщений') + renderNotifications(notifications), activeTab !== 'notifications')}
    <details class="portal-settings"><summary>Устройства, уведомления и контакты владельца</summary><p>${joinText([owner.phone, owner.extraPhone, owner.email, owner.address]) || 'Контакты не указаны'}</p><p class="muted">Для исправления контактов обратитесь в клинику.</p><div class="settings-actions">
      ${showBrowserTransfer ? '<button id="prepare-browser" class="button browser-only" type="button">Открыть в браузере</button><button id="copy-browser-link" class="button browser-only" type="button" hidden>Скопировать ссылку</button><span id="browser-hint" class="browser-hint browser-only" hidden>Нажмите значок браузера в MAX или скопируйте ссылку. Переход действует 10 минут.</span>' : ''}
      <button id="enable-push" class="button" type="button" hidden>Включить уведомления</button><span id="push-status" class="push-status" role="status" hidden></span></div></details>`;
  app.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
    selectTab(button.dataset.tab);
    if (button.dataset.tab === 'notifications') markNotificationsRead(response.ownerId, notifications);
  }));
  app.querySelector('[role="tablist"]').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...app.querySelectorAll('.tab')];
    const current = buttons.indexOf(event.target);
    if (current < 0) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index].click(); buttons[index].focus();
  });
  app.querySelectorAll('[data-open]').forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.open)));
  app.querySelectorAll('[data-change-appointment]').forEach((button) => button.addEventListener('click', () => prepareAppointmentChange(button.dataset.changeAppointment, button.dataset.requestType)));
  document.querySelector('#pet-filter').addEventListener('change', (event) => { selectedAnimalId = event.target.value; renderPortal(portalResponse); });
  document.querySelector('#document-search').addEventListener('input', (event) => { documentQuery = event.target.value; document.querySelector('#document-results').innerHTML = renderDocuments(searchDocuments(documents)); });
  document.querySelector('#refresh-portal').addEventListener('click', () => void refreshPortal());
  document.querySelector('#prepare-browser')?.addEventListener('click', prepareBrowserTransfer);
  document.querySelector('#copy-browser-link')?.addEventListener('click', copyBrowserTransferLink);
  document.querySelector('#enable-push')?.addEventListener('click', enablePushNotifications);
  const form = document.querySelector('#booking-form');
  form?.addEventListener('submit', submitBookingRequest);
  form?.elements.animalId.addEventListener('change', updateNewAnimalFields);
  bindBookingDraft();
  updateNewAnimalFields();
  void loadBookingRequests();
  void updateAppBadge(unread);
  void updatePushButton();
  if (window.sessionStorage.getItem(transferStorageKey)) showBrowserTransferReady();
}

function freshnessText(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Время обновления не указано';
  const stale = Date.now() - Date.parse(value) > 30 * 60_000;
  return `${stale ? 'Данные могут быть устаревшими. ' : ''}Данные клиники от ${formatDateTime(value)}`;
}

async function refreshPortal() {
  if (refreshing) return;
  refreshing = true;
  const button = document.querySelector('#refresh-portal');
  if (button) button.disabled = true;
  try {
    const response = await request('/v1/portal/me');
    // Re-rendering must not discard an unsent application or interrupt keyboard input.
    if (bookingDirty && portalResponse?.ownerId === response.ownerId) {
      pendingPortalResponse = response;
      const status = document.querySelector('#refresh-status');
      if (status) status.textContent = 'Новые данные получены. Завершите или очистите заявку, чтобы показать их.';
    } else {
      pendingPortalResponse = null;
      renderPortal(response);
    }
  } catch (error) {
    if (error.status === 401 || error.status === 403) { portalResponse = null; renderError(error.message); }
    else {
      const status = document.querySelector('#refresh-status');
      if (status) status.textContent = 'Не удалось обновить. На экране предыдущие данные. Повторите позже.';
    }
  } finally { refreshing = false; if (button) button.disabled = false; }
}

function renderHome({ pets, appointments, labs, hospital, bills }) {
  const next = appointments.filter((item) => ['PLANNED', 'ARRIVED', 'IN_PROGRESS'].includes(item.status) && new Date(item.endsAt || item.startsAt) >= new Date()).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0];
  const ready = labs.filter((order) => array(order.items).some((item) => item.status === 'COMPLETED'));
  const debt = bills.filter((bill) => !['CANCELLED', 'REFUNDED'].includes(bill.status)).reduce((sum, bill) => sum + Math.max(0, Number(bill.totalAmount) - Number(bill.paidAmount)), 0);
  return `<div class="overview-grid"><article class="next-appointment"><p class="eyebrow">Ближайшая запись</p><h3>${next ? formatDateTime(next.startsAt) : 'Ближайших записей нет'}</h3><p>${next ? joinText([next.animal?.nickname, next.employee?.fullName, next.room?.name]) : 'Выберите удобное время. Клиника подтвердит запись.'}</p><button type="button" class="button" data-open="${next ? 'appointments' : 'booking'}">${next ? 'Посмотреть запись' : 'Оставить заявку'}</button></article>
    <div class="summary-links"><button type="button" data-open="health"><strong>${ready.length}</strong><span>Исследований с готовыми результатами</span><span aria-hidden="true">→</span></button><button type="button" data-open="bills"><strong>${formatMoney(debt)}</strong><span>Остаток по загруженным счетам</span><span aria-hidden="true">→</span></button></div></div>
    ${hospital.length ? `<button type="button" class="hospital-summary-link" data-open="health"><strong>В стационаре: ${joinText(hospital.map((stay) => stay.animal?.nickname))}</strong><span>Посмотреть сводку ухода и последние измерения →</span></button>` : ''}
    ${pets.length ? '' : '<p class="booking-note">Питомцев пока нет в кабинете. В заявке можно указать нового питомца; клиника добавит карточку.</p>'}`;
}

function renderServicePromo() {
  return `<aside class="service-promo" aria-label="Сервис TemichevVet"><div class="service-promo-copy"><p class="eyebrow">TemichevVet · рядом каждый день</p><h3 class="service-promo-title">Паспорт питомца — всегда под рукой</h3><p class="service-promo-description">Вес, наблюдения, прививки и важные даты в личной карточке. Сохраняйте историю для следующего визита к врачу.</p><p class="service-promo-benefits">Карточка питомца · Напоминания · История наблюдений</p><a class="promo-text-link" href="https://temichevvet.ru" target="_blank" rel="noopener noreferrer">Есть вопросы о самочувствии? Открыть помощника →</a></div><div class="service-promo-action"><a class="button service-promo-link" href="https://temichevvet.ru/pet" target="_blank" rel="noopener noreferrer">Открыть паспорт питомца</a><p class="service-promo-note">Личный журнал в сервисе TemichevVet. Не заменяет официальный ветпаспорт. Данные клиники автоматически сюда не переносятся.</p></div></aside>`;
}

function renderTreatment(visits) {
  return renderGrid(visits.filter((item) => item.recommendation?.treatmentPlan || item.recommendation?.careNotes), (item) => `<article class="card"><h3>${escapeHtml(item.animal?.nickname)} · ${formatDate(item.startedAt)}</h3><p>${escapeHtml(item.employee?.fullName || 'Врач не указан')}</p>${item.recommendation.treatmentPlan ? `<h4>Назначения врача</h4><p class="multiline">${escapeHtml(item.recommendation.treatmentPlan)}</p>` : ''}${item.recommendation.careNotes ? `<h4>Уход</h4><p class="multiline">${escapeHtml(item.recommendation.careNotes)}</p>` : ''}</article>`, 'Назначений в загруженных завершённых приёмах пока нет.');
}

function renderLaboratory(orders) {
  return renderGrid(orders, (order) => `<article class="card laboratory-card"><h3>${escapeHtml(order.animal?.nickname || 'Питомец')} · ${formatDate(order.createdAt)}</h3><span class="badge">${escapeHtml(labStatusLabel(order.status))}</span><dl class="lab-results">${array(order.items).map((item) => `<div><dt>${escapeHtml(item.title)}</dt><dd><strong>${item.status === 'COMPLETED' ? joinText([item.resultValue ?? item.resultText ?? 'Готово', item.unit]) : escapeHtml(labStatusLabel(item.status))}</strong>${item.status === 'COMPLETED' && item.resultValue && item.resultText ? `<p class="multiline">${escapeHtml(item.resultText)}</p>` : ''}${item.referenceRange ? `<span class="muted">Референс: ${escapeHtml(item.referenceRange)}${item.unit ? ` ${escapeHtml(item.unit)}` : ''}</span>` : ''}${item.completedAt ? `<span class="muted">Результат от ${formatDateTime(item.completedAt)}</span>` : ''}</dd></div>`).join('')}</dl><p class="muted">Результаты оценивает лечащий врач с учётом состояния питомца.</p></article>`, 'Исследований пока нет в кабинете. Готовые результаты появятся автоматически.');
}

function renderPrevention(pets) {
  return renderGrid(pets, (pet) => `<article class="card"><h3>${escapeHtml(pet.nickname)}</h3>${array(pet.vaccinations).length ? array(pet.vaccinations).map((item) => `<div class="prevention-row"><strong>${escapeHtml(item.title)}</strong><p>Вакцинация: ${formatDate(item.vaccinatedAt)}</p>${item.expiresAt ? `<p>Действует до ${formatDate(item.expiresAt)}</p>${Date.parse(item.expiresAt) < Date.now() ? '<p class="attention">Указанный срок истёк — уточните план вакцинации в клинике.</p>' : ''}` : '<p>Следующая дата не указана</p>'}<p>${joinText([item.vaccineSeries && `Серия ${item.vaccineSeries}`, item.vaccineBatch && `Партия ${item.vaccineBatch}`])}</p></div>`).join('') : '<p>В клинической карточке пока нет записей о прививках. Это не означает, что питомец не привит.</p>'}<p class="muted">В кабинете — до 20 записей о прививках.</p></article>`);
}

function renderHospital(stays) {
  return renderGrid(stays, (stay) => `<article class="card hospital-card"><h3>${escapeHtml(stay.animal?.nickname || 'Питомец')} <span class="badge">В стационаре</span></h3><p>С ${formatDateTime(stay.startedAt)}</p><p>Ответственный врач: ${escapeHtml(stay.employee?.fullName || 'Не указан')}</p><p>Данные от ${formatDateTime(stay.updatedAt)}</p>${stay.latestTemperature ? `<p>Последняя температура: <strong>${escapeHtml(stay.latestTemperature.value)} °C</strong> · ${formatDateTime(stay.latestTemperature.measuredAt)}</p>` : '<p>Замеров температуры в сводке пока нет.</p>'}<p>${array(stay.completedCare).filter((item) => item.count > 0).map((item) => `${escapeHtml(({ MEDICATION: 'Выполнено введений препаратов', PROCEDURE: 'Процедур', FEEDING: 'Кормлений', CARE: 'Мероприятий ухода' })[item.type] || item.type)}: ${escapeHtml(item.count)}`).join('<br>') || 'Выполненные мероприятия пока не внесены.'}</p><p class="muted">${stay.recordsLimited ? 'Сводка по последним 100 выполненным записям.' : 'Сводка выполненных мероприятий за госпитализацию.'} Подробности состояния уточняйте у лечащего врача.</p></article>`);
}

function historyNotice(items, limit, label) {
  return limit && array(items).length >= limit ? `<p class="history-note">Показаны последние ${limit} ${label}. Более ранние данные можно запросить в клинике.</p>` : '';
}
function searchDocuments(items) { const query = documentQuery.trim().toLocaleLowerCase('ru'); return items.filter((item) => [item.fileName, item.title, item.archiveCategory, item.animalName, item.visit?.animal?.nickname].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query)); }
function labStatusLabel(value) { return ({ ORDERED: 'Назначено', IN_PROGRESS: 'В работе', COMPLETED: 'Готово', CANCELLED: 'Отменено' })[value] || 'Ожидает результата'; }

function renderBookingForm(animals) {
  return `<div class="booking-layout"><form id="booking-form" class="booking-form">
    <p class="booking-note" id="booking-purpose"><strong>Это заявка.</strong> Администратор свяжется с вами и подтвердит точное время приёма.</p>
    <input type="hidden" name="requestType" value="NEW"><input type="hidden" name="appointmentId" value="">
    <label>Питомец<select name="animalId">${animals.map((animal) => `<option value="${escapeHtml(animal.id)}"${animal.id === selectedAnimalId ? ' selected' : ''}>${escapeHtml(animal.nickname)}</option>`).join('')}<option value="">Новый питомец</option></select></label>
    <div id="new-animal-fields"><label>Кличка<input name="animalNickname" maxlength="160" autocomplete="off"></label><label>Вид животного<input name="animalSpecies" maxlength="120" placeholder="Например, кошка"></label></div>
    <label>Желаемая дата и время<input name="preferredAt" type="datetime-local"><small class="muted">Время вашего устройства. Точное время подтвердит клиника.</small></label>
    <label>Причина обращения<textarea name="comment" maxlength="1000" rows="3" placeholder="Причина обращения и удобное время для звонка"></textarea></label>
    <label class="booking-consent"><input name="contactConsent" type="checkbox" required> Разрешаю клинике связаться со мной по этой заявке</label>
    <div class="form-actions"><button class="button" type="submit">Отправить заявку</button><button class="button secondary" id="clear-booking" type="button">Очистить</button></div><span id="booking-status" role="status" class="booking-status"></span>
  </form><div><h3>Мои заявки</h3><p class="muted">Последние 20 заявок. Решение клиники обновляется автоматически.</p><div id="booking-requests" class="booking-requests">Загружаем…</div></div></div>`;
}

function bindBookingDraft() {
  const form = document.querySelector('#booking-form');
  if (!form) return;
  for (const [name, value] of Object.entries(bookingDraft)) {
    const input = form.elements.namedItem(name);
    if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; }
  }
  form.addEventListener('input', rememberBookingDraft);
  form.addEventListener('change', rememberBookingDraft);
  document.querySelector('#clear-booking').addEventListener('click', () => {
    bookingDirty = false; bookingDraft = {}; bookingAttempt = null;
    renderPortal(pendingPortalResponse || portalResponse); pendingPortalResponse = null;
  });
  if (form.elements.requestType.value !== 'NEW') {
    document.querySelector('#booking-purpose').textContent = form.elements.requestType.value === 'CANCEL'
      ? 'Заявка на отмену. До подтверждения клиникой запись остаётся в расписании.'
      : 'Заявка на перенос. До подтверждения клиникой действует прежнее время.';
  }
}

function rememberBookingDraft() {
  const form = document.querySelector('#booking-form');
  bookingDraft = Object.fromEntries(new FormData(form));
  bookingDraft.contactConsent = form.elements.contactConsent.checked;
  bookingDirty = true;
}

function updateNewAnimalFields() {
  const form = document.querySelector('#booking-form');
  if (!form) return;
  const isNew = !form.elements.animalId.value;
  const fields = document.querySelector('#new-animal-fields');
  fields.hidden = !isNew;
  form.elements.animalNickname.required = isNew;
}

function prepareAppointmentChange(id, type) {
  const appointment = array(portalResponse?.snapshot?.appointments).find((item) => item.id === id);
  if (!appointment) return;
  const form = document.querySelector('#booking-form');
  form.elements.requestType.value = type;
  form.elements.appointmentId.value = id;
  form.elements.animalId.value = appointment.animal?.id || '';
  document.querySelector('#booking-purpose').textContent = `${type === 'CANCEL' ? 'Отмена' : 'Перенос'} записи ${formatDateTime(appointment.startsAt)}. До подтверждения клиникой действует прежняя запись.`;
  form.elements.preferredAt.value = '';
  form.elements.contactConsent.checked = false;
  rememberBookingDraft(); updateNewAnimalFields(); selectTab('booking');
}

async function submitBookingRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const status = document.querySelector('#booking-status');
  const values = new FormData(form);
  const payload = {
    requestType: String(values.get('requestType') || 'NEW'), appointmentId: String(values.get('appointmentId') || '') || undefined,
    animalId: String(values.get('animalId') || '') || undefined,
    animalNickname: String(values.get('animalNickname') || '') || undefined,
    animalSpecies: String(values.get('animalSpecies') || '') || undefined,
    preferredAt: values.get('preferredAt') ? new Date(String(values.get('preferredAt'))).toISOString() : undefined,
    comment: String(values.get('comment') || ''), contactConsent: values.get('contactConsent') === 'on',
  };
  const fingerprint = JSON.stringify(payload);
  if (!bookingAttempt || bookingAttempt.fingerprint !== fingerprint) bookingAttempt = { fingerprint, id: createClientRequestId() };
  button.disabled = true;
  if (status) status.textContent = 'Отправляем…';
  try {
    await request('/v1/portal/booking-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...payload, clientRequestId: bookingAttempt.id }) });
    bookingDirty = false; bookingDraft = {}; bookingAttempt = null;
    form.reset(); form.elements.requestType.value = 'NEW'; form.elements.appointmentId.value = ''; updateNewAnimalFields();
    document.querySelector('#booking-purpose').textContent = 'Это заявка. Администратор свяжется с вами и подтвердит точное время приёма.';
    if (status) status.textContent = 'Заявка отправлена. Дождитесь подтверждения клиники.';
    await loadBookingRequests();
    if (pendingPortalResponse) {
      const latest = pendingPortalResponse; pendingPortalResponse = null; renderPortal(latest);
      document.querySelector('#booking-status').textContent = 'Заявка отправлена. Дождитесь подтверждения клиники.';
    }
  } catch (error) {
    if (status) status.textContent = `${error instanceof Error ? error.message : 'Не удалось отправить заявку'}. Повторите отправку: неизменённая заявка не продублируется.`;
  } finally { button.disabled = false; }
}

async function loadBookingRequests() {
  const container = document.querySelector('#booking-requests');
  if (!container) return;
  try {
    const items = array(await request('/v1/portal/booking-requests')).filter((item) => !selectedAnimalId || item.animalId === selectedAnimalId);
    if (!container.isConnected) return;
    container.innerHTML = items.length ? items.map((item) => `<article class="booking-request"><strong>${escapeHtml(item.animalNickname || 'Питомец')}</strong><span class="badge">${escapeHtml(bookingStatusLabel(item.clinicStatus || item.status))}</span><span>Отправлена ${formatDateTime(item.createdAt)}</span><span>Желаемое время: ${formatDateTime(item.preferredAt)}</span>${item.appointment ? `<strong>Запись в клинике: ${formatDateTime(item.appointment.startsAt)}</strong><span>${escapeHtml(statusLabel(item.appointment.status))}</span>` : ''}${item.comment ? `<p class="multiline">${escapeHtml(item.comment)}</p>` : ''}${item.clinicUpdatedAt ? `<span class="muted">Ответ клиники от ${formatDateTime(item.clinicUpdatedAt)}</span>` : '<span class="muted">Подтверждение времени ещё не поступило.</span>'}</article>`).join('') : '<p class="muted">Для выбранного питомца заявок пока нет.</p>';
  } catch { if (container.isConnected) container.innerHTML = '<p class="muted">Не удалось загрузить заявки. Нажмите «Обновить», чтобы повторить.</p>'; }
}
function createClientRequestId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`; }
function bookingStatusLabel(status) { return ({ NEW: 'Ожидает обработки', IMPORTED: 'Передана в клинику', IN_REVIEW: 'Клиника рассматривает', ACCEPTED: 'Принята клиникой', REJECTED: 'Не подтверждена', CANCELLED: 'Заявка отменена', ARCHIVED: 'Заявка закрыта' })[status] || 'Обрабатывается клиникой'; }

async function prepareBrowserTransfer() {
  const button = document.querySelector('#prepare-browser');
  if (!button) return;

  button.disabled = true;
  button.textContent = 'Готовим переход…';
  try {
    const transfer = await request('/v1/portal/session-transfer', { method: 'POST' });
    prepareTransferUrl(transfer.transferToken);
    showBrowserTransferReady();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Открыть в браузере';
    window.alert(error instanceof Error ? error.message : 'Не удалось подготовить переход в браузер');
  }
}

async function copyBrowserTransferLink() {
  const button = document.querySelector('#copy-browser-link');
  if (!button) return;

  try {
    await navigator.clipboard.writeText(window.location.href);
    button.textContent = 'Ссылка скопирована';
  } catch {
    window.alert('Не удалось скопировать автоматически. Нажмите значок браузера внизу экрана MAX.');
  }
}

function showBrowserTransferReady() {
  const button = document.querySelector('#prepare-browser');
  const copyButton = document.querySelector('#copy-browser-link');
  const hint = document.querySelector('#browser-hint');
  if (button) {
    button.disabled = false;
    button.textContent = 'Переход в браузер готов';
  }
  if (copyButton) copyButton.hidden = false;
  if (hint) hint.hidden = false;
}

function selectTab(name) {
  const booking = name === 'booking';
  name = booking ? 'appointments' : name;
  activeTab = name;
  app.querySelectorAll('.tab').forEach((button) => { button.setAttribute('aria-selected', String(button.dataset.tab === name)); button.tabIndex = button.dataset.tab === name ? 0 : -1; });
  app.querySelectorAll('.panel').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
  if (booking) document.querySelector('#booking-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function renderAnimals(items) {
  return renderGrid(items, (animal) => `
    <article class="card"><h3>${escapeHtml(animal.nickname || 'Без клички')}</h3>
      <p>${joinText([animal.species, animal.breed]) || 'Вид и порода не указаны'}</p>
      <p><strong>Пол:</strong> ${escapeHtml(sexLabel(animal.sex))}</p>
      <p><strong>Дата рождения:</strong> ${formatDate(animal.birthDate)}</p>
      <p><strong>Окрас:</strong> ${escapeHtml(animal.color || '—')}</p>
      <p><strong>Микрочип:</strong> ${escapeHtml(animal.microchip || '—')}</p>
      <p><strong>Клеймо:</strong> ${escapeHtml(animal.mark || '—')}</p>
      <p><strong>Статус карточки:</strong> ${escapeHtml(({ ACTIVE: 'Активна', DECEASED: 'Отмечен как умерший', LOST: 'Отмечен как пропавший' })[animal.status] || animal.status || 'Не указан')}</p>
      <p><strong>Последний вес:</strong> ${array(animal.weights).length ? `${escapeHtml(animal.weights[0].weightKg)} кг · ${formatDate(animal.weights[0].measuredAt)}` : '—'}</p>
      ${array(animal.weights).length ? `<details><summary>История веса · до 20 замеров</summary>${array(animal.weights).map((item) => `<p>${formatDate(item.measuredAt)} — ${escapeHtml(item.weightKg)} кг</p>`).join('')}</details>` : ''}
      ${array(animal.vaccinations).length ? `<details><summary>Прививки</summary>${array(animal.vaccinations).map((item) => `<p><strong>${escapeHtml(item.title)}</strong><br>${formatDate(item.vaccinatedAt)} · ${escapeHtml(item.status || 'Статус не указан')}${item.expiresAt ? `<br>Действует до ${formatDate(item.expiresAt)}` : ''}${item.vaccineSeries ? `<br>Серия: ${escapeHtml(item.vaccineSeries)}` : ''}${item.vaccineBatch ? `<br>Партия: ${escapeHtml(item.vaccineBatch)}` : ''}</p>`).join('')}</details>` : '<p><strong>Прививки:</strong> —</p>'}
    </article>`);
}

function renderAppointments(items) {
  return renderGrid(items, (item) => `
    <article class="card"><h3>${formatDateTime(item.startsAt)}</h3>
      <p><strong>Пациент:</strong> ${escapeHtml(item.animal?.nickname || '—')}</p>
      <p><strong>Статус:</strong> ${escapeHtml(statusLabel(item.status))}</p>
      <p><strong>Врач:</strong> ${escapeHtml(item.employee?.fullName || '—')}</p>
      <p><strong>Кабинет:</strong> ${escapeHtml(item.room?.name || '—')}</p>${item.status === 'PLANNED' && Date.parse(item.startsAt) > Date.now() ? `<div class="form-actions"><button type="button" class="button secondary" data-change-appointment="${escapeHtml(item.id)}" data-request-type="RESCHEDULE">Попросить перенос</button><button type="button" class="button secondary" data-change-appointment="${escapeHtml(item.id)}" data-request-type="CANCEL">Попросить отмену</button></div>` : ''}
    </article>`);
}

function renderVisits(items) {
  return renderGrid(items, (item) => `
    <article class="card"><details><summary>${formatDateTime(item.startedAt)} · ${escapeHtml(item.animal?.nickname || 'Питомец')}</summary>
      <p><strong>Врач:</strong> ${escapeHtml(item.employee?.fullName || '—')}</p>
      <p><strong>Цель приёма:</strong> ${escapeHtml(item.exam?.purpose || '—')}</p>
      <p><strong>Анамнез:</strong> ${escapeHtml(item.exam?.anamnesis || '—')}</p>
      <p><strong>Осмотр:</strong> ${escapeHtml(item.exam?.examination || '—')}</p>
      <p><strong>Симптомы:</strong> ${escapeHtml(item.exam?.symptoms || '—')}</p>
      <p><strong>Вес:</strong> ${escapeHtml(item.exam?.weightKg ?? '—')}${item.exam?.weightKg ? ' кг' : ''}</p>
      <p><strong>Температура:</strong> ${escapeHtml(item.exam?.temperatureC ?? '—')}${item.exam?.temperatureC ? ' °C' : ''}</p>
      <p><strong>Диагноз:</strong> ${array(item.diagnoses).length ? array(item.diagnoses).map((value) => `${escapeHtml(value.title)}${value.diagnosisType ? ` (${escapeHtml(value.diagnosisType)})` : ''}${value.description ? ` — ${escapeHtml(value.description)}` : ''}`).join('<br>') : '—'}</p>
      <p><strong>Манипуляции:</strong> ${escapeHtml(item.exam?.manipulations || '—')}</p>
      <p><strong>Стационар:</strong> ${array(item.hospitalRecords).length ? array(item.hospitalRecords).map((record) => `${formatDateTime(record.recordedAt)} — ${escapeHtml(record.title)}${record.temperatureC ? ` (${escapeHtml(record.temperatureC)} °C)` : record.value ? ` (${escapeHtml(record.value)})` : ''}`).join('<br>') : '—'}</p>
      <p><strong>Анализы:</strong> ${array(item.laboratoryOrders).flatMap((order) => array(order.items)).length ? array(item.laboratoryOrders).flatMap((order) => array(order.items)).map((result) => `${escapeHtml(result.title)}: ${escapeHtml(result.resultValue || result.resultText || 'результат не внесён')}${result.unit ? ` ${escapeHtml(result.unit)}` : ''}`).join('<br>') : '—'}</p>
      <p><strong>Лечение:</strong> ${escapeHtml(item.recommendation?.treatmentPlan || '—')}</p>
      <p><strong>Уход:</strong> ${escapeHtml(item.recommendation?.careNotes || '—')}</p>
    </details></article>`);
}

function renderDocuments(items) {
  if (!items.length && documentQuery.trim()) return '<div class="empty">По запросу ничего не найдено. Попробуйте другое название.</div>';
  return renderGrid(items, (item) => item.documentKind === 'file' ? `
    <article class="card"><h3>${escapeHtml(item.fileName || 'Документ')}</h3>
      <p>${formatDateTime(item.documentDate || item.sourceCreatedAt)} · ${escapeHtml(item.animalName || 'Пациент')}</p>
      <p>${joinText([item.archiveCategory, item.sourceLabel, formatFileSize(item.sizeBytes)])}</p>
      <a class="button" href="/v1/portal/documents/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">Открыть</a>
    </article>` : `
    <article class="card"><h3>${escapeHtml(item.title || 'Документ')}</h3>
      <p>${formatDateTime(item.createdAt)} · ${escapeHtml(item.visit?.animal?.nickname || 'Пациент')}</p>
      ${item.body ? `<div class="document-body">${escapeHtml(item.body).replaceAll('\n', '<br>')}</div>` : ''}
    </article>`);
}

function renderBills(items) {
  return renderGrid(items, (item) => `
    <article class="card"><h3>${formatMoney(item.totalAmount)} · ${escapeHtml(item.animal?.nickname || 'Счёт')}</h3>
      <p><strong>Дата:</strong> ${formatDateTime(item.createdAt)}</p>
      <p><strong>Статус:</strong> ${escapeHtml(billStatusLabel(item.status))}</p>
      <p><strong>Оплачено:</strong> ${formatMoney(item.paidAmount)}</p>${!['CANCELLED', 'REFUNDED'].includes(item.status) ? `<p><strong>Остаток:</strong> ${formatMoney(Math.max(0, Number(item.totalAmount) - Number(item.paidAmount)))}</p>${Number(item.paidAmount) > Number(item.totalAmount) ? `<p>Оплата сверх суммы счёта: ${formatMoney(Number(item.paidAmount) - Number(item.totalAmount))}. Уточните зачёт в клинике.</p>` : ''}` : ''}
      <p>${array(item.items).map((value) => `${escapeHtml(value.title)} — ${escapeHtml(value.quantity)} шт., сумма ${formatMoney(value.totalAmount)}`).join('<br>') || 'Позиции не указаны'}</p>
    </article>`);
}

function renderNotifications(items) {
  return renderGrid(items, (item) => `
    <article class="card"><h3>${escapeHtml(item.subject || 'Сообщение клиники')}</h3>
      <p>${formatDateTime(item.sentAt || item.createdAt)}</p>
      <p>${escapeHtml(item.body || '').replaceAll('\n', '<br>')}</p>
    </article>`);
}

function renderGrid(items, renderer, empty = 'В этом разделе пока нет данных.') {
  return items.length ? `<div class="grid">${items.map(renderer).join('')}</div>` : `<div class="empty">${escapeHtml(empty)}</div>`;
}

function tabButton(name, text, selected = false, unread = 0) {
  const unreadBadge = unread > 0 ? `<span class="tab-unread" aria-label="Непрочитанных сообщений: ${unread}">${unread}</span>` : '';
  return `<button class="tab" role="tab" id="tab-${name}" aria-controls="panel-${name}" tabindex="${selected ? 0 : -1}" type="button" data-tab="${name}" aria-selected="${selected}">${escapeHtml(text)}${unreadBadge}</button>`;
}

function section(name, title, content, hidden) {
  return `<section class="panel" role="tabpanel" id="panel-${name}" aria-labelledby="tab-${name}" data-panel="${name}"${hidden ? ' hidden' : ''}><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function renderError(message) {
  logoutButton.hidden = true;
  app.innerHTML = `<section class="state-card"><h1>Кабинет пока не открыт</h1><p>${escapeHtml(message)}</p><p class="muted">Откройте последнее приглашение клиники в MAX или Telegram. Если ссылка уже использована или истекла, попросите клинику прислать новую ссылку или QR-код.</p><button type="button" class="button" id="retry-portal">Повторить вход</button></section>`;
  document.querySelector('#retry-portal').addEventListener('click', () => { void start(); });
}

function isStandaloneMode() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function getUnreadNotificationCount(ownerId, notifications) {
  const key = `${readNotificationsStoragePrefix}${ownerId}`;
  const currentIds = notifications.map((item) => item?.id).filter((id) => typeof id === 'string');
  const stored = window.localStorage.getItem(key);
  if (stored === null) {
    window.localStorage.setItem(key, JSON.stringify(currentIds));
    return 0;
  }

  let readIds = [];
  try {
    const parsed = JSON.parse(stored);
    readIds = Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    readIds = [];
  }
  const known = new Set(readIds);
  return currentIds.filter((id) => !known.has(id)).length;
}

function markNotificationsRead(ownerId, notifications) {
  const ids = notifications.map((item) => item?.id).filter((id) => typeof id === 'string').slice(0, 100);
  window.localStorage.setItem(`${readNotificationsStoragePrefix}${ownerId}`, JSON.stringify(ids));
  document.querySelector('[data-tab="notifications"] .tab-unread')?.remove();
  void updateAppBadge(0);
}

async function updateAppBadge(count) {
  if (count > 0 && 'setAppBadge' in navigator) {
    try { await navigator.setAppBadge(count); } catch {}
    return;
  }
  if ('clearAppBadge' in navigator) {
    try { await navigator.clearAppBadge(); } catch {}
  }
}

async function updatePushButton() {
  const button = document.querySelector('#enable-push');
  if (!button) return;

  if (isIosDevice() && !isStandaloneMode()) {
    button.hidden = true;
    setPushStatus('На iPhone уведомления включаются после добавления личного кабинета на экран «Домой».');
    return;
  }

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) {
    button.hidden = true;
    setPushStatus('Этот браузер не поддерживает push-уведомления. Сообщения останутся доступны в личном кабинете.');
    return;
  }

  button.hidden = false;
  if (Notification.permission === 'denied') {
    button.textContent = 'Уведомления запрещены';
    button.disabled = true;
    setPushStatus('Разрешите уведомления для личного кабинета в настройках устройства.');
    return;
  }

  try {
    const config = await request('/v1/portal/push/config');
    if (!config?.available || typeof config.publicKey !== 'string') {
      button.textContent = 'Уведомления пока недоступны';
      button.disabled = true;
      setPushStatus('Клиника ещё не завершила настройку push-уведомлений. Сообщения в кабинете работают.');
      return;
    }

    const registration = await getPushServiceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (subscription && Notification.permission === 'granted') {
      await savePushSubscription(subscription);
      button.textContent = 'Уведомления включены';
      button.disabled = true;
      setPushStatus('Новые сообщения будут появляться как уведомления на этом устройстве.');
      return;
    }

    button.textContent = 'Включить уведомления';
    button.disabled = false;
    setPushStatus('Нажмите кнопку и подтвердите разрешение в системном окне.');
  } catch (error) {
    button.textContent = 'Повторить подключение уведомлений';
    button.disabled = false;
    setPushStatus(error instanceof Error ? error.message : 'Не удалось проверить push-уведомления.');
  }
}

async function enablePushNotifications() {
  const button = document.querySelector('#enable-push');
  if (!button || !('Notification' in window)) return;

  button.disabled = true;
  button.textContent = 'Запрашиваем разрешение…';
  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') {
      button.textContent = 'Уведомления не разрешены';
      button.disabled = permission === 'denied';
      setPushStatus(permission === 'denied'
        ? 'Разрешите уведомления в настройках устройства и откройте приложение снова.'
        : 'Без разрешения сообщения останутся доступны внутри личного кабинета.');
      return;
    }

    button.textContent = 'Подключаем уведомления…';
    const config = await request('/v1/portal/push/config');
    if (!config?.available || typeof config.publicKey !== 'string') {
      throw new Error('Push-уведомления пока не настроены клиникой');
    }

    const registration = await getPushServiceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
    }
    await savePushSubscription(subscription);
    button.textContent = 'Уведомления включены';
    button.disabled = true;
    setPushStatus('Готово. Новые сообщения будут появляться как уведомления на этом устройстве.');
  } catch (error) {
    button.textContent = 'Включить уведомления';
    button.disabled = false;
    setPushStatus(error instanceof Error ? error.message : 'Не удалось включить уведомления');
  }
}

async function savePushSubscription(subscription) {
  const value = subscription.toJSON();
  if (!value.endpoint || !value.keys?.p256dh || !value.keys?.auth) {
    throw new Error('Браузер не создал подписку на уведомления');
  }

  await request('/v1/portal/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      endpoint: value.endpoint,
      p256dh: value.keys.p256dh,
      auth: value.keys.auth,
    }),
  });
}

function setPushStatus(text) {
  const status = document.querySelector('#push-status');
  if (!status) return;
  status.textContent = text;
  status.hidden = !text;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

async function removeCurrentPushSubscription() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await getPushServiceWorkerRegistration();
  const subscription = await registration.pushManager?.getSubscription();
  if (!subscription) return;
  try {
    await request('/v1/portal/push/subscriptions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
  } finally {
    await subscription.unsubscribe();
  }
}

async function getPushServiceWorkerRegistration() {
  const registration = await withTimeout(
    serviceWorkerRegistrationPromise,
    15_000,
    'Не удалось подготовить уведомления. Закройте приложение, откройте снова и повторите.',
  );
  if (!registration) {
    throw new Error('Не удалось подготовить push-уведомления в этом браузере');
  }
  return registration;
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => window.setTimeout(() => reject(new Error(message)), timeoutMs)),
  ]);
}

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function array(value) { return Array.isArray(value) ? value : []; }
function joinText(values) { return values.filter(Boolean).map(escapeHtml).join(' · '); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function formatDate(value) { return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ru-RU').format(new Date(value)) : '—'; }
function formatDateTime(value) { return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function formatMoney(value) { if (value === null || value === undefined || value === '') return '—'; const amount = Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(amount) : '—'; }
function formatFileSize(value) { const bytes = Number(value); return Number.isFinite(bytes) && bytes >= 0 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : ''; }
function sexLabel(value) { return value === 'MALE' ? 'Самец' : value === 'FEMALE' ? 'Самка' : 'Не указан'; }
function statusLabel(value) { return ({ PLANNED: 'Запланирована', ARRIVED: 'В клинике', IN_PROGRESS: 'Идёт приём', COMPLETED: 'Завершена', CANCELLED: 'Отменена', NO_SHOW: 'Не пришли' })[value] || value || '—'; }
function billStatusLabel(value) { return ({ UNPAID: 'Не оплачен', PARTIAL: 'Оплачен частично', PAID: 'Оплачен', REFUNDED: 'Возврат', CANCELLED: 'Отменён' })[value] || value || '—'; }
