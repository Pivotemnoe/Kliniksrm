import { useEffect, useRef, useState } from "react";
import {
  ChatCircleDots,
  X,
  Phone,
  ArrowUpRight,
  Heart,
  Stethoscope,
} from "@phosphor-icons/react";
import { clinic } from "./content.js";
import { offers } from "./support-logic.js";
import { ClinicChatPanel } from "./ClinicChatPanel.jsx";
import { supportSession, readSupportSession, saveSupportSession, startSupportSchedule, CHAT_HINT_VISIBLE_MS } from "./support-schedule.js";
const visitStorage = {
  getItem(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch {}
  },
};
function askOffer(offer) {
  window.dispatchEvent(
    new CustomEvent("clinic-question", { detail: offer.question }),
  );
}
function mobileExperienceInView() {
  if (innerWidth >= 900) return false;
  const middle = innerHeight * 0.5;
  return [...document.querySelectorAll(
    ".clinic-tour,.exploded-section,.digestive-journey,.movement-explorer,.anatomy-explorer,.system-explorer",
  )].some((section) => {
    const box = section.getBoundingClientRect();
    return box.top < middle && box.bottom > middle;
  });
}
function articleExplorerInView() {
  const middle = innerHeight * 0.5;
  return [...document.querySelectorAll(".system-explorer-layout,.service-experience,.direction-prices,.price-results,.price-summary,.checkup-programs")].some(section => {
    const box = section.getBoundingClientRect();
    return box.top < middle && box.bottom > middle;
  });
}

export function Promotions({ compact = false }) {
  const Tag = compact ? "h2" : "h1";
  return (
    <section
      id={compact ? "offers" : undefined}
      className={`offers wrap ${compact ? "offers-compact" : ""}`}
      aria-labelledby="offers-title"
    >
      <p className="eyebrow">Акции клиники</p>
      <Tag id="offers-title">
        Внимание к здоровью.
        <br />
        Вовремя.
      </Tag>
      <div className="offer-grid">
        {offers.map((o, index) => (
          <article
            className="offer-stage"
            data-offer-card={o.id}
            key={o.id}
          >
            <div className="offer-reveal">
            <div className={o.primary ? "offer-card primary" : "offer-card"}>
              <div className="offer-card-top">
                {o.primary ? (
                  <Stethoscope size={40} weight="light" aria-hidden="true" />
                ) : (
                  <Heart size={38} weight="light" aria-hidden="true" />
                )}
                <span className="offer-index" aria-hidden="true">0{index + 1} / 03</span>
              </div>
              <h3>{o.title}</h3>
              <p>{o.text}</p>
              {o.href ? <a className="text-link" aria-label={`Узнать условия акции «${o.title}»`} href={o.href}>Программы и цены <ArrowUpRight size={23} aria-hidden="true" /></a> : <button
                className="text-link"
                aria-label={`Узнать условия акции «${o.title}»`}
                onClick={() => askOffer(o)}
              >
                Спросить об условиях <ArrowUpRight size={23} aria-hidden="true" />
              </button>}
            </div>
            </div>
          </article>
        ))}
      </div>
      <p className="offer-note">
        Программы и цены диспансеризации — ниже на странице акций. Условия кастрации и стерилизации уточните в клинике.
      </p>
      {compact && (
        <a className="text-link" href="/offers">
          Все акции <ArrowUpRight size={20} />
        </a>
      )}
    </section>
  );
}

