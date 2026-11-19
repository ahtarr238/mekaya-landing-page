import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  LinearSRGBColorSpace,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  Vector4,
  WebGLRenderer,
  type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { HANDS, buildShapes, isHand, type ShapeName } from "./voxelShapes";

/**
 * The voxel figure of the pricing stage (a trimmed port of odama.io's "service scene"):
 * a hand made of small cubes pushes (or pinches) the first plan card, then the cubes
 * morph into a "?" that dissolves upward before the FAQ streams in.
 *
 * The camera frustum is laid out over `box` (the left column of the stage) while the
 * renderer draws into `canvas`, which covers the whole sticky stage.
 */

export type ClipRect = readonly [number, number, number, number];

export interface VoxelScene {
  show(name: ShapeName): void;
  appear(v: number): void;
  dissolve(on: boolean): void;
  follow(x: number | null, y?: number): void;
  touch(): [number, number] | null;
  clip(rects: ClipRect[], radius: number): void;
  run(on: boolean): void;
  destroy(): void;
}

interface Options {
  reduced: boolean;
  start: ShapeName;
  appear?: number;
  onDissolved?: (gone: boolean) => void;
}

const LIGHTS = [
  { color: 0xffffff, intensity: 5.6, position: [-1.4, 7, -1.4] },
  { color: 0x7fa8ff, intensity: 1.1, position: [6, 0.5, 2] },
  { color: 0xffffff, intensity: 2.8, position: [-3, 2, -6] },
] as const;
const SHADE_DIR = new Vector3(-0.55, 1, 0.25).normalize();
const REST_POSE = new Euler(-0.3, -0.34, -0.1, "XYZ");

const easeInOutCubic = (e: number) => (e < 0.5 ? 4 * e * e * e : 1 - Math.pow(-2 * e + 2, 3) / 2);

/** Morton code helper used to pair voxels of two shapes by spatial order. */
const spread = (v: number) => {
  let e = v & 1023;
  e = (e | (e << 16)) & 0x30000ff;
  e = (e | (e << 8)) & 0x300f00f;
  e = (e | (e << 4)) & 0x30c30c3;
  e = (e | (e << 2)) & 0x9249249;
  return e;
};

function mortonOrder(box: Float32Array, n: number) {
  const q = (v: number) => Math.round(1023 * Math.min(1, Math.max(0, (v + 2) / 4)));
  const code = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = q((box[6 * i] + box[6 * i + 3]) / 2);
    const y = q((box[6 * i + 1] + box[6 * i + 4]) / 2);
    const z = q((box[6 * i + 2] + box[6 * i + 5]) / 2);
    code[i] = (spread(x) | (spread(y) << 1) | (spread(z) << 2)) >>> 0;
  }
  return Array.from({ length: n }, (_, i) => i).sort((a, b) => code[a] - code[b]);
}

/** Splits box `index` of `src` into `parts` sub-boxes written to `dst` from slot `at`. */
function subdivide(src: Float32Array, index: number, parts: number, dst: Float32Array, at: number) {
  const r = 6 * index;
  if (parts === 1) {
    dst.set(src.subarray(r, r + 6), 6 * at);
    return;
  }
  const size = [src[r + 3] - src[r], src[r + 4] - src[r + 1], src[r + 5] - src[r + 2]];
  const cell = Math.cbrt(Math.max(1e-9, size[0] * size[1] * size[2]) / parts);
  const cuts = size.map((s) => Math.max(1, Math.round(s / cell)));
  while (cuts[0] * cuts[1] * cuts[2] < parts) {
    const axis = [0, 1, 2].reduce((best, t) => (size[t] / cuts[t] > size[best] / cuts[best] ? t : best), 0);
    cuts[axis]++;
  }
  const total = cuts[0] * cuts[1] * cuts[2];
  for (let p = 0; p < parts; p++) {
    const from = Math.floor((p * total) / parts);
    const to = Math.floor(((p + 1) * total) / parts) - 1;
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (let c = from; c <= to; c++) {
      const cell3 = [c % cuts[0], Math.floor(c / cuts[0]) % cuts[1], Math.floor(c / (cuts[0] * cuts[1]))];
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], src[r + a] + (cell3[a] * size[a]) / cuts[a]);
        hi[a] = Math.max(hi[a], src[r + a] + ((cell3[a] + 1) * size[a]) / cuts[a]);
      }
    }
    const d = (at + p) * 6;
    dst[d] = lo[0];
    dst[d + 1] = lo[1];
    dst[d + 2] = lo[2];
    dst[d + 3] = hi[0];
    dst[d + 4] = hi[1];
    dst[d + 5] = hi[2];
  }
}

