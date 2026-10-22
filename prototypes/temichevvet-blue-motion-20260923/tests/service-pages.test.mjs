import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { services } from "../src/content.js";
import { serviceCatalogItems, selectedServiceItems, getDirectionVisitContext } from "../src/service-catalog.js";
import { articles, newArticles, articleVisitHref } from "../src/articles-data.js";
const item = (title, category) => ({ id: title, title, category });
test("scoped price mapping follows known categories and does not mix pharmacy/ritual/internal stock", () => {
  const catalog = [item("Гастротомия", "АБДОМИНАЛЬНЫЕ ОПЕРАЦИИ"), item("Кастрация кота", "ОПЕРАЦИИ ОБЩЕГО ПРОФИЛЯ"), item("Стерилизация кошка", "Другие услуги"), item("Эвтаназия", "РИТУАЛЬНЫЕ УСЛУГИ"), item("УЗИ", "Другие услуги"), item("Ультразвуковое исследование", "Цифровое рентгенографическое исследование (Rg), 1 снимок"), item("Первичный прием врача", "Общие услуги"), item("Вакцинация", "Общие услуги"), item("Общий анализ крови", "Другие услуги")];
  assert.deepEqual(serviceCatalogItems(catalog, "surgery").map((x) => x.title), ["Гастротомия", "Кастрация кота", "Стерилизация кошка"]);
  assert.equal(serviceCatalogItems(catalog, "diagnostics").length, 2);
  assert.equal(serviceCatalogItems(catalog, "consultation").length, 1);
  assert.equal(serviceCatalogItems(catalog, "laboratory").length, 1);
  assert.deepEqual(serviceCatalogItems(catalog, "pharmacy"), []);
  assert.deepEqual(serviceCatalogItems(catalog, "__proto__"), []);
  assert.deepEqual(selectedServiceItems([], ["removed"]), []);
});
test("direction booking accepts only public direction IDs, never user-provided text", () => {
  for (const service of services) assert.equal(getDirectionVisitContext(`?direction=${service.id}`).serviceTitle, service.title);
  assert.equal(getDirectionVisitContext("?direction=__proto__"), null);
  assert.equal(getDirectionVisitContext("?direction=unknown&name=PRIVATE"), null);
  assert.equal(getDirectionVisitContext("?direction=surgery").purpose, "surgery");
});
test("nine approved articles, service pages and digestive labels are prerendered", async () => {
  assert.equal(Object.keys(articles).length, 9);
  assert.equal(Object.keys(newArticles).length, 4);
  for (const topic of ["teeth", "skin", "checkup"]) assert.ok(articleVisitHref(topic).includes(`topic=${topic}`));
  for (const service of services) {
    const html = await readFile(new URL(`../dist/client/services/${service.id}/index.html`, import.meta.url), "utf8");
    assert.ok(html.includes('id="direction-prices"'));
    assert.match(html, /href="\/">Главная<\/a>/);
    assert.ok(html.includes(`direction=${service.id}`));
    assert.ok(html.includes(service.id === "dentistry" ? "Разобрать зуб на слои" : "service-experience"));
  }
  const html = await readFile(new URL("../dist/client/journal/articles/digestion/index.html", import.meta.url), "utf8");
  for (const name of ["callout-stomach", "callout-small", "callout-large", "Двенадцатиперстная · тощая · подвздошная", "Слепая · ободочная · прямая"]) assert.ok(html.includes(name));
});
