"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { gsap } from "gsap";
import { registerOdamaEase } from "../footer/odamaEase";
import { prefersReducedMotion } from "../footer/hooks";
import { ArrowSwap, EmberFire, emberSkin, emberTone, useEmber } from "../footer/ember";
import { revealWords, TESTIMONIALS, wordsOf } from "./data";

const ORB =
  "relative isolate inline-flex size-10 flex-none items-center justify-center overflow-hidden rounded-[20px] border border-line bg-bg duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)]";

/** Below md: one testimonial at a time, swiped or stepped with the arrow orbs. */
export function MobileTestimonials() {
  const count = TESTIMONIALS.length;
  const [state, setState] = useState({ i: 0, dir: 1 });
  const stageRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(0);
  const downX = useRef<number | null>(null);
  const typeTween = useRef<gsap.core.Tween | null>(null);
  const started = useRef(false);
  const prev = useEmber();
  const next = useEmber();

  const typeIn = (i: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    typeTween.current?.progress(1).kill();
    typeTween.current = null;
    if (prefersReducedMotion()) return;
    const slide = stage.children[i];
    if (!slide) return;
    const words = Array.from(slide.querySelectorAll<HTMLElement>("[data-word]"));
    const caret = slide.querySelector<HTMLElement>("[data-caret]");
    const st = { v: 0 };
    let shown = -1;
    const update = () => {
      const n = Math.round(st.v);
      if (n !== shown) {
        shown = n;
        revealWords(words, caret, n);
      }
    };
    update();
    typeTween.current = gsap.to(st, {
      v: words.length,
      duration: Math.min(1.8, Math.max(0.7, 0.04 * words.length)),
      ease: "none",
      onUpdate: update,
      onComplete: update,
    });
  };

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const first = stage.children[0];
    if (first && !prefersReducedMotion())
      revealWords(Array.from(first.querySelectorAll<HTMLElement>("[data-word]")), first.querySelector<HTMLElement>("[data-caret]"), 0);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true;
          io.disconnect();
          typeIn(shownRef.current);
        }
      },
      { threshold: 0.3 },
    );
    io.observe(stage);
    return () => {
      io.disconnect();
      typeTween.current?.progress(1).kill();
    };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const ease = registerOdamaEase();
    const slides = Array.from(stage.children) as HTMLElement[];
    const { i, dir } = state;
    const from = shownRef.current;
    shownRef.current = i;
    const hide = (el: HTMLElement) => gsap.set(el, { xPercent: 0, autoAlpha: 0 });
    gsap.killTweensOf(slides);
    slides.forEach((el, k) => {
      if (k !== i && k !== from) hide(el);
    });
    if (from === i || prefersReducedMotion()) {
      if (from !== i) hide(slides[from]);
      gsap.set(slides[i], { xPercent: 0, autoAlpha: 1 });
      return;
    }
    if (started.current) typeIn(i);
    gsap.to(slides[from], { xPercent: -46 * dir, autoAlpha: 0, duration: 0.44, ease });
    gsap.fromTo(slides[i], { xPercent: 92 * dir, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: 0.62, ease });
  }, [state]);

  const go = (d: number) => setState((s) => ({ i: (s.i + d + count) % count, dir: d }));

  return (
    <div className="mt-15 page-x md:hidden">
      <div
        ref={stageRef}
        data-slide-stage="true"
        className="grid touch-pan-y overflow-hidden"
        onPointerDown={(e) => {
          downX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const x0 = downX.current;
          downX.current = null;
          if (x0 === null) return;
          const dx = e.clientX - x0;
          if (Math.abs(dx) > 44) go(dx < 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          downX.current = null;
        }}
      >
        {TESTIMONIALS.map((t, k) => (
          <article key={t.author} className="col-start-1 row-start-1" style={k === 0 ? undefined : { visibility: "hidden", opacity: 0 }}>
            <span className="relative block size-[86px] overflow-hidden rounded-[10px] bg-surface-2">
              <Image src={t.portrait} alt={t.author} fill sizes="104px" className="object-cover" />
            </span>
            <p className="mt-8 text-h2 font-medium leading-[1.2]">
              {wordsOf(t.quote).map((w, i) => (
                <span key={i} data-word="true" className="faq-word">
                  {w}
                </span>
              ))}
              <span aria-hidden="true" data-caret="true" hidden className="faq-caret" />
            </p>
            <p className="mt-6 text-base text-muted">
              {t.author}, {t.company}
            </p>
          </article>
        ))}
      </div>
      <div className="mt-20 flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous testimonial"
          {...prev.bind}
          style={emberSkin(prev.heat)}
          className={ORB}
        >
          <EmberFire active={prev.active} heat={prev.heat} tone={emberTone()} cell={3} />
          <ArrowSwap back />
        </button>
        <span className="text-sm tabular-nums">{String(state.i + 1).padStart(2, "0")}</span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next testimonial"
          {...next.bind}
          style={emberSkin(next.heat)}
          className={ORB}
        >
          <EmberFire active={next.active} heat={next.heat} tone={emberTone()} cell={3} />
          <ArrowSwap />
        </button>
      </div>
      <div className="mt-15 border-t border-line" />
    </div>
  );
}
