"use client";

import { useEffect, useRef } from "react";
import { AsciiFire, PALETTE_FLAME_STRONG, PLUMES, type FireTint } from "./asciiFire";
import { prefersReducedMotion, useIsMobile } from "./hooks";

/** Dark at the floor, flame orange from 30% up. */
const TINT: FireTint = [
  [0, "#000000"],
  [0.3, "#ec1c1c"],
  [1, "#ec1c1c"],
];
const INTENSITY = 0.9;

/**
 * The footer's rising ASCII fire. It flares to full heat while any pointer is pressed, and a press
 * inside it stamps a moving ember under the pointer.
 */
export function FooterFire({ className }: { className?: string }) {
  const mobile = useIsMobile();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || prefersReducedMotion()) return;
    const fire = new AsciiFire(canvas, {
      cell: mobile ? 6 : 10,
      palette: PALETTE_FLAME_STRONG,
      coverage: 0.96,
      decay: 1,
      fps: 18,
      intensity: INTENSITY,
      seed: 3,
      maxDpr: 3,
      shape: PLUMES,
      tint: TINT,
      glyphs: ".:/\\AD0@",
      glyphRamp: 0.72,
      gpu: true,
    });
    const size = () => {
      const r = wrap.getBoundingClientRect();
      fire.resize(r.width, r.height);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(wrap);

    let onScreen = false;
    const sync = () => {
      if (onScreen && !document.hidden) fire.start();
      else fire.stop();
    };
    const io = new IntersectionObserver(
      ([e]) => {
        onScreen = e.isIntersecting;
        sync();
      },
      { rootMargin: "120px" },
    );
    io.observe(wrap);
    document.addEventListener("visibilitychange", sync);

    // Ember on press: follows the pointer while it is held inside the fire.
    let px = 0;
    let py = 0;
    let held = false;
    let level = 0;
    let raf = 0;
    let phase = 0;
    const pump = () => {
      level += ((held ? 1 : 0) - level) * 0.13;
      if (level > 0.02) {
        const r = wrap.getBoundingClientRect();
        phase += 1;
        const wobble = 0.6 + 0.4 * Math.sin(0.29 * phase) * Math.cos(0.163 * phase + 1.1);
        fire.setEmitter(
          px - r.left + (Math.random() - 0.5) * 9,
          py - r.top + (Math.random() - 0.5) * 9,
          (14 + 26 * level) * (0.82 + 0.18 * wobble),
          0.82 * level * wobble,
        );
        raf = requestAnimationFrame(pump);
      } else {
        fire.clearEmitter();
        raf = 0;
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(pump);
    };
    const down = (e: PointerEvent) => {
      fire.intensity = 1;
      const r = wrap.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      px = e.clientX;
      py = e.clientY;
      held = true;
      kick();
    };
    const move = (e: PointerEvent) => {
      if (!held) return;
      px = e.clientX;
      py = e.clientY;
    };
    const up = () => {
      fire.intensity = INTENSITY;
      if (!held) return;
      held = false;
      kick();
    };
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", up, { passive: true });
    window.addEventListener("pointercancel", up, { passive: true });
    window.addEventListener("blur", up);

    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("blur", up);
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      fire.destroy();
    };
  }, [mobile]);

  return (
    <div ref={wrapRef} aria-hidden="true" className={className}>
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
