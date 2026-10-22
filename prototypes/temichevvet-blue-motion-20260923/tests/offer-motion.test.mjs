import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupOfferEntrances } from "../src/offer-motion.js";

function fixture() {
  const handlers = new Map();
  const group = { contains: (target) => cards.includes(target) };
  const cards = Array.from({ length: 3 }, (_, index) => ({
    dataset: { offerCard: String(index) },
    values: new Map(),
    get style() { return {
      setProperty: (key, value) => this.values.set(key, value),
      removeProperty: (key) => this.values.delete(key),
    }; },
    closest(selector) { return selector === ".offer-grid" ? group : this; },
  }));
  const root = {
    querySelectorAll: () => cards,
    addEventListener: (key, handler) => handlers.set(key, handler),
    removeEventListener: (key) => handlers.delete(key),
  };
  const instances = [];
  class Observer {
    constructor(callback, options) { this.callback = callback; this.options = options; this.observed = new Set(); instances.push(this); }
    observe(card) { this.observed.add(card); }
    unobserve(card) { this.observed.delete(card); }
    disconnect() { this.observed.clear(); }
  }
  const entry = (target, ratio = 1) => ({ target, isIntersecting: ratio > 0, intersectionRatio: ratio, boundingClientRect: { height: 300 }, rootBounds: { height: 800 } });
  return { root, cards, group, handlers, Observer, entry, get observer() { return instances.at(-2); }, get departures() { return instances.at(-1); } };
}

test("first viewport contact does not trigger; sufficiently visible offers start 700ms apart", () => {
  const f = fixture();
  const dispose = setupOfferEntrances(f.root, { Observer: f.Observer });
  assert.deepEqual(f.cards.map(x => x.dataset.offerState), ["waiting", "waiting", "waiting"]);
  for (const ratio of [.001, .16, .3]) {
    f.observer.callback(f.cards.map(target => f.entry(target, ratio)));
    assert.ok(f.cards.every(x => x.dataset.offerState === "waiting"));
  }
  f.observer.callback([...f.cards].reverse().map(target => f.entry(target, .35)));
  assert.deepEqual(f.cards.map(x => x.values.get("--offer-delay")), ["120ms", "820ms", "1520ms"]);
  assert.deepEqual(f.cards.map(x => x.dataset.offerState), ["revealing", "revealing", "revealing"]);
  f.handlers.get("animationend")({ target: f.cards[0], animationName: "offer-arrive" });
  assert.equal(f.cards[0].dataset.offerState, "shown");
  dispose();
  const disposeAgain = setupOfferEntrances(f.root, { Observer: f.Observer });
  assert.equal(f.cards[0].dataset.offerState, "shown");
  assert.equal(f.observer.observed.has(f.cards[0]), true);
  f.departures.callback([{ target: f.group, isIntersecting: false }]);
  f.observer.callback([f.entry(f.cards[0])]);
  assert.equal(f.cards[0].dataset.offerState, "revealing");
  disposeAgain();
});

test("individual mobile arrival starts immediately; keyboard focus bypasses waiting", () => {
  const f = fixture();
  const dispose = setupOfferEntrances(f.root, { Observer: f.Observer });
  f.observer.callback([f.entry(f.cards[1])]);
  assert.equal(f.cards[1].values.get("--offer-delay"), "120ms");
  assert.equal(f.cards[2].dataset.offerState, "waiting");
  f.handlers.get("focusin")({ target: f.cards[2] });
  assert.equal(f.cards[2].dataset.offerState, "shown");
  assert.equal(f.observer.observed.has(f.cards[2]), true);
  dispose();
  assert.equal(f.handlers.size, 0);
  assert.equal(f.cards[0].dataset.offerState, undefined);
});

test("motion off and missing IntersectionObserver leave original content readable", () => {
  for (const config of [{ disabled: () => true }, {}]) {
    const f = fixture();
    const dispose = setupOfferEntrances(f.root, config);
    assert.ok(f.cards.every(x => x.dataset.offerState === undefined));
    dispose();
  }
  const f = fixture();
  let paused = false;
  const dispose = setupOfferEntrances(f.root, { Observer: f.Observer, disabled: () => paused });
  paused = true;
  f.observer.callback([f.entry(f.cards[0])]);
  assert.equal(f.cards[0].dataset.offerState, "shown");
  dispose();
});

test("replay requires the entire group to leave; no restart during reading or keyboard focus", () => {
  const f = fixture();
  const dispose = setupOfferEntrances(f.root, { Observer: f.Observer });
  f.observer.callback(f.cards.map(target => f.entry(target)));
  f.cards.forEach(card => f.handlers.get("animationend")({ target: card, animationName: "offer-arrive" }));
  f.observer.callback(f.cards.map(target => f.entry(target, .5)));
  f.departures.callback([{ target: f.group, isIntersecting: true }]);
  assert.ok(f.cards.every(x => x.dataset.offerState === "shown"));
  f.root.activeElement = f.cards[0];
  f.departures.callback([{ target: f.group, isIntersecting: false }]);
  assert.ok(f.cards.every(x => x.dataset.offerState === "shown"));
  f.root.activeElement = null;
  f.departures.callback([{ target: f.group, isIntersecting: false }]);
  assert.ok(f.cards.every(x => x.dataset.offerState === "waiting"));
  f.observer.callback(f.cards.map(target => f.entry(target)));
  assert.deepEqual(f.cards.map(x => x.values.get("--offer-delay")), ["120ms", "820ms", "1520ms"]);
  assert.equal(f.departures.options.rootMargin, "160px 0px 160px 0px");
  dispose();
  assert.equal(f.departures.observed.size, 0);
});

test("a card taller than a short viewport can still enter", () => {
  const f = fixture();
  const dispose = setupOfferEntrances(f.root, { Observer: f.Observer });
  f.observer.callback([{ ...f.entry(f.cards[0], .5), rootBounds: { height: 240 } }]);
  assert.equal(f.cards[0].dataset.offerState, "revealing");
  dispose();
});

test("home and offers page render three named full-card actions without JS-only hiding", async () => {
  for (const path of ["index.html", "offers/index.html"]) {
    const html = await readFile(new URL(`../dist/client/${path}`, import.meta.url), "utf8");
    assert.equal((html.match(/data-offer-card=/g) || []).length, 3);
    assert.equal((html.match(/aria-label="Узнать условия акции/g) || []).length, 3);
    assert.doesNotMatch(html, /data-offer-state="waiting"/);
  }
});
