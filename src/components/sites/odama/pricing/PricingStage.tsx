"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { gsap, ScrollTrigger } from "../SmoothScroll";
import { PLANS, PRICING_LABEL, PRICING_LEAD, TONES } from "./data";
import { FaqList } from "./FaqList";
import {
  clamp01,
  cosine,
  easeOdama,
  easeOdamaIO,
  lerp,
  rideCaret,
  scrambleClock,
  scrambleTo,
  streamIn,
  streamOut,
  within,
} from "./motion";
import { StagePlanBody, Words } from "./PlanParts";
import styles from "./stage.module.css";
import type { ClipRect, VoxelScene } from "./voxelScene";

/**
 * Pinned "Pricings -> FAQ" stage (desktop: min-width 1024px and min-height 600px).
 *
 * One scrubbed progress value (0..1 over the 310vh wrapper) drives everything, as on
 * odama.io: the three plan cards slide right into the right-hand column and stack into an
 * accordion (Small Builds open, the others collapse to title bars), a voxel hand pushes the
 * first card, the cubes turn into a "?" that dissolves, the label scrambles to "FAQ" and the
 * FAQ list streams in on the left.
 */

const STAGE_QUERY = "(min-width: 1024px) and (min-height: 600px)";
const at = (e: number) => (90 + 120 * e) / 210;
const MOVE = [0.02857142857142857, 0.8] as const; // cards slide right and widen
const STACK = [at(0), at(1)] as const; // cards stack into the right column
const FAQ_AT = at(0.85); // FAQ streams in once the "?" is gone
const APPEAR = [0.0380952380952381, 0.3047619047619048] as const; // voxel hand flies in
const HAND_UNTIL = 0.6571428571428571; // then the cubes become a "?"
const ERASE = [0.6, 0.97] as const; // text of the trailing cards is erased while they slide
const RETYPE = [0.55, 0.9] as const; // their titles are retyped as bars
const LABEL = [at(0.51), at(0.89)] as const; // "Pricings" scrambles to "FAQ"
const SNAP_AT = at(0.5); // past this, a pause in scrolling glides to the end
const FIRST = 0;
const TRAIL_GLYPHS = ":/\\AD0@";

type BodyState = "open" | "bar" | "empty";

interface Geo {
  W: number;
  H: number;
  y0: number;
  Hc: number;
  colW: number;
  Fx: number;
  Fw: number;
  top: number;
  A: number;
  th: number[];
  Qw: number;
  headBottom: number;
  headMin: number;
  lead: number;
  firstLine: number;
}

interface Controls {
  select: (index: number) => void;
  hover: (index: number, on: boolean) => void;
  activate: (index: number) => void;
}

