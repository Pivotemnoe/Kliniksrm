// One visit in this tab, preserved across navigation/reloads. No personal data.
export const SUPPORT_SESSION_KEY = "clinic-support-visit-v2";
export const PROMO_SCHEDULE = [
  { id: "checkup", at: 60_000 },
  { id: "castration", at: 10 * 60_000 },
  { id: "sterilization", at: 15 * 60_000 },
];
export const CHAT_HINT_SCHEDULE = [3 * 60_000, 12 * 60_000];
export const PROMPT_QUIET_MS = 90_000;
export const CHAT_HINT_VISIBLE_MS = 12_000;

export function supportSession(raw) {
  let x;
  try { x = typeof raw === "string" ? JSON.parse(raw) : raw; } catch {}
  const activeMs = Number.isFinite(x?.activeMs) ? Math.max(0, Math.min(x.activeMs, 86_400_000)) : 0;
  return {
    activeMs,
    shownOffers: PROMO_SCHEDULE.map(x => x.id).filter(id => Array.isArray(x?.shownOffers) && x.shownOffers.includes(id)),
    offersMuted: x?.offersMuted === true,
    chatUsed: x?.chatUsed === true,
    chatHintMuted: x?.chatHintMuted === true,
    chatHintCount: Number.isInteger(x?.chatHintCount) ? Math.max(0, Math.min(2, x.chatHintCount)) : 0,
    lastPromptMs: Number.isFinite(x?.lastPromptMs) ? Math.max(0, Math.min(activeMs, x.lastPromptMs)) : null,
  };
}
export function supportViewingAllowed({ busy, hidden, path }) {
  return !busy && !hidden && !["/night", "/visit", "/offers"].includes(path);
}
export function nextSupportPrompt(session, context) {
  if (!supportViewingAllowed(context) || context.overlay) return null;
  if (session.lastPromptMs !== null && session.activeMs - session.lastPromptMs < PROMPT_QUIET_MS) return null;
  const offer = !session.offersMuted && PROMO_SCHEDULE.find(x => session.activeMs >= x.at && !session.shownOffers.includes(x.id));
  if (offer) return { type: "offer", id: offer.id };
  if (!session.chatUsed && !session.chatHintMuted && session.chatHintCount < CHAT_HINT_SCHEDULE.length &&
      session.activeMs >= CHAT_HINT_SCHEDULE[session.chatHintCount]) return { type: "chat" };
  return null;
}
export function markSupportPrompt(session, event) {
  session.lastPromptMs = session.activeMs;
  if (event.type === "offer" && !session.shownOffers.includes(event.id)) session.shownOffers.push(event.id);
  if (event.type === "chat") session.chatHintCount++;
}
export function saveSupportSession(storage, session) {
  try { storage?.setItem(SUPPORT_SESSION_KEY, JSON.stringify(session)); } catch {}
}
export function readSupportSession(storage) {
  try { return supportSession(storage?.getItem(SUPPORT_SESSION_KEY)); } catch { return supportSession(); }
}

// Runtime and QA both use this scheduler. Injecting time is only for tests, never
// a public URL switch. Long browser sleeps cannot become active viewing time.
export function startSupportSchedule({ session, context, show, save, clock = globalThis }) {
  let previous = clock.performance.now();
  const timer = clock.setInterval(() => {
    const now = clock.performance.now();
    const elapsed = Math.max(0, Math.min(1500, now - previous));
    previous = now;
    const current = context();
    if (supportViewingAllowed(current)) session.activeMs += elapsed;
    const event = nextSupportPrompt(session, current);
    if (event) { markSupportPrompt(session, event); show(event); }
    save();
  }, 1000);
  return () => clock.clearInterval(timer);
}
