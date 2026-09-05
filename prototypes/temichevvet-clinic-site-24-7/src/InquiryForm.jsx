import React, { useRef, useState } from 'react';
import { clinic } from './content.js';
import { Arrow } from './components.jsx';

export function InquiryForm() {
  const privacyUrl = import.meta.env.VITE_SITE_PRIVACY_URL || '';
  const enabled = import.meta.env.VITE_INQUIRIES_ENABLED === 'true' && /^https:\/\//.test(privacyUrl);
  const [status, setStatus] = useState('idle');
  const request = useRef(null);
  const [note, setNote] = useState('');
  async function submit(event) {
    event.preventDefault(); if (status === 'sending') return;
    const data = new FormData(event.currentTarget);
    const values = { contactName: String(data.get('name')).trim(), phone: String(data.get('phone')).trim(), animalNickname: String(data.get('pet')).trim() || 'Не указано', message: String(data.get('message')).trim() || 'Заявка на плановый приём', contactConsent: data.get('consent') === 'on', website: String(data.get('website') || '') };
    if (values.phone.replace(/\D/g, '').length < 10) { setStatus('invalid'); setNote('Проверьте номер телефона: укажите не меньше 10 цифр.'); return; }
    if (!values.contactName) { setStatus('invalid'); setNote('Укажите, как к вам обращаться.'); return; }
    if (!enabled) { setStatus('demo'); setNote('Форма проверена. Это локальный макет: заявка не отправлена, запись не создана.'); return; }
    const signature = JSON.stringify(values);
    if (!request.current || request.current.signature !== signature) request.current = { signature, id: crypto.randomUUID() };
    setStatus('sending'); setNote('Передаём заявку…');
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const base = (import.meta.env.VITE_PUBLIC_GATEWAY_URL || '').replace(/\/$/, '');
      const response = await fetch(`${base}/v1/public/clinic/inquiries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', signal: controller.signal, body: JSON.stringify({ ...values, clientRequestId: request.current.id }) });
      if (!response.ok) throw new Error('Cannot confirm');
      const result = await response.json(); if (result.ok !== true || result.status !== 'received') throw new Error('Unconfirmed');
      setStatus('sent'); setNote('Заявка передана в клинику. Время приёма подтвердит администратор.');
    } catch { setStatus('error'); setNote('Не удалось подтвердить отправку. Можно повторить попытку или позвонить в клинику. При повторе та же заявка не будет создана дважды.'); }
    finally { clearTimeout(timer); }
  }
  if (!enabled && import.meta.env.VITE_SITE_PUBLIC_RELEASE === 'true') return <section className="section two-columns services" id="request"><div><span className="eyebrow">ПЛАНОВЫЙ ПРИЁМ</span><h2>Давайте выберем<br />удобное время.</h2></div><div><p>Позвоните в клинику: администратор подскажет, когда можно приехать и нужно ли подготовить питомца к приёму.</p><a className="button" href={clinic.tel}>{clinic.phone}<Arrow /></a></div></section>;
  return <section className="section two-columns services" id="request"><div><span className="eyebrow">ПЛАНОВЫЙ ПРИЁМ</span><h2>Можно оставить<br />заявку.</h2><p>Администратор свяжется с вами, чтобы согласовать время. Если помощь нужна сейчас, позвоните: <a href={clinic.tel}>{clinic.phone}</a>.</p>{!enabled && <p className="demo-note">Локальный макет: данные из этой формы не отправляются в клинику.</p>}</div><form className="inquiry-form" onSubmit={submit}>
    <fieldset disabled={status === 'sending' || status === 'sent'}><label>Как к вам обращаться<input name="name" autoComplete="name" required maxLength="120" /></label><label>Телефон<input name="phone" autoComplete="tel" type="tel" inputMode="tel" required minLength="10" maxLength="32" pattern="[+0-9 ()\-]{10,32}" placeholder="+7 ___ ___-__-__" /></label><label>Кличка питомца <span>Необязательно</span><input name="pet" maxLength="160" /></label><label>Комментарий <span>Необязательно</span><textarea name="message" maxLength="1000" rows="3" placeholder="Например, удобное время для звонка" /></label><label className="honeypot" aria-hidden="true">Сайт<input name="website" tabIndex="-1" autoComplete="off" /></label><label className="consent"><input type="checkbox" name="consent" required /><span>Разрешаю клинике связаться со мной по этой заявке.{enabled && <> <a href={privacyUrl} target="_blank" rel="noopener noreferrer">Обработка персональных данных</a>.</>}</span></label><button className="button" type="submit">{status === 'sending' ? 'Отправляем…' : enabled ? 'Отправить заявку' : 'Проверить форму'}<Arrow /></button></fieldset><p role="status" aria-live="polite" className={`form-result ${status}`}>{note}</p>
  </form></section>;
}
