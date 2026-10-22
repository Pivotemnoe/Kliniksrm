import test from "node:test";
import assert from "node:assert/strict";
import { ClinicChatError, clinicChatRequest, clinicMessageText, visibleClinicMessages } from "../src/clinic-chat-api.js";
import { clinicLeadConfig } from "../src/clinic-lead-config.js";

test("site chat uses only the first-party public chat gateway", async () => {
  const calls = [];
  const fake = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ id: "conversation-1", sequence: 1, messages: [] });
  };
  await clinicChatRequest("/session", {}, fake);
  await clinicChatRequest("", undefined, fake);
  await clinicChatRequest("/messages", { clientKey: "idempotency-key-123", text: "Адрес" }, fake);
  await clinicChatRequest("/contact", { clientKey: "contact-key-12345", phone: "+70000000000", contactConsent: true }, fake);
  assert.deepEqual(calls.map(x => x.url), ["/api/chat/session", "/api/chat", "/api/chat/messages", "/api/chat/contact"]);
  assert.deepEqual(calls.map(x => x.options.method), ["POST", "GET", "POST", "POST"]);
  assert.ok(calls.every(x => x.options.credentials === "same-origin" && x.options.cache === "no-store"));
  assert.deepEqual(JSON.parse(calls[2].options.body), { clientKey: "idempotency-key-123", text: "Адрес" });
  assert.deepEqual(JSON.parse(calls[3].options.body), { clientKey: "contact-key-12345", phone: "+70000000000", contactConsent: true });
});

test("chat failures are explicit and do not invent a receipt", async () => {
  await assert.rejects(() => clinicChatRequest("/messages", {}, async () => Response.json({ message: "Слишком много сообщений" }, { status: 429 })),
    error => error instanceof ClinicChatError && error.status === 429 && /Слишком много/.test(error.message));
  await assert.rejects(() => clinicChatRequest("", undefined, async () => Response.json({ ok: true })),
    error => error instanceof ClinicChatError && /переписку/.test(error.message));
});

test("welcome/contact gate is not displayed ahead of the visitor's first question", () => {
  const messages = visibleClinicMessages({ messages: [
    { clientKey: "welcome", text: "Напишите имя и телефон" },
    { clientKey: "question-1", author: "OWNER", text: "Где вы находитесь?" },
  ] });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, "Где вы находитесь?");
  assert.match(clinicMessageText({ author: "ASSISTANT", text: "Как к вам обращаться? Напишите имя и телефон для связи." }), /Расскажите, чем помочь/);
  assert.match(clinicMessageText({ author: "ASSISTANT", text: "Для заявки укажите имя, телефон, питомца, причину и удобное время в форме ниже." }), /администратором/);
});

test("contact form remains unavailable without a clinic-specific policy and explicit switch", () => {
  assert.equal(clinicLeadConfig({}), null);
  assert.equal(clinicLeadConfig({ VITE_CLINIC_CHAT_LEADS_ENABLED: "true", VITE_SITE_PRIVACY_URL: "https://temichevvet.ru/privacy" }), null);
  assert.equal(clinicLeadConfig({ VITE_CLINIC_CHAT_LEADS_ENABLED: "true", VITE_SITE_PRIVACY_URL: "http://clinic.temichevvet.ru/privacy" }), null);
  assert.deepEqual(clinicLeadConfig({ VITE_CLINIC_CHAT_LEADS_ENABLED: "true", VITE_SITE_PRIVACY_URL: "https://clinic.temichevvet.ru/privacy" }), { privacyUrl: "https://clinic.temichevvet.ru/privacy" });
});
