// Observe a stationary slot, animate its child. First contact with the viewport
// is not enough: visitors must already be able to see most of the card.
export function setupOfferEntrances(root, { disabled, Observer } = {}) {
  const cards = [...root.querySelectorAll("[data-offer-card]")];
  const isDisabled = disabled || (() => false);
  const ObserverClass = Observer ?? globalThis.IntersectionObserver;
  if (!ObserverClass || isDisabled()) return () => {};
  const groups = [...new Set(cards.map((card) => card.closest(".offer-grid")))];

  const show = (card) => {
    card.dataset.offerState = "shown";
  };
  const observer = new ObserverClass((entries) => {
    const arriving = entries
      .filter((entry) => {
        if (!entry.isIntersecting || entry.target.dataset.offerState !== "waiting") return false;
        // The smaller threshold also accommodates very short/zoomed viewports.
        const enough = Math.min(.35, (entry.rootBounds?.height || Infinity) * .3 / entry.boundingClientRect.height);
        return entry.intersectionRatio >= enough;
      })
      .sort((a, b) => cards.indexOf(a.target) - cards.indexOf(b.target));
    arriving.forEach(({ target }, index) => {
      if (isDisabled()) show(target);
      else {
        target.style.setProperty("--offer-delay", `${120 + index * 700}ms`);
        target.dataset.offerState = "revealing";
      }
    });
  }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20), rootMargin: "0px" });

  // Replay only after the WHOLE group has left the screen by a generous margin.
  // Never restart while reading, hovering, or scrolling between mobile cards.
  const departures = new ObserverClass((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting || target.contains(root.activeElement)) return;
      cards.filter((card) => card.closest(".offer-grid") === target).forEach((card) => {
        card.dataset.offerState = isDisabled() ? "shown" : "waiting";
        card.style.removeProperty("--offer-delay");
      });
    });
  }, { threshold: 0, rootMargin: "160px 0px 160px 0px" });

  const focus = (event) => {
    const card = event.target.closest("[data-offer-card]");
    if (cards.includes(card)) show(card);
  };
  const finish = (event) => {
    const card = event.target.closest("[data-offer-card]");
    if (event.animationName === "offer-arrive" && cards.includes(card)) show(card);
  };
  cards.forEach((card) => {
    if (card.dataset.offerState !== "shown") card.dataset.offerState = "waiting";
    observer.observe(card);
  });
  groups.forEach((group) => departures.observe(group));
  root.addEventListener("focusin", focus);
  root.addEventListener("animationend", finish);
  return () => {
    observer.disconnect();
    departures.disconnect();
    root.removeEventListener("focusin", focus);
    root.removeEventListener("animationend", finish);
    cards.forEach((card) => {
      if (card.dataset.offerState !== "shown") delete card.dataset.offerState;
      card.style.removeProperty("--offer-delay");
    });
  };
}
