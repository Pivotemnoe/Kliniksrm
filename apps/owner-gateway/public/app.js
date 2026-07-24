const app = document.querySelector('#app');
const logoutButton = document.querySelector('#logout');
const transferStorageKey = 'temichevvet-browser-transfer';
const readNotificationsStoragePrefix = 'temichevvet-owner-read-notifications:';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/portal/sw.js', { scope: '/portal/' }).catch(() => undefined);
  });
}

void start();

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
    throw new Error(message);
  }
  return payload;
}

function renderPortal(response) {
  const snapshot = response?.snapshot && typeof response.snapshot === 'object' ? response.snapshot : {};
  const owner = snapshot.owner && typeof snapshot.owner === 'object' ? snapshot.owner : {};
  const animals = array(snapshot.animals);
  const appointments = array(snapshot.appointments);
  const visits = array(snapshot.visits);
  const bills = array(snapshot.bills);
  const notifications = array(snapshot.notifications);
  const unreadNotifications = getUnreadNotificationCount(response.ownerId, notifications);
  const documents = visits.flatMap((visit) => array(visit.documents).map((document) => ({ ...document, visit })));
  const showBrowserTransfer = !isStandaloneMode();

  app.innerHTML = `
    <section class="hero">
      <div><h1>${escapeHtml(owner.fullName || response.displayName || 'Личный кабинет')}</h1><p>Пациенты, история лечения и документы TemichevVet.</p></div>
      <div class="hero-meta">
        <span>Обновлено ${formatDateTime(response.syncedAt)}</span>
        ${showBrowserTransfer ? '<button id="prepare-browser" class="button browser-button browser-only" type="button">Открыть в браузере</button>' : ''}
        ${showBrowserTransfer ? '<button id="copy-browser-link" class="button browser-button browser-only" type="button" hidden>Скопировать ссылку</button>' : ''}
        ${showBrowserTransfer ? '<span id="browser-hint" class="browser-hint browser-only" hidden>Нажмите значок браузера внизу MAX или скопируйте ссылку и вставьте её в любой браузер. Переход действует 10 минут, пароль не нужен.</span>' : ''}
        <button id="enable-push" class="button push-button" type="button" hidden>Включить уведомления</button>
      </div>
    </section>
    <nav class="tabs" aria-label="Разделы личного кабинета">
      ${tabButton('animals', `Пациенты · ${animals.length}`, true)}
      ${tabButton('appointments', `Записи · ${appointments.length}`)}
      ${tabButton('visits', `Приёмы · ${visits.length}`)}
      ${tabButton('documents', `Документы · ${documents.length}`)}
      ${tabButton('bills', `Счета · ${bills.length}`)}
      ${tabButton('notifications', `Сообщения · ${notifications.length}`, false, unreadNotifications)}
    </nav>
    ${section('animals', 'Мои животные', renderAnimals(animals), false)}
    ${section('appointments', 'Записи в клинику', renderAppointments(appointments), true)}
    ${section('visits', 'Завершённые приёмы', renderVisits(visits), true)}
    ${section('documents', 'Подписанные документы', renderDocuments(documents), true)}
    ${section('bills', 'Счета', renderBills(bills), true)}
    ${section('notifications', 'Сообщения клиники', renderNotifications(notifications), true)}
  `;

  app.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
    selectTab(button.dataset.tab);
    if (button.dataset.tab === 'notifications') {
      markNotificationsRead(response.ownerId, notifications);
    }
  }));
  document.querySelector('#prepare-browser')?.addEventListener('click', prepareBrowserTransfer);
  document.querySelector('#copy-browser-link')?.addEventListener('click', copyBrowserTransferLink);
  document.querySelector('#enable-push')?.addEventListener('click', enablePushNotifications);
  void updateAppBadge(unreadNotifications);
  void updatePushButton();

  if (new URL(window.location.href).searchParams.get('section') === 'notifications') {
    selectTab('notifications');
    markNotificationsRead(response.ownerId, notifications);
  }
}

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
  app.querySelectorAll('.tab').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.tab === name)));
  app.querySelectorAll('.panel').forEach((panel) => { panel.hidden = panel.dataset.panel !== name; });
}

function renderAnimals(items) {
  return renderGrid(items, (animal) => `
    <article class="card"><h3>${escapeHtml(animal.nickname || 'Без клички')}</h3>
      <p>${joinText([animal.species, animal.breed]) || 'Вид и порода не указаны'}</p>
      <p><strong>Пол:</strong> ${escapeHtml(sexLabel(animal.sex))}</p>
      <p><strong>Дата рождения:</strong> ${formatDate(animal.birthDate)}</p>
      <p><strong>Последний вес:</strong> ${array(animal.weights).length ? `${escapeHtml(animal.weights[0].weightKg)} кг` : '—'}</p>
      <p><strong>Прививки:</strong> ${array(animal.vaccinations).length ? array(animal.vaccinations).map((item) => escapeHtml(item.title)).join(', ') : '—'}</p>
    </article>`);
}

