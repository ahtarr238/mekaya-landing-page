// Particle ASCII rendering of an image: each bright cell becomes a glyph particle that springs
// back home and is pushed away by the pointer. Port of the source's "Our Value" card art.
import { asciiFont, fillGlyphInBox, whenFontsReady } from "../about/asciiFire";

function hash(x: number, y: number) {
  const r = 43758.5453 * Math.sin(127.1 * x + 311.7 * y);
  return r - Math.floor(r);
}

export interface EdgeFade {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

export interface AsciiArtOptions {
  src: string;
  columns?: number;
  threshold?: number;
  radius?: number;
  force?: number;
  spring?: number;
  friction?: number;
  color?: string;
  maxDpr?: number;
  glyphs?: string;
  fit?: "contain" | "area" | "height";
  fill?: number;
  maxWidth?: number;
  maxHeight?: number;
  contrast?: number;
  edgeFade?: EdgeFade;
}

interface Particle {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  s: number;
}

interface Win {
  top: number;
  bottom: number;
  fade: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class AsciiArt {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private atlas: HTMLCanvasElement | null = null;
  private particles: Particle[] = [];
  private w = 0;
  private h = 0;
  private dpr = 1;
  private src: string;
  private columns: number;
  private threshold: number;
  private radius: number;
  private force: number;
  private spring: number;
  private friction: number;
  private color: string;
  private maxDpr: number;
  private glyphs: string;
  private fit: "contain" | "area" | "height";
  private fill: number;
  private maxWidth: number;
  private maxHeight: number;
  private contrast: number;
  private edgeFade?: EdgeFade;
  private win: Win | null = null;
  private bbox = { x: 0, y: 0, w: 0, h: 0 };
  private ramp: number[] = [];
  private rampKey = "";
  private rampFlat = false;
  private pointer = { x: -9999, y: -9999, active: false };
  private raf = 0;
  private running = false;
  private idleFrames = 0;
  private wokeAt = 0;
  private dirty: Rect | null = null;
  private fullPaint = true;
  private image: HTMLImageElement | null = null;
  private fontWatched = false;

  constructor(canvas: HTMLCanvasElement, o: AsciiArtOptions) {
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2d context unavailable");
    this.canvas = canvas;
    this.ctx = ctx;
    this.src = o.src;
    this.columns = o.columns ?? 74;
    this.threshold = o.threshold ?? 64;
    this.radius = o.radius ?? 110;
    this.force = o.force ?? 26;
    this.spring = o.spring ?? 0.055;
    this.friction = o.friction ?? 0.86;
    this.color = o.color ?? "rgba(10,10,10,0.55)";
    this.maxDpr = o.maxDpr ?? 2;
    this.glyphs = o.glyphs || "/\\0@DA:.";
    this.fit = o.fit ?? "contain";
    this.fill = o.fill ?? 0.58;
    this.maxWidth = o.maxWidth ?? 0.98;
    this.maxHeight = o.maxHeight ?? 0.8;
    this.contrast = o.contrast ?? 0.6;
    this.edgeFade = o.edgeFade;
  }

  private edgeKeep(x: number, y: number, cols: number, rows: number) {
    const a = this.edgeFade;
    if (!a) return true;
    const u = (x + 0.5) / cols;
    const v = (y + 0.5) / rows;
    let o = 1;
    if (a.left) o = Math.min(o, u / a.left);
    if (a.right) o = Math.min(o, (1 - u) / a.right);
    if (a.top) o = Math.min(o, v / a.top);
    if (a.bottom) o = Math.min(o, (1 - v) / a.bottom);
    return o >= 1 || (!(o <= 0) && hash(x, y) < o * o * (3 - 2 * o));
  }

  private glyphPx() {
    return Math.max(4, Math.round((this.w / this.columns) * this.dpr));
  }

  async load() {
    const img = new Image();
    img.decoding = "async";
    img.src = this.src;
    await img.decode().catch(() => undefined);
    this.image = img;
    this.measureBBox(img);
  }

  private measureBBox(img: HTMLImageElement) {
    const W = img.naturalWidth || 1;
    const H = img.naturalHeight || 1;
    this.bbox = { x: 0, y: 0, w: W, h: H };
    const sc = Math.min(1, 200 / Math.max(W, H));
    const w = Math.max(1, Math.round(W * sc));
    const h = Math.max(1, Math.round(H * sc));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.drawImage(img, 0, 0, w, h);
    let data: Uint8ClampedArray;
    try {
      data = g.getImageData(0, 0, w, h).data;
    } catch {
      return;
    }
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3] / 255;
        const lum = ((0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255) * a;
        if (lum < 0.03) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return;
    const inv = 1 / sc;
    const bx = Math.max(0, Math.floor(minX * inv));
    const by = Math.max(0, Math.floor(minY * inv));
    this.bbox = {
      x: bx,
      y: by,
      w: Math.min(W - bx, Math.ceil((maxX + 1) * inv) - bx),
      h: Math.min(H - by, Math.ceil((maxY + 1) * inv) - by),
    };
  }

  setColor(color: string) {
    if (color === this.color) return;
    this.color = color;
    this.buildAtlas();
    this.wake();
  }

  private buildAtlas() {
    const e = this.glyphPx();
    const t = this.glyphs;
    const c = document.createElement("canvas");
    c.width = e * t.length;
    c.height = 3 * e;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const inset = 0.3 * this.dpr;
    g.font = `${Math.round((e - inset) * 1.45)}px ${asciiFont()}`;
    const alphas = [0.68, 0.86, 1];
    for (let r = 0; r < 3; r++) {
      g.globalAlpha = alphas[r];
      g.fillStyle = this.color;
      for (let s = 0; s < t.length; s++) fillGlyphInBox(g, t[s], s * e, r * e, e, inset);
    }
    this.atlas = c;
    this.fullPaint = true;
    this.measureRamp(g, e);
    if (!this.fontWatched) {
      this.fontWatched = true;
      whenFontsReady(() => {
        if (!this.atlas) return;
        this.rampKey = "";
        this.buildAtlas();
        this.sample();
        this.settle();
      });
    }
  }

  private measureRamp(g: CanvasRenderingContext2D, e: number) {
    const key = `${this.glyphs}@${e}`;
    if (this.rampKey === key) return;
    const n = this.glyphs.length;
    const data = g.getImageData(0, 2 * e, e * n, e).data;
    const sums = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      let s = 0;
      for (let y = 0; y < e; y++) {
        const row = (y * e * n + k * e) * 4;
        for (let x = 0; x < e; x++) s += data[row + 4 * x + 3];
      }
      sums[k] = s;
    }
    this.ramp = Array.from({ length: n }, (_, i) => i).sort((a, b) => sums[a] - sums[b]);
    const lo = sums[this.ramp[0]];
    const hi = sums[this.ramp[n - 1]];
    this.rampFlat = n < 3 || hi < 1.25 * lo;
    this.rampKey = key;
  }

