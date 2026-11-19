"use client";
/* eslint-disable @next/next/no-img-element -- full-bleed project previews animated with GSAP */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "./SmoothScroll";
import { canHover } from "./about/motion";
import styles from "./works/works.module.css";

interface Project {
  slug: string;
  name: string;
  href: string;
  preview: string;
}

const SITE = "https://www.odama.io";
const OUR_WORK = "/sites/odama/work-page/our-work";

const WAVE: Project[] = [
  { slug: "karwa", name: "Karwa", href: `${SITE}/work/karwa`, preview: `${OUR_WORK}/Karwa.webp` },
  { slug: "mimikry", name: "Mimikry", href: `${SITE}/work/mimikry`, preview: `${OUR_WORK}/Mimikry.webp` },
  { slug: "brandboom", name: "Brandboom", href: `${SITE}/work/brandboom`, preview: `${OUR_WORK}/Brandboom.webp` },
  { slug: "socialystic", name: "Socialystic", href: `${SITE}/work/socialystic`, preview: `${OUR_WORK}/Socialistycs.webp` },
  { slug: "yooro", name: "Yooro", href: `${SITE}/work/yooro`, preview: `${OUR_WORK}/Yooro.webp` },
];
const ALL_WORKS: Project = {
  slug: "all-works",
  name: "All Works",
  href: `${SITE}/work`,
  preview: "/sites/odama/homepage/works/board/all-works-full.webp",
};
const LIST: Project[] = [...WAVE, ALL_WORKS];

const ROW = 42;
/** Horizontal nudge (x30px) by distance from the hovered row. */
const WAVE_PROFILE = [1, 0.62, 0.26, 0];
const WAVE_MAX = WAVE_PROFILE.length - 1;
const MUTED = "#8f8f8f";
const CHIP_STYLE: CSSProperties = {
  transitionProperty: "background-color, border-color, border-radius, color, opacity, transform",
  backgroundColor: "rgba(0,0,0,0.55)",
};

const wave = (d: number) => {
  const a = Math.abs(d);
  if (a >= WAVE_MAX) return 0;
  const i = Math.floor(a);
  return WAVE_PROFILE[i] + (WAVE_PROFILE[i + 1] - WAVE_PROFILE[i]) * (a - i);
};

function ArrowGlyph() {
  return (
    <span className="pixel-icon">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M6 12H18M14 8L18 12L14 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
    </span>
  );
}