function subscribeStage(onChange: () => void) {
  const mq = window.matchMedia(STAGE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function useStageEnabled() {
  return useSyncExternalStore(
    subscribeStage,
    () => window.matchMedia(STAGE_QUERY).matches,
    () => false,
  );
}

const wordsOf = (el: Element) =>
  Array.from(el.querySelectorAll<HTMLElement>("[data-pw], [data-pr]")).filter((w) => !w.closest(".invisible"));

export function PricingStage() {
  const enabled = useStageEnabled();
  const [active, setActive] = useState(FIRST);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const sceneCanvasRef = useRef<HTMLCanvasElement>(null);
  const trailCanvasRef = useRef<HTMLCanvasElement>(null);
  const relRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const leadRef = useRef<HTMLHeadingElement>(null);
  const sceneBoxRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);
  const faqCaretRef = useRef<HTMLSpanElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const bodyRefs = useRef<(HTMLDivElement | null)[]>([]);
  const titleRefs = useRef<(HTMLHeadingElement | null)[]>([]);
  const controls = useRef<Controls | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const wrap = wrapRef.current;
    const sticky = stickyRef.current;
    const pad = padRef.current;
    const sceneCanvas = sceneCanvasRef.current;
    const trailCanvas = trailCanvasRef.current;
    const rel = relRef.current;
    const head = headRef.current;
    const label = labelRef.current;
    const lead = leadRef.current;
    const sceneBox = sceneBoxRef.current;
    const faq = faqRef.current;
    const faqCaret = faqCaretRef.current;
    const cards = cardRefs.current;
    const bodies = bodyRefs.current;
    const titles = titleRefs.current;
    if (!wrap || !sticky || !pad || !sceneCanvas || !trailCanvas || !rel || !head || !label || !lead || !sceneBox || !faq || !faqCaret)
      return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const faqInner = (faq.firstElementChild as HTMLElement | null) ?? faq;
    let faqHeight = faqInner.offsetHeight;
    const labelClock = scrambleClock();
    let labelText = PRICING_LABEL;
    let refreshRaf = 0;
    let geo: Geo | null = null;

    const prog = { p: 0 };
    const scroll = { progress: 0, dir: 1 };
    const open = PLANS.map((_, i) => ({ v: Number(i === FIRST) })); // accordion open amount
    const peek = PLANS.map(() => ({ v: 0 })); // hover peek of collapsed bars
    let current = FIRST;
    let pending: number | null = null;
    let stacked = false;

    const origin = { x: 0, y: 0, radius: 0 };
    const bodyState: BodyState[] = PLANS.map(() => "open");
    const titleMode: ("open" | "bar")[] = PLANS.map(() => "open");
    const phase: ("in" | "out" | null)[] = PLANS.map(() => null);
    const revealLists = new Map<string, HTMLElement[]>();
    const revealCounts = new Map<string, number>();
    const voxel: { scene: VoxelScene | null; gone: boolean } = { scene: null, gone: false };

    // --- word reveal with a typing caret (used by head and card titles) -----------------
    const resetCounts = (i: number) => {
      for (const key of [`${i}:all`, `${i}:body`, `${i}:title`]) revealCounts.delete(key);
    };
    const reveal = (key: string, container: HTMLElement, list: () => HTMLElement[], frac: number) => {
      let items = revealLists.get(key);
      if (!items) {
        items = list();
        revealLists.set(key, items);
      }
      const prev = revealCounts.get(key) ?? -1;
      const n = Math.round(clamp01(frac) * items.length);
      if (n !== prev) {
        items.forEach((el, i) => {
          const show = i < n;
          if (show !== (el.style.visibility !== "hidden")) {
            el.style.visibility = show ? "" : "hidden";
            if (show && prev >= 0)
              el.animate([{ opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0)" }], {
                duration: 450,
                easing: "ease-out",
              });
          }
        });
        revealCounts.set(key, n);
      }
      const caret = container.querySelector<HTMLElement>("[data-plan-caret]");
      if (caret) {
        const lastWord = n > 0 && n < items.length ? items[n - 1] : null;
        caret.hidden = !lastWord;
        if (lastWord) {
          const r = lastWord.getBoundingClientRect();
          const c = container.getBoundingClientRect();
          const h = Math.min(40, 0.8 * r.height);
          caret.style.width = `${0.5 * h}px`;
          caret.style.height = `${h}px`;
          caret.style.transform = `translate3d(${r.right - c.left + 2}px, ${r.top - c.top + (r.height - h) / 2}px, 0)`;
        }
      }
      return n;
    };
    const streamPlan = (el: HTMLElement, mode: "in" | "out", delay = 0) => {
      const pw = Array.from(el.querySelectorAll<HTMLElement>("[data-pw]"));
      const pr = Array.from(el.querySelectorAll<HTMLElement>("[data-pr]"));
      if (mode === "out") streamOut(pw, pr);
      else {
        [...pw, ...pr].forEach((w) => (w.style.visibility = ""));
        streamIn(Array.from(el.querySelectorAll<HTMLElement>("[data-pw], [data-pr]")));
        if (delay) [...pw, ...pr].forEach((w) => (w.style.animationDelay = `${parseFloat(w.style.animationDelay) + delay}s`));
      }
      el.dataset.pstream = mode;
    };
    const setBodyState = (i: number, body: HTMLElement, next: BodyState, settled: boolean) => {
      const prev = bodyState[i];
      bodyState[i] = next;
      if (next === "open") streamPlan(body, "in", settled ? 0.25 : 0);
      else if (prev === "open") streamPlan(body, "out");
      if (next !== "empty") titleMode[i] = next;
    };

    // --- FAQ rows that fit, and the FAQ stream ------------------------------------------
    const fitFaqRows = (g: Geo, total: number) => {
      const rows = Array.from(faq.querySelectorAll<HTMLElement>(":scope ul > li"));
      if (!rows.length) return;
      rows.forEach((r) => (r.hidden = false));
      const rowH = rows.map((r) => r.querySelector<HTMLElement>("[data-faq-row]")?.offsetHeight ?? 0);
      const ansH = rows.map((r) => r.querySelector<HTMLElement>("[data-faq-fade]")?.offsetHeight ?? 0);
      const formH = faq.querySelector<HTMLElement>("form > div.flex")?.offsetHeight ?? 0;
      const room = Math.max(g.top + total, g.H - 40) - g.headMin;
      const need = (k: number) => rowH.slice(0, k).reduce((a, b) => a + b, 0) + Math.max(0, ...ansH.slice(0, k)) + formH;
      let k = Math.min(6, rows.length);
      while (k > 1 && need(k) > room) k--;
      rows.forEach((r, i) => (r.hidden = i >= k));
    };
    let faqOn: boolean | null = null;
    let stopCaret = () => {};
    const setFaqStream = (on: boolean) => {
      if (on === faqOn || (!on && faqOn === null)) return;
      faqOn = on;
      stopCaret();
      const items = Array.from(faq.querySelectorAll<HTMLElement>("li, form"))
        .filter((el) => !el.hidden)
        .flatMap((el) => [
          ...Array.from(el.querySelectorAll<HTMLElement>("[data-faq-word], [data-faq-chev], [data-faq-field], [data-faq-send]")),
          ...Array.from(el.querySelectorAll<HTMLElement>(":scope > [data-faq-line]")),
        ]);
      const isWord = (el: HTMLElement) => el.hasAttribute("data-faq-word");
      if (on) {
        streamIn(items);
        stopCaret = rideCaret(faq, faqCaret, items.filter(isWord));
      } else {
        streamOut(items.filter(isWord), items.filter((el) => !isWord(el)));
      }
      faq.dataset.stream = on ? "in" : "out";
      faq.inert = !on;
    };
    faq.dataset.stream = "off";
    faq.inert = true;

    // --- the 2D "pixel trail" squares at the pushed card's edge ---------------------------
    const trail = {
      on: false,
      x: 0,
      y: 0,
      top: 0,
      bottom: 0,
      hand: "Push" as "Push" | "Pinch",
      head: 0,
      color: "rgb(244,244,244)",
      dpr: 1,
    };
    const ctx = trailCanvas.getContext("2d");
    let trailRaf = 0;
    let trailOn = 0;
    let trailSpeed = 0;
    let trailX = 0;
    let trailLast = 0;
    let trailBudget = 0;
    let bits: { col: number; row: number; t: number; glyph: string }[] = [];
    const tri = (n: number) => Math.round((Math.random() + Math.random() - 1) * n);
    const drawTrail = (now: number) => {
      const dt = trailLast ? Math.min(64, now - trailLast) : 16.7;
      trailLast = now;
      trailOn += (Number(trail.on) - trailOn) * (1 - Math.exp(-dt / 160));
      const v = Math.abs(trail.x - trailX) / dt;
      trailX = trail.x;
      trailSpeed += (Math.min(1, v / 0.6) - trailSpeed) * (1 - Math.exp(-dt / 120));
      trailBudget += trail.on ? 0.12 * trailOn * (0.5 + 0.5 * trailSpeed) * dt : 0;
      const touch = trail.hand === "Pinch" ? voxel.scene?.touch() ?? null : null;
      const span = touch ? Math.max(1, Math.round((touch[0] - trail.x) / 10)) : 11;
      for (; trailBudget >= 1; trailBudget--) {
        const pinch = trail.hand === "Pinch";
        const col = pinch ? -1 + Math.floor(Math.random() * (span + 2)) : Math.random() < 0.6 ? -1 : 0;
        const row = tri(pinch ? 4 : 14);
        if (!bits.some((b) => b.col === col && b.row === row))
          bits.push({ col, row, t: now, glyph: Math.random() < 0.3 ? TRAIL_GLYPHS[Math.floor(Math.random() * TRAIL_GLYPHS.length)] : "" });
      }
      bits = bits.filter((b) => now - b.t < 340);
      if (!ctx) return;
      const { dpr } = trail;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, trailCanvas.width / dpr, trailCanvas.height / dpr);
      if (!bits.length && !trail.on) {
        trailRaf = 0;
        trailLast = 0;
        trailBudget = 0;
        return;
      }
      const [r, g, b] = (trail.color.match(/\d+(\.\d+)?/g) ?? ["244", "243", "239"]).map(Number);
      const light = 0.299 * r + 0.587 * g + 0.114 * b > 140;
      const tint = (k: number) =>
        light
          ? `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`
          : `rgb(${Math.round(r + (255 - r) * (1 - k))},${Math.round(g + (255 - g) * (1 - k))},${Math.round(b + (255 - b) * (1 - k))})`;
      const square = tint(0.8);
      const glyph = tint(0.4);
      const cx = Math.round(trail.x);
      const cy = 10 * Math.round((touch ? touch[1] + trail.head : trail.y) / 10) - 5;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 10px ui-monospace, monospace";
      for (const bit of bits) {
        const x = cx + 10 * bit.col;
        const y = cy + 10 * bit.row;
        if (y < trail.top || y + 10 > trail.bottom) continue;
        const alpha = 1 - (now - bit.t) / 340;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = square;
        ctx.fillRect(x, y, 9.2, 9.2);
        if (bit.glyph) {
          ctx.globalAlpha = 0.85 * alpha;
          ctx.fillStyle = glyph;
          ctx.fillText(bit.glyph, x + 4.6, y + 4.8);
        }
      }
      ctx.globalAlpha = 1;
      trailRaf = requestAnimationFrame(drawTrail);
    };
    const kickTrail = () => {
      if (!trailRaf) trailRaf = requestAnimationFrame(drawTrail);
    };

    // --- layout --------------------------------------------------------------------------
    const layout = (fromCta = false) => {
      const p = rel.clientWidth;
      const f = sticky.clientHeight;
      if (!p || !f) {
        geo = null;
        return;
      }
      const g = (p - 88) / 12;
      const colW = (p - 16) / 3;
      const Fx = Math.round(6 * (g + 8));
      const Fw = p - Fx;
      const bodyHeight = (w: number) =>
        52 +
        Math.max(
          0,
          ...bodies.map((body, i) => {
            const card = cards[i];
            if (!body || !card) return 0;
            card.style.width = `${w}px`;
            body.style.height = "auto";
            return body.offsetHeight;
          }),
        );
      const minCol = bodyHeight(colW);
      const minFull = bodyHeight(Fw);
      const headH = head.offsetHeight;
      const padTop = parseFloat(getComputedStyle(pad).paddingTop) || 0;
      const C = 64 + padTop;
      const room = (top: number) => f - 40 - (top + headH + 80);
      const e0 = room(C);
      const Hc = Math.max(minCol, Math.min(560, e0));
      const A = Math.max(minFull, Math.min(560, e0 - 144 - 16));
      const total = A + 144 + 16;
      const leadTop = Math.max(C, Math.round((f - (headH + 80 + Math.max(Hc, total))) / 2));
      head.style.top = `${leadTop}px`;
      const headBottom = leadTop + headH;
      const y0 = headBottom + 80;
      const H = room(leadTop);
      const mt = Math.max(0, Math.round(leadTop - padTop));
      const mb = Math.max(0, Math.round(f - (y0 + Math.max(Hc, total)) - padTop));
      if (!fromCta && (wrap.style.marginTop !== `-${mt}px` || wrap.style.marginBottom !== `-${mb}px`)) {
        wrap.style.marginTop = `-${mt}px`;
        wrap.style.marginBottom = `-${mb}px`;
        cancelAnimationFrame(refreshRaf);
        refreshRaf = requestAnimationFrame(() => ScrollTrigger.refresh());
      }
      const firstWord = lead.querySelector<HTMLElement>("[data-pw]");
      const lineH = parseFloat(getComputedStyle(lead).lineHeight);
      const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 72;
      geo = {
        W: p,
        H: f,
        y0,
        Hc,
        colW,
        Fx,
        Fw,
        top: total <= H ? y0 : Math.max(64, f - 40 - total),
        A,
        th: titles.map((t) => t?.offsetHeight ?? 36),
        Qw: Math.round(5 * g + 32),
        headBottom,
        headMin: navH + 16,
        lead: leadTop,
        firstLine: leadTop + lead.offsetTop + (firstWord?.offsetHeight || lineH || 0),
      };
      faq.style.width = `${geo.Qw}px`;
      fitFaqRows(geo, total);
      const sr = sticky.getBoundingClientRect();
      const rr = rel.getBoundingClientRect();
      origin.x = rr.left - sr.left;
      origin.y = rr.top - sr.top;
      const firstCard = cards[FIRST];
      if (firstCard) {
        origin.radius = parseFloat(getComputedStyle(firstCard).borderTopLeftRadius) || 0;
        trail.color = getComputedStyle(firstCard).backgroundColor;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      trailCanvas.width = Math.round(p * dpr);
      trailCanvas.height = Math.round(f * dpr);
      trailCanvas.style.width = `${p}px`;
      trailCanvas.style.height = `${f}px`;
      trailCanvas.style.left = `${origin.x}px`;
      trailCanvas.style.top = `${origin.y}px`;
      trail.dpr = dpr;
      sceneBox.style.top = `${headBottom}px`;
      sceneBox.style.width = `${Fx - 8}px`;
      sceneBox.style.height = `${Math.max(0, f - 40 - headBottom)}px`;
    };

    // --- render one frame of the choreography --------------------------------------------
    const render = () => {
      const g = geo;
      if (!g) return;
      const t = prog.p;
      const r = cosine(within(t, MOVE));
      const n = cosine(within(t, STACK));
      stacked = n >= 0.995;
      if (stacked && pending !== null) {
        const next = pending;
        pending = null;
        current = next;
        setActive(next);
      }
      if (!stacked && current !== FIRST) {
        current = FIRST;
        peek.forEach((pk) => gsap.to(pk, { v: 0, duration: 0.45, overwrite: true }));
        setActive(FIRST);
      }
      // Stack layout: open card at full height, others as 72px bars (+24px when peeked).
      const lift = PLANS.reduce((sum, _, i) => sum + 24 * peek[i].v * (1 - open[i].v), 0);
      let y = g.top - lift;
      const slots: { y: number; h: number }[] = [];
      PLANS.forEach((_, i) => {
        const o = open[i].v;
        const h = 72 + (g.A - 72) * o + 24 * peek[i].v * (1 - o);
        slots[i] = { y, h };
        y += h + 8;
      });
      const stackBottom = y - 8;
      let minTop = Infinity;
      const rects: ClipRect[] = [];
      PLANS.forEach((_, i) => {
        const card = cards[i];
        const body = bodies[i];
        const title = titles[i];
        if (!card || !body || !title) return;
        const o = open[i].v;
        const x = lerp(i * (g.colW + 8), g.Fx, r);
        const w = lerp(g.colW, g.Fw, r);
        const top = lerp(g.y0, slots[i].y, n);
        const h = lerp(g.Hc, slots[i].h, n);
        const inset = i > 0 ? 3 * r * (1 - n) : 0;
        card.style.transform = `translate3d(${x + inset}px, ${top + inset}px, 0)`;
        minTop = Math.min(minTop, top + inset);
        card.style.width = `${w - 2 * inset}px`;
        card.style.height = `${h - 2 * inset}px`;
        card.style.zIndex = String(3 - i);
        const th = g.th[i];
        const placeTitle = (bar = false) => {
          const ty =
            titleMode[i] !== "bar"
              ? 16
              : bar
                ? Math.max(0, h - 72) + (72 - th) / 2
                : (Math.min(h, 72 + 24 * peek[i].v) - th) / 2;
          title.style.transform = `translate3d(0, ${ty}px, 0)`;
        };
        if (n < 0.995 && i !== FIRST) {
          if (phase[i] === null) {
            delete title.dataset.pstream;
            delete body.dataset.pstream;
            resetCounts(i);
          }
          const e = within(n, RETYPE);
          if (e > 0) {
            if (phase[i] !== "in") resetCounts(i);
            phase[i] = "in";
            titleMode[i] = "bar";
            placeTitle(true);
            reveal(`${i}:body`, card, () => wordsOf(body), 0);
            reveal(`${i}:title`, card, () => wordsOf(title), e);
            bodyState[i] = "empty";
          } else {
            if (phase[i] !== "out") resetCounts(i);
            phase[i] = "out";
            titleMode[i] = "open";
            placeTitle();
            const shown = reveal(`${i}:all`, card, () => [...wordsOf(title), ...wordsOf(body)], 1 - within(r, ERASE));
            bodyState[i] = shown ? "open" : "empty";
          }
        } else {
          // A long frame (or a jump in scroll) can skip the end of the retype window:
          // make sure the bar's title is fully typed and no caret is left behind.
          if (phase[i] !== null) {
            resetCounts(i);
            reveal(`${i}:title`, card, () => wordsOf(title), 1);
          }
          phase[i] = null;
          const want: BodyState = n < 0.995 || o >= 0.5 ? "open" : "bar";
          if (want !== bodyState[i]) setBodyState(i, body, want, n >= 1);
          const closed = (Math.min(h, 72 + 24 * peek[i].v) - th) / 2;
          title.style.transform = `translate3d(0, ${lerp(closed, 16, o)}px, 0)`;
        }
        body.style.height = `${o * h + (1 - o) * g.Hc - 52}px`;
        body.inert = bodyState[i] !== "open";
        rects[i] = [origin.x + x + inset, origin.y + top + inset, w - 2 * inset, h - 2 * inset];
        card.style.cursor = stacked && o < 0.5 ? "pointer" : "";
      });

      // Label: "Pricings" scrambles into "FAQ".
      const lp = within(t, LABEL);
      let text: string | null = null;
      if (lp <= 0) text = PRICING_LABEL;
      else if (lp >= 1) text = "FAQ";
      else if (labelClock()) text = lp < 0.5 ? scrambleTo(PRICING_LABEL, 1 - 2 * lp) : scrambleTo("FAQ", 2 * lp - 1);
      if (text !== null && text !== labelText) {
        labelText = text;
        label.textContent = text;
      }

      // Lead words step aside if the card stack would run into them (short viewports).
      const over = g.headBottom + 16 - g.top;
      const overLine = g.headBottom + 16 - (g.firstLine + 8);
      const hide = over > 0 ? within(g.headBottom + 16 - minTop, [0, Math.max(1, Math.min(over, 64, overLine))]) : 0;
      if (reduced) lead.style.opacity = String(1 - hide * hide * (3 - 2 * hide));
      else reveal("head", head, () => wordsOf(lead), 1 - hide);

      // FAQ placement: bottom-aligned with the stack, growing upward; the head moves up when needed.
      const late = Math.max(t, scroll.progress);
      const faqTime = late >= FAQ_AT;
      const overflow = g.headBottom + 24 + faqHeight - stackBottom;
      const slack = Math.max(0, g.lead - g.headMin);
      const dropLabel = faqTime && overflow > slack;
      const nudge = faqTime && !dropLabel ? Math.max(0, overflow) : 0;
      head.style.translate = nudge ? `0 ${-nudge}px` : "";
      label.style.opacity = dropLabel ? "0" : "";
      const faqTop = dropLabel ? g.headMin : g.headBottom - nudge + 24;
      const avail = Math.max(stackBottom, g.H - 40) - faqTop;
      const clipped = faqHeight > avail;
      faq.style.maxHeight = clipped ? `${avail}px` : "";
      faq.style.overflowY = clipped ? "auto" : "";
      faq.toggleAttribute("data-lenis-prevent", clipped);
      const faqBottom = Math.max(stackBottom, faqTop + Math.min(faqHeight, avail));
      faq.style.bottom = `${g.H - faqBottom}px`;

      // Voxel figure: hand follows the first card's left edge, then becomes a "?".
      const appear = within(t, APPEAR);
      const handPhase = t < HAND_UNTIL;
      const hand = scroll.dir < 0 ? "Pinch" : "Push";
      const lead0 = rects[FIRST];
      const grip = lead0 ? lead0[1] + lead0[3] * (hand === "Push" ? 0.56 : 0.5) : 0;
      const scene = voxel.scene;
      if (scene) {
        scene.appear(appear);
        scene.clip(rects.filter(Boolean), origin.radius);
        if (handPhase && lead0) {
          scene.show(hand);
          scene.follow(lead0[0] - origin.x, grip - origin.y - g.headBottom);
        } else {
          scene.follow(null);
          scene.show("Question");
        }
        scene.dissolve(faqTime);
      }
      trail.on = !!scene && !!lead0 && handPhase && appear > 0.6;
      if (lead0) {
        trail.x = lead0[0] - origin.x;
        trail.y = grip - origin.y;
        trail.top = lead0[1] - origin.y;
        trail.bottom = lead0[1] + lead0[3] - origin.y;
      }
      trail.head = g.headBottom;
      trail.hand = hand;
      if (trail.on) kickTrail();
      setFaqStream(faqTime && (voxel.gone || !scene));
    };

    // --- scroll ----------------------------------------------------------------------------
    let snapTimer = 0;
    const snapToEnd = () => {
      const st = tween.scrollTrigger;
      if (!st) return;
      const instant = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (window.lenis) window.lenis.scrollTo(st.end, { duration: instant ? 0 : 0.6, force: true });
      else window.scrollTo({ top: st.end, behavior: instant ? "auto" : "smooth" });
    };
    const tween = gsap.to(prog, {
      p: 1,
      ease: "none",
      onUpdate: render,
      scrollTrigger: {
        trigger: wrap,
        start: "top top",
        end: "bottom bottom",
        scrub: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          scroll.progress = self.progress;
          if (self.direction) scroll.dir = self.direction;
          render();
          window.clearTimeout(snapTimer);
          if (scroll.dir > 0 && self.progress >= SNAP_AT && self.progress < 0.999)
            snapTimer = window.setTimeout(snapToEnd, 160);
        },
      },
    });

    // --- observers -------------------------------------------------------------------------
    const relayout = new ResizeObserver(() => {
      layout();
      render();
    });
    const faqResize = new ResizeObserver(() => {
      faqHeight = faqInner.offsetHeight;
      render();
    });
    faqResize.observe(faqInner);
    relayout.observe(sticky);
    relayout.observe(head);
    titles.forEach((t) => t && relayout.observe(t));
    const ctaSizes = new Map<Element, number>();
    const ctaResize = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height);
        if (ctaSizes.get(entry.target) !== h) changed = ctaSizes.has(entry.target) || changed;
        ctaSizes.set(entry.target, h);
      }
      if (changed) {
        layout(true);
        render();
      }
    });
    cards.forEach((card) => card?.querySelectorAll("[data-plan-cta]").forEach((el) => ctaResize.observe(el)));
    layout();
    render();

    // The WebGL figure is created lazily, once the stage is near the viewport.
    let disposed = false;
    let sceneRequested = false;
    let inView = false;
    const loadScene = () => {
      if (sceneRequested) return;
      sceneRequested = true;
      import("./voxelScene")
        .then(({ createVoxelScene }) => {
          if (disposed) return;
          const scene = createVoxelScene(sceneCanvas, sceneBox, {
            reduced,
            start: "Push",
            appear: 0,
            onDissolved: (gone) => {
              voxel.gone = gone;
              render();
            },
          });
          voxel.scene = scene;
          scene.run(inView);
          render();
        })
        .catch(() => undefined);
    };
    const nearObserver = new IntersectionObserver(([entry]) => entry.isIntersecting && loadScene(), {
      rootMargin: "800px 0px",
    });
    const viewObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      voxel.scene?.run(inView);
    });
    nearObserver.observe(wrap);
    viewObserver.observe(wrap);

    controls.current = {
      select: (i) => {
        if (!stacked) {
          if (prog.p < SNAP_AT) return;
          pending = i === FIRST ? null : i;
          snapToEnd();
          return;
        }
        if (i !== current) {
          gsap.to(peek[i], { v: 0, duration: 0.45, ease: easeOdama, overwrite: true, onUpdate: render });
          setActive(i);
        }
      },
      hover: (i, on) => {
        gsap.to(peek[i], {
          v: on && stacked && i !== current ? 1 : 0,
          duration: 0.45,
          ease: easeOdama,
          overwrite: true,
          onUpdate: render,
        });
      },
      activate: (index) => {
        current = index;
        open.forEach((o, i) => {
          gsap.to(o, { v: Number(i === index), duration: 0.8, ease: easeOdamaIO, overwrite: true, onUpdate: render });
          if (i === index) gsap.to(peek[i], { v: 0, duration: 0.45, overwrite: true });
        });
      },
    };

    return () => {
      disposed = true;
      controls.current = null;
      nearObserver.disconnect();
      viewObserver.disconnect();
      voxel.scene?.destroy();
      voxel.scene = null;
      cancelAnimationFrame(refreshRaf);
      cancelAnimationFrame(trailRaf);
      window.clearTimeout(snapTimer);
      relayout.disconnect();
      faqResize.disconnect();
      ctaResize.disconnect();
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.killTweensOf([...open, ...peek]);
      stopCaret();
      wrap.style.marginTop = "";
      wrap.style.marginBottom = "";
      delete faq.dataset.stream;
      faq.inert = false;
      label.textContent = PRICING_LABEL;
    };
  }, [enabled]);

  useEffect(() => {
    controls.current?.activate(active);
  }, [active]);

  return (
    <div className="hidden pricing-stage:block">
      <div ref={wrapRef} className="relative" style={{ height: "310vh" }}>
        <div
          ref={stickyRef}
          className={cn(styles.stage, "pointer-events-none sticky top-0 h-screen overflow-hidden *:*:*:pointer-events-auto")}
        >
          <div ref={padRef} aria-hidden="true" className="section-pt absolute" />
          <canvas ref={sceneCanvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] block size-full" />
          <canvas ref={trailCanvasRef} aria-hidden="true" className="pointer-events-none absolute z-[4] block" />
          <div className="page-x h-full">
            <div ref={relRef} className="relative h-full">
              <div
                ref={headRef}
                className="absolute inset-x-0 z-[6] grid gap-x-2 gap-y-3 transition-[translate] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:grid-cols-12"
                style={{ top: 64 }}
              >
                <p ref={labelRef} aria-label="Pricing and FAQ" className="u-label transition-opacity duration-300 md:col-span-6">
                  {PRICING_LABEL}
                </p>
                <h2
                  ref={leadRef}
                  className="text-h2 font-medium leading-none tracking-[-0.01em] text-pretty md:col-span-4 md:col-start-7 md:text-h3"
                >
                  <Words text={PRICING_LEAD} />
                </h2>
                <span aria-hidden="true" data-plan-caret="true" hidden className="faq-caret pointer-events-none absolute top-0 left-0 m-0" />
              </div>
              <div ref={sceneBoxRef} aria-hidden="true" className="absolute left-0" style={{ pointerEvents: "none" }} />
              <div ref={faqRef} data-stream="off" className="absolute left-0 z-[6] [scrollbar-width:none]">
                <FaqList />
                <span ref={faqCaretRef} aria-hidden="true" className={cn(styles.caret, "opacity-0")} />
              </div>
              {PLANS.map((plan, i) => (
                <article
                  key={plan.id}
                  ref={(el) => {
                    cardRefs.current[i] = el;
                  }}
                  onClick={(e) => {
                    if (!(e.target as Element).closest("a,button,input,form")) controls.current?.select(i);
                  }}
                  onPointerEnter={(e) => e.pointerType === "mouse" && controls.current?.hover(i, true)}
                  onPointerLeave={(e) => e.pointerType === "mouse" && controls.current?.hover(i, false)}
                  className={cn(
                    "absolute left-0 top-0 overflow-hidden rounded-card will-change-transform",
                    TONES[plan.tone].card,
                  )}
                >
                  <div className="absolute inset-x-0 bottom-0 overflow-hidden" style={{ top: 52 }}>
                    <div
                      ref={(el) => {
                        bodyRefs.current[i] = el;
                      }}
                      className="absolute inset-x-0 top-0"
                    >
                      <StagePlanBody plan={plan} />
                    </div>
                  </div>
                  <span
                    aria-hidden="true"
                    data-plan-caret="true"
                    hidden
                    className="faq-caret pointer-events-none absolute top-0 left-0 z-[2] m-0"
                    style={plan.tone === "flame" ? { background: "#fff" } : undefined}
                  />
                  <h3
                    ref={(el) => {
                      titleRefs.current[i] = el;
                    }}
                    className="absolute left-4 top-0"
                  >
                    <button
                      type="button"
                      onClick={() => controls.current?.select(i)}
                      aria-expanded={active === i}
                      className="text-left text-[2rem] font-medium leading-none tracking-[-0.02em] xl:text-[2.25rem]"
                    >
                      <Words text={plan.name} />
                    </button>
                  </h3>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
