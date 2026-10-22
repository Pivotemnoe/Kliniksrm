import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  articles,
  newArticles,
  articleServices,
  articlePath,
  articleVisitHref,
  getArticleVisitContext,
  serviceFromCatalog,
  isArticleVisible,
} from "../src/articles-data.js";
import { normalizeCatalog } from "../src/catalog.js";
import { systemCutaways } from "../src/system-cutaways.js";

const item = {
  id: articleServices.consultation.id,
  title: "Первичный прием врача",
  category: "Общие услуги",
  priceType: "FIXED",
  price: 575,
};
const catalog = (items = [item]) => ({
  status: "ready",
  currency: "RUB",
  updatedAt: new Date().toISOString(),
  items,
});

test("articles select exact public services, never a cheap similarly named item or X-ray scope", () => {
  const items = normalizeCatalog(
    catalog([{ ...item, id: "different", price: 10 }, item]),
  ).items;
  assert.equal(serviceFromCatalog(items, "consultation").price, 575);
  assert.equal(
    serviceFromCatalog([{ ...item, id: "different" }], "consultation"),
    null,
  );
  assert.equal(
    serviceFromCatalog([{ ...item, title: "Прием крысы" }], "consultation"),
    null,
  );
  assert.equal(serviceFromCatalog(items, "radiography"), null);
  const changed = normalizeCatalog(catalog([{ ...item, price: 680 }])).items;
  assert.equal(serviceFromCatalog(changed, "consultation").price, 680);
  for (const patch of [{ price: 0 }, { title: "Внутренняя услуга" }]) {
    assert.equal(
      serviceFromCatalog(
        normalizeCatalog(catalog([{ ...item, ...patch }])).items,
        "consultation",
      ),
      null,
    );
  }
  assert.throws(() =>
    normalizeCatalog({ ...catalog(), updatedAt: "2020-01-01" }),
  );
});

test("booking context accepts only known public article/service combinations", () => {
  assert.equal(
    getArticleVisitContext("?topic=digestion&service=ultrasound").purpose,
    "diagnostics",
  );
  assert.equal(
    getArticleVisitContext("?topic=movement").purpose,
    "consultation",
  );
  for (const query of [
    "",
    "?topic=unknown",
    "?topic=__proto__",
    "?topic=movement&service=stool",
    "?topic=digestion&service=__proto__",
    "?topic=%3Cscript%3E",
  ])
    assert.equal(getArticleVisitContext(query), null);
  assert.ok(
    !JSON.stringify(
      getArticleVisitContext("?topic=digestion&name=PRIVATE&phone=SECRET"),
    ).includes("PRIVATE"),
  );
  assert.equal(articleVisitHref("wrong"), "/visit");
  assert.equal(articleVisitHref("movement", "ultrasound"), "/visit");
  assert.equal(
    articleVisitHref("digestion", "stool"),
    "/visit?topic=digestion&service=stool",
  );
});

test("approved articles are prerendered with contextual booking, sources and no copied prices", async () => {
  for (const [topic, article] of Object.entries(articles).filter(([, article]) => isArticleVisible(article))) {
    const html = await readFile(
      new URL(
        `../dist/client${articlePath(topic)}/index.html`,
        import.meta.url,
      ),
      "utf8",
    );
    assert.ok(html.includes(article.title));
    assert.ok(html.includes(`topic=${topic}&amp;service=consultation`));
    assert.ok(html.includes("не заменяет осмотр"));
    assert.ok(html.includes("Источники и медицинская основа материала"));
    assert.ok(!/\b575\s*₽|1.380\s*₽|\b600\s*₽/.test(html));
    assert.ok(!html.includes('type="tel"'));
    for (const key of article.serviceKeys)
      assert.ok(html.includes(articleServices[key].path));
  }
});

