import { useEffect } from "react";
import { clamp, parallaxOffset, pointGazeTarget, revealPhase, scrollGazeTarget } from "./motion-math.js";
import { setupOfferEntrances } from "./offer-motion.js";

// Scroll position is the only clock for rotation, reveal and card stacking.
// Pointer easing runs only while its target changes; no perpetual animation loop.
export function useMotion(path, paused) {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const fine = matchMedia("(pointer: fine)");
    let scrollFrame = 0,
      pointerFrame = 0,
      x = 0,
      y = 0,
      tx = 0,
      ty = 0,
      lastScroll = window.scrollY,
      touching = false,
      gazeSource = "pointer";
    const root = document.documentElement;
    const disabled = () => paused || reduced.matches;
    const disposeOffers = setupOfferEntrances(document, { disabled });
    // Small, one-shot entrances on secondary pages; content is never hidden
    // in the server-rendered/no-JS version and remains readable when paused.
    const entering = [
      ...document.querySelectorAll(
        ".page-intro,.service-photo,.clinic-panorama,.editorial-section,.team-slot,.journal-banner,.explore-links-heading",
      ),
    ];
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              for (const entry of entries)
                if (entry.isIntersecting) {
                  if (!disabled())
                    entry.target.classList.add("scroll-entry", "arrived");
                  observer.unobserve(entry.target);
                }
            },
            { threshold: 0.15 },
          );
    entering.forEach((el) => observer?.observe(el));
    const frame = () => {
      scrollFrame = 0;
      const off = disabled(),
        scroll = window.scrollY;
      root.dataset.motion = off ? "off" : "on";
      const scrollLook = scrollGazeTarget(scroll, lastScroll);
      if (!off && path === "/" && !touching && scrollLook !== null) {
        ty = scrollLook;
        gazeSource = "scroll";
        if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
      }
      lastScroll = scroll;
      root.style.setProperty(
        "--site-header",
        `${document.querySelector(".header")?.offsetHeight || 112}px`,
      );
      root.style.setProperty(
        "--orbit-turn",
        off ? "0deg" : `${scroll * 0.55}deg`,
      );
      document.querySelectorAll("[data-parallax]").forEach((el) => {
        const depth = Number(el.dataset.parallax);
        el.style.setProperty(
          "--parallax-y",
          `${parallaxOffset(scroll, depth, innerWidth, off)}px`,
        );
      });
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        const box = el.getBoundingClientRect();
        const progress = off
          ? 1
          : clamp((innerHeight * 0.97 - box.top) / (innerHeight * 0.46));
        el.querySelectorAll("[data-word]").forEach((word, i, list) => {
          const phase = revealPhase(progress, i, list.length);
          word.style.opacity = String(off ? 1 : 0.12 + phase * 0.88);
          word.style.transform = `translateY(${off ? 0 : (1 - phase) * 44}px)`;
          word.style.filter = off ? "none" : `blur(${(1 - phase) * 2}px)`;
        });
      });
      document.querySelectorAll("[data-stack]").forEach((el) => {
        const box = el.getBoundingClientRect();
        const mobile = innerWidth < 900;
        const progress = off
          ? 0
          : mobile
            ? clamp((innerHeight * 0.85 - box.top) / Math.max(box.height * 0.7, 1))
            : clamp((150 - box.top) / 600);
        el.style.setProperty("--stack-progress", progress);
        el.dataset.progress = progress.toFixed(3);
        el.querySelectorAll("[data-stack-card]").forEach((card, i) => {
          const phase = mobile
            ? off
              ? 1
              : clamp((innerHeight * 0.9 - card.getBoundingClientRect().top) / Math.max(innerHeight * 0.34, 1))
            : clamp((progress - i * 0.46) * 2);
          card.style.setProperty("--card-phase", phase);
        });
      });
    };
    const scroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(frame);
    };
    const applyPointer = () => {
      pointerFrame = 0;
      x += (tx - x) * 0.085;
      y += (ty - y) * 0.085;
      root.style.setProperty("--pointer-x", `${(x * 17).toFixed(2)}px`);
      root.style.setProperty("--pointer-y", `${(y * 10).toFixed(2)}px`);
      root.style.setProperty("--pointer-turn", `${(x * 0.7).toFixed(2)}deg`);
      window.dispatchEvent(
        new CustomEvent("clinic:gaze", {
          detail: { x, y, active: !disabled(), source: gazeSource },
        }),
      );
      if (Math.abs(tx - x) + Math.abs(ty - y) > 0.003)
        pointerFrame = requestAnimationFrame(applyPointer);
    };
    const aim = (clientX, clientY, source) => {
      [tx, ty] = pointGazeTarget(clientX, clientY, innerWidth, innerHeight);
      gazeSource = source;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
    };
    const heroVisible = () => {
      const box = document.querySelector(".hero")?.getBoundingClientRect();
      return box && box.bottom > 0 && box.top < innerHeight;
    };
    const pointer = (e) => {
      if (disabled() || path !== "/" || !heroVisible()) return;
      if (e.pointerType === "touch") {
        touching = true;
        aim(e.clientX, e.clientY, "touch");
      } else if (fine.matches && innerWidth >= 900) {
        aim(e.clientX, e.clientY, "pointer");
      }
    };
    // iOS can cancel pointermove as soon as a native page scroll starts. A
    // passive touch listener keeps the gaze following the finger without
    // stealing scrolling or taps from links and buttons.
    const touch = (e) => {
      if (disabled() || path !== "/" || !heroVisible()) return;
      const finger = e.touches[0];
      if (!finger) return;
      touching = true;
      aim(finger.clientX, finger.clientY, "touch");
    };
    const endTouch = () => {
      touching = false;
      if (gazeSource !== "touch") return;
      tx = 0;
      ty = 0;
      gazeSource = "touch-end";
      if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
    };
    const resetPointer = () => {
      if (gazeSource === "scroll") return;
      tx = 0;
      ty = 0;
      if (!pointerFrame) pointerFrame = requestAnimationFrame(applyPointer);
    };
    const media = () => {
      x = tx = y = ty = 0;
      touching = false;
      lastScroll = window.scrollY;
      root.style.setProperty("--pointer-x", "0px");
      root.style.setProperty("--pointer-y", "0px");
      root.style.setProperty("--pointer-turn", "0deg");
      window.dispatchEvent(
        new CustomEvent("clinic:gaze", {
          detail: { x: 0, y: 0, active: false },
        }),
      );
      scroll();
    };
    media();
    window.addEventListener("scroll", scroll, { passive: true });
    window.addEventListener("resize", media);
    window.addEventListener("pointermove", pointer, { passive: true });
    window.addEventListener("touchstart", touch, { passive: true });
    window.addEventListener("touchmove", touch, { passive: true });
    window.addEventListener("touchend", endTouch, { passive: true });
    window.addEventListener("touchcancel", endTouch, { passive: true });
    document.addEventListener("pointerleave", resetPointer);
    reduced.addEventListener("change", media);
    fine.addEventListener("change", media);
    return () => {
      disposeOffers();
      observer?.disconnect();
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(pointerFrame);
      window.removeEventListener("scroll", scroll);
      window.removeEventListener("resize", media);
      window.removeEventListener("pointermove", pointer);
      window.removeEventListener("touchstart", touch);
      window.removeEventListener("touchmove", touch);
      window.removeEventListener("touchend", endTouch);
      window.removeEventListener("touchcancel", endTouch);
      document.removeEventListener("pointerleave", resetPointer);
      reduced.removeEventListener("change", media);
      fine.removeEventListener("change", media);
    };
  }, [path, paused]);
}
