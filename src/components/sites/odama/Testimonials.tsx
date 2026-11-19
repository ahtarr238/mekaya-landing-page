"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger } from "./SmoothScroll";
import { prefersReducedMotion } from "./footer/hooks";
import { TestimonialRow } from "./testimonials/TestimonialRow";
import { MobileTestimonials } from "./testimonials/MobileTestimonials";
import { revealWords, TESTIMONIALS } from "./testimonials/data";

export function Testimonials() {
  const listRef = useRef<HTMLDivElement>(null);

  // Desktop: as the list scrolls in, each row opens up (10px -> 80px padding) and its quote streams
  // in word by word behind the orange caret. Scrubbed, staggered row by row.
  useEffect(() => {
    const list = listRef.current;
    if (!list || prefersReducedMotion()) return;
    const mm = gsap.matchMedia();
    mm.add("(min-width: 768px)", () => {
      const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-row]"));
      const stagger = rows.length > 1 ? 0.45 / (rows.length - 1) : 0;
      const tl = gsap.timeline({ defaults: { ease: "power2.inOut", immediateRender: true } });
      rows.forEach((row, i) => {
        const num = row.querySelector<HTMLElement>("[data-num]");
        const text = row.querySelector<HTMLElement>("[data-text]");
        const quote = row.querySelector<HTMLElement>("[data-quote]");
        const byline = row.querySelector<HTMLElement>("[data-byline]");
        if (!num || !text || !quote || !byline) return;
        const words = Array.from(row.querySelectorAll<HTMLElement>("[data-word]"));
        const caret = row.querySelector<HTMLElement>("[data-caret]");
        const at = i * stagger;
        const counter = { n: 0 };
        let shown = -1;
        const centre = (el: HTMLElement) => Math.max(0, (110 - el.offsetHeight) / 2);
        tl.fromTo(row, { paddingTop: 10, paddingBottom: 10 }, { paddingTop: 80, paddingBottom: 80, duration: 0.55 }, at)
          .fromTo(num, { marginTop: () => centre(num) }, { marginTop: 2, duration: 0.55 }, at)
          .fromTo(text, { marginTop: () => centre(byline) }, { marginTop: 0, duration: 0.55 }, at)
          .fromTo(byline, { marginTop: 0 }, { marginTop: 24, duration: 0.55 }, at)
          .fromTo(
            counter,
            { n: 0 },
            {
              n: words.length,
              ease: "none",
              duration: 0.55 * 0.75,
              onUpdate: () => {
                const n = Math.round(counter.n);
                if (n !== shown) {
                  shown = n;
                  revealWords(words, caret, n);
                }
              },
            },
            at + 0.55 * 0.2,
          );
        revealWords(words, caret, 0);
        shown = 0;
      });
      // Reserve the fully-open height so the page below doesn't move while rows open.
      const reserve = () => {
        const p = tl.progress();
        tl.progress(1);
        list.style.minHeight = "";
        list.style.minHeight = `${list.offsetHeight}px`;
        tl.progress(p);
      };
      reserve();
      ScrollTrigger.addEventListener("refreshInit", reserve);
      const st = ScrollTrigger.create({
        trigger: list,
        start: "top 80%",
        end: "bottom bottom",
        scrub: 0.6,
        animation: tl,
        invalidateOnRefresh: true,
      });
      return () => {
        ScrollTrigger.removeEventListener("refreshInit", reserve);
        st.kill();
        tl.progress(1).kill();
        list.style.minHeight = "";
      };
    });
    return () => mm.revert();
  }, []);

  return (
    <section id="testimonials" aria-labelledby="testimonials-title" className="relative bg-bg section-y">
      <div className="page-x">
        <div className="grid gap-x-2 gap-y-3 md:grid-cols-12">
          <p id="testimonials-title" className="u-label md:col-span-6">
            Testimonials
          </p>
          <h2 className="text-h2 font-medium leading-none tracking-[-0.01em] text-pretty md:col-span-4 md:col-start-7 md:text-h3">
            Thoughts from founders and teams we’ve worked with, after the work was done
          </h2>
        </div>
      </div>
      <div ref={listRef} className="mt-10 md:mt-20 max-md:hidden">
        {TESTIMONIALS.map((t, i) => (
          <TestimonialRow key={t.author} index={i} last={i === TESTIMONIALS.length - 1} {...t} />
        ))}
      </div>
      <MobileTestimonials />
    </section>
  );
}