export function ClinicSupport({ path, bookingHref = "/visit", scheduleClock }) {
  const [open, setOpen] = useState(false),
    [booking, setBooking] = useState(""),
    [draft, setDraft] = useState(""),
    [promo, setPromo] = useState(null),
    [interactiveOnScreen, setInteractiveOnScreen] = useState(false),
    [articleExplorerOnScreen, setArticleExplorerOnScreen] = useState(false),
    [hint, setHint] = useState(false),
    [offerId, setOfferId] = useState(offers[0].id);
  const panel = useRef(null),
    launcher = useRef(null),
    offerPanel = useRef(null),
    offerLauncher = useRef(null),
    mobileOfferLauncher = useRef(null),
    mobileChatLauncher = useRef(null),
    hintPanel = useRef(null),
    hintStarted = useRef(0),
    visit = useRef(supportSession());
  const latest = useRef({ open, path });
  const selectedOffer = offers.find((offer) => offer.id === offerId) || offers[0];
  const showingPromo = promo && !open && !(promo === "auto" && (interactiveOnScreen || articleExplorerOnScreen));
  const showingHint = hint && !open && !promo && !interactiveOnScreen;
  latest.current = { open, promo, hint, path };
  const saveVisit = () => saveSupportSession(visitStorage, visit.current);
  useEffect(() => {
    const update = () => {
      setInteractiveOnScreen(mobileExperienceInView());
      setArticleExplorerOnScreen(articleExplorerInView());
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [path]);
  useEffect(() => {
    visit.current = readSupportSession(visitStorage);
    const clock = scheduleClock || window;
    const receive = (e) => {
      if (typeof e.detail !== "string") return;
      setOpen(true);
      setPromo(null);
      setHint(false);
      setDraft(e.detail);
    };
    window.addEventListener("clinic-question", receive);
    const openChat = () => { setBooking(""); setOpen(true); setPromo(null); setHint(false); };
    const openBooking = (event) => { setBooking(typeof event.detail === "string" ? event.detail : "Хочу записать питомца на приём."); setOpen(true); setPromo(null); setHint(false); };
    window.addEventListener("clinic-booking", openBooking);
    const openOffers = () => { setOpen(false); setPromo("manual"); setHint(false); };
    window.addEventListener("clinic-open-chat", openChat);
    window.addEventListener("clinic-open-offers", openOffers);
    const stop = startSupportSchedule({
      session: visit.current,
      clock,
      save: saveVisit,
      context: () => {
      const current = latest.current,
        hidden = document.visibilityState !== "visible";
      const focused = /^(INPUT|TEXTAREA|SELECT)$/.test(
        document.activeElement?.tagName,
      ) || document.activeElement?.isContentEditable;
      const busy = current.open || focused ||
        !!document.querySelector('.menu-button[aria-expanded="true"]');
      const interactive = mobileExperienceInView() || articleExplorerInView();
      if (interactive && current.hint) hintStarted.current = clock.performance.now();
      if (current.hint && !hidden && clock.performance.now() - hintStarted.current >= CHAT_HINT_VISIBLE_MS &&
          !hintPanel.current?.contains(document.activeElement) && !hintPanel.current?.matches(":hover")) setHint(false);
      return { busy, hidden, path: current.path, overlay: !!current.promo || current.hint || interactive };
      },
      show: (event) => {
        if (event.type === "offer") { setOfferId(event.id); setPromo("auto"); }
        else { hintStarted.current = clock.performance.now(); setHint(true); }
      },
    });
    return () => {
      window.removeEventListener("clinic-question", receive);
      window.removeEventListener("clinic-open-chat", openChat);
      window.removeEventListener("clinic-booking", openBooking);
      window.removeEventListener("clinic-open-offers", openOffers);
      stop();
      saveVisit();
    };
  }, []);
  useEffect(() => {
    if (open) {
      setPromo(null);
      setHint(false);
      visit.current.chatUsed = true;
      visit.current.lastPromptMs = visit.current.activeMs;
      saveVisit();
      panel.current?.querySelector('input[name="question"]')?.focus();
    }
  }, [open]);
  useEffect(() => {
    setPromo(null);
    setHint(false);
  }, [path]);
  function closeOffer(mute = false) {
    const restoreFocus = offerPanel.current?.contains(document.activeElement);
    setPromo(null);
    if (mute) visit.current.offersMuted = true;
    visit.current.lastPromptMs = visit.current.activeMs;
    saveVisit();
    if (restoreFocus) requestAnimationFrame(() =>
      (innerWidth <= 700 ? mobileOfferLauncher : offerLauncher).current?.focus());
  }
  function toggleOffer() {
    if (promo) return closeOffer();
    setHint(false);
    setPromo("manual");
    requestAnimationFrame(() => offerPanel.current?.focus({ preventScroll: true }));
  }
  function closeHint() {
    const restoreFocus = hintPanel.current?.contains(document.activeElement);
    setHint(false);
    visit.current.chatHintMuted = true;
    visit.current.lastPromptMs = visit.current.activeMs;
    saveVisit();
    if (restoreFocus) requestAnimationFrame(() =>
      (innerWidth <= 700 ? mobileChatLauncher : launcher).current?.focus());
  }
  function close() {
    setOpen(false);
    requestAnimationFrame(() =>
      (innerWidth <= 700 ? mobileChatLauncher : launcher).current?.focus());
  }
  function keys(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
    if (e.key === "Tab") {
      const nodes = [
        ...panel.current.querySelectorAll(
          "a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled)",
        ),
      ].filter((x) => x.tabIndex !== -1);
      const first = nodes[0],
        last = nodes.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }
  return (
    <>
      {showingPromo && (
        <aside
          id="clinic-offer"
          ref={offerPanel}
          className="offer-nudge"
          data-opened-by={promo}
          aria-label="Акции клиники"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.stopPropagation(); closeOffer(); }
          }}
        >
          <button
            className="support-close"
            aria-label="Закрыть предложение"
            onClick={() => closeOffer()}
          >
            <X size={20} />
          </button>
          <p className="eyebrow"><Heart size={19} weight="fill" aria-hidden="true" /> Акции клиники</p>
          {promo === "manual" && <div className="offer-options" role="group" aria-label="Выбрать акцию">
            {offers.map((offer) => (
              <button key={offer.id} aria-pressed={offerId === offer.id} onClick={() => setOfferId(offer.id)}>
                {offer.title}
              </button>
            ))}
          </div>}
          <div className="offer-detail" aria-live="polite" aria-atomic="true">
            <h2>{selectedOffer.title}</h2>
            <p>{selectedOffer.text}</p>
          </div>
          <div className="offer-nudge-actions">
            {selectedOffer.href ? <a className="button" href={selectedOffer.href} onClick={() => closeOffer()}>Программы и цены <ArrowUpRight size={18} aria-hidden="true" /></a> : <button className="button" onClick={() => askOffer(selectedOffer)}>
              Узнать условия <ArrowUpRight size={18} aria-hidden="true" />
            </button>}
            <a href="/offers" onClick={() => closeOffer()}>Все акции</a>
          </div>
          {promo === "auto" && <button className="offer-snooze" onClick={() => closeOffer(true)}>Не показывать в этот визит</button>}
        </aside>
      )}
      {showingHint && (
        <aside className="chat-invite" ref={hintPanel} aria-label="Приглашение в чат"
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeHint(); } }}>
          <button className="support-close" aria-label="Не напоминать о чате" onClick={closeHint}><X size={18} /></button>
          <p>Задайте вопрос в чате</p>
          <span>Подскажу цены, адрес и часы работы клиники.</span>
          <button className="text-link" onClick={() => setOpen(true)}>Задать вопрос <ArrowUpRight size={18} /></button>
        </aside>
      )}
      {!open && (
        <div className="support-dock" data-article-reading={articleExplorerOnScreen}>
          <button
            ref={offerLauncher}
            className="offer-launcher"
            onClick={toggleOffer}
            aria-expanded={!!showingPromo}
            aria-controls="clinic-offer"
          >
            <Heart size={21} weight="duotone" aria-hidden="true" />
            <span>Акции</span>
          </button>
          <button
            ref={launcher}
            className="chat-launcher"
            onClick={() => setOpen(true)}
            aria-label="Чат — задать вопрос"
            aria-haspopup="dialog"
            aria-controls="clinic-chat"
          >
            <ChatCircleDots size={29} weight="fill" aria-hidden="true" />
            <span><strong>Чат</strong><small>Задать вопрос</small></span>
          </button>
        </div>
      )}
      <nav className="mobile-actions" aria-label="Быстрые действия">
        <a href={clinic.tel}><Phone size={20} aria-hidden="true" /><span>Позвонить</span></a>
        <button ref={mobileOfferLauncher} type="button" onClick={toggleOffer}
          aria-expanded={!!showingPromo} aria-controls="clinic-offer">
          <Heart size={20} aria-hidden="true" /><span>Акции</span>
        </button>
        <button ref={mobileChatLauncher} type="button" onClick={() => setOpen(!open)}
          aria-expanded={open} aria-controls="clinic-chat">
          <ChatCircleDots size={20} aria-hidden="true" /><span>Чат</span>
        </button>
        <a className="mobile-book" href={bookingHref}>
          <span>Записаться</span><ArrowUpRight size={19} aria-hidden="true" />
        </a>
      </nav>
      {open && <ClinicChatPanel close={close} draft={draft} setDraft={setDraft} panelRef={panel} onKeyDown={keys} booking={booking} />}
    </>
  );
}
