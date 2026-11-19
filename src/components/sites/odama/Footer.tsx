"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { gsap, ScrollTrigger } from "./SmoothScroll";
import { CopyEmail } from "./footer/CopyEmail";
import { FooterFire } from "./footer/FooterFire";
import { ArrowSwap, EmberFire, emberSkin, emberTone, useEmber } from "./footer/ember";
import { canHover, prefersReducedMotion, useCanHover } from "./footer/hooks";

const SOCIALS = [
  { label: "Instagram", href: "https://www.instagram.com/odamastudio" },
  { label: "Dribbble", href: "https://dribbble.com/odamastudio" },
  { label: "Behance", href: "https://www.behance.net/odamastudio" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/odamastudio/" },
  { label: "X", href: "https://x.com/odamastudio" },
];
const LEGAL = [{ label: "Privacy Policy", href: "https://www.odama.io/privacy-policy" }];
const EMAIL = "hellodama@odama.io";
const WORKS = { label: "Our Works", href: "https://www.odama.io/work" };
const PLATES = ["Brandboom", "Karwa", "Showtime", "Socialistycs", "Secondz"].map((n) => `/sites/odama/work-page/our-work/${n}.webp`);
const PLATE_SIZES = "(min-width: 1024px) 346px, (min-width: 768px) 100vw, 50vw";

const CLIP_HIDDEN = "inset(0 100% 0 0)";
const CLIP_FROM = { left: "inset(0 100% 0 0)", right: "inset(0 0 0 100%)" } as const;
const SHIFT_FROM = { left: "translateX(-5%)", right: "translateX(5%)" } as const;

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const CHIP =
  "relative isolate overflow-hidden h-10 shrink-0 whitespace-nowrap rounded-[8px] bg-black/45 px-4 text-sm font-medium text-white backdrop-blur-md transition-colors duration-300 flex items-center justify-center";
const ORB =
  "relative isolate grid size-10 shrink-0 place-items-center overflow-hidden rounded-[20px] bg-black/45 text-white backdrop-blur-md duration-300";

export function Footer() {
  const hover = useCanHover();
  const ember = useEmber();
  const heat = hover ? ember.heat : 0;
  const bind = hover ? ember.bind : undefined;
  const footerRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const laneRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLAnchorElement>(null);
  const platesRef = useRef<Array<HTMLSpanElement | null>>([]);
  const [platesOn, setPlatesOn] = useState(false);

  // The card rides down from just under the links to its resting place as the page bottoms out.
  useIsoLayoutEffect(() => {
    const card = cardRef.current;
    const grid = gridRef.current;
    if (!card || !grid || prefersReducedMotion() || ScrollTrigger.maxScroll(window) <= 0) return;
    const tl = gsap.timeline({
      scrollTrigger: { trigger: grid, start: "bottom+=50 bottom", end: "max", scrub: 0.4, invalidateOnRefresh: true },
    });
    tl.fromTo(
      card,
      {
        y: () => {
          gsap.set(card, { y: 0 });
          return -Math.max(0, card.getBoundingClientRect().top - grid.getBoundingClientRect().bottom - 50 - 24);
        },
      },
      { y: 0, ease: "none" },
      0,
    );
    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
      gsap.set(card, { y: 0 });
    };
  }, []);

  // ...and drifts sideways toward the pointer.
  useEffect(() => {
    const footer = footerRef.current;
    const lane = laneRef.current;
    const card = cardRef.current;
    if (!footer || !lane || !card || !canHover() || prefersReducedMotion()) return;
    const toX = gsap.quickTo(card, "x", { duration: 0.9, ease: "power3.out" });
    let px = 0;
    let inside = false;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const r = lane.getBoundingClientRect();
      const room = Math.max(0, (r.width - card.offsetWidth) / 2);
      if (!room || !inside) {
        toX(0);
        return;
      }
      toX(Math.max(-room, Math.min(room, px - (r.left + r.width / 2))));
    };
    const move = (e: PointerEvent) => {
      px = e.clientX;
      inside = true;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    footer.addEventListener("pointermove", move, { passive: true });
    return () => {
      footer.removeEventListener("pointermove", move);
      if (raf) cancelAnimationFrame(raf);
      gsap.set(card, { x: 0 });
    };
  }, []);

  // Moving the pointer across the footer wipes a different project plate into the card.
  useEffect(() => {
    const footer = footerRef.current;
    const card = cardRef.current;
    if (!footer || !card || !canHover() || prefersReducedMotion() || !window.matchMedia("(min-width: 1024px)").matches) return;
    let armed = false;
    let last: { x: number; y: number } | null = null;
    let travel = 0;
    let drift = 0;
    let current = 0;
    let lastAt = 0;
    const show = (
      el: HTMLSpanElement,
      to: { clip: string; shift: string },
      z: string,
      from?: { clip: string; shift: string; ms: number },
    ) => {
      const inner = el.firstElementChild as HTMLElement | null;
      el.getAnimations().forEach((a) => a.cancel());
      inner?.getAnimations().forEach((a) => a.cancel());
      el.style.zIndex = z;
      el.style.clipPath = to.clip;
      if (inner) inner.style.transform = to.shift;
      if (!from) return;
      const timing = { duration: from.ms, easing: "cubic-bezier(0.33, 1, 0.68, 1)" };
      el.animate([{ clipPath: from.clip }, { clipPath: to.clip }], timing);
      inner?.animate([{ transform: from.shift }, { transform: to.shift }], timing);
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const prev = last;
      last = { x: e.clientX, y: e.clientY };
      if (!armed || !prev) return;
      const dx = last.x - prev.x;
      travel += Math.hypot(dx, last.y - prev.y);
      drift += dx;
      if (travel < 110) return;
      const plates = platesRef.current;
      const n = plates.length;
      const side = drift >= 0 ? "left" : "right";
      travel = 0;
      drift = 0;
      if (n < 2) return;
      const pickRaw = Math.floor(Math.random() * (n - 1));
      const pick = pickRaw >= current ? pickRaw + 1 : pickRaw;
      const ms = lastAt ? Math.min(260, Math.max(90, (e.timeStamp - lastAt) * 0.85)) : 260;
      lastAt = e.timeStamp;
      const shown = { clip: "inset(0 0 0 0)", shift: "none" };
      plates.forEach((el, k) => {
        if (!el) return;
        if (k === pick) show(el, shown, "2", { clip: CLIP_FROM[side], shift: SHIFT_FROM[side], ms });
        else if (k === current) show(el, shown, "1");
        else show(el, { clip: CLIP_HIDDEN, shift: "none" }, "0");
      });
      current = pick;
    };
    const near = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          near.disconnect();
          setPlatesOn(true);
        }
      },
      { rootMargin: "600px 0px" },
    );
    near.observe(card);
    const view = new IntersectionObserver(
      ([e]) => {
        armed = e.intersectionRatio >= 0.4 || (e.isIntersecting && armed);
        if (!armed) lastAt = 0;
      },
      { threshold: [0, 0.4] },
    );
    view.observe(card);
    const leave = () => {
      last = null;
      travel = 0;
      drift = 0;
      lastAt = 0;
    };
    footer.addEventListener("pointermove", move, { passive: true });
    footer.addEventListener("pointerleave", leave);
    return () => {
      footer.removeEventListener("pointermove", move);
      footer.removeEventListener("pointerleave", leave);
      near.disconnect();
      view.disconnect();
    };
  }, []);

  return (
    <footer ref={footerRef} data-quench="true" className="relative isolate overflow-hidden bg-bg pb-4 section-pt">
      <div className="relative page-x">
        <div ref={gridRef} className="grid gap-9 md:grid-cols-12 md:gap-x-2 md:gap-y-4">
          <div className="md:col-start-7 md:col-span-3 flex flex-col gap-10">
            <div>
              <p className="u-label">Socials</p>
              <ul className="mt-1 space-y-0.5">
                {SOCIALS.map((s) => (
                  <li key={s.label}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer" className="text-h3 transition-colors hover:text-flame">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <CopyEmail email={EMAIL} />
            </div>
          </div>
          <div className="md:col-start-11 md:col-span-2">
            <p className="u-label whitespace-nowrap">© 2026 Odama</p>
            <ul className="mt-1 space-y-0.5">
              {LEGAL.map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="whitespace-nowrap text-h3 transition-colors hover:text-flame"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div ref={laneRef} className="relative z-20 mt-[clamp(13rem,34vh,23rem)] flex justify-center max-md:mt-[152px]">
          <a
            ref={cardRef}
            href={WORKS.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Go to ${WORKS.label}`}
            {...bind}
            className="group relative block h-[216px] w-[min(86vw,346px)] overflow-hidden rounded-[8px] bg-surface text-left max-md:aspect-[346/216] max-md:h-auto max-md:w-[50vw]"
          >
            <span className="absolute inset-0 transition-transform duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] md:group-hover:scale-[1.05]">
              <Image src={PLATES[0]} alt="" fill sizes={PLATE_SIZES} className="object-cover" />
              {hover &&
                platesOn &&
                PLATES.map((src, k) => (
                  <span
                    key={src}
                    aria-hidden="true"
                    ref={(el) => {
                      platesRef.current[k] = el;
                    }}
                    className="pointer-events-none absolute inset-0"
                    style={{ clipPath: CLIP_HIDDEN }}
                  >
                    <span className="absolute inset-0">
                      <Image src={src} alt="" fill sizes={PLATE_SIZES} loading="eager" className="object-cover" />
                    </span>
                  </span>
                ))}
            </span>
            <span className="absolute left-1/2 top-1/2 z-10 flex w-max -translate-x-1/2 -translate-y-1/2 items-center gap-1">
              <span style={emberSkin(heat)} className={CHIP}>
                <EmberFire active={heat > 0} heat={heat} tone={emberTone()} cell={3} />
                <span className="relative z-10">{WORKS.label}</span>
              </span>
              <span style={emberSkin(heat)} className={ORB}>
                <EmberFire active={heat > 0} heat={heat} tone={emberTone()} cell={3} />
                <ArrowSwap />
              </span>
            </span>
          </a>
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-[15] page-x max-md:px-0">
        <div
          className="w-full translate-y-[17%] max-md:translate-y-0"
          style={{
            aspectRatio: "1408 / 334",
            backgroundColor: "#FFFFFF",
            maskImage: "url(/sites/odama/footer/wordmark.svg)",
            WebkitMaskImage: "url(/sites/odama/footer/wordmark.svg)",
            maskSize: "100% 100%",
            WebkitMaskSize: "100% 100%",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
          }}
        />
      </div>
      <FooterFire className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[64%] min-h-[420px] max-md:h-[271px] max-md:min-h-0 [mask-image:linear-gradient(180deg,transparent_0%,#000_22%)] [-webkit-mask-image:linear-gradient(180deg,transparent_0%,#000_22%)]" />
    </footer>
  );
}
