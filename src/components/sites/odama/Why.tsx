"use client";
/* eslint-disable @next/next/no-img-element -- static pre-rendered ASCII art on small screens */

import { useEffect, useRef, useState } from "react";
import { gsap, ScrollTrigger } from "./SmoothScroll";
import { AsciiArt, type EdgeFade } from "./why/asciiArt";
import styles from "./why/why.module.css";

interface WhyCardData {
  n: string;
  title: string;
  body: string;
  art: string;
  asciiInk: string;
  asciiWhite: string;
  edgeFade?: EdgeFade;
}

const W = "/sites/odama/homepage/why";
const WHY_CARDS: WhyCardData[] = [
  {
    n: "1",
    title: "Your lead. Or ours.",
    body: "Bring a clear vision, and we follow it closely. Bring a rough idea, and we lead the thinking. Either way, the result is yours.",
    art: `${W}/new-example-1.webp`,
    asciiInk: `${W}/ascii/1-ink.png`,
    asciiWhite: `${W}/ascii/1-white.png`,
  },
  {
    n: "2",
    title: "All of it. One place.",
    body: "UI/UX, branding, motion, 3D, and builds websites. You write one brief. We bring the right people to every part of the job.",
    art: `${W}/new-example-2.webp`,
    asciiInk: `${W}/ascii/2-ink.png`,
    asciiWhite: `${W}/ascii/2-white.png`,
  },
  {
    n: "3",
    title: "One contact. Every update.",
    body: "A dedicated project manager keeps you and our designers in sync. One person to ask, and you always know where things stand.",
    art: `${W}/new-example-3.webp`,
    asciiInk: `${W}/ascii/3-ink.png`,
    asciiWhite: `${W}/ascii/3-white.png`,
    edgeFade: { bottom: 0.3, left: 0.12, right: 0.12 },
  },
  {
    n: "4",
    title: "You rest. We move.",
    body: "We’re based in Indonesia, hours ahead of the US and EU. Send your feedback tonight. Wake up to real progress the next morning.",
    art: `${W}/new-example-4.webp`,
    asciiInk: `${W}/ascii/4-ink.png`,
    asciiWhite: `${W}/ascii/4-white.png`,
  },
];

const FADE = "duration-[800ms] ease-out";
const TABLET_QUERY = "(min-width: 768px) and (max-width: 1279px), (min-width: 768px) and (pointer: coarse)";

