import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/**
 * The services voxel object, ported from odama.io's `createServiceScene`.
 *
 * Every shape (the four service icons from service-icons.glb, a "Device" built from SDFs, a waving
 * and a pointing hand) is voxelised on a 1/24 grid and grouped into an octree-like hierarchy of
 * boxes. One InstancedMesh of rounded boxes then either *builds* a shape level by level (a box that
 * splits into ever smaller boxes) or *morphs* between two shapes (boxes sorted along a Morton curve,
 * split or merged to match counts, and flown across with a staggered, bulging path).
 */

const VOX = 1 / 24;
const ICONS = ["UI", "Branding", "Graphic", "Website"] as const;
const LEVEL_MS = [520, 230, 230, 250, 270, 300, 360];
const DEPTH = Math.ceil(Math.log2(48));
const SDF_GRID: Vec3 = [56, 60, 24];

type Vec3 = [number, number, number];
type Sdf = (x: number, y: number, z: number) => number;
type Pred = (x: number, y: number, z: number) => boolean;

interface Level {
  box: Float32Array;
  from: Float32Array;
  parent: Int32Array;
  delay: Float32Array;
  n: number;
}
interface Shape {
  levels: Level[];
}

// ---------- SDF primitives (same constants as the source) ----------

const capsule =
  (a: Vec3, b: Vec3, r: number): Sdf =>
  (x, y, z) => {
    const p = [x - a[0], y - a[1], z - a[2]];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const h = Math.min(1, Math.max(0, (p[0] * d[0] + p[1] * d[1] + p[2] * d[2]) / (d[0] ** 2 + d[1] ** 2 + d[2] ** 2)));
    return Math.hypot(p[0] - d[0] * h, p[1] - d[1] * h, p[2] - d[2] * h) - r;
  };

const roundBox =
  (c: Vec3, half: Vec3, r: number): Sdf =>
  (x, y, z) => {
    const q = [Math.abs(x - c[0]) - half[0] + r, Math.abs(y - c[1]) - half[1] + r, Math.abs(z - c[2]) - half[2] + r];
    return Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0)) + Math.min(Math.max(q[0], q[1], q[2]), 0) - r;
  };

const smoothUnion =
  (k: number, ...fs: Sdf[]): Sdf =>
  (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) {
      const e = fs[i](x, y, z);
      const h = Math.max(k - Math.abs(d - e), 0) / k;
      d = Math.min(d, e) - h * h * k * 0.25;
    }
    return d;
  };

const union =
  (...fs: Sdf[]): Sdf =>
  (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < fs.length; i++) d = Math.min(d, fs[i](x, y, z));
    return d;
  };

const subtract =
  (base: Sdf, ...cuts: Sdf[]): Sdf =>
  (x, y, z) => {
    let d = base(x, y, z);
    for (const c of cuts) d = Math.max(d, -c(x, y, z));
    return d;
  };

const chamferBox =
  (c: Vec3, half: Vec3, ch: number): Sdf =>
  (x, y, z) => {
    const ax = Math.abs(x - c[0]);
    const ay = Math.abs(y - c[1]);
    return Math.max(ax - half[0], ay - half[1], Math.abs(z - c[2]) - half[2], (ax + ay - (half[0] + half[1] - ch)) * Math.SQRT1_2);
  };

const scaled =
  (s: number, f: Sdf): Sdf =>
  (x, y, z) =>
    f(x / s, y / s, z / s) * s;

const WAVE = smoothUnion(
  0.06,
  roundBox([0, -0.05, 0], [0.36, 0.38, 0.13], 0.11),
  capsule([-0.27, 0.28, 0], [-0.37, 0.98, 0.01], 0.095),
  capsule([-0.09, 0.31, 0], [-0.1, 1.1, 0.01], 0.1),
  capsule([0.1, 0.3, 0], [0.16, 1, 0.01], 0.095),
  capsule([0.27, 0.24, 0], [0.42, 0.78, 0.01], 0.08),
  capsule([-0.3, -0.22, 0.05], [-0.72, 0.2, 0.09], 0.11),
  roundBox([0, -0.72, 0], [0.26, 0.32, 0.12], 0.11),
);

const POINT = smoothUnion(
  0.06,
  roundBox([-0.08, -0.04, 0], [0.32, 0.46, 0.28], 0.16),
  capsule([0.12, 0.3, 0.02], [0.98, 0.33, 0.02], 0.115),
  capsule([0.1, 0.05, 0.07], [0.32, 0.05, 0.07], 0.115),
  capsule([0.08, -0.19, 0.07], [0.3, -0.19, 0.07], 0.11),
  capsule([0.04, -0.42, 0.06], [0.24, -0.42, 0.06], 0.1),
  capsule([-0.24, 0.14, 0.3], [0.2, -0.02, 0.34], 0.1),
  roundBox([-0.6, -0.08, 0], [0.22, 0.32, 0.21], 0.12),
);

