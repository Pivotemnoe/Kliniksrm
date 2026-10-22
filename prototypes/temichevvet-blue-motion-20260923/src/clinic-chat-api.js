const CHAT_BASE = "/api/chat";

export class ClinicChatError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ClinicChatError";
    this.status = status;
  }
}

export async function clinicChatRequest(path, body, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`${CHAT_BASE}${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new ClinicChatError("Не удалось связаться с чатом клиники. Попробуйте ещё раз или позвоните нам.");
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new ClinicChatError("Чат клиники временно недоступен. Можно позвонить нам.", response.status);
  }
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(". ") : data?.message;
    throw new ClinicChatError(typeof message === "string" && message ? message : "Чат клиники временно недоступен.", response.status);
  }
  if (!data || !Array.isArray(data.messages) || typeof data.id !== "string") {
    throw new ClinicChatError("Не удалось открыть переписку. Попробуйте ещё раз.", response.status);
  }
  return data;
}

export function visibleClinicMessages(conversation) {
  return (conversation?.messages || []).filter((item) => item.clientKey !== "welcome");
}

export function clinicMessageText(item) {
  if (item.author !== "ASSISTANT") return item.text;
  if (/^Для заявки укажите .*в форме ниже\./i.test(item.text)) {
    return "Для записи можно продолжить разговор с администратором здесь или позвонить в клинику. Время приёма он подтвердит отдельно.";
  }
  if (/^(?:Как к вам обращаться|Напишите, пожалуйста, ваше имя|Как к вам обращаться\? Напишите имя и телефон)/i.test(item.text)) {
    return "Расскажите, чем помочь питомцу. Если потребуется помощь сотрудника, позовём администратора в этот чат.";
  }
  return item.text;
}
