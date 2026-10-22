export function clinicLeadConfig(env = import.meta.env || {}) {
  if (env.VITE_CLINIC_CHAT_LEADS_ENABLED !== "true") return null;
  try {
    const url = new URL(env.VITE_SITE_PRIVACY_URL);
    if (url.protocol !== "https:" || url.hostname !== "clinic.temichevvet.ru") return null;
    return { privacyUrl: url.href };
  } catch {
    return null;
  }
}
