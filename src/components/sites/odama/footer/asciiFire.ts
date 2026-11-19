/**
 * ASCII fire, ported from odama.io: a classic "doom fire" heat grid where every live cell is drawn
 * as a glyph picked from a per-band atlas. Rendering goes through a tiny WebGL2 pass when `gpu` is
 * set (one triangle, the grid uploaded as an RG texture) and falls back to 2D canvas `drawImage`.
 */

export type FirePalette = readonly string[];
export type FireTint = ReadonlyArray<readonly [number, string]>;

export const PALETTE_BLAZE: FirePalette = [
  "transparent",
  "rgba(170,0,0,0.72)",
  "rgba(224,0,0,0.88)",
  "rgba(255,8,8,0.97)",
  "rgba(255,48,48,1)",
  "rgba(255,132,132,1)",
];
export const PALETTE_FLAME: FirePalette = [
  "transparent",
  "rgba(255,96,96,0.30)",
  "rgba(255,72,72,0.45)",
  "rgba(255,48,48,0.62)",
  "rgba(255,1,1,0.78)",
  "rgba(255,0,0,0.90)",
  "rgba(244,0,0,1)",
];
export const PALETTE_FLAME_STRONG: FirePalette = [
  "transparent",
  "rgba(255,124,124,0.92)",
  "rgba(255,84,84,0.96)",
  "rgba(255,42,42,1)",
  "rgba(255,1,1,1)",
  "rgba(246,0,0,1)",
  "rgba(232,0,0,1)",
];
export const PALETTE_SCORCH: FirePalette = [
  "transparent",
  "rgba(156,14,14,0.62)",
  "rgba(158,8,8,0.82)",
  "rgba(152,2,2,0.94)",
  "rgba(124,0,0,1)",
  "rgba(86,0,0,1)",
];
export const PALETTE_SHADE: FirePalette = [
  "transparent",
  "rgba(255,255,255,0.34)",
  "rgba(255,255,255,0.4)",
  "rgba(255,255,255,0.46)",
  "rgba(255,255,255,0.52)",
  "rgba(255,255,255,0.58)",
];

/** Flame "plumes": the footer fire's column envelope. */
export const PLUMES = (x: number) => 0.7 + 0.3 * Math.abs(Math.sin(6.7 * x + 0.8) * Math.cos(2.9 * x - 0.5));

let cachedFont = "";
export function asciiFont(): string {
  if (cachedFont) return cachedFont;
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  if (v) cachedFont = v;
  return v || '"Geist Pixel", ui-monospace, monospace';
}

function fillGlyphInBox(ctx: CanvasRenderingContext2D, glyph: string, x: number, y: number, size: number) {
  const half = Math.round(size / 2);
  const m = ctx.measureText(glyph);
  const w = m.actualBoundingBoxLeft !== undefined ? m.actualBoundingBoxLeft + m.actualBoundingBoxRight : m.width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  if (w > size) {
    ctx.translate(x + half, y + half);
    ctx.scale(size / w, 1);
    ctx.fillText(glyph, 0, 0);
  } else {
    ctx.fillText(glyph, x + half, y + half);
  }
  ctx.restore();
}

function whenAsciiFontReady(cb: () => void) {
  if (typeof document === "undefined" || !document.fonts) return;
  const family = asciiFont().split(",")[0].trim();
  try {
    if (family && document.fonts.check(`16px ${family}`)) return;
  } catch {
    /* ignore */
  }
  void document.fonts.ready.then(() => requestAnimationFrame(cb));
}