export function createVoxelScene(canvas: HTMLCanvasElement, box: HTMLElement, options: Options): VoxelScene {
  const { reduced, start, onDissolved } = options;
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envMap: Texture = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = envMap;
  scene.environmentIntensity = 0.35;
  for (const l of LIGHTS) {
    const light = new DirectionalLight(l.color, l.intensity);
    light.position.set(l.position[0], l.position[1], l.position[2]);
    scene.add(light);
  }
  const camera = new PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(0, 0, 5.6);
  const group = new Group();
  scene.add(group);

  const shapes = buildShapes();
  const maxN = Math.max(...[...shapes.values()].map((s) => s.n));

  // "Silver mate" from the source GLB, plus its shading tweaks: baked per-voxel light,
  // a soft top-to-bottom falloff, a warm glow on faces that look down, and clipping
  // against the plan cards so cubes seem to come out from behind them.
  const material = new MeshStandardMaterial({ metalness: 0.19, roughness: 0.64, side: DoubleSide });
  material.color.setRGB(0.4705, 0.4705, 0.4705, LinearSRGBColorSpace);
  const clipUniforms = {
    uClip: { value: [new Vector4(), new Vector4(), new Vector4()] },
    uClipN: { value: 0 },
    uClipR: { value: 0 },
  };
  material.customProgramCacheKey = () => "odama-voxel";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uUnderNear = { value: new Color(0xc94a4a) };
    shader.uniforms.uUnderFar = { value: new Color(0x2a0e0e) };
    shader.uniforms.uUnderGlow = { value: 0.45 };
    shader.uniforms.uShade = { value: new Vector4(SHADE_DIR.x, SHADE_DIR.y, SHADE_DIR.z, 2.2) };
    shader.uniforms.uShadeLow = { value: 0.1 };
    Object.assign(shader.uniforms, clipUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vUnderT;\nvarying float vShadeT;\nuniform vec4 uShade;\nattribute float aFront;\nvarying float vFront;\nattribute float aLit;\nvarying float vLit;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vFront = aFront;
        vLit = aLit;
        {
          #ifdef USE_INSTANCING
            mat3 uM = mat3(modelMatrix) * mat3(instanceMatrix);
            vec4 uW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #else
            mat3 uM = mat3(modelMatrix);
            vec4 uW = modelMatrix * vec4(transformed, 1.0);
          #endif
          float uOff = (uM * position).z;
          float uExt = 0.5 * (abs(uM[0].z) + abs(uM[1].z) + abs(uM[2].z));
          vUnderT = clamp(0.5 + 0.5 * uOff / max(uExt, 1e-4), 0.0, 1.0);
          vShadeT = clamp(0.5 + dot(uW.xyz, uShade.xyz) / uShade.w, 0.0, 1.0);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying float vUnderT;\nvarying float vShadeT;\nuniform vec3 uUnderNear;\nuniform vec3 uUnderFar;\nuniform float uUnderGlow;\nuniform float uShadeLow;\nvarying float vFront;\nvarying float vLit;\nuniform vec4 uClip[3];\nuniform int uClipN;\nuniform float uClipR;",
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
        if (vFront < 0.5) {
          for (int i = 0; i < 3; i++) {
            if (i >= uClipN) break;
            vec4 r = uClip[i];
            vec2 q = abs(gl_FragCoord.xy - (r.xy + r.zw * 0.5)) - r.zw * 0.5 + uClipR;
            if (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uClipR < 0.0) discard;
          }
        }`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb *= mix(uShadeLow, 1.0, smoothstep(0.0, 1.0, vShadeT));
        diffuseColor.rgb *= vLit;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          vec3 uWn = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float uDown = smoothstep(0.35, 0.85, -uWn.y);
          float uT = vUnderT * vUnderT * (3.0 - 2.0 * vUnderT);
          totalEmissiveRadiance += uDown * uUnderGlow * mix(uUnderFar, uUnderNear, uT);
        }`,
      );
  };

  const geometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.07);
  const front = new InstancedBufferAttribute(new Float32Array(maxN), 1);
  const litAttr = new InstancedBufferAttribute(new Float32Array(maxN).fill(1), 1);
  geometry.setAttribute("aFront", front);
  geometry.setAttribute("aLit", litAttr);
  const mesh = new InstancedMesh(geometry, material, maxN);
  mesh.frustumCulled = false;
  group.add(mesh);

  // --- voxel state ------------------------------------------------------------------
  const startSet = shapes.get(start)!;
  let current: ShapeName = start; // shape the voxels rest in
  let requested: ShapeName = start;
  let morphing = false;
  let morphTo: ShapeName = start;
  const cur = new Float32Array(6 * maxN);
  cur.set(startSet.box);
  let count = startSet.n;
  const lit = new Float32Array(maxN).fill(1);
  if (startSet.lit) lit.set(startSet.lit);
  let gap = 0.04;

  const from = new Float32Array(6 * maxN);
  const to = new Float32Array(6 * maxN);
  const seed = new Float32Array(maxN);
  const arc = new Float32Array(maxN);
  const litFrom = new Float32Array(maxN);
  const litTo = new Float32Array(maxN);
  const vel = new Float32Array(3 * maxN);
  const carry = new Float32Array(3 * maxN);
  let morphN = 0;
  let stagger = 0.45;
  let morphT = 0;
  let reanchor = false;

  const beginMorph = (target: ShapeName) => {
    if (isHand(morphing ? morphTo : current) !== isHand(target)) reanchor = true;
    const set = shapes.get(target)!;
    const a = set.box;
    const n = set.n;
    const o = count;
    const srcOrder = mortonOrder(cur, o);
    const dstOrder = mortonOrder(a, n);
    morphN = Math.max(o, n);
    const grow = n >= o;
    const tLit = set.lit;
    const keep = (slot: number, srcIndex: number) => {
      for (let k = 0; k < 3; k++) carry[3 * slot + k] = morphing ? vel[3 * srcIndex + k] : 0;
    };
    stagger = morphing ? 0.12 : 0.45;
    for (let e = 0; e < morphN; ) {
      const pick = (i: number) => (grow ? srcOrder[Math.floor((i * o) / morphN)] : dstOrder[Math.floor((i * n) / morphN)]);
      const u = pick(e);
      let c = e + 1;
      while (c < morphN && pick(c) === u) c++;
      if (grow) subdivide(cur, u, c - e, from, e);
      else subdivide(a, u, c - e, to, e);
      for (let t = e; t < c; t++) {
        if (grow) {
          const d = dstOrder[Math.floor((t * n) / morphN)];
          to.set(a.subarray(6 * d, 6 * d + 6), 6 * t);
          litFrom[t] = lit[u];
          litTo[t] = tLit ? tLit[d] : 1;
          keep(t, u);
        } else {
          const s = srcOrder[Math.floor((t * o) / morphN)];
          from.set(cur.subarray(6 * s, 6 * s + 6), 6 * t);
          litFrom[t] = lit[s];
          litTo[t] = tLit ? tLit[u] : 1;
          keep(t, s);
        }
        seed[t] = Math.random();
        arc[t] = 0.6 + 0.8 * Math.random();
      }
      e = c;
    }
    morphTo = target;
    morphT = 0;
    morphing = true;
  };

  const stepMorph = (dt: number) => {
    const ref = morphT === 0 ? from : cur;
    const a = Math.max(1, dt);
    morphT = Math.min(1, morphT + dt / 1100);
    const drift = 180 * (1 - Math.exp(-(1100 * morphT) / 180));
    for (let e = 0; e < morphN; e++) {
      const o = easeInOutCubic(Math.min(1, Math.max(0, (morphT - seed[e] * stagger) / (1 - stagger))));
      const r = 6 * e;
      const px = ref[r] + ref[r + 3];
      const py = ref[r + 1] + ref[r + 4];
      const pz = ref[r + 2] + ref[r + 5];
      for (let t = 0; t < 6; t++) cur[r + t] = from[r + t] + (to[r + t] - from[r + t]) * o + carry[3 * e + (t % 3)] * drift * (1 - o);
      lit[e] = litFrom[e] + (litTo[e] - litFrom[e]) * o;
      const hx = (to[r] + to[r + 3] - from[r] - from[r + 3]) / 2;
      const hy = (to[r + 1] + to[r + 4] - from[r + 1] - from[r + 4]) / 2;
      const bump = 0.55 * Math.sin(Math.PI * o) * arc[e] * Math.min(1, Math.hypot(hx, hy) + 0.15);
      cur[r + 2] += bump;
      cur[r + 5] += bump;
      vel[3 * e] = (cur[r] + cur[r + 3] - px) / 2 / a;
      vel[3 * e + 1] = (cur[r + 1] + cur[r + 4] - py) / 2 / a;
      vel[3 * e + 2] = (cur[r + 2] + cur[r + 5] - pz) / 2 / a;
    }
    count = morphN;
    gap = 0.04;
    if (morphT >= 1) {
      morphing = false;
      current = morphTo;
    }
  };

  // --- layout -------------------------------------------------------------------------
  let cssW = 0;
  let cssH = 0;
  let boxW = 0;
  let boxH = 0;
  let viewKey = "";
  const measure = () => {
    const a = canvas.getBoundingClientRect();
    const n = box.getBoundingClientRect();
    if (!a.width || !a.height || !n.width || !n.height) return;
    if (a.width !== cssW || a.height !== cssH) {
      cssW = a.width;
      cssH = a.height;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(cssW, cssH, false);
    }
    boxW = n.width;
    boxH = n.height;
    const key = [n.width, n.height, a.left - n.left, a.top - n.top, cssW, cssH].map(Math.round).join();
    if (key !== viewKey) {
      viewKey = key;
      camera.aspect = n.width / n.height;
      camera.setViewOffset(n.width, n.height, a.left - n.left, a.top - n.top, cssW, cssH);
      camera.updateProjectionMatrix();
    }
  };
  const resizer = new ResizeObserver(measure);
  resizer.observe(canvas);
  resizer.observe(box);
  measure();

  // --- per-frame ----------------------------------------------------------------------
  const rest = new Quaternion().setFromEuler(REST_POSE);
  const poses = new Map(Object.entries(HANDS).map(([k, v]) => [k, new Quaternion().setFromEuler(v.pose)]));
  const pose = rest.clone();
  const lean = new Quaternion();
  const leanEuler = new Euler();
  const spinQ = new Quaternion();
  const up = new Vector3(0, 1, 0);
  let spin = 0;
  let followAt: [number, number] | null = null;
  let touchAt: [number, number] | null = null;
  const target = new Vector3();
  const anchor = new Vector3();
  const touchV = new Vector3();
  const inv = new Quaternion();
  const shift = new Vector3();
  let clipRects: ClipRect[] = [];
  let clipRadius = 0;

  let appearTarget = Math.min(1, Math.max(0, options.appear ?? 1));
  let appearNow = appearTarget;
  let dissolveOn = false;
  let dissolveNow = 0;
  let dissolved = false;
  const rand = new Float32Array(8 * maxN).map(() => Math.random());

  const m4 = new Matrix4();
  const pos = new Vector3();
  const size = new Vector3();
  const rot = new Quaternion();
  const axis = new Vector3();
  const offset = new Vector3();
  const unrot = new Quaternion();
  const ident = new Quaternion();

  const writeInstances = () => {
    const shape = morphing ? morphTo : current;
    const pinch = shape === "Pinch";
    const hand = isHand(shape);
    for (let e = 0; e < count; e++) {
      front.array[e] = pinch && (cur[6 * e + 2] + cur[6 * e + 5]) / 2 > 0.01 ? 1 : 0;
      litAttr.array[e] = lit[e];
    }
    front.needsUpdate = true;
    litAttr.needsUpdate = true;
    const app = appearNow;
    const dis = dissolveNow;
    if (app >= 1 && dis <= 0) {
      for (let e = 0; e < count; e++) {
        const b = 6 * e;
        const w = cur[b + 3] - cur[b];
        const h = cur[b + 4] - cur[b + 1];
        const d = cur[b + 5] - cur[b + 2];
        pos.set((cur[b] + cur[b + 3]) / 2, (cur[b + 1] + cur[b + 4]) / 2, (cur[b + 2] + cur[b + 5]) / 2);
        const inset = Math.min(w, h, d) * gap;
        size.set(Math.max(1e-4, w - inset), Math.max(1e-4, h - inset), Math.max(1e-4, d - inset));
        mesh.setMatrixAt(e, m4.compose(pos, ident, size));
      }
    } else {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let e = 0; e < count; e++) {
        const x = (cur[6 * e] + cur[6 * e + 3]) / 2;
        const y = (cur[6 * e + 1] + cur[6 * e + 4]) / 2;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      unrot.copy(group.quaternion).invert();
      for (let l = 0; l < count; l++) {
        const s = 6 * l;
        const h8 = 8 * l;
        const w = cur[s + 3] - cur[s];
        const h = cur[s + 4] - cur[s + 1];
        const d = cur[s + 5] - cur[s + 2];
        const inset = Math.min(w, h, d) * gap;
        let scale = 1;
        let turn = 0;
        offset.set(0, 0, 0);
        if (app < 1) {
          const tx = (cur[s] + cur[s + 3] - 2 * minX) / 2 / (maxX - minX || 1);
          const r = Math.min(1, Math.max(0, (app - (0.6 * (hand ? 1 - tx : tx) + 0.4 * rand[h8]) * 0.6) / 0.4));
          const i = 1 - Math.pow(1 - r, 3);
          offset.set(2.4 + 1.4 * rand[h8 + 1], (rand[h8 + 2] - 0.5) * 1.4, (rand[h8 + 3] - 0.5) * 1.4);
          offset.multiplyScalar(1 - i);
          offset.y += 0.5 * Math.sin(Math.PI * i) * rand[h8 + 4];
          scale *= easeInOutCubic(Math.min(1, r / 0.3));
          turn += (1 - i) * 2.5 * (0.5 + rand[h8 + 5]);
        }
        if (dis > 0) {
          const ty = (cur[s + 1] + cur[s + 4] - 2 * minY) / 2 / (maxY - minY || 1);
          const e = Math.min(1, Math.max(0, (dis - (0.65 * (1 - ty) + 0.35 * rand[h8 + 6]) * 0.55) / 0.45));
          const a = e * e;
          offset.x += (rand[h8 + 1] - 0.5) * 0.8 * a;
          offset.y += 0.9 * (0.6 + rand[h8 + 7]) * a;
          offset.z += (rand[h8 + 3] - 0.3) * 0.4 * a;
          scale *= 1 - easeInOutCubic(Math.min(1, Math.max(0, (e - 0.1) / 0.9)));
          turn += a * (0.5 + rand[h8 + 5]);
        }
        offset.applyQuaternion(unrot);
        pos.set(
          (cur[s] + cur[s + 3]) / 2 + offset.x,
          (cur[s + 1] + cur[s + 4]) / 2 + offset.y,
          (cur[s + 2] + cur[s + 5]) / 2 + offset.z,
        );
        size.set(Math.max(1e-4, (w - inset) * scale), Math.max(1e-4, (h - inset) * scale), Math.max(1e-4, (d - inset) * scale));
        axis.set(rand[h8 + 2] - 0.5, rand[h8 + 4] - 0.5, rand[h8 + 7] - 0.5).normalize();
        rot.setFromAxisAngle(axis, turn * Math.PI);
        mesh.setMatrixAt(l, m4.compose(pos, rot, size));
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  };

  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(64, now - last) : 16.7;
    last = now;
    measure();

    if (reduced) {
      morphing = false;
      if (current !== requested) {
        const set = shapes.get(requested)!;
        cur.set(set.box);
        count = set.n;
        lit.fill(1);
        if (set.lit) lit.set(set.lit);
        reanchor = isHand(current) !== isHand(requested);
        current = requested;
      }
    } else if (morphing) {
      if (requested !== morphTo) beginMorph(requested);
      stepMorph(dt);
    } else if (requested !== current) {
      beginMorph(requested);
      stepMorph(dt);
    }

    const shape = morphing ? morphTo : current;
    spin *= Math.exp(-dt / 220);
    const hand = followAt && isHand(shape) ? HANDS[shape] : undefined;
    const still = reduced || !!hand;
    leanEuler.set(0, still ? 0 : 0.06 * Math.sin(now / 2600), 0);
    lean.setFromEuler(leanEuler);
    spinQ.setFromAxisAngle(up, spin);
    pose.slerp((hand && poses.get(shape)) || rest, reduced ? 1 : 1 - Math.exp(-dt / 220));
    group.quaternion.copy(lean).multiply(pose).multiply(spinQ);
    const scaleTarget = hand ? 0.5 : shape === "Question" ? 0.7 : 1;
    group.scale.setScalar(reduced ? scaleTarget : group.scale.x + (scaleTarget - group.scale.x) * (1 - Math.exp(-dt / 220)));

    const halfH = Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const halfW = boxH > 0 ? (boxW / boxH) * halfH : halfH;
    if (followAt && hand && boxH > 0) {
      anchor.set(-hand.centre[0], -hand.centre[1], -hand.centre[2]).applyQuaternion(group.quaternion).multiplyScalar(group.scale.x);
      target.set((followAt[0] / boxW) * 2 * halfW - halfW - anchor.x, halfH - (followAt[1] / boxH) * 2 * halfH - anchor.y, 0);
    } else {
      target.set(0, reduced ? 0 : 0.05 * Math.sin(now / 1500), 0);
    }

    if (reanchor && !reduced && (!isHand(shape) || hand)) {
      // Re-express the voxels in the new frame so the switch of scale/anchor does not jump.
      reanchor = false;
      const k = group.scale.x / scaleTarget;
      inv.copy(group.quaternion).invert();
      shift.copy(group.position).sub(target).applyQuaternion(inv).divideScalar(scaleTarget);
      const remap = (arr: Float32Array, n: number) => {
        for (let i = 0; i < n; i++) {
          const b = 6 * i;
          for (let a = 0; a < 3; a++) {
            const c = (arr[b + a] + arr[b + 3 + a]) / 2;
            const half = ((arr[b + 3 + a] - arr[b + a]) / 2) * k;
            const nc = k * c + shift.getComponent(a);
            arr[b + a] = nc - half;
            arr[b + 3 + a] = nc + half;
          }
        }
      };
      remap(cur, count);
      if (morphing) remap(from, morphN);
      group.position.copy(target);
      group.scale.setScalar(scaleTarget);
    } else if (reanchor && reduced) {
      reanchor = false;
    }
    if (reduced) group.position.copy(target);
    else group.position.lerp(target, 1 - Math.exp(-dt / (hand ? 70 : 260)));

    const touchSpec = hand?.touch;
    if (followAt && touchSpec && hand && boxH > 0) {
      touchV
        .set(touchSpec[0] - hand.centre[0], touchSpec[1] - hand.centre[1], touchSpec[2] - hand.centre[2])
        .applyQuaternion(group.quaternion)
        .multiplyScalar(group.scale.x)
        .add(group.position);
      const persp = camera.position.z / (camera.position.z - touchV.z);
      touchAt = [((touchV.x * persp + halfW) / (2 * halfW)) * boxW, ((halfH - touchV.y * persp) / (2 * halfH)) * boxH];
    } else touchAt = null;

    const pr = renderer.getPixelRatio();
    clipUniforms.uClipN.value = Math.min(3, clipRects.length);
    clipUniforms.uClipR.value = clipRadius * pr;
    for (let i = 0; i < clipUniforms.uClipN.value; i++) {
      const [x, y, w, h] = clipRects[i];
      clipUniforms.uClip.value[i].set(x * pr, (cssH - y - h) * pr, w * pr, h * pr);
    }

    appearNow = reduced ? appearTarget : appearNow + (appearTarget - appearNow) * (1 - Math.exp(-dt / 140));
    if (Math.abs(appearTarget - appearNow) < 0.001) appearNow = appearTarget;
    dissolveNow = reduced ? Number(dissolveOn) : Math.min(1, Math.max(0, dissolveNow + (dissolveOn ? dt : -dt) / 750));
    const gone = dissolveNow >= 1;
    if (gone !== dissolved) {
      dissolved = gone;
      onDissolved?.(gone);
    }
    writeInstances();
    renderer.render(scene, camera);
  };

  return {
    show(name) {
      requested = name;
    },
    appear(v) {
      appearTarget = Math.min(1, Math.max(0, v));
    },
    dissolve(on) {
      dissolveOn = on;
    },
    follow(x, y = 0) {
      followAt = x === null ? null : [x, y];
    },
    touch: () => touchAt,
    clip(rects, radius) {
      clipRects = rects;
      clipRadius = radius;
    },
    run(on) {
      if (on && !raf) {
        last = 0;
        measure();
        raf = requestAnimationFrame(frame);
      } else if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      resizer.disconnect();
      geometry.dispose();
      mesh.dispose();
      material.dispose();
      envMap.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
