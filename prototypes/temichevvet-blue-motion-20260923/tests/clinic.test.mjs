import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import {
  normalizeCatalog,
  filterCatalog,
  displayPrice,
} from "../src/catalog.js";
import { priceResponse } from "../src/price-api.js";
import { routeTitles } from "../src/content.js";
import { team } from "../src/team-data.js";
const item = {
  id: "a",
  title: "Приём врача",
  category: "Консультации",
  priceType: "FIXED",
  price: 500,
  minimumPrice: 500,
  maximumPrice: 500,
};
const catalog = (items = [item]) => ({
  status: "ready",
  currency: "RUB",
  updatedAt: new Date().toISOString(),
  items,
});
test("hide zero, internal, malformed and duplicate services", () => {
  const bad = [
    { ...item, id: "zero", price: 0, minimumPrice: 0, maximumPrice: 0 },
    { ...item, id: "internal", title: "Внутренняя служебная позиция" },
    { ...item, id: "bad", priceType: "RANGE", maximumPrice: 200 },
    item,
  ];
  assert.deepEqual(normalizeCatalog(catalog([item, ...bad])).items, [item]);
});
test("reject stale catalog, invalid date, nonready and wrong currency", () => {
  for (const patch of [
    { updatedAt: "2000-01-01" },
    { updatedAt: "invalid" },
    { status: "syncing" },
    { currency: "USD" },
  ])
    assert.throws(() => normalizeCatalog({ ...catalog(), ...patch }));
});
test("fixed-price CRM positions can have zero min/max and normalize to price", () => {
  assert.deepEqual(
    normalizeCatalog(catalog([{ ...item, minimumPrice: 0, maximumPrice: 0 }]))
      .items,
    [item],
  );
});
test("search is wordwise, case and е/ё insensitive; categories combine", () => {
  assert.equal(
    filterCatalog(catalog().items, "прием врач", "Консультации").length,
    1,
  );
  assert.equal(filterCatalog(catalog().items, "прием", "Другое").length, 0);
  assert.ok(displayPrice(item).includes("500"));
  assert.match(displayPrice({ ...item, priceType: "RANGE" }), /^от/);
});
test("price proxy only GET/HEAD, strips private extras, errors fail closed", async () => {
  const fetcher = async () =>
    Response.json({
      ...catalog(),
      secret: "no",
      items: [{ ...item, privateNote: "no" }],
    });
  const response = await priceResponse(
    new Request("http://test/api/prices"),
    fetcher,
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.secret, undefined);
  assert.equal(body.items[0].privateNote, undefined);
  assert.equal(
    (
      await priceResponse(
        new Request("http://test/api/prices", { method: "POST" }),
        fetcher,
      )
    ).status,
    405,
  );
  const head = await priceResponse(
    new Request("http://test/api/prices", { method: "HEAD" }),
    fetcher,
  );
  assert.equal(await head.text(), "");
  assert.equal(
    (
      await priceResponse(new Request("http://test/api/prices"), async () => {
        throw Error();
      })
    ).status,
    503,
  );
});
test("all routes prerendered with one h1, working internal links and real assets", async () => {
  for (const path of Object.keys(routeTitles)) {
    const html = await readFile(
      new URL(
        `../dist/client${path === "/" ? "" : path}/index.html`,
        import.meta.url,
      ),
      "utf8",
    );
    assert.equal((html.match(/<h1[ >]/g) || []).length, 1, path);
    assert.ok(html.includes('lang="ru"'));
    assert.ok(html.includes("temichevvet-logo.jpg"));
    assert.ok(html.includes('aria-label="Чат — задать вопрос"'), path);
    assert.ok(html.includes('class="offer-launcher"'), path);
    assert.ok(html.includes('aria-controls="clinic-offer"'), path);
    for (const match of html.matchAll(/href="(\/[^"?#]*)/g)) {
      const href = match[1];
      if (/\.[a-z0-9]+$/i.test(href)) continue;
      assert.ok(routeTitles[href], `${path} -> ${href}`);
    }
    for (const match of html.matchAll(/src="(\/[^"?#]*)/g))
      await access(new URL("../dist/client" + match[1], import.meta.url));
    for (const [, href] of html.matchAll(/href="([^" ]*#[^" ]+)"/g)) {
      if (!href.startsWith("/") && !href.startsWith("#")) continue;
      const target = new URL(href.replaceAll("&amp;", "&"), `http://local${path}`);
      const destination = target.pathname === path ? html : await readFile(new URL(`../dist/client${target.pathname === "/" ? "" : target.pathname}/index.html`, import.meta.url), "utf8");
      const id = decodeURIComponent(target.hash.slice(1));
      assert.ok(destination.includes(`id="${id}"`), `${path} -> ${href}`);
    }
  }
});
test("staff portraits are discoverable, unoverlaid, and keep the original brand", async () => {
  const home = await readFile(new URL("../dist/client/index.html", import.meta.url), "utf8");
  assert.ok(home.includes('href="/team"'));
  assert.ok(home.includes("Познакомьтесь с командой"));
  assert.equal((home.match(/class="home-team-card"/g) || []).length, 4);
  const html = await readFile(
    new URL("../dist/client/team/index.html", import.meta.url),
    "utf8",
  );
  assert.equal((html.match(/class="team-slot"/g) || []).length, 9);
  assert.ok(html.includes("Константин"));
  assert.ok(html.includes("/images/team/temichev.webp"));
  assert.ok(!html.includes("team-nameplate"));
  assert.ok(!html.includes("director-nameplate"));
  assert.ok(html.includes("/brand/temichevvet-logo.jpg"));
  for (const person of team) {
    assert.ok(html.includes(person.name), person.name);
    assert.ok(html.includes(`/images/team/${person.id}.webp`), person.id);
  }
  assert.ok(html.includes("Кандидат ветеринарных наук"));
  assert.ok(!html.includes("Раздел в разработке"));
  for (const relative of [
    "brand/temichevvet-logo.jpg",
    "images/konstantin-cat-original-1280.webp",
    "images/facade-real-1280.webp",
  ]) {
    const a = await readFile(new URL("../public/" + relative, import.meta.url));
    const b = await readFile(
      new URL(
        "../../temichevvet-clinic-new-20260910/public/" + relative,
        import.meta.url,
      ),
    );
    assert.deepEqual(a, b);
  }
});
