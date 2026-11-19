"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { gsap } from "./SmoothScroll";
import { ClientRail } from "./about/ClientRail";
import { STATS } from "./about/data";
import { FlameStrip, StatGlow } from "./about/fire";
import { easeOdama, isMouseEvent, prefersReducedMotion } from "./about/motion";

const LEAD = "We’re a design studio based in Indonesia,";
const REST = "helping teams simplify complex ideas into digital products that are clear, usable, and built to perform.";

/** Words that scrub from muted to ink as the section scrolls in (source: RevealWords). */
function RevealWords({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const muted = getComputedStyle(document.documentElement).getPropertyValue("--color-muted").trim();
    if (!muted) return;
    const words = Array.from(el.querySelectorAll<HTMLSpanElement>("[data-word]"));
    const trigger = document.querySelector("#about") ?? el;
    const tween = gsap.from(words, {
      color: muted,
      duration: 0.4,
      ease: "none",
      stagger: 0.12,
      scrollTrigger: { trigger, start: "30% bottom", end: "+=50%", scrub: 0.5 },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.revert();
    };
  }, []);
  const words = text.split(" ");
  return (
    <span ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i}>
          <span data-word="">{w}</span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}

interface StatProps {
  value: string;
  label: string;
  index: number;
  on: boolean;
  dim: boolean;
  hot: boolean;
  onPick: () => void;
  onHover: (on: boolean) => void;
}

function StatButton({ value, label, index, on, dim, hot, onPick, onHover }: StatProps) {
  const numRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = numRef.current;
    if (!el || prefersReducedMotion()) return;
    const digits = value.match(/\d+/)?.[0];
    if (!digits) return;
    const target = parseInt(digits, 10);
    const suffix = value.replace(digits, "");
    const o = { n: 0 };
    const tween = gsap.to(o, {
      n: target,
      duration: 1.6,
      ease: "power3.out",
      snap: { n: 1 },
      onUpdate: () => {
        el.textContent = `${Math.round(o.n)}${suffix}`;
      },
      scrollTrigger: { trigger: el, start: "top 88%", once: true },
    });
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, [value]);

  return (
    <button
      type="button"
      onClick={onPick}
      onPointerEnter={(e) => isMouseEvent(e) && onHover(true)}
      onPointerLeave={(e) => isMouseEvent(e) && onHover(false)}
      aria-pressed={on}
      className={`relative flex min-h-[180px] cursor-pointer flex-col justify-between border-t border-line pt-8 pb-6 pl-6 text-left md:min-h-[206px] md:px-[26px] ${index > 0 ? "md:border-l" : ""}`}
    >
      <StatGlow active={hot} />
      <span
        ref={numRef}
        className={`relative text-[4.5rem]/[0.95] font-medium tracking-[-0.04em] tabular-nums transition-colors duration-[250ms] ease-out ${dim ? "text-ink/25" : "text-ink"}`}
      >
        {value}
      </span>
      <span className="relative mt-10 flex items-center gap-2 text-base">
        <span
          aria-hidden="true"
          className={`size-[7px] rounded-full transition-colors duration-300 ${on ? "bg-accent" : "bg-muted/60"}`}
        />
        {label}
      </span>
    </button>
  );
}

export function About() {
  const [active, setActive] = useState(0);
  const [inView, setInView] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const running = inView && !(browsing && STATS[active].set === "members");
  const runningRef = useRef(running);

  useEffect(() => {
    const el = statsRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([en]) => setInView(en.isIntersecting), {
      rootMargin: "0px 0px -20% 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Progress line: fills one third per stat over 7s, then advances to the next stat.
  useEffect(() => {
    const line = lineRef.current;
    if (!line) return;
    gsap.killTweensOf(line);
    const from = active / STATS.length;
    const to = (active + 1) / STATS.length;
    const cur = parseFloat(String(gsap.getProperty(line, "--p"))) || 0;
    const tl = gsap.timeline({
      paused: !runningRef.current,
      onComplete: () => setActive((i) => (i + 1) % STATS.length),
    });
    if (from === 0 && cur > 0.5) {
      gsap
        .timeline()
        .to(line, { "--out": 1, duration: 0.9, ease: "power1.in" })
        .set(line, { "--p": 0, "--out": 0 });
      tl.set({}, {}, 0.9);
    } else {
      gsap.set(line, { "--out": 0 });
      if (Math.abs(cur - from) > 0.001) {
        gsap.to(line, { "--p": from, duration: 0.6, ease: easeOdama });
        tl.set({}, {}, 0.6);
      }
    }
    tl.fromTo(line, { "--p": from }, { "--p": to, duration: 7, ease: "none", immediateRender: false });
    tlRef.current = tl;
    return () => {
      tl.kill();
    };
  }, [active]);

  useEffect(() => {
    runningRef.current = running;
    tlRef.current?.paused(!running);
  }, [running]);

  useEffect(() => {
    const line = lineRef.current;
    return () => {
      if (line) gsap.killTweensOf(line);
    };
  }, []);

  return (
    <section id="about" className="relative bg-bg section-y">
      <div className="page-x">
        <div className="grid gap-3 md:grid-cols-12 md:gap-x-2">
          <p className="u-label md:col-span-2 md:text-base">About</p>
          <div className="md:col-span-6 md:col-start-7">
            <h2 className="section-title leading-none text-muted md:[text-indent:100px]">
              <RevealWords className="text-ink" text={LEAD} /> {REST}
            </h2>
          </div>
        </div>
      </div>
      <div ref={statsRef} className="page-x mt-8.5 md:mt-[clamp(3rem,8vh,6rem)]">
        <div className="relative grid border-l border-line md:grid-cols-3 md:border-l-0">
          <span
            ref={lineRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 -left-px z-10 w-px md:inset-x-0 md:-top-px md:bottom-auto md:h-px md:w-auto"
            style={{ "--p": 0, "--out": 0 } as CSSProperties}
          >
            <span className="absolute inset-0 origin-top bg-accent opacity-[calc(1-var(--out))] [transform:scaleY(var(--p))] md:origin-left md:[transform:scaleX(var(--p))]" />
            <span
              className="absolute inset-x-0 bottom-0 hidden h-5 md:block"
              style={{
                clipPath: "inset(calc(var(--out) * (100% + 2px) - 2px) calc((1 - var(--p)) * 100%) 0 0)",
              }}
            >
              <FlameStrip className="absolute inset-0 [-webkit-mask-image:linear-gradient(180deg,transparent_0%,#000_45%)] [mask-image:linear-gradient(180deg,transparent_0%,#000_45%)]" />
            </span>
          </span>
          {STATS.map((s, n) => (
            <StatButton
              key={s.value}
              value={s.value}
              label={s.label}
              index={n}
              on={n === active}
              dim={hovered !== null && hovered !== n}
              hot={hovered === n}
              onPick={() => setActive(n)}
              onHover={(on) => setHovered((cur) => (on ? n : cur === n ? null : cur))}
            />
          ))}
        </div>
      </div>
      <div className="mt-10 md:mt-[clamp(3rem,8vh,5rem)]">
        <ClientRail set={STATS[active].set} onBrowse={setBrowsing} />
      </div>
    </section>
  );
}
