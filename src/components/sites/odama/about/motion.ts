// Small motion helpers shared by the About / Why / Works sections.

/** CSS-style cubic-bezier easing (same curves the source registers with CustomEase). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  const solveX = (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    while (lo < hi) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) return t;
      if (x > v) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
      if (hi - lo < 1e-7) break;
    }
    return t;
  };
  return (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : sampleY(solveX(t)));
}

/** "odama": the site's default ease-out. */
export const easeOdama = cubicBezier(0.16, 1, 0.3, 1);
/** "odama-io": the site's symmetric in-out ease. */
export const easeOdamaIO = cubicBezier(0.76, 0, 0.24, 1);

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const isMouseEvent = (e: PointerEvent | React.PointerEvent) => e.pointerType === "mouse";

export const canHover = () =>
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Text with the first `revealed` characters of `text` and random uppercase glyphs after. */
export function scrambleTo(text: string, revealed: number, length = text.length): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    const ch = text[i];
    if (ch === " ") out += " ";
    else if (ch !== undefined && i < revealed) out += ch;
    else out += UPPER[Math.floor(Math.random() * UPPER.length)];
  }
  return out;
}
