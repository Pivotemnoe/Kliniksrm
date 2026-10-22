import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, PaperPlaneTilt, Phone, X } from "@phosphor-icons/react";
import { clinic } from "./content.js";
import { clinicChatRequest, clinicMessageText, visibleClinicMessages } from "./clinic-chat-api.js";
import { clinicLeadConfig } from "./clinic-lead-config.js";
import { clinicLeadFormOpen } from "./clinic-chat-ui.js";

const firstMessage = "Здравствуйте! Расскажите, чем помочь питомцу. На простые вопросы ответим здесь, а если понадобится помощь сотрудника — позовём администратора.";
const leadConfig = clinicLeadConfig();

export function ClinicChatPanel({ close, draft, setDraft, panelRef, onKeyDown, booking = "" }) {
  const [conversation, setConversation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadSending, setLeadSending] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [leadName, setLeadName] = useState("");
  const [leadSurname, setLeadSurname] = useState("");
  const [leadPatronymic, setLeadPatronymic] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [replyChannel, setReplyChannel] = useState("PHONE");
  const [leadConsent, setLeadConsent] = useState(false);
  const [bookingReceipt, setBookingReceipt] = useState(false);
  const messageKey = useRef(crypto.randomUUID());
  const leadKey = useRef(crypto.randomUUID());
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const leadNameRef = useRef(null);
  const sendingRef = useRef(false);
  const pollRef = useRef(false);
  const bookingKey = useRef(crypto.randomUUID());
  const bookingSent = useRef(false);
  const leadFormOpen = clinicLeadFormOpen(leadOpen, conversation?.contactConsent);
  useEffect(() => { if (booking) setLeadOpen(true); setBookingReceipt(false); bookingSent.current = false; bookingKey.current = crypto.randomUUID(); }, [booking]);

  async function start() {
    setLoading(true);
    setError("");
    try {
      const data = await clinicChatRequest("/session", {});
      setConversation(data);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { start(); }, []);
  useEffect(() => {
    if (!conversation) return;
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || pollRef.current || sendingRef.current) return;
      pollRef.current = true;
      try {
        const data = await clinicChatRequest("");
        setConversation((current) => !current || data.sequence >= current.sequence ? data : current);
        setError("");
      } catch (failure) {
        if (failure.status === 401) setConversation(null);
        setError(failure.message);
      } finally {
        pollRef.current = false;
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [conversation?.id]);
  useEffect(() => {
    if (bodyRef.current && !leadFormOpen) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [conversation?.sequence, sending, error, leadFormOpen, leadError]);
  useEffect(() => {
    if (loading || sending) return;
    const frame = requestAnimationFrame(() => {
      if (leadFormOpen) {
        leadNameRef.current?.focus({ preventScroll: true });
        leadNameRef.current?.scrollIntoView({ block: "center" });
      } else {
        inputRef.current?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [leadFormOpen, loading, sending]);

  async function send(value = draft, requestKey) {
    const text = value.trim();
    if (!text || !conversation || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setError("");
    const clientKey = requestKey || (value === draft ? messageKey.current : crypto.randomUUID());
    try {
      const data = await clinicChatRequest("/messages", { clientKey, text });
      setConversation(data);
      if (value === draft) setDraft("");
      messageKey.current = crypto.randomUUID();
      return true;
    } catch (failure) {
      messageKey.current = clientKey;
      setDraft(text);
      setError(`${failure.message} Сообщение не подтверждено; его можно отправить повторно.`);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  async function submitLead(event) {
    event.preventDefault();
    if (!leadConfig || !conversation || leadSending || !leadConsent) return;
    setLeadSending(true);
    setLeadError("");
    try {
      // Attach the requested service before handing off; never include contact
      // data in the free-text message. Reuse the key after a network failure.
      if (booking && !bookingSent.current) {
        await clinicChatRequest("/messages", { clientKey: bookingKey.current, text: booking });
        bookingSent.current = true;
      }
      const data = await clinicChatRequest("/contact", {
        clientKey: leadKey.current,
        contactName: leadName.trim(),
        surname: leadSurname.trim(),
        patronymic: leadPatronymic.trim(),
        phone: leadPhone.trim(),
        contactConsent: true,
        preferredReplyChannel: replyChannel,
      });
      if (data.contactConsent !== true || !data.phone) throw new Error("Клиника ещё не подтвердила получение контакта. Попробуйте ещё раз.");
      setConversation(data);
      setLeadOpen(false);
      if (booking) setBookingReceipt(true);
      leadKey.current = crypto.randomUUID();
    } catch (failure) {
      setLeadError(failure.message || "Не удалось передать контакт. Попробуйте ещё раз или позвоните.");
    } finally {
      setLeadSending(false);
    }
  }

  const messages = visibleClinicMessages(conversation);
  const hasAskedQuestion = messages.some((item) => item.author === "OWNER");
  const needsBookingHandoff = Boolean(conversation?.bookingDraft && conversation?.mode === "ASSISTANT" && (!conversation?.canAutoBook || conversation?.bookingDraft?.checkup));
  const humanIsHandling = conversation?.mode === "HUMAN";

  return (
    <section id="clinic-chat" ref={panelRef} className="chat-panel" role="dialog" aria-label="Чат клиники TemichevVET" onKeyDown={onKeyDown}>
      <header>
        <div><strong>Чат клиники</strong><span>Спросите здесь — без личного кабинета</span></div>
        <button className="support-close" aria-label="Закрыть чат" onClick={close}><X size={22} /></button>
      </header>
      <div className="chat-body" ref={bodyRef}>
        <div role="log" aria-live="polite" aria-relevant="additions">
          <div className="chat-message bot"><p>{firstMessage}</p></div>
          {messages.map((item) => (
            <div className={`chat-message ${item.author === "OWNER" ? "user" : "bot"}`} key={item.id}>
              {item.author === "STAFF" && <strong className="chat-author">Администратор</strong>}
              <p>{clinicMessageText(item)}</p>
            </div>
          ))}
        </div>
        {loading && <p className="chat-status" role="status">Соединяем с чатом клиники…</p>}
        {sending && <p className="chat-status" role="status">Отправляем сообщение…</p>}
        {booking && conversation?.contactConsent && !bookingReceipt && <div className="chat-next-step"><p>{booking}</p><p>Используем контакт и способ ответа, которые вы уже оставили в этом чате. Время подтвердит администратор.</p><button disabled={sending} onClick={async () => { if (await send(booking, bookingKey.current)) setBookingReceipt(true); }}>Отправить заявку на приём</button></div>}
        {bookingReceipt && <p className="chat-status" role="status">Заявка отправлена. Ожидайте согласования времени с администратором.</p>}
        {humanIsHandling && <p className="chat-status">Обращение передано администратору. Ответ появится здесь; если помощь нужна срочно, позвоните.</p>}
        {needsBookingHandoff && !conversation?.contactConsent && !leadFormOpen && <div className="chat-next-step">
          <p>Вопрос о записи можно обсудить здесь с администратором. Время приёма подтверждается отдельно.</p>
          {leadConfig ? <button type="button" disabled={sending} onClick={() => setLeadOpen(true)}>Оставить контакт для администратора</button> : <p>Форма временно недоступна. <a href={clinic.tel}>Позвонить в клинику</a></p>}
        </div>}
        {leadConfig && (leadFormOpen || (hasAskedQuestion && !needsBookingHandoff)) && !conversation?.contactConsent && <div className="chat-next-step chat-lead-step">
          {!booking && <p>Нужен ответ сотрудника? Оставьте контакт. Без него ассистент ответит на общие вопросы, но не передаст обращение администратору.</p>}
          {!leadFormOpen && <button type="button" onClick={() => setLeadOpen(true)}>Оставить контакт</button>}
          {leadFormOpen && <form className="chat-lead-form" onSubmit={submitLead}>
            {booking && <p><strong>Заявка на приём</strong><br />{booking}<br />Время приёма подтвердит администратор.</p>}
            <label>Имя
              <input ref={leadNameRef} autoComplete="given-name" required maxLength={60} value={leadName} onChange={(event) => setLeadName(event.target.value)} />
            </label>
            <details className="chat-lead-extra"><summary>Добавить фамилию и отчество — необязательно</summary>
              <label>Фамилия <span>необязательно</span>
                <input autoComplete="family-name" maxLength={60} value={leadSurname} onChange={(event) => setLeadSurname(event.target.value)} />
              </label>
              <label>Отчество <span>необязательно</span>
                <input autoComplete="additional-name" maxLength={60} value={leadPatronymic} onChange={(event) => setLeadPatronymic(event.target.value)} />
              </label>
            </details>
            <label>Телефон для ответа
              <input type="tel" inputMode="tel" autoComplete="tel" required maxLength={32} value={leadPhone} onChange={(event) => setLeadPhone(event.target.value)} placeholder="+7 900 000-00-00" />
            </label>
            <fieldset className="chat-lead-channel"><legend>Как удобнее ответить?</legend>
              <label><input type="radio" name="reply-channel" value="PHONE" checked={replyChannel === "PHONE"} onChange={() => setReplyChannel("PHONE")} /> Позвонить</label>
              <label><input type="radio" name="reply-channel" value="SITE_CHAT" checked={replyChannel === "SITE_CHAT"} onChange={() => setReplyChannel("SITE_CHAT")} /> Здесь, в этом чате</label>
              {conversation?.maxUserId && conversation?.maxConsent && <label><input type="radio" name="reply-channel" value="MAX" checked={replyChannel === "MAX"} onChange={() => setReplyChannel("MAX")} /> В MAX</label>}
            </fieldset>
            <label className="chat-lead-consent">
              <input type="checkbox" required checked={leadConsent} onChange={(event) => setLeadConsent(event.target.checked)} />
              <span>Согласен на обработку контакта ИП Темичевым К. В. для ответа по моему обращению. <a href="/contact-consent" target="_blank" rel="noopener noreferrer">Текст согласия</a> · <a href={leadConfig.privacyUrl} target="_blank" rel="noopener noreferrer">Политика обработки данных</a></span>
            </label>
            <p className="chat-lead-note">Это не подписка на рекламную рассылку.</p>
            {leadError && <p role="alert" className="chat-lead-error">{leadError}</p>}
            <div className="chat-lead-actions">
              <button type="submit" disabled={!conversation || leadSending || !leadConsent || !leadName.trim() || !leadPhone.trim()}>{leadSending ? "Передаём…" : booking ? "Отправить заявку" : "Передать контакт"}</button>
              <button type="button" disabled={leadSending} onClick={() => { setLeadOpen(false); setLeadError(""); }}>Продолжить чат</button>
            </div>
          </form>}
        </div>}
        {conversation?.contactConsent && <p className="chat-status" role="status">Контакт получен клиникой. Администратор ответит выбранным способом. Переписка сохранится в этом чате на этом устройстве. Рекламная рассылка не подключена.</p>}
        {error && <div className="chat-error" role="alert">
          <p>{error}</p>
          {!conversation && <button type="button" onClick={start} disabled={loading}>Попробовать ещё раз</button>}
          <a href={clinic.tel}><Phone size={15} /> Позвонить: {clinic.phone}</a>
        </div>}
      </div>
      {!leadFormOpen && <div className="chat-quick" role="group" aria-label="Частые вопросы">
        {["Цены", "Адрес", "Часы работы", "Акции"].map((question) => (
          <button key={question} type="button" disabled={!conversation || sending} onClick={() => send(question)}>{question}</button>
        ))}
        <button type="button" disabled={!conversation || sending || humanIsHandling} onClick={() => leadConfig && !conversation?.contactConsent ? setLeadOpen(true) : send("Хочу поговорить с администратором")}>Администратор</button>
      </div>}
      {!leadFormOpen && <form className="chat-input" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <input ref={inputRef} name="question" aria-label="Написать в чат клиники" placeholder="Напишите вопрос" maxLength={4000}
          value={draft} disabled={!conversation || sending} onChange={(event) => { setDraft(event.target.value); messageKey.current = crypto.randomUUID(); }} />
        <button type="submit" disabled={!conversation || sending || !draft.trim()} aria-label="Отправить сообщение в клинику"><PaperPlaneTilt size={22} /></button>
      </form>}
      {!leadFormOpen && <p className="chat-private">Переписка поступает в клинику. Не пишите номер телефона, платёжные данные и данные документов в сообщениях. При срочном состоянии питомца <a href={clinic.tel}>позвоните</a>. <a href="/visit">Как записаться <ArrowUpRight size={12} /></a> · <a href="/privacy">Обработка данных</a></p>}
    </section>
  );
}