const QUESTION = (() => {
  const c: Vec3 = [0, 0.38, 0];
  const dot: Vec3 = [0.02, -0.72, 0];
  const hook: Sdf = (x, y, z) => {
    const ox = x - c[0];
    const oy = y - c[1];
    const a = Math.atan2(oy, ox);
    if (a >= -0.87 && a <= 2.8) return Math.hypot(Math.hypot(ox, oy) - 0.4, z - c[2]) - 0.12;
    const end = (t: number) => Math.hypot(x - c[0] - 0.4 * Math.cos(t), y - c[1] - 0.4 * Math.sin(t), z - c[2]);
    return Math.min(end(-0.87), end(2.8)) - 0.12;
  };
  return smoothUnion(
    0.05,
    hook,
    capsule([0.257, 0.074, 0], [0.02, -0.14, 0], 0.12),
    capsule([0.02, -0.14, 0], [0.02, -0.36, 0], 0.12),
    (x, y, z) => Math.hypot(x - dot[0], y - dot[1], z - dot[2]) - 0.15,
  );
})();

const DEVICE = union(
  subtract(
    union(
      chamferBox([0, -0.21, 0], [0.68, 0.63, 0.162], 0.06),
      chamferBox([0, 0.58, 0], [0.54, 0.26, 0.12], 0.03),
      ...[0.78, 0.68, 0.58, 0.48].flatMap((y) => [
        chamferBox([-0.6, y, 0], [0.08, 0.026, 0.12 - 0.042], 0),
        chamferBox([0.6, y, 0], [0.08, 0.026, 0.12 - 0.042], 0),
      ]),
      chamferBox([0.06, 0.04, -0.15], [0.68, 0.84, 0.06], 0.04),
    ),
    chamferBox([0, 0.66, 0.12], [0.43, 0.13, 0.084], 0.09),
    chamferBox([0, -0.11, 0.162], [0.56, 0.48, 0.084], 0.08),
    (x, y, z) => Math.max(Math.abs(x) - ((y - -0.8) / (-0.64 - -0.8)) * 0.15, y - -0.64, -0.8 - y, Math.abs(z - 0.162) - 0.084),
  ),
  chamferBox([0, -0.11, 0], [0.48, 0.4, 0.12], 0.06),
);

const SDF_SHAPES: Record<string, Sdf> = {
  Wave: WAVE,
  Point: POINT,
  PointDown: (x, y, z) => POINT(-y, x, z),
  Device: scaled(0.95, DEVICE),
  Question: QUESTION,
};

/** Voxelise an SDF and keep only the shell (cells with at least one empty neighbour). */
function shellOf(sdf: Sdf, step: number, grid: Vec3 = SDF_GRID): Pred {
  const [nx, ny, nz] = grid;
  const solid = new Uint8Array(nx * ny * nz);
  const at = (x: number, y: number, z: number) => (z * ny + y) * nx + x;
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++)
        if (sdf((x + 0.5 - nx / 2) * step, (y + 0.5 - ny / 2) * step, (z + 0.5 - nz / 2) * step) < 0) solid[at(x, y, z)] = 1;
  const has = (x: number, y: number, z: number) => x >= 0 && y >= 0 && z >= 0 && x < nx && y < ny && z < nz && solid[at(x, y, z)] === 1;
  return (x, y, z) =>
    has(x, y, z) &&
    !(has(x - 1, y, z) && has(x + 1, y, z) && has(x, y - 1, z) && has(x, y + 1, z) && has(x, y, z - 1) && has(x, y, z + 1));
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t: number) => 1 + 2.3 * Math.pow(t - 1, 3) + 1.3 * Math.pow(t - 1, 2);
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

interface Node {
  key: Vec3;
  lo: Vec3;
  hi: Vec3;
  parent: number;
}

/** Build the box hierarchy for a voxel predicate: level DEPTH = voxels, level 0 = one box. */
function buildShape(pred: Pred, nx: number, ny: number, nz: number, step = VOX): Shape | null {
  let nodes: Node[] = [];
  for (let y = 0; y < ny; y++)
    for (let x = 0; x < nx; x++)
      for (let z = 0; z < nz; z++)
        if (pred(x, y, z)) nodes.push({ key: [x, y, z], lo: [x, y, z], hi: [x + 1, y + 1, z + 1], parent: -1 });
  if (!nodes.length) return null;
  const tiers: Node[][] = [];
  tiers[DEPTH] = nodes;
  for (let lvl = DEPTH - 1; lvl >= 0; lvl--) {
    const index = new Map<string, number>();
    const up: Node[] = [];
    for (const nd of nodes) {
      const key: Vec3 = [nd.key[0] >> 1, nd.key[1] >> 1, nd.key[2] >> 1];
      const k = key.join();
      let at = index.get(k);
      if (at === undefined) {
        at = up.length;
        index.set(k, at);
        up.push({ key, lo: [...nd.lo] as Vec3, hi: [...nd.hi] as Vec3, parent: -1 });
      } else {
        const p = up[at];
        for (let a = 0; a < 3; a++) {
          p.lo[a] = Math.min(p.lo[a], nd.lo[a]);
          p.hi[a] = Math.max(p.hi[a], nd.hi[a]);
        }
      }
      nd.parent = at;
    }
    tiers[lvl] = up;
    nodes = up;
  }
  const origin: Vec3 = [-(nx * step) / 2, -(ny * step) / 2, -(nz * step) / 2];
  const boxes = tiers.map((tier, lvl) =>
    tier.map((nd) => {
      const b = new Float32Array(6);
      for (let a = 0; a < 3; a++) {
        b[a] = origin[a] + nd.lo[a] * step;
        b[3 + a] = origin[a] + nd.hi[a] * step;
      }
      if (lvl < DEPTH) {
        const m = Math.min(b[3] - b[0], b[4] - b[1]);
        const half = Math.max((b[5] - b[2]) / 2, m / 2);
        const mid = (b[2] + b[5]) / 2;
        b[2] = mid - half;
        b[5] = mid + half;
      }
      return b;
    }),
  );
  return {
    levels: tiers.map((tier, lvl) => {
      const n = tier.length;
      const box = new Float32Array(6 * n);
      const from = new Float32Array(6 * n);
      const parent = new Int32Array(n);
      const delay = new Float32Array(n);
      const cellSize = 1 << (DEPTH - lvl);
      tier.forEach((nd, i) => {
        parent[i] = nd.parent;
        const b = boxes[lvl][i];
        box.set(b, 6 * i);
        if (lvl > 0) {
          const pb = boxes[lvl - 1][nd.parent];
          for (let a = 0; a < 2; a++) {
            from[6 * i + a] = Math.max(pb[a], origin[a] + nd.key[a] * cellSize * step);
            from[6 * i + 3 + a] = Math.min(pb[3 + a], origin[a] + (nd.key[a] + 1) * cellSize * step);
          }
          from[6 * i + 2] = pb[2];
          from[6 * i + 5] = pb[5];
        } else {
          from.set(b, 6 * i);
        }
        const yMid = (nd.lo[1] + nd.hi[1]) / 2 / ny;
        delay[i] = 0.35 * (1 - yMid) + 0.65 * Math.random();
      });
      return { box, from, parent, delay, n };
    }),
  };
}