function FeaturedBoard() {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<HTMLDivElement[]>([]);
  const chipsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLAnchorElement>(null);
  const orbRef = useRef<HTMLAnchorElement>(null);
  const layerRefs = useRef<HTMLDivElement[]>([]);
  const coverRef = useRef<HTMLAnchorElement>(null);
  const [active, setActive] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const list = listRef.current;
    const root = rootRef.current;
    if (!list || !root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const hoverable = canHover();
    const lastIdx = LIST.length - 1;
    let pos = 0;
    let shown = -1;
    let wasHot = false;
    let amp = 0;
    let hot = false;
    let px = -1;
    let py = -1;
    let seen = false;
    const more = moreRef.current;
    const orb = orbRef.current;
    if (more) gsap.set(more, { scale: 0, transformOrigin: "right center" });
    if (orb) gsap.set(orb, { scale: 0, transformOrigin: "left center" });
    let listTop = 0;

    const render = () => {
      const idx = Math.min(lastIdx, Math.max(0, Math.round(pos)));
      rowRefs.current.forEach((row, t) => {
        if (!row) return;
        row.style.transform = `translate3d(${30 * amp * wave(t - pos)}px, ${ROW * t}px, 0)`;
        const link = row.firstElementChild as HTMLElement | null;
        if (link) {
          link.style.color = !hot || t === idx ? "var(--color-ink)" : MUTED;
          link.style.fontWeight = hot && t === idx ? "500" : "400";
        }
      });
      if (idx !== shown) {
        shown = idx;
        setActive(idx);
      }
      const chips = chipsRef.current;
      if (chips) {
        const y = listTop + (Math.min(lastIdx, Math.max(0, pos)) + 0.5) * ROW - chips.offsetHeight / 2;
        chips.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
      }
      if (hot !== wasHot) {
        wasHot = hot;
        root.toggleAttribute("data-quench", hot);
        if (coverRef.current) coverRef.current.style.pointerEvents = hot ? "auto" : "none";
        for (const chip of [more, orb]) {
          if (!chip) continue;
          chip.style.pointerEvents = hot ? "auto" : "none";
          gsap.to(chip, {
            scale: hot ? 1 : 0,
            duration: reduced ? 0 : hot ? 0.45 : 0.25,
            ease: hot ? "back.out(1.6)" : "power2.in",
            overwrite: "auto",
          });
        }
      }
    };

    const tick = (_time: number, deltaMs: number) => {
      const rr = root.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      listTop = lr.top - rr.top;
      hot = hoverable && seen && px >= rr.left && px <= rr.right && py >= rr.top && py <= rr.bottom;
      const target = hot ? Math.min(lastIdx, Math.max(0, (py - lr.top) / ROW - 0.5)) : pos;
      const k = reduced ? 1 : 1 - Math.exp(-deltaMs / 110);
      pos += (target - pos) * k;
      amp += ((hot ? 1 : 0) - amp) * k;
      render();
    };
    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      seen = true;
    };
    if (hoverable) window.addEventListener("pointermove", onMove, { passive: true });
    let ticking = false;
    const io = new IntersectionObserver(
      ([en]) => {
        if (en.isIntersecting === ticking) return;
        ticking = en.isIntersecting;
        if (ticking) gsap.ticker.add(tick);
        else gsap.ticker.remove(tick);
      },
      { rootMargin: "200px" },
    );
    io.observe(root);
    render();
    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("pointermove", onMove);
      io.disconnect();
      gsap.killTweensOf([more, orb].filter(Boolean));
    };
  }, []);

  // Swap the preview: wipe the new layer in from the direction of travel.
  useEffect(() => {
    const layers = layerRefs.current;
    const next = layers[active];
    const prev = prevRef.current;
    if (!next || prev === active) return;
    prevRef.current = active;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const down = active > prev;
    layers.forEach((layer, t) => {
      if (!layer) return;
      layer.style.zIndex = t === active ? "2" : t === prev ? "1" : "0";
      if (t === active) return;
      gsap.killTweensOf(layer);
      gsap.set(layer, { clipPath: "inset(0% 0% 0% 0%)" });
      const inner = layer.firstElementChild;
      if (inner) {
        gsap.killTweensOf(inner);
        gsap.set(inner, { scale: 1, yPercent: 0 });
      }
    });
    gsap.fromTo(
      next,
      { clipPath: down ? "inset(100% 0% 0% 0%)" : "inset(0% 0% 100% 0%)" },
      { clipPath: "inset(0% 0% 0% 0%)", duration: reduced ? 0 : 0.6, ease: "expo.out", overwrite: "auto" },
    );
    const inner = next.firstElementChild;
    if (inner && !reduced) {
      gsap.fromTo(
        inner,
        { scale: 1.25, yPercent: down ? 12 : -12 },
        { scale: 1, yPercent: 0, duration: 0.8, ease: "expo.out", overwrite: "auto" },
      );
    }
  }, [active]);

  useEffect(() => {
    const layers = layerRefs.current;
    return () => {
      layers.forEach((l) => {
        gsap.killTweensOf(l);
        if (l.firstElementChild) gsap.killTweensOf(l.firstElementChild);
      });
    };
  }, []);

  const href = LIST[active].href;
  return (
    <div ref={rootRef} className="relative mt-10 hidden page-x md:block">
      <div className="grid grid-cols-12 items-stretch gap-2">
        <div className="relative col-span-5 h-[516px] overflow-hidden rounded-[16px] bg-surface p-6">
          <p className="u-label">Featured Works</p>
          <div
            ref={listRef}
            data-quench="true"
            className="relative mt-5 overflow-hidden"
            style={{ height: ROW * LIST.length }}
          >
            {LIST.map((p, i) => (
              <div
                key={p.slug}
                ref={(el) => {
                  if (el) rowRefs.current[i] = el;
                }}
                className="absolute left-0 top-0 flex h-[42px] w-full items-center will-change-transform"
                style={{ transform: `translate3d(0, ${ROW * i}px, 0)` }}
              >
                <a
                  href={p.href}
                  className="text-[40px] leading-none tracking-[-0.02em] text-ink transition-colors duration-200"
                >
                  {p.name}
                </a>
              </div>
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="col-span-2" />
        <div className="relative col-span-5">
          <div className="absolute inset-0 overflow-hidden rounded-[16px] bg-surface">
            {LIST.map((p, i) => (
              <div
                key={p.slug}
                ref={(el) => {
                  if (el) layerRefs.current[i] = el;
                }}
                className="absolute inset-0 overflow-hidden"
                style={{ zIndex: i === 0 ? 2 : 0 }}
              >
                <div className="absolute inset-0">
                  <img
                    src={p.preview}
                    alt=""
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding="async"
                    className="absolute inset-0 size-full object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <a
        ref={coverRef}
        href={href}
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute inset-0 z-[5]"
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 page-x">
        <div ref={chipsRef} className="grid w-full grid-cols-12 items-center gap-2 will-change-transform">
          <div className="col-span-5 flex justify-end pr-4">
            <a
              ref={moreRef}
              href={href}
              aria-hidden="true"
              tabIndex={-1}
              style={CHIP_STYLE}
              className={`${styles.btnBase} pointer-events-none relative isolate inline-flex overflow-hidden px-4 text-white`}
            >
              View More
            </a>
          </div>
          <div className="col-span-5 col-start-8 flex pl-4">
            <a
              ref={orbRef}
              href={href}
              aria-hidden="true"
              tabIndex={-1}
              style={CHIP_STYLE}
              className="glass-blur pointer-events-none relative isolate grid size-10 shrink-0 place-items-center overflow-hidden rounded-[20px] text-white"
            >
              <ArrowGlyph />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileCard({ project, square = false }: { project: Project; square?: boolean }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const link = linkRef.current;
    const media = mediaRef.current;
    if (!link || !media || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const tween = gsap.fromTo(
      media,
      { yPercent: -12 },
      {
        yPercent: 12,
        ease: "none",
        scrollTrigger: { trigger: link, start: "top bottom", end: "bottom top", scrub: true },
      },
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  return (
    <div className="relative">
      <a
        ref={linkRef}
        href={`${SITE}/work`}
        aria-label={`${project.name} View More`}
        className={`group/act relative block w-full overflow-hidden rounded-card bg-surface ${square ? "aspect-square" : "h-[366px]"}`}
      >
        <div ref={mediaRef} className="absolute inset-x-0 will-change-transform" style={{ top: "-16%", bottom: "-16%" }}>
          <img src={project.preview} alt="" loading="lazy" decoding="async" className="absolute inset-0 size-full object-cover" />
        </div>
        <span className="glass-chip glass-blur absolute left-1/2 top-2 inline-flex h-10 -translate-x-1/2 items-center px-4 text-sm font-medium">
          {project.name}
        </span>{" "}
        <span className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <span aria-hidden="true" className="inline-flex">
            <span className="group/act inline-flex items-center gap-1">
              <span
                style={CHIP_STYLE}
                className={`${styles.btnBase} relative isolate overflow-hidden text-white backdrop-blur-[24px] backdrop-saturate-[1.1] transition-colors duration-300`}
              >
                <span className="relative z-10">View More</span>
              </span>
              <span
                style={CHIP_STYLE}
                className="relative isolate inline-flex size-10 flex-none items-center justify-center overflow-hidden rounded-[20px] border-0 text-white backdrop-blur-[24px] backdrop-saturate-[1.1]"
              >
                <span aria-hidden="true" className="relative z-10 block leading-[0]">
                  <ArrowGlyph />
                </span>
              </span>
            </span>
          </span>
        </span>
      </a>
    </div>
  );
}

export function Works() {
  return (
    <section id="works" className="relative bg-bg section-y">
      <div className="page-x">
        <div className="grid gap-3 md:hidden">
          <p className="u-label">Featured Works</p>
          <h2 className="section-title">Products We’ve Designed for Real People and Real Business</h2>
        </div>
      </div>
      <FeaturedBoard />
      <div className="mt-14 flex flex-col gap-2 page-x md:hidden">
        {WAVE.slice(0, 4).map((p) => (
          <MobileCard key={p.slug} project={p} />
        ))}
        <MobileCard project={ALL_WORKS} square />
      </div>
    </section>
  );
}
