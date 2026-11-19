"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { AsciiFire, PALETTE_FLAME } from "../footer/asciiFire";

/** The faint ASCII flames that burn at both ends of the hovered service row's highlight. */
export function HighlightFire({ active }: { active: boolean }) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fireRef = useRef<AsciiFire | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    if (!active) {
      const fire = fireRef.current;
      if (!fire) return;
      wrap.style.transition = "opacity 1.2s ease-out";
      wrap.style.opacity = "0";
      gsap.to(fire, { intensity: 0, duration: 0.96, ease: "power2.out", overwrite: true });
      const t = window.setTimeout(() => {
        fire.stop();
        fire.clear();
      }, 1300);
      return () => window.clearTimeout(t);
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!fireRef.current) {
      const fire = new AsciiFire(canvas, {
        cell: 6,
        palette: PALETTE_FLAME,
        glyphs: "/\\0@DA:.",
        coverage: 0.9,
        decay: 2,
        spread: 0.4,
        fps: 9,
        intensity: 0,
        shape: (x) => {
          const t = Math.min(x, 1 - x) / 0.14;
          return t >= 1 ? 0 : (1 - t) * (1 - t);
        },
        seed: 11,
      });
      fireRef.current = fire;
      const size = () => {
        const r = wrap.getBoundingClientRect();
        if (r.width && r.height) fire.resize(r.width, r.height);
      };
      size();
      const ro = new ResizeObserver(size);
      ro.observe(wrap);
      roRef.current = ro;
    }
    const fire = fireRef.current;
    fire.start();
    gsap.to(fire, { intensity: 1, duration: 0.4, ease: "power1.in", overwrite: true });
    wrap.style.transition = "opacity 0.4s ease-out";
    wrap.style.opacity = "0.6";
  }, [active]);

  useEffect(
    () => () => {
      roRef.current?.disconnect();
      roRef.current = null;
      if (fireRef.current) gsap.killTweensOf(fireRef.current);
      fireRef.current?.destroy();
      fireRef.current = null;
    },
    [],
  );

  return (
    <span ref={wrapRef} aria-hidden="true" className="pointer-events-none absolute inset-0 block overflow-hidden rounded-[inherit] opacity-0">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </span>
  );
}
