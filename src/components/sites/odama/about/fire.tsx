"use client";

import { useEffect, useRef } from "react";
import { gsap } from "../SmoothScroll";
import { AsciiFire, PALETTE_FLAME, PALETTE_FLAME_STRONG, PLUMES } from "./asciiFire";
import { prefersReducedMotion } from "./motion";

const edgeShape = (x: number) => {
  const t = Math.min(x, 1 - x) / 0.14;
  return t >= 1 ? 0 : (1 - t) * (1 - t);
};

/** Ember glow behind a stat button while it is hovered (source: opacity 0.6 ASCII flame at the edges). */
export function StatGlow({ active }: { active: boolean }) {
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
      const id = window.setTimeout(() => {
        fire.stop();
        fire.clear();
      }, 1300);
      return () => window.clearTimeout(id);
    }
    if (prefersReducedMotion()) return;
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
        shape: edgeShape,
        seed: 11,
      });
      fireRef.current = fire;
      const fit = () => {
        const r = wrap.getBoundingClientRect();
        if (r.width && r.height) fire.resize(r.width, r.height);
      };
      fit();
      const ro = new ResizeObserver(fit);
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
    <span
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 block overflow-hidden rounded-[inherit] opacity-0"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </span>
  );
}

/** Flame strip riding on the About progress line. Runs only while on screen. */
export function FlameStrip({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || prefersReducedMotion()) return;
    const fire = new AsciiFire(canvas, {
      cell: 4,
      coverage: 0.9,
      decay: 2,
      fps: 16,
      intensity: 0.8,
      palette: PALETTE_FLAME_STRONG,
      shape: PLUMES,
      seed: 3,
      maxDpr: 3,
    });
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width && r.height) fire.resize(r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    const io = new IntersectionObserver(([en]) => {
      if (en.isIntersecting) fire.start();
      else fire.stop();
    });
    io.observe(wrap);
    return () => {
      ro.disconnect();
      io.disconnect();
      fire.destroy();
    };
  }, []);

  return (
    <div ref={wrapRef} aria-hidden="true" className={className}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