test("four owner-approved clinical articles use pet illustrations, three zoom stages and booking context", async () => {
  const approved = Object.entries(newArticles);
  assert.deepEqual(approved.map(([topic]) => topic), ["heart", "breathing", "urinary", "ear"]);
  const journal = await readFile(new URL("../dist/client/journal/articles/index.html", import.meta.url), "utf8");
  for (const [topic, article] of approved) {
    assert.equal(isArticleVisible(article), true);
    assert.equal(articles[topic], article);
    assert.ok(articleVisitHref(topic).includes(`topic=${topic}`));
    assert.equal(getArticleVisitContext(`?topic=${topic}`).topic, topic);
    assert.ok(journal.includes(articlePath(topic)));
    const html = await readFile(new URL(`../dist/client${articlePath(topic)}/index.html`, import.meta.url), "utf8");
    assert.ok(html.includes(article.title));
    assert.ok(html.includes("system-explorer"));
    assert.ok(html.includes("system-zoom-control"));
    assert.ok(html.includes("data-stage=\"0\""));
    assert.ok(html.includes(`/assets/story-${topic === "urinary" || topic === "ear" ? `${topic}-cat` : `${topic}-dog`}.webp`));
    assert.ok(!html.includes("system-art-watermark"));
    assert.ok(!html.includes("Черновик · на согласовании"));
  }
});

test("four new stories reveal versioned internal models with selectable parts, heart valves and story links", async () => {
  for (const topic of ["heart", "breathing", "urinary", "ear"]) {
    const model = systemCutaways[topic];
    assert.equal(model.items.length, 4);
    for (const item of model.items) {
      assert.ok(item.points.length >= 1);
      assert.ok(item.points.every(([x, y]) => x > 0 && x < 100 && y > 0 && y < 100));
    }
    const asset = await readFile(new URL(`../public${model.image}`, import.meta.url));
    assert.ok(asset.length > 50_000, `${topic} cutaway is a real raster asset`);
    const html = await readFile(new URL(`../dist/client${articlePath(topic)}/index.html`, import.meta.url), "utf8");
    assert.ok(html.includes(model.image));
    assert.ok(html.includes("system-cutaway-hotspot"));
    assert.ok(html.includes("system-open-control"));
    assert.ok(html.includes("system-story-links"));
    assert.ok(html.includes("system-help-actions"));
    assert.ok(html.includes("Задать вопрос в чате"));
    assert.ok(html.includes("не диагностическое изображение"));
    for (const other of ["heart", "breathing", "urinary", "ear"].filter((x) => x !== topic))
      assert.ok(html.includes(articlePath(other)));
  }
  assert.equal(systemCutaways.heart.valves.length, 4);
  const heart = await readFile(new URL("../dist/client/journal/articles/heart/index.html", import.meta.url), "utf8");
  assert.ok(heart.includes("Клапаны"));
  assert.deepEqual(systemCutaways.heart.valves.map((valve) => valve.name), ["Трёхстворчатый клапан", "Клапан лёгочной артерии", "Митральный клапан", "Аортальный клапан"]);
  assert.ok(heart.includes("Правая и левая стороны названы со стороны животного"));
});

test("tooth uses independent enamel/dentin/pulp assets and public pet atlas includes three systems", async () => {
  const tooth = await readFile(
    new URL("../dist/client/services/dentistry/index.html", import.meta.url),
    "utf8",
  );
  for (const part of ["enamel", "dentin", "pulp"])
    assert.ok(tooth.includes(`tooth-layer-${part}.webp`));
  assert.match(tooth, /aria-label="Разобрать зуб на слои"/);
  assert.doesNotMatch(tooth, /tooth-turntable/);
  const pets = await readFile(
    new URL("../dist/client/pets/index.html", import.meta.url),
    "utf8",
  );
  for (const label of ["Скелет", "Мышцы", "Пищеварение"])
    assert.ok(pets.includes(label));
  assert.ok(pets.includes("/journal/articles/movement#movement-observations"));
  const movement = await readFile(new URL("../dist/client/journal/articles/movement/index.html", import.meta.url), "utf8");
  assert.ok(movement.includes('id="movement-observations"'));
  assert.ok(movement.includes("anatomy-dog-muscles-v2.webp"));
  assert.ok(!movement.includes("anatomy-dog-muscles.webp"));
});
