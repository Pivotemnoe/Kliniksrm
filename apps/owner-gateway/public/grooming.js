const app = document.querySelector('#grooming-app');
const statuses = { CONFIRMED: 'Записан', ARRIVED: 'Пришёл', IN_PROGRESS: 'На процедуре', COMPLETED: 'Завершён', CANCELLED: 'Отменён', NO_SHOW: 'Не пришёл' };
const species = { DOG: 'Собака', CAT: 'Кошка' };
let state = null, offers = [], selected = '', moving = null, draft = {}, busy = false, loginTimer = null, loginPolling = false, catalogue = [];
const pendingKey = 'temichevvet-grooming-pending-operation';
const incomingDraft = new URLSearchParams(location.hash.slice(1)).get('draft');
if (incomingDraft) { sessionStorage.setItem('grooming-draft-token', incomingDraft); history.replaceState({}, '', '/portal/grooming'); }
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const array = value => Array.isArray(value) ? value : [];
const day = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const dateTime = (value, timezone = 'Europe/Moscow') => new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, dateStyle: 'long', timeStyle: 'short' }).format(new Date(value));
const time = (value, timezone = 'Europe/Moscow') => new Intl.DateTimeFormat('ru-RU', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const activeBookingStatuses = ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'];
let bookingRefreshRunning = false, lastBookingRefresh = 0;
function durationLabel(minutes) { return [Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} ч` : '', minutes % 60 ? `${minutes % 60} мин` : ''].filter(Boolean).join(' '); }
function bookingDurationText(b) {
  const minutes = (Date.parse(b.endsAt) - Date.parse(b.startsAt)) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const zone = b.location.timezone, localDay = value => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
  const end = localDay(b.startsAt) === localDay(b.endsAt) ? time(b.endsAt, zone) : dateTime(b.endsAt, zone);
  return `Длительность: ${durationLabel(minutes)}. Ориентировочное окончание: ${end}`;
}
async function refreshBookingTimes() {
  if (!state || busy || moving || selected || document.hidden || bookingRefreshRunning || sessionStorage.getItem(pendingKey) || Date.now() - lastBookingRefresh < 15000 || !array(state.bookings).some(b => activeBookingStatuses.includes(b.status) && Date.parse(b.endsAt) > Date.now())) return;
  bookingRefreshRunning = true; lastBookingRefresh = Date.now(); const currentState = state;
  try {
    const fresh = await command('STATE');
    if (state !== currentState || busy || moving || selected || document.hidden) return;
    const changed = [];
    for (const next of array(fresh.bookings)) {
      const current = state.bookings.find(b => b.id === next.id);
      if (!current || current.startsAt === next.startsAt && current.endsAt === next.endsAt) continue;
      const oldMinutes = (Date.parse(current.endsAt) - Date.parse(current.startsAt)) / 60000;
      const durationOnly = current.startsAt === next.startsAt;
      Object.assign(current, next);
      for (const element of app.querySelectorAll('[data-booking-duration]')) if (element.dataset.bookingDuration === next.id) element.textContent = bookingDurationText(next);
      for (const element of app.querySelectorAll('[data-booking-start]')) if (element.dataset.bookingStart === next.id) element.textContent = dateTime(next.startsAt, next.location.timezone);
      changed.push(durationOnly ? `${next.animal.nickname}: длительность записи изменена — было ${durationLabel(oldMinutes)}, стало ${durationLabel((Date.parse(next.endsAt) - Date.parse(next.startsAt)) / 60000)}.` : `${next.animal.nickname}: время записи обновлено.`);
    }
    const notice = document.querySelector('#booking-time-update');
    if (changed.length && notice) { notice.textContent = changed.join(' '); notice.hidden = false; }
  } catch { /* Keep the current booking form; its refresh button can retry. */ }
  finally { bookingRefreshRunning = false; }
}

function lookLabel(id) { const [breedId, styleId] = id.split(':'); const breed = catalogue.find(item => item.id === breedId), style = breed?.styles.find(item => item.id === styleId); return style ? `${breed.name} · ${style.name}` : id; }

async function api(path, body) {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error(Array.isArray(payload?.message) ? payload.message.join('. ') : payload?.message || 'Нет связи с кабинетом'); error.status = response.status; throw error; }
  return payload;
}
async function waitOperation(operation) {
  for (let attempt = 0; attempt < 35 && operation.status === 'PENDING'; attempt++) { await delay(1000); operation = await api(`/v1/portal/grooming/operations/${operation.id}`); }
  if (operation.status === 'PENDING') throw new Error('CRM ещё проверяет запрос. Нажмите «Обновить»: результат сохранится, повторную запись создавать не нужно.');
  if (operation.status !== 'DONE') { const error = new Error(operation.error || 'Не удалось выполнить действие'); error.terminal = true; throw error; }
  return operation.result;
}
async function command(kind, input = {}) {
  const clientKey = crypto.randomUUID(), mutation = ['BOOK', 'RESCHEDULE', 'CANCEL', 'PET_CREATE'].includes(kind);
  if (mutation && sessionStorage.getItem(pendingKey)) await recover();
  if (mutation) sessionStorage.setItem(pendingKey, JSON.stringify({ clientKey, kind }));
  try {
    const operation = await api('/v1/portal/grooming/operations', { clientKey, kind, input });
    const result = await waitOperation(operation);
    if (mutation) sessionStorage.removeItem(pendingKey);
    return result;
  } catch (error) {
    if (mutation && (error.terminal || error.status && error.status < 500)) sessionStorage.removeItem(pendingKey);
    throw error;
  }
}
async function recover() {
  const stored = sessionStorage.getItem(pendingKey);
  if (!stored) return;
  const pending = JSON.parse(stored);
  try { const operation = await api(`/v1/portal/grooming/operations/by-key/${encodeURIComponent(pending.clientKey)}`); await waitOperation(operation); sessionStorage.removeItem(pendingKey); }
  catch (error) { if (error.status === 404 || error.terminal) sessionStorage.removeItem(pendingKey); else throw error; }
}
async function start() {
  try {
    await api('/v1/portal/me');
    await recover();
    state = await command('STATE'); lastBookingRefresh = Date.now();
    if (!catalogue.length) { try { catalogue = (await api('/v1/public/grooming/catalog')).breeds || []; } catch {} }
    const token = sessionStorage.getItem('grooming-draft-token');
    if (token) { try { draft = { ...draft, ...await api('/v1/portal/grooming/draft', { token }) }; } finally { sessionStorage.removeItem('grooming-draft-token'); } }
    document.querySelector('#logout').hidden = false;
    render();
  } catch (error) { if ([401, 403].includes(error.status)) renderLogin(); else renderFailure(error.message); }
}
function renderFailure(message) {
  app.innerHTML = `<section class="state"><p class="eyebrow">Личный кабинет</p><h1>Проверяем связь</h1><p role="alert">${escape(message)}</p><button class="button" id="retry">Обновить</button></section>`;
  document.querySelector('#retry').onclick = () => { app.innerHTML = '<section class="state">Проверяем сохранённый результат…</section>'; void start(); };
}
function renderLogin() {
  app.innerHTML = `<section class="login-layout"><div class="login-copy"><p class="eyebrow">Уход с вниманием</p><h1>Время для<br>вашего питомца.</h1><p>Выберите грумера и удобное время. Запись, перенос и история ухода — в одном кабинете.</p><div class="login-points"><span>Собаки и кошки</span><span>Реальное расписание</span><span>Напоминания в MAX</span></div></div><section class="login-card"><p class="eyebrow">Ваш кабинет</p><h2>Войти через MAX</h2><p>Используем текущего бота клиники. Если кабинет уже связан с MAX, откроются ваши питомцы и записи.</p><button class="button" id="begin-login">Продолжить в MAX ↗</button><div id="login-status" role="status"></div><p class="muted">Для нового клиента создадим кабинет после подтверждения входа. Номер телефона сам по себе не открывает чужую карточку.</p></section></section>`;
  document.querySelector('#begin-login').onclick = async event => {
    event.target.disabled = true;
    try {
      const result = await api('/v1/portal/grooming/registration', {});
      document.querySelector('#login-status').innerHTML = `<p><a class="button secondary" target="_blank" rel="noopener noreferrer" href="${escape(result.url)}">Открыть текущего бота MAX ↗</a></p><p>Нажмите «Начать» в боте, затем вернитесь сюда. Проверяем подтверждение…</p>`;
      clearInterval(loginTimer); loginTimer = setInterval(() => void pollLogin(), 2500);
    } catch (error) { document.querySelector('#login-status').textContent = error.message; event.target.disabled = false; }
  };
}
async function pollLogin() {
  if (loginPolling) return; loginPolling = true;
  try {
    const result = await api('/v1/portal/grooming/registration');
    if (result.status === 'NEEDS_DETAILS') {
      clearInterval(loginTimer);
      document.querySelector('#login-status').innerHTML = `<form id="registration-details"><h3>Знакомимся</h3><label>Как к вам обращаться<input name="fullName" required minlength="2" maxlength="120" autocomplete="name"></label><label>Телефон для связи<input name="phone" type="tel" required minlength="10" maxlength="32" autocomplete="tel" placeholder="+7 …"></label><label class="check"><input name="contactConsent" type="checkbox" required><span>Разрешаю связаться со мной по записи</span></label><button class="button" type="submit">Создать кабинет</button><p id="registration-error" role="alert"></p></form>`;
      document.querySelector('#registration-details').onsubmit = async event => {
        event.preventDefault(); const form = new FormData(event.target), button = event.target.querySelector('button'); button.disabled = true;
        try { await api('/v1/portal/grooming/registration/details', { fullName: form.get('fullName'), phone: form.get('phone'), contactConsent: form.get('contactConsent') === 'on' }); document.querySelector('#login-status').textContent = 'Сохраняем кабинет в CRM…'; loginTimer = setInterval(() => void pollLogin(), 2500); }
        catch (error) { document.querySelector('#registration-error').textContent = error.message; button.disabled = false; }
      };
    } else if (result.status === 'READY') {
      clearInterval(loginTimer); await api('/v1/portal/grooming/registration/session', {}); await start();
    } else if (result.status === 'REVIEW_REQUIRED') { clearInterval(loginTimer); document.querySelector('#login-status').textContent = result.error || 'Свяжитесь с клиникой для привязки существующего кабинета.'; }
  } catch (error) { clearInterval(loginTimer); const target = document.querySelector('#login-status'); if (target) target.textContent = error.message; }
  finally { loginPolling = false; }
}
function option(value, label, current) { return `<option value="${escape(value)}"${value === current ? ' selected' : ''}>${escape(label)}</option>`; }
function render(message = '') {
  const future = array(state.bookings).filter(b => ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS'].includes(b.status) && Date.parse(b.startsAt) > Date.now()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  app.innerHTML = `${state.mode === 'qa' ? `<p class="notice">${state.qaDelivery === 'device' ? 'Проверка на телефоне · вымышленные данные · тестовые сообщения MAX.' : 'Локальная проверка · все данные вымышленные · отправка MAX отключена.'}</p>` : ''}<section class="hero"><div><p class="eyebrow">Кабинет владельца</p><h1>Груминг для моих питомцев</h1><p>${escape(state.owner.fullName)}</p></div><button id="refresh" class="button secondary">Обновить</button></section><p id="booking-time-update" class="notice" role="status" aria-live="polite" hidden></p>${message ? `<p class="success" role="status">${escape(message)}</p>` : ''}<div class="workspace"><aside><section class="next-card"><p class="eyebrow">Ближайшая запись</p>${future[0] ? `<h2 data-booking-start="${escape(future[0].id)}">${escape(dateTime(future[0].startsAt, future[0].location.timezone))}</h2><p data-booking-duration="${escape(future[0].id)}">${escape(bookingDurationText(future[0]))}</p><p>${escape(future[0].animal.nickname)} · ${escape(future[0].serviceTitle)}</p><p>${escape(future[0].employee.fullName)}</p><span class="badge">${escape(statuses[future[0].status])}</span>` : '<h2>Выберем удобное время?</h2><p>Предстоящих записей пока нет.</p>'}</section><section class="pet-card"><h2>Мои питомцы</h2>${array(state.animals).map(p => `<p><strong>${escape(p.nickname)}</strong><br><small>${escape(p.breed || p.species || '')}</small></p>`).join('') || '<p>Добавьте своего первого питомца.</p>'}<button class="text-button" id="add-pet">+ Добавить питомца</button><div id="pet-form-slot"></div></section></aside><div><section class="booking-card"><div class="section-heading"><div><p class="eyebrow">${moving ? 'Перенос записи' : 'Самостоятельная запись'}</p><h2>${moving ? 'Выберите новое время' : 'Кому нужен уход?'}</h2></div>${moving ? '<button id="cancel-move" class="text-button">Отменить перенос</button>' : ''}</div>${state.selfBookingEnabled ? '<p class="notice">Стрижка занимает примерно 1,5 часа. Время может меняться в зависимости от состояния животного.</p>' + bookingForm() : '<p class="notice">Сейчас самостоятельная запись закрыта. Существующие записи и история доступны ниже.</p>'}</section><section class="history"><h2>Мои записи и история ухода</h2>${array(state.bookings).map(bookingCard).join('') || '<p class="muted">Здесь появится ваша первая запись.</p>'}</section></div></div>`;
  document.querySelector('#refresh').onclick = async () => { await guarded(async () => { await recover(); state = await command('STATE'); render('Данные обновлены'); }); };
  document.querySelector('#add-pet').onclick = renderPetForm;
  document.querySelector('#cancel-move')?.addEventListener('click', () => { moving = null; draft = {}; offers = []; render(); });
  const form = document.querySelector('#booking-form');
  if (form) {
    form.onchange = event => {
      draft = { ...draft, ...Object.fromEntries(new FormData(form)) };
      if (event.target.name === 'animalId') {
        const animal = state.animals.find(pet => pet.id === draft.animalId);
        const kind = /кош|кот|cat/i.test(animal?.species || '') ? 'CAT' : /собак|dog/i.test(animal?.species || '') ? 'DOG' : null;
        if (kind) { draft.species = kind; form.elements.species.value = kind; }
      }
      form.elements.size.closest('label').hidden = draft.species === 'CAT';
      offers = []; selected = ''; document.querySelector('#offers').innerHTML = '';
    };
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return; draft = { ...draft, ...Object.fromEntries(new FormData(form)) };
      await guarded(async () => {
        const input = { animalId: draft.animalId, serviceId: draft.serviceId, species: draft.species, size: draft.species === 'CAT' ? 'ANY' : draft.size, coat: draft.coat, date: draft.date, ...(draft.specialistId ? { specialistId: draft.specialistId } : {}), ...(moving ? { reservationId: moving.id } : {}) };
        const result = await command('OPTIONS', input); offers = result.offers; selected = ''; renderOffers(result.notice);
      });
    };
  }
  app.querySelectorAll('[data-cancel]').forEach(button => button.onclick = () => {
    const booking = state.bookings.find(b => b.id === button.dataset.cancel);
    const actions = button.closest('.history-actions');
    actions.innerHTML = '<p>Отменить эту запись?</p><button type="button" class="button danger confirm-cancel">Да, отменить</button><button type="button" class="text-button keep-booking">Сохранить запись</button>';
    actions.querySelector('.keep-booking').onclick = () => render();
    actions.querySelector('.confirm-cancel').onclick = async () => {
      await guarded(async () => { await command('CANCEL', { reservationId: booking.id, version: booking.version }); state = await command('STATE'); render('Запись отменена. Сообщение поставлено в очередь MAX.'); });
    };
  });
  app.querySelectorAll('[data-move]').forEach(button => button.onclick = () => {
    moving = state.bookings.find(b => b.id === button.dataset.move); offers = []; selected = '';
    draft = { animalId: moving.animalId, species: moving.species, size: moving.size, coat: moving.coat, date: day(moving.startsAt), notes: moving.notes, serviceId: moving.serviceId || '' };
    render(); document.querySelector('#booking-form')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
}
function bookingForm() {
  return `${array(moving?.looks || draft.looks).length ? `<section class="notice"><strong>Выбранные образы</strong><ul>${array(moving?.looks || draft.looks).map(id => `<li>${escape(lookLabel(id))}</li>`).join('')}</ul><small>Сохраним в записи для обсуждения с грумером.</small></section>` : ''}<form id="booking-form"><div class="form-grid"><label>Питомец<select name="animalId" required${moving ? ' disabled' : ''}>${option('', 'Выберите питомца', draft.animalId)}${array(state.animals).map(p => option(p.id, p.nickname, draft.animalId)).join('')}</select>${moving ? `<input type="hidden" name="animalId" value="${escape(moving.animalId)}">` : ''}</label><label>Услуга<select name="serviceId" required>${option('', 'Выберите услугу', draft.serviceId)}${array(state.services).map(s => option(s.id, `${s.title} · ${s.price} ₽`, draft.serviceId)).join('')}</select></label><label>Вид питомца<select name="species">${Object.entries(species).map(([id, label]) => option(id, label, draft.species || 'DOG')).join('')}</select></label><label${draft.species === 'CAT' ? ' hidden' : ''}>Размер<select name="size">${[['SMALL', 'Небольшой'], ['MEDIUM', 'Средний'], ['LARGE', 'Крупный']].map(([id, label]) => option(id, label, draft.size || 'SMALL')).join('')}</select></label><label>Шерсть<select name="coat">${[['ANY', 'Без уточнения'], ['SHORT', 'Короткая'], ['LONG', 'Длинная'], ['CURLY', 'Кудрявая'], ['DOUBLE', 'Двойная шерсть']].map(([id, label]) => option(id, label, draft.coat || 'ANY')).join('')}</select></label><label>Грумер<select name="specialistId">${option('', 'Любой доступный', draft.specialistId)}${array(state.specialists).map(s => option(s.id, s.displayName, draft.specialistId)).join('')}</select></label><label>Дата<input name="date" type="date" required min="${day(new Date())}" value="${escape(draft.date || day(new Date()))}"></label><label class="wide">Пожелания<textarea name="notes" maxlength="2000" rows="3">${escape(draft.notes || '')}</textarea></label></div><button type="submit" class="button"${!state.animals.length || !state.services.length ? ' disabled' : ''}>Показать свободное время</button><p class="muted"></p></form><div id="offers" aria-live="polite"></div><p id="action-error" class="error" role="alert"></p>`;
}
function renderOffers(notice) {
  const container = document.querySelector('#offers');
  container.innerHTML = `<p class="muted">${escape(notice || '')}</p>${offers.length ? `<div class="offer-grid">${offers.map((o, index) => `<button type="button" class="offer" data-offer="${index}"><strong>${time(o.startsAt, o.timezone)}</strong><span>${escape(o.specialistName)}</span><small>${escape(o.priceLabel || o.price + ' ₽')}</small><small>${escape(o.locationName)}</small></button>`).join('')}</div><div id="confirmation"></div>` : '<p class="notice">Подходящего времени на эту дату нет. Попробуйте другую дату или специалиста.</p>'}`;
  container.querySelectorAll('[data-offer]').forEach(button => button.onclick = () => {
    const offer = offers[Number(button.dataset.offer)]; selected = offer.offerToken;
    container.querySelectorAll('.offer').forEach(item => item.classList.toggle('selected', item === button));
    document.querySelector('#confirmation').innerHTML = `<section class="confirmation"><h3>${escape(offer.serviceTitle)}</h3><p>${escape(dateTime(offer.startsAt, offer.timezone))} · ${escape(offer.specialistName)}<br>${escape(offer.priceLabel || offer.price + ' ₽')}</p><label class="check"><input type="checkbox" id="booking-consent"><span>Подтверждаю запись и разрешаю связаться со мной по визиту</span></label><button type="button" class="button" id="confirm-booking">${moving ? 'Подтвердить перенос' : 'Подтвердить запись'}</button></section>`;
    document.querySelector('#confirm-booking').onclick = async () => {
      if (!document.querySelector('#booking-consent').checked) { document.querySelector('#action-error').textContent = 'Подтвердите запись и разрешение на связь.'; return; }
      await guarded(async () => {
        await command(moving ? 'RESCHEDULE' : 'BOOK', { offerToken: selected, notes: draft.notes || '', looks: moving?.looks || draft.looks || [], contactConsent: true, bookingConsent: true, ...(moving ? { reservationId: moving.id, version: moving.version } : {}) });
        state = await command('STATE'); moving = null; draft = {}; offers = []; selected = ''; render('Запись подтверждена и сохранена в CRM. Уведомление поставлено в очередь MAX.');
      });
    };
    const confirmation = document.querySelector('#confirmation');
    confirmation.setAttribute('tabindex', '-1');
    confirmation.focus({ preventScroll: true });
    confirmation.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });
}
function bookingCard(b) {
  const canChange = b.status === 'CONFIRMED' && Date.parse(b.startsAt) - Date.now() >= state.minimumCancelMinutes * 60000;
  return `<article class="history-card"><div><span class="badge">${escape(statuses[b.status] || b.status)}</span><h3>${escape(b.animal.nickname)} · ${escape(b.serviceTitle)}</h3><p><span data-booking-start="${escape(b.id)}">${escape(dateTime(b.startsAt, b.location.timezone))}</span><br><span data-booking-duration="${escape(b.id)}">${escape(bookingDurationText(b))}</span><br>${escape(b.employee.fullName)} · ${escape(b.location.name)}<br>${escape(b.priceLabel || b.price + ' ₽')}</p>${b.notes ? `<p class="muted">${escape(b.notes)}</p>` : ''}${array(b.looks).length ? `<p class="muted">Образы: ${array(b.looks).map(id => escape(lookLabel(id))).join('; ')}</p>` : ''}</div>${canChange ? `<div class="history-actions">${state.selfBookingEnabled ? `<button class="button secondary" data-move="${escape(b.id)}">Перенести</button>` : ''}<button class="text-button" data-cancel="${escape(b.id)}">Отменить запись</button></div>` : ''}</article>`;
}
function renderPetForm() {
  document.querySelector('#pet-form-slot').innerHTML = `<form id="new-pet"><label>Кличка<input name="nickname" required maxlength="80"></label><label>Вид<select name="species"><option value="DOG">Собака</option><option value="CAT">Кошка</option></select></label><label>Порода или тип шерсти<input name="breed" maxlength="120"></label><button class="button secondary" type="submit">Сохранить питомца</button><p id="pet-error" class="error" role="alert"></p></form>`;
  document.querySelector('#new-pet').onsubmit = async event => {
    event.preventDefault(); const input = Object.fromEntries(new FormData(event.target));
    await guarded(async () => { await command('PET_CREATE', input); state = await command('STATE'); render('Питомец добавлен в ваш кабинет.'); }, '#pet-error');
  };
}
async function guarded(action, errorSelector = '#action-error') {
  if (busy) return; busy = true;
  const buttons = [...app.querySelectorAll('button')].map(button => [button, button.disabled]);
  buttons.forEach(([button]) => button.disabled = true);
  try { await action(); }
  catch (error) { const target = document.querySelector(errorSelector); if (target) target.textContent = error.message; else renderFailure(error.message); }
  finally { busy = false; buttons.forEach(([button, disabled]) => { if (button.isConnected) button.disabled = disabled; }); }
}
document.querySelector('#logout').onclick = async () => { sessionStorage.removeItem(pendingKey); await api('/v1/portal/logout', {}); location.assign('/portal/grooming'); };
setInterval(() => void refreshBookingTimes(), 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refreshBookingTimes(); });
window.addEventListener('focus', () => void refreshBookingTimes());
void start();
