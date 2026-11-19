/** Small motion helpers shared by the pinned pricing stage (ported from odama.io). */

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Progress of `v` through the range [a, b], clamped to 0..1. */
export const within = (v: number, [a, b]: readonly [number, number]) => clamp01((v - a) / (b - a));

export const cosine = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** CSS-style cubic-bezier easing. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

/** The source registers these two CustomEases ("odama" and "odama-io"). */
export const easeOdama = cubicBezier(0.16, 1, 0.3, 1);
export const easeOdamaIO = cubicBezier(0.76, 0, 0.24, 1);

const GLYPHS = "/\\:ODAM";

/** Reveals `text` left to right; characters not yet revealed are random glyphs. */
export function scrambleTo(text: string, progress: number) {
  const shown = Math.floor(text.length * clamp01(progress));
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += ch === " " ? " " : i < shown ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
  }
  return out;
}

/** Throttle: returns true at most once every `ms`. */
export function scrambleClock(ms = 75) {
  let last = -Infinity;
  return () => {
    const now = performance.now();
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}

const setDelay = (el: HTMLElement, s: number) => {
  el.style.animationDelay = `${s}s`;
};

/** Staggers the CSS stream-in animation of each element. */
export function streamIn(els: HTMLElement[], step = 0.012) {
  els.forEach((el, i) => setDelay(el, i * step));
}

export function streamOut(words: HTMLElement[], others: HTMLElement[]) {
  const step = Math.min(0.003, 0.2 / Math.max(1, words.length));
  words.forEach((el, i) => setDelay(el, i * step));
  others.forEach((el, i) => setDelay(el, 0.018 * i));
}

/** Moves a caret along words as their staggered animations start. Returns a cleanup. */
export function rideCaret(container: HTMLElement, caret: HTMLElement, words: HTMLElement[]) {
  caret.style.opacity = "0";
  if (!words.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const starts = words.map((w) => 1000 * parseFloat(w.style.animationDelay) || 0);
  const end = starts[starts.length - 1] + 600;
  const t0 = performance.now();
  let raf = 0;
  const tick = (now: number) => {
    const t = now - t0;
    if (t > end) {
      caret.style.opacity = "0";
      return;
    }
    let i = 0;
    while (i + 1 < starts.length && starts[i + 1] <= t) i++;
    const r = words[i].getBoundingClientRect();
    const c = container.getBoundingClientRect();
    if (r.width) {
      const size = Math.min(22, 0.8 * r.height);
      caret.style.fontSize = `${size}px`;
      caret.style.transform = `translate(${r.right - c.left}px, ${r.top - c.top + (r.height - size) / 2}px)`;
      caret.style.opacity = "1";
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(raf);
    caret.style.opacity = "0";
  };
}
