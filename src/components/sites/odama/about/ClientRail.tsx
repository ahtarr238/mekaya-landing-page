"use client";
/* eslint-disable @next/next/no-img-element -- tiles swap their src imperatively every frame */

import { useEffect, useRef } from "react";
import { gsap } from "../SmoothScroll";
import { ABOUT_CARDS, type CardSet } from "./data";
import { easeOdama, easeOdamaIO, isMouseEvent, scrambleTo } from "./motion";

const SLOTS = 12;
/** Lift (px) by distance from the marker, in card widths. */
const CREST = [50, 30, 20, 0];
const CREST_MAX = CREST[0];
const HIDE_ON_DESKTOP = "[@media(hover:hover)_and_(pointer:fine)_and_(min-width:1024px)]:opacity-0";
const MARKER_T = "translate3d(var(--marker),0,0) translateX(-50%)";
const HOVER_HIDDEN = "inset(100% 0 0 0)";
const IMG =
  "absolute inset-0 size-full scale-105 object-cover transition-transform duration-[700ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-data-[swell]:scale-[1.1]";
const AUTO_SPEED = 38;

const mod = (a: number, n: number) => ((a % n) + n) % n;
const crest = (u: number) => {
  const a = Math.abs(u);
  if (a >= CREST.length - 1) return 0;
  const i = Math.floor(a);
  return CREST[i] + (CREST[i + 1] - CREST[i]) * (a - i);
};

interface Slot {
  k: number;
  set: CardSet;
  src: string;
  hover: string;
  h: number;
  p: number;
  wait: number;
}

const preloaded = new Set<string>();
function preload(src: string) {
  if (preloaded.has(src)) return;
  preloaded.add(src);
  const img = new Image();
  img.decoding = "async";
  img.src = src;
}