const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uGrid;
uniform sampler2D uAtlas;
uniform sampler2D uTint;
uniform int uCell;
uniform float uHeight;
uniform bool uTinted;
out vec4 outColor;
void main() {
  ivec2 px = ivec2(int(gl_FragCoord.x), int(uHeight - gl_FragCoord.y));
  ivec2 c = px / uCell;
  vec2 g = texelFetch(uGrid, c, 0).rg * 255.0 + 0.5;
  int band = int(g.y);
  if (band == 0) {
    outColor = vec4(0.0);
    return;
  }
  vec4 d = texelFetch(uAtlas, ivec2(int(g.x), band) * uCell + (px - c * uCell), 0);
  if (uTinted) {
    vec4 t = texelFetch(uTint, ivec2(0, px.y), 0);
    d = t * d.a + d * (1.0 - t.a);
  }
  outColor = d;
}`;

class GpuPainter {
  private prog: WebGLProgram | null = null;
  private grid: WebGLTexture | null = null;
  private atlas: WebGLTexture | null = null;
  private tint: WebGLTexture | null = null;
  private uCell: WebGLUniformLocation | null = null;
  private uHeight: WebGLUniformLocation | null = null;
  private uTinted: WebGLUniformLocation | null = null;
  private atlasSrc: HTMLCanvasElement | null = null;
  private tintSrc: HTMLCanvasElement | null = null;
  private atlasDirty = false;
  private tintDirty = false;
  private gridCols = 0;
  private gridRows = 0;
  private lost = false;

  static create(canvas: HTMLCanvasElement): GpuPainter | null {
    const gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl || gl.isContextLost()) return null;
    const p = new GpuPainter(canvas, gl);
    return p.prog ? p : null;
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    private gl: WebGL2RenderingContext,
  ) {
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
    this.init();
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.lost = true;
  };

  private onRestored = () => {
    this.lost = false;
    this.init();
  };

  private init() {
    const { gl } = this;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      gl.deleteProgram(prog);
      this.prog = null;
      return;
    }
    this.prog = prog;
    gl.useProgram(prog);
    gl.uniform1i(gl.getUniformLocation(prog, "uGrid"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "uAtlas"), 1);
    gl.uniform1i(gl.getUniformLocation(prog, "uTint"), 2);
    this.uCell = gl.getUniformLocation(prog, "uCell");
    this.uHeight = gl.getUniformLocation(prog, "uHeight");
    this.uTinted = gl.getUniformLocation(prog, "uTinted");
    const tex = (unit: number) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    this.grid = tex(0);
    this.atlas = tex(1);
    this.tint = tex(2);
    this.gridCols = 0;
    this.gridRows = 0;
    this.atlasDirty = !!this.atlasSrc;
    this.tintDirty = !!this.tintSrc;
  }

  setAtlas(c: HTMLCanvasElement) {
    this.atlasSrc = c;
    this.atlasDirty = true;
  }

  setTint(c: HTMLCanvasElement) {
    this.tintSrc = c;
    this.tintDirty = true;
  }

  private upload(unit: number, tex: WebGLTexture | null, src: HTMLCanvasElement) {
    const { gl } = this;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  draw(cells: Uint8Array, cols: number, rows: number, cell: number) {
    const { gl, canvas } = this;
    if (this.lost || !this.prog || !this.atlasSrc) return;
    gl.useProgram(this.prog);
    if (this.atlasDirty) {
      this.upload(1, this.atlas, this.atlasSrc);
      this.atlasDirty = false;
    }
    if (this.tintDirty) {
      if (this.tintSrc) this.upload(2, this.tint, this.tintSrc);
      this.tintDirty = false;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.grid);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (cols !== this.gridCols || rows !== this.gridRows) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, cols, rows, 0, gl.RG, gl.UNSIGNED_BYTE, cells);
      this.gridCols = cols;
      this.gridRows = rows;
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RG, gl.UNSIGNED_BYTE, cells);
    }
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.uniform1i(this.uCell, cell);
    gl.uniform1f(this.uHeight, canvas.height);
    gl.uniform1i(this.uTinted, this.tintSrc ? 1 : 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  clear() {
    const { gl } = this;
    if (this.lost) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  dispose() {
    const { gl } = this;
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    if (!this.lost) {
      gl.deleteTexture(this.grid);
      gl.deleteTexture(this.atlas);
      gl.deleteTexture(this.tint);
      gl.deleteProgram(this.prog);
    }
    this.prog = null;
    this.atlasSrc = null;
    this.tintSrc = null;
    // The context is left alive on purpose: a remount (React StrictMode) reuses this canvas.
  }
}

export interface AsciiFireOptions {
  cell?: number;
  glyphs?: string;
  glyphRamp?: number;
  palette: FirePalette;
  coverage?: number;
  decay?: number;
  spread?: number;
  fps?: number;
  intensity?: number;
  seed?: number;
  maxDpr?: number;
  shape?: (x: number) => number;
  tint?: FireTint | null;
  gpu?: boolean;
}

interface Emitter {
  x: number;
  y: number;
  r: number;
  level: number;
}

const MAX_HEAT = 36;

export class AsciiFire {
  intensity: number;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private gpu: GpuPainter | null = null;
  private cells = new Uint8Array(0);
  private atlas: HTMLCanvasElement | null = null;
  private fontWatched = false;
  private cols = 0;
  private rows = 0;
  private grid = new Uint8Array(0);
  private glyphIdx = new Uint8Array(0);
  private noise = new Float32Array(0);
  private rowBuf = new Uint8Array(0);
  private rowHits = new Uint8Array(0);
  private cell: number;
  private cellDev = 1;
  private cellPx = 1;
  private glyphs: string;
  private glyphRamp: number;
  private palette: FirePalette;
  private coverage: number;
  private decay: number;
  private spread: number;
  private stepMs: number;
  private seedBase: number;
  private shape: (x: number) => number;
  private maxDpr: number;
  private tint: FireTint | null;
  private tintFill: CanvasGradient | null = null;
  private emit: Emitter | null = null;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  private t = 0;
  private wind = 0;
  private ratioQuery: MediaQueryList | null = null;
  private ratioRaf = 0;

  constructor(canvas: HTMLCanvasElement, o: AsciiFireOptions) {
    this.canvas = canvas;
    if (o.gpu) this.gpu = GpuPainter.create(canvas);
    if (!this.gpu) {
      const ctx = canvas.getContext("2d", { alpha: true });
      if (!ctx) throw new Error("2d context unavailable");
      this.ctx = ctx;
    }
    this.cell = o.cell ?? 9;
    this.glyphs = o.glyphs ?? "/\\|:.,;+=*#%@$SWRDLY10<>^~-";
    this.glyphRamp = Math.min(1, Math.max(0, o.glyphRamp ?? 0));
    this.palette = o.palette;
    this.coverage = o.coverage ?? 0.86;
    this.decay = o.decay ?? 1;
    this.spread = Math.min(1, Math.max(0, o.spread ?? 1));
    this.stepMs = 1000 / (o.fps ?? 24);
    this.intensity = o.intensity ?? 1;
    this.seedBase = o.seed ?? 1;
    this.shape = o.shape ?? (() => 1);
    this.maxDpr = o.maxDpr ?? 1.5;
    this.tint = o.tint ?? null;
  }

  private buildAtlas() {
    const size = this.cellDev;
    const c = document.createElement("canvas");
    c.width = size * this.glyphs.length;
    c.height = size * this.palette.length;
    const ctx = c.getContext("2d")!;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `400 ${Math.max(1, Math.round(size * 1.06))}px ${asciiFont()}`;
    for (let b = 0; b < this.palette.length; b++) {
      ctx.fillStyle = this.palette[b];
      for (let g = 0; g < this.glyphs.length; g++) fillGlyphInBox(ctx, this.glyphs[g], g * size, b * size, size);
    }
    this.atlas = c;
    this.gpu?.setAtlas(c);
    if (!this.fontWatched) {
      this.fontWatched = true;
      whenAsciiFontReady(() => {
        if (this.atlas) this.buildAtlas();
      });
    }
  }

  resize(w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    const zoom = window.visualViewport?.scale || 1;
    this.dpr = Math.min(this.maxDpr, (window.devicePixelRatio || 1) * zoom);
    this.cssW = w;
    this.cssH = h;
    this.cellDev = Math.max(1, Math.round(this.cell * this.dpr));
    this.cellPx = this.cellDev / this.dpr;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.cols = Math.max(1, Math.ceil(w / this.cellPx));
    this.rows = Math.max(1, Math.ceil(h / this.cellPx));
    const n = this.cols * this.rows;
    this.grid = new Uint8Array(n);
    this.glyphIdx = new Uint8Array(n);
    this.noise = new Float32Array(this.cols);
    this.rowBuf = new Uint8Array(this.cols);
    this.rowHits = new Uint8Array(this.cols);
    if (this.gpu) this.cells = new Uint8Array(2 * n);
    let s = this.seedBase >>> 0;
    const rnd = () => (s = (1664525 * s + 0x3c6ef35f) >>> 0) / 0x100000000;
    for (let i = 0; i < n; i++) this.glyphIdx[i] = (256 * rnd()) | 0;
    for (let i = 0; i < this.cols; i++) this.noise[i] = rnd();
    this.buildAtlas();
    this.buildTint();
    if (this.ctx) this.ctx.imageSmoothingEnabled = false;
    this.watchRatio();
  }

  private buildTint() {
    if (!this.tint) return;
    if (this.gpu) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = this.canvas.height;
      const ctx = c.getContext("2d")!;
      const g = ctx.createLinearGradient(0, c.height, 0, 0);
      for (const [stop, col] of this.tint) g.addColorStop(stop, col);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 1, c.height);
      this.gpu.setTint(c);
      return;
    }
    if (!this.ctx) return;
    const g = this.ctx.createLinearGradient(0, this.canvas.height, 0, 0);
    for (const [stop, col] of this.tint) g.addColorStop(stop, col);
    this.tintFill = g;
  }

  private onRatio = () => {
    if (this.ratioRaf) return;
    this.ratioRaf = requestAnimationFrame(() => {
      this.ratioRaf = 0;
      if (this.cssW > 0 && this.cssH > 0) this.resize(this.cssW, this.cssH);
    });
  };

  private watchRatio() {
    this.ratioQuery?.removeEventListener("change", this.onRatio);
    this.ratioQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.ratioQuery.addEventListener("change", this.onRatio);
  }

  setPalette(p: FirePalette) {
    if (p === this.palette) return;
    this.palette = p;
    if (this.cols) this.buildAtlas();
  }

  /** A moving heat source in CSS px relative to the canvas. */
  setEmitter(x: number, y: number, r: number, level = 1) {
    this.emit = { x: x / this.cellPx, y: y / this.cellPx, r: Math.max(0.7, r / this.cellPx), level };
  }

  clearEmitter() {
    this.emit = null;
  }

  private step() {
    if (!this.cols || !this.rows) return;
    this.t += 1;
    this.seedFloor();
    this.propagate();
    this.stamp();
    this.shimmer();
  }

  private seedFloor() {
    const { cols, rows, grid } = this;
    const heat = MAX_HEAT * Math.min(1, Math.max(0, this.intensity));
    const base = (rows - 1) * cols;
    for (let x = 0; x < cols; x++) {
      const flicker = 0.55 + 0.45 * Math.sin(0.09 * this.t + 12 * this.noise[x]) * Math.cos(0.031 * this.t + 0.21 * x);
      const env = this.shape(cols > 1 ? x / (cols - 1) : 0.5);
      const on = this.noise[x] < this.coverage * env;
      grid[base + x] = on ? Math.max(0, (heat * flicker * env) | 0) : 0;
    }
  }

  private stamp() {
    const em = this.emit;
    if (!em) return;
    const { cols, rows, grid } = this;
    const heat = MAX_HEAT * Math.min(1, Math.max(0, this.intensity)) * em.level;
    const r = em.r;
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor(em.x - r));
    const x1 = Math.min(cols - 1, Math.ceil(em.x + r));
    const y0 = Math.max(0, Math.floor(em.y - r));
    const y1 = Math.min(rows - 1, Math.ceil(em.y + r));
    for (let y = y0; y <= y1; y++) {
      const row = y * cols;
      const dy = y + 0.5 - em.y;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - em.x;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const v = (heat * Math.sqrt(1 - d2 / r2) * (0.62 + 0.38 * Math.random())) | 0;
        if (v > grid[row + x]) grid[row + x] = v;
      }
    }
  }

  private propagate() {
    const { cols, rows, grid, rowBuf, rowHits } = this;
    const wind = this.wind;
    const lo = 0;
    const hi = cols - 1;
    for (let y = rows - 2; y >= 0; y--) {
      const row = y * cols;
      const below = row + cols;
      rowHits.fill(0, lo, hi + 1);
      for (let x = 0; x <= cols - 1; x++) {
        const v = grid[below + x];
        if (v === 0) continue;
        const dx = this.spread >= 1 || Math.random() < this.spread ? ((3 * Math.random()) | 0) - 1 : 0;
        const cool = dx === 0 ? 1 : Math.random() < 0.5 ? 0 : 2;
        let tx = x + dx + wind;
        if (tx < lo) tx = lo;
        else if (tx > hi) tx = hi;
        const nv = v - (cool & this.decay);
        const hits = ++rowHits[tx];
        if (hits === 1 || Math.random() * hits < 1) rowBuf[tx] = nv > 0 ? nv : 0;
      }
      for (let x = lo; x <= hi; x++) {
        if (rowHits[x]) grid[row + x] = rowBuf[x];
        else if (grid[below + x] === 0) grid[row + x] = 0;
      }
    }
  }

  private shimmer() {
    const n = (this.cols * this.rows) >> 5;
    for (let i = 0; i < n; i++) {
      const k = (Math.random() * this.glyphIdx.length) | 0;
      this.glyphIdx[k] = (256 * Math.random()) | 0;
    }
  }

  private glyphFor(heat: number, idx: number, count: number) {
    const r = this.glyphIdx[idx] / 256;
    let g = ((this.glyphRamp ? heat / MAX_HEAT + (r - 0.5) * (1 - this.glyphRamp) : r) * count) | 0;
    if (g >= count) g = count - 1;
    else if (g < 0) g = 0;
    return g;
  }

  private paint() {
    const { cols, rows, grid } = this;
    const bands = this.palette.length;
    const count = this.glyphs.length;
    if (this.gpu) {
      if (!this.atlas) return;
      const cells = this.cells;
      for (let i = 0, n = cols * rows; i < n; i++) {
        const v = grid[i];
        let band = 0;
        let g = 0;
        if (v >= 2) {
          band = ((v / MAX_HEAT) * bands) | 0;
          if (band >= bands) band = bands - 1;
          if (band !== 0) g = this.glyphFor(v, i, count);
        }
        cells[2 * i] = g;
        cells[2 * i + 1] = band;
      }
      this.gpu.draw(cells, cols, rows, this.cellDev);
      return;
    }
    const ctx = this.ctx;
    const atlas = this.atlas;
    if (!ctx || !atlas) return;
    const s = this.cellDev;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (let y = 0; y < rows; y++) {
      const row = y * cols;
      for (let x = 0; x < cols; x++) {
        const v = grid[row + x];
        if (v < 2) continue;
        let band = ((v / MAX_HEAT) * bands) | 0;
        if (band >= bands) band = bands - 1;
        if (band === 0) continue;
        const g = this.glyphFor(v, row + x, count);
        ctx.drawImage(atlas, g * s, band * s, s, s, x * s, y * s, s, s);
      }
    }
    if (this.tintFill) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = this.tintFill;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private frame = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (!this.last) this.last = now;
    this.acc += now - this.last;
    this.last = now;
    if (this.acc < this.stepMs) return;
    let steps = Math.min(3, Math.floor(this.acc / this.stepMs));
    this.acc -= steps * this.stepMs;
    while (steps-- > 0) this.step();
    this.paint();
  };

  start() {
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  clear() {
    this.grid.fill(0);
    this.emit = null;
    this.gpu?.clear();
    this.ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    this.stop();
    cancelAnimationFrame(this.ratioRaf);
    this.ratioRaf = 0;
    this.ratioQuery?.removeEventListener("change", this.onRatio);
    this.ratioQuery = null;
    this.atlas = null;
    this.gpu?.dispose();
    this.gpu = null;
  }
}