const SURFACE_GLSL = /* glsl */ `
varying vec3 vSurfPos;
uniform vec4 uSurf;
uniform vec3 uSurfStretch;
vec3 surfHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return -1.0 + 2.0 * fract((p.xxy + p.yxx) * p.zyx);
}
vec4 surfNoiseD(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  vec3 du = 6.0 * f * (1.0 - f);
  vec3 ga = surfHash(i + vec3(0.0, 0.0, 0.0));
  vec3 gb = surfHash(i + vec3(1.0, 0.0, 0.0));
  vec3 gc = surfHash(i + vec3(0.0, 1.0, 0.0));
  vec3 gd = surfHash(i + vec3(1.0, 1.0, 0.0));
  vec3 ge = surfHash(i + vec3(0.0, 0.0, 1.0));
  vec3 gf = surfHash(i + vec3(1.0, 0.0, 1.0));
  vec3 gg = surfHash(i + vec3(0.0, 1.0, 1.0));
  vec3 gh = surfHash(i + vec3(1.0, 1.0, 1.0));
  float va = dot(ga, f - vec3(0.0, 0.0, 0.0));
  float vb = dot(gb, f - vec3(1.0, 0.0, 0.0));
  float vc = dot(gc, f - vec3(0.0, 1.0, 0.0));
  float vd = dot(gd, f - vec3(1.0, 1.0, 0.0));
  float ve = dot(ge, f - vec3(0.0, 0.0, 1.0));
  float vf = dot(gf, f - vec3(1.0, 0.0, 1.0));
  float vg = dot(gg, f - vec3(0.0, 1.0, 1.0));
  float vh = dot(gh, f - vec3(1.0, 1.0, 1.0));
  float k1 = va - vb - vc + vd;
  float k2 = va - vc - ve + vg;
  float k3 = va - vb - ve + vf;
  float k4 = -va + vb + vc - vd + ve - vf - vg + vh;
  float v = va + u.x * (vb - va) + u.y * (vc - va) + u.z * (ve - va)
          + u.x * u.y * k1 + u.y * u.z * k2 + u.z * u.x * k3
          + u.x * u.y * u.z * k4;
  vec3 g = ga + u.x * (gb - ga) + u.y * (gc - ga) + u.z * (ge - ga)
         + u.x * u.y * (ga - gb - gc + gd) + u.y * u.z * (ga - gc - ge + gg)
         + u.z * u.x * (ga - gb - ge + gf)
         + u.x * u.y * u.z * (-ga + gb + gc - gd + ge - gf - gg + gh)
         + du * (vec3(vb - va, vc - va, ve - va)
                 + u.yzx * vec3(k1, k2, k3)
                 + u.zxy * vec3(k3, k1, k2)
                 + u.yzx * u.zxy * k4);
  return vec4(v, g);
}
vec4 surfHeightD(vec3 p) {
  vec4 a = surfNoiseD(p);
  vec4 b = surfNoiseD(p * 2.3 + 17.0);
  return vec4(a.x + 0.45 * b.x, a.yzw + (0.45 * 2.3) * b.yzw);
}
varying float vUnderT;
varying float vShadeT;
uniform vec3 uUnderNear;
uniform vec3 uUnderFar;
uniform float uUnderGlow;
uniform float uShadeLow;
`;