function WhyCard({ n, title, body, art, asciiInk, asciiWhite, edgeFade }: WhyCardData) {
  const hitRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState<boolean | null>(null);
  const [tablet, setTablet] = useState(false);

  useEffect(() => {
    const md = window.matchMedia("(min-width: 768px)");
    const tab = window.matchMedia(TABLET_QUERY);
    const sync = () => {
      setTablet(tab.matches);
      setLive(md.matches && !tab.matches);
    };
    sync();
    md.addEventListener("change", sync);
    tab.addEventListener("change", sync);
    return () => {
      md.removeEventListener("change", sync);
      tab.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!live) return;
    const canvas = canvasRef.current;
    const hit = hitRef.current;
    const holder = canvas?.parentElement;
    const box = holder?.parentElement;
    if (!canvas || !hit || !holder || !box) return;
    let disposed = false;
    const ascii = new AsciiArt(canvas, {
      src: art,
      columns: 72,
      fit: "area",
      fill: 0.82,
      maxWidth: 1.1,
      maxHeight: 0.92,
      edgeFade,
      maxDpr: 4,
      threshold: 34,
      radius: 96,
      force: 24,
      color: "rgba(10,10,10,0.44)",
    });
    let cw = 0;
    let ch = 0;
    let lastBox = -1;
    const syncWindow = () => {
      const bh = box.clientHeight;
      if (Math.abs(bh - lastBox) < 1) return;
      lastBox = bh;
      const t = (ch - bh) / 2;
      ascii.setWindow(t > 0.5 ? { top: t, bottom: t + bh, fade: Math.min(40, 0.3 * bh) } : null);
    };
    const fit = (force = false) => {
      const r = holder.getBoundingClientRect();
      if (!force && Math.abs(r.width - cw) < 1 && Math.abs(r.height - ch) < 1) return;
      cw = r.width;
      ch = r.height;
      if (r.height < 1) return;
      ascii.resize(r.width, r.height);
      ascii.settle();
      lastBox = -1;
      syncWindow();
    };
    let raf = 0;
    let forceNext = false;
    const schedule = (force = false) => {
      forceNext = forceNext || force;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        fit(forceNext);
        forceNext = false;
      });
    };
    const holderRO = new ResizeObserver(() => schedule());
    const boxRO = new ResizeObserver(() => syncWindow());
    let dprQuery: MediaQueryList | null = null;
    const onDpr = () => {
      schedule(true);
      watchDpr();
    };
    const watchDpr = () => {
      dprQuery?.removeEventListener("change", onDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDpr);
    };
    const onViewport = () => schedule(true);
    const vv = window.visualViewport;
    ascii.load().then(() => {
      if (disposed) return;
      fit(true);
      holderRO.observe(holder);
      boxRO.observe(box);
      watchDpr();
      vv?.addEventListener("resize", onViewport);
    });
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = canvas.getBoundingClientRect();
      ascii.setPointer(e.clientX - r.left, e.clientY - r.top);
    };
    const onLeave = () => ascii.clearPointer();
    hit.addEventListener("pointermove", onMove);
    hit.addEventListener("pointerleave", onLeave);
    return () => {
      disposed = true;
      hit.removeEventListener("pointermove", onMove);
      hit.removeEventListener("pointerleave", onLeave);
      holderRO.disconnect();
      boxRO.disconnect();
      dprQuery?.removeEventListener("change", onDpr);
      vv?.removeEventListener("resize", onViewport);
      cancelAnimationFrame(raf);
      ascii.destroy();
    };
  }, [live, art, edgeFade]);

  const words = body.match(/\S+\s*/g) ?? [];
  const stills = tablet
    ? [{ src: asciiInk, white: false }]
    : [
        { src: asciiInk, white: false },
        { src: asciiWhite, white: true },
      ];

  return (
    <article
      className={`group relative flex h-auto w-[86vw] max-w-[400px] flex-none snap-center flex-col overflow-hidden rounded-card bg-surface transition-colors md:row-span-3 md:grid md:h-auto md:w-auto md:max-w-none md:grid-rows-subgrid ${FADE}`}
    >
      <div ref={hitRef} className="absolute inset-0" data-quench="true" />
      <header
        data-why-bar="true"
        className="pointer-events-none relative z-10 flex h-fit items-start justify-center gap-1 px-4 py-[var(--why-bar-py,1rem)]"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-sm text-ink">{n}</span>
        <span className="flex h-fit min-h-8 flex-1 items-center rounded-chip bg-white px-3 py-1.5 text-sm font-medium">
          {title}
        </span>
      </header>
      <div
        data-why-art="true"
        className={`pointer-events-none relative z-0 aspect-[1032/1272] min-h-0 w-full shrink-0 overflow-hidden md:aspect-auto md:w-auto md:flex-1 md:shrink ${styles.art}`}
      >
        {live === true && (
          <div className="absolute inset-x-0 top-1/2 h-[var(--why-art-h,100%)] -translate-y-1/2">
            <canvas ref={canvasRef} className="absolute inset-0" aria-hidden="true" />
          </div>
        )}
        {live === false &&
          stills.map(({ src, white }) => (
            <img
              key={src}
              src={src}
              alt=""
              aria-hidden="true"
              loading="lazy"
              className={`absolute inset-0 size-full scale-[1.08] object-cover transition-opacity ${FADE} ${white ? "opacity-0" : "opacity-100"}`}
            />
          ))}
      </div>
      <p
        className={`pointer-events-none relative z-10 h-auto p-4 text-justify text-sm leading-[1.42] text-ink transition-colors md:shrink md:self-start ${FADE}`}
      >
        {words.map((w, i) => (
          <span key={i} data-why-word="true">
            {w}
          </span>
        ))}
      </p>
    </article>
  );
}