function renderAppointments(items) {
  return renderGrid(items, (item) => `
    <article class="card"><h3>${formatDateTime(item.startsAt)}</h3>
      <p><strong>Пациент:</strong> ${escapeHtml(item.animal?.nickname || '—')}</p>
      <p><strong>Статус:</strong> ${escapeHtml(statusLabel(item.status))}</p>
      <p><strong>Врач:</strong> ${escapeHtml(item.employee?.fullName || '—')}</p>
      <p><strong>Кабинет:</strong> ${escapeHtml(item.room?.name || '—')}</p>
    </article>`);
}

function renderVisits(items) {
  return renderGrid(items, (item) => `
    <article class="card"><h3>${formatDateTime(item.startedAt)} · ${escapeHtml(item.animal?.nickname || 'Пациент')}</h3>
      <p><strong>Врач:</strong> ${escapeHtml(item.employee?.fullName || '—')}</p>
      <p><strong>Диагноз:</strong> ${array(item.diagnoses).length ? array(item.diagnoses).map((value) => escapeHtml(value.title)).join(', ') : '—'}</p>
      <p><strong>Лечение:</strong> ${escapeHtml(item.recommendation?.treatmentPlan || '—')}</p>
      <p><strong>Уход:</strong> ${escapeHtml(item.recommendation?.careNotes || '—')}</p>
    </article>`);
}

function renderDocuments(items) {
  return renderGrid(items, (item) => `
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
      <p><strong>Оплачено:</strong> ${formatMoney(item.paidAmount)}</p>
      <p>${array(item.items).map((value) => escapeHtml(value.title)).join(', ') || 'Позиции не указаны'}</p>
    </article>`);
}

function renderNotifications(items) {
  return renderGrid(items, (item) => `
    <article class="card"><h3>${escapeHtml(item.subject || 'Сообщение клиники')}</h3>
      <p>${formatDateTime(item.sentAt || item.createdAt)}</p>
      <p>${escapeHtml(item.body || '')}</p>
    </article>`);
}

function renderGrid(items, renderer) {
  return items.length ? `<div class="grid">${items.map(renderer).join('')}</div>` : '<div class="empty">В этом разделе пока нет данных.</div>';
}

function tabButton(name, text, selected = false, unread = 0) {
  const unreadBadge = unread > 0 ? `<span class="tab-unread" aria-label="Непрочитанных сообщений: ${unread}">${unread}</span>` : '';
  return `<button class="tab" type="button" data-tab="${name}" aria-selected="${selected}">${escapeHtml(text)}${unreadBadge}</button>`;
}

function section(name, title, content, hidden) {
  return `<section class="panel" data-panel="${name}"${hidden ? ' hidden' : ''}><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function renderError(message) {
  logoutButton.hidden = true;
  app.innerHTML = `<section class="state-card"><h1>Кабинет пока не открыт</h1><p>${escapeHtml(message)}</p><p class="muted">Попросите клинику создать новую ссылку или QR-код.</p></section>`;
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

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!supported) {
    button.hidden = true;
    return;
  }

  button.hidden = false;
  if (Notification.permission === 'denied') {
    button.textContent = 'Уведомления запрещены';
    button.disabled = true;
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription && Notification.permission === 'granted') {
    button.textContent = 'Уведомления включены';
    button.disabled = true;
    return;
  }

  button.textContent = 'Включить уведомления';
  button.disabled = false;
}

async function enablePushNotifications() {
  const button = document.querySelector('#enable-push');
  if (!button || !('Notification' in window)) return;

  button.disabled = true;
  try {
    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    if (permission !== 'granted') {
      button.textContent = 'Уведомления не разрешены';
      return;
    }

    const config = await request('/v1/portal/push/config');
    if (!config?.available || typeof config.publicKey !== 'string') {
      throw new Error('Push-уведомления пока не настроены клиникой');
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.publicKey),
      });
    }
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
    button.textContent = 'Уведомления включены';
    button.disabled = true;
  } catch (error) {
    button.textContent = 'Включить уведомления';
    button.disabled = false;
    window.alert(error instanceof Error ? error.message : 'Не удалось включить уведомления');
  }
}

async function removeCurrentPushSubscription() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
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

function urlBase64ToUint8Array(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

function array(value) { return Array.isArray(value) ? value : []; }
function joinText(values) { return values.filter(Boolean).map(escapeHtml).join(' · '); }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]); }
function formatDate(value) { return value ? new Intl.DateTimeFormat('ru-RU').format(new Date(value)) : '—'; }
function formatDateTime(value) { return value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—'; }
function formatMoney(value) { const amount = Number(value); return Number.isFinite(amount) ? new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(amount) : '—'; }
function sexLabel(value) { return value === 'MALE' ? 'Самец' : value === 'FEMALE' ? 'Самка' : 'Не указан'; }
function statusLabel(value) { return ({ PLANNED: 'Запланирована', ARRIVED: 'В клинике', IN_PROGRESS: 'Идёт приём', COMPLETED: 'Завершена', CANCELLED: 'Отменена', NO_SHOW: 'Не пришли' })[value] || value || '—'; }
function billStatusLabel(value) { return ({ UNPAID: 'Не оплачен', PARTIAL: 'Оплачен частично', PAID: 'Оплачен', REFUNDED: 'Возврат', CANCELLED: 'Отменён' })[value] || value || '—'; }