  resize(w: number, h: number) {
    if (!this.image || w <= 0 || h <= 0) return;
    const scale = window.visualViewport?.scale || 1;
    this.dpr = Math.min(this.maxDpr, (window.devicePixelRatio || 1) * scale);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.imageSmoothingEnabled = false;
    this.buildAtlas();
    this.sample();
    this.fullPaint = true;
    this.paint();
  }

  private sample() {
    const img = this.image;
    if (!img) return;
    const bb = this.bbox;
    const bw = bb.w || 1;
    const bh = bb.h || 1;
    const k =
      this.fit === "height"
        ? this.h / bh
        : this.fit === "area"
          ? Math.min(
              Math.sqrt((this.fill * this.w * this.h) / (bw * bh)),
              (this.maxWidth * this.w) / bw,
              (this.maxHeight * this.h) / bh,
            )
          : Math.min(this.w / bw, this.h / bh);
    const dw = bw * k;
    const dh = bh * k;
    const ox = (this.w - dw) / 2;
    const oy = (this.h - dh) / 2;
    const cols = Math.max(1, Math.round(this.columns * (dw / this.w)));
    const rows = Math.max(1, Math.round((cols * dh) / dw));
    const sw = 3 * cols;
    const sh = 3 * rows;
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const g = c.getContext("2d", { willReadFrequently: true });
    if (!g) return;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, bb.x, bb.y, bb.w, bb.h, 0, 0, sw, sh);
    const data = g.getImageData(0, 0, sw, sh).data;
    const cw = dw / cols;
    const ch = dh / rows;
    const pts: { hx: number; hy: number; t: number }[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (!this.edgeKeep(x, y, cols, rows)) continue;
        let sum = 0;
        let max = 0;
        let alpha = 0;
        for (let i = 0; i < 3; i++) {
          const row = ((3 * y + i) * sw + 3 * x) * 4;
          for (let j = 0; j < 3; j++) {
            const p = row + 4 * j;
            const a = data[p + 3] / 255;
            const l = ((0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) / 255) * a;
            sum += l;
            if (l > max) max = l;
            if (a > alpha) alpha = a;
          }
        }
        if (alpha < 0.05) continue;
        const t = (sum / 9) * 0.35 + 0.65 * max;
        if (255 * t < this.threshold) continue;
        const hx = ox + x * cw + cw / 2;
        const hy = oy + y * ch + ch / 2;
        if (hx < -cw || hx > this.w + cw || hy < -ch || hy > this.h + ch) continue;
        pts.push({ hx, hy, t });
      }
    }
    const ts = pts.map((p) => p.t).sort((a, b) => a - b);
    const lo = ts.length ? ts[Math.floor(0.05 * ts.length)] : 0;
    const span = Math.max(1e-4, (ts.length ? ts[Math.floor(0.95 * ts.length)] : 1) - lo);
    const ramp = this.ramp.length ? this.ramp : Array.from({ length: this.glyphs.length }, (_, i) => i);
    const last = ramp.length - 1;
    const k2 = this.contrast;
    this.particles = pts.map((p) => {
      const t = Math.min(1, Math.max(0, (p.t - lo) / span));
      const s = t * (1 - k2) + t * t * (3 - 2 * t) * k2;
      return {
        hx: p.hx,
        hy: p.hy,
        x: p.hx,
        y: p.hy,
        vx: 0,
        vy: 0,
        g: this.rampFlat ? ramp[(Math.random() * ramp.length) | 0] : ramp[Math.round(s * last)],
        s,
      };
    });
  }

  setWindow(win: Win | null) {
    const full = !win || (win.top <= 0 && win.bottom >= this.h);
    this.win = full ? null : win;
    this.fullPaint = true;
    this.paint();
  }

  private inWindow(p: Particle) {
    const t = this.win;
    if (!t) return true;
    const r = Math.min(p.hy - t.top, t.bottom - p.hy) / Math.max(1, t.fade);
    return r >= 1 || (!(r <= 0) && hash(0.37 * p.hx, 0.53 * p.hy) < r * r * (3 - 2 * r));
  }

  settle() {
    for (const p of this.particles) {
      p.x = p.hx;
      p.y = p.hy;
      p.vx = 0;
      p.vy = 0;
    }
    this.fullPaint = true;
    this.paint();
  }

  setPointer(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
    this.pointer.active = true;
    this.wake();
  }

  clearPointer() {
    this.pointer.active = false;
    this.pointer.x = -9999;
    this.pointer.y = -9999;
    this.wake();
  }

  private update() {
    const { particles, radius, force, spring, friction } = this;
    const r2 = radius * radius;
    const { x: px, y: py, active } = this.pointer;
    let moving = false;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of particles) {
      const ox = p.x;
      const oy = p.y;
      if (active) {
        const dx = p.x - px;
        const dy = p.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < r2 && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const f = (1 - d / radius) * force;
          p.vx += (dx / d) * f * 0.14;
          p.vy += (dy / d) * f * 0.14;
        }
      }
      p.vx += (p.hx - p.x) * spring;
      p.vy += (p.hy - p.y) * spring;
      p.vx *= friction;
      p.vy *= friction;
      p.x += p.vx;
      p.y += p.vy;
      const ex = p.x - p.hx;
      const ey = p.y - p.hy;
      const e2 = ex * ex + ey * ey;
      if (e2 > 0.01 || p.x !== ox || p.y !== oy) {
        x0 = Math.min(x0, ox, p.x);
        x1 = Math.max(x1, ox, p.x);
        y0 = Math.min(y0, oy, p.y);
        y1 = Math.max(y1, oy, p.y);
      }
      if (!moving && (e2 > 1 || p.vx * p.vx + p.vy * p.vy > 0.04)) moving = true;
    }
    const d = this.dpr;
    this.dirty = x1 >= x0 ? { x0: x0 * d, y0: y0 * d, x1: x1 * d, y1: y1 * d } : null;
    if (moving) this.idleFrames = 0;
    else this.idleFrames++;
  }

  private paint() {
    const { ctx, atlas } = this;
    if (!atlas) return;
    const r = this.glyphPx();
    const half = r / 2;
    const d = this.dpr;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    let clip: Rect | null = null;
    if (!this.fullPaint) {
      const e = this.dirty;
      if (!e) return;
      const pad = r + 2;
      const nx0 = Math.max(0, Math.floor(e.x0 - pad));
      const ny0 = Math.max(0, Math.floor(e.y0 - pad));
      const nx1 = Math.min(cw, Math.ceil(e.x1 + pad));
      const ny1 = Math.min(ch, Math.ceil(e.y1 + pad));
      if (nx1 <= nx0 || ny1 <= ny0) return;
      if ((nx1 - nx0) * (ny1 - ny0) < cw * ch * 0.5) clip = { x0: nx0, y0: ny0, x1: nx1, y1: ny1 };
    }
    this.fullPaint = false;
    if (clip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(clip.x0, clip.y0, clip.x1 - clip.x0, clip.y1 - clip.y0);
      ctx.clip();
      ctx.clearRect(clip.x0, clip.y0, clip.x1 - clip.x0, clip.y1 - clip.y0);
    } else {
      ctx.clearRect(0, 0, cw, ch);
    }
    const top = this.win ? Math.floor(this.win.top * d) : 0;
    const bottom = this.win ? Math.ceil(this.win.bottom * d) : ch;
    const lx = clip ? clip.x0 - r : -Infinity;
    const ly = clip ? clip.y0 - r : -Infinity;
    const hx = clip ? clip.x1 + r : Infinity;
    const hy = clip ? clip.y1 + r : Infinity;
    for (const p of this.particles) {
      const x = p.x * d;
      const y = p.y * d;
      if (x < lx || x > hx || y < ly || y > hy || !this.inWindow(p)) continue;
      const gx = Math.round(x - half);
      const gy = Math.round(y - half);
      if (gx < 0 || gx + r > cw || gy < top || gy + r > bottom) continue;
      const row = p.s > 0.66 ? 2 : p.s > 0.33 ? 1 : 0;
      ctx.drawImage(atlas, p.g * r, row * r, r, r, gx, gy, r, r);
    }
    if (clip) ctx.restore();
  }

  private frame = () => {
    if (!this.running) return;
    this.update();
    this.paint();
    const stale = performance.now() - this.wokeAt > 6000 && !this.pointer.active;
    if (this.idleFrames > 24 || stale) {
      this.fullPaint = true;
      this.paint();
      this.running = false;
      cancelAnimationFrame(this.raf);
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  wake() {
    this.idleFrames = 0;
    this.wokeAt = performance.now();
    if (!this.running) {
      this.running = true;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy() {
    this.stop();
    this.particles = [];
    this.atlas = null;
    this.image = null;
  }
}
