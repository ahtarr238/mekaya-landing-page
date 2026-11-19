"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { registerOdamaEase } from "../footer/odamaEase";
import { canHover, prefersReducedMotion } from "../footer/hooks";
import { wordsOf, type Testimonial } from "./data";

interface Props extends Testimonial {
  index: number;
  last: boolean;
}

/** Desktop testimonial row. Hovering wipes the colour portrait in over the grayscale one. */
export function TestimonialRow({ index, last, quote, author, company, portrait }: Props) {
  const rowRef = useRef<HTMLElement>(null);
  const wipeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    const wipe = wipeRef.current;
    const img = wipe?.querySelector("img");
    if (!row || !wipe || !img || !canHover() || prefersReducedMotion()) return;
    const ease = registerOdamaEase();
    gsap.set(img, { scale: 1.06 });
    const enter = () => {
      gsap.killTweensOf([wipe, img]);
      gsap.fromTo(wipe, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 0.72, ease });
      gsap.to(img, { scale: 1.12, duration: 0.72, ease });
    };
    const leave = () => {
      gsap.killTweensOf([wipe, img]);
      gsap.to(wipe, { clipPath: "inset(0 0 100% 0)", duration: 0.46, ease: "power2.inOut" });
      gsap.to(img, { scale: 1.06, duration: 0.46, ease: "power2.inOut" });
    };
    row.addEventListener("pointerenter", enter);
    row.addEventListener("pointerleave", leave);
    return () => {
      row.removeEventListener("pointerenter", enter);
      row.removeEventListener("pointerleave", leave);
      gsap.killTweensOf([wipe, img]);
    };
  }, []);

  return (
    <article ref={rowRef} className="group">
      <div className="page-x">
        <div
          data-row="true"
          className={`grid grid-cols-12 items-start gap-x-2 border-t border-line ${last ? "border-b" : ""}`}
          style={{ paddingTop: 80, paddingBottom: 80 }}
        >
          <span data-num="true" className="col-span-3 text-sm font-medium tabular-nums" style={{ marginTop: 2 }}>
            {String(index + 1).padStart(2, "0")}
          </span>
          <div className="col-span-3 col-start-4">
            <span className="relative block overflow-hidden rounded-card bg-surface-2" style={{ width: 110, height: 110 }}>
              <Image src={portrait} alt={author} fill sizes="110px" className="object-cover grayscale motion-reduce:group-hover:grayscale-0" />
              <span
                ref={wipeRef}
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 block max-md:hidden"
                style={{ clipPath: "inset(0 0 100% 0)" }}
              >
                <Image src={portrait} alt="" fill sizes="110px" className="object-cover" />
              </span>
            </span>
          </div>
          <div data-text="true" className="col-span-5 col-start-7">
            <p data-quote="true" className="max-w-[38ch] text-h3 font-medium leading-none">
              {wordsOf(quote).map((w, i) => (
                <span key={i} data-word="true" className="faq-word">
                  {w}
                </span>
              ))}
              <span aria-hidden="true" data-caret="true" hidden className="faq-caret" />
            </p>
            <p data-byline="true" className="text-base text-muted" style={{ marginTop: 24 }}>
              {author}, {company}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