/** Fine stipple relief + the warm "under-glow" on downward faces + a soft top-lit falloff. */
function dressMaterial(mat: THREE.Material) {
  const shade = new THREE.Vector3(-0.55, 1, 0.25).normalize();
  mat.customProgramCacheKey = () => "odama-voxel-surface";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSurf = { value: new THREE.Vector4(90, 0.0022, 0, 0.06) };
    shader.uniforms.uSurfStretch = { value: new THREE.Vector3(1, 1, 1) };
    shader.uniforms.uUnderNear = { value: new THREE.Color(0xc94a4a) };
    shader.uniforms.uUnderFar = { value: new THREE.Color(0x2a0e0e) };
    shader.uniforms.uUnderGlow = { value: 0.45 };
    shader.uniforms.uShade = { value: new THREE.Vector4(shade.x, shade.y, shade.z, 2.2) };
    shader.uniforms.uShadeLow = { value: 0.1 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSurfPos;\nvarying float vUnderT;\nvarying float vShadeT;\nuniform vec4 uShade;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vSurfPos = (instanceMatrix * vec4(position, 1.0)).xyz;
          mat3 uM = mat3(modelMatrix) * mat3(instanceMatrix);
          vec4 uW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vSurfPos = position;
          mat3 uM = mat3(modelMatrix);
          vec4 uW = modelMatrix * vec4(transformed, 1.0);
        #endif
        {
          float uOff = (uM * position).z;
          float uExt = 0.5 * (abs(uM[0].z) + abs(uM[1].z) + abs(uM[2].z));
          vUnderT = clamp(0.5 + 0.5 * uOff / max(uExt, 1e-4), 0.0, 1.0);
          vShadeT = clamp(0.5 + dot(uW.xyz, uShade.xyz) / uShade.w, 0.0, 1.0);
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${SURFACE_GLSL}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec3 sP = vSurfPos * uSurfStretch * uSurf.x;
        vec3 sDx = dFdx(sP);
        vec3 sDy = dFdy(sP);
        float sFoot = max(length(sDx), length(sDy));
        float sFade = 1.0 - smoothstep(0.3, 0.8, sFoot);
        float sH0 = 0.0;
        vec3 sG = vec3(0.0);
        if (sFade > 0.0) {
          vec4 sHD = surfHeightD(sP);
          sH0 = sHD.x;
          sG = sHD.yzw;
        }
        diffuseColor.rgb *= mix(uShadeLow, 1.0, smoothstep(0.0, 1.0, vShadeT));`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + uSurf.w * mix(0.5, 0.5 + 0.5 * sH0, sFade), 0.0, 1.0);`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        if (sFade > 0.0) {
          vec3 vSx = dFdx(-vViewPosition);
          vec3 vSy = dFdy(-vViewPosition);
          vec3 R1 = cross(vSy, normal);
          vec3 R2 = cross(normal, vSx);
          float det = dot(vSx, R1) * faceDirection;
          float k = uSurf.y * sFade;
          float dHx = k * dot(sG, sDx);
          float dHy = k * dot(sG, sDy);
          vec3 grad = sign(det) * (dHx * R1 + dHy * R2);
          normal = normalize(abs(det) * normal - grad);
        }`,
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
  mat.needsUpdate = true;
}

export interface ServiceScene {
  show(name: string | null): void;
  lean(x: number, y: number): void;
  run(on: boolean): void;
  destroy(): void;
}

export interface ServiceSceneOptions {
  reduced?: boolean;
  maxDpr?: number;
  greeting?: boolean;
  start?: string | null;
  glbUrl: string;
  /** Called for each build step so the caller can bail out if it unmounted meanwhile. */
  cancelled?: () => boolean;
}

export async function createServiceScene(
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
  { reduced = false, maxDpr = 2, greeting = true, start = null, glbUrl, cancelled = () => false }: ServiceSceneOptions,
): Promise<ServiceScene | null> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const bail = () => {
    renderer.dispose();
    renderer.forceContextLoss();
    return null;
  };
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  await nextFrame();
  if (cancelled()) return bail();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const envTex = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.35;
  pmrem.dispose();
  const lights: Array<{ color: number; intensity: number; position: Vec3 }> = [
    { color: 0xffffff, intensity: 5.6, position: [-1.4, 7, -1.4] },
    { color: 0x7fa8ff, intensity: 1.1, position: [6, 0.5, 2] },
    { color: 0xffffff, intensity: 2.8, position: [-3, 2, -6] },
  ];
  for (const l of lights) {
    const d = new THREE.DirectionalLight(l.color, l.intensity);
    d.position.set(...l.position);
    scene.add(d);
  }
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  camera.position.set(0, 0, 5.6);
  const root = new THREE.Group();
  scene.add(root);

  const buf = await fetch(glbUrl).then((r) => {
    if (!r.ok) throw new Error(`${glbUrl}: ${r.status}`);
    return r.arrayBuffer();
  });
  if (cancelled()) return bail();
  const gltf = await new GLTFLoader().parseAsync(buf, "");
  gltf.scene.updateMatrixWorld(true);

  // Silhouettes of the GLB meshes are rendered orthographically at 4x and read back as a mask.
  const rt = new THREE.WebGLRenderTarget(1, 1);
  const flat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
  const flatScene = new THREE.Scene();
  let baseMaterial: THREE.Material | null = null;

  const voxeliseMesh = async (name: string): Promise<Shape | null> => {
    const obj = gltf.scene.getObjectByName(name);
    const found: THREE.Mesh[] = [];
    obj?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) found.push(o as THREE.Mesh);
    });
    const m = found[0];
    if (!m) return null;
    if (!baseMaterial) {
      const src = Array.isArray(m.material) ? m.material[0] : m.material;
      baseMaterial = src.clone();
    }
    const geo = m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    geo.computeBoundingBox();
    const bb0 = geo.boundingBox!;
    const center = bb0.getCenter(new THREE.Vector3());
    const size = bb0.getSize(new THREE.Vector3());
    const s = 2 / Math.max(size.x, size.y);
    geo.translate(-center.x, -center.y, -center.z);
    geo.scale(s, s, s);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const cx = Math.max(1, Math.ceil((bb.max.x - bb.min.x) / VOX - 1e-6));
    const cy = Math.max(1, Math.ceil((bb.max.y - bb.min.y) / VOX - 1e-6));
    const cz = Math.max(1, Math.round((bb.max.z - bb.min.z) / VOX));
    const left = -(VOX * cx) / 2;
    const bottom = -(VOX * cy) / 2;
    rt.setSize(4 * cx, 4 * cy);
    ortho.left = left;
    ortho.right = left + VOX * cx;
    ortho.bottom = bottom;
    ortho.top = bottom + VOX * cy;
    ortho.position.set(0, 0, 10);
    ortho.updateProjectionMatrix();
    const fm = new THREE.Mesh(geo, flat);
    flatScene.add(fm);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0, 1);
    renderer.clear();
    renderer.render(flatScene, ortho);
    renderer.setRenderTarget(null);
    renderer.setClearColor(0, 0);
    flatScene.remove(fm);
    const px = new Uint8Array(4 * cx * cy * 16);
    try {
      await renderer.readRenderTargetPixelsAsync(rt, 0, 0, 4 * cx, 4 * cy, px);
    } catch {
      renderer.readRenderTargetPixels(rt, 0, 0, 4 * cx, 4 * cy, px);
    }
    geo.dispose();
    const mask = new Uint8Array(cx * cy);
    for (let y = 0; y < cy; y++)
      for (let x = 0; x < cx; x++) {
        let hits = 0;
        for (let sy = 0; sy < 4; sy++)
          for (let sx = 0; sx < 4; sx++) if (px[((4 * y + sy) * cx * 4 + 4 * x + sx) * 4] > 127) hits++;
        if (hits >= 6) mask[y * cx + x] = 1;
      }
    return buildShape((x, y) => mask[y * cx + x] === 1, cx, cy, cz);
  };

  const shapes = new Map<string, Shape>();
  for (const name of ICONS) {
    await nextFrame();
    if (cancelled()) return bail();
    const sh = await voxeliseMesh(name);
    if (sh) shapes.set(name, sh);
  }
  await nextFrame();
  {
    const n = Math.max(1, Math.round(1.05 / VOX));
    const edge = (v: number) => v === 0 || v === n - 1;
    const cube = buildShape((x, y, z) => edge(x) || edge(y) || edge(z), n, n, n);
    if (cube) shapes.set("Cube", cube);
  }
  for (const [name, sdf] of Object.entries(SDF_SHAPES)) {
    await nextFrame();
    if (cancelled()) return bail();
    const sh = buildShape(shellOf(sdf, VOX), SDF_GRID[0], SDF_GRID[1], SDF_GRID[2]);
    if (sh) shapes.set(name, sh);
  }
  rt.dispose();
  flat.dispose();
  if (!baseMaterial || !shapes.size) {
    bail();
    throw new Error("service icons: nothing to show");
  }
  const material: THREE.Material = baseMaterial;
  dressMaterial(material);

  const maxN = Math.max(...[...shapes.values()].map((s) => s.levels[DEPTH].n));
  const geometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.07);
  const mesh = new THREE.InstancedMesh(geometry, material, maxN);
  mesh.frustumCulled = false;
  mesh.count = 1;
  const pivot = new THREE.Group();
  pivot.position.y = -0.42;
  mesh.position.y = 0.42;
  pivot.add(mesh);
  root.add(pivot);

  const UNIT = new Float32Array([-0.525, -0.525, -0.525, 0.525, 0.525, 0.525]);
  let want: string | null = null; // requested by show()
  let greet: string | null = null; // greeting override (Wave / Point)
  let cur: string | null = null; // the shape currently built
  let build = 1; // build progress: 0..1 the root box, then one unit per level
  const startBox = new Float32Array(UNIT);
  let fromCube = true;
  const rootBox = () => (cur ? shapes.get(cur)!.levels[0].box : UNIT);
  if (start && shapes.has(start)) {
    want = cur = start;
    build = DEPTH + 1;
  }

  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const tmpBox = new Float32Array(6);
  const lerpBox = (t: number, out: Float32Array) => {
    const a = easeInOutCubic(Math.min(1, Math.max(0, t)));
    const r = rootBox();
    for (let i = 0; i < 6; i++) out[i] = startBox[i] + (r[i] - startBox[i]) * a;
    return out;
  };

  const boxes = new Float32Array(6 * maxN);
  let active = 1;
  let gap = 0;
  boxes.set(UNIT);

  const layoutBuild = () => {
    if (build <= 1 || !cur) {
      lerpBox(build, tmpBox);
      const e = easeInOutCubic(Math.min(1, Math.max(0, build)));
      const split = cur ? (fromCube ? 1 - e : 0) : fromCube ? 1 : e;
      if (split > 0) {
        const mid = [(tmpBox[0] + tmpBox[3]) / 2, (tmpBox[1] + tmpBox[4]) / 2, (tmpBox[2] + tmpBox[5]) / 2];
        for (let c = 0; c < 8; c++)
          for (let a = 0; a < 3; a++) {
            const hi = (c >> a) & 1;
            boxes[6 * c + a] = hi ? mid[a] : tmpBox[a];
            boxes[6 * c + 3 + a] = hi ? tmpBox[3 + a] : mid[a];
          }
        active = 8;
        gap = 0.03 * split;
        return;
      }
      boxes.set(tmpBox);
      active = 1;
      gap = cur && cur !== "Cube" ? 0.04 * e : 0;
      return;
    }
    const levels = shapes.get(cur)!.levels;
    const t = build - 1;
    const lvl = Math.min(DEPTH - 1, Math.floor(t));
    const f = t - lvl;
    const L = levels[lvl + 1];
    for (let i = 0; i < L.n; i++) {
      const p = Math.min(1, Math.max(0, (f - 0.5 * L.delay[i]) / 0.5));
      const a = p <= 0 ? 0 : p >= 1 ? 1 : easeOutBack(p);
      for (let k = 0; k < 6; k++) {
        const from = L.from[6 * i + k];
        boxes[6 * i + k] = from + (L.box[6 * i + k] - from) * a;
      }
    }
    active = L.n;
    gap = 0.04;
  };

  // ---------- shape-to-shape morph ----------
  const mSrc = new Float32Array(6 * maxN);
  const mDst = new Float32Array(6 * maxN);
  const mDelay = new Float32Array(maxN);
  const mBulge = new Float32Array(maxN);
  const mVel = new Float32Array(3 * maxN);
  const mCarry = new Float32Array(3 * maxN);
  let spread = 0.45;
  let mCount = 0;
  let mT = 0;
  let morphing = false;
  let morphTo: string | null = null;
  let spin = 0;

  const part = (v: number) => {
    v &= 1023;
    v = (v | (v << 16)) & 0x30000ff;
    v = (v | (v << 8)) & 0x300f00f;
    v = (v | (v << 4)) & 0x30c30c3;
    v = (v | (v << 2)) & 0x9249249;
    return v;
  };
  const mortonOrder = (b: Float32Array, n: number) => {
    const q10 = (v: number) => Math.round(1023 * Math.min(1, Math.max(0, (v + 2) / 4)));
    const code = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = q10((b[6 * i] + b[6 * i + 3]) / 2);
      const y = q10((b[6 * i + 1] + b[6 * i + 4]) / 2);
      const z = q10((b[6 * i + 2] + b[6 * i + 5]) / 2);
      code[i] = (part(x) | (part(y) << 1) | (part(z) << 2)) >>> 0;
    }
    return Array.from({ length: n }, (_, i) => i).sort((a, b2) => code[a] - code[b2]);
  };
  const splitBox = (src: Float32Array, idx: number, count: number, out: Float32Array, at: number) => {
    const o = 6 * idx;
    if (count === 1) {
      out.set(src.subarray(o, o + 6), 6 * at);
      return;
    }
    const size = [src[o + 3] - src[o], src[o + 4] - src[o + 1], src[o + 5] - src[o + 2]];
    const cell = Math.cbrt(Math.max(1e-9, size[0] * size[1] * size[2]) / count);
    const div = size.map((s) => Math.max(1, Math.round(s / cell)));
    while (div[0] * div[1] * div[2] < count) {
      const ax = [0, 1, 2].reduce((m, a) => (size[a] / div[a] > size[m] / div[m] ? a : m), 0);
      div[ax]++;
    }
    const total = div[0] * div[1] * div[2];
    for (let k = 0; k < count; k++) {
      const c0 = Math.floor((k * total) / count);
      const c1 = Math.floor(((k + 1) * total) / count) - 1;
      const lo = [Infinity, Infinity, Infinity];
      const hi = [-Infinity, -Infinity, -Infinity];
      for (let c = c0; c <= c1; c++) {
        const g = [c % div[0], Math.floor(c / div[0]) % div[1], Math.floor(c / (div[0] * div[1]))];
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a], src[o + a] + (g[a] * size[a]) / div[a]);
          hi[a] = Math.max(hi[a], src[o + a] + ((g[a] + 1) * size[a]) / div[a]);
        }
      }
      const d = (at + k) * 6;
      out[d] = lo[0];
      out[d + 1] = lo[1];
      out[d + 2] = lo[2];
      out[d + 3] = hi[0];
      out[d + 4] = hi[1];
      out[d + 5] = hi[2];
    }
  };

  const snapSpin = () => {
    spin -= (Math.PI / 2) * Math.round(spin / (Math.PI / 2));
  };

  const beginMorph = (target: string | null) => {
    const L = target ? shapes.get(target)!.levels[DEPTH] : null;
    const dst = L ? L.box : UNIT;
    const n = L ? L.n : 1;
    const o = active;
    const srcOrder = mortonOrder(boxes, o);
    const dstOrder = mortonOrder(dst, n);
    mCount = Math.max(o, n);
    const grow = n >= o;
    const carry = (i: number, from: number) => {
      for (let a = 0; a < 3; a++) mCarry[3 * i + a] = morphing ? mVel[3 * from + a] : 0;
    };
    spread = morphing ? 0.12 : 0.45;
    for (let e = 0; e < mCount; ) {
      const pick = (k: number) => (grow ? srcOrder[Math.floor((k * o) / mCount)] : dstOrder[Math.floor((k * n) / mCount)]);
      const u = pick(e);
      let c = e + 1;
      while (c < mCount && pick(c) === u) c++;
      if (grow) splitBox(boxes, u, c - e, mSrc, e);
      else splitBox(dst, u, c - e, mDst, e);
      for (let k = e; k < c; k++) {
        if (grow) {
          const di = dstOrder[Math.floor((k * n) / mCount)];
          mDst.set(dst.subarray(6 * di, 6 * di + 6), 6 * k);
          carry(k, u);
        } else {
          const si = srcOrder[Math.floor((k * o) / mCount)];
          mSrc.set(boxes.subarray(6 * si, 6 * si + 6), 6 * k);
          carry(k, si);
        }
        mDelay[k] = Math.random();
        mBulge[k] = 0.6 + 0.8 * Math.random();
      }
      e = c;
    }
    if (!morphing && !cur) snapSpin();
    morphTo = target;
    mT = 0;
    morphing = true;
  };

  const stepMorph = (dt: number) => {
    const prev = mT === 0 ? mSrc : boxes;
    const span = Math.max(1, dt);
    mT = Math.min(1, mT + dt / 1100);
    const fling = 180 * (1 - Math.exp(-(1100 * mT) / 180));
    for (let e = 0; e < mCount; e++) {
      const o = easeInOutCubic(Math.min(1, Math.max(0, (mT - mDelay[e] * spread) / (1 - spread))));
      const r = 6 * e;
      const px = prev[r] + prev[r + 3];
      const py = prev[r + 1] + prev[r + 4];
      const pz = prev[r + 2] + prev[r + 5];
      for (let k = 0; k < 6; k++) boxes[r + k] = mSrc[r + k] + (mDst[r + k] - mSrc[r + k]) * o + mCarry[3 * e + (k % 3)] * fling * (1 - o);
      const hx = (mDst[r] + mDst[r + 3] - mSrc[r] - mSrc[r + 3]) / 2;
      const hy = (mDst[r + 1] + mDst[r + 4] - mSrc[r + 1] - mSrc[r + 4]) / 2;
      const lift = 0.55 * Math.sin(Math.PI * o) * mBulge[e] * Math.min(1, Math.hypot(hx, hy) + 0.15);
      boxes[r + 2] += lift;
      boxes[r + 5] += lift;
      mVel[3 * e] = (boxes[r] + boxes[r + 3] - px) / 2 / span;
      mVel[3 * e + 1] = (boxes[r + 1] + boxes[r + 4] - py) / 2 / span;
      mVel[3 * e + 2] = (boxes[r + 2] + boxes[r + 5] - pz) / 2 / span;
    }
    active = mCount;
    gap = morphTo ? 0.04 : 0.04 * (1 - mT);
    if (mT >= 1) {
      morphing = false;
      cur = morphTo;
      if (cur) build = DEPTH + 1;
      else {
        build = 1;
        startBox.set(UNIT);
      }
    }
  };

  const beginBuild = (target: string | null) => {
    lerpBox(build, startBox);
    fromCube = !cur;
    if (!cur) snapSpin();
    cur = target;
    build = 0;
  };

  // ---------- sizing: the camera frames the stage, the canvas may be larger ----------
  let cw = 0;
  let ch = 0;
  let viewKey = "";
  const resize = () => {
    const c = canvas.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    if (!c.width || !c.height || !s.width || !s.height) return;
    if (c.width !== cw || c.height !== ch) {
      cw = c.width;
      ch = c.height;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
      renderer.setSize(cw, ch, false);
    }
    const key = [s.width, s.height, c.left - s.left, c.top - s.top, cw, ch].map(Math.round).join();
    if (key !== viewKey) {
      viewKey = key;
      camera.aspect = s.width / s.height;
      camera.setViewOffset(s.width, s.height, c.left - s.left, c.top - s.top, cw, ch);
      camera.updateProjectionMatrix();
    }
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  ro.observe(stage);
  resize();

  const basePose = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, -0.34, -0.1, "XYZ"));
  const pose = basePose.clone();
  const leanTarget = new THREE.Vector2();
  const leanNow = new THREE.Vector2();
  const leanQ = new THREE.Quaternion();
  const leanE = new THREE.Euler();
  const spinQ = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const bob = new THREE.Vector3();
  const mobile = window.matchMedia("(max-width: 767px)");

  let idle = 0;
  let greetPhase: "wave" | "point" | null = null;
  let greetT = 0;
  let greetFor: string | null = null;
  let raf = 0;
  let last = 0;

  const tick = (now: number) => {
    raf = requestAnimationFrame(tick);
    const dt = last ? Math.min(64, now - last) : 16.7;
    last = now;
    resize();

    if (greeting) {
      if (reduced || want !== greetFor) {
        greetFor = want;
        idle = 0;
        greetPhase = null;
        greet = null;
      } else if (greetPhase) {
        if (!morphing && cur === greet && build >= DEPTH + 1) {
          greetT += dt;
          if (greetPhase === "wave" && greetT >= 2600) {
            greetPhase = "point";
            greetT = 0;
            greet = mobile.matches ? "PointDown" : "Point";
          } else if (greetPhase === "point" && greetT >= 3200) {
            greetPhase = null;
            greet = null;
          }
        }
      } else {
        idle = !morphing && cur === want && build >= (cur ? DEPTH + 1 : 1) ? idle + dt : 0;
        if (idle >= 8000) {
          idle = 0;
          greetPhase = "wave";
          greetT = 0;
          greet = "Wave";
        }
      }
      const waving = greetPhase === "wave" && cur === "Wave" && !morphing;
      const env = waving ? Math.sin(Math.PI * Math.min(1, greetT / 2600)) : 0;
      const roll = waving ? 0.32 * Math.sin((greetT / 650) * Math.PI * 2) * Math.min(1, 2.5 * env) : 0;
      pivot.rotation.z += (roll - pivot.rotation.z) * (1 - Math.exp(-dt / 60));
      const poke = greetPhase === "point" && cur === greet && !morphing ? 0.09 * Math.max(0, Math.sin((greetT / 800) * Math.PI * 2)) : 0;
      const down = greet === "PointDown";
      const k = 1 - Math.exp(-dt / 50);
      pivot.position.x += ((down ? 0 : poke) - pivot.position.x) * k;
      pivot.position.y += (-0.42 - (down ? poke : 0) - pivot.position.y) * k;
    }

    const target = greet ?? want;
    if (reduced) {
      morphing = false;
      cur = want;
      startBox.set(rootBox());
      build = cur ? DEPTH + 1 : 1;
      layoutBuild();
    } else if (morphing) {
      const t = target ?? "Cube";
      if (t !== morphTo) beginMorph(t);
      stepMorph(dt);
    } else if (target !== cur) {
      if (target && cur) {
        beginMorph(target);
        stepMorph(dt);
      } else {
        if (target) beginBuild(target);
        else if (build > 1) build = Math.max(1, build - dt / 85);
        else beginBuild(null);
        layoutBuild();
      }
    } else {
      const full = cur ? DEPTH + 1 : 1;
      if (build < full) build = Math.min(full, build + dt / LEVEL_MS[Math.min(LEVEL_MS.length - 1, Math.floor(build))]);
      layoutBuild();
    }

    const shown = morphing ? morphTo : cur;
    const cubeLike = !shown || shown === "Cube";
    if (shown === "Device" && !morphing && !reduced) spin += (0.5 * Math.sin(now / 3200) - spin) * (1 - Math.exp(-dt / 400));
    else if (cubeLike) {
      if (!reduced) spin += 0.00045 * dt;
    } else spin *= Math.exp(-dt / 220);
    leanNow.lerp(leanTarget, 1 - Math.exp(-dt / 260));
    const sway = reduced ? 0 : Math.sin(now / 2600);
    leanE.set(0.16 * leanNow.y, 0.24 * leanNow.x + (reduced ? 0 : 0.06 * sway), 0);
    leanQ.setFromEuler(leanE);
    spinQ.setFromAxisAngle(up, spin);
    pose.slerp(basePose, reduced ? 1 : 1 - Math.exp(-dt / 220));
    root.quaternion.copy(leanQ).multiply(pose).multiply(spinQ);
    const sc = shown === "Question" ? 0.7 : 1;
    root.scale.setScalar(reduced ? sc : root.scale.x + (sc - root.scale.x) * (1 - Math.exp(-dt / 220)));
    bob.set(0, reduced ? 0 : 0.05 * Math.sin(now / 1500), 0);
    if (reduced) root.position.copy(bob);
    else root.position.lerp(bob, 1 - Math.exp(-dt / 260));

    for (let i = 0; i < active; i++) {
      const o = 6 * i;
      const sx = boxes[o + 3] - boxes[o];
      const sy = boxes[o + 4] - boxes[o + 1];
      const sz = boxes[o + 5] - boxes[o + 2];
      pos.set((boxes[o] + boxes[o + 3]) / 2, (boxes[o + 1] + boxes[o + 4]) / 2, (boxes[o + 2] + boxes[o + 5]) / 2);
      const g = Math.min(sx, sy, sz) * gap;
      scl.set(Math.max(1e-4, sx - g), Math.max(1e-4, sy - g), Math.max(1e-4, sz - g));
      mesh.setMatrixAt(i, mtx.compose(pos, q, scl));
    }
    mesh.count = active;
    mesh.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  };

  await renderer.compileAsync(scene, camera).catch(() => undefined);

  return {
    show(name) {
      want = name && shapes.has(name) ? name : null;
    },
    lean(x, y) {
      leanTarget.set(x, y);
    },
    run(on) {
      if (on && !raf) {
        last = 0;
        resize();
        raf = requestAnimationFrame(tick);
      } else if (!on && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      geometry.dispose();
      mesh.dispose();
      material.dispose();
      envTex.dispose();
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mm) => mm.dispose());
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
