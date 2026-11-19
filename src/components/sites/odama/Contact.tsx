"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";
import { gsap, ScrollTrigger } from "./SmoothScroll";
import { prefersReducedMotion } from "./footer/hooks";
import { ACCENT_VARIANT, EmberFire, emberSkin, emberTone, useEmber, WHITE_VARIANT, type EmberVariant } from "./footer/ember";

const BOOK_A_CALL = "https://calendly.com/odamastudio/inquiry";
/** The source opens its in-page inquiry flow here; the clone links to the live page for it. */
const SEND_INQUIRY = "https://www.odama.io/inquiry";
const PLATES = ["Brandboom", "Karwa", "Showtime", "Socialistycs", "Secondz"].map((n) => `/sites/odama/work-page/our-work/${n}.webp`);

const BTN =
  "relative isolate inline-flex h-10 items-center justify-center gap-2 overflow-hidden whitespace-nowrap rounded-chip px-6 text-sm font-medium transition-colors duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]";

function SolidLink({ href, variant, className, children }: { href: string; variant: EmberVariant; className: string; children: ReactNode }) {
  const { heat, active, bind } = useEmber();
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${BTN} ${className}`} style={emberSkin(heat, true, variant)} {...bind}>
      <EmberFire active={active} heat={heat} tone={emberTone(variant)} />
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </a>
  );
}

export function Contact() {
  const tileRef = useRef<HTMLSpanElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  // "Let's talk." grows up from the baseline and the olive card unfolds as the section scrolls in.
  useEffect(() => {
    const title = titleRef.current;
    const card = cardRef.current;
    const body = bodyRef.current;
    const actions = actionsRef.current;
    const column = card?.parentElement;
    if (!title || !card || !body || !actions || !column || prefersReducedMotion()) return;
    const mm = gsap.matchMedia();
    const unfold = (tl: gsap.core.Timeline) =>
      tl
        .fromTo(card, { height: () => 0.31 * body.offsetHeight }, { height: () => body.offsetHeight, duration: 1 }, 0)
        .fromTo(actions, { y: () => -(0.69 * body.offsetHeight) }, { y: 0, duration: 1 }, 0);
    const setup = (desktop: boolean) => {
      const tl = gsap.timeline({ defaults: { ease: "none" } });
      tl.fromTo(title, { scaleY: 0.31 }, { scaleY: 1, duration: 1 }, 0);
      if (desktop) unfold(tl);
      ScrollTrigger.create({ trigger: title, start: "top bottom", end: "bottom 85%", scrub: 0.6, animation: tl, invalidateOnRefresh: true });
      if (desktop) return;
      const reserve = () => {
        column.style.minHeight = `${body.offsetHeight}px`;
      };
      reserve();
      ScrollTrigger.addEventListener("refreshInit", reserve);
      const tl2 = gsap.timeline({ defaults: { ease: "none" } });
      unfold(tl2);
      ScrollTrigger.create({ trigger: column, start: "top bottom", end: "bottom 85%", scrub: 0.6, animation: tl2, invalidateOnRefresh: true });
      return () => {
        ScrollTrigger.removeEventListener("refreshInit", reserve);
        column.style.minHeight = "";
      };
    };
    mm.add("(min-width: 768px)", () => setup(true));
    mm.add("(max-width: 767px)", () => setup(false));
    return () => mm.revert();
  }, []);

  // The little tile flicks through recent work: the first plate holds 2s, the rest 0.5s each.
  useEffect(() => {
    const tile = tileRef.current;
    if (!tile || prefersReducedMotion()) return;
    const frames = Array.from(tile.querySelectorAll<HTMLElement>("[data-frame]"));
    if (frames.length < 2) return;
    let at = 0;
    let timer = 0;
    let visible = false;
    const advance = () => {
      at = (at + 1) % frames.length;
      frames.forEach((f, i) => {
        f.style.opacity = i === at ? "1" : "0";
      });
      timer = window.setTimeout(advance, at === 0 ? 2000 : 500);
    };
    const sync = () => {
      window.clearTimeout(timer);
      if (visible && !document.hidden) timer = window.setTimeout(advance, 500);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting;
        sync();
      },
      { rootMargin: "120px" },
    );
    io.observe(tile);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.clearTimeout(timer);
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  return (
    <section id="contact" className="relative bg-bg section-y">
      <div className="page-x">
        <div className="grid items-end gap-x-2 gap-y-15 md:grid-cols-12">
          <div className="@container relative md:col-span-6">
            <h2 ref={titleRef} className="text-display font-bold flow-root mb-[-0.045em] origin-bottom will-change-transform">
              Let’s
              <br />
              talk.
            </h2>
            <div className="absolute bottom-0 right-0 w-[min(1.16em,180px)] text-display">
              <span ref={tileRef} className="relative block aspect-[3/2] overflow-hidden rounded-card bg-surface">
                {PLATES.map((src, i) => (
                  <Image
                    key={src}
                    data-frame="true"
                    src={src}
                    alt={i === 0 ? "Recent Odama work" : ""}
                    aria-hidden={i > 0}
                    fill
                    sizes="180px"
                    className="object-cover"
                    style={{ opacity: i === 0 ? 1 : 0 }}
                  />
                ))}
              </span>
            </div>
          </div>
          <div className="flex flex-col justify-end md:col-span-6">
            <div ref={cardRef} className="overflow-hidden rounded-lg bg-olive">
              <div ref={bodyRef} className="flex min-h-[394px] flex-col justify-between p-4 md:min-h-[350px]">
                <h1 className="font-medium text-h1 text-white">
                  You and Us.
                  <br />
                  Let’s talk.
                </h1>
                <div ref={actionsRef} className="mt-10 flex flex-nowrap items-center gap-2 will-change-transform">
                  <SolidLink href={BOOK_A_CALL} variant={WHITE_VARIANT} className="w-full rounded-lg text-ink md:w-45">
                    Book a Call
                  </SolidLink>
                  <SolidLink href={SEND_INQUIRY} variant={ACCENT_VARIANT} className="w-full rounded-lg bg-accent text-white md:w-45">
                    Send Inquiry
                  </SolidLink>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
