"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
import { AsciiFire, PALETTE_BLAZE, PALETTE_FLAME, PALETTE_SCORCH, PALETTE_SHADE, type FirePalette } from "./asciiFire";

/**
 * Hover "ember" for buttons and chips, ported from odama.io: a small ASCII fire fades in behind the
 * label while the control is hovered or pressed, and the control's skin switches to its lit colors.
 */

export type EmberTone = "warm" | "scorch" | "ember" | "shade";

const TONES: Record<EmberTone, FirePalette> = {
  warm: PALETTE_FLAME,
  scorch: PALETTE_SCORCH,
  ember: PALETTE_BLAZE,
  shade: PALETTE_SHADE,
};

export interface EmberVariant {
  rest: string;
  lit: string;
  ink?: string;
  tone?: EmberTone;
}

export const WHITE_VARIANT: EmberVariant = { rest: "#fff", lit: "#fff", ink: "var(--color-ink)", tone: "warm" };
export const ACCENT_VARIANT: EmberVariant = {
  rest: "var(--color-accent)",
  lit: "var(--color-accent)",
  ink: "#fff",
  tone: "shade",
};

const TRANSITION = "background-color, border-color, border-radius, color, opacity, transform";

export function emberSkin(heat: number, pill = false, variant?: EmberVariant): CSSProperties {
  const style: CSSProperties = { transitionProperty: TRANSITION };
  if (variant) style.backgroundColor = heat > 0 ? variant.lit : variant.rest;
  if (heat <= 0) return style;
  return {
    ...style,
    ...(variant ? null : { backgroundColor: "#121212" }),
    borderColor: "transparent",
    ...(pill ? null : { borderRadius: "var(--radius-chip)" }),
    color: variant?.ink ?? "#fff",
  };
}

export function emberTone(variant?: EmberVariant): EmberTone {
  return variant?.tone ?? "ember";
}

const isMouse = (e: PointerEvent) => e.pointerType === "mouse";
const isKeyboardFocus = (el: EventTarget) => {
  try {
    return el instanceof Element && el.matches(":focus-visible");
  } catch {
    return true;
  }
};

export interface EmberBind {
  onPointerEnter: (e: PointerEvent) => void;
  onPointerLeave: () => void;
  onFocus: (e: FocusEvent) => void;
  onBlur: () => void;
  onPointerDown: (e: PointerEvent) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onKeyUp: (e: KeyboardEvent) => void;
}

export function useEmber() {
  const [hot, setHot] = useState(false);
  const [lit, setLit] = useState(false);
  const pressedAt = useRef(0);
  const timer = useRef(0);

  const release = useCallback(() => {
    window.clearTimeout(timer.current);
    const left = 380 - (performance.now() - pressedAt.current);
    if (left <= 0) setLit(false);
    else timer.current = window.setTimeout(() => setLit(false), left);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!lit) return;
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [lit, release]);

  const heat = lit || hot ? 1 : 0;
  const bind: EmberBind = {
    onPointerEnter: (e) => {
      if (isMouse(e)) setHot(true);
    },
    onPointerLeave: () => {
      setHot(false);
      release();
    },
    onFocus: (e) => {
      if (isKeyboardFocus(e.target)) setHot(true);
    },
    onBlur: () => {
      setHot(false);
      release();
    },
    onPointerDown: (e) => {
      if (!isMouse(e)) return;
      window.clearTimeout(timer.current);
      pressedAt.current = performance.now();
      setLit(true);
    },
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        window.clearTimeout(timer.current);
        pressedAt.current = performance.now();
        setLit(true);
      }
    },
    onKeyUp: (e) => {
      if (e.key === "Enter" || e.key === " ") release();
    },
  };
  return { heat, active: heat > 0, bind };
}

interface EmberFireProps {
  active: boolean;
  heat?: number;
  tone?: EmberTone;
  cell?: number;
}

/** The fire layer itself: absolutely fills its (relative, overflow-hidden) parent. */
export function EmberFire({ active, heat = 1, tone = "warm", cell = 4 }: EmberFireProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fireRef = useRef<AsciiFire | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const tween = (fire: AsciiFire, to: number, ms: number, done?: () => void) => {
      cancelAnimationFrame(rafRef.current);
      const from = fire.intensity;
      const t0 = performance.now();
      const up = to > from;
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / ms);
        fire.intensity = from + (to - from) * (up ? 1 - (1 - p) ** 3 : p * p);
        if (p < 1) rafRef.current = requestAnimationFrame(tick);
        else done?.();
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    if (!active) {
      const fire = fireRef.current;
      if (!fire) return;
      wrap.style.transitionDuration = "460ms";
      wrap.style.transitionTimingFunction = "cubic-bezier(0.4, 0, 1, 1)";
      wrap.style.opacity = "0";
      tween(fire, 0, 460);
      const t = window.setTimeout(() => {
        fire.stop();
        fire.clear();
      }, 580);
      return () => {
        window.clearTimeout(t);
        cancelAnimationFrame(rafRef.current);
      };
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!fireRef.current) {
      const fire = new AsciiFire(canvas, {
        cell,
        palette: TONES[tone],
        glyphs: "/\\0@DA:.",
        coverage: 0.92,
        decay: 2,
        fps: 22,
        intensity: 0,
        maxDpr: 3,
        seed: 5,
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
    fire.setPalette(TONES[tone]);
    fire.start();
    tween(fire, heat, 380);
    wrap.style.transitionDuration = "360ms";
    wrap.style.transitionTimingFunction = "cubic-bezier(0.16, 1, 0.3, 1)";
    wrap.style.opacity = "1";
    return () => cancelAnimationFrame(rafRef.current);
  }, [active, heat, cell, tone]);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      roRef.current?.disconnect();
      roRef.current = null;
      fireRef.current?.destroy();
      fireRef.current = null;
    },
    [],
  );

  return (
    <span
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 block overflow-hidden rounded-[inherit] opacity-0 transition-[opacity,border-radius] duration-300"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </span>
  );
}

export function ArrowGlyph({ className }: { className?: string }) {
  return (
    <span className={className ? `pixel-icon ${className}` : "pixel-icon"}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
        <path d="M6 12H18M14 8L18 12L14 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
      </svg>
    </span>
  );
}

export function ArrowSwap({ back = false }: { back?: boolean }) {
  return (
    <span aria-hidden="true" className="relative z-10 block leading-[0]">
      <ArrowGlyph className={back ? "rotate-180" : undefined} />
    </span>
  );
}
