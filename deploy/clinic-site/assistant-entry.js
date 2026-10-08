// Add the CRM chat to the qualified static site without replacing its application.
(() => {
  const destination = 'https://cabinet.temichevvet.ru/assistant';
  if (!document.getElementById('clinic-assistant-entry')) {
    const link = document.createElement('a');
    link.id = 'clinic-assistant-entry';
    link.href = destination;
    link.className = 'clinic-assistant-entry';
    link.setAttribute('aria-label', 'Чат клиники — запись на приём');
    const title = document.createElement('strong'); title.textContent = 'Чат клиники';
    const subtitle = document.createElement('small'); subtitle.textContent = 'Запись на приём';
    link.append(title, subtitle); document.body.append(link);
  }
  // Existing mobile and invitation controls now enter the same durable CRM chat.
  document.addEventListener('click', event => {
    const control = event.target instanceof Element ? event.target.closest('.chat-launcher, .mobile-actions button[aria-controls="clinic-chat"], .chat-invite .text-link, .chat-quick button:last-child') : null;
    if (!control) return;
    event.preventDefault(); event.stopImmediatePropagation();
    window.location.assign(destination);
  }, true);
})();