export function Why() {
  const trackRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Desktop: as the section scrolls past the nav, the cards stay put and collapse — art first,
  // then the copy (words fading out) — until only the numbered title bars remain.
  useEffect(() => {
    const track = trackRef.current;
    const head = headRef.current;
    const gap = track?.parentElement;
    const section = track?.closest("section");
    if (!track || !head || !gap || !section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", () => {
      const cards = Array.from(track.children) as HTMLElement[];
      if (!cards.length) return;
      const copy = cards.map((c) => {
        const words = Array.from(c.querySelectorAll<HTMLElement>("[data-why-word]"));
        return { words, shown: words.length };
      });
      const showWords = (entry: { words: HTMLElement[]; shown: number }, count: number) => {
        if (count === entry.shown) return;
        entry.shown = count;
        entry.words.forEach((w, i) => {
          const on = i < count;
          if (!w.classList.contains("why-word-out") === on) return;
          w.classList.remove("faq-word", "why-word-out");
          void w.offsetWidth;
          w.classList.add(on ? "faq-word" : "why-word-out");
        });
      };
      let full = 0;
      let artH = 0;
      let travel = 0;
      const apply = (p: number) => {
        const y = p * travel;
        const shrink = Math.min(y, artH);
        const textP = travel > artH ? Math.max(0, y - artH) / (travel - artH) : 0;
        track.style.setProperty("--why-bar-py", `${(16 + 8 * textP).toFixed(2)}px`);
        track.style.height = `${full - shrink}px`;
        const clip = `inset(0px 0px calc(100% - ${(full - y).toFixed(1)}px) 0px round 8px)`;
        for (const c of cards) c.style.clipPath = clip;
        const a = 0.85 * artH;
        const b = artH + (travel - artH) * 0.6;
        const f = b > a ? Math.min(1, Math.max(0, (y - a) / (b - a))) : 0;
        for (const entry of copy) showWords(entry, Math.round((1 - f) * entry.words.length));
        const t = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        head.style.transform = t;
        track.style.transform = t;
      };
      const minOf = (sel: string) =>
        Math.min(...cards.map((c) => c.querySelector<HTMLElement>(sel)?.offsetHeight ?? 0));
      const measure = () => {
        apply(0);
        track.style.height = "";
        const h = Math.round(Math.min(740, Math.max(300, window.innerHeight - 64 - track.offsetTop - 16)));
        track.style.setProperty("--why-h", `${h}px`);
        full = track.offsetHeight;
        gap.style.height = `${full}px`;
        artH = minOf("[data-why-art]");
        track.style.setProperty("--why-art-h", `${artH}px`);
        const bar = (minOf("[data-why-bar]") || 64) + 16;
        travel = Math.max(0, full - bar);
      };
      measure();
      ScrollTrigger.addEventListener("refreshInit", measure);
      const st = ScrollTrigger.create({
        trigger: section,
        start: "top 64px",
        end: () => `+=${travel}`,
        onUpdate: (self) => apply(self.progress),
        onRefresh: (self) => apply(self.progress),
      });
      return () => {
        ScrollTrigger.removeEventListener("refreshInit", measure);
        st.kill();
        for (const c of cards) c.style.clipPath = "";
        for (const entry of copy) showWords(entry, entry.words.length);
        for (const el of [head, track, gap]) {
          el.style.removeProperty("transform");
          el.style.removeProperty("height");
        }
        track.style.removeProperty("--why-h");
        track.style.removeProperty("--why-art-h");
        track.style.removeProperty("--why-bar-py");
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <section id="why" aria-labelledby="why-title" className="relative bg-bg section-y">
      <div ref={headRef}>
        <div className="page-x">
          <div className="grid gap-x-2 gap-y-3 md:grid-cols-12">
            <p id="why-title" className="u-label md:col-span-6">
              Our Value
            </p>
            <h2 className="text-h2 font-medium leading-none tracking-[-0.01em] text-pretty md:col-span-4 md:col-start-7 md:text-h3">
              We approach design as a process of understanding. Each service is a step toward clarity.
            </h2>
          </div>
        </div>
      </div>
      <div className="mt-10 md:mt-20">
        <div
          ref={trackRef}
          data-why-track="true"
          {...(mobile ? { tabIndex: 0, role: "group", "aria-label": "Why Odama" } : {})}
          className={`flex snap-x snap-mandatory gap-2 overflow-x-auto px-[var(--gutter)] md:grid md:h-[1489px] md:grid-cols-2 md:grid-rows-[auto_1fr_auto_auto_1fr_auto] md:overflow-visible lg:h-[var(--why-h,740px)] lg:grid-cols-4 lg:grid-rows-[auto_1fr_auto] ${styles.track}`}
        >
          {WHY_CARDS.map((c) => (
            <WhyCard key={c.n} {...c} />
          ))}
        </div>
      </div>
    </section>
  );
}