export function ClientRail({ set, onBrowse }: { set: CardSet; onBrowse: (on: boolean) => void }) {
  const railRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<HTMLDivElement[]>([]);
  const imgRefs = useRef<HTMLImageElement[]>([]);
  const hoverRefs = useRef<HTMLImageElement[]>([]);
  const dotRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const onBrowseRef = useRef(onBrowse);
  const setRef = useRef<CardSet>(set);
  const switchRef = useRef<((s: CardSet) => void) | null>(null);

  useEffect(() => {
    onBrowseRef.current = onBrowse;
  });

  useEffect(() => {
    if (set !== setRef.current) {
      setRef.current = set;
      switchRef.current?.(set);
    }
  }, [set]);

  useEffect(() => {
    const rail = railRef.current;
    const dot = dotRef.current;
    const label = labelRef.current;
    const cards = cardRefs.current.slice(0, SLOTS);
    const imgs = imgRefs.current.slice(0, SLOTS);
    const hovers = hoverRefs.current.slice(0, SLOTS);
    if (!rail || !dot || !label || cards.length < SLOTS) return;

    const warm = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        warm.disconnect();
        Object.values(ABOUT_CARDS)
          .flat()
          .forEach((c) => {
            preload(c.src);
            if (c.hover) preload(c.hover);
          });
      },
      { rootMargin: "100% 0px" },
    );
    warm.observe(rail);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const slots: Slot[] = cards.map((_, i) => ({
      k: i,
      set: setRef.current,
      src: ABOUT_CARDS[setRef.current][i % ABOUT_CARDS[setRef.current].length].src,
      hover: "",
      h: 0,
      p: 0,
      wait: 0,
    }));

    let cardW = 110;
    let pitch = 118;
    let padL = 16;
    let crestMax: number = CREST_MAX;
    const measure = () => {
      cardW = cards[0].offsetWidth || cardW;
      pitch = cardW + 8;
      padL = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
      crestMax = window.matchMedia("(min-width: 1024px)").matches ? CREST_MAX : 32;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rail);

    let offset = 0;
    let vel = reduced ? 0 : AUTO_SPEED;
    let time = 0;
    let pointerX: number | null = null;
    let browsing = false;
    let dragging = false;
    let dragId = -1;
    let lastX = 0;
    let pending = 0;
    let dragVel = 0;
    let lift = 0;
    let activeCard: HTMLDivElement | null = null;
    let swell: boolean | null = null;
    let labelText = label.textContent ?? "";
    let scrambleTween: gsap.core.Tween | null = null;

    const home = () => (desktop.matches ? padL + cardW / 2 : rail.clientWidth / 2);
    let marker = home();

    const setSrc = (i: number, src: string) => {
      const s = slots[i];
      if (s.src !== src) {
        s.src = src;
        imgs[i].src = src;
      }
    };
    const setHover = (i: number, src = "") => {
      const s = slots[i];
      if (s.hover === src) return;
      s.hover = src;
      if (src) hovers[i].src = src;
      else hovers[i].removeAttribute("src");
    };

    switchRef.current = (next) => {
      let n = 0;
      slots
        .map((s) => ({ s, x: padL + s.k * pitch - offset }))
        .sort((a, b) => a.x - b.x)
        .forEach(({ s, x }) => {
          const visible = x > -pitch && x < rail.clientWidth;
          if (reduced || !visible) {
            s.set = next;
            s.p = 0;
            s.wait = 0;
            return;
          }
          if (s.p > 0 || time < s.wait) return;
          if (s.set !== next) s.wait = time + 0.05 * n++ + 0.08 * Math.random();
        });
    };

    const setLabel = (text: string) => {
      if (text === labelText) return;
      labelText = text;
      scrambleTween?.kill();
      const speed = Math.abs(dragging ? dragVel : vel);
      if (reduced || !label.textContent || speed > 152) {
        label.textContent = text;
        return;
      }
      const proxy = { p: 0 };
      const from = label.textContent.length;
      scrambleTween = gsap.to(proxy, {
        p: 1,
        duration: 0.6,
        ease: "none",
        onUpdate: () => {
          const len = Math.round(from + (text.length - from) * Math.min(1, proxy.p * 2));
          label.textContent = scrambleTo(text, Math.floor(proxy.p * (text.length + 1)), len);
        },
        onComplete: () => {
          label.textContent = text;
        },
      });
    };

    let raf = 0;
    let last = 0;
    let visible = true;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
      last = now;
      time += dt;
      if (dragging) {
        const d = pending;
        pending = 0;
        offset -= d;
        if (dt > 0) dragVel += (d / dt - dragVel) * (1 - Math.exp(-dt / 0.06));
        vel = 0;
      } else {
        if (pending) {
          offset -= pending;
          pending = 0;
        }
        const target = browsing || reduced ? 0 : AUTO_SPEED;
        const rate = Math.abs(vel) > 57 ? 3.4 : 6;
        vel += (target - vel) * (1 - Math.exp(-dt * rate));
        offset += vel * dt;
      }
      const goal = Math.min(rail.clientWidth - padL, Math.max(padL, pointerX ?? home()));
      marker += (goal - marker) * (1 - Math.exp(-(9 * dt)));
      const liftGoal = desktop.matches ? (browsing ? 1 : 0) : 1;
      lift += (liftGoal - lift) * (1 - Math.exp(-dt * (liftGoal > lift ? 7 : 9)));
      const amp = (crestMax / CREST_MAX) * lift;
      const first = Math.floor((offset - padL) / pitch) - 1;
      let nearest = { d: Infinity, i: 0 };
      for (let i = 0; i < SLOTS; i++) {
        const s = slots[i];
        const k = first + mod(i - first, SLOTS);
        if (k !== s.k) {
          s.k = k;
          s.set = setRef.current;
          s.p = 0;
          s.wait = 0;
          s.h = 0;
          cards[i].style.clipPath = "";
          hovers[i].style.clipPath = HOVER_HIDDEN;
        }
        const cur = setRef.current;
        if (s.p > 0 || (s.set !== cur && time >= s.wait)) {
          if (s.set !== cur) {
            s.p = Math.min(1, s.p + dt / 0.45);
            if (s.p === 1) s.set = cur;
          } else {
            s.p = Math.max(0, s.p - dt / 0.6);
          }
          const e = easeOdamaIO(s.p);
          cards[i].style.clipPath = e ? `inset(${(100 * e).toFixed(2)}% 0 0 0 round 8px)` : "";
        }
        const list = ABOUT_CARDS[s.set];
        const card = list[mod(k, list.length)];
        setSrc(i, card.src);
        setHover(i, card.hover);
        const x = padL + k * pitch - offset;
        const u = (x + cardW / 2 - marker) / pitch;
        const y = reduced ? 0 : amp * crest(u);
        cards[i].style.transform = `translate3d(${x.toFixed(2)}px,${(-y).toFixed(2)}px,0)`;
        if (Math.abs(u) < nearest.d) nearest = { d: Math.abs(u), i };
      }
      const mt = `translate3d(${marker.toFixed(2)}px,0,0) translateX(-50%)`;
      dot.style.transform = mt;
      label.style.transform = mt;
      const near = cards[nearest.i];
      if (near !== activeCard) {
        activeCard?.removeAttribute("data-active");
        activeCard?.removeAttribute("data-swell");
        near.setAttribute("data-active", "");
        activeCard = near;
        swell = null;
      }
      const sw = lift > 0.5 && slots[nearest.i].set !== "members";
      if (sw !== swell) {
        swell = sw;
        if (sw) near.setAttribute("data-swell", "");
        else near.removeAttribute("data-swell");
      }
      const ns = slots[nearest.i];
      const nl = ABOUT_CARDS[ns.set];
      setLabel(nl[mod(ns.k, nl.length)].name);
      const showHover = browsing || !desktop.matches;
      for (let i = 0; i < SLOTS; i++) {
        const s = slots[i];
        const want = showHover && i === nearest.i && s.hover ? 1 : 0;
        if (s.h === want) continue;
        s.h = want > s.h ? Math.min(1, s.h + dt / 0.42) : Math.max(0, s.h - dt / 0.28);
        const a = (1 - easeOdamaIO(s.h)) * 100;
        hovers[i].style.clipPath = a ? `inset(${a.toFixed(2)}% 0 0 0)` : "";
      }
    };
    const start = () => {
      if (!raf && visible) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const io = new IntersectionObserver(([en]) => {
      visible = en.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(rail);
    start();

    const markers = [dot, label];
    const setBrowsing = (on: boolean, animate: boolean) => {
      if (browsing === on) return;
      browsing = on;
      onBrowseRef.current(on);
      if (animate && desktop.matches) {
        gsap.to(markers, {
          opacity: on ? 1 : 0,
          duration: reduced ? 0 : on ? 0.35 : 0.25,
          ease: on ? easeOdama : "power2.in",
          overwrite: true,
        });
      }
    };
    const trackPointer = (e: PointerEvent) => {
      const r = rail.getBoundingClientRect();
      pointerX = Math.min(r.width - padL, Math.max(padL, e.clientX - r.left));
    };
    const onDown = (e: PointerEvent) => {
      if (isMouseEvent(e) && e.button !== 0) return;
      dragging = true;
      dragId = e.pointerId;
      lastX = e.clientX;
      pending = 0;
      dragVel = 0;
      vel = 0;
      try {
        rail.setPointerCapture(e.pointerId);
      } catch {
        /* capture can fail for synthetic pointers */
      }
      setBrowsing(true, isMouseEvent(e));
      if (isMouseEvent(e)) trackPointer(e);
    };
    const onMove = (e: PointerEvent) => {
      if (dragging && e.pointerId === dragId) {
        pending += e.clientX - lastX;
        lastX = e.clientX;
      }
      if (isMouseEvent(e) && desktop.matches) {
        setBrowsing(true, true);
        trackPointer(e);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging || e.pointerId !== dragId) return;
      dragging = false;
      dragId = -1;
      try {
        rail.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      vel = e.type === "pointercancel" ? 0 : Math.max(-2800, Math.min(2800, -dragVel));
      dragVel = 0;
      if (!isMouseEvent(e)) {
        setBrowsing(false, false);
        return;
      }
      const r = rail.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) {
        setBrowsing(false, true);
      }
    };
    const onLeave = (e: PointerEvent) => {
      if (!dragging && isMouseEvent(e)) setBrowsing(false, true);
    };
    const onMedia = () => {
      if (desktop.matches) return;
      pointerX = null;
      gsap.set(markers, { clearProps: "opacity" });
    };

    rail.addEventListener("pointermove", onMove, { passive: true });
    rail.addEventListener("pointerdown", onDown, { passive: true });
    rail.addEventListener("pointerleave", onLeave);
    rail.addEventListener("pointerup", onUp);
    rail.addEventListener("pointercancel", onUp);
    desktop.addEventListener("change", onMedia);

    return () => {
      stop();
      if (browsing) onBrowseRef.current(false);
      io.disconnect();
      warm.disconnect();
      ro.disconnect();
      scrambleTween?.kill();
      switchRef.current = null;
      rail.removeEventListener("pointermove", onMove);
      rail.removeEventListener("pointerdown", onDown);
      rail.removeEventListener("pointerleave", onLeave);
      rail.removeEventListener("pointerup", onUp);
      rail.removeEventListener("pointercancel", onUp);
      desktop.removeEventListener("change", onMedia);
      gsap.killTweensOf(markers);
    };
  }, []);

  const initial = ABOUT_CARDS.clients;
  return (
    <div
      ref={railRef}
      data-cursor="grab"
      className="relative cursor-grab touch-pan-y select-none overflow-hidden px-[var(--gutter)] pt-[var(--crest)] active:cursor-grabbing [--card:6.875rem] [--crest:32px] [--marker:50vw] lg:[--card:calc((100vw-2*var(--gutter)-7*0.5rem)/8)] lg:[--crest:50px] lg:[--marker:calc(var(--gutter)+var(--card)/2)]"
    >
      <div className="relative">
        <div aria-hidden="true" className="invisible aspect-square w-[var(--card)]" />
        <ul className="sr-only">
          {ABOUT_CARDS[set].map((c) => (
            <li key={c.name}>{c.name}</li>
          ))}
        </ul>
        <div aria-hidden="true" className="contents">
          {Array.from({ length: SLOTS }, (_, i) => {
            const c = initial[i % initial.length];
            return (
              <div
                key={i}
                ref={(el) => {
                  if (el) cardRefs.current[i] = el;
                }}
                className="group absolute left-[calc(var(--gutter)*-1)] top-0 aspect-square w-[var(--card)] overflow-hidden rounded-[8px] bg-surface will-change-transform"
                style={{ transform: `translate3d(calc(var(--gutter) + ${i} * (var(--card) + 8px)), 0, 0)` }}
              >
                <img
                  ref={(el) => {
                    if (el) imgRefs.current[i] = el;
                  }}
                  src={c.src}
                  alt=""
                  loading="lazy"
                  draggable={false}
                  className={IMG}
                />
                <img
                  ref={(el) => {
                    if (el) hoverRefs.current[i] = el;
                  }}
                  alt=""
                  draggable={false}
                  style={{ clipPath: HOVER_HIDDEN }}
                  className={IMG}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="relative mt-4 h-[60px]">
        <div className="absolute inset-x-0 top-0 h-px bg-line" />
        <span
          ref={dotRef}
          style={{ transform: MARKER_T }}
          className={`pointer-events-none absolute left-[calc(var(--gutter)*-1)] top-0 block size-[7px] -translate-y-1/2 rounded-full bg-ink ${HIDE_ON_DESKTOP}`}
        />
        <span
          ref={labelRef}
          style={{ transform: MARKER_T }}
          className={`pointer-events-none absolute left-[calc(var(--gutter)*-1)] top-[30px] block whitespace-nowrap text-sm font-medium ${HIDE_ON_DESKTOP}`}
        >
          {initial[0].name}
        </span>
      </div>
    </div>
  );
}
