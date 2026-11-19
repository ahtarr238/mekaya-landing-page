// Canvas ASCII "doom fire" used for the About stat hover glow and the progress-line flame.
// Port of the source's AsciiFire (2D canvas path only).

export const PALETTE_FLAME = [
  "transparent",
  "rgba(255,96,96,0.30)",
  "rgba(255,72,72,0.45)",
  "rgba(255,48,48,0.62)",
  "rgba(255,1,1,0.78)",
  "rgba(255,0,0,0.90)",
  "rgba(244,0,0,1)",
];

export const PALETTE_FLAME_STRONG = [
  "transparent",
  "rgba(255,124,124,0.92)",
  "rgba(255,84,84,0.96)",
  "rgba(255,42,42,1)",
  "rgba(255,1,1,1)",
  "rgba(246,0,0,1)",
  "rgba(232,0,0,1)",
];

export const PLUMES = (x: number) => 0.7 + 0.3 * Math.abs(Math.sin(6.7 * x + 0.8) * Math.cos(2.9 * x - 0.5));

export function asciiFont(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return v || '"Geist Pixel", ui-monospace, monospace';
}

/** Draws one glyph centred in a square box, squeezing it horizontally if it is too wide. */
export function fillGlyphInBox(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  x: number,
  y: number,
  size: number,
  inset = 0,
) {
  const half = Math.round(size / 2);
  const box = size - inset;
  const m = ctx.measureText(glyph);
  const w =
    m.actualBoundingBoxLeft !== undefined ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + inset / 2, y + inset / 2, box, box);
  ctx.clip();
  if (w > box) {
    ctx.translate(x + half, y + half);
    ctx.scale(box / w, 1);
    ctx.fillText(glyph, 0, 0);
  } else {
    ctx.fillText(glyph, x + half, y + half);
  }
  ctx.restore();
}

/** Runs `cb` once the page fonts are loaded (glyph atlases are rebuilt then). */
export function whenFontsReady(cb: () => void) {
  if (typeof document === "undefined" || !document.fonts) return;
  if (document.fonts.status === "loaded") return;
  document.fonts.ready.then(cb).catch(() => undefined);
}

export interface AsciiFireOptions {
  cell?: number;
  glyphs?: string;
  palette: string[];
  coverage?: number;
  decay?: number;
  spread?: number;
  fps?: number;
  intensity?: number;
  shape?: (x: number) => number;
  seed?: number;
  maxDpr?: number;
  fontScale?: number;
}

export class AsciiFire {
  intensity: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cell: number;
  private glyphs: string;
  private palette: string[];
  private coverage: number;
  private decay: number;
  private spread: number;
  private stepMs: number;
  private shape: (x: number) => number;
  private seed: number;
  private maxDpr: number;
  private fontScale: number;
  private dpr = 1;
  private cellDev = 1;
  private cols = 0;
  private rows = 0;
  private grid = new Uint8Array(0);
  private glyphIdx = new Uint8Array(0);
  private noise = new Float32Array(0);
  private rowBuf = new Uint8Array(0);
  private rowHits = new Uint8Array(0);
  private atlas: HTMLCanvasElement | null = null;
  private t = 0;
  private raf = 0;
  private running = false;
  private last = 0;
  private acc = 0;

