import test from "node:test";
import assert from "node:assert/strict";
import {
  answerQuestion,
} from "../src/support-logic.js";
import { supportViewingAllowed } from "../src/support-schedule.js";
import { inquiryResponse } from "../src/inquiry-api.js";
import worker from "../src/clinic-worker.js";
import { routeTitles } from "../src/content.js";
test("clean page routes serve corresponding HTML including trailing slash and query", async () => {
  for (const path of Object.keys(routeTitles)) {
    let served;
    await worker.fetch(
      new Request("https://preview.test" + path + "?q=приём"),
      {
        ASSETS: {
          fetch: (r) => {
            served = new URL(r.url);
            return new Response("html");
          },
        },
      },
    );
    assert.equal(served.pathname, (path === "/" ? "" : path) + "/index.html");
    assert.equal(served.search, "");
  }
  let served;
  await worker.fetch(new Request("https://preview.test/prices/"), {
    ASSETS: {
      fetch: (r) => {
        served = new URL(r.url).pathname;
        return new Response("html");
      },
    },
  });
  assert.equal(served, "/prices/index.html");
});
test("FAQ uses live price adapter, not hardcoded prices or invented medical advice", async () => {
  const result = await answerQuestion(
    "Сколько стоит первичный приём?",
    async () => ({
      items: [
        {
          title: "Первичный прием врача",
          category: "Приём",
          priceType: "FIXED",
          price: 575,
        },
      ],
    }),
  );
  assert.match(result.text, /575/);
  assert.equal(
    result.href,
    "/prices?q=" + encodeURIComponent("первичный прием"),
  );
  const unavailable = await answerQuestion("Цена приёма", async () => {
    throw Error();
  });
  assert.equal(unavailable.action, "call");
  assert.match(
    (await answerQuestion("Что дать коту от боли?")).text,
    /Не ставлю диагнозы/,
  );
  assert.match((await answerQuestion("Записаться")).text, /не передаёт/);
  assert.match(
    (await answerQuestion("Акция диспансеризация")).text,
    /администратор/,
  );
});
test("promotion viewing clock pauses in chat, forms, menus, hidden tab and appointment routes", () => {
  const base = { busy: false, hidden: false, path: "/" };
  assert.equal(supportViewingAllowed(base), true);
  for (const patch of [{ busy: true }, { hidden: true }, { path: "/visit" }, { path: "/night" }, { path: "/offers" }])
    assert.equal(supportViewingAllowed({ ...base, ...patch }), false);
  for (const path of ["/clinic", "/prices", "/journal/articles/teeth"])
    assert.equal(supportViewingAllowed({ ...base, path }), true);
});
test("inquiry is off by default; enabled path validates origin, consent and acknowledged receipt without real writes", async () => {
  let calls = 0;
  const fetcher = async (_url, init) => {
    calls++;
    const sent = JSON.parse(init.body);
    assert.equal(sent.privateNote, undefined);
    return Response.json({
      ok: true,
      status: "received",
      requestId: "test-receipt",
    });
  };
  const values = {
    clientRequestId: "test-idempotency-1234",
    contactName: "Test",
    phone: "+79990000000",
    animalNickname: "Test",
    message: "Automated mock only",
    contactConsent: true,
    privateNote: "omit",
  };
  const req = (patch = {}, origin = "https://preview.test") =>
    new Request("https://preview.test/api/inquiries", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, ...patch }),
    });
  const config = {
    INQUIRIES_ENABLED: "true",
    PRIVACY_URL: "https://clinic.test/privacy",
  };
  assert.equal((await inquiryResponse(req(), {}, fetcher)).status, 503);
  assert.equal(calls, 0);
  assert.equal(
    (await inquiryResponse(req({}, "https://other.test"), config, fetcher))
      .status,
    403,
  );
  assert.equal(
    (await inquiryResponse(req({ contactConsent: false }), config, fetcher))
      .status,
    400,
  );
  assert.equal(
    (await inquiryResponse(req({ website: "bot" }), config, fetcher)).status,
    400,
  );
  assert.equal((await inquiryResponse(req(), config, fetcher)).status, 200);
  assert.equal(calls, 1);
  assert.equal(
    (
      await inquiryResponse(req(), config, async () =>
        Response.json({ ok: true }),
      )
    ).status,
    502,
  );
});