  constructor(canvas: HTMLCanvasElement, o: AsciiFireOptions) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.cell = o.cell ?? 9;
    this.glyphs = o.glyphs ?? "/\\|:.,;+=*#%@$SWRDLY10<>^~-";
    this.palette = o.palette;
    this.coverage = o.coverage ?? 0.86;
    this.decay = o.decay ?? 1;
    this.spread = Math.min(1, Math.max(0, o.spread ?? 1));
    this.stepMs = 1000 / (o.fps ?? 24);
    this.intensity = o.intensity ?? 1;
    this.shape = o.shape ?? (() => 1);
    this.seed = o.seed ?? 1;
    this.maxDpr = o.maxDpr ?? 1.5;
    this.fontScale = o.fontScale ?? 1.06;
    whenFontsReady(() => {
      if (this.atlas) this.buildAtlas();
    });
  }

  resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    this.dpr = Math.min(this.maxDpr, window.devicePixelRatio || 1);
    this.cellDev = Math.max(1, Math.round(this.cell * this.dpr));
    const cellPx = this.cellDev / this.dpr;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.cols = Math.max(1, Math.ceil(w / cellPx));
    this.rows = Math.max(1, Math.ceil(h / cellPx));
    const n = this.cols * this.rows;
    this.grid = new Uint8Array(n);
    this.glyphIdx = new Uint8Array(n);
    this.noise = new Float32Array(this.cols);
    this.rowBuf = new Uint8Array(this.cols);
    this.rowHits = new Uint8Array(this.cols);
    let s = this.seed >>> 0;
    const rnd = () => (s = (1664525 * s + 0x3c6ef35f) >>> 0) / 0x100000000;
    for (let i = 0; i < n; i++) this.glyphIdx[i] = (256 * rnd()) | 0;
    for (let i = 0; i < this.cols; i++) this.noise[i] = rnd();
    this.buildAtlas();
    this.ctx.imageSmoothingEnabled = false;
  }

  private buildAtlas() {
    const e = this.cellDev;
    const c = document.createElement("canvas");
    c.width = e * this.glyphs.length;
    c.height = e * this.palette.length;
    const g = c.getContext("2d");
    if (!g) return;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `400 ${Math.max(1, Math.round(e * this.fontScale))}px ${asciiFont()}`;
    for (let r = 0; r < this.palette.length; r++) {
      g.fillStyle = this.palette[r];
      for (let i = 0; i < this.glyphs.length; i++) fillGlyphInBox(g, this.glyphs[i], i * e, r * e, e);
    }
    this.atlas = c;
  }

  private step() {
    const { cols, rows, grid } = this;
    if (!cols || !rows) return;
    this.t += 1;
    // Seed the floor row.
    const heat = 36 * Math.min(1, Math.max(0, this.intensity));
    const base = (rows - 1) * cols;
    for (let x = 0; x < cols; x++) {
      const s = 0.55 + 0.45 * Math.sin(0.09 * this.t + 12 * this.noise[x]) * Math.cos(0.031 * this.t + 0.21 * x);
      const o = this.shape(cols > 1 ? x / (cols - 1) : 0.5);
      grid[base + x] = this.noise[x] < this.coverage * o ? Math.max(0, (heat * s * o) | 0) : 0;
    }
    // Propagate upward.
    const buf = this.rowBuf;
    const hits = this.rowHits;
    for (let y = rows - 2; y >= 0; y--) {
      const n = y * cols;
      const src = n + cols;
      hits.fill(0);
      for (let x = 0; x < cols; x++) {
        const v = grid[src + x];
        if (v === 0) continue;
        const dx = this.spread >= 1 || Math.random() < this.spread ? ((3 * Math.random()) | 0) - 1 : 0;
        const o = dx === 0 ? 1 : Math.random() < 0.5 ? 0 : 2;
        let a = x + dx;
        if (a < 0) a = 0;
        else if (a > cols - 1) a = cols - 1;
        const c = v - (o & this.decay);
        const f = ++hits[a];
        if (f === 1 || Math.random() * f < 1) buf[a] = c > 0 ? c : 0;
      }
      for (let x = 0; x < cols; x++) {
        if (hits[x]) grid[n + x] = buf[x];
        else if (grid[src + x] === 0) grid[n + x] = 0;
      }
    }
    // Shimmer glyphs.
    const k = (cols * rows) >> 5;
    for (let i = 0; i < k; i++) this.glyphIdx[(Math.random() * this.glyphIdx.length) | 0] = (256 * Math.random()) | 0;
  }

  private paint() {
    const { ctx, atlas, cols, rows, grid } = this;
    if (!atlas) return;
    const e = this.cellDev;
    const pl = this.palette.length;
    const gl = this.glyphs.length;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        const v = grid[i];
        if (v < 2) continue;
        let r = ((v / 36) * pl) | 0;
        if (r >= pl) r = pl - 1;
        if (r === 0) continue;
        let g = ((this.glyphIdx[i] / 256) * gl) | 0;
        if (g >= gl) g = gl - 1;
        ctx.drawImage(atlas, g * e, r * e, e, e, x * e, y * e, e, e);
      }
    }
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (!this.last) this.last = now;
    this.acc += now - this.last;
    this.last = now;
    if (this.acc < this.stepMs) return;
    let n = Math.min(3, Math.floor(this.acc / this.stepMs));
    this.acc -= n * this.stepMs;
    while (n-- > 0) this.step();
    this.paint();
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  clear() {
    this.grid.fill(0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.stop();
    this.atlas = null;
  }
}
